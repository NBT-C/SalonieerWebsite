// =====================================================================
//  barber.js — Specialist dashboard
//  «الجدول» is the shared 2.32 schedule (schedule.js): the day as a clear
//  list in time order, and the week at a glance.
// =====================================================================
const BarberDash = (() => {
  const tok = () => App.token;
  const E = (s) => UI.esc(s);

  const TABS = [
    { id: "table", l: "الجدول" },
    { id: "bookings", l: "قائمة الحجوزات" },
    { id: "schedule", l: "أوقات العمل" },
  ];

  let ME = null;

  async function dashboard(params) {
    const tab = (params && params.tab) || "table";
    UI.render(`${UI.header({ title: "لوحة المختص", sub: "إدارة مواعيدك وأوقات عملك", back: "#/settings" })}
      <div class="content"><div id="bd">${UI.loading()}</div></div>`);
    const host = document.getElementById("bd");
    try {
      // 2.32: kept for a minute, so switching tabs never waits on it (a saved
      // schedule drops the cache, see supabase.js).
      const rows = await rpcCached("barber_self", { p_token: tok() }, 60000);
      ME = Array.isArray(rows) ? rows[0] : rows;
    } catch { ME = null; }
    if (!ME) {
      host.innerHTML = UI.empty("هذا الحساب غير مرتبط بملف مختص",
        "يضيف العمل المختصين عبر دعوة من صفحة الفريق. اطلب من المالك رابط دعوة.");
      return;
    }
    // 2.25: checkout, deposits, inventory and own commissions, shown only when
    // the salon has the feature AND the salon admin granted the permission.
    const tabs = TABS.concat(window.Business && await Business.staffHasTools() ? [{ id: "business", l: "أدوات عملي" }] : [])
      // 2.28: clock in / clock out for specialists of a salon with Attendance.
      .concat(window.Workforce && Features.enabled("attendance") ? [{ id: "attendance", l: "الحضور" }] : [])
      // 2.33: leave and schedule change requests to the salon.
      .concat(window.Team ? [{ id: "leave", l: "الإجازات" }] : []);
    host.innerHTML = `
      <div class="atabs">${tabs.map(t =>
      `<button class="atab ${t.id === tab ? "active" : ""}" data-nav="#/barber-dash/${t.id}">${t.l}</button>`
    ).join("")}</div>
      <div id="bdbody">${UI.loading()}</div>`;
    const body = document.getElementById("bdbody");
    const fn = tab === "schedule" ? schedule : tab === "bookings" ? bookings : tab === "business" && tabs.some(t => t.id === "business") ? b => Business.barberTab(b)
      : tab === "attendance" && tabs.some(t => t.id === "attendance") ? b => Workforce.attendancePanel(b)
      : tab === "leave" && window.Team ? b => Team.myRequests(b) : scheduleTable;
    try { await fn(body); }
    catch (e) { body.innerHTML = `<div class="card">${E(e.message)}</div>`; }
  }

  // shared status meta
  const STATUS = {
    pending: { l: "بانتظار التأكيد", c: "ev-pending", k: "#EDAF00" },
    confirmed: { l: "مؤكدة", c: "ev-confirmed", k: "#2196D6" },
    completed: { l: "مكتملة", c: "ev-completed", k: "#118E5B" },
    cancelled: { l: "ملغاة", c: "ev-cancelled", k: "#8AA3B7" },
    no_show: { l: "لم يحضر", c: "ev-noshow", k: "#CE3B3B" },
    expired: { l: "منتهية", c: "ev-expired", k: "#B42318" },
  };
  const toMin = t => { const [h, m] = (t || "0:0").split(":").slice(0, 2).map(Number); return h * 60 + m; };
  const hhmm = m => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  function toISO(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }

  // action sheet for one booking
  function actionModal(b, onDone) {
    // Same rules as the booking page and the admin dashboard: only the
    // transitions that this booking's status and time actually allow.
    const tone = { confirm: "ok", danger: "danger", warn: "warn", neutral: "line" };
    const available = BookingRules.actions(b);
    const note = BookingRules.note(b);
    const actions = available.length ? `<div class="booking-actions">${BookingActions.inline(b, { large: true })}</div>` : "";
    const footer = note
      ? `<p class="muted" style="text-align:center">${E(note)}</p>`
      : (available.length ? "" : `<p class="muted" style="text-align:center">لا توجد إجراءات متاحة لهذه الحالة.</p>`);
    UI.modal(`<div class="mhead"><h3>تفاصيل الحجز</h3>
      <button class="iconbtn" id="mx">${UI.icon("x", 20)}</button></div>
      <div class="mform">
        <div class="card" style="box-shadow:none;border:1.5px solid var(--line)">
          <div class="row between"><div style="min-width:0">
            <b style="font-size:15.5px">${E(b.guest_name || b.user_name || "عميل")}</b>
            ${b.guest_name ? `<div class="guest-sub">حجز الحساب: ${E(b.user_name || "عميل")}</div>` : ""}
          </div>${UI.badge(b.status)}</div>
          <div class="muted" style="margin-top:6px">${E(b.service_name || "—")}</div>
          <div class="tiny" style="margin-top:6px">${UI.dateAr(b.booking_date)} — ${UI.timeAr(b.booking_time)} · ${Lang.duration(b.duration)}</div>
          ${b.user_phone ? `<div class="btn-row" style="margin-top:12px">
            <a class="btn line sm" href="tel:${E(b.user_phone)}">${UI.icon("phone", 15)} اتصال</a>
            <a class="btn line sm" href="https://wa.me/${String(b.user_phone).replace(/[^0-9]/g, "")}" target="_blank" rel="noopener">${UI.icon("whatsapp", 15)} واتساب</a>
          </div>` : ""}
        </div>
        ${actions}
        ${footer}
        <div id="bd-biz"></div>
      </div>`);
    document.getElementById("mx").onclick = UI.closeModal;
    window.Business?.bookingPanel(document.getElementById("bd-biz"), b, { staff: true, onDone });
    BookingActions.wire(document.querySelector("#modal-root .modal"), () => b, async (bk, to) => {
      await rpc("barber_set_booking_status", { p_token: tok(), p_id: b.id, p_status: to });
      b.status = to; UI.closeModal(); onDone && onDone();
    });
  }

  // -------------------------------------------------------------------
  //  الجدول — the 2.32 schedule (schedule.js), day and week
  // -------------------------------------------------------------------
  async function scheduleTable(body) {
    await Schedule.specialist(body, { token: tok(), me: ME, editBooking: (row, refresh) => actionModal(row, refresh) });
  }

  const WEEK = [
    { g: 6, l: "السبت" }, { g: 0, l: "الأحد" }, { g: 1, l: "الاثنين" }, { g: 2, l: "الثلاثاء" },
    { g: 3, l: "الأربعاء" }, { g: 4, l: "الخميس" }, { g: 5, l: "الجمعة" },
  ];

  // -------------------------------------------------------------------
  //  BOOKINGS LIST
  // -------------------------------------------------------------------
  async function bookings(body) {
    const PAGE = 10;
    let date = ""; let status = ""; let page = 0; let items = []; let hasNext = false;
    const statusOpts = [["", "كل الحالات"], ["pending", "بانتظار التأكيد"], ["confirmed", "مؤكدة"],
    ["completed", "مكتملة"], ["cancelled", "ملغاة"], ["no_show", "لم يحضر"], ["expired", "منتهية"]];

    body.innerHTML = `
      <div class="card">
        <div class="grid g2">
          <div class="field"><label>التاريخ</label><input id="bd-date" class="input" type="date" value=""></div>
          <div class="field"><label>الحالة</label>
            <select id="bd-status" class="select">${statusOpts.map(o => `<option value="${o[0]}">${o[1]}</option>`).join("")}</select>
          </div>
        </div>
      </div>
      <div id="bd-list" style="margin-top:14px">${UI.loading()}</div>`;

    async function load() {
      items = await rpc("barber_bookings", {
        p_token: tok(), p_date: date || null, p_status: status || null,
        p_limit: PAGE, p_offset: page * PAGE,
      });
      hasNext = items.length === PAGE;
    }
    // The same actions as the daily and weekly schedule (BookingRules), plus
    // the same booking sheet with payment, so the three views never disagree.
    function actionsFor(b) {
      return `<div class="btn-row bk-inline-actions" style="margin-top:12px">${BookingActions.inline(b)}
        <button class="btn line sm" data-open="${E(b.id)}">${UI.icon("list", 15)} ${Lang.t("إدارة / الدفع")}</button></div>`;
    }
    function paint() {
      const host = document.getElementById("bd-list");
      host.innerHTML = (!items.length
        ? UI.empty("لا توجد حجوزات", page > 0 ? "لا مزيد من الحجوزات." : "لا توجد حجوزات مطابقة للفلاتر.")
        : `<div class="list cols">${items.map(b => `
            <div class="card bd-booking" data-card="${E(b.id)}">
              <div class="row between"><div style="min-width:0">
                <b style="font-size:15px">${E(b.guest_name || b.user_name || "—")}</b>
                ${b.guest_name ? `<div class="guest-sub">حجز الحساب: ${E(b.user_name || "—")}</div>` : ""}
              </div>${UI.badge(b.status)}</div>
              <div class="muted" style="margin-top:4px">${E(b.service_name || "—")}</div>
              <div class="kv">${UI.icon("calendar", 13)} ${UI.dateAr(b.booking_date)} — ${UI.timeAr(b.booking_time)} · ${Lang.duration(b.duration)}</div>
              ${b.user_phone ? `<a class="kv" dir="ltr" style="text-decoration:none" href="tel:${E(b.user_phone)}">${UI.icon("phone", 13)} ${E(b.user_phone)}</a>` : ""}
              ${actionsFor(b)}
            </div>`).join("")}</div>`) + UI.pager(page, hasNext);
      UI.wirePager(
        async () => { if (page > 0) { page--; await load(); paint(); } },
        async () => { if (hasNext) { page++; await load(); paint(); } });
      BookingActions.wire(host, id => items.find(x => x.id === id), async (b, to) => {
        await rpc("barber_set_booking_status", { p_token: tok(), p_id: b.id, p_status: to });
        b.status = to; paint();
      });
      host.querySelectorAll("[data-open]").forEach(btn => btn.onclick = () => actionModal(items.find(x => x.id === btn.dataset.open), async () => { await load(); paint(); }));
    }
    async function reload() { page = 0; document.getElementById("bd-list").innerHTML = UI.loading(); await load(); paint(); }

    document.getElementById("bd-date").onchange = e => { date = e.target.value; reload(); };
    document.getElementById("bd-status").onchange = e => { status = e.target.value; reload(); };
    await load(); paint();
  }

  // -------------------------------------------------------------------
  //  WORKING HOURS
  // -------------------------------------------------------------------
  async function schedule(body) {
    // Same editor and data shape as the admin specialist form.
    const state = ScheduleEditor.fromSchedule(ME.schedule || {});
    body.innerHTML = `
      <div class="mform">
        <div class="lrow" style="cursor:default">
          <div class="ic">${UI.icon("bolt", 18)}</div>
          <div class="t">استقبال الحجوزات<div class="tiny">أوقفه مؤقتاً لمنع أي حجز جديد</div></div>
          <label class="switch"><input type="checkbox" id="bd-active" aria-label="استقبال الحجوزات" ${ME.is_active !== false ? "checked" : ""}>
          <span class="track"></span><span class="thumb"></span></label>
        </div>
        <p class="tiny" style="margin:2px 2px 6px">حدّد فترات عملك واستراحاتك فقط — التطبيق يولّد أوقات الحجز تلقائياً كل ٣٠ دقيقة، ويفتح وقتاً جديداً فور انتهاء أي حجز حتى لا تضيع فجوة.</p>
        <div id="bd-days"></div>
        <button class="btn" id="bd-save">حفظ أوقات العمل</button>
      </div>`;
    const editor = ScheduleEditor.mount(document.getElementById("bd-days"), state);

    document.getElementById("bd-save").onclick = async () => {
      const bad = editor.validate();
      if (bad) { UI.toast(bad, "err"); editor.focusFirstProblem(); return; }
      const out = editor.value();
      UI.busy("bd-save", true);
      try {
        await rpc("barber_update_schedule", { p_token: tok(), p_schedule: out, p_active: document.getElementById("bd-active").checked });
        ME.schedule = out;
        rpcCacheBust("get_barber"); rpcCacheBust("list_barbers");
        UI.toast("تم حفظ أوقات العمل", "ok"); UI.busy("bd-save", false);
      } catch (e) { UI.toast(e.message, "err"); UI.busy("bd-save", false); }
    };
  }

  return { dashboard };
})();
window.BarberDash = BarberDash;
