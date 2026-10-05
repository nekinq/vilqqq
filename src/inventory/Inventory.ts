import type { Ctx } from '../economy/Economy';
import type { BoxState, BoxLoc, SectionState, FurnitureState } from '../game/state';
import { nextId, sectionKey, parseSectionKey } from '../game/state';
import { PRODUCTS, BOX_SIZE, type ProductId, type StorageType } from '../data/products';
import { FURNITURE } from '../data/equipment';
import { BALANCE } from '../data/balance';

export const SECTION_CAPACITY = 8;

export type StockResult = { ok: true } | { ok: false; reason: string };

/**
 * Сток магазина. Единый источник истины:
 *  - секции: логический сток (count) и резерв (reserved), один SKU на секцию;
 *  - коробки: SKU, количество, открыта ли, где лежит.
 * Инварианты: 0 ≤ reserved ≤ count ≤ 8; sku === null ⇔ count === 0.
 */
export class InventoryService {
  constructor(private readonly ctx: Ctx) {}

  private get s() {
    return this.ctx.state;
  }

  // ───────── Секции ─────────

  section(key: string): SectionState | undefined {
    return this.s.sections[key];
  }

  storageOf(key: string): StorageType | null {
    const { furnitureId } = parseSectionKey(key);
    const f = this.s.furniture.find((x) => x.id === furnitureId);
    return f ? FURNITURE[f.type].storage : null;
  }

  furnitureOf(key: string): FurnitureState | undefined {
    const { furnitureId } = parseSectionKey(key);
    return this.s.furniture.find((x) => x.id === furnitureId);
  }

  /** Создать секции для новой мебели. */
  createSections(f: FurnitureState): void {
    const n = FURNITURE[f.type].sections;
    for (let i = 0; i < n; i++) this.s.sections[sectionKey(f.id, i)] = { sku: null, count: 0, reserved: 0 };
  }

  available(key: string): number {
    const sec = this.s.sections[key];
    return sec ? sec.count - sec.reserved : 0;
  }

  /** Можно ли положить единицу SKU в секцию. */
  canStock(key: string, sku: ProductId): StockResult {
    const sec = this.s.sections[key];
    if (!sec) return { ok: false, reason: 'Нет такой секции' };
    const storage = this.storageOf(key);
    const need = PRODUCTS[sku].storage;
    if (storage !== need) {
      const where = need === 'chilled' ? 'в холодильник' : need === 'frozen' ? 'в морозильник' : 'на обычную полку';
      return { ok: false, reason: `${PRODUCTS[sku].name}: только ${where}` };
    }
    if (sec.sku !== null && sec.sku !== sku) return { ok: false, reason: `Секция занята: ${PRODUCTS[sec.sku].name}` };
    if (sec.count >= SECTION_CAPACITY) return { ok: false, reason: 'Секция заполнена' };
    return { ok: true };
  }

  /** Переложить единицу из коробки в секцию. */
  boxToSection(boxId: string, key: string): StockResult {
    const box = this.box(boxId);
    if (!box) return { ok: false, reason: 'Нет коробки' };
    if (!box.open) return { ok: false, reason: 'Коробка закрыта' };
    if (!box.sku || box.count <= 0) return { ok: false, reason: 'Коробка пуста' };
    const chk = this.canStock(key, box.sku);
    if (!chk.ok) return chk;
    const sec = this.s.sections[key]!;
    const sku = box.sku;
    box.count--;
    if (box.count === 0) box.sku = null;
    sec.sku = sku;
    sec.count++;
    if (!this.s.everStocked.includes(sku)) this.s.everStocked.push(sku);
    this.ctx.events.emit('box', { id: box.id });
    this.ctx.events.emit('section', { key });
    return { ok: true };
  }

  /** Вернуть единицу с полки в коробку (только незарезервированные). */
  sectionToBox(key: string, boxId: string): StockResult {
    const sec = this.s.sections[key];
    const box = this.box(boxId);
    if (!sec || !box) return { ok: false, reason: 'Нет секции или коробки' };
    if (!box.open) return { ok: false, reason: 'Сначала откройте коробку' };
    if (!sec.sku || sec.count - sec.reserved <= 0) return { ok: false, reason: sec.reserved > 0 ? 'Товар уже берут покупатели' : 'Секция пуста' };
    if (box.sku !== null && box.sku !== sec.sku) return { ok: false, reason: `В коробке другой товар: ${PRODUCTS[box.sku].name}` };
    if (box.count >= BOX_SIZE) return { ok: false, reason: 'Коробка полная' };
    box.sku = sec.sku;
    box.count++;
    sec.count--;
    if (sec.count === 0) sec.sku = null;
    this.ctx.events.emit('box', { id: box.id });
    this.ctx.events.emit('section', { key });
    return { ok: true };
  }

  /** Секции, где есть доступный товар SKU. */
  sectionsWith(sku: ProductId): string[] {
    const out: string[] = [];
    for (const [k, sec] of Object.entries(this.s.sections)) if (sec.sku === sku && sec.count - sec.reserved > 0) out.push(k);
    return out;
  }

  /** Ассортимент: SKU, которые лежат сейчас или когда-либо лежали на полках. */
  assortment(): ProductId[] {
    return [...this.s.everStocked];
  }

  totalOnShelves(sku?: ProductId): number {
    let n = 0;
    for (const sec of Object.values(this.s.sections)) if (!sku || sec.sku === sku) n += sec.count;
    return n;
  }

  reserve(key: string, qty: number): number {
    const sec = this.s.sections[key];
    if (!sec) return 0;
    const n = Math.max(0, Math.min(qty, sec.count - sec.reserved));
    sec.reserved += n;
    return n;
  }

  release(key: string, qty: number): void {
    const sec = this.s.sections[key];
    if (!sec) return;
    sec.reserved = Math.max(0, sec.reserved - qty);
  }

  /** Покупатель забирает зарезервированные единицы. */
  pickReserved(key: string, qty: number): number {
    const sec = this.s.sections[key];
    if (!sec) return 0;
    const n = Math.max(0, Math.min(qty, sec.reserved, sec.count));
    sec.reserved -= n;
    sec.count -= n;
    if (sec.count === 0) sec.sku = null;
    if (n > 0) this.ctx.events.emit('section', { key });
    return n;
  }

  /** Вернуть единицы на полку (покупатель бросил корзину). Возвращает, сколько не влезло. */
  returnToSection(key: string, sku: ProductId, qty: number): number {
    const sec = this.s.sections[key];
    if (!sec || (sec.sku && sec.sku !== sku)) return qty;
    const room = SECTION_CAPACITY - sec.count;
    const n = Math.min(room, qty);
    if (n > 0) {
      sec.sku = sku;
      sec.count += n;
      this.ctx.events.emit('section', { key });
    }
    return qty - n;
  }

  // ───────── Коробки ─────────

  box(id: string): BoxState | undefined {
    return this.s.boxes.find((b) => b.id === id);
  }

  boxesAt(kind: BoxLoc['kind']): BoxState[] {
    return this.s.boxes.filter((b) => b.loc.kind === kind);
  }

  createBox(sku: ProductId | null, count: number, loc: BoxLoc): BoxState {
    const b: BoxState = { id: nextId(this.s, 'box'), sku: count > 0 ? sku : null, count, open: false, loc };
    this.s.boxes.push(b);
    this.ctx.events.emit('box', { id: b.id });
    return b;
  }

  moveBox(id: string, loc: BoxLoc): void {
    const b = this.box(id);
    if (!b) return;
    b.loc = loc;
    this.ctx.events.emit('box', { id });
  }

  openBox(id: string): void {
    const b = this.box(id);
    if (!b || b.open) return;
    b.open = true;
    this.ctx.events.emit('box', { id });
  }

  /** Удалить (выбросить) коробку. Только пустую. */
  discardBox(id: string): StockResult {
    const b = this.box(id);
    if (!b) return { ok: false, reason: 'Нет коробки' };
    if (b.count > 0) return { ok: false, reason: 'Коробка не пустая' };
    this.s.boxes = this.s.boxes.filter((x) => x.id !== id);
    this.ctx.events.emit('boxRemoved', { id });
    return { ok: true };
  }

  freeDeliverySlots(): number[] {
    const used = new Set(this.boxesAt('delivery').map((b) => (b.loc as { slot: number }).slot));
    const out: number[] = [];
    for (let i = 0; i < BALANCE.deliverySlots; i++) if (!used.has(i)) out.push(i);
    return out;
  }

  freeRackSlots(furnitureId: string): number[] {
    const f = this.s.furniture.find((x) => x.id === furnitureId);
    if (!f) return [];
    const n = FURNITURE[f.type].boxSlots;
    const used = new Set(this.s.boxes.filter((b) => b.loc.kind === 'rack' && b.loc.furnitureId === furnitureId).map((b) => (b.loc as { slot: number }).slot));
    const out: number[] = [];
    for (let i = 0; i < n; i++) if (!used.has(i)) out.push(i);
    return out;
  }

  /** Сколько единиц SKU есть в коробках (на складе, в доставке, на полу). */
  inBoxes(sku: ProductId): number {
    return this.s.boxes.filter((b) => b.sku === sku).reduce((a, b) => a + b.count, 0);
  }

  /** Проверка инвариантов (для тестов и отладки). */
  check(): string[] {
    const errs: string[] = [];
    for (const [k, sec] of Object.entries(this.s.sections)) {
      if (sec.reserved < 0 || sec.reserved > sec.count) errs.push(`${k}: reserved ${sec.reserved} / count ${sec.count}`);
      if (sec.count < 0 || sec.count > SECTION_CAPACITY) errs.push(`${k}: count ${sec.count}`);
      if ((sec.sku === null) !== (sec.count === 0)) errs.push(`${k}: sku ${sec.sku} count ${sec.count}`);
    }
    for (const b of this.s.boxes) {
      if (b.count < 0 || b.count > BOX_SIZE) errs.push(`${b.id}: count ${b.count}`);
      if ((b.sku === null) !== (b.count === 0)) errs.push(`${b.id}: sku ${b.sku} count ${b.count}`);
    }
    const slots = this.boxesAt('delivery').map((b) => (b.loc as { slot: number }).slot);
    if (new Set(slots).size !== slots.length) errs.push('Две коробки в одном месте доставки');
    if (this.s.boxes.filter((b) => b.loc.kind === 'held').length > 1) errs.push('В руках больше одной коробки');
    return errs;
  }
}
