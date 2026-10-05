import type { Ctx, EconomyService } from '../economy/Economy';
import type { InventoryService } from '../inventory/Inventory';
import { FURNITURE, type FurnitureType } from '../data/equipment';
import { STAFF } from '../data/progression';
import { nextId, type FurnitureState } from '../game/state';

/** Покупка, расстановка и перестановка мебели; персонал (кассир). */
export class EquipmentService {
  constructor(
    private readonly ctx: Ctx,
    private readonly economy: EconomyService,
    private readonly inventory: InventoryService,
  ) {}

  count(type: FurnitureType): number {
    const s = this.ctx.state;
    return s.furniture.filter((f) => f.type === type).length + s.pendingFurniture.filter((t) => t === type).length;
  }

  buyBlockers(type: FurnitureType): string[] {
    const s = this.ctx.state;
    const d = FURNITURE[type];
    const out: string[] = [];
    if (s.level < d.level) out.push(`Нужен уровень ${d.level}`);
    if (s.phase !== 'preparation') out.push('Только во время подготовки');
    if (this.count(type) >= d.max) out.push(`Максимум ${d.max} шт.`);
    if (s.money < d.price) out.push(`Не хватает ${d.price - s.money} монет`);
    return out;
  }

  buy(type: FurnitureType): boolean {
    if (this.buyBlockers(type).length) return false;
    if (!this.economy.spend(FURNITURE[type].price, 'equipment')) return false;
    this.ctx.state.pendingFurniture.push(type);
    this.ctx.events.emit('furniturePending', { type });
    this.ctx.events.emit('notify', { text: `Куплено: ${FURNITURE[type].title}. Поставьте в магазине`, kind: 'good' });
    return true;
  }

  /** Поставить купленное (валидация места — в мире). */
  place(type: FurnitureType, x: number, z: number, rotY: number): FurnitureState | null {
    const s = this.ctx.state;
    const i = s.pendingFurniture.indexOf(type);
    if (i < 0) return null;
    s.pendingFurniture.splice(i, 1);
    const f: FurnitureState = { id: nextId(s, 'f'), type, x, z, rotY };
    s.furniture.push(f);
    this.inventory.createSections(f);
    this.ctx.events.emit('furniture', { id: f.id });
    this.ctx.events.emit('furniturePending', { type: s.pendingFurniture[0] ?? null });
    return f;
  }

  /** Переставить: товар остаётся в секциях. */
  move(id: string, x: number, z: number, rotY: number): boolean {
    const f = this.ctx.state.furniture.find((q) => q.id === id);
    if (!f) return false;
    f.x = x;
    f.z = z;
    f.rotY = rotY;
    this.ctx.events.emit('furniture', { id });
    return true;
  }

  /** Есть ли резервы покупателей на мебели (тогда переставлять нельзя). */
  busy(id: string): boolean {
    for (const [k, sec] of Object.entries(this.ctx.state.sections)) if (k.startsWith(`${id}#`) && sec.reserved > 0) return true;
    return false;
  }

  // ───────── Персонал ─────────

  cashierBlockers(): string[] {
    const s = this.ctx.state;
    const out: string[] = [];
    if (s.cashierHired) out.push('Кассир уже работает');
    if (s.level < STAFF.cashier.level) out.push(`Нужен уровень ${STAFF.cashier.level}`);
    if (s.phase !== 'preparation') out.push('Только во время подготовки');
    if (s.money < STAFF.cashier.hireFee) out.push(`Не хватает ${STAFF.cashier.hireFee - s.money} монет`);
    return out;
  }

  hireCashier(): boolean {
    if (this.cashierBlockers().length) return false;
    if (!this.economy.spend(STAFF.cashier.hireFee, 'hire')) return false;
    this.ctx.state.cashierHired = true;
    this.ctx.events.emit('staff', { cashier: true });
    this.ctx.events.emit('notify', { text: 'Кассир нанят: 25 монет за смену', kind: 'good' });
    return true;
  }

  fireCashier(): boolean {
    const s = this.ctx.state;
    if (!s.cashierHired || s.phase !== 'preparation') return false;
    s.cashierHired = false;
    this.ctx.events.emit('staff', { cashier: false });
    return true;
  }
}
