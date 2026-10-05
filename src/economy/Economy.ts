import type { EventBus } from '../core/EventBus';
import type { GameEvents, MoneyCategory } from '../game/events';
import type { GameState, DayLedger } from '../game/state';
import { emptyLedger } from '../game/state';
import { levelForXp, REP, XP, MAX_LEVEL, levelDef } from '../data/progression';
import { LICENSES } from '../data/licenses';
import type { LicenseId } from '../data/products';
import { clamp } from '../core/math';

export interface Ctx {
  state: GameState;
  events: EventBus<GameEvents>;
}

/** Деньги и учёт дня (леджер). Прибыль = Выручка − Себестоимость − Зарплаты. */
export class EconomyService {
  constructor(private readonly ctx: Ctx) {}

  get money(): number {
    return this.ctx.state.money;
  }

  canAfford(amount: number): boolean {
    return this.ctx.state.money >= amount;
  }

  /** Списать деньги по категории. false — не хватает (баланс не меняется). */
  spend(amount: number, category: Exclude<MoneyCategory, 'revenue'>): boolean {
    const s = this.ctx.state;
    if (amount < 0 || !Number.isFinite(amount)) return false;
    if (s.money < amount) return false;
    s.money -= amount;
    const L = s.ledger;
    if (category === 'product') L.productPurchases += amount;
    else if (category === 'equipment') L.equipmentPurchases += amount;
    else if (category === 'license') L.licensePurchases += amount;
    else if (category === 'hire') L.hireFees += amount;
    else if (category === 'wage') L.wages += amount;
    L.closingBalance = s.money;
    this.ctx.events.emit('money', { money: s.money, delta: -amount, category });
    return true;
  }

  /** Зарплата списывается даже в минус (долг) — смена уже отработана. */
  chargeWage(amount: number): void {
    const s = this.ctx.state;
    s.money -= amount;
    s.ledger.wages += amount;
    s.ledger.closingBalance = s.money;
    this.ctx.events.emit('money', { money: s.money, delta: -amount, category: 'wage' });
  }

  /** Продажа: выручка и себестоимость проданного (по закупочной цене). */
  recordSale(revenue: number, cogs: number, items: number): void {
    const s = this.ctx.state;
    s.money += revenue;
    s.ledger.revenue += revenue;
    s.ledger.costOfGoodsSold += cogs;
    s.ledger.itemsSold += items;
    s.ledger.customersServed += 1;
    s.ledger.closingBalance = s.money;
    s.totals.sales += 1;
    s.totals.revenue += revenue;
    this.ctx.events.emit('money', { money: s.money, delta: revenue, category: 'revenue' });
  }
}

export function ledgerProfit(l: DayLedger): number {
  return l.revenue - l.costOfGoodsSold - l.wages;
}

export function ledgerCashFlow(l: DayLedger): number {
  return l.revenue - l.productPurchases - l.equipmentPurchases - l.licensePurchases - l.hireFees - l.wages;
}

/** XP, уровни (не снижаются), лицензии (покупаются, уровень только открывает). */
export class ProgressionService {
  constructor(private readonly ctx: Ctx) {}

  get level(): number {
    return this.ctx.state.level;
  }

  addXp(amount: number, reason: string): void {
    if (amount <= 0) return;
    const s = this.ctx.state;
    s.xp += amount;
    s.ledger.xp += amount;
    const lvl = Math.max(s.level, levelForXp(s.xp));
    const up = lvl > s.level;
    s.level = Math.min(MAX_LEVEL, lvl);
    this.ctx.events.emit('xp', { xp: s.xp, delta: amount, level: s.level, reason });
    if (up) this.ctx.events.emit('levelUp', { level: s.level });
  }

  /** Прогресс до следующего уровня (0..1) и порог. */
  progress(): { cur: number; next: number | null; t: number } {
    const s = this.ctx.state;
    const cur = levelDef(s.level).xp;
    const next = s.level >= MAX_LEVEL ? null : levelDef(s.level + 1).xp;
    return { cur, next, t: next === null ? 1 : clamp((s.xp - cur) / (next - cur), 0, 1) };
  }

  hasLicense(id: LicenseId): boolean {
    return this.ctx.state.licenses.includes(id);
  }

  /** Почему нельзя купить лицензию (пустой массив — можно). */
  licenseBlockers(id: LicenseId): string[] {
    const s = this.ctx.state;
    const d = LICENSES[id];
    const out: string[] = [];
    if (this.hasLicense(id)) out.push('Уже куплена');
    if (s.level < d.level) out.push(`Нужен уровень ${d.level}`);
    if (s.phase !== 'preparation') out.push('Только во время подготовки');
    if (s.money < d.price) out.push(`Не хватает ${d.price - s.money} монет`);
    return out;
  }

  buyLicense(id: LicenseId, economy: EconomyService): boolean {
    if (this.licenseBlockers(id).length) return false;
    if (!economy.spend(LICENSES[id].price, 'license')) return false;
    this.ctx.state.licenses.push(id);
    this.ctx.events.emit('license', { id });
    this.ctx.events.emit('notify', { text: `Лицензия «${LICENSES[id].title}» оформлена`, kind: 'good' });
    return true;
  }

  rewardTutorial(): void {
    const s = this.ctx.state;
    if (s.tutorial.rewarded) return;
    s.tutorial.rewarded = true;
    this.addXp(XP.tutorial, 'Обучение пройдено');
  }
}

export type VisitOutcome = 'full' | 'partial' | 'missing' | 'expensive' | 'impatient' | 'refusedDirty';

/** Репутация: одно итоговое изменение на визит (главная проблема, без накопления). */
export class ReputationService {
  constructor(private readonly ctx: Ctx) {}

  get value(): number {
    return this.ctx.state.reputation;
  }

  static visitDelta(outcome: VisitOutcome, complained: boolean): number {
    const base: Record<VisitOutcome, number> = {
      full: REP.full,
      partial: REP.partial,
      missing: REP.missing,
      expensive: REP.tooExpensive,
      impatient: REP.impatient,
      refusedDirty: REP.refusedDirty,
    };
    let d = base[outcome];
    if (complained) {
      // Жалоба на грязь не суммируется с другой проблемой: берём худшую.
      d = d < 0 ? Math.min(d, REP.dirtComplaint) : d + REP.dirtComplaint;
    }
    return d;
  }

  applyVisit(outcome: VisitOutcome, complained = false): number {
    const d = ReputationService.visitDelta(outcome, complained);
    this.add(d);
    return d;
  }

  add(delta: number): void {
    const s = this.ctx.state;
    const before = s.reputation;
    s.reputation = clamp(Math.round((s.reputation + delta) * 100) / 100, 0, 100);
    s.ledger.reputationEnd = s.reputation;
    this.ctx.events.emit('reputation', { value: s.reputation, delta: s.reputation - before });
  }
}

/** Закрыть день в леджере и открыть новый (вызывается сервисом времени). */
export function rollLedger(state: GameState, cleanliness: number): DayLedger {
  const l = state.ledger;
  l.closingBalance = state.money;
  l.reputationEnd = state.reputation;
  l.cleanlinessEnd = Math.round(cleanliness);
  state.history.push({ ...l });
  return l;
}

export function startLedger(state: GameState): void {
  state.ledger = emptyLedger(state.day, state.money, state.reputation);
}
