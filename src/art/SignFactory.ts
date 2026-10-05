import { makeCanvas, rgb } from './TextureFactory';
import { Rng } from '../core/rng';

/**
 * Вывески и надписи (кириллица) на canvas. Шрифты загружаются заранее (main.ts),
 * поэтому рисуем только после document.fonts.ready.
 */

export const FONT_UI = '"Roboto Condensed", "Arial Narrow", sans-serif';
export const FONT_TITLE = '"PT Serif", Georgia, serif';

function weatheredBoard(g: CanvasRenderingContext2D, w: number, h: number, base: [number, number, number], seed: number, wear: number): void {
  const rng = new Rng(seed);
  g.fillStyle = rgb(...base);
  g.fillRect(0, 0, w, h);
  // Горизонтальные доски.
  const boards = Math.max(2, Math.round(h / 60));
  for (let i = 0; i < boards; i++) {
    const y = (i / boards) * h;
    g.fillStyle = rgb(base[0] - 30, base[1] - 30, base[2] - 30, 0.6);
    g.fillRect(0, y, w, 3);
    for (let k = 0; k < 18; k++) {
      g.strokeStyle = rgb(base[0] - rng.range(10, 40), base[1] - rng.range(10, 40), base[2] - rng.range(10, 40), 0.4);
      g.lineWidth = rng.range(1, 2.5);
      const yy = y + rng.range(5, h / boards - 5);
      g.beginPath();
      g.moveTo(0, yy);
      g.bezierCurveTo(w * 0.3, yy + rng.range(-4, 4), w * 0.6, yy + rng.range(-4, 4), w, yy + rng.range(-3, 3));
      g.stroke();
    }
  }
  // Потёртости.
  for (let i = 0; i < 60 * wear; i++) {
    g.fillStyle = rgb(base[0] - 50, base[1] - 50, base[2] - 50, rng.range(0.05, 0.25));
    g.beginPath();
    g.ellipse(rng.range(0, w), rng.range(0, h), rng.range(4, 30), rng.range(2, 8), rng.range(0, 3), 0, Math.PI * 2);
    g.fill();
  }
  // Рамка.
  g.strokeStyle = rgb(base[0] - 60, base[1] - 60, base[2] - 60, 0.9);
  g.lineWidth = 10;
  g.strokeRect(5, 5, w - 10, h - 10);
}

function fitText(g: CanvasRenderingContext2D, text: string, font: (px: number) => string, maxW: number, startPx: number): number {
  let px = startPx;
  g.font = font(px);
  while (g.measureText(text).width > maxW && px > 10) {
    px -= 2;
    g.font = font(px);
  }
  return px;
}

/** Старая вывеска «МАГАЗИН» (SHOP-01). */
export function signShopOld(): HTMLCanvasElement {
  const w = 1024;
  const h = 256;
  const { c, g } = makeCanvas(w, h);
  weatheredBoard(g, w, h, [218, 205, 182], 31, 2.2);
  g.fillStyle = rgb(48, 40, 34, 0.92);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  fitText(g, 'МАГАЗИН', (px) => `700 ${px}px ${FONT_TITLE}`, w * 0.8, 170);
  g.fillText('МАГАЗИН', w / 2, h / 2 + 6);
  // Облупившаяся краска поверх букв.
  const rng = new Rng(5);
  for (let i = 0; i < 70; i++) {
    g.fillStyle = rgb(218, 205, 182, rng.range(0.4, 0.9));
    g.beginPath();
    g.ellipse(rng.range(w * 0.1, w * 0.9), rng.range(h * 0.2, h * 0.8), rng.range(3, 14), rng.range(2, 6), rng.range(0, 3), 0, Math.PI * 2);
    g.fill();
  }
  return c;
}

/** Свежая вывеска «Магазин бабушки» (после реставрации). */
export function signShopNew(): HTMLCanvasElement {
  const w = 1024;
  const h = 256;
  const { c, g } = makeCanvas(w, h);
  weatheredBoard(g, w, h, [240, 230, 205], 32, 0.3);
  g.fillStyle = rgb(49, 84, 73);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  fitText(g, 'Магазин бабушки', (px) => `700 ${px}px ${FONT_TITLE}`, w * 0.84, 140);
  g.fillText('Магазин бабушки', w / 2, h / 2 + 4);
  return c;
}

/** Расписная вывеска на фронтон: корзина с хлебом и овощами, листья (SHOP-00). */
export function signGablePainting(): HTMLCanvasElement {
  const w = 1024;
  const h = 512;
  const { c, g } = makeCanvas(w, h);
  weatheredBoard(g, w, h, [236, 226, 198], 33, 0.4);
  const cx = w / 2;
  const cy = h * 0.6;
  // Листья по бокам.
  const leaf = (x: number, y: number, s: number, rot: number) => {
    g.save();
    g.translate(x, y);
    g.rotate(rot);
    g.fillStyle = rgb(84, 122, 72);
    g.beginPath();
    g.moveTo(0, 0);
    g.quadraticCurveTo(s * 0.5, -s * 0.35, s, 0);
    g.quadraticCurveTo(s * 0.5, s * 0.35, 0, 0);
    g.fill();
    g.strokeStyle = rgb(60, 92, 52);
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(s * 0.9, 0);
    g.stroke();
    g.restore();
  };
  for (const side of [-1, 1]) {
    const bx = cx + side * 330;
    g.strokeStyle = rgb(72, 104, 62);
    g.lineWidth = 6;
    g.beginPath();
    g.moveTo(bx, cy + 110);
    g.quadraticCurveTo(bx + side * 10, cy, bx - side * 10, cy - 120);
    g.stroke();
    for (let i = 0; i < 4; i++) {
      const yy = cy + 80 - i * 55;
      leaf(bx + side * 2, yy, 70, side > 0 ? -0.5 - i * 0.1 : Math.PI + 0.5 + i * 0.1);
      leaf(bx - side * 2, yy - 20, 60, side > 0 ? Math.PI + 0.6 : -0.6);
    }
  }
  // Багет.
  g.save();
  g.translate(cx + 60, cy - 105);
  g.rotate(-0.55);
  const bread = g.createLinearGradient(0, -40, 0, 40);
  bread.addColorStop(0, rgb(232, 170, 92));
  bread.addColorStop(1, rgb(176, 104, 46));
  g.fillStyle = bread;
  g.beginPath();
  g.ellipse(0, 0, 150, 42, 0, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = rgb(246, 214, 160);
  g.lineWidth = 7;
  for (let i = -2; i <= 2; i++) {
    g.beginPath();
    g.moveTo(i * 52 - 18, -18);
    g.lineTo(i * 52 + 18, 16);
    g.stroke();
  }
  g.restore();
  // Помидор, яблоко, зелень.
  const ball = (x: number, y: number, r: number, c1: [number, number, number], c2: [number, number, number]) => {
    const gr = g.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
    gr.addColorStop(0, rgb(...c1));
    gr.addColorStop(1, rgb(...c2));
    g.fillStyle = gr;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  };
  g.fillStyle = rgb(92, 150, 70);
  g.beginPath();
  g.ellipse(cx - 70, cy - 108, 58, 40, -0.3, 0, Math.PI * 2);
  g.fill();
  ball(cx - 150, cy - 70, 52, [240, 96, 70], [180, 40, 32]);
  ball(cx - 40, cy - 72, 48, [176, 206, 92], [104, 150, 52]);
  g.fillStyle = rgb(70, 120, 50);
  g.fillRect(cx - 154, cy - 128, 8, 16);
  // Корзина.
  g.fillStyle = rgb(170, 112, 62);
  g.beginPath();
  g.moveTo(cx - 230, cy - 50);
  g.lineTo(cx + 230, cy - 50);
  g.lineTo(cx + 180, cy + 120);
  g.lineTo(cx - 180, cy + 120);
  g.closePath();
  g.fill();
  g.strokeStyle = rgb(120, 76, 38);
  g.lineWidth = 6;
  for (let i = 0; i < 5; i++) {
    const y = cy - 30 + i * 32;
    g.beginPath();
    g.moveTo(cx - 225 + i * 9, y);
    g.lineTo(cx + 225 - i * 9, y);
    g.stroke();
  }
  for (let i = -6; i <= 6; i++) {
    g.beginPath();
    g.moveTo(cx + i * 36, cy - 50);
    g.lineTo(cx + i * 29, cy + 120);
    g.stroke();
  }
  g.fillStyle = rgb(196, 136, 78);
  g.fillRect(cx - 240, cy - 64, 480, 22);
  return c;
}

/** Вывеска поставщика: название на цветной доске. */
export function signSupplier(title: string, bg: [number, number, number], fg: [number, number, number], seed: number): HTMLCanvasElement {
  const w = 1024;
  const h = 256;
  const { c, g } = makeCanvas(w, h);
  weatheredBoard(g, w, h, bg, seed, 0.6);
  g.fillStyle = rgb(...fg);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  fitText(g, title, (px) => `700 ${px}px ${FONT_TITLE}`, w * 0.82, 140);
  g.fillText(title, w / 2, h / 2 + 6);
  return c;
}

/** Табличка остановки / указатель. */
export function signPlate(title: string, sub: string | null, bg: [number, number, number], fg: [number, number, number]): HTMLCanvasElement {
  const w = 512;
  const h = 256;
  const { c, g } = makeCanvas(w, h);
  g.fillStyle = rgb(...bg);
  g.fillRect(0, 0, w, h);
  g.strokeStyle = rgb(...fg);
  g.lineWidth = 12;
  g.strokeRect(14, 14, w - 28, h - 28);
  g.fillStyle = rgb(...fg);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  fitText(g, title, (px) => `700 ${px}px ${FONT_UI}`, w * 0.82, 96);
  g.fillText(title, w / 2, sub ? h * 0.42 : h / 2);
  if (sub) {
    fitText(g, sub, (px) => `400 ${px}px ${FONT_UI}`, w * 0.8, 46);
    g.fillText(sub, w / 2, h * 0.72);
  }
  return c;
}

/** Грифельная доска у входа: рисунки мелом (яблоко, морковь) и текст. */
export function signChalkboard(lines: string[]): HTMLCanvasElement {
  const w = 512;
  const h = 640;
  const { c, g } = makeCanvas(w, h);
  g.fillStyle = rgb(44, 58, 52);
  g.fillRect(0, 0, w, h);
  const rng = new Rng(77);
  for (let i = 0; i < 120; i++) {
    g.fillStyle = `rgba(255,255,255,${rng.range(0.01, 0.05)})`;
    g.beginPath();
    g.ellipse(rng.range(0, w), rng.range(0, h), rng.range(10, 60), rng.range(4, 20), rng.range(0, 3), 0, Math.PI * 2);
    g.fill();
  }
  // Яблоко.
  g.fillStyle = rgb(220, 86, 70, 0.9);
  g.beginPath();
  g.arc(w * 0.35, h * 0.24, 60, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = rgb(120, 180, 90, 0.9);
  g.beginPath();
  g.ellipse(w * 0.4, h * 0.13, 22, 10, -0.6, 0, Math.PI * 2);
  g.fill();
  // Морковь.
  g.save();
  g.translate(w * 0.66, h * 0.3);
  g.rotate(0.7);
  g.fillStyle = rgb(236, 140, 60, 0.9);
  g.beginPath();
  g.moveTo(-20, -70);
  g.lineTo(20, -70);
  g.lineTo(0, 70);
  g.closePath();
  g.fill();
  g.fillStyle = rgb(120, 180, 90, 0.9);
  g.fillRect(-12, -100, 8, 32);
  g.fillRect(4, -96, 8, 28);
  g.restore();
  g.fillStyle = 'rgba(245,245,235,0.92)';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  lines.forEach((ln, i) => {
    fitText(g, ln, (px) => `700 ${px}px ${FONT_UI}`, w * 0.84, i === 0 ? 64 : 44);
    g.fillText(ln, w / 2, h * 0.55 + i * 70);
  });
  // Деревянная рамка.
  g.strokeStyle = rgb(150, 104, 62);
  g.lineWidth = 26;
  g.strokeRect(13, 13, w - 26, h - 26);
  return c;
}

/** Табличка «Открыто/Закрыто» на двери. */
export function signOpenClosed(open: boolean): HTMLCanvasElement {
  const w = 256;
  const h = 128;
  const { c, g } = makeCanvas(w, h);
  g.fillStyle = open ? rgb(244, 238, 223) : rgb(120, 40, 46);
  g.fillRect(0, 0, w, h);
  g.strokeStyle = open ? rgb(47, 79, 63) : rgb(244, 238, 223);
  g.lineWidth = 8;
  g.strokeRect(6, 6, w - 12, h - 12);
  g.fillStyle = open ? rgb(47, 79, 63) : rgb(244, 238, 223);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `700 54px ${FONT_UI}`;
  g.fillText(open ? 'ОТКРЫТО' : 'ЗАКРЫТО', w / 2, h / 2 + 3);
  return c;
}

/** Этикетка коробки: название товара и цветная полоса. */
export function boxLabel(title: string, color: string): HTMLCanvasElement {
  const w = 256;
  const h = 128;
  const { c, g } = makeCanvas(w, h);
  g.fillStyle = rgb(246, 242, 232);
  g.fillRect(0, 0, w, h);
  g.fillStyle = color;
  g.fillRect(0, 0, w, 26);
  g.fillStyle = rgb(38, 50, 45);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  fitText(g, title, (px) => `700 ${px}px ${FONT_UI}`, w * 0.88, 52);
  g.fillText(title, w / 2, 76);
  g.font = `400 18px ${FONT_UI}`;
  g.fillText('8 шт.', w / 2, 112);
  return c;
}

/** Ценник на полку. */
export function priceTag(price: number | null, name: string): HTMLCanvasElement {
  const w = 128;
  const h = 64;
  const { c, g } = makeCanvas(w, h);
  g.fillStyle = rgb(250, 246, 236);
  g.fillRect(0, 0, w, h);
  g.fillStyle = rgb(49, 84, 73);
  g.fillRect(0, 0, w, 16);
  g.fillStyle = rgb(250, 246, 236);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  fitText(g, name, (px) => `700 ${px}px ${FONT_UI}`, w * 0.92, 13);
  g.fillText(name, w / 2, 8.5);
  g.fillStyle = rgb(38, 50, 45);
  g.font = `700 36px ${FONT_UI}`;
  g.fillText(price === null ? '—' : String(price), w / 2, 42);
  return c;
}
