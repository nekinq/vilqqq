import { EventBus } from '../core/EventBus';
import { Rng } from '../core/rng';
import type { GameEvents } from './events';
import { newGameState, SAVE_VERSION, type GameState, type CheckoutState, type CustomerState } from './state';
import { EconomyService, ProgressionService, ReputationService, rollLedger, startLedger, type Ctx, type VisitOutcome } from '../economy/Economy';
import { InventoryService } from '../inventory/Inventory';
import { OrderService } from '../suppliers/Orders';
import { EquipmentService } from '../equipment/Equipment';
import { DirtService, RestorationService } from '../cleaning/Cleaning';
import { TimeService } from './Time';
import { CustomerDirector, summarizeVisit } from '../customers/Director';
import { checkoutTotal } from '../checkout/Checkout';
import { PRODUCTS, type ProductId } from '../data/products';
import { BALANCE } from '../data/balance';
import { XP, STAFF, GOAL } from '../data/progression';

/**
 * Симуляция: все сервисы над одним состоянием + сквозные правила (смена, продажа, конец дня).
 * Не знает о three.js — тестируется в Node.
 */
export class Sim {
  readonly events = new EventBus<GameEvents>();
  state: GameState;
  readonly rng: Rng;
  readonly ctx: Ctx;
  readonly economy: EconomyService;
  readonly progression: ProgressionService;
  readonly reputation: ReputationService;
  readonly inventory: InventoryService;
  readonly orders: OrderService;
  readonly equipment: EquipmentService;
  readonly dirt: DirtService;
  readonly restoration: RestorationService;
  readonly time: TimeService;
  readonly director: CustomerDirector;

  constructor(state?: GameState) {
    this.state = state ?? newGameState();
    this.rng = new Rng(this.state.rngState);
    this.ctx = { state: this.state, events: this.events };
    this.economy = new EconomyService(this.ctx);
    this.progression = new ProgressionService(this.ctx);
    this.reputation = new ReputationService(this.ctx);
    this.inventory = new InventoryService(this.ctx);
    this.orders = new OrderService(this.ctx, this.economy, this.progression, this.inventory);
    this.equipment = new EquipmentService(this.ctx, this.economy, this.inventory);
    this.dirt = new DirtService(this.ctx);
    this.restoration = new RestorationService(this.ctx);
    this.time = new TimeService(this.ctx);
    this.director = new CustomerDirector(this.ctx, this.rng);
    this.events.on('restoration', () => this.events.emit('cleanliness', { value: this.dirt.cleanliness() }));
  }

  /** Заменить состояние (загрузка сейва). Подписчики событий сохраняются. */
  load(state: GameState): void {
    this.state = state;
    this.ctx.state = state;
    this.rng.state = state.rngState;
  }

  /** Снимок для сохранения (глубокая копия). */
  snapshot(): GameState {
    this.state.rngState = this.rng.state;
    return structuredClone(this.state);
  }

  static migrate(raw: unknown): GameState {
    const s = raw as GameState;
    if (!s || typeof s !== 'object' || typeof s.version !== 'number') throw new Error('Повреждённое сохранение');
    if (s.version > SAVE_VERSION) throw new Error('Сохранение из более новой версии игры');
    // Будущие миграции: if (s.version === 1) { ...; s.version = 2; }
    const base = newGameState(s.seed);
    return { ...base, ...s, tutorial: { ...base.tutorial, ...s.tutorial }, story: { ...base.story, ...s.story } };
  }

  // ───────── Смена ─────────

  /** Причины, по которым смену открыть нельзя (пусто — можно). */
  openBlockers(): string[] {
    const s = this.state;
    const out: string[] = [];
    if (s.phase !== 'preparation') out.push('Смена уже идёт');
    if (!this.restoration.complete()) out.push('Сначала приберитесь в магазине');
    if (s.furniture.length === 0 && this.inventory.totalOnShelves() === 0) out.push('Нет ни одного стеллажа с товаром');
    return out;
  }

  /** Мягкие предупреждения (смену открыть можно). */
  openWarnings(): string[] {
    const out: string[] = [];
    if (this.inventory.totalOnShelves() === 0) out.push('Полки пустые — покупателям нечего купить');
    if (this.dirt.cleanliness() < 60) out.push('В зале грязновато');
    return out;
  }

  openShift(): boolean {
    if (this.openBlockers().length) return false;
    if (!this.time.open()) return false;
    startLedgerIfNeeded(this.state);
    this.director.planDay();
    this.events.emit('notify', { text: 'Магазин открыт! Ждём покупателей', kind: 'good' });
    return true;
  }

  closeShift(): boolean {
    const ok = this.time.close();
    if (ok) this.events.emit('notify', { text: 'Табличка «Закрыто»: новые покупатели не придут', kind: 'info' });
    return ok;
  }

  /** Тик симуляции времени. busy — есть активные покупатели/касса. */
  update(dt: number, busy: boolean): void {
    this.state.playTimeSec += dt;
    const ended = this.time.update(dt, busy);
    if (ended) this.endDay();
  }

  private endDay(): void {
    const s = this.state;
    if (s.cashierHired) this.economy.chargeWage(STAFF.cashier.wage);
    const ledger = rollLedger(s, this.dirt.cleanliness());
    // Цель сюжета: ур. 6 и репутация ≥ 80 в конце дня N дней подряд.
    if (!s.story.ending.done) {
      if (s.level >= GOAL.level && s.reputation >= GOAL.reputation) s.story.ending.streak++;
      else s.story.ending.streak = 0;
      if (s.story.ending.streak >= GOAL.streakDays) {
        s.story.ending.done = true;
        this.events.emit('storyEnding', {});
      }
    }
    this.events.emit('dayEnded', { ledger });
  }

  /** Кнопка «Начать новый день» — одноразовая по токену. */
  startNewDay(token: number): boolean {
    const ok = this.time.startNewDay(token);
    if (ok) {
      startLedger(this.state);
      // Недопроданное остаётся на полках; заказы и коробки сохраняются.
      this.state.director = { plan: [], spawned: 0, total: 0, refused: 0 };
    }
    return ok;
  }

  // ───────── Цены ─────────

  setPrice(sku: ProductId, price: number): boolean {
    const p = Math.round(price);
    if (!Number.isFinite(p) || p < BALANCE.priceMin || p > BALANCE.priceMax) return false;
    this.state.prices[sku] = p;
    this.events.emit('price', { sku, price: p });
    return true;
  }

  price(sku: ProductId): number {
    return this.state.prices[sku];
  }

  // ───────── Покупатели и продажи ─────────

  /** Завершить продажу по сессии кассы. */
  completeSale(session: CheckoutState, customer: CustomerState | undefined): void {
    const total = checkoutTotal(session);
    const cogs = session.items.reduce((a, it) => a + PRODUCTS[it.sku].wholesalePrice, 0);
    this.economy.recordSale(total, cogs, session.items.length);
    const outcome = customer ? summarizeVisit(customer.wants) : 'full';
    const complained = customer?.complained ?? false;
    let xp: number = outcome === 'full' ? XP.fullPurchase : XP.partialPurchase;
    if (this.dirt.cleanliness() >= XP.cleanBonusThreshold) xp += XP.cleanBonus;
    this.progression.addXp(xp, outcome === 'full' ? 'Полная покупка' : 'Частичная покупка');
    this.reputation.applyVisit(outcome === 'full' ? 'full' : 'partial', complained);
    if (!this.state.tutorial.firstSale) {
      this.state.tutorial.firstSale = true;
    }
    this.events.emit('sale', { customerId: session.customerId, total, items: session.items.length, method: session.method, cogs });
  }

  /** Визит без покупки (нет товара / дорого / не дождался / не вошёл из-за грязи). */
  failedVisit(outcome: Exclude<VisitOutcome, 'full' | 'partial'>, complained = false): void {
    this.reputation.applyVisit(outcome, complained);
    if (outcome === 'refusedDirty') this.state.director.refused++;
  }
}

function startLedgerIfNeeded(state: GameState): void {
  // Леджер дня уже начат в начале дня (день 1 — с новой игры). Обновим стартовую репутацию.
  state.ledger.reputationStart = state.reputation;
}
