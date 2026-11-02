// Plan Finder (/plans#finder, November 2026). Part 1: the arithmetic in assets/plan-finder.js against hand-worked
// cases. Part 2: the REAL website (PHP, php -S, a copy of salonieerwebsite) with the REAL backend (Salonieer-KMP
// INSTALL.sql in embedded Postgres behind a fake Supabase), fake exchange-rate sources and a stub Paddle.js, all on
// 127.0.0.1 with synthetic data: en/ar/he, phone width, yearly, local-currency display, the link into the application
// form (prefilled) and the home page link. Nothing leaves this machine.   node check-plan-finder.mjs → ✓/✗ per check
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
const { ok, fail, failures } = H;
const check = (cond, good, bad) => cond ? ok(good) : fail(bad);

// ── 1. The arithmetic ───────────────────────────────────────────────────────────────────────────────────────────────
const PF = await import(pathToFileURL(path.join(SITE, 'assets/plan-finder.js')).href);
const CAT = { plans: [{ id: 'basic', name: 'Basic', prices: { USD: 20 }, specialists: 1 }, { id: 'pro', name: 'Pro', prices: { USD: 40 }, specialists: 7 }, { id: 'enterprise', name: 'Enterprise', prices: { USD: null }, specialists: null }],
  addons: { loyalty: { USD: 3 }, specialist: { USD: 5 } }, yearlyMonths: 11 };
const cases = [
  // [label, need, pick, reason, basicTotal, proTotal, link]
  ['1 specialist, nothing extra', { n: 1 }, 'basic', 'basic_cheaper', 20, 40, '/apply?plan=basic'],
  ['3 specialists', { n: 3 }, 'basic', 'basic_cheaper', 30, 40, '/apply?plan=basic&extra=2'],
  ['4 specialists + Loyalty', { n: 4, picked: ['loyalty'] }, 'basic', 'basic_cheaper', 38, 40, '/apply?plan=basic&option=loyalty&extra=3'],
  ['1 specialist + Smart waitlist', { n: 1, picked: ['smart_waitlist'] }, 'basic', 'basic_cheaper', 23, 40, '/apply?plan=basic&option=smart_waitlist'],
  ['5 specialists (same price: Pro includes more)', { n: 5 }, 'pro', 'pro_same', 40, 40, '/apply?plan=pro'],
  ['5 specialists + Loyalty (Basic 43 > Pro 40)', { n: 5, picked: ['loyalty'] }, 'pro', 'pro_cheaper', 43, 40, '/apply?plan=pro'],
  ['6 specialists', { n: 6 }, 'pro', 'pro_cheaper', 45, 40, '/apply?plan=pro'],
  ['7 specialists', { n: 7 }, 'pro', 'pro_cheaper', 50, 40, '/apply?plan=pro'],
  ['9 specialists', { n: 9 }, 'pro', 'pro_cheaper', 60, 50, '/apply?plan=pro&extra=2'],
  ['1 specialist + both options', { n: 1, picked: ['loyalty', 'smart_waitlist'] }, 'pro', 'two_options', 20, 40, '/apply?plan=pro'],
  ['2 specialists + Smart Checkout', { n: 2, picked: ['smart_checkout'] }, 'pro', 'needs_pro', 25, 40, '/apply?plan=pro'],
  ['1 specialist + full statistics history', { n: 1, picked: ['statistics_history'] }, 'pro', 'needs_pro', 20, 40, '/apply?plan=pro'],
  ['1 specialist + an unknown key (ignored)', { n: 1, picked: ['teleport'] }, 'basic', 'basic_cheaper', 20, 40, '/apply?plan=basic'],
  ['several branches', { n: 3, custom: true }, 'enterprise', 'custom', 30, 40, '/apply?plan=enterprise'],
  ['57 specialists (Pro + 50, the online maximum)', { n: 57 }, 'pro', 'pro_cheaper', 300, 290, '/apply?plan=pro&extra=50'],
  ['58 specialists (beyond online ordering)', { n: 58 }, 'enterprise', 'large', 305, 295, '/apply?plan=enterprise'],
];
for (const [label, need, pick, reason, b, p, link] of cases) {
  const m = PF.planMath(CAT, need);
  check(m && m.pick === pick && m.reason === reason && m.basic.total === b && m.pro.total === p && PF.applyLink(m) === link,
    `math: ${label} → ${pick} (${reason}), Basic $${b} / Pro $${p}, ${link}`,
    `math: ${label} → ${JSON.stringify(m && { pick: m.pick, reason: m.reason, b: m.basic.total, p: m.pro.total, link: PF.applyLink(m) })}`);
}
const clamp = [['abc', 1], [0, 1], [-4, 1], [2.7, 2], [150, 99]].map(([v, want]) => [v, PF.planMath(CAT, { n: v }).n, want]);
check(clamp.every(([, got, want]) => got === want), `math: team size is a whole number from 1 to 99 (${clamp.map(([v, g]) => `${v}→${g}`).join(', ')})`, 'clamp ' + JSON.stringify(clamp));
check(PF.planMath({ plans: CAT.plans, addons: {} }, { n: 1 }) === null && PF.planMath(null, { n: 1 }) === null && PF.planMath({ ...CAT, plans: CAT.plans.slice(1) }, { n: 1 }) === null,
  'math: without a complete price list the finder stays hidden (no guessed prices)', 'incomplete catalog not refused');
const odd = PF.planMath({ ...CAT, plans: [{ ...CAT.plans[0], prices: { USD: 25 }, specialists: 2 }, { ...CAT.plans[1], prices: { USD: 50 }, specialists: 10 }] }, { n: 3 });
check(odd.basic.total === 30 && odd.pro.total === 50 && odd.pick === 'basic', 'math: follows the price list it is given (other prices and included specialists)', 'odd ' + JSON.stringify(odd));

// ── 2. The real site ─────────────────────────────────────────────────────────────────────────────────────────────
const PHP = process.env.PHP || 'C:/tools/php/php.exe';
const WORK = path.join(os.tmpdir(), 'salonieer-plan-finder'), WWW = path.join(WORK, 'www'), PRIV = path.join(WORK, 'salonieer-private');
const SHOTS = path.join(HERE, 'shots'); fs.mkdirSync(SHOTS, { recursive: true });
const PORT = 8096, SB = 8104, FX = 8105, ORIGIN = `http://127.0.0.1:${PORT}`;
fs.rmSync(WORK, { recursive: true, force: true }); fs.mkdirSync(PRIV, { recursive: true });
fs.cpSync(SITE, WWW, { recursive: true, filter: s => !/[\\/](\.git|\.superdesign|bob\.zip|services)([\\/]|$)/.test(s) });
fs.writeFileSync(path.join(PRIV, '.env'), `SUPABASE_URL=http://127.0.0.1:${SB}\nSUPABASE_PUBLIC_URL=https://storage.example.test\nSUPABASE_SERVICE_ROLE_KEY=sb_secret_fake\nSITE_URL=${ORIGIN}\nFX_TEST_BASE=http://127.0.0.1:${FX}\n`);
fs.writeFileSync(path.join(WORK, 'router.php'), `<?php\n$p = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);\n$f = $_SERVER['DOCUMENT_ROOT'] . $p;\nif ($p !== '/' && is_file($f) && !str_ends_with($f, '.php')) return false;\nrequire $_SERVER['DOCUMENT_ROOT'] . '/index.php';\n`);
// The same fake rate sources as tools/pricing/check-usd-pricing.mjs (the server accepts a table only when it is complete
// enough and agrees with the ECB).
const RATES = { ILS: 3.1, EUR: 0.9, GBP: 0.75, JOD: 0.709, SAR: 3.75, AED: 3.6725, EGP: 48.5, JPY: 152.3, CAD: 1.39, AUD: 1.42, CHF: 0.82, TRY: 41.2, INR: 94.9,
  KWD: 0.306, BHD: 0.376, QAR: 3.64, OMR: 0.3845, MAD: 9.1, TND: 2.95, DZD: 130.2, PLN: 3.6, SEK: 9.4, NOK: 10.1, DKK: 6.69, CZK: 21.8, HUF: 328, RON: 4.5, IDR: 18148 };
const ECB = ['ILS','EUR','GBP','JPY','CAD','AUD','CHF','TRY','INR','PLN','SEK','NOK','DKK','CZK','HUF','RON','IDR'];
const today = () => new Date().toISOString().slice(0, 10);
const fx = http.createServer((rq, rs) => {
  const send = (st, b) => { rs.writeHead(st, { 'content-type': 'application/json' }); rs.end(JSON.stringify(b)); };
  const u = new URL(rq.url, 'http://x');
  if (u.pathname === '/er/USD') return send(200, { result: 'success', base_code: 'USD', time_last_update_unix: Math.floor(Date.now() / 1000), rates: { USD: 1, ...RATES } });
  if (u.pathname === '/fa/usd.min.json' || u.pathname === '/fb/usd.min.json') return send(200, { date: today(), usd: Object.fromEntries([['usd', 1], ...Object.entries(RATES).map(([k, v]) => [k.toLowerCase(), v * 1.004])]) });
  if (u.pathname === '/ecb') return send(200, { amount: 1, base: 'USD', date: today(), rates: Object.fromEntries(ECB.map(k => [k, RATES[k] * 0.998])) });
  send(404, {});
});
await new Promise(r => fx.listen(FX, '127.0.0.1', r));
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
const setLang = async (pg, l) => { await pg.goto(ORIGIN + '/?lang=' + l); await pg.waitForLoadState('networkidle'); };
const open = async (pg, route, sel) => { await pg.goto(ORIGIN + route); await pg.waitForSelector(sel, { timeout: 20000 }); await pg.waitForTimeout(150); };
const verdict = pg => pg.evaluate(() => {
  const v = document.querySelector('.pf-verdict');
  const total = c => document.querySelector(`.pf-card[data-pf-plan="${c}"] [data-pf-total]`)?.dataset.pfTotal;
  return { pick: v?.dataset.pfPick, reason: v?.dataset.pfReason, plan: v?.querySelector('h3')?.textContent, total: v?.querySelector('.pf-total')?.textContent.replace(/\s+/g, ' ').trim(),
    why: v?.querySelector('.pf-why')?.textContent.trim(), cta: document.getElementById('pf-cta')?.getAttribute('href'), ctaText: document.getElementById('pf-cta')?.textContent.trim(),
    basic: total('basic'), pro: total('pro'), n: document.getElementById('pf-n')?.value, other: v?.querySelector('.pf-other')?.textContent.trim() || '' };
});
const step = async (pg, d, times = 1) => { for (let i = 0; i < times; i++) await pg.click(`[data-pf-step="${d}"]`); await pg.waitForTimeout(60); };
const tick = async (pg, key) => { await pg.click(`.pf-chip:has(input[value="${key}"])`); await pg.waitForTimeout(60); };

try {
  // A US visitor sees exact dollars, so the totals can be read off the page.
  const us = await visitor('US visitor', 'US', 'America/New_York');
  for (const lang of ['en', 'ar', 'he']) {
    await setLang(us, lang); await us.evaluate(() => sessionStorage.clear());
    await open(us, '/plans', '#finder .pf-verdict');
    const v = await verdict(us), dir = await us.evaluate(() => document.documentElement.dir);
    const title = await us.textContent('#pf-title'), chips = await us.$$eval('.pf-chip', c => c.length), jump = await us.$eval('.pf-jump', a => a.getAttribute('href'));
    const want = { en: 'Which plan fits your salon?', ar: 'ما الباقة المناسبة لصالونك؟', he: 'איזו חבילה מתאימה לסלון שלכם?' }[lang];
    check(title === want && dir === (lang === 'en' ? 'ltr' : 'rtl') && v.pick === 'basic' && v.total.startsWith('$20') && chips === 14 && jump === '#finder',
      `${lang}: the finder is on /plans ("${title}", ${dir}, 14 needs to pick), starting at Basic ${v.total}`, `${lang} start ${JSON.stringify({ title, dir, v, chips, jump })}`);
    await us.screenshot({ path: path.join(SHOTS, `finder-${lang}.png`), fullPage: true });
  }
  await setLang(us, 'en'); await us.evaluate(() => sessionStorage.clear()); await open(us, '/plans', '#finder .pf-verdict');
  // 4 specialists + Loyalty: Basic $38 against Pro $40.
  await step(us, 1, 3); await tick(us, 'loyalty');
  let v = await verdict(us);
  check(v.n === '4' && v.pick === 'basic' && v.basic === '38' && v.pro === '40' && v.total.startsWith('$38') && /costs \$2 a month less than Pro\./.test(v.why) && v.cta === '/apply?plan=basic&option=loyalty&extra=3',
    `4 specialists + Loyalty → Basic $38 vs Pro $40; "${v.why}"`, '4+loyalty ' + JSON.stringify(v));
  // One more specialist: Basic would be $43, Pro $40.
  await step(us, 1); v = await verdict(us);
  check(v.pick === 'pro' && v.reason === 'pro_cheaper' && v.basic === '43' && v.pro === '40', `5 specialists + Loyalty → Pro ($40, Basic would be $43): "${v.why}"`, '5+loyalty ' + JSON.stringify(v));
  await tick(us, 'loyalty'); v = await verdict(us);
  check(v.pick === 'pro' && v.reason === 'pro_same' && v.basic === '40' && v.pro === '40', `5 specialists → same price, Pro (includes more): "${v.why}"`, '5 same ' + JSON.stringify(v));
  // Two people + Smart Checkout → only Pro has it.
  await step(us, -1, 3); await tick(us, 'smart_checkout'); v = await verdict(us);
  const out = await us.$eval('.pf-card[data-pf-plan="basic"]', e => ({ out: e.classList.contains('is-out'), miss: e.querySelector('.pf-miss')?.textContent.trim() }));
  check(v.n === '2' && v.pick === 'pro' && v.reason === 'needs_pro' && /Smart Checkout/.test(v.why) && out.out && /Smart Checkout/.test(out.miss || ''), `2 specialists + Smart Checkout → Pro; Basic card: "${out.miss}"`, 'checkout ' + JSON.stringify({ v, out }));
  await tick(us, 'smart_checkout'); await step(us, -1);
  // Both Basic options.
  await tick(us, 'loyalty'); await tick(us, 'smart_waitlist'); v = await verdict(us);
  check(v.pick === 'pro' && v.reason === 'two_options' && /not both/.test(v.why), `Loyalty and the Smart waitlist together → Pro: "${v.why}"`, 'two options ' + JSON.stringify(v));
  await tick(us, 'loyalty'); await tick(us, 'smart_waitlist');
  // Several branches → Enterprise, by agreement.
  await us.check('#pf-custom'); v = await verdict(us);
  check(v.pick === 'enterprise' && v.cta === '/apply?plan=enterprise' && v.ctaText === 'Contact us' && /By agreement/.test(v.total), `several branches → Enterprise, "${v.total}", "${v.ctaText}"`, 'custom ' + JSON.stringify(v));
  await us.uncheck('#pf-custom');
  // Typing: 60 → beyond online ordering; 0 → 1.
  await us.fill('#pf-n', '60'); await us.press('#pf-n', 'Tab'); v = await verdict(us);
  check(v.pick === 'enterprise' && v.reason === 'large' && /More than 57/.test(v.why), `60 specialists → Enterprise: "${v.why}"`, 'large ' + JSON.stringify(v));
  await us.fill('#pf-n', '0'); await us.press('#pf-n', 'Tab'); v = await verdict(us);
  check(v.n === '1' && v.pick === 'basic', 'a team of 0 is corrected to 1 when the field is left', '0 ' + JSON.stringify(v));
  // Keyboard: the + button works with Enter.
  await us.focus('[data-pf-step="1"]'); await us.keyboard.press('Enter'); v = await verdict(us);
  check(v.n === '2', 'keyboard: Enter on "+" adds a specialist', 'keyboard ' + v.n);
  // Yearly at the top of the page: the finder keeps its answers and quotes 11 × monthly.
  await step(us, 1, 2); await tick(us, 'loyalty');            // 4 + Loyalty again
  await us.click('[data-interval="year"]'); await us.waitForTimeout(250); v = await verdict(us);
  check(v.n === '4' && v.pick === 'basic' && v.basic === '418' && v.pro === '440' && v.total.startsWith('$418') && /Billed monthly: \$38 a month/.test(v.other), `yearly: answers kept, Basic $418 / Pro $440 a year; "${v.other}"`, 'yearly ' + JSON.stringify(v));
  await us.click('[data-interval="month"]'); await us.waitForTimeout(250);
  v = await verdict(us);
  check(/Billed yearly: \$418 a year \(8\.3% off\)/.test(v.other), `monthly view shows the yearly price as a discount: "${v.other}"`, 'other ' + v.other);
  // A reload keeps the answers (this tab only).
  await us.reload(); await us.waitForSelector('#finder .pf-verdict'); v = await verdict(us);
  check(v.n === '4' && v.basic === '38', 'the answers survive a reload in the same tab', 'reload ' + JSON.stringify(v));
  // Start over.
  await us.click('#pf-reset'); v = await verdict(us);
  check(v.n === '1' && v.pick === 'basic' && v.basic === '20' && (await us.$$eval('.plan-finder input:checked', x => x.length)) === 0, 'Start over clears everything', 'reset ' + JSON.stringify(v));

  // A visitor in Israel: approximate shekels with the USD amount that is charged.
  const il = await visitor('IL visitor', 'IL', 'Asia/Jerusalem');
  await setLang(il, 'he'); await il.evaluate(() => sessionStorage.clear()); await open(il, '/plans', '#finder .pf-verdict');
  await step(il, 1, 3); await tick(il, 'loyalty'); v = await verdict(il);
  check(v.pick === 'basic' && /≈ ₪118/.test(v.total) && /\$38 USD/.test(v.total), `Israel, Hebrew: "${v.total}" (≈ shekels, charged in USD)`, 'IL ' + JSON.stringify(v));

  // The link into the application form: plan, option and extra specialists filled in.
  await setLang(il, 'en');
  const reg = await il.evaluate(async () => {
    const me = await (await fetch('/api/session')).json();
    const r = await fetch('/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': me.csrf }, body: JSON.stringify({ fullName: 'Noor Salem', email: 'noor@example.test', country: 'PS', gender: 'female', password: 'Qv8#tLw2!pZr6$mN', passwordConfirm: 'Qv8#tLw2!pZr6$mN', website: '' }) });
    return r.status;
  });
  if (reg !== 201) throw new Error('sign-up ' + reg);
  await open(il, '/plans', '#finder .pf-verdict'); v = await verdict(il);
  check(v.cta === '/apply?plan=basic&option=loyalty&extra=3', 'the finder link after signing in: ' + v.cta, 'cta ' + v.cta);
  await il.click('#pf-cta'); await il.waitForSelector('#order-summary .summary-total', { timeout: 20000 }); await il.waitForTimeout(200);
  const form = await il.evaluate(() => { const f = document.getElementById('application-form'); return { plan: f.elements.plan.value, option: f.elements.basicOption.value, extra: f.elements.extraSpecialists.value, total: document.querySelector('#order-summary .summary-total')?.textContent.replace(/\s+/g, ' ').trim() }; });
  check(form.plan === 'basic' && form.option === 'loyalty' && form.extra === '3' && /\$38/.test(form.total), `application form prefilled: ${form.plan} + ${form.option} + ${form.extra} extra → "${form.total}"`, 'form ' + JSON.stringify(form));
  await open(il, '/apply?plan=pro&extra=2', '#order-summary .summary-total');
  const pro = await il.evaluate(() => { const f = document.getElementById('application-form'); return { plan: f.elements.plan.value, option: f.elements.basicOption.value, extra: f.elements.extraSpecialists.value, total: document.querySelector('#order-summary .summary-total')?.textContent }; });
  check(pro.plan === 'pro' && pro.option === '' && pro.extra === '2' && /\$50/.test(pro.total), `/apply?plan=pro&extra=2 → Pro + 2 extra = $50 (no Basic option on Pro)`, 'pro form ' + JSON.stringify(pro));
  await open(il, '/apply?plan=basic&option=bogus&extra=999', '#order-summary .summary-total');
  const bad = await il.evaluate(() => { const f = document.getElementById('application-form'); return { option: f.elements.basicOption.value, extra: f.elements.extraSpecialists.value }; });
  check(bad.option === '' && bad.extra === '0', 'unknown values in the link are ignored (option bogus, extra 999)', 'bad link ' + JSON.stringify(bad));
  await open(il, '/apply', '#order-summary .summary-total');
  const plain = await il.evaluate(() => document.getElementById('application-form').elements.plan.value);
  check(plain === 'basic', 'a plain /apply link still starts on Basic', 'plain ' + plain);

  // Phone width, Arabic and English: nothing scrolls sideways; the result follows the form.
  const phone = await visitor('phone', 'IL', 'Asia/Jerusalem', { width: 390, height: 844 });
  for (const lang of ['ar', 'en']) {
    await setLang(phone, lang); await open(phone, '/plans', '#finder .pf-verdict');
    await phone.$eval('#finder', e => e.scrollIntoView());
    await H.noOverflow(phone, `${lang} /plans with the finder at phone width`);
    const order = await phone.evaluate(() => { const f = document.querySelector('.pf-form').getBoundingClientRect(), r = document.querySelector('.pf-result').getBoundingClientRect(); return r.top >= f.bottom - 1; });
    check(order, `${lang} phone: the result comes under the questions`, `${lang} phone layout`);
    await phone.locator('#finder').screenshot({ path: path.join(SHOTS, `finder-${lang}-phone.png`) });
  }

  // The home page links to the finder.
  await setLang(us, 'ar'); await open(us, '/', '#prices .hm-plan');
  const homeLink = await us.$eval('#prices a[href="/plans#finder"]', a => a.textContent.trim()).catch(() => null);
  check(homeLink === 'لست متأكداً؟ اعرف الباقة المناسبة خلال دقيقة', `home page link (ar): "${homeLink}"`, 'home link ' + homeLink);
  await us.click('#prices a[href="/plans#finder"]'); await us.waitForSelector('#finder .pf-verdict');
  const inView = () => us.evaluate(() => { const r = document.getElementById('finder').getBoundingClientRect(); return { ok: r.top < innerHeight && r.bottom > 0, top: Math.round(r.top), y: Math.round(scrollY), h: innerHeight }; });
  let seen = await inView();
  for (let i = 0; i < 15 && !seen.ok; i++) { await us.waitForTimeout(200); seen = await inView(); }
  check(seen.ok && new URL(us.url()).pathname === '/plans', `the home link opens /plans at the finder (finder top ${seen.top}px, scrolled ${seen.y}px)`, 'home → finder ' + us.url() + ' ' + JSON.stringify(seen));
  await us.goto(ORIGIN + '/plans#finder'); await us.waitForSelector('#finder .pf-verdict');
  seen = await inView(); for (let i = 0; i < 15 && !seen.ok; i++) { await us.waitForTimeout(200); seen = await inView(); }
  check(seen.ok, `opening /plans#finder directly lands on the finder (top ${seen.top}px)`, 'direct #finder ' + JSON.stringify(seen));
} catch (e) {
  fail('stopped: ' + (e.stack || e.message));
} finally {
  const errs = phpLog.split('\n').filter(l => /PHP (Fatal|Warning|Parse|Deprecated)|Uncaught/i.test(l));
  if (errs.length) fail('PHP log: ' + errs.slice(-8).join(' | ')); else ok('no PHP warnings or errors in the server log');
  await browser.close(); php.kill(); fake.close(); fx.close();
}
console.log(failures.length ? `${failures.length} PROBLEMS` : 'ALL CHECKS PASSED');
process.exit(failures.length ? 1 : 0);
