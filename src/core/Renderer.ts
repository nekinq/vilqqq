import * as THREE from 'three';
import type { GameSettings } from './Settings';

/**
 * Обёртка над WebGLRenderer: размер, качество, двухпроходный рендер
 * (мир + вьюмодель рук поверх, с очисткой глубины).
 */
export class RenderSystem {
  readonly renderer: THREE.WebGLRenderer;
  readonly canvas: HTMLCanvasElement;
  private width = 1;
  private height = 1;
  private renderScale = 1;
  stats = { calls: 0, triangles: 0, geometries: 0, textures: 0 };

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
      stencil: false,
      preserveDrawingBuffer: false,
    });
    this.canvas = this.renderer.domElement;
    this.canvas.id = 'game-canvas';
    this.canvas.tabIndex = 0;
    container.appendChild(this.canvas);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.autoClear = false;
    this.renderer.info.autoReset = false;
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  applySettings(g: GameSettings['graphics']): void {
    this.renderScale = g.renderScale;
    this.renderer.shadowMap.enabled = g.shadows !== 'off';
    this.resize();
  }

  get aspect(): number {
    return this.width / this.height;
  }

  resize(): void {
    const w = Math.max(1, window.innerWidth);
    const h = Math.max(1, window.innerHeight);
    this.width = w;
    this.height = h;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.setPixelRatio(dpr * this.renderScale);
    this.renderer.setSize(w, h, true);
  }

  render(scene: THREE.Scene, camera: THREE.Camera, overlay?: { scene: THREE.Scene; camera: THREE.Camera }): void {
    const r = this.renderer;
    r.info.reset();
    r.clear(true, true, false);
    r.render(scene, camera);
    if (overlay) {
      r.clearDepth();
      r.render(overlay.scene, overlay.camera);
    }
    this.stats.calls = r.info.render.calls;
    this.stats.triangles = r.info.render.triangles;
    this.stats.geometries = r.info.memory.geometries;
    this.stats.textures = r.info.memory.textures;
  }
}
