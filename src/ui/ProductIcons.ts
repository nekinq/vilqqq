import * as THREE from 'three';
import type { AssetManager } from '../core/AssetManager';
import { PRODUCT_IDS, type ProductId } from '../data/products';

/**
 * Иллюстрации товаров для UI рендерятся из тех же 3D-моделей при запуске:
 * отдельная сцена со светом, рендер в текстуру, перевод в sRGB и dataURL.
 */
export class ProductIcons {
  private urls = new Map<string, string>();

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly assets: AssetManager,
  ) {}

  generate(extra: string[] = []): void {
    const W = 256;
    const H = 208;
    const rt = new THREE.WebGLRenderTarget(W, H, { samples: 4, type: THREE.UnsignedByteType });
    const scene = new THREE.Scene();
    const hemi = new THREE.HemisphereLight(0xfff6e8, 0x8a7a60, 2.2);
    const key = new THREE.DirectionalLight(0xffffff, 2.6);
    key.position.set(2, 4, 3);
    const rim = new THREE.DirectionalLight(0xdfe8ff, 1.2);
    rim.position.set(-3, 2, -2);
    scene.add(hemi, key, rim);
    const cam = new THREE.PerspectiveCamera(28, W / H, 0.01, 50);
    const pixels = new Uint8Array(W * H * 4);
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const g = canvas.getContext('2d')!;
    const img = g.createImageData(W, H);
    const lut = new Uint8Array(256);
    for (let i = 0; i < 256; i++) {
      const l = i / 255;
      const s = l <= 0.0031308 ? l * 12.92 : 1.055 * Math.pow(l, 1 / 2.4) - 0.055;
      lut[i] = Math.round(Math.min(1, s * 1.04) * 255);
    }
    const prevTarget = this.renderer.getRenderTarget();
    const prevClear = this.renderer.getClearColor(new THREE.Color());
    const prevAlpha = this.renderer.getClearAlpha();
    const prevAuto = this.renderer.autoClear;
    const prevShadow = this.renderer.shadowMap.enabled;
    this.renderer.shadowMap.enabled = false;
    this.renderer.autoClear = true;
    this.renderer.setClearColor(0x000000, 0);
    const ids = [...PRODUCT_IDS.map((id) => `prod_${id}`), ...extra];
    for (const id of ids) {
      if (!this.assets.has(id)) continue;
      const obj = this.assets.instance(id);
      scene.add(obj);
      const box = new THREE.Box3().setFromObject(obj);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const r = Math.max(size.x, size.y * 1.15, size.z) * 0.5;
      const dist = r / Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) * 1.25;
      cam.position.set(center.x + dist * 0.55, center.y + dist * 0.42, center.z + dist * 0.75);
      cam.lookAt(center);
      this.renderer.setRenderTarget(rt);
      this.renderer.clear();
      this.renderer.render(scene, cam);
      this.renderer.readRenderTargetPixels(rt, 0, 0, W, H, pixels);
      // Переворот по Y и перевод из линейного в sRGB.
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const si = ((H - 1 - y) * W + x) * 4;
          const di = (y * W + x) * 4;
          img.data[di] = lut[pixels[si]!]!;
          img.data[di + 1] = lut[pixels[si + 1]!]!;
          img.data[di + 2] = lut[pixels[si + 2]!]!;
          img.data[di + 3] = pixels[si + 3]!;
        }
      }
      g.putImageData(img, 0, 0);
      this.urls.set(id, canvas.toDataURL('image/png'));
      scene.remove(obj);
    }
    this.renderer.setRenderTarget(prevTarget);
    this.renderer.setClearColor(prevClear, prevAlpha);
    this.renderer.autoClear = prevAuto;
    this.renderer.shadowMap.enabled = prevShadow;
    rt.dispose();
  }

  url(id: string): string | null {
    return this.urls.get(id) ?? null;
  }

  product(sku: ProductId): string | null {
    return this.url(`prod_${sku}`);
  }

  /** <img> или пустая заглушка. */
  img(id: string, alt = ''): HTMLElement {
    const u = this.url(id);
    if (!u) {
      const d = document.createElement('div');
      d.className = 'pic-empty';
      return d;
    }
    const im = document.createElement('img');
    im.src = u;
    im.alt = alt;
    im.draggable = false;
    return im;
  }
}
