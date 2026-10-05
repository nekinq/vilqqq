import * as THREE from 'three';
import { ModelBuilder } from '../art/ModelKit';
import type { MaterialLibrary } from '../art/MaterialLibrary';
import type { AssetManager } from '../core/AssetManager';
import { damp } from '../core/math';
import { BOX_SIZE3 } from '../art/models/products';
import type { ProductId } from '../data/products';

/**
 * Вьюмодель: руки и предметы в руках. Отдельная сцена/камера, рисуется поверх мира
 * (без клиппинга в стены). Свет — копия солнца и неба основной сцены.
 */

export type HeldVisual =
  | { kind: 'none' }
  | { kind: 'box'; sku: ProductId | null; count: number; open: boolean }
  | { kind: 'scanner' }
  | { kind: 'phone' }
  | { kind: 'boards'; n: number }
  | { kind: 'trash'; n: number }
  | { kind: 'cash'; amount: number }
  | { kind: 'broom' };

const SKIN = 0xe8b48f;
const SLEEVE = 0x4f7d62;

function buildArm(side: 1 | -1): THREE.Object3D {
  const b = new ModelBuilder(900 + side);
  b.chamferBox([0.11, 0.11, 0.42], [0, 0, 0.21], 0.03, { color: SLEEVE, faceJitter: 0.03 });
  b.chamferBox([0.12, 0.12, 0.06], [0, 0, 0.02], 0.02, { color: 0x3f6b52 });
  b.chamferBox([0.085, 0.045, 0.1], [0, 0, -0.05], 0.018, { color: SKIN });
  b.chamferBox([0.08, 0.04, 0.07], [0, -0.005, -0.12], 0.015, { color: SKIN });
  b.chamferBox([0.028, 0.028, 0.06], [side * -0.045, 0.012, -0.07], 0.01, { color: SKIN }, [0, side * 0.5, 0]);
  return b.build(side > 0 ? 'arm_R' : 'arm_L');
}

export class Viewmodel {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  private root = new THREE.Group();
  private sun = new THREE.DirectionalLight(0xffffff, 2);
  private hemi = new THREE.HemisphereLight(0xffffff, 0x888866, 1);
  private armL: THREE.Object3D;
  private armR: THREE.Object3D;
  private items = new Map<string, THREE.Object3D>();
  private current: HeldVisual = { kind: 'none' };
  private currentKey = 'none';
  private raise = 0;
  private raiseTarget = 0;
  private action = 0;
  private swayX = 0;
  private swayY = 0;
  private boxContents: THREE.Mesh[] = [];
  private boxObj: THREE.Object3D;
  private productGeos = new Map<string, THREE.BufferGeometry>();
  private productMat: THREE.Material;
  /** Яркость рук в помещении (нет прямого солнца). */
  indoor = 0;
  /** Метёт ли игрок (анимация метлы). */
  sweeping = false;
  private sweepT = 0;
  private sweepAmp = 0;

  constructor(
    private readonly mainCamera: THREE.PerspectiveCamera,
    private readonly lib: MaterialLibrary,
    private readonly assets: AssetManager,
  ) {
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.01, 10);
    this.scene.add(this.camera);
    this.camera.add(this.root);
    this.scene.add(this.sun, this.sun.target, this.hemi);
    this.armL = buildArm(-1);
    this.armR = buildArm(1);
    lib.apply(this.armL);
    lib.apply(this.armR);
    this.root.add(this.armL, this.armR);
    this.productMat = lib.get('flat');
    // Предметы.
    this.boxObj = assets.instance('box_cardboard');
    this.items.set('box', this.boxObj);
    this.items.set('scanner', assets.instance('scanner'));
    this.items.set('phone', this.buildPhone());
    this.items.set('boards', this.buildBoards());
    this.items.set('trash', this.buildTrash());
    this.items.set('cash', this.buildCash());
    this.items.set('broom', assets.instance('broom'));
    for (const o of this.items.values()) {
      o.visible = false;
      o.traverse((m) => {
        if ((m as THREE.Mesh).isMesh) {
          (m as THREE.Mesh).castShadow = false;
          (m as THREE.Mesh).receiveShadow = false;
        }
      });
      this.root.add(o);
    }
    this.root.traverse((m) => {
      m.frustumCulled = false;
    });
    for (let i = 0; i < 8; i++) {
      const mesh = new THREE.Mesh(new THREE.BufferGeometry(), this.productMat);
      mesh.visible = false;
      mesh.frustumCulled = false;
      this.boxObj.add(mesh);
      this.boxContents.push(mesh);
    }
  }

  private buildPhone(): THREE.Object3D {
    const b = new ModelBuilder(910);
    b.chamferBox([0.075, 0.15, 0.012], [0, 0, 0], 0.008, { color: 0x232624 });
    b.node('screen', [0, 0.005, 0.0065], undefined, (nb) => nb.plane(0.066, 0.13, [0, 0, 0], { mat: 'sign:phone_call', noShadow: true }));
    const o = b.build('phone');
    this.lib.apply(o);
    return o;
  }

  private buildBoards(): THREE.Object3D {
    const g = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const p = this.assets.instance('board_plank');
      p.scale.set(0.5, 1, 1);
      p.rotation.set(Math.PI / 2 + 0.05 * i, 0, 0.08 * (i - 1));
      p.position.set(0, i * 0.05, 0);
      p.name = `plank${i}`;
      g.add(p);
    }
    return g;
  }

  private buildTrash(): THREE.Object3D {
    const g = new THREE.Group();
    for (let i = 0; i < 2; i++) {
      const t = this.assets.instance('trash_bag');
      t.scale.setScalar(0.55);
      t.position.set(i * -0.22, -0.32, i * 0.05);
      t.name = `bag${i}`;
      g.add(t);
    }
    return g;
  }

  private buildCash(): THREE.Object3D {
    const g = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const n = this.assets.instance('banknote');
      n.rotation.set(Math.PI / 2 - 0.3, 0.1 * i, 0.15 * i);
      n.position.set(0.01 * i, 0.01 * i, 0);
      g.add(n);
    }
    return g;
  }

  private productGeo(sku: ProductId): THREE.BufferGeometry {
    let g = this.productGeos.get(sku);
    if (!g) {
      g = this.assets.mergedGeometry(`prod_${sku}`);
      this.productGeos.set(sku, g);
    }
    return g;
  }

  /** Короткий «толчок» (раскладка, сканирование). */
  pulse(): void {
    this.action = 1;
  }

  set(v: HeldVisual): void {
    const key = JSON.stringify(v);
    if (key === this.currentKey) return;
    const kindChanged = v.kind !== this.current.kind;
    this.current = v;
    this.currentKey = key;
    if (kindChanged) this.raise = 0;
    this.raiseTarget = v.kind === 'none' ? 0 : 1;
    for (const [k, o] of this.items) o.visible = k === v.kind;
    if (v.kind === 'box') this.updateBox(v);
    if (v.kind === 'boards') {
      const g = this.items.get('boards')!;
      g.children.forEach((c, i) => (c.visible = i < v.n));
    }
    if (v.kind === 'trash') {
      const g = this.items.get('trash')!;
      g.children.forEach((c, i) => (c.visible = i < v.n));
    }
  }

  private updateBox(v: Extract<HeldVisual, { kind: 'box' }>): void {
    const flaps: Record<string, number> = { flap_N: -2.3, flap_S: 2.3, flap_W: 2.2, flap_E: -2.2 };
    for (const [name, ang] of Object.entries(flaps)) {
      const f = this.boxObj.getObjectByName(name);
      if (!f) continue;
      if (name === 'flap_N' || name === 'flap_S') f.rotation.x = v.open ? ang : 0;
      else f.rotation.z = v.open ? ang : 0;
    }
    const { w, d } = BOX_SIZE3;
    for (let i = 0; i < 8; i++) {
      const m = this.boxContents[i]!;
      const show = v.open && v.sku !== null && i < v.count;
      m.visible = show;
      if (show) {
        m.geometry = this.productGeo(v.sku!);
        const col = i % 4;
        const row = Math.floor(i / 4);
        m.position.set(-w / 2 + w * ((col + 0.5) / 4), 0.03, -d / 2 + d * ((row + 0.5) / 2));
      }
    }
    // Этикетка коробки.
    const mat = this.lib.get(v.sku ? `sign:box_${v.sku}` : 'sign:box_generic');
    for (const n of ['label_F', 'label_B']) {
      const l = this.boxObj.getObjectByName(n);
      l?.traverse((m) => {
        if ((m as THREE.Mesh).isMesh) (m as THREE.Mesh).material = mat;
      });
    }
  }

  /** Синхронизация света с основной сценой. */
  syncLights(sun: THREE.DirectionalLight, hemi: THREE.HemisphereLight, envIntensity: number): void {
    const k = 1 - this.indoor * 0.75;
    this.sun.color.copy(sun.color);
    this.sun.intensity = sun.intensity * k * 0.85;
    this.sun.position.copy(sun.position).sub(sun.target.position).normalize();
    this.sun.target.position.set(0, 0, 0);
    this.hemi.color.copy(hemi.color);
    this.hemi.groundColor.copy(hemi.groundColor);
    this.hemi.intensity = hemi.intensity * (1 + this.indoor * 0.35) + envIntensity * 0.3;
  }

  update(dt: number, bob: { t: number; amp: number }, lookDX: number, lookDY: number): void {
    this.camera.fov = this.mainCamera.fov;
    this.camera.aspect = this.mainCamera.aspect;
    this.camera.updateProjectionMatrix();
    this.camera.position.copy(this.mainCamera.position);
    this.camera.quaternion.copy(this.mainCamera.quaternion);
    this.raise = damp(this.raise, this.raiseTarget, 9, dt);
    this.action = Math.max(0, this.action - dt * 4);
    this.swayX = damp(this.swayX, -lookDX * 0.0006, 10, dt);
    this.swayY = damp(this.swayY, lookDY * 0.0006, 10, dt);
    const bx = Math.cos(bob.t) * 0.012 * bob.amp + this.swayX;
    const by = Math.abs(Math.sin(bob.t)) * 0.014 * bob.amp + this.swayY;
    const low = (1 - this.raise) * -0.45;
    const push = Math.sin(this.action * Math.PI) * 0.08;
    const v = this.current;
    const box = this.items.get('box')!;
    const scanner = this.items.get('scanner')!;
    const phone = this.items.get('phone')!;
    const boards = this.items.get('boards')!;
    const trash = this.items.get('trash')!;
    const cash = this.items.get('cash')!;
    const broom = this.items.get('broom')!;
    this.sweepAmp = damp(this.sweepAmp, this.sweeping ? 1 : 0, 8, dt);
    if (this.sweepAmp > 0.01) this.sweepT += dt * 7.5;
    this.armL.visible = v.kind === 'box' || v.kind === 'boards' || v.kind === 'broom';
    this.armR.visible = v.kind !== 'none';
    // Позиции по типу предмета (в пространстве камеры: −Z вперёд).
    if (v.kind === 'box') {
      box.position.set(bx, -0.56 + by + low - push * 0.2, -0.78 - push);
      box.rotation.set(0.32, 0.0, 0);
      this.armL.position.set(-0.27 + bx, -0.55 + by + low, -0.6 - push);
      this.armL.rotation.set(0.25, -0.12, 0.3);
      this.armR.position.set(0.27 + bx, -0.55 + by + low, -0.6 - push);
      this.armR.rotation.set(0.25, 0.12, -0.3);
    } else if (v.kind === 'scanner') {
      scanner.position.set(0.22 + bx, -0.27 + by + low, -0.42 - push * 0.6);
      scanner.rotation.set(-0.15 + push * 0.6, -0.15, 0);
      this.armR.position.set(0.25 + bx, -0.36 + by + low, -0.3 - push * 0.6);
      this.armR.rotation.set(0.45, 0.25, -0.2);
    } else if (v.kind === 'phone') {
      phone.position.set(0.12 + bx, -0.12 + by + low, -0.36);
      phone.rotation.set(0.05, -0.25, 0.05);
      this.armR.position.set(0.17 + bx, -0.27 + by + low, -0.26);
      this.armR.rotation.set(0.9, 0.3, -0.1);
    } else if (v.kind === 'boards') {
      boards.position.set(bx, -0.5 + by + low, -0.75);
      boards.rotation.set(0, 0, 0);
      this.armL.position.set(-0.3 + bx, -0.5 + by + low, -0.55);
      this.armL.rotation.set(0.2, -0.1, 0.25);
      this.armR.position.set(0.3 + bx, -0.5 + by + low, -0.55);
      this.armR.rotation.set(0.2, 0.1, -0.25);
    } else if (v.kind === 'trash') {
      trash.position.set(0.32 + bx, -0.3 + by + low, -0.55);
      this.armR.position.set(0.32 + bx, -0.32 + by + low, -0.42);
      this.armR.rotation.set(-0.2, 0.1, -0.1);
    } else if (v.kind === 'broom') {
      // Метла по диагонали: веник внизу по центру экрана, черенок уходит вправо-вверх.
      const sw = Math.sin(this.sweepT) * this.sweepAmp;
      broom.position.set(0.12 + bx + sw * 0.16, -1.05 + by + low + Math.abs(sw) * 0.03, -0.95);
      broom.rotation.set(-0.55, 0.15, -0.55 + sw * 0.35);
      this.armR.position.set(0.36 + bx + sw * 0.05, -0.38 + by + low, -0.42);
      this.armR.rotation.set(0.55, 0.2, -0.45 + sw * 0.15);
      this.armL.position.set(0.18 + bx + sw * 0.1, -0.58 + by + low, -0.62);
      this.armL.rotation.set(0.7, -0.1, 0.4 + sw * 0.2);
    } else if (v.kind === 'cash') {
      cash.position.set(0.2 + bx, -0.24 + by + low, -0.4 - push);
      cash.rotation.set(0.2, -0.3, 0);
      this.armR.position.set(0.24 + bx, -0.34 + by + low, -0.3 - push);
      this.armR.rotation.set(0.4, 0.2, -0.2);
    }
  }
}
