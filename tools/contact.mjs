// Контактный лист: node tools/contact.mjs out.png cols img1.png img2.png ...
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
const [, , out, cols, ...imgs] = process.argv;
const c = +cols;
const html = `<html><body style="margin:0;background:#222;display:grid;grid-template-columns:repeat(${c},1fr);gap:4px">${imgs
  .map((p) => `<div style="position:relative"><img style="width:100%;display:block" src="data:image/png;base64,${readFileSync(p).toString('base64')}"><span style="position:absolute;left:4px;top:2px;color:#fff;font:12px sans-serif;text-shadow:0 0 3px #000">${p.split('/').pop()}</span></div>`)
  .join('')}</body></html>`;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 1280, height: 400 } });
await page.setContent(html);
await page.waitForTimeout(200);
await page.screenshot({ path: out, fullPage: true });
await browser.close();
