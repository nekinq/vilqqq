import type { ProductId, LicenseId, SupplierId } from '../data/products';
import type { FurnitureType } from '../data/equipment';
import type { DayLedger, Phase } from './state';

export type MoneyCategory = 'revenue' | 'product' | 'equipment' | 'license' | 'hire' | 'wage';
export type NotifyKind = 'info' | 'good' | 'bad' | 'level';

/** События игры: сервисы публикуют, мир и UI подписываются. */
export interface GameEvents {
  money: { money: number; delta: number; category: MoneyCategory };
  xp: { xp: number; delta: number; level: number; reason: string };
  levelUp: { level: number };
  reputation: { value: number; delta: number };
  cleanliness: { value: number };
  phase: { phase: Phase; day: number };
  dayEnded: { ledger: DayLedger };
  newDay: { day: number };
  section: { key: string };
  sectionsReset: Record<string, never>;
  box: { id: string };
  boxRemoved: { id: string };
  furniture: { id: string };
  furnitureRemoved: { id: string };
  furniturePending: { type: FurnitureType | null };
  license: { id: LicenseId };
  order: { sku: ProductId; boxes: number; total: number; remote: boolean };
  price: { sku: ProductId; price: number };
  notify: { text: string; kind: NotifyKind };
  restoration: { kind: 'board' | 'web' | 'waste' | 'stain'; index: number };
  restorationComplete: Record<string, never>;
  dirt: { id: string; removed: boolean };
  supplierMet: { id: SupplierId };
  sale: { customerId: string; total: number; items: number; method: 'card' | 'cash'; cogs: number };
  staff: { cashier: boolean };
  tutorial: { step: number };
  customerSpawned: { id: string };
  customerRemoved: { id: string };
  checkout: Record<string, never>;
  storyEnding: Record<string, never>;
}
