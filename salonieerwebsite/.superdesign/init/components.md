# Salonieer website (salonieer.com)
Vanilla JS single-page app: `index.php` (PHP 8.2) serves `page.html`; `assets/app.js` (ES module) renders every page as HTML strings; one stylesheet `assets/app.css` (vanilla CSS, custom properties, no Tailwind, no framework). Languages EN / AR (RTL) / HE (RTL) from `assets/i18n.js`.

Shared primitives are string helpers in `assets/app.js` styled by `assets/app.css`.
## Button (`.btn`, `.btn.primary`, `.btn.small`, `.btn.full`, `.btn.outline`)
```css
.btn{position:relative;display:inline-flex;white-space:nowrap;align-items:center;justify-content:center;gap:9px;min-height:50px;padding:12px 24px;border:1px solid var(--color-border);border-radius:var(--radius-full);font-size:.95rem;font-weight:600;line-height:1.4;background:var(--button-secondary-bg);color:var(--button-secondary-text);text-align:center;cursor:pointer;box-shadow:var(--shadow-control);isolation:isolate}
.btn:hover{transform:translateY(-1.5px);box-shadow:var(--shadow-card);border-color:var(--color-border-strong)}
.btn:active{transform:translateY(1px);box-shadow:var(--shadow-pressed)}
.btn.primary{background:var(--button-primary-bg);color:var(--button-primary-text);border-color:transparent;box-shadow:0 1px 0 rgba(255,255,255,.18) inset,0 -2px 0 rgba(0,0,0,.18) inset,0 10px 24px -8px var(--3d-shadow),0 2px 4px var(--shadow-dark)}
.btn.primary:after{content:"";position:absolute;inset-inline:22%;bottom:-1px;height:1px;border-radius:2px;background:linear-gradient(90deg,transparent,var(--color-accent),transparent);opacity:.9;z-index:-1}
.btn.primary:hover{background:var(--button-primary-hover);box-shadow:0 1px 0 rgba(255,255,255,.2) inset,0 -2px 0 rgba(0,0,0,.2) inset,0 16px 30px -10px var(--3d-shadow),0 3px 6px var(--shadow-dark)}
.btn.primary:active{box-shadow:inset 0 3px 8px rgba(0,0,0,.28)}
.btn.outline{background:transparent;color:var(--color-text-primary);border-color:var(--color-border-strong);box-shadow:none}
.btn.outline:hover{background:var(--color-surface);box-shadow:var(--shadow-control)}
.btn.accent{background:var(--color-accent);color:var(--color-on-accent);border-color:transparent}
.btn.accent:hover{background:var(--color-accent-hover)}
.btn.ghost{background:transparent;box-shadow:none;border-color:transparent;color:var(--color-text-secondary)}
.btn.ghost:hover{background:var(--color-surface-sunken);color:var(--color-text-primary);transform:none}
.btn.danger{color:var(--color-error-text)}
.btn.small{min-height:40px;padding:8px 16px;font-size:.87rem}
.btn.full{width:100%;white-space:normal}
.btn .arrow{display:inline-block;transition:transform var(--dur) var(--ease)}
.btn:hover .arrow{transform:translateX(3px)}
.btn.is-loading{cursor:progress;opacity:1}
.btn.is-loading:disabled{opacity:.92}
.btn.danger-solid{background:var(--color-error);color:var(--color-background);border-color:transparent}
.btn.danger-solid:hover{background:color-mix(in srgb,var(--color-error) 88%,#000)}
.btn:not(:disabled):active{transition-duration:80ms}
.btn[disabled]{opacity:.55;cursor:not-allowed;transform:none}
```
## Form field — `field()`
```js
function field(name,label,{type='text',hint='',required=true,autocomplete='',minlength='',maxlength='',placeholder='',extra='',full=false}={}) {
  const password = type === 'password';
  return `<div class="field${full?' full-span':''}"><label for="${name}">${t(label)}</label>${password?'<div class="password-wrap">':''}<input id="${name}" name="${name}" type="${type}" ${required?'required':''} ${autocomplete?`autocomplete="${autocomplete}"`:''} ${minlength?`minlength="${minlength}"`:''} ${maxlength?`maxlength="${maxlength}"`:''} ${placeholder?`placeholder="${esc(placeholder)}"`:''} aria-describedby="${name}-hint ${name}-error" ${extra}>${password?`<button class="password-toggle" type="button" data-password="${name}" aria-controls="${name}" aria-label="${t('show')} ${t(label)}">${t('show')}</button></div>`:''}<small id="${name}-hint">${hint?t(hint):''}</small><small id="${name}-error" class="field-error"></small></div>`;
}
function formErrorBox() { return '<div id="form-error" class="notice" role="alert" tabindex="-1" hidden></div>'; }
```
```css
.form-section+.form-section{margin-top:28px;border-top:1px solid var(--color-border);padding-top:26px}
.form-section h2{font-size:.78rem;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--color-accent-text);margin-bottom:18px}
.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:18px}
.field{margin-bottom:20px;min-width:0}
.form-grid .field{margin:0}
.field label{display:block;font-size:.88rem;color:var(--color-text-primary);font-weight:600;margin-bottom:8px}
.field input,.field select,.field textarea,.status-select{width:100%;min-height:50px;border:1px solid var(--color-border);border-radius:var(--radius-sm);padding:11px 15px;background:var(--input-bg);color:var(--color-text-primary);box-shadow:var(--shadow-inset);outline:none}
.field select,.status-select{appearance:none;-webkit-appearance:none;background-image:linear-gradient(45deg,transparent 50%,var(--color-text-muted) 50%),linear-gradient(135deg,var(--color-text-muted) 50%,transparent 50%);background-repeat:no-repeat;background-size:6px 6px,6px 6px;background-position:right 21px center,right 15px center;padding-inline-end:42px}
.field select option,.status-select option{background:var(--color-surface);color:var(--color-text-primary)}
.field input::placeholder{color:var(--color-text-muted);opacity:.85}
.field input:hover,.field select:hover,.status-select:hover{border-color:var(--color-border-strong)}
.field input:focus,.field select:focus,.field textarea:focus,.status-select:focus{border-color:var(--input-focus);box-shadow:var(--shadow-inset),0 0 0 4px color-mix(in srgb,var(--input-focus) 18%,transparent);background-color:var(--color-surface)}
.field input:disabled,.field select:disabled{opacity:.55;cursor:not-allowed}
.field input[aria-invalid=true],.field select[aria-invalid=true]{border-color:var(--color-error);box-shadow:var(--shadow-inset),0 0 0 4px color-mix(in srgb,var(--color-error) 14%,transparent)}
.field input[type=email],.field input[type=tel],.field input[type=password],.field input[data-ltr]{direction:ltr;text-align:start}
.field small{display:block;color:var(--color-text-muted);font-size:.78rem;line-height:1.6;margin-top:7px}
.field small:empty{display:none}
.field .field-error{color:var(--color-error-text);font-size:.82rem;font-weight:500}
.password-wrap{display:flex;position:relative}
.password-wrap input{padding-inline-end:72px}
.password-toggle{position:absolute;inset-inline-end:6px;top:6px;bottom:6px;padding:0 13px;border:0;border-radius:10px;background:var(--color-surface);color:var(--color-accent-text);font-size:.76rem;font-weight:700;box-shadow:var(--shadow-control)}
.form-grid+.field{margin-top:18px}
.field.full-span{grid-column:1/-1}
.form-hint{font-size:.8rem;line-height:1.8;margin-top:14px}
.notice{border:1px solid color-mix(in srgb,var(--color-error) 35%,transparent);background:color-mix(in srgb,var(--color-error) 9%,var(--color-surface));padding:13px 16px;border-radius:var(--radius-sm);color:var(--color-error-text);font-size:.88rem;margin:0 0 20px;line-height:1.7}
.notice.success{border-color:color-mix(in srgb,var(--color-success) 35%,transparent);background:color-mix(in srgb,var(--color-success) 10%,var(--color-surface));color:var(--color-success-text)}
.notice.info{border-color:color-mix(in srgb,var(--color-accent) 35%,transparent);background:color-mix(in srgb,var(--color-accent) 9%,var(--color-surface));color:var(--color-text-primary)}
.notice.warning{border-color:color-mix(in srgb,var(--color-warning) 40%,transparent);background:color-mix(in srgb,var(--color-warning) 10%,var(--color-surface));color:var(--color-warning-text)}
.notice p{color:inherit}
.notice:empty{display:none}
.form-submit{margin-top:26px}
.form-panel{border:1px solid var(--color-border);background:var(--color-surface);border-radius:var(--radius-xl);padding:30px;margin-bottom:22px;box-shadow:var(--shadow-card)}
.form-panel h2{font-size:1.18rem;margin-bottom:22px}
.form-panel .field:last-child{margin-bottom:0}
.field{position:relative}
.field.is-valid input:not([type=password]):not([type=file]),.field.is-valid .cpick-btn{border-color:color-mix(in srgb,var(--color-success) 55%,var(--color-border))}
.field.is-valid>label:after{content:"";display:inline-block;width:5px;height:9px;margin-inline-start:8px;border-inline-end:2px solid var(--color-success-text);border-bottom:2px solid var(--color-success-text);transform:rotate(45deg) translateY(-2px);animation:tick-in 260ms var(--ease-out)}
.field .field-error:not(:empty){animation:msg-in 220ms var(--ease-out)}
.notice:not([hidden]){animation:msg-in 260ms var(--ease-out)}
```
## Price — `priceHTML()`
```js
function priceHTML(value,currency=state.currency) {
  return value === null || value === undefined ? `<div class="price"><span class="agreement">${t('byAgreement')}</span></div>` : `<div class="price"><span class="currency">${SYMBOLS[currency] || '₪'}</span><span class="amount">${amountText(value)}</span></div>`;
}
```
## Plan card / add-on card / badge / eyebrow
```css
.eyebrow{display:inline-flex;align-items:center;gap:10px;color:var(--color-accent-text);font-size:.74rem;font-weight:700;letter-spacing:.2em;text-transform:uppercase;line-height:1.5}
.eyebrow:before{content:"";width:22px;height:1px;background:currentColor;opacity:.7}
.page-heading.center .eyebrow:after{content:"";width:22px;height:1px;background:currentColor;opacity:.7}
.section-head{max-width:640px;margin-bottom:56px}
.section-head.center{text-align:center;margin-inline:auto}
.section-head h2{font-family:var(--font-display);font-size:clamp(2.1rem,3.8vw,3.2rem);font-weight:500;letter-spacing:-.02em;line-height:1.08;margin-top:16px}
.section-head p{margin-top:16px;font-size:1.05rem;line-height:1.8}
.pillars{display:grid;grid-template-columns:repeat(3,1fr);gap:28px}
.pillar{position:relative;padding:34px 30px 32px;border-radius:var(--radius-xl);background:var(--color-surface);border:1px solid var(--color-border);box-shadow:var(--shadow-card);transform-style:preserve-3d;transform:perspective(900px) rotateX(var(--rx,0deg)) rotateY(var(--ry,0deg)) translateY(var(--lift,0px));transition:transform var(--dur-slow) var(--ease-out),box-shadow var(--dur-slow) var(--ease)}
.pillar:hover{--lift:-4px;box-shadow:var(--shadow-hover)}
.pillar h3{font-size:1.2rem;margin:26px 0 10px}
.pillar p{font-size:.95rem;line-height:1.75}
.pillar-index{position:absolute;inset-inline-end:26px;top:26px;font-family:var(--font-display);font-size:1.05rem;color:var(--color-text-muted)}
.check-list{list-style:none;padding:0;margin:28px 0 0;display:grid;gap:14px}
.check-list li{display:flex;gap:12px;align-items:start;font-size:.95rem;color:var(--color-text-primary)}
.ck{flex-shrink:0;width:24px;height:24px;margin-top:0;border-radius:8px;display:grid;place-items:center;color:var(--color-accent-text);background:var(--color-surface);box-shadow:var(--shadow-control)}
.ck svg{width:12px;height:12px}
.page-heading{padding-block:64px 40px}
.page-heading.center{text-align:center}
.page-heading h1{margin-top:16px}
.page-heading p{margin-top:16px;font-size:1.06rem;max-width:640px;line-height:1.8}
.page-heading.center p{margin-inline:auto}
.page-heading .tag{margin-top:22px}
.pricing-controls{display:flex;flex-direction:column;align-items:center;gap:16px;margin-top:26px}
.pricing-controls .tag{margin-top:0;text-align:center;justify-content:center}
.pricing-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:22px;margin-top:22px;align-items:stretch}
.plan-card{position:relative;border:1px solid var(--color-border);border-radius:var(--radius-xl);padding:32px 26px 26px;background:var(--color-surface);box-shadow:var(--shadow-card);display:flex;flex-direction:column;min-width:0;transform:perspective(1000px) rotateX(var(--rx,0deg)) rotateY(var(--ry,0deg)) translateY(var(--lift,0px));transition:transform var(--dur-slow) var(--ease-out),box-shadow var(--dur-slow) var(--ease)}
.plan-card:hover{--lift:-4px;box-shadow:var(--shadow-hover)}
.plan-card.featured{box-shadow:var(--shadow-raised);border-color:color-mix(in srgb,var(--color-accent) 45%,transparent);background:linear-gradient(180deg,color-mix(in srgb,var(--color-accent) 7%,var(--color-surface)),var(--color-surface) 40%)}
.plan-card.featured:before{content:"";position:absolute;inset-inline:28px;top:-1px;height:2px;border-radius:2px;background:linear-gradient(90deg,transparent,var(--color-accent),transparent)}
.popular{position:absolute;top:0;left:50%;transform:translate(-50%,-50%);background:var(--button-primary-bg);color:var(--button-primary-text);border-radius:var(--radius-full);padding:6px 16px;font-size:.68rem;letter-spacing:.14em;white-space:nowrap;font-weight:700;box-shadow:0 8px 18px -8px var(--3d-shadow)}
.plan-icon{position:relative;width:54px;height:54px;border-radius:50%;display:grid;place-items:center;margin-bottom:22px;color:var(--color-accent-text);font-family:"Cormorant Garamond",Georgia,"Times New Roman",serif;font-weight:600;font-size:1.32rem;letter-spacing:.06em;line-height:1;padding-inline-start:.06em;direction:ltr;background:radial-gradient(circle at 32% 26%,var(--3d-surface),var(--3d-secondary) 78%);box-shadow:0 10px 20px -10px var(--3d-shadow),inset 0 2px 0 rgba(255,255,255,.75),inset 0 -3px 6px rgba(0,0,0,.06);transition:transform var(--dur-slow) var(--ease-out)}
.plan-icon:after{content:"";position:absolute;inset:5px;border-radius:50%;border:1px solid color-mix(in srgb,var(--color-accent) 38%,transparent);pointer-events:none}
.plan-card:hover .plan-icon{transform:translateY(-2px) rotate(-4deg)}
.plan-card.featured .plan-icon{background:radial-gradient(circle at 32% 26%,var(--3d-highlight),var(--3d-accent) 80%);color:var(--color-on-accent)}
.plan-card.featured .plan-icon:after{border-color:color-mix(in srgb,var(--color-on-accent) 35%,transparent)}
.plan-card h2{font-family:"Cormorant Garamond",Georgia,serif;letter-spacing:-.01em;font-size:2.05rem;font-weight:600;line-height:1.15;direction:ltr;text-align:start}
.plan-card .description{font-size:.86rem;min-height:46px;margin-top:8px;line-height:1.65}
.plan-price{padding:22px 0 20px;border-top:1px solid var(--color-border);margin-top:16px}
.plan-price .period{font-size:.84rem;color:var(--color-accent-text);margin-top:6px;font-weight:500}
.plan-features{list-style:none;padding:0;margin:0 0 28px;flex:1}
.plan-features li{display:flex;gap:10px;align-items:start;font-size:.88rem;line-height:1.6;margin:10px 0;color:var(--color-text-primary)}
.plan-card .btn{padding-inline:12px;min-height:46px;font-size:.9rem}
.addons-section{margin:56px 0 0}
.addons-title{display:flex;align-items:center;gap:22px;text-align:center;justify-content:center}
.addons-title h2{font-size:1.05rem;white-space:nowrap;font-weight:600}
.addons-title:before,.addons-title:after{content:"";height:1px;background:var(--color-border-strong);flex:1;max-width:160px}
.addons-grid{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:24px}
.addon-card{border:1px solid var(--color-border);border-radius:var(--radius-lg);padding:22px 24px;display:flex;align-items:center;gap:18px;background:var(--color-surface);box-shadow:var(--shadow-card)}
.addon-symbol{color:var(--color-accent-text);font-size:1.25rem;font-weight:600;border-radius:16px;width:50px;height:50px;display:grid;place-items:center;flex-shrink:0;background:var(--color-surface-sunken);box-shadow:var(--shadow-inset)}
.addon-card h3{font-size:1rem}
.addon-card p{font-size:.82rem;margin-top:6px}
.addon-price{margin-inline-start:auto;white-space:nowrap;color:var(--color-text-primary);font-weight:600;font-size:1.3rem;line-height:1.3;text-align:end;flex-shrink:0}
.addon-price small{font-size:.76rem;display:block;color:var(--color-text-muted);font-weight:500;margin-top:4px}
.addon-control{display:flex;align-items:center;gap:13px;margin-top:18px;font-size:.92rem;padding:14px 16px;border-radius:var(--radius-sm);background:var(--color-surface-sunken)}
.addon-control input[type=checkbox]{width:20px;height:20px;accent-color:var(--color-accent);flex-shrink:0}
.addon-control label{flex:1}
.addon-control .amount{color:var(--color-text-primary);font-weight:600;white-space:nowrap}
```
