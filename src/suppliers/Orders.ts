import type { Ctx, EconomyService, ProgressionService } from '../economy/Economy';
import type { InventoryService } from '../inventory/Inventory';
import { PRODUCTS, boxPrice, type ProductId, type SupplierId } from '../data/products';
import { LICENSES } from '../data/licenses';
import { SUPPLIERS } from '../data/suppliers';
import { FURNITURE } from '../data/equipment';

export interface Availability {
  ok: boolean;
  reasons: string[];
}

export type OrderResult = { ok: true; total: number; boxes: number } | { ok: false; reason: string };

/**
 * Заказ у поставщика: требования (уровень, лицензия, холод/мороз), деньги, места доставки.
 * Если мест не хватает — отказ без списания денег. Время не останавливается.
 */
export class OrderService {
  constructor(
    private readonly ctx: Ctx,
    private readonly economy: EconomyService,
    private readonly progression: ProgressionService,
    private readonly inventory: InventoryService,
  ) {}

  private hasStorage(kind: 'chilled' | 'frozen'): boolean {
    const s = this.ctx.state;
    const placed = s.furniture.some((f) => FURNITURE[f.type].storage === kind);
    const pending = s.pendingFurniture.some((t) => FURNITURE[t].storage === kind);
    return placed || pending;
  }

  /** Можно ли заказывать товар (без учёта денег и мест). Причины — для каталога. */
  availability(sku: ProductId): Availability {
    const p = PRODUCTS[sku];
    const reasons: string[] = [];
    if (p.licenseId) {
      const lic = LICENSES[p.licenseId];
      if (this.ctx.state.level < lic.level) reasons.push(`Нужен уровень ${lic.level}`);
      if (!this.progression.hasLicense(p.licenseId)) reasons.push(`Нужна лицензия «${lic.title}»`);
    }
    if (p.storage === 'chilled' && !this.hasStorage('chilled')) reasons.push('Нужен холодильник');
    if (p.storage === 'frozen' && !this.hasStorage('frozen')) reasons.push('Нужен морозильник');
    return { ok: reasons.length === 0, reasons };
  }

  metAll(): boolean {
    return this.ctx.state.suppliersMet.length >= 5;
  }

  /** Дистанционный заказ: уровень 4 и знакомство со всеми пятью. */
  remoteBlockers(): string[] {
    const out: string[] = [];
    if (this.ctx.state.level < 4) out.push('Нужен уровень 4');
    if (!this.metAll()) out.push(`Знакомство с поставщиками ${this.ctx.state.suppliersMet.length}/5`);
    return out;
  }

  meet(id: SupplierId): boolean {
    const s = this.ctx.state;
    if (s.suppliersMet.includes(id)) return false;
    s.suppliersMet.push(id);
    this.ctx.events.emit('supplierMet', { id });
    return true;
  }

  order(sku: ProductId, boxes: number, remote = false): OrderResult {
    const s = this.ctx.state;
    if (!Number.isInteger(boxes) || boxes < 1) return { ok: false, reason: 'Выберите количество коробок' };
    if (s.phase === 'report') return { ok: false, reason: 'День закончен' };
    const p = PRODUCTS[sku];
    if (remote && this.remoteBlockers().length) return { ok: false, reason: this.remoteBlockers()[0]! };
    if (!remote && !s.suppliersMet.includes(p.supplierId)) return { ok: false, reason: `Сначала познакомьтесь: ${SUPPLIERS[p.supplierId].title}` };
    const av = this.availability(sku);
    if (!av.ok) return { ok: false, reason: av.reasons[0]! };
    const total = boxPrice(sku) * boxes;
    const slots = this.inventory.freeDeliverySlots();
    if (slots.length < boxes) return { ok: false, reason: slots.length === 0 ? 'Зона доставки заполнена (12/12)' : `В зоне доставки свободно только ${slots.length} из 12` };
    if (!this.economy.canAfford(total)) return { ok: false, reason: `Не хватает ${total - s.money} монет` };
    if (!this.economy.spend(total, 'product')) return { ok: false, reason: 'Не хватает денег' };
    for (let i = 0; i < boxes; i++) this.inventory.createBox(sku, p.boxSize, { kind: 'delivery', slot: slots[i]! });
    this.ctx.events.emit('order', { sku, boxes, total, remote });
    return { ok: true, total, boxes };
  }
}
