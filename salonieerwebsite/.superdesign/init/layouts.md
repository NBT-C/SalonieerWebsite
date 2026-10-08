# Salonieer website (salonieer.com)
Vanilla JS single-page app: `index.php` (PHP 8.2) serves `page.html`; `assets/app.js` (ES module) renders every page as HTML strings; one stylesheet `assets/app.css` (vanilla CSS, custom properties, no Tailwind, no framework). Languages EN / AR (RTL) / HE (RTL) from `assets/i18n.js`.

## Header / top bar — `assets/app.js` header()
Logo mark image + 'Salonieer' wordmark, nav links (Home, Plans, [Applications, Account when signed in], Support, [Admin panel]), Log in / Create account buttons, language select (EN/العربية/עברית), menu toggle on phones.
```js
function header() {
  const link = (path,key) => `<a href="${path}"${route===path?' aria-current="page"':''}>${t(key)}</a>`;
  return `<a class="skip" href="#main">${t('skip')}</a><header class="topbar"><div class="wrap nav">
    <a href="/" class="brand" aria-label="Salonieer"><img class="brand-mark" src="/assets/img/logo-mark-96.webp" alt="" width="40" height="40"><span class="wordmark">Salonieer</span></a>
    <nav id="nav-panel" class="nav-panel" aria-label="${t('menu')}"><div class="nav-links">${link('/','home')}${link('/plans','plans')}${state.user?link('/applications','applications')+link('/account','account'):''}${link('/support','support')}${state.user?.isAdmin?link('/admin','adminPanel'):''}</div><div class="nav-actions">${state.user?`<button class="btn small" id="logout">${t('logout')}</button>`:`<a class="btn small" href="/login">${t('login')}</a><a class="btn primary small" href="/register">${t('register')}</a>`}</div></nav>
    <select id="language" class="language-select" aria-label="${t('language')}"><option value="en" ${lang==='en'?'selected':''}>EN</option><option value="ar" ${lang==='ar'?'selected':''}>العربية</option><option value="he" ${lang==='he'?'selected':''}>עברית</option></select>
    <button class="menu-toggle" id="menu-toggle" aria-controls="nav-panel" aria-expanded="false" aria-label="${t('menu')}"><span class="bars" aria-hidden="true"></span><span class="label-text">${t('menu')}</span></button>
  </div></header>`;
}
```
## Footer — `assets/app.js` footer()
Dark footer: brand + tagline, Product links, Legal links, Contact (support + email), copyright row.
```js
function footer() {
  return `<footer class="site-footer"><div class="wrap"><div class="footer-inner"><div class="footer-brand"><span class="brand-row"><img class="brand-mark" src="/assets/img/logo-mark-96.webp" alt="" width="40" height="40" loading="lazy"><span class="wordmark">Salonieer</span></span><p>${t('footerTagline')}</p></div><nav class="footer-col" aria-label="${t('footerProduct')}"><h3>${t('footerProduct')}</h3><div class="footer-links"><a href="/">${t('home')}</a><a href="/plans">${t('plans')}</a>${state.user?`<a href="/account">${t('account')}</a>`:`<a href="/register">${t('register')}</a>`}</div></nav><nav class="footer-col" aria-label="${t('legal')}"><h3>${t('legal')}</h3><div class="footer-links"><a href="/terms">${t('termsTitle')}</a><a href="/privacy">${t('privacyPolicy')}</a><a href="/refund">${t('refundTitle')}</a></div></nav><div class="footer-col"><h3>${t('footerContact')}</h3><div class="footer-links"><a href="/support">${t('support')}</a><a href="mailto:salonieer1st@gmail.com" dir="ltr">salonieer1st@gmail.com</a></div></div></div><div class="footer-bottom"><span>© ${new Date().getFullYear()} Salonieer. ${t('footerRights')}</span><span class="footer-mark">${t('footerMade')}</span></div></div></footer>`;
}
```
## Page heading helper
```js
function titleBlock(eyebrow,title,lead,center=false,extra='') {
  return `<div class="page-heading${center?' center':''}"><div class="eyebrow">${t(eyebrow)}</div><h1>${t(title)}</h1>${lead?`<p>${t(lead)}</p>`:''}${extra}</div>`;
}
```
## Header/footer CSS
```css
.skip{position:fixed;inset-block-start:10px;inset-inline-start:10px;z-index:99;transform:translateY(-160%);background:var(--button-primary-bg);color:var(--button-primary-text);padding:10px 18px;border-radius:var(--radius-sm)}
.skip:focus{transform:none}
.topbar{position:sticky;top:0;z-index:40;padding-block:12px;background:color-mix(in srgb,var(--color-background) 82%,transparent);backdrop-filter:saturate(1.2) blur(14px);-webkit-backdrop-filter:saturate(1.2) blur(14px);border-bottom:1px solid transparent;transition:border-color var(--dur) var(--ease),background-color var(--dur) var(--ease)}
.topbar.is-scrolled{border-bottom-color:var(--color-border);padding-block:8px}
.topbar.is-scrolled .nav{box-shadow:var(--shadow-card)}
.nav{min-height:calc(var(--nav-h) - 24px);display:flex;align-items:center;gap:22px;padding:8px 10px 8px 12px;border-radius:var(--radius-full);background:var(--color-surface);box-shadow:var(--shadow-control);border:1px solid var(--color-border)}
.brand{display:flex;align-items:center;gap:11px;direction:ltr;flex-shrink:0;border-radius:var(--radius-full);padding-inline-end:6px}
.brand-mark{width:40px;height:40px;border-radius:12px;box-shadow:0 6px 14px var(--3d-shadow);flex-shrink:0;object-fit:cover}
.brand-s{display:none}
.wordmark{font-family:"Cormorant Garamond",Georgia,serif;font-size:27px;font-weight:600;letter-spacing:-.01em;color:var(--color-text-primary);line-height:1}
.nav-panel{display:flex;align-items:center;flex:1;gap:20px}
.nav-links{display:flex;align-items:center;gap:4px;flex:1;justify-content:center}
.nav-links a{position:relative;font-size:.92rem;font-weight:500;color:var(--color-text-secondary);white-space:nowrap;padding:9px 15px;border-radius:var(--radius-full)}
.nav-links a:hover{color:var(--color-text-primary);background:var(--color-surface-sunken)}
.nav-links a[aria-current=page]{color:var(--color-text-primary);background:var(--color-surface-sunken);box-shadow:var(--shadow-inset)}
.nav-links a[aria-current=page]:after{content:"";position:absolute;inset-inline:50%;bottom:4px;width:5px;height:5px;margin-inline-start:-2.5px;border-radius:50%;background:var(--nav-active)}
.nav-actions{display:flex;align-items:center;gap:8px;white-space:nowrap}
.nav-actions .btn{min-height:42px;padding:9px 18px;font-size:.9rem}
.language-select{appearance:none;-webkit-appearance:none;border:1px solid var(--color-border);background-color:var(--color-surface-sunken);background-image:linear-gradient(45deg,transparent 50%,var(--color-text-muted) 50%),linear-gradient(135deg,var(--color-text-muted) 50%,transparent 50%);background-repeat:no-repeat;background-size:5px 5px,5px 5px;background-position:right 17px center,right 12px center;color:var(--color-text-secondary);padding:8px 30px 8px 14px;border-radius:var(--radius-full);font-size:.85rem;font-weight:500;cursor:pointer;min-height:40px;max-width:120px}
.language-select:hover{color:var(--color-text-primary)}
.language-select option{background:var(--color-surface);color:var(--color-text-primary)}
.menu-toggle{display:none;align-items:center;gap:8px;background:var(--button-secondary-bg);border:1px solid var(--color-border);border-radius:var(--radius-full);color:var(--button-secondary-text);padding:8px 14px;font-size:.88rem;font-weight:500;min-height:40px;box-shadow:var(--shadow-control)}
.menu-toggle .bars{width:16px;height:10px;position:relative;display:inline-block}
.menu-toggle .bars:before,.menu-toggle .bars:after{content:"";position:absolute;inset-inline:0;height:1.6px;border-radius:2px;background:currentColor;transition:transform var(--dur) var(--ease),top var(--dur) var(--ease)}
.menu-toggle .bars:before{top:1px}.menu-toggle .bars:after{top:7px}
.menu-toggle[aria-expanded=true] .bars:before{top:4px;transform:rotate(45deg)}
.menu-toggle[aria-expanded=true] .bars:after{top:4px;transform:rotate(-45deg)}
.site-footer{position:relative;overflow:hidden;margin-top:40px;border-top:1px solid var(--color-border);padding:72px 0 34px;color:var(--color-footer-muted);background:var(--color-footer-bg);border-radius:40px 40px 0 0}
.site-footer:before{content:"";position:absolute;width:520px;height:520px;inset-inline-end:-200px;top:-260px;border-radius:50%;background:radial-gradient(circle at 40% 40%,color-mix(in srgb,var(--color-footer-text) 7%,transparent),transparent 70%);pointer-events:none}
.footer-inner{position:relative;display:grid;grid-template-columns:1.4fr 1fr 1fr 1.2fr;gap:40px}
.footer-brand{display:flex;flex-direction:column;gap:16px;align-items:flex-start}
.footer-brand .brand-row{display:flex;align-items:center;gap:12px;direction:ltr}
.footer-brand .wordmark{font-size:30px;color:var(--color-footer-text)}
.footer-brand p{color:var(--color-footer-muted);font-size:.9rem;max-width:280px;line-height:1.75}
.footer-col h3{font-size:.72rem;letter-spacing:.18em;text-transform:uppercase;color:var(--color-footer-accent);margin-bottom:16px;font-weight:700}
.footer-links{display:flex;flex-direction:column;gap:11px;font-size:.9rem}
.footer-links a{color:var(--color-footer-muted);width:max-content;max-width:100%}
.footer-links a:hover{color:var(--color-footer-text)}
.footer-bottom{position:relative;display:flex;justify-content:space-between;gap:20px;flex-wrap:wrap;margin-top:56px;padding-top:24px;border-top:1px solid color-mix(in srgb,var(--color-footer-text) 12%,transparent);font-size:.8rem}
.footer-bottom .footer-mark{display:inline-flex;align-items:center;gap:8px}
.footer-bottom .footer-mark:before{content:"";width:6px;height:6px;border-radius:50%;background:var(--color-footer-accent)}
.topbar{view-transition-name:topbar}
```
