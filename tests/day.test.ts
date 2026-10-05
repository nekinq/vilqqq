import { describe, it, expect } from 'vitest';
import { Sim } from '../src/game/Sim';
import { CustomerDirector, buyChance, makeShoppingList, summarizeVisit } from '../src/customers/Director';
import { Rng } from '../src/core/rng';
import { changeDue, changeExact, greedyChange, customerCash } from '../src/checkout/Checkout';
import { entryChance } from '../src/data/progression';

function ready(sim: Sim) {
  const r = sim.state.restoration;
  r.boards = r.boards.map(() => 'disposed');
  r.webs = r.webs.map(() => true);
  r.waste = r.waste.map(() => 'disposed');
  r.stains = r.stains.map(() => 0);
  sim.state.money = 1000;
  sim.equipment.buy('shelf');
  sim.equipment.place('shelf', 0, 0, 0);
}

describe('день', () => {
  it('смену нельзя открыть до реставрации', () => {
    const sim = new Sim();
    expect(sim.openBlockers()).toContain('Сначала приберитесь в магазине');
    expect(sim.openShift()).toBe(false);
  });

  it('подготовка: часы стоят; смена: 900 с = 08:00→23:00; затем отчёт', () => {
    const sim = new Sim();
    ready(sim);
    sim.update(100, false);
    expect(sim.state.minutes).toBe(480);
    expect(sim.openShift()).toBe(true);
    for (let i = 0; i < 899; i++) sim.update(1, true);
    expect(sim.state.phase).toBe('open');
    sim.update(1, true);
    expect(sim.state.phase).toBe('closing');
    sim.update(1, false);
    expect(sim.state.phase).toBe('report');
  });

  it('раннее закрытие не перематывает часы к 23:00', () => {
    const sim = new Sim();
    ready(sim);
    sim.openShift();
    sim.update(60, true);
    sim.closeShift();
    sim.update(1, false);
    expect(sim.state.phase).toBe('report');
    expect(sim.state.minutes).toBeLessThan(23 * 60);
  });

  it('«Начать новый день» срабатывает один раз', () => {
    const sim = new Sim();
    ready(sim);
    sim.openShift();
    sim.closeShift();
    sim.update(1, false);
    const token = sim.state.dayToken;
    expect(sim.startNewDay(token)).toBe(true);
    expect(sim.startNewDay(token)).toBe(false);
    expect(sim.state.day).toBe(2);
  });

  it('зарплата кассира списывается за смену', () => {
    const sim = new Sim();
    ready(sim);
    sim.state.level = 3;
    expect(sim.equipment.hireCashier()).toBe(true);
    const m = sim.state.money;
    sim.openShift();
    sim.closeShift();
    sim.update(1, false);
    expect(sim.state.money).toBe(m - 25);
    expect(sim.state.history[0]!.wages).toBe(25);
  });
});

describe('покупатели', () => {
  it('число визитов по уровню и репутации', () => {
    const rng = new Rng(5);
    for (let i = 0; i < 50; i++) {
      const n = CustomerDirector.plannedVisits(1, 50, rng);
      expect(n).toBeGreaterThanOrEqual(8);
      expect(n).toBeLessThanOrEqual(12);
    }
    expect(CustomerDirector.plannedVisits(6, 100, new Rng(1))).toBeGreaterThan(48);
  });

  it('план дня распределён по смене и отсортирован', () => {
    const sim = new Sim();
    ready(sim);
    sim.openShift();
    const plan = sim.state.director.plan;
    expect(plan.length).toBeGreaterThanOrEqual(8);
    for (let i = 1; i < plan.length; i++) expect(plan[i]!).toBeGreaterThanOrEqual(plan[i - 1]!);
    expect(plan[plan.length - 1]!).toBeLessThan(23 * 60);
  });

  it('лимит одновременных покупателей', () => {
    const sim = new Sim();
    ready(sim);
    sim.openShift();
    sim.state.minutes = 23 * 60 - 30;
    expect(sim.director.due(3)).toBe(false);
    expect(sim.director.due(0)).toBe(true);
  });

  it('решение о цене скрыто и монотонно', () => {
    expect(buyChance(7, 7, 50)).toBe(1);
    expect(buyChance(9, 7, 50)).toBeLessThan(1);
    expect(buyChance(20, 7, 50)).toBeLessThan(0.05);
  });

  it('список покупок только из ассортимента', () => {
    const list = makeShoppingList(new Rng(3), ['bread', 'water'], 3);
    expect(list.length).toBeGreaterThan(0);
    for (const w of list) expect(['bread', 'water']).toContain(w.sku);
  });

  it('итог визита', () => {
    expect(summarizeVisit([{ sku: 'bread', qty: 1, result: 'taken', taken: 1 }])).toBe('full');
    expect(summarizeVisit([{ sku: 'bread', qty: 1, result: 'taken', taken: 1 }, { sku: 'water', qty: 1, result: 'missing', taken: 0 }])).toBe('partial');
    expect(summarizeVisit([{ sku: 'water', qty: 1, result: 'missing', taken: 0 }])).toBe('missing');
  });

  it('вход по чистоте', () => {
    expect(entryChance(90)).toBe(1);
    expect(entryChance(70)).toBe(0.9);
    expect(entryChance(40)).toBe(0.65);
    expect(entryChance(20)).toBe(0);
  });
});

describe('касса', () => {
  it('сдача точная', () => {
    const c = { customerId: 'x', items: [{ uid: 1, sku: 'bread' as const, price: 7, scanned: true }, { uid: 2, sku: 'apples' as const, price: 7, scanned: true }], stage: 'payment' as const, method: 'cash' as const, cashGiven: 20, cashTaken: true, drawerOpen: true, change: [5], cardConfirmed: false, operator: 'player' as const };
    expect(changeDue(c)).toBe(6);
    expect(changeExact(c)).toBe(false);
    c.change.push(1);
    expect(changeExact(c)).toBe(true);
    expect(greedyChange(36)).toEqual([20, 10, 5, 1]);
  });

  it('покупатель даёт не меньше суммы', () => {
    const rng = new Rng(9);
    for (let t = 1; t < 300; t += 7) expect(customerCash(t, rng)).toBeGreaterThanOrEqual(t);
  });
});
