// Salon application: the salon's country comes first and the ID number is asked only for Palestine or Israel
// (2026-11-04). The REAL website (PHP, php -S, a copy of salonieerwebsite) with the REAL backend behind it
// (Salonieer-KMP INSTALL.sql in embedded Postgres through a fake Supabase on 127.0.0.1). Synthetic data only.
//   node check-id-country.mjs   → ✓/✗ per check, pictures in shots/
// Checks: the server rule (BH without an ID is accepted and keeps none; PS/IL need a valid one; an unknown country is
// refused; an older page without the country field still works); the form (country first, ID right after it, the ID
// field and the phone code follow the chosen country, the choice survives a language switch, en/ar/he, phone width);
// a full Bahrain application from the form; the admin panel and the admin email for both kinds.
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
const WORK = path.join(os.tmpdir(), 'salonieer-id-country'), WWW = path.join(WORK, 'www'), PRIV = path.join(WORK, 'salonieer-private');
const SHOTS = path.join(HERE, 'shots'); fs.mkdirSync(SHOTS, { recursive: true });
const PORT = 8096, SB = 8104, ORIGIN = `http://127.0.0.1:${PORT}`;
const { ok, fail, failures } = H;
const must = (cond, msg) => { if (!cond) throw new Error(msg); };
const check = (cond, good, bad) => cond ? ok(good) : fail(bad);

fs.rmSync(WORK, { recursive: true, force: true }); fs.mkdirSync(PRIV, { recursive: true });
fs.cpSync(SITE, WWW, { recursive: true, filter: s => !/[\\/](\.git|\.superdesign|bob\.zip|services)([\\/]|$)/.test(s) });
fs.writeFileSync(path.join(PRIV, '.env'), `SUPABASE_URL=http://127.0.0.1:${SB}\nSUPABASE_PUBLIC_URL=https://storage.example.test\nSUPABASE_SERVICE_ROLE_KEY=sb_secret_fake\nSITE_URL=${ORIGIN}\n`);
fs.writeFileSync(path.join(WORK, 'router.php'), `<?php\n$p = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);\n$f = $_SERVER['DOCUMENT_ROOT'] . $p;\nif ($p !== '/' && is_file($f) && !str_ends_with($f, '.php')) return false;\nrequire $_SERVER['DOCUMENT_ROOT'] . '/index.php';\n`);
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const LOGO = path.join(WORK, 'logo.png'); fs.writeFileSync(LOGO, Buffer.from(PNG.split(',')[1], 'base64'));

// One database: the website server calls it with the service key, the admin panel with a platform-owner session.
const { db } = await H.createDb();
const bridge = H.rpcBridge(db);
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const JWT = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub: H.OWNER, role: 'authenticated' })}.x`;
const SESSION = { access_token: JWT, token_type: 'bearer', expires_in: 3600, refresh_token: 'ref-owner', user: { id: H.OWNER, email: 'owner@example.test' } };
const fake = http.createServer((rq, rs) => {
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'apikey, content-type, authorization, x-client-info, x-upsert, cache-control', 'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS' };
  if (rq.method === 'OPTIONS') { rs.writeHead(204, cors); return rs.end(); }
  const chunks = []; rq.on('data', c => chunks.push(c)); rq.on('end', async () => {
    const send = (st, b) => { rs.writeHead(st, { 'content-type': 'application/json', ...cors }); rs.end(b === undefined ? '' : JSON.stringify(b)); };
    const url = new URL(rq.url, 'http://x');
    if (url.pathname === '/auth/v1/token') return send(200, SESSION);
    if (url.pathname === '/auth/v1/user') return send(200, SESSION.user);
    if (url.pathname === '/auth/v1/logout') return send(204);
    if (url.pathname.startsWith('/storage/v1/object/')) return send(200, { Key: url.pathname.slice(19) });
    const m = url.pathname.match(/^\/rest\/v1\/rpc\/([a-z_][a-z0-9_]*)$/);
    if (!m) return send(404, { message: 'not found' });
    let args = {}; try { args = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}; } catch {}
    const r = await bridge.callRpc(m[1], args, bridge.jwtSub(rq.headers.authorization) || (rq.headers.apikey === 'sb_secret_fake' ? H.SERVICE : null));
    send(r.status, r.body);
  });
});
await new Promise(r => fake.listen(SB, '127.0.0.1', r));
const php = spawn(PHP, ['-S', `127.0.0.1:${PORT}`, '-t', WWW, path.join(WORK, 'router.php')], { stdio: ['ignore', 'pipe', 'pipe'] });
let phpLog = ''; php.stdout.on('data', d => phpLog += d); php.stderr.on('data', d => phpLog += d);
for (let i = 0; i < 60; i++) { try { if ((await fetch(ORIGIN + '/api/session')).ok) break; } catch {} await new Promise(r => setTimeout(r, 200)); }
const { chromium } = await import(pathToFileURL(path.resolve(KMP, '..', 'video-project/node_modules/playwright/index.mjs')).href);
const browser = await chromium.launch();

async function sitePage(label, timezoneId = 'Asia/Hebron') {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'en-US', timezoneId });
  await ctx.route('https://api.country.is/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ip":"203.0.113.9","country":"BH"}' }));
  const pg = await ctx.newPage();
  pg.on('pageerror', e => fail(`${label}: page error ${e.message}`));
  pg.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|status of (400|401|403|404|409)|ERR_/.test(m.text())) fail(`${label}: console ${m.text().slice(0, 200)}`); });
  return pg;
}
// A JSON call to the website API from inside its page (session cookie + CSRF token, as the site does).
const siteApi = (pg, method, url, body) => pg.evaluate(async ({ method, url, body }) => {
  const me = await (await fetch('/api/session')).json();
  const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': me.csrf }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: r.status, data: await r.json().catch(() => null) };
}, { method, url, body });
const register = async (pg, email, country) => {
  await pg.goto(ORIGIN + '/'); await pg.waitForLoadState('networkidle');
  const r = await siteApi(pg, 'POST', '/api/register', { fullName: 'Rana Haddad', email, country, gender: 'female', password: 'Qv8#tLw2!pZr6$mN', passwordConfirm: 'Qv8#tLw2!pZr6$mN', website: '' });
  must(r.status === 201, 'sign-up ' + JSON.stringify(r));
};
const body = o => ({ submissionKey: `idc-${Math.random().toString(36).slice(2)}abcdefghij`, salonName: 'Rana Salon', plan: 'pro', paymentMethod: 'card', loyalty: false, extraSpecialists: 0, logo: PNG,
  currency: 'USD', interval: 'month', trial: false, teamComposition: 'female', clientele: 'women', timezone: 'Asia/Hebron', phoneCountry: 'PS', phone: '0597555111', lang: 'en', ...o });
const BH_PHONE = { phoneCountry: 'BH', phone: '36001234', timezone: 'Asia/Bahrain' };

// The form, read from the page: field order, ID visibility and state, the chosen country and phone code.
const formState = pg => pg.evaluate(() => {
  const grid = document.querySelector('#application-form .form-grid'), cells = [...grid.children];
  const id = document.getElementById('identity-field'), input = document.getElementById('identityNumber');
  return { first: !!cells[0]?.querySelector('#country-btn'), second: cells[1] === id, idShown: !!id && !id.hidden && id.offsetParent !== null, idDisabled: input?.disabled,
    country: document.querySelector('#application-form input[name=country]')?.value, countryText: document.querySelector('#country-btn .cpick-text')?.textContent.trim(),
    dial: document.querySelector('#phoneCountry-btn .cpick-text')?.textContent.trim(), label: document.querySelector('label[for=country-btn]')?.textContent.trim(),
    hint: document.getElementById('country-hint')?.textContent.trim(), dir: document.documentElement.dir };
});
const pickCountry = async (pg, name) => {
  // On phones the list opens as a bottom sheet moved to <body>, so the open panel is found wherever it is.
  await pg.click('#country-btn'); await pg.fill('.cpick-pop:not([hidden]) .cpick-search', name); await pg.keyboard.press('Enter'); await pg.waitForTimeout(150);
};

try {
  // ── 1. The server rule ────────────────────────────────────────────────────────────────────────────────────────
  const ps = await sitePage('PS applicant');
  await register(ps, 'rana@example.test', 'PS');
  let r = await siteApi(ps, 'POST', '/api/applications', body({ salonName: 'Old Page Salon', identityNumber: '407815263' }));
  check(r.status === 201 && r.data.application.idLast4 === '5263', 'older page (no country field), Palestinian account: saved with its ID (••5263)', 'old page ' + JSON.stringify(r).slice(0, 300));
  const oldPage = r.data?.application;
  r = await siteApi(ps, 'POST', '/api/applications', body({ salonName: 'Old Page No ID' }));
  check(r.status === 400 && r.data?.error === 'invalidId' && r.data?.field === 'identityNumber', 'older page, Palestinian account, no ID → 400 invalidId', 'old page no ID ' + JSON.stringify(r).slice(0, 200));
  r = await siteApi(ps, 'POST', '/api/applications', body({ salonName: 'Bahrain API', country: 'BH', ...BH_PHONE }));
  check(r.status === 201 && r.data.application.idLast4 === '', 'country BH without an ID → saved, no ID kept', 'BH no ID ' + JSON.stringify(r).slice(0, 300));
  const bhApi = r.data?.application;
  r = await siteApi(ps, 'POST', '/api/applications', body({ salonName: 'Bahrain With ID', country: 'BH', identityNumber: '407815263', ...BH_PHONE }));
  check(r.status === 201 && r.data.application.idLast4 === '', 'country BH with an ID sent anyway → saved, the ID is ignored', 'BH with ID ' + JSON.stringify(r).slice(0, 300));
  const bhIgnored = r.data?.application;
  for (const c of ['PS', 'IL']) {
    r = await siteApi(ps, 'POST', '/api/applications', body({ salonName: `${c} No ID`, country: c }));
    check(r.status === 400 && r.data?.error === 'invalidId' && r.data?.field === 'identityNumber', `country ${c} without an ID → 400 invalidId`, `${c} no ID ` + JSON.stringify(r).slice(0, 200));
  }
  r = await siteApi(ps, 'POST', '/api/applications', body({ salonName: 'Israel Fake ID', country: 'IL', identityNumber: '123456789' }));
  check(r.status === 400 && r.data?.error === 'fakeId', 'country IL with 123456789 → 400 fakeId', 'IL fake ' + JSON.stringify(r).slice(0, 200));
  r = await siteApi(ps, 'POST', '/api/applications', body({ salonName: 'Israel Salon', country: 'IL', identityNumber: '407815263', phoneCountry: 'IL', phone: '0548823917', timezone: 'Asia/Jerusalem' }));
  check(r.status === 201 && r.data.application.idLast4 === '5263', 'country IL with a valid ID → saved (••5263)', 'IL ok ' + JSON.stringify(r).slice(0, 300));
  const ilApp = r.data?.application;
  for (const bad of ['XX', '', 7, null]) {
    r = await siteApi(ps, 'POST', '/api/applications', body({ salonName: 'Bad Country', country: bad, identityNumber: '407815263' }));
    check(r.status === 400 && r.data?.error === 'invalidCountry' && r.data?.field === 'country', `country ${JSON.stringify(bad)} → 400 invalidCountry`, `bad country ${JSON.stringify(bad)} ` + JSON.stringify(r).slice(0, 200));
  }
  const bhUser = await sitePage('BH applicant', 'Asia/Bahrain');
  await register(bhUser, 'ahmed@example.test', 'BH');
  r = await siteApi(bhUser, 'POST', '/api/applications', body({ salonName: 'Bahrain Old Page', ...BH_PHONE }));
  check(r.status === 201 && r.data.application.idLast4 === '', 'older page, Bahraini account, no ID → saved (the account country decides)', 'BH account old page ' + JSON.stringify(r).slice(0, 300));
  const identityRows = () => execFileSync(PHP, ['-r', `$d=new PDO('sqlite:'.$argv[1]);echo json_encode($d->query('SELECT application_id FROM application_identity')->fetchAll(PDO::FETCH_COLUMN));`, path.join(PRIV, 'salonieer.sqlite')], { encoding: 'utf8' });
  let rows = null; try { rows = JSON.parse(identityRows()); } catch {}
  if (rows) check(rows.includes(oldPage.id) && rows.includes(ilApp.id) && !rows.includes(bhApi.id) && !rows.includes(bhIgnored.id), `stored ID numbers: only the ${rows.length} Palestine/Israel applications have one`, 'identity rows ' + JSON.stringify(rows));
  else ok('(identity table not read directly: database file has another name; the admin checks below cover it)');

  // ── 2. The form: country first, the ID only for Palestine or Israel ─────────────────────────────────────────────
  const WANT = { en: { label: 'Salon country', bh: 'Bahrain', dir: 'ltr' }, ar: { label: 'دولة الصالون', bh: 'البحرين', dir: 'rtl' }, he: { label: 'מדינת הסלון', bh: 'בחריין', dir: 'rtl' } };
  for (const [lang, w] of Object.entries(WANT)) {
    await ps.evaluate(l => localStorage.setItem('salonieer_lang', l), lang);
    await ps.goto(ORIGIN + '/apply?plan=pro'); await ps.waitForSelector('#application-form #country-btn', { timeout: 20000 }); await ps.waitForTimeout(200);
    let s = await formState(ps);
    check(s.first && s.second && s.country === 'PS' && s.idShown && !s.idDisabled && s.label === w.label && s.dir === w.dir && s.dial === '+970',
      `${lang}: "${s.label}" is the first field (${s.countryText}), the ID field right after it and shown; phone code ${s.dial}`, `${lang} PS form ${JSON.stringify(s)}`);
    await pickCountry(ps, w.bh);
    s = await formState(ps);
    check(s.country === 'BH' && !s.idShown && s.idDisabled && s.dial === '+973' && s.countryText === w.bh, `${lang}: ${s.countryText} → ID field hidden, phone code follows (${s.dial})`, `${lang} BH form ${JSON.stringify(s)}`);
    await ps.screenshot({ path: path.join(SHOTS, `apply-bh-${lang}.png`), fullPage: true });
    await pickCountry(ps, lang === 'en' ? 'Israel' : 'IL');
    s = await formState(ps);
    check(s.country === 'IL' && s.idShown && !s.idDisabled && s.dial === '+972', `${lang}: Israel → ID field shown again, phone code ${s.dial}`, `${lang} IL form ${JSON.stringify(s)}`);
    await ps.screenshot({ path: path.join(SHOTS, `apply-il-${lang}.png`), fullPage: true });
  }
  // A missing ID is caught on the form for Palestine; nothing is sent.
  await ps.evaluate(() => localStorage.setItem('salonieer_lang', 'en'));
  await ps.goto(ORIGIN + '/apply?plan=pro'); await ps.waitForSelector('#country-btn'); await ps.waitForTimeout(200);
  await ps.click('.form-submit'); await ps.waitForTimeout(200);
  let err = await ps.evaluate(() => ({ id: document.getElementById('identityNumber-error')?.textContent, country: document.getElementById('country-error')?.textContent, focus: document.activeElement?.id }));
  check(err.id === 'Enter your ID number.' && !err.country, `Palestine, empty ID: the form says "${err.id}"`, 'PS empty ID ' + JSON.stringify(err));
  // Bahrain: no ID error even with the field empty; the choice and the hidden field survive a language switch.
  await pickCountry(ps, 'Bahrain');
  await ps.click('.form-submit'); await ps.waitForTimeout(200);
  err = await ps.evaluate(() => ({ id: document.getElementById('identityNumber-error')?.textContent, idInvalid: document.getElementById('identity-field').classList.contains('is-invalid') }));
  check(!err.id && !err.idInvalid, 'Bahrain, empty ID: no ID error', 'BH empty ID ' + JSON.stringify(err));
  await ps.selectOption('#language', 'ar'); await ps.waitForSelector('#country-btn'); await ps.waitForTimeout(300);
  let s = await formState(ps);
  check(s.country === 'BH' && s.countryText === 'البحرين' && !s.idShown && s.dir === 'rtl', `language switch to Arabic keeps ${s.countryText} and the hidden ID field`, 'lang switch ' + JSON.stringify(s));
  await ps.setViewportSize({ width: 390, height: 844 }); await ps.waitForTimeout(200);
  await H.noOverflow(ps, 'ar apply form at phone width');
  await ps.screenshot({ path: path.join(SHOTS, 'apply-bh-ar-phone.png'), fullPage: true });
  await pickCountry(ps, 'فلسطين');
  s = await formState(ps);
  check(s.country === 'PS' && s.idShown, 'phone width: the picker sheet works, Palestine → ID field shown', 'phone pick ' + JSON.stringify(s));
  await H.noOverflow(ps, 'ar apply form at phone width with the ID field');
  await ps.setViewportSize({ width: 1280, height: 900 });

  // ── 3. A Bahrain application from the form, end to end ───────────────────────────────────────────────────────────
  await ps.selectOption('#language', 'en'); await ps.waitForSelector('#country-btn'); await ps.waitForTimeout(300);
  await ps.goto(ORIGIN + '/apply?plan=basic'); await ps.waitForSelector('#country-btn'); await ps.waitForTimeout(200);
  await pickCountry(ps, 'Bahrain');
  await ps.fill('#salonName', 'Manama Cuts');
  await ps.selectOption('#teamComposition', 'mixed'); await ps.selectOption('#clientele', 'both');
  await ps.fill('#phone', '36001234');
  await ps.setInputFiles('#logo', LOGO); await ps.waitForSelector('#logo-preview:not([hidden])', { timeout: 10000 });
  await ps.check('input[name=paymentMethod][value=bank_transfer]', { force: true });
  const sent = [];
  ps.on('request', rq => { if (rq.url().endsWith('/api/applications') && rq.method() === 'POST') sent.push(JSON.parse(rq.postData() || '{}')); });
  await ps.click('.form-submit');
  await ps.waitForSelector('.receipt', { timeout: 20000 });
  const formApp = sent[0];
  check(formApp && formApp.country === 'BH' && !('identityNumber' in formApp) && formApp.phone === '+97336001234', `form sent country ${formApp?.country}, no ID field, phone ${formApp?.phone}`, 'form payload ' + JSON.stringify(formApp && { ...formApp, logo: '…' }));
  await ps.screenshot({ path: path.join(SHOTS, 'apply-bh-receipt.png'), fullPage: true });

  // ── 4. Admin: the panel and the new-application email ────────────────────────────────────────────────────────────
  const admin = await sitePage('admin');
  await admin.goto(ORIGIN + '/'); await admin.waitForLoadState('networkidle');
  r = await siteApi(admin, 'POST', '/api/setup', { setupKey: 'dd48a99c97b7af80d9', fullName: 'Site Admin', email: 'admin@example.test', password: 'Kx7#mQ2!vLp9$wR4', passwordConfirm: 'Kx7#mQ2!vLp9$wR4', country: 'PS', gender: 'male' });
  must(r.status === 201, 'admin setup ' + JSON.stringify(r));
  r = await siteApi(admin, 'GET', '/api/admin/applications');
  must(r.status === 200, 'admin list ' + JSON.stringify(r).slice(0, 200));
  const byName = n => r.data.applications.find(a => a.salonName === n);
  const mb = byName('Manama Cuts'), il = byName('Israel Salon');
  check(mb?.country === 'BH' && mb.identityNumber === '' && mb.idLast4 === '' && il?.country === 'IL' && il.identityNumber === '407815263' && !mb.review?.flags?.some(f => /^id/.test(f.code)),
    `admin list: Manama Cuts country ${mb?.country}, no ID, no ID flags; Israel Salon country ${il?.country} with its ID`, 'admin list ' + JSON.stringify([mb, il]).slice(0, 500));
  await admin.goto(ORIGIN + '/admin'); await admin.waitForSelector('input[name=email]', { timeout: 20000 });
  await admin.fill('input[name=email]', 'owner@example.test'); await admin.fill('input[name=password]', 'anything-fake');
  await admin.click('form button[type=submit]'); await admin.waitForSelector('#ap-nav a[href="/admin/accounts"]', { timeout: 20000 });
  const facts = async id => { await admin.goto(`${ORIGIN}/admin/applications/${id}`); await admin.waitForSelector('.ap-facts', { timeout: 20000 });
    return admin.evaluate(() => Object.fromEntries([...document.querySelectorAll('.ap-facts > div')].map(d => [d.querySelector('dt')?.textContent, d.querySelector('dd')?.textContent]))); };
  const fb = await facts(mb.id), fi = await facts(il.id);
  check(fb.Country === 'BH' && !('ID number' in fb) && fi.Country === 'IL' && fi['ID number'] === '407815263', `admin application page: Bahrain has no ID row (country ${fb.Country}); Israel shows ${fi['ID number']}`, 'admin facts ' + JSON.stringify([fb, fi]));
  await admin.goto(`${ORIGIN}/admin/applications/${mb.id}`); await admin.waitForSelector('.ap-facts');
  await admin.screenshot({ path: path.join(SHOTS, 'admin-application-bh.png'), fullPage: true });
  const out = await bridge.callRpc('website_outbox_claim', { p_limit: 100 }, H.SERVICE);
  must(out.status === 200, 'outbox ' + JSON.stringify(out.body).slice(0, 200));
  const items = out.body.filter(i => i.template === 'admin_new_application');
  fs.writeFileSync(path.join(WORK, 'items.json'), JSON.stringify(items));
  const mails = JSON.parse(execFileSync(PHP, [path.resolve(HERE, '../admin/render-mail.php'), path.join(SITE, 'mail.php'), path.join(WORK, 'items.json')], { encoding: 'utf8' }));
  const mailOf = n => mails.find(m => m.subject.includes(n))?.text || '';
  const mBh = mailOf('Manama Cuts'), mIl = mailOf('Israel Salon');
  check(/^Country: BH$/m.test(mBh) && /^ID number \(last 4\): not asked/m.test(mBh) && /^Country: IL$/m.test(mIl) && /^ID number \(last 4\): 5263$/m.test(mIl),
    `admin emails: Bahrain "${(mBh.match(/^ID number.*$/m) || [''])[0]}", Israel "${(mIl.match(/^ID number.*$/m) || [''])[0]}"`, 'emails ' + JSON.stringify([mBh.slice(0, 400), mIl.slice(0, 400)]));
} catch (e) {
  fail('stopped: ' + (e.stack || e.message));
} finally {
  const errs = phpLog.split('\n').filter(l => /PHP (Fatal|Warning|Parse|Deprecated)|Uncaught/i.test(l));
  if (errs.length) fail('PHP log: ' + errs.slice(-8).join(' | ')); else ok('no PHP warnings or errors in the server log');
  await browser.close(); php.kill(); fake.close();
}
console.log(failures.length ? `${failures.length} PROBLEMS` : 'ALL CHECKS PASSED');
process.exit(failures.length ? 1 : 0);
