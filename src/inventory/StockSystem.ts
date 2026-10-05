import * as THREE from 'three';
import type { Game, System } from '../game/Game';
import type { ProductRenderer } from './ProductRenderer';
import type { NavGrid } from '../world/Navigation';
import { hitBox, type Interactable, type Prompt } from '../player/Interaction';
import { FURNITURE, type FurnitureType } from '../data/equipment';
import { PRODUCTS, type ProductId } from '../data/products';
import { BALANCE } from '../data/balance';
import { sectionKey, type BoxState, type FurnitureState } from '../game/state';
import { sectionGeoms, rackSlots, furnitureMatrix, footprint, type SectionGeom } from '../equipment/Layouts';
import { SHOP_ORIGIN, FLOOR_Y, deliverySlots, DUMPSTER, KEEP_CLEAR, PLACEMENT_AREAS, COUNTER, SHOP } from '../world/shopLayout';
import { BOX_SIZE3 } from '../art/models/products';
import { priceTag, boxLabel } from '../art/SignFactory';
import { toTexture } from '../art/TextureFactory';
import type { HeldVisual } from '../player/Viewmodel';

interface SectionView {
  key: string;
  geom: SectionGeom;
  hit: THREE.Mesh;
  tag: THREE.Mesh;
  slots: THREE.Matrix4[];
  /** Единицы в полёте к секции (ещё не видны на полке). */
  incoming: number;
}

interface FurnitureView {
  state: FurnitureState;
  obj: THREE.Object3D;
  matrix: THREE.Matrix4;
  colliderId: number;
  sections: SectionView[];
  rack: { hit: THREE.Mesh; pos: THREE.Matrix4; index: number }[];
}

interface BoxView {
  id: string;
  obj: THREE.Object3D;
  hit: THREE.Mesh;
  colliderId: number | null;
  open: boolean;
  sku: ProductId | null;
  matrix: THREE.Matrix4;
}

interface Flying {
  mesh: THREE.Mesh;
  from: THREE.Vector3;
  to: THREE.Vector3;
  q0: THREE.Quaternion;
  q1: THREE.Quaternion;
  t: number;
  dur: number;
  onLand: () => void;
  toCamera: boolean;
}

interface PlacementState {
  type: FurnitureType;
  moveId: string | null;
  ghost: THREE.Object3D;
  rotY: number;
  x: number;
  z: number;
  valid: boolean;
  reason: string;
}

const UP = new THREE.Vector3(0, 1, 0);
const tmpV = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const tmpS = new THREE.Vector3();

/**
 * Товар в магазине: мебель с секциями и ценниками, коробки (доставка, склад, пол, руки),
 * раскладка/возврат единиц с анимацией, режим расстановки мебели.
 */
export class StockSystem implements System {
  private furniture = new Map<string, FurnitureView>();
  private boxes = new Map<string, BoxView>();
  private flying: Flying[] = [];
  private priceMats = new Map<string, THREE.Material>();
  private root = new THREE.Group();
  private deliveryHits: { hit: THREE.Mesh; index: number; pos: THREE.Vector3 }[] = [];
  /** Единицы, летящие в коробку в руках (для показа во вьюмодели). */
  private toBoxPending = 0;
  placement: PlacementState | null = null;
  private ghostOk: THREE.Material;
  private ghostBad: THREE.Material;
  private stockCooldown = 0;
  private unsub: (() => void)[] = [];

  constructor(
    private readonly game: Game,
    private readonly products: ProductRenderer,
    readonly nav: NavGrid,
  ) {
    this.root.name = 'stock';
    game.scene.add(this.root);
    this.ghostOk = new THREE.MeshBasicMaterial({ color: 0x4fd17a, transparent: true, opacity: 0.42, depthWrite: false });
    this.ghostBad = new THREE.MeshBasicMaterial({ color: 0xe0503a, transparent: true, opacity: 0.42, depthWrite: false });
    for (const id of Object.keys(PRODUCTS) as ProductId[]) {
      game.lib.registerSign(`box_${id}`, () => boxLabel(PRODUCTS[id].name, PRODUCTS[id].color));
    }
    this.buildStatic();
    const ev = game.sim.events;
    this.unsub.push(
      ev.on('section', ({ key }) => this.onSection(key)),
      ev.on('box', ({ id }) => this.syncBox(id)),
      ev.on('boxRemoved', ({ id }) => this.removeBoxView(id)),
      ev.on('furniture', ({ id }) => this.syncFurniture(id)),
      ev.on('price', ({ sku }) => this.refreshTags(sku)),
    );
    products.setSource('shelves', (emit) => this.emitShelves(emit));
    products.setSource('boxes', (emit) => this.emitBoxes(emit));
  }

  private get sim() {
    return this.game.sim;
  }

  // ───────── Статика: зона доставки и контейнер ─────────

  private buildStatic(): void {
    const slots = deliverySlots();
    slots.forEach((p, i) => {
      const pos = new THREE.Vector3(p.x + SHOP_ORIGIN.x, p.y, p.z + SHOP_ORIGIN.z);
      const hit = hitBox(0.52, 0.34, 0.4);
      hit.position.copy(pos).add(new THREE.Vector3(0, 0.17, 0));
      this.root.add(hit);
      this.deliveryHits.push({ hit, index: i, pos });
      this.game.interaction.register({
        id: `dslot:${i}`,
        hits: [hit],
        enabled: () => this.heldBox() !== null && !this.sim.state.boxes.some((b) => b.loc.kind === 'delivery' && b.loc.slot === i),
        prompt: () => ({ parts: [{ action: 'interact', text: 'Поставить в зону доставки' }] }),
        onInteract: () => this.putHeldBox({ kind: 'delivery', slot: i }),
      });
    });
    // Контейнер для мусора.
    const dHit = hitBox(1.2, 1.3, 2.0);
    dHit.position.set(DUMPSTER.x, 0.65, DUMPSTER.z);
    dHit.rotation.y = DUMPSTER.rotY;
    this.root.add(dHit);
    this.game.interaction.register({
      id: 'dumpster',
      hits: [dHit],
      reach: 3,
      prompt: () => this.dumpsterPrompt(),
      onInteract: () => this.dumpsterUse(),
    });
  }

  private dumpsterPrompt(): Prompt | null {
    const held = this.sim.state.player.held;
    if (held.kind === 'box') {
      const b = this.sim.inventory.box(held.boxId);
      if (b && b.count > 0) return { parts: [], note: 'Коробка не пустая — выбросить можно только пустую' };
      return { parts: [{ action: 'interact', text: 'Выбросить пустую коробку' }] };
    }
    if (held.kind === 'boards') return { parts: [{ action: 'interact', text: held.indices.length > 1 ? `Выбросить доски (${held.indices.length})` : 'Выбросить доску' }] };
    if (held.kind === 'trash') return { parts: [{ action: 'interact', text: 'Выбросить мусор' }] };
    return { parts: [], note: 'Контейнер для досок, мусора и пустых коробок' };
  }

  private dumpsterUse(): void {
    const s = this.sim.state;
    const held = s.player.held;
    if (held.kind === 'box') {
      const r = this.sim.inventory.discardBox(held.boxId);
      if (r.ok) {
        s.player.held = { kind: 'none' };
        this.game.audio.play('trash');
      } else this.game.ui.toast(r.reason, 'bad');
    } else if (held.kind === 'boards') {
      for (const i of held.indices) this.sim.restoration.disposeBoard(i);
      s.player.held = { kind: 'none' };
      this.game.audio.play('trash');
    } else if (held.kind === 'trash') {
      for (const i of held.indices) this.sim.restoration.disposeWaste(i);
      s.player.held = { kind: 'none' };
      this.game.audio.play('trash');
    }
  }

  // ───────── Пересборка ─────────

  rebuild(): void {
    for (const id of [...this.furniture.keys()]) this.removeFurnitureView(id);
    for (const id of [...this.boxes.keys()]) this.removeBoxView(id);
    for (const f of this.flying) this.root.remove(f.mesh);
    this.flying = [];
    this.toBoxPending = 0;
    this.cancelPlacement();
    for (const f of this.sim.state.furniture) this.syncFurniture(f.id);
    for (const b of this.sim.state.boxes) this.syncBox(b.id);
    this.rebuildNav();
    this.products.markDirty();
  }

  // ───────── Мебель ─────────

  private furnitureWorldY(): number {
    return FLOOR_Y;
  }

  private syncFurniture(id: string): void {
    const st = this.sim.state.furniture.find((f) => f.id === id);
    if (!st) {
      this.removeFurnitureView(id);
      return;
    }
    this.removeFurnitureView(id);
    const def = FURNITURE[st.type];
    const obj = this.game.assets.instance(def.modelId);
    const y = this.furnitureWorldY();
    obj.position.set(st.x, y, st.z);
    obj.rotation.y = st.rotY;
    this.root.add(obj);
    obj.updateMatrixWorld(true);
    const matrix = furnitureMatrix(st.x, y, st.z, st.rotY);
    const fp = footprint(def.w, def.d, st.rotY);
    const colliderId = this.game.village.colliders.box(st.x, st.z, fp.hw, fp.hd, 0, `furniture:${id}`);
    const view: FurnitureView = { state: st, obj, matrix, colliderId, sections: [], rack: [] };
    // Секции.
    sectionGeoms(st.type).forEach((g, i) => {
      const key = sectionKey(id, i);
      const hit = hitBox(g.size.x, g.size.y, g.size.z);
      hit.position.copy(g.center).add(new THREE.Vector3(0, g.size.y / 2, 0)).applyMatrix4(matrix);
      hit.quaternion.setFromAxisAngle(UP, st.rotY);
      this.root.add(hit);
      const tag = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.06), this.priceMat(null));
      tag.position.copy(g.tag).applyMatrix4(matrix);
      tag.quaternion.setFromAxisAngle(UP, st.rotY + g.tagRotY);
      tag.visible = false;
      this.root.add(tag);
      const slots = g.slots.map((p) => {
        const local = new THREE.Matrix4().compose(p, new THREE.Quaternion().setFromAxisAngle(UP, g.rotY), new THREE.Vector3(1, 1, 1));
        return matrix.clone().multiply(local);
      });
      const sv: SectionView = { key, geom: g, hit, tag, slots, incoming: 0 };
      view.sections.push(sv);
      this.game.interaction.register(this.sectionInteractable(sv));
      this.updateTag(sv);
    });
    // Места под коробки (складской стеллаж).
    if (def.boxSlots > 0) {
      rackSlots().forEach((p, i) => {
        const hit = hitBox(0.9, 0.42, 0.6);
        const pos = p.clone().add(new THREE.Vector3(0, 0.21, 0)).applyMatrix4(matrix);
        hit.position.copy(pos);
        hit.quaternion.setFromAxisAngle(UP, st.rotY);
        this.root.add(hit);
        const pm = matrix.clone().multiply(new THREE.Matrix4().makeTranslation(p.x, p.y, p.z));
        view.rack.push({ hit, pos: pm, index: i });
        this.game.interaction.register({
          id: `rack:${id}:${i}`,
          hits: [hit],
          enabled: () => this.heldBox() !== null && !this.sim.state.boxes.some((b) => b.loc.kind === 'rack' && b.loc.furnitureId === id && b.loc.slot === i),
          prompt: () => ({ parts: [{ action: 'interact', text: 'Поставить на стеллаж' }] }),
          onInteract: () => this.putHeldBox({ kind: 'rack', furnitureId: id, slot: i }),
        });
      });
    }
    this.furniture.set(id, view);
    this.rebuildNav();
    // Коробки на этом стеллаже — перепривязать.
    for (const b of this.sim.state.boxes) if (b.loc.kind === 'rack' && b.loc.furnitureId === id) this.syncBox(b.id);
    this.products.markDirty();
  }

  private removeFurnitureView(id: string): void {
    const v = this.furniture.get(id);
    if (!v) return;
    this.root.remove(v.obj);
    this.game.village.colliders.remove(v.colliderId);
    for (const s of v.sections) {
      this.root.remove(s.hit, s.tag);
      this.game.interaction.unregister(`sec:${s.key}`);
    }
    for (const r of v.rack) {
      this.root.remove(r.hit);
      this.game.interaction.unregister(`rack:${id}:${r.index}`);
    }
    this.furniture.delete(id);
  }

  /** Точки доступа покупателей к секции (мировые). */
  accessPoint(key: string): THREE.Vector3 | null {
    for (const v of this.furniture.values()) {
      const s = v.sections.find((q) => q.key === key);
      if (s) return s.geom.access.clone().applyMatrix4(v.matrix);
    }
    return null;
  }

  /** Мировая позиция места единицы в секции (для анимации покупателя). */
  slotWorld(key: string, slot: number): THREE.Vector3 | null {
    for (const v of this.furniture.values()) {
      const s = v.sections.find((q) => q.key === key);
      if (s) return new THREE.Vector3().setFromMatrixPosition(s.slots[Math.max(0, Math.min(7, slot))]!);
    }
    return null;
  }

  /** Перестроить динамические препятствия навигации из мебели. */
  rebuildNav(): void {
    this.nav.resetDynamic();
    for (const v of this.furniture.values()) {
      const def = FURNITURE[v.state.type];
      const fp = footprint(def.w, def.d, v.state.rotY);
      this.nav.blockRect(v.state.x, v.state.z, fp.hw, fp.hd, 0.3);
    }
  }

  // ───────── Секции и ценники ─────────

  private priceMat(key: string | null): THREE.Material {
    const k = key ?? 'none';
    let m = this.priceMats.get(k);
    if (!m) {
      if (!key) m = new THREE.MeshBasicMaterial({ color: 0xffffff, visible: false });
      else {
        const [sku, price] = key.split(':') as [ProductId, string];
        const tex = toTexture(priceTag(Number(price), PRODUCTS[sku].short), { repeat: false });
        m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 });
      }
      this.priceMats.set(k, m);
    }
    return m;
  }

  private updateTag(sv: SectionView): void {
    const sec = this.sim.inventory.section(sv.key);
    if (!sec || !sec.sku) {
      sv.tag.visible = false;
      return;
    }
    sv.tag.visible = true;
    sv.tag.material = this.priceMat(`${sec.sku}:${this.sim.price(sec.sku)}`);
  }

  private refreshTags(sku: ProductId): void {
    for (const v of this.furniture.values()) for (const s of v.sections) if (this.sim.inventory.section(s.key)?.sku === sku) this.updateTag(s);
  }

  private onSection(key: string): void {
    for (const v of this.furniture.values()) {
      const s = v.sections.find((q) => q.key === key);
      if (s) this.updateTag(s);
    }
    this.products.markDirty();
  }

  private sectionInteractable(sv: SectionView): Interactable {
    return {
      id: `sec:${sv.key}`,
      hits: [sv.hit],
      enabled: () => this.sim.state.player.tool === 'hands',
      prompt: () => this.sectionPrompt(sv),
      onInteract: () => {
        const sec = this.sim.inventory.section(sv.key);
        if (this.sim.state.player.held.kind === 'none' && sec?.sku) this.game.ui.openPrice(sec.sku);
        else if (this.heldBox()) this.dropHeldBoxOnFloor();
      },
      onPrimary: () => this.stockInto(sv),
      onPrimaryHold: (dt) => {
        // Удержание ЛКМ — раскладка подряд.
        this.stockCooldown -= dt;
        if (this.stockCooldown <= 0) this.stockInto(sv);
      },
      onSecondary: () => this.takeFrom(sv),
    };
  }

  private sectionPrompt(sv: SectionView): Prompt | null {
    const s = this.sim.state;
    const sec = this.sim.inventory.section(sv.key);
    const held = s.player.held;
    if (held.kind === 'box') {
      const box = this.sim.inventory.box(held.boxId);
      if (!box) return null;
      if (!box.open) return { parts: [{ action: 'primary', text: 'Открыть коробку' }, { action: 'interact', text: 'Поставить на пол' }] };
      const parts: Prompt['parts'] = [];
      let note: string | undefined;
      if (box.sku && box.count > 0) {
        const chk = this.sim.inventory.canStock(sv.key, box.sku);
        if (chk.ok) parts.push({ action: 'primary', text: `Положить ${PRODUCTS[box.sku].name.toLowerCase()}` });
        else note = chk.reason;
      }
      if (sec?.sku && (box.sku === null || box.sku === sec.sku) && box.count < 8 && this.sim.inventory.available(sv.key) > 0) parts.push({ action: 'secondary', text: 'Забрать в коробку' });
      if (!parts.length && !note) note = box.count === 0 ? 'Коробка пуста' : undefined;
      return { parts, note };
    }
    if (held.kind === 'none' && s.player.tool === 'hands') {
      if (sec?.sku) {
        const n = sec.count;
        return { parts: [{ action: 'interact', text: `Цена: ${PRODUCTS[sec.sku].name} — ${this.sim.price(sec.sku)}` }], note: `${n}/8` };
      }
      const storage = this.sim.inventory.storageOf(sv.key);
      return { parts: [], note: storage === 'chilled' ? 'Пустая секция холодильника' : storage === 'frozen' ? 'Пустая секция морозильника' : 'Пустая секция' };
    }
    return null;
  }

  /** Положить единицу из коробки в руках на полку. */
  private stockInto(sv: SectionView): void {
    const held = this.sim.state.player.held;
    if (held.kind !== 'box') return;
    const box = this.sim.inventory.box(held.boxId);
    if (!box) return;
    if (!box.open) {
      this.openHeld();
      return;
    }
    if (!box.sku || box.count <= 0) return;
    const sec = this.sim.inventory.section(sv.key);
    const slotIndex = sec ? sec.count : 0;
    const sku = box.sku;
    const r = this.sim.inventory.boxToSection(box.id, sv.key);
    if (!r.ok) {
      this.game.ui.toast(r.reason, 'bad');
      this.stockCooldown = 0.6;
      return;
    }
    this.stockCooldown = 0.32;
    if (!this.sim.state.tutorial.stocked.includes(sku)) this.sim.state.tutorial.stocked.push(sku);
    sv.incoming++;
    this.products.markDirty();
    const target = sv.slots[slotIndex]!;
    this.fly(sku, this.boxWorldPoint(), target, false, () => {
      sv.incoming = Math.max(0, sv.incoming - 1);
      this.products.markDirty();
      this.game.audio.play('place');
    });
    this.game.viewmodel.pulse();
  }

  /** Вернуть единицу с полки в коробку (ПКМ). */
  private takeFrom(sv: SectionView): void {
    const held = this.sim.state.player.held;
    if (held.kind !== 'box') return;
    const box = this.sim.inventory.box(held.boxId);
    const sec = this.sim.inventory.section(sv.key);
    if (!box || !sec || !sec.sku) return;
    if (!box.open) {
      this.openHeld();
      return;
    }
    const slotIndex = sec.count - 1;
    const sku = sec.sku;
    const from = sv.slots[Math.max(0, slotIndex)]!.clone();
    const r = this.sim.inventory.sectionToBox(sv.key, box.id);
    if (!r.ok) {
      this.game.ui.toast(r.reason, 'bad');
      return;
    }
    this.toBoxPending++;
    this.fly(sku, from, null, true, () => {
      this.toBoxPending = Math.max(0, this.toBoxPending - 1);
      this.game.audio.play('place');
    });
  }

  private emitShelves(emit: (sku: ProductId, m: THREE.Matrix4) => void): void {
    for (const v of this.furniture.values()) {
      for (const s of v.sections) {
        const sec = this.sim.inventory.section(s.key);
        if (!sec || !sec.sku) continue;
        const visible = Math.max(0, sec.count - s.incoming);
        for (let i = 0; i < visible && i < 8; i++) emit(sec.sku, s.slots[i]!);
      }
    }
  }

  // ───────── Коробки ─────────

  heldBox(): BoxState | null {
    const held = this.sim.state.player.held;
    if (held.kind !== 'box') return null;
    return this.sim.inventory.box(held.boxId) ?? null;
  }

  private boxWorldMatrix(b: BoxState): THREE.Matrix4 | null {
    const loc = b.loc;
    if (loc.kind === 'delivery') {
      const p = this.deliveryHits[loc.slot]?.pos;
      if (!p) return null;
      return new THREE.Matrix4().compose(p, new THREE.Quaternion().setFromAxisAngle(UP, ((loc.slot % 3) - 1) * 0.06), new THREE.Vector3(1, 1, 1));
    }
    if (loc.kind === 'rack') {
      const v = this.furniture.get(loc.furnitureId);
      const r = v?.rack[loc.slot];
      if (!r) return null;
      return r.pos.clone();
    }
    if (loc.kind === 'floor') {
      return new THREE.Matrix4().compose(new THREE.Vector3(loc.x, loc.y, loc.z), new THREE.Quaternion().setFromAxisAngle(UP, loc.rotY), new THREE.Vector3(1, 1, 1));
    }
    return null;
  }

  private syncBox(id: string): void {
    const b = this.sim.inventory.box(id);
    if (!b) {
      this.removeBoxView(id);
      return;
    }
    const m = this.boxWorldMatrix(b);
    if (!m) {
      this.removeBoxView(id);
      this.products.markDirty();
      return;
    }
    let v = this.boxes.get(id);
    if (!v) {
      const obj = this.game.assets.instance('box_cardboard');
      const hit = hitBox(BOX_SIZE3.w + 0.04, BOX_SIZE3.h + 0.04, BOX_SIZE3.d + 0.04);
      this.root.add(obj, hit);
      v = { id, obj, hit, colliderId: null, open: false, sku: null, matrix: new THREE.Matrix4() };
      this.boxes.set(id, v);
      const vv = v;
      this.game.interaction.register({
        id: `box:${id}`,
        hits: [hit],
        enabled: () => this.sim.state.player.held.kind === 'none' && this.sim.state.player.tool === 'hands' && !this.placement,
        prompt: () => {
          const bb = this.sim.inventory.box(id);
          if (!bb) return null;
          const what = bb.sku ? `${PRODUCTS[bb.sku].name} ${bb.count}/8` : 'пустая';
          return { parts: [{ action: 'interact', text: `Взять коробку (${what})` }] };
        },
        onInteract: () => this.pickBox(vv.id),
      });
    }
    v.matrix.copy(m);
    m.decompose(tmpV, tmpQ, tmpS);
    v.obj.position.copy(tmpV);
    v.obj.quaternion.copy(tmpQ);
    v.hit.position.copy(tmpV).add(new THREE.Vector3(0, BOX_SIZE3.h / 2, 0));
    v.hit.quaternion.copy(tmpQ);
    v.open = b.open;
    v.sku = b.sku;
    this.setBoxLook(v.obj, b);
    if (v.colliderId !== null) {
      this.game.village.colliders.remove(v.colliderId);
      v.colliderId = null;
    }
    if (b.loc.kind === 'floor') v.colliderId = this.game.village.colliders.box(tmpV.x, tmpV.z, 0.27, 0.2, b.loc.rotY, 'box');
    this.products.markDirty();
  }

  /** Клапаны и этикетки коробки. */
  setBoxLook(obj: THREE.Object3D, b: { open: boolean; sku: ProductId | null }): void {
    const flaps: Record<string, number> = { flap_N: -2.3, flap_S: 2.3, flap_W: 2.2, flap_E: -2.2 };
    for (const [name, ang] of Object.entries(flaps)) {
      const f = obj.getObjectByName(name);
      if (!f) continue;
      if (name === 'flap_N' || name === 'flap_S') f.rotation.x = b.open ? ang : 0;
      else f.rotation.z = b.open ? ang : 0;
    }
    const mat = this.game.lib.get(b.sku ? `sign:box_${b.sku}` : 'sign:box_generic');
    for (const n of ['label_F', 'label_B']) {
      obj.getObjectByName(n)?.traverse((m) => {
        if ((m as THREE.Mesh).isMesh) (m as THREE.Mesh).material = mat;
      });
    }
  }

  private removeBoxView(id: string): void {
    const v = this.boxes.get(id);
    if (!v) return;
    this.root.remove(v.obj, v.hit);
    if (v.colliderId !== null) this.game.village.colliders.remove(v.colliderId);
    this.game.interaction.unregister(`box:${id}`);
    this.boxes.delete(id);
    this.products.markDirty();
  }

  private emitBoxes(emit: (sku: ProductId, m: THREE.Matrix4) => void): void {
    const { w, d } = BOX_SIZE3;
    for (const v of this.boxes.values()) {
      if (!v.open) continue;
      const b = this.sim.inventory.box(v.id);
      if (!b || !b.sku) continue;
      for (let i = 0; i < b.count; i++) {
        const col = i % 4;
        const row = Math.floor(i / 4);
        const local = new THREE.Matrix4().makeTranslation(-w / 2 + w * ((col + 0.5) / 4), 0.03, -d / 2 + d * ((row + 0.5) / 2));
        emit(b.sku, v.matrix.clone().multiply(local));
      }
    }
  }

  private pickBox(id: string): void {
    const s = this.sim.state;
    if (s.player.held.kind !== 'none') return;
    if (s.player.tool === 'broom') s.player.tool = 'hands';
    this.sim.inventory.moveBox(id, { kind: 'held' });
    s.player.held = { kind: 'box', boxId: id };
    this.game.audio.play('pickup');
  }

  openHeld(): void {
    const b = this.heldBox();
    if (!b || b.open) return;
    this.sim.inventory.openBox(b.id);
    this.game.audio.play('boxOpen');
  }

  private putHeldBox(loc: BoxState['loc']): void {
    const b = this.heldBox();
    if (!b) return;
    this.sim.inventory.moveBox(b.id, loc);
    this.sim.state.player.held = { kind: 'none' };
    this.game.audio.play('drop');
  }

  /** Можно ли поставить коробку на пол в точке. */
  floorDropCheck(p: THREE.Vector3 | null): { ok: boolean; reason?: string } {
    if (!p) return { ok: false, reason: 'Смотрите на пол' };
    const pl = this.game.player.position;
    if (Math.hypot(p.x - pl.x, p.z - pl.z) > 2.2) return { ok: false, reason: 'Слишком далеко' };
    const lx = p.x - SHOP_ORIGIN.x;
    const lz = p.z - SHOP_ORIGIN.z;
    for (const r of KEEP_CLEAR) if (lx > r.x0 && lx < r.x1 && lz > r.z0 && lz < r.z1) return { ok: false, reason: 'Здесь проход — не загораживайте' };
    if (!this.game.village.colliders.isFree(p.x, p.z, 0.3)) return { ok: false, reason: 'Нет места' };
    return { ok: true };
  }

  dropHeldBoxOnFloor(p: THREE.Vector3 | null = this.game.interaction.floorPoint): void {
    const b = this.heldBox();
    if (!b) return;
    const chk = this.floorDropCheck(p);
    if (!chk.ok || !p) {
      this.game.ui.toast(chk.reason ?? 'Нельзя', 'bad');
      return;
    }
    this.putHeldBox({ kind: 'floor', x: p.x, y: p.y, z: p.z, rotY: this.game.player.yaw });
  }

  /** Точка «в коробке в руках» в мире (начало/конец полёта единицы). */
  private boxWorldPoint(): THREE.Vector3 {
    const cam = this.game.camera;
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const down = new THREE.Vector3(0, -1, 0).applyQuaternion(cam.quaternion);
    return cam.position.clone().addScaledVector(fwd, 0.62).addScaledVector(down, 0.32);
  }

  private fly(sku: ProductId, from: THREE.Vector3 | THREE.Matrix4, to: THREE.Matrix4 | null, toCamera: boolean, onLand: () => void): void {
    const mesh = new THREE.Mesh(this.products.geometry(sku), this.game.lib.get('flat'));
    mesh.castShadow = false;
    const f0 = from instanceof THREE.Matrix4 ? new THREE.Vector3().setFromMatrixPosition(from) : from.clone();
    const q0 = from instanceof THREE.Matrix4 ? new THREE.Quaternion().setFromRotationMatrix(from) : new THREE.Quaternion().setFromAxisAngle(UP, this.game.player.yaw);
    const t0 = to ? new THREE.Vector3().setFromMatrixPosition(to) : this.boxWorldPoint();
    const q1 = to ? new THREE.Quaternion().setFromRotationMatrix(to) : new THREE.Quaternion().setFromAxisAngle(UP, this.game.player.yaw);
    mesh.position.copy(f0);
    mesh.quaternion.copy(q0);
    this.root.add(mesh);
    this.flying.push({ mesh, from: f0, to: t0, q0, q1, t: 0, dur: BALANCE.stockAnimSec, onLand, toCamera });
  }

  // ───────── Расстановка мебели ─────────

  startPlacement(type: FurnitureType, moveId: string | null = null): boolean {
    if (moveId && this.sim.equipment.busy(moveId)) {
      this.game.ui.toast('Покупатели берут товар с этой мебели — подождите', 'bad');
      return false;
    }
    if (this.sim.state.player.held.kind !== 'none') {
      this.game.ui.toast('Освободите руки', 'bad');
      return false;
    }
    this.cancelPlacement();
    const def = FURNITURE[type];
    const ghost = this.game.assets.instance(def.modelId);
    ghost.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        (o as THREE.Mesh).material = this.ghostOk;
        (o as THREE.Mesh).castShadow = false;
      }
    });
    this.root.add(ghost);
    const existing = moveId ? this.sim.state.furniture.find((f) => f.id === moveId) : null;
    this.placement = { type, moveId, ghost, rotY: existing?.rotY ?? 0, x: existing?.x ?? 0, z: existing?.z ?? 0, valid: false, reason: '' };
    if (moveId) {
      const v = this.furniture.get(moveId);
      if (v) v.obj.visible = false;
      const vv = this.furniture.get(moveId);
      if (vv) this.game.village.colliders.remove(vv.colliderId);
    }
    this.game.interaction.enabled = true;
    return true;
  }

  cancelPlacement(): void {
    const p = this.placement;
    if (!p) return;
    this.root.remove(p.ghost);
    if (p.moveId) {
      const v = this.furniture.get(p.moveId);
      if (v) {
        v.obj.visible = true;
        v.colliderId = this.restoreCollider(v);
      }
    }
    this.placement = null;
  }

  private restoreCollider(v: FurnitureView): number {
    const def = FURNITURE[v.state.type];
    const fp = footprint(def.w, def.d, v.state.rotY);
    return this.game.village.colliders.box(v.state.x, v.state.z, fp.hw, fp.hd, 0, `furniture:${v.state.id}`);
  }

  rotatePlacement(): void {
    if (!this.placement) return;
    this.placement.rotY = (this.placement.rotY + Math.PI / 2) % (Math.PI * 2);
    this.game.audio.play('click');
  }

  confirmPlacement(): boolean {
    const p = this.placement;
    if (!p) return false;
    if (!p.valid) {
      this.game.ui.toast(p.reason || 'Сюда нельзя', 'bad');
      return false;
    }
    this.root.remove(p.ghost);
    this.placement = null;
    if (p.moveId) {
      this.sim.equipment.move(p.moveId, p.x, p.z, p.rotY);
      const v = this.furniture.get(p.moveId);
      if (v) v.obj.visible = true;
    } else {
      this.sim.equipment.place(p.type, p.x, p.z, p.rotY);
      if (p.type === 'shelf') this.sim.state.tutorial.shelfPlaced = true;
    }
    this.game.audio.play('place');
    return true;
  }

  private updatePlacement(): void {
    const p = this.placement;
    if (!p) return;
    const def = FURNITURE[p.type];
    const fp = footprint(def.w, def.d, p.rotY);
    const pl = this.game.player;
    let pt = this.game.interaction.floorPoint;
    if (!pt) {
      const f = pl.forward();
      pt = new THREE.Vector3(pl.position.x + f.x * 2.6, 0, pl.position.z + f.z * 2.6);
    }
    const snap = 0.25;
    // Центр основания: снап так, чтобы края ложились на сетку.
    p.x = Math.round((pt.x - fp.hw) / snap) * snap + fp.hw;
    p.z = Math.round((pt.z - fp.hd) / snap) * snap + fp.hd;
    p.ghost.position.set(p.x, FLOOR_Y + 0.01, p.z);
    p.ghost.rotation.y = p.rotY;
    const chk = this.checkPlacement(p.type, p.x, p.z, p.rotY, p.moveId);
    p.valid = chk.ok;
    p.reason = chk.reason ?? '';
    const mat = p.valid ? this.ghostOk : this.ghostBad;
    p.ghost.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).material = mat;
    });
  }

  /** Проверка места под мебель: зона, проходы, пересечения, достижимость. */
  checkPlacement(type: FurnitureType, x: number, z: number, rotY: number, ignoreId: string | null): { ok: boolean; reason?: string } {
    const def = FURNITURE[type];
    const fp = footprint(def.w, def.d, rotY);
    const lx = x - SHOP_ORIGIN.x;
    const lz = z - SHOP_ORIGIN.z;
    const inArea = (a: { x0: number; x1: number; z0: number; z1: number }) => lx - fp.hw >= a.x0 + 0.02 && lx + fp.hw <= a.x1 - 0.02 && lz - fp.hd >= a.z0 + 0.02 && lz + fp.hd <= a.z1 - 0.02;
    const okHall = inArea(PLACEMENT_AREAS.hall);
    const okWh = def.area === 'any' && inArea(PLACEMENT_AREAS.warehouse);
    if (!okHall && !okWh) return { ok: false, reason: def.area === 'hall' ? 'Только в торговом зале' : 'Только в зале или на складе' };
    if (okHall) {
      for (const r of KEEP_CLEAR) {
        if (lx + fp.hw > r.x0 && lx - fp.hw < r.x1 && lz + fp.hd > r.z0 && lz - fp.hd < r.z1) return { ok: false, reason: 'Нельзя загораживать вход, кассу и двери' };
      }
    }
    // Пересечения с мебелью.
    for (const v of this.furniture.values()) {
      if (v.state.id === ignoreId) continue;
      const d2 = FURNITURE[v.state.type];
      const f2 = footprint(d2.w, d2.d, v.state.rotY);
      if (Math.abs(v.state.x - x) < fp.hw + f2.hw + 0.05 && Math.abs(v.state.z - z) < fp.hd + f2.hd + 0.05) return { ok: false, reason: 'Мешает другая мебель' };
    }
    // Коробки на полу.
    for (const b of this.sim.state.boxes) {
      if (b.loc.kind !== 'floor') continue;
      if (Math.abs(b.loc.x - x) < fp.hw + 0.3 && Math.abs(b.loc.z - z) < fp.hd + 0.3) return { ok: false, reason: 'Мешает коробка на полу' };
    }
    // Игрок не должен оказаться внутри.
    const pl = this.game.player.position;
    if (Math.abs(pl.x - x) < fp.hw + 0.3 && Math.abs(pl.z - z) < fp.hd + 0.3) return { ok: false, reason: 'Отойдите немного' };
    // Достижимость: вход → касса и доступ ко всем секциям.
    if (okHall && def.sections > 0) {
      const snapshot = this.nav.blocked.slice();
      this.nav.blockRect(x, z, fp.hw, fp.hd, 0.3);
      const entry = { x: SHOP_ORIGIN.x, z: SHOP_ORIGIN.z + SHOP.hall.z0 + 0.6 };
      const q0 = { x: SHOP_ORIGIN.x + COUNTER.queue[0].x, z: SHOP_ORIGIN.z + COUNTER.queue[0].z };
      let ok = this.nav.reachable(entry.x, entry.z, q0.x, q0.z);
      if (ok) {
        const geoms = sectionGeoms(type);
        const m = furnitureMatrix(x, 0, z, rotY);
        const seen = new Set<string>();
        for (const g of geoms) {
          const a = g.access.clone().applyMatrix4(m);
          const k = `${a.x.toFixed(1)},${a.z.toFixed(1)}`;
          if (seen.has(k)) continue;
          seen.add(k);
          if (!this.nav.reachable(entry.x, entry.z, a.x, a.z)) {
            ok = false;
            break;
          }
        }
      }
      if (ok) {
        for (const v of this.furniture.values()) {
          if (v.state.id === ignoreId || FURNITURE[v.state.type].sections === 0) continue;
          const g0 = sectionGeoms(v.state.type)[0]!;
          const a = g0.access.clone().applyMatrix4(v.matrix);
          if (!this.nav.reachable(entry.x, entry.z, a.x, a.z)) {
            ok = false;
            break;
          }
        }
      }
      this.nav.blocked.set(snapshot);
      if (!ok) return { ok: false, reason: 'Перекрывает проход покупателям' };
    }
    return { ok: true };
  }

  placementPrompt(): Prompt | null {
    const p = this.placement;
    if (!p) return null;
    return {
      parts: [
        { action: 'primary', text: 'Поставить' },
        { action: 'rotate', text: 'Повернуть' },
        { action: 'secondary', text: 'Отмена' },
      ],
      note: p.valid ? undefined : p.reason,
    };
  }

  // ───────── Кадр ─────────

  update(dt: number): void {
    // Полёты единиц.
    for (let i = this.flying.length - 1; i >= 0; i--) {
      const f = this.flying[i]!;
      f.t += dt / f.dur;
      const t = Math.min(1, f.t);
      const e = t * t * (3 - 2 * t);
      const to = f.toCamera ? this.boxWorldPoint() : f.to;
      f.mesh.position.lerpVectors(f.from, to, e);
      f.mesh.position.y += Math.sin(Math.PI * t) * 0.14;
      f.mesh.quaternion.slerpQuaternions(f.q0, f.q1, e);
      if (t >= 1) {
        this.root.remove(f.mesh);
        this.flying.splice(i, 1);
        f.onLand();
      }
    }
    if (this.placement) this.updatePlacement();
    this.products.update();
  }

  /** Как показать коробку в руках (единицы в полёте ещё не видны). */
  heldBoxVisual(): HeldVisual | null {
    const hb = this.heldBox();
    if (!hb) return null;
    return { kind: 'box', sku: hb.sku, count: Math.max(0, hb.count - this.toBoxPending), open: hb.open };
  }

  /** Нужна ли сейчас обработка ввода расстановки (вызов из системы игрока). */
  handlePlacementInput(): boolean {
    if (!this.placement) return false;
    const inp = this.game.input;
    if (inp.wasPressed('rotate')) this.rotatePlacement();
    if (inp.wasPressed('primary') || inp.wasPressed('confirm') || inp.wasPressed('interact')) this.confirmPlacement();
    if (inp.wasPressed('secondary')) this.cancelPlacement();
    return true;
  }

  dispose(): void {
    for (const u of this.unsub) u();
  }
}
