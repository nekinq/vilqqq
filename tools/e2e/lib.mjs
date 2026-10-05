// Общие помощники для браузерных сценариев (Playwright + SwiftShader).
import { chromium } from 'playwright-core';

export const CHROME = process.env.CHROME ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
export const BASE = process.env.SHOT_BASE ?? 'http://localhost:5173/';

export async function launch({ width = 1280, height = 720 } = {}) {
  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--autoplay-policy=no-user-gesture-required'],
  });
  const page = await browser.newPage({ viewport: { width, height } });
  const logs = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text()}`);
  });
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  return { browser, page, logs };
}

export async function openGame(page, query = 'autostart=new&quality=low&maxdt=0.2&test') {
  await page.goto(BASE + '?' + query, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__gameReady === true, null, { timeout: 240000 });
  await page.waitForTimeout(500);
}

/** Выполнить код в контексте игры: fn получает __game. */
export function g(page, fn, arg) {
  return page.evaluate(([src, a]) => {
    const f = new Function('G', 'arg', `return (${src})(G, arg);`);
    return f(window.__game, a);
  }, [fn.toString(), arg]);
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Ждать условие в игре (fn → truthy). */
export async function until(page, fn, timeout = 30000, arg) {
  const t0 = Date.now();
  for (;;) {
    const v = await g(page, fn, arg);
    if (v) return v;
    if (Date.now() - t0 > timeout) throw new Error('timeout: ' + fn.toString().slice(0, 120));
    await sleep(250);
  }
}

/** Дождаться n кадров игрового цикла. */
export async function frames(page, n = 3) {
  const f0 = await page.evaluate(() => window.__game.frame);
  await page.waitForFunction((t) => window.__game.frame >= t, f0 + n, { timeout: 60000 });
}

/** Нажать действие и дождаться, пока игра его обработает. */
export async function press(page, action) {
  await page.evaluate((a) => window.__game.hold(a, true), action);
  await frames(page, 2);
  await page.evaluate((a) => window.__game.hold(a, false), action);
  await frames(page, 2);
}

/** Клик по элементу через DOM (надёжно при низком FPS в SwiftShader). */
export async function click(page, selector, text) {
  const ok = await page.evaluate(([sel, t]) => {
    const els = [...document.querySelectorAll(sel)];
    const el = t ? els.find((e) => e.textContent.includes(t)) : els[0];
    if (!el) return false;
    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    el.click();
    return true;
  }, [selector, text ?? null]);
  if (!ok) throw new Error(`нет элемента ${selector} ${text ?? ''}`);
  await frames(page, 2);
}
