// auth.js — custom salon-customer phone + password auth (no OTP; platform
// administration uses Supabase Auth separately in control.js).
// Global app state + theming live here.

(function migrateKeys(){
  try{
    const key = Shop.tokenKey();
    if(!localStorage.getItem(key)){
      const old = localStorage.getItem("aj_token") || localStorage.getItem("bs_token");
      if(old) localStorage.setItem(key, old);
    }
    if(localStorage.getItem("bs_dark") && !localStorage.getItem("aj_dark"))
      localStorage.setItem("aj_dark", localStorage.getItem("bs_dark"));
  }catch{}
})();

window.App = {
  token: localStorage.getItem(Shop.tokenKey()) || null,
  user: null,        // { user_id, role, name, phone, barber_id, shop }
  settings: null,    // app_settings row for THIS shop
  userSettings: null,
  unread: 0,
  guest: false,
};

const BRAND_FALLBACK = { app_name: "METON", ...SalonTheme.DEFAULTS };

const Auth = (() => {
  function saveToken(t) { App.token = t; localStorage.setItem(Shop.tokenKey(), t); }
  function clearToken() { App.token = null; localStorage.removeItem(Shop.tokenKey()); }

  function role() { return App.user?.role || null; }
  function isAdmin() { return role() === "admin"; }
  // 2.33: the person's job here (team_me): role, permissions, membership.
  // Owners can do everything; a team member what the owner granted. The
  // server checks every call — this only decides what the app shows.
  function team() { return App.team || null; }
  function can(perm) {
    if (isAdmin()) return true;
    const m = App.team?.member;
    if (!m || m.status !== "active") return false;
    return perm === "staff" ? (m.permissions || []).length > 0 : (m.permissions || []).includes(perm);
  }
  function isStaff() { return isAdmin() || can("staff"); }
  function isLoggedIn() { return !!App.user; }
  // 2.30: guests browse any salon without an account. Someone signed in to a
  // Salonieer account who is not linked to this salon yet browses it the
  // same way until they link it.
  function isGuest() { return App.guest && !App.user; }
  function guestKey() { return "salonieer:guest:demo001"; }
  function restoreGuest() {
    App.guest = !App.token && (!!window.Account?.isGuest() || !!window.Account?.signedIn()
      || (Platform.current()?.slug === "demo001" && localStorage.getItem(guestKey()) === "1"));
  }
  async function continueAsGuest({ navigate = true } = {}) {
    if (Platform.current()?.slug !== "demo001" && !window.Account?.isGuest()) return;
    // A salon switch can leave another tenant's token in memory. Read only
    // the selected demo tenant's token before starting the guest session.
    App.token = localStorage.getItem(Shop.tokenKey()) || null;
    if (App.token) await logout();
    App.user = null; App.userSettings = null; App.unread = 0; App.guest = true;
    localStorage.setItem(guestKey(), "1");
    window.rpcCacheBust?.();
    if (navigate) Router.go("#/home");
  }

  // The salon's own settings are the first thing every screen needs, so the
  // last known copy is kept on this device. A returning customer paints from
  // it immediately while the fresh copy is still on the wire.
  const settingsKey = () => "salonieer:settings:" + Shop.slug();
  const profileKey = () => "salonieer:profile:" + Shop.slug();
  // The logo is stored as a data URL inside the settings row, so it can be
  // orders of magnitude larger than everything else put together. Keeping it
  // in the same record made a single oversized logo blow the storage quota
  // and silently disable the whole cache — which is when the app started
  // opening on a spinner and the logo "disappeared" between pages.
  const logoKey = () => "salonieer:logo:" + Shop.slug();
  const LOGO_CACHE_LIMIT = 400000;
  function cachedSettings() {
    try {
      const raw = JSON.parse(localStorage.getItem(settingsKey()) || "null");
      if (!raw || typeof raw !== "object" || !raw.app_name) return null;
      return { ...raw, logo_url: localStorage.getItem(logoKey()) || "" };
    } catch { return null; }
  }
  function rememberSettings(value) {
    if (!value || typeof value !== "object") return;
    const logo = String(value.logo_url || "");
    try {
      // An emptied logo clears the stored copy, so removing a logo in the
      // dashboard is not undone by a stale cache on the next launch.
      if (logo && logo.length <= LOGO_CACHE_LIMIT) localStorage.setItem(logoKey(), logo);
      else localStorage.removeItem(logoKey());
    } catch {}
    try { localStorage.setItem(settingsKey(), JSON.stringify({ ...value, logo_url: "" })); }
    catch { try { localStorage.removeItem(settingsKey()); } catch {} }
  }
  // The signed-in profile is remembered next to the session token that already
  // lives on this device, so the first screen after opening the salon is the
  // one the person expects instead of the sign-in form. The server still has
  // the final word: auth_me runs on every start and a rejected token clears it.
  function rememberProfile() {
    try {
      if (App.user) localStorage.setItem(profileKey(), JSON.stringify({ user: App.user, settings: App.userSettings || null, team: App.team || null }));
      else localStorage.removeItem(profileKey());
    } catch {}
  }
  function cachedProfile() {
    try {
      const raw = JSON.parse(localStorage.getItem(profileKey()) || "null");
      return raw && raw.user && raw.user.user_id ? raw : null;
    } catch { return null; }
  }

  async function loadContext() {
    // Platform selection happens before this call. Refresh the token using the
    // selected salon key so multiple salon accounts stay completely separate.
    App.token = localStorage.getItem(Shop.tokenKey()) || null;
    // 2.30: a Salonieer account opens this salon with its own salon session.
    if (!App.token && window.Account?.signedIn()) {
      const entered = await Account.ensureSalonSession(Shop.slug()).catch(() => null);
      if (entered?.token) App.token = entered.token;
    }
    restoreGuest();

    // Nothing here depends on anything else here, so everything goes out at
    // once. Sequential awaits used to cost four round trips before first paint.
    let token = App.token;
    let [settings, me, userSettings, , , teamInfo] = await Promise.all([
      rpc("get_app_settings").catch(() => null),
      token ? rpc("auth_me", { p_token: token }).then(v => ({ ok: v }), e => ({ err: e })) : Promise.resolve(null),
      token ? rpc("get_user_settings", { p_token: token }).catch(() => null) : Promise.resolve(null),
      Features.load().catch(() => false),
      Staff.load().catch(() => null),
      rpc("team_me", { p_token: token || "" }).catch(() => null),
    ]);
    // An expired salon session is renewed from the account once.
    if (me?.err && window.Account?.signedIn() && !/failed to fetch|network|load failed|تعذّر الاتصال/i.test(me.err.message || "")) {
      clearToken();
      const entered = await Account.ensureSalonSession(Shop.slug(), { force: true }).catch(() => null);
      if (entered?.token) {
        App.token = token = entered.token;
        [me, userSettings, teamInfo] = await Promise.all([
          rpc("auth_me", { p_token: token }).then(v => ({ ok: v }), e => ({ err: e })),
          rpc("get_user_settings", { p_token: token }).catch(() => null),
          rpc("team_me", { p_token: token }).catch(() => null),
        ]);
      } else me = null;
      restoreGuest();
    }

    if (settings) rememberSettings(settings);
    App.settings = settings || cachedSettings();
    if (!App.settings) {
      // slug not found in the shops table (or the SQL file hasn't been run yet)
      console.warn(`Shop "${Shop.slug()}" not found — run create_shop('${Shop.slug()}', …) in Supabase.`);
      App.settings = { ...BRAND_FALLBACK };
    }
    if (!App.settings.app_name) App.settings.app_name = BRAND_FALLBACK.app_name;

    App.user = null; App.userSettings = null;
    App.team = teamInfo && typeof teamInfo === "object" ? teamInfo : (cachedProfile()?.team || null);
    if (me) {
      if (me.ok) {
        App.guest = false;
        App.user = me.ok;
        App.userSettings = userSettings || null;
        if (App.userSettings) localStorage.setItem("aj_dark", App.userSettings.dark_mode ? "1" : "0");
      } else {
        const message = me.err?.message || "";
        if (/failed to fetch|network|load failed|تعذّر الاتصال/i.test(message)) {
          // Offline, but this device has a token and a known profile: keep the
          // person inside the app instead of bouncing them to a sign-in form
          // they cannot complete.
          const saved = cachedProfile();
          if (!saved) throw me.err;
          App.user = saved.user; App.userSettings = saved.settings;
        } else clearToken();
      }
    }
    rememberProfile();
    applyTheme();
    document.title = (App.settings && App.settings.app_name) || BRAND_FALLBACK.app_name;
    try { if (window.SalonHooks) await SalonHooks.emit("contextLoaded", App); } catch (e) { console.warn(e); }
    if (App.user) window.Push?.sync().catch(() => {});
    return App;
  }

  // Everything the first screen needs, without waiting for the network when
  // this device already has a usable copy. Returns true when the app can be
  // painted right away and refreshed underneath.
  // "full"    — this device has been in this salon before; open its screens.
  // "partial" — first time here: enough branding for a proper opening frame,
  //             but the real settings still have to arrive.
  function primeFromCache() {
    const saved = cachedSettings();
    if (!saved) {
      const salon = window.Platform?.current?.();
      if (!salon) return false;
      App.settings = { ...BRAND_FALLBACK, ...(salon.capabilities || {}), app_name: salon.name, logo_url: salon.logo_url };
      applyTheme();
      document.title = salon.name || BRAND_FALLBACK.app_name;
      return "partial";
    }
    App.settings = saved;
    App.token = localStorage.getItem(Shop.tokenKey()) || null;
    App.user = null; App.userSettings = null;
    restoreGuest();
    if (App.token) {
      const profile = cachedProfile();
      if (profile) { App.user = profile.user; App.userSettings = profile.settings; App.team = profile.team || null; }
    }
    applyTheme();
    document.title = saved.app_name || BRAND_FALLBACK.app_name;
    return "full";
  }

  function applyTheme() {
    window.Platform?.syncCurrentBrand?.(App.settings || {});
    const caps = window.Platform?.current()?.capabilities || {};
    const settings = { ...SalonTheme.DEFAULTS, ...caps, ...(App.settings || {}) };
    // Cobalt Pulse: Light / Dark / System on this device (theme.js Appearance; System by default).
    const dark = window.Appearance ? Appearance.isDark() : localStorage.getItem("aj_dark") === "1";
    // Record what was resolved, so the pre-paint script in index.html opens the
    // next launch on the same theme instead of flashing the other one.
    try { localStorage.setItem("aj_dark", dark ? "1" : "0"); } catch {}
    document.documentElement.dataset.experience = "salon";
    SalonTheme.apply(settings, { dark });
    window.SalonShortcut?.configure();
  }

  async function checkPhone(phone) { return rpc("auth_check_phone", { p_phone: phone }); }
  async function setPassword(phone, pass) {
    const r = await rpc("auth_set_password", { p_phone: phone, p_password: pass });
    saveToken(r.token); App.user = r; App.guest = false; localStorage.removeItem(guestKey()); return r;
  }
  async function register(phone, name, pass) {
    const r = await rpc("auth_register", { p_phone: phone, p_name: name, p_password: pass });
    saveToken(r.token); App.user = r; App.guest = false; localStorage.removeItem(guestKey());
    await loadContext();
    return r;
  }
  async function login(phone, pass) {
    const r = await rpc("auth_login", { p_phone: phone, p_password: pass });
    saveToken(r.token); App.user = r; App.guest = false; localStorage.removeItem(guestKey()); return r;
  }
  async function logout() {
    // 2.30: signing out of the Salonieer account signs out of every salon.
    if (window.Account?.signedIn()) return Account.logout();
    // Session invalidation also blocks tenant delivery. Best-effort device
    // unbinding keeps logout usable when the device is temporarily offline.
    try { await window.Push?.unbind(false); } catch {}
    if (App.token) { try { await rpc("auth_logout", { p_token: App.token }); } catch {} }
    // Recent choices and unfinished bookings belong to the person, not the phone.
    try { window.Smart?.memory.clear(); } catch {}
    clearToken(); App.user = null; App.userSettings = null; App.team = null; App.unread = 0;
    App.guest = false;
    window.rpcCacheBust?.();
    try { localStorage.removeItem(profileKey()); } catch {}
    // Nothing of this salon's account stays on the phone: cached reads,
    // settings, alerts already shown, and pushes still on their way.
    try { window.Platform?.purgeSalon?.(Shop.slug(), { signOut: true }); } catch {}
    try { window.Push?.forgetOnDevice?.(Shop.slug()); window.Push?.reportScope?.(""); } catch {}
  }
  function homeRoute() { return "#/home"; }
  // 2.32: a new name shows everywhere at once and survives a restart. The
  // profile copy kept for instant start-up used to keep the old name (the
  // greeting read it until the server answered), and cached reads that carry
  // the name (customer lists, bookings) are dropped.
  function updateName(name) {
    if (!name) return;
    if (App.user) App.user.name = name;
    rememberProfile();
    window.rpcCacheBust?.();
  }
  // The name a person is greeted with: their Salonieer account name when they
  // use one (the same in every salon), otherwise this salon's record.
  function displayName() {
    const acc = window.Account?.signedIn?.() ? window.Account.account?.() : null;
    return (acc && acc.name) || App.user?.name || "";
  }

  return {
    loadContext, primeFromCache, applyTheme, role, isAdmin, team, can, isStaff, isLoggedIn, isGuest, continueAsGuest,
    checkPhone, setPassword, register, login, logout, homeRoute, saveToken, clearToken, updateName, displayName,
  };
})();
window.Auth = Auth;

// =====================================================================
//  AUTH PAGES — split screen: salon photo + form
// =====================================================================
const AuthPages = (() => {

  function frame(inner) {
    const s = App.settings || {};
    return `<div class="auth">
      <div class="auth-form">
        <div class="auth-box">
          <div class="auth-brand">
            ${UI.logoImg("","شعار "+(s.app_name||"العمل"),{size:82})}
            <h1>${UI.esc(s.app_name || "METON")}</h1>
          </div>
          ${window.Platform ? `<button class="btn line sm" data-nav="#/salons" style="margin:0 auto 14px;width:auto;min-width:130px">${UI.icon("grid",15)} أعمالي</button>` : ""}
          ${window.Lang?.selector?.() || ""}
          ${inner}
        </div>
      </div>
    </div>`;
  }
  function render(inner) {
    const v = document.getElementById("view");
    v.classList.add("no-nav");
    v.innerHTML = `<div class="page" style="padding:0">${frame(inner)}</div>`;
    document.getElementById("navhost").innerHTML = "";
    window.Lang?.wireSelector?.();
  }

  // Step 1 — phone
  function phonePage() {
    render(`
      <h2 class="auth-head">تسجيل الدخول</h2>
      <p class="muted" style="text-align:center;margin:0">أدخل رقم هاتفك للمتابعة</p>
      <div class="field">
        <label>رقم الهاتف</label>
        <input id="aj-phone" class="input" type="tel" inputmode="tel" placeholder="05XXXXXXXX" dir="ltr" style="text-align:right">
      </div>
      <div id="err" class="form-error"></div>
      <button id="next" class="btn">متابعة</button>
      <div class="auth-or"><i></i><span>أو</span><i></i></div>
      <button id="reg" class="btn line">إنشاء حساب جديد</button>
      ${Platform.current()?.slug === "demo001" ? `<p class="tiny review-demo-hint">${Lang.t("لعرض أدوات الإدارة، سجّل الدخول بحساب العمل التجريبي. للضيوف واجهة العميل فقط.")}</p><button id="guest-continue" class="btn line" type="button">${Lang.t("المتابعة كضيف")}</button>` : ""}
      <p class="terms-note">بالمتابعة فإنك توافق على <a data-nav="#/terms">الشروط والأحكام</a> · <a data-nav="#/privacy">${Lang.t("سياسة الخصوصية")}</a></p>`);

    document.getElementById("guest-continue")?.addEventListener("click", () => Auth.continueAsGuest());

    const phone = document.getElementById("aj-phone");
    const err = document.getElementById("err");
    document.getElementById("reg").onclick = () => {
      const v = (phone && phone.value || "").trim();
      Router.go("#/register" + (/^[0-9]{6,15}$/.test(v) ? "?phone=" + encodeURIComponent(v) : ""));
    };
    document.getElementById("next").onclick = async () => {
      const v = (phone && phone.value || "").trim();
      err.textContent = "";
      if (!/^[0-9]{6,15}$/.test(v)) { err.textContent = "أدخل رقم هاتف صحيح"; return; }
      UI.busy("next", true);
      try {
        const status = await Auth.checkPhone(v);
        if (status === "not_found")
          // anyone can register themselves now — take them straight there
          Router.go("#/register?phone=" + encodeURIComponent(v));
        else if (status === "disabled")
          err.textContent = "هذا الحساب موقوف. تواصل مع الإدارة.";
        else if (status === "needs_password")
          Router.go("#/create-password?phone=" + encodeURIComponent(v));
        else
          Router.go("#/password?phone=" + encodeURIComponent(v));
      } catch (e) { err.textContent = e.message; }
      finally { UI.busy("next", false); }
    };
    phone.addEventListener("keydown", e => { if (e.key === "Enter") document.getElementById("next").click(); });
    phone.focus();
  }

  // Register — full name + phone + strong password, all validated live
  function registerPage(params) {
    render(`
      <h2 class="auth-head">إنشاء حساب جديد</h2>
      <p class="muted" style="text-align:center;margin:0">أدخل بياناتك</p>
      <div class="field">
        <label>الاسم الكامل</label>
        <input id="r-name" class="input" type="text" placeholder="الاسم الكامل" autocomplete="name">
      </div>
      <div class="field">
        <label>رقم الهاتف</label>
        <input id="r-phone" class="input" type="tel" inputmode="tel" placeholder="05XXXXXXXX"
               dir="ltr" style="text-align:right" value="${UI.esc(params.phone || "")}">
      </div>
      <div class="field"><label>كلمة المرور</label>${passInput("r-p1", "٨ أحرف على الأقل، حرف ورقم")}</div>
      <ul class="pw-rules" id="rules">
        <li data-r="len">٨ أحرف على الأقل</li>
        <li data-r="letter">تحتوي حرفاً</li>
        <li data-r="digit">تحتوي رقماً</li>
      </ul>
      <div class="field"><label>تأكيد كلمة المرور</label>${passInput("r-p2", "أعد إدخال كلمة المرور")}</div>
      <div id="err" class="form-error"></div>
      <button id="go" class="btn">إنشاء الحساب</button>
      <p class="terms-note">لديك حساب؟ <a data-nav="#/auth">تسجيل الدخول</a></p>`);
    wireEyes();

    const err = document.getElementById("err");
    const p1 = document.getElementById("r-p1");
    const rules = document.getElementById("rules");
    // live strength feedback so the person isn't guessing
    const paint = () => {
      const v = p1.value || "";
      const ok = { len: v.length >= 8, letter: /[A-Za-z\u0600-\u06FF]/.test(v), digit: /[0-9]/.test(v) };
      rules.querySelectorAll("li").forEach(li => li.classList.toggle("ok", !!ok[li.dataset.r]));
    };
    p1.addEventListener("input", paint); paint();

    document.getElementById("go").onclick = async () => {
      const name = val("r-name").trim().replace(/\s+/g, " ");
      const phone = val("r-phone").trim();
      const a = val("r-p1"), b = val("r-p2");
      err.textContent = "";
      if (name.split(" ").filter(Boolean).length < 2) { err.textContent = "أدخل الاسم الكامل (الاسم واسم العائلة)"; return; }
      if (/[0-9]/.test(name)) { err.textContent = "الاسم لا يجب أن يحتوي أرقاماً"; return; }
      if (!/^[0-9]{9,15}$/.test(phone)) { err.textContent = "أدخل رقم هاتف صحيح"; return; }
      if (a.length < 8) { err.textContent = "كلمة المرور يجب أن تكون ٨ أحرف على الأقل"; return; }
      if (!/[A-Za-z\u0600-\u06FF]/.test(a)) { err.textContent = "كلمة المرور يجب أن تحتوي حرفاً"; return; }
      if (!/[0-9]/.test(a)) { err.textContent = "كلمة المرور يجب أن تحتوي رقماً"; return; }
      if (a !== b) { err.textContent = "كلمتا المرور غير متطابقتين"; return; }
      UI.busy("go", true);
      try {
        await Auth.register(phone, name, a);
        if (!window.Push?.openPending() && !window.BookingIntent?.resume()) Router.go(Auth.homeRoute());
      } catch (e) { err.textContent = e.message; }
      finally { UI.busy("go", false); }
    };
  }

  // Step 2 — create password
  function createPasswordPage(params) {
    const phone = params.phone || "";
    render(`
      <h2 class="auth-head">إنشاء كلمة المرور</h2>
      <p class="muted" style="text-align:center;margin:0" dir="ltr">${UI.esc(phone)}</p>
      <div class="field"><label>كلمة المرور</label>${passInput("p1", "٦ أحرف على الأقل")}</div>
      <div class="field"><label>تأكيد كلمة المرور</label>${passInput("p2", "أعد إدخال كلمة المرور")}</div>
      <div id="err" class="form-error"></div>
      <button id="go" class="btn">تأكيد وإنشاء الحساب</button>
      <p class="terms-note"><a data-nav="#/auth">تغيير رقم الهاتف</a></p>`);
    wireEyes();
    const err = document.getElementById("err");
    document.getElementById("go").onclick = async () => {
      const p1 = val("p1"), p2 = val("p2"); err.textContent = "";
      if (p1.length < 6) { err.textContent = "كلمة المرور يجب أن تكون 6 أحرف على الأقل"; return; }
      if (p1 !== p2) { err.textContent = "كلمتا المرور غير متطابقتين"; return; }
      UI.busy("go", true);
      try { await Auth.setPassword(phone, p1); UI.toast("تم إنشاء حسابك", "ok"); afterLogin(); }
      catch (e) { err.textContent = e.message; UI.busy("go", false); }
    };
  }

  // Step 3 — login
  function passwordPage(params) {
    const phone = params.phone || "";
    render(`
      <h2 class="auth-head">تسجيل الدخول</h2>
      <p class="muted" style="text-align:center;margin:0" dir="ltr">${UI.esc(phone)}</p>
      <div class="field"><label>كلمة المرور</label>${passInput("p1", "أدخل كلمة المرور")}</div>
      <div id="err" class="form-error"></div>
      <button id="go" class="btn">تسجيل الدخول</button>
      <p class="terms-note"><a data-nav="#/auth">تغيير رقم الهاتف</a></p>`);
    wireEyes();
    const err = document.getElementById("err");
    const go = document.getElementById("go");
    go.onclick = async () => {
      const p1 = val("p1"); err.textContent = "";
      if (!p1) { err.textContent = "أدخل كلمة المرور"; return; }
      UI.busy("go", true);
      try { await Auth.login(phone, p1); afterLogin(); }
      catch (e) { err.textContent = e.message; UI.busy("go", false); }
    };
    const p = document.getElementById("p1");
    p.addEventListener("keydown", e => { if (e.key === "Enter") go.click(); });
    p.focus();
  }

  async function afterLogin() {
    // Reads cached while signed out (or as someone else) never show after sign-in.
    window.rpcCacheBust?.(); App.unread = 0;
    await (UI.withLoader ? UI.withLoader("جارٍ تسجيل الدخول…", () => Auth.loadContext(), { delay: 250 }) : Auth.loadContext());
    if (!window.Push?.openPending() && !window.BookingIntent?.resume()) Router.go(Platform.current()?.slug === "demo001" && Auth.isAdmin() ? "#/admin" : Auth.homeRoute());
    setTimeout(()=>window.Push?.promptOnEntry?.(),900);
    window.Tours?.maybeStart();
  }

  function passInput(id, ph) {
    return `<div class="input-icon">
      <input id="${id}" class="input" type="password" placeholder="${ph}">
      <span class="ic btn-eye" data-eye="${id}">${UI.icon("eye", 18)}</span>
    </div>`;
  }
  function wireEyes() {
    document.querySelectorAll("[data-eye]").forEach(el => {
      el.onclick = () => {
        const inp = document.getElementById(el.getAttribute("data-eye"));
        const show = inp.type === "password";
        inp.type = show ? "text" : "password";
        el.innerHTML = UI.icon(show ? "eyeoff" : "eye", 18);
      };
    });
  }
  const val = id => { const el = document.getElementById(id); return el && el.value != null ? el.value : ""; };

  return { phonePage, registerPage, createPasswordPage, passwordPage };
})();
window.AuthPages = AuthPages;
