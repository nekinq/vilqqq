import * as THREE from 'three';
import { Rng, fbm } from '../core/rng';

/**
 * Процедурные текстуры на canvas: ноль загрузок, бесшовный тайлинг.
 * «Детальные» текстуры (доски, черепица, камень, штукатурка) — светлые и почти серые:
 * цвет задаёт вершинный цвет модели, текстура добавляет фактуру.
 */

export type Ctx = CanvasRenderingContext2D;

export function makeCanvas(w: number, h = w): { c: HTMLCanvasElement; g: Ctx } {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d', { willReadFrequently: false })!;
  return { c, g };
}

export function toTexture(c: HTMLCanvasElement, opts: { repeat?: boolean; srgb?: boolean; anisotropy?: number; mipmaps?: boolean } = {}): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  if (opts.repeat !== false) {
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
  }
  t.colorSpace = opts.srgb === false ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  t.anisotropy = opts.anisotropy ?? 4;
  t.generateMipmaps = opts.mipmaps !== false;
  t.minFilter = opts.mipmaps === false ? THREE.LinearFilter : THREE.LinearMipmapLinearFilter;
  t.needsUpdate = true;
  return t;
}

function gray(v: number, a = 1): string {
  const c = Math.max(0, Math.min(255, Math.round(v * 255)));
  return a >= 1 ? `rgb(${c},${c},${c})` : `rgba(${c},${c},${c},${a})`;
}

function rgb(r: number, g: number, b: number, a = 1): string {
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return `rgba(${f(r)},${f(g)},${f(b)},${a})`;
}

/** Рисует fn с повтором по краям (бесшовность). */
function wrapDraw(size: number, x: number, y: number, r: number, fn: (x: number, y: number) => void): void {
  fn(x, y);
  if (x - r < 0) fn(x + size, y);
  if (x + r > size) fn(x - size, y);
  if (y - r < 0) fn(x, y + size);
  if (y + r > size) fn(x, y - size);
  if (x - r < 0 && y - r < 0) fn(x + size, y + size);
  if (x + r > size && y + r > size) fn(x - size, y - size);
  if (x - r < 0 && y + r > size) fn(x + size, y - size);
  if (x + r > size && y - r < 0) fn(x - size, y + size);
}

/** Шумовая подложка: мягкие пятна яркости. */
function noiseLayer(g: Ctx, size: number, scale: number, amp: number, seed: number, alpha = 1): void {
  const img = g.getImageData(0, 0, size, size);
  const d = img.data;
  const off = seed * 13.37;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Бесшовный шум: усредняем по тору через смешивание четырёх сдвигов.
      const u = x / size;
      const v = y / size;
      const n00 = fbm(u * scale + off, v * scale + off, 3);
      const n10 = fbm((u - 1) * scale + off, v * scale + off, 3);
      const n01 = fbm(u * scale + off, (v - 1) * scale + off, 3);
      const n11 = fbm((u - 1) * scale + off, (v - 1) * scale + off, 3);
      const n = n00 * (1 - u) * (1 - v) + n10 * u * (1 - v) + n01 * (1 - u) * v + n11 * u * v;
      const k = 1 + (n - 0.5) * 2 * amp * alpha;
      const i = (y * size + x) * 4;
      d[i] = d[i]! * k;
      d[i + 1] = d[i + 1]! * k;
      d[i + 2] = d[i + 2]! * k;
    }
  }
  g.putImageData(img, 0, 0);
}

/** Вертикальные доски с нащельниками (стены магазина, полы, заборы). 4 доски на тайл. */
export function planksTexture(seed = 1, boards = 4, size = 512): HTMLCanvasElement {
  const { c, g } = makeCanvas(size);
  const rng = new Rng(seed);
  const bw = size / boards;
  for (let i = 0; i < boards; i++) {
    const x0 = i * bw;
    const base = 0.9 + rng.range(-0.06, 0.05);
    g.fillStyle = gray(base);
    g.fillRect(x0, 0, bw, size);
    // Волокна.
    for (let k = 0; k < 26; k++) {
      const gx = x0 + rng.range(4, bw - 4);
      const shade = rng.range(-0.1, 0.06);
      g.strokeStyle = gray(base + shade, 0.55);
      g.lineWidth = rng.range(0.8, 2.2);
      g.beginPath();
      const amp = rng.range(1, 4);
      const freq = rng.range(0.008, 0.02);
      const ph = rng.range(0, 6.28);
      for (let y = 0; y <= size; y += 8) {
        const x = gx + Math.sin(y * freq + ph) * amp;
        if (y === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke();
    }
    // Сучки.
    if (rng.chance(0.55)) {
      const ky = rng.range(20, size - 20);
      const kx = x0 + rng.range(bw * 0.25, bw * 0.75);
      const rx = rng.range(4, 8);
      const ry = rng.range(7, 13);
      g.fillStyle = gray(base - 0.22, 0.85);
      g.beginPath();
      g.ellipse(kx, ky, rx, ry, 0, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = gray(base - 0.1, 0.6);
      g.lineWidth = 1.5;
      g.beginPath();
      g.ellipse(kx, ky, rx + 3, ry + 5, 0, 0, Math.PI * 2);
      g.stroke();
    }
    // Стык досок по высоте.
    if (rng.chance(0.45)) {
      const jy = rng.range(30, size - 30);
      g.fillStyle = gray(base - 0.35, 0.9);
      g.fillRect(x0 + 2, jy, bw - 4, 2);
    }
    // Шов: тёмная щель и светлый край.
    g.fillStyle = gray(0.38);
    g.fillRect(x0, 0, 3, size);
    g.fillStyle = gray(base + 0.08, 0.7);
    g.fillRect(x0 + 3, 0, 2, size);
    g.fillStyle = gray(base - 0.12, 0.6);
    g.fillRect(x0 + bw - 4, 0, 4, size);
  }
  noiseLayer(g, size, 6, 0.06, seed);
  return c;
}

/** Древесина без швов (мебель, балки, столбы). */
export function woodgrainTexture(seed = 2, size = 256): HTMLCanvasElement {
  const { c, g } = makeCanvas(size);
  const rng = new Rng(seed);
  g.fillStyle = gray(0.9);
  g.fillRect(0, 0, size, size);
  for (let k = 0; k < 60; k++) {
    const gx = rng.range(0, size);
    g.strokeStyle = gray(0.9 + rng.range(-0.14, 0.04), 0.5);
    g.lineWidth = rng.range(0.6, 2);
    g.beginPath();
    const amp = rng.range(1, 5);
    const ph = rng.range(0, 6.28);
    for (let y = 0; y <= size; y += 4) {
      const x = gx + Math.sin((y / size) * Math.PI * 2 * rng.int(1, 2) + ph) * amp;
      if (y === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
  }
  noiseLayer(g, size, 4, 0.05, seed);
  return c;
}

/** Черепица/дранка рядами со смещением. */
export function shinglesTexture(seed = 3, rows = 10, perRow = 8, size = 512): HTMLCanvasElement {
  const { c, g } = makeCanvas(size);
  const rng = new Rng(seed);
  const rh = size / rows;
  const sw = size / perRow;
  g.fillStyle = gray(0.45);
  g.fillRect(0, 0, size, size);
  for (let r = 0; r < rows; r++) {
    const y0 = r * rh;
    const off = (r % 2) * sw * 0.5;
    for (let k = -1; k <= perRow; k++) {
      const x0 = k * sw + off + rng.range(-3, 3);
      const b = 0.8 + rng.range(-0.1, 0.08);
      const w = sw - 3;
      // Тело черепицы со скруглённым низом.
      const grad = g.createLinearGradient(0, y0, 0, y0 + rh);
      grad.addColorStop(0, gray(b - 0.12));
      grad.addColorStop(0.75, gray(b));
      grad.addColorStop(1, gray(b + 0.04));
      g.fillStyle = grad;
      g.beginPath();
      const rad = Math.min(8, w / 4);
      g.moveTo(x0, y0);
      g.lineTo(x0 + w, y0);
      g.lineTo(x0 + w, y0 + rh - rad);
      g.quadraticCurveTo(x0 + w, y0 + rh, x0 + w - rad, y0 + rh);
      g.lineTo(x0 + rad, y0 + rh);
      g.quadraticCurveTo(x0, y0 + rh, x0, y0 + rh - rad);
      g.closePath();
      g.fill();
      // Тень от верхнего ряда.
      g.fillStyle = gray(0.25, 0.35);
      g.fillRect(x0, y0, w, 3);
    }
  }
  noiseLayer(g, size, 8, 0.07, seed);
  return c;
}

/** Ряд черепицы для ступенчатых крыш: вертикальные стыки плиток, разная яркость, без горизонталей. */
export function shingleRowTexture(seed = 15, tiles = 4, size = 256): HTMLCanvasElement {
  const { c, g } = makeCanvas(size);
  const rng = new Rng(seed);
  const tw = size / tiles;
  for (let i = 0; i < tiles; i++) {
    const b = 0.86 + rng.range(-0.08, 0.08);
    const grad = g.createLinearGradient(i * tw, 0, (i + 1) * tw, 0);
    grad.addColorStop(0, gray(b + 0.04));
    grad.addColorStop(0.85, gray(b));
    grad.addColorStop(1, gray(b - 0.1));
    g.fillStyle = grad;
    g.fillRect(i * tw, 0, tw, size);
    g.fillStyle = gray(0.42);
    g.fillRect(i * tw, 0, 3, size);
  }
  noiseLayer(g, size, 6, 0.06, seed);
  return c;
}

/** Брусчатка: скруглённые камни разного размера. */
export function cobbleTexture(seed = 4, cells = 7, size = 512, colored = false): HTMLCanvasElement {
  const { c, g } = makeCanvas(size);
  const rng = new Rng(seed);
  g.fillStyle = colored ? rgb(96, 88, 78) : gray(0.5);
  g.fillRect(0, 0, size, size);
  const cell = size / cells;
  for (let j = 0; j < cells; j++) {
    for (let i = 0; i < cells; i++) {
      const cx = (i + 0.5) * cell + rng.range(-cell * 0.12, cell * 0.12) + (j % 2) * cell * 0.5;
      const cy = (j + 0.5) * cell + rng.range(-cell * 0.12, cell * 0.12);
      const rx = cell * rng.range(0.38, 0.47);
      const ry = cell * rng.range(0.36, 0.45);
      const rot = rng.range(-0.4, 0.4);
      const b = rng.range(0.72, 0.95);
      const tv = rng.range(-6, 6);
      const tint = colored ? [tv + rng.range(-3, 3), tv + rng.range(-3, 3), tv + rng.range(-5, 2)] : [0, 0, 0];
      wrapDraw(size, cx % size, cy, cell, (x, y) => {
        g.save();
        g.translate(x, y);
        g.rotate(rot);
        const grad = g.createRadialGradient(-rx * 0.3, -ry * 0.35, 1, 0, 0, Math.max(rx, ry));
        if (colored) {
          const base = [176 * b + tint[0]!, 164 * b + tint[1]!, 148 * b + tint[2]!];
          grad.addColorStop(0, rgb(base[0]! + 14, base[1]! + 14, base[2]! + 12));
          grad.addColorStop(1, rgb(base[0]! - 30, base[1]! - 30, base[2]! - 28));
        } else {
          grad.addColorStop(0, gray(b + 0.06));
          grad.addColorStop(1, gray(b - 0.12));
        }
        g.fillStyle = grad;
        g.beginPath();
        g.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
        g.fill();
        g.restore();
      });
    }
  }
  noiseLayer(g, size, 10, 0.05, seed);
  return c;
}

/** Каменная кладка (фундаменты, трубы, бордюры). */
export function stoneWallTexture(seed = 5, size = 512): HTMLCanvasElement {
  const { c, g } = makeCanvas(size);
  const rng = new Rng(seed);
  g.fillStyle = gray(0.62);
  g.fillRect(0, 0, size, size);
  const rows = 6;
  const rh = size / rows;
  for (let r = 0; r < rows; r++) {
    let x = rng.range(-40, 0);
    while (x < size) {
      const w = rng.range(rh * 0.9, rh * 1.8);
      const b = rng.range(0.7, 0.95);
      const y0 = r * rh + 3;
      const h = rh - 6;
      wrapDraw(size, x + w / 2, y0 + h / 2, w, (cx, cy) => {
        const grad = g.createLinearGradient(0, cy - h / 2, 0, cy + h / 2);
        grad.addColorStop(0, gray(b + 0.06));
        grad.addColorStop(1, gray(b - 0.1));
        g.fillStyle = grad;
        g.beginPath();
        const rr = 10;
        const x0 = cx - w / 2 + 3;
        const x1 = cx + w / 2 - 3;
        const y0b = cy - h / 2;
        const y1 = cy + h / 2;
        g.moveTo(x0 + rr, y0b);
        g.lineTo(x1 - rr, y0b + rng.range(-2, 2));
        g.quadraticCurveTo(x1, y0b, x1, y0b + rr);
        g.lineTo(x1, y1 - rr);
        g.quadraticCurveTo(x1, y1, x1 - rr, y1);
        g.lineTo(x0 + rr, y1);
        g.quadraticCurveTo(x0, y1, x0, y1 - rr);
        g.lineTo(x0, y0b + rr);
        g.quadraticCurveTo(x0, y0b, x0 + rr, y0b);
        g.fill();
      });
      x += w;
    }
  }
  noiseLayer(g, size, 8, 0.08, seed);
  return c;
}

/** Кирпич. */
export function brickTexture(seed = 6, size = 512): HTMLCanvasElement {
  const { c, g } = makeCanvas(size);
  const rng = new Rng(seed);
  g.fillStyle = gray(0.92);
  g.fillRect(0, 0, size, size);
  const rows = 12;
  const perRow = 4;
  const rh = size / rows;
  const bw = size / perRow;
  for (let r = 0; r < rows; r++) {
    const off = (r % 2) * bw * 0.5;
    for (let k = -1; k <= perRow; k++) {
      const b = rng.range(0.66, 0.86);
      g.fillStyle = gray(b);
      g.fillRect(k * bw + off + 3, r * rh + 3, bw - 6, rh - 6);
    }
  }
  noiseLayer(g, size, 10, 0.08, seed);
  return c;
}

/** Штукатурка: очень мягкие пятна. */
export function plasterTexture(seed = 7, size = 256): HTMLCanvasElement {
  const { c, g } = makeCanvas(size);
  g.fillStyle = gray(0.93);
  g.fillRect(0, 0, size, size);
  noiseLayer(g, size, 5, 0.05, seed);
  noiseLayer(g, size, 24, 0.025, seed + 1);
  return c;
}

/** Ткань (тенты, одежда крупным планом). */
export function fabricTexture(seed = 8, size = 128): HTMLCanvasElement {
  const { c, g } = makeCanvas(size);
  g.fillStyle = gray(0.92);
  g.fillRect(0, 0, size, size);
  g.strokeStyle = gray(0.84, 0.5);
  for (let i = 0; i < size; i += 3) {
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i, size);
    g.stroke();
  }
  noiseLayer(g, size, 6, 0.04, seed);
  return c;
}

/** Полосатый тент. */
export function stripesTexture(colorA: string, colorB: string, stripes = 8, size = 256): HTMLCanvasElement {
  const { c, g } = makeCanvas(size);
  const w = size / stripes;
  for (let i = 0; i < stripes; i++) {
    g.fillStyle = i % 2 ? colorB : colorA;
    g.fillRect(i * w, 0, w, size);
  }
  noiseLayer(g, size, 6, 0.04, 9);
  return c;
}

// ───────────── Цветные текстуры земли ─────────────

export function grassTexture(seed = 11, size = 512): HTMLCanvasElement {
  const { c, g } = makeCanvas(size);
  const rng = new Rng(seed);
  g.fillStyle = rgb(96, 138, 56);
  g.fillRect(0, 0, size, size);
  noiseLayer(g, size, 5, 0.14, seed);
  // Травинки.
  for (let i = 0; i < 5200; i++) {
    const x = rng.range(0, size);
    const y = rng.range(0, size);
    const len = rng.range(4, 11);
    const ang = -Math.PI / 2 + rng.range(-0.5, 0.5);
    const tone = rng.range(-1, 1);
    const col =
      tone > 0.4
        ? rgb(138 + rng.range(-10, 20), 172 + rng.range(-10, 15), 76 + rng.range(-10, 10), 0.7)
        : tone < -0.35
          ? rgb(62, 100, 42, 0.7)
          : rgb(92 + rng.range(-10, 10), 138 + rng.range(-12, 12), 54, 0.7);
    g.strokeStyle = col;
    g.lineWidth = rng.range(1, 2);
    wrapDraw(size, x, y, 12, (px, py) => {
      g.beginPath();
      g.moveTo(px, py);
      g.lineTo(px + Math.cos(ang) * len, py + Math.sin(ang) * len);
      g.stroke();
    });
  }
  // Редкие светлые цветочки-точки.
  for (let i = 0; i < 60; i++) {
    const x = rng.range(0, size);
    const y = rng.range(0, size);
    g.fillStyle = rng.chance(0.5) ? rgb(250, 246, 220, 0.9) : rgb(250, 220, 90, 0.9);
    g.beginPath();
    g.arc(x, y, rng.range(1.2, 2.2), 0, Math.PI * 2);
    g.fill();
  }
  return c;
}

export function dirtTexture(seed = 12, size = 512): HTMLCanvasElement {
  const { c, g } = makeCanvas(size);
  const rng = new Rng(seed);
  g.fillStyle = rgb(214, 178, 128);
  g.fillRect(0, 0, size, size);
  noiseLayer(g, size, 4, 0.1, seed);
  noiseLayer(g, size, 18, 0.05, seed + 3);
  // Камушки.
  for (let i = 0; i < 420; i++) {
    const x = rng.range(0, size);
    const y = rng.range(0, size);
    const r = rng.range(1, 3.6);
    const b = rng.range(-1, 1);
    g.fillStyle = b > 0 ? rgb(232, 206, 165, 0.9) : rgb(160, 128, 92, 0.8);
    wrapDraw(size, x, y, r, (px, py) => {
      g.beginPath();
      g.ellipse(px, py, r, r * 0.8, rng.range(0, 3), 0, Math.PI * 2);
      g.fill();
    });
  }
  // Колеи/борозды — лёгкие тёмные штрихи.
  for (let i = 0; i < 40; i++) {
    const x = rng.range(0, size);
    const y = rng.range(0, size);
    g.strokeStyle = rgb(170, 136, 96, 0.35);
    g.lineWidth = rng.range(1, 3);
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + rng.range(-30, 30), y + rng.range(-8, 8));
    g.stroke();
  }
  return c;
}

export function soilTexture(seed = 13, size = 256): HTMLCanvasElement {
  const { c, g } = makeCanvas(size);
  const rng = new Rng(seed);
  g.fillStyle = rgb(112, 78, 54);
  g.fillRect(0, 0, size, size);
  noiseLayer(g, size, 6, 0.14, seed);
  for (let i = 0; i < 300; i++) {
    g.fillStyle = rng.chance(0.5) ? rgb(140, 102, 72, 0.8) : rgb(80, 54, 36, 0.8);
    g.beginPath();
    g.arc(rng.range(0, size), rng.range(0, size), rng.range(0.8, 2.4), 0, Math.PI * 2);
    g.fill();
  }
  return c;
}

/** Бесшовный низкочастотный шум (R = шум) для макро-вариации земли и травы. */
export function noiseTexture(seed = 14, size = 256): HTMLCanvasElement {
  const { c, g } = makeCanvas(size);
  g.fillStyle = gray(0.5);
  g.fillRect(0, 0, size, size);
  const img = g.getImageData(0, 0, size, size);
  const d = img.data;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const s = 4;
      const n00 = fbm(u * s, v * s, 4);
      const n10 = fbm((u - 1) * s, v * s, 4);
      const n01 = fbm(u * s, (v - 1) * s, 4);
      const n11 = fbm((u - 1) * s, (v - 1) * s, 4);
      const n = n00 * (1 - u) * (1 - v) + n10 * u * (1 - v) + n01 * (1 - u) * v + n11 * u * v;
      const m00 = fbm(u * 16 + 7, v * 16 + 3, 2);
      const m10 = fbm((u - 1) * 16 + 7, v * 16 + 3, 2);
      const m01 = fbm(u * 16 + 7, (v - 1) * 16 + 3, 2);
      const m11 = fbm((u - 1) * 16 + 7, (v - 1) * 16 + 3, 2);
      const m = m00 * (1 - u) * (1 - v) + m10 * u * (1 - v) + m01 * (1 - u) * v + m11 * u * v;
      const i = (y * size + x) * 4;
      d[i] = Math.round(n * 255);
      d[i + 1] = Math.round(m * 255);
      d[i + 2] = 128;
      d[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

// ───────────── Декали (с прозрачностью) ─────────────

export function stainDecal(seed = 21, size = 256): HTMLCanvasElement {
  const { c, g } = makeCanvas(size);
  const rng = new Rng(seed);
  g.clearRect(0, 0, size, size);
  for (let i = 0; i < 26; i++) {
    const r = rng.range(size * 0.05, size * 0.2);
    const x = size / 2 + rng.range(-size * 0.25, size * 0.25);
    const y = size / 2 + rng.range(-size * 0.25, size * 0.25);
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, rgb(70, 48, 30, 0.55));
    grad.addColorStop(0.7, rgb(80, 56, 36, 0.35));
    grad.addColorStop(1, rgb(80, 56, 36, 0));
    g.fillStyle = grad;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  for (let i = 0; i < 40; i++) {
    g.fillStyle = rgb(60, 40, 26, rng.range(0.3, 0.7));
    g.beginPath();
    g.arc(size / 2 + rng.range(-size * 0.4, size * 0.4), size / 2 + rng.range(-size * 0.4, size * 0.4), rng.range(1.5, 5), 0, Math.PI * 2);
    g.fill();
  }
  return c;
}

export function footprintsDecal(seed = 22, size = 256): HTMLCanvasElement {
  const { c, g } = makeCanvas(size);
  const rng = new Rng(seed);
  const print = (x: number, y: number, rot: number, alpha: number) => {
    g.save();
    g.translate(x, y);
    g.rotate(rot);
    g.fillStyle = rgb(92, 66, 44, alpha);
    g.beginPath();
    g.ellipse(0, -14, 11, 17, 0, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.ellipse(0, 18, 9, 10, 0, 0, Math.PI * 2);
    g.fill();
    // Протектор.
    g.fillStyle = rgb(60, 42, 28, alpha * 0.6);
    for (let k = -24; k < 24; k += 6) g.fillRect(-8, k, 16, 2);
    g.restore();
  };
  for (let i = 0; i < 4; i++) {
    const t = i / 3;
    const x = size * 0.5 + (i % 2 ? 22 : -22);
    const y = size * (0.85 - t * 0.7);
    print(x, y, rng.range(-0.15, 0.15), 0.55 - t * 0.15);
  }
  return c;
}

export function mudDecal(seed = 23, size = 256): HTMLCanvasElement {
  const { c, g } = makeCanvas(size);
  const rng = new Rng(seed);
  for (let i = 0; i < 14; i++) {
    const r = rng.range(size * 0.08, size * 0.24);
    const x = size / 2 + rng.range(-size * 0.2, size * 0.2);
    const y = size / 2 + rng.range(-size * 0.2, size * 0.2);
    g.fillStyle = rgb(96, 70, 44, 0.75);
    g.beginPath();
    g.ellipse(x, y, r, r * rng.range(0.6, 1), rng.range(0, 3), 0, Math.PI * 2);
    g.fill();
  }
  for (let i = 0; i < 30; i++) {
    g.fillStyle = rgb(110, 82, 52, 0.85);
    g.beginPath();
    g.arc(size / 2 + rng.range(-size * 0.42, size * 0.42), size / 2 + rng.range(-size * 0.42, size * 0.42), rng.range(2, 7), 0, Math.PI * 2);
    g.fill();
  }
  return c;
}

export function cobwebDecal(seed = 24, size = 256): HTMLCanvasElement {
  const { c, g } = makeCanvas(size);
  const rng = new Rng(seed);
  // Паутина в углу: центр в левом верхнем углу текстуры.
  const cx = 6;
  const cy = 6;
  const spokes = 9;
  g.strokeStyle = 'rgba(245,245,240,0.8)';
  g.lineWidth = 1.6;
  const angs: number[] = [];
  for (let i = 0; i < spokes; i++) angs.push((i / (spokes - 1)) * (Math.PI / 2) + rng.range(-0.05, 0.05));
  for (const a of angs) {
    g.beginPath();
    g.moveTo(cx, cy);
    g.lineTo(cx + Math.cos(a) * size, cy + Math.sin(a) * size);
    g.stroke();
  }
  g.lineWidth = 1.1;
  for (let r = 22; r < size * 1.1; r += rng.range(16, 26)) {
    g.beginPath();
    for (let i = 0; i < angs.length; i++) {
      const a = angs[i]!;
      const rr = r * rng.range(0.92, 1.05);
      const x = cx + Math.cos(a) * rr;
      const y = cy + Math.sin(a) * rr;
      if (i === 0) g.moveTo(x, y);
      else {
        const pa = angs[i - 1]!;
        const mx = cx + Math.cos((a + pa) / 2) * rr * 0.86;
        const my = cy + Math.sin((a + pa) / 2) * rr * 0.86;
        g.quadraticCurveTo(mx, my, x, y);
      }
    }
    g.stroke();
  }
  // Пыльная дымка.
  const grad = g.createRadialGradient(cx, cy, 0, cx, cy, size * 0.9);
  grad.addColorStop(0, 'rgba(230,230,225,0.25)');
  grad.addColorStop(1, 'rgba(230,230,225,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return c;
}

/** Круглая мягкая тень (под персонажами и ящиками на земле). */
export function blobShadow(size = 128): HTMLCanvasElement {
  const { c, g } = makeCanvas(size);
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(0,0,0,0.42)');
  grad.addColorStop(0.6, 'rgba(0,0,0,0.2)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return c;
}

/** Мягкая «вспышка» (ореол фонарей, искры). */
export function glowSprite(size = 64): HTMLCanvasElement {
  const { c, g } = makeCanvas(size);
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255,240,200,1)');
  grad.addColorStop(0.25, 'rgba(255,214,150,0.55)');
  grad.addColorStop(1, 'rgba(255,200,120,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return c;
}

export { rgb, gray };
