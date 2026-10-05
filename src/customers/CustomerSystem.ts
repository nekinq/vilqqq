import * as THREE from 'three';
import type { Game, System } from '../game/Game';
import type { NavGrid, RoadGraph } from '../world/Navigation';
import type { XZ } from '../world/layout';
import { CharacterRig } from './CharacterRig';
import { makeShoppingList, buyChance, bonusQty } from './Director';
import { CUSTOMER_ARCHETYPES, customerAssetId, type CustomerArchetype } from '../art/models/characters';
import { PRODUCTS } from '../data/products';
import { BALANCE } from '../data/balance';
import { entryChance } from '../data/progression';
import { nextId, type CustomerState, type CustomerPhase } from '../game/state';
import { SHOP_ORIGIN, FLOOR_Y, COUNTER } from '../world/shopLayout';
import { groundHeight } from '../world/Ground';
import { damp, dampAngle } from '../core/math';
import { speechBubble } from '../art/SignFactory';
import { toTexture } from '../art/TextureFactory';
import { SECTION_CAPACITY } from '../inventory/Inventory';

interface Agent {
  st: CustomerState;
  obj: THREE.Object3D;
  rig: CharacterRig;
  basket: THREE.Object3D | null;
  basketItems: THREE.Mesh[];
  path: XZ[];
  pi: number;
  onArrive: (() => void) | null;
  speed: number;
  curSpeed: number;
  bubble: THREE.Sprite | null;
  bubbleT: number;
  face: number | null;
  yield: number;
  collider: number | null;
  queueSpot: number;
}

const OX = SHOP_ORIGIN.x;
const OZ = SHOP_ORIGIN.z;
/** Ключевые точки маршрута (мировые). */
const STEPS: XZ = [0, 5.35];
const DOOR_OUT: XZ = [0, 7.9];
const DOOR_IN: XZ = [0, 9.85];
const SPAWNS: XZ[] = [
  [-18.5, 10],
  [19.5, 10],
  [-5, 29],
  [6, 29],
  [-10.4, -3.6],
  [10.4, -3.6],
  [-22, 18],
  [15, 26],
];
const FAR_SPAWNS: XZ[] = [
  [-26, -23],
  [26, -23],
  [-2, 42],
  [-9, -35],
];

const ARCH_WEIGHT: Record<CustomerArchetype, number> = { woman: 1.2, man: 1, grandma: 1.1, grandpa: 0.9, young: 0.9 };

/**
 * Покупатели: приходят по деревенским дорогам, решают войти (чистота), ходят по залу по
 * NavGrid к секциям (с резервом товара), решают о цене, встают в очередь, выкладывают
 * товар, платят картой или наличными и уходят. Каждый визит даёт одно итоговое изменение репутации.
 */
export class CustomerSystem implements System {
  private agents = new Map<string, Agent>();
  private root = new THREE.Group();
  private bubbleTex = new Map<string, THREE.Texture>();
  private spawnCooldown = 0;

  constructor(
    private readonly game: Game,
    private readonly nav: NavGrid,
    private readonly roads: RoadGraph,
  ) {
    this.root.name = 'customers';
    game.scene.add(this.root);
  }

  private get sim() {
    return this.game.sim;
  }

  get count(): number {
    return this.agents.size;
  }

  get busy(): boolean {
    return this.agents.size > 0;
  }

  // ───────── Создание ─────────

  private pickArchetype(): [CustomerArchetype, number] {
    const rng = this.sim.rng;
    const arch = rng.weighted([...CUSTOMER_ARCHETYPES], (a) => ARCH_WEIGHT[a]);
    return [arch, rng.int(0, 2)];
  }

  spawn(at?: XZ): CustomerState | null {
    const s = this.sim.state;
    const rng = this.sim.rng;
    const [arch, variant] = this.pickArchetype();
    const sp = at ?? (rng.chance(0.8) ? rng.pick(SPAWNS) : rng.pick(FAR_SPAWNS));
    let assortment = this.sim.inventory.assortment();
    if (assortment.length === 0) assortment = ['bread', 'water', 'apples'];
    const st: CustomerState = {
      id: nextId(s, 'c'),
      archetype: `${arch}:${variant}`,
      seed: rng.int(1, 1e9),
      phase: 'arriving',
      x: sp[0],
      y: 0,
      z: sp[1],
      rotY: 0,
      wants: makeShoppingList(rng, assortment, s.level),
      cart: [],
      target: null,
      queueIndex: -1,
      patience: BALANCE.queuePatience,
      complained: false,
      spawnX: sp[0],
      spawnZ: sp[1],
      payMethod: rng.chance(0.55) ? 'card' : 'cash',
      cashGiven: 0,
      timer: 0,
    };
    s.customers.push(st);
    this.sim.director.markSpawned();
    this.sim.events.emit('customerSpawned', { id: st.id });
    const a = this.createAgent(st);
    this.goToShop(a);
    return st;
  }

  private createAgent(st: CustomerState): Agent {
    const [arch, v] = st.archetype.split(':') as [CustomerArchetype, string];
    const id = customerAssetId(arch, Number(v) || 0);
    const obj = this.game.assets.has(id) ? this.game.assets.instance(id) : this.game.assets.instance(customerAssetId('man', 0));
    obj.position.set(st.x, st.y, st.z);
    obj.rotation.y = st.rotY;
    this.root.add(obj);
    const a: Agent = {
      st,
      obj,
      rig: new CharacterRig(obj),
      basket: null,
      basketItems: [],
      path: [],
      pi: 0,
      onArrive: null,
      speed: 1.25 + ((st.seed % 100) / 100) * 0.3,
      curSpeed: 0,
      bubble: null,
      bubbleT: 0,
      face: null,
      yield: 0,
      collider: null,
      queueSpot: -1,
    };
    this.agents.set(st.id, a);
    return a;
  }

  private removeAgent(a: Agent): void {
    this.root.remove(a.obj);
    if (a.bubble) this.root.remove(a.bubble);
    if (a.collider !== null) this.game.village.colliders.remove(a.collider);
    this.agents.delete(a.st.id);
    const s = this.sim.state;
    s.customers = s.customers.filter((c) => c.id !== a.st.id);
    s.queue = s.queue.filter((q) => q !== a.st.id);
    this.sim.events.emit('customerRemoved', { id: a.st.id });
  }

  // ───────── Пути ─────────

  private setPath(a: Agent, pts: XZ[], onArrive: (() => void) | null): void {
    a.path = pts;
    a.pi = 0;
    a.onArrive = onArrive;
    a.face = null;
  }

  /** Путь внутри магазина (NavGrid) с запасным прямым отрезком. */
  private navPath(a: Agent, tx: number, tz: number): XZ[] {
    const p = this.nav.path(a.st.x, a.st.z, tx, tz);
    return p ? p.slice(1) : [[tx, tz]];
  }

  private goToShop(a: Agent): void {
    a.st.phase = 'arriving';
    const road = this.roads.path(a.st.x, a.st.z, STEPS[0], STEPS[1]);
    this.setPath(a, [...road.slice(1), DOOR_OUT], () => this.atDoor(a));
  }

  private queueSpotWorld(i: number): XZ {
    if (i < COUNTER.queue.length) {
      const q = COUNTER.queue[i]!;
      return [OX + q.x, OZ + q.z];
    }
    const last = COUNTER.queue[COUNTER.queue.length - 1]!;
    const k = i - COUNTER.queue.length + 1;
    return [OX + last.x - 0.25 * k, OZ + last.z + 0.95 * k];
  }

  // ───────── Логика визита ─────────

  private bubble(a: Agent, text: string, mood: 'good' | 'bad' | 'neutral', sec = 2.6): void {
    const key = `${mood}|${text}`;
    let tex = this.bubbleTex.get(key);
    if (!tex) {
      tex = toTexture(speechBubble(text, mood), { repeat: false });
      this.bubbleTex.set(key, tex);
    }
    if (!a.bubble) {
      a.bubble = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: true, transparent: true }));
      a.bubble.scale.set(0.95, 0.36, 1);
      a.bubble.renderOrder = 5;
      this.root.add(a.bubble);
    }
    (a.bubble.material as THREE.SpriteMaterial).map = tex;
    a.bubble.visible = true;
    a.bubbleT = sec;
  }

  private atDoor(a: Agent): void {
    const s = this.sim.state;
    const rng = this.sim.rng;
    const clean = this.sim.dirt.cleanliness();
    if (s.phase === 'report' || rng.next() > entryChance(clean)) {
      a.st.phase = 'refused';
      if (s.phase !== 'report') {
        this.bubble(a, 'Фу, как грязно!', 'bad');
        this.sim.failedVisit('refusedDirty');
      }
      a.st.timer = 1.2;
      return;
    }
    if (clean < 60 && rng.chance(0.5)) a.st.complained = true;
    a.st.phase = 'entering';
    // Следы и земля с улицы.
    if (rng.chance(0.35)) this.sim.dirt.spawn('footprints', OX + rng.range(-1.2, 1.2), FLOOR_Y + 0.003, OZ - 5.5 + rng.range(0.6, 1.9), rng.range(-0.6, 0.6) + Math.PI);
    if (rng.chance(0.1)) this.sim.dirt.spawn('mud', OX + rng.range(-1.5, 1.5), FLOOR_Y + 0.004, OZ - 5.5 + rng.range(0.8, 2.6), rng.range(0, 6.28));
    this.setPath(a, [DOOR_IN], () => {
      a.st.phase = 'shopping';
      this.attachBasket(a);
      if (a.st.complained) this.bubble(a, 'Грязновато тут…', 'bad');
      a.st.timer = 0.3;
    });
  }

  private attachBasket(a: Agent): void {
    if (a.basket) return;
    const hand = a.obj.getObjectByName('arm_L')?.getObjectByName('hand');
    if (!hand) return;
    const b = this.game.assets.instance('basket');
    b.scale.setScalar(0.85);
    b.position.set(0, -0.17, 0.02);
    b.rotation.y = Math.PI / 2;
    hand.add(b);
    a.basket = b;
    a.rig.holdBasket = true;
    this.syncBasket(a);
  }

  private syncBasket(a: Agent): void {
    if (!a.basket) return;
    const n = Math.min(4, a.st.cart.length);
    while (a.basketItems.length < n) {
      const m = new THREE.Mesh(new THREE.BufferGeometry(), this.game.lib.get('flat'));
      m.castShadow = false;
      a.basket.add(m);
      a.basketItems.push(m);
    }
    a.basketItems.forEach((m, i) => {
      const it = a.st.cart[i];
      m.visible = i < n && !!it;
      if (it) {
        m.geometry = this.game.assets.mergedGeometry(`prod_${it.sku}`);
        m.position.set(-0.09 + (i % 2) * 0.18, 0.025, -0.05 + Math.floor(i / 2) * 0.1);
        m.scale.setScalar(0.75);
      }
    });
  }

  /** Следующая позиция списка покупок. */
  private nextWant(a: Agent): void {
    const st = a.st;
    const want = st.wants.find((w) => w.result === 'pending');
    if (!want) {
      this.finishShopping(a);
      return;
    }
    const keys = this.sim.inventory.sectionsWith(want.sku);
    let best: string | null = null;
    let bd = Infinity;
    let bp: THREE.Vector3 | null = null;
    for (const k of keys) {
      const p = this.game.stock.accessPoint(k);
      if (!p) continue;
      const d = Math.hypot(p.x - st.x, p.z - st.z);
      if (d < bd) {
        bd = d;
        best = k;
        bp = p;
      }
    }
    if (!best || !bp) {
      want.result = 'missing';
      this.bubble(a, `Нет: ${PRODUCTS[want.sku].name.toLowerCase()}`, 'bad');
      st.timer = 0.9;
      st.phase = 'shopping';
      return;
    }
    const n = this.sim.inventory.reserve(best, want.qty);
    st.target = { section: best, qty: n, sku: want.sku };
    st.phase = 'toShelf';
    this.setPath(a, this.navPath(a, bp.x, bp.z), () => this.atShelf(a));
  }

  private atShelf(a: Agent): void {
    const st = a.st;
    const t = st.target;
    if (!t) {
      st.phase = 'shopping';
      st.timer = 0.2;
      return;
    }
    st.phase = 'picking';
    const slot = this.game.stock.slotWorld(t.section, 0);
    if (slot) a.face = Math.atan2(slot.x - st.x, slot.z - st.z);
    a.rig.reach(1.0);
    st.timer = 1.1;
  }

  private decide(a: Agent): void {
    const st = a.st;
    const t = st.target;
    st.target = null;
    if (!t) return;
    const rng = this.sim.rng;
    const want = st.wants.find((w) => w.sku === t.sku && w.result === 'pending');
    const price = this.sim.price(t.sku);
    const base = PRODUCTS[t.sku].defaultSellPrice;
    if (!want) {
      this.sim.inventory.release(t.section, t.qty);
      return;
    }
    if (t.qty > 0 && rng.next() < buyChance(price, base, this.sim.state.reputation)) {
      let taken = this.sim.inventory.pickReserved(t.section, t.qty);
      const extra = bonusQty(price, base, rng);
      if (extra && this.sim.inventory.available(t.section) > 0) {
        taken += this.sim.inventory.pickReserved(t.section, this.sim.inventory.reserve(t.section, extra));
      }
      for (let i = 0; i < taken; i++) st.cart.push({ sku: t.sku, price });
      want.taken += taken;
      want.result = taken >= want.qty ? 'taken' : taken > 0 ? 'partial' : 'missing';
      if (taken > 0 && taken < want.qty) this.bubble(a, 'Мало осталось…', 'neutral');
      this.syncBasket(a);
      this.game.audio.play('pickup', { vol: 0.25 });
      // Иногда роняют бумажку.
      if (rng.chance(0.12)) this.sim.dirt.spawn('paper', st.x + rng.range(-0.4, 0.4), FLOOR_Y + 0.01, st.z + rng.range(-0.4, 0.4), rng.range(0, 6.28));
    } else {
      this.sim.inventory.release(t.section, t.qty);
      want.result = t.qty > 0 ? 'expensive' : 'missing';
      this.bubble(a, t.qty > 0 ? 'Дороговато…' : `Нет: ${PRODUCTS[t.sku].name.toLowerCase()}`, 'bad');
    }
    st.phase = 'shopping';
    st.timer = 0.45;
  }

  private finishShopping(a: Agent): void {
    const st = a.st;
    if (st.cart.length > 0) {
      this.sim.state.queue.push(st.id);
      st.phase = 'toQueue';
      a.queueSpot = -1;
      return;
    }
    const outcome = st.wants.some((w) => w.result === 'missing') ? 'missing' : 'expensive';
    this.sim.failedVisit(outcome, st.complained);
    this.bubble(a, outcome === 'missing' ? 'Ничего нужного нет' : 'Всё слишком дорого', 'bad');
    this.leave(a);
  }

  private leave(a: Agent): void {
    const st = a.st;
    this.sim.state.queue = this.sim.state.queue.filter((q) => q !== st.id);
    st.phase = 'leaving';
    st.target = null;
    const inside = this.isInside(st.x, st.z);
    const out: XZ[] = [];
    if (inside) out.push(...this.navPath(a, DOOR_IN[0], DOOR_IN[1]));
    out.push(DOOR_OUT, STEPS);
    const road = this.roads.path(STEPS[0], STEPS[1], st.spawnX, st.spawnZ);
    out.push(...road.slice(1));
    this.setPath(a, out, () => {
      st.phase = 'gone';
      this.removeAgent(a);
    });
    a.speed = Math.max(a.speed, 1.3);
  }

  private isInside(x: number, z: number): boolean {
    return x > OX - 7 && x < OX + 7 && z > OZ - 5.5 && z < OZ + 5.5;
  }

  /** Вернуть товар из корзины на полки (покупатель не дождался). */
  private returnCart(a: Agent): void {
    const inv = this.sim.inventory;
    const s = this.sim.state;
    for (const it of a.st.cart) {
      let left = 1;
      for (const [k, sec] of Object.entries(s.sections)) {
        if (sec.sku === it.sku && sec.count < SECTION_CAPACITY) {
          left = inv.returnToSection(k, it.sku, 1);
          if (left === 0) break;
        }
      }
      if (left > 0) {
        for (const [k, sec] of Object.entries(s.sections)) {
          if (sec.sku === null && inv.storageOf(k) === PRODUCTS[it.sku].storage) {
            left = inv.returnToSection(k, it.sku, 1);
            if (left === 0) break;
          }
        }
      }
    }
    a.st.cart = [];
    this.syncBasket(a);
  }

  private giveUp(a: Agent): void {
    this.game.counter.cancel(a.st.id);
    this.returnCart(a);
    this.sim.failedVisit('impatient', a.st.complained);
    this.bubble(a, 'Слишком долго!', 'bad');
    a.rig.impatient = 0;
    this.leave(a);
  }

  // ───────── События кассы ─────────

  onPaymentStarted(id: string): void {
    const a = this.agents.get(id);
    if (!a) return;
    a.st.phase = 'paying';
    a.rig.reach(1.2);
    if (a.st.payMethod === 'card') this.game.audio.play('card', { vol: 0.5 });
  }

  onPaid(id: string): void {
    const a = this.agents.get(id);
    if (!a) return;
    a.st.cart = [];
    this.syncBasket(a);
    this.bubble(a, this.sim.rng.pick(['Спасибо!', 'До свидания!', 'Хорошего дня!', 'Приду ещё!']), 'good', 2.2);
    a.rig.nod();
    this.leave(a);
  }

  // ───────── Восстановление ─────────

  rebuild(): void {
    for (const a of [...this.agents.values()]) {
      this.root.remove(a.obj);
      if (a.bubble) this.root.remove(a.bubble);
      if (a.collider !== null) this.game.village.colliders.remove(a.collider);
    }
    this.agents.clear();
    const s = this.sim.state;
    for (const st of s.customers) {
      const a = this.createAgent(st);
      this.resume(a);
    }
  }

  private resume(a: Agent): void {
    const st = a.st;
    const ph: CustomerPhase = st.phase;
    if (ph === 'arriving' || ph === 'refused') this.goToShop(a);
    else if (ph === 'entering') this.atDoor(a);
    else if (ph === 'leaving' || ph === 'gone') this.leave(a);
    else {
      this.attachBasket(a);
      if (ph === 'toShelf' || ph === 'picking') {
        const t = st.target;
        if (t) {
          const p = this.game.stock.accessPoint(t.section);
          if (p) {
            st.phase = 'toShelf';
            this.setPath(a, this.navPath(a, p.x, p.z), () => this.atShelf(a));
          } else {
            st.target = null;
            st.phase = 'shopping';
          }
        } else st.phase = 'shopping';
      } else if (ph === 'placing' || ph === 'waitScan' || ph === 'paying') {
        if (!this.sim.state.checkout || this.sim.state.checkout.customerId !== st.id) st.phase = 'queue';
      }
    }
  }

  // ───────── Кадр ─────────

  update(dt: number, frameDt: number): void {
    const s = this.sim.state;
    const playing = this.game.mode === 'play' || this.game.mode === 'intro';
    // Новые покупатели по расписанию.
    if (dt > 0 && s.phase === 'open') {
      this.spawnCooldown -= dt;
      if (this.spawnCooldown <= 0 && this.sim.director.due(this.agents.size)) {
        this.spawn();
        this.spawnCooldown = 2.5;
      }
    }
    this.game.npcPositions.length = 0;
    const pl = this.game.player.position;
    for (const a of [...this.agents.values()]) {
      if (dt > 0) this.think(a, dt);
      if (!this.agents.has(a.st.id)) continue;
      this.move(a, dt, pl);
      a.rig.update(dt > 0 ? dt : 0, a.curSpeed);
      // Голова — к игроку, если рядом.
      const dx = pl.x - a.st.x;
      const dz = pl.z - a.st.z;
      const d = Math.hypot(dx, dz);
      a.rig.lookYaw = playing && d < 4 ? wrap(Math.atan2(dx, dz) - a.st.rotY) : 0;
      // Облачко.
      if (a.bubble) {
        a.bubbleT -= frameDt;
        const top = a.obj.getObjectByName('top');
        const y = top ? top.position.y : 1.9;
        a.bubble.position.set(a.st.x, a.st.y + y + 0.18, a.st.z);
        const mat = a.bubble.material as THREE.SpriteMaterial;
        mat.opacity = Math.min(1, Math.max(0, a.bubbleT * 2));
        a.bubble.visible = a.bubbleT > 0;
      }
      this.game.npcPositions.push({ x: a.st.x, z: a.st.z });
      // Коллайдер для игрока.
      if (a.collider !== null) this.game.village.colliders.remove(a.collider);
      a.collider = this.game.village.colliders.circle(a.st.x, a.st.z, 0.26, 'npc');
    }
  }

  private think(a: Agent, dt: number): void {
    const st = a.st;
    const s = this.sim.state;
    switch (st.phase) {
      case 'refused':
        st.timer -= dt;
        if (st.timer <= 0) this.leave(a);
        break;
      case 'shopping':
        st.timer -= dt;
        if (st.timer <= 0 && a.pi >= a.path.length) this.nextWant(a);
        break;
      case 'picking':
        st.timer -= dt;
        if (st.timer <= 0) this.decide(a);
        break;
      case 'toQueue':
      case 'queue': {
        const idx = s.queue.indexOf(st.id);
        if (idx < 0) {
          s.queue.push(st.id);
          break;
        }
        if (idx !== a.queueSpot) {
          a.queueSpot = idx;
          const [qx, qz] = this.queueSpotWorld(idx);
          this.setPath(a, this.navPath(a, qx, qz), () => {
            st.phase = 'queue';
            a.face = Math.PI / 2;
          });
        }
        st.patience -= dt;
        a.rig.impatient = damp(a.rig.impatient, st.patience < 35 ? 1 : 0, 2, dt);
        if (st.patience <= 0) {
          this.giveUp(a);
          break;
        }
        if (st.phase === 'queue' && idx === 0 && a.pi >= a.path.length && !this.game.counter.session) {
          st.phase = 'placing';
          a.face = Math.PI / 2;
          a.rig.reach(1.4);
          this.game.counter.beginSession(st);
        }
        break;
      }
      case 'placing':
      case 'waitScan':
      case 'paying': {
        const c = s.checkout;
        if (!c || c.customerId !== st.id) {
          st.phase = 'queue';
          break;
        }
        if (st.phase === 'placing' && c.stage === 'scanning') st.phase = 'waitScan';
        // Пока кто-то пробивает — терпение тратится вдвое медленнее.
        st.patience -= dt * (c.operator ? 0.35 : 0.8);
        a.rig.impatient = damp(a.rig.impatient, st.patience < 30 ? 1 : 0, 2, dt);
        if (st.patience <= 0) this.giveUp(a);
        break;
      }
      default:
        break;
    }
  }

  private move(a: Agent, dt: number, pl: THREE.Vector3): void {
    const st = a.st;
    let speed = 0;
    if (dt > 0 && a.pi < a.path.length) {
      const [tx, tz] = a.path[a.pi]!;
      const dx = tx - st.x;
      const dz = tz - st.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.08) {
        a.pi++;
        if (a.pi >= a.path.length) {
          const cb = a.onArrive;
          a.onArrive = null;
          cb?.();
        }
      } else {
        const dirx = dx / dist;
        const dirz = dz / dist;
        // Уступить дорогу игроку или другому покупателю впереди.
        let blocked = false;
        if (this.game.mode === 'play') {
          const px = pl.x - st.x;
          const pz = pl.z - st.z;
          const pd = Math.hypot(px, pz);
          if (pd < 0.75 && (px * dirx + pz * dirz) / (pd || 1) > 0.55) blocked = true;
        }
        for (const o of this.agents.values()) {
          if (o === a) continue;
          const ox = o.st.x - st.x;
          const oz = o.st.z - st.z;
          const od = Math.hypot(ox, oz);
          if (od < 0.6 && (ox * dirx + oz * dirz) / (od || 1) > 0.6 && (o.curSpeed < 0.1 || o.st.id > st.id)) {
            blocked = true;
            break;
          }
        }
        if (blocked) a.yield += dt;
        else a.yield = 0;
        if (!blocked || a.yield > 1.4) {
          const inside = this.isInside(st.x, st.z);
          speed = a.speed * (inside ? 0.82 : 1);
          const step = Math.min(dist, speed * dt);
          st.x += dirx * step;
          st.z += dirz * step;
          st.rotY = dampAngle(st.rotY, Math.atan2(dirx, dirz), 9, dt);
        }
      }
    } else if (dt > 0 && a.face !== null) {
      st.rotY = dampAngle(st.rotY, a.face, 6, dt);
    }
    a.curSpeed = damp(a.curSpeed, speed, 10, Math.max(dt, 1e-4));
    const floorY = this.game.village.floors.heightAt(st.x, st.z, groundHeight(st.x, st.z));
    st.y = dt > 0 ? damp(st.y, floorY, 14, dt) : floorY;
    a.obj.position.set(st.x, st.y, st.z);
    a.obj.rotation.y = st.rotY;
  }

  /** Отладка: принудительно выпустить покупателя. */
  debugSpawn(at?: XZ): string | null {
    return this.spawn(at)?.id ?? null;
  }
}

function wrap(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}
