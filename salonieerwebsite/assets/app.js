import { languages, translate } from './i18n.js';
import { COUNTRIES } from './countries.js';
import { policy } from './policy.js';
import { terms, refund } from './legal.js';
import { initFx, killFx } from './fx/scroll.js';
import { initInteract } from './fx/interact.js';
import { initShowcase, tourTab } from './fx/showcase.js';
import * as V from './validate.js';
import { countryPicker, bindCountryPicker } from './country-picker.js';
import { confirmDialog, toast, setBusy, solveChallenge } from './ui.js';
import './qr.js';
import { adminShell, bindAdmin, isAdminRoute, refresh as refreshAdmin } from './admin/panel.js';
import { installPager } from './pager.js';
import { PLAN_FEATURES, PLAN_SUMMARY } from './plans-data.js';
import { planFinder, bindPlanFinder, finderLink } from './plan-finder.js';
// METON 2.44: booking pages (/s/<code>), private booking links (/m/<token>), My bookings (/me).
import { bookPage, bindBook, managePage, bindManage, mePage, bindMe, forgotPage, bindForgot, L as bookL } from './book.js';
// 2026-11-07: Try METON Free (/try): the customer demo and the 3-step page builder with its preview and dashboard.
import { tryPage, bindTry } from './demo.js';
import { CATEGORIES as SECTORS, pick3 } from './demo-data.js';

const app = document.getElementById('app');
let storedLanguage;
try { storedLanguage = localStorage.getItem('salonieer_lang'); } catch {}
// A link from the app ("Join as a Salon") says which language the person uses: ?lang=ar|en|he.
try { const fromLink = new URLSearchParams(location.search).get('lang'); if (languages.includes(fromLink)) { storedLanguage = fromLink; localStorage.setItem('salonieer_lang', fromLink); } } catch {}
let lang = languages.includes(storedLanguage) ? storedLanguage : (languages.includes(navigator.language.slice(0,2)) ? navigator.language.slice(0,2) : 'en');
// 2.34: /s/<code> (a salon's own link) is one page whatever the code.
const routeOf = pathname => { const r = pathname.replace(/\.html$/, '').replace(/\/$/, '') || '/'; if (/^\/s\/[A-Za-z0-9_-]{2,64}$/.test(r)) return '/s';
  if (/^\/m\/[a-f0-9]{48}$/.test(r)) return '/m'; if (/^\/try\/(customer|business)$/.test(r)) return '/try'; return r === '/index' ? '/' : r; };
let route = routeOf(location.pathname);
let routeKey = '';
const privateRoutes = ['/apply','/applications','/account','/admin'];
// Every /admin/... address belongs to the admin panel (assets/admin/panel.js), which has its own sub-pages.
const isPrivate = r => privateRoutes.includes(r) || r.startsWith('/admin/');
const knownRoute = r => r in pages || isAdminRoute(r);
// November 2026: one price list in US dollars for everyone, and every payment is in USD. Visitors can also see roughly
// what a price is in their own currency (display only), from the checked rates the server sends with the plans.
const CURRENCIES = ['USD'];
const SYMBOLS = { USD:'$', ILS:'₪' };
let storedDisplay;
try { storedDisplay = localStorage.getItem('salonieer_display_currency'); } catch {}
// A submission key. crypto.randomUUID exists only on https pages; getRandomValues works everywhere (a page opened over
// plain http stopped at "Loading…" without this).
const uuid = () => { if (window.crypto?.randomUUID) { try { return crypto.randomUUID(); } catch {} } const b = crypto.getRandomValues(new Uint8Array(16)); b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128; const h = [...b].map(x => x.toString(16).padStart(2, '0')).join(''); return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`; };
let storedInterval;
try { storedInterval = localStorage.getItem('salonieer_interval'); } catch {}
const state = { interval: storedInterval === 'year' ? 'year' : 'month', invoices: [], currency: 'USD', displayCurrency: /^[A-Z]{3}$/.test(storedDisplay || '') ? storedDisplay : '', user: null, csrf: '', catalog: null, applications: [], logo: '', logoName: '', submissionKey: uuid(), receipt: null, filter: 'all', billing: null, checkout: null, paid: false, salons: [] };
const drafts = {};
const t = (key,vars) => translate(key,lang,vars);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// Whole amounts show as "39"; amounts with cents always show both digits, as "19.50".
const amountText = value => Number(value).toLocaleString('en-US',{minimumFractionDigits:Number.isInteger(Number(value))?0:2,maximumFractionDigits:2});
const money = (value,currency=state.currency) => value === null || value === undefined ? t('byAgreement') : (SYMBOLS[currency] ?? currency + ' ') + amountText(value);
const priceOf = prices => prices ? prices[state.currency] ?? null : null;
// The currency prices are shown in: the visitor's choice, else their country's, when the server has a rate for it.
const fxRate = cur => state.catalog?.fx?.rates?.[cur] || null;
const displayCurrency = () => { const c = state.displayCurrency || state.catalog?.fx?.local || 'USD'; return c !== 'USD' && fxRate(c) ? c : 'USD'; };
function setDisplayCurrency(value) {
  state.displayCurrency = /^[A-Z]{3}$/.test(value) ? value : '';
  try { localStorage.setItem('salonieer_display_currency', state.displayCurrency); } catch {}
}
const currencyName = c => { try { return new Intl.DisplayNames([lang], {type:'currency'}).of(c); } catch { return c; } };
// An approximate local amount: whole units, or cents under 10 ("≈ €2.69"); same digits and symbols in every language.
function localAmount(usd, cur) {
  const v = Number(usd) * fxRate(cur);
  try { return new Intl.NumberFormat('en', {style:'currency', currency:cur, currencyDisplay:'narrowSymbol', minimumFractionDigits:0, maximumFractionDigits: v < 10 ? 2 : 0}).format(v); }
  catch { return cur + ' ' + Math.round(v); }
}
// A price on the plan pages: "$40", or "≈ ₪125" with the USD amount that is actually charged under it.
// `after` (the period) goes right after the main amount.
function shownPrice(usd, after='') {
  if (usd === null || usd === undefined) return esc(t('byAgreement'));
  const cur = displayCurrency();
  if (cur === 'USD') return `<bdi>${money(usd,'USD')}</bdi>${after}`;
  return `<bdi class="px-local" dir="ltr">≈ ${localAmount(usd,cur)}</bdi>${after}<small class="px-usd" title="${esc(t('fxCharged'))}"><bdi dir="ltr">${money(usd,'USD')} USD</bdi></small>`;
}
// The same as plain text (for <option> labels).
const shownPriceText = usd => usd === null || usd === undefined ? t('byAgreement') : displayCurrency() === 'USD' ? money(usd,'USD') : `≈ ${localAmount(usd,displayCurrency())} (${money(usd,'USD')})`;
// Under an exact USD total: what it is roughly in the shown currency.
const approxLine = usd => usd === null || usd === undefined || displayCurrency() === 'USD' ? '' : `<p class="small-note px-approx"><bdi dir="ltr">≈ ${localAmount(usd,displayCurrency())}</bdi> · ${t('fxApprox')}</p>`;
// Monthly or yearly billing (yearly = yearlyMonths × monthly), remembered like the currency.
const yearMonths = () => state.catalog?.yearlyMonths || state.checkout?.yearlyMonths || 11;
// The yearly saving as a percentage of twelve monthly payments (11 of 12 → 8.3%), never rounded up. Shown as a discount,
// not as "a month free", so nobody reads it as nothing to pay.
const yearlySaving = () => { const p = Math.floor((12 - yearMonths()) / 12 * 1000) / 10; return Number.isInteger(p) ? String(p) : p.toFixed(1); };
const perPeriod = (value, interval=state.interval) => value === null || value === undefined ? value : value * (interval === 'year' ? yearMonths() : 1);
const periodKey = (interval=state.interval) => interval === 'year' ? 'perYear' : 'perMonth';
const totalKey = (interval=state.interval) => interval === 'year' ? 'yearlyTotal' : 'monthlyTotal';
function setInterval_(value) {
  state.interval = value === 'year' ? 'year' : 'month';
  try { localStorage.setItem('salonieer_interval', state.interval); } catch {}
}
function intervalSwitch() {
  return `<div class="currency-switch interval-switch" role="radiogroup" aria-label="${t('billingPeriod')}">${['month','year'].map(i=>`<button type="button" role="radio" class="currency-option${state.interval===i?' active':''}" data-interval="${i}" aria-checked="${state.interval===i}">${t(i==='year'?'yearly':'monthly')}${i==='year'&&yearMonths()<12?` <span class="save-tag" dir="${lang==='en'?'ltr':'rtl'}">${t('yearlyOff',{pct:`<bdi dir="ltr">${yearlySaving()}%</bdi>`})}</span>`:''}</button>`).join('')}</div>`;
}
// The 14-day trial (card required) is offered on the trial plans to accounts that never had a subscription.
const trialShown = planId => (state.catalog?.trialPlans || state.checkout?.trialPlans || []).includes(planId) && (!state.user || !!state.checkout?.trialEligible);
const trialDays = () => state.catalog?.trialDays || 14;
// The "Show prices in" picker: US dollars, the visitor's own currency, then every other currency with a rate.
// Without rates (the server couldn't get checked ones) prices are in US dollars only and there is no picker.
function currencySwitch() {
  const fx = state.catalog?.fx;
  if (!fx?.rates) return '';
  const cur = displayCurrency();
  const list = [...new Set(['USD', fx.local, cur, ...Object.keys(fx.rates)])].filter(c => c && fx.rates[c]);
  return `<label class="currency-pick"><span>${t('showPricesIn')}</span><select data-display-currency dir="ltr">${list.map(c=>`<option value="${c}"${c===cur?' selected':''}>${c} · ${esc(currencyName(c))}</option>`).join('')}</select></label>`;
}
// Said wherever prices are shown: local amounts are approximate, payments are always in USD.
const fxNote = () => `<p class="fx-note">${displayCurrency()==='USD' ? t('fxUsdOnly') : t('fxNote',{cur:`<bdi>${displayCurrency()}</bdi>`, date:state.catalog?.fx?.asOf ? date(state.catalog.fx.asOf) : ''})}</p>`;
const date = value => new Intl.DateTimeFormat(lang, { dateStyle:'medium' }).format(new Date(value));
const statusNames = ['pending','in_review','needs_info','approved','declined'];
const CATEGORIES = ['male','female','beauty'];
const TEAM_COMPOSITIONS = ['male','female','mixed'];
const CLIENTELES = ['men','women','both'];
// Common salon time zones; the account country's zone is preselected (the server accepts any valid zone).
const TIMEZONES = ['Asia/Hebron','Asia/Gaza','Asia/Jerusalem','Asia/Amman','Asia/Riyadh','Asia/Dubai','Asia/Qatar','Asia/Kuwait','Asia/Bahrain','Asia/Muscat','Asia/Baghdad','Asia/Beirut','Asia/Damascus','Africa/Cairo','Africa/Casablanca','Africa/Tunis','Africa/Algiers','Europe/Istanbul','Europe/London','Europe/Berlin','Europe/Paris','America/New_York','America/Chicago','America/Los_Angeles','UTC'];
// Where each listed zone is (its main city, from the IANA zone table), to order the list by distance from the device.
const TZ_COORDS = {'Asia/Hebron':[31.53,35.1],'Asia/Gaza':[31.5,34.47],'Asia/Jerusalem':[31.78,35.22],'Asia/Amman':[31.95,35.93],'Asia/Riyadh':[24.63,46.72],'Asia/Dubai':[25.3,55.3],
  'Asia/Qatar':[25.28,51.53],'Asia/Kuwait':[29.33,47.98],'Asia/Bahrain':[26.38,50.58],'Asia/Muscat':[23.6,58.58],'Asia/Baghdad':[33.35,44.42],'Asia/Beirut':[33.88,35.5],'Asia/Damascus':[33.5,36.3],
  'Africa/Cairo':[30.05,31.25],'Africa/Casablanca':[33.65,-7.58],'Africa/Tunis':[36.8,10.18],'Africa/Algiers':[36.78,3.05],'Europe/Istanbul':[41.02,28.97],'Europe/London':[51.51,-0.13],
  'Europe/Berlin':[52.5,13.37],'Europe/Paris':[48.87,2.33],'America/New_York':[40.71,-74.01],'America/Chicago':[41.85,-87.65],'America/Los_Angeles':[34.05,-118.24]};
const validZone = z => { try { new Intl.DateTimeFormat('en', {timeZone:z}); return true; } catch { return false; } };
const deviceZone = () => { try { const z = Intl.DateTimeFormat().resolvedOptions().timeZone; return z && validZone(z) ? z : ''; } catch { return ''; } };
// Minutes east of UTC right now (handles daylight saving), or null when the browser can't tell.
function zoneOffset(z) {
  try {
    const m = new Intl.DateTimeFormat('en-US', {timeZone:z, timeZoneName:'longOffset'}).formatToParts(new Date()).find(p=>p.type==='timeZoneName')?.value.match(/GMT(?:([+-])(\d{1,2})(?::(\d{2}))?)?/);
    return m ? (m[1]==='-'?-1:1) * (Number(m[2]||0)*60 + Number(m[3]||0)) : null;
  } catch { return null; }
}
const offsetText = min => min===null ? '' : `UTC${min<0?'−':'+'}${String(Math.floor(Math.abs(min)/60)).padStart(2,'0')}:${String(Math.abs(min)%60).padStart(2,'0')}`;
function distanceKm([a1,o1],[a2,o2]) {
  const r = Math.PI/180, x = Math.sin((a2-a1)*r/2)**2 + Math.cos(a1*r)*Math.cos(a2*r)*Math.sin((o2-o1)*r/2)**2;
  return 12742 * Math.asin(Math.sqrt(x));
}
// The device's zone first (preselected unless another value is given), then every other option from nearest to
// farthest: by distance when both places are known, otherwise by the difference in UTC offset. UTC comes last.
function timezoneOptions(selected, country) {
  const device = deviceZone(), home = device || TZ_BY_COUNTRY[country] || 'Asia/Hebron';
  const value = selected && validZone(selected) ? selected : home;
  const here = TZ_COORDS[home], hereOffset = zoneOffset(home);
  const zones = [...new Set([home, value, ...TIMEZONES])].filter(validZone);
  const rank = z => z===home ? -1 : z==='UTC' ? 1e9 : here && TZ_COORDS[z] ? distanceKm(here, TZ_COORDS[z]) : 1e6 + Math.abs((zoneOffset(z) ?? 0) - (hereOffset ?? 0)) * 60;
  zones.sort((a,b)=>rank(a)-rank(b) || a.localeCompare(b));
  return zones.map(z=>`<option value="${esc(z)}"${z===value?' selected':''}>${esc(z.replace(/_/g,' '))} (${offsetText(zoneOffset(z))})${z===device?' · '+t('tzThisDevice'):''}</option>`).join('');
}
const TZ_BY_COUNTRY = {PS:'Asia/Hebron',IL:'Asia/Jerusalem',JO:'Asia/Amman',SA:'Asia/Riyadh',AE:'Asia/Dubai',QA:'Asia/Qatar',KW:'Asia/Kuwait',BH:'Asia/Bahrain',OM:'Asia/Muscat',IQ:'Asia/Baghdad',LB:'Asia/Beirut',SY:'Asia/Damascus',EG:'Africa/Cairo',MA:'Africa/Casablanca',TN:'Africa/Tunis',DZ:'Africa/Algiers',TR:'Europe/Istanbul',GB:'Europe/London',DE:'Europe/Berlin',FR:'Europe/Paris',US:'America/New_York'};
const paidStatus = a => ['paid','test_paid'].includes(a.paymentStatus);

async function api(path, options = {}) {
  let response;
  try {
    response = await fetch(path, {
      ...options, credentials:'same-origin', cache:'no-store',
      headers: { ...(options.body ? {'Content-Type':'application/json','X-CSRF-Token':state.csrf} : {}), ...options.headers }
    });
  } catch { throw { code:'connectionError' }; }
  let data;
  // A reply that isn't JSON comes from the host in front of PHP (request too large, gateway timeout, firewall).
  try { data = await response.json(); } catch { throw { code: response.status === 413 ? 'fileTooLarge' : [502,503,504].includes(response.status) ? 'serviceUnavailable' : response.status === 429 ? 'tooManyAttempts' : 'serverError', field: response.status === 413 ? 'logo' : undefined, status: response.status }; }
  if (!response.ok) {
    if (response.status === 401 && data.error === 'loginRequired') { state.user = null; go('/login?next=' + encodeURIComponent(location.pathname + location.search), {replace:true}); }
    throw { code:data.error || 'serverError', field:data.field, status:response.status, retryAfter:data.retryAfter, detail:data.detail };
  }
  return data;
}
function nextPage(fallback='/account') {
  const value = new URLSearchParams(location.search).get('next');
  if (!value || !/^\/(plans|apply|applications|account|admin|try\/business|m\/[a-f0-9]{48})(\?[^\r\n\\]*)?$/.test(value)) return fallback;
  return value;
}
function setLanguage(value) {
  lang = languages.includes(value) ? value : 'en';
  try { localStorage.setItem('salonieer_lang',lang); } catch {}
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'en' ? 'ltr' : 'rtl';
}
function countryName(code) {
  try { return new Intl.DisplayNames([lang],{type:'region'}).of(code); } catch { return code; }
}
function locationName(user) {
  return [countryName(user.country), user.region ? t(user.region) : ''].filter(Boolean).join(' · ');
}
const langSelect = (id = 'language') => `<select id="${id}" class="language-select" data-language aria-label="${t('language')}"><option value="en" ${lang==='en'?'selected':''}>EN</option><option value="ar" ${lang==='ar'?'selected':''}>العربية</option><option value="he" ${lang==='he'?'selected':''}>עברית</option></select>`;
// Light / Dark / System (assets/theme-boot.js applies it before the first paint and keeps it in this browser).
// Light is the default (owner, 2026-11-11); System follows the device only when chosen.
const appearanceSelect = (id = 'appearance') => { const p = window.metonAppearance?.get?.() || 'light';
  return `<select id="${id}" class="language-select appearance-select" data-appearance aria-label="${t('appearance')}">${['light','dark','system'].map(v=>`<option value="${v}"${p===v?' selected':''}>${t('appearance_'+v)}</option>`).join('')}</select>`; };
// The two preferences, labelled (in the menu on phones).
const prefField = (label, control) => `<label class="pref-field"><span>${label}</span>${control}</label>`;
function header() {
  const link =(path,key,cls='') => `<a href="${path}"${cls?` class="${cls}"`:''}${route===path?' aria-current="page"':''}>${t(key)}</a>`;
  const item = (path,key) => `<li>${link(path,key)}</li>`;
  return `<a class="skip" href="#main">${t('skip')}</a><header class="topbar"><div class="nav">
    <a href="/" class="brand" aria-label="METON"><img class="brand-logo brand-logo-light" src="/assets/brand/meton-wordmark-ink.svg" alt="METON" width="170" height="26"><img class="brand-logo brand-logo-dark" src="/assets/brand/meton-wordmark-cream.svg" alt="" width="170" height="26"></a>
    <nav class="bar-links" aria-label="${t('menu')}">${link('/#features','navFeatures')}${link('/plans','plans')}${link('/support','support')}${state.user?link('/account','account'):link('/login','login')}</nav>
    ${state.user?'':`<a class="btn primary small bar-try" href="/try">${t('tryFree')}</a>`}
    <span class="bar-prefs">${appearanceSelect()}${langSelect()}</span>
    <button class="menu-toggle" id="menu-toggle" aria-controls="nav-panel" aria-expanded="false" data-open="${t('menu')}" data-close="${t('close')}"><span class="label-text">${t('menu')}</span><span class="bars" aria-hidden="true"></span></button>
    <nav id="nav-panel" class="nav-panel" aria-label="${t('menu')}"><ul class="menu-links">${item('/','home')}${item('/try','tryFree')}${item('/#sectors','navSectors')}${item('/plans','plans')}${item('/me','myBookings')}${state.user?item('/account','account'):''}${item('/support','support')}${state.user?.isAdmin?item('/admin','adminPanel'):''}${state.user?'':item('/login','login')+item('/register','register')}</ul>
      <div class="menu-foot"><div class="nav-actions">${state.user?`<a class="btn small" href="/account">${t('account')}</a><button class="btn small menu-logout" id="logout-menu" type="button">${t('logout')}</button>`:`<a class="btn small" href="/login">${t('login')}</a><a class="btn primary small" href="/try">${t('tryFree')}</a>`}</div><div class="menu-prefs">${prefField(t('appearance'), appearanceSelect('appearance-menu'))}${prefField(t('language'), langSelect('language-menu'))}</div><a class="mail" href="mailto:support@meton.work" dir="ltr">support@meton.work</a></div></nav>
  </div></header>`;
}
// A business's own pages (its booking page, a booking's private link) and the customer demo of one: the business's
// name and colours lead; METON stays in a small footer line (decision record: a private page for the business).
const bizPageRoute = () => route === '/s' || route === '/m' || (route === '/try' && /^\/try\/customer\/?$/.test(location.pathname));
const bizTop = () => `<a class="skip" href="#main">${t('skip')}</a><div class="biz-top">${appearanceSelect()}${langSelect()}</div>`;
const bizFoot = () => `<footer class="biz-foot"><a href="/" class="biz-foot-brand"><img src="/assets/brand/meton-wordmark-ink.svg" alt="" width="62" height="13" loading="lazy">${bookL({lang}, 'poweredBy')}</a><span><a href="/privacy">${t('privacyPolicy')}</a> · <a href="/terms">${t('termsTitle')}</a></span></footer>`;
function footer() {
  return `<footer class="site-footer"><div class="wrap"><div class="footer-grid"><div><img class="footer-logo" src="/assets/brand/meton-wordmark-cream.svg" alt="METON" width="160" height="32" loading="lazy"><p>${t('footerTagline')}</p></div>
    <nav aria-label="${t('footerProduct')}"><h3>${t('footerProduct')}</h3><div class="footer-links"><a href="/">${t('home')}</a><a href="/try">${t('tryFree')}</a><a href="/try/business">${t('hm2_cta_build_short')}</a><a href="/plans">${t('plans')}</a><a href="/me">${t('myBookings')}</a><a href="/app/">${t('webAppOpen')}</a>${state.user?`<a href="/account">${t('account')}</a>`:''}</div></nav>
    <nav aria-label="${t('legal')}"><h3>${t('legal')}</h3><div class="footer-links"><a href="/terms">${t('termsTitle')}</a><a href="/privacy">${t('privacyPolicy')}</a><a href="/refund">${t('refundTitle')}</a></div></nav>
    <div><h3>${t('footerContact')}</h3><div class="footer-links"><a href="/support">${t('support')}</a><a href="mailto:support@meton.work" dir="ltr">support@meton.work</a></div></div></div>
    <div class="footer-bottom"><span>© ${new Date().getFullYear()} METON. ${t('footerRights')}</span><span>${t('footerMade')}</span></div></div></footer>`;
}
function titleBlock(eyebrow,title,lead,center=false,extra='') {
  return `<div class="page-heading${center?' center':''}"><h1>${t(title)}</h1>${lead?`<p>${t(lead)}</p>`:''}${extra}</div>`;
}
function priceHTML(value,currency=state.currency) {
  return value === null || value === undefined ? `<div class="price"><span class="agreement">${t('byAgreement')}</span></div>` : `<div class="price"><span class="currency">${SYMBOLS[currency] ?? currency + ' '}</span><span class="amount">${amountText(value)}</span></div>`;
}
function field(name,label,{type='text',hint='',required=true,autocomplete='',minlength='',maxlength='',placeholder='',extra='',full=false,wrap=''}={}) {
  const password = type === 'password';
  return `<div class="field${full?' full-span':''}"${wrap?' '+wrap:''}><label for="${name}">${t(label)}</label>${password?'<div class="password-wrap">':''}<input id="${name}" name="${name}" type="${type}" ${required?'required':''} ${autocomplete?`autocomplete="${autocomplete}"`:''} ${minlength?`minlength="${minlength}"`:''} ${maxlength?`maxlength="${maxlength}"`:''} ${placeholder?`placeholder="${esc(placeholder)}"`:''} aria-describedby="${name}-hint ${name}-error" ${extra}>${password?`<button class="password-toggle" type="button" data-password="${name}" aria-controls="${name}" aria-label="${t('show')} ${t(label)}">${t('show')}</button></div>`:''}<small id="${name}-hint">${hint?t(hint):''}</small><small id="${name}-error" class="field-error"></small></div>`;
}
function formErrorBox() { return '<div id="form-error" class="notice" role="alert" tabindex="-1" hidden></div>'; }
function authIntro(title,lead) {
  return `<aside class="auth-art"><div class="auth-clock"><p class="auth-clock-kicker" id="auth-clock-label">${t('cdKicker')}</p><div class="auth-clock-time" role="timer" aria-labelledby="auth-clock-label" dir="ltr" data-auth-clock>${clockHtml()}</div><blockquote class="auth-clock-quote"><p>${t('cdQuote')}</p></blockquote></div><div class="sr-only"><h1>${t(title)}</h1><p>${t(lead)}</p></div></aside>`;
}
// Time left today, to midnight in the visitor's own time zone. Worked out again from the clock on every tick, so
// midnight, a changed device clock, a time-zone or daylight-saving change and a tab woken from sleep are always right.
function secondsLeftToday(now = new Date()) { const end = new Date(now); end.setHours(24, 0, 0, 0); return Math.max(0, Math.floor((end - now) / 1000)); }
const clockParts = () => { const s = secondsLeftToday(); return [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map(n => String(n).padStart(2, '0')); };
// Hours, minutes and seconds as three units, each with its label; the time always reads left to right.
function clockHtml() {
  return clockParts().map((v, i) => `<span class="cd-unit"><b>${v}</b><small>${t(['cdHours','cdMinutes','cdSeconds'][i])}</small></span>`).join('<span class="cd-sep" aria-hidden="true">:</span>');
}
let authClockTimer = 0;
function startAuthClock() {
  clearTimeout(authClockTimer);
  const tick = () => {
    const el = document.querySelector('[data-auth-clock]');
    if (!el) return;                                  // the page changed: stop
    const parts = clockParts();
    el.querySelectorAll('.cd-unit b').forEach((b, i) => { if (b.textContent !== parts[i]) b.textContent = parts[i]; });
    authClockTimer = setTimeout(tick, 1020 - (Date.now() % 1000));   // just after the next whole second
  };
  tick();
}
const checkSvg = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7"/></svg>';
// ---- Home -------------------------------------------------------------------------------------------------------
// What Salonieer is, how a booking works, a tour of the real app, the rest of the features, the prices and how to
// start. Every picture is a real screen of the app in the site's language, made offline by tools/showcase from
// example salons (assets/img/showcase/<screen>-<lang>-<width>.webp), so switching the language switches the screens.
const ico = (paths, size = 22) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
const ICONS = {
  grid: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 9.5h17M8 3v4M16 3v4"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4.5 20.5c1.2-4 4.2-6 7.5-6s6.3 2 7.5 6"/>',
  users: '<circle cx="9" cy="8.5" r="3.5"/><path d="M2.5 20c.9-3.6 3.6-5.5 6.5-5.5s5.6 1.9 6.5 5.5M15.5 5.2a3.5 3.5 0 0 1 0 6.6M17.5 14.8c2 .7 3.4 2.4 4 5.2"/>',
  chart: '<path d="M3.5 20.5h17M6.5 17v-5M11 17V7M15.5 17v-8M19.5 17v-3.5"/>',
  briefcase: '<rect x="3.5" y="7" width="17" height="12.5" rx="2"/><path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7M3.5 12.5h17"/>',
  bell: '<path d="M6 16.5V11a6 6 0 1 1 12 0v5.5l1.5 2h-15z"/><path d="M10 21h4"/>',
  compass: '<circle cx="12" cy="12" r="8.5"/><path d="m15.5 8.5-2 5-5 2 2-5z"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  star: '<path d="m12 3.8 2.5 5.1 5.6.8-4 3.9.9 5.6-5-2.6-5 2.6.9-5.6-4-3.9 5.6-.8z"/>',
  layers: '<path d="m12 3.5 8.5 4.5-8.5 4.5L3.5 8z"/><path d="m3.5 12 8.5 4.5 8.5-4.5M3.5 16l8.5 4.5 8.5-4.5"/>',
  receipt: '<path d="M6 3.5h12v17l-2-1.3-2 1.3-2-1.3-2 1.3-2-1.3-2 1.3z"/><path d="M9 8h6M9 11.5h6M9 15h3.5"/>',
  trend: '<path d="M3.5 17.5 9 12l3.5 3.5 8-8"/><path d="M15 7.5h5.5V13"/>',
  wallet: '<path d="M4 7.5h14.5a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5.5A1.5 1.5 0 0 1 4 18z"/><path d="M4 7.5 15.5 4v3.5"/><circle cx="16" cy="13.5" r="1.2"/>',
  attend: '<circle cx="11" cy="11" r="7.5"/><path d="M11 7v4.2l2.6 1.6M15.5 19l2 2 3.5-4"/>',
  box: '<path d="m12 3.5 8 4v9l-8 4-8-4v-9z"/><path d="m4 7.5 8 4 8-4M12 11.5v9"/>',
  shield: '<path d="M12 3.5 19 6v5.5c0 4.4-3 7.8-7 9-4-1.2-7-4.6-7-9V6z"/><path d="m9 12 2.2 2.2L15.5 10"/>',
  ticket: '<path d="M3.5 8.5v-2a1 1 0 0 1 1-1h15a1 1 0 0 1 1 1v2a2.5 2.5 0 0 0 0 5v2a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1v-2a2.5 2.5 0 0 0 0-5z"/><path d="m9.5 14.5 5-5"/>',
  zoom: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5M10.5 7.5v6M7.5 10.5h6"/>',
  phone: '<rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M10.5 18.5h3"/>',
  globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.4 2.3 3.6 5.2 3.6 8.5s-1.2 6.2-3.6 8.5c-2.4-2.3-3.6-5.2-3.6-8.5s1.2-6.2 3.6-8.5z"/>',
};
// ---- the METON app (2026-11-08): the store of the visitor's device; a computer or an unknown device gets both -----
// Store marks: Simple Icons (CC0).
const STORE_ICONS = {
  ios: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701"/></svg>',
  android: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="#FBBC04" d="M22.018 13.298l-3.919 2.218-3.515-3.493 3.543-3.521 3.891 2.202a1.49 1.49 0 0 1 0 2.594z"/><path fill="#4285F4" d="M1.337.924a1.486 1.486 0 0 0-.112.568v21.017c0 .217.045.419.124.6l11.155-11.087L1.337.924z"/><path fill="#34A853" d="M13.544 10.989l3.258-3.238L3.45.195a1.466 1.466 0 0 0-.946-.179l11.04 10.973z"/><path fill="#EA4335" d="M13.544 13.056l-11 10.933c.298.036.612-.016.906-.183l13.324-7.54-3.23-3.21z"/></svg>',
};
const storeBadge = os => `<a class="store-badge" href="${STORE[os]}" target="_blank" rel="noopener" data-store="${os}">${STORE_ICONS[os]}<span><small>${t(os === 'ios' ? 'store_ios_small' : 'store_play_small')}</small><b dir="ltr">${os === 'ios' ? 'App Store' : 'Google Play'}</b></span></a>`;
const storeBadges = () => { const dev = device(); return dev === 'ios' || dev === 'android' ? storeBadge(dev) : storeBadge('ios') + storeBadge('android'); };
// One "Download METON" control: on a phone or tablet it opens that device's store; elsewhere it shows both stores.
function appGet() {
  const dev = device();
  if (dev === 'ios' || dev === 'android') return `<a class="btn small app-get-btn" href="${STORE[dev]}" target="_blank" rel="noopener" data-store="${dev}">${STORE_ICONS[dev]}<span>${t('app_download')}</span></a>`;
  return `<details class="app-get"><summary class="btn small app-get-btn">${ico(ICONS.phone, 18)}<span>${t('app_download')}</span></summary><div class="app-get-menu" role="group" aria-label="${t('app_choose')}">${storeBadge('ios')}${storeBadge('android')}</div></details>`;
}
// 2026-11-07: the five things METON does for a business, each shown with its real app screen
// [tab id, screen, icon, words]. "online", "sched", "cust", "staff", "org" have their own titles; the copy of the last
// four is the earlier tour's (sc_schedule_*, sc_clients_*, sc_team_*, sc_dashboard_*).
const BENEFITS = [['online', 'book', 'calendar', 'online'], ['sched', 'schedule', 'clock', 'schedule'], ['cust', 'clients', 'user', 'clients'], ['staff', 'team', 'users', 'team'], ['org', 'dashboard', 'grid', 'dashboard']];
// A screen in its device: a phone (390×844) or an iPad in landscape (1180×820). Tapping it opens the large picture.
// priority: 'high' for the hero, 'low' for pictures loaded at once but after it (the phone's sideways steps, which
// lazy loading would only fetch mid-swipe), none = lazy.
function framed(id, alt, { tablet = false, priority, sizes } = {}) {
  const f = `/assets/img/showcase/${id}-${lang}`, widths = tablet ? [640, 1280, 1920] : [360, 720], [w, h] = tablet ? [640, 445] : [360, 779];
  return `<button type="button" class="sc-device ${tablet ? 'sc-tablet' : 'sc-phone'}" data-zoom="${f}-${widths.at(-1)}.webp" data-kind="${tablet ? 'tablet' : 'phone'}" data-alt="${esc(alt)}" aria-label="${esc(t('sc_zoom') + ': ' + alt)}">`
    + `<span class="sc-bezel"><span class="sc-screen"><img src="${f}-${widths[tablet ? 1 : 0]}.webp" srcset="${widths.map(x => `${f}-${x}.webp ${x}w`).join(', ')}" sizes="${sizes}" width="${w}" height="${h}" alt="${esc(alt)}" decoding="async"${priority ? ` fetchpriority="${priority}"` : ' loading="lazy"'}></span></span>`
    + `<span class="sc-zoom-hint" aria-hidden="true">${ico(ICONS.zoom, 16)}</span></button>`;
}
// ---- Home (2026-11-07) ----------------------------------------------------------------------------------------
// One clear story: what METON is for (any business that works with appointments), the sectors it serves, the five
// things it does (with the real app screens), the two free demos, how to go live, the prices, help.
function home() {
  const c = state.catalog;
  const active = BENEFITS.some(([id]) => id === tourTab()) ? tourTab() : 'online';
  const build = `<a class="btn primary" href="/try/business">${t('hm2_cta_build')}</a>`;
  const book = `<a class="btn" href="/try/customer">${t('hm2_cta_book')}</a>`;
  const tabs = `<div class="sc-tabs hm2-tabs" role="tablist" aria-label="${t('hm2_features_title')}" data-tour-tabs>${BENEFITS.map(([id, , icon]) => `<button type="button" role="tab" class="sc-tab" id="tab-${id}" data-tab="${id}" aria-controls="tour-${id}" aria-selected="${id === active}" tabindex="${id === active ? 0 : -1}">${ico(ICONS[icon], 18)}<span>${t('sc_t_' + id)}</span></button>`).join('')}</div>`;
  const panels = `<div class="sc-panels">${BENEFITS.map(([id, shot, , words]) => `<div class="sc-panel${id === active ? ' is-active' : ''}" id="tour-${id}" role="tabpanel" aria-labelledby="tab-${id}">
    <div class="sc-panel-shot">${framed(shot, t(shot === 'book' ? 'sc_alt_book' : 'sc_' + words + '_alt'), { sizes: '(max-width: 900px) 64vw, 280px' })}</div>
    <div class="sc-panel-copy"><h3>${t('sc_' + words + '_h')}</h3><p>${t('sc_' + words + '_p')}</p>
      <ul class="check-list">${[1, 2, 3].map(i => `<li><span class="ck">${checkSvg}</span><span>${t('sc_' + words + '_' + i)}</span></li>`).join('')}</ul></div></div>`).join('')}</div>`;
  const sectors = SECTORS.map(k => `<li><a class="hm2-sector" href="/try/business?category=${k.key}"><span class="hm2-sector-ico">${ico(k.icon, 24)}</span><b>${esc(pick3(k.name, lang))}</b><small>${esc(pick3(k.examples, lang))}</small><span class="hm2-sector-go">${t('hm2_sector_go')}<span aria-hidden="true">${lang === 'en' ? '→' : '←'}</span></span></a></li>`).join('');
  const prices = c ? `<section class="hm-section hm-tint" id="prices" aria-labelledby="prices-title"><div class="wrap"><div class="hm-head"><h2 id="prices-title">${t('bd_title')}</h2><p>${t('bd_lead')}</p></div>
    <div class="hm-currency">${currencySwitch()}</div>
    <ul class="hm-plans">${c.plans.map(p=>{ const price = priceOf(p.prices); return `<li class="hm-plan${p.id==='pro'?' is-popular':''}"><div class="hm-plan-top"><h3>${esc(p.name)}</h3>${p.id==='pro'?`<span class="tag">${t('popular')}</span>`:''}</div>
      <p class="hm-price">${price===null?t('byAgreement'):shownPrice(price, ` <small>${t('monthly')}</small>`)}</p><p class="hm-plan-desc">${t(p.id+'Desc')}</p>
      <a class="btn${p.id==='pro'?' primary':''} full" href="/apply?plan=${p.id}" aria-label="${t(p.id==='enterprise'?'contactUs':'startNow')} · ${esc(p.name)}">${t(p.id==='enterprise'?'contactUs':'startNow')}</a></li>`; }).join('')}</ul>
    ${fxNote()}<p class="hm-note">${t('pricesNote')} <a class="text-link" href="/plans">${t('bd_all')}</a> · <a class="text-link" href="/plans#finder">${esc(finderLink(lang))}</a></p></div></section>` : '';
  const tryCard = (href, img, tablet, title, text, cta) => `<a class="hm2-try-card" href="${href}"><span class="hm2-try-shot${tablet ? ' is-tablet' : ''}"><img src="/assets/img/showcase/${img}-${lang}-${tablet ? 640 : 360}.webp" alt="" loading="lazy" decoding="async"></span><span class="hm2-try-copy"><b>${t(title)}</b><span>${t(text)}</span><span class="btn primary small">${t(cta)}</span></span></a>`;
  return `<div class="home sc-home hm2">
  <section class="sc-hero hm2-hero" aria-labelledby="hm-title"><div class="wrap sc-hero-grid">
    <div class="sc-hero-copy sc-reveal" data-r="hero-copy">
      <p class="sc-kicker">${t('hm2_kicker')}</p>
      <h1 id="hm-title">${t('hm2_title')}</h1><p class="sc-lead">${t('hm2_lead')}</p>
      <div class="hero-actions">${build}${book}<a class="text-link" href="${c ? '#prices' : '/plans'}">${t('hm2_cta_plans')}</a></div>
      <div class="hm-app"><span class="hm-app-ico" aria-hidden="true">${ico(ICONS.phone, 20)}</span><div class="hm-app-copy"><b>${t('app_hero_title')}</b><span>${t('app_hero_text')}</span></div>${appGet()}</div>
      <ul class="hm-points">${['hm2_point1','hm_point1'].map(k=>`<li><span class="ck">${checkSvg}</span>${t(k)}</li>`).join('')}</ul></div>
    <figure class="sc-hero-visual sc-reveal" data-r="hero-visual">
      <div class="sc-stage">${framed('tablet-schedule', t('sc_ipad_alt'), { tablet: true, priority: 'high', sizes: '(max-width: 900px) 84vw, 640px' })}${framed('book', t('sc_alt_book'), { priority: 'high', sizes: '(max-width: 900px) 25vw, 180px' })}</div>
      <figcaption class="sc-note">${t('sc_note')}</figcaption></figure></div></section>
  <section class="hm-section hm2-sectors" id="sectors" aria-labelledby="sectors-title"><div class="wrap">
    <div class="hm-head sc-reveal" data-r="sectors-head"><h2 id="sectors-title">${t('hm2_sectors_title')}</h2><p>${t('hm2_sectors_lead')}</p></div>
    <ul class="hm2-sector-grid">${sectors}</ul></div></section>
  <section class="hm-section hm-tint sc-tour" id="features" aria-labelledby="tour-title"><div class="wrap">
    <div class="hm-head sc-reveal" data-r="tour-head"><h2 id="tour-title">${t('hm2_features_title')}</h2><p>${t('hm2_features_lead')}</p></div>
    <div class="sc-reveal" data-r="tour-body">${tabs}${panels}</div></div></section>
  <section class="hm-section hm-app-sec" id="get-the-app" aria-labelledby="app-title"><div class="wrap">
    <div class="hm-head"><h2 id="app-title">${t('app_sec_title')}</h2><p>${t('app_sec_lead')}</p></div>
    <div class="hm-app-cols">${[['web', ICONS.globe], ['app', ICONS.phone]].map(([k, icon]) => `<div class="hm-app-col is-${k}"><h3><span class="hm-app-ico" aria-hidden="true">${ico(icon, 20)}</span>${t('app_' + k + '_h')}</h3><ul class="check-list">${[1, 2, 3].map(i => `<li><span class="ck">${checkSvg}</span><span>${t('app_' + k + '_' + i)}</span></li>`).join('')}</ul>${k === 'app' ? `<div class="store-row">${storeBadges()}</div>` : ''}</div>`).join('')}</div></div></section>
  <section class="hm-section hm2-try" id="try" aria-labelledby="try-title"><div class="wrap">
    <div class="hm-head sc-reveal" data-r="try-head"><h2 id="try-title">${t('hm2_try_title')}</h2><p>${t('hm2_try_lead')}</p></div>
    <div class="hm2-try-grid">${tryCard('/try/customer', 'requested', false, 'hm2_cta_book', 'hm2_tryA_text', 'hm2_tryA_cta')}${tryCard('/try/business', 'tablet-dashboard', true, 'hm2_cta_build_short', 'hm2_tryB_text', 'hm2_tryB_cta')}</div></div></section>
  <section class="hm-section hm-tint" aria-labelledby="steps-title"><div class="wrap"><div class="hm-head"><h2 id="steps-title">${t('hm2_how_title')}</h2></div>
    <ol class="hm-steps">${[1,2,3].map(n=>`<li><span class="hm-num" aria-hidden="true">${n}</span><h3>${t('hm2_step'+n)}</h3><p>${t('hm2_step'+n+'_text')}</p></li>`).join('')}</ol>
    <div class="hm2-how-cta">${build}</div></div></section>
  ${prices}
  <section class="hm-section sc-help" aria-labelledby="help-title"><div class="wrap"><div class="hm-box sc-help-box">
    <div><h2 id="help-title">${t('hm_help_title')}</h2><p>${t('hm_help_text')}</p></div>
    <div class="hero-actions"><a class="btn" href="/support">${t('support')}</a><a class="text-link" href="mailto:support@meton.work" dir="ltr">support@meton.work</a></div></div></div></section>
  <dialog class="sc-lightbox" id="sc-lightbox" aria-label="${t('sc_zoom')}"><button type="button" class="sc-lb-close" data-close aria-label="${t('sc_close')}">${ico('<path d="M6 6l12 12M18 6 6 18"/>', 22)}</button><img alt=""></dialog>
</div>`;
}
// 2.46: one sign-in for the METON account (the same as in the app): its email or its phone number, and the password.
// Nobody chooses "customer" or "business": what the account can open comes from its businesses and roles.
function loginPhoneField() {
  const guess = dialCodeOf(dialGuess()) ? dialGuess() : '';
  return `<div class="field full-span"><label for="phone">${t('phoneNumber')}</label><div class="phone-field">${countryPicker(pickerOptions({name:'phoneCountry',mode:'dial',value:guess,label:t('countryCode')}))}<input id="phone" name="phone" type="tel" inputmode="tel" autocomplete="username" maxlength="24" required aria-describedby="phone-error" dir="ltr"></div><small id="phone-error" class="field-error" aria-live="polite"></small></div>`;
}
const signInWith = (by, attrs = '') => `<div class="segmented login-by" role="group" aria-label="${t('signInWith')}"${attrs}>${['email','phone'].map(k=>`<button type="button" data-by="${k}" aria-pressed="${by===k}">${t(k==='email'?'byEmail':'byPhone')}</button>`).join('')}</div>`;
function login() {
  if (state.signinStep) return signinStepView(state.signinStep);
  const q = new URLSearchParams(location.search), by = state.loginBy === 'phone' ? 'phone' : 'email', g = q.get('google');
  const note = g === 'password' ? `<p class="notice info">${t('googleNeedsPassword')}</p>` : g === 'failed' ? `<p class="notice warning">${t('googleFailed')}</p>` : '';
  const prefill = by === 'email' && q.get('email') ? ` value="${esc(q.get('email'))}"` : '';
  return `<div class="auth-split">${authIntro('welcome','loginLead')}<div class="auth-form"><section class="auth-card"><h2>${t('login')}</h2>${q.has('next')?`<p class="notice info">${t('loginRequired')}</p>`:''}${note}${signInWith(by, ' data-login-by')}<form id="login-form" novalidate data-by="${by}">${formErrorBox()}${by==='email'?field('email','email',{type:'email',autocomplete:'username',maxlength:254,placeholder:'you@example.com',extra:`spellcheck="false" autocapitalize="off"${prefill}`}):loginPhoneField()}${field('password','password',{type:'password',autocomplete:'current-password',maxlength:128})}<div class="login-help"><a class="text-link" href="/forgot">${t('forgot')}</a></div><button class="btn primary full" type="submit">${t('login')}</button>${state.google?`<a class="btn full google-btn" href="/auth/google">${t('withGoogle')}</a>`:''}</form><p class="small-note login-one">${t('loginOneAccount')}</p><p class="auth-footer">${t('noAccount')} <a href="/register" class="text-link">${t('register')}</a></p></section></div></div>`;
}
// One more step before the website opens: an account with a phone only adds an email (billing and the website's emails
// need one); an email a website user from before has is confirmed by the account first. A 6-digit code by email.
function signinStepView(s) {
  const confirm = s.step === 'confirm', sent = confirm || s.sent;
  return `<div class="auth-split">${authIntro('welcome','loginLead')}<div class="auth-form"><section class="auth-card"><h2>${t(confirm?'confirmEmailTitle':'addEmailTitle')}</h2><p>${t(confirm?'confirmEmailLead':'addEmailLead')}</p>
    ${sent?`<p class="notice info">${t('codeSentTo')} <b dir="ltr">${esc(s.email)}</b></p>`:''}
    <form id="signin-step-form" novalidate>${formErrorBox()}${sent?field('code','codeLabel',{maxlength:6,autocomplete:'one-time-code',extra:'inputmode="numeric" dir="ltr"'}):field('email','email',{type:'email',autocomplete:'username',maxlength:254,placeholder:'you@example.com',extra:'spellcheck="false" autocapitalize="off"'})}
    <button class="btn primary full" type="submit">${t(sent?'confirmAndSignIn':'sendCode')}</button>
    ${sent?`<div class="step-links"><button type="button" class="text-link" data-step-resend>${t('resendCode')}</button>${confirm?'':`<button type="button" class="text-link" data-step-change>${t('changeEmail')}</button>`}</div>`:''}</form>
    <p class="auth-footer"><button type="button" class="text-link" data-step-cancel>${t('backToSignIn')}</button></p></section></div></div>`;
}
// Dialing country guess from the time zone, used only to preselect the phone code (the account country is never guessed).
function dialGuess() {
  let tz = ''; try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch {}
  return {'Asia/Hebron':'PS','Asia/Gaza':'PS','Asia/Jerusalem':'IL','Asia/Tel_Aviv':'IL','Asia/Amman':'JO','Asia/Riyadh':'SA','Asia/Dubai':'AE','Africa/Cairo':'EG','Europe/Istanbul':'TR','Asia/Beirut':'LB','Asia/Qatar':'QA','Asia/Kuwait':'KW','Asia/Bahrain':'BH','Asia/Muscat':'OM','Asia/Baghdad':'IQ','Asia/Damascus':'SY','Africa/Casablanca':'MA','Africa/Tunis':'TN','Africa/Algiers':'DZ','Europe/London':'GB','Europe/Berlin':'DE','Europe/Paris':'FR','America/New_York':'US','America/Chicago':'US','America/Los_Angeles':'US'}[tz] || '';
}
const dialCodeOf = code => { try { return phoneLib?.getCountryCallingCode(code) ?? null; } catch { return null; } };
const PINNED = ['PS','IL','JO','SA','AE','EG'];
// An ID number is asked only for salons in these countries (the server applies the same rule).
const ID_COUNTRIES = ['IL','PS'];
const needsId = country => ID_COUNTRIES.includes(country);
function pickerOptions(extra) { return { t, esc, lang, countryName, dialCodeOf, ...extra }; }
// Phone with a country-code picker (the code starts at the given country).
function phoneField(country) {
  return `<div class="field full-span"><label for="phone">${t('bizPhoneOptional')}</label><div class="phone-field">${countryPicker(pickerOptions({name:'phoneCountry',mode:'dial',value:dialCodeOf(country)?country:(dialCodeOf(dialGuess())?dialGuess():''),label:t('countryCode')}))}<input id="phone" name="phone" type="tel" inputmode="tel" autocomplete="tel-national" maxlength="24" aria-describedby="phone-hint phone-error" dir="ltr"></div><small id="phone-hint">${t('salonPhoneHint')}</small><small id="phone-error" class="field-error" aria-live="polite"></small></div>`;
}
// The person's gender (male / female); it describes the account holder, not a salon.
function genderField(value='') {
  return `<fieldset class="field full-span gender-field"><legend>${t('gender')}</legend><div class="radio-options">${['male','female'].map(g=>`<label class="radio-option"><input type="radio" name="gender" value="${g}" required aria-describedby="gender-error"${value===g?' checked':''}><span>${t('gender_'+g)}</span></label>`).join('')}</div><small id="gender-error" class="field-error" aria-live="polite"></small></fieldset>`;
}
function accountFields(prefix='') {
  return `${prefix}<div class="form-section"><h2>${t('accountDetails')}</h2><div class="form-grid">${field('fullName','fullName',{autocomplete:'name',maxlength:100,full:true,placeholder:t('fullName')})}${genderField()}${field('email','email',{type:'email',autocomplete:'username',maxlength:254,placeholder:'you@example.com',full:true,extra:'spellcheck="false" autocapitalize="off" inputmode="email"'})}
  ${field('password','password',{type:'password',autocomplete:'new-password',maxlength:128,hint:'passwordHint'})}${field('passwordConfirm','passwordConfirm',{type:'password',autocomplete:'new-password',maxlength:128})}<div class="pw-meter full-span" id="pw-meter" data-score="0" aria-hidden="true"><i></i><i></i><i></i><i></i><span></span></div></div>
  <div class="field" style="margin-top:20px"><label for="country-btn">${t('country')}</label>${countryPicker(pickerOptions({name:'country',mode:'country',value:'',label:t('country'),describedBy:'country-hint country-error'}))}<small id="country-hint">${t('countryLockedHint')}</small><small id="country-error" class="field-error" aria-live="polite"></small></div></div>
  <div class="hp" aria-hidden="true"><label>Website <input name="website" tabindex="-1" autocomplete="off"></label></div>`;
}
function register() {
  // Back from Google with an email that has no account yet: confirm a few details (no password needed).
  const g = state.googleSignup;
  if (g) return `<div class="auth-split">${authIntro('registerTitle','googleSignupLead')}<div class="auth-form"><section class="auth-card"><h2>${t('googleSignupTitle')}</h2><form id="google-signup-form" novalidate>${formErrorBox()}
    <p class="google-email">${t('signInEmail')}: <b dir="ltr">${esc(g.email)}</b> <span class="google-verified">${t('googleVerified')}</span></p>
    <div class="form-grid">${field('fullName','fullName',{autocomplete:'name',maxlength:100,full:true,placeholder:t('fullName'),extra:`value="${esc(g.name||'')}"`})}${genderField()}</div>
    <div class="field" style="margin-top:16px"><label for="country-btn">${t('country')}</label>${countryPicker(pickerOptions({name:'country',mode:'country',value:'',label:t('country'),describedBy:'country-hint country-error'}))}<small id="country-hint">${t('countryLockedHint')}</small><small id="country-error" class="field-error" aria-live="polite"></small></div>
    <div class="hp" aria-hidden="true"><label>Website <input name="website" tabindex="-1" autocomplete="off"></label></div>
    <p class="privacy-note">${t('privacyNote')} <a class="text-link" href="/privacy" target="_blank" rel="noopener">${t('privacyPolicy')}</a>.</p><button class="btn primary full" type="submit">${t('register')}</button></form></section></div></div>`;
  return `<div class="auth-split">${authIntro('registerTitle','registerLead')}<div class="auth-form"><section class="auth-card"><h2>${t('register')}</h2>${state.google?`<a class="btn full google-btn" href="/auth/google">${t('withGoogle')}</a><p class="auth-or"><span>${t('orWithEmail')}</span></p>`:''}<form id="register-form" novalidate>${formErrorBox()}${accountFields()}<p class="privacy-note">${t('privacyNote')} <a class="text-link" href="/privacy" target="_blank" rel="noopener">${t('privacyPolicy')}</a>.</p><button class="btn primary full" type="submit">${t('register')}</button></form><p class="auth-footer">${t('haveAccount')} <a href="/login" class="text-link">${t('login')}</a></p></section></div></div>`;
}
function setup() {
  if (!state.setupAvailable) return `<div class="wrap empty-state"><h1>${t('setupDone')}</h1><p>${t('setupDoneText')}</p><a class="btn primary" href="${state.user?'/admin':'/login'}">${t(state.user?'inbox':'login')}</a></div>`;
  return `<div class="auth-split">${authIntro('setupTitle','setupLead')}<div class="auth-form"><section class="auth-card"><h2>${t('setupTitle')}</h2><form id="setup-form" novalidate>${formErrorBox()}${accountFields(`<div class="form-section">${field('setupKey','setupKey',{maxlength:64,autocomplete:'off',hint:'setupKeyHint',extra:'data-ltr spellcheck="false" autocapitalize="off"'})}</div>`)}<button class="btn primary full" type="submit">${t('setupSubmit')}</button></form></section></div></div>`;
}
// What the Plan Finder (assets/plan-finder.js) needs from the page: the live price list and the same price display.
const finderContext = () => ({ lang, esc, t, catalog: state.catalog, interval: state.interval, yearMonths, yearlySaving, shownPrice, shownPriceText, money, trialShown, trialDays });
function plans() {
  const c = state.catalog;
  const finder = planFinder(finderContext());
  return `<div class="plans-page"><div class="wrap page-top">${titleBlock('plansEyebrow','plansTitle','plansLead',false,`<div class="pricing-controls">${intervalSwitch()}${currencySwitch()}</div>${finder?`<a class="text-link pf-jump" href="#finder">${esc(finderLink(lang))}</a>`:''}`)}
  <ol class="menu-rows plan-rows" aria-label="${t('plans')}">${c.plans.map(p=>{ const price = perPeriod(priceOf(p.prices)); return `<li class="menu-row" id="plan-${p.id}"><div class="name"><h3>${esc(p.name)}</h3>${p.id==='pro'?`<span class="tag">${t('popular')}</span>`:''}${trialShown(p.id)?`<span class="trial-badge">${t('trialBadge',{n:trialDays()})}</span>`:''}<span class="leader" aria-hidden="true"></span></div>
    <div class="price">${price===null?t('requestQuote'):shownPrice(price, `<small>${t(state.interval==='year'?'billedYearly':'monthly')}</small>`)}</div>
    <p class="desc">${t(p.id+'Desc')}</p><ul class="features">${p.features.map(f=>`<li>${t(f)}</li>`).join('')}</ul>
    <div class="actions"><a class="btn ${p.id==='pro'?'primary magnetic':''}" href="/apply?plan=${p.id}" aria-label="${t(p.id==='enterprise'?'contactUs':'startNow')} · ${esc(p.name)}">${t(p.id==='enterprise'?'contactUs':'startNow')}</a></div></li>`; }).join('')}</ol>
  ${finder}
  <section class="extras" aria-labelledby="extras-title"><h2 id="extras-title">${t('optionalAddons')}</h2><ol class="menu-rows">${[['loyalty','loyaltyText',priceOf(c.addons.loyalty)],['specialist','specialistText',priceOf(c.addons.specialist)]].map(([name,description,price])=>`<li class="menu-row"><div class="name"><h3>${t(name)}</h3><span class="leader" aria-hidden="true"></span></div><div class="price">${shownPrice(perPeriod(price), `<small>${t(periodKey())}</small>`)}</div><p class="desc">${t(description)}</p></li>`).join('')}</ol></section>
  ${planCompare(c)}
  ${fxNote()}<p class="payment-footnote">${t('pricesNote')} <a class="text-link" href="/terms">${t('termsTitle')}</a> · <a class="text-link" href="/refund">${t('refundTitle')}</a></p></div></div>`;
}
// 2.32: every feature side by side, each with "Show more" — what it does and how it helps a salon,
// in plain words (shared with the app: assets/plans-data.js is generated from the app's plans.js).
function planCompare(c) {
  const L3 = o => (o && (o[lang] || o.en)) || '';
  const W = { title:{ar:'قارن الباقات بالتفصيل',en:'Compare the plans in detail',he:'השוואה מפורטת בין החבילות'},
    lead:{ar:'كل ميزة وماذا تفعل لعملك. اضغط «عرض المزيد» لشرح ومثال.',en:'Every feature and what it does for your business. Tap “Show more” for an explanation and an example.',he:'כל פיצ׳ר ומה הוא עושה לעסק. הקישו ״הצג עוד״ להסבר ודוגמה.'},
    feature:{ar:'الميزة',en:'Feature',he:'פיצ׳ר'}, more:{ar:'عرض المزيد',en:'Show more',he:'הצג עוד'}, price:{ar:'السعر',en:'Price',he:'מחיר'},
    incl:{ar:'مشمولة',en:'Included',he:'כלול'}, no:{ar:'غير مشمولة',en:'Not included',he:'לא כלול'}, opt:{ar:'إضافة اختيارية',en:'Optional add-on',he:'תוספת אופציונלית'},
    custom:{ar:'حسب الاتفاق',en:'Custom',he:'בהתאמה אישית'}, popular:{ar:'الأكثر اختياراً',en:'Most chosen',he:'הנבחר ביותר'},
    noteOpt:{ar:'إضافة Basic الاختيارية: ميزة واحدة — نقاط الولاء أو قائمة الانتظار الذكية',en:'Basic optional add-on: one feature — Loyalty Coins or the Smart waitlist',he:'תוספת אופציונלית ל־Basic: פיצ׳ר אחד — מטבעות נאמנות או רשימת המתנה חכמה'},
    noteSpec:{ar:'مختص إضافي فوق المشمول في Basic وPro',en:'Each specialist above what Basic and Pro include',he:'כל מומחה נוסף מעבר לכלול ב־Basic וב־Pro'} };
  const plans = c.plans.map(p => p.id).filter(id => ['basic','pro','enterprise'].includes(id));
  const cell = (f, plan) => {
    if (f.limit && f.limit[plan]) return `<span class="cmp-lim">${esc(L3(f.limit[plan]))}</span>`;
    if (f.limit && plan === 'enterprise') return `<span class="cmp-yes" aria-label="${esc(L3(W.incl))}">✓</span>`;
    if (f.included === 'all' || plan !== 'basic') return `<span class="cmp-yes" aria-label="${esc(L3(W.incl))}">✓</span>`;
    if (f.included === 'option') return `<span class="cmp-lim">${esc(L3(W.opt))}</span>`;
    return `<span class="cmp-no" aria-label="${esc(L3(W.no))}">—</span>`;
  };
  const priceCell = id => { const p = c.plans.find(x => x.id === id); const v = p ? perPeriod(priceOf(p.prices)) : null;
    return v === null ? `<span class="cmp-lim">${esc(L3(W.custom))}</span>` : `<b>${shownPrice(v)}</b><small>${t(state.interval==='year'?'billedYearly':'monthly')}</small>`; };
  return `<section class="plan-compare" aria-labelledby="cmp-title"><h2 id="cmp-title">${esc(L3(W.title))}</h2><p class="cmp-lead">${esc(L3(W.lead))}</p>
    <div class="cmp-cards">${plans.map(id => `<article class="cmp-card${id==='pro'?' is-popular':''}">${id==='pro'?`<span class="tag">${esc(L3(W.popular))}</span>`:''}<h3>${esc(c.plans.find(x=>x.id===id).name)}</h3><p>${esc(L3(PLAN_SUMMARY[id]))}</p></article>`).join('')}</div>
    <div class="cmp-wrap"><table class="cmp-table"><thead><tr><th scope="col">${esc(L3(W.feature))}</th>${plans.map(id => `<th scope="col">${esc(c.plans.find(x=>x.id===id).name)}</th>`).join('')}</tr></thead><tbody>
      <tr class="cmp-price"><th scope="row">${esc(L3(W.price))}</th>${plans.map(id => `<td data-label="${esc(c.plans.find(x=>x.id===id).name)}">${priceCell(id)}</td>`).join('')}</tr>
      ${PLAN_FEATURES.map(f => `<tr><th scope="row">${esc(L3(f.t))}<details class="cmp-more"><summary>${esc(L3(W.more))}</summary><p>${esc(L3(f.d))}${f.x?`<em>${esc(L3(f.x))}</em>`:''}</p></details></th>${plans.map(id => `<td data-label="${esc(c.plans.find(x=>x.id===id).name)}">${cell(f, id)}</td>`).join('')}</tr>`).join('')}
    </tbody></table></div>
    <ul class="cmp-notes"><li>${esc(L3(W.noteOpt))}: <b><bdi>${esc(shownPriceText(perPeriod(priceOf(c.addons.loyalty))))}</bdi></b> <small>${t(periodKey())}</small></li><li>${esc(L3(W.noteSpec))}: <b><bdi>${esc(shownPriceText(perPeriod(priceOf(c.addons.specialist))))}</bdi></b> <small>${t(periodKey())}</small></li></ul>
  </section>`;
}
// ---- Paddle checkout ----------------------------------------------------------
// Card applications for plans with a Paddle price pay the plan's first month in Paddle's overlay checkout.
// custom_data carries the account ID; the server links the payment to this account only if the emails match.
const checkoutPrice = (plan, interval='month') => state.checkout?.catalog?.[interval]?.[plan] || (interval==='month' ? state.checkout?.prices?.[plan] : null) || null;
const addonPrice = (addon, interval='month') => state.checkout?.catalog?.[interval]?.[addon] || (interval==='month' ? state.checkout?.addons?.[addon] : null) || null;
// The plan plus the add-ons chosen on the application (the server already dropped loyalty for Business/Enterprise
// and extra specialists for Enterprise). An add-on without a Paddle price is left out and billed after review.
// Yearly applications use the yearly prices; a trial application (Pro, first subscription) uses the trial versions,
// so Paddle saves the card now and charges after the trial.
function checkoutItems(a) {
  const interval = a.quote?.interval === 'year' ? 'year' : 'month';
  const trialSet = state.checkout?.catalog?.[interval+'_trial'];
  const trial = a.quote?.trialDays > 0 && state.checkout?.trialEligible && trialSet?.[a.plan] ? trialSet : {};
  const price = key => trial[key] || checkoutPrice(key, interval);
  const items = [{ priceId: price(a.plan), quantity: 1 }];
  if (a.quote?.loyalty && price('loyalty')) items.push({ priceId: price('loyalty'), quantity: 1 });
  if (a.quote?.extraSpecialists > 0 && price('specialist')) items.push({ priceId: price('specialist'), quantity: a.quote.extraSpecialists });
  return items;
}
const canPayOnline = a => a.paymentMethod==='card' && !!checkoutPrice(a.plan, a.quote?.interval==='year'?'year':'month') && !['declined','approved'].includes(a.status) && (a.paymentStatus||'unpaid')==='unpaid';
// Admins can complete any unpaid application for free; afterwards it follows the exact path of a paid one.
const testPayButton = a => state.user?.isAdmin && (a.paymentStatus||'unpaid')==='unpaid' && !['declined','approved'].includes(a.status) ? `<button class="btn outline full" type="button" data-test-pay="${esc(a.id)}">${t('testBuy')}</button><p class="small-note">${t('testBuyNote')}</p>` : '';
let paddleLoading;
// Paddle's overlay matches the site's light or dark theme.
const paddleTheme = () => document.documentElement.dataset.mode==='dark' ? 'dark' : 'light';
// Paddle.js is in the page shell (page.html) and initialized once per page load, as Paddle Retain requires: a signed-in
// owner is identified by their Paddle customer ID so Retain can show card-update prompts. Sign-in and sign-out reload
// the page, so the identity is always current.
function loadPaddle() {
  if (paddleLoading) return paddleLoading;
  paddleLoading = new Promise((resolve,reject)=>{
    const ready = () => {
      try {
        if (state.checkout.environment==='sandbox') window.Paddle.Environment.set('sandbox');
        window.Paddle.Initialize({ token: state.checkout.clientToken, pwCustomer: state.checkout.customerId ? { id: state.checkout.customerId } : {}, eventCallback: event => {
          if (event.name==='checkout.loaded') state.checkoutOpen = true;
          if (event.name==='checkout.closed') { state.checkoutOpen = false; document.getElementById('open-checkout')?.removeAttribute('hidden'); }
          if (event.name==='checkout.completed') paymentCompleted(event.data?.transaction_id || '');
        }});
        resolve(window.Paddle);
      } catch { paddleLoading=null; reject({code:'checkoutUnavailable'}); }
    };
    if (window.Paddle) return ready();
    // The shell's copy is still loading (or was blocked): wait for it, or add one.
    let script = document.querySelector('script[src*="cdn.paddle.com/paddle/v2/paddle.js"]');
    if (!script) { script = document.createElement('script'); script.src = 'https://cdn.paddle.com/paddle/v2/paddle.js'; document.head.appendChild(script); }
    script.addEventListener('load', ready, { once:true });
    script.addEventListener('error', () => { paddleLoading=null; reject({code:'checkoutUnavailable'}); }, { once:true });
  });
  return paddleLoading;
}
// Paddle payment links (/checkout?_ptxn=txn_...): Paddle.js opens the checkout for that transaction by itself once
// initialized on this page. If it hasn't opened after a moment, open it explicitly; closing it shows a Pay button.
const paymentLinkTxn = () => { const t = new URLSearchParams(location.search).get('_ptxn') || ''; return /^txn_[a-z\d]{26}$/.test(t) ? t : ''; };
function paymentLink() {
  const valid = !!paymentLinkTxn();
  return `<div class="narrow empty-state"><h1>${t('payByCard')}</h1><p id="checkout-status" role="status">${t(valid?'openingCheckout':'notFound')}</p><button class="btn primary" type="button" id="open-checkout" hidden>${t('payByCard')}</button></div>`;
}
function openPaymentLinkCheckout(paddle) {
  paddle.Checkout.open({ transactionId: paymentLinkTxn(), settings: { displayMode:'overlay', theme:paddleTheme(), ...(['en','ar'].includes(lang)?{locale:lang}:{}) } });
}
async function startPaymentLink() {
  if (!paymentLinkTxn()) return;
  const status = document.getElementById('checkout-status');
  try {
    const paddle = await loadPaddle();
    status.textContent = '';
    setTimeout(()=>{ if (!state.checkoutOpen) openPaymentLinkCheckout(paddle); }, 2500);
  } catch (error) { status.textContent = t(error.code || 'checkoutUnavailable'); }
}
// A card payment in progress: remembered for 30 minutes so Applications and Account confirm it before they show, even
// if the checkout window was closed or the page left before Paddle finished.
const PAYING_KEY = 'salonieer:paying';
const payingId = () => { try { const p = JSON.parse(sessionStorage.getItem(PAYING_KEY) || 'null'); return p && Date.now() - p.at < 1800000 ? p.id : ''; } catch { return ''; } };
async function checkPayment(id, transactionId = '') {
  const result = await post(`/api/applications/${id}/payment-check`, {transactionId}, null, t('processing'));
  if (result.application && result.application.paymentStatus !== 'unpaid') { try { sessionStorage.removeItem(PAYING_KEY); } catch {} }
  return result.application;
}
// Paddle says the payment went through: confirm it with the server first, then show the applications as they are now.
async function paymentCompleted(transactionId) {
  if (state.billingPaying) {
    state.billingPaying = false;
    try { window.Paddle?.Checkout.close(); } catch {}
    toast(t('cardUpdatedToast'), 'success');
    setTimeout(() => loadRoute({quiet:true, afterAction:true}), 3000);
    return;
  }
  const id = payingId();
  if (!id) return;
  try { await checkPayment(id, transactionId); } catch {}
  try { window.Paddle?.Checkout.close(); } catch {}
  await go('/applications', {force:true});
  toast(t('paymentReceivedToast'), 'success');
}
async function openCheckout(a) {
  if (!checkoutPrice(a.plan, a.quote?.interval==='year'?'year':'month') || !state.user) throw {code:'checkoutUnavailable'};
  try { sessionStorage.setItem(PAYING_KEY, JSON.stringify({id:a.id, at:Date.now()})); } catch {}
  const paddle = await loadPaddle();
  paddle.Checkout.open({
    items: checkoutItems(a),
    customer: { email: state.user.email },
    customData: { salonieer_user_id: state.user.id, application_id: a.id },
    settings: { displayMode:'overlay', theme:paddleTheme(), ...(['en','ar'].includes(lang)?{locale:lang}:{}) }
  });
}
const payButton = a => canPayOnline(a) ? `<button class="btn primary full" type="button" data-pay="${esc(a.id)}">${t('payByCard')}</button><p class="small-note" data-pay-feedback="${esc(a.id)}" role="status"></p>` : '';
function apply() {
  if (state.receipt) return receipt();
  return `<div class="wrap">${titleBlock('selectedPlan','applyTitle','applyLead')}<div class="steps" aria-label="${t('applications')}"><div class="step"><span aria-hidden="true">✓</span>${t('goStep1')}</div><div class="line"></div><div class="step active" aria-current="step"><span>2</span>${t('goStep2')}</div><div class="line"></div><div class="step"><span>3</span>${t('goStep3')}</div></div><div class="application-layout"><form id="application-form" class="application-form" novalidate>${formErrorBox()}<section class="form-panel"><h2>${t('stepDetails')}</h2><div class="form-grid"><div class="field"><label for="country-btn">${t('salonCountry')}</label>${countryPicker(pickerOptions({name:'country',mode:'country',value:state.user.country||'',label:t('salonCountry'),describedBy:'country-hint country-error'}))}<small id="country-hint">${t('salonCountryHint')}</small><small id="country-error" class="field-error" aria-live="polite"></small></div>${field('identityNumber','identityNumber',{maxlength:64,autocomplete:'off',hint:'idHint',extra:`data-ltr spellcheck="false" inputmode="numeric"${needsId(state.user.country)?'':' disabled'}`,wrap:`id="identity-field"${needsId(state.user.country)?'':' hidden'}`})}${field('salonName','salonName',{minlength:2,maxlength:100,autocomplete:'organization'})}<div class="field"><label for="teamComposition">${t('teamComposition')}</label><select id="teamComposition" name="teamComposition" required><option value="">${t('chooseOne')}</option>${TEAM_COMPOSITIONS.map(c=>`<option value="${c}">${t('team_'+c)}</option>`).join('')}</select></div><div class="field"><label for="clientele">${t('clientele')}</label><select id="clientele" name="clientele" required><option value="">${t('chooseOne')}</option>${CLIENTELES.map(c=>`<option value="${c}">${t('clientele_'+c)}</option>`).join('')}</select><small>${t('salonCategoryHint')}</small></div><div class="field"><label for="timezone">${t('timezone')}</label><select id="timezone" name="timezone" required dir="ltr">${timezoneOptions('', state.user.country)}</select><small>${t('timezoneHint')}</small></div>${phoneField(state.user.country)}</div><div class="field"><label for="logo">${t('logo')}</label><div class="upload"><span id="upload-symbol" class="upload-symbol" aria-hidden="true"${state.logo?' hidden':''}>＋</span><img id="logo-preview" class="logo-preview" alt="${t('logo')}"${state.logo?` src="${state.logo}"`:' hidden'}><div class="upload-text"><strong id="upload-title">${t(state.logo?'replaceLogo':'uploadTitle')}</strong><small>${t('uploadHint')}</small><small id="logo-filename" class="upload-filename">${esc(state.logoName)}</small></div><input id="logo" name="logo" type="file" accept="image/png,image/jpeg,image/webp" aria-describedby="logo-error"></div><small id="logo-error" class="field-error"></small></div></section><section class="form-panel"><div class="panel-head"><h2>${t('selectedPlan')}</h2>${currencySwitch()}</div><div class="field"><label for="plan">${t('plans')}</label><select id="plan" name="plan" required>${state.catalog.plans.map(p=>`<option value="${p.id}">${p.name} · ${esc(shownPriceText(perPeriod(priceOf(p.prices))))}${priceOf(p.prices)===null?'':' '+t(periodKey())}</option>`).join('')}</select></div><div class="field"><span class="field-label" id="interval-label">${t('billingPeriod')}</span>${intervalSwitch()}</div><p class="included-note" id="included-loyalty" hidden><span aria-hidden="true">✓</span>${t('everyFeatureIncluded')}</p><div class="field" id="loyalty-control"><label for="basicOption">${t('basicOption')} <small class="muted">· <bdi>${esc(shownPriceText(perPeriod(priceOf(state.catalog.addons.loyalty))))}</bdi> ${t(periodKey())}</small></label><select id="basicOption" name="basicOption"><option value="">${t('optNone')}</option><option value="loyalty">${t('optLoyalty')}</option><option value="smart_waitlist">${t('optWaitlist')}</option></select><small>${t('basicOptionHint')}</small></div><div class="quantity-field" id="specialist-control"><label for="extraSpecialists">${t('extraSpecialists')}<br><small class="muted"><bdi>${esc(shownPriceText(perPeriod(priceOf(state.catalog.addons.specialist))))}</bdi> ${t(periodKey())}</small></label><input id="extraSpecialists" name="extraSpecialists" type="number" min="0" max="50" step="1" value="0" inputmode="numeric"></div><p class="included-note" id="unlimited-note" hidden><span aria-hidden="true">✓</span>${t('unlimitedSpecialists')}</p></section><section class="form-panel"><fieldset><legend>${t('payment')}</legend><div class="radio-options"><label class="radio-option"><input type="radio" name="paymentMethod" value="card" required><span>${t('card')}</span></label><label class="radio-option"><input type="radio" name="paymentMethod" value="bank_transfer" required><span>${t('bank_transfer')}</span></label></div><p class="payment-note" id="payment-note">${t('noCharge')}</p><label class="trial-option" id="trial-control" hidden><input type="checkbox" id="trial" name="trial"><span><b id="trial-title">${t('trialOptIn',{n:trialDays()})}</b><small>${t('trialOptInHint',{n:trialDays()})}</small></span></label></fieldset></section><p class="privacy-note">${t('privacyNote')} <a href="/privacy" target="_blank" rel="noopener" class="text-link">${t('privacyPolicy')}</a>.</p><p class="privacy-note">${t('agreeNote')} <a href="/terms" target="_blank" rel="noopener" class="text-link">${t('termsTitle')}</a> · <a href="/refund" target="_blank" rel="noopener" class="text-link">${t('refundTitle')}</a>.</p><button class="btn primary full form-submit" type="submit">${t('submit')}</button></form><aside class="order-summary" id="order-summary" aria-live="polite"></aside></div></div>`;
}
function selectedQuote() {
  const form = document.getElementById('application-form');
  const plan = state.catalog.plans.find(p=>p.id===form.elements.plan.value);
  const includes = plan.id !== 'basic';
  const option = includes ? '' : form.elements.basicOption.value;
  const loyalty = !!option;
  const count = plan.id === 'enterprise' ? 0 : Math.max(0,Math.min(50,Number(form.elements.extraSpecialists.value)||0));
  const base = perPeriod(priceOf(plan.prices)), loyaltyPrice = perPeriod(priceOf(state.catalog.addons.loyalty)), specialistPrice = perPeriod(priceOf(state.catalog.addons.specialist));
  return { plan, base, loyalty, option, count, loyaltyPrice, specialistPrice, total:base===null?null:base+(loyalty?loyaltyPrice:0)+count*specialistPrice };
}
function syncApplication() {
  const form = document.getElementById('application-form');
  if (!form) return;
  const plan = form.elements.plan.value;
  const includes = plan !== 'basic';
  document.getElementById('loyalty-control').hidden = includes;
  document.getElementById('included-loyalty').hidden = !includes;
  form.elements.basicOption.disabled = includes;
  if (includes) form.elements.basicOption.value = '';
  form.elements.extraSpecialists.disabled = plan === 'enterprise';
  if (plan === 'enterprise') form.elements.extraSpecialists.value = 0;
  document.getElementById('specialist-control').hidden = plan === 'enterprise';
  document.getElementById('unlimited-note').hidden = plan !== 'enterprise';
  const payment = form.elements.paymentMethod.value;
  const q = selectedQuote();
  const online = payment==='card' && !!checkoutPrice(q.plan.id, state.interval);
  // The trial is a separate, optional choice: unticked (the default) means subscribing to the plan right away.
  const trialOffered = online && trialShown(q.plan.id);
  const trialControl = document.getElementById('trial-control');
  trialControl.hidden = !trialOffered;
  if (!trialOffered) form.elements.trial.checked = false;
  const trial = trialOffered && form.elements.trial.checked;
  document.getElementById('payment-note').textContent = t(payment==='card'?(online?'cardNote':'cardLaterNote'):payment==='bank_transfer'?'bankNote':'noCharge');
  document.getElementById('order-summary').innerHTML = `<h2>${t('summary')}</h2><div class="summary-plan"><h3>${q.plan.name}</h3><a href="/plans" class="text-link">${t('backPlans')}</a></div><div class="summary-row"><span>${q.plan.name}</span><span><bdi>${money(q.base)}</bdi></span></div>${q.loyalty?`<div class="summary-row"><span>${t(q.option==='smart_waitlist'?'optWaitlist':'optLoyalty')}</span><span><bdi>${money(q.loyaltyPrice)}</bdi></span></div>`:''}${q.count?`<div class="summary-row"><span>${t('extraSpecialists')} × ${q.count}</span><span><bdi>${money(q.count*q.specialistPrice)}</bdi></span></div>`:''}<div class="summary-total"><span class="label">${q.total===null?t('requestQuote'):t(totalKey())}</span>${priceHTML(q.total)}${q.total===null?'':`<p class="small-note">${t(periodKey())} · ${t('fxCharged')}</p>${approxLine(q.total)}`}</div>${trial?`<p class="notice success trial-note">${t('trialSummary',{n:trialDays()})}</p>`:''}<p class="summary-contact">${t('contactDetails')}<br><strong class="ltr">${esc(state.user.email)}</strong></p><div class="section-divider"></div><p class="small-note">${online?t('checkoutPriceNote')+((q.loyalty&&!addonPrice('loyalty',state.interval))||(q.count&&!addonPrice('specialist',state.interval))?' '+t('addonsLaterNote'):''):t('noCharge')}</p>`;
}
// Payment and approval state, in the customer's words: paid or not, and "awaiting approval (within a day)" once paid.
function paymentBadge(a) {
  const status = a.paymentStatus || 'unpaid';
  return `<span class="status ${paidStatus(a)?'approved':status==='refunded'?'declined':'needs_info'}">${t('pay_'+status)}</span>`;
}
function statusBadge(a) {
  return a.awaitingApproval ? `<span class="status in_review">${t('awaitingApproval')}</span>` : `<span class="status ${esc(a.status)}">${t(a.status)}</span>`;
}
function stateNote(a) {
  if (a.status==='approved') return `<p class="notice success">${t('approvedNote')} <a class="text-link" href="/account">${t('openAccount')}</a></p>`;
  if (a.status==='declined') return '';
  if (a.awaitingApproval) return `<p class="notice info">${t('awaitingApprovalNote')}</p>`;
  if (a.status==='needs_info') return `<p class="notice warning">${t('needsInfoNote')}</p>`;
  if (!paidStatus(a)) return `<p class="notice info">${t(a.paymentMethod==='card'?'unpaidCardNote':'unpaidBankNote')}</p>`;
  return '';
}
function thread(a, admin=false) {
  const list = (a.messages||[]).filter(m=>admin||m.direction!=='system');
  const who = m => m.direction==='in' ? (admin ? (m.author || t('customer')) : t('you')) : m.direction==='out' ? 'METON' : t('system');
  const open = !['approved','declined'].includes(a.status) || admin;
  if (!list.length && !open) return '';
  return `<section class="thread" aria-label="${t('messages')}"><h3>${t('messages')}</h3>${list.length?`<ol class="thread-list" data-paginate="thread-${esc(a.id)}" data-paginate-start="last">${list.map(m=>`<li class="msg ${m.direction}"><div class="msg-head"><b>${esc(who(m))}</b><time>${date(m.createdAt)}</time></div><p>${esc(m.body)}</p></li>`).join('')}</ol>`:`<p class="small-note">${t('noMessages')}</p>`}
    ${open&&!admin?`<form class="reply-form" data-reply="${esc(a.id)}"><label for="reply-${esc(a.id)}">${t('yourReply')}</label><textarea id="reply-${esc(a.id)}" name="body" rows="3" maxlength="5000" required></textarea><button class="btn small" type="submit">${t('sendReply')}</button><span class="status-feedback" role="status"></span></form>`:''}</section>`;
}
function receipt() {
  const a = state.receipt;
  return `<div class="wrap"><section class="receipt" tabindex="-1"><div class="receipt-check" aria-hidden="true">✓</div><h1>${t('receivedTitle')}</h1><p>${t('receivedLead')}</p><div class="reference-box"><span class="label">${t('reference')}</span><strong dir="ltr">${esc(a.id)}</strong></div><div class="summary-row"><span>${t('salonName')}</span><span>${esc(a.salonName)}</span></div><div class="summary-row"><span>${t('selectedPlan')}</span><span>${esc(a.plan[0].toUpperCase()+a.plan.slice(1))}</span></div><div class="summary-row"><span>${t(totalKey(a.quote.interval))}</span><span><bdi>${money(a.quote.total,a.quote.currency||'ILS')}</bdi></span></div>${a.quote.trialDays?`<p class="notice success trial-note">${t('trialSummary',{n:a.quote.trialDays})}</p>`:''}<div class="summary-row"><span>${t('payment')}</span><span>${t(a.paymentMethod)} · ${paymentBadge(a)}</span></div><div class="summary-row"><span>${t('status')}</span><span>${statusBadge(a)}</span></div>${stateNote(a)}${payButton(a)}${testPayButton(a)}<a class="btn ${canPayOnline(a)?'':'primary '}full" href="/account">${t('viewApplications')}</a></section></div>`;
}
function adminActions(a) {
  if (a.status==='approved') return a.salon ? `<p class="notice success">${t('salonCreated')}: <b>${esc(a.salon.name)}</b> · <bdi>${esc(a.salon.accessCode)}</bdi> · <bdi>${esc(a.salon.slug)}</bdi></p>` : '';
  if (a.status==='declined') return '';
  const paid = paidStatus(a);
  return `<div class="admin-actions" data-admin="${esc(a.id)}">
    ${!paid?`<div class="admin-row">${a.paymentMethod==='bank_transfer'?`<input class="input-inline" name="reference" data-ref-for="${esc(a.id)}" placeholder="${t('transferRef')}" maxlength="120" dir="ltr"><button class="btn small" type="button" data-mark-paid="${esc(a.id)}">${t('markPaid')}</button>`:`<span class="small-note">${t('waitingCard')}</span>`}<button class="btn small outline" type="button" data-test-pay="${esc(a.id)}">${t('testBuy')}</button></div>`:''}
    <form class="admin-note" data-note="${esc(a.id)}"><label for="note-${esc(a.id)}">${t('messageToCustomer')}</label><textarea id="note-${esc(a.id)}" name="note" rows="3" maxlength="5000"></textarea>
      <div class="admin-row"><button class="btn small" type="submit" data-action="message">${t('sendMessage')}</button><button class="btn small" type="submit" data-action="needs_info">${t('askInfo')}</button><button class="btn small" type="submit" data-action="in_review">${t('in_review')}</button><button class="btn small danger" type="submit" data-action="declined">${t('decline')}</button></div><span class="status-feedback" role="status"></span></form>
    <details class="approve-box"${paid?' open':''}><summary>${t('approveCreate')}</summary>${paid?'':`<p class="notice warning">${t('approveNeedsPayment')}</p>`}
      <form class="approve-form form-grid" data-approve="${esc(a.id)}"><div class="field"><label for="slug-${esc(a.id)}">${t('slug')}</label><input id="slug-${esc(a.id)}" name="slug" dir="ltr" pattern="[a-z][a-z0-9]{1,23}" value="${esc(a.proposedSlug||'')}" placeholder="${t('auto')}"></div><div class="field"><label for="code-${esc(a.id)}">${t('salonCode')}</label><input id="code-${esc(a.id)}" name="accessCode" dir="ltr" pattern="[A-Za-z0-9_-]{4,32}" value="${esc(a.proposedCode||'')}" placeholder="${t('auto')}"></div>
      <div class="field"><label for="team-${esc(a.id)}">${t('teamComposition')}</label><select id="team-${esc(a.id)}" name="teamComposition" required>${a.teamComposition?'':`<option value="">${t('chooseOne')}</option>`}${TEAM_COMPOSITIONS.map(c=>`<option value="${c}"${a.teamComposition===c?' selected':''}>${t('team_'+c)}</option>`).join('')}</select></div><div class="field"><label for="clientele-${esc(a.id)}">${t('clientele')}</label><select id="clientele-${esc(a.id)}" name="clientele" required>${a.clientele?'':`<option value="">${t('chooseOne')}</option>`}${CLIENTELES.map(c=>`<option value="${c}"${a.clientele===c?' selected':''}>${t('clientele_'+c)}</option>`).join('')}</select></div><div class="field"><label for="tz-${esc(a.id)}">${t('timezone')}</label><input id="tz-${esc(a.id)}" name="timezone" dir="ltr" value="${esc(a.timezone||'')}"></div>
      <div class="field full-span"><label for="owner-${esc(a.id)}">${t('ownerLoginPhone')}</label><input id="owner-${esc(a.id)}" name="ownerPhone" dir="ltr" inputmode="tel" value="${esc(a.ownerPhone||'')}"><small>${t('ownerLoginPhoneHint')}</small></div>
      <button class="btn primary full full-span" type="submit"${paid?'':' disabled'}>${t('approveCreate')}</button><span class="status-feedback full-span" role="status"></span></form></details></div>`;
}
function applicationCard(a,admin=false) {
  return `<article class="application-card" id="app-${esc(a.id)}"><div class="application-card-top"><img src="${esc(a.logoUrl)}" alt="${t('logo')}: ${esc(a.salonName)}" class="logo-preview"><div><h2>${esc(a.salonName)}</h2><span class="ref"><bdi>${esc(a.id)}</bdi></span></div><div class="badges">${statusBadge(a)}${paymentBadge(a)}</div></div><dl class="application-meta"><div><dt>${t('selectedPlan')}</dt><dd>${esc(a.plan[0].toUpperCase()+a.plan.slice(1))}</dd></div><div><dt>${t(totalKey(a.quote.interval))}</dt><dd class="price-value"><bdi>${money(a.quote.total,a.quote.currency||'ILS')}</bdi></dd></div><div><dt>${t('payment')}</dt><dd>${t(a.paymentMethod)}</dd></div><div><dt>${t('submittedOn')}</dt><dd>${date(a.createdAt)}</dd></div></dl>${a.quote.loyalty||a.quote.extraSpecialists?`<p class="small-note">${t('optionalAddons')}: ${[a.quote.loyalty?t(a.quote.option==='smart_waitlist'?'optWaitlist':'optLoyalty'):'',a.quote.extraSpecialists?`${t('extraSpecialists')} × ${a.quote.extraSpecialists}`:''].filter(Boolean).join(' · ')}</p>`:''}${admin?'':stateNote(a)+payButton(a)+testPayButton(a)}${admin?`<div class="admin-details"><dl><div><dt>${t('fullName')}</dt><dd>${esc(a.fullName)}</dd></div><div><dt>${t('email')}</dt><dd><a class="text-link ltr" href="mailto:${esc(a.email)}">${esc(a.email)}</a></dd></div><div><dt>${t('phone')}</dt><dd><a class="text-link ltr" href="tel:${esc(a.phone)}">${esc(a.phone)}</a></dd></div><div><dt>${t('location')}</dt><dd>${esc(countryName(a.country))}</dd></div>${a.identityNumber||a.idLast4?`<div><dt>${t('identityNumber')}</dt><dd><bdi>${esc(a.identityNumber||('••'+a.idLast4))}</bdi></dd></div>`:''}<div><dt>${t('yourPricing')}</dt><dd>${t(a.quote.region==='west_bank'?'westBankPricing':'standardPricing')}</dd></div>${a.teamComposition?`<div><dt>${t('teamComposition')}</dt><dd>${t('team_'+a.teamComposition)}</dd></div>`:''}${a.clientele?`<div><dt>${t('clientele')}</dt><dd>${t('clientele_'+a.clientele)}</dd></div>`:''}${a.clientele?'':`<div><dt>${t('salonCategory')}</dt><dd>${t('cat_'+a.salonCategory)}</dd></div>`}<div><dt>${t('timezone')}</dt><dd dir="ltr">${esc(a.timezone)}</dd></div>${a.paymentReference?`<div><dt>${t('paymentRef')}</dt><dd dir="ltr">${esc(a.paymentReference)}</dd></div>`:''}</dl>${adminActions(a)}</div>`:''}${thread(a,admin)}</article>`;
}
function applications(admin=false) {
  const filters = ['awaiting','all',...statusNames];
  const list = admin && state.filter!=='all' ? state.applications.filter(a=>state.filter==='awaiting'?a.awaitingApproval:a.status===state.filter) : state.applications;
  return `<div class="${admin?'wrap':'narrow'}">${titleBlock(admin?'inbox':'applications',admin?'inbox':'applicationsTitle',admin?'inboxLead':'applicationsLead')}${admin?`<div class="inbox-filter" aria-label="${t('status')}">${filters.map(s=>`<button type="button" class="filter-btn${state.filter===s?' active':''}" data-filter="${s}" aria-pressed="${state.filter===s}">${t(s==='awaiting'?'awaitingApproval':s)} <b>${s==='all'?state.applications.length:state.applications.filter(a=>s==='awaiting'?a.awaitingApproval:a.status===s).length}</b></button>`).join('')}</div>`:''}${!list.length?`<div class="empty-state"><h2>${t(admin?'noResults':'emptyTitle')}</h2>${admin?'':`<p>${t('emptyText')}</p><a class="btn primary" href="/plans">${t('explorePlans')}</a>`}</div>`:`<div class="application-list" data-paginate="applications-${admin?'admin':'mine'}-${state.filter||'all'}">${list.map(a=>applicationCard(a,admin)).join('')}</div>`}</div>`;
}
const subscriptionTone = status => ({active:'approved',trialing:'approved',canceled:'declined'}[status] || '');
// One salon created from an approved application: everything the owner needs to start, including the QR code.
function salonCard(s) {
  const sub = s.subscription || {}, spec = s.specialists || {};
  // The salon's own link, as in the app (2.34): opens the salon in the app, or the store — also from a phone camera.
  const link = location.origin + '/s/' + encodeURIComponent(s.accessCode);
  const qr = window.SalonQR ? window.SalonQR.svg(link) : '';
  const features = Object.values(s.features||{}).map(f=>`<li class="${f.enabled?'on':'off'}"><span aria-hidden="true">${f.enabled?'✓':'–'}</span>${esc(lang==='ar'?f.labelAr:f.labelEn)}</li>`).join('');
  const limit = spec.unlimited ? t('unlimited') : `${spec.active ?? 0} / ${spec.limit ?? 0}`;
  const live = s.isActive && sub.good_standing !== false;
  const planName = s.plan?.code==='full_access' ? 'Enterprise' : (lang==='ar' ? s.plan?.nameAr : s.plan?.nameEn) || '';
  return `<article class="application-card salon-card"><div class="application-card-top">${s.logoUrl?`<img src="${esc(s.logoUrl)}" alt="" class="logo-preview">`:''}<div><h2>${esc(s.name)}</h2><span class="ref"><bdi>${esc(s.applicationId)}</bdi></span></div><div class="badges"><span class="status ${live?'approved':'declined'}">${t(live?'salonActive':'salonPaused')}</span></div></div>
    <div class="salon-grid"><figure class="salon-qr">${qr}<figcaption><b dir="ltr">${esc(s.accessCode)}</b><small>${t('scanToAdd')}</small></figcaption></figure>
    <dl class="application-meta salon-meta"><div><dt>${t('salonCode')}</dt><dd dir="ltr">${esc(s.accessCode)}</dd></div><div><dt>${t('selectedPlan')}</dt><dd>${esc(planName)}</dd></div><div><dt>${t('specialists')}</dt><dd>${limit}</dd></div>${s.teamComposition?`<div><dt>${t('teamComposition')}</dt><dd>${t('team_'+s.teamComposition)}</dd></div>`:''}${s.clientele?`<div><dt>${t('clientele')}</dt><dd>${t('clientele_'+s.clientele)}</dd></div>`:`<div><dt>${t('salonCategory')}</dt><dd>${t('cat_'+s.category)}</dd></div>`}<div><dt>${t('timezone')}</dt><dd dir="ltr">${esc(s.timezone||'')}</dd></div><div><dt>${t('startDate')}</dt><dd>${sub.starts_on?date(sub.starts_on):''}</dd></div>${sub.expires_on?`<div><dt>${t('periodEnds')}</dt><dd>${date(sub.expires_on)}</dd></div>`:''}<div><dt>${t('appLink')}</dt><dd dir="ltr"><a class="text-link" href="${esc(link)}">${esc(link)}</a></dd></div></dl></div>
    ${features?`<ul class="salon-features" aria-label="${t('features')}">${features}</ul>`:''}
    ${billingSection(s)}
    ${live ? reportSection(s) : ''}
    ${ownerSection(s)}</article>`;
}
// 2.40: the owner signs in with their own Salonieer account (this number) — no salon password. A salon approved before
// keeps its old card (temporary password) until the owner hides it.
function ownerSection(s) {
  const o = s.owner || {};
  // 2.46: the business belongs to this METON account itself (the app and the website sign in to the same account).
  if (o.forAccount) return `<section class="owner-login"><h3>${t('ownerLogin')}</h3><p class="small-note">${t(o.access==='applied'?'ownerAccountApplied':o.reason==='phone_needed'?'ownerAccountPhoneNeeded':'ownerAccountWaiting')}</p>${o.accountName?`<dl class="application-meta"><div><dt>${t('ownerAccount')}</dt><dd>${esc(o.accountName)}</dd></div></dl>`:''}</section>`;
  if (o.access) return `<section class="owner-login"><h3>${t('ownerLogin')}</h3><p class="small-note">${t(o.access==='applied'?'ownerAccessLinked':'ownerAccessHow')}</p><dl class="application-meta"><div><dt>${t('phone')}</dt><dd dir="ltr">${esc(o.phone)}</dd></div>${o.accountName?`<div><dt>${t('ownerAccount')}</dt><dd>${esc(o.accountName)}</dd></div>`:''}</dl></section>`;
  return `<section class="owner-login"><h3>${t('ownerLogin')}</h3><p class="small-note">${t('ownerLoginHint')}</p><dl class="application-meta"><div><dt>${t('phone')}</dt><dd dir="ltr">${esc(o.phone)}</dd></div>${o.temporaryPassword?`<div><dt>${t('tempPassword')}</dt><dd dir="ltr"><code>${esc(o.temporaryPassword)}</code></dd></div>`:''}</dl>
      ${o.temporaryPassword?`<p class="notice warning">${t('tempPasswordNote')}</p><button class="btn small" type="button" data-password-saved="${esc(s.applicationId)}">${t('passwordSaved')}</button>`:`<p class="small-note">${t('passwordHidden')}</p>`}</section>`;
}
// Only shown for a salon that is open with a subscription in good standing; the server checks the same again.
const REPORT_CATEGORIES = ['bug','booking','billing','account','other'];
function reportSection(s) {
  const id = esc(s.applicationId);
  return `<details class="report-box"><summary><span>${t('reportProblem')}</span><small>${t('reportProblemHint')}</small></summary>
    <form class="report-form" data-report="${id}" novalidate><div class="field"><label for="report-cat-${id}">${t('reportCategory')}</label><select id="report-cat-${id}" name="category">${REPORT_CATEGORIES.map(c=>`<option value="${c}">${t('reportCat_'+c)}</option>`).join('')}</select></div>
    <div class="field"><label for="report-msg-${id}">${t('reportMessage')}</label><textarea id="report-msg-${id}" name="message" rows="4" minlength="10" maxlength="2000" required></textarea><small>${t('reportMessageHint')}</small></div>
    <div class="form-actions"><button class="btn primary small" type="submit">${t('sendReport')}</button><span class="status-feedback" role="status"></span></div></form></details>`;
}
// ---- Salon billing (owner) ---------------------------------------------------------------------------------------
// Each salon paid by card has its own Paddle subscription. The owner can stop auto-renewal (the paid period keeps
// working), undo that, pay a failed renewal, and ask for a different plan; Salonieer reviews the request and Paddle
// charges the prorated difference.
const cents = (value, currency='USD') => value === null || value === undefined || value === '' ? '' : money(Number(value)/100, currency);
const PLAN_NAMES = { basic:'Basic', pro:'Pro', business:'Business' };
function currentChange(b) {
  const items = b.items || [];
  const plan = items.find(i=>PLAN_NAMES[i.item])?.item || 'basic';
  return { plan, interval: b.interval==='year'?'year':'month', extraSpecialists: items.filter(i=>i.item==='specialist').reduce((n,i)=>n+(Number(i.quantity)||0),0), loyalty: items.some(i=>i.item==='loyalty'), option: b.option || 'loyalty' };
}
function changeText(c) {
  return [PLAN_NAMES[c.plan] || c.plan, t(c.interval==='year'?'yearly':'monthly'), c.extraSpecialists ? `+${c.extraSpecialists} ${t('specialists')}` : '', c.loyalty ? t(c.option==='smart_waitlist'?'optWaitlist':'optLoyalty') : ''].filter(Boolean).join(' · ');
}
const daysUntil = value => Math.max(0, Math.ceil((new Date(value) - Date.now()) / 86400000));
function billingNotice(b) {
  const app = esc(b.applicationId);
  if (b.pausedForBilling && b.status !== 'past_due') return `<div class="notice warning billing-notice"><p><b>${t('salonPausedTitle')}</b> ${t('pausedEndedNote')}</p><a class="btn small primary" href="/plans">${t('subscribeAgain')}</a></div>`;
  if (b.status === 'past_due') {
    const text = b.pausedForBilling ? t('pausedUnpaidNote') : t('pastDueNote', { date: b.graceEndsAt ? date(b.graceEndsAt) : '', n: b.graceEndsAt ? daysUntil(b.graceEndsAt) : 7 });
    return `<div class="notice warning billing-notice" role="alert"><p><b>${t(b.pausedForBilling?'salonPausedTitle':'paymentFailedTitle')}</b> ${text}</p><button class="btn small primary" type="button" data-bill-pay="${app}">${t('payNow')}</button></div>`;
  }
  if (b.scheduledChange?.action === 'cancel' && b.status !== 'canceled') return `<div class="notice info billing-notice"><p>${t('cancellingNote', { date: date(b.scheduledChange.effectiveAt || b.currentPeriodEndsAt) })}</p><button class="btn small" type="button" data-bill-resume="${app}">${t('keepSubscription')}</button></div>`;
  if (b.status === 'trialing' && b.trialEndsAt) return `<p class="notice info billing-notice">${t('trialAccountNote', { date: date(b.trialEndsAt) })}</p>`;
  return '';
}
function changeForm(s, b) {
  const c = currentChange(b), app = esc(s.applicationId);
  const options = (list, value, label) => list.map(v=>`<option value="${v}"${v===value?' selected':''}>${esc(label(v))}</option>`).join('');
  return `<form class="change-form" data-change-form="${app}" hidden novalidate><h4>${t('requestChange')}</h4><p class="small-note">${t('requestChangeLead')}</p>
    <div class="form-grid"><div class="field"><label for="cp-${app}">${t('plans')}</label><select id="cp-${app}" name="plan">${options(c.plan==='business'?['basic','pro','business']:['basic','pro'], c.plan, v=>PLAN_NAMES[v])}</select></div>
    <div class="field"><label for="ci-${app}">${t('billingPeriod')}</label><select id="ci-${app}" name="interval">${options(['month','year'], c.interval, v=>t(v==='year'?'yearly':'monthly'))}</select></div>
    <div class="field"><label for="cs-${app}">${t('extraSpecialists')}</label><input id="cs-${app}" name="extraSpecialists" type="number" min="0" max="50" step="1" inputmode="numeric" value="${c.extraSpecialists}"></div>
    <div class="field" data-loyalty-field><label for="co-${app}">${t('basicOption')}</label><select id="co-${app}" name="basicOption">${options(['','loyalty','smart_waitlist'], c.loyalty ? c.option : '', v=>t(v==='loyalty'?'optLoyalty':v==='smart_waitlist'?'optWaitlist':'optNone'))}</select></div>
    <div class="field full-span"><label for="cn-${app}">${t('noteOptional')}</label><textarea id="cn-${app}" name="note" rows="2" maxlength="1000"></textarea></div></div>
    <div class="change-preview" data-change-preview aria-live="polite"></div>
    <div class="button-row"><button class="btn small" type="button" data-change-preview-btn>${t('seePrice')}</button><button class="btn small primary" type="submit">${t('sendRequest')}</button><button class="btn small quiet" type="button" data-change-close>${t('tm_cancel')}</button></div></form>`;
}
// A salon billed in cash or by bank transfer (set up by Salonieer): paid until a date; payments are arranged with us.
const cashMoney = (cents, currency='USD') => { const v = Number(cents || 0) / 100; try { return new Intl.NumberFormat(lang === 'ar' ? 'ar' : lang, {style:'currency', currency, minimumFractionDigits: Number.isInteger(v) ? 0 : 2, maximumFractionDigits: 2}).format(v); } catch { return currency + ' ' + v; } };
function cashBillingSection(s, b) {
  const app = esc(s.applicationId);
  const [tone, label] = b.pausedForBilling ? ['declined', 'salonPausedTitle'] : b.pastDueSince ? ['declined', 'cashDueTitle'] : b.cashEnds ? ['in_review', 'cashEndingOwner'] : ['approved', 'cashPaidOwner'];
  const notice = b.pausedForBilling ? `<div class="notice warning billing-notice"><p><b>${t('salonPausedTitle')}</b> ${t('cashPausedOwnerNote')}</p><a class="btn small primary" href="/support">${t('contactUs')}</a></div>`
    : b.pastDueSince ? `<div class="notice warning billing-notice" role="alert"><p><b>${t('cashDueTitle')}</b> ${t('cashDueOwnerNote', {date: b.graceEndsAt ? date(b.graceEndsAt) : ''})}</p><a class="btn small primary" href="/support">${t('contactUs')}</a></div>`
    : b.cashEnds ? `<p class="notice info billing-notice">${t('cashEndsOwnerNote', {date: date(b.paidUntil)})}</p>` : '';
  const link = b.cardLinkSentAt ? `<p class="notice info billing-notice">${t('cardLinkOwnerNote')}</p>` : '';
  const pays = (b.cashPayments || []).map(p => `<li><span>${date(p.paidOn)} · ${t('via_' + p.via)}<small>${t('covers')}: ${date(p.periodStart)} – ${date(p.periodEnd)}</small></span><bdi>${cashMoney(p.amount, p.currency)}</bdi></li>`).join('');
  return `<section class="billing-box" aria-labelledby="bill-${app}"><div class="billing-head"><h3 id="bill-${app}">${t('billingTitle')}</h3><span class="status ${tone}">${t(label)}</span></div>${notice}${link}
    <dl class="application-meta billing-meta"><div><dt>${t('paymentMethod')}</dt><dd>${t('cashMethodOwner')}</dd></div><div><dt>${t(totalKey(b.interval))}</dt><dd class="price-value"><bdi>${cashMoney(b.recurringTotal, b.currency)}</bdi></dd></div>${b.paidUntil ? `<div><dt>${t('paidUntilOwner')}</dt><dd>${date(b.paidUntil)}</dd></div>` : ''}</dl>
    ${pays ? `<details class="billing-items"><summary>${t('cashPaymentsOwner')}</summary><ul data-paginate="cash-${app}">${pays}</ul></details>` : ''}
    <p class="small-note">${t('cashOwnerHint')}</p></section>`;
}
function billingSection(s) {
  const b = s.billing;
  if (b?.method === 'cash') return cashBillingSection(s, b);
  if (!b || !b.subscriptionId) return '';
  b.applicationId = s.applicationId;
  const app = esc(s.applicationId), c = currentChange(b);
  const cancelling = b.scheduledChange?.action === 'cancel' && b.status !== 'canceled';
  const active = ['active','trialing'].includes(b.status);
  const next = cancelling ? null : b.status==='trialing' ? b.trialEndsAt : b.nextBilledAt;
  const items = (b.items||[]).map(i=>`<li><span>${esc(i.name || i.item)}${i.quantity>1?` × ${i.quantity}`:''}</span><bdi>${cents(Number(i.unitAmount)*(Number(i.quantity)||1), b.currency)}</bdi></li>`).join('');
  const pending = b.pendingChange ? `<div class="notice info billing-notice"><p>${t('changePending', { change: esc(changeText(b.pendingChange.requested)) })}</p><button class="btn small" type="button" data-change-withdraw="${app}">${t('withdrawRequest')}</button></div>` : '';
  return `<section class="billing-box" aria-labelledby="bill-${app}"><div class="billing-head"><h3 id="bill-${app}">${t('billingTitle')}</h3><span class="status ${subscriptionTone(b.status)}">${t('sub_'+(b.status||'active'))}</span></div>
    ${billingNotice(b)}${pending}
    <dl class="application-meta billing-meta"><div><dt>${t('yourPlan')}</dt><dd>${esc(changeText(c))}</dd></div><div><dt>${t(totalKey(c.interval))}</dt><dd class="price-value"><bdi>${cents(b.recurringTotal, b.currency)}</bdi></dd></div>${next?`<div><dt>${t(b.status==='trialing'?'firstCharge':'nextBilling')}</dt><dd>${date(next)}</dd></div>`:''}${cancelling||b.status==='canceled'?`<div><dt>${t('worksUntil')}</dt><dd>${date(b.scheduledChange?.effectiveAt || b.currentPeriodEndsAt)}</dd></div>`:b.currentPeriodEndsAt?`<div><dt>${t('periodEnds')}</dt><dd>${date(b.currentPeriodEndsAt)}</dd></div>`:''}</dl>
    ${items?`<details class="billing-items"><summary>${t('whatYouPay')}</summary><ul>${items}</ul></details>`:''}
    <div class="button-row billing-actions">${active&&!b.pendingChange?`<button class="btn small" type="button" data-change-open="${app}">${t('requestChange')}</button>`:''}${active&&!cancelling?`<button class="btn small danger" type="button" data-bill-cancel="${app}" data-until="${esc(b.nextBilledAt || b.currentPeriodEndsAt || '')}">${t('cancelAutoRenew')}</button>`:''}</div>
    ${active&&!b.pendingChange?changeForm(s,b):''}</section>`;
}
function invoicesSection() {
  if (!state.invoices.length) return '';
  const name = id => state.salons.find(s=>s.applicationId===id)?.name || '';
  return `<section class="invoices-panel" aria-labelledby="invoices-title"><h2 class="section-label" id="invoices-title">${t('invoices')}</h2><div class="table-wrap"><table class="invoice-table"><thead><tr><th scope="col">${t('date')}</th><th scope="col">${t('salon')}</th><th scope="col">${t('invoice')}</th><th scope="col" class="num">${t('amount')}</th><th scope="col">${t('status')}</th><th scope="col"><span class="sr-only">PDF</span></th></tr></thead><tbody data-paginate="invoices">${state.invoices.map(i=>`<tr><td data-label="${t('date')}">${i.billedAt?date(i.billedAt):''}</td><td data-label="${t('salon')}">${esc(name(i.applicationId))}</td><td data-label="${t('invoice')}"><bdi>${esc(i.invoiceNumber || '—')}</bdi></td><td data-label="${t('amount')}" class="num"><bdi>${esc(i.totalText)}</bdi>${Number(i.refunded)?`<small class="refunded">−${cents(i.refunded, i.currency)}</small>`:''}</td><td data-label="${t('status')}"><span class="status ${['completed','paid'].includes(i.status)?'approved':i.status==='past_due'?'declined':'in_review'}">${t('inv_'+i.status)}</span></td><td>${['completed','paid'].includes(i.status)?`<button class="btn small" type="button" data-invoice-pdf="${esc(i.id)}">${t('downloadPdf')}</button>`:''}</td></tr>`).join('')}</tbody></table></div></section>`;
}
const openSetups = () => (state.applications || []).filter(a => !a.salon && !['approved','declined'].includes(a.status));
function account() {
  const b = state.billing, sub = b.subscriptions[0];
  const meta = (label,value) => value ? `<div><dt>${t(label)}</dt><dd>${value}</dd></div>` : '';
  const interval = !sub?.interval ? '' : sub.frequency===1 && ['month','year'].includes(sub.interval) ? t(sub.interval==='year'?'annual':'monthly') : `${t('every')} ${sub.frequency} ${t('interval_'+sub.interval)}`;
  const change = sub?.scheduledChange && sub.status!=='canceled' ? `<p class="notice info">${t('scheduled_'+sub.scheduledChange.action)}${sub.scheduledChange.at?` <bdi>${date(sub.scheduledChange.at)}</bdi>`:''}. ${t('accessUntilChange')}</p>` : '';
  const card = sub && !state.salons.some(s=>s.billing?.subscriptionId) ? `<article class="application-card"><div class="application-card-top"><div><h2>${esc(sub.productName || t('subscription'))}</h2><span class="ref"><bdi>${esc(sub.id)}</bdi></span></div><span class="status ${subscriptionTone(sub.status)}">${t('sub_'+sub.status)}</span></div><dl class="application-meta">${meta('paidAccess',t(b.hasAccess?'accessActive':'accessInactive'))}${meta('billingPeriod',esc(interval))}${meta('nextBilling',sub.nextBilledAt?date(sub.nextBilledAt):'')}${meta('periodEnds',!sub.nextBilledAt&&sub.currentPeriodEndsAt?date(sub.currentPeriodEndsAt):'')}</dl>${change}</article>`
    : (state.salons.length || openSetups().length ? '' : `<div class="empty-state"><h2>${t('emptyTitle')}</h2><p>${t('emptyText')}</p><div class="hero-actions"><a class="btn primary" href="/try/business">${t('hm2_cta_build_short')}</a><a class="btn" href="/plans">${t('explorePlans')}</a></div></div>`);
  const portal = b.hasCustomer ? `<section class="invite-panel"><button class="btn primary" type="button" id="manage-billing">${t('manageBilling')}</button><p class="small-note">${t('manageBillingHint')}</p><p id="billing-feedback" role="status"></p></section>` : '';
  const justPaid = new URLSearchParams(location.search).get('checkout')==='complete' && !b.hasAccess ? `<div class="notice info"><p>${t('paymentProcessing')}</p><button class="btn small" type="button" id="refresh-billing">${t('refresh')}</button></div>` : '';
  const salons = state.salons.length ? `<h2 class="section-label">${t('yourSalons')}</h2><div class="salon-list" data-paginate="salons">${state.salons.map(salonCard).join('')}</div>` : '';
  // 2026-11-08: businesses still on their way to going live (payment, a check, a detail we need) are shown here; the
  // separate "applications" page is no longer in the menu.
  const progress = openSetups().length ? `<h2 class="section-label">${t('inProgress')}</h2><div class="application-list" data-paginate="in-progress">${openSetups().map(a=>applicationCard(a)).join('')}</div>` : '';
  // 2.48: the full METON app in the browser (/app/): appointments, calendar, customers, services, team, finances,
  // checkout, reports and settings, with the same permissions and plan as on the phone.
  const webApp = `<section class="webapp-card"><div><h2>${t('webAppTitle')}</h2><p>${t('webAppText')}</p></div><a class="btn primary" href="/app/" rel="noopener">${t('webAppOpen')}</a></section>`;
  return `<div class="narrow"><div class="account-head">${titleBlock('account','accountTitle','accountLead')}${notifBell()}</div>${webApp}<div class="application-list">${justPaid}${progress}${salons}${invoicesSection()}${card}${portal}${accountSettings()}</div></div>`;
}
// 2.48: the bell — team invitations of this METON account (the same ones the app shows, read / unread kept for both).
function notifBell() {
  const n = state.notifs; if (!n) return '';
  const unread = n.unread || 0, open = !!state.notifOpen;
  const roleOf = i => i.role === 'other' && i.title ? esc(i.title) : t('role_' + (['manager','specialist','other'].includes(i.role) ? i.role : 'other'));
  const item = i => `<li class="notif-item${i.read ? '' : ' is-unread'}" data-slug="${esc(i.slug)}" data-member="${esc(i.member)}">
      <div class="notif-main">${i.logo ? `<img class="notif-logo" src="${esc(i.logo)}" alt="" loading="lazy">` : `<span class="notif-logo" aria-hidden="true">${esc((i.business || '?').trim().charAt(0))}</span>`}
        <div><p class="notif-text">${i.read ? '' : `<span class="sr-only">${t('notifNew')} · </span>`}${t('inviteLine', {business: `<b><bdi>${esc(i.business)}</bdi></b>`, role: `<b>${roleOf(i)}</b>`})}</p>
          <p class="notif-meta">${i.invitedBy ? `${t('invitedByLine', {name: `<bdi>${esc(i.invitedBy)}</bdi>`})} · ` : ''}${i.invitedAt ? `<time datetime="${esc(i.invitedAt)}">${date(i.invitedAt)}</time>` : ''}</p>
          ${i.profile ? `<p class="notif-meta">${t('inviteProfile', {name: `<bdi>${esc(i.profile)}</bdi>`})}</p>` : ''}</div></div>
      <div class="notif-actions"><button type="button" class="btn small primary" data-notif-accept>${t('inviteAccept')}</button><button type="button" class="btn small" data-notif-decline>${t('inviteDecline')}</button>
        <button type="button" class="text-link notif-mark" data-notif-mark="${i.read ? 'unread' : 'read'}">${t(i.read ? 'markUnread' : 'markRead')}</button></div></li>`;
  const body = !n.verified ? `<p class="notif-empty">${t('notifConfirmEmail')}</p>`
    : n.items.length ? `<ul class="notif-list">${n.items.map(item).join('')}</ul><p class="small-note">${t('inviteNote')}</p>` : `<p class="notif-empty">${t('notifEmpty')}</p>`;
  return `<div class="notif"><button type="button" class="notif-bell" id="notif-bell" aria-expanded="${open}" aria-controls="notif-panel" aria-label="${esc(t('notifTitle'))}${unread ? ` · ${esc(t('notifUnread', {n: unread}))}` : ''}">
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8"/><path d="M10.3 20a1.94 1.94 0 0 0 3.4 0"/></svg>
      ${unread ? `<span class="notif-count" aria-hidden="true">${unread > 9 ? '9+' : unread}</span>` : ''}</button>
    <section class="notif-panel" id="notif-panel" aria-labelledby="notif-title"${open ? '' : ' hidden'}><header class="notif-head"><h2 id="notif-title">${t('notifTitle')}</h2>
      ${unread ? `<button type="button" class="text-link" data-notif-all>${t('markAllRead')}</button>` : ''}</header>${body}</section></div>`;
}
async function loadNotifs() { try { state.notifs = await api('/api/account/notifications'); } catch { state.notifs = state.notifs || null; } }
function bindNotifs() {
  const bell = document.getElementById('notif-bell'), panel = document.getElementById('notif-panel');
  if (!bell || !panel) return;
  const redraw = () => { const host = document.querySelector('.account-head .notif'); if (host) { host.outerHTML = notifBell(); bindNotifs(); } };
  bell.addEventListener('click', () => { state.notifOpen = !state.notifOpen; panel.hidden = !state.notifOpen; bell.setAttribute('aria-expanded', String(state.notifOpen)); if (state.notifOpen) panel.querySelector('button')?.focus(); });
  const close = () => { state.notifOpen = false; panel.hidden = true; bell.setAttribute('aria-expanded', 'false'); };
  panel.addEventListener('keydown', e => { if (e.key === 'Escape') { close(); bell.focus(); } });
  // A tap outside closes it (once per page: the handler checks the bell that is on the page now).
  if (!bindNotifs.outside) { bindNotifs.outside = true; document.addEventListener('click', e => { const host = document.querySelector('.account-head .notif');
    if (state.notifOpen && host && !host.contains(e.target) && !e.target.closest?.('dialog,.modal-root,.toast-host')) { state.notifOpen = false; const p = document.getElementById('notif-panel'), b = document.getElementById('notif-bell'); if (p) p.hidden = true; b?.setAttribute('aria-expanded', 'false'); } }); }
  const ref = el => { const li = el.closest('.notif-item'); return {slug: li.dataset.slug, member: li.dataset.member}; };
  const mark = async (data, button) => { try { setBusy(button, true); await post('/api/account/notifications/read', data, button); await loadNotifs(); redraw(); } catch (e) { setBusy(button, false); toast(t(e.code || 'serverError'), 'error'); } };
  panel.querySelector('[data-notif-all]')?.addEventListener('click', e => mark({all: true}, e.currentTarget));
  panel.querySelectorAll('[data-notif-mark]').forEach(b => b.addEventListener('click', e => mark({...ref(b), read: b.dataset.notifMark === 'read'}, e.currentTarget)));
  const decide = async (b, accept) => {
    const r0 = ref(b), name = state.notifs.items.find(i => i.slug === r0.slug && i.member === r0.member)?.business || '';
    if (!accept && !(await confirmDialog({title: t('declineConfirm'), confirm: t('inviteDecline'), cancel: t('tm_cancel'), tone: 'danger'}))) return;
    try {
      setBusy(b, true, t('processing'));
      const r = await post('/api/account/invites/decide', {...r0, accept}, b, t('processing'));
      toast(!accept ? t('inviteDeclined') : r.memberStatus === 'active' ? t('inviteJoined', {business: r.business || name}) : t('inviteWaiting'), 'success', 6000);
      await loadNotifs(); redraw();
    } catch (e) { setBusy(b, false); toast(t(e.code || 'serverError'), 'error', 6000); }
  };
  panel.querySelectorAll('[data-notif-accept]').forEach(b => b.addEventListener('click', () => decide(b, true)));
  panel.querySelectorAll('[data-notif-decline]').forEach(b => b.addEventListener('click', () => decide(b, false)));
}
// Name and password of the website account, and deleting it (not while a subscription is running).
function accountSettings() {
  const u = state.user, st = state.deletion;
  if (!u) return '';
  const reason = r => t('blockReason_' + r.reason, { salon: r.salonName || '' });
  const del = u.isAdmin || st?.isAdmin ? `<p class="small-note">${t('adminCannotDelete')}</p>`
    : !st ? `<p class="small-note">${t('deleteStatusUnavailable')}</p>`
    : st.blocking.length ? `<div class="notice warning"><p>${t('deleteBlocked')}</p><ul class="block-list">${st.blocking.map(r => `<li>${esc(reason(r))}</li>`).join('')}</ul><p class="small-note">${t('deleteBlockedHint')}</p></div>`
    : `<p>${t('deleteAccountText')}</p>${st.salons ? `<p class="small-note">${t('deleteKeepsSalons')}</p>` : ''}${st.openApplications ? `<p class="small-note">${t('deleteOpenApps', {n: st.openApplications})}</p>` : ''}
      <form id="delete-form" novalidate>${formErrorBox()}${field('deletePassword','password',{type:'password',autocomplete:'current-password'})}
      <label class="check-row delete-check"><input type="checkbox" name="understand"> <span>${t('deleteUnderstand')}</span></label>
      <button class="btn danger" type="submit">${t('deleteAccountForever')}</button></form>`;
  // 2.46: an account made with Google has no password until the person sets one (no "current password" then).
  const noPw = state.identity && !state.identity.hasPassword;
  return `<section class="settings-panel" aria-labelledby="settings-title"><h2 class="section-label" id="settings-title">${t('accountSettings')}</h2>
    <div class="settings-grid"><form id="profile-form" class="settings-card" novalidate><h3>${t('profileTitle')}</h3>${formErrorBox()}${field('fullName','fullName',{autocomplete:'name',maxlength:60,placeholder:t('fullName')})}${genderField(u.gender||'')}
      ${state.identity ? '' : `<p class="small-note">${t('signInEmail')}: <bdi>${esc(u.email)}</bdi></p>`}<button class="btn small primary" type="submit">${t('saveProfile')}</button></form>
    <form id="password-form" class="settings-card" novalidate><h3>${t(noPw?'setPassword':'changePassword')}</h3>${formErrorBox()}${noPw?'':field('currentPassword','currentPassword',{type:'password',autocomplete:'current-password'})}
      ${field('newPassword','newPassword',{type:'password',autocomplete:'new-password',hint:'passwordHint'})}${field('newPasswordConfirm','passwordConfirm',{type:'password',autocomplete:'new-password'})}
      <p class="small-note">${t('passwordChangeNote')}</p><button class="btn small primary" type="submit">${t(noPw?'setPassword':'changePassword')}</button></form></div>
    ${identitySection()}
    <section class="danger-zone" aria-labelledby="delete-title"><h3 id="delete-title">${t('deleteAccount')}</h3>${del}</section></section>`;
}
function support() {
  return `<div class="wrap">${titleBlock('support','helpTitle','helpLead')}<div class="support-layout"><section class="support-contact"><h2>${t('contactUs')}</h2><a class="email-address" href="mailto:support@meton.work" dir="ltr">support@meton.work</a><a class="btn primary" href="mailto:support@meton.work?subject=METON%20Support">${t('emailSupport')}</a><button type="button" class="btn" id="copy-email">${t('copyEmail')}</button><p id="copy-feedback" role="status"></p></section><section class="faq-list"><h2>${t('faq')}</h2>${[['faqLoginQ','faqLoginA','account'],['faqPriceQ','faqPriceA','pricing'],['faqPayQ','faqPayA','payment'],['faqNotificationsQ','faqNotificationsA','notifications'],['faqSalonQ','faqSalonA','salon']].map(([q,a,id])=>`<details id="${id}"${location.hash==='#'+id?' open':''}><summary>${t(q)}</summary><p>${t(a)}</p></details>`).join('')}</section></div></div>`;
}
// 2.33: a salon team invitation (shared by the owner from the app). The link
// carries only the code; the app opens it (salonieer://salon/INV-…) or the
// person pastes the code in the app's salon-code box. Nothing is stored here.
function invite() {
  const W = {
    eyebrow:{ar:'دعوة للفريق',en:'Team invitation',he:'הזמנה לצוות'},
    title:{ar:'تمت دعوتك للانضمام إلى فريق عمل',en:'You are invited to join a business team',he:'הוזמנת להצטרף לצוות של עסק'},
    lead:{ar:'افتح الدعوة في تطبيق METON وسجّل الدخول بحسابك أو أنشئ حساباً، ثم اقبلها. يفعّلك صاحب العمل بعد التحقق منك.',en:'Open the invitation in the METON app, sign in or create your account, then accept. The business activates you after checking.',he:'פתחו את ההזמנה באפליקציית METON, התחברו או צרו חשבון, ואז אשרו. העסק יפעיל אותך אחרי בדיקה.'},
    open:{ar:'افتح في تطبيق METON',en:'Open in the METON app',he:'פתיחה באפליקציית METON'},
    copy:{ar:'نسخ رمز الدعوة',en:'Copy the invitation code',he:'העתקת קוד ההזמנה'},
    copied:{ar:'تم نسخ الرمز',en:'Code copied',he:'הקוד הועתק'},
    s1:{ar:'ثبّت تطبيق METON من App Store أو Google Play إن لم يكن لديك.',en:'Install the METON app from the App Store or Google Play if you do not have it.',he:'התקינו את אפליקציית METON מ-App Store או מ-Google Play אם עדיין אין לכם.'},
    s2:{ar:'اضغط «افتح في تطبيق METON»، أو الصق رمز الدعوة في خانة الرمز داخل التطبيق.',en:'Tap “Open in the METON app”, or paste the invitation code in the app’s code box.',he:'הקישו „פתיחה באפליקציית METON”, או הדביקו את קוד ההזמנה בתיבת הקוד באפליקציה.'},
    s3:{ar:'سجّل الدخول بحسابك أو أنشئ حساباً جديداً، ثم اقبل الدعوة.',en:'Sign in or create a new account, then accept the invitation.',he:'התחברו או צרו חשבון חדש, ואז אשרו את ההזמנה.'},
    note:{ar:'الدعوة شخصية وتصلح لمرة واحدة. لا تشاركها مع غيرك.',en:'The invitation is personal and works once. Do not share it.',he:'ההזמנה אישית ותקפה לשימוש אחד. אל תשתפו אותה.'},
    bad:{ar:'رابط الدعوة غير مكتمل. اطلب من صاحب العمل رابطاً جديداً.',en:'This invitation link is incomplete. Ask the business for a new link.',he:'קישור ההזמנה אינו שלם. בקשו מהעסק קישור חדש.'},
  };
  const L3 = o => o[lang] || o.en;
  const code = new URLSearchParams(location.search).get('code') || '';
  const valid = /^INV-[A-Za-z0-9_-]{32}$/.test(code);
  return `<div class="narrow invite-page"><header class="title-block"><p class="eyebrow">${esc(L3(W.eyebrow))}</p><h1>${esc(L3(W.title))}</h1><p class="lead">${esc(L3(W.lead))}</p></header>
    ${valid ? `<section class="invite-card"><a class="btn primary" href="salonieer://salon/${esc(code)}">${esc(L3(W.open))}</a>
      <div class="invite-code" dir="ltr"><code id="invite-code">${esc(code)}</code><button type="button" class="btn small" id="copy-invite" data-copied="${esc(L3(W.copied))}">${esc(L3(W.copy))}</button></div>
      <ol class="invite-steps"><li>${esc(L3(W.s1))}</li><li>${esc(L3(W.s2))}</li><li>${esc(L3(W.s3))}</li></ol>
      <p class="small-note">${esc(L3(W.note))}</p></section>`
    : `<section class="invite-card"><p>${esc(L3(W.bad))}</p></section>`}</div>`;
}
// 2.34: a salon's own link (https://salonieer.com/s/<code>). With the app
// installed the link opens the app directly (App Links / Universal Links);
// this page is what people see without it, or inside an in-app browser
// (Instagram, WhatsApp) that does not open apps by itself. The salon's code is
// the only thing in the link; the app applies the salon's own rules (approval,
// sign-in before booking). Nothing is stored here.
const STORE = { android: 'https://play.google.com/store/apps/details?id=com.salonieer.app', ios: 'https://apps.apple.com/app/id6813588408' };
const device = () => /android/i.test(navigator.userAgent) ? 'android' : (/iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) ? 'ios' : 'desktop';
function salonCodeFromPath() { const m = location.pathname.match(/^\/s\/([A-Za-z0-9_-]{2,64})\/?$/); return m ? m[1] : ''; }
function salonLink() {
  const W = {
    eyebrow:{ar:'رابط الحجز',en:'Booking link',he:'קישור להזמנה'},
    title:{ar:'احجز موعدك عبر تطبيق METON',en:'Book your appointment in the METON app',he:'קבעו תור באפליקציית METON'},
    lead:{ar:'تصفح الخدمات والمختصين والمواعيد المتاحة في التطبيق. سجّل الدخول أو أنشئ حساباً عند تأكيد الحجز.',en:'Browse the services, specialists and free times in the app. Sign in or create an account when you confirm a booking.',he:'עיינו בשירותים, באנשי המקצוע ובזמנים הפנויים באפליקציה. התחברו או צרו חשבון כשאתם מאשרים תור.'},
    open:{ar:'افتح في التطبيق',en:'Open in the app',he:'פתיחה באפליקציה'},
    play:{ar:'تحميل من Google Play',en:'Get it on Google Play',he:'הורדה מ-Google Play'},
    store:{ar:'تحميل من App Store',en:'Download on the App Store',he:'הורדה מ-App Store'},
    androidNote:{ar:'إن لم يكن التطبيق مثبتاً يفتح متجر Google Play، وبعد التثبيت يفتح التطبيقُ صفحة الحجز تلقائياً.',en:'Without the app, Google Play opens; after installing, the app opens this booking page by itself.',he:'בלי האפליקציה ייפתח Google Play; אחרי ההתקנה האפליקציה תפתח את עמוד ההזמנה בעצמה.'},
    iosNote:{ar:'بعد تثبيت التطبيق ارجع إلى هذه الصفحة واضغط «افتح في التطبيق»، أو أدخل الرمز في التطبيق.',en:'After installing the app, come back to this page and tap “Open in the app”, or enter the code in the app.',he:'אחרי התקנת האפליקציה חזרו לדף הזה והקישו „פתיחה באפליקציה”, או הזינו את הקוד באפליקציה.'},
    desktop:{ar:'افتح هذا الرابط على هاتفك، أو امسح الرمز بكاميرا الهاتف.',en:'Open this link on your phone, or scan the code with the phone camera.',he:'פתחו את הקישור בטלפון, או סרקו את הקוד במצלמת הטלפון.'},
    code:{ar:'رمز المنشأة',en:'Business code',he:'קוד העסק'},
    copy:{ar:'نسخ الرمز',en:'Copy the code',he:'העתקת הקוד'},
    copied:{ar:'تم نسخ الرمز',en:'Code copied',he:'הקוד הועתק'},
    bad:{ar:'رابط الحجز غير صحيح. اطلب الرابط من صاحب العمل من جديد.',en:'This booking link is not valid. Ask the business for its link again.',he:'קישור ההזמנה אינו תקין. בקשו מהעסק את הקישור שוב.'},
  };
  const L3 = o => o[lang] || o.en;
  const code = salonCodeFromPath(), dev = device();
  if (!code) return `<div class="narrow invite-page"><section class="invite-card"><p>${esc(L3(W.bad))}</p></section></div>`;
  const play = STORE.android + '&referrer=' + encodeURIComponent('salon=' + code);
  // Android: opens the app when installed, else Google Play (which passes the salon on).
  const android = `intent://salon/${encodeURIComponent(code)}#Intent;scheme=salonieer;package=com.salonieer.app;S.browser_fallback_url=${encodeURIComponent(play)};end`;
  const openHref = dev === 'android' ? android : `salonieer://salon/${encodeURIComponent(code)}`;
  return `<div class="narrow invite-page salon-link-page"><header class="title-block"><p class="eyebrow">${esc(L3(W.eyebrow))}</p>
      <div class="salon-link-brand" id="salon-link-brand" hidden><img id="salon-link-logo" alt="" hidden><h2 id="salon-link-name"></h2></div>
      <h1>${esc(L3(W.title))}</h1><p class="lead">${esc(L3(W.lead))}</p></header>
    <section class="invite-card">
      ${dev === 'desktop' ? `<p>${esc(L3(W.desktop))}</p><div class="salon-link-qr" id="salon-link-qr"></div>` : `<a class="btn primary" href="${esc(openHref)}" id="salon-open">${esc(L3(W.open))}</a>`}
      <div class="store-row">${dev !== 'ios' ? `<a class="btn" href="${esc(play)}" rel="noopener">${esc(L3(W.play))}</a>` : ''}${dev !== 'android' ? `<a class="btn" href="${esc(STORE.ios)}" rel="noopener">${esc(L3(W.store))}</a>` : ''}</div>
      <p class="small-note">${esc(L3(dev === 'android' ? W.androidNote : W.iosNote))}</p>
      <div class="invite-code" dir="ltr"><span>${esc(L3(W.code))}</span><code id="salon-code">${esc(code)}</code><button type="button" class="btn small" id="copy-salon-code" data-copied="${esc(L3(W.copied))}">${esc(L3(W.copy))}</button></div>
    </section></div>`;
}
async function bindSalonLink() {
  const code = salonCodeFromPath(); if (!code) return;
  document.getElementById('copy-salon-code')?.addEventListener('click', async e => { const b = e.currentTarget; try { await navigator.clipboard.writeText(code); toast(b.dataset.copied, 'success'); } catch {} });
  const qr = document.getElementById('salon-link-qr');
  if (qr && window.SalonQR?.svg) { try { qr.innerHTML = window.SalonQR.svg(location.href); } catch {} }
  try {
    const r = await fetch('/api/salon-link?code=' + encodeURIComponent(code), { headers: { accept: 'application/json' } });
    const d = r.ok ? await r.json() : null;
    if (!d?.salon?.name || route !== '/s') return;
    const brand = document.getElementById('salon-link-brand'); if (!brand) return;
    document.getElementById('salon-link-name').textContent = d.salon.name;
    if (d.salon.logo_url) { const img = document.getElementById('salon-link-logo'); img.src = d.salon.logo_url; img.hidden = false; }
    brand.hidden = false; document.title = d.salon.name + ' · METON';
  } catch {}
}
function legalPage(eyebrow,title,content) {
  return `<div class="narrow">${titleBlock(eyebrow,title,'lastUpdated')}<nav class="legal-tabs" aria-label="${t('legal')}">${[['/terms','termsTitle'],['/privacy','privacyPolicy'],['/refund','refundTitle']].map(([path,key])=>`<a href="${path}"${route===path?' aria-current="page"':''}>${t(key)}</a>`).join('')}</nav><article class="policy">${content[lang] || content.en}</article></div>`;
}
const privacy = () => legalPage('privacy','privacyPolicy',policy);
const termsPage = () => legalPage('legal','termsTitle',terms);
const refundPage = () => legalPage('legal','refundTitle',refund);
function captureDraft() {
  const form = document.querySelector('#register-form,#login-form,#application-form,#setup-form');
  if (!form) return;
  drafts[route] = {};
  for (const el of form.elements) {
    if (!el.name || el.type==='file' || el.type==='submit') continue;
    if (el.type==='radio') { if (el.checked) drafts[route][el.name] = el.value; }
    else drafts[route][el.name] = el.type==='checkbox' ? el.checked : el.value;
  }
}
function restoreDraft() {
  const form = document.querySelector('#register-form,#login-form,#application-form,#setup-form');
  if (!form) return;
  for (const [name,value] of Object.entries(drafts[route] || {})) {
    for (const el of form.elements) {
      if (el.name !== name) continue;
      if (el.type==='radio') el.checked = el.value===value;
      else if (el.type==='checkbox') el.checked = !!value;
      else if (el.type!=='file') el.value = value;
    }
  }
}
// ---- Validation ----------------------------------------------------------------------------------------------
let phoneLib = null;
const loadPhoneLib = async () => phoneLib ||= await import('./lib/phone.js');
// The phone number in E.164 for the chosen code; Israeli and Palestinian local numbers are tried in both (as on the server).
function phoneE164(value, dial) {
  if (!phoneLib || !value.trim()) return null;
  let found = null;
  for (const c of [dial, ...({IL:['PS'],PS:['IL']}[dial] || [])].filter(Boolean)) {
    try { const n = phoneLib.parsePhoneNumberWithError(value, c); if (n.isValid()) { found = n; break; } } catch {}
  }
  if (!found && value.trim().startsWith('+')) { try { const n = phoneLib.parsePhoneNumberWithError(value); if (n.isValid()) found = n; } catch {} }
  // Palestinian mobiles (059, 056) also dial as +972; like the server, treat them as the +970 number they are.
  const pal = found?.number.match(/^\+9725([69]\d{7})$/);
  if (pal) { try { found = phoneLib.parsePhoneNumberWithError('+9705' + pal[1]); } catch {} }
  return found;
}
function rulesFor(form) {
  const el = name => form.elements[name];
  // 2.46: sign in with the email or the phone number of the METON account.
  const phoneRule = v => !V.clean(v) ? 'requiredPhone' : phoneE164(v, el('phoneCountry')?.value) ? null : 'invalidPhone';
  if (form.id === 'login-form') return form.dataset.by === 'phone' ? { phone: phoneRule, password: v => v ? null : 'requiredPassword' }
    : { email: v => V.email(v), password: v => v ? null : 'requiredPassword' };
  if (form.id === 'id-link-form') return { ...(form.dataset.by === 'phone' ? { phone: phoneRule } : { email: v => V.email(v) }), linkPassword: v => v ? null : 'requiredPassword' };
  if (form.id === 'id-phone-form') return { phone: phoneRule };
  if (form.id === 'id-email-form') return { email: v => V.email(v) };
  if (form.id === 'register-form' || form.id === 'setup-form') return {
    ...(form.id === 'setup-form' ? { setupKey: v => V.clean(v).length >= 6 ? null : 'invalidSetupKey' } : {}),
    fullName: V.fullName,
    gender: v => v ? null : 'requiredGender',
    email: V.email,
    password: v => V.password(v, el('email').value),
    passwordConfirm: v => !v ? 'requiredPassword' : v === el('password').value ? null : 'passwordMismatch',
    country: v => v ? null : 'requiredCountry',
  };
  if (form.id === 'profile-form') return { fullName: V.fullName };
  if (form.id === 'password-form') return {
    ...(el('currentPassword') ? { currentPassword: v => v ? null : 'requiredPassword' } : {}),
    newPassword: v => V.password(v, state.user?.email || ''),
    newPasswordConfirm: v => !v ? 'requiredPassword' : v === el('newPassword').value ? null : 'passwordMismatch',
  };
  if (form.id === 'delete-form') return { deletePassword: v => v ? null : 'requiredPassword' };
  if (form.id === 'application-form') return { country: v => v ? null : 'requiredCountry',
    ...(needsId(el('country').value) ? { identityNumber: V.idNumber } : {}), salonName: V.salonName,
    // 2.47: optional (contact only; the business belongs to the applicant's account).
    phone: v => !V.clean(v) ? null : phoneE164(v, el('phoneCountry').value) ? null : 'invalidPhone' };
  return {};
}
// The visible control for a field (country pickers keep their value in a hidden input).
const controlOf = (form, name) => { const c = form.querySelector(`#${name}-btn`) || form.elements[name]; return c instanceof RadioNodeList ? c[0] : c; };
function setFieldState(form, name, code) {
  const control = controlOf(form, name); if (!control) return;
  const wrap = control.closest('.field'), message = document.getElementById(name + '-error');
  if (code) {
    control.setAttribute('aria-invalid', 'true');
    if (message) message.textContent = t(code);
    wrap?.classList.remove('is-valid'); wrap?.classList.add('is-invalid');
    wrap?.classList.remove('shake'); void wrap?.offsetWidth; wrap?.classList.add('shake');
  } else {
    control.removeAttribute('aria-invalid');
    if (message) message.textContent = '';
    wrap?.classList.remove('is-invalid', 'shake');
    wrap?.classList.toggle('is-valid', !!V.clean(form.elements[name]?.value));
  }
}
function validateField(form, name) {
  const rule = rulesFor(form)[name];
  if (!rule) return null;
  const code = rule(form.elements[name]?.value ?? '');
  setFieldState(form, name, code);
  return code;
}
function validateForm(form) {
  const bad = Object.keys(rulesFor(form)).filter(name => validateField(form, name));
  if (bad.length) { showBox(form, 'formFixErrors'); controlOf(form, bad[0])?.focus(); }
  return !bad.length;
}
function showBox(form, code, vars) {
  const box = form.querySelector('#form-error'); if (!box) return;
  box.textContent = t(code, vars); box.hidden = false;
  box.classList.remove('shake'); void box.offsetWidth; box.classList.add('shake');
}
const waitText = seconds => seconds >= 60 ? t('minutesShort', {n: Math.ceil(seconds / 60)}) : t('secondsShort', {n: seconds});
function showError(form, error) {
  if (error.code === 'loginLocked') return showBox(form, 'loginLocked', {time: waitText(error.retryAfter || 60)});
  if (error.field && controlOf(form, error.field)) { setFieldState(form, error.field, error.code); showBox(form, error.code); controlOf(form, error.field).focus(); return; }
  showBox(form, error.code || 'serverError');
  form.querySelector('#form-error')?.focus();
}
function clearErrors(form) {
  const box = form.querySelector('#form-error');
  if (box) { box.hidden = true; box.textContent = ''; }
}
// POST with one automatic retry for an expired CSRF token and, when the server asks, a solved bot challenge.
async function post(path, data, button, busyLabel) {
  for (let attempt = 0; ; attempt++) {
    try { return await api(path, {method:'POST', body:JSON.stringify(data)}); }
    catch (error) {
      if (attempt >= 2) throw error;
      if (error.code === 'sessionExpired' || error.code === 'invalidOrigin') { await refreshSession(); continue; }
      if (error.code !== 'challengeRequired' || data.challenge) throw error;
      setBusy(button, false); setBusy(button, true, t('verifying'));
      data.challenge = await solveChallenge(await api('/api/challenge'));
      setBusy(button, false); setBusy(button, true, busyLabel);
    }
  }
}
async function submitForm(event, path) {
  event.preventDefault();
  const form = event.currentTarget;
  if (form.dataset.busy === 'true') return;
  clearErrors(form);
  if (!validateForm(form)) return;
  const data = Object.fromEntries(new FormData(form));
  if (path === '/api/register' || path === '/api/setup') {
    for (const k of ['fullName','email']) data[k] = V.clean(data[k]);
  }
  if (path === '/api/login') {
    if (form.dataset.by === 'phone') { const n = phoneE164(data.phone, data.phoneCountry); data.identifier = n?.number || ''; data.dial = n?.countryCallingCode || ''; delete data.phone; delete data.phoneCountry; }
    else data.identifier = data.email = V.clean(data.email).toLowerCase();
    data.lang = lang;
  }
  if (path === '/api/register') data.lang = lang;
  if (path === '/api/register/google') data.fullName = V.clean(data.fullName);
  if (path === '/api/applications') {
    if (state.logoLoading) return showError(form, {code:'processing', field:'logo'});
    if (!state.logo) return showError(form, {code:'invalidLogo', field:'logo'});
    if (!form.elements.paymentMethod.value) return showError(form, {code:'invalidPayment'});
    const q = selectedQuote();
    if (needsId(data.country)) data.identityNumber = V.normalizeId(data.identityNumber); else delete data.identityNumber;
    Object.assign(data, {phone:phoneE164(data.phone, data.phoneCountry)?.number || data.phone, salonName:V.clean(data.salonName), teamComposition:form.elements.teamComposition.value, clientele:form.elements.clientele.value, timezone:form.elements.timezone.value, lang, currency:state.currency, interval:state.interval, plan:q.plan.id, loyalty:q.loyalty, option:q.option||'loyalty', trial:!document.getElementById('trial-control').hidden && form.elements.trial.checked, extraSpecialists:Number(form.elements.extraSpecialists.value)||0, logo:state.logo, submissionKey:state.submissionKey});
  }
  const submit = form.querySelector('button[type=submit]');
  const busyLabel = t({'/api/applications':'submitting','/api/login':'signingIn','/api/register':'creatingAccount','/api/register/google':'creatingAccount','/api/setup':'creatingAccount'}[path] || 'processing');
  setBusy(submit, true, busyLabel);
  form.dataset.busy = 'true';
  document.querySelectorAll('select[data-language]').forEach(s=>{s.disabled = true;});
  try {
    const result = await post(path, data, submit, busyLabel);
    // 2.46: the account must add (or confirm) an email before the website opens.
    if (path === '/api/login' && result.step) { form.reset(); state.signinStep = {step:result.step, ticket:result.ticket, email:result.email||'', sent:false}; render(); return; }
    if (result.user) {
      delete drafts[route]; form.reset();
      broadcast('login');
      // A full page load into the next page, built from the server for the signed-in account.
      try { sessionStorage.setItem('salonieer:flash', path === '/api/login' ? 'signedIn:' + result.user.fullName.split(' ')[0] : 'accountCreated'); } catch {}
      // A new business account continues into setting up its business (the page builder, which saves to the account).
      location.replace(path === '/api/setup' ? '/admin' : nextPage(path.startsWith('/api/register') ? '/try/business?save=1' : '/account'));
      return;
    } else {
      state.receipt = result.application; state.logo = ''; state.logoName = '';
      delete drafts[route]; form.reset(); render({transition:true});
      document.querySelector('.receipt')?.focus();
      window.scrollTo({top:0, behavior:'smooth'});
      if (canPayOnline(state.receipt)) document.querySelector(`[data-pay="${CSS.escape(state.receipt.id)}"]`)?.click();
    }
  } catch (error) { showError(form, error); }
  finally {
    if (submit.isConnected) setBusy(submit, false);
    form.dataset.busy = 'false';
    document.querySelectorAll('select[data-language]').forEach(s=>{s.disabled = false;});
  }
}
// Phone photos are several MB; a logo never needs more than 512 px. Re-encoding keeps the upload small (well under
// any host's request limit and quick on mobile data). WebP keeps transparency; browsers that can't encode it give PNG.
const LOGO_MAX = 512;
function shrinkLogo(img, original) {
  const scale = Math.min(1, LOGO_MAX / Math.max(img.width, img.height));
  if (scale === 1 && original.length < 400_000) return original;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.width * scale)); canvas.height = Math.max(1, Math.round(img.height * scale));
    const ctx = canvas.getContext('2d'); ctx.imageSmoothingQuality = 'high'; ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const out = canvas.toDataURL('image/webp', 0.9);
    return /^data:image\/(webp|png);base64,/.test(out) && out.length < original.length ? out : original;
  } catch { return original; }
}
async function loadLogo(file) {
  const form = document.getElementById('application-form');
  if (!file) return;
  const uploadId = (state.uploadId || 0) + 1;
  state.uploadId=uploadId; state.logo=''; state.logoName=''; state.logoLoading=true;
  const image = document.getElementById('logo-preview'); image.hidden=true; image.removeAttribute('src');
  document.getElementById('upload-symbol').hidden=false;
  document.getElementById('logo-filename').textContent='';
  try {
    if (file.size>2*1024*1024) throw {code:'fileTooLarge',field:'logo'};
    if (!['image/png','image/jpeg','image/webp'].includes(file.type)) throw {code:'invalidLogo',field:'logo'};
    const original = await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject({code:'invalidLogo',field:'logo'});reader.readAsDataURL(file);});
    const test = await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>img.width&&img.height&&img.width<=4096&&img.height<=4096&&img.width*img.height<=16_000_000?resolve(img):reject({code:'invalidLogo',field:'logo'});img.onerror=()=>reject({code:'invalidLogo',field:'logo'});img.src=original;});
    const data = shrinkLogo(test, original);
    if (state.uploadId!==uploadId) return;
    state.logo=data; state.logoName=file.name;
    image.src=data; image.hidden=false;
    document.getElementById('upload-symbol').hidden=true;
    document.getElementById('upload-title').textContent=t('replaceLogo');
    document.getElementById('logo-filename').textContent=file.name;
    document.getElementById('logo-error').textContent='';
    form.elements.logo.removeAttribute('aria-invalid');
    const box=form.querySelector('#form-error');box.hidden=true;
  } catch (error) { if(state.uploadId===uploadId){form.elements.logo.value='';showError(form,error);} }
  finally { if(state.uploadId===uploadId)state.logoLoading=false; }
}
// The phone field's code picker: a pasted international number switches the code, valid numbers are tidied.
function bindPhoneField(form) {
  const phone = form.elements.phone, dialRoot = form.querySelector('[data-cpick="dial"]');
  if (!phone || !dialRoot) return;
  const placeholder = () => { try { phone.placeholder = phoneLib.getExampleNumber(dial.value, phoneLib.examples)?.formatNational() || ''; } catch { phone.placeholder = ''; } };
  const recheck = () => { if (V.clean(phone.value)) validateField(form, 'phone'); };
  let picked = false;
  const dial = bindCountryPicker(dialRoot, pickerOptions({pinned:PINNED, onChange:()=>{ picked = true; placeholder(); recheck(); phone.focus(); }}));
  if (dial.value) dial.choose(dial.value, {silent:true});
  placeholder();
  // The code follows the salon's country until a number is typed or a code is picked by hand.
  const follow = code => { if (!picked && !V.clean(phone.value) && dialCodeOf(code)) { dial.choose(code, {silent:true}); placeholder(); } };
  phone.addEventListener('input', () => {
    const v = phone.value.trim();
    if (!/^(\+|00)/.test(v)) return;
    try { const n = phoneLib.parsePhoneNumberWithError(v.replace(/^00/, '+')); if (n.country && n.country !== dial.value && n.isPossible()) { dial.choose(n.country, {silent:true}); placeholder(); } } catch {}
  });
  phone.addEventListener('blur', () => { const n = phoneE164(phone.value, dial.value); if (n) { if (n.country && n.country !== dial.value) dial.choose(n.country, {silent:true}); phone.value = n.formatNational(); } });
  return { follow };
}
// The application's ID field is shown (and checked) only when the salon's country needs one.
function syncIdentity(form) {
  const input = form.elements.identityNumber, show = needsId(form.elements.country.value);
  document.getElementById('identity-field').hidden = !show; input.disabled = !show;
  if (!show) setFieldState(form, 'identityNumber', null);
}
function bindAccountForm(form) {
  const country = bindCountryPicker(form.querySelector('[data-cpick="country"]'), pickerOptions({pinned:PINNED, onChange:()=>validateField(form, 'country')}));
  if (country.value) country.choose(country.value, {silent:true});
  const meter = form.querySelector('#pw-meter');
  form.elements.password.addEventListener('input', () => {
    const score = V.passwordScore(form.elements.password.value);
    meter.dataset.score = score;
    meter.querySelector('span').textContent = score ? `${t('pwStrength')}: ${t('pw' + score)}` : '';
  });
  form.addEventListener('submit', event => submitForm(event, form.id === 'setup-form' ? '/api/setup' : '/api/register'));
}
// ---- Auth state ---------------------------------------------------------------------------------------------------
let channel; try { channel = new BroadcastChannel('salonieer-auth'); } catch {}
const broadcast = type => { try { channel?.postMessage(type); } catch {} };
let lastSessionCheck = 0;
async function refreshSession() {
  const session = await api('/api/session');
  state.user = session.user; state.csrf = session.csrf; state.checkout = session.checkout; state.platform = session.platform || null; state.google = !!session.google; state.googleSignup = session.googleSignup || null;
  lastSessionCheck = Date.now();
  return session;
}
async function logout(button) {
  if (!button || button.dataset.busy === 'true') return;
  setBusy(button, true, t('signingOut'));
  try { await api('/api/logout', {method:'POST', body:'{}'}); }
  catch (error) { if (error.code === 'connectionError') { setBusy(button, false); toast(t('connectionError'), 'error'); return; } }
  // Signed out locally whatever the server said: the cookie is cleared server-side, and a fresh guest session follows.
  broadcast('logout');
  // A full page load: header, menus and every piece of page data are rebuilt from the server as a signed-out visitor.
  try { sessionStorage.setItem('salonieer:flash', 'signedOut'); } catch {}
  location.replace(isPrivate(route) ? '/' : location.pathname + location.search);
}
function bind() {
  document.querySelectorAll('select[data-language]').forEach(s=>s.addEventListener('change',event=>{captureDraft();setLanguage(event.target.value);document.body.classList.remove('menu-open');render({transition:true});}));
  document.querySelectorAll('select[data-appearance]').forEach(s=>s.addEventListener('change',event=>{
    window.metonAppearance?.set(event.target.value);
    document.querySelectorAll('select[data-appearance]').forEach(o=>{ if (o !== event.target) o.value = event.target.value; });
  }));
  startAuthClock();
  bindNotifs();
  const menu = document.getElementById('menu-toggle'), nav = document.getElementById('nav-panel');
  menu?.addEventListener('click',()=>{const open=nav.classList.toggle('open');menu.setAttribute('aria-expanded',String(open));});
  nav?.addEventListener('keydown',event=>{if(event.key==='Escape'){nav.classList.remove('open');menu.setAttribute('aria-expanded','false');menu.focus();}});
  // A menu link to a section of the home page closes the menu.
  nav?.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>{nav.classList.remove('open');menu?.setAttribute('aria-expanded','false');}));
  document.getElementById('logout')?.addEventListener('click',event=>logout(event.currentTarget));
  document.getElementById('logout-menu')?.addEventListener('click',event=>logout(event.currentTarget));
  // "Download METON" on a computer: the store menu closes on a click elsewhere or Escape.
  document.querySelectorAll('details.app-get').forEach(d=>{
    const close=e=>{ if(d.open&&(e.type!=='keydown'||e.key==='Escape')&&!(e.type==='click'&&d.contains(e.target))){ d.open=false; if(e.type==='keydown') d.querySelector('summary')?.focus(); } };
    d.addEventListener('toggle',()=>{ if(d.open){ document.addEventListener('click',close); document.addEventListener('keydown',close); } else { document.removeEventListener('click',close); document.removeEventListener('keydown',close); } });
  });
  document.querySelectorAll('[data-password]').forEach(button=>button.addEventListener('click',()=>{
    const input=document.getElementById(button.dataset.password);const visible=input.type==='password';input.type=visible?'text':'password';
    input.setAttribute('data-ltr','');button.textContent=t(visible?'hide':'show');button.setAttribute('aria-label',`${t(visible?'hide':'show')} ${t(button.dataset.password)}`);
  }));
  // Fields are checked when you leave them, and re-checked as you type once they have shown an error.
  document.querySelectorAll('form[novalidate]').forEach(form=>{
    form.addEventListener('focusout',event=>{ const name=event.target.name; if (name && rulesFor(form)[name] && (V.clean(event.target.value) || event.target.closest('.field')?.classList.contains('is-invalid'))) validateField(form,name); });
    form.addEventListener('input',event=>{
      const name=event.target.name; if (!name) return;
      if (event.target.closest('.field')?.classList.contains('is-invalid') || event.target.closest('.field')?.classList.contains('is-valid')) validateField(form,name);
      if (name==='password' && form.elements.passwordConfirm?.value) validateField(form,'passwordConfirm');
    });
  });
  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    document.querySelectorAll('[data-login-by] [data-by]').forEach(b => b.addEventListener('click', () => {
      if (state.loginBy === b.dataset.by || (!state.loginBy && b.dataset.by === 'email')) return;
      const password = loginForm.elements.password.value;
      state.loginBy = b.dataset.by; render();
      const again = document.getElementById('login-form'); if (again) { again.elements.password.value = password; again.querySelector(state.loginBy === 'phone' ? '#phone' : '#email')?.focus(); }
    }));
    if (loginForm.dataset.by === 'phone') bindPhoneField(loginForm);
    loginForm.addEventListener('submit', event => submitForm(event, '/api/login'));
  }
  bindSigninStep();
  const registerForm = document.getElementById('register-form') || document.getElementById('setup-form');
  if (registerForm) bindAccountForm(registerForm);
  const googleForm = document.getElementById('google-signup-form');
  if (googleForm) {
    const gc = bindCountryPicker(googleForm.querySelector('[data-cpick="country"]'), pickerOptions({pinned:PINNED, onChange:()=>validateField(googleForm, 'country')}));
    if (gc.value) gc.choose(gc.value, {silent:true});
    googleForm.addEventListener('submit', event => submitForm(event, '/api/register/google'));
  }
  const applicationForm = document.getElementById('application-form');
  if (applicationForm) {
    if (!drafts[route]) {
      // The plan from the link; the Plan Finder's link also brings the Basic option and the extra specialists.
      const q = new URLSearchParams(location.search);
      applicationForm.elements.plan.value = q.get('plan') || 'basic';
      if (['loyalty','smart_waitlist'].includes(q.get('option'))) applicationForm.elements.basicOption.value = q.get('option');
      const extra = /^\d{1,2}$/.test(q.get('extra') || '') ? Number(q.get('extra')) : 0;
      if (extra > 0 && extra <= 50) applicationForm.elements.extraSpecialists.value = String(extra);
      // Coming from the page builder (Try METON Free): the business name, its logo and who works there / who it serves
      // are already known (shown here, so the owner can still change them).
      try {
        const built = JSON.parse(localStorage.getItem('meton_demo_v2') || 'null');
        if (built?.name && !applicationForm.elements.salonName.value) applicationForm.elements.salonName.value = String(built.name).slice(0, 100);
        const team = { male:'male', female:'female', mixed:'mixed' }[built?.providers], served = { male:'men', female:'women', mixed:'both' }[built?.customers];
        if (team && !applicationForm.elements.teamComposition.value) applicationForm.elements.teamComposition.value = team;
        if (served && !applicationForm.elements.clientele.value) applicationForm.elements.clientele.value = served;
        if (!state.logo && /^data:image\/(png|jpeg|webp);base64,/.test(built?.look?.logo || '')) {
          state.logo = built.look.logo; state.logoName = '';
          const img = document.getElementById('logo-preview'); if (img) { img.src = state.logo; img.hidden = false; }
          const sym = document.getElementById('upload-symbol'); if (sym) sym.hidden = true;
          const title = document.getElementById('upload-title'); if (title) title.textContent = t('replaceLogo');
        }
      } catch {}
    }
    for (const name of ['plan','basicOption','extraSpecialists','paymentMethod','trial']) {
      applicationForm.querySelectorAll(`[name="${name}"]`).forEach(el=>el.addEventListener('input',syncApplication));
    }
    const phoneCode = bindPhoneField(applicationForm);
    const salonCountry = bindCountryPicker(applicationForm.querySelector('[data-cpick="country"]'), pickerOptions({pinned:PINNED, onChange:code=>{ syncIdentity(applicationForm); validateField(applicationForm,'country'); phoneCode?.follow(code); }}));
    if (salonCountry.value) salonCountry.choose(salonCountry.value, {silent:true});
    syncIdentity(applicationForm);
    applicationForm.elements.logo.addEventListener('change',event=>loadLogo(event.target.files[0]));
    applicationForm.addEventListener('submit',event=>submitForm(event,'/api/applications'));
    syncApplication();
  }
  document.querySelectorAll('[data-pay]').forEach(button=>button.addEventListener('click',async()=>{
    const a = state.receipt?.id===button.dataset.pay ? state.receipt : state.applications.find(x=>x.id===button.dataset.pay);
    const feedback = document.querySelector(`[data-pay-feedback="${CSS.escape(button.dataset.pay)}"]`);
    button.disabled = true; feedback.textContent = t('openingCheckout');
    try { await openCheckout(a); feedback.textContent = ''; }
    catch (error) { feedback.textContent = t(error.code || 'checkoutUnavailable'); }
    finally { button.disabled = false; }
  }));
  document.getElementById('manage-billing')?.addEventListener('click',async event=>{
    const button=event.currentTarget, feedback=document.getElementById('billing-feedback');
    button.disabled=true; feedback.textContent=t('openingPortal');
    try { const result=await api('/api/billing/portal',{method:'POST',body:'{}'}); location.assign(result.url); }
    catch(error){ feedback.textContent=t(error.code||'serverError'); button.disabled=false; }
  });
  document.getElementById('refresh-billing')?.addEventListener('click',()=>loadRoute());
  document.getElementById('open-checkout')?.addEventListener('click',async event=>{
    event.currentTarget.hidden = true;
    try { openPaymentLinkCheckout(await loadPaddle()); }
    catch (error) { document.getElementById('checkout-status').textContent = t(error.code || 'checkoutUnavailable'); }
  });
  document.getElementById('copy-invite')?.addEventListener('click',async e=>{const b=e.currentTarget;try{await navigator.clipboard.writeText(document.getElementById('invite-code').textContent);toast(b.dataset.copied,'success');}catch{}});
  if (route === '/s') bindBook(bookContext());
  if (route === '/m') bindManage(bookContext());
  if (route === '/me') bindMe(bookContext());
  if (route === '/try') bindTry(bookContext());
  if (route === '/forgot') bindForgot(bookContext());
  document.getElementById('copy-email')?.addEventListener('click',async()=>{
    try { await navigator.clipboard.writeText('support@meton.work');document.getElementById('copy-feedback').textContent=t('copied'); }
    catch { document.getElementById('copy-feedback').textContent=t('copyFailed'); }
  });
  document.querySelectorAll('[data-display-currency]').forEach(select=>select.addEventListener('change',()=>{
    const all = [...document.querySelectorAll('[data-display-currency]')], at = all.indexOf(select);
    captureDraft();setDisplayCurrency(select.value);paint();
    document.querySelectorAll('[data-display-currency]')[at]?.focus();
  }));
  document.querySelectorAll('[data-interval]').forEach(button=>button.addEventListener('click',()=>{
    if (button.dataset.interval===state.interval) return;
    captureDraft();setInterval_(button.dataset.interval);paint();
    document.querySelector(`[data-interval="${state.interval}"]`)?.focus();
  }));
  document.querySelectorAll('[data-filter]').forEach(button=>button.addEventListener('click',()=>{state.filter=button.dataset.filter;paint();}));
  if (route === '/plans') bindPlanFinder(finderContext());
  bindApplicationActions();
  bindBilling();
  bindAccountSettings();
  bindIdentity();
  document.querySelectorAll('form[data-report]').forEach(form=>form.addEventListener('submit',async event=>{
    event.preventDefault();
    const button=form.querySelector('button[type=submit]'), feedback=form.querySelector('.status-feedback'), message=form.elements.message.value.trim();
    feedback.textContent='';
    if (message.length<10) { feedback.textContent=t('reportMessageInvalid'); form.elements.message.focus(); return; }
    setBusy(button,true,t('processing'));
    try {
      await post(`/api/salons/${encodeURIComponent(form.dataset.report)}/report`,{category:form.elements.category.value,message},button,t('processing'));
      form.reset(); feedback.textContent=t('reportSent'); toast(t('reportSent'));
    } catch (error) { feedback.textContent=t(error.code||'serverError'); }
    finally { if (button.isConnected) setBusy(button,false); }
  }));
}
// Account settings: the name, the password (signs out other devices) and deleting the account.
function bindAccountSettings() {
  const profile = document.getElementById('profile-form');
  if (profile) {
    if (!profile.elements.fullName.value) profile.elements.fullName.value = state.user?.fullName || '';
    profile.addEventListener('submit', async event => {
      event.preventDefault(); clearErrors(profile);
      if (!validateForm(profile)) return;
      const button = profile.querySelector('[type=submit]');
      setBusy(button, true, t('processing'));
      try {
        const result = await api('/api/account', {method:'PATCH', body:JSON.stringify({fullName:V.clean(profile.elements.fullName.value), gender:profile.elements.gender.value||undefined})});
        state.user = result.user; delete drafts[route]; toast(t('profileSaved'), 'success'); render();
      } catch (error) { showError(profile, error); }
      finally { if (button.isConnected) setBusy(button, false); }
    });
  }
  const password = document.getElementById('password-form');
  if (password) password.addEventListener('submit', async event => {
    event.preventDefault(); clearErrors(password);
    if (!validateForm(password)) return;
    const button = password.querySelector('[type=submit]');
    setBusy(button, true, t('processing'));
    try {
      const result = await post('/api/account/password', {currentPassword:password.elements.currentPassword?.value || '', newPassword:password.elements.newPassword.value, newPasswordConfirm:password.elements.newPasswordConfirm.value}, button, t('processing'));
      if (result.csrf) state.csrf = result.csrf;
      password.reset(); delete drafts[route]; toast(t('passwordChanged'), 'success');
      if (state.identity && !state.identity.hasPassword) { state.identity = {...state.identity, hasPassword:true}; render(); }
    } catch (error) { showError(password, error); }
    finally { if (button.isConnected) setBusy(button, false); }
  });
  const remove = document.getElementById('delete-form');
  if (remove) remove.addEventListener('submit', async event => {
    event.preventDefault(); clearErrors(remove);
    if (!validateForm(remove)) return;
    if (!remove.elements.understand.checked) { showBox(remove, 'deleteTickBox'); remove.elements.understand.focus(); return; }
    if (!(await confirmDialog({title:t('deleteAccount'), body:t('deleteConfirmBody'), confirm:t('deleteAccountForever'), cancel:t('tm_cancel'), tone:'danger'}))) return;
    const button = remove.querySelector('[type=submit]');
    setBusy(button, true, t('processing'));
    try {
      await post('/api/account/delete', {password:remove.elements.deletePassword.value, confirm:'DELETE'}, button, t('processing'));
      broadcast('logout');
      try { sessionStorage.setItem('salonieer:flash', 'accountDeleted'); } catch {}
      location.replace('/');
    } catch (error) { showError(remove, error.field === 'password' ? {...error, field:'deletePassword'} : error); if (button.isConnected) setBusy(button, false); }
  });
}
// 2.46: the extra sign-in step (add or confirm an email with a code).
function bindSigninStep() {
  const form = document.getElementById('signin-step-form'), s = state.signinStep;
  if (!form || !s) return;
  const send = async button => {
    const email = s.step === 'confirm' ? s.email : V.clean(form.elements.email?.value || s.email).toLowerCase();
    const r = await post('/api/login/email', {ticket:s.ticket, email, lang}, button, t('processing'));
    state.signinStep = {...s, sent:true, email:r.email}; render();
  };
  const expired = error => { if (error.code !== 'signinExpired') return false; state.signinStep = null; render(); toast(t('signinExpired'), 'error'); return true; };
  form.addEventListener('submit', async event => {
    event.preventDefault(); clearErrors(form);
    const button = form.querySelector('[type=submit]');
    if (!(s.sent || s.step === 'confirm')) {
      if (V.email(form.elements.email.value)) { setFieldState(form, 'email', V.email(form.elements.email.value)); return; }
      setBusy(button, true, t('processing'));
      try { await send(button); } catch (error) { if (!expired(error)) showError(form, error); } finally { if (button.isConnected) setBusy(button, false); }
      return;
    }
    const code = String(form.elements.code.value || '').replace(/\D/g, '');
    if (code.length !== 6) { setFieldState(form, 'code', 'enterCode'); return; }
    setBusy(button, true, t('signingIn'));
    try {
      const r = await post('/api/login/verify', {ticket:s.ticket, code}, button, t('signingIn'));
      state.signinStep = null; broadcast('login');
      try { sessionStorage.setItem('salonieer:flash', 'signedIn:' + r.user.fullName.split(' ')[0]); } catch {}
      location.replace(nextPage('/account'));
    } catch (error) { if (!expired(error)) showError(form, error); if (button.isConnected) setBusy(button, false); }
  });
  form.querySelector('[data-step-resend]')?.addEventListener('click', async event => { try { await send(event.currentTarget); toast(t('codeResent'), 'success'); } catch (error) { if (!expired(error)) showError(form, error); } });
  form.querySelector('[data-step-change]')?.addEventListener('click', () => { state.signinStep = {...s, sent:false}; render(); });
  document.querySelector('[data-step-cancel]')?.addEventListener('click', () => { state.signinStep = null; render(); });
}

// 2.46: how this METON account signs in (the same in the app): its email and phone number, each confirmed with a code,
// and another METON account of the same person linked into this one.
function identitySection() {
  const id = state.identity; if (!id) return '';
  const e = state.idEdit || {};
  const badge = (on, yes, no) => `<span class="id-badge ${on ? 'is-on' : 'is-off'}">${t(on ? yes : no)}</span>`;
  const codeForm = (kind, target) => `<form id="id-code-form" class="id-editor" data-kind="${kind}" novalidate>${formErrorBox()}<p class="notice info">${t('codeSentTo')} <b dir="ltr">${esc(target)}</b></p>${field('code','codeLabel',{maxlength:6,autocomplete:'one-time-code',extra:'inputmode="numeric" dir="ltr"'})}<div class="id-editor-actions"><button class="btn small primary" type="submit">${t('confirmCode')}</button><button class="btn small" type="button" data-id-resend>${t('resendCode')}</button><button class="text-link" type="button" data-id-cancel>${t('tm_cancel')}</button></div></form>`;
  let editor = '';
  if (e.kind === 'email') editor = e.stage === 'code' ? codeForm('email', e.value) : `<form id="id-email-form" class="id-editor" novalidate>${formErrorBox()}${field('email', id.email ? 'newEmail' : 'email', {type:'email',autocomplete:'email',maxlength:254,placeholder:'you@example.com',extra:'spellcheck="false" autocapitalize="off"'})}<div class="id-editor-actions"><button class="btn small primary" type="submit">${t('sendCode')}</button><button class="text-link" type="button" data-id-cancel>${t('tm_cancel')}</button></div></form>`;
  if (e.kind === 'phone') editor = e.stage === 'code' ? codeForm('phone', e.value) : `<form id="id-phone-form" class="id-editor" novalidate>${formErrorBox()}${loginPhoneField()}<p class="small-note">${t(id.phoneCodes ? 'phoneCodeByWhatsapp' : 'phoneNoCodesYet')}</p><div class="id-editor-actions"><button class="btn small primary" type="submit">${t(id.phoneCodes ? 'sendCode' : 'savePhone')}</button><button class="text-link" type="button" data-id-cancel>${t('tm_cancel')}</button></div></form>`;
  const by = e.by === 'phone' ? 'phone' : 'email';
  if (e.kind === 'link') editor = e.stage === 'review' ? linkReview(e) : `<form id="id-link-form" class="id-editor" data-by="${by}" novalidate>${formErrorBox()}<p class="small-note">${t('linkLead')}</p>${signInWith(by, ' data-link-by')}${by==='email'?field('email','email',{type:'email',autocomplete:'off',maxlength:254,placeholder:'you@example.com',extra:'spellcheck="false" autocapitalize="off"'}):loginPhoneField()}${field('linkPassword','linkPassword',{type:'password',autocomplete:'off',maxlength:128})}<div class="id-editor-actions"><button class="btn small primary" type="submit">${t('continue')}</button><button class="text-link" type="button" data-id-cancel>${t('tm_cancel')}</button></div></form>`;
  const emailRow = id.email ? `<b dir="ltr">${esc(id.email)}</b> ${badge(id.emailConfirmed, 'idConfirmed', 'idNotConfirmed')}` : `<span class="muted">${t('idNoEmail')}</span>`;
  const fmtPhone = v => { const ps = String(v || '').replace(/[^\d+]/g, '').match(/^\+970(5\d)(\d{3})(\d{4})$/);   // +970 59 XXX XXXX (owner's format)
    if (ps) return `+970 ${ps[1]} ${ps[2]} ${ps[3]}`; try { return phoneLib.parsePhoneNumberWithError(v).formatInternational(); } catch { return v; } };
  const phoneRow = id.phone ? `<b dir="ltr">${esc(fmtPhone(id.phone))}</b> ${badge(id.phoneConfirmed || id.phoneLogin, id.phoneConfirmed ? 'idConfirmed' : 'idSignsIn', 'idNotConfirmed')}` : `<span class="muted">${t('idNoPhone')}</span>`;
  return `<section class="settings-card id-card" aria-labelledby="id-title"><h3 id="id-title">${t('signInMethods')}</h3><p class="small-note">${t('signInMethodsLead')}</p>
    <div class="id-row"><div class="id-what"><span class="id-label">${t('email')}</span>${emailRow}</div><div class="id-actions">${id.email && !id.emailConfirmed ? `<button type="button" class="btn small" data-id-confirm-email>${t('confirmEmail')}</button>` : ''}<button type="button" class="btn small" data-id-edit="email">${t(id.email ? 'changeEmail' : 'addEmail')}</button></div></div>
    ${id.emailPending ? `<p class="small-note">${t('emailPendingNote', {email: id.emailPending})}</p>` : ''}
    <div class="id-row"><div class="id-what"><span class="id-label">${t('phoneNumber')}</span>${phoneRow}</div><div class="id-actions"><button type="button" class="btn small" data-id-edit="phone">${t(id.phone ? 'changePhone' : 'addPhone')}</button></div></div>
    ${id.phone && !id.phoneLogin ? `<p class="small-note">${t('phoneNotForLogin')}</p>` : ''}
    ${id.google && id.emailConfirmed ? `<p class="small-note">${t('googleWorksToo')}</p>` : ''}
    ${editor}
    <p class="small-note id-link">${t('idConflictHint')}</p></section>`;
}
function linkReview(e) {
  const o = e.other || {}, blocked = (e.blockers || []).length;
  const list = (o.businesses || []).map(b => `<li>${esc(b.name)}${b.owned ? ` · ${t('owner')}` : ''}</li>`).join('');
  const why = (e.blockers || []).map(b => `<li>${esc(t('linkBlock_' + b.code, {list: (b.businesses || []).join(', ')}))}</li>`).join('');
  return `<div class="id-editor id-review"><p><b>${t('linkFound')}</b></p><dl class="application-meta"><div><dt>${t('fullName')}</dt><dd>${esc(o.name || '')}</dd></div>${o.email ? `<div><dt>${t('email')}</dt><dd dir="ltr">${esc(o.email)}</dd></div>` : ''}${o.phone ? `<div><dt>${t('phoneNumber')}</dt><dd dir="ltr">${esc(o.phone)}</dd></div>` : ''}</dl>
    ${list ? `<p class="small-note">${t('linkBusinesses')}</p><ul class="block-list">${list}</ul>` : ''}
    ${blocked ? `<div class="notice warning"><p>${t('linkBlocked')}</p><ul class="block-list">${why}</ul></div>` : `<p class="small-note">${t('linkWhatHappens')}</p>`}
    <div class="id-editor-actions">${blocked ? '' : `<button class="btn small primary" type="button" data-id-link-go>${t('linkConfirm')}</button>`}<button class="text-link" type="button" data-id-cancel>${t('tm_cancel')}</button></div></div>`;
}
function bindIdentity() {
  const card = document.querySelector('.id-card'); if (!card) return;
  const set = edit => { state.idEdit = edit; render(); document.querySelector('.id-editor input:not([type=hidden])')?.focus(); };
  const apply = r => { if (r.identity) state.identity = r.identity; if (r.user) state.user = r.user; };
  card.querySelectorAll('[data-id-edit]').forEach(b => b.addEventListener('click', () => set({kind:b.dataset.idEdit, stage:'enter'})));
  card.querySelectorAll('[data-id-cancel]').forEach(b => b.addEventListener('click', () => set(null)));
  card.querySelector('[data-id-confirm-email]')?.addEventListener('click', async ev => {
    try { const r = await post('/api/account/email', {email:state.identity.email, lang}, ev.currentTarget, t('processing')); apply(r); set({kind:'email', stage:'code', value:state.identity.email}); }
    catch (error) { toast(t(error.code || 'serverError'), 'error'); }
  });
  card.querySelectorAll('[data-link-by] [data-by]').forEach(b => b.addEventListener('click', () => set({...state.idEdit, by:b.dataset.by})));
  const emailForm = document.getElementById('id-email-form');
  emailForm?.addEventListener('submit', async ev => {
    ev.preventDefault(); clearErrors(emailForm); if (!validateForm(emailForm)) return;
    const value = V.clean(emailForm.elements.email.value).toLowerCase(), button = emailForm.querySelector('[type=submit]');
    setBusy(button, true, t('processing'));
    try { const r = await post('/api/account/email', {email:value, lang}, button, t('processing')); apply(r); set(r.status === 'verified' ? null : {kind:'email', stage:'code', value}); }
    catch (error) { showError(emailForm, error); if (button.isConnected) setBusy(button, false); }
  });
  const phoneForm = document.getElementById('id-phone-form');
  if (phoneForm) {
    bindPhoneField(phoneForm);
    phoneForm.addEventListener('submit', async ev => {
      ev.preventDefault(); clearErrors(phoneForm); if (!validateForm(phoneForm)) return;
      const n = phoneE164(phoneForm.elements.phone.value, phoneForm.elements.phoneCountry.value), button = phoneForm.querySelector('[type=submit]');
      setBusy(button, true, t('processing'));
      try {
        const r = await post('/api/account/phone', {phone:n.number, dial:n.countryCallingCode, lang}, button, t('processing')); apply(r);
        if (r.status === 'code_sent') set({kind:'phone', stage:'code', value:n.number}); else { set(null); toast(t(r.status === 'saved' ? 'phoneSavedUnconfirmed' : 'phoneConfirmed'), 'success'); }
      } catch (error) { showError(phoneForm, error); if (button.isConnected) setBusy(button, false); }
    });
  }
  const codeForm = document.getElementById('id-code-form');
  if (codeForm) {
    const kind = codeForm.dataset.kind;
    codeForm.addEventListener('submit', async ev => {
      ev.preventDefault(); clearErrors(codeForm);
      const code = String(codeForm.elements.code.value || '').replace(/\D/g, ''), button = codeForm.querySelector('[type=submit]');
      if (code.length !== 6) { setFieldState(codeForm, 'code', 'enterCode'); return; }
      setBusy(button, true, t('processing'));
      try { const r = await post(`/api/account/${kind}/verify`, {code}, button, t('processing')); apply(r); set(null); toast(t(kind === 'email' ? 'emailConfirmed' : 'phoneConfirmed'), 'success'); }
      catch (error) { showError(codeForm, error); if (button.isConnected) setBusy(button, false); }
    });
    codeForm.querySelector('[data-id-resend]')?.addEventListener('click', async ev => {
      try { const v = state.idEdit.value; const r = await post(`/api/account/${kind}`, kind === 'email' ? {email:v, lang} : {phone:v, dial:'', lang}, ev.currentTarget, t('processing')); apply(r); toast(t('codeResent'), 'success'); }
      catch (error) { showError(codeForm, error); }
    });
  }
  const linkForm = document.getElementById('id-link-form');
  if (linkForm) {
    if (linkForm.dataset.by === 'phone') bindPhoneField(linkForm);
    linkForm.addEventListener('submit', async ev => {
      ev.preventDefault(); clearErrors(linkForm); if (!validateForm(linkForm)) return;
      const phone = linkForm.dataset.by === 'phone' ? phoneE164(linkForm.elements.phone.value, linkForm.elements.phoneCountry.value) : null;
      const button = linkForm.querySelector('[type=submit]'); setBusy(button, true, t('processing'));
      try {
        const r = await post('/api/account/link', {identifier: phone ? phone.number : V.clean(linkForm.elements.email.value).toLowerCase(), dial: phone ? phone.countryCallingCode : '', password: linkForm.elements.linkPassword.value}, button, t('processing'));
        set({kind:'link', stage:'review', ticket:r.ticket, other:r.other, blockers:r.blockers});
      } catch (error) { showError(linkForm, error.field === 'identifier' ? {...error, field:null} : error); if (button.isConnected) setBusy(button, false); }
    });
  }
  card.querySelector('[data-id-link-go]')?.addEventListener('click', async ev => {
    try { const r = await post('/api/account/link/finish', {ticket:state.idEdit.ticket}, ev.currentTarget, t('processing')); apply(r); set(null); toast(t('linkDone'), 'success'); loadRoute({quiet:true}); }
    catch (error) { toast(t(error.code || 'serverError'), 'error'); }
  });
}

// Account page: salon billing actions. Each one re-reads the account so the cards show what Paddle now says.
async function billingAction(button, path, data={}) {
  setBusy(button, true, t('processing'));
  try { return await api(path, {method:'POST', body:JSON.stringify(data)}); }
  catch (error) { toast(t(error.code || 'serverError'), 'error'); return null; }
  finally { if (button.isConnected) setBusy(button, false); }
}
const changeData = form => ({ plan:form.elements.plan.value, interval:form.elements.interval.value, extraSpecialists:Math.max(0,Math.min(50,parseInt(form.elements.extraSpecialists.value,10)||0)), loyalty:!!form.elements.basicOption.value && form.elements.plan.value==='basic', option:form.elements.basicOption.value||'loyalty' });
function bindBilling() {
  document.querySelectorAll('[data-bill-cancel]').forEach(button=>button.addEventListener('click',async()=>{
    const until = button.dataset.until ? date(button.dataset.until) : '';
    if (!(await confirmDialog({title:t('cancelRenewTitle'), body:t('cancelRenewBody',{date:until}), confirm:t('cancelAutoRenew'), cancel:t('keepSubscription'), tone:'danger'}))) return;
    if (await billingAction(button, `/api/salons/${button.dataset.billCancel}/cancel`)) { toast(t('cancelScheduledToast',{date:until}), 'success'); loadRoute({quiet:true, afterAction:true}); }
  }));
  document.querySelectorAll('[data-bill-resume]').forEach(button=>button.addEventListener('click',async()=>{
    if (await billingAction(button, `/api/salons/${button.dataset.billResume}/resume`)) { toast(t('resumedToast'), 'success'); loadRoute({quiet:true, afterAction:true}); }
  }));
  document.querySelectorAll('[data-bill-pay]').forEach(button=>button.addEventListener('click',async()=>{
    const result = await billingAction(button, `/api/salons/${button.dataset.billPay}/pay`);
    if (!result?.transactionId) return;
    try {
      const paddle = await loadPaddle();
      state.billingPaying = true;
      paddle.Checkout.open({ transactionId: result.transactionId, settings: { displayMode:'overlay', theme:paddleTheme(), ...(['en','ar'].includes(lang)?{locale:lang}:{}) } });
    } catch (error) { toast(t(error.code || 'checkoutUnavailable'), 'error'); }
  }));
  document.querySelectorAll('[data-change-withdraw]').forEach(button=>button.addEventListener('click',async()=>{
    if (await billingAction(button, `/api/salons/${button.dataset.changeWithdraw}/change-cancel`)) { toast(t('requestWithdrawn'), 'success'); loadRoute({quiet:true, afterAction:true}); }
  }));
  document.querySelectorAll('[data-change-open]').forEach(button=>button.addEventListener('click',()=>{
    const form = document.querySelector(`[data-change-form="${CSS.escape(button.dataset.changeOpen)}"]`);
    form.hidden = false; button.hidden = true; form.querySelector('select')?.focus();
  }));
  document.querySelectorAll('[data-change-form]').forEach(form=>{
    const app = form.dataset.changeForm, box = form.querySelector('[data-change-preview]');
    const syncLoyalty = () => { form.querySelector('[data-loyalty-field]').hidden = form.elements.plan.value!=='basic'; box.innerHTML=''; };
    form.elements.plan.addEventListener('change', syncLoyalty); syncLoyalty();
    form.addEventListener('input', event => { if (event.target.name !== 'note') box.innerHTML = ''; });
    form.querySelector('[data-change-close]').addEventListener('click',()=>{ form.hidden = true; const open = document.querySelector(`[data-change-open="${CSS.escape(app)}"]`); if (open) { open.hidden = false; open.focus(); } });
    form.querySelector('[data-change-preview-btn]').addEventListener('click',async event=>{
      const result = await billingAction(event.currentTarget, `/api/salons/${app}/change-preview`, changeData(form));
      const p = result?.preview; if (!p) return;
      const fit = p.check && !p.check.ok ? `<p class="notice warning">${t('tooManySpecialistsOwner',{active:p.check.active,limit:p.check.limit})}</p>` : '';
      box.innerHTML = `<dl class="application-meta"><div><dt>${t('dueNow')}</dt><dd class="price-value"><bdi>${esc(p.immediate)}</bdi></dd></div><div><dt>${t('thenEachPeriod')}</dt><dd><bdi>${esc(p.next || '—')}</bdi></dd></div>${p.nextBilledAt?`<div><dt>${t('nextBilling')}</dt><dd>${date(p.nextBilledAt)}</dd></div>`:''}</dl><p class="small-note">${t('previewNote')}</p>${fit}`;
    });
    form.addEventListener('submit',async event=>{
      event.preventDefault();
      const submit = form.querySelector('[type=submit]');
      if (await billingAction(submit, `/api/salons/${app}/change-request`, {...changeData(form), note:form.elements.note.value.trim()})) { toast(t('requestSentToast'), 'success'); loadRoute({quiet:true, afterAction:true}); }
    });
  });
  document.querySelectorAll('[data-invoice-pdf]').forEach(button=>button.addEventListener('click',async()=>{
    // Opened at once (a click), filled in when the link arrives: phones block windows opened later.
    const win = window.open('', '_blank');
    setBusy(button, true, t('processing'));
    try {
      const { url } = await api(`/api/invoices/${button.dataset.invoicePdf}/pdf`);
      if (win) { win.opener = null; win.location.href = url; } else location.assign(url);
    } catch (error) { win?.close(); toast(t(error.code || 'serverError'), 'error'); }
    finally { if (button.isConnected) setBusy(button, false); }
  }));
}
// The server answers every application action with the updated application; it replaces the copy on screen.
function showApplication(a, message) {
  if (!a) return;
  if (state.receipt?.id===a.id) state.receipt = {...state.receipt, ...a};
  const i = state.applications.findIndex(x=>x.id===a.id);
  if (i>=0) state.applications[i] = {...state.applications[i], ...a};
  paint();
  if (message) toast(message, 'success');
  document.getElementById('app-'+a.id)?.scrollIntoView({block:'nearest'});
}
async function applicationAction(button, path, data, message) {
  if (button) setBusy(button, true, t('processing'));
  try { const result = await post(path, data, button, t('processing')); showApplication(result.application, message); await loadRoute({quiet:true, afterAction:true}); return true; }
  catch (error) { toast(t(error.code || 'serverError'), 'error'); return false; }
  finally { if (button?.isConnected) setBusy(button, false); }
}
function bindApplicationActions() {
  document.querySelectorAll('[data-test-pay]').forEach(button=>button.addEventListener('click',async()=>{
    if (!(await confirmDialog({title:t('testBuy'), body:t('testBuyConfirm'), confirm:t('confirm'), cancel:t('tm_cancel')}))) return;
    applicationAction(button, '/api/applications/'+encodeURIComponent(button.dataset.testPay)+'/test-pay', {}, t('paidTest'));
  }));
  document.querySelectorAll('[data-mark-paid]').forEach(button=>button.addEventListener('click',()=>{
    const ref = document.querySelector(`[data-ref-for="${CSS.escape(button.dataset.markPaid)}"]`)?.value || '';
    applicationAction(button, '/api/admin/applications/'+encodeURIComponent(button.dataset.markPaid)+'/mark-paid', {reference:ref}, t('paymentRecorded'));
  }));
  document.querySelectorAll('.reply-form').forEach(form=>form.addEventListener('submit',async event=>{
    event.preventDefault();
    const body = form.elements.body.value.trim(); if (!body) return;
    const button = form.querySelector('button[type=submit]');
    if (await applicationAction(button, '/api/applications/'+encodeURIComponent(form.dataset.reply)+'/messages', {body}, t('replySent'))) form.reset();
  }));
  document.querySelectorAll('.admin-note').forEach(form=>form.addEventListener('submit',async event=>{
    event.preventDefault();
    const action = event.submitter?.dataset.action || 'message', note = form.elements.note.value.trim(), id = form.dataset.note;
    const feedback = form.querySelector('.status-feedback');
    if (!note && ['message','needs_info'].includes(action)) { feedback.textContent = t('messageRequired'); form.elements.note.focus(); return; }
    if (action==='declined' && !(await confirmDialog({title:t('decline'), body:t('declineConfirm'), confirm:t('decline'), cancel:t('tm_cancel'), tone:'danger'}))) return;
    if (action==='message') return applicationAction(event.submitter, '/api/admin/applications/'+encodeURIComponent(id)+'/messages', {body:note}, t('messageSent'));
    event.submitter && setBusy(event.submitter, true, t('processing'));
    try {
      const result = await api('/api/admin/applications/'+encodeURIComponent(id), {method:'PATCH', body:JSON.stringify({status:action, note})});
      showApplication(result.application, t('statusSaved')); loadRoute({quiet:true});
    } catch (error) { feedback.textContent = t(error.code || 'serverError'); if (event.submitter?.isConnected) setBusy(event.submitter, false); }
  }));
  document.querySelectorAll('.approve-form').forEach(form=>form.addEventListener('submit',async event=>{
    event.preventDefault();
    if (!form.reportValidity()) return;
    if (!(await confirmDialog({title:t('approveCreate'), body:t('approveConfirm'), confirm:t('confirm'), cancel:t('tm_cancel')}))) return;
    const data = Object.fromEntries(new FormData(form));
    applicationAction(form.querySelector('button[type=submit]'), '/api/admin/applications/'+encodeURIComponent(form.dataset.approve)+'/approve', data, t('salonCreated'));
  }));
  document.querySelectorAll('[data-password-saved]').forEach(button=>button.addEventListener('click',async()=>{
    if (!(await confirmDialog({title:t('passwordSaved'), body:t('passwordSavedConfirm'), confirm:t('confirm'), cancel:t('tm_cancel')}))) return;
    try { await post('/api/salons/'+encodeURIComponent(button.dataset.passwordSaved)+'/password-saved', {}, button, t('processing')); await loadRoute({quiet:true}); }
    catch (error) { toast(t(error.code || 'serverError'), 'error'); }
  }));
}
const pages = {'/':home,'/login':login,'/register':register,'/plans':plans,'/apply':apply,'/applications':()=>applications(false),'/admin':()=>applications(true),'/account':account,'/support':support,'/privacy':privacy,'/terms':termsPage,'/refund':refundPage,'/setup':setup,'/checkout':paymentLink,'/invite':invite,'/s':()=>bookPage(bookContext()),'/m':()=>managePage(bookContext()),'/me':()=>mePage(bookContext()),'/forgot':()=>forgotPage(bookContext()),'/try':()=>tryPage(bookContext())};
// What the booking pages need from the website (book.js): language, API, dialogs and the phone helpers.
const bookContext = () => ({ lang, api, toast, esc, state, go, confirmDialog, countryPicker, bindCountryPicker, pickerOptions, PINNED, phoneE164 });
const titles = {'/checkout':'payByCard','/':'tagline','/login':'login','/register':'register','/plans':'plans','/apply':'applyTitle','/applications':'applications','/admin':'inbox','/account':'account','/support':'support','/privacy':'privacyPolicy','/terms':'termsTitle','/refund':'refundTitle','/setup':'setupTitle'};
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.effects === 'off';
// What the admin panel needs from the website: its session, API helpers, dialogs and language.
const adminContext = () => ({ lang, t, state, api, toast, confirmDialog, setBusy, go,
  post: (path, data) => post(path, data, null, t('processing')),
  setLanguage: value => { setLanguage(value); render(); } });
// `place` (from the router) puts the page where it should be — the top, an #anchor, or where the reader was — BEFORE the
// scroll effects start: ScrollTrigger records the scroll position when they start and puts it back after its first
// refresh, so scrolling afterwards left a new page at the previous page's position (e.g. home scrolled to the prices →
// "All plans" opened /plans near its bottom; a /plans#finder link missed the finder).
function paint(place) {
  if (isAdminRoute(route)) {
    setLanguage(lang); killFx();
    app.innerHTML = adminShell(adminContext());
    bindAdmin(adminContext());
    place?.();
    return;
  }
  setLanguage(lang);
  killFx();
  document.title = 'METON · ' + t(titles[route] || 'home');
  if (bizPageRoute()) {
    // A business's own page: its name and colours, a language choice, and METON only in the footer line.
    document.body.dataset.scene = 'is-biz';
    app.innerHTML = bizTop()+`<main id="main" tabindex="-1" class="is-biz">${pages[route]()}</main>`+bizFoot();
    bind();
    place?.();
    return;
  }
  const scene = route === '/' ? 'is-home' : route === '/plans' ? 'is-plans' : ['/login','/register','/setup'].includes(route) ? 'is-auth' : 'is-paper';
  document.body.dataset.scene = scene;
  app.innerHTML = header()+`<main id="main" tabindex="-1" class="${scene}">${(pages[route] || home)()}</main>`+footer();
  restoreDraft();bind();
  place?.();
  initFx(route);
  initInteract(app, t);
  initShowcase(app);
}
// A new page fades in once its data is ready. Plain CSS on <main> only, so the header stays put and clicks are never
// blocked mid-animation.
function render({transition=false, place}={}) {
  paint(place);
  if (transition && !reduceMotion()) document.getElementById('main')?.classList.add('page-enter');
}
async function browserCountry() {
  const controller = new AbortController();
  const timer = setTimeout(()=>controller.abort(),2500);
  try {
    const response = await fetch('https://api.country.is/',{signal:controller.signal,credentials:'omit',cache:'no-store'});
    const data = await response.json();
    return /^[A-Z]{2}$/.test(data?.country) ? data.country : '';
  } catch { return ''; }
  finally { clearTimeout(timer); }
}
// ---- Router ------------------------------------------------------------------------------------------------------
// Internal links load in place: the session is re-read on every navigation, so the navbar always matches the account.
const progress = Object.assign(document.createElement('div'), {className:'route-progress'});
document.body.appendChild(progress);
// A clear loading screen over the page while the next page's data is on its way (shown only if it takes a moment),
// so a click never looks like it did nothing and an old page is never mistaken for the new one.
const veil = Object.assign(document.createElement('div'), {className:'page-veil', hidden:true});
veil.setAttribute('role','status'); veil.setAttribute('aria-live','polite');
document.body.appendChild(veil);
function showVeil(on) {
  if (on) { veil.innerHTML = `<div class="page-veil-card"><span class="page-veil-spinner" aria-hidden="true"></span><span>${t('loadingPage')}</span></div>`; veil.hidden = false; requestAnimationFrame(()=>veil.classList.add('is-on')); }
  else { veil.classList.remove('is-on'); veil.hidden = true; }
}
let navToken = 0, loadedAt = 0;
// Pages whose content comes from the server and changes from elsewhere (the admin, the app, emails, payments).
const livePages = ['/applications','/account'];
async function go(url, {replace=false, force=false}={}) {
  const target = new URL(url, location.href);
  if (target.origin !== location.origin || !knownRoute(routeOf(target.pathname))) { location.assign(target.href); return; }
  const same = target.pathname + target.search === location.pathname + location.search;
  if (same && !force && target.hash) { history.replaceState(history.state, '', target.href); document.getElementById(target.hash.slice(1))?.scrollIntoView({behavior:'smooth'}); return; }
  history[replace || same ? 'replaceState' : 'pushState']({}, '', target.href);
  await loadRoute({transition:true, scroll:true});
}
async function loadRoute({transition=false, scroll=false, quiet=false, afterAction=false}={}) {
  const token = ++navToken;
  const next = routeOf(location.pathname), key = location.pathname + location.search;
  const slow = setTimeout(() => progress.classList.add('is-active'), 120);
  // Navigation: the page being left dims and stops taking clicks at once, so old content is never mistaken for the
  // new page; a loading card follows if the data takes a moment. Quiet refreshes (back to the tab, after an action)
  // keep the page as it is.
  const leaving = quiet ? null : document.getElementById('main');
  if (leaving) { leaving.classList.add('is-leaving'); leaving.setAttribute('aria-busy','true'); leaving.inert = true; }
  const veilTimer = quiet ? 0 : setTimeout(() => { if (token === navToken) showVeil(true); }, 350);
  try {
    await refreshSession();
    if (token !== navToken) return;
    if (isPrivate(next) && !state.user) return go('/login?next='+encodeURIComponent(location.pathname+location.search), {replace:true});
    if ((next==='/admin'||next.startsWith('/admin/')) && !state.user?.isAdmin) return go('/account', {replace:true});
    if (['/login','/register'].includes(next) && state.user) return go(nextPage(), {replace:true});
    // A new page (not a re-render of the same one) starts with a fresh application form.
    if (key !== routeKey) { state.receipt = null; state.logo = ''; state.logoName = ''; state.submissionKey = uuid(); }
    if (['/apply','/s','/me','/try','/login','/account'].includes(next)) await loadPhoneLib();
    if (['/','/plans','/apply'].includes(next)) {
      // The visitor's country picks the currency approximate prices are shown in (payments are always in USD).
      let tz = '';
      try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch {}
      try {
        state.catalog = await api('/api/plans?tz='+encodeURIComponent(tz));
        if (state.catalog.source==='default') {
          // The server couldn't locate this visitor (some hosts block outgoing lookups): ask from the browser, else
          // go by the device's time zone.
          const cc = (next==='/' ? '' : await browserCountry()) || dialGuess();
          if (cc) { try { state.catalog = await api('/api/plans?tz='+encodeURIComponent(tz)+'&cc='+cc); } catch {} }
        }
      } catch (error) { if (next!=='/') throw error; state.catalog = null; }
    }
    if (next==='/setup') state.setupAvailable=(await api('/api/setup')).available;
    if (next==='/apply') {
      const plan=new URLSearchParams(location.search).get('plan') || 'basic';
      if (!state.catalog.plans.some(p=>p.id===plan)) return go('/plans', {replace:true});
    }
    if (next==='/account') {
      // Salons come from the shared database; billing keeps working on its own if that is unavailable.
      const fresh = new URLSearchParams(location.search).get('checkout')==='complete' ? '?fresh=1' : '';
      const userAt = state.user;
      const [billing, salons, invoices, deletion, apps, identity] = await Promise.all([api('/api/billing'+fresh), api('/api/salons').catch(()=>({salons:[]})), api('/api/invoices').catch(()=>({invoices:[]})), api('/api/account/deletion').catch(()=>null), api('/api/applications').catch(()=>({applications:[]})), api('/api/account/identity').catch(()=>null)]);
      state.billing = billing; state.salons = salons.salons || []; state.invoices = invoices.invoices || []; state.deletion = deletion; state.applications = apps.applications || [];
      // 2.46: how the METON account signs in (null when the website signs in on its own). The user it reads is not
      // used when a change saved meanwhile (e.g. the profile) already replaced it: that answer is newer.
      state.identity = identity?.identity || null; if (identity?.user && state.user === userAt) state.user = identity.user;
      if (state.identity) await loadNotifs(); else state.notifs = null;
    }
    // A card payment that may have just finished is confirmed before these pages show its status.
    if (['/applications','/account'].includes(next) && payingId()) { try { await checkPayment(payingId()); } catch {} }
    if (next==='/applications') state.applications=(await api('/api/applications')).applications;
    if (token !== navToken) return;
    route = next; routeKey = key; loadedAt = Date.now();
    // A quiet refresh never wipes what someone is typing (a reply, an admin note).
    if (quiet && !afterAction && [...document.querySelectorAll('#main textarea, #main input')].some(el => el.value && el.type !== 'hidden' && el.type !== 'radio' && el.type !== 'checkbox' && !el.readOnly && el.closest('form') && !el.closest('.approve-form'))) return;
    const y = window.scrollY;
    const place = () => {
      if (quiet) return window.scrollTo({top:y, behavior:'instant'});
      const anchor = location.hash ? document.getElementById(location.hash.slice(1)) : null;
      if (anchor) anchor.scrollIntoView(); else if (scroll) window.scrollTo({top:0, behavior:'instant'});
    };
    await render({transition: transition && !quiet, place});
    if (quiet) return;
    if (transition) document.getElementById('main')?.focus({preventScroll:true});
    if (route==='/checkout') startPaymentLink();
  } catch(error) {
    if (token !== navToken) return;
    route = next;
    app.innerHTML=header()+`<main id="main" class="wrap empty-state"><h1>METON</h1><p role="alert">${t(error.code || 'serverError')}</p><button class="btn primary" id="retry">${t('retry')}</button></main>`+footer();
    document.getElementById('retry').addEventListener('click',()=>loadRoute());
    document.querySelectorAll('select[data-language]').forEach(s=>s.addEventListener('change',event=>{setLanguage(event.target.value);loadRoute();}));
  } finally {
    clearTimeout(slow); clearTimeout(veilTimer);
    if (token === navToken) {
      progress.classList.remove('is-active'); showVeil(false);
      // A navigation that ended without a new page (a redirect that bailed out) must not leave the old one inert.
      if (leaving?.isConnected) { leaving.classList.remove('is-leaving'); leaving.removeAttribute('aria-busy'); leaving.inert = false; }
    }
  }
}
document.addEventListener('click', event => {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const a = event.target.closest('a[href]');
  if (!a || a.target || a.hasAttribute('download') || !a.closest('#app')) return;
  const url = new URL(a.href, location.href);
  if (url.origin !== location.origin || !knownRoute(routeOf(url.pathname))) return;
  event.preventDefault();
  go(url.href);
});
let backingOut = false;
window.addEventListener('popstate', async () => {
  if (backingOut) { backingOut = false; return; }
  loadRoute({transition:true});
});
// Another tab signed in or out, or this tab came back after a while: re-read the session and redraw if it changed.
if (channel) channel.onmessage = event => { if (event.data === 'login' || event.data === 'logout') location.reload(); };
// Coming back to the tab re-reads the page's data, so it always shows the latest state.
function refreshIfStale(maxAgeMs) {
  if (document.visibilityState !== 'visible' || document.querySelector('.modal-root') || Date.now() - loadedAt < maxAgeMs) return;
  if (isAdminRoute(route)) { if (maxAgeMs <= 5000 && !document.querySelector('#ap-view form')) { loadedAt = Date.now(); refreshAdmin(); } }
  else if (livePages.includes(route)) loadRoute({quiet:true});
  else if (Date.now() - lastSessionCheck > 30000) {
    const before = state.user?.id ?? null;
    refreshSession().then(() => { if ((state.user?.id ?? null) !== before) loadRoute(); }).catch(() => {});
  }
}
document.addEventListener('visibilitychange', () => refreshIfStale(5000));
window.addEventListener('focus', () => refreshIfStale(5000));
// While a live page stays open, it picks up changes made elsewhere (approval, payment, a reply) every 30 seconds.
setInterval(() => refreshIfStale(30000), 30000);
window.addEventListener('pageshow',event=>{if(event.persisted)loadRoute();});
window.addEventListener('pagehide',event=>{if(event.persisted&&isPrivate(route))app.textContent='';});
setLanguage(lang);
// Lists everywhere (site and admin panel) show 5 items per page.
installPager((key, vars) => t('pg_' + key, vars));
loadRoute().then(() => {
  // Paddle Retain needs Paddle.js initialized on every page, not only when a checkout opens.
  if (state.checkout?.clientToken) loadPaddle().catch(() => {});
  let flash = ''; try { flash = sessionStorage.getItem('salonieer:flash') || ''; sessionStorage.removeItem('salonieer:flash'); } catch {}
  if (flash.startsWith('signedIn:')) toast(t('signedIn', {name: flash.slice(9)}), 'success');
  else if (flash) toast(t(flash), flash === 'signedOut' ? '' : 'success');
});
