// Скриншоты для визуальной проверки: node tools/shot.mjs <out.png> "<query>" [w] [h] [waitMs]
import { chromium } from 'playwright-core';
const [, , out, query = '', w = '1280', h = '720', waitMs = '1500'] = process.argv;
const base = process.env.SHOT_BASE ?? 'http://localhost:5173/';
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'],
});
const page = await browser.newPage({ viewport: { width: +w, height: +h } });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
await page.goto(base + (query.startsWith('?') ? query : '?' + query), { waitUntil: 'load' });
try {
  await page.waitForFunction(() => window.__ready || (window.__viewer && window.__viewer.ready) || window.__gameReady, null, { timeout: 120000 });
} catch (e) {
  logs.push('[timeout] не дождался готовности');
}
await page.waitForTimeout(+waitMs);
await page.screenshot({ path: out });
const info = await page.evaluate(() => ({ viewer: window.__viewer?.info, stats: window.__stats ?? window.__viewer?.stats }));
console.log(JSON.stringify(info));
for (const l of logs.slice(0, 40)) console.log(l);
await browser.close();
