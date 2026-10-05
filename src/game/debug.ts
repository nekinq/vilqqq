import type { Game } from './Game';
import type { Action } from '../core/Settings';
import type { ProductId } from '../data/products';
import type { FurnitureType } from '../data/equipment';
import { RESTORATION, SHOP_ORIGIN, FLOOR_Y, DUMPSTER, deliverySlots } from '../world/shopLayout';

/**
 * Отладочный API для автотестов и скриншотов: window.__game.
 * Не влияет на обычную игру (ничего не делает, пока его не вызвали).
 */
export function installDebug(game: Game): void {
  const api = {
    game,
    get sim() {
      return game.sim;
    },
    get state() {
      return game.sim.state;
    },
    get frame() {
      return game.loop.frameNo;
    },
    get fps() {
      return game.loop.fps;
    },
    teleport(x: number, z: number, yaw?: number, pitch?: number) {
      game.player.teleport(x, z, yaw, pitch);
    },
    look(x: number, y: number, z: number) {
      game.player.lookAt(x, y, z);
    },
    /** Нажать действие на один кадр (или удерживать sec секунд). */
    press(action: Action, sec = 0) {
      const code = game.settings.data.controls.bindings[action]?.[0];
      if (!code) return;
      game.input.inject(code, true);
      setTimeout(() => game.input.inject(code, false), Math.max(30, sec * 1000));
    },
    hold(action: Action, down: boolean) {
      const code = game.settings.data.controls.bindings[action]?.[0];
      if (code) game.input.inject(code, down);
    },
    focus() {
      const f = game.interaction.focus;
      return f ? { id: f.id, prompt: game.interaction.currentPrompt } : { id: null, prompt: game.interaction.currentPrompt };
    },
    money(n: number) {
      game.sim.state.money = n;
    },
    time(min: number) {
      game.sim.state.minutes = min;
    },
    /** Мгновенная реставрация (для тестов дальнейших этапов). */
    restore() {
      const sim = game.sim;
      const r = sim.state.restoration;
      r.boards = r.boards.map(() => 'disposed');
      r.webs = r.webs.map(() => true);
      r.waste = r.waste.map(() => 'disposed');
      r.stains = r.stains.map(() => 0);
      r.completedDay = sim.state.day;
      sim.events.emit('restoration', { kind: 'board', index: 0 });
      sim.events.emit('restorationComplete', {});
    },
    meetAll() {
      for (const id of ['grocery', 'bakery', 'produce', 'dairy', 'butcher'] as const) game.sim.orders.meet(id);
      game.sim.state.tutorial.reachedShop = true;
    },
    placeFurniture(type: FurnitureType, x: number, z: number, rotY = 0) {
      if (!game.sim.state.pendingFurniture.includes(type)) game.sim.state.pendingFurniture.push(type);
      return game.sim.equipment.place(type, x, z, rotY)?.id ?? null;
    },
    order(sku: ProductId, boxes = 1) {
      return game.sim.orders.order(sku, boxes);
    },
    /** Разложить товар прямо в секцию (без анимации). */
    stock(sku: ProductId, key: string, n = 8) {
      const inv = game.sim.inventory;
      const b = inv.createBox(sku, n, { kind: 'floor', x: 0, y: -50, z: 0, rotY: 0 });
      inv.openBox(b.id);
      for (let i = 0; i < n; i++) inv.boxToSection(b.id, key);
      inv.discardBox(b.id);
    },
    openShift() {
      return game.flow.openShift();
    },
    spawnCustomer(x?: number, z?: number) {
      return game.customers.debugSpawn(x !== undefined && z !== undefined ? [x, z] : undefined);
    },
    skipTutorial() {
      const t = game.sim.state.tutorial;
      t.done = true;
      t.rewarded = true;
    },
    /** Точки для прицеливания автотестов (мировые координаты). */
    targets() {
      const OX = SHOP_ORIGIN.x;
      const OZ = SHOP_ORIGIN.z;
      const r = game.sim.state.restoration;
      const vendors: Record<string, { stand: { x: number; z: number }; look: { x: number; y: number; z: number } }> = {};
      for (const [id, sp] of game.village.supplierSpots) vendors[id] = { stand: { x: sp.customer.x, z: sp.customer.z }, look: { x: sp.vendor.x, y: 1.3, z: sp.vendor.z } };
      return {
        vendors,
        boards: RESTORATION.boards.map((b, i) => (r.boards[i] === 'loose' && r.boardPos[i] ? { x: r.boardPos[i]!.x, y: r.boardPos[i]!.y + 0.03, z: r.boardPos[i]!.z, state: 'loose' } : { x: OX + b.x, y: b.y, z: OZ + b.z, state: r.boards[i] })),
        webs: RESTORATION.webs.map((w) => {
          const c = Math.cos(w.rotY);
          const sn = Math.sin(w.rotY);
          return { x: OX + w.x + 0.45 * w.s * c, y: w.y - 0.45 * w.s, z: OZ + w.z - 0.45 * w.s * sn };
        }),
        waste: RESTORATION.waste.map((w, i) => {
          const p = r.wastePos[i];
          return p ? { x: p.x, y: p.y + 0.3, z: p.z } : { x: OX + w.x, y: FLOOR_Y + 0.3, z: OZ + w.z };
        }),
        stains: RESTORATION.stains.map((st) => ({ x: OX + st.x, y: FLOOR_Y, z: OZ + st.z })),
        dumpster: { x: DUMPSTER.x, y: 0.9, z: DUMPSTER.z },
        delivery: deliverySlots().map((p) => ({ x: OX + p.x, y: p.y + 0.15, z: OZ + p.z })),
      };
    },
    /** Мировая точка места товара в секции и точка доступа. */
    section(key: string) {
      const slot = game.stock.slotWorld(key, 0);
      const acc = game.stock.accessPoint(key);
      return slot && acc ? { slot: { x: slot.x, y: slot.y, z: slot.z }, access: { x: acc.x, z: acc.z } } : null;
    },
    errors: [] as string[],
  };
  window.addEventListener('error', (e) => api.errors.push(String(e.message)));
  window.addEventListener('unhandledrejection', (e) => api.errors.push(String((e as PromiseRejectionEvent).reason)));
  (window as unknown as { __game: typeof api }).__game = api;
}
