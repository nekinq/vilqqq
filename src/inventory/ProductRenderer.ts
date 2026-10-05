import * as THREE from 'three';
import type { AssetManager } from '../core/AssetManager';
import type { MaterialLibrary } from '../art/MaterialLibrary';
import { PRODUCT_IDS, type ProductId } from '../data/products';

/**
 * Весь видимый товар (полки, открытые коробки, корзины, прилавок) — по одному InstancedMesh на SKU.
 * Источники регистрируют функции, которые выдают матрицы; пересборка — только при изменениях.
 */
export type UnitSource = (emit: (sku: ProductId, m: THREE.Matrix4) => void) => void;

export class ProductRenderer {
  private meshes = new Map<ProductId, THREE.InstancedMesh>();
  private sources = new Map<string, UnitSource>();
  private dirty = true;
  private buckets = new Map<ProductId, THREE.Matrix4[]>();
  readonly root = new THREE.Group();

  constructor(
    private readonly assets: AssetManager,
    lib: MaterialLibrary,
    scene: THREE.Object3D,
  ) {
    this.root.name = 'products';
    scene.add(this.root);
    const mat = lib.get('flat');
    for (const id of PRODUCT_IDS) {
      const im = new THREE.InstancedMesh(this.assets.mergedGeometry(`prod_${id}`), mat, 64);
      im.count = 0;
      im.castShadow = false;
      im.receiveShadow = true;
      im.frustumCulled = false;
      im.name = `units:${id}`;
      this.meshes.set(id, im);
      this.root.add(im);
      this.buckets.set(id, []);
    }
  }

  setSource(key: string, src: UnitSource | null): void {
    if (src) this.sources.set(key, src);
    else this.sources.delete(key);
    this.dirty = true;
  }

  markDirty(): void {
    this.dirty = true;
  }

  geometry(sku: ProductId): THREE.BufferGeometry {
    return this.assets.mergedGeometry(`prod_${sku}`);
  }

  update(): void {
    if (!this.dirty) return;
    this.dirty = false;
    for (const b of this.buckets.values()) b.length = 0;
    const emit = (sku: ProductId, m: THREE.Matrix4) => this.buckets.get(sku)!.push(m);
    for (const src of this.sources.values()) src(emit);
    for (const [sku, list] of this.buckets) {
      let im = this.meshes.get(sku)!;
      if (list.length > im.instanceMatrix.count) {
        let cap = im.instanceMatrix.count;
        while (cap < list.length) cap *= 2;
        const nim = new THREE.InstancedMesh(im.geometry, im.material, cap);
        nim.castShadow = false;
        nim.receiveShadow = true;
        nim.frustumCulled = false;
        nim.name = im.name;
        this.root.remove(im);
        im.dispose();
        this.root.add(nim);
        this.meshes.set(sku, nim);
        im = nim;
      }
      for (let i = 0; i < list.length; i++) im.setMatrixAt(i, list[i]!);
      im.count = list.length;
      im.instanceMatrix.needsUpdate = true;
    }
  }
}
