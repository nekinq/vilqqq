import * as THREE from 'three';
import { ROADS, PLAZA, SHOP_FORECOURT, SUPPLIER_SITES, BUS_STOP, HOUSES, WORLD, type XZ } from './layout';
import { fbm } from '../core/rng';
import { smoothstep } from '../core/math';
import * as TF from '../art/TextureFactory';
import type { MaterialLibrary } from '../art/MaterialLibrary';

/** Размер земли и карты смешивания. */
export const GROUND_SIZE = 280;
const HALF = GROUND_SIZE / 2;

/** Высота рельефа: внутри игровой зоны плоско, за ней — холмы. */
export function groundHeight(x: number, z: number): number {
  const dx = Math.max(0, Math.abs(x) - (WORLD.x1 + 4));
  const dz = Math.max(0, Math.abs(z) - (WORLD.z1 + 4));
  const d = Math.sqrt(dx * dx + dz * dz);
  if (d <= 0) return 0;
  const t = smoothstep(0, 45, d);
  const n = fbm(x * 0.018 + 3.1, z * 0.018 + 7.7, 4);
  return t * (4 + n * 22) + smoothstep(30, 90, d) * 10;
}

/** Сглаживание полилинии Catmull-Rom с шагом ~step метров. */
export function smoothPath(pts: readonly XZ[], step = 1): [number, number][] {
  if (pts.length < 3) return pts.map((p) => [p[0], p[1]]);
  const out: [number, number][] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)]!;
    const p1 = pts[i]!;
    const p2 = pts[i + 1]!;
    const p3 = pts[Math.min(pts.length - 1, i + 2)]!;
    const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const n = Math.max(2, Math.ceil(len / step));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  const last = pts[pts.length - 1]!;
  out.push([last[0], last[1]]);
  return out;
}

export interface SplatData {
  size: number;
  data: Uint8Array;
}

/** Рисует карту смешивания: R — грунтовка, G — брусчатка, B — огородная земля. */
function paintSplat(size: number): SplatData {
  const mpp = GROUND_SIZE / size; // метров на пиксель
  const toPx = (x: number, z: number): [number, number] => [(x + HALF) / mpp, (z + HALF) / mpp];
  const layer = () => {
    const { c, g } = TF.makeCanvas(size);
    g.fillStyle = '#000';
    g.fillRect(0, 0, size, size);
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.strokeStyle = '#fff';
    g.fillStyle = '#fff';
    return { c, g };
  };
  const dirt = layer();
  const cob = layer();
  const soil = layer();
  const blur = Math.max(1, Math.round(0.45 / mpp));

  // Дороги.
  dirt.g.filter = `blur(${blur}px)`;
  for (const r of ROADS) {
    const pts = smoothPath(r.pts, 1);
    dirt.g.lineWidth = r.width / mpp;
    dirt.g.beginPath();
    pts.forEach(([x, z], i) => {
      const [px, pz] = toPx(x, z);
      if (i === 0) dirt.g.moveTo(px, pz);
      else dirt.g.lineTo(px, pz);
    });
    dirt.g.stroke();
  }
  // Дворы поставщиков.
  for (const s of Object.values(SUPPLIER_SITES)) {
    const [px, pz] = toPx(s.yard.x, s.yard.z);
    dirt.g.beginPath();
    dirt.g.arc(px, pz, s.yard.r / mpp, 0, Math.PI * 2);
    dirt.g.fill();
  }
  // Дорожки к домам (короткий отрезок от двери вперёд).
  for (const h of HOUSES) {
    const fx = Math.sin(h.rotY);
    const fz = Math.cos(h.rotY);
    const [ax, az] = toPx(h.x + fx * 3, h.z + fz * 3);
    const [bx, bz] = toPx(h.x + fx * (h.yard.hd + 3), h.z + fz * (h.yard.hd + 3));
    dirt.g.lineWidth = 1.6 / mpp;
    dirt.g.beginPath();
    dirt.g.moveTo(ax, az);
    dirt.g.lineTo(bx, bz);
    dirt.g.stroke();
  }
  // Задний двор магазина и площадка остановки — утоптанная земля.
  {
    const [x0, z0] = toPx(-8, 20.2);
    const [x1, z1] = toPx(8, 26);
    dirt.g.fillRect(x0, z0, x1 - x0, z1 - z0);
    const [bx, bz] = toPx(BUS_STOP.x, BUS_STOP.z);
    dirt.g.beginPath();
    dirt.g.arc(bx, bz, 4 / mpp, 0, Math.PI * 2);
    dirt.g.fill();
  }

  // Брусчатка: кольцо площади + двор магазина.
  cob.g.filter = `blur(${Math.max(1, Math.round(0.12 / mpp))}px)`;
  {
    const [cx, cz] = toPx(PLAZA.x, PLAZA.z);
    cob.g.beginPath();
    cob.g.arc(cx, cz, PLAZA.rOuter / mpp, 0, Math.PI * 2);
    cob.g.arc(cx, cz, (PLAZA.rInner - 0.2) / mpp, 0, Math.PI * 2, true);
    cob.g.fill('evenodd');
    const f = SHOP_FORECOURT;
    const [x0, z0] = toPx(f.x0, f.z0);
    const [x1, z1] = toPx(f.x1, f.z1);
    cob.g.beginPath();
    const rr = 2 / mpp;
    cob.g.roundRect(x0, z0, x1 - x0, z1 - z0, rr);
    cob.g.fill();
    // Площадка у остановки.
    const [bx, bz] = toPx(BUS_STOP.x + 0.6, BUS_STOP.z);
    cob.g.beginPath();
    cob.g.roundRect(bx - 2.6 / mpp, bz - 3.4 / mpp, 5.2 / mpp, 6.8 / mpp, 0.6 / mpp);
    cob.g.fill();
  }

  // Огородная земля: клумба под дубом, грядки у овощей, огороды у домов.
  soil.g.filter = `blur(${Math.max(1, Math.round(0.15 / mpp))}px)`;
  {
    const [cx, cz] = toPx(PLAZA.x, PLAZA.z);
    soil.g.beginPath();
    soil.g.arc(cx, cz, PLAZA.rBed / mpp, 0, Math.PI * 2);
    soil.g.fill();
  }
  const bed = (x: number, z: number, w: number, d: number, rot = 0) => {
    const [px, pz] = toPx(x, z);
    soil.g.save();
    soil.g.translate(px, pz);
    soil.g.rotate(-rot);
    soil.g.fillRect(-w / 2 / mpp, -d / 2 / mpp, w / mpp, d / mpp);
    soil.g.restore();
  };
  // Грядки огородника (восточнее дома «Овощи»).
  for (let i = 0; i < 4; i++) bed(6.5 + i * 1.7, -47, 1.1, 6);
  for (const h of HOUSES) {
    if (!h.garden) continue;
    // Огород сбоку от дома (в локальных координатах дома: справа, x = +5.5).
    const lx = 5.6;
    const lz = -1.5;
    const c = Math.cos(h.rotY);
    const s = Math.sin(h.rotY);
    const wx = h.x + lx * c + lz * s;
    const wz = h.z - lx * s + lz * c;
    for (let i = 0; i < 3; i++) {
      const ox = (i - 1) * 1.4;
      bed(wx + ox * c, wz - ox * s, 0.9, 4.5, h.rotY);
    }
  }

  const dd = dirt.g.getImageData(0, 0, size, size).data;
  const cd = cob.g.getImageData(0, 0, size, size).data;
  const sd = soil.g.getImageData(0, 0, size, size).data;
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    data[i * 4] = dd[i * 4]!;
    data[i * 4 + 1] = cd[i * 4]!;
    data[i * 4 + 2] = sd[i * 4]!;
    data[i * 4 + 3] = 255;
  }
  return { size, data };
}

export class Ground {
  readonly mesh: THREE.Mesh;
  readonly splat: SplatData;
  private splatTex: THREE.DataTexture;

  constructor(lib: MaterialLibrary, quality: 'low' | 'medium' | 'high') {
    const size = quality === 'high' ? 2048 : quality === 'medium' ? 2048 : 1024;
    this.splat = paintSplat(size);
    this.splatTex = new THREE.DataTexture(this.splat.data, size, size, THREE.RGBAFormat);
    this.splatTex.colorSpace = THREE.NoColorSpace;
    this.splatTex.magFilter = THREE.LinearFilter;
    this.splatTex.minFilter = THREE.LinearMipmapLinearFilter;
    this.splatTex.generateMipmaps = true;
    this.splatTex.flipY = false;
    this.splatTex.needsUpdate = true;

    const seg = 140;
    const geo = new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE, seg, seg);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) pos.setY(i, groundHeight(pos.getX(i), pos.getZ(i)));
    geo.computeVertexNormals();

    const grass = lib.tex('g_grass', () => TF.grassTexture());
    const dirt = lib.tex('g_dirt', () => TF.dirtTexture());
    const cobble = lib.tex('g_cobble', () => TF.cobbleTexture(4, 9, 512, true));
    const soil = lib.tex('g_soil', () => TF.soilTexture());
    const noise = lib.tex('g_noise', () => TF.noiseTexture(), { srgb: false });

    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.96, metalness: 0 });
    const uniforms = {
      uSplat: { value: this.splatTex },
      uGrass: { value: grass },
      uDirt: { value: dirt },
      uCobble: { value: cobble },
      uSoil: { value: soil },
      uNoise: { value: noise },
      uHalf: { value: HALF },
    };
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vGXZ;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGXZ = (modelMatrix * vec4(position, 1.0)).xz;');
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          varying vec2 vGXZ;
          uniform sampler2D uSplat, uGrass, uDirt, uCobble, uSoil, uNoise;
          uniform float uHalf;`,
        )
        .replace(
          '#include <map_fragment>',
          `{
            vec2 suv = (vGXZ + uHalf) / (2.0 * uHalf);
            vec3 sp = texture2D(uSplat, suv).rgb;
            vec4 nz = texture2D(uNoise, vGXZ * 0.012);
            vec4 nd = texture2D(uNoise, vGXZ * 0.09 + 0.37);
            float wd = smoothstep(0.32, 0.62, sp.r + (nd.g - 0.5) * 0.45);
            float wc = smoothstep(0.42, 0.58, sp.g + (nd.r - 0.5) * 0.12);
            float ws = smoothstep(0.4, 0.6, sp.b + (nd.g - 0.5) * 0.2);
            vec3 grass = texture2D(uGrass, vGXZ * 0.22).rgb;
            vec3 grass2 = texture2D(uGrass, vGXZ * 0.061 + 0.5).rgb;
            grass = mix(grass, grass2, 0.35);
            // Макро-вариация: тёплые и тёмные пятна травы.
            float m = nz.r;
            grass *= mix(vec3(0.86, 0.9, 0.82), vec3(1.1, 1.07, 0.92), smoothstep(0.25, 0.75, m));
            vec3 dirt = texture2D(uDirt, vGXZ * 0.19).rgb * (0.92 + 0.16 * nz.g);
            vec3 cob = texture2D(uCobble, vGXZ * 0.55).rgb * (0.9 + 0.2 * nz.g);
            vec3 soil = texture2D(uSoil, vGXZ * 0.35).rgb;
            vec3 col = grass;
            // Край дороги: полоска вытоптанной травы.
            float edge = smoothstep(0.12, 0.32, sp.r) * (1.0 - wd);
            col = mix(col, col * vec3(1.08, 1.02, 0.86), edge * 0.6);
            col = mix(col, dirt, wd);
            col = mix(col, soil, ws);
            col = mix(col, cob, wc);
            diffuseColor.rgb *= col;
          }`,
        );
    };
    mat.customProgramCacheKey = () => 'ground_splat_v1';
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.name = 'ground';
    this.mesh.receiveShadow = true;
  }

  /** Значения карты смешивания в точке (0..1): грунт, брусчатка, огород. */
  sample(x: number, z: number): { dirt: number; cobble: number; soil: number } {
    const s = this.splat.size;
    const px = Math.floor(((x + HALF) / GROUND_SIZE) * s);
    const pz = Math.floor(((z + HALF) / GROUND_SIZE) * s);
    if (px < 0 || pz < 0 || px >= s || pz >= s) return { dirt: 0, cobble: 0, soil: 0 };
    const i = (pz * s + px) * 4;
    return { dirt: this.splat.data[i]! / 255, cobble: this.splat.data[i + 1]! / 255, soil: this.splat.data[i + 2]! / 255 };
  }
}
