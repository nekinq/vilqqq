import { ROADS, PLAZA, type XZ } from './layout';
import { smoothPath } from './Ground';
import type { CollisionWorld } from './Colliders';

/**
 * Навигация NPC:
 *  - RoadGraph — граф по дорогам деревни (A* по узлам), жители ходят по грунтовкам и брусчатке;
 *  - NavGrid — сетка 0.25 м для зала магазина и крыльца, A* с октильной эвристикой,
 *    динамические препятствия (мебель), сглаживание по прямой видимости.
 */

interface GNode {
  x: number;
  z: number;
  edges: { to: number; w: number }[];
}

class MinHeap {
  private a: number[] = [];
  private p: Float64Array;
  constructor(size: number) {
    this.p = new Float64Array(size);
  }
  get size(): number {
    return this.a.length;
  }
  push(i: number, prio: number): void {
    this.p[i] = prio;
    const a = this.a;
    a.push(i);
    let k = a.length - 1;
    while (k > 0) {
      const parent = (k - 1) >> 1;
      if (this.p[a[parent]!]! <= prio) break;
      a[k] = a[parent]!;
      k = parent;
    }
    a[k] = i;
  }
  pop(): number {
    const a = this.a;
    const top = a[0]!;
    const last = a.pop()!;
    if (a.length > 0) {
      let k = 0;
      const prio = this.p[last]!;
      for (;;) {
        const l = 2 * k + 1;
        if (l >= a.length) break;
        const r = l + 1;
        const c = r < a.length && this.p[a[r]!]! < this.p[a[l]!]! ? r : l;
        if (this.p[a[c]!]! >= prio) break;
        a[k] = a[c]!;
        k = c;
      }
      a[k] = last;
    }
    return top;
  }
}

export class RoadGraph {
  readonly nodes: GNode[] = [];

  constructor() {
    const roads: XZ[][] = ROADS.map((r) => r.pts);
    // Кольцо вокруг клумбы на площади.
    const ring: XZ[] = [];
    for (let i = 0; i <= 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      ring.push([PLAZA.x + Math.cos(a) * 10.6, PLAZA.z + Math.sin(a) * 10.6]);
    }
    roads.push(ring);
    // Двор магазина: от кольца к ступеням крыльца.
    roads.push([
      [0, 0.6],
      [0, 3.4],
      [0, 5.35],
    ]);
    for (const pts of roads) {
      const sm = smoothPath(pts, 2.5);
      let prev = -1;
      for (const [x, z] of sm) {
        const id = this.addNode(x, z);
        if (prev >= 0 && prev !== id) this.link(prev, id);
        prev = id;
      }
    }
    // Связать близкие узлы разных дорог (перекрёстки).
    for (let i = 0; i < this.nodes.length; i++) {
      for (let j = i + 1; j < this.nodes.length; j++) {
        const a = this.nodes[i]!;
        const b = this.nodes[j]!;
        const d = Math.hypot(a.x - b.x, a.z - b.z);
        if (d < 3.2 && !a.edges.some((e) => e.to === j)) this.link(i, j);
      }
    }
  }

  private addNode(x: number, z: number): number {
    // Склеиваем почти совпадающие узлы.
    for (let i = 0; i < this.nodes.length; i++) {
      const n = this.nodes[i]!;
      if (Math.hypot(n.x - x, n.z - z) < 0.6) return i;
    }
    this.nodes.push({ x, z, edges: [] });
    return this.nodes.length - 1;
  }

  private link(a: number, b: number): void {
    const na = this.nodes[a]!;
    const nb = this.nodes[b]!;
    const w = Math.hypot(na.x - nb.x, na.z - nb.z);
    na.edges.push({ to: b, w });
    nb.edges.push({ to: a, w });
  }

  nearest(x: number, z: number): number {
    let best = 0;
    let bd = Infinity;
    for (let i = 0; i < this.nodes.length; i++) {
      const n = this.nodes[i]!;
      const d = (n.x - x) ** 2 + (n.z - z) ** 2;
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    return best;
  }

  /** Путь по дорогам от точки до точки (включая сами точки). */
  path(ax: number, az: number, bx: number, bz: number): XZ[] {
    const s = this.nearest(ax, az);
    const t = this.nearest(bx, bz);
    const n = this.nodes.length;
    const g = new Float64Array(n).fill(Infinity);
    const from = new Int32Array(n).fill(-1);
    const closed = new Uint8Array(n);
    const heap = new MinHeap(n);
    g[s] = 0;
    heap.push(s, 0);
    const T = this.nodes[t]!;
    while (heap.size) {
      const c = heap.pop();
      if (closed[c]) continue;
      closed[c] = 1;
      if (c === t) break;
      for (const e of this.nodes[c]!.edges) {
        const ng = g[c]! + e.w;
        if (ng < g[e.to]!) {
          g[e.to] = ng;
          from[e.to] = c;
          const nn = this.nodes[e.to]!;
          heap.push(e.to, ng + Math.hypot(nn.x - T.x, nn.z - T.z));
        }
      }
    }
    const out: XZ[] = [[bx, bz]];
    let c = t;
    if (from[t] === -1 && s !== t) return [
      [ax, az],
      [bx, bz],
    ];
    while (c !== -1) {
      const nd = this.nodes[c]!;
      out.push([nd.x, nd.z]);
      c = from[c]!;
    }
    out.push([ax, az]);
    return out.reverse();
  }
}

export class NavGrid {
  readonly cell = 0.25;
  readonly cols: number;
  readonly rows: number;
  /** 0 — свободно, 1 — статика, 2 — динамика (мебель). */
  readonly blocked: Uint8Array;
  private staticMask: Uint8Array;

  constructor(
    readonly x0: number,
    readonly z0: number,
    readonly x1: number,
    readonly z1: number,
  ) {
    this.cols = Math.ceil((x1 - x0) / this.cell);
    this.rows = Math.ceil((z1 - z0) / this.cell);
    this.blocked = new Uint8Array(this.cols * this.rows);
    this.staticMask = new Uint8Array(this.cols * this.rows);
  }

  inside(x: number, z: number): boolean {
    return x >= this.x0 && x < this.x1 && z >= this.z0 && z < this.z1;
  }

  toCell(x: number, z: number): [number, number] {
    return [Math.floor((x - this.x0) / this.cell), Math.floor((z - this.z0) / this.cell)];
  }

  center(cx: number, cz: number): XZ {
    return [this.x0 + (cx + 0.5) * this.cell, this.z0 + (cz + 0.5) * this.cell];
  }

  idx(cx: number, cz: number): number {
    return cz * this.cols + cx;
  }

  /** Растеризовать статичные коллайдеры (стены, прилавок) с отступом agentR. */
  bakeStatic(colliders: CollisionWorld, agentR: number, filter: (tag: string) => boolean): void {
    for (let cz = 0; cz < this.rows; cz++) {
      for (let cx = 0; cx < this.cols; cx++) {
        const [x, z] = this.center(cx, cz);
        const free = colliders.isFree(x, z, agentR, (c) => filter(c.tag));
        this.staticMask[this.idx(cx, cz)] = free ? 0 : 1;
      }
    }
    this.blocked.set(this.staticMask);
  }

  /** Пометить прямоугольник (повёрнутый на кратный 90° угол) как препятствие. */
  blockRect(cx: number, cz: number, hw: number, hd: number, pad: number, value = 2): void {
    const [a0, b0] = this.toCell(cx - hw - pad, cz - hd - pad);
    const [a1, b1] = this.toCell(cx + hw + pad, cz + hd + pad);
    for (let j = Math.max(0, b0); j <= Math.min(this.rows - 1, b1); j++) {
      for (let i = Math.max(0, a0); i <= Math.min(this.cols - 1, a1); i++) {
        const [x, z] = this.center(i, j);
        if (Math.abs(x - cx) <= hw + pad && Math.abs(z - cz) <= hd + pad) this.blocked[this.idx(i, j)] = Math.max(this.blocked[this.idx(i, j)]!, value);
      }
    }
  }

  /** Сбросить динамические препятствия (перед пересчётом мебели). */
  resetDynamic(): void {
    this.blocked.set(this.staticMask);
  }

  isFree(x: number, z: number): boolean {
    if (!this.inside(x, z)) return false;
    const [cx, cz] = this.toCell(x, z);
    return this.blocked[this.idx(cx, cz)] === 0;
  }

  /** Ближайшая свободная клетка (поиск по кольцам). */
  nearestFree(x: number, z: number, maxR = 12): [number, number] | null {
    const [cx, cz] = this.toCell(x, z);
    for (let r = 0; r <= maxR; r++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          const i = cx + dx;
          const j = cz + dz;
          if (i < 0 || j < 0 || i >= this.cols || j >= this.rows) continue;
          if (this.blocked[this.idx(i, j)] === 0) return [i, j];
        }
      }
    }
    return null;
  }

  /** A* по сетке. Возвращает сглаженный путь в мировых координатах или null. */
  path(ax: number, az: number, bx: number, bz: number): XZ[] | null {
    const s = this.nearestFree(ax, az);
    const t = this.nearestFree(bx, bz);
    if (!s || !t) return null;
    const n = this.cols * this.rows;
    const g = new Float32Array(n).fill(Infinity);
    const from = new Int32Array(n).fill(-1);
    const closed = new Uint8Array(n);
    const heap = new MinHeap(n);
    const si = this.idx(s[0], s[1]);
    const ti = this.idx(t[0], t[1]);
    g[si] = 0;
    heap.push(si, 0);
    const H = (i: number, j: number) => {
      const dx = Math.abs(i - t[0]);
      const dz = Math.abs(j - t[1]);
      return dx + dz + (Math.SQRT2 - 2) * Math.min(dx, dz);
    };
    let found = false;
    let iter = 0;
    while (heap.size && iter++ < 60000) {
      const c = heap.pop();
      if (closed[c]) continue;
      closed[c] = 1;
      if (c === ti) {
        found = true;
        break;
      }
      const ci = c % this.cols;
      const cj = Math.floor(c / this.cols);
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dz) continue;
          const i = ci + dx;
          const j = cj + dz;
          if (i < 0 || j < 0 || i >= this.cols || j >= this.rows) continue;
          const ni = this.idx(i, j);
          if (this.blocked[ni] !== 0 || closed[ni]) continue;
          // Не срезаем углы.
          if (dx && dz && (this.blocked[this.idx(ci + dx, cj)] !== 0 || this.blocked[this.idx(ci, cj + dz)] !== 0)) continue;
          const ng = g[c]! + (dx && dz ? Math.SQRT2 : 1);
          if (ng < g[ni]!) {
            g[ni] = ng;
            from[ni] = c;
            heap.push(ni, ng + H(i, j));
          }
        }
      }
    }
    if (!found) return null;
    const cells: number[] = [];
    let c = ti;
    while (c !== -1) {
      cells.push(c);
      c = from[c]!;
    }
    cells.reverse();
    const pts: XZ[] = cells.map((ci) => this.center(ci % this.cols, Math.floor(ci / this.cols)));
    pts[pts.length - 1] = [bx, bz];
    return this.smooth([[ax, az], ...pts.slice(1)]);
  }

  /** Есть ли прямая видимость между точками по свободным клеткам. */
  lineFree(ax: number, az: number, bx: number, bz: number): boolean {
    const len = Math.hypot(bx - ax, bz - az);
    const steps = Math.max(1, Math.ceil(len / (this.cell * 0.5)));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      if (!this.isFree(ax + (bx - ax) * t, az + (bz - az) * t)) return false;
    }
    return true;
  }

  private smooth(pts: XZ[]): XZ[] {
    if (pts.length <= 2) return pts;
    const out: XZ[] = [pts[0]!];
    let i = 0;
    while (i < pts.length - 1) {
      let j = pts.length - 1;
      while (j > i + 1 && !this.lineFree(pts[i]![0], pts[i]![1], pts[j]![0], pts[j]![1])) j--;
      out.push(pts[j]!);
      i = j;
    }
    return out;
  }

  /** Достижима ли точка b из a (для проверки расстановки мебели). */
  reachable(ax: number, az: number, bx: number, bz: number): boolean {
    return this.path(ax, az, bx, bz) !== null;
  }
}
