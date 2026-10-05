/**
 * Экспорт всех моделей из кода (ModelKit) в GLB: public/assets/models/<id>.glb + manifest.json.
 * Запуск: npm run models. Материалы сохраняются по имени (игра подставляет общие из MaterialLibrary),
 * флаги теней, метки и коллайдеры — в extras (userData).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

// GLTFExporter в Node: нужен FileReader для бинарного вывода.
class NodeFileReader {
  result: ArrayBuffer | string | null = null;
  onloadend: (() => void) | null = null;
  readAsArrayBuffer(blob: Blob): void {
    void blob.arrayBuffer().then((buf) => {
      this.result = buf;
      this.onloadend?.();
    });
  }
  readAsDataURL(blob: Blob): void {
    void blob.arrayBuffer().then((buf) => {
      this.result = `data:${blob.type};base64,${Buffer.from(buf).toString('base64')}`;
      this.onloadend?.();
    });
  }
}
(globalThis as unknown as { FileReader: unknown }).FileReader = NodeFileReader;

const { NodeIO } = await import('@gltf-transform/core');
const { EXTMeshoptCompression } = await import('@gltf-transform/extensions');
const { dedup, weld, reorder, prune } = await import('@gltf-transform/functions');
const { MeshoptEncoder } = await import('meshoptimizer');
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions([EXTMeshoptCompression]).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });

/** Сжатие meshopt (фильтры без квантования: трансформации узлов не меняются — их анимирует игра). */
async function compress(glb: ArrayBuffer): Promise<Uint8Array> {
  const doc = await io.readBinary(new Uint8Array(glb));
  await doc.transform(dedup(), weld(), reorder({ encoder: MeshoptEncoder }), prune({ keepExtras: true, keepLeaves: true }));
  doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER });
  return io.writeBinary(doc);
}

const { allAssets } = await import('../src/art/registry');
await import('../src/art/models');

const OUT = join(process.cwd(), 'public', 'assets', 'models');
mkdirSync(OUT, { recursive: true });
const exporter = new GLTFExporter();
const manifest: Record<string, { file: string; tris: number; bytes: number }> = {};
let total = 0;
let count = 0;
const t0 = Date.now();
const origWarn = console.warn;
console.warn = (...a: unknown[]) => {
  if (String(a[0]).includes('normalized normal')) return;
  origWarn(...a);
};
for (const def of allAssets()) {
  if (def.runtimeOnly) continue;
  const obj = def.build();
  obj.name = def.id;
  obj.updateMatrixWorld(true);
  const raw = (await exporter.parseAsync(obj, { binary: true, onlyVisible: false })) as ArrayBuffer;
  const glb = await compress(raw);
  const file = `${def.id}.glb`;
  writeFileSync(join(OUT, file), glb);
  let tris = 0;
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) tris += (m.geometry.index ? m.geometry.index.count : m.geometry.getAttribute('position').count) / 3;
  });
  manifest[def.id] = { file, tris: Math.round(tris), bytes: glb.byteLength };
  total += glb.byteLength;
  count++;
}
writeFileSync(join(OUT, 'manifest.json'), JSON.stringify({ version: 1, generatedAt: new Date().toISOString(), assets: manifest }, null, 1));
console.log(`Экспортировано ${count} моделей, ${(total / 1024 / 1024).toFixed(2)} МБ за ${((Date.now() - t0) / 1000).toFixed(1)} с → public/assets/models`);
