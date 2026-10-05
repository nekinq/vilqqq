import { DENOMINATIONS } from '../data/balance';
import type { Rng } from '../core/rng';
import type { CheckoutState } from '../game/state';

/** Чистая логика кассы: сумма, оплата наличными, сдача. */

export function checkoutTotal(c: CheckoutState): number {
  return c.items.reduce((a, it) => a + it.price, 0);
}

export function scannedTotal(c: CheckoutState): number {
  return c.items.filter((it) => it.scanned).reduce((a, it) => a + it.price, 0);
}

export function allScanned(c: CheckoutState): boolean {
  return c.items.length > 0 && c.items.every((it) => it.scanned);
}

/** Сколько даст покупатель наличными: ближайшая «удобная» сумма ≥ итога. */
export function customerCash(total: number, rng: Rng): number {
  if (rng.chance(0.18)) return total; // без сдачи
  const options = [5, 10, 20, 50, 100, 200, 500].filter((v) => v >= total);
  if (options.length === 0) return Math.ceil(total / 100) * 100;
  // Чаще — ближайшая купюра, иногда — следующая.
  const i = rng.chance(0.75) ? 0 : Math.min(options.length - 1, 1);
  // Иногда платят «добором»: 20 + 5 за 23.
  const v = options[i]!;
  if (v - total >= 10 && rng.chance(0.25)) {
    const round5 = Math.ceil(total / 5) * 5;
    return round5;
  }
  return v;
}

export function changeDue(c: CheckoutState): number {
  return Math.max(0, c.cashGiven - checkoutTotal(c));
}

export function changeSelected(c: CheckoutState): number {
  return c.change.reduce((a, v) => a + v, 0);
}

/** Можно ли выдать сдачу точно (сумма выбранного = нужной). */
export function changeExact(c: CheckoutState): boolean {
  return changeSelected(c) === changeDue(c);
}

/** Оптимальная сдача (для подсказки кассира-NPC и тестов). */
export function greedyChange(amount: number): number[] {
  const out: number[] = [];
  let left = amount;
  for (const d of DENOMINATIONS) {
    while (left >= d) {
      out.push(d);
      left -= d;
    }
  }
  return out;
}
