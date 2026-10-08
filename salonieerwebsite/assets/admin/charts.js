// Small dependency-free SVG charts for the admin dashboards (no CDN: the site's CSP only allows its own scripts).
// Colours come from CSS roles in admin.css (--viz-*), validated for light and dark surfaces. Every chart has a hover /
// focus tooltip (bindCharts) and a hidden table so the numbers never depend on colour or a mouse.
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const niceMax = v => { if (v <= 0) return 1; const p = 10 ** Math.floor(Math.log10(v)); const n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p; };
let uid = 0;
const table = (caption, head, rows) => `<table class="viz-table sr-only"><caption>${esc(caption)}</caption><thead><tr>${head.map(h => `<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map((c, i) => i ? `<td>${esc(c)}</td>` : `<th scope="row">${esc(c)}</th>`).join('')}</tr>`).join('')}</tbody></table>`;

// Single-series trend (area + 2px line), crosshair tooltip. points: [{label, value}], fmt(value) → text.
export function areaChart({ points, fmt = String, title = '', height = 220, color = 'var(--viz-seq)', empty = '', width = 640 }) {
  if (empty && !points.some(p => p.value)) return `<p class="viz-empty">${esc(empty)}</p>`;
  const id = 'viz' + (++uid), W = width, H = height, pad = { t: 14, r: 12, b: 26, l: 48 };
  const max = niceMax(Math.max(0, ...points.map(p => p.value)));
  const x = i => pad.l + (points.length < 2 ? 0 : i * (W - pad.l - pad.r) / (points.length - 1));
  const y = v => pad.t + (H - pad.t - pad.b) * (1 - v / max);
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join('');
  const area = points.length ? `${line}L${x(points.length - 1).toFixed(1)},${y(0)}L${x(0).toFixed(1)},${y(0)}Z` : '';
  const ticks = [0, .5, 1].map(f => max * f);
  const every = Math.max(1, Math.ceil(points.length / 6));
  return `<figure class="viz" data-viz="area" id="${id}" dir="ltr" tabindex="0"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}" preserveAspectRatio="none" class="viz-svg">
    <defs><linearGradient id="${id}-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".22"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>
    ${ticks.map(v => `<line class="viz-grid" x1="${pad.l}" x2="${W - pad.r}" y1="${y(v)}" y2="${y(v)}"/><text class="viz-axis" x="${pad.l - 8}" y="${y(v) + 4}" text-anchor="end">${esc(fmt(v, true))}</text>`).join('')}
    ${points.map((p, i) => (i % every === 0 && points.length - 1 - i >= every) || i === points.length - 1 ? `<text class="viz-axis" x="${x(i)}" y="${H - 6}" text-anchor="${i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'}">${esc(p.short ?? p.label)}</text>` : '').join('')}
    <path d="${area}" fill="url(#${id}-g)"/><path d="${line}" class="viz-line" style="stroke:${color}"/>
    <line class="viz-cross" x1="0" x2="0" y1="${pad.t}" y2="${H - pad.b}" hidden/><circle class="viz-dot" r="4.5" cx="0" cy="0" style="stroke:${color}" hidden/>
    ${points.map((p, i) => `<rect class="viz-hit" x="${(x(i) - (W - pad.l - pad.r) / Math.max(1, points.length - 1) / 2).toFixed(1)}" y="${pad.t}" width="${((W - pad.l - pad.r) / Math.max(1, points.length - 1)).toFixed(1)}" height="${H - pad.t - pad.b}" data-x="${x(i).toFixed(1)}" data-y="${y(p.value).toFixed(1)}" data-tip="${esc(p.label)}" data-val="${esc(fmt(p.value))}" tabindex="-1"/>`).join('')}
  </svg><div class="viz-tip" role="status" hidden></div>${table(title, ['', title], points.map(p => [p.label, fmt(p.value)]))}</figure>`;
}

// Grouped columns for up to 3 series (2px gap between bars, 4px rounded tops). series: [{name, color, values[]}].
export function barChart({ categories, series, fmt = String, title = '', height = 220, empty = '', width = 640 }) {
  if (empty && !series.some(s => s.values.some(Boolean))) return `<p class="viz-empty">${esc(empty)}</p>`;
  const id = 'viz' + (++uid), W = width, H = height, pad = { t: 14, r: 12, b: 26, l: 40 };
  const max = niceMax(Math.max(0, ...series.flatMap(s => s.values)));
  const slot = (W - pad.l - pad.r) / Math.max(1, categories.length), bw = Math.min(18, (slot * .66 - 2 * (series.length - 1)) / series.length);
  const y = v => pad.t + (H - pad.t - pad.b) * (1 - v / max);
  const every = Math.max(1, Math.ceil(categories.length / 6));
  const bars = categories.map((c, ci) => series.map((s, si) => {
    const v = s.values[ci] || 0, x0 = pad.l + ci * slot + (slot - (bw * series.length + 2 * (series.length - 1))) / 2 + si * (bw + 2), top = y(v), h = Math.max(0, y(0) - top);
    const r = Math.min(4, bw / 2, h);
    const d = h <= 0 ? '' : `M${x0},${y(0)}V${top + r}Q${x0},${top} ${x0 + r},${top}H${x0 + bw - r}Q${x0 + bw},${top} ${x0 + bw},${top + r}V${y(0)}Z`;
    return `${d ? `<path d="${d}" style="fill:${s.color}"/>` : ''}<rect class="viz-hit" x="${x0 - 1}" y="${pad.t}" width="${bw + 2}" height="${H - pad.t - pad.b}" data-x="${x0 + bw / 2}" data-y="${top}" data-tip="${esc(c)} · ${esc(s.name)}" data-val="${esc(fmt(v))}" tabindex="-1"/>`;
  }).join('')).join('');
  return `<figure class="viz" data-viz="bar" id="${id}" dir="ltr" tabindex="0">${series.length > 1 ? `<div class="viz-legend">${series.map(s => `<span><i style="background:${s.color}"></i>${esc(s.name)}</span>`).join('')}</div>` : ''}<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}" preserveAspectRatio="none" class="viz-svg">
    ${[0, .5, 1].filter((f, i, all) => i === 0 || fmt(max * f, true) !== fmt(max * all[i - 1], true)).map(f => `<line class="viz-grid" x1="${pad.l}" x2="${W - pad.r}" y1="${y(max * f)}" y2="${y(max * f)}"/><text class="viz-axis" x="${pad.l - 8}" y="${y(max * f) + 4}" text-anchor="end">${esc(fmt(max * f, true))}</text>`).join('')}
    ${categories.map((c, i) => (i % every === 0 && categories.length - 1 - i >= every) || i === categories.length - 1 ? `<text class="viz-axis" x="${pad.l + i * slot + slot / 2}" y="${H - 6}" text-anchor="middle">${esc(c)}</text>` : '').join('')}
    ${bars}</svg><div class="viz-tip" role="status" hidden></div>${table(title, ['', ...series.map(s => s.name)], categories.map((c, i) => [c, ...series.map(s => fmt(s.values[i] || 0))]))}</figure>`;
}

// Horizontal bars, one hue, value labels at the end (magnitude / share). rows: [{label, value, note}].
export function hbars({ rows, fmt = String, title = '', color = 'var(--viz-seq)' }) {
  const max = Math.max(1, ...rows.map(r => r.value));
  return `<figure class="viz viz-hbars" aria-label="${esc(title)}">${rows.map(r => `<div class="viz-hrow" tabindex="0" data-tip="${esc(r.label)}" data-val="${esc(fmt(r.value))}"><span class="viz-hlabel">${esc(r.label)}</span><span class="viz-htrack"><i style="width:${(r.value / max * 100).toFixed(1)}%;background:${color}"></i></span><b class="viz-hval">${esc(fmt(r.value))}${r.note ? `<small>${esc(r.note)}</small>` : ''}</b></div>`).join('')}${table(title, ['', title], rows.map(r => [r.label, fmt(r.value)]))}</figure>`;
}

// A tiny trend line for KPI tiles (decorative; the tile states the number).
export function sparkline(values, color = 'var(--viz-seq)') {
  if (!values || values.length < 2) return '';
  const W = 96, H = 28, max = Math.max(...values), min = Math.min(...values), span = max - min || 1;
  const pts = values.map((v, i) => `${(i * W / (values.length - 1)).toFixed(1)},${(H - 3 - (v - min) / span * (H - 6)).toFixed(1)}`).join(' ');
  return `<svg class="viz-spark" viewBox="0 0 ${W} ${H}" aria-hidden="true" preserveAspectRatio="none"><polyline points="${pts}" fill="none" style="stroke:${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

// Hover / focus tooltips for every chart inside root. Delegated, so re-rendering a panel needs no re-binding.
export function bindCharts(root) {
  if (!root || root.dataset.vizBound) return;
  root.dataset.vizBound = '1';
  const show = (hit, fig) => {
    const tip = fig.querySelector('.viz-tip'), svg = fig.querySelector('svg');
    if (!tip || !svg) return;
    const box = svg.getBoundingClientRect(), vb = svg.viewBox.baseVal, sx = box.width / vb.width, sy = box.height / vb.height;
    const x = +hit.dataset.x, yv = +hit.dataset.y;
    tip.innerHTML = `<span>${hit.dataset.tip}</span><b>${hit.dataset.val}</b>`;
    tip.hidden = false;
    const fb = fig.getBoundingClientRect();
    tip.style.left = Math.min(Math.max(8, box.left - fb.left + x * sx - tip.offsetWidth / 2), fb.width - tip.offsetWidth - 8) + 'px';
    tip.style.top = Math.max(0, box.top - fb.top + yv * sy - tip.offsetHeight - 12) + 'px';
    const cross = fig.querySelector('.viz-cross'), dot = fig.querySelector('.viz-dot');
    if (cross) { cross.setAttribute('x1', x); cross.setAttribute('x2', x); cross.hidden = false; }
    if (dot) { dot.setAttribute('cx', x); dot.setAttribute('cy', yv); dot.hidden = false; }
  };
  const hide = fig => { fig.querySelector('.viz-tip')?.setAttribute('hidden', ''); fig.querySelector('.viz-cross')?.setAttribute('hidden', ''); fig.querySelector('.viz-dot')?.setAttribute('hidden', ''); };
  root.addEventListener('pointermove', e => { const hit = e.target.closest('.viz-hit'); const fig = e.target.closest('.viz'); if (hit && fig) show(hit, fig); });
  root.addEventListener('pointerleave', e => { const fig = e.target.closest?.('.viz'); if (fig) hide(fig); }, true);
  root.addEventListener('focusin', e => { const hit = e.target.closest('.viz-hit'); const fig = e.target.closest('.viz'); if (hit && fig) show(hit, fig); });
  // Keyboard: arrow keys walk the data points of a focused chart.
  root.addEventListener('keydown', e => {
    const fig = e.target.closest('.viz[data-viz]'); if (!fig || !['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    const hits = [...fig.querySelectorAll('.viz-hit')]; let i = hits.indexOf(document.activeElement);
    i = Math.max(0, Math.min(hits.length - 1, i + (e.key === 'ArrowRight' ? 1 : -1)));
    e.preventDefault(); hits[i]?.focus();
  });
  root.addEventListener('focusin', e => { const fig = e.target.closest('.viz[data-viz]'); if (fig && e.target === fig) fig.querySelector('.viz-hit')?.focus(); });
}
