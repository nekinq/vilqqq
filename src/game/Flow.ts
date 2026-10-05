import * as THREE from 'three';
import type { Game, System } from './Game';
import { newGameState, type GameState } from './state';
import { Intro } from './Intro';
import type { SaveKey } from '../save/SaveManager';
import { SLOT_LABEL } from '../save/SaveManager';
import { SUPPLIERS } from '../data/suppliers';
import { PRODUCTS, type ProductId, type SupplierId } from '../data/products';
import { BALANCE } from '../data/balance';
import { LICENSES, LICENSE_ORDER } from '../data/licenses';
import { FURNITURE, FURNITURE_ORDER } from '../data/equipment';
import { STAFF } from '../data/progression';
import { PLAYER_ARRIVAL } from '../world/layout';
import { SHOP_ORIGIN, RESTORATION, FLOOR_Y, DUMPSTER, DELIVERY_PALLETS, COUNTER } from '../world/shopLayout';
import type { Line } from '../ui/Dialogue';

const GRANDMA = 'Бабушка';

const CALL_INTRO: Line[] = [
  { who: GRANDMA, text: 'Алло! Солнышко, это бабушка. Ты уже в Дубравке? Как же я рада!' },
  { who: GRANDMA, text: 'Мой магазинчик у площади совсем зарос. Сил у меня теперь мало, сама не справляюсь…' },
  { who: GRANDMA, text: 'А так хочется снова увидеть, как в нём толпится народ.' },
  { who: GRANDMA, text: 'Сначала познакомься с соседями — Фёдор, Марина, Степан, Валя и Борис. Без них товара не будет.' },
  { who: GRANDMA, text: 'Я оставила тебе 350 монет. Немного, но на первый стеллаж и товар хватит.' },
  { who: GRANDMA, text: 'И главное — приберись: доски с окон, паутину, мусор — всё долой.' },
  { who: GRANDMA, text: 'И не открывайся, пока всё не будет готово. Первое впечатление покупатели помнят долго. Целую!' },
];

const CALL_ENDING: Line[] = [
  { who: GRANDMA, text: 'Солнышко! Мне всё рассказали — у тебя очередь до самой площади!' },
  { who: GRANDMA, text: 'Магазин снова живой — и всё благодаря тебе. Я тобой горжусь.' },
  { who: GRANDMA, text: 'Магазин теперь твой. А я завтра зайду за булочками!' },
];

/** Порядок знакомства (маршрут маркера). */
const MEET_ROUTE: SupplierId[] = ['grocery', 'bakery', 'produce', 'dairy', 'butcher'];
const STARTER: ProductId[] = ['bread', 'water', 'apples'];

interface Call {
  lines: Line[];
  i: number;
  t: number;
  ring: number;
  onDone: () => void;
}

/**
 * Поток игры: главное меню (живой фон), новая игра → интро → звонок бабушки → обучение (цель в HUD
 * и маркер в мире), смены и итоги дня, автосохранение, финал истории.
 */
export class Flow implements System {
  phoneActive = false;
  private intro: Intro | null = null;
  private call: Call | null = null;
  private menuT = 0;
  private autosaveT = 0;
  private pendingEnding = false;
  private marker = new THREE.Vector3();
  private lastObjective = '';
  private reportTimer = -1;
  private reportLedger: GameState['ledger'] | null = null;

  constructor(private readonly game: Game) {
    const ev = game.sim.events;
    ev.on('notify', ({ text, kind }) => game.ui.toast(text, kind));
    ev.on('levelUp', ({ level }) => {
      game.ui.toast(`Новый уровень ${level}! ${this.unlocksText(level)}`, 'level');
      game.audio.play('levelUp');
    });
    ev.on('sale', ({ total, items }) => {
      game.ui.toast(`Продажа: +${total} (${items} шт.)`, 'good');
      game.audio.play('coin', { vol: 0.7 });
    });
    ev.on('dayEnded', ({ ledger }) => {
      this.reportLedger = ledger;
      this.reportTimer = 1.4;
    });
    ev.on('phase', ({ phase }) => {
      if (phase === 'open') game.audio.play('bell');
    });
    ev.on('storyEnding', () => (this.pendingEnding = true));
    ev.on('order', ({ remote }) => {
      if (!remote) game.audio.play('notify', { vol: 0.6 });
    });
  }

  private unlocksText(level: number): string {
    const parts: string[] = [];
    for (const f of FURNITURE_ORDER) if (FURNITURE[f].level === level) parts.push(FURNITURE[f].title.toLowerCase());
    for (const l of LICENSE_ORDER) if (LICENSES[l].level === level) parts.push(`лицензия «${LICENSES[l].title}»`);
    if (STAFF.cashier.level === level) parts.push('кассир');
    if (level === 4) parts.push('заказ по планшету');
    return parts.length ? `Доступно: ${parts.join(', ')}` : 'Покупателей станет больше';
  }

  // ───────── Меню и начало игры ─────────

  showMainMenu(): void {
    this.game.ui.closeAll();
    this.game.setMode('menu');
    this.game.cameraDriven = true;
    this.game.timeOverride = 17 * 60 + 40;
    this.game.ui.showMainMenu();
  }

  toMainMenu(): void {
    this.endCall(false);
    if (this.intro) {
      this.intro.skip();
      this.intro = null;
    }
    this.game.ui.closeAll();
    this.game.stock.cancelPlacement();
    this.game.setState(newGameState());
    this.showMainMenu();
  }

  private enterGame(state: GameState): void {
    const game = this.game;
    game.ui.closeAll();
    game.ui.hideMainMenu();
    game.timeOverride = null;
    game.cameraDriven = false;
    game.setState(state);
    this.autosaveT = 0;
    this.pendingEnding = false;
    this.reportTimer = -1;
    game.allowUnload = false;
  }

  newGame(opts: { skipIntro: boolean }): void {
    const game = this.game;
    const state = newGameState();
    state.player.x = PLAYER_ARRIVAL.x;
    state.player.z = PLAYER_ARRIVAL.z;
    this.enterGame(state);
    game.player.lookAt(PLAYER_ARRIVAL.lookX, 1.6, PLAYER_ARRIVAL.lookZ);
    if (opts.skipIntro) {
      state.story.introDone = true;
      state.story.callDone = true;
      game.setMode('play');
      game.ui.toast('Цель: познакомьтесь с поставщиками и приведите магазин в порядок', 'info');
      return;
    }
    game.setMode('intro');
    game.cameraDriven = true;
    this.intro = new Intro(game, (skipped) => {
      this.intro = null;
      state.story.introDone = true;
      game.player.teleport(PLAYER_ARRIVAL.x, PLAYER_ARRIVAL.z);
      game.player.lookAt(PLAYER_ARRIVAL.lookX, 1.6, PLAYER_ARRIVAL.lookZ);
      game.setMode('play');
      if (skipped) {
        state.story.callDone = true;
        game.ui.toast('Цель: познакомьтесь с поставщиками и приведите магазин в порядок', 'info');
      } else {
        this.startCall(CALL_INTRO, () => {
          state.story.callDone = true;
          game.ui.toast('Цель: познакомьтесь с поставщиками', 'info');
        });
      }
    });
  }

  async loadGame(slot: SaveKey): Promise<void> {
    try {
      const state = await this.game.saves.load(slot);
      if (!state) {
        this.game.ui.toast('Сохранение пустое', 'bad');
        return;
      }
      this.endCall(false);
      this.enterGame(state);
      state.story.introDone = true;
      if (!state.story.callDone) state.story.callDone = true;
      this.game.setMode('play');
      this.game.ui.toast(`Загружено: ${SLOT_LABEL[slot]} — день ${state.day}`, 'good');
      if (state.phase === 'report') this.game.ui.openReport(state.history[state.history.length - 1] ?? state.ledger);
    } catch (e) {
      this.game.ui.toast(`Не удалось загрузить: ${(e as Error).message}`, 'bad');
    }
  }

  async saveTo(slot: SaveKey): Promise<boolean> {
    this.game.capturePlayer();
    const ok = await this.game.saves.save(slot, this.game.sim.snapshot());
    if (ok) this.game.allowUnload = slot !== 'autosave' ? true : this.game.allowUnload;
    return ok;
  }

  private async autosave(reason: string): Promise<void> {
    if (!this.game.settings.data.general.autosave) return;
    const ok = await this.saveTo('autosave');
    if (ok) this.game.ui.toast(`Автосохранение (${reason})`, 'info');
  }

  // ───────── Смена и день ─────────

  openShift(): boolean {
    const sim = this.game.sim;
    const blockers = sim.openBlockers();
    if (blockers.length) {
      this.game.ui.toast(blockers[0]!, 'bad');
      return false;
    }
    return sim.openShift();
  }

  closeShift(): boolean {
    return this.game.sim.closeShift();
  }

  startNewDay(token: number): void {
    const game = this.game;
    if (!game.sim.startNewDay(token)) return;
    game.ui.closeById('report');
    game.ui.toast(`День ${game.sim.state.day}. Подготовьтесь и откройте смену`, 'info');
    void this.autosave('новый день');
    if (this.pendingEnding) {
      this.pendingEnding = false;
      setTimeout(() => this.playEnding(), 1500);
    }
  }

  private playEnding(): void {
    this.startCall(CALL_ENDING, () => {
      void this.game.ui.titleCard('Магазин снова полон жизни', 'Свободная игра продолжается', 4200);
      this.game.audio.play('success');
    });
  }

  // ───────── Звонок бабушки ─────────

  private startCall(lines: Line[], onDone: () => void): void {
    this.call = { lines, i: -1, t: 0, ring: 2.4, onDone };
    this.phoneActive = true;
    this.game.audio.startLoop('phone');
    this.game.ui.toast('Звонит бабушка…', 'info');
  }

  private endCall(complete: boolean): void {
    const c = this.call;
    if (!c) return;
    this.call = null;
    this.phoneActive = false;
    this.game.audio.stopLoop('phone');
    this.game.hud.subtitle(null, null);
    if (complete) c.onDone();
  }

  private updateCall(dt: number): void {
    const c = this.call;
    if (!c) return;
    if (this.game.input.wasPressedRaw('confirm') && this.game.modals === 0) {
      this.endCall(true);
      return;
    }
    if (c.ring > 0) {
      c.ring -= dt;
      if (c.ring <= 0) {
        this.game.audio.stopLoop('phone');
        this.game.audio.play('click');
      }
      return;
    }
    c.t -= dt;
    if (c.t <= 0) {
      c.i++;
      if (c.i >= c.lines.length) {
        this.endCall(true);
        return;
      }
      const l = c.lines[c.i]!;
      c.t = 1.8 + l.text.length * 0.055;
      this.game.hud.subtitle(l.who, l.text + (c.i === 0 ? '   [Enter — пропустить]' : ''));
    }
  }

  // ───────── Обучение ─────────

  /** Номер первого невыполненного шага обучения (1..14) или 0, если всё пройдено. */
  tutorialStep(): number {
    const s = this.game.sim.state;
    const t = s.tutorial;
    if (t.done) return 0;
    if (s.suppliersMet.length < 5) return 1 + s.suppliersMet.length;
    if (!t.reachedShop) return 6;
    if (!this.game.sim.restoration.complete()) return 7;
    if (!t.shelfBought && s.furniture.length === 0 && s.pendingFurniture.length === 0) return 8;
    if (s.furniture.length === 0) return 9;
    if (!STARTER.every((p) => t.orders.includes(p) || s.everStocked.includes(p))) return 10;
    if (!STARTER.every((p) => s.everStocked.includes(p))) return 11;
    if (!t.priceChecked) return 12;
    if (s.phase === 'preparation' && s.day === 1 && !t.firstSale) return 13;
    if (!t.firstSale) return 14;
    return 0;
  }

  objectiveText(): string | null {
    const s = this.game.sim.state;
    const step = this.tutorialStep();
    if (step === 0) {
      if (!s.tutorial.done) return null;
      return null;
    }
    if (step <= 5) {
      const next = MEET_ROUTE.find((id) => !s.suppliersMet.includes(id))!;
      return `Познакомьтесь с поставщиками (${s.suppliersMet.length}/5): ${SUPPLIERS[next].title} — ${SUPPLIERS[next].vendorName}`;
    }
    switch (step) {
      case 6:
        return 'Найдите магазин бабушки у площади';
      case 7: {
        const c = this.game.sim.restoration.counts();
        return `Приберитесь: доски ${c.boards}/6 · паутина ${c.webs}/4 · мусор ${c.waste}/4 · пятна ${c.stains}/4`;
      }
      case 8:
        return 'Купите стеллаж: Tab → Оборудование';
      case 9:
        return 'Поставьте стеллаж в зале (Tab → Оборудование → Поставить)';
      case 10: {
        const n = STARTER.filter((p) => s.tutorial.orders.includes(p) || s.everStocked.includes(p)).length;
        return `Закупите хлеб, воду и яблоки у поставщиков (${n}/3)`;
      }
      case 11: {
        const n = STARTER.filter((p) => s.everStocked.includes(p)).length;
        return `Разложите товар на стеллаж: коробки под навесом у склада (${n}/3)`;
      }
      case 12:
        return 'Проверьте цену товара: [E] на полке с товаром';
      case 13:
        return 'Откройте смену: Tab → Сводка → «Открыть смену»';
      case 14:
        return 'Обслужите первого покупателя на кассе';
      default:
        return null;
    }
  }

  private markerTarget(step: number): THREE.Vector3 | null {
    const game = this.game;
    const s = game.sim.state;
    const OX = SHOP_ORIGIN.x;
    const OZ = SHOP_ORIGIN.z;
    const supplierPoint = (id: SupplierId) => {
      const sp = game.village.supplierSpots.get(id);
      return sp ? new THREE.Vector3(sp.customer.x, 2.3, sp.customer.z) : null;
    };
    if (step >= 1 && step <= 5) {
      const next = MEET_ROUTE.find((id) => !s.suppliersMet.includes(id));
      return next ? supplierPoint(next) : null;
    }
    switch (step) {
      case 6:
        return new THREE.Vector3(OX, 2.2, OZ - 7.2);
      case 7: {
        const held = s.player.held.kind;
        if (held === 'boards' || held === 'trash') return new THREE.Vector3(DUMPSTER.x, 2.0, DUMPSTER.z);
        const r = s.restoration;
        const pl = game.player.position;
        const cands: THREE.Vector3[] = [];
        r.boards.forEach((b, i) => {
          if (b === 'nailed') cands.push(new THREE.Vector3(OX + RESTORATION.boards[i]!.x, RESTORATION.boards[i]!.y + 0.5, OZ + RESTORATION.boards[i]!.z));
          else if (b === 'loose' && r.boardPos[i]) cands.push(new THREE.Vector3(r.boardPos[i]!.x, 1.0, r.boardPos[i]!.z));
        });
        r.webs.forEach((w, i) => {
          if (!w) cands.push(new THREE.Vector3(OX + RESTORATION.webs[i]!.x, RESTORATION.webs[i]!.y, OZ + RESTORATION.webs[i]!.z));
        });
        r.waste.forEach((w, i) => {
          if (w === 'placed') {
            const p = r.wastePos[i] ?? { x: OX + RESTORATION.waste[i]!.x, z: OZ + RESTORATION.waste[i]!.z };
            cands.push(new THREE.Vector3(p.x, 1.2, p.z));
          }
        });
        r.stains.forEach((v, i) => {
          if (v > 0) cands.push(new THREE.Vector3(OX + RESTORATION.stains[i]!.x, FLOOR_Y + 0.9, OZ + RESTORATION.stains[i]!.z));
        });
        let best: THREE.Vector3 | null = null;
        let bd = Infinity;
        for (const c of cands) {
          const d = c.distanceToSquared(pl);
          if (d < bd) {
            bd = d;
            best = c;
          }
        }
        return best;
      }
      case 9:
        return game.stock.placement ? null : new THREE.Vector3(OX - 2, 1.4, OZ + 1);
      case 10: {
        const sku = STARTER.find((p) => !s.tutorial.orders.includes(p) && !s.everStocked.includes(p));
        return sku ? supplierPoint(PRODUCTS[sku].supplierId) : null;
      }
      case 11: {
        if (s.player.held.kind === 'box') {
          const f = s.furniture[0];
          return f ? new THREE.Vector3(f.x, 2.2, f.z) : null;
        }
        if (s.boxes.some((b) => b.loc.kind === 'delivery')) {
          const p = DELIVERY_PALLETS[1];
          return new THREE.Vector3(OX + p.x, 1.6, OZ + p.z);
        }
        return null;
      }
      case 12: {
        const f = s.furniture[0];
        return f ? new THREE.Vector3(f.x, 2.2, f.z) : null;
      }
      case 14:
        return new THREE.Vector3(OX + COUNTER.x, 2.0, OZ + COUNTER.z);
      default:
        return null;
    }
  }

  private updateTutorial(): void {
    const game = this.game;
    const s = game.sim.state;
    if (!s.tutorial.reachedShop) {
      const tag = game.village.floors.tagAt(game.player.position.x, game.player.position.z);
      if (tag === 'porch' || tag === 'hall') s.tutorial.reachedShop = true;
    }
    const step = this.tutorialStep();
    if (step === 0 && !s.tutorial.done && s.tutorial.firstSale) {
      s.tutorial.done = true;
      game.sim.progression.rewardTutorial();
      game.ui.toast('Обучение пройдено! +20 опыта', 'level');
      game.audio.play('levelUp');
    }
    const text = s.story.callDone || !this.call ? this.objectiveText() : null;
    if (text !== this.lastObjective) {
      this.lastObjective = text ?? '';
      game.hud.setObjective(text);
      if (text) game.audio.play('notify', { vol: 0.35 });
    }
    // Маркер цели.
    const target = this.call ? null : this.markerTarget(step);
    if (!target || game.modals > 0) {
      game.hud.setMarker(null);
      return;
    }
    const dist = target.distanceTo(game.player.position);
    if (dist < 2.2) {
      game.hud.setMarker(null);
      return;
    }
    this.marker.copy(target).project(game.camera);
    const W = window.innerWidth;
    const H = window.innerHeight;
    let x = ((this.marker.x + 1) / 2) * W;
    let y = ((1 - this.marker.y) / 2) * H;
    let edge = false;
    if (this.marker.z > 1) {
      x = W - x;
      y = H - 40;
      edge = true;
    }
    const m = 40;
    if (x < m || x > W - m || y < m + 40 || y > H - m) edge = true;
    x = Math.min(W - m, Math.max(m, x));
    y = Math.min(H - m, Math.max(m + 40, y));
    game.hud.setMarker({ x, y, dist, edge });
  }

  // ───────── Кадр ─────────

  update(dt: number, frameDt: number): void {
    const game = this.game;
    if (game.mode === 'menu') {
      this.menuT += frameDt;
      const t = this.menuT * 0.035;
      const cam = game.camera;
      cam.position.set(Math.sin(t) * 30, 10.5 + Math.sin(t * 1.7) * 1.5, -8 + Math.cos(t) * 26);
      cam.lookAt(0, 2.5, 2);
      game.hud.setMarker(null);
      return;
    }
    if (game.mode === 'intro') {
      this.intro?.update(frameDt);
      return;
    }
    if (game.mode !== 'play') return;
    const busy = game.customers.busy || game.counter.busy;
    game.sim.update(dt, busy);
    this.updateCall(dt);
    this.updateTutorial();
    // Итог дня — с небольшой паузой после закрытия.
    if (this.reportTimer > 0) {
      this.reportTimer -= dt;
      if (this.reportTimer <= 0 && this.reportLedger) {
        game.ui.closeById('tablet');
        game.ui.openReport(this.reportLedger);
        game.audio.play('success');
      }
    }
    // Автосохранение по реальному времени игры.
    this.autosaveT += frameDt;
    if (this.autosaveT >= BALANCE.autosaveSec) {
      this.autosaveT = 0;
      if (game.modals === 0 && game.sim.state.phase !== 'report') void this.autosave('10 минут');
    }
  }
}
