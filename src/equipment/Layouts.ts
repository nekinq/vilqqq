import * as THREE from 'three';
import type { FurnitureType } from '../data/equipment';
import { SHELF_LAYOUT } from '../art/models/equipment';

/**
 * Геометрия секций мебели в локальных координатах модели:
 * центр секции, размер хитбокса, ориентация «лица», 8 мест под единицы товара,
 * точка ценника и точка доступа покупателя.
 */
export interface SectionGeom {
  center: THREE.Vector3;
  size: THREE.Vector3;
  /** Поворот товара (смотрит к покупателю). */
  rotY: number;
  slots: THREE.Vector3[];
  tag: THREE.Vector3;
  tagRotY: number;
  access: THREE.Vector3;
}

function grid(center: THREE.Vector3, xs: number[], zs: number[], frontSign: number, y = 0): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  // Сначала передний ряд (ближе к покупателю), слева направо.
  const rows = frontSign > 0 ? [...zs].sort((a, b) => b - a) : [...zs].sort((a, b) => a - b);
  for (const z of rows) for (const x of xs) out.push(new THREE.Vector3(center.x + x, center.y + y, center.z + z));
  return out;
}

const cache = new Map<FurnitureType, SectionGeom[]>();

export function sectionGeoms(type: FurnitureType): SectionGeom[] {
  let g = cache.get(type);
  if (g) return g;
  g = [];
  if (type === 'shelf') {
    const L = SHELF_LAYOUT;
    for (let side = 0; side < 2; side++) {
      const s = side === 0 ? 1 : -1;
      for (let level = 0; level < L.levels; level++) {
        for (let bay = 0; bay < L.bays; bay++) {
          const x = (bay - 1) * 0.82;
          const y = L.levelY[level]!;
          const c = new THREE.Vector3(x, y, s * L.depthZ);
          g.push({
            center: c,
            size: new THREE.Vector3(0.78, 0.5, 0.46),
            rotY: side === 0 ? 0 : Math.PI,
            slots: grid(c, [-0.285, -0.095, 0.095, 0.285], [-0.1, 0.1], s),
            tag: new THREE.Vector3(x, y - 0.012, s * 0.496),
            tagRotY: side === 0 ? 0 : Math.PI,
            access: new THREE.Vector3(x, 0, s * 0.98),
          });
        }
      }
    }
  } else if (type === 'fridge') {
    for (let col = 0; col < 2; col++) {
      for (let level = 0; level < 4; level++) {
        const x = col === 0 ? -0.42 : 0.42;
        const y = [0.24, 0.66, 1.08, 1.5][level]! + 0.0125;
        const c = new THREE.Vector3(x, y, -0.02);
        g.push({
          center: c,
          size: new THREE.Vector3(0.76, 0.4, 0.66),
          rotY: 0,
          slots: grid(c, [-0.285, -0.095, 0.095, 0.285], [-0.13, 0.11], 1),
          tag: new THREE.Vector3(x, y + 0.012, 0.352),
          tagRotY: 0,
          access: new THREE.Vector3(x, 0, 1.0),
        });
      }
    }
  } else if (type === 'freezer') {
    const comps: [number, number][] = [
      [-0.45, 0.21],
      [0.45, 0.21],
      [-0.45, -0.21],
      [0.45, -0.21],
    ];
    for (const [x, z] of comps) {
      const c = new THREE.Vector3(x, 0.44, z);
      const front = z > 0 ? 1 : -1;
      g.push({
        center: c,
        size: new THREE.Vector3(0.86, 0.5, 0.4),
        rotY: z > 0 ? 0 : Math.PI,
        slots: grid(c, [-0.3, -0.1, 0.1, 0.3], [-0.08, 0.08], front),
        tag: new THREE.Vector3(x, 0.8, front * 0.485),
        tagRotY: z > 0 ? 0 : Math.PI,
        access: new THREE.Vector3(x, 0, front * 0.95),
      });
    }
  }
  cache.set(type, g);
  return g;
}

/** Места под коробки на складском стеллаже (локально). */
export function rackSlots(): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  for (const y of [0.1, 0.58, 1.06, 1.54]) for (const x of [-0.5, 0.5]) out.push(new THREE.Vector3(x, y, 0));
  return out;
}

/** Мировая матрица точки мебели (x, z, rotY) + локальная позиция. */
export function furnitureMatrix(x: number, y: number, z: number, rotY: number): THREE.Matrix4 {
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY), new THREE.Vector3(1, 1, 1));
}

/** Полуразмеры основания с учётом поворота на 90°. */
export function footprint(w: number, d: number, rotY: number): { hw: number; hd: number } {
  const q = Math.round(rotY / (Math.PI / 2)) % 2 !== 0;
  return q ? { hw: d / 2, hd: w / 2 } : { hw: w / 2, hd: d / 2 };
}
