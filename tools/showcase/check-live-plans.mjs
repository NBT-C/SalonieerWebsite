// Read-only check of the live plans page (https://salonieer.com/plans): the yearly tag in each language, its contrast on
// the selected button, and no "month free" anywhere.   node check-live-plans.mjs
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const { chromium } = await import(pathToFileURL(path.resolve(HERE, '../../../video-project/node_modules/playwright/index.mjs')).href);
const browser = await chromium.launch();
let bad = 0;
for (const [lang, want] of [['en', '8.3% off'], ['ar', 'خصم 8.3%'], ['he', '8.3% הנחה']]) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const pg = await ctx.newPage();
  pg.on('pageerror', e => { bad++; console.log('PAGEERROR', e.message); });
  await pg.addInitScript(l => { try { localStorage.setItem('salonieer_lang', l); localStorage.setItem('salonieer_interval', 'year'); } catch {} }, lang);
  await pg.goto('https://salonieer.com/plans'); await pg.waitForSelector('.interval-switch .save-tag', { timeout: 30000 }); await pg.waitForTimeout(1500);
  const s = await pg.evaluate(() => {
    const tag = document.querySelector('.interval-switch .save-tag'), cs = getComputedStyle(tag);
    const lum = c => { const m = (c.match(/[\d.]+/g) || []).slice(0, 3).map(Number).map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4); return .2126 * m[0] + .7152 * m[1] + .0722 * m[2]; };
    const a = lum(cs.color), b = lum(cs.backgroundColor);
    return { text: tag.textContent.trim(), contrast: Math.round((Math.max(a, b) + .05) / (Math.min(a, b) + .05) * 10) / 10, free: /month free|free month|شهر مجان|חודש חינם/i.test(document.body.innerText) };
  });
  const good = s.text === want && s.contrast >= 4.5 && !s.free;
  if (!good) bad++;
  console.log(`${good ? '✓' : '✗'} live ${lang}: "${s.text}", contrast ${s.contrast}:1${s.free ? ', STILL SAYS MONTH FREE' : ''}`);
  await ctx.close();
}
await browser.close();
console.log(bad ? `${bad} PROBLEMS` : 'LIVE PLANS OK');
process.exit(bad ? 1 : 0);
