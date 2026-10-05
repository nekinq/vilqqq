import * as THREE from 'three';
import { Sky } from './Sky';
import { clamp01, lerp, smoothstep } from '../core/math';
import type { MaterialLibrary } from '../art/MaterialLibrary';

/**
 * Смена дня и ночи меняет только небо, свет, туман, экспозицию и эмиссив (фонари, окна) —
 * геометрия не меняется. Время — игровые минуты от полуночи.
 */

interface Key {
  t: number;
  elev: number; // высота солнца, градусы
  sunColor: number;
  sunInt: number;
  hemiSky: number;
  hemiGround: number;
  hemiInt: number;
  skyTop: number;
  skyHorizon: number;
  fog: number;
  exposure: number;
  night: number;
}

const KEYS: Key[] = [
  { t: 300, elev: -10, sunColor: 0x9db1e0, sunInt: 0.35, hemiSky: 0x5a6a96, hemiGround: 0x2a2a30, hemiInt: 0.5, skyTop: 0x1a2550, skyHorizon: 0x4a4e78, fog: 0x39405e, exposure: 1.15, night: 0.9 },
  { t: 390, elev: 6, sunColor: 0xffb07a, sunInt: 1.2, hemiSky: 0xd9c7c6, hemiGround: 0x5a4c40, hemiInt: 0.85, skyTop: 0x6f8fc4, skyHorizon: 0xf3c39a, fog: 0xd8c3ad, exposure: 1.05, night: 0.3 },
  { t: 480, elev: 24, sunColor: 0xffe0b6, sunInt: 2.35, hemiSky: 0xd3e3f2, hemiGround: 0x8a7a5a, hemiInt: 1.25, skyTop: 0x79aedf, skyHorizon: 0xf0dcbc, fog: 0xdfe2d6, exposure: 1.0, night: 0 },
  { t: 600, elev: 44, sunColor: 0xfff0d6, sunInt: 2.7, hemiSky: 0xd6e7f5, hemiGround: 0x8f8360, hemiInt: 1.3, skyTop: 0x629fdd, skyHorizon: 0xd4e4ee, fog: 0xd6e2e4, exposure: 1.0, night: 0 },
  { t: 750, elev: 60, sunColor: 0xfff6e6, sunInt: 2.9, hemiSky: 0xd8e9f7, hemiGround: 0x908563, hemiInt: 1.32, skyTop: 0x5a9bdc, skyHorizon: 0xcfe2f0, fog: 0xd4e1e8, exposure: 1.0, night: 0 },
  { t: 930, elev: 46, sunColor: 0xfff0d4, sunInt: 2.75, hemiSky: 0xd8e6f2, hemiGround: 0x8e8060, hemiInt: 1.28, skyTop: 0x5f9cd9, skyHorizon: 0xd8e3ea, fog: 0xd8e2e2, exposure: 1.0, night: 0 },
  { t: 1080, elev: 24, sunColor: 0xffcf92, sunInt: 2.35, hemiSky: 0xe6d8c4, hemiGround: 0x84704e, hemiInt: 1.15, skyTop: 0x6a93c8, skyHorizon: 0xf3cf9c, fog: 0xe7d4b4, exposure: 1.0, night: 0 },
  { t: 1155, elev: 10, sunColor: 0xffaa62, sunInt: 1.8, hemiSky: 0xe0c3b0, hemiGround: 0x6e5844, hemiInt: 0.95, skyTop: 0x5a77b2, skyHorizon: 0xf6ad72, fog: 0xe0b48e, exposure: 1.02, night: 0.12 },
  { t: 1215, elev: 0, sunColor: 0xff8a52, sunInt: 0.8, hemiSky: 0xa996ae, hemiGround: 0x4a3e38, hemiInt: 0.72, skyTop: 0x34467e, skyHorizon: 0xe98b62, fog: 0xa7837a, exposure: 1.08, night: 0.55 },
  { t: 1265, elev: -7, sunColor: 0x9db1e0, sunInt: 0.34, hemiSky: 0x5d6b98, hemiGround: 0x2c2b31, hemiInt: 0.55, skyTop: 0x1c2756, skyHorizon: 0x4c4f7a, fog: 0x3a4161, exposure: 1.14, night: 0.85 },
  { t: 1330, elev: -12, sunColor: 0xa7b9e6, sunInt: 0.4, hemiSky: 0x4a5a8a, hemiGround: 0x22242a, hemiInt: 0.48, skyTop: 0x0b1330, skyHorizon: 0x26304f, fog: 0x232a44, exposure: 1.2, night: 1 },
  { t: 1500, elev: -12, sunColor: 0xa7b9e6, sunInt: 0.4, hemiSky: 0x4a5a8a, hemiGround: 0x22242a, hemiInt: 0.48, skyTop: 0x0b1330, skyHorizon: 0x26304f, fog: 0x232a44, exposure: 1.2, night: 1 },
];

const ca = new THREE.Color();
const cb = new THREE.Color();

function lerpColor(out: THREE.Color, a: number, b: number, t: number): THREE.Color {
  ca.set(a);
  cb.set(b);
  return out.copy(ca).lerp(cb, t);
}

export class DayNight {
  readonly sun: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  readonly sky: Sky;
  readonly fog: THREE.Fog;
  minutes = 480;
  night = 0;
  exposure = 1;
  /** Направление на солнце/луну (единичный вектор). */
  readonly lightDir = new THREE.Vector3(0, 1, 0);
  private shadowExtent = 34;
  private texel = 0.05;
  readonly cloudTint = new THREE.Color(0xffffff);

  constructor(
    scene: THREE.Scene,
    private readonly lib: MaterialLibrary,
    shadowQuality: 'off' | 'low' | 'high',
  ) {
    this.sky = new Sky(150);
    scene.add(this.sky.mesh);
    this.sky.mesh.add(this.sky.cloudGroup);
    this.sky.cloudGroup.children.forEach((c) => {
      const ang = Math.random() * Math.PI * 2;
      const d = 95 + Math.random() * 35;
      c.position.set(Math.cos(ang) * d, 42 + Math.random() * 22, Math.sin(ang) * d);
      c.scale.setScalar(0.55);
    });
    this.hemi = new THREE.HemisphereLight(0xd6e7f5, 0x8f8360, 1.3);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff4e0, 2.8);
    this.sun.castShadow = shadowQuality !== 'off';
    const res = shadowQuality === 'high' ? 4096 : 2048;
    this.sun.shadow.mapSize.set(res, res);
    this.setShadowExtent(shadowQuality === 'high' ? 40 : 34);
    this.sun.shadow.bias = -0.00035;
    this.sun.shadow.normalBias = 0.035;
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 220;
    scene.add(this.sun);
    scene.add(this.sun.target);
    this.fog = new THREE.Fog(0xd4e1e8, 60, 190);
    scene.fog = this.fog;
  }

  private scene: THREE.Scene | null = null;

  /** Карта окружения (IBL): мягкий градиент неба/земли. Металл и пластик получают отражения. */
  initEnvironment(renderer: THREE.WebGLRenderer, scene: THREE.Scene): void {
    this.scene = scene;
    const envScene = new THREE.Scene();
    const geo = new THREE.SphereGeometry(10, 32, 16);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `varying vec3 vP;
        void main(){
          float h = normalize(vP).y;
          vec3 top = vec3(0.55, 0.72, 0.92);
          vec3 hor = vec3(0.95, 0.92, 0.86);
          vec3 bot = vec3(0.42, 0.45, 0.32);
          vec3 c = h > 0.0 ? mix(hor, top, pow(h, 0.6)) : mix(hor, bot, pow(-h, 0.5));
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    envScene.add(new THREE.Mesh(geo, mat));
    const pmrem = new THREE.PMREMGenerator(renderer);
    const rt = pmrem.fromScene(envScene, 0.02);
    scene.environment = rt.texture;
    pmrem.dispose();
    geo.dispose();
    mat.dispose();
  }

  setShadowExtent(e: number): void {
    this.shadowExtent = e;
    const cam = this.sun.shadow.camera;
    cam.left = -e;
    cam.right = e;
    cam.top = e;
    cam.bottom = -e;
    cam.updateProjectionMatrix();
    this.texel = (2 * e) / this.sun.shadow.mapSize.x;
  }

  setShadowQuality(q: 'off' | 'low' | 'high'): void {
    this.sun.castShadow = q !== 'off';
    const res = q === 'high' ? 4096 : 2048;
    if (this.sun.shadow.mapSize.x !== res) {
      this.sun.shadow.mapSize.set(res, res);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null as never;
    }
    this.setShadowExtent(q === 'high' ? 40 : 34);
  }

  setDrawDistance(d: number): void {
    this.fog.near = d * 0.35;
    this.fog.far = d;
  }

  setTime(minutes: number): void {
    this.minutes = minutes;
  }

  /** Обновление: свет, небо, туман; камера тени следует за точкой фокуса (игрок). */
  update(dt: number, focus: THREE.Vector3, renderer?: THREE.WebGLRenderer): void {
    const m = Math.max(KEYS[0]!.t, Math.min(KEYS[KEYS.length - 1]!.t, this.minutes < 240 ? this.minutes + 1440 : this.minutes));
    let i = 0;
    while (i < KEYS.length - 2 && KEYS[i + 1]!.t < m) i++;
    const a = KEYS[i]!;
    const b = KEYS[i + 1]!;
    const t = smoothstep(0, 1, clamp01((m - a.t) / (b.t - a.t)));

    const elev = lerp(a.elev, b.elev, t);
    this.night = lerp(a.night, b.night, t);
    this.exposure = lerp(a.exposure, b.exposure, t);

    // Путь солнца: восток (утро) → север-северо-запад (полдень) → запад (вечер).
    const dayT = clamp01((m - 480) / (1215 - 480));
    const phi = ((8 + dayT * 182) * Math.PI) / 180;
    const e = (Math.max(elev, 4) * Math.PI) / 180;
    const sunDir = new THREE.Vector3(Math.cos(phi) * Math.cos(e), Math.sin(e), -Math.sin(phi) * Math.cos(e)).normalize();
    // Луна — фиксированное направление (юго-восток, высоко).
    const moonDir = new THREE.Vector3(0.45, 0.72, 0.52).normalize();
    const moonMix = smoothstep(1195, 1250, m) * (1 - smoothstep(330, 420, m < 600 ? m : 0));
    this.lightDir.copy(sunDir).lerp(moonDir, moonMix).normalize();

    lerpColor(this.sun.color, a.sunColor, b.sunColor, t);
    this.sun.intensity = lerp(a.sunInt, b.sunInt, t);
    lerpColor(this.hemi.color, a.hemiSky, b.hemiSky, t);
    lerpColor(this.hemi.groundColor, a.hemiGround, b.hemiGround, t);
    this.hemi.intensity = lerp(a.hemiInt, b.hemiInt, t);
    lerpColor(this.fog.color, a.fog, b.fog, t);
    lerpColor(this.sky.uniforms.uTop.value, a.skyTop, b.skyTop, t);
    lerpColor(this.sky.uniforms.uHorizon.value, a.skyHorizon, b.skyHorizon, t);
    this.sky.uniforms.uBottom.value.copy(this.fog.color).multiplyScalar(0.9);
    this.sky.uniforms.uSunDir.value.copy(sunDir);
    this.sky.uniforms.uSunColor.value.copy(this.sun.color).multiplyScalar(elev > -2 ? 1 : 0);
    this.sky.uniforms.uMoonDir.value.copy(moonDir);
    this.cloudTint.copy(this.hemi.color).lerp(new THREE.Color(0xffffff), 0.55 * (1 - this.night)).multiplyScalar(1 - this.night * 0.55);
    this.sky.update(dt, focus, this.night, this.cloudTint);
    this.lib.setNight(this.night);
    if (renderer) renderer.toneMappingExposure = this.exposure;
    if (this.scene) this.scene.environmentIntensity = lerp(0.55, 0.12, this.night);

    // Камера тени: центр — фокус, позиция привязана к текселю (без мерцания).
    const center = focus.clone();
    const lightSpace = new THREE.Matrix4().lookAt(new THREE.Vector3(), this.lightDir.clone().negate(), new THREE.Vector3(0, 1, 0));
    const inv = lightSpace.clone().invert();
    const ls = center.clone().applyMatrix4(inv);
    ls.x = Math.round(ls.x / this.texel) * this.texel;
    ls.y = Math.round(ls.y / this.texel) * this.texel;
    const snapped = ls.applyMatrix4(lightSpace);
    this.sun.target.position.copy(snapped);
    this.sun.position.copy(snapped).addScaledVector(this.lightDir, 100);
    this.sun.target.updateMatrixWorld();
  }

  get extent(): number {
    return this.shadowExtent;
  }
}
