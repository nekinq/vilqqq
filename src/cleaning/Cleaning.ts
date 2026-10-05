import type { Ctx } from '../economy/Economy';
import { nextId, type DirtItem, type LooseItem } from '../game/state';
import { DIRT_WEIGHTS, type DirtKind } from '../data/progression';
import { BALANCE } from '../data/balance';
import { clamp } from '../core/math';

/**
 * Грязь (следы, земля, бумажки от покупателей) и чистота 0–100.
 * Реставрационные паутина/мусор/пятна тоже пачкают зал, пока их не уберут.
 */
export class DirtService {
  constructor(private readonly ctx: Ctx) {}

  private get s() {
    return this.ctx.state;
  }

  cleanliness(): number {
    let w = 0;
    for (const d of this.s.dirt) w += DIRT_WEIGHTS[d.kind] * d.strength;
    const r = this.s.restoration;
    for (const web of r.webs) if (!web) w += DIRT_WEIGHTS.cobweb;
    for (const ws of r.waste) if (ws !== 'disposed') w += DIRT_WEIGHTS.trash;
    for (const st of r.stains) w += DIRT_WEIGHTS.stain * st;
    return clamp(Math.round((100 - w) * 10) / 10, 0, 100);
  }

  spawn(kind: DirtKind, x: number, y: number, z: number, rot: number): DirtItem | null {
    if (this.s.dirt.length >= BALANCE.maxDirtDecals) return null;
    const d: DirtItem = { id: nextId(this.s, 'dirt'), kind, x, y, z, rot, strength: 1 };
    this.s.dirt.push(d);
    this.ctx.events.emit('dirt', { id: d.id, removed: false });
    this.ctx.events.emit('cleanliness', { value: this.cleanliness() });
    return d;
  }

  /** Подмести в точке: уменьшает силу грязи в радиусе. Возвращает, было ли что убирать. */
  sweep(x: number, z: number, radius: number, amount: number): boolean {
    let any = false;
    for (const d of [...this.s.dirt]) {
      if (Math.hypot(d.x - x, d.z - z) > radius) continue;
      any = true;
      // Бумажку метла убирает сразу, следы и землю — постепенно.
      const k = d.kind === 'paper' ? 3 : d.kind === 'mud' ? 0.7 : 1;
      d.strength -= amount * k;
      if (d.strength <= 0.02) {
        this.s.dirt = this.s.dirt.filter((q) => q.id !== d.id);
        this.ctx.events.emit('dirt', { id: d.id, removed: true });
      } else this.ctx.events.emit('dirt', { id: d.id, removed: false });
    }
    if (any) this.ctx.events.emit('cleanliness', { value: this.cleanliness() });
    return any;
  }

  nearest(x: number, z: number, radius: number): DirtItem | null {
    let best: DirtItem | null = null;
    let bd = radius;
    for (const d of this.s.dirt) {
      const dd = Math.hypot(d.x - x, d.z - z);
      if (dd < bd) {
        bd = dd;
        best = d;
      }
    }
    return best;
  }
}

/** Реставрация магазина: обязательна перед первой сменой. */
export class RestorationService {
  constructor(private readonly ctx: Ctx) {}

  private get r() {
    return this.ctx.state.restoration;
  }

  counts(): { boards: number; webs: number; waste: number; stains: number } {
    return {
      boards: this.r.boards.filter((b) => b === 'disposed').length,
      webs: this.r.webs.filter(Boolean).length,
      waste: this.r.waste.filter((w) => w === 'disposed').length,
      stains: this.r.stains.filter((s) => s <= 0).length,
    };
  }

  complete(): boolean {
    const c = this.counts();
    return c.boards === 6 && c.webs === 4 && c.waste === 4 && c.stains === 4;
  }

  /** Доска снята с окна и упала у фасада. */
  loosenBoard(i: number, at: LooseItem): void {
    if (this.r.boards[i] !== 'nailed') return;
    this.r.boards[i] = 'loose';
    this.r.boardPos[i] = at;
    this.ctx.events.emit('restoration', { kind: 'board', index: i });
  }

  pickBoard(i: number): void {
    if (this.r.boards[i] !== 'loose') return;
    this.r.boards[i] = 'held';
    this.r.boardPos[i] = null;
    this.ctx.events.emit('restoration', { kind: 'board', index: i });
  }

  dropBoard(i: number, at: LooseItem): void {
    if (this.r.boards[i] !== 'held') return;
    this.r.boards[i] = 'loose';
    this.r.boardPos[i] = at;
    this.ctx.events.emit('restoration', { kind: 'board', index: i });
  }

  disposeBoard(i: number): void {
    if (this.r.boards[i] !== 'held') return;
    this.r.boards[i] = 'disposed';
    this.ctx.events.emit('restoration', { kind: 'board', index: i });
    this.checkDone();
  }

  removeWeb(i: number): void {
    if (this.r.webs[i]) return;
    this.r.webs[i] = true;
    this.ctx.events.emit('restoration', { kind: 'web', index: i });
    this.checkDone();
  }

  pickWaste(i: number): void {
    if (this.r.waste[i] !== 'placed') return;
    this.r.waste[i] = 'held';
    this.ctx.events.emit('restoration', { kind: 'waste', index: i });
  }

  dropWaste(i: number, at: LooseItem): void {
    if (this.r.waste[i] !== 'held') return;
    this.r.waste[i] = 'placed';
    this.r.wastePos[i] = at;
    this.ctx.events.emit('restoration', { kind: 'waste', index: i });
  }

  disposeWaste(i: number): void {
    if (this.r.waste[i] !== 'held') return;
    this.r.waste[i] = 'disposed';
    this.ctx.events.emit('restoration', { kind: 'waste', index: i });
    this.checkDone();
  }

  scrubStain(i: number, amount: number): boolean {
    const v = this.r.stains[i]!;
    if (v <= 0) return false;
    this.r.stains[i] = Math.max(0, v - amount);
    if (this.r.stains[i]! <= 0.001) this.r.stains[i] = 0;
    this.ctx.events.emit('restoration', { kind: 'stain', index: i });
    if (this.r.stains[i] === 0) this.checkDone();
    return true;
  }

  private checkDone(): void {
    if (this.complete() && this.r.completedDay === null) {
      this.r.completedDay = this.ctx.state.day;
      this.ctx.events.emit('restorationComplete', {});
      this.ctx.events.emit('notify', { text: 'Магазин приведён в порядок! Можно обустраиваться', kind: 'good' });
    }
  }
}
