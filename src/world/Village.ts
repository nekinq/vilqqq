import * as THREE from 'three';
import type { AssetManager } from '../core/AssetManager';
import type { MaterialLibrary } from '../art/MaterialLibrary';
import { Ground, groundHeight } from './Ground';
import { DayNight } from './DayNight';
import { CollisionWorld, FloorMap } from './Colliders';
import { Instancer } from './Instancer';
import { SHOP, SHOP_ORIGIN, DUMPSTER, DELIVERY_PALLETS, FLOOR_Y, COUNTER } from './shopLayout';
import { PLAZA, SUPPLIER_SITES, HOUSES, BUS_STOP, ROAD_LAMPS, type SupplierId, type HouseSite } from './layout';
import { houseAssetId, HOUSE_VARIANTS } from '../art/models/houses';
import { Rng } from '../core/rng';
import { Ambient } from './Ambient';
import '../art/models';

export interface SupplierSpot {
  id: SupplierId;
  vendor: THREE.Vector3;
  vendorRotY: number;
  customer: THREE.Vector3;
  stall: THREE.Object3D;
}

/** Повёрнутый прямоугольник (двор) для проверок рассадки. */
interface Rect2 {
  x: number;
  z: number;
  hw: number;
  hd: number;
  rot: number;
}

function inRect(r: Rect2, x: number, z: number, pad = 0): boolean {
  const dx = x - r.x;
  const dz = z - r.z;
  const c = Math.cos(r.rot);
  const s = Math.sin(r.rot);
  const lx = dx * c - dz * s;
  const lz = dx * s + dz * c;
  return Math.abs(lx) <= r.hw + pad && Math.abs(lz) <= r.hd + pad;
}

/** Локальные (x, z) объекта с поворотом rotY → мировые. */
export function toWorldXZ(ox: number, oz: number, rotY: number, lx: number, lz: number): [number, number] {
  const c = Math.cos(rotY);
  const s = Math.sin(rotY);
  return [ox + lx * c + lz * s, oz - lx * s + lz * c];
}

const FLOWER_IDS = ['flowers_red', 'flowers_yellow', 'flowers_white', 'flowers_purple', 'flowers_pink', 'flowers_orange'];

/**
 * Сборка статичного мира деревни по Docs/Planning/VillageRevamp/VillageLayout.md.
 * Динамика (товар, коробки, грязь, покупатели, реставрация) — в игровых системах.
 */
export class Village {
  ground!: Ground;
  dayNight!: DayNight;
  readonly root = new THREE.Group();
  readonly colliders = new CollisionWorld();
  readonly floors = new FloorMap();
  shop!: THREE.Object3D;
  instancer!: Instancer;
  readonly lamps: THREE.Vector3[] = [];
  readonly supplierSpots = new Map<SupplierId, SupplierSpot>();
  readonly smokePoints: THREE.Vector3[] = [];
  readonly cows: THREE.Object3D[] = [];
  private yards: Rect2[] = [];
  private noTree: Rect2[] = [];
  private rng = new Rng(20261004);
  private backdropMat: THREE.MeshBasicMaterial | null = null;
  ambient: Ambient | null = null;

  constructor(
    readonly scene: THREE.Scene,
    readonly assets: AssetManager,
    readonly lib: MaterialLibrary,
    readonly quality: 'low' | 'medium' | 'high',
    readonly renderer?: THREE.WebGLRenderer,
  ) {
    this.root.name = 'village';
    scene.add(this.root);
  }

  /** Всё, что нужно загрузить для деревни. */
  static assetIds(): string[] {
    return [
      'shop_shell',
      'dumpster',
      'delivery_pallet',
      'hand_truck',
      'tree_round_a',
      'tree_round_b',
      'tree_round_c',
      'tree_pine_a',
      'tree_pine_b',
      'tree_fruit',
      'tree_oak_big',
      'tree_far_round',
      'tree_far_pine',
      'bush_a',
      'bush_b',
      'bush_flower',
      'bush_flower_y',
      'grass_tuft',
      'grass_tall',
      ...FLOWER_IDS,
      'sunflower',
      'rock_a',
      'rock_b',
      'rock_c',
      'street_lamp',
      'bench',
      'bench_wood',
      'fence_post',
      'fence_rail',
      'picket',
      'stone_border',
      'planter',
      'crate',
      'barrel',
      'milk_can',
      'sack',
      'woodpile',
      'mailbox',
      'clothesline',
      'garden_bed_crops',
      'wheelbarrow',
      'bld_grocery',
      'bld_bakery',
      'bld_produce',
      'bld_dairy',
      'bld_butcher',
      'stall_grocery',
      'stall_bakery',
      'stall_produce',
      'stall_dairy',
      'stall_butcher',
      'greenhouse',
      'barn',
      'cow',
      'bus_stop',
      'bus',
      ...HOUSE_VARIANTS.map(([f, r, w]) => houseAssetId(f, r, w)),
    ];
  }

  async build(onProgress?: (p: number, label: string) => void): Promise<void> {
    await this.assets.preload(Village.assetIds(), (p, id) => onProgress?.(p * 0.85, id));
    onProgress?.(0.86, 'земля');
    this.ground = new Ground(this.lib, this.quality);
    this.root.add(this.ground.mesh);
    this.dayNight = new DayNight(this.scene, this.lib, this.quality === 'low' ? 'off' : this.quality === 'high' ? 'high' : 'low');
    if (this.renderer) this.dayNight.initEnvironment(this.renderer, this.scene);
    this.instancer = new Instancer(this.assets, this.root);
    for (const id of ['grass_tuft', 'grass_tall', ...FLOWER_IDS, 'rock_c', 'stone_border', 'picket']) this.instancer.noShadow.add(id);

    onProgress?.(0.88, 'магазин');
    this.buildShop();
    onProgress?.(0.9, 'площадь');
    this.buildPlaza();
    onProgress?.(0.92, 'поставщики');
    this.buildSuppliers();
    onProgress?.(0.94, 'дома');
    for (const h of HOUSES) this.buildHouse(h);
    this.buildBusStop();
    this.buildLamps();
    onProgress?.(0.96, 'растительность');
    this.buildVegetation();
    this.instancer.build();
    this.buildBackdrop();
    this.ambient = new Ambient(this, this.scene);
    onProgress?.(1, 'готово');
  }

  // ───────────── Утилиты ─────────────

  /**
   * Поставить ассет и его коллайдеры. batched=true — в статичный батч (без отдельного объекта сцены),
   * возвращается «призрак» с позицией/поворотом (не добавлен в сцену) для расчётов.
   */
  place(id: string, x: number, z: number, rotY = 0, y = 0, collide = true, batched = true): THREE.Object3D {
    let o: THREE.Object3D;
    if (batched) {
      this.instancer.add(id, x, y, z, rotY, 1);
      o = new THREE.Group();
      o.name = `ghost:${id}`;
      o.userData.assetId = id;
    } else {
      o = this.assets.instance(id);
      this.root.add(o);
    }
    o.position.set(x, y, z);
    o.rotation.y = rotY;
    o.updateMatrixWorld(true);
    if (collide) {
      const cols = (this.assets.proto(id).userData.colliders ?? []) as [number, number, number, number][];
      for (const [cx, cz, hw, hd] of cols) {
        const [wx, wz] = toWorldXZ(x, z, rotY, cx, cz);
        this.colliders.box(wx, wz, hw, hd, rotY, id);
      }
    }
    return o;
  }

  /** Мировая позиция метки ассета (для призраков и обычных объектов). */
  private marker(obj: THREE.Object3D, name: string): THREE.Vector3 | null {
    const id = obj.userData.assetId as string | undefined;
    const src = id ? this.assets.proto(id) : obj;
    const m = src.getObjectByName(name);
    if (!m) return null;
    src.updateMatrixWorld(true);
    const local = new THREE.Vector3().setFromMatrixPosition(m.matrixWorld);
    if (id) return local.applyMatrix4(obj.matrixWorld);
    return local;
  }

  /** Забор по отрезку: столбы каждые ~2 м, жерди между ними, коллайдер. */
  fence(ax: number, az: number, bx: number, bz: number, collide = true, picket = false): void {
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 0.3) return;
    const n = Math.max(1, Math.round(len / 2.1));
    const rot = Math.atan2(-(bz - az), bx - ax);
    const tint = 0.92 + this.rng.next() * 0.16;
    const col = new THREE.Color(tint, tint, tint);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      this.instancer.add('fence_post', ax + (bx - ax) * t, 0, az + (bz - az) * t, rot + this.rng.range(-0.08, 0.08), 1, col);
    }
    if (picket) {
      const k = Math.floor(len / 0.16);
      for (let i = 1; i < k; i++) {
        const t = i / k;
        this.instancer.add('picket', ax + (bx - ax) * t, 0, az + (bz - az) * t, rot, 1);
      }
    }
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const m = new THREE.Matrix4().compose(
        new THREE.Vector3(ax + (bx - ax) * t, picket ? -0.05 : 0, az + (bz - az) * t),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rot, this.rng.range(-0.02, 0.02))),
        new THREE.Vector3(len / n + 0.06, 1, 1),
      );
      this.instancer.addMatrix('fence_rail', m, col);
    }
    if (collide) this.colliders.segment(ax, az, bx, bz, 0.16, 'fence');
  }

  /** Забор по контуру прямоугольника в локальных координатах объекта; gateX — калитка на передней стороне. */
  fenceRect(ox: number, oz: number, rotY: number, hw: number, hd: number, gateX: number | null, gateW = 1.8, picketFront = false): void {
    const corners: [number, number][] = [
      [-hw, hd],
      [hw, hd],
      [hw, -hd],
      [-hw, -hd],
    ];
    const W = (lx: number, lz: number) => toWorldXZ(ox, oz, rotY, lx, lz);
    if (gateX !== null) {
      const g0 = Math.max(-hw, gateX - gateW / 2);
      const g1 = Math.min(hw, gateX + gateW / 2);
      const [a1, b1] = W(-hw, hd);
      const [a2, b2] = W(g0, hd);
      const [a3, b3] = W(g1, hd);
      const [a4, b4] = W(hw, hd);
      this.fence(a1, b1, a2, b2, true, picketFront);
      this.fence(a3, b3, a4, b4, true, picketFront);
    } else {
      const [a1, b1] = W(-hw, hd);
      const [a4, b4] = W(hw, hd);
      this.fence(a1, b1, a4, b4, true, picketFront);
    }
    for (let i = 1; i < 4; i++) {
      const [ax, az] = W(...corners[i]!);
      const [bx, bz] = W(...corners[(i + 1) % 4]!);
      this.fence(ax, az, bx, bz);
    }
  }

  private flowersAt(x: number, z: number, n: number, r: number, palette = FLOWER_IDS): void {
    for (let i = 0; i < n; i++) {
      const a = this.rng.range(0, Math.PI * 2);
      const rr = Math.sqrt(this.rng.next()) * r;
      this.instancer.add(this.rng.pick(palette), x + Math.cos(a) * rr, 0, z + Math.sin(a) * rr, this.rng.range(0, 6.28), this.rng.range(0.85, 1.25));
    }
  }

  // ───────────── Магазин ─────────────

  private buildShop(): void {
    const ox = SHOP_ORIGIN.x;
    const oz = SHOP_ORIGIN.z;
    this.shop = this.place('shop_shell', ox, oz, 0, 0, false, false);
    const F = FLOOR_Y;
    const T = SHOP.wallT;
    const h = SHOP.hall;
    const W = (x: number, z: number): [number, number] => [x + ox, z + oz];
    const wall = (ax: number, az: number, bx: number, bz: number) => {
      const [x0, z0] = W(ax, az);
      const [x1, z1] = W(bx, bz);
      this.colliders.segment(x0, z0, x1, z1, T + 0.02, 'shop');
    };
    const fd = SHOP.frontDoor;
    wall(h.x0 - T / 2, h.z0, fd.x0, h.z0);
    wall(fd.x1, h.z0, h.x1 + T / 2, h.z0);
    const bd = SHOP.backDoor;
    wall(h.x0 - T / 2, h.z1, bd.x0, h.z1);
    wall(bd.x1, h.z1, h.x1 + T / 2, h.z1);
    wall(h.x0, h.z0, h.x0, h.z1);
    const wd = SHOP.warehouseDoor;
    wall(h.x1, h.z0, h.x1, wd.z0);
    wall(h.x1, wd.z1, h.x1, h.z1);
    const wh = SHOP.warehouse;
    const wo = SHOP.warehouseOuterDoor;
    wall(wh.x0, wh.z0, wo.x0, wh.z0);
    wall(wo.x1, wh.z0, wh.x1 + T / 2, wh.z0);
    wall(wh.x0, wh.z1, wh.x1 + T / 2, wh.z1);
    wall(wh.x1, wh.z0, wh.x1, wh.z1);
    const po = SHOP.porch;
    for (const x of [po.x0 + 0.14, -1.75, 1.75, po.x1 - 0.14]) this.colliders.circle(...W(x, po.z0 + 0.15), 0.14, 'shop');
    const lt = SHOP.leanTo;
    this.colliders.circle(...W(lt.x0 + 0.12, lt.z0 + 0.12), 0.12, 'shop');
    this.colliders.circle(...W(lt.x1 - 0.12, lt.z0 + 0.12), 0.12, 'shop');
    this.colliders.circle(...W(lt.x1 - 0.12, (lt.z0 + lt.z1) / 2 - 0.2), 0.12, 'shop');
    this.colliders.box(...W(COUNTER.x, COUNTER.z), COUNTER.depth / 2, COUNTER.len / 2, 0, 'counter');
    this.floors.add({ x0: ox + h.x0 - 0.1, x1: ox + h.x1 + 0.1, z0: oz + h.z0, z1: oz + h.z1, y: F, tag: 'hall' });
    this.floors.add({ x0: ox + wh.x0, x1: ox + wh.x1 + 0.1, z0: oz + wh.z0, z1: oz + wh.z1, y: F, tag: 'warehouse' });
    this.floors.add({ x0: ox + po.x0, x1: ox + po.x1, z0: oz + po.z0, z1: oz + po.z1, y: F, tag: 'porch' });
    this.floors.add({ x0: ox + lt.x0, x1: ox + lt.x1, z0: oz + lt.z0, z1: oz + lt.z1, y: F, tag: 'delivery' });
    const st = SHOP.steps;
    this.floors.add({ x0: ox + st.x0, x1: ox + st.x1, z0: oz + st.z0, z1: oz + st.z0 + 0.42, y: 0.1 });
    this.floors.add({ x0: ox + st.x0, x1: ox + st.x1, z0: oz + st.z0 + 0.42, z1: oz + st.z1, y: 0.2 });
    const bs = SHOP.backSteps;
    this.floors.add({ x0: ox + bs.x0, x1: ox + bs.x1, z0: oz + bs.z0, z1: oz + bs.z0 + 0.45, y: F });
    this.floors.add({ x0: ox + bs.x0, x1: ox + bs.x1, z0: oz + bs.z0 + 0.45, z1: oz + bs.z1, y: 0.15 });

    this.place('dumpster', DUMPSTER.x, DUMPSTER.z, DUMPSTER.rotY, 0, false);
    this.colliders.box(DUMPSTER.x, DUMPSTER.z, 0.95, 0.55, DUMPSTER.rotY, 'dumpster');
    for (const p of DELIVERY_PALLETS) this.place('delivery_pallet', ox + p.x, oz + p.z, 0, F, false);
    this.place('hand_truck', ox + 12.4, oz - 0.9, -0.4, F, false);

    // Задний двор: забор с калиткой, поленница, бочки.
    const by0 = oz + h.z1 + 0.2;
    const by1 = oz + h.z1 + 5.2;
    this.fence(ox - 8, by0, ox - 8, by1);
    this.fence(ox + 8, by0, ox + 8, by1);
    this.fence(ox - 8, by1, ox - 1.2, by1);
    this.fence(ox + 1.2, by1, ox + 8, by1);
    this.instancer.add('woodpile', ox - 5.5, 0, by1 - 0.8, 0, 1);
    this.colliders.box(ox - 5.5, by1 - 0.8, 0.95, 0.35, 0, 'yard');
    this.instancer.add('barrel', ox + 4.2, 0, by0 + 0.8, 0, 1);
    this.instancer.add('barrel', ox + 4.9, 0, by0 + 1.2, 1, 0.9);
    this.colliders.circle(ox + 4.5, by0 + 1.0, 0.65, 'yard');
    this.noTree.push({ x: ox + 2, z: oz + 2, hw: 13, hd: 12, rot: 0 });

    // Клумбы с каменным бордюром по сторонам от входа.
    for (const sx of [-1, 1]) {
      const cx = ox + sx * 5.6;
      const cz = oz - 9.85;
      for (let i = 0; i < 9; i++) this.instancer.add('stone_border', cx - 2.0 + i * 0.5, 0, cz - 0.62, 0, 1);
      for (let i = 0; i < 9; i++) this.instancer.add('stone_border', cx - 2.0 + i * 0.5, 0, cz + 0.62, 0, 1);
      for (const ex of [-2.25, 2.25]) for (const ez of [-0.25, 0.25]) this.instancer.add('stone_border', cx + ex, 0, cz + ez, Math.PI / 2, 1);
      for (let i = 0; i < 7; i++) this.instancer.add(this.rng.pick(FLOWER_IDS), cx - 1.8 + i * 0.6, 0.12, cz + this.rng.range(-0.25, 0.25), this.rng.range(0, 6), 1.2);
      this.instancer.add('bush_flower', cx + sx * 1.6, 0.05, cz, 0, 0.7);
      this.colliders.box(cx, cz, 2.4, 0.75, 0, 'bed');
    }
  }

  // ───────────── Площадь ─────────────

  private buildPlaza(): void {
    const { x: px, z: pz } = PLAZA;
    this.place('tree_oak_big', px, pz, 0.4, 0, false);
    this.colliders.circle(px, pz, PLAZA.rBed + 0.15, 'plaza_bed');
    const rb = PLAZA.rBed + 0.15;
    const n = Math.round((2 * Math.PI * rb) / 0.48);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      this.instancer.add('stone_border', px + Math.cos(a) * rb, 0, pz + Math.sin(a) * rb, -a + Math.PI / 2, [1, this.rng.range(0.9, 1.15), 1]);
    }
    for (let i = 0; i < 110; i++) {
      const a = this.rng.range(0, Math.PI * 2);
      const r = this.rng.range(1.8, PLAZA.rBed - 0.4);
      this.instancer.add(this.rng.pick(FLOWER_IDS), px + Math.cos(a) * r, 0.02, pz + Math.sin(a) * r, this.rng.range(0, 6), this.rng.range(1, 1.5));
    }
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + 0.2;
      this.instancer.add(this.rng.chance(0.5) ? 'bush_flower' : 'bush_a', px + Math.cos(a) * 4.6, 0, pz + Math.sin(a) * 4.6, this.rng.range(0, 6), this.rng.range(0.7, 1));
    }
    for (let k = 0; k < 4; k++) {
      const a = (k * Math.PI) / 2;
      const r = PLAZA.rBed + 1.05;
      const x = px + Math.cos(a) * r;
      const z = pz + Math.sin(a) * r;
      // Скамейка смотрит наружу (спинка к клумбе).
      const rot = Math.atan2(Math.cos(a), Math.sin(a)) + Math.PI;
      this.instancer.add('bench', x, 0, z, rot, 1);
      this.colliders.box(x, z, 0.85, 0.35, rot, 'bench');
    }
    for (let k = 0; k < 8; k++) {
      const a = Math.PI / 8 + (k * Math.PI) / 4;
      const r = PLAZA.rBed + 0.95;
      this.addLamp(px + Math.cos(a) * r, pz + Math.sin(a) * r);
    }
    this.noTree.push({ x: px, z: pz, hw: PLAZA.rOuter + 2, hd: PLAZA.rOuter + 2, rot: 0 });
  }

  private addLamp(x: number, z: number): void {
    this.instancer.add('street_lamp', x, 0, z, this.rng.range(0, 6.28), 1);
    this.colliders.circle(x, z, 0.2, 'lamp');
    this.lamps.push(new THREE.Vector3(x, 3.55, z));
  }

  // ───────────── Поставщики ─────────────

  private buildSuppliers(): void {
    for (const site of Object.values(SUPPLIER_SITES)) {
      const house = this.place(`bld_${site.id}`, site.house.x, site.house.z, site.house.rotY);
      const stall = this.place(`stall_${site.id}`, site.stall.x, site.stall.z, site.stall.rotY);
      const vendor = this.marker(stall, 'vendor') ?? new THREE.Vector3(site.stall.x, 0, site.stall.z);
      const customer = this.marker(stall, 'customer') ?? new THREE.Vector3(site.stall.x, 0, site.stall.z);
      this.supplierSpots.set(site.id, { id: site.id, vendor, vendorRotY: site.stall.rotY, customer, stall });
      const smoke = this.marker(house, 'smoke');
      if (smoke) this.smokePoints.push(smoke);
      this.noTree.push({ x: site.house.x, z: site.house.z, hw: 8, hd: 8, rot: site.house.rotY });
      this.noTree.push({ x: site.stall.x, z: site.stall.z, hw: 4, hd: 3.5, rot: site.stall.rotY });
      const H = site.house;
      for (const [lx, lz] of [
        [-5.6, 2.5],
        [5.8, 2.2],
        [-5.4, -2.8],
        [5.6, -3.0],
      ] as const) {
        const [x, z] = toWorldXZ(H.x, H.z, H.rotY, lx, lz);
        if (this.colliders.isFree(x, z, 0.5)) this.instancer.add(this.rng.pick(['bush_a', 'bush_flower', 'bush_b']), x, 0, z, this.rng.range(0, 6), this.rng.range(0.7, 1));
      }
    }
    // Огородник: теплица и огород за забором.
    this.place('greenhouse', -9.2, -48.2, 0);
    for (let i = 0; i < 4; i++) this.place('garden_bed_crops', 6.5 + i * 1.7, -47, 0, 0, false);
    this.colliders.box(9.05, -47, 3.3, 3.1, 0, 'garden');
    this.fence(4.9, -43.4, 6.6, -43.4);
    this.fence(8.6, -43.4, 13.3, -43.4);
    this.fence(13.3, -43.4, 13.3, -50.6);
    this.fence(13.3, -50.6, 4.9, -50.6);
    this.fence(4.9, -50.6, 4.9, -43.4);
    for (let i = 0; i < 6; i++) this.instancer.add('sunflower', 13.0 - i * 1.4, 0, -50.2, this.rng.range(-0.5, 0.5) + Math.PI, 1);
    this.instancer.add('wheelbarrow', 3.4, 0, -42.0, 0.7, 1);
    this.noTree.push({ x: 0, z: -47, hw: 15, hd: 7, rot: 0 });
    // Молочная ферма: хлев, загон с коровами, бидоны.
    this.place('barn', 33.8, -42.0, -0.3);
    const px0 = 27.6;
    const px1 = 38.6;
    const pz0 = -36.4;
    const pz1 = -29.6;
    this.fence(px0, pz0, px1, pz0);
    this.fence(px1, pz0, px1, pz1);
    this.fence(px1, pz1, px0 + 2.2, pz1);
    this.fence(px0, pz1, px0, pz0);
    for (const [x, z, r] of [
      [31, -33, 0.8],
      [35, -31.5, -2.2],
      [33.6, -34.6, 2.6],
    ] as const) {
      const cow = this.place('cow', x, z, r, 0, false, false);
      this.colliders.circle(x, z, 0.9, 'cow');
      this.cows.push(cow);
    }
    const spot = this.supplierSpots.get('dairy')!;
    for (const [lx, lz] of [
      [2.2, 0.1],
      [2.6, 0.5],
    ] as const) {
      const [x, z] = toWorldXZ(spot.stall.position.x, spot.stall.position.z, spot.stall.rotation.y, lx, lz);
      this.instancer.add('milk_can', x, 0, z, this.rng.range(0, 6), 1);
    }
    this.noTree.push({ x: 33, z: -36, hw: 9, hd: 9, rot: 0 });
    for (const id of ['grocery', 'butcher'] as const) {
      const st = this.supplierSpots.get(id)!.stall;
      for (const [lx, lz, kind] of [
        [-2.4, -0.4, 'barrel'],
        [-2.3, 0.4, 'crate'],
        [2.4, -0.6, 'crate'],
      ] as const) {
        const [x, z] = toWorldXZ(st.position.x, st.position.z, st.rotation.y, lx, lz);
        this.instancer.add(kind, x, 0, z, st.rotation.y + this.rng.range(-0.4, 0.4), 1);
        this.colliders.circle(x, z, 0.35, 'prop');
      }
    }
  }

  // ───────────── Жилые дома ─────────────

  private buildHouse(h: HouseSite): void {
    const id = houseAssetId(h.family, h.roof, h.wall);
    const house = this.place(id, h.x, h.z, h.rotY);
    const door = this.marker(house, 'door');
    let gateX = 0;
    if (door) {
      const c = Math.cos(h.rotY);
      const s = Math.sin(h.rotY);
      const dx = door.x - h.x;
      const dz = door.z - h.z;
      gateX = dx * c - dz * s;
    }
    const { hw, hd } = h.yard;
    this.fenceRect(h.x, h.z, h.rotY, hw, hd, gateX, 1.8, h.family === 'cottage');
    this.yards.push({ x: h.x, z: h.z, hw, hd, rot: h.rotY });
    const W = (lx: number, lz: number) => toWorldXZ(h.x, h.z, h.rotY, lx, lz);
    const rng = this.rng;
    {
      const [x, z] = W(gateX + 1.2, hd + 0.35);
      this.instancer.add('mailbox', x, 0, z, h.rotY, 1);
    }
    for (let i = 0; i < 7; i++) {
      const t = rng.range(-1, 1);
      const side = rng.int(0, 2);
      const lx = side === 0 ? -hw + 0.8 : side === 1 ? hw - 0.8 : t * (hw - 1);
      const lz = side === 2 ? -hd + 0.8 : t * (hd - 1);
      const [x, z] = W(lx, lz);
      if (this.colliders.isFree(x, z, 0.4)) this.instancer.add(rng.pick(['bush_a', 'bush_b', 'bush_flower', 'bush_flower_y']), x, 0, z, rng.range(0, 6), rng.range(0.7, 1.05));
    }
    for (const sx of [-1, 1]) {
      const [x, z] = W(gateX + sx * 2.8, hd - 0.7);
      this.flowersAt(x, z, 6, 1.2);
    }
    {
      const [x, z] = W(rng.chance(0.5) ? -hw + 2.2 : hw - 2.2, -hd + 2.0);
      if (this.colliders.isFree(x, z, 1.2)) {
        this.instancer.add('tree_fruit', x, 0, z, rng.range(0, 6), rng.range(0.9, 1.1));
        this.colliders.circle(x, z, 0.3, 'tree');
      }
    }
    if (h.garden) {
      for (let i = 0; i < 3; i++) {
        const [x, z] = W(5.6 + (i - 1) * 1.4, -1.5);
        this.instancer.add('garden_bed_crops', x, 0, z, h.rotY, [0.9, 1, 0.8]);
      }
      for (let i = 0; i < 4; i++) {
        const [fx, fz] = W(hw - 0.6, -hd + 0.8 + i * 0.9);
        this.instancer.add('sunflower', fx, 0, fz, h.rotY + rng.range(-0.4, 0.4), rng.range(0.85, 1.1));
      }
    }
    const extra = rng.int(0, 2);
    if (extra === 0) {
      const [x, z] = W(-hw + 1.6, -hd + 1.4);
      this.instancer.add('woodpile', x, 0, z, h.rotY + Math.PI / 2, 1);
      this.colliders.box(x, z, 0.95, 0.35, h.rotY + Math.PI / 2, 'yard');
    } else if (extra === 1) {
      const [x, z] = W(-hw + 3.5, -hd + 1.6);
      this.instancer.add('clothesline', x, 0, z, h.rotY, 1);
    } else {
      const [x, z] = W(-hw + 1.2, hd - 1.6);
      this.instancer.add('barrel', x, 0, z, 0, 1);
      this.colliders.circle(x, z, 0.35, 'yard');
    }
  }

  private buildBusStop(): void {
    this.place('bus_stop', BUS_STOP.x, BUS_STOP.z, BUS_STOP.rotY);
    this.floors.add({ x0: BUS_STOP.x - 1.6, x1: BUS_STOP.x + 1.6, z0: BUS_STOP.z - 1.0, z1: BUS_STOP.z + 1.0, y: 0.14 });
    this.noTree.push({ x: BUS_STOP.x, z: BUS_STOP.z, hw: 4, hd: 4, rot: 0 });
    const [x, z] = toWorldXZ(BUS_STOP.x, BUS_STOP.z, BUS_STOP.rotY, -2.6, -0.3);
    this.flowersAt(x, z, 5, 0.8);
  }

  private buildLamps(): void {
    for (const [x, z] of ROAD_LAMPS) this.addLamp(x, z);
  }

  // ───────────── Растительность ─────────────

  private clearForPlant(x: number, z: number, r: number, roadPad = 0.05): boolean {
    if (this.floors.covered(x, z, r)) return false;
    const g = this.ground.sample(x, z);
    if (g.dirt > roadPad || g.cobble > 0.05 || g.soil > 0.05) return false;
    for (const y of this.yards) if (inRect(y, x, z, r)) return false;
    for (const n of this.noTree) if (inRect(n, x, z, r)) return false;
    return this.colliders.isFree(x, z, r);
  }

  private buildVegetation(): void {
    const rng = this.rng;
    const q = this.quality;
    // 1) Лесной пояс: ближе — полноценные деревья, дальше — дешёвые.
    const step = 4.8;
    for (let gx = -138; gx <= 138; gx += step) {
      for (let gz = -138; gz <= 138; gz += step) {
        const x = gx + rng.range(-step * 0.4, step * 0.4);
        const z = gz + rng.range(-step * 0.4, step * 0.4);
        const e = Math.hypot(x / 64, (z + 3) / 58);
        if (e < 0.98) continue;
        const near = e < 1.32;
        const p = near ? 0.25 + (e - 0.98) * 1.6 : 0.82;
        if (!rng.chance(Math.min(0.9, p))) continue;
        const y = groundHeight(x, z) - 0.1;
        if (near) {
          if (!this.clearForPlant(x, z, 1.6, 0.1)) continue;
          const pine = rng.chance(0.35 + (e - 1) * 0.6);
          const id = pine ? rng.pick(['tree_pine_a', 'tree_pine_b']) : rng.pick(['tree_round_a', 'tree_round_b', 'tree_round_c']);
          this.instancer.add(id, x, y, z, rng.range(0, 6.28), rng.range(0.85, 1.2));
          if (Math.abs(x) < 70 && Math.abs(z) < 62) this.colliders.circle(x, z, 0.35, 'tree');
        } else {
          if (q === 'low' && rng.chance(0.35)) continue;
          const pine = rng.chance(0.45);
          this.instancer.add(pine ? 'tree_far_pine' : 'tree_far_round', x, y, z, rng.range(0, 6.28), rng.range(0.9, 1.4), undefined, [rng.range(-0.05, 0.05), rng.range(-0.05, 0.05)]);
        }
      }
    }
    // Невидимая граница игровой зоны (за деревьями).
    const bx = 66;
    const bz = 58;
    this.colliders.segment(-bx, -bz, bx, -bz, 0.5, 'bound');
    this.colliders.segment(bx, -bz, bx, bz, 0.5, 'bound');
    this.colliders.segment(bx, bz, -bx, bz, 0.5, 'bound');
    this.colliders.segment(-bx, bz, -bx, -bz, 0.5, 'bound');
    // 2) Деревья внутри деревни.
    let placed = 0;
    for (let i = 0; i < 900 && placed < 70; i++) {
      const x = rng.range(-60, 60);
      const z = rng.range(-54, 54);
      if (!this.clearForPlant(x, z, 2.2, 0.08)) continue;
      const id = rng.pick(['tree_round_a', 'tree_round_b', 'tree_round_c', 'tree_round_a', 'tree_pine_a']);
      this.instancer.add(id, x, 0, z, rng.range(0, 6.28), rng.range(0.85, 1.15));
      this.colliders.circle(x, z, 0.35, 'tree');
      placed++;
    }
    // 3) Кусты и камни на лугах и обочинах.
    for (let i = 0; i < 260; i++) {
      const x = rng.range(-64, 64);
      const z = rng.range(-56, 56);
      const g = this.ground.sample(x, z);
      const nearRoad = g.dirt > 0.02 && g.dirt < 0.25;
      if (!nearRoad && !rng.chance(0.35)) continue;
      if (!this.clearForPlant(x, z, 0.7, 0.3)) continue;
      const roll = rng.next();
      if (roll < 0.55) this.instancer.add(rng.pick(['bush_a', 'bush_b', 'bush_flower', 'bush_flower_y']), x, 0, z, rng.range(0, 6), rng.range(0.6, 1.1));
      else if (roll < 0.85) this.instancer.add(rng.pick(['rock_a', 'rock_c', 'rock_c']), x, -0.05, z, rng.range(0, 6), rng.range(0.7, 1.3));
      else {
        this.instancer.add('rock_b', x, -0.1, z, rng.range(0, 6), rng.range(0.7, 1.1));
        this.colliders.circle(x, z, 0.6, 'rock');
      }
    }
    for (let i = 0; i < 26; i++) {
      const x = rng.range(26, 60);
      const z = rng.range(28, 54);
      if (!this.clearForPlant(x, z, 0.6)) continue;
      this.instancer.add(rng.pick(['rock_a', 'rock_b', 'rock_c']), x, -0.06, z, rng.range(0, 6), rng.range(0.6, 1.2));
    }
    // 4) Полевые цветы пятнами.
    const patches = q === 'low' ? 30 : 70;
    for (let i = 0; i < patches; i++) {
      const x = rng.range(-62, 62);
      const z = rng.range(-54, 54);
      if (!this.clearForPlant(x, z, 0.5, 0.15)) continue;
      const pal = [rng.pick(FLOWER_IDS), rng.pick(FLOWER_IDS)];
      for (let k = 0; k < 6; k++) {
        const fx = x + rng.range(-1.5, 1.5);
        const fz = z + rng.range(-1.5, 1.5);
        if (this.ground.sample(fx, fz).dirt < 0.1) this.instancer.add(rng.pick(pal), fx, 0, fz, rng.range(0, 6), rng.range(0.8, 1.2));
      }
    }
    // 5) Трава: пучки по газонам, гуще у дорог и заборов.
    const target = q === 'high' ? 9000 : q === 'medium' ? 5500 : 1800;
    let n = 0;
    const tint = new THREE.Color();
    for (let i = 0; i < target * 4 && n < target; i++) {
      const x = rng.range(-70, 70);
      const z = rng.range(-62, 62);
      const g = this.ground.sample(x, z);
      if (g.dirt > 0.35 || g.cobble > 0.1 || g.soil > 0.2) continue;
      const edge = g.dirt > 0.02 ? 1 : 0;
      if (!edge && !rng.chance(0.55)) continue;
      if (!this.colliders.isFree(x, z, 0.15) || this.floors.covered(x, z, 0.1)) continue;
      const tall = edge && rng.chance(0.15);
      tint.setRGB(0.85 + rng.range(-0.1, 0.12), 0.95 + rng.range(-0.08, 0.08), 0.85 + rng.range(-0.1, 0.1));
      this.instancer.add(tall ? 'grass_tall' : 'grass_tuft', x, 0, z, rng.range(0, 6.28), rng.range(0.8, 1.35), tint);
      n++;
    }
  }

  // ───────────── Фон: горы ─────────────

  private buildBackdrop(): void {
    const g = new THREE.Group();
    g.name = 'backdrop';
    const mat = new THREE.MeshBasicMaterial({ color: 0x7f97a8, fog: false, depthWrite: false });
    this.backdropMat = mat;
    const rng = new Rng(77);
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2 + rng.range(-0.08, 0.08);
      const d = 128;
      const h = rng.range(14, 34);
      const r = rng.range(16, 30);
      const geo = new THREE.ConeGeometry(r, h, 5 + rng.int(0, 2), 1);
      geo.translate(0, h / 2 - 9, 0);
      const m = new THREE.Mesh(geo, mat);
      m.position.set(Math.cos(a) * d, 0, Math.sin(a) * d);
      m.rotation.y = rng.range(0, 6);
      m.renderOrder = -8;
      g.add(m);
    }
    this.dayNight.sky.mesh.add(g);
  }

  update(dt: number, camera: THREE.Camera): void {
    this.lib.update(dt);
    this.dayNight.update(dt, camera.position, this.renderer);
    this.ambient?.update(dt, this.dayNight.night);
    if (this.backdropMat) {
      // Атмосферная перспектива: горы чуть темнее горизонта.
      this.backdropMat.color.copy(this.dayNight.fog.color).multiplyScalar(0.8).lerp(new THREE.Color(0x5d7a8c), 0.22 * (1 - this.dayNight.night));
    }
  }
}
