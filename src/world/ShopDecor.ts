import * as THREE from 'three';
import type { AssetManager } from '../core/AssetManager';
import type { MaterialLibrary } from '../art/MaterialLibrary';
import type { CollisionWorld } from './Colliders';
import { SHOP, SHOP_ORIGIN, FLOOR_Y } from './shopLayout';

/** Ассеты декора (подгружаются вместе с системами). */
export const DECOR_ASSETS = ['planter', 'chalkboard', 'window_box', 'flower_basket', 'bench_wood', 'barrel', 'doormat'];

const OX = SHOP_ORIGIN.x;
const OZ = SHOP_ORIGIN.z;

/**
 * Эволюция магазина (Docs/Planning/VillageRevamp/VisualPlan.md): после уборки — вазоны,
 * ур. 2 — доска и ящики с цветами, ур. 3 — скамейка и кашпо, ур. 4 — гирлянда, ур. 5 — бочки
 * с цветами и коврик, ур. 6 — флажки. Каждый этап — своя группа.
 */
export class ShopDecor {
  private tiers = new Map<number, THREE.Group>();
  private colliders = new Map<number, number[]>();
  private shown = new Set<number>();
  readonly root = new THREE.Group();

  constructor(
    private readonly assets: AssetManager,
    private readonly lib: MaterialLibrary,
    private readonly world: CollisionWorld,
    scene: THREE.Scene,
  ) {
    this.root.name = 'shop-decor';
    scene.add(this.root);
    const F = FLOOR_Y;
    const porchZ = SHOP.porch.z0;
    const roofY = F + SHOP.porchRoofH - 0.25;
    // 0 — восстановлен.
    this.tier(0, [
      ['planter', -1.25, F, -5.95, 0],
      ['planter', 1.25, F, -5.95, 0.6],
      ['planter', -9.0, 0, -9.4, 0.3],
      ['planter', 9.0, 0, -9.4, 1.1],
    ], [
      [-1.25, -5.95, 0.32],
      [1.25, -5.95, 0.32],
    ]);
    // 2 — доска у входа и ящики с цветами под витринами.
    this.tier(2, [
      ['chalkboard', 2.6, F, -7.35, -0.35],
      ['window_box', -4.0, F + 0.68, -5.78, 0],
      ['window_box', 4.0, F + 0.68, -5.78, 0],
    ], [[2.6, -7.35, 0.35]]);
    // 3 — скамейка на крыльце и подвесные кашпо.
    this.tier(3, [
      ['bench_wood', -5.0, F, -7.25, Math.PI],
      ['flower_basket', -1.75, roofY, porchZ + 0.15, 0],
      ['flower_basket', 1.75, roofY, porchZ + 0.15, 1.2],
      ['flower_basket', -7.4, roofY, porchZ + 0.15, 2.1],
    ], [[-5.0, -7.25, 0.55]]);
    // 4 — гирлянда-лампочки под навесом.
    const lights = this.tier(4, [], []);
    lights.add(this.stringLights(new THREE.Vector3(OX - 7.4, roofY + 0.05, OZ + porchZ + 0.1), new THREE.Vector3(OX + 6.9, roofY + 0.05, OZ + porchZ + 0.1), 0.35, 30));
    // 5 — бочки с цветами и коврик у входа.
    this.tier(5, [
      ['barrel', -6.9, F, -7.55, 0.4],
      ['planter', -6.9, F + 0.9, -7.55, 0],
      ['barrel', 6.6, F, -7.55, 1.3],
      ['planter', 6.6, F + 0.9, -7.55, 1],
      ['doormat', 0, F, -4.7, 0],
    ], [
      [-6.9, -7.55, 0.4],
      [6.6, -7.55, 0.4],
    ]);
    // 6 — праздничные флажки.
    const flags = this.tier(6, [], []);
    flags.add(this.bunting(new THREE.Vector3(OX - 7.4, roofY + 0.32, OZ + porchZ - 0.02), new THREE.Vector3(OX + 6.9, roofY + 0.32, OZ + porchZ - 0.02), 0.3, 26));
    flags.add(this.bunting(new THREE.Vector3(OX - 7.2, F + SHOP.wallH + 0.6, OZ + SHOP.hall.z0 - 0.15), new THREE.Vector3(OX + 7.2, F + SHOP.wallH + 0.6, OZ + SHOP.hall.z0 - 0.15), 0.45, 30));
  }

  private tier(level: number, items: [string, number, number, number, number][], cols: [number, number, number][]): THREE.Group {
    const g = new THREE.Group();
    g.name = `decor-${level}`;
    g.visible = false;
    for (const [id, x, y, z, r] of items) {
      if (!this.assets.has(id)) continue;
      const o = this.assets.instance(id);
      o.position.set(OX + x, y, OZ + z);
      o.rotation.y = r;
      g.add(o);
    }
    this.tiers.set(level, g);
    this.colliders.set(level, []);
    (g.userData as { cols: [number, number, number][] }).cols = cols;
    this.root.add(g);
    return g;
  }

  /** Провисающая гирлянда с лампочками (светятся ночью — материал emissive). */
  private stringLights(a: THREE.Vector3, b: THREE.Vector3, sag: number, n: number): THREE.Object3D {
    const g = new THREE.Group();
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 40; i++) {
      const t = i / 40;
      const p = a.clone().lerp(b, t);
      p.y -= Math.sin(t * Math.PI) * sag;
      pts.push(p);
    }
    const wire = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 60, 0.008, 4), new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.8 }));
    wire.castShadow = false;
    g.add(wire);
    const bulbGeo = new THREE.SphereGeometry(0.045, 8, 6);
    const mat = this.lib.get('emissive');
    const im = new THREE.InstancedMesh(bulbGeo, mat, n);
    const m = new THREE.Matrix4();
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const p = a.clone().lerp(b, t);
      p.y -= Math.sin(t * Math.PI) * sag + 0.06;
      m.makeTranslation(p.x, p.y, p.z);
      im.setMatrixAt(i, m);
    }
    im.castShadow = false;
    g.add(im);
    return g;
  }

  /** Флажки-треугольники на шнуре. */
  private bunting(a: THREE.Vector3, b: THREE.Vector3, sag: number, n: number): THREE.Object3D {
    const colors = [0xd8453a, 0xf2c94c, 0x2f7f78, 0xf7f5f0, 0x4f7d62, 0xe8a23b];
    const pos: number[] = [];
    const col: number[] = [];
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const t0 = i / n;
      const t1 = (i + 0.8) / n;
      const p0 = a.clone().lerp(b, t0);
      const p1 = a.clone().lerp(b, t1);
      p0.y -= Math.sin(t0 * Math.PI) * sag;
      p1.y -= Math.sin(t1 * Math.PI) * sag;
      const mid = p0.clone().lerp(p1, 0.5);
      mid.y -= 0.26;
      pos.push(p0.x, p0.y, p0.z, mid.x, mid.y, mid.z, p1.x, p1.y, p1.z);
      c.setHex(colors[i % colors.length]!);
      for (let k = 0; k < 3; k++) col.push(c.r, c.g, c.b);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.9 }));
    mesh.castShadow = true;
    return mesh;
  }

  /** Показать этапы до текущего (restored — магазин приведён в порядок). */
  sync(restored: boolean, level: number): void {
    for (const [lvl, g] of this.tiers) {
      const on = restored && (lvl === 0 || level >= lvl);
      g.visible = on;
      const was = this.shown.has(lvl);
      if (on && !was) {
        this.shown.add(lvl);
        const ids: number[] = [];
        for (const [x, z, r] of (g.userData as { cols: [number, number, number][] }).cols) ids.push(this.world.circle(OX + x, OZ + z, r, 'decor'));
        this.colliders.set(lvl, ids);
      } else if (!on && was) {
        this.shown.delete(lvl);
        for (const id of this.colliders.get(lvl) ?? []) this.world.remove(id);
        this.colliders.set(lvl, []);
      }
    }
  }
}
