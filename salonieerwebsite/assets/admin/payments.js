// Payment Core: the online payment providers and each salon's own merchant accounts (moved here from the app's
// retired Salonieer Admin console). Each salon is the merchant; Salonieer only keeps the technical link and status.
import { T, esc, rpc, view, setTitle, loading, empty, pill, act, num } from './panel.js';

const PROVIDER = { architecture_ready: 'info', pending_documentation: 'warn', pending_provider_approval: 'warn', sandbox_tested: 'info', live: 'ok' };
const MERCHANT = { unconfirmed: 'muted', confirmed: 'ok', not_permitted: 'danger' };
const ACCOUNT = { requested: 'warn', pending_review: 'info', connected: 'ok', disabled: 'muted' };
const field = (label, input, cls = '') => `<label class="ap-field ${cls}"><span>${esc(label)}</span>${input}</label>`;
const options = (states, prefix, value) => Object.keys(states).map(k => `<option value="${k}"${k === value ? ' selected' : ''}>${esc(T(prefix + k))}</option>`).join('');

// ---- Provider registry and connection requests (platform-wide) ------------------------------------------------------
export async function paymentsView() {
  setTitle(T('navPayments'));
  view().innerHTML = loading();
  const r = await rpc('platform_payment_providers');
  const dis = r.can_edit ? '' : 'disabled';
  view().innerHTML = `${r.can_edit ? '' : `<p class="ap-note">${esc(T('readOnlyManager'))}</p>`}
    <section class="ap-panel"><h3>${esc(T('payModel'))}</h3><p>${esc(T('payModelLead'))}</p><p class="ap-quiet">${esc(T('payModelRule'))}</p></section>
    <div class="ap-columns">${r.providers.map(p => `<form class="ap-panel" data-provider="${esc(p.code)}">
      <header class="ap-panel-head"><h3>${esc(p.name)}</h3>${pill(PROVIDER[p.integration_status] || 'muted', T('prov_' + p.integration_status))}</header>
      <p class="ap-quiet">${esc(p.region || '')} · ${esc(T('providerCounts', { salons: num(p.accounts), requests: num(p.requests) }))}</p>
      <div class="ap-form-grid">${field(T('integrationStatus'), `<select name="integration_status" ${dis}>${options(PROVIDER, 'prov_', p.integration_status)}</select>`)}
        ${field(T('multiMerchant'), `<select name="multi_merchant_status" ${dis}>${options(MERCHANT, 'mm_', p.multi_merchant_status)}</select>`)}
        ${field(T('docsUrl'), `<input name="docs_url" dir="ltr" maxlength="500" value="${esc(p.docs_url || '')}" ${dis}>`, 'is-full')}
        ${field(T('notes'), `<input name="notes" maxlength="1000" value="${esc(p.notes || '')}" ${dis}>`, 'is-full')}</div>
      ${r.can_edit ? `<div class="ap-actions"><button class="ap-btn" type="submit">${esc(T('saveChanges'))}</button><p class="ap-error" role="alert"></p></div>` : ''}</form>`).join('')}</div>
    <section class="ap-panel"><h3>${esc(T('connectRequests'))}</h3>${r.requests.length ? `<ul class="ap-rows" data-paginate="pay-requests">${r.requests.map(q => `<li><span><b>${esc(q.name)}</b><small>${esc(q.provider)}${q.note ? ' · ' + esc(q.note) : ''}</small></span>${pill(ACCOUNT[q.status] || 'muted', T('acct_' + q.status))}<a class="ap-link" href="/admin/salons/${esc(q.slug)}?tab=payments">${esc(T('open'))}</a></li>`).join('')}</ul>` : `<p class="ap-quiet">${esc(T('noRequestsYet'))}</p>`}</section>`;
  if (!r.can_edit) return;
  view().querySelectorAll('[data-provider]').forEach(form => form.addEventListener('submit', e => {
    e.preventDefault();
    act(form.querySelector('button'), () => rpc('platform_payment_provider_save', { p_code: form.dataset.provider, p_data: Object.fromEntries(new FormData(form)) }), T('saved')).then(paymentsView).catch(() => {});
  }));
}

// ---- One salon's merchant accounts (salon page tab) -------------------------------------------------------------------
export async function tabPayments(host, s, reload) {
  const r = await rpc('platform_payment_accounts', { p_slug: s.slug });
  const dis = r.can_edit ? '' : 'disabled';
  host.innerHTML = `${r.can_edit ? '' : `<p class="ap-note">${esc(T('readOnlyManager'))}</p>`}
    <section class="ap-panel"><h3>${esc(T('salonPayAccounts'))}</h3><p class="ap-quiet">${esc(T('salonPayLead'))}</p>
      <p>${r.online?.ready ? pill('ok', T('onlineReady')) : pill('warn', T('onlineNotReady'))}</p></section>
    <div class="ap-columns">${r.accounts.map(a => `<form class="ap-panel" data-account="${esc(a.provider)}">
      <header class="ap-panel-head"><h3>${esc(a.name)}</h3><span class="ap-pills">${pill(PROVIDER[a.integration_status] || 'muted', T('prov_' + a.integration_status))}${a.status ? pill(ACCOUNT[a.status] || 'muted', T('acct_' + a.status)) : ''}</span></header>
      ${a.request_note ? `<p class="ap-quiet">${esc(a.request_note)}</p>` : ''}
      <div class="ap-form-grid">${field(T('accountStatus'), `<select name="status" ${dis}>${options(ACCOUNT, 'acct_', a.status || 'pending_review')}</select>`)}
        ${field(T('accountMode'), `<select name="mode" ${dis}><option value="test"${a.mode !== 'live' ? ' selected' : ''}>${esc(T('modeTest'))}</option><option value="live"${a.mode === 'live' ? ' selected' : ''}>${esc(T('modeLive'))}</option></select>`)}
        ${field(T('merchantLabel'), `<input name="merchant_label" maxlength="120" value="${esc(a.merchant_label || '')}" ${dis}>`, 'is-full')}
        ${r.can_edit ? field(T('credentialsJson'), `<textarea name="credentials" rows="3" dir="ltr" placeholder="${esc(a.has_credentials ? T('credentialsKept') : '{ }')}"></textarea>`, 'is-full') : ''}</div>
      ${r.can_edit ? `<div class="ap-actions"><button class="ap-btn" type="submit">${esc(T('saveChanges'))}</button><p class="ap-error" role="alert"></p></div>` : ''}</form>`).join('') || empty(T('noProviders'))}</div>`;
  if (!r.can_edit) return;
  host.querySelectorAll('[data-account]').forEach(form => form.addEventListener('submit', e => {
    e.preventDefault();
    const box = form.querySelector('.ap-error'), data = Object.fromEntries(new FormData(form));
    box.textContent = '';
    if (data.credentials?.trim()) { try { data.credentials = JSON.parse(data.credentials); } catch { box.textContent = T('credentialsInvalid'); return; } }
    else delete data.credentials;
    act(form.querySelector('button'), () => rpc('platform_payment_account_save', { p_slug: s.slug, p_provider: form.dataset.account, p_data: data }), T('saved')).then(reload).catch(() => {});
  }));
}
