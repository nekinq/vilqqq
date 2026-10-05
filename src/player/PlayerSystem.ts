import * as THREE from 'three';
import type { Game, System } from '../game/Game';
import type { FallbackHandler, Prompt } from './Interaction';
import type { HeldVisual } from './Viewmodel';
import { BALANCE } from '../data/balance';
import { damp } from '../core/math';
import { SHOP_ORIGIN, COUNTER } from '../world/shopLayout';

/**
 * Игрок поверх контроллера: инструменты (1 — руки, 2 — метла), уборка удержанием ЛКМ,
 * действия «без цели» (поставить коробку на пол, бросить доски), режим расстановки,
 * вьюмодель рук и шаги.
 */
export class PlayerSystem implements System {
  private sweeping = false;
  private sweepSound = 0;
  private indoor = 0;
  private lastHeldKind = 'none';

  constructor(private readonly game: Game) {
    game.interaction.fallback = this.fallback();
    game.player.onStep = (surface) => game.audio.play(surface === 'wood' ? 'step_wood' : 'step_ground', { vol: 0.55 });
    game.inputHook = () => {
      if (game.stock.placement) {
        game.stock.handlePlacementInput();
        return true;
      }
      return false;
    };
    game.promptOverride = () => (game.stock.placement ? game.stock.placementPrompt() : null);
  }

  private get sim() {
    return this.game.sim;
  }

  setTool(tool: 'hands' | 'broom'): void {
    const s = this.sim.state;
    if (s.player.tool === tool) return;
    if (tool === 'broom' && s.player.held.kind !== 'none') {
      const what = s.player.held.kind === 'box' ? 'коробку' : s.player.held.kind === 'scanner' ? 'сканер' : s.player.held.kind === 'cash' ? 'деньги' : 'то, что в руках';
      this.game.ui.toast(`Сначала положите ${what}`, 'bad');
      return;
    }
    if (this.game.stock.placement) return;
    s.player.tool = tool;
    this.game.audio.play('pickup', { vol: 0.5 });
  }

  /** Точка, где работает метла: под прицелом (до 1.7 м) или перед игроком. */
  private sweepPoint(point: THREE.Vector3 | null): THREE.Vector3 {
    const pl = this.game.player;
    if (point && Math.hypot(point.x - pl.position.x, point.z - pl.position.z) <= BALANCE.broomReach) return point;
    const f = pl.forward();
    return new THREE.Vector3(pl.position.x + f.x * 1.0, pl.position.y, pl.position.z + f.z * 1.0);
  }

  /** Есть ли что подмести рядом с точкой. */
  private sweepable(p: THREE.Vector3): boolean {
    const r = BALANCE.broomRadius;
    if (this.sim.dirt.nearest(p.x, p.z, r)) return true;
    return this.game.restorationView?.stainNear(p.x, p.z, r) ?? false;
  }

  private fallback(): FallbackHandler {
    const game = this.game;
    return {
      prompt: (point): Prompt | null => {
        const s = this.sim.state;
        const held = s.player.held;
        if (s.player.tool === 'broom' && held.kind === 'none') {
          const p = this.sweepPoint(point);
          if (this.sweepable(p)) return { parts: [{ action: 'hold', text: 'Подмести' }] };
          return null;
        }
        switch (held.kind) {
          case 'box': {
            const b = game.stock.heldBox();
            if (!b) return null;
            const chk = game.stock.floorDropCheck(point);
            const parts: Prompt['parts'] = [];
            if (!b.open) parts.push({ action: 'primary', text: 'Открыть коробку' });
            if (chk.ok) parts.push({ action: 'interact', text: 'Поставить на пол' });
            const note = !chk.ok ? chk.reason : b.open && b.count > 0 ? 'Наведите на полку, чтобы разложить' : b.count === 0 ? 'Пустую коробку — в контейнер у склада' : undefined;
            return { parts, note };
          }
          case 'boards':
            return { parts: [{ action: 'interact', text: held.indices.length > 1 ? 'Бросить доски' : 'Бросить доску' }], note: 'Отнесите в контейнер у склада' };
          case 'trash':
            return { parts: [{ action: 'interact', text: 'Бросить мусор' }], note: 'Отнесите в контейнер у склада' };
          case 'cash':
            return { parts: [], note: 'Положите деньги в кассовый ящик' };
          case 'scanner':
            return { parts: [{ action: 'interact', text: 'Положить сканер' }], note: 'Наведите на товар на прилавке' };
          default:
            return null;
        }
      },
      onInteract: (point) => {
        const held = this.sim.state.player.held;
        if (held.kind === 'box') game.stock.dropHeldBoxOnFloor(point);
        else if (held.kind === 'boards' || held.kind === 'trash') game.restorationView.dropHeld(point);
        else if (held.kind === 'scanner') game.counter.returnScanner();
      },
      onPrimary: () => {
        const held = this.sim.state.player.held;
        if (held.kind === 'box') game.stock.openHeld();
      },
      onPrimaryHold: (dt, point) => {
        const s = this.sim.state;
        if (s.player.tool !== 'broom' || s.player.held.kind !== 'none') return;
        this.sweeping = true;
        const p = this.sweepPoint(point);
        const any = this.sim.dirt.sweep(p.x, p.z, BALANCE.broomRadius, dt * 0.9);
        const st = game.restorationView.scrub(p.x, p.z, BALANCE.broomRadius, dt * 0.5);
        this.sweepSound -= dt;
        if (this.sweepSound <= 0) {
          this.sweepSound = 0.42;
          game.audio.play('broom', { vol: any || st ? 1 : 0.6 });
        }
      },
      onPrimaryRelease: () => {
        this.sweeping = false;
      },
    };
  }

  update(_dt: number, frameDt: number): void {
    const game = this.game;
    const s = this.sim.state;
    if (game.mode === 'play' && game.modals === 0 && !game.stock.placement) {
      if (game.input.wasPressed('hands')) this.setTool('hands');
      if (game.input.wasPressed('broom')) this.setTool('broom');
    }
    if (!game.input.isDown('primary') || game.mode !== 'play' || game.modals > 0) this.sweeping = false;
    // Метёт ли игрок цель (паутину) — анимация та же.
    const sweepingTarget = game.interaction.isHolding && s.player.tool === 'broom' && !!game.interaction.focus;
    // Сканер возвращается на место, если отойти от кассы.
    if (s.player.held.kind === 'scanner') {
      const cx = SHOP_ORIGIN.x + COUNTER.operator.x;
      const cz = SHOP_ORIGIN.z + COUNTER.operator.z;
      if (Math.hypot(game.player.position.x - cx, game.player.position.z - cz) > 3.2) {
        game.counter.returnScanner();
        game.ui.toast('Сканер вернулся на кассу', 'info');
      }
    }
    // Вьюмодель.
    const vm = game.viewmodel;
    let visual: HeldVisual = { kind: 'none' };
    const held = s.player.held;
    if (game.flow.phoneActive) visual = { kind: 'phone' };
    else if (held.kind === 'box') visual = game.stock.heldBoxVisual() ?? { kind: 'none' };
    else if (held.kind === 'scanner') visual = { kind: 'scanner' };
    else if (held.kind === 'boards') visual = { kind: 'boards', n: held.indices.length };
    else if (held.kind === 'trash') visual = { kind: 'trash', n: held.indices.length };
    else if (held.kind === 'cash') visual = { kind: 'cash', amount: held.amount };
    else if (s.player.tool === 'broom') visual = { kind: 'broom' };
    if (game.stock.placement) visual = { kind: 'none' };
    vm.set(visual);
    if (visual.kind !== this.lastHeldKind) this.lastHeldKind = visual.kind;
    vm.sweeping = this.sweeping || sweepingTarget;
    const tag = game.village.floors.tagAt(game.player.position.x, game.player.position.z);
    const inside = tag === 'hall' || tag === 'warehouse' ? 1 : 0;
    this.indoor = damp(this.indoor, inside, 3, frameDt);
    vm.indoor = this.indoor;
    const dn = game.village.dayNight;
    vm.syncLights(dn.sun, dn.hemi, game.scene.environmentIntensity);
    const look = game.input.look;
    vm.update(frameDt, game.player.bob, look.dx, look.dy);
    game.audio.setEnvironment(1 - this.indoor, dn.night);
  }
}
