import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AssetManager } from '../core/AssetManager';

/**
 * Статичный батчинг деревни через BatchedMesh: всё неподвижное (дома, прилавки, деревья,
 * заборы, трава, фонари) собирается в один BatchedMesh на материал. Один вызов отрисовки
 * на материал (WEBGL_multi_draw), отсечение по фрустуму — на каждый объект (и для теней).
 */

interface Entry {
  id: string;
  m: THREE.Matrix4;
  color: THREE.Color | null;
}

interface Group {
  material: THREE.Material;
  castShadow: boolean;
  /** Геометрия ассета в этом материале (слитая). */
  geos: Map<string, THREE.BufferGeometry>;
  geoIds: Map<string, number>;
  instances: number;
  vertices: number;
}

const tmpPos = new THREE.Vector3();
const tmpQuat = new THREE.Quaternion();
const tmpScale = new THREE.Vector3();
const tmpEuler = new THREE.Euler();

export class Instancer {
  private entries: Entry[] = [];
  readonly meshes: THREE.BatchedMesh[] = [];
  /** Ассеты без теней (трава, цветы, мелочь). */
  noShadow = new Set<string>();

  constructor(
    private readonly assets: AssetManager,
    private readonly root: THREE.Object3D,
  ) {}

  add(id: string, x: number, y: number, z: number, rotY = 0, scale: number | [number, number, number] = 1, color?: THREE.ColorRepresentation, tilt?: [number, number]): void {
    tmpPos.set(x, y, z);
    tmpEuler.set(tilt?.[0] ?? 0, rotY, tilt?.[1] ?? 0, 'YXZ');
    tmpQuat.setFromEuler(tmpEuler);
    if (Array.isArray(scale)) tmpScale.set(scale[0], scale[1], scale[2]);
    else tmpScale.setScalar(scale);
    this.entries.push({ id, m: new THREE.Matrix4().compose(tmpPos, tmpQuat, tmpScale), color: color !== undefined ? new THREE.Color(color) : null });
  }

  addMatrix(id: string, m: THREE.Matrix4, color?: THREE.ColorRepresentation): void {
    this.entries.push({ id, m: m.clone(), color: color !== undefined ? new THREE.Color(color) : null });
  }

  count(id?: string): number {
    return id ? this.entries.filter((e) => e.id === id).length : this.entries.length;
  }

  build(): void {
    const groups = new Map<string, Group>();
    const partsCache = new Map<string, { key: string; geometry: THREE.BufferGeometry }[]>();
    const usesColor = new Set<string>();
    // 1) Разложить геометрию каждого ассета по материалам.
    for (const e of this.entries) {
      if (e.color) usesColor.add(e.id);
      if (partsCache.has(e.id)) continue;
      const parts = this.assets.geometriesByMaterial(e.id);
      const byKey = new Map<string, { material: THREE.Material; castShadow: boolean; list: THREE.BufferGeometry[] }>();
      for (const p of parts) {
        const cast = p.castShadow && !this.noShadow.has(e.id);
        const key = `${p.material.uuid}|${cast ? 1 : 0}`;
        let slot = byKey.get(key);
        if (!slot) {
          slot = { material: p.material, castShadow: cast, list: [] };
          byKey.set(key, slot);
        }
        slot.list.push(normalizeAttributes(p.geometry));
      }
      const out: { key: string; geometry: THREE.BufferGeometry }[] = [];
      for (const [key, slot] of byKey) {
        const merged = slot.list.length === 1 ? slot.list[0]! : mergeGeometries(slot.list, false);
        if (!merged) continue;
        out.push({ key, geometry: merged });
        let g = groups.get(key);
        if (!g) {
          g = { material: slot.material, castShadow: slot.castShadow, geos: new Map(), geoIds: new Map(), instances: 0, vertices: 0 };
          groups.set(key, g);
        }
        g.geos.set(e.id, merged);
        g.vertices += merged.getAttribute('position').count;
      }
      partsCache.set(e.id, out);
    }
    // 2) Посчитать экземпляры по группам.
    for (const e of this.entries) for (const p of partsCache.get(e.id) ?? []) groups.get(p.key)!.instances++;
    // 3) Создать BatchedMesh на группу.
    const meshByKey = new Map<string, THREE.BatchedMesh>();
    for (const [key, g] of groups) {
      const bm = new THREE.BatchedMesh(g.instances, g.vertices, g.vertices * 2, g.material);
      bm.name = `batch:${(g.material as THREE.Material).name}`;
      bm.castShadow = g.castShadow;
      bm.receiveShadow = true;
      bm.perObjectFrustumCulled = true;
      bm.sortObjects = false;
      for (const [id, geo] of g.geos) g.geoIds.set(id, bm.addGeometry(geo));
      meshByKey.set(key, bm);
    }
    const white = new THREE.Color(1, 1, 1);
    for (const e of this.entries) {
      for (const p of partsCache.get(e.id) ?? []) {
        const g = groups.get(p.key)!;
        const bm = meshByKey.get(p.key)!;
        const inst = bm.addInstance(g.geoIds.get(e.id)!);
        bm.setMatrixAt(inst, e.m);
        if (usesColor.has(e.id) || e.color) bm.setColorAt(inst, e.color ?? white);
      }
    }
    for (const bm of meshByKey.values()) {
      bm.computeBoundingBox();
      bm.computeBoundingSphere();
      this.root.add(bm);
      this.meshes.push(bm);
    }
    this.entries = [];
  }
}

/** Оставить только общий набор атрибутов (position, normal, color, uv), все неиндексированные. */
function normalizeAttributes(src: THREE.BufferGeometry): THREE.BufferGeometry {
  let g = src.index ? src.toNonIndexed() : src;
  const n = g.getAttribute('position').count;
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  if (!g.getAttribute('color')) g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
  if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'color', 'uv'].includes(name)) g.deleteAttribute(name);
  // Атрибуты из GLB бывают квантованы/нормализованы — приводим к float32.
  for (const name of ['position', 'normal', 'color', 'uv']) {
    const a = g.getAttribute(name) as THREE.BufferAttribute;
    if (!(a.array instanceof Float32Array) || a.normalized || (name === 'color' && a.itemSize !== 3)) {
      const size = name === 'uv' ? 2 : 3;
      const arr = new Float32Array(a.count * size);
      for (let i = 0; i < a.count; i++) {
        arr[i * size] = a.getX(i);
        arr[i * size + 1] = a.getY(i);
        if (size === 3) arr[i * size + 2] = a.getZ(i);
      }
      g.setAttribute(name, new THREE.BufferAttribute(arr, size));
    }
  }
  if (g === src) g = src.clone();
  return g;
}
