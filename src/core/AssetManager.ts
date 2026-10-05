import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { getAssetDef, glbPath } from '../art/registry';
import type { MaterialLibrary } from '../art/MaterialLibrary';
import { singleGeometry } from '../art/ModelKit';

export type AssetSource = 'glb' | 'procedural';

/**
 * Загрузка и кэш моделей.
 *  - GLB через GLTFLoader (+ Meshopt), одна загрузка на id, дальше — клоны с общей геометрией;
 *  - материалы-заглушки заменяются общими из MaterialLibrary по имени;
 *  - фолбэк: если GLB не загрузился — строитель модели; если и его нет — серый бокс.
 */
export class AssetManager {
  private protos = new Map<string, THREE.Object3D>();
  private pending = new Map<string, Promise<THREE.Object3D>>();
  private singleGeos = new Map<string, THREE.BufferGeometry>();
  private loader: GLTFLoader;
  readonly failures: string[] = [];
  loadedFromGlb = 0;
  builtProcedurally = 0;
  /** Список экспортированных GLB (public/assets/models/manifest.json). null — не загружен. */
  private manifest: Set<string> | null = null;
  private manifestReady: Promise<void> | null = null;

  constructor(
    private readonly materials: MaterialLibrary,
    public source: AssetSource,
    private readonly baseUrl = import.meta.env?.BASE_URL ?? './',
  ) {
    this.loader = new GLTFLoader();
    this.loader.setMeshoptDecoder(MeshoptDecoder);
  }

  /** Прочитать манифест GLB; если его нет — все модели строятся процедурно. */
  private ensureManifest(): Promise<void> {
    if (this.source !== 'glb') return Promise.resolve();
    if (!this.manifestReady) {
      this.manifestReady = fetch(this.baseUrl + 'assets/models/manifest.json')
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((j: { assets: Record<string, unknown> }) => {
          this.manifest = new Set(Object.keys(j.assets));
        })
        .catch(() => {
          console.info('[AssetManager] манифест GLB не найден — модели строятся из кода');
          this.manifest = new Set();
        });
    }
    return this.manifestReady;
  }

  /** Загрузить набор ассетов с прогрессом (0..1). */
  async preload(ids: readonly string[], onProgress?: (p: number, id: string) => void): Promise<void> {
    await this.ensureManifest();
    let done = 0;
    const unique = [...new Set(ids)];
    // Ограничиваем параллелизм, чтобы прогресс шёл плавно и не забивался канал.
    const queue = [...unique];
    const workers = Array.from({ length: 6 }, async () => {
      while (queue.length) {
        const id = queue.shift()!;
        await this.load(id);
        done++;
        onProgress?.(done / unique.length, id);
        // Отдаём кадр браузеру, чтобы экран загрузки обновлялся.
        await new Promise((r) => setTimeout(r, 0));
      }
    });
    await Promise.all(workers);
  }

  load(id: string): Promise<THREE.Object3D> {
    const ready = this.protos.get(id);
    if (ready) return Promise.resolve(ready);
    let p = this.pending.get(id);
    if (p) return p;
    p = this.loadInner(id).then((obj) => {
      this.prepare(obj);
      this.protos.set(id, obj);
      this.pending.delete(id);
      return obj;
    });
    this.pending.set(id, p);
    return p;
  }

  private async loadInner(id: string): Promise<THREE.Object3D> {
    const def = getAssetDef(id);
    if (this.source === 'glb') await this.ensureManifest();
    if (this.source === 'glb' && def && !def.runtimeOnly && this.manifest?.has(id)) {
      try {
        const gltf = await this.loader.loadAsync(this.baseUrl + glbPath(id));
        const root = gltf.scene.children.length === 1 ? gltf.scene.children[0]! : gltf.scene;
        root.removeFromParent();
        root.name = id;
        this.loadedFromGlb++;
        return root;
      } catch (err) {
        console.warn(`[AssetManager] GLB «${id}» не загрузился, строю процедурно`, err);
        this.failures.push(id);
      }
    }
    if (def) {
      try {
        const obj = def.build();
        obj.name = id;
        this.builtProcedurally++;
        return obj;
      } catch (err) {
        console.error(`[AssetManager] строитель «${id}» упал`, err);
        this.failures.push(id);
      }
    }
    return this.graybox(id);
  }

  /** Серая заглушка 1×1×1 — игра не ломается из-за отсутствующей модели. */
  private graybox(id: string): THREE.Object3D {
    const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x888888, name: 'graybox' }));
    m.position.y = 0.5;
    const g = new THREE.Group();
    g.name = id;
    g.add(m);
    return g;
  }

  private prepare(root: THREE.Object3D): void {
    this.materials.apply(root);
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const ud = mesh.userData as { cs?: number; rs?: number };
      if (ud.cs !== undefined) mesh.castShadow = !!ud.cs;
      if (ud.rs !== undefined) mesh.receiveShadow = !!ud.rs;
      const mat = mesh.material as THREE.Material;
      if (mat && (mat as THREE.MeshStandardMaterial).transparent) mesh.castShadow = false;
    });
  }

  has(id: string): boolean {
    return this.protos.has(id);
  }

  /** Прототип (не добавлять в сцену напрямую). */
  proto(id: string): THREE.Object3D {
    const p = this.protos.get(id);
    if (!p) throw new Error(`[AssetManager] ассет «${id}» не загружен`);
    return p;
  }

  /** Новый экземпляр (общая геометрия и материалы). */
  instance(id: string): THREE.Object3D {
    const p = this.proto(id);
    let hasSkin = false;
    p.traverse((o) => {
      if ((o as THREE.SkinnedMesh).isSkinnedMesh) hasSkin = true;
    });
    const c = hasSkin ? skeletonClone(p) : p.clone(true);
    return c;
  }

  /** Слитая геометрия модели (для InstancedMesh). Модель должна быть в одном материале. */
  mergedGeometry(id: string): THREE.BufferGeometry {
    let g = this.singleGeos.get(id);
    if (!g) {
      g = singleGeometry(this.proto(id)) ?? new THREE.BoxGeometry(0.1, 0.1, 0.1);
      g.computeBoundingSphere();
      this.singleGeos.set(id, g);
    }
    return g;
  }

  /** Геометрии модели по материалам (для инстансинга многоматериальных моделей). */
  geometriesByMaterial(id: string): { geometry: THREE.BufferGeometry; material: THREE.Material; castShadow: boolean }[] {
    const p = this.proto(id);
    p.updateMatrixWorld(true);
    const out: { geometry: THREE.BufferGeometry; material: THREE.Material; castShadow: boolean }[] = [];
    p.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const g = mesh.geometry.clone();
      g.applyMatrix4(mesh.matrixWorld);
      out.push({ geometry: g, material: mesh.material as THREE.Material, castShadow: mesh.castShadow });
    });
    return out;
  }
}
