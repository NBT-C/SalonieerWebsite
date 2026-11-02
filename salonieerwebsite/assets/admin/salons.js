// Salons: the list, creating one, and each salon's page (overview + QR, details and branding, subscription and
// features, online payment accounts, admin accounts, notifications, danger zone). Salonieer Admin lives only here
// since 2.29 (the app's console was retired); same server functions it used.
import { T, esc, rpc, view, setTitle, loading, empty, pill, act, confirm, go, params, salonColor, salonMark,
  fmtDate, fmtTime, num, isOwner, qrSvg, site, errorText, actionLabel, toast } from './panel.js';
import { tabBilling } from './billing.js';
import { tabPayments } from './payments.js';
import { loadPhone, toE164, countryOptions, countryForTimezone } from './phone-input.js';

// 2.41: a salon is described by who works there and who it serves (the older salon type follows the clientele).
const TEAMS = ['male', 'female', 'mixed'], CLIENTELES = ['men', 'women', 'both'];
// Required for a new salon; an existing salon not classified yet can keep it empty when other details are saved.
const choose = (name, values, current, prefix, required) => `<select name="${name}"${required ? ' required' : ''}>${current ? '' : `<option value="">${esc(site().t('chooseOne'))}</option>`}${values.map(c => `<option value="${c}"${current === c ? ' selected' : ''}>${esc(site().t(prefix + c))}</option>`).join('')}</select>`;
// What the salon serves, for salons classified before 2.41 from their older type.
const clienteleOf = s => s.clientele || ({ female: 'women', beauty: 'women', male: 'men' })[s.salon_category] || '';
const STYLES = ['ivory', 'noir', 'midnight'];
const PALETTES = [['#1a88a4', '#c6b18b'], ['#438475', '#d4c4a1'], ['#94687e', '#e0c6b9'], ['#2f3a56', '#c9a86a'], ['#7a5a3a', '#e6cfa7']];
const field = (label, input, cls = '') => `<label class="ap-field ${cls}"><span>${esc(label)}</span>${input}</label>`;
const planLabel = p => p ? (p.code === 'full_access' ? 'Enterprise' : site().lang === 'ar' ? p.name_ar : p.name_en) : '—';

// ---- List ---------------------------------------------------------------------------------------------------------
export async function salonsView() {
  const p = params();
  let page = Math.max(1, Number(p.get('page')) || 1), status = ['active', 'inactive'].includes(p.get('status')) ? p.get('status') : 'all', q = p.get('q') || '', size = 5, request = 0;
  setTitle(T('navSalons'), isOwner() ? `<a class="ap-btn is-primary" href="/admin/salons/new">${esc(T('newSalon'))}</a>` : '');
  view().innerHTML = `<div class="ap-toolbar"><div class="ap-chips" role="group">${['all', 'active', 'inactive'].map(s => `<button type="button" class="ap-chip" data-status="${s}" aria-pressed="${s === status}">${esc(T(s === 'all' ? 'all' : s === 'active' ? 'active' : 'paused'))}<b data-count="${s}">·</b></button>`).join('')}</div>
    <label class="ap-search"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M11 18a7 7 0 100-14 7 7 0 000 14zM21 21l-4.3-4.3"/></svg><input type="search" id="ap-q" value="${esc(q)}" placeholder="${esc(T('searchSalons'))}" aria-label="${esc(T('searchSalons'))}"></label></div>
    <div id="ap-salons" class="ap-cards is-grid">${loading()}</div><nav class="ap-pager" id="ap-pager"></nav>`;
  const load = async () => {
    const mine = ++request, host = document.getElementById('ap-salons');
    const r = await rpc('platform_salons_page_v2', { p_page: page, p_page_size: size, p_query: q, p_status: status });
    if (mine !== request || !host.isConnected) return;
    page = r.page;
    history.replaceState(null, '', '/admin/salons?' + new URLSearchParams({ page, status, ...(q ? { q } : {}) }));
    ['all', 'active', 'inactive'].forEach(s => { const b = view().querySelector(`[data-count="${s}"]`); if (b) b.textContent = num(s === 'all' ? r.counts.total : r.counts[s]); });
    host.innerHTML = r.items.length ? r.items.map(salonCard).join('') : empty(q || status !== 'all' ? T('noMatch') : T('noSalons'), q ? T('tryOther') : '');
    const pages = Math.max(1, Math.ceil(r.total / size));
    document.getElementById('ap-pager').innerHTML = pages > 1 ? `<button class="ap-btn is-quiet" data-page="${page - 1}" ${page === 1 ? 'disabled' : ''}>${esc(T('previous'))}</button><span>${esc(T('pageOf', { page: num(page), pages: num(pages) }))}</span><button class="ap-btn is-quiet" data-page="${page + 1}" ${page === pages ? 'disabled' : ''}>${esc(T('next'))}</button>` : '';
    document.querySelectorAll('[data-page]').forEach(b => b.onclick = () => { page = Number(b.dataset.page); load(); scrollTo({ top: 0 }); });
  };
  view().querySelectorAll('[data-status]').forEach(b => b.addEventListener('click', () => { status = b.dataset.status; page = 1; view().querySelectorAll('[data-status]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); load(); }));
  let timer;
  document.getElementById('ap-q').addEventListener('input', e => { clearTimeout(timer); timer = setTimeout(() => { q = e.target.value.trim(); page = 1; load(); }, 250); });
  await load();
}
function salonCard(s) {
  const sub = s.subscription || {};
  return `<a class="ap-index is-large" href="/admin/salons/${esc(s.slug)}" style="--salon:${esc(salonColor(s))}">${salonMark(s, 52)}
    <span class="ap-index-body"><b>${esc(s.name)}</b><small dir="ltr">${esc(s.access_code)}</small>
    <span class="ap-pills">${pill(s.is_active ? 'ok' : 'danger', T(s.is_active ? 'active' : 'paused'))}${sub.plan_code ? pill('info', sub.plan_code === 'full_access' ? 'Enterprise' : (site().lang === 'ar' ? sub.name_ar : sub.name_en) || sub.plan_code) : ''}${sub.effective_status && sub.effective_status !== 'active' ? pill('warn', T('sub_' + sub.effective_status)) : ''}</span></span></a>`;
}

// ---- Shared form for creating and editing a salon ---------------------------------------------------------------------
function identityForm(s = {}, edit = false) {
  const caps = s.capabilities || {}, primary = caps.primary_color || '#1a88a4', secondary = caps.secondary_color || '#c6b18b';
  return `<form id="ap-identity" class="ap-form-grid" novalidate>
    ${field(T('salonName'), `<input name="name" required maxlength="80" value="${esc(s.name || '')}">`)}
    ${field(T('slug'), `<input name="slug" dir="ltr" ${edit ? 'disabled' : 'required pattern="[a-z][a-z0-9]{1,23}" placeholder="elite"'} value="${esc(s.slug || '')}"><small>${esc(T(edit ? 'slugFixed' : 'slugHint'))}</small>`)}
    ${field(T('salonCode'), `<input name="access_code" dir="ltr" required pattern="[A-Za-z0-9_\\-]{4,32}" placeholder="ELITE-001" value="${esc(s.access_code || '')}"><small>${esc(T('codeHint'))}</small>`)}
    ${field(site().t('teamComposition'), choose('team_composition', TEAMS, s.team_composition, 'team_', !edit))}
    ${field(site().t('clientele'), choose('clientele', CLIENTELES, s.clientele, 'clientele_', !edit))}
    ${field(T('timezone'), `<input name="timezone" dir="ltr" required value="${esc(caps.timezone || 'Asia/Hebron')}" list="ap-tz">`)}
    <datalist id="ap-tz">${['Asia/Hebron', 'Asia/Jerusalem', 'Asia/Amman', 'Asia/Riyadh', 'Asia/Dubai', 'Africa/Cairo', 'Europe/Istanbul', 'Europe/London', 'UTC'].map(z => `<option value="${z}">`).join('')}</datalist>
    <fieldset class="ap-fieldset is-full"><legend>${esc(T('branding'))}</legend><div class="ap-brand-editor">
      <div class="ap-form-grid">${field(T('primaryColor'), `<input type="color" name="primary_color" value="${esc(primary)}">`)}${field(T('detailColor'), `<input type="color" name="secondary_color" value="${esc(secondary)}">`)}
      ${field(T('appearance'), `<select name="style_preset">${STYLES.map(x => `<option value="${x}"${(caps.style_preset || 'ivory') === x ? ' selected' : ''}>${esc(T('style_' + x))}</option>`).join('')}</select>`)}
      ${field(T('motion'), `<select name="motion"><option value="full"${caps.motion !== 'subtle' ? ' selected' : ''}>${esc(T('motionFull'))}</option><option value="subtle"${caps.motion === 'subtle' ? ' selected' : ''}>${esc(T('motionSubtle'))}</option></select>`)}
      <div class="ap-swatches is-full" role="group" aria-label="${esc(T('palettes'))}">${PALETTES.map(([p, a]) => `<button type="button" class="ap-swatch" data-palette="${p},${a}" style="--a:${p};--b:${a}" aria-label="${p}"></button>`).join('')}</div></div>
      <div class="ap-preview" id="ap-preview" aria-hidden="true"><div class="ap-preview-top"><span class="ap-preview-logo" id="ap-preview-logo"></span><b id="ap-preview-name"></b></div>
        <div class="ap-preview-row"><span>${esc(T('previewService'))}</span><span>09:30</span></div><span class="ap-preview-btn">${esc(T('previewBook'))}</span></div></div></fieldset>
    <fieldset class="ap-fieldset is-full"><legend>${esc(T('logo'))}</legend><div class="ap-logo-row"><span class="ap-logo-box" id="ap-logo-box"></span>
      <div class="ap-stack is-tight"><input type="hidden" name="logo_url" value="${esc(s.logo_url || '')}"><label class="ap-btn is-quiet ap-file">${esc(T('chooseLogo'))}<input type="file" id="ap-logo-file" accept="image/png,image/jpeg,image/webp"></label>
      <button class="ap-link" type="button" id="ap-logo-clear">${esc(T('removeLogo'))}</button><small class="ap-quiet">${esc(T('logoHint'))}</small></div></div></fieldset>
    ${field(T('internalNote'), `<input name="admin_note" maxlength="500" value="${esc(s.admin_note || '')}">`, 'is-full')}
    <details class="ap-details is-full"><summary>${esc(T('advanced'))}</summary>${field(T('customCss'), `<textarea name="custom_css" rows="5" dir="ltr" spellcheck="false">${esc(caps.custom_css || '')}</textarea>`)}</details>
    ${edit ? '' : '<div class="is-full" id="ap-create-sub"></div>'}
    <div class="ap-actions is-full"><button class="ap-btn is-primary" type="submit">${esc(T(edit ? 'saveChanges' : 'createSalon'))}</button><p class="ap-error" role="alert"></p></div></form>`;
}
// Logo: picked from the device, scaled down to at most 512px and stored as a compact WebP data URL.
function readLogo(file) {
  return new Promise((resolve, reject) => {
    if (!/^image\/(png|jpeg|webp)$/.test(file.type) || file.size > 8e6) return reject({ code: 'invalidLogo' });
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, 512 / Math.max(img.width, img.height)), c = document.createElement('canvas');
      c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
      const out = c.toDataURL('image/webp', 0.9);
      resolve(out.startsWith('data:image/webp') ? out : c.toDataURL('image/png'));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject({ code: 'invalidLogo' }); };
    img.src = url;
  });
}
function wireIdentity(form, onSubmit) {
  const f = n => form.elements[n];
  const preview = () => {
    const p = document.getElementById('ap-preview');
    p.style.setProperty('--p', f('primary_color').value); p.style.setProperty('--a', f('secondary_color').value);
    p.dataset.style = f('style_preset').value;
    document.getElementById('ap-preview-name').textContent = f('name').value || T('salonName');
    const logo = f('logo_url').value;
    document.getElementById('ap-preview-logo').innerHTML = logo ? `<img src="${esc(logo)}" alt="">` : esc((f('name').value || 'S').charAt(0));
    document.getElementById('ap-logo-box').innerHTML = logo ? `<img src="${esc(logo)}" alt="">` : `<span>${esc(T('noLogo'))}</span>`;
  };
  ['primary_color', 'secondary_color', 'style_preset', 'name'].forEach(n => f(n).addEventListener('input', preview));
  form.querySelectorAll('[data-palette]').forEach(b => b.addEventListener('click', () => { const [p, a] = b.dataset.palette.split(','); f('primary_color').value = p; f('secondary_color').value = a; preview(); }));
  document.getElementById('ap-logo-file').addEventListener('change', async e => {
    const file = e.target.files[0]; if (!file) return;
    try { f('logo_url').value = await readLogo(file); preview(); } catch { toast(T('invalidLogo'), 'error'); }
  });
  document.getElementById('ap-logo-clear').addEventListener('click', () => { f('logo_url').value = ''; preview(); });
  preview();
  form.addEventListener('submit', e => {
    e.preventDefault();
    if (!form.reportValidity()) return;
    const data = Object.fromEntries([...form.elements].filter(x => x.name && !x.disabled).map(x => [x.name, x.value.trim()]));
    onSubmit(data, form.querySelector('[type=submit]'));
  });
}

// ---- New salon ----------------------------------------------------------------------------------------------------
export async function newSalonView() {
  setTitle(T('newSalon'), `<a class="ap-btn is-quiet" href="/admin/salons">${esc(T('allSalons'))}</a>`);
  if (!isOwner()) { view().innerHTML = empty(T('errOwnerOnly')); return; }
  const cat = await rpc('platform_subscription_catalog');
  view().innerHTML = `<section class="ap-panel">${identityForm({}, false)}</section>`;
  const plans = cat.plans.filter(p => p.is_active && p.code !== 'enterprise');
  document.getElementById('ap-create-sub').innerHTML = `<fieldset class="ap-fieldset"><legend>${esc(T('subscription'))}</legend><div class="ap-form-grid">
    ${field(T('plan'), `<select name="sub_plan">${plans.map(p => `<option value="${esc(p.code)}">${esc(planLabel(p))} — ${p.unlimited_specialists ? esc(T('unlimited')) : esc(T('nSpecialists', { n: num(p.included_specialists) }))}</option>`).join('')}</select>`)}
    ${field(T('subStatus'), `<select name="sub_status">${['active', 'trial'].map(s => `<option value="${s}">${esc(T('sub_' + s))}</option>`).join('')}</select>`)}
    ${field(T('startsOn'), `<input type="date" name="sub_start" value="${new Date().toISOString().slice(0, 10)}">`)}${field(T('expiresOn'), `<input type="date" name="sub_end">`)}
    ${field(T('extraSeats'), `<input type="number" name="sub_seats" min="0" max="1000" value="0">`)}</div></fieldset>`;
  const form = document.getElementById('ap-identity');
  wireIdentity(form, (data, button) => {
    const sub = { plan_code: data.sub_plan, status: data.sub_status, starts_on: data.sub_start, expires_on: data.sub_end || null, extra_seats: Number(data.sub_seats || 0) };
    ['sub_plan', 'sub_status', 'sub_start', 'sub_end', 'sub_seats'].forEach(k => delete data[k]);
    // Next step: the owner's access by phone number (Owners & access).
    act(button, () => rpc('platform_create_salon', { p_data: { ...data, subscription: sub } }), T('salonCreatedNext')).then(r => r && go('/admin/salons/' + r.slug + '?tab=accounts')).catch(() => {});
  });
}

// ---- One salon ----------------------------------------------------------------------------------------------------
const TABS = [['overview', 'tabOverview'], ['billing', 'tabBilling'], ['details', 'tabDetails'], ['subscription', 'tabSubscription'], ['payments', 'tabPayments'], ['accounts', 'tabAccounts'], ['notifications', 'tabNotifications']];
export async function salonView(slug) {
  setTitle(T('salon'), `<a class="ap-btn is-quiet" href="/admin/salons">${esc(T('allSalons'))}</a>`);
  view().innerHTML = loading();
  const s = await rpc('platform_get_salon', { p_slug: slug });
  if (!s) { view().innerHTML = empty(T('notFound')); return; }
  const tab = TABS.some(t => t[0] === params().get('tab')) ? params().get('tab') : 'overview';
  setTitle(s.name, `<a class="ap-btn is-quiet" href="/admin/salons">${esc(T('allSalons'))}</a>`);
  view().innerHTML = `<section class="ap-salon-head" style="--salon:${esc(salonColor(s))}">${salonMark(s, 72)}<div><h2>${esc(s.name)}</h2><p><span dir="ltr">${esc(s.access_code)}</span> · <span dir="ltr">${esc(s.slug)}</span></p>
      <div class="ap-pills">${pill(s.is_active ? 'ok' : 'danger', T(s.is_active ? 'active' : 'paused'))}${clienteleOf(s) ? pill('muted', site().t('clientele_' + clienteleOf(s))) : ''}${s.team_composition ? pill('muted', site().t('team_' + s.team_composition)) : ''}</div></div></section>
    <nav class="ap-tabs" role="tablist">${TABS.map(([k, label]) => `<a role="tab" class="ap-tab" href="/admin/salons/${esc(slug)}?tab=${k}" aria-selected="${k === tab}">${esc(T(label))}</a>`).join('')}</nav>
    <div id="ap-tab">${loading()}</div>`;
  const host = document.getElementById('ap-tab');
  const reload = () => salonView(slug);
  try { await ({ overview: tabOverview, billing: tabBilling, details: tabDetails, subscription: tabSubscription, payments: tabPayments, accounts: tabAccounts, notifications: tabNotifications })[tab](host, s, reload); }
  catch (e) { host.innerHTML = empty(T('errLoad'), errorText(e)); }
}

async function tabOverview(host, s, reload) {
  const [state, audit] = await Promise.all([rpc('platform_subscription_get', { p_slug: s.slug }).catch(() => null), rpc('platform_audit_list', { p_offset: 0 }).catch(() => [])]);
  const st = state?.state, spec = st?.specialists, sub = st?.subscription;
  // The salon's own link, as in the app (2.34): opens the salon in the app, or the store — also from a phone camera.
  const link = location.origin + '/s/' + encodeURIComponent(s.access_code);
  const mine = audit.filter(r => r.salon_slug === s.slug);
  host.innerHTML = `<div class="ap-columns"><div class="ap-stack">
      <section class="ap-panel"><h3>${esc(T('atAGlance'))}</h3><dl class="ap-facts">
        <div><dt>${esc(T('plan'))}</dt><dd>${esc(st ? planLabel(st.plan) : '—')}</dd></div>
        <div><dt>${esc(T('subStatus'))}</dt><dd>${sub ? pill(sub.good_standing ? 'ok' : 'warn', T('sub_' + sub.effective_status)) : '—'}</dd></div>
        <div><dt>${esc(T('specialists'))}</dt><dd>${spec ? (spec.unlimited ? `${num(spec.active)} / ${esc(T('unlimited'))}` : `${num(spec.active)} / ${num(spec.limit)}`) : '—'}</dd></div>
        <div><dt>${esc(T('expiresOn'))}</dt><dd>${sub?.expires_on ? esc(fmtDate(sub.expires_on)) : esc(T('noExpiry'))}</dd></div>
        <div><dt>${esc(T('timezone'))}</dt><dd dir="ltr">${esc(s.capabilities?.timezone || '')}</dd></div>
        <div><dt>${esc(T('created'))}</dt><dd>${esc(fmtDate(s.created_at))}</dd></div></dl>
        ${st ? `<ul class="ap-feature-list" data-paginate="salon-features">${Object.entries(st.features).map(([k, f]) => `<li class="${f.enabled ? 'is-on' : ''}">${esc(T('feat_' + k))}<small>${esc(T(f.enabled ? 'on' : 'off'))}</small></li>`).join('')}</ul>` : ''}</section>
      <section class="ap-panel"><h3>${esc(T('recentActivity'))}</h3>${mine.length ? `<ol class="ap-feed" data-paginate="salon-activity">${mine.map(r => `<li><span><b>${esc(actionLabel(r.action))}</b><small dir="ltr">${esc(r.actor_email || '')}</small></span><time>${esc(fmtTime(r.created_at))}</time></li>`).join('')}</ol>` : `<p class="ap-quiet">${esc(T('noActivity'))}</p>`}</section>
    </div><div class="ap-stack">
      <section class="ap-panel ap-qr-panel"><h3>${esc(T('qrTitle'))}</h3><figure class="ap-qr">${qrSvg(link)}<figcaption dir="ltr">${esc(s.access_code)}</figcaption></figure><p class="ap-quiet">${esc(T('qrHint'))}</p>
        <div class="ap-actions"><button class="ap-btn" type="button" id="ap-share">${esc(T('shareCode'))}</button><button class="ap-btn is-quiet" type="button" id="ap-print">${esc(T('print'))}</button></div></section>
      ${isOwner() ? `<section class="ap-panel"><h3>${esc(T('availability'))}</h3><p class="ap-quiet">${esc(T(s.is_active ? 'pauseHint' : 'resumeHint'))}</p><div class="ap-actions"><button class="ap-btn${s.is_active ? ' is-danger' : ' is-primary'}" type="button" id="ap-active">${esc(T(s.is_active ? 'pauseSalon' : 'resumeSalon'))}</button><p class="ap-error"></p></div></section>
      <section class="ap-panel is-danger-zone"><h3>${esc(T('deleteSalon'))}</h3><p class="ap-quiet">${esc(T('deleteHint'))}</p>
        <form id="ap-delete" class="ap-actions">${field(T('typeCodeToDelete', { code: s.access_code }), `<input name="confirm" dir="ltr" autocomplete="off">`)}<button class="ap-btn is-danger" type="submit">${esc(T('deleteForever'))}</button><p class="ap-error" role="alert"></p></form></section>` : ''}
    </div></div>`;
  document.getElementById('ap-share').addEventListener('click', async () => {
    const text = `${s.name}\n${s.access_code}\n${link}`;
    try { if (navigator.share) await navigator.share({ text }); else { await navigator.clipboard.writeText(text); toast(T('copied')); } } catch {}
  });
  document.getElementById('ap-print').addEventListener('click', () => {
    const w = window.open('', '_blank', 'width=480,height=640');
    if (!w) return;
    w.document.write(`<!doctype html><title>${esc(s.name)}</title><body style="font-family:sans-serif;text-align:center;padding:40px"><h1>${esc(s.name)}</h1><div style="width:320px;margin:auto">${qrSvg(link)}</div><h2 style="letter-spacing:.1em">${esc(s.access_code)}</h2><p>Salonieer</p><script>print()<\/script>`);
    w.document.close();
  });
  document.getElementById('ap-active')?.addEventListener('click', async e => {
    if (!(await confirm(T(s.is_active ? 'pauseSalon' : 'resumeSalon'), T(s.is_active ? 'pauseConfirm' : 'resumeConfirm'), { danger: s.is_active }))) return;
    act(e.currentTarget, () => rpc('platform_set_active', { p_slug: s.slug, p_active: !s.is_active }), T('saved')).then(reload).catch(() => {});
  });
  const del = document.getElementById('ap-delete');
  del?.addEventListener('submit', async e => {
    e.preventDefault();
    if (!(await confirm(T('deleteSalon'), T('deleteConfirm', { name: s.name }), { danger: true, confirmLabel: T('deleteForever') }))) return;
    act(del.querySelector('button'), () => rpc('platform_delete_salon', { p_slug: s.slug, p_confirm: del.elements.confirm.value.trim() }), T('salonDeleted')).then(() => go('/admin/salons')).catch(() => {});
  });
}

async function tabDetails(host, s, reload) {
  host.innerHTML = `<section class="ap-panel">${identityForm(s, true)}</section>`;
  wireIdentity(document.getElementById('ap-identity'), (data, button) =>
    act(button, () => rpc('platform_update_salon', { p_data: { ...data, slug: s.slug } }), T('saved')).then(reload).catch(() => {}));
}

// ---- Subscription and features (owner edits; managers read) ------------------------------------------------------------
async function tabSubscription(host, s, reload) {
  const [data, cat] = await Promise.all([rpc('platform_subscription_get', { p_slug: s.slug }), rpc('platform_subscription_catalog')]);
  const can = !!data.can_edit, dis = can ? '' : 'disabled', sub = data.subscription || {}, st = data.state, spec = st.specialists;
  const plans = cat.plans.filter(p => (p.is_active || p.code === sub.plan_code));
  const pct = spec.unlimited ? 15 : Math.min(100, Math.round(spec.active / Math.max(spec.limit, 1) * 100));
  host.innerHTML = `${can ? '' : `<p class="ap-note">${esc(T('readOnlyManager'))}</p>`}
    <div class="ap-columns"><div class="ap-stack">
    <section class="ap-panel"><h3>${esc(T('planAndStatus'))}</h3><form id="ap-sub" class="ap-form-grid">
      ${field(T('plan'), `<select name="plan_code" ${dis}>${plans.map(p => `<option value="${esc(p.code)}"${p.code === sub.plan_code ? ' selected' : ''}>${esc(planLabel(p))}</option>`).join('')}</select>`)}
      ${field(T('subStatus'), `<select name="status" ${dis}>${['active', 'trial', 'suspended', 'expired', 'cancelled'].map(x => `<option value="${x}"${x === sub.status ? ' selected' : ''}>${esc(T('sub_' + x))}</option>`).join('')}</select>`)}
      ${field(T('startsOn'), `<input type="date" name="starts_on" value="${esc(sub.starts_on || '')}" ${dis}>`)}${field(T('expiresOn'), `<input type="date" name="expires_on" value="${esc(sub.expires_on || '')}" ${dis}>`)}
      ${field(T('notes'), `<textarea name="notes" rows="2" maxlength="1000" ${dis}>${esc(sub.notes || '')}</textarea>`, 'is-full')}
      ${field(T('reason'), `<input name="reason" maxlength="300" ${dis}>`, 'is-full')}
      <div class="ap-note is-full" id="ap-impact" hidden></div>
      ${can ? `<div class="ap-actions is-full"><button class="ap-btn is-primary" type="submit">${esc(T('saveChanges'))}</button><p class="ap-error" role="alert"></p></div>` : ''}</form></section>
    <section class="ap-panel"><h3>${esc(T('specialistSeats'))}</h3><div class="ap-meter"><div class="ap-meter-top"><b>${num(spec.active)} / ${spec.unlimited ? esc(T('unlimited')) : num(spec.limit)}</b><span>${esc(T('activeSpecialists'))}</span></div><div class="ap-bar${spec.over_limit ? ' is-over' : ''}"><i style="width:${pct}%"></i></div>
      <small class="ap-quiet">${esc(T('seatBreakdown', { plan: spec.plan_unlimited ? T('unlimited') : num(spec.included), extra: num(spec.purchased) }))}</small></div>
      <form id="ap-limit" class="ap-form-grid">${field(T('customLimit'), `<input type="number" name="limit" min="0" value="${spec.override ?? ''}" placeholder="${esc(T('fromPlan'))}" ${dis}>`)}
        <label class="ap-check"><input type="checkbox" name="unlimited" ${spec.unlimited_override ? 'checked' : ''} ${dis}>${esc(T('unlimitedHere'))}</label>
        ${can ? `<div class="ap-actions is-full"><button class="ap-btn" type="submit">${esc(T('saveLimit'))}</button><p class="ap-error" role="alert"></p></div>` : ''}</form></section>
    </div><div class="ap-stack">
    <section class="ap-panel"><h3>${esc(T('features'))}</h3><p class="ap-quiet">${esc(T('featurePriority'))}</p>
      <div class="ap-features" data-paginate="salon-feature-overrides">${cat.features.map(f => { const d = st.features[f.key] || {}, ov = data.overrides?.[f.key]; const mode = ov?.mode || 'inherit'; return `<form class="ap-feature" data-feature="${esc(f.key)}">
        <header><b>${esc(site().lang === 'ar' ? f.label : f.label_en || f.label)}</b>${pill(d.enabled ? 'ok' : 'muted', T(d.enabled ? 'on' : 'off'))}</header><small class="ap-quiet">${esc(T('source_' + (d.source || 'none')))}</small>
        <select name="mode" ${dis} aria-label="${esc(T('control'))}">${['inherit', 'enabled', 'disabled'].map(m => `<option value="${m}"${m === mode ? ' selected' : ''}>${esc(T('mode_' + m))}</option>`).join('')}</select></form>`; }).join('')}</div></section>
    <section class="ap-panel"><h3>${esc(T('addonsTitle'))}</h3>${data.addons.length ? `<ul class="ap-rows" data-paginate="salon-addons">${data.addons.map(a => `<li><span><b>${esc(site().lang === 'ar' ? a.name_ar : a.name_en)}</b><small>${a.kind === 'seats' ? esc(T('qty', { n: num(a.quantity) })) + ' · ' : ''}${esc(fmtDate(a.starts_on))}${a.expires_on ? ' – ' + esc(fmtDate(a.expires_on)) : ''}</small></span>${pill(a.status === 'active' ? 'ok' : 'muted', T('addon_' + a.status))}${can && a.status === 'active' ? `<button class="ap-link" type="button" data-addon-off="${esc(a.id)}">${esc(T('deactivate'))}</button>` : ''}</li>`).join('')}</ul>` : `<p class="ap-quiet">${esc(T('noAddons'))}</p>`}
      ${can ? `<form id="ap-addon" class="ap-form-grid">${field(T('addon'), `<select name="addon_code">${cat.addons.filter(a => a.is_active).map(a => `<option value="${esc(a.code)}" data-kind="${esc(a.kind)}">${esc(site().lang === 'ar' ? a.name_ar : a.name_en)}</option>`).join('')}</select>`)}
        ${field(T('quantity'), `<input type="number" name="quantity" min="1" value="1">`)}${field(T('expiresOn'), `<input type="date" name="expires_on">`)}
        <div class="ap-actions is-full"><button class="ap-btn" type="submit">${esc(T('grantAddon'))}</button><p class="ap-error" role="alert"></p></div></form>` : ''}</section>
    <section class="ap-panel"><h3>${esc(T('history'))}</h3>${data.audit?.length ? `<ol class="ap-feed" data-paginate="salon-history">${data.audit.map(r => `<li><span><b>${esc(actionLabel(r.action))}</b>${r.reason ? `<small>${esc(r.reason)}</small>` : ''}</span><time>${esc(fmtTime(r.created_at))}</time></li>`).join('')}</ol>` : `<p class="ap-quiet">${esc(T('noActivity'))}</p>`}</section>
    </div></div>`;
  if (!can) return;
  const subForm = document.getElementById('ap-sub');
  // Changing the plan keeps add-ons and manual overrides as they are, unless the owner ticks a clean-up and confirms it.
  const activeAddons = data.addons.filter(a => a.status === 'active'), overrides = Object.values(data.overrides || {}).filter(o => o.mode && o.mode !== 'inherit');
  const impact = () => {
    const box = document.getElementById('ap-impact'), next = cat.plans.find(p => p.code === subForm.elements.plan_code.value);
    if (!next || next.code === sub.plan_code) { box.hidden = true; box.innerHTML = ''; return; }
    const limit = spec.unlimited_override ? null : spec.override !== null && spec.override !== undefined ? spec.override : next.unlimited_specialists ? null : Number(next.included_specialists) + Number(spec.purchased || 0);
    const blocked = limit !== null && limit < spec.active;
    box.hidden = false;
    box.innerHTML = `<b>${esc(T('planImpact', { plan: planLabel(next) }))}</b>
      <p>${esc(T('newSeatLimit', { n: limit === null ? T('unlimited') : num(limit) }))}${blocked ? ` <span class="ap-error">${esc(T('seatBlocked', { active: num(spec.active), n: num(spec.active - limit) }))}</span>` : ''}</p>
      <p class="ap-quiet">${esc(T('keptAsIs', { addons: num(activeAddons.length), overrides: num(overrides.length) }))}</p>
      ${activeAddons.length || overrides.length ? `<label class="ap-check"><input type="checkbox" name="reset_overrides" ${overrides.length ? '' : 'disabled'}>${esc(T('resetOverrides', { n: num(overrides.length) }))}</label>
      <label class="ap-check"><input type="checkbox" name="deactivate_redundant_addons" ${activeAddons.some(a => a.kind === 'feature') ? '' : 'disabled'}>${esc(T('dropIncludedAddons'))}</label>` : ''}`;
  };
  subForm.elements.plan_code.addEventListener('change', impact);
  subForm.addEventListener('submit', async e => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(subForm)); d.expires_on ||= null;
    const reset = !!subForm.elements.reset_overrides?.checked, drop = !!subForm.elements.deactivate_redundant_addons?.checked;
    delete d.reset_overrides; delete d.deactivate_redundant_addons;
    if (reset || drop) {
      const steps = [reset && T('resetOverridesStep'), drop && T('dropAddonsStep')].filter(Boolean).join(' · ');
      if (!(await confirm(T('confirmCleanup'), steps, { danger: true }))) return;
      Object.assign(d, { reset_overrides: reset, deactivate_redundant_addons: drop, confirm: true });
    }
    act(subForm.querySelector('button[type=submit]'), () => rpc('platform_subscription_save', { p_slug: s.slug, p_data: d }), T('saved')).then(reload).catch(() => {});
  });
  const lim = document.getElementById('ap-limit');
  lim.addEventListener('submit', e => { e.preventDefault(); const v = lim.elements.limit.value.trim();
    act(lim.querySelector('button'), () => rpc('platform_subscription_save', { p_slug: s.slug, p_data: { specialist_limit_override: v === '' ? null : Number(v), specialist_unlimited_override: lim.elements.unlimited.checked } }), T('saved')).then(reload).catch(() => {}); });
  host.querySelectorAll('[data-feature] select').forEach(sel => sel.addEventListener('change', () =>
    act(null, () => rpc('platform_entitlement_set', { p_slug: s.slug, p_feature: sel.closest('form').dataset.feature, p_data: { mode: sel.value } }), T('saved')).then(reload).catch(() => {})));
  host.querySelectorAll('[data-addon-off]').forEach(b => b.addEventListener('click', async () => {
    if (await confirm(T('deactivate'), T('deactivateAddon'))) act(b, () => rpc('platform_addon_save', { p_slug: s.slug, p_data: { id: b.dataset.addonOff, status: 'inactive' } }), T('saved')).then(reload).catch(() => {});
  }));
  const add = document.getElementById('ap-addon');
  add?.addEventListener('submit', e => { e.preventDefault(); const d = Object.fromEntries(new FormData(add));
    act(add.querySelector('button'), () => rpc('platform_addon_save', { p_slug: s.slug, p_data: { addon_code: d.addon_code, quantity: Number(d.quantity) || 1, starts_on: new Date().toISOString().slice(0, 10), expires_on: d.expires_on || null } }), T('saved')).then(reload).catch(() => {}); });
}

// ---- Owners and access (2.40: by phone number, no passwords) ------------------------------------------------------------
// Everyone signs in with their own Salonieer account (phone + their password). Salonieer gives a person access to a
// salon with the phone number and a role only: at once when the number has an account, otherwise when they sign up.
const ACCESS_ROLES = [['admin', 'accessRoleOwner'], ['manager', 'accessRoleManager'], ['specialist', 'accessRoleSpecialist'], ['other', 'accessRoleOther']];
const roleText = r => T((ACCESS_ROLES.find(x => x[0] === r) || [null, 'accessRoleOwner'])[1]);

async function tabAccounts(host, s, reload) {
  await loadPhone().catch(() => null);
  const [data, team] = await Promise.all([rpc('platform_access_list', { p_slug: s.slug }),
    rpc(s.rpc_prefix + 'admin_team_list', { p_token: '__platform__' }).catch(() => null)]);
  const can = !!data.can_give;
  const country = countryForTimezone(s.capabilities?.timezone) || 'PS';
  const members = (team?.members || []).filter(m => ['active', 'accepted', 'invited'].includes(m.status));
  const ownerRow = o => `<li><span><b>${esc(o.name || T('noName'))}</b><small dir="ltr">${esc(o.account?.phone || o.phone)}</small>
      <small>${esc(o.account ? T('accountLinked', { name: o.account.name }) : T('accountNotLinked'))}${o.specialist ? ' · ' + esc(T('specialistToo')) : ''}${o.last_seen ? ' · ' + esc(T('lastSeen', { date: fmtDate(o.last_seen) })) : ''}</small></span>
      ${o.disabled ? pill('danger', T('disabled')) : ''}${can ? `<button class="ap-link is-danger" type="button" data-remove="${esc(o.id)}">${esc(T('removeOwner'))}</button>` : ''}</li>`;
  const pendingRow = g => `<li><span><b dir="ltr">${esc(g.phone)}</b><small>${esc(roleText(g.role))}${g.title ? ' · ' + esc(g.title) : ''} · ${esc(T('waitingLine', { by: g.created_by || 'Salonieer', date: fmtDate(g.created_at) }))}</small>
      ${g.last_error ? `<small class="ap-error-inline">${esc(T('accessError', { error: errorText({ message: g.last_error }) }))}</small>` : ''}</span>${pill('warn', T('waitingShort'))}
      ${can ? `<span class="ap-row-actions"><button class="ap-link" type="button" data-retry="${esc(g.id)}">${esc(T('retryAccess'))}</button><button class="ap-link is-danger" type="button" data-cancel="${esc(g.id)}">${esc(T('cancelAccess'))}</button></span>` : ''}</li>`;
  const memberRow = m => `<li><span><b>${esc(m.status === 'invited' ? T('memberInvitedName') : (m.name || '—'))}</b><small>${esc(roleText(m.role))}${m.title ? ' · ' + esc(m.title) : ''}${m.phone && m.status !== 'invited' ? ` · <bdi dir="ltr">${esc(m.phone)}</bdi>` : ''}</small></span>${pill(m.status === 'active' ? 'ok' : 'info', T('member_' + m.status))}</li>`;
  const recentRow = g => `<li><span><b dir="ltr">${esc(g.phone)}</b><small>${esc(roleText(g.role))} · ${esc(g.status !== 'applied' ? T('recentCancelled') : g.account ? T('recentApplied', { name: g.account.name }) : T('recentAppliedSignup'))}</small></span><time>${esc(fmtTime(g.applied_at || g.cancelled_at || g.created_at))}</time></li>`;
  host.innerHTML = `<div class="ap-columns"><div class="ap-stack">
      <section class="ap-panel"><h3>${esc(T('accessOwners'))}</h3><p class="ap-quiet">${esc(T('accessOwnersLead'))}</p>
        ${data.owners.length ? `<ul class="ap-rows">${data.owners.map(ownerRow).join('')}</ul>` : `<p class="ap-quiet">${esc(T('noAdmins'))}</p>`}<p class="ap-error" role="alert"></p></section>
      ${data.pending.length ? `<section class="ap-panel"><h3>${esc(T('waitingTitle'))}</h3><p class="ap-quiet">${esc(T('waitingLead'))}</p><ul class="ap-rows">${data.pending.map(pendingRow).join('')}</ul><p class="ap-error" role="alert"></p></section>` : ''}
      <section class="ap-panel"><h3>${esc(T('teamTitle'))}</h3><p class="ap-quiet">${esc(T('teamLead'))}</p>
        ${members.length ? `<ul class="ap-rows" data-paginate="salon-team">${members.map(memberRow).join('')}</ul>` : `<p class="ap-quiet">${esc(T('noTeam'))}</p>`}</section>
    </div><div class="ap-stack">
      ${can ? `<section class="ap-panel"><h3>${esc(T('giveAccess'))}</h3><p class="ap-quiet">${esc(T('giveAccessLead'))}</p><form id="ap-give" class="ap-form-grid" novalidate>
        ${field(T('dialCode'), `<select name="country">${countryOptions(country, site().lang)}</select>`)}
        ${field(T('phone'), `<input name="phone" dir="ltr" type="tel" inputmode="tel" autocomplete="off" required maxlength="24" placeholder="0599123456">`)}
        ${field(T('accessRole'), `<select name="role">${ACCESS_ROLES.map(([v, k]) => `<option value="${v}">${esc(T(k))}</option>`).join('')}</select>`)}
        ${field(T('jobTitle'), `<input name="title" maxlength="80"><small>${esc(T('jobTitleHint'))}</small>`)}
        <p class="ap-note is-full" id="ap-who" aria-live="polite" hidden></p>
        <div class="ap-actions is-full"><button class="ap-btn is-primary" type="submit">${esc(T('giveAccessBtn'))}</button><p class="ap-error" role="alert"></p></div></form></section>` : ''}
      ${data.recent.length ? `<section class="ap-panel"><h3>${esc(T('recentAccess'))}</h3><ol class="ap-feed">${data.recent.map(recentRow).join('')}</ol></section>` : ''}
    </div></div>`;

  host.querySelectorAll('[data-remove]').forEach(b => b.addEventListener('click', async () => {
    if (!(await confirm(T('removeOwner'), T('removeOwnerConfirm'), { danger: true, confirmLabel: T('removeOwner') }))) return;
    act(b, () => rpc('platform_access_remove_owner', { p_slug: s.slug, p_user: b.dataset.remove }), T('saved')).then(reload).catch(() => {});
  }));
  host.querySelectorAll('[data-cancel]').forEach(b => b.addEventListener('click', async () => {
    if (!(await confirm(T('cancelAccess'), T('cancelAccessConfirm'), { danger: true }))) return;
    act(b, () => rpc('platform_access_cancel', { p_id: b.dataset.cancel }), T('saved')).then(reload).catch(() => {});
  }));
  host.querySelectorAll('[data-retry]').forEach(b => b.addEventListener('click', async () => {
    const r = await act(b, () => rpc('platform_access_retry', { p_id: b.dataset.retry })).catch(() => null);
    if (!r) return;
    if (r.status === 'applied') toast(T('accessApplied', { name: r.account?.name || r.salon_user?.name || '' }));
    else toast(r.error ? T('accessError', { error: errorText({ message: r.error }) }) : T('accessStillWaiting'), r.error ? 'error' : 'success');
    reload();
  }));

  const form = document.getElementById('ap-give');
  if (!form) return;
  const who = document.getElementById('ap-who');
  const titleField = form.elements.title.closest('.ap-field');
  const syncRole = () => { titleField.hidden = form.elements.role.value !== 'other'; };
  syncRole();
  form.elements.role.addEventListener('change', syncRole);
  // Whose number is it? Shown before access is given, so Salonieer can check it is the right person.
  let ask = 0, timer;
  const lookup = async () => {
    const mine = ++ask, n = toE164(form.elements.phone.value, form.elements.country.value);
    if (!n) { who.hidden = !form.elements.phone.value.trim(); who.textContent = form.elements.phone.value.trim() ? T('invalidPhoneIntl') : ''; return; }
    const r = await rpc('platform_access_lookup', { p_slug: s.slug, p_phone: n.e164 }).catch(() => null);
    if (mine !== ask || !r) return;
    const lines = [];
    const accounts = r.accounts || [];
    lines.push(accounts.length > 1 ? T('lookupTwo') : accounts.length ? T('lookupFound', { name: accounts[0].name, date: fmtDate(accounts[0].created_at) }) : r.signup_gets_it ? T('lookupSignupGets') : T('lookupNone'));
    if (r.salon_row) lines.push(T('lookupRow', { name: r.salon_row.name || T('noName'), role: T('rowRole_' + r.salon_row.role), n: num(r.salon_row.bookings) }));
    if (r.member) lines.push(T('lookupMember', { role: roleText(r.member.role), status: T('member_' + r.member.status) }));
    if (r.pending) lines.push(T('lookupPending', { role: roleText(r.pending.role) }));
    who.hidden = false;
    who.innerHTML = `<b dir="ltr">${esc(r.phone)}</b><br>${lines.map(esc).join('<br>')}`;
  };
  const later = () => { clearTimeout(timer); timer = setTimeout(lookup, 350); };
  form.elements.phone.addEventListener('input', later);
  form.elements.country.addEventListener('change', lookup);
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const box = form.querySelector('.ap-error'); box.textContent = '';
    const n = toE164(form.elements.phone.value, form.elements.country.value);
    if (!n) { box.textContent = T('invalidPhoneIntl'); form.elements.phone.focus(); return; }
    const role = form.elements.role.value, title = form.elements.title.value.trim();
    if (role === 'other' && !title) { box.textContent = T('errJobTitle'); form.elements.title.focus(); return; }
    if (!(await confirm(T('giveAccess'), T('giveAccessConfirm', { phone: n.e164, role: roleText(role) })))) return;
    const r = await act(form.querySelector('[type=submit]'), () => rpc('platform_access_give', { p_slug: s.slug, p_phone: n.e164, p_dial: n.dial, p_role: role, p_title: title })).catch(() => null);
    if (!r) return;
    if (r.status === 'applied') toast(r.result?.status === 'already' ? T('accessAlready', { name: r.account?.name || r.salon_user?.name || '' }) : T('accessApplied', { name: r.account?.name || r.salon_user?.name || '' }));
    else toast(T('accessPending', { phone: r.phone || n.e164 }));
    reload();
  });
}

// ---- Notifications ---------------------------------------------------------------------------------------------------
const EVENTS = { customer: ['customer_booking_created', 'customer_booking_rescheduled', 'customer_booking_pending', 'customer_booking_confirmed', 'customer_booking_completed', 'customer_booking_cancelled', 'customer_booking_no_show', 'customer_booking_updated', 'reminder'],
  staff: ['barber_booking_created', 'barber_booking_rescheduled', 'barber_booking_pending', 'barber_booking_confirmed', 'barber_booking_completed', 'barber_booking_cancelled', 'barber_booking_no_show', 'barber_booking_updated', 'barber_booking_removed'],
  salon: ['owner_activity', 'announcements'],
  // Business Suite and Attendance events: shown only when the server reports them.
  business: ['biz_deposit_required', 'biz_deposit_reminder', 'biz_deposit_paid', 'biz_deposit_expired', 'biz_deposit_status', 'biz_deposit_refunded', 'biz_deposit_staff',
    'biz_payment_received', 'biz_payment_failed', 'biz_payment_link', 'biz_refund_issued', 'biz_waitlist_offer', 'biz_low_stock',
    'biz_attendance_in', 'biz_attendance_early', 'biz_attendance_review', 'biz_attendance_request'] };
const LEGACY = { customer_booking_created: 'booking_created', customer_booking_rescheduled: 'rescheduled', reminder: 'reminders', owner_activity: 'owner_activity', announcements: 'announcements' };
async function tabNotifications(host, s) {
  const data = await rpc('salonieer_admin_config_v1', { p_slug: s.slug, p_token: '__platform__' });
  const c = data.settings, sw = c.event_switches || {};
  // Before per-event switches existed the salon had a few broad ones; an event without its own switch follows them.
  const legacy = k => LEGACY[k] ? c[LEGACY[k]] : k.startsWith('customer_') ? c.status_updates : k.startsWith('barber_') ? c.staff_bookings : true;
  const on = k => (k in sw ? sw[k] : legacy(k)) !== false;
  const groups = Object.entries(EVENTS).map(([g, keys]) => [g, g === 'business' ? keys.filter(k => k in sw) : keys]).filter(([, keys]) => keys.length);
  const ops = (data.catalog || []).filter(f => !f.managed), canSet = !!data.can_set_features;
  host.innerHTML = `${ops.length ? `<section class="ap-panel"><h3>${esc(T('opFeatures'))}</h3><p class="ap-quiet">${esc(T('opFeaturesLead'))}</p><form id="ap-ops" class="ap-stack">
      ${ops.map(f => `<label class="ap-toggle"><input type="checkbox" data-op="${esc(f.key)}" ${data.features?.[f.key] ? 'checked' : ''} ${canSet ? '' : 'disabled'}><span>${esc(T('feat_' + f.key))}</span></label>`).join('')}
      ${canSet ? `<div class="ap-actions"><button class="ap-btn" type="submit">${esc(T('saveChanges'))}</button><p class="ap-error" role="alert"></p></div>` : ''}</form></section>` : ''}
    <section class="ap-panel"><form id="ap-notify"><p class="ap-note">${esc(T(data.runtime?.enabled ? 'serviceOn' : 'serviceOff'))}</p>
    <label class="ap-toggle"><input type="checkbox" name="enabled" ${c.enabled ? 'checked' : ''}><span>${esc(T('notifyEnabled'))}</span></label>
    <div class="ap-columns is-three">${groups.map(([group, keys]) => `<fieldset class="ap-fieldset"><legend>${esc(T('group_' + group))}</legend>${keys.map(k => `<label class="ap-toggle"><input type="checkbox" data-event="${k}" ${on(k) ? 'checked' : ''}><span>${esc(T('ev_' + k))}</span></label>`).join('')}</fieldset>`).join('')}</div>
    <div class="ap-form-grid">${field(T('reminders'), `<input name="reminders" dir="ltr" value="${esc((c.reminder_minutes || []).join(', '))}"><small>${esc(T('remindersHint'))}</small>`)}
      ${field(T('delayMinutes'), `<input type="number" name="delay" min="0" max="60" value="${esc(c.event_delay_minutes)}">`)}
      ${field(T('timezone'), `<input name="timezone" dir="ltr" value="${esc(c.timezone)}">`)}
      ${field(T('quietFrom'), `<input type="time" name="quiet_start" value="${esc((c.quiet_start || '').slice(0, 5))}">`)}${field(T('quietTo'), `<input type="time" name="quiet_end" value="${esc((c.quiet_end || '').slice(0, 5))}">`)}</div>
    <div class="ap-actions"><button class="ap-btn is-primary" type="submit">${esc(T('saveChanges'))}</button><p class="ap-error" role="alert"></p></div></form></section>`;
  const opsForm = document.getElementById('ap-ops');
  opsForm?.addEventListener('submit', e => {
    e.preventDefault(); const f = {}; opsForm.querySelectorAll('[data-op]').forEach(x => f[x.dataset.op] = x.checked);
    act(opsForm.querySelector('button'), () => rpc('salonieer_set_features_v1', { p_slug: s.slug, p_features: f }), T('saved')).catch(() => {});
  });
  const form = document.getElementById('ap-notify');
  form.addEventListener('submit', e => {
    e.preventDefault();
    const raw = form.elements.reminders.value.split(/[,،]/).map(x => x.trim()).filter(Boolean);
    const box = form.querySelector('.ap-error');
    if (!raw.length || raw.length > 5 || raw.some(x => !/^\d+$/.test(x) || +x < 5 || +x > 10080)) { box.textContent = T('remindersInvalid'); return; }
    if (!!form.elements.quiet_start.value !== !!form.elements.quiet_end.value) { box.textContent = T('quietBoth'); return; }
    const event_switches = { ...sw }; form.querySelectorAll('[data-event]').forEach(x => event_switches[x.dataset.event] = x.checked);
    const p_data = { enabled: form.elements.enabled.checked, event_switches, reminder_minutes: [...new Set(raw.map(Number))], event_delay_minutes: Number(form.elements.delay.value || 0),
      timezone: form.elements.timezone.value.trim(), quiet_start: form.elements.quiet_start.value || null, quiet_end: form.elements.quiet_end.value || null };
    act(form.querySelector('button'), () => rpc('salonieer_save_notification_settings_v1', { p_slug: s.slug, p_token: '__platform__', p_data }), T('saved')).catch(() => {});
  });
}
