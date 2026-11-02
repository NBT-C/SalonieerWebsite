// Admin panel: an application's total is shown for its own billing period (2026-10-28). The REAL website (PHP, php -S,
// a copy of salonieerwebsite) with the REAL backend behind it (Salonieer-KMP INSTALL.sql in embedded Postgres through a
// fake Supabase on 127.0.0.1). Nothing leaves this machine; synthetic data only.
//   node check-yearly-totals.mjs   → ✓/✗ per check, pictures in shots/
// A Pro application billed monthly ($40) and one billed yearly ($440 = 11 × $40; USD since 2026-10-31, it was ₪130 / ₪1,430): in English, Arabic and Hebrew the
// applications list says "/ month" and "/ year", the application page "Monthly total" and "Yearly total"; the admin's
// new-application emails (taken from the real queue, rendered by the site's mail.php, nothing sent) say the same.
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
const WORK = path.join(os.tmpdir(), 'salonieer-admin-yearly'), WWW = path.join(WORK, 'www'), PRIV = path.join(WORK, 'salonieer-private');
const SHOTS = path.join(HERE, 'shots'); fs.mkdirSync(SHOTS, { recursive: true });
const PORT = 8094, SB = 8100, ORIGIN = `http://127.0.0.1:${PORT}`;
const { ok, fail, failures } = H;
const must = (cond, msg) => { if (!cond) throw new Error(msg); };

fs.rmSync(WORK, { recursive: true, force: true }); fs.mkdirSync(PRIV, { recursive: true });
fs.cpSync(SITE, WWW, { recursive: true, filter: s => !/[\\/](\.git|\.superdesign|bob\.zip|services)([\\/]|$)/.test(s) });
fs.writeFileSync(path.join(PRIV, '.env'), `SUPABASE_URL=http://127.0.0.1:${SB}\nSUPABASE_PUBLIC_URL=https://storage.example.test\nSUPABASE_SERVICE_ROLE_KEY=sb_secret_fake\nSITE_URL=${ORIGIN}\n`);
fs.writeFileSync(path.join(WORK, 'router.php'), `<?php\n$p = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);\n$f = $_SERVER['DOCUMENT_ROOT'] . $p;\nif ($p !== '/' && is_file($f) && !str_ends_with($f, '.php')) return false;\nrequire $_SERVER['DOCUMENT_ROOT'] . '/index.php';\n`);

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

async function sitePage(label) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'en-US', timezoneId: 'Asia/Hebron' });
  const pg = await ctx.newPage();
  pg.on('pageerror', e => fail(`${label}: page error ${e.message}`));
  pg.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|status of (400|401|403|404|409)/.test(m.text())) fail(`${label}: console ${m.text().slice(0, 200)}`); });
  return pg;
}
// A JSON call to the website API from inside its page (session cookie + CSRF token, as the site does).
const siteApi = (pg, method, url, body) => pg.evaluate(async ({ method, url, body }) => {
  const me = await (await fetch('/api/session')).json();
  const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': me.csrf }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: r.status, data: await r.json().catch(() => null) };
}, { method, url, body });
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

try {
  // ── The applicant: one website account, a Pro application billed monthly and one billed yearly ─────────────────
  const applicant = await sitePage('applicant');
  await applicant.goto(ORIGIN + '/'); await applicant.waitForLoadState('networkidle');
  let r = await siteApi(applicant, 'POST', '/api/register', { fullName: 'Rana Haddad', email: 'rana@example.test', country: 'PS', gender: 'female', password: 'Qv8#tLw2!pZr6$mN', passwordConfirm: 'Qv8#tLw2!pZr6$mN', website: '' });
  must(r.status === 201, 'sign-up ' + JSON.stringify(r));
  const apply = async (salonName, interval) => {
    const r = await siteApi(applicant, 'POST', '/api/applications', { submissionKey: `check-${interval}-${Math.random().toString(36).slice(2)}abcdefghij`, salonName,
      identityNumber: '407815263', plan: 'pro', paymentMethod: 'card', loyalty: false, extraSpecialists: 0, logo: PNG, currency: 'USD', interval, trial: false,
      teamComposition: 'female', clientele: 'women', timezone: 'Asia/Hebron', phoneCountry: 'PS', phone: '0597555111', lang: 'en' });
    must(r.status === 201, `${interval} application ` + JSON.stringify(r).slice(0, 300));
    return r.data.application;
  };
  const monthly = await apply('Rana Monthly', 'month'), yearly = await apply('Rana Yearly', 'year');
  must(Number(monthly.quote.total) === 40 && monthly.quote.interval === 'month' && Number(yearly.quote.total) === 440 && yearly.quote.interval === 'year',
    'quotes ' + JSON.stringify([monthly.quote, yearly.quote]));
  ok(`applications saved: Pro monthly $${monthly.quote.total}, Pro yearly $${yearly.quote.total} (11 × $40)`);

  // ── Salonieer's admin panel ────────────────────────────────────────────────────────────────────────────────────
  const admin = await sitePage('admin');
  await admin.goto(ORIGIN + '/'); await admin.waitForLoadState('networkidle');
  r = await siteApi(admin, 'POST', '/api/setup', { setupKey: 'dd48a99c97b7af80d9', fullName: 'Site Admin', email: 'admin@example.test', password: 'Kx7#mQ2!vLp9$wR4', passwordConfirm: 'Kx7#mQ2!vLp9$wR4', country: 'PS', gender: 'male' });
  must(r.status === 201, 'admin setup ' + JSON.stringify(r));
  await admin.goto(ORIGIN + '/admin'); await admin.waitForSelector('input[name=email]', { timeout: 20000 });
  await admin.fill('input[name=email]', 'owner@example.test'); await admin.fill('input[name=password]', 'anything-fake');
  await admin.click('form button[type=submit]'); await admin.waitForSelector('#ap-nav a[href="/admin/accounts"]', { timeout: 20000 });

  const WANT = {
    en: { month: 'Monthly total', year: 'Yearly total', perMonth: '$40 / month', perYear: '$440 / year', dir: 'ltr' },
    ar: { month: 'الإجمالي الشهري', year: 'الإجمالي السنوي', perMonth: '$40 / شهر', perYear: '$440 / سنة', dir: 'rtl' },
    he: { month: 'סה״כ חודשי', year: 'סה״כ שנתי', perMonth: '$40 / חודש', perYear: '$440 / שנה', dir: 'rtl' },
  };
  for (const [lang, w] of Object.entries(WANT)) {
    await admin.evaluate(l => localStorage.setItem('salonieer_lang', l), lang);
    await admin.goto(ORIGIN + '/admin/applications?status=all'); await admin.waitForSelector('#ap-rows tr[data-href]', { timeout: 20000 });
    const readList = () => admin.evaluate(ids => ids.map(id => {
      const s = document.querySelector(`#ap-rows tr[data-href="/admin/applications/${id}"] td:nth-child(3) small`);
      if (!s) return null;
      const range = document.createRange(); range.selectNodeContents(s);
      return { text: s.textContent, lines: new Set([...range.getClientRects()].filter(r => r.width > 0).map(r => Math.round(r.top))).size };
    }), [monthly.id, yearly.id]);
    const list = await readList(), dir = await admin.evaluate(() => document.documentElement.dir);
    if (list[0]?.text === w.perMonth && list[1]?.text === w.perYear && list.every(x => x.lines === 1) && dir === w.dir) ok(`${lang} applications list (${dir}): monthly "${list[0].text}", yearly "${list[1].text}", one line each`);
    else fail(`${lang} applications list: ${JSON.stringify(list)}, dir ${dir}`);
    await admin.screenshot({ path: path.join(SHOTS, `applications-${lang}.png`) });
    // Phone width: the rows become cards; the price stays on one line and nothing scrolls sideways.
    await admin.setViewportSize({ width: 390, height: 844 }); await admin.waitForTimeout(300);
    const phone = await readList();
    if (phone.every(x => x?.lines === 1)) ok(`${lang} applications list at phone width: one line each`); else fail(`${lang} phone list: ${JSON.stringify(phone)}`);
    await H.noOverflow(admin, `${lang} applications list at phone width`);
    await admin.screenshot({ path: path.join(SHOTS, `applications-${lang}-phone.png`), fullPage: true });
    await admin.setViewportSize({ width: 1280, height: 900 });
    for (const [a, label, value, wrong] of [[monthly, w.month, '$40', w.year], [yearly, w.year, '$440', w.month]]) {
      await admin.goto(`${ORIGIN}/admin/applications/${a.id}`); await admin.waitForSelector('.ap-facts', { timeout: 20000 });
      const facts = await admin.evaluate(() => [...document.querySelectorAll('.ap-facts > div')].map(d => [d.querySelector('dt')?.textContent, d.querySelector('dd')?.textContent]));
      const row = facts.find(([k]) => k === label);
      if (row && row[1] === value && !facts.some(([k]) => k === wrong)) ok(`${lang} ${a.quote.interval}ly application page: "${label}" ${row[1]}`);
      else fail(`${lang} ${a.quote.interval}ly application page: ${JSON.stringify(facts)}`);
      await admin.screenshot({ path: path.join(SHOTS, `application-${a.quote.interval}-${lang}.png`), fullPage: true });
    }
  }

  // ── The admin's new-application emails, as the mail worker renders them (from the real queue; nothing is sent) ──
  const out = await bridge.callRpc('website_outbox_claim', { p_limit: 50 }, H.SERVICE);
  must(out.status === 200, 'outbox ' + JSON.stringify(out.body).slice(0, 200));
  const items = out.body.filter(i => i.template === 'admin_new_application');
  fs.writeFileSync(path.join(WORK, 'items.json'), JSON.stringify(items));
  const mails = JSON.parse(execFileSync(PHP, [path.join(HERE, 'render-mail.php'), path.join(SITE, 'mail.php'), path.join(WORK, 'items.json')], { encoding: 'utf8' }));
  const totals = mails.map(m => (m.text.match(/^Total: .*$/m) || ['(no Total line)'])[0]);
  if (mails.length === 2 && ['Total: 40 USD / month', 'Total: 440 USD / year'].every(t => totals.includes(t)) && !mails.some(m => /Monthly total/.test(m.text)))
    ok(`admin new-application emails: "${totals.join('", "')}"`);
  else fail(`admin new-application emails: ${JSON.stringify(totals)}`);
} catch (e) {
  fail('stopped: ' + (e.stack || e.message));
  if (phpLog) console.log(phpLog.split('\n').filter(l => /error|warning|fatal/i.test(l)).slice(-10).join('\n'));
} finally {
  await browser.close(); php.kill(); fake.close();
}
console.log(failures.length ? `${failures.length} PROBLEMS` : 'ALL CHECKS PASSED');
process.exit(failures.length ? 1 : 0);
