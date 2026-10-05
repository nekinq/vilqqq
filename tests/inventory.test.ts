import { describe, it, expect } from 'vitest';
import { Sim } from '../src/game/Sim';

function setup() {
  const sim = new Sim();
  sim.state.money = 5000;
  sim.state.level = 4;
  sim.state.licenses = ['dairy'];
  for (const id of ['grocery', 'bakery', 'produce', 'dairy', 'butcher'] as const) sim.orders.meet(id);
  sim.equipment.buy('shelf');
  const shelf = sim.equipment.place('shelf', 0, 0, 0)!;
  return { sim, shelf };
}

describe('сток: раскладка и возврат', () => {
  it('нет дублей и потерь при раскладке и возврате', () => {
    const { sim, shelf } = setup();
    sim.orders.order('bread', 1);
    const box = sim.state.boxes[0]!;
    sim.inventory.openBox(box.id);
    const key = `${shelf.id}#0`;
    for (let i = 0; i < 5; i++) expect(sim.inventory.boxToSection(box.id, key).ok).toBe(true);
    expect(sim.inventory.section(key)!.count).toBe(5);
    expect(box.count).toBe(3);
    for (let i = 0; i < 2; i++) expect(sim.inventory.sectionToBox(key, box.id).ok).toBe(true);
    expect(sim.inventory.section(key)!.count + box.count).toBe(8);
    expect(sim.inventory.check()).toEqual([]);
  });

  it('несовместимое хранение запрещено с причиной; сгущёнка — на обычную полку', () => {
    const { sim, shelf } = setup();
    sim.equipment.buy('fridge');
    sim.orders.order('milk', 1);
    sim.orders.order('condensed_milk', 1);
    const milk = sim.state.boxes.find((b) => b.sku === 'milk')!;
    const cond = sim.state.boxes.find((b) => b.sku === 'condensed_milk')!;
    sim.inventory.openBox(milk.id);
    sim.inventory.openBox(cond.id);
    const r = sim.inventory.boxToSection(milk.id, `${shelf.id}#1`);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('холодильник');
    expect(sim.inventory.boxToSection(cond.id, `${shelf.id}#1`).ok).toBe(true);
  });

  it('одна секция — один SKU', () => {
    const { sim, shelf } = setup();
    sim.orders.order('bread', 1);
    sim.orders.order('water', 1);
    const [b1, b2] = sim.state.boxes;
    sim.inventory.openBox(b1!.id);
    sim.inventory.openBox(b2!.id);
    expect(sim.inventory.boxToSection(b1!.id, `${shelf.id}#0`).ok).toBe(true);
    expect(sim.inventory.boxToSection(b2!.id, `${shelf.id}#0`).ok).toBe(false);
  });

  it('резерв: игрок не может забрать зарезервированное, отмена снимает резерв', () => {
    const { sim, shelf } = setup();
    sim.orders.order('bread', 1);
    const box = sim.state.boxes[0]!;
    sim.inventory.openBox(box.id);
    const key = `${shelf.id}#0`;
    sim.inventory.boxToSection(box.id, key);
    sim.inventory.boxToSection(box.id, key);
    expect(sim.inventory.reserve(key, 5)).toBe(2);
    expect(sim.inventory.sectionToBox(key, box.id).ok).toBe(false);
    sim.inventory.release(key, 1);
    expect(sim.inventory.sectionToBox(key, box.id).ok).toBe(true);
    expect(sim.inventory.pickReserved(key, 1)).toBe(1);
    expect(sim.inventory.section(key)!.count).toBe(0);
    expect(sim.inventory.section(key)!.sku).toBe(null);
    expect(sim.inventory.check()).toEqual([]);
  });

  it('выбросить можно только пустую коробку', () => {
    const { sim } = setup();
    sim.orders.order('bread', 1);
    const box = sim.state.boxes[0]!;
    expect(sim.inventory.discardBox(box.id).ok).toBe(false);
  });
});
