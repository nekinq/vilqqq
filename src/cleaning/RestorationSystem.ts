import * as THREE from 'three';
import type { Game, System } from '../game/Game';
import { hitBox, type Prompt } from '../player/Interaction';
import { RESTORATION, SHOP_ORIGIN, FLOOR_Y } from '../world/shopLayout';
import { BALANCE } from '../data/balance';
import { damp } from '../core/math';
import type { LooseItem } from '../game/state';
import { Rng } from '../core/rng';
import { ShopDecor } from '../world/ShopDecor';

const OX = SHOP_ORIGIN.x;
const OZ = SHOP_ORIGIN.z;

interface BoardView {
  obj: THREE.Object3D;
  hit: THREE.Mesh;
  nailed: THREE.Matrix4;
  hold: number;
  fall: { from: THREE.Matrix4; to: THREE.Matrix4; t: number } | null;
  creak: number;
}

interface WebView {
  obj: THREE.Object3D;
  hit: THREE.Mesh;
  hold: number;
  fade: number;
  mat: THREE.MeshStandardMaterial;
}

/**
 * Реставрация магазина (SHOP-01) и «живой» вид здания:
 * доски на витринах (удерживать ЛКМ 2 с → упадёт → E взять → контейнер), паутина (метла),
 * мешки мусора (E → контейнер), пятна на полу (метла), сухая трава у фасада,
 * вывески старая/новая, табличка «Открыто/Закрыто», свет в зале и на крыльце ночью.
 */
export class RestorationSystem implements System {
  private root = new THREE.Group();
  private boards: BoardView[] = [];
  private webs: WebView[] = [];
  private waste: { obj: THREE.Object3D; hit: THREE.Mesh }[] = [];
  private stains: { mesh: THREE.Mesh; mat: THREE.MeshStandardMaterial }[] = [];
  private weeds = new THREE.Group();
  private signOld: THREE.Object3D | null;
  private signNew: THREE.Object3D | null;
  private signDoor: THREE.Object3D | null;
  private doorBase = 0;
  private doorFlip = 0;
  private lights: { light: THREE.PointLight; base: number; kind: 'hall' | 'porch' | 'wh' }[] = [];
  private unsub: (() => void)[] = [];
  private decor: ShopDecor;

  constructor(private readonly game: Game) {
    this.root.name = 'restoration';
    game.scene.add(this.root);
    const shop = game.village.shop;
    this.signOld = shop.getObjectByName('sign_old') ?? null;
    this.signNew = shop.getObjectByName('sign_new') ?? null;
    this.signDoor = shop.getObjectByName('sign_door') ?? null;
    this.doorBase = this.signDoor?.rotation.y ?? 0;
    this.buildBoards();
    this.buildWebs();
    this.buildWaste();
    this.buildStains();
    this.buildWeeds();
    this.buildLights();
    this.decor = new ShopDecor(game.assets, game.lib, game.village.colliders, game.scene);
    const ev = game.sim.events;
    this.unsub.push(
      ev.on('restoration', () => this.sync()),
      ev.on('restorationComplete', () => {
        game.audio.play('success');
        this.sync();
      }),
      ev.on('levelUp', () => this.sync()),
    );
    this.sync();
  }

  private get r() {
    return this.game.sim.state.restoration;
  }

  // ───────── Доски ─────────

  private nailedMatrix(i: number): THREE.Matrix4 {
    const b = RESTORATION.boards[i]!;
    return new THREE.Matrix4().compose(new THREE.Vector3(OX + b.x, b.y, OZ + b.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, b.rotZ)), new THREE.Vector3(0.95, 1, 1));
  }

  private looseMatrix(at: LooseItem): THREE.Matrix4 {
    return new THREE.Matrix4().compose(new THREE.Vector3(at.x, at.y + 0.025, at.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, at.rotY, 'YXZ')), new THREE.Vector3(0.95, 1, 1));
  }

  private buildBoards(): void {
    RESTORATION.boards.forEach((_, i) => {
      const obj = this.game.assets.instance('board_plank');
      obj.matrixAutoUpdate = false;
      const hit = hitBox(3.9, 0.32, 0.16);
      hit.matrixAutoUpdate = false;
      this.root.add(obj, hit);
      const view: BoardView = { obj, hit, nailed: this.nailedMatrix(i), hold: 0, fall: null, creak: 0 };
      this.boards.push(view);
      this.game.interaction.register({
        id: `board:${i}`,
        hits: [hit],
        reach: 3.0,
        enabled: () => this.r.boards[i] === 'nailed' || this.r.boards[i] === 'loose',
        prompt: () => this.boardPrompt(i),
        onPrimaryHold: (dt) => this.boardHold(i, dt),
        onPrimaryRelease: () => {
          view.hold = 0;
        },
        onInteract: () => this.pickBoard(i),
      });
    });
  }

  private boardPrompt(i: number): Prompt | null {
    const st = this.r.boards[i];
    const s = this.game.sim.state;
    const view = this.boards[i]!;
    if (st === 'nailed') {
      if (s.player.tool !== 'hands') return { parts: [], note: 'Уберите метлу — клавиша 1' };
      if (s.player.held.kind !== 'none' && s.player.held.kind !== 'boards') return { parts: [], note: 'Руки заняты' };
      return { parts: [{ action: 'hold', text: 'Оторвать доску' }], progress: view.hold / BALANCE.boardHoldSec };
    }
    if (st === 'loose') {
      const held = s.player.held;
      const n = held.kind === 'boards' ? held.indices.length : 0;
      if (held.kind !== 'none' && held.kind !== 'boards') return { parts: [], note: 'Руки заняты' };
      if (n >= BALANCE.carryBoards) return { parts: [], note: `Больше ${BALANCE.carryBoards} досок не унести — отнесите в контейнер` };
      return { parts: [{ action: 'interact', text: `Взять доску${n ? ` (${n + 1}/${BALANCE.carryBoards})` : ''}` }] };
    }
    return null;
  }

  private boardHold(i: number, dt: number): void {
    const s = this.game.sim.state;
    if (this.r.boards[i] !== 'nailed' || s.player.tool !== 'hands') return;
    if (s.player.held.kind !== 'none' && s.player.held.kind !== 'boards') return;
    const v = this.boards[i]!;
    v.hold += dt;
    v.creak -= dt;
    if (v.creak <= 0) {
      v.creak = 0.55;
      this.game.audio.play('board');
    }
    this.game.viewmodel.pulse();
    if (v.hold >= BALANCE.boardHoldSec) {
      v.hold = 0;
      const b = RESTORATION.boards[i]!;
      const rng = new Rng(1000 + i * 7 + this.game.sim.state.day);
      const at: LooseItem = { x: OX + b.x + rng.range(-0.9, 0.9), y: FLOOR_Y, z: OZ - 6.45 + rng.range(-0.35, 0.3), rotY: rng.range(-0.25, 0.25) };
      this.game.sim.restoration.loosenBoard(i, at);
      v.fall = { from: v.nailed.clone(), to: this.looseMatrix(at), t: 0 };
      this.game.audio.play('boardCrack');
    }
  }

  private pickBoard(i: number): void {
    const s = this.game.sim.state;
    if (this.r.boards[i] !== 'loose' || s.player.tool !== 'hands') return;
    const held = s.player.held;
    if (held.kind === 'none') s.player.held = { kind: 'boards', indices: [i] };
    else if (held.kind === 'boards' && held.indices.length < BALANCE.carryBoards) held.indices.push(i);
    else return;
    this.game.sim.restoration.pickBoard(i);
    this.game.audio.play('pickup');
  }

  // ───────── Паутина ─────────

  private buildWebs(): void {
    RESTORATION.webs.forEach((w, i) => {
      const obj = this.game.assets.instance('cobweb');
      obj.position.set(OX + w.x, w.y, OZ + w.z);
      obj.rotation.y = w.rotY;
      obj.scale.setScalar(w.s);
      // Свой материал — для растворения.
      const base = this.game.lib.get('decal:cobweb') as THREE.MeshStandardMaterial;
      const mat = base.clone();
      obj.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).material = mat;
      });
      const hit = hitBox(0.9 * w.s, 0.9 * w.s, 0.3);
      const c = Math.cos(w.rotY);
      const sn = Math.sin(w.rotY);
      const lx = 0.45 * w.s;
      hit.position.set(OX + w.x + lx * c, w.y - 0.45 * w.s, OZ + w.z - lx * sn);
      hit.rotation.y = w.rotY;
      this.root.add(obj, hit);
      const view: WebView = { obj, hit, hold: 0, fade: 1, mat };
      this.webs.push(view);
      this.game.interaction.register({
        id: `web:${i}`,
        hits: [hit],
        reach: 3.4,
        enabled: () => !this.r.webs[i],
        prompt: () => {
          if (this.game.sim.state.player.tool !== 'broom') return { parts: [], note: 'Паутину — метлой (клавиша 2)' };
          return { parts: [{ action: 'hold', text: 'Смахнуть паутину' }], progress: view.hold / 1.1 };
        },
        onPrimaryHold: (dt) => {
          if (this.game.sim.state.player.tool !== 'broom' || this.r.webs[i]) return;
          view.hold += dt;
          if (view.hold >= 1.1) {
            view.hold = 0;
            this.game.sim.restoration.removeWeb(i);
            this.game.audio.play('web');
          }
        },
        onPrimaryRelease: () => {
          view.hold = 0;
        },
      });
    });
  }

  // ───────── Мусор ─────────

  private wasteDefault(i: number): LooseItem {
    const w = RESTORATION.waste[i]!;
    return { x: OX + w.x, y: FLOOR_Y, z: OZ + w.z, rotY: w.rotY };
  }

  private buildWaste(): void {
    RESTORATION.waste.forEach((w, i) => {
      const obj = this.game.assets.instance(w.kind === 'bag' ? 'trash_bag' : 'trash_sack');
      const hit = hitBox(0.62, 0.7, 0.62);
      this.root.add(obj, hit);
      this.waste.push({ obj, hit });
      this.game.interaction.register({
        id: `waste:${i}`,
        hits: [hit],
        enabled: () => this.r.waste[i] === 'placed',
        prompt: () => {
          const s = this.game.sim.state;
          if (s.player.tool !== 'hands') return { parts: [], note: 'Уберите метлу — клавиша 1' };
          const held = s.player.held;
          const n = held.kind === 'trash' ? held.indices.length : 0;
          if (held.kind !== 'none' && held.kind !== 'trash') return { parts: [], note: 'Руки заняты' };
          if (n >= BALANCE.carryTrash) return { parts: [], note: `Больше ${BALANCE.carryTrash} мешков не унести` };
          return { parts: [{ action: 'interact', text: 'Взять мусор' }] };
        },
        onInteract: () => {
          const s = this.game.sim.state;
          if (s.player.tool !== 'hands' || this.r.waste[i] !== 'placed') return;
          const held = s.player.held;
          if (held.kind === 'none') s.player.held = { kind: 'trash', indices: [i] };
          else if (held.kind === 'trash' && held.indices.length < BALANCE.carryTrash) held.indices.push(i);
          else return;
          this.game.sim.restoration.pickWaste(i);
          this.game.audio.play('pickup');
        },
      });
    });
  }

  // ───────── Пятна ─────────

  private buildStains(): void {
    const base = this.game.lib.get('decal:stain') as THREE.MeshStandardMaterial;
    RESTORATION.stains.forEach((s) => {
      const mat = base.clone();
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(s.r * 2, s.r * 2), mat);
      mesh.rotation.set(-Math.PI / 2, 0, s.rot);
      mesh.position.set(OX + s.x, FLOOR_Y + 0.004, OZ + s.z);
      mesh.receiveShadow = true;
      mesh.renderOrder = 1;
      this.root.add(mesh);
      this.stains.push({ mesh, mat });
    });
  }

  /** Есть ли пятно в радиусе (для подсказки метлы). */
  stainNear(x: number, z: number, r: number): boolean {
    return RESTORATION.stains.some((s, i) => this.r.stains[i]! > 0 && Math.hypot(OX + s.x - x, OZ + s.z - z) < r + s.r * 0.6);
  }

  /** Оттирать пятна метлой. */
  scrub(x: number, z: number, r: number, amount: number): boolean {
    let any = false;
    RESTORATION.stains.forEach((s, i) => {
      if (this.r.stains[i]! <= 0) return;
      if (Math.hypot(OX + s.x - x, OZ + s.z - z) < r + s.r * 0.6) {
        this.game.sim.restoration.scrubStain(i, amount);
        any = true;
      }
    });
    return any;
  }

  // ───────── Бросить доски / мусор ─────────

  dropHeld(point: THREE.Vector3 | null): void {
    const s = this.game.sim.state;
    const held = s.player.held;
    if (held.kind !== 'boards' && held.kind !== 'trash') return;
    const pl = this.game.player;
    let p = point;
    if (!p || Math.hypot(p.x - pl.position.x, p.z - pl.position.z) > 2.2) {
      const f = pl.forward();
      p = new THREE.Vector3(pl.position.x + f.x * 1.1, pl.position.y, pl.position.z + f.z * 1.1);
    }
    const y = this.game.village.floors.heightAt(p.x, p.z, 0);
    held.indices.forEach((idx, k) => {
      const at: LooseItem = { x: p!.x + (k - (held.indices.length - 1) / 2) * 0.35, y, z: p!.z + k * 0.12, rotY: pl.yaw + k * 0.2 };
      if (held.kind === 'boards') this.game.sim.restoration.dropBoard(idx, at);
      else this.game.sim.restoration.dropWaste(idx, at);
    });
    s.player.held = { kind: 'none' };
    this.game.audio.play('drop');
  }

  // ───────── Сухая трава у фасада ─────────

  private buildWeeds(): void {
    const rng = new Rng(4242);
    const dry = new THREE.MeshStandardMaterial({ vertexColors: true, color: new THREE.Color(0.95, 0.72, 0.42), roughness: 1, side: THREE.DoubleSide });
    const geoTall = this.game.assets.mergedGeometry('grass_tall');
    const geoTuft = this.game.assets.mergedGeometry('grass_tuft');
    const spots: [number, number][] = [];
    // Вдоль фасада, у крыльца, у склада.
    for (let i = 0; i < 26; i++) spots.push([rng.range(-8.5, 8.5), rng.range(-9.6, -8.3)]);
    for (let i = 0; i < 10; i++) spots.push([rng.range(-8.4, -7.7), rng.range(-8, 5)]);
    for (let i = 0; i < 8; i++) spots.push([rng.range(7.2, 13.2), rng.range(5.7, 6.4)]);
    const tall = new THREE.InstancedMesh(geoTall, dry, spots.length);
    const tuft = new THREE.InstancedMesh(geoTuft, dry, spots.length);
    const m = new THREE.Matrix4();
    let nt = 0;
    let nf = 0;
    for (const [x, z] of spots) {
      if (Math.abs(x) < 1.8 && z < -8.0) continue; // ступени свободны
      const s = rng.range(0.8, 1.35);
      m.compose(new THREE.Vector3(OX + x, 0, OZ + z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng.range(0, 6.28)), new THREE.Vector3(s, s * rng.range(0.9, 1.3), s));
      if (rng.chance(0.55)) tall.setMatrixAt(nt++, m);
      else tuft.setMatrixAt(nf++, m);
    }
    tall.count = nt;
    tuft.count = nf;
    for (const im of [tall, tuft]) {
      im.castShadow = false;
      im.receiveShadow = true;
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
      this.weeds.add(im);
    }
    this.root.add(this.weeds);
  }

  // ───────── Свет ─────────

  private buildLights(): void {
    const shop = this.game.village.shop;
    shop.updateMatrixWorld(true);
    const q = this.game.quality;
    const add = (name: string, kind: 'hall' | 'porch' | 'wh', intensity: number, distance: number) => {
      const mk = shop.getObjectByName(name);
      if (!mk) return;
      const light = new THREE.PointLight(0xffc98a, 0, distance, 2);
      light.position.setFromMatrixPosition(mk.matrixWorld);
      light.castShadow = false;
      this.root.add(light);
      this.lights.push({ light, base: intensity, kind });
    };
    const hallLamps = q === 'low' ? [0, 3] : [0, 1, 2, 3];
    for (const i of hallLamps) add(`light_hall_${i}`, 'hall', q === 'low' ? 9 : 5.5, 9);
    add('light_porch', 'porch', 6, 8);
    if (q !== 'low') add('light_wh', 'wh', 3.5, 7);
  }

  // ───────── Синхронизация ─────────

  private sync(): void {
    const r = this.r;
    r.boards.forEach((st, i) => {
      const v = this.boards[i]!;
      const visible = st === 'nailed' || st === 'loose';
      v.obj.visible = visible;
      if (!visible) {
        v.fall = null;
        return;
      }
      if (v.fall) return;
      const m = st === 'nailed' ? v.nailed : this.looseMatrix(r.boardPos[i] ?? { x: OX + RESTORATION.boards[i]!.x, y: FLOOR_Y, z: OZ - 6.45, rotY: 0 });
      this.setBoard(v, m);
    });
    r.webs.forEach((done, i) => {
      const v = this.webs[i]!;
      if (!done) {
        v.fade = 1;
        v.obj.visible = true;
        v.mat.opacity = 1;
      }
    });
    r.waste.forEach((st, i) => {
      const v = this.waste[i]!;
      const visible = st === 'placed';
      v.obj.visible = visible;
      if (visible) {
        const at = r.wastePos[i] ?? this.wasteDefault(i);
        v.obj.position.set(at.x, at.y, at.z);
        v.obj.rotation.set(0, at.rotY, 0);
        v.hit.position.set(at.x, at.y + 0.35, at.z);
      }
    });
    r.stains.forEach((st, i) => {
      const v = this.stains[i]!;
      v.mesh.visible = st > 0.001;
      v.mat.opacity = Math.min(1, st) * 0.95;
    });
    const complete = this.game.sim.restoration.complete();
    if (this.signOld) this.signOld.visible = !complete;
    if (this.signNew) this.signNew.visible = complete;
    this.weeds.visible = !complete;
    this.decor.sync(complete, this.game.sim.state.level);
  }

  private setBoard(v: BoardView, m: THREE.Matrix4): void {
    v.obj.matrix.copy(m);
    v.obj.matrixWorldNeedsUpdate = true;
    // Хитбокс: та же поза, но без масштаба доски.
    const p = new THREE.Vector3();
    const qq = new THREE.Quaternion();
    const s = new THREE.Vector3();
    m.decompose(p, qq, s);
    v.hit.matrix.compose(p, qq, new THREE.Vector3(3.9, 0.32, 0.16));
    v.hit.matrixWorldNeedsUpdate = true;
  }

  rebuild(): void {
    for (const v of this.boards) {
      v.fall = null;
      v.hold = 0;
    }
    this.sync();
  }

  update(dt: number, frameDt: number): void {
    // Падение досок.
    for (const v of this.boards) {
      if (!v.fall) continue;
      v.fall.t += frameDt / 0.75;
      const t = Math.min(1, v.fall.t);
      const p0 = new THREE.Vector3();
      const q0 = new THREE.Quaternion();
      const s0 = new THREE.Vector3();
      const p1 = new THREE.Vector3();
      const q1 = new THREE.Quaternion();
      const s1 = new THREE.Vector3();
      v.fall.from.decompose(p0, q0, s0);
      v.fall.to.decompose(p1, q1, s1);
      const e = t * t;
      const p = p0.clone().lerp(p1, e);
      p.y += Math.sin(t * Math.PI) * 0.25 * (1 - t);
      const q = q0.clone().slerp(q1, Math.min(1, t * 1.3));
      this.setBoard(v, new THREE.Matrix4().compose(p, q, s0));
      if (t >= 1) {
        v.fall = null;
        this.game.audio.play('drop', { vol: 0.8 });
        this.sync();
      }
    }
    // Паутина растворяется.
    this.r.webs.forEach((done, i) => {
      const v = this.webs[i]!;
      if (done && v.obj.visible) {
        v.fade = Math.max(0, v.fade - frameDt * 2.2);
        v.mat.opacity = v.fade;
        v.obj.scale.setScalar(RESTORATION.webs[i]!.s * (0.8 + 0.2 * v.fade));
        if (v.fade <= 0) v.obj.visible = false;
      }
    });
    // Табличка на двери.
    const open = this.game.sim.state.phase === 'open';
    this.doorFlip = damp(this.doorFlip, open ? 1 : 0, 6, frameDt);
    if (this.signDoor) this.signDoor.rotation.y = this.doorBase + this.doorFlip * Math.PI;
    // Свет: ночью, когда магазин приведён в порядок (крыльцо — всегда ночью).
    const night = this.game.village.dayNight.night;
    const restored = this.game.sim.restoration.complete();
    for (const l of this.lights) {
      const on = l.kind === 'porch' ? night : restored ? Math.max(night, 0.25) : 0;
      l.light.intensity = damp(l.light.intensity, l.base * on, 3, frameDt);
    }
    void dt;
  }

  dispose(): void {
    for (const u of this.unsub) u();
  }
}
