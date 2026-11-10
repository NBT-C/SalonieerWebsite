// app.js — UI helpers, hash router, shell pages, bootstrap.
// Salonieer

// =====================================================================
//  UI HELPERS
// =====================================================================
const UI = (() => {
  const view = () => document.getElementById("view");

  const ICONS = {
    qr:'<path d="M3 3h6v6H3zM15 3h6v6h-6zM3 15h6v6H3zM15 15h2v2h-2zM19 15h2v6h-6v-2" fill="none" stroke="currentColor" stroke-width="2"/>',
    // METON: the "service / business" glyph is a briefcase for every kind of business (the key name stays).
    scissors:'<rect x="3" y="7" width="18" height="13" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M9 7V5a2 2 0 012-2h2a2 2 0 012 2v2M3 13h18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    phone:'<path d="M22 16.9v3a2 2 0 01-2.2 2 19.8 19.8 0 01-8.6-3.1 19.5 19.5 0 01-6-6A19.8 19.8 0 012.1 4.2 2 2 0 014 2h3a2 2 0 012 1.7c.1.9.3 1.8.6 2.6a2 2 0 01-.5 2.1L7.6 9.8a16 16 0 006 6l1.4-1.4a2 2 0 012.1-.5c.8.3 1.7.5 2.6.6A2 2 0 0122 16.9z" fill="none" stroke="currentColor" stroke-width="2"/>',
    shield:'<path d="M12 2l8 3v6c0 5-3.5 8-8 11-4.5-3-8-6-8-11V5l8-3z" fill="none" stroke="currentColor" stroke-width="2"/>',
    eye:'<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="2"/>',
    eyeoff:'<path d="M3 3l18 18M10.6 10.6a3 3 0 004.2 4.2M9.9 5.2A9.6 9.6 0 0112 5c6 0 10 7 10 7a17 17 0 01-3.2 3.9M6.1 6.1A17 17 0 002 12s4 7 10 7a9.5 9.5 0 003.9-.8" fill="none" stroke="currentColor" stroke-width="2"/>',
    bell:'<path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 01-3.4 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
    home:'<path d="M3 11l9-8 9 8M5 10v10h14V10" fill="none" stroke="currentColor" stroke-width="2"/>',
    calendar:'<path d="M3 5h18v16H3zM3 9h18M8 3v4M16 3v4" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
    bag:'<path d="M6 7V6a6 6 0 0112 0v1h3l-1 14H4L3 7h3zm2 0h8V6a4 4 0 00-8 0v1z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
    user:'<path d="M12 12a5 5 0 100-10 5 5 0 000 10zm0 2c-5 0-9 2.5-9 6v1h18v-1c0-3.5-4-6-9-6z"/>',
    users:'<path d="M16 14a4 4 0 10-8 0M12 11a3 3 0 100-6 3 3 0 000 6zM2 20c0-2.2 2.7-4 6-4M22 20c0-2.2-2.7-4-6-4" fill="none" stroke="currentColor" stroke-width="1.8"/>',
    cog:'<circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>',
    back:'<path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
    chev:'<path d="M15 6l-6 6 6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
    down:'<path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
    arrowL:'<path d="M19 12H5M11 18l-6-6 6-6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
    arrowR:'<path d="M5 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
    plus:'<path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
    minus:'<path d="M5 12h14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
    expand:'<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
    trash:'<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" fill="none" stroke="currentColor" stroke-width="2"/>',
    pencil:'<path d="M4 20h4L18.5 9.5a2.1 2.1 0 00-3-3L5 17v3z" fill="none" stroke="currentColor" stroke-width="2"/>',
    check:'<path d="M20 6L9 17l-5-5" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>',
    x:'<path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
    clock:'<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 7v5l3 2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    star:'<path d="M12 3l2.7 5.5 6 .9-4.3 4.2 1 6-5.4-2.8L6.6 19.6l1-6L3.3 9.4l6-.9z"/>',
    whatsapp:'<path d="M12 3a9 9 0 00-7.7 13.6L3 21l4.5-1.2A9 9 0 1012 3zm4.5 12.3c-.2.5-1.1 1-1.5 1-.4.1-.9.1-1.4-.1-.3-.1-.8-.3-1.4-.5a8 8 0 01-3.3-2.9c-.2-.3-.7-1-.7-1.9 0-.9.5-1.3.6-1.5.2-.2.4-.2.5-.2h.4c.1 0 .3 0 .5.4l.6 1.5c0 .1.1.3 0 .4l-.3.4-.2.3c-.1.1-.2.3 0 .5.2.4.7 1.1 1.4 1.7.9.8 1.6 1 1.9 1.1.2.1.4.1.5-.1l.6-.7c.2-.2.3-.2.5-.1l1.5.7c.2.1.4.2.4.3.1.1.1.6-.1 1z"/>',
    mail:'<path d="M3 6h18v12H3zM3 7l9 6 9-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
    chat:'<path d="M21 15a2 2 0 01-2 2H8l-5 4V5a2 2 0 012-2h14a2 2 0 012 2z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
    box:'<path d="M21 8l-9-5-9 5 9 5 9-5zM3 8v8l9 5 9-5V8M12 13v8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
    lock:'<path d="M6 11V8a6 6 0 1112 0v3M5 11h14v10H5z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
    pin:'<path d="M12 22s7-6.5 7-12a7 7 0 10-14 0c0 5.5 7 12 7 12zM12 7a3 3 0 100 6 3 3 0 000-6z" fill="none" stroke="currentColor" stroke-width="2"/>',
    info:'<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 11v5M12 7.5h.01" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    globe:'<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3 12h18M12 3a15 15 0 010 18 15 15 0 010-18" fill="none" stroke="currentColor" stroke-width="2"/>',
    logout:'<path d="M16 17l5-5-5-5M21 12H9M9 3H5a2 2 0 00-2 2v14a2 2 0 002 2h4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
    money:'<rect x="2" y="6" width="20" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="2.5" fill="none" stroke="currentColor" stroke-width="2"/>',
    list:'<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    chart:'<path d="M4 20V10M10 20V4M16 20v-7M22 20H2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    tag:'<path d="M3 12l9-9 9 9-9 9zM7 7h.01" fill="none" stroke="currentColor" stroke-width="2"/>',
    moon:'<path d="M21 12.8A9 9 0 1111.2 3 7 7 0 0021 12.8z"/>',
    sun:'<circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    search:'<circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="M21 21l-4.3-4.3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    image:'<rect x="3" y="3" width="18" height="18" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="8.5" cy="8.5" r="1.8" fill="currentColor"/><path d="M21 15l-5-5L5 21" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
    images:'<rect x="7" y="3" width="14" height="14" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M17 21H6a3 3 0 01-3-3V7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="11.5" cy="8" r="1.6" fill="currentColor"/><path d="M21 13l-4-4-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
    refresh:'<path d="M21 12a9 9 0 11-3-6.7L21 8M21 3v5h-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
    grid:'<rect x="3" y="3" width="7" height="7" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><rect x="14" y="3" width="7" height="7" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><rect x="3" y="14" width="7" height="7" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><rect x="14" y="14" width="7" height="7" rx="2" fill="none" stroke="currentColor" stroke-width="2"/>',
    rows:'<rect x="3" y="4" width="18" height="5" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><rect x="3" y="12" width="18" height="5" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3 20h18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    filter:'<path d="M3 5h18l-7 8v6l-4 2v-8z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
    coffee:'<path d="M4 8h13v5a5 5 0 01-5 5H9a5 5 0 01-5-5zM17 9h1.5a2.5 2.5 0 010 5H17M4 21h13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    bolt:'<path d="M13 2L4 14h6l-1 8 9-12h-6z" fill="currentColor"/>',
    print:'<path d="M7 8V3h10v5M7 18H5a2 2 0 01-2-2v-4a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2h-2M7 14h10v7H7z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
  };
  // "fwd"/"bwd" follow the reading direction; "back" and "chev" are drawn for
  // right-to-left and are mirrored by CSS in left-to-right languages.
  function icon(n, s) {
    s = s || 22;
    const rtl = document.documentElement.dir === "rtl";
    if (n === "fwd") n = rtl ? "arrowL" : "arrowR"; else if (n === "bwd") n = rtl ? "arrowR" : "arrowL";
    const cls = n === "back" || n === "chev" ? ' class="dir-icon"' : "";
    return `<svg${cls} viewBox="0 0 24 24" width="${s}" height="${s}" fill="currentColor" aria-hidden="true">${ICONS[n] || ""}</svg>`;
  }

  function esc(s){ return String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
  // 2.43: in the salon's own currency (Money, money.js).
  function money(n){ if(App.settings && App.settings.show_prices===false) return ""; return window.Money ? Money.fmt(n) : Lang.number(n)+" "+Lang.t("شيكل"); }

  const AR_DAYS=["الأحد","الاثنين","الثلاثاء","الأربعاء","الخميس","الجمعة","السبت"];
  const AR_MONTHS=["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];
  function dateAr(s){ return s ? Lang.date(s) : ""; }
  function dayName(d){ return Lang.date(d,{weekday:"long"}); }
  function timeAr(t){
    if(!t) return ""; const [h,m]=String(t).split(":").map(Number);
    let suffix= h<12?"صباحاً": h<16?"بعد الظهر": h<20?"مساءً":"ليلاً";
    let hh=h%12; if(hh===0) hh=12;
    return Lang.get()==="ar" ? `${String(hh).padStart(2,"0")}:${String(m).padStart(2,"0")} ${suffix}`
      : new Intl.DateTimeFormat(Lang.locale(),{hour:"2-digit",minute:"2-digit",hour12:true}).format(new Date(2024,0,1,h,m));
  }

  const STATUS_AR={pending:"قيد الانتظار",confirmed:"مؤكد",completed:"مكتمل",cancelled:"ملغي",no_show:"لم يحضر",expired:"منتهي",
    open:"مفتوح",resolved:"تم الحل",closed:"مغلق",active:"نشط",hidden:"مخفي"};
  const STATUS_STYLE={pending:"warn",confirmed:"info",completed:"ok",cancelled:"danger",no_show:"muted",expired:"danger expired",
    open:"warn",resolved:"ok",closed:"muted",active:"ok",hidden:"muted"};
  function badge(s){ return `<span class="badge ${STATUS_STYLE[s]||"muted"}">${Lang.t(STATUS_AR[s]||s)}</span>`; }

  function statusbar(){ return ""; } // kept for template compatibility

  function logoContext(){
    const managed=window.Control?.target?.();
    if(managed)return {salon:managed,settings:{app_name:managed.name,logo_url:managed.logo_url,...(managed.capabilities||{})}};
    return {salon:window.Platform?.current?.()||null,settings:App.settings||{}};
  }
  // 2.31: the official Salonieer artwork (outlined, never retyped). Each mark
  // comes as a pair: white artwork for dark surfaces, navy for light ones;
  // brand.css shows the one that matches the theme.
  const BRAND_SYMBOL="assets/brand/salonieer-symbol-on-light.svg";
  const brandPair=(kind,cls,alt,attrs="")=>
    `<img class="${cls} salonieer-logo-light" src="assets/brand/salonieer-${kind}-on-light.svg" alt="${esc(alt)}" ${attrs} decoding="async">`
    +`<img class="${cls} salonieer-logo-dark" src="assets/brand/salonieer-${kind}-on-dark.svg" alt="${esc(alt)}" ${attrs} decoding="async">`;
  function logoFallbackSrc(){
    const {salon,settings:s}=logoContext();
    if(!salon&&!s.logo_url)return BRAND_SYMBOL;
    // 2.32: a salon that never chose colours gets the logo navy tile (with a
    // gold letter), not the bright blue default; its own colour otherwise.
    const theme=SalonTheme.normalize({...salon?.capabilities,...s});
    const color=theme.custom?theme.primary_color:SalonTheme.SALONIEER_ACCENT.light;
    const initial=esc((s.app_name||salon?.name||"S").trim().charAt(0)||"S");
    if(!theme.custom) return "data:image/svg+xml,"+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="192" height="192"><rect width="192" height="192" rx="42" fill="${color}"/><text x="96" y="122" text-anchor="middle" font-family="sans-serif" font-weight="700" font-size="90" fill="#faf4eb">${initial}</text></svg>`);
    return "data:image/svg+xml,"+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="192" height="192"><rect width="192" height="192" rx="42" fill="${color}"/><text x="96" y="120" text-anchor="middle" font-family="sans-serif" font-size="90" fill="${SalonTheme.ink(color)}">${initial}</text></svg>`);
  }
  function logoSrc(){
    const {salon,settings:s}=logoContext();
    return String(s.logo_url||salon?.logo_url||"").trim()||logoFallbackSrc();
  }

  /*  One logo renderer for every screen.
      • The box is declared up front, so the logo never reflows the header
        around it and never appears half-drawn inside a growing container.
      • object-fit:contain, always: a wide wordmark is letterboxed rather than
        cropped, and nothing is ever stretched.
      • The fallback is swapped in on a real `error` event only. While the
        image is still arriving the element simply stays empty — it is not
        replaced by an initial that then flicks back to the logo.
      • The element is keyed by its source, so re-rendering a page with the
        same logo reuses the decoded image instead of fetching it again, and
        a changed logo genuinely replaces the old one.                        */
  function logoImg(className="",alt="",opts={}){
    const size=Number(opts.size)||96;
    const src=logoSrc();
    const cls=(className?esc(className)+" ":"")+"brand-logo";
    // The Salonieer mark itself is a pair of themed files, not a salon logo.
    if(src===BRAND_SYMBOL)return brandPair("symbol",cls+" salonieer-symbol",alt,`width="${size}" height="${size}"`);
    return `<img class="${cls}" src="${esc(src)}" alt="${esc(alt)}" width="${size}" height="${size}"`
      + ` loading="eager" decoding="auto" fetchpriority="high" data-logo-key="${esc(fingerprint(src))}"`
      + ` onerror="UI.logoFailed(this)">`;
  }
  // A short, stable key for one logo. Used to tell a genuinely new logo from
  // a re-render of the same one.
  function fingerprint(src){
    const v=String(src||"");
    let h=0;
    for(let i=0;i<v.length;i+=Math.max(1,Math.floor(v.length/512))) h=(h*31+v.charCodeAt(i))|0;
    return String(v.length)+"-"+(h>>>0).toString(36);
  }
  // Only a real failure falls back, and only once per element.
  function logoFailed(el){
    if(!el||el.dataset.logoFallback) return;
    window.ImageReliability?.abandon(el);
    el.dataset.logoFallback="1";
    el.src=logoFallbackSrc();
  }


  // One place decides how a remote image loads. Explicit box + lazy decoding
  // keeps a slow photo from shifting the page or blocking the first paint.
  function img(src, opts){
    const o=opts||{};
    if(!src) return "";
    const eager=o.eager===true;
    return `<img src="${esc(src)}" alt="${esc(o.alt||"")}"`
      + (o.className?` class="${esc(o.className)}"`:"")
      + (o.width?` width="${Number(o.width)}"`:"") + (o.height?` height="${Number(o.height)}"`:"")
      + ` loading="${eager?"eager":"lazy"}" decoding="async" fetchpriority="${eager?"high":"low"}"`
      + (o.style?` style="${esc(o.style)}"`:"")
      // 2.34: a person's photo that cannot be shown becomes their initial (photos.js).
      + (o.initial!=null?` data-initial="${esc(o.initial)}"`:"") + `>`;
  }
  // page header: back / title+sub / actions
  // Notifications are a primary destination on the bar, with the unread dot on
  // it, so no page repeats them as a second bell in its own header.
  // 2.34: the bell (notifications + requests) sits in the top bar of every
  // screen with a header, for signed-in people (a page can say bell:false).
  function header(opts){
    const o=opts||{}; const s=App.settings||{};
    const back = o.back!=null
      ? `<button class="iconbtn" data-back="${o.back}" aria-label="رجوع">${icon("back",20)}</button>` : "";
    const bell = o.bell!==false && window.Push?.bellButton ? Push.bellButton() : "";
    return `<header class="header">
      <div class="hwrap">
        ${back}
        <div class="hmain">
          <h1>${esc(o.title||s.app_name||"METON")}</h1>
          ${o.sub?`<p class="hsub">${esc(o.sub)}</p>`:""}
        </div>
        ${o.right||bell?`<div class="hactions">${o.right||""}${bell}</div>`:""}
      </div>
    </header>`;
  }
  function backbar(title,href){
    return `<div class="backbar"><button class="iconbtn" data-back="${href||""}" aria-label="رجوع">${icon("back",20)}</button><h2>${esc(title)}</h2></div>`;
  }

  // one bottom bar on every device (full width on phones, centred pill above)
  function appNav(path){
    const s=App.settings||{};
    const items=[
      {h:"#/home",i:"home",l:"الرئيسية"},
      {h:"#/bookings",i:"calendar",l:"حجوزاتي"},
      {h:"#/products",i:"bag",l:"المنتجات"},
      {h:"#/notifications",i:"bell",l:"الإشعارات"},
      {h:"#/settings",i:"user",l:"حسابي"},
    ];
    if(s.show_products===false || !Features.enabled("shop")) items.splice(2,1);

    const btn=(it)=>{
      const active=path===it.h||(it.h==="#/home"&&(path.startsWith("#/barber/")||path.startsWith("#/book/")))
        ||(it.h==="#/bookings"&&(path.startsWith("#/booking/")||path.startsWith("#/reservation/")))
        ||(it.h==="#/products"&&path.startsWith("#/product/"))
        ||(it.h==="#/notifications"&&path==="#/notifications/history")
        ||(it.h==="#/settings"&&(path.startsWith("#/admin")||path.startsWith("#/barber-dash")
            ||["#/contact","#/about","#/privacy","#/terms","#/salons","#/loyalty"].includes(path)));
      const dot=(it.h==="#/notifications"&&App.unread>0)?`<span class="nav-dot"></span>`:"";
      return `<button class="navitem ${active?"active":""}" data-nav="${it.h}"
        aria-label="${it.l}" ${active?'aria-current="page"':""}><span class="nav-symbol">${icon(it.i,21)}${dot}</span><span>${it.l}</span></button>`;
    };
    return `<nav class="appnav" aria-label="التنقل">
      <a class="nav-brand" href="#/home" aria-label="METON">${brandPair("horizontal","nav-brand-logo","METON",'width="150" height="47"')}</a><div class="nav-items">${items.map(btn).join("")}</div>
    </nav>`;
  }
  // kept as an alias so older calls keep working
  function bottomNav(path){ return appNav(path); }

  function endTime(time,duration){const [h,m]=String(time).split(':').map(Number);const total=h*60+m+Number(duration||0);return String(Math.floor(total/60)%24).padStart(2,'0')+':'+String(total%60).padStart(2,'0');}
  // Which element actually scrolls: the app column normally, the window inside
  // the iOS WebView where the page itself scrolls.
  const nativeIOS=()=>document.documentElement.dataset.native==="ios";
  function scrollTop(){ return nativeIOS()?(window.scrollY||0):(view()?.scrollTop||0); }
  function scrollTo(y){ const target=Math.max(0,y||0); if(nativeIOS()) window.scrollTo(0,target); else { const v=view(); if(v) v.scrollTop=target; } }

  // Route painting.
  //   • A page re-painting itself (a filter, a search, a status change) must
  //     never throw the reader back to the top, so render() no longer touches
  //     the scroll position — the router restores it once per navigation.
  //   • The skeleton is armed, not painted. A page served from cache renders
  //     within a frame and the reader never sees a flash of placeholder.
  let routeToken=0, skeletonTimer=null, painted=true;
  function render(html){
    painted=true;
    clearTimeout(skeletonTimer);
    const v=view();
    // Replacing the markup resets the scroll box. A page redrawing itself —
    // a filter, a search, a status arriving — has to stay where it was.
    const keep=scrollTop();
    document.documentElement.dataset.routePage=(location.hash.split("?")[0]||"#/home").slice(2).replace(/[^a-z-]/g,"-");
    v.innerHTML=`<div class="page">${html}</div>`;
    if(keep) scrollTo(keep);
  }
  function beginRoute(){
    const token=++routeToken;
    painted=false;
    clearTimeout(skeletonTimer);
    skeletonTimer=setTimeout(()=>{ if(!painted && token===routeToken) render(loading()); },180);
    progress(true);
    return token;
  }
  function endRoute(){ clearTimeout(skeletonTimer); painted=true; progress(false); window.Platform?.openingDone?.(); }

  function loading(){
    const card=`<div class="sk card-sk"></div>`;
    return `<div class="skel-page">
      <div class="skel-head sk"></div>
      <div class="skel-body">
        <div class="sk line-sk w80"></div>
        <div class="skel-grid">${card}${card}${card}</div>
        <div class="sk line-sk"></div>
        <div class="skel-grid">${card}${card}${card}</div>
      </div></div>`;
  }
  function setNav(show){ view().classList.toggle("no-nav",!show); }

  function empty(title,desc,btn,href){
    return `<div class="empty"><div class="ec">${icon("box",34)}</div>
      <h3>${esc(title)}</h3>${desc?`<p>${esc(desc)}</p>`:""}
      ${btn?`<button class="btn sm" data-nav="${href||"#/home"}" style="margin-top:10px">${esc(btn)}</button>`:""}</div>`;
  }

  let toastT;
  function toast(msg,kind){
    const el=document.getElementById("toast");
    el.textContent=Lang.ui(msg); el.className="toast show "+(kind||"");
    clearTimeout(toastT); toastT=setTimeout(()=>el.className="toast "+(kind||""),2800);
  }
  function busy(id,on){ const b=document.getElementById(id); if(!b)return;
    if(on){ if(b.getAttribute("aria-busy")==="true")return; b.dataset.txt=b.innerHTML; b.disabled=true; b.setAttribute("aria-busy","true"); b.innerHTML='<span class="button-progress" aria-hidden="true"></span><span class="busy-label">جارٍ التنفيذ…</span>'; }
    else { b.disabled=false;b.removeAttribute("aria-busy");if(b.dataset.txt)b.innerHTML=b.dataset.txt; }
  }

  let modalFocus=null;
  document.addEventListener("keydown",event=>{
    if(document.querySelector(".photo-editor")) return;
    const modal=document.querySelector("#modal-root .modal"); if(!modal)return;
    if(event.key==="Escape"){event.preventDefault();closeModal();return;}
    if(event.key!=="Tab")return;
    const focusable=[...modal.querySelectorAll("button,input,select,textarea,a[href],[tabindex=\"0\"]")].filter(el=>!el.disabled&&el.getClientRects().length);
    if(!focusable.length){event.preventDefault();return;}
    const first=focusable[0],last=focusable[focusable.length-1];
    if(event.shiftKey&&(document.activeElement===first||document.activeElement===modal)){event.preventDefault();last.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
  });
  function modal(html){
    if(!document.querySelector("#modal-root .modal"))modalFocus=document.activeElement;
    const root=document.getElementById("modal-root");
    root.innerHTML=`<div class="modal-bg"><div class="modal" role="dialog" aria-modal="true" tabindex="-1">${html}</div></div>`;
    const bg=root.firstElementChild;
    const dialog=bg.firstElementChild;
    dialog.setAttribute("aria-label",dialog.querySelector("h2,h3")?.textContent||"نافذة");
    dialog.focus({preventScroll:true});
    bg.addEventListener("click",e=>{ if(e.target===bg) closeModal(); });
    return bg;
  }
  function closeModal(){ document.getElementById("modal-root").innerHTML=""; modalFocus?.focus?.(); modalFocus=null; }
  // The question is translated as a whole first; a question built from a known
  // phrase plus "؟" ("تصحيح: لم يحضر؟") is translated without its mark and gets
  // the mark of the current language, so the dialog never stays in Arabic.
  function question(msg){
    const raw=String(msg||"");
    const whole=Lang.t(raw);
    if(whole!==raw||Lang.get()==="ar") return whole;
    const bare=raw.replace(/\s*[؟?]\s*$/,"");
    if(bare===raw) return whole;
    return Lang.t(bare)+"?";
  }
  function confirm(msg,onYes,danger){
    modal(`<h3>${esc(Lang.t("تأكيد"))}</h3><p class="muted" style="margin-bottom:18px" data-i18n-skip>${esc(question(msg))}</p>
      <div class="btn-row"><button class="btn ${danger?"danger":""}" id="cy">${esc(Lang.t("نعم"))}</button>
      <button class="btn line" id="cn">${esc(Lang.t("إلغاء"))}</button></div>`);
    document.getElementById("cn").onclick=closeModal;
    document.getElementById("cy").onclick=async()=>{ closeModal(); await onYes(); };
  }

  // Preview and crop locally; unsaved parent forms remain intact.
  function pickImage(cb, options){ return PhotoPicker.choose(cb, options); }

  // Labelled, direction-aware pager: "‹ Previous · Page 2 · Next ›" in LTR,
  // mirrored in RTL, with 44px targets. Hidden when there is only one page.
  function pager(page, hasNext){
    if(page<=0 && !hasNext) return "";
    const rtl=document.documentElement.dir==="rtl";
    return `<nav class="smart-pager" aria-label="${Lang.t("الصفحات")}">
      <button class="smart-pager-btn" id="pg-prev" ${page<=0?"disabled":""}>${icon(rtl?"arrowR":"arrowL",16)}<span>السابق</span></button>
      <span class="smart-pager-page">${Lang.t("الصفحة")} <b>${Lang.number(page+1)}</b></span>
      <button class="smart-pager-btn" id="pg-next" ${!hasNext?"disabled":""}><span>التالي</span>${icon(rtl?"arrowL":"arrowR",16)}</button>
    </nav>`;
  }
  function wirePager(onPrev, onNext, root){
    // A modal can sit over a page that has its own pager: wire the one inside
    // the given root (default: the open modal first, then the page).
    const scope=root||document.querySelector("#modal-root .modal")||document;
    // An explicit root never borrows a pager from elsewhere on the page.
    const p=scope.querySelector("#pg-prev")||(root?null:document.getElementById("pg-prev")), n=scope.querySelector("#pg-next")||(root?null:document.getElementById("pg-next"));
    if(p) p.onclick=onPrev; if(n) n.onclick=onNext;
  }
  function collapsible(title, bodyHtml, open){
    return `<div class="collapsible ${open?"open":""}">
      <div class="coll-head">${title}<span class="chev">${icon("down",20)}</span></div>
      <div class="coll-body">${bodyHtml}</div>
    </div>`;
  }
  // segmented control: opts = [{v,l,i}], returns markup; wire with UI.wireSeg
  function seg(id, opts, current){
    return `<div class="seg" id="${id}">${opts.map(o=>
      `<button data-v="${esc(o.v)}" class="${o.v===current?"on":""}">${o.i?icon(o.i,16):""}${esc(o.l)}</button>`).join("")}</div>`;
  }
  function wireSeg(id, cb){
    const host=document.getElementById(id); if(!host) return;
    host.querySelectorAll("button").forEach(b=>b.onclick=()=>{
      host.querySelectorAll("button").forEach(x=>x.classList.remove("on"));
      b.classList.add("on"); cb(b.dataset.v);
    });
  }

  // ---- Horizontal strips (tabs, chips, day pickers, filters) --------------
  // Every strip scrolls sideways with a finger or trackpad instead of being
  // clipped, opens with its selected item in view, and fades at an edge while
  // more items are hidden there. One observer covers every page and modal.
  const STRIPS = ".seg,.chips,.atabs,.days,.studio-filter-row,.loy-tabs";
  const seenStrips = new WeakSet();
  function stripEdges(strip) {
    const max = strip.scrollWidth - strip.clientWidth;
    if (max <= 2) { strip.removeAttribute("data-fade"); return; }
    const rtl = getComputedStyle(strip).direction === "rtl";
    const pos = rtl ? strip.scrollLeft + max : strip.scrollLeft;   // physical, 0 = far left
    const left = pos > 2, right = pos < max - 2;
    strip.dataset.fade = left && right ? "both" : left ? "left" : right ? "right" : "";
  }
  function centreSelected(strip) {
    const on = strip.querySelector(".on,.active,[aria-pressed='true'],[aria-current='page']");
    if (!on) return;
    const a = on.getBoundingClientRect(), b = strip.getBoundingClientRect();
    const delta = (a.left + a.width / 2) - (b.left + b.width / 2);
    if (Math.abs(delta) > 4) strip.scrollBy({ left: delta, behavior: "auto" });
  }
  function enhanceStrips(root) {
    (root || document).querySelectorAll(STRIPS).forEach(strip => {
      if (!seenStrips.has(strip)) {
        seenStrips.add(strip);
        strip.addEventListener("scroll", () => stripEdges(strip), { passive: true });
        // A tap on a partly hidden item brings it fully into view.
        strip.addEventListener("click", e => { const item = e.target.closest("button,a,[role='button']"); if (item && strip.contains(item)) requestAnimationFrame(() => centreSelected(strip)); });
        centreSelected(strip);
      }
      stripEdges(strip);
    });
  }
  let stripFrame = 0;
  const scheduleStrips = () => { if (!stripFrame) stripFrame = requestAnimationFrame(() => { stripFrame = 0; enhanceStrips(document); }); };
  if (window.MutationObserver) {
    const watch = () => ["view", "modal-root", "navhost"].forEach(id => { const el = document.getElementById(id); if (el) new MutationObserver(scheduleStrips).observe(el, { childList: true, subtree: true }); });
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", watch); else watch();
  }
  window.addEventListener("resize", scheduleStrips, { passive: true });

  // ---- Loading screens ------------------------------------------------------
  // A thin progress bar for every page load, and a branded overlay for the
  // heavier moments (switching salon, signing in or out, opening from a
  // notification). Both appear only if the wait is noticeable, and the
  // overlay stays long enough not to flash.
  let progressTimer = null, progressCount = 0;
  function progress(on) {
    let bar = document.getElementById("route-progress");
    if (!bar) { bar = document.createElement("div"); bar.id = "route-progress"; bar.setAttribute("aria-hidden", "true"); document.body.appendChild(bar); }
    progressCount = Math.max(0, progressCount + (on ? 1 : -1));
    clearTimeout(progressTimer);
    if (progressCount > 0) progressTimer = setTimeout(() => bar.classList.add("run"), 120);
    else { bar.classList.remove("run"); bar.classList.add("done"); progressTimer = setTimeout(() => bar.classList.remove("done"), 260); }
  }
  function loader(label, opts = {}) {
    const delay = opts.delay ?? 150, minimum = opts.minimum ?? 450;
    let el = null, shownAt = 0, closed = false;
    const show = () => {
      if (closed) return;
      el = document.createElement("div");
      el.className = "app-loader";
      el.setAttribute("role", "status"); el.setAttribute("aria-live", "polite");
      el.innerHTML = `<div class="app-loader-card"><span class="app-loader-mark">${opts.logo || logoImg("", "", { size: 56 })}<i class="app-loader-ring" aria-hidden="true"></i></span>${label ? `<b>${esc(Lang.t(label))}</b>` : ""}</div>`;
      document.body.appendChild(el);
      requestAnimationFrame(() => el.classList.add("show"));
      shownAt = Date.now();
    };
    // delay 0 means "show now": an instant salon switch would otherwise
    // finish before a zero timeout fired and the loader would never appear.
    const timer = delay > 0 ? setTimeout(show, delay) : (show(), 0);
    return function hide() {
      if (closed) return; closed = true;
      clearTimeout(timer);
      if (!el) return;
      const node = el;
      setTimeout(() => { node.classList.remove("show"); setTimeout(() => node.remove(), 220); }, Math.max(0, minimum - (Date.now() - shownAt)));
    };
  }
  async function withLoader(label, work, opts) {
    const hide = loader(label, opts);
    try { return await work(); } finally { hide(); }
  }

  return { icon,esc,money,dateAr,dayName,timeAr,badge,statusbar,header,backbar,bottomNav,appNav,logoSrc,logoFallbackSrc,logoImg,logoFailed,logoFingerprint:fingerprint,img,
    endTime, render,beginRoute,endRoute,brandPair,scrollTop,scrollTo,loading,setNav,empty,toast,busy,modal,closeModal,confirm,pickImage,pager,wirePager,collapsible,
    seg,wireSeg,AR_DAYS,enhanceStrips,progress,loader,withLoader };
})();
window.UI=UI;

document.addEventListener("click", (e) => {
  const head = e.target.closest && e.target.closest(".coll-head");
  if (head && head.parentElement) head.parentElement.classList.toggle("open");
});

// =====================================================================
//  ROUTER
// =====================================================================
/* =====================================================================
   Live — auto refresh
   Re-runs a page's own fetch every few seconds so new bookings appear
   without the person pulling to refresh.
   Deliberate rules:
     • only polls while the tab is actually visible (saves battery + quota)
     • stops the moment the route changes, so pages never poll in the background
     • skips a tick while a modal is open, so a form is never wiped mid-edit
     • the page decides whether anything changed, so the DOM (and the scroll
       position) is only touched when there is real news
     • refreshes immediately when the tab is re-focused, so coming back to
       the app shows current data at once
   ===================================================================== */
const Live=(()=>{
  let timer=null, task=null, ms=10000, busy=false, interactionUntil=0;
  const isNativeIOS=()=>document.documentElement.dataset.native==="ios";
  const interacting=()=>{ interactionUntil=Date.now()+700; };
  document.addEventListener("touchstart",interacting,{passive:true,capture:true});
  document.addEventListener("scroll",interacting,{passive:true,capture:true});

  async function tick(){
    if(!task || busy) return;
    if(document.visibilityState!=="visible") return;      // tab in background
    if(isNativeIOS() && Date.now()<interactionUntil) return; // never repaint during an iOS gesture
    if(document.querySelector("#modal-root .modal-bg")) return;   // don't disturb a modal
    busy=true;
    // Polls are background work: never the tap loading screen.
    try{ await (window.TapGuard ? TapGuard.quiet(task) : task()); }
    catch(e){ /* a failed poll must never break the page */ }
    finally{ busy=false; }
  }

  // start(fn, everyMs) — fn is the page's own refresh routine
  function start(fn, everyMs){
    stop();
    task=fn; ms=everyMs||10000;
    if(isNativeIOS()) ms=Math.max(ms,20000);
    timer=setInterval(tick, ms);
  }
  function stop(){ if(timer){ clearInterval(timer); timer=null; } task=null; busy=false; }
  function now(){ return tick(); }        // force an immediate refresh

  document.addEventListener("visibilitychange", ()=>{
    if(document.visibilityState==="visible") tick();       // catch up on return
  });
  window.addEventListener("online", ()=>tick());

  return {start,stop,now};
})();
window.Live=Live;

const Router=(()=>{
  const routes=[]; let stack=[], last="", retreat=false, started=false, resolving=false, queued=false;
  function parent(hash) {
    const p=parse(hash).path;
    if (["#/home","#/auth","#/splash"].includes(p)) return null;
    if (p.startsWith("#/admin/")) return "#/admin";
    if (p.startsWith("#/barber-dash/")) return "#/barber-dash";
    if (p.startsWith("#/booking/")) return "#/bookings";
    if (p.startsWith("#/reservation/")) return "#/bookings";
    if (p.startsWith("#/product/")) return "#/products";
    if (p==="#/waitlist") return Auth.isLoggedIn()?"#/home":"#/auth";
    if (p==="#/loyalty"||p==="#/packages") return Auth.isLoggedIn()?"#/settings":"#/auth";
    if (p==="#/notifications/history") return "#/notifications";
    if (p==="#/help") return Auth.isLoggedIn()?"#/settings":"#/auth";
    if (["#/register","#/password","#/create-password"].includes(p)) return "#/auth";
    if (["#/contact","#/about","#/privacy","#/terms","#/salons","#/admin","#/barber-dash"].includes(p) && Auth.isLoggedIn()) return "#/settings";
    return Auth.isLoggedIn()?"#/home":"#/auth";
  }
  function usable(hash) {
    if (!hash || parse(hash).path===parse(current()).path || parse(hash).path==="#/splash") return false;
    if (hash.startsWith("#/platform")) return false;
    if (Auth.isLoggedIn() && /^#\/(auth|register|password|create-password)(\?|$)/.test(hash)) return false;
    const r=routes.find(x=>x.pat.test(parse(hash).path));
    return !!r && guardOk(r.guard);
  }
  // Coming back to a list should land where the person left it, not at the
  // top of a freshly rebuilt page.
  const scrollMemory=new Map();
  let restoreTo=null, pressedAt=null, pressedPath="";
  // Pressing a card focuses it, and a focused element is scrolled into view
  // before the route even changes. The position is therefore taken at the
  // moment of the press, which is the one the person actually saw.
  function markPress(){ pressedPath=parse(current()).path; pressedAt=UI.scrollTop(); }
  function rememberScroll(){
    if(!last) return;
    const path=parse(last).path;
    scrollMemory.set(path, pressedPath===path && pressedAt!=null ? pressedAt : UI.scrollTop());
    pressedAt=null; pressedPath="";
  }
  let restoreFrames=0;
  function restoreScroll(path){
    const y=restoreTo!=null?restoreTo:0;
    restoreTo=null;
    UI.scrollTo(y);
    if(!y){ scrollMemory.delete(path); return; }
    // A list that is still filling in (images sizing, a background refresh
    // landing) is shorter than it will be, so the position is re-applied over
    // the next few frames until it actually sticks — and never after the
    // person has started scrolling themselves.
    const token=++restoreFrames;
    let tries=0;
    const settle=()=>{
      if(token!==restoreFrames||tries++>12) return;
      const at=UI.scrollTop();
      if(Math.abs(at-y)>2 && at<y) UI.scrollTo(y);
      else if(at>=y-2) return;
      requestAnimationFrame(settle);
    };
    requestAnimationFrame(settle);
  }
  function changed(){
    App.dirty=false;
    restoreFrames++;                       // cancel any restore still settling
    const next=current();
    rememberScroll();
    restoreTo=retreat?(scrollMemory.get(parse(next).path)||0):0;
    if (!retreat && last && last!==next) {
      const existing=stack.indexOf(next);
      if(existing>=0) stack=stack.slice(0,existing); else stack.push(last);
      if(stack.length>80)stack.shift();
    }
    retreat=false;last=next;resolve();
  }
  function add(path,handler,opts={}){
    const keys=[]; const pat=new RegExp("^"+path.replace(/:[^/]+/g,m=>{keys.push(m.slice(1));return"([^/]+)";})+"$");
    routes.push({pat,keys,handler,guard:opts.guard,nav:opts.nav});
  }
  function current(){ return location.hash||"#/splash"; }
  function parse(hash){
    const clean=hash.replace(/^#/,""), split=clean.indexOf("?");
    const path=split<0?clean:clean.slice(0,split), query=split<0?"":clean.slice(split+1);
    return {path:"#"+path,query:Object.fromEntries(new URLSearchParams(query))};
  }

  function guardOk(g){ if(!g)return true; if(g==="auth")return Auth.isLoggedIn(); if(g==="browse")return Auth.isLoggedIn()||Auth.isGuest(); if(g==="admin")return Auth.isStaff(); if(g==="owner")return Auth.isAdmin(); return true; }
  function requiresAccount(path){ return /^#\/(?:bookings|booking\/|reservation\/|loyalty|waitlist|packages|notifications|settings|profile|admin|barber-dash)(?:\/|\?|$)/.test(path); }
  function signInPrompt(){
    if(window.Account && !Platform.current()?.supabase_url){ Account.requireAccount(); return; }
    UI.modal(`<h3>${Lang.t("تسجيل الدخول مطلوب")}</h3><p>${Lang.t("سجّل الدخول أو أنشئ حساباً للمتابعة.")}</p>
      <div class="btn-row"><button class="btn" id="guest-signin">${Lang.t("تسجيل الدخول")}</button>
      <button class="btn line" id="guest-register">${Lang.t("إنشاء حساب جديد")}</button>
      <button class="btn line" id="guest-dismiss">${Lang.t("ليس الآن")}</button></div>`);
    document.getElementById("guest-signin").onclick=()=>{UI.closeModal();go("#/auth");};
    document.getElementById("guest-register").onclick=()=>{UI.closeModal();go("#/register");};
    document.getElementById("guest-dismiss").onclick=UI.closeModal;
  }

  function shell(showNav){
    const path=parse(current()).path;
    const host=document.getElementById("navhost");
    host.innerHTML = showNav ? UI.appNav(path) : "";
    UI.setNav(showNav);
    bind();
  }

  async function resolve(){
    if(resolving){queued=true;return;}
    resolving=true;
    try { await renderRoute(); }
    finally {resolving=false; window.NativeBridge?.syncTheme(); if(queued){queued=false;resolve();}}
  }
  async function renderRoute(){
    const {path,query}=parse(current());
    document.documentElement.classList.toggle("admin-studio",path.startsWith("#/admin"));
    document.documentElement.classList.remove("platform-studio");
    document.documentElement.classList.toggle("customer-studio",!path.startsWith("#/admin"));
    // The Salonieer Admin console lives on the website (2.29). A leftover
    // #/platform address (a restored WebView, an old shortcut) lands home.
    if (path.startsWith("#/platform")) { go(Auth.isLoggedIn() ? "#/home" : "#/auth"); return; }
    if (Auth.isGuest() && requiresAccount(path)) {
      rewrite("#/home");
      signInPrompt();
      return;
    }
    // Re-apply the selected salon on every customer route. The launcher and
    // the global dashboard intentionally use a neutral fallback theme; without
    // this guard, returning from either one could leave that green fallback on
    // the selected salon until the next full reload.
    if (window.Platform?.current()) Auth.applyTheme();
    // Entitlement-gated customer routes. A copy older than a minute is
    // re-checked before the page renders, so a feature switched off by the
    // platform cannot stay reachable from a stale cache; the server enforces
    // the same gate on every call regardless.
    const gated = /^#\/(products|product\/)/.test(path) ? "shop" : /^#\/loyalty(\/|$)/.test(path) ? "loyalty" : null;
    if (gated) {
      if (!Features.fresh()) { try { await Features.load(Shop.slug(), window.sb, true); } catch {} }
      if (!Features.enabled(gated) || (gated==="shop" && App.settings?.show_products===false)) {go("#/home");return;}
    }
    const r=routes.find(x=>x.pat.test(path));
    Live.stop();                       // leaving a page cancels its polling
    if(!r){ UI.render(UI.backbar("غير موجود","#/home")+`<div class="content">${UI.empty("الصفحة غير موجودة","تحقق من الرابط أو ارجع للرئيسية.","الرئيسية","#/home")}</div>`); shell(false); return; }
    if(!guardOk(r.guard)){ go(Auth.isLoggedIn()?"#/home":"#/auth"); return; }
    const m=path.match(r.pat); const params={...query}; r.keys.forEach((k,i)=>params[k]=m[i+1]);
    // The bar redraws before any data is requested, so the pressed tab lights
    // up on touch instead of after the page has loaded.
    const showNav = typeof r.nav==="function" ? !!r.nav() : r.nav===true;
    shell(showNav);
    UI.beginRoute();
    try{ await r.handler(params); }
    catch(e){ console.error(e); UI.render(UI.backbar("خطأ","#/home")+`<div class="content">${UI.empty("تعذّر تحميل الصفحة",e.message||"حاول مرة أخرى")}</div>`); }
    UI.endRoute();
    shell(showNav);
    restoreScroll(path);
    window.Push?.refreshBell?.();
  }

  function go(hash){ if(current()!==hash){ location.hash=hash; } else resolve(); }
  // Swap the address without adding a history entry — used by the legacy
  // notification links so pressing back never lands on a redirect again.
  function rewrite(hash){
    if(current()===hash) return resolve();
    history.replaceState(null,"",hash);
    last=hash;
    return resolve();
  }
  function back(fb){
    let next; while(stack.length && !next){const candidate=stack.pop();if(usable(candidate))next=candidate;}
    next=next || (usable(fb)?fb:null) || parent(current());
    if(!next || next===current())return false;
    retreat=true;location.hash=next;return true;
  }
  // 2.33: leaving a page with unsaved edits asks first (swipe, Android back,
  // the header's back button). Returns true when the request was handled.
  function guardedBack(fb){
    if(!App.dirty) return back(fb);
    UI.confirm("لديك تغييرات غير محفوظة. هل تريد الخروج بدون حفظ؟", ()=>{ App.dirty=false; back(fb); }, true);
    return true;
  }
  function canGoBack(){ return started && (stack.some(usable) || !!parent(current())); }
  function nativeBack(){if(!started)return true;if(App.dirty&&!document.querySelector("#modal-root .modal-bg"))return guardedBack(); return back() || resolving; }

  // What a destination needs, warmed while the finger is still on the screen.
  // Only small, already-shared reads — never a whole salon per tile.
  function warm(hash){
    if(!window.rpcPrefetch || !Auth.isLoggedIn()) return;
    const path=parse(hash).path;
    const barber=path.match(/^#\/(?:barber|book)\/(.+)$/);
    if(barber){
      rpcPrefetch("get_barber",{p_id:barber[1]});
      rpcPrefetch("barber_services_list",{p_barber:barber[1]});
      return;
    }
    if(path==="#/products"){ rpcPrefetch("list_categories",{p_only_enabled:true}); rpcPrefetch("list_products_v2",{p_only_active:true,p_limit:16,p_offset:0}); return; }
    if(path==="#/bookings"){ rpcPrefetch("my_bookings",{p_token:App.token,p_limit:10,p_offset:0}); return; }
    if(path==="#/home"){ rpcPrefetch("list_barbers",{p_only_active:true}); }
  }

  let _delegated = false;
  function bind(){
    if(_delegated) return; _delegated = true;
    // A press starts the data before the route does, so the tap and the
    // request no longer happen one after the other.
    document.addEventListener("pointerdown", (e) => {
      const nav = e.target.closest && e.target.closest("[data-nav],[data-back]");
      if (!nav) return;
      markPress();
      const to = nav.getAttribute("data-nav");
      if (to) warm(to);
    }, {passive:true, capture:true});
    document.addEventListener("click", (e) => {
      const nav = e.target.closest && e.target.closest("[data-nav]");
      if (nav) { e.preventDefault(); go(nav.getAttribute("data-nav")); return; }
      const bk = e.target.closest && e.target.closest("[data-back]");
      if (bk) { e.preventDefault(); const f = bk.getAttribute("data-back"); guardedBack(f); }
    });
    // Unsaved edits: typing in a form of the page (not a search box, not a
    // sheet) marks the page; a saved change or a new page clears it.
    document.addEventListener("input", (e) => {
      const t = e.target;
      if (!t || !t.closest || t.closest("#modal-root") || t.type === "search" || t.closest("[data-no-dirty]")) return;
      if (t.closest(".mform, form, .card.pad-lg")) App.dirty = true;
    }, true);
    document.addEventListener("salonieer:data-changed", () => { App.dirty = false; });
  }

  async function start(){
    bind();
    window.addEventListener("hashchange",changed);
    if (location.hash.startsWith("#/platform")) history.replaceState(null, "", location.pathname + location.search);
    window.Control?.retireLegacySession();
    if (window.Platform && Platform.ensureSalon) await Platform.ensureSalon();
    try { if (window.SalonHooks) await SalonHooks.emit("routerReady", Router); } catch(e) { console.warn(e); }

    // Open on what this device already knows, then reconcile with the server.
    // A returning customer sees their salon immediately instead of a timed
    // splash followed by a chain of requests.
    const primed = Auth.primeFromCache();
    const context = Auth.loadContext();
    if (primed === "full") {
      last=current();started=true;
      if(!Push.start()) landing();
      try { await context; } catch(e) { console.warn(e); }
      resolve();                       // silently corrects the page if the server disagrees
      return;
    }

    // First time in this salon: there is nothing to show yet, so the press is
    // answered with that salon's own opening frame rather than a dead screen.
    if (primed === "partial") Pages.splash();
    try { await context; } catch(e) { console.warn(e); }
    last=current();started=true;
    if(Push.start())return;
    landing();
  }
  function landing(){
    // 2.33: an invitation link opened the app — show it first.
    if(window.Team?.pendingInvite() && location.hash!=="#/invite"){ location.hash="#/invite"; return; }
    const first=!location.hash||location.hash==="#"||location.hash==="#/splash";
    if(first) location.hash = Auth.isLoggedIn()||Auth.isGuest()?"#/home":"#/auth";
    else resolve();
  }
  return {add,go,rewrite,back,guardedBack,canGoBack,nativeBack,resolve,start,current,bind,parse,warm,signInPrompt};
})();
window.Router=Router;

/* =====================================================================
   2.33 SWIPE TO GO BACK — from the edge where the page "came from":
   the left edge in English (LTR), the right edge in Arabic and Hebrew (RTL).
   Never inside a sheet, a form field, or anything that scrolls or swipes
   sideways (calendars, day strips, chips, carousels). Unsaved edits are
   confirmed first. The header's back button and Android's system Back stay.
   ===================================================================== */
const SwipeBack=(()=>{
  const EDGE=26, GO=72;
  let sx=0, sy=0, dx=0, on=false, rtl=false, hint=null;
  const SIDEWAYS=".seg,.chips,.atabs,.admin-siblings,.sch-wday,.sch-grid,.sch-col,.sch-strip,.slot-grid,.days,.day-strip,.bk-days,.disc-filters,.carousel,.photo-editor,.schedule-editor,[data-noswipe]";
  function blocked(t){
    if(document.querySelector("#modal-root .modal-bg")||document.documentElement.classList.contains("platform-open")) return true;
    if(!t||!t.closest) return false;
    if(t.closest("input,textarea,select,[contenteditable],"+SIDEWAYS)) return true;
    for(let n=t;n&&n!==document.body&&n.nodeType===1;n=n.parentElement){
      if(n.scrollWidth>n.clientWidth+4){ const o=getComputedStyle(n).overflowX; if(o==="auto"||o==="scroll") return true; }
    }
    return false;
  }
  function paint(p){
    if(!hint){ hint=document.createElement("div"); hint.className="swipe-back-hint"; hint.setAttribute("aria-hidden","true"); hint.innerHTML=UI.icon("bwd",20); document.body.appendChild(hint); }
    hint.classList.toggle("rtl",rtl); hint.classList.toggle("ready",p>=1);
    hint.style.opacity=String(Math.min(1,p*1.2)); hint.style.setProperty("--p",String(Math.min(1,p)));
  }
  function clear(){ on=false; dx=0; if(hint){ hint.style.opacity="0"; hint.classList.remove("ready"); } }
  document.addEventListener("touchstart",(e)=>{
    if(e.touches.length!==1) return;
    rtl=document.documentElement.dir==="rtl";
    const x=e.touches[0].clientX, fromEdge=rtl?window.innerWidth-x:x;
    if(fromEdge>EDGE||blocked(e.target)||!Router.canGoBack()) return;
    on=true; sx=x; sy=e.touches[0].clientY; dx=0;
  },{passive:true});
  document.addEventListener("touchmove",(e)=>{
    if(!on) return;
    const d=(e.touches[0].clientX-sx)*(rtl?-1:1), v=Math.abs(e.touches[0].clientY-sy);
    if(v>40&&v>d){ clear(); return; }   // a vertical scroll, not a swipe
    dx=d; if(d>10) paint(d/GO);
  },{passive:true});
  document.addEventListener("touchend",()=>{ if(!on) return; const go=dx>=GO; clear(); if(go) Router.guardedBack(); },{passive:true});
  document.addEventListener("touchcancel",clear,{passive:true});
  return {};
})();

// =====================================================================
//  SHELL PAGES
// =====================================================================
const Pages=(()=>{
  function splash(){
    const s=App.settings||{};
    document.getElementById("view").innerHTML=`<div class="splash">
      ${UI.logoImg("","شعار "+(s.app_name||"العمل"),{size:108})}
      <h1>${UI.esc(s.app_name||"METON")}</h1>
      <div class="rib"></div>
      <div class="spinner"></div></div>`;
    document.getElementById("view").classList.add("no-nav");
    document.getElementById("navhost").innerHTML="";
  }

  function editName(){
    UI.modal(`<h3>تعديل الاسم</h3><div class="mform">
      <div class="field"><label>الاسم</label><input id="nm" class="input" value="${UI.esc(App.user.name||"")}"></div>
      <button class="btn" id="save">حفظ</button></div>`);
    document.getElementById("save").onclick=async()=>{
      UI.busy("save",true);
      try{ await rpc("me_update_profile",{p_token:App.token,p_name:document.getElementById("nm").value.trim()});
        Auth.updateName(document.getElementById("nm").value.trim()); UI.closeModal(); UI.toast("تم الحفظ","ok"); Router.resolve(); }
      catch(e){ UI.toast(e.message,"err"); UI.busy("save",false); }
    };
  }
  function changePassword(){
    UI.modal(`<h3>تغيير كلمة المرور</h3><div class="mform">
      <div class="field"><label>كلمة المرور الحالية</label><input id="o" class="input" type="password"></div>
      <div class="field"><label>كلمة المرور الجديدة</label><input id="n" class="input" type="password"></div>
      <div id="e" class="form-error"></div>
      <button class="btn" id="save">تغيير</button></div>`);
    document.getElementById("save").onclick=async()=>{
      const o=document.getElementById("o").value,n=document.getElementById("n").value;
      const e=document.getElementById("e"); e.textContent="";
      UI.busy("save",true);
      try{ await rpc("auth_change_password",{p_token:App.token,p_old:o,p_new:n}); UI.closeModal(); UI.toast("تم تغيير كلمة المرور","ok"); }
      catch(err){ e.textContent=err.message; UI.busy("save",false); }
    };
  }

  async function notifications(){
    const PAGE=10; let page=0; let rows=[]; let hasNext=false;
    async function load(){
      rows=await rpc("my_notifications",{p_token:App.token,p_limit:PAGE,p_offset:page*PAGE});
      hasNext=rows.length===PAGE;
    }
    await load();
    try{ await rpc("mark_notifications_read",{p_token:App.token}); App.unread=0; }catch{}

    function statusLine(s){
      return `<div class="tiny" style="margin-top:8px">الحالة: ${UI.badge(s)}</div>`;
    }
    function card(n){
      const isReq = n.type==="booking_request";
      const pending = n.booking_status==="pending";
      const actions = (isReq && pending)
        ? `<div class="request-actions" data-actions="${n.booking_id}">
             <button class="btn sm ok" data-ok="${n.booking_id}">${UI.icon("check",15)} تأكيد الموعد</button>
             <button class="btn sm line danger-line" data-no="${n.booking_id}">${UI.icon("x",15)} رفض</button>
             <button class="btn sm ghost" data-nav="#/booking/${UI.esc(n.booking_id)}">تفاصيل الحجز</button>
           </div>`
        : (isReq && n.booking_status ? statusLine(n.booking_status) : "");
      return `<div class="card" data-card="${n.booking_id||""}">
        <div class="row between" style="gap:10px"><b style="font-size:14.5px;min-width:0;overflow-wrap:break-word">${UI.esc(n.title)}</b>
        <time class="tiny" style="flex:0 0 auto;white-space:nowrap" data-smart-ago="${UI.esc(n.created_at)}" title="${UI.esc(new Date(n.created_at).toLocaleString(Lang.locale()))}">${UI.esc(Smart.ago(n.created_at))}</time></div>
        ${n.body?`<p class="muted" style="margin:6px 0 0;overflow-wrap:break-word">${UI.esc(n.body)}</p>`:""}
        ${actions}</div>`;
    }
    function paint(){
      UI.render(`${UI.header({title:"طلبات الحجز",back:"#/notifications"})}
        <div class="content">${
          !rows.length?UI.empty("لا توجد طلبات", page>0?"لا مزيد من الطلبات.":"ستظهر هنا طلبات الحجز الواردة.")
          :`<div class="list cols">${rows.map(card).join("")}</div>`
        }${UI.pager(page,hasNext)}
        <p class="tiny" style="text-align:center">تُحذف الطلبات تلقائياً بعد ٣ أيام.</p></div>`);
      UI.wirePager(
        async()=>{ if(page>0){ page--; await load(); paint(); } },
        async()=>{ if(hasNext){ page++; await load(); paint(); } });
      document.querySelectorAll("[data-ok]").forEach(b=>b.onclick=()=>act(b.getAttribute("data-ok"),"confirmed"));
      document.querySelectorAll("[data-no]").forEach(b=>b.onclick=()=>act(b.getAttribute("data-no"),"cancelled"));
    }
    async function act(id,status){
      const box=document.querySelector(`[data-actions="${id}"]`);
      if(box) box.querySelectorAll("button").forEach(b=>b.disabled=true);
      try{
        await rpc("barber_set_booking_status",{p_token:App.token,p_id:id,p_status:status});
        const n=rows.find(x=>x.booking_id===id); if(n) n.booking_status=status;
        // swap the buttons for a status line, in place — no full re-render
        if(box) box.outerHTML=statusLine(status);
        UI.toast(status==="confirmed"?"تم تأكيد الحجز":"تم رفض الحجز","ok");
      }catch(e){
        if(box) box.querySelectorAll("button").forEach(b=>b.disabled=false);
        UI.toast(e.message,"err");
      }
    }
    paint();
    // new booking requests arrive without the barber refreshing
    let nsig = JSON.stringify(rows.map(n=>[n.id,n.booking_status]));
    Live.start(async ()=>{
      const fresh = await rpc("my_notifications",{p_token:App.token,p_limit:PAGE,p_offset:page*PAGE});
      const f = JSON.stringify(fresh.map(n=>[n.id,n.booking_status]));
      if(f===nsig) return;
      nsig=f; rows=fresh; hasNext=fresh.length===PAGE;
      try{ await rpc("mark_notifications_read",{p_token:App.token}); App.unread=0; }catch{}
      paint();
    },10000);
  }

  // About, terms and privacy were three pages with one paragraph each. They
  // are one page now, with a section per text the salon actually filled in.
  function infoPage(){
    const s=App.settings||{};
    const sections=[["about_text","عن التطبيق"],["terms_text","الشروط والأحكام"],["privacy_text","سياسة الخصوصية"]]
      .filter(([field])=>String(s[field]||"").trim());
    UI.render(`${UI.header({title:"معلومات التطبيق",back:"#/settings"})}
      <div class="content"><div class="center-col">${
        sections.length
          ? sections.map(([field,title],i)=>UI.collapsible(`<b>${UI.esc(title)}</b>`,
              `<p style="white-space:pre-wrap;line-height:1.95;margin:0">${UI.esc(s[field])}</p>`, i===0)).join("")
          : UI.empty("لا يوجد محتوى","يمكن للإدارة إضافة هذه النصوص من لوحة التحكم.")
      }</div></div>`);
  }

  function privacyPage(){
    const copy = {
      ar: ["سياسة الخصوصية", "نستخدم الاسم ورقم الهاتف وبيانات الحجز لتقديم خدمات العمل. نحتفظ بكلمة المرور بشكل تجزئة آمنة ولا نعرضها لأحد.", "إذا فعّلت الإشعارات، نستخدم رمز الجهاز لإرسال تأكيدات الحجوزات وتذكيراتها عبر خدمات Apple أو Google. يمكنك رفض الإذن ويظل التطبيق قابلاً للاستخدام.", "تُخزن بيانات الحساب والحجز في Supabase. يمكنك حذف حسابك وبياناتك الشخصية من الإعدادات؛ قد نحتفظ بسجلات حجوزات مجهولة للالتزامات التجارية."],
      en: ["Privacy Policy", "We use your name, phone number, and booking details to provide the services you book. Passwords are stored as secure hashes and are never shown to other users.", "If you enable notifications, we use a device token to send booking confirmations and reminders through Apple or Google. You can decline and continue using the app.", "Account and booking data are stored with Supabase. You can delete your account and personal data in Settings; anonymized booking records may be retained for business obligations."],
      he: ["מדיניות פרטיות", "אנו משתמשים בשם, במספר הטלפון ובפרטי ההזמנה כדי לספק שירותי עסק. סיסמאות נשמרות כגיבוב מאובטח ואינן מוצגות לאחרים.", "אם הפעלתם התראות, נשתמש באסימון המכשיר לשליחת אישורים ותזכורות דרך Apple או Google. אפשר לסרב ולהמשיך להשתמש ביישום.", "נתוני החשבון וההזמנות מאוחסנים ב-Supabase. אפשר למחוק את החשבון והנתונים האישיים בהגדרות; רשומות הזמנה אנונימיות עשויות להישמר לצרכים עסקיים."]
    }[Lang.get()];
    UI.render(`${UI.header({title:copy[0],back:Auth.isLoggedIn()?"#/settings":"#/auth"})}<div class="content"><div class="center-col"><div class="card pad-lg">${copy.slice(1).map(p=>`<p>${UI.esc(p)}</p>`).join("")}
      <p><a href="mailto:salonieer1st@gmail.com">salonieer1st@gmail.com</a></p></div></div></div>`);
  }

  function contact(){
    const s=App.settings||{};
    const rows=[];
    // 2.47: the business's public contact numbers (none, one or several; WhatsApp where marked). Older businesses: the two fields.
    const nums=Array.isArray(s.contact_numbers)?s.contact_numbers:null;
    if(nums&&nums.length){
      nums.forEach(n=>{const v=String(n.number||"");if(!v)return;
        rows.push({i:"phone",l:n.label||"اتصل بنا",v,href:"tel:"+v.replace(/[^+0-9]/g,"")});
        if(n.whatsapp) rows.push({i:"whatsapp",l:n.label?`${Lang.t("واتساب")} · ${n.label}`:"واتساب",v,href:"https://wa.me/"+v.replace(/[^0-9]/g,"")});});
    }else{
      if(s.contact_phone) rows.push({i:"phone",l:"اتصل بنا",v:s.contact_phone,href:"tel:"+s.contact_phone});
      if(s.whatsapp_number) rows.push({i:"whatsapp",l:"واتساب",v:s.whatsapp_number,href:"https://wa.me/"+s.whatsapp_number.replace(/[^0-9]/g,"")});
    }
    if(s.address) rows.push({i:"pin",l:"العنوان",v:s.address});
    const social=s.social_links||{};
    UI.render(`${UI.header({title:"الدعم والتواصل",back:"#/settings"})}
      <div class="content"><div class="center-col">
        ${rows.length?`<div class="list">${rows.map(r=>
          `${r.href?`<a class="lrow" href="${UI.esc(r.href)}" target="_blank" rel="noopener" style="text-decoration:none;color:inherit">`:`<div class="lrow">`}
            <div class="ic">${UI.icon(r.i,18)}</div><div class="t">${r.l}<div class="tiny" dir="ltr">${UI.esc(r.v)}</div></div>
          ${r.href?`</a>`:`</div>`}`).join("")}</div>`:""}
        ${Auth.isLoggedIn()?`<div class="card pad-lg"><div class="section-title" style="margin-bottom:12px">أرسل رسالة</div>
          <div class="field"><textarea id="msg" class="textarea" placeholder="اكتب رسالتك هنا..."></textarea></div>
          <button class="btn" id="send" style="margin-top:12px">إرسال</button></div>`:""}
        ${Object.values(social).some(Boolean)?`<div class="card"><div class="section-title" style="margin-bottom:10px">تابعنا</div>
          <div class="row wrap">${Object.entries(social).filter(([,v])=>v).map(([k,v])=>
            `<a class="btn line sm" href="${UI.esc(v)}" target="_blank" rel="noopener">${UI.esc(k)}</a>`).join("")}</div></div>`:""}
      </div></div>`);
    if (Auth.isLoggedIn()) document.getElementById("send").onclick=async()=>{
      const m=document.getElementById("msg").value.trim();
      UI.busy("send",true);
      try{ await rpc("send_support_message",{p_token:App.token,p_message:m}); document.getElementById("msg").value=""; UI.toast("تم إرسال رسالتك","ok"); }
      catch(e){ UI.toast(e.message,"err"); }
      finally{ UI.busy("send",false); }
    };
  }

  return {splash,notifications,infoPage,privacyPage,contact,editName,changePassword};
})();
window.Pages=Pages;

// =====================================================================
//  ROUTES
// =====================================================================
Router.add("#/splash", Pages.splash, {nav:false});
// 2.30: one Salonieer account (phone + password) for every salon. A salon on
// its own server keeps its own sign-in (the previous per-salon pages).
const ownServer = () => !!Platform.current()?.supabase_url;
Router.add("#/auth", p => ownServer() ? AuthPages.phonePage(p) : Account.inSalon("login"), {nav:false});
Router.add("#/register", p => ownServer() ? AuthPages.registerPage(p) : Account.inSalon("register"), {nav:false});
Router.add("#/create-password", p => ownServer() ? AuthPages.createPasswordPage(p) : Router.rewrite("#/auth"), {nav:false});
Router.add("#/password", p => ownServer() ? AuthPages.passwordPage(p) : Router.rewrite("#/auth"), {nav:false});

Router.add("#/home", BookingPages.home, {nav:true, guard:"browse"});
Router.add("#/service/:id", BookingPages.servicePick, {nav:true, guard:"browse"});
Router.add("#/barber/:id", BookingPages.barberProfile, {nav:true, guard:"browse"});
Router.add("#/book/:id", BookingPages.bookingPage, {nav:true, guard:"browse"});
Router.add("#/bookings", BookingPages.myBookings, {nav:true, guard:"auth"});
// One booking-details page. #/reservation/:id is the address push
// notifications were built against, so it is kept as a redirect rather than a
// second implementation of the same screen.
Router.add("#/booking/:id", p => ReservationPage.open(p), {nav:true, guard:"auth"});
Router.add("#/reservation/:id", p => Router.rewrite("#/booking/" + encodeURIComponent(p.id)), {nav:true, guard:"auth"});
Router.add("#/products", BookingPages.products, {nav:true, guard:"browse"});
Router.add("#/product/:id", BookingPages.productDetails, {nav:true, guard:"browse"});
Router.add("#/loyalty", p => Loyalty.wallet(p), {nav:true, guard:"auth"});

Router.add("#/settings", SettingsPages.menu, {nav:true, guard:"auth"});
// Salon switching belongs to Account, so it keeps the bar while signed in.
Router.add("#/salons", () => Platform.managePage(), {nav:()=>Auth.isLoggedIn()});
// 2.33: a team invitation (link or code INV-…) waiting to be accepted.
Router.add("#/invite", () => Team.invitePage(), {nav:false});
Router.add("#/notifications", () => Push.inbox(), {nav:true, guard:"auth"});
// Booking requests a specialist can act on live in their own dashboard; this
// stays addressable for them and is no longer a second customer inbox.
Router.add("#/notifications/history", Pages.notifications, {nav:true, guard:"auth"});
Router.add("#/contact", Pages.contact, {nav:true, guard:"browse"});
Router.add("#/report-problem", () => window.ReportProblem ? ReportProblem.page() : Router.go("#/settings"), {guard:"owner"});
Router.add("#/about", Pages.infoPage, {nav:true, guard:"browse"});
// Both used to be a page of their own with a single paragraph on it.
Router.add("#/terms", ()=>Router.rewrite("#/about"), {nav:true, guard:"browse"});
Router.add("#/privacy", Pages.privacyPage, {nav:()=>Auth.isLoggedIn()||Auth.isGuest()});
Router.add("#/profile", ()=>Router.rewrite("#/settings"), {nav:true, guard:"auth"});

Router.add("#/admin", Admin.dashboard, {nav:true, guard:"admin"});
Router.add("#/admin/:tab", Admin.dashboard, {nav:true, guard:"admin"});
Router.add("#/barber-dash", BarberDash.dashboard, {nav:true, guard:"auth"});
Router.add("#/barber-dash/:tab", BarberDash.dashboard, {nav:true, guard:"auth"});

// =====================================================================
//  BOOT
// =====================================================================
window.Business?.register(Router);
window.Workforce?.register(Router);
window.Rework?.register(Router);
// When the server's entitlements change (platform switched a feature, an
// add-on expired) the current screen is re-evaluated, so navigation and gated
// pages never keep showing a feature that is no longer available.
Features.onChange(()=>{ if(!document.querySelector("#modal-root .modal-bg")) Router.resolve(); });
// A language change redraws the very screen the person is on — same route,
// same salon, same scroll position — behind Lang's short loading veil.
Lang.onChange(async()=>{
  UI.closeModal();
  if(window.Platform?.redrawGate?.()) return;
  const y=UI.scrollTop();
  await Router.resolve();
  UI.scrollTo(y);
  window.Push?.sync?.(true).catch(()=>{});
});
Router.start().catch(error => { console.error(error); UI.render(UI.empty("تعذّر بدء التطبيق", error.message)); });
// 2.27: native apps compare their version with the store versions set on the website.
setTimeout(() => window.Rework?.updateCheck().catch?.(() => {}), 1500);
