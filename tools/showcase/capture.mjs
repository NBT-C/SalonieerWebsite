// Real Salonieer app screens for the website's home page, captured offline.
// The REAL app (Salonieer-KMP/web) runs in Chromium; every Supabase call is answered by the REAL backend
// (Salonieer-KMP/INSTALL.sql in embedded Postgres, through the app's own e2e harness). Nothing leaves this machine
// and no live data is read. The salons, people and visits are made up (seed.mjs), one salon per site language.
//   node capture.mjs explore [ar|en|he] [light|dark]   → explore/<lang>-<mode>-<screen>.png (full pages, to choose)
//   node capture.mjs final [langs]                     → raw/<lang>/<screen>.png + .json, then build.mjs makes the WebP files
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { seedSalon, DATA, PASSWORD } from './seed.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const KMP = path.resolve(HERE, '../../../Salonieer-KMP');
const H = await import(pathToFileURL(path.join(KMP, 'tools/e2e_harness.mjs')).href);
const { chromium } = await import(pathToFileURL(path.resolve(KMP, '../video-project/node_modules/playwright/index.mjs')).href);
const [mode = 'explore', langArg, themeArg] = process.argv.slice(2);
const LANGS = (langArg || 'ar,en,he').split(',');
const log = (...a) => console.log('[cap]', ...a);

// ── the salons ──────────────────────────────────────────────────────────────
const dbx = await H.createDb();
const salons = {};
for (const lang of LANGS) {
  salons[lang] = await seedSalon(dbx, lang);
  const s = salons[lang];
  await dbx.db.query(`update shop_${s.S}.app_settings set logo_url = $1 where id = 1`, [`https://assets.showcase.test/${s.S}.png`]);
  await dbx.db.query(`update public.salon_registry set logo_url = $1 where slug = $2`, [`https://assets.showcase.test/${s.S}.png`, s.S]);
  log(`${lang}: ${s.L.name} · ${s.count} visits · today ${s.today} (now ${Math.floor(s.nowMin / 60)}:${String(s.nowMin % 60).padStart(2, '0')})`);
}

// ── the app in Chromium ─────────────────────────────────────────────────────
const WEB = path.join(KMP, 'web');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = path.join(WEB, p === '/' ? '/index.html' : p);
  if (!file.startsWith(WEB) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
  res.end(fs.readFileSync(file));
}).listen(0);
const BASE = `http://localhost:${server.address().port}`;
const browser = await chromium.launch();
const bridge = H.rpcBridge(dbx.db);
const rpcErrors = [];

// Each salon's logo: a monogram drawn here (no real brand).
const LOGO_LETTER = { lamsa: 'ل', velvet: 'V', katifa: 'ק' };
const logos = {};
{
  const pg = await browser.newPage({ viewport: { width: 256, height: 256 } });
  for (const lang of LANGS) {
    const slug = DATA[lang].slug;
    await pg.setContent(`<html><body style="margin:0;background:transparent"><svg width="256" height="256" viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg">
      <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F3DDB0"/><stop offset="1" stop-color="#B98F52"/></linearGradient></defs>
      <circle cx="128" cy="128" r="128" fill="#0B1F44"/><circle cx="128" cy="128" r="104" fill="none" stroke="url(#g)" stroke-width="3"/>
      <text x="128" y="${slug === 'lamsa' ? 150 : 160}" text-anchor="middle" font-family="${slug === 'lamsa' ? 'Arial' : slug === 'katifa' ? 'Arial' : 'Georgia, Times New Roman'}" font-size="${slug === 'lamsa' ? 120 : 112}" fill="url(#g)" font-weight="${slug === 'velvet' ? 400 : 700}">${LOGO_LETTER[slug]}</text></svg></body></html>`);
    logos[slug] = await pg.locator('svg').screenshot({ omitBackground: true });
  }
  await pg.close();
}

async function page(lang, { dark = false, width = 390, height = 797, dpr = 3, label = lang } = {}) {
  const s = salons[lang], phone = width < 700;
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dpr, isMobile: phone, hasTouch: true,
    locale: { ar: 'ar-PS', he: 'he-IL', en: 'en-US' }[lang], timezoneId: s.L.tz, serviceWorkers: 'block', colorScheme: dark ? 'dark' : 'light', reducedMotion: 'reduce' });
  await ctx.route(url => url.href.startsWith(H.SUPABASE), async route => {
    const req = route.request(), url = new URL(req.url());
    const m = url.pathname.match(/^\/rest\/v1\/rpc\/([a-z0-9_]+)$/);
    if (!m) return route.fulfill({ status: 200, contentType: 'application/json', body: req.method() === 'GET' ? '[]' : 'null' });
    let args = {}; try { args = JSON.parse(req.postData() || '{}'); } catch {}
    const r = await bridge.callRpc(m[1], args, bridge.jwtSub(req.headers()['authorization']));
    if (r.status !== 200) rpcErrors.push(`${label}: ${m[1]} → ${r.body.message}`);
    route.fulfill({ status: r.status, contentType: 'application/json', body: JSON.stringify(r.body) }).catch(() => {});
  });
  await ctx.route(url => url.href.startsWith('https://assets.showcase.test/'), route => {
    const slug = new URL(route.request().url()).pathname.slice(1).replace(/\.png$/, '');
    route.fulfill({ status: 200, contentType: 'image/png', body: logos[slug] || Buffer.alloc(0) });
  });
  await ctx.route(url => !url.href.startsWith(BASE) && !url.href.startsWith(H.SUPABASE) && !url.href.startsWith('https://assets.showcase.test/'), route => route.fulfill({ status: 404, body: '' }));
  const pg = await ctx.newPage();
  pg.on('pageerror', e => log('PAGEERROR', label, e.message));
  pg.on('dialog', d => d.dismiss().catch(() => {}));
  await pg.addInitScript(({ l, d }) => { try { localStorage.setItem('salonieer:language:v1', l); localStorage.setItem('aj_dark', d ? '1' : '0'); } catch {} }, { l: lang, d: dark });
  return pg;
}
const settle = async (pg, ms = 900) => { await H.settle(pg, ms); await pg.evaluate(() => document.fonts.ready); };
async function setDark(lang, dark) {
  const S = salons[lang].S;
  await dbx.db.query(`insert into shop_${S}.user_settings(user_id, dark_mode) select id, $1 from shop_${S}.users on conflict (user_id) do update set dark_mode = $1`, [dark]);
}
async function signIn(pg, lang, phone) {
  const s = salons[lang];
  await pg.goto(`${BASE}/index.html`);
  await pg.waitForSelector('#acc-go-login', { timeout: 30000 });
  await pg.click('#acc-go-login'); await pg.waitForSelector('#acc-login');
  await H.fillPhone(pg, phone, s.L.iso); await pg.fill('#acc-pass', PASSWORD); await pg.click('#acc-submit');
  await pg.waitForSelector(`[data-platform-pick="${s.S}"]`, { timeout: 30000 });
  await pg.click(`[data-platform-pick="${s.S}"]`);
  await H.waitHash(pg, /^#\/(home|admin|barber)/); await settle(pg, 1200);
}
const go = async (pg, hash, ms = 1500) => { await pg.evaluate(h => { location.hash = h; }, hash); await settle(pg, ms); };

// Words in another language than the picture's (the app is authored in Arabic and translated on screen).
async function foreign(pg, lang, clip) {
  return pg.evaluate(({ lang, clip }) => {
    const re = lang === 'ar' ? /[֐-׿]|\b[A-Za-z]{3,}\b/ : lang === 'he' ? /[؀-ۿ]|\b[A-Za-z]{3,}\b/ : /[؀-ۿ֐-׿]/;
    const allowed = /^(Salonieer|SALONIEER|Pro|Basic|QR|PIN|Excel|iPhone|Android|WhatsApp|Instagram|AM|PM)$/;
    const out = new Set(), sc = document.scrollingElement;
    const inClip = r => !clip || (r.bottom + sc.scrollTop > clip.y && r.top + sc.scrollTop < clip.y + clip.h);
    const walk = node => {
      if (node.nodeType === 3) {
        const t = node.nodeValue.trim(); if (!t) return;
        const el = node.parentElement, r = el.getBoundingClientRect();
        if (r.width < 1 || r.height < 1 || !inClip(r) || getComputedStyle(el).visibility === 'hidden') return;
        const words = lang === 'en' ? (re.test(t) ? [t] : []) : (t.match(lang === 'ar' ? /[֐-׿]+|[A-Za-z]{3,}/g : /[؀-ۿ]+|[A-Za-z]{3,}/g) || []).filter(w => !allowed.test(w));
        if (words.length) out.add(t.slice(0, 80));
        return;
      }
      if (node.nodeType !== 1 || node.matches('script,style,svg,[data-i18n-skip]')) return;
      for (const c of node.childNodes) walk(c);
    };
    walk(document.body);
    return [...out];
  }, { lang, clip });
}
async function moneyBoxes(pg) {
  return pg.evaluate(() => {
    const re = /[$₪€]\s?\d|\d\s?[$₪€]|شيكل|ש"ח|\bNIS\b|\bILS\b/i;
    const shown = el => { const r = el.getBoundingClientRect(); return r.width > 1 && r.height > 1; };
    return [...document.querySelectorAll('body *')].filter(el => shown(el) && !['SCRIPT', 'STYLE'].includes(el.tagName) && re.test(el.textContent) && ![...el.children].some(c => re.test(c.textContent)))
      .map(el => { const r = el.getBoundingClientRect(); return { t: el.textContent.trim().slice(0, 40), y: Math.round(r.top + document.scrollingElement.scrollTop) }; });
  });
}

// ── explore: full pages of every candidate screen ───────────────────────────
async function explore(lang, dark) {
  const s = salons[lang], OUT = path.join(HERE, 'explore');
  fs.mkdirSync(OUT, { recursive: true });
  await setDark(lang, dark);
  const tag = `${lang}-${dark ? 'dark' : 'light'}`;
  const snap = async (pg, id) => {
    await pg.addStyleTag({ content: '*{caret-color:transparent!important}' }).catch(() => {});
    await pg.screenshot({ path: path.join(OUT, `${tag}-${id}.png`), fullPage: true });
    const f = await foreign(pg, lang), m = await moneyBoxes(pg);
    log(tag, id, (await pg.evaluate(() => location.hash)), f.length ? 'FOREIGN: ' + f.join(' | ') : '', m.length ? 'MONEY: ' + m.map(x => x.t + '@' + x.y).join(' | ') : '');
  };
  {
    const pg = await page(lang, { dark, dpr: 1.5, label: tag + ' owner' });
    await signIn(pg, lang, s.ownerPhone);
    for (const [id, hash] of [['a-home', '#/admin/home'], ['a-schedule', '#/admin/schedule'], ['a-schedule-tomorrow', `#/admin/schedule?d=${s.tomorrow}`],
      ['a-bookings', '#/admin/bookings'], ['a-requests', '#/admin/requests'], ['a-users', '#/admin/users'], ['a-team', '#/admin/barbers'], ['a-insights', '#/admin/insights'],
      ['a-services', '#/admin/services'], ['a-g-sales', '#/admin/g-sales'], ['a-g-finance', '#/admin/g-finance'], ['a-checkout', '#/admin/biz-checkout'],
      ['a-attendance', '#/admin/biz-attendance'], ['a-waitlist', '#/admin/biz-waitlist'], ['a-retention', '#/admin/biz-retention'], ['a-notifications', '#/admin/notifications'],
      ['a-loyalty', '#/admin/loyalty'], ['a-settings', '#/admin/settings']]) {
      try { await go(pg, hash, 1800); await snap(pg, id); } catch (e) { log(tag, id, 'FAILED', e.message.split('\n')[0]); }
    }
    await pg.context().close();
  }
  {
    const pg = await page(lang, { dark, dpr: 1.5, label: tag + ' customer' });
    await signIn(pg, lang, s.bookerPhone);
    for (const [id, hash] of [['c-home', '#/home'], ['c-barber', `#/barber/${s.team[0].id}`], ['c-book', `#/book/${s.team[0].id}`], ['c-bookings', '#/bookings'],
      ['c-loyalty', '#/loyalty'], ['c-notifications', '#/notifications'], ['c-settings', '#/settings']]) {
      try { await go(pg, hash, 1800); await snap(pg, id); } catch (e) { log(tag, id, 'FAILED', e.message.split('\n')[0]); }
    }
    await pg.context().close();
  }
  {
    const pg = await page(lang, { dark, dpr: 1.5, label: tag + ' specialist' });
    await signIn(pg, lang, s.specPhone);
    for (const [id, hash] of [['s-dash', '#/barber-dash'], ['s-week', '#/barber-dash/week']]) {
      try { await go(pg, hash, 1800); await snap(pg, id); } catch (e) { log(tag, id, 'FAILED', e.message.split('\n')[0]); }
    }
    await pg.context().close();
  }
  {
    const pg = await page(lang, { dark, width: 1180, height: 796, dpr: 1, label: tag + ' tablet' });
    await signIn(pg, lang, s.ownerPhone);
    for (const [id, hash] of [['t-home', '#/admin/home'], ['t-schedule', '#/admin/schedule'], ['t-insights', '#/admin/insights'], ['t-users', '#/admin/users']]) {
      try { await go(pg, hash, 1800); await snap(pg, id); } catch (e) { log(tag, id, 'FAILED', e.message.split('\n')[0]); }
    }
    await pg.context().close();
  }
}

try {
  if (mode === 'explore') for (const lang of LANGS) for (const dark of (themeArg ? [themeArg === 'dark'] : [false])) await explore(lang, dark);
  else if (mode === 'final') { const { finalShots } = await import('./shots.mjs'); await finalShots({ salons, page, signIn, go, settle, setDark, foreign, moneyBoxes, log, db: dbx.db, HERE }); }
  if (rpcErrors.length) log('server errors:', [...new Set(rpcErrors)].slice(0, 30).join(' | '));
} catch (e) { log('FAILED', e.stack || e.message); process.exitCode = 1; }
await browser.close(); server.close();
log('done');
