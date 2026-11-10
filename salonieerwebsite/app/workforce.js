/* Workforce (2.28): Employee Earnings (Specialists and Support Staff,
   compensation versions, payments), Attendance (clock in at the salon, clock
   out, overtime, review), barcode scanning for the salon's own products, and
   the specialist performance section of Statistics.

   Same rules as the Business Suite: the server calculates everything (pay,
   worked minutes, distance to the salon, statistics windows per plan); these
   screens send what happened and show the answer. Every money action carries
   one request key so a double tap or a retry is applied once. */
window.Workforce = (() => {
  "use strict";
  const E = value => UI.esc(value);
  const isPlatform = () => !!window.Control?.target();
  const tok = () => isPlatform() ? "__platform__" : App.token;
  const field = id => document.getElementById(id);
  const val = id => (field(id)?.value ?? "").trim();
  const pick = (ar, en, he) => { const l = Lang.get(); return l === "en" ? en : l === "he" ? he : ar; };
  const num = n => (Number(n) || 0).toLocaleString(Lang.locale());
  const pct = n => (Number(n) || 0).toLocaleString(Lang.locale(), { maximumFractionDigits: 1 }) + "%";
  const day = d => d ? UI.dateAr(String(d).slice(0, 10)) : "—";
  const clock = d => d ? new Date(d).toLocaleTimeString(Lang.locale(), { hour: "2-digit", minute: "2-digit" }) : "—";
  const stamp = d => d ? new Date(d).toLocaleString(Lang.locale(), { dateStyle: "medium", timeStyle: "short" }) : "";
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const addDays = (s, n) => { const d = new Date(String(s).slice(0, 10) + "T12:00:00"); d.setDate(d.getDate() + n); return iso(d); };
  const requestKey = () => (window.crypto?.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 12));
  const hours = minutes => Lang.duration(Math.round(Number(minutes) || 0));
  const errorBox = id => `<p class="form-error" id="${id}" role="alert"></p>`;
  const showError = (id, e) => { const box = field(id); if (box) box.textContent = e?.message || String(e); else UI.toast(e?.message || String(e), "err"); };
  // A local date + time in the salon's sense, sent as an ISO instant.
  // Some WebViews report "09:00:00"; only hours and minutes are used.
  const instant = (date, time) => {
    if (!date || !time) return "";
    const d = new Date(`${date}T${String(time).slice(0, 5)}:00`);
    return isNaN(d) ? "" : d.toISOString();
  };

  let currency = "ILS";
  function money(n) { return Money.fmt(n, currency); }   // 2.43: the salon's own currency (money.js)
  const moneyIn = (id, value, attrs = "") => `<input class="input" id="${id}" type="number" inputmode="decimal" min="0" step="0.01" dir="ltr" value="${value ?? ""}" ${attrs}>`;

  // ── Device: barcode camera and location ───────────────────────────────
  // Native apps use their own camera screen; the browser uses the camera with
  // BarcodeDetector when it exists; typing the code always works.
  async function scanCode() {
    if (window.NativeBridge?.available()) {
      try { const v = String(await NativeBridge.request("scan", { kind: "barcode" }) || "").trim(); if (v) return v; }
      catch (e) { if (/إلغاء|cancel|בוטל/i.test(e.message || "")) return null; }
    }
    return webScanner();
  }
  // Its own layer above any open sheet (the checkout stays as it was).
  function webScanner() {
    return new Promise(resolve => {
      let done = false, stream = null, timer = null;
      const camera = "BarcodeDetector" in window && !!navigator.mediaDevices?.getUserMedia;
      const layer = document.createElement("div");
      layer.className = "modal-bg wf-scan-layer";
      layer.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-labelledby="sc-title"><div class="mhead"><h3 id="sc-title">${E(Lang.t("مسح الباركود"))}</h3><button class="iconbtn" id="sc-x" aria-label="${E(Lang.t("إغلاق"))}">${UI.icon("x", 20)}</button></div>
        <div class="mform">${camera ? `<div class="wf-scan"><video id="sc-video" playsinline muted></video><i class="wf-scan-frame"></i></div><p class="tiny">${E(Lang.t("وجّه الكاميرا إلى الباركود."))}</p>` : ""}
          <div class="field"><label for="sc-code">${E(Lang.t(camera ? "أو اكتب الرمز" : "اكتب رمز الباركود"))}</label>
          <div class="row" style="gap:8px"><input class="input" id="sc-code" dir="ltr" inputmode="text" autocomplete="off" maxlength="128"><button class="btn sm" id="sc-ok" type="button">${E(Lang.t("بحث"))}</button></div></div></div></div>`;
      document.body.appendChild(layer);
      const finish = code => {
        if (done) return; done = true; clearInterval(timer);
        try { stream?.getTracks().forEach(t => t.stop()); } catch {}
        layer.remove(); resolve(code ? String(code).trim() : null);
      };
      layer.addEventListener("click", e => { if (e.target === layer) finish(null); });
      layer.querySelector("#sc-x").onclick = () => finish(null);
      const input = layer.querySelector("#sc-code");
      layer.querySelector("#sc-ok").onclick = () => { const v = input.value.trim(); if (v) finish(v); };
      input.onkeydown = e => { if (e.key === "Enter") { e.preventDefault(); layer.querySelector("#sc-ok").click(); } if (e.key === "Escape") finish(null); };
      if (!camera) { setTimeout(() => input.focus(), 50); return; }
      navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false }).then(async s => {
        stream = s; const video = layer.querySelector("#sc-video"); if (!video || done) { s.getTracks().forEach(t => t.stop()); return; }
        video.srcObject = s; await video.play().catch(() => {});
        let detector; try { detector = new BarcodeDetector(); } catch { return; }
        timer = setInterval(async () => {
          if (done || !video.videoWidth) return;
          try { const found = await detector.detect(video); const code = found.map(x => x.rawValue).find(Boolean); if (code) finish(code); } catch {}
        }, 300);
      }).catch(() => { const box = layer.querySelector(".wf-scan"); if (box) box.outerHTML = `<p class="tiny">${E(Lang.t("الكاميرا غير متاحة. اكتب الرمز."))}</p>`; });
    });
  }
  // One position for a clock in. Native first; the browser's geolocation is
  // the fallback (also for app builds from before 2.28).
  async function position() {
    // 2.32: explained once before the phone asks; a refusal says what else works.
    if (window.Locate && !(await Locate.explain("attendance"))) throw new Error(Lang.t("يمكنك تسجيل الحضور برمز العمل أو طلب تسجيل يدوي من المدير."));
    if (window.NativeBridge?.available()) {
      try { const raw = await NativeBridge.request("location"); const p = typeof raw === "string" ? JSON.parse(raw) : raw; if (p && isFinite(p.lat)) return p; }
      catch (e) { if (!/غير مدعومة|unsupported|אינה נתמכת/i.test(e.message || "")) throw e; }
    }
    if (!navigator.geolocation) throw new Error(Lang.t("تعذّر تحديد موقعك"));
    return new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(
      p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      e => reject(new Error(Lang.t(e.code === 1 ? "اسمح بالوصول إلى الموقع من إعدادات الجهاز" : "تعذّر تحديد موقعك"))),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 30000 }));
  }
  // The salon's area for the "you arrived — clock in" reminder (apps only).
  async function arrival(st, ask) {
    if (!window.NativeBridge?.available() || !st?.location || !st.attendance_on) return null;
    try {
      const raw = await NativeBridge.request("geofence", { lat: Number(st.location.lat), lng: Number(st.location.lng), radius: Number(st.location.radius) || 150, ask: !!ask,
        title: Lang.t("وصلت إلى العمل"), body: Lang.t("يمكنك تسجيل الحضور الآن.") });
      return typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch { return null; }
  }

  // ── Products by barcode (staff and customers) ─────────────────────────
  async function lookup(code) { return rpc("biz_barcode_lookup", { p_token: tok(), p_code: code }); }
  function productView(p, opts = {}) {
    UI.modal(`<div class="mhead"><h3 data-i18n-skip>${E(p.name)}</h3><button class="iconbtn" id="pv-x" aria-label="${E(Lang.t("إغلاق"))}">${UI.icon("x", 20)}</button></div>
      <div class="mform wf-product">${p.image_url ? `<div class="wf-product-img">${UI.img(p.image_url, { width: 320, height: 320 })}</div>` : ""}
        <div class="wf-product-price">${p.price == null ? "" : E(money(p.price))}</div>
        ${p.description ? `<p data-i18n-skip>${E(p.description)}</p>` : ""}
        ${opts.staff ? `<ul class="biz-mini"><li><span>${E(Lang.t("بالمخزون"))}</span><b dir="ltr">${num(p.stock)}</b></li>${p.code ? `<li><span>${E(Lang.t("الباركود"))}</span><b dir="ltr">${E(p.code)}</b></li>` : ""}</ul>` : ""}
        ${opts.actions || ""}</div>`);
    field("pv-x").onclick = UI.closeModal;
  }
  // Products section (staff): scan, then the saved product, price and details.
  async function scanProduct() {
    const code = await scanCode(); if (!code) return;
    let r; try { r = await lookup(code); } catch (e) { UI.toast(e.message, "err"); return; }
    if (!r.found) { UI.toast(pick(`لا يوجد منتج مسجل بهذا الباركود (${code})`, `No product is registered with this barcode (${code})`, `אין מוצר רשום עם הברקוד הזה (${code})`), "err"); return; }
    currency = Money.fromSymbol(r.currency) || Money.fromSymbol(r.symbol) || currency;
    productView(r.product, { staff: true });
  }
  // Customers: only when the owner allows it; read-only, public fields only.
  let customerScan = { key: "", enabled: false, at: 0 };
  async function customerScanEnabled() {
    const key = Shop.slug();
    if (customerScan.key === key && Date.now() - customerScan.at < 60000) return customerScan.enabled;
    if (!Features.enabled("shop") || !Features.enabled("inventory")) return false;
    try { const r = await rpc("biz_product_by_code", { p_token: App.token || null, p_code: null }); customerScan = { key, enabled: !!r.enabled, at: Date.now() }; }
    catch { customerScan = { key, enabled: false, at: Date.now() }; }
    return customerScan.enabled;
  }
  async function customerScanProduct() {
    const code = await scanCode(); if (!code) return;
    try {
      const r = await rpc("biz_product_by_code", { p_token: App.token || null, p_code: code });
      if (!r.found) { UI.toast(Lang.t("لا يوجد منتج بهذا الباركود في العمل"), "err"); return; }
      Router.go("#/product/" + r.product.id);
    } catch (e) { UI.toast(e.message, "err"); }
  }

  // ── Employee: clock in / clock out ────────────────────────────────────
  const STATE = { ok: ["مسجّل", "ok"], pending: ["بانتظار موافقة المدير", "warn"], review: ["بانتظار المراجعة", "warn"], rejected: ["مرفوض", "danger"] };
  const pill = (map, key) => { const p = map[key] || [key, "muted"]; return `<span class="badge ${p[1]}">${E(Lang.t(p[0]))}</span>`; };
  async function attendancePanel(host) {
    if (!host) return;
    host.innerHTML = UI.loading();
    let st;
    try { st = await rpc("att_status", { p_token: App.token }); }
    catch (e) { host.innerHTML = UI.empty(Lang.t("الحضور والانصراف"), e.message); return; }
    if (!st.employee) { host.innerHTML = UI.empty(Lang.t("الحضور والانصراف"), Lang.t("هذا الحساب غير مسجل كموظف في العمل")); return; }
    arrival(st, false);
    const open = st.open, native = !!window.NativeBridge?.available();
    // 2.30: how presence is proven here — location, the attendance QR or the attendance code.
    const method = st.method || "gps";
    const inLabel = method === "qr" ? "امسح رمز الحضور" : "تسجيل الحضور";
    const outLabel = method === "qr" ? "امسح الرمز للانصراف" : "تسجيل الانصراف";
    const codeBox = method === "pin" ? `<div class="field wf-pin"><label for="wf-pin">${E(Lang.t("رمز الحضور"))}</label><input class="input" id="wf-pin" inputmode="numeric" autocomplete="one-time-code" maxlength="6" dir="ltr" placeholder="••••••" data-i18n-skip></div>` : "";
    const note = method === "gps" ? "يُفحص موقعك مرة واحدة عند تسجيل الحضور فقط، ولا تُتتبع تحركاتك. الوقت المسجل هو وقت الخادم."
      : method === "qr" ? "امسح رمز الحضور الظاهر على شاشة العمل. يتغير الرمز كل بضع ثوانٍ ولا يصلح خارج العمل. الوقت المسجل هو وقت الخادم."
      : "أدخل رمز الحضور الظاهر على شاشة العمل. يتغير الرمز كل بضع ثوانٍ. الوقت المسجل هو وقت الخادم.";
    host.innerHTML = `<section class="wf-clock ${open ? "in" : "out"}">
        <div class="wf-clock-head"><span class="wf-clock-dot"></span><div><b>${E(Lang.t(open ? "أنت في الدوام" : "لست في الدوام"))}</b>
          <small>${open ? E(pick(`منذ ${clock(open.clock_in_at)}`, `since ${clock(open.clock_in_at)}`, `מאז ${clock(open.clock_in_at)}`)) + (open.state !== "ok" ? " · " + pill(STATE, open.state) : "")
            : st.scheduled ? E(pick(`دوامك اليوم ${clock(st.scheduled.start)} – ${clock(st.scheduled.end)}`, `Your shift today ${clock(st.scheduled.start)} – ${clock(st.scheduled.end)}`, `המשמרת היום ${clock(st.scheduled.start)} – ${clock(st.scheduled.end)}`)) : E(Lang.t("لا يوجد دوام مجدول اليوم"))}</small></div></div>
        ${open?.planned_end_at ? `<p class="tiny">${E(pick(`ينتهي دوامك الساعة ${clock(open.planned_end_at)}`, `Your shift ends at ${clock(open.planned_end_at)}`, `המשמרת מסתיימת ב־${clock(open.planned_end_at)}`))}${Number(st.overtime_today) ? ` · ${E(pick(`يشمل وقتاً إضافياً ${hours(st.overtime_today)}`, `includes ${hours(st.overtime_today)} overtime`, `כולל ${hours(st.overtime_today)} שעות נוספות`))}` : ""}</p>` : ""}
        ${!st.attendance_on ? `<p class="sub-warning">${E(Lang.t("تسجيل الحضور غير مفعل في هذا العمل بعد."))}</p>`
          : open ? `${codeBox}<button class="btn wf-clock-btn" id="wf-out">${UI.icon(method === "qr" ? "qr" : "logout", 18)} ${E(Lang.t(outLabel))}</button>`
          : `${codeBox}<button class="btn wf-clock-btn" id="wf-in">${UI.icon(method === "qr" ? "qr" : method === "pin" ? "lock" : "pin", 18)} ${E(Lang.t(inLabel))}</button>
             ${st.allow_fallback ? `<button class="btn line sm" id="wf-fallback">${E(Lang.t(method === "gps" ? "الموقع غير متاح؟ سجّل بموافقة المدير" : "لا يوجد رمز؟ سجّل بموافقة المدير"))}</button>` : ""}`}
        ${errorBox("wf-err")}
        <p class="tiny wf-clock-note">${UI.icon("info", 13)} ${E(Lang.t(note))}</p></section>
      ${st.today_shifts?.length ? `<section class="biz-panel"><div class="biz-panel-head"><h3>${E(Lang.t("اليوم"))}</h3></div><ul class="biz-mini">${st.today_shifts.map(s => `<li><span dir="ltr">${clock(s.clock_in_at)} – ${s.clock_out_at ? clock(s.clock_out_at) : "…"}</span>${pill(STATE, s.state)}${s.out_method === "auto" ? `<small>${E(Lang.t("انصراف تلقائي"))}</small>` : ""}${s.early_departure ? `<small>${E(Lang.t("انصراف مبكر"))}</small>` : ""}</li>`).join("")}</ul></section>` : ""}
      ${/* 2.13.0: arrival reminder removed with background location */ false && native && st.attendance_on && st.location && method === "gps" ? `<section class="biz-panel"><div class="biz-panel-head"><h3>${E(Lang.t("تذكير عند الوصول"))}</h3></div>
        <p class="tiny">${E(Lang.t("عند وصولك إلى العمل يظهر لك تنبيه بأنه يمكنك تسجيل الحضور. يراقب الجهاز منطقة العمل فقط ولا يرسل موقعك."))}</p>
        <button class="btn line sm" id="wf-arrival">${UI.icon("bell", 15)} ${E(Lang.t("تفعيل التذكير"))}</button></section>` : ""}`;
    const go = async (fn, data, button) => {
      UI.busy(button, true); field("wf-err").textContent = "";
      try { await rpc(fn, { p_token: App.token, p_data: data, p_request_key: requestKey() }); UI.toast(fn === "att_clock_in" ? "تم تسجيل الحضور" : "تم تسجيل الانصراف", "ok"); await attendancePanel(host); }
      catch (e) { showError("wf-err", e); UI.busy(button, false); }
    };
    // The code for a QR / code salon: scanned (attendance QR only) or typed.
    const proof = async () => {
      if (method === "pin") {
        const v = val("wf-pin").replace(/[\u0660-\u0669]/g, d => String(d.charCodeAt(0) - 0x660)).replace(/\D/g, "");
        if (v.length !== 6) throw new Error(Lang.t("أدخل رمز الحضور المكوّن من 6 أرقام"));
        return v;
      }
      const scanned = await scanAttendance();
      if (!scanned) return null;
      if (!/^salonieer-attendance:v1:/i.test(scanned)) throw new Error(Lang.t("هذا ليس رمز حضور. امسح رمز الحضور الظاهر على شاشة العمل"));
      return scanned;
    };
    if (field("wf-in")) field("wf-in").onclick = async () => {
      UI.busy("wf-in", true); field("wf-err").textContent = "";
      if (method !== "gps") {
        let code; try { code = await proof(); } catch (e) { showError("wf-err", e); UI.busy("wf-in", false); return; }
        UI.busy("wf-in", false); if (!code) return;
        return go("att_clock_in", { code }, "wf-in");
      }
      let p; try { p = await position(); } catch (e) { showError("wf-err", e); UI.busy("wf-in", false); return; }
      UI.busy("wf-in", false);
      go("att_clock_in", { lat: p.lat, lng: p.lng, accuracy: Math.round(p.accuracy || 0) }, "wf-in");
    };
    if (field("wf-out")) field("wf-out").onclick = async () => {
      if (method === "gps") return go("att_clock_out", {}, "wf-out");
      field("wf-err").textContent = "";
      let code; try { code = await proof(); } catch (e) { showError("wf-err", e); return; }
      if (code) go("att_clock_out", { code }, "wf-out");
    };
    if (field("wf-fallback")) field("wf-fallback").onclick = () => UI.confirm(Lang.t("يُسجَّل حضورك الآن بوقت الخادم ويُرسل للمدير للموافقة، ولا يُحتسب قبل موافقته."), () => go("att_clock_in", { fallback: true }, "wf-fallback"));
    if (field("wf-arrival")) field("wf-arrival").onclick = () => UI.confirm(Lang.t("لتذكيرك عند الوصول يطلب التطبيق الوصول إلى الموقع «دائماً». يستخدمه الجهاز فقط لمعرفة دخولك منطقة العمل، ولا يُرسل أي موقع إلى أي جهة. يمكنك إيقافه من إعدادات الجهاز في أي وقت."), async () => {
      const r = await arrival(st, true);
      // null: an app build from before 2.28 (no arrival reminder in it yet).
      UI.toast(!r ? "حدّث التطبيق لاستخدام تذكير الوصول" : r.background ? "سيصلك تذكير عند وصولك إلى العمل" : "لم يُسمح بالموقع في الخلفية؛ سجّل الحضور من التطبيق عند وصولك", r?.background ? "ok" : "err");
    });
  }
  // The attendance QR: native QR camera, or the browser camera, or typing.
  async function scanAttendance() {
    if (window.NativeBridge?.available()) {
      try { const v = String(await NativeBridge.request("scan") || "").trim(); if (v) return v; }
      catch (e) { if (/إلغاء|cancel|בוטל/i.test(e.message || "")) return null; }
    }
    return webScanner();
  }
  // Support Staff open it from their account (#/attendance).
  async function attendanceRoute() {
    UI.render(`${UI.header({ title: "الحضور والانصراف", back: "#/settings" })}<div class="content narrow"><div id="wf-att">${UI.loading()}</div><div id="wf-leave"></div></div>`);
    await attendancePanel(field("wf-att"));
    // 2.33: every team member (Manager, Specialist, Other) asks for leave here too.
    if (window.Team && App.team?.member) Team.myRequests(field("wf-leave"));
  }
  // Is the signed-in account an employee here (for the account page row)?
  let meCache = { key: "", value: false, at: 0 };
  async function isEmployee() {
    if (!App.token || !Features.enabled("attendance")) return false;
    const key = Shop.slug() + ":" + App.token;
    if (meCache.key === key && Date.now() - meCache.at < 60000) return meCache.value;
    let value = false; try { value = !!(await rpc("att_status", { p_token: App.token }))?.employee; } catch {}
    meCache = { key, value, at: Date.now() };
    return value;
  }

  // ── Admin: Attendance ─────────────────────────────────────────────────
  const KIND = { specialist: ["مختص", "info"], support: ["موظف مساند", "muted"] };
  async function attendancePage(body, c) {
    currency = c.currency || "ILS";
    let tab = "today";
    body.innerHTML = `${UI.seg("at-tabs", [{ v: "today", l: Lang.t("اليوم") }, { v: "records", l: Lang.t("السجل") }, { v: "overtime", l: Lang.t("الوقت الإضافي") }, { v: "settings", l: Lang.t("الإعدادات") }], tab)}<div id="at-body">${UI.loading()}</div>`;
    UI.wireSeg("at-tabs", v => { tab = v; paint(); });
    // After adding attendance for another day, the record is shown where it lives.
    const saved = row => {
      if (row?.work_date && String(row.work_date).slice(0, 10) !== c.today) document.querySelector('#at-tabs [data-v="records"]')?.click();
      else paint();
    };
    const paint = async () => {
      const host = field("at-body"); if (!host) return; host.innerHTML = UI.loading();
      try {
        if (tab === "today") await attBoard(host, c, paint, saved);
        else if (tab === "records") await attRecords(host, c);
        else if (tab === "overtime") await attOvertime(host, c);
        else await attSettings(host);
      } catch (e) { host.innerHTML = `<div class="card">${E(e.message)}</div>`; }
    };
    await paint();
  }
  const shiftLine = s => `<span dir="ltr">${clock(s.clock_in_at)} – ${s.clock_out_at ? clock(s.clock_out_at) : "…"}</span>`;
  const shiftTags = s => `${pill(STATE, s.state)}${s.in_method === "fallback" ? ` <span class="badge muted">${E(Lang.t("بدون موقع"))}</span>` : ""}${s.in_method === "manager" ? ` <span class="badge muted">${E(Lang.t("أضافه المدير"))}</span>` : ""}${s.out_method === "auto" ? ` <span class="badge warn">${E(Lang.t("انصراف تلقائي"))}</span>` : ""}${s.early_departure ? ` <span class="badge warn">${E(Lang.t("انصراف مبكر"))}</span>` : ""}`;
  const shiftMinutes = s => s.clock_out_at ? `<small>${E(pick(`عادي ${hours(s.regular_minutes)}`, `regular ${hours(s.regular_minutes)}`, `רגיל ${hours(s.regular_minutes)}`))}${Number(s.overtime_minutes) ? " · " + E(pick(`إضافي ${hours(s.overtime_minutes)}`, `overtime ${hours(s.overtime_minutes)}`, `נוספות ${hours(s.overtime_minutes)}`)) : ""}${Number(s.unscheduled_minutes) ? " · " + E(pick(`خارج الجدول ${hours(s.unscheduled_minutes)} (لا يُحتسب)`, `outside the schedule ${hours(s.unscheduled_minutes)} (not counted)`, `מחוץ ללוח ${hours(s.unscheduled_minutes)} (לא נספר)`)) : ""}</small>` : "";
  async function attBoard(host, c, refresh, saved = refresh) {
    const r = await rpc("admin_att_board", { p_token: tok(), p_date: null });
    const s = r.settings || {};
    const inNow = r.employees.filter(e => e.in).length;
    host.innerHTML = `${!s.attendance_on ? `<p class="sub-warning">${E(Lang.t("تسجيل الحضور متوقف. اختر طريقة التحقق وفعّله من «الإعدادات»."))}</p>` : ""}
      ${s.attendance_on && ['qr','pin'].includes(s.verify_method) ? `<button class="btn wf-display-btn" id="at-display">${UI.icon("qr", 18)} ${E(Lang.t("شاشة الحضور"))}</button><p class="tiny">${E(Lang.t("اعرض شاشة الحضور على جهاز في العمل ليمسح الموظفون الرمز أو يكتبوه."))}</p>` : ""}
      <div class="biz-kpis small"><article class="biz-kpi"><span>${E(Lang.t("في الدوام الآن"))}</span><strong>${num(inNow)}</strong><small>${E(pick(`من ${num(r.employees.length)} موظف`, `of ${num(r.employees.length)} employees`, `מתוך ${num(r.employees.length)} עובדים`))}</small></article>
        <article class="biz-kpi"><span>${E(Lang.t("تحتاج قراراً"))}</span><strong>${num(r.attention.length)}</strong></article></div>
      ${r.attention.length ? `<section class="biz-panel"><div class="biz-panel-head"><h3>${E(Lang.t("بانتظار قرارك"))}</h3></div><div class="biz-rows">${r.attention.map(x => `<div class="biz-row"><div class="biz-row-time"><b>${E(day(x.work_date))}</b></div>
          <div class="biz-row-main"><b data-i18n-skip>${E(x.employee_name)}</b><small>${shiftLine(x)}</small><div class="biz-row-tags">${shiftTags(x)}</div>${x.note ? `<small data-i18n-skip>${E(x.note)}</small>` : ""}</div>
          <div class="biz-row-side biz-inline">${x.state === "pending" ? `<button class="btn sm" data-review="approve" data-id="${E(x.id)}">${E(Lang.t("موافقة"))}</button>` : `<button class="btn sm" data-review="confirm" data-id="${E(x.id)}">${E(Lang.t("تأكيد"))}</button>`}
            <button class="btn line sm" data-review="correct" data-id="${E(x.id)}">${E(Lang.t("تصحيح"))}</button><button class="btn line sm" data-review="reject" data-id="${E(x.id)}">${E(Lang.t("رفض"))}</button></div></div>`).join("")}</div></section>` : ""}
      <section class="biz-panel"><div class="biz-panel-head"><h3>${E(Lang.t("الموظفون اليوم"))}</h3></div>
        ${r.employees.length ? `<div class="biz-rows">${r.employees.map(e => `<div class="biz-row"><div class="biz-row-time"><span class="wf-dot ${e.in ? "in" : ""}"></span></div>
          <div class="biz-row-main"><b data-i18n-skip>${E(e.name)}</b><small>${pill(KIND, e.kind)}${e.title ? ` · <span data-i18n-skip>${E(e.title)}</span>` : ""}${!e.has_account ? ` · ${E(Lang.t("بدون حساب للتسجيل"))}` : ""}</small>
            ${e.shifts.map(sh => `<div class="wf-shift">${shiftLine(sh)} ${shiftTags(sh)} ${shiftMinutes(sh)}</div>`).join("")}
            ${Number(e.overtime) ? `<small>${E(pick(`وقت إضافي مسموح اليوم: ${hours(e.overtime)}`, `Overtime allowed today: ${hours(e.overtime)}`, `שעות נוספות מאושרות היום: ${hours(e.overtime)}`))}</small>` : ""}</div>
          <div class="biz-row-side biz-inline"><button class="btn line sm" data-add-shift="${E(e.id)}" data-name="${E(e.name)}">${E(Lang.t("إضافة حضور"))}</button><button class="btn line sm" data-ot="${E(e.id)}">${E(Lang.t("وقت إضافي"))}</button></div></div>`).join("")}</div>`
          : UI.empty(Lang.t("لا يوجد موظفون"), Lang.t("أضف المختصين من «الفريق» والموظفين المساندين من «أرباح الموظفين»."))}</section>`;
    const rows = r.attention.concat(...r.employees.map(e => e.shifts));
    host.querySelectorAll("[data-review]").forEach(b => b.onclick = () => reviewShift(rows.find(x => x.id === b.dataset.id), b.dataset.review, refresh));
    host.querySelectorAll("[data-add-shift]").forEach(b => b.onclick = () => addShiftModal({ id: b.dataset.addShift, name: b.dataset.name, kind: r.employees.find(e => e.id === b.dataset.addShift)?.kind }, saved));
    host.querySelectorAll("[data-ot]").forEach(b => b.onclick = () => overtimeModal(r.employees, b.dataset.ot, c.today, refresh));
    field("at-display")?.addEventListener("click", attendanceDisplay);
  }
  // 2.30 attendance display: the rotating attendance QR and code, refreshed
  // from the server as each one expires. It is not the salon's customer QR.
  function attendanceDisplay() {
    const layer = document.createElement("div");
    layer.className = "wf-att-display";
    layer.setAttribute("role", "dialog"); layer.setAttribute("aria-modal", "true");
    layer.innerHTML = `<div class="wf-att-card"><div class="mhead"><h3>${E(Lang.t("شاشة الحضور"))}</h3><button class="iconbtn" id="ad-x" aria-label="${E(Lang.t("إغلاق"))}">${UI.icon("x", 22)}</button></div>
      <div class="wf-att-qr" id="ad-qr"></div><div class="wf-att-code" id="ad-code" dir="ltr" data-i18n-skip>······</div>
      <div class="wf-att-bar"><i id="ad-bar"></i></div><p class="tiny" id="ad-note">${E(Lang.t("امسح الرمز من التطبيق: حسابي ← الحضور والانصراف."))}</p>${errorBox("ad-err")}</div>`;
    document.body.appendChild(layer);
    let timer = 0, tick = 0, alive = true, ends = 0, period = 30;
    const close = () => { alive = false; clearTimeout(timer); clearInterval(tick); layer.remove(); };
    layer.querySelector("#ad-x").onclick = close;
    const draw = async () => {
      if (!alive || !layer.isConnected) return close();
      try {
        const r = await rpc("admin_att_code", { p_token: tok() });
        if (!alive) return;
        period = Number(r.period) || 30; ends = Date.now() + Math.max(1, Number(r.expires_in) || period) * 1000;
        layer.querySelector("#ad-code").textContent = r.code.replace(/(\d{3})(\d{3})/, "$1 $2");
        layer.querySelector("#ad-qr").innerHTML = r.method === "qr" && window.SalonQR ? SalonQR.svg(r.qr) : "";
        layer.querySelector("#ad-err").textContent = "";
        timer = setTimeout(draw, Math.max(1000, ends - Date.now() + 300));
      } catch (e) { showError("ad-err", e); timer = setTimeout(draw, 5000); }
    };
    tick = setInterval(() => { const bar = layer.querySelector("#ad-bar"); if (bar && ends) bar.style.width = Math.max(0, Math.min(100, (ends - Date.now()) / (period * 10))) + "%"; }, 250);
    draw();
  }
  const timeOf = d => d ? new Date(d).toTimeString().slice(0, 5) : "";
  const dateOf = d => d ? iso(new Date(d)) : "";
  function reviewShift(s, action, refresh) {
    if (!s) return;
    if (action === "approve" || action === "confirm") {
      return UI.confirm(Lang.t(action === "approve" ? "الموافقة على هذا الحضور؟ يُحتسب الوقت المسجل." : "تأكيد الوقت المسجل كما هو؟"), async () => {
        try { await rpc("admin_att_review", { p_token: tok(), p_shift: s.id, p_action: action, p_data: {} }); UI.toast("تم الحفظ", "ok"); await refresh(); } catch (e) { UI.toast(e.message, "err"); }
      });
    }
    UI.modal(`<div class="mhead"><h3>${E(Lang.t(action === "reject" ? "رفض الحضور" : "تصحيح الحضور"))}</h3><button class="iconbtn" id="rv-x" aria-label="${E(Lang.t("إغلاق"))}">${UI.icon("x", 20)}</button></div>
      <form class="mform" id="rv-form"><p class="muted" data-i18n-skip>${E(s.employee_name)} · ${E(day(s.work_date))}</p>
        ${action === "correct" ? `<div class="control-form"><label>${E(Lang.t("الحضور"))}<input class="input" type="date" id="rv-in-d" value="${E(dateOf(s.clock_in_at))}"><input class="input" type="time" id="rv-in-t" value="${E(timeOf(s.clock_in_at))}"></label>
          <label>${E(Lang.t("الانصراف"))}<input class="input" type="date" id="rv-out-d" value="${E(dateOf(s.clock_out_at || s.clock_in_at))}"><input class="input" type="time" id="rv-out-t" value="${E(timeOf(s.clock_out_at))}"></label>
          <label>${E(Lang.t("استراحة غير مدفوعة (دقائق)"))}<input class="input" type="number" min="0" max="1440" step="5" id="rv-break" value="${Number(s.break_minutes) || 0}"></label></div>
          <label class="notification-toggle"><span>${E(Lang.t("احتساب كل الوقت (بما فيه خارج الجدول)"))}</span><input type="checkbox" id="rv-all" ${s.count_all ? "checked" : ""}></label>` : ""}
        <div class="field"><label for="rv-reason">${E(Lang.t("السبب"))}</label><input class="input" id="rv-reason" maxlength="300" required minlength="3"></div>
        <button class="btn ${action === "reject" ? "danger" : ""}" type="submit" id="rv-go">${E(Lang.t("حفظ"))}</button>${errorBox("rv-err")}</form>`);
    field("rv-x").onclick = UI.closeModal;
    field("rv-form").onsubmit = async e => {
      e.preventDefault(); UI.busy("rv-go", true);
      const data = { reason: val("rv-reason") };
      if (action === "correct") Object.assign(data, { clock_in_at: instant(val("rv-in-d"), val("rv-in-t")), clock_out_at: instant(val("rv-out-d"), val("rv-out-t")), break_minutes: Number(val("rv-break")) || 0, count_all: field("rv-all").checked });
      try { await rpc("admin_att_review", { p_token: tok(), p_shift: s.id, p_action: action, p_data: data }); UI.closeModal(); UI.toast("تم الحفظ", "ok"); await refresh(); }
      catch (err) { showError("rv-err", err); UI.busy("rv-go", false); }
    };
  }
  // 2.31: manual attendance for a shift that was not recorded in the app. One
  // work date, the clock-in and clock-out times side by side (a clock-out
  // earlier than the clock-in ends the next morning), the unpaid break and the
  // reason, with a live summary of what will be counted. Validation is done
  // here with written messages: the browser's own checks fail silently inside
  // the app's WebView, which is what made Save look like it did nothing.
  function addShiftModal(emp, onSaved) {
    const key = requestKey(), today = iso(new Date());
    const REASONS = ["نسي تسجيل الحضور", "نسي تسجيل الانصراف", "مشكلة في الهاتف أو الإنترنت"];
    UI.modal(`<div class="mhead"><h3>${E(Lang.t("إضافة حضور يدوياً"))}</h3><button class="iconbtn" type="button" id="as-x" aria-label="${E(Lang.t("إغلاق"))}">${UI.icon("x", 20)}</button></div>
      <form class="mform att-form" id="as-form" novalidate>
        <div class="att-who"><span class="att-avatar" aria-hidden="true">${E((emp.name || "؟").trim().charAt(0))}</span><div><b data-i18n-skip>${E(emp.name)}</b>${emp.kind ? `<small>${E(Lang.t(KIND[emp.kind]?.[0] || ""))}</small>` : ""}</div></div>
        <p class="att-intro">${E(Lang.t("استخدم هذه النافذة عندما ينسى الموظف تسجيل حضوره أو انصرافه من التطبيق. تُحتسب الساعات في أجره، ويُحفظ السبب في سجل العمليات."))}</p>
        <div class="field"><label for="as-date">${E(Lang.t("يوم العمل"))}</label><input class="input" type="date" id="as-date" value="${today}" max="${today}"></div>
        <div class="att-times">
          <div class="field"><label for="as-in">${E(Lang.t("وقت الحضور"))}</label><small class="field-hint">${E(Lang.t("متى بدأ العمل"))}</small><input class="input" type="time" id="as-in" dir="ltr"></div>
          <div class="field"><label for="as-out">${E(Lang.t("وقت الانصراف"))}</label><small class="field-hint">${E(Lang.t("متى انتهى العمل"))}</small><input class="input" type="time" id="as-out" dir="ltr"></div>
        </div>
        <div class="field"><label for="as-break">${E(Lang.t("استراحة غير مدفوعة"))}</label><small class="field-hint">${E(Lang.t("دقائق لا يُدفع عنها، مثل استراحة الغداء. اتركها 0 إن لم توجد."))}</small>
          <div class="att-suffix"><input class="input" type="number" inputmode="numeric" min="0" max="720" id="as-break" value="0" dir="ltr"><span>${E(Lang.t("دقيقة"))}</span></div></div>
        <div class="att-summary" id="as-sum" aria-live="polite"></div>
        <div class="field"><label for="as-reason">${E(Lang.t("سبب الإضافة"))}</label><small class="field-hint">${E(Lang.t("مطلوب، ويظهر في سجل العمليات."))}</small>
          <textarea class="textarea" id="as-reason" rows="2" maxlength="300"></textarea>
          <div class="chips att-reasons">${REASONS.map(x => `<button type="button" class="chip" data-reason="${E(x)}">${E(Lang.t(x))}</button>`).join("")}</div></div>
        ${errorBox("as-err")}
        <div class="modal-actions"><button type="button" class="btn line" id="as-cancel">${E(Lang.t("إلغاء"))}</button><button class="btn" type="submit" id="as-go">${UI.icon("check", 18)} ${E(Lang.t("حفظ الحضور"))}</button></div>
      </form>`);
    field("as-x").onclick = field("as-cancel").onclick = UI.closeModal;
    const minutesOf = t => { const m = /^(\d{1,2}):(\d{2})/.exec(t || ""); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
    // The entered shift: start and end instants (the end moves to the next day
    // when it is earlier than the start), its length and the paid part.
    const read = () => {
      const date = val("as-date"), a = minutesOf(val("as-in")), b = minutesOf(val("as-out"));
      const brk = Math.max(0, Math.round(Number(val("as-break")) || 0));
      if (!date || a == null || b == null) return { date, brk, complete: false };
      const overnight = b <= a;
      const total = (overnight ? b + 1440 : b) - a;
      const outDate = overnight ? addDays(date, 1) : date;
      return { date, brk, complete: true, overnight, total, paid: Math.max(total - brk, 0), inAt: instant(date, val("as-in")), outAt: instant(outDate, val("as-out")) };
    };
    const summary = () => {
      const s = read(), box = field("as-sum"); if (!box) return;
      if (!s.complete) { box.innerHTML = `<span class="att-sum-muted">${E(Lang.t("اكتب وقت الحضور ووقت الانصراف لترى المدة المحتسبة."))}</span>`; return; }
      box.innerHTML = `<div class="att-sum-row"><span>${E(Lang.t("مدة العمل"))}</span><b>${E(hours(s.total))}</b></div>
        ${s.brk ? `<div class="att-sum-row"><span>${E(Lang.t("الاستراحة غير المدفوعة"))}</span><b>− ${E(hours(s.brk))}</b></div>` : ""}
        <div class="att-sum-row strong"><span>${E(Lang.t("الوقت المدفوع"))}</span><b>${E(hours(s.paid))}</b></div>
        ${s.overnight ? `<p class="att-sum-note">${E(Lang.t("ينتهي الدوام في صباح اليوم التالي."))}</p>` : ""}
        <p class="att-sum-note">${E(Lang.t("الوقت خارج جدول الموظف يظهر منفصلاً ولا يُدفع إلا إذا وافقت عليه."))}</p>`;
    };
    ["as-date", "as-in", "as-out", "as-break"].forEach(id => field(id).addEventListener("input", summary));
    field("as-form").querySelectorAll("[data-reason]").forEach(b => b.onclick = () => { field("as-reason").value = Lang.t(b.dataset.reason); field("as-err").textContent = ""; });
    summary();
    const problem = (msg, id) => {
      const box = field("as-err"); box.textContent = Lang.t(msg);
      box.scrollIntoView({ block: "nearest", behavior: "smooth" });
      if (id) field(id)?.focus({ preventScroll: true });
    };
    field("as-form").onsubmit = async e => {
      e.preventDefault(); field("as-err").textContent = "";
      const s = read();
      if (!s.date) return problem("اختر يوم العمل.", "as-date");
      if (s.date > today) return problem("لا يمكن إضافة حضور ليوم لم يأتِ بعد.", "as-date");
      if (!s.complete) return problem("اكتب وقت الحضور ووقت الانصراف.", minutesOf(val("as-in")) == null ? "as-in" : "as-out");
      if (!s.inAt || !s.outAt) return problem("الوقت غير مفهوم. اختر الساعة والدقائق من جديد.", "as-in");
      if (s.total < 1) return problem("وقت الانصراف يجب أن يكون بعد وقت الحضور.", "as-out");
      if (new Date(s.outAt).getTime() > Date.now() + 5 * 60000) return problem("وقت الانصراف لم يأتِ بعد. إذا كان الموظف ما زال في العمل، أضف الحضور بعد انتهاء دوامه.", "as-out");
      if (s.brk >= s.total) return problem("الاستراحة أطول من مدة العمل.", "as-break");
      if (val("as-reason").length < 3) return problem("اكتب سبب الإضافة (3 أحرف على الأقل).", "as-reason");
      UI.busy("as-go", true);
      try {
        const row = await rpc("admin_att_add_shift", { p_token: tok(), p_employee: emp.id, p_data: { clock_in_at: s.inAt, clock_out_at: s.outAt, break_minutes: s.brk, reason: val("as-reason") }, p_request_key: key });
        UI.closeModal();
        UI.toast(s.date === today ? Lang.t("تم حفظ الحضور") : pick(`تم حفظ الحضور ليوم ${day(s.date)}`, `Attendance saved for ${day(s.date)}`, `הנוכחות נשמרה ליום ${day(s.date)}`), "ok");
        await onSaved(row);
      } catch (err) { UI.busy("as-go", false); problem(err?.message || String(err)); }
    };
  }
  function overtimeModal(employees, selected, today, refresh) {
    UI.modal(`<div class="mhead"><h3>${E(Lang.t("وقت إضافي"))}</h3><button class="iconbtn" id="ot-x" aria-label="${E(Lang.t("إغلاق"))}">${UI.icon("x", 20)}</button></div>
      <form class="mform" id="ot-form"><p class="tiny">${E(Lang.t("يمدّد نهاية دوام موظف واحد في يوم واحد فقط، ولا يغيّر ساعات عمل العمل. يُدفع الوقت الذي عُمل فعلاً فقط."))}</p>
        <div class="control-form"><label>${E(Lang.t("الموظف"))}<select class="select" id="ot-emp">${employees.map(e => `<option value="${E(e.id)}" ${e.id === selected ? "selected" : ""}>${E(e.name)}</option>`).join("")}</select></label>
          <label>${E(Lang.t("التاريخ"))}<input class="input" type="date" id="ot-date" value="${E(today)}"></label>
          <label>${E(Lang.t("الوقت الإضافي (دقائق)"))}<input class="input" type="number" min="15" max="720" step="15" id="ot-min" value="60" required></label>
          <label class="full">${E(Lang.t("السبب"))}<input class="input" id="ot-reason" maxlength="300"></label></div>
        <button class="btn" type="submit" id="ot-go">${E(Lang.t("حفظ"))}</button>${errorBox("ot-err")}</form>`);
    field("ot-x").onclick = UI.closeModal;
    field("ot-form").onsubmit = async e => {
      e.preventDefault(); UI.busy("ot-go", true);
      try { await rpc("admin_att_save_overtime", { p_token: tok(), p_employee: val("ot-emp"), p_date: val("ot-date"), p_minutes: Number(val("ot-min")), p_reason: val("ot-reason") }); UI.closeModal(); UI.toast("تم الحفظ", "ok"); await refresh(); }
      catch (err) { showError("ot-err", err); UI.busy("ot-go", false); }
    };
  }
  async function attRecords(host, c) {
    let from = addDays(c.today, -13), to = c.today, emp = "", page = 0; const PAGE = 20;
    const board = await rpc("admin_att_board", { p_token: tok(), p_date: null });
    host.innerHTML = `<div class="card biz-toolbar"><label class="biz-date">${E(Lang.t("من"))}<input class="input" type="date" id="ar-from" value="${from}"></label><label class="biz-date">${E(Lang.t("إلى"))}<input class="input" type="date" id="ar-to" value="${to}"></label>
      <select class="select" id="ar-emp"><option value="">${E(Lang.t("كل الموظفين"))}</option>${board.employees.map(e => `<option value="${E(e.id)}">${E(e.name)}</option>`).join("")}</select></div><div id="ar-list">${UI.loading()}</div>`;
    const load = async () => {
      const box = field("ar-list"); if (!box) return;
      const r = await rpc("admin_att_list_shifts", { p_token: tok(), p_employee: emp || null, p_from: from, p_to: to, p_limit: PAGE + 1, p_offset: page * PAGE });
      const more = r.items.length > PAGE, items = r.items.slice(0, PAGE);
      box.innerHTML = (items.length ? `<div class="biz-rows">${items.map(s => `<button class="biz-row clickable" data-shift="${E(s.id)}"><div class="biz-row-time"><b>${E(day(s.work_date))}</b></div>
          <div class="biz-row-main"><b data-i18n-skip>${E(s.employee_name)}</b><small>${shiftLine(s)}</small><div class="biz-row-tags">${shiftTags(s)}</div>${shiftMinutes(s)}</div><div class="biz-row-side">${UI.icon("pencil", 15)}</div></button>`).join("")}</div>`
        : UI.empty(Lang.t("لا يوجد حضور في هذه الفترة"), "")) + UI.pager(page, more);
      UI.wirePager(async () => { if (page > 0) { page--; await load(); } }, async () => { if (more) { page++; await load(); } }, box);
      box.querySelectorAll("[data-shift]").forEach(b => b.onclick = () => reviewShift(items.find(x => x.id === b.dataset.shift), "correct", load));
    };
    field("ar-from").onchange = e => { from = e.target.value || from; page = 0; load(); };
    field("ar-to").onchange = e => { to = e.target.value || to; page = 0; load(); };
    field("ar-emp").onchange = e => { emp = e.target.value; page = 0; load(); };
    await load();
  }
  async function attOvertime(host, c) {
    const [board, r] = await Promise.all([rpc("admin_att_board", { p_token: tok(), p_date: null }), rpc("admin_att_list_shifts", { p_token: tok(), p_employee: null, p_from: addDays(c.today, -30), p_to: c.today, p_limit: 1, p_offset: 0 })]);
    const refresh = () => attOvertime(host, c);
    host.innerHTML = `<button class="btn sm" id="ov-new" style="margin-bottom:12px">${UI.icon("plus", 16)} ${E(Lang.t("وقت إضافي"))}</button>
      ${r.overtime.length ? `<div class="biz-rows">${r.overtime.map(o => `<div class="biz-row"><div class="biz-row-time"><b>${E(day(o.work_date))}</b></div><div class="biz-row-main"><b data-i18n-skip>${E(o.employee_name)}</b><small>+${E(hours(o.extra_minutes))}${o.reason ? ` · <span data-i18n-skip>${E(o.reason)}</span>` : ""}</small></div>
        <div class="biz-row-side"><button class="iconbtn" data-cancel-ot="${E(o.id)}" aria-label="${E(Lang.t("إلغاء"))}">${UI.icon("trash", 15)}</button></div></div>`).join("")}</div>`
        : UI.empty(Lang.t("لا يوجد وقت إضافي مسموح"), Lang.t("اسمح لموظف بالعمل بعد نهاية دوامه في يوم محدد."))}`;
    field("ov-new").onclick = () => overtimeModal(board.employees, "", c.today, refresh);
    host.querySelectorAll("[data-cancel-ot]").forEach(b => b.onclick = () => UI.confirm(Lang.t("إلغاء هذا الوقت الإضافي؟"), async () => {
      try { await rpc("admin_att_cancel_overtime", { p_token: tok(), p_id: b.dataset.cancelOt, p_reason: "" }); UI.toast("تم الإلغاء", "ok"); await refresh(); } catch (e) { UI.toast(e.message, "err"); } }, true));
  }
  async function attSettings(host) {
    const s = await rpc("admin_att_settings", { p_token: tok() });
    const toggle = (id, label, on) => `<label class="notification-toggle"><span>${E(Lang.t(label))}</span><input type="checkbox" id="${id}" ${on ? "checked" : ""}></label>`;
    const method = s.verify_method || "gps";
    host.innerHTML = `<form class="card loy-form" id="as-set"><h3>${E(Lang.t("الحضور والانصراف"))}</h3>
      ${toggle("st-on", "تفعيل تسجيل الحضور", s.attendance_on)}
      <div class="sec-label">${E(Lang.t("طريقة التحقق من الحضور"))}</div>
      <div class="wf-methods" role="radiogroup" aria-label="${E(Lang.t("طريقة التحقق من الحضور"))}">
        ${[["gps", "pin", "الموقع (GPS)", "داخل نطاق العمل فقط"], ["qr", "qr", "رمز QR", "يمسح الموظف رمزاً متغيراً يظهر على شاشة العمل"], ["pin", "lock", "رمز الحضور (PIN)", "يكتب الموظف رمزاً متغيراً من 6 أرقام يظهر على شاشة العمل"]].map(([v, ic, l, d]) => `<label class="wf-method ${method === v ? "on" : ""}"><input type="radio" name="st-method" value="${v}" ${method === v ? "checked" : ""}>${UI.icon(ic, 18)}<span><b>${E(Lang.t(l))}</b><small>${E(Lang.t(d))}</small></span></label>`).join("")}
      </div>
      <div class="wf-code-opts" id="st-code-opts" ${method === "gps" ? "hidden" : ""}>
        <div class="control-form"><label>${E(Lang.t("يتغير الرمز كل"))}<select class="select" id="st-period">${[[30, "30 ثانية"], [60, "دقيقة واحدة"], [120, "دقيقتان"]].map(([n, l]) => `<option value="${n}" ${Number(s.code_period || 30) === n ? "selected" : ""}>${E(Lang.t(l))}</option>`).join("")}</select></label></div>
        ${toggle("st-reset", "إصدار رموز جديدة الآن (تتوقف الرموز السابقة)", false)}
        <p class="tiny">${E(Lang.t("رمز الحضور منفصل عن رمز QR الخاص بالعملاء، ولا يُستخدم لفتح العمل."))}</p>
      </div>
      <div class="sec-label" id="st-loc-label">${E(Lang.t("موقع العمل"))}</div>
      <div class="control-form"><label>${E(Lang.t("خط العرض"))}<input class="input" id="st-lat" dir="ltr" inputmode="decimal" value="${E(s.salon_lat ?? "")}"></label>
        <label>${E(Lang.t("خط الطول"))}<input class="input" id="st-lng" dir="ltr" inputmode="decimal" value="${E(s.salon_lng ?? "")}"></label>
        <label>${E(Lang.t("نطاق العمل (متر)"))}<input class="input" type="number" min="30" max="2000" step="10" id="st-radius" value="${Number(s.radius_m) || 150}"></label>
        <label>${E(Lang.t("أقل دقة مقبولة للموقع (متر)"))}<input class="input" type="number" min="10" max="1000" step="10" id="st-acc" value="${Number(s.max_accuracy_m) || 150}"></label></div>
      <button type="button" class="btn line sm" id="st-here">${UI.icon("pin", 15)} ${E(Lang.t("استخدم موقعي الحالي (وأنا في العمل)"))}</button>
      <div class="sec-label">${E(Lang.t("الانصراف"))}</div>
      ${toggle("st-auto", "انصراف تلقائي عند نهاية الدوام (يُعلَّم للمراجعة)", s.auto_clock_out)}
      <div class="control-form"><label>${E(Lang.t("ساعة إغلاق العمل (لمن لا جدول له)"))}<input class="input" type="time" id="st-close" value="${E(String(s.closing_time || "21:00").slice(0, 5))}"></label>
        <label>${E(Lang.t("تنبيه الانصراف المبكر قبل النهاية بأكثر من (دقائق)"))}<input class="input" type="number" min="0" max="240" step="5" id="st-early" value="${Number(s.early_minutes) || 0}"></label></div>
      ${toggle("st-breaks", "خصم الاستراحات المجدولة من وقت العمل", s.deduct_breaks)}
      ${toggle("st-fallback", "السماح بالتسجيل بدون موقع بموافقة المدير", s.allow_fallback)}
      ${toggle("st-notify", "إشعاري عند تسجيل حضور موظف", s.notify_clock_in)}
      <p class="tiny">${E(Lang.t("لا يُتتبع الموظفون: يُفحص الموقع مرة واحدة عند تسجيل الحضور، ويُستخدم وقت الخادم دائماً."))}</p>
      <button class="btn" type="submit" id="st-save">${E(Lang.t("حفظ"))}</button>${errorBox("st-err")}</form>`;
    document.querySelectorAll('input[name="st-method"]').forEach(r => r.onchange = () => {
      document.querySelectorAll(".wf-method").forEach(x => x.classList.toggle("on", x.querySelector("input").checked));
      field("st-code-opts").hidden = r.value === "gps" && r.checked;
    });
    field("st-here").onclick = async () => {
      UI.busy("st-here", true);
      try { const p = await position(); field("st-lat").value = Number(p.lat).toFixed(6); field("st-lng").value = Number(p.lng).toFixed(6); UI.toast(pick(`دقة الموقع ${Math.round(p.accuracy || 0)} م`, `Accuracy ${Math.round(p.accuracy || 0)} m`, `דיוק ${Math.round(p.accuracy || 0)} מ׳`), "ok"); }
      catch (e) { showError("st-err", e); } finally { UI.busy("st-here", false); }
    };
    field("as-set").onsubmit = async e => {
      e.preventDefault(); UI.busy("st-save", true);
      try {
        const methodNow = document.querySelector('input[name="st-method"]:checked')?.value || "gps";
        await rpc("admin_att_save_settings", { p_token: tok(), p_data: { attendance_on: field("st-on").checked, verify_method: methodNow, code_period: Number(val("st-period")) || 30, reset_codes: !!field("st-reset")?.checked, salon_lat: val("st-lat"), salon_lng: val("st-lng"),
          radius_m: Number(val("st-radius")), max_accuracy_m: Number(val("st-acc")), auto_clock_out: field("st-auto").checked, closing_time: val("st-close"),
          early_minutes: Number(val("st-early")), deduct_breaks: field("st-breaks").checked, allow_fallback: field("st-fallback").checked, notify_clock_in: field("st-notify").checked } });
        UI.toast("تم الحفظ", "ok"); UI.busy("st-save", false);
      } catch (err) { showError("st-err", err); UI.busy("st-save", false); }
    };
  }

  // ── Admin: Employee Earnings ──────────────────────────────────────────
  const METHOD = {
    salary: "راتب ثابت", commission: "عمولة", salary_commission: "راتب + عمولة", hourly: "أجر بالساعة",
    hourly_commission: "أجر بالساعة + عمولة", chair_rental: "إيجار كرسي", none: "بدون أجر محدد",
  };
  const methodLabel = c => {
    if (!c) return Lang.t("لم يُحدد الأجر بعد");
    const base = Lang.t(METHOD[c.method] || c.method);
    if (c.method === "commission") return Lang.t(c.commission_kind === "fixed" ? "عمولة ثابتة لكل خدمة" : "نسبة من الخدمات");
    return base;
  };
  const PERIOD = { week: "أسبوعياً", month: "شهرياً" };
  async function earningsPage(body, c) {
    currency = c.currency || "ILS";
    let period = "month", from = null, to = null;
    const range = () => {
      const t = c.today;
      if (period === "week") return [addDays(t, -6), t];
      if (period === "month") return [t.slice(0, 8) + "01", t];
      if (period === "last") { const d = new Date(t.slice(0, 8) + "01T12:00:00"); d.setDate(0); return [iso(d).slice(0, 8) + "01", iso(d)]; }
      return [from || addDays(t, -29), to || t];
    };
    body.innerHTML = `<div class="biz-head biz-head-actions"><button class="btn sm" id="er-add">${UI.icon("plus", 15)} ${E(Lang.t("إضافة عضو إلى الفريق"))}</button></div>
      <div class="card biz-toolbar">${UI.seg("er-period", [{ v: "week", l: Lang.t("الأسبوع") }, { v: "month", l: Lang.t("الشهر") }, { v: "last", l: Lang.t("الشهر الماضي") }, { v: "custom", l: Lang.t("فترة مخصصة") }], period)}
        <div class="biz-range" id="er-range" hidden><label>${E(Lang.t("من"))}<input class="input" type="date" id="er-from"></label><label>${E(Lang.t("إلى"))}<input class="input" type="date" id="er-to"></label><button class="btn sm" id="er-apply">${E(Lang.t("عرض"))}</button></div></div>
      <div id="er-body">${UI.loading()}</div>`;
    UI.wireSeg("er-period", v => { period = v; field("er-range").hidden = v !== "custom"; if (v !== "custom") paint(); });
    field("er-apply").onclick = () => { from = val("er-from") || null; to = val("er-to") || null; paint(); };
    // 2.33: team members join by invitation from the Team page (no salon-made accounts).
    field("er-add").onclick = () => Router.go((window.Control?.target() ? "#/platform/salon/" + Control.target().slug : "#/admin") + "/barbers");
    const paint = async () => {
      const host = field("er-body"); if (!host) return; host.innerHTML = UI.loading();
      const [f, t] = range();
      let r; try { r = await rpc("admin_emp_report", { p_token: tok(), p_from: f, p_to: t }); } catch (e) { host.innerHTML = `<div class="card">${E(e.message)}</div>`; return; }
      const T = r.totals;
      host.innerHTML = `<p class="tiny biz-period">${E(day(r.from))} – ${E(day(r.to))}</p>
        <div class="biz-kpis"><article class="biz-kpi"><span>${E(Lang.t("المستحق عن الفترة"))}</span><strong>${E(money(T.payable))}</strong><small>${E(Lang.t("رواتب وأجور وعمولات وتعديلات"))}</small></article>
          <article class="biz-kpi"><span>${E(Lang.t("المدفوع في الفترة"))}</span><strong>${E(money(T.paid))}</strong></article>
          <article class="biz-kpi"><span>${E(Lang.t("الرصيد المستحق للموظفين"))}</span><strong>${E(money(T.outstanding))}</strong><small>${E(Lang.t("حتى نهاية الفترة"))}</small></article>
          <article class="biz-kpi"><span>${E(Lang.t("الوقت الإضافي"))}</span><strong>${E(money(T.overtime))}</strong><small>${E(hours(T.overtime_minutes))}</small></article>
          ${Number(T.rent_due) || Number(T.received) ? `<article class="biz-kpi"><span>${E(Lang.t("إيجار الكراسي"))}</span><strong>${E(money(T.rent_due))}</strong><small>${E(pick(`المستلم ${money(T.received)} · المتبقي ${money(T.rent_outstanding)}`, `received ${money(T.received)} · owed ${money(T.rent_outstanding)}`, `התקבל ${money(T.received)} · יתרה ${money(T.rent_outstanding)}`))}</small></article>` : ""}</div>
        ${r.employees.length ? `<div class="biz-rows">${r.employees.map(x => {
          const renter = x.method === "chair_rental", P = x.period, B = x.balance;
          return `<button class="biz-row clickable" data-emp="${E(x.id)}"><div class="biz-row-time"><span class="wf-avatar">${E((x.name || "?").trim().charAt(0))}</span></div>
            <div class="biz-row-main"><b data-i18n-skip>${E(x.name)}</b><small>${E(methodLabel(x.compensation))}${x.title ? ` · <span data-i18n-skip>${E(x.title)}</span>` : ""}</small>
              <div class="biz-row-tags">${renter ? `<span class="badge info">${E(Lang.t("مستأجر كرسي"))}</span>` : pill(KIND, x.kind)}${x.is_active ? "" : ` <span class="badge muted">${E(Lang.t("غير نشط"))}</span>`}${Number(P.pending?.minutes) || Number(P.pending?.visits) ? ` <span class="badge warn">${E(Lang.t("يوجد ما ينتظر المراجعة"))}</span>` : ""}</div></div>
            <div class="biz-row-side"><strong>${E(money(renter ? P.rent_due : P.payable))}</strong><small>${E(renter ? pick(`عليه ${money(B.rent_outstanding)}`, `owes ${money(B.rent_outstanding)}`, `חייב ${money(B.rent_outstanding)}`) : pick(`المتبقي له ${money(B.outstanding)}`, `owed ${money(B.outstanding)}`, `יתרה ${money(B.outstanding)}`))}</small>${UI.icon("chev", 16)}</div></button>`;
        }).join("")}</div>` : UI.empty(Lang.t("لا يوجد موظفون"), "")}
        <p class="tiny biz-note">${UI.icon("info", 14)} ${E(Lang.t("حساب داخلي لأجور الفريق ودفعاته وليس نظام رواتب أو ضرائب رسمياً. «المستحق» يشمل فقط ما هو نهائي: الراتب حتى تاريخه، والوقت المعتمد، والعمولات من الفواتير. ما ينتظر المراجعة يظهر منفصلاً."))}</p>`;
      host.querySelectorAll("[data-emp]").forEach(b => b.onclick = () => employeeModal(b.dataset.emp, f, t, paint, r.services));
    };
    await paint();
  }

  async function employeeModal(id, f, t, refresh, services) {
    let d; try { d = await rpc("admin_emp_detail", { p_token: tok(), p_employee: id, p_from: f, p_to: t }); } catch (e) { UI.toast(e.message, "err"); return; }
    let tab = "summary";
    const renter = d.method === "chair_rental", support = d.kind === "support";
    UI.modal(`<div class="biz-sheet wf-emp"><div class="mhead"><h3 data-i18n-skip>${E(d.name)}</h3><button class="iconbtn" id="em-x" aria-label="${E(Lang.t("إغلاق"))}">${UI.icon("x", 20)}</button></div>
      <p class="tiny">${pill(KIND, d.kind)} · ${E(methodLabel(d.compensation))} · ${E(day(d.from))} – ${E(day(d.to))}</p>
      ${UI.seg("em-tabs", [{ v: "summary", l: Lang.t("الملخص") }, { v: "pay", l: Lang.t("الأجر") }, { v: "money", l: Lang.t("الدفعات") }].concat(support ? [{ v: "profile", l: Lang.t("البيانات") }] : []), tab)}
      <div id="em-body"></div></div>`);
    field("em-x").onclick = () => { UI.closeModal(); refresh(); };
    const again = async () => { UI.closeModal(); await employeeModal(id, f, t, refresh, services); };
    UI.wireSeg("em-tabs", v => { tab = v; paint(); });
    const paint = () => {
      const host = field("em-body"); if (!host) return;
      const P = d.period, B = d.balance;
      if (tab === "summary") {
        const line = (label, value, sub = "", cls = "") => `<div class="biz-total-row ${cls}"><span>${E(Lang.t(label))}${sub ? `<small>${E(sub)}</small>` : ""}</span><b>${value}</b></div>`;
        host.innerHTML = `<div class="biz-total-card">
            ${Number(P.salary) ? line("الراتب حتى تاريخه", E(money(P.salary))) : ""}
            ${Number(P.wages) || ["hourly", "hourly_commission"].includes(d.method) ? line("أجر الساعات العادية", E(money(P.wages)), hours(P.regular_minutes)) : ""}
            ${Number(P.overtime_minutes) || Number(P.overtime) ? line("الوقت الإضافي", E(money(P.overtime)), hours(P.overtime_minutes)) : ""}
            ${d.barber_id ? line("العمولات", E(money(P.commissions)), P.commission_source === "checkout" ? Lang.t("من الفواتير") : Lang.t("من الخدمات المكتملة بالسعر المسجل")) : ""}
            ${Number(P.adjustments) ? line("مكافآت وخصومات", E(money(P.adjustments))) : ""}
            ${line("المستحق عن الفترة", E(money(P.payable)), "", "strong")}
            ${line("المدفوع في الفترة", E(money(P.paid)))}
            ${line("الرصيد المستحق حتى نهاية الفترة", E(money(B.outstanding)), "", Number(B.outstanding) > 0 ? "warn" : "")}
            ${renter || Number(P.rent_due) ? line("إيجار الكرسي المستحق على المختص", E(money(P.rent_due))) + line("المستلم منه", E(money(P.received))) + line("المتبقي عليه", E(money(B.rent_outstanding)), "", "warn") : ""}</div>
          ${Number(P.pending?.minutes) || Number(P.pending?.visits) ? `<p class="sub-warning">${E(pick(`بانتظار المراجعة (غير محتسب): ${hours(P.pending.minutes)} من الحضور، ${num(P.pending.visits)} زيارة مكتملة بدون فاتورة (عمولة تقديرية ${money(P.pending.commission)}).`,
              `Waiting (not counted): ${hours(P.pending.minutes)} of attendance, ${num(P.pending.visits)} completed visits without a receipt (estimated commission ${money(P.pending.commission)}).`,
              `ממתין (לא נספר): ${hours(P.pending.minutes)} נוכחות, ${num(P.pending.visits)} ביקורים ללא קבלה (עמלה משוערת ${money(P.pending.commission)}).`))}</p>` : ""}
          ${Number(P.unscheduled_minutes) ? `<p class="tiny">${E(pick(`وقت خارج الجدول غير محتسب: ${hours(P.unscheduled_minutes)} (يمكن اعتماده من تصحيح الحضور).`, `Time outside the schedule, not counted: ${hours(P.unscheduled_minutes)} (approve it by correcting the attendance).`, `זמן מחוץ ללוח, לא נספר: ${hours(P.unscheduled_minutes)} (אפשר לאשר בתיקון הנוכחות).`))}</p>` : ""}
          ${d.barber_id ? `<div class="sec-label">${E(Lang.t("الخدمات المنجزة"))}</div>${(d.services_done || []).length ? `<table class="biz-table"><thead><tr><th>${E(Lang.t("الخدمة"))}</th><th>${E(Lang.t("العدد"))}</th><th>${E(Lang.t("القيمة التقديرية"))}</th></tr></thead><tbody>${d.services_done.map(s => `<tr><td data-i18n-skip>${E(s.name || "—")}</td><td>${num(s.services)}</td><td>${E(money(s.value))}</td></tr>`).join("")}</tbody></table>` : `<p class="tiny">${E(Lang.t("لا توجد خدمات مكتملة في هذه الفترة."))}</p>`}` : ""}
          ${(d.shifts || []).length ? `<div class="sec-label">${E(Lang.t("الحضور"))}</div><ul class="biz-mini">${d.shifts.slice(0, 12).map(s => `<li><span>${E(day(s.work_date))} · ${shiftLine(s)}</span>${pill(STATE, s.state)}${shiftMinutes(s)}</li>`).join("")}</ul>` : ""}`;
      } else if (tab === "pay") {
        host.innerHTML = `<div class="sec-label">${E(Lang.t("الأجر الحالي"))}</div>${d.compensation ? compSummary(d.compensation) : `<p class="tiny">${E(Lang.t("لم يُحدد الأجر بعد."))}</p>`}
          <button class="btn sm" id="em-comp">${UI.icon("pencil", 15)} ${E(Lang.t(d.compensation ? "تغيير الأجر" : "تحديد الأجر"))}</button>
          ${(d.versions || []).length > 1 ? `<div class="sec-label">${E(Lang.t("السجل"))}</div><ul class="biz-mini">${d.versions.map(v => `<li><span>${E(pick(`من ${day(v.effective_from)}`, `from ${day(v.effective_from)}`, `מ־${day(v.effective_from)}`))} · ${E(methodLabel(v))}</span>${v.effective_from > d.today ? `<button class="iconbtn" data-del-comp="${E(v.id)}" aria-label="${E(Lang.t("حذف"))}">${UI.icon("trash", 14)}</button>` : ""}</li>`).join("")}</ul>` : ""}
          <p class="tiny">${E(Lang.t("التغيير يسري من تاريخه ولا يغيّر ما حُسب قبله. يمكن حذف تغيير لم يبدأ بعد."))}</p>`;
        field("em-comp").onclick = () => compensationModal(d, services, again);
        host.querySelectorAll("[data-del-comp]").forEach(b => b.onclick = () => UI.confirm(Lang.t("حذف هذا التغيير المجدول؟"), async () => {
          try { await rpc("admin_emp_delete_compensation", { p_token: tok(), p_id: b.dataset.delComp }); UI.toast("تم الحذف", "ok"); await again(); } catch (e) { UI.toast(e.message, "err"); } }, true));
      } else if (tab === "money") {
        host.innerHTML = `<div class="btn-row"><button class="btn sm" id="em-pay">${UI.icon("money", 15)} ${E(Lang.t(renter ? "تسجيل إيجار مستلم" : "تسجيل دفعة"))}</button><button class="btn line sm" id="em-adj">${UI.icon("plus", 15)} ${E(Lang.t("مكافأة أو خصم"))}</button></div>
          <div class="sec-label">${E(Lang.t("الدفعات"))}</div>${(d.settlements || []).length ? `<ul class="biz-mini">${d.settlements.map(s => `<li class="${s.status === "voided" ? "muted" : ""}"><span>${E(day(s.paid_on))} · ${E(Lang.t(s.direction === "receive" ? "إيجار مستلم" : "دفعة للموظف"))}${s.period_from ? ` · ${E(day(s.period_from))} – ${E(day(s.period_to))}` : ""}${s.note ? ` · <span data-i18n-skip>${E(s.note)}</span>` : ""}</span><b>${E(money(s.amount))}</b>${s.status === "voided" ? `<small>${E(Lang.t("ملغاة"))}</small>` : `<button class="iconbtn" data-void="settlement" data-id="${E(s.id)}" aria-label="${E(Lang.t("إلغاء"))}">${UI.icon("trash", 14)}</button>`}</li>`).join("")}</ul>` : `<p class="tiny">${E(Lang.t("لا توجد دفعات بعد."))}</p>`}
          <div class="sec-label">${E(Lang.t("مكافآت وخصومات"))}</div>${(d.adjustments || []).length ? `<ul class="biz-mini">${d.adjustments.map(a => `<li class="${a.status === "voided" ? "muted" : ""}"><span>${E(day(a.effective_on))} · <span data-i18n-skip>${E(a.reason)}</span></span><b dir="ltr">${E(money(a.amount))}</b>${a.status === "voided" ? `<small>${E(Lang.t("ملغاة"))}</small>` : `<button class="iconbtn" data-void="adjustment" data-id="${E(a.id)}" aria-label="${E(Lang.t("إلغاء"))}">${UI.icon("trash", 14)}</button>`}</li>`).join("")}</ul>` : `<p class="tiny">${E(Lang.t("لا توجد تعديلات."))}</p>`}
          <p class="tiny">${E(Lang.t("دفع المستحقات لا يُنشئ مصروفاً جديداً: تكلفة الفريق تُحسب مرة واحدة في الإدارة المالية، والدفعات تظهر في التدفق النقدي."))}</p>`;
        field("em-pay").onclick = () => settlementModal(d, renter, f, t, again);
        field("em-adj").onclick = () => adjustmentModal(d, again);
        host.querySelectorAll("[data-void]").forEach(b => b.onclick = () => reasonPrompt(Lang.t("إلغاء السجل"), async reason => {
          await rpc("admin_emp_void_record", { p_token: tok(), p_kind: b.dataset.void, p_id: b.dataset.id, p_reason: reason }); UI.toast("تم الإلغاء", "ok"); await again(); }));
      } else {
        supportForm(host, d, again);
      }
    };
    paint();
  }
  function compSummary(c) {
    const rows = [];
    if (["salary", "salary_commission"].includes(c.method)) rows.push([Lang.t("الراتب"), `${money(c.salary_amount)} · ${Lang.t(PERIOD[c.salary_period] || "")}`]);
    if (["commission", "salary_commission", "hourly_commission"].includes(c.method)) rows.push([Lang.t("العمولة"), c.commission_kind === "percent" ? pct(c.commission_value) : money(c.commission_value) + " " + Lang.t("لكل خدمة")]);
    if (["hourly", "hourly_commission"].includes(c.method)) rows.push([Lang.t("الأجر بالساعة"), money(c.hourly_rate)]);
    if (c.method === "chair_rental") rows.push([Lang.t("إيجار الكرسي"), `${money(c.rent_amount)} · ${Lang.t(PERIOD[c.rent_period] || "")}`]);
    if (c.overtime_mode === "multiplier") rows.push([Lang.t("الوقت الإضافي"), "× " + num(c.overtime_value)]);
    if (c.overtime_mode === "fixed") rows.push([Lang.t("الوقت الإضافي"), money(c.overtime_value) + " " + Lang.t("للساعة")]);
    rows.push([Lang.t("يسري من"), day(c.effective_from)]);
    return `<ul class="biz-mini">${rows.map(([l, v]) => `<li><span>${E(l)}</span><b>${E(v)}</b></li>`).join("")}</ul>`;
  }
  function compensationModal(d, services, after) {
    const support = d.kind === "support", c = d.compensation || {};
    const methods = support ? ["salary", "hourly", "none"] : ["salary", "commission", "salary_commission", "hourly", "hourly_commission", "chair_rental", "none"];
    const rates = (d.versions?.[0]?.service_rates || []).map(r => ({ ...r }));
    const startDefault = d.compensation ? d.today : d.from;
    UI.modal(`<div class="mhead"><h3>${E(Lang.t("الأجر"))}</h3><button class="iconbtn" id="cm-x" aria-label="${E(Lang.t("إغلاق"))}">${UI.icon("x", 20)}</button></div>
      <form class="mform" id="cm-form"><p class="muted" data-i18n-skip>${E(d.name)}</p>
        <div class="control-form"><label class="full">${E(Lang.t("طريقة الأجر"))}<select class="select" id="cm-method">${methods.map(m => `<option value="${m}" ${m === (c.method || methods[0]) ? "selected" : ""}>${E(Lang.t(METHOD[m]))}</option>`).join("")}</select></label>
          <label data-show="salary">${E(Lang.t("مبلغ الراتب"))}${moneyIn("cm-salary", c.salary_amount ?? "")}</label>
          <label data-show="salary">${E(Lang.t("كل"))}<select class="select" id="cm-salary-period"><option value="month" ${c.salary_period !== "week" ? "selected" : ""}>${E(Lang.t("شهر"))}</option><option value="week" ${c.salary_period === "week" ? "selected" : ""}>${E(Lang.t("أسبوع"))}</option></select></label>
          <label data-show="commission">${E(Lang.t("نوع العمولة"))}<select class="select" id="cm-kind"><option value="percent" ${c.commission_kind !== "fixed" ? "selected" : ""}>${E(Lang.t("نسبة من سعر الخدمة"))}</option><option value="fixed" ${c.commission_kind === "fixed" ? "selected" : ""}>${E(Lang.t("مبلغ ثابت لكل خدمة"))}</option></select></label>
          <label data-show="commission">${E(Lang.t("القيمة"))}${moneyIn("cm-value", c.commission_value ?? "")}</label>
          <label data-show="hourly">${E(Lang.t("الأجر بالساعة"))}${moneyIn("cm-hourly", c.hourly_rate ?? "")}</label>
          <label data-show="rent">${E(Lang.t("إيجار الكرسي"))}${moneyIn("cm-rent", c.rent_amount ?? "")}</label>
          <label data-show="rent">${E(Lang.t("كل"))}<select class="select" id="cm-rent-period"><option value="month" ${c.rent_period !== "week" ? "selected" : ""}>${E(Lang.t("شهر"))}</option><option value="week" ${c.rent_period === "week" ? "selected" : ""}>${E(Lang.t("أسبوع"))}</option></select></label>
          <label data-show="overtime">${E(Lang.t("الوقت الإضافي"))}<select class="select" id="cm-ot"><option value="none">${E(Lang.t("بدون أجر إضافي"))}</option><option value="multiplier" ${c.overtime_mode === "multiplier" ? "selected" : ""}>${E(Lang.t("مضاعف للأجر بالساعة"))}</option><option value="fixed" ${c.overtime_mode === "fixed" ? "selected" : ""}>${E(Lang.t("مبلغ لكل ساعة"))}</option></select></label>
          <label data-show="overtime">${E(Lang.t("القيمة"))}<input class="input" id="cm-ot-value" type="number" inputmode="decimal" min="0" step="0.01" dir="ltr" value="${c.overtime_value ?? ""}"></label>
          <label>${E(Lang.t("يسري من"))}<input class="input" type="date" id="cm-from" value="${E(startDefault)}"></label>
          <label class="full">${E(Lang.t("ملاحظة"))}<input class="input" id="cm-note" maxlength="300"></label></div>
        <fieldset class="loy-fieldset" data-show="commission"><legend>${E(Lang.t("نسب خاصة لبعض الخدمات (اختياري)"))}</legend><div id="cm-rates"></div>
          <button type="button" class="btn line sm" id="cm-rate-add">${UI.icon("plus", 14)} ${E(Lang.t("خدمة"))}</button></fieldset>
        <p class="tiny" id="cm-hint"></p>
        <button class="btn" type="submit" id="cm-save">${E(Lang.t("حفظ"))}</button>${errorBox("cm-err")}</form>`);
    field("cm-x").onclick = after;
    const HINT = {
      salary: "راتب ثابت يُحسب يوماً بيوم. الحضور لا يغيّره، والوقت الإضافي يُدفع إن حددت له مبلغاً لكل ساعة.",
      commission: "تُحسب العمولة عند إتمام الدفع لكل خدمة مكتملة (أو من الخدمات المكتملة إن لم يُستخدم الدفع الذكي).",
      salary_commission: "راتب ثابت بالإضافة إلى عمولة على كل خدمة مكتملة.",
      hourly: "يُحسب من ساعات الحضور المعتمدة فقط.", hourly_commission: "ساعات الحضور المعتمدة بالإضافة إلى عمولة على الخدمات.",
      chair_rental: "المختص يدفع للعمل إيجاراً ثابتاً، ولا يتقاضى أجراً أو عمولة. ما يحصّله من عملائه ليس إيراداً للعمل.", none: "لا يُحسب أجر لهذا الموظف.",
    };
    const paintRates = () => {
      const host = field("cm-rates"); if (!host) return;
      host.innerHTML = rates.map((r, i) => `<div class="biz-picker"><select class="select" data-rate-svc="${i}">${services.map(s => `<option value="${E(s.id)}" ${s.id === r.service_id ? "selected" : ""}>${E(s.name)}</option>`).join("")}</select>
        <select class="select" data-rate-kind="${i}" style="max-width:120px"><option value="percent" ${r.kind !== "fixed" ? "selected" : ""}>%</option><option value="fixed" ${r.kind === "fixed" ? "selected" : ""}>${E(Lang.t("مبلغ"))}</option></select>
        <input class="input" type="number" min="0" step="0.01" dir="ltr" data-rate-val="${i}" value="${E(r.value ?? "")}" style="max-width:100px"><button type="button" class="iconbtn" data-rate-del="${i}" aria-label="${E(Lang.t("إزالة"))}">${UI.icon("trash", 14)}</button></div>`).join("");
      host.querySelectorAll("[data-rate-svc]").forEach(s => s.onchange = () => { rates[s.dataset.rateSvc].service_id = s.value; });
      host.querySelectorAll("[data-rate-kind]").forEach(s => s.onchange = () => { rates[s.dataset.rateKind].kind = s.value; });
      host.querySelectorAll("[data-rate-val]").forEach(s => s.oninput = () => { rates[s.dataset.rateVal].value = s.value; });
      host.querySelectorAll("[data-rate-del]").forEach(b => b.onclick = () => { rates.splice(Number(b.dataset.rateDel), 1); paintRates(); });
    };
    const sync = () => {
      const m = val("cm-method");
      const show = { salary: ["salary", "salary_commission"].includes(m), commission: ["commission", "salary_commission", "hourly_commission"].includes(m),
        hourly: ["hourly", "hourly_commission"].includes(m), rent: m === "chair_rental", overtime: !["chair_rental", "commission", "none"].includes(m) };
      document.querySelectorAll("#cm-form [data-show]").forEach(el => { el.hidden = !show[el.dataset.show]; });
      const ot = field("cm-ot"); if (ot) { ot.querySelector('[value="multiplier"]').disabled = !show.hourly; if (!show.hourly && ot.value === "multiplier") ot.value = "none"; }
      field("cm-hint").textContent = Lang.t(HINT[m] || "");
    };
    field("cm-method").onchange = sync;
    field("cm-rate-add").onclick = () => { if (!services.length) return; rates.push({ service_id: services[0].id, kind: "percent", value: "" }); paintRates(); };
    paintRates(); sync();
    field("cm-form").onsubmit = async e => {
      e.preventDefault(); UI.busy("cm-save", true);
      const m = val("cm-method");
      const data = { method: m, effective_from: val("cm-from"), note: val("cm-note"), salary_amount: val("cm-salary"), salary_period: val("cm-salary-period"),
        commission_kind: val("cm-kind"), commission_value: val("cm-value"), hourly_rate: val("cm-hourly"), rent_amount: val("cm-rent"), rent_period: val("cm-rent-period"),
        overtime_mode: field("cm-ot").closest("label").hidden ? "none" : val("cm-ot"), overtime_value: val("cm-ot-value"),
        service_rates: rates.filter(r => r.service_id && r.value !== "").map(r => ({ service_id: r.service_id, kind: r.kind, value: String(r.value) })) };
      try { await rpc("admin_emp_save_compensation", { p_token: tok(), p_employee: d.id, p_data: data }); UI.toast("تم الحفظ", "ok"); await after(); }
      catch (err) { showError("cm-err", err); UI.busy("cm-save", false); }
    };
  }
  function settlementModal(d, renter, f, t, after) {
    const key = requestKey(), owed = renter ? d.balance.rent_outstanding : d.balance.outstanding;
    UI.modal(`<div class="mhead"><h3>${E(Lang.t(renter ? "تسجيل إيجار مستلم" : "تسجيل دفعة"))}</h3><button class="iconbtn" id="sm-x" aria-label="${E(Lang.t("إغلاق"))}">${UI.icon("x", 20)}</button></div>
      <form class="mform" id="sm-form"><p class="muted"><span data-i18n-skip>${E(d.name)}</span> · ${E(Lang.t(renter ? "المتبقي عليه" : "الرصيد المستحق"))}: <b>${E(money(owed))}</b></p>
        <div class="control-form"><label>${E(Lang.t("المبلغ"))}${moneyIn("sm-amount", Number(owed) > 0 ? owed : "", "required")}</label>
          <label>${E(Lang.t("التاريخ"))}<input class="input" type="date" id="sm-date" value="${E(d.today)}"></label>
          <label>${E(Lang.t("طريقة الدفع"))}<select class="select" id="sm-method">${[["cash", "نقداً"], ["bank_transfer", "تحويل بنكي"], ["card", "بطاقة"], ["other", "أخرى"]].map(([v, l]) => `<option value="${v}">${E(Lang.t(l))}</option>`).join("")}</select></label>
          <label>${E(Lang.t("عن الفترة"))}<span class="row" style="gap:6px"><input class="input" type="date" id="sm-pf" value="${E(f)}"><input class="input" type="date" id="sm-pt" value="${E(t)}"></span></label>
          <label class="full">${E(Lang.t("ملاحظة"))}<input class="input" id="sm-note" maxlength="300"></label></div>
        <p class="tiny">${E(Lang.t("يمكن تسجيل دفعة جزئية. لا يمكن تكرار نفس الطلب."))}</p>
        <button class="btn" type="submit" id="sm-go">${E(Lang.t("حفظ"))}</button>${errorBox("sm-err")}</form>`);
    field("sm-x").onclick = after;
    field("sm-form").onsubmit = async e => {
      e.preventDefault(); UI.busy("sm-go", true);
      try {
        await rpc("admin_emp_record_settlement", { p_token: tok(), p_employee: d.id, p_data: { direction: renter ? "receive" : "pay", amount: Number(val("sm-amount")), paid_on: val("sm-date"), method: val("sm-method"), period_from: val("sm-pf"), period_to: val("sm-pt"), note: val("sm-note") }, p_request_key: key });
        UI.toast("تم الحفظ", "ok"); await after();
      } catch (err) { showError("sm-err", err); UI.busy("sm-go", false); }
    };
  }
  function adjustmentModal(d, after) {
    const key = requestKey();
    UI.modal(`<div class="mhead"><h3>${E(Lang.t("مكافأة أو خصم"))}</h3><button class="iconbtn" id="aj-x" aria-label="${E(Lang.t("إغلاق"))}">${UI.icon("x", 20)}</button></div>
      <form class="mform" id="aj-form"><div class="control-form"><label>${E(Lang.t("النوع"))}<select class="select" id="aj-sign"><option value="1">${E(Lang.t("مكافأة (+)"))}</option><option value="-1">${E(Lang.t("خصم (−)"))}</option></select></label>
        <label>${E(Lang.t("المبلغ"))}${moneyIn("aj-amount", "", "required")}</label><label>${E(Lang.t("التاريخ"))}<input class="input" type="date" id="aj-date" value="${E(d.today)}"></label>
        <label class="full">${E(Lang.t("السبب"))}<input class="input" id="aj-reason" maxlength="300" required minlength="3"></label></div>
        <button class="btn" type="submit" id="aj-go">${E(Lang.t("حفظ"))}</button>${errorBox("aj-err")}</form>`);
    field("aj-x").onclick = after;
    field("aj-form").onsubmit = async e => {
      e.preventDefault(); UI.busy("aj-go", true);
      try { await rpc("admin_emp_save_adjustment", { p_token: tok(), p_employee: d.id, p_data: { amount: Number(val("aj-sign")) * Math.abs(Number(val("aj-amount"))), effective_on: val("aj-date"), reason: val("aj-reason") }, p_request_key: key }); UI.toast("تم الحفظ", "ok"); await after(); }
      catch (err) { showError("aj-err", err); UI.busy("aj-go", false); }
    };
  }
  function reasonPrompt(title, fn) {
    UI.modal(`<div class="mhead"><h3>${E(title)}</h3><button class="iconbtn" id="rp-x" aria-label="${E(Lang.t("إغلاق"))}">${UI.icon("x", 20)}</button></div>
      <form class="mform" id="rp-form"><div class="field"><label for="rp-reason">${E(Lang.t("السبب"))}</label><input class="input" id="rp-reason" maxlength="300" required minlength="3"></div>
      <button class="btn danger" type="submit" id="rp-go">${E(Lang.t("تأكيد"))}</button>${errorBox("rp-err")}</form>`);
    field("rp-x").onclick = UI.closeModal;
    field("rp-form").onsubmit = async e => { e.preventDefault(); UI.busy("rp-go", true); try { await fn(val("rp-reason")); } catch (err) { showError("rp-err", err); UI.busy("rp-go", false); } };
  }
  // Team members who are not specialists: role title and hours. Their name and
  // phone come from their own Salonieer account (2.33: no salon-made accounts).
  function supportForm(host, d, after) {
    d = d || {};
    host.innerHTML = `<form class="mform" id="sf-form"><div class="control-form"><label>${E(Lang.t("الاسم"))}<input class="input" id="sf-name" maxlength="120" value="${E(d.name || "")}" disabled></label>
        <label>${E(Lang.t("المسمى (مثال: استقبال، تنظيف)"))}<input class="input" id="sf-title" maxlength="80" value="${E(d.title || "")}"></label></div>
      ${d.id ? `<label class="notification-toggle"><span>${E(Lang.t("نشط"))}</span><input type="checkbox" id="sf-active" ${d.is_active !== false ? "checked" : ""}></label>` : ""}
      <div class="sec-label">${E(Lang.t("أوقات العمل"))}</div><div id="sf-days"></div>
      <p class="tiny">${E(Lang.t("الموظف المساند لا يستقبل حجوزات ولا يقدم خدمات ولا يُحتسب ضمن عدد المختصين في الباقة."))}</p>
      <button class="btn" type="submit" id="sf-save">${E(Lang.t("حفظ"))}</button>${errorBox("sf-err")}</form>`;
    const editor = ScheduleEditor.mount(field("sf-days"), ScheduleEditor.fromSchedule(d.schedule || {}));
    field("sf-form").onsubmit = async e => {
      e.preventDefault();
      const bad = editor.validate(); // an error message, or null when the hours are fine
      if (bad) { showError("sf-err", new Error(bad)); editor.focusFirstProblem(); return; }
      UI.busy("sf-save", true);
      try {
        const r = await rpc("admin_emp_save_employee", { p_token: tok(), p_id: d.id || null, p_data: { title: val("sf-title"), schedule: editor.value(), is_active: field("sf-active") ? field("sf-active").checked : true } });
        if (r.account_created && r.temporary_password) {
          UI.modal(`<div class="mhead"><h3>${E(Lang.t("تم إنشاء حساب للموظف"))}</h3></div><div class="mform"><p>${E(Lang.t("أعطِ الموظف كلمة المرور المؤقتة ليسجل الدخول ويسجّل حضوره:"))}</p><p class="wf-temp" dir="ltr">${E(r.temporary_password)}</p><button class="btn" id="sf-ok">${E(Lang.t("تم"))}</button></div>`);
          field("sf-ok").onclick = async () => { UI.closeModal(); await after(); };
        } else { UI.toast("تم الحفظ", "ok"); await after(); }
      } catch (err) { showError("sf-err", err); UI.busy("sf-save", false); }
    };
  }

  // ── Statistics: specialist performance ────────────────────────────────
  // Operational figures: completed appointments, services performed and their
  // estimated value at the recorded base prices. Not revenue, not earnings.
  async function performance(host, opts = {}) {
    if (!host) return;
    let from = null, to = null, mode = "30";
    const draw = async () => {
      host.innerHTML = UI.loading();
      let r;
      try { r = await rpc("admin_stats_performance", { p_token: tok(), p_from: from, p_to: to }); }
      catch (e) { host.innerHTML = `<div class="card">${E(e.message)}</div>`; return; }
      currency = Money.fromSymbol(r.currency) || Money.fromSymbol(r.symbol) || Money.code();
      const S = r.salon, prev = r.previous;
      const growth = (cur, old) => !prev || !Number(old) ? "" : `<em class="biz-growth ${cur >= old ? "up" : "down"}" dir="ltr">${cur >= old ? "+" : ""}${pct((cur - old) / Math.abs(old) * 100)}</em>`;
      const maxV = Math.max(1, ...r.series.map(x => Number(x.services)));
      const label = d => r.unit === "year" ? String(d).slice(0, 4) : r.unit === "month" ? Lang.date(d, { month: "short", year: "2-digit" }) : String(d).slice(8);
      const bars = r.series.map(x => `<div class="biz-bar" title="${E(x.d)}"><i class="rev" style="height:${(Number(x.services) / maxV * 100).toFixed(1)}%"></i><small>${E(label(x.d))}</small></div>`).join("");
      const serviceTable = rows => `<table class="biz-table"><thead><tr><th>${E(Lang.t("الخدمة"))}</th><th>${E(Lang.t("العدد"))}</th><th>${E(Lang.t("القيمة التقديرية"))}</th></tr></thead><tbody>${rows.map(s => `<tr><td data-i18n-skip>${E(s.name || "—")}</td><td>${num(s.count)}</td><td>${E(money(s.value))}${Number(s.unpriced) ? `<small>${E(pick(`${num(s.unpriced)} بدون سعر مسجل`, `${num(s.unpriced)} without a recorded price`, `${num(s.unpriced)} ללא מחיר רשום`))}</small>` : ""}</td></tr>`).join("")}</tbody></table>`;
      host.innerHTML = `<div class="analytics-card-head"><div><h2>${E(Lang.t("أداء المختصين"))}</h2><p>${E(day(r.from))} – ${E(day(r.to))}</p></div>
          ${r.limited ? `<span class="badge info">${E(Lang.t("آخر 30 يوماً"))}</span>` : ""}</div>
        ${r.limited ? `<p class="tiny">${E(Lang.t("الباقة الأساسية تعرض آخر 30 يوماً. السجل الأقدم محفوظ ويظهر كاملاً عند الترقية إلى الاحترافية."))}</p>`
          : `<div class="card biz-toolbar">${UI.seg("pf-mode", [{ v: "30", l: Lang.t("30 يوماً") }, { v: "month", l: Lang.t("هذا الشهر") }, { v: "year", l: Lang.t("هذه السنة") }, { v: "all", l: Lang.t("كل السجل") }, { v: "custom", l: Lang.t("فترة مخصصة") }], mode)}
             <div class="biz-range" id="pf-range" ${mode === "custom" ? "" : "hidden"}><label>${E(Lang.t("من"))}<input class="input" type="date" id="pf-from" value="${E(from || "")}"></label><label>${E(Lang.t("إلى"))}<input class="input" type="date" id="pf-to" value="${E(to || "")}"></label><button class="btn sm" id="pf-apply">${E(Lang.t("عرض"))}</button></div></div>`}
        <div class="biz-kpis"><article class="biz-kpi"><span>${E(Lang.t("المواعيد المكتملة"))}</span><strong>${num(S.appointments)}</strong><small>${growth(S.appointments, prev?.appointments)}</small></article>
          <article class="biz-kpi"><span>${E(Lang.t("الخدمات المنجزة"))}</span><strong>${num(S.services)}</strong><small>${growth(S.services, prev?.services)}</small></article>
          <article class="biz-kpi"><span>${E(Lang.t("القيمة التقديرية للخدمات"))}</span><strong>${E(money(S.value))}</strong><small>${growth(Number(S.value), Number(prev?.value))}</small></article></div>
        ${r.series.length > 1 ? `<section class="biz-panel"><div class="biz-panel-head"><h3>${E(Lang.t("الخدمات المنجزة عبر الزمن"))}</h3></div><div class="biz-bars" dir="ltr">${bars}</div></section>` : ""}
        <div class="wf-perf">${r.specialists.map(sp => `<details class="wf-perf-card" ${r.specialists.length <= 3 ? "open" : ""}><summary><span class="wf-avatar">${E((sp.name || "?").trim().charAt(0))}</span><b data-i18n-skip>${E(sp.name)}</b>
            <span class="wf-perf-nums"><span>${E(pick(`${num(sp.appointments)} موعد`, `${num(sp.appointments)} appointments`, `${num(sp.appointments)} תורים`))}</span><span>${E(pick(`${num(sp.services)} خدمة`, `${num(sp.services)} services`, `${num(sp.services)} שירותים`))}</span><strong>${E(money(sp.value))}</strong></span></summary>
            ${sp.breakdown.length ? serviceTable(sp.breakdown) : `<p class="tiny">${E(Lang.t("لا توجد خدمات مكتملة في هذه الفترة."))}</p>`}</details>`).join("") || UI.empty(Lang.t("لا توجد بيانات"), "")}</div>
        ${r.services.length ? `<section class="biz-panel"><div class="biz-panel-head"><h3>${E(Lang.t("كل العمل حسب الخدمة"))}</h3></div>${serviceTable(r.services)}
          ${Number(S.unassigned_services) ? `<p class="tiny">${E(pick(`منها ${num(S.unassigned_services)} خدمة بدون مختص محدد.`, `Including ${num(S.unassigned_services)} services without a specialist.`, `מתוכם ${num(S.unassigned_services)} שירותים ללא איש מקצוע.`))}</p>` : ""}</section>` : ""}
        <p class="tiny biz-note">${UI.icon("info", 14)} ${E(Lang.t(Features.enabled("employee_earnings") ? "أرقام تشغيلية: الخدمات المكتملة فقط بسعرها الأساسي المسجل وقت الموعد. ليست إيراداً فعلياً ولا أرباحاً للموظفين، ولا يُخصم منها شيء. الموعد الواحد قد يشمل أكثر من خدمة." : "أرقام تشغيلية: الخدمات المكتملة فقط بسعرها الأساسي المسجل وقت الموعد. ليست إيراداً فعلياً، ولا يُخصم منها شيء. الموعد الواحد قد يشمل أكثر من خدمة."))}
          ${r.detailed_since ? E(pick(` التفاصيل لكل مختص متاحة منذ ${day(r.detailed_since)}.`, ` Specialist details are available since ${day(r.detailed_since)}.`, ` פירוט לפי איש מקצוע זמין מאז ${day(r.detailed_since)}.`)) : ""}</p>`;
      if (!r.limited) {
        UI.wireSeg("pf-mode", v => {
          mode = v; const t = opts.today || iso(new Date());
          if (v === "custom") { field("pf-range").hidden = false; return; }
          to = t; from = v === "30" ? addDays(t, -29) : v === "month" ? t.slice(0, 8) + "01" : v === "year" ? t.slice(0, 5) + "01-01" : (r.earliest || addDays(t, -29));
          draw();
        });
        const apply = field("pf-apply"); if (apply) apply.onclick = () => { from = val("pf-from") || null; to = val("pf-to") || null; draw(); };
      }
    };
    await draw();
  }

  function register(router) {
    router.add("#/attendance", attendanceRoute, { nav: false, guard: "auth" });
  }

  return { scanCode, position, arrival, lookup, productView, scanProduct, customerScanEnabled, customerScanProduct,
    attendancePanel, isEmployee, attendancePage, earningsPage, performance, register,
    setCurrency: c => { currency = c || "ILS"; }, money: n => money(n) };
})();
