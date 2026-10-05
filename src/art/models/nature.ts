import * as THREE from 'three';
import { ModelBuilder, type PartOptions, type V3 } from '../ModelKit';
import { P } from '../palette';
import { defineAsset } from '../registry';

/** Растительность и камни. Кроны — искажённые икосаэдры с «запечённым» затенением (стиль MAP-03). */

const leaf = (color: number): PartOptions => ({ mat: 'foliage', color, faceJitter: 0.09, ao: 0.42 });
const bark: PartOptions = { mat: 'woodgrain', color: P.trunk, uvScale: 0.6, vgrad: 0.25 };

function trunk(b: ModelBuilder, h: number, r0: number, r1: number, lean: V3 = [0, 0, 0]): void {
  b.cyl(r1, r0, h, 7, [0, h / 2, 0], bark, lean);
  // Корневой раструб.
  b.cyl(r0 * 0.9, r0 * 1.5, 0.3, 7, [0, 0.15, 0], bark);
}

function branch(b: ModelBuilder, from: V3, to: V3, r: number): void {
  b.beam(from, to, r, 5, bark);
}

/** Круглая лиственная крона из нескольких «облачков», равномерно по сфере. */
function canopy(b: ModelBuilder, cy: number, radius: number, blobs: number, colors: number[], flat = 0.85): void {
  const rng = b.rng;
  b.ico(radius * 0.82, 1, [0, cy, 0], leaf(colors[0]!), [1, flat, 1], undefined, 0.14);
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < blobs; i++) {
    // Точки Фибоначчи на верхних 3/4 сферы.
    const yN = 0.85 - (i / Math.max(1, blobs - 1)) * 1.25;
    const rN = Math.sqrt(Math.max(0, 1 - yN * yN));
    const a = i * golden + rng.range(-0.25, 0.25);
    const rr = radius * 0.58;
    const s = radius * rng.range(0.44, 0.56);
    b.ico(s, 1, [Math.cos(a) * rN * rr, cy + yN * rr * flat, Math.sin(a) * rN * rr], leaf(colors[(i + 1) % colors.length]!), [1, flat, 1], undefined, 0.18);
  }
}

function roundTree(seed: number, h: number, crown: number, colors: number[]): () => ModelBuilder {
  return () => {
    const b = new ModelBuilder(seed);
    const th = h * 0.44;
    trunk(b, th + crown * 0.3, 0.2 + h * 0.022, 0.13);
    branch(b, [0, th * 0.75, 0], [0.75, th + 0.45, 0.25], 0.07);
    branch(b, [0, th * 0.85, 0], [-0.6, th + 0.55, -0.35], 0.065);
    canopy(b, th + crown * 0.62, crown, 7, colors);
    return b;
  };
}

defineAsset({ id: 'tree_round_a', name: 'Лиственное дерево A', category: 'nature', func: 'Деревья деревни (инстансинг)', ref: 'Map/MAP-03', collider: 'круг r=0.35', lod: 'чанки + туман', build: () => roundTree(301, 5.8, 2.3, [P.leaf, P.leafDark, P.leaf, P.leafLight, P.leaf])().build('tree_round_a') });
defineAsset({ id: 'tree_round_b', name: 'Лиственное дерево B', category: 'nature', func: 'Деревья деревни (инстансинг)', ref: 'Map/MAP-03', collider: 'круг r=0.35', lod: 'чанки + туман', build: () => roundTree(302, 7.0, 2.8, [P.leafDark, P.leaf, P.leafDark, 0x5f8f36, P.leaf])().build('tree_round_b') });
defineAsset({ id: 'tree_round_c', name: 'Лиственное дерево C (молодое)', category: 'nature', func: 'Деревья деревни (инстансинг)', ref: 'Map/MAP-03', collider: 'круг r=0.3', lod: 'чанки + туман', build: () => roundTree(303, 4.4, 1.75, [P.leafLight, P.leaf, P.leafYellow, P.leaf, P.leafLight])().build('tree_round_c') });

function pine(seed: number, h: number, w: number): ModelBuilder {
  const b = new ModelBuilder(seed);
  b.cyl(0.1, 0.22, h * 0.3, 6, [0, h * 0.15, 0], bark);
  const tiers = 4;
  for (let i = 0; i < tiers; i++) {
    const t = i / tiers;
    const r = w * (1 - t * 0.72);
    const ch = h * 0.34;
    const y = h * 0.22 + t * h * 0.62 + ch / 2;
    b.cone(r, ch, 8, [0, y, 0], { mat: 'foliage', color: i % 2 ? P.pine : P.pineDark, faceJitter: 0.08, ao: 0.35 }, [0, b.rng.range(0, 1), 0]);
  }
  return b;
}

defineAsset({ id: 'tree_pine_a', name: 'Ель', category: 'nature', func: 'Хвойный пояс вокруг деревни', ref: 'Shop/SHOP-00 (фон)', collider: 'круг r=0.3', build: () => pine(311, 8.5, 2.1).build('tree_pine_a') });
defineAsset({ id: 'tree_pine_b', name: 'Ель высокая', category: 'nature', func: 'Хвойный пояс вокруг деревни', ref: 'Shop/SHOP-00 (фон)', collider: 'круг r=0.3', build: () => pine(312, 11.5, 2.6).build('tree_pine_b') });

defineAsset({
  id: 'tree_fruit',
  name: 'Яблоня',
  category: 'nature',
  func: 'Сады у домов, огородник',
  ref: 'Map/MAP-03',
  collider: 'круг r=0.25',
  build: () => {
    const b = roundTree(321, 4.2, 1.7, [P.leaf, P.leafDark, P.leafLight])();
    const rng = b.rng;
    for (let i = 0; i < 16; i++) {
      const a = rng.range(0, Math.PI * 2);
      const r = rng.range(1.1, 1.65);
      b.sphere(0.075, 6, 5, [Math.cos(a) * r, 3.2 + rng.range(-0.6, 0.7), Math.sin(a) * r], { color: rng.chance(0.75) ? 0xd2402e : 0xe8c24a, noShadow: true });
    }
    return b.build('tree_fruit');
  },
});

defineAsset({
  id: 'tree_oak_big',
  name: 'Старый дуб (площадь)',
  category: 'nature',
  func: 'Ориентир в центре площади',
  ref: 'Map/MAP-01, MAP-03 (дуб на клумбе)',
  collider: 'круг r=0.9',
  build: () => {
    const b = new ModelBuilder(331);
    const th = 4.2;
    b.cyl(0.5, 0.85, th, 9, [0, th / 2, 0], { ...bark, color: 0x5e4330 });
    b.cyl(0.8, 1.3, 0.6, 9, [0, 0.3, 0], { ...bark, color: 0x5a402e });
    // Корни.
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3;
      b.beam([Math.cos(a) * 0.6, 0.35, Math.sin(a) * 0.6], [Math.cos(a) * 1.6, 0.02, Math.sin(a) * 1.6], 0.16, 5, { ...bark, color: 0x5a402e });
    }
    const limbs: [V3, V3, number][] = [
      [[0, 3.3, 0], [2.6, 6.2, 0.8], 0.28],
      [[0, 3.6, 0], [-2.4, 6.4, -0.6], 0.26],
      [[0, 3.9, 0], [0.4, 6.8, -2.4], 0.24],
      [[0, 3.8, 0], [-0.8, 6.6, 2.4], 0.24],
      [[0, 4.1, 0], [0.2, 7.4, 0.1], 0.3],
    ];
    for (const [a, c, r] of limbs) b.beam(a, c, r, 6, { ...bark, color: 0x5e4330 });
    const cols = [P.leafDark, P.leaf, 0x5f8f36, P.leaf, P.leafLight];
    const rng = b.rng;
    b.ico(3.6, 1, [0, 7.8, 0], leaf(P.leaf), [1.25, 0.72, 1.25], undefined, 0.15);
    for (let i = 0; i < 13; i++) {
      const a = (i / 13) * Math.PI * 2 + rng.range(-0.2, 0.2);
      const r = rng.range(2.8, 4.1);
      const s = rng.range(1.5, 2.1);
      b.ico(s, 1, [Math.cos(a) * r, 7.2 + rng.range(-1.1, 1.3), Math.sin(a) * r], leaf(cols[i % cols.length]!), [1, 0.82, 1], undefined, 0.2);
    }
    for (let i = 0; i < 5; i++) {
      const a = rng.range(0, Math.PI * 2);
      b.ico(rng.range(1.5, 2), 1, [Math.cos(a) * 1.6, 9.2 + rng.range(0, 0.6), Math.sin(a) * 1.6], leaf(P.leafLight), [1, 0.8, 1], undefined, 0.2);
    }
    return b.build('tree_oak_big');
  },
});

function bush(seed: number, size: number, colors: number[], flowers?: number): ModelBuilder {
  const b = new ModelBuilder(seed);
  const rng = b.rng;
  const n = 3 + Math.round(size * 2);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rng.range(-0.4, 0.4);
    const r = size * rng.range(0.15, 0.45);
    const s = size * rng.range(0.38, 0.55);
    b.ico(s, 1, [Math.cos(a) * r, s * 0.75, Math.sin(a) * r], leaf(colors[i % colors.length]!), [1, 0.8, 1], undefined, 0.2);
  }
  if (flowers !== undefined) {
    for (let i = 0; i < 12; i++) {
      const a = rng.range(0, Math.PI * 2);
      const r = size * rng.range(0.35, 0.62);
      b.ico(0.05, 0, [Math.cos(a) * r, size * rng.range(0.45, 0.95), Math.sin(a) * r], { mat: 'foliage', color: flowers, noShadow: true });
    }
  }
  return b;
}

defineAsset({ id: 'bush_a', name: 'Куст', category: 'nature', func: 'Живые изгороди, дворы', ref: 'Map/MAP-03', collider: 'нет', build: () => bush(341, 0.9, [P.leaf, P.leafDark]).build('bush_a') });
defineAsset({ id: 'bush_b', name: 'Куст крупный', category: 'nature', func: 'Живые изгороди, дворы', ref: 'Map/MAP-03', collider: 'нет', build: () => bush(342, 1.3, [P.leafDark, P.leaf, 0x5f8f36]).build('bush_b') });
defineAsset({ id: 'bush_flower', name: 'Цветущий куст', category: 'nature', func: 'Палисадники', ref: 'Map/MAP-03', collider: 'нет', build: () => bush(343, 0.85, [P.leaf, P.leafLight], 0xf0a0b8).build('bush_flower') });
defineAsset({ id: 'bush_flower_y', name: 'Цветущий куст (жёлтый)', category: 'nature', func: 'Палисадники', ref: 'Map/MAP-03', collider: 'нет', build: () => bush(344, 0.8, [P.leaf, P.leafDark], 0xf4d04a).build('bush_flower_y') });

/** Пучок из травинок — по одному треугольнику на травинку (двусторонний материал). */
function bladeTuft(seed: number, n: number, hMin: number, hMax: number, spread: number, colors: number[]): ModelBuilder {
  const b = new ModelBuilder(seed);
  const rng = b.rng;
  const pos: number[] = [];
  const col: number[] = [];
  const c = new THREE.Color();
  const cTop = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const a = rng.range(0, Math.PI * 2);
    const r = rng.range(0, spread);
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const h = rng.range(hMin, hMax);
    const yaw = rng.range(0, Math.PI);
    const w = 0.035;
    const lx = rng.range(-0.35, 0.35) * h;
    const lz = rng.range(-0.35, 0.35) * h;
    const dx = Math.cos(yaw) * w;
    const dz = Math.sin(yaw) * w;
    pos.push(x - dx, 0, z - dz, x + dx, 0, z + dz, x + lx, h, z + lz);
    c.set(colors[i % colors.length]!);
    cTop.copy(c).multiplyScalar(1.25);
    c.multiplyScalar(0.62);
    col.push(c.r, c.g, c.b, c.r, c.g, c.b, cTop.r, cTop.g, cTop.b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  // Нормали вверх — мягкое освещение травы без «чёрной» обратной стороны.
  const nrm = g.getAttribute('normal') as THREE.BufferAttribute;
  for (let i = 0; i < nrm.count; i++) nrm.setXYZ(i, 0, 1, 0);
  b.geom(g, [0, 0, 0], { mat: 'grassBlade', color: 0xffffff, noShadow: true, smooth: true });
  // Перекрашиваем вершинными цветами градиента (paint ставит белый).
  return Object.assign(b, { tuftColors: col });
}

defineAsset({
  id: 'grass_tuft',
  name: 'Пучок травы',
  category: 'nature',
  func: 'Трава (тысячи инстансов, без теней)',
  ref: 'Shop/SHOP-00',
  collider: 'нет',
  build: () => {
    const b = bladeTuft(351, 9, 0.2, 0.42, 0.1, [0x7ea94a, 0x93ba52, 0x6f9a40]);
    const obj = b.build('grass_tuft');
    applyTuftColors(obj, (b as unknown as { tuftColors: number[] }).tuftColors);
    return obj;
  },
});

defineAsset({
  id: 'grass_tall',
  name: 'Высокая сухая трава',
  category: 'nature',
  func: 'Запущенный вид у заброшенного магазина, обочины',
  ref: 'Shop/SHOP-01 (сухая трава у фасада)',
  collider: 'нет',
  build: () => {
    const b = bladeTuft(352, 14, 0.45, 0.9, 0.2, [P.grassDry, 0xa89a52, 0xc8b070]);
    const obj = b.build('grass_tall');
    applyTuftColors(obj, (b as unknown as { tuftColors: number[] }).tuftColors);
    return obj;
  },
});

function applyTuftColors(obj: THREE.Object3D, colors: number[]): void {
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const attr = m.geometry.getAttribute('color') as THREE.BufferAttribute;
    if (attr && attr.count * 3 === colors.length) {
      (attr.array as Float32Array).set(colors);
      attr.needsUpdate = true;
    }
  });
}

function flowerClump(seed: number, head: number, count: number, h: number): ModelBuilder {
  const b = new ModelBuilder(seed);
  const rng = b.rng;
  for (let i = 0; i < count; i++) {
    const a = rng.range(0, Math.PI * 2);
    const r = rng.range(0, 0.16);
    const hh = h * rng.range(0.75, 1.1);
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    b.cyl(0.008, 0.01, hh, 3, [x, hh / 2, z], { mat: 'foliage', color: P.leafDark, noShadow: true });
    b.ico(0.045, 0, [x, hh, z], { mat: 'foliage', color: head, noShadow: true, faceJitter: 0.1 }, [1, 0.7, 1]);
  }
  b.ico(0.12, 0, [0, 0.07, 0], { mat: 'foliage', color: P.leaf, noShadow: true, faceJitter: 0.1 }, [1.4, 0.6, 1.4], undefined, 0.2);
  return b;
}

const FLOWER_COLORS: [string, number][] = [
  ['red', 0xe0565b],
  ['yellow', 0xf2c94c],
  ['white', 0xf6f2ea],
  ['purple', 0xa070d8],
  ['pink', 0xf08ab0],
  ['orange', 0xf08a3b],
];
FLOWER_COLORS.forEach(([name, c], i) => {
  defineAsset({ id: `flowers_${name}`, name: `Цветы (${name})`, category: 'nature', func: 'Клумбы, палисадники', ref: 'Map/MAP-03', collider: 'нет', build: () => flowerClump(360 + i, c, 7, 0.32).build(`flowers_${name}`) });
});

defineAsset({
  id: 'sunflower',
  name: 'Подсолнух',
  category: 'nature',
  func: 'Огороды и дворы (как на MAP-03)',
  ref: 'Map/MAP-03',
  collider: 'нет',
  build: () => {
    const b = new ModelBuilder(371);
    b.cyl(0.018, 0.025, 1.5, 5, [0, 0.75, 0], { mat: 'foliage', color: P.leafDark });
    for (const [y, s] of [
      [0.5, 1],
      [0.9, -1],
    ] as const)
      b.ico(0.12, 0, [s * 0.1, y, 0], { mat: 'foliage', color: P.leaf }, [1.4, 0.3, 0.9]);
    b.at([0, 1.52, 0.02], [0.35, 0, 0], () => {
      b.cyl(0.16, 0.16, 0.04, 12, [0, 0, 0], { mat: 'foliage', color: 0xf2c230 }, [Math.PI / 2, 0, 0]);
      b.cyl(0.085, 0.085, 0.05, 10, [0, 0, 0.012], { mat: 'foliage', color: 0x5a3a1e }, [Math.PI / 2, 0, 0]);
    });
    return b.build('sunflower');
  },
});

function rock(seed: number, s: number, flat: number): ModelBuilder {
  const b = new ModelBuilder(seed);
  b.ico(s, 0, [0, s * flat * 0.55, 0], { color: P.stone, faceJitter: 0.1, ao: 0.35 }, [1, flat, 0.85], [0, b.rng.range(0, 3), 0], 0.25);
  return b;
}
defineAsset({ id: 'rock_a', name: 'Камень', category: 'nature', func: 'Обочины, луг', ref: 'Map/MAP-01 (камни на лугу)', collider: 'круг', build: () => rock(381, 0.45, 0.7).build('rock_a') });
defineAsset({ id: 'rock_b', name: 'Камень крупный', category: 'nature', func: 'Обочины, луг', ref: 'Map/MAP-01', collider: 'круг', build: () => rock(382, 0.8, 0.6).build('rock_b') });
defineAsset({ id: 'rock_c', name: 'Камушек', category: 'nature', func: 'Обочины, бордюры', ref: 'Map/MAP-01', collider: 'нет', build: () => rock(383, 0.22, 0.8).build('rock_c') });

/** Дальние деревья пояса леса: 30–40 треугольников, без деталей (их скрывает туман). */
defineAsset({
  id: 'tree_far_round',
  name: 'Дальнее лиственное дерево',
  category: 'nature',
  func: 'Лесной пояс вдали (дёшево)',
  ref: 'Shop/SHOP-00 (фон)',
  collider: 'нет (за границей зоны)',
  lod: 'дальний вариант',
  build: () => {
    const b = new ModelBuilder(391);
    b.cyl(0.14, 0.24, 2.6, 5, [0, 1.3, 0], { ...bark });
    b.ico(2.4, 0, [0, 4.2, 0], { mat: 'foliage', color: P.leaf, faceJitter: 0.12, ao: 0.4 }, [1, 0.95, 1], undefined, 0.15);
    return b.build('tree_far_round');
  },
});

defineAsset({
  id: 'tree_far_pine',
  name: 'Дальняя ель',
  category: 'nature',
  func: 'Лесной пояс вдали (дёшево)',
  ref: 'Shop/SHOP-00 (фон)',
  collider: 'нет',
  lod: 'дальний вариант',
  build: () => {
    const b = new ModelBuilder(392);
    b.cyl(0.1, 0.2, 1.6, 5, [0, 0.8, 0], { ...bark });
    b.cone(2.3, 4.6, 7, [0, 3.4, 0], { mat: 'foliage', color: P.pineDark, faceJitter: 0.08, ao: 0.35 });
    b.cone(1.6, 3.6, 7, [0, 6.0, 0], { mat: 'foliage', color: P.pine, faceJitter: 0.08, ao: 0.35 });
    return b.build('tree_far_pine');
  },
});
