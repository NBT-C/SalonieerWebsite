// Money pages of the admin panel: Finance (Paddle revenue, MRR, renewals, failed payments, invoices, refunds), plan
// change requests and discount codes (a salon's Billing tab is in billing.js). Data comes from the website API (billing.php), which
// reads Paddle and the Supabase salon billing state; the browser never talks to Paddle's API directly.
import { esc, T, setTitle, view, loading, empty, pill, act, confirm, site, fmtDate, fmtTime, num, salonMark, params, bindRowLinks } from './panel.js';
import { areaChart, barChart, hbars, sparkline, bindCharts } from './charts.js';
import { money } from './billing.js';

const usd = (cents, short = false) => {
  const v = Number(cents || 0) / 100;
  if (short && Math.abs(v) >= 1000) return '$' + (v / 1000).toLocaleString('en', { maximumFractionDigits: 1 }) + 'k';
  return '$' + v.toLocaleString('en', { minimumFractionDigits: Number.isInteger(v) ? 0 : 2, maximumFractionDigits: 2 });
};
const api = (path, opts) => site().api(path, opts);
const post = (path, data, method = 'POST') => site().api(path, { method, body: JSON.stringify(data || {}) });
export const PLAN_NAMES = { basic: 'Basic', pro: 'Pro', business: 'Business', enterprise: 'Enterprise' };
export const planText = (b) => `${PLAN_NAMES[b.plan] || b.plan || '—'}${b.interval === 'year' ? ' · ' + T('yearly') : ''}`;
const STATUS_TONE = { active: 'ok', trialing: 'info', past_due: 'danger', paused: 'muted', canceled: 'muted' };
export const billingPill = b => {
  if (!b) return pill('muted', T('noSubscription'));
  if (b.pausedForBilling) return pill('danger', T('billPaused'));
  if (b.status === 'past_due') return pill('danger', T('billPastDue'));
  if (b.scheduledChange?.action === 'cancel') return pill('warn', T('billCancels', { date: fmtDate(b.scheduledChange.effectiveAt) }));
  return pill(STATUS_TONE[b.status] || 'muted', T('bill_' + (b.status || 'none')));
};
const daysLeft = iso => Math.max(0, Math.ceil((new Date(iso) - Date.now()) / 86400000));
const kpi = (label, value, { delta = null, spark = null, tone = '', hint = '' } = {}) => `<div class="ap-kpi${tone ? ' is-' + tone : ''}"><dt>${esc(label)}</dt><dd><b>${esc(value)}</b>${delta === null ? '' : `<span class="ap-delta ${delta >= 0 ? 'is-up' : 'is-down'}" aria-label="${esc(T('vsLastMonth'))}">${delta >= 0 ? '▲' : '▼'} ${Math.abs(delta).toFixed(0)}%</span>`}</dd>${spark ? sparkline(spark) : ''}${hint ? `<small>${esc(hint)}</small>` : ''}</div>`;
const pct = (now, before) => before ? (now - before) / before * 100 : null;

// ---- Finance ----------------------------------------------------------------------------------------------------------
let range = '30d';
export async function financeView() {
  setTitle(T('navFinance'), `<button class="ap-btn is-quiet" type="button" id="ap-fin-refresh">${esc(T('refreshNow'))}</button>`);
  view().innerHTML = loading();
  const f = await api('/api/admin/finance' + (params().get('fresh') ? '?fresh=1' : ''));
  const k = f.kpis, months = Object.entries(f.months), monthLabel = m => new Intl.DateTimeFormat(site().lang, { month: 'short' }).format(new Date(m + '-01T00:00:00Z'));
  const days = Object.entries(f.days).map(([d, v]) => ({ label: fmtDate(d), short: d.slice(8), value: v }));
  const mrrSeries = (f.metrics?.mrr?.timeseries || []).map(p => ({ label: fmtDate(p.timestamp), short: p.timestamp.slice(5, 10), value: Number(p.amount || 0) }));
  const chart = range === '30d'
    ? areaChart({ points: days, fmt: (v, axis) => usd(v, axis), title: T('revenue30'), empty: T('noPaymentsRange') })
    : barChart({ categories: months.map(([m]) => monthLabel(m)), series: [{ name: T('gross'), color: 'var(--viz-1)', values: months.map(([, v]) => v.gross) }, { name: T('netEarnings'), color: 'var(--viz-2)', values: months.map(([, v]) => v.net) }], fmt: (v, axis) => usd(v, axis), title: T('revenue12') });
  const mix = Object.entries(f.planMix).sort((a, b) => b[1] - a[1]);
  const totalMix = mix.reduce((s, [, n]) => s + n, 0) || 1;
  view().innerHTML = `
    <dl class="ap-kpis">
      ${kpi(T('mrr'), usd(k.mrr), { hint: T('arrIs', { v: usd(k.arr) }), spark: mrrSeries.length > 1 ? mrrSeries.map(p => p.value) : null })}
      ${kpi(T('revenueMonth'), usd(k.revenueThisMonth), { delta: pct(k.revenueThisMonth, k.revenueLastMonth), spark: months.map(([, v]) => v.gross) })}
      ${kpi(T('netMonth'), usd(k.netThisMonth), { delta: pct(k.netThisMonth, k.netLastMonth), hint: T('afterFees') })}
      ${kpi(T('activeSubs'), num(k.activeSubscriptions), { hint: k.trialing ? T('plusTrialing', { n: num(k.trialing) }) : T('arpaIs', { v: usd(k.arpa) }) })}
      ${kpi(T('pastDue'), num(k.pastDue), { tone: k.pastDue ? 'danger' : '', hint: T('pausedN', { n: num(k.paused) }) })}
      ${kpi(T('cancelling'), num(k.cancelling), { tone: k.cancelling ? 'warn' : '', hint: T('atPeriodEnd') })}
      ${kpi(T('cashThisMonth'), Object.entries(f.cashThisMonth || {}).map(([c, v]) => money(v, c)).join(' · ') || '—', { tone: k.cashDue ? 'danger' : '', hint: T('cashSalonsN', { n: num(k.cashSalons || 0), due: num(k.cashDue || 0) }) })}
    </dl>
    <section class="ap-panel ap-chart-panel"><header class="ap-panel-head"><h2>${esc(T('revenue'))}</h2>
      <div class="ap-seg" role="group" aria-label="${esc(T('range'))}"><button type="button" data-range="30d" aria-pressed="${range === '30d'}">${esc(T('days30'))}</button><button type="button" data-range="12m" aria-pressed="${range === '12m'}">${esc(T('months12'))}</button></div></header>
      ${chart}</section>
    <div class="ap-columns">
      <section class="ap-panel ap-chart-panel"><header class="ap-panel-head"><h2>${esc(T('newVsCancelled'))}</h2></header>
        ${barChart({ width: 380, height: 240, categories: months.map(([m]) => monthLabel(m)), series: [{ name: T('newSubs'), color: 'var(--viz-1)', values: months.map(([m]) => f.newSubscriptions[m] || 0) }, { name: T('cancelled'), color: 'var(--viz-2)', values: months.map(([m]) => f.churn[m] || 0) }], fmt: v => num(Math.round(v)), title: T('newVsCancelled'), height: 200 })}</section>
      <section class="ap-panel"><header class="ap-panel-head"><h2>${esc(T('planMix'))}</h2></header>
        ${mix.length ? hbars({ rows: mix.map(([p, n]) => ({ label: p.replace(/^\w/, c => c.toUpperCase()), value: n, note: Math.round(n / totalMix * 100) + '%' })), fmt: v => num(v), title: T('planMix') }) : `<p class="ap-quiet">${esc(T('noSubsYet'))}</p>`}</section>
    </div>
    ${mrrSeries.length > 1 ? `<section class="ap-panel ap-chart-panel"><header class="ap-panel-head"><h2>${esc(T('mrrTrend'))}</h2><small class="ap-quiet">${esc(T('fromPaddle'))}</small></header>${areaChart({ points: mrrSeries, fmt: (v, axis) => usd(v, axis), title: T('mrrTrend'), height: 180, color: 'var(--viz-1)' })}</section>` : ''}
    <div class="ap-columns">
      ${salonList(T('needsPayment'), f.pastDue, b => `${esc(T('daysLeft', { n: num(daysLeft(b.graceEndsAt)) }))} · ${esc(T('remindersSent', { n: num(b.remindersSent) }))}`, T('noPastDue'), 'danger')}
      ${salonList(T('pausedSalons'), f.paused, b => esc(T(b.pauseReason === 'canceled' ? 'pausedCanceled' : 'pausedUnpaid')), T('noPaused'), 'muted')}
    </div>
    <div class="ap-columns">
      ${salonList(T('renewals7'), f.renewals, b => `${esc(fmtDate(b.nextBilledAt))} · ${esc(usd(b.recurringTotal))}`, T('noRenewals'), 'ok')}
      ${salonList(T('cancellingAtEnd'), f.cancelling, b => esc(T('endsOn', { date: fmtDate(b.scheduledChange?.effectiveAt) })), T('noCancelling'), 'warn')}
    </div>
    <div class="ap-columns">
      ${salonList(T('cashOverdueList'), f.cashDue || [], b => `${esc(T('graceUntil', { date: fmtDate(b.graceEndsAt) }))} · ${esc(money(b.recurringTotal, b.currency))}`, T('noCashOverdue'), 'danger')}
      ${salonList(T('cashRenewalsList'), f.cashRenewals || [], b => `${esc(T('paidUntilShort', { date: fmtDate(b.paidUntil) }))} · ${esc(money(b.recurringTotal, b.currency))}`, T('noCashRenewals'), 'warn')}
    </div>
    <section class="ap-panel"><header class="ap-panel-head"><h2>${esc(T('cashPayments'))}</h2><a class="ap-link" href="/admin/billing?show=cash">${esc(T('navBilling'))}</a></header>
      ${(f.cashPayments || []).length ? `<div class="ap-table-wrap"><table class="ap-table"><thead><tr><th>${esc(T('date'))}</th><th>${esc(T('salon'))}</th><th class="is-num">${esc(T('amount'))}</th><th>${esc(T('covers'))}</th><th>${esc(T('paidVia'))}</th></tr></thead>
        <tbody data-paginate="finance-cash">${f.cashPayments.map(p => `<tr${p.slug ? ` data-href="/admin/salons/${esc(p.slug)}?tab=billing" tabindex="0"` : ''}><td>${esc(fmtDate(p.paidOn))}</td><td>${esc(p.salonName)}</td><td class="is-num">${esc(money(p.amount, p.currency))}</td><td>${esc(fmtDate(p.periodStart))} – ${esc(fmtDate(p.periodEnd))}</td><td>${esc(T('via_' + p.via))}</td></tr>`).join('')}</tbody></table></div>`
        : `<p class="ap-quiet">${esc(T('noCashPayments'))}</p>`}</section>
    <section class="ap-panel"><header class="ap-panel-head"><h2>${esc(T('transactions'))}</h2>
      <div class="ap-seg" role="group" id="ap-tx-filter">${['', 'completed', 'past_due'].map(s => `<button type="button" data-tx="${s}" aria-pressed="${s === ''}">${esc(T(s ? 'tx_' + s : 'all'))}</button>`).join('')}</div></header>
      <div id="ap-tx">${loading()}</div></section>
    <p class="ap-quiet ap-foot">${esc(T('syncedAt', { time: fmtTime(f.syncedAt) }))}</p>`;
  bindCharts(view());
  view().querySelectorAll('[data-range]').forEach(b => b.addEventListener('click', () => { range = b.dataset.range; financeView(); }));
  document.getElementById('ap-fin-refresh').addEventListener('click', e => act(e.currentTarget, async () => { await api('/api/admin/finance?fresh=1'); await financeView(); }).catch(() => {}));
  const loadTx = async status => {
    const box = document.getElementById('ap-tx'); box.innerHTML = loading();
    const r = await api('/api/admin/finance/transactions' + (status ? '?status=' + status : ''));
    box.innerHTML = txTable(r.items);
  };
  document.getElementById('ap-tx-filter').addEventListener('click', e => {
    const b = e.target.closest('[data-tx]'); if (!b) return;
    e.currentTarget.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    loadTx(b.dataset.tx).catch(err => { document.getElementById('ap-tx').innerHTML = empty(T('errLoad')); });
  });
  await loadTx('');
  bindTxActions(view(), () => loadTx(''));
  bindRowLinks();
}
function salonList(title, list, sub, none, tone) {
  return `<section class="ap-panel"><header class="ap-panel-head"><h2>${esc(title)}</h2>${list.length ? pill(tone, num(list.length)) : ''}</header>
    ${list.length ? `<ul class="ap-tasks" data-paginate="finance-attention-${esc(title)}">${list.map(b => `<li><a class="ap-task" href="${b.salon ? `/admin/salons/${esc(b.salon.slug)}?tab=billing` : `/admin/applications/${esc(b.applicationId)}`}">${salonMark(b.salon || { name: b.salonName }, 36)}<span><b>${esc(b.salonName)}</b><small>${sub(b)}</small></span><span class="ap-task-meta">${esc(planText(b))}</span></a></li>`).join('')}</ul>` : `<p class="ap-quiet">${esc(none)}</p>`}</section>`;
}
export function txTable(items) {
  if (!items.length) return `<p class="ap-quiet">${esc(T('noTransactions'))}</p>`;
  return `<div class="ap-table-wrap"><table class="ap-table"><thead><tr><th>${esc(T('date'))}</th><th>${esc(T('invoice'))}</th><th>${esc(T('items'))}</th><th class="is-num">${esc(T('amount'))}</th><th class="is-num">${esc(T('fees'))}</th><th class="is-num">${esc(T('netEarnings'))}</th><th>${esc(T('status'))}</th><th><span class="sr-only">${esc(T('actions'))}</span></th></tr></thead>
    <tbody data-paginate="finance-transactions">${items.map(t => `<tr><td>${esc(fmtDate(t.billedAt))}</td><td dir="ltr">${esc(t.invoiceNumber || t.id.slice(0, 14) + '…')}</td><td>${esc((t.items || []).map(i => i.name + (i.quantity > 1 ? ' ×' + i.quantity : '')).join(', ') || '—')}</td>
      <td class="is-num">${esc(usd(t.total))}${Number(t.refunded) ? `<small class="ap-refunded">−${esc(usd(t.refunded))}</small>` : ''}</td><td class="is-num ap-quiet">${t.fee ? esc(usd(t.fee)) : '—'}</td><td class="is-num">${t.earnings ? esc(usd(t.earnings)) : '—'}</td>
      <td>${pill(t.status === 'completed' || t.status === 'paid' ? 'ok' : t.status === 'past_due' ? 'danger' : 'muted', T('tx_' + t.status))}</td>
      <td class="ap-row-actions"><button class="ap-btn is-quiet is-small" type="button" data-pdf="${esc(t.id)}">${esc(T('pdf'))}</button>${['completed', 'paid'].includes(t.status) && Number(t.total) > Number(t.refunded || 0) ? `<button class="ap-btn is-quiet is-small" type="button" data-refund="${esc(t.id)}" data-total="${esc(t.total)}" data-refunded="${esc(t.refunded || 0)}">${esc(T('refund'))}</button>` : ''}</td></tr>`).join('')}</tbody></table></div>`;
}
// Handlers are attached once per container (it outlives page changes); each render only swaps the reload to call.
const reloads = new WeakMap();
const bindOnce = (root, key, reload, attach) => { reloads.set(root, { ...(reloads.get(root) || {}), [key]: reload }); if (root.dataset[key]) return; root.dataset[key] = '1'; attach(() => reloads.get(root)?.[key]?.()); };
// PDF + refund buttons, wherever a transactions table is drawn.
export function bindTxActions(root, reload) {
  bindOnce(root, 'txBound', reload, reloadNow => root.addEventListener('click', async e => {
    const pdf = e.target.closest('[data-pdf]');
    if (pdf) { await act(pdf, async () => { const r = await api(`/api/admin/invoices/${pdf.dataset.pdf}/pdf`); window.open(r.url, '_blank', 'noopener'); }).catch(() => {}); return; }
    const rf = e.target.closest('[data-refund]');
    if (rf) refundDialog(rf, reloadNow);
  }));
}
function refundDialog(button, reload) {
  const left = Number(button.dataset.total) - Number(button.dataset.refunded || 0);
  const host = document.createElement('div');
  host.className = 'modal-root';
  host.innerHTML = `<div class="modal-backdrop" data-close></div><form class="modal ap-modal" role="dialog" aria-modal="true" aria-labelledby="rf-title" novalidate>
    <h2 id="rf-title">${esc(T('refundTitle'))}</h2><p>${esc(T('refundLead', { v: usd(left) }))}</p>
    <div class="ap-seg" role="radiogroup"><label><input type="radio" name="type" value="full" checked> ${esc(T('refundFull'))}</label><label><input type="radio" name="type" value="partial"> ${esc(T('refundPartial'))}</label></div>
    <label class="ap-field" id="rf-amount" hidden><span>${esc(T('amountUsd'))}</span><input name="amount" type="number" min="0.01" step="0.01" max="${(left / 100).toFixed(2)}" dir="ltr"></label>
    <label class="ap-field"><span>${esc(T('refundReason'))}</span><input name="reason" maxlength="200" required></label>
    <p class="ap-note">${esc(T('refundNote'))}</p><p class="ap-error" role="alert"></p>
    <div class="modal-actions"><button type="button" class="ap-btn is-quiet" data-close>${esc(T('cancel'))}</button><button type="submit" class="ap-btn is-danger">${esc(T('refund'))}</button></div></form>`;
  document.body.appendChild(host);
  requestAnimationFrame(() => host.classList.add('is-open'));
  const form = host.querySelector('form'), close = () => { host.classList.remove('is-open'); setTimeout(() => host.remove(), 200); button.focus(); };
  form.elements.reason.focus();
  host.addEventListener('click', e => { if (e.target.closest('[data-close]')) close(); });
  host.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
  form.addEventListener('change', () => { host.querySelector('#rf-amount').hidden = form.elements.type.value !== 'partial'; });
  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (!form.elements.reason.value.trim()) { form.querySelector('.ap-error').textContent = T('refundReasonNeeded'); return; }
    const data = { type: form.elements.type.value, reason: form.elements.reason.value.trim(), amount: Number(form.elements.amount.value || 0) };
    await act(form.querySelector('[type=submit]'), () => post(`/api/admin/transactions/${button.dataset.refund}/refund`, data), T('refundRequested')).then(() => { close(); reload(); }).catch(() => {});
  });
}

// ---- Plan change requests ---------------------------------------------------------------------------------------------
export async function requestsView() {
  setTitle(T('navRequests'));
  view().innerHTML = loading();
  const { requests } = await api('/api/admin/change-requests?status=all');
  const pending = requests.filter(r => r.status === 'pending'), done = requests.filter(r => r.status !== 'pending');
  view().innerHTML = `<p class="ap-lead">${esc(T('requestsLead'))}</p>
    ${pending.length ? `<div class="ap-stack" data-paginate="requests-pending">${pending.map(changeCard).join('')}</div>` : empty(T('noRequests'), T('noRequestsText'))}
    ${done.length ? `<section class="ap-panel"><header class="ap-panel-head"><h2>${esc(T('history'))}</h2></header><div class="ap-table-wrap"><table class="ap-table"><thead><tr><th>${esc(T('salon'))}</th><th>${esc(T('requested'))}</th><th>${esc(T('status'))}</th><th>${esc(T('decidedBy'))}</th><th>${esc(T('date'))}</th></tr></thead>
      <tbody data-paginate="requests-done">${done.map(r => `<tr><td>${esc(r.salonName)}</td><td>${esc(changeText(r.approved || r.requested))}</td><td>${pill({ charged: 'ok', failed: 'danger', rejected: 'muted', cancelled: 'muted' }[r.status] || 'muted', T('req_' + r.status))}</td><td>${esc(r.decidedBy || '')}</td><td>${esc(fmtDate(r.decidedAt || r.createdAt))}</td></tr>`).join('')}</tbody></table></div></section>` : ''}`;
  bindChangeEditors(view(), requestsView);
}
const changeText = c => c ? [PLAN_NAMES[c.plan] || c.plan, c.extraSpecialists ? `+${c.extraSpecialists} ${T('specialistsShort')}` : '', c.loyalty ? T(c.option === 'smart_waitlist' ? 'optWaitlistAdmin' : 'loyaltyShort') : '', c.interval === 'year' ? T('yearly') : T('intervalMonthly')].filter(Boolean).join(' · ') : '';
export function changeEditor(app, init, requestId = null) {
  const c = init || {};
  return `<form class="ap-change" data-change="${esc(app)}"${requestId ? ` data-request="${requestId}"` : ''} novalidate><div class="ap-form-grid">
    <label class="ap-field"><span>${esc(T('plan'))}</span><select name="plan">${(c.plan === 'business' ? ['basic', 'pro', 'business'] : ['basic', 'pro']).map(p => `<option value="${p}"${c.plan === p ? ' selected' : ''}>${PLAN_NAMES[p]}</option>`).join('')}</select></label>
    <label class="ap-field"><span>${esc(T('billingInterval'))}</span><select name="interval"><option value="month"${c.interval !== 'year' ? ' selected' : ''}>${esc(T('intervalMonthly'))}</option><option value="year"${c.interval === 'year' ? ' selected' : ''}>${esc(T('yearly'))}</option></select></label>
    <label class="ap-field"><span>${esc(T('extraSpecialists'))}</span><input name="extraSpecialists" type="number" min="0" max="50" value="${Number(c.extraSpecialists || 0)}" dir="ltr"></label>
    <label class="ap-field"><span>${esc(T('basicOptionAdmin'))}</span><select name="basicOption">${['', 'loyalty', 'smart_waitlist'].map(v => `<option value="${v}"${(c.loyalty ? (c.option || 'loyalty') : '') === v ? ' selected' : ''}>${esc(T(v === 'loyalty' ? 'optLoyaltyAdmin' : v === 'smart_waitlist' ? 'optWaitlistAdmin' : 'optNoneAdmin'))}</option>`).join('')}</select></label>
    <label class="ap-field is-wide"><span>${esc(T('noteToOwner'))}</span><input name="note" maxlength="1000"></label></div>
    <div class="ap-preview" aria-live="polite"></div><p class="ap-error" role="alert"></p>
    <div class="ap-actions"><button class="ap-btn" type="button" data-preview>${esc(T('previewCharge'))}</button><button class="ap-btn is-primary" type="submit" disabled>${esc(T('approveCharge'))}</button>${requestId ? `<button class="ap-btn is-quiet is-danger" type="button" data-reject>${esc(T('reject'))}</button>` : ''}</div></form>`;
}
function changeCard(r) {
  return `<section class="ap-panel ap-request"><header class="ap-panel-head"><div><h2>${esc(r.salonName)}</h2><small class="ap-quiet">${esc(r.ownerName)} · <span dir="ltr">${esc(r.email)}</span> · ${esc(fmtTime(r.createdAt))}</small></div>${billingPill(r.billing)}</header>
    <div class="ap-compare"><div><small>${esc(T('currentPlan'))}</small><b>${esc(changeText({ ...r.current, interval: r.billing?.interval }))}</b></div><span aria-hidden="true">→</span><div><small>${esc(T('requested'))}</small><b>${esc(changeText(r.requested))}</b></div></div>
    ${r.ownerNote ? `<blockquote class="ap-quote">${esc(r.ownerNote)}</blockquote>` : ''}
    ${changeEditor(r.applicationId, r.requested, r.id)}</section>`;
}
// Preview asks Paddle what the change costs now; approving charges exactly that (prorated) and applies the new plan.
export function bindChangeEditors(root, reload) {
  const read = form => ({ plan: form.elements.plan.value, interval: form.elements.interval.value, extraSpecialists: Number(form.elements.extraSpecialists.value || 0), loyalty: !!form.elements.basicOption.value && form.elements.plan.value === 'basic', option: form.elements.basicOption.value || 'loyalty' });
  bindOnce(root, 'changeBound', reload, reloadNow => {
  root.addEventListener('input', e => { const form = e.target.closest('form[data-change]'); if (form && e.target.name !== 'note') { form.querySelector('[type=submit]').disabled = true; form.querySelector('.ap-preview').innerHTML = ''; } });
  root.addEventListener('click', async e => {
    const form = e.target.closest('form[data-change]'); if (!form) return;
    if (e.target.closest('[data-preview]')) {
      const box = form.querySelector('.ap-preview');
      await act(e.target.closest('button'), async () => {
        const { preview: p } = await post(`/api/admin/billing/${form.dataset.change}/preview`, read(form));
        const fits = p.check?.ok !== false;
        box.innerHTML = `<dl class="ap-facts ap-preview-facts"><div><dt>${esc(T('chargeNow'))}</dt><dd><b>${esc(p.immediate)}</b></dd></div><div><dt>${esc(T('thenEach'))}</dt><dd>${esc(p.next || '—')}</dd></div><div><dt>${esc(T('nextBilling'))}</dt><dd>${esc(fmtDate(p.nextBilledAt))}</dd></div><div><dt>${esc(T('specialistsFit'))}</dt><dd>${fits ? pill('ok', T('fitsN', { active: p.check?.active ?? 0, limit: p.check?.limit ?? '∞' })) : pill('danger', T('tooMany', { active: p.check?.active, limit: p.check?.limit }))}</dd></div></dl>`;
        form.querySelector('[type=submit]').disabled = !fits;
      }).catch(() => {});
    }
    if (e.target.closest('[data-reject]')) {
      if (!(await confirm(T('rejectTitle'), T('rejectBody'), { danger: true }))) return;
      await act(e.target.closest('button'), () => post(`/api/admin/change-requests/${form.dataset.request}/reject`, { note: form.elements.note.value }), T('rejected')).then(reloadNow).catch(() => {});
    }
  });
  root.addEventListener('submit', async e => {
    const form = e.target.closest('form[data-change]'); if (!form) return;
    e.preventDefault();
    if (!(await confirm(T('chargeTitle'), T('chargeBody'), { confirmLabel: T('approveCharge') }))) return;
    const data = { ...read(form), note: form.elements.note.value, ...(form.dataset.request ? { requestId: Number(form.dataset.request) } : {}) };
    await act(form.querySelector('[type=submit]'), () => post(`/api/admin/billing/${form.dataset.change}/apply`, data), T('changeApplied')).then(reloadNow).catch(() => {});
  });
  });
}

// ---- Discount codes ---------------------------------------------------------------------------------------------------
export async function discountsView() {
  setTitle(T('navDiscounts'));
  view().innerHTML = loading();
  const { discounts } = await api('/api/admin/discounts');
  view().innerHTML = `<div class="ap-columns is-wide-first"><section class="ap-panel"><header class="ap-panel-head"><h2>${esc(T('discountCodes'))}</h2></header>
      ${discounts.length ? `<div class="ap-table-wrap"><table class="ap-table"><thead><tr><th>${esc(T('code'))}</th><th>${esc(T('value'))}</th><th>${esc(T('duration'))}</th><th class="is-num">${esc(T('used'))}</th><th>${esc(T('expires'))}</th><th>${esc(T('status'))}</th><th></th></tr></thead>
        <tbody data-paginate="discounts">${discounts.map(d => `<tr><td><code dir="ltr">${esc(d.code || '—')}</code><small class="ap-quiet">${esc(d.description)}</small></td><td>${esc(d.type === 'percentage' ? Number(d.amount) + '%' : usd(d.amount))}</td><td>${esc(d.recur ? (d.maxIntervals ? T('forNMonths', { n: d.maxIntervals }) : T('forever')) : T('firstPaymentOnly'))}</td>
          <td class="is-num">${num(d.timesUsed)}${d.usageLimit ? ' / ' + num(d.usageLimit) : ''}</td><td>${esc(d.expiresAt ? fmtDate(d.expiresAt) : '—')}</td><td>${pill(d.status === 'active' ? 'ok' : 'muted', T('dsc_' + d.status))}</td>
          <td><button class="ap-btn is-quiet is-small" type="button" data-dsc="${esc(d.id)}" data-to="${d.status === 'archived' ? 'active' : 'archived'}">${esc(T(d.status === 'archived' ? 'activate' : 'archive'))}</button></td></tr>`).join('')}</tbody></table></div>` : `<p class="ap-quiet">${esc(T('noDiscounts'))}</p>`}</section>
    <section class="ap-panel"><header class="ap-panel-head"><h2>${esc(T('newDiscount'))}</h2></header>
      <form id="ap-dsc" class="ap-stack" novalidate>
        <label class="ap-field"><span>${esc(T('code'))}</span><input name="code" required maxlength="16" dir="ltr" autocapitalize="characters" placeholder="LAUNCH20"></label>
        <div class="ap-form-grid"><label class="ap-field"><span>${esc(T('type'))}</span><select name="type"><option value="percentage">${esc(T('percentOff'))}</option><option value="flat">${esc(T('amountOff'))}</option></select></label>
        <label class="ap-field"><span>${esc(T('value'))}</span><input name="amount" type="number" min="1" step="0.01" required dir="ltr"></label></div>
        <label class="ap-field"><span>${esc(T('duration'))}</span><select name="duration"><option value="once">${esc(T('firstPaymentOnly'))}</option><option value="months">${esc(T('forSomeMonths'))}</option><option value="forever">${esc(T('forever'))}</option></select></label>
        <label class="ap-field" id="ap-dsc-months" hidden><span>${esc(T('months'))}</span><input name="months" type="number" min="1" max="60" value="3" dir="ltr"></label>
        <div class="ap-form-grid"><label class="ap-field"><span>${esc(T('usageLimit'))}</span><input name="usageLimit" type="number" min="1" dir="ltr" placeholder="${esc(T('unlimited'))}"></label>
        <label class="ap-field"><span>${esc(T('expires'))}</span><input name="expiresAt" type="date" dir="ltr"></label></div>
        <label class="ap-field"><span>${esc(T('description'))}</span><input name="description" maxlength="100"></label>
        <p class="ap-note">${esc(T('discountNote'))}</p><p class="ap-error" role="alert"></p>
        <button class="ap-btn is-primary" type="submit">${esc(T('createCode'))}</button></form></section></div>`;
  const form = document.getElementById('ap-dsc');
  form.elements.duration.addEventListener('change', () => { document.getElementById('ap-dsc-months').hidden = form.elements.duration.value !== 'months'; });
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const dur = form.elements.duration.value;
    const data = { code: form.elements.code.value, type: form.elements.type.value, amount: Number(form.elements.amount.value), recur: dur !== 'once',
      maxIntervals: dur === 'months' ? Number(form.elements.months.value) : null, usageLimit: form.elements.usageLimit.value ? Number(form.elements.usageLimit.value) : null,
      expiresAt: form.elements.expiresAt.value || null, description: form.elements.description.value };
    await act(form.querySelector('[type=submit]'), () => post('/api/admin/discounts', data), T('codeCreated')).then(discountsView).catch(() => {});
  });
  bindOnce(view(), 'dscBound', discountsView, reloadNow => view().addEventListener('click', async e => {
    const b = e.target.closest('[data-dsc]'); if (!b) return;
    await act(b, () => post(`/api/admin/discounts/${b.dataset.dsc}`, { status: b.dataset.to }, 'PATCH')).then(reloadNow).catch(() => {});
  }));
}
