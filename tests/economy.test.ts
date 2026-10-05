import { describe, it, expect } from 'vitest';
import { Sim } from '../src/game/Sim';
import { ledgerProfit, ledgerCashFlow, ReputationService } from '../src/economy/Economy';
import { REP } from '../src/data/progression';
import type { CheckoutState } from '../src/game/state';

function finishRestoration(sim: Sim): void {
  const r = sim.state.restoration;
  r.boards = r.boards.map(() => 'disposed');
  r.webs = r.webs.map(() => true);
  r.waste = r.waste.map(() => 'disposed');
  r.stains = r.stains.map(() => 0);
  r.completedDay = 1;
}

describe('экономика старта', () => {
  it('новая игра: 350 монет, уровень 1, репутация 50, магазин пуст', () => {
    const sim = new Sim();
    expect(sim.state.money).toBe(350);
    expect(sim.state.level).toBe(1);
    expect(sim.state.reputation).toBe(50);
    expect(sim.state.furniture).toHaveLength(0);
  });

  it('плановая первая закупка 180+32+24+16 оставляет 98', () => {
    const sim = new Sim();
    for (const id of ['grocery', 'bakery', 'produce'] as const) sim.orders.meet(id);
    expect(sim.equipment.buy('shelf')).toBe(true);
    expect(sim.orders.order('bread', 1).ok).toBe(true);
    expect(sim.orders.order('water', 1).ok).toBe(true);
    expect(sim.orders.order('apples', 1).ok).toBe(true);
    expect(sim.state.money).toBe(98);
  });

  it('отказ в заказе без денег не меняет баланс', () => {
    const sim = new Sim();
    sim.orders.meet('bakery');
    sim.state.money = 10;
    const r = sim.orders.order('bread', 1);
    expect(r.ok).toBe(false);
    expect(sim.state.money).toBe(10);
    expect(sim.state.boxes).toHaveLength(0);
  });

  it('отказ при заполненной зоне доставки — без списания', () => {
    const sim = new Sim();
    sim.orders.meet('bakery');
    sim.state.money = 10000;
    expect(sim.orders.order('bread', 12).ok).toBe(true);
    const before = sim.state.money;
    const r = sim.orders.order('bread', 1);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('12/12');
    expect(sim.state.money).toBe(before);
  });

  it('леджер: прибыль = выручка − себестоимость − зарплаты; сверка с балансом', () => {
    const sim = new Sim();
    finishRestoration(sim);
    for (const id of ['grocery', 'bakery', 'produce'] as const) sim.orders.meet(id);
    sim.equipment.buy('shelf');
    sim.orders.order('bread', 1);
    sim.orders.order('water', 1);
    sim.orders.order('apples', 1);
    const f = sim.equipment.place('shelf', 0, 0, 0)!;
    // Разложить всё.
    for (const b of [...sim.state.boxes]) {
      sim.inventory.openBox(b.id);
      const sec = `${f.id}#${['bread', 'water', 'apples'].indexOf(b.sku!)}`;
      while (sim.inventory.box(b.id)!.count > 0) expect(sim.inventory.boxToSection(b.id, sec).ok).toBe(true);
    }
    expect(sim.openShift()).toBe(true);
    // Продать все 24 единицы по базовым ценам (как в UI-02).
    const items: CheckoutState['items'] = [];
    let uid = 0;
    for (const sku of ['bread', 'water', 'apples'] as const) for (let i = 0; i < 8; i++) items.push({ uid: uid++, sku, price: sim.price(sku), scanned: true });
    sim.completeSale({ customerId: 'c1', items, stage: 'done', method: 'card', cashGiven: 0, cashTaken: false, drawerOpen: false, change: [], cardConfirmed: true, operator: 'player' }, undefined);
    const L = sim.state.ledger;
    expect(L.revenue).toBe(128);
    expect(L.costOfGoodsSold).toBe(72);
    expect(ledgerProfit(L)).toBe(56);
    expect(L.equipmentPurchases).toBe(180);
    expect(L.productPurchases).toBe(72);
    expect(ledgerCashFlow(L)).toBe(-124);
    expect(sim.state.money).toBe(226);
    expect(L.openingBalance + ledgerCashFlow(L)).toBe(sim.state.money);
  });
});

describe('прогрессия и лицензии', () => {
  it('уровни по порогам, уровень не снижается, +20 за обучение один раз', () => {
    const sim = new Sim();
    sim.progression.addXp(99, 't');
    expect(sim.state.level).toBe(1);
    sim.progression.addXp(1, 't');
    expect(sim.state.level).toBe(2);
    sim.progression.rewardTutorial();
    sim.progression.rewardTutorial();
    expect(sim.state.xp).toBe(120);
    sim.progression.addXp(1700, 't');
    expect(sim.state.level).toBe(6);
  });

  it('лицензия не выдаётся уровнем, только покупается', () => {
    const sim = new Sim();
    sim.progression.addXp(300, 't');
    expect(sim.progression.hasLicense('bakery')).toBe(false);
    expect(sim.orders.availability('buns').ok).toBe(false);
    sim.state.money = 1000;
    expect(sim.progression.buyLicense('bakery', sim.economy)).toBe(true);
    expect(sim.orders.availability('buns').ok).toBe(true);
    expect(sim.state.ledger.licensePurchases).toBe(100);
  });

  it('причины блокировки: уровень, лицензия, холодильник', () => {
    const sim = new Sim();
    const r = sim.orders.availability('milk');
    expect(r.reasons).toContain('Нужен уровень 3');
    expect(r.reasons).toContain('Нужна лицензия «Молочная»');
    expect(r.reasons).toContain('Нужен холодильник');
  });

  it('дистанционный заказ: уровень 4 + знакомство 5/5', () => {
    const sim = new Sim();
    expect(sim.orders.remoteBlockers().length).toBe(2);
    sim.progression.addXp(650, 't');
    for (const id of ['grocery', 'bakery', 'produce', 'dairy', 'butcher'] as const) sim.orders.meet(id);
    expect(sim.orders.remoteBlockers()).toEqual([]);
  });
});

describe('репутация', () => {
  it('одна главная проблема за визит, без накопления', () => {
    expect(ReputationService.visitDelta('full', false)).toBe(REP.full);
    expect(ReputationService.visitDelta('missing', true)).toBe(REP.missing);
    expect(ReputationService.visitDelta('expensive', true)).toBe(REP.dirtComplaint);
    expect(ReputationService.visitDelta('full', true)).toBeCloseTo(REP.full + REP.dirtComplaint);
  });

  it('границы 0–100', () => {
    const sim = new Sim();
    for (let i = 0; i < 200; i++) sim.reputation.add(1);
    expect(sim.state.reputation).toBe(100);
    for (let i = 0; i < 300; i++) sim.reputation.add(-1);
    expect(sim.state.reputation).toBe(0);
  });
});
