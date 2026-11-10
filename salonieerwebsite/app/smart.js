// smart.js — small, shared "context" helpers used across the customer and
// staff screens. Nothing here talks to the server or sends data anywhere:
// it reads what a page already has, plus a little memory kept on this device.
//
//   Smart.dayLabel(date)         → "Today", "Tomorrow", "Thursday", "12 Oct"
//   Smart.ago(ts) / Smart.until()→ "5 minutes ago", "in 2 hours"
//   Smart.phase(booking)         → upcoming / soon / now / awaiting / expired …
//   Smart.phaseChip(booking)     → a localized status chip with a live countdown
//   Smart.conflicts(list, …)     → the person's own bookings that overlap
//   Smart.memory                 → recent choices and an unfinished booking,
//                                  per salon and per account, on this device
//
// Every countdown on screen is refreshed by one shared timer, only while the
// app is visible, and without redrawing the page around it.
window.Smart = (() => {
  const MIN = 60000, HOUR = 60 * MIN, DAY = 24 * HOUR;
  const lang = () => Lang.get();
  const pick = (ar, en, he) => lang() === "en" ? en : lang() === "he" ? he : ar;

  function at(date, time) {
    const d = String(date || "").slice(0, 10), t = String(time || "00:00").slice(0, 5);
    const value = new Date(`${d}T${t}:00`);
    return Number.isNaN(value.getTime()) ? null : value;
  }
  function startOfDay(v) { const d = new Date(v); d.setHours(0, 0, 0, 0); return d; }
  function dayDiff(date, now = new Date()) {
    const d = date instanceof Date ? date : at(date);
    if (!d) return null;
    return Math.round((startOfDay(d) - startOfDay(now)) / DAY);
  }
  function rtf() {
    try { return new Intl.RelativeTimeFormat(Lang.locale(), { numeric: "auto" }); } catch { return null; }
  }
  // Today / Tomorrow / Yesterday, the weekday within the coming week, a date
  // after that. The raw date is always still available next to it.
  function dayLabel(date, now = new Date()) {
    const n = dayDiff(date, now);
    if (n === null) return "";
    const f = rtf();
    if (Math.abs(n) <= 1 && f) return capitalize(f.format(n, "day"));
    if (n > 1 && n < 7) return Lang.date(date, { weekday: "long" });
    return Lang.date(date, { day: "numeric", month: "short" });
  }
  function capitalize(s) { return lang() === "en" ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

  function spell(ms) {
    const minutes = Math.max(1, Math.round(Math.abs(ms) / MIN));
    if (minutes < 60) return Lang.duration(minutes);
    if (minutes < DAY / MIN) return Lang.duration(Math.round(minutes / 5) * 5);
    const days = Math.round(minutes / (DAY / MIN));
    return pick(days === 1 ? "يوم" : days === 2 ? "يومان" : days <= 10 ? `${Lang.number(days)} أيام` : `${Lang.number(days)} يوماً`,
      days === 1 ? "1 day" : `${Lang.number(days)} days`, days === 1 ? "יום" : days === 2 ? "יומיים" : `${Lang.number(days)} ימים`);
  }
  // Arabic duals take the genitive after a preposition: "بعد ساعتين".
  const genitive = s => s.replace(/ساعتان/g, "ساعتين").replace(/دقيقتان/g, "دقيقتين").replace(/يومان/g, "يومين");
  // "in 2 hours and 15 minutes" / "5 minutes ago"
  function until(target, now = Date.now()) {
    const ms = +target - now;
    if (Math.abs(ms) < MIN) return pick("الآن", "now", "עכשיו");
    return ms > 0 ? pick(`بعد ${genitive(spell(ms))}`, `in ${spell(ms)}`, `בעוד ${spell(ms)}`)
      : pick(`قبل ${genitive(spell(ms))}`, `${spell(ms)} ago`, `לפני ${spell(ms)}`);
  }
  function ago(ts, now = Date.now()) {
    live();
    const t = new Date(ts);
    if (Number.isNaN(t.getTime())) return "";
    const ms = now - t.getTime();
    if (ms < MIN) return pick("الآن", "Just now", "עכשיו");
    if (ms < DAY) return until(t, now);
    const f = rtf(), days = Math.round(ms / DAY);
    if (days < 7 && f) return capitalize(f.format(-days, "day"));
    return Lang.date(t.toISOString().slice(0, 10), { day: "numeric", month: "short" });
  }

  // ---- booking state ------------------------------------------------------
  // Derived from the booking's own date, time, length and status — so a
  // request whose time has passed is never shown as "upcoming".
  function phase(b, now = Date.now()) {
    if (!b) return "unknown";
    if (b.status === "cancelled") return "cancelled";
    if (b.status === "no_show") return "no_show";
    if (b.status === "expired") return "closed";
    if (b.status === "completed") return "done";
    const start = at(b.booking_date, b.booking_time);
    if (!start) return "unknown";
    const end = start.getTime() + (Number(b.duration) || 30) * MIN;
    if (now >= end) return b.status === "pending" ? "expired" : "finished";
    if (now >= start.getTime()) return "now";
    if (b.status === "pending") return "awaiting";
    const left = start.getTime() - now;
    if (left <= 2 * HOUR) return "soon";
    if (dayDiff(start, new Date(now)) === 0) return "today";
    return "upcoming";
  }
  const isActive = b => ["pending", "confirmed"].includes(b?.status);
  // Needs the person's attention first: starting soon / now, then requests
  // still awaiting the salon, then the rest in time order.
  const RANK = { now: 0, soon: 1, today: 2, awaiting: 3, upcoming: 4, finished: 5, expired: 6, done: 7, no_show: 8, closed: 9, cancelled: 9, unknown: 10 };
  function sortForAttention(list, now = Date.now()) {
    return (list || []).slice().sort((a, b) => {
      const pa = phase(a, now), pb = phase(b, now);
      const upcomingA = RANK[pa] <= 4, upcomingB = RANK[pb] <= 4;
      if (upcomingA !== upcomingB) return upcomingA ? -1 : 1;
      const ta = at(a.booking_date, a.booking_time)?.getTime() || 0, tb = at(b.booking_date, b.booking_time)?.getTime() || 0;
      return upcomingA ? ta - tb : tb - ta; // soonest first; most recent past first
    });
  }
  function phaseText(b, now = Date.now()) {
    const p = phase(b, now), start = at(b.booking_date, b.booking_time);
    switch (p) {
      case "now": return pick("جارٍ الآن", "Happening now", "מתרחש עכשיו");
      case "soon": return pick(`يبدأ ${until(start, now)}`, `Starts ${until(start, now)}`, `מתחיל ${until(start, now)}`);
      case "today": return pick(`اليوم ${UI.timeAr(b.booking_time)}`, `Today at ${UI.timeAr(b.booking_time)}`, `היום ב־${UI.timeAr(b.booking_time)}`);
      case "awaiting": return pick(`بانتظار تأكيد العمل · ${until(start, now)}`, `Awaiting confirmation from the business · ${until(start, now)}`, `ממתין לאישור העסק · ${until(start, now)}`);
      case "upcoming": return until(start, now).replace(/^./, c => lang() === "en" ? c.toUpperCase() : c);
      case "finished": return pick("انتهى وقت الموعد", "Appointment time has passed", "מועד התור עבר");
      case "expired": return pick("انتهى وقت الطلب دون تأكيد", "Request expired without confirmation", "הבקשה פגה ללא אישור");
      default: return "";
    }
  }
  const TONE = { now: "live", soon: "soon", today: "soon", awaiting: "warn", upcoming: "info", finished: "muted", expired: "danger" };
  // A chip that keeps counting down on its own (see tick()).
  function phaseChip(b) {
    const text = phaseText(b);
    if (!text) return "";
    live();
    const start = at(b.booking_date, b.booking_time);
    return `<span class="smart-chip tone-${TONE[phase(b)] || "info"}" data-i18n-skip data-smart-booking="${UI.esc(JSON.stringify({ booking_date: b.booking_date, booking_time: b.booking_time, duration: b.duration, status: b.status }))}"${start ? ` data-smart-at="${start.getTime()}"` : ""}>${UI.esc(text)}</span>`;
  }

  // ---- conflicts ------------------------------------------------------------
  function conflicts(list, date, time, duration, exceptId) {
    const s = at(date, time); if (!s) return [];
    const e = s.getTime() + (Number(duration) || 30) * MIN;
    return (list || []).filter(b => isActive(b) && b.id !== exceptId && (() => {
      const bs = at(b.booking_date, b.booking_time); if (!bs) return false;
      const be = bs.getTime() + (Number(b.duration) || 30) * MIN;
      return bs.getTime() < e && s.getTime() < be;
    })());
  }
  // Same day, different time — worth a gentle mention, never a block.
  function sameDay(list, date, exceptId) {
    return (list || []).filter(b => isActive(b) && b.id !== exceptId && String(b.booking_date).slice(0, 10) === String(date).slice(0, 10));
  }

  // ---- memory -----------------------------------------------------------------
  // Recent choices and an unfinished booking, per salon and per account, kept
  // only on this device. Cleared on sign-out; never sent anywhere.
  const memory = (() => {
    const key = () => `salonieer:memory:v1:${window.Shop?.slug?.() || ""}:${App.user?.user_id || "guest"}`;
    const read = () => { try { return JSON.parse(localStorage.getItem(key()) || "{}") || {}; } catch { return {}; } };
    const write = v => { try { localStorage.setItem(key(), JSON.stringify(v)); } catch {} };
    return {
      get: name => read()[name],
      set(name, value) { const all = read(); all[name] = value; write(all); },
      remove(name) { const all = read(); delete all[name]; write(all); },
      clear() { try { localStorage.removeItem(key()); } catch {} },
      // An unfinished booking is only offered back for a day.
      draft() { const d = read().draft; return d && Date.now() - (d.at || 0) < DAY ? d : null; },
      saveDraft(d) { const all = read(); all.draft = { ...d, at: Date.now() }; write(all); },
      clearDraft() { const all = read(); delete all.draft; write(all); },
      // What this person usually books with a specialist.
      usualService(barberId) { return (read().usual || {})[barberId] || null; },
      rememberBooking(b) {
        const all = read(); all.usual = all.usual || {};
        if (b.barberId && b.serviceId) all.usual[b.barberId] = { serviceId: b.serviceId, serviceName: b.serviceName || "", at: Date.now() };
        all.last = { barberId: b.barberId, barberName: b.barberName || "", serviceId: b.serviceId, serviceName: b.serviceName || "", at: Date.now() };
        delete all.draft;
        write(all);
      },
    };
  })();

  // ---- the shared ticker ------------------------------------------------------
  function tick() {
    if (document.visibilityState === "hidden") return;
    const now = Date.now();
    document.querySelectorAll("[data-smart-booking]").forEach(el => {
      let b; try { b = JSON.parse(el.dataset.smartBooking); } catch { return; }
      const text = phaseText(b, now);
      if (text && el.textContent !== text) el.textContent = text;
      const tone = "tone-" + (TONE[phase(b, now)] || "info");
      if (!el.classList.contains(tone)) { el.className = el.className.replace(/\btone-\S+/g, "").trim() + " " + tone; }
    });
    document.querySelectorAll("[data-smart-ago]").forEach(el => {
      const text = ago(el.dataset.smartAgo, now);
      if (text && el.textContent !== text) el.textContent = text;
    });
  }
  // The timer only exists while something on screen is counting down, and
  // stops by itself once nothing is (no idle wake-ups, no battery cost).
  let ticker = null;
  function live() {
    if (ticker) return;
    ticker = setInterval(() => {
      if (!document.querySelector("[data-smart-booking],[data-smart-ago]")) { clearInterval(ticker); ticker = null; return; }
      tick();
    }, 30000);
  }
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") tick(); });

  // "Good morning, Sara" — the first name only, in the reader's language.
  function greeting(name, now = new Date()) {
    const h = now.getHours();
    const first = String(name || "").trim().split(/\s+/)[0] || "";
    const base = h < 5 ? pick("مساء الخير", "Good evening", "ערב טוב") : h < 12 ? pick("صباح الخير", "Good morning", "בוקר טוב")
      : h < 18 ? pick("مساء الخير", "Good afternoon", "צהריים טובים") : pick("مساء الخير", "Good evening", "ערב טוב");
    return first ? `${base}${lang() === "ar" ? "، " : ", "}${first}` : base;
  }

  return { at, dayDiff, dayLabel, until, ago, phase, phaseText, phaseChip, isActive, sortForAttention, conflicts, sameDay, memory, tick, greeting, pick };
})();
