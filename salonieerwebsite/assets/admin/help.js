// Help / FAQ shown inside the Salonieer app (written here, read by the apps live, no app update needed) and the app
// versions used by the apps' update check. Both are stored in Supabase through the website (service role) only.
import { T, esc, view, setTitle, loading, empty, pill, act, confirm, site } from './panel.js';

const LANGS = [['en', 'English'], ['ar', 'العربية'], ['he', 'עברית']];
const CATEGORIES = ['getting_started', 'bookings', 'team', 'services', 'checkout', 'customers', 'marketing', 'settings', 'account', 'general'];
const AUDIENCES = ['admins', 'staff', 'customers', 'everyone'];
const api = (path, opts) => site().api(path, opts);
const dirOf = l => l === 'en' ? 'ltr' : 'rtl';

export async function faqView() {
  setTitle(T('navFaq'), `<button class="ap-btn is-primary" type="button" id="faq-new">${esc(T('faqNew'))}</button>`);
  view().innerHTML = loading();
  const list = (await api('/api/admin/faq')).faq || [];
  draw(list);
}
function draw(list) {
  view().innerHTML = `<p class="ap-quiet ap-lead">${esc(T('faqLead'))}</p>
    ${list.length ? `<ol class="ap-stack ap-faq-list">${list.map((f, i) => card(f, i, list.length)).join('')}</ol>` : empty(T('faqEmpty'), T('faqEmptyText'))}
    <div id="faq-editor"></div>`;
  document.getElementById('faq-new').onclick = () => editor({});
  view().querySelectorAll('[data-faq-edit]').forEach(b => b.onclick = () => editor(list.find(f => f.id === b.dataset.faqEdit)));
  view().querySelectorAll('[data-faq-toggle]').forEach(b => b.onclick = async () => {
    const f = list.find(x => x.id === b.dataset.faqToggle);
    const next = await act(b, () => api('/api/admin/faq', { method: 'POST', body: JSON.stringify({ ...f, is_active: !f.is_active }) }), T('saved')).catch(() => null);
    if (next) draw(next.faq);
  });
  view().querySelectorAll('[data-faq-delete]').forEach(b => b.onclick = async () => {
    if (!(await confirm(T('faqDeleteTitle'), T('faqDeleteBody'), { danger: true }))) return;
    const next = await act(b, () => api('/api/admin/faq/' + b.dataset.faqDelete, { method: 'DELETE', body: '{}' }), T('faqDeleted')).catch(() => null);
    if (next) draw(next.faq);
  });
  view().querySelectorAll('[data-faq-move]').forEach(b => b.onclick = async () => {
    const [id, dir] = b.dataset.faqMove.split(':');
    const ids = list.map(f => f.id), i = ids.indexOf(id), j = i + Number(dir);
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    const next = await act(b, () => api('/api/admin/faq/order', { method: 'POST', body: JSON.stringify({ ids }) })).catch(() => null);
    if (next) draw(next.faq);
  });
}
function card(f, i, n) {
  const kind = f.video_url && (f.answer?.en || f.answer?.ar) ? 'faqTextVideo' : f.video_url ? 'faqVideoOnly' : 'faqTextOnly';
  return `<li class="ap-panel ap-faq"><header class="ap-report-head"><div><h3>${esc(f.question?.[site().lang === 'ar' ? 'ar' : site().lang === 'he' ? 'he' : 'en'] || f.question?.en || '')}</h3>
      <p class="ap-quiet">${esc(T('faqCat_' + f.category))} · ${esc(T('faqAud_' + f.audience))}</p></div>
      <div class="ap-pills">${pill(f.is_active ? 'ok' : 'muted', T(f.is_active ? 'faqActive' : 'faqHidden'))}${pill('info', T(kind))}</div></header>
    <div class="ap-actions"><button class="ap-btn" type="button" data-faq-edit="${esc(f.id)}">${esc(T('edit'))}</button>
      <button class="ap-btn" type="button" data-faq-toggle="${esc(f.id)}">${esc(T(f.is_active ? 'faqHide' : 'faqShow'))}</button>
      <button class="ap-btn" type="button" data-faq-move="${esc(f.id)}:-1" ${i === 0 ? 'disabled' : ''} aria-label="${esc(T('faqUp'))}">↑</button>
      <button class="ap-btn" type="button" data-faq-move="${esc(f.id)}:1" ${i === n - 1 ? 'disabled' : ''} aria-label="${esc(T('faqDown'))}">↓</button>
      <button class="ap-btn is-danger" type="button" data-faq-delete="${esc(f.id)}">${esc(T('delete'))}</button><p class="ap-error" role="alert"></p></div></li>`;
}
function editor(f) {
  const host = document.getElementById('faq-editor');
  host.innerHTML = `<form class="ap-panel ap-faq-form" id="faq-form" novalidate><h3>${esc(T(f.id ? 'faqEdit' : 'faqNew'))}</h3>
    <div class="ap-grid2"><label class="ap-field"><span>${esc(T('faqCategory'))}</span><select name="category">${CATEGORIES.map(c => `<option value="${c}"${c === (f.category || 'general') ? ' selected' : ''}>${esc(T('faqCat_' + c))}</option>`).join('')}</select></label>
      <label class="ap-field"><span>${esc(T('faqAudience'))}</span><select name="audience">${AUDIENCES.map(a => `<option value="${a}"${a === (f.audience || 'admins') ? ' selected' : ''}>${esc(T('faqAud_' + a))}</option>`).join('')}</select></label></div>
    ${LANGS.map(([l, name]) => `<fieldset class="ap-fieldset"><legend>${name}</legend>
      <label class="ap-field"><span>${esc(T('faqQuestion'))}</span><input name="q_${l}" dir="${dirOf(l)}" maxlength="400" value="${esc(f.question?.[l] || '')}" required></label>
      <label class="ap-field"><span>${esc(T('faqAnswer'))} <small>${esc(T('faqAnswerHint'))}</small></span><textarea name="a_${l}" dir="${dirOf(l)}" rows="4" maxlength="4000">${esc(f.answer?.[l] || '')}</textarea></label></fieldset>`).join('')}
    <label class="ap-field"><span>${esc(T('faqVideo'))} <small>${esc(T('faqVideoHint'))}</small></span><input name="video_url" dir="ltr" inputmode="url" placeholder="https://www.youtube.com/watch?v=…" value="${esc(f.video_url || '')}"></label>
    <label class="ap-check"><input type="checkbox" name="is_active"${f.is_active === false ? '' : ' checked'}> <span>${esc(T('faqShowInApp'))}</span></label>
    <div class="ap-actions"><button class="ap-btn is-primary" type="submit">${esc(T('saveChanges'))}</button><button class="ap-btn" type="button" id="faq-cancel">${esc(T('cancel'))}</button><p class="ap-error" role="alert"></p></div></form>`;
  const form = document.getElementById('faq-form');
  form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  document.getElementById('faq-cancel').onclick = () => { host.innerHTML = ''; };
  form.onsubmit = async e => {
    e.preventDefault();
    const v = n => form.elements[n].value.trim();
    const data = { id: f.id || null, category: v('category'), audience: v('audience'), video_url: v('video_url'), is_active: form.elements.is_active.checked,
      question: Object.fromEntries(LANGS.map(([l]) => [l, v('q_' + l)])), answer: Object.fromEntries(LANGS.map(([l]) => [l, v('a_' + l)])) };
    const next = await act(e.submitter, () => api('/api/admin/faq', { method: 'POST', body: JSON.stringify(data) }), T('saved')).catch(() => null);
    if (next) draw(next.faq);
  };
}

// ---- App versions (update check) -------------------------------------------------------------------------------------
export async function appVersionsView() {
  setTitle(T('navAppVersions'));
  view().innerHTML = loading();
  const releases = (await api('/api/admin/app-versions')).releases || [];
  view().innerHTML = `<p class="ap-quiet ap-lead">${esc(T('versionsLead'))}</p><div class="ap-stack">${releases.map(r => `<form class="ap-panel" data-platform="${esc(r.platform)}" novalidate>
      <h3>${esc(r.platform === 'ios' ? 'iOS · App Store' : 'Android · Google Play')}</h3>
      <div class="ap-grid2"><label class="ap-field"><span>${esc(T('latestVersion'))} <small>${esc(T('latestVersionHint'))}</small></span><input name="latest_version" dir="ltr" inputmode="decimal" placeholder="2.8.0" value="${esc(r.latest_version || '')}"></label>
        <label class="ap-field"><span>${esc(T('minVersion'))} <small>${esc(T('minVersionHint'))}</small></span><input name="min_version" dir="ltr" inputmode="decimal" placeholder="2.7.0" value="${esc(r.min_version || '')}"></label></div>
      <label class="ap-field"><span>${esc(T('storeUrl'))}</span><input name="store_url" dir="ltr" value="${esc(r.store_url || '')}"></label>
      ${LANGS.map(([l, name]) => `<label class="ap-field"><span>${esc(T('updateMessage'))} · ${name} <small>${esc(T('optional'))}</small></span><input name="m_${l}" dir="${dirOf(l)}" maxlength="300" value="${esc(r.message?.[l] || '')}"></label>`).join('')}
      <div class="ap-actions"><button class="ap-btn is-primary" type="submit">${esc(T('saveChanges'))}</button><p class="ap-error" role="alert"></p></div></form>`).join('')}</div>`;
  view().querySelectorAll('form[data-platform]').forEach(form => form.onsubmit = async e => {
    e.preventDefault();
    const v = n => form.elements[n].value.trim();
    if (v('min_version') && !(await confirm(T('forceUpdateTitle'), T('forceUpdateBody', { v: v('min_version') }), { danger: true }))) return;
    await act(e.submitter, () => api('/api/admin/app-versions/' + form.dataset.platform, { method: 'PUT', body: JSON.stringify({
      latest_version: v('latest_version'), min_version: v('min_version'), store_url: v('store_url'), message: Object.fromEntries(LANGS.map(([l]) => [l, v('m_' + l)])) }) }), T('saved')).catch(() => {});
  });
}
