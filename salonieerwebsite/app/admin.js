// =====================================================================
//  admin.js — in-app admin dashboard (admin role only)
//  Tabs: home · insights · bookings · barbers · services · categories
//        · products · business (2.25) · users · support · settings
// =====================================================================
const Admin = (() => {
  const tok = () => window.Control?.target() ? "__platform__" : App.token;
  const navBase = () => window.Control?.target() ? "#/platform/salon/" + Control.target().slug : "#/admin";

  // Every page of the salon dashboard. The ids are the routes (#/admin/<id>),
  // unchanged, so old links and notification taps keep working.
  const BIZ = id => window.Business?.SECTIONS.find(x => x.id === id);
  const bizPage = (id, d) => { const s = BIZ(id); return s ? { id: "biz-" + id, l: s.l, i: s.i, d: d || s.d, feature: s.feature, business: !s.feature } : null; };
  const TABS = [
    { id: "home", l: "لوحة العمل", i: "home", d: "ملخص اليوم والأقسام" },
    // 2.33: one place for every decision waiting for the salon.
    { id: "requests", l: "الطلبات", i: "bell", d: "طلبات الانضمام والدعوات المقبولة والإجازات" },
    { id: "insights", l: "الإحصائيات", i: "chart", feature: "analytics", d: "الحجوزات والإيرادات عبر الزمن" },
    { id: "bookings", l: "كل الحجوزات", i: "calendar", d: "بحث وتصفية وتغيير حالة الحجوزات" },
    // 2.33: the team (Manager / Specialist / Other) — same address as before.
    { id: "barbers", l: "أعضاء الفريق", i: "users", d: "الأعضاء والأدوار والدعوات وأوقات العمل" },
    { id: "schedule", l: "الجدول", i: "calendar", d: "مواعيد اليوم والأسبوع لكل المختصين" },
    { id: "services", l: "الخدمات", i: "scissors", d: "الأسعار والمدة" },
    { id: "categories", l: "فئات المنتجات", i: "tag", feature: "shop", d: "تصنيف المنتجات في المتجر" },
    { id: "products", l: "المنتجات", i: "bag", feature: "shop", d: "منتجات المتجر وأسعارها" },
    { id: "loyalty", l: "نقاط الولاء", i: "star", feature: "loyalty", d: "الإعدادات وأسعار النقاط والمكافآت" },
    { id: "redemptions", l: "طلبات الاستبدال", i: "bag", feature: "loyalty", d: "مكافآت بانتظار التسليم" },
    { id: "users", l: "العملاء", i: "user", d: "العملاء والحسابات والإشعارات الفردية" },
    { id: "support", l: "رسائل الدعم", i: "chat", d: "رسائل العملاء للعمل" },
    { id: "notifications", l: "الإشعارات", i: "bell", d: "الإعلانات وإعدادات التنبيهات" },
    { id: "settings", l: "الإعدادات العامة", i: "cog", d: "الهوية وسياسة الحجز والظهور في الاكتشاف" },
    { id: "permissions", l: "الصلاحيات", i: "lock", d: "ما يستطيع كل عضو في الفريق إدارته" },
    { id: "audit", l: "سجل الإجراءات", i: "list", d: "من غيّر ماذا ومتى: الحجوزات والفريق والعملاء" },
    { id: "help", l: "المساعدة والأسئلة", i: "info", d: "إجابات وفيديوهات من METON" },
    // 2.25 hub, kept as an address: it now opens the Sales & checkout group.
    { id: "business", l: "الأعمال", i: "money", business: true, hidden: true },
    // 2.33: the old business "team permissions" page is now Salon settings → Permissions.
    ...["checkout", "cash", "deposits", "coupons", "payments", "finance", "earnings", "audit", "inventory", "commissions", "attendance", "packages", "waitlist", "retention"].map(id => bizPage(id)).filter(Boolean),
  ];
  // 2.33: what a team member needs to see each page (owners see everything).
  // The server enforces the same permissions on every call.
  // 2.34: the whole team's schedule has its own permission ("schedule_all");
  // the cash drawer too ("cash_close"), without opening any other money page.
  const TAB_PERM = { home: "staff", requests: "staff", help: "staff", schedule: "schedule_all", insights: "statistics", bookings: "bookings_view", "biz-cash": "cash_close",
    services: "services", categories: "inventory", products: "inventory", redemptions: "marketing", users: "clients_view", support: "support",
    notifications: "notifications", audit: "audit", "biz-checkout": "checkout", "biz-deposits": "deposits", "biz-coupons": "marketing",
    "biz-finance": "finance", "biz-earnings": "finance", "biz-audit": "audit", "biz-inventory": "inventory", "biz-commissions": "finance",
    "biz-attendance": "attendance", "biz-packages": "services", "biz-waitlist": "bookings_view", "biz-retention": "marketing" };
  const owner = () => !!Control.target() || Auth.isAdmin();
  const allowed = t => owner() || (TAB_PERM[t.id] && Auth.can(TAB_PERM[t.id]));

  // The dashboard is organised the way a salon owner thinks about it. Every
  // page belongs to exactly one group; a group with nothing enabled for this
  // salon is not shown.
  const GROUPS = [
    { id: "overview", l: "نظرة عامة", i: "home", d: "لوحة العمل والطلبات والجدول والإحصائيات", items: ["home", "requests", "schedule", "insights"] },
    { id: "bookings", l: "الحجوزات والمواعيد", i: "calendar", d: "كل الحجوزات وقائمة الانتظار", items: ["bookings", "biz-waitlist"] },
    { id: "customers", l: "العملاء", i: "user", d: "العملاء ورسائل الدعم واستعادة العملاء", items: ["users", "support", "biz-retention"] },
    { id: "team", l: "الفريق", i: "users", d: "الأعضاء والأدوار والدعوات والعمولات والحضور", items: ["barbers", "biz-commissions", "biz-attendance"] },
    { id: "services", l: "الخدمات والباقات", lPart: "الخدمات", i: "scissors", d: "الخدمات وباقات الجلسات", items: ["services", "biz-packages"] },
    { id: "sales", l: "الدفع والمبيعات", i: "money", d: "إتمام الزيارات والبيع المباشر وصندوق النقد والعربون والكوبونات", items: ["biz-checkout", "biz-cash", "biz-deposits", "biz-coupons", "biz-payments"] },
    { id: "finance", l: "المالية والتقارير", i: "chart", d: "الإيرادات والمصاريف وأرباح الموظفين والتصدير وسجل العمليات", items: ["biz-finance", "biz-earnings", "biz-audit"] },
    { id: "products", l: "المنتجات والمخزون", lPart: "المنتجات", i: "bag", d: "المنتجات وفئاتها والمخزون", items: ["products", "categories", "biz-inventory"] },
    { id: "marketing", l: "التسويق والولاء", lPart: "التسويق والإشعارات", i: "star", d: "نقاط الولاء والإشعارات", items: ["loyalty", "redemptions", "notifications"] },
    { id: "salon", l: "إعدادات العمل", i: "cog", d: "الإعدادات العامة والصلاحيات وسجل الإجراءات", items: ["settings", "permissions", "audit", "help"] },
  ];
  const groupOf = tab => GROUPS.find(g => g.items.includes(tab)) || (tab === "business" ? GROUPS.find(g => g.id === "sales") : GROUPS[0]);
  const visibleTabs = () => TABS.filter(t => (t.business ? !!window.Business?.available() && (!t.feature || Features.enabled(t.feature))
    : !t.feature || Features.enabled(t.feature)) && allowed(t));
  // 2.41: a group shows only what this salon's plan (and this person's permissions) include. When part of it is
  // hidden, its title and summary name only what is left — a Basic salon never reads about stock, packages or
  // the waitlist it does not have.
  function visibleGroups(tabs) {
    const ids = new Set(tabs.map(t => t.id));
    const sep = Lang.get() === "ar" ? "، " : ", ";
    return GROUPS.map(g => {
      const list = g.items.filter(id => ids.has(id)).map(id => tabs.find(t => t.id === id));
      const whole = list.length === g.items.length;
      return { ...g, list, l: whole || !g.lPart ? g.l : g.lPart, d: whole ? g.d : list.map(t => Lang.t(t.l)).join(sep) };
    }).filter(g => g.list.length);
  }

  // ---- form helpers ---------------------------------------------------
  const E = (s) => UI.esc(s);
  function field(label, inner) { const id = /id="([^"]+)"/.exec(inner)?.[1]; return `<div class="field"><label ${id ? `for="${E(id)}"` : ""}>${label}</label>${inner}</div>`; }
  function input(id, val, opts = {}) {
    return `<input id="${id}" class="input" value="${E(val ?? "")}"
      ${opts.type ? `type="${opts.type}"` : ""} ${opts.ph ? `placeholder="${E(opts.ph)}"` : ""}
      ${opts.dir ? `dir="${opts.dir}"` : ""}>`;
  }
  function textarea(id, val) { return `<textarea id="${id}" class="textarea">${E(val ?? "")}</textarea>`; }
  function colorField(label, id, val, fallback) {
    const v = /^#[0-9a-f]{6}$/i.test(val || "") ? val : fallback;
    return `<div class="field"><label>${label}</label>
      <div class="row" style="gap:8px">
        <input id="${id}-c" type="color" value="${E(v)}" style="width:52px;height:46px;padding:4px;border:1.5px solid var(--line);border-radius:12px;background:var(--field);cursor:pointer">
        <input id="${id}" class="input" dir="ltr" value="${E(val ?? v)}" style="flex:1">
      </div></div>`;
  }
  function wireColor(id) {
    const c = document.getElementById(id + "-c"), t = document.getElementById(id);
    if (!c || !t) return;
    c.oninput = () => { t.value = c.value; };
    t.oninput = () => { if (/^#[0-9a-f]{6}$/i.test(t.value)) c.value = t.value; };
  }
  function imageField(label, id, val) {
    return `<div class="field"><label for="${id}">${label}</label>
      <div class="row" style="gap:8px">
        <input id="${id}" class="input" dir="ltr" value="${E(val ?? "")}" placeholder="رابط الصورة أو اختر من الجهاز" style="flex:1">
        <button type="button" class="btn line sm" id="${id}-pick" style="white-space:nowrap">${UI.icon("image", 16)} صورة</button>
      </div>
      <div id="${id}-prev" style="margin-top:8px">${val ? `<img src="${E(val)}" class="img-prev">` : ""}</div>
    </div>`;
  }
  function wireImage(id, mode) {
    const btn = document.getElementById(id + "-pick"); if (!btn) return;
    btn.onclick = () => UI.pickImage(url => {
      const inp = document.getElementById(id); inp.value = url;
      document.getElementById(id + "-prev").innerHTML = `<img src="${url}" class="img-prev">`;
    }, {mode});
  }
  function selectBox(id, options, val) {
    return `<select id="${id}" class="select">${options.map(o =>
      `<option value="${E(o.v)}" ${String(o.v) === String(val ?? "") ? "selected" : ""}>${E(o.l)}</option>`
    ).join("")}</select>`;
  }
  function switchRow(id, label, on) {
    return `<div class="lrow" style="cursor:default">
      <div class="t">${label}</div>
      <label class="switch"><input type="checkbox" id="${id}" ${on ? "checked" : ""}>
      <span class="track"></span><span class="thumb"></span></label></div>`;
  }
  const val = (id) => { const el = document.getElementById(id); return el ? el.value.trim() : ""; };
  // 2.32: page reads come from a short-lived cache, so going back to a page is
  // instant. Any change made in the app drops the cache (supabase.js), and the
  // pages that poll keep asking the server directly.
  const read = (fn, args) => rpcCached(fn, args, 20000);
  const numv = (id) => { const v = val(id); return v === "" ? null : Number(v); };
  const chk = (id) => { const el = document.getElementById(id); return el ? el.checked : false; };

  async function guardedSave(fn, btnId, okMsg, after) {
    UI.busy(btnId, true);
    try { const r = await fn(); UI.closeModal(); if (okMsg) UI.toast(okMsg, "ok"); if (after) await after(r); if (r?.temporary_password) Control.showCredential(r); }
    catch (e) { UI.toast(e.message, "err"); UI.busy(btnId, false); }
  }

  // ===================================================================
  //  SHELL
  // ===================================================================
  async function dashboard(params) {
    // 2.33: owners, and team members the owner gave at least one permission.
    // A member's permissions are re-read here (cached a few seconds), so a
    // change by the owner shows without restarting the app.
    if (!Control.target() && !Auth.isAdmin() && App.token) {
      try { const t = await rpcCached("team_me", { p_token: App.token }, 8000); if (t && typeof t === "object") App.team = t; } catch {}
    }
    if (!Control.target() && !Auth.isStaff()) { Router.go("#/home"); return; }
    // Entitlements decide which sections exist. A stale local copy is refreshed
    // before painting; the server rejects disabled features regardless.
    const slug = Control.target()?.slug || Shop.slug();
    // 2.32: a known copy paints the page now and is re-checked underneath (the
    // server enforces every feature anyway); only a first visit waits for it.
    const featureClient = Control.target() ? Control.client() : window.sb;
    if (!Features.ready(slug)) { try { await Features.load(slug, featureClient, true); } catch {} }
    else if (!Features.fresh(slug)) Features.load(slug, featureClient, true).catch(() => {});
    const tabs = visibleTabs(), groups = visibleGroups(tabs);
    // 2.40.1: no section at all — the salon session ended (e.g. Salonieer support reset the password) or this person
    // has no permission. A way back instead of a broken page; the next start signs in again.
    if (!groups.length) {
      UI.render(UI.backbar("لوحة العمل", "#/settings") + `<div class="content">${UI.empty("لا توجد أقسام متاحة", "سجّل الدخول من جديد أو اطلب الصلاحية من مالك العمل.", "حسابي", "#/settings")}</div>`);
      return;
    }
    // Old addresses of removed pages (2.32): Daily Management opens the schedule.
    const asked = { daybook: "schedule", gallery: "home" }[params?.tab] || String(params?.tab || "home");
    // #/admin/g-<group> is a group's own page; #/admin/business (2.25) opens Sales.
    const groupPage = asked.startsWith("g-") && groups.some(g => g.id === asked.slice(2)) ? asked.slice(2)
      : asked === "business" && groups.some(g => g.id === "sales") ? "sales" : null;
    const tab = groupPage ? null : tabs.some(t => t.id === asked && !t.hidden) ? asked : "home";
    const group = groupPage ? groups.find(g => g.id === groupPage) : groups.find(g => g.list.some(t => t.id === tab)) || groups[0];
    const page = tab ? tabs.find(t => t.id === tab) : null;
    const salonName = Control.target()?.name || App.settings?.app_name || "METON";
    // Back: a page → its group, a group → the dashboard, the dashboard → where we came from.
    const back = tab === "home" ? (Control.target() ? "#/platform" : "#/settings") : groupPage ? navBase() + "/home" : navBase() + "/g-" + group.id;
    const title = page ? page.l : group.l;
    const crumbs = tab === "home" ? "" : `<nav class="admin-crumbs" aria-label="${E(Lang.t("مسار الصفحة"))}"><a href="${navBase()}/home" data-nav="${navBase()}/home">${E(Lang.t("لوحة العمل"))}</a>${UI.icon("chev", 12)}${page
      ? `<a href="${navBase()}/g-${group.id}" data-nav="${navBase()}/g-${group.id}">${E(Lang.t(group.l))}</a>${UI.icon("chev", 12)}<b aria-current="page">${E(Lang.t(page.l))}</b>`
      : `<b aria-current="page">${E(Lang.t(group.l))}</b>`}</nav>`;
    const isOn = id => id === tab;
    const sidebar = `<aside class="admin-side" aria-label="${E(Lang.t("أقسام الإدارة"))}">${groups.map(g => `<section class="admin-side-group ${g.id === group.id ? "open" : ""}">
        <button class="admin-side-head ${groupPage === g.id ? "active" : ""}" data-nav="${navBase()}/g-${g.id}" ${groupPage === g.id ? 'aria-current="page"' : ""}>${UI.icon(g.i, 16)}<span>${E(Lang.t(g.l))}</span></button>
        <div class="admin-side-items">${g.list.map(t => `<button class="admin-side-item ${isOn(t.id) ? "active" : ""}" data-nav="${navBase()}/${t.id}" ${isOn(t.id) ? 'aria-current="page"' : ""}>${E(Lang.t(t.l))}</button>`).join("")}</div></section>`).join("")}</aside>`;
    // Pages of the same group, one tap apart (phones and tablets).
    const siblings = group.list.length > 1 || groupPage ? `<div class="admin-siblings atabs" role="tablist">${group.list.map(t => `<button class="atab ${isOn(t.id) ? "active" : ""}" data-nav="${navBase()}/${t.id}" ${isOn(t.id) ? 'aria-current="page"' : ""}>${UI.icon(t.i, 15)}<span>${E(Lang.t(t.l))}</span></button>`).join("")}</div>` : "";
    document.documentElement.classList.add("admin-studio");
    UI.render(`<div class="admin-shell admin-nav2">
      <header class="admin-chrome"><button class="admin-back" data-back="${back}" aria-label="رجوع">${UI.icon("back",19)}</button><div class="admin-brand">${UI.logoImg("","شعار "+salonName,{size:38})}<div><b>${E(salonName)}</b><small>BUSINESS MANAGEMENT STUDIO</small></div></div><div class="admin-current"><span>${E(Lang.t(group.l))}</span><strong>${E(Lang.t(title))}</strong></div><div class="admin-chrome-actions">${Control.target() ? "" : (window.Push?.bellButton?.() || "")}<button class="iconbtn admin-menu-btn" id="admin-menu" aria-haspopup="dialog" aria-label="${E(Lang.t("كل الأقسام"))}">${UI.icon("grid",18)}<span>${E(Lang.t("الأقسام"))}</span></button></div></header>
      <div class="admin-frame">${sidebar}
      <div class="content wide admin-content">
        ${crumbs}
        ${tab === "home" ? "" : `<div class="admin-page-head"><h1>${E(Lang.t(title))}</h1>${page?.d ? `<p>${E(Lang.t(page.d))}</p>` : groupPage ? `<p>${E(Lang.t(group.d))}</p>` : ""}</div>`}
        ${tab === "home" ? "" : siblings}
        <div id="adminbody">${UI.loading()}</div>
      </div></div></div>`);
    document.getElementById("admin-menu").onclick = () => sectionsSheet(groups, tab, groupPage);
    paintRequestBadge();
    const at = document.querySelector(".admin-siblings .atab.active"); if (at) at.scrollIntoView({ inline: "center", block: "nearest" });
    const body = document.getElementById("adminbody");
    try {
      if (groupPage) groupLanding(body, group);
      else await RENDER[tab](body);
    }
    catch (e) { body.innerHTML = `<div class="card">${E(e.message)}</div>`; }
    maybeSetup();
  }

  // ===================================================================
  //  2.34: ONE-TIME SETUP of a new salon (owners). Two choices and the
  //  salon's link; both stay editable in Salon settings. Salons that existed
  //  before 2.34 never see it.
  // ===================================================================
  async function maybeSetup() {
    if (Control.target() || !Auth.isAdmin()) return;
    const k = "salonieer:setup-checked:" + Shop.slug();
    try { if (sessionStorage.getItem(k)) return; } catch {}
    let s; try { s = await rpc("admin_setup_state", { p_token: tok() }); } catch { return; }
    try { sessionStorage.setItem(k, "1"); } catch {}
    if (s?.needed) setupSheet(s);
  }
  function linkBox(link, id) {
    return link ? `<div class="salon-link" id="${id}"><div class="salon-link-url" dir="ltr" data-i18n-skip>${E(link.url)}</div>
      <div class="btn-row"><button type="button" class="btn line sm" data-link-copy>${UI.icon("list", 15)} ${E(Lang.t("نسخ الرابط"))}</button>
      <button type="button" class="btn line sm" data-link-share>${UI.icon("chat", 15)} ${E(Lang.t("مشاركة"))}</button></div></div>` : "";
  }
  function wireLink(root, link) {
    if (!root || !link) return;
    const copy = async () => {
      try { await navigator.clipboard.writeText(link.url); UI.toast(Lang.t("تم نسخ الرابط"), "ok"); }
      catch { try { await NativeBridge.request("copy", link.url); UI.toast(Lang.t("تم نسخ الرابط"), "ok"); } catch { UI.toast(link.url, "ok"); } }
    };
    root.querySelector("[data-link-copy]")?.addEventListener("click", copy);
    root.querySelector("[data-link-share]")?.addEventListener("click", async () => {
      const text = `${App.settings?.app_name || ""}\n${link.url}`;
      try { if (window.NativeBridge?.available?.()) { await NativeBridge.request("share", text); return; } } catch {}
      try { if (navigator.share) { await navigator.share({ title: App.settings?.app_name || "METON", text, url: link.url }); return; } } catch { return; }
      copy();
    });
  }
  function setupSheet(s) {
    const sw = (id, title, on, yes, no) => `<div class="setup-choice"><div class="lrow" style="cursor:default"><div class="t"><b>${E(Lang.t(title))}</b></div>
        <label class="switch"><input type="checkbox" id="${id}" ${on ? "checked" : ""} aria-label="${E(Lang.t(title))}"><span class="track"></span><span class="thumb"></span></label></div>
        <ul class="setup-explain"><li><b>${E(Lang.t("مفعّل"))}:</b> ${E(Lang.t(yes))}</li><li><b>${E(Lang.t("متوقف"))}:</b> ${E(Lang.t(no))}</li></ul></div>`;
    UI.modal(`<div class="setup-sheet"><div class="setup-head">${UI.icon("scissors", 26)}<div><h3>${E(Lang.t("إعداد العمل"))}</h3><p class="muted">${E(Lang.t("اختياران سريعان قبل البدء. يمكنك تغييرهما لاحقاً من إعدادات العمل."))}</p></div></div>
      <div hidden>${sw("su-discover", "إظهار العمل في البحث", s.discoverable, "يجد الناس عملك في «اكتشف الأعمال».", "يختفي من البحث العام، ويبقى الوصول إليه برابطه أو رمزه.")}</div>${/* METON: no Explore/Discover; the stored value is kept as it is */ ""}
      ${sw("su-approval", "الانضمام بموافقة", s.approval, "يتصفح العملاء العمل، ويحجزون بعد أن توافق على طلب انضمامهم.", "ينضم العملاء ويطلبون المواعيد مباشرة.")}
      <p class="tiny">${E(Lang.t("في الحالتين تبقى المواعيد بانتظار تأكيد المختص."))}</p>
      ${s.online_booking === false ? `<p class="tm-alert">${UI.icon("info", 16)}<span>${E(Lang.t("الحجز عبر التطبيق متوقف حالياً: يتصفح العملاء ولا يحجزون. فعّله من الإعدادات العامة عندما تكون جاهزاً."))}</span></p>` : ""}
      <div class="sec-label">${E(Lang.t("رابط عملك"))}</div>
      <p class="tiny">${E(Lang.t("شاركه على إنستغرام أو واتساب: يفتح عملك مباشرة في تطبيق METON، أو متجر التطبيقات إن لم يكن مثبتاً. تجده دائماً في إعدادات العمل."))}</p>
      ${linkBox(s.link, "su-link")}
      <div class="form-error" id="su-err" role="alert"></div>
      <button class="btn" id="su-save">${UI.icon("check", 17)} ${E(Lang.t("حفظ والمتابعة"))}</button></div>`);
    wireLink(document.getElementById("su-link"), s.link);
    document.getElementById("su-save").onclick = async () => {
      UI.busy("su-save", true);
      try {
        await rpc("admin_setup_save", { p_token: tok(), p_data: { discoverable: chk("su-discover"), approval: chk("su-approval") } });
        rpcCacheBust(); UI.closeModal(); UI.toast("تم حفظ الإعدادات", "ok");
      } catch (e) { document.getElementById("su-err").textContent = e.message; UI.busy("su-save", false); }
    };
  }

  // Every section in one sheet: what a phone shows instead of the sidebar.
  function sectionsSheet(groups, tab, groupPage) {
    UI.modal(`<div class="mhead"><h3>${E(Lang.t("كل الأقسام"))}</h3><button class="iconbtn" id="as-x" aria-label="إغلاق">${UI.icon("x", 20)}</button></div>
      <div class="admin-sheet">${groups.map(g => `<section class="admin-sheet-group"><button class="admin-sheet-head ${groupPage === g.id ? "active" : ""}" data-sheet-go="${navBase()}/g-${g.id}">${UI.icon(g.i, 18)}<span><b>${E(Lang.t(g.l))}</b><small>${E(Lang.t(g.d))}</small></span></button>
        <div class="admin-sheet-items">${g.list.map(t => `<button class="admin-sheet-item ${t.id === tab ? "active" : ""}" data-sheet-go="${navBase()}/${t.id}" ${t.id === tab ? 'aria-current="page"' : ""}>${UI.icon(t.i, 15)}<span>${E(Lang.t(t.l))}</span></button>`).join("")}</div></section>`).join("")}</div>`);
    document.getElementById("as-x").onclick = UI.closeModal;
    document.querySelectorAll("[data-sheet-go]").forEach(b => b.onclick = () => { UI.closeModal(); Router.go(b.dataset.sheetGo); });
  }

  // A group's own page: what is in it, with live counts where they exist.
  async function groupLanding(body, group) {
    body.innerHTML = `<div class="admin-group-grid">${group.list.map(t => `<button class="admin-group-tile" data-nav="${navBase()}/${t.id}"><span class="biz-tile-icon">${UI.icon(t.i, 22)}</span><span class="biz-tile-text"><b>${E(Lang.t(t.l))}</b><small>${E(Lang.t(t.d || ""))}</small></span><em class="biz-count" data-count="${E(t.id)}" hidden></em>${UI.icon("chev", 18)}</button>`).join("")}</div>`;
    paintCounts(body);
  }
  // Waiting work shown on the tiles (business badges and support messages).
  async function paintCounts(root) {
    const set = (id, n) => { const el = root.querySelector(`[data-count="${id}"]`); if (el && Number(n) > 0) { el.textContent = Lang.number(n); el.hidden = false; } };
    if (window.Business?.available()) {
      try {
        const c = await Business.context();
        for (const s of Business.SECTIONS) if (s.badge) set("biz-" + s.id, c.badges?.[s.badge]);
      } catch {}
    }
    try { const s = await rpcCached("admin_stats", { p_token: tok() }, 15000); set("support", s.open_support); set("bookings", s.pending); } catch {}
    try { set("requests", await rpcCached("admin_requests_count", { p_token: tok() }, 15000)); } catch {}
  }
  // The Requests badge in the sidebar / sections sheet (refreshed after a decision).
  async function paintRequestBadge() {
    let n = 0;
    window.Push?.refreshBell?.(true);
    try { n = Number(await rpc("admin_requests_count", { p_token: tok() })) || 0; } catch { return; }
    document.querySelectorAll('[data-nav$="/requests"]').forEach(el => {
      let b = el.querySelector(".req-badge");
      if (!n) { b?.remove(); return; }
      if (!b) { b = document.createElement("em"); b.className = "req-badge"; el.appendChild(b); }
      b.textContent = Lang.number(n);
    });
  }

  // ===================================================================
  //  HOME
  // ===================================================================
  async function home(body) {
    const s = await read("admin_stats", { p_token: tok() });
    const stat = (n, l, icon, tone, sub) => `<article class="admin-kpi ${tone||''}"><div class="admin-kpi-head"><span>${l}</span><i>${UI.icon(icon,17)}</i></div><strong>${(n ?? 0).toLocaleString(Lang.locale())}</strong><small>${sub||'آخر تحديث الآن'}</small></article>`;
    const active=(Number(s.pending)||0)+(Number(s.confirmed)||0);
    const completion=Number(s.total_bookings)?Math.round((Number(s.completed)||0)/Number(s.total_bookings)*100):0;
    // 2.33: a team member sees links only to the pages they may open.
    const can = id => owner() || (TAB_PERM[id] && Auth.can(TAB_PERM[id]));
    const link = (id, html) => can(id) ? html : "";
    body.innerHTML = `
      <section class="admin-overview-hero"><div><span class="admin-eyebrow">METON · BUSINESS</span><h1>لوحة قيادة العمل</h1><p>كل ما يحدث اليوم، واضح أمامك بدون ضوضاء.</p></div><div class="admin-hero-actions">${Features.enabled("analytics") ? link("insights", `<button class="btn line" data-nav="${navBase()}/insights">${UI.icon("chart",17)} عرض الإحصائيات</button>`) : ""}${link("schedule", `<button class="btn" data-nav="${navBase()}/schedule">${UI.icon("calendar",17)} جدول اليوم</button>`)}</div></section>
      <div class="admin-kpi-grid">
        ${stat(s.today_bookings,"حجوزات اليوم","calendar","gold",Smart.pick(`${Lang.number(active)} موعد نشط`, active === 1 ? "1 active appointment" : `${Lang.number(active)} active appointments`, active === 1 ? "תור פעיל אחד" : `${Lang.number(active)} תורים פעילים`))}
        ${stat(s.pending,"بانتظار التأكيد","clock","amber","تحتاج إلى مراجعة")}
        ${stat(completion+'%',"نسبة الإنجاز","chart","blue",Smart.pick(`${Lang.number(Number(s.completed)||0)} حجز مكتمل`, Number(s.completed) === 1 ? "1 completed booking" : `${Lang.number(Number(s.completed)||0)} completed bookings`, Number(s.completed) === 1 ? "הזמנה אחת שהושלמה" : `${Lang.number(Number(s.completed)||0)} הזמנות שהושלמו`))}
        ${stat(s.total_users,"إجمالي العملاء","users","violet","قاعدة عملائك")}
      </div>
      <div class="admin-overview-grid"><section class="admin-panel admin-today"><div class="admin-panel-head"><div><span>LIVE OPERATIONS</span><h2>نبض اليوم</h2></div>${link("bookings", `<button class="btn line sm" data-nav="${navBase()}/bookings">كل الحجوزات</button>`)}</div><div class="admin-today-list">${link("bookings", `<button data-nav="${navBase()}/bookings"><i class="pending">${UI.icon('clock',18)}</i><span><b>${Number(s.pending)||0} حجوزات تنتظر التأكيد</b><small>راجعها قبل أن يفوت وقتها</small></span>${UI.icon('chev',18)}</button>`)}${link("schedule", `<button data-nav="${navBase()}/schedule"><i class="confirmed">${UI.icon('calendar',18)}</i><span><b>${Number(s.confirmed)||0} مواعيد مؤكدة</b><small>جاهزة ضمن جدول اليوم</small></span>${UI.icon('chev',18)}</button>`)}${link("support", `<button data-nav="${navBase()}/support"><i class="support">${UI.icon('chat',18)}</i><span><b>${Number(s.open_support)||0} رسائل دعم مفتوحة</b><small>متابعة العملاء بدون تأخير</small></span>${UI.icon('chev',18)}</button>`)}</div></section>
      <section class="admin-panel admin-command"><div class="admin-panel-head"><div><span>QUICK COMMANDS</span><h2>إجراءات سريعة</h2></div></div><div class="admin-command-grid">${link("bookings", `<button data-nav="${navBase()}/bookings">${UI.icon('calendar',20)}<b>حجز جديد</b><small>إدارة الموعد</small></button>`)}<button data-nav="${navBase()}/requests">${UI.icon('bell',20)}<b>الطلبات</b><small>ما ينتظر قرارك</small></button>${owner() ? `<button data-nav="${navBase()}/barbers">${UI.icon('users',20)}<b>الفريق</b><small>إضافة عضو ودعوة</small></button>` : ""}${Auth.can("services") || owner() ? `<button data-nav="${navBase()}/services">${UI.icon('scissors',20)}<b>خدمة</b><small>السعر والمدة</small></button>` : ""}</div></section></div>
      <section class="admin-panel admin-sections"><div class="admin-panel-head"><div><span>ALL SECTIONS</span><h2>أقسام الإدارة</h2></div></div>
        <div class="admin-group-grid">${visibleGroups(visibleTabs()).filter(g => g.id !== "overview").map(g => `<button class="admin-group-tile" data-nav="${navBase()}/g-${g.id}"><span class="biz-tile-icon">${UI.icon(g.i, 22)}</span><span class="biz-tile-text"><b>${E(Lang.t(g.l))}</b><small>${E(Lang.t(g.d))}</small></span>${UI.icon("chev", 18)}</button>`).join("")}</div></section>
      <div id="admin-rating-card"></div>
      <div id="admin-plan-card"></div>`;
    if (owner() || Auth.can("statistics")) window.Rework?.ratingCard(document.getElementById("admin-rating-card"), tok());
    if (owner()) Loyalty.planCard(document.getElementById("admin-plan-card"));
  }

  // ===================================================================
  //  INSIGHTS
  // ===================================================================
  async function insights(body, period="week") {
    const salonName = Control.target()?.name || App.settings?.app_name || "METON";
    // 2.28: Basic shows the latest 30 days only (fixed); Pro shows everything.
    const limited = !Features.enabled("statistics_full_history");
    if (limited) period = "month";
    const periodDays={day:1,week:7,month:30,year:365};
    const periodName={day:"اليوم",week:"الأسبوع",month:"الشهر",year:"السنة"};
    const days=periodDays[period]||7;
    let a;
    try { a = await read("admin_analytics", { p_token: tok(), p_days: days }); }
    catch (e) {
      if (/admin_analytics|function|schema cache/i.test(e.rawMessage || e.message || "")) {
        body.innerHTML = `<div class="card" style="text-align:center;padding:26px">
          <div class="ec" style="margin:0 auto 10px;width:70px;height:70px;border-radius:22px;background:var(--brand-soft);display:grid;place-items:center;color:var(--brand)">${UI.icon("chart", 30)}</div>
          <h3 style="margin:0 0 6px">فعّل الإحصائيات</h3>
          <p class="muted">شغّل ملف <b dir="ltr">database.sql</b> مرة واحدة في Supabase → SQL Editor
          لتفعيل هذه الصفحة. الملف آمن وقابل لإعادة التشغيل.</p></div>`;
        return;
      }
      throw e;
    }

    const AR = (n) => (Number(n) || 0).toLocaleString(Lang.locale());
    const SC = { pending: "#EDAF00", confirmed: "#2196D6", completed: "#118E5B", cancelled: "#CE3B3B", no_show: "#8AA3B7", expired: "#B42318" };
    const SL = { pending: "بانتظار التأكيد", confirmed: "مؤكدة", completed: "مكتملة", cancelled: "ملغاة", no_show: "لم يحضر", expired: "منتهية" };

    const daily = (a.daily || []).slice(-(period==='year'?24:period==='month'?30:14));
    const maxC = Math.max(1, ...daily.map(d => d.c));
    const W = 760, H = 245, PX=24, PY=24, usableH=H-62;
    const points=daily.map((d,i)=>({x:PX+i*((W-PX*2)/Math.max(daily.length-1,1)),y:PY+(1-Number(d.c||0)/maxC)*usableH,d}));
    const pointString=points.map(p=>`${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    const areaPath=points.length?`M ${points[0].x} ${H-32} L ${points.map(p=>`${p.x} ${p.y}`).join(' L ')} L ${points.at(-1).x} ${H-32} Z`:'';
    const grid=[0,.25,.5,.75,1].map(v=>`<line x1="${PX}" y1="${(PY+v*usableH).toFixed(1)}" x2="${W-PX}" y2="${(PY+v*usableH).toFixed(1)}"/><text x="4" y="${(PY+v*usableH+4).toFixed(1)}">${Math.round(maxC*(1-v))}</text>`).join('');
    const chartPoints=points.map((p,i)=>`<circle cx="${p.x}" cy="${p.y}" r="4"><title>${p.d.d}: ${p.d.c}</title></circle>${(i===0||i===points.length-1||i%Math.max(1,Math.ceil(points.length/5))===0)?`<text class="chart-date" x="${p.x}" y="${H-8}" text-anchor="middle">${E(p.d.d.slice(5))}</text>`:''}`).join('');

    const st = a.status || {};
    const order = ["completed", "confirmed", "pending", "cancelled", "no_show", "expired"];
    const totalSt = order.reduce((s, k) => s + (st[k] || 0), 0);
    let acc = 0;
    const segs = order.filter(k => st[k] > 0).map(k => {
      const from = acc / Math.max(totalSt, 1) * 360; acc += st[k];
      const to = acc / Math.max(totalSt, 1) * 360;
      return `${SC[k]} ${from.toFixed(1)}deg ${to.toFixed(1)}deg`;
    }).join(",");
    const legend = order.filter(k => st[k] > 0).map(k =>
      `<div class="li"><span class="sw" style="background:${SC[k]}"></span>${SL[k]}<span class="lv">${AR(st[k])} · ${totalSt?Math.round(st[k]/totalSt*100):0}%</span></div>`).join("");

    const hbar = (rows) => {
      const max = Math.max(1, ...rows.map(r => r.c));
      return `<div class="hbar">${rows.map(r => `<div class="hrow">
        <div class="ht"><span>${E(r.name)}</span><span>${AR(r.c)} حجز${r.rev > 0 ? " • " + UI.money(r.rev) : ""}</span></div>
        <div class="track"><div class="fill" style="width:${(r.c / max * 100).toFixed(0)}%"></div></div>
      </div>`).join("")}</div>`;
    };

    const completionRate = a.total ? Math.round((Number(st.completed)||0) / Number(a.total) * 100) : 0;
    const kpi=(value,label,icon,tone,sub)=>`<article class="analytics-kpi ${tone}"><div><span>${label}</span><i>${UI.icon(icon,17)}</i></div><strong>${value}</strong><small>${sub}</small></article>`;
    body.innerHTML = `
      <section class="analytics-hero"><div class="analytics-hero-top"><div><span class="analytics-kicker">${E(salonName)} · ANALYTICS</span><h1>الإحصائيات</h1><p>${limited ? "أداء العمل والمختصين خلال آخر 30 يوماً. تُحسب تلقائياً ولا تُعدّل يدوياً." : "صورة واضحة لأداء العمل، محفوظة بشكل مستقل عن بيانات الحجوزات القديمة."}</p></div>${limited ? `<div class="analytics-actions"><span class="retention-pill">آخر 30 يوماً</span></div>` : `<div class="analytics-actions"><span class="retention-pill">التلخيص بعد: <b id="retention-value">٦٠</b> يوماً</span><button class="btn line" id="analytics-manage">${UI.icon('cog',16)} إدارة البيانات</button></div>`}</div>
      ${limited ? `<p class="analytics-upgrade-note">الباقة الأساسية تعرض آخر 30 يوماً بدون فترات مخصصة. كل السجل محفوظ ويظهر كاملاً عند الترقية إلى الباقة الاحترافية.</p>` : `<div class="analytics-period-tabs" role="tablist">${[['day','يومية','كل يوم'],['week','أسبوعية','كل أسبوع'],['month','شهرية','كل شهر'],['year','سنوية','كل سنة']].map(([v,l,s])=>`<button class="${v===period?'active':''}" data-analytics-period="${v}"><b>${l}</b><small>${s}</small></button>`).join('')}</div>`}</section>
      <div class="analytics-kpi-grid">
        ${kpi(AR(a.total),'الحجوزات','calendar','gold',limited?Lang.t('آخر 30 يوماً'):Lang.t(`في ${periodName[period]}`))}
        ${kpi(UI.money(a.revenue_completed)||AR(a.revenue_completed),'الإيراد','money','green','من الحجوزات المكتملة')}
        ${kpi(AR(completionRate)+'%','نسبة الإنجاز','chart','blue',`${AR(st.completed||0)} مكتملة`)}
        ${kpi(AR(a.new_users),'عملاء جدد','users','violet',limited?Lang.t('آخر 30 يوماً'):Lang.t(`في ${periodName[period]}`))}
      </div>
      <div class="analytics-main-grid"><section class="analytics-card analytics-trend"><div class="analytics-card-head"><div><h2>تطور الحجوزات</h2><p>${Lang.t(`الحركة خلال ${periodName[period]}`)}</p></div><span>${Lang.t(periodName[period])}</span></div><div class="analytics-line-chart" dir="ltr"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><g class="chart-grid">${grid}</g><defs><linearGradient id="analyticsArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d7b21e" stop-opacity=".28"/><stop offset="1" stop-color="#d7b21e" stop-opacity="0"/></linearGradient></defs><path class="chart-area" d="${areaPath}"/><polyline class="chart-line" points="${pointString}"/><g class="chart-points">${chartPoints}</g></svg></div></section>
      <section class="analytics-card analytics-status"><div class="analytics-card-head"><div><h2>توزيع الحالات</h2><p>الفترة المحددة</p></div><span>${AR(totalSt)} حجز</span></div>${totalSt?`<div class="analytics-status-body"><div class="analytics-donut" style="background:conic-gradient(${segs})"><div><strong>${AR(totalSt)}</strong><small>حجز</small></div></div><div class="analytics-status-list">${legend}</div></div>`:UI.empty('لا توجد بيانات','ستظهر الحالات هنا بعد أول حجز.')}</section></div>
      <div class="analytics-secondary-grid">${(a.top_services||[]).length?`<section class="analytics-card"><div class="analytics-card-head"><div><h2>أفضل الخدمات</h2><p>حسب عدد الحجوزات</p></div></div>${hbar(a.top_services)}</section>`:''}${(a.top_barbers||[]).length?`<section class="analytics-card"><div class="analytics-card-head"><div><h2>أداء المختصين</h2><p>الحجوزات والإيراد</p></div></div>${hbar(a.top_barbers)}</section>`:''}</div>
      <section class="analytics-card analytics-performance" id="analytics-performance">${UI.loading()}</section>
      ${limited ? "" : `<section class="analytics-card analytics-history-card"><div class="analytics-card-head"><div><h2>السجل المحفوظ</h2><p>ملخصات دائمة بدون بيانات شخصية غير ضرورية</p></div></div><div id="analytics-history">${UI.loading()}</div></section>`}`;
    window.Workforce?.performance(document.getElementById('analytics-performance'));

    const loadHistory = async period => {
      const host=document.getElementById('analytics-history'); if(!host)return;
      host.innerHTML=UI.loading();
      try {
        const history=await rpc('admin_analytics_history',{p_token:tok(),p_period:period});
        const rows=history.periods||[];
        host.innerHTML=rows.length?`<div class="analytics-history-list">${rows.map(r=>`<article><div><b>${E(r.period_start)}</b><small>حتى ${E(r.period_end)}</small></div><strong>${AR(r.total_bookings)} حجز</strong><span>${UI.money(r.completed_revenue)||AR(r.completed_revenue)}</span><em>${AR(r.completion_rate)}% مكتمل</em></article>`).join('')}</div>`:UI.empty('لا يوجد سجل مؤرشف بعد','سيظهر هنا تلقائياً عند تجاوز البيانات مدة الاحتفاظ.');
        const retention=document.getElementById('retention-value');if(retention)retention.textContent=AR(history.retention_days||60);
        document.getElementById('analytics-manage').onclick=()=>analyticsSettings(history.retention_days,()=>insights(body,period));
      } catch(e) { host.innerHTML=`<div class="analytics-upgrade-note">شغّل <b dir="ltr">UPGRADE_2_4.sql</b> مرة واحدة لتفعيل الأرشفة التاريخية الآمنة.</div>`; }
    };
    document.querySelectorAll('[data-analytics-period]').forEach(btn=>btn.onclick=()=>insights(body,btn.dataset.analyticsPeriod));
    if (!limited) loadHistory(period);
  }

  function analyticsSettings(days,refresh) {
    UI.modal(`<div class="mhead"><h3>إدارة بيانات الإحصائيات</h3><button class="iconbtn" id="mx">${UI.icon('x',20)}</button></div><div class="mform">
      <label>إضافة الأيام إلى السجل التاريخي بعد (أيام)<input class="input" id="analytics-retention" type="number" min="14" max="730" value="${Number(days)||60}"></label>
      <p class="tiny">تبقى جميع الحجوزات محفوظة دائماً. بعد هذه المدة يُضاف كل يوم كملخص يومي إلى السجل التاريخي لهذا العمل.</p>
      <button class="btn" id="analytics-save">حفظ</button><button class="btn line" id="analytics-reset" style="color:var(--danger)">حذف الملخصات المحفوظة</button></div>`);
    document.getElementById('mx').onclick=UI.closeModal;
    document.getElementById('analytics-save').onclick=()=>guardedSave(()=>rpc('admin_set_analytics_retention',{p_token:tok(),p_days:Number(val('analytics-retention'))}),'analytics-save','تم حفظ الإعدادات',refresh);
    document.getElementById('analytics-reset').onclick=()=>{UI.closeModal();UI.confirm('حذف جميع الملخصات التاريخية المحفوظة؟ لا يؤثر ذلك في الحجوزات، وتُبنى الملخصات من جديد تلقائياً.',async()=>{await rpc('admin_reset_analytics',{p_token:tok()});UI.toast('تم حذف السجل المحفوظ','ok');await refresh();},true);};
  }

  // ===================================================================
  //  BOOKINGS
  // ===================================================================
  let bkFilter = { status: "", barber: "", date: "", search: "" };
  async function bookings(body) {
    const barbers = await read("list_barbers", { p_only_active: false });
    const statusOpts = [["", "كل الحالات"], ["pending", "بانتظار التأكيد"], ["confirmed", "مؤكدة"],
    ["completed", "مكتملة"], ["cancelled", "ملغاة"], ["no_show", "لم يحضر"], ["expired", "منتهية"]];
    body.innerHTML = `
      <div class="card">
        <div class="grid g4">
          <div class="field"><label>بحث</label><input id="f-search" class="input" placeholder="اسم أو رقم هاتف" value="${E(bkFilter.search)}"></div>
          <div class="field"><label>الحالة</label>${selectBox("f-status", statusOpts.map(o => ({ v: o[0], l: o[1] })), bkFilter.status)}</div>
          <div class="field"><label>المختص</label>${selectBox("f-barber", [{ v: "", l: "كل المختصين" }].concat(barbers.map(b => ({ v: b.id, l: b.name }))), bkFilter.barber)}</div>
          <div class="field"><label>التاريخ</label><input id="f-date" class="input" type="date" value="${E(bkFilter.date)}"></div>
        </div>
        <button class="btn sm" id="f-apply" style="margin-top:12px">${UI.icon("filter", 15)} تطبيق الفلاتر</button>
      </div>
      <button class="btn line sm team-schedule-link" data-nav="${navBase()}/schedule">${UI.icon("calendar", 15)} الجدول</button>
      <div id="bk-list" style="margin-top:14px">${UI.loading()}</div>`;

    const apply = () => {
      bkFilter = { search: val("f-search"), status: val("f-status"), barber: val("f-barber"), date: val("f-date") };
      loadList();
    };
    document.getElementById("f-apply").onclick = apply;
    ["f-status", "f-barber", "f-date"].forEach(id => document.getElementById(id).onchange = apply);

    let page = 0, items = [], hasNext = false; const PAGE = 10;
    async function load() {
      items = await read("admin_list_bookings", {
        p_token: tok(),
        p_status: bkFilter.status || null,
        p_barber: bkFilter.barber || null,
        p_date: bkFilter.date || null,
        p_search: bkFilter.search || null,
        p_limit: PAGE, p_offset: page * PAGE,
      });
      hasNext = items.length === PAGE;
    }
    function paintList() {
      const host = document.getElementById("bk-list");
      host.innerHTML = (!items.length
        ? UI.empty("لا توجد حجوزات", page > 0 ? "لا مزيد من الحجوزات." : "لم يتم العثور على حجوزات مطابقة.")
        : `<div class="list cols">${items.map(b => `
            <div class="card clickable" data-act="bk" data-id="${b.id}">
              <div class="row between"><div style="min-width:0">
                <b style="font-size:15px">${E(b.guest_name || b.user_name || "—")}</b>
                ${b.guest_name ? `<div class="guest-sub">حجز الحساب: ${E(b.user_name || "—")}</div>` : ""}
              </div>${UI.badge(b.status)}</div>
              <div class="muted" style="margin-top:4px">${E(b.service_name || "—")} · ${E(b.barber_name || "—")}</div>
              <div class="kv">${UI.icon("calendar", 13)} ${UI.dateAr(b.booking_date)} — ${UI.timeAr(b.booking_time)}${b.duration ? " – " + UI.timeAr(UI.endTime(b.booking_time,b.duration)) : ""}</div>
              <div class="tiny" dir="ltr" style="margin-top:2px">${E(b.user_phone || "")}</div>
            </div>`).join("")}</div>`) + UI.pager(page, hasNext);
      UI.wirePager(
        async () => { if (page > 0) { page--; await load(); paintList(); } },
        async () => { if (hasNext) { page++; await load(); paintList(); } });
      host.querySelectorAll('[data-act="bk"]').forEach(el =>
        el.onclick = () => bookingModal(items.find(r => r.id === el.dataset.id), loadList));
    }
    async function loadList() {
      page = 0;
      document.getElementById("bk-list").innerHTML = UI.loading();
      await load(); paintList();
    }
    loadList();
    // new bookings appear in the dashboard without a manual refresh
    let sig = "";
    Live.start(async () => {
      // the dashboard swaps tabs without changing route, so bail out (and stop
      // polling) as soon as this tab's container is gone
      if (!document.getElementById("bk-list")) { Live.stop(); return; }
      const rows = await rpc("admin_list_bookings", {
        p_token: tok(),
        p_status: bkFilter.status || null,
        p_barber: bkFilter.barber || null,
        p_date: bkFilter.date || null,
        p_search: bkFilter.search || null,
        p_limit: PAGE, p_offset: page * PAGE,
      });
      const fresh = JSON.stringify(rows.map(b => [b.id, b.status]));
      if (fresh === sig) return;
      sig = fresh; items = rows; hasNext = rows.length === PAGE;
      paintList();
    }, 10000);
  }

  function bookingModal(b, refresh) {
    // The status dropdown offered all five states on every booking, so a
    // completed visit could be sent back to "pending" and tomorrow's booking
    // marked a no-show today. The dashboard now offers the same transitions
    // the booking page and the specialist's sheet do, from the shared rules.
    const tone = { confirm: "ok", danger: "danger", warn: "warn", neutral: "line" };
    // The salon admin may also correct an expired booking (completed / no-show).
    const available = BookingRules.actions({ ...b, canCorrect: true });
    const note = BookingRules.note(b);
    UI.modal(`<div class="mhead"><h3>تفاصيل الحجز</h3>
      <button class="iconbtn" id="mx">${UI.icon("x", 20)}</button></div>
      <div class="mform">
        <div class="card" style="box-shadow:none;border:1.5px solid var(--line)">
          <div class="row between"><div style="min-width:0">
            <b>${E(b.guest_name || b.user_name || "—")}</b>
            ${b.guest_name ? `<div class="guest-sub">حجز الحساب: ${E(b.user_name || "—")}</div>` : ""}
          </div>${UI.badge(b.status)}</div>
          <div class="muted" style="margin-top:6px">${E(b.service_name)} · ${E(b.barber_name)}</div>
          <div class="tiny" style="margin-top:4px">${UI.dateAr(b.booking_date)} — ${UI.timeAr(b.booking_time)}${b.duration ? " – " + UI.timeAr(UI.endTime(b.booking_time,b.duration)) : ""}</div>
          ${b.price ? `<div class="tiny" style="margin-top:4px">${UI.money(b.price)}</div>` : ""}
          ${b.user_phone ? `<div class="btn-row" style="margin-top:12px">
            <a class="btn line sm" href="tel:${E(String(b.user_phone).replace(/[^+0-9]/g,""))}">${UI.icon("phone", 15)} اتصال</a>
            <a class="btn line sm" href="https://wa.me/${String(b.user_phone).replace(/[^0-9]/g, "")}" target="_blank" rel="noopener">${UI.icon("whatsapp", 15)} واتساب</a>
          </div>` : ""}
        </div>
        ${available.length ? `<div class="sec-label">الإجراء التالي</div>
        <div class="booking-actions">${available.map(a =>
          `<button class="btn ${tone[a.tone] || "line"}" data-bk-to="${E(a.to)}" data-bk-label="${E(a.label)}">${E(a.label)}</button>`).join("")}</div>` : ""}
        ${note ? `<p class="tiny" style="text-align:center;margin:0">${E(note)}</p>` : ""}
        <div id="bk-biz"></div>
        ${field("ملاحظة", textarea("bk-note", b.note))}
        <button class="btn line" id="bk-save">حفظ الملاحظة</button>
        <button class="btn line" id="bk-del" style="color:var(--danger);border-color:var(--danger)">حذف الحجز</button>
      </div>`);
    document.getElementById("mx").onclick = UI.closeModal;
    window.Business?.bookingPanel(document.getElementById("bk-biz"), b, { staff: true, onDone: refresh });
    document.querySelectorAll("[data-bk-to]").forEach(button => button.onclick = () => {
      const next = button.dataset.bkTo;
      UI.confirm(`${button.dataset.bkLabel}؟`, async () => {
        try {
          // The note travels with the change so an edit in the field above is
          // never lost by using one of these buttons.
          await rpc("admin_update_booking", { p_token: tok(), p_id: b.id, p_status: next, p_note: val("bk-note") });
          b.status = next; UI.closeModal(); UI.toast("تم تحديث الحجز", "ok"); refresh();
        } catch (e) { UI.toast(e.message, "err"); }
      }, next === "cancelled");
    });
    document.getElementById("bk-save").onclick = () => guardedSave(
      () => rpc("admin_update_booking", { p_token: tok(), p_id: b.id, p_status: b.status, p_note: val("bk-note") }),
      "bk-save", "تم الحفظ", refresh);
    document.getElementById("bk-del").onclick = () => {
      UI.closeModal();
      UI.confirm("حذف هذا الحجز نهائياً؟", async () => {
        try { await rpc("admin_delete_booking", { p_token: tok(), p_id: b.id }); UI.toast("تم الحذف", "ok"); refresh(); }
        catch (e) { UI.toast(e.message, "err"); }
      }, true);
    };
  }

  // ===================================================================
  //  BARBERS
  // ===================================================================
  // 2.33: the old specialist page and its modal are gone: the Team page
  // (members.js) adds people by invitation and edits roles, permissions,
  // services and hours. Specialist profiles are never created here.
  const WD = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

  // ===================================================================
  //  SERVICES
  // ===================================================================
  async function services(body) {
    const list = await read("list_services", { p_only_enabled: false });
    body.innerHTML = `
      <button class="btn" id="add-svc" style="margin-bottom:14px;max-width:240px">${UI.icon("plus", 18)} إضافة خدمة</button>
      ${!list.length ? UI.empty("لا توجد خدمات", "أضف الخدمات التي يقدمها العمل.")
        : `<div class="list cols">${list.map(s => `
          <div class="card clickable row between" data-act="svc" data-id="${s.id}">
            <div style="flex:1;min-width:0">
              <b style="display:block">${E(s.name)}</b>
              <span class="tiny">${s.duration} دقيقة ${UI.money(s.price) ? "· " + UI.money(s.price) : ""}</span>
            </div>
            ${UI.badge(s.is_enabled ? "active" : "hidden")}
          </div>`).join("")}</div>`}`;
    document.getElementById("add-svc").onclick = () => svcModal(null, () => dashboard({ tab: "services" }));
    body.querySelectorAll('[data-act="svc"]').forEach(el =>
      el.onclick = () => svcModal(list.find(s => s.id === el.dataset.id), () => dashboard({ tab: "services" })));
  }
  function svcModal(s, refresh) {
    s = s || {};
    UI.modal(`<div class="mhead"><h3>${s.id ? "تعديل خدمة" : "إضافة خدمة"}</h3>
      <button class="iconbtn" id="mx">${UI.icon("x", 20)}</button></div>
      <div class="mform">
        ${field("اسم الخدمة", input("s-name", s.name))}
        ${field("الوصف", textarea("s-desc", s.description))}
        ${field("المدة (دقيقة)", input("s-dur", s.duration || 30, { type: "number" }))}
        ${field("السعر", input("s-price", s.price || 0, { type: "number" }))}
        ${switchRow("s-en", "مفعّلة", s.is_enabled !== false)}
        <button class="btn" id="s-save">حفظ</button>
        ${s.id ? `<button class="btn line" id="s-del" style="color:var(--danger);border-color:var(--danger)">حذف</button>` : ""}
      </div>`);
    document.getElementById("mx").onclick = UI.closeModal;
    document.getElementById("s-save").onclick = () => {
      if (!val("s-name")) { UI.toast("الاسم مطلوب", "err"); return; }
      guardedSave(() => rpc("admin_save_service", {
        p_token: tok(), p_id: s.id || null, p_name: val("s-name"), p_desc: val("s-desc"),
        p_duration: numv("s-dur"), p_price: numv("s-price"), p_enabled: chk("s-en"),
      }).then(r => { rpcCacheBust("barber_services_list"); return r; }), "s-save", "تم الحفظ", refresh);
    };
    if (s.id) document.getElementById("s-del").onclick = () => {
      UI.closeModal();
      UI.confirm("حذف هذه الخدمة؟", async () => {
        try { await rpc("admin_delete_service", { p_token: tok(), p_id: s.id }); rpcCacheBust("barber_services_list"); UI.toast("تم الحذف", "ok"); refresh(); }
        catch (e) { UI.toast(e.message, "err"); }
      }, true);
    };
  }

  // ===================================================================
  //  CATEGORIES
  // ===================================================================
  async function categories(body) {
    const list = await read("list_categories", { p_only_enabled: false });
    body.innerHTML = `
      <button class="btn" id="add-cat" style="margin-bottom:14px;max-width:240px">${UI.icon("plus", 18)} إضافة فئة</button>
      ${!list.length ? UI.empty("لا توجد فئات", "تُستخدم الفئات لتصنيف المنتجات.")
        : `<div class="list cols">${list.map(c => `
          <div class="card clickable row between" data-act="cat" data-id="${c.id}">
            <div class="row" style="gap:10px"><span class="tiny">#${c.sort_order}</span><b>${E(c.name)}</b></div>
            ${UI.badge(c.is_enabled ? "active" : "hidden")}
          </div>`).join("")}</div>`}`;
    document.getElementById("add-cat").onclick = () => catModal(null, () => dashboard({ tab: "categories" }));
    body.querySelectorAll('[data-act="cat"]').forEach(el =>
      el.onclick = () => catModal(list.find(c => c.id === el.dataset.id), () => dashboard({ tab: "categories" })));
  }
  function catModal(c, refresh) {
    c = c || {};
    UI.modal(`<div class="mhead"><h3>${c.id ? "تعديل فئة" : "إضافة فئة"}</h3>
      <button class="iconbtn" id="mx">${UI.icon("x", 20)}</button></div>
      <div class="mform">
        ${field("اسم الفئة", input("c-name", c.name))}
        ${field("الترتيب", input("c-sort", c.sort_order || 0, { type: "number" }))}
        ${switchRow("c-en", "مفعّلة", c.is_enabled !== false)}
        <button class="btn" id="c-save">حفظ</button>
        ${c.id ? `<button class="btn line" id="c-del" style="color:var(--danger);border-color:var(--danger)">حذف</button>` : ""}
      </div>`);
    document.getElementById("mx").onclick = UI.closeModal;
    document.getElementById("c-save").onclick = () => {
      if (!val("c-name")) { UI.toast("الاسم مطلوب", "err"); return; }
      guardedSave(() => rpc("admin_save_category", {
        p_token: tok(), p_id: c.id || null, p_name: val("c-name"),
        p_enabled: chk("c-en"), p_sort: numv("c-sort") || 0,
      }).then(r => { rpcCacheBust("list_categories"); return r; }), "c-save", "تم الحفظ", refresh);
    };
    if (c.id) document.getElementById("c-del").onclick = () => {
      UI.closeModal();
      UI.confirm("حذف هذه الفئة؟", async () => {
        try { await rpc("admin_delete_category", { p_token: tok(), p_id: c.id }); rpcCacheBust("list_categories"); UI.toast("تم الحذف", "ok"); refresh(); }
        catch (e) { UI.toast(e.message, "err"); }
      }, true);
    };
  }

  // ===================================================================
  //  PRODUCTS
  // ===================================================================
  async function products(body) {
    const cats = await read("list_categories", { p_only_enabled: false });
    const PAGE = 12; let page = 0, list = [], hasNext = false;
    body.innerHTML = `
      <button class="btn" id="add-prod" style="margin-bottom:14px;max-width:240px">${UI.icon("plus", 18)} إضافة منتج</button>
      <div id="prod-list">${UI.loading()}</div>`;
    document.getElementById("add-prod").onclick = () => prodModal(null, cats, () => dashboard({ tab: "products" }));
    async function load() {
      list = await read("list_products_v2", { p_only_active: false, p_limit: PAGE, p_offset: page * PAGE });
      hasNext = list.length === PAGE;
    }
    function paintList() {
      const host = document.getElementById("prod-list");
      host.innerHTML = (!list.length ? UI.empty("لا توجد منتجات", page > 0 ? "لا مزيد من المنتجات." : "أضف منتجات لعرضها في التطبيق.")
        : `<div class="list cols">${list.map(p => `
          <div class="card clickable row between" data-act="prod" data-id="${p.id}" style="gap:12px">
            <div class="row" style="gap:12px;flex:1;min-width:0">
              ${p.image_url ? `<img class="av-sm" src="${E(p.image_url)}" alt="">` : `<div class="av-sm" style="display:grid;place-items:center;color:var(--brand-ink)">${UI.icon("bag", 20)}</div>`}
              <div style="min-width:0">
                <b style="display:block">${E(p.name)} ${p.is_featured ? UI.icon("star", 14) : ""}</b>
                <span class="tiny">${UI.money(p.price) || "—"} · مخزون: ${p.stock}${Features.enabled("loyalty") && p.coin_price ? ` · ${Number(p.coin_price).toLocaleString(Lang.locale())} نقطة` : ""}</span>
              </div>
            </div>
            ${UI.badge(p.status === "active" ? "active" : "hidden")}
          </div>`).join("")}</div>`) + UI.pager(page, hasNext);
      UI.wirePager(
        async () => { if (page > 0) { page--; await load(); paintList(); } },
        async () => { if (hasNext) { page++; await load(); paintList(); } });
      host.querySelectorAll('[data-act="prod"]').forEach(el =>
        el.onclick = () => prodModal(list.find(p => p.id === el.dataset.id), cats, () => dashboard({ tab: "products" })));
    }
    await load(); paintList();
  }
  function prodModal(p, cats, refresh) {
    p = p || {};
    // With Inventory and Financial Management, stock arrives only as a
    // purchase (quantity × unit cost), never typed into the product.
    const buysStock = Features.enabled("inventory") && Features.enabled("financial_management");
    const gallery = Array.isArray(p.gallery) ? p.gallery.join("\n") : "";
    UI.modal(`<div class="mhead"><h3>${p.id ? "تعديل منتج" : "إضافة منتج"}</h3>
      <button class="iconbtn" id="mx">${UI.icon("x", 20)}</button></div>
      <div class="mform">
        ${field("اسم المنتج", input("p-name", p.name))}
        ${field("الوصف", textarea("p-desc", p.description))}
        ${field("الفئة", selectBox("p-cat", [{ v: "", l: "بدون فئة" }].concat(cats.map(c => ({ v: c.id, l: c.name }))), p.category_id || ""))}
        ${field("السعر", input("p-price", p.price || 0, { type: "number" }))}
        ${buysStock && !p.id ? `<div class="loy-product-fields"><div class="sec-label">المخزون الأولي</div>
          ${field("الكمية المشتراة", input("p-stock", "", { type: "number", ph: "0" }))}
          ${field("سعر التكلفة للوحدة", input("p-unit", "", { type: "number" }))}
          <p class="tiny">تُسجل تلقائياً في المشتريات والإدارة المالية.</p></div>`
          : buysStock ? `<p class="tiny">المخزون الحالي: ${Number(p.stock) || 0} — الشراء والجرد من صفحة «المخزون».</p>` : field("المخزون", input("p-stock", p.stock || 0, { type: "number" }))}
        ${imageField("صورة المنتج", "p-img", p.image_url)}
        ${field("صور إضافية للمنتج (رابط في كل سطر)", textarea("p-gal", gallery))}
        ${Features.enabled("loyalty") ? `<div class="loy-product-fields"><div class="sec-label">نقاط الولاء · Loyalty Coins</div>
          ${field("طريقة الشراء · Purchase method", selectBox("p-mode", [{ v: "money", l: "نقداً فقط · Money" }, { v: "coins", l: "بالنقاط فقط · Coins" }, { v: "both", l: "نقداً أو بالنقاط · Either" }], p.purchase_mode || "money"))}
          ${field("السعر بالنقاط (اختياري) · Coin price", input("p-coins", p.coin_price ?? "", { type: "number", ph: "مطلوب للشراء بالنقاط" }))}
          ${field("نقاط إضافية عند الشراء (لكل قطعة)", input("p-earn", p.earn_coins ?? "", { type: "number", ph: "0" }))}</div>` : ""}
        ${switchRow("p-feat", "منتج مميز", !!p.is_featured)}
        ${switchRow("p-active", "ظاهر في التطبيق", (p.status || "active") === "active")}
        <button class="btn" id="p-save">حفظ</button>
        ${p.id ? `<button class="btn line" id="p-del" style="color:var(--danger);border-color:var(--danger)">حذف</button>` : ""}
      </div>`);
    document.getElementById("mx").onclick = UI.closeModal;
    wireImage("p-img", "product");
    document.getElementById("p-save").onclick = () => {
      if (!val("p-name")) { UI.toast("الاسم مطلوب", "err"); return; }
      const gal = val("p-gal").split("\n").map(x => x.trim()).filter(Boolean);
      const data = {
        name: val("p-name"), description: val("p-desc"), category_id: val("p-cat"),
        price: numv("p-price") || 0, image_url: val("p-img"),
        gallery: gal, is_featured: chk("p-feat"), status: chk("p-active") ? "active" : "hidden",
      };
      if (!buysStock) data.stock = numv("p-stock") || 0;
      else if (!p.id) data.stock = 0;
      const opening = buysStock && !p.id ? numv("p-stock") || 0 : 0;
      if (opening > 0 && !(document.getElementById("p-unit").value.trim() !== "" && numv("p-unit") >= 0)) { UI.toast("أدخل سعر التكلفة للوحدة", "err"); return; }
      if (document.getElementById("p-mode")) {
        // Only sent while Loyalty Coins is enabled; otherwise the stored values stay untouched.
        data.purchase_mode = val("p-mode"); data.coin_price = val("p-coins"); data.earn_coins = val("p-earn");
        if (data.purchase_mode !== "money" && !(Number(data.coin_price) >= 1)) { UI.toast("حدد سعر النقاط للشراء بالنقاط", "err"); return; }
      }
      if (data.price < 0 || data.stock < 0 || opening < 0) { UI.toast("السعر والمخزون لا يمكن أن يكونا سالبين", "err"); return; }
      const key = Business.requestKey();
      guardedSave(async () => {
        const saved = await rpc("admin_save_product_v2", { p_token: tok(), p_id: p.id || null, p_data: data });
        if (opening > 0 && saved?.id) await rpc("admin_biz_record_purchase", { p_token: tok(), p_product: saved.id, p_data: { quantity: opening, unit_cost: numv("p-unit"), paid: true }, p_request_key: key });
        return saved;
      }, "p-save", "تم الحفظ", refresh);
    };
    if (p.id) document.getElementById("p-del").onclick = () => {
      UI.closeModal();
      UI.confirm("حذف هذا المنتج؟", async () => {
        try { await rpc("admin_delete_product", { p_token: tok(), p_id: p.id }); UI.toast("تم الحذف", "ok"); refresh(); }
        catch (e) { UI.toast(e.message, "err"); }
      }, true);
    };
  }

  // ===================================================================
  //  USERS (clients)
  // ===================================================================
  async function users(body) {
    // 2.33: clients create their own accounts. This page manages the salon's
    // relationship with them (membership requests, blocking, notifications,
    // coins) — it never creates an account or changes a role.
    const roleAr = { admin: "مالك", barber: "مختص", user: "عميل" };
    const PAGE = 15;
    let page = 0, list = [], total = 0, q = "", role = "", reqId = 0, pending = [];
    try { pending = (owner() || Auth.can("requests")) ? await read("admin_members_pending", { p_token: tok() }) : []; } catch { pending = []; }
    const pendingIds = new Set(pending.map(p => p.id));

    body.innerHTML = `
      ${pending.length ? `<button class="tm-alert u-pending" data-nav="${navBase()}/requests">${UI.icon("user", 18)}<span>${Lang.number(pending.length)} ${E(Lang.t("طلب انضمام بانتظار موافقتك"))}</span>${UI.icon("chev", 16)}</button>` : ""}
      <div class="u-tools">
        <div class="u-search">
          ${UI.icon("search", 17)}
          <input id="u-q" class="input" type="search" placeholder="${Lang.t("ابحث بالاسم أو رقم الهاتف")}" autocomplete="off">
          <button id="u-clear" class="u-clear" hidden aria-label="مسح">${UI.icon("x", 15)}</button>
        </div>
        <div class="chips" id="u-roles">
          ${[{ v: "", l: "الكل" }, { v: "user", l: "عملاء" }, { v: "barber", l: "مختصون" }, { v: "admin", l: "مالكون" }]
        .map(r => `<button class="chip ${r.v === "" ? "active" : ""}" data-role="${r.v}">${r.l}</button>`).join("")}
        </div>
      </div>
      <p class="tiny u-note">${E(Lang.t("ينشئ العملاء حساباتهم بأنفسهم من التطبيق، وينضم أعضاء الفريق عبر دعوة من صفحة الفريق."))}</p>
      <div id="user-list">${UI.loading()}</div>`;

    async function load() {
      const my = ++reqId;                     // ignore out-of-order search results
      const rows = await read("admin_list_users", {
        p_token: tok(), p_limit: PAGE, p_offset: page * PAGE,
        p_search: q || null, p_role: role || null,
      });
      if (my !== reqId) return false;         // a newer search already fired
      list = rows;
      total = rows.length ? Number(rows[0].total_count) : 0;
      return true;
    }

    function paintList() {
      const host = document.getElementById("user-list");
      const pages = Math.max(1, Math.ceil(total / PAGE));
      const from = total ? page * PAGE + 1 : 0;
      const to = Math.min(total, (page + 1) * PAGE);
      host.innerHTML = (!list.length
        ? UI.empty(q || role ? "لا نتائج" : "لا يوجد عملاء بعد",
          q ? `لا عميل يطابق "${E(q)}"` : "")
        : `<div class="u-count" dir="auto">${Smart.pick(`${Lang.number(from)}–${Lang.number(to)} من ${Lang.number(total)}`, `${from}–${to} of ${total}`, `${from}–${to} מתוך ${total}`)}</div>
           <div class="list cols">${list.map(u => `
          <div class="card clickable row between" data-act="user" data-id="${u.id}">
            <div style="flex:1;min-width:0">
              <b style="display:block" data-i18n-skip>${E(u.full_name || Lang.t("بدون اسم"))}</b>
              <span class="tiny" dir="ltr" data-i18n-skip>${E(u.phone)}</span>
            </div>
            <div class="row" style="gap:6px">
              ${pendingIds.has(u.id) ? `<span class="badge amber">${E(Lang.t("بانتظار الموافقة"))}</span>` : ""}
              ${u.is_disabled ? `<span class="badge danger">${E(Lang.t("العميل موقوف"))}</span>` : ""}
              <span class="role-pill">${roleAr[u.role] || u.role}</span>
            </div>
          </div>`).join("")}</div>
           ${pages > 1 ? `<div class="u-pager">
             <button class="btn line sm" id="pg-prev" ${page === 0 ? "disabled" : ""}>السابق</button>
             <span class="u-pg">صفحة ${page + 1} من ${pages}</span>
             <button class="btn line sm" id="pg-next" ${page + 1 >= pages ? "disabled" : ""}>التالي</button>
           </div>` : ""}`);

      const prev = document.getElementById("pg-prev"), next = document.getElementById("pg-next");
      if (prev) prev.onclick = async () => { if (page > 0) { page--; if (await load()) paintList(); } };
      if (next) next.onclick = async () => { if ((page + 1) * PAGE < total) { page++; if (await load()) paintList(); } };
      host.querySelectorAll('[data-act="user"]').forEach(el =>
        el.onclick = () => userModal(list.find(u => u.id === el.dataset.id), pendingIds.has(el.dataset.id), () => dashboard({ tab: "users" })));
    }

    // debounced search so typing never floods the database
    const qi = document.getElementById("u-q");
    const clr = document.getElementById("u-clear");
    let t = null;
    const runSearch = () => {
      clearTimeout(t);
      t = setTimeout(async () => {
        q = qi.value.trim(); page = 0;
        clr.hidden = !q;
        document.getElementById("user-list").innerHTML = UI.loading();
        if (await load()) paintList();
      }, 300);
    };
    qi.addEventListener("input", runSearch);
    clr.onclick = () => { qi.value = ""; qi.focus(); runSearch(); };

    document.getElementById("u-roles").querySelectorAll("[data-role]").forEach(b =>
      b.onclick = async () => {
        document.getElementById("u-roles").querySelectorAll("[data-role]")
          .forEach(x => x.classList.toggle("active", x === b));
        role = b.dataset.role; page = 0;
        document.getElementById("user-list").innerHTML = UI.loading();
        if (await load()) paintList();
      });

    await load(); paintList();
  }
  function userModal(u, isPending, refresh) {
    const staff = u.role !== "user";
    UI.modal(`<div class="mhead"><h3 data-i18n-skip>${E(u.full_name || Lang.t("بدون اسم"))}</h3>
      <button class="iconbtn" id="mx">${UI.icon("x", 20)}</button></div>
      <div class="mform">
        <div class="u-ident"><span class="role-pill">${E(Lang.t({ admin: "مالك", barber: "مختص", user: "عميل" }[u.role] || u.role))}</span><bdi dir="ltr" data-i18n-skip>${E(u.phone)}</bdi></div>
        <p class="tiny">${E(Lang.t(staff ? "عضو في الفريق: الدور والصلاحيات من صفحة الفريق." : "الاسم والرقم من حساب العميل نفسه."))}</p>
        ${isPending ? `<div class="tm-alert">${UI.icon("clock", 17)}<span>${E(Lang.t("طلب انضمام بانتظار موافقتك"))}</span></div>
          <div class="btn-row"><button class="btn" id="u-approve">${E(Lang.t("قبول"))}</button><button class="btn line danger-line" id="u-reject">${E(Lang.t("رفض"))}</button></div>` : ""}
        ${!staff && (owner() || Auth.can("clients_manage")) ? `${switchRow("u-dis", "إيقاف العميل في هذا العمل", !!u.is_disabled)}
          <p class="tiny" style="margin:-6px 2px 0">${E(Lang.t("الموقوف لا يستطيع الحجز أو الدخول إلى هذا العمل أو الانضمام إليه من جديد، ويُلغى انتظاره. تبقى حجوزاته وسجلاته كما هي، ويمكنك إلغاء الإيقاف في أي وقت. لا يتأثر في الأعمال الأخرى."))}</p>
          <button class="btn" id="u-save">حفظ</button>` : ""}
        <div class="btn-row">
          ${owner() || Auth.can("notifications") ? `<button class="btn line" id="u-notify">${UI.icon("bell",17)} إرسال إشعار</button>` : ""}
          ${owner() && !staff ? `<button class="btn line" id="u-del" style="color:var(--danger);border-color:var(--danger)">حذف</button>` : ""}
        </div>
        ${owner() && !staff ? `<p class="tiny" style="text-align:center">${E(Lang.t("كلمات المرور يغيّرها دعم METON فقط: من نسي كلمة المرور يتواصل مع دعم METON. الحذف متاح فقط لعميل بلا سجل حجوزات."))}</p>` : ""}
        ${Features.enabled("loyalty") && (owner() || Auth.can("marketing")) ? `<div id="u-coins"></div>` : ""}
      </div>`);
    document.getElementById("mx").onclick = UI.closeModal;
    if (document.getElementById("u-coins")) Loyalty.customerCoins(document.getElementById("u-coins"), u.id);
    const on = (id, fn) => { const el = document.getElementById(id); if (el) el.onclick = fn; };
    on("u-save", () => guardedSave(() => rpc("admin_update_user", {
      p_token: tok(), p_id: u.id, p_name: null, p_role: u.role, p_disabled: chk("u-dis"), p_barber: u.barber_id || null,
    }), "u-save", "تم الحفظ", refresh));
    const decide = (ok) => async () => { try { await rpc("admin_member_decide", { p_token: tok(), p_user: u.id, p_approve: ok }); UI.closeModal(); UI.toast(ok ? "تم القبول" : "تم الرفض", "ok"); refresh(); paintRequestBadge(); } catch (e) { UI.toast(e.message, "err"); } };
    on("u-approve", decide(true)); on("u-reject", decide(false));
    on("u-notify", () => notifyModal(u.id));
    on("u-del", () => {
      UI.closeModal();
      UI.confirm("حذف هذا العميل نهائياً؟", async () => {
        try { const r = await rpc("admin_delete_user", { p_token: tok(), p_id: u.id }); if (r?.error) throw new Error(r.error); UI.toast("تم الحذف", "ok"); refresh(); }
        catch (e) { UI.toast(e.message, "err"); }
      }, true);
    });
  }

  // ===================================================================
  //  SUPPORT
  // ===================================================================
  async function support(body) {
    const PAGE = 10; let page = 0, list = [], hasNext = false;
    body.innerHTML = `<div id="sup-list">${UI.loading()}</div>`;
    async function load() {
      list = await read("admin_list_support", { p_token: tok(), p_limit: PAGE, p_offset: page * PAGE });
      hasNext = list.length === PAGE;
    }
    function paintList() {
      const host = document.getElementById("sup-list");
      host.innerHTML = (!list.length ? UI.empty("لا توجد رسائل دعم", page > 0 ? "لا مزيد." : "ستظهر هنا رسائل المستخدمين.")
        : `<div class="list cols">${list.map(m => `
          <div class="card">
            <div class="row between"><b>${E(m.name || "مستخدم")}</b>${UI.badge(m.status)}</div>
            <div class="tiny" dir="ltr" style="margin-top:2px">${E(m.phone || "")}</div>
            <p style="margin:8px 0 0;white-space:pre-wrap;line-height:1.75">${E(m.message)}</p>
            <div class="tiny" style="margin-top:6px">${UI.dateAr(m.created_at)}</div>
            <div class="btn-row" style="margin-top:12px">
              <button class="btn sm line" data-act="sup-status" data-id="${m.id}" data-status="open">مفتوح</button>
              <button class="btn sm line" data-act="sup-status" data-id="${m.id}" data-status="resolved">تم الحل</button>
              <button class="btn sm line" data-act="sup-status" data-id="${m.id}" data-status="closed">إغلاق</button>
            </div>
            ${m.user_id ? `<button class="btn sm" data-act="sup-notify" data-uid="${m.user_id}" style="margin-top:10px">إرسال إشعار للمستخدم</button>` : ""}
          </div>`).join("")}</div>`) + UI.pager(page, hasNext);
      UI.wirePager(
        async () => { if (page > 0) { page--; await load(); paintList(); } },
        async () => { if (hasNext) { page++; await load(); paintList(); } });
      host.querySelectorAll('[data-act="sup-status"]').forEach(btn => btn.onclick = async () => {
        try {
          await rpc("admin_set_support_status", { p_token: tok(), p_id: btn.dataset.id, p_status: btn.dataset.status });
          UI.toast("تم التحديث", "ok"); await load(); paintList();
        } catch (e) { UI.toast(e.message, "err"); }
      });
      host.querySelectorAll('[data-act="sup-notify"]').forEach(btn => btn.onclick = () => notifyModal(btn.dataset.uid));
    }
    await load(); paintList();
  }
  function notifyModal(uid) {
    UI.modal(`<div class="mhead"><h3>إرسال إشعار</h3>
      <button class="iconbtn" id="mx">${UI.icon("x", 20)}</button></div>
      <div class="mform notify-form">
        <p class="tiny">${E(Lang.t("يصل الإشعار كما تكتبه تماماً، بأي لغة تختارها."))}</p>
        <div class="field"><label for="n-title">${E(Lang.t("العنوان"))}</label><input id="n-title" class="input" dir="auto" maxlength="150" autocomplete="off"></div>
        <div class="field"><label for="n-body">${E(Lang.t("الرسالة"))}</label><textarea id="n-body" class="textarea" dir="auto" maxlength="1800" rows="5"></textarea></div>
        <p class="form-error" id="n-err" role="alert"></p>
        <button class="btn" id="n-save">${UI.icon("bell", 17)} ${E(Lang.t("إرسال"))}</button>
      </div>`);
    document.getElementById("mx").onclick = UI.closeModal;
    document.getElementById("n-title").focus();
    document.getElementById("n-save").onclick = () => {
      // 2.32: one title and one message, sent exactly as written. The server
      // keeps a copy per language, so the same text is stored for each one.
      const title = val("n-title"), body = val("n-body");
      const err = document.getElementById("n-err");
      if (!title || !body) { err.textContent = Lang.t(!title ? "اكتب عنوان الإشعار" : "اكتب نص الرسالة"); return; }
      err.textContent = "";
      const titles = { ar: title, en: title, he: title }, bodies = { ar: body, en: body, he: body };
      guardedSave(async () => {
        const client=window.Control?.target() ? Control.client() : sb;
        const {data,error}=await client.rpc("salonieer_admin_send_i18n_v1",{
          p_slug:Control.target()?.slug||Shop.slug(),p_token:tok(),p_user:uid,p_titles:titles,p_bodies:bodies
        });
        if(error)throw error;
        return data;
      }, "n-save", "تم الإرسال");
    };
  }

  // A saved logo has to replace the one already on screen, including when the
  // new file happens to produce the same URL string. Re-pointing src at an
  // identical value is a no-op in the browser, so the element is rebuilt from
  // the shared renderer and its key tells a real change from a repaint.
  function refreshBrandMark() {
    const host = document.querySelector(".admin-brand");
    if (!host) return;
    const current = host.querySelector(".brand-logo");
    const markup = UI.logoImg("", "شعار " + (Control.target()?.name || App.settings?.app_name || "العمل"), { size: 38 });
    const next = document.createElement("div");
    next.innerHTML = markup;
    const key = next.firstElementChild?.getAttribute("data-logo-key") || "";
    if (current && current.getAttribute("data-logo-key") === key) return;
    host.querySelectorAll(".brand-logo").forEach(el => el.remove());
    host.insertAdjacentHTML("afterbegin", markup);
  }

  // ===================================================================
  //  APP SETTINGS
  // ===================================================================
  async function settings(body) {
    const s = await read("get_app_settings", {});
    const social = s.social_links || {};
    const wd = Array.isArray(s.working_days) ? s.working_days : [0, 1, 2, 3, 4, 5, 6];
    body.innerHTML = `
      <div class="grid g2" style="align-items:start">
        <div class="card pad-lg mform">
          <div class="sec-label">الهوية</div>
          ${field("اسم التطبيق", input("st-name", s.app_name || "METON"))}
          ${imageField("شعار التطبيق", "st-logo", s.logo_url)}
          ${colorField("اللون الأساسي", "st-color", SalonTheme.normalize(s).primary_color, SalonTheme.DEFAULTS.primary_color)}
          ${colorField("لون التفاصيل", "st-color2", SalonTheme.normalize(s).secondary_color, SalonTheme.DEFAULTS.secondary_color)}

          <div class="sec-label">حالة العمل</div>
          ${switchRow("st-open", "العمل مفتوح", s.shop_open !== false)}
          ${field("رسالة الإغلاق", textarea("st-closed", s.closed_message))}
          ${switchRow("st-maint", "وضع الصيانة", !!s.maintenance_mode)}

          <div class="sec-label">أيام العمل</div>
          <div class="svc-pick">${WD.map((d, i) =>
      `<label class="checkrow svc-line"><input type="checkbox" class="wd-cb" value="${i}" ${wd.includes(i) ? "checked" : ""}> ${d}</label>`
    ).join("")}</div>
        </div>

        <div class="card pad-lg mform">
          <div class="sec-label">الحجوزات</div>
          ${field("الفجوة بين المواعيد المقترحة (دقيقة)", input("st-dur", s.default_duration || 30, { type: "number", min: 5, step: 5 }))}
          <p class="tiny" style="margin:-6px 2px 4px">الأوقات المقترحة تظهر كل هذه المدة (٣٠ افتراضياً).
          ومع ذلك يضيف التطبيق وقتاً إضافياً فور انتهاء أي حجز، فلا تضيع أي فجوة حتى لو كانت ١٠ دقائق.</p>
          <div class="field booking-window">
            <label for="st-window">أيام الحجز المتاحة للعملاء</label>
            <div class="stepper" role="group" aria-label="أيام الحجز المتاحة للعملاء">
              <button type="button" class="stepper-btn" data-step="-1" aria-label="أقل">−</button>
              <input class="input" id="st-window" type="number" inputmode="numeric" min="1" max="60" step="1" value="${Number(s.booking_window_days) || 3}">
              <button type="button" class="stepper-btn" data-step="1" aria-label="أكثر">+</button>
            </div>
            <div class="window-preview" id="st-window-preview" aria-live="polite"></div>
            <p class="tiny">يشمل اليوم. ٣ = اليوم وغداً وبعد غد؛ ٥ يضيف يومين آخرين. يطبّق الخادم الحد نفسه عند الحجز.</p>
            <p class="tiny">المختصون ومديرو العمل يحجزون لعملائهم حتى ٣٠ يوماً مقدماً.</p>
          </div>
          ${switchRow("st-cancel", "السماح بالإلغاء", s.allow_cancellation !== false)}
          ${field("حد الإلغاء قبل الموعد (ساعات)", input("st-cancelh", s.cancel_limit_hours ?? 2, { type: "number" }))}
          <div class="field booking-window">
            <label for="st-maxactive">الحد الأقصى للحجوزات النشطة لكل عميل</label>
            <div class="stepper" role="group" aria-label="الحد الأقصى للحجوزات النشطة لكل عميل">
              <button type="button" class="stepper-btn" data-max-step="-1" aria-label="أقل">−</button>
              <input class="input" id="st-maxactive" type="number" inputmode="numeric" min="1" max="50" step="1" value="${Number(s.max_active_bookings) || 5}">
              <button type="button" class="stepper-btn" data-max-step="1" aria-label="أكثر">+</button>
            </div>
            <p class="tiny">الحجوزات النشطة هي «بانتظار التأكيد» و«مؤكد» التي لم ينتهِ وقتها بعد. الحجوزات المكتملة والملغاة والمنتهية لا تُحسب. يطبّق الخادم الحد عند كل حجز.</p>
          </div>
          ${switchRow("st-prod", "عرض المنتجات", s.show_products !== false)}
          ${switchRow("st-prices", "عرض الأسعار", s.show_prices !== false)}
          ${window.Money ? `<div class="field"><label for="st-currency">${E(Lang.t("عملة العمل"))}</label><select class="select" id="st-currency">${Money.options(s.currency)}</select>
            <p class="tiny">${E(Lang.t("أسعار خدماتك وفواتيرك وتقاريرك تظهر بهذه العملة. اشتراكك في METON يُدفع بالدولار الأمريكي."))}</p></div>` : ""}

          <div class="sec-label">التواصل</div>
          <div id="cn-box">${UI.loading()}</div>
          ${field("العنوان", input("st-addr", s.address))}
          ${field("إنستغرام", input("st-ig", social.instagram, { dir: "ltr" }))}
          ${field("فيسبوك", input("st-fb", social.facebook, { dir: "ltr" }))}
          ${field("تيك توك", input("st-tt", social.tiktok, { dir: "ltr" }))}
        </div>

        <div class="card pad-lg mform" style="grid-column:1/-1">
          <div class="sec-label">الوصول إلى العمل</div>
          <div id="st-link-box"></div>
          ${(() => { const mode = s.join_mode || (s.allow_new_customers === false ? "closed" : "open");
            const opt = (v, l, d) => `<label class="join-mode ${mode === v ? "on" : ""}"><input type="radio" name="st-join" value="${v}" ${mode === v ? "checked" : ""}><span><b>${E(Lang.t(l))}</b><small>${E(Lang.t(d))}</small></span></label>`;
            return `<div class="join-modes" role="radiogroup" aria-label="${E(Lang.t("طريقة الانضمام"))}">
              ${opt("open", "مفتوح للجميع", "أي شخص ينضم ويحجز مباشرة بعد إنشاء حسابه.")}
              ${opt("approval", "بموافقة العمل", "يتصفح الزائر الخدمات والمختصين والمواعيد، ويحجز بعد أن توافق على انضمامه.")}
              ${opt("closed", "مغلق للعملاء الجدد", "العملاء الحاليون فقط. لا حسابات جديدة.")}</div>`; })()}
          <div hidden>${switchRow("st-discover", "عمل عام (يظهر في «اكتشف الأعمال»)", !!s.discoverable)}</div>${/* METON: no Explore/Discover; the stored value is kept */ ""}
          ${"online_booking" in s ? `${switchRow("st-online", "الحجز عبر التطبيق", s.online_booking !== false)}
          <p class="tiny" style="margin:-6px 2px 4px">${E(Lang.t(Features.enabled("smart_waitlist") ? "عند الإيقاف يتصفح العملاء الخدمات والمختصين ولا يستطيعون الحجز أو الانتظار. أنت والمختصون تحجزون لهم كالمعتاد." : "عند الإيقاف يتصفح العملاء الخدمات والمختصين ولا يستطيعون الحجز. أنت والمختصون تحجزون لهم كالمعتاد."))}</p>` : ""}
          ${switchRow("st-newbook", "السماح للعملاء الجدد بالحجز", s.allow_new_customer_bookings !== false)}
          ${"team_requests_on" in s ? `${switchRow("st-teamreq", "السماح بطلبات الانضمام إلى الفريق", !!s.team_requests_on)}
          <p class="tiny" style="margin:-6px 2px 4px">يظهر للزوار زر «اطلب الانضمام إلى الفريق». الطلب وحده لا يمنح أي صلاحية: تختار الدور والصلاحيات عند القبول.</p>` : ""}
          <p class="tiny" style="margin:-6px 2px 4px">العميل الجديد هو من لم تكتمل له زيارة في العمل بعد. العملاء الحاليون لا يتأثرون.</p>
          <div hidden>${/* METON: the search listing fields stay stored but are not shown (no Explore/Discover) */ ""}
          <div class="grid g2">
            ${field("المدينة (تظهر في البحث)", input("st-city", s.discovery_city, { ph: "مثال: نابلس" }))}
            ${field("وصف قصير في نتائج البحث", input("st-dabout", s.discovery_about, { ph: "مثال: حلاقة رجالية وعناية باللحية" }))}
          </div>
          <div class="field"><label for="st-geo">موقع العمل على الخريطة (اختياري)</label>
            <div class="row" style="gap:8px"><input id="st-geo" class="input" dir="ltr" placeholder="32.2211, 35.2544" value="${E(s.discovery_lat != null && s.discovery_lng != null ? s.discovery_lat + ", " + s.discovery_lng : "")}" style="flex:1">
            <button type="button" class="btn line sm" id="st-geo-here">${UI.icon("pin", 16)} موقعي الحالي</button></div>
            <p class="tiny">الصق الإحداثيات أو رابط خرائط Google. يُستخدم لترتيب الأعمال حسب القرب فقط.</p></div>
          </div>
          <div class="sec-label">أدوات</div>
          <div class="list">
            ${window.Business?.available() ? `<button type="button" class="lrow" id="st-biz"><div class="ic">${UI.icon("money", 18)}</div><div class="t">إعدادات الأعمال<div class="tiny">العملة والسماح بمبلغ متبقٍ عند الدفع</div></div><span class="chev">${UI.icon("chev", 18)}</span></button>` : ""}
            <button type="button" class="lrow" data-nav="${navBase()}/help"><div class="ic">${UI.icon("info", 18)}</div><div class="t">المساعدة والأسئلة الشائعة</div><span class="chev">${UI.icon("chev", 18)}</span></button>
          </div>
          <div class="sec-label">المحتوى النصي</div>
          ${field("عن التطبيق", textarea("st-about", s.about_text))}
          ${field("الشروط والأحكام", textarea("st-terms", s.terms_text))}
          ${field("سياسة الخصوصية", textarea("st-privacy", s.privacy_text))}
          <button class="btn" id="st-save" style="max-width:280px">حفظ الإعدادات</button>
        </div>
      </div>`;

    wireImage("st-logo", "logo"); wireColor("st-color"); wireColor("st-color2");
    // 2.47: optional business contact numbers — none, one or several (up to 5), WhatsApp or not, shown to customers or
    // not. Contact details only: no code, never a sign-in, never access. Businesses without 2.47: the two old fields.
    const cn = { list: null };
    const cnHost = document.getElementById("cn-box");
    const cnRow = (n, i) => `<div class="cn-row" data-cn="${i}">
        <input class="input cn-num" dir="ltr" inputmode="tel" value="${E(n.number || "")}" placeholder="+970599000000" aria-label="${E(Lang.t("رقم التواصل"))}" data-i18n-skip>
        <input class="input cn-label" maxlength="40" value="${E(n.label || "")}" placeholder="${E(Lang.t("اسم الرقم (اختياري)"))}" aria-label="${E(Lang.t("اسم الرقم (اختياري)"))}">
        <label class="cn-check"><input type="checkbox" class="cn-wa" ${n.whatsapp ? "checked" : ""}> <span>${E(Lang.t("واتساب"))}</span></label>
        <label class="cn-check"><input type="checkbox" class="cn-pub" ${n.public !== false ? "checked" : ""}> <span>${E(Lang.t("يظهر للعملاء"))}</span></label>
        <button type="button" class="iconbtn sm cn-del" aria-label="${E(Lang.t("حذف الرقم"))}">${UI.icon("x", 15)}</button></div>`;
    const readCn = () => [...cnHost.querySelectorAll(".cn-row")].map(r => ({ number: r.querySelector(".cn-num").value.trim(), label: r.querySelector(".cn-label").value.trim(),
      whatsapp: r.querySelector(".cn-wa").checked, public: r.querySelector(".cn-pub").checked }));
    const paintCn = () => {
      cnHost.innerHTML = `<div class="field"><label>${E(Lang.t("أرقام التواصل (اختياري)"))}</label>
        <div class="cn-list">${cn.list.map(cnRow).join("") || `<p class="tiny">${E(Lang.t("لا توجد أرقام تواصل. يمكنك إضافتها في أي وقت."))}</p>`}</div>
        ${cn.list.length < 5 ? `<button type="button" class="btn line sm" id="cn-add">${UI.icon("plus", 15)} ${E(Lang.t("إضافة رقم"))}</button>` : ""}
        <p class="tiny">${E(Lang.t("أرقام العمل للتواصل فقط: لا تحتاج رمز تأكيد، ولا تُستخدم لتسجيل الدخول أو لمنح أي صلاحية. يرى العملاء الأرقام المحددة «يظهر للعملاء» فقط."))}</p></div>`;
      cnHost.querySelectorAll(".cn-del").forEach(b => b.onclick = () => { cn.list = readCn(); cn.list.splice(Number(b.closest(".cn-row").dataset.cn), 1); paintCn(); });
      const add = document.getElementById("cn-add");
      if (add) add.onclick = () => { cn.list = readCn(); cn.list.push({ number: "", label: "", whatsapp: false, public: true }); paintCn(); cnHost.querySelector(".cn-row:last-child .cn-num")?.focus(); };
    };
    rpc("admin_contact_numbers", { p_token: tok() }).then(list => { cn.list = Array.isArray(list) ? list : []; paintCn(); })
      .catch(() => { cnHost.innerHTML = `${field("هاتف التواصل", input("st-phone", s.contact_phone, { dir: "ltr" }))}${field("واتساب", input("st-wa", s.whatsapp_number, { dir: "ltr" }))}`; });
    // 2.34: the salon's direct link (opens the salon in the app, or the store).
    rpcCached("admin_salon_link", { p_token: tok() }, 60000).then(link => {
      const host = document.getElementById("st-link-box"); if (!host || !link?.url) return;
      host.innerHTML = `<div class="field"><label>${E(Lang.t("رابط العمل"))}</label>${linkBox(link, "st-link")}
        <p class="tiny">${E(Lang.t("شاركه على إنستغرام أو واتساب: يفتح عملك مباشرة في تطبيق METON، أو متجر التطبيقات إن لم يكن مثبتاً. الرابط لا يتجاوز «الانضمام بموافقة»."))}</p></div>`;
      wireLink(document.getElementById("st-link"), link);
    }).catch(() => {});

    // Booking window: a stepper and a live preview of the days customers see.
    const windowInput = document.getElementById("st-window");
    const clampWindow = v => Math.min(60, Math.max(1, Math.round(Number(v) || 3)));
    const paintWindow = () => {
      const n = clampWindow(windowInput.value);
      const shown = Math.min(n, 7);
      const chips = Array.from({ length: shown }, (_, i) => {
        const d = new Date(); d.setDate(d.getDate() + i);
        const iso = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
        return `<span class="window-day">${UI.esc(Smart.dayLabel(iso))}</span>`;
      }).join("");
      const more = n > shown ? `<span class="window-day more">+${Lang.number(n - shown)}</span>` : "";
      document.getElementById("st-window-preview").innerHTML = chips + more;
    };
    document.querySelectorAll(".booking-window [data-step]").forEach(b => b.onclick = () => {
      windowInput.value = clampWindow(Number(windowInput.value) + Number(b.dataset.step));
      paintWindow();
    });
    windowInput.oninput = paintWindow;
    windowInput.onblur = () => { windowInput.value = clampWindow(windowInput.value); paintWindow(); };
    paintWindow();
    const maxInput = document.getElementById("st-maxactive");
    const clampMax = v => Math.min(50, Math.max(1, Math.round(Number(v) || 5)));
    document.querySelectorAll("[data-max-step]").forEach(b => b.onclick = () => { maxInput.value = clampMax(Number(maxInput.value) + Number(b.dataset.maxStep)); });
    maxInput.onblur = () => { maxInput.value = clampMax(maxInput.value); };
    // "32.2, 35.2", or a Google Maps link with @lat,lng or ?q=lat,lng.
    const parseGeo = v => { const m = String(v || "").match(/(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/); return m ? [Number(m[1]), Number(m[2])] : null; };
    const geoBtn = document.getElementById("st-geo-here");
    if (geoBtn) geoBtn.onclick = async () => {
      const p = await Locate.locate("salon", { highAccuracy: true });
      const box = document.getElementById("st-geo");
      if (p && box) box.value = Number(p.lat).toFixed(5) + ", " + Number(p.lng).toFixed(5);
    };
    const bizBtn = document.getElementById("st-biz");
    if (bizBtn) bizBtn.onclick = async () => { try { Business.settingsModal(await Business.context(true)); } catch (e) { UI.toast(e.message, "err"); } };

    document.getElementById("st-save").onclick = async () => {
      const working = Array.from(document.querySelectorAll(".wd-cb:checked")).map(c => Number(c.value));
      const data = {
        app_name: val("st-name"), logo_url: val("st-logo"),
        primary_color: val("st-color"), secondary_color: val("st-color2"),
        shop_open: chk("st-open"), closed_message: val("st-closed"), maintenance_mode: chk("st-maint"),
        working_days: working,
        default_duration: numv("st-dur") || 30,
        allow_cancellation: chk("st-cancel"), cancel_limit_hours: numv("st-cancelh") ?? 2,
        booking_window_days: clampWindow(windowInput.value),
        show_products: chk("st-prod"), show_prices: chk("st-prices"),
        ...(cn.list ? {} : { contact_phone: val("st-phone"), whatsapp_number: val("st-wa") }), address: val("st-addr"),
        social_links: { instagram: val("st-ig"), facebook: val("st-fb"), tiktok: val("st-tt") },
        about_text: val("st-about"), terms_text: val("st-terms"), privacy_text: val("st-privacy"),
      };
      const geoText = val("st-geo"), geo = parseGeo(geoText);
      if (geoText && !geo) { UI.toast("لم نتعرف على الإحداثيات. مثال: 32.2211, 35.2544", "err"); return; }
      UI.busy("st-save", true);
      try {
        await rpc("admin_save_settings", { p_token: tok(), p_data: data });
        if (cn.list) cn.list = (await rpc("admin_save_contact_numbers", { p_token: tok(), p_numbers: readCn() })).numbers || [];
        await rpc("admin_save_booking_policy", { p_token: tok(), p_data: {
          max_active_bookings: clampMax(maxInput.value), discoverable: chk("st-discover"),
          join_mode: document.querySelector('input[name="st-join"]:checked')?.value || "open",
          ...(document.getElementById("st-teamreq") ? { team_requests_on: chk("st-teamreq") } : {}),
          ...(document.getElementById("st-online") ? { online_booking: chk("st-online") } : {}),
          allow_new_customer_bookings: chk("st-newbook"), discovery_city: val("st-city"), discovery_about: val("st-dabout"),
          discovery_lat: geo ? geo[0] : null, discovery_lng: geo ? geo[1] : null } });
        // 2.43: the salon's currency (every plan); amounts already recorded keep their numbers.
        const cur = val("st-currency");
        if (cur && cur !== String(s.currency || "ILS").toUpperCase()) {
          await rpc("admin_set_currency_v1", { p_token: tok(), p_currency: cur });
          s.currency = cur; window.rpcCacheBust?.("get_app_settings");
        }
        if (Control.target()) {
          const refreshed=await Control.refreshTarget();
          refreshBrandMark();
          const brandName=document.querySelector(".admin-brand b");if(brandName&&refreshed?.name)brandName.textContent=refreshed.name;
        } else {
          App.settings = await rpc("get_app_settings", {});
          Auth.applyTheme();
          refreshBrandMark();
          document.title = App.settings.app_name || "METON";
        }
        UI.toast("تم حفظ الإعدادات", "ok"); UI.busy("st-save", false);
      } catch (e) { UI.toast(e.message, "err"); UI.busy("st-save", false); }
    };
  }

  const RENDER = { business: body => Business.hub(body), help: body => window.Rework ? Rework.helpPage(body, "admins") : null,
    ...Object.fromEntries((window.Business ? Business.SECTIONS : []).map(x => ["biz-" + x.id, body => Business.section(x.id, body)])),
    loyalty: body => Loyalty.adminTab(body), redemptions: body => Loyalty.requestsPage(body), notifications: body => NotificationAdmin.salon(body, Shop.slug()),
    // 2.32: one schedule (day / week) for the owner; Daily Management and the Gallery are gone.
    // 2.34: a member who may only VIEW every specialist's schedule opens bookings read-only.
    schedule: body => Schedule.owner(body, { token: tok(), base: navBase(), editBooking: bookingModal, canManage: owner() || Auth.can("bookings_manage") }),
    // 2.33: the team, the Action Center, permissions and the audit log (members.js).
    barbers: body => Team.page(body), requests: body => Team.requestsPage(body), permissions: body => Team.permissionsPage(body), audit: body => Team.auditPage(body),
    home, insights, bookings, services, categories, products, users, support, settings };

  return { dashboard, bookingModal, paintRequestBadge };
})();
window.Admin = Admin;
