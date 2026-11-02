// Home page checks on the REAL website (PHP, php -S, a copy of salonieerwebsite) with the REAL backend behind it
// (Salonieer-KMP INSTALL.sql in embedded Postgres through a fake Supabase on 127.0.0.1). Nothing leaves this machine.
//   node test-home.mjs            → prints ✓/✗ and writes page pictures to shots/
// Checks, in English, Arabic and Hebrew at phone, tablet and desktop widths: every product picture is the screen of
// the page's language and loads; RTL/LTR; no sideways scroll; no layout shift; the tour tabs (mouse and keyboard);
// the enlarged view; the language switch replacing every picture at once; reduced motion; the other pages still open.
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SITE = path.resolve(HERE, '../../salonieerwebsite');
const KMP = path.resolve(HERE, '../../../Salonieer-KMP');
const H = await import(pathToFileURL(path.join(KMP, 'tools/e2e_harness.mjs')).href);
const PHP = process.env.PHP || 'C:/tools/php/php.exe';
const WORK = path.join(os.tmpdir(), 'salonieer-home-check'), WWW = path.join(WORK, 'www'), PRIV = path.join(WORK, 'salonieer-private');
const SHOTS = path.join(HERE, 'shots'); fs.mkdirSync(SHOTS, { recursive: true });
const PORT = 8093, SB = 8099, ORIGIN = `http://127.0.0.1:${PORT}`;
const { ok, fail, failures } = H;

fs.rmSync(WORK, { recursive: true, force: true }); fs.mkdirSync(PRIV, { recursive: true });
fs.cpSync(SITE, WWW, { recursive: true, filter: s => !/[\\/](\.git|\.superdesign|bob\.zip|services)([\\/]|$)/.test(s) });
fs.writeFileSync(path.join(PRIV, '.env'), `SUPABASE_URL=http://127.0.0.1:${SB}\nSUPABASE_PUBLIC_URL=https://storage.example.test\nSUPABASE_SERVICE_ROLE_KEY=sb_secret_fake\nSITE_URL=${ORIGIN}\n`);
fs.writeFileSync(path.join(WORK, 'router.php'), `<?php\n$p = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);\n$f = $_SERVER['DOCUMENT_ROOT'] . $p;\nif ($p !== '/' && is_file($f) && !str_ends_with($f, '.php')) return false;\nrequire $_SERVER['DOCUMENT_ROOT'] . '/index.php';\n`);

const { db } = await H.createDb();
const bridge = H.rpcBridge(db);
const fake = http.createServer((rq, rs) => {
  const chunks = []; rq.on('data', c => chunks.push(c)); rq.on('end', async () => {
    const send = (st, b) => { rs.writeHead(st, { 'content-type': 'application/json' }); rs.end(b === undefined ? '' : JSON.stringify(b)); };
    const m = new URL(rq.url, 'http://x').pathname.match(/^\/rest\/v1\/rpc\/([a-z_][a-z0-9_]*)$/);
    if (!m) return send(404, { message: 'not found' });
    let args = {}; try { args = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}; } catch {}
    const r = await bridge.callRpc(m[1], args, rq.headers.apikey === 'sb_secret_fake' ? H.SERVICE : null);
    send(r.status, r.body);
  });
});
await new Promise(r => fake.listen(SB, '127.0.0.1', r));
const php = spawn(PHP, ['-S', `127.0.0.1:${PORT}`, '-t', WWW, path.join(WORK, 'router.php')], { stdio: ['ignore', 'pipe', 'pipe'] });
let phpLog = ''; php.stdout.on('data', d => phpLog += d); php.stderr.on('data', d => phpLog += d);
for (let i = 0; i < 80; i++) { try { if ((await fetch(ORIGIN + '/api/session')).ok) break; } catch {} await new Promise(r => setTimeout(r, 250)); }
const { chromium } = await import(pathToFileURL(path.resolve(KMP, '../video-project/node_modules/playwright/index.mjs')).href);
const browser = await chromium.launch();

async function open(lang, viewport, { reduced = false, dpr = 1 } = {}) {
  const phone = viewport.width < 700;
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: dpr, isMobile: phone, hasTouch: phone, locale: { en: 'en-US', ar: 'ar-PS', he: 'he-IL' }[lang], reducedMotion: reduced ? 'reduce' : 'no-preference' });
  await ctx.route(u => !u.href.startsWith(ORIGIN), r => r.fulfill({ status: 404, body: '' }));
  const pg = await ctx.newPage();
  const label = `${lang} ${viewport.width}${reduced ? ' reduced' : ''}`;
  pg.on('pageerror', e => fail(`${label}: page error ${e.message}`));
  pg.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|status of 404/.test(m.text())) fail(`${label}: console ${m.text().slice(0, 160)}`); });
  await pg.addInitScript(l => {
    try { localStorage.setItem('salonieer_lang', l); } catch {}
    window.__cls = 0; window.__shifts = [];
    new PerformanceObserver(list => { for (const e of list.getEntries()) if (!e.hadRecentInput) { window.__cls += e.value; window.__shifts.push({ v: e.value, at: Math.round(e.startTime), src: e.sources?.map(s => s.node?.className || s.node?.nodeName).join(',') }); } }).observe({ type: 'layout-shift', buffered: true });
    window.__lcp = 0; new PerformanceObserver(list => { for (const e of list.getEntries()) window.__lcp = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
  }, lang);
  await pg.goto(ORIGIN + '/');
  await pg.waitForSelector('.sc-home .sc-tablet img', { timeout: 30000 });
  await pg.waitForFunction(() => document.fonts.status === 'loaded');
  return { pg, ctx, label };
}
// Scroll through the page so lazy pictures load, then check every picture.
async function walk(pg) {
  await pg.evaluate(async () => {
    const step = innerHeight * 0.8;
    for (let y = 0; y < document.scrollingElement.scrollHeight; y += step) { scrollTo(0, y); await new Promise(r => setTimeout(r, 180)); }
    scrollTo(0, 0);
  });
  await pg.waitForTimeout(400);
}
const pictures = pg => pg.evaluate(() => [...document.querySelectorAll('.sc-home .sc-screen img')].map(i => ({ src: i.currentSrc || i.src, w: i.naturalWidth, complete: i.complete, panel: !!i.closest('.sc-panel:not(.is-active)') })));

const WIDTHS = [[360, 780], [390, 844], [768, 1024], [1024, 768], [1280, 900], [1440, 900], [1920, 1080]];
try {
  // ── every language at every width ──
  for (const lang of ['en', 'ar', 'he']) {
    for (const [w, h] of WIDTHS) {
      const { pg, ctx, label } = await open(lang, { width: w, height: h });
      const dir = await pg.evaluate(() => document.documentElement.dir);
      if (dir !== (lang === 'en' ? 'ltr' : 'rtl')) fail(`${label}: dir ${dir}`);
      const initial = await pg.evaluate(() => performance.getEntriesByType('resource').filter(r => /\/assets\/img\/showcase\//.test(r.name)).map(r => r.name.split('/').pop()));
      await walk(pg);
      const pics = await pictures(pg);
      const wrong = pics.filter(p => !p.src.includes(`-${lang}-`));
      if (wrong.length) fail(`${label}: pictures of another language: ${wrong.map(p => p.src.split('/').pop()).join(', ')}`);
      const broken = pics.filter(p => !p.panel && (!p.complete || !p.w));
      if (broken.length) fail(`${label}: pictures not loaded: ${broken.map(p => p.src.split('/').pop()).join(', ')}`);
      const tiny = await pg.evaluate(() => [...document.querySelectorAll('.sc-home .sc-device')].filter(d => !d.closest('.sc-panel:not(.is-active)')).map(d => { const r = d.getBoundingClientRect(); return { id: d.dataset.zoom.split('/').pop(), w: Math.round(r.width), h: Math.round(r.height) }; }).filter(d => d.w < 60 || d.h < 60));
      if (tiny.length) fail(`${label}: devices drawn too small: ${JSON.stringify(tiny)}`);
      const sx = await pg.evaluate(() => ({ doc: document.scrollingElement.scrollWidth, view: innerWidth, wide: [...document.querySelectorAll('.sc-home *')].filter(el => { const r = el.getBoundingClientRect(); return r.right > innerWidth + 1 && !el.closest('.sc-steps,.sc-tabs') && getComputedStyle(el).position !== 'fixed'; }).slice(0, 3).map(el => el.className || el.nodeName) }));
      if (sx.doc > sx.view + 1) fail(`${label}: page scrolls sideways (${sx.doc} > ${sx.view}) ${sx.wide.join(' ')}`);
      const perf = await pg.evaluate(() => ({ cls: window.__cls, shifts: window.__shifts, lcp: window.__lcp }));
      if (perf.cls > 0.05) fail(`${label}: layout shift ${perf.cls.toFixed(3)} ${JSON.stringify(perf.shifts.slice(0, 4))}`);
      const bytes = await pg.evaluate(() => performance.getEntriesByType('resource').filter(r => /\/assets\/img\/showcase\//.test(r.name)).reduce((s, r) => s + (r.encodedBodySize || r.transferSize || 0), 0));
      ok(`${label}: ${dir}, ${pics.length} pictures in ${lang}, first view loads ${initial.length} (${initial.join(' ')}), all pictures ${(bytes / 1024).toFixed(0)} KB, CLS ${perf.cls.toFixed(3)}, LCP ${Math.round(perf.lcp)} ms`);
      if ([390, 1440].includes(w) || (w === 768)) await pg.screenshot({ path: path.join(SHOTS, `home-${lang}-${w}.png`), fullPage: true });
      await ctx.close();
    }
  }
  // ── the language switch: every picture changes at once, the chosen tab stays ──
  {
    const { pg, ctx, label } = await open('en', { width: 1280, height: 900 });
    await pg.click('#tab-team'); await pg.waitForTimeout(300);
    for (const lang of ['ar', 'he', 'en']) {
      await pg.selectOption('#language', lang);
      await pg.waitForFunction(l => document.documentElement.lang === l && [...document.querySelectorAll('.sc-home .sc-screen img')].length > 0 && [...document.querySelectorAll('.sc-home .sc-screen img')].every(i => i.src.includes(`-${l}-`)), lang, { timeout: 5000 })
        .then(() => ok(`switch to ${lang}: every picture is now ${lang}`)).catch(() => fail(`switch to ${lang}: pictures did not all change`));
      const st = await pg.evaluate(() => ({ dir: document.documentElement.dir, tab: document.querySelector('.sc-tab[aria-selected=true]')?.dataset.tab, panel: document.querySelector('.sc-panel.is-active')?.id, h1: document.querySelector('#hm-title')?.textContent }));
      if (st.dir !== (lang === 'en' ? 'ltr' : 'rtl')) fail(`switch to ${lang}: dir ${st.dir}`);
      if (st.tab !== 'team' || st.panel !== 'tour-team') fail(`switch to ${lang}: tour tab not kept (${st.tab}, ${st.panel})`); else ok(`switch to ${lang}: ${st.dir}, tour still on Team, title "${st.h1}"`);
      await pg.locator('#tour').scrollIntoViewIfNeeded();
      await pg.waitForFunction(() => { const i = document.querySelector('#tour-team .sc-screen img'); return i && i.complete && i.naturalWidth > 0; }, null, { timeout: 5000 })
        .then(() => ok(`switch to ${lang}: the Team screen loaded`)).catch(() => fail(`switch to ${lang}: the Team screen did not load`));
    }
    await ctx.close();
  }
  // ── tabs: mouse, keyboard (mirrored in RTL), one cell for all panels ──
  for (const lang of ['en', 'ar']) {
    const { pg, ctx, label } = await open(lang, { width: 1280, height: 900 });
    await pg.locator('#tour').scrollIntoViewIfNeeded();
    const hBefore = await pg.evaluate(() => document.querySelector('.sc-panels').getBoundingClientRect().height);
    for (const id of ['schedule', 'clients', 'team', 'stats', 'specialist', 'dashboard']) {
      await pg.click(`#tab-${id}`); await pg.waitForTimeout(500);
      const s = await pg.evaluate(id => ({ sel: document.querySelector(`#tab-${id}`).getAttribute('aria-selected'), vis: getComputedStyle(document.querySelector(`#tour-${id}`)).visibility, others: [...document.querySelectorAll('.sc-panel')].filter(p => p.id !== `tour-${id}` && getComputedStyle(p).visibility === 'visible').length, img: (() => { const i = document.querySelector(`#tour-${id} img`); return i.complete && i.naturalWidth > 0; })(), h: document.querySelector('.sc-panels').getBoundingClientRect().height }), id);
      if (s.sel !== 'true' || s.vis !== 'visible' || s.others) fail(`${label} tab ${id}: ${JSON.stringify(s)}`);
      if (!s.img) { await pg.waitForTimeout(800); }
      if (Math.abs(s.h - hBefore) > 1) fail(`${label} tab ${id}: the tour's height changed ${hBefore} → ${s.h}`);
    }
    await pg.focus('#tab-dashboard');
    await pg.keyboard.press(lang === 'ar' ? 'ArrowLeft' : 'ArrowRight');
    const k1 = await pg.evaluate(() => document.activeElement.id);
    await pg.keyboard.press('End'); const k2 = await pg.evaluate(() => document.activeElement.id);
    await pg.keyboard.press('Home'); const k3 = await pg.evaluate(() => document.activeElement.id);
    if (k1 !== 'tab-schedule' || k2 !== 'tab-specialist' || k3 !== 'tab-dashboard') fail(`${label} keyboard: ${k1} ${k2} ${k3}`); else ok(`${label}: tabs by mouse and keyboard (${lang === 'ar' ? 'ArrowLeft' : 'ArrowRight'} = next), height steady`);
    await ctx.close();
  }
  // ── the enlarged view ──
  for (const [w, h] of [[390, 844], [1280, 900]]) {
    const { pg, ctx, label } = await open('he', { width: w, height: h });
    await pg.locator('#tour-dashboard .sc-device').scrollIntoViewIfNeeded();
    await pg.click('#tour-dashboard .sc-device');
    await pg.waitForFunction(() => document.querySelector('#sc-lightbox')?.open, null, { timeout: 3000 });
    await pg.waitForFunction(() => { const i = document.querySelector('#sc-lightbox img'); return i.complete && i.naturalWidth > 0; }, null, { timeout: 5000 });
    const lb = await pg.evaluate(() => { const i = document.querySelector('#sc-lightbox img'), r = i.getBoundingClientRect(); return { src: i.src.split('/').pop(), w: Math.round(r.width), h: Math.round(r.height), vw: innerWidth, vh: innerHeight, locked: document.documentElement.classList.contains('sc-locked') }; });
    if (!lb.src.includes('-he-720') || lb.h > lb.vh || lb.w > lb.vw || !lb.locked) fail(`${label} enlarge: ${JSON.stringify(lb)}`);
    await pg.screenshot({ path: path.join(SHOTS, `lightbox-he-${w}.png`) });
    await pg.keyboard.press('Escape'); await pg.waitForTimeout(300);
    const closed = await pg.evaluate(() => ({ open: document.querySelector('#sc-lightbox').open, locked: document.documentElement.classList.contains('sc-locked'), focus: document.activeElement?.closest('#tour-dashboard') ? 'device' : document.activeElement?.tagName }));
    if (closed.open || closed.locked) fail(`${label} enlarge close: ${JSON.stringify(closed)}`); else ok(`${label}: enlarged ${lb.src} at ${lb.w}×${lb.h}, Escape closes, focus back on ${closed.focus}`);
    // The iPad picture too (largest file).
    const ipad = await pg.evaluate(() => { const r = document.querySelector('.sc-ipad .sc-device').getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; });
    if (ipad[0] < 200 || ipad[1] < 120) fail(`${label}: the iPad picture is ${ipad.join('×')}`);
    await pg.locator('.sc-ipad .sc-device').scrollIntoViewIfNeeded(); await pg.click('.sc-ipad .sc-device');
    await pg.waitForFunction(() => { const i = document.querySelector('#sc-lightbox img'); return document.querySelector('#sc-lightbox').open && i.complete && i.naturalWidth > 0; }, null, { timeout: 5000 });
    const lb2 = await pg.evaluate(() => { const r = document.querySelector('#sc-lightbox img').getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; });
    if (lb2.w > w || lb2.h > h) fail(`${label} enlarge iPad: ${JSON.stringify(lb2)}`);
    await pg.click('.sc-lb-close'); await pg.waitForTimeout(200);
    if (await pg.evaluate(() => document.querySelector('#sc-lightbox').open)) fail(`${label}: close button`);
    await ctx.close();
  }
  // ── reduced motion: nothing hidden, nothing moving ──
  {
    const { pg, ctx, label } = await open('ar', { width: 390, height: 844 }, { reduced: true });
    const r = await pg.evaluate(() => ({ anim: document.querySelector('.sc-home').classList.contains('sc-anim'), hidden: [...document.querySelectorAll('.sc-reveal')].filter(e => getComputedStyle(e).opacity !== '1').length }));
    if (r.anim || r.hidden) fail(`${label}: ${JSON.stringify(r)}`); else ok(`${label}: no fade-up, every section visible at once`);
    await ctx.close();
  }
  // ── yearly billing reads as a percentage discount, never as "a month free" ──
  for (const [lang, want] of [['en', '8.3% off'], ['ar', 'خصم 8.3%'], ['he', '8.3% הנחה']]) {
    const { pg, ctx, label } = await open(lang, { width: 390, height: 844 });
    await pg.goto(ORIGIN + '/plans'); await pg.waitForSelector('.interval-switch', { timeout: 20000 });
    const s = await pg.evaluate(() => ({ tag: document.querySelector('.interval-switch .save-tag')?.textContent.trim(), body: document.body.innerText }));
    if (s.tag !== want) fail(`${label} plans: yearly tag "${s.tag}" (want "${want}")`);
    if (/month free|free month|شهر مجان|חודש חינם/i.test(s.body)) fail(`${label} plans: still says a month free`);
    else if (s.tag === want) ok(`${label} plans: yearly shows "${s.tag}", no "month free" anywhere`);
    await pg.click('.interval-switch [data-interval="year"]'); await pg.waitForTimeout(300);
    if (lang === 'ar') await pg.screenshot({ path: path.join(SHOTS, 'plans-ar-yearly.png') });
    await ctx.close();
  }
  // ── the rest of the site still opens ──
  {
    const { pg, ctx } = await open('en', { width: 1280, height: 900 });
    for (const p of ['/plans', '/register', '/login', '/support', '/terms', '/privacy']) {
      await pg.click(`a[href="${p}"]`).catch(async () => { await pg.goto(ORIGIN + p); });
      await pg.waitForFunction(p => location.pathname === p && document.querySelector('main#main') && !document.querySelector('main.is-leaving'), p, { timeout: 15000 }).catch(() => {});
      await pg.waitForTimeout(500);
      const s = await pg.evaluate(() => ({ path: location.pathname, h1: document.querySelector('main h1, main h2')?.textContent?.trim().slice(0, 40), err: !!document.querySelector('main.empty-state [role=alert]') }));
      if (s.path !== p || s.err || !s.h1) fail(`page ${p}: ${JSON.stringify(s)}`); else ok(`page ${p}: "${s.h1}"`);
      await pg.goto(ORIGIN + '/'); await pg.waitForSelector('.sc-home');
    }
    // Home → prices anchor and the plan buttons.
    const plans = await pg.evaluate(() => [...document.querySelectorAll('#prices .hm-plan a.btn')].map(a => a.getAttribute('href')));
    if (!plans.length) fail('home: no plan buttons in #prices'); else ok(`home prices: ${plans.join(' ')}`);
    await ctx.close();
  }
} catch (e) { fail('CRASHED ' + (e.stack || e.message)); }
await browser.close(); php.kill(); fake.close();
if (/Fatal|Parse error|Warning/.test(phpLog)) console.log('PHP log:\n' + phpLog.split('\n').filter(l => /Fatal|Parse|Warning/.test(l)).slice(0, 10).join('\n'));
console.log(failures.length ? `\n${failures.length} FAILED` : '\nALL CHECKS PASSED');
process.exit(failures.length ? 1 : 0);
