import type { Game } from './Game';
import type { Action } from '../core/Settings';
import type { ProductId } from '../data/products';
import type { FurnitureType } from '../data/equipment';

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
    spawnCustomer() {
      return game.customers.debugSpawn();
    },
    skipTutorial() {
      const t = game.sim.state.tutorial;
      t.done = true;
      t.rewarded = true;
    },
    errors: [] as string[],
  };
  window.addEventListener('error', (e) => api.errors.push(String(e.message)));
  window.addEventListener('unhandledrejection', (e) => api.errors.push(String((e as PromiseRejectionEvent).reason)));
  (window as unknown as { __game: typeof api }).__game = api;
}
