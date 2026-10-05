import { ModelBuilder, type PartOptions } from '../ModelKit';
import { P } from '../palette';
import { defineAsset } from '../registry';
import { styledHouse, type StyledHouseSpec } from './houses';
import { wallAlongX, wallAlongZ, shade } from './buildingKit';
import { styledGableRoof, stonePlinth, chunkyWindowZ, wallLantern } from './styleKit';

/**
 * Пять поставщиков по референсу BLD-01 (Поставщики A) и MAP-01/03: дом + уличный прилавок.
 * Прилавок: пивот — центр основания, игрок подходит со стороны +Z, продавец стоит со стороны −Z.
 */

const wood: PartOptions = { mat: 'woodgrain', color: 0xa77a4d, jitter: 0.05 };
const woodLight: PartOptions = { mat: 'woodgrain', color: 0xc19468, jitter: 0.05 };

// ───────── Товары-декор ─────────

function loaf(b: ModelBuilder, x: number, y: number, z: number, rot = 0, s = 1): void {
  b.dome(0.11 * s, 8, 3, [x, y, z], { color: 0xd18c45, faceJitter: 0.05 }, [1.7, 0.8, 1], [0, rot, 0]);
  for (let i = -1; i <= 1; i++) b.box([0.02, 0.01, 0.1 * s], [x + i * 0.06 * s * Math.cos(rot), y + 0.08 * s, z - i * 0.06 * s * Math.sin(rot)], { color: 0xf0c890, noShadow: true }, [0, rot + 0.5, 0]);
}

function bun(b: ModelBuilder, x: number, y: number, z: number): void {
  b.dome(0.065, 7, 3, [x, y, z], { color: 0xe2a456, faceJitter: 0.05 }, [1, 0.85, 1]);
}

function bottle(b: ModelBuilder, x: number, y: number, z: number, color: number, cap: number, h = 0.3): void {
  b.lathe(
    [
      [0, 0],
      [0.045, 0],
      [0.045, h * 0.6],
      [0.02, h * 0.82],
      [0.016, h],
      [0, h],
    ],
    7,
    [x, y, z],
    { color, noShadow: true },
  );
  b.cyl(0.018, 0.018, 0.03, 6, [x, y + h + 0.015, z], { color: cap, noShadow: true });
}

function jar(b: ModelBuilder, x: number, y: number, z: number, color: number): void {
  b.cyl(0.05, 0.05, 0.12, 8, [x, y + 0.06, z], { color, noShadow: true });
  b.cyl(0.052, 0.052, 0.03, 8, [x, y + 0.135, z], { mat: 'metal', color: 0xc9a24a, noShadow: true });
}

function sack(b: ModelBuilder, x: number, y: number, z: number, rot = 0, color = 0xe6d6b4, label: number | null = 0x2f7f78): void {
  b.at([x, y, z], [0, rot, 0], () => {
    b.chamferBox([0.36, 0.5, 0.28], [0, 0.25, 0], 0.08, { mat: 'fabric', color, faceJitter: 0.03 });
    b.ico(0.11, 0, [0, 0.55, 0], { mat: 'fabric', color: shade(color, 0.92) }, [1.6, 0.6, 1]);
    if (label !== null) b.box([0.18, 0.1, 0.005], [0, 0.28, 0.142], { color: label, noShadow: true });
  });
}

type CrateKind = 'round' | 'carrot' | 'cabbage' | 'pepper';

function crateOf(b: ModelBuilder, x: number, y: number, z: number, fruit: number, rot = 0, kind: CrateKind = 'round', tilt = 0.18): void {
  b.at([x, y, z], [tilt, rot, 0], () => {
    b.box([0.52, 0.16, 0.38], [0, 0.08, 0], { mat: 'woodgrain', color: 0xb98d5c, jitter: 0.06 });
    b.box([0.46, 0.02, 0.32], [0, 0.155, 0], { color: shade(fruit, 0.6), noShadow: true });
    const rng = b.rng;
    for (let i = 0; i < 9; i++) {
      const px = -0.17 + (i % 3) * 0.17 + rng.range(-0.02, 0.02);
      const pz = -0.11 + Math.floor(i / 3) * 0.11 + rng.range(-0.02, 0.02);
      const c = shade(fruit, 1 + rng.range(-0.08, 0.08));
      if (kind === 'round') b.sphere(0.065, 7, 5, [px, 0.19, pz], { color: c, noShadow: true });
      else if (kind === 'carrot') b.cone(0.032, 0.22, 5, [px, 0.19, pz], { color: c, noShadow: true }, [Math.PI / 2, rng.range(-0.3, 0.3), 0]);
      else if (kind === 'pepper') b.ico(0.06, 0, [px, 0.19, pz], { color: c, noShadow: true }, [1, 1.3, 1]);
      else b.ico(0.08, 1, [px, 0.2, pz], { color: c, noShadow: true, faceJitter: 0.06 });
    }
  });
}

function chalkboard(b: ModelBuilder, x: number, z: number, rot: number, sign = 'chalk'): void {
  b.at([x, 0, z], [0, rot, 0], () => {
    for (const s of [-1, 1]) b.plankBetween([s * 0.26, 0, 0.12], [s * 0.26, 0.95, -0.06], 0.05, 0.04, wood);
    for (const s of [-1, 1]) b.plankBetween([s * 0.26, 0, -0.35], [s * 0.26, 0.95, -0.1], 0.05, 0.04, wood);
    b.box([0.56, 0.72, 0.03], [0, 0.58, 0.0], { mat: 'woodgrain', color: 0x8a6440 }, [-0.17, 0, 0]);
    b.plane(0.48, 0.62, [0, 0.58, 0.02], { mat: `sign:${sign}` }, [-0.17, 0, 0]);
  });
}

function flowerPot(b: ModelBuilder, x: number, z: number, col: number, s = 1): void {
  b.lathe(
    [
      [0, 0],
      [0.13 * s, 0],
      [0.17 * s, 0.24 * s],
      [0, 0.24 * s],
    ],
    8,
    [x, 0, z],
    { color: 0xb5643f, smooth: false },
  );
  b.ico(0.16 * s, 0, [x, 0.33 * s, z], { mat: 'foliageStatic', color: P.leaf, faceJitter: 0.1, ao: 0.3 });
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    b.ico(0.05 * s, 0, [x + Math.cos(a) * 0.1 * s, 0.42 * s, z + Math.sin(a) * 0.1 * s], { color: col, noShadow: true });
  }
}

/** Каркас уличного прилавка: стойки, балки, прилавок, задняя полка, тент с фестоном, вывеска. */
function marketStall(b: ModelBuilder, o: { width: number; awning: string; sign: string; post: number; shelf?: boolean }): { counterY: number; shelfY: number[] } {
  const W = o.width;
  const top = 0.92;
  const postO: PartOptions = { mat: 'woodgrain', color: o.post, jitter: 0.05 };
  b.chamferBox([W, 0.08, 0.75], [0, top, 0.15], 0.02, woodLight);
  b.box([W - 0.06, top - 0.08, 0.06], [0, (top - 0.08) / 2, 0.5], { mat: 'wood', color: 0x9a7048, uvScale: 0.5 });
  for (const x of [-W / 2 + 0.05, W / 2 - 0.05]) b.chamferBox([0.1, top, 0.72], [x, top / 2, 0.15], 0.02, wood);
  b.box([W - 0.12, 0.04, 0.66], [0, 0.32, 0.15], wood);
  const shelfY: number[] = [];
  if (o.shelf !== false) {
    for (const y of [1.25, 1.62]) {
      b.chamferBox([W - 0.2, 0.05, 0.3], [0, y, -0.55], 0.015, woodLight);
      shelfY.push(y);
    }
    for (const x of [-W / 2 + 0.12, W / 2 - 0.12]) b.box([0.06, 1.75, 0.06], [x, 0.875, -0.55], wood);
  }
  const ph = 2.4;
  for (const x of [-W / 2 - 0.08, W / 2 + 0.08]) {
    b.chamferBox([0.12, ph, 0.12], [x, ph / 2, 0.55], 0.02, postO);
    b.chamferBox([0.12, ph + 0.35, 0.12], [x, (ph + 0.35) / 2, -0.85], 0.02, postO);
    b.plankBetween([x, ph - 0.02, 0.55], [x, ph + 0.33, -0.85], 0.1, 0.1, postO);
  }
  b.box([W + 0.3, 0.1, 0.1], [0, ph - 0.02, 0.55], postO);
  b.box([W + 0.3, 0.1, 0.1], [0, ph + 0.33, -0.85], postO);
  const aw = W + 0.55;
  b.box([aw, 0.04, 1.75], [0, ph + 0.22, -0.15], { mat: `awning:${o.awning}` }, [0.24, 0, 0]);
  for (let i = 0; i < Math.round(aw / 0.32); i++) {
    const x = -aw / 2 + 0.16 + i * 0.32;
    b.extrude(
      [
        [-0.16, 0],
        [0.16, 0],
        [0.12, -0.12],
        [0, -0.17],
        [-0.12, -0.12],
      ],
      0.012,
      [x, ph + 0.02, 0.69],
      { mat: `awning:${o.awning}` },
    );
  }
  b.chamferBox([2.3, 0.5, 0.07], [0, ph + 0.8, -0.88], 0.02, { mat: 'woodgrain', color: 0x7e5a38 });
  b.plane(2.18, 0.42, [0, ph + 0.8, -0.84], { mat: `sign:${o.sign}` });
  b.marker('vendor', [0, 0, -0.35]);
  b.marker('customer', [0, 0, 1.25]);
  // Прилавок и стойки (продавец стоит внутри, игрок — снаружи).
  b.collider(0, 0.15, W / 2 + 0.15, 0.42);
  b.collider(-W / 2 - 0.08, -0.85, 0.12, 0.12);
  b.collider(W / 2 + 0.08, -0.85, 0.12, 0.12);
  return { counterY: top + 0.04, shelfY };
}

// ───────── Бакалея ─────────

defineAsset({
  id: 'stall_grocery',
  name: 'Прилавок бакалеи',
  category: 'supplier',
  func: 'Точка разговора и каталога: вода, мука, макароны, консервы',
  ref: 'BLD-01 «Уличный прилавок (бакалея)», Map/MAP-03',
  collider: 'бокс 2.8×1.6',
  build: () => {
    const b = new ModelBuilder(601);
    const { counterY, shelfY } = marketStall(b, { width: 2.5, awning: 'green', sign: 'grocery', post: 0x7a5434 });
    const bottleCols = [0x3f6b3a, 0x7a4a22, 0xb5d9e6, 0x3f6b3a, 0x8a5a2a];
    shelfY.forEach((y, si) => {
      for (let i = 0; i < 12; i++) {
        const x = -1.05 + i * 0.19;
        if (si === 0 && i % 4 === 3) jar(b, x, y + 0.025, -0.55, 0xd9822b);
        else bottle(b, x, y + 0.025, -0.55, bottleCols[(i + si) % bottleCols.length]!, 0xd5ac64, si === 0 ? 0.3 : 0.26);
      }
    });
    for (let i = 0; i < 6; i++) b.cyl(0.05, 0.05, 0.1, 9, [0.45 + (i % 3) * 0.12, counterY + 0.05 + Math.floor(i / 3) * 0.1, 0.05], { color: i % 2 ? 0xb84a3a : 0x2f7f78, noShadow: true });
    b.chamferBox([0.42, 0.24, 0.3], [-0.6, counterY + 0.12, 0.15], 0.03, woodLight);
    for (let i = 0; i < 4; i++) b.ico(0.07, 0, [-0.7 + (i % 2) * 0.16, counterY + 0.26, 0.08 + Math.floor(i / 2) * 0.14], { mat: 'fabric', color: 0xe6d6b4 });
    sack(b, -1.15, 0, 0.95, 0.2);
    sack(b, -0.75, 0, 1.0, -0.15);
    sack(b, 1.25, 0, 0.9, 0.3, 0xe9dcc0, null);
    b.box([0.55, 0.38, 0.4], [1.75, 0.19, 0.2], { mat: 'woodgrain', color: 0xb98d5c });
    for (let i = 0; i < 6; i++) bottle(b, 1.62 + (i % 3) * 0.13, 0.38, 0.1 + Math.floor(i / 3) * 0.16, 0xb5d9e6, 0x2f7f78, 0.24);
    return b.build('stall_grocery');
  },
});

defineAsset({
  id: 'bld_grocery',
  name: 'Дом бакалейщика (B-GROCERY)',
  category: 'supplier',
  func: 'Бакалея: фронтон из бирюзовых досок, торговая пристройка под зелёным тентом',
  ref: 'BLD-01 «B-GROCERY Бакалея» (план 9×7 м), Map/MAP-01',
  collider: 'бокс по габариту',
  build: () => {
    const spec: StyledHouseSpec = {
      seed: 611,
      w: 7.0,
      d: 8.6,
      base: 0.45,
      wallH: 2.6,
      floors: 1,
      wall: { mat: 'plaster', color: 0xf0e4c8, uvScale: 2 },
      frame: { color: 0xb48656, t: 0.18 },
      roof: { color: 0x3f4a5c, pitch: 44, ridge: 'z', overhang: 0.55 },
      gable: { mat: 'wood', color: 0x3b7f6c, uvScale: 1.0 },
      trim: 0x2f6b5c,
      shutters: 0x3b7f6c,
      flowers: true,
      door: { x: 1.1, color: 0x2f6b5c, lantern: true, glass: true },
      frontWindows: [-1.75],
      chimneys: [[-1.9, -2.4]],
      chimneyMat: 'plaster',
      chimneyColor: 0xe8dcc0,
      sideWindows: 2,
    };
    const b = styledHouse(spec);
    b.chamferBox([2.2, 0.5, 0.07], [0.2, 3.35, 4.62], 0.02, { mat: 'woodgrain', color: 0x2f6b5c });
    b.plane(2.08, 0.42, [0.2, 3.35, 4.66], { mat: 'sign:grocery' });
    // Торговая пристройка справа: открытые полки под зелёным тентом (как в BLD-01).
    const x0 = 3.6;
    const x1 = 6.6;
    const z0 = 0.4;
    const z1 = 4.2;
    b.collider((x0 + x1) / 2, (z0 + z1) / 2, (x1 - x0) / 2 + 0.1, (z1 - z0) / 2 + 0.1);
    b.box([x1 - x0, 0.2, z1 - z0], [(x0 + x1) / 2, 0.1, (z0 + z1) / 2], { mat: 'wood', color: 0xa98663, uvScale: 0.7 });
    for (const z of [z1 - 0.1, z0 + 0.1]) b.chamferBox([0.14, 2.5, 0.14], [x1 - 0.1, 1.25, z], 0.02, { mat: 'woodgrain', color: 0x8a6440 });
    b.box([0.12, 0.12, z1 - z0], [x1 - 0.1, 2.48, (z0 + z1) / 2], { mat: 'woodgrain', color: 0x8a6440 });
    const sl = Math.atan2(0.75, x1 + 0.4 - x0);
    b.box([(x1 + 0.4 - x0) / Math.cos(sl), 0.05, z1 - z0 + 0.5], [(x0 + x1 + 0.4) / 2, 2.95, (z0 + z1) / 2], { mat: 'awning:green' }, [0, 0, -sl]);
    for (let i = 0; i < 12; i++) {
      const z = z0 - 0.2 + i * 0.36;
      b.extrude(
        [
          [-0.18, 0],
          [0.18, 0],
          [0.13, -0.13],
          [0, -0.18],
          [-0.13, -0.13],
        ],
        0.012,
        [x1 + 0.42, 2.58, z],
        { mat: 'awning:green' },
        [0, Math.PI / 2, 0],
      );
    }
    for (const y of [0.7, 1.15, 1.6]) {
      b.chamferBox([0.45, 0.05, z1 - z0 - 0.4], [x0 + 0.35, y, (z0 + z1) / 2], 0.015, woodLight);
      for (let i = 0; i < 9; i++) bottle(b, x0 + 0.33, y + 0.025, z0 + 0.45 + i * 0.36, [0x3f6b3a, 0x7a4a22, 0xb5d9e6][i % 3]!, 0xd5ac64, 0.26);
    }
    for (let i = 0; i < 4; i++) sack(b, x0 + 1.4 + (i % 2) * 0.4, 0.2, z0 + 0.8 + Math.floor(i / 2) * 1.6, i * 0.5);
    b.cyl(0.32, 0.32, 0.8, 10, [x1 - 0.6, 0.6, z1 - 0.7], { mat: 'wood', color: 0x9a6a40, uvScale: 0.4 });
    flowerPot(b, -2.9, 5.0, 0xf2c94c);
    flowerPot(b, 2.3, 5.0, 0xe0565b, 0.9);
    chalkboard(b, -0.7, 5.3, 0.2);
    return b.build('bld_grocery');
  },
});

// ───────── Пекарня ─────────

defineAsset({
  id: 'stall_bakery',
  name: 'Прилавок пекарни',
  category: 'supplier',
  func: 'Точка разговора и каталога: хлеб, булочки',
  ref: 'BLD-01 «Уличный прилавок (хлеб)», Map/MAP-03',
  collider: 'бокс 2.8×1.6',
  build: () => {
    const b = new ModelBuilder(621);
    const { counterY, shelfY } = marketStall(b, { width: 2.5, awning: 'yellow', sign: 'bakery', post: 0x8a5a36 });
    b.chamferBox([2.2, 0.18, 0.3], [0, counterY + 0.09, -0.02], 0.02, woodLight);
    for (let i = 0; i < 8; i++) loaf(b, -0.95 + i * 0.27, counterY + 0.2, -0.02, Math.PI / 2, 0.85);
    for (let i = 0; i < 7; i++) bun(b, -0.9 + i * 0.3, counterY + 0.04, 0.32);
    shelfY.forEach((y, si) => {
      for (let i = 0; i < 6; i++) {
        if (si === 0) loaf(b, -0.9 + i * 0.36, y + 0.03, -0.55, 0, 0.9);
        else {
          b.lathe(
            [
              [0, 0],
              [0.12, 0],
              [0.15, 0.12],
              [0, 0.12],
            ],
            8,
            [-0.9 + i * 0.36, y + 0.025, -0.55],
            { mat: 'woodgrain', color: 0xb98a52 },
          );
          b.cyl(0.035, 0.035, 0.36, 6, [-0.9 + i * 0.36, y + 0.2, -0.55], { color: 0xd8984f }, [0.3, 0, 0.2]);
        }
      }
    });
    sack(b, 1.25, 0, 0.95, -0.3, 0xe9dcc0, 0xd5ac64);
    chalkboard(b, -1.65, 1.05, 0.25);
    flowerPot(b, 1.75, 0.85, 0xf2c94c, 1.1);
    return b.build('stall_bakery');
  },
});

defineAsset({
  id: 'bld_bakery',
  name: 'Пекарня (B-BAKERY)',
  category: 'supplier',
  func: 'Фахверк, красная черепица, две трубы, полосатый тент',
  ref: 'BLD-01 «B-BAKERY Пекарня» (план 9×8 м), Map/MAP-01',
  collider: 'бокс по габариту',
  build: () => {
    const spec: StyledHouseSpec = {
      seed: 622,
      w: 8.6,
      d: 7.2,
      base: 0.4,
      wallH: 4.6,
      floors: 2,
      wall: { mat: 'plaster', color: 0xf3e3c0, uvScale: 2 },
      frame: { color: 0xb88a58, braces: true, t: 0.17 },
      roof: { color: 0xc4573a, pitch: 42, ridge: 'x' },
      gable: { mat: 'plaster', color: 0xf3e3c0, uvScale: 2 },
      trim: 0x8a5a36,
      shutters: null,
      flowers: true,
      door: { x: -1.6, color: 0x8a5a36, lantern: true, glass: true },
      frontWindows: [-3.3, 0.6, 2.9],
      chimneys: [
        [-2.9, -1.0],
        [2.7, 0.9],
      ],
      chimneyMat: 'plaster',
      chimneyColor: 0xece0c8,
    };
    const b = styledHouse(spec);
    const aw: PartOptions = { mat: 'awning:yellow' };
    b.box([3.6, 0.05, 1.6], [1.75, 3.05, 4.35], aw, [0.42, 0, 0]);
    for (let i = 0; i < 11; i++) {
      b.extrude(
        [
          [-0.17, 0],
          [0.17, 0],
          [0.12, -0.12],
          [0, -0.17],
          [-0.12, -0.12],
        ],
        0.012,
        [0.05 + i * 0.34, 2.72, 5.08],
        aw,
      );
    }
    for (const x of [0.1, 3.4]) b.plankBetween([x, 2.4, 3.75], [x, 2.75, 4.95], 0.06, 0.06, { mat: 'metal', color: P.iron });
    b.collider(1.75, 4.25, 1.55, 0.35);
    b.collider(0, -4.4, 1.6, 0.5);
    b.chamferBox([3.0, 0.8, 0.55], [1.75, 0.4, 4.25], 0.03, woodLight);
    for (let i = 0; i < 8; i++) loaf(b, 0.5 + i * 0.36, 0.84, 4.15, Math.PI / 2, 0.85);
    b.chamferBox([2.4, 0.5, 0.07], [0.0, 3.85, 3.7], 0.02, { mat: 'woodgrain', color: 0x8a5a36 });
    b.plane(2.28, 0.42, [0.0, 3.85, 3.74], { mat: 'sign:bakery' });
    // Поленница под навесом сзади (вид сзади в BLD-01).
    b.box([3.0, 0.08, 1.0], [0, 2.4, -4.2], { mat: 'roofRow', color: 0xb5553a, uvScale: 1.3 }, [-0.3, 0, 0]);
    for (const x of [-1.4, 1.4]) b.box([0.1, 2.3, 0.1], [x, 1.15, -4.6], wood);
    for (let r = 0; r < 4; r++) for (let i = 0; i < 14; i++) b.cyl(0.09, 0.09, 0.55, 6, [-1.25 + i * 0.19 + (r % 2) * 0.09, 0.1 + r * 0.17, -4.25], { mat: 'woodgrain', color: i % 2 ? 0x9c7046 : 0xb08356 }, [Math.PI / 2, 0, 0]);
    flowerPot(b, -3.6, 4.4, 0xe0565b);
    b.cyl(0.3, 0.3, 0.75, 10, [3.9, 0.38, 3.9], { mat: 'wood', color: 0x9a6a40, uvScale: 0.4 });
    b.marker('smoke', [-2.9, 9.3, -1.0]);
    return b.build('bld_bakery');
  },
});

// ───────── Овощи ─────────

defineAsset({
  id: 'stall_produce',
  name: 'Прилавок огородника',
  category: 'supplier',
  func: 'Точка разговора и каталога: яблоки, помидоры, морковь',
  ref: 'BLD-01 «Уличный прилавок (овощи)», Map/MAP-03',
  collider: 'бокс 2.8×1.6',
  build: () => {
    const b = new ModelBuilder(631);
    const { counterY, shelfY } = marketStall(b, { width: 2.6, awning: 'green', sign: 'produce', post: 0x4e7a3a });
    const kinds: [number, CrateKind][] = [
      [0xd2402e, 'round'],
      [0x9cc46a, 'cabbage'],
      [0xe2492f, 'round'],
      [0xf08a2b, 'carrot'],
    ];
    kinds.forEach(([c, k], i) => crateOf(b, -0.96 + i * 0.64, counterY, 0.08, c, 0, k, 0.25));
    shelfY.forEach((y, si) => {
      const row: [number, CrateKind][] = si === 0 ? [[0xf2c230, 'pepper'], [0x6a9a3a, 'pepper'], [0xd2402e, 'round']] : [[0xe8a03a, 'round'], [0x9cc46a, 'cabbage'], [0xb04a8a, 'round']];
      row.forEach(([c, k], i) => crateOf(b, -0.75 + i * 0.75, y + 0.025, -0.55, c, 0, k, 0.2));
    });
    crateOf(b, -1.55, 0, 0.95, 0x9cc46a, 0.4, 'cabbage', 0);
    crateOf(b, 1.6, 0, 0.9, 0xd2402e, -0.3, 'round', 0);
    b.ico(0.22, 1, [1.15, 0.2, 1.15], { color: 0xe8862a, faceJitter: 0.05 }, [1.1, 0.8, 1.1]);
    chalkboard(b, -2.15, 0.6, 0.35);
    return b.build('stall_produce');
  },
});

defineAsset({
  id: 'bld_produce',
  name: 'Дом огородника (B-PRODUCE)',
  category: 'supplier',
  func: 'Зелёная крыша, мансардное окно, поперечный фронтон',
  ref: 'BLD-01 «B-PRODUCE Овощи» (план 9×7 м), Map/MAP-01',
  collider: 'бокс по габариту',
  build: () => {
    const spec: StyledHouseSpec = {
      seed: 632,
      w: 8.8,
      d: 6.6,
      base: 0.5,
      wallH: 2.7,
      floors: 1,
      wall: { mat: 'plaster', color: 0xf1e6cc, uvScale: 2 },
      frame: { color: 0x4a6a52, t: 0.15 },
      roof: { color: 0x355e4c, pitch: 47, ridge: 'x' },
      gable: { mat: 'wood', color: 0x4f7d62, uvScale: 1 },
      trim: P.green,
      shutters: 0x3f6b4f,
      flowers: true,
      door: { x: -0.2, color: 0x7a5434, lantern: true, glass: true },
      frontWindows: [-2.8],
      dormers: [-2.6],
      crossGable: { x: 2.6, w: 3.0, proj: 1.3, gable: { mat: 'wood', color: 0x4f7d62, uvScale: 1 } },
      chimneys: [[-0.9, -1.5]],
      chimneyMat: 'plaster',
      chimneyColor: 0xece0c8,
    };
    const b = styledHouse(spec);
    b.chamferBox([2.2, 0.5, 0.07], [-0.2, 3.3, 3.62], 0.02, { mat: 'woodgrain', color: P.green });
    b.plane(2.08, 0.42, [-0.2, 3.3, 3.66], { mat: 'sign:produce' });
    for (const x of [-3.7, 4.3]) {
      b.chamferBox([1.3, 0.4, 0.6], [x, 0.2, 4.4], 0.03, { mat: 'woodgrain', color: 0x8a6440 });
      for (let i = 0; i < 5; i++) b.ico(0.13, 0, [x - 0.5 + i * 0.25, 0.48, 4.4], { mat: 'foliageStatic', color: i % 2 ? P.leaf : P.leafDark, faceJitter: 0.1 });
      for (let i = 0; i < 5; i++) b.ico(0.05, 0, [x - 0.5 + i * 0.25, 0.6, 4.35], { color: [0xe0565b, 0xf2c94c, 0xf6f2ea][i % 3]!, noShadow: true });
    }
    b.box([0.12, 2.4, 0.12], [1.9, 1.2, 5.0], { mat: 'metal', color: P.iron });
    wallLantern(b, 1.9, 2.25, 5.0, 1);
    return b.build('bld_produce');
  },
});

defineAsset({
  id: 'greenhouse',
  name: 'Теплица (модуль)',
  category: 'supplier',
  func: 'Декор огородника',
  ref: 'BLD-01 «Теплица (модуль)», Map/MAP-01',
  collider: 'бокс 3.8×5.4',
  build: () => {
    const b = new ModelBuilder(633);
    const w = 3.4;
    const d = 5.0;
    const h = 1.9;
    b.collider(0, 0, w / 2 + 0.1, d / 2 + 0.1);
    const fr: PartOptions = { mat: 'woodgrain', color: 0xf0ece0 };
    stonePlinth(b, w, d, 0.35, 0, 0, 0xb8b0a2);
    for (let i = 0; i <= 5; i++) {
      const z = -d / 2 + (d * i) / 5;
      b.box([0.06, h, 0.06], [-w / 2, 0.35 + h / 2, z], fr);
      b.box([0.06, h, 0.06], [w / 2, 0.35 + h / 2, z], fr);
      b.plankBetween([-w / 2, 0.35 + h, z], [0, 0.35 + h + 1.3, z], 0.06, 0.06, fr);
      b.plankBetween([w / 2, 0.35 + h, z], [0, 0.35 + h + 1.3, z], 0.06, 0.06, fr);
    }
    for (const y of [0.35 + h * 0.5, 0.35 + h]) {
      b.box([0.05, 0.05, d], [-w / 2, y, 0], fr);
      b.box([0.05, 0.05, d], [w / 2, y, 0], fr);
    }
    b.box([0.08, 0.08, d], [0, 0.35 + h + 1.3, 0], fr);
    b.box([w, h, 0.02], [0, 0.35 + h / 2, d / 2], { mat: 'glassFrost' });
    b.box([w, h, 0.02], [0, 0.35 + h / 2, -d / 2], { mat: 'glassFrost' });
    b.box([0.02, h, d], [-w / 2, 0.35 + h / 2, 0], { mat: 'glassFrost' });
    b.box([0.02, h, d], [w / 2, 0.35 + h / 2, 0], { mat: 'glassFrost' });
    const sl = Math.atan2(1.3, w / 2);
    for (const s of [-1, 1]) b.box([Math.hypot(w / 2, 1.3), 0.02, d], [(s * w) / 4, 0.35 + h + 0.65, 0], { mat: 'glassFrost' }, [0, 0, s * sl]);
    b.prism(w, 1.3, 0.02, [0, 0.35 + h, d / 2], { mat: 'glassFrost' });
    b.prism(w, 1.3, 0.02, [0, 0.35 + h, -d / 2], { mat: 'glassFrost' });
    for (let i = 0; i < 8; i++) {
      b.ico(0.3, 0, [(i % 2 ? 1 : -1) * 0.95, 0.65, -1.8 + Math.floor(i / 2) * 1.2], { mat: 'foliageStatic', color: i % 3 ? P.leaf : 0x9cc46a, faceJitter: 0.1 }, [1, 1.25, 1]);
      b.sphere(0.06, 6, 4, [(i % 2 ? 1 : -1) * 0.95 + 0.12, 0.8, -1.7 + Math.floor(i / 2) * 1.2], { color: 0xd9412f, noShadow: true });
    }
    b.cyl(0.12, 0.14, 0.26, 8, [0.9, 0.13, d / 2 + 0.5], { mat: 'metal', color: 0x6a8a8a });
    b.box([0.5, 0.3, 0.4], [-0.8, 0.15, d / 2 + 0.5], { mat: 'woodgrain', color: 0xb98d5c });
    return b.build('greenhouse');
  },
});

// ───────── Молочная ферма ─────────

defineAsset({
  id: 'stall_dairy',
  name: 'Прилавок молочной фермы',
  category: 'supplier',
  func: 'Точка разговора и каталога: молоко, сыр, йогурт, масло, сгущёнка',
  ref: 'Map/MAP-03 (бидоны у фермы); стиль BLD-01',
  collider: 'бокс 2.8×1.6',
  build: () => {
    const b = new ModelBuilder(641);
    const { counterY, shelfY } = marketStall(b, { width: 2.5, awning: 'teal', sign: 'dairy', post: 0x4a6a8a });
    for (let i = 0; i < 8; i++) bottle(b, -1.0 + (i % 4) * 0.14, counterY, -0.05 + Math.floor(i / 4) * 0.16, 0xf6f4ee, 0x3d6b8a, 0.28);
    b.cyl(0.19, 0.19, 0.13, 12, [0.1, counterY + 0.065, 0.05], { color: 0xf0c64a });
    b.cyl(0.19, 0.19, 0.13, 12, [0.1, counterY + 0.2, 0.05], { color: 0xf3cf5c });
    b.cyl(0.15, 0.15, 0.11, 12, [0.55, counterY + 0.055, 0.2], { color: 0xe8b63a });
    b.chamferBox([0.3, 0.12, 0.18], [0.95, counterY + 0.06, 0.1], 0.03, { color: 0xf4e7a8 });
    shelfY.forEach((y, si) => {
      for (let i = 0; i < 9; i++) {
        if (si === 0) b.cyl(0.055, 0.045, 0.1, 8, [-1.0 + i * 0.25, y + 0.075, -0.55], { color: 0xf6f2ea, noShadow: true });
        else bottle(b, -1.0 + i * 0.25, y + 0.025, -0.55, 0xf6f4ee, 0x3d6b8a, 0.26);
      }
    });
    for (const [x, z] of [
      [-1.6, 0.9],
      [1.65, 0.85],
      [1.95, 0.4],
    ] as const) {
      b.lathe(
        [
          [0, 0],
          [0.17, 0],
          [0.18, 0.42],
          [0.12, 0.52],
          [0.09, 0.66],
          [0, 0.68],
        ],
        12,
        [x, 0, z],
        { mat: 'chrome', color: P.steel },
      );
    }
    return b.build('stall_dairy');
  },
});

defineAsset({
  id: 'bld_dairy',
  name: 'Дом молочницы',
  category: 'supplier',
  func: 'Светлый дом с зелёной крышей при хлеве',
  ref: 'Map/MAP-01 «Молочная ферма», Map/MAP-03; стиль BLD-01',
  collider: 'бокс по габариту',
  build: () => {
    const spec: StyledHouseSpec = {
      seed: 642,
      w: 9.0,
      d: 7.0,
      base: 0.45,
      wallH: 2.8,
      floors: 1,
      wall: { mat: 'plaster', color: 0xf4f0e6, uvScale: 2 },
      frame: null,
      roof: { color: 0x3e6b57, pitch: 45, ridge: 'x' },
      gable: { mat: 'wood', color: 0xd9cdb5, uvScale: 1 },
      trim: P.green,
      shutters: 0x4a7a65,
      flowers: true,
      door: { x: 0.6, color: P.green, canopy: true, lantern: true },
      frontWindows: [-2.9, -1.0, 3.1],
      dormers: [-2.0, 2.2],
      chimneys: [[2.8, -1.4]],
      chimneyMat: 'stone',
    };
    const b = styledHouse(spec);
    b.chamferBox([2.2, 0.5, 0.07], [0.6, 3.45, 3.62], 0.02, { mat: 'woodgrain', color: P.green });
    b.plane(2.08, 0.42, [0.6, 3.45, 3.66], { mat: 'sign:dairy' });
    return b.build('bld_dairy');
  },
});

defineAsset({
  id: 'barn',
  name: 'Хлев',
  category: 'supplier',
  func: 'Декор молочной фермы',
  ref: 'Map/MAP-03 (хлев с коровами)',
  collider: 'бокс 6×7',
  build: () => {
    const b = new ModelBuilder(643);
    const w = 6;
    const d = 7;
    const h = 3.0;
    b.collider(0, 0, w / 2 + 0.1, d / 2 + 0.1);
    const ext: PartOptions = { mat: 'wood', color: 0x9a5a3c, uvScale: 1.1 };
    stonePlinth(b, w, d, 0.3);
    wallAlongX(b, d / 2, -w / 2 - 0.1, w / 2 + 0.1, 0.3, h, 0.2, 1, [{ a: -1.2, b: 1.2, y0: 0, y1: 2.6 }], { ext });
    wallAlongX(b, -d / 2, -w / 2 - 0.1, w / 2 + 0.1, 0.3, h, 0.2, -1, [], { ext });
    wallAlongZ(b, -w / 2, -d / 2 + 0.1, d / 2 - 0.1, 0.3, h, 0.2, -1, [{ a: -0.6, b: 0.6, y0: 1.2, y1: 2.0 }], { ext });
    wallAlongZ(b, w / 2, -d / 2 + 0.1, d / 2 - 0.1, 0.3, h, 0.2, 1, [{ a: -0.6, b: 0.6, y0: 1.2, y1: 2.0 }], { ext });
    chunkyWindowZ(b, 0, -w / 2, 0.2, -1, 1.2, 1.5, 2.3, { frame: 0xf0ece0, bars: [1, 1] });
    chunkyWindowZ(b, 0, w / 2, 0.2, 1, 1.2, 1.5, 2.3, { frame: 0xf0ece0, bars: [1, 1] });
    for (const s of [-1, 1]) {
      b.at([s * 1.2, 0.3, d / 2 + 0.05], [0, s * 1.9, 0], () => {
        b.box([1.2, 2.55, 0.08], [-s * 0.6, 1.28, 0], { mat: 'wood', color: 0x9a5a3c });
        b.plankBetween([-s * 0.08, 0.12, 0.05], [-s * 1.12, 2.43, 0.05], 0.12, 0.05, { mat: 'woodgrain', color: 0xf0ece0 }, [0, 0, 1]);
        b.plankBetween([-s * 1.12, 0.12, 0.05], [-s * 0.08, 2.43, 0.05], 0.12, 0.05, { mat: 'woodgrain', color: 0xf0ece0 }, [0, 0, 1]);
        b.box([1.2, 0.12, 0.1], [-s * 0.6, 0.12, 0.03], { mat: 'woodgrain', color: 0xf0ece0 });
        b.box([1.2, 0.12, 0.1], [-s * 0.6, 2.43, 0.03], { mat: 'woodgrain', color: 0xf0ece0 });
      });
    }
    styledGableRoof(b, { span: w, length: d, eaveY: 0.3 + h, pitchDeg: 42, overhangSide: 0.45, overhangEnd: 0.4, color: 0x4c5466, trim: 0xf0ece0, ridgeAlong: 'z', gable: { mat: 'wood', color: 0x9a5a3c, uvScale: 1.1 } });
    b.chamferBox([1.0, 0.5, 0.06], [0, 4.25, d / 2 + 0.12], 0.04, { mat: 'woodgrain', color: 0xf0ece0 });
    b.chamferBox([1.2, 0.8, 1.6], [-1.6, 0.7, -2.2], 0.15, { color: 0xd8c070, faceJitter: 0.06 });
    b.chamferBox([1.2, 0.8, 1.6], [-1.6, 1.5, -2.2], 0.15, { color: 0xe0c878, faceJitter: 0.06 });
    return b.build('barn');
  },
});

defineAsset({
  id: 'cow',
  name: 'Корова',
  category: 'supplier',
  func: 'Декор фермы (лёгкая анимация головы)',
  ref: 'Map/MAP-03 (чёрно-белые коровы)',
  collider: 'загон',
  anims: 'узел head — покачивание',
  build: () => {
    const b = new ModelBuilder(644);
    const white: PartOptions = { color: 0xf3f0ea, faceJitter: 0.04 };
    const black: PartOptions = { color: 0x2a2a2a, faceJitter: 0.04 };
    b.chamferBox([0.72, 0.78, 1.5], [0, 1.05, 0], 0.2, white);
    b.chamferBox([0.74, 0.52, 0.52], [0.01, 1.12, 0.25], 0.13, black);
    b.chamferBox([0.6, 0.42, 0.4], [-0.06, 1.25, -0.4], 0.1, black);
    for (const [x, z] of [
      [-0.24, 0.55],
      [0.24, 0.55],
      [-0.24, -0.55],
      [0.24, -0.55],
    ] as const) {
      b.chamferBox([0.17, 0.7, 0.17], [x, 0.35, z], 0.03, white);
      b.box([0.18, 0.12, 0.18], [x, 0.06, z], black);
    }
    b.cyl(0.03, 0.02, 0.6, 4, [0, 1.05, -0.8], white, [0.6, 0, 0]);
    b.sphere(0.12, 6, 4, [0, 0.62, 0.1], { color: 0xf0b0b0 });
    b.node('head', [0, 1.35, 0.78], undefined, (h) => {
      h.chamferBox([0.42, 0.44, 0.5], [0, 0, 0.18], 0.1, white);
      h.chamferBox([0.36, 0.24, 0.2], [0, -0.1, 0.48], 0.06, { color: 0xf0b8b0 });
      h.box([0.44, 0.18, 0.2], [0, 0.1, 0.06], black);
      for (const s of [-1, 1]) {
        h.box([0.18, 0.06, 0.1], [s * 0.3, 0.12, 0.08], white);
        h.cone(0.04, 0.16, 5, [s * 0.14, 0.28, 0.04], { color: 0xe8e0c8 }, [0, 0, -s * 0.5]);
        h.sphere(0.035, 6, 4, [s * 0.15, 0.04, 0.4], { color: 0x111111 });
      }
    });
    return b.build('cow');
  },
});

// ───────── Мясная лавка ─────────

defineAsset({
  id: 'stall_butcher',
  name: 'Витрина мясной лавки',
  category: 'supplier',
  func: 'Точка разговора и каталога: колбаса, курица, стейки',
  ref: 'Map/MAP-01 «Мясная лавка» (витрина под бордовым тентом); стиль BLD-01',
  collider: 'бокс 2.8×1.6',
  build: () => {
    const b = new ModelBuilder(651);
    const { counterY } = marketStall(b, { width: 2.5, awning: 'burgundy', sign: 'butcher', post: P.burgundyDark, shelf: false });
    b.box([2.3, 0.04, 0.62], [0, counterY + 0.02, 0.12], { mat: 'metal', color: 0xd8dde0 });
    b.box([2.3, 0.42, 0.02], [0, counterY + 0.22, 0.42], { mat: 'glass' }, [-0.35, 0, 0]);
    b.box([2.3, 0.02, 0.4], [0, counterY + 0.43, 0.05], { mat: 'glass' });
    for (const x of [-1.14, 1.14]) b.box([0.03, 0.44, 0.62], [x, counterY + 0.22, 0.12], { mat: 'metal', color: 0xd8dde0 });
    for (let i = 0; i < 5; i++) b.chamferBox([0.32, 0.06, 0.2], [-0.8 + i * 0.4, counterY + 0.07, 0.12], 0.02, { color: i % 2 ? 0xb8443a : 0xc9564a, noShadow: true });
    for (let i = 0; i < 4; i++) b.cyl(0.035, 0.035, 0.3, 8, [-0.6 + i * 0.4, counterY + 0.08, 0.3], { color: 0x9a4a3a, noShadow: true }, [0, 0, Math.PI / 2]);
    for (let i = 0; i < 6; i++) {
      b.box([0.01, 0.2, 0.01], [-0.9 + i * 0.36, 2.15, -0.55], { color: P.iron, noShadow: true });
      b.cyl(0.04, 0.04, 0.32, 6, [-0.9 + i * 0.36, 1.88, -0.55], { color: i % 2 ? 0x8a3a2a : 0xa04a36, noShadow: true });
    }
    b.box([2.4, 0.05, 0.05], [0, 2.25, -0.55], { mat: 'metal', color: P.iron });
    return b.build('stall_butcher');
  },
});

defineAsset({
  id: 'bld_butcher',
  name: 'Мясная лавка',
  category: 'supplier',
  func: 'Кирпичный низ, красная крыша, бордовые тенты',
  ref: 'Map/MAP-01 «Мясная лавка», Map/MAP-03; стиль BLD-01',
  collider: 'бокс по габариту',
  build: () => {
    const spec: StyledHouseSpec = {
      seed: 652,
      w: 8.6,
      d: 7.0,
      base: 0.5,
      wallH: 4.8,
      floors: 2,
      wall: { mat: 'plaster', color: 0xf1e3ca, uvScale: 2 },
      frame: { color: 0x6a3a30, t: 0.15 },
      roof: { color: 0xa9483a, pitch: 42, ridge: 'x' },
      gable: { mat: 'plaster', color: 0xf1e3ca, uvScale: 2 },
      trim: P.burgundyDark,
      shutters: null,
      flowers: false,
      door: { x: 0, color: P.burgundy, lantern: true, glass: true },
      frontWindows: [-2.6, 2.6],
      chimneys: [[2.6, -1.2]],
      chimneyMat: 'brick',
      chimneyColor: P.brick,
    };
    const b = styledHouse(spec);
    for (const [sx, sz, w, d] of [
      [0, 3.66, 8.9, 0.06],
      [0, -3.66, 8.9, 0.06],
      [-4.46, 0, 0.06, 7.3],
      [4.46, 0, 0.06, 7.3],
    ] as const) {
      b.box([w, 0.9, d], [sx, 0.95, sz], { mat: 'brick', color: P.brick, uvScale: 1 });
    }
    b.chamferBox([2.4, 0.5, 0.07], [0, 3.55, 3.7], 0.02, { mat: 'woodgrain', color: P.burgundyDark });
    b.plane(2.28, 0.42, [0, 3.55, 3.74], { mat: 'sign:butcher' });
    for (const x of [-2.6, 2.6]) {
      b.box([1.6, 0.04, 0.95], [x, 3.0, 4.0], { mat: 'awning:burgundy' }, [0.4, 0, 0]);
      for (let i = 0; i < 5; i++)
        b.extrude(
          [
            [-0.16, 0],
            [0.16, 0],
            [0, -0.15],
          ],
          0.012,
          [x - 0.64 + i * 0.32, 2.82, 4.44],
          { mat: 'awning:burgundy' },
        );
    }
    return b.build('bld_butcher');
  },
});

// ───────── Остановка и автобус ─────────

defineAsset({
  id: 'bus_stop',
  name: 'Остановка',
  category: 'vehicle',
  func: 'Точка прибытия игрока в интро',
  ref: 'Map/MAP-01 «Остановка»',
  collider: 'бокс 3×1.6',
  build: () => {
    const b = new ModelBuilder(661);
    const g: PartOptions = { mat: 'woodgrain', color: P.green };
    b.collider(0, -0.8, 1.6, 0.12);
    b.collider(-1.5, 0, 0.1, 0.85);
    b.collider(1.95, 0.85, 0.08, 0.08);
    b.chamferBox([3.4, 0.14, 2.0], [0, 0.07, 0], 0.03, { mat: 'stone', color: P.stoneLight });
    for (const x of [-1.5, 1.5]) for (const z of [-0.8, 0.75]) b.chamferBox([0.12, 2.45, 0.12], [x, 1.28, z], 0.02, g);
    styledGableRoof(b, { span: 2.2, length: 3.2, eaveY: 2.5, pitchDeg: 26, overhangSide: 0.3, overhangEnd: 0.25, color: P.roofGreen, trim: P.green, ridgeAlong: 'x', gable: null, rowW: 0.36 });
    b.box([3.0, 2.0, 0.04], [0, 1.15, -0.8], { mat: 'wood', color: 0xa77a50, uvScale: 1 });
    b.box([0.04, 2.0, 1.5], [-1.5, 1.15, -0.02], { mat: 'glassFrost' });
    b.chamferBox([2.6, 0.07, 0.42], [0, 0.48, -0.5], 0.015, { mat: 'woodgrain', color: P.woodLight });
    for (const x of [-1.1, 1.1]) b.box([0.08, 0.42, 0.32], [x, 0.27, -0.5], g);
    b.box([0.08, 2.7, 0.08], [1.95, 1.35, 0.85], { mat: 'metal', color: P.iron });
    b.chamferBox([0.66, 0.4, 0.06], [1.95, 2.5, 0.85], 0.02, g);
    b.plane(0.58, 0.32, [1.95, 2.5, 0.885], { mat: 'sign:bus_stop' });
    b.plane(0.58, 0.32, [1.95, 2.5, 0.815], { mat: 'sign:bus_stop' }, [0, Math.PI, 0]);
    b.box([0.5, 0.7, 0.02], [0.7, 1.4, -0.77], { mat: 'paper', color: P.paperWhite });
    return b.build('bus_stop');
  },
});

defineAsset({
  id: 'bus',
  name: 'Автобус',
  category: 'vehicle',
  func: 'Интро: привозит игрока в деревню',
  ref: 'Map/MAP-01 (ретро-автобус: кремовый верх, тёмно-зелёный низ)',
  collider: 'нет (кат-сцена)',
  anims: 'колёса (узлы wheel_*)',
  pivot: 'центр основания, перед — +Z',
  build: () => {
    const b = new ModelBuilder(662);
    const L = 9.0;
    const W = 2.45;
    const cream: PartOptions = { color: 0xf1ead2 };
    const green: PartOptions = { color: 0x2f5a46 };
    b.chamferBox([W, 1.1, L], [0, 0.95, 0], 0.2, green);
    b.chamferBox([W, 1.35, L - 0.1], [0, 2.15, 0], 0.32, cream);
    b.box([W + 0.02, 0.12, L - 0.3], [0, 1.52, 0], { color: 0xd5ac64 });
    for (const s of [-1, 1]) for (let i = 0; i < 6; i++) b.chamferBox([0.05, 0.72, 1.05], [s * (W / 2 + 0.005), 2.15, -3.2 + i * 1.22], 0.02, { mat: 'window', color: 0x31454f });
    b.chamferBox([2.1, 0.85, 0.05], [0, 2.1, L / 2 + 0.005], 0.03, { mat: 'window', color: 0x31454f });
    b.chamferBox([2.1, 0.7, 0.05], [0, 2.2, -L / 2 - 0.005], 0.03, { mat: 'window', color: 0x31454f });
    b.chamferBox([0.06, 2.0, 1.0], [W / 2 + 0.02, 1.5, 3.3], 0.02, { mat: 'window', color: 0x3a5562 });
    b.chamferBox([W + 0.1, 0.22, 0.18], [0, 0.45, L / 2 + 0.05], 0.04, { mat: 'chrome', color: P.chrome });
    b.chamferBox([W + 0.1, 0.22, 0.18], [0, 0.45, -L / 2 - 0.05], 0.04, { mat: 'chrome', color: P.chrome });
    for (const s of [-1, 1]) {
      b.cyl(0.14, 0.14, 0.06, 10, [s * 0.85, 0.95, L / 2 + 0.03], { mat: 'emissive', color: 0xfff2d0 }, [Math.PI / 2, 0, 0]);
      b.box([0.22, 0.14, 0.05], [s * 0.9, 0.95, -L / 2 - 0.02], { color: 0xc0392b });
    }
    b.plane(0.9, 0.42, [0, 2.75, L / 2 + 0.03], { mat: 'sign:bus_route' });
    for (const [x, z, n] of [
      [-1.12, 2.9, 'wheel_FL'],
      [1.12, 2.9, 'wheel_FR'],
      [-1.12, -2.9, 'wheel_BL'],
      [1.12, -2.9, 'wheel_BR'],
    ] as const) {
      b.node(n, [x, 0.48, z], undefined, (wb) => {
        wb.cyl(0.48, 0.48, 0.32, 14, [0, 0, 0], { color: 0x1e1f21 }, [0, 0, Math.PI / 2]);
        wb.cyl(0.26, 0.26, 0.34, 10, [0, 0, 0], { mat: 'chrome', color: P.chrome }, [0, 0, Math.PI / 2]);
      });
    }
    b.marker('door', [W / 2 + 0.6, 0, 3.3]);
    return b.build('bus');
  },
});
