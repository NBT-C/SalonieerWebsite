import { languages, translate } from './i18n.js';
import { COUNTRIES } from './countries.js';
import { policy } from './policy.js';
import { terms, refund } from './legal.js';
import { initFx, killFx } from './fx/scroll.js';
import { initInteract } from './fx/interact.js';
import * as V from './validate.js';
import { countryPicker, bindCountryPicker } from './country-picker.js';
import { confirmDialog, toast, setBusy, solveChallenge } from './ui.js';
import './qr.js';
import { adminShell, bindAdmin, isAdminRoute, refresh as refreshAdmin } from './admin/panel.js';
import { installPager } from './pager.js';

const app = document.getElementById('app');
let storedLanguage;
try { storedLanguage = localStorage.getItem('salonieer_lang'); } catch {}
let lang = languages.includes(storedLanguage) ? storedLanguage : (languages.includes(navigator.language.slice(0,2)) ? navigator.language.slice(0,2) : 'en');
const routeOf = pathname => { const r = pathname.replace(/\.html$/, '').replace(/\/$/, '') || '/'; return r === '/index' ? '/' : r; };
let route = routeOf(location.pathname);
let routeKey = '';
const privateRoutes = ['/apply','/applications','/account','/admin'];
// Every /admin/... address belongs to the admin panel (assets/admin/panel.js), which has its own sub-pages.
const isPrivate = r => privateRoutes.includes(r) || r.startsWith('/admin/');
const knownRoute = r => r in pages || isAdminRoute(r);
const CURRENCIES = ['USD','ILS'];
const SYMBOLS = { USD:'$', ILS:'₪' };
let storedCurrency;
try { storedCurrency = localStorage.getItem('salonieer_currency'); } catch {}
let storedInterval;
try { storedInterval = localStorage.getItem('salonieer_interval'); } catch {}
const state = { interval: storedInterval === 'year' ? 'year' : 'month', invoices: [], currency: CURRENCIES.includes(storedCurrency) ? storedCurrency : 'USD', user: null, csrf: '', catalog: null, applications: [], logo: '', logoName: '', submissionKey: crypto.randomUUID(), receipt: null, filter: 'all', billing: null, checkout: null, paid: false, salons: [] };
const drafts = {};
const t = (key,vars) => translate(key,lang,vars);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// Whole amounts show as "39"; amounts with cents always show both digits, as "19.50".
const amountText = value => Number(value).toLocaleString('en-US',{minimumFractionDigits:Number.isInteger(Number(value))?0:2,maximumFractionDigits:2});
const money = (value,currency=state.currency) => value === null || value === undefined ? t('byAgreement') : (SYMBOLS[currency] || '₪') + amountText(value);
const priceOf = prices => prices ? prices[state.currency] ?? null : null;
function setCurrency(value) {
  state.currency = CURRENCIES.includes(value) ? value : 'USD';
  try { localStorage.setItem('salonieer_currency',state.currency); } catch {}
}
// Monthly or yearly billing (yearly = yearlyMonths × monthly, i.e. a month free), remembered like the currency.
const yearMonths = () => state.catalog?.yearlyMonths || state.checkout?.yearlyMonths || 11;
const perPeriod = (value, interval=state.interval) => value === null || value === undefined ? value : value * (interval === 'year' ? yearMonths() : 1);
const periodKey = (interval=state.interval) => interval === 'year' ? 'perYear' : 'perMonth';
const totalKey = (interval=state.interval) => interval === 'year' ? 'yearlyTotal' : 'monthlyTotal';
function setInterval_(value) {
  state.interval = value === 'year' ? 'year' : 'month';
  try { localStorage.setItem('salonieer_interval', state.interval); } catch {}
}
function intervalSwitch() {
  return `<div class="currency-switch interval-switch" role="radiogroup" aria-label="${t('billingPeriod')}">${['month','year'].map(i=>`<button type="button" role="radio" class="currency-option${state.interval===i?' active':''}" data-interval="${i}" aria-checked="${state.interval===i}">${t(i==='year'?'yearly':'monthly')}${i==='year'?` <span class="save-tag">${t('monthFree')}</span>`:''}</button>`).join('')}</div>`;
}
// The 14-day trial (card required) is offered on the trial plans to accounts that never had a subscription.
const trialShown = planId => (state.catalog?.trialPlans || state.checkout?.trialPlans || []).includes(planId) && (!state.user || !!state.checkout?.trialEligible);
const trialDays = () => state.catalog?.trialDays || 14;
function currencySwitch(id='currency') {
  return `<div class="currency-switch" role="radiogroup" aria-label="${t('currency')}">${CURRENCIES.map(c=>`<button type="button" role="radio" class="currency-option${state.currency===c?' active':''}" data-currency="${c}" aria-checked="${state.currency===c}" title="${t('currency'+c)}"><span aria-hidden="true">${SYMBOLS[c]}</span> ${c}</button>`).join('')}</div>`;
}
const date = value => new Intl.DateTimeFormat(lang, { dateStyle:'medium' }).format(new Date(value));
const statusNames = ['pending','in_review','needs_info','approved','declined'];
const CATEGORIES = ['male','female','beauty'];
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
function nextPage() {
  const value = new URLSearchParams(location.search).get('next');
  if (!value || !/^\/(plans|apply|applications|account|admin)(\?[^\r\n\\]*)?$/.test(value)) return '/plans';
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
function header() {
  const link = (path,key) => `<a href="${path}"${route===path?' aria-current="page"':''}>${t(key)}</a>`;
  const item = (path,key) => `<li>${link(path,key)}</li>`;
  return `<a class="skip" href="#main">${t('skip')}</a><header class="topbar"><div class="nav">
    <a href="/" class="brand" aria-label="Salonieer"><img class="brand-mark" src="/assets/img/logo-mark-96.webp" alt="" width="34" height="34"><span class="wordmark">Salonieer</span></a>
    <nav class="bar-links" aria-label="${t('menu')}">${link('/plans','plans')}${link('/support','support')}${state.user?link('/account','account'):link('/login','login')}</nav>
    ${state.user?`<button class="btn small bar-logout" id="logout" type="button">${t('logout')}</button>`:''}
    <select id="language" class="language-select" aria-label="${t('language')}"><option value="en" ${lang==='en'?'selected':''}>EN</option><option value="ar" ${lang==='ar'?'selected':''}>العربية</option><option value="he" ${lang==='he'?'selected':''}>עברית</option></select>
    <button class="menu-toggle" id="menu-toggle" aria-controls="nav-panel" aria-expanded="false" data-open="${t('menu')}" data-close="${t('close')}"><span class="label-text">${t('menu')}</span><span class="bars" aria-hidden="true"></span></button>
    <nav id="nav-panel" class="nav-panel" aria-label="${t('menu')}"><ul class="menu-links">${item('/','home')}${item('/plans','plans')}${state.user?item('/applications','applications')+item('/account','account'):''}${item('/support','support')}${state.user?.isAdmin?item('/admin','adminPanel'):''}${state.user?'':item('/login','login')+item('/register','register')}</ul>
      <div class="menu-foot"><div class="nav-actions">${state.user?`<a class="btn small" href="/account">${t('account')}</a>`:`<a class="btn small" href="/login">${t('login')}</a><a class="btn primary small" href="/register">${t('register')}</a>`}</div><a class="mail" href="mailto:salonieer1st@gmail.com" dir="ltr">salonieer1st@gmail.com</a></div></nav>
  </div></header>`;
}
function footer() {
  return `<footer class="site-footer"><div class="wrap"><div class="footer-grid"><div><p>${t('footerTagline')}</p></div>
    <nav aria-label="${t('footerProduct')}"><h3>${t('footerProduct')}</h3><div class="footer-links"><a href="/">${t('home')}</a><a href="/plans">${t('plans')}</a>${state.user?`<a href="/account">${t('account')}</a>`:`<a href="/register">${t('register')}</a>`}</div></nav>
    <nav aria-label="${t('legal')}"><h3>${t('legal')}</h3><div class="footer-links"><a href="/terms">${t('termsTitle')}</a><a href="/privacy">${t('privacyPolicy')}</a><a href="/refund">${t('refundTitle')}</a></div></nav>
    <div><h3>${t('footerContact')}</h3><div class="footer-links"><a href="/support">${t('support')}</a><a href="mailto:salonieer1st@gmail.com" dir="ltr">salonieer1st@gmail.com</a></div></div></div>
    <div class="footer-bottom"><span>© ${new Date().getFullYear()} Salonieer. ${t('footerRights')}</span><span>${t('footerMade')}</span></div></div></footer>`;
}
function titleBlock(eyebrow,title,lead,center=false,extra='') {
  return `<div class="page-heading${center?' center':''}"><h1>${t(title)}</h1>${lead?`<p>${t(lead)}</p>`:''}${extra}</div>`;
}
function priceHTML(value,currency=state.currency) {
  return value === null || value === undefined ? `<div class="price"><span class="agreement">${t('byAgreement')}</span></div>` : `<div class="price"><span class="currency">${SYMBOLS[currency] || '₪'}</span><span class="amount">${amountText(value)}</span></div>`;
}
function field(name,label,{type='text',hint='',required=true,autocomplete='',minlength='',maxlength='',placeholder='',extra='',full=false}={}) {
  const password = type === 'password';
  return `<div class="field${full?' full-span':''}"><label for="${name}">${t(label)}</label>${password?'<div class="password-wrap">':''}<input id="${name}" name="${name}" type="${type}" ${required?'required':''} ${autocomplete?`autocomplete="${autocomplete}"`:''} ${minlength?`minlength="${minlength}"`:''} ${maxlength?`maxlength="${maxlength}"`:''} ${placeholder?`placeholder="${esc(placeholder)}"`:''} aria-describedby="${name}-hint ${name}-error" ${extra}>${password?`<button class="password-toggle" type="button" data-password="${name}" aria-controls="${name}" aria-label="${t('show')} ${t(label)}">${t('show')}</button></div>`:''}<small id="${name}-hint">${hint?t(hint):''}</small><small id="${name}-error" class="field-error"></small></div>`;
}
function formErrorBox() { return '<div id="form-error" class="notice" role="alert" tabindex="-1" hidden></div>'; }
function authIntro(title,lead) {
  return `<aside class="auth-art ink"><svg class="ribbon" viewBox="0 0 600 800" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><path d="M-60 260 C 120 120, 260 420, 420 300 S 640 140, 700 230 L 700 300 C 600 220, 520 420, 400 380 S 120 230, -60 340 Z" fill="#D98A5F"/><path d="M-60 430 C 140 330, 300 560, 470 470 S 640 380, 700 420 L 700 470 C 620 430, 520 560, 440 530 S 150 410, -60 500 Z" fill="#C9D1D6" opacity=".55"/><path d="M560 0 V800" stroke="#F2DC4B" stroke-width="2" stroke-dasharray="2 10"/></svg><h1>${t(title)}</h1><p>${t(lead)}</p></aside>`;
}
const checkSvg = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7"/></svg>';
// Real screens from the Salonieer app (Arabic), captured at phone size.
const shot = (name,alt,extra='') => `<img src="/assets/img/${name}.webp" srcset="/assets/img/${name}-sm.webp 390w, /assets/img/${name}.webp 780w" sizes="(max-width: 900px) 260px, 300px" alt="${alt}" width="780" height="1688" decoding="async" ${extra}>`;
// The home page, kept plain on purpose: what Salonieer is, how to start, what is in the app, the prices and where to
// get help. No scroll scenes or moving parts, so every visitor can read it top to bottom and find the next step.
function home() {
  const start = state.user ? `<a class="btn primary" href="/plans">${t('explorePlans')}</a>` : `<a class="btn primary" href="/register">${t('register')}</a>`;
  const c = state.catalog;
  const second = state.user ? `<a class="btn" href="/applications">${t('applications')}</a>` : `<a class="btn" href="${c?'#prices':'/plans'}">${t('hm_prices')}</a>`;
  const feature = (k, img) => `<article class="hm-feature"><figure>${shot(img, t('st_'+k+'_alt'), 'loading="lazy"')}</figure><h3>${t('hm_for_'+k)}</h3><p>${t('st_'+k+'_text')}</p>
    <ul class="check-list">${[1,2,3].map(i=>`<li><span class="ck">${checkSvg}</span><span>${t('st_'+k+'_p'+i)}</span></li>`).join('')}</ul></article>`;
  const prices = c ? `<section class="hm-section hm-tint" id="prices" aria-labelledby="prices-title"><div class="wrap"><div class="hm-head"><h2 id="prices-title">${t('bd_title')}</h2><p>${t('bd_lead')}</p></div>
    <div class="hm-currency">${currencySwitch()}</div>
    <ul class="hm-plans">${c.plans.map(p=>{ const price = priceOf(p.prices); return `<li class="hm-plan${p.id==='pro'?' is-popular':''}"><div class="hm-plan-top"><h3>${esc(p.name)}</h3>${p.id==='pro'?`<span class="tag">${t('popular')}</span>`:''}</div>
      <p class="hm-price">${price===null?t('byAgreement'):`<bdi>${money(price)}</bdi> <small>${t('monthly')}</small>`}</p><p class="hm-plan-desc">${t(p.id+'Desc')}</p>
      <a class="btn${p.id==='pro'?' primary':''} full" href="/apply?plan=${p.id}" aria-label="${t(p.id==='enterprise'?'contactUs':'startNow')} · ${esc(p.name)}">${t(p.id==='enterprise'?'contactUs':'startNow')}</a></li>`; }).join('')}</ul>
    <p class="hm-note">${t('pricesNote')} <a class="text-link" href="/plans">${t('bd_all')}</a></p></div></section>` : '';
  return `<div class="home">
  <section class="hm-hero" aria-labelledby="hm-title"><div class="wrap hm-hero-grid"><div>
    <h1 id="hm-title">${t('hm_title')}</h1><p class="hm-lead">${t('hm_lead')}</p>
    <div class="hero-actions">${start}${second}</div>
    <ul class="hm-points">${[1,2,3].map(i=>`<li><span class="ck">${checkSvg}</span>${t('hm_point'+i)}</li>`).join('')}</ul></div>
    <figure class="hm-shot">${shot('app-home', t('hm_hero_alt'), 'fetchpriority="high"')}</figure></div></section>
  <section class="hm-section" aria-labelledby="steps-title"><div class="wrap"><div class="hm-head"><h2 id="steps-title">${t('hm_steps_title')}</h2></div>
    <ol class="hm-steps">${[1,2,3].map(n=>`<li><span class="hm-num" aria-hidden="true">${n}</span><h3>${t('hm_s'+n)}</h3><p>${t('hm_s'+n+'_text')}</p></li>`).join('')}</ol></div></section>
  <section class="hm-section hm-tint" aria-labelledby="app-title"><div class="wrap"><div class="hm-head"><h2 id="app-title">${t('hm_app_title')}</h2></div>
    <div class="hm-features">${feature('c','app-booking')}${feature('s','app-specialist')}${feature('o','app-owner')}</div></div></section>
  ${prices}
  <section class="hm-section" aria-label="${t('hm_ready')}"><div class="wrap hm-end">
    <div class="hm-box"><h2>${t('hm_ready')}</h2><p>${t('hm_ready_text')}</p><div class="hero-actions">${start}</div></div>
    <div class="hm-box"><h2>${t('hm_help_title')}</h2><p>${t('hm_help_text')}</p><div class="hero-actions"><a class="btn" href="/support">${t('support')}</a><a class="text-link" href="mailto:salonieer1st@gmail.com" dir="ltr">salonieer1st@gmail.com</a></div></div>
  </div></section>
</div>`;
}
function login() {
  return `<div class="auth-split">${authIntro('welcome','loginLead')}<div class="auth-form"><section class="auth-card"><h2>${t('login')}</h2>${new URLSearchParams(location.search).has('next')?`<p class="notice info">${t('loginRequired')}</p>`:''}<form id="login-form" novalidate>${formErrorBox()}${field('email','email',{type:'email',autocomplete:'email',maxlength:254,placeholder:'you@example.com'})}${field('password','password',{type:'password',autocomplete:'current-password',maxlength:128})}<div class="login-help"><a class="text-link" href="/support#account">${t('forgot')}</a></div><button class="btn primary full" type="submit">${t('login')}</button></form><p class="auth-footer">${t('noAccount')} <a href="/register" class="text-link">${t('register')}</a></p></section></div></div>`;
}
// Dialing country guess from the time zone, used only to preselect the phone code (the account country is never guessed).
function dialGuess() {
  let tz = ''; try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch {}
  return {'Asia/Hebron':'PS','Asia/Gaza':'PS','Asia/Jerusalem':'IL','Asia/Tel_Aviv':'IL','Asia/Amman':'JO','Asia/Riyadh':'SA','Asia/Dubai':'AE','Africa/Cairo':'EG','Europe/Istanbul':'TR','Asia/Beirut':'LB','Asia/Qatar':'QA','Asia/Kuwait':'KW','Asia/Bahrain':'BH','Asia/Muscat':'OM','Asia/Baghdad':'IQ','Asia/Damascus':'SY','Africa/Casablanca':'MA','Africa/Tunis':'TN','Africa/Algiers':'DZ','Europe/London':'GB','Europe/Berlin':'DE','Europe/Paris':'FR','America/New_York':'US','America/Chicago':'US','America/Los_Angeles':'US'}[tz] || '';
}
const dialCodeOf = code => { try { return phoneLib?.getCountryCallingCode(code) ?? null; } catch { return null; } };
const PINNED = ['PS','IL','JO','SA','AE','EG'];
function pickerOptions(extra) { return { t, esc, lang, countryName, dialCodeOf, ...extra }; }
// Phone with a country-code picker (the code starts at the given country).
function phoneField(country) {
  return `<div class="field full-span"><label for="phone">${t('phone')}</label><div class="phone-field">${countryPicker(pickerOptions({name:'phoneCountry',mode:'dial',value:dialCodeOf(country)?country:(dialCodeOf(dialGuess())?dialGuess():''),label:t('countryCode')}))}<input id="phone" name="phone" type="tel" inputmode="tel" autocomplete="tel-national" maxlength="24" required aria-describedby="phone-hint phone-error" dir="ltr"></div><small id="phone-hint">${t('salonPhoneHint')}</small><small id="phone-error" class="field-error" aria-live="polite"></small></div>`;
}
function accountFields(prefix='') {
  return `${prefix}<div class="form-section"><h2>${t('accountDetails')}</h2><div class="form-grid">${field('fullName','fullName',{autocomplete:'name',maxlength:100,full:true})}${field('email','email',{type:'email',autocomplete:'email',maxlength:254,placeholder:'you@example.com',full:true,extra:'spellcheck="false" autocapitalize="off" inputmode="email"'})}
  ${field('password','password',{type:'password',autocomplete:'new-password',maxlength:128,hint:'passwordHint'})}${field('passwordConfirm','passwordConfirm',{type:'password',autocomplete:'new-password',maxlength:128})}<div class="pw-meter full-span" id="pw-meter" data-score="0" aria-hidden="true"><i></i><i></i><i></i><i></i><span></span></div></div>
  <div class="field" style="margin-top:20px"><label for="country-btn">${t('country')}</label>${countryPicker(pickerOptions({name:'country',mode:'country',value:'',label:t('country'),describedBy:'country-hint country-error'}))}<small id="country-hint">${t('countryLockedHint')}</small><small id="country-error" class="field-error" aria-live="polite"></small></div></div>
  <div class="hp" aria-hidden="true"><label>Website <input name="website" tabindex="-1" autocomplete="off"></label></div>`;
}
function register() {
  return `<div class="auth-split">${authIntro('registerTitle','registerLead')}<div class="auth-form"><section class="auth-card"><h2>${t('register')}</h2><form id="register-form" novalidate>${formErrorBox()}${accountFields()}<p class="privacy-note">${t('privacyNote')} <a class="text-link" href="/privacy" target="_blank" rel="noopener">${t('privacyPolicy')}</a>.</p><button class="btn primary full" type="submit">${t('register')}</button></form><p class="auth-footer">${t('haveAccount')} <a href="/login" class="text-link">${t('login')}</a></p></section></div></div>`;
}
function setup() {
  if (!state.setupAvailable) return `<div class="wrap empty-state"><h1>${t('setupDone')}</h1><p>${t('setupDoneText')}</p><a class="btn primary" href="${state.user?'/admin':'/login'}">${t(state.user?'inbox':'login')}</a></div>`;
  return `<div class="auth-split">${authIntro('setupTitle','setupLead')}<div class="auth-form"><section class="auth-card"><h2>${t('setupTitle')}</h2><form id="setup-form" novalidate>${formErrorBox()}${accountFields(`<div class="form-section">${field('setupKey','setupKey',{maxlength:64,autocomplete:'off',hint:'setupKeyHint',extra:'data-ltr spellcheck="false" autocapitalize="off"'})}</div>`)}<button class="btn primary full" type="submit">${t('setupSubmit')}</button></form></section></div></div>`;
}
function plans() {
  const c = state.catalog;
  return `<div class="plans-page ink"><div class="wrap page-top">${titleBlock('plansEyebrow','plansTitle','plansLead',false,`<div class="pricing-controls">${intervalSwitch()}${currencySwitch()}</div>`)}
  <ol class="menu-rows plan-rows" aria-label="${t('plans')}">${c.plans.map(p=>{ const price = perPeriod(priceOf(p.prices)); return `<li class="menu-row" id="plan-${p.id}"><div class="name"><h3>${esc(p.name)}</h3>${p.id==='pro'?`<span class="tag">${t('popular')}</span>`:''}${trialShown(p.id)?`<span class="trial-badge">${t('trialBadge',{n:trialDays()})}</span>`:''}<span class="leader" aria-hidden="true"></span></div>
    <div class="price">${price===null?t('requestQuote'):`<bdi>${money(price)}</bdi><small>${t(state.interval==='year'?'billedYearly':'monthly')}</small>`}</div>
    <p class="desc">${t(p.id+'Desc')}</p><ul class="features">${p.features.map(f=>`<li>${t(f)}</li>`).join('')}</ul>
    <div class="actions"><a class="btn ${p.id==='pro'?'primary magnetic':''}" href="/apply?plan=${p.id}" aria-label="${t(p.id==='enterprise'?'contactUs':'startNow')} · ${esc(p.name)}">${t(p.id==='enterprise'?'contactUs':'startNow')}</a></div></li>`; }).join('')}</ol>
  <section class="extras" aria-labelledby="extras-title"><h2 id="extras-title">${t('optionalAddons')}</h2><ol class="menu-rows">${[['loyalty','loyaltyText',priceOf(c.addons.loyalty)],['specialist','specialistText',priceOf(c.addons.specialist)]].map(([name,description,price])=>`<li class="menu-row"><div class="name"><h3>${t(name)}</h3><span class="leader" aria-hidden="true"></span></div><div class="price"><bdi>${money(perPeriod(price))}</bdi><small>${t(periodKey())}</small></div><p class="desc">${t(description)}</p></li>`).join('')}</ol></section>
  ${compareTable()}
  <p class="payment-footnote">${t('pricesNote')} <a class="text-link" href="/terms">${t('termsTitle')}</a> · <a class="text-link" href="/refund">${t('refundTitle')}</a></p></div></div>`;
}
// What each plan includes, feature by feature (the same defaults Salonieer applies to a salon on that plan).
// 1 = included, 0 = not included, '+' = paid add-on, 'soon' = coming, text = shown as is. Plans: Basic, Pro, Business, Enterprise.
const COMPARE = [
  ['cmpEssentials', [['cmpBookings', [1, 1, 1, 1]], ['cmpServices', [1, 1, 1, 1]], ['cmpReminders', [1, 1, 1, 1]], ['cmpSpecialists', ['1', '7', '16', '∞']], ['cmpExtraSeats', ['+', '+', '+', 0]]]],
  ['cmpGrow', [['cmpProducts', [0, 1, 1, 1]], ['cmpAnalytics', [0, 1, 1, 1]], ['cmpLoyalty', ['+', '+', 1, 1]]]],
  ['cmpBusiness', [['cmpFinance', [0, 1, 1, 1]], ['cmpCheckout', [0, 1, 1, 1]], ['cmpInventory', [0, 1, 1, 1]], ['cmpCoupons', [0, 1, 1, 1]],
    ['cmpCommissions', [0, 0, 1, 1]], ['cmpDeposits', [0, 0, 1, 1]], ['cmpWaitlist', [0, 0, 1, 1]], ['cmpRetention', [0, 0, 1, 1]], ['cmpPackages', [0, 0, 1, 1]],
    ['cmpOnline', [0, 0, 'soon', 'soon']]]],
];
function compareTable() {
  const plans = state.catalog?.plans || [];
  if (plans.length !== 4) return '';
  const cell = v => v === 1 ? `<span class="cmp-yes" role="img" aria-label="${t('cmpIncluded')}">✓</span>`
    : v === 0 ? `<span class="cmp-no" role="img" aria-label="${t('cmpNotIncluded')}">—</span>`
    : v === '+' ? `<span class="cmp-tag">${t('cmpAddon')}</span>` : v === 'soon' ? `<span class="cmp-tag is-soon">${t('cmpSoon')}</span>` : `<b>${esc(v)}</b>`;
  const col = p => p.id === 'pro' ? ' class="is-popular"' : '';
  return `<section class="compare" aria-labelledby="compare-title"><h2 id="compare-title">${t('cmpTitle')}</h2><p class="compare-lead">${t('cmpLead')}</p>
    <div class="compare-wrap"><table class="compare-table"><thead><tr><th scope="col"><span class="sr-only">${t('cmpFeature')}</span></th>${plans.map(p => `<th scope="col"${col(p)}>${esc(p.name)}</th>`).join('')}</tr></thead>
    ${COMPARE.map(([group, rows]) => `<tbody><tr class="compare-group"><th scope="rowgroup" colspan="${plans.length + 1}">${t(group)}</th></tr>${rows.map(([key, values]) => `<tr><th scope="row"><span>${t(key)}</span><small>${t(key + 'Desc')}</small></th>${plans.map((p, i) => `<td${col(p)}>${cell(values[i])}</td>`).join('')}</tr>`).join('')}</tbody>`).join('')}
    </table></div><p class="small-note compare-note">${t('cmpNote')}</p></section>`;
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
  return `<div class="wrap">${titleBlock('selectedPlan','applyTitle','applyLead')}<div class="steps" aria-label="${t('applications')}"><div class="step"><span aria-hidden="true">✓</span>${t('stepPlan')}</div><div class="line"></div><div class="step active" aria-current="step"><span>2</span>${t('stepDetails')}</div><div class="line"></div><div class="step"><span>3</span>${t('stepReview')}</div></div><div class="application-layout"><form id="application-form" class="application-form" novalidate>${formErrorBox()}<section class="form-panel"><h2>${t('stepDetails')}</h2><div class="form-grid">${field('identityNumber','identityNumber',{maxlength:64,autocomplete:'off',hint:'idHint',extra:'data-ltr spellcheck="false" inputmode="numeric"'})}${field('salonName','salonName',{minlength:2,maxlength:100,autocomplete:'organization'})}<div class="field"><label for="salonCategory">${t('salonCategory')}</label><select id="salonCategory" name="salonCategory" required>${CATEGORIES.map(c=>`<option value="${c}">${t('cat_'+c)}</option>`).join('')}</select><small>${t('salonCategoryHint')}</small></div><div class="field"><label for="timezone">${t('timezone')}</label><select id="timezone" name="timezone" required dir="ltr">${timezoneOptions('', state.user.country)}</select><small>${t('timezoneHint')}</small></div>${phoneField(state.user.country)}</div><div class="field"><label for="logo">${t('logo')}</label><div class="upload"><span id="upload-symbol" class="upload-symbol" aria-hidden="true"${state.logo?' hidden':''}>＋</span><img id="logo-preview" class="logo-preview" alt="${t('logo')}"${state.logo?` src="${state.logo}"`:' hidden'}><div class="upload-text"><strong id="upload-title">${t(state.logo?'replaceLogo':'uploadTitle')}</strong><small>${t('uploadHint')}</small><small id="logo-filename" class="upload-filename">${esc(state.logoName)}</small></div><input id="logo" name="logo" type="file" accept="image/png,image/jpeg,image/webp" aria-describedby="logo-error"></div><small id="logo-error" class="field-error"></small></div></section><section class="form-panel"><div class="panel-head"><h2>${t('selectedPlan')}</h2>${currencySwitch()}</div><div class="field"><label for="plan">${t('plans')}</label><select id="plan" name="plan" required>${state.catalog.plans.map(p=>`<option value="${p.id}">${p.name} · ${money(perPeriod(priceOf(p.prices)))}${priceOf(p.prices)===null?'':' '+t(periodKey())}</option>`).join('')}</select></div><div class="field"><span class="field-label" id="interval-label">${t('billingPeriod')}</span>${intervalSwitch()}</div><p class="included-note" id="included-loyalty" hidden><span aria-hidden="true">✓</span>${t('loyaltyIncluded')}</p><div class="addon-control" id="loyalty-control"><input type="checkbox" id="loyalty" name="loyalty"><label for="loyalty">${t('loyalty')}</label><span class="amount"><bdi>${money(perPeriod(priceOf(state.catalog.addons.loyalty)))}</bdi> <small>${t(periodKey())}</small></span></div><div class="quantity-field" id="specialist-control"><label for="extraSpecialists">${t('extraSpecialists')}<br><small class="muted"><bdi>${money(perPeriod(priceOf(state.catalog.addons.specialist)))}</bdi> ${t(periodKey())}</small></label><input id="extraSpecialists" name="extraSpecialists" type="number" min="0" max="50" step="1" value="0" inputmode="numeric"></div><p class="included-note" id="unlimited-note" hidden><span aria-hidden="true">✓</span>${t('unlimitedSpecialists')}</p></section><section class="form-panel"><fieldset><legend>${t('payment')}</legend><div class="radio-options"><label class="radio-option"><input type="radio" name="paymentMethod" value="card" required><span>${t('card')}</span></label><label class="radio-option"><input type="radio" name="paymentMethod" value="bank_transfer" required><span>${t('bank_transfer')}</span></label></div><p class="payment-note" id="payment-note">${t('noCharge')}</p><label class="trial-option" id="trial-control" hidden><input type="checkbox" id="trial" name="trial"><span><b id="trial-title">${t('trialOptIn',{n:trialDays()})}</b><small>${t('trialOptInHint',{n:trialDays()})}</small></span></label></fieldset></section><p class="privacy-note">${t('privacyNote')} <a href="/privacy" target="_blank" rel="noopener" class="text-link">${t('privacyPolicy')}</a>.</p><p class="privacy-note">${t('agreeNote')} <a href="/terms" target="_blank" rel="noopener" class="text-link">${t('termsTitle')}</a> · <a href="/refund" target="_blank" rel="noopener" class="text-link">${t('refundTitle')}</a>.</p><button class="btn primary full form-submit" type="submit">${t('submit')}</button></form><aside class="order-summary" id="order-summary" aria-live="polite"></aside></div></div>`;
}
function selectedQuote() {
  const form = document.getElementById('application-form');
  const plan = state.catalog.plans.find(p=>p.id===form.elements.plan.value);
  const includes = ['business','enterprise'].includes(plan.id);
  const loyalty = !includes && form.elements.loyalty.checked;
  const count = plan.id === 'enterprise' ? 0 : Math.max(0,Math.min(50,Number(form.elements.extraSpecialists.value)||0));
  const base = perPeriod(priceOf(plan.prices)), loyaltyPrice = perPeriod(priceOf(state.catalog.addons.loyalty)), specialistPrice = perPeriod(priceOf(state.catalog.addons.specialist));
  return { plan, base, loyalty, count, loyaltyPrice, specialistPrice, total:base===null?null:base+(loyalty?loyaltyPrice:0)+count*specialistPrice };
}
function syncApplication() {
  const form = document.getElementById('application-form');
  if (!form) return;
  const plan = form.elements.plan.value;
  const includes = ['business','enterprise'].includes(plan);
  document.getElementById('loyalty-control').hidden = includes;
  document.getElementById('included-loyalty').hidden = !includes;
  form.elements.loyalty.disabled = includes;
  if (includes) form.elements.loyalty.checked = false;
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
  document.getElementById('order-summary').innerHTML = `<h2>${t('summary')}</h2><div class="summary-plan"><h3>${q.plan.name}</h3><a href="/plans" class="text-link">${t('backPlans')}</a></div><div class="summary-row"><span>${q.plan.name}</span><span><bdi>${money(q.base)}</bdi></span></div>${q.loyalty?`<div class="summary-row"><span>${t('loyalty')}</span><span><bdi>${money(q.loyaltyPrice)}</bdi></span></div>`:''}${q.count?`<div class="summary-row"><span>${t('extraSpecialists')} × ${q.count}</span><span><bdi>${money(q.count*q.specialistPrice)}</bdi></span></div>`:''}<div class="summary-total"><span class="label">${q.total===null?t('requestQuote'):t(totalKey())}</span>${priceHTML(q.total)}${q.total===null?'':`<p class="small-note">${t(periodKey())}</p>`}</div>${trial?`<p class="notice success trial-note">${t('trialSummary',{n:trialDays()})}</p>`:''}<p class="summary-contact">${t('contactDetails')}<br><strong class="ltr">${esc(state.user.email)}</strong></p><div class="section-divider"></div><p class="small-note">${online?t('checkoutPriceNote')+((q.loyalty&&!addonPrice('loyalty',state.interval))||(q.count&&!addonPrice('specialist',state.interval))?' '+t('addonsLaterNote'):''):t('noCharge')}</p>`;
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
  const who = m => m.direction==='in' ? (admin ? (m.author || t('customer')) : t('you')) : m.direction==='out' ? 'Salonieer' : t('system');
  const open = !['approved','declined'].includes(a.status) || admin;
  if (!list.length && !open) return '';
  return `<section class="thread" aria-label="${t('messages')}"><h3>${t('messages')}</h3>${list.length?`<ol class="thread-list" data-paginate="thread-${esc(a.id)}" data-paginate-start="last">${list.map(m=>`<li class="msg ${m.direction}"><div class="msg-head"><b>${esc(who(m))}</b><time>${date(m.createdAt)}</time></div><p>${esc(m.body)}</p></li>`).join('')}</ol>`:`<p class="small-note">${t('noMessages')}</p>`}
    ${open&&!admin?`<form class="reply-form" data-reply="${esc(a.id)}"><label for="reply-${esc(a.id)}">${t('yourReply')}</label><textarea id="reply-${esc(a.id)}" name="body" rows="3" maxlength="5000" required></textarea><button class="btn small" type="submit">${t('sendReply')}</button><span class="status-feedback" role="status"></span></form>`:''}</section>`;
}
function receipt() {
  const a = state.receipt;
  return `<div class="wrap"><section class="receipt" tabindex="-1"><div class="receipt-check" aria-hidden="true">✓</div><h1>${t('receivedTitle')}</h1><p>${t('receivedLead')}</p><div class="reference-box"><span class="label">${t('reference')}</span><strong dir="ltr">${esc(a.id)}</strong></div><div class="summary-row"><span>${t('salonName')}</span><span>${esc(a.salonName)}</span></div><div class="summary-row"><span>${t('selectedPlan')}</span><span>${esc(a.plan[0].toUpperCase()+a.plan.slice(1))}</span></div><div class="summary-row"><span>${t(totalKey(a.quote.interval))}</span><span><bdi>${money(a.quote.total,a.quote.currency||'ILS')}</bdi></span></div>${a.quote.trialDays?`<p class="notice success trial-note">${t('trialSummary',{n:a.quote.trialDays})}</p>`:''}<div class="summary-row"><span>${t('payment')}</span><span>${t(a.paymentMethod)} · ${paymentBadge(a)}</span></div><div class="summary-row"><span>${t('status')}</span><span>${statusBadge(a)}</span></div>${stateNote(a)}${payButton(a)}${testPayButton(a)}<a class="btn ${canPayOnline(a)?'':'primary '}full" href="/applications">${t('viewApplications')}</a></section></div>`;
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
      <div class="field"><label for="cat-${esc(a.id)}">${t('salonCategory')}</label><select id="cat-${esc(a.id)}" name="salonCategory">${CATEGORIES.map(c=>`<option value="${c}"${a.salonCategory===c?' selected':''}>${t('cat_'+c)}</option>`).join('')}</select></div><div class="field"><label for="tz-${esc(a.id)}">${t('timezone')}</label><input id="tz-${esc(a.id)}" name="timezone" dir="ltr" value="${esc(a.timezone||'')}"></div>
      <div class="field full-span"><label for="owner-${esc(a.id)}">${t('ownerLoginPhone')}</label><input id="owner-${esc(a.id)}" name="ownerPhone" dir="ltr" inputmode="tel" value="${esc(a.ownerPhone||'')}"><small>${t('ownerLoginPhoneHint')}</small></div>
      <button class="btn primary full full-span" type="submit"${paid?'':' disabled'}>${t('approveCreate')}</button><span class="status-feedback full-span" role="status"></span></form></details></div>`;
}
function applicationCard(a,admin=false) {
  return `<article class="application-card" id="app-${esc(a.id)}"><div class="application-card-top"><img src="${esc(a.logoUrl)}" alt="${t('logo')}: ${esc(a.salonName)}" class="logo-preview"><div><h2>${esc(a.salonName)}</h2><span class="ref"><bdi>${esc(a.id)}</bdi></span></div><div class="badges">${statusBadge(a)}${paymentBadge(a)}</div></div><dl class="application-meta"><div><dt>${t('selectedPlan')}</dt><dd>${esc(a.plan[0].toUpperCase()+a.plan.slice(1))}</dd></div><div><dt>${t(totalKey(a.quote.interval))}</dt><dd class="price-value"><bdi>${money(a.quote.total,a.quote.currency||'ILS')}</bdi></dd></div><div><dt>${t('payment')}</dt><dd>${t(a.paymentMethod)}</dd></div><div><dt>${t('submittedOn')}</dt><dd>${date(a.createdAt)}</dd></div></dl>${a.quote.loyalty||a.quote.extraSpecialists?`<p class="small-note">${t('optionalAddons')}: ${[a.quote.loyalty?t('loyalty'):'',a.quote.extraSpecialists?`${t('extraSpecialists')} × ${a.quote.extraSpecialists}`:''].filter(Boolean).join(' · ')}</p>`:''}${admin?'':stateNote(a)+payButton(a)+testPayButton(a)}${admin?`<div class="admin-details"><dl><div><dt>${t('fullName')}</dt><dd>${esc(a.fullName)}</dd></div><div><dt>${t('email')}</dt><dd><a class="text-link ltr" href="mailto:${esc(a.email)}">${esc(a.email)}</a></dd></div><div><dt>${t('phone')}</dt><dd><a class="text-link ltr" href="tel:${esc(a.phone)}">${esc(a.phone)}</a></dd></div><div><dt>${t('location')}</dt><dd>${esc(countryName(a.country))}</dd></div><div><dt>${t('identityNumber')}</dt><dd><bdi>${esc(a.identityNumber||('••'+a.idLast4))}</bdi></dd></div><div><dt>${t('yourPricing')}</dt><dd>${t(a.quote.region==='west_bank'?'westBankPricing':'standardPricing')}</dd></div><div><dt>${t('salonCategory')}</dt><dd>${t('cat_'+a.salonCategory)}</dd></div><div><dt>${t('timezone')}</dt><dd dir="ltr">${esc(a.timezone)}</dd></div>${a.paymentReference?`<div><dt>${t('paymentRef')}</dt><dd dir="ltr">${esc(a.paymentReference)}</dd></div>`:''}</dl>${adminActions(a)}</div>`:''}${thread(a,admin)}</article>`;
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
  const qr = window.SalonQR ? window.SalonQR.svg(s.deepLink) : '';
  const features = Object.values(s.features||{}).map(f=>`<li class="${f.enabled?'on':'off'}"><span aria-hidden="true">${f.enabled?'✓':'–'}</span>${esc(lang==='ar'?f.labelAr:f.labelEn)}</li>`).join('');
  const limit = spec.unlimited ? t('unlimited') : `${spec.active ?? 0} / ${spec.limit ?? 0}`;
  const live = s.isActive && sub.good_standing !== false;
  const planName = s.plan?.code==='full_access' ? 'Enterprise' : (lang==='ar' ? s.plan?.nameAr : s.plan?.nameEn) || '';
  return `<article class="application-card salon-card"><div class="application-card-top">${s.logoUrl?`<img src="${esc(s.logoUrl)}" alt="" class="logo-preview">`:''}<div><h2>${esc(s.name)}</h2><span class="ref"><bdi>${esc(s.applicationId)}</bdi></span></div><div class="badges"><span class="status ${live?'approved':'declined'}">${t(live?'salonActive':'salonPaused')}</span></div></div>
    <div class="salon-grid"><figure class="salon-qr">${qr}<figcaption><b dir="ltr">${esc(s.accessCode)}</b><small>${t('scanToAdd')}</small></figcaption></figure>
    <dl class="application-meta salon-meta"><div><dt>${t('salonCode')}</dt><dd dir="ltr">${esc(s.accessCode)}</dd></div><div><dt>${t('selectedPlan')}</dt><dd>${esc(planName)}</dd></div><div><dt>${t('specialists')}</dt><dd>${limit}</dd></div><div><dt>${t('salonCategory')}</dt><dd>${t('cat_'+s.category)}</dd></div><div><dt>${t('timezone')}</dt><dd dir="ltr">${esc(s.timezone||'')}</dd></div><div><dt>${t('startDate')}</dt><dd>${sub.starts_on?date(sub.starts_on):''}</dd></div>${sub.expires_on?`<div><dt>${t('periodEnds')}</dt><dd>${date(sub.expires_on)}</dd></div>`:''}<div><dt>${t('appLink')}</dt><dd dir="ltr"><a class="text-link" href="${esc(s.deepLink)}">${esc(s.deepLink)}</a></dd></div></dl></div>
    ${features?`<ul class="salon-features" aria-label="${t('features')}">${features}</ul>`:''}
    ${billingSection(s)}
    ${live ? reportSection(s) : ''}
    <section class="owner-login"><h3>${t('ownerLogin')}</h3><p class="small-note">${t('ownerLoginHint')}</p><dl class="application-meta"><div><dt>${t('phone')}</dt><dd dir="ltr">${esc(s.owner.phone)}</dd></div>${s.owner.temporaryPassword?`<div><dt>${t('tempPassword')}</dt><dd dir="ltr"><code>${esc(s.owner.temporaryPassword)}</code></dd></div>`:''}</dl>
      ${s.owner.temporaryPassword?`<p class="notice warning">${t('tempPasswordNote')}</p><button class="btn small" type="button" data-password-saved="${esc(s.applicationId)}">${t('passwordSaved')}</button>`:`<p class="small-note">${t('passwordHidden')}</p>`}</section></article>`;
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
  return { plan, interval: b.interval==='year'?'year':'month', extraSpecialists: items.filter(i=>i.item==='specialist').reduce((n,i)=>n+(Number(i.quantity)||0),0), loyalty: items.some(i=>i.item==='loyalty') };
}
function changeText(c) {
  return [PLAN_NAMES[c.plan] || c.plan, t(c.interval==='year'?'yearly':'monthly'), c.extraSpecialists ? `+${c.extraSpecialists} ${t('specialists')}` : '', c.loyalty ? t('loyalty') : ''].filter(Boolean).join(' · ');
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
    <div class="form-grid"><div class="field"><label for="cp-${app}">${t('plans')}</label><select id="cp-${app}" name="plan">${options(['basic','pro','business'], c.plan, v=>PLAN_NAMES[v])}</select></div>
    <div class="field"><label for="ci-${app}">${t('billingPeriod')}</label><select id="ci-${app}" name="interval">${options(['month','year'], c.interval, v=>t(v==='year'?'yearly':'monthly'))}</select></div>
    <div class="field"><label for="cs-${app}">${t('extraSpecialists')}</label><input id="cs-${app}" name="extraSpecialists" type="number" min="0" max="50" step="1" inputmode="numeric" value="${c.extraSpecialists}"></div>
    <div class="field check-field" data-loyalty-field><label class="check-row"><input type="checkbox" name="loyalty"${c.loyalty?' checked':''}> <span>${t('loyalty')}</span></label></div>
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
function account() {
  const b = state.billing, sub = b.subscriptions[0];
  const meta = (label,value) => value ? `<div><dt>${t(label)}</dt><dd>${value}</dd></div>` : '';
  const interval = !sub?.interval ? '' : sub.frequency===1 && ['month','year'].includes(sub.interval) ? t(sub.interval==='year'?'annual':'monthly') : `${t('every')} ${sub.frequency} ${t('interval_'+sub.interval)}`;
  const change = sub?.scheduledChange && sub.status!=='canceled' ? `<p class="notice info">${t('scheduled_'+sub.scheduledChange.action)}${sub.scheduledChange.at?` <bdi>${date(sub.scheduledChange.at)}</bdi>`:''}. ${t('accessUntilChange')}</p>` : '';
  const card = sub && !state.salons.some(s=>s.billing?.subscriptionId) ? `<article class="application-card"><div class="application-card-top"><div><h2>${esc(sub.productName || t('subscription'))}</h2><span class="ref"><bdi>${esc(sub.id)}</bdi></span></div><span class="status ${subscriptionTone(sub.status)}">${t('sub_'+sub.status)}</span></div><dl class="application-meta">${meta('paidAccess',t(b.hasAccess?'accessActive':'accessInactive'))}${meta('billingPeriod',esc(interval))}${meta('nextBilling',sub.nextBilledAt?date(sub.nextBilledAt):'')}${meta('periodEnds',!sub.nextBilledAt&&sub.currentPeriodEndsAt?date(sub.currentPeriodEndsAt):'')}</dl>${change}</article>`
    : (state.salons.length ? '' : `<div class="empty-state"><h2>${t('noSubscription')}</h2><p>${t(b.hasCustomer?'noSubscriptionText':'noBillingText')}</p>${b.hasCustomer?'':`<a class="btn primary" href="/plans">${t('explorePlans')}</a>`}</div>`);
  const portal = b.hasCustomer ? `<section class="invite-panel"><button class="btn primary" type="button" id="manage-billing">${t('manageBilling')}</button><p class="small-note">${t('manageBillingHint')}</p><p id="billing-feedback" role="status"></p></section>` : '';
  const justPaid = new URLSearchParams(location.search).get('checkout')==='complete' && !b.hasAccess ? `<div class="notice info"><p>${t('paymentProcessing')}</p><button class="btn small" type="button" id="refresh-billing">${t('refresh')}</button></div>` : '';
  const salons = state.salons.length ? `<h2 class="section-label">${t('yourSalons')}</h2><div class="salon-list" data-paginate="salons">${state.salons.map(salonCard).join('')}</div>` : '';
  return `<div class="narrow">${titleBlock('account','accountTitle','accountLead')}<div class="application-list">${justPaid}${salons}${invoicesSection()}${card}${portal}${accountSettings()}</div></div>`;
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
  return `<section class="settings-panel" aria-labelledby="settings-title"><h2 class="section-label" id="settings-title">${t('accountSettings')}</h2>
    <div class="settings-grid"><form id="profile-form" class="settings-card" novalidate><h3>${t('profileTitle')}</h3>${formErrorBox()}${field('fullName','fullName',{autocomplete:'name',maxlength:100})}
      <p class="small-note">${t('signInEmail')}: <bdi>${esc(u.email)}</bdi></p><button class="btn small primary" type="submit">${t('saveName')}</button></form>
    <form id="password-form" class="settings-card" novalidate><h3>${t('changePassword')}</h3>${formErrorBox()}${field('currentPassword','currentPassword',{type:'password',autocomplete:'current-password'})}
      ${field('newPassword','newPassword',{type:'password',autocomplete:'new-password',hint:'passwordHint'})}${field('newPasswordConfirm','passwordConfirm',{type:'password',autocomplete:'new-password'})}
      <p class="small-note">${t('passwordChangeNote')}</p><button class="btn small primary" type="submit">${t('changePassword')}</button></form></div>
    <section class="danger-zone" aria-labelledby="delete-title"><h3 id="delete-title">${t('deleteAccount')}</h3>${del}</section></section>`;
}
function support() {
  return `<div class="wrap">${titleBlock('support','helpTitle','helpLead')}<div class="support-layout"><section class="support-contact"><h2>${t('contactUs')}</h2><a class="email-address" href="mailto:salonieer1st@gmail.com" dir="ltr">salonieer1st@gmail.com</a><a class="btn primary" href="mailto:salonieer1st@gmail.com?subject=Salonieer%20Support">${t('emailSupport')}</a><button type="button" class="btn" id="copy-email">${t('copyEmail')}</button><p id="copy-feedback" role="status"></p></section><section class="faq-list"><h2>${t('faq')}</h2>${[['faqLoginQ','faqLoginA','account'],['faqPriceQ','faqPriceA','pricing'],['faqPayQ','faqPayA','payment'],['faqNotificationsQ','faqNotificationsA','notifications'],['faqSalonQ','faqSalonA','salon']].map(([q,a,id])=>`<details id="${id}"${location.hash==='#'+id?' open':''}><summary>${t(q)}</summary><p>${t(a)}</p></details>`).join('')}</section></div></div>`;
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
  if (form.id === 'login-form') return { email: v => V.email(v), password: v => v ? null : 'requiredPassword' };
  if (form.id === 'register-form' || form.id === 'setup-form') return {
    ...(form.id === 'setup-form' ? { setupKey: v => V.clean(v).length >= 6 ? null : 'invalidSetupKey' } : {}),
    fullName: V.fullName,
    email: V.email,
    password: v => V.password(v, el('email').value),
    passwordConfirm: v => !v ? 'requiredPassword' : v === el('password').value ? null : 'passwordMismatch',
    country: v => v ? null : 'requiredCountry',
  };
  if (form.id === 'profile-form') return { fullName: V.fullName };
  if (form.id === 'password-form') return {
    currentPassword: v => v ? null : 'requiredPassword',
    newPassword: v => V.password(v, state.user?.email || ''),
    newPasswordConfirm: v => !v ? 'requiredPassword' : v === el('newPassword').value ? null : 'passwordMismatch',
  };
  if (form.id === 'delete-form') return { deletePassword: v => v ? null : 'requiredPassword' };
  if (form.id === 'application-form') return { identityNumber: V.idNumber, salonName: V.salonName,
    phone: v => !V.clean(v) ? 'requiredPhone' : phoneE164(v, el('phoneCountry').value) ? null : 'invalidPhone' };
  return {};
}
// The visible control for a field (country pickers keep their value in a hidden input).
const controlOf = (form, name) => form.querySelector(`#${name}-btn`) || form.elements[name];
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
  if (path === '/api/login') data.email = V.clean(data.email).toLowerCase();
  if (path === '/api/applications') {
    if (state.logoLoading) return showError(form, {code:'processing', field:'logo'});
    if (!state.logo) return showError(form, {code:'invalidLogo', field:'logo'});
    if (!form.elements.paymentMethod.value) return showError(form, {code:'invalidPayment'});
    const q = selectedQuote();
    Object.assign(data, {phone:phoneE164(data.phone, data.phoneCountry)?.number || data.phone, identityNumber:V.normalizeId(data.identityNumber), salonName:V.clean(data.salonName), salonCategory:form.elements.salonCategory.value, timezone:form.elements.timezone.value, lang, currency:state.currency, interval:state.interval, plan:q.plan.id, loyalty:q.loyalty, trial:!document.getElementById('trial-control').hidden && form.elements.trial.checked, extraSpecialists:Number(form.elements.extraSpecialists.value)||0, logo:state.logo, submissionKey:state.submissionKey});
  }
  const submit = form.querySelector('button[type=submit]');
  const busyLabel = t({'/api/applications':'submitting','/api/login':'signingIn','/api/register':'creatingAccount','/api/setup':'creatingAccount'}[path] || 'processing');
  setBusy(submit, true, busyLabel);
  form.dataset.busy = 'true';
  document.getElementById('language').disabled = true;
  try {
    const result = await post(path, data, submit, busyLabel);
    if (result.user) {
      delete drafts[route]; form.reset();
      broadcast('login');
      // A full page load into the next page, built from the server for the signed-in account.
      try { sessionStorage.setItem('salonieer:flash', path === '/api/login' ? 'signedIn:' + result.user.fullName.split(' ')[0] : 'accountCreated'); } catch {}
      location.replace(path === '/api/setup' ? '/admin' : nextPage());
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
    const language = document.getElementById('language'); if (language) language.disabled = false;
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
  const dial = bindCountryPicker(dialRoot, pickerOptions({pinned:PINNED, onChange:()=>{ placeholder(); recheck(); phone.focus(); }}));
  if (dial.value) dial.choose(dial.value, {silent:true});
  placeholder();
  phone.addEventListener('input', () => {
    const v = phone.value.trim();
    if (!/^(\+|00)/.test(v)) return;
    try { const n = phoneLib.parsePhoneNumberWithError(v.replace(/^00/, '+')); if (n.country && n.country !== dial.value && n.isPossible()) { dial.choose(n.country, {silent:true}); placeholder(); } } catch {}
  });
  phone.addEventListener('blur', () => { const n = phoneE164(phone.value, dial.value); if (n) { if (n.country && n.country !== dial.value) dial.choose(n.country, {silent:true}); phone.value = n.formatNational(); } });
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
  state.user = session.user; state.csrf = session.csrf; state.checkout = session.checkout; state.platform = session.platform || null;
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
  document.getElementById('language').addEventListener('change',event=>{captureDraft();setLanguage(event.target.value);render({transition:true});});
  const menu = document.getElementById('menu-toggle'), nav = document.getElementById('nav-panel');
  menu.addEventListener('click',()=>{const open=nav.classList.toggle('open');menu.setAttribute('aria-expanded',String(open));});
  nav.addEventListener('keydown',event=>{if(event.key==='Escape'){nav.classList.remove('open');menu.setAttribute('aria-expanded','false');menu.focus();}});
  document.getElementById('logout')?.addEventListener('click',event=>logout(event.currentTarget));
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
  document.getElementById('login-form')?.addEventListener('submit',event=>submitForm(event,'/api/login'));
  const registerForm = document.getElementById('register-form') || document.getElementById('setup-form');
  if (registerForm) bindAccountForm(registerForm);
  const applicationForm = document.getElementById('application-form');
  if (applicationForm) {
    if (!drafts[route]) applicationForm.elements.plan.value = new URLSearchParams(location.search).get('plan') || 'basic';
    for (const name of ['plan','loyalty','extraSpecialists','paymentMethod','trial']) {
      applicationForm.querySelectorAll(`[name="${name}"]`).forEach(el=>el.addEventListener('input',syncApplication));
    }
    bindPhoneField(applicationForm);
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
  document.getElementById('copy-email')?.addEventListener('click',async()=>{
    try { await navigator.clipboard.writeText('salonieer1st@gmail.com');document.getElementById('copy-feedback').textContent=t('copied'); }
    catch { document.getElementById('copy-feedback').textContent=t('copyFailed'); }
  });
  document.querySelectorAll('[data-currency]').forEach(button=>button.addEventListener('click',()=>{
    if (button.dataset.currency===state.currency) return;
    captureDraft();setCurrency(button.dataset.currency);paint();
    document.querySelector(`[data-currency="${state.currency}"]`)?.focus();
  }));
  document.querySelectorAll('[data-interval]').forEach(button=>button.addEventListener('click',()=>{
    if (button.dataset.interval===state.interval) return;
    captureDraft();setInterval_(button.dataset.interval);paint();
    document.querySelector(`[data-interval="${state.interval}"]`)?.focus();
  }));
  document.querySelectorAll('[data-filter]').forEach(button=>button.addEventListener('click',()=>{state.filter=button.dataset.filter;paint();}));
  bindApplicationActions();
  bindBilling();
  bindAccountSettings();
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
        const result = await api('/api/account', {method:'PATCH', body:JSON.stringify({fullName:V.clean(profile.elements.fullName.value)})});
        state.user = result.user; delete drafts[route]; toast(t('nameSaved'), 'success'); render();
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
      const result = await post('/api/account/password', {currentPassword:password.elements.currentPassword.value, newPassword:password.elements.newPassword.value, newPasswordConfirm:password.elements.newPasswordConfirm.value}, button, t('processing'));
      if (result.csrf) state.csrf = result.csrf;
      password.reset(); delete drafts[route]; toast(t('passwordChanged'), 'success');
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
// Account page: salon billing actions. Each one re-reads the account so the cards show what Paddle now says.
async function billingAction(button, path, data={}) {
  setBusy(button, true, t('processing'));
  try { return await api(path, {method:'POST', body:JSON.stringify(data)}); }
  catch (error) { toast(t(error.code || 'serverError'), 'error'); return null; }
  finally { if (button.isConnected) setBusy(button, false); }
}
const changeData = form => ({ plan:form.elements.plan.value, interval:form.elements.interval.value, extraSpecialists:Math.max(0,Math.min(50,parseInt(form.elements.extraSpecialists.value,10)||0)), loyalty:form.elements.loyalty.checked && form.elements.plan.value!=='business' });
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
    const syncLoyalty = () => { form.querySelector('[data-loyalty-field]').hidden = form.elements.plan.value==='business'; box.innerHTML=''; };
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
const pages = {'/':home,'/login':login,'/register':register,'/plans':plans,'/apply':apply,'/applications':()=>applications(false),'/admin':()=>applications(true),'/account':account,'/support':support,'/privacy':privacy,'/terms':termsPage,'/refund':refundPage,'/setup':setup,'/checkout':paymentLink};
const titles = {'/checkout':'payByCard','/':'tagline','/login':'login','/register':'register','/plans':'plans','/apply':'applyTitle','/applications':'applications','/admin':'inbox','/account':'account','/support':'support','/privacy':'privacyPolicy','/terms':'termsTitle','/refund':'refundTitle','/setup':'setupTitle'};
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.effects === 'off';
// What the admin panel needs from the website: its session, API helpers, dialogs and language.
const adminContext = () => ({ lang, t, state, api, toast, confirmDialog, setBusy, go,
  post: (path, data) => post(path, data, null, t('processing')),
  setLanguage: value => { setLanguage(value); render(); } });
function paint() {
  if (isAdminRoute(route)) {
    setLanguage(lang); killFx();
    app.innerHTML = adminShell(adminContext());
    bindAdmin(adminContext());
    return;
  }
  setLanguage(lang);
  killFx();
  document.title = 'Salonieer · ' + t(titles[route] || 'home');
  const scene = route === '/' ? 'is-home' : route === '/plans' ? 'is-plans' : ['/login','/register','/setup'].includes(route) ? 'is-auth' : 'is-paper';
  document.body.dataset.scene = scene;
  app.innerHTML = header()+`<main id="main" tabindex="-1" class="${scene}">${(pages[route] || home)()}</main>`+footer();
  restoreDraft();bind();
  initFx(route);
  initInteract(app, t);
}
// A new page fades in once its data is ready. Plain CSS on <main> only, so the header stays put and clicks are never
// blocked mid-animation.
function render({transition=false}={}) {
  paint();
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
    if ((next==='/admin'||next.startsWith('/admin/')) && !state.user?.isAdmin) return go('/applications', {replace:true});
    if (['/login','/register'].includes(next) && state.user) return go(nextPage(), {replace:true});
    // A new page (not a re-render of the same one) starts with a fresh application form.
    if (key !== routeKey) { state.receipt = null; state.logo = ''; state.logoName = ''; state.submissionKey = crypto.randomUUID(); }
    if (next==='/apply') await loadPhoneLib();
    if (next==='/') { try { state.catalog = await api('/api/plans'); } catch { state.catalog = null; } }
    if (['/plans','/apply'].includes(next)) {
      let tz = '';
      try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch {}
      state.catalog = await api('/api/plans?tz='+encodeURIComponent(tz));
      if (state.catalog.source==='default') {
        // The server couldn't locate this visitor (some hosts block outgoing lookups), so ask from the browser.
        const cc = await browserCountry();
        if (cc) { try { state.catalog = await api('/api/plans?tz='+encodeURIComponent(tz)+'&cc='+cc); } catch {} }
      }
    }
    if (next==='/setup') state.setupAvailable=(await api('/api/setup')).available;
    if (next==='/apply') {
      const plan=new URLSearchParams(location.search).get('plan') || 'basic';
      if (!state.catalog.plans.some(p=>p.id===plan)) return go('/plans', {replace:true});
    }
    if (next==='/account') {
      // Salons come from the shared database; billing keeps working on its own if that is unavailable.
      const fresh = new URLSearchParams(location.search).get('checkout')==='complete' ? '?fresh=1' : '';
      const [billing, salons, invoices, deletion] = await Promise.all([api('/api/billing'+fresh), api('/api/salons').catch(()=>({salons:[]})), api('/api/invoices').catch(()=>({invoices:[]})), api('/api/account/deletion').catch(()=>null)]);
      state.billing = billing; state.salons = salons.salons || []; state.invoices = invoices.invoices || []; state.deletion = deletion;
    }
    // A card payment that may have just finished is confirmed before these pages show its status.
    if (['/applications','/account'].includes(next) && payingId()) { try { await checkPayment(payingId()); } catch {} }
    if (next==='/applications') state.applications=(await api('/api/applications')).applications;
    if (token !== navToken) return;
    route = next; routeKey = key; loadedAt = Date.now();
    // A quiet refresh never wipes what someone is typing (a reply, an admin note).
    if (quiet && !afterAction && [...document.querySelectorAll('#main textarea, #main input')].some(el => el.value && el.type !== 'hidden' && el.type !== 'radio' && el.type !== 'checkbox' && !el.readOnly && el.closest('form') && !el.closest('.approve-form'))) return;
    const y = window.scrollY;
    await render({transition: transition && !quiet});
    if (quiet) { window.scrollTo({top:y, behavior:'instant'}); return; }
    if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
    else if (scroll) window.scrollTo({top:0, behavior:'instant'});
    if (transition) document.getElementById('main')?.focus({preventScroll:true});
    if (route==='/checkout') startPaymentLink();
  } catch(error) {
    if (token !== navToken) return;
    route = next;
    app.innerHTML=header()+`<main id="main" class="wrap empty-state"><h1>Salonieer</h1><p role="alert">${t(error.code || 'serverError')}</p><button class="btn primary" id="retry">${t('retry')}</button></main>`+footer();
    document.getElementById('retry').addEventListener('click',()=>loadRoute());
    document.getElementById('language').addEventListener('change',event=>{setLanguage(event.target.value);loadRoute();});
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
