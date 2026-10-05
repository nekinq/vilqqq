import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js';
import { Rng } from '../core/rng';

/**
 * ModelKit — «моделирование кодом». Модель собирается из примитивов в общих материалах
 * (по имени), с вершинными цветами и UV, спроецированными по мировым осям (единая плотность
 * текстуры). На выходе — группа, в которой на каждый материал ровно один меш (минимум draw calls).
 * Узлы с именами (`node`) дают опорные точки для анимации (дверь, ящик кассы и т. п.).
 */

export type ColorLike = number | string | THREE.Color;
export type V3 = readonly [number, number, number];

export interface PartOptions {
  /** Имя материала из общей библиотеки: flat, wood, plaster, roof, stone, ... или sign:<id>. */
  mat?: string;
  color?: ColorLike;
  /** Разброс яркости всей детали (0..1). */
  jitter?: number;
  /** Разброс яркости каждого треугольника (0..1) — для органики. */
  faceJitter?: number;
  /** UV: 'box' — проекция по осям в метрах, 'native' — родные UV примитива (вывески). */
  uv?: 'box' | 'native';
  /** Метров на один повтор текстуры. */
  uvScale?: number;
  /** Поменять местами U и V (направление волокон/досок). */
  uvSwap?: boolean;
  uvOffset?: readonly [number, number];
  /** Сглаженные нормали (цилиндры, сферы). По умолчанию — плоское затенение. */
  smooth?: boolean;
  /** Не отбрасывать тень (мелочь). */
  noShadow?: boolean;
  /** Не принимать тень. */
  noReceive?: boolean;
  /** «Запечённое» затенение: грани, смотрящие вниз, темнее (0..1). Для крон, камней, кустов. */
  ao?: number;
  /** Градиент по высоте детали: низ темнее на величину (0..1). */
  vgrad?: number;
}

const tmpColor = new THREE.Color();
const placeholderCache = new Map<string, THREE.MeshStandardMaterial>();

/** Материал-заглушка с именем. Реальные материалы подставляет MaterialLibrary по имени. */
export function placeholderMaterial(name: string): THREE.MeshStandardMaterial {
  let m = placeholderCache.get(name);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ name, vertexColors: true, roughness: 0.85, metalness: 0 });
    placeholderCache.set(name, m);
  }
  return m;
}

interface Bucket {
  mat: string;
  castShadow: boolean;
  receiveShadow: boolean;
  geos: THREE.BufferGeometry[];
}

function toColor(c: ColorLike | undefined): THREE.Color {
  if (c === undefined) return tmpColor.set(0xffffff);
  if (c instanceof THREE.Color) return tmpColor.copy(c);
  return tmpColor.set(c as THREE.ColorRepresentation);
}

function eulerOf(rot?: V3): THREE.Euler {
  return new THREE.Euler(rot?.[0] ?? 0, rot?.[1] ?? 0, rot?.[2] ?? 0, 'XYZ');
}

export class ModelBuilder {
  private buckets = new Map<string, Bucket>();
  private stack: THREE.Matrix4[] = [new THREE.Matrix4()];
  private children: { name: string; pos: V3; rot: V3; builder: ModelBuilder; userData?: Record<string, unknown> }[] = [];
  private markers: { name: string; pos: V3; rot: V3 }[] = [];
  /** Коллайдеры-боксы в локальных координатах модели: [cx, cz, hw, hd]. */
  private colliders: [number, number, number, number][] = [];
  readonly rng: Rng;
  triangles = 0;

  constructor(seed = 1) {
    this.rng = new Rng(seed);
  }

  // ───────────── трансформации ─────────────

  private get current(): THREE.Matrix4 {
    return this.stack[this.stack.length - 1]!;
  }

  /** Выполнить fn в локальной системе координат (позиция, поворот, масштаб). */
  at(pos: V3, rot: V3 | undefined, fn: () => void, scale?: V3): this {
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(...pos),
      new THREE.Quaternion().setFromEuler(eulerOf(rot)),
      new THREE.Vector3(...(scale ?? [1, 1, 1])),
    );
    this.stack.push(this.current.clone().multiply(m));
    try {
      fn();
    } finally {
      this.stack.pop();
    }
    return this;
  }

  /** Повторить fn с отражением по X (симметричные детали). */
  mirrorX(fn: (side: 1 | -1) => void): this {
    fn(1);
    this.stack.push(this.current.clone().multiply(new THREE.Matrix4().makeScale(-1, 1, 1)));
    try {
      fn(-1);
    } finally {
      this.stack.pop();
    }
    return this;
  }

  // ───────────── примитивы ─────────────

  box(size: V3, pos: V3, opts: PartOptions = {}, rot?: V3): this {
    const g = new THREE.BoxGeometry(size[0], size[1], size[2]);
    return this.add(g, pos, rot, undefined, opts);
  }

  /** Бокс по минимальному и максимальному углу. */
  boxMinMax(min: V3, max: V3, opts: PartOptions = {}): this {
    const size: V3 = [Math.abs(max[0] - min[0]), Math.abs(max[1] - min[1]), Math.abs(max[2] - min[2])];
    const pos: V3 = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
    return this.box(size, pos, opts);
  }

  /** Бокс со скошенными (фаска) рёбрами — мягкий силуэт для мебели, ящиков, товара. 44 треугольника. */
  chamferBox(size: V3, pos: V3, bevel: number, opts: PartOptions = {}, rot?: V3): this {
    const hw = size[0] / 2;
    const hh = size[1] / 2;
    const hd = size[2] / 2;
    const b = Math.max(0.0005, Math.min(bevel, hw * 0.9, hh * 0.9, hd * 0.9));
    const pts: THREE.Vector3[] = [];
    for (const sx of [-1, 1])
      for (const sy of [-1, 1])
        for (const sz of [-1, 1]) {
          pts.push(new THREE.Vector3(sx * (hw - b), sy * hh, sz * (hd - b)));
          pts.push(new THREE.Vector3(sx * hw, sy * (hh - b), sz * (hd - b)));
          pts.push(new THREE.Vector3(sx * (hw - b), sy * (hh - b), sz * hd));
        }
    return this.add(new ConvexGeometry(pts), pos, rot, undefined, opts);
  }

  /** Выпуклая оболочка по точкам (камни, кристаллы, хлебные корки). */
  hull(points: readonly V3[], pos: V3, opts: PartOptions = {}, rot?: V3, scale?: V3): this {
    return this.add(new ConvexGeometry(points.map((p) => new THREE.Vector3(...p))), pos, rot, scale, opts);
  }

  cyl(rTop: number, rBottom: number, h: number, seg: number, pos: V3, opts: PartOptions = {}, rot?: V3, open = false): this {
    const g = new THREE.CylinderGeometry(rTop, rBottom, h, seg, 1, open);
    return this.add(g, pos, rot, undefined, opts);
  }

  cone(r: number, h: number, seg: number, pos: V3, opts: PartOptions = {}, rot?: V3): this {
    const g = new THREE.ConeGeometry(r, h, seg, 1);
    return this.add(g, pos, rot, undefined, opts);
  }

  sphere(r: number, wSeg: number, hSeg: number, pos: V3, opts: PartOptions = {}, scale?: V3, rot?: V3): this {
    const g = new THREE.SphereGeometry(r, wSeg, hSeg);
    return this.add(g, pos, rot, scale, opts);
  }

  /** Полусфера (купол) — шляпки, хлеб, кроны. */
  dome(r: number, wSeg: number, hSeg: number, pos: V3, opts: PartOptions = {}, scale?: V3, rot?: V3): this {
    const g = new THREE.SphereGeometry(r, wSeg, hSeg, 0, Math.PI * 2, 0, Math.PI / 2);
    return this.add(g, pos, rot, scale, opts);
  }

  /** Икосаэдр с искажением вершин — «живые» кроны, камни, кусты. */
  ico(r: number, detail: number, pos: V3, opts: PartOptions = {}, scale?: V3, rot?: V3, distort = 0): this {
    const g = new THREE.IcosahedronGeometry(r, detail);
    if (distort > 0) {
      // Искажаем одинаково совпадающие вершины, чтобы не было щелей.
      const p = g.getAttribute('position') as THREE.BufferAttribute;
      const map = new Map<string, [number, number, number]>();
      for (let i = 0; i < p.count; i++) {
        const key = `${p.getX(i).toFixed(4)},${p.getY(i).toFixed(4)},${p.getZ(i).toFixed(4)}`;
        let off = map.get(key);
        if (!off) {
          off = [1 + (this.rng.next() - 0.5) * 2 * distort, 1 + (this.rng.next() - 0.5) * 2 * distort, 1 + (this.rng.next() - 0.5) * 2 * distort];
          map.set(key, off);
        }
        p.setXYZ(i, p.getX(i) * off[0], p.getY(i) * off[1], p.getZ(i) * off[2]);
      }
    }
    return this.add(g, pos, rot, scale, opts);
  }

  dodeca(r: number, pos: V3, opts: PartOptions = {}, scale?: V3, rot?: V3): this {
    return this.add(new THREE.DodecahedronGeometry(r, 0), pos, rot, scale, opts);
  }

  /** Тело вращения по профилю [радиус, высота]. */
  lathe(points: readonly (readonly [number, number])[], seg: number, pos: V3, opts: PartOptions = {}, rot?: V3, scale?: V3): this {
    const g = new THREE.LatheGeometry(
      points.map(([r, y]) => new THREE.Vector2(Math.max(0, r), y)),
      seg,
    );
    return this.add(g, pos, rot, scale, { smooth: true, ...opts });
  }

  /** Выдавливание плоского контура (в плоскости XY) на глубину вдоль +Z, центрировано по Z. */
  extrude(shape: readonly (readonly [number, number])[], depth: number, pos: V3, opts: PartOptions = {}, rot?: V3, bevel = 0): this {
    const s = new THREE.Shape(shape.map(([x, y]) => new THREE.Vector2(x, y)));
    const g = new THREE.ExtrudeGeometry(s, {
      depth,
      bevelEnabled: bevel > 0,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelSegments: 1,
      steps: 1,
    });
    g.translate(0, 0, -depth / 2);
    return this.add(g, pos, rot, undefined, opts);
  }

  /** Треугольная призма (фронтон): основание w по X, высота h по Y, глубина d по Z. Низ в y=0. */
  prism(w: number, h: number, d: number, pos: V3, opts: PartOptions = {}, rot?: V3): this {
    return this.extrude(
      [
        [-w / 2, 0],
        [w / 2, 0],
        [0, h],
      ],
      d,
      pos,
      opts,
      rot,
    );
  }

  /** Плоский четырёхугольник, смотрящий в +Z (вывески, декали). */
  plane(w: number, h: number, pos: V3, opts: PartOptions = {}, rot?: V3): this {
    const g = new THREE.PlaneGeometry(w, h);
    return this.add(g, pos, rot, undefined, { uv: 'native', ...opts });
  }

  /** Тор (обручи бочек, ручки). */
  torus(r: number, tube: number, radial: number, tubular: number, pos: V3, opts: PartOptions = {}, rot?: V3, arc = Math.PI * 2): this {
    return this.add(new THREE.TorusGeometry(r, tube, radial, tubular, arc), pos, rot, undefined, { smooth: true, ...opts });
  }

  /** Труба/жердь между двумя точками. */
  beam(a: V3, b: V3, radius: number, seg: number, opts: PartOptions = {}): this {
    const va = new THREE.Vector3(...a);
    const vb = new THREE.Vector3(...b);
    const dir = vb.clone().sub(va);
    const len = dir.length();
    const g = new THREE.CylinderGeometry(radius, radius, len, seg, 1);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    const mid = va.add(vb).multiplyScalar(0.5);
    const m = new THREE.Matrix4().compose(mid, q, new THREE.Vector3(1, 1, 1));
    return this.addMatrix(g, m, opts);
  }

  /** Брус прямоугольного сечения между двумя точками. */
  plankBetween(a: V3, b: V3, width: number, thick: number, opts: PartOptions = {}, up: V3 = [0, 1, 0]): this {
    const va = new THREE.Vector3(...a);
    const vb = new THREE.Vector3(...b);
    const len = va.distanceTo(vb);
    const g = new THREE.BoxGeometry(width, thick, len);
    const m = new THREE.Matrix4().lookAt(va, vb, new THREE.Vector3(...up));
    m.setPosition(va.clone().add(vb).multiplyScalar(0.5));
    // lookAt смотрит -Z на цель; длина по Z — симметрична, так что направление не важно.
    return this.addMatrix(g, m, opts);
  }

  /** Произвольная геометрия. */
  geom(g: THREE.BufferGeometry, pos: V3, opts: PartOptions = {}, rot?: V3, scale?: V3): this {
    return this.add(g, pos, rot, scale, opts);
  }

  /** Именованный дочерний узел (опорная точка анимации). */
  node(name: string, pos: V3, rot: V3 | undefined, fn: (b: ModelBuilder) => void, userData?: Record<string, unknown>): this {
    const child = new ModelBuilder(this.rng.int(1, 1e9));
    fn(child);
    // Позиция узла задаётся в текущей системе координат.
    const m = this.current.clone().multiply(
      new THREE.Matrix4().compose(new THREE.Vector3(...pos), new THREE.Quaternion().setFromEuler(eulerOf(rot)), new THREE.Vector3(1, 1, 1)),
    );
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    m.decompose(p, q, s);
    const e = new THREE.Euler().setFromQuaternion(q, 'XYZ');
    this.children.push({ name, pos: [p.x, p.y, p.z], rot: [e.x, e.y, e.z], builder: child, userData });
    return this;
  }

  /** Коллайдер-бокс (в текущей системе координат, без поворота) для карты коллизий. */
  collider(cx: number, cz: number, hw: number, hd: number): this {
    const v = new THREE.Vector3(cx, 0, cz).applyMatrix4(this.current);
    this.colliders.push([+v.x.toFixed(3), +v.z.toFixed(3), hw, hd]);
    return this;
  }

  /** Пустая метка (точка крепления: место для товара, свет, точка взаимодействия). */
  marker(name: string, pos: V3, rot?: V3): this {
    const v = new THREE.Vector3(...pos).applyMatrix4(this.current);
    this.markers.push({ name, pos: [v.x, v.y, v.z], rot: rot ?? [0, 0, 0] });
    return this;
  }

  // ───────────── внутреннее ─────────────

  private add(g: THREE.BufferGeometry, pos: V3, rot: V3 | undefined, scale: V3 | undefined, opts: PartOptions): this {
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(...pos),
      new THREE.Quaternion().setFromEuler(eulerOf(rot)),
      new THREE.Vector3(...(scale ?? [1, 1, 1])),
    );
    return this.addMatrix(g, m, opts);
  }

  private addMatrix(src: THREE.BufferGeometry, local: THREE.Matrix4, opts: PartOptions): this {
    const m = this.current.clone().multiply(local);
    let g = src.index ? src.toNonIndexed() : src;
    if (g !== src) src.dispose();
    g.applyMatrix4(m);
    // Отражение (отрицательный определитель) выворачивает треугольники — разворачиваем обход.
    if (m.determinant() < 0) flipWinding(g);
    for (const name of Object.keys(g.attributes)) {
      if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
    }
    if (!opts.smooth) g.computeVertexNormals();
    else if (!g.getAttribute('normal')) g.computeVertexNormals();
    this.paint(g, opts);
    if ((opts.uv ?? 'box') === 'box') this.projectUV(g, opts);
    else if (!g.getAttribute('uv')) this.projectUV(g, opts);
    const mat = opts.mat ?? 'flat';
    const cast = !opts.noShadow;
    const recv = !opts.noReceive;
    const key = `${mat}|${cast ? 1 : 0}${recv ? 1 : 0}`;
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = { mat, castShadow: cast, receiveShadow: recv, geos: [] };
      this.buckets.set(key, bucket);
    }
    bucket.geos.push(g);
    this.triangles += g.getAttribute('position').count / 3;
    return this;
  }

  private paint(g: THREE.BufferGeometry, opts: PartOptions): void {
    const n = g.getAttribute('position').count;
    const colors = new Float32Array(n * 3);
    const base = toColor(opts.color).clone();
    if (opts.jitter) {
      const k = 1 + (this.rng.next() - 0.5) * 2 * opts.jitter;
      base.multiplyScalar(k);
    }
    const fj = opts.faceJitter ?? 0;
    const ao = opts.ao ?? 0;
    const vg = opts.vgrad ?? 0;
    const nrm = g.getAttribute('normal') as THREE.BufferAttribute | undefined;
    const pos = g.getAttribute('position') as THREE.BufferAttribute;
    let minY = Infinity;
    let maxY = -Infinity;
    if (vg) {
      for (let i = 0; i < n; i++) {
        const y = pos.getY(i);
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    for (let t = 0; t < n; t += 3) {
      const k = fj ? 1 + (this.rng.next() - 0.5) * 2 * fj : 1;
      let kAo = 1;
      if (ao && nrm) {
        const ny = (nrm.getY(t) + nrm.getY(Math.min(n - 1, t + 1)) + nrm.getY(Math.min(n - 1, t + 2))) / 3;
        kAo = 1 - ao * (0.5 - 0.5 * ny);
      }
      for (let v = 0; v < 3 && t + v < n; v++) {
        const i = (t + v) * 3;
        let kv = 1;
        if (vg && maxY > minY) kv = 1 - vg * (1 - (pos.getY(t + v) - minY) / (maxY - minY));
        const kk = k * kAo * kv;
        colors[i] = base.r * kk;
        colors[i + 1] = base.g * kk;
        colors[i + 2] = base.b * kk;
      }
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  }

  private projectUV(g: THREE.BufferGeometry, opts: PartOptions): void {
    const pos = g.getAttribute('position') as THREE.BufferAttribute;
    const n = pos.count;
    const uv = new Float32Array(n * 2);
    const s = 1 / (opts.uvScale ?? 1);
    const ou = opts.uvOffset?.[0] ?? 0;
    const ov = opts.uvOffset?.[1] ?? 0;
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    const nrm = new THREE.Vector3();
    for (let t = 0; t + 2 < n; t += 3) {
      a.fromBufferAttribute(pos, t);
      b.fromBufferAttribute(pos, t + 1);
      c.fromBufferAttribute(pos, t + 2);
      nrm.subVectors(b, a).cross(c.clone().sub(a));
      const ax = Math.abs(nrm.x);
      const ay = Math.abs(nrm.y);
      const az = Math.abs(nrm.z);
      for (let v = 0; v < 3; v++) {
        const p = v === 0 ? a : v === 1 ? b : c;
        let u: number;
        let w: number;
        if (ax >= ay && ax >= az) {
          u = p.z;
          w = p.y;
        } else if (ay >= ax && ay >= az) {
          u = p.x;
          w = p.z;
        } else {
          u = p.x;
          w = p.y;
        }
        if (opts.uvSwap) [u, w] = [w, u];
        uv[(t + v) * 2] = u * s + ou;
        uv[(t + v) * 2 + 1] = w * s + ov;
      }
    }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  }

  /** Собрать модель: по одному мешу на материал + дочерние узлы + метки. */
  build(name = 'model'): THREE.Group {
    const root = new THREE.Group();
    root.name = name;
    for (const bucket of this.buckets.values()) {
      if (bucket.geos.length === 0) continue;
      const merged = bucket.geos.length === 1 ? bucket.geos[0]! : mergeGeometries(bucket.geos, false);
      if (!merged) continue;
      if (bucket.geos.length > 1) for (const g of bucket.geos) g.dispose();
      merged.computeBoundingSphere();
      merged.computeBoundingBox();
      const mesh = new THREE.Mesh(merged, placeholderMaterial(bucket.mat));
      mesh.name = `${name}:${bucket.mat}`;
      mesh.castShadow = bucket.castShadow;
      mesh.receiveShadow = bucket.receiveShadow;
      // Флаги теней сохраняются в GLB через extras.
      mesh.userData.cs = bucket.castShadow ? 1 : 0;
      mesh.userData.rs = bucket.receiveShadow ? 1 : 0;
      root.add(mesh);
    }
    for (const ch of this.children) {
      const obj = ch.builder.build(ch.name);
      obj.position.set(...ch.pos);
      obj.rotation.set(ch.rot[0], ch.rot[1], ch.rot[2]);
      if (ch.userData) Object.assign(obj.userData, ch.userData);
      root.add(obj);
    }
    for (const mk of this.markers) {
      const o = new THREE.Object3D();
      o.name = mk.name;
      o.position.set(...mk.pos);
      o.rotation.set(...mk.rot);
      o.userData.marker = true;
      root.add(o);
    }
    root.userData.triangles = this.totalTriangles();
    if (this.colliders.length) root.userData.colliders = this.colliders;
    return root;
  }

  totalTriangles(): number {
    let t = this.triangles;
    for (const ch of this.children) t += ch.builder.totalTriangles();
    return Math.round(t);
  }
}

function flipWinding(g: THREE.BufferGeometry): void {
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const attrs = Object.values(g.attributes) as THREE.BufferAttribute[];
  for (let t = 0; t + 2 < pos.count; t += 3) {
    for (const at of attrs) {
      const size = at.itemSize;
      for (let k = 0; k < size; k++) {
        const i1 = (t + 1) * size + k;
        const i2 = (t + 2) * size + k;
        const arr = at.array as Float32Array;
        const tmp = arr[i1]!;
        arr[i1] = arr[i2]!;
        arr[i2] = tmp;
      }
    }
  }
}

/** Габариты модели (для манифеста и проверки масштаба). */
export function measure(obj: THREE.Object3D): { w: number; h: number; d: number } {
  const box = new THREE.Box3().setFromObject(obj);
  const s = box.getSize(new THREE.Vector3());
  return { w: +s.x.toFixed(2), h: +s.y.toFixed(2), d: +s.z.toFixed(2) };
}

/** Единая геометрия модели (все меши слиты) — для InstancedMesh из моделей с одним материалом. */
export function singleGeometry(obj: THREE.Object3D): THREE.BufferGeometry | null {
  const geos: THREE.BufferGeometry[] = [];
  obj.updateMatrixWorld(true);
  obj.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) {
      const g = mesh.geometry.clone();
      g.applyMatrix4(mesh.matrixWorld);
      geos.push(g);
    }
  });
  if (geos.length === 0) return null;
  const merged = geos.length === 1 ? geos[0]! : mergeGeometries(geos, false);
  return merged;
}
