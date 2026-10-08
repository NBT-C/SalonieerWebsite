// Billing of every salon (2.26): the Billing page (all salons, how each one pays) and a salon's Billing tab — set billing
// up for a salon that has none, cash payments (paid until a date, then grace and pause), card links, and switching a
// salon between card and cash. Cash is an admin-only method: applicants can only pay by card or bank transfer.
// Everything goes through the website API (billing.php); the browser never talks to Paddle.
import { esc, T, setTitle, view, loading, empty, pill, act, confirm, site, fmtDate, num, salonMark, params, bindRowLinks } from './panel.js';
import { billingPill, txTable, bindTxActions, changeEditor, bindChangeEditors, planText, PLAN_NAMES } from './finance.js';

const api = (path, opts) => site().api(path, opts);
const post = (path, data) => site().api(path, { method: 'POST', body: JSON.stringify(data || {}) });
const CURRENCIES = ['USD', 'ILS', 'JOD', 'EUR'];
const PLANS = ['basic', 'pro', 'business', 'enterprise'];
const field = (label, input, cls = '') => `<label class="ap-field ${cls}"><span>${esc(label)}</span>${input}</label>`;
const options = (list, value, label) => list.map(v => `<option value="${esc(v)}"${v === value ? ' selected' : ''}>${esc(label(v))}</option>`).join('');
// Amounts are kept in cents; shown in their own currency (cash salons may pay in shekels or dinars).
export const money = (cents, currency = 'USD') => {
  const v = Number(cents || 0) / 100;
  try { return new Intl.NumberFormat(site().lang === 'ar' ? 'ar' : site().lang, { style: 'currency', currency, currencyDisplay: currency === 'USD' ? 'narrowSymbol' : 'code', minimumFractionDigits: Number.isInteger(v) ? 0 : 2, maximumFractionDigits: 2 }).format(v); }
  catch { return `${currency} ${v}`; }
};
const today = () => new Date().toISOString().slice(0, 10);
const daysUntil = d => Math.ceil((new Date(d + (String(d).length === 10 ? 'T23:59:59Z' : '')) - Date.now()) / 86400000);
const addPeriod = (date, interval, n = 1) => { const d = new Date((date || today()) + 'T00:00:00Z'); if (interval === 'year') d.setUTCFullYear(d.getUTCFullYear() + n); else d.setUTCMonth(d.getUTCMonth() + n); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); };
const VIA = v => T('via_' + v);

// The state of a salon's billing in one pill.
export function methodPill(b) {
  if (!b) return pill('muted', T('noBilling'));
  if (b.method !== 'cash') return billingPill(b);
  if (b.pausedForBilling) return pill('danger', T(b.pauseReason === 'canceled' ? 'cashStopped' : 'billPaused'));
  if (b.pastDueSince) return pill('danger', T('cashOverdue'));
  if (b.cashEnds) return pill('warn', T('cashEndsOn', { date: fmtDate(b.paidUntil) }));
  if (b.paidUntil && daysUntil(b.paidUntil) <= 3) return pill('warn', T('cashDueSoon', { date: fmtDate(b.paidUntil) }));
  return pill('ok', T('cashPaidUntil', { date: fmtDate(b.paidUntil) }));
}
const methodLabel = b => !b ? T('noBilling') : b.method === 'cash' ? T('methodCash') : T('methodCard');

// One small form in a dialog; resolves when submitted successfully (onSubmit throws to keep it open).
function formDialog({ title, lead = '', body, submit, danger = false, onSubmit, wide = false }) {
  return new Promise(resolve => {
    const host = document.createElement('div');
    host.className = 'modal-root';
    host.innerHTML = `<div class="modal-backdrop" data-close></div><form class="modal ap-modal${wide ? ' is-wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="bd-title" novalidate>
      <h2 id="bd-title">${esc(title)}</h2>${lead ? `<p>${esc(lead)}</p>` : ''}<div class="ap-form-grid ap-dialog-grid">${body}</div><p class="ap-error" role="alert"></p>
      <div class="modal-actions"><button type="button" class="ap-btn is-quiet" data-close>${esc(T('cancel'))}</button><button type="submit" class="ap-btn ${danger ? 'is-danger' : 'is-primary'}">${esc(submit)}</button></div></form>`;
    document.body.appendChild(host);
    requestAnimationFrame(() => host.classList.add('is-open'));
    const form = host.querySelector('form'), opener = document.activeElement;
    const close = value => { host.classList.remove('is-open'); setTimeout(() => host.remove(), 200); opener?.focus?.(); resolve(value); };
    form.querySelector('input,select,textarea')?.focus();
    host.addEventListener('click', e => { if (e.target.closest('[data-close]')) close(null); });
    host.addEventListener('keydown', e => { if (e.key === 'Escape') close(null); });
    form.addEventListener('submit', async e => {
      e.preventDefault();
      if (!form.reportValidity()) return;
      const r = await act(form.querySelector('[type=submit]'), () => onSubmit(form)).catch(() => undefined);
      if (r !== undefined) close(r);
    });
    host.form = form;
  });
}
const planFields = (c = {}) => `${field(T('plan'), `<select name="plan">${options(PLANS, c.plan || 'basic', p => PLAN_NAMES[p])}</select>`)}
  ${field(T('billingInterval'), `<select name="interval">${options(['month', 'year'], c.interval || 'month', v => T(v === 'year' ? 'yearly' : 'intervalMonthly'))}</select>`)}
  ${field(T('extraSpecialists'), `<input name="extraSpecialists" type="number" min="0" max="50" step="1" value="${Number(c.extraSpecialists || 0)}" dir="ltr">`)}
  <label class="ap-check"><input type="checkbox" name="loyalty"${c.loyalty ? ' checked' : ''}> <span>${esc(T('loyaltyAddon'))}</span></label>`;
const readPlan = f => ({ plan: f.elements.plan.value, interval: f.elements.interval.value, extraSpecialists: Math.max(0, Math.min(50, parseInt(f.elements.extraSpecialists.value, 10) || 0)), loyalty: f.elements.loyalty.checked });
const ownerFields = (o = {}) => `${field(T('ownerEmail'), `<input name="email" type="email" dir="ltr" maxlength="200" value="${esc(o.email || '')}" autocomplete="off">`)}
  ${field(T('ownerName'), `<input name="name" maxlength="120" value="${esc(o.name || '')}">`)}
  ${field(T('emailLanguage'), `<select name="lang">${options(['ar', 'en', 'he'], o.lang || 'ar', l => ({ ar: 'العربية', en: 'English', he: 'עברית' })[l])}</select>`)}
  ${field(T('country'), `<select name="country">${options(['PS', 'IL', 'JO', ''], o.country ?? 'PS', c => c ? (({ PS: 'Palestine', IL: 'Israel', JO: 'Jordan' })[c]) : T('otherCountry'))}</select>`)}`;
const readOwner = f => ({ email: f.elements.email.value.trim(), name: f.elements.name.value.trim(), lang: f.elements.lang.value, country: f.elements.country.value });

// ---- Billing page: every salon -------------------------------------------------------------------------------------
const FILTERS = ['all', 'attention', 'card', 'cash', 'none'];
export async function billingView() {
  setTitle(T('navBilling'));
  view().innerHTML = loading();
  const { salons } = await api('/api/admin/billing/salons');
  const attention = s => s.billing && (s.billing.pausedForBilling || s.billing.pastDueSince || s.billing.status === 'past_due' || (s.billing.method === 'cash' && s.billing.paidUntil && daysUntil(s.billing.paidUntil) <= 3));
  const kind = s => !s.billing || (s.billing.method !== 'cash' && !s.billing.subscriptionId && !s.billing.cardLinkSentAt) ? 'none' : s.billing.method === 'cash' ? 'cash' : 'card';
  const counts = { all: salons.length, attention: salons.filter(attention).length, card: salons.filter(s => kind(s) === 'card').length, cash: salons.filter(s => kind(s) === 'cash').length, none: salons.filter(s => kind(s) === 'none').length };
  let filter = FILTERS.includes(params().get('show')) ? params().get('show') : 'all', q = '';
  view().innerHTML = `<p class="ap-lead">${esc(T('billingLead'))}</p>
    <dl class="ap-kpis is-compact">${['card', 'cash', 'none', 'attention'].map(k => `<div class="ap-kpi${k === 'attention' && counts.attention ? ' is-danger' : ''}"><dt>${esc(T('bf_' + k))}</dt><dd><b>${num(counts[k])}</b></dd></div>`).join('')}</dl>
    <div class="ap-toolbar"><div class="ap-chips" role="group" aria-label="${esc(T('filter'))}">${FILTERS.map(f => `<button type="button" class="ap-chip" data-show="${f}" aria-pressed="${f === filter}">${esc(T('bf_' + f))}<b>${num(counts[f])}</b></button>`).join('')}</div>
      <label class="ap-search"><input type="search" id="bl-q" placeholder="${esc(T('searchSalons'))}" aria-label="${esc(T('searchSalons'))}"></label></div>
    <div class="ap-table-wrap"><table class="ap-table"><thead><tr><th>${esc(T('salon'))}</th><th>${esc(T('billingMethod'))}</th><th>${esc(T('status'))}</th><th>${esc(T('plan'))}</th><th class="is-num">${esc(T('recurring'))}</th><th>${esc(T('nextDate'))}</th><th>${esc(T('ownerEmail'))}</th></tr></thead>
      <tbody id="bl-rows" data-paginate="billing-salons"></tbody></table></div>`;
  const draw = () => {
    const rows = salons.filter(s => (filter === 'all' || (filter === 'attention' ? attention(s) : kind(s) === filter)) && (!q || [s.name, s.slug, s.accessCode, s.owner?.email].join(' ').toLowerCase().includes(q)));
    document.getElementById('bl-rows').innerHTML = rows.length ? rows.map(s => {
      const b = s.billing, next = !b ? '' : b.method === 'cash' ? b.paidUntil : (b.scheduledChange?.action === 'cancel' ? b.scheduledChange.effectiveAt : b.nextBilledAt);
      return `<tr data-href="/admin/salons/${esc(s.slug)}?tab=billing" tabindex="0">
        <td data-label="${esc(T('salon'))}"><span class="ap-cell-salon">${salonMark({ name: s.name, logo_url: s.logoUrl }, 34)}<span><b>${esc(s.name)}</b><small dir="ltr">${esc(s.accessCode)}</small></span></span></td>
        <td data-label="${esc(T('billingMethod'))}">${esc(methodLabel(kind(s) === 'none' ? null : b))}</td><td data-label="${esc(T('status'))}">${kind(s) === 'none' ? pill('muted', T('noBilling')) : methodPill(b)}${s.isActive ? '' : ' ' + pill('danger', T('paused'))}</td>
        <td data-label="${esc(T('plan'))}">${esc(PLAN_NAMES[s.owner?.plan] || (s.planCode === 'full_access' ? 'Enterprise' : PLAN_NAMES[s.planCode] || s.planCode || '—'))}</td>
        <td data-label="${esc(T('recurring'))}" class="is-num">${b && b.recurringTotal ? esc(money(b.recurringTotal, b.currency)) + ' / ' + esc(T(b.interval === 'year' ? 'year' : 'month')) : '—'}</td>
        <td data-label="${esc(T('nextDate'))}">${next ? esc(fmtDate(next)) : '—'}</td><td data-label="${esc(T('ownerEmail'))}" dir="ltr">${esc(s.owner?.email || '—')}</td></tr>`;
    }).join('') : `<tr data-no-page><td colspan="7">${empty(T('noMatch'))}</td></tr>`;
  };
  draw();
  view().querySelectorAll('[data-show]').forEach(b => b.addEventListener('click', () => {
    filter = b.dataset.show; view().querySelectorAll('[data-show]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    history.replaceState(null, '', '/admin/billing?show=' + filter); draw();
  }));
  document.getElementById('bl-q').addEventListener('input', e => { q = e.target.value.trim().toLowerCase(); draw(); });
  bindRowLinks();
}

// ---- A salon's Billing tab -------------------------------------------------------------------------------------------
export async function tabBilling(host, s) {
  const data = await api(`/api/admin/billing/salon/${encodeURIComponent(s.slug)}`);
  const b = data.billing, app = data.applicationId;
  const reload = () => tabBilling(host, s);
  const running = b && b.method !== 'cash' && ['active', 'trialing', 'past_due', 'paused'].includes(b.status);
  if (!b || (b.method !== 'cash' && !b.subscriptionId)) {
    host.innerHTML = `${b?.cardLinkSentAt ? `<p class="ap-note">${esc(T('cardLinkPending', { date: fmtDate(b.cardLinkSentAt) }))} <a class="ap-link" href="${esc(b.cardLink?.link || '#')}" target="_blank" rel="noopener" dir="ltr">${esc(T('openLink'))}</a></p>` : ''}
      ${setupPanel(s, data)}`;
    bindSetup(host, s, data, reload);
    return;
  }
  host.innerHTML = b.method === 'cash' ? cashPanel(b, data) : cardPanel(b, data, running);
  host._reload = reload;
  if (b.method !== 'cash') bindChangeEditors(host, reload);
  bindTxActions(host, reload);
  bindBillingActions(host, s, data, reload);
}

function setupPanel(s, data) {
  const a = data.application, q = a?.quote || {};
  const plan = { plan: a?.plan || 'basic', interval: q.interval || 'month', extraSpecialists: q.extraSpecialists || 0, loyalty: !!q.loyalty };
  const owner = a ? { email: a.email, name: a.name, lang: a.lang, country: a.country } : { lang: 'ar', country: 'PS' };
  return `<section class="ap-panel"><header class="ap-panel-head"><div><h2>${esc(T('setupBilling'))}</h2><p class="ap-quiet">${esc(T('setupBillingLead'))}</p></div>${pill('muted', T('noBilling'))}</header>
    <form id="bl-setup" class="ap-form-grid" novalidate>
      <fieldset class="ap-fieldset is-full"><legend>${esc(T('billingMethod'))}</legend><div class="ap-seg" role="radiogroup">
        <label><input type="radio" name="method" value="cash" checked> ${esc(T('methodCash'))}</label><label><input type="radio" name="method" value="card"> ${esc(T('methodCardLink'))}</label></div>
        <p class="ap-quiet" data-for="cash">${esc(T('cashHint'))}</p><p class="ap-quiet" data-for="card" hidden>${esc(T('cardLinkHint'))}</p></fieldset>
      ${planFields(plan)}
      <div class="is-full" data-for="cash"><div class="ap-form-grid">
        ${field(T('pricePerPeriod'), `<input name="price" type="number" min="0" step="0.01" dir="ltr" required>`)}
        ${field(T('currency'), `<select name="currency">${options(CURRENCIES, q.currency === 'ILS' ? 'ILS' : 'USD', c => c)}</select>`)}
        ${field(T('paidUntil'), `<input name="paidUntil" type="date" dir="ltr" value="${addPeriod(today(), plan.interval)}"><small>${esc(T('paidUntilHint'))}</small>`)}
        ${field(T('receivedNow'), `<input name="received" type="number" min="0" step="0.01" dir="ltr" placeholder="0"><small>${esc(T('receivedNowHint'))}</small>`)}
        ${field(T('paidVia'), `<select name="via">${options(['cash', 'bank_transfer', 'other'], 'cash', VIA)}</select>`)}
        ${field(T('internalNote'), `<input name="note" maxlength="500">`)}</div></div>
      <div class="is-full" data-for="card" hidden>${field(T('pricingTier'), `<select name="tier">${options(['west_bank', 'standard'], owner.country === 'PS' ? 'west_bank' : 'standard', t => T('tier_' + t))}</select><small>${esc(T('pricingTierHint'))}</small>`)}</div>
      <h4>${esc(T('ownerContact'))}</h4>${ownerFields(owner)}
      <label class="ap-check is-full"><input type="checkbox" name="applyPlan" checked> <span>${esc(T('applyPlanToSalon'))}</span></label>
      <div class="ap-actions is-full"><button class="ap-btn is-primary" type="submit">${esc(T('setupBillingNow'))}</button><p class="ap-error" role="alert"></p></div></form>
    <div id="bl-link"></div></section>`;
}
function bindSetup(host, s, data, reload) {
  const form = host.querySelector('#bl-setup');
  const sync = () => {
    const m = form.elements.method.value;
    form.querySelectorAll('[data-for]').forEach(x => { x.hidden = x.dataset.for !== m; });
    form.elements.price.required = m === 'cash';
    form.elements.email.required = m === 'card';
    const ent = form.elements.plan.value === 'enterprise';
    form.querySelector('[name=method][value=card]').disabled = ent;
    if (ent && m === 'card') { form.querySelector('[name=method][value=cash]').checked = true; sync(); }
  };
  form.addEventListener('change', e => { if (e.target.name === 'interval' && form.elements.method.value === 'cash') form.elements.paidUntil.value = addPeriod(today(), form.elements.interval.value); sync(); });
  sync();
  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (!form.reportValidity()) return;
    const m = form.elements.method.value;
    const body = { method: m, ...readPlan(form), owner: readOwner(form), applyPlan: form.elements.applyPlan.checked };
    if (m === 'cash') Object.assign(body, { price: form.elements.price.value, currency: form.elements.currency.value, paidUntil: form.elements.paidUntil.value || null,
      received: form.elements.received.value || null, via: form.elements.via.value, note: form.elements.note.value });
    else body.tier = form.elements.tier.value;
    if (!(await confirm(T('setupBilling'), T(m === 'cash' ? 'setupCashConfirm' : 'setupCardConfirm', { salon: s.name })))) return;
    const r = await act(form.querySelector('[type=submit]'), () => post(`/api/admin/billing/salon/${encodeURIComponent(s.slug)}/create`, body), T(m === 'cash' ? 'billingCreated' : 'payLinkSent')).catch(() => null);
    if (!r) return;
    if (r.link) { await linkDialog(r.link); }
    reload();
  });
}
function linkDialog(link) {
  return formDialog({ title: T('cardLinkReady'), lead: T('cardLinkReadyLead'), submit: T('copy'),
    body: `<label class="ap-field is-full"><span>${esc(T('checkoutLink'))}</span><input readonly dir="ltr" value="${esc(link)}"></label>`,
    onSubmit: async () => { try { await navigator.clipboard.writeText(link); } catch {} return true; } });
}

function ownerFacts(data) {
  const a = data.application || {};
  return `<div><dt>${esc(T('ownerContact'))}</dt><dd>${esc(a.name || '—')} <small dir="ltr">${esc(a.email || T('noEmail'))}</small></dd></div>`;
}
function cashPanel(b, data) {
  const days = b.paidUntil ? daysUntil(b.paidUntil) : null;
  const ledger = b.cashLedger || [];
  return `<section class="ap-panel"><header class="ap-panel-head"><h2>${esc(T('cashBilling'))}</h2>${methodPill(b)}</header>
      ${b.pastDueSince && !b.pausedForBilling ? `<p class="ap-note is-danger">${esc(T('cashGraceNote', { date: fmtDate(b.graceEndsAt), n: num(b.remindersSent) }))}</p>` : ''}
      ${b.pausedForBilling ? `<p class="ap-note is-danger">${esc(T(b.pauseReason === 'canceled' ? 'cashStoppedNote' : 'cashPausedNote'))}</p>` : ''}
      <dl class="ap-facts is-cash"><div><dt>${esc(T('plan'))}</dt><dd>${esc(planText({ plan: data.application?.plan, interval: b.interval }))}</dd></div>
        <div><dt>${esc(T('pricePerPeriod'))}</dt><dd><b>${esc(money(b.recurringTotal, b.currency))}</b> / ${esc(T(b.interval === 'year' ? 'year' : 'month'))}</dd></div>
        <div><dt>${esc(T('paidUntil'))}</dt><dd>${b.paidUntil ? esc(fmtDate(b.paidUntil)) + (days !== null && days >= 0 ? ` <small>${esc(T('inDays', { n: num(days) }))}</small>` : '') : '—'}</dd></div>
        <div><dt>${esc(T('afterPaidPeriod'))}</dt><dd>${esc(T(b.cashEnds ? 'cashThenPause' : 'cashThenGrace'))}</dd></div>
        ${ownerFacts(data)}${b.cardLinkSentAt ? `<div><dt>${esc(T('cardLinkSent'))}</dt><dd>${esc(fmtDate(b.cardLinkSentAt))}</dd></div>` : ''}</dl>
      <div class="ap-actions"><button class="ap-btn is-primary" type="button" data-bl="cash-payment">${esc(T('recordPayment'))}</button>
        <button class="ap-btn" type="button" data-bl="cash-edit">${esc(T('editCash'))}</button><button class="ap-btn" type="button" data-bl="card-link">${esc(T('switchToCard'))}</button>
        <button class="ap-btn is-quiet" type="button" data-bl="owner">${esc(T('ownerContact'))}</button>
        ${b.cashEnds ? `<button class="ap-btn is-quiet" type="button" data-bl="cash-continue">${esc(T('keepBilling'))}</button>` : `<button class="ap-btn is-quiet is-danger" type="button" data-bl="cash-stop-end">${esc(T('stopAtPeriodEnd'))}</button>`}
        ${b.pausedForBilling ? '' : `<button class="ap-btn is-quiet is-danger" type="button" data-bl="cash-stop-now">${esc(T('stopNow'))}</button>`}<p class="ap-error" role="alert"></p></div></section>
    <section class="ap-panel"><header class="ap-panel-head"><h2>${esc(T('cashPayments'))}</h2>${pill('muted', num(ledger.filter(p => !p.voidedAt).length))}</header>
      ${ledger.length ? `<div class="ap-table-wrap"><table class="ap-table"><thead><tr><th>${esc(T('date'))}</th><th class="is-num">${esc(T('amount'))}</th><th>${esc(T('covers'))}</th><th>${esc(T('paidVia'))}</th><th><span class="sr-only">${esc(T('actions'))}</span></th></tr></thead>
        <tbody data-paginate="cash-ledger">${ledger.map(p => `<tr class="${p.voidedAt ? 'is-voided' : ''}"><td>${esc(fmtDate(p.paidOn))}<small class="ap-quiet">${esc(p.recordedBy || '')}</small></td>
          <td class="is-num">${p.voidedAt ? `<s>${esc(money(p.amount, p.currency))}</s>` : esc(money(p.amount, p.currency))}</td><td class="ap-nowrap">${esc(fmtDate(p.periodStart))} – ${esc(fmtDate(p.periodEnd))}${p.note ? `<small class="ap-quiet">${esc(p.note)}</small>` : ''}</td>
          <td>${esc(VIA(p.via))}</td><td class="ap-row-actions">${p.voidedAt ? pill('muted', T('voided')) + `<small class="ap-quiet">${esc(p.voidReason)}</small>` : `<button class="ap-btn is-quiet is-small" type="button" data-void="${esc(p.id)}">${esc(T('voidPayment'))}</button>`}</td></tr>`).join('')}</tbody></table></div>`
        : `<p class="ap-quiet">${esc(T('noCashPayments'))}</p>`}</section>
    ${b.subscriptionId ? `<section class="ap-panel"><header class="ap-panel-head"><h2>${esc(T('previousCard'))}</h2>${billingPill({ ...b, method: 'card' })}</header><p class="ap-quiet" dir="ltr"><code>${esc(b.subscriptionId)}</code></p></section>` : ''}
    ${(data.transactions || []).length ? `<section class="ap-panel"><header class="ap-panel-head"><h2>${esc(T('invoices'))}</h2></header>${txTable(data.transactions)}</section>` : ''}`;
}
function cardPanel(b, data, running) {
  const a = data.application || {}, q = a.quote || {};
  const items = (b.items || []).map(i => `<li><span>${esc(i.name || i.item)}${i.quantity > 1 ? ' × ' + num(i.quantity) : ''}${i.trial ? ' ' + pill('info', T('trialLabel')) : ''}</span><b>${esc(money(Number(i.unitAmount) * i.quantity, b.currency))}</b></li>`).join('');
  return `<div class="ap-columns">
    <section class="ap-panel"><header class="ap-panel-head"><h2>${esc(T('subscription'))}</h2>${billingPill(b)}</header>
      <dl class="ap-facts"><div><dt>${esc(T('plan'))}</dt><dd>${esc(planText({ plan: a.plan, interval: b.interval }))}</dd></div><div><dt>${esc(T('recurring'))}</dt><dd><b>${esc(money(b.recurringTotal, b.currency))}</b> / ${esc(T(b.interval === 'year' ? 'year' : 'month'))}</dd></div>
        <div><dt>${esc(T('nextBilling'))}</dt><dd>${esc(b.nextBilledAt ? fmtDate(b.nextBilledAt) : '—')}</dd></div><div><dt>${esc(T('periodEnds'))}</dt><dd>${esc(b.currentPeriodEndsAt ? fmtDate(b.currentPeriodEndsAt) : '—')}</dd></div>
        ${b.trialEndsAt && b.status === 'trialing' ? `<div><dt>${esc(T('trialEnds'))}</dt><dd>${esc(fmtDate(b.trialEndsAt))}</dd></div>` : ''}
        ${b.status === 'past_due' ? `<div><dt>${esc(T('graceEnds'))}</dt><dd>${esc(fmtDate(b.graceEndsAt))} · ${esc(T('remindersSent', { n: num(b.remindersSent) }))}</dd></div>` : ''}
        ${ownerFacts(data)}<div><dt>Paddle</dt><dd dir="ltr"><code>${esc(b.subscriptionId)}</code></dd></div></dl>
      ${items ? `<ul class="ap-items" data-paginate="billing-items">${items}</ul>` : ''}
      <div class="ap-actions">
        ${b.scheduledChange?.action === 'cancel' ? `<button class="ap-btn" type="button" data-bill="resume">${esc(T('resumeSub'))}</button>` : running && b.status !== 'paused' ? `<button class="ap-btn is-quiet is-danger" type="button" data-bill="cancel">${esc(T('cancelAtEnd'))}</button>` : ''}
        ${['past_due', 'active', 'trialing'].includes(b.status) ? `<button class="ap-btn is-quiet" type="button" data-bill="pay-link">${esc(T('sendPayLink'))}</button>` : ''}
        ${['active', 'trialing'].includes(b.status) && b.scheduledChange?.action !== 'cancel' ? `<button class="ap-btn is-quiet" type="button" data-bl="pause">${esc(T('pauseSub'))}</button>` : ''}
        ${b.status === 'paused' ? `<button class="ap-btn" type="button" data-bl="unpause">${esc(T('unpauseSub'))}</button>` : ''}
        <button class="ap-btn" type="button" data-bl="to-cash">${esc(T('switchToCash'))}</button>
        ${!running ? `<button class="ap-btn is-primary" type="button" data-bl="card-link">${esc(T('sendNewCardLink'))}</button>` : ''}
        <button class="ap-btn is-quiet" type="button" data-bl="owner">${esc(T('ownerContact'))}</button>
        <button class="ap-btn is-quiet" type="button" data-bill="sync">${esc(T('syncPaddle'))}</button>
        ${running ? `<button class="ap-btn is-quiet is-danger" type="button" data-bl="cancel-now">${esc(T('stopNow'))}</button>` : ''}<p class="ap-error" role="alert"></p></div></section>
    <section class="ap-panel"><header class="ap-panel-head"><h2>${esc(T('changePlan'))}</h2></header><p class="ap-quiet">${esc(T('changePlanLead'))}</p>
      ${b.pendingChange ? `<p class="ap-note">${esc(T('ownerAsked', { change: PLAN_NAMES[b.pendingChange.requested?.plan] || '' }))} <a class="ap-link" href="/admin/requests">${esc(T('openRequests'))}</a></p>` : ''}
      ${!running ? `<p class="ap-quiet">${esc(T('canceledNoChange'))}</p>` : changeEditor(data.applicationId, { plan: a.plan, extraSpecialists: q.extraSpecialists || 0, loyalty: !!q.loyalty, interval: b.interval }, b.pendingChange?.id || null)}</section></div>
    <section class="ap-panel"><header class="ap-panel-head"><h2>${esc(T('invoices'))}</h2></header>${txTable(data.transactions || [])}</section>`;
}

function bindBillingActions(host, s, data, reload) {
  const b = data.billing, app = data.applicationId, a = data.application || {};
  host.onclick = async e => {
    const old = e.target.closest('[data-bill]');
    if (old) {
      const action = old.dataset.bill;
      if (action === 'cancel' && !(await confirm(T('cancelSubTitle'), T('cancelSubBody', { date: fmtDate(b.currentPeriodEndsAt) }), { danger: true }))) return;
      const r = await act(old, () => post(`/api/admin/billing/${app}/${action}`, {}), T(action === 'pay-link' ? 'payLinkSent' : 'saved')).catch(() => null);
      if (r && action !== 'pay-link') reload();
      return;
    }
    const v = e.target.closest('[data-void]');
    if (v) {
      const r = await formDialog({ title: T('voidPayment'), lead: T('voidPaymentLead'), submit: T('voidPayment'), danger: true,
        body: field(T('reason'), `<input name="reason" required minlength="2" maxlength="300">`, 'is-full'),
        onSubmit: f => post(`/api/admin/billing/${app}/cash-void`, { id: Number(v.dataset.void), reason: f.elements.reason.value.trim() }) });
      if (r) reload();
      return;
    }
    const btn = e.target.closest('[data-bl]'); if (!btn) return;
    const action = btn.dataset.bl;
    if (action === 'cash-payment') {
      const r = await formDialog({ title: T('recordPayment'), lead: T('recordPaymentLead', { date: fmtDate(b.paidUntil) || '—' }), submit: T('recordPayment'),
        body: `${field(T('amount'), `<input name="amount" type="number" min="0" step="0.01" dir="ltr" required value="${(Number(b.recurringTotal || 0) / 100) || ''}">`)}
          ${field(T('currency'), `<select name="currency">${options(CURRENCIES, b.currency, c => c)}</select>`)}
          ${field(T('periodsPaid'), `<input name="periods" type="number" min="1" max="36" step="1" value="1" dir="ltr"><small>${esc(T(b.interval === 'year' ? 'periodYears' : 'periodMonths'))}</small>`)}
          ${field(T('orUntil'), `<input name="until" type="date" dir="ltr">`)}
          ${field(T('paidVia'), `<select name="via">${options(['cash', 'bank_transfer', 'other'], 'cash', VIA)}</select>`)}
          ${field(T('paidOn'), `<input name="paidOn" type="date" dir="ltr" value="${today()}">`)}
          ${field(T('internalNote'), `<input name="note" maxlength="500">`, 'is-full')}`,
        onSubmit: f => post(`/api/admin/billing/${app}/cash-payment`, { amount: f.elements.amount.value, currency: f.elements.currency.value, periods: parseInt(f.elements.periods.value, 10) || 1,
          until: f.elements.until.value || null, via: f.elements.via.value, paidOn: f.elements.paidOn.value || null, note: f.elements.note.value }) });
      if (r) { site().toast(T('paymentRecorded')); reload(); }
    } else if (action === 'cash-edit') {
      const q = a.quote || {};
      const r = await formDialog({ title: T('editCash'), lead: T('editCashLead'), submit: T('saveChanges'), wide: true,
        body: `${planFields({ plan: a.plan, interval: b.interval, extraSpecialists: q.extraSpecialists, loyalty: q.loyalty })}
          ${field(T('pricePerPeriod'), `<input name="price" type="number" min="0" step="0.01" dir="ltr" value="${Number(b.recurringTotal || 0) / 100}">`)}
          ${field(T('currency'), `<select name="currency">${options(CURRENCIES, b.currency, c => c)}</select>`)}
          ${field(T('paidUntilBase'), `<input name="paidUntil" type="date" dir="ltr" value="${esc(b.cashBaseUntil || '')}"><small>${esc(T('paidUntilBaseHint'))}</small>`, 'is-full')}`,
        onSubmit: f => post(`/api/admin/billing/${app}/cash-update`, { ...readPlan(f), price: f.elements.price.value, currency: f.elements.currency.value, paidUntil: f.elements.paidUntil.value || null }) });
      if (r) { site().toast(T('saved')); reload(); }
    } else if (action === 'cash-stop-end' || action === 'cash-continue') {
      const stop = action === 'cash-stop-end';
      if (stop && !(await confirm(T('stopAtPeriodEnd'), T('stopAtPeriodEndBody', { date: fmtDate(b.paidUntil) }), { danger: true }))) return;
      const r = await act(btn, () => post(`/api/admin/billing/${app}/cash-update`, { endsAtPeriodEnd: stop }), T('saved')).catch(() => null);
      if (r) reload();
    } else if (action === 'cash-stop-now' || action === 'cancel-now') {
      if (!(await confirm(T('stopNow'), T('stopNowBody', { salon: s.name }), { danger: true, confirmLabel: T('stopNow') }))) return;
      const r = await act(btn, () => post(`/api/admin/billing/${app}/${action}`, {}), T('saved')).catch(() => null);
      if (r) reload();
    } else if (action === 'pause' || action === 'unpause') {
      if (action === 'pause' && !(await confirm(T('pauseSub'), T('pauseSubBody'), { danger: true }))) return;
      const r = await act(btn, () => post(`/api/admin/billing/${app}/${action}`, {}), T('saved')).catch(() => null);
      if (r) reload();
    } else if (action === 'to-cash') {
      const until = b.currentPeriodEndsAt ? b.currentPeriodEndsAt.slice(0, 10) : today();
      const r = await formDialog({ title: T('switchToCash'), lead: T('switchToCashLead'), submit: T('switchToCash'),
        body: `${field(T('pricePerPeriod'), `<input name="price" type="number" min="0" step="0.01" dir="ltr" value="${Number(b.recurringTotal || 0) / 100}">`)}
          ${field(T('currency'), `<select name="currency">${options(CURRENCIES, b.currency || 'USD', c => c)}</select>`)}
          ${field(T('paidUntil'), `<input name="paidUntil" type="date" dir="ltr" value="${esc(until)}"><small>${esc(T('switchToCashUntilHint'))}</small>`, 'is-full')}`,
        onSubmit: f => post(`/api/admin/billing/${app}/to-cash`, { price: f.elements.price.value, currency: f.elements.currency.value, paidUntil: f.elements.paidUntil.value || null }) });
      if (r) { site().toast(T('switchedToCash')); reload(); }
    } else if (action === 'card-link') {
      if (!a.email) { site().toast(T('emailRequired'), 'error'); return; }
      const q = a.quote || {};
      const r = await formDialog({ title: T('switchToCard'), lead: T('cardLinkLead', { email: a.email }), submit: T('sendLink'), wide: true,
        body: `${planFields({ plan: a.plan === 'enterprise' ? 'business' : a.plan, interval: b.interval, extraSpecialists: q.extraSpecialists, loyalty: q.loyalty })}
          ${field(T('pricingTier'), `<select name="tier">${options(['west_bank', 'standard'], a.country === 'PS' ? 'west_bank' : 'standard', t => T('tier_' + t))}</select>`, 'is-full')}`,
        onSubmit: f => { const p = readPlan(f); if (p.plan === 'enterprise') throw Object.assign(new Error(T('enterpriseByAgreement')), { code: 'enterpriseByAgreement' }); return post(`/api/admin/billing/${app}/card-link`, { ...p, tier: f.elements.tier.value }); } });
      if (r?.link) { await linkDialog(r.link); reload(); }
    } else if (action === 'owner') {
      const r = await formDialog({ title: T('ownerContact'), lead: T('ownerContactLead'), submit: T('saveChanges'), wide: true,
        body: ownerFields({ email: a.email, name: a.name, lang: a.lang, country: a.country }),
        onSubmit: f => post(`/api/admin/billing/${app}/owner`, readOwner(f)) });
      if (r) { site().toast(T('saved')); reload(); }
    }
  };
}
