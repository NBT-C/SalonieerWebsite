// After a deploy: the live home page (https://salonieer.com/) in English, Arabic and Hebrew on a phone and a desktop.
// Read-only: it only opens pages. Checks the same things as test-home.mjs that matter in production.
//   node check-live.mjs [origin]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ORIGIN = process.argv[2] || 'https://salonieer.com';
const { chromium } = await import(pathToFileURL(path.resolve(HERE, '../../../video-project/node_modules/playwright/index.mjs')).href);
const OUT = path.join(HERE, 'shots-live'); fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const fails = [];
const fail = m => { fails.push(m); console.log('  ✗ ' + m); }, ok = m => console.log('  ✓ ' + m);
for (const lang of ['en', 'ar', 'he']) {
  for (const [w, h] of [[390, 844], [1440, 900]]) {
    const phone = w < 700, label = `${lang} ${w}`;
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: phone ? 3 : 1, isMobile: phone, hasTouch: phone, locale: { en: 'en-US', ar: 'ar-PS', he: 'he-IL' }[lang] });
    const pg = await ctx.newPage();
    pg.on('pageerror', e => fail(`${label}: page error ${e.message}`));
    pg.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|profitwell|paddle/i.test(m.text())) fail(`${label}: console ${m.text().slice(0, 160)}`); });
    await pg.addInitScript(l => { try { localStorage.setItem('salonieer_lang', l); } catch {} window.__cls = 0; new PerformanceObserver(list => { for (const e of list.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: 'layout-shift', buffered: true }); }, lang);
    const t0 = Date.now();
    await pg.goto(ORIGIN + '/', { waitUntil: 'domcontentloaded' });
    await pg.waitForFunction(() => { const i = document.querySelector('.sc-home .sc-tablet img'); return i && i.complete && i.naturalWidth > 0; }, null, { timeout: 30000 });
    const heroMs = Date.now() - t0;
    await pg.screenshot({ path: path.join(OUT, `live-${lang}-${w}-hero.png`) });
    await pg.evaluate(async () => { for (let y = 0; y < document.scrollingElement.scrollHeight; y += innerHeight * 0.8) { scrollTo(0, y); await new Promise(r => setTimeout(r, 250)); } scrollTo(0, 0); });
    await pg.waitForTimeout(800);
    const s = await pg.evaluate(lang => {
      const imgs = [...document.querySelectorAll('.sc-home .sc-screen img')];
      return { dir: document.documentElement.dir, n: imgs.length, wrong: imgs.filter(i => !i.currentSrc.includes(`-${lang}-`)).length,
        broken: imgs.filter(i => !i.closest('.sc-panel:not(.is-active)') && !(i.complete && i.naturalWidth)).map(i => i.currentSrc.split('/').pop()),
        sideways: document.scrollingElement.scrollWidth > innerWidth + 1, cls: window.__cls, prices: document.querySelectorAll('#prices .hm-plan').length,
        bytes: performance.getEntriesByType('resource').filter(r => r.name.includes('/assets/img/showcase/')).reduce((a, r) => a + (r.transferSize || r.encodedBodySize || 0), 0) };
    }, lang);
    if (s.dir !== (lang === 'en' ? 'ltr' : 'rtl') || s.wrong || s.broken.length || s.sideways || s.cls > 0.1) fail(`${label}: ${JSON.stringify(s)}`);
    else ok(`${label}: ${s.dir}, ${s.n} screens all ${lang}, all loaded, hero picture in ${heroMs} ms, screens ${(s.bytes / 1024).toFixed(0)} KB, CLS ${s.cls.toFixed(3)}, ${s.prices} plans`);
    await ctx.close();
  }
}
// The language switch on the live page.
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const pg = await ctx.newPage();
  await pg.addInitScript(() => { try { localStorage.setItem('salonieer_lang', 'en'); } catch {} });
  await pg.goto(ORIGIN + '/'); await pg.waitForSelector('.sc-home');
  for (const lang of ['ar', 'he', 'en']) {
    await pg.selectOption('#language', lang);
    await pg.waitForFunction(l => document.documentElement.lang === l && [...document.querySelectorAll('.sc-home .sc-screen img')].every(i => i.src.includes(`-${l}-`)), lang, { timeout: 8000 })
      .then(() => ok(`live switch to ${lang}: every screen is ${lang}`)).catch(() => fail(`live switch to ${lang}`));
  }
  await ctx.close();
}
await browser.close();
console.log(fails.length ? `${fails.length} FAILED` : 'LIVE OK');
process.exit(fails.length ? 1 : 0);
