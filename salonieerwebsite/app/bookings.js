/* One source of truth for what can be done to a booking next.
   The statuses are the five the database accepts — pending, confirmed,
   completed, cancelled, no_show — and nothing here invents a second set. The
   server stores whatever it is told, so these rules are what stop the app from
   offering a transition that contradicts the booking's own state or its time. */
window.BookingRules = (() => {
  const LABELS = {
    pending: "بانتظار التأكيد",
    confirmed: "مؤكد",
    completed: "مكتمل",
    cancelled: "ملغي",
    no_show: "لم يحضر",
    expired: "منتهي",
  };

  // A booking that has not started yet cannot have been attended or missed.
  // A small grace window keeps the actions usable for someone standing at the
  // desk a minute early without opening them a day ahead.
  const GRACE_MINUTES = 15;

  function startsAt(booking) {
    if (!booking || !booking.booking_date) return null;
    // Parsed as local time, which is how the salon reads its own day.
    const at = new Date(`${booking.booking_date}T${String(booking.booking_time || "00:00:00").slice(0, 8)}`);
    return isNaN(at) ? null : at;
  }
  function endsAt(booking) {
    const start = startsAt(booking);
    if (!start) return null;
    return new Date(start.getTime() + (Number(booking.duration) || 30) * 60000);
  }
  // Has the appointment begun (minus the grace window)?
  function hasStarted(booking, now = new Date()) {
    const start = startsAt(booking);
    return !start || now.getTime() >= start.getTime() - GRACE_MINUTES * 60000;
  }
  function hasEnded(booking, now = new Date()) {
    const end = endsAt(booking);
    return !end || now.getTime() >= end.getTime();
  }

  // Cancellation is a salon setting for the customer; staff keep it as long as
  // the booking is still open, because a salon must always be able to call off
  // an appointment it cannot serve.
  function cancellable(booking) {
    return ["pending", "confirmed"].includes(booking && booking.status);
  }

  /*  Which transitions are offered, and why:
        pending    → confirm (the whole point of the state), or cancel.
                     Attendance is meaningless before the salon has accepted.
        confirmed  → cancel while it is still ahead; complete once the visit
                     has started; no-show once it has started and the customer
                     is not there. Marking tomorrow's booking a no-show today
                     is exactly the contradiction this prevents.
        completed  → nothing that changes attendance again. Only the correction
                     back to no_show, because that is a mistake staff do make.
        no_show    → the same single correction, in the other direction.
        cancelled  → nothing. A cancelled booking is re-made, not revived.      */
  function actions(booking, now = new Date()) {
    const status = booking && booking.status;
    const started = hasStarted(booking, now);
    const out = [];
    const add = (to, label, tone, hint) => out.push({ to, label, tone, hint });

    if (status === "pending") {
      add("confirmed", "تأكيد الموعد", "confirm");
      if (cancellable(booking)) add("cancelled", "إلغاء الحجز", "danger");
    } else if (status === "confirmed") {
      if (started) {
        add("completed", "إكمال الزيارة", "confirm");
        add("no_show", "تسجيل عدم الحضور", "warn");
      }
      if (cancellable(booking)) add("cancelled", "إلغاء الحجز", "danger");
    } else if (status === "completed") {
      add("no_show", "تصحيح: لم يحضر", "neutral");
    } else if (status === "no_show") {
      add("completed", "تصحيح: تمت الزيارة", "neutral");
    } else if (status === "expired" && booking && booking.canCorrect) {
      // Expired = nobody closed it within 24 hours. Only the salon admin may
      // correct it afterwards (the visit did happen, or the customer did not come).
      add("completed", "تصحيح: تمت الزيارة", "neutral");
      add("no_show", "تصحيح: لم يحضر", "neutral");
    }
    return out;
  }

  // Why nothing is on offer, in the person's own words — so an empty action
  // area never reads as a bug.
  function note(booking, now = new Date()) {
    const status = booking && booking.status;
    if (status === "cancelled") return "هذا الحجز ملغي. لإعادة الموعد أنشئ حجزاً جديداً.";
    if (status === "expired") return "انتهى هذا الحجز تلقائياً بعد 24 ساعة من موعده دون تحديث حالته.";
    if (status === "confirmed" && !hasStarted(booking, now))
      return "يمكن تسجيل الحضور أو عدم الحضور عند بدء الموعد.";
    return "";
  }

  return { LABELS, actions, note, cancellable, hasStarted, hasEnded, startsAt, endsAt, GRACE_MINUTES };
})();

/* The action buttons of one booking, drawn and wired the same way wherever the
   booking is shown (specialist list, day agenda, week grid, booking sheet), so
   those views can never offer different things again. The caller only says how
   to apply a status (which RPC) and what to refresh afterwards. */
window.BookingActions = (() => {
  const TONE = { confirm: "ok", danger: "danger", warn: "warn", neutral: "line" };
  const esc = v => UI.esc(v);
  function inline(booking, opts = {}) {
    return BookingRules.actions(booking).map(a => `<button type="button" class="btn ${opts.large ? "" : "sm"} ${TONE[a.tone] || "line"}"
      data-bk-act="${esc(a.to)}" data-bk-id="${esc(booking.id)}" data-bk-label="${esc(a.label)}">${esc(a.label)}</button>`).join("");
  }
  function wire(root, find, apply) {
    if (!root) return;
    root.querySelectorAll("[data-bk-act]").forEach(btn => btn.onclick = () => {
      const booking = find(btn.dataset.bkId);
      if (!booking) return;
      const to = btn.dataset.bkAct;
      const run = async () => {
        btn.disabled = true;
        try { await apply(booking, to); UI.toast("تم التحديث", "ok"); }
        catch (e) { btn.disabled = false; UI.toast(e.message, "err"); }
      };
      // Calling off or marking a no-show is asked once more; confirming is not.
      if (to === "cancelled" || to === "no_show") UI.confirm(`${btn.dataset.bkLabel}؟`, run, to === "cancelled");
      else run();
    });
  }
  return { inline, wire };
})();
