// The plans page's billing switch on the REAL website (php -S + the real backend in embedded Postgres, as test-home.mjs):
// pictures of the yearly tag in English, Arabic and Hebrew, phone and desktop, after the page has settled, plus its
// contrast. Nothing leaves this machine.   node check-plans.mjs  → shots/plans-<lang>-<width>.png
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
const WORK = path.join(os.tmpdir(), 'salonieer-plans-check'), WWW = path.join(WORK, 'www'), PRIV = path.join(WORK, 'salonieer-private');
const SHOTS = path.join(HERE, 'shots'); fs.mkdirSync(SHOTS, { recursive: true });
const PORT = 8094, SB = 8097, ORIGIN = `http://127.0.0.1:${PORT}`;
fs.rmSync(WORK, { recursive: true, force: true }); fs.mkdirSync(PRIV, { recursive: true });
fs.cpSync(SITE, WWW, { recursive: true, filter: s => !/[\\/](\.git|\.superdesign|bob\.zip|services)([\\/]|$)/.test(s) });
fs.writeFileSync(path.join(PRIV, '.env'), `SUPABASE_URL=http://127.0.0.1:${SB}\nSUPABASE_PUBLIC_URL=https://storage.example.test\nSUPABASE_SERVICE_ROLE_KEY=sb_secret_fake\nSITE_URL=${ORIGIN}\n`);
fs.writeFileSync(path.join(WORK, 'router.php'), `<?php\n$p = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);\n$f = $_SERVER['DOCUMENT_ROOT'] . $p;\nif ($p !== '/' && is_file($f) && !str_ends_with($f, '.php')) return false;\nrequire $_SERVER['DOCUMENT_ROOT'] . '/index.php';\n`);
const { db } = await H.createDb();
const bridge = H.rpcBridge(db);
const fake = http.createServer((rq, rs) => { const ch = []; rq.on('data', c => ch.push(c)); rq.on('end', async () => {
  const m = new URL(rq.url, 'http://x').pathname.match(/^\/rest\/v1\/rpc\/([a-z_][a-z0-9_]*)$/);
  if (!m) { rs.writeHead(404); return rs.end('{}'); }
  let a = {}; try { a = ch.length ? JSON.parse(Buffer.concat(ch).toString('utf8')) : {}; } catch {}
  const r = await bridge.callRpc(m[1], a, rq.headers.apikey === 'sb_secret_fake' ? H.SERVICE : null);
  rs.writeHead(r.status, { 'content-type': 'application/json' }); rs.end(JSON.stringify(r.body)); }); });
await new Promise(r => fake.listen(SB, '127.0.0.1', r));
const php = spawn(process.env.PHP || 'C:/tools/php/php.exe', ['-S', `127.0.0.1:${PORT}`, '-t', WWW, path.join(WORK, 'router.php')], { stdio: 'ignore' });
for (let i = 0; i < 80; i++) { try { if ((await fetch(ORIGIN + '/api/session')).ok) break; } catch {} await new Promise(r => setTimeout(r, 250)); }
const { chromium } = await import(pathToFileURL(path.resolve(KMP, '../video-project/node_modules/playwright/index.mjs')).href);
const browser = await chromium.launch();
let bad = 0;
for (const lang of ['en', 'ar', 'he']) for (const [w, h] of [[390, 844], [1280, 900]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: w < 700, hasTouch: w < 700 });
  await ctx.route(u => !u.href.startsWith(ORIGIN), r => r.fulfill({ status: 404, body: '' }));
  const pg = await ctx.newPage();
  pg.on('pageerror', e => { bad++; console.log('PAGEERROR', e.message); });
  await pg.addInitScript(l => { try { localStorage.setItem('salonieer_lang', l); localStorage.setItem('salonieer_interval', 'year'); } catch {} }, lang);
  await pg.goto(ORIGIN + '/plans'); await pg.waitForSelector('.interval-switch .save-tag'); await pg.waitForTimeout(2500);
  const s = await pg.evaluate(() => {
    const tag = document.querySelector('.interval-switch .save-tag'), cs = getComputedStyle(tag);
    const lum = c => { const m = (c.match(/[\d.]+/g) || []).slice(0, 3).map(Number).map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4); return .2126 * m[0] + .7152 * m[1] + .0722 * m[2]; };
    const a = lum(cs.color), b = lum(cs.backgroundColor);
    return { text: tag.textContent.trim(), active: tag.closest('.currency-option').classList.contains('active'), contrast: Math.round((Math.max(a, b) + .05) / (Math.min(a, b) + .05) * 10) / 10, bg: cs.backgroundColor,
      sideways: document.scrollingElement.scrollWidth > innerWidth + 1 };
  });
  const okRow = s.active && s.contrast >= 4.5 && !s.sideways;
  if (!okRow) bad++;
  console.log(`${okRow ? '✓' : '✗'} ${lang} ${w}: "${s.text}" on the selected Yearly button, contrast ${s.contrast}:1 (${s.bg})${s.sideways ? ', SIDEWAYS SCROLL' : ''}`);
  await pg.screenshot({ path: path.join(SHOTS, `plans-${lang}-${w}.png`) });
  await ctx.close();
}
await browser.close(); php.kill(); fake.close();
console.log(bad ? `${bad} PROBLEMS` : 'PLANS OK');
process.exit(bad ? 1 : 0);
