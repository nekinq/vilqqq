import { ModelBuilder, type PartOptions, type V3 } from '../ModelKit';
import { defineAsset } from '../registry';

/**
 * Персонажи в стиле CHAR-01: стилизованный low-poly, чуть крупная голова, гранёные формы,
 * плоские цвета. Скелета нет — анимация вращает узлы: leg_L/leg_R (бедро), body (таз),
 * arm_L/arm_R (плечо), head (шея). Модель смотрит в +Z, пивот — между стоп.
 */

export type HairStyle = 'short' | 'bob' | 'long' | 'bun' | 'ponytail' | 'braid' | 'bald' | 'none';
export type HatStyle = 'cap' | 'chef' | 'straw' | 'scarf' | 'driver' | 'beanie';
export type TopStyle = 'shirt' | 'sweater' | 'cardigan' | 'hoodie' | 'jacket' | 'tshirt' | 'blouse';

export interface CharSpec {
  seed: number;
  height: number;
  /** Ширина корпуса (1 — обычная). */
  build?: number;
  skin: number;
  hair: number;
  hairStyle: HairStyle;
  hat?: HatStyle | null;
  hatColor?: number;
  hatColor2?: number;
  top: number;
  topStyle?: TopStyle;
  topAccent?: number;
  sleeves?: 'long' | 'short';
  bottom: number;
  skirt?: boolean;
  shoes: number;
  apron?: number | null;
  apronAccent?: number;
  /** Комбинезон-нагрудник (огородник). */
  overalls?: number | null;
  vest?: number | null;
  facial?: 'mustache' | 'beard' | null;
  glasses?: boolean;
  blush?: boolean;
  belly?: boolean;
  badge?: boolean;
}

const flat = (color: number, extra: PartOptions = {}): PartOptions => ({ color, ...extra });

/** Восьмиугольное сечение (прямоугольник со срезанными углами). */
function ring(y: number, w: number, d: number, c: number, dz = 0): V3[] {
  const hw = w / 2;
  const hd = d / 2;
  const cc = Math.min(c, hw * 0.9, hd * 0.9);
  return [
    [-hw + cc, y, -hd + dz],
    [hw - cc, y, -hd + dz],
    [hw, y, -hd + cc + dz],
    [hw, y, hd - cc + dz],
    [hw - cc, y, hd + dz],
    [-hw + cc, y, hd + dz],
    [-hw, y, hd - cc + dz],
    [-hw, y, -hd + cc + dz],
  ];
}

/** Гранёный «столбик» из нескольких сечений: [y, ширина, глубина, сдвиг по z]. */
function loft(b: ModelBuilder, rings: [number, number, number, number?][], c: number, opts: PartOptions, pos: V3 = [0, 0, 0]): void {
  const pts: V3[] = [];
  for (const [y, w, d, dz] of rings) pts.push(...ring(y, w, d, c, dz ?? 0));
  b.hull(pts, pos, opts);
}

function darker(c: number, k: number): number {
  const r = Math.round(((c >> 16) & 255) * k);
  const g = Math.round(((c >> 8) & 255) * k);
  const bl = Math.round((c & 255) * k);
  return (Math.min(255, r) << 16) | (Math.min(255, g) << 8) | Math.min(255, bl);
}

function buildHead(nb: ModelBuilder, s: CharSpec, headR: number): void {
  const skin = s.skin;
  const hy = 0.045 + headR;
  // Шея.
  nb.cyl(0.045, 0.05, 0.07, 6, [0, 0.025, 0], flat(darker(skin, 0.92)));
  // Голова — гранёная сфера.
  nb.ico(headR, 1, [0, hy, 0], flat(skin, { faceJitter: 0.025 }), [0.94, 1.04, 0.95]);
  // Уши.
  for (const sx of [-1, 1]) nb.chamferBox([0.03, 0.06, 0.045], [sx * headR * 0.93, hy - 0.005, -0.005], 0.01, flat(darker(skin, 0.95)));
  // Нос.
  nb.chamferBox([0.036, 0.05, 0.045], [0, hy - 0.02, headR * 0.92], 0.012, flat(darker(skin, 0.96)), [-0.15, 0, 0]);
  // Глаза.
  const eyeY = hy + 0.018;
  for (const sx of [-1, 1]) {
    nb.sphere(0.021, 6, 4, [sx * 0.052, eyeY, headR * 0.86], flat(0x1f1a17, { noShadow: true }), [1, 1.25, 0.6]);
    nb.sphere(0.006, 4, 3, [sx * 0.052 + 0.007, eyeY + 0.01, headR * 0.86 + 0.012], flat(0xffffff, { noShadow: true }));
    // Брови.
    nb.box([0.045, 0.011, 0.012], [sx * 0.054, eyeY + 0.042, headR * 0.86], flat(darker(s.hair === 0xd8d6d0 ? 0x9a9a98 : s.hair, 0.85), { noShadow: true }), [0, 0, sx * -0.12]);
  }
  // Рот.
  nb.box([0.05, 0.011, 0.01], [0, hy - 0.072, headR * 0.86], flat(0x8a3a32, { noShadow: true }));
  if (s.blush) for (const sx of [-1, 1]) nb.sphere(0.02, 6, 3, [sx * 0.085, hy - 0.035, headR * 0.8], flat(0xe89a8c, { noShadow: true }), [1.2, 0.7, 0.4]);
  if (s.glasses) {
    for (const sx of [-1, 1]) nb.torus(0.027, 0.0055, 4, 10, [sx * 0.052, eyeY, headR * 0.93], flat(0x3a3330, { noShadow: true }));
    nb.box([0.03, 0.006, 0.006], [0, eyeY + 0.006, headR * 0.95], flat(0x3a3330, { noShadow: true }));
  }
  if (s.facial === 'mustache') {
    nb.chamferBox([0.1, 0.03, 0.03], [0, hy - 0.05, headR * 0.9], 0.01, flat(s.hair), [0.1, 0, 0]);
  } else if (s.facial === 'beard') {
    nb.hull(
      [
        [-0.1, 0.02, 0.0],
        [0.1, 0.02, 0.0],
        [-0.09, -0.06, 0.06],
        [0.09, -0.06, 0.06],
        [-0.05, -0.11, 0.07],
        [0.05, -0.11, 0.07],
        [-0.1, 0.0, -0.06],
        [0.1, 0.0, -0.06],
        [0, -0.02, 0.1],
      ],
      [0, hy - 0.04, headR * 0.45],
      flat(s.hair, { faceJitter: 0.05 }),
    );
    nb.chamferBox([0.1, 0.028, 0.03], [0, hy - 0.05, headR * 0.92], 0.01, flat(s.hair));
  }
  // Волосы.
  const hairO = flat(s.hair, { faceJitter: 0.04 });
  const top = hy + headR * 0.55;
  switch (s.hairStyle) {
    case 'short':
      nb.ico(headR * 1.04, 1, [0, hy + 0.035, -0.012], hairO, [0.98, 0.8, 1.0]);
      nb.chamferBox([headR * 1.7, 0.05, 0.05], [0, top - 0.005, headR * 0.72], 0.02, hairO, [0.35, 0, 0]);
      break;
    case 'bob':
      nb.ico(headR * 1.08, 1, [0, hy + 0.035, -0.02], hairO, [1.04, 0.86, 1.02]);
      for (const sx of [-1, 1]) nb.chamferBox([0.05, 0.2, 0.2], [sx * headR * 0.95, hy - 0.03, -0.03], 0.025, hairO);
      nb.chamferBox([headR * 1.85, 0.2, 0.08], [0, hy - 0.02, -headR * 0.85], 0.03, hairO);
      nb.chamferBox([headR * 1.4, 0.05, 0.05], [0.02, top - 0.01, headR * 0.7], 0.02, hairO, [0.4, 0, 0.12]);
      break;
    case 'long':
      nb.ico(headR * 1.08, 1, [0, hy + 0.035, -0.02], hairO, [1.04, 0.86, 1.02]);
      for (const sx of [-1, 1]) nb.chamferBox([0.05, 0.3, 0.16], [sx * headR * 0.95, hy - 0.08, -0.04], 0.025, hairO);
      nb.chamferBox([headR * 1.85, 0.38, 0.08], [0, hy - 0.1, -headR * 0.86], 0.035, hairO);
      nb.chamferBox([headR * 1.4, 0.05, 0.05], [-0.02, top - 0.01, headR * 0.7], 0.02, hairO, [0.4, 0, -0.12]);
      break;
    case 'bun':
      nb.ico(headR * 1.05, 1, [0, hy + 0.03, -0.015], hairO, [1.0, 0.82, 1.0]);
      nb.ico(headR * 0.48, 1, [0, top + 0.02, -headR * 0.55], hairO);
      break;
    case 'ponytail':
      nb.ico(headR * 1.05, 1, [0, hy + 0.035, -0.015], hairO, [1.0, 0.84, 1.0]);
      nb.cyl(0.03, 0.028, 0.04, 6, [0, top - 0.02, -headR * 0.92], flat(0xd04a5a), [Math.PI / 2.4, 0, 0]);
      nb.hull(
        [
          [-0.05, 0, 0],
          [0.05, 0, 0],
          [0, 0.03, -0.03],
          [-0.045, -0.2, -0.06],
          [0.045, -0.2, -0.06],
          [0, -0.3, -0.04],
        ],
        [0, top - 0.04, -headR * 1.02],
        hairO,
      );
      nb.chamferBox([headR * 1.5, 0.05, 0.05], [0, top - 0.01, headR * 0.7], 0.02, hairO, [0.4, 0, 0]);
      break;
    case 'braid':
      nb.ico(headR * 1.05, 1, [0, hy + 0.035, -0.015], hairO, [1.0, 0.84, 1.0]);
      for (let i = 0; i < 4; i++) nb.ico(0.04 - i * 0.004, 0, [0, hy - 0.04 - i * 0.075, -headR * 1.0 - 0.01], hairO, [1, 1.2, 1]);
      break;
    case 'bald':
      // Венчик волос по бокам и сзади.
      nb.ico(headR * 1.03, 1, [0, hy - 0.01, -0.03], hairO, [1.0, 0.55, 0.95]);
      break;
    case 'none':
      break;
  }
  // Головные уборы.
  const hc = s.hatColor ?? 0x5a5650;
  const hatO = flat(hc, { faceJitter: 0.03 });
  switch (s.hat) {
    case 'cap':
      nb.ico(headR * 1.08, 1, [0, hy + 0.06, -0.01], hatO, [1.02, 0.6, 1.06]);
      nb.chamferBox([headR * 1.55, 0.022, 0.1], [0, hy + 0.07, headR * 0.98], 0.008, flat(darker(hc, 0.85)), [-0.12, 0, 0]);
      nb.sphere(0.012, 4, 3, [0, top + 0.035, 0.0], hatO);
      break;
    case 'chef':
      nb.cyl(headR * 0.98, headR * 0.95, 0.12, 10, [0, top + 0.02, -0.01], flat(0xf7f5f0));
      nb.ico(headR * 1.15, 1, [0, top + 0.12, -0.01], flat(0xf7f5f0, { faceJitter: 0.03 }), [1, 0.62, 1]);
      break;
    case 'straw': {
      const straw = flat(s.hatColor ?? 0xd8b86a, { faceJitter: 0.05 });
      nb.cyl(headR * 2.05, headR * 2.1, 0.025, 12, [0, top - 0.02, 0], straw);
      nb.cyl(headR * 0.86, headR * 0.98, 0.12, 10, [0, top + 0.045, 0], straw);
      nb.cyl(headR * 0.99, headR * 0.99, 0.03, 10, [0, top + 0.005, 0], flat(s.hatColor2 ?? 0x8a3a2a));
      break;
    }
    case 'scarf': {
      const sc = flat(hc, { faceJitter: 0.03 });
      nb.ico(headR * 1.1, 1, [0, hy + 0.03, -0.015], sc, [1.04, 0.94, 1.04]);
      nb.hull(
        [
          [-0.07, 0, 0],
          [0.07, 0, 0],
          [0, -0.13, -0.03],
          [0, 0.02, 0.03],
        ],
        [0, hy - 0.05, -headR * 1.02],
        sc,
      );
      // Узелок под подбородком и горошек.
      nb.ico(0.025, 0, [0.0, hy - headR * 0.95, headR * 0.45], sc);
      if (s.hatColor2 !== undefined) {
        for (let i = 0; i < 9; i++) {
          const a = (i / 9) * Math.PI * 2;
          nb.sphere(0.009, 4, 3, [Math.cos(a) * headR * 0.85, hy + 0.09 + Math.sin(a * 2) * 0.02, Math.sin(a) * headR * 0.85 - 0.015], flat(s.hatColor2, { noShadow: true }));
        }
      }
      break;
    }
    case 'driver':
      nb.cyl(headR * 1.08, headR * 0.98, 0.09, 10, [0, top + 0.01, -0.01], hatO);
      nb.cyl(headR * 1.12, headR * 1.12, 0.03, 10, [0, top + 0.06, -0.01], flat(darker(hc, 1.1)));
      nb.chamferBox([headR * 1.4, 0.02, 0.09], [0, top - 0.03, headR * 0.95], 0.008, flat(0x1e1f21), [-0.25, 0, 0]);
      nb.box([0.04, 0.03, 0.01], [0, top + 0.02, headR * 1.08], flat(0xd5ac64, { noShadow: true }));
      break;
    case 'beanie':
      nb.ico(headR * 1.1, 1, [0, hy + 0.06, -0.01], hatO, [1.02, 0.78, 1.02]);
      nb.cyl(headR * 1.08, headR * 1.08, 0.05, 10, [0, hy + 0.04, -0.01], flat(darker(hc, 0.85)));
      nb.ico(0.035, 0, [0, top + 0.08, -0.01], flat(darker(hc, 1.15)));
      break;
    default:
      break;
  }
}

function buildArm(ab: ModelBuilder, s: CharSpec, side: 1 | -1, armLen: number): void {
  const sleeve = s.topStyle === 'tshirt' || s.sleeves === 'short' ? 'short' : 'long';
  const topC = s.topStyle === 'cardigan' || s.topStyle === 'jacket' ? s.top : s.top;
  const upper = armLen * 0.52;
  // Плечо.
  loft(ab, [
    [0.02, 0.12, 0.12],
    [-upper, 0.1, 0.105],
  ], 0.025, flat(topC, { faceJitter: 0.02 }));
  // Предплечье: рукав или кожа.
  loft(ab, [
    [-upper + 0.01, 0.095, 0.1],
    [-armLen + 0.06, 0.08, 0.085],
  ], 0.022, flat(sleeve === 'long' ? darker(topC, 0.97) : s.skin, { faceJitter: 0.02 }));
  if (sleeve === 'long') ab.cyl(0.05, 0.05, 0.03, 6, [0, -armLen + 0.07, 0], flat(s.topAccent ?? darker(topC, 0.85)));
  // Кисть.
  ab.chamferBox([0.065, 0.1, 0.075], [0, -armLen + 0.005, 0.005], 0.022, flat(s.skin));
  ab.chamferBox([0.028, 0.05, 0.03], [side * -0.035, -armLen + 0.03, 0.035], 0.01, flat(s.skin), [0, 0, side * 0.4]);
  ab.marker('hand', [0, -armLen - 0.02, 0.03]);
}

function buildLeg(lb: ModelBuilder, s: CharSpec, legLen: number): void {
  const bw = s.build ?? 1;
  const pants = s.skirt ? s.skin : s.bottom;
  const sock = s.skirt ? darker(s.skin, 0.95) : s.bottom;
  loft(lb, [
    [0.02, 0.145 * bw, 0.16],
    [-legLen * 0.5, 0.12 * bw, 0.13],
    [-legLen + 0.09, 0.1, 0.11],
  ], 0.03, flat(pants, { faceJitter: 0.02 }));
  if (s.skirt) lb.cyl(0.052, 0.052, 0.05, 6, [0, -legLen + 0.11, 0], flat(sock));
  // Ботинок.
  lb.chamferBox([0.12, 0.09, 0.24], [0, -legLen + 0.045, 0.035], 0.03, flat(s.shoes));
  lb.box([0.124, 0.02, 0.245], [0, -legLen + 0.01, 0.035], flat(darker(s.shoes, 0.7), { noShadow: true }));
}

export function buildCharacter(s: CharSpec, name: string): ModelBuilder {
  const b = new ModelBuilder(s.seed);
  const H = s.height;
  const bw = s.build ?? 1;
  const legLen = H * 0.46;
  const torsoLen = H * 0.29;
  const headK = 1.2 * Math.sqrt(H / 1.7);
  const shoulderX = 0.2 * bw + 0.02;
  const armLen = H * 0.34;
  // Ноги.
  for (const side of [-1, 1] as const) {
    b.node(side < 0 ? 'leg_L' : 'leg_R', [side * 0.095 * bw, legLen, 0], undefined, (lb) => buildLeg(lb, s, legLen));
  }
  // Корпус.
  b.node('body', [0, legLen, 0], undefined, (bb) => {
    const top = s.top;
    // Таз.
    loft(bb, [
      [-0.07, 0.34 * bw, 0.2],
      [0.12, 0.33 * bw, 0.21],
    ], 0.05, flat(s.skirt ? s.bottom : s.bottom, { faceJitter: 0.02 }));
    if (s.skirt) {
      loft(bb, [
        [0.12, 0.34 * bw, 0.22],
        [-legLen * 0.52, 0.5 * bw, 0.36],
      ], 0.08, flat(s.bottom, { faceJitter: 0.03 }));
    }
    // Туловище.
    const chestD = s.belly ? 0.27 : 0.23;
    loft(bb, [
      [0.06, 0.33 * bw, 0.21],
      [torsoLen * 0.55, 0.37 * bw, chestD, s.belly ? 0.02 : 0],
      [torsoLen, 0.4 * bw, 0.22],
    ], 0.06, flat(top, { faceJitter: 0.02 }));
    if (s.belly) bb.ico(0.17 * bw, 1, [0, torsoLen * 0.32, 0.06], flat(top, { faceJitter: 0.02 }), [1.05, 0.95, 0.8]);
    // Плечи (покатые).
    bb.chamferBox([0.42 * bw, 0.06, 0.2], [0, torsoLen - 0.01, 0], 0.03, flat(top));
    // Детали верха.
    const front = chestD / 2 + 0.004;
    switch (s.topStyle) {
      case 'shirt':
      case 'blouse':
        // Воротник.
        bb.hull(
          [
            [-0.08, 0, -0.02],
            [0.08, 0, -0.02],
            [-0.06, 0.035, 0.07],
            [0.06, 0.035, 0.07],
            [0, -0.06, 0.1],
          ],
          [0, torsoLen + 0.01, 0.0],
          flat(s.topAccent ?? 0xf3efe6),
        );
        for (let i = 0; i < 3; i++) bb.sphere(0.009, 4, 3, [0, torsoLen - 0.09 - i * 0.07, front + 0.005], flat(darker(top, 0.7), { noShadow: true }));
        break;
      case 'cardigan':
        bb.box([0.05, torsoLen * 0.9, 0.012], [0, torsoLen * 0.5, front + 0.003], flat(s.topAccent ?? darker(top, 0.8)));
        for (let i = 0; i < 4; i++) bb.sphere(0.012, 4, 3, [0, torsoLen * 0.2 + i * 0.07, front + 0.012], flat(0xe8dcc0, { noShadow: true }));
        // Карманы.
        for (const sx of [-1, 1]) bb.box([0.09, 0.07, 0.012], [sx * 0.1, torsoLen * 0.22, front + 0.004], flat(darker(top, 0.9)));
        break;
      case 'hoodie':
        bb.torus(0.11, 0.035, 5, 10, [0, torsoLen + 0.02, -0.06], flat(darker(top, 0.92)), [Math.PI / 2 + 0.3, 0, 0]);
        bb.box([0.2, 0.09, 0.015], [0, torsoLen * 0.22, front + 0.004], flat(darker(top, 0.88)));
        for (const sx of [-1, 1]) bb.cyl(0.006, 0.006, 0.12, 4, [sx * 0.035, torsoLen - 0.08, front + 0.012], flat(0xf2ece0, { noShadow: true }));
        break;
      case 'jacket':
        bb.box([0.03, torsoLen * 0.95, 0.012], [0, torsoLen * 0.5, front + 0.003], flat(darker(top, 0.75)));
        for (const sx of [-1, 1]) {
          bb.hull(
            [
              [0, 0, 0],
              [sx * 0.09, 0, 0],
              [sx * 0.02, -0.14, 0.01],
            ],
            [0, torsoLen + 0.005, front + 0.004],
            flat(darker(top, 0.85)),
          );
          bb.box([0.08, 0.012, 0.012], [sx * 0.1, torsoLen * 0.3, front + 0.005], flat(darker(top, 0.7)));
        }
        break;
      case 'sweater':
        bb.cyl(0.085, 0.095, 0.05, 8, [0, torsoLen + 0.01, 0], flat(s.topAccent ?? darker(top, 0.85)));
        bb.box([0.36 * bw, 0.03, 0.012], [0, torsoLen * 0.62, front + 0.002], flat(s.topAccent ?? darker(top, 0.8)));
        break;
      default:
        bb.cyl(0.075, 0.085, 0.03, 8, [0, torsoLen + 0.005, 0], flat(darker(top, 0.85)));
        break;
    }
    // Фартук: нагрудник + юбка фартука + лямки.
    if (s.apron != null) {
      const ap = flat(s.apron, { faceJitter: 0.02 });
      const az = (s.belly ? 0.17 : chestD / 2) + 0.012;
      bb.hull(
        [
          [-0.12, torsoLen - 0.06, 0],
          [0.12, torsoLen - 0.06, 0],
          [-0.17 * bw, torsoLen * 0.25, 0.01],
          [0.17 * bw, torsoLen * 0.25, 0.01],
          [-0.12, torsoLen - 0.06, -0.012],
          [0.12, torsoLen - 0.06, -0.012],
          [-0.17 * bw, torsoLen * 0.25, -0.004],
          [0.17 * bw, torsoLen * 0.25, -0.004],
        ],
        [0, 0, az + (s.belly ? 0.03 : 0)],
        ap,
      );
      bb.hull(
        [
          [-0.19 * bw, torsoLen * 0.27, 0],
          [0.19 * bw, torsoLen * 0.27, 0],
          [-0.21 * bw, -legLen * 0.42, 0.04],
          [0.21 * bw, -legLen * 0.42, 0.04],
          [-0.19 * bw, torsoLen * 0.27, -0.014],
          [0.19 * bw, torsoLen * 0.27, -0.014],
          [-0.21 * bw, -legLen * 0.42, 0.024],
          [0.21 * bw, -legLen * 0.42, 0.024],
        ],
        [0, 0, az + 0.004 + (s.belly ? 0.03 : 0)],
        ap,
      );
      if (s.apronAccent !== undefined) bb.box([0.38 * bw, 0.025, 0.01], [0, -legLen * 0.38, az + 0.045 + (s.belly ? 0.03 : 0)], flat(s.apronAccent, { noShadow: true }));
      bb.box([0.3 * bw, 0.03, 0.03], [0, torsoLen * 0.27, az - 0.005 + (s.belly ? 0.03 : 0)], flat(darker(s.apron, 0.8)));
      for (const sx of [-1, 1]) bb.beam([sx * 0.1, torsoLen - 0.06, az - 0.005], [sx * 0.07, torsoLen + 0.04, -0.02], 0.012, 4, flat(darker(s.apron, 0.85), { noShadow: true }));
      // Карман.
      bb.box([0.14, 0.09, 0.01], [0.04, torsoLen * 0.05, az + 0.03 + (s.belly ? 0.03 : 0)], flat(darker(s.apron, 0.9)));
    }
    if (s.overalls != null) {
      const ov = flat(s.overalls, { faceJitter: 0.02 });
      bb.box([0.22, torsoLen * 0.55, 0.012], [0, torsoLen * 0.38, chestD / 2 + 0.006], ov);
      for (const sx of [-1, 1]) {
        bb.beam([sx * 0.09, torsoLen * 0.62, chestD / 2 + 0.008], [sx * 0.11, torsoLen + 0.02, -0.02], 0.014, 4, ov);
        bb.sphere(0.014, 4, 3, [sx * 0.085, torsoLen * 0.6, chestD / 2 + 0.015], flat(0xd5ac64, { noShadow: true }));
      }
      bb.box([0.11, 0.07, 0.01], [0, torsoLen * 0.4, chestD / 2 + 0.014], flat(darker(s.overalls, 0.85)));
    }
    if (s.vest != null) {
      for (const sx of [-1, 1]) {
        bb.hull(
          [
            [sx * 0.03, torsoLen - 0.02, 0],
            [sx * 0.18 * bw, torsoLen - 0.02, -0.02],
            [sx * 0.035, torsoLen * 0.05, 0.012],
            [sx * 0.18 * bw, torsoLen * 0.05, 0.0],
            [sx * 0.03, torsoLen - 0.02, -0.015],
            [sx * 0.035, torsoLen * 0.05, -0.004],
          ],
          [0, 0, chestD / 2 + 0.006],
          flat(s.vest, { faceJitter: 0.02 }),
        );
      }
      for (let i = 0; i < 3; i++) bb.sphere(0.01, 4, 3, [0.045, torsoLen * 0.2 + i * 0.08, chestD / 2 + 0.02], flat(0xe8dcc0, { noShadow: true }));
    }
    if (s.badge) {
      bb.box([0.075, 0.035, 0.008], [0.1, torsoLen * 0.72, chestD / 2 + 0.024], flat(0xf7f5f0, { noShadow: true }));
      bb.box([0.06, 0.008, 0.004], [0.1, torsoLen * 0.72, chestD / 2 + 0.03], flat(0x2f4f3f, { noShadow: true }));
    }
    // Руки.
    for (const side of [-1, 1] as const) {
      bb.node(side < 0 ? 'arm_L' : 'arm_R', [side * shoulderX, torsoLen - 0.04, 0], [0, 0, side * 0.08], (ab) => buildArm(ab, s, side, armLen));
    }
    // Голова.
    bb.node('head', [0, torsoLen - 0.012, 0], undefined, (hb) => hb.at([0, 0, 0], undefined, () => buildHead(hb, s, 0.13), [headK, headK, headK]));
  });
  b.marker('top', [0, legLen + torsoLen + (0.07 + 0.26) * headK + 0.12, 0]);
  return b;
}

// ───────── Палитры ─────────

const SKIN = [0xf2c9a5, 0xe8b48f, 0xd9a07a, 0xc28660, 0xa86f4c] as const;
const HAIR = { black: 0x2b1d14, dark: 0x4a3022, brown: 0x6b4426, auburn: 0x8c4a2a, blond: 0xc8a060, grey: 0x9a9a98, white: 0xd8d6d0, red: 0x8e3a1e };

export const CUSTOMER_ARCHETYPES = ['woman', 'man', 'grandma', 'grandpa', 'young'] as const;
export type CustomerArchetype = (typeof CUSTOMER_ARCHETYPES)[number];

const CUSTOMERS: Record<CustomerArchetype, CharSpec[]> = {
  woman: [
    { seed: 1101, height: 1.64, skin: SKIN[1], hair: HAIR.brown, hairStyle: 'bob', top: 0x4f8fb0, topStyle: 'blouse', bottom: 0x6a4a7a, skirt: true, shoes: 0x5a3a2a, blush: true },
    { seed: 1102, height: 1.67, skin: SKIN[0], hair: HAIR.blond, hairStyle: 'long', top: 0xd88a6a, topStyle: 'sweater', topAccent: 0xf0d8b0, bottom: 0x3e5470, shoes: 0x2a2a2a, blush: true },
    { seed: 1103, height: 1.62, skin: SKIN[3], hair: HAIR.black, hairStyle: 'bun', top: 0x7aa36a, topStyle: 'cardigan', topAccent: 0x5a8050, bottom: 0xc0a080, skirt: true, shoes: 0x6a4a30, blush: true },
  ],
  man: [
    { seed: 1201, height: 1.74, skin: SKIN[1], hair: HAIR.dark, hairStyle: 'short', top: 0x5b7fa6, topStyle: 'shirt', bottom: 0x3d4a5c, shoes: 0x3a2a20 },
    { seed: 1202, height: 1.78, skin: SKIN[2], hair: HAIR.black, hairStyle: 'short', top: 0xb8623e, topStyle: 'sweater', topAccent: 0xe8d0a8, bottom: 0x5a5040, shoes: 0x2a2a2a, facial: 'beard' },
    { seed: 1203, height: 1.72, skin: SKIN[4], hair: HAIR.dark, hairStyle: 'short', top: 0x6a8a5a, topStyle: 'jacket', bottom: 0x2f3a48, shoes: 0x4a3020, facial: 'mustache' },
  ],
  grandma: [
    { seed: 1301, height: 1.53, build: 1.06, skin: SKIN[0], hair: HAIR.white, hairStyle: 'bun', hat: 'scarf', hatColor: 0xc44a4a, hatColor2: 0xf7f0e0, top: 0x8a6a9a, topStyle: 'cardigan', topAccent: 0x6a5078, bottom: 0x5a5a6a, skirt: true, shoes: 0x3a2a24, blush: true },
    { seed: 1302, height: 1.55, build: 1.05, skin: SKIN[1], hair: HAIR.grey, hairStyle: 'bun', top: 0xc78a5a, topStyle: 'cardigan', topAccent: 0x9a6a40, bottom: 0x4a5a4a, skirt: true, shoes: 0x2a2a2a, glasses: true, blush: true },
    { seed: 1303, height: 1.52, build: 1.08, skin: SKIN[2], hair: HAIR.white, hairStyle: 'bun', hat: 'scarf', hatColor: 0x4a6a9a, hatColor2: 0xf7f0e0, top: 0x6a8a6a, topStyle: 'sweater', topAccent: 0xd8c8a0, bottom: 0x6a4a3a, skirt: true, shoes: 0x3a2a24, glasses: true, blush: true },
  ],
  grandpa: [
    { seed: 1401, height: 1.66, skin: SKIN[1], hair: HAIR.grey, hairStyle: 'bald', hat: 'cap', hatColor: 0x6a6258, top: 0x7a6a50, topStyle: 'jacket', bottom: 0x4a4a52, shoes: 0x3a2a20, facial: 'mustache' },
    { seed: 1402, height: 1.64, skin: SKIN[2], hair: HAIR.white, hairStyle: 'bald', top: 0x5a7a8a, topStyle: 'cardigan', topAccent: 0x40606a, bottom: 0x5a5040, shoes: 0x2a2a2a, glasses: true, facial: 'beard' },
    { seed: 1403, height: 1.68, skin: SKIN[0], hair: HAIR.grey, hairStyle: 'short', hat: 'cap', hatColor: 0x3a4a3a, top: 0xa04a3a, topStyle: 'sweater', topAccent: 0x703028, bottom: 0x3a4250, shoes: 0x4a3020, facial: 'mustache' },
  ],
  young: [
    { seed: 1501, height: 1.66, skin: SKIN[0], hair: HAIR.auburn, hairStyle: 'ponytail', top: 0xe0b040, topStyle: 'hoodie', bottom: 0x3e5a80, shoes: 0xf2f0ea, blush: true },
    { seed: 1502, height: 1.72, skin: SKIN[3], hair: HAIR.black, hairStyle: 'short', hat: 'beanie', hatColor: 0x3f7d6a, top: 0x5a5f6a, topStyle: 'hoodie', bottom: 0x2f3440, shoes: 0xf2f0ea },
    { seed: 1503, height: 1.69, skin: SKIN[1], hair: HAIR.blond, hairStyle: 'short', top: 0xd85a5a, topStyle: 'tshirt', bottom: 0x4a6a8a, shoes: 0xe0e0d8 },
  ],
};

export function customerAssetId(arch: CustomerArchetype, variant: number): string {
  return `char_cust_${arch}_${variant}`;
}

export const CUSTOMER_ASSET_IDS: string[] = [];
for (const arch of CUSTOMER_ARCHETYPES) {
  CUSTOMERS[arch].forEach((spec, i) => {
    const id = customerAssetId(arch, i);
    CUSTOMER_ASSET_IDS.push(id);
    defineAsset({
      id,
      name: `Покупатель: ${arch} ${i + 1}`,
      category: 'character',
      func: 'Покупатель магазина',
      ref: 'CHAR-01 (покупатели)',
      pivot: 'между стоп, лицо в +Z',
      collider: 'круг r=0.28 (навигация)',
      anims: 'узлы leg_L/R, arm_L/R, body, head: ходьба, ожидание, взять с полки, оплата',
      build: () => buildCharacter(spec, id).build(id),
    });
  });
}

// ───────── Поставщики и сюжетные персонажи ─────────

const NAMED: Record<string, { name: string; spec: CharSpec; func: string }> = {
  char_grocer: {
    name: 'Фёдор Ильич, бакалейщик',
    func: 'Продавец бакалеи',
    spec: { seed: 1601, height: 1.72, build: 1.08, skin: SKIN[1], hair: HAIR.grey, hairStyle: 'short', hat: 'cap', hatColor: 0x5e5a52, top: 0xe8dcc0, topStyle: 'shirt', topAccent: 0xf6f2e8, bottom: 0x4a4a44, shoes: 0x3a2a20, apron: 0x2f7f78, apronAccent: 0xf2ece0, facial: 'mustache' },
  },
  char_baker: {
    name: 'Марина, пекарь',
    func: 'Продавец пекарни',
    spec: { seed: 1602, height: 1.65, skin: SKIN[0], hair: HAIR.auburn, hairStyle: 'braid', hat: 'chef', top: 0xf3e6e0, topStyle: 'blouse', topAccent: 0xffffff, bottom: 0x7a5a40, skirt: true, shoes: 0x5a3a28, apron: 0xe8a23b, apronAccent: 0xf6ead2, blush: true },
  },
  char_farmer: {
    name: 'Степан, огородник',
    func: 'Продавец овощей',
    spec: { seed: 1603, height: 1.76, skin: SKIN[2], hair: HAIR.brown, hairStyle: 'short', hat: 'straw', hatColor: 0xd8b86a, hatColor2: 0x8a3a2a, top: 0xb8463a, topStyle: 'shirt', topAccent: 0xe8d8c0, bottom: 0x3e5a80, shoes: 0x4a3020, overalls: 0x3e5a80, facial: 'beard' },
  },
  char_dairy: {
    name: 'Тётя Валя, молочница',
    func: 'Продавец молочной фермы',
    spec: { seed: 1604, height: 1.6, build: 1.1, skin: SKIN[0], hair: HAIR.brown, hairStyle: 'bun', hat: 'scarf', hatColor: 0xd04a4a, hatColor2: 0xffffff, top: 0x5a8a5a, topStyle: 'shirt', topAccent: 0xf3efe6, bottom: 0x4a5a7a, skirt: true, shoes: 0x2a3a2a, apron: 0xf2ece0, blush: true },
  },
  char_butcher: {
    name: 'Борис, мясник',
    func: 'Продавец мясной лавки',
    spec: { seed: 1605, height: 1.82, build: 1.22, belly: true, skin: SKIN[1], hair: HAIR.dark, hairStyle: 'bald', top: 0xf2ece0, topStyle: 'tshirt', bottom: 0x3a3a40, shoes: 0x2a2a2a, apron: 0x7d2e3a, apronAccent: 0xefe2d2, facial: 'mustache' },
  },
  char_grandma: {
    name: 'Нина Петровна, бабушка',
    func: 'Финал: бабушка в магазине',
    spec: { seed: 1606, height: 1.52, build: 1.08, skin: SKIN[0], hair: HAIR.white, hairStyle: 'bun', hat: 'scarf', hatColor: 0x3f6b8a, hatColor2: 0xf7f0e0, top: 0xb8564a, topStyle: 'cardigan', topAccent: 0x8a3a32, bottom: 0x4a4050, skirt: true, shoes: 0x3a2a24, glasses: true, blush: true },
  },
  char_driver: {
    name: 'Водитель автобуса',
    func: 'Интро',
    spec: { seed: 1607, height: 1.75, build: 1.08, skin: SKIN[2], hair: HAIR.dark, hairStyle: 'short', hat: 'driver', hatColor: 0x2f3e58, top: 0x3a4a68, topStyle: 'jacket', bottom: 0x2a3040, shoes: 0x1e1f21, facial: 'mustache' },
  },
  char_cashier: {
    name: 'Кассир',
    func: 'Нанимаемый кассир (ур. 3)',
    spec: { seed: 1608, height: 1.68, skin: SKIN[1], hair: HAIR.blond, hairStyle: 'ponytail', top: 0xf3efe6, topStyle: 'shirt', topAccent: 0xffffff, bottom: 0x3a4050, shoes: 0x2a2a2a, vest: 0x2f5a45, badge: true, blush: true },
  },
};

export const NAMED_CHARACTER_IDS = Object.keys(NAMED);

for (const [id, d] of Object.entries(NAMED)) {
  defineAsset({
    id,
    name: d.name,
    category: 'character',
    func: d.func,
    ref: 'Docs/Planning/VillageRevamp/StoryTutorial.md (персонажи), CHAR-01',
    pivot: 'между стоп, лицо в +Z',
    collider: 'круг r=0.3',
    anims: 'узлы leg_L/R, arm_L/R, body, head',
    build: () => buildCharacter(d.spec, id).build(id),
  });
}
