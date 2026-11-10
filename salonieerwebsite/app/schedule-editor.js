// schedule-editor.js — one working-hours editor for the specialist's own
// dashboard and the admin specialist form.
//
// Shape (unchanged, stored as-is by the server):
//   { "0": { on, periods:[{start,end}], breaks:[{start,end}] }, … "6": {…} }
//
// What it adds over the old inline editors:
//   • large, labelled Start / End fields (46px targets, 16px text so iOS never
//     zooms) that keep their width in every language instead of shrinking
//     until "09:00 AM" is cut off;
//   • a switch per day and a live one-line summary of that day's hours;
//   • live, per-row feedback: the length of each period, an end before its
//     start, overlapping periods, and a break that falls outside working time;
//   • "Copy to other working days", with an Undo — never applied silently.
window.ScheduleEditor = (() => {
  const WD = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
  const E = s => UI.esc(s);
  const toMin = t => { const [h, m] = String(t || "0:0").split(":").map(Number); return (h || 0) * 60 + (m || 0); };
  const valid = r => r && r.start && r.end;

  // Older specialists stored { on, start, end, slots[] }; read those too so an
  // existing specialist never loses their hours.
  function fromSchedule(sched) {
    const state = {};
    WD.forEach((_, i) => {
      const d = (sched || {})[i] || (sched || {})[String(i)] || {};
      const periods = Array.isArray(d.periods) && d.periods.length
        ? d.periods.map(p => ({ start: p.start || "09:00", end: p.end || "21:00" }))
        : [{ start: d.start || "09:00", end: d.end || "21:00" }];
      const breaks = Array.isArray(d.breaks) ? d.breaks.map(x => ({ start: x.start, end: x.end })) : [];
      state[i] = { on: !!d.on, periods, breaks };
    });
    return state;
  }

  function summary(d) {
    if (!d.on) return Lang.t("يوم إجازة");
    const ps = d.periods.filter(valid).sort((a, b) => toMin(a.start) - toMin(b.start));
    if (!ps.length) return Lang.t("أضف فترة عمل");
    const hours = ps.map(r => `${UI.timeAr(r.start)} – ${UI.timeAr(r.end)}`).join(" · ");
    const total = ps.reduce((n, r) => n + Math.max(0, toMin(r.end) - toMin(r.start)), 0)
      - d.breaks.filter(valid).reduce((n, r) => n + Math.max(0, toMin(r.end) - toMin(r.start)), 0);
    return `${hours} · ${Lang.duration(Math.max(0, total))}`;
  }

  // Feedback for one row: an error blocks saving, a warning only informs.
  function check(d, kind, idx) {
    const r = d[kind][idx];
    if (!valid(r)) return { level: "warn", text: Lang.t("اختر وقت البداية والنهاية") };
    if (toMin(r.end) <= toMin(r.start))
      return { level: "error", text: Lang.t(kind === "periods" ? "وقت النهاية يجب أن يكون بعد البداية" : "نهاية الاستراحة يجب أن تكون بعد بدايتها") };
    if (kind === "periods") {
      const clash = d.periods.some((o, k) => k !== idx && valid(o) && toMin(o.start) < toMin(r.end) && toMin(r.start) < toMin(o.end));
      if (clash) return { level: "error", text: Lang.t("فترات العمل متداخلة") };
    } else {
      const inside = d.periods.some(p => valid(p) && toMin(p.start) <= toMin(r.start) && toMin(r.end) <= toMin(p.end));
      if (!inside) return { level: "warn", text: Lang.t("الاستراحة خارج أوقات العمل") };
    }
    return { level: "ok", text: Lang.duration(toMin(r.end) - toMin(r.start)) };
  }

  function mount(host, state) {
    let undo = null;
    const rangeRow = (kind, i, idx, r) => `
      <div class="rg-row" data-kind="${kind}" data-i="${i}" data-idx="${idx}">
        <label class="rg-field"><span>يبدأ</span><input class="input rg-s" type="time" step="300" value="${E(r.start || "")}"></label>
        <span class="rg-to" aria-hidden="true">–</span>
        <label class="rg-field"><span>ينتهي</span><input class="input rg-e" type="time" step="300" value="${E(r.end || "")}"></label>
        <button type="button" class="rg-del" aria-label="حذف">${UI.icon("trash", 16)}</button>
        <small class="rg-hint" aria-live="polite"></small>
      </div>`;

    const dayBody = i => `
      <div class="rg-group">
        <div class="rg-title">${UI.icon("clock", 14)} أوقات العمل</div>
        <div class="rg-list">${state[i].periods.map((r, x) => rangeRow("periods", i, x, r)).join("")}</div>
        <button type="button" class="btn line sm rg-add" data-kind="periods" data-i="${i}">${UI.icon("plus", 15)} إضافة فترة عمل</button>
      </div>
      <div class="rg-group">
        <div class="rg-title">${UI.icon("coffee", 14)} الاستراحات</div>
        <div class="rg-list">${state[i].breaks.map((r, x) => rangeRow("breaks", i, x, r)).join("")}</div>
        <button type="button" class="btn line sm rg-add" data-kind="breaks" data-i="${i}">${UI.icon("plus", 15)} إضافة استراحة</button>
      </div>
      <div class="rg-tools">
        <button type="button" class="btn ghost sm rg-copy" data-i="${i}">${UI.icon("refresh", 15)} نسخ إلى باقي أيام العمل</button>
      </div>`;

    const dayCard = i => `
      <section class="day-edit ${state[i].on ? "is-on" : ""}" data-day="${i}">
        <div class="day-edit-head">
          <div class="day-edit-name"><b>${WD[i]}</b><small class="day-edit-summary" data-summary="${i}">${E(summary(state[i]))}</small></div>
          <label class="switch"><input type="checkbox" class="d-on" aria-label="${WD[i]}" ${state[i].on ? "checked" : ""}><span class="track"></span><span class="thumb"></span></label>
        </div>
        <div class="day-body" data-body="${i}" ${state[i].on ? "" : "hidden"}>${dayBody(i)}</div>
      </section>`;

    host.innerHTML = `<div class="schedule-days">${WD.map((_, i) => dayCard(i)).join("")}</div>`;

    const card = i => host.querySelector(`[data-day="${i}"]`);
    function refreshDay(i) {
      const s = host.querySelector(`[data-summary="${i}"]`);
      if (s) s.textContent = summary(state[i]);
      card(i)?.querySelectorAll(".rg-row").forEach(row => {
        const res = check(state[i], row.dataset.kind, Number(row.dataset.idx));
        const hint = row.querySelector(".rg-hint");
        row.dataset.state = res.level;
        if (hint) hint.textContent = res.text;
      });
    }
    function redrawDay(i) {
      const body = host.querySelector(`[data-body="${i}"]`);
      if (!body) return;
      body.innerHTML = dayBody(i);
      wireDay(i);
      refreshDay(i);
    }
    function wireDay(i) {
      const body = host.querySelector(`[data-body="${i}"]`);
      if (!body) return;
      body.querySelectorAll(".rg-row").forEach(row => {
        const kind = row.dataset.kind, idx = Number(row.dataset.idx);
        const sync = () => {
          state[i][kind][idx] = { start: row.querySelector(".rg-s").value, end: row.querySelector(".rg-e").value };
          refreshDay(i);
        };
        row.querySelector(".rg-s").addEventListener("input", sync);
        row.querySelector(".rg-e").addEventListener("input", sync);
        row.querySelector(".rg-s").onchange = sync;
        row.querySelector(".rg-e").onchange = sync;
        row.querySelector(".rg-del").onclick = () => { state[i][kind].splice(idx, 1); redrawDay(i); };
      });
      body.querySelectorAll(".rg-add").forEach(btn => btn.onclick = () => {
        const kind = btn.dataset.kind, list = state[i][kind];
        // Smart default: continue from the last period instead of repeating a
        // fixed 09:00–21:00 that would immediately overlap it.
        const last = list.filter(valid).sort((a, b) => toMin(a.end) - toMin(b.end)).slice(-1)[0];
        const hhmm = m => String(Math.floor(m / 60) % 24).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
        if (kind === "periods") list.push(last && toMin(last.end) <= 22 * 60
          ? { start: hhmm(toMin(last.end) + 60), end: hhmm(Math.min(23 * 60 + 55, toMin(last.end) + 240)) }
          : { start: "09:00", end: "21:00" });
        else {
          const work = state[i].periods.filter(valid).sort((a, b) => toMin(a.start) - toMin(b.start))[0];
          const mid = work ? Math.round((toMin(work.start) + toMin(work.end)) / 120) * 60 : 13 * 60;
          list.push({ start: hhmm(mid), end: hhmm(mid + 30) });
        }
        redrawDay(i);
      });
      body.querySelector(".rg-copy").onclick = () => copyToOthers(i);
    }
    function copyToOthers(i) {
      const targets = WD.map((_, k) => k).filter(k => k !== Number(i) && state[k].on);
      const tools = card(i)?.querySelector(".rg-tools");
      if (!targets.length) {
        if (tools) tools.dataset.note = Lang.t("فعّل أياماً أخرى أولاً");
        return;
      }
      undo = { from: i, saved: targets.map(k => [k, JSON.parse(JSON.stringify(state[k]))]) };
      const clone = JSON.parse(JSON.stringify({ periods: state[i].periods, breaks: state[i].breaks }));
      targets.forEach(k => { state[k].periods = JSON.parse(JSON.stringify(clone.periods)); state[k].breaks = JSON.parse(JSON.stringify(clone.breaks)); redrawDay(k); });
      if (tools) {
        tools.querySelector(".rg-undo")?.remove();
        tools.insertAdjacentHTML("beforeend", `<span class="rg-copied">${E(Lang.t("تم النسخ إلى"))} ${Lang.number(targets.length)} ${E(Lang.t("أيام"))}</span><button type="button" class="btn line sm rg-undo">${E(Lang.t("تراجع"))}</button>`);
        tools.querySelector(".rg-undo").onclick = () => {
          if (!undo || undo.from !== i) return;
          undo.saved.forEach(([k, d]) => { state[k] = d; redrawDay(k); });
          undo = null;
          tools.querySelector(".rg-copied")?.remove();
          tools.querySelector(".rg-undo")?.remove();
        };
      }
    }

    WD.forEach((_, i) => {
      const c = card(i), body = host.querySelector(`[data-body="${i}"]`);
      c.querySelector(".d-on").onchange = e => {
        state[i].on = e.target.checked;
        body.hidden = !e.target.checked;
        c.classList.toggle("is-on", e.target.checked);
        refreshDay(i);
      };
      wireDay(i);
      refreshDay(i);
    });

    function validate() {
      for (let i = 0; i < WD.length; i++) {
        if (!state[i].on) continue;
        const ps = state[i].periods.filter(valid);
        if (!ps.length) return `${Lang.t(WD[i])}: ${Lang.t("أضف فترة عمل واحدة على الأقل أو أوقف اليوم")}`;
        for (const r of ps)
          if (toMin(r.end) <= toMin(r.start)) return `${Lang.t(WD[i])}: ${Lang.t("وقت النهاية يجب أن يكون بعد البداية")}`;
        const sorted = ps.slice().sort((a, b) => toMin(a.start) - toMin(b.start));
        for (let k = 1; k < sorted.length; k++)
          if (toMin(sorted[k].start) < toMin(sorted[k - 1].end)) return `${Lang.t(WD[i])}: ${Lang.t("فترات العمل متداخلة")}`;
        for (const r of state[i].breaks.filter(valid))
          if (toMin(r.end) <= toMin(r.start)) return `${Lang.t(WD[i])}: ${Lang.t("نهاية الاستراحة يجب أن تكون بعد بدايتها")}`;
      }
      return null;
    }
    function value() {
      const out = {};
      WD.forEach((_, i) => {
        out[i] = { on: state[i].on, periods: state[i].periods.filter(valid), breaks: state[i].breaks.filter(valid) };
      });
      return out;
    }
    function focusFirstProblem() {
      const bad = host.querySelector('.rg-row[data-state="error"]');
      if (bad) { bad.scrollIntoView({ block: "center", behavior: "smooth" }); bad.querySelector("input")?.focus({ preventScroll: true }); }
    }
    return { validate, value, focusFirstProblem };
  }

  return { WD, fromSchedule, mount, summary };
})();
