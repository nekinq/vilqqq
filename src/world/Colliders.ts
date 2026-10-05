/**
 * Коллизии в плоскости XZ: статичные и динамичные препятствия (круги и повёрнутые боксы),
 * пространственная сетка для быстрых запросов, выталкивание круга (игрок, NPC).
 * Плюс карта пола: прямоугольные платформы с высотой (крыльцо, ступени, зал).
 */

export interface CircleShape {
  kind: 'circle';
  x: number;
  z: number;
  r: number;
}

export interface BoxShape {
  kind: 'box';
  x: number;
  z: number;
  hw: number;
  hd: number;
  rot: number;
}

export type Shape = CircleShape | BoxShape;

export interface Collider {
  id: number;
  shape: Shape;
  tag: string;
  /** Блокирует ли игрока (некоторые — только для NPC). */
  solid: boolean;
  cells: number[];
  // Кэш для бокса.
  cos?: number;
  sin?: number;
}

const CELL = 4;

export class CollisionWorld {
  private colliders = new Map<number, Collider>();
  private grid = new Map<number, Set<number>>();
  private nextId = 1;

  private key(cx: number, cz: number): number {
    return (cx + 1000) * 4096 + (cz + 1000);
  }

  private bounds(s: Shape): [number, number, number, number] {
    if (s.kind === 'circle') return [s.x - s.r, s.z - s.r, s.x + s.r, s.z + s.r];
    const c = Math.abs(Math.cos(s.rot));
    const sn = Math.abs(Math.sin(s.rot));
    const ex = s.hw * c + s.hd * sn;
    const ez = s.hw * sn + s.hd * c;
    return [s.x - ex, s.z - ez, s.x + ex, s.z + ez];
  }

  add(shape: Shape, tag = 'static', solid = true): number {
    const id = this.nextId++;
    const col: Collider = { id, shape, tag, solid, cells: [] };
    if (shape.kind === 'box') {
      col.cos = Math.cos(shape.rot);
      col.sin = Math.sin(shape.rot);
    }
    const [x0, z0, x1, z1] = this.bounds(shape);
    for (let cx = Math.floor(x0 / CELL); cx <= Math.floor(x1 / CELL); cx++) {
      for (let cz = Math.floor(z0 / CELL); cz <= Math.floor(z1 / CELL); cz++) {
        const k = this.key(cx, cz);
        let set = this.grid.get(k);
        if (!set) {
          set = new Set();
          this.grid.set(k, set);
        }
        set.add(id);
        col.cells.push(k);
      }
    }
    this.colliders.set(id, col);
    return id;
  }

  circle(x: number, z: number, r: number, tag = 'static'): number {
    return this.add({ kind: 'circle', x, z, r }, tag);
  }

  box(x: number, z: number, hw: number, hd: number, rot = 0, tag = 'static'): number {
    return this.add({ kind: 'box', x, z, hw, hd, rot }, tag);
  }

  /** Бокс по двум точкам (стена, забор) с толщиной. */
  segment(ax: number, az: number, bx: number, bz: number, thick: number, tag = 'static'): number {
    const dx = bx - ax;
    const dz = bz - az;
    const len = Math.hypot(dx, dz);
    // rot: поворот вокруг Y, локальная X вдоль отрезка.
    const rot = Math.atan2(-dz, dx);
    return this.box((ax + bx) / 2, (az + bz) / 2, len / 2, thick / 2, rot, tag);
  }

  remove(id: number): void {
    const col = this.colliders.get(id);
    if (!col) return;
    for (const k of col.cells) this.grid.get(k)?.delete(id);
    this.colliders.delete(id);
  }

  removeByTag(tag: string): void {
    for (const c of [...this.colliders.values()]) if (c.tag === tag) this.remove(c.id);
  }

  near(x: number, z: number, r: number): Collider[] {
    const out = new Set<number>();
    for (let cx = Math.floor((x - r) / CELL); cx <= Math.floor((x + r) / CELL); cx++) {
      for (let cz = Math.floor((z - r) / CELL); cz <= Math.floor((z + r) / CELL); cz++) {
        const set = this.grid.get(this.key(cx, cz));
        if (set) for (const id of set) out.add(id);
      }
    }
    return [...out].map((id) => this.colliders.get(id)!).filter(Boolean);
  }

  /**
   * Вытолкнуть круг из препятствий. Возвращает скорректированную позицию.
   * filter — какие коллайдеры учитывать (например, NPC не толкают сами себя).
   */
  resolve(x: number, z: number, r: number, filter?: (c: Collider) => boolean): { x: number; z: number; hit: boolean } {
    let hit = false;
    for (let iter = 0; iter < 4; iter++) {
      let moved = false;
      for (const c of this.near(x, z, r + 1)) {
        if (!c.solid || (filter && !filter(c))) continue;
        const s = c.shape;
        if (s.kind === 'circle') {
          const dx = x - s.x;
          const dz = z - s.z;
          const d = Math.hypot(dx, dz);
          const min = r + s.r;
          if (d < min) {
            const nx = d > 1e-5 ? dx / d : 1;
            const nz = d > 1e-5 ? dz / d : 0;
            x = s.x + nx * min;
            z = s.z + nz * min;
            moved = hit = true;
          }
        } else {
          // В локальные координаты бокса.
          const cs = c.cos!;
          const sn = c.sin!;
          const dx = x - s.x;
          const dz = z - s.z;
          // Локальная система: X вдоль rot (ось (cos, −sin) в XZ), Z — перпендикуляр.
          const lx = dx * cs - dz * sn;
          const lz = dx * sn + dz * cs;
          const qx = Math.max(-s.hw, Math.min(s.hw, lx));
          const qz = Math.max(-s.hd, Math.min(s.hd, lz));
          let ox = lx - qx;
          let oz = lz - qz;
          const d = Math.hypot(ox, oz);
          if (d < r) {
            let px: number;
            let pz: number;
            if (d > 1e-5) {
              ox /= d;
              oz /= d;
              px = qx + ox * r;
              pz = qz + oz * r;
            } else {
              // Центр внутри бокса — выталкиваем по кратчайшей оси.
              const ex = s.hw - Math.abs(lx);
              const ez = s.hd - Math.abs(lz);
              if (ex < ez) {
                px = Math.sign(lx || 1) * (s.hw + r);
                pz = lz;
              } else {
                px = lx;
                pz = Math.sign(lz || 1) * (s.hd + r);
              }
            }
            // Обратно в мир.
            x = s.x + px * cs + pz * sn;
            z = s.z - px * sn + pz * cs;
            moved = hit = true;
          }
        }
      }
      if (!moved) break;
    }
    return { x, z, hit };
  }

  /** Проверка, свободна ли точка (для расстановки и спавна). */
  isFree(x: number, z: number, r: number, filter?: (c: Collider) => boolean): boolean {
    const res = this.resolve(x, z, r, filter);
    return !res.hit;
  }

  /** Пересекает ли отрезок препятствия (грубо — шагами). */
  segmentBlocked(ax: number, az: number, bx: number, bz: number, r: number, filter?: (c: Collider) => boolean): boolean {
    const len = Math.hypot(bx - ax, bz - az);
    const steps = Math.max(1, Math.ceil(len / 0.25));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      if (!this.isFree(ax + (bx - ax) * t, az + (bz - az) * t, r, filter)) return true;
    }
    return false;
  }

  all(): Collider[] {
    return [...this.colliders.values()];
  }
}

export interface FloorRegion {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  y: number;
  tag?: string;
}

/** Платформы с высотой. Вне платформ — земля (0 внутри игровой зоны). */
export class FloorMap {
  regions: FloorRegion[] = [];

  add(r: FloorRegion): void {
    this.regions.push(r);
  }

  heightAt(x: number, z: number, ground = 0): number {
    let h = ground;
    for (const r of this.regions) {
      if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1 && r.y > h) h = r.y;
    }
    return h;
  }

  /** Есть ли под точкой платформа (пол магазина, крыльцо, ступени) с запасом pad. */
  covered(x: number, z: number, pad = 0): boolean {
    for (const r of this.regions) if (x >= r.x0 - pad && x <= r.x1 + pad && z >= r.z0 - pad && z <= r.z1 + pad) return true;
    return false;
  }

  /** В помещении ли точка (зал/склад) — для звука, освещения рук и т. п. */
  tagAt(x: number, z: number): string | null {
    let best: FloorRegion | null = null;
    for (const r of this.regions) {
      if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1 && r.tag && (!best || r.y >= best.y)) best = r;
    }
    return best?.tag ?? null;
  }
}
