import * as THREE from 'three';
import type { Village } from './Village';
import { damp } from '../core/math';
import { PLAZA } from './layout';

const SMOKE_VERT = /* glsl */ `
attribute float aAge;
attribute float aSeed;
uniform float uScale;
varying float vAlpha;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float size = (0.6 + aAge * 2.4) * (0.8 + aSeed * 0.4);
  gl_PointSize = size * uScale / -mv.z;
  vAlpha = smoothstep(0.0, 0.12, aAge) * (1.0 - smoothstep(0.55, 1.0, aAge)) * 0.38;
  gl_Position = projectionMatrix * mv;
}`;

const SMOKE_FRAG = /* glsl */ `
uniform vec3 uColor;
varying float vAlpha;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float r = length(d);
  float a = smoothstep(0.5, 0.15, r) * vAlpha;
  if (a < 0.01) discard;
  gl_FragColor = vec4(uColor, a);
}`;

interface Bird {
  obj: THREE.Object3D;
  wingL: THREE.Object3D;
  wingR: THREE.Object3D;
  phase: number;
  radius: number;
  height: number;
  speed: number;
  angle: number;
}

/**
 * Жизнь фона: дым из труб (частицы, один вызов отрисовки), птицы над площадью, коровы в загоне.
 */
export class Ambient {
  private smoke: THREE.Points;
  private ages: Float32Array;
  private seeds: Float32Array;
  private sources: THREE.Vector3[];
  private perSource = 14;
  private birds: Bird[] = [];
  private cows: { obj: THREE.Object3D; head: THREE.Object3D | null; baseY: number; target: number; timer: number }[] = [];
  private t = 0;
  private smokeMat: THREE.ShaderMaterial;

  constructor(village: Village, scene: THREE.Scene) {
    this.sources = village.smokePoints.map((p) => p.clone());
    const n = this.sources.length * this.perSource;
    const pos = new Float32Array(n * 3);
    this.ages = new Float32Array(n);
    this.seeds = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      this.ages[i] = (i % this.perSource) / this.perSource;
      this.seeds[i] = Math.random();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aAge', new THREE.BufferAttribute(this.ages, 1));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(this.seeds, 1));
    this.smokeMat = new THREE.ShaderMaterial({
      vertexShader: SMOKE_VERT,
      fragmentShader: SMOKE_FRAG,
      uniforms: { uScale: { value: 600 }, uColor: { value: new THREE.Color(0xe8e6e0) } },
      transparent: true,
      depthWrite: false,
    });
    this.smoke = new THREE.Points(geo, this.smokeMat);
    this.smoke.frustumCulled = false;
    this.smoke.renderOrder = 3;
    scene.add(this.smoke);
    // Птицы: простые «галочки» с машущими крыльями.
    const birdMat = new THREE.MeshStandardMaterial({ color: 0x3a3a3e, roughness: 1, side: THREE.DoubleSide });
    const wingGeo = new THREE.BufferGeometry();
    wingGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.08, 0, 0, -0.1, 0.42, 0.02, -0.02], 3));
    wingGeo.computeVertexNormals();
    const bodyGeo = new THREE.ConeGeometry(0.05, 0.32, 4);
    bodyGeo.rotateX(Math.PI / 2);
    for (let i = 0; i < 6; i++) {
      const obj = new THREE.Group();
      const body = new THREE.Mesh(bodyGeo, birdMat);
      const wingL = new THREE.Mesh(wingGeo, birdMat);
      const wingR = new THREE.Mesh(wingGeo, birdMat);
      wingR.scale.x = -1;
      obj.add(body, wingL, wingR);
      obj.scale.setScalar(2.2);
      scene.add(obj);
      this.birds.push({ obj, wingL, wingR, phase: Math.random() * 6, radius: 14 + Math.random() * 10, height: 18 + Math.random() * 6, speed: 0.22 + Math.random() * 0.08, angle: (i / 6) * Math.PI * 2 });
    }
    for (const c of village.cows) {
      this.cows.push({ obj: c, head: c.getObjectByName('head') ?? null, baseY: c.rotation.y, target: c.rotation.y, timer: 2 + Math.random() * 5 });
    }
  }

  update(dt: number, night: number): void {
    this.t += dt;
    // Дым.
    const pos = this.smoke.geometry.getAttribute('position') as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    const wind = new THREE.Vector2(0.55, 0.25);
    for (let s = 0; s < this.sources.length; s++) {
      const src = this.sources[s]!;
      for (let k = 0; k < this.perSource; k++) {
        const i = s * this.perSource + k;
        let a = this.ages[i]! + dt / 9;
        if (a >= 1) {
          a -= 1;
          this.seeds[i] = Math.random();
        }
        this.ages[i] = a;
        const sd = this.seeds[i]!;
        const rise = a * 6.5;
        arr[i * 3] = src.x + wind.x * rise * 0.9 + Math.sin(a * 6 + sd * 10) * 0.25 * a;
        arr[i * 3 + 1] = src.y + rise;
        arr[i * 3 + 2] = src.z + wind.y * rise * 0.9 + Math.cos(a * 5 + sd * 7) * 0.25 * a;
      }
    }
    pos.needsUpdate = true;
    (this.smoke.geometry.getAttribute('aAge') as THREE.BufferAttribute).needsUpdate = true;
    this.smokeMat.uniforms.uColor!.value.setRGB(0.91 - night * 0.55, 0.9 - night * 0.55, 0.88 - night * 0.5);
    this.smokeMat.uniforms.uScale!.value = window.innerHeight * 0.8;
    // Птицы днём кружат над площадью, ночью исчезают.
    const show = night < 0.5;
    for (const b of this.birds) {
      b.obj.visible = show;
      if (!show) continue;
      b.angle += dt * b.speed;
      b.phase += dt * 9;
      const x = PLAZA.x + Math.cos(b.angle) * b.radius;
      const z = PLAZA.z + Math.sin(b.angle) * b.radius;
      b.obj.position.set(x, b.height + Math.sin(this.t * 0.7 + b.radius) * 1.2, z);
      b.obj.rotation.set(0, -b.angle, 0.25);
      const flap = Math.sin(b.phase) * 0.7;
      b.wingL.rotation.z = flap;
      b.wingR.rotation.z = -flap;
    }
    // Коровы: иногда поворачиваются, щиплют траву.
    for (const c of this.cows) {
      c.timer -= dt;
      if (c.timer <= 0) {
        c.timer = 4 + Math.random() * 7;
        c.target = c.baseY + (Math.random() - 0.5) * 1.4;
      }
      c.obj.rotation.y = damp(c.obj.rotation.y, c.target, 0.8, dt);
      if (c.head) c.head.rotation.x = Math.max(0, Math.sin(this.t * 0.35 + c.baseY * 3)) * 0.55;
    }
  }
}
