// members.js — 2.33: the salon team (Manager / Specialist / Other), invitations,
// permissions, the Action Center, the audit log and the employee's own
// requests. Everything here is a view: the database decides (team_tenant.sql).
//   * Nobody's account is created by the salon. The owner prepares the role,
//     permissions (and a Specialist's services and hours), shares an
//     invitation link, the person accepts with their own Salonieer account and
//     the owner activates them after checking who they are.
//   * Being bookable is not a permission: only an active Specialist is.
window.Team = (() => {
  "use strict";
  const E = (s) => UI.esc(s);
  const T = (s) => Lang.t(s);
  const tok = () => window.Control?.target() ? "__platform__" : App.token;
  const navBase = () => window.Control?.target() ? "#/platform/salon/" + Control.target().slug : "#/admin";
  const isOwner = () => !!window.Control?.target() || Auth.isAdmin();
  const PENDING_INVITE = "salonieer:pending-invite";

  const ROLES = {
    manager: { l: "مدير", i: "shield", d: "يدير العمل اليومي بالصلاحيات التي تختارها. يمكن أن يستقبل حجوزات أيضاً إذا اخترت ذلك." },
    specialist: { l: "مختص", i: "scissors", d: "يستقبل حجوزات العملاء بعد التفعيل، ويرى جدوله ومواعيده." },
    other: { l: "أخرى", i: "user", d: "استقبال أو محاسبة أو غير ذلك — مسمى تكتبه وصلاحيات تختارها. يمكن أن يستقبل حجوزات إذا اخترت ذلك." },
  };
  // 2.34: every permission the server knows, in clear sections. "View" and
  // "do" are separate items; actions on money are marked as sensitive. The
  // identifiers (and what each one opens on the server) are unchanged.
  const PERMS = [
    { id: "appointments", g: "المواعيد والعملاء", i: "calendar", items: [["bookings_view", "عرض قائمة الحجوزات"], ["bookings_manage", "إنشاء الحجوزات للعملاء وتعديلها وإلغاؤها", true],
      ["clients_view", "عرض بيانات العملاء"], ["clients_manage", "إدارة سجلات العملاء (الإيقاف والباقات)", true]] },
    { id: "team", g: "الفريق والجداول والحضور", i: "users", items: [["schedule_all", "عرض جدول كل المختصين (عرض فقط)"], ["schedules", "تعديل أوقات عمل الفريق والإجازات", true],
      ["attendance", "مراجعة الحضور والانصراف"]] },
    { id: "money", g: "الإدارة المالية", i: "money", items: [["checkout", "إتمام الدفع"], ["discounts", "الخصم اليدوي", true], ["deposits", "العربون"],
      ["receipts_correct", "تصحيح الفواتير", true], ["receipts_refund", "إلغاء الفواتير واسترجاع المبالغ", true], ["cash_close", "إغلاق صندوق النقد", true],
      ["finance", "التقارير المالية والأجور والمشتريات", true]] },
    { id: "specialist", g: "عمل المختص", i: "scissors", items: [["own_commissions", "رؤية عمولته"]] },
    { id: "products", g: "المنتجات والمخزون", i: "bag", items: [["inventory", "المنتجات والمخزون"]] },
    { id: "requests", g: "الطلبات والإشعارات والدعم", i: "bell", items: [["requests", "طلبات انضمام العملاء وطلبات الباقات"], ["notifications", "إرسال الإشعارات"], ["support", "رسائل الدعم"]] },
    { id: "services", g: "الخدمات والتسويق", i: "star", items: [["services", "الخدمات والباقات"], ["marketing", "الكوبونات ونقاط الولاء واستعادة العملاء"]] },
    { id: "reports", g: "لوحة العمل والتقارير", i: "chart", items: [["statistics", "الإحصائيات"], ["audit", "سجل الإجراءات"]] },
  ];
  const FALLBACK_DEFAULTS = {
    manager: ["bookings_view", "schedule_all", "bookings_manage", "clients_view", "clients_manage", "services", "schedules", "inventory", "checkout", "discounts", "deposits", "statistics", "notifications", "requests", "attendance", "support"],
    specialist: ["checkout"], other: [],
  };
  const STATUS = { invited: ["دعوة مرسلة", "muted"], accepted: ["بانتظار تفعيلك", "amber"], active: ["نشط", "ok"], declined: ["رفض الدعوة", "danger"], revoked: ["أُلغيت", "muted"], inactive: ["سابق", "muted"], expired: ["انتهت صلاحية الرابط", "muted"] };
  const roleName = (m) => m.role === "other" && m.title ? m.title : T(ROLES[m.role]?.l || m.role);
  const statusBadge = (s) => `<span class="badge ${STATUS[s]?.[1] || "muted"}">${E(T(STATUS[s]?.[0] || s))}</span>`;
  const initials = (n) => String(n || "؟").trim().charAt(0) || "؟";
  // A photo that cannot be shown falls back to the initial (photos.js).
  const avatar = (m) => m.profile?.image_url ? `<img class="tm-av" src="${E(m.profile.image_url)}" alt="" data-initial="${E(initials(m.name))}" decoding="async">` : `<span class="tm-av">${E(initials(m.name))}</span>`;
  const when = (iso) => iso ? new Date(iso).toLocaleDateString(Lang.locale(), { day: "numeric", month: "short" }) : "";
  const fresh = () => window.rpcCacheBust?.();

  // ---- permissions editor (shared by Add, member details and Settings) -----
  function permsEditor(selected) {
    const on = new Set(selected || []);
    return `<div class="tm-perms">${PERMS.map((g) => {
      const n = g.items.filter(([k]) => on.has(k)).length;
      return `<details class="tm-perm-group" data-perm-group="${g.id}" ${n ? "open" : ""}><summary>${UI.icon(g.i, 16)}<span class="tm-perm-title">${E(T(g.g))}</span><em class="tm-perm-count" data-perm-count>${Lang.number(n)}/${Lang.number(g.items.length)}</em>${UI.icon("down", 16)}</summary>
        <div class="tm-perm-items">${g.items.length > 1 ? `<label class="tm-perm tm-perm-all"><input type="checkbox" data-perm-section="${g.id}" ${n === g.items.length ? "checked" : ""}><span>${E(T("كل هذا القسم"))}</span></label>` : ""}
        ${g.items.map(([k, l, sensitive]) => `<label class="tm-perm"><input type="checkbox" data-perm="${k}" ${on.has(k) ? "checked" : ""}><span>${E(T(l))}</span>${sensitive ? `<em class="tm-sensitive">${E(T("حساس"))}</em>` : ""}</label>`).join("")}</div></details>`;
    }).join("")}
      <div class="tm-perm-tools"><button type="button" class="btn line sm" data-perm-all>${E(T("تحديد الكل"))}</button><button type="button" class="btn line sm" data-perm-none>${E(T("إلغاء الكل"))}</button></div>
      <p class="tiny tm-note">${E(T("الصلاحيات تحدد ما يديره العضو فقط. استقبال الحجوزات ليس صلاحية: يحجز العملاء عند المختصين المفعّلين فقط. عرض الجدول أو الفواتير لا يسمح بتعديلها."))}</p></div>`;
  }
  function wirePerms(root) {
    const counts = () => root.querySelectorAll("[data-perm-group]").forEach((g) => {
      const boxes = [...g.querySelectorAll("[data-perm]")], n = boxes.filter((b) => b.checked).length;
      const c = g.querySelector("[data-perm-count]"); if (c) c.textContent = `${Lang.number(n)}/${Lang.number(boxes.length)}`;
      const all = g.querySelector("[data-perm-section]"); if (all) { all.checked = n === boxes.length; all.indeterminate = n > 0 && n < boxes.length; }
    });
    root.querySelectorAll("[data-perm]").forEach((b) => b.addEventListener("change", counts));
    root.querySelectorAll("[data-perm-section]").forEach((s) => s.addEventListener("change", () => {
      s.closest("[data-perm-group]").querySelectorAll("[data-perm]").forEach((c) => { c.checked = s.checked; }); counts();
    }));
    root.querySelector("[data-perm-all]")?.addEventListener("click", () => { root.querySelectorAll("[data-perm]").forEach((c) => { c.checked = true; }); counts(); });
    root.querySelector("[data-perm-none]")?.addEventListener("click", () => { root.querySelectorAll("[data-perm]").forEach((c) => { c.checked = false; }); counts(); });
    counts();
    return () => [...root.querySelectorAll("[data-perm]:checked")].map((c) => c.dataset.perm);
  }
  function setPerms(root, list) {
    const on = new Set(list || []);
    root.querySelectorAll("[data-perm]").forEach((c) => { c.checked = on.has(c.dataset.perm); });
    root.querySelectorAll("[data-perm-group]").forEach((g) => { if ([...g.querySelectorAll("[data-perm]")].some((c) => c.checked)) g.open = true; });
    root.querySelectorAll("[data-perm]")[0]?.dispatchEvent(new Event("change"));
  }

  // ---- the Team page ----------------------------------------------------------
  // One "Needs your review" item: icon · name / phone / what to do · action.
  // On a narrow phone the action moves under the text, so the text keeps the
  // full width (2.40: it used to be squeezed into one-word columns).
  function reviewItem(icon, name, phone, text, action) {
    return `<div class="tm-review-row">${UI.icon(icon, 16)}<div class="tm-review-body"><b data-i18n-skip>${E(name || "")}</b>${phone ? `<bdi dir="ltr" class="tm-review-phone">${E(phone)}</bdi>` : ""}<span>${text}</span></div>${action || ""}</div>`;
  }
  async function page(body) {
    const d = await rpc("admin_team_list", { p_token: tok() });
    const members = d.members || [];
    // 2.45: the address each invitation was sent to (a database before 2.45 has none: the page works as before).
    const emails = await rpc("admin_team_emails", { p_token: tok() }).catch(() => ({}));
    members.forEach((m) => { m.inviteEmail = (emails && emails[m.id]?.email) || ""; });
    const by = (s) => members.filter((m) => s.includes(m.status));
    const seats = d.seats || {};
    lastSeats = seats;
    // The owner as a Specialist (d.self.mode, team_tenant.sql): a new profile,
    // the profile their account already reaches, or the one they left.
    const self = !window.Control?.target() ? d.self : null;
    // 2.34: "Become a Specialist" while the owner is not working as one (a new
    // profile, or the one they had before — no new account, no second
    // profile); "My Specialist Profile" once they are.
    const selfLabel = !self ? "" : ["active", "claim", "taken", "verify"].includes(self.mode) ? "ملفي كمختص" : ["resume", "none"].includes(self.mode) ? "أصبح مختصاً" : "";
    const seatLine = seats.unlimited ? T("مختصون بلا حد في باقتك")
      : `${Lang.number(seats.active || 0)} / ${Lang.number(seats.limit ?? 0)} ${T("مختص نشط في باقتك")}`;
    const section = (title, list, empty) => list.length ? `<section class="tm-section"><h2>${E(T(title))}<em>${Lang.number(list.length)}</em></h2><div class="tm-list">${list.map(card).join("")}</div></section>` : (empty || "");
    body.innerHTML = `
      <div id="specialist-limit"></div>
      <div class="tm-head">
        <div class="tm-seats ${seats.over_limit ? "over" : ""}">${UI.icon("users", 18)}<span>${E(seatLine)}</span></div>
        <div class="btn-row">
          <button class="btn" id="tm-add">${UI.icon("plus", 18)} <span>${E(T("إضافة عضو"))}</span></button>
          <button class="btn line" data-nav="${navBase()}/schedule">${UI.icon("calendar", 17)} <span>${E(T("جدول الفريق"))}</span></button>
          ${selfLabel ? `<button class="btn ${["none", "resume"].includes(self.mode) ? "accent" : "line"}" id="tm-self">${UI.icon("scissors", 17)} <span>${E(T(selfLabel))}</span>${self.mode === "claim" ? `<i class="tm-dot" aria-hidden="true"></i>` : ""}</button>` : ""}
        </div>
      </div>
      ${self?.mode === "claim" ? `<div class="tm-alert" id="tm-claim-note">${UI.icon("scissors", 18)}<span>${E(T("حسابك مرتبط بملف المختص"))} «<b data-i18n-skip>${E(self.profile?.name || "")}</b>». ${E(T("أكّد أنه ملفك ليظهر كملفك في الفريق — دون نسخة جديدة أو مقعد إضافي."))}</span></div>` : ""}
      ${by(["accepted"]).length ? `<div class="tm-alert">${UI.icon("bell", 18)}<span>${E(T("قَبِل أشخاص دعوتك — تحقّق من هويتهم وفعّلهم."))}</span></div>` : ""}
      ${section("بانتظار تفعيلك", by(["accepted"]))}
      ${section("الفريق", by(["active"]), `<div class="card">${UI.empty(T("لا يوجد أعضاء بعد"), T("أضف عضواً: بدعوة بالبريد الإلكتروني، أو دون حساب METON وتديره أنت."))}</div>`)}
      ${section("دعوات مرسلة", by(["invited"]))}
      ${(d.unlinked_accounts || []).length || members.some((m) => m.review_note) ? `<section class="tm-section"><h2>${E(T("تحتاج مراجعتك"))}</h2>
        <div class="card tm-review">${members.filter((m) => m.review_note).map((m) => reviewItem("info", m.name, "",
            E(T(m.review_note === "no_account" ? "عضو بدون حساب METON: يبقى متاحاً للحجز وتديره أنت. استخدم «ربط بحساب METON» من تفاصيله إذا أردت أن يدخل التطبيق." : "ملف مختص مرتبط بأكثر من حساب. راجع الربط من تفاصيل العضو.")),
            m.review_note === "shared_profile" ? `<button type="button" class="btn line sm" data-review="${E(m.id)}">${E(T("مراجعة الحسابات"))}</button>` : "")).join("")}
        ${(d.unlinked_accounts || []).map((u) => reviewItem("user", u.name || u.phone, u.name ? u.phone : "",
            `${E(T("حساب مختص قديم دون ملف فريق. يبقى كما هو؛ أرسل دعوة جديدة لتفعيله ضمن الفريق."))}${u.profile ? ` <span class="tm-review-profile">${E(T("الملف:"))} <span data-i18n-skip>${E(u.profile)}</span></span>` : ""}`,
            isOwner() ? `<button type="button" class="btn line sm danger-line" data-unlink="${E(u.id)}">${E(T("إزالة وصول المختص"))}</button>` : "")).join("")}</div></section>` : ""}
      ${by(["declined", "revoked", "inactive"]).length ? `<details class="tm-past"><summary>${E(T("سابقون ودعوات منتهية"))} (${Lang.number(by(["declined", "revoked", "inactive"]).length)})</summary><div class="tm-list">${by(["declined", "revoked", "inactive"]).map(card).join("")}</div></details>` : ""}`;
    const refresh = () => { fresh(); return page(body); };
    // The plan's specialist limit, explained (only specialists use seats; a
    // pending invitation takes none — activation checks for a free seat).
    if (window.Loyalty?.specialistBanner) Loyalty.specialistBanner(document.getElementById("specialist-limit")).catch(() => {});
    document.getElementById("tm-add").onclick = () => addSheet(d, refresh);
    const selfBtn = document.getElementById("tm-self"); if (selfBtn) selfBtn.onclick = () => selfSheet(self, members, d, refresh);
    body.querySelectorAll("[data-member]").forEach((el) => el.onclick = () => memberSheet(members.find((m) => m.id === el.dataset.member), d, refresh));
    body.querySelectorAll("[data-review]").forEach((el) => el.onclick = () => memberSheet(members.find((m) => m.id === el.dataset.review), d, refresh));
    body.querySelectorAll("[data-unlink]").forEach((el) => el.onclick = () => unlinkAccount((d.unlinked_accounts || []).find((u) => u.id === el.dataset.unlink), refresh));
  }
  // Remove Specialist access from an old account (never an owner's). The
  // account, its bookings and history stay; it becomes a customer account.
  function unlinkAccount(u, refresh) {
    if (!u) return;
    UI.confirm(`${T("إزالة وصول المختص من هذا الحساب؟")} ${u.name || ""} ${u.phone || ""} — ${T("يبقى الحساب وسجله كما هما ويصبح حساب عميل.")}`, async () => {
      try { await rpc("admin_team_unlink_account", { p_token: tok(), p_user: u.id, p_reason: "" }); UI.closeModal(); fresh(); UI.toast(T("تمت إزالة وصول المختص"), "ok"); refresh?.(); }
      catch (e) { UI.toast(e.message, "err"); }
    }, true);
  }
  function card(m) {
    return `<button type="button" class="tm-card" data-member="${E(m.id)}">${avatar(m)}
      <span class="tm-card-main"><b data-i18n-skip${m.status === "invited" && m.inviteEmail ? ` dir="ltr"` : ""}>${E(m.status === "invited" ? (m.inviteEmail || T("بانتظار قبول الدعوة")) : m.name)}</b>
        <small>${m.owner ? `<span class="tm-role tm-owner">${E(T("المالك"))}</span> ` : ""}<span class="tm-role tm-role-${E(m.role)}">${E(roleName(m))}</span>${m.status === "active" && !m.user_id ? ` <span class="tm-role tm-noacc">${E(T("بدون حساب"))}</span>` : ""}${m.role !== "specialist" && m.barber_id && m.profile?.is_active ? ` <span class="tm-role tm-role-specialist">${E(T("يستقبل حجوزات"))}</span>` : ""}${m.phone && m.status !== "invited" ? ` · <bdi dir="ltr">${E(m.phone)}</bdi>` : ""}${m.status === "active" && (m.paused || (m.profile && !m.profile.is_active)) ? ` · <span class="tm-off">${E(T(m.paused ? "متوقف مؤقتاً عن الحجوزات" : "غير متاح للحجز"))}</span>` : ""}</small></span>
      <span class="tm-card-side">${statusBadge(m.invite?.status === "expired" && m.status === "invited" ? "expired" : m.status)}${m.future_bookings ? `<small>${Lang.number(m.future_bookings)} ${E(T("موعد قادم"))}</small>` : ""}</span>${UI.icon("chev", 16)}</button>`;
  }

  // ---- Add Team Member ----------------------------------------------------------
  async function servicesAndHours(prefix, d = {}) {
    const services = await rpcCached("list_services", { p_only_enabled: false }, 20000).catch(() => []);
    const chosen = new Set(d.services || []);
    return `<div class="sec-label">${E(T("الخدمات التي يقدمها"))}</div>
      ${services.length ? `<div class="svc-pick">${services.map((s) => `<label class="checkrow svc-line"><input type="checkbox" class="${prefix}-svc" value="${E(s.id)}" ${chosen.has(s.id) ? "checked" : ""}> <span data-i18n-skip>${E(s.name)}</span></label>`).join("")}</div>`
        : `<p class="muted">${E(T("لا توجد خدمات بعد — أضِفها من صفحة الخدمات."))}</p>`}
      <div class="field"><label for="${prefix}-spec">${E(T("التخصص"))}</label><input id="${prefix}-spec" class="input" maxlength="80" dir="auto" value="${E(d.specialty || "")}" placeholder="${E(T("اكتب تخصص المختص"))}"></div>
      <details class="schedule-editor" ${d.openHours ? "open" : ""}><summary><span><b>${E(T("أيام وأوقات العمل"))}</b><small>${E(T("اضغط لعرض أو إخفاء جدول الدوام"))}</small></span>${UI.icon("down", 18)}</summary>
        <div class="schedule-editor-body"><div id="${prefix}-days"></div></div></details>`;
  }
  function readServices(prefix) { return [...document.querySelectorAll(`.${prefix}-svc:checked`)].map((c) => c.value); }

  async function addSheet(d, refresh, opts = {}) {
    const defaults = d.defaults || FALLBACK_DEFAULTS;
    let role = opts.role || "specialist";
    // 2.45: a new team member is invited by email (no link to share). The person accepts or declines from their own
    // METON account once it has confirmed that address; nothing is granted before that.
    const byEmail = !opts.person && !opts.onSubmit;
    // 2.47: or WITHOUT a METON account — a team member the owner manages (bookable when they take bookings). They can be
    // linked to their own account later ("Link to METON account") without losing anything.
    let mode = "email", bookable = false;
    const extras = await servicesAndHours("ta", { openHours: false });
    UI.modal(`<div class="mhead"><h3>${E(T(opts.title || "إضافة عضو إلى الفريق"))}</h3><button class="iconbtn" id="ta-x" aria-label="${E(T("إغلاق"))}">${UI.icon("x", 20)}</button></div>
      <div class="mform tm-add">
        ${opts.person ? `<div class="tm-who">${UI.icon("user", 18)}<span><b data-i18n-skip>${E(opts.person.name || "")}</b> <bdi dir="ltr">${E(opts.person.phone || "")}</bdi></span></div>` : ""}
        ${byEmail ? `<div class="sec-label">${E(T("كيف ينضم؟"))}</div>${UI.seg("ta-mode", [{ v: "email", l: T("دعوة بالبريد") }, { v: "local", l: T("دون حساب METON") }], "email")}` : ""}
        ${byEmail ? `<div class="field" id="ta-email-field"><label for="ta-email">${E(T("البريد الإلكتروني للشخص"))}</label><input id="ta-email" class="input" type="email" inputmode="email" autocomplete="off" autocapitalize="off" spellcheck="false" dir="ltr" maxlength="254" placeholder="name@example.com">
          <small class="tiny">${E(T("نرسل إليه الدعوة بالبريد. يقبلها أو يرفضها من حسابه في METON بعد تأكيد هذا البريد."))}</small></div>
          <div id="ta-local" hidden>
            <div class="field"><label for="ta-name">${E(T("الاسم"))}</label><input id="ta-name" class="input" maxlength="120" dir="auto" autocomplete="off"></div>
            <div class="field"><label for="ta-phone">${E(T("رقم التواصل (اختياري)"))}</label><input id="ta-phone" class="input" type="tel" inputmode="tel" dir="ltr" maxlength="20" autocomplete="off" placeholder="0599 123 456">
              <small class="tiny">${E(T("للتواصل فقط: لا يُستخدم لتسجيل الدخول ولا يمنح أي صلاحية."))}</small></div>
          </div>` : ""}
        <div class="sec-label">${E(T("الدور"))}</div>
        <div class="tm-roles" role="radiogroup">${Object.entries(ROLES).map(([k, r]) => `<button type="button" role="radio" class="tm-role-card ${k === role ? "on" : ""}" data-role="${k}" aria-checked="${k === role}">
          ${UI.icon(r.i, 20)}<b>${E(T(r.l))}</b><small>${E(T(r.d))}</small></button>`).join("")}</div>
        <div class="field" id="ta-title-field"><label for="ta-title" id="ta-title-label"></label>
          <input id="ta-title" class="input" maxlength="80" dir="auto" placeholder="${E(T("مثال: موظف استقبال، محاسب، عامل نظافة"))}"></div>
        ${byEmail ? `<label class="checkrow" id="ta-bookable-row" style="display:none !important"><input type="checkbox" id="ta-bookable"> <span>${E(T("يستقبل حجوزات أيضاً (يأخذ مقعد مختص واحداً)"))}</span></label>` : ""}
        <div id="ta-specialist">${d.seats && !d.seats.unlimited && Number(d.seats.active) >= Number(d.seats.limit) ? `<div class="tm-alert" id="ta-seat-note">${UI.icon("info", 17)}<span>${E(T("كل مقاعد المختصين في باقتك مستخدمة. يمكنك إرسال الدعوة الآن، لكن التفعيل يحتاج مقعداً إضافياً عبر إدارة METON أو إيقاف مختص آخر.") + seatCost(d.seats))}</span></div>` : ""}${extras}</div>
        <div class="sec-label">${E(T("الصلاحيات"))}</div>
        <p class="tiny">${E(T("محددة مسبقاً حسب الدور — عدّلها كما تريد."))}</p>
        <div id="ta-perms">${permsEditor(defaults[role])}</div>
        <div class="form-error" id="ta-err" role="alert"></div>
        <button class="btn" id="ta-go">${UI.icon(opts.person ? "check" : byEmail ? "mail" : "plus", 17)} <span id="ta-go-label">${E(T(opts.cta || (byEmail ? "إرسال الدعوة" : "إنشاء رابط الدعوة")))}</span></button>
        ${opts.person ? "" : `<p class="tiny tm-note" id="ta-note">${E(T(byEmail ? "لا تحتاج إلى رقمه أو كلمة مرور. تبدأ صلاحياته عندما يقبل الدعوة من حسابه، ولا تأخذ الدعوة المنتظرة أي مقعد." : "لا تحتاج إلى رقم الموظف أو كلمة مرور: يقبل الدعوة بحسابه في METON، ثم تفعّله أنت بعد التحقق منه."))}</p>`}
      </div>`);
    document.getElementById("ta-x").onclick = UI.closeModal;
    const editor = ScheduleEditor.mount(document.getElementById("ta-days"), ScheduleEditor.fromSchedule({}));
    const permsRoot = document.getElementById("ta-perms"), getPerms = wirePerms(permsRoot);
    const needsProfile = () => role === "specialist" || (mode === "local" && bookable);
    const paint = () => {
      document.querySelectorAll(".tm-role-card").forEach((b) => { const on = b.dataset.role === role; b.classList.toggle("on", on); b.setAttribute("aria-checked", on); });
      document.getElementById("ta-specialist").hidden = !needsProfile();
      document.getElementById("ta-title-label").textContent = T(role === "other" ? "المسمى الوظيفي" : "المسمى (اختياري)");
      document.getElementById("ta-title").required = role === "other";
      if (byEmail) {
        document.getElementById("ta-email-field").hidden = mode !== "email";
        document.getElementById("ta-local").hidden = mode !== "local";
        // (.checkrow sets display: the hidden attribute alone would not hide it)
        document.getElementById("ta-bookable-row").style.setProperty("display", mode !== "local" || role === "specialist" ? "none" : "flex", "important");
        document.getElementById("ta-go-label").textContent = T(mode === "local" ? "إضافة العضو" : "إرسال الدعوة");
        document.getElementById("ta-note").textContent = T(mode === "local"
          ? "يعمل في عملك دون حساب: تديره أنت وتدير مواعيده. لا يدخل التطبيق ولا تعمل صلاحياته حتى تربطه بحسابه في METON بدعوة بالبريد — بنفس الملف والمواعيد والمقعد."
          : "لا تحتاج إلى رقمه أو كلمة مرور. تبدأ صلاحياته عندما يقبل الدعوة من حسابه، ولا تأخذ الدعوة المنتظرة أي مقعد.");
      }
    };
    document.querySelectorAll(".tm-role-card").forEach((b) => b.onclick = () => { role = b.dataset.role; setPerms(permsRoot, defaults[role] || []); paint(); });
    if (byEmail) {
      UI.wireSeg("ta-mode", (v) => { mode = v; paint(); });
      document.getElementById("ta-bookable").onchange = (e) => { bookable = e.target.checked; paint(); };
    }
    setPerms(permsRoot, defaults[role] || []);
    paint();
    document.getElementById("ta-go").onclick = async () => {
      const err = document.getElementById("ta-err"); err.textContent = "";
      const title = document.getElementById("ta-title").value.trim();
      if (role === "other" && !title) { err.textContent = T("اكتب المسمى الوظيفي (مثل موظف استقبال أو محاسب)"); return; }
      const data = { role, title, permissions: getPerms() };
      if (byEmail && mode === "local") {
        data.name = document.getElementById("ta-name").value.trim();
        data.phone = document.getElementById("ta-phone").value.replace(/[^0-9+]/g, "");
        if (data.name.length < 2) { err.textContent = T("اكتب اسم عضو الفريق"); document.getElementById("ta-name").focus(); return; }
        if (data.phone && !/^\+?[0-9]{6,15}$/.test(data.phone)) { err.textContent = T("رقم التواصل غير صحيح"); document.getElementById("ta-phone").focus(); return; }
        data.bookable = needsProfile();
      } else if (byEmail) {
        const email = document.getElementById("ta-email").value.trim().toLowerCase();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email)) { err.textContent = T("أدخل بريداً إلكترونياً صحيحاً"); document.getElementById("ta-email").focus(); return; }
        data.email = email; data.lang = Lang.get();
      }
      if (needsProfile()) {
        const bad = editor.validate();
        if (bad) { err.textContent = bad; document.querySelector("#ta-specialist .schedule-editor").open = true; editor.focusFirstProblem(); return; }
        data.services = readServices("ta"); data.schedule = editor.value(); data.specialty = document.getElementById("ta-spec").value.trim();
        if (!data.services.length) { err.textContent = T("اختر خدمة واحدة على الأقل يقدمها المختص"); return; }
      }
      UI.busy("ta-go", true);
      try {
        if (opts.onSubmit) { await opts.onSubmit(data); UI.closeModal(); fresh(); refresh?.(); return; }
        if (byEmail && mode === "local") {
          await rpc("admin_team_add_member", { p_token: tok(), p_data: data });
          UI.closeModal(); fresh(); rpcCacheBust("list_barbers"); UI.toast(T("تمت إضافة العضو"), "ok"); refresh?.(); return;
        }
        if (byEmail) {
          let sent = null;
          try { sent = await rpc("admin_team_invite_email", { p_token: tok(), p_data: data }); }
          catch (e) { if (!(e.code === "PGRST202" || /could not find the function|does not exist/i.test(e.rawMessage || ""))) throw e; }
          if (sent) {
            UI.closeModal(); fresh();
            UI.toast(sent.existing ? T("توجد دعوة مفتوحة لهذا البريد بالفعل") : `${T("أُرسلت الدعوة إلى")} ${sent.email}`, "ok");
            refresh?.(); return;
          }
          // A database before 2.45: the invitation link, as before.
          delete data.email; delete data.lang;
        }
        const r = await rpc("admin_team_invite", { p_token: tok(), p_data: data });
        fresh(); shareInvite(r, refresh);
      } catch (e) { err.textContent = seatMessage(e); UI.busy("ta-go", false); }
    };
  }

  // The link to share: native share sheet, copy, WhatsApp.
  function shareInvite(r, refresh) {
    const salon = App.settings?.app_name || Control.target()?.name || "METON";
    const text = `${T("دعوة للانضمام إلى فريق")} ${salon}:\n${r.link}\n${T("افتح الرابط بتطبيق METON وسجّل الدخول بحسابك أو أنشئ حساباً، ثم اقبل الدعوة.")} (${r.code})`;
    UI.modal(`<div class="mhead"><h3>${E(T("رابط الدعوة جاهز"))}</h3><button class="iconbtn" id="ts-x" aria-label="${E(T("إغلاق"))}">${UI.icon("x", 20)}</button></div>
      <div class="tm-share">
        <div class="tm-share-icon">${UI.icon("users", 28)}</div>
        <p>${E(T("شارك الرابط مع الشخص فقط. يصلح لمرة واحدة حتى"))} <b>${E(new Date(r.expires_at).toLocaleDateString(Lang.locale(), { weekday: "long", day: "numeric", month: "long" }))}</b>.</p>
        <div class="tm-link" dir="ltr" data-i18n-skip>${E(r.link)}</div>
        <div class="btn-row">
          <button class="btn" id="ts-share">${UI.icon("chat", 17)} <span>${E(T("مشاركة"))}</span></button>
          <button class="btn line" id="ts-copy">${UI.icon("list", 17)} <span>${E(T("نسخ الرابط"))}</span></button>
          <a class="btn line" id="ts-wa" href="https://wa.me/?text=${encodeURIComponent(text)}" target="_blank" rel="noopener">${UI.icon("whatsapp", 17)} <span>WhatsApp</span></a>
        </div>
        <p class="tiny tm-note">${E(T("بعد أن يقبل الدعوة ستصلك رسالة. لن يحصل على أي صلاحية قبل أن تفعّله أنت."))}</p>
      </div>`);
    const close = () => { UI.closeModal(); refresh?.(); };
    document.getElementById("ts-x").onclick = close;
    document.getElementById("ts-copy").onclick = async () => {
      try { await navigator.clipboard.writeText(r.link); UI.toast(T("تم نسخ الرابط"), "ok"); }
      catch { try { await NativeBridge.request("copy", r.link); UI.toast(T("تم نسخ الرابط"), "ok"); } catch { UI.toast(r.link, "ok"); } }
    };
    document.getElementById("ts-share").onclick = async () => {
      try { if (window.NativeBridge?.available?.()) { await NativeBridge.request("share", text); return; } } catch {}
      try { if (navigator.share) { await navigator.share({ title: salon, text, url: r.link }); return; } } catch { return; }
      document.getElementById("ts-copy").click();
    };
  }

  // The owner who also works as a specialist: their own account, no
  // invitation, phone number or password. An existing profile is reused.
  async function selfSheet(self, members, d, refresh) {
    const mode = self?.mode || "none";
    const own = members.find((m) => m.id === self?.member_id);
    const after = async (msg) => { UI.closeModal(); fresh(); try { await Auth.loadContext(); } catch {} UI.toast(T(msg), "ok"); refresh(); };
    if (mode === "active" && own) { memberSheet(own, d, refresh); return; }
    if (mode === "verify") {
      UI.modal(`<div class="mhead"><h3>${E(T("ملفي كمختص"))}</h3><button class="iconbtn" id="tf-x" aria-label="${E(T("إغلاق"))}">${UI.icon("x", 20)}</button></div>
        <div class="mform tm-claim"><div class="tm-profile"><span class="tm-av">${E(initials(self.profile?.name))}</span><div><b data-i18n-skip>${E(self.profile?.name || "")}</b></div></div>
        <div class="tm-verify">${UI.icon("shield", 20)}<div><b>${E(T("يحتاج تحققاً من METON"))}</b><p>${E(T("هذا الملف مرتبط بأكثر من حساب، لذلك لا يمكن لأي حساب أخذه بنفسه — حتى حساب مالك. يتحقق فريق METON من صاحب الملف ثم يربطه بحسابه، دون تغيير الحجوزات أو الخدمات أو الدوام."))}</p></div></div>
        <p class="tiny tm-note">${E(T("تواصل مع دعم METON من صفحة المساعدة لطلب التحقق."))}</p></div>`);
      document.getElementById("tf-x").onclick = UI.closeModal; return;
    }
    if (mode === "taken") { UI.toast(T("ملف المختص المرتبط بحسابك يخص عضو فريق آخر. راجعه من صفحة الفريق."), "err"); if (own) memberSheet(own, d, refresh); return; }
    if (mode === "claim" || mode === "resume") {
      const meId = (d.owners || []).find((o) => o.me)?.id;
      const accounts = (own?.accounts || []).filter((a) => !a.member && a.id !== meId);
      UI.modal(`<div class="mhead"><h3>${E(T(mode === "claim" ? "ملفي كمختص" : "العودة للعمل كمختص"))}</h3><button class="iconbtn" id="tf-x" aria-label="${E(T("إغلاق"))}">${UI.icon("x", 20)}</button></div>
        <div class="mform tm-claim">
          <div class="tm-profile">${self.profile?.image_url ? `<img class="tm-av" src="${E(self.profile.image_url)}" alt="">` : `<span class="tm-av">${E(initials(self.profile?.name))}</span>`}<div><b data-i18n-skip>${E(self.profile?.name || "")}</b>
            <small>${E(T(self.profile?.is_active ? "متاح للحجز" : "غير متاح للحجز"))}</small></div></div>
          <p>${E(T(mode === "claim"
            ? "حسابك مرتبط بهذا الملف من قبل. بالتأكيد يصبح ملفك أنت في الفريق: تبقى مالكاً بكل صلاحياتك، وتبقى خدماته ودوامه ومواعيده كما هي. لا يُنشأ ملف جديد ولا يُستخدم مقعد إضافي."
            : "يعود ملفك السابق بخدماته ودوامه. يصبح متاحاً للحجز ويحتاج مقعد مختص في باقتك."))}</p>
          ${mode === "claim" && accounts.length ? `<div class="tm-accounts"><div class="sec-label">${E(T("حسابات أخرى تصل إلى هذا الملف"))}</div>${accounts.map(accountRow).join("")}
            <p class="tiny tm-note">${E(T("لا يتغير أي حساب تلقائياً. يمكنك لاحقاً إزالة وصول المختص من حساب قديم لا يُستخدم. حسابات المالكين لا تتغير من هنا."))}</p></div>` : ""}
          <div class="form-error" id="tf-err"></div>
          <button class="btn" id="tf-go">${UI.icon("check", 17)} ${E(T(mode === "claim" ? "نعم، هذا ملفي" : "العودة للعمل كمختص"))}</button>
        </div>`);
      document.getElementById("tf-x").onclick = UI.closeModal;
      document.querySelectorAll("[data-unlink-acc]").forEach((b) => b.onclick = () => unlinkAccount(accounts.find((a) => a.id === b.dataset.unlinkAcc), refresh));
      document.getElementById("tf-go").onclick = async () => {
        UI.busy("tf-go", true);
        try { await rpc("admin_team_add_self", { p_token: tok(), p_data: { confirm: true } }); after(mode === "claim" ? "أصبح ملف المختص ملفك — جدولك في «جدول عملي»." : "عدت للعمل كمختص — جدولك في «جدول عملي»."); }
        catch (e) { document.getElementById("tf-err").textContent = seatMessage(e); UI.busy("tf-go", false); }
      };
      return;
    }
    if (mode !== "none") { UI.toast(T("توجد دعوة مفتوحة لحسابك. ألغِها أو أكملها من صفحة الفريق."), "err"); return; }
    const seats = d.seats || {};
    const full = !seats.unlimited && Number(seats.active) >= Number(seats.limit);
    const extras = await servicesAndHours("tf", { openHours: true });
    UI.modal(`<div class="mhead"><h3>${E(T("أصبح مختصاً"))}</h3><button class="iconbtn" id="tf-x" aria-label="${E(T("إغلاق"))}">${UI.icon("x", 20)}</button></div>
      <div class="mform"><p class="tiny">${E(T("يُستخدم حسابك نفسه: تبقى مالكاً، ويستقبل ملفك الحجوزات. يحتاج مقعد مختص في باقتك."))}</p>
      ${full ? `<div class="tm-alert">${UI.icon("info", 17)}<span>${E(T("كل مقاعد المختصين في باقتك مستخدمة. التفعيل يحتاج مقعداً إضافياً عبر إدارة METON أو إيقاف مختص آخر.") + seatCost(seats))}</span></div>` : ""}${extras}
      <div class="form-error" id="tf-err"></div><button class="btn" id="tf-go">${E(T("حفظ وتفعيل"))}</button></div>`);
    document.getElementById("tf-x").onclick = UI.closeModal;
    const editor = ScheduleEditor.mount(document.getElementById("tf-days"), ScheduleEditor.fromSchedule({}));
    document.getElementById("tf-go").onclick = async () => {
      const err = document.getElementById("tf-err"); const bad = editor.validate(); if (bad) { err.textContent = bad; return; }
      const services = readServices("tf"); if (!services.length) { err.textContent = T("اختر خدمة واحدة على الأقل يقدمها المختص"); return; }
      UI.busy("tf-go", true);
      try {
        await rpc("admin_team_add_self", { p_token: tok(), p_data: { services, schedule: editor.value(), specialty: document.getElementById("tf-spec").value.trim() } });
        UI.closeModal(); fresh(); try { await Auth.loadContext(); } catch {} UI.toast(T("أصبحت مختصاً في العمل — جدولك في «جدول عملي»."), "ok"); refresh();
      } catch (e) { err.textContent = seatMessage(e); UI.busy("tf-go", false); }
    };
  }
  // One salon account that reaches a profile (Team → member → accounts).
  function accountRow(a) {
    const role = a.role === "admin" ? "حساب مالك" : a.role === "barber" ? "حساب مختص" : "حساب عميل";
    return `<div class="tm-account"><span><b data-i18n-skip>${E(a.name || "—")}</b> <bdi dir="ltr">${E(a.phone || "")}</bdi>
      <small>${E(T(role))}${a.member ? " · " + E(T("عضو الفريق")) : ""} · ${E(a.last_seen ? T("آخر دخول") + " " + when(a.last_seen) : T("لم يُستخدم"))}</small></span>
      ${isOwner() && !a.member && a.role === "barber" ? `<button type="button" class="btn line sm danger-line" data-unlink-acc="${E(a.id)}">${E(T("إزالة وصول المختص"))}</button>` : ""}</div>`;
  }

  // 2.47: the account side of an active member. Without an account: "Link to METON account" (an email invitation for
  // THIS record — its bookings, hours, services and seat stay) or the waiting invitation, and the name / contact number
  // the owner keeps. With one: "Remove account access" (the record and its history stay).
  function accountBlock(m) {
    if (m.user_id) {
      return `<div class="tm-account-side"><button class="btn line danger-line" id="tm-unlink">${UI.icon("logout", 16)} ${E(T("إزالة وصول الحساب"))}</button>
        <p class="tiny tm-note">${E(T("يفقد حسابه صلاحيات الفريق هنا فقط. يبقى ملفه ومواعيده وسجله، ويبقى حسابه في METON وحجوزاته له."))}</p></div>`;
    }
    const waiting = m.inviteEmail && m.invite?.status === "pending";
    return `<div class="tm-verify tm-link-box">${UI.icon(waiting ? "mail" : "user", 20)}<div>
        <b>${E(T(waiting ? "دعوة ربط بانتظار الرد" : "ربط بحساب METON"))}</b>
        ${waiting ? `<p>${E(T("أُرسلت إلى"))} <bdi dir="ltr" data-i18n-skip>${E(m.inviteEmail)}</bdi>. ${E(T("يبقى العضو يعمل كما هو حتى يقبل صاحب هذا البريد من حسابه."))}</p>
          <div class="btn-row"><button class="btn sm" id="tm-link-again">${UI.icon("refresh", 15)} ${E(T("إرسال من جديد"))}</button><button class="btn line sm danger-line" id="tm-link-cancel">${E(T("إلغاء دعوة الربط"))}</button></div>`
        : `<p>${E(T("هذا العضو بدون حساب: تديره أنت. أرسل دعوة إلى بريده ليدخل التطبيق بدوره وصلاحياته — بنفس الملف والمواعيد والمقعد."))}</p>
          <div class="field"><input id="tm-link-email" class="input" type="email" inputmode="email" autocomplete="off" autocapitalize="off" spellcheck="false" dir="ltr" maxlength="254" placeholder="name@example.com"></div>
          <button class="btn sm" id="tm-link-send">${UI.icon("mail", 15)} ${E(T("إرسال دعوة الربط"))}</button>`}
      </div></div>
      <details class="tm-edit"><summary>${E(T("تعديل الاسم ورقم التواصل"))}</summary>
        <div class="field"><label for="tm-edit-name">${E(T("الاسم"))}</label><input id="tm-edit-name" class="input" maxlength="120" dir="auto" value="${E(m.name || "")}"></div>
        <div class="field"><label for="tm-edit-phone">${E(T("رقم التواصل (اختياري)"))}</label><input id="tm-edit-phone" class="input" type="tel" inputmode="tel" dir="ltr" maxlength="20" value="${E(m.phone || "")}"></div>
        <button class="btn sm" id="tm-edit-save">${E(T("حفظ"))}</button></details>`;
  }

  // ---- one member ----------------------------------------------------------------
  async function memberSheet(m, d, refresh, tab = "profile") {
    if (!m) return;
    const tabs = [{ v: "profile", l: T("الملف") }];
    if (["invited", "accepted", "active"].includes(m.status)) tabs.push({ v: "perms", l: T("الصلاحيات") }, { v: "role", l: T("الدور") });
    if (m.barber_id && m.status !== "inactive") tabs.push({ v: "work", l: T("الخدمات والدوام") });
    UI.modal(`<div class="mhead"><h3 data-i18n-skip>${E(m.status === "invited" ? T("دعوة مرسلة") : m.name)}</h3><button class="iconbtn" id="tm-x" aria-label="${E(T("إغلاق"))}">${UI.icon("x", 20)}</button></div>
      ${tabs.length > 1 ? UI.seg("tm-tabs", tabs, tab) : ""}<div id="tm-body" class="tm-body"></div>`);
    document.getElementById("tm-x").onclick = UI.closeModal;
    const host = document.getElementById("tm-body");
    const show = (v) => ({ profile, perms, role, work })[v]();
    if (tabs.length > 1) UI.wireSeg("tm-tabs", show);
    show(tab);
    const done = (msg) => { UI.closeModal(); fresh(); if (msg) UI.toast(T(msg), "ok"); refresh?.(); };

    function profile() {
      const invite = m.invite || {};
      const byEmail = !!m.inviteEmail;
      host.innerHTML = `<div class="tm-profile">${avatar(m)}<div><b data-i18n-skip${m.status === "invited" && byEmail ? ` dir="ltr"` : ""}>${E(m.status === "invited" ? (m.inviteEmail || T("لم يقبل أحد بعد")) : m.name)}</b>
          <small><span class="tm-role tm-role-${E(m.role)}">${E(roleName(m))}</span> ${statusBadge(m.status)}</small>
          ${m.phone && m.status !== "invited" ? `<small dir="ltr" data-i18n-skip>${E(m.phone)}</small>` : ""}</div></div>
        ${m.status === "accepted" ? `<div class="tm-verify">${UI.icon("shield", 20)}<div><b>${E(T("تحقّق قبل التفعيل"))}</b><p>${E(T("هذا الاسم والرقم من حساب الشخص نفسه في METON. تأكد أنه الشخص الذي دعوته — الرابط قد يُعاد إرساله لغيره."))}</p></div></div>
          <div class="btn-row"><button class="btn" id="tm-activate">${UI.icon("check", 17)} ${E(T("تفعيل العضو"))}</button><button class="btn line danger-line" id="tm-refuse">${E(T("رفض"))}</button></div>` : ""}
        ${m.status === "invited" && byEmail ? `<p class="tiny">${E(T(invite.status === "expired" ? "انتهت صلاحية الدعوة." : "أُرسلت الدعوة بالبريد وتنتظر ردّه. لا يحصل على أي صلاحية قبل أن يقبل."))} ${invite.expires_at && invite.status !== "expired" ? E(T("صالحة حتى")) + " " + E(when(invite.expires_at)) : ""}</p>
          <div class="btn-row"><button class="btn" id="tm-again">${UI.icon("refresh", 16)} ${E(T("إرسال الدعوة من جديد"))}</button><button class="btn line danger-line" id="tm-revoke">${E(T("إلغاء الدعوة"))}</button></div>` : ""}
        ${m.status === "invited" && !byEmail ? `<p class="tiny">${E(T(invite.status === "expired" ? "انتهت صلاحية الرابط." : invite.opened ? "فُتح الرابط ولم يُقبل بعد." : "لم يُفتح الرابط بعد."))} ${invite.expires_at ? E(T("صالح حتى")) + " " + E(when(invite.expires_at)) : ""}</p>
          <div class="btn-row"><button class="btn" id="tm-again">${UI.icon("refresh", 16)} ${E(T("رابط جديد"))}</button><button class="btn line danger-line" id="tm-revoke">${E(T("إلغاء الدعوة"))}</button></div>` : ""}
        ${["declined", "revoked", "inactive"].includes(m.status) ? `<div class="btn-row">${m.status === "inactive" && m.user_id && isOwner() && !m.owner ? `<button class="btn" id="tm-reactivate">${UI.icon("check", 16)} ${E(T("إعادة التفعيل"))}</button>` : ""}<button class="btn line" id="tm-again">${UI.icon("refresh", 16)} ${E(T("دعوة من جديد"))}</button></div>` : ""}
        ${m.status === "active" && m.role === "specialist" && m.profile && isOwner() ? `<label class="notification-toggle tm-avail"><span><b>${E(T("متاح للحجز"))}</b><small>${E(T("الإيقاف المؤقت يمنع الحجوزات الجديدة فقط. يبقى الملف والمقعد والمواعيد المحجوزة والصلاحيات كما هي، والعودة لا تحتاج مقعداً جديداً."))}</small></span>
          <input type="checkbox" id="tm-avail" ${!m.paused && m.profile.is_active ? "checked" : ""}></label>` : ""}
        ${m.status === "active" && m.role !== "specialist" && !m.owner && isOwner() ? `<label class="notification-toggle tm-avail"><span><b>${E(T("يستقبل حجوزات"))}</b><small>${E(T("يصبح قابلاً للحجز ويأخذ مقعد مختص واحداً. حدّد خدماته وأوقاته من «الخدمات والدوام»."))}</small></span>
          <input type="checkbox" id="tm-bookable" ${m.barber_id && m.profile?.is_active ? "checked" : ""}></label>` : ""}
        ${m.status === "active" && !m.owner && isOwner() ? accountBlock(m) : ""}
        ${window.Control?.target() && m.role === "specialist" && m.barber_id && (m.claim_locked || !m.user_id) ? `<div class="tm-verify">${UI.icon("shield", 20)}<div><b>${E(T("ربط الملف بعد التحقق (METON)"))}</b>
          <p>${E(T("بعد التأكد من هوية صاحب الملف، اختر حسابه. لا يتغير أي حساب آخر."))}</p>
          <div class="field"><select id="tm-assign-user" class="input">${(m.accounts || []).filter((a) => !a.disabled).map((a) => `<option value="${E(a.id)}">${E(a.name || "")} ${E(a.phone || "")}</option>`).join("")}</select></div>
          <div class="field"><input id="tm-assign-reason" class="input" maxlength="300" dir="auto" placeholder="${E(T("كيف تم التحقق؟"))}"></div>
          <button class="btn sm" id="tm-assign">${E(T("ربط بهذا الحساب"))}</button></div></div>` : ""}
        ${(m.accounts || []).length > 1 || (m.accounts || []).some((a) => !a.member) ? `<div class="tm-accounts"><div class="sec-label">${E(T("الحسابات المرتبطة بهذا الملف"))}</div>${m.accounts.map(accountRow).join("")}
          <p class="tiny tm-note">${E(T("لا يتغير أي حساب تلقائياً. حسابات المالكين لا تتغير من هنا."))}</p></div>` : ""}
        ${m.status === "active" ? `<div class="list tm-links">
          ${window.Workforce && Features.enabled("attendance") ? `<button type="button" class="lrow" data-nav="${navBase()}/biz-attendance"><div class="ic">${UI.icon("clock", 18)}</div><div class="t">${E(T("الحضور والانصراف"))}</div><span class="chev">${UI.icon("chev", 18)}</span></button>` : ""}
          ${m.barber_id ? `<button type="button" class="lrow" data-nav="${navBase()}/schedule?b=${E(m.barber_id)}"><div class="ic">${UI.icon("calendar", 18)}</div><div class="t">${E(T("جدول المختص"))}</div><span class="chev">${UI.icon("chev", 18)}</span></button>` : ""}
        </div>
        <button class="btn line danger-line" id="tm-leave">${UI.icon("logout", 16)} ${E(T(m.owner ? "التوقف عن العمل كمختص" : "إنهاء العضوية"))}</button>
        <p class="tiny tm-note">${E(T(m.owner ? "تبقى مالك العمل بكل صلاحياتك. يتوقف ملفك عن استقبال الحجوزات ويمكنك العودة لاحقاً بنفس الملف." : "إنهاء العضوية يوقف صلاحياته في العمل فقط. حسابه وسجل حجوزاته ومدفوعاته وحضوره تبقى محفوظة."))}</p>` : ""}`;
      host.querySelectorAll("[data-nav]").forEach((b) => b.addEventListener("click", () => UI.closeModal()));
      const act = (id, fn) => { const b = document.getElementById(id); if (b) b.onclick = fn; };
      act("tm-activate", async () => { UI.busy("tm-activate", true); try { await rpc("admin_team_activate", { p_token: tok(), p_member: m.id }); done("تم تفعيل العضو"); } catch (e) { UI.toast(seatMessage(e), "err"); UI.busy("tm-activate", false); } });
      act("tm-refuse", () => UI.confirm("رفض هذا الشخص وإلغاء الدعوة؟", async () => { try { await rpc("admin_team_invite_revoke", { p_token: tok(), p_member: m.id }); done("تم الإلغاء"); } catch (e) { UI.toast(e.message, "err"); } }, true));
      act("tm-revoke", () => UI.confirm(byEmail ? "إلغاء الدعوة؟ لن يستطيع قبولها بعد الآن." : "إلغاء الدعوة؟ لن يعمل الرابط بعد الآن.", async () => { try { await rpc("admin_team_invite_revoke", { p_token: tok(), p_member: m.id }); done("تم الإلغاء"); } catch (e) { UI.toast(e.message, "err"); } }, true));
      act("tm-reactivate", () => UI.confirm(m.role === "specialist" ? "إعادة تفعيله بنفس الملف؟ يحتاج مقعد مختص متاحاً في باقتك." : "إعادة تفعيل هذا العضو؟", async () => {
        try { await rpc("admin_team_reactivate", { p_token: tok(), p_member: m.id }); done("تمت إعادة التفعيل"); } catch (e) { UI.toast(seatMessage(e), "err"); }
      }));
      act("tm-assign", async () => {
        const user = document.getElementById("tm-assign-user")?.value, reason = document.getElementById("tm-assign-reason").value.trim();
        if (!user) { UI.toast(T("لا يوجد حساب مرتبط بهذا الملف"), "err"); return; }
        try { await rpc("admin_team_assign_profile", { p_token: tok(), p_member: m.id, p_user: user, p_reason: reason }); done("تم ربط الملف"); } catch (e) { UI.toast(seatMessage(e), "err"); }
      });
      act("tm-again", async () => {
        try {
          // 2.45: an invitation sent by email goes again by email (a fresh one; the earlier one stops).
          if (byEmail) { const r = await rpc("admin_team_invite_email_again", { p_token: tok(), p_member: m.id }); done(); UI.toast(`${T("أُرسلت الدعوة من جديد إلى")} ${r.email}`, "ok"); return; }
          const r = await rpc("admin_team_invite_again", { p_token: tok(), p_member: m.id }); fresh(); shareInvite(r, refresh);
        } catch (e) { UI.toast(e.message, "err"); }
      });
      act("tm-leave", () => deactivate(m, refresh));
      // 2.47: Link to METON account (the same record), cancel / send again, remove account access, edit an unlinked member.
      act("tm-link-send", async () => {
        const email = document.getElementById("tm-link-email").value.trim().toLowerCase();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email)) { UI.toast(T("أدخل بريداً إلكترونياً صحيحاً"), "err"); return; }
        UI.busy("tm-link-send", true);
        try { const r = await rpc("admin_team_link_email", { p_token: tok(), p_member: m.id, p_email: email, p_lang: Lang.get() }); done(); UI.toast(`${T("أُرسلت دعوة الربط إلى")} ${r.email}`, "ok"); }
        catch (e) { UI.toast(e.message, "err"); UI.busy("tm-link-send", false); }
      });
      act("tm-link-again", async () => {
        try { const r = await rpc("admin_team_link_email", { p_token: tok(), p_member: m.id, p_email: m.inviteEmail, p_lang: Lang.get() }); done(); UI.toast(`${T("أُرسلت دعوة الربط إلى")} ${r.email}`, "ok"); }
        catch (e) { UI.toast(e.message, "err"); }
      });
      act("tm-link-cancel", () => UI.confirm("إلغاء دعوة الربط؟ يبقى العضو يعمل كما هو.", async () => {
        try { await rpc("admin_team_link_cancel", { p_token: tok(), p_member: m.id }); done("تم الإلغاء"); } catch (e) { UI.toast(e.message, "err"); }
      }, true));
      act("tm-unlink", () => UI.confirm("إزالة وصول حسابه؟ يبقى ملفه ومواعيده وسجله كما هي، ويبقى متاحاً للحجز إن كان يستقبل حجوزات. يبقى حسابه في METON له.", async () => {
        try { await rpc("admin_team_unlink_member", { p_token: tok(), p_member: m.id, p_reason: "" }); done("تمت إزالة وصول الحساب"); } catch (e) { UI.toast(e.message, "err"); }
      }, true));
      act("tm-edit-save", async () => {
        UI.busy("tm-edit-save", true);
        try { await rpc("admin_team_edit_unlinked", { p_token: tok(), p_member: m.id, p_data: { name: document.getElementById("tm-edit-name").value.trim(), phone: document.getElementById("tm-edit-phone").value.replace(/[^0-9+]/g, "") } }); rpcCacheBust("list_barbers"); done("تم الحفظ"); }
        catch (e) { UI.toast(e.message, "err"); UI.busy("tm-edit-save", false); }
      });
      const bookableBox = document.getElementById("tm-bookable");
      if (bookableBox) bookableBox.onchange = async () => {
        bookableBox.disabled = true;
        try {
          const r = await rpc("admin_team_set_bookable", { p_token: tok(), p_member: m.id, p_on: bookableBox.checked, p_data: {} });
          rpcCacheBust("list_barbers");
          if (r?.blocked) { bookableBox.checked = true; UI.closeModal(); conflictsSheet(r.bookings, m, refresh, T("انقل مواعيده القادمة أو ألغها أولاً")); return; }
          done(bookableBox.checked ? "أصبح يستقبل حجوزات — حدّد خدماته وأوقاته" : "لم يعد يستقبل حجوزات جديدة");
        } catch (e) { bookableBox.checked = !bookableBox.checked; bookableBox.disabled = false; UI.toast(seatMessage(e), "err"); }
      };
      host.querySelectorAll("[data-unlink-acc]").forEach((b) => b.onclick = () => unlinkAccount(m.accounts.find((a) => a.id === b.dataset.unlinkAcc), refresh));
      const avail = document.getElementById("tm-avail");
      if (avail) avail.onchange = async () => {
        avail.disabled = true;
        try {
          const r = await rpc("admin_team_set_availability", { p_token: tok(), p_member: m.id, p_on: avail.checked });
          m.profile = r.profile; m.paused = r.paused; fresh(); rpcCacheBust("list_barbers");
          UI.toast(T(avail.checked ? "أصبح متاحاً للحجز" : "متوقف مؤقتاً عن الحجوزات الجديدة"), "ok");
          if (!avail.checked && r.upcoming?.length) UI.toast(`${Lang.number(r.upcoming.length)} ${T("موعد قادم ما زال محجوزاً — انقله أو ألغه إذا لزم.")}`, "ok");
        } catch (e) { avail.checked = !avail.checked; UI.toast(seatMessage(e), "err"); }
        avail.disabled = false;
      };
    }
    function perms() {
      host.innerHTML = `${isOwner() ? "" : `<p class="tiny">${E(T("يعدّل الصلاحيات مالك العمل فقط."))}</p>`}${permsEditor(m.permissions)}
        <div class="form-error" id="tp-err"></div><button class="btn" id="tp-save">${E(T("حفظ الصلاحيات"))}</button>`;
      const get = wirePerms(host);
      document.getElementById("tp-save").onclick = async () => {
        UI.busy("tp-save", true);
        try { await rpc("admin_team_set_permissions", { p_token: tok(), p_member: m.id, p_permissions: get() }); done("تم حفظ الصلاحيات"); }
        catch (e) { document.getElementById("tp-err").textContent = e.message; UI.busy("tp-save", false); }
      };
    }
    function role() {
      host.innerHTML = `<div class="tm-roles compact">${Object.entries(ROLES).map(([k, r]) => `<button type="button" class="tm-role-card ${k === m.role ? "on" : ""}" data-role="${k}">${UI.icon(r.i, 18)}<b>${E(T(r.l))}</b><small>${E(T(r.d))}</small></button>`).join("")}</div>
        <div class="field"><label for="tr-title">${E(T("المسمى"))}</label><input id="tr-title" class="input" maxlength="80" dir="auto" value="${E(m.title || "")}"></div>
        <div id="tr-extra"></div><div class="form-error" id="tr-err"></div><button class="btn" id="tr-save">${E(T("حفظ الدور"))}</button>`;
      let next = m.role, editor = null;
      const paint = async () => {
        host.querySelectorAll(".tm-role-card").forEach((b) => b.classList.toggle("on", b.dataset.role === next));
        const extra = document.getElementById("tr-extra");
        if (next === "specialist" && m.role !== "specialist") {
          extra.innerHTML = `<div class="tm-alert">${UI.icon("info", 17)}<span>${E(T("سيصبح قابلاً للحجز ويأخذ مقعد مختص في باقتك. إذا امتلأت المقاعد يلزم مقعد إضافي عبر إدارة METON.") + seatCost())}</span></div>` + await servicesAndHours("tr", { openHours: true });
          editor = ScheduleEditor.mount(document.getElementById("tr-days"), ScheduleEditor.fromSchedule(m.schedule || {}));
        } else if (m.role === "specialist" && next !== "specialist") {
          extra.innerHTML = `<div class="tm-alert">${UI.icon("info", 17)}<span>${E(T("لن يستقبل حجوزات بعد الآن. يجب نقل مواعيده القادمة أو إلغاؤها أولاً."))}</span></div>`; editor = null;
        } else { extra.innerHTML = ""; editor = null; }
      };
      host.querySelectorAll(".tm-role-card").forEach((b) => b.onclick = () => { next = b.dataset.role; paint(); });
      document.getElementById("tr-save").onclick = async () => {
        const err = document.getElementById("tr-err"); err.textContent = "";
        const data = { role: next, title: document.getElementById("tr-title").value.trim() };
        if (next === "other" && !data.title) { err.textContent = T("اكتب المسمى الوظيفي"); return; }
        if (editor) { const bad = editor.validate(); if (bad) { err.textContent = bad; return; } data.schedule = editor.value(); data.services = readServices("tr"); data.specialty = document.getElementById("tr-spec")?.value.trim() || ""; }
        const go = async () => {
          UI.busy("tr-save", true);
          try { await rpc("admin_team_set_role", { p_token: tok(), p_member: m.id, p_data: data }); done("تم حفظ الدور"); }
          catch (e) { if (/has_future_bookings|مواعيد قادمة/.test(e.rawMessage || e.message)) { UI.closeModal(); deactivate(m, refresh, { roleChange: data }); return; } err.textContent = seatMessage(e); UI.busy("tr-save", false); }
        };
        if (next === "specialist" && m.role !== "specialist") UI.confirm("تحويله إلى مختص يأخذ مقعد مختص في باقتك. متابعة؟", go); else go();
      };
    }
    async function work() {
      host.innerHTML = UI.loading();
      const extras = await servicesAndHours("tw", { services: m.services, specialty: m.profile?.specialty, openHours: true });
      // 2.34: a round preview and Change / Remove (the photo itself is never
      // shown as text). Avatars are square, sized for a profile picture.
      let photo = m.profile?.image_url || "";
      host.innerHTML = `<div class="field"><label>${E(T("صورة المختص"))}</label><div class="tm-photo-field"><span class="tm-photo" id="tw-photo"></span>
          <div class="btn-row"><button type="button" class="btn line sm" id="tw-pick">${UI.icon("image", 16)} <span>${E(T(photo ? "تغيير الصورة" : "اختيار صورة"))}</span></button>
          <button type="button" class="btn line sm danger-line" id="tw-clear" ${photo ? "" : "hidden"}>${E(T("إزالة الصورة"))}</button></div></div>
          <p class="tiny">${E(T("تظهر الصورة دائرية في الفريق والحجز والمواعيد. اختر صورة للوجه بإضاءة جيدة."))}</p></div>
        ${extras}<div class="form-error" id="tw-err"></div><button class="btn" id="tw-save">${E(T("حفظ"))}</button>`;
      const paintPhoto = () => {
        document.getElementById("tw-photo").innerHTML = photo ? `<img src="${E(photo)}" alt="" data-initial="${E(initials(m.name))}">` : `<b>${E(initials(m.name))}</b>`;
        document.getElementById("tw-clear").hidden = !photo;
      };
      paintPhoto();
      const editor = ScheduleEditor.mount(document.getElementById("tw-days"), ScheduleEditor.fromSchedule(m.profile?.schedule || {}));
      document.getElementById("tw-pick").onclick = () => UI.pickImage((url) => { photo = url; paintPhoto(); }, { mode: "avatar" });
      document.getElementById("tw-clear").onclick = () => { photo = ""; paintPhoto(); };
      document.getElementById("tw-save").onclick = async () => {
        const err = document.getElementById("tw-err"); const bad = editor.validate(); if (bad) { err.textContent = bad; return; }
        UI.busy("tw-save", true);
        try {
          if (isOwner()) await rpc("admin_team_update", { p_token: tok(), p_member: m.id, p_data: { specialty: document.getElementById("tw-spec").value.trim(), image_url: photo, services: readServices("tw") } });
          const r = await rpc("admin_team_save_schedule", { p_token: tok(), p_member: m.id, p_schedule: editor.value() });
          rpcCacheBust("list_barbers"); rpcCacheBust("get_barber");
          if (r?.conflicts?.length) { UI.closeModal(); conflictsSheet(r.conflicts, m, refresh, T("هذه المواعيد خارج أوقات العمل الجديدة")); return; }
          done("تم الحفظ");
        } catch (e) { err.textContent = e.message; UI.busy("tw-save", false); }
      };
    }
  }
  function seatMessage(e) {
    return /specialist_limit_reached|الحد الأقصى لعدد المختصين/.test(e.rawMessage || e.message || "")
      ? `${e.message} ${T("اطلب مقعداً إضافياً من إدارة METON (صفحة الباقة).")}${seatCost()}` : e.message;
  }
  // 2.43: what one more Specialist seat costs THIS salon (its own subscription's price, in US dollars — Paddle
  // charges USD only), from the team data (seats.seat_price, salonieer_private.salon_seat_price). Never a fixed «₪15».
  let lastSeats = null;
  function seatCost(seats) {
    const price = window.Money ? Money.seat((seats || lastSeats || {}).seat_price) : "";
    return price ? ` ${T("سعر المقعد الإضافي:")} ${price}.` : "";
  }

  // ---- leaving / handover -----------------------------------------------------------
  async function deactivate(m, refresh, opts = {}) {
    const run = async () => {
      if (opts.roleChange) return rpc("admin_team_set_role", { p_token: tok(), p_member: m.id, p_data: opts.roleChange });
      return rpc("admin_team_deactivate", { p_token: tok(), p_member: m.id, p_reason: "" });
    };
    let r;
    try {
      const upcoming = m.barber_id ? await rpc("admin_team_future_bookings", { p_token: tok(), p_member: m.id }) : [];
      if (upcoming.length) { conflictsSheet(upcoming, m, refresh, T("انقل كل موعد قادم إلى مختص آخر أو ألغِه، ثم أكمل."), run); return; }
    } catch (e) { UI.toast(e.message, "err"); return; }
    UI.confirm(opts.roleChange ? "تغيير الدور الآن؟" : m.owner ? "التوقف عن العمل كمختص؟ تبقى مالك العمل." : "إنهاء عضوية هذا الشخص في الفريق؟", async () => {
      try { r = await run(); if (r?.blocked) { conflictsSheet(r.bookings, m, refresh, T("ما زالت هناك مواعيد قادمة."), run); return; } UI.closeModal(); fresh(); UI.toast(T("تم"), "ok"); refresh?.(); }
      catch (e) { UI.toast(e.message, "err"); }
    }, true);
  }
  // Appointments that need a decision: move (only to a free specialist who
  // offers the service) or cancel (the customer is notified). Nothing silent.
  function conflictsSheet(list, m, refresh, lead, after) {
    const row = (b) => `<div class="tm-conflict" data-bk="${E(b.id)}"><div><b>${E(Smart.dayLabel ? Smart.dayLabel(b.date) : b.date)} · <bdi>${E(b.time)}</bdi></b><small data-i18n-skip>${E(b.customer || "")} · ${E(b.service || "")}</small></div>
      <div class="btn-row"><button class="btn sm" data-move="${E(b.id)}">${E(T("نقل"))}</button><button class="btn line sm danger-line" data-cancel="${E(b.id)}">${E(T("إلغاء"))}</button></div><div class="tm-moves" id="mv-${E(b.id)}"></div></div>`;
    UI.modal(`<div class="mhead"><h3>${E(T("مواعيد تحتاج قرارك"))}</h3><button class="iconbtn" id="tc-x">${UI.icon("x", 20)}</button></div>
      <p class="tiny">${E(lead || "")}</p><div class="tm-conflicts">${list.map(row).join("")}</div>
      ${after ? `<button class="btn" id="tc-done" disabled>${E(T("متابعة"))}</button>` : ""}`);
    const left = new Set(list.map((b) => b.id));
    const settle = (id) => { left.delete(id); document.querySelector(`[data-bk="${CSS.escape(id)}"]`)?.classList.add("done"); const btn = document.getElementById("tc-done"); if (btn) btn.disabled = left.size > 0; };
    document.getElementById("tc-x").onclick = () => { UI.closeModal(); fresh(); refresh?.(); };
    document.querySelectorAll("[data-move]").forEach((b) => b.onclick = async () => {
      const id = b.dataset.move, box = document.getElementById("mv-" + id);
      box.innerHTML = UI.loading();
      try {
        const opts = await rpc("admin_team_reassign_options", { p_token: tok(), p_booking: id });
        box.innerHTML = opts.length ? opts.map((o) => `<button class="chip" data-to="${E(o.id)}" data-i18n-skip>${E(o.name)}</button>`).join("") : `<small>${E(T("لا يوجد مختص متاح يقدم هذه الخدمة في هذا الوقت."))}</small>`;
        box.querySelectorAll("[data-to]").forEach((c) => c.onclick = async () => {
          try { await rpc("admin_team_reassign_booking", { p_token: tok(), p_booking: id, p_barber: c.dataset.to }); box.innerHTML = `<small>${UI.icon("check", 14)} ${E(T("نُقل الموعد وأُبلغ العميل"))}</small>`; settle(id); }
          catch (e) { UI.toast(e.message, "err"); }
        });
      } catch (e) { box.innerHTML = ""; UI.toast(e.message, "err"); }
    });
    document.querySelectorAll("[data-cancel]").forEach((b) => b.onclick = async () => {
      const id = b.dataset.cancel;
      try { await rpc("admin_update_booking", { p_token: tok(), p_id: id, p_status: "cancelled", p_note: null }); document.getElementById("mv-" + id).innerHTML = `<small>${E(T("أُلغي الموعد وأُبلغ العميل"))}</small>`; settle(id); }
      catch (e) { UI.toast(e.message, "err"); }
    });
    const done = document.getElementById("tc-done");
    if (done) done.onclick = async () => {
      try { const r = await after(); if (r?.blocked) { UI.toast(T("ما زالت هناك مواعيد قادمة."), "err"); return; } UI.closeModal(); fresh(); UI.toast(T("تم"), "ok"); refresh?.(); }
      catch (e) { UI.toast(e.message, "err"); }
    };
  }

  // ---- Settings → Permissions (same records as the Team page) -------------------------
  async function permissionsPage(body) {
    const d = await rpc("admin_team_list", { p_token: tok() });
    const list = (d.members || []).filter((m) => ["invited", "accepted", "active"].includes(m.status));
    const label = (k) => T(PERMS.flatMap((g) => g.items).find((x) => x[0] === k)?.[1] || k);
    body.innerHTML = `<p class="tiny">${E(T("ما يستطيع كل عضو إدارته. المالك يملك كل الصلاحيات دائماً. التغيير يسري فوراً."))}</p>
      ${list.length ? `<div class="tm-list">${list.map((m) => `<button type="button" class="tm-card tm-perm-card" data-member="${E(m.id)}">${avatar(m)}
        <span class="tm-card-main"><b data-i18n-skip>${E(m.status === "invited" ? T("بانتظار قبول الدعوة") : m.name)}</b><small><span class="tm-role tm-role-${E(m.role)}">${E(roleName(m))}</span></small>
        <span class="tm-perm-sum">${m.permissions.length ? m.permissions.slice(0, 4).map((p) => `<em>${E(label(p))}</em>`).join("") + (m.permissions.length > 4 ? `<em>+${Lang.number(m.permissions.length - 4)}</em>` : "") : `<em class="none">${E(T("بدون صلاحيات إدارية"))}</em>`}</span></span>${UI.icon("chev", 16)}</button>`).join("")}</div>`
        : UI.empty(T("لا يوجد أعضاء بعد"), T("أضف أعضاء الفريق من صفحة الفريق."), T("الفريق"), navBase() + "/barbers")}`;
    body.querySelectorAll("[data-member]").forEach((el) => el.onclick = () => memberSheet(list.find((m) => m.id === el.dataset.member), d, () => { fresh(); permissionsPage(body); }, "perms"));
  }

  // ---- Action Center ---------------------------------------------------------------
  const PKG_STATUS = { pending: ["بانتظار الدفع", "amber"], fulfilled: ["تم البيع", "ok"], cancelled: ["ألغاه العميل", "muted"], declined: ["مرفوض", "muted"] };
  const pkgMoney = (q) => q.price !== undefined && q.price !== null ? (window.Money ? Money.fmt(q.price, Money.fromSymbol(q.currency) || Money.fromSymbol(q.symbol) || Money.code()) : `${Lang.number(q.price)} ${q.symbol || ""}`.trim()) : "";
  function packageItem(q, focused) {
    const st = PKG_STATUS[q.status] || [q.status, "muted"];
    return `<div class="ac-item ${focused ? "ac-focus" : ""}" id="pkg-${E(q.id)}" data-pkg-item="${E(q.id)}"><div><b data-i18n-skip>${E(q.customer_name || q.customer_phone || "")}</b>
        <small><span data-i18n-skip>${E(q.package_name || "")}</span>${pkgMoney(q) ? ` · <bdi>${E(pkgMoney(q))}</bdi>` : ""} · <bdi dir="ltr">${E(q.customer_phone || "")}</bdi> · <time title="${E(new Date(q.created_at).toLocaleString(Lang.locale()))}">${E(window.Smart ? Smart.ago(q.created_at) : when(q.created_at))}</time></small>
        ${q.note ? `<small data-i18n-skip>${E(q.note)}</small>` : ""}
        ${q.status !== "pending" ? `<small><span class="badge ${st[1]}">${E(T(st[0]))}</span>${q.reason ? ` · <span data-i18n-skip>${E(q.reason)}</span>` : ""}${q.receipt_no ? ` · <bdi dir="ltr">#${E(q.receipt_no)}</bdi>` : ""}</small>` : ""}</div>
      ${q.status === "pending" ? `<div class="btn-row">${window.Business && Features.enabled("smart_checkout") && Auth.can("checkout") ? `<button class="btn sm" data-pkg-sell="${E(q.id)}">${E(T("تسجيل الدفع"))}</button>` : ""}<button class="btn line sm danger-line" data-pkg-no="${E(q.id)}">${E(T("رفض"))}</button></div>` : ""}</div>`;
  }
  async function requestsPage(body) {
    const r = await rpc("admin_requests", { p_token: tok() });
    // Opened from a notification: that request, whatever its state now.
    const params = new URLSearchParams(location.hash.split("?")[1] || "");
    const focus = params.get("focus") || "";
    let focused = null;
    const pkgs = r.package_requests || [];
    if (focus && params.get("type") === "packages" && /^[0-9a-f-]{36}$/i.test(focus)) {
      focused = pkgs.find((q) => q.id === focus) || null;
      if (!focused) { try { focused = await rpc("admin_biz_get_package_request", { p_token: tok(), p_id: focus }); } catch { focused = { missing: true }; } }
    }
    const sec = (title, icon, inner, n, id = "") => `<section class="ac-section" ${id ? `id="${id}"` : ""}><h2>${UI.icon(icon, 18)}<span>${E(T(title))}</span>${n ? `<em>${Lang.number(n)}</em>` : ""}</h2>${inner}</section>`;
    const none = (t) => `<p class="muted ac-none">${E(T(t))}</p>`;
    const accepted = r.accepted_invites || [], membership = r.membership || [], teamReq = r.team_requests || [], time = r.time_requests || [];
    const total = accepted.length + membership.length + teamReq.length + time.length + pkgs.length;
    const handled = focused && !focused.missing && focused.status !== "pending" ? focused : null;
    body.innerHTML = `${focused?.missing ? `<div class="tm-alert">${UI.icon("info", 17)}<span>${E(T("هذا الطلب لم يعد موجوداً."))}</span></div>` : ""}
      ${handled ? sec("الطلب الذي فتحته", "star", `<p class="tiny">${E(T("تمت معالجة هذا الطلب — هذه حالته النهائية."))}</p>${packageItem(handled, true)}`, 0, "ac-opened") : ""}
      ${total ? "" : `<div class="card">${UI.empty(T("لا توجد طلبات"), T("كل ما يحتاج قرارك سيظهر هنا."))}</div>`}
      ${"package_requests" in r ? sec("طلبات شراء الباقات", "star", pkgs.length ? pkgs.map((q) => packageItem(q, q.id === focus)).join("") : none("لا توجد طلبات باقات"), pkgs.length, "ac-packages") : ""}
      ${r.owner ? sec("دعوات مقبولة بانتظار التفعيل", "users", accepted.length ? accepted.map((m) => `<div class="ac-item"><div><b data-i18n-skip>${E(m.name)}</b><small><bdi dir="ltr">${E(m.phone || "")}</bdi> · ${E(roleName(m))}</small></div>
        <div class="btn-row"><button class="btn sm" data-activate="${E(m.id)}">${E(T("تفعيل"))}</button><button class="btn line sm danger-line" data-refuse="${E(m.id)}">${E(T("رفض"))}</button></div></div>`).join("") : none("لا توجد دعوات بانتظار التفعيل"), accepted.length) : ""}
      ${"membership" in r ? sec("طلبات انضمام العملاء", "user", membership.length ? membership.map((u) => `<div class="ac-item"><div><b data-i18n-skip>${E(u.name || u.phone)}</b><small><bdi dir="ltr">${E(u.phone)}</bdi> · ${E(when(u.requested_at))}</small></div>
        <div class="btn-row"><button class="btn sm" data-member-ok="${E(u.id)}">${E(T("قبول"))}</button><button class="btn line sm danger-line" data-member-no="${E(u.id)}">${E(T("رفض"))}</button></div></div>`).join("") : none("لا توجد طلبات انضمام"), membership.length) : ""}
      ${r.owner ? sec("طلبات الانضمام إلى الفريق", "scissors", teamReq.length ? teamReq.map((q) => `<div class="ac-item"><div><b data-i18n-skip>${E(q.name || q.phone)}</b><small><bdi dir="ltr">${E(q.phone)}</bdi>${q.message ? ` · <span data-i18n-skip>${E(q.message)}</span>` : ""}</small></div>
        <div class="btn-row"><button class="btn sm" data-team-ok="${E(q.id)}">${E(T("مراجعة وقبول"))}</button><button class="btn line sm danger-line" data-team-no="${E(q.id)}">${E(T("رفض"))}</button></div></div>`).join("") : none("لا توجد طلبات"), teamReq.length) : ""}
      ${"time_requests" in r ? sec("الإجازات وتعديل الدوام", "calendar", time.length ? time.map((t) => `<div class="ac-item"><div><b data-i18n-skip>${E(t.name)}</b>
          <small>${E(T(t.kind === "leave" ? "إجازة" : "تعديل أوقات العمل"))}${t.kind === "leave" ? ` · ${E(t.day_from)}${t.day_to !== t.day_from ? " → " + E(t.day_to) : ""}${t.time_from ? ` (${E(t.time_from)}–${E(t.time_to)})` : ""}` : ""}${t.note ? ` · <span data-i18n-skip>${E(t.note)}</span>` : ""}</small>
          ${t.affected?.length ? `<small class="ac-warn">${UI.icon("info", 13)} ${Lang.number(t.affected.length)} ${E(T("موعد في هذه الفترة — لن يُلغى تلقائياً"))}</small>` : ""}</div>
        <div class="btn-row"><button class="btn sm" data-time-ok="${E(t.id)}">${E(T("موافقة"))}</button><button class="btn line sm danger-line" data-time-no="${E(t.id)}">${E(T("رفض"))}</button></div></div>`).join("") : none("لا توجد طلبات"), time.length) : ""}
      ${r.attendance ? sec("الحضور بانتظار المراجعة", "clock", `<button class="lrow" data-nav="${navBase()}/biz-attendance"><div class="t">${Lang.number(r.attendance)} ${E(T("سجل يحتاج مراجعة"))}</div><span class="chev">${UI.icon("chev", 18)}</span></button>`, r.attendance) : ""}`;
    const again = () => { fresh(); requestsPage(body); window.Admin?.paintRequestBadge?.(); };
    const on = (sel, fn) => body.querySelectorAll(sel).forEach((b) => b.onclick = () => fn(b));
    // Opened from any other request alert (membership, invitation, join, leave):
    // find that exact item; if it no longer waits, say so instead of a blank page.
    if (focus && !focused) {
      const item = [...body.querySelectorAll(".ac-item")].find((el) => [...el.querySelectorAll("button")].some((b) => Object.values(b.dataset).includes(focus)));
      if (item) item.classList.add("ac-focus");
      else body.insertAdjacentHTML("afterbegin", `<div class="tm-alert" id="ac-gone">${UI.icon("check", 17)}<span>${E(T("تمت معالجة هذا الطلب بالفعل — لا يحتاج إجراءً آخر."))}</span></div>`);
    }
    if (focus) requestAnimationFrame(() => (body.querySelector(".ac-focus") || document.getElementById("ac-opened") || document.getElementById("ac-gone"))?.scrollIntoView({ block: "center", behavior: "smooth" }));
    on("[data-pkg-sell]", (b) => { const q = pkgs.find((x) => x.id === b.dataset.pkgSell);
      Business.openCheckout({ customer: q.customer_id, packageSale: q.package_id, onDone: async () => again() }); });
    on("[data-pkg-no]", (b) => {
      UI.modal(`<div class="mhead"><h3>${E(T("رفض طلب الباقة"))}</h3><button class="iconbtn" id="pk-x" aria-label="${E(T("إغلاق"))}">${UI.icon("x", 20)}</button></div>
        <div class="mform"><p class="tiny">${E(T("سيصل العميل إشعار بأن الطلب لم يُلبَّ."))}</p>
        <div class="field"><label for="pk-reason">${E(T("السبب (اختياري)"))}</label><input id="pk-reason" class="input" maxlength="300" dir="auto"></div>
        <button class="btn danger" id="pk-go">${E(T("رفض"))}</button></div>`);
      document.getElementById("pk-x").onclick = UI.closeModal;
      document.getElementById("pk-go").onclick = async () => {
        UI.busy("pk-go", true);
        try { await rpc("admin_biz_decline_package_request", { p_token: tok(), p_id: b.dataset.pkgNo, p_reason: document.getElementById("pk-reason").value.trim() }); UI.closeModal(); UI.toast(T("تم الحفظ"), "ok"); again(); }
        catch (e) { UI.toast(e.message, "err"); UI.busy("pk-go", false); }
      };
    });
    // New requests appear on their own while the page is open.
    let sig = JSON.stringify([pkgs.map((q) => q.id), membership.length, accepted.length, teamReq.length, time.length]);
    window.Live?.start(async () => {
      if (!document.body.contains(body)) return;
      const n = await rpc("admin_requests", { p_token: tok() });
      const next = JSON.stringify([(n.package_requests || []).map((q) => q.id), (n.membership || []).length, (n.accepted_invites || []).length, (n.team_requests || []).length, (n.time_requests || []).length]);
      if (next !== sig) { sig = next; requestsPage(body); window.Admin?.paintRequestBadge?.(); }
    }, 20000);
    on("[data-activate]", async (b) => { try { await rpc("admin_team_activate", { p_token: tok(), p_member: b.dataset.activate }); UI.toast(T("تم تفعيل العضو"), "ok"); again(); } catch (e) { UI.toast(seatMessage(e), "err"); } });
    on("[data-refuse]", (b) => UI.confirm("رفض هذا الشخص وإلغاء الدعوة؟", async () => { try { await rpc("admin_team_invite_revoke", { p_token: tok(), p_member: b.dataset.refuse }); again(); } catch (e) { UI.toast(e.message, "err"); } }, true));
    on("[data-member-ok]", async (b) => { try { await rpc("admin_member_decide", { p_token: tok(), p_user: b.dataset.memberOk, p_approve: true }); UI.toast(T("تم القبول"), "ok"); again(); } catch (e) { UI.toast(e.message, "err"); } });
    on("[data-member-no]", (b) => UI.confirm("رفض طلب الانضمام؟", async () => { try { await rpc("admin_member_decide", { p_token: tok(), p_user: b.dataset.memberNo, p_approve: false }); again(); } catch (e) { UI.toast(e.message, "err"); } }, true));
    on("[data-team-no]", (b) => UI.confirm("رفض طلب الانضمام إلى الفريق؟", async () => { try { await rpc("admin_team_request_decide", { p_token: tok(), p_request: b.dataset.teamNo, p_approve: false, p_data: {} }); again(); } catch (e) { UI.toast(e.message, "err"); } }, true));
    on("[data-team-ok]", async (b) => {
      const q = teamReq.find((x) => x.id === b.dataset.teamOk);
      const d = await rpc("admin_team_list", { p_token: tok() }).catch(() => ({}));
      addSheet(d, again, { title: "قبول طلب الانضمام", cta: "قبول وتفعيل", person: q, role: "other",
        onSubmit: (data) => rpc("admin_team_request_decide", { p_token: tok(), p_request: q.id, p_approve: true, p_data: data }).catch((e) => { throw new Error(seatMessage(e)); }) });
    });
    on("[data-time-ok]", async (b) => {
      try { const res = await rpc("admin_team_decide_time_request", { p_token: tok(), p_id: b.dataset.timeOk, p_approve: true, p_note: "" });
        if (res?.conflicts?.length) { conflictsSheet(res.conflicts, null, again, T("تمت الموافقة. هذه المواعيد ما زالت محجوزة في وقت الإجازة — انقلها أو ألغها.")); return; }
        UI.toast(T("تمت الموافقة"), "ok"); again(); } catch (e) { UI.toast(e.message, "err"); }
    });
    on("[data-time-no]", (b) => UI.confirm("رفض الطلب؟", async () => { try { await rpc("admin_team_decide_time_request", { p_token: tok(), p_id: b.dataset.timeNo, p_approve: false, p_note: "" }); again(); } catch (e) { UI.toast(e.message, "err"); } }, true));
  }

  // ---- Audit log -----------------------------------------------------------------
  const ACTIONS = {
    booking_status: "تغيير حالة حجز", booking_reassigned: "نقل حجز إلى مختص آخر", booking_moved: "تغيير موعد حجز", booking_deleted: "حذف حجز",
    team_invited: "دعوة عضو", team_invite_renewed: "رابط دعوة جديد", team_invite_revoked: "إلغاء دعوة", team_invite_accepted: "قبول دعوة", team_invite_declined: "رفض دعوة",
    team_activated: "تفعيل عضو", team_permissions: "تعديل الصلاحيات", staff_permissions_saved: "تعديل الصلاحيات", team_role: "تغيير الدور", team_member_updated: "تعديل بيانات عضو", team_schedule: "تعديل الدوام",
    team_deactivated: "إنهاء عضوية", team_owner_specialist: "المالك يعمل كمختص", team_request: "طلب انضمام للفريق", team_request_approved: "قبول طلب انضمام للفريق",
    team_request_rejected: "رفض طلب انضمام للفريق", membership_approved: "قبول عميل", membership_rejected: "رفض عميل", customer_blocked: "إيقاف عميل", customer_unblocked: "إعادة تفعيل عميل",
    customer_removed: "حذف عميل", schedule_changed: "تعديل دوام مختص", time_request: "طلب إجازة أو دوام", time_request_approved: "موافقة على طلب دوام", time_request_rejected: "رفض طلب دوام",
    time_off_removed: "حذف إجازة", specialist_removed: "حذف ملف مختص", owner_specialist_link: "ربط المالك بملف مختص",
    team_account_unlinked: "إزالة وصول مختص من حساب", team_availability: "تغيير الإتاحة للحجز",
    password_set: "تعيين كلمة مرور", password_reset: "تصفير كلمة مرور",
  };
  const KINDS = { admin: "المالك", staff: "عضو فريق", barber: "مختص", customer: "عميل", platform: "METON", system: "النظام", provider: "مزود الدفع" };
  async function auditPage(body, kind = "") {
    let rows = [], before = null, done = false;
    body.innerHTML = `<div class="chips" id="au-kinds">${[["", "الكل"], ["bookings", "الحجوزات"], ["team", "الفريق"], ["customers", "العملاء"], ["money", "المال"]].map(([v, l]) => `<button class="chip ${v === kind ? "active" : ""}" data-kind="${v}">${E(T(l))}</button>`).join("")}</div>
      <div id="au-list" class="au-list">${UI.loading()}</div><button class="btn line" id="au-more" hidden>${E(T("المزيد"))}</button>`;
    const paint = () => {
      document.getElementById("au-list").innerHTML = rows.length ? rows.map((a) => `<div class="au-row"><span class="au-dot au-${E(a.actor_kind)}"></span><div>
        <b>${E(T(ACTIONS[a.action] || a.action.replace(/_/g, " ")))}</b>${a.after?.status ? ` <span class="au-status">${E(T(({ completed: "مكتمل", cancelled: "ملغي", no_show: "لم يحضر", confirmed: "مؤكد", pending: "قيد الانتظار", expired: "منتهي", active: "نشط", inactive: "سابق", rejected: "مرفوض" })[a.after.status] || a.after.status))}</span>` : ""}
        <small><span data-i18n-skip>${E(a.actor || "")}</span> · ${E(T(KINDS[a.actor_kind] || a.actor_kind))} · <bdi>${E(new Date(a.at).toLocaleString(Lang.locale(), { dateStyle: "medium", timeStyle: "short" }))}</bdi></small>
        ${a.reason ? `<small data-i18n-skip>${E(a.reason)}</small>` : ""}</div></div>`).join("") : UI.empty(T("لا توجد سجلات"), "");
      document.getElementById("au-more").hidden = done;
    };
    const load = async () => {
      const batch = await rpc("admin_audit_list", { p_token: tok(), p_limit: 50, p_before: before, p_kind: kind || null });
      rows = rows.concat(batch); done = batch.length < 50; before = batch.length ? batch[batch.length - 1].id : before; paint();
    };
    body.querySelectorAll("[data-kind]").forEach((b) => b.onclick = () => auditPage(body, b.dataset.kind));
    document.getElementById("au-more").onclick = () => load().catch((e) => UI.toast(e.message, "err"));
    await load();
  }

  // ---- invitation acceptance (#/invite) -----------------------------------------------
  function pendingInvite() { try { return sessionStorage.getItem(PENDING_INVITE) || ""; } catch { return ""; } }
  function rememberInvite(code) { try { code ? sessionStorage.setItem(PENDING_INVITE, code) : sessionStorage.removeItem(PENDING_INVITE); } catch {} }
  const isInviteCode = (v) => /^INV-[A-Za-z0-9_-]{32}$/.test(String(v || "").trim());
  async function peek(code) {
    const { data, error } = await (window.platformSb || window.sb).rpc("salonieer_team_invite_peek_v1", { p_code: code });
    if (error) throw new Error(Lang.error(error.message));
    return data || { status: "invalid" };
  }
  async function invitePage() {
    const code = pendingInvite();
    if (!code) { Router.go(Auth.isLoggedIn() ? "#/home" : "#/auth"); return; }
    UI.render(`${UI.header({ title: T("دعوة للانضمام إلى الفريق"), back: "#/home" })}<div class="content"><div class="center-col" id="iv-body">${UI.loading()}</div></div>`);
    const host = document.getElementById("iv-body");
    let info;
    try { info = await peek(code); } catch (e) { host.innerHTML = `<div class="card">${UI.empty(T("تعذّر فتح الدعوة"), e.message)}</div>`; return; }
    const bad = { invalid: "رابط الدعوة غير صالح.", expired: "انتهت صلاحية هذه الدعوة. اطلب من العمل رابطاً جديداً.", revoked: "ألغى العمل هذه الدعوة.", accepted: "قُبلت هذه الدعوة من قبل.", declined: "رُفضت هذه الدعوة." }[info.status];
    const salon = info.salon?.name || info.salon_name || "";
    const role = info.role === "other" && info.title ? info.title : T(ROLES[info.role]?.l || "");
    host.innerHTML = `<div class="card pad-lg iv-card">
      <div class="iv-salon">${info.salon?.logo_url ? `<img src="${E(info.salon.logo_url)}" alt="">` : UI.icon("scissors", 26)}</div>
      <h2 data-i18n-skip>${E(salon)}</h2>
      ${bad ? `<p class="muted">${E(T(bad))}</p><button class="btn line" id="iv-close">${E(T("حسناً"))}</button>` : `
      <p>${E(T("يدعوك العمل للانضمام إلى فريقه بدور"))} <b data-i18n-skip>${E(role)}</b>${info.role !== "other" && info.title ? ` <small data-i18n-skip>(${E(info.title)})</small>` : ""}.</p>
      <ul class="iv-points"><li>${E(T("تقبل الدعوة بحسابك في METON — يُستخدم اسمك ورقمك منه."))}</li><li>${E(T("يفعّلك العمل بعد التحقق من هويتك، ثم تظهر لك أدواتك."))}</li>
        ${info.role === "specialist" ? `<li>${E(T("بعد التفعيل يستطيع العملاء الحجز عندك."))}</li>` : `<li>${E(T("هذا الدور لا يستقبل حجوزات العملاء."))}</li>`}</ul>
      ${window.Account?.signedIn() ? `<p class="tiny">${E(T("ستقبل باسم:"))} <b data-i18n-skip>${E(Account.account()?.name || "")}</b> <bdi dir="ltr">${E(Account.account()?.phone || "")}</bdi></p>
        <div class="form-error" id="iv-err"></div>
        <div class="btn-row"><button class="btn" id="iv-accept">${UI.icon("check", 17)} ${E(T("قبول الدعوة"))}</button><button class="btn line" id="iv-decline">${E(T("رفض"))}</button></div>`
      : `<p class="tiny">${E(T("سجّل الدخول أو أنشئ حساباً للمتابعة. ستعود إلى هذه الدعوة بعدها."))}</p>
        <div class="btn-row"><button class="btn" id="iv-login">${E(T("تسجيل الدخول"))}</button><button class="btn line" id="iv-register">${E(T("إنشاء حساب"))}</button></div>`}`}
      </div>`;
    const close = document.getElementById("iv-close"); if (close) close.onclick = () => { rememberInvite(""); Router.go("#/home"); };
    const back = () => { Router.go("#/invite"); Router.resolve(); };
    const login = document.getElementById("iv-login"); if (login) login.onclick = () => Account.loginScreen(back, back);
    const reg = document.getElementById("iv-register"); if (reg) reg.onclick = () => Account.registerScreen(back, back);
    const accept = document.getElementById("iv-accept");
    if (accept) accept.onclick = async () => {
      const err = document.getElementById("iv-err"); err.textContent = ""; UI.busy("iv-accept", true);
      try {
        const { data, error } = await window.platformSb.rpc("salonieer_team_invite_accept_v1", { p_token: Account.token(), p_code: code });
        if (error) throw new Error(Lang.error(error.message));
        if (data?.status === "link_required") { UI.busy("iv-accept", false); Account.linkPrompt(() => { Router.go("#/invite"); Router.resolve(); }); return; }
        if (data?.error) throw new Error(Lang.error(data.error));
        if (data?.status !== "ok") throw new Error(T("تعذّر قبول الدعوة"));
        localStorage.setItem("aj_token:" + data.salon.slug, data.session.token);
        rememberInvite(""); fresh();
        if (Platform.current()?.slug !== data.salon.slug) Platform.select(data.salon);
        try { await Auth.loadContext(); } catch {}
        host.innerHTML = `<div class="card pad-lg iv-card"><div class="iv-salon">${UI.icon("check", 28)}</div><h2>${E(T("تم قبول الدعوة"))}</h2>
          <p>${E(T("أبلغنا العمل. ستصلك رسالة عندما يفعّل انضمامك، وتظهر أدواتك في «حسابي»."))}</p><button class="btn" data-nav="#/home">${E(T("الرئيسية"))}</button></div>`;
      } catch (e) { err.textContent = e.message; UI.busy("iv-accept", false); }
    };
    const decline = document.getElementById("iv-decline");
    if (decline) decline.onclick = () => UI.confirm("رفض دعوة الانضمام؟", async () => {
      try { const { data, error } = await window.platformSb.rpc("salonieer_team_invite_decline_v1", { p_token: Account.token(), p_code: code });
        if (error || data?.error) throw new Error(Lang.error(error?.message || data.error)); rememberInvite(""); UI.toast(T("تم رفض الدعوة"), "ok"); Router.go("#/home"); }
      catch (e) { UI.toast(e.message, "err"); }
    }, true);
  }

  // ---- the employee's own requests (leave / schedule) -----------------------------------
  async function myRequests(host) {
    if (!host) return;
    let list = [];
    try { list = await rpc("team_my_time_requests", { p_token: App.token }); } catch { host.innerHTML = ""; return; }
    const st = { pending: ["بانتظار القرار", "amber"], approved: ["تمت الموافقة", "ok"], rejected: ["مرفوض", "danger"], cancelled: ["أُلغي", "muted"] };
    host.innerHTML = `<section class="card tm-mine"><div class="row between"><h3>${E(T("الإجازات وطلبات الدوام"))}</h3><button class="btn sm" id="tq-new">${UI.icon("plus", 15)} ${E(T("طلب جديد"))}</button></div>
      ${list.length ? list.map((r) => `<div class="tm-mine-row"><div><b>${E(T(r.kind === "leave" ? "إجازة" : "تعديل أوقات العمل"))}</b>${r.kind === "leave" ? ` <bdi>${E(r.day_from)}${r.day_to !== r.day_from ? " → " + E(r.day_to) : ""}</bdi>` : ""}
        ${r.decision_note ? `<small data-i18n-skip>${E(r.decision_note)}</small>` : ""}</div><span class="badge ${st[r.status]?.[1] || "muted"}">${E(T(st[r.status]?.[0] || r.status))}</span>
        ${r.status === "pending" ? `<button class="btn line sm" data-tq-cancel="${E(r.id)}">${E(T("إلغاء"))}</button>` : ""}</div>`).join("") : `<p class="muted">${E(T("لا توجد طلبات بعد."))}</p>`}</section>`;
    document.getElementById("tq-new").onclick = () => requestSheet(() => myRequests(host));
    host.querySelectorAll("[data-tq-cancel]").forEach((b) => b.onclick = async () => { try { await rpc("team_cancel_time_request", { p_token: App.token, p_id: b.dataset.tqCancel }); myRequests(host); } catch (e) { UI.toast(e.message, "err"); } });
  }
  function requestSheet(after) {
    const today = new Date(); const iso = (d) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    let kind = "leave";
    UI.modal(`<div class="mhead"><h3>${E(T("طلب جديد"))}</h3><button class="iconbtn" id="tq-x">${UI.icon("x", 20)}</button></div>
      ${UI.seg("tq-kind", [{ v: "leave", l: T("إجازة") }, { v: "schedule", l: T("تعديل أوقات العمل") }], "leave")}
      <div class="mform" id="tq-form"></div>`);
    document.getElementById("tq-x").onclick = UI.closeModal;
    let editor = null;
    const paint = () => {
      const f = document.getElementById("tq-form");
      f.innerHTML = kind === "leave" ? `<div class="grid g2"><div class="field"><label for="tq-from">${E(T("من"))}</label><input id="tq-from" class="input" type="date" min="${iso(today)}" value="${iso(today)}"></div>
          <div class="field"><label for="tq-to">${E(T("إلى"))}</label><input id="tq-to" class="input" type="date" min="${iso(today)}" value="${iso(today)}"></div></div>
          <label class="checkrow"><input type="checkbox" id="tq-part"> ${E(T("جزء من اليوم فقط"))}</label>
          <div class="grid g2" id="tq-times" hidden><div class="field"><label for="tq-tf">${E(T("من الساعة"))}</label><input id="tq-tf" class="input" type="time" value="12:00"></div><div class="field"><label for="tq-tt">${E(T("إلى الساعة"))}</label><input id="tq-tt" class="input" type="time" value="15:00"></div></div>
          <div class="field"><label for="tq-note">${E(T("ملاحظة (اختياري)"))}</label><input id="tq-note" class="input" maxlength="300" dir="auto"></div>`
        : `<p class="tiny">${E(T("اقترح أوقات عملك الجديدة. تبقى الحالية حتى موافقة العمل."))}</p><div id="tq-days"></div><div class="field"><label for="tq-note">${E(T("ملاحظة (اختياري)"))}</label><input id="tq-note" class="input" maxlength="300" dir="auto"></div>`;
      f.insertAdjacentHTML("beforeend", `<div class="form-error" id="tq-err"></div><button class="btn" id="tq-send">${E(T("إرسال الطلب"))}</button>`);
      if (kind === "leave") document.getElementById("tq-part").onchange = (e) => { document.getElementById("tq-times").hidden = !e.target.checked; };
      else editor = ScheduleEditor.mount(document.getElementById("tq-days"), ScheduleEditor.fromSchedule({}));
      document.getElementById("tq-send").onclick = async () => {
        const err = document.getElementById("tq-err"); const data = { kind, note: document.getElementById("tq-note").value.trim() };
        if (kind === "leave") { Object.assign(data, { day_from: document.getElementById("tq-from").value, day_to: document.getElementById("tq-to").value });
          if (document.getElementById("tq-part").checked) Object.assign(data, { time_from: document.getElementById("tq-tf").value, time_to: document.getElementById("tq-tt").value }); }
        else { const bad = editor.validate(); if (bad) { err.textContent = bad; return; } data.schedule = editor.value(); }
        UI.busy("tq-send", true);
        try { const r = await rpc("team_time_request", { p_token: App.token, p_data: data }); UI.closeModal();
          UI.toast(r.affected ? `${T("أُرسل الطلب.")} ${Lang.number(r.affected)} ${T("موعد في هذه الفترة سيراجعه العمل.")}` : T("أُرسل الطلب إلى العمل"), "ok"); after?.(); }
        catch (e) { err.textContent = e.message; UI.busy("tq-send", false); }
      };
    };
    UI.wireSeg("tq-kind", (v) => { kind = v; paint(); });
    paint();
  }

  // ---- customer side: membership state and joining the team -------------------------------
  function memberNotice() {
    const t = App.team || {};
    if (t.membership === "pending") return `<div class="tm-member-notice">${UI.icon("clock", 18)}<div><b>${E(T("طلب انضمامك بانتظار موافقة العمل"))}</b><small>${E(T("يمكنك تصفح الخدمات والمختصين والمواعيد الآن، والحجز بعد الموافقة."))}</small></div></div>`;
    if (t.membership === "rejected") return `<div class="tm-member-notice off">${UI.icon("info", 18)}<div><b>${E(T("لم يوافق العمل على طلب انضمامك"))}</b><small>${E(T("يمكنك إعادة الطلب بعد يوم من القرار."))}</small></div><button class="btn sm" data-member-again>${E(T("إعادة الطلب"))}</button></div>`;
    return "";
  }
  function wireMemberNotice(root) {
    root?.querySelector("[data-member-again]")?.addEventListener("click", async () => {
      try { const r = await rpc("member_request_again", { p_token: App.token }); App.team = { ...(App.team || {}), membership: r.membership }; UI.toast(T("أُرسل طلبك إلى العمل"), "ok"); Router.resolve(); }
      catch (e) { UI.toast(e.message, "err"); }
    });
  }
  function joinTeamCard() {
    const t = App.team || {};
    if (!t.team_requests_on || !Auth.isLoggedIn() || t.member || t.owner || t.pending_member || App.user?.role !== "user") return "";
    if (t.team_request === "pending") return `<div class="list"><div class="lrow" style="cursor:default"><div class="ic">${UI.icon("scissors", 18)}</div><div class="t">${E(T("طلب الانضمام إلى الفريق قيد المراجعة"))}</div><button class="btn line sm" id="tj-withdraw">${E(T("سحب"))}</button></div></div>`;
    return `<div class="list"><button type="button" class="lrow" id="tj-open"><div class="ic">${UI.icon("scissors", 18)}</div><div class="t">${E(T("اطلب الانضمام إلى فريق العمل"))}<div class="tiny">${E(T("يراجع المالك طلبك ويختار دورك"))}</div></div><span class="chev">${UI.icon("chev", 18)}</span></button></div>`;
  }
  function wireJoinTeam() {
    const open = document.getElementById("tj-open");
    if (open) open.onclick = () => {
      UI.modal(`<h3>${E(T("اطلب الانضمام إلى فريق العمل"))}</h3><div class="mform"><div class="field"><label for="tj-msg">${E(T("نبذة قصيرة (اختياري)"))}</label><textarea id="tj-msg" class="textarea" maxlength="300" dir="auto" placeholder="${E(T("خبرتك وما تقدمه"))}"></textarea></div>
        <p class="tiny">${E(T("الطلب وحده لا يمنح أي صلاحية. يقرر المالك الدور والصلاحيات."))}</p><div class="form-error" id="tj-err"></div><button class="btn" id="tj-send">${E(T("إرسال الطلب"))}</button></div>`);
      document.getElementById("tj-send").onclick = async () => {
        UI.busy("tj-send", true);
        try { await rpc("team_request_join", { p_token: App.token, p_message: document.getElementById("tj-msg").value.trim() }); App.team = { ...(App.team || {}), team_request: "pending" }; UI.closeModal(); UI.toast(T("أُرسل طلبك إلى العمل"), "ok"); Router.resolve(); }
        catch (e) { document.getElementById("tj-err").textContent = e.message; UI.busy("tj-send", false); }
      };
    };
    const w = document.getElementById("tj-withdraw");
    if (w) w.onclick = async () => { try { await rpc("team_request_withdraw", { p_token: App.token }); App.team = { ...(App.team || {}), team_request: "withdrawn" }; Router.resolve(); } catch (e) { UI.toast(e.message, "err"); } };
  }

  return {
    PERMS, ROLES, page, permissionsPage, requestsPage, auditPage, invitePage, myRequests, peek, isInviteCode, rememberInvite, pendingInvite,
    memberNotice, wireMemberNotice, joinTeamCard, wireJoinTeam, roleName,
  };
})();
