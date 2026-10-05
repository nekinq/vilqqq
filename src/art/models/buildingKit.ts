import type { ModelBuilder, PartOptions } from '../ModelKit';
import { P } from '../palette';

/**
 * Строительный набор: стены с проёмами, окна, двери, двускатные крыши, трубы.
 * Используется магазином, домами поставщиков и жилыми домами — единый стиль.
 */

export interface Opening {
  /** Начало и конец проёма вдоль стены. */
  a: number;
  b: number;
  /** Низ и верх проёма от основания стены. */
  y0: number;
  y1: number;
}

export interface WallStyle {
  ext: PartOptions;
  /** Внутренняя отделка: нижняя панель и верх. null — без отделки. */
  interior?: { lower: PartOptions; upper: PartOptions; split: number } | null;
}

interface Seg {
  a: number;
  b: number;
  y0: number;
  y1: number;
}

export function wallSegments(from: number, to: number, h: number, openings: readonly Opening[]): Seg[] {
  const ops = [...openings].sort((p, q) => p.a - q.a);
  const out: Seg[] = [];
  let cur = from;
  for (const o of ops) {
    if (o.a > cur + 1e-4) out.push({ a: cur, b: o.a, y0: 0, y1: h });
    if (o.y0 > 1e-4) out.push({ a: o.a, b: o.b, y0: 0, y1: o.y0 });
    if (o.y1 < h - 1e-4) out.push({ a: o.a, b: o.b, y0: o.y1, y1: h });
    cur = Math.max(cur, o.b);
  }
  if (cur < to - 1e-4) out.push({ a: cur, b: to, y0: 0, y1: h });
  return out;
}

/**
 * Стена вдоль оси X (фасад/задняя): центр стены по Z = zc, наружу — сторона `out` (+1: +Z).
 */
export function wallAlongX(
  b: ModelBuilder,
  zc: number,
  x0: number,
  x1: number,
  base: number,
  h: number,
  T: number,
  out: 1 | -1,
  openings: readonly Opening[],
  style: WallStyle,
): void {
  for (const s of wallSegments(x0, x1, h, openings)) {
    const w = s.b - s.a;
    const cx = (s.a + s.b) / 2;
    b.box([w, s.y1 - s.y0, T], [cx, base + (s.y0 + s.y1) / 2, zc], style.ext);
    const inn = style.interior;
    if (inn) {
      const zi = zc - out * (T / 2 + 0.011);
      const lo: [number, number] = [s.y0, Math.min(s.y1, inn.split)];
      const up: [number, number] = [Math.max(s.y0, inn.split), s.y1];
      if (lo[1] > lo[0] + 1e-3) b.box([w, lo[1] - lo[0], 0.02], [cx, base + (lo[0] + lo[1]) / 2, zi], inn.lower);
      if (up[1] > up[0] + 1e-3) b.box([w, up[1] - up[0], 0.02], [cx, base + (up[0] + up[1]) / 2, zi], inn.upper);
    }
  }
}

/** Стена вдоль оси Z (боковая): центр по X = xc, наружу — сторона `out` (+1: +X). */
export function wallAlongZ(
  b: ModelBuilder,
  xc: number,
  z0: number,
  z1: number,
  base: number,
  h: number,
  T: number,
  out: 1 | -1,
  openings: readonly Opening[],
  style: WallStyle,
): void {
  for (const s of wallSegments(z0, z1, h, openings)) {
    const w = s.b - s.a;
    const cz = (s.a + s.b) / 2;
    b.box([T, s.y1 - s.y0, w], [xc, base + (s.y0 + s.y1) / 2, cz], style.ext);
    const inn = style.interior;
    if (inn) {
      const xi = xc - out * (T / 2 + 0.011);
      const lo: [number, number] = [s.y0, Math.min(s.y1, inn.split)];
      const up: [number, number] = [Math.max(s.y0, inn.split), s.y1];
      if (lo[1] > lo[0] + 1e-3) b.box([0.02, lo[1] - lo[0], w], [xi, base + (lo[0] + lo[1]) / 2, cz], inn.lower);
      if (up[1] > up[0] + 1e-3) b.box([0.02, up[1] - up[0], w], [xi, base + (up[0] + up[1]) / 2, cz], inn.upper);
    }
  }
}

export interface WindowStyle {
  frame: number;
  inner?: number | null;
  glassMat?: string;
  /** Переплёт: число вертикальных и горизонтальных перемычек. */
  bars?: [number, number];
  sill?: number;
  shutters?: number | null;
  flowerBox?: boolean;
}

/**
 * Окно в стене вдоль X. cx — центр по X, zc — центр стены, out — наружная сторона.
 * y0..y1 — абсолютные высоты низа и верха проёма.
 */
export function windowX(b: ModelBuilder, cx: number, zc: number, T: number, out: 1 | -1, w: number, y0: number, y1: number, st: WindowStyle): void {
  const h = y1 - y0;
  const cy = (y0 + y1) / 2;
  const fr: PartOptions = { mat: 'woodgrain', color: st.frame };
  const ze = zc + out * (T / 2 + 0.025);
  // Стекло.
  b.box([w, h, 0.02], [cx, cy, zc], { mat: st.glassMat ?? 'glass', color: P.windowDark, noShadow: true });
  // Наличник снаружи.
  b.box([w + 0.24, 0.12, 0.05], [cx, y1 + 0.06, ze], fr);
  b.box([0.12, h, 0.05], [cx - w / 2 - 0.06, cy, ze], fr);
  b.box([0.12, h, 0.05], [cx + w / 2 + 0.06, cy, ze], fr);
  b.box([w + 0.34, 0.07, 0.16], [cx, y0 - 0.035, zc + out * (T / 2 + 0.06)], { mat: 'woodgrain', color: st.sill ?? st.frame });
  // Рама по периметру проёма.
  b.box([w, 0.06, T * 0.6], [cx, y1 - 0.03, zc], fr);
  b.box([w, 0.06, T * 0.6], [cx, y0 + 0.03, zc], fr);
  b.box([0.06, h, T * 0.6], [cx - w / 2 + 0.03, cy, zc], fr);
  b.box([0.06, h, T * 0.6], [cx + w / 2 - 0.03, cy, zc], fr);
  // Переплёт.
  const [nv, nh] = st.bars ?? [1, 1];
  for (let i = 1; i <= nv; i++) b.box([0.05, h, 0.05], [cx - w / 2 + (w * i) / (nv + 1), cy, zc], fr);
  for (let i = 1; i <= nh; i++) b.box([w, 0.05, 0.05], [cx, y0 + (h * i) / (nh + 1), zc], fr);
  // Внутренний наличник и подоконник.
  if (st.inner !== null && st.inner !== undefined) {
    const zi = zc - out * (T / 2 + 0.03);
    const io: PartOptions = { mat: 'woodgrain', color: st.inner };
    b.box([w + 0.2, 0.1, 0.04], [cx, y1 + 0.05, zi], io);
    b.box([0.1, h, 0.04], [cx - w / 2 - 0.05, cy, zi], io);
    b.box([0.1, h, 0.04], [cx + w / 2 + 0.05, cy, zi], io);
    b.box([w + 0.24, 0.04, 0.2], [cx, y0 - 0.02, zc - out * (T / 2 + 0.06)], io);
  }
  if (st.shutters) {
    for (const s of [-1, 1]) {
      const sx = cx + s * (w / 2 + 0.12 + w * 0.26);
      b.box([w * 0.48, h + 0.06, 0.04], [sx, cy, ze + out * 0.01], { mat: 'wood', color: st.shutters, uvScale: 0.5 });
    }
  }
  if (st.flowerBox) flowerBox(b, cx, y0 - 0.12, zc + out * (T / 2 + 0.16), w + 0.1, 'x');
}

/** Окно в стене вдоль Z. */
export function windowZ(b: ModelBuilder, cz: number, xc: number, T: number, out: 1 | -1, w: number, y0: number, y1: number, st: WindowStyle): void {
  b.at([xc, 0, cz], [0, (out > 0 ? 1 : -1) * Math.PI / 2, 0], () => windowX(b, 0, 0, T, 1, w, y0, y1, st));
}

/** Ящик с цветами под окном. */
export function flowerBox(b: ModelBuilder, cx: number, y: number, cz: number, len: number, axis: 'x' | 'z'): void {
  const along = (l: number, h: number, d: number): [number, number, number] => (axis === 'x' ? [l, h, d] : [d, h, l]);
  b.box(along(len, 0.18, 0.22), [cx, y, cz], { mat: 'wood', color: P.woodDark, uvScale: 0.5 });
  const n = Math.max(3, Math.round(len / 0.22));
  const cols = [0xe0565b, 0xf2c94c, 0xf4f1ea, 0xc86bd6, 0xf08a4b];
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n - 0.5;
    const px = axis === 'x' ? cx + t * len : cx;
    const pz = axis === 'x' ? cz : cz + t * len;
    b.ico(0.11, 0, [px, y + 0.14, pz], { mat: 'foliageStatic', color: P.leafDark, faceJitter: 0.12 }, [1.1, 0.8, 1], undefined, 0.15);
    b.ico(0.055, 0, [px + (b.rng.next() - 0.5) * 0.08, y + 0.22, pz + (b.rng.next() - 0.5) * 0.08], { color: cols[i % cols.length], noShadow: true });
  }
}

/**
 * Дверной проём с наличниками в стене вдоль X. Возвращает ничего — полотно добавляется узлом.
 */
export function doorFrameX(b: ModelBuilder, cx: number, zc: number, T: number, out: 1 | -1, w: number, base: number, h: number, frame: number, inner: number | null): void {
  const fr: PartOptions = { mat: 'woodgrain', color: frame };
  const ze = zc + out * (T / 2 + 0.03);
  b.box([w + 0.3, 0.14, 0.06], [cx, base + h + 0.07, ze], fr);
  b.box([0.14, h, 0.06], [cx - w / 2 - 0.07, base + h / 2, ze], fr);
  b.box([0.14, h, 0.06], [cx + w / 2 + 0.07, base + h / 2, ze], fr);
  // Откосы.
  b.box([w, 0.06, T + 0.02], [cx, base + h - 0.03, zc], fr);
  b.box([0.06, h, T + 0.02], [cx - w / 2 + 0.03, base + h / 2, zc], fr);
  b.box([0.06, h, T + 0.02], [cx + w / 2 - 0.03, base + h / 2, zc], fr);
  // Порог.
  b.box([w + 0.1, 0.03, T + 0.1], [cx, base + 0.015, zc], { mat: 'woodgrain', color: P.woodDark });
  if (inner !== null) {
    const zi = zc - out * (T / 2 + 0.03);
    const io: PartOptions = { mat: 'woodgrain', color: inner };
    b.box([w + 0.26, 0.12, 0.05], [cx, base + h + 0.06, zi], io);
    b.box([0.12, h, 0.05], [cx - w / 2 - 0.06, base + h / 2, zi], io);
    b.box([0.12, h, 0.05], [cx + w / 2 + 0.06, base + h / 2, zi], io);
  }
}

export function doorFrameZ(b: ModelBuilder, cz: number, xc: number, T: number, out: 1 | -1, w: number, base: number, h: number, frame: number, inner: number | null): void {
  b.at([xc, 0, cz], [0, (out > 0 ? 1 : -1) * Math.PI / 2, 0], () => doorFrameX(b, 0, 0, T, 1, w, base, h, frame, inner));
}

/**
 * Полотно двери: пивот на петле (x=0), полотно уходит в +X на ширину w, лицо в +Z.
 * glass — доля высоты под стеклом (0 — глухая).
 */
export function doorLeaf(b: ModelBuilder, w: number, h: number, color: number, glass: number, handleSide: 1 | -1 = 1): void {
  const t = 0.05;
  const fr: PartOptions = { mat: 'woodgrain', color };
  // Обвязка.
  b.box([w, 0.12, t], [w / 2, h - 0.06, 0], fr);
  b.box([w, 0.16, t], [w / 2, 0.08, 0], fr);
  b.box([0.11, h, t], [0.055, h / 2, 0], fr);
  b.box([0.11, h, t], [w - 0.055, h / 2, 0], fr);
  const gTop = h - 0.12;
  const gBot = glass > 0 ? h - 0.12 - (h - 0.28) * glass : h - 0.12;
  // Нижняя филёнка.
  const panelH = gBot - 0.16 - (glass > 0 ? 0.08 : 0);
  if (panelH > 0.05) {
    b.box([w - 0.22, panelH, t * 0.6], [w / 2, 0.16 + panelH / 2, 0], { mat: 'wood', color, uvScale: 0.6 });
    b.box([w - 0.3, panelH - 0.12, t * 0.4], [w / 2, 0.16 + panelH / 2, t * 0.4], { mat: 'woodgrain', color });
  }
  if (glass > 0) {
    b.box([w, 0.08, t], [w / 2, gBot - 0.04, 0], fr);
    b.box([w - 0.22, gTop - gBot, 0.015], [w / 2, (gTop + gBot) / 2, 0], { mat: 'glass', noShadow: true });
    b.box([0.04, gTop - gBot, t * 0.8], [w / 2, (gTop + gBot) / 2, 0], fr);
    b.box([w - 0.22, 0.04, t * 0.8], [w / 2, (gTop + gBot) / 2, 0], fr);
  }
  // Ручки с обеих сторон.
  const hx = handleSide > 0 ? w - 0.12 : 0.12;
  for (const s of [-1, 1]) {
    b.box([0.04, 0.2, 0.03], [hx, 1.0, s * (t / 2 + 0.035)], { mat: 'metal', color: P.sun, noShadow: true });
    b.box([0.03, 0.03, 0.04], [hx, 1.06, s * (t / 2 + 0.015)], { mat: 'metal', color: P.sun, noShadow: true });
  }
}

export interface GableRoofSpec {
  /** Ширина дома по X (между наружными стенами) и длина по Z. */
  w: number;
  d: number;
  /** Высота верха стен. */
  eaveY: number;
  pitchDeg: number;
  overhangSide: number;
  overhangEnd: number;
  thick?: number;
  color: number;
  /** Конёк вдоль Z (по умолчанию) или вдоль X. */
  ridgeAlong?: 'z' | 'x';
  gableColor?: number;
  gableMat?: string;
  fascia?: number | null;
  /** Заполнить фронтоны (треугольники) стеной. */
  gables?: boolean;
  /** Толщина стены фронтона (совпадает с толщиной стен дома). */
  wallT?: number;
}

/** Двускатная крыша с фронтонами. Возвращает высоту конька. */
export function gableRoof(b: ModelBuilder, s: GableRoofSpec, cx = 0, cz = 0): number {
  const along = s.ridgeAlong ?? 'z';
  const halfSpan = (along === 'z' ? s.w : s.d) / 2;
  const len = (along === 'z' ? s.d : s.w) + 2 * s.overhangEnd;
  const tan = Math.tan((s.pitchDeg * Math.PI) / 180);
  const cos = Math.cos((s.pitchDeg * Math.PI) / 180);
  const rise = halfSpan * tan;
  const ridgeY = s.eaveY + rise;
  const run = halfSpan + s.overhangSide;
  const slopeLen = run / cos + 0.02;
  const th = s.thick ?? 0.14;
  const ang = (s.pitchDeg * Math.PI) / 180;
  const rot = along === 'z' ? 0 : Math.PI / 2;
  b.at([cx, 0, cz], [0, rot, 0], () => {
    for (const side of [-1, 1] as const) {
      // Центр ската: середина между коньком и свесом.
      const mx = (side * run) / 2;
      const my = ridgeY - (run / 2) * tan + th / 2 / cos;
      b.box([slopeLen, th, len], [mx, my, 0], { mat: 'roof', color: s.color, uvScale: 2.2, uvSwap: false }, [0, 0, -side * ang]);
      // Подшивка снизу.
      b.box([slopeLen, 0.03, len - 0.02], [mx, my - th / 2 / cos - 0.02, 0], { mat: 'wood', color: P.woodDark, uvScale: 0.8, noShadow: true }, [0, 0, -side * ang]);
      // Лобовая доска по свесу.
      if (s.fascia !== null) {
        const ex = side * run;
        const ey = ridgeY - run * tan;
        b.box([0.05, 0.22, len], [ex + side * 0.02, ey - 0.02, 0], { mat: 'woodgrain', color: s.fascia ?? P.green });
      }
    }
    // Конёк.
    b.box([0.34, 0.12, len + 0.02], [0, ridgeY + th / cos + 0.02, 0], { mat: 'roof', color: shade(s.color, 0.85), uvScale: 1.2 });
    // Ветровые доски по фронтонам.
    if (s.fascia !== null) {
      for (const end of [-1, 1] as const) {
        const z = end * (len / 2 + 0.02);
        for (const side of [-1, 1] as const) {
          b.box([slopeLen, 0.24, 0.05], [(side * run) / 2, ridgeY - (run / 2) * tan + 0.02, z], { mat: 'woodgrain', color: s.fascia ?? P.green }, [0, 0, -side * ang]);
        }
      }
    }
    if (s.gables !== false) {
      const gd = (along === 'z' ? s.d : s.w);
      for (const end of [-1, 1] as const) {
        b.prism(halfSpan * 2, rise, s.wallT ?? 0.2, [0, s.eaveY - 0.001, end * (gd / 2)], s.gableMat ? { mat: s.gableMat, color: s.gableColor ?? P.plaster } : { mat: 'plaster', color: s.gableColor ?? P.plaster });
      }
    }
  });
  return ridgeY;
}

/** Труба (кирпич/камень) с оголовком. */
export function chimney(b: ModelBuilder, x: number, z: number, y0: number, y1: number, mat: 'brick' | 'stone', color: number, size = 0.55): void {
  b.box([size, y1 - y0, size], [x, (y0 + y1) / 2, z], { mat, color, uvScale: 0.9 });
  b.box([size + 0.12, 0.1, size + 0.12], [x, y1 + 0.05, z], { mat: 'stone', color: P.stoneDark });
  b.box([size * 0.5, 0.18, size * 0.5], [x, y1 + 0.19, z], { mat: 'flat', color: P.iron });
}

export function shade(color: number, k: number): number {
  const r = Math.min(255, Math.round(((color >> 16) & 255) * k));
  const g = Math.min(255, Math.round(((color >> 8) & 255) * k));
  const bl = Math.min(255, Math.round((color & 255) * k));
  return (r << 16) | (g << 8) | bl;
}
