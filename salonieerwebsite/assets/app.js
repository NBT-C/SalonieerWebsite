import { languages, translate } from './i18n.js';
import { COUNTRIES } from './countries.js';
import { policy } from './policy.js';
import { terms, refund } from './legal.js';

const app = document.getElementById('app');
let storedLanguage;
try { storedLanguage = localStorage.getItem('salonieer_lang'); } catch {}
let lang = languages.includes(storedLanguage) ? storedLanguage : (languages.includes(navigator.language.slice(0,2)) ? navigator.language.slice(0,2) : 'en');
let route = location.pathname.replace(/\.html$/, '').replace(/\/$/, '') || '/';
if (route === '/index') route = '/';
const privateRoutes = ['/apply','/applications','/account','/admin'];
const CURRENCIES = ['USD','ILS'];
const SYMBOLS = { USD:'$', ILS:'₪' };
let storedCurrency;
try { storedCurrency = localStorage.getItem('salonieer_currency'); } catch {}
const state = { currency: CURRENCIES.includes(storedCurrency) ? storedCurrency : 'USD', user: null, csrf: '', catalog: null, applications: [], logo: '', logoName: '', submissionKey: crypto.randomUUID(), receipt: null, filter: 'all', billing: null, checkout: null, paid: false };
const drafts = {};
const t = key => translate(key,lang);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money = (value,currency=state.currency) => value === null || value === undefined ? t('byAgreement') : (SYMBOLS[currency] || '₪') + Number(value).toLocaleString('en-US');
const priceOf = prices => prices ? prices[state.currency] ?? null : null;
function setCurrency(value) {
  state.currency = CURRENCIES.includes(value) ? value : 'USD';
  try { localStorage.setItem('salonieer_currency',state.currency); } catch {}
}
function currencySwitch(id='currency') {
  return `<div class="currency-switch" role="radiogroup" aria-label="${t('currency')}">${CURRENCIES.map(c=>`<button type="button" role="radio" class="currency-option${state.currency===c?' active':''}" data-currency="${c}" aria-checked="${state.currency===c}" title="${t('currency'+c)}"><span aria-hidden="true">${SYMBOLS[c]}</span> ${c}</button>`).join('')}</div>`;
}
function pricingNote(c) {
  const tier = t(c.region==='west_bank'?'westBankPricing':'standardPricing');
  if (c.source==='account') return `${t('pricingFromAccount')}: ${esc(countryName(c.country))} · ${tier}`;
  if (c.source==='location' && c.country) return `${t('pricingFromLocation')}: ${esc(countryName(c.country))} · ${tier}`;
  return `${t('pricingDefault')} · ${tier}`;
}
const date = value => new Intl.DateTimeFormat(lang, { dateStyle:'medium' }).format(new Date(value));
const statusNames = ['pending','in_review','needs_info','approved','declined'];

async function api(path, options = {}) {
  let response;
  try {
    response = await fetch(path, {
      ...options, credentials:'same-origin', cache:'no-store',
      headers: { ...(options.body ? {'Content-Type':'application/json','X-CSRF-Token':state.csrf} : {}), ...options.headers }
    });
  } catch { throw { code:'connectionError' }; }
  let data;
  try { data = await response.json(); } catch { throw { code:'serverError' }; }
  if (!response.ok) {
    if (response.status === 401 && data.error === 'loginRequired') {
      app.innerHTML = '';
      location.replace('/login?next=' + encodeURIComponent(location.pathname + location.search));
    }
    throw { code:data.error || 'serverError', field:data.field, status:response.status };
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
  return `<a class="skip" href="#main">${t('skip')}</a><header class="topbar"><div class="wrap nav">
    <a href="/" class="brand" aria-label="Salonieer"><span class="brand-s" aria-hidden="true">S</span><span class="wordmark">Salonieer</span></a>
    <nav id="nav-panel" class="nav-panel" aria-label="${t('menu')}"><div class="nav-links">${link('/','home')}${link('/plans','plans')}${state.user?link('/applications','applications')+link('/account','account'):''}${link('/support','support')}${state.user?.isAdmin?link('/admin','inbox'):''}</div><div class="nav-actions">${state.user?`<button class="btn small" id="logout">${t('logout')}</button>`:`<a class="btn small" href="/login">${t('login')}</a><a class="btn primary small" href="/register">${t('register')}</a>`}</div></nav>
    <select id="language" class="language-select" aria-label="${t('language')}"><option value="en" ${lang==='en'?'selected':''}>EN</option><option value="ar" ${lang==='ar'?'selected':''}>العربية</option><option value="he" ${lang==='he'?'selected':''}>עברית</option></select>
    <button class="menu-toggle" id="menu-toggle" aria-controls="nav-panel" aria-expanded="false">${t('menu')}</button>
  </div></header>`;
}
function footer() {
  return `<footer class="site-footer"><div class="wrap footer-inner"><div class="footer-brand"><span class="wordmark" dir="ltr">Salonieer</span><span>© ${new Date().getFullYear()} Salonieer</span></div><div class="footer-links"><a href="/support">${t('support')}</a><a href="/terms">${t('termsTitle')}</a><a href="/privacy">${t('privacyPolicy')}</a><a href="/refund">${t('refundTitle')}</a><a href="mailto:salonieer1st@gmail.com" dir="ltr">salonieer1st@gmail.com</a></div></div></footer>`;
}
function titleBlock(eyebrow,title,lead,center=false,extra='') {
  return `<div class="page-heading${center?' center':''}"><div class="eyebrow">${t(eyebrow)}</div><h1>${t(title)}</h1>${lead?`<p>${t(lead)}</p>`:''}${extra}</div>`;
}
function priceHTML(value,currency=state.currency) {
  return value === null || value === undefined ? `<div class="price"><span class="agreement">${t('byAgreement')}</span></div>` : `<div class="price"><span class="currency">${SYMBOLS[currency] || '₪'}</span><span class="amount">${Number(value).toLocaleString('en-US')}</span></div>`;
}
function field(name,label,{type='text',hint='',required=true,autocomplete='',minlength='',maxlength='',placeholder='',extra='',full=false}={}) {
  const password = type === 'password';
  return `<div class="field${full?' full-span':''}"><label for="${name}">${t(label)}</label>${password?'<div class="password-wrap">':''}<input id="${name}" name="${name}" type="${type}" ${required?'required':''} ${autocomplete?`autocomplete="${autocomplete}"`:''} ${minlength?`minlength="${minlength}"`:''} ${maxlength?`maxlength="${maxlength}"`:''} ${placeholder?`placeholder="${esc(placeholder)}"`:''} aria-describedby="${name}-hint ${name}-error" ${extra}>${password?`<button class="password-toggle" type="button" data-password="${name}" aria-controls="${name}" aria-label="${t('show')} ${t(label)}">${t('show')}</button></div>`:''}<small id="${name}-hint">${hint?t(hint):''}</small><small id="${name}-error" class="field-error"></small></div>`;
}
function formErrorBox() { return '<div id="form-error" class="notice" role="alert" tabindex="-1" hidden></div>'; }
function authIntro(title,lead) {
  return `<aside class="auth-intro"><div class="eyebrow">SALONIEER</div><h1>${t(title)}</h1><p>${t(lead)}</p><div class="auth-art" aria-hidden="true"><span>S</span><p>BEAUTY. PEOPLE. PROGRESS.</p></div></aside>`;
}
function home() {
  return `<div class="wrap"><section class="home-hero"><div class="home-copy"><div class="eyebrow">${t('eyebrow')}</div><h1>${t('heroFirst')}<br><em>${t('heroSecond')}</em></h1><p class="lead">${t('heroLead')}</p><div class="hero-actions"><a class="btn primary" href="${state.user?'/plans':'/register'}">${t(state.user?'explorePlans':'register')}</a><a class="btn" href="${state.user?'/applications':'/login'}">${t(state.user?'applications':'login')}</a></div></div><div class="brand-panel"><div class="hero-monogram" aria-hidden="true">S</div><p class="brand-quote">${t('brandQuote')}</p><div class="eyebrow">${t('brandDetail')}</div></div></section><section class="feature-section"><div class="feature-intro"><h2>${t('overview')}</h2></div><div class="features">${[['01','bookings','bookingsText'],['02','team','teamText'],['03','growth','growthText']].map(([n,title,text])=>`<article class="feature"><span class="feature-number">${n}</span><h3>${t(title)}</h3><p>${t(text)}</p></article>`).join('')}</div></section></div>`;
}
function login() {
  return `<div class="wrap auth-layout">${authIntro('welcome','loginLead')}<section class="auth-card"><h2>${t('login')}</h2>${new URLSearchParams(location.search).has('next')?`<p class="notice info">${t('loginRequired')}</p>`:''}<form id="login-form">${formErrorBox()}${field('email','email',{type:'email',autocomplete:'email',maxlength:254,placeholder:'you@example.com'})}${field('password','password',{type:'password',autocomplete:'current-password',maxlength:128})}<div class="login-help"><a class="text-link" href="/support#account">${t('forgot')}</a></div><button class="btn primary full" type="submit">${t('login')}</button></form><p class="auth-footer">${t('noAccount')} <a href="/register" class="text-link">${t('register')}</a></p></section></div>`;
}
function register() {
  const countries = COUNTRIES.map(code=>({code,name:countryName(code)})).sort((a,b)=>a.name.localeCompare(b.name,lang));
  return `<div class="wrap auth-layout">${authIntro('registerTitle','registerLead')}<section class="auth-card"><h2>${t('register')}</h2><form id="register-form">${formErrorBox()}<div class="form-section"><h2>${t('accountDetails')}</h2><div class="form-grid">${field('username','username',{autocomplete:'username',minlength:3,maxlength:32,hint:'usernameHint'})}${field('fullName','fullName',{autocomplete:'name',minlength:3,maxlength:100})}${field('email','email',{type:'email',autocomplete:'email',maxlength:254,placeholder:'you@example.com',full:true})}${field('phone','phone',{type:'tel',autocomplete:'tel',maxlength:24,placeholder:'+970 5X XXX XXXX',hint:'phoneHint',full:true})}${field('password','password',{type:'password',autocomplete:'new-password',minlength:10,maxlength:128,hint:'passwordHint'})}${field('passwordConfirm','passwordConfirm',{type:'password',autocomplete:'new-password',minlength:10,maxlength:128})}</div></div><div class="form-section"><h2>${t('location')}</h2><div class="form-grid"><div class="field"><label for="country">${t('country')}</label><select id="country" name="country" autocomplete="country" required aria-describedby="country-error"><option value="">${t('chooseCountry')}</option>${countries.map(({code,name})=>`<option value="${code}">${esc(name)}</option>`).join('')}</select><small id="country-error" class="field-error"></small></div><div class="field" id="region-field" hidden><label for="region">${t('region')}</label><select id="region" name="region" aria-describedby="region-error" disabled><option value="">${t('chooseRegion')}</option>${['WEST_BANK','GAZA','OTHER'].map(v=>`<option value="${v}">${t(v)}</option>`).join('')}</select><small id="region-error" class="field-error"></small></div></div><p class="form-hint">${t('locationHint')}</p></div><p class="privacy-note">${t('privacyNote')} <a class="text-link" href="/privacy" target="_blank" rel="noopener">${t('privacyPolicy')}</a>.</p><button class="btn primary full" type="submit">${t('register')}</button></form><p class="auth-footer">${t('haveAccount')} <a href="/login" class="text-link">${t('login')}</a></p></section></div>`;
}
function setup() {
  if (!state.setupAvailable) return `<div class="wrap empty-state"><h1>${t('setupDone')}</h1><p>${t('setupDoneText')}</p><a class="btn primary" href="${state.user?'/admin':'/login'}">${t(state.user?'inbox':'login')}</a></div>`;
  const countries = COUNTRIES.map(code=>({code,name:countryName(code)})).sort((a,b)=>a.name.localeCompare(b.name,lang));
  return `<div class="wrap auth-layout">${authIntro('setupTitle','setupLead')}<section class="auth-card"><h2>${t('setupTitle')}</h2><form id="setup-form">${formErrorBox()}<div class="form-section">${field('setupKey','setupKey',{minlength:6,maxlength:64,autocomplete:'off',hint:'setupKeyHint',extra:'data-ltr spellcheck="false" autocapitalize="off"'})}</div><div class="form-section"><h2>${t('accountDetails')}</h2><div class="form-grid">${field('username','username',{autocomplete:'username',minlength:3,maxlength:32,hint:'usernameHint'})}${field('fullName','fullName',{autocomplete:'name',minlength:3,maxlength:100})}${field('email','email',{type:'email',autocomplete:'email',maxlength:254,placeholder:'you@example.com',full:true})}${field('phone','phone',{type:'tel',autocomplete:'tel',maxlength:24,placeholder:'+970 5X XXX XXXX',hint:'phoneHint',full:true})}${field('password','password',{type:'password',autocomplete:'new-password',minlength:10,maxlength:128,hint:'passwordHint'})}${field('passwordConfirm','passwordConfirm',{type:'password',autocomplete:'new-password',minlength:10,maxlength:128})}</div></div><div class="form-section"><h2>${t('location')}</h2><div class="form-grid"><div class="field"><label for="country">${t('country')}</label><select id="country" name="country" autocomplete="country" required aria-describedby="country-error"><option value="">${t('chooseCountry')}</option>${countries.map(({code,name})=>`<option value="${code}">${esc(name)}</option>`).join('')}</select><small id="country-error" class="field-error"></small></div><div class="field" id="region-field" hidden><label for="region">${t('region')}</label><select id="region" name="region" aria-describedby="region-error" disabled><option value="">${t('chooseRegion')}</option>${['WEST_BANK','GAZA','OTHER'].map(v=>`<option value="${v}">${t(v)}</option>`).join('')}</select><small id="region-error" class="field-error"></small></div></div></div><button class="btn primary full" type="submit">${t('setupSubmit')}</button></form></section></div>`;
}
function plans() {
  const c = state.catalog;
  return `<div class="wrap">${titleBlock('plansEyebrow','plansTitle','plansLead',true,`<div class="pricing-controls"><span class="tag"><span class="small-mark" aria-hidden="true"></span>${pricingNote(c)}</span>${currencySwitch()}</div>`)}<section class="pricing-grid" aria-label="${t('plans')}">${c.plans.map((p,i)=>`<article class="plan-card${p.id==='pro'?' featured':''}">${p.id==='pro'?`<div class="popular">${t('popular')}</div>`:''}<div class="plan-icon" aria-hidden="true">${['I','II','III','IV'][i]}</div><h2>${esc(p.name)}</h2><p class="description">${t(p.id+'Desc')}</p><div class="plan-price">${priceHTML(priceOf(p.prices))}<div class="period">${priceOf(p.prices)===null?t('requestQuote'):t('monthly')}</div></div><ul class="plan-features">${p.features.map(f=>`<li><span class="check" aria-hidden="true">✓</span><span>${t(f)}</span></li>`).join('')}</ul><a class="btn ${p.id==='pro'?'primary':'outline'} full" href="/apply?plan=${p.id}" aria-label="${t(p.id==='enterprise'?'contactUs':'startNow')} · ${esc(p.name)}">${t(p.id==='enterprise'?'contactUs':'startNow')}</a></article>`).join('')}</section><section class="addons-section"><div class="addons-title"><h2>${t('optionalAddons')}</h2></div><div class="addons-grid">${[['loyalty','loyaltyText',priceOf(c.addons.loyalty),'◎'],['specialist','specialistText',priceOf(c.addons.specialist),'+1']].map(([name,description,price,symbol])=>`<article class="addon-card"><span class="addon-symbol" aria-hidden="true">${symbol}</span><div><h3>${t(name)}</h3><p>${t(description)}</p></div><div class="addon-price"><bdi>${money(price)}</bdi><small>${t('perMonth')}</small></div></article>`).join('')}</div></section><p class="payment-footnote">${c.source==='account'?'':t('locationPricingNote')+' '}${t('noCharge')} <a class="text-link" href="/terms">${t('termsTitle')}</a> · <a class="text-link" href="/refund">${t('refundTitle')}</a></p></div>`;
}
// ---- Paddle checkout ----------------------------------------------------------
// Card applications for plans with a Paddle price pay the plan's first month in Paddle's overlay checkout.
// custom_data carries the account ID; the server links the payment to this account only if the emails match.
const checkoutPrice = plan => state.checkout?.prices?.[plan] || null;
const canPayOnline = a => a.paymentMethod==='card' && !!checkoutPrice(a.plan) && a.status!=='declined' && !state.paid;
let paddleLoading;
function loadPaddle() {
  if (paddleLoading) return paddleLoading;
  paddleLoading = new Promise((resolve,reject)=>{
    const script = document.createElement('script');
    script.src = 'https://cdn.paddle.com/paddle/v2/paddle.js';
    script.onload = () => {
      try {
        if (state.checkout.environment==='sandbox') window.Paddle.Environment.set('sandbox');
        window.Paddle.Initialize({ token: state.checkout.clientToken, eventCallback: event => {
          // Paddle redirects to successUrl itself; this is only a fallback.
          if (event.name==='checkout.completed') setTimeout(()=>location.assign('/account?checkout=complete'),4000);
        }});
        resolve(window.Paddle);
      } catch { paddleLoading=null; reject({code:'checkoutUnavailable'}); }
    };
    script.onerror = () => { paddleLoading=null; script.remove(); reject({code:'checkoutUnavailable'}); };
    document.head.appendChild(script);
  });
  return paddleLoading;
}
async function openCheckout(a) {
  const priceId = checkoutPrice(a.plan);
  if (!priceId || !state.user) throw {code:'checkoutUnavailable'};
  const paddle = await loadPaddle();
  paddle.Checkout.open({
    items: [{ priceId, quantity: 1 }],
    customer: { email: state.user.email },
    customData: { salonieer_user_id: state.user.id, application_id: a.id },
    settings: { displayMode:'overlay', theme:'dark', ...(['en','ar'].includes(lang)?{locale:lang}:{}), successUrl: location.origin+'/account?checkout=complete' }
  });
}
const payButton = a => canPayOnline(a) ? `<button class="btn primary full" type="button" data-pay="${esc(a.id)}">${t('payByCard')}</button><p class="small-note" data-pay-feedback="${esc(a.id)}" role="status"></p>` : '';
function apply() {
  if (state.receipt) return receipt();
  return `<div class="wrap">${titleBlock('selectedPlan','applyTitle','applyLead')}<div class="steps" aria-label="${t('applications')}"><div class="step"><span aria-hidden="true">✓</span>${t('stepPlan')}</div><div class="line"></div><div class="step active" aria-current="step"><span>2</span>${t('stepDetails')}</div><div class="line"></div><div class="step"><span>3</span>${t('stepReview')}</div></div><div class="application-layout"><form id="application-form" class="application-form">${formErrorBox()}<section class="form-panel"><h2>${t('stepDetails')}</h2><div class="form-grid">${field('identityNumber','identityNumber',{minlength:5,maxlength:30,autocomplete:'off',hint:'idHint',extra:'data-ltr spellcheck="false"'})}${field('salonName','salonName',{minlength:2,maxlength:100,autocomplete:'organization'})}</div><div class="field"><label for="logo">${t('logo')}</label><div class="upload"><span id="upload-symbol" class="upload-symbol" aria-hidden="true"${state.logo?' hidden':''}>＋</span><img id="logo-preview" class="logo-preview" alt="${t('logo')}"${state.logo?` src="${state.logo}"`:' hidden'}><div class="upload-text"><strong id="upload-title">${t(state.logo?'replaceLogo':'uploadTitle')}</strong><small>${t('uploadHint')}</small><small id="logo-filename" class="upload-filename">${esc(state.logoName)}</small></div><input id="logo" name="logo" type="file" accept="image/png,image/jpeg,image/webp" aria-describedby="logo-error"></div><small id="logo-error" class="field-error"></small></div></section><section class="form-panel"><div class="panel-head"><h2>${t('selectedPlan')}</h2>${currencySwitch()}</div><div class="field"><label for="plan">${t('plans')}</label><select id="plan" name="plan" required>${state.catalog.plans.map(p=>`<option value="${p.id}">${p.name} · ${money(priceOf(p.prices))}${priceOf(p.prices)===null?'':' '+t('perMonth')}</option>`).join('')}</select></div><p class="included-note" id="included-loyalty" hidden><span aria-hidden="true">✓</span>${t('loyaltyIncluded')}</p><div class="addon-control" id="loyalty-control"><input type="checkbox" id="loyalty" name="loyalty"><label for="loyalty">${t('loyalty')}</label><span class="amount"><bdi>${money(priceOf(state.catalog.addons.loyalty))}</bdi> <small>${t('perMonth')}</small></span></div><div class="quantity-field" id="specialist-control"><label for="extraSpecialists">${t('extraSpecialists')}<br><small class="muted"><bdi>${money(priceOf(state.catalog.addons.specialist))}</bdi> ${t('perMonth')}</small></label><input id="extraSpecialists" name="extraSpecialists" type="number" min="0" max="50" step="1" value="0" inputmode="numeric"></div><p class="included-note" id="unlimited-note" hidden><span aria-hidden="true">✓</span>${t('unlimitedSpecialists')}</p></section><section class="form-panel"><fieldset><legend>${t('payment')}</legend><div class="radio-options"><label class="radio-option"><input type="radio" name="paymentMethod" value="card" required><span>${t('card')}</span></label><label class="radio-option"><input type="radio" name="paymentMethod" value="bank_transfer" required><span>${t('bank_transfer')}</span></label></div><p class="payment-note" id="payment-note">${t('noCharge')}</p></fieldset></section><p class="privacy-note">${t('privacyNote')} <a href="/privacy" target="_blank" rel="noopener" class="text-link">${t('privacyPolicy')}</a>.</p><p class="privacy-note">${t('agreeNote')} <a href="/terms" target="_blank" rel="noopener" class="text-link">${t('termsTitle')}</a> · <a href="/refund" target="_blank" rel="noopener" class="text-link">${t('refundTitle')}</a>.</p><button class="btn primary full form-submit" type="submit">${t('submit')}</button></form><aside class="order-summary" id="order-summary" aria-live="polite"></aside></div></div>`;
}
function selectedQuote() {
  const form = document.getElementById('application-form');
  const plan = state.catalog.plans.find(p=>p.id===form.elements.plan.value);
  const includes = ['business','enterprise'].includes(plan.id);
  const loyalty = !includes && form.elements.loyalty.checked;
  const count = plan.id === 'enterprise' ? 0 : Math.max(0,Math.min(50,Number(form.elements.extraSpecialists.value)||0));
  const base = priceOf(plan.prices), loyaltyPrice = priceOf(state.catalog.addons.loyalty), specialistPrice = priceOf(state.catalog.addons.specialist);
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
  const online = payment==='card' && !!checkoutPrice(q.plan.id);
  document.getElementById('payment-note').textContent = t(payment==='card'?(online?'cardNote':'cardLaterNote'):payment==='bank_transfer'?'bankNote':'noCharge');
  document.getElementById('order-summary').innerHTML = `<h2>${t('summary')}</h2><div class="summary-plan"><h3>${q.plan.name}</h3><a href="/plans" class="text-link">${t('backPlans')}</a></div><span class="tag">${t(state.catalog.region==='west_bank'?'westBankPricing':'standardPricing')}</span><div class="summary-row"><span>${q.plan.name}</span><span><bdi>${money(q.base)}</bdi></span></div>${q.loyalty?`<div class="summary-row"><span>${t('loyalty')}</span><span><bdi>${money(q.loyaltyPrice)}</bdi></span></div>`:''}${q.count?`<div class="summary-row"><span>${t('extraSpecialists')} × ${q.count}</span><span><bdi>${money(q.count*q.specialistPrice)}</bdi></span></div>`:''}<div class="summary-total"><span class="label">${q.total===null?t('requestQuote'):t('monthlyTotal')}</span>${priceHTML(q.total)}${q.total===null?'':`<p class="small-note">${t('perMonth')}</p>`}</div><p class="summary-contact">${t('contactDetails')}<br><strong class="ltr">${esc(state.user.email)}</strong><br><strong class="ltr">${esc(state.user.phone)}</strong></p><div class="section-divider"></div><p class="small-note">${online?t('checkoutPriceNote')+(q.loyalty||q.count?' '+t('addonsLaterNote'):''):t('noCharge')}</p>`;
}
function receipt() {
  const a = state.receipt;
  return `<div class="wrap"><section class="receipt" tabindex="-1"><div class="receipt-check" aria-hidden="true">✓</div><h1>${t('receivedTitle')}</h1><p>${t('receivedLead')}</p><div class="reference-box"><span class="label">${t('reference')}</span><strong dir="ltr">${esc(a.id)}</strong></div><div class="summary-row"><span>${t('salonName')}</span><span>${esc(a.salonName)}</span></div><div class="summary-row"><span>${t('selectedPlan')}</span><span>${esc(a.plan[0].toUpperCase()+a.plan.slice(1))}</span></div><div class="summary-row"><span>${t('monthlyTotal')}</span><span><bdi>${money(a.quote.total,a.quote.currency||'ILS')}</bdi></span></div><div class="summary-row"><span>${t('payment')}</span><span>${t(a.paymentMethod)}</span></div><div class="summary-row"><span>${t('status')}</span><span>${t(a.status)}</span></div><p class="small-note">${t(canPayOnline(a)?'payNowNote':'noCharge')}</p>${payButton(a)}<a class="btn ${canPayOnline(a)?'':'primary '}full" href="/applications">${t('viewApplications')}</a></section></div>`;
}
function applicationCard(a,admin=false) {
  return `<article class="application-card"><div class="application-card-top"><img src="${esc(a.logoUrl)}" alt="${t('logo')}: ${esc(a.salonName)}" class="logo-preview"><div><h2>${esc(a.salonName)}</h2><span class="ref"><bdi>${esc(a.id)}</bdi></span></div><span class="status ${esc(a.status)}">${t(a.status)}</span></div><dl class="application-meta"><div><dt>${t('selectedPlan')}</dt><dd>${esc(a.plan[0].toUpperCase()+a.plan.slice(1))}</dd></div><div><dt>${t('monthlyTotal')}</dt><dd class="price-value"><bdi>${money(a.quote.total,a.quote.currency||'ILS')}</bdi></dd></div><div><dt>${t('payment')}</dt><dd>${t(a.paymentMethod)}</dd></div><div><dt>${t('submittedOn')}</dt><dd>${date(a.createdAt)}</dd></div></dl>${a.quote.loyalty||a.quote.extraSpecialists?`<p class="small-note">${t('optionalAddons')}: ${[a.quote.loyalty?t('loyalty'):'',a.quote.extraSpecialists?`${t('extraSpecialists')} × ${a.quote.extraSpecialists}`:''].filter(Boolean).join(' · ')}</p>`:''}${admin?'':payButton(a)}${a.status==='needs_info'?`<p class="note"><a class="text-link" href="mailto:salonieer1st@gmail.com?subject=${encodeURIComponent(a.id)}">${t('contactUs')}</a></p>`:''}${admin?`<div class="admin-details"><dl><div><dt>${t('fullName')}</dt><dd>${esc(a.fullName)}</dd></div><div><dt>${t('email')}</dt><dd><a class="text-link ltr" href="mailto:${esc(a.email)}">${esc(a.email)}</a></dd></div><div><dt>${t('phone')}</dt><dd><a class="text-link ltr" href="tel:${esc(a.phone)}">${esc(a.phone)}</a></dd></div><div><dt>${t('location')}</dt><dd>${esc(locationName(a))}</dd></div><div><dt>${t('identityNumber')}</dt><dd><bdi>${esc(a.identityNumber)}</bdi></dd></div><div><dt>${t('yourPricing')}</dt><dd>${t(a.quote.region==='west_bank'?'westBankPricing':'standardPricing')}</dd></div></dl><form class="status-form" data-id="${esc(a.id)}"><label for="status-${a.id}">${t('status')}</label><select class="status-select" name="status" id="status-${a.id}">${statusNames.map(s=>`<option value="${s}"${a.status===s?' selected':''}>${t(s)}</option>`).join('')}</select><button class="btn small outline" type="submit">${t('saveStatus')}</button><span class="status-feedback" role="status"></span></form></div>`:''}</article>`;
}
function applications(admin=false) {
  const list = admin && state.filter!=='all' ? state.applications.filter(a=>a.status===state.filter) : state.applications;
  return `<div class="${admin?'wrap':'narrow'}">${titleBlock(admin?'inbox':'applications',admin?'inbox':'applicationsTitle',admin?'inboxLead':'applicationsLead')}${admin?`<div class="inbox-filter" aria-label="${t('status')}">${['all',...statusNames].map(s=>`<button type="button" class="filter-btn${state.filter===s?' active':''}" data-filter="${s}" aria-pressed="${state.filter===s}">${t(s)}</button>`).join('')}</div>`:''}${!list.length?`<div class="empty-state"><h2>${t(admin?'noResults':'emptyTitle')}</h2>${admin?'':`<p>${t('emptyText')}</p><a class="btn primary" href="/plans">${t('explorePlans')}</a>`}</div>`:`<div class="application-list">${list.map(a=>applicationCard(a,admin)).join('')}</div>`}</div>`;
}
const subscriptionTone = status => ({active:'approved',trialing:'approved',canceled:'declined'}[status] || '');
function account() {
  const b = state.billing, sub = b.subscriptions[0];
  const meta = (label,value) => value ? `<div><dt>${t(label)}</dt><dd>${value}</dd></div>` : '';
  const interval = !sub?.interval ? '' : sub.frequency===1 && ['month','year'].includes(sub.interval) ? t(sub.interval==='year'?'annual':'monthly') : `${t('every')} ${sub.frequency} ${t('interval_'+sub.interval)}`;
  const change = sub?.scheduledChange && sub.status!=='canceled' ? `<p class="notice info">${t('scheduled_'+sub.scheduledChange.action)}${sub.scheduledChange.at?` <bdi>${date(sub.scheduledChange.at)}</bdi>`:''}. ${t('accessUntilChange')}</p>` : '';
  const card = sub ? `<article class="application-card"><div class="application-card-top"><div><h2>${esc(sub.productName || t('subscription'))}</h2><span class="ref"><bdi>${esc(sub.id)}</bdi></span></div><span class="status ${subscriptionTone(sub.status)}">${t('sub_'+sub.status)}</span></div><dl class="application-meta">${meta('paidAccess',t(b.hasAccess?'accessActive':'accessInactive'))}${meta('billingPeriod',esc(interval))}${meta('nextBilling',sub.nextBilledAt?date(sub.nextBilledAt):'')}${meta('periodEnds',!sub.nextBilledAt&&sub.currentPeriodEndsAt?date(sub.currentPeriodEndsAt):'')}</dl>${change}</article>`
    : `<div class="empty-state"><h2>${t('noSubscription')}</h2><p>${t(b.hasCustomer?'noSubscriptionText':'noBillingText')}</p>${b.hasCustomer?'':`<a class="btn primary" href="/plans">${t('explorePlans')}</a>`}</div>`;
  const portal = b.hasCustomer ? `<section class="invite-panel"><button class="btn primary" type="button" id="manage-billing">${t('manageBilling')}</button><p class="small-note">${t('manageBillingHint')}</p><p id="billing-feedback" role="status"></p></section>` : '';
  const justPaid = new URLSearchParams(location.search).get('checkout')==='complete' && !b.hasAccess ? `<div class="notice info"><p>${t('paymentProcessing')}</p><button class="btn small" type="button" id="refresh-billing">${t('refresh')}</button></div>` : '';
  return `<div class="narrow">${titleBlock('account','accountTitle','accountLead')}<div class="application-list">${justPaid}${card}${portal}</div></div>`;
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
function showError(form,error) {
  const box = form.querySelector('#form-error');
  box.textContent = t(error.code || 'serverError'); box.hidden = false;
  const el = error.field ? form.elements[error.field] : null;
  if (el && typeof el.focus === 'function') {
    el.setAttribute('aria-invalid','true');
    const message = document.getElementById(error.field+'-error');
    if (message) message.textContent = t(error.code);
    el.focus();
  } else box.focus();
}
function clearErrors(form) {
  form.querySelectorAll('[aria-invalid]').forEach(el=>el.removeAttribute('aria-invalid'));
  form.querySelectorAll('.field-error').forEach(el=>el.textContent='');
  const box = form.querySelector('#form-error');
  if (box) { box.hidden = true; box.textContent = ''; }
}
async function submitForm(event,path) {
  event.preventDefault();
  const form = event.currentTarget;
  if (form.dataset.busy==='true') return;
  clearErrors(form);
  const data = Object.fromEntries(new FormData(form));
  if (['/api/register','/api/setup'].includes(path) && data.password!==data.passwordConfirm) return showError(form,{code:'passwordMismatch',field:'passwordConfirm'});
  if (path==='/api/applications') {
    if (state.logoLoading) return showError(form,{code:'processing',field:'logo'});
    if (!state.logo) return showError(form,{code:'invalidLogo',field:'logo'});
    const q = selectedQuote();
    Object.assign(data,{currency:state.currency,plan:q.plan.id,loyalty:q.loyalty,extraSpecialists:Number(form.elements.extraSpecialists.value)||0,logo:state.logo,submissionKey:state.submissionKey});
  }
  const submit = form.querySelector('button[type=submit]'), label = submit.textContent;
  submit.disabled = true; submit.textContent = t(path==='/api/applications'?'submitting':'processing');
  document.getElementById('language').disabled = true;
  form.dataset.busy = 'true';
  try {
    const result = await api(path,{method:'POST',body:JSON.stringify(data)});
    if (result.user) {
      state.user = result.user; state.csrf = result.csrf;
      delete drafts[route]; form.reset();
      location.assign(path==='/api/setup'?'/admin':nextPage());
    } else {
      state.receipt = result.application; state.logo=''; state.logoName='';
      delete drafts[route]; form.reset(); render();
      document.querySelector('.receipt').focus();
      window.scrollTo({top:0,behavior:'smooth'});
      if (canPayOnline(state.receipt)) document.querySelector(`[data-pay="${CSS.escape(state.receipt.id)}"]`)?.click();
    }
  } catch (error) { showError(form,error); }
  finally { submit.disabled=false; submit.textContent=label; form.dataset.busy='false'; document.getElementById('language').disabled=false; }
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
    const data = await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject({code:'invalidLogo',field:'logo'});reader.readAsDataURL(file);});
    await new Promise((resolve,reject)=>{const test=new Image();test.onload=()=>test.width&&test.height&&test.width<=4096&&test.height<=4096&&test.width*test.height<=16_000_000?resolve():reject({code:'invalidLogo',field:'logo'});test.onerror=()=>reject({code:'invalidLogo',field:'logo'});test.src=data;});
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
function bind() {
  document.getElementById('language').addEventListener('change',event=>{captureDraft();setLanguage(event.target.value);render();});
  const menu = document.getElementById('menu-toggle'), nav = document.getElementById('nav-panel');
  menu.addEventListener('click',()=>{const open=nav.classList.toggle('open');menu.setAttribute('aria-expanded',String(open));});
  nav.addEventListener('keydown',event=>{if(event.key==='Escape'){nav.classList.remove('open');menu.setAttribute('aria-expanded','false');menu.focus();}});
  document.getElementById('logout')?.addEventListener('click',async event=>{
    event.currentTarget.disabled=true;
    try {
      await api('/api/logout',{method:'POST',body:'{}'});
      try { new BroadcastChannel('salonieer-auth').postMessage('logout'); } catch {}
      state.user=null; app.innerHTML=''; location.replace('/');
    } catch (error) { event.target.disabled=false;event.target.textContent=t('retry');event.target.setAttribute('aria-label',t(error.code)); }
  });
  document.querySelectorAll('[data-password]').forEach(button=>button.addEventListener('click',()=>{
    const input=document.getElementById(button.dataset.password);const visible=input.type==='password';input.type=visible?'text':'password';
    input.setAttribute('data-ltr','');button.textContent=t(visible?'hide':'show');button.setAttribute('aria-label',`${t(visible?'hide':'show')} ${t(button.dataset.password)}`);
  }));
  document.querySelectorAll('form').forEach(form=>form.addEventListener('input',event=>{
    if (event.target.name) { event.target.removeAttribute('aria-invalid'); const error=document.getElementById(event.target.name+'-error');if(error) error.textContent=''; }
  }));
  document.getElementById('login-form')?.addEventListener('submit',event=>submitForm(event,'/api/login'));
  const registerForm = document.getElementById('register-form') || document.getElementById('setup-form');
  if (registerForm) {
    const syncRegion=()=>{const enabled=registerForm.elements.country.value==='PS';document.getElementById('region-field').hidden=!enabled;registerForm.elements.region.disabled=!enabled;registerForm.elements.region.required=enabled;if(!enabled)registerForm.elements.region.value='';};
    registerForm.elements.country.addEventListener('change',syncRegion);syncRegion();
    registerForm.addEventListener('submit',event=>submitForm(event,registerForm.id==='setup-form'?'/api/setup':'/api/register'));
  }
  const applicationForm = document.getElementById('application-form');
  if (applicationForm) {
    if (!drafts[route]) applicationForm.elements.plan.value = new URLSearchParams(location.search).get('plan') || 'basic';
    for (const name of ['plan','loyalty','extraSpecialists','paymentMethod']) {
      applicationForm.querySelectorAll(`[name="${name}"]`).forEach(el=>el.addEventListener('input',syncApplication));
    }
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
  document.getElementById('refresh-billing')?.addEventListener('click',()=>location.reload());
  document.getElementById('copy-email')?.addEventListener('click',async()=>{
    try { await navigator.clipboard.writeText('salonieer1st@gmail.com');document.getElementById('copy-feedback').textContent=t('copied'); }
    catch { document.getElementById('copy-feedback').textContent=t('copyFailed'); }
  });
  document.querySelectorAll('[data-currency]').forEach(button=>button.addEventListener('click',()=>{
    if (button.dataset.currency===state.currency) return;
    captureDraft();setCurrency(button.dataset.currency);render();
    document.querySelector(`[data-currency="${state.currency}"]`)?.focus();
  }));
  document.querySelectorAll('[data-filter]').forEach(button=>button.addEventListener('click',()=>{state.filter=button.dataset.filter;render();}));
  document.querySelectorAll('.status-form').forEach(form=>form.addEventListener('submit',async event=>{
    event.preventDefault();const button=form.querySelector('button');button.disabled=true;const feedback=form.querySelector('.status-feedback');
    try {
      await api('/api/admin/applications/'+encodeURIComponent(form.dataset.id),{method:'PATCH',body:JSON.stringify({status:form.elements.status.value})});
      state.applications.find(a=>a.id===form.dataset.id).status=form.elements.status.value;
      render();
      const updated=document.querySelector(`[data-id="${form.dataset.id}"] .status-feedback`);if(updated)updated.textContent=t('statusSaved');
    } catch(error) { feedback.textContent=t(error.code);button.disabled=false; }
  }));
}
function render() {
  setLanguage(lang);
  const pages = {'/':home,'/login':login,'/register':register,'/plans':plans,'/apply':apply,'/applications':()=>applications(false),'/admin':()=>applications(true),'/account':account,'/support':support,'/privacy':privacy,'/terms':termsPage,'/refund':refundPage,'/setup':setup};
  const titles = {'/':'tagline','/login':'login','/register':'register','/plans':'plans','/apply':'applyTitle','/applications':'applications','/admin':'inbox','/account':'account','/support':'support','/privacy':'privacyPolicy','/terms':'termsTitle','/refund':'refundTitle','/setup':'setupTitle'};
  document.title = 'Salonieer · ' + t(titles[route] || 'home');
  app.innerHTML = header()+`<main id="main" tabindex="-1">${(pages[route] || home)()}</main>`+footer();
  restoreDraft();bind();
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
async function initialize() {
  setLanguage(lang);
  try {
    const session = await api('/api/session');Object.assign(state,session);
    if (privateRoutes.includes(route) && !state.user) return location.replace('/login?next='+encodeURIComponent(location.pathname+location.search));
    if (route==='/admin'&&!state.user?.isAdmin) return location.replace('/applications');
    if (['/login','/register'].includes(route)&&state.user) return location.replace('/plans');
    if (['/plans','/apply'].includes(route)) {
      let tz = '';
      try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch {}
      state.catalog = await api('/api/plans?tz='+encodeURIComponent(tz));
      if (state.catalog.source==='default') {
        // The server couldn't locate this visitor (some hosts block outgoing lookups), so ask from the browser.
        const cc = await browserCountry();
        if (cc) { try { state.catalog = await api('/api/plans?tz='+encodeURIComponent(tz)+'&cc='+cc); } catch {} }
      }
    }
    if (route==='/setup') state.setupAvailable=(await api('/api/setup')).available;
    if (route==='/apply') {
      const plan=new URLSearchParams(location.search).get('plan') || 'basic';
      if (!state.catalog.plans.some(p=>p.id===plan)) return location.replace('/plans');
    }
    if (route==='/account') state.billing=await api('/api/billing');
    if (['/apply','/applications'].includes(route) && state.user) { try { state.paid=(await api('/api/billing')).hasAccess; } catch {} }
    if (['/applications','/admin'].includes(route)) state.applications=(await api(route==='/admin'?'/api/admin/applications':'/api/applications')).applications;
    render();
    if (location.hash && route==='/support') document.getElementById(location.hash.slice(1))?.scrollIntoView();
  } catch(error) {
    app.innerHTML=header()+`<main id="main" class="wrap empty-state"><h1>Salonieer</h1><p role="alert">${t(error.code || 'serverError')}</p><button class="btn primary" id="retry">${t('retry')}</button></main>`+footer();
    document.getElementById('retry').addEventListener('click',()=>location.reload());
    document.getElementById('language').addEventListener('change',event=>{setLanguage(event.target.value);initialize();});
  }
}
window.addEventListener('pageshow',event=>{if(event.persisted)location.reload();});
window.addEventListener('pagehide',event=>{if(event.persisted&&privateRoutes.includes(route))app.textContent='';});
try { const channel=new BroadcastChannel('salonieer-auth');channel.onmessage=event=>{if(event.data==='logout'){state.user=null;if(privateRoutes.includes(route)){app.innerHTML='';location.replace('/login');}else location.reload();}}; } catch {}
initialize();
