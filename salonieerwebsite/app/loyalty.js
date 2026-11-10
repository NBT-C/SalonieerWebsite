/* Loyalty Coins (per salon) and plan usage for salon owners.
   Customer wallet  : #/loyalty — balance, expiry, history, rewards, redemption.
   Salon management : Admin tab "loyalty" — settings, per-service coin rules,
                      rewards, redemptions and recorded product purchases.
                      A customer's balance is adjusted from the Users page
                      (customerCoins).
   Plan usage       : read-only plan/Specialist summary for the salon owner.
   Every screen reads and writes the salon's own server tables; the server
   re-checks the Loyalty entitlement on every call. */
window.Loyalty = (() => {
  "use strict";
  const E = value => UI.esc(value);
  const num = n => (Number(n) || 0).toLocaleString(Lang.locale());
  const isPlatform = () => !!window.Control?.target();
  const adminToken = () => isPlatform() ? "__platform__" : App.token;
  const salonSlug = () => window.Control?.target()?.slug || Shop.slug();
  const field = id => document.getElementById(id);
  const val = id => (field(id)?.value ?? "").trim();
  // A single key per intended action: retries and double taps reuse it, so the
  // server can never charge or credit the same request twice.
  const requestKey = () => (window.crypto?.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 12));
  const TX = {
    earn: ["مكتسبة", "Earned", "ok"], redeem: ["استبدال", "Redeemed", "info"], reversal: ["عكس", "Reversed", "warn"],
    refund: ["استرجاع", "Refunded", "ok"], expire: ["انتهت الصلاحية", "Expired", "muted"], adjust: ["تعديل يدوي", "Adjustment", "warn"],
  };
  const RSTATUS = { pending: ["بانتظار التسليم", "Pending", "warn"], fulfilled: ["تم التسليم", "Fulfilled", "ok"], cancelled: ["ملغى ومسترجع", "Cancelled", "muted"] };
  const TARGET = { service: ["خدمة", "Service"], product: ["منتج", "Product"], reward: ["مكافأة", "Reward"] };
  const pill = (map, key) => { const p = map[key] || [key, key, "muted"]; return `<span class="badge ${p[2] || "muted"}">${E(Lang.localized(p[0], p[1]))}</span>`; };
  const coinsName = s => Lang.localized(s?.currency_name_ar || "نقاط", s?.currency_name_en || "Coins");
  const when = d => d ? `${UI.dateAr(String(d).slice(0, 10))}` : "";
  const adminBase = () => window.Control?.target() ? "#/platform/salon/" + Control.target().slug : "#/admin";

  // ── Customer entry points ───────────────────────────────────────────────
  function homeChip() {
    if (!Features.enabled("loyalty")) return "";
    const cached = rpcPeek("loyalty_wallet", { p_token: App.token });
    return `<button class="loy-home" data-nav="#/loyalty" aria-label="محفظة النقاط">${UI.icon("star", 20)}<span><small>محفظة النقاط · Loyalty Coins</small><b id="loy-home-balance">${cached ? `${num(cached.balance)} ${E(coinsName(cached.settings))}` : "…"}</b></span>${UI.icon("chev", 18)}</button>`;
  }
  function fillHomeChip() {
    if (!Features.enabled("loyalty") || !field("loy-home-balance")) return;
    rpcCached("loyalty_wallet", { p_token: App.token }, 20000).then(w => {
      const el = field("loy-home-balance"); if (el) el.textContent = `${num(w.balance)} ${coinsName(w.settings)}`;
    }).catch(() => { document.querySelector(".loy-home")?.remove(); });
  }

  async function wallet(params = {}) {
    if (!Features.enabled("loyalty")) { Router.go("#/home"); return; }
    let tab = ["redeem", "history", "requests"].includes(params.tab) ? params.tab : "redeem";
    let w = await rpc("loyalty_wallet", { p_token: App.token });
    const HPAGE = 10;
    let historyRows = w.history.slice(0, HPAGE), historyPage = 0, historyNext = w.history.length > HPAGE;
    const s = w.settings;
    const earnRules = () => {
      const rules = [];
      if (s.coins_per_booking > 0) rules.push(`${num(s.coins_per_booking)} لكل حجز مكتمل`);
      if (s.coins_per_spend_unit > 0 && Number(s.spend_unit_amount) > 0) rules.push(`${num(s.coins_per_spend_unit)} لكل ${num(s.spend_unit_amount)} تنفقها`);
      if (s.coins_per_product_purchase > 0) rules.push(`${num(s.coins_per_product_purchase)} لكل عملية شراء منتج`);
      return rules;
    };
    function card(kind, item) {
      const can = s.redemption_enabled && w.balance >= item.coin_price && w.balance >= s.min_redeem_coins
        && (item.available !== false) && (item.in_stock !== false)
        && (!s.max_redeem_per_transaction || item.coin_price <= s.max_redeem_per_transaction);
      const reason = !s.redemption_enabled ? "الاستبدال متوقف حالياً"
        : item.available === false || item.in_stock === false ? "غير متوفر حالياً"
        : s.max_redeem_per_transaction && item.coin_price > s.max_redeem_per_transaction ? `أعلى من حد العملية (${num(s.max_redeem_per_transaction)})`
        : w.balance < s.min_redeem_coins ? `يلزم رصيد ${num(s.min_redeem_coins)} للبدء`
        : w.balance < item.coin_price ? `ينقصك ${num(item.coin_price - w.balance)}` : "";
      return `<article class="loy-item">${item.image_url ? UI.img(item.image_url, { className: "loy-item-img", alt: "" }) : `<span class="loy-item-icon">${UI.icon(kind === "service" ? "scissors" : kind === "product" ? "bag" : "star", 22)}</span>`}
        <div class="loy-item-main"><small>${E(TARGET[kind][0])} · ${E(TARGET[kind][1])}</small><b>${E(item.name)}</b>${item.description ? `<p>${E(item.description)}</p>` : ""}</div>
        <div class="loy-item-side"><strong>${num(item.coin_price)}</strong><small>${E(coinsName(s))}</small>
          ${kind === "service"
            ? `<button class="btn sm" data-book-service="${E(item.id)}" ${can && (item.barbers || []).length ? "" : "disabled"}>احجز بالنقاط</button>${!(item.barbers || []).length ? '<small class="tiny">لا يوجد مختص متاح لهذه الخدمة</small>' : reason ? `<small class="tiny">${E(reason)}</small>` : '<small class="tiny">تُخصم النقاط عند تأكيد الحجز</small>'}`
            : `<button class="btn sm" data-redeem="${E(kind)}:${E(item.id)}" ${can ? "" : "disabled"}>استبدال</button>${reason ? `<small class="tiny">${E(reason)}</small>` : ""}`}</div></article>`;
    }
    function paint() {
      const cat = w.catalog, items = [...cat.rewards.map(r => card("reward", r)), ...cat.services.map(x => card("service", x)), ...cat.products.map(x => card("product", x))];
      const rules = earnRules();
      UI.render(`${UI.header({ title: "محفظة النقاط", sub: "Loyalty Coins · " + (App.settings?.app_name || ""), back: "#/settings" })}
        <div class="content"><div class="center-col loy-wallet">
          <section class="loy-balance" aria-live="polite"><small>رصيدك في هذا العمل · Your balance</small>
            <strong id="loy-balance">${num(w.balance)}</strong><span>${E(coinsName(s))}</span>
            <div class="loy-balance-meta"><span>مكتسب إجمالاً ${num(w.lifetime_earned)}</span><span>مستبدل ${num(w.lifetime_redeemed)}</span></div>
            ${w.expiring.length ? `<ul class="loy-expiring">${w.expiring.map(x => `<li>${num(x.coins)} تنتهي في ${when(x.expires_at)}</li>`).join("")}</ul>` : s.expiry_days ? `<p class="tiny">تنتهي صلاحية النقاط بعد ${num(s.expiry_days)} يوماً من اكتسابها.</p>` : ""}
          </section>
          ${rules.length && s.earning_enabled ? `<p class="loy-rules">${UI.icon("info", 16)} تكسب ${E(rules.join("، "))}. تُضاف النقاط بعد اكتمال الزيارة أو الشراء.</p>` : !s.earning_enabled ? '<p class="loy-rules">اكتساب النقاط متوقف مؤقتاً في هذا العمل.</p>' : ""}
          ${s.redeem_services && s.redemption_enabled ? `<p class="loy-rules">${UI.icon("scissors", 16)} لدفع خدمة بالنقاط اختر «ادفع بنقاط الولاء» في صفحة الحجز، وسيظهر الموعد مجانياً لك وللمختص.</p>` : ""}
          ${UI.seg("loy-tabs", [{ v: "redeem", l: "الاستبدال" }, { v: "history", l: "السجل" }, { v: "requests", l: "طلباتي" }], tab)}
          <div id="loy-tab"></div>
        </div></div>`);
      UI.wireSeg("loy-tabs", v => { tab = v; paintTab(); });
      paintTab();
      function paintTab() {
        const host = field("loy-tab"); if (!host) return;
        if (tab === "redeem") {
          const vouchers = w.redemptions.filter(r => r.target_type === "service" && r.status === "pending" && !r.booking_id);
          host.innerHTML = `${vouchers.length ? `<section class="loy-vouchers"><h3>${UI.icon("check", 16)} قسائم خدمات جاهزة للحجز</h3>${vouchers.map(r => {
              const svc = w.catalog.services.find(x => x.id === r.service_id);
              return `<div class="loy-voucher"><div><b>${E(r.target_label)}</b><small>مدفوعة بـ ${num(r.coins)} ${E(coinsName(s))} · احجز وسيكون الموعد مجانياً</small></div>
                <div class="loy-request-side">${svc && (svc.barbers || []).length ? `<button class="btn sm" data-book-service="${E(r.service_id)}">احجز الآن</button>` : ""}<button class="btn line sm" data-cancel="${E(r.id)}">استرجاع النقاط</button></div></div>`;
            }).join("")}</section>` : ""}
            ${items.length ? `<div class="loy-items">${items.join("")}</div>${s.min_redeem_coins ? `<p class="tiny">الحد الأدنى للرصيد قبل الاستبدال: ${num(s.min_redeem_coins)}.</p>` : ""}`
            : vouchers.length ? "" : UI.empty("لا توجد مكافآت متاحة الآن", "سيضيف العمل المكافآت والخدمات القابلة للاستبدال قريباً.")}`;
          host.querySelectorAll("[data-redeem]").forEach(b => b.onclick = () => { const [kind, id] = b.dataset.redeem.split(":"); confirmRedeem(kind, id); });
          host.querySelectorAll("[data-book-service]").forEach(b => b.onclick = () => bookService(b.dataset.bookService));
          wireCancel(host);
        } else if (tab === "history") {
          host.innerHTML = historyRows.length ? `<ol class="loy-history">${historyRows.map(t => `<li><div>${pill(TX, t.type)}<b>${E(t.label || t.reason || "")}</b><small class="tiny">${E(new Date(t.created_at).toLocaleString(Lang.locale()))}${t.expires_at && t.coins > 0 ? " · " + Lang.t("تنتهي") + " " + when(t.expires_at) : ""}</small></div>
            <strong class="${t.coins > 0 ? "plus" : "minus"}" dir="ltr">${t.coins > 0 ? "+" : ""}${num(t.coins)}</strong></li>`).join("")}</ol>${UI.pager(historyPage, historyNext)}`
            : UI.empty("لا توجد حركات بعد", "ستظهر هنا النقاط المكتسبة والمستبدلة.");
          UI.wirePager(async () => { if (historyPage > 0) { historyPage--; await loadHistory(); paintTab(); } }, async () => { if (historyNext) { historyPage++; await loadHistory(); paintTab(); } });
        } else {
          const row = r => {
            const booked = r.target_type === "service" && r.booking_id;
            const state = booked && r.status === "pending" ? `<span class="badge info">${E(Lang.t("مرتبطة بحجز"))}</span>`
              : r.target_type === "service" && r.status === "pending" ? `<span class="badge warn">${E(Lang.t("قسيمة جاهزة"))}</span>` : pill(RSTATUS, r.status);
            return `<div class="card loy-request ${r.status === "cancelled" ? "muted" : ""}"><div><b>${E(r.target_label)}</b><small class="tiny">${E(TARGET[r.target_type]?.[0] || "")} · ${E(new Date(r.created_at).toLocaleString(Lang.locale()))}</small></div>
              <div class="loy-request-side"><strong>${num(r.coins)}</strong>${state}
              ${booked ? `<button class="btn line sm" data-nav="#/booking/${E(r.booking_id)}">عرض الحجز</button>` : ""}
              ${r.status === "pending" && !booked ? `<button class="btn line sm" data-cancel="${E(r.id)}">إلغاء واسترجاع</button>` : ""}</div></div>`;
          };
          const open = w.redemptions.filter(r => r.status === "pending"), past = w.redemptions.filter(r => r.status !== "pending");
          host.innerHTML = w.redemptions.length ? `${open.length ? `<div class="sec-label">الطلبات النشطة</div><div class="list">${open.map(row).join("")}</div>` : ""}
            ${past.length ? `<div class="sec-label">السابقة</div><div class="list">${past.map(row).join("")}</div>` : ""}
            <p class="tiny">اعرض طلبك في العمل ليتم تسليمه. يمكنك إلغاء الطلب واسترجاع نقاطك قبل التسليم فقط. الخدمات المدفوعة بالنقاط ترتبط بالحجز، وإلغاء الحجز يعيد النقاط تلقائياً.</p>`
            : UI.empty("لا توجد طلبات", "عند استبدال نقاطك يظهر الطلب هنا.");
          wireCancel(host);
        }
      }
      function wireCancel(host) {
        host.querySelectorAll("[data-cancel]").forEach(b => b.onclick = () => UI.confirm("إلغاء هذا الطلب واسترجاع النقاط إلى رصيدك؟", async () => {
          try { await rpc("loyalty_cancel_redemption", { p_token: App.token, p_id: b.dataset.cancel }); UI.toast("تم الإلغاء واسترجاع النقاط", "ok"); await reload(); }
          catch (e) { UI.toast(e.message, "err"); }
        }));
      }
      // A service is paid with coins while booking it, so the appointment is
      // created as free and the specialist is told so.
      function bookService(serviceId) {
        const svc = w.catalog.services.find(x => x.id === serviceId);
        const barbers = svc?.barbers || [];
        if (!barbers.length) { UI.toast("لا يوجد مختص متاح لهذه الخدمة حالياً", "err"); return; }
        const go = id => { UI.closeModal(); Router.go(`#/book/${encodeURIComponent(id)}?service=${encodeURIComponent(serviceId)}`); };
        if (barbers.length === 1) { go(barbers[0].id); return; }
        UI.modal(`<div class="mhead"><h3>اختر المختص · ${E(svc.name)}</h3><button class="iconbtn" id="loy-bx" aria-label="إغلاق">${UI.icon("x", 20)}</button></div>
          <div class="list">${barbers.map(b => `<button class="lrow" data-pick-barber="${E(b.id)}"><div class="ic">${UI.icon("user", 18)}</div><div class="t">${E(b.name)}</div><span class="chev">${UI.icon("chev", 18)}</span></button>`).join("")}</div>`);
        field("loy-bx").onclick = UI.closeModal;
        document.querySelectorAll("[data-pick-barber]").forEach(b => b.onclick = () => go(b.dataset.pickBarber));
      }
    }
    async function loadHistory() { historyRows = await rpc("loyalty_history", { p_token: App.token, p_limit: HPAGE, p_offset: historyPage * HPAGE }); historyNext = historyRows.length === HPAGE; }
    async function reload() { rpcCacheBust("loyalty_wallet"); w = await rpc("loyalty_wallet", { p_token: App.token }); historyRows = w.history.slice(0, HPAGE); historyPage = 0; historyNext = w.history.length > HPAGE; paint(); }
    function confirmRedeem(kind, id) {
      const list = kind === "reward" ? w.catalog.rewards : kind === "service" ? w.catalog.services : w.catalog.products;
      const item = list.find(x => x.id === id); if (!item) return;
      const key = requestKey();
      UI.modal(`<div class="mhead"><h3>تأكيد الاستبدال</h3><button class="iconbtn" id="loy-x" aria-label="إغلاق">${UI.icon("x", 20)}</button></div>
        <div class="mform"><p><b>${E(item.name)}</b></p><p class="muted">سيتم خصم <b>${num(item.coin_price)} ${E(coinsName(s))}</b> من رصيدك (${num(w.balance)}). الرصيد بعد الاستبدال: ${num(w.balance - item.coin_price)}.</p>
        <button class="btn" id="loy-go">تأكيد · Confirm</button><p class="form-error" id="loy-err" role="alert"></p></div>`);
      field("loy-x").onclick = UI.closeModal;
      field("loy-go").onclick = async () => {
        UI.busy("loy-go", true); field("loy-err").textContent = "";
        try {
          await rpc("loyalty_redeem", { p_token: App.token, p_target_type: kind, p_target_id: id, p_request_key: key });
          UI.closeModal(); UI.toast("تم الاستبدال. اعرض الطلب في العمل", "ok"); tab = "requests"; await reload();
        } catch (e) { field("loy-err").textContent = e.message; UI.busy("loy-go", false); }
      };
    }
    paint();
  }

  // ── Plan usage (salon owner, read-only) ─────────────────────────────────
  async function usage() {
    return Push.call("plan_usage", { p_slug: salonSlug(), p_token: adminToken() }, isPlatform());
  }
  function limitMessage(spec) {
    if (!spec) return "";
    if (spec.unlimited) return `${num(spec.active)} مختص نشط · عدد غير محدود في باقتك`;
    return `${num(spec.active)} من ${num(spec.limit)} مختص نشط`;
  }
  async function specialistBanner(host) {
    if (!host) return null;
    let u;
    try { u = await usage(); } catch { host.innerHTML = ""; return null; }
    if (!host.isConnected) return u;
    const spec = u.specialists, blocked = !spec.can_add, inactive = !u.subscription.good_standing;
    const pct = spec.unlimited ? 10 : Math.min(100, Math.round(spec.active / Math.max(spec.limit, 1) * 100));
    host.innerHTML = `<div class="loy-limit ${blocked ? "blocked" : ""}" role="status"><div><b>${E(limitMessage(spec))}</b>
      <small>باقة ${E(Lang.localized(u.plan.code === "enterprise" ? "وصول كامل" : u.plan.name_ar || "", u.plan.code === "enterprise" ? "Full Access" : u.plan.name_en || ""))}${!spec.unlimited ? ` · <span>${num(spec.included)} في الباقة + ${num(spec.purchased)} مختص إضافي</span>${spec.override !== null ? ` · <span>حد مخصص ${num(spec.override)}</span>` : ""}` : ""}</small></div>
      <div class="sub-bar ${spec.over_limit ? "over" : ""}" aria-hidden="true"><i style="width:${pct}%"></i></div>
      ${inactive ? '<p>اشتراك العمل غير نشط، لذلك لا يمكن إضافة أو تفعيل مختصين حالياً. تواصل مع إدارة METON.</p>'
        : spec.over_limit ? `<p>عدد المختصين النشطين أعلى من الحد (${num(spec.limit)}). لم يُحذف أحد، لكن لا يمكن إضافة مختص جديد قبل إيقاف ${num(spec.active - spec.limit)} أو إضافة مختصين إضافيين.</p>`
        : blocked ? `<p>وصلت إلى الحد الأقصى لعدد المختصين في باقتك (${num(spec.limit)}). أوقف مختصاً أو تواصل مع إدارة METON لإضافة مختصين إضافيين.</p>` : ""}</div>`;
    return u;
  }
  async function planCard(host) {
    if (!host) return;
    let u;
    try { u = await usage(); } catch (e) { host.innerHTML = ""; return; }
    if (!host.isConnected) return;
    const src = { plan: "من الباقة", addon: "إضافة مخصصة", override: "من إدارة METON", none: "غير مشمولة" };
    host.innerHTML = `<section class="card loy-plan"><div class="loy-plan-head"><div><small>باقة العمل · Plan</small><h3>${E(Lang.localized(u.plan.code === "enterprise" ? "وصول كامل" : u.plan.name_ar || "", u.plan.code === "enterprise" ? "Full Access" : u.plan.name_en || ""))}</h3></div>
<span class="badge ${u.subscription.good_standing ? "ok" : "warn"}">${E({ active: "نشط", trial: "تجريبي", suspended: "موقوف", expired: "منتهي", cancelled: "ملغى", scheduled: "لم يبدأ" }[u.subscription.effective_status] || u.subscription.effective_status)}</span></div>
      <p class="tiny">${E(limitMessage(u.specialists))}${u.subscription.expires_on ? ` · ينتهي الاشتراك ${when(u.subscription.expires_on)}` : ""}</p>
      <ul class="loy-plan-features">${Object.entries(u.features).filter(([, f]) => f.enabled).map(([key, f]) => `<li class="${f.enabled ? "on" : "off"}"><span>${E(Lang.localized(u.labels[key]?.ar || key, u.labels[key]?.en || key))}</span><small>${f.enabled ? "مفعّلة" : "غير مفعّلة"} · ${E(src[f.source] || f.source)}${f.expires_on ? " حتى " + when(f.expires_on) : ""}</small></li>`).join("")}</ul>
      <p class="tiny">تفعيل الميزات المدفوعة أو إضافة مختصين إضافيين يتم عبر إدارة METON.</p>
      ${window.Plans ? `<button type="button" class="btn line sm" id="plans-compare">${UI.icon("list", 15)} ${E(Lang.t("مقارنة الباقات"))}</button>` : ""}</section>`;
    // 2.32: what each plan includes, explained (plans.js).
    const code = u.plan.code;
    host.querySelector("#plans-compare")?.addEventListener("click", () => Plans.open(["full_access", "enterprise"].includes(code) ? "enterprise" : code));
  }

  // ── Salon management tab ────────────────────────────────────────────────
  async function adminTab(body, sub = "overview") {
    const tok = adminToken();
    let o;
    try { o = await rpc("admin_loyalty_overview", { p_token: tok }); }
    catch (e) { body.innerHTML = `<div class="card">${E(e.message)}</div>`; return; }
    const s = o.settings;
    // "Awaiting delivery" means what the salon hands over from the wallet.
    // Servers before 2.18 also counted services paid with coins, which belong
    // to their booking; count the wallet requests here so the number matches
    // the requests page either way.
    if (!o.services.some(x => "earns" in x) && o.stats.pending_redemptions > 0) {
      try {
        const pending = await rpc("admin_loyalty_redemptions", { p_token: tok, p_status: "pending", p_limit: 100, p_offset: 0 });
        o.stats.pending_redemptions = (pending || []).filter(r => r.target_type !== "service").length;
      } catch {}
    }
    // Customer balances are adjusted from the Users page (tap a customer).
    const tabs = [{ v: "overview", l: "الإعدادات" }, { v: "prices", l: "أسعار النقاط" }, { v: "rewards", l: "المكافآت" }];
    if (o.shop_enabled) tabs.push({ v: "purchases", l: "مشتريات المنتجات" });
    if (!tabs.some(t => t.v === sub)) sub = "overview";
    const kpi = (value, label, icon, tone) => `<article class="admin-kpi ${tone}"><div class="admin-kpi-head"><span>${label}</span><i>${UI.icon(icon, 17)}</i></div><strong>${value}</strong><small>${E(coinsName(s))}</small></article>`;
    body.innerHTML = `<section class="admin-overview-hero"><div><span class="admin-eyebrow">LOYALTY COINS</span><h1>نقاط الولاء</h1><p>محفظة مستقلة لكل عميل في هذا العمل فقط. تُضاف النقاط بعد اكتمال الزيارة أو الشراء.</p></div></section>
      <div class="admin-kpi-grid">${kpi(num(o.stats.outstanding), "رصيد العملاء القائم", "star", "gold")}${kpi(num(o.stats.earned_30d), "مكتسبة خلال 30 يوماً", "chart", "blue")}${kpi(num(o.stats.redeemed_30d), "مستبدلة خلال 30 يوماً", "bag", "violet")}${kpi(num(o.stats.pending_redemptions), "طلبات بانتظار التسليم", "clock", "amber")}</div>
      ${o.errors.length ? `<p class="sub-warning" role="alert">تعذّر احتساب نقاط ${num(o.errors.length)} حجز مؤخراً: ${E(o.errors[0].message)}</p>` : ""}
      <button class="loy-queue-link" data-nav="${adminBase()}/redemptions">${UI.icon("bag", 18)}<span><b>طلبات الاستبدال من المحفظة</b><small>${num(o.stats.pending_redemptions)} بانتظار التسليم</small></span>${UI.icon("chev", 18)}</button>
      ${UI.seg("loy-admin-tabs", tabs, sub)}<div id="loy-admin-body" class="loy-admin-body"></div>`;
    UI.wireSeg("loy-admin-tabs", v => { sub = v; paintSub(); });
    const refresh = async () => adminTab(body, sub);
    paintSub();

    function paintSub() {
      const host = field("loy-admin-body"); if (!host) return;
      ({ overview, prices, rewards, purchases })[sub](host);
    }
    function overview(host) {
      const sw = (id, label, on) => `<label class="notification-toggle"><span>${label}</span><input type="checkbox" id="${id}" ${on ? "checked" : ""}></label>`;
      host.innerHTML = `<form class="card loy-form" id="loy-settings"><h3>إعدادات النقاط · Settings</h3>
        ${sw("ls-earn", "تفعيل اكتساب النقاط · Earning active", s.earning_enabled)}${sw("ls-redeem", "تفعيل الاستبدال · Redemption active", s.redemption_enabled)}
        <div class="control-form">
          <label>اسم العملة بالعربية<input class="input" id="ls-name-ar" maxlength="30" value="${E(s.currency_name_ar)}" required></label>
          <label>Currency name (English)<input class="input" id="ls-name-en" maxlength="30" dir="ltr" value="${E(s.currency_name_en)}" required></label>
          <label>نقاط لكل حجز مكتمل · Per completed booking<input class="input" type="number" min="0" step="1" id="ls-booking" value="${s.coins_per_booking}"></label>
          <label>نقاط لكل عملية شراء منتج · Per product purchase<input class="input" type="number" min="0" step="1" id="ls-product" value="${s.coins_per_product_purchase}"></label>
          <label>لكل مبلغ إنفاق · Per amount spent<input class="input" type="number" min="0" step="0.01" id="ls-unit" value="${s.spend_unit_amount}" placeholder="0 = متوقف"></label>
          <label>عدد النقاط لذلك المبلغ · Coins for that amount<input class="input" type="number" min="0" step="1" id="ls-unit-coins" value="${s.coins_per_spend_unit}"></label>
          <label>أدنى رصيد للاستبدال · Minimum to redeem<input class="input" type="number" min="0" step="1" id="ls-min" value="${s.min_redeem_coins}"></label>
          <label>أقصى نقاط في العملية · Max per transaction<input class="input" type="number" min="1" step="1" id="ls-max" value="${s.max_redeem_per_transaction ?? ""}" placeholder="بدون حد"></label>
          <label>صلاحية النقاط بالأيام · Expiry (days)<input class="input" type="number" min="1" max="3650" step="1" id="ls-expiry" value="${s.expiry_days ?? ""}" placeholder="لا تنتهي"></label>
        </div>
        <fieldset class="loy-fieldset"><legend>ما يمكن الاستبدال به · Redeemable for</legend>
          ${sw("ls-r-services", "دفع الخدمات بالنقاط عند الحجز · Services at booking", s.redeem_services)}${o.shop_enabled ? sw("ls-r-products", "المنتجات · Products", s.redeem_products) : ""}${sw("ls-r-rewards", "المكافآت · Rewards", s.redeem_rewards)}</fieldset>
        <p class="tiny">المكافأة بالخدمة: النقاط الخاصة بكل خدمة وأسعارها بالنقاط تُحدد من "أسعار النقاط". تغيير الإعدادات لا يمس الأرصدة الحالية.</p>
        <button class="btn" type="submit" id="ls-save">حفظ الإعدادات</button><p class="form-error" id="ls-error" role="alert"></p></form>`;
      field("loy-settings").onsubmit = async e => {
        e.preventDefault(); UI.busy("ls-save", true); field("ls-error").textContent = "";
        try {
          const n = (id, required) => { const v = val(id); if (v === "") { if (required) throw new Error("أكمل الحقول الرقمية"); return null; } if (!(Number(v) >= 0)) throw new Error("القيم الرقمية لا يمكن أن تكون سالبة"); return v; };
          await rpc("admin_loyalty_save_settings", { p_token: tok, p_data: { earning_enabled: field("ls-earn").checked, redemption_enabled: field("ls-redeem").checked,
            currency_name_ar: val("ls-name-ar"), currency_name_en: val("ls-name-en"), coins_per_booking: n("ls-booking", true), coins_per_product_purchase: n("ls-product", true),
            spend_unit_amount: n("ls-unit", true), coins_per_spend_unit: n("ls-unit-coins", true), min_redeem_coins: n("ls-min", true),
            max_redeem_per_transaction: n("ls-max", false), expiry_days: n("ls-expiry", false),
            redeem_services: field("ls-r-services").checked, redeem_products: field("ls-r-products") ? field("ls-r-products").checked : !!s.redeem_products, redeem_rewards: field("ls-r-rewards").checked } });
          UI.toast("تم حفظ إعدادات النقاط", "ok"); await refresh();
        } catch (err) { field("ls-error").textContent = err.message; UI.busy("ls-save", false); }
      };
    }
    // Per service: does it earn coins, and can it be paid with coins? Each is
    // a switch with its number beside it; turning a switch off keeps the
    // number for when it comes back. Changes save on their own.
    function prices(host) {
      const v2 = o.services.some(x => "earns" in x);
      const row = x => {
        const earns = x.earns !== false, redeem = x.redeemable !== false && x.coin_price != null;
        return `<article class="loy-svc ${x.is_enabled ? "" : "is-hidden"}" data-svc="${E(x.id)}">
          <header><div><b data-i18n-skip>${E(x.name)}</b><small>${UI.money(x.price) || ""}${x.is_enabled ? "" : ` · <span class="badge muted">مخفية</span>`}</small></div><span class="loy-svc-state" aria-live="polite"></span></header>
          <div class="loy-svc-rule">
            <label class="loy-switch"><span class="switch"><input type="checkbox" data-earns ${earns ? "checked" : ""} ${v2 ? "" : "disabled"}><span class="track"></span><span class="thumb"></span></span>
              <span><b>تكسب نقاطاً</b><small>${earns ? "نقاط الحجز العامة + الإضافية أدناه" : "لا تُمنح أي نقاط لهذه الخدمة"}</small></span></label>
            <label class="loy-num" ${earns ? "" : "hidden"}><span>نقاط إضافية</span><input class="input" type="number" inputmode="numeric" min="0" step="1" data-earn value="${x.earn_coins}" aria-label="نقاط مكتسبة لـ ${E(x.name)}"></label>
          </div>
          <div class="loy-svc-rule">
            <label class="loy-switch"><span class="switch"><input type="checkbox" data-redeem ${redeem ? "checked" : ""}><span class="track"></span><span class="thumb"></span></span>
              <span><b>يمكن دفعها بالنقاط</b><small>${redeem ? "تظهر للعميل عند الحجز كخيار دفع" : "لا تُعرض للدفع بالنقاط"}</small></span></label>
            <label class="loy-num" ${redeem ? "" : "hidden"}><span>السعر بالنقاط</span><input class="input" type="number" inputmode="numeric" min="1" step="1" data-price value="${x.coin_price ?? ""}" aria-label="السعر بالنقاط لـ ${E(x.name)}"></label>
          </div>
        </article>`;
      };
      host.innerHTML = `<div class="card"><h3>الخدمات · Services</h3>
        <p class="tiny">فعّل أو أوقف لكل خدمة: كسب النقاط، والدفع بالنقاط. إيقاف الكسب يمنع كل النقاط لهذه الخدمة (بما فيها نقاط الحجز العامة). تُحفظ التغييرات تلقائياً.</p>
        ${v2 ? "" : '<p class="sub-warning" role="note">شغّل UPGRADE_2_18.sql لتفعيل مفتاح «تكسب نقاطاً». حتى ذلك الحين يتحكم سعر النقاط وحده بالدفع بالنقاط.</p>'}
        ${o.services.length ? `<div class="loy-svc-list">${o.services.map(row).join("")}</div>` : UI.empty("لا توجد خدمات", "أضف الخدمات أولاً.")}</div>`;
      host.querySelectorAll("[data-svc]").forEach(card => {
        const x = o.services.find(s => s.id === card.dataset.svc);
        const state = card.querySelector(".loy-svc-state");
        const earnBox = card.querySelector("[data-earns]"), redeemBox = card.querySelector("[data-redeem]");
        const earnIn = card.querySelector("[data-earn]"), priceIn = card.querySelector("[data-price]");
        let timer = null, saving = Promise.resolve();
        const show = (text, tone) => { state.textContent = Lang.t(text); state.dataset.tone = tone || ""; };
        const sync = () => {
          earnIn.closest(".loy-num").hidden = !earnBox.checked;
          priceIn.closest(".loy-num").hidden = !redeemBox.checked;
          card.querySelectorAll(".loy-switch small")[0].textContent = Lang.t(earnBox.checked ? "نقاط الحجز العامة + الإضافية أدناه" : "لا تُمنح أي نقاط لهذه الخدمة");
          card.querySelectorAll(".loy-switch small")[1].textContent = Lang.t(redeemBox.checked ? "تظهر للعميل عند الحجز كخيار دفع" : "لا تُعرض للدفع بالنقاط");
        };
        const save = () => {
          const earn = earnIn.value === "" ? 0 : Number(earnIn.value);
          if (!(earn >= 0) || !Number.isInteger(earn)) { show("النقاط لا يمكن أن تكون سالبة", "err"); return; }
          let price = priceIn.value === "" ? null : Number(priceIn.value);
          if (redeemBox.checked && price == null) { show("أدخل السعر بالنقاط", "warn"); priceIn.focus(); return; }
          if (price != null && !(price >= 1 && Number.isInteger(price))) { show("السعر بالنقاط يجب أن يكون 1 أو أكثر", "err"); return; }
          show("جارٍ الحفظ…");
          saving = saving.then(async () => {
            try {
              if (v2) await rpc("admin_loyalty_save_service_v2", { p_token: tok, p_service: x.id, p_earn: earn, p_coin_price: price, p_earns: earnBox.checked, p_redeemable: redeemBox.checked });
              // Before the 2.18 upgrade, "not payable with coins" means no price.
              else await rpc("admin_loyalty_save_service", { p_token: tok, p_service: x.id, p_earn: earn, p_coin_price: redeemBox.checked ? price : null });
              Object.assign(x, { earn_coins: earn, coin_price: v2 ? price : (redeemBox.checked ? price : null), earns: earnBox.checked, redeemable: redeemBox.checked });
              show("تم الحفظ", "ok");
            } catch (e) { show(e.message, "err"); }
          });
        };
        const soon = () => { clearTimeout(timer); timer = setTimeout(save, 600); };
        earnBox.onchange = () => { sync(); save(); };
        redeemBox.onchange = () => { sync(); if (!redeemBox.checked || priceIn.value !== "") save(); else { show("أدخل السعر بالنقاط", "warn"); priceIn.focus(); } };
        earnIn.oninput = soon; priceIn.oninput = soon;
        earnIn.onblur = () => { clearTimeout(timer); save(); }; priceIn.onblur = () => { if (priceIn.value !== "" || !redeemBox.checked) { clearTimeout(timer); save(); } };
      });
      // 2.41: a salon without products (its plan) sees nothing about them here; their saved settings stay as they are.
      if (o.shop_enabled) host.insertAdjacentHTML("beforeend", `        <div class="card"><h3>المنتجات · Products</h3>${o.shop_enabled ? `<p class="tiny">حدد لكل منتج سعره بالنقاط وطريقة شرائه (نقداً، بالنقاط، أو كلاهما) من صفحة المنتجات.</p>
          ${o.products.length ? `<ul class="loy-mini-list">${o.products.map(p => `<li><b>${E(p.name)}</b><span>${p.coin_price ? num(p.coin_price) + " " + E(coinsName(s)) : "بدون سعر نقاط"} · ${E({ money: "نقداً", coins: "بالنقاط", both: "نقداً أو بالنقاط" }[p.purchase_mode])}</span></li>`).join("")}</ul>` : ""}
          <button class="btn line sm" data-nav="${window.Control?.target() ? "#/platform/salon/" + Control.target().slug : "#/admin"}/products">إدارة المنتجات</button>`
          : '<p class="tiny">ميزة المنتجات غير مفعّلة لهذا العمل حالياً. مكافآت المنتجات متوقفة مؤقتاً وتعود كما هي عند التفعيل.</p>'}</div>`);
    }
    function rewards(host) {
      host.innerHTML = `<button class="btn" id="loy-reward-new" style="max-width:240px;margin-bottom:12px">${UI.icon("plus", 18)} مكافأة جديدة</button>
        ${o.rewards.length ? `<div class="list cols">${o.rewards.map(r => `<div class="card clickable row between" data-reward="${E(r.id)}" style="gap:12px"><div style="min-width:0"><b>${E(r.name)}</b>
          <span class="tiny" style="display:block">${num(r.coin_price)} ${E(coinsName(s))} · ${E({ custom: "مكافأة خاصة", service: "خدمة", product: "منتج" }[r.reward_type])}${r.stock !== null ? " · المتبقي " + num(r.stock) : ""}</span></div>
          <span>${UI.badge(r.is_active ? "active" : "hidden")}${r.is_visible ? "" : ' <span class="badge muted">غير ظاهرة</span>'}${r.reward_type === "product" && !o.shop_enabled ? ' <span class="badge warn">متوقفة مع المنتجات</span>' : ""}</span></div>`).join("")}</div>`
          : UI.empty("لا توجد مكافآت", "أنشئ مكافأة يمكن للعملاء استبدال نقاطهم بها.")}`;
      field("loy-reward-new").onclick = () => rewardModal({});
      host.querySelectorAll("[data-reward]").forEach(el => el.onclick = () => rewardModal(o.rewards.find(r => r.id === el.dataset.reward)));
    }
    function rewardModal(r) {
      const opt = (v, l, cur) => `<option value="${E(v)}" ${String(v) === String(cur ?? "") ? "selected" : ""}>${E(l)}</option>`;
      UI.modal(`<div class="mhead"><h3>${r.id ? "تعديل مكافأة" : "مكافأة جديدة"}</h3><button class="iconbtn" id="rw-x" aria-label="إغلاق">${UI.icon("x", 20)}</button></div>
        <form class="mform" id="rw-form">
          <div class="field"><label for="rw-name">الاسم · Name</label><input class="input" id="rw-name" maxlength="120" required value="${E(r.name || "")}"></div>
          <div class="field"><label for="rw-desc">الوصف</label><textarea class="textarea" id="rw-desc" maxlength="1000">${E(r.description || "")}</textarea></div>
          <div class="field"><label for="rw-type">النوع · Type</label><select class="select" id="rw-type">${opt("custom", "مكافأة خاصة · Custom", r.reward_type)}${o.shop_enabled || r.reward_type === "product" ? opt("product", "منتج · Product", r.reward_type) : ""}</select></div>
          <div class="field" id="rw-service-box"><label for="rw-service">الخدمة</label><select class="select" id="rw-service">${o.services.map(x => opt(x.id, x.name, r.service_id)).join("")}</select></div>
          <div class="field" id="rw-product-box"><label for="rw-product">المنتج</label><select class="select" id="rw-product">${o.products.map(x => opt(x.id, x.name, r.product_id)).join("")}</select></div>
          <div class="field"><label for="rw-price">السعر بالنقاط · Coin price</label><input class="input" id="rw-price" type="number" min="1" step="1" required value="${r.coin_price ?? ""}"></div>
          <div class="field"><label for="rw-stock">الكمية المتاحة (اختياري)</label><input class="input" id="rw-stock" type="number" min="0" step="1" value="${r.stock ?? ""}" placeholder="غير محدودة"></div>
          <div class="field"><label for="rw-limit">الحد لكل عميل (اختياري)</label><input class="input" id="rw-limit" type="number" min="1" step="1" value="${r.per_customer_limit ?? ""}" placeholder="بدون حد"></div>
          <div class="field"><label for="rw-img">صورة (رابط https)</label><input class="input" id="rw-img" dir="ltr" value="${E(r.image_url || "")}"></div>
          <label class="notification-toggle"><span>نشطة · Active</span><input type="checkbox" id="rw-active" ${r.is_active !== false ? "checked" : ""}></label>
          <label class="notification-toggle"><span>ظاهرة للعملاء · Visible</span><input type="checkbox" id="rw-visible" ${r.is_visible !== false ? "checked" : ""}></label>
          <button class="btn" type="submit" id="rw-save">حفظ</button>${r.id ? '<button class="btn line" type="button" id="rw-del" style="color:var(--danger);border-color:var(--danger)">حذف / أرشفة</button>' : ""}
          <p class="form-error" id="rw-err" role="alert"></p></form>`);
      const type = () => { field("rw-service-box").hidden = val("rw-type") !== "service"; field("rw-product-box").hidden = val("rw-type") !== "product"; };
      field("rw-type").onchange = type; type();
      field("rw-x").onclick = UI.closeModal;
      field("rw-form").onsubmit = async e => {
        e.preventDefault(); UI.busy("rw-save", true); field("rw-err").textContent = "";
        try {
          await rpc("admin_loyalty_save_reward", { p_token: tok, p_id: r.id || null, p_data: { name: val("rw-name"), description: val("rw-desc"), reward_type: val("rw-type"),
            service_id: val("rw-type") === "service" ? val("rw-service") : null, product_id: val("rw-type") === "product" ? val("rw-product") : null,
            coin_price: Number(val("rw-price")), stock: val("rw-stock"), per_customer_limit: val("rw-limit"), image_url: val("rw-img"),
            is_active: field("rw-active").checked, is_visible: field("rw-visible").checked } });
          UI.closeModal(); UI.toast("تم الحفظ", "ok"); await refresh();
        } catch (err) { field("rw-err").textContent = err.message; UI.busy("rw-save", false); }
      };
      if (r.id) field("rw-del").onclick = () => { UI.closeModal(); UI.confirm("حذف المكافأة؟ إذا كان لها سجل استبدال فستتم أرشفتها بدلاً من الحذف.", async () => {
        try { const x = await rpc("admin_loyalty_delete_reward", { p_token: tok, p_id: r.id }); UI.toast(x.archived ? "تمت أرشفة المكافأة" : "تم الحذف", "ok"); await refresh(); }
        catch (e) { UI.toast(e.message, "err"); } }, true); };
    }
    function purchases(host) {
      let key = requestKey(), picked = null;
      host.innerHTML = `<form class="card loy-form" id="lp-form"><h3>تسجيل شراء منتج مكتمل · Record a completed purchase</h3>
        <p class="tiny">سجّل البيع بعد إتمامه في العمل لتُضاف نقاط العميل. تُخصم الكمية من المخزون.</p>
        <div class="control-form"><label class="full">${Lang.t("العميل")}<input class="input" id="lp-q" placeholder="${Lang.t("ابحث بالاسم أو رقم الهاتف")}" autocomplete="off"></label>
          <div class="full" id="lp-matches"></div>
          <label>المنتج · Product<select class="select" id="lp-product">${o.products.map(p => `<option value="${E(p.id)}" data-price="${Number(p.price) || 0}">${E(p.name)}</option>`).join("")}</select></label>
          <label>الكمية · Quantity<input class="input" id="lp-qty" type="number" min="1" max="1000" step="1" value="1"></label>
          <label>المبلغ المدفوع · Amount paid<input class="input" id="lp-amount" type="number" min="0" step="0.01" placeholder="تلقائي حسب السعر"></label></div>
        <button class="btn" type="submit" id="lp-save">تسجيل الشراء</button><p class="form-error" id="lp-err" role="alert"></p></form><div id="lp-list">${UI.loading()}</div>`;
      let timer;
      field("lp-q").oninput = e => { picked = null; clearTimeout(timer); timer = setTimeout(async () => {
        const q = e.target.value.trim(); const box = field("lp-matches"); if (!q) { box.innerHTML = ""; return; }
        try { const r = await rpc("admin_loyalty_customers", { p_token: tok, p_search: q, p_limit: 6, p_offset: 0 });
          box.innerHTML = r.items.map(c => `<button type="button" class="chip" data-pick="${E(c.id)}">${E(c.full_name || "")} · <span dir="ltr">${E(c.phone)}</span></button>`).join("") || '<p class="tiny">لا نتائج</p>';
          box.querySelectorAll("[data-pick]").forEach(b => b.onclick = () => { picked = b.dataset.pick; box.querySelectorAll(".chip").forEach(x => x.classList.toggle("active", x === b)); });
        } catch (err) { box.textContent = err.message; } }, 250); };
      field("lp-form").onsubmit = async e => {
        e.preventDefault(); field("lp-err").textContent = "";
        if (!picked) { field("lp-err").textContent = "اختر العميل من نتائج البحث"; return; }
        const qty = Number(val("lp-qty")); if (!Number.isInteger(qty) || qty < 1) { field("lp-err").textContent = "الكمية غير صحيحة"; return; }
        UI.busy("lp-save", true);
        try { const r = await rpc("admin_loyalty_record_purchase", { p_token: tok, p_user: picked, p_product: val("lp-product"), p_quantity: qty, p_amount: val("lp-amount") === "" ? null : Number(val("lp-amount")), p_request_key: key });
          UI.toast(r.coins ? `تم التسجيل وإضافة ${num(r.coins)} ${coinsName(s)}` : "تم تسجيل الشراء", "ok"); key = requestKey(); picked = null; purchases(host);
        } catch (err) { field("lp-err").textContent = err.message; UI.busy("lp-save", false); }
      };
      let page = 0;
      const PAGE = 10;
      const loadList = async () => {
        const rows = await rpc("admin_loyalty_purchases", { p_token: tok, p_limit: PAGE, p_offset: page * PAGE });
        const box = field("lp-list"); if (!box) return;
        const more = rows.length === PAGE;
        box.innerHTML = (rows.length ? `<div class="list">${rows.map(p => `<div class="card loy-request"><div><b>${E(p.product_label)} × ${num(p.quantity)}</b><small class="tiny">${E(p.full_name || "")} · ${UI.money(p.amount) || num(p.amount)} · ${E(new Date(p.created_at).toLocaleString(Lang.locale()))}</small></div>
          <div class="loy-request-side">${p.coins ? `<strong>+${num(p.coins)}</strong>` : ""}${p.status === "refunded" ? '<span class="badge muted">مسترجع</span>' : `<button class="btn line sm" data-prefund="${E(p.id)}">استرجاع</button>`}</div></div>`).join("")}</div>` : UI.empty("لا توجد مشتريات مسجلة", "")) + UI.pager(page, more);
        UI.wirePager(() => { if (page > 0) { page--; loadList().catch(e => UI.toast(e.message, "err")); } }, () => { if (more) { page++; loadList().catch(e => UI.toast(e.message, "err")); } }, box);
        box.querySelectorAll("[data-prefund]").forEach(b => b.onclick = () => {
          UI.modal(`<div class="mhead"><h3>استرجاع المشتريات</h3><button class="iconbtn" id="pr-x" aria-label="إغلاق">${UI.icon("x", 20)}</button></div><div class="mform">
            <p class="tiny">تُعاد الكمية للمخزون وتُعكس النقاط المكتسبة (بحدود رصيد العميل، ولا يصبح سالباً أبداً).</p>
            <div class="field"><label for="pr-reason">السبب (مطلوب)</label><input class="input" id="pr-reason" maxlength="300"></div>
            <button class="btn" id="pr-go">تأكيد الاسترجاع</button><p class="form-error" id="pr-err" role="alert"></p></div>`);
          field("pr-x").onclick = UI.closeModal;
          field("pr-go").onclick = async () => { UI.busy("pr-go", true); try { await rpc("admin_loyalty_refund_purchase", { p_token: tok, p_id: b.dataset.prefund, p_reason: val("pr-reason") }); UI.closeModal(); UI.toast("تم الاسترجاع", "ok"); purchases(host); } catch (e) { field("pr-err").textContent = e.message; UI.busy("pr-go", false); } };
        });
      };
      loadList().catch(e => { const box = field("lp-list"); if (box) box.innerHTML = `<div class="card">${E(e.message)}</div>`; });
    }
  }

  // ── A customer's coins, inside the Users page ───────────────────────────
  // Balance, one-tap amounts, add / deduct / set-to, a reason (quick picks or
  // typed), a live "balance after" preview and the recent ledger. Nothing is
  // applied until the confirm button is pressed; every change is logged with
  // its reason and author, and a retried tap reuses the same request key.
  async function customerCoins(host, userId) {
    if (!host || !Features.enabled("loyalty")) { if (host) host.hidden = true; return; }
    const tok = adminToken();
    host.innerHTML = `<div class="coins-panel is-loading">${UI.loading()}</div>`;
    const LPAGE = 10;
    let ledger, settings = null, lpage = 0;
    try {
      [ledger, settings] = await Promise.all([
        rpc("admin_loyalty_ledger", { p_token: tok, p_user: userId, p_limit: LPAGE, p_offset: 0 }),
        rpcCached("admin_loyalty_overview", { p_token: tok }, 60000).then(o => o.settings).catch(() => null),
      ]);
    } catch (e) { host.innerHTML = `<p class="tiny">${E(e.message)}</p>`; return; }
    let mode = "add", key = requestKey();
    const unit = coinsName(settings);
    const reasons = ["هدية", "تعويض", "تصحيح رصيد", "زيارة لم تُسجَّل", "عرض خاص"];
    const balance = () => Number(ledger.balance?.balance) || 0;
    const paint = () => {
      host.innerHTML = `<section class="coins-panel" aria-label="${E(Lang.t("نقاط الولاء"))}">
        <header class="coins-head"><span class="coins-icon">${UI.icon("star", 20)}</span>
          <div><small>نقاط الولاء</small><b><span id="cp-balance">${num(balance())}</span> ${E(unit)}</b>
          <span class="tiny">مكتسب ${num(ledger.balance?.lifetime_earned)} · مستبدل ${num(ledger.balance?.lifetime_redeemed)}</span></div></header>
        <div class="coins-quick" role="group" aria-label="${E(Lang.t("إضافة سريعة"))}">${[-10, -5, 5, 10, 25, 50].map(n =>
          `<button type="button" class="coins-chip ${n < 0 ? "minus" : "plus"}" data-quick="${n}" dir="ltr">${n > 0 ? "+" : "−"}${num(Math.abs(n))}</button>`).join("")}</div>
        <div class="coins-form">
          ${UI.seg("cp-mode", [{ v: "add", l: "إضافة" }, { v: "deduct", l: "خصم" }, { v: "set", l: "تحديد الرصيد" }], mode)}
          <label class="coins-amount"><span id="cp-amount-label">${E(Lang.t(mode === "set" ? "الرصيد الجديد" : "عدد النقاط"))}</span>
            <input class="input" id="cp-amount" type="number" inputmode="numeric" min="0" step="1" placeholder="0"></label>
          <div class="coins-reasons">${reasons.map(r => `<button type="button" class="chip" data-reason="${E(r)}">${E(r)}</button>`).join("")}</div>
          <label class="coins-reason"><span>السبب (مطلوب)</span><input class="input" id="cp-reason" maxlength="300" placeholder="${E(Lang.t("مثال: هدية عيد ميلاد"))}"></label>
          <p class="coins-preview" id="cp-preview" aria-live="polite"></p>
          <button type="button" class="btn" id="cp-save" disabled>تسجيل التعديل</button>
          <p class="form-error" id="cp-err" role="alert"></p>
        </div>
        <details class="coins-ledger" id="cp-ledger-box"><summary>سجل الحركات</summary><div id="cp-ledger">${ledgerHtml()}</div>
        </details></section>`;
      wireLedger();
      wire();
    };
    function ledgerHtml() {
      return `${ledger.items.length ? `<ol class="loy-history">${ledger.items.map(t => `<li><div>${pill(TX, t.tx_type)}<b>${E(t.reference_label || "")}</b><small class="tiny">${E(t.reason || "")}</small>
            <small class="tiny">${E(window.Smart ? Smart.ago(t.created_at) : new Date(t.created_at).toLocaleString(Lang.locale()))} · ${E(t.actor_label || t.actor_kind)} · ${num(t.balance_before)} ← ${num(t.balance_after)}</small></div>
            <strong class="${t.coins > 0 ? "plus" : "minus"}" dir="ltr">${t.coins > 0 ? "+" : ""}${num(t.coins)}</strong></li>`).join("")}</ol>` : '<p class="tiny">لا توجد حركات.</p>'}${UI.pager(lpage, ledger.items.length === LPAGE)}`;
    }
    async function ledgerPage(p) {
      try { ledger = await rpc("admin_loyalty_ledger", { p_token: tok, p_user: userId, p_limit: LPAGE, p_offset: p * LPAGE }); lpage = p; }
      catch (e) { UI.toast(e.message, "err"); return; }
      const box = field("cp-ledger"); if (!box) return;
      box.innerHTML = ledgerHtml(); wireLedger();
    }
    function wireLedger() {
      const box = field("cp-ledger"); if (!box) return;
      UI.wirePager(() => { if (lpage > 0) ledgerPage(lpage - 1); }, () => { if (ledger.items.length === LPAGE) ledgerPage(lpage + 1); }, box);
    }
    // The signed change the server will record, or null while incomplete.
    const delta = () => {
      const raw = field("cp-amount")?.value;
      if (raw === "" || raw == null) return null;
      const n = Number(raw);
      if (!Number.isInteger(n) || n < 0) return NaN;
      return mode === "add" ? n : mode === "deduct" ? -n : n - balance();
    };
    const preview = () => {
      const d = delta(), out = field("cp-preview"), save = field("cp-save"), reason = val("cp-reason");
      if (!out || !save) return;
      let ok = false;
      if (d === null) out.textContent = "";
      else if (Number.isNaN(d)) out.textContent = Lang.t("أدخل عدداً صحيحاً");
      else if (d === 0) out.textContent = Lang.t("الرصيد لن يتغير");
      else if (balance() + d < 0) out.textContent = Smart.pick(`الرصيد الحالي ${num(balance())} فقط`, `The balance is only ${num(balance())}`, `היתרה היא רק ${num(balance())}`);
      else { out.innerHTML = `<span dir="ltr">${num(balance())} → <b>${num(balance() + d)}</b> (${d > 0 ? "+" : "−"}${num(Math.abs(d))})</span>`; ok = true; }
      out.dataset.tone = ok ? (d > 0 ? "plus" : "minus") : "";
      save.disabled = !(ok && reason.length >= 3);
    };
    function wire() {
      UI.wireSeg("cp-mode", v => { mode = v; field("cp-amount-label").textContent = Lang.t(mode === "set" ? "الرصيد الجديد" : "عدد النقاط"); preview(); });
      host.querySelectorAll("[data-quick]").forEach(b => b.onclick = () => {
        const n = Number(b.dataset.quick);
        mode = n > 0 ? "add" : "deduct";
        host.querySelectorAll("#cp-mode button").forEach(x => x.classList.toggle("on", x.dataset.v === mode));
        field("cp-amount-label").textContent = Lang.t("عدد النقاط");
        field("cp-amount").value = Math.abs(n);
        if (!val("cp-reason")) field("cp-reason").focus();
        preview();
      });
      host.querySelectorAll("[data-reason]").forEach(b => b.onclick = () => {
        field("cp-reason").value = Lang.t(b.dataset.reason);
        host.querySelectorAll("[data-reason]").forEach(x => x.classList.toggle("active", x === b));
        preview();
      });
      field("cp-amount").oninput = preview;
      field("cp-reason").oninput = preview;
      field("cp-save").onclick = async () => {
        const d = delta();
        if (!d || Number.isNaN(d) || val("cp-reason").length < 3) return;
        field("cp-err").textContent = "";
        UI.busy("cp-save", true);
        try {
          await rpc("admin_loyalty_adjust", { p_token: tok, p_user: userId, p_coins: d, p_reason: val("cp-reason"), p_request_key: key });
          key = requestKey();
          ledger = await rpc("admin_loyalty_ledger", { p_token: tok, p_user: userId, p_limit: LPAGE, p_offset: 0 }); lpage = 0;
          UI.toast("تم تسجيل التعديل", "ok");
          paint();
        } catch (e) { field("cp-err").textContent = e.message; UI.busy("cp-save", false); }
      };
    }
    paint();
  }

  // ── Wallet request queue (salon dashboard page) ─────────────────────────
  // Products and rewards bought with coins in the wallet. The salon hands the
  // item over and presses "تم التسليم": from then on the customer can no longer
  // cancel it to get the coins back. Services paid with coins are not here —
  // they belong to their booking and are settled when it is completed.
  async function requestsPage(body, status = "pending") {
    const tok = adminToken();
    const statuses = [{ v: "pending", l: "بانتظار التسليم" }, { v: "fulfilled", l: "تم التسليم" }, { v: "cancelled", l: "ملغاة ومسترجعة" }, { v: "", l: "الكل" }];
    let rows = [], sig = "", page = 0, more = false;
    const PAGE = 10;
    body.innerHTML = `<section class="admin-overview-hero"><div><span class="admin-eyebrow">LOYALTY · REQUESTS</span><h1>طلبات الاستبدال</h1>
      <p>ما استبدله العملاء بنقاطهم من المحفظة. سلّم الطلب ثم اضغط «تم التسليم» — بعدها لا يمكن للعميل إلغاؤه أو استرجاع نقاطه.</p></div></section>
      ${UI.seg("lr-status", statuses, status)}<div id="lr-list" aria-live="polite">${UI.loading()}</div>`;
    const card = r => `<article class="card loy-request loy-queue ${r.status}" data-request="${E(r.id)}">
      <div><b>${E(r.target_label)}</b><small class="tiny">${E(TARGET[r.target_type]?.[0] || "")} · ${num(r.coins)} نقطة · ${E(new Date(r.created_at).toLocaleString(Lang.locale()))}</small>
        <small class="loy-queue-customer">${UI.icon("user", 13)} ${E(r.full_name || "عميل")} · <a href="tel:${E(r.phone)}" dir="ltr">${E(r.phone)}</a></small>
        ${r.status === "fulfilled" ? `<small class="tiny">${UI.icon("check", 12)} سلّمه ${E(r.handled_by || "العمل")} · ${E(new Date(r.fulfilled_at).toLocaleString(Lang.locale()))}</small>` : ""}
        ${r.status === "cancelled" ? `<small class="tiny">${E(r.note || "ملغى")} · أُعيدت النقاط</small>` : ""}</div>
      <div class="loy-request-side">${pill(RSTATUS, r.status)}
        ${r.status === "pending" ? `<button class="btn sm" data-fulfil="${E(r.id)}">${UI.icon("check", 15)} تم التسليم</button>` : ""}
        ${r.status !== "cancelled" ? `<button class="btn line sm" data-refund="${E(r.id)}" data-done="${r.status === "fulfilled" ? 1 : 0}">${r.status === "pending" ? "رفض واسترجاع" : "استرجاع استثنائي"}</button>` : ""}</div></article>`;
    const paint = () => {
      const box = field("lr-list"); if (!box) return;
      box.innerHTML = (rows.length ? `<div class="list">${rows.map(card).join("")}</div>` : UI.empty(status === "pending" ? "لا توجد طلبات بانتظار التسليم" : "لا توجد طلبات", "ستظهر هنا فور استبدال أي عميل لنقاطه، مع إشعار لك.")) + UI.pager(page, more);
      UI.wirePager(() => { if (page > 0) { page--; load().catch(e => UI.toast(e.message, "err")); } }, () => { if (more) { page++; load().catch(e => UI.toast(e.message, "err")); } }, box);
      box.querySelectorAll("[data-fulfil]").forEach(b => b.onclick = () => {
        const r = rows.find(x => x.id === b.dataset.fulfil);
        UI.confirm(`تأكيد تسليم «${r.target_label}» إلى ${r.full_name || "العميل"}؟ بعد التأكيد لا يمكن للعميل استرجاع النقاط.`, async () => {
          try { await rpc("admin_loyalty_set_redemption", { p_token: tok, p_id: r.id, p_status: "fulfilled", p_note: "" }); UI.toast("تم تسجيل التسليم", "ok"); await load(); }
          catch (e) { UI.toast(e.message, "err"); await load(); }
        });
      });
      box.querySelectorAll("[data-refund]").forEach(b => b.onclick = () => {
        const done = b.dataset.done === "1";
        UI.modal(`<div class="mhead"><h3>${done ? "استرجاع استثنائي" : "رفض الطلب واسترجاع النقاط"}</h3><button class="iconbtn" id="rf-x" aria-label="إغلاق">${UI.icon("x", 20)}</button></div><div class="mform">
          ${done ? '<p class="tiny">هذا الطلب سُلّم بالفعل. استخدم الاسترجاع فقط إذا أعاد العميل المنتج أو في حالة خطأ، واذكر السبب ليظهر في السجل.</p>' : '<p class="tiny">ستُعاد النقاط إلى رصيد العميل ويصله إشعار بذلك.</p>'}
          <div class="field"><label for="rf-note">السبب ${done ? "(مطلوب)" : "(اختياري)"}</label><input class="input" id="rf-note" maxlength="300"></div>
          <button class="btn" id="rf-go">استرجاع النقاط للعميل</button><p class="form-error" id="rf-err" role="alert"></p></div>`);
        field("rf-x").onclick = UI.closeModal;
        field("rf-go").onclick = async () => { UI.busy("rf-go", true); try { await rpc("admin_loyalty_set_redemption", { p_token: tok, p_id: b.dataset.refund, p_status: "cancelled", p_note: val("rf-note") }); UI.closeModal(); UI.toast("تم استرجاع النقاط", "ok"); await load(); } catch (e) { field("rf-err").textContent = e.message; UI.busy("rf-go", false); } };
      });
    };
    async function load() {
      const all = await rpc("admin_loyalty_redemptions", { p_token: tok, p_status: status || null, p_limit: PAGE, p_offset: page * PAGE });
      more = (all || []).length === PAGE;
      // Service redemptions are settled by their booking, not handed over here.
      rows = (all || []).filter(r => r.target_type !== "service");
      sig = JSON.stringify(rows.map(r => [r.id, r.status]));
      paint();
    }
    UI.wireSeg("lr-status", v => { status = v; page = 0; load().catch(e => UI.toast(e.message, "err")); });
    try { await load(); } catch (e) { const box = field("lr-list"); if (box) box.innerHTML = `<div class="card">${E(e.message)}</div>`; return; }
    // New requests appear without refreshing the page.
    Live.start(async () => {
      const all = await rpc("admin_loyalty_redemptions", { p_token: tok, p_status: status || null, p_limit: PAGE, p_offset: page * PAGE });
      const next = (all || []).filter(r => r.target_type !== "service"), nsig = JSON.stringify(next.map(r => [r.id, r.status]));
      if (nsig !== sig) { rows = next; sig = nsig; paint(); }
    }, 15000);
  }

  // ── "Free with Loyalty Coins" marks on every booking view ───────────────
  // Booking cards across the app (customer list, booking details, specialist
  // schedule, day book, admin list) are marked without changing each screen:
  // the server says which of the visible bookings are paid with coins, and
  // only for bookings the viewer is allowed to see.
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const marks = new Map(); let markTimer = null, marking = false;
  const bookingTargets = root => [...root.querySelectorAll('[data-nav^="#/booking/"]:not(.btn),.tlev[data-id],.cal-ev[data-id],[data-act="bk"][data-id],[data-booking-id]')]
    .map(el => ({ el, id: el.dataset.bookingId || el.dataset.id || (el.getAttribute("data-nav") || "").slice(10) }))
    .filter(x => UUID.test(x.id));
  function paintMark(el, m) {
    if (el.querySelector(".loy-free")) return;
    const coins = Number(m.coins).toLocaleString(Lang.locale());
    if (el.matches("[data-booking-id]")) {
      const hero = el.querySelector(".reservation-hero") || el.firstElementChild;
      hero?.insertAdjacentHTML("afterend", `<div class="loy-free loy-free-banner">${UI.icon("star", 18)}<div><b>مجاني باستخدام نقاط الولاء</b><small>مدفوع بـ ${coins} نقطة${m.service_price != null ? ` · السعر الأصلي ${UI.money(m.service_price) || Number(m.service_price).toLocaleString(Lang.locale())}` : ""}</small></div></div>`);
      return;
    }
    const host = el.querySelector(".tlev-meta, .appt-tags") || el;
    host.insertAdjacentHTML("beforeend", `<span class="loy-free" title="مدفوع بـ ${coins} نقطة">${UI.icon("star", 12)} مجاني بالنقاط</span>`);
  }
  async function markBookings() {
    markTimer = null;
    const view = document.getElementById("view");
    if (!view || marking || !Features.enabled("loyalty")) return;
    const managed = !!window.Control?.target();
    if (location.hash.startsWith("#/platform") && !managed) return;
    const token = managed ? "__platform__" : App.token;
    if (!token) return;
    const targets = bookingTargets(view);
    // Answers are short-lived: cancelling or completing a booking changes them.
    const fresh = id => marks.has(id) && Date.now() - marks.get(id).t < 15000;
    const unknown = [...new Set(targets.map(t => t.id).filter(id => !fresh(id)))].slice(0, 300);
    if (unknown.length) {
      marking = true;
      try {
        const rows = await rpc("loyalty_booking_marks", { p_token: token, p_ids: unknown });
        const now = Date.now();
        unknown.forEach(id => marks.set(id, { t: now, v: null }));
        (rows || []).forEach(r => marks.set(r.booking_id, { t: now, v: r }));
      } catch { unknown.forEach(id => marks.set(id, { t: Date.now(), v: null })); }
      finally { marking = false; }
    }
    bookingTargets(view).forEach(t => { const m = marks.get(t.id)?.v; if (m) paintMark(t.el, m); });
  }
  function watchBookings() {
    const view = document.getElementById("view");
    if (!view || !window.MutationObserver) return;
    new MutationObserver(() => { if (!markTimer) markTimer = setTimeout(markBookings, 150); }).observe(view, { childList: true, subtree: true });
    // Status changes (cancel, complete) change what a booking is worth; forget
    // the answers when the salon or the app's data changes.
    Features.onChange(() => marks.clear());
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") marks.clear(); });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", watchBookings); else watchBookings();

  return { homeChip, fillHomeChip, wallet, adminTab, requestsPage, planCard, specialistBanner, usage, requestKey, customerCoins, forgetMarks: () => marks.clear() };
})();
