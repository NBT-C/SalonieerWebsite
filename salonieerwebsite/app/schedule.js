// schedule.js — one schedule for the salon owner and for specialists.
//
//   2.34 (redesign of the 2.32 schedule):
//   Day · one specialist   — a timeline in time order. Each appointment shows
//                            its start and end and takes room for its length;
//                            free time, breaks and approved time off sit between
//                            them. A long free stretch is folded into one
//                            labelled row (tap to open it), so a quiet day never
//                            needs endless scrolling and a folded row never looks
//                            like it follows the time scale.
//   Day · all specialists  — one column per specialist on ONE shared time axis
//                            (appointments line up across columns; nothing is
//                            folded here). The owner, and team members allowed to
//                            see every specialist's schedule.
//   Week · one specialist  — the week grid of 2.30, restored: days × hours,
//                            appointments placed by the minute, breaks / off
//                            hours / closed days shaded, full screen with zoom.
//   Week · the whole team  — specialists × days (appointments, waiting
//                            confirmation, how full each day is).
//
// Data: admin_team_schedule (owner / permitted members) or my_schedule (a
// specialist's own; barber_bookings_range on databases before 2.34). Days
// already seen are kept in memory, so moving between days and views paints at
// once and refreshes underneath; the open range is re-checked every 15 s.
window.Schedule = (() => {
  "use strict";
  const E = (s) => UI.esc(s);
  const T = (s) => Lang.t(s);
  const pick = (ar, en, he) => Lang.get() === "en" ? en : Lang.get() === "he" ? he : ar;
  const toMin = (t) => { const [h, m] = String(t || "0:0").split(":").map(Number); return (h || 0) * 60 + (m || 0); };
  const hhmm = (n) => String(Math.floor(n / 60) % 24).padStart(2, "0") + ":" + String(n % 60).padStart(2, "0");
  const addDays = (iso, n) => { const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const dow = (iso) => new Date(iso + "T00:00:00Z").getUTCDay();
  const localISO = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const localNow = () => { const d = new Date(); return hhmm(d.getHours() * 60 + d.getMinutes()); };
  // Weeks start on Saturday in the salon's region (as the schedule editor).
  const weekStart = (iso) => addDays(iso, -((dow(iso) + 1) % 7));
  const shortDay = (iso) => Lang.date(iso, { weekday: "short" });
  const shortDate = (iso) => Lang.date(iso, { day: "numeric", month: "short" });
  const appts = (n) => pick(n === 1 ? "موعد واحد" : n === 2 ? "موعدان" : `${Lang.number(n)} مواعيد`, n === 1 ? "1 appointment" : `${Lang.number(n)} appointments`, n === 1 ? "תור אחד" : `${Lang.number(n)} תורים`);
  // Statuses that hold time on the day (a completed visit keeps its time, 2.32).
  const holds = (b) => !["cancelled", "expired", "no_show"].includes(b.status);
  const STATUS_ORDER = ["pending", "confirmed", "completed", "no_show", "cancelled", "expired"];
  const EV = { pending: "ev-pending", confirmed: "ev-confirmed", completed: "ev-completed", cancelled: "ev-cancelled", no_show: "ev-noshow", expired: "ev-expired" };
  const LONG_GAP = 60;   // minutes: a longer free stretch is folded in the day timeline
  const PX = 2.2;        // px per minute in the day timeline (unfolded parts)
  const PXC = 1.25;      // px per minute in the all-specialists columns
  const ini = (n) => String(n || "؟").trim().charAt(0) || "؟";

  function workday(schedule, iso) {
    const conv = window.ScheduleEditor?.fromSchedule ? ScheduleEditor.fromSchedule(schedule || {}) : (schedule || {});
    const state = conv[dow(iso)] || conv[String(dow(iso))] || { on: false };
    const ok = (r) => r && r.start && r.end && toMin(r.end) > toMin(r.start);
    const periods = state.on ? (Array.isArray(state.periods) && state.periods.length ? state.periods : (state.start ? [{ start: state.start, end: state.end }] : [])).filter(ok) : [];
    return { on: !!state.on && periods.length > 0, periods, breaks: state.on ? (state.breaks || []).filter(ok) : [] };
  }
  // ---- interval maths (minutes from midnight) --------------------------------
  const norm = (list) => list.filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0]);
  function minus(base, cuts) {
    let out = base.map((x) => [...x]);
    cuts.forEach(([s, e]) => { out = out.flatMap(([a, b]) => e <= a || s >= b ? [[a, b]] : [[a, Math.max(a, s)], [Math.min(b, e), b]].filter(([x, y]) => y > x)); });
    return norm(out);
  }
  const clip = (list, within) => norm(list.flatMap(([a, b]) => within.map(([c, d]) => [Math.max(a, c), Math.min(b, d)])));
  const total = (ranges) => ranges.reduce((n, [a, b]) => n + (b - a), 0);
  // Approved time off of one specialist on one day (full day = 0–24 h).
  function leaveRanges(timeOff, barberId, iso) {
    return norm((timeOff || []).filter((o) => o.barber_id === barberId && o.from <= iso && o.to >= iso)
      .map((o) => o.time_from ? [toMin(o.time_from), toMin(o.time_to)] : [0, 1440]));
  }
  // Free stretches = working periods − breaks − time off − appointments that hold time.
  function freeRanges(day, list, leave = []) {
    const periods = day.periods.map((p) => [toMin(p.start), toMin(p.end)]);
    const cuts = [...day.breaks.map((r) => [toMin(r.start), toMin(r.end)]), ...leave, ...list.filter(holds).map((b) => [toMin(b.time), toMin(b.time) + b.duration])];
    return minus(periods, cuts).filter(([a, b]) => b - a >= 10);
  }
  const workMinutes = (day) => total(day.periods.map((p) => [toMin(p.start), toMin(p.end)])) - total(day.breaks.map((r) => [toMin(r.start), toMin(r.end)]));

  // ── data ───────────────────────────────────────────────────────────────
  const memory = new Map();   // "mode|slug|from|to" → normalized data
  function normalize(d) {
    return {
      today: d.today || localISO(), now: d.now || localNow(), canViewAll: !!d.can_view_all,
      specialists: (d.specialists || []).map((s) => ({ id: s.id, name: s.name, schedule: s.schedule, active: s.is_active !== false, image: s.image_url || "", paused: !!s.paused })),
      timeOff: d.time_off || [],
      bookings: (d.bookings || []).map((b) => ({ id: b.id, barberId: b.barber_id, date: b.date, time: String(b.time).slice(0, 5), duration: Number(b.duration) || 30,
        status: b.status, customer: b.guest_name || b.customer_name || "", account: b.guest_name ? b.customer_name || "" : "",
        // 2.34: a name-only booking shows the phone typed for that person, never the employee's.
        phone: b.customer_phone || "", by: b.created_by_label || "", service: b.service_name || "", price: b.price, note: b.note || "", raw: b })),
    };
  }
  function normalizeLegacy(me, rows) {
    return normalize({ today: localISO(), now: localNow(), specialists: [{ id: me.id, name: me.name, schedule: me.schedule, is_active: true, image_url: me.image_url }],
      bookings: (rows || []).map((b) => ({ id: b.id, barber_id: me.id, date: b.booking_date, time: b.booking_time, duration: b.duration, status: b.status,
        service_name: b.service_name, customer_name: b.user_name, customer_phone: b.guest_name ? "" : b.user_phone, guest_name: b.guest_name || "", price: b.price, note: b.note })) });
  }
  const team = (st) => st.mode === "owner" || st.team;
  async function fetchRange(st, from, to) {
    if (team(st)) return normalize(await rpc("admin_team_schedule", { p_token: st.token, p_from: from, p_to: to, p_barber: null }));
    try { return normalize(await rpc("my_schedule", { p_token: st.token, p_from: from, p_to: to })); }
    catch (e) {
      if (!/could not find the function|PGRST202/i.test(e.rawMessage || "")) throw e;
      return normalizeLegacy(st.me, await rpc("barber_bookings_range", { p_token: st.token, p_from: from, p_to: to }));
    }
  }
  const key = (st, from, to) => [team(st) ? "team" : "me", Shop.slug(), from, to].join("|");
  // canViewAll is part of it: a permission granted or removed repaints the bar.
  const signature = (d) => JSON.stringify([d.bookings.map((b) => [b.id, b.status, b.date, b.time, b.duration, b.barberId, b.customer]), d.specialists.map((s) => [s.id, s.name, s.schedule, s.paused]), d.timeOff, d.canViewAll]);

  let st = null;
  const range = () => st.view === "week" ? [weekStart(st.date), addDays(weekStart(st.date), 6)] : [st.date, st.date];

  async function start(body, opts) {
    const q = Router.parse(location.hash).query;
    st = { ...opts, body, view: q.v === "week" ? "week" : "day", date: /^\d{4}-\d{2}-\d{2}$/.test(q.d || "") ? q.d : "", barber: opts.mode === "owner" ? (q.b || "") : "",
      team: false, sig: "", data: null, open: new Set() };
    if (opts.mode === "specialist" && q.all === "1" && st.view === "day") st.team = true;
    body.innerHTML = `<div class="sch" id="sch"><div class="sch-bar" id="sch-bar"></div><div id="sch-body" aria-live="polite"></div></div>`;
    if (!st.date) st.date = localISO();
    await load(true);
    Live.start(async () => { if (!document.getElementById("sch")) { Live.stop(); closeFull(); return; } await load(false, true); }, 15000);
  }
  async function load(first, background) {
    const [from, to] = range(), k = key(st, from, to);
    const cached = memory.get(k);
    if (cached && first) { st.data = cached; st.sig = signature(cached); if (!team(st)) st.canViewAll = cached.canViewAll; paint(); }
    else if (first) document.getElementById("sch-body").innerHTML = skeleton();
    let data;
    try { data = await fetchRange(st, from, to); }
    catch (e) {
      // A specialist whose permission to see everyone was removed goes back to their own schedule.
      if (st.team && st.mode === "specialist") { st.team = false; return load(true); }
      if (!cached && document.getElementById("sch-body")) document.getElementById("sch-body").innerHTML = `<div class="card">${E(e.message)}</div>`;
      return;
    }
    memory.set(k, data);
    if (!team(st)) st.canViewAll = data.canViewAll;
    if (key(st, ...range()) !== k) return;                 // the person moved on meanwhile
    // The salon's "today" comes from the server.
    if (first && !cached && !Router.parse(location.hash).query.d && data.today && data.today !== st.date && st.view === "day") { st.date = data.today; return load(true); }
    const sig = signature(data);
    if (!first && sig === st.sig) return;
    if (first && cached && sig === st.sig) { if (!background) prefetch(); return; }
    st.data = data; st.sig = sig;
    paint();
    if (!background) prefetch();
  }
  // The neighbouring day / week is read in the background so the arrows answer at once.
  function prefetch() {
    const step = st.view === "week" ? 7 : 1;
    for (const d of [addDays(st.date, step), addDays(st.date, -step)]) {
      const from = st.view === "week" ? weekStart(d) : d, to = st.view === "week" ? addDays(from, 6) : d, k = key(st, from, to);
      if (memory.has(k)) continue;
      (window.TapGuard ? TapGuard.quiet(() => fetchRange(st, from, to)) : fetchRange(st, from, to)).then((v) => memory.set(k, v)).catch(() => {});
    }
  }
  function go(patch) {
    Object.assign(st, patch);
    if (st.view === "week" && st.team && st.mode === "specialist") st.team = false;   // all specialists is a day view
    const q = new URLSearchParams();
    if (st.barber) q.set("b", st.barber);
    if (st.view === "week") q.set("v", "week");
    if (st.team && st.mode === "specialist") q.set("all", "1");
    q.set("d", st.date);
    history.replaceState(null, "", location.hash.split("?")[0] + "?" + q);
    st.sig = ""; st.open = new Set();
    load(true);
  }
  function refresh() { memory.clear(); st.sig = ""; load(false); }

  // ── bar: view, date, who ─────────────────────────────────────────────────
  function dateLabel() {
    if (st.view === "week") { const [a, b] = range(); return `${shortDate(a)} – ${shortDate(b)}`; }
    const rel = window.Smart?.dayLabel ? Smart.dayLabel(st.date) : "";
    return `${rel ? rel + " · " : ""}${UI.dayName ? UI.dayName(st.date) + " " : ""}${UI.dateAr(st.date)}`;
  }
  function bar() {
    const d = st.data, today = d.today;
    const isToday = st.view === "week" ? weekStart(today) === weekStart(st.date) : st.date === today;
    const specs = d.specialists.filter((s) => s.active || d.bookings.some((b) => b.barberId === s.id));
    const people = st.mode === "owner" && specs.length > 1 ? `<div class="sch-people" role="group" aria-label="${E(T("المختص"))}">
        <button type="button" class="sch-person ${!st.barber ? "on" : ""}" data-sch-barber="" aria-pressed="${!st.barber}">${UI.icon("users", 15)}<span>${E(T("كل المختصين"))}</span></button>
        ${specs.map((s) => `<button type="button" class="sch-person ${st.barber === s.id ? "on" : ""}" data-sch-barber="${E(s.id)}" aria-pressed="${st.barber === s.id}"><i class="sch-dot" style="--c:${color(s.id)}"></i><span data-i18n-skip>${E(s.name)}</span></button>`).join("")}
      </div>`
      : st.mode === "specialist" && (st.canViewAll || st.team) && st.view === "day" ? `<div class="sch-people" role="group" aria-label="${E(T("طريقة العرض"))}">
        <button type="button" class="sch-person ${!st.team ? "on" : ""}" data-sch-team="0" aria-pressed="${!st.team}">${UI.icon("user", 15)}<span>${E(T("جدولي"))}</span></button>
        <button type="button" class="sch-person ${st.team ? "on" : ""}" data-sch-team="1" aria-pressed="${!!st.team}">${UI.icon("users", 15)}<span>${E(T("كل المختصين"))}</span></button></div>` : "";
    return `<div class="sch-top">
        <div class="sch-views seg" role="tablist" aria-label="${E(T("طريقة العرض"))}">
          <button type="button" role="tab" data-sch-view="day" class="${st.view === "day" ? "on" : ""}" aria-selected="${st.view === "day"}">${E(T("يوم"))}</button>
          <button type="button" role="tab" data-sch-view="week" class="${st.view === "week" ? "on" : ""}" aria-selected="${st.view === "week"}">${E(T("أسبوع"))}</button>
        </div>
        <div class="sch-nav">
          <button type="button" class="iconbtn" id="sch-prev" aria-label="${E(T(st.view === "week" ? "الأسبوع السابق" : "اليوم السابق"))}">${UI.icon("bwd", 18)}</button>
          <label class="sch-date"><span>${E(dateLabel())}</span><input type="date" id="sch-date" value="${E(st.date)}" aria-label="${E(T("اختر التاريخ"))}"></label>
          <button type="button" class="iconbtn" id="sch-next" aria-label="${E(T(st.view === "week" ? "الأسبوع التالي" : "اليوم التالي"))}">${UI.icon("fwd", 18)}</button>
          ${isToday ? "" : `<button type="button" class="btn line sm" id="sch-today">${E(T(st.view === "week" ? "هذا الأسبوع" : "اليوم"))}</button>`}
        </div>
      </div>${people}`;
  }
  function wireBar() {
    const q = (s) => document.getElementById(s);
    document.querySelectorAll("[data-sch-view]").forEach((b) => b.onclick = () => go({ view: b.dataset.schView }));
    const step = st.view === "week" ? 7 : 1;
    q("sch-prev").onclick = () => go({ date: addDays(st.date, -step) });
    q("sch-next").onclick = () => go({ date: addDays(st.date, step) });
    q("sch-today")?.addEventListener("click", () => go({ date: st.data.today }));
    q("sch-date").onchange = (e) => { if (e.target.value) go({ date: e.target.value }); };
    document.querySelectorAll("[data-sch-barber]").forEach((b) => b.onclick = () => go({ barber: b.dataset.schBarber }));
    document.querySelectorAll("[data-sch-team]").forEach((b) => b.onclick = () => go({ team: b.dataset.schTeam === "1" }));
  }
  // A steady colour per specialist (their dot in the whole-team views).
  const PALETTE = ["#3576ca", "#c8963e", "#2f9e77", "#b4547a", "#6c63c7", "#d0703b", "#3a8fa3", "#8a8f2e"];
  function color(id) {
    const i = st.data.specialists.map((s) => s.id).indexOf(id);
    return PALETTE[(i < 0 ? 0 : i) % PALETTE.length];
  }

  function paint() {
    const host = document.getElementById("sch-body"); if (!host) return;
    document.getElementById("sch-bar").innerHTML = bar();
    wireBar();
    const d = st.data;
    if (!d.specialists.length) { host.innerHTML = UI.empty(T("لا يوجد مختصون بعد"), T("أضف المختصين من قسم الفريق.")); closeFull(); return; }
    const keep = host.querySelector(".cal-wrap,.tg-wrap"), at = keep ? { l: keep.scrollLeft, t: keep.scrollTop, cls: keep.className } : null;
    const specs = visibleSpecs();
    if (st.view === "day") host.innerHTML = specs.length === 1 ? dayOne(specs[0]) : dayAll(specs);
    else host.innerHTML = specs.length === 1 ? weekOne(specs[0]) : weekTeam(specs);
    wireBody(host);
    const wrap = host.querySelector(".cal-wrap,.tg-wrap");
    if (wrap && at && at.cls === wrap.className) { wrap.scrollLeft = at.l; wrap.scrollTop = at.t; }
    else if (wrap) requestAnimationFrame(() => slideToNow(wrap));
    if (full) paintFull(false);
  }
  function visibleSpecs() {
    const d = st.data;
    if (st.mode === "owner" && st.barber) return d.specialists.filter((s) => s.id === st.barber);
    if (st.mode === "specialist" && !st.team) return d.specialists.slice(0, 1);
    return d.specialists.filter((s) => s.active || d.bookings.some((b) => b.barberId === s.id && b.date >= range()[0] && b.date <= range()[1]));
  }

  // ── day · one specialist: the timeline ──────────────────────────────────
  function dayOne(s) {
    const d = st.data, iso = st.date, day = workday(s.schedule, iso), leave = leaveRanges(d.timeOff, s.id, iso);
    const all = d.bookings.filter((b) => b.date === iso && b.barberId === s.id).sort((a, b) => toMin(a.time) - toMin(b.time) || STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status));
    const live = all.filter(holds), gone = all.filter((b) => !holds(b));
    const isToday = iso === d.today, now = isToday ? toMin(d.now || localNow()) : null;
    const periods = day.on ? day.periods.map((p) => [toMin(p.start), toMin(p.end)]) : [];
    const breaks = day.on ? clip(day.breaks.map((r) => [toMin(r.start), toMin(r.end)]), periods) : [];
    const free = day.on ? freeRanges(day, live, leave) : [];
    const fullLeave = leave.some(([a, b]) => a <= 0 && b >= 1440);
    const pending = live.filter((b) => b.status === "pending").length;
    const freeLeft = total(free.filter(([, b]) => !isToday || b > now).map(([a, b]) => [isToday ? Math.max(a, now) : a, b]));
    const chips = `<div class="sch-chips"><span>${UI.icon("calendar", 14)} ${E(appts(live.length))}</span>${pending ? `<span class="warn">${UI.icon("clock", 14)} ${Lang.number(pending)} ${E(T("بانتظار التأكيد"))}</span>` : ""}
      ${day.on && !fullLeave ? `<span class="ok">${UI.icon("plus", 14)} ${E(T(isToday ? "وقت متاح متبقٍ" : "وقت متاح"))}: ${E(freeLeft ? Lang.duration(freeLeft) : "—")}</span>` : ""}
      ${day.on ? `<span class="muted">${UI.icon("clock", 14)} ${day.periods.map((p) => `<bdi>${E(UI.timeAr(p.start))}–${E(UI.timeAr(p.end))}</bdi>`).join(" · ")}</span>` : ""}</div>`;
    if ((!day.on || fullLeave) && !all.length) {
      return chips + `<div class="sch-off">${UI.icon("moon", 22)}<b>${E(T(fullLeave ? "إجازة" : "يوم إجازة"))}</b><span>${E(T(fullLeave ? "إجازة معتمدة لهذا اليوم." : "لا يعمل المختص في هذا اليوم."))}</span></div>`;
    }
    // Segments in time order: appointments, free time, breaks, time off, and the
    // hours between two shifts (or around an appointment outside the hours).
    const segs = live.map((b) => ({ kind: "bk", s: toMin(b.time), e: toMin(b.time) + b.duration, b }));
    const busy = segs.map((x) => [x.s, x.e]);
    free.forEach(([a, b]) => segs.push({ kind: "free", s: a, e: b }));
    minus(breaks, [...busy, ...leave]).forEach(([a, b]) => segs.push({ kind: "break", s: a, e: b }));
    const lo = Math.min(...periods.map((p) => p[0]), ...segs.map((x) => x.s), 24 * 60), hi = Math.max(...periods.map((p) => p[1]), ...segs.map((x) => x.e), 0);
    if (hi > lo) {
      minus(clip(leave, [[lo, hi]]), busy).forEach(([a, b]) => segs.push({ kind: "leave", s: a, e: b }));
      minus([[lo, hi]], [...periods, ...busy, ...leave]).filter(([a, b]) => b - a >= 5).forEach(([a, b]) => segs.push({ kind: "off", s: a, e: b }));
    }
    segs.sort((a, b) => a.s - b.s || (a.kind === "bk" ? -1 : 1));
    const rows = segs.map((x, i) => {
      const len = x.e - x.s, fold = (x.kind === "free" || x.kind === "off" || x.kind === "leave") && len > LONG_GAP && !st.open.has(x.s);
      const nowIn = isToday && now >= x.s && now < x.e;
      const nowMark = nowIn ? `<i class="tl-now" style="--at:${fold ? 50 : Math.round((now - x.s) / len * 1000) / 10}%" aria-label="${E(T("الآن"))}"><span>${E(T("الآن"))} · ${E(UI.timeAr(d.now || localNow()))}</span></i>` : "";
      const time = `<div class="tl-time"><b>${E(UI.timeAr(hhmm(x.s)))}</b>${x.kind === "bk" ? `<small>${E(UI.timeAr(hhmm(x.e)))}</small>` : ""}</div>`;
      if (x.kind === "bk") return `<li class="tl-row tl-bk ${nowIn ? "is-now" : ""}" style="--h:${Math.max(64, len * PX)}px">${time}${card(x.b, false)}${nowMark}</li>`;
      const label = { free: "متاح", break: "استراحة", leave: "إجازة", off: "خارج الدوام" }[x.kind];
      const icon = { free: "plus", break: "coffee", leave: "moon", off: "moon" }[x.kind];
      const text = `<span class="tl-label">${UI.icon(icon, 14)} ${E(T(label))}</span><bdi>${E(UI.timeAr(hhmm(x.s)))} – ${E(UI.timeAr(hhmm(x.e)))}</bdi><small>${E(Lang.duration(len))}</small>`;
      if (fold) return `<li class="tl-row tl-gap tl-${x.kind} tl-fold"><span class="tl-rail"></span><button type="button" class="tl-gap-body" data-fold="${x.s}" aria-expanded="false">${text}<em class="tl-fold-note">${UI.icon("down", 13)} ${E(T("مطوي · اضغط للعرض"))}</em></button>${nowMark}</li>`;
      const ticks = len > LONG_GAP ? `<span class="tl-ticks">${Array.from({ length: Math.floor((x.e - 1) / 60) - Math.floor(x.s / 60) }, (_, k) => (Math.floor(x.s / 60) + k + 1) * 60).map((m) => `<i style="--at:${(m - x.s) / len * 100}%"><b>${E(UI.timeAr(hhmm(m)))}</b></i>`).join("")}</span>` : "";
      return `<li class="tl-row tl-gap tl-${x.kind} ${len > LONG_GAP ? "tl-open" : ""}" style="--h:${Math.max(40, len * PX)}px">${time}<div class="tl-gap-body" ${len > LONG_GAP ? `data-fold="${x.s}" role="button" tabindex="0" aria-expanded="true"` : ""}>${text}${ticks}</div>${nowMark}</li>`;
    }).join("");
    const before = isToday && segs.length && now < segs[0].s ? `<li class="tl-now-row"><i class="tl-now" style="--at:50%"><span>${E(T("الآن"))} · ${E(UI.timeAr(d.now || localNow()))}</span></i></li>` : "";
    const after = isToday && segs.length && now >= segs[segs.length - 1].e ? `<li class="tl-now-row"><i class="tl-now" style="--at:50%"><span>${E(T("الآن"))} · ${E(UI.timeAr(d.now || localNow()))}</span></i></li>` : "";
    return chips + `<ol class="tl">${before}${rows}${after}</ol>`
      + (gone.length ? `<details class="sch-gone"><summary>${E(T("ملغاة ولم يحضر"))} (${Lang.number(gone.length)})</summary><ol class="tl tl-small">${gone.map((b) => `<li class="tl-row tl-bk"><div class="tl-time"><b>${E(UI.timeAr(b.time))}</b></div>${card(b, false)}</li>`).join("")}</ol></details>` : "")
      + `<p class="sch-legend">${E(T("الفترات الطويلة المتاحة مطوية ولا تتبع مقياس الوقت. اضغط عليها لعرضها كاملة."))}</p>`;
  }
  function card(b, showWho) {
    const spec = st.data.specialists.find((s) => s.id === b.barberId);
    const end = hhmm(toMin(b.time) + b.duration);
    const actions = window.BookingActions && mayManage(b) ? BookingActions.inline(rulesRow(b)) : "";
    const tel = String(b.phone || "").replace(/[^+0-9]/g, ""), wa = String(b.phone || "").replace(/[^0-9]/g, "");
    return `<div class="sch-card st-${E(b.status)}" data-sch-open="${E(b.id)}" tabindex="0" role="button" aria-label="${E(UI.timeAr(b.time))} – ${E(UI.timeAr(end))} ${E(b.customer)} ${E(b.service)} ${E(T(BookingRules.LABELS[b.status] || b.status))}">
        <div class="sch-line"><b class="sch-who" data-i18n-skip>${E(b.customer || "—")}</b>${UI.badge(b.status)}</div>
        <div class="sch-what"><span data-i18n-skip>${E(b.service || "—")}</span> · <bdi>${E(UI.timeAr(b.time))} – ${E(UI.timeAr(end))}</bdi> · <span>${E(Lang.duration(b.duration))}</span>${showWho && spec ? ` · <span class="sch-by"><i class="sch-dot" style="--c:${color(spec.id)}"></i><span data-i18n-skip>${E(spec.name)}</span></span>` : ""}</div>
        ${b.account || b.by ? `<div class="sch-sub">${b.by ? `${E(T("حجزه"))}: <span data-i18n-skip>${E(b.by)}</span>` : `${E(T("حجز الحساب"))}: <span data-i18n-skip>${E(b.account)}</span>`}</div>` : ""}
        ${b.note ? `<div class="sch-note" data-i18n-skip>${E(b.note)}</div>` : ""}
        ${tel && b.raw.contact_verified ? `<div class="sch-sub sch-phone"><bdi dir="ltr" data-i18n-skip>${E(b.phone)}</bdi> · <span class="badge ok">${E(T("رقم مؤكَّد"))}</span></div>` : ""}
        ${actions || tel ? `<div class="sch-actions">${actions}${tel ? `<a class="iconbtn sm" href="tel:${E(tel)}" aria-label="${E(T("اتصال"))}">${UI.icon("phone", 16)}</a><a class="iconbtn sm" href="https://wa.me/${E(wa)}" target="_blank" rel="noopener" aria-label="${E(T("واتساب"))}">${UI.icon("whatsapp", 16)}</a>` : ""}</div>` : ""}
      </div>`;
  }
  // The shape BookingRules and the booking dialogs expect.
  function rulesRow(b) {
    const spec = st.data.specialists.find((s) => s.id === b.barberId);
    return { id: b.id, booking_date: b.date, booking_time: b.time, duration: b.duration, status: b.status, note: b.note, price: b.price,
      service_name: b.service, barber_name: spec?.name || "", barber_id: b.barberId, user_name: b.raw.customer_name || b.raw.user_name || b.customer,
      user_phone: b.phone, guest_name: b.raw.guest_name || "", guest_phone: b.raw.guest_phone || "", canCorrect: st.mode === "owner" };
  }

  // ── day · all specialists: columns on one time axis ─────────────────────
  function dayAll(specs) {
    const d = st.data, iso = st.date, isToday = iso === d.today, now = isToday ? toMin(d.now || localNow()) : null;
    const cols = specs.map((s) => {
      const day = workday(s.schedule, iso), leave = leaveRanges(d.timeOff, s.id, iso);
      const list = d.bookings.filter((b) => b.date === iso && b.barberId === s.id && holds(b));
      return { s, day, leave, list, periods: day.on ? day.periods.map((p) => [toMin(p.start), toMin(p.end)]) : [], breaks: day.on ? day.breaks.map((r) => [toMin(r.start), toMin(r.end)]) : [] };
    });
    let lo = Infinity, hi = -Infinity;
    cols.forEach((c) => { c.periods.forEach(([a, b]) => { lo = Math.min(lo, a); hi = Math.max(hi, b); }); c.list.forEach((b) => { lo = Math.min(lo, toMin(b.time)); hi = Math.max(hi, toMin(b.time) + b.duration); }); });
    if (!isFinite(lo) || hi <= lo) { lo = 9 * 60; hi = 18 * 60; }
    lo = Math.floor(lo / 60) * 60; hi = Math.ceil(hi / 60) * 60;
    // 2.41: the scale fits the day — its shortest booking is still a readable, tappable card (about 46 px; a
    // 15-minute trim was 18 px before), and a day of long appointments stays compact.
    const shortest = Math.min(60, ...cols.flatMap((c) => c.list.map((b) => Math.max(10, b.duration || 30))));
    const pxc = Math.min(3, Math.max(PXC, 46 / shortest));
    const H = (hi - lo) * pxc, y = (m) => (m - lo) * pxc;
    const block = (cls, a, b, inner = "") => `<div class="tg-blk ${cls}" style="top:${y(a)}px;height:${Math.max(2, (b - a) * pxc)}px">${inner}</div>`;
    const hours = []; for (let m = lo; m <= hi; m += 60) hours.push(m);
    // Hour marks and booking times as short as the language allows: "9 AM" / "9 ص" on the rail, and
    // "9:00–9:30 AM" on a card (the period once when it does not change), never wrapped.
    const per = (m) => {
      const h = Math.floor(m / 60) % 24;
      if (Lang.get() === "ar") return h < 12 ? "ص" : "م";
      try { return new Intl.DateTimeFormat(Lang.locale(), { hour: "numeric", hour12: true }).formatToParts(new Date(2024, 0, 1, h)).find((p) => p.type === "dayPeriod")?.value || ""; }
      catch { return h < 12 ? "AM" : "PM"; }
    };
    const clock = (m) => `${(Math.floor(m / 60) % 12) || 12}:${String(m % 60).padStart(2, "0")}`;
    const hourLabel = (m) => `${(Math.floor(m / 60) % 12) || 12} ${per(m)}`.trim();
    const rangeLabel = (a, e) => per(a) === per(e) ? `${clock(a)}–${clock(e)} ${per(e)}`.trim() : `${clock(a)} ${per(a)}–${clock(e)} ${per(e)}`.trim();
    // Bookings that overlap in one column sit side by side (lanes) instead of on top of each other.
    const lanes = (list) => {
      const evs = list.map((b) => ({ b, a: toMin(b.time), e: toMin(b.time) + b.duration })).sort((p, q) => p.a - q.a || q.e - p.e);
      let group = [], end = -1;
      const close = () => { const n = Math.max(1, ...group.map((x) => x.lane + 1)); group.forEach((x) => { x.of = n; }); group = []; };
      for (const x of evs) {
        if (x.a >= end && group.length) close();
        const used = new Set(group.filter((g) => g.e > x.a).map((g) => g.lane));
        let lane = 0; while (used.has(lane)) lane++;
        x.lane = lane; group.push(x); end = Math.max(end, x.e);
      }
      if (group.length) close();
      return evs;
    };
    const pending = cols.reduce((n, c) => n + c.list.filter((b) => b.status === "pending").length, 0);
    const count = cols.reduce((n, c) => n + c.list.length, 0);
    return `<div class="sch-chips"><span>${UI.icon("users", 14)} ${E(pick(`${Lang.number(cols.length)} مختصين`, `${cols.length} specialists`, `${cols.length} מומחים`))}</span><span>${UI.icon("calendar", 14)} ${E(appts(count))}</span>${pending ? `<span class="warn">${UI.icon("clock", 14)} ${Lang.number(pending)} ${E(T("بانتظار التأكيد"))}</span>` : ""}</div>
      <div class="tg-wrap" role="region" aria-label="${E(T("جدول كل المختصين"))}" tabindex="0"><div class="tg" style="--cols:${cols.length};--h:${H}px">
        <div class="tg-head"><div class="tg-corner"></div>${cols.map((c) => `<button type="button" class="tg-col-head" ${st.mode === "owner" ? `data-sch-barber="${E(c.s.id)}"` : ""} aria-label="${E(c.s.name)}">
          <span class="tg-av" style="--c:${color(c.s.id)}">${c.s.image ? `<img src="${E(c.s.image)}" alt="" data-initial="${E(ini(c.s.name))}" loading="lazy">` : E(ini(c.s.name))}</span>
          <span class="tg-col-name"><b data-i18n-skip dir="auto">${E(c.s.name)}</b><small>${c.day.on || c.list.length ? E(appts(c.list.length)) : E(T("إجازة"))}</small></span></button>`).join("")}</div>
        <div class="tg-body">
          <div class="tg-times">${hours.map((m) => `<span style="top:${y(m)}px">${E(hourLabel(m))}</span>`).join("")}</div>
          ${cols.map((c) => {
            const shut = minus([[lo, hi]], c.periods);
            const leave = clip(c.leave, [[lo, hi]]);
            return `<div class="tg-col">${hours.map((m) => `<i class="tg-line" style="top:${y(m)}px"></i>${m < hi ? `<i class="tg-line half" style="top:${y(m + 30)}px"></i>` : ""}`).join("")}
              ${shut.map(([a, b]) => block("tg-shut", a, b)).join("")}
              ${minus(c.breaks, leave).map(([a, b]) => block("tg-break", a, b, b - a >= 20 ? `<span>${UI.icon("coffee", 12)} ${E(T("استراحة"))}</span>` : "")).join("")}
              ${leave.map(([a, b]) => block("tg-leave", a, b, `<span>${UI.icon("moon", 12)} ${E(T("إجازة"))}</span>`)).join("")}
              ${lanes(c.list).map(({ b, a, e, lane, of }) => {
                const h = Math.max(40, (e - a) * pxc - 3), size = h < 52 ? "tight" : h < 76 ? "mid" : "";
                const range = rangeLabel(a, e);
                return `<button type="button" class="tg-ev ${EV[b.status] || ""} ${size}" data-sch-open="${E(b.id)}"
                  style="top:${y(a) + 1}px;height:${h}px;${of > 1 ? `inset-inline-start:calc(${(lane * 100) / of}% + 3px);width:calc(${100 / of}% - 6px);` : ""}"
                  aria-label="${E(b.customer)} · ${E(b.service)} · ${E(range)}">
                  <span class="tg-ev-time"><bdi>${E(range)}</bdi>${b.status === "pending" ? `<i class="tg-ev-flag" aria-hidden="true">${UI.icon("clock", 11)}</i>` : ""}</span>
                  <b data-i18n-skip dir="auto">${E(b.customer || "—")}</b>${size === "tight" ? "" : `<small data-i18n-skip dir="auto">${E(b.service)}</small>`}</button>`; }).join("")}
            </div>`;
          }).join("")}
          ${isToday && now >= lo && now <= hi ? `<i class="tg-now" style="top:${y(now)}px" aria-label="${E(T("الآن"))}"></i>` : ""}
        </div></div></div>
      <p class="sch-legend">${E(T("كل الأعمدة على نفس مقياس الوقت. المساحات الرمادية خارج الدوام. اضغط على موعد لعرضه."))}</p>`;
  }

  // ── week · one specialist: the 2.30 week grid, restored ─────────────────
  const ROW = 84, HEAD = 64, TIMEW = 72, COLW = 166;   // the 2.30 measures
  let lastGrid = "", gridSize = { w: 1, h: 1 };
  function weekOne(s) {
    const d = st.data, startDay = weekStart(st.date), days = Array.from({ length: 7 }, (_, i) => addDays(startDay, i));
    const plans = days.map((iso) => { const w = workday(s.schedule, iso); return { iso, on: w.on, periods: w.periods.map((p) => [toMin(p.start), toMin(p.end)]),
      breaks: w.breaks.map((r) => [toMin(r.start), toMin(r.end)]), leave: leaveRanges(d.timeOff, s.id, iso) }; });
    const rows = d.bookings.filter((b) => b.barberId === s.id && b.status !== "cancelled" && days.includes(b.date));
    let sMin = Infinity, eMin = -Infinity;
    plans.forEach((p) => p.on && p.periods.forEach(([a, b]) => { sMin = Math.min(sMin, a); eMin = Math.max(eMin, b); }));
    if (!isFinite(sMin) || eMin <= sMin) { sMin = 540; eMin = 1260; }
    rows.forEach((b) => { sMin = Math.min(sMin, toMin(b.time)); eMin = Math.max(eMin, toMin(b.time) + b.duration); });
    sMin = Math.floor(sMin / 60) * 60; eMin = Math.ceil(eMin / 60) * 60;
    const halfRows = Math.max(2, (eMin - sMin) / 30), hours = (eMin - sMin) / 60;
    // Unavailable time is not one thing: a closed day, a break, time off, and
    // the hours before / after a shift each get their own quiet surface.
    const cellState = (ci, m) => {
      const p = plans[ci];
      if (p.leave.some(([a, b]) => m >= a && m < b)) return "leave";
      if (!p.on) return "closed";
      if (p.breaks.some(([a, b]) => m >= a && m < b)) return "break";
      if (!p.periods.some(([a, b]) => m >= a && m < b)) return "shut";
      return "open";
    };
    let cells = "";
    for (let h = 0; h < hours; h++) {
      const rowStart = 2 + h * 2, mTop = sMin + h * 60, mBot = mTop + 30;
      cells += `<div class="cal-time" style="grid-row:${rowStart}/span 2;grid-column:1">${E(UI.timeAr(hhmm(mTop)))}</div>`;
      for (let c = 0; c < 7; c++) for (const [m, row] of [[mTop, rowStart], [mBot, rowStart + 1]]) {
        const state = cellState(c, m);
        const first = (state === "break" || state === "leave") && cellState(c, m - 30) !== state;
        cells += `<div class="cal-cell" data-state="${state}" style="grid-row:${row};grid-column:${c + 2}">${first ? `<span class="cal-cell-label">${UI.icon(state === "break" ? "coffee" : "moon", 13)} ${E(T(state === "break" ? "استراحة" : "إجازة"))}</span>` : ""}</div>`;
      }
    }
    let head = `<div class="cal-hcell cal-corner" style="grid-row:1;grid-column:1"></div>`;
    plans.forEach((p, i) => {
      const closed = !p.on || p.leave.some(([a, b]) => a <= 0 && b >= 1440);
      head += `<button type="button" class="cal-hcell ${p.iso === d.today ? "today" : ""} ${closed ? "closed" : ""}" data-sch-day="${p.iso}" style="grid-row:1;grid-column:${i + 2}">
        <span>${E(UI.dayName(p.iso))}</span><small>${E(closed ? T(p.on ? "إجازة" : "مغلق") : shortDate(p.iso))}</small></button>`;
    });
    // Appointments by the minute in a per-day column; overlapping ones side by side.
    let evs = "";
    days.forEach((iso, ci) => {
      const list = rows.filter((b) => b.date === iso).map((b) => ({ b, s: toMin(b.time), e: toMin(b.time) + Math.max(5, b.duration) })).sort((a, b) => a.s - b.s || a.e - b.e);
      const clusters = [];
      list.forEach((x) => { const last = clusters[clusters.length - 1]; if (last && x.s < last.e) { last.e = Math.max(last.e, x.e); last.items.push(x); } else clusters.push({ e: x.e, items: [x] }); });
      let inner = "";
      clusters.forEach((cl) => {
        const lanes = [];
        cl.items.forEach((x) => { let li = lanes.findIndex((end) => end <= x.s); if (li < 0) { lanes.push(x.e); li = lanes.length - 1; } else lanes[li] = x.e; x.lane = li; });
        const w = 100 / Math.max(1, lanes.length);
        cl.items.forEach((x) => {
          const top = ((x.s - sMin) / 30) * ROW + 2, h = Math.max(20, ((x.e - x.s) / 30) * ROW - 4);
          inner += `<button type="button" class="cal-ev ${EV[x.b.status] || ""} ${h < 40 ? "tight" : ""}" data-sch-open="${E(x.b.id)}" data-booking-status="${E(x.b.status)}"
            aria-label="${E([x.b.customer, x.b.service, `${hhmm(x.s)} – ${hhmm(x.e)}`, T(BookingRules.LABELS[x.b.status] || x.b.status)].join(Lang.get() === "ar" ? "، " : ", "))}"
            style="top:${top}px;height:${h}px;inset-inline-start:calc(${x.lane * w}% + 2px);width:calc(${w}% - 4px)">
            <b data-i18n-skip>${E(x.b.customer || "—")}</b>${h >= 60 ? `<span data-i18n-skip>${E(x.b.service || "")}</span>` : ""}
            <small dir="ltr">${hhmm(x.s)} – ${hhmm(x.e)}</small>${h >= 74 ? `<span class="cal-ev-status">${E(T(BookingRules.LABELS[x.b.status] || ""))}</span>` : ""}</button>`;
        });
      });
      evs += `<div class="cal-col" style="grid-column:${ci + 2};grid-row:2/span ${halfRows}">${inner}</div>`;
    });
    let nowLine = "";
    const nowMin = toMin(d.now || localNow());
    if (days.includes(d.today) && nowMin >= sMin && nowMin <= eMin) {
      nowLine = `<div class="cal-now" style="top:${HEAD + ((nowMin - sMin) / 30) * ROW}px;inset-inline-start:${TIMEW}px;width:calc(100% - ${TIMEW}px)"><span class="cal-now-dot"></span></div>`;
    }
    lastGrid = `<div class="cal" style="grid-template-columns:${TIMEW}px repeat(7,minmax(${COLW}px,1fr));grid-template-rows:${HEAD}px repeat(${halfRows},${ROW}px)">${head}${cells}${evs}${nowLine}</div>`;
    gridSize = { w: TIMEW + 7 * COLW, h: HEAD + halfRows * ROW };
    const n = rows.filter(holds).length, p = rows.filter((b) => b.status === "pending").length;
    return `<div class="sch-chips"><span>${UI.icon("calendar", 14)} ${E(appts(n))}</span>${p ? `<span class="warn">${UI.icon("clock", 14)} ${Lang.number(p)} ${E(T("بانتظار التأكيد"))}</span>` : ""}
        <button type="button" class="btn sm cal-full-open-btn" id="cal-full" aria-haspopup="dialog">${UI.icon("expand", 15)} ${E(T("ملء الشاشة"))}</button></div>
      ${legend()}<div class="cal-wrap">${lastGrid}</div>
      <p class="tiny" style="text-align:center;margin-top:10px">${E(T("اضغط على أي حجز لعرض التفاصيل وإدارته، أو على اليوم لفتحه"))}</p>`;
  }
  function legend() {
    return `<div class="cal-legend"><span class="lg ev-confirmed">${E(T("مؤكدة"))}</span><span class="lg ev-pending">${E(T("بانتظار التأكيد"))}</span>
      <span class="lg ev-completed">${E(T("مكتملة"))}</span><span class="lg ev-noshow">${E(T("لم يحضر"))}</span>
      <span class="lg lg-surface" data-state="open">${E(T("وقت متاح"))}</span><span class="lg lg-surface" data-state="break">${E(T("استراحة"))}</span>
      <span class="lg lg-surface" data-state="leave">${E(T("إجازة"))}</span><span class="lg lg-surface" data-state="shut">${E(T("خارج الدوام"))}</span>
      <span class="lg lg-surface" data-state="closed">${E(T("يوم مغلق"))}</span></div>`;
  }

  // Full screen: the whole week fitted to the screen, zoomable with two
  // fingers (or ctrl + wheel) and − / +. (Restored from 2.30.)
  let full = null, zoom = 1, fitMode = true, pinching = false, lockY = 0;
  const reduced = () => !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const isIOS = () => document.documentElement.dataset.native === "ios" || /iP(hone|ad|od)/.test(navigator.platform || "") || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  function lockPage(on) {
    const s = document.body.style;
    if (on) { lockY = window.scrollY || 0; if (isIOS()) Object.assign(s, { position: "fixed", top: `-${lockY}px`, left: "0", right: "0", width: "100%" }); }
    else if (s.position === "fixed") { Object.assign(s, { position: "", top: "", left: "", right: "", width: "" }); window.scrollTo(0, lockY); }
  }
  function fitZoom(wrap) { const z = Math.min(1, (wrap.clientWidth - 2) / gridSize.w, (wrap.clientHeight - 2) / gridSize.h); return Math.max(0.2, Math.floor(z * 100) / 100); }
  function applyZoom(wrap, z) {
    const cal = wrap && wrap.querySelector(".cal"); if (!cal) return;
    let sizer = cal.parentElement;
    if (!sizer.classList.contains("cal-sizer")) { sizer = document.createElement("div"); sizer.className = "cal-sizer"; cal.before(sizer); sizer.appendChild(cal); }
    const w = Math.max(gridSize.w, (wrap.clientWidth - 2) / z);
    cal.style.width = w + "px"; cal.style.transform = z === 1 ? "" : `scale(${z})`;
    sizer.style.width = w * z + "px"; sizer.style.height = gridSize.h * z + "px";
  }
  function showZoom() { const p = full && full.querySelector("[data-cal-fit]"); if (p) { p.textContent = Math.round(zoom * 100) + "%"; p.classList.toggle("active", fitMode); } }
  function setZoom(z, cx, cy, at) {
    const wrap = full && full.querySelector(".cal-wrap"), cal = wrap && wrap.querySelector(".cal"); if (!cal) return;
    const min = fitZoom(wrap); z = Math.min(2, Math.max(min, z || 0));
    const wr = wrap.getBoundingClientRect(); if (cx == null) { cx = wr.left + wr.width / 2; cy = wr.top + wr.height / 2; }
    const before = cal.getBoundingClientRect();
    const fx = at ? at.fx : (cx - before.left) / before.width, fy = at ? at.fy : (cy - before.top) / before.height;
    zoom = z; fitMode = z <= min + 0.001; applyZoom(wrap, z);
    const after = cal.getBoundingClientRect();
    wrap.scrollLeft += after.left + fx * after.width - cx; wrap.scrollTop += after.top + fy * after.height - cy;
    showZoom();
  }
  function wirePinch(wrap) {
    let p = null;
    const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY), mid = (t) => [(t[0].clientX + t[1].clientX) / 2, (t[0].clientY + t[1].clientY) / 2];
    wrap.addEventListener("touchstart", (e) => { if (e.touches.length !== 2) return; const cal = wrap.querySelector(".cal"); if (!cal) return;
      const [cx, cy] = mid(e.touches), r = cal.getBoundingClientRect(); p = { d: dist(e.touches) || 1, z: zoom, fx: (cx - r.left) / r.width, fy: (cy - r.top) / r.height }; pinching = true; }, { passive: true });
    wrap.addEventListener("touchmove", (e) => { if (!p || e.touches.length !== 2) return; if (e.cancelable) e.preventDefault(); const [cx, cy] = mid(e.touches); setZoom(p.z * dist(e.touches) / p.d, cx, cy, p); }, { passive: false });
    const end = (e) => { if (e.touches.length < 2) { p = null; pinching = false; } };
    wrap.addEventListener("touchend", end); wrap.addEventListener("touchcancel", end);
    wrap.addEventListener("gesturestart", (e) => e.preventDefault());
    wrap.addEventListener("wheel", (e) => { if (!e.ctrlKey) return; e.preventDefault(); setZoom(zoom * Math.exp(-e.deltaY / 200), e.clientX, e.clientY); }, { passive: false });
  }
  function paintFull(first) {
    if (!full) return;
    if (st.view !== "week" || visibleSpecs().length !== 1) { closeFull(); return; }
    const wrap = full.querySelector(".cal-wrap"), keep = first ? null : { l: wrap.scrollLeft, t: wrap.scrollTop };
    full.querySelector("[data-cal-range]").textContent = dateLabel();
    wrap.innerHTML = lastGrid; wireOpen(wrap);
    const min = fitZoom(wrap); zoom = fitMode ? min : Math.max(min, zoom); fitMode = zoom <= min + 0.001;
    applyZoom(wrap, zoom); showZoom();
    if (keep) { wrap.scrollLeft = keep.l; wrap.scrollTop = keep.t; } else requestAnimationFrame(() => slideToNow(wrap, true));
  }
  function closeFull() {
    if (!full) return;
    full._off(); full.remove(); full = null;
    document.documentElement.classList.remove("cal-full-open"); lockPage(false);
    document.getElementById("cal-full")?.focus({ preventScroll: true });
  }
  function openFull() {
    if (full || !lastGrid) return;
    const rtl = document.documentElement.dir === "rtl";
    full = document.createElement("div"); full.className = "cal-full"; full.setAttribute("role", "dialog"); full.setAttribute("aria-modal", "true"); full.setAttribute("aria-label", T("الجدول الأسبوعي"));
    full.innerHTML = `<div class="cal-full-bar"><div class="cal-full-row"><button type="button" class="btn sm cal-full-exit" data-cal-close>${UI.icon("x", 16)} ${E(T("خروج"))}</button>
        <div class="cal-range"><button type="button" class="pg-btn sm2" data-cal-step="-7" aria-label="${E(T("الأسبوع السابق"))}">${UI.icon(rtl ? "arrowR" : "arrowL", 18)}</button><span data-cal-range></span>
        <button type="button" class="pg-btn sm2" data-cal-step="7" aria-label="${E(T("الأسبوع التالي"))}">${UI.icon(rtl ? "arrowL" : "arrowR", 18)}</button></div></div>
      <div class="cal-full-row"><button type="button" class="btn line sm" data-cal-today>${UI.icon("calendar", 15)} ${E(T("هذا الأسبوع"))}</button>
        <div class="cal-zoom" role="group" aria-label="${E(T("التكبير"))}"><button type="button" class="pg-btn sm2" data-cal-zoom="out" aria-label="${E(T("تصغير العرض"))}">${UI.icon("minus", 16)}</button>
        <button type="button" class="cal-zoom-fit" data-cal-fit data-i18n-skip aria-label="${E(T("عرض الأسبوع كاملاً"))}">100%</button>
        <button type="button" class="pg-btn sm2" data-cal-zoom="in" aria-label="${E(T("تكبير العرض"))}">${UI.icon("plus", 16)}</button></div></div></div>
      <div class="cal-wrap cal-full-wrap"></div><p class="cal-full-hint tiny">${E(T("قرّب أو بعّد بإصبعين، واضغط على أي حجز لإدارته"))}</p>`;
    lockPage(true); document.body.appendChild(full); document.documentElement.classList.add("cal-full-open");
    const sheet = full;
    sheet.querySelector("[data-cal-close]").onclick = closeFull;
    sheet.querySelectorAll("[data-cal-step]").forEach((b) => b.onclick = () => go({ date: addDays(st.date, Number(b.dataset.calStep)) }));
    sheet.querySelector("[data-cal-today]").onclick = () => go({ date: st.data.today });
    sheet.querySelector('[data-cal-zoom="in"]').onclick = () => setZoom(zoom * 1.25);
    sheet.querySelector('[data-cal-zoom="out"]').onclick = () => setZoom(zoom / 1.25);
    sheet.querySelector("[data-cal-fit]").onclick = () => setZoom(0);
    wirePinch(sheet.querySelector(".cal-wrap"));
    const onKey = (e) => { if (e.key === "Escape" && !document.querySelector("#modal-root .modal-bg")) { e.preventDefault(); closeFull(); } };
    const onResize = () => { if (fitMode) setZoom(0); };
    window.addEventListener("keydown", onKey, true); window.addEventListener("resize", onResize); window.addEventListener("hashchange", closeFull);
    sheet._off = () => { window.removeEventListener("keydown", onKey, true); window.removeEventListener("resize", onResize); window.removeEventListener("hashchange", closeFull); };
    fitMode = true; paintFull(true);
    setTimeout(() => { if (full === sheet && fitMode) setZoom(0); }, 260);
    sheet.querySelector("[data-cal-close]").focus({ preventScroll: true });
  }
  // Bring today's column (and the now line) into view; rects, not scroll
  // offsets, so the same code works right-to-left and left-to-right.
  function slideToNow(wrap, smooth) {
    if (!wrap) return;
    const cell = wrap.querySelector(".cal-hcell.today"), corner = wrap.querySelector(".cal-corner,.tg-corner");
    const wr = wrap.getBoundingClientRect(), rtl = getComputedStyle(wrap).direction === "rtl", cw = corner ? corner.getBoundingClientRect().width : 0;
    let dx = 0, dy = 0;
    if (cell) { const cr = cell.getBoundingClientRect(); dx = rtl ? cr.right - (wr.right - wrap.clientLeft - cw) : cr.left - (wr.left + wrap.clientLeft + cw); }
    const now = wrap.querySelector(".cal-now,.tg-now");
    if (now) dy = now.getBoundingClientRect().top - (wr.top + wrap.clientHeight / 3);
    if (dx || dy) wrap.scrollTo({ left: wrap.scrollLeft + dx, top: Math.max(0, wrap.scrollTop + dy), behavior: smooth && !reduced() ? "smooth" : "auto" });
  }

  // ── week · the whole team: specialists × days ───────────────────────────
  function weekTeam(specs) {
    const d = st.data, startDay = weekStart(st.date);
    const days = Array.from({ length: 7 }, (_, i) => addDays(startDay, i));
    const ids = new Set(specs.map((s) => s.id));
    const mine = d.bookings.filter((b) => ids.has(b.barberId));
    const strip = `<div class="sch-week-strip">${days.map((iso) => {
      const n = mine.filter((b) => b.date === iso && holds(b)).length, p = mine.filter((b) => b.date === iso && b.status === "pending").length;
      return `<button type="button" class="sch-wday ${iso === d.today ? "today" : ""}" data-sch-day="${iso}"><small>${E(shortDay(iso))}</small><b>${Lang.number(Number(iso.slice(8)))}</b><span>${n ? E(Lang.number(n)) : "—"}</span>${p ? `<em class="sch-pending" aria-label="${E(T("بانتظار التأكيد"))}">${Lang.number(p)}</em>` : ""}</button>`;
    }).join("")}</div>`;
    return strip + `<div class="sch-grid-wrap"><table class="sch-grid"><thead><tr><th scope="col">${E(T("المختص"))}</th>${days.map((iso) => `<th scope="col" class="${iso === d.today ? "today" : ""}"><button type="button" data-sch-day="${iso}">${E(shortDay(iso))}<small>${E(shortDate(iso))}</small></button></th>`).join("")}</tr></thead>
      <tbody>${specs.map((s) => `<tr><th scope="row"><i class="sch-dot" style="--c:${color(s.id)}"></i><span data-i18n-skip>${E(s.name)}</span></th>${days.map((iso) => {
        const day = workday(s.schedule, iso), list = mine.filter((b) => b.barberId === s.id && b.date === iso), leave = leaveRanges(d.timeOff, s.id, iso);
        const held = list.filter(holds), pend = list.filter((b) => b.status === "pending").length;
        if ((!day.on || leave.some(([a, b]) => a <= 0 && b >= 1440)) && !list.length) return `<td class="off ${iso === d.today ? "today" : ""}"><span>${E(T("إجازة"))}</span></td>`;
        const work = workMinutes(day) - total(clip(leave, day.periods.map((p) => [toMin(p.start), toMin(p.end)]))), busy = held.reduce((n, b) => n + b.duration, 0);
        const pct = work > 0 ? Math.min(100, Math.round(busy / work * 100)) : (busy ? 100 : 0);
        return `<td class="${iso === d.today ? "today" : ""}"><button type="button" class="sch-cell" data-sch-goto="${iso}|${E(s.id)}" aria-label="${E(s.name)} ${E(shortDate(iso))}: ${E(appts(held.length))}">
          <b>${Lang.number(held.length)}</b>${pend ? `<em class="sch-pending">${Lang.number(pend)}</em>` : ""}<span class="sch-meter" aria-hidden="true"><i style="width:${pct}%"></i></span><small>${E(pick(`ممتلئ ${Lang.number(pct)}٪`, `${pct}% full`, `${pct}% מלא`))}</small></button></td>`;
      }).join("")}</tr>`).join("")}</tbody></table></div>
      <p class="sch-legend">${E(T("الرقم = عدد المواعيد · الدائرة = بانتظار التأكيد · الشريط = مدى امتلاء اليوم. اضغط على أي خانة لعرض اليوم."))}</p>`;
  }

  // ── wiring ─────────────────────────────────────────────────────────────
  const find = (id) => st.data.bookings.find((b) => b.id === id);
  // Seeing every specialist's schedule does not allow managing their bookings:
  // those open read-only (the server refuses changes anyway).
  const mayManage = (b) => st.mode === "specialist" ? !!st.me && b.barberId === st.me.id : st.canManage !== false;
  function readOnly(b) {
    const spec = st.data.specialists.find((s) => s.id === b.barberId);
    UI.modal(`<div class="mhead"><h3>${E(T("تفاصيل الحجز"))}</h3><button class="iconbtn" id="sro-x" aria-label="${E(T("إغلاق"))}">${UI.icon("x", 20)}</button></div>
      <div class="mform"><div class="card"><div class="row between"><b data-i18n-skip>${E(b.customer || "—")}</b>${UI.badge(b.status)}</div>
        <div class="muted" data-i18n-skip>${E(b.service || "—")} · ${E(spec?.name || "")}</div>
        <div class="tiny"><bdi>${E(UI.dateAr(b.date))} · ${E(UI.timeAr(b.time))} – ${E(UI.timeAr(hhmm(toMin(b.time) + b.duration)))}</bdi></div></div>
        <p class="tiny">${E(T("للعرض فقط. يدير هذا الموعد مختصه أو مدير العمل."))}</p></div>`);
    document.getElementById("sro-x").onclick = UI.closeModal;
  }
  function wireOpen(root) {
    root.querySelectorAll("[data-sch-open]").forEach((el) => {
      const open = (e) => { if (e.target.closest("button[data-bk-act], a")) return; const b = find(el.dataset.schOpen); if (!b) return;
        if (!mayManage(b) || !st.editBooking) { readOnly(b); return; } st.editBooking(rulesRow(b), refresh); };
      el.onclick = open;
      if (el.tagName !== "BUTTON") el.onkeydown = (e) => { if ((e.key === "Enter" || e.key === " ") && e.target === el) { e.preventDefault(); open(e); } };
    });
  }
  function wireBody(host) {
    wireOpen(host);
    host.querySelectorAll("[data-sch-day]").forEach((el) => el.onclick = () => go({ view: "day", date: el.dataset.schDay }));
    host.querySelectorAll("[data-sch-goto]").forEach((el) => el.onclick = () => { const [date, barber] = el.dataset.schGoto.split("|"); go({ view: "day", date, barber }); });
    host.querySelectorAll(".tg-col-head[data-sch-barber]").forEach((b) => b.onclick = () => go({ barber: b.dataset.schBarber }));
    host.querySelectorAll("[data-fold]").forEach((el) => {
      const toggle = () => { const k = Number(el.dataset.fold); if (st.open.has(k)) st.open.delete(k); else st.open.add(k); paint(); };
      el.onclick = toggle;
      if (el.tagName !== "BUTTON") el.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); } };
    });
    const fullBtn = host.querySelector("#cal-full"); if (fullBtn) fullBtn.onclick = openFull;
    if (window.BookingActions) BookingActions.wire(host, (id) => { const b = find(id); return b ? rulesRow(b) : null; }, async (row, to) => {
      if (st.mode === "owner") await rpc("admin_update_booking", { p_token: st.token, p_id: row.id, p_status: to, p_note: row.note || "" });
      else await rpc("barber_set_booking_status", { p_token: st.token, p_id: row.id, p_status: to });
      refresh();
    });
  }
  function skeleton() {
    return `<div class="sch-skel" aria-hidden="true"><div class="sk sch-sk-sum"></div>${'<div class="sk sch-sk-card"></div>'.repeat(4)}</div>`;
  }
  window.Lang?.onChange?.(() => closeFull());

  return {
    // The salon owner (and team members allowed to see every specialist).
    owner(body, opts) { return start(body, { mode: "owner", token: opts.token, editBooking: opts.editBooking, canManage: opts.canManage }); },
    // A specialist's own schedule; me = barber_self row.
    specialist(body, opts) { return start(body, { mode: "specialist", token: opts.token, me: opts.me, editBooking: opts.editBooking }); },
    freeRanges, workday,
  };
})();
