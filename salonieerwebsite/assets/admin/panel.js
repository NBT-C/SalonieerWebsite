// Salonieer admin panel (/admin/*): one workspace for every salon. Platform data comes from Supabase with the
// signed-in platform account (sb.js); plan applications come from this website's API. The panel draws itself into
// #app and owns its routes under /admin; app.js only decides that the route is the panel's.
import * as sb from './sb.js';
import { at, hasKey } from './i18n.js';
import { salonsView, salonView, newSalonView } from './salons.js';
import { plansView, teamView, activityView, serviceView } from './platform.js';
import { financeView, requestsView, discountsView } from './finance.js';
import { billingView } from './billing.js';
import { reportsView, cleanupView, reviewBadge, reviewPanel } from './ops.js';
import { faqView, appVersionsView } from './help.js';
import { paymentsView } from './payments.js';
import { accountsView } from './accounts.js';
import { loadPhone, toE164, splitE164, countryOptions, countryForTimezone, DIAL_COUNTRIES } from './phone-input.js';

export const isAdminRoute = route => route === '/admin' || route.startsWith('/admin/');
let ctx = null, me = null, mountToken = 0;

// ---- Shared helpers (also used by salons.js and platform.js) ---------------------------------------------------------
export const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const T = (k, v) => at(k, ctx.lang, v);
export const fmtDate = v => { if (!v) return ''; try { return new Intl.DateTimeFormat(ctx.lang, { dateStyle: 'medium' }).format(new Date(v)); } catch { return String(v); } };
export const fmtTime = v => { if (!v) return ''; try { return new Intl.DateTimeFormat(ctx.lang, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(v)); } catch { return String(v); } };
export const num = v => Number(v || 0).toLocaleString(ctx.lang === 'ar' ? 'ar' : 'en');
export const role = () => me?.role;
export const isOwner = () => me?.role === 'owner';
export const view = () => document.getElementById('ap-view');
export const rpc = (fn, args) => sb.rpc(fn, args);
export const site = () => ctx;
export function salonColor(s) { const c = s?.capabilities?.primary_color; return /^#[0-9a-f]{6}$/i.test(c || '') ? c : '#1a88a4'; }
export function salonMark(s, size = 44) {
  const name = s?.name || s?.salonName || '?';
  return s?.logo_url || s?.logoUrl
    ? `<span class="ap-mark" data-name="${esc(name)}" style="--mark:${size}px;--salon:${esc(salonColor(s))}"><img src="${esc(s.logo_url || s.logoUrl)}" alt="" loading="lazy"></span>`
    : `<span class="ap-mark is-letter" style="--mark:${size}px;--salon:${esc(salonColor(s))}">${esc(name.trim().charAt(0).toUpperCase())}</span>`;
}
// Database messages are Arabic; known ones are translated, anything else is shown as sent.
export function errorText(e) {
  const m = String(e?.message || '');
  const known = [[/غير مصرح|42501|permission/i, 'errForbidden'], [/مالك المنصة/, 'errOwnerOnly'], [/هذا المعرف مستخدم/, 'errSlugTaken'], [/المعرف:/, 'errSlugFormat'],
    [/رمز الصالون مستخدم/, 'errCodeTaken'], [/رمز الصالون غير صحيح/, 'errCodeFormat'], [/المنطقة الزمنية/, 'errTimezone'], [/اكتب رمز الصالون بالضبط/, 'errDeleteConfirm'],
    [/حد المختصين|المختصين النشطين|active Specialists/i, 'errSeatLimit'], [/رقم الهاتف مسجل/, 'errPhoneUsed'], [/رقم هاتف غير صحيح/, 'errPhone'], [/payment_required/, 'paymentRequired'],
    [/already_approved/, 'alreadyApproved'], [/message_required/, 'messageRequired'], [/أضف المستخدم/, 'errTeamUser'],
    // 2.40: access by phone number
    [/الحد الأقصى لعدد المختصين/, 'errSeatLimit'], [/رقم هاتف صحيحاً مع رمز الدولة|invalid_phone/, 'errAccessPhone'], [/المسمى الوظيفي/, 'errJobTitle'],
    [/هذا الحساب مالك للصالون/, 'errAccessOwner'], [/عضو في فريق الصالون بالفعل/, 'errAccessMember'], [/ملف مختص قديم/, 'errAccessLegacy'],
    [/حسابان في Salonieer/, 'errAccessTwo'], [/المالك الأخير/, 'errLastOwner'], [/لا يوجد وصول بانتظار/, 'errAccessGone'],
    // 2.40.1: account help
    [/سبب إعادة التعيين/, 'errResetReason'], [/الحساب غير موجود/, 'errAccountMissing'], [/هذا الحساب موقوف/, 'accountDisabled'],
    [/مرتبط بحساب Salonieer: غيّر كلمة مرور الحساب/, 'errSignupLinked']];
  const extra = e?.detail ? ` (${e.detail})` : '';
  for (const [re, key] of known) if (re.test(m)) return T(key) + extra;
  if (e?.code && hasKey(e.code)) return T(e.code) + extra;
  if (e?.code && ctx.t(e.code) !== e.code) return ctx.t(e.code) + extra;
  return (m || T('errGeneric')) + extra;
}
export function toast(msg, tone = 'success') { ctx.toast(msg, tone); }
export async function confirm(title, body, { danger = false, confirmLabel } = {}) {
  return ctx.confirmDialog({ title, body, confirm: confirmLabel || T('confirm'), cancel: T('cancel'), tone: danger ? 'danger' : '' });
}
// Runs a button's action with a busy state; reports errors next to it (or as a toast) and returns the result.
export async function act(button, fn, done) {
  const box = button?.closest('form,.ap-actions,section')?.querySelector('.ap-error');
  if (box) box.textContent = '';
  if (button) ctx.setBusy(button, true, T('working'));
  try { const r = await fn(); if (done) toast(done); return r; }
  catch (e) { if (e?.code === 'platformSignIn') { mount(); return; } const msg = errorText(e); if (box) box.textContent = msg; else toast(msg, 'error'); throw e; }
  finally { if (button?.isConnected) ctx.setBusy(button, false); }
}
export const loading = () => `<div class="ap-loading" role="status"><span class="ap-spinner" aria-hidden="true"></span>${esc(T('loading'))}</div>`;
export const empty = (title, text = '', action = '') => `<div class="ap-empty"><h3>${esc(title)}</h3>${text ? `<p>${esc(text)}</p>` : ''}${action}</div>`;
export function setTitle(title, actions = '') {
  document.getElementById('ap-title').textContent = title;
  document.getElementById('ap-top-actions').innerHTML = actions;
  document.title = 'Salonieer · ' + title;
}
export const PAY = { unpaid: 'warn', paid: 'ok', test_paid: 'info', refunded: 'muted' };
export const STATUS = { pending: 'warn', in_review: 'info', needs_info: 'warn', approved: 'ok', declined: 'danger' };
export const pill = (tone, text) => `<span class="ap-pill is-${tone}">${esc(text)}</span>`;
export function go(path) { ctx.go(path); }
export const params = () => new URLSearchParams(location.search);
export const segments = () => location.pathname.replace(/^\/admin\/?/, '').split('/').filter(Boolean);
// Loads the app's QR encoder once (shared with the account page).
export const qrSvg = text => window.SalonQR ? window.SalonQR.svg(text) : '';

// ---- Shell ---------------------------------------------------------------------------------------------------------
const NAV = [
  ['', 'navOverview', 'M3 12l9-8 9 8M5 10v10h14V10'],
  ['applications', 'navApplications', 'M4 4h16v16H4zM8 9h8M8 13h8M8 17h5'],
  ['salons', 'navSalons', 'M4 20V9l8-5 8 5v11M9 20v-6h6v6'],
['accounts', 'navAccounts', 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21c0-3.3 3.6-6 8-6s8 2.7 8 6', true],
  ['finance', 'navFinance', 'M4 19h16M7 16V10M12 16V6M17 16v-4', true],
  ['billing', 'navBilling', 'M3 7h18v10H3zM3 11h18M7 15h3', true],
  ['requests', 'navRequests', 'M4 7h12l-3-3M20 17H8l3 3', true],
  ['discounts', 'navDiscounts', 'M20 12l-8 8-8-8V4h8zM8.5 8.5h.01', true],
  ['reports', 'navReports', 'M5 21V4h11l-1.5 4L16 12H5'],
  ['cleanup', 'navCleanup', 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3', true],
  ['faq', 'navFaq', 'M12 21a9 9 0 110-18 9 9 0 010 18zM9.5 9a2.5 2.5 0 015 .5c0 1.5-2.5 2-2.5 3.5M12 17h.01'],
  ['app-versions', 'navAppVersions', 'M7 3h10v18H7zM11 18h2', true],
  ['payments', 'navPayments', 'M3 6h18v12H3zM3 10h18M7 15h4'],
  ['plans', 'navPlans', 'M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.4 6.8 19.1l1-5.8L3.5 9.2l5.9-.9z'],
  ['team', 'navTeam', 'M16 14a4 4 0 10-8 0M12 11a3 3 0 100-6 3 3 0 000 6zM3 20c0-2.2 2.7-4 6-4M21 20c0-2.2-2.7-4-6-4', true],
  ['activity', 'navActivity', 'M12 7v5l3 2M12 21a9 9 0 110-18 9 9 0 010 18z'],
  ['service', 'navService', 'M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 01-3.4 0', true],
];
const icon = d => `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;

export function adminShell(c) {
  ctx = c;
  return `<div class="ap" id="ap"><aside class="ap-spine" id="ap-spine" aria-label="${esc(T('panelNav'))}">
    <a class="ap-brand" href="/admin"><img src="/assets/brand/Salonieer_symbol_for_dark.svg" alt="" width="34" height="36"><span><b>Salonieer</b><small>${esc(T('panelName'))}</small></span></a>
    <nav class="ap-nav" id="ap-nav"></nav>
    <div class="ap-spine-foot"><a class="ap-nav-item" href="/">${icon('M10 17l-5-5 5-5M5 12h14')}<span>${esc(T('backToSite'))}</span></a>
      <div class="ap-account" id="ap-account"></div></div></aside>
    <div class="ap-scrim" id="ap-scrim" hidden></div>
    <div class="ap-main"><header class="ap-top"><button class="ap-menu" id="ap-menu" aria-controls="ap-spine" aria-expanded="false" aria-label="${esc(T('menu'))}">${icon('M4 7h16M4 12h16M4 17h16')}</button>
      <h1 class="ap-title" id="ap-title">${esc(T('navOverview'))}</h1><div class="ap-top-actions" id="ap-top-actions"></div>
      <select class="ap-lang" id="ap-lang" aria-label="${esc(c.t('language'))}">${[['en', 'EN'], ['ar', 'العربية'], ['he', 'עברית']].map(([v, l]) => `<option value="${v}"${c.lang === v ? ' selected' : ''}>${l}</option>`).join('')}</select></header>
      <main id="main" class="ap-view" tabindex="-1"><div id="ap-view">${loading()}</div></main></div></div>`;
}

function drawNav() {
  const here = segments()[0] || '';
  document.getElementById('ap-nav').innerHTML = NAV.filter(n => !n[3] || isOwner()).map(([path, key, d]) =>
    `<a class="ap-nav-item${here === path ? ' is-current' : ''}" href="/admin${path ? '/' + path : ''}"${here === path ? ' aria-current="page"' : ''}>${icon(d)}<span>${esc(T(key))}</span>${path === 'applications' ? '<i class="ap-count" id="ap-app-count" hidden></i>' : path === 'requests' ? '<i class="ap-count" id="ap-req-count" hidden></i>' : path === 'reports' ? '<i class="ap-count" id="ap-rep-count" hidden></i>' : ''}</a>`).join('');
  document.getElementById('ap-account').innerHTML = me ? `<span class="ap-account-who"><b>${esc(sb.sessionEmail())}</b><small>${esc(T(me.role === 'owner' ? 'roleOwner' : 'roleManager'))}</small></span><button class="ap-signout" id="ap-signout" type="button">${esc(T('signOutPlatform'))}</button>` : '';
  document.getElementById('ap-signout')?.addEventListener('click', async () => { await sb.signOut(); me = null; mount(); });
}

export async function bindAdmin(c) {
  ctx = c;
  if (!document.getElementById('admin-css')) document.head.insertAdjacentHTML('beforeend', `<link id="admin-css" rel="stylesheet" href="/assets/admin/admin.css?v=${c.assetVersion || 1}">`);
  const spine = document.getElementById('ap-spine'), scrim = document.getElementById('ap-scrim'), menu = document.getElementById('ap-menu');
  const toggle = open => { spine.classList.toggle('is-open', open); scrim.hidden = !open; menu.setAttribute('aria-expanded', String(open)); };
  menu.addEventListener('click', () => toggle(!spine.classList.contains('is-open')));
  scrim.addEventListener('click', () => toggle(false));
  spine.addEventListener('click', e => { if (e.target.closest('a')) toggle(false); });
  document.getElementById('ap-lang').addEventListener('change', e => c.setLanguage(e.target.value));
  // A logo that can't load turns into the salon's initial (inline onerror handlers are blocked by the site's CSP).
  document.getElementById('ap').addEventListener('error', e => {
    const img = e.target; if (!(img instanceof HTMLImageElement) || !img.parentElement?.classList.contains('ap-mark')) return;
    const mark = img.parentElement, name = mark.dataset.name || '?';
    mark.classList.add('is-letter'); mark.textContent = name.trim().charAt(0).toUpperCase();
  }, true);
  await mount();
}

async function mount() {
  const token = ++mountToken;
  sb.configure(ctx.state.platform);
  const recovery = sb.consumeRecovery();
  drawNav();
  if (!sb.signedIn()) return signInView();
  if (recovery) return newPasswordView();
  try { me = await sb.rpc('platform_me'); }
  catch (e) { if (e.code === 'platformSignIn') return signInView(); view().innerHTML = empty(T('errLoad'), errorText(e)); return; }
  if (token !== mountToken) return;
  if (!me || !['owner', 'manager'].includes(me.role)) { await sb.signOut(); me = null; return signInView(T('errNotStaff')); }
  drawNav();
  countApplications();
  if (isOwner()) countRequests();
  countReports();
  const [first, second] = segments();
  try {
    if (!first) await overview();
    else if (first === 'applications') await (second ? applicationView(second) : applicationsView());
    else if (first === 'salons') await (second === 'new' ? newSalonView() : second ? salonView(second) : salonsView());
    else if (first === 'accounts') await accountsView();
    else if (first === 'plans') await plansView();
    else if (first === 'payments') await paymentsView();
    else if (first === 'finance') await financeView();
    else if (first === 'billing') await billingView();
    else if (first === 'requests') await requestsView();
    else if (first === 'discounts') await discountsView();
    else if (first === 'reports') await reportsView();
    else if (first === 'cleanup') await cleanupView();
    else if (first === 'faq') await faqView();
    else if (first === 'app-versions') await appVersionsView();
    else if (first === 'team') await teamView();
    else if (first === 'activity') await activityView();
    else if (first === 'service') await serviceView();
    else { setTitle(T('notFound')); view().innerHTML = empty(T('notFound'), '', `<a class="ap-btn" href="/admin">${esc(T('navOverview'))}</a>`); }
  } catch (e) {
    if (e?.code === 'platformSignIn') return signInView();
    view().innerHTML = empty(T('errLoad'), errorText(e), `<button class="ap-btn" type="button" id="ap-retry">${esc(T('retry'))}</button>`);
    document.getElementById('ap-retry')?.addEventListener('click', mount);
  }
}
// Re-draws the current panel page (after an action, or when the tab comes back).
export const refresh = () => mount();

// ---- Platform sign-in --------------------------------------------------------------------------------------------
function signInView(message = '') {
  setTitle(T('signInTitle'));
  view().innerHTML = `<section class="ap-signin"><div class="ap-signin-card">
    <h2>${esc(T('signInTitle'))}</h2><p>${esc(T('signInLead'))}</p>
    <form id="ap-signin" novalidate><label class="ap-field"><span>${esc(T('email'))}</span><input name="email" type="email" autocomplete="username" required dir="ltr" value="${esc(ctx.state.user?.email || '')}"></label>
    <label class="ap-field"><span>${esc(T('password'))}</span><input name="password" type="password" autocomplete="current-password" required dir="ltr"></label>
    <p class="ap-error" role="alert">${esc(message)}</p>
    <button class="ap-btn is-primary is-wide" type="submit">${esc(T('signIn'))}</button>
    <button class="ap-link" type="button" id="ap-forgot">${esc(T('forgotPassword'))}</button></form></div></section>`;
  const form = document.getElementById('ap-signin');
  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (!form.reportValidity()) return;
    await act(form.querySelector('button[type=submit]'), () => sb.signIn(form.elements.email.value.trim(), form.elements.password.value)).then(() => mount()).catch(() => {});
  });
  document.getElementById('ap-forgot').addEventListener('click', async e => {
    const email = form.elements.email.value.trim();
    if (!email) { form.querySelector('.ap-error').textContent = T('enterEmailFirst'); return; }
    await act(e.currentTarget, () => sb.recover(email), T('recoverySent')).catch(() => {});
  });
}
function newPasswordView() {
  setTitle(T('newPasswordTitle'));
  view().innerHTML = `<section class="ap-signin"><div class="ap-signin-card"><h2>${esc(T('newPasswordTitle'))}</h2><p>${esc(T('newPasswordLead'))}</p>
    <form id="ap-newpass"><label class="ap-field"><span>${esc(T('newPassword'))}</span><input name="p1" type="password" minlength="12" autocomplete="new-password" required dir="ltr"></label>
    <label class="ap-field"><span>${esc(T('confirmPassword'))}</span><input name="p2" type="password" minlength="12" autocomplete="new-password" required dir="ltr"></label>
    <p class="ap-error" role="alert"></p><button class="ap-btn is-primary is-wide" type="submit">${esc(T('savePassword'))}</button></form></div></section>`;
  const form = document.getElementById('ap-newpass');
  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (!form.reportValidity()) return;
    if (form.elements.p1.value !== form.elements.p2.value) { form.querySelector('.ap-error').textContent = T('passwordsDiffer'); return; }
    await act(form.querySelector('button'), () => sb.changePassword(form.elements.p1.value), T('passwordSaved')).then(() => go('/admin')).catch(() => {});
  });
}

// ---- Applications (website API) --------------------------------------------------------------------------------------
let appsCache = null;
async function loadApplications() { appsCache = (await ctx.api('/api/admin/applications')).applications || []; return appsCache; }
async function countRequests() {
  try {
    const n = ((await ctx.api('/api/admin/change-requests?status=pending')).requests || []).length;
    const badge = document.getElementById('ap-req-count');
    if (badge) { badge.hidden = !n; badge.textContent = num(n); }
  } catch {}
}
async function countReports() {
  try {
    const n = ((await ctx.api('/api/admin/problem-reports?status=open')).reports || []).length;
    const badge = document.getElementById('ap-rep-count');
    if (badge) { badge.hidden = !n; badge.textContent = num(n); }
  } catch {}
}
async function countApplications() {
  try {
    const n = (await loadApplications()).filter(a => a.awaitingApproval).length;
    const badge = document.getElementById('ap-app-count');
    if (badge) { badge.hidden = !n; badge.textContent = num(n); }
  } catch {}
}
const planName = p => ({ basic: 'Basic', pro: 'Pro', business: 'Business', enterprise: 'Enterprise' })[p] || p;
const money = q => q?.total == null ? T('byAgreement') : `${q.currency === 'ILS' ? '₪' : '$'}${Number(q.total).toLocaleString('en', { maximumFractionDigits: 2 })}`;
// A quote's total is for its billing period: a yearly quote holds the whole year (11 × monthly); quotes from before
// yearly billing have no interval and are monthly.
const perPeriod = q => q?.total == null ? money(q) : `${money(q)} / ${T(q.interval === 'year' ? 'year' : 'month')}`;
function appStatus(a) { return a.awaitingApproval ? pill('info', T('awaitingApproval')) : pill(STATUS[a.status] || 'muted', ctx.t(a.status)); }
const payPill = a => pill(PAY[a.paymentStatus] || 'muted', ctx.t('pay_' + (a.paymentStatus || 'unpaid')));

async function overview() {
  setTitle(T('navOverview'));
  view().innerHTML = loading();
  const [apps, salons, audit] = await Promise.all([
    appsCache ? Promise.resolve(appsCache) : loadApplications(),
    rpc('platform_salons_page_v2', { p_page: 1, p_page_size: 12, p_query: '', p_status: 'all' }),
    rpc('platform_audit_list', { p_offset: 0 }).catch(() => []),
  ]);
  const awaiting = apps.filter(a => a.awaitingApproval), replied = apps.filter(a => a.status === 'in_review' && !a.awaitingApproval);
  const unpaid = apps.filter(a => (a.paymentStatus || 'unpaid') === 'unpaid' && ['pending', 'in_review'].includes(a.status));
  const paused = salons.counts.inactive || 0;
  const tasks = [
    ...awaiting.map(a => ({ a, tone: 'info', text: T('taskApprove', { salon: a.salonName }), sub: `${planName(a.plan)} · ${ctx.t('pay_' + a.paymentStatus)}` })),
    ...replied.map(a => ({ a, tone: 'warn', text: T('taskReplied', { salon: a.salonName }), sub: a.fullName })),
    ...unpaid.slice(0, 5).map(a => ({ a, tone: 'muted', text: T('taskUnpaid', { salon: a.salonName }), sub: a.paymentMethod === 'card' ? T('waitingCard') : T('waitingTransfer') })),
  ];
  const lead = awaiting.length ? T('leadAwaiting', { n: num(awaiting.length) }) : tasks.length ? T('leadFollowUp', { n: num(tasks.length) }) : T('leadClear');
  view().innerHTML = `<section class="ap-hero"><p class="ap-hero-line">${esc(lead)}</p>
      <dl class="ap-strip"><div><dt>${esc(T('salonsActive'))}</dt><dd>${num(salons.counts.active)}</dd></div><div><dt>${esc(T('salonsPaused'))}</dt><dd>${num(paused)}</dd></div>
      <div><dt>${esc(T('appsAwaiting'))}</dt><dd>${num(awaiting.length)}</dd></div><div><dt>${esc(T('appsTotal'))}</dt><dd>${num(apps.length)}</dd></div></dl></section>
    <div class="ap-columns"><section class="ap-panel"><header class="ap-panel-head"><h2>${esc(T('needsYou'))}</h2><a class="ap-link" href="/admin/applications">${esc(T('allApplications'))}</a></header>
      ${tasks.length ? `<ul class="ap-tasks" data-paginate="overview-tasks">${tasks.map(x => `<li><a href="/admin/applications/${esc(x.a.id)}" class="ap-task">${salonMark(x.a, 36)}<span><b>${esc(x.text)}</b><small>${esc(x.sub || '')}</small></span><i class="ap-dot is-${x.tone}" aria-hidden="true"></i></a></li>`).join('')}</ul>`
        : `<p class="ap-quiet">${esc(T('nothingWaiting'))}</p>`}</section>
    <section class="ap-panel"><header class="ap-panel-head"><h2>${esc(T('recentActivity'))}</h2><a class="ap-link" href="/admin/activity">${esc(T('seeAll'))}</a></header>
      ${audit.length ? `<ol class="ap-feed" data-paginate="overview-feed">${audit.map(r => `<li><span><b>${esc(actionLabel(r.action))}</b><small>${esc(r.salon_slug || T('platformWide'))}</small></span><time>${esc(fmtTime(r.created_at))}</time></li>`).join('')}</ol>` : `<p class="ap-quiet">${esc(T('noActivity'))}</p>`}</section></div>
    <section class="ap-panel"><header class="ap-panel-head"><h2>${esc(T('newestSalons'))}</h2><a class="ap-link" href="/admin/salons">${esc(T('allSalons'))}</a></header>
      <div class="ap-cards" data-paginate="overview-salons">${salons.items.map(salonCardMini).join('') || empty(T('noSalons'))}</div></section>`;
}
export function salonCardMini(s) {
  return `<a class="ap-index" href="/admin/salons/${esc(s.slug)}" style="--salon:${esc(salonColor(s))}">${salonMark(s, 42)}<span class="ap-index-body"><b>${esc(s.name)}</b><small dir="ltr">${esc(s.access_code)}</small></span>${s.is_active ? '' : pill('danger', T('paused'))}</a>`;
}
export function actionLabel(a) {
  const base = String(a || '').split(':')[0];
  return hasKey('act_' + base) ? T('act_' + base) : base.replace(/_/g, ' ');
}

const APP_FILTERS = ['awaiting', 'pending', 'in_review', 'needs_info', 'approved', 'declined', 'all'];
async function applicationsView() {
  setTitle(T('navApplications'));
  view().innerHTML = loading();
  const apps = await loadApplications();
  let filter = params().get('status') || 'awaiting', q = '';
  const match = a => (filter === 'all' || (filter === 'awaiting' ? a.awaitingApproval : a.status === filter))
    && (!q || [a.salonName, a.fullName, a.email, a.id, a.phone].join(' ').toLowerCase().includes(q));
  const count = f => apps.filter(a => f === 'all' || (f === 'awaiting' ? a.awaitingApproval : a.status === f)).length;
  view().innerHTML = `<div class="ap-toolbar"><div class="ap-chips" role="group" aria-label="${esc(T('filter'))}">${APP_FILTERS.map(f => `<button type="button" class="ap-chip" data-filter="${f}" aria-pressed="${f === filter}">${esc(f === 'awaiting' ? T('awaitingApproval') : f === 'all' ? T('all') : ctx.t(f))}<b>${num(count(f))}</b></button>`).join('')}</div>
    <label class="ap-search">${icon('M11 18a7 7 0 100-14 7 7 0 000 14zM21 21l-4.3-4.3')}<input type="search" id="ap-q" placeholder="${esc(T('searchApplications'))}" aria-label="${esc(T('searchApplications'))}"></label></div>
    <div class="ap-table-wrap"><table class="ap-table"><thead><tr><th>${esc(T('salon'))}</th><th>${esc(T('applicant'))}</th><th>${esc(T('plan'))}</th><th>${esc(T('payment'))}</th><th>${esc(T('status'))}</th><th>${esc(T('submitted'))}</th></tr></thead><tbody id="ap-rows" data-paginate="admin-applications"></tbody></table></div>`;
  const draw = () => {
    const rows = apps.filter(match);
    document.getElementById('ap-rows').innerHTML = rows.length ? rows.map(a => `<tr data-href="/admin/applications/${esc(a.id)}" tabindex="0">
      <td data-label="${esc(T('salon'))}"><span class="ap-cell-salon">${salonMark(a, 34)}<span><b>${esc(a.salonName)}</b><small dir="ltr">${esc(a.id)}</small></span></span></td>
      <td data-label="${esc(T('applicant'))}"><b>${esc(a.fullName)}</b><small dir="ltr">${esc(a.email)}</small></td>
      <td data-label="${esc(T('plan'))}">${esc(planName(a.plan))}<small class="ap-nowrap">${esc(perPeriod(a.quote))}</small></td>
      <td data-label="${esc(T('payment'))}">${payPill(a)}</td><td data-label="${esc(T('status'))}">${appStatus(a)}${reviewBadge(a)}</td>
      <td data-label="${esc(T('submitted'))}">${esc(fmtDate(a.createdAt))}</td></tr>`).join('') : `<tr data-no-page><td colspan="6">${empty(T('noApplications'))}</td></tr>`;
  };
  draw();
  view().querySelectorAll('[data-filter]').forEach(b => b.addEventListener('click', () => {
    filter = b.dataset.filter; view().querySelectorAll('[data-filter]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    history.replaceState(null, '', '/admin/applications?status=' + filter); draw();
  }));
  document.getElementById('ap-q').addEventListener('input', e => { q = e.target.value.trim().toLowerCase(); draw(); });
  bindRowLinks();
}
export function bindRowLinks(root = view()) {
  root.addEventListener('click', e => { const tr = e.target.closest('tr[data-href]'); if (tr && !e.target.closest('a,button,input,select')) go(tr.dataset.href); });
  root.addEventListener('keydown', e => { const tr = e.target.closest('tr[data-href]'); if (tr && e.key === 'Enter') go(tr.dataset.href); });
}

async function applicationView(id) {
  setTitle(T('application'), `<a class="ap-btn is-quiet" href="/admin/applications">${esc(T('allApplications'))}</a>`);
  view().innerHTML = loading();
  const a = (await loadApplications()).find(x => x.id === id);
  if (!a) { view().innerHTML = empty(T('notFound'), T('applicationMissing')); return; }
  const open = !['approved', 'declined'].includes(a.status), paid = ['paid', 'test_paid'].includes(a.paymentStatus);
  // The owner's number for the approval, as country + number (like "Owners & access" and the app); prefilled from
  // the application (ownerPhone is the local number the applicant gave, e.g. 0599123456; phone is E.164).
  await loadPhone().catch(() => null);
  const owner = (() => {
    const own = String(a.ownerPhone || ''), split = splitE164(own.startsWith('+') ? own : a.phone);
    const country = split?.country || countryForTimezone(a.timezone) || (DIAL_COUNTRIES.includes(a.country) ? a.country : 'PS');
    return { country, national: own && !own.startsWith('+') ? own : split?.national || own };
  })();
  const q = a.quote || {}, addons = [q.loyalty ? ctx.t('loyalty') : '', q.extraSpecialists ? `${ctx.t('extraSpecialists')} × ${q.extraSpecialists}` : ''].filter(Boolean);
  const facts = (rows) => `<dl class="ap-facts">${rows.filter(r => r[1]).map(([k, v, ltr]) => `<div><dt>${esc(k)}</dt><dd${ltr ? ' dir="ltr"' : ''}>${v}</dd></div>`).join('')}</dl>`;
  const who = m => m.direction === 'in' ? esc(m.author || a.fullName) : m.direction === 'out' ? 'Salonieer' : esc(T('system'));
  view().innerHTML = `<section class="ap-app-head" style="--salon:#1a88a4">${salonMark(a, 64)}<div><h2>${esc(a.salonName)}</h2><p dir="ltr">${esc(a.id)}</p><div class="ap-pills">${appStatus(a)}${payPill(a)}${reviewBadge(a)}</div></div></section>
    <div class="ap-columns is-detail"><div class="ap-stack">
      ${reviewPanel(a)}
      <section class="ap-panel"><h3>${esc(T('order'))}</h3>${facts([[T('plan'), esc(planName(a.plan))], [T(q.interval === 'year' ? 'yearlyTotal' : 'monthly'), esc(money(q))], [T('addons'), esc(addons.join(', '))], [T('paymentMethod'), esc(ctx.t(a.paymentMethod))], [T('paymentRef'), esc(a.paymentReference || ''), true], [T('paidOn'), a.paidAt ? esc(fmtTime(a.paidAt)) : ''], [ctx.t('teamComposition'), a.teamComposition ? esc(ctx.t('team_' + a.teamComposition)) : ''], [ctx.t('clientele'), a.clientele ? esc(ctx.t('clientele_' + a.clientele)) : esc(ctx.t('cat_' + a.salonCategory))], [T('timezone'), esc(a.timezone), true]])}</section>
      <section class="ap-panel"><h3>${esc(T('applicant'))}</h3>${facts([[T('name'), esc(a.fullName)], [T('email'), `<a href="mailto:${esc(a.email)}">${esc(a.email)}</a>`, true], [T('phone'), `<a href="tel:${esc(a.phone)}">${esc(a.phone)}</a>`, true], [T('country'), esc(a.country)], [T('idNumber'), a.identityNumber || a.idLast4 ? esc(a.identityNumber || '••' + a.idLast4) : '', true], [T('ownerLogin'), esc(a.ownerPhone), true], [T('submitted'), esc(fmtTime(a.createdAt))]])}</section>
      ${a.salon ? `<section class="ap-panel is-success"><h3>${esc(T('salonCreated'))}</h3><p>${esc(a.salon.name)} · <span dir="ltr">${esc(a.salon.accessCode)}</span></p><a class="ap-btn" href="/admin/salons/${esc(a.salon.slug)}">${esc(T('openSalon'))}</a></section>` : ''}
    </div><div class="ap-stack">
      ${open ? `<section class="ap-panel"><h3>${esc(T('payment'))}</h3>${paid ? `<p class="ap-quiet">${esc(T('paymentDone'))}</p>` : `<p class="ap-quiet">${esc(T(a.paymentMethod === 'card' ? 'waitingCard' : 'waitingTransfer'))}</p>
        <div class="ap-actions">${a.paymentMethod === 'bank_transfer' ? `<input class="ap-input" id="ap-ref" placeholder="${esc(T('transferRef'))}" dir="ltr" maxlength="120"><button class="ap-btn" type="button" id="ap-paid">${esc(T('markPaid'))}</button>` : ''}
        <button class="ap-btn is-quiet" type="button" id="ap-testpay">${esc(T('testBuy'))}</button><p class="ap-error" role="alert"></p></div>`}</section>
      <section class="ap-panel is-decision"><h3>${esc(T('decision'))}</h3>${paid ? '' : `<p class="ap-note">${esc(T('approveNeedsPayment'))}</p>`}
        <form id="ap-approve" class="ap-form-grid"><label class="ap-field"><span>${esc(T('slug'))}</span><input name="slug" dir="ltr" pattern="[a-z][a-z0-9]{1,23}" placeholder="${esc(T('automatic'))}" value="${esc(a.proposedSlug || '')}"></label>
          <label class="ap-field"><span>${esc(T('salonCode'))}</span><input name="accessCode" dir="ltr" pattern="[A-Za-z0-9_\\-]{4,32}" placeholder="${esc(T('automatic'))}" value="${esc(a.proposedCode || '')}"></label>
          <label class="ap-field"><span>${esc(ctx.t('teamComposition'))}</span><select name="teamComposition" required>${a.teamComposition ? '' : `<option value="">${esc(ctx.t('chooseOne'))}</option>`}${['male', 'female', 'mixed'].map(c => `<option value="${c}"${a.teamComposition === c ? ' selected' : ''}>${esc(ctx.t('team_' + c))}</option>`).join('')}</select></label>
          <label class="ap-field"><span>${esc(ctx.t('clientele'))}</span><select name="clientele" required>${a.clientele ? '' : `<option value="">${esc(ctx.t('chooseOne'))}</option>`}${['men', 'women', 'both'].map(c => `<option value="${c}"${a.clientele === c ? ' selected' : ''}>${esc(ctx.t('clientele_' + c))}</option>`).join('')}</select></label>
          <label class="ap-field"><span>${esc(T('timezone'))}</span><input name="timezone" dir="ltr" value="${esc(a.timezone)}"></label>
          <label class="ap-field"><span>${esc(T('dialCode'))}</span><select name="ownerCountry">${countryOptions(owner.country, ctx.lang)}</select></label>
          <label class="ap-field"><span>${esc(T('ownerPhoneLabel'))}</span><input name="ownerPhone" dir="ltr" type="tel" inputmode="tel" autocomplete="off" maxlength="24" required value="${esc(owner.national)}"></label>
          <p class="ap-note is-full" id="ap-owner-to" aria-live="polite"></p><small class="ap-quiet is-full">${esc(T('ownerAccessHint'))}</small>
          <div class="ap-actions is-full"><button class="ap-btn is-primary" type="submit"${paid ? '' : ' disabled'}>${esc(T('approveCreate'))}</button><button class="ap-btn is-danger" type="button" id="ap-decline">${esc(T('decline'))}</button><p class="ap-error" role="alert"></p></div></form></section>` : ''}
      <section class="ap-panel"><h3>${esc(T('conversation'))}</h3>
        ${a.messages.length ? `<ol class="ap-thread" data-paginate="admin-thread-${esc(a.id)}" data-paginate-start="last">${a.messages.map(m => `<li class="is-${m.direction}"><header><b>${who(m)}</b><time>${esc(fmtTime(m.createdAt))}</time></header><p>${esc(m.body)}</p></li>`).join('')}</ol>` : `<p class="ap-quiet">${esc(T('noMessages'))}</p>`}
        <form id="ap-compose" class="ap-compose"><label class="ap-field"><span>${esc(T('messageToCustomer'))}</span><textarea name="note" rows="3" maxlength="5000"></textarea></label>
          <div class="ap-actions"><button class="ap-btn" type="submit" data-action="message">${esc(T('sendMessage'))}</button>${open ? `<button class="ap-btn is-quiet" type="submit" data-action="needs_info">${esc(T('askInfo'))}</button><button class="ap-btn is-quiet" type="submit" data-action="in_review">${esc(T('markInReview'))}</button>` : ''}<p class="ap-error" role="alert"></p></div></form></section>
    </div></div>`;
  const reload = async () => { await loadApplications(); await applicationView(id); countApplications(); };
  const base = '/api/admin/applications/' + encodeURIComponent(id);
  document.getElementById('ap-paid')?.addEventListener('click', e => act(e.currentTarget, () => ctx.post(base + '/mark-paid', { reference: document.getElementById('ap-ref').value.trim() }), T('paymentRecorded')).then(reload).catch(() => {}));
  document.getElementById('ap-testpay')?.addEventListener('click', async e => { if (await confirm(T('testBuy'), T('testBuyConfirm'))) act(e.currentTarget, () => ctx.post('/api/applications/' + encodeURIComponent(id) + '/test-pay', {}), T('paidTest')).then(reload).catch(() => {}); });
  const approve = document.getElementById('ap-approve');
  const ownerNumber = () => approve && toE164(approve.elements.ownerPhone.value, approve.elements.ownerCountry.value);
  const showOwner = () => {
    const box = document.getElementById('ap-owner-to'); if (!box) return;
    const n = ownerNumber();
    box.textContent = n ? T('ownerAccessTo', { phone: n.e164 }) : approve.elements.ownerPhone.value.trim() ? T('invalidPhoneIntl') : '';
    if (n) approve.querySelector('.ap-error').textContent = '';
  };
  approve?.elements.ownerPhone.addEventListener('input', showOwner);
  approve?.elements.ownerCountry.addEventListener('change', showOwner);
  showOwner();
  approve?.addEventListener('submit', async e => {
    e.preventDefault();
    const n = ownerNumber();
    if (!n) { approve.querySelector('.ap-error').textContent = T('invalidPhoneIntl'); approve.elements.ownerPhone.focus(); return; }
    if (!approve.reportValidity() || !(await confirm(T('approveCreate'), T('approveConfirm')))) return;
    const data = Object.fromEntries(new FormData(approve)); delete data.ownerCountry; data.ownerPhone = n.e164;
    await act(approve.querySelector('[type=submit]'), () => ctx.post(base + '/approve', data), T('salonCreated')).then(reload).catch(() => {});
  });
  document.getElementById('ap-decline')?.addEventListener('click', async e => {
    const note = document.querySelector('#ap-compose textarea').value.trim();
    if (!(await confirm(T('decline'), note ? T('declineWithNote') : T('declineNoNote'), { danger: true, confirmLabel: T('decline') }))) return;
    await act(e.currentTarget, () => ctx.api(base, { method: 'PATCH', body: JSON.stringify({ status: 'declined', note }) }), T('declined')).then(reload).catch(() => {});
  });
  const compose = document.getElementById('ap-compose');
  compose.addEventListener('submit', async e => {
    e.preventDefault();
    const action = e.submitter?.dataset.action || 'message', note = compose.elements.note.value.trim();
    if (!note && action !== 'in_review') { compose.querySelector('.ap-error').textContent = T('messageRequired'); return; }
    await act(e.submitter, () => action === 'message' ? ctx.post(base + '/messages', { body: note }) : ctx.api(base, { method: 'PATCH', body: JSON.stringify({ status: action, note }) }), T(action === 'message' ? 'messageSent' : 'statusSaved')).then(reload).catch(() => {});
  });
}
