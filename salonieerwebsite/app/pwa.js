if (!(window.NativeBridge && NativeBridge.available())) {
// pwa.js — installable app + offline awareness: installable app, offline awareness, and small
// touches (haptics, confetti, add-to-calendar, WhatsApp share).
// Loaded early and dependency-free: nothing here assumes UI/Router exist yet.

const Enhance = (() => {
  const S = { deferredPrompt: null, swUpdated: false };

  // ---------- service worker ----------
  function registerSW() {
    if (!("serviceWorker" in navigator)) return;
    // file:// or unsupported contexts throw — fail silently, app works without SW
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").then((reg) => {
        // surface "app updated" once the new worker takes over
        reg.addEventListener("updatefound", () => {
          const nw = reg.installing;
          if (!nw) return;
          nw.addEventListener("statechange", () => {
            if (nw.state === "activated" && navigator.serviceWorker.controller && !S.swUpdated) {
              S.swUpdated = true;
              toastSafe("تم تحديث التطبيق");
            }
          });
        });
      }).catch(() => {});
    });
  }

  // ---------- install (Add to Home Screen) ----------
  const isStandalone = () =>
    window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    S.deferredPrompt = e;
    document.dispatchEvent(new CustomEvent("enhance:installable"));
  });
  window.addEventListener("appinstalled", () => {
    S.deferredPrompt = null;
    toastSafe("تم تثبيت التطبيق 🎉");
  });

  // Row shows whenever the app isn't already installed; install() below
  // handles every case (native prompt, iOS steps, or manual instructions).
  function canInstall() { return !isStandalone(); }

  async function install() {
    if (S.deferredPrompt) {
      S.deferredPrompt.prompt();
      const { outcome } = await S.deferredPrompt.userChoice;
      if (outcome === "accepted") S.deferredPrompt = null;
      return outcome === "accepted";
    }
    if (isIOS()) { iosInstallSheet(); return false; }
    genericInstallSheet(); return false;
  }

  // Fallback when the browser hasn't offered a native prompt: show the
  // right manual steps — or explain the HTTPS requirement if that's the blocker.
  // The install sheets are whole sentences with inline symbols, so each
  // language keeps its own copy instead of being translated fragment by fragment.
  const pick = (ar, en, he) => { const l = window.Lang?.get?.() || "ar"; return l === "en" ? en : l === "he" ? he : ar; };
  function genericInstallSheet() {
    if (!window.UI) return;
    const secure = location.protocol === "https:" ||
      ["localhost", "127.0.0.1"].includes(location.hostname);
    const steps = pick(
      [`<b>أندرويد (كروم):</b> افتح قائمة المتصفح <b>⋮</b> واختر <b>«تثبيت التطبيق»</b> أو <b>«إضافة إلى الشاشة الرئيسية»</b>`,
       `<b>كمبيوتر (كروم / إيدج):</b> اضغط أيقونة التثبيت <span class="ios-share">⊕</span> في نهاية شريط العنوان`,
       `<b>آيفون (سفاري):</b> زر المشاركة <span class="ios-share">⬆︎</span> ثم <b>«إضافة إلى الشاشة الرئيسية»</b>`],
      [`<b>Android (Chrome):</b> open the browser menu <b>⋮</b> and choose <b>“Install app”</b> or <b>“Add to Home screen”</b>`,
       `<b>Computer (Chrome / Edge):</b> press the install icon <span class="ios-share">⊕</span> at the end of the address bar`,
       `<b>iPhone (Safari):</b> tap Share <span class="ios-share">⬆︎</span> then <b>“Add to Home Screen”</b>`],
      [`<b>אנדרואיד (Chrome):</b> פתחו את תפריט הדפדפן <b>⋮</b> ובחרו <b>„התקנת היישום”</b> או <b>„הוספה למסך הבית”</b>`,
       `<b>מחשב (Chrome / Edge):</b> לחצו על סמל ההתקנה <span class="ios-share">⊕</span> בסוף שורת הכתובת`,
       `<b>iPhone (Safari):</b> הקישו על שיתוף <span class="ios-share">⬆︎</span> ואז <b>„הוספה למסך הבית”</b>`]);
    const insecure = pick(
      `التثبيت يعمل فقط عندما يُفتح التطبيق عبر رابط <b dir="ltr">https://</b>. الروابط المحلية مثل <b dir="ltr">file://</b> أو <b dir="ltr">http://192.168…</b> لا تدعم تثبيت التطبيقات.`,
      `Installing only works when the app is opened from an <b dir="ltr">https://</b> link. Local links such as <b dir="ltr">file://</b> or <b dir="ltr">http://192.168…</b> can't install apps.`,
      `ההתקנה פועלת רק כשהיישום נפתח מקישור <b dir="ltr">https://</b>. קישורים מקומיים כמו <b dir="ltr">file://</b> או <b dir="ltr">http://192.168…</b> אינם תומכים בהתקנה.`);
    UI.modal(`<h3>تثبيت التطبيق</h3>
      ${secure ? `<ol class="ios-steps" data-i18n-skip>${steps.map(x => `<li>${x}</li>`).join("")}</ol>`
        : `<p class="muted" data-i18n-skip style="margin:8px 0 16px;line-height:1.9">${insecure}</p>`}
      <button class="btn" onclick="UI.closeModal()">حسناً</button>`);
  }

  function iosInstallSheet() {
    if (!window.UI) return;
    const steps = pick(
      [`اضغط زر <b>المشاركة</b> <span class="ios-share">⬆︎</span> في شريط سفاري`, `اختر <b>«إضافة إلى الشاشة الرئيسية»</b>`, `اضغط <b>إضافة</b> — وستجد التطبيق بجانب تطبيقاتك`],
      [`Tap <b>Share</b> <span class="ios-share">⬆︎</span> in the Safari toolbar`, `Choose <b>“Add to Home Screen”</b>`, `Tap <b>Add</b> — the app appears next to your other apps`],
      [`הקישו על <b>שיתוף</b> <span class="ios-share">⬆︎</span> בסרגל של Safari`, `בחרו <b>„הוספה למסך הבית”</b>`, `הקישו על <b>הוספה</b> — היישום יופיע לצד שאר היישומים`]);
    UI.modal(`<h3>تثبيت التطبيق على iPhone</h3>
      <ol class="ios-steps" data-i18n-skip>${steps.map(x => `<li>${x}</li>`).join("")}</ol>
      <button class="btn" onclick="UI.closeModal()">حسناً</button>`);
  }

  // ---------- offline / online banner ----------
  function netBanner() {
    let el = document.getElementById("net-banner");
    if (!el) {
      el = document.createElement("div");
      el.id = "net-banner";
      document.body.appendChild(el);
    }
    return el;
  }
  function wireNetwork() {
    const show = (txt, cls, autoHide) => {
      const el = netBanner();
      el.textContent = txt;
      el.className = "show " + cls;
      if (autoHide) setTimeout(() => { el.className = ""; }, 2200);
    };
    window.addEventListener("offline", () => { show("لا يوجد اتصال بالإنترنت", "off"); haptic(30); });
    window.addEventListener("online", () => { show("عاد الاتصال بالإنترنت", "on", true); haptic(15); });
    if (!navigator.onLine) show("لا يوجد اتصال بالإنترنت", "off");
  }

  // ---------- tiny delights ----------
  function haptic(ms) { try { navigator.vibrate && navigator.vibrate(ms || 12); } catch {} }

  function confetti() { /* Compatibility hook: decorative confetti retired in 2.1. */ }

  // ---------- add to calendar (.ics) ----------
  // b = { title, date:"YYYY-MM-DD", time:"HH:MM[:SS]", duration(min), location, description }
  function downloadICS(b) {
    const esc = (s) => String(s || "").replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/[,;]/g, (m) => "\\" + m);
    const [Y, M, D] = b.date.split("-").map(Number);
    const [h, m] = b.time.split(":").map(Number);
    const start = new Date(Y, M - 1, D, h, m, 0);
    const end = new Date(start.getTime() + (Number(b.duration) || 30) * 60000);
    const fmt = (d) =>
      `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}T` +
      `${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}00`;
    const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
    const uid = (crypto.randomUUID ? crypto.randomUUID() : Date.now() + "-" + Math.random()) + "@salonieer";
    const ics = [
      "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//METON//Booking//AR", "CALSCALE:GREGORIAN",
      "BEGIN:VEVENT",
      "UID:" + uid,
      "DTSTAMP:" + stamp,
      "DTSTART:" + fmt(start),           // floating local time — correct for a local salon visit
      "DTEND:" + fmt(end),
      "SUMMARY:" + esc(b.title),
      b.location ? "LOCATION:" + esc(b.location) : "",
      b.description ? "DESCRIPTION:" + esc(b.description) : "",
      "BEGIN:VALARM", "TRIGGER:-PT60M", "ACTION:DISPLAY", "DESCRIPTION:" + esc(b.title), "END:VALARM",
      "END:VEVENT", "END:VCALENDAR",
    ].filter(Boolean).join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
    a.download = "booking.ics";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  function waShare(text) {
    window.open("https://wa.me/?text=" + encodeURIComponent(text), "_blank", "noopener");
  }

  function toastSafe(msg) { if (window.UI && UI.toast) UI.toast(msg, "ok"); }

  // subtle haptic on primary buttons & bottom-nav taps (delegated once)
  document.addEventListener("click", (e) => {
    if (e.target.closest && e.target.closest(".btn, .navitem, .slot, .day, .svc")) haptic(8);
  }, { passive: true });

  registerSW();
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wireNetwork);
  else wireNetwork();

  return { canInstall, install, isStandalone, haptic, confetti, downloadICS, waShare };
})();
window.Enhance = Enhance;

}
