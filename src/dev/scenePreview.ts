import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RenderSystem } from '../core/Renderer';
import { MaterialLibrary } from '../art/MaterialLibrary';
import { AssetManager } from '../core/AssetManager';
import { Village } from '../world/Village';

/** Предпросмотр деревни со свободной камерой: ?scene=village&cx=..&cy=..&cz=..&tx=..&ty=..&tz=..&time=13 */
export async function runScenePreview(params: URLSearchParams): Promise<void> {
  const rs = new RenderSystem(document.getElementById('viewport')!);
  const lib = new MaterialLibrary();
  lib.setAnisotropy(Math.min(8, rs.renderer.capabilities.getMaxAnisotropy()));
  const assets = new AssetManager(lib, (params.get('src') as 'glb' | 'procedural') ?? 'procedural');
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(Number(params.get('fov') ?? 60), rs.aspect, 0.1, 600);
  const village = new Village(scene, assets, lib, 'high', rs.renderer);
  await village.build((p) => {
    (window as unknown as { __progress: number }).__progress = p;
  });
  const time = Number(params.get('time') ?? 11);
  village.dayNight.setTime(time * 60);
  camera.position.set(Number(params.get('cx') ?? 30), Number(params.get('cy') ?? 30), Number(params.get('cz') ?? 45));
  const controls = new OrbitControls(camera, rs.canvas);
  controls.target.set(Number(params.get('tx') ?? 0), Number(params.get('ty') ?? 0), Number(params.get('tz') ?? 0));
  controls.update();
  let last = performance.now();
  const loop = () => {
    const now = performance.now();
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    controls.update();
    village.update(dt, camera);
    rs.render(scene, camera);
    (window as unknown as { __stats: unknown }).__stats = { ...rs.stats };
    requestAnimationFrame(loop);
  };
  (window as unknown as { __ready: boolean }).__ready = true;
  loop();
  window.addEventListener('resize', () => {
    camera.aspect = rs.aspect;
    camera.updateProjectionMatrix();
  });
}
