/* Native capabilities have explicit, small messages. No arbitrary native code execution. */
(function () {
  "use strict";
  const pending = new Map();
  let sequence = 0;
  let lastThemeColor = "";
  const available = () => !!(window.SalonieerAndroid || window.webkit?.messageHandlers?.salonieer);
  function request(method, value) {
    return new Promise((resolve, reject) => {
      if (!available()) { reject(new Error("هذه الميزة متاحة في التطبيق")); return; }
      const id = String(++sequence);
      const timer = setTimeout(() => { pending.delete(id); reject(new Error("انتهت مهلة العملية")); }, 180000);
      pending.set(id, { resolve, reject, timer });
      const json = JSON.stringify({ id, method, value });
      if (window.SalonieerAndroid) SalonieerAndroid.postMessage(json);
      else window.webkit.messageHandlers.salonieer.postMessage(json);
    });
  }
  window.NativeBridge = {
    available,
    request,
    setPlatform(name) { document.documentElement.dataset.native = name; this.syncTheme(); request('language', {language:Lang.get()}).catch(()=>{}); },
    complete(result) {
      const call = pending.get(String(result.id));
      if (!call) return;
      clearTimeout(call.timer); pending.delete(String(result.id));
      if (result.error) {
        const raw=String(result.error), copy=window.Lang ? Lang.ui(raw) : raw;
        call.reject(new Error(window.Lang && /[\u0600-\u06ff]/.test(copy) && Lang.get()!=="ar" ? Lang.error(raw) : copy));
      } else call.resolve(result.value);
    },
    receiveCode(code) {
      if (!/^[A-Za-z0-9_-]{2,64}$/.test(code)) return;
      sessionStorage.setItem("salonieer:incoming", code);
      localStorage.setItem("salonieer:mode", "customer");
      location.replace("index.html?code=" + encodeURIComponent(code));
    },
    receiveAuth(fragment) {
      const value = String(fragment || "");
      if (value.length > 8192 || !value.includes("access_token=") || !value.includes("refresh_token=")) return;
      // Salonieer Admin accounts are recovered on the website admin (2.29),
      // which reads the same Supabase recovery fragment.
      window.Control?.website(value.replace(/^#/, ""));
    },
    receivePush(data) { window.Push?.receive(data); },
    syncTheme() {
      if (!available()) return;
      requestAnimationFrame(() => {
        // SalonTheme already writes the resolved solid background here. Reading
        // the meta value avoids inserting a probe element and forcing WebKit to
        // recalculate layout/styles simply to discover --bg.
        const color=(document.querySelector('meta[name="theme-color"]')?.content||'').trim().toLowerCase();
        if (!/^#[0-9a-f]{6}$/.test(color) || color===lastThemeColor) return;
        lastThemeColor=color;
        request('theme',{color}).catch(()=>{ lastThemeColor=''; });
      });
    },
    back() {
      const photo=document.querySelector('.photo-editor [data-close]');if(photo){photo.click();return true;}
      if (document.querySelector("#modal-root .modal-bg")) { UI.closeModal(); return true; }
      const calFull=document.querySelector('.cal-full [data-cal-close]');if(calFull){calFull.click();return true;}
      const cancel=document.getElementById('platform-cancel');if(cancel){cancel.click();return true;}
      if(document.querySelector('.platform-gate')) return false;
      return window.Router ? Router.nativeBack() : true;
    }
  };
  document.addEventListener("salonieer:theme",()=>window.NativeBridge.syncTheme());

  /* 2.32: one way to ask for the location. The person is told why first (the
     phone's own question has no room for that), the phone's permission flow
     runs through the app (Android's web view never asked at all, so "near me"
     silently failed there), and a refusal ends in a clear message with another
     way forward instead of an error. Nothing is stored except whether the
     explanation was already accepted on this device. */
  const PURPOSE = {
    discover: ["اعثر على أعمال قريبة منك", "نستخدم موقعك مرة واحدة لترتيب الأعمال حسب القرب منك. لا نحفظه ولا نتابعه.", "يمكنك البحث باسم المدينة بدلاً من ذلك."],
    attendance: ["تأكيد وجودك في العمل", "عند تسجيل الحضور نتحقق مرة واحدة أنك داخل العمل. لا نتابع تنقلاتك.", "يمكنك تسجيل الحضور برمز العمل أو طلب تسجيل يدوي من المدير."],
    salon: ["تحديد موقع العمل", "نستخدم موقعك الحالي لتعبئة موقع العمل، فيظهر للعملاء القريبين ويُستخدم لتسجيل الحضور.", "يمكنك كتابة الإحداثيات يدوياً."],
  };
  const EXPLAINED = "salonieer:location-explained:v1";
  const T = s => (window.Lang ? Lang.t(s) : s);
  function explain(purpose) {
    const [title, why] = PURPOSE[purpose] || PURPOSE.discover;
    try { if (localStorage.getItem(EXPLAINED + ":" + purpose) === "1") return Promise.resolve(true); } catch {}
    return new Promise(resolve => {
      let answered = false;
      const done = v => { if (answered) return; answered = true; resolve(v); };
      UI.modal(`<div class="locate-ask"><div class="locate-icon">${UI.icon("pin", 26)}</div><h3>${UI.esc(T(title))}</h3><p>${UI.esc(T(why))}</p>
        <div class="btn-row"><button class="btn" id="loc-allow" type="button">${UI.esc(T("متابعة"))}</button><button class="btn line" id="loc-later" type="button">${UI.esc(T("ليس الآن"))}</button></div></div>`);
      document.getElementById("loc-allow").onclick = () => { try { localStorage.setItem(EXPLAINED + ":" + purpose, "1"); } catch {} UI.closeModal(); done(true); };
      document.getElementById("loc-later").onclick = () => { UI.closeModal(); done(false); };
      // Closing the sheet any other way counts as "not now".
      const root = document.getElementById("modal-root");
      const watch = new MutationObserver(() => { if (!root.querySelector(".locate-ask")) { watch.disconnect(); done(false); } });
      watch.observe(root, { childList: true, subtree: true });
    });
  }
  function browserPosition(highAccuracy) {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) { reject(Object.assign(new Error("unavailable"), { kind: "unavailable" })); return; }
      navigator.geolocation.getCurrentPosition(
        p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
        e => reject(Object.assign(new Error("denied"), { kind: e.code === 1 ? "denied" : "failed" })),
        { enableHighAccuracy: !!highAccuracy, timeout: 20000, maximumAge: highAccuracy ? 30000 : 600000 });
    });
  }
  // Resolves { lat, lng, accuracy } or null (not now / refused / unavailable);
  // the reason has already been explained to the person by then.
  async function locate(purpose = "discover", { highAccuracy = false, quiet = false } = {}) {
    if (!(await explain(purpose))) return null;
    try {
      if (available()) {
        try { const raw = await request("location"); const p = typeof raw === "string" ? JSON.parse(raw) : raw; if (p && isFinite(p.lat)) return p; }
        catch (e) { if (!/غير مدعومة|unsupported|אינה נתמכת/i.test(e.message || "")) throw Object.assign(e, { kind: "denied" }); }
      }
      return await browserPosition(highAccuracy);
    } catch (e) {
      if (!quiet) refused(purpose, e.kind);
      return null;
    }
  }
  function refused(purpose, kind) {
    const other = (PURPOSE[purpose] || PURPOSE.discover)[2];
    const head = kind === "unavailable" ? "تحديد الموقع غير متاح على هذا الجهاز" : kind === "failed" ? "تعذّر تحديد موقعك الآن" : "لم يُسمح بالوصول إلى الموقع";
    UI.modal(`<div class="locate-ask"><div class="locate-icon off">${UI.icon("pin", 26)}</div><h3>${UI.esc(T(head))}</h3>
      <p>${UI.esc(T(kind === "denied" ? "يمكنك السماح بالموقع لاحقاً من إعدادات الهاتف ← التطبيقات ← METON ← الموقع." : "تأكد من تشغيل خدمة الموقع وحاول مرة أخرى."))}</p><p class="muted">${UI.esc(T(other))}</p>
      <div class="btn-row"><button class="btn" id="loc-ok" type="button">${UI.esc(T("حسناً"))}</button></div></div>`);
    document.getElementById("loc-ok").onclick = UI.closeModal;
  }
  window.Locate = { locate, explain, refused };
  if (available()) document.documentElement.dataset.native = window.SALONIEER_NATIVE_PLATFORM || "android";
})();
