# Salonieer website (salonieer.com)
Vanilla JS single-page app: `index.php` (PHP 8.2) serves `page.html`; `assets/app.js` (ES module) renders every page as HTML strings; one stylesheet `assets/app.css` (vanilla CSS, custom properties, no Tailwind, no framework). Languages EN / AR (RTL) / HE (RTL) from `assets/i18n.js`.

## / (Home)
Entry: `assets/app.js` home() (lines 130-136) + heroStage() (113-126) + showcase() (127-129)
Dependencies:
- assets/app.js header(), footer()
- assets/theme-manager.js icon3d() (3D clay icons for pillars)
- assets/i18n.js (copy), assets/app.css
- images: assets/img/gallery-*.webp (product screenshots), logo-mark-512.webp
```js
const shot = (name,alt,extra='') => `<img src="/assets/img/${name}.webp" srcset="/assets/img/${name}-sm.webp 720w, /assets/img/${name}.webp 1280w" sizes="(max-width: 960px) 92vw, 640px" alt="${alt}" width="1280" height="853" decoding="async" ${extra}>`;
// One 3D composition: the product in a device frame with a few clay objects at different depths.
function heroStage() {
  const now = new Date();
  let month = ''; try { month = new Intl.DateTimeFormat(lang,{month:'long'}).format(now); } catch {}
  const cells = Array.from({length:21},(_,i)=>`<i class="${[3,9,16].includes(i)?'on':[4,10,11,17].includes(i)?'soft':''}"></i>`).join('');
  return `<div class="hero-stage" data-scene data-tilt="5" aria-hidden="true"><div class="stage">
    <div class="stage-glow"></div><span class="layer ring ring-1"></span>
    <figure class="layer device" style="margin:0"><div class="device-bar"><span></span><span></span><span></span><i></i></div><div class="device-screen">${shot('gallery-dashboard','','fetchpriority="high"')}</div></figure>
    <div class="layer float-card fc-calendar floaty" style="--delay:-2s;--float-dur:8s"><div class="fc-cal-head"><span>${esc(month)}</span><b>${now.getDate()}</b></div><div class="fc-cal-grid">${cells}</div></div>
    <div class="layer float-card fc-booking floaty" style="--delay:-4s"><span class="fc-check">${checkSvg}</span><span><strong>${t('h_booked')}</strong><small>${t('h_bookedDetail')}</small></span></div>
    <div class="layer float-card fc-stats floaty" style="--delay:-1s;--float-dur:9s"><span class="fc-label">${t('h_week')}</span><strong>${t('h_appointments')}<span class="fc-trend">↑</span></strong><div class="fc-bars">${[38,62,46,74,58,90,70].map(h=>`<i style="--h:${h}%"></i>`).join('')}</div></div>
    <div class="layer logo-3d fc-logo floaty" style="--delay:-3s;--float-dur:10s"><img src="/assets/img/logo-mark-512.webp" alt="" width="512" height="512"></div>
    <span class="layer orb accent orb-2 floaty" style="--float-dur:6s"></span><span class="layer orb orb-1 floaty" style="--delay:-5s;--float-dur:11s"></span>
  </div></div>`;
}
function showcase(n,img,flip=false) {
  return `<div class="showcase${flip?' flip':''}"><div class="showcase-copy" data-reveal><span class="eyebrow">${t(n+'Eyebrow')}</span><h2>${t(n+'Title')}</h2><p>${t(n+'Text')}</p><ul class="check-list">${[1,2,3].map(i=>`<li><span class="ck">${checkSvg}</span><span>${t(n+'p'+i)}</span></li>`).join('')}</ul></div><div class="mockup" data-scroll-depth data-tilt="3" data-reveal style="--rd:120ms"><div class="mockup-shadow"></div><div class="mockup-frame">${shot(img,t(n+'Alt'),'loading="lazy"')}</div><div class="mockup-chip"><span class="dot" aria-hidden="true"></span>${t(n+'Chip')}</div></div></div>`;
}
function home() {
  return `<div class="home"><div class="bg-forms" aria-hidden="true"><span class="blob b1"></span><span class="blob b2"></span></div>
  <section class="wrap home-hero" data-scene><div class="home-copy"><div class="eyebrow">${t('eyebrow')}</div><h1>${t('heroFirst')} <em>${t('heroSecond')}</em></h1><p class="lead">${t('heroLead')}</p><div class="hero-actions"><a class="btn primary" href="${state.user?'/plans':'/register'}">${t(state.user?'explorePlans':'register')} <span class="arrow" aria-hidden="true">→</span></a><a class="btn" href="${state.user?'/applications':'/plans'}">${t(state.user?'applications':'explorePlans')}</a></div><ul class="hero-points">${[1,2,3].map(i=>`<li>${t('h_point'+i)}</li>`).join('')}</ul></div>${heroStage()}</section>
  <section class="wrap home-section" aria-labelledby="overview-title"><div class="section-head center" data-reveal><span class="eyebrow">${t('h_overviewEyebrow')}</span><h2 id="overview-title">${t('overview')}</h2><p>${t('h_overviewLead')}</p></div><div class="pillars">${[['01','bookings','cal'],['02','team','person'],['03','growth','bars']].map(([n,k,ic],i)=>`<article class="pillar" data-tilt="3" data-reveal style="--rd:${i*90}ms">${icon3d(ic)}<span class="pillar-index" aria-hidden="true">${n}</span><h3>${t(k)}</h3><p>${t(k+'Text')}</p></article>`).join('')}</div></section>
  <section class="wrap home-section" style="padding-top:0">${showcase('s1','gallery-calendar')}${showcase('s2','gallery-customer-booking',true)}</section>
  <section class="wrap home-section" style="padding-top:0"><div class="cta-band" data-reveal data-tilt="3"><span class="logo-3d" aria-hidden="true"><img src="/assets/img/logo-mark-512.webp" alt="" width="512" height="512" loading="lazy"></span><div><h2>${t('ctaTitle')}</h2><p>${t('ctaText')}</p></div><div class="hero-actions"><a class="btn primary" href="${state.user?'/plans':'/register'}">${t(state.user?'explorePlans':'register')} <span class="arrow" aria-hidden="true">→</span></a>${state.user?'':`<a class="btn" href="/plans">${t('explorePlans')}</a>`}</div></div></section></div>`;
}
```
## /plans
Entry: `assets/app.js` plans() (165-175) + currencySwitch() (40-50) + priceHTML()
```js
function currencySwitch(id='currency') {
  return `<div class="currency-switch" role="radiogroup" aria-label="${t('currency')}">${CURRENCIES.map(c=>`<button type="button" role="radio" class="currency-option${state.currency===c?' active':''}" data-currency="${c}" aria-checked="${state.currency===c}" title="${t('currency'+c)}"><span aria-hidden="true">${SYMBOLS[c]}</span> ${c}</button>`).join('')}</div>`;
}
const date = value => new Intl.DateTimeFormat(lang, { dateStyle:'medium' }).format(new Date(value));
const statusNames = ['pending','in_review','needs_info','approved','declined'];
const CATEGORIES = ['male','female','beauty'];
// Common salon time zones; the account country's zone is preselected (the server accepts any valid zone).
const TIMEZONES = ['Asia/Hebron','Asia/Gaza','Asia/Jerusalem','Asia/Amman','Asia/Riyadh','Asia/Dubai','Asia/Qatar','Asia/Kuwait','Asia/Bahrain','Asia/Muscat','Asia/Baghdad','Asia/Beirut','Asia/Damascus','Africa/Cairo','Africa/Casablanca','Africa/Tunis','Africa/Algiers','Europe/Istanbul','Europe/London','Europe/Berlin','Europe/Paris','America/New_York','America/Chicago','America/Los_Angeles','UTC'];
const TZ_BY_COUNTRY = {PS:'Asia/Hebron',IL:'Asia/Jerusalem',JO:'Asia/Amman',SA:'Asia/Riyadh',AE:'Asia/Dubai',QA:'Asia/Qatar',KW:'Asia/Kuwait',BH:'Asia/Bahrain',OM:'Asia/Muscat',IQ:'Asia/Baghdad',LB:'Asia/Beirut',SY:'Asia/Damascus',EG:'Africa/Cairo',MA:'Africa/Casablanca',TN:'Africa/Tunis',DZ:'Africa/Algiers',TR:'Europe/Istanbul',GB:'Europe/London',DE:'Europe/Berlin',FR:'Europe/Paris',US:'America/New_York'};
const paidStatus = a => ['paid','test_paid'].includes(a.paymentStatus);

function plans() {
  const c = state.catalog;
  return `<div class="wrap">${titleBlock('plansEyebrow','plansTitle','plansLead',true,`<div class="pricing-controls">${currencySwitch()}</div>`)}<section class="pricing-grid" aria-label="${t('plans')}">${c.plans.map((p,i)=>`<article class="plan-card${p.id==='pro'?' featured':''}">${p.id==='pro'?`<div class="popular">${t('popular')}</div>`:''}<div class="plan-icon" aria-hidden="true">${['I','II','III','IV'][i]}</div><h2>${esc(p.name)}</h2><p class="description">${t(p.id+'Desc')}</p><div class="plan-price">${priceHTML(priceOf(p.prices))}<div class="period">${priceOf(p.prices)===null?t('requestQuote'):t('monthly')}</div></div><ul class="plan-features">${p.features.map(f=>`<li><span class="check" aria-hidden="true">✓</span><span>${t(f)}</span></li>`).join('')}</ul><a class="btn ${p.id==='pro'?'primary':'outline'} full" href="/apply?plan=${p.id}" aria-label="${t(p.id==='enterprise'?'contactUs':'startNow')} · ${esc(p.name)}">${t(p.id==='enterprise'?'contactUs':'startNow')}</a></article>`).join('')}</section><section class="addons-section"><div class="addons-title"><h2>${t('optionalAddons')}</h2></div><div class="addons-grid">${[['loyalty','loyaltyText',priceOf(c.addons.loyalty),'◎'],['specialist','specialistText',priceOf(c.addons.specialist),'+1']].map(([name,description,price,symbol])=>`<article class="addon-card"><span class="addon-symbol" aria-hidden="true">${symbol}</span><div><h3>${t(name)}</h3><p>${t(description)}</p></div><div class="addon-price"><bdi>${money(price)}</bdi><small>${t('perMonth')}</small></div></article>`).join('')}</div></section><p class="payment-footnote">${t('pricesNote')} <a class="text-link" href="/terms">${t('termsTitle')}</a> · <a class="text-link" href="/refund">${t('refundTitle')}</a></p></div>`;
}
// ---- Paddle checkout ----------------------------------------------------------
// Card applications for plans with a Paddle price pay the plan's first month in Paddle's overlay checkout.
// custom_data carries the account ID; the server links the payment to this account only if the emails match.
const checkoutPrice = plan => state.checkout?.prices?.[plan] || null;
const addonPrice = addon => state.checkout?.addons?.[addon] || null;
// The plan plus the add-ons chosen on the application (the server already dropped loyalty for Business/Enterprise
// and extra specialists for Enterprise). An add-on without a Paddle price is left out and billed after review.
```
