import type { Ctx } from '../economy/Economy';
import { levelDef, reputationFactor } from '../data/progression';
import { BALANCE } from '../data/balance';
import { PRODUCTS, type ProductId } from '../data/products';
import type { Rng } from '../core/rng';
import type { WantItem } from '../game/state';

/**
 * Расписание визитов на смену: число зависит от уровня и репутации, визиты распределены
 * по 900 с; одновременно в магазине — не больше лимита уровня.
 */
export class CustomerDirector {
  constructor(
    private readonly ctx: Ctx,
    private readonly rng: Rng,
  ) {}

  static plannedVisits(level: number, reputation: number, rng: Rng): number {
    const [a, b] = levelDef(level).customers;
    const base = rng.int(a, b);
    return Math.max(1, Math.round(base * reputationFactor(reputation)));
  }

  /** Спланировать день (вызывается при открытии смены). */
  planDay(): void {
    const s = this.ctx.state;
    const n = CustomerDirector.plannedVisits(s.level, s.reputation, this.rng);
    const start = BALANCE.dayStart + 4;
    const end = BALANCE.dayEnd - 25;
    const plan: number[] = [];
    // Равномерно с дрожанием: визиты не слипаются.
    for (let i = 0; i < n; i++) {
      const t = start + ((i + 0.5) / n) * (end - start);
      plan.push(Math.round(t + this.rng.range(-0.45, 0.45) * ((end - start) / n)));
    }
    plan.sort((x, y) => x - y);
    // Первый покупатель приходит быстро — игроку не скучно.
    if (plan.length) plan[0] = Math.min(plan[0]!, start + 6);
    s.director = { plan, spawned: 0, total: n, refused: 0 };
  }

  maxActive(): number {
    return levelDef(this.ctx.state.level).maxActive;
  }

  /** Нужно ли выпустить следующего покупателя сейчас. */
  due(activeCount: number): boolean {
    const s = this.ctx.state;
    if (s.phase !== 'open') return false;
    const d = s.director;
    if (d.spawned >= d.plan.length) return false;
    if (activeCount >= this.maxActive()) return false;
    return s.minutes >= d.plan[d.spawned]!;
  }

  markSpawned(): void {
    this.ctx.state.director.spawned++;
    this.ctx.state.ledger.customersVisited++;
    this.ctx.state.totals.customers++;
  }
}

/** Список покупок: 1–4 позиции из ассортимента, по популярности. */
export function makeShoppingList(rng: Rng, assortment: readonly ProductId[], level: number): WantItem[] {
  if (assortment.length === 0) return [];
  const maxItems = Math.min(assortment.length, level >= 4 ? 4 : level >= 2 ? 3 : 2);
  const n = rng.int(1, maxItems);
  const pool = [...assortment];
  const out: WantItem[] = [];
  for (let i = 0; i < n && pool.length; i++) {
    const pick = rng.weighted(pool, (id) => PRODUCTS[id].popularity);
    pool.splice(pool.indexOf(pick), 1);
    out.push({ sku: pick, qty: rng.chance(0.3) ? 2 : 1, result: 'pending', taken: 0 });
  }
  return out;
}

/**
 * Решение о цене (скрыто от игрока): k = цена / базовая.
 * k ≤ 1 → 100%; 1–1.3 → до 75%; 1.3–1.7 → до 20%; > 2 → ~2%. Репутация чуть расширяет терпимость.
 */
export function buyChance(price: number, basePrice: number, reputation: number): number {
  const tol = 1 + ((reputation - 50) / 50) * 0.1;
  const k = price / basePrice / tol;
  if (k <= 1) return 1;
  if (k <= 1.3) return 1 - ((k - 1) / 0.3) * 0.25;
  if (k <= 1.7) return 0.75 - ((k - 1.3) / 0.4) * 0.55;
  if (k <= 2) return 0.2 - ((k - 1.7) / 0.3) * 0.18;
  return 0.02;
}

/** Дешевле обычного — может взять на 1 шт. больше. */
export function bonusQty(price: number, basePrice: number, rng: Rng): number {
  return price / basePrice < 0.85 && rng.chance(0.4) ? 1 : 0;
}

/** Итог визита по списку: full / partial / missing / expensive. */
export function summarizeVisit(wants: readonly WantItem[]): 'full' | 'partial' | 'missing' | 'expensive' {
  const taken = wants.reduce((a, w) => a + w.taken, 0);
  const allTaken = wants.every((w) => w.result === 'taken');
  if (taken > 0) return allTaken ? 'full' : 'partial';
  if (wants.some((w) => w.result === 'missing')) return 'missing';
  return 'expensive';
}
