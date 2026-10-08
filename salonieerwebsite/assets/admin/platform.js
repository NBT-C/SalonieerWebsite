// Platform-wide pages: plans and add-ons, the team, the activity log and the notification service.
import { T, esc, rpc, view, setTitle, loading, empty, pill, act, params, fmtTime, isOwner, site, actionLabel, salonColor } from './panel.js';

const field = (label, input, cls = '') => `<label class="ap-field ${cls}"><span>${esc(label)}</span>${input}</label>`;
const local = (ar, en) => site().lang === 'ar' ? ar : en || ar;

// ---- Plans, add-on catalog, feature registry -------------------------------------------------------------------------
export async function plansView() {
  setTitle(T('navPlans'));
  view().innerHTML = loading();
  const cat = await rpc('platform_subscription_catalog');
  const can = !!cat.can_edit, dis = can ? '' : 'disabled';
  view().innerHTML = `${can ? '' : `<p class="ap-note">${esc(T('readOnlyManager'))}</p>`}<p class="ap-quiet ap-lede">${esc(T('plansLead'))}</p>
    <div class="ap-plan-grid">${cat.plans.filter(p => p.code !== 'enterprise').map(p => `<form class="ap-plan" data-plan="${esc(p.code)}">
      <header><h3>${esc(p.code === 'full_access' ? 'Enterprise' : local(p.name_ar, p.name_en))}</h3>${pill(p.is_active ? 'ok' : 'muted', T(p.is_active ? 'available' : 'hidden'))}</header>
      <div class="ap-form-grid">${field(T('nameEn'), `<input name="name_en" dir="ltr" maxlength="60" required value="${esc(p.name_en)}" ${dis}>`)}${field(T('nameAr'), `<input name="name_ar" dir="rtl" maxlength="60" required value="${esc(p.name_ar)}" ${dis}>`)}
      ${field(T('includedSpecialists'), `<input type="number" name="included_specialists" min="0" value="${Number(p.included_specialists) || 0}" ${dis}>`)}
      <label class="ap-check"><input type="checkbox" name="unlimited_specialists" ${p.unlimited_specialists ? 'checked' : ''} ${dis}>${esc(T('unlimitedSpecialists'))}</label>
      <label class="ap-check is-full"><input type="checkbox" name="includes_all_features" ${p.includes_all_features ? 'checked' : ''} ${dis}>${esc(T('allFeatures'))}</label>
      <fieldset class="ap-fieldset is-full"><legend>${esc(T('features'))}</legend>${cat.features.map(f => `<label class="ap-check"><input type="checkbox" data-feature="${esc(f.key)}" ${p.features?.[f.key] ? 'checked' : ''} ${dis}>${esc(local(f.label, f.label_en))}</label>`).join('')}</fieldset>
      <label class="ap-check is-full"><input type="checkbox" name="is_active" ${p.is_active ? 'checked' : ''} ${dis}>${esc(T('offerPlan'))}</label></div>
      ${can ? `<div class="ap-actions"><button class="ap-btn" type="submit">${esc(T('saveChanges'))}</button><p class="ap-error" role="alert"></p></div>` : ''}</form>`).join('')}</div>
    <div class="ap-columns">
    <section class="ap-panel"><h3>${esc(T('addonCatalog'))}</h3><ul class="ap-rows" data-paginate="addon-catalog">${cat.addons.map(a => `<li><span><b>${esc(local(a.name_ar, a.name_en))}</b><small>${esc(a.kind === 'seats' ? T('kindSeats') : T('kindFeature', { feature: a.feature_key }))}</small></span>${pill(a.is_active ? 'ok' : 'muted', T(a.is_active ? 'available' : 'hidden'))}${can ? `<button class="ap-link" type="button" data-toggle-addon="${esc(a.code)}" data-active="${a.is_active ? 1 : 0}">${esc(T(a.is_active ? 'hide' : 'offer'))}</button>` : ''}</li>`).join('')}</ul>
      ${can ? `<form id="ap-new-addon" class="ap-form-grid"><h4 class="is-full">${esc(T('newAddon'))}</h4>${field(T('code'), `<input name="code" dir="ltr" required pattern="[a-z][a-z0-9_]{1,31}">`)}
        ${field(T('kind'), `<select name="kind"><option value="feature">${esc(T('kindFeatureShort'))}</option><option value="seats">${esc(T('kindSeats'))}</option></select>`)}
        ${field(T('feature'), `<select name="feature_key">${cat.features.map(f => `<option value="${esc(f.key)}">${esc(local(f.label, f.label_en))}</option>`).join('')}</select>`)}
        ${field(T('nameEn'), `<input name="name_en" dir="ltr" required maxlength="60">`)}${field(T('nameAr'), `<input name="name_ar" dir="rtl" required maxlength="60">`)}
        <div class="ap-actions is-full"><button class="ap-btn" type="submit">${esc(T('addToCatalog'))}</button><p class="ap-error" role="alert"></p></div></form>` : ''}</section>
    <section class="ap-panel"><h3>${esc(T('newPlan'))}</h3>${can ? `<form id="ap-new-plan" class="ap-form-grid">${field(T('code'), `<input name="code" dir="ltr" required pattern="[a-z][a-z0-9_]{1,31}" placeholder="premium">`)}
        ${field(T('includedSpecialists'), `<input type="number" name="included_specialists" min="0" value="1">`)}${field(T('nameEn'), `<input name="name_en" dir="ltr" required maxlength="60">`)}${field(T('nameAr'), `<input name="name_ar" dir="rtl" required maxlength="60">`)}
        <div class="ap-actions is-full"><button class="ap-btn is-primary" type="submit">${esc(T('createPlan'))}</button><p class="ap-error" role="alert"></p></div></form>` : `<p class="ap-quiet">${esc(T('readOnlyManager'))}</p>`}</section></div>`;
  if (!can) return;
  view().querySelectorAll('[data-plan]').forEach(form => form.addEventListener('submit', e => {
    e.preventDefault(); if (!form.reportValidity()) return;
    const g = n => form.elements[n], features = {};
    form.querySelectorAll('[data-feature]').forEach(x => features[x.dataset.feature] = x.checked);
    act(form.querySelector('button'), () => rpc('platform_plan_save', { p_data: { code: form.dataset.plan, name_en: g('name_en').value, name_ar: g('name_ar').value, included_specialists: g('included_specialists').value,
      unlimited_specialists: g('unlimited_specialists').checked, includes_all_features: g('includes_all_features').checked, is_active: g('is_active').checked, features } }), T('saved')).then(plansView).catch(() => {});
  }));
  view().querySelectorAll('[data-toggle-addon]').forEach(b => b.addEventListener('click', () =>
    act(b, () => rpc('platform_addon_catalog_save', { p_data: { code: b.dataset.toggleAddon, is_active: b.dataset.active !== '1' } }), T('saved')).then(plansView).catch(() => {})));
  const na = document.getElementById('ap-new-addon');
  na.addEventListener('submit', e => { e.preventDefault(); if (!na.reportValidity()) return; const d = Object.fromEntries(new FormData(na)); if (d.kind !== 'feature') d.feature_key = null; d.is_active = true;
    act(na.querySelector('button'), () => rpc('platform_addon_catalog_save', { p_data: d }), T('saved')).then(plansView).catch(() => {}); });
  const np = document.getElementById('ap-new-plan');
  np.addEventListener('submit', e => { e.preventDefault(); if (!np.reportValidity()) return;
    act(np.querySelector('button'), () => rpc('platform_plan_save', { p_data: { ...Object.fromEntries(new FormData(np)), is_active: true } }), T('saved')).then(plansView).catch(() => {}); });
}

// ---- Team (owner only) ---------------------------------------------------------------------------------------------
export async function teamView() {
  setTitle(T('navTeam'));
  if (!isOwner()) { view().innerHTML = empty(T('errOwnerOnly')); return; }
  view().innerHTML = loading();
  const [members, salons] = await Promise.all([rpc('platform_team_list'), rpc('platform_list_salons')]);
  view().innerHTML = `<div class="ap-columns is-detail"><section class="ap-panel"><h3>${esc(T('teamMembers'))}</h3>
      <ul class="ap-rows" data-paginate="team">${members.map(m => `<li><span><b dir="ltr">${esc(m.email)}</b><small>${esc((m.salons || []).join(', ') || (m.role === 'owner' ? T('allSalons') : T('noSalonsAssigned')))}</small></span>${pill(m.role === 'owner' ? 'info' : m.role === 'manager' ? 'ok' : 'muted', T('role_' + m.role))}<button class="ap-link" type="button" data-edit="${esc(m.email)}">${esc(T('edit'))}</button></li>`).join('')}</ul></section>
    <section class="ap-panel"><h3>${esc(T('setAccess'))}</h3><p class="ap-quiet">${esc(T('teamHint'))}</p><form id="ap-team" class="ap-stack">
      ${field(T('email'), `<input type="email" name="email" dir="ltr" required>`)}
      ${field(T('role'), `<select name="role"><option value="manager">${esc(T('role_manager'))}</option><option value="owner">${esc(T('role_owner'))}</option><option value="disabled">${esc(T('role_disabled'))}</option></select>`)}
      <fieldset class="ap-fieldset" id="ap-team-salons"><legend>${esc(T('managesSalons'))}</legend><div class="ap-check-grid">${salons.map(s => `<label class="ap-check"><input type="checkbox" name="salon" value="${esc(s.slug)}"><i class="ap-dot" style="--salon:${esc(salonColor(s))}"></i>${esc(s.name)}</label>`).join('')}</div></fieldset>
      <div class="ap-actions"><button class="ap-btn is-primary" type="submit">${esc(T('saveAccess'))}</button><p class="ap-error" role="alert"></p></div></form></section></div>`;
  const form = document.getElementById('ap-team');
  const sync = () => { document.getElementById('ap-team-salons').hidden = form.elements.role.value !== 'manager'; };
  form.elements.role.addEventListener('change', sync); sync();
  view().querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => {
    const m = members.find(x => x.email === b.dataset.edit); form.elements.email.value = m.email; form.elements.role.value = m.role;
    form.querySelectorAll('[name=salon]').forEach(c => c.checked = (m.salons || []).includes(c.value)); sync(); form.elements.email.focus();
  }));
  form.addEventListener('submit', e => { e.preventDefault(); if (!form.reportValidity()) return;
    act(form.querySelector('button'), () => rpc('platform_team_set', { p_email: form.elements.email.value.trim(), p_role: form.elements.role.value, p_salons: [...form.querySelectorAll('[name=salon]:checked')].map(c => c.value) }), T('saved')).then(teamView).catch(() => {}); });
}

// ---- Activity log -----------------------------------------------------------------------------------------------------
export async function activityView() {
  setTitle(T('navActivity'));
  const offset = Math.max(0, Number(params().get('offset')) || 0);
  view().innerHTML = loading();
  const rows = await rpc('platform_audit_list', { p_offset: offset });
  let q = '';
  view().innerHTML = `<div class="ap-toolbar"><label class="ap-search"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M11 18a7 7 0 100-14 7 7 0 000 14zM21 21l-4.3-4.3"/></svg><input type="search" id="ap-q" placeholder="${esc(T('searchActivity'))}"></label></div>
    <div class="ap-table-wrap"><table class="ap-table"><thead><tr><th>${esc(T('when'))}</th><th>${esc(T('salon'))}</th><th>${esc(T('action'))}</th><th>${esc(T('by'))}</th></tr></thead><tbody id="ap-rows" data-paginate="activity"></tbody></table></div>
    <nav class="ap-pager">${offset ? `<a class="ap-btn is-quiet" href="/admin/activity?offset=${Math.max(0, offset - 50)}">${esc(T('newer'))}</a>` : '<span></span>'}${rows.length === 50 ? `<a class="ap-btn is-quiet" href="/admin/activity?offset=${offset + 50}">${esc(T('older'))}</a>` : ''}</nav>`;
  const draw = () => {
    const list = rows.filter(r => !q || [r.salon_slug, r.action, r.actor_email].join(' ').toLowerCase().includes(q));
    document.getElementById('ap-rows').innerHTML = list.length ? list.map(r => `<tr><td data-label="${esc(T('when'))}">${esc(fmtTime(r.created_at))}</td><td data-label="${esc(T('salon'))}">${r.salon_slug ? `<a href="/admin/salons/${esc(r.salon_slug)}" dir="ltr">${esc(r.salon_slug)}</a>` : esc(T('platformWide'))}</td><td data-label="${esc(T('action'))}">${esc(actionLabel(r.action))}</td><td data-label="${esc(T('by'))}" dir="ltr">${esc(r.actor_email || T('system'))}</td></tr>`).join('') : `<tr><td colspan="4">${empty(T('noActivity'))}</td></tr>`;
  };
  draw();
  document.getElementById('ap-q').addEventListener('input', e => { q = e.target.value.trim().toLowerCase(); draw(); });
}

// ---- Notification service (owner) ----------------------------------------------------------------------------------------
export async function serviceView() {
  setTitle(T('navService'));
  if (!isOwner()) { view().innerHTML = empty(T('errOwnerOnly')); return; }
  view().innerHTML = loading();
  const r = await rpc('salonieer_runtime_v1', {});
  const at = r.last_worker_at ? new Date(r.last_worker_at) : null, fresh = at && Date.now() - at.getTime() < 3 * 60000;
  const provider = (k, label) => `<li><span><b>${label}</b><small>${esc(T(!at ? 'waitingFirstCheck' : r.providers?.[k] ? 'configured' : 'notConfigured'))}</small></span>${pill(!at ? 'muted' : r.providers?.[k] ? 'ok' : 'danger', T(!at ? 'unknown' : r.providers?.[k] ? 'ready' : 'missing'))}</li>`;
  view().innerHTML = `<div class="ap-columns"><section class="ap-panel"><h3>${esc(T('pushService'))}</h3><p class="ap-quiet">${esc(T('pushLead'))}</p>
      <label class="ap-toggle"><input type="checkbox" id="ap-runtime" ${r.enabled ? 'checked' : ''}><span>${esc(T('pushEnabled'))}</span></label>
      <div class="ap-actions"><button class="ap-btn is-primary" type="button" id="ap-runtime-save">${esc(T('saveChanges'))}</button><p class="ap-error" role="alert"></p></div></section>
    <section class="ap-panel"><h3>${esc(T('worker'))}</h3><p>${pill(fresh ? 'ok' : at ? 'danger' : 'muted', T(fresh ? 'workerOk' : at ? 'workerLate' : 'workerNever'))}</p>
      <p class="ap-quiet">${at ? esc(T('lastCheck', { time: fmtTime(at) })) : esc(T('workerHelp'))}</p><ul class="ap-rows">${provider('fcm', 'Android · FCM')}${provider('apns', 'iPhone · APNs')}</ul></section></div>`;
  document.getElementById('ap-runtime-save').addEventListener('click', e =>
    act(e.currentTarget, () => rpc('salonieer_runtime_v1', { p_enabled: document.getElementById('ap-runtime').checked }), T('saved')).then(serviceView).catch(() => {}));
}
