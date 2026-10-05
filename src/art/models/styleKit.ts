import * as THREE from 'three';
import type { ModelBuilder, PartOptions } from '../ModelKit';
import { P } from '../palette';
import { shade } from './buildingKit';

/**
 * Стилизованный low-poly набор по референсам BLD-01 / SHOP-00:
 * толстые крыши из рядов черепицы (ступенчатый силуэт), массивный фахверк с фасками,
 * толстые рамы и ставни, дощатые двери, фонари, каменный цоколь.
 */

export interface StyledRoofSpec {
  /** Пролёт (поперёк конька) и длина (вдоль конька) по наружным стенам. */
  span: number;
  length: number;
  eaveY: number;
  pitchDeg: number;
  overhangSide?: number;
  overhangEnd?: number;
  color: number;
  /** Цвет ветровых досок и лобовых досок. */
  trim: number;
  /** Конёк вдоль Z (по умолчанию) или X. */
  ridgeAlong?: 'z' | 'x';
  /** Чем заполнить фронтоны: null — не заполнять. */
  gable?: PartOptions | null;
  gableT?: number;
  rowW?: number;
  /** Без вершинного разброса рядов (для вывесок поверх). */
  calm?: boolean;
}

export interface RoofInfo {
  ridgeY: number;
  /** Высота верха кровли над точкой (локальная X от конька, по пролёту). */
  topAt: (h: number) => number;
  deckT: number;
}

/** Двускатная крыша рядами черепицы. Возвращает высоту конька. */
export function styledGableRoof(b: ModelBuilder, s: StyledRoofSpec, cx = 0, cz = 0): RoofInfo {
  const along = s.ridgeAlong ?? 'z';
  const p = (s.pitchDeg * Math.PI) / 180;
  const tan = Math.tan(p);
  const cos = Math.cos(p);
  const sin = Math.sin(p);
  const half = s.span / 2;
  const ovS = s.overhangSide ?? 0.45;
  const ovE = s.overhangEnd ?? 0.4;
  const len = s.length + 2 * ovE;
  const deckT = 0.18;
  const ridgeTop = s.eaveY + deckT / cos + half * tan;
  const run = half + ovS;
  const slopeLen = run / cos;
  const rowW = s.rowW ?? 0.52;
  const rowStep = rowW * 0.76;
  const rowT = 0.08;
  const tilt = 0.1;
  const rows = Math.ceil((slopeLen - 0.05) / rowStep);
  const swap = along === 'z' && s.pitchDeg < 45;
  const rng = b.rng;
  const rotY = along === 'z' ? 0 : Math.PI / 2;
  b.at([cx, 0, cz], [0, rotY, 0], () => {
    for (const side of [-1, 1] as const) {
      const ux = side * cos;
      const uy = -sin;
      const vx = side * sin;
      const vy = cos;
      // Настил (снизу виден как подшивка).
      {
        const uc = slopeLen / 2;
        const vc = -deckT / 2;
        b.box([slopeLen + 0.02, deckT, len], [ux * uc + vx * vc, ridgeTop + uy * uc + vy * vc, 0], { mat: 'woodgrain', color: 0x7a5a40, uvScale: 0.8 }, [0, 0, -side * p]);
      }
      // Ряды черепицы: каждый чуть круче отогнут — ступенчатый силуэт.
      for (let j = 0; j < rows; j++) {
        const uTop = j * rowStep;
        const w = Math.min(rowW, slopeLen + 0.06 - uTop);
        if (w < 0.08) continue;
        const lift = (w / 2) * Math.sin(tilt);
        const uc = uTop + (w / 2) * Math.cos(tilt);
        const vc = rowT / 2 + lift;
        const k = s.calm ? 1 : 1 + rng.range(-0.06, 0.06);
        b.box(
          [w, rowT, len - (j === 0 ? 0 : 0) + 0.02],
          [ux * uc + vx * vc, ridgeTop + uy * uc + vy * vc, 0],
          { mat: 'roofRow', color: shade(s.color, k), uvScale: 1.3, uvSwap: swap, uvOffset: [rng.range(0, 1), 0] },
          [0, 0, -side * (p - tilt)],
        );
      }
      // Лобовая доска по свесу.
      const ex = side * (run + 0.02);
      const ey = ridgeTop - slopeLen * sin - deckT * 0.6;
      b.chamferBox([0.07, 0.26, len + 0.02], [ex, ey, 0], 0.015, { mat: 'woodgrain', color: s.trim });
      // Ветровые доски по фронтонам.
      for (const end of [-1, 1] as const) {
        const uc = slopeLen / 2;
        const vc = -deckT / 2 + 0.06;
        b.chamferBox([slopeLen + 0.12, 0.3, 0.08], [ux * uc + vx * vc, ridgeTop + uy * uc + vy * vc, end * (len / 2 + 0.03)], 0.02, { mat: 'woodgrain', color: s.trim }, [0, 0, -side * p]);
      }
    }
    // Конёк — ромбовидный брус.
    b.chamferBox([0.28, 0.28, len + 0.08], [0, ridgeTop + 0.06, 0], 0.05, { mat: 'roofRow', color: shade(s.color, 0.82), uvScale: 1.3, uvSwap: along === 'z' }, [0, 0, Math.PI / 4]);
    // Фронтоны.
    if (s.gable !== null) {
      const gt = s.gableT ?? 0.2;
      const rise = half * tan;
      for (const end of [-1, 1] as const) {
        b.prism(s.span, rise, gt, [0, s.eaveY - 0.002, end * (s.length / 2)], s.gable ?? { mat: 'plaster', color: P.plaster, uvScale: 2 });
      }
    }
  });
  return {
    ridgeY: ridgeTop,
    deckT,
    topAt: (h: number) => ridgeTop - Math.abs(h) * tan + rowT + 0.02,
  };
}

/** Односкатная крыша рядами (навесы, пристройки). Поднята у x0 (hi), опущена у x1 (lo). */
export function styledShedRoof(b: ModelBuilder, x0: number, x1: number, hi: number, lo: number, z0: number, z1: number, color: number, trim: number): void {
  const run = x1 - x0;
  const p = Math.atan2(hi - lo, Math.abs(run));
  const dir = Math.sign(run);
  const slopeLen = Math.hypot(run, hi - lo);
  const len = z1 - z0;
  const cz = (z0 + z1) / 2;
  const cos = Math.cos(p);
  const sin = Math.sin(p);
  const ux = dir * cos;
  const uy = -sin;
  const vx = dir * sin;
  const vy = cos;
  const deckT = 0.14;
  b.box([slopeLen, deckT, len], [x0 + (ux * slopeLen) / 2 + (vx * -deckT) / 2, hi + (uy * slopeLen) / 2 + (vy * -deckT) / 2, cz], { mat: 'woodgrain', color: 0x7a5a40, uvScale: 0.8 }, [0, 0, -dir * p]);
  const rowW = 0.44;
  const rowStep = rowW * 0.78;
  const rowT = 0.07;
  const tilt = 0.075;
  const rows = Math.ceil(slopeLen / rowStep);
  const rng = b.rng;
  for (let j = 0; j < rows; j++) {
    const uTop = j * rowStep;
    const w = Math.min(rowW, slopeLen + 0.05 - uTop);
    if (w < 0.08) continue;
    const uc = uTop + (w / 2) * Math.cos(tilt);
    const vc = rowT / 2 + (w / 2) * Math.sin(tilt);
    b.box([w, rowT, len + 0.04], [x0 + ux * uc + vx * vc, hi + uy * uc + vy * vc, cz], { mat: 'roofRow', color: shade(color, 1 + rng.range(-0.06, 0.06)), uvScale: 1.3, uvSwap: p < Math.PI / 4, uvOffset: [rng.range(0, 1), 0] }, [0, 0, -dir * (p - tilt)]);
  }
  b.chamferBox([0.07, 0.24, len + 0.06], [x1 + dir * 0.02, lo - 0.08, cz], 0.015, { mat: 'woodgrain', color: trim });
  for (const z of [z0 - 0.03, z1 + 0.03]) b.chamferBox([slopeLen + 0.06, 0.26, 0.07], [x0 + (ux * slopeLen) / 2, hi + (uy * slopeLen) / 2 - 0.02, z], 0.015, { mat: 'woodgrain', color: trim }, [0, 0, -dir * p]);
}

/** Односкатная крыша со скатом вдоль Z: высокая сторона z0, низкая z1; по X от x0 до x1. */
export function styledShedRoofZ(b: ModelBuilder, z0: number, z1: number, hi: number, lo: number, x0: number, x1: number, color: number, trim: number): void {
  // Поворот на +90° вокруг Y: локальный x = −мировой z, локальный z = мировой x.
  b.at([0, 0, 0], [0, Math.PI / 2, 0], () => styledShedRoof(b, -z0, -z1, hi, lo, x0, x1, color, trim));
}

/** Каменный цоколь: крупная кладка + выступающий карниз. */
export function stonePlinth(b: ModelBuilder, w: number, d: number, h: number, cx = 0, cz = 0, color: number = P.stone): void {
  b.chamferBox([w + 0.16, h, d + 0.16], [cx, h / 2, cz], 0.04, { mat: 'stone', color, uvScale: 1.5, ao: 0.15 });
  b.chamferBox([w + 0.2, 0.07, d + 0.2], [cx, h + 0.02, cz], 0.02, { mat: 'stone', color: shade(color, 1.1), uvScale: 1.2 });
}

export interface FrameSpec {
  color: number;
  /** Толщина бруса. */
  t?: number;
  /** Диагональные раскосы в простенках. */
  braces?: boolean;
  /** Высоты горизонтальных ригелей (абсолютные). */
  rails?: number[];
}

/**
 * Фахверк на фасаде вдоль X (наружу +Z при out=1). Стойки — по краям и между окнами.
 * openings — проёмы (a..b вдоль стены, y0..y1 абсолютные) — брус обходит их обрамлением.
 */
export function timberFrameX(
  b: ModelBuilder,
  zc: number,
  out: 1 | -1,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  openings: { a: number; b: number; y0: number; y1: number }[],
  f: FrameSpec,
  wallT: number,
): void {
  const t = f.t ?? 0.16;
  const z = zc + out * (wallT / 2 + 0.035);
  const fo: PartOptions = { mat: 'woodgrain', color: f.color, jitter: 0.04 };
  // Нижний и верхний брус.
  b.chamferBox([x1 - x0 + t, t, 0.07], [(x0 + x1) / 2, y0 + t / 2, z], 0.02, fo);
  b.chamferBox([x1 - x0 + t, t, 0.07], [(x0 + x1) / 2, y1 - t / 2, z], 0.02, fo);
  for (const ry of f.rails ?? []) {
    // Ригель прерывается на проёмах.
    let cur = x0;
    const ops = openings.filter((o) => o.y0 < ry && o.y1 > ry).sort((a, c) => a.a - c.a);
    for (const o of ops) {
      if (o.a - 0.1 > cur) b.chamferBox([o.a - 0.1 - cur, t * 0.85, 0.06], [(cur + o.a - 0.1) / 2, ry, z], 0.02, fo);
      cur = o.b + 0.1;
    }
    if (x1 > cur) b.chamferBox([x1 - cur, t * 0.85, 0.06], [(cur + x1) / 2, ry, z], 0.02, fo);
  }
  // Стойки: края + около проёмов.
  const posts = new Set<number>([x0, x1]);
  for (const o of openings) {
    posts.add(+(o.a - 0.12).toFixed(2));
    posts.add(+(o.b + 0.12).toFixed(2));
  }
  const sorted = [...posts].filter((x) => x >= x0 - 0.01 && x <= x1 + 0.01).sort((a, c) => a - c);
  for (const x of sorted) {
    // Не ставим стойку внутрь проёма.
    if (openings.some((o) => x > o.a && x < o.b)) continue;
    b.chamferBox([t, y1 - y0, 0.075], [x, (y0 + y1) / 2, z + out * 0.003], 0.02, fo);
  }
  // Раскосы в широких простенках.
  if (f.braces) {
    for (let i = 0; i < sorted.length - 1; i++) {
      const a = sorted[i]!;
      const c = sorted[i + 1]!;
      if (c - a < 0.9) continue;
      if (openings.some((o) => o.a < c && o.b > a)) continue;
      const ya = y0 + t;
      const yb = y1 - t;
      b.plankBetween([a + t / 2, ya, z], [c - t / 2, yb, z], t * 0.8, 0.06, fo, [0, 0, 1]);
    }
  }
}

export function timberFrameZ(
  b: ModelBuilder,
  xc: number,
  out: 1 | -1,
  z0: number,
  z1: number,
  y0: number,
  y1: number,
  openings: { a: number; b: number; y0: number; y1: number }[],
  f: FrameSpec,
  wallT: number,
): void {
  // Поворачиваем систему: ось стены → X.
  b.at([xc, 0, 0], [0, (out > 0 ? 1 : -1) * (Math.PI / 2), 0], () => {
    const flip = out > 0 ? -1 : 1;
    const ops = openings.map((o) => ({ a: Math.min(o.a * flip, o.b * flip), b: Math.max(o.a * flip, o.b * flip), y0: o.y0, y1: o.y1 }));
    timberFrameX(b, 0, 1, Math.min(z0 * flip, z1 * flip), Math.max(z0 * flip, z1 * flip), y0, y1, ops, f, wallT);
  });
}

export interface ChunkyWindowStyle {
  frame: number;
  shutters?: number | null;
  flowers?: boolean;
  bars?: [number, number];
  glass?: string;
  /** Открытые ставни раскрыты под углом. */
  shutterAngle?: number;
}

/**
 * Массивное окно на стене вдоль X (наружу +Z при out=1): толстая рама с фаской, переплёт,
 * подоконник, ставни из досок, ящик с цветами.
 */
export function chunkyWindowX(b: ModelBuilder, cx: number, zc: number, wallT: number, out: 1 | -1, w: number, y0: number, y1: number, st: ChunkyWindowStyle): void {
  const h = y1 - y0;
  const cy = (y0 + y1) / 2;
  const fr: PartOptions = { mat: 'woodgrain', color: st.frame };
  const zf = zc + out * (wallT / 2 + 0.03);
  b.box([w, h, 0.03], [cx, cy, zc + out * 0.02], { mat: st.glass ?? 'window', color: P.windowDark, noShadow: true });
  const ft = 0.11;
  b.chamferBox([w + ft * 2, ft, 0.09], [cx, y1 + ft / 2, zf], 0.02, fr);
  b.chamferBox([ft, h, 0.09], [cx - w / 2 - ft / 2, cy, zf], 0.02, fr);
  b.chamferBox([ft, h, 0.09], [cx + w / 2 + ft / 2, cy, zf], 0.02, fr);
  b.chamferBox([w + ft * 2 + 0.12, 0.08, 0.2], [cx, y0 - 0.04, zc + out * (wallT / 2 + 0.08)], 0.02, fr);
  // Откосы (чтобы стекло не «висело»).
  b.box([w, 0.05, wallT], [cx, y1 - 0.025, zc], fr);
  b.box([w, 0.05, wallT], [cx, y0 + 0.025, zc], fr);
  b.box([0.05, h, wallT], [cx - w / 2 + 0.025, cy, zc], fr);
  b.box([0.05, h, wallT], [cx + w / 2 - 0.025, cy, zc], fr);
  const [nv, nh] = st.bars ?? [1, 1];
  const zb = zc + out * 0.04;
  for (let i = 1; i <= nv; i++) b.box([0.06, h, 0.05], [cx - w / 2 + (w * i) / (nv + 1), cy, zb], fr);
  for (let i = 1; i <= nh; i++) b.box([w, 0.06, 0.05], [cx, y0 + (h * i) / (nh + 1), zb], fr);
  if (st.shutters) {
    const sw = w / 2 + 0.02;
    for (const side of [-1, 1] as const) {
      const hingeX = cx + side * (w / 2 + ft);
      const ang = side * (st.shutterAngle ?? 0.15);
      b.at([hingeX, cy, zf + out * 0.03], [0, out > 0 ? ang : -ang, 0], () => {
        b.chamferBox([sw, h + 0.04, 0.05], [side * (sw / 2), 0, 0], 0.012, { mat: 'wood', color: st.shutters!, uvScale: 0.45 });
        // Поперечины ставни.
        b.box([sw - 0.08, 0.07, 0.03], [side * (sw / 2), h * 0.28, out * 0.035], { mat: 'woodgrain', color: shade(st.shutters!, 0.85) });
        b.box([sw - 0.08, 0.07, 0.03], [side * (sw / 2), -h * 0.28, out * 0.035], { mat: 'woodgrain', color: shade(st.shutters!, 0.85) });
      });
    }
  }
  if (st.flowers) {
    const fz = zc + out * (wallT / 2 + 0.2);
    b.chamferBox([w + 0.2, 0.2, 0.24], [cx, y0 - 0.2, fz], 0.03, { mat: 'wood', color: 0x7a5434, uvScale: 0.5 });
    const n = Math.max(4, Math.round(w / 0.18));
    const cols = [0xe0565b, 0xf2c94c, 0xf6f2ea, 0xc86bd6, 0xf08a4b];
    for (let i = 0; i < n; i++) {
      const px = cx - w / 2 + ((i + 0.5) * w) / n;
      b.ico(0.12, 0, [px, y0 - 0.04, fz], { mat: 'foliageStatic', color: i % 2 ? P.leaf : P.leafDark, faceJitter: 0.12, ao: 0.3 }, [1.1, 0.75, 1]);
      b.ico(0.055, 0, [px + (b.rng.next() - 0.5) * 0.06, y0 + 0.05, fz + (b.rng.next() - 0.5) * 0.08], { color: cols[(i + Math.floor(cx * 3)) % cols.length]!, noShadow: true });
    }
  }
}

export function chunkyWindowZ(b: ModelBuilder, cz: number, xc: number, wallT: number, out: 1 | -1, w: number, y0: number, y1: number, st: ChunkyWindowStyle): void {
  b.at([xc, 0, cz], [0, out > 0 ? Math.PI / 2 : -Math.PI / 2, 0], () => chunkyWindowX(b, 0, 0, wallT, 1, w, y0, y1, st));
}

/** Дощатая дверь (полотно): пивот на петле (x=0), полотно в +X, лицо в +Z. */
export function plankDoor(b: ModelBuilder, w: number, h: number, color: number, window = false): void {
  const t = 0.06;
  const n = Math.max(3, Math.round(w / 0.16));
  const pw = w / n;
  for (let i = 0; i < n; i++) {
    b.chamferBox([pw - 0.008, h, t], [pw * (i + 0.5), h / 2, 0], 0.01, { mat: 'woodgrain', color: shade(color, 1 + ((i * 37) % 7) * 0.012 - 0.03) });
  }
  const brace: PartOptions = { mat: 'woodgrain', color: shade(color, 0.82) };
  for (const s of [-1, 1]) {
    b.box([w - 0.08, 0.1, 0.03], [w / 2, h * 0.22, s * (t / 2 + 0.012)], brace);
    b.box([w - 0.08, 0.1, 0.03], [w / 2, h * 0.78, s * (t / 2 + 0.012)], brace);
  }
  b.plankBetween([0.08, h * 0.25, t / 2 + 0.014], [w - 0.08, h * 0.75, t / 2 + 0.014], 0.09, 0.025, brace, [0, 0, 1]);
  if (window) {
    b.box([w * 0.5, h * 0.22, 0.02], [w / 2, h * 0.82, 0], { mat: 'window', color: P.windowDark, noShadow: true });
    b.box([w * 0.56, 0.05, 0.08], [w / 2, h * 0.82 + h * 0.11, 0], brace);
    b.box([w * 0.56, 0.05, 0.08], [w / 2, h * 0.82 - h * 0.11, 0], brace);
  }
  const iron: PartOptions = { mat: 'metal', color: P.iron, noShadow: true };
  for (const y of [h * 0.22, h * 0.78]) b.box([0.32, 0.04, 0.015], [0.18, y, t / 2 + 0.03], iron);
  b.torus(0.045, 0.01, 4, 8, [w - 0.13, h * 0.5, t / 2 + 0.04], iron);
  b.sphere(0.025, 6, 4, [w - 0.13, h * 0.5 + 0.06, t / 2 + 0.03], iron);
}

/** Дверной проём с массивными наличниками и козырьком. */
export function chunkyDoorX(b: ModelBuilder, cx: number, zc: number, wallT: number, out: 1 | -1, w: number, base: number, h: number, frame: number, leafColor: number | null, opts: { canopy?: number | null; lantern?: boolean; step?: boolean; glass?: boolean } = {}): void {
  const fr: PartOptions = { mat: 'woodgrain', color: frame };
  const zf = zc + out * (wallT / 2 + 0.04);
  b.chamferBox([w + 0.34, 0.16, 0.1], [cx, base + h + 0.08, zf], 0.025, fr);
  b.chamferBox([0.15, h, 0.1], [cx - w / 2 - 0.075, base + h / 2, zf], 0.025, fr);
  b.chamferBox([0.15, h, 0.1], [cx + w / 2 + 0.075, base + h / 2, zf], 0.025, fr);
  b.box([w, 0.05, wallT + 0.02], [cx, base + h - 0.025, zc], fr);
  b.box([0.05, h, wallT + 0.02], [cx - w / 2 + 0.025, base + h / 2, zc], fr);
  b.box([0.05, h, wallT + 0.02], [cx + w / 2 - 0.025, base + h / 2, zc], fr);
  if (leafColor !== null) {
    b.at([cx - w / 2 + 0.01, base, zc + out * 0.005], [0, out > 0 ? 0 : Math.PI, 0], () => {
      if (out > 0) plankDoor(b, w - 0.02, h - 0.02, leafColor, opts.glass);
      else b.at([-(w - 0.02), 0, 0], undefined, () => plankDoor(b, w - 0.02, h - 0.02, leafColor, opts.glass));
    });
  }
  if (opts.step !== false) b.chamferBox([w + 0.7, Math.max(0.12, base), 0.6], [cx, Math.max(0.12, base) / 2, zc + out * (wallT / 2 + 0.3)], 0.03, { mat: 'stone', color: P.stoneLight, uvScale: 0.8 });
  if (opts.canopy) {
    const cy = base + h + 0.45;
    const dep = 0.9;
    b.box([w + 0.9, 0.08, dep], [cx, cy, zc + out * (wallT / 2 + dep / 2)], { mat: 'roofRow', color: opts.canopy, uvScale: 1.3 }, [out * 0.32, 0, 0]);
    for (const sx of [-1, 1]) {
      b.plankBetween([cx + sx * (w / 2 + 0.32), cy - 0.45, zc + out * (wallT / 2 + 0.05)], [cx + sx * (w / 2 + 0.32), cy - 0.05, zc + out * (wallT / 2 + dep - 0.15)], 0.08, 0.08, fr, [0, 1, 0]);
    }
  }
  if (opts.lantern) wallLantern(b, cx + w / 2 + 0.45, base + h * 0.82, zc + out * (wallT / 2), out);
}

/** Настенный фонарь (светится ночью). */
export function wallLantern(b: ModelBuilder, x: number, y: number, z: number, out: 1 | -1): void {
  const iron: PartOptions = { mat: 'metal', color: P.iron, noShadow: true };
  b.box([0.05, 0.05, 0.22], [x, y + 0.2, z + out * 0.11], iron);
  b.box([0.08, 0.12, 0.03], [x, y + 0.18, z + out * 0.015], iron);
  b.box([0.17, 0.04, 0.17], [x, y + 0.12, z + out * 0.22], iron);
  b.box([0.13, 0.2, 0.13], [x, y, z + out * 0.22], { mat: 'emissive', color: P.lampWarm, noShadow: true });
  b.cone(0.14, 0.12, 4, [x, y + 0.2, z + out * 0.22], iron, [0, Math.PI / 4, 0]);
  b.box([0.15, 0.03, 0.15], [x, y - 0.11, z + out * 0.22], iron);
  b.marker('lantern', [x, y, z + out * 0.3]);
}

/** Труба: каменное или кирпичное тело с карнизом и оголовком. */
export function styledChimney(b: ModelBuilder, x: number, z: number, y0: number, y1: number, color: number, mat: 'stone' | 'brick' | 'plaster' = 'stone', size = 0.6): void {
  b.chamferBox([size, y1 - y0, size], [x, (y0 + y1) / 2, z], 0.03, { mat, color, uvScale: mat === 'plaster' ? 2 : 0.9 });
  b.chamferBox([size + 0.14, 0.12, size + 0.14], [x, y1 + 0.02, z], 0.03, { mat: 'stone', color: P.stoneDark });
  b.chamferBox([size * 0.62, 0.2, size * 0.62], [x, y1 + 0.18, z], 0.03, { mat, color: shade(color, 0.9), uvScale: 0.9 });
  b.box([size * 0.4, 0.06, size * 0.4], [x, y1 + 0.3, z], { color: 0x2a2a2a });
}

export const _v = new THREE.Vector3();
