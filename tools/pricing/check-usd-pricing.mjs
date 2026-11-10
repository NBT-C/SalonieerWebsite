// USD price list with approximate local prices (2026-10-31). The REAL website (PHP, php -S, a copy of salonieerwebsite)
// with the REAL backend (Salonieer-KMP INSTALL.sql in embedded Postgres behind a fake Supabase), fake exchange-rate
// sources and a stub Paddle.js on 127.0.0.1. Nothing leaves this machine; synthetic data only.
//   node check-usd-pricing.mjs   → ✓/✗ per check, pictures in shots/
// Checks: USD prices ($20 / $40 / +$5 / $3, yearly 11×) in quotes, checkout items (the new USD Paddle prices), emails;
// local display by country (IL → ≈ ₪, US → $ only), the "Show prices in" picker (remembered), en/ar/he, phone width;
// rate failures (all sources down, a wrong source, stale data) → US dollars only or the next good source; existing
// subscriptions on the old shekel list keep changing within it.
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SITE = path.resolve(HERE, '../../salonieerwebsite');
const KMP = path.resolve(HERE, '../../../Salonieer-KMP');
const H = await import(pathToFileURL(path.join(KMP, 'tools/e2e_harness.mjs')).href);
const PHP = process.env.PHP || 'C:/tools/php/php.exe';
const WORK = path.join(os.tmpdir(), 'salonieer-usd-pricing'), WWW = path.join(WORK, 'www'), PRIV = path.join(WORK, 'salonieer-private');
const SHOTS = path.join(HERE, 'shots'); fs.mkdirSync(SHOTS, { recursive: true });
const PORT = 8095, SB = 8102, FX = 8103, ORIGIN = `http://127.0.0.1:${PORT}`;
const { ok, fail, failures } = H;
const must = (cond, msg) => { if (!cond) throw new Error(msg); };
const check = (cond, good, bad) => cond ? ok(good) : fail(bad);

fs.rmSync(WORK, { recursive: true, force: true }); fs.mkdirSync(PRIV, { recursive: true });
fs.cpSync(SITE, WWW, { recursive: true, filter: s => !/[\\/](\.git|\.superdesign|bob\.zip|services)([\\/]|$)/.test(s) });
fs.writeFileSync(path.join(PRIV, '.env'), `SUPABASE_URL=http://127.0.0.1:${SB}\nSUPABASE_PUBLIC_URL=https://storage.example.test\nSUPABASE_SERVICE_ROLE_KEY=sb_secret_fake\nSITE_URL=${ORIGIN}\nFX_TEST_BASE=http://127.0.0.1:${FX}\n`);
fs.writeFileSync(path.join(WORK, 'router.php'), `<?php\n$p = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);\n$f = $_SERVER['DOCUMENT_ROOT'] . $p;\nif ($p !== '/' && is_file($f) && !str_ends_with($f, '.php')) return false;\nrequire $_SERVER['DOCUMENT_ROOT'] . '/index.php';\n`);
const resetRates = () => { for (const f of ['fx-rates.json', 'fx-rates.lock']) fs.rmSync(path.join(PRIV, f), { force: true }); };

// ── Fake exchange-rate sources: open.er-api.com, currency-api (two mirrors) and the ECB (frankfurter) ─────────────
const RATES = { ILS: 3.1, EUR: 0.9, GBP: 0.75, JOD: 0.709, SAR: 3.75, AED: 3.6725, EGP: 48.5, JPY: 152.3, CAD: 1.39, AUD: 1.42, CHF: 0.82, TRY: 41.2, INR: 94.9,
  KWD: 0.306, BHD: 0.376, QAR: 3.64, OMR: 0.3845, MAD: 9.1, TND: 2.95, DZD: 130.2, PLN: 3.6, SEK: 9.4, NOK: 10.1, DKK: 6.69, CZK: 21.8, HUF: 328, RON: 4.5, IDR: 18148 };
const ECB = ['ILS','EUR','GBP','JPY','CAD','AUD','CHF','TRY','INR','PLN','SEK','NOK','DKK','CZK','HUF','RON','IDR'];
let fxMode = 'ok', fxHits = 0;
const today = () => new Date().toISOString().slice(0, 10), daysAgo = n => new Date(Date.now() - n * 864e5);
const fx = http.createServer((rq, rs) => {
  fxHits++;
  const send = (st, b) => { rs.writeHead(st, { 'content-type': 'application/json' }); rs.end(JSON.stringify(b)); };
  const u = new URL(rq.url, 'http://x');
  if (fxMode === 'down') return send(503, { error: 'down' });
  const stale = fxMode === 'stale', when = stale ? daysAgo(10) : new Date();
  const scaled = k => fxMode === 'wrong-main' && u.pathname === '/er/USD' ? 10 : 1;
  if (u.pathname === '/er/USD') return send(200, { result: 'success', base_code: 'USD', time_last_update_unix: Math.floor(when / 1000), rates: Object.fromEntries([['USD', 1], ...Object.entries(RATES).map(([k, v]) => [k, v * scaled(k)])]) });
  if (u.pathname === '/fa/usd.min.json' || u.pathname === '/fb/usd.min.json') return send(200, { date: stale ? when.toISOString().slice(0, 10) : today(), usd: Object.fromEntries([['usd', 1], ...Object.entries(RATES).map(([k, v]) => [k.toLowerCase(), v * 1.004])]) });
  if (u.pathname === '/ecb') return send(200, { amount: 1, base: 'USD', date: today(), rates: Object.fromEntries(ECB.map(k => [k, RATES[k] * 0.998])) });
  send(404, {});
});
await new Promise(r => fx.listen(FX, '127.0.0.1', r));

// ── Fake Supabase on the real backend ───────────────────────────────────────────────────────────────────────────
const { db } = await H.createDb();
const bridge = H.rpcBridge(db);
const fake = http.createServer((rq, rs) => {
  const chunks = []; rq.on('data', c => chunks.push(c)); rq.on('end', async () => {
    const send = (st, b) => { rs.writeHead(st, { 'content-type': 'application/json' }); rs.end(b === undefined ? '' : JSON.stringify(b)); };
    const url = new URL(rq.url, 'http://x');
    if (url.pathname.startsWith('/storage/v1/object/')) return send(200, { Key: url.pathname.slice(19) });
    const m = url.pathname.match(/^\/rest\/v1\/rpc\/([a-z_][a-z0-9_]*)$/);
    if (!m) return send(404, { message: 'not found' });
    let args = {}; try { args = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}; } catch {}
    const r = await bridge.callRpc(m[1], args, rq.headers.apikey === 'sb_secret_fake' ? H.SERVICE : null);
    send(r.status, r.body);
  });
});
await new Promise(r => fake.listen(SB, '127.0.0.1', r));
const php = spawn(PHP, ['-S', `127.0.0.1:${PORT}`, '-t', WWW, path.join(WORK, 'router.php')], { stdio: ['ignore', 'pipe', 'pipe'] });
let phpLog = ''; php.stdout.on('data', d => phpLog += d); php.stderr.on('data', d => phpLog += d);
for (let i = 0; i < 60; i++) { try { if ((await fetch(ORIGIN + '/api/session')).ok) break; } catch {} await new Promise(r => setTimeout(r, 200)); }
const { chromium } = await import(pathToFileURL(path.resolve(KMP, '..', 'video-project/node_modules/playwright/index.mjs')).href);
const browser = await chromium.launch();

// A browser in a given country (what api.country.is answers) and time zone; Paddle.js is a stub that records the checkout.
const PADDLE_STUB = `window.Paddle={Environment:{set(){}},Initialize(o){window.__paddleInit=o},Checkout:{open(o){window.__checkout=o},close(){}}};`;
async function visitor(label, country, timezoneId, viewport = { width: 1280, height: 900 }) {
  const ctx = await browser.newContext({ viewport, locale: 'en-US', timezoneId });
  await ctx.route('https://api.country.is/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ip: '203.0.113.9', country }) }));
  await ctx.route('https://cdn.paddle.com/**', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: PADDLE_STUB }));
  const pg = await ctx.newPage();
  pg.on('pageerror', e => fail(`${label}: page error ${e.message}`));
  pg.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|status of (400|401|403|404|409)|Content Security Policy|ERR_/.test(m.text())) fail(`${label}: console ${m.text().slice(0, 200)}`); });
  return pg;
}
const siteApi = (pg, method, url, body) => pg.evaluate(async ({ method, url, body }) => {
  const me = await (await fetch('/api/session')).json();
  const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': me.csrf }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: r.status, data: await r.json().catch(() => null) };
}, { method, url, body });
// The site's own ?lang= link stores the language.
const setLang = async (pg, l) => { await pg.goto(ORIGIN + '/?lang=' + l); await pg.waitForLoadState('networkidle'); };
const open = async (pg, route, sel) => { await pg.goto(ORIGIN + route); await pg.waitForSelector(sel, { timeout: 20000 }); await pg.waitForTimeout(150); };
// The Pro row on /plans: main amount, the USD line under it, and the picker's value.
const proRow = pg => pg.evaluate(() => {
  const p = document.querySelector('#plan-pro .price');
  return { main: p?.querySelector('.px-local, bdi')?.textContent.trim(), usd: p?.querySelector('.px-usd')?.textContent.trim() || '', pick: document.querySelector('[data-display-currency]')?.value || null,
    note: document.querySelector('.fx-note')?.textContent.trim() || '', basic: document.querySelector('#plan-basic .price .px-local, #plan-basic .price bdi')?.textContent.trim() };
});
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const USD_IDS = { monthPro: 'pri_01m69c7np1xtzt1ymd8wn81872', yearBasic: 'pri_01m69c7pher6h86m6enwef26q4', yearOption: 'pri_01m69c7qakpt8chys1d7zjp6hj', yearSpecialist: 'pri_01m69c7qjta3590m72y1rs98yy', monthTrialPro: 'pri_01m69c7qv32a22v08ydp14hme3' };

try {
  // ── 1. The price list served to everyone ───────────────────────────────────────────────────────────────────────
  resetRates();
  const plans = await (await fetch(ORIGIN + '/api/plans?cc=IL')).json();
  const price = id => plans.plans.find(p => p.id === id)?.prices;
  check(JSON.stringify(plans.currencies) === '["USD"]' && price('basic').USD === 20 && price('pro').USD === 40 && price('enterprise').USD === null && plans.addons.loyalty.USD === 3 && plans.addons.specialist.USD === 5 && plans.yearlyMonths === 11,
    'price list: USD only — Basic $20, Pro $40, Enterprise by agreement, Basic option $3, extra specialist $5, yearly 11×', 'price list ' + JSON.stringify(plans).slice(0, 400));
  check(plans.fx?.local === 'ILS' && plans.fx.rates.ILS === 3.1 && plans.fx.rates.USD === 1 && !('XYZ' in plans.fx.rates), `rates: checked table served (ILS ${plans.fx?.rates?.ILS}, as of ${plans.fx?.asOf}), Israel → ILS`, 'fx ' + JSON.stringify(plans.fx));
  const us = await (await fetch(ORIGIN + '/api/plans?cc=US')).json(), de = await (await fetch(ORIGIN + '/api/plans?cc=DE')).json(), ps = await (await fetch(ORIGIN + '/api/plans?cc=PS')).json(), zz = await (await fetch(ORIGIN + '/api/plans?cc=BV')).json();
  check(us.fx.local === 'USD' && de.fx.local === 'EUR' && ps.fx.local === 'ILS' && zz.fx.local === 'USD', 'country → currency: US → USD, DE → EUR, PS → ILS, unknown → USD', `locals ${[us, de, ps, zz].map(x => x.fx?.local)}`);
  const hits = fxHits; await fetch(ORIGIN + '/api/plans'); check(fxHits === hits, 'rates are cached (no new downloads on the next visit)', `downloads on a cached visit: ${fxHits - hits}`);

  // ── 2. A visitor in Israel: approximate shekels, USD under them, in every language and at phone width ─────────
  const il = await visitor('IL visitor', 'IL', 'Asia/Jerusalem');
  for (const lang of ['en', 'ar', 'he']) {
    await il.goto(ORIGIN + '/'); await setLang(il, lang);
    await open(il, '/plans', '#plan-pro .price');
    const r = await proRow(il);
    const dir = await il.evaluate(() => document.documentElement.dir);
    check(r.main === '≈ ₪124' && r.usd === '$40 USD' && r.basic === '≈ ₪62' && r.pick === 'ILS' && r.note.includes({ en: 'approximate', ar: 'تقريبية', he: 'משוערים' }[lang]) && dir === (lang === 'en' ? 'ltr' : 'rtl'), `${lang} /plans for Israel: Pro "${r.main}" with "${r.usd}", Basic "${r.basic}", picker ${r.pick}; note: "${r.note.slice(0, 80)}…"`, `${lang} /plans IL ${JSON.stringify(r)}`);
    await il.screenshot({ path: path.join(SHOTS, `plans-il-${lang}.png`), fullPage: true });
    await open(il, '/', '#prices .hm-plan');
    const home = await il.evaluate(() => [...document.querySelectorAll('#prices .hm-price')].map(p => p.textContent.replace(/\s+/g, ' ').trim()));
    check(home[0].startsWith('≈ ₪62') && home[0].includes('$20 USD') && home[1].startsWith('≈ ₪124') && home[1].includes('$40 USD'), `${lang} home prices: "${home.slice(0, 2).join('" | "')}"`, `${lang} home ${JSON.stringify(home)}`);
  }
  // Yearly: 11 × monthly, in USD and converted.
  await setLang(il, 'en'); await open(il, '/plans', '#plan-pro .price');
  await il.click('[data-interval="year"]'); await il.waitForTimeout(200);
  let r = await proRow(il);
  check(r.main === '≈ ₪1,364' && r.usd === '$440 USD', `yearly Pro: "${r.main}" with "${r.usd}" (11 × $40)`, 'yearly ' + JSON.stringify(r));
  const tag = await il.evaluate(() => document.querySelector('[data-interval="year"] .save-tag')?.textContent);
  check(tag === '8.3% off', `yearly tag still "${tag}"`, 'yearly tag ' + tag);
  await il.click('[data-interval="month"]'); await il.waitForTimeout(200);
  // Phone width, Arabic: nothing scrolls sideways.
  await setLang(il, 'ar'); await il.setViewportSize({ width: 390, height: 844 }); await open(il, '/plans', '#plan-pro .price');
  await H.noOverflow(il, 'ar /plans at phone width (≈ ₪ prices)');
  await il.screenshot({ path: path.join(SHOTS, 'plans-il-ar-phone.png'), fullPage: true });
  await open(il, '/', '#prices .hm-plan'); await H.noOverflow(il, 'ar home at phone width');
  await il.setViewportSize({ width: 1280, height: 900 }); await setLang(il, 'en');

  // ── 3. Choosing another currency by hand: remembered; USD shows only dollars ───────────────────────────────────
  await open(il, '/plans', '#plan-pro .price');
  await il.selectOption('[data-display-currency]', 'EUR'); await il.waitForTimeout(200);
  r = await proRow(il);
  check(r.main === '≈ €36' && r.usd === '$40 USD' && r.pick === 'EUR', `picker → EUR: Pro "${r.main}"`, 'EUR ' + JSON.stringify(r));
  await il.reload(); await il.waitForSelector('#plan-pro .price'); r = await proRow(il);
  check(r.pick === 'EUR' && r.main === '≈ €36', 'EUR is remembered after a reload', 'EUR after reload ' + JSON.stringify(r));
  const options = await il.evaluate(() => [...document.querySelectorAll('[data-display-currency] option')].map(o => o.value));
  check(options[0] === 'USD' && options[1] === 'ILS' && options.includes('JOD') && options.includes('SAR'), `picker lists ${options.length} currencies, starting ${options.slice(0, 4).join(', ')}`, 'options ' + options);
  await il.selectOption('[data-display-currency]', 'USD'); await il.waitForTimeout(200); r = await proRow(il);
  check(r.main === '$40' && r.usd === '' && /US dollars/.test(r.note), `picker → USD: Pro "${r.main}", no second line, note "${r.note}"`, 'USD ' + JSON.stringify(r));
  await il.selectOption('[data-display-currency]', 'KWD'); await il.waitForTimeout(200);
  const kwd = await il.evaluate(() => document.querySelector('.extras .menu-row .price')?.textContent.replace(/\s+/g, ' ').trim());
  check(/^≈ KWD\s?0\.92/.test(kwd), `small amounts keep cents: Basic option in KWD "${kwd}"`, 'KWD ' + kwd);
  await il.selectOption('[data-display-currency]', 'ILS');

  // ── 4. A visitor in the US: dollars only by default ────────────────────────────────────────────────────────────
  const usv = await visitor('US visitor', 'US', 'America/New_York');
  await open(usv, '/plans', '#plan-pro .price'); r = await proRow(usv);
  check(r.main === '$40' && r.usd === '' && r.pick === 'USD', `US visitor: Pro "${r.main}", picker ${r.pick}`, 'US ' + JSON.stringify(r));
  // The country lookup failing: the device's time zone decides (Amman → JOD).
  const jo = await browser.newContext({ viewport: { width: 1280, height: 900 }, timezoneId: 'Asia/Amman' });
  await jo.route('https://api.country.is/**', rt => rt.abort()); await jo.route('https://cdn.paddle.com/**', rt => rt.fulfill({ status: 200, contentType: 'text/javascript', body: PADDLE_STUB }));
  const jop = await jo.newPage(); await open(jop, '/plans', '#plan-pro .price'); r = await proRow(jop);
  check(r.pick === 'JOD' && /^≈ JOD\s?28$/.test(r.main), `no IP lookup → time zone Asia/Amman → "${r.main}"`, 'JO ' + JSON.stringify(r));

  // ── 5. Applying and paying: everything in USD with the new Paddle prices ───────────────────────────────────────
  const applicant = il;
  let res = await siteApi(applicant, 'POST', '/api/register', { fullName: 'Rana Haddad', email: 'rana@example.test', country: 'PS', gender: 'female', password: 'Qv8#tLw2!pZr6$mN', passwordConfirm: 'Qv8#tLw2!pZr6$mN', website: '' });
  must(res.status === 201, 'sign-up ' + JSON.stringify(res));
  const body = (o) => ({ submissionKey: `usd-${Math.random().toString(36).slice(2)}abcdefghij`, salonName: 'Rana Salon', identityNumber: '407815263', plan: 'pro', paymentMethod: 'card', loyalty: false, extraSpecialists: 0, logo: PNG,
    currency: 'USD', interval: 'month', trial: false, teamComposition: 'female', clientele: 'women', timezone: 'Asia/Hebron', phoneCountry: 'PS', phone: '0597555111', lang: 'en', ...o });
  res = await siteApi(applicant, 'POST', '/api/applications', body({ currency: 'ILS', salonName: 'Old Currency' }));
  check(res.status === 400 && res.data?.error === 'invalidCurrency', 'an application in ILS is refused (400 invalidCurrency)', 'ILS application ' + JSON.stringify(res).slice(0, 200));
  res = await siteApi(applicant, 'POST', '/api/applications', body({ salonName: 'Rana Pro' }));
  must(res.status === 201, 'pro application ' + JSON.stringify(res).slice(0, 300));
  const proApp = res.data.application;
  res = await siteApi(applicant, 'POST', '/api/applications', body({ salonName: 'Rana Basic Yearly', identityNumber: '407815263', plan: 'basic', interval: 'year', loyalty: true, option: 'smart_waitlist', extraSpecialists: 2 }));
  must(res.status === 201, 'basic application ' + JSON.stringify(res).slice(0, 300));
  const basicApp = res.data.application;
  check(proApp.quote.currency === 'USD' && Number(proApp.quote.total) === 40 && proApp.quote.region === 'usd2026' && basicApp.quote.currency === 'USD' && Number(basicApp.quote.total) === 220 + 33 + 2 * 55,
    `quotes in USD: Pro monthly $${proApp.quote.total}; Basic yearly + option + 2 specialists $${basicApp.quote.total} (220 + 33 + 110)`, 'quotes ' + JSON.stringify([proApp.quote, basicApp.quote]));
  // The checkout opened from Applications uses the new USD Paddle prices.
  await open(applicant, '/applications', '[data-pay]');
  const cards = await applicant.evaluate(() => [...document.querySelectorAll('.application-card .price-value')].map(e => e.textContent.trim()));
  check(cards.includes('$40') && cards.includes('$363'), `applications list totals: ${cards.join(', ')}`, 'cards ' + cards);
  const payPro = async id => { await applicant.evaluate(() => { window.__checkout = null; }); await applicant.click(`[data-pay="${id}"]`); await applicant.waitForFunction(() => window.__checkout, null, { timeout: 10000 }); return applicant.evaluate(() => window.__checkout.items); };
  let items = await payPro(proApp.id);
  check(items.length === 1 && items[0].priceId === USD_IDS.monthPro, `Pro monthly checkout → ${items.map(i => i.priceId).join(', ')} (USD $40)`, 'pro checkout ' + JSON.stringify(items));
  await open(applicant, '/applications', '[data-pay]');
  items = await payPro(basicApp.id);
  check(JSON.stringify(items) === JSON.stringify([{ priceId: USD_IDS.yearBasic, quantity: 1 }, { priceId: USD_IDS.yearOption, quantity: 1 }, { priceId: USD_IDS.yearSpecialist, quantity: 2 }]),
    'Basic yearly checkout → USD yearly Basic + option + 2 × specialist', 'basic checkout ' + JSON.stringify(items));
  const cfg = await applicant.evaluate(async () => (await (await fetch('/api/session')).json()).checkout);
  check(cfg.tier === 'usd2026' && cfg.catalog.month_trial.pro === USD_IDS.monthTrialPro && cfg.trialEligible === true, 'checkout config: tier usd2026, the trial uses the USD trial price', 'checkout cfg ' + JSON.stringify(cfg).slice(0, 300));
  // The application form: options show ≈ ₪ with the USD amount; the summary total is exact USD with ≈ under it.
  await open(applicant, '/apply?plan=pro', '#order-summary .summary-total');
  const form = await applicant.evaluate(() => ({ option: document.querySelector('#plan option[value=pro]')?.textContent, total: document.querySelector('#order-summary .summary-total')?.textContent.replace(/\s+/g, ' ').trim() }));
  check(form.option === 'Pro · ≈ ₪124 ($40) / month' && /\$40/.test(form.total) && /≈ ₪124/.test(form.total) && /Charged in USD/.test(form.total), `apply form: "${form.option}"; summary "${form.total}"`, 'apply form ' + JSON.stringify(form));
  await applicant.screenshot({ path: path.join(SHOTS, 'apply-il-en.png'), fullPage: true });

  // ── 6. Emails: the admin's new-application email says USD ──────────────────────────────────────────────────────
  const out = await bridge.callRpc('website_outbox_claim', { p_limit: 50 }, H.SERVICE);
  const mailItems = out.body.filter(i => i.template === 'admin_new_application');
  fs.writeFileSync(path.join(WORK, 'items.json'), JSON.stringify(mailItems));
  const mails = JSON.parse(execFileSync(PHP, [path.resolve(HERE, '../admin/render-mail.php'), path.join(SITE, 'mail.php'), path.join(WORK, 'items.json')], { encoding: 'utf8' }));
  const totals = mails.map(m => (m.text.match(/^Total: .*$/m) || ['(none)'])[0]);
  check(totals.includes('Total: 40 USD / month') && totals.includes('Total: 363 USD / year'), `admin emails: "${totals.join('", "')}"`, 'emails ' + JSON.stringify(totals));

  // ── 7. Exchange-rate failures ──────────────────────────────────────────────────────────────────────────────────
  const fxOf = async () => (await (await fetch(ORIGIN + '/api/plans?cc=IL')).json()).fx;
  fxMode = 'wrong-main'; resetRates();
  let f = await fxOf();
  check(f && Math.abs(f.rates.ILS - 3.1124) < 0.001, `main source 10× off vs the ECB → skipped, next source used (ILS ${f?.rates?.ILS})`, 'wrong main ' + JSON.stringify(f));
  fxMode = 'stale'; resetRates(); f = await fxOf();
  check(f === null, 'every source 10 days old → no rates: US dollars only', 'stale ' + JSON.stringify(f));
  fxMode = 'down'; resetRates(); f = await fxOf();
  check(f === null, 'every source down and nothing cached → no rates: US dollars only', 'down ' + JSON.stringify(f));
  await open(il, '/plans', '#plan-pro .price'); r = await proRow(il);
  check(r.main === '$40' && r.usd === '' && r.pick === null && /US dollars/.test(r.note), `page without rates: Pro "${r.main}", no picker, note "${r.note}"`, 'no rates page ' + JSON.stringify(r));
  await il.screenshot({ path: path.join(SHOTS, 'plans-no-rates.png'), fullPage: true });
  // A good table stays in use while the sources are down (refresh failures keep the last checked table).
  fxMode = 'ok'; resetRates(); await fxOf();
  const cacheFile = path.join(PRIV, 'fx-rates.json'), cache = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
  cache.table.fetchedAt -= 7 * 3600; cache.triedAt -= 7 * 3600; fs.writeFileSync(cacheFile, JSON.stringify(cache));
  fxMode = 'down'; f = await fxOf();
  check(f?.rates?.ILS === 3.1, 'sources down at refresh time → the last checked table is kept', 'kept ' + JSON.stringify(f));
  const after = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
  check(after.triedAt > cache.triedAt && after.table.fetchedAt === cache.table.fetchedAt, 'the failed refresh is recorded (retried after 15 minutes, not on every visit)', 'triedAt ' + JSON.stringify(after).slice(0, 200));
  fxMode = 'ok';

  // ── 8. Existing subscriptions: changes stay on the subscription's own price list and currency ────────────────────
  const probe = path.join(WORK, 'tier-probe.php');
  fs.writeFileSync(probe, `<?php
declare(strict_types=1);
define('SALONIEER', true);
$src = file_get_contents(${JSON.stringify(path.join(WWW, 'index.php').replace(/\\/g, '/'))});
preg_match('/^const PRICE_TIER = .*?;(?=\\r?$)/m', $src, $a); preg_match('/^const PLANS = .*?;(?=\\r?$)/m', $src, $p); preg_match('/^const PADDLE_CATALOG = \\[.*?^\\];(?=\\r?$)/ms', $src, $c);
eval($a[0].$p[0].$c[0]);
final class HttpFailure extends RuntimeException { public function __construct(public int $status, public string $errorCode, public ?string $field = null) { parent::__construct($errorCode); } }
require ${JSON.stringify(path.join(WWW, 'billing.php').replace(/\\/g, '/'))};
$ils = ['items'=>[['priceId'=>'pri_01m4dwf3eqb7qxj78wzbz41crc'], ['priceId'=>'pri_01m4dwf4cppnndkww47a1zffmn']]];
$old = ['items'=>[['priceId'=>'pri_01m3yseftqb0cdc1ag5zqthkbv']]];
$usd = ['items'=>[['priceId'=>'pri_01m69c7np1xtzt1ymd8wn81872']]];
$none = ['items'=>[]];
echo json_encode(['ils'=>subscriptionTier($ils), 'old'=>subscriptionTier($old), 'usd'=>subscriptionTier($usd), 'none'=>subscriptionTier($none),
  'ilsItems'=>paddleItemsFor(subscriptionTier($ils), 'month', 'basic', 1, true), 'usdItems'=>paddleItemsFor(subscriptionTier($usd), 'year', 'pro', 0, false)]);
`);
  const tiers = JSON.parse(execFileSync(PHP, [probe], { encoding: 'utf8' }));
  check(tiers.ils === 'list2026' && tiers.old === 'standard' && tiers.usd === 'usd2026' && tiers.none === 'usd2026' && tiers.ilsItems[0].price_id === 'pri_01m4dwf2fnyv56zeyn6f6rnf87' && tiers.usdItems[0].price_id === 'pri_01m69c7q2kf8a1kf7qgjzgv9sd',
    'plan changes: an ILS (Oct 2026) subscription stays on ILS prices, an older USD one on its own list, new ones on USD 2026', 'tiers ' + JSON.stringify(tiers));
} catch (e) {
  fail('stopped: ' + (e.stack || e.message));
} finally {
  const errs = phpLog.split('\n').filter(l => /PHP (Fatal|Warning|Parse|Deprecated)|Uncaught/i.test(l));
  if (errs.length) fail('PHP log: ' + errs.slice(-8).join(' | ')); else ok('no PHP warnings or errors in the server log');
  await browser.close(); php.kill(); fake.close(); fx.close();
}
console.log(failures.length ? `${failures.length} PROBLEMS` : 'ALL CHECKS PASSED');
process.exit(failures.length ? 1 : 0);
