import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RenderSystem } from '../core/Renderer';
import { MaterialLibrary } from '../art/MaterialLibrary';
import { AssetManager } from '../core/AssetManager';
import { allAssets } from '../art/registry';
import { Sky } from '../world/Sky';
import { measure } from '../art/ModelKit';
import '../art/models';

/**
 * Просмотрщик для арт-проверки: ?viewer=asset&id=shop_shell — один ассет на подиуме;
 * ?viewer=grid&cat=product — сетка ассетов категории. Используется для скриншотов в QA.
 */
export async function runViewer(params: URLSearchParams): Promise<void> {
  const root = document.getElementById('viewport')!;
  const rs = new RenderSystem(root);
  const lib = new MaterialLibrary();
  lib.setAnisotropy(Math.min(8, rs.renderer.capabilities.getMaxAnisotropy()));
  const src = (params.get('src') as 'glb' | 'procedural') ?? 'procedural';
  const assets = new AssetManager(lib, src);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xcfe3f2);
  const sky = new Sky(300);
  scene.add(sky.mesh);
  const hemi = new THREE.HemisphereLight(0xdcebf7, 0x7d6b4c, 1.4);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1dc, 2.6);
  sun.position.set(-14, 22, -12);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -20;
  sun.shadow.camera.right = 20;
  sun.shadow.camera.top = 20;
  sun.shadow.camera.bottom = -20;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  scene.add(sun);
  {
    const pm = new THREE.PMREMGenerator(rs.renderer);
    const envScene = new THREE.Scene();
    envScene.background = new THREE.Color(0xdfe8ef);
    envScene.add(new THREE.HemisphereLight(0xffffff, 0x667744, 3));
    scene.environment = pm.fromScene(envScene, 0.02).texture;
    scene.environmentIntensity = 0.55;
  }
  const floor = new THREE.Mesh(new THREE.CircleGeometry(60, 48), new THREE.MeshStandardMaterial({ color: 0x9fb87a, roughness: 1 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const camera = new THREE.PerspectiveCamera(45, rs.aspect, 0.05, 800);
  const controls = new OrbitControls(camera, rs.canvas);
  controls.enableDamping = true;

  const mode = params.get('viewer');
  const info: Record<string, unknown> = {};
  if (mode === 'grid') {
    const cat = params.get('cat');
    const ids = allAssets()
      .filter((a) => !cat || a.category === cat)
      .map((a) => a.id);
    await assets.preload(ids);
    const cols = Math.ceil(Math.sqrt(ids.length));
    let maxSize = 0;
    const objs = ids.map((id) => {
      const o = assets.instance(id);
      const m = measure(o);
      maxSize = Math.max(maxSize, m.w, m.d);
      return { id, o, m };
    });
    const cell = Math.max(0.5, maxSize * 1.25);
    objs.forEach(({ id, o, m }, i) => {
      const cx = (i % cols) - (cols - 1) / 2;
      const cz = Math.floor(i / cols) - (Math.ceil(ids.length / cols) - 1) / 2;
      o.position.set(cx * cell, 0, cz * cell);
      scene.add(o);
      info[id] = m;
    });
    const span = cols * cell;
    camera.position.set(span * 0.55, span * 0.75, span * 0.95);
    controls.target.set(0, maxSize * 0.15, 0);
    sun.shadow.camera.left = -span;
    sun.shadow.camera.right = span;
    sun.shadow.camera.top = span;
    sun.shadow.camera.bottom = -span;
    sun.position.set(-span * 0.6, span * 1.2, -span * 0.4);
    sun.shadow.camera.far = span * 4;
    sun.shadow.camera.updateProjectionMatrix();
  } else {
    const id = params.get('id') ?? 'shop_shell';
    await assets.preload([id]);
    const o = assets.instance(id);
    scene.add(o);
    const m = measure(o);
    info[id] = { ...m, triangles: o.userData.triangles };
    const box = new THREE.Box3().setFromObject(o);
    const c = box.getCenter(new THREE.Vector3());
    const size = Math.max(m.w, m.h, m.d);
    const az = Number(params.get('az') ?? 35) * (Math.PI / 180);
    const el = Number(params.get('el') ?? 22) * (Math.PI / 180);
    const dist = Number(params.get('dist') ?? size * 1.6);
    camera.position.set(c.x + Math.sin(az) * Math.cos(el) * dist, c.y + Math.sin(el) * dist, c.z + Math.cos(az) * Math.cos(el) * dist);
    controls.target.copy(c);
    const sd = size * 1.2;
    sun.shadow.camera.left = -sd;
    sun.shadow.camera.right = sd;
    sun.shadow.camera.top = sd;
    sun.shadow.camera.bottom = -sd;
    sun.position.set(c.x - sd * 0.7, c.y + sd * 1.3, c.z - sd * 0.5);
    sun.target.position.copy(c);
    scene.add(sun.target);
    sun.shadow.camera.far = sd * 5;
    sun.shadow.camera.updateProjectionMatrix();
    if (params.get('inside')) {
      camera.position.set(Number(params.get('cx') ?? 0), Number(params.get('cy') ?? 1.6), Number(params.get('cz') ?? 0));
      controls.target.set(Number(params.get('tx') ?? 0), Number(params.get('ty') ?? 1.4), Number(params.get('tz') ?? -3));
      camera.fov = 70;
    }
  }
  camera.aspect = rs.aspect;
  camera.updateProjectionMatrix();
  controls.update();
  (window as unknown as { __viewer: unknown }).__viewer = { info, ready: true, stats: rs.stats };
  const loop = () => {
    controls.update();
    sky.update(0.016, camera.position, 0, new THREE.Color(0xffffff));
    rs.render(scene, camera);
    requestAnimationFrame(loop);
  };
  loop();
  window.addEventListener('resize', () => {
    camera.aspect = rs.aspect;
    camera.updateProjectionMatrix();
  });
}
