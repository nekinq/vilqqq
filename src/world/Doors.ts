import * as THREE from 'three';
import { damp } from '../core/math';

/**
 * Автоматические двери магазина (узлы door_* модели). Открываются, когда рядом игрок или NPC.
 * Открываются внутрь помещения; входная дверь звенит колокольчиком.
 */
interface Door {
  node: THREE.Object3D;
  closed: number;
  open: number;
  amount: number;
  center: THREE.Vector3;
  group: string;
  wasOpen: boolean;
}

/** Направление распахивания (знак добавки к повороту) для каждого узла. */
const SWING: Record<string, number> = {
  door_front_L: -1,
  door_front_R: 1,
  door_back: 1,
  door_wh: -1,
  door_whout_L: -1,
  door_whout_R: 1,
};

export class Doors {
  private doors: Door[] = [];
  onOpen: ((group: string) => void) | null = null;
  /** Принудительно заперто (например, задняя дверь до реставрации). */
  locked = new Set<string>();

  constructor(shop: THREE.Object3D) {
    shop.updateMatrixWorld(true);
    for (const [name, sign] of Object.entries(SWING)) {
      const node = shop.getObjectByName(name);
      if (!node) continue;
      // Центр полотна: пивот + половина ширины вдоль локальной X.
      const box = new THREE.Box3().setFromObject(node);
      const center = box.getCenter(new THREE.Vector3());
      this.doors.push({ node, closed: node.rotation.y, open: node.rotation.y + sign * 1.45, amount: 0, center, group: (node.userData.door as string) ?? name, wasOpen: false });
    }
  }

  /** Позиции дверей по группам (для навигации). */
  centers(group: string): THREE.Vector3[] {
    return this.doors.filter((d) => d.group === group).map((d) => d.center);
  }

  update(dt: number, agents: { x: number; z: number }[]): void {
    for (const d of this.doors) {
      let near = false;
      if (!this.locked.has(d.group)) {
        for (const a of agents) {
          if (Math.hypot(a.x - d.center.x, a.z - d.center.z) < 1.9) {
            near = true;
            break;
          }
        }
      }
      d.amount = damp(d.amount, near ? 1 : 0, near ? 9 : 4, dt);
      d.node.rotation.y = d.closed + (d.open - d.closed) * d.amount;
      const isOpen = d.amount > 0.25;
      if (isOpen && !d.wasOpen && d.node.name === 'door_front_L') this.onOpen?.(d.group);
      d.wasOpen = isOpen;
    }
  }
}
