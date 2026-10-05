import * as THREE from 'three';
import type { Game, System } from '../game/Game';
import { hitBox, type Prompt } from '../player/Interaction';
import { SHOP_ORIGIN, FLOOR_Y, COUNTER } from '../world/shopLayout';
import { COUNTER_LAYOUT } from '../art/models/equipment';
import { PRODUCTS, type ProductId } from '../data/products';
import type { CheckoutState, CustomerState } from '../game/state';
import { allScanned, checkoutTotal, customerCash, changeDue, changeExact, greedyChange } from './Checkout';
import { counterScreen } from '../art/SignFactory';
import { toTexture } from '../art/TextureFactory';
import { damp } from '../core/math';
import { CharacterRig } from '../customers/CharacterRig';

interface ItemView {
  uid: number;
  mesh: THREE.Mesh;
  hit: THREE.Mesh;
  /** 0 — на прилавке, >0 — летит в пакет. */
  fly: number;
  from: THREE.Vector3;
  shown: boolean;
}

const UP = new THREE.Vector3(0, 1, 0);

/**
 * Касса (физическая, без кнопки «Продать»): покупатель выкладывает товар, игрок берёт сканер (E)
 * и пробивает каждую позицию (ЛКМ). Карта — подтвердить на терминале. Наличные — взять купюры
 * с прилавка, открыть ящик и выдать точную сдачу. Нанятый кассир делает то же сам.
 */
export class CounterSystem implements System {
  readonly obj: THREE.Object3D;
  private root = new THREE.Group();
  private items: ItemView[] = [];
  private screenTex: THREE.CanvasTexture;
  private screenKey = '';
  private drawerNode: THREE.Object3D | null;
  private drawerOpenT = 0;
  private drawerTarget = 0;
  private scannerNode: THREE.Object3D | null;
  private cashObj: THREE.Object3D;
  private cashHit: THREE.Mesh;
  private matrix: THREE.Matrix4;
  private placingTimer = 0;
  private placed = 0;
  // Кассир.
  private cashier: { obj: THREE.Object3D; rig: CharacterRig } | null = null;
  private cashierTimer = 0;
  private cashierActive = false;
  private flash = 0;

  constructor(private readonly game: Game) {
    this.root.name = 'counter';
    game.scene.add(this.root);
    const obj = game.assets.instance('checkout_counter');
    obj.position.set(SHOP_ORIGIN.x + COUNTER.x, FLOOR_Y, SHOP_ORIGIN.z + COUNTER.z);
    obj.rotation.y = -Math.PI / 2;
    this.root.add(obj);
    obj.updateMatrixWorld(true);
    this.obj = obj;
    this.matrix = obj.matrixWorld.clone();
    this.drawerNode = obj.getObjectByName('drawer') ?? null;
    this.scannerNode = obj.getObjectByName('scanner') ?? null;
    // Экран кассы — своя текстура.
    this.screenTex = toTexture(counterScreen([], 0, 'Готово'), { repeat: false });
    const screenMat = new THREE.MeshBasicMaterial({ map: this.screenTex, toneMapped: false });
    obj.getObjectByName('screen')?.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).material = screenMat;
    });
    // Наличные покупателя на прилавке.
    this.cashObj = game.assets.instance('banknote');
    this.cashObj.position.copy(this.local(COUNTER_LAYOUT.cash.x, COUNTER_LAYOUT.top + 0.003, COUNTER_LAYOUT.cash.z));
    this.cashObj.rotation.y = 0.3;
    this.cashObj.scale.setScalar(1.3);
    this.cashObj.visible = false;
    this.cashHit = hitBox(0.28, 0.1, 0.22);
    this.cashHit.position.copy(this.cashObj.position).add(new THREE.Vector3(0, 0.03, 0));
    this.root.add(this.cashObj, this.cashHit);
    this.registerStatic();
  }

  private get sim() {
    return this.game.sim;
  }

  get session(): CheckoutState | null {
    return this.sim.state.checkout;
  }

  /** Мировая точка из локальных координат прилавка. */
  private local(x: number, y: number, z: number): THREE.Vector3 {
    return new THREE.Vector3(x, y, z).applyMatrix4(this.matrix);
  }

  private nodeHit(node: THREE.Object3D | null, w: number, hh: number, d: number, dy = 0): THREE.Mesh {
    const hit = hitBox(w, hh, d);
    if (node) {
      const p = new THREE.Vector3().setFromMatrixPosition(node.matrixWorld);
      hit.position.copy(p).add(new THREE.Vector3(0, dy, 0));
      hit.rotation.y = -Math.PI / 2;
    }
    this.root.add(hit);
    return hit;
  }

  private registerStatic(): void {
    const g = this.game;
    // Сканер.
    const scHit = this.nodeHit(this.scannerNode, 0.22, 0.24, 0.24, 0.08);
    g.interaction.register({
      id: 'scanner',
      hits: [scHit],
      prompt: () => this.scannerPrompt(),
      onInteract: () => this.toggleScanner(),
    });
    // Терминал.
    const tHit = this.nodeHit(this.obj.getObjectByName('terminal') ?? null, 0.2, 0.16, 0.26, 0.05);
    g.interaction.register({
      id: 'terminal',
      hits: [tHit],
      prompt: () => this.terminalPrompt(),
      onInteract: () => {
        const c = this.session;
        if (c && c.stage === 'payment' && c.method === 'card' && this.sim.state.player.held.kind !== 'cash') {
          c.operator = c.operator ?? 'player';
          g.ui.openTerminal();
        }
      },
    });
    // Денежный ящик.
    const dHit = this.nodeHit(this.drawerNode, 0.5, 0.2, 0.5, 0.02);
    g.interaction.register({
      id: 'drawer',
      hits: [dHit],
      prompt: () => this.drawerPrompt(),
      onInteract: () => {
        const c = this.session;
        const held = this.sim.state.player.held;
        if (c && c.stage === 'payment' && c.method === 'cash' && (held.kind === 'cash' || c.cashTaken)) {
          if (held.kind === 'cash') {
            this.sim.state.player.held = { kind: 'none' };
            g.audio.play('cash');
          }
          g.ui.openDrawer();
        }
      },
    });
    // Наличные на прилавке.
    g.interaction.register({
      id: 'cash',
      hits: [this.cashHit],
      enabled: () => this.cashObj.visible,
      prompt: () => {
        const held = this.sim.state.player.held.kind;
        if (held !== 'none' && held !== 'scanner') return { parts: [], note: 'Руки заняты' };
        const c = this.session;
        return { parts: [{ action: 'interact', text: `Взять наличные (${c?.cashGiven ?? 0})` }] };
      },
      onInteract: () => this.takeCash(),
    });
  }

  private scannerPrompt(): Prompt | null {
    const held = this.sim.state.player.held;
    if (held.kind === 'scanner') return { parts: [{ action: 'interact', text: 'Положить сканер' }] };
    if (held.kind !== 'none') return { parts: [], note: 'Руки заняты' };
    if (this.sim.state.player.tool !== 'hands') return { parts: [], note: 'Уберите метлу — клавиша 1' };
    return { parts: [{ action: 'interact', text: 'Взять сканер' }] };
  }

  private terminalPrompt(): Prompt | null {
    const c = this.session;
    if (c && c.stage === 'payment' && c.method === 'card') return { parts: [{ action: 'interact', text: `Оплата картой: ${checkoutTotal(c)}` }] };
    return { parts: [], note: 'Терминал: оплата картой — после пробивки товара' };
  }

  private drawerPrompt(): Prompt | null {
    const c = this.session;
    const held = this.sim.state.player.held;
    if (c && c.stage === 'payment' && c.method === 'cash') {
      if (held.kind === 'cash' || c.cashTaken) return { parts: [{ action: 'interact', text: `Открыть ящик • сдача ${changeDue(c)}` }] };
      return { parts: [], note: 'Сначала возьмите наличные покупателя с прилавка' };
    }
    return { parts: [], note: 'Денежный ящик' };
  }

  toggleScanner(): void {
    const s = this.sim.state;
    if (s.player.held.kind === 'scanner') {
      this.returnScanner();
      return;
    }
    if (s.player.held.kind !== 'none' || s.player.tool !== 'hands') return;
    s.player.held = { kind: 'scanner' };
    if (this.scannerNode) this.scannerNode.visible = false;
    this.game.audio.play('pickup', { vol: 0.6 });
  }

  returnScanner(): void {
    const s = this.sim.state;
    if (s.player.held.kind === 'scanner') s.player.held = { kind: 'none' };
    if (this.scannerNode) this.scannerNode.visible = true;
    this.game.audio.play('place');
  }

  private takeCash(): void {
    const c = this.session;
    const s = this.sim.state;
    if (!c || c.stage !== 'payment' || c.method !== 'cash' || c.cashTaken) return;
    if (s.player.held.kind === 'scanner') this.returnScanner();
    if (s.player.held.kind !== 'none') return;
    c.cashTaken = true;
    c.operator = c.operator ?? 'player';
    s.player.held = { kind: 'cash', amount: c.cashGiven };
    this.cashObj.visible = false;
    this.game.audio.play('cash');
    this.game.hud.setCash({ given: c.cashGiven, change: changeDue(c) });
  }

  // ───────── Сессия ─────────

  /** Покупатель подошёл к прилавку: начинается выкладка товара. */
  beginSession(customer: CustomerState): void {
    if (this.session) return;
    const items = customer.cart.map((c, i) => ({ uid: i + 1, sku: c.sku, price: c.price, scanned: false }));
    this.sim.state.checkout = {
      customerId: customer.id,
      items,
      stage: 'placing',
      method: customer.payMethod,
      cashGiven: 0,
      cashTaken: false,
      drawerOpen: false,
      change: [],
      cardConfirmed: false,
      operator: null,
    };
    this.placed = 0;
    this.placingTimer = 0.4;
    this.rebuildItems();
  }

  private slotPos(i: number, n: number): THREE.Vector3 {
    const it = COUNTER_LAYOUT.items;
    const cols = Math.min(6, Math.max(1, Math.ceil(n / 2)));
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = it.x - it.w / 2 + (it.w * (col + 0.5)) / cols;
    const z = it.z + (row === 0 ? 0.07 : -0.09);
    return this.local(x, COUNTER_LAYOUT.top + 0.002, z);
  }

  private rebuildItems(): void {
    for (const v of this.items) {
      this.root.remove(v.mesh, v.hit);
      this.game.interaction.unregister(`chk:${v.uid}`);
    }
    this.items = [];
    const c = this.session;
    if (!c) return;
    const placing = c.stage === 'placing';
    c.items.forEach((it, i) => {
      const mesh = new THREE.Mesh(this.game.assets.mergedGeometry(`prod_${it.sku}`), this.game.lib.get('flat'));
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const p = this.slotPos(i, c.items.length);
      mesh.position.copy(p);
      mesh.quaternion.setFromAxisAngle(UP, -Math.PI / 2 + (i % 3) * 0.2 - 0.2);
      const hit = hitBox(0.2, 0.22, 0.2);
      hit.position.copy(p).add(new THREE.Vector3(0, 0.1, 0));
      const shown = !it.scanned && (!placing || i < this.placed);
      mesh.visible = shown;
      this.root.add(mesh, hit);
      const view: ItemView = { uid: it.uid, mesh, hit, fly: 0, from: p.clone(), shown };
      this.items.push(view);
      this.game.interaction.register({
        id: `chk:${it.uid}`,
        hits: [hit],
        enabled: () => view.mesh.visible && view.fly === 0 && !it.scanned,
        prompt: () => this.itemPrompt(it.sku),
        onPrimary: () => this.scanByPlayer(it.uid),
      });
    });
  }

  private itemPrompt(sku: ProductId): Prompt | null {
    const c = this.session;
    const s = this.sim.state;
    if (!c || c.stage !== 'scanning') return { parts: [], note: 'Покупатель выкладывает товар…' };
    if (s.player.tool !== 'hands') return { parts: [], note: 'Уберите метлу — клавиша 1' };
    if (s.player.held.kind !== 'none' && s.player.held.kind !== 'scanner') return { parts: [], note: 'Руки заняты' };
    return { parts: [{ action: 'primary', text: `Пробить: ${PRODUCTS[sku].name} — ${this.sim.price(sku)}` }] };
  }

  private scanByPlayer(uid: number): void {
    const c = this.session;
    const s = this.sim.state;
    if (!c || c.stage !== 'scanning' || s.player.tool !== 'hands') return;
    if (s.player.held.kind === 'none') this.toggleScanner();
    if (s.player.held.kind !== 'scanner') return;
    c.operator = c.operator ?? 'player';
    this.game.viewmodel.pulse();
    this.scan(uid);
  }

  /** Пробить позицию (игрок или кассир). */
  private scan(uid: number): void {
    const c = this.session;
    if (!c) return;
    const it = c.items.find((q) => q.uid === uid);
    if (!it || it.scanned) return;
    it.scanned = true;
    this.flash = 1;
    this.game.audio.play('scan');
    const v = this.items.find((q) => q.uid === uid);
    if (v) {
      v.fly = 0.0001;
      v.from.copy(v.mesh.position);
    }
    if (allScanned(c)) this.startPayment();
  }

  private startPayment(): void {
    const c = this.session;
    if (!c) return;
    c.stage = 'payment';
    const total = checkoutTotal(c);
    if (c.method === 'cash') {
      c.cashGiven = customerCash(total, this.sim.rng);
      this.cashObj.visible = true;
    }
    this.game.customers.onPaymentStarted(c.customerId);
  }

  confirmCard(): boolean {
    const c = this.session;
    if (!c || c.stage !== 'payment' || c.method !== 'card') return false;
    c.cardConfirmed = true;
    this.game.audio.play('card');
    this.complete();
    return true;
  }

  drawerOpened(): void {
    const c = this.session;
    if (c) c.drawerOpen = true;
    this.drawerTarget = 1;
    this.game.audio.play('drawer');
  }

  drawerClosed(): void {
    const c = this.session;
    if (c) c.drawerOpen = false;
    this.drawerTarget = 0;
    this.game.hud.setCash(c && c.stage === 'payment' && c.method === 'cash' && c.cashTaken ? { given: c.cashGiven, change: changeDue(c) } : null);
  }

  /** «Выдать сдачу»: только при точной сумме. */
  giveChange(): boolean {
    const c = this.session;
    if (!c || c.stage !== 'payment' || c.method !== 'cash') return false;
    if (!changeExact(c)) {
      this.game.ui.toast('Сумма сдачи не совпадает', 'bad');
      return false;
    }
    if (c.change.length) this.game.audio.play('coin');
    this.complete();
    return true;
  }

  private complete(): void {
    const c = this.session;
    if (!c) return;
    c.stage = 'done';
    const customer = this.sim.state.customers.find((q) => q.id === c.customerId);
    this.sim.completeSale(c, customer);
    this.game.audio.play('drawer', { vol: 0.6 });
    this.sim.state.checkout = null;
    this.cashObj.visible = false;
    this.game.hud.setCash(null);
    this.drawerTarget = 0;
    this.rebuildItems();
    this.game.customers.onPaid(c.customerId);
  }

  /** Покупатель ушёл, не дождавшись (сессия отменяется). */
  cancel(customerId: string): void {
    const c = this.session;
    if (!c || c.customerId !== customerId) return;
    this.sim.state.checkout = null;
    this.cashObj.visible = false;
    if (this.sim.state.player.held.kind === 'cash') this.sim.state.player.held = { kind: 'none' };
    this.game.hud.setCash(null);
    this.game.ui.closeById('drawer');
    this.game.ui.closeById('terminal');
    this.rebuildItems();
  }

  // ───────── Кассир ─────────

  private updateCashier(dt: number): void {
    const s = this.sim.state;
    const want = s.cashierHired && (s.phase === 'open' || s.phase === 'closing' || s.phase === 'preparation');
    if (want && !this.cashier) {
      const obj = this.game.assets.instance('char_cashier');
      obj.position.set(SHOP_ORIGIN.x + COUNTER.operator.x + 0.15, FLOOR_Y, SHOP_ORIGIN.z + COUNTER.operator.z - 0.6);
      obj.rotation.y = -Math.PI / 2;
      this.root.add(obj);
      this.cashier = { obj, rig: new CharacterRig(obj) };
    } else if (!want && this.cashier) {
      this.root.remove(this.cashier.obj);
      this.cashier = null;
    }
    if (!this.cashier) return;
    this.cashier.rig.update(dt, 0);
    const c = this.session;
    this.cashierActive = !!c && c.operator !== 'player' && s.phase !== 'preparation';
    if (!c || !this.cashierActive) {
      this.cashierTimer = 0.8;
      return;
    }
    this.cashierTimer -= dt;
    if (this.cashierTimer > 0) return;
    c.operator = 'cashier';
    if (c.stage === 'scanning') {
      const next = c.items.find((it) => !it.scanned);
      if (next) {
        this.cashier.rig.reach(0.5);
        this.scan(next.uid);
      }
      this.cashierTimer = 0.65;
    } else if (c.stage === 'payment') {
      if (c.method === 'card') {
        this.cashier.rig.reach(0.6);
        c.cardConfirmed = true;
        this.game.audio.play('card');
        this.complete();
      } else {
        this.cashObj.visible = false;
        c.cashTaken = true;
        c.change = greedyChange(changeDue(c));
        this.game.audio.play('drawer', { vol: 0.5 });
        this.complete();
      }
      this.cashierTimer = 1.0;
    }
  }

  // ───────── Восстановление и кадр ─────────

  rebuild(): void {
    const c = this.session;
    if (c && c.stage === 'placing') c.stage = 'scanning';
    this.placed = c ? c.items.length : 0;
    this.cashObj.visible = !!c && c.stage === 'payment' && c.method === 'cash' && !c.cashTaken;
    this.drawerTarget = 0;
    if (this.scannerNode) this.scannerNode.visible = this.sim.state.player.held.kind !== 'scanner';
    this.game.hud.setCash(null);
    this.rebuildItems();
  }

  update(dt: number, frameDt: number): void {
    const c = this.session;
    // Выкладка товара покупателем.
    if (c && c.stage === 'placing') {
      this.placingTimer -= dt;
      if (this.placingTimer <= 0) {
        this.placingTimer = 0.35;
        if (this.placed < c.items.length) {
          const v = this.items[this.placed];
          if (v) v.mesh.visible = true;
          this.placed++;
          this.game.audio.play('place', { vol: 0.6 });
        } else {
          c.stage = 'scanning';
        }
      }
    }
    // Полёт пробитого товара в пакет.
    const bag = this.local(COUNTER_LAYOUT.bag.x, COUNTER_LAYOUT.top + 0.2, COUNTER_LAYOUT.bag.z);
    for (const v of this.items) {
      if (v.fly <= 0 || !v.mesh.visible) continue;
      v.fly += frameDt / 0.35;
      const t = Math.min(1, v.fly);
      v.mesh.position.lerpVectors(v.from, bag, t);
      v.mesh.position.y += Math.sin(t * Math.PI) * 0.15;
      v.mesh.scale.setScalar(1 - t * 0.5);
      if (t >= 1) v.mesh.visible = false;
    }
    // Ящик.
    this.drawerOpenT = damp(this.drawerOpenT, this.drawerTarget, 10, frameDt);
    if (this.drawerNode) this.drawerNode.position.z = COUNTER_LAYOUT.drawer.z - this.drawerOpenT * 0.3;
    // Экран.
    this.flash = Math.max(0, this.flash - frameDt * 3);
    const key = c ? `${c.stage}|${c.items.map((i) => (i.scanned ? 1 : 0)).join('')}|${c.cashGiven}` : 'idle';
    if (key !== this.screenKey) {
      this.screenKey = key;
      const lines = c ? c.items.map((it) => ({ name: PRODUCTS[it.sku].name, price: it.price, ok: it.scanned })) : [];
      const total = c ? c.items.filter((i) => i.scanned).reduce((a, i) => a + i.price, 0) : 0;
      const status = !c ? 'Готово' : c.stage === 'placing' ? 'Выкладка' : c.stage === 'scanning' ? 'Пробивка' : c.method === 'card' ? 'Карта' : `Наличные ${c.cashGiven}`;
      const canvas = counterScreen(lines, total, status);
      (this.screenTex.image as HTMLCanvasElement).getContext('2d')!.drawImage(canvas, 0, 0);
      this.screenTex.needsUpdate = true;
    }
    // HUD наличных.
    if (c && c.stage === 'payment' && c.method === 'cash' && (c.cashTaken || this.sim.state.player.held.kind === 'cash')) {
      if (!this.game.ui.isOpen('drawer')) this.game.hud.setCash({ given: c.cashGiven, change: changeDue(c) });
    }
    this.updateCashier(dt);
  }

  /** Есть ли активная продажа (день не закончится, пока не завершится). */
  get busy(): boolean {
    return !!this.session;
  }
}
