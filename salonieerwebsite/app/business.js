/* Business Suite (2.25): Smart Checkout, receipts, Financial Management,
   expenses, deposits and the cancellation policy, inventory, employee
   commissions, coupons, service packages, smart waitlist, retention
   suggestions, online payments (Payment Core), team permissions and the audit
   trail — plus the customer screens (deposit, waitlist, packages) and the
   METON Admin provider registry. 2.28: Employee Earnings and Attendance
   (workforce.js), purchases with cost, barcodes and internal use in Inventory,
   and the four Smart Checkout payment methods.

   The server decides everything: entitlements (METON Admin), employee
   permissions (the salon admin), every price, discount, coupon, package
   balance, deposit and commission. These screens only say WHAT is sold and
   HOW it was paid, and show what the server answers. Every money action
   carries one request key, so a double tap or a retry is applied once. */
window.Business = (() => {
  "use strict";
  const E = value => UI.esc(value);
  const isPlatform = () => !!window.Control?.target();
  const tok = () => isPlatform() ? "__platform__" : App.token;
  const salonSlug = () => window.Control?.target()?.slug || Shop.slug();
  const adminBase = () => isPlatform() ? "#/platform/salon/" + Control.target().slug : "#/admin";
  const field = id => document.getElementById(id);
  const val = id => (field(id)?.value ?? "").trim();
  const pick = (ar, en, he) => { const l = Lang.get(); return l === "en" ? en : l === "he" ? he : ar; };
  // Default expense categories are seeded in Arabic; salon-made names stay as typed.
  const DEFAULT_CATS = ["إيجار", "رواتب", "مستلزمات", "كهرباء وماء", "تسويق", "صيانة", "أخرى"];
  const catName = n => !n ? Lang.t("أخرى") : DEFAULT_CATS.includes(n) ? Lang.t(n) : n;
  const lineName = n => n === "دفعة" || n === "خدمة" ? Lang.t(n) : n;
  const requestKey = () => (window.crypto?.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 12));
  const num = n => (Number(n) || 0).toLocaleString(Lang.locale());
  const pct = n => (Number(n) || 0).toLocaleString(Lang.locale(), { maximumFractionDigits: 1 }) + "%";
  const day = d => d ? UI.dateAr(String(d).slice(0, 10)) : "—";
  const stamp = d => d ? new Date(d).toLocaleString(Lang.locale(), { dateStyle: "medium", timeStyle: "short" }) : "";
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const addDays = (s, n) => { const d = new Date(String(s).slice(0, 10) + "T12:00:00"); d.setDate(d.getDate() + n); return iso(d); };

  const FEATURES = ["financial_management", "smart_checkout", "inventory", "employee_commissions", "deposits", "online_payments",
    "coupons", "smart_waitlist", "retention_suggestions", "service_packages", "employee_earnings", "attendance"];
  const available = () => FEATURES.some(f => Features.enabled(f));

  // ── Context (who is asking, what the salon has) ────────────────────────
  let ctx = null, ctxKey = "", ctxAt = 0;
  async function context(force = false) {
    const key = salonSlug() + ":" + tok();
    if (!force && ctx && ctxKey === key && Date.now() - ctxAt < 30000) return ctx;
    ctx = await rpc("biz_context", { p_token: tok() }); ctxKey = key; ctxAt = Date.now();
    return ctx;
  }
  const can = (c, permission) => !!c && (c.actor.admin || (c.actor.permissions || []).includes(permission));
  const on = (c, feature) => !!c?.features?.[feature];
  // 2.48: the owner-level business pages a team member may open, by the TEAM permission the owner granted (the same
  // map as the dashboard menu, admin.js TAB_PERM). The server checks the same permission on every call.
  const PAGE_PERM = { finance: "finance", earnings: "finance", commissions: "finance", audit: "audit", attendance: "attendance",
    coupons: "marketing", retention: "marketing", packages: "services", waitlist: "bookings_view" };
  const hasTeamPerm = (c, p) => !!p && ((c?.actor?.permissions || []).includes(p) || !!window.Auth?.can?.(p));
  const pageAllowed = (c, id) => c.actor.admin || !(id in PAGE_PERM) && !["payments", "team"].includes(id) || hasTeamPerm(c, PAGE_PERM[id]);
  // Inside a page the member was granted, they act as the owner does there (the server answers them as such).
  const asPageOwner = (c, id) => !c.actor.admin && hasTeamPerm(c, PAGE_PERM[id]) ? { ...c, actor: { ...c.actor, admin: true } } : c;

  // Amounts: the salon currency, written the way the rest of the app writes prices (2.43: Money, money.js, which
  // also keeps the minus sign on the left of the number in Arabic and Hebrew).
  let currency = "ILS";
  function money(n) { return Money.fmt(n, currency); }
  const moneyIn = (id, value, attrs = "") => `<input class="input" id="${id}" type="number" inputmode="decimal" min="0" step="0.01" dir="ltr" value="${value ?? ""}" ${attrs}>`;

  // 2.28: Smart Checkout shows exactly four methods, in this order. Cash and
  // Card at reception (the salon's own terminal) work today; card through the
  // app and bank transfer are shown, unavailable, for later. Older receipts may
  // still carry the former methods.
  // 2.31: the employee completing the checkout is the one confirming the money
  // was received, so there is no separate tick: completing sends the payment as
  // confirmed (the server still records who received it and when).
  const PAY = { cash: "نقداً", card: "بطاقة في الاستقبال", online: "بطاقة عبر التطبيق", bank_transfer: "تحويل بنكي", external_terminal: "جهاز دفع خارجي", other: "أخرى" };
  const PAY_ICON = { cash: "money", card: "lock", external_terminal: "phone", online: "globe", bank_transfer: "globe", other: "tag" };
  const CHECKOUT_METHODS = [["cash", true], ["card", true], ["online", false], ["bank_transfer", false]];
  // Money the salon pays out (expenses) keeps its own wording.
  const EXP_PAY = { cash: "نقداً", card: "بطاقة", external_terminal: "جهاز دفع خارجي", online: "دفع إلكتروني", other: "أخرى" };
  // Own class names: .wf-method belongs to the attendance method cards.
  const methodPicker = (name, current) => `<div class="pay-methods" role="radiogroup" aria-label="${E(Lang.t("طريقة الدفع"))}">${CHECKOUT_METHODS.map(([m, ok]) => ok
    ? `<button type="button" role="radio" aria-checked="${m === current}" class="pay-method ${m === current ? "active" : ""}" data-${name}="${m}"><span class="pay-method-icon" aria-hidden="true">${UI.icon(PAY_ICON[m], 18)}</span><span class="pay-method-name">${E(Lang.t(PAY[m]))}</span></button>`
    : `<button type="button" role="radio" aria-checked="false" class="pay-method off" disabled aria-disabled="true"><span class="pay-method-icon" aria-hidden="true">${UI.icon(PAY_ICON[m], 18)}</span><span class="pay-method-name">${E(Lang.t(PAY[m]))}</span><small class="pay-method-note">${E(Lang.t("غير متاح حالياً"))}</small></button>`).join("")}</div>`;
  const CHECKOUT_STATE = { completed: ["مكتملة", "ok"], partially_refunded: ["مسترجعة جزئياً", "warn"], refunded: ["مسترجعة", "muted"], voided: ["ملغاة", "danger"], corrected: ["صُحّحت", "info"] };
  // 2.34: what a money row on a receipt was.
  const REFUND_KIND = { refund: "أُعيد للعميل", void: "أُلغي (لم يُدفع فعلاً)", transfer: "نُقل إلى الفاتورة المصحّحة" };
  const receiptState = r => r.status === "voided" && r.corrected_by_id ? "corrected" : r.status;
  const DEPOSIT_STATE = { pending: ["بانتظار الدفع", "warn"], paid: ["مدفوع", "ok"], applied: ["خُصم من الفاتورة", "info"], refunded: ["مسترجع", "muted"],
    partially_refunded: ["مسترجع جزئياً", "warn"], forfeited: ["محتجز حسب السياسة", "danger"], expired: ["انتهت المهلة", "muted"], cancelled: ["ملغى", "muted"],
    failed: ["فشل الدفع", "danger"], waived: ["معفى", "info"] };
  const WAIT_STATE = { waiting: ["بالانتظار", "warn"], offered: ["عُرض موعد", "info"], booked: ["تم الحجز", "ok"], expired: ["انتهى", "muted"], cancelled: ["ملغى", "muted"] };
  const RETENTION_STATE = { suggested: ["مقترح", "warn"], viewed: ["تمت المشاهدة", "info"], dismissed: ["مستبعد", "muted"], action_taken: ["تم الإجراء", "ok"] };
  const PACKAGE_STATE = { active: ["نشطة", "ok"], used_up: ["استُخدمت بالكامل", "muted"], expired: ["منتهية", "muted"], cancelled: ["ملغاة", "danger"], refunded: ["مسترجعة", "muted"] };
  const COUPON_STATE = { active: ["نشط", "ok"], inactive: ["متوقف", "muted"], expired: ["منتهي", "muted"], used_up: ["استُنفد", "warn"], scheduled: ["لم يبدأ", "info"] };
  const STOCK_STATE = { in: ["متوفر", "ok"], low: ["مخزون منخفض", "warn"], out: ["نفد", "danger"] };
  const MOVE = { sale: "بيع", refund: "استرجاع", void: "إلغاء فاتورة", adjust: "تعديل", restock: "توريد", count: "جرد", loyalty: "نقاط الولاء", edit: "تعديل المنتج", other: "تعديل من صفحة المنتجات",
    purchase: "شراء", internal: "استهلاك داخلي" };
  const PROVIDER_STATE = { architecture_ready: ["البنية جاهزة", "info"], pending_documentation: ["بانتظار التوثيق الرسمي", "warn"],
    pending_provider_approval: ["بانتظار موافقة المزود", "warn"], sandbox_tested: ["مُختبر في بيئة التجربة", "info"], live: ["مفعّل", "ok"] };
  const MERCHANT_STATE = { unconfirmed: ["الموافقة غير مؤكدة", "muted"], confirmed: ["الموافقة مؤكدة", "ok"], not_permitted: ["غير مسموح", "danger"] };
  const ACCOUNT_STATE = { requested: ["تم طلب الربط", "warn"], pending_review: ["قيد المراجعة", "info"], connected: ["مربوط", "ok"], disabled: ["موقوف", "muted"] };
  const PERMS = { checkout: ["إتمام الدفع للمواعيد", "money"], discounts: ["الخصم اليدوي", "tag"], deposits: ["تسجيل العربون", "lock"],
    inventory: ["إدارة المخزون", "box"], own_commissions: ["رؤية عمولته التقديرية", "chart"] };
  const pill = (map, key) => { const p = map[key] || [key, "muted"]; return `<span class="badge ${p[1]}">${E(Lang.t(p[0]))}</span>`; };
  const errorBox = id => `<p class="form-error" id="${id}" role="alert"></p>`;
  const showError = (id, e) => { const box = field(id); if (box) box.textContent = e?.message || String(e); else UI.toast(e?.message || String(e), "err"); };

  const SECTIONS = [
    { id: "checkout", feature: "smart_checkout", l: "الدفع والفواتير", d: "إتمام الزيارة والدفع والفواتير", i: "money", badge: "outstanding" },
    { id: "cash", feature: "smart_checkout", l: "صندوق النقد", d: "النقد المتوقع وإغلاق الصندوق اليومي", i: "lock" },
    { id: "finance", feature: "financial_management", l: "الإدارة المالية", d: "الإيرادات والمصاريف والتقارير والتصدير", i: "chart" },
    { id: "deposits", feature: "deposits", l: "العربون", d: "العربون وسياسة الإلغاء وعدم الحضور", i: "lock", badge: "deposits" },
    { id: "inventory", feature: "inventory", l: "المخزون", d: "الكميات وتنبيهات النقص وحركة المخزون", i: "box", badge: "low_stock" },
    { id: "commissions", feature: "employee_commissions", l: "العمولات", d: "عمولات تقديرية لكل مختص", i: "users" },
    { id: "earnings", feature: "employee_earnings", l: "أرباح الموظفين", d: "الرواتب والعمولات والساعات والدفعات والموظفون المساندون", i: "money" },
    { id: "attendance", feature: "attendance", l: "الحضور والانصراف", d: "تسجيل الحضور والانصراف والوقت الإضافي", i: "clock", badge: "attendance" },
    { id: "coupons", feature: "coupons", l: "الكوبونات", d: "أكواد خصم وحدود الاستخدام", i: "tag" },
    { id: "packages", feature: "service_packages", l: "باقات الخدمات", d: "جلسات مدفوعة مسبقاً ورصيدها", i: "star" },
    { id: "waitlist", feature: "smart_waitlist", l: "قائمة الانتظار", d: "عملاء ينتظرون موعداً مناسباً", i: "clock", badge: "waitlist" },
    { id: "retention", feature: "retention_suggestions", l: "استعادة العملاء", d: "عملاء لم يحجزوا منذ فترة", i: "refresh", badge: "retention" },
    { id: "payments", feature: "online_payments", l: "الدفع الإلكتروني", d: "ربط حساب التاجر الخاص بالعمل", i: "globe" },
    { id: "team", l: "صلاحيات الفريق", d: "ما يسمح به لكل مختص داخل العمل", i: "shield" },
    { id: "audit", l: "سجل العمليات", d: "كل عملية مالية مع المنفذ والوقت والسبب", i: "list" },
  ];
  const sectionOn = (s, c) => s.feature ? on(c, s.feature) : FEATURES.some(f => on(c, f));

  // ── Admin: hub ─────────────────────────────────────────────────────────
  async function hub(body) {
    const c = await context(true); currency = c.currency || "ILS";
    const list = SECTIONS.filter(s => sectionOn(s, c) && pageAllowed(c, s.id));
    let today = null;
    if (on(c, "financial_management") && (c.actor.admin || hasTeamPerm(c, "finance"))) { try { today = await rpc("admin_biz_report_finance", { p_token: tok(), p_from: c.today, p_to: c.today }); } catch {} }
    const kpi = (value, label, icon, tone, sub) => `<article class="admin-kpi ${tone}"><div class="admin-kpi-head"><span>${E(Lang.t(label))}</span><i>${UI.icon(icon, 17)}</i></div><strong>${value}</strong><small>${E(sub)}</small></article>`;
    body.innerHTML = `<section class="admin-overview-hero biz-hero"><div><span class="admin-eyebrow">BUSINESS SUITE</span><h1>${E(Lang.t("الأعمال"))}</h1>
        <p>${E(Lang.t("المال والعمليات في مكان واحد: الدفع، الفواتير، العربون، المخزون والتقارير. كل رقم يحسبه الخادم ويُسجّل بسجل عمليات."))}</p></div>
        <div class="admin-hero-actions">${on(c, "smart_checkout") ? `<button class="btn" data-biz-open="checkout">${UI.icon("money", 17)} ${E(Lang.t("إتمام زيارة"))}</button>` : ""}
        ${c.actor.admin ? `<button class="btn line" id="biz-settings">${UI.icon("cog", 17)} ${E(Lang.t("إعدادات الأعمال"))}</button>` : ""}</div></section>
      ${today ? `<div class="admin-kpi-grid">${kpi(money(today.current.revenue), "إيراد اليوم", "money", "green", pick(`${num(today.current.checkouts)} فاتورة`, `${num(today.current.checkouts)} receipts`, `${num(today.current.checkouts)} קבלות`))}
        ${kpi(money(today.current.collected), "المحصّل اليوم", "check", "blue", Lang.t("كل طرق الدفع"))}
        ${kpi(money(today.outstanding_now.amount), "مبالغ مستحقة", "clock", "amber", pick(`${num(today.outstanding_now.count)} فاتورة مفتوحة`, `${num(today.outstanding_now.count)} open receipts`, `${num(today.outstanding_now.count)} קבלות פתוחות`))}
        ${kpi(money(today.upcoming.amount), "إيراد متوقع", "calendar", "violet", pick(`${num(today.upcoming.count)} حجز خلال 30 يوماً`, `${num(today.upcoming.count)} bookings in 30 days`, `${num(today.upcoming.count)} הזמנות ב־30 יום`))}</div>` : ""}
      <div class="biz-grid">${list.map(s => {
        const n = s.badge ? Number(c.badges?.[s.badge] || 0) : 0;
        return `<button class="biz-tile" data-biz-open="${s.id}"><span class="biz-tile-icon">${UI.icon(s.i, 22)}</span><span class="biz-tile-text"><b>${E(Lang.t(s.l))}</b><small>${E(Lang.t(s.d))}</small></span>${n ? `<em class="biz-count">${num(n)}</em>` : ""}${UI.icon("chev", 18)}</button>`;
      }).join("")}</div>
      ${c.actor.admin ? `<p class="tiny biz-note">${UI.icon("info", 14)} ${E(Lang.t("تفعيل هذه الأدوات حسب باقة العمل يتم عبر إدارة METON. صلاحيات الموظفين يحددها مدير العمل من «صلاحيات الفريق»."))}</p>` : ""}`;
    body.querySelectorAll("[data-biz-open]").forEach(b => b.onclick = () => Router.go(adminBase() + "/biz-" + b.dataset.bizOpen));
    const st = field("biz-settings"); if (st) st.onclick = () => settingsModal(c);
  }

  function settingsModal(c) {
    const s = c.settings;
    UI.modal(`<div class="mhead"><h3>${E(Lang.t("إعدادات الأعمال"))}</h3><button class="iconbtn" id="bs-x" aria-label="إغلاق">${UI.icon("x", 20)}</button></div>
      <form class="mform" id="bs-form">
        <div class="field"><label for="bs-currency">${E(Lang.t("العملة"))}</label><select class="select" id="bs-currency">${Money.options(s.currency)}</select></div>
        ${on(c, "smart_checkout") ? `<label class="notification-toggle"><span>${E(Lang.t("السماح بإغلاق الزيارة مع مبلغ متبقٍ"))}</span><input type="checkbox" id="bs-outstanding" ${s.allow_outstanding ? "checked" : ""}></label>` : ""}
        <button class="btn" type="submit" id="bs-save">${E(Lang.t("حفظ"))}</button>${errorBox("bs-err")}</form>`);
    field("bs-x").onclick = UI.closeModal;
    field("bs-form").onsubmit = async e => {
      e.preventDefault(); UI.busy("bs-save", true);
      const data = { currency: val("bs-currency") };
      if (field("bs-outstanding")) data.allow_outstanding = field("bs-outstanding").checked;
      try { await rpc("admin_biz_save_settings", { p_token: tok(), p_data: data }); UI.closeModal(); UI.toast("تم الحفظ", "ok"); await context(true); Router.resolve?.(); }
      catch (err) { showError("bs-err", err); UI.busy("bs-save", false); }
    };
  }

  // The dashboard frame already shows where the person is (breadcrumbs, title,
  // the other pages of the group), so a section only adds its own actions: one
  // row under the title that wraps on narrow screens instead of squeezing it.
  function sectionHead(s, actions = "") {
    return actions ? `<div class="biz-head biz-head-actions">${actions}</div>` : "";
  }

  async function section(id, body) {
    // 2.34: the cash drawer asks the server directly (a member with only that
    // permission has no other business page to load a context for).
    if (id === "cash") { if (!Features.enabled("smart_checkout")) { body.innerHTML = UI.empty(Lang.t("هذه الميزة غير متاحة لهذا العمل"), Lang.t("تفعيلها يتم عبر إدارة METON حسب باقة العمل.")); return; } return cashPage(body); }
    const c = await context(); currency = c.currency || "ILS";
    const s = SECTIONS.find(x => x.id === id);
    if (!s || !sectionOn(s, c)) { body.innerHTML = UI.empty(Lang.t("هذه الميزة غير متاحة لهذا العمل"), Lang.t("تفعيلها يتم عبر إدارة METON حسب باقة العمل.")); return; }
    if (!pageAllowed(c, id)) { body.innerHTML = UI.empty(Lang.t("ليس لديك صلاحية لهذا الإجراء"), ""); return; }
    const render = { checkout: checkoutPage, finance: financePage, deposits: depositsPage, inventory: inventoryPage, commissions: commissionsPage,
      coupons: couponsPage, packages: packagesPage, waitlist: waitlistPage, retention: retentionPage, payments: paymentsPage, team: teamPage, audit: auditPage,
      earnings: (b, ctx) => Workforce.earningsPage(b, ctx), attendance: (b, ctx) => Workforce.attendancePage(b, ctx) }[id];
    await render(body, asPageOwner(c, id), s);
  }

  // ── Smart Checkout: the day's queue and receipts ───────────────────────
  async function checkoutPage(body, c, s, opts = {}) {
    let date = opts.date || c.today;
    body.innerHTML = `${opts.embedded ? "" : sectionHead(s, c.actor.admin ? `<button class="btn sm" id="biz-walkin">${UI.icon("plus", 16)} ${E(Lang.t("بيع مباشر"))}</button>` : "")}
      <div class="card biz-toolbar"><label class="biz-date">${E(Lang.t("اليوم"))}<input class="input" type="date" id="biz-day" value="${E(date)}"></label>
        <button class="btn line sm" id="biz-today">${E(Lang.t("اليوم"))}</button></div>
      <div id="biz-queue">${UI.loading()}</div>`;
    const load = async () => {
      const host = field("biz-queue"); if (!host) return;
      let q;
      try { q = await rpc("biz_list_checkout_queue", { p_token: tok(), p_date: date }); } catch (e) { host.innerHTML = `<div class="card">${E(e.message)}</div>`; return; }
      host.innerHTML = `<section class="biz-panel"><div class="biz-panel-head"><h3>${E(Lang.t("زيارات بانتظار الدفع"))}</h3><span class="badge muted">${num(q.open.length)}</span></div>
          ${q.open.length ? `<div class="biz-rows">${q.open.map(b => `<article class="biz-row">
            <div class="biz-row-time"><b>${E(UI.timeAr(b.booking_time))}</b><small>${E(Lang.duration(b.duration))}</small></div>
            <div class="biz-row-main"><b data-i18n-skip>${E(b.customer || "—")}</b><small><span data-i18n-skip>${E(b.service_name || "")}</span> · <span data-i18n-skip>${E(b.barber_name || "")}</span></small>
              <div class="biz-row-tags">${UI.badge(b.status)}${b.deposit ? pill(DEPOSIT_STATE, b.deposit.status) + (Number(b.deposit.available) > 0 ? ` <span class="badge info">${E(Lang.t("عربون"))} ${E(money(b.deposit.available))}</span>` : "") : ""}</div></div>
            <div class="biz-row-side"><strong>${E(money(b.price))}</strong><button class="btn sm" data-checkout="${E(b.booking_id)}">${E(Lang.t("إتمام الدفع"))}</button></div></article>`).join("")}</div>`
            : `<p class="tiny biz-muted">${E(Lang.t("لا توجد زيارات مفتوحة في هذا اليوم."))}</p>`}</section>
        <section class="biz-panel"><div class="biz-panel-head"><h3>${E(Lang.t("فواتير اليوم"))}</h3><span class="badge muted">${num(q.done.length)}</span></div>
          ${q.done.length ? `<div class="biz-rows">${q.done.map(r => receiptRow(r)).join("")}</div>` : `<p class="tiny biz-muted">${E(Lang.t("لا توجد فواتير بعد."))}</p>`}</section>`;
      host.querySelectorAll("[data-checkout]").forEach(b => b.onclick = () => openCheckout({ booking: b.dataset.checkout, onDone: load }));
      host.querySelectorAll("[data-receipt]").forEach(b => b.onclick = () => receipt(b.dataset.receipt, load));
    };
    field("biz-day").onchange = e => { date = e.target.value || c.today; load(); };
    field("biz-today").onclick = () => { date = c.today; field("biz-day").value = date; load(); };
    const walk = field("biz-walkin"); if (walk) walk.onclick = () => openCheckout({ walkIn: true, onDone: load });
    await load();
    let sig = "";
    Live.start(async () => {
      if (!field("biz-queue")) { Live.stop(); return; }
      if (document.querySelector("#modal-root .modal-bg")) return;
      const q = await rpc("biz_list_checkout_queue", { p_token: tok(), p_date: date });
      const next = JSON.stringify([q.open.map(x => x.booking_id + x.status), q.done.map(x => x.id + x.status + x.outstanding)]);
      if (sig && next !== sig) load();
      sig = next;
    }, 15000);
  }
  function receiptRow(r) {
    return `<button class="biz-row clickable" data-receipt="${E(r.id)}"><div class="biz-row-time"><b dir="ltr">#${E(r.receipt_no)}</b><small>${E(r.business_date ? day(r.business_date) : stamp(r.created_at))}</small></div>
      <div class="biz-row-main"><b data-i18n-skip>${E(r.customer_label || Lang.t("عميل بدون حساب"))}</b><small data-i18n-skip>${E(r.barber_label || "")}</small>
        <div class="biz-row-tags">${pill(CHECKOUT_STATE, receiptState(r))}${r.corrects_id ? ` <span class="badge info">${E(Lang.t("تصحيح"))}</span>` : ""}${Number(r.outstanding) > 0 && r.status !== "voided" ? ` <span class="badge warn">${E(Lang.t("متبقٍ"))} ${E(money(r.outstanding))}</span>` : ""}${r.coupon_code ? ` <span class="badge muted" dir="ltr">${E(r.coupon_code)}</span>` : ""}</div></div>
      <div class="biz-row-side"><strong>${E(money(r.total))}</strong>${UI.icon("chev", 16)}</div></button>`;
  }

  // ── Smart Checkout: the sheet ──────────────────────────────────────────
  // Appointment → Complete & Checkout → Payment. The server computes the
  // preview and the final receipt with the same function.
  async function openCheckout(opts = {}) {
    let prep;
    try { prep = await rpc("biz_prepare_checkout", { p_token: tok(), p_booking: opts.booking || null, p_customer: opts.customer || null }); }
    catch (e) { UI.toast(e.message, "err"); return; }
    currency = prep.settings?.currency || currency;
    const key = requestKey();
    const state = {
      customer: prep.customer ? { id: prep.customer.id, name: prep.customer.name || prep.customer.phone || "" } : null,
      items: prep.booking ? [{ type: "booking", booking_id: prep.booking.id, package_id: "" }] : opts.packageSale ? [{ type: "package", package_id: opts.packageSale }] : [],
      coupon: "", manual: { kind: "fixed", value: "", reason: "" }, payments: [], note: "", quote: null, error: "",
    };
    const perms = prep.actor.permissions || [], admin = prep.actor.admin;
    const discountAllowed = admin || perms.includes("discounts");
    const svcName = id => prep.services.find(x => x.id === id)?.name || "";
    const prodName = id => prep.products.find(x => x.id === id)?.name || "";
    const pkgName = id => prep.sell_packages.find(x => x.id === id)?.name || "";
    // A package is usable for this service, with this specialist (when the
    // package names specialists), while sessions remain.
    const eligiblePackages = (serviceId, barberId) => prep.packages.filter(p => (p.service_ids || []).includes(serviceId) && p.sessions_used < p.sessions_total
      && (!(p.barber_ids || []).length || (barberId && p.barber_ids.includes(barberId))));
    const lineBarber = item => item.type === "booking" ? (item.booking_id === prep.booking?.id ? prep.booking.barber_id : null) : item.barber_id || prep.booking?.barber_id || null;
    // The visit is covered by the customer's package by default (the one that
    // expires first); staff can still choose "none".
    if (prep.booking && state.items[0] && !prep.coins_paid) { const auto = eligiblePackages(prep.booking.service_id, prep.booking.barber_id)[0]; if (auto) state.items[0].package_id = auto.id; }
    const bookingService = id => id === prep.booking?.id ? prep.booking.service_id : null;

    UI.modal(`<div class="biz-sheet"><div class="mhead"><h3>${E(Lang.t(opts.walkIn ? "بيع مباشر" : "إتمام الزيارة والدفع"))}</h3><button class="iconbtn" id="co-x" aria-label="إغلاق">${UI.icon("x", 20)}</button></div>
      <div class="biz-sheet-body"><div class="biz-sheet-main">
        <section class="biz-co-customer" id="co-customer"></section>
        <section class="biz-co-lines"><div class="sec-label">${E(Lang.t("البنود"))}</div><div id="co-lines"></div>
          <div class="biz-co-add">
            <button class="btn line sm" id="co-add-service">${UI.icon("scissors", 15)} ${E(Lang.t("خدمة"))}</button>
            ${prep.products.length ? `<button class="btn line sm" id="co-add-product">${UI.icon("bag", 15)} ${E(Lang.t("منتج"))}</button><button class="btn line sm" id="co-scan">${UI.icon("qr", 15)} ${E(Lang.t("مسح باركود"))}</button>` : ""}
            ${prep.sell_packages.length ? `<button class="btn line sm" id="co-add-package">${UI.icon("star", 15)} ${E(Lang.t("بيع باقة"))}</button>` : ""}
            ${prep.same_day.length ? `<button class="btn line sm" id="co-add-visit">${UI.icon("calendar", 15)} ${E(Lang.t("زيارة أخرى اليوم"))}</button>` : ""}
            ${admin ? `<button class="btn line sm" id="co-add-custom">${UI.icon("money", 15)} ${E(Lang.t("مبلغ آخر"))}</button>` : ""}
          </div><div id="co-picker"></div></section>
        <section class="biz-co-discounts">
          ${prep.coupons_enabled ? `<div class="field"><label for="co-coupon">${E(Lang.t("كوبون"))}</label><div class="row" style="gap:8px"><input class="input" id="co-coupon" dir="ltr" autocomplete="off" placeholder="CODE" style="text-transform:uppercase"><button class="btn line sm" id="co-coupon-apply" type="button">${E(Lang.t("تطبيق"))}</button></div></div>` : ""}
          ${discountAllowed ? `<details class="biz-co-manual"><summary>${E(Lang.t("خصم يدوي"))}</summary><div class="control-form">
            <label>${E(Lang.t("النوع"))}<select class="select" id="co-md-kind"><option value="fixed">${E(Lang.t("مبلغ ثابت"))}</option><option value="percent">${E(Lang.t("نسبة مئوية"))}</option></select></label>
            <label>${E(Lang.t("القيمة"))}${moneyIn("co-md-value", "")}</label>
            <label class="full">${E(Lang.t("سبب الخصم"))}<input class="input" id="co-md-reason" maxlength="200"></label></div></details>` : ""}
        </section>
        <section class="biz-co-payments"><div class="sec-label">${E(Lang.t("الدفع"))}</div><div id="co-pays"></div>
          <div class="biz-co-add"><button class="btn line sm" id="co-pay-full">${UI.icon("check", 15)} ${E(Lang.t("المبلغ كاملاً"))}</button>
          <button class="btn line sm" id="co-pay-add">${UI.icon("plus", 15)} ${E(Lang.t("دفعة أخرى"))}</button></div>
          <div class="field"><label for="co-note">${E(Lang.t("ملاحظة على الفاتورة"))}</label><input class="input" id="co-note" maxlength="500"></div></section>
      </div>
      <aside class="biz-sheet-total" id="co-total" aria-live="polite"></aside></div>
      <div class="biz-sheet-foot"><button class="btn" id="co-go">${UI.icon("check", 18)} ${E(Lang.t(opts.walkIn ? "إتمام البيع" : "إتمام الدفع وإغلاق الزيارة"))}</button>${errorBox("co-err")}</div></div>`);
    field("co-x").onclick = UI.closeModal;

    function paintCustomer() {
      const host = field("co-customer"); if (!host) return;
      const b = prep.booking;
      if (b) {
        host.innerHTML = `<div class="biz-co-who"><span class="reservation-avatar">${b.customer ? E(b.customer[0]) : UI.icon("user", 16)}</span><div><b data-i18n-skip>${E(b.customer || "")}</b>
          <small>${E(UI.dateAr(b.booking_date))} · ${E(UI.timeAr(b.booking_time))} · <span data-i18n-skip>${E(b.barber_name || "")}</span></small>
          ${prep.customer?.stats ? `<small>${E(pick(`${num(prep.customer.stats.visits)} زيارة · أنفق ${money(prep.customer.stats.total_spent)}`, `${num(prep.customer.stats.visits)} visits · spent ${money(prep.customer.stats.total_spent)}`, `${num(prep.customer.stats.visits)} ביקורים · הוציא ${money(prep.customer.stats.total_spent)}`))}</small>` : ""}</div></div>
          ${prep.coins_paid ? `<p class="loy-pay-note">${UI.icon("star", 14)} ${E(Lang.t("الخدمة مدفوعة بنقاط الولاء"))}</p>` : ""}
          ${(prep.package_requests || []).map(rq => `<p class="biz-co-request">${UI.icon("star", 14)} <span>${E(pick(`طلب العميل شراء باقة «${rq.name}»`, `The customer asked to buy “${rq.name}”`, `הלקוח ביקש לקנות את “${rq.name}”`))}</span> <button type="button" class="btn line sm" data-sell-request="${E(rq.package_id)}">${E(Lang.t("بيعها الآن"))}</button></p>`).join("")}
          ${prep.deposit ? `<p class="biz-co-deposit">${UI.icon("lock", 14)} ${E(Lang.t("العربون"))}: ${pill(DEPOSIT_STATE, prep.deposit.status)} ${Number(prep.deposit.available) > 0 ? `<b>${E(money(prep.deposit.available))}</b> ${E(Lang.t("يُخصم تلقائياً"))}` : ""}</p>` : ""}`;
        host.querySelectorAll("[data-sell-request]").forEach(btn => btn.onclick = () => {
          // Sell the package first (its own receipt), then come back to this
          // visit, where the new package is picked automatically.
          const visit = { booking: opts.booking, onDone: opts.onDone };
          UI.closeModal();
          openCheckout({ customer: prep.customer?.id, packageSale: btn.dataset.sellRequest, noReceipt: true, onDone: async () => { ctxAt = 0; UI.toast("تمت إضافة الباقة لحساب العميل", "ok"); openCheckout(visit); } });
        });
        return;
      }
      host.innerHTML = `<div class="field"><label for="co-q">${E(Lang.t("العميل (اختياري للبيع، مطلوب للباقات)"))}</label>
        <input class="input" id="co-q" placeholder="${E(Lang.t("ابحث بالاسم أو رقم الهاتف"))}" autocomplete="off" value="${E(state.customer?.name || "")}"></div><div id="co-matches" class="biz-chips"></div>`;
      let timer;
      field("co-q").oninput = e => {
        clearTimeout(timer); const q = e.target.value.trim();
        if (state.customer && q !== state.customer.name) { state.customer = null; refresh(); }
        timer = setTimeout(async () => {
          const box = field("co-matches"); if (!box) return;
          if (q.length < 2) { box.innerHTML = ""; return; }
          try {
            const rows = await rpc("admin_list_users", { p_token: tok(), p_limit: 6, p_offset: 0, p_search: q, p_role: "user" });
            box.innerHTML = rows.map(u => `<button type="button" class="chip" data-cust="${E(u.id)}" data-name="${E(u.full_name || u.phone)}"><span data-i18n-skip>${E(u.full_name || "")}</span> · <span dir="ltr">${E(u.phone)}</span></button>`).join("") || `<p class="tiny">${E(Lang.t("لا نتائج"))}</p>`;
            box.querySelectorAll("[data-cust]").forEach(b => b.onclick = async () => {
              state.customer = { id: b.dataset.cust, name: b.dataset.name }; field("co-q").value = b.dataset.name; box.innerHTML = "";
              try { const fresh = await rpc("biz_prepare_checkout", { p_token: tok(), p_booking: null, p_customer: b.dataset.cust }); prep.packages = fresh.packages; } catch {}
              refresh();
            });
          } catch (err) { box.textContent = err.message; }
        }, 280);
      };
    }

    function lineLabel(item) {
      if (item.type === "booking") return item.booking_id === prep.booking?.id ? prep.booking.service_name : (prep.same_day.find(x => x.booking_id === item.booking_id)?.service_name || "");
      if (item.type === "service") return svcName(item.service_id);
      if (item.type === "product") return prodName(item.product_id);
      if (item.type === "custom") return item.label || Lang.t("دفعة");
      return pkgName(item.package_id);
    }
    function paintLines() {
      const host = field("co-lines"); if (!host) return;
      const lines = state.quote?.lines || [];
      host.innerHTML = state.items.length ? state.items.map((item, i) => {
        const line = lines[i];
        const serviceId = item.type === "booking" ? (line?.service_id || bookingService(item.booking_id)) : item.service_id;
        const pk = (item.type === "booking" || item.type === "service") && state.customer ? eligiblePackages(serviceId, lineBarber(item)) : [];
        return `<div class="biz-line"><div class="biz-line-main"><b data-i18n-skip>${E(lineName(line?.label || lineLabel(item)))}</b>
            <small>${E(Lang.t({ booking: "خدمة محجوزة", service: "خدمة إضافية", product: "منتج", package: "بيع باقة", custom: "مبلغ بدون حجز" }[item.type]))}${line?.barber_label ? ` · <span data-i18n-skip>${E(line.barber_label)}</span>` : ""}${item.quantity > 1 ? ` · ×${num(item.quantity)}` : ""}</small>
            ${line?.covered === "package" ? `<span class="badge info">${E(Lang.t("من الباقة"))}</span>` : line?.covered === "loyalty" ? `<span class="badge info">${E(Lang.t("مدفوعة بالنقاط"))}</span>` : ""}
            ${pk.length ? `<label class="biz-line-pkg">${E(Lang.t("استخدام باقة"))}<select class="select" data-pkg="${i}"><option value="">${E(Lang.t("بدون"))}</option>${pk.map(p => `<option value="${E(p.id)}" ${p.id === item.package_id ? "selected" : ""}>${E(p.name)} · ${E(pick(`${num(p.sessions_total - p.sessions_used)} متبقية`, `${num(p.sessions_total - p.sessions_used)} left`, `${num(p.sessions_total - p.sessions_used)} נותרו`))}</option>`).join("")}</select></label>` : ""}</div>
          <div class="biz-line-side">${line ? `${Number(line.discount) > 0 ? `<small class="strike">${E(money(line.gross))}</small>` : ""}<strong>${E(money(line.net))}</strong>` : ""}
            ${item.type === "booking" && i === 0 && prep.booking ? "" : `<button class="iconbtn" data-remove="${i}" aria-label="${E(Lang.t("إزالة"))}">${UI.icon("trash", 16)}</button>`}</div></div>`;
      }).join("") : `<p class="tiny biz-muted">${E(Lang.t("أضف خدمة أو منتجاً."))}</p>`;
      host.querySelectorAll("[data-remove]").forEach(b => b.onclick = () => { state.items.splice(Number(b.dataset.remove), 1); refresh(); });
      host.querySelectorAll("[data-pkg]").forEach(s => s.onchange = () => { state.items[Number(s.dataset.pkg)].package_id = s.value; refresh(); });
    }
    function picker(kind) {
      const host = field("co-picker"); if (!host) return;
      const opt = (v, l, extra = "") => `<option value="${E(v)}" ${extra}>${E(l)}</option>`;
      if (kind === "service") host.innerHTML = `<div class="biz-picker"><select class="select" id="pk-svc">${prep.services.map(x => opt(x.id, `${x.name} · ${money(x.price)}`)).join("")}</select>
        ${admin && prep.barbers.length ? `<select class="select" id="pk-barber">${opt("", Lang.t("نفس المختص"))}${prep.barbers.map(b => opt(b.id, b.name)).join("")}</select>` : ""}
        <button class="btn sm" id="pk-ok" type="button">${E(Lang.t("إضافة"))}</button></div>`;
      else if (kind === "product") host.innerHTML = `<div class="biz-picker"><input class="input" id="pk-find" placeholder="${E(Lang.t("ابحث عن منتج"))}" autocomplete="off" style="max-width:160px"><select class="select" id="pk-prod">${prep.products.map(x => opt(x.id, `${x.name} · ${money(x.price)} · ${pick(`المخزون ${num(x.stock)}`, `stock ${num(x.stock)}`, `מלאי ${num(x.stock)}`)}`)).join("")}</select>
        <input class="input" id="pk-qty" type="number" min="1" max="1000" step="1" value="1" style="max-width:90px" aria-label="${E(Lang.t("الكمية"))}"><button class="btn sm" id="pk-ok" type="button">${E(Lang.t("إضافة"))}</button></div>`;
      else if (kind === "package") host.innerHTML = `<div class="biz-picker"><select class="select" id="pk-pkg">${prep.sell_packages.map(x => opt(x.id, `${x.name} · ${num(x.sessions)} ${Lang.t("جلسات")} · ${money(x.price)}`)).join("")}</select>
        <button class="btn sm" id="pk-ok" type="button">${E(Lang.t("إضافة"))}</button></div>`;
      else if (kind === "custom") host.innerHTML = `<div class="biz-picker"><input class="input" id="pk-label" maxlength="80" placeholder="${E(Lang.t("الوصف (مثال: قص شعر)"))}" aria-label="${E(Lang.t("الوصف"))}">
        ${moneyIn("pk-amount", "", `placeholder="${E(Lang.t("المبلغ"))}" aria-label="${E(Lang.t("المبلغ"))}" style="max-width:120px"`)}
        ${prep.barbers.length ? `<select class="select" id="pk-barber">${opt("", Lang.t("بدون مختص"))}${prep.barbers.map(b => opt(b.id, b.name)).join("")}</select>` : ""}
        <button class="btn sm" id="pk-ok" type="button">${E(Lang.t("إضافة"))}</button></div>`;
      else if (kind === "visit") host.innerHTML = `<div class="biz-picker"><select class="select" id="pk-visit">${prep.same_day.filter(x => !state.items.some(i => i.booking_id === x.booking_id)).map(x => opt(x.booking_id, `${x.service_name} · ${UI.timeAr(x.booking_time)} · ${x.barber_name}`)).join("")}</select>
        <button class="btn sm" id="pk-ok" type="button">${E(Lang.t("إضافة"))}</button></div>`;
      const find = field("pk-find");
      if (find) find.oninput = () => {
        const q = find.value.trim().toLowerCase();
        [...field("pk-prod").options].forEach(o => { o.hidden = !!q && !o.textContent.toLowerCase().includes(q); });
        const first = [...field("pk-prod").options].find(o => !o.hidden); if (first) field("pk-prod").value = first.value;
      };
      field("pk-ok").onclick = () => {
        if (kind === "service") state.items.push({ type: "service", service_id: val("pk-svc"), barber_id: val("pk-barber") || undefined, package_id: "" });
        if (kind === "product") addProduct(val("pk-prod"), Math.max(1, Number(val("pk-qty")) || 1));
        if (kind === "package") state.items.push({ type: "package", package_id: val("pk-pkg") });
        if (kind === "visit" && val("pk-visit")) state.items.push({ type: "booking", booking_id: val("pk-visit"), package_id: "" });
        if (kind === "custom") {
          const amount = Number(val("pk-amount"));
          if (!(amount > 0)) { field("pk-amount").focus(); return; }
          state.items.push({ type: "custom", label: val("pk-label").trim(), amount, barber_id: val("pk-barber") || undefined });
        }
        host.innerHTML = ""; refresh();
      };
    }
    // A product scanned at the counter: the salon's own product and price; a
    // second scan of the same product adds one more.
    function addProduct(id, qty = 1) {
      const line = state.items.find(i => i.type === "product" && i.product_id === id);
      if (line) line.quantity = (Number(line.quantity) || 1) + qty; else state.items.push({ type: "product", product_id: id, quantity: qty });
    }
    if (field("co-scan")) field("co-scan").onclick = async () => {
      const code = await Workforce.scanCode(); if (!code) return;
      try {
        const r = await Workforce.lookup(code);
        if (!r.found) { showError("co-err", new Error(pick(`لا يوجد منتج مسجل بهذا الباركود (${code})`, `No product is registered with this barcode (${code})`, `אין מוצר רשום עם הברקוד הזה (${code})`))); return; }
        if (!prep.products.some(x => x.id === r.product.id)) { showError("co-err", new Error(Lang.t("المنتج غير متاح للبيع"))); return; }
        addProduct(r.product.id, 1); UI.toast(pick(`أُضيف ${r.product.name}`, `Added ${r.product.name}`, `נוסף ${r.product.name}`), "ok"); refresh();
      } catch (e) { showError("co-err", e); }
    };
    // Each payment: how the customer paid and how much. Completing the
    // checkout is the employee's confirmation that it was received.
    function paintPayments() {
      const host = field("co-pays"); if (!host) return;
      host.innerHTML = state.payments.map((p, i) => `<div class="biz-pay pay-line">${methodPicker("pay-m-" + i, p.method)}
        <div class="pay-line-row"><label class="pay-amount"><span>${E(Lang.t("المبلغ"))}</span><input class="input" type="number" inputmode="decimal" min="0" step="0.01" dir="ltr" data-pay-amount="${i}" value="${E(p.amount)}"></label>
        ${p.method === "card" ? `<label class="pay-ref"><span>${E(Lang.t("رقم العملية من الجهاز (اختياري)"))}</span><input class="input" data-pay-ref="${i}" value="${E(p.reference || "")}" maxlength="120" dir="ltr"></label>` : ""}
        <button class="iconbtn" type="button" data-pay-remove="${i}" aria-label="${E(Lang.t("إزالة"))}">${UI.icon("trash", 16)}</button></div></div>`).join("") || `<p class="tiny biz-muted">${E(Lang.t("بدون دفع الآن — يُسجّل المبلغ كمستحق."))}</p>`;
      state.payments.forEach((p, i) => host.querySelectorAll(`[data-pay-m-${i}]`).forEach(b => b.onclick = () => { p.method = b.getAttribute(`data-pay-m-${i}`); paintPayments(); quoteSoon(); }));
      host.querySelectorAll("[data-pay-amount]").forEach(s => s.oninput = () => { state.payments[Number(s.dataset.payAmount)].amount = s.value; quoteSoon(); });
      host.querySelectorAll("[data-pay-ref]").forEach(s => s.oninput = () => { state.payments[Number(s.dataset.payRef)].reference = s.value; });
      host.querySelectorAll("[data-pay-remove]").forEach(b => b.onclick = () => { state.payments.splice(Number(b.dataset.payRemove), 1); paintPayments(); quoteSoon(); });
    }
    function payload() {
      const payments = state.payments.filter(p => Number(p.amount) > 0).map(p => ({ method: p.method, amount: Math.round(Number(p.amount) * 100) / 100, reference: p.reference || "", confirmed: true }));
      const items = state.items.map(i => ({ ...i, package_id: i.package_id || undefined }));
      const data = { items, payments, coupon_code: state.coupon, note: val("co-note") };
      if (state.customer && !prep.booking) data.customer_id = state.customer.id;
      if (state.customer && !prep.booking) data.customer_label = state.customer.name;
      const mv = Number(val("co-md-value"));
      if (field("co-md-value") && mv > 0) data.manual_discount = { kind: val("co-md-kind"), value: mv, reason: val("co-md-reason") };
      return data;
    }
    function paintTotal() {
      const host = field("co-total"); if (!host) return;
      const q = state.quote;
      if (!q) { host.innerHTML = state.error ? `<p class="form-error">${E(state.error)}</p>` : `<div class="biz-total-empty">${E(Lang.t("أضف بنداً لعرض المجموع"))}</div>`; return; }
      const row = (l, v, cls = "") => `<div class="biz-total-row ${cls}"><span>${E(Lang.t(l))}</span><b>${v}</b></div>`;
      host.innerHTML = `<div class="biz-total-card">
        ${row("المجموع قبل الخصم", E(money(q.gross_total)))}
        ${Number(q.package_covered) > 0 ? row("مغطى من باقة", "− " + E(money(q.package_covered)), "minus") : ""}
        ${Number(q.loyalty_covered) > 0 ? row("مدفوع بنقاط الولاء", E(money(q.loyalty_covered)), "muted") : ""}
        ${Number(q.coupon_discount) > 0 ? row(Lang.t("كوبون") + " " + (q.coupon?.code || ""), "− " + E(money(q.coupon_discount)), "minus") : ""}
        ${Number(q.manual_discount) > 0 ? row("خصم يدوي", "− " + E(money(q.manual_discount)), "minus") : ""}
        ${row("الإجمالي", E(money(q.total)), "strong")}
        ${Number(q.deposit_applied) > 0 ? row("العربون المدفوع", "− " + E(money(q.deposit_applied)), "minus") : ""}
        ${row("المطلوب الآن", E(money(q.amount_due)), "due")}
        ${row("المدفوع", E(money(q.paid)))}
        ${Number(q.outstanding) > 0 ? row("المتبقي", E(money(q.outstanding)), "warn") : ""}
        ${(q.warnings || []).map(w => `<p class="sub-warning">${E(pick(`المخزون المسجل لـ ${w.label} هو ${num(w.stock)} فقط`, `Recorded stock for ${w.label} is only ${num(w.stock)}`, `המלאי הרשום של ${w.label} הוא ${num(w.stock)} בלבד`))}</p>`).join("")}
        ${Number(q.outstanding) > 0 && !q.allow_outstanding ? `<p class="sub-warning">${E(Lang.t("يجب دفع المبلغ كاملاً قبل الإغلاق (حسب إعدادات العمل)."))}</p>` : ""}
        ${state.error ? `<p class="form-error">${E(state.error)}</p>` : ""}</div>`;
    }
    let qTimer = null, qSeq = 0;
    const quoteSoon = () => { clearTimeout(qTimer); qTimer = setTimeout(quote, 260); };
    async function quote() {
      if (!field("co-total")) return;                 // the sheet was closed (or completed) meanwhile
      if (!state.items.length) { state.quote = null; state.error = ""; paintLines(); paintTotal(); return; }
      const my = ++qSeq;
      try {
        const q = await rpc("biz_quote_checkout", { p_token: tok(), p_data: payload() });
        if (my !== qSeq) return; state.quote = q; state.error = "";
      } catch (e) {
        if (my !== qSeq) return;
        // A rejected coupon is dropped so the rest of the bill still adds up.
        if (/كوبون|الكوبون/.test(e.rawMessage || "") && state.coupon) { state.coupon = ""; if (field("co-coupon")) field("co-coupon").value = ""; state.error = e.message; return quote(); }
        state.error = e.message; state.quote = null;
      }
      paintLines(); paintTotal();
    }
    function refresh() { paintCustomer(); paintLines(); quote(); }
    field("co-add-service").onclick = () => picker("service");
    if (field("co-add-product")) field("co-add-product").onclick = () => picker("product");
    if (field("co-add-package")) field("co-add-package").onclick = () => picker("package");
    if (field("co-add-visit")) field("co-add-visit").onclick = () => picker("visit");
    if (field("co-add-custom")) field("co-add-custom").onclick = () => picker("custom");
    if (opts.custom && field("co-add-custom")) picker("custom");
    if (field("co-coupon-apply")) field("co-coupon-apply").onclick = () => { state.coupon = val("co-coupon").toUpperCase(); quote(); };
    ["co-md-kind", "co-md-value", "co-md-reason"].forEach(id => { const el = field(id); if (el) el.oninput = el.onchange = quoteSoon; });
    field("co-pay-add").onclick = () => { state.payments.push({ method: "card", amount: "" }); paintPayments(); };
    field("co-pay-full").onclick = () => {
      const due = Number(state.quote?.amount_due || 0), paidOthers = state.payments.slice(1).reduce((s, p) => s + (Number(p.amount) || 0), 0);
      if (!state.payments.length) state.payments.push({ method: "cash", amount: "" });
      state.payments[0].amount = String(Math.max(0, Math.round((due - paidOthers) * 100) / 100));
      paintPayments(); quote();
    };
    field("co-go").onclick = async () => {
      if (!state.items.length) { showError("co-err", new Error(Lang.t("أضف خدمة أو منتجاً واحداً على الأقل"))); return; }
      clearTimeout(qTimer); qSeq++;                  // no preview may land after the receipt
      UI.busy("co-go", true); field("co-err").textContent = "";
      try {
        const data = payload(); if (state.quote) data.expected_total = state.quote.total;
        const r = await rpc("biz_complete_checkout", { p_token: tok(), p_data: data, p_request_key: key });
        UI.closeModal(); UI.toast(r.duplicate ? "سبق تسجيل هذه الفاتورة" : "تم إتمام الدفع", "ok");
        ctxAt = 0; if (opts.onDone) await opts.onDone(r);
        if (!opts.noReceipt) receipt(r.id, opts.onDone);
      } catch (e) { showError("co-err", e); UI.busy("co-go", false); }
    };
    paintCustomer(); paintPayments(); await quote();
    // One tap for the common case: the whole amount in cash.
    if (state.quote && Number(state.quote.amount_due) > 0 && !state.payments.length) { state.payments.push({ method: "cash", amount: String(state.quote.amount_due) }); paintPayments(); quote(); }
  }

  // ── Receipt ────────────────────────────────────────────────────────────
  // 2.34: what can be done with a receipt follows its real state and the
  // person's permissions (owners have them all):
  //   • Refund money        — money really given back to the customer;
  //   • Correct receipt      — a mistake in the items, prices or discount
  //                            (the original stays, linked to the corrected one);
  //   • Cancel sale          — recorded by mistake, no money was taken (the
  //                            payments are cancelled, not refunded), or a
  //                            receipt whose money was already given back.
  const canMoney = (c, perm) => isPlatform() || Auth.isAdmin() || !!c?.actor?.admin || Auth.can(perm);
  async function receipt(id, onChange) {
    let r;
    try { r = await rpc("biz_get_checkout", { p_token: tok(), p_id: id }); } catch (e) { UI.toast(e.message, "err"); return; }
    let c = null; try { c = await context(); } catch {}
    const online = !!c?.online?.ready;
    const salon = Control.target()?.name || App.settings?.app_name || "METON";
    const st = r.status, open = st !== "voided", refundedAny = Number(r.refunded_total) > 0;
    const paidOnline = (r.payments || []).some(p => !["cash", "card"].includes(p.method) && Number(p.amount) > Number(p.refunded_amount));
    const mayRefund = canMoney(c, "receipts_refund"), mayCorrect = canMoney(c, "receipts_correct");
    const showRefund = mayRefund && open && Number(r.refundable) > 0;
    const showCorrect = mayCorrect && st === "completed" && !refundedAny && !paidOnline;
    const showCancel = mayRefund && open;
    const cancelLabel = st === "completed" && !refundedAny ? "إلغاء بيع سُجّل بالخطأ" : "إلغاء الفاتورة";
    UI.modal(`<div class="biz-receipt"><div class="mhead"><h3>${E(Lang.t("فاتورة"))} <span dir="ltr">#${E(r.receipt_no)}</span></h3><button class="iconbtn" id="rc-x" aria-label="${E(Lang.t("إغلاق"))}">${UI.icon("x", 20)}</button></div>
      ${r.corrected_by_no ? `<div class="biz-receipt-link warn">${UI.icon("refresh", 16)}<span>${E(pick(`صُحّحت هذه الفاتورة — الفاتورة الصحيحة رقم #${r.corrected_by_no}`, `This receipt was corrected — the correct receipt is #${r.corrected_by_no}`, `הקבלה תוקנה — הקבלה הנכונה היא #${r.corrected_by_no}`))}</span><button type="button" class="btn line sm" id="rc-open-new">${E(Lang.t("فتح"))}</button></div>`
        : r.corrects_no ? `<div class="biz-receipt-link">${UI.icon("check", 16)}<span>${E(pick(`تصحيح للفاتورة رقم #${r.corrects_no}`, `Correction of receipt #${r.corrects_no}`, `תיקון של קבלה #${r.corrects_no}`))}</span><button type="button" class="btn line sm" id="rc-history">${E(Lang.t("ما الذي تغيّر"))}</button></div>` : ""}
      <div class="biz-receipt-body" id="rc-print">${receiptHtml(r, salon)}</div>
      <div class="biz-receipt-actions">
        ${Number(r.outstanding) > 0 && open ? `<button class="btn" id="rc-collect">${UI.icon("money", 16)} ${E(Lang.t("تحصيل المتبقي"))}</button>` : ""}
        ${Number(r.outstanding) > 0 && open && online ? `<button class="btn line" id="rc-link">${UI.icon("globe", 16)} ${E(Lang.t("إرسال رابط دفع"))}</button>` : ""}
        ${showRefund ? `<button class="btn line" id="rc-refund">${UI.icon("refresh", 16)} ${E(Lang.t("استرجاع مبلغ للعميل"))}</button>` : ""}
        ${showCorrect ? `<button class="btn line" id="rc-correct">${UI.icon("pencil", 16)} ${E(Lang.t("تصحيح الفاتورة"))}</button>` : ""}
        ${showCancel ? `<button class="btn line danger-line" id="rc-void">${E(Lang.t(cancelLabel))}</button>` : ""}
        <button class="btn line" id="rc-pdf">${UI.icon("list", 16)} ${E(Lang.t("طباعة / PDF"))}</button></div>${errorBox("rc-err")}</div>`);
    field("rc-x").onclick = UI.closeModal;
    const again = async (nextId) => { ctxAt = 0; if (onChange) await onChange(); receipt(nextId || id, onChange); };
    field("rc-pdf").onclick = () => Exporter.print(Lang.t("فاتورة") + " #" + r.receipt_no, `<h1>${E(salon)}</h1>${receiptHtml(r, salon)}`);
    const openNew = field("rc-open-new"); if (openNew) openNew.onclick = () => receipt(r.corrected_by_id, onChange);
    const hist = field("rc-history"); if (hist) hist.onclick = () => correctionHistory(r);
    const collect = field("rc-collect");
    if (collect) collect.onclick = () => collectModal(r, again);
    const link = field("rc-link");
    if (link) link.onclick = async () => {
      UI.busy("rc-link", true);
      try { const i = await rpc("biz_start_online_payment", { p_token: tok(), p_purpose: "checkout", p_id: r.id }); UI.toast(i.hosted_url ? "تم إرسال رابط الدفع للعميل" : "طُلبت صفحة الدفع من المزود، ستصل للعميل عند تجهيزها", "ok"); }
      catch (e) { showError("rc-err", e); } finally { UI.busy("rc-link", false); }
    };
    const refund = field("rc-refund"); if (refund) refund.onclick = () => refundModal(r, again);
    const correct = field("rc-correct"); if (correct) correct.onclick = () => correctModal(r, again);
    const voidBtn = field("rc-void");
    if (voidBtn) voidBtn.onclick = () => cancelModal(r, again);
  }

  // Cancel: what it means depends on the receipt.
  function cancelModal(r, after) {
    const refundedAny = Number(r.refunded_total) > 0;
    if (r.status === "partially_refunded") {
      const left = Math.max(0, Number(r.paid_total) + Number(r.deposit_applied) - Number(r.refunded_total));
      UI.modal(`<div class="mhead"><h3>${E(Lang.t("إلغاء الفاتورة"))}</h3><button class="iconbtn" id="cn-x" aria-label="${E(Lang.t("إغلاق"))}">${UI.icon("x", 20)}</button></div>
        <div class="mform"><p>${E(pick(`استُرجع جزء من هذه الفاتورة. لإلغائها، استرجع المتبقي (${money(left)}) للعميل أولاً.`, `Part of this receipt was refunded. To cancel it, refund the rest (${money(left)}) to the customer first.`, `חלק מהקבלה הוחזר. כדי לבטל אותה, החזירו קודם ללקוח את היתרה (${money(left)}).`))}</p>
        ${canMoney(null, "receipts_refund") ? `<button class="btn" id="cn-refund">${UI.icon("refresh", 16)} ${E(Lang.t("استرجاع المتبقي"))}</button>` : ""}</div>`);
      field("cn-x").onclick = UI.closeModal;
      const b = field("cn-refund"); if (b) b.onclick = () => refundModal(r, after);
      return;
    }
    const key = requestKey();
    const mistake = r.status === "completed" && !refundedAny;
    const cashPaid = (r.payments || []).some(p => p.method === "cash" && Number(p.amount) > Number(p.refunded_amount));
    const intro = mistake
      ? Lang.t("استخدم هذا فقط إذا سُجّل البيع بالخطأ ولم يُدفع أي مبلغ فعلاً. تُلغى الدفعات المسجلة عليه (لا تُسجّل كاسترجاع)، ويُلغى ما فعلته الفاتورة (المخزون، الكوبون، جلسات الباقة، العمولة)، ويمكن إتمام دفع الزيارة من جديد. إذا دفع العميل وستعيد له المال، استخدم «استرجاع مبلغ للعميل».")
      : Lang.t("أُعيد المال للعميل من قبل. الإلغاء يُلغي ما فعلته الفاتورة (المخزون، الكوبون، جلسات الباقة، العمولة) ويمكن إتمام دفع الزيارة من جديد.");
    reasonModal(Lang.t(mistake ? "إلغاء بيع سُجّل بالخطأ" : "إلغاء الفاتورة"), intro, async reason => {
      await rpc("admin_biz_cancel_checkout", { p_token: tok(), p_id: r.id, p_reason: reason, p_request_key: key });
      UI.toast(mistake ? "أُلغي البيع" : "تم إلغاء الفاتورة", "ok"); await after();
    }, true, { cta: Lang.t(mistake ? "إلغاء البيع" : "إلغاء الفاتورة"),
      extra: mistake && cashPaid ? `<p class="tiny biz-note">${UI.icon("info", 13)} ${E(Lang.t("إذا كان صندوق النقد قد أُغلق، يظهر هذا التغيير تحت ذلك الإغلاق ولا يغيّره."))}</p>` : "" });
  }

  // What changed in a correction (before / after, who, when, why).
  async function correctionHistory(r) {
    let list = [];
    try { list = await rpc("admin_biz_receipt_history", { p_token: tok(), p_id: r.id }); } catch (e) { UI.toast(e.message, "err"); return; }
    const items = xs => `<ul class="biz-mini">${(xs || []).map(i => `<li><span data-i18n-skip>${E(lineName(i.label))}</span>${Number(i.quantity) > 1 ? `<small>×${num(i.quantity)}</small>` : ""}<b>${E(money(i.net))}</b></li>`).join("")}</ul>`;
    UI.modal(`<div class="mhead"><h3>${E(Lang.t("سجل التصحيح"))}</h3><button class="iconbtn" id="ch-x" aria-label="${E(Lang.t("إغلاق"))}">${UI.icon("x", 20)}</button></div>
      <div class="mform">${list.map(x => `<section class="biz-panel"><p class="tiny">${E(stamp(x.at))} · <span data-i18n-skip>${E(x.by)}</span></p><p><b>${E(Lang.t("السبب"))}:</b> <span data-i18n-skip>${E(x.reason)}</span></p>
        <div class="biz-split"><div><div class="sec-label">${E(pick(`قبل (#${x.original_no})`, `Before (#${x.original_no})`, `לפני (#${x.original_no})`))}</div>${items(x.before_items)}<p class="tiny">${E(Lang.t("الإجمالي"))}: <b>${E(money(x.before_total))}</b></p></div>
        <div><div class="sec-label">${E(pick(`بعد (#${x.corrected_no})`, `After (#${x.corrected_no})`, `אחרי (#${x.corrected_no})`))}</div>${items(x.after_items)}<p class="tiny">${E(Lang.t("الإجمالي"))}: <b>${E(money(x.after_total))}</b></p></div></div></section>`).join("") || UI.empty(Lang.t("لا يوجد تصحيح"), "")}</div>`);
    field("ch-x").onclick = UI.closeModal;
  }
  function receiptHtml(r, salon) {
    const tr = (l, v, cls = "") => `<div class="biz-total-row ${cls}"><span>${E(Lang.t(l))}</span><b>${v}</b></div>`;
    return `<div class="biz-receipt-meta"><div><small>${E(salon || "")}</small><b data-i18n-skip>${E(r.customer_label || Lang.t("عميل بدون حساب"))}</b>${r.customer_phone ? `<span dir="ltr">${E(r.customer_phone)}</span>` : ""}</div>
        <div>${pill(CHECKOUT_STATE, receiptState(r))}<small>${E(stamp(r.created_at))}</small>${r.barber_label ? `<small data-i18n-skip>${E(r.barber_label)}</small>` : ""}</div></div>
      <table class="biz-table"><thead><tr><th>${E(Lang.t("البند"))}</th><th>${E(Lang.t("الكمية"))}</th><th>${E(Lang.t("السعر"))}</th><th>${E(Lang.t("الخصم"))}</th><th>${E(Lang.t("الصافي"))}</th></tr></thead>
      <tbody>${(r.items || []).map(i => `<tr class="${i.active === false ? "muted" : ""}"><td><b data-i18n-skip>${E(lineName(i.label))}</b>${i.covered === "package" ? ` <span class="badge info">${E(Lang.t("من الباقة"))}</span>` : i.covered === "loyalty" ? ` <span class="badge info">${E(Lang.t("مدفوعة بالنقاط"))}</span>` : ""}${i.barber_label ? `<small data-i18n-skip>${E(i.barber_label)}</small>` : ""}${Number(i.refunded_qty) > 0 ? `<small>${E(pick(`أُرجع ${num(i.refunded_qty)}`, `${num(i.refunded_qty)} returned`, `הוחזרו ${num(i.refunded_qty)}`))}</small>` : ""}</td>
        <td>${num(i.quantity)}</td><td>${E(money(i.unit_price))}</td><td>${Number(i.discount) + Number(i.covered_amount) > 0 ? E(money(Number(i.discount) + Number(i.covered_amount))) : "—"}</td><td><b>${E(money(i.net))}</b></td></tr>`).join("")}</tbody></table>
      <div class="biz-total-card">${tr("المجموع قبل الخصم", E(money(r.gross_total)))}
        ${Number(r.package_covered) > 0 ? tr("مغطى من باقة", "− " + E(money(r.package_covered)), "minus") : ""}
        ${Number(r.coupon_discount) > 0 ? tr(Lang.t("كوبون") + " " + r.coupon_code, "− " + E(money(r.coupon_discount)), "minus") : ""}
        ${Number(r.manual_discount) > 0 ? tr("خصم يدوي", "− " + E(money(r.manual_discount)), "minus") : ""}
        ${tr("الإجمالي", E(money(r.total)), "strong")}
        ${Number(r.deposit_applied) > 0 ? tr("العربون المدفوع", "− " + E(money(r.deposit_applied)), "minus") : ""}
        ${tr("المدفوع", E(money(r.paid_total)))}
        ${Number(r.refunded_total) > 0 ? tr("المسترجع", E(money(r.refunded_total)), "warn") : ""}
        ${Number(r.outstanding) > 0 && r.status !== "voided" ? tr("المتبقي", E(money(r.outstanding)), "warn") : ""}</div>
      ${(r.payments || []).length ? `<div class="sec-label">${E(Lang.t("الدفعات"))}</div><ul class="biz-mini">${r.payments.map(p => `<li>${UI.icon(PAY_ICON[p.method] || "money", 14)} <span>${E(Lang.t(PAY[p.method] || p.method))}${p.reference ? ` · <span dir="ltr">${E(p.reference)}</span>` : ""}</span><b>${E(money(p.amount))}</b>${Number(p.refunded_amount) > 0 ? `<small>${E(Lang.t("مسترجع"))} ${E(money(p.refunded_amount))}</small>` : ""}</li>`).join("")}</ul>` : ""}
      ${(r.refunds || []).length ? `<div class="sec-label">${E(Lang.t("حركات المال على الفاتورة"))}</div><ul class="biz-mini">${r.refunds.map(x => `<li>${UI.icon(x.kind === "void" ? "x" : x.kind === "transfer" ? "fwd" : "refresh", 14)} <span><b class="biz-kind">${E(Lang.t(REFUND_KIND[x.kind] || REFUND_KIND.refund))}</b> · ${E(Lang.t(PAY[x.method] || x.method))}${x.reason ? ` · <span data-i18n-skip>${E(String(x.reason).replace(/^(Entered by mistake|Receipt correction(?: \(difference returned\))?): /, ""))}</span>` : ""}</span><b>${E(money(x.amount))}</b><small>${E(stamp(x.created_at))}${x.by ? ` · <span data-i18n-skip>${E(x.by)}</span>` : ""}</small></li>`).join("")}</ul>` : ""}
      ${(r.commissions || []).length ? `<div class="sec-label">${E(Lang.t("العمولة التقديرية"))}</div><ul class="biz-mini">${r.commissions.map(m => `<li><span data-i18n-skip>${E(m.barber_label)}</span><b>${E(money(m.amount))}</b><small>${m.kind === "percent" ? pct(m.rate) : E(money(m.rate))} · ${E(Lang.t(m.entry === "earned" ? "مكتسبة" : "عكس"))}</small></li>`).join("")}</ul>` : ""}
      ${r.note ? `<p class="tiny" data-i18n-skip>${E(r.note)}</p>` : ""}${r.void_reason && !r.corrected_by_id ? `<p class="sub-warning">${E(Lang.t("سبب الإلغاء"))}: <span data-i18n-skip>${E(String(r.void_reason).replace(/^Corrected: /, ""))}</span></p>` : ""}`;
  }
  function collectModal(r, after) {
    const key = requestKey();
    UI.modal(`<div class="mhead"><h3>${E(Lang.t("تحصيل المتبقي"))}</h3><button class="iconbtn" id="cl-x" aria-label="إغلاق">${UI.icon("x", 20)}</button></div>
      <form class="mform" id="cl-form"><p class="muted">${E(Lang.t("المتبقي"))}: <b>${E(money(r.outstanding))}</b></p>
        <div class="sec-label">${E(Lang.t("طريقة الدفع"))}</div>${methodPicker("cl-m", "cash")}
        <div class="control-form"><label>${E(Lang.t("المبلغ"))}${moneyIn("cl-amount", r.outstanding)}</label><label class="full">${E(Lang.t("مرجع (اختياري)"))}<input class="input" id="cl-ref" maxlength="120"></label></div>
        <button class="btn" type="submit" id="cl-go">${E(Lang.t("تسجيل الدفعة"))}</button>${errorBox("cl-err")}</form>`);
    field("cl-x").onclick = UI.closeModal;
    let method = "cash";
    document.querySelectorAll("[data-cl-m]").forEach(b => b.onclick = () => {
      method = b.dataset.clM;
      document.querySelectorAll("[data-cl-m]").forEach(x => { x.classList.toggle("active", x === b); x.setAttribute("aria-checked", x === b); });
    });
    field("cl-form").onsubmit = async e => {
      e.preventDefault();
      UI.busy("cl-go", true);
      try { await rpc("biz_collect_checkout", { p_token: tok(), p_id: r.id, p_payments: [{ method, amount: Number(val("cl-amount")), reference: val("cl-ref"), confirmed: true }], p_request_key: key }); UI.closeModal(); UI.toast("تم تسجيل الدفعة", "ok"); await after(); }
      catch (err) { showError("cl-err", err); UI.busy("cl-go", false); }
    };
  }
  // Money really given back to the customer (the receipt stays, marked refunded).
  function refundModal(r, after) {
    const key = requestKey();
    const products = (r.items || []).filter(i => i.item_type === "product" && i.product_id && Number(i.refunded_qty) < Number(i.quantity));
    UI.modal(`<div class="mhead"><h3>${E(Lang.t("استرجاع مبلغ للعميل"))}</h3><button class="iconbtn" id="rf-x" aria-label="${E(Lang.t("إغلاق"))}">${UI.icon("x", 20)}</button></div>
      <form class="mform" id="rf-form" novalidate><p class="muted">${E(Lang.t("للمال الذي يُعاد فعلاً للعميل. الحد الأقصى القابل للاسترجاع"))}: <b>${E(money(r.refundable))}</b></p>
        <div class="control-form"><label>${E(Lang.t("المبلغ"))}${moneyIn("rf-amount", r.refundable)}</label>
        <label>${E(Lang.t("طريقة الاسترجاع"))}<select class="select" id="rf-method">${["cash", "card"].map(m => `<option value="${m}">${E(Lang.t(PAY[m]))}</option>`).join("")}</select></label>
        <label class="full">${E(Lang.t("سبب الاسترجاع"))}<input class="input" id="rf-reason" maxlength="300" dir="auto"></label></div>
        <p class="tiny biz-note" id="rf-card-note" hidden>${UI.icon("info", 13)} ${E(Lang.t("تسجيل الاسترجاع هنا لا يعيد المال عبر جهاز البطاقة. نفّذ الاسترجاع على جهاز الدفع أيضاً."))}</p>
        ${products.length ? `<fieldset class="loy-fieldset"><legend>${E(Lang.t("إرجاع المنتجات إلى المخزون"))}</legend>${products.map(i => `<label class="biz-restock"><span data-i18n-skip>${E(i.label)}</span><input class="input" type="number" min="0" max="${Number(i.quantity) - Number(i.refunded_qty)}" step="1" value="0" data-restock="${E(i.id)}" style="max-width:90px"></label>`).join("")}</fieldset>` : ""}
        <p class="tiny">${E(Lang.t("يُسجل الاسترجاع على الدفعات من الأحدث، وتُعكس العمولة التقديرية بنفس النسبة. لا يمكن تكرار نفس الطلب."))}</p>
        <button class="btn" type="submit" id="rf-go">${E(Lang.t("تأكيد الاسترجاع"))}</button>${errorBox("rf-err")}</form>`);
    field("rf-x").onclick = UI.closeModal;
    const note = () => { field("rf-card-note").hidden = val("rf-method") !== "card"; };
    field("rf-method").onchange = note; note();
    field("rf-form").onsubmit = async e => {
      e.preventDefault(); field("rf-err").textContent = "";
      const amount = Number(val("rf-amount")), reason = val("rf-reason");
      if (!(amount > 0)) { showError("rf-err", new Error(Lang.t("أدخل المبلغ الذي ستعيده"))); field("rf-amount").focus(); return; }
      if (amount > Number(r.refundable) + 0.004) { showError("rf-err", new Error(`${Lang.t("الحد الأقصى القابل للاسترجاع")}: ${money(r.refundable)}`)); return; }
      if (reason.length < 3) { showError("rf-err", new Error(Lang.t("اكتب سبب الاسترجاع"))); field("rf-reason").focus(); return; }
      UI.busy("rf-go", true);
      const lines = [...document.querySelectorAll("[data-restock]")].map(x => ({ item_id: x.dataset.restock, quantity: Number(x.value) || 0 })).filter(x => x.quantity > 0);
      try { await rpc("admin_biz_refund_checkout", { p_token: tok(), p_id: r.id, p_data: { amount, method: val("rf-method"), reason, restock: lines.length > 0, lines }, p_request_key: key }); UI.closeModal(); UI.toast("تم تسجيل الاسترجاع", "ok"); await after(); }
      catch (err) { showError("rf-err", err); UI.busy("rf-go", false); }
    };
  }

  // Correct a receipt: change a service, a price, a quantity, the discount;
  // add or remove an item. The server shows what the corrected receipt would
  // be before anything is saved; the original receipt is kept and linked.
  async function correctModal(r, after) {
    let prep = null;
    try { prep = await rpc("biz_prepare_checkout", { p_token: tok(), p_booking: null, p_customer: r.customer_id || null }); }
    catch (e) { UI.toast(e.message, "err"); return; }
    const key = requestKey();
    const asItem = i => {
      const base = { label: i.label, price: Number(i.unit_price), quantity: Number(i.quantity) || 1, barber_id: i.barber_id || undefined, covered: i.covered, line: i };
      if (i.booking_id) return { ...base, type: "booking", booking_id: i.booking_id, package_id: i.customer_package_id || undefined };
      if (i.item_type === "product") return { ...base, type: "product", product_id: i.product_id };
      if (i.item_type === "package") return { ...base, type: "package", package_id: i.package_id };
      if (i.item_type === "service" && i.service_id) return { ...base, type: "service", service_id: i.service_id, package_id: i.customer_package_id || undefined };
      return { ...base, type: "custom", amount: Number(i.unit_price) };
    };
    const state = { items: (r.items || []).filter(i => i.active !== false).map(asItem), preview: null, error: "",
      md: { kind: "fixed", value: Number(r.manual_discount) > 0 ? Number(r.manual_discount) : "", reason: r.discount_reason || "" }, keepCoupon: !!r.coupon_code,
      settle: "cash", refundMethod: "cash", collectOk: false };
    const priceEditable = it => it.covered !== "loyalty" && it.covered !== "package" && it.type !== "package";
    UI.modal(`<div class="biz-sheet"><div class="mhead"><h3>${E(Lang.t("تصحيح الفاتورة"))} <span dir="ltr">#${E(r.receipt_no)}</span></h3><button class="iconbtn" id="cr-x" aria-label="${E(Lang.t("إغلاق"))}">${UI.icon("x", 20)}</button></div>
      <div class="biz-sheet-body"><div class="biz-sheet-main">
        <p class="tiny biz-note">${UI.icon("info", 13)} ${E(Lang.t("تبقى الفاتورة الأصلية في السجل مع رابط للفاتورة المصحّحة. المبلغ الذي دُفع ينتقل إليها بنفس وقته وطريقته."))}</p>
        <section class="biz-co-lines"><div class="sec-label">${E(Lang.t("البنود"))}</div><div id="cr-lines"></div>
          <div class="biz-co-add"><button class="btn line sm" id="cr-add-service">${UI.icon("scissors", 15)} ${E(Lang.t("خدمة"))}</button>${prep.products.length ? `<button class="btn line sm" id="cr-add-product">${UI.icon("bag", 15)} ${E(Lang.t("منتج"))}</button>` : ""}</div>
          <div id="cr-picker"></div></section>
        <section class="biz-co-discounts">
          ${r.coupon_code ? `<label class="checkrow"><input type="checkbox" id="cr-coupon" checked> ${E(Lang.t("إبقاء الكوبون"))} <span dir="ltr">${E(r.coupon_code)}</span></label>` : ""}
          <details class="biz-co-manual" ${Number(r.manual_discount) > 0 ? "open" : ""}><summary>${E(Lang.t("خصم يدوي"))}</summary><div class="control-form">
            <label>${E(Lang.t("النوع"))}<select class="select" id="cr-md-kind"><option value="fixed">${E(Lang.t("مبلغ ثابت"))}</option><option value="percent">${E(Lang.t("نسبة مئوية"))}</option></select></label>
            <label>${E(Lang.t("القيمة"))}${moneyIn("cr-md-value", state.md.value)}</label>
            <label class="full">${E(Lang.t("سبب الخصم"))}<input class="input" id="cr-md-reason" maxlength="200" dir="auto" value="${E(state.md.reason)}"></label></div></details>
        </section>
        <div class="field"><label for="cr-reason">${E(Lang.t("سبب التصحيح"))}</label><input class="input" id="cr-reason" maxlength="300" dir="auto" placeholder="${E(Lang.t("مثال: سعر الخدمة كان خطأ"))}"></div>
      </div>
      <aside class="biz-sheet-total" id="cr-total" aria-live="polite"></aside></div>
      <div class="biz-sheet-foot"><button class="btn" id="cr-go">${UI.icon("check", 18)} ${E(Lang.t("حفظ التصحيح"))}</button>${errorBox("cr-err")}</div></div>`);
    field("cr-x").onclick = UI.closeModal;
    const svcName = id => prep.services.find(x => x.id === id)?.name || "";
    const prodName = id => prep.products.find(x => x.id === id)?.name || "";
    function payload() {
      const items = state.items.map(it => {
        const o = { type: it.type };
        if (it.type === "booking") Object.assign(o, { booking_id: it.booking_id, package_id: it.package_id });
        if (it.type === "service") Object.assign(o, { service_id: it.service_id, quantity: it.quantity, barber_id: it.barber_id, package_id: it.package_id });
        if (it.type === "product") Object.assign(o, { product_id: it.product_id, quantity: it.quantity, barber_id: it.barber_id });
        if (it.type === "package") Object.assign(o, { package_id: it.package_id });
        if (it.type === "custom") Object.assign(o, { amount: Number(it.price), label: it.label, barber_id: it.barber_id });
        else if (priceEditable(it) && it.price !== "" && it.price != null) o.price = Number(it.price);
        return o;
      });
      const data = { items, coupon_code: field("cr-coupon")?.checked ? r.coupon_code : "" };
      const mv = Number(val("cr-md-value"));
      if (mv > 0) data.manual_discount = { kind: val("cr-md-kind"), value: mv, reason: val("cr-md-reason") };
      return data;
    }
    function paintLines() {
      const host = field("cr-lines"); if (!host) return;
      const lines = state.preview?.lines || [];
      host.innerHTML = state.items.map((it, i) => {
        const line = lines[i];
        const label = it.type === "service" && !it.label ? svcName(it.service_id) : it.type === "product" && !it.label ? prodName(it.product_id) : it.label;
        return `<div class="biz-line biz-line-edit"><div class="biz-line-main"><b data-i18n-skip>${E(lineName(label || ""))}</b>
            <small>${E(Lang.t({ booking: "خدمة محجوزة", service: "خدمة إضافية", product: "منتج", package: "بيع باقة", custom: "مبلغ بدون حجز" }[it.type]))}</small>
            ${it.covered === "package" ? `<span class="badge info">${E(Lang.t("من الباقة"))}</span>` : it.covered === "loyalty" ? `<span class="badge info">${E(Lang.t("مدفوعة بالنقاط"))}</span>` : ""}</div>
          <div class="biz-line-edit-fields">
            ${["product", "service"].includes(it.type) ? `<label><span>${E(Lang.t("الكمية"))}</span><input class="input" type="number" min="1" max="1000" step="1" dir="ltr" data-cr-qty="${i}" value="${E(it.quantity)}"></label>` : ""}
            ${priceEditable(it) ? `<label><span>${E(Lang.t("السعر"))}</span><input class="input" type="number" min="0" step="0.01" inputmode="decimal" dir="ltr" data-cr-price="${i}" value="${E(it.price)}"></label>` : ""}
            ${line ? `<strong class="biz-line-net">${E(money(line.net))}</strong>` : ""}
            ${it.type === "booking" ? "" : `<button class="iconbtn" data-cr-remove="${i}" aria-label="${E(Lang.t("إزالة"))}">${UI.icon("trash", 16)}</button>`}</div></div>`;
      }).join("") || `<p class="tiny biz-muted">${E(Lang.t("أضف خدمة أو منتجاً."))}</p>`;
      host.querySelectorAll("[data-cr-qty]").forEach(x => x.oninput = () => { state.items[Number(x.dataset.crQty)].quantity = Math.max(1, Math.round(Number(x.value) || 1)); soon(); });
      host.querySelectorAll("[data-cr-price]").forEach(x => x.oninput = () => { state.items[Number(x.dataset.crPrice)].price = x.value; soon(); });
      host.querySelectorAll("[data-cr-remove]").forEach(b => b.onclick = () => { state.items.splice(Number(b.dataset.crRemove), 1); paintLines(); soon(); });
    }
    function paintTotal() {
      const host = field("cr-total"); if (!host) return;
      const p = state.preview;
      if (!p) { host.innerHTML = state.error ? `<p class="form-error">${E(state.error)}</p>` : `<div class="biz-total-empty">${UI.loading()}</div>`; return; }
      const row = (l, v, cls = "") => `<div class="biz-total-row ${cls}"><span>${E(Lang.t(l))}</span><b>${v}</b></div>`;
      const diff = Number(p.difference);
      host.innerHTML = `<div class="biz-total-card">${row("الإجمالي الأصلي", E(money(p.original_total)), "muted")}
        ${Number(p.manual_discount) > 0 ? row("خصم يدوي", "− " + E(money(p.manual_discount)), "minus") : ""}${Number(p.coupon_discount) > 0 ? row("كوبون", "− " + E(money(p.coupon_discount)), "minus") : ""}
        ${row("الإجمالي بعد التصحيح", E(money(p.total)), "strong")}${row("المدفوع", E(money(p.paid)))}
        ${diff < -0.004 ? `${row("يُعاد للعميل", E(money(-diff)), "warn")}<label class="field"><span>${E(Lang.t("طريقة الإعادة"))}</span><select class="select" id="cr-refund-m"><option value="cash">${E(Lang.t(PAY.cash))}</option><option value="card" ${state.refundMethod === "card" ? "selected" : ""}>${E(Lang.t(PAY.card))}</option></select></label>
          ${state.refundMethod === "card" ? `<p class="tiny">${E(Lang.t("تسجيل الاسترجاع هنا لا يعيد المال عبر جهاز البطاقة. نفّذ الاسترجاع على جهاز الدفع أيضاً."))}</p>` : ""}` : ""}
        ${diff > 0.004 ? `${row("مطلوب من العميل الآن", E(money(diff)), "due")}
          ${p.allow_outstanding ? `<label class="checkrow"><input type="checkbox" id="cr-later" ${state.settle === "later" ? "checked" : ""}> ${E(Lang.t("يبقى المبلغ مستحقاً على الفاتورة"))}</label>` : ""}
          ${state.settle !== "later" ? `${methodPicker("cr-pay", state.settle === "card" ? "card" : "cash")}<label class="checkrow"><input type="checkbox" id="cr-received" ${state.collectOk ? "checked" : ""}> ${E(Lang.t("استلمت هذا المبلغ"))}</label>` : ""}` : ""}
        ${Math.abs(diff) <= 0.004 ? `<p class="tiny">${E(Lang.t("لا فرق في المبلغ: يبقى المدفوع كما هو."))}</p>` : ""}
        ${state.error ? `<p class="form-error">${E(state.error)}</p>` : ""}</div>`;
      const rm = field("cr-refund-m"); if (rm) rm.onchange = () => { state.refundMethod = rm.value; paintTotal(); };
      const later = field("cr-later"); if (later) later.onchange = () => { state.settle = later.checked ? "later" : "cash"; paintTotal(); };
      host.querySelectorAll("[data-cr-pay]").forEach(b => b.onclick = () => { state.settle = b.dataset.crPay; paintTotal(); });
      const got = field("cr-received"); if (got) got.onchange = () => { state.collectOk = got.checked; };
    }
    let timer = null, seq = 0;
    const soon = () => { clearTimeout(timer); timer = setTimeout(preview, 300); };
    async function preview() {
      if (!field("cr-total")) return;
      if (!state.items.length) { state.preview = null; state.error = Lang.t("أضف خدمة أو منتجاً واحداً على الأقل"); paintTotal(); return; }
      const my = ++seq;
      try { const p = await rpc("admin_biz_preview_correction", { p_token: tok(), p_id: r.id, p_data: payload() }); if (my !== seq) return; state.preview = p; state.error = ""; }
      catch (e) { if (my !== seq) return; state.preview = null; state.error = e.message; }
      paintLines(); paintTotal();
    }
    function picker(kind) {
      const host = field("cr-picker"); if (!host) return;
      const opt = (v, l) => `<option value="${E(v)}">${E(l)}</option>`;
      host.innerHTML = kind === "service"
        ? `<div class="biz-picker"><select class="select" id="crp-svc">${prep.services.map(x => opt(x.id, `${x.name} · ${money(x.price)}`)).join("")}</select><button class="btn sm" id="crp-ok" type="button">${E(Lang.t("إضافة"))}</button></div>`
        : `<div class="biz-picker"><select class="select" id="crp-prod">${prep.products.map(x => opt(x.id, `${x.name} · ${money(x.price)}`)).join("")}</select><input class="input" id="crp-qty" type="number" min="1" step="1" value="1" style="max-width:90px" aria-label="${E(Lang.t("الكمية"))}"><button class="btn sm" id="crp-ok" type="button">${E(Lang.t("إضافة"))}</button></div>`;
      field("crp-ok").onclick = () => {
        if (kind === "service") { const s = prep.services.find(x => x.id === val("crp-svc")); if (s) state.items.push({ type: "service", service_id: s.id, label: s.name, price: Number(s.price), quantity: 1, covered: "" }); }
        else { const p = prep.products.find(x => x.id === val("crp-prod")); if (p) state.items.push({ type: "product", product_id: p.id, label: p.name, price: Number(p.price), quantity: Math.max(1, Number(val("crp-qty")) || 1), covered: "" }); }
        host.innerHTML = ""; paintLines(); soon();
      };
    }
    field("cr-add-service").onclick = () => picker("service");
    if (field("cr-add-product")) field("cr-add-product").onclick = () => picker("product");
    ["cr-md-kind", "cr-md-value", "cr-md-reason", "cr-coupon"].forEach(id => { const el = field(id); if (el) el.oninput = el.onchange = soon; });
    field("cr-go").onclick = async () => {
      field("cr-err").textContent = "";
      const reason = val("cr-reason");
      if (reason.length < 3) { showError("cr-err", new Error(Lang.t("اكتب سبب التصحيح"))); field("cr-reason").focus(); return; }
      const p = state.preview; if (!p) { showError("cr-err", new Error(state.error || Lang.t("راجع البنود أولاً"))); return; }
      const diff = Number(p.difference), data = { ...payload(), reason, refund_method: state.refundMethod };
      if (diff > 0.004 && state.settle !== "later") {
        if (!state.collectOk) { showError("cr-err", new Error(Lang.t("أكّد استلام المبلغ قبل الحفظ"))); return; }
        data.extra_payments = [{ method: state.settle === "card" ? "card" : "cash", amount: Math.round(diff * 100) / 100, confirmed: true }];
      }
      UI.busy("cr-go", true);
      try {
        const n = await rpc("admin_biz_correct_checkout", { p_token: tok(), p_id: r.id, p_data: data, p_request_key: key });
        UI.closeModal(); UI.toast(pick(`حُفظ التصحيح — الفاتورة الجديدة #${n.receipt_no}`, `Correction saved — new receipt #${n.receipt_no}`, `התיקון נשמר — קבלה חדשה #${n.receipt_no}`), "ok");
        await after(n.id);
      } catch (e) { showError("cr-err", e); UI.busy("cr-go", false); }
    };
    paintLines(); paintTotal(); await preview();
  }
  // 2.34: the reason is read BEFORE anything closes (2.25–2.33 closed the sheet
  // first, so every action here reached the server with an empty reason and
  // failed: cancelling receipts, expenses, purchases, packages, waitlist…).
  // The sheet stays open with the server's answer when something is refused.
  function reasonModal(title, intro, fn, danger = true, opts = {}) {
    UI.modal(`<div class="mhead"><h3>${E(title)}</h3><button class="iconbtn" id="rs-x" aria-label="${E(Lang.t("إغلاق"))}">${UI.icon("x", 20)}</button></div>
      <form class="mform" id="rs-form" novalidate>${intro ? `<p class="muted">${E(intro)}</p>` : ""}${opts.extra || ""}<div class="field"><label for="rs-reason">${E(Lang.t("السبب"))}</label><input class="input" id="rs-reason" maxlength="300" dir="auto" autocomplete="off"></div>
        <button class="btn ${danger ? "danger" : ""}" type="submit" id="rs-go">${E(opts.cta || Lang.t("تأكيد"))}</button>${errorBox("rs-err")}</form>`);
    field("rs-x").onclick = UI.closeModal;
    setTimeout(() => field("rs-reason")?.focus(), 60);
    field("rs-form").onsubmit = async e => {
      e.preventDefault();
      const reason = val("rs-reason");
      field("rs-err").textContent = "";
      if (reason.length < 3) { showError("rs-err", new Error(Lang.t("اكتب السبب (3 أحرف على الأقل)"))); field("rs-reason").focus(); return; }
      UI.busy("rs-go", true);
      try {
        await fn(reason);
        // fn may already have opened the next sheet (the receipt): close only our own.
        if (field("rs-form")) UI.closeModal();
      } catch (err) {
        if (field("rs-err")) { showError("rs-err", err); UI.busy("rs-go", false); } else UI.toast(err.message, "err");
      }
    };
  }

  // ── Cash drawer (2.34) ─────────────────────────────────────────────────
  // Expected cash for the period since the last closing, cash put in / taken
  // out, closing with the counted amount, and the saved closings. Opened by
  // owners and by members with "Close the cash drawer" only — it shows the
  // drawer's cash and nothing else about the salon's money.
  async function cashPage(body) {
    body.innerHTML = UI.loading();
    let st;
    try { st = await rpc("admin_biz_cash_state", { p_token: tok() }); }
    catch (e) { body.innerHTML = `<div class="card">${UI.empty(Lang.t("تعذّر فتح صندوق النقد"), e.message)}</div>`; return; }
    currency = Money.fromSymbol(st.currency) || Money.fromSymbol(st.symbol) || currency;
    const line = (icon, label, value, cls = "") => `<li class="${cls}">${UI.icon(icon, 14)}<span>${E(Lang.t(label))}</span><b>${E(money(value))}</b></li>`;
    body.innerHTML = `<div class="biz-head biz-head-actions"><button class="btn sm" id="cash-close">${UI.icon("lock", 16)} ${E(Lang.t("إغلاق الصندوق"))}</button>
        <button class="btn line sm" id="cash-move">${UI.icon("money", 16)} ${E(Lang.t("إدخال / سحب نقد"))}</button></div>
      <section class="biz-panel cash-now"><div class="biz-panel-head"><h3>${E(Lang.t("النقد المتوقع في الصندوق الآن"))}</h3><strong class="cash-expected">${E(money(st.expected))}</strong></div>
        <p class="tiny">${E(st.first ? Lang.t("منذ بداية اليوم (أول إغلاق للصندوق)") : pick(`منذ آخر إغلاق: ${stamp(st.since)}`, `Since the last closing: ${stamp(st.since)}`, `מאז הסגירה האחרונה: ${stamp(st.since)}`))}</p>
        <ul class="biz-mini cash-lines">
          ${line("lock", st.first ? "رصيد البداية (تدخله عند الإغلاق)" : "رصيد البداية (من آخر إغلاق)", st.opening)}
          ${line("plus", "مبيعات نقدية", st.cash_sales)}
          ${line("minus", "مبالغ أُعيدت نقداً", -st.cash_refunds)}
          ${line("minus", "مصاريف دُفعت من الصندوق", -st.cash_expenses)}
          ${Number(st.cash_in) ? line("plus", "نقد أُدخل للصندوق", st.cash_in) : ""}
          ${Number(st.cash_out) ? line("minus", "نقد سُحب من الصندوق", -st.cash_out) : ""}
          ${line("check", "المتوقع", st.expected, "strong")}</ul>
        <p class="tiny biz-muted">${E(pick(`للعلم فقط (لا تدخل في الصندوق): مبيعات بالبطاقة ${money(st.card_sales)} · مصاريف نقدية لم تُدفع من الصندوق ${money(st.cash_expenses_not_from_drawer)}. العمولات والرواتب غير المدفوعة لا تُخصم.`,
          `For information (not in the drawer): card sales ${money(st.card_sales)} · cash expenses not paid from the drawer ${money(st.cash_expenses_not_from_drawer)}. Unpaid commissions and salaries are not deducted.`,
          `לידיעה בלבד (לא בקופה): מכירות באשראי ${money(st.card_sales)} · הוצאות במזומן שלא שולמו מהקופה ${money(st.cash_expenses_not_from_drawer)}. עמלות ומשכורות שלא שולמו אינן מנוכות.`))}</p>
        ${(st.moves || []).length ? `<div class="sec-label">${E(Lang.t("حركات النقد في هذه الفترة"))}</div><ul class="biz-mini">${st.moves.map(m => `<li>${UI.icon(m.direction === "in" ? "plus" : "minus", 14)}<span data-i18n-skip>${E(m.reason)}</span><b>${E(money(m.direction === "in" ? m.amount : -m.amount))}</b><small>${E(stamp(m.at))} · <span data-i18n-skip>${E(m.by)}</span></small></li>`).join("")}</ul>` : ""}
      </section>
      <section class="biz-panel"><div class="biz-panel-head"><h3>${E(Lang.t("الإغلاقات السابقة"))}</h3></div><div id="cash-history">${UI.loading()}</div></section>`;
    const refresh = () => cashPage(body);
    field("cash-move").onclick = () => cashMoveModal(refresh);
    field("cash-close").onclick = () => cashCloseModal(st, refresh);
    try {
      const h = await rpc("admin_biz_cash_history", { p_token: tok(), p_limit: 20, p_offset: 0 });
      const box = field("cash-history"); if (!box) return;
      box.innerHTML = h.items.length ? `<div class="biz-rows">${h.items.map(x => `<button class="biz-row clickable" data-closing="${E(x.id)}"><div class="biz-row-time"><b>${E(stamp(x.period_to))}</b><small data-i18n-skip>${E(x.by)}</small></div>
          <div class="biz-row-main"><b>${E(Lang.t("المتوقع"))} ${E(money(x.expected))} · ${E(Lang.t("المعدود"))} ${E(money(x.counted))}</b>${x.adjustments ? `<small>${E(pick(`${num(x.adjustments)} تغيير بعد الإغلاق`, `${num(x.adjustments)} change(s) after closing`, `${num(x.adjustments)} שינויים אחרי הסגירה`))}</small>` : ""}</div>
          <div class="biz-row-side">${cashDiff(x.difference)}${UI.icon("chev", 16)}</div></button>`).join("")}</div>`
        : `<p class="tiny biz-muted">${E(Lang.t("لم يُغلق الصندوق بعد."))}</p>`;
      box.querySelectorAll("[data-closing]").forEach(b => b.onclick = () => cashReport(b.dataset.closing));
    } catch (e) { const box = field("cash-history"); if (box) box.textContent = e.message; }
  }
  const cashDiff = d => { const v = Number(d) || 0; return Math.abs(v) < 0.005 ? `<span class="badge ok">${E(Lang.t("مطابق"))}</span>`
    : `<span class="badge ${v < 0 ? "danger" : "warn"}">${E(Lang.t(v < 0 ? "عجز" : "زيادة"))} ${E(money(Math.abs(v)))}</span>`; };
  function cashMoveModal(after) {
    const key = requestKey(); let dir = "out";
    UI.modal(`<div class="mhead"><h3>${E(Lang.t("إدخال / سحب نقد"))}</h3><button class="iconbtn" id="cm-x" aria-label="${E(Lang.t("إغلاق"))}">${UI.icon("x", 20)}</button></div>
      <form class="mform" id="cm-form" novalidate>${UI.seg("cm-dir", [{ v: "out", l: Lang.t("سحب من الصندوق") }, { v: "in", l: Lang.t("إدخال إلى الصندوق") }], dir)}
        <div class="control-form"><label>${E(Lang.t("المبلغ"))}${moneyIn("cm-amount", "")}</label>
        <label class="full">${E(Lang.t("السبب"))}<input class="input" id="cm-reason" maxlength="300" dir="auto" placeholder="${E(Lang.t("مثال: إيداع في البنك، فكّة"))}"></label></div>
        <p class="tiny">${E(Lang.t("لمصروف دُفع من الصندوق، سجّله في المصاريف واختر «دُفع من صندوق النقد»."))}</p>
        <button class="btn" type="submit" id="cm-go">${E(Lang.t("حفظ"))}</button>${errorBox("cm-err")}</form>`);
    field("cm-x").onclick = UI.closeModal;
    UI.wireSeg("cm-dir", v => { dir = v; });
    field("cm-form").onsubmit = async e => {
      e.preventDefault(); field("cm-err").textContent = "";
      const amount = Number(val("cm-amount")), reason = val("cm-reason");
      if (!(amount > 0)) { showError("cm-err", new Error(Lang.t("أدخل المبلغ"))); return; }
      if (reason.length < 3) { showError("cm-err", new Error(Lang.t("اكتب سبب الحركة"))); return; }
      UI.busy("cm-go", true);
      try { await rpc("admin_biz_cash_move", { p_token: tok(), p_data: { direction: dir, amount, reason }, p_request_key: key }); UI.closeModal(); UI.toast("تم الحفظ", "ok"); await after(); }
      catch (err) { showError("cm-err", err); UI.busy("cm-go", false); }
    };
  }
  function cashCloseModal(st, after) {
    const key = requestKey();
    UI.modal(`<div class="mhead"><h3>${E(Lang.t("إغلاق الصندوق"))}</h3><button class="iconbtn" id="cc-x" aria-label="${E(Lang.t("إغلاق"))}">${UI.icon("x", 20)}</button></div>
      <form class="mform" id="cc-form" novalidate>
        ${st.first ? `<div class="field"><label for="cc-opening">${E(Lang.t("كم كان في الصندوق في بداية اليوم؟"))}</label>${moneyIn("cc-opening", "0")}</div>` : ""}
        <div class="field"><label for="cc-counted">${E(Lang.t("المبلغ الذي عددته الآن"))}</label>${moneyIn("cc-counted", "")}</div>
        <div class="cash-compare" id="cc-compare" aria-live="polite"></div>
        <div class="field"><label for="cc-note">${E(Lang.t("ملاحظة (اختياري)"))}</label><input class="input" id="cc-note" maxlength="500" dir="auto" placeholder="${E(Lang.t("مثال: سبب العجز أو الزيادة"))}"></div>
        <p class="tiny">${E(Lang.t("يُحفظ تقرير الإغلاق ولا يتغير لاحقاً. أي تصحيح بعده يظهر تحته كتغيير منفصل."))}</p>
        <button class="btn" type="submit" id="cc-go">${UI.icon("lock", 16)} ${E(Lang.t("تأكيد الإغلاق"))}</button>${errorBox("cc-err")}</form>`);
    field("cc-x").onclick = UI.closeModal;
    const expected = () => Number(st.expected) - (st.first ? Number(st.opening) - (Number(val("cc-opening")) || 0) : 0);
    const paint = () => {
      const counted = val("cc-counted"), exp = Math.round(expected() * 100) / 100;
      field("cc-compare").innerHTML = `<div class="biz-total-row"><span>${E(Lang.t("المتوقع"))}</span><b>${E(money(exp))}</b></div>
        ${counted !== "" ? `<div class="biz-total-row"><span>${E(Lang.t("المعدود"))}</span><b>${E(money(counted))}</b></div><div class="biz-total-row strong"><span>${E(Lang.t("الفرق"))}</span><b>${cashDiff(Number(counted) - exp)}</b></div>` : ""}`;
    };
    ["cc-counted", "cc-opening"].forEach(id => { const el = field(id); if (el) el.oninput = paint; });
    paint();
    field("cc-form").onsubmit = async e => {
      e.preventDefault(); field("cc-err").textContent = "";
      if (val("cc-counted") === "" || Number(val("cc-counted")) < 0) { showError("cc-err", new Error(Lang.t("أدخل المبلغ الذي عددته"))); field("cc-counted").focus(); return; }
      const data = { counted: Number(val("cc-counted")), note: val("cc-note") };
      if (st.first) data.opening = Number(val("cc-opening")) || 0;
      UI.busy("cc-go", true);
      try { const rep = await rpc("admin_biz_cash_close", { p_token: tok(), p_data: data, p_request_key: key }); UI.toast("تم إغلاق الصندوق", "ok"); await after(); cashReport(rep.id, rep); }
      catch (err) { showError("cc-err", err); UI.busy("cc-go", false); }
    };
  }
  async function cashReport(id, data) {
    let c = data;
    if (!c) { try { c = await rpc("admin_biz_cash_report", { p_token: tok(), p_id: id }); } catch (e) { UI.toast(e.message, "err"); return; } }
    const row = (l, v, cls = "") => `<div class="biz-total-row ${cls}"><span>${E(Lang.t(l))}</span><b>${v}</b></div>`;
    const html = `<p class="tiny">${E(stamp(c.period_from))} → ${E(stamp(c.period_to))} · <span data-i18n-skip>${E(c.closed_by_label)}</span></p>
      <div class="biz-total-card">${row("رصيد البداية", E(money(c.opening)))}${row("مبيعات نقدية", E(money(c.cash_sales)))}${row("مبالغ أُعيدت نقداً", E(money(-c.cash_refunds)))}
        ${row("مصاريف دُفعت من الصندوق", E(money(-c.cash_expenses)))}${Number(c.cash_in) ? row("نقد أُدخل", E(money(c.cash_in))) : ""}${Number(c.cash_out) ? row("نقد سُحب", E(money(-c.cash_out))) : ""}
        ${row("المتوقع", E(money(c.expected)), "strong")}${row("المعدود", E(money(c.counted)), "strong")}${row("الفرق", cashDiff(c.difference), "due")}</div>
      ${c.note ? `<p><b>${E(Lang.t("ملاحظة"))}:</b> <span data-i18n-skip>${E(c.note)}</span></p>` : ""}
      ${(c.adjustments || []).length ? `<div class="sec-label">${E(Lang.t("تغييرات بعد الإغلاق (لا تغيّر هذا التقرير)"))}</div><ul class="biz-mini">${c.adjustments.map(a => `<li>${UI.icon("info", 14)}<span data-i18n-skip>${E(a.reason)}</span><b>${E(money(a.amount))}</b><small>${E(stamp(a.at))}</small></li>`).join("")}</ul>` : ""}`;
    UI.modal(`<div class="mhead"><h3>${E(Lang.t("تقرير إغلاق الصندوق"))}</h3><button class="iconbtn" id="cr2-x" aria-label="${E(Lang.t("إغلاق"))}">${UI.icon("x", 20)}</button></div>
      <div class="mform">${html}<button class="btn line" id="cr2-print">${UI.icon("list", 16)} ${E(Lang.t("طباعة / PDF"))}</button></div>`);
    field("cr2-x").onclick = UI.closeModal;
    field("cr2-print").onclick = () => Exporter.print(Lang.t("تقرير إغلاق الصندوق"), `<h1>${E(Control.target()?.name || App.settings?.app_name || "METON")}</h1>${html}`);
  }

  // ── Financial Management ───────────────────────────────────────────────
  async function financePage(body, c, s) {
    let period = "month", from = null, to = null, sub = "summary";
    const range = () => {
      const t = c.today;
      if (period === "today") return [t, t];
      if (period === "week") return [addDays(t, -6), t];
      if (period === "month") return [t.slice(0, 8) + "01", t];
      return [from || addDays(t, -29), to || t];
    };
    const canRecord = c.actor.admin && on(c, "smart_checkout");
    body.innerHTML = `${sectionHead(s, `<div class="biz-export">${canRecord ? `<button class="btn sm" id="fin-record">${UI.icon("plus", 15)} ${E(Lang.t("تسجيل دفعة"))}</button>` : ""}<button class="btn line sm" id="fin-export">${UI.icon("list", 15)} ${E(Lang.t("تصدير"))}</button></div>`)}
      <div class="card biz-toolbar">${UI.seg("fin-period", [{ v: "today", l: Lang.t("اليوم") }, { v: "week", l: Lang.t("الأسبوع") }, { v: "month", l: Lang.t("الشهر") }, { v: "custom", l: Lang.t("فترة مخصصة") }], period)}
        <div class="biz-range" id="fin-range" hidden><label>${E(Lang.t("من"))}<input class="input" type="date" id="fin-from"></label><label>${E(Lang.t("إلى"))}<input class="input" type="date" id="fin-to"></label><button class="btn sm" id="fin-apply">${E(Lang.t("عرض"))}</button></div></div>
      ${UI.seg("fin-sub", [{ v: "summary", l: Lang.t("الملخص") }, { v: "receipts", l: Lang.t("الفواتير") }, { v: "expenses", l: Lang.t("المصاريف") }].concat(on(c, "inventory") ? [{ v: "purchases", l: Lang.t("المشتريات") }] : []), sub)}
      <div id="fin-body">${UI.loading()}</div>`;
    UI.wireSeg("fin-period", v => { period = v; field("fin-range").hidden = v !== "custom"; if (v !== "custom") paint(); });
    UI.wireSeg("fin-sub", v => { sub = v; paint(); });
    field("fin-apply").onclick = () => { from = val("fin-from") || null; to = val("fin-to") || null; paint(); };
    field("fin-export").onclick = () => exportModal(range());
    // A customer who paid without a booking: the walk-in sheet, opened on a free amount.
    if (field("fin-record")) field("fin-record").onclick = () => openCheckout({ walkIn: true, custom: true, onDone: () => paint() });
    const paint = async () => {
      const host = field("fin-body"); if (!host) return;
      host.innerHTML = UI.loading();
      const [f, t] = range();
      try {
        if (sub === "summary") await financeSummary(host, f, t);
        else if (sub === "receipts") await receiptsList(host, f, t);
        else if (sub === "purchases") await purchasesPanel(host, f, t);
        else await expensesPanel(host, f, t, paint);
      } catch (e) { host.innerHTML = `<div class="card">${E(e.message)}</div>`; }
    };
    await paint();
  }
  async function financeSummary(host, f, t) {
    const r = await rpc("admin_biz_report_finance", { p_token: tok(), p_from: f, p_to: t });
    const cur = r.current, g = r.growth || {};
    const growth = k => g[k] == null ? "" : `<em class="biz-growth ${g[k] >= 0 ? "up" : "down"}" dir="ltr">${g[k] >= 0 ? "+" : ""}${pct(g[k])}</em>`;
    const kpi = (label, value, k, sub) => `<article class="biz-kpi"><span>${E(Lang.t(label))}</span><strong>${value}</strong><small>${growth(k)} ${E(sub || "")}</small></article>`;
    const maxY = Math.max(1, ...r.series.map(x => Math.max(Number(x.revenue), Number(x.expenses))));
    const bars = r.series.map(x => `<div class="biz-bar" title="${E(x.d)}"><i class="rev" style="height:${(Number(x.revenue) / maxY * 100).toFixed(1)}%"></i><i class="exp" style="height:${(Number(x.expenses) / maxY * 100).toFixed(1)}%"></i><small>${E(r.series_unit === "month" ? Lang.date(x.d, { month: "short" }) : String(x.d).slice(8))}</small></div>`).join("");
    const table = (title, cols, rows) => `<section class="biz-panel"><div class="biz-panel-head"><h3>${E(Lang.t(title))}</h3></div>${rows.length ? `<table class="biz-table"><thead><tr>${cols.map(c => `<th>${E(Lang.t(c))}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table>` : `<p class="tiny biz-muted">${E(Lang.t("لا توجد بيانات في هذه الفترة."))}</p>`}</section>`;
    host.innerHTML = `<p class="tiny biz-period">${E(day(r.from))} – ${E(day(r.to))} · ${E(pick(`مقارنة بـ ${day(r.previous.from)} – ${day(r.previous.to)}`, `compared with ${day(r.previous.from)} – ${day(r.previous.to)}`, `בהשוואה ל־${day(r.previous.from)} – ${day(r.previous.to)}`))}</p>
      <div class="biz-kpis">${kpi("الإيراد", E(money(cur.revenue)), "revenue", pick(`${num(cur.checkouts)} فاتورة`, `${num(cur.checkouts)} receipts`, `${num(cur.checkouts)} קבלות`))}
        ${kpi("الصافي التقديري", E(money(cur.estimated_net)), "estimated_net", Lang.t("بعد المصاريف والعمولات والتكلفة"))}
        ${kpi("المصاريف", E(money(cur.expenses)), "expenses", "")}
        ${kpi("متوسط إنفاق العميل", E(money(cur.average_spend)), "average_spend", pick(`${num(cur.customers)} عميل`, `${num(cur.customers)} customers`, `${num(cur.customers)} לקוחות`))}
        ${kpi("الخدمات", E(money(cur.services)), "services", "")}${kpi("المنتجات", E(money(cur.products)), "products", "")}</div>
      <div class="biz-kpis small">
        <article class="biz-kpi"><span>${E(Lang.t("المسترجع"))}</span><strong>${E(money(cur.refunds))}</strong></article>
        <article class="biz-kpi"><span>${E(Lang.t("العمولات التقديرية"))}</span><strong>${E(money(cur.commissions))}</strong></article>
        <article class="biz-kpi"><span>${E(Lang.t("تكلفة المنتجات المباعة"))}</span><strong>${E(money(cur.product_cost))}</strong></article>
        <article class="biz-kpi"><span>${E(Lang.t("الخصومات"))}</span><strong>${E(money(Number(cur.coupon_discounts) + Number(cur.manual_discounts)))}</strong></article>
        <article class="biz-kpi"><span>${E(Lang.t("مبيعات الباقات"))}</span><strong>${E(money(cur.packages))}</strong><small>${E(pick(`جلسات مستخدمة بقيمة ${money(cur.package_covered)} (ليست إيراداً جديداً)`, `sessions used worth ${money(cur.package_covered)} (not new revenue)`, `שימוש בסשנים בשווי ${money(cur.package_covered)} (לא הכנסה חדשה)`))}</small></article>
        <article class="biz-kpi"><span>${E(Lang.t("عربون مُحتجز كإيراد"))}</span><strong>${E(money(cur.deposits_forfeited))}</strong></article>
        ${Number(cur.purchases) || Number(cur.internal_use) ? `<article class="biz-kpi"><span>${E(Lang.t("مشتريات المخزون"))}</span><strong>${E(money(cur.purchases))}</strong><small>${E(pick(`مدفوع ${money(cur.purchases_paid)} · استهلاك داخلي ${money(cur.internal_use)}`, `paid ${money(cur.purchases_paid)} · internal use ${money(cur.internal_use)}`, `שולם ${money(cur.purchases_paid)} · שימוש פנימי ${money(cur.internal_use)}`))}</small></article>` : ""}</div>
      ${cur.workforce && Object.keys(cur.workforce).length ? `<div class="biz-kpis small">
        <article class="biz-kpi"><span>${E(Lang.t("تكلفة الفريق"))}</span><strong>${E(money(cur.staff_costs))}</strong><small>${E(pick(`رواتب ${money(cur.workforce.salaries)} · ساعات ${money(cur.workforce.wages)} · إضافي ${money(cur.workforce.overtime)}`, `salaries ${money(cur.workforce.salaries)} · hours ${money(cur.workforce.wages)} · overtime ${money(cur.workforce.overtime)}`, `משכורות ${money(cur.workforce.salaries)} · שעות ${money(cur.workforce.wages)} · נוספות ${money(cur.workforce.overtime)}`))}</small></article>
        <article class="biz-kpi"><span>${E(Lang.t("منها الموظفون المساندون"))}</span><strong>${E(money(cur.workforce.support_staff))}</strong></article>
        <article class="biz-kpi"><span>${E(Lang.t("مستحق للموظفين الآن"))}</span><strong>${E(money(cur.workforce.outstanding_now))}</strong><small>${E(pick(`دُفع في الفترة ${money(cur.workforce.paid)}`, `paid in the period ${money(cur.workforce.paid)}`, `שולם בתקופה ${money(cur.workforce.paid)}`))}</small></article>
        ${Number(cur.chair_rent) || Number(cur.renter_collected) ? `<article class="biz-kpi"><span>${E(Lang.t("إيجار الكراسي"))}</span><strong>${E(money(cur.chair_rent))}</strong><small>${E(pick(`مستلم ${money(cur.workforce.rent_received)}`, `received ${money(cur.workforce.rent_received)}`, `התקבל ${money(cur.workforce.rent_received)}`))}</small></article>
        <article class="biz-kpi"><span>${E(Lang.t("محصّل لمستأجري الكراسي"))}</span><strong>${E(money(cur.renter_collected))}</strong><small>${E(Lang.t("ليس إيراداً للعمل"))}</small></article>` : ""}</div>` : ""}
      ${cur.cash_flow ? `<section class="biz-panel"><div class="biz-panel-head"><h3>${E(Lang.t("التدفق النقدي"))}</h3><strong>${E(money(cur.cash_flow.net))}</strong></div><ul class="biz-mini">
          <li>${UI.icon("plus", 14)}<span>${E(Lang.t("المحصّل من العملاء"))}</span><b>${E(money(cur.cash_flow.collected))}</b></li>
          ${Number(cur.cash_flow.rent_received) ? `<li>${UI.icon("plus", 14)}<span>${E(Lang.t("إيجار كراسي مستلم"))}</span><b>${E(money(cur.cash_flow.rent_received))}</b></li>` : ""}
          <li>${UI.icon("minus", 14)}<span>${E(Lang.t("مبالغ مسترجعة"))}</span><b>${E(money(cur.cash_flow.refunds))}</b></li>
          <li>${UI.icon("minus", 14)}<span>${E(Lang.t("مصاريف"))}</span><b>${E(money(cur.cash_flow.expenses))}</b></li>
          <li>${UI.icon("minus", 14)}<span>${E(Lang.t("مدفوعات المشتريات"))}</span><b>${E(money(cur.cash_flow.purchases))}</b></li>
          ${Number(cur.cash_flow.staff_payments) ? `<li>${UI.icon("minus", 14)}<span>${E(Lang.t("دفعات للموظفين"))}</span><b>${E(money(cur.cash_flow.staff_payments))}</b></li>` : ""}</ul></section>` : ""}
      <div class="biz-split">
        <section class="biz-panel"><div class="biz-panel-head"><h3>${E(Lang.t("الإيراد والمصاريف"))}</h3><span class="biz-legend"><i class="rev"></i>${E(Lang.t("الإيراد"))} <i class="exp"></i>${E(Lang.t("المصاريف"))}</span></div><div class="biz-bars" dir="ltr">${bars}</div></section>
        <section class="biz-panel"><div class="biz-panel-head"><h3>${E(Lang.t("الآن"))}</h3></div><ul class="biz-mini">
          <li>${UI.icon("clock", 14)}<span>${E(Lang.t("مبالغ مستحقة على فواتير"))}</span><b>${E(money(r.outstanding_now.amount))}</b><small>${num(r.outstanding_now.count)}</small></li>
          <li>${UI.icon("lock", 14)}<span>${E(Lang.t("عربون مدفوع ومحفوظ"))}</span><b>${E(money(r.deposits_now.held))}</b></li>
          <li>${UI.icon("refresh", 14)}<span>${E(Lang.t("عربون يجب إرجاعه"))}</span><b>${E(money(r.deposits_now.refund_due))}</b></li>
          <li>${UI.icon("info", 14)}<span>${E(Lang.t("عربون بانتظار الدفع"))}</span><b>${E(money(r.deposits_now.pending_amount))}</b><small>${num(r.deposits_now.pending_count)}</small></li>
          <li>${UI.icon("calendar", 14)}<span>${E(Lang.t("إيراد متوقع من الحجوزات القادمة (30 يوماً)"))}</span><b>${E(money(r.upcoming.amount))}</b><small>${num(r.upcoming.count)}</small></li>
          ${r.purchases_owed && Number(r.purchases_owed.amount) ? `<li>${UI.icon("box", 14)}<span>${E(Lang.t("مستحق للموردين"))}</span><b>${E(money(r.purchases_owed.amount))}</b><small>${num(r.purchases_owed.count)}</small></li>` : ""}</ul>
          ${Number(r.unrecorded.count) > 0 ? `<p class="sub-warning">${E(pick(`${num(r.unrecorded.count)} زيارة مكتملة بدون فاتورة (${money(r.unrecorded.amount)}) — لا تدخل في الإيراد حتى يتم إتمام دفعها.`, `${num(r.unrecorded.count)} completed visits without a receipt (${money(r.unrecorded.amount)}) are not in revenue until checked out.`, `${num(r.unrecorded.count)} ביקורים שהושלמו ללא קבלה (${money(r.unrecorded.amount)}) אינם בהכנסות עד לסגירת התשלום.`))}</p>` : ""}</section></div>
      <div class="biz-split">
        ${table("حسب طريقة الدفع", ["الطريقة", "المستلم", "المسترجع"], r.by_method.map(m => `<tr><td>${E(Lang.t(PAY[m.method] || m.method))}</td><td>${E(money(m.received))}</td><td>${E(money(m.refunded))}</td></tr>`))}
        ${table("حسب الموظف", ["المختص", "الإيراد", "الخدمات", "العمولة التقديرية"], r.by_barber.map(b => `<tr><td data-i18n-skip>${E(b.name)}</td><td>${E(money(b.revenue))}</td><td>${num(b.services)}</td><td>${E(money(b.commissions))}</td></tr>`))}</div>
      <div class="biz-split">
        ${table("الخدمات الأعلى إيراداً", ["الخدمة", "العدد", "الإيراد", "من باقات"], r.by_service.map(x => `<tr><td data-i18n-skip>${E(x.name)}</td><td>${num(x.count)}</td><td>${E(money(x.revenue))}</td><td>${num(x.from_packages)}</td></tr>`))}
        ${table("المنتجات", ["المنتج", "الكمية", "الإيراد", "الربح التقديري"], r.by_product.map(x => `<tr><td data-i18n-skip>${E(x.name)}</td><td>${num(x.quantity)}</td><td>${E(money(x.revenue))}</td><td>${x.cost == null ? "—" : E(money(Number(x.revenue) - Number(x.cost)))}</td></tr>`))}</div>
      <div class="biz-split">
        ${table("أفضل العملاء", ["العميل", "الزيارات", "الإجمالي"], r.top_customers.map(x => `<tr><td data-i18n-skip>${E(x.name)}</td><td>${num(x.visits)}</td><td>${E(money(x.total))}</td></tr>`))}
        ${table("المصاريف حسب التصنيف", ["التصنيف", "العدد", "المبلغ"], r.expenses_by_category.map(x => `<tr><td data-i18n-skip>${E(catName(x.name))}</td><td>${num(x.count)}</td><td>${E(money(x.amount))}</td></tr>`))}</div>
      <p class="tiny biz-note">${UI.icon("info", 14)} ${E(Lang.t("«الصافي التقديري» = الإيراد − المسترجع + العربون المحتجز − المصاريف − العمولات − تكلفة المنتجات المباعة − تكلفة الفريق + إيجار الكراسي. المشتريات تظهر في التدفق النقدي ولا تُخصم مرتين. للأغراض الداخلية وليس بديلاً عن المحاسب."))}</p>`;
  }
  async function receiptsList(host, f, t) {
    let status = "", q = "", page = 0, rows = [], next = false; const PAGE = 10;
    host.innerHTML = `<div class="card biz-toolbar"><input class="input" id="rcl-q" placeholder="${E(Lang.t("رقم الفاتورة أو اسم العميل أو المختص"))}">
      <select class="select" id="rcl-status"><option value="">${E(Lang.t("كل الحالات"))}</option><option value="outstanding">${E(Lang.t("عليها مبلغ متبقٍ"))}</option>${Object.keys(CHECKOUT_STATE).map(k => `<option value="${k}">${E(Lang.t(CHECKOUT_STATE[k][0]))}</option>`).join("")}</select></div><div id="rcl-list">${UI.loading()}</div>`;
    const load = async () => { const r = await rpc("admin_biz_list_checkouts", { p_token: tok(), p_from: f, p_to: t, p_status: status || null, p_search: q || null, p_limit: PAGE, p_offset: page * PAGE }); rows = r.items; next = rows.length === PAGE; };
    const paint = () => {
      const box = field("rcl-list"); if (!box) return;
      box.innerHTML = (rows.length ? `<div class="biz-rows">${rows.map(receiptRow).join("")}</div>` : UI.empty(Lang.t("لا توجد فواتير"), "")) + UI.pager(page, next);
      UI.wirePager(async () => { if (page > 0) { page--; await load(); paint(); } }, async () => { if (next) { page++; await load(); paint(); } }, box);
      box.querySelectorAll("[data-receipt]").forEach(b => b.onclick = () => receipt(b.dataset.receipt, async () => { await load(); paint(); }));
    };
    let timer;
    field("rcl-q").oninput = e => { clearTimeout(timer); timer = setTimeout(async () => { q = e.target.value.trim(); page = 0; await load(); paint(); }, 300); };
    field("rcl-status").onchange = async e => { status = e.target.value; page = 0; await load(); paint(); };
    await load(); paint();
  }
  async function expensesPanel(host, f, t, refresh, page = 0) {
    const PAGE = 10;
    const [list, cats] = await Promise.all([rpc("admin_biz_list_expenses", { p_token: tok(), p_from: f, p_to: t, p_limit: PAGE + 1, p_offset: page * PAGE }), rpc("admin_biz_list_expense_categories", { p_token: tok() })]);
    const more = list.items.length > PAGE; list.items = list.items.slice(0, PAGE);
    host.innerHTML = `<div class="biz-actions-row"><button class="btn sm" id="ex-new">${UI.icon("plus", 16)} ${E(Lang.t("مصروف جديد"))}</button><button class="btn line sm" id="ex-cats">${UI.icon("tag", 15)} ${E(Lang.t("التصنيفات"))}</button>
        <span class="biz-total-inline">${E(Lang.t("مجموع الفترة"))}: <b>${E(money(list.total))}</b></span></div>
      ${list.items.length ? `<div class="biz-rows">${list.items.map(x => `<div class="biz-row ${x.status === "voided" ? "muted" : ""}"><div class="biz-row-time"><b>${E(day(x.expense_date))}</b><small>${E(Lang.t(EXP_PAY[x.method] || PAY[x.method] || x.method))}</small></div>
          <div class="biz-row-main"><b data-i18n-skip>${E(catName(x.category_label))}</b><small data-i18n-skip>${E(x.description || "")}</small>${x.from_drawer ? `<span class="badge info">${E(Lang.t("من الصندوق"))}</span>` : ""}${x.status === "voided" ? `<span class="badge muted">${E(Lang.t("ملغى"))}</span> <small data-i18n-skip>${E(x.void_reason)}</small>` : ""}</div>
          <div class="biz-row-side"><strong>${E(money(x.amount))}</strong>${x.status === "active" ? `<button class="iconbtn" data-ex-edit="${E(x.id)}" aria-label="${E(Lang.t("تعديل"))}">${UI.icon("pencil", 15)}</button><button class="iconbtn" data-ex-void="${E(x.id)}" aria-label="${E(Lang.t("إلغاء"))}">${UI.icon("trash", 15)}</button>` : ""}</div></div>`).join("")}</div>`
        : UI.empty(Lang.t("لا توجد مصاريف في هذه الفترة"), Lang.t("سجّل الإيجار والرواتب والمستلزمات ليظهر الصافي التقديري بدقة."))}${UI.pager(page, more)}`;
    UI.wirePager(() => { if (page > 0) expensesPanel(host, f, t, refresh, page - 1); }, () => { if (more) expensesPanel(host, f, t, refresh, page + 1); }, host);
    field("ex-new").onclick = () => expenseModal(null, cats, refresh);
    field("ex-cats").onclick = () => categoriesModal(cats, refresh);
    host.querySelectorAll("[data-ex-edit]").forEach(b => b.onclick = () => expenseModal(list.items.find(x => x.id === b.dataset.exEdit), cats, refresh));
    host.querySelectorAll("[data-ex-void]").forEach(b => b.onclick = () => reasonModal(Lang.t("إلغاء المصروف"), Lang.t("يبقى المصروف في السجل كملغى ولا يدخل في الحسابات."), async reason => {
      await rpc("admin_biz_void_expense", { p_token: tok(), p_id: b.dataset.exVoid, p_reason: reason }); UI.toast("تم الإلغاء", "ok"); await refresh(); }));
  }
  function expenseModal(x, cats, refresh) {
    x = x || {}; const key = requestKey();
    UI.modal(`<div class="mhead"><h3>${E(Lang.t(x.id ? "تعديل مصروف" : "مصروف جديد"))}</h3><button class="iconbtn" id="ex-x" aria-label="إغلاق">${UI.icon("x", 20)}</button></div>
      <form class="mform" id="ex-form">${Features.enabled("employee_earnings") ? `<p class="tiny">${UI.icon("info", 13)} ${E(Lang.t("رواتب الفريق وأجوره تُحسب تلقائياً في «أرباح الموظفين». لا تسجلها هنا مرة أخرى."))}</p>` : ""}<div class="control-form">
        <label>${E(Lang.t("المبلغ"))}${moneyIn("ex-amount", x.amount, "required")}</label>
        <label>${E(Lang.t("التاريخ"))}<input class="input" type="date" id="ex-date" value="${E(x.expense_date || iso(new Date()))}"></label>
        <label>${E(Lang.t("التصنيف"))}<select class="select" id="ex-cat"><option value="">${E(Lang.t("بدون"))}</option>${cats.filter(c => c.is_active || c.id === x.category_id).map(c => `<option value="${E(c.id)}" ${c.id === x.category_id ? "selected" : ""}>${E(catName(c.name))}</option>`).join("")}</select></label>
        <label>${E(Lang.t("طريقة الدفع"))}<select class="select" id="ex-method">${["cash", "card", "other"].concat(["external_terminal", "online"].includes(x.method) ? [x.method] : []).map(m => `<option value="${m}" ${m === (x.method || "cash") ? "selected" : ""}>${E(Lang.t(EXP_PAY[m]))}</option>`).join("")}</select></label>
        <label class="full">${E(Lang.t("الوصف"))}<input class="input" id="ex-desc" maxlength="300" value="${E(x.description || "")}"></label>
        <label class="checkrow full" id="ex-drawer-row"><input type="checkbox" id="ex-drawer" ${x.from_drawer ? "checked" : ""}> ${E(Lang.t("دُفع من صندوق النقد"))}<small class="tiny">${E(Lang.t("يُخصم من النقد المتوقع عند إغلاق الصندوق"))}</small></label>
        ${x.id ? `<label class="full">${E(Lang.t("سبب التعديل"))}<input class="input" id="ex-reason" maxlength="300"></label>` : ""}</div>
        <button class="btn" type="submit" id="ex-save">${E(Lang.t("حفظ"))}</button>${errorBox("ex-err")}</form>`);
    field("ex-x").onclick = UI.closeModal;
    // Only cash can come out of the drawer.
    const drawer = () => { const cash = val("ex-method") === "cash"; field("ex-drawer-row").hidden = !cash; if (!cash) field("ex-drawer").checked = false; };
    field("ex-method").addEventListener("change", drawer); drawer();
    field("ex-form").onsubmit = async e => {
      e.preventDefault(); UI.busy("ex-save", true);
      try {
        await rpc("admin_biz_save_expense", { p_token: tok(), p_id: x.id || null, p_data: { amount: Number(val("ex-amount")), expense_date: val("ex-date"), category_id: val("ex-cat") || null, method: val("ex-method"), description: val("ex-desc"), reason: val("ex-reason"), from_drawer: !!field("ex-drawer")?.checked }, p_request_key: key });
        UI.closeModal(); UI.toast("تم الحفظ", "ok"); await refresh();
      } catch (err) { showError("ex-err", err); UI.busy("ex-save", false); }
    };
  }
  function categoriesModal(cats, refresh) {
    UI.modal(`<div class="mhead"><h3>${E(Lang.t("تصنيفات المصاريف"))}</h3><button class="iconbtn" id="ct-x" aria-label="إغلاق">${UI.icon("x", 20)}</button></div>
      <div class="mform"><ul class="biz-mini">${cats.map(c => `<li><span data-i18n-skip>${E(catName(c.name))}</span><label class="switch"><input type="checkbox" data-cat="${E(c.id)}" data-name="${E(c.name)}" ${c.is_active ? "checked" : ""}><span class="track"></span><span class="thumb"></span></label></li>`).join("")}</ul>
      <div class="row" style="gap:8px"><input class="input" id="ct-new" maxlength="60" placeholder="${E(Lang.t("تصنيف جديد"))}"><button class="btn sm" id="ct-add">${E(Lang.t("إضافة"))}</button></div>${errorBox("ct-err")}</div>`);
    field("ct-x").onclick = () => { UI.closeModal(); refresh(); };
    document.querySelectorAll("[data-cat]").forEach(b => b.onchange = async () => {
      try { await rpc("admin_biz_save_expense_category", { p_token: tok(), p_id: b.dataset.cat, p_data: { name: b.dataset.name, is_active: b.checked } }); } catch (e) { showError("ct-err", e); }
    });
    field("ct-add").onclick = async () => {
      if (!val("ct-new")) return;
      try { const fresh = await rpc("admin_biz_save_expense_category", { p_token: tok(), p_id: null, p_data: { name: val("ct-new") } }); categoriesModal(fresh, refresh); } catch (e) { showError("ct-err", e); }
    };
  }

  // ── Purchases (2.28): stock bought with its cost, paid or owed ──────────
  const PURCHASE_STATE = { paid: ["مدفوعة", "ok"], partially_paid: ["مدفوعة جزئياً", "warn"], outstanding: ["غير مدفوعة", "warn"], voided: ["ملغاة", "muted"] };
  const OUT_PAY = { cash: "نقداً", bank_transfer: "تحويل بنكي", card: "بطاقة", other: "أخرى" };
  async function purchasesPanel(host, f, t, opts = {}) {
    let status = opts.status || "", page = 0; const PAGE = 10;
    const load = async () => {
      const r = await rpc("admin_biz_list_purchases", { p_token: tok(), p_from: opts.all ? null : f, p_to: opts.all ? null : t, p_status: status || null, p_product: opts.product || null, p_limit: PAGE + 1, p_offset: page * PAGE });
      const more = r.items.length > PAGE, items = r.items.slice(0, PAGE);
      host.innerHTML = `${opts.compact ? "" : `<div class="biz-actions-row"><select class="select" id="pu-status" style="max-width:220px"><option value="">${E(Lang.t("كل المشتريات"))}</option><option value="owed" ${status === "owed" ? "selected" : ""}>${E(Lang.t("عليها مبلغ للمورد"))}</option></select>
          <span class="biz-total-inline">${E(Lang.t("مستحق للموردين"))}: <b>${E(money(r.owed.amount))}</b></span></div>`}
        ${items.length ? `<div class="biz-rows">${items.map(x => `<div class="biz-row ${x.status === "voided" ? "muted" : ""}"><div class="biz-row-time"><b>${E(day(x.purchase_date))}</b></div>
          <div class="biz-row-main"><b data-i18n-skip>${E(x.product_label)}</b><small>${E(pick(`${num(x.quantity)} × ${money(x.unit_cost)}`, `${num(x.quantity)} × ${money(x.unit_cost)}`, `${num(x.quantity)} × ${money(x.unit_cost)}`))}${x.supplier ? ` · <span data-i18n-skip>${E(x.supplier)}</span>` : ""}</small>
            <div class="biz-row-tags">${pill(PURCHASE_STATE, x.status)}${x.status !== "voided" && Number(x.total_cost) > Number(x.paid_amount) ? ` <span class="badge warn">${E(Lang.t("متبقٍ"))} ${E(money(Number(x.total_cost) - Number(x.paid_amount)))}</span>` : ""}</div></div>
          <div class="biz-row-side"><strong>${E(money(x.total_cost))}</strong>${["outstanding", "partially_paid"].includes(x.status) ? `<button class="btn line sm" data-pu-pay="${E(x.id)}">${E(Lang.t("دفع"))}</button>` : ""}${x.status === "outstanding" ? `<button class="iconbtn" data-pu-void="${E(x.id)}" aria-label="${E(Lang.t("إلغاء"))}">${UI.icon("trash", 15)}</button>` : ""}</div></div>`).join("")}</div>`
          : UI.empty(Lang.t("لا توجد مشتريات"), Lang.t("سجّل التوريد من المخزون مع الكمية وسعر التكلفة."))}${UI.pager(page, more)}`;
      UI.wirePager(async () => { if (page > 0) { page--; await load(); } }, async () => { if (more) { page++; await load(); } }, host);
      const st = host.querySelector("#pu-status"); if (st) st.onchange = async () => { status = st.value; page = 0; await load(); };
      host.querySelectorAll("[data-pu-pay]").forEach(b => b.onclick = () => payPurchaseModal(items.find(x => x.id === b.dataset.puPay), load));
      host.querySelectorAll("[data-pu-void]").forEach(b => b.onclick = () => reasonModal(Lang.t("إلغاء المشتريات"), Lang.t("تُسحب الكمية من المخزون بقدر ما هو متوفر، وتبقى المشتريات في السجل كملغاة."),
        async reason => { await rpc("admin_biz_void_purchase", { p_token: tok(), p_id: b.dataset.puVoid, p_reason: reason }); UI.toast("تم الإلغاء", "ok"); ctxAt = 0; await load(); }));
    };
    await load();
  }
  function payPurchaseModal(x, after) {
    const key = requestKey(), left = Math.round((Number(x.total_cost) - Number(x.paid_amount)) * 100) / 100;
    UI.modal(`<div class="mhead"><h3>${E(Lang.t("دفع للمورد"))}</h3><button class="iconbtn" id="pp-x" aria-label="${E(Lang.t("إغلاق"))}">${UI.icon("x", 20)}</button></div>
      <form class="mform" id="pp-form"><p class="muted"><span data-i18n-skip>${E(x.product_label)}</span> · ${E(Lang.t("المتبقي"))}: <b>${E(money(left))}</b></p>
        <div class="control-form"><label>${E(Lang.t("المبلغ"))}${moneyIn("pp-amount", left, "required")}</label>
          <label>${E(Lang.t("طريقة الدفع"))}<select class="select" id="pp-method">${Object.keys(OUT_PAY).map(m => `<option value="${m}">${E(Lang.t(OUT_PAY[m]))}</option>`).join("")}</select></label>
          <label>${E(Lang.t("التاريخ"))}<input class="input" type="date" id="pp-date" value="${E(iso(new Date()))}"></label></div>
        <button class="btn" type="submit" id="pp-go">${E(Lang.t("تسجيل الدفعة"))}</button>${errorBox("pp-err")}</form>`);
    field("pp-x").onclick = UI.closeModal;
    field("pp-form").onsubmit = async e => {
      e.preventDefault(); UI.busy("pp-go", true);
      try { await rpc("admin_biz_pay_purchase", { p_token: tok(), p_id: x.id, p_data: { amount: Number(val("pp-amount")), method: val("pp-method"), paid_on: val("pp-date") }, p_request_key: key }); UI.closeModal(); UI.toast("تم تسجيل الدفعة", "ok"); await after(); }
      catch (err) { showError("pp-err", err); UI.busy("pp-go", false); }
    };
  }
  // Buying stock: quantity and cost per unit are required; the total is computed.
  function purchaseForm(p) {
    return `<form id="pm-buy" class="control-form wf-buy"><div class="sec-label full">${E(Lang.t("شراء / توريد"))}</div>
      <label>${E(Lang.t("الكمية المشتراة"))}<input class="input" type="number" min="1" step="1" id="pb-qty" required dir="ltr"></label>
      <label>${E(Lang.t("سعر التكلفة للوحدة"))}${moneyIn("pb-unit", p.cost ?? "", "required")}</label>
      <p class="tiny full" id="pb-total"></p>
      <label>${E(Lang.t("الدفع للمورد"))}<select class="select" id="pb-paid"><option value="paid">${E(Lang.t("مدفوعة بالكامل"))}</option><option value="owed">${E(Lang.t("غير مدفوعة (مستحقة للمورد)"))}</option><option value="part">${E(Lang.t("مدفوعة جزئياً"))}</option></select></label>
      <label id="pb-part-box" hidden>${E(Lang.t("المبلغ المدفوع"))}${moneyIn("pb-part", "")}</label>
      <label>${E(Lang.t("طريقة الدفع"))}<select class="select" id="pb-method">${Object.keys(OUT_PAY).map(m => `<option value="${m}">${E(Lang.t(OUT_PAY[m]))}</option>`).join("")}</select></label>
      <label>${E(Lang.t("التاريخ"))}<input class="input" type="date" id="pb-date" value="${E(iso(new Date()))}"></label>
      <label class="full">${E(Lang.t("المورد (اختياري)"))}<input class="input" id="pb-supplier" maxlength="120"></label>
      <button class="btn full" type="submit" id="pb-go">${E(Lang.t("تسجيل الشراء"))}</button></form>`;
  }
  function wirePurchaseForm(p, after) {
    const form = field("pm-buy"); if (!form) return;
    const key = requestKey();
    const total = () => { const q = Number(val("pb-qty")), u = Number(val("pb-unit")); field("pb-total").textContent = q > 0 && u >= 0 && val("pb-unit") !== "" ? `${Lang.t("الإجمالي")}: ${money(Math.round(q * u * 100) / 100)}` : ""; };
    field("pb-qty").oninput = field("pb-unit").oninput = total;
    field("pb-paid").onchange = () => { field("pb-part-box").hidden = val("pb-paid") !== "part"; };
    form.onsubmit = async e => {
      e.preventDefault(); UI.busy("pb-go", true);
      const mode = val("pb-paid");
      const data = { quantity: Number(val("pb-qty")), unit_cost: val("pb-unit"), purchase_date: val("pb-date"), supplier: val("pb-supplier"), method: val("pb-method"),
        paid: mode === "paid", paid_amount: mode === "part" ? Number(val("pb-part")) || 0 : 0 };
      try { await rpc("admin_biz_record_purchase", { p_token: tok(), p_product: p.id, p_data: data, p_request_key: key }); UI.closeModal(); UI.toast("تم تسجيل الشراء وإضافته للمخزون", "ok"); ctxAt = 0; await after(); }
      catch (err) { showError("pm-err", err); UI.busy("pb-go", false); }
    };
  }

  // Exports: every row of the period, page by page, as CSV, Excel or PDF.
  const EXPORTS = {
    receipts: ["الفواتير", ["receipt_no", "business_date", "customer_label", "barber_label", "services_total", "products_total", "packages_total", "coupon_code", "coupon_discount", "manual_discount", "total", "deposit_applied", "paid_total", "refunded_total", "outstanding", "status"]],
    lines: ["بنود الفواتير", ["receipt_no", "business_date", "line_no", "item_type", "label", "barber_label", "quantity", "unit_price", "gross", "discount", "covered", "covered_amount", "net", "unit_cost", "refunded_qty"]],
    payments: ["الدفعات", ["business_date", "created_at", "purpose", "receipt_no", "method", "amount", "refunded_amount", "status", "reference", "received_by_label"]],
    refunds: ["الاسترجاعات", ["business_date", "created_at", "receipt_no", "source", "kind", "method", "amount", "reason", "restocked", "created_by_label"]],
    expenses: ["المصاريف", ["expense_date", "category_label", "description", "method", "amount", "status", "created_by", "created_at"]],
    deposits: ["العربون", ["created_at", "customer_label", "service_label", "barber_label", "booking_date", "booking_time", "amount", "status", "paid_amount", "applied_amount", "refunded_amount", "forfeited_amount", "refund_due", "method", "policy_outcome"]],
    commissions: ["العمولات", ["business_date", "created_at", "barber_label", "receipt_no", "label", "entry", "kind", "rate", "base_amount", "amount"]],
    purchases: ["المشتريات", ["purchase_date", "created_at", "product_label", "quantity", "unit_cost", "total_cost", "paid_amount", "owed", "status", "supplier", "note", "created_by"]],
    staff_payments: ["دفعات الموظفين", ["paid_on", "created_at", "employee", "direction", "amount", "method", "period_from", "period_to", "note", "status", "created_by"]],
  };
  function exportModal([f, t]) {
    UI.modal(`<div class="mhead"><h3>${E(Lang.t("تصدير البيانات المالية"))}</h3><button class="iconbtn" id="xp-x" aria-label="إغلاق">${UI.icon("x", 20)}</button></div>
      <form class="mform" id="xp-form"><p class="muted">${E(day(f))} – ${E(day(t))}</p>
        <fieldset class="loy-fieldset"><legend>${E(Lang.t("البيانات"))}</legend>${Object.entries(EXPORTS).map(([k, [l]]) => `<label class="checkrow"><input type="checkbox" data-xp="${k}" ${["receipts", "payments", "expenses"].includes(k) ? "checked" : ""}> ${E(Lang.t(l))}</label>`).join("")}</fieldset>
        <div class="biz-xp-formats"><button class="btn" type="button" data-format="xlsx">${UI.icon("grid", 16)} Excel</button><button class="btn line" type="button" data-format="csv">${UI.icon("list", 16)} CSV</button><button class="btn line" type="button" data-format="pdf">${UI.icon("list", 16)} PDF</button></div>
        <p class="tiny">${E(Lang.t("CSV يصدّر أول مجموعة محددة. Excel يضع كل مجموعة في ورقة. PDF ملخص قابل للطباعة. للاستخدام الداخلي أو المحاسب."))}</p>${errorBox("xp-err")}</form>`);
    field("xp-x").onclick = UI.closeModal;
    document.querySelectorAll("[data-format]").forEach(b => b.onclick = async () => {
      const kinds = [...document.querySelectorAll("[data-xp]:checked")].map(x => x.dataset.xp);
      if (!kinds.length && b.dataset.format !== "pdf") { showError("xp-err", new Error(Lang.t("اختر البيانات المطلوبة"))); return; }
      b.disabled = true;
      try { await runExport(b.dataset.format, kinds, f, t); UI.closeModal(); }
      catch (e) { showError("xp-err", e); } finally { b.disabled = false; }
    });
  }
  async function exportRows(kind, f, t) {
    const out = [];
    for (let page = 0; page < 40; page++) {
      const r = await rpc("admin_biz_list_finance_rows", { p_token: tok(), p_kind: kind, p_from: f, p_to: t, p_limit: 500, p_offset: page * 500 });
      out.push(...r.rows); if (!r.has_more) break;
    }
    return out;
  }
  async function runExport(format, kinds, f, t) {
    const name = `salonieer-${salonSlug()}-${f}_${t}`;
    if (format === "pdf") {
      const r = await rpc("admin_biz_report_finance", { p_token: tok(), p_from: f, p_to: t });
      const salon = Control.target()?.name || App.settings?.app_name || "METON";
      const line = (l, v) => `<tr><td>${E(Lang.t(l))}</td><td><b>${E(v)}</b></td></tr>`;
      const cur = r.current;
      Exporter.print(Lang.t("التقرير المالي") + " — " + salon, `<h1>${E(salon)} · ${E(Lang.t("التقرير المالي"))}</h1><p>${E(day(f))} – ${E(day(t))}</p>
        <table>${line("الإيراد", money(cur.revenue))}${line("الخدمات", money(cur.services))}${line("المنتجات", money(cur.products))}${line("مبيعات الباقات", money(cur.packages))}
        ${line("الخصومات", money(Number(cur.coupon_discounts) + Number(cur.manual_discounts)))}${line("المسترجع", money(cur.refunds))}${line("عربون مُحتجز كإيراد", money(cur.deposits_forfeited))}
        ${line("المصاريف", money(cur.expenses))}${line("العمولات التقديرية", money(cur.commissions))}${line("تكلفة المنتجات المباعة", money(cur.product_cost))}
        ${Number(cur.staff_costs) ? line("تكلفة الفريق", money(cur.staff_costs)) : ""}${Number(cur.chair_rent) ? line("إيجار الكراسي", money(cur.chair_rent)) : ""}${Number(cur.purchases) ? line("مشتريات المخزون", money(cur.purchases)) : ""}
        ${line("الصافي التقديري", money(cur.estimated_net))}${cur.cash_flow ? line("التدفق النقدي", money(cur.cash_flow.net)) : ""}
        ${line("عدد الفواتير", num(cur.checkouts))}${line("متوسط إنفاق العميل", money(cur.average_spend))}${line("مبالغ مستحقة على فواتير", money(r.outstanding_now.amount))}</table>
        <h2>${E(Lang.t("حسب طريقة الدفع"))}</h2><table>${r.by_method.map(m => line(PAY[m.method] || m.method, money(m.received))).join("")}</table>
        <h2>${E(Lang.t("حسب الموظف"))}</h2><table>${r.by_barber.map(b => `<tr><td>${E(b.name)}</td><td>${E(money(b.revenue))}</td><td>${E(money(b.commissions))}</td></tr>`).join("")}</table>
        <h2>${E(Lang.t("المصاريف حسب التصنيف"))}</h2><table>${r.expenses_by_category.map(x => `<tr><td>${E(catName(x.name))}</td><td>${E(money(x.amount))}</td></tr>`).join("")}</table>
        <p class="note">${E(Lang.t("«الصافي التقديري» = الإيراد − المسترجع + العربون المحتجز − المصاريف − العمولات − تكلفة المنتجات المباعة − تكلفة الفريق + إيجار الكراسي. المشتريات تظهر في التدفق النقدي ولا تُخصم مرتين. للأغراض الداخلية وليس بديلاً عن المحاسب."))}</p>`);
      return;
    }
    const sheets = [];
    for (const k of kinds) sheets.push({ name: Lang.t(EXPORTS[k][0]), columns: EXPORTS[k][1], rows: (await exportRows(k, f, t)).map(r => k === "expenses" ? { ...r, category_label: catName(r.category_label) } : r) });
    if (format === "csv") return Exporter.save(`${name}-${kinds[0]}.csv`, "text/csv;charset=utf-8", Exporter.csv(sheets[0].columns, sheets[0].rows));
    return Exporter.save(`${name}.xlsx`, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", Exporter.xlsx(sheets));
  }

  // ── Deposits and the cancellation / no-show policy ─────────────────────
  async function depositsPage(body, c, s, opts = {}) {
    let filter = "attention", page = 0, rows = [], next = false; const PAGE = 10;
    const tabs = [{ v: "attention", l: Lang.t("تحتاج إجراء") }, { v: "all", l: Lang.t("الكل") }];
    if (c.actor.admin && !opts.embedded) tabs.push({ v: "policy", l: Lang.t("السياسة") });
    body.innerHTML = `${opts.embedded ? "" : sectionHead(s)}${UI.seg("dp-tabs", tabs, filter)}<div id="dp-body">${UI.loading()}</div>`;
    UI.wireSeg("dp-tabs", v => { filter = v; page = 0; paint(); });
    const load = async () => { const r = await rpc("admin_biz_list_deposits", { p_token: tok(), p_status: filter === "all" ? null : filter, p_limit: PAGE, p_offset: page * PAGE }); rows = r.items; next = rows.length === PAGE; };
    const paint = async () => {
      const host = field("dp-body"); if (!host) return;
      if (filter === "policy") return policyPanel(host);
      host.innerHTML = UI.loading();
      try { await load(); } catch (e) { host.innerHTML = `<div class="card">${E(e.message)}</div>`; return; }
      host.innerHTML = (rows.length ? `<div class="biz-rows">${rows.map(d => `<button class="biz-row clickable" data-dep="${E(d.id)}"><div class="biz-row-time"><b>${E(d.booking_date ? Lang.date(d.booking_date, { day: "numeric", month: "short" }) : "—")}</b><small>${E(d.booking_time ? UI.timeAr(d.booking_time) : "")}</small></div>
          <div class="biz-row-main"><b data-i18n-skip>${E(d.customer_label || "—")}</b><small><span data-i18n-skip>${E(d.service_label)}</span> · <span data-i18n-skip>${E(d.barber_label)}</span></small>
            <div class="biz-row-tags">${pill(DEPOSIT_STATE, d.status)}${d.status === "pending" ? ` <span class="badge warn">${E(Lang.t("المهلة"))} ${E(stamp(d.due_at))}</span>` : ""}${Number(d.refund_due) > 0 ? ` <span class="badge danger">${E(Lang.t("يجب إرجاع"))} ${E(money(d.refund_due))}</span>` : ""}</div></div>
          <div class="biz-row-side"><strong>${E(money(d.amount))}</strong>${UI.icon("chev", 16)}</div></button>`).join("")}</div>`
        : UI.empty(filter === "attention" ? Lang.t("لا يوجد عربون يحتاج إجراء") : Lang.t("لا يوجد عربون بعد"), "")) + UI.pager(page, next);
      UI.wirePager(async () => { if (page > 0) { page--; await paint(); } }, async () => { if (next) { page++; await paint(); } });
      host.querySelectorAll("[data-dep]").forEach(b => b.onclick = () => depositModal(rows.find(x => x.id === b.dataset.dep), c, paint));
    };
    await paint();
  }
  function depositModal(d, c, refresh) {
    const admin = c.actor.admin, canRecord = can(c, "deposits");
    const held = Number(d.paid_amount) - Number(d.applied_amount) - Number(d.refunded_amount) - Number(d.forfeited_amount);
    UI.modal(`<div class="mhead"><h3>${E(Lang.t("العربون"))}</h3><button class="iconbtn" id="dm-x" aria-label="إغلاق">${UI.icon("x", 20)}</button></div>
      <div class="mform"><div class="card" style="box-shadow:none;border:1.5px solid var(--line)"><div class="row between"><b data-i18n-skip>${E(d.customer_label)}</b>${pill(DEPOSIT_STATE, d.status)}</div>
        <div class="muted"><span data-i18n-skip>${E(d.service_label)}</span> · <span data-i18n-skip>${E(d.barber_label)}</span> · ${E(day(d.booking_date))} ${E(d.booking_time ? UI.timeAr(d.booking_time) : "")}</div>
        <ul class="biz-mini"><li><span>${E(Lang.t("المبلغ"))}</span><b>${E(money(d.amount))}</b></li>${Number(d.paid_amount) ? `<li><span>${E(Lang.t("المدفوع"))}</span><b>${E(money(d.paid_amount))}</b><small>${E(Lang.t(PAY[d.method] || d.method || ""))}</small></li>` : ""}
          ${Number(d.applied_amount) ? `<li><span>${E(Lang.t("خُصم من الفاتورة"))}</span><b>${E(money(d.applied_amount))}</b></li>` : ""}${Number(d.refunded_amount) ? `<li><span>${E(Lang.t("المسترجع"))}</span><b>${E(money(d.refunded_amount))}</b></li>` : ""}
          ${Number(d.forfeited_amount) ? `<li><span>${E(Lang.t("محتجز حسب السياسة"))}</span><b>${E(money(d.forfeited_amount))}</b></li>` : ""}${Number(d.refund_due) ? `<li><span>${E(Lang.t("يجب إرجاعه"))}</span><b>${E(money(d.refund_due))}</b></li>` : ""}
          ${d.status === "pending" ? `<li><span>${E(Lang.t("مهلة الدفع"))}</span><b>${E(stamp(d.due_at))}</b></li>` : ""}${d.verified_by ? `<li><span>${E(Lang.t("تحقق منه"))}</span><b data-i18n-skip>${E(d.verified_by)}</b><small>${E(stamp(d.verified_at))}</small></li>` : ""}</ul>
        ${d.policy_note ? `<p class="tiny" data-i18n-skip>${E(d.policy_note)}</p>` : ""}</div>
        ${canRecord && ["pending", "expired"].includes(d.status) ? `<div class="control-form"><label>${E(Lang.t("طريقة الدفع"))}<select class="select" id="dm-method">${["cash", "card"].map(m => `<option value="${m}">${E(Lang.t(PAY[m]))}</option>`).join("")}</select></label>
          <label>${E(Lang.t("مرجع (اختياري)"))}<input class="input" id="dm-ref" maxlength="120"></label></div><button class="btn" id="dm-record">${UI.icon("check", 16)} ${E(Lang.t("تسجيل دفع العربون"))}</button>` : ""}
        ${admin && held > 0 && !["applied"].includes(d.status) ? `<button class="btn line" id="dm-refund">${UI.icon("refresh", 16)} ${E(Lang.t("استرجاع العربون"))}</button>` : ""}
        ${admin && ["pending", "expired"].includes(d.status) ? `<div class="btn-row"><button class="btn line" id="dm-extend">${E(Lang.t("تمديد المهلة"))}</button><button class="btn line" id="dm-waive">${E(Lang.t("إعفاء"))}</button></div>` : ""}
        ${admin && Number(d.refund_due) > 0 ? `<button class="btn line" id="dm-forfeit">${E(Lang.t("احتجاز بدل الإرجاع"))}</button>` : ""}
        ${admin && Number(d.forfeited_amount) > 0 ? `<button class="btn line" id="dm-torefund">${E(Lang.t("تحويل المحتجز إلى مبلغ يُرجع"))}</button>` : ""}
        ${errorBox("dm-err")}</div>`);
    field("dm-x").onclick = UI.closeModal;
    const key = requestKey();
    const after = async msg => { UI.closeModal(); UI.toast(msg, "ok"); ctxAt = 0; await refresh(); };
    const rec = field("dm-record");
    if (rec) rec.onclick = async () => { UI.busy("dm-record", true); try { await rpc("biz_record_deposit", { p_token: tok(), p_id: d.id, p_data: { method: val("dm-method"), reference: val("dm-ref") }, p_request_key: key }); await after("تم تسجيل العربون وتثبيت الموعد"); } catch (e) { showError("dm-err", e); UI.busy("dm-record", false); } };
    const ref = field("dm-refund");
    if (ref) ref.onclick = () => {
      const rkey = requestKey(), max = Number(d.refund_due) > 0 ? d.refund_due : held;
      UI.modal(`<div class="mhead"><h3>${E(Lang.t("استرجاع العربون"))}</h3><button class="iconbtn" id="dr-x" aria-label="إغلاق">${UI.icon("x", 20)}</button></div>
        <form class="mform" id="dr-form"><div class="control-form"><label>${E(Lang.t("المبلغ"))}${moneyIn("dr-amount", max)}</label>
        <label>${E(Lang.t("طريقة الاسترجاع"))}<select class="select" id="dr-method">${["cash", "card"].map(m => `<option value="${m}">${E(Lang.t(PAY[m]))}</option>`).join("")}</select></label>
        <label class="full">${E(Lang.t("السبب"))}<input class="input" id="dr-reason" maxlength="300" required></label></div>
        <button class="btn" type="submit" id="dr-go">${E(Lang.t("تأكيد الاسترجاع"))}</button>${errorBox("dr-err")}</form>`);
      field("dr-x").onclick = UI.closeModal;
      field("dr-form").onsubmit = async e => { e.preventDefault(); UI.busy("dr-go", true);
        try { await rpc("admin_biz_refund_deposit", { p_token: tok(), p_id: d.id, p_data: { amount: Number(val("dr-amount")), method: val("dr-method"), reason: val("dr-reason") }, p_request_key: rkey }); await after("تم استرجاع العربون"); }
        catch (err) { showError("dr-err", err); UI.busy("dr-go", false); } };
    };
    const override = (id, action, title, extra) => { const b = field(id); if (b) b.onclick = () => reasonModal(title, "", async reason => { await rpc("admin_biz_deposit_override", { p_token: tok(), p_id: d.id, p_action: action, p_reason: reason, p_data: extra || {} }); UI.toast("تم الحفظ", "ok"); ctxAt = 0; await refresh(); }, false); };
    override("dm-extend", "extend", Lang.t("تمديد المهلة ساعة"), { minutes: 60 });
    override("dm-waive", "waive", Lang.t("إعفاء من العربون"));
    override("dm-forfeit", "forfeit", Lang.t("احتجاز بدل الإرجاع"));
    override("dm-torefund", "refund_due", Lang.t("تحويل المحتجز إلى مبلغ يُرجع"));
  }
  async function policyPanel(host) {
    const r = await rpc("admin_biz_get_settings", { p_token: tok() });
    const s = r.settings;
    const sel = (id, opts, cur) => `<select class="select" id="${id}">${opts.map(([v, l]) => `<option value="${v}" ${v === cur ? "selected" : ""}>${E(Lang.t(l))}</option>`).join("")}</select>`;
    host.innerHTML = `<form class="card loy-form" id="pol-form"><h3>${E(Lang.t("سياسة العربون والإلغاء"))}</h3>
      <div class="control-form"><label>${E(Lang.t("العربون"))}${sel("pol-mode", [["off", "بدون عربون"], ["fixed", "مبلغ ثابت"], ["percent", "نسبة من سعر الخدمة"]], s.deposit_mode)}</label>
        <label>${E(Lang.t("القيمة"))}${moneyIn("pol-value", s.deposit_value)}</label>
        <label>${E(Lang.t("مهلة الدفع بالدقائق"))}<input class="input" type="number" min="10" max="10080" step="5" id="pol-due" value="${s.deposit_due_minutes}"></label>
        <label>${E(Lang.t("الإلغاء المجاني قبل الموعد بساعات"))}<input class="input" type="number" min="0" max="720" step="1" id="pol-free" value="${s.free_cancel_hours}"></label>
        <label>${E(Lang.t("الإلغاء المتأخر"))}${sel("pol-late", [["forfeit", "يُحتجز العربون"], ["refund", "يُرجع العربون"]], s.late_cancel_action)}</label>
        <label>${E(Lang.t("عدم الحضور"))}${sel("pol-noshow", [["forfeit", "يُحتجز العربون"], ["refund", "يُرجع العربون"]], s.no_show_action)}</label>
        <label class="full">${E(Lang.t("تعليمات الدفع للعميل (تظهر في الإشعار وصفحة الحجز)"))}<input class="input" id="pol-instr" maxlength="300" value="${E(s.deposit_instructions)}"></label></div>
      <label class="notification-toggle"><span>${E(Lang.t("إلغاء الحجز تلقائياً عند انتهاء المهلة دون دفع"))}</span><input type="checkbox" id="pol-cancel" ${s.deposit_auto_cancel ? "checked" : ""}></label>
      <label class="notification-toggle"><span>${E(Lang.t("تأكيد الحجز تلقائياً بعد دفع العربون"))}</span><input type="checkbox" id="pol-confirm" ${s.deposit_auto_confirm ? "checked" : ""}></label>
      <p class="tiny">${E(Lang.t("الدفع يُعتمد فقط عند تسجيله من العمل أو من مزود الدفع بعد التحقق، وليس بمجرد ادعاء العميل. العربون يُخصم تلقائياً عند إتمام الدفع."))}</p>
      <button class="btn" type="submit" id="pol-save">${E(Lang.t("حفظ السياسة"))}</button>${errorBox("pol-err")}</form>
      <section class="card"><h3>${E(Lang.t("قواعد خاصة لكل خدمة"))}</h3><p class="tiny">${E(Lang.t("«حسب السياسة» يستخدم الإعداد العام أعلاه."))}</p>
      <div class="biz-rows">${r.service_deposits.map(x => `<div class="biz-row" data-svc-dep="${E(x.service_id)}"><div class="biz-row-main"><b data-i18n-skip>${E(x.name)}</b><small>${E(money(x.price))}</small></div>
        <div class="biz-row-side biz-inline">${sel("sd-mode-" + x.service_id, [["inherit", "حسب السياسة"], ["none", "بدون عربون"], ["fixed", "مبلغ ثابت"], ["percent", "نسبة"]], x.mode)}
        <input class="input" type="number" min="0" step="0.01" dir="ltr" id="sd-val-${E(x.service_id)}" value="${x.value ?? ""}" style="max-width:100px" aria-label="${E(Lang.t("القيمة"))}"><button class="btn line sm" data-sd-save="${E(x.service_id)}">${E(Lang.t("حفظ"))}</button></div></div>`).join("")}</div>${errorBox("sd-err")}</section>`;
    field("pol-form").onsubmit = async e => {
      e.preventDefault(); UI.busy("pol-save", true);
      try { await rpc("admin_biz_save_settings", { p_token: tok(), p_data: { deposit_mode: val("pol-mode"), deposit_value: val("pol-value") || 0, deposit_due_minutes: val("pol-due"), free_cancel_hours: val("pol-free"),
          late_cancel_action: val("pol-late"), no_show_action: val("pol-noshow"), deposit_instructions: val("pol-instr"), deposit_auto_cancel: field("pol-cancel").checked, deposit_auto_confirm: field("pol-confirm").checked } });
        UI.toast("تم حفظ السياسة", "ok"); UI.busy("pol-save", false); ctxAt = 0; }
      catch (err) { showError("pol-err", err); UI.busy("pol-save", false); }
    };
    host.querySelectorAll("[data-sd-save]").forEach(b => b.onclick = async () => {
      const id = b.dataset.sdSave;
      try { await rpc("admin_biz_save_service_deposit", { p_token: tok(), p_service: id, p_mode: val("sd-mode-" + id), p_value: Number(val("sd-val-" + id)) || null }); UI.toast("تم الحفظ", "ok"); }
      catch (e) { showError("sd-err", e); }
    });
  }

  // ── Inventory ──────────────────────────────────────────────────────────
  async function inventoryPage(body, c, s, opts = {}) {
    let filter = "all", q = "";
    body.innerHTML = `${opts.embedded ? `<div class="biz-actions-row"><button class="btn line sm" id="inv-scan">${UI.icon("qr", 15)} ${E(Lang.t("مسح باركود"))}</button></div>` : sectionHead(s, `<button class="btn line sm" id="inv-scan">${UI.icon("qr", 15)} ${E(Lang.t("مسح باركود"))}</button>${c.actor.admin ? `<button class="btn line sm" id="inv-buys">${UI.icon("list", 15)} ${E(Lang.t("المشتريات"))}</button><button class="btn line sm" id="inv-settings">${UI.icon("cog", 15)} ${E(Lang.t("الإعدادات"))}</button>` : ""}`)}
      <div class="card biz-toolbar"><input class="input" id="inv-q" placeholder="${E(Lang.t("ابحث عن منتج"))}"><div id="inv-filter"></div></div><div id="inv-body">${UI.loading()}</div>`;
    const paint = async () => {
      const host = field("inv-body"); if (!host) return;
      let r; try { r = await rpc("admin_biz_list_inventory", { p_token: tok(), p_filter: filter, p_search: q || null, p_limit: 200, p_offset: 0 }); } catch (e) { host.innerHTML = `<div class="card">${E(e.message)}</div>`; return; }
      field("inv-filter").innerHTML = UI.seg("inv-seg", [{ v: "all", l: `${Lang.t("الكل")} (${num(r.counts.all)})` }, { v: "low", l: `${Lang.t("منخفض")} (${num(r.counts.low)})` }, { v: "out", l: `${Lang.t("نفد")} (${num(r.counts.out)})` }, { v: "in", l: Lang.t("متوفر") }], filter);
      UI.wireSeg("inv-seg", v => { filter = v; paint(); });
      host.innerHTML = `${r.stock_value != null ? `<p class="tiny biz-period">${E(Lang.t("قيمة المخزون بسعر التكلفة"))}: <b>${E(money(r.stock_value))}</b></p>` : ""}
        ${r.items.length ? `<div class="biz-rows">${r.items.map(p => `<button class="biz-row clickable" data-prod="${E(p.id)}"><div class="biz-row-time"><b dir="ltr">${num(p.stock)}</b><small>${E(Lang.t("بالمخزون"))}</small></div>
          <div class="biz-row-main"><b data-i18n-skip>${E(p.name)}</b><small>${E(money(p.price))}${p.cost != null ? ` · ${E(Lang.t("التكلفة"))} ${E(money(p.cost))}` : ""} · ${E(Lang.t("حد التنبيه"))} ${num(p.threshold)}</small>
          <div class="biz-row-tags">${pill(STOCK_STATE, p.state)}${p.status === "hidden" ? ` ${UI.badge("hidden")}` : ""}</div></div><div class="biz-row-side">${UI.icon("chev", 16)}</div></button>`).join("")}</div>`
          : UI.empty(Lang.t("لا توجد منتجات"), Lang.t("أضف المنتجات من تبويب المنتجات."))}`;
      host.querySelectorAll("[data-prod]").forEach(b => b.onclick = () => productModal(r.items.find(x => x.id === b.dataset.prod), c, paint));
    };
    let timer; field("inv-q").oninput = e => { clearTimeout(timer); timer = setTimeout(() => { q = e.target.value.trim(); paint(); }, 300); };
    const st = field("inv-settings"); if (st) st.onclick = () => inventorySettings(c);
    const buys = field("inv-buys");
    if (buys) buys.onclick = () => { UI.modal(`<div class="mhead"><h3>${E(Lang.t("المشتريات"))}</h3><button class="iconbtn" id="ib-x" aria-label="${E(Lang.t("إغلاق"))}">${UI.icon("x", 20)}</button></div><div class="mform" id="ib-body">${UI.loading()}</div>`); field("ib-x").onclick = UI.closeModal; purchasesPanel(field("ib-body"), null, null, { all: true }); };
    // A scanned code finds the product it is assigned to in this salon.
    field("inv-scan").onclick = async () => {
      const code = await Workforce.scanCode(); if (!code) return;
      try {
        const r = await Workforce.lookup(code);
        if (!r.found) { UI.toast(pick(`لا يوجد منتج مسجل بهذا الباركود (${code})`, `No product is registered with this barcode (${code})`, `אין מוצר רשום עם הברקוד הזה (${code})`), "err"); return; }
        const list = await rpc("admin_biz_list_inventory", { p_token: tok(), p_filter: "all", p_search: code, p_limit: 5, p_offset: 0 });
        const item = list.items.find(x => x.id === r.product.id);
        if (item) productModal(item, c, paint); else Workforce.productView({ ...r.product, code }, { staff: true });
      } catch (e) { UI.toast(e.message, "err"); }
    };
    await paint();
  }
  async function productModal(p, c, refresh) {
    const admin = c.actor.admin, key = requestKey();
    UI.modal(`<div class="mhead"><h3 data-i18n-skip>${E(p.name)}</h3><button class="iconbtn" id="pm-x" aria-label="إغلاق">${UI.icon("x", 20)}</button></div>
      <div class="mform"><p class="muted">${E(Lang.t("الكمية الحالية"))}: <b dir="ltr">${num(p.stock)}</b> ${pill(STOCK_STATE, p.state)}</p>
        ${admin ? purchaseForm(p) : `<p class="tiny">${E(Lang.t("شراء كمية جديدة (مع سعر التكلفة) يسجله مدير العمل."))}</p>`}
        <form id="pm-adjust" class="control-form"><div class="sec-label full">${E(Lang.t("جرد أو تعديل"))}</div><label>${E(Lang.t("الحركة"))}<select class="select" id="pm-kind"><option value="count">${E(Lang.t("جرد (الكمية الفعلية)"))}</option><option value="adjust">${E(Lang.t("تعديل (+/−)"))}</option></select></label>
          <label>${E(Lang.t("الكمية"))}<input class="input" type="number" step="1" id="pm-qty" required dir="ltr"></label>
          <label class="full">${E(Lang.t("ملاحظة / السبب"))}<input class="input" id="pm-note" maxlength="300"></label>
          <button class="btn full" type="submit" id="pm-go">${E(Lang.t("تسجيل الحركة"))}</button></form>
        ${admin ? `<form id="pm-use" class="control-form"><div class="sec-label full">${E(Lang.t("استهلاك داخلي"))}</div>
          <label>${E(Lang.t("الكمية التي استخدمها العمل"))}<input class="input" type="number" min="1" step="1" id="pu-qty" dir="ltr" required></label>
          <label>${E(Lang.t("ملاحظة"))}<input class="input" id="pu-note" maxlength="300"></label>
          <p class="tiny full">${E(Lang.t("تُخصم من المخزون وتُسجل تكلفتها مصروفاً تشغيلياً."))}</p>
          <button class="btn line full" type="submit" id="pu-go">${E(Lang.t("تسجيل الاستهلاك"))}</button></form>` : ""}
        <form id="pm-codes" class="control-form wf-codes"><div class="sec-label full">${E(Lang.t("الباركود"))}</div><div class="biz-chips full" id="pc-list"></div>
          <div class="row full" style="gap:8px"><input class="input" id="pc-new" dir="ltr" maxlength="128" placeholder="${E(Lang.t("أي باركود مقروء"))}"><button type="button" class="btn line sm" id="pc-scan">${UI.icon("qr", 15)}</button><button type="button" class="btn line sm" id="pc-add">${E(Lang.t("إضافة"))}</button></div>
          <p class="tiny full">${E(Lang.t("الباركود رقم داخلي لهذا العمل فقط: أي باركود يمكن ربطه بأي منتج، ولا يُبحث عنه خارج العمل."))}</p>
          <button class="btn line full" type="submit" id="pc-save">${E(Lang.t("حفظ الباركود"))}</button></form>
        ${admin ? `<form id="pm-inv" class="control-form"><label>${E(Lang.t("سعر التكلفة (اختياري)"))}${moneyIn("pm-cost", p.cost ?? "")}</label>
          <label>${E(Lang.t("حد التنبيه لهذا المنتج"))}<input class="input" type="number" min="0" step="1" id="pm-threshold" value="${p.own_threshold ?? ""}" placeholder="${E(Lang.t("حسب الإعداد العام"))}"></label>
          <button class="btn line full" type="submit" id="pm-inv-save">${E(Lang.t("حفظ التكلفة والتنبيه"))}</button></form>` : ""}
        ${errorBox("pm-err")}<div class="sec-label">${E(Lang.t("آخر الحركات"))}</div><div id="pm-moves">${UI.loading()}</div>
        ${admin ? `<div class="sec-label">${E(Lang.t("مشتريات هذا المنتج"))}</div><div id="pm-buys"></div>` : ""}</div>`);
    field("pm-x").onclick = UI.closeModal;
    wirePurchaseForm(p, refresh);
    if (admin) purchasesPanel(field("pm-buys"), null, null, { all: true, product: p.id, compact: true }).catch(() => {});
    const use = field("pm-use");
    if (use) use.onsubmit = async e => {
      e.preventDefault(); UI.busy("pu-go", true);
      try { const r = await rpc("admin_biz_consume_stock", { p_token: tok(), p_product: p.id, p_data: { quantity: Number(val("pu-qty")), note: val("pu-note") }, p_request_key: requestKey() }); UI.closeModal(); UI.toast(pick(`سُجّل الاستهلاك (${money(r.expense)})`, `Internal use recorded (${money(r.expense)})`, `השימוש נרשם (${money(r.expense)})`), "ok"); await refresh(); }
      catch (err) { showError("pm-err", err); UI.busy("pu-go", false); }
    };
    const codes = [...(p.barcodes || [])];
    const paintCodes = () => { field("pc-list").innerHTML = codes.map((x, i) => `<span class="chip" dir="ltr">${E(x)} <button type="button" class="iconbtn" data-pc-del="${i}" aria-label="${E(Lang.t("إزالة"))}">${UI.icon("x", 12)}</button></span>`).join("") || `<span class="tiny">${E(Lang.t("لا يوجد باركود لهذا المنتج."))}</span>`;
      document.querySelectorAll("[data-pc-del]").forEach(b => b.onclick = () => { codes.splice(Number(b.dataset.pcDel), 1); paintCodes(); }); };
    const addCode = v => { v = String(v || "").trim(); if (v && !codes.includes(v)) codes.push(v); field("pc-new").value = ""; paintCodes(); };
    paintCodes();
    field("pc-add").onclick = () => addCode(val("pc-new"));
    field("pc-scan").onclick = async () => { const v = await Workforce.scanCode(); if (v) addCode(v); };
    field("pm-codes").onsubmit = async e => {
      e.preventDefault(); if (val("pc-new")) addCode(val("pc-new")); UI.busy("pc-save", true);
      try { await rpc("admin_biz_set_barcodes", { p_token: tok(), p_product: p.id, p_codes: codes }); UI.toast("تم الحفظ", "ok"); UI.busy("pc-save", false); p.barcodes = codes.slice(); }
      catch (err) { showError("pm-err", err); UI.busy("pc-save", false); }
    };
    field("pm-adjust").onsubmit = async e => {
      e.preventDefault(); UI.busy("pm-go", true);
      try { await rpc("admin_biz_adjust_stock", { p_token: tok(), p_product: p.id, p_data: { kind: val("pm-kind"), quantity: Number(val("pm-qty")), note: val("pm-note") }, p_request_key: key }); UI.closeModal(); UI.toast("تم تسجيل الحركة", "ok"); ctxAt = 0; await refresh(); }
      catch (err) { showError("pm-err", err); UI.busy("pm-go", false); }
    };
    const inv = field("pm-inv");
    if (inv) inv.onsubmit = async e => {
      e.preventDefault(); UI.busy("pm-inv-save", true);
      try { await rpc("admin_biz_set_inventory", { p_token: tok(), p_product: p.id, p_data: { cost: val("pm-cost"), low_stock_threshold: val("pm-threshold") } }); UI.closeModal(); UI.toast("تم الحفظ", "ok"); await refresh(); }
      catch (err) { showError("pm-err", err); UI.busy("pm-inv-save", false); }
    };
    const movesPage = async page => {
      try {
        const all = await rpc("admin_biz_list_stock_movements", { p_token: tok(), p_product: p.id, p_limit: 11, p_offset: page * 10 });
        const host = field("pm-moves"); if (!host) return;
        const moves = all.slice(0, 10), more = all.length > 10;
        host.innerHTML = (moves.length ? `<ul class="biz-mini">${moves.map(m => `<li><span>${E(Lang.t(MOVE[m.reason] || m.reason))}${m.receipt_no ? ` · <span dir="ltr">#${E(m.receipt_no)}</span>` : ""}${m.note ? ` · <span data-i18n-skip>${E(m.note)}</span>` : ""}</span><b dir="ltr" class="${m.change > 0 ? "plus" : "minus"}">${m.change > 0 ? "+" : ""}${num(m.change)}</b><small>${E(stamp(m.created_at))}${m.actor_label ? ` · <span data-i18n-skip>${E(m.actor_label)}</span>` : ""}</small></li>`).join("")}</ul>` : `<p class="tiny">${E(Lang.t("لا توجد حركات بعد."))}</p>`) + UI.pager(page, more);
        UI.wirePager(() => { if (page > 0) movesPage(page - 1); }, () => { if (more) movesPage(page + 1); }, host);
      } catch {}
    };
    movesPage(0);
  }
  function inventorySettings(c) {
    const s = c.settings;
    UI.modal(`<div class="mhead"><h3>${E(Lang.t("إعدادات المخزون"))}</h3><button class="iconbtn" id="is-x" aria-label="إغلاق">${UI.icon("x", 20)}</button></div>
      <form class="mform" id="is-form"><label class="notification-toggle"><span>${E(Lang.t("تنبيه المديرين عند انخفاض المخزون"))}</span><input type="checkbox" id="is-on" ${s.low_stock_alerts ? "checked" : ""}></label>
      <div class="field"><label for="is-def">${E(Lang.t("حد التنبيه الافتراضي"))}</label><input class="input" type="number" min="0" max="100000" step="1" id="is-def" value="${s.default_low_stock}"></div>
      <label class="notification-toggle"><span>${E(Lang.t("السماح للعملاء بمسح باركود المنتجات (عرض فقط)"))}</span><input type="checkbox" id="is-scan" ${s.customer_scanner ? "checked" : ""}></label>
      <p class="tiny">${E(Lang.t("يرى العميل اسم المنتج وسعره ووصفه وصورته فقط، ولا يرى التكلفة أو المورد أو المخزون. يعمل عندما يكون عرض المنتجات للعملاء مفعلاً."))}</p>
      <button class="btn" type="submit" id="is-save">${E(Lang.t("حفظ"))}</button>${errorBox("is-err")}</form>`);
    field("is-x").onclick = UI.closeModal;
    field("is-form").onsubmit = async e => { e.preventDefault(); UI.busy("is-save", true);
      try { await rpc("admin_biz_save_settings", { p_token: tok(), p_data: { low_stock_alerts: field("is-on").checked, default_low_stock: val("is-def"), customer_scanner: field("is-scan").checked } }); UI.closeModal(); UI.toast("تم الحفظ", "ok"); ctxAt = 0; }
      catch (err) { showError("is-err", err); UI.busy("is-save", false); } };
  }

  // ── Employee commissions ───────────────────────────────────────────────
  async function commissionsPage(body, c, s) {
    let sub = "summary", period = "month";
    body.innerHTML = `${sectionHead(s)}${UI.seg("cm-tabs", [{ v: "summary", l: Lang.t("الملخص") }, { v: "rules", l: Lang.t("القواعد") }], sub)}<div id="cm-body">${UI.loading()}</div>`;
    UI.wireSeg("cm-tabs", v => { sub = v; paint(); });
    const paint = async () => {
      const host = field("cm-body"); if (!host) return; host.innerHTML = UI.loading();
      try {
        if (sub === "summary") {
          const t = c.today, f = period === "week" ? addDays(t, -6) : period === "today" ? t : t.slice(0, 8) + "01";
          const r = await rpc("admin_biz_report_commissions", { p_token: tok(), p_from: f, p_to: t });
          host.innerHTML = `${UI.seg("cm-period", [{ v: "today", l: Lang.t("اليوم") }, { v: "week", l: Lang.t("الأسبوع") }, { v: "month", l: Lang.t("الشهر") }], period)}
            ${r.employees.length ? `<table class="biz-table"><thead><tr><th>${E(Lang.t("المختص"))}</th><th>${E(Lang.t("الخدمات"))}</th><th>${E(Lang.t("المبيعات"))}</th><th>${E(Lang.t("مكتسبة"))}</th><th>${E(Lang.t("معكوسة"))}</th><th>${E(Lang.t("العمولة التقديرية"))}</th></tr></thead>
              <tbody>${r.employees.map(x => `<tr><td data-i18n-skip>${E(x.name)}</td><td>${num(x.services)}</td><td>${E(money(x.revenue))}</td><td>${E(money(x.earned))}</td><td>${E(money(x.reversed))}</td><td><b>${E(money(x.commission))}</b></td></tr>`).join("")}</tbody></table>`
              : UI.empty(Lang.t("لا توجد عمولات في هذه الفترة"), Lang.t("تُحسب العمولة تلقائياً عند إتمام الدفع حسب القواعد."))}
            <p class="tiny biz-note">${E(Lang.t("العمولة «تقديرية» للمتابعة الداخلية. تُعكس تلقائياً عند الاسترجاع أو إلغاء الفاتورة، ولا تُحسب مرتين لنفس البند."))}</p>`;
          UI.wireSeg("cm-period", v => { period = v; paint(); });
        } else {
          const r = await rpc("admin_biz_list_commission_rules", { p_token: tok() });
          host.innerHTML = `<button class="btn sm" id="cm-new" style="margin-bottom:12px">${UI.icon("plus", 16)} ${E(Lang.t("قاعدة جديدة"))}</button>
            ${r.rules.length ? `<div class="biz-rows">${r.rules.map(x => `<button class="biz-row clickable" data-rule="${E(x.id)}"><div class="biz-row-main"><b>${E(x.barber_name ? "" : Lang.t("كل المختصين"))}<span data-i18n-skip>${E(x.barber_name || "")}</span></b>
                <small>${E(Lang.t(x.applies_to === "product" ? "المنتجات" : x.service_name ? "خدمة محددة" : "كل الخدمات"))}${x.service_name ? ` · <span data-i18n-skip>${E(x.service_name)}</span>` : ""}</small>${x.is_active ? "" : ` <span class="badge muted">${E(Lang.t("متوقفة"))}</span>`}</div>
                <div class="biz-row-side"><strong>${x.kind === "percent" ? pct(x.value) : E(money(x.value))}</strong>${UI.icon("chev", 16)}</div></button>`).join("")}</div>`
              : UI.empty(Lang.t("لا توجد قواعد عمولة"), Lang.t("أضف قاعدة عامة (مثلاً 10% من الخدمات) ثم قواعد خاصة لمختص أو خدمة."))}
            <p class="tiny biz-note">${E(Lang.t("الأولوية للأدق: مختص + خدمة، ثم خدمة، ثم مختص، ثم القاعدة العامة."))}</p>`;
          field("cm-new").onclick = () => ruleModal({}, r, paint);
          host.querySelectorAll("[data-rule]").forEach(b => b.onclick = () => ruleModal(r.rules.find(x => x.id === b.dataset.rule), r, paint));
        }
      } catch (e) { host.innerHTML = `<div class="card">${E(e.message)}</div>`; }
    };
    await paint();
  }
  function ruleModal(x, r, refresh) {
    const opt = (v, l, cur) => `<option value="${E(v)}" ${String(v) === String(cur ?? "") ? "selected" : ""}>${E(l)}</option>`;
    UI.modal(`<div class="mhead"><h3>${E(Lang.t(x.id ? "تعديل قاعدة" : "قاعدة جديدة"))}</h3><button class="iconbtn" id="rl-x" aria-label="إغلاق">${UI.icon("x", 20)}</button></div>
      <form class="mform" id="rl-form"><div class="control-form">
        <label>${E(Lang.t("المختص"))}<select class="select" id="rl-barber">${opt("", Lang.t("كل المختصين"), x.barber_id)}${r.barbers.map(b => opt(b.id, b.name, x.barber_id)).join("")}</select></label>
        <label>${E(Lang.t("تنطبق على"))}<select class="select" id="rl-applies">${opt("service", Lang.t("الخدمات"), x.applies_to)}${opt("product", Lang.t("المنتجات"), x.applies_to)}</select></label>
        <label id="rl-svc-box">${E(Lang.t("الخدمة"))}<select class="select" id="rl-svc">${opt("", Lang.t("كل الخدمات"), x.service_id)}${r.services.map(sv => opt(sv.id, sv.name, x.service_id)).join("")}</select></label>
        <label>${E(Lang.t("طريقة الحساب"))}<select class="select" id="rl-kind">${opt("percent", Lang.t("نسبة مئوية من الصافي"), x.kind)}${opt("fixed", Lang.t("مبلغ ثابت لكل بند"), x.kind)}</select></label>
        <label>${E(Lang.t("القيمة"))}${moneyIn("rl-value", x.value ?? "", "required")}</label></div>
        <label class="notification-toggle"><span>${E(Lang.t("فعّالة"))}</span><input type="checkbox" id="rl-active" ${x.is_active !== false ? "checked" : ""}></label>
        <button class="btn" type="submit" id="rl-save">${E(Lang.t("حفظ"))}</button>${x.id ? `<button class="btn line" type="button" id="rl-del" style="color:var(--danger);border-color:var(--danger)">${E(Lang.t("حذف"))}</button>` : ""}${errorBox("rl-err")}</form>`);
    const sync = () => { field("rl-svc-box").hidden = val("rl-applies") === "product"; };
    field("rl-applies").onchange = sync; sync();
    field("rl-x").onclick = UI.closeModal;
    field("rl-form").onsubmit = async e => { e.preventDefault(); UI.busy("rl-save", true);
      try { await rpc("admin_biz_save_commission_rule", { p_token: tok(), p_id: x.id || null, p_data: { barber_id: val("rl-barber") || null, applies_to: val("rl-applies"), service_id: val("rl-applies") === "service" ? val("rl-svc") || null : null, kind: val("rl-kind"), value: val("rl-value"), is_active: field("rl-active").checked } }); UI.closeModal(); UI.toast("تم الحفظ", "ok"); await refresh(); }
      catch (err) { showError("rl-err", err); UI.busy("rl-save", false); } };
    const del = field("rl-del");
    if (del) del.onclick = () => { UI.closeModal(); UI.confirm(Lang.t("حذف هذه القاعدة؟ العمولات المسجلة سابقاً لا تتغير."), async () => { await rpc("admin_biz_delete_commission_rule", { p_token: tok(), p_id: x.id }); UI.toast("تم الحذف", "ok"); await refresh(); }, true); };
  }

  // ── Coupons ────────────────────────────────────────────────────────────
  async function couponsPage(body, c, s) {
    let status = "all", q = "";
    body.innerHTML = `${sectionHead(s, `<button class="btn sm" id="cp-new">${UI.icon("plus", 16)} ${E(Lang.t("كوبون جديد"))}</button>`)}
      <div class="card biz-toolbar"><input class="input" id="cp-q" placeholder="${E(Lang.t("ابحث بالكود"))}" dir="ltr">${UI.seg("cp-status", [{ v: "all", l: Lang.t("الكل") }, { v: "active", l: Lang.t("نشطة") }, { v: "inactive", l: Lang.t("متوقفة") }, { v: "expired", l: Lang.t("منتهية") }], status)}</div><div id="cp-body">${UI.loading()}</div>`;
    let services = null, products = null;
    const refs = async () => {
      if (!services) { try { services = await rpc("list_services", { p_only_enabled: false }); } catch { services = []; } }
      if (!products) { try { products = (await rpc("admin_biz_list_inventory", { p_token: tok(), p_filter: "all", p_search: null, p_limit: 200, p_offset: 0 })).items; } catch { try { products = await rpc("list_products_v2", { p_only_active: false, p_limit: 200, p_offset: 0 }); } catch { products = []; } } }
    };
    const paint = async () => {
      const host = field("cp-body"); if (!host) return;
      const r = await rpc("admin_biz_list_coupons", { p_token: tok(), p_status: status, p_search: q || null, p_limit: 100, p_offset: 0 });
      host.innerHTML = r.items.length ? `<div class="biz-rows">${r.items.map(x => `<button class="biz-row clickable" data-coupon="${E(x.id)}"><div class="biz-row-time"><b dir="ltr">${E(x.code)}</b><small>${x.kind === "percent" ? pct(x.value) : E(money(x.value))}</small></div>
          <div class="biz-row-main"><b data-i18n-skip>${E(x.description || (x.personal ? x.customer_name || "" : ""))}</b><small>${x.ends_on ? E(Lang.t("حتى") + " " + day(x.ends_on)) : E(Lang.t("بدون تاريخ انتهاء"))} · ${E(pick(`استُخدم ${num(x.used_count)}${x.usage_limit ? " من " + num(x.usage_limit) : ""}`, `used ${num(x.used_count)}${x.usage_limit ? " of " + num(x.usage_limit) : ""}`, `שומש ${num(x.used_count)}${x.usage_limit ? " מתוך " + num(x.usage_limit) : ""}`))}</small>
          <div class="biz-row-tags">${pill(COUPON_STATE, x.state)}${x.personal ? ` <span class="badge info">${E(Lang.t("شخصي"))}</span>` : ""}${x.source === "retention" ? ` <span class="badge muted">${E(Lang.t("استعادة عميل"))}</span>` : ""}</div></div>
          <div class="biz-row-side"><small>${E(Lang.t("خصم ممنوح"))}</small><strong>${E(money(x.discount_given))}</strong></div></button>`).join("")}</div>`
        : UI.empty(Lang.t("لا توجد كوبونات"), Lang.t("أنشئ كوداً بنسبة أو مبلغ ثابت مع حدود الاستخدام."));
      host.querySelectorAll("[data-coupon]").forEach(b => b.onclick = async () => { await refs(); couponModal(r.items.find(x => x.id === b.dataset.coupon), services, products, paint); });
    };
    UI.wireSeg("cp-status", v => { status = v; paint(); });
    let timer; field("cp-q").oninput = e => { clearTimeout(timer); timer = setTimeout(() => { q = e.target.value.trim(); paint(); }, 300); };
    field("cp-new").onclick = async () => { await refs(); couponModal({}, services, products, paint); };
    await paint();
  }
  async function couponModal(x, services, products, refresh) {
    const opt = (v, l, cur) => `<option value="${E(v)}" ${String(v) === String(cur ?? "") ? "selected" : ""}>${E(l)}</option>`;
    const checks = (list, chosen, attr) => list.map(i => `<label class="checkrow"><input type="checkbox" ${attr}="${E(i.id)}" ${(chosen || []).includes(i.id) ? "checked" : ""}> <span data-i18n-skip>${E(i.name)}</span></label>`).join("");
    UI.modal(`<div class="mhead"><h3>${E(Lang.t(x.id ? "تعديل كوبون" : "كوبون جديد"))}</h3><button class="iconbtn" id="cm-x" aria-label="إغلاق">${UI.icon("x", 20)}</button></div>
      <form class="mform" id="cpf"><div class="control-form">
        <label>${E(Lang.t("الكود"))}<input class="input" id="cpf-code" dir="ltr" maxlength="32" required value="${E(x.code || "")}" style="text-transform:uppercase" ${x.used_count > 0 ? "readonly" : ""}></label>
        <label>${E(Lang.t("الوصف"))}<input class="input" id="cpf-desc" maxlength="300" value="${E(x.description || "")}"></label>
        <label>${E(Lang.t("نوع الخصم"))}<select class="select" id="cpf-kind">${opt("percent", Lang.t("نسبة مئوية"), x.kind)}${opt("fixed", Lang.t("مبلغ ثابت"), x.kind)}</select></label>
        <label>${E(Lang.t("القيمة"))}${moneyIn("cpf-value", x.value ?? "", "required")}</label>
        <label>${E(Lang.t("يبدأ في"))}<input class="input" type="date" id="cpf-start" value="${E(x.starts_on || "")}"></label>
        <label>${E(Lang.t("ينتهي في"))}<input class="input" type="date" id="cpf-end" value="${E(x.ends_on || "")}"></label>
        <label>${E(Lang.t("حد الاستخدام الكلي"))}<input class="input" type="number" min="1" step="1" id="cpf-limit" value="${x.usage_limit ?? ""}" placeholder="${E(Lang.t("بدون حد"))}"></label>
        <label>${E(Lang.t("حد لكل عميل"))}<input class="input" type="number" min="1" step="1" id="cpf-per" value="${x.per_customer_limit ?? ""}" placeholder="${E(Lang.t("بدون حد"))}"></label>
        <label>${E(Lang.t("الحد الأدنى للشراء"))}${moneyIn("cpf-min", x.min_spend ?? 0)}</label>
        <label>${E(Lang.t("ينطبق على"))}<select class="select" id="cpf-applies">${opt("all", Lang.t("كل الفاتورة"), x.applies_to)}${opt("services", Lang.t("الخدمات فقط"), x.applies_to)}${opt("products", Lang.t("المنتجات فقط"), x.applies_to)}${opt("selected", Lang.t("خدمات ومنتجات محددة"), x.applies_to)}</select></label></div>
        <div id="cpf-selected"><fieldset class="loy-fieldset"><legend>${E(Lang.t("الخدمات"))}</legend>${checks(services, x.service_ids, "data-cpf-svc")}</fieldset>
          ${products.length ? `<fieldset class="loy-fieldset"><legend>${E(Lang.t("المنتجات"))}</legend>${checks(products, x.product_ids, "data-cpf-prod")}</fieldset>` : ""}</div>
        <label class="notification-toggle"><span>${E(Lang.t("نشط"))}</span><input type="checkbox" id="cpf-active" ${x.is_active !== false ? "checked" : ""}></label>
        ${x.personal ? `<p class="tiny">${E(Lang.t("كوبون شخصي لعميل واحد"))}: <b data-i18n-skip>${E(x.customer_name || "")}</b></p>` : ""}
        <button class="btn" type="submit" id="cpf-save">${E(Lang.t("حفظ"))}</button>${x.id ? `<button class="btn line" type="button" id="cpf-del" style="color:var(--danger);border-color:var(--danger)">${E(Lang.t(x.used_count > 0 ? "إيقاف" : "حذف"))}</button>` : ""}${errorBox("cpf-err")}
        ${x.id ? `<div class="sec-label">${E(Lang.t("الاستخدامات"))}</div><div id="cpf-uses">${UI.loading()}</div>` : ""}</form>`);
    const sync = () => { field("cpf-selected").hidden = val("cpf-applies") !== "selected"; };
    field("cpf-applies").onchange = sync; sync();
    field("cm-x").onclick = UI.closeModal;
    field("cpf").onsubmit = async e => { e.preventDefault(); UI.busy("cpf-save", true);
      try {
        await rpc("admin_biz_save_coupon", { p_token: tok(), p_id: x.id || null, p_data: { code: val("cpf-code"), description: val("cpf-desc"), kind: val("cpf-kind"), value: val("cpf-value"), starts_on: val("cpf-start"), ends_on: val("cpf-end"),
          usage_limit: val("cpf-limit"), per_customer_limit: val("cpf-per"), min_spend: val("cpf-min") || 0, applies_to: val("cpf-applies"), customer_id: x.customer_id || null,
          service_ids: [...document.querySelectorAll("[data-cpf-svc]:checked")].map(i => i.dataset.cpfSvc), product_ids: [...document.querySelectorAll("[data-cpf-prod]:checked")].map(i => i.dataset.cpfProd), is_active: field("cpf-active").checked } });
        UI.closeModal(); UI.toast("تم الحفظ", "ok"); await refresh();
      } catch (err) { showError("cpf-err", err); UI.busy("cpf-save", false); } };
    const del = field("cpf-del");
    if (del) del.onclick = async () => {
      try { if (x.used_count > 0) await rpc("admin_biz_set_coupon_active", { p_token: tok(), p_id: x.id, p_active: false }); else await rpc("admin_biz_delete_coupon", { p_token: tok(), p_id: x.id }); UI.closeModal(); UI.toast("تم الحفظ", "ok"); await refresh(); }
      catch (err) { showError("cpf-err", err); }
    };
    if (x.id) {
      const usesPage = async page => {
        try {
          const all = await rpc("admin_biz_list_coupon_redemptions", { p_token: tok(), p_id: x.id, p_limit: 11, p_offset: page * 10 });
          const host = field("cpf-uses"); if (!host) return;
          const uses = all.slice(0, 10), more = all.length > 10;
          host.innerHTML = (uses.length ? `<ul class="biz-mini">${uses.map(u => `<li><span dir="ltr">#${E(u.receipt_no)}</span><span data-i18n-skip>${E(u.customer_label)}</span><b>${E(money(u.amount))}</b><small>${E(day(u.business_date))}${u.status === "reversed" ? " · " + E(Lang.t("مُلغى")) : ""}</small></li>`).join("")}</ul>` : `<p class="tiny">${E(Lang.t("لم يُستخدم بعد."))}</p>`) + UI.pager(page, more);
          UI.wirePager(() => { if (page > 0) usesPage(page - 1); }, () => { if (more) usesPage(page + 1); }, host);
        } catch {}
      };
      usesPage(0);
    }
  }

  // ── Service packages ───────────────────────────────────────────────────
  async function packagesPage(body, c, s, opts = {}) {
    let sub = opts.sub || "catalog", page = 0;
    const PAGE = 10;
    body.innerHTML = `${sectionHead(s, `<button class="btn sm" id="pk-new">${UI.icon("plus", 16)} ${E(Lang.t("باقة جديدة"))}</button>`)}
      <div class="biz-explain card"><b>${E(Lang.t("كيف تعمل الباقات"))}</b><ol class="biz-steps">
        <li>${E(Lang.t("أنشئ باقة: الخدمات المشمولة، عدد الجلسات، السعر والصلاحية، ومع أي مختصين تصلح."))}</li>
        <li>${E(Lang.t("يراها العملاء في التطبيق ويطلبون شراءها، أو تبيعها مباشرة من شاشة الدفع."))}</li>
        <li>${E(Lang.t("عند تسجيل الدفع تُضاف الباقة لحساب العميل، وتُخصم جلسة عند كل زيارة مشمولة."))}</li></ol></div>
      ${UI.seg("pk-tabs", [{ v: "catalog", l: Lang.t("الباقات") }, { v: "requests", l: Lang.t("طلبات الشراء") }, { v: "sold", l: Lang.t("المباعة للعملاء") }], sub)}<div id="pk-body">${UI.loading()}</div>`;
    UI.wireSeg("pk-tabs", v => { sub = v; page = 0; paint(); });
    let defs = null;
    const loadDefs = async () => (defs = await rpc("admin_biz_list_packages", { p_token: tok() }));
    field("pk-new").onclick = async () => { const r = defs || await loadDefs(); packageModal({}, r, paint); };
    const paint = async () => {
      const host = field("pk-body"); if (!host) return; host.innerHTML = UI.loading();
      try {
        if (sub === "catalog") {
          const r = await loadDefs();
          const list = r.packages.slice(page * PAGE, page * PAGE + PAGE);
          host.innerHTML = `${Number(r.requests_open) > 0 ? `<button class="biz-alert-row" id="pk-goreq">${UI.icon("bell", 16)}<span>${E(pick(`${num(r.requests_open)} طلب شراء بانتظارك`, `${num(r.requests_open)} purchase requests waiting`, `${num(r.requests_open)} בקשות רכישה ממתינות`))}</span>${UI.icon("chev", 16)}</button>` : ""}
            ${r.packages.length ? `<div class="biz-rows">${list.map(p => `<button class="biz-row clickable" data-pkgdef="${E(p.id)}"><div class="biz-row-time"><b>${num(p.sessions)}</b><small>${E(Lang.t("جلسات"))}</small></div>
                <div class="biz-row-main"><b data-i18n-skip>${E(p.name)}</b><small>${p.value ? E(pick(`قيمتها ${money(p.value)}`, `worth ${money(p.value)}`, `בשווי ${money(p.value)}`)) + " · " : ""}${p.validity_days ? E(pick(`صالحة ${num(p.validity_days)} يوماً`, `valid ${num(p.validity_days)} days`, `בתוקף ${num(p.validity_days)} ימים`)) : E(Lang.t("بدون انتهاء"))} · ${E(pick(`بيعت ${num(p.sold)}`, `${num(p.sold)} sold`, `נמכרו ${num(p.sold)}`))}</small>
                <div class="biz-row-tags">${p.is_active ? "" : `<span class="badge muted">${E(Lang.t("متوقفة"))}</span>`}${p.show_to_customers === false ? `<span class="badge muted">${E(Lang.t("لا تظهر للعملاء"))}</span>` : `<span class="badge info">${E(Lang.t("تظهر للعملاء"))}</span>`}${(p.barber_ids || []).length ? `<span class="badge muted">${E(pick(`${num(p.barber_ids.length)} مختص`, `${num(p.barber_ids.length)} specialists`, `${num(p.barber_ids.length)} אנשי מקצוע`))}</span>` : ""}</div></div>
                <div class="biz-row-side"><strong>${E(money(p.price))}</strong>${UI.icon("chev", 16)}</div></button>`).join("")}</div>${UI.pager(page, (page + 1) * PAGE < r.packages.length)}`
              : UI.empty(Lang.t("لا توجد باقات"), Lang.t("مثال: 5 جلسات قص بسعر مخفض. تُباع من شاشة الدفع وتُخصم الجلسة عند كل زيارة."))}
            <p class="tiny biz-note">${E(Lang.t("سعر الباقة إيراد عند البيع فقط. استخدام الجلسة لاحقاً لا يُحسب إيراداً جديداً."))}</p>`;
          UI.wirePager(() => { if (page > 0) { page--; paint(); } }, () => { page++; paint(); });
          const go = field("pk-goreq"); if (go) go.onclick = () => { sub = "requests"; page = 0; document.querySelectorAll("#pk-tabs button").forEach(b => b.classList.toggle("on", b.dataset.v === "requests")); paint(); };
          host.querySelectorAll("[data-pkgdef]").forEach(b => b.onclick = () => packageModal(r.packages.find(x => x.id === b.dataset.pkgdef), r, paint));
        } else if (sub === "requests") {
          const r = await rpc("admin_biz_list_package_requests", { p_token: tok(), p_status: "all", p_limit: PAGE + 1, p_offset: page * PAGE });
          const items = r.items.slice(0, PAGE), more = r.items.length > PAGE;
          const RS = { pending: ["بانتظار الدفع", "warn"], fulfilled: ["تم البيع", "ok"], cancelled: ["ألغاه العميل", "muted"], declined: ["مرفوض", "muted"] };
          host.innerHTML = items.length ? `<div class="biz-rows">${items.map(q => `<div class="biz-row"><div class="biz-row-main"><b data-i18n-skip>${E(q.customer_name || "")}</b>
              <small><span data-i18n-skip>${E(q.package_name)}</span> · ${E(money(q.price))} · <span dir="ltr">${E(q.customer_phone || "")}</span> · ${E(stamp(q.created_at))}</small>
              <div class="biz-row-tags">${pill(RS, q.status)}${q.receipt_no ? ` <span class="badge muted" dir="ltr">#${E(q.receipt_no)}</span>` : ""}</div>${q.note ? `<small data-i18n-skip>${E(q.note)}</small>` : ""}</div>
            <div class="biz-row-side biz-inline">${q.status === "pending" ? `${on(c, "smart_checkout") ? `<button class="btn sm" data-req-sell="${E(q.id)}">${E(Lang.t("تسجيل الدفع"))}</button>` : ""}<button class="iconbtn" data-req-decline="${E(q.id)}" aria-label="${E(Lang.t("رفض"))}">${UI.icon("x", 15)}</button>` : ""}</div></div>`).join("")}</div>${UI.pager(page, more)}`
            : UI.empty(Lang.t("لا توجد طلبات شراء"), Lang.t("عندما يطلب عميل باقة من التطبيق تظهر هنا لتسجيل دفعها."));
          UI.wirePager(() => { if (page > 0) { page--; paint(); } }, () => { if (more) { page++; paint(); } });
          host.querySelectorAll("[data-req-sell]").forEach(b => b.onclick = () => { const q = items.find(x => x.id === b.dataset.reqSell);
            openCheckout({ customer: q.customer_id, packageSale: q.package_id, onDone: async () => { ctxAt = 0; await paint(); } }); });
          host.querySelectorAll("[data-req-decline]").forEach(b => b.onclick = () => reasonModal(Lang.t("رفض طلب الباقة"), Lang.t("سيصل العميل إشعار بأن الطلب لم يُلبَّ."),
            async reason => { await rpc("admin_biz_decline_package_request", { p_token: tok(), p_id: b.dataset.reqDecline, p_reason: reason }); UI.toast("تم الحفظ", "ok"); await paint(); }));
        } else {
          const r = await rpc("admin_biz_list_customer_packages", { p_token: tok(), p_customer: null, p_status: null, p_search: null, p_limit: PAGE + 1, p_offset: page * PAGE });
          const items = r.items.slice(0, PAGE), more = r.items.length > PAGE;
          host.innerHTML = items.length ? `<div class="biz-rows">${items.map(p => `<button class="biz-row clickable" data-cpk="${E(p.id)}"><div class="biz-row-time"><b dir="ltr">${num(p.sessions_total - p.sessions_used)}/${num(p.sessions_total)}</b><small>${E(Lang.t("متبقية"))}</small></div>
              <div class="biz-row-main"><b data-i18n-skip>${E(p.customer_label)}</b><small><span data-i18n-skip>${E(p.name)}</span> · ${E(day(p.purchased_on))}${p.expires_on ? " → " + E(day(p.expires_on)) : ""}</small><div class="biz-row-tags">${pill(PACKAGE_STATE, p.status)}</div></div>
              <div class="biz-row-side"><strong>${E(money(p.price_paid))}</strong>${UI.icon("chev", 16)}</div></button>`).join("")}</div>${UI.pager(page, more)}` : UI.empty(Lang.t("لم تُبع باقات بعد"), "");
          UI.wirePager(() => { if (page > 0) { page--; paint(); } }, () => { if (more) { page++; paint(); } });
          host.querySelectorAll("[data-cpk]").forEach(b => b.onclick = () => customerPackageModal(items.find(x => x.id === b.dataset.cpk), paint));
        }
      } catch (e) { host.innerHTML = `<div class="card">${E(e.message)}</div>`; }
    };
    await paint();
  }
  // r = admin_biz_list_packages (services and active specialists with what they offer).
  function packageModal(p, r, refresh) {
    const services = r.services || [], barbers = r.barbers || [];
    const chosenBarbers = new Set(p.barber_ids || []);
    UI.modal(`<div class="mhead"><h3>${E(Lang.t(p.id ? "تعديل باقة" : "باقة جديدة"))}</h3><button class="iconbtn" id="pkm-x" aria-label="إغلاق">${UI.icon("x", 20)}</button></div>
      <form class="mform" id="pkm"><div class="control-form"><label class="full">${E(Lang.t("الاسم"))}<input class="input" id="pkm-name" maxlength="120" required value="${E(p.name || "")}"></label>
        <label>${E(Lang.t("عدد الجلسات"))}<input class="input" type="number" min="1" max="1000" step="1" id="pkm-sessions" required value="${p.sessions ?? ""}"></label>
        <label>${E(Lang.t("سعر الباقة"))}${moneyIn("pkm-price", p.price ?? "", "required")}</label>
        <label>${E(Lang.t("القيمة الأصلية (اختياري)"))}${moneyIn("pkm-value", p.value ?? "")}</label>
        <label>${E(Lang.t("الصلاحية بالأيام (اختياري)"))}<input class="input" type="number" min="1" max="3650" step="1" id="pkm-days" value="${p.validity_days ?? ""}" placeholder="${E(Lang.t("بدون انتهاء"))}"></label>
        <label class="full">${E(Lang.t("الوصف"))}<input class="input" id="pkm-desc" maxlength="1000" value="${E(p.description || "")}"></label></div>
        <fieldset class="loy-fieldset"><legend>${E(Lang.t("الخدمات المشمولة"))}</legend>${services.map(sv => `<label class="checkrow"><input type="checkbox" data-pkm-svc="${E(sv.id)}" ${(p.service_ids || []).includes(sv.id) ? "checked" : ""}> <span><span data-i18n-skip>${E(sv.name)}</span> · ${E(money(sv.price))}</span></label>`).join("")}</fieldset>
        <fieldset class="loy-fieldset"><legend>${E(Lang.t("المختصون"))}</legend>
          <label class="checkrow"><input type="radio" name="pkm-who" value="all" ${chosenBarbers.size ? "" : "checked"}> <span>${E(Lang.t("كل مختص يقدم هذه الخدمات"))}</span></label>
          <label class="checkrow"><input type="radio" name="pkm-who" value="some" ${chosenBarbers.size ? "checked" : ""}> <span>${E(Lang.t("مختصون محددون فقط"))}</span></label>
          <div id="pkm-barbers" class="pkm-barbers"></div></fieldset>
        <label class="notification-toggle"><span>${E(Lang.t("متاحة للبيع"))}</span><input type="checkbox" id="pkm-active" ${p.is_active !== false ? "checked" : ""}></label>
        <label class="notification-toggle"><span>${E(Lang.t("تظهر للعملاء في التطبيق"))}<small class="tiny" style="display:block">${E(Lang.t("يستطيع العملاء رؤيتها وطلب شرائها، والدفع في العمل."))}</small></span><input type="checkbox" id="pkm-public" ${p.show_to_customers !== false ? "checked" : ""}></label>
        <p class="tiny">${E(Lang.t("تعديل الباقة يؤثر على المبيعات القادمة فقط؛ الباقات المباعة تحتفظ بشروطها."))}</p>
        <button class="btn" type="submit" id="pkm-save">${E(Lang.t("حفظ"))}</button>${errorBox("pkm-err")}</form>`);
    field("pkm-x").onclick = UI.closeModal;
    // Only specialists who offer at least one of the chosen services can be picked.
    const paintBarbers = () => {
      const host = field("pkm-barbers"); if (!host) return;
      const some = document.querySelector('[name="pkm-who"]:checked')?.value === "some";
      const svc = new Set([...document.querySelectorAll("[data-pkm-svc]:checked")].map(i => i.dataset.pkmSvc));
      [...document.querySelectorAll("[data-pkm-barber]")].forEach(i => { if (i.checked) chosenBarbers.add(i.dataset.pkmBarber); else chosenBarbers.delete(i.dataset.pkmBarber); });
      const fit = barbers.filter(b => (b.service_ids || []).some(id => svc.has(id)));
      host.hidden = !some;
      host.innerHTML = fit.length ? fit.map(b => `<label class="checkrow"><input type="checkbox" data-pkm-barber="${E(b.id)}" ${chosenBarbers.has(b.id) ? "checked" : ""}> <span data-i18n-skip>${E(b.name)}</span></label>`).join("")
        : `<p class="tiny">${E(Lang.t("اختر الخدمات أولاً لعرض المختصين الذين يقدمونها."))}</p>`;
    };
    document.querySelectorAll('[name="pkm-who"],[data-pkm-svc]').forEach(i => i.addEventListener("change", paintBarbers));
    paintBarbers();
    field("pkm").onsubmit = async e => { e.preventDefault();
      const some = document.querySelector('[name="pkm-who"]:checked')?.value === "some";
      const barberIds = some ? [...document.querySelectorAll("[data-pkm-barber]:checked")].map(i => i.dataset.pkmBarber) : [];
      if (some && !barberIds.length) { showError("pkm-err", new Error(Lang.t("اختر مختصاً واحداً على الأقل أو «كل مختص»"))); return; }
      UI.busy("pkm-save", true);
      try { await rpc("admin_biz_save_package", { p_token: tok(), p_id: p.id || null, p_data: { name: val("pkm-name"), sessions: val("pkm-sessions"), price: val("pkm-price"), value: val("pkm-value"), validity_days: val("pkm-days"), description: val("pkm-desc"),
          service_ids: [...document.querySelectorAll("[data-pkm-svc]:checked")].map(i => i.dataset.pkmSvc), barber_ids: barberIds,
          is_active: field("pkm-active").checked, show_to_customers: field("pkm-public").checked } }); UI.closeModal(); UI.toast("تم الحفظ", "ok"); await refresh(); }
      catch (err) { showError("pkm-err", err); UI.busy("pkm-save", false); } };
  }
  function customerPackageModal(p, refresh) {
    UI.modal(`<div class="mhead"><h3 data-i18n-skip>${E(p.name)}</h3><button class="iconbtn" id="cpm-x" aria-label="إغلاق">${UI.icon("x", 20)}</button></div>
      <div class="mform"><p><b data-i18n-skip>${E(p.customer_label)}</b> · ${pill(PACKAGE_STATE, p.status)}</p>
        <ul class="biz-mini"><li><span>${E(Lang.t("الجلسات"))}</span><b>${num(p.sessions_used)} / ${num(p.sessions_total)}</b></li><li><span>${E(Lang.t("المدفوع"))}</span><b>${E(money(p.price_paid))}</b>${p.receipt_no ? `<small dir="ltr">#${E(p.receipt_no)}</small>` : ""}</li>
          <li><span>${E(Lang.t("الشراء"))}</span><b>${E(day(p.purchased_on))}</b></li><li><span>${E(Lang.t("الانتهاء"))}</span><b>${p.expires_on ? E(day(p.expires_on)) : E(Lang.t("بدون انتهاء"))}</b></li></ul>
        <div class="sec-label">${E(Lang.t("سجل الاستخدام"))}</div>${(p.history || []).length ? `<ul class="biz-mini">${p.history.map(h => `<li><span data-i18n-skip>${E(h.service)}</span><small>${E(stamp(h.at))}${h.status === "reversed" ? " · " + E(Lang.t("مُلغى")) : ""}</small></li>`).join("")}</ul>` : `<p class="tiny">${E(Lang.t("لم تُستخدم جلسات بعد."))}</p>`}
        ${["active", "expired"].includes(p.status) ? `<div class="control-form"><label>${E(Lang.t("تمديد الصلاحية حتى"))}<input class="input" type="date" id="cpm-until" value="${E(p.expires_on || "")}"></label></div><button class="btn line" id="cpm-extend">${E(Lang.t("تمديد"))}</button>` : ""}
        ${!["cancelled", "refunded"].includes(p.status) ? `<button class="btn line" id="cpm-cancel" style="color:var(--danger);border-color:var(--danger)">${E(Lang.t("إلغاء الباقة"))}</button>` : ""}${errorBox("cpm-err")}</div>`);
    field("cpm-x").onclick = UI.closeModal;
    const act = (action, data) => reasonModal(Lang.t(action === "extend" ? "تمديد الباقة" : "إلغاء الباقة"), "", async reason => {
      await rpc("admin_biz_update_customer_package", { p_token: tok(), p_id: p.id, p_action: action, p_reason: reason, p_data: data || {} }); UI.toast("تم الحفظ", "ok"); await refresh(); }, action !== "extend");
    const ext = field("cpm-extend"); if (ext) ext.onclick = () => act("extend", { expires_on: val("cpm-until") || null });
    const can2 = field("cpm-cancel"); if (can2) can2.onclick = () => act("cancel");
  }

  // ── Smart waitlist ─────────────────────────────────────────────────────
  async function waitlistPage(body, c, s) {
    let status = "active", page = 0; const PAGE = 10;
    body.innerHTML = `${sectionHead(s, `<button class="btn line sm" id="wl-settings">${UI.icon("cog", 15)} ${E(Lang.t("الإعدادات"))}</button>`)}${UI.seg("wl-status", [{ v: "active", l: Lang.t("النشطة") }, { v: "all", l: Lang.t("الكل") }], status)}<div id="wl-body">${UI.loading()}</div>`;
    const paint = async () => {
      const host = field("wl-body"); if (!host) return;
      const r = await rpc("admin_biz_list_waitlist", { p_token: tok(), p_date: null, p_status: status === "all" ? null : status, p_limit: PAGE + 1, p_offset: page * PAGE });
      const more = r.items.length > PAGE; r.items = r.items.slice(0, PAGE);
      host.innerHTML = r.items.length ? `<div class="biz-rows">${r.items.map(w => `<div class="biz-row"><div class="biz-row-time"><b>${E(Lang.date(w.preferred_date, { day: "numeric", month: "short" }))}</b><small dir="ltr">${w.exact ? E(w.time_from) : `${E(w.time_from)}–${E(w.time_to)}`}</small>${w.exact ? `<small>${E(Lang.t("وقت محدد"))}</small>` : ""}</div>
          <div class="biz-row-main"><b data-i18n-skip>${E(w.customer_name || "")}</b><small><span data-i18n-skip>${E(w.service_name || "")}</span> · <span data-i18n-skip>${E(w.barber_name || Lang.t("أي مختص"))}</span> · <span dir="ltr">${E(w.customer_phone || "")}</span></small>
            <div class="biz-row-tags">${pill(WAIT_STATE, w.status)}${w.status === "offered" ? ` <span class="badge info">${E(w.offer_time)} · <span data-i18n-skip>${E(w.offer_barber_name || "")}</span> · ${E(Lang.t("حتى"))} ${E(stamp(w.offer_expires_at))}</span>` : ""}${w.offers_count ? ` <span class="badge muted">${E(pick(`عُرض ${num(w.offers_count)}×`, `offered ${num(w.offers_count)}×`, `הוצע ${num(w.offers_count)}×`))}</span>` : ""}</div></div>
          <div class="biz-row-side biz-inline">${w.status === "waiting" ? `<button class="btn line sm" data-wl-offer="${E(w.id)}">${E(Lang.t("ابحث عن موعد"))}</button>` : ""}${["waiting", "offered"].includes(w.status) ? `<button class="iconbtn" data-wl-remove="${E(w.id)}" aria-label="${E(Lang.t("إزالة"))}">${UI.icon("trash", 15)}</button>` : ""}</div></div>`).join("")}</div>`
        : UI.empty(Lang.t("لا يوجد عملاء في قائمة الانتظار"), Lang.t("عندما لا يجد العميل موعداً يستطيع الانضمام، وعند إلغاء حجز يُعرض الموعد على أول عميل مناسب تلقائياً."));
      host.insertAdjacentHTML("beforeend", UI.pager(page, more));
      UI.wirePager(async () => { if (page > 0) { page--; await paint(); } }, async () => { if (more) { page++; await paint(); } });
      host.querySelectorAll("[data-wl-offer]").forEach(b => b.onclick = async () => { try { const x = await rpc("admin_biz_offer_waitlist", { p_token: tok(), p_id: b.dataset.wlOffer }); UI.toast(x.status === "offered" ? "عُرض موعد على العميل" : "لا يوجد موعد مناسب الآن", x.status === "offered" ? "ok" : "err"); await paint(); } catch (e) { UI.toast(e.message, "err"); } });
      host.querySelectorAll("[data-wl-remove]").forEach(b => b.onclick = () => reasonModal(Lang.t("إزالة من قائمة الانتظار"), "", async reason => { await rpc("admin_biz_remove_waitlist", { p_token: tok(), p_id: b.dataset.wlRemove, p_reason: reason }); UI.toast("تمت الإزالة", "ok"); ctxAt = 0; await paint(); }));
    };
    UI.wireSeg("wl-status", v => { status = v; page = 0; paint(); });
    field("wl-settings").onclick = () => {
      const st = c.settings;
      UI.modal(`<div class="mhead"><h3>${E(Lang.t("إعدادات قائمة الانتظار"))}</h3><button class="iconbtn" id="ws-x" aria-label="إغلاق">${UI.icon("x", 20)}</button></div>
        <form class="mform" id="ws"><div class="field"><label for="ws-min">${E(Lang.t("مدة حجز العرض للعميل بالدقائق"))}</label><input class="input" type="number" min="5" max="1440" step="5" id="ws-min" value="${st.waitlist_offer_minutes}"></div>
        <div class="field"><label for="ws-max">${E(Lang.t("أقصى طلبات انتظار نشطة لكل عميل"))}</label><input class="input" type="number" min="1" max="20" step="1" id="ws-max" value="${st.waitlist_max_active}"></div>
        <button class="btn" type="submit" id="ws-save">${E(Lang.t("حفظ"))}</button>${errorBox("ws-err")}</form>`);
      field("ws-x").onclick = UI.closeModal;
      field("ws").onsubmit = async e => { e.preventDefault(); UI.busy("ws-save", true);
        try { await rpc("admin_biz_save_settings", { p_token: tok(), p_data: { waitlist_offer_minutes: val("ws-min"), waitlist_max_active: val("ws-max") } }); UI.closeModal(); UI.toast("تم الحفظ", "ok"); ctxAt = 0; } catch (err) { showError("ws-err", err); UI.busy("ws-save", false); } };
    };
    await paint();
  }

  // ── Retention suggestions (never sent automatically) ───────────────────
  async function retentionPage(body, c, s) {
    let status = "open";
    body.innerHTML = `${sectionHead(s, `<button class="btn line sm" id="rt-settings">${UI.icon("cog", 15)} ${E(Lang.t("الإعدادات"))}</button>`)}
      <p class="tiny biz-note">${UI.icon("info", 14)} ${E(Lang.t("METON يقترح فقط. لا يُرسل أي كوبون أو رسالة إلا عندما تضغط «إرسال»."))}</p>
      ${UI.seg("rt-status", [{ v: "open", l: Lang.t("مفتوحة") }, { v: "action_taken", l: Lang.t("تم الإجراء") }, { v: "dismissed", l: Lang.t("مستبعدة") }], status)}<div id="rt-body">${UI.loading()}</div>`;
    let page = 0; const PAGE = 10;
    const paint = async () => {
      const host = field("rt-body"); if (!host) return;
      const r = await rpc("admin_biz_list_retention", { p_token: tok(), p_status: status, p_limit: PAGE + 1, p_offset: page * PAGE });
      const more = r.items.length > PAGE; r.items = r.items.slice(0, PAGE);
      const cs = r.coupon_suggestion, offer = cs.kind === "percent" ? pct(cs.value) : money(cs.value);
      host.innerHTML = r.items.length ? `<div class="biz-rows">${r.items.map(x => `<div class="biz-row"><div class="biz-row-time"><b>${num(x.days_inactive)}</b><small>${E(Lang.t("يوماً"))}</small></div>
          <div class="biz-row-main"><b data-i18n-skip>${E(x.customer_name || "")}</b><small>${E(pick(`آخر زيارة ${day(x.last_visit)} · ${num(x.visits || 0)} زيارة · أنفق ${money(x.total_spent || 0)}`, `last visit ${day(x.last_visit)} · ${num(x.visits || 0)} visits · spent ${money(x.total_spent || 0)}`, `ביקור אחרון ${day(x.last_visit)} · ${num(x.visits || 0)} ביקורים · הוציא ${money(x.total_spent || 0)}`))} · <span dir="ltr">${E(x.customer_phone || "")}</span></small>
            <div class="biz-row-tags">${pill(RETENTION_STATE, x.status)}${x.coupon_code ? ` <span class="badge info" dir="ltr">${E(x.coupon_code)}</span>` : ""}${x.sent_at ? ` <span class="badge ok">${E(Lang.t("أُرسل"))} ${E(day(x.sent_at))}</span>` : ""}</div></div>
          <div class="biz-row-side biz-inline">${["suggested", "viewed", "action_taken"].includes(x.status) && !x.sent_at ? (x.coupon_code ? `<button class="btn sm" data-rt-send="${E(x.id)}">${E(Lang.t("إرسال"))}</button>` : r.coupons_enabled ? `<button class="btn line sm" data-rt-coupon="${E(x.id)}">${E(pick(`كوبون ${offer}`, `${offer} coupon`, `קופון ${offer}`))}</button>` : "") : ""}
            ${["suggested", "viewed"].includes(x.status) ? `<button class="iconbtn" data-rt-dismiss="${E(x.id)}" aria-label="${E(Lang.t("استبعاد"))}">${UI.icon("x", 15)}</button>` : ""}</div></div>`).join("")}</div>`
        : UI.empty(Lang.t("لا توجد اقتراحات"), pick(`يظهر هنا العملاء الذين لم يحجزوا منذ ${r.thresholds.join(" / ")} يوماً.`, `Customers who have not booked for ${r.thresholds.join(" / ")} days appear here.`, `כאן יופיעו לקוחות שלא הזמינו ${r.thresholds.join(" / ")} ימים.`));
      host.insertAdjacentHTML("beforeend", UI.pager(page, more));
      UI.wirePager(async () => { if (page > 0) { page--; await paint(); } }, async () => { if (more) { page++; await paint(); } });
      // Seen suggestions are marked viewed (never re-opens a handled one).
      r.items.filter(x => x.status === "suggested").slice(0, 30).forEach(x => rpc("admin_biz_set_retention", { p_token: tok(), p_id: x.id, p_status: "viewed" }).catch(() => {}));
      host.querySelectorAll("[data-rt-coupon]").forEach(b => b.onclick = async () => { b.disabled = true; try { const cp = await rpc("admin_biz_retention_coupon", { p_token: tok(), p_id: b.dataset.rtCoupon, p_data: {} }); UI.toast(pick(`أُنشئ الكوبون ${cp.code} — لم يُرسل بعد`, `Coupon ${cp.code} created — not sent yet`, `הקופון ${cp.code} נוצר — עדיין לא נשלח`), "ok"); await paint(); } catch (e) { UI.toast(e.message, "err"); b.disabled = false; } });
      host.querySelectorAll("[data-rt-send]").forEach(b => b.onclick = () => UI.confirm(Lang.t("إرسال رسالة للعميل مع كود الخصم؟"), async () => { try { await rpc("admin_biz_retention_send", { p_token: tok(), p_id: b.dataset.rtSend }); UI.toast("تم الإرسال", "ok"); await paint(); } catch (e) { UI.toast(e.message, "err"); } }));
      host.querySelectorAll("[data-rt-dismiss]").forEach(b => b.onclick = async () => { try { await rpc("admin_biz_set_retention", { p_token: tok(), p_id: b.dataset.rtDismiss, p_status: "dismissed" }); ctxAt = 0; await paint(); } catch (e) { UI.toast(e.message, "err"); } });
    };
    UI.wireSeg("rt-status", v => { status = v; page = 0; paint(); });
    field("rt-settings").onclick = () => {
      const st = c.settings, days = st.inactivity_days || [30, 60, 90];
      UI.modal(`<div class="mhead"><h3>${E(Lang.t("إعدادات استعادة العملاء"))}</h3><button class="iconbtn" id="rs2-x" aria-label="إغلاق">${UI.icon("x", 20)}</button></div>
        <form class="mform" id="rs2"><div class="control-form">${[0, 1, 2].map(i => `<label>${E(pick(`مدة الانقطاع ${i + 1} (أيام)`, `Inactivity step ${i + 1} (days)`, `שלב היעדרות ${i + 1} (ימים)`))}<input class="input" type="number" min="7" max="730" step="1" data-rt-day value="${days[i] ?? ""}"></label>`).join("")}
          <label>${E(Lang.t("نوع خصم الكوبون المقترح"))}<select class="select" id="rs2-kind"><option value="percent" ${st.retention_coupon_kind === "percent" ? "selected" : ""}>${E(Lang.t("نسبة مئوية"))}</option><option value="fixed" ${st.retention_coupon_kind === "fixed" ? "selected" : ""}>${E(Lang.t("مبلغ ثابت"))}</option></select></label>
          <label>${E(Lang.t("قيمة الخصم"))}${moneyIn("rs2-value", st.retention_coupon_value)}</label>
          <label>${E(Lang.t("صلاحية الكوبون بالأيام"))}<input class="input" type="number" min="1" max="365" step="1" id="rs2-days" value="${st.retention_coupon_days}"></label></div>
          <button class="btn" type="submit" id="rs2-save">${E(Lang.t("حفظ"))}</button>${errorBox("rs2-err")}</form>`);
      field("rs2-x").onclick = UI.closeModal;
      field("rs2").onsubmit = async e => { e.preventDefault(); UI.busy("rs2-save", true);
        const list = [...document.querySelectorAll("[data-rt-day]")].map(x => Number(x.value)).filter(x => x > 0);
        try { await rpc("admin_biz_save_settings", { p_token: tok(), p_data: { inactivity_days: list, retention_coupon_kind: val("rs2-kind"), retention_coupon_value: val("rs2-value"), retention_coupon_days: val("rs2-days") } }); UI.closeModal(); UI.toast("تم الحفظ", "ok"); ctxAt = 0; await paint(); }
        catch (err) { showError("rs2-err", err); UI.busy("rs2-save", false); } };
    };
    await paint();
  }

  // ── Online payments (each salon is its own merchant) ───────────────────
  async function paymentsPage(body, c, s) {
    body.innerHTML = `${sectionHead(s)}<div id="py-body">${UI.loading()}</div>`;
    const paint = async () => {
      const host = field("py-body"); if (!host) return;
      const r = await rpc("admin_biz_list_payment_providers", { p_token: tok() });
      host.innerHTML = `<section class="card biz-explain"><h3>${E(Lang.t("كيف يعمل الدفع الإلكتروني"))}</h3>
          <p>${E(Lang.t("كل عمل هو التاجر: يدفع العميل مباشرة إلى حساب التاجر الخاص بالعمل لدى مزود الدفع. METON لا يستلم أموال العملاء ولا يوزعها، بل يربط حالة الدفع بالحجز والفاتورة فقط."))}</p>
          <p class="tiny">${E(Lang.t("لن يُفعّل أي مزود قبل اكتمال التوثيق الرسمي وموافقة المزود الخطية على هذا النموذج. طرق الدفع اليدوية تبقى متاحة دائماً."))}</p>
          <p>${r.ready ? `<span class="badge ok">${E(Lang.t("الدفع الإلكتروني جاهز لهذا العمل"))}</span>` : `<span class="badge warn">${E(Lang.t("الدفع الإلكتروني غير متاح بعد لهذا العمل"))}</span>`}</p></section>
        <div class="biz-rows">${r.providers.map(p => `<div class="biz-row"><div class="biz-row-main"><b>${E(p.name)}</b><small>${E(p.region === "IL" ? Lang.t("إسرائيل") : p.region === "PS" ? Lang.t("فلسطين") : p.region)}</small>
            <div class="biz-row-tags">${pill(PROVIDER_STATE, p.integration_status)} ${pill(MERCHANT_STATE, p.multi_merchant_status)}${p.account ? " " + pill(ACCOUNT_STATE, p.account.status) : ""}</div>
            ${p.account?.request_note ? `<small data-i18n-skip>${E(p.account.request_note)}</small>` : ""}</div>
          <div class="biz-row-side">${!p.account && p.multi_merchant_status !== "not_permitted" ? `<button class="btn line sm" data-py-request="${E(p.code)}">${E(Lang.t("طلب ربط حسابي"))}</button>` : ""}</div></div>`).join("")}</div>`;
      host.querySelectorAll("[data-py-request]").forEach(b => b.onclick = () => {
        UI.modal(`<div class="mhead"><h3>${E(Lang.t("طلب ربط حساب التاجر"))}</h3><button class="iconbtn" id="pr-x" aria-label="إغلاق">${UI.icon("x", 20)}</button></div>
          <form class="mform" id="pr"><p class="muted">${E(Lang.t("لا تكتب كلمات مرور أو مفاتيح هنا. سيتواصل معك فريق METON لاستكمال الربط بأمان بعد اعتماد المزود."))}</p>
          <div class="field"><label for="pr-note">${E(Lang.t("ملاحظة (اسم الحساب أو رقم التاجر غير السري)"))}</label><input class="input" id="pr-note" maxlength="500"></div>
          <button class="btn" type="submit" id="pr-go">${E(Lang.t("إرسال الطلب"))}</button>${errorBox("pr-err")}</form>`);
        field("pr-x").onclick = UI.closeModal;
        field("pr").onsubmit = async e => { e.preventDefault(); UI.busy("pr-go", true);
          try { await rpc("admin_biz_request_payment_provider", { p_token: tok(), p_provider: b.dataset.pyRequest, p_note: val("pr-note") }); UI.closeModal(); UI.toast("تم إرسال الطلب", "ok"); await paint(); } catch (err) { showError("pr-err", err); UI.busy("pr-go", false); } };
      });
    };
    await paint();
  }

  // ── Team permissions ───────────────────────────────────────────────────
  async function teamPage(body, c, s) {
    body.innerHTML = `${sectionHead(s)}<p class="tiny biz-note">${UI.icon("info", 14)} ${E(Lang.t("المديرون لديهم كل الصلاحيات. للمختصين المرتبطين بحساب: اختر ما يمكنهم فعله. الميزة نفسها يجب أن تكون ضمن باقة العمل."))}</p><div id="tm-body">${UI.loading()}</div>`;
    const list = await rpc("admin_biz_list_staff", { p_token: tok() });
    const host = field("tm-body"); if (!host) return;
    host.innerHTML = list.length ? `<div class="biz-rows">${list.map(u => `<div class="biz-row biz-perm" data-user="${E(u.user_id)}"><div class="biz-row-main"><b data-i18n-skip>${E(u.name || "")}</b>
        <small>${E(Lang.t(u.role === "admin" ? "مدير" : "مختص"))}${u.barber_name ? ` · <span data-i18n-skip>${E(u.barber_name)}</span>` : ""}${u.is_disabled ? ` · ${E(Lang.t("موقوف"))}` : ""}</small></div>
      <div class="biz-perm-list">${Object.entries(PERMS).map(([k, [l, i]]) => `<label class="biz-perm-chip ${u.permissions.includes(k) ? "on" : ""}">${UI.icon(i, 14)}<span>${E(Lang.t(l))}</span><input type="checkbox" data-perm="${k}" ${u.permissions.includes(k) ? "checked" : ""} ${u.role === "admin" ? "disabled" : ""}></label>`).join("")}</div></div>`).join("")}</div>`
      : UI.empty(Lang.t("لا يوجد موظفون مرتبطون"), Lang.t("اربط حساب المختص من تبويب العملاء → تعديل المستخدم."));
    host.querySelectorAll(".biz-perm").forEach(row => row.querySelectorAll("[data-perm]").forEach(box => box.onchange = async () => {
      const perms = [...row.querySelectorAll("[data-perm]:checked")].map(x => x.dataset.perm);
      box.closest(".biz-perm-chip").classList.toggle("on", box.checked);
      try { await rpc("admin_biz_set_staff_permissions", { p_token: tok(), p_user: row.dataset.user, p_permissions: perms }); UI.toast("تم الحفظ", "ok"); }
      catch (e) { UI.toast(e.message, "err"); box.checked = !box.checked; box.closest(".biz-perm-chip").classList.toggle("on", box.checked); }
    }));
  }

  // ── Audit trail ────────────────────────────────────────────────────────
  const ACTIONS = { checkout_completed: "إتمام دفع", checkout_collected: "تحصيل متبقٍ", checkout_refunded: "استرجاع", checkout_voided: "إلغاء فاتورة", checkout_paid_online: "دفع إلكتروني",
    deposit_requested: "طلب عربون", deposit_paid: "دفع عربون", deposit_paid_online: "دفع عربون إلكترونياً", deposit_refunded: "استرجاع عربون", deposit_expired: "انتهاء مهلة عربون", deposit_cancelled: "إلغاء عربون",
    deposit_policy_refund: "سياسة: إرجاع العربون", deposit_policy_forfeit: "سياسة: احتجاز العربون", deposit_override_waive: "إعفاء من عربون", deposit_override_extend: "تمديد مهلة عربون",
    deposit_override_forfeit: "احتجاز عربون", deposit_override_refund_due: "تحويل عربون للإرجاع", expense_created: "مصروف جديد", expense_updated: "تعديل مصروف", expense_voided: "إلغاء مصروف",
    coupon_created: "كوبون جديد", coupon_updated: "تعديل كوبون", coupon_activated: "تفعيل كوبون", coupon_deactivated: "إيقاف كوبون", coupon_deleted: "حذف كوبون",
    package_created: "باقة جديدة", package_updated: "تعديل باقة", customer_package_extend: "تمديد باقة عميل", customer_package_cancel: "إلغاء باقة عميل",
    stock_restock: "توريد مخزون", stock_count: "جرد مخزون", stock_adjust: "تعديل مخزون", inventory_settings: "إعدادات مخزون", commission_rule_saved: "قاعدة عمولة", commission_rule_deleted: "حذف قاعدة عمولة",
    staff_permissions_saved: "صلاحيات موظف", settings_saved: "إعدادات الأعمال", service_deposit_saved: "عربون خدمة", waitlist_joined: "انضمام لقائمة الانتظار", waitlist_offered: "عرض موعد من الانتظار",
    waitlist_booked: "حجز من الانتظار", waitlist_removed: "إزالة من الانتظار", retention_viewed: "مشاهدة اقتراح", retention_dismissed: "استبعاد اقتراح", retention_suggested: "إعادة اقتراح",
    retention_coupon_created: "كوبون استعادة", retention_sent: "إرسال رسالة استعادة", payment_provider_requested: "طلب ربط مزود دفع" };
  async function auditPage(body, c, s) {
    let page = 0, entity = "";
    const ENT = { "": "الكل", checkout: "الفواتير", deposit: "العربون", expense: "المصاريف", coupon: "الكوبونات", product: "المخزون", retention: "استعادة العملاء", waitlist: "قائمة الانتظار", settings: "الإعدادات" };
    body.innerHTML = `${sectionHead(s)}<div class="card biz-toolbar"><select class="select" id="au-entity">${Object.entries(ENT).map(([k, l]) => `<option value="${k}">${E(Lang.t(l))}</option>`).join("")}</select></div><div id="au-body">${UI.loading()}</div>`;
    const paint = async () => {
      const host = field("au-body"); if (!host) return;
      const rows = await rpc("admin_biz_list_audit", { p_token: tok(), p_entity: entity || null, p_limit: 10, p_offset: page * 10 });
      host.innerHTML = (rows.length ? `<ol class="biz-audit">${rows.map(a => `<li><div><b>${E(Lang.t(ACTIONS[a.action] || a.action))}</b><small>${E(stamp(a.created_at))} · <span data-i18n-skip>${E(a.actor_label || a.actor_kind)}</span></small>
          ${a.reason ? `<p data-i18n-skip>${E(a.reason)}</p>` : ""}${a.after_state ? `<details><summary>${E(Lang.t("التفاصيل"))}</summary><pre dir="ltr" data-i18n-skip>${E(JSON.stringify({ before: a.before_state, after: a.after_state }, null, 1).slice(0, 2000))}</pre></details>` : ""}</div></li>`).join("")}</ol>`
        : UI.empty(Lang.t("لا توجد عمليات بعد"), "")) + UI.pager(page, rows.length === 10);
      UI.wirePager(async () => { if (page > 0) { page--; await paint(); } }, async () => { if (rows.length === 10) { page++; await paint(); } });
    };
    field("au-entity").onchange = e => { entity = e.target.value; page = 0; paint(); };
    await paint();
  }

  // ── Booking integrations (admin modal, specialist sheet, booking page) ─
  // Deposit and receipt state of one booking, with the actions this person
  // may take. host is filled asynchronously; nothing is shown without data.
  async function bookingPanel(host, booking, opts = {}) {
    if (!host || !booking?.id || !available()) return;
    let marks, c = null;
    try { [marks] = await rpc("biz_list_booking_marks", { p_token: opts.token || tok(), p_ids: [booking.id] }).then(x => [x?.[0] || null]); } catch { marks = null; }
    if (opts.staff) { try { c = await context(); currency = c.currency || currency; } catch { c = null; } }
    if (!host.isConnected) return;
    const d = marks?.deposit, r = marks?.receipt;
    const canCheckout = opts.staff && c && on(c, "smart_checkout") && can(c, "checkout") && !r && ["pending", "confirmed", "completed"].includes(booking.status);
    const canDeposit = opts.staff && c && on(c, "deposits") && can(c, "deposits") && d && ["pending", "expired"].includes(d.status);
    if (!d && !r && !canCheckout) { host.innerHTML = ""; return; }
    host.innerHTML = `<div class="biz-booking">${d ? `<div class="biz-booking-row">${UI.icon("lock", 16)}<span>${E(Lang.t("العربون"))} ${E(money(d.amount))}</span>${pill(DEPOSIT_STATE, d.status)}${d.status === "pending" ? `<small>${E(Lang.t("المهلة"))} ${E(stamp(d.due_at))}</small>` : ""}</div>` : ""}
      ${r ? `<button class="biz-booking-row clickable" data-open-receipt="${E(r.id)}">${UI.icon("money", 16)}<span>${E(Lang.t("فاتورة"))} <span dir="ltr">#${E(r.receipt_no)}</span> · ${E(money(r.total))}</span>${pill(CHECKOUT_STATE, r.status)}${Number(r.outstanding) > 0 ? `<small>${E(Lang.t("متبقٍ"))} ${E(money(r.outstanding))}</small>` : ""}</button>` : ""}
      ${canCheckout ? `<button class="btn" data-biz-checkout>${UI.icon("money", 17)} ${E(Lang.t("إتمام الزيارة والدفع"))}</button>` : ""}
      ${canDeposit ? `<button class="btn line" data-biz-deposit>${UI.icon("lock", 16)} ${E(Lang.t("تسجيل دفع العربون"))}</button>` : ""}</div>`;
    host.querySelector("[data-biz-checkout]")?.addEventListener("click", () => { UI.closeModal(); openCheckout({ booking: booking.id, onDone: opts.onDone }); });
    host.querySelector("[data-open-receipt]")?.addEventListener("click", () => { if (opts.staff) { UI.closeModal(); receipt(r.id, opts.onDone); } });
    host.querySelector("[data-biz-deposit]")?.addEventListener("click", () => { UI.closeModal(); depositModal({ ...d, customer_label: booking.user_name || "", service_label: booking.service_name || "", barber_label: booking.barber_name || "", booking_date: booking.booking_date, booking_time: booking.booking_time }, c, async () => { if (opts.onDone) await opts.onDone(); }); });
  }

  // The customer's own booking page: deposit to pay (with the salon's
  // instructions, or the provider's secure page once one is connected).
  async function customerBookingPanel(host, booking) {
    if (!host || !booking?.id || !Auth.isLoggedIn() || !(Features.enabled("deposits") || Features.enabled("smart_checkout"))) return;
    let marks; try { marks = (await rpc("biz_list_booking_marks", { p_token: App.token, p_ids: [booking.id] }))?.[0]; } catch { return; }
    if (!marks || !host.isConnected) return;
    if (marks.currency) currency = marks.currency;
    const d = marks.deposit, r = marks.receipt;
    let quote = null;
    if (d && d.status === "pending" && Features.enabled("online_payments")) { try { quote = await rpc("biz_get_deposit_quote", { p_token: App.token, p_service: booking.service_id }); } catch {} }
    const online = !!quote?.online?.ready;
    host.innerHTML = `${d ? `<section class="reservation-card biz-deposit-card ${d.status}"><div class="reservation-section-title"><span>${E(Lang.t("العربون"))}</span>${pill(DEPOSIT_STATE, d.status)}</div>
        <div class="biz-deposit-amount"><strong>${E(money(d.amount))}</strong>${d.status === "pending" ? `<small>${E(pick(`ادفع قبل ${stamp(d.due_at)} لتثبيت موعدك`, `Pay before ${stamp(d.due_at)} to secure your appointment`, `יש לשלם עד ${stamp(d.due_at)} כדי לשריין את התור`))}</small>` : ""}</div>
        ${d.status === "pending" && d.instructions ? `<p class="biz-deposit-instr" data-i18n-skip>${E(d.instructions)}</p>` : ""}
        ${d.status === "pending" && online ? `<button class="btn" id="biz-pay-online">${UI.icon("globe", 17)} ${E(Lang.t("ادفع العربون إلكترونياً"))}</button>` : ""}
        ${Number(d.applied_amount) > 0 ? `<p class="tiny">${E(pick(`خُصم ${money(d.applied_amount)} من فاتورتك.`, `${money(d.applied_amount)} was deducted from your bill.`, `${money(d.applied_amount)} קוזזו מהחשבון.`))}</p>` : ""}
        ${Number(d.refund_due) > 0 ? `<p class="tiny">${E(pick(`سيُرجع لك ${money(d.refund_due)}.`, `${money(d.refund_due)} will be refunded to you.`, `יוחזרו לך ${money(d.refund_due)}.`))}</p>` : ""}
        ${Number(d.refunded_amount) > 0 ? `<p class="tiny">${E(pick(`أُرجع لك ${money(d.refunded_amount)}.`, `${money(d.refunded_amount)} was refunded.`, `הוחזרו ${money(d.refunded_amount)}.`))}</p>` : ""}${errorBox("biz-pay-err")}</section>` : ""}
      ${r ? `<section class="reservation-card"><div class="reservation-section-title"><span>${E(Lang.t("الفاتورة"))}</span>${pill(CHECKOUT_STATE, r.status)}</div>
        <div class="biz-deposit-amount"><strong>${E(money(r.total))}</strong><small dir="ltr">#${E(r.receipt_no)}</small></div>${Number(r.outstanding) > 0 && r.status !== "voided" ? `<p class="tiny">${E(Lang.t("المتبقي"))}: <b>${E(money(r.outstanding))}</b></p>` : ""}</section>` : ""}`;
    const pay = field("biz-pay-online");
    if (pay) pay.onclick = async () => {
      UI.busy("biz-pay-online", true);
      try {
        const i = await rpc("biz_start_online_payment", { p_token: App.token, p_purpose: "deposit", p_id: d.id });
        if (i.hosted_url) openExternal(i.hosted_url); else UI.toast("صفحة الدفع قيد التجهيز وستصلك في إشعار", "ok");
      } catch (e) { showError("biz-pay-err", e); } finally { UI.busy("biz-pay-online", false); }
    };
  }
  function openExternal(url) {
    if (!/^https:\/\//.test(url)) return;
    try { window.open(url, "_blank", "noopener"); } catch { location.href = url; }
  }

  // Before booking: what the deposit and the cancellation policy will be.
  async function depositNotice(host, serviceId) {
    if (!host) return;
    host.innerHTML = "";
    if (!serviceId || !Features.enabled("deposits")) return;
    let q; try { q = await rpc("biz_get_deposit_quote", { p_token: App.token || "", p_service: serviceId }); } catch { return; }
    if (!q?.required || !host.isConnected) return;
    if (q.currency) currency = q.currency;
    const hours = Lang.duration(Number(q.due_minutes) || 0);
    host.innerHTML = `<div class="biz-deposit-note">${UI.icon("lock", 18)}<div><b>${E(pick(`يتطلب هذا الموعد عربوناً بقيمة ${money(q.amount)}`, `This appointment needs a ${money(q.amount)} deposit`, `התור הזה דורש מקדמה של ${money(q.amount)}`))}</b>
      <small>${E(pick(`ادفعه خلال ${hours} من الحجز${q.auto_cancel ? "، وإلا يُلغى الحجز تلقائياً" : ""}. يُخصم من حسابك عند الزيارة.`, `Pay it within ${hours} of booking${q.auto_cancel ? ", otherwise the booking is cancelled automatically" : ""}. It is deducted from your bill at the visit.`, `יש לשלם תוך ${hours} מההזמנה${q.auto_cancel ? ", אחרת התור יבוטל אוטומטית" : ""}. היא מקוזזת מהחשבון בביקור.`))}</small>
      <small>${E(pick(`إلغاء مجاني حتى ${num(q.free_cancel_hours)} ساعة قبل الموعد. بعدها أو عند عدم الحضور ${q.late_cancel_action === "forfeit" ? "لا يُسترد العربون" : "يُسترد العربون"}.`, `Free cancellation up to ${num(q.free_cancel_hours)} hours before. After that, or on a no-show, the deposit ${q.late_cancel_action === "forfeit" ? "is not refunded" : "is refunded"}.`, `ביטול ללא עלות עד ${num(q.free_cancel_hours)} שעות לפני. לאחר מכן או באי־הגעה המקדמה ${q.late_cancel_action === "forfeit" ? "אינה מוחזרת" : "מוחזרת"}.`))}</small>
      ${q.instructions ? `<small data-i18n-skip>${E(q.instructions)}</small>` : ""}</div></div>`;
  }

  // ── Customer: waitlist ─────────────────────────────────────────────────
  function waitlistButton(opts) {
    if (!Features.enabled("smart_waitlist") || !opts?.service_id) return "";
    return `<button class="btn line fd-wl" data-join-waitlist="${E(JSON.stringify(opts))}">${UI.icon("clock", 17)} ${E(Lang.t("انضم لقائمة الانتظار"))}</button>`;
  }
  function wireWaitlistButtons(root = document) {
    root.querySelectorAll("[data-join-waitlist]").forEach(b => b.onclick = () => { try { joinWaitlist(JSON.parse(b.dataset.joinWaitlist)); } catch {} });
  }
  function joinWaitlist(opts) {
    if (!Auth.isLoggedIn()) { Router.signInPrompt?.(); return; }
    const key = requestKey();
    UI.modal(`<div class="mhead"><h3>${E(Lang.t("قائمة الانتظار"))}</h3><button class="iconbtn" id="jw-x" aria-label="إغلاق">${UI.icon("x", 20)}</button></div>
      <form class="mform" id="jw"><p class="muted">${E(Lang.t("عند توفر موعد يناسبك نرسل لك إشعاراً لتحجزه فوراً. الموعد يُعرض عليك لفترة محدودة ثم ينتقل للعميل التالي."))}</p>
        <div class="control-form"><label>${E(Lang.t("اليوم"))}<input class="input" type="date" id="jw-date" value="${E(opts.date || iso(new Date()))}" min="${E(iso(new Date()))}"></label>
        <label>${E(Lang.t("من الساعة"))}<input class="input" type="time" id="jw-from" value="09:00"></label><label>${E(Lang.t("إلى الساعة"))}<input class="input" type="time" id="jw-to" value="21:00"></label></div>
        <button class="btn" type="submit" id="jw-go">${E(Lang.t("انضم لقائمة الانتظار"))}</button>${errorBox("jw-err")}<div id="jw-available"></div></form>`);
    field("jw-x").onclick = UI.closeModal;
    field("jw").onsubmit = async e => {
      e.preventDefault(); UI.busy("jw-go", true);
      try {
        const r = await rpc("biz_join_waitlist", { p_token: App.token, p_data: { service_id: opts.service_id, barber_id: opts.barber_id || null, date: val("jw-date"), time_from: val("jw-from"), time_to: val("jw-to") }, p_request_key: key });
        if (r.available) {
          UI.busy("jw-go", false);
          field("jw-available").innerHTML = `<p class="sub-warning">${E(Lang.t("يوجد مواعيد متاحة الآن — احجز مباشرة:"))}</p>${r.available.map(a => `<div class="biz-chips"><b data-i18n-skip>${E(a.barber_name)}</b>${a.times.slice(0, 12).map(t => `<button type="button" class="chip" data-book-now="${E(a.barber_id)}">${E(t)}</button>`).join("")}</div>`).join("")}`;
          document.querySelectorAll("[data-book-now]").forEach(b => b.onclick = () => { UI.closeModal(); Router.go(`#/book/${encodeURIComponent(b.dataset.bookNow)}?service=${encodeURIComponent(opts.service_id)}`); });
          return;
        }
        UI.closeModal(); UI.toast("تمت إضافتك لقائمة الانتظار", "ok");
      } catch (err) { showError("jw-err", err); UI.busy("jw-go", false); }
    };
  }
  // 2.27: wait for one exact time with one specialist (a taken slot on the
  // booking page). If it frees up, this customer is offered exactly that time
  // first and it is held for them for a limited time.
  function joinSlot(opts, onJoined) {
    if (!Auth.isLoggedIn()) { Router.signInPrompt?.(); return; }
    const key = requestKey();
    const when = `${UI.dayName(opts.date)} ${UI.dateAr(opts.date)} · ${UI.timeAr(opts.time + ":00")}`;
    UI.modal(`<div class="mhead"><h3>${E(Lang.t("الانتظار على هذا الموعد"))}</h3><button class="iconbtn" id="js-x" aria-label="إغلاق">${UI.icon("x", 20)}</button></div>
      <div class="mform"><div class="wl-slot-card">${UI.icon("clock", 22)}<div><b>${E(when)}</b><small data-i18n-skip>${E(opts.service_name || "")}${opts.barber_name ? " · " + E(opts.barber_name) : ""}</small></div></div>
        <ol class="biz-steps"><li>${E(Lang.t("هذا الوقت محجوز الآن لعميل آخر."))}</li>
          <li>${E(Lang.t("إذا أُلغي أو تغيّر، نرسل لك إشعاراً فوراً — الأول في الانتظار يُعرض عليه أولاً."))}</li>
          <li>${E(Lang.t("يُحجز الموعد لك لفترة قصيرة لتؤكده بضغطة واحدة، ثم ينتقل للعميل التالي."))}</li></ol>
        <button class="btn" id="js-go">${UI.icon("bell", 17)} ${E(Lang.t("انضم لقائمة الانتظار"))}</button>${errorBox("js-err")}</div>`);
    field("js-x").onclick = UI.closeModal;
    field("js-go").onclick = async () => {
      UI.busy("js-go", true);
      try {
        const r = await rpc("biz_join_waitlist", { p_token: App.token, p_data: { service_id: opts.service_id, barber_id: opts.barber_id, date: opts.date, time: opts.time }, p_request_key: key });
        if (r.available) { UI.closeModal(); UI.toast("هذا الوقت أصبح متاحاً الآن — احجزه مباشرة", "ok"); onJoined?.("free"); return; }
        UI.closeModal(); UI.toast("تمت إضافتك لقائمة الانتظار على هذا الموعد", "ok"); onJoined?.("waiting");
      } catch (err) { showError("js-err", err); UI.busy("js-go", false); }
    };
  }
  // One waitlist entry, the same on the home page and on the full list.
  function waitItem(w, opts = {}) {
    return `<article class="card biz-wait ${w.status}"><div class="row between"><div><b data-i18n-skip>${E(w.service_name || "")}</b><small class="tiny" style="display:block"><span data-i18n-skip>${E(w.barber_name || Lang.t("أي مختص"))}</span> · ${E(day(w.preferred_date))} · ${w.exact ? `${E(Lang.t("الساعة"))} <b>${E(UI.timeAr(w.time_from + ":00"))}</b>` : `<span dir="ltr">${E(w.time_from)}–${E(w.time_to)}</span>`}</small></div>${pill(WAIT_STATE, w.status)}</div>
      ${w.offer ? `<div class="biz-offer">${UI.icon("bolt", 18)}<div><b>${E(pick(`موعد متاح: ${UI.timeAr(w.offer.time + ":00")} مع ${w.offer.barber_name}`, `Available: ${UI.timeAr(w.offer.time + ":00")} with ${w.offer.barber_name}`, `פנוי: ${UI.timeAr(w.offer.time + ":00")} אצל ${w.offer.barber_name}`))}</b><small>${E(pick(`احجزه قبل ${stamp(w.offer.expires_at)}`, `Book before ${stamp(w.offer.expires_at)}`, `יש להזמין עד ${stamp(w.offer.expires_at)}`))}</small></div></div>
        <div class="btn-row"><button class="btn" data-accept="${E(w.id)}">${E(Lang.t("احجز هذا الموعد"))}</button><button class="btn line" data-decline="${E(w.id)}">${E(Lang.t("ليس هذا الموعد"))}</button></div>` : ""}
      ${!opts.compact && ["waiting", "offered"].includes(w.status) ? `<button class="btn line sm" data-leave="${E(w.id)}">${E(Lang.t("الخروج من القائمة"))}</button>` : ""}
      ${!opts.compact && w.booking_id ? `<button class="btn line sm" data-nav="#/booking/${E(w.booking_id)}">${E(Lang.t("عرض الحجز"))}</button>` : ""}</article>`;
  }
  function wireWait(host, paint) {
    host.querySelectorAll("[data-accept]").forEach(b => b.onclick = async () => { b.disabled = true; try { const x = await rpc("biz_accept_waitlist", { p_token: App.token, p_id: b.dataset.accept }); if (x?.ok) { UI.toast("تم الحجز", "ok"); Router.go("#/booking/" + encodeURIComponent(x.id)); } else { UI.toast(x?.error || "لم يعد هذا الموعد متاحاً", "err"); await paint(); } } catch (e) { UI.toast(e.message, "err"); await paint(); } });
    host.querySelectorAll("[data-decline]").forEach(b => b.onclick = async () => { try { await rpc("biz_decline_waitlist", { p_token: App.token, p_id: b.dataset.decline }); UI.toast("سنبحث لك عن موعد آخر", "ok"); await paint(); } catch (e) { UI.toast(e.message, "err"); } });
    host.querySelectorAll("[data-leave]").forEach(b => b.onclick = () => UI.confirm(Lang.t("الخروج من قائمة الانتظار؟"), async () => { try { await rpc("biz_cancel_waitlist", { p_token: App.token, p_id: b.dataset.leave }); await paint(); } catch (e) { UI.toast(e.message, "err"); } }));
  }
  const holdNote = r => pick(`يمكنك أن تكون في ${num(r.max_active)} قوائم انتظار في نفس الوقت. يُحجز لك الموعد المعروض ${num(r.offer_minutes)} دقائق.`, `You can wait for up to ${num(r.max_active)} slots at once. An offered time is held for you for ${num(r.offer_minutes)} minutes.`, `אפשר להמתין לעד ${num(r.max_active)} תורים בו־זמנית. תור שמוצע לך שמור עבורך ${num(r.offer_minutes)} דקות.`);
  async function myWaitlist() {
    if (!Features.enabled("smart_waitlist")) { Router.go("#/home"); return; }
    UI.render(`${UI.header({ title: Lang.t("قائمة الانتظار"), back: "#/home" })}<div class="content"><div class="center-col" id="mw">${UI.loading()}</div></div>`);
    const paint = async () => {
      const host = field("mw"); if (!host) return;
      let r; try { r = await rpc("biz_list_my_waitlist", { p_token: App.token }); } catch (e) { host.innerHTML = `<div class="card">${E(e.message)}</div>`; return; }
      host.innerHTML = r.items.length ? `<div class="list">${r.items.map(w => waitItem(w)).join("")}</div><p class="tiny">${E(holdNote(r))}</p>`
        : UI.empty(Lang.t("لست في أي قائمة انتظار"), Lang.t("عندما لا تجد موعداً في يوم ممتلئ اضغط «انضم لقائمة الانتظار»."));
      wireWait(host, paint);
    };
    await paint();
  }
  // 2.32: the waitlist on the customer's home page. A time offered to this
  // customer comes first, with its buttons, so the 10 minutes are not missed;
  // otherwise one tile with the number of waits opens the full list.
  async function homeWaitlist(host) {
    if (!host || !Features.enabled("smart_waitlist") || !Auth.isLoggedIn() || Auth.isGuest()) { if (host) host.innerHTML = ""; return; }
    const draw = r => {
      if (!host.isConnected) return;
      const active = (r?.items || []).filter(w => ["waiting", "offered"].includes(w.status));
      const offers = active.filter(w => w.offer);
      host.innerHTML = `<section class="home-wait" aria-labelledby="home-wait-title">
        <button class="home-wait-tile" data-nav="#/waitlist"><span class="home-wait-icon">${UI.icon("clock", 18)}</span><span><b id="home-wait-title">${E(Lang.t("قائمة الانتظار"))}</b>
          <small>${E(active.length ? pick(`${num(active.length)} في الانتظار`, active.length === 1 ? "1 waiting" : `${num(active.length)} waiting`, `${num(active.length)} בהמתנה`) : Lang.t("يوم ممتلئ؟ انتظر موعداً وسنخبرك فور توفره"))}</small></span>${UI.icon("chev", 16)}</button>
        ${offers.map(w => waitItem(w, { compact: true })).join("")}</section>`;
      wireWait(host, () => homeWaitlist(host));
    };
    const cached = rpcStale("biz_list_my_waitlist", { p_token: App.token }, 15000);
    if (cached.value) draw(cached.value);
    try { draw(await cached.refresh); } catch { if (!cached.value) host.innerHTML = ""; }
  }

  // ── Customer: packages ─────────────────────────────────────────────────
  // Two views on one page: what the salon offers (ask to buy, pay at the
  // salon) and what this customer owns (sessions left, history, requests).
  const pkgPrice = (p, cat) => cat.show_prices === false ? "" : money(p.price);
  function pkgCard(p, cat, opts = {}) {
    const save = Number(p.value) > Number(p.price) ? Number(p.value) - Number(p.price) : 0;
    return `<article class="card pkg-card"><div class="pkg-card-top"><span class="pkg-badge">${UI.icon("star", 16)} ${E(pick(`${num(p.sessions)} جلسات`, `${num(p.sessions)} sessions`, `${num(p.sessions)} מפגשים`))}</span>${pkgPrice(p, cat) ? `<strong>${E(pkgPrice(p, cat))}</strong>` : ""}</div>
      <b class="pkg-name" data-i18n-skip>${E(p.name)}</b>${p.description ? `<p class="tiny" data-i18n-skip>${E(p.description)}</p>` : ""}
      <ul class="pkg-facts"><li>${UI.icon("scissors", 14)} <span data-i18n-skip>${E((p.services || []).map(x => x.name).join(pick("، ", ", ", ", ")))}</span></li>
        <li>${UI.icon("users", 14)} ${p.barbers?.length ? `<span data-i18n-skip>${E(p.barbers.map(b => b.name).join(pick("، ", ", ", ", ")))}</span>` : E(Lang.t("كل المختصين"))}</li>
        <li>${UI.icon("clock", 14)} ${p.validity_days ? E(pick(`صالحة ${num(p.validity_days)} يوماً من الشراء`, `Valid ${num(p.validity_days)} days from purchase`, `בתוקף ${num(p.validity_days)} ימים מהרכישה`)) : E(Lang.t("بدون انتهاء"))}</li>
        ${save && cat.show_prices !== false ? `<li>${UI.icon("tag", 14)} ${E(pick(`توفّر ${money(save)}`, `You save ${money(save)}`, `חוסכים ${money(save)}`))}</li>` : ""}</ul>
      ${opts.compact ? "" : p.requested ? `<p class="pkg-requested">${UI.icon("check", 15)} ${E(Lang.t("طلبت هذه الباقة — ادفع في العمل في زيارتك القادمة"))}</p>`
        : `<button class="btn" data-pkg-request="${E(p.id)}">${UI.icon("bag", 16)} ${E(Lang.t("أريد هذه الباقة"))}</button>`}</article>`;
  }
  function requestPackage(p, after) {
    if (!Auth.isLoggedIn()) { Router.signInPrompt?.(); return; }
    UI.modal(`<div class="mhead"><h3 data-i18n-skip>${E(p.name)}</h3><button class="iconbtn" id="rp-x" aria-label="إغلاق">${UI.icon("x", 20)}</button></div>
      <div class="mform"><ol class="biz-steps"><li>${E(Lang.t("نرسل طلبك للعمل الآن."))}</li><li>${E(Lang.t("تدفع ثمن الباقة في العمل في زيارتك القادمة."))}</li>
        <li>${E(Lang.t("بعد الدفع تظهر الباقة في «باقاتي» وتُخصم جلسة عند كل زيارة مشمولة."))}</li></ol>
        <div class="field"><label for="rp-note">${E(Lang.t("ملاحظة للعمل (اختياري)"))}</label><input class="input" id="rp-note" maxlength="300"></div>
        <button class="btn" id="rp-go">${E(Lang.t("إرسال الطلب"))}</button>${errorBox("rp-err")}</div>`);
    field("rp-x").onclick = UI.closeModal;
    field("rp-go").onclick = async () => {
      UI.busy("rp-go", true);
      try { await rpc("biz_request_package", { p_token: App.token, p_package: p.id, p_note: val("rp-note") }); UI.closeModal(); UI.toast("أُرسل طلبك للعمل", "ok"); after?.(); }
      catch (err) { showError("rp-err", err); UI.busy("rp-go", false); }
    };
  }
  // A short list of packages valid with one specialist (specialist profile).
  async function packageCatalog(host, barberId) {
    if (!host || !Features.enabled("service_packages")) return;
    let cat; try { cat = await rpc("biz_list_package_catalog", { p_token: App.token || "", p_barber: barberId || null }); } catch { return; }
    if (!host.isConnected || !cat.packages.length) { host.innerHTML = ""; return; }
    if (cat.currency || cat.symbol) currency = Money.fromSymbol(cat.currency) || Money.fromSymbol(cat.symbol) || currency;
    host.innerHTML = `<div class="section-title">${E(Lang.t("باقات الجلسات"))}</div><div class="pkg-strip">${cat.packages.slice(0, 4).map(p => pkgCard(p, cat, { compact: true })).join("")}</div>
      <button class="btn line" data-nav="#/packages">${E(Lang.t("عرض الباقات وطلب باقة"))}</button>`;
  }
  async function myPackages(params) {
    if (!Features.enabled("service_packages")) { Router.go("#/settings"); return; }
    let tab = params?.tab === "mine" ? "mine" : "offers";
    UI.render(`${UI.header({ title: Lang.t("الباقات"), back: Auth.isLoggedIn() ? "#/settings" : "#/home" })}<div class="content"><div class="center-col">
      ${UI.seg("pkg-tabs", [{ v: "offers", l: Lang.t("باقات العمل") }, { v: "mine", l: Lang.t("باقاتي") }], tab)}<div id="mp">${UI.loading()}</div></div></div>`);
    const paint = async () => {
      const host = field("mp"); if (!host) return; host.innerHTML = UI.loading();
      try {
        if (tab === "offers") {
          const cat = await rpc("biz_list_package_catalog", { p_token: App.token || "", p_barber: null });
          host.innerHTML = cat.packages.length ? `<p class="tiny">${E(Lang.t("اختر باقة واطلبها، وادفع في العمل. الجلسات تُخصم تلقائياً عند كل زيارة مشمولة."))}</p><div class="pkg-grid">${cat.packages.map(p => pkgCard(p, cat)).join("")}</div>`
            : UI.empty(Lang.t("لا توجد باقات حالياً"), Lang.t("سيضيف العمل باقاته هنا."));
          host.querySelectorAll("[data-pkg-request]").forEach(b => b.onclick = () => requestPackage(cat.packages.find(x => x.id === b.dataset.pkgRequest), paint));
        } else {
          if (!Auth.isLoggedIn()) { host.innerHTML = UI.empty(Lang.t("سجّل الدخول لعرض باقاتك"), ""); return; }
          const r = await rpc("biz_list_my_packages", { p_token: App.token });
          host.innerHTML = `${r.requests?.length ? `<div class="sec-label">${E(Lang.t("طلبات بانتظار الدفع في العمل"))}</div><div class="list">${r.requests.map(q => `<div class="card row between pkg-req"><div><b data-i18n-skip>${E(q.name)}</b><small class="tiny" style="display:block">${E(pick(`${num(q.sessions)} جلسات`, `${num(q.sessions)} sessions`, `${num(q.sessions)} מפגשים`))} · ${E(Lang.t("ادفع في زيارتك القادمة"))}</small></div><button class="btn line sm" data-req-cancel="${E(q.id)}">${E(Lang.t("إلغاء الطلب"))}</button></div>`).join("")}</div>` : ""}
            ${r.items.length ? `<div class="list">${r.items.map(p => `<article class="card biz-mypkg"><div class="row between"><b data-i18n-skip>${E(p.name)}</b>${pill(PACKAGE_STATE, p.status)}</div>
              <div class="biz-mypkg-count"><strong>${num(p.remaining)}</strong><small>${E(pick(`جلسات متبقية من ${num(p.sessions_total)}`, `sessions left of ${num(p.sessions_total)}`, `סשנים שנותרו מתוך ${num(p.sessions_total)}`))}</small></div>
              <div class="sub-bar"><i style="width:${Math.round(p.sessions_used / Math.max(p.sessions_total, 1) * 100)}%"></i></div>
              <p class="tiny"><span data-i18n-skip>${E((p.services || []).join(pick("، ", ", ", ", ")))}</span>${(p.barbers || []).length ? ` · <span data-i18n-skip>${E(p.barbers.join(pick("، ", ", ", ", ")))}</span>` : ""}${p.expires_on ? ` · ${E(Lang.t("صالحة حتى"))} ${E(day(p.expires_on))}` : ""}</p>
              ${(p.history || []).length ? `<details><summary>${E(Lang.t("سجل الاستخدام"))}</summary><ul class="biz-mini">${p.history.map(h => `<li><span data-i18n-skip>${E(h.service)}</span><small>${E(stamp(h.at))}</small></li>`).join("")}</ul></details>` : ""}</article>`).join("")}</div>
              <p class="tiny">${E(Lang.t("تُخصم جلسة عند إتمام كل زيارة مشمولة بالباقة في العمل."))}</p>`
            : r.requests?.length ? "" : UI.empty(Lang.t("لا توجد باقات"), Lang.t("اطلب باقة من «باقات العمل» وادفع في زيارتك القادمة."))}`;
          host.querySelectorAll("[data-req-cancel]").forEach(b => b.onclick = () => UI.confirm(Lang.t("إلغاء طلب الباقة؟"), async () => { try { await rpc("biz_cancel_package_request", { p_token: App.token, p_id: b.dataset.reqCancel }); await paint(); } catch (e) { UI.toast(e.message, "err"); } }));
        }
      } catch (e) { host.innerHTML = `<div class="card">${E(e.message)}</div>`; }
    };
    UI.wireSeg("pkg-tabs", v => { tab = v; history.replaceState(null, "", "#/packages?tab=" + v); paint(); });
    await paint();
  }

  // ── Specialist panel ───────────────────────────────────────────────────
  async function barberTab(body) {
    let c; try { c = await context(true); } catch (e) { body.innerHTML = `<div class="card">${E(e.message)}</div>`; return; }
    currency = c.currency || "ILS";
    const parts = [];
    if (on(c, "smart_checkout") && can(c, "checkout")) parts.push(["checkout", "الدفع اليوم"]);
    if (on(c, "deposits") && can(c, "deposits")) parts.push(["deposits", "العربون"]);
    if (on(c, "inventory") && can(c, "inventory")) parts.push(["inventory", "المخزون"]);
    else if (on(c, "inventory")) parts.push(["products", "المنتجات"]);
    if (on(c, "employee_commissions") && can(c, "own_commissions")) parts.push(["commissions", "عمولتي"]);
    if (!parts.length) { body.innerHTML = UI.empty(Lang.t("لا توجد أدوات مفعلة لك"), Lang.t("يحدد مدير العمل صلاحياتك من «صلاحيات الفريق».")); return; }
    let sub = parts[0][0];
    body.innerHTML = `${UI.seg("bb-tabs", parts.map(([v, l]) => ({ v, l: Lang.t(l) })), sub)}<div id="bb-body"></div>`;
    const paint = async () => {
      const host = field("bb-body"); if (!host) return; host.innerHTML = UI.loading();
      const s = SECTIONS.find(x => x.id === sub) || SECTIONS[0];
      try {
        if (sub === "checkout") await checkoutPage(host, c, s, { embedded: true });
        else if (sub === "deposits") await depositsPage(host, c, s, { embedded: true });
        else if (sub === "inventory") await inventoryPage(host, c, s, { embedded: true });
        else if (sub === "products") await staffProducts(host);
        else {
          const r = await rpc("barber_biz_report_commissions", { p_token: App.token, p_from: null, p_to: null });
          host.innerHTML = `<div class="biz-kpis"><article class="biz-kpi"><span>${E(Lang.t("العمولة التقديرية هذا الشهر"))}</span><strong>${E(money(r.summary.commission))}</strong></article>
            <article class="biz-kpi"><span>${E(Lang.t("المبيعات"))}</span><strong>${E(money(r.summary.revenue))}</strong></article><article class="biz-kpi"><span>${E(Lang.t("الخدمات"))}</span><strong>${num(r.summary.services)}</strong></article></div>
            ${r.lines.length ? `<ul class="biz-mini">${r.lines.map(l => `<li><span data-i18n-skip>${E(lineName(l.label))}</span><b>${E(money(l.amount))}</b><small dir="ltr">#${E(l.receipt_no)} · ${E(day(l.business_date))}</small></li>`).join("")}</ul>` : `<p class="tiny">${E(Lang.t("لا توجد عمولات هذا الشهر بعد."))}</p>`}`;
        }
      } catch (e) { host.innerHTML = `<div class="card">${E(e.message)}</div>`; }
    };
    UI.wireSeg("bb-tabs", v => { sub = v; paint(); });
    await paint();
  }
  // Any specialist: scan a product to see its saved name, price and details,
  // or find it by name (the same lookup the checkout uses).
  async function staffProducts(host) {
    host.innerHTML = `<div class="biz-actions-row"><button class="btn" id="sp-scan">${UI.icon("qr", 16)} ${E(Lang.t("مسح باركود"))}</button></div>
      <div class="card biz-toolbar"><input class="input" id="sp-q" placeholder="${E(Lang.t("ابحث عن منتج"))}" autocomplete="off"></div><div id="sp-list"></div>`;
    field("sp-scan").onclick = () => Workforce.scanProduct();
    let all = null;
    field("sp-q").oninput = async e => {
      const q = e.target.value.trim().toLowerCase(), box = field("sp-list"); if (!box) return;
      if (q.length < 2) { box.innerHTML = ""; return; }
      if (!all) { try { all = await rpc("list_products_v2", { p_only_active: true, p_limit: 200, p_offset: 0 }); } catch { all = []; } }
      const rows = all.filter(p => String(p.name || "").toLowerCase().includes(q)).slice(0, 20);
      box.innerHTML = rows.length ? `<div class="biz-rows">${rows.map(p => `<button class="biz-row clickable" data-sp="${E(p.id)}"><div class="biz-row-main"><b data-i18n-skip>${E(p.name)}</b></div><div class="biz-row-side"><strong>${E(money(p.price))}</strong>${UI.icon("chev", 16)}</div></button>`).join("")}</div>` : `<p class="tiny">${E(Lang.t("لا نتائج"))}</p>`;
      box.querySelectorAll("[data-sp]").forEach(b => b.onclick = () => { const p = rows.find(x => x.id === b.dataset.sp); Workforce.productView({ ...p, stock: p.stock }, { staff: true }); });
    };
  }
  // Does this specialist have anything in the Business tab?
  async function staffHasTools() {
    if (!available()) return false;
    try { const c = await context(); return on(c, "inventory") || ["checkout", "deposits", "inventory", "own_commissions"].some(p => can(c, p)); } catch { return false; }
  }

  function register(router) {
    router.add("#/waitlist", myWaitlist, { nav: true, guard: "auth" });
    router.add("#/packages", myPackages, { nav: true, guard: "browse" });
  }

  return { FEATURES, SECTIONS, available, context, hub, section, openCheckout, receipt, bookingPanel, customerBookingPanel, depositNotice, homeWaitlist,
    waitlistButton, wireWaitlistButtons, joinWaitlist, joinSlot, barberTab, staffHasTools, register, requestKey, settingsModal,
    packageCatalog, can: (c, p) => can(c, p), on: (c, f) => on(c, f) };
})();

/* Files from the browser or, in the apps, through the native share/print sheet.
   CSV with a UTF-8 BOM (Excel opens Arabic correctly), a real .xlsx built here
   (stored zip of SpreadsheetML), and PDF through the system print dialog. */
window.Exporter = (() => {
  "use strict";
  const enc = new TextEncoder();
  const cell = v => v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
  function csv(columns, rows) {
    const q = v => { const s = cell(v); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    return "﻿" + [columns.join(","), ...rows.map(r => columns.map(c => q(r[c])).join(","))].join("\r\n");
  }
  const xml = s => cell(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
  const colName = n => { let s = ""; n++; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
  function sheetXml(columns, rows) {
    const line = (values, r) => `<row r="${r}">${values.map((v, i) => {
      const ref = colName(i) + r;
      return typeof v === "number" || (typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v) && v.length < 16 && !/^0\d/.test(v))
        ? `<c r="${ref}"><v>${Number(v)}</v></c>` : `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xml(v)}</t></is></c>`;
    }).join("")}</row>`;
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${line(columns, 1)}${rows.map((r, i) => line(columns.map(c => r[c]), i + 2)).join("")}</sheetData></worksheet>`;
  }
  function xlsx(sheets) {
    const files = [];
    const names = sheets.map((s, i) => (String(s.name || "Sheet").replace(/[\\/?*[\]:]/g, " ").slice(0, 28) || "Sheet") + (sheets.slice(0, i).some(x => x.name === s.name) ? " " + (i + 1) : ""));
    files.push(["[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`]);
    files.push(["_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`]);
    files.push(["xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names.map((n, i) => `<sheet name="${xml(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`]);
    files.push(["xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}</Relationships>`]);
    sheets.forEach((s, i) => files.push([`xl/worksheets/sheet${i + 1}.xml`, sheetXml(s.columns, s.rows)]));
    return zip(files.map(([n, t]) => [n, enc.encode(t)]));
  }
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = bytes => { let c = 0xffffffff; for (let i = 0; i < bytes.length; i++) c = CRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  // A "stored" (uncompressed) zip: every reader opens it, nothing to depend on.
  function zip(entries) {
    const parts = [], central = []; let offset = 0;
    for (const [name, data] of entries) {
      const n = enc.encode(name), crc = crc32(data), h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
      h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, n.length, true);
      parts.push(new Uint8Array(h.buffer), n, data);
      const c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true);
      c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, n.length, true); c.setUint32(42, offset, true);
      central.push(new Uint8Array(c.buffer), n);
      offset += 30 + n.length + data.length;
    }
    const size = central.reduce((s, p) => s + p.length, 0), end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, entries.length, true); end.setUint16(10, entries.length, true); end.setUint32(12, size, true); end.setUint32(16, offset, true);
    const all = [...parts, ...central, new Uint8Array(end.buffer)], out = new Uint8Array(all.reduce((s, p) => s + p.length, 0));
    let at = 0; for (const p of all) { out.set(p, at); at += p.length; }
    return out;
  }
  const toBase64 = bytes => { let s = ""; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); };
  async function save(name, mime, data) {
    const bytes = typeof data === "string" ? enc.encode(data) : data;
    if (bytes.length > 11_000_000) throw new Error(Lang.t("الملف كبير جداً، صدّر فترة أقصر"));
    if (window.NativeBridge?.available()) {
      try { await NativeBridge.request("shareFile", { name, mime: mime.split(";")[0], base64: toBase64(bytes) }); return; }
      catch (e) { if (!/غير مدعومة|Unsupported/i.test(e.message || "")) throw e; throw new Error(Lang.t("حدّث التطبيق لتصدير الملفات، أو صدّرها من نسخة الويب")); }
    }
    const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
    const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  // PDF: a clean printable document. The system dialog saves it as PDF.
  async function print(title, bodyHtml) {
    const dir = document.documentElement.dir || "rtl", lang = document.documentElement.lang || "ar";
    const html = `<!doctype html><html lang="${lang}" dir="${dir}"><head><meta charset="utf-8"><title>${xml(title)}</title><style>
      body{font-family:"Noto Sans Arabic","Segoe UI",Tahoma,Arial,sans-serif;color:#111;margin:28px;font-size:13px;line-height:1.5}
      h1{font-size:20px;margin:0 0 6px}h2{font-size:15px;margin:18px 0 6px}table{width:100%;border-collapse:collapse;margin:8px 0}
      td,th{border-bottom:1px solid #ddd;padding:6px 8px;text-align:start;vertical-align:top}th{background:#f4f4f4}
      .biz-total-row{display:flex;justify-content:space-between;border-bottom:1px solid #eee;padding:4px 0}.biz-total-row.strong{font-weight:700;font-size:15px}
      .badge{border:1px solid #999;border-radius:8px;padding:0 6px;font-size:11px}.biz-mini{list-style:none;padding:0}.biz-mini li{display:flex;gap:10px;justify-content:space-between;border-bottom:1px solid #eee;padding:4px 0}
      .biz-receipt-meta{display:flex;justify-content:space-between;gap:16px;margin-bottom:10px}.biz-receipt-meta div{display:flex;flex-direction:column}
      .note{color:#555;font-size:11px;margin-top:16px}svg{display:none}button{display:none}</style></head><body>${bodyHtml}</body></html>`;
    if (window.NativeBridge?.available()) {
      try { await NativeBridge.request("printHtml", { title, html }); return; }
      catch (e) { UI.toast(/غير مدعومة|Unsupported/i.test(e.message || "") ? Lang.t("حدّث التطبيق لحفظ PDF، أو استخدم نسخة الويب") : e.message, "err"); return; }
    }
    const frame = document.createElement("iframe");
    frame.setAttribute("aria-hidden", "true"); frame.style.cssText = "position:fixed;inset-inline-start:-9999px;width:1px;height:1px;border:0";
    document.body.appendChild(frame);
    frame.srcdoc = html;
    frame.onload = () => { try { frame.contentWindow.focus(); frame.contentWindow.print(); } finally { setTimeout(() => frame.remove(), 60000); } };
  }
  return { csv, xlsx, zip, crc32, save, print };
})();
