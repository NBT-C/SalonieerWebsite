// Turns the captured screens (raw/<lang>/<id>.png) into the website's images:
//   assets/img/showcase/<id>-<lang>-<width>.webp
// Each screen gets the status bar its device shows above the app (time, signal, Wi-Fi, battery; mirrored for
// Arabic and Hebrew like iOS does), then is scaled down in Chromium (high-quality smoothing) and saved as WebP.
//   node build.mjs [langs]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SITE = path.resolve(HERE, '../../salonieerwebsite');
const OUT = path.join(SITE, 'assets/img/showcase');
const { chromium } = await import(pathToFileURL(path.resolve(HERE, '../../../video-project/node_modules/playwright/index.mjs')).href);
const LANGS = (process.argv[2] || 'ar,en,he').split(',');
// Which screens the home page uses, and the widths it asks for (srcset).
export const PHONE = ['book', 'requested', 'confirm', 'confirmed', 'dashboard', 'schedule', 'clients', 'team', 'stats', 'specialist'];
export const TABLET = ['tablet-dashboard', 'tablet-schedule'];
const WIDTHS = { phone: [360, 720], tablet: [640, 1280, 1920] };
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const pg = await browser.newPage();
await pg.setContent('<html><body></body></html>');
let total = 0, files = 0;
for (const lang of LANGS) {
  for (const id of [...PHONE, ...TABLET]) {
    const src = path.join(HERE, 'raw', lang, `${id}.png`);
    if (!fs.existsSync(src)) { console.log('missing', lang, id); continue; }
    const kind = TABLET.includes(id) ? 'tablet' : 'phone';
    const outs = await pg.evaluate(async ({ data, kind, rtl, widths }) => {
      const img = new Image(); img.src = data; await img.decode();
      // CSS px of the device: phone 390 wide (3×), iPad 1180 wide (2×); the status bar is added on top.
      const css = kind === 'phone' ? 390 : 1180, scale = img.width / css, bar = kind === 'phone' ? 47 : 24;
      const W = img.width, Hh = img.height + Math.round(bar * scale);
      const c = document.createElement('canvas'); c.width = W; c.height = Hh;
      const g = c.getContext('2d');
      // The bar takes the colour of the app's own top edge.
      const probe = document.createElement('canvas'); probe.width = W; probe.height = 2;
      const pc = probe.getContext('2d'); pc.drawImage(img, 0, 0);
      const px = pc.getImageData(0, 0, W, 1).data; let r = 0, gg = 0, b = 0, n = 0;
      for (let i = 0; i < px.length; i += 4 * 7) { r += px[i]; gg += px[i + 1]; b += px[i + 2]; n++; }
      r = Math.round(r / n); gg = Math.round(gg / n); b = Math.round(b / n);
      g.fillStyle = `rgb(${r},${gg},${b})`; g.fillRect(0, 0, W, Hh);
      g.drawImage(img, 0, Math.round(bar * scale));
      const ink = (0.299 * r + 0.587 * gg + 0.114 * b) > 140 ? '#0b0b0c' : '#ffffff';
      g.save(); g.scale(scale, scale); g.fillStyle = ink; g.strokeStyle = ink;
      const font = kind === 'phone' ? '600 16.5px "Segoe UI Semibold","Segoe UI",Arial,sans-serif' : '600 12.5px "Segoe UI Semibold","Segoe UI",Arial,sans-serif';
      g.font = font; g.textBaseline = 'alphabetic';
      // Positions in a left-to-right layout; mirrored for right-to-left languages.
      const X = x => rtl ? css - x : x;
      const timeW = g.measureText('9:41').width;
      if (kind === 'phone') {
        g.fillText('9:41', (rtl ? css - 54 : 54) - timeW / 2, 32);
        // Signal: four bars.
        const sx = rtl ? css - 316 : 296;
        [[0, 7.5], [5, 5.5], [10, 3.5], [15, 1.5]].forEach(([dx, top]) => { const h = 12 - top; g.beginPath(); g.roundRect(sx + dx, 21 + top, 3.4, h, 1); g.fill(); });
        // Wi-Fi: three arcs.
        const wx = rtl ? css - 331 + 8 : 331 - 8 + 0, wy = 32.5;
        g.lineWidth = 2.1; g.lineCap = 'round';
        [10.5, 6.8, 3.1].forEach((rad, i) => { g.beginPath(); if (i === 2) { g.arc(wx, wy - 0.8, 1.7, 0, Math.PI * 2); g.fill(); } else { g.arc(wx, wy, rad, Math.PI * 1.25, Math.PI * 1.75); g.stroke(); } });
        // Battery.
        const bx = rtl ? css - 368.2 : 341, by = 20.5;
        g.globalAlpha = .4; g.lineWidth = 1.1; g.beginPath(); g.roundRect(bx + .5, by + .5, 24, 12, 3.6); g.stroke();
        g.beginPath(); g.roundRect(bx + 25.6, by + 4.3, 1.6, 4.4, 1); g.fill(); g.globalAlpha = 1;
        g.beginPath(); g.roundRect(bx + 2.5, by + 2.5, 20, 8, 2); g.fill();
      } else {
        g.fillText('9:41', X(rtl ? 20 + timeW : 20), 17);
        const wx = rtl ? 60 : css - 60, wy = 17.5;
        g.lineWidth = 1.7; g.lineCap = 'round';
        [8.2, 5.2].forEach(rad => { g.beginPath(); g.arc(wx, wy, rad, Math.PI * 1.25, Math.PI * 1.75); g.stroke(); });
        g.beginPath(); g.arc(wx, wy - .6, 1.4, 0, Math.PI * 2); g.fill();
        const bx = rtl ? 20 : css - 44, by = 7.5;
        g.globalAlpha = .4; g.lineWidth = 1; g.beginPath(); g.roundRect(bx + .5, by + .5, 22, 10.5, 3); g.stroke();
        g.beginPath(); g.roundRect(bx + 23.4, by + 3.8, 1.5, 3.6, .8); g.fill(); g.globalAlpha = 1;
        g.beginPath(); g.roundRect(bx + 2.3, by + 2.3, 18.4, 7, 1.6); g.fill();
      }
      g.restore();
      // Scale down in halves (cleaner text than one big step), then encode.
      const out = [];
      for (const w of widths) {
        let cur = c, cw = W, ch = Hh;
        while (cw / 2 >= w) {
          const t = document.createElement('canvas'); t.width = Math.round(cw / 2); t.height = Math.round(ch / 2);
          const tg = t.getContext('2d'); tg.imageSmoothingQuality = 'high'; tg.drawImage(cur, 0, 0, t.width, t.height);
          cur = t; cw = t.width; ch = t.height;
        }
        const f = document.createElement('canvas'); f.width = w; f.height = Math.round(Hh * w / W);
        const fg = f.getContext('2d'); fg.imageSmoothingQuality = 'high'; fg.drawImage(cur, 0, 0, f.width, f.height);
        out.push({ w, h: f.height, data: f.toDataURL('image/webp', w <= 400 ? .86 : .8) });
      }
      return out;
    }, { data: 'data:image/png;base64,' + fs.readFileSync(src).toString('base64'), kind, rtl: lang !== 'en', widths: WIDTHS[kind] });
    for (const o of outs) {
      const buf = Buffer.from(o.data.split(',')[1], 'base64');
      fs.writeFileSync(path.join(OUT, `${id}-${lang}-${o.w}.webp`), buf);
      total += buf.length; files++;
    }
    console.log(lang, id, outs.map(o => `${o.w}×${o.h}`).join(' '));
  }
}
await browser.close();
console.log(`${files} files, ${(total / 1024).toFixed(0)} KB → ${OUT}`);
