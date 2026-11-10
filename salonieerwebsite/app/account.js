// account.js — 2.30: one Salonieer account for every salon.
// A Salonieer account is a phone number (E.164) + password kept by the
// platform. Every salon still has its own private customer record; opening a
// salon with the account gives this device that salon's ordinary session
// (aj_token:<slug>), so the rest of the app is unchanged. Numbers are NOT
// verified (no OTP), so nothing is ever linked or recovered by the number
// alone: a salon record that already exists is linked only with that salon's
// own password or a session this device already holds.
window.Account = (() => {
  "use strict";
  const KEY = "salonieer:account:v1";
  const PROFILE = "salonieer:account-profile:v1";
  const GUEST = "salonieer:guest:v1";
  const COUNTRY = "salonieer:phone-country:v1";
  const E = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const T = (s) => (window.Lang ? Lang.t(s) : s);
  const read = (k) => { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch { return null; } };
  const write = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch {} };

  let token = read(KEY)?.token || null;
  let profile = read(PROFILE);            // { account, salons }
  const linkState = new Map();            // slug -> link_required answer
  const blockedState = new Map();         // slug -> "suspended at this salon" message
  const phoneState = new Set();           // 2.46: slugs that wait for this account's phone number

  // ---- server ---------------------------------------------------------------
  async function api(fn, args = {}) {
    const client = window.platformSb;
    if (!client) throw new Error(T("تعذّر الاتصال — تحقق من الإنترنت وحاول مجدداً"));
    const { data, error } = await client.rpc(fn, args);
    if (error) {
      const msg = error.message || "";
      const net = /failed to fetch|network|load failed|aborterror|timeout/i.test(msg);
      const e = new Error(net ? T("تعذّر الاتصال — تحقق من الإنترنت وحاول مجدداً") : Lang.error(msg));
      e.rawMessage = msg; e.network = net; throw e;
    }
    if (data && typeof data === "object" && !Array.isArray(data) && data.error) {
      if (data.code === "session_expired") forgetSession();
      const e = new Error(Lang.error(data.error)); e.code = data.code; e.rawMessage = data.error; throw e;
    }
    return data;
  }

  function saveSession(answer) {
    token = answer.token;
    write(KEY, { token });
    setProfile({ account: answer.account, salons: answer.salons || [], waiting: answer.waiting || [] });
    setGuest(false);
  }
  function forgetSession() { token = null; profile = null; write(KEY, null); write(PROFILE, null); linkState.clear(); }
  function setProfile(p) {
    // 2.46: waiting = businesses given to this account that wait for its phone number.
    profile = p && p.account ? { account: p.account, salons: Array.isArray(p.salons) ? p.salons : (profile?.salons || []),
      waiting: Array.isArray(p.waiting) ? p.waiting : (profile?.waiting || []) } : null;
    write(PROFILE, profile);
    // The device's salon list mirrors the account's My Salons; a list on screen repaints.
    if (profile && window.Platform?.adoptAccountSalons) Platform.adoptAccountSalons(profile.salons);
    try { document.dispatchEvent(new CustomEvent("salonieer:my-salons")); } catch {}
  }
  // 2.41: adding / removing a salon and reading the list can cross on a slow
  // network. A list read that started before (or while) a change was on its
  // way must not overwrite it — the change's own answer carries the newest list.
  let changes = 0, changeEpoch = 0;
  async function changing(work) {
    changes++; changeEpoch++;
    try { return await work(); } finally { changes--; changeEpoch++; }
  }
  const signedIn = () => !!token;
  const isGuest = () => !token && localStorage.getItem(GUEST) === "1";
  function setGuest(on) { try { on ? localStorage.setItem(GUEST, "1") : localStorage.removeItem(GUEST); } catch {} }

  async function refresh() {
    if (!token) return null;
    const at = changeEpoch;
    try {
      const me = await api("salonieer_account_me_v1", { p_token: token });
      if (changes || at !== changeEpoch) return profile;   // a change crossed this read: its answer is newer
      setProfile(me); return me;
    }
    catch (e) { if (e.network) return profile; throw e; }
  }

  // Salons this device was signed in to before (older versions signed in per
  // salon): linked to the account by their own session, nothing typed.
  async function adoptDeviceSessions() {
    const saved = window.Platform?.saved?.() || [];
    let changed = false;
    for (const s of saved) {
      const salonToken = localStorage.getItem("aj_token:" + s.slug);
      if (salonToken && salonToken.length === 64) {
        try { await api("salonieer_account_link_session_v1", { p_token: token, p_slug: s.slug, p_salon_token: salonToken }); changed = true; } catch {}
      }
      if (!(profile?.salons || []).some((x) => x.slug === s.slug)) {
        try { await api("salonieer_account_add_salon_v1", { p_token: token, p_code: s.slug, p_source: "visit" }); changed = true; } catch {}
      }
    }
    if (changed) await refresh().catch(() => {});
  }

  // 2.46: one METON account for the app and the website. It signs in with the email address or the phone number linked
  // to it, always with its password; what it can open comes from its businesses and roles (nobody picks "customer" or
  // "business" first). A database before 2.46 has only phone sign-in: the older calls answer then.
  const SITE = "https://www.meton.work";
  const missing = (e) => e?.code === "PGRST202" || /could not find the function|does not exist/i.test(e?.rawMessage || "");
  // Codes go out from the website's mail worker; asking it to send now only sends what is already queued.
  const kick = () => { try { fetch(SITE + "/api/outbox/kick", { mode: "no-cors", cache: "no-store" }).catch(() => {}); } catch {} };
  // 2.41: the person's gender (male / female) is chosen when the account is made.
  async function register({ method = "phone", identifier, phone, dial, country, name, password, gender }) {
    const id = identifier || phone;
    let r;
    try {
      r = await api("salonieer_account_register_v3", { p_method: method, p_identifier: id, p_dial: dial || "", p_country: country || "", p_name: name,
        p_password: password, p_gender: gender, p_lang: Lang.get() });
    } catch (e) {
      if (!missing(e) || method !== "phone") throw e;
      r = await api("salonieer_account_register_v2", { p_phone: id, p_dial: dial, p_country: country, p_name: name, p_password: password, p_gender: gender });
    }
    saveSession(r);
    if (r.confirm_email) kick();
    await adoptDeviceSessions();
    return r;
  }
  // Signing in as somebody else on this phone: nothing of the previous person's salon sessions may carry over.
  async function signedInWith(r) {
    const previous = read(PROFILE)?.account?.id;
    if (previous && previous !== r.account?.id) await dropSalonSessions();
    saveSession(r);
    await adoptDeviceSessions();
  }
  // {status:'confirm_email', ticket, email}: an email that was never confirmed is confirmed once with a code first.
  async function login({ identifier, phone, dial, password }) {
    const id = identifier || phone;
    let r;
    try { r = await api("salonieer_account_login_v2", { p_identifier: id, p_password: password, p_dial: dial || "", p_lang: Lang.get() }); }
    catch (e) {
      if (!missing(e) || String(id).includes("@")) throw e;
      r = await api("salonieer_account_login_v1", { p_phone: id, p_dial: dial, p_password: password });
    }
    if (r.status === "confirm_email") { kick(); return r; }
    await signedInWith(r);
    return r;
  }
  async function loginConfirm(ticket, code) {
    const r = await api("salonieer_account_login_confirm_v1", { p_ticket: ticket, p_code: code });
    await signedInWith(r);
    return r;
  }

  // Ends every salon session this device holds (server + device data).
  async function dropSalonSessions() {
    const saved = window.Platform?.saved?.() || [];
    await Promise.allSettled(saved.map((s) => Platform.leaveSalon(s.slug, { signOut: true })));
  }
  async function logout() {
    const t = token;
    try { await window.Push?.unbind?.(false); } catch {}
    await dropSalonSessions();
    if (t) { try { await api("salonieer_account_logout_v1", { p_token: t }); } catch {} }
    forgetSession(); setGuest(false);
    try { window.Smart?.memory.clear(); } catch {}
    window.rpcCacheBust?.();
    restart();
  }
  function restart() {
    try { sessionStorage.setItem("salonieer:force-picker", "1"); } catch {}
    location.replace(location.pathname + location.search);
  }

  async function addSalon(code, source = "code") {
    if (!token) return null;
    return changing(async () => {
      const r = await api("salonieer_account_add_salon_v1", { p_token: token, p_code: code, p_source: source });
      setProfile({ account: profile?.account, salons: r.salons });
      return r.salon;
    });
  }
  async function removeSalon(slug) {
    if (!token) return;
    return changing(async () => {
      const r = await api("salonieer_account_remove_salon_v1", { p_token: token, p_slug: slug });
      setProfile({ account: profile?.account, salons: r.salons });
    });
  }
  const owns = (slug) => !!(profile?.salons || []).find((s) => s.slug === slug && s.owned);

  // A session for one salon: the one this device already has, or a new one
  // from the account. Returns {token} | {link_required} | null.
  async function ensureSalonSession(slug, { force = false } = {}) {
    if (!token || !slug) return null;
    const existing = localStorage.getItem("aj_token:" + slug);
    if (existing && !force) return { token: existing };
    const salon = window.Platform?.current?.();
    if (salon && salon.slug === slug && salon.supabase_url) return null; // salons on their own server keep their own sign-in
    try {
      const r = await api("salonieer_account_enter_salon_v1", { p_token: token, p_slug: slug });
      if (r.status === "ok") {
        localStorage.setItem("aj_token:" + slug, r.session.token);
        linkState.delete(slug); blockedState.delete(slug);
        if (r.created) refresh().catch(() => {});
        return { token: r.session.token, session: r.session };
      }
      if (r.status === "link_required") { linkState.set(slug, r); return { link_required: true, ...r }; }
    } catch (e) {
      if (e.network) return null;
      // 2.46: an account made with an email adds a phone number before it opens a business (businesses reach people by phone).
      if (e.code === "phone_required") { phoneState.add(slug); return { phone_required: true }; }
      // 2.41: the salon blocked this person — the salon opens to browse, with that said instead of "sign in".
      if (e.code === "disabled") blockedState.set(slug, e.message);
      if (["disabled", "salon_rule", "unavailable"].includes(e.code)) return { error: e.message, code: e.code };
      throw e;
    }
    return null;
  }
  const linkRequired = (slug) => linkState.get(slug) || null;
  const blockedHere = (slug) => blockedState.get(slug) || "";
  const phoneRequired = (slug) => phoneState.has(slug);

  async function linkSalon(slug, password) {
    const r = await api("salonieer_account_link_salon_v1", { p_token: token, p_slug: slug, p_password: password });
    if (r.status === "ok") { localStorage.setItem("aj_token:" + slug, r.session.token); linkState.delete(slug); refresh().catch(() => {}); }
    return r;
  }

  // ---- phone numbers ----------------------------------------------------------
  const digitsMap = { "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4", "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
    "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4", "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9" };
  const latinDigits = (s) => String(s || "").replace(/[٠-٩۰-۹]/g, (d) => digitsMap[d]);
  const TZ = { "Asia/Hebron": "PS", "Asia/Gaza": "PS", "Asia/Jerusalem": "IL", "Asia/Tel_Aviv": "IL", "Asia/Amman": "JO", "Asia/Beirut": "LB",
    "Asia/Damascus": "SY", "Africa/Cairo": "EG", "Asia/Riyadh": "SA", "Asia/Dubai": "AE", "Asia/Qatar": "QA", "Asia/Kuwait": "KW",
    "Asia/Bahrain": "BH", "Asia/Muscat": "OM", "Asia/Baghdad": "IQ", "Europe/Istanbul": "TR", "Africa/Casablanca": "MA", "Africa/Tunis": "TN", "Africa/Algiers": "DZ" };
  let countryCache = null, countryLang = "";
  function countries() {
    const L = window.libphonenumber;
    const lang = Lang.get();
    if (countryCache && countryLang === lang) return countryCache;
    let names = null;
    try { names = new Intl.DisplayNames([lang, "en"], { type: "region" }); } catch {}
    let en = null; try { en = new Intl.DisplayNames(["en"], { type: "region" }); } catch {}
    const list = (L ? L.getCountries() : ["PS", "IL", "JO"]).map((iso) => {
      let dial = ""; try { dial = L ? L.getCountryCallingCode(iso) : { PS: "970", IL: "972", JO: "962" }[iso]; } catch {}
      return { iso, dial: String(dial), name: (names && names.of(iso)) || iso, en: (en && en.of(iso)) || iso };
    }).filter((c) => c.dial);
    list.sort((a, b) => a.name.localeCompare(b.name, lang));
    countryCache = list; countryLang = lang;
    return list;
  }
  function guessCountry() {
    const saved = localStorage.getItem(COUNTRY);
    const valid = (iso) => iso && countries().some((c) => c.iso === iso);
    if (valid(saved)) return saved;
    // The time zone says where the phone is; a language region is often just
    // the default (en-US) and comes second.
    try { const tz = Intl.DateTimeFormat().resolvedOptions().timeZone; if (valid(TZ[tz])) return TZ[tz]; } catch {}
    for (const tag of navigator.languages || [navigator.language || ""]) {
      const region = String(tag).split(/[-_]/)[1];
      if (region && /^[A-Za-z]{2}$/.test(region) && valid(region.toUpperCase())) return region.toUpperCase();
    }
    return "PS";
  }
  const flag = (iso) => String.fromCodePoint(...iso.toUpperCase().split("").map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
  function example(iso) {
    try { return window.libphonenumber.getExampleNumber(iso, window.PHONE_EXAMPLES).formatNational(); } catch { return ""; }
  }
  // Valid number → { e164, dial, country } (E.164 per libphonenumber); null otherwise.
  function parse(raw, iso) {
    const L = window.libphonenumber;
    let v = latinDigits(raw).trim().replace(/^00/, "+");
    if (!v) return null;
    try {
      const p = v.startsWith("+") ? L.parsePhoneNumberFromString(v) : L.parsePhoneNumberFromString(v, iso);
      if (!p || !p.isValid()) return null;
      return { e164: p.number, dial: String(p.countryCallingCode), country: p.country || iso };
    } catch { return null; }
  }

  // <phone field>: country button (searchable list) + number input. The
  // placeholder is that country's example number — only a hint, never a value.
  function phoneField(id, label, auto = "tel-national") {
    const iso = guessCountry();
    const c = countries().find((x) => x.iso === iso);
    return `<div class="field acc-phone-field"><label for="${id}">${E(T(label))}</label>
      <div class="acc-phone" dir="ltr">
        <button type="button" class="acc-cc" id="${id}-cc" data-iso="${E(iso)}" aria-label="${E(T("اختر الدولة"))}">
          <span class="acc-flag" aria-hidden="true">${flag(iso)}</span><bdi>+${E(c?.dial || "")}</bdi>${UI.icon("down", 14)}</button>
        <input id="${id}" name="${auto === "username" ? "username" : "tel"}" class="input" type="tel" inputmode="tel" autocomplete="${auto}" dir="ltr" placeholder="${E(example(iso))}" data-i18n-skip>
      </div></div>`;
  }
  function wirePhone(id) {
    const btn = document.getElementById(id + "-cc"), input = document.getElementById(id);
    if (!btn || !input) return () => null;
    const apply = (iso) => {
      const c = countries().find((x) => x.iso === iso); if (!c) return;
      btn.dataset.iso = iso;
      btn.innerHTML = `<span class="acc-flag" aria-hidden="true">${flag(iso)}</span><bdi>+${E(c.dial)}</bdi>${UI.icon("down", 14)}`;
      input.placeholder = example(iso);
    };
    btn.onclick = () => countryPicker(btn.dataset.iso, (iso) => { apply(iso); try { localStorage.setItem(COUNTRY, iso); } catch {} input.focus(); });
    // A number typed with its +code picks the country by itself.
    input.addEventListener("blur", () => {
      const p = parse(input.value, btn.dataset.iso);
      if (p && p.country && p.country !== btn.dataset.iso && /^\s*(\+|00)/.test(latinDigits(input.value))) apply(p.country);
    });
    const read = () => {
      const p = parse(input.value, btn.dataset.iso);
      if (p) try { localStorage.setItem(COUNTRY, p.country || btn.dataset.iso); } catch {}
      return p;
    };
    // An existing number goes in as its country + its national number — never "+970…" beside the "+970" button.
    read.set = (e164) => {
      const v = String(e164 || ""); if (!v) return;
      try {
        const p = window.libphonenumber?.parsePhoneNumberFromString(v);
        if (p && p.isValid()) { if (p.country) apply(p.country); input.value = p.formatNational(); return; }
      } catch {}
      input.value = v;
    };
    return read;
  }
  // One way to SHOW a phone number: international format (+970 59 912 3456), isolated left-to-right so the "+" stays
  // on the left inside Arabic and Hebrew text (works in plain text too).
  function fmtPhone(e164) {
    const v = String(e164 || "").trim(); if (!v) return "";
    let out = v;
    try { const p = window.libphonenumber?.parsePhoneNumberFromString(v); if (p) out = p.formatInternational(); } catch {}
    // Palestinian mobiles as the owner writes them: +970 59 XXX XXXX (the library groups them 3-3-3).
    const ps = v.replace(/[^\d+]/g, "").match(/^\+970(5\d)(\d{3})(\d{4})$/);
    if (ps) out = `+970 ${ps[1]} ${ps[2]} ${ps[3]}`;
    return "⁦" + out + "⁩";
  }
  function countryPicker(current, onPick) {
    const list = countries();
    const row = (c) => `<button type="button" class="acc-country ${c.iso === current ? "on" : ""}" data-iso="${c.iso}">
      <span class="acc-flag" aria-hidden="true">${flag(c.iso)}</span><span class="acc-country-name" data-i18n-skip>${E(c.name)}</span><bdi dir="ltr">+${E(c.dial)}</bdi></button>`;
    // The picker stacks above an open sheet instead of replacing it.
    const host = document.createElement("div");
    host.className = "modal-bg acc-picker-bg";
    host.innerHTML = `<div class="modal acc-picker" role="dialog" aria-modal="true" aria-label="${E(T("اختر الدولة"))}">
      <h3>${E(T("اختر الدولة"))}</h3>
      <label class="studio-search">${UI.icon("search", 18)}<input id="acc-country-q" placeholder="${E(T("ابحث باسم الدولة أو الرمز"))}" autocomplete="off" enterkeyhint="search"></label>
      <div class="acc-country-list" id="acc-country-list">${list.map(row).join("")}</div>
      <button type="button" class="btn line" id="acc-country-close">${E(T("إغلاق"))}</button></div>`;
    document.body.appendChild(host);
    const close = () => host.remove();
    host.addEventListener("click", (e) => { if (e.target === host) close(); });
    host.querySelector("#acc-country-close").onclick = close;
    const box = host.querySelector("#acc-country-list");
    const wire = () => box.querySelectorAll("[data-iso]").forEach((b) => b.onclick = () => { close(); onPick(b.dataset.iso); });
    wire();
    const q = host.querySelector("#acc-country-q");
    q.oninput = () => {
      const v = latinDigits(q.value).trim().toLowerCase().replace(/^\+/, "");
      const hits = !v ? list : list.filter((c) => c.name.toLowerCase().includes(v) || c.en.toLowerCase().includes(v) || c.iso.toLowerCase() === v || c.dial.startsWith(v));
      box.innerHTML = hits.length ? hits.map(row).join("") : `<p class="muted acc-empty">${E(T("لا توجد نتائج"))}</p>`;
      wire();
    };
    setTimeout(() => { q.focus(); box.querySelector(".on")?.scrollIntoView({ block: "center" }); }, 30);
  }

  // ---- shared form bits --------------------------------------------------------
  function passField(id, label, placeholder, auto) {
    return `<div class="field"><label for="${id}">${E(T(label))}</label><div class="input-icon">
      <input id="${id}" name="${auto === "new-password" && id.endsWith("2") ? "password-confirm" : "password"}" class="input" type="password" maxlength="128" autocomplete="${auto}" autocapitalize="off" spellcheck="false" placeholder="${E(T(placeholder))}" dir="auto">
      <span class="ic btn-eye" data-acc-eye="${id}" role="button" tabindex="0" aria-label="${E(T("إظهار كلمة المرور"))}">${UI.icon("eye", 18)}</span></div></div>`;
  }
  function wireEyes(root = document) {
    root.querySelectorAll("[data-acc-eye]").forEach((el) => {
      const toggle = () => {
        const inp = document.getElementById(el.dataset.accEye); if (!inp) return;
        const show = inp.type === "password"; inp.type = show ? "text" : "password";
        el.innerHTML = UI.icon(show ? "eyeoff" : "eye", 18);
      };
      el.onclick = toggle; el.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); } };
    });
  }
  // Male / female, as two radio tiles (also used on the account page).
  // titled: the sheet's heading already says it, so the legend is for screen readers only.
  function genderField(name, value, titled) {
    const opt = (v, label) => `<label><input type="radio" name="${name}" value="${v}"${value === v ? " checked" : ""}><span>${E(T(label))}</span></label>`;
    return `<fieldset class="field acc-gender${titled ? " is-titled" : ""}"><legend>${E(T("الجنس"))}</legend>
      <div class="acc-gender-opts">${opt("male", "ذكر")}${opt("female", "أنثى")}</div></fieldset>`;
  }
  const genderValue = (name) => document.querySelector(`input[name="${name}"]:checked`)?.value || "";
  // 2.46: the website's rule for every new password (the account is the same there); the server also refuses common ones.
  const passwordProblem = (p) => !p || p.length < 10 || p.length > 128 ? "كلمة المرور يجب أن تكون من 10 إلى 128 حرفاً" : "";
  const validEmail = (v) => /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(v);
  const LOGIN_BY = "salonieer:login-by:v1";
  const loginBy = () => { try { return localStorage.getItem(LOGIN_BY) === "email" ? "email" : "phone"; } catch { return "phone"; } };
  const rememberBy = (by) => { try { localStorage.setItem(LOGIN_BY, by); } catch {} };
  // Phone | Email: how this person signs in (or proves another account). Never "customer" or "business".
  function byTabs(by, label = "تسجيل الدخول باستخدام") {
    return `<div class="seg acc-by" role="group" aria-label="${E(T(label))}">${[["phone", "phone", "الهاتف"], ["email", "mail", "البريد الإلكتروني"]].map(([k, ic, l]) =>
      `<button type="button" data-acc-by="${k}" class="${by === k ? "on" : ""}" aria-pressed="${by === k}">${UI.icon(ic, 15)} ${E(T(l))}</button>`).join("")}</div>`;
  }
  function emailField(id, value = "", auto = "username") {
    // 2.48: "username" lets Samsung Pass / iCloud Keychain pair the address with the password (sign-in and sign-up).
    return `<div class="field"><label for="${id}">${E(T("البريد الإلكتروني"))}</label><input id="${id}" name="username" class="input" type="email" inputmode="email" autocomplete="${auto}" autocapitalize="off" spellcheck="false" dir="ltr" maxlength="254" placeholder="name@example.com" value="${E(value)}" data-i18n-skip></div>`;
  }
  const codeInput = (id) => `<div class="field"><label for="${id}">${E(T("الرمز"))}</label><input id="${id}" class="input" inputmode="numeric" autocomplete="one-time-code" maxlength="6" dir="ltr"></div>`;
  const digits6 = (el) => { if (el) el.addEventListener("input", () => { el.value = latinDigits(el.value).replace(/\D/g, "").slice(0, 6); }); };
  const nameProblem = (n) => !n ? "أدخل الاسم الكامل" : n.split(" ").filter(Boolean).length < 2 ? "أدخل الاسم الكامل (الاسم واسم العائلة)"
    : n.length > 60 ? "الاسم يجب أن يكون بين 5 و 60 حرفاً" : /[0-9٠-٩]/.test(n) ? "الاسم لا يجب أن يحتوي أرقاماً" : "";
  const joinUrl = () => (window.Rework?.joinUrl ? Rework.joinUrl() : "https://www.meton.work/plans?lang=" + encodeURIComponent(Lang.get()));

  // ---- screens -------------------------------------------------------------------
  // Each screen draws into the launcher frame (Platform.gate) and calls
  // done() once the person is signed in or chose to continue as a guest.
  function gate(title, subtitle, inner) { Platform.gate(title, subtitle, inner); }

  function welcome(done) {
    gate("مرحباً بك في METON", "احجز موعدك في عملك المفضل بسهولة.", `
      <div class="acc-welcome">
        <button class="platform-primary" id="acc-go-login" type="button">${UI.icon("user", 19)} ${E(T("تسجيل الدخول"))}</button>
        <div class="acc-pair">
          <button class="platform-secondary" id="acc-go-register" type="button">${E(T("إنشاء حساب"))}</button>
          <button class="platform-secondary" id="acc-go-guest" type="button">${E(T("المتابعة كضيف"))}</button>
        </div>
        <a class="acc-join" href="${E(joinUrl())}" target="_blank" rel="noopener" data-join-salon>${UI.icon("scissors", 17)}<span>${E(T("انضم كعمل"))}</span>${UI.icon("fwd", 15)}</a>
        ${Lang.selector()}
      </div>`);
    Platform.setRedraw(() => welcome(done));
    Lang.wireSelector();
    document.getElementById("acc-go-login").onclick = () => loginScreen(done, () => welcome(done));
    document.getElementById("acc-go-register").onclick = () => registerScreen(done, () => welcome(done));
    document.getElementById("acc-go-guest").onclick = () => { setGuest(true); done({ guest: true }); };
  }

  // One sign-in for everyone (customers, owners, team): the account's phone number or email, and its password.
  function loginScreen(done, back) {
    const by = loginBy();
    gate("تسجيل الدخول", "حساب METON واحد للتطبيق والموقع. سجّل الدخول برقم هاتفك أو ببريدك الإلكتروني.", `
      <form class="acc-form" id="acc-login" novalidate>
        ${byTabs(by)}
        ${by === "phone" ? phoneField("acc-phone", "رقم الهاتف", "username") : emailField("acc-email")}
        ${passField("acc-pass", "كلمة المرور", "أدخل كلمة المرور", "current-password")}
        <div class="platform-error" id="acc-err" role="alert"></div>
        <button class="platform-primary" id="acc-submit" type="submit">${E(T("تسجيل الدخول"))}</button>
        <p class="acc-switch"><button type="button" class="platform-link" id="acc-forgot">${E(T("نسيت كلمة المرور؟"))}</button></p>
        <p class="acc-switch">${E(T("ليس لديك حساب؟"))} <button type="button" class="platform-link" id="acc-to-register">${E(T("إنشاء حساب"))}</button></p>
        ${back ? `<button type="button" class="platform-link" id="acc-back">${E(T("رجوع"))}</button>` : ""}
      </form>`);
    Platform.setRedraw(() => loginScreen(done, back));
    const value = by === "phone" ? wirePhone("acc-phone") : null; wireEyes();
    const err = document.getElementById("acc-err"), btn = document.getElementById("acc-submit");
    document.querySelectorAll("[data-acc-by]").forEach((b) => b.onclick = () => {
      if (b.dataset.accBy === by) return;
      const pw = document.getElementById("acc-pass").value;
      rememberBy(b.dataset.accBy); loginScreen(done, back);
      document.getElementById("acc-pass").value = pw;
      document.getElementById(b.dataset.accBy === "phone" ? "acc-phone" : "acc-email")?.focus();
    });
    document.getElementById("acc-to-register").onclick = () => registerScreen(done, back);
    document.getElementById("acc-forgot").onclick = () => forgotScreen(done, () => loginScreen(done, back));
    if (back) document.getElementById("acc-back").onclick = back;
    document.getElementById("acc-login").onsubmit = async (ev) => {
      ev.preventDefault(); err.textContent = "";
      const password = document.getElementById("acc-pass").value;
      let identifier, dial = "";
      if (by === "phone") {
        const phone = value();
        if (!phone) { err.textContent = T("أدخل رقم هاتف صحيح"); return; }
        identifier = phone.e164; dial = phone.dial;
      } else {
        identifier = document.getElementById("acc-email").value.trim().toLowerCase();
        if (!validEmail(identifier)) { err.textContent = T("أدخل بريداً إلكترونياً صحيحاً"); return; }
      }
      if (!password) { err.textContent = T("أدخل كلمة المرور"); return; }
      btn.disabled = true; btn.textContent = T("جارٍ تسجيل الدخول…");
      try {
        const r = await login({ identifier, dial, password });
        if (r.status === "confirm_email") { codeScreen(r, { identifier, dial, password }, done, () => loginScreen(done, back)); return; }
        done({ signedIn: true });
      } catch (e) { err.textContent = e.message; btn.disabled = false; btn.textContent = T("تسجيل الدخول"); }
    };
    setTimeout(() => document.getElementById(by === "phone" ? "acc-phone" : "acc-email")?.focus(), 50);
  }

  // Once per account: an email that signs in but was never confirmed is confirmed with a code before the app opens.
  function codeScreen(first, again, done, back) {
    let ticket = first.ticket;
    gate("أكّد بريدك الإلكتروني", "مرة واحدة فقط: أدخل الرمز الذي أرسلناه إلى بريدك لإكمال تسجيل الدخول.", `
      <form class="acc-form" id="acc-code-form" novalidate>
        <p class="tiny">${E(T("أرسلنا رمزاً من 6 أرقام إلى"))} <bdi dir="ltr">${E(first.email)}</bdi>. ${E(T("صالح لمدة 10 دقائق."))}</p>
        ${codeInput("acc-code")}
        <div class="platform-error" id="acc-err" role="alert"></div>
        <button class="platform-primary" id="acc-submit" type="submit">${E(T("تأكيد وتسجيل الدخول"))}</button>
        <p class="acc-switch"><button type="button" class="platform-link" id="acc-resend">${E(T("إرسال رمز جديد"))}</button></p>
        <button type="button" class="platform-link" id="acc-back">${E(T("رجوع"))}</button>
      </form>`);
    Platform.setRedraw(null);
    const err = document.getElementById("acc-err"), btn = document.getElementById("acc-submit"), code = document.getElementById("acc-code");
    digits6(code);
    document.getElementById("acc-back").onclick = back;
    document.getElementById("acc-resend").onclick = async () => {
      err.textContent = "";
      try { const r = await login(again); if (r.status === "confirm_email") { ticket = r.ticket; UI.toast(T("أرسلنا رمزاً جديداً"), "ok"); } else done({ signedIn: true }); }
      catch (e) { err.textContent = e.message; }
    };
    document.getElementById("acc-code-form").onsubmit = async (ev) => {
      ev.preventDefault(); err.textContent = "";
      const c = code.value.replace(/\D/g, "");
      if (c.length !== 6) { err.textContent = T("أدخل الأرقام الستة للرمز"); return; }
      btn.disabled = true;
      try { await loginConfirm(ticket, c); done({ signedIn: true }); }
      catch (e) { err.textContent = e.message; btn.disabled = false; }
    };
    setTimeout(() => code?.focus(), 50);
  }

  // Forgotten password: a code to the account's email (or its phone, once WhatsApp codes are set up), then a new one.
  function forgotScreen(done, back) {
    // 2.48: two steps after the code is sent — 1) the code is checked; 2) only then the new password and its confirmation.
    let by = loginBy(), stage = "id", target = null, code = "";
    const draw = () => {
      gate("نسيت كلمة المرور", "نرسل رمزاً لتعيين كلمة مرور جديدة. تعمل في التطبيق وعلى الموقع.", `
        <form class="acc-form" id="acc-forgot-form" novalidate>
          ${stage === "id" ? `${byTabs(by)}${by === "phone" ? phoneField("acc-phone", "رقم الهاتف") : emailField("acc-email")}`
            : stage === "code" ? `<p class="acc-step">${E(T("الخطوة 1 من 2 · أدخل الرمز"))}</p>
               <p class="tiny">${E(T("إذا كان لهذا الحساب، أرسلنا رمزاً من 6 أرقام إلى"))} <bdi dir="ltr">${E(target.dial ? fmtPhone(target.identifier) : target.identifier)}</bdi>.</p>
               ${codeInput("acc-code")}`
            : `<p class="acc-step">${E(T("الخطوة 2 من 2 · اختر كلمة مرور جديدة"))}</p>
               <p class="tiny">${E(T("الرمز صحيح. اختر الآن كلمة المرور الجديدة."))}</p>
               <input type="text" name="username" autocomplete="username" value="${E(target.identifier)}" hidden>
               ${passField("acc-pass", "كلمة المرور الجديدة", "10 أحرف على الأقل", "new-password")}
               <p class="tiny">${E(T("أي حروف أو أرقام أو رموز، دون شروط خاصة. العبارة الأطول أكثر أماناً."))}</p>
               ${passField("acc-pass2", "تأكيد كلمة المرور", "أعد إدخال كلمة المرور", "new-password")}`}
          <div class="platform-error" id="acc-err" role="alert"></div>
          <button class="platform-primary" id="acc-submit" type="submit">${E(T(stage === "id" ? "إرسال الرمز" : stage === "code" ? "تحقق من الرمز" : "حفظ وتسجيل الدخول"))}</button>
          ${stage === "code" ? `<p class="acc-switch"><button type="button" class="platform-link" id="acc-resend">${E(T("إرسال رمز جديد"))}</button></p>` : ""}
          <button type="button" class="platform-link" id="acc-back">${E(T("رجوع"))}</button>
        </form>`);
      Platform.setRedraw(draw);
      const value = stage === "id" && by === "phone" ? wirePhone("acc-phone") : null; wireEyes();
      const err = document.getElementById("acc-err"), btn = document.getElementById("acc-submit");
      digits6(document.getElementById("acc-code"));
      document.getElementById("acc-back").onclick = stage === "id" ? back : () => { stage = stage === "password" ? "code" : "id"; draw(); };
      document.querySelectorAll("[data-acc-by]").forEach((b) => b.onclick = () => { if (b.dataset.accBy !== by) { by = b.dataset.accBy; rememberBy(by); draw(); } });
      const send = async () => {
        await api("salonieer_account_reset_start_v1", { p_identifier: target.identifier, p_dial: target.dial, p_lang: Lang.get() });
        kick();
      };
      document.getElementById("acc-resend")?.addEventListener("click", async () => { err.textContent = ""; try { await send(); UI.toast(T("أرسلنا رمزاً جديداً"), "ok"); } catch (e) { err.textContent = e.message; } });
      document.getElementById("acc-forgot-form").onsubmit = async (ev) => {
        ev.preventDefault(); err.textContent = "";
        if (stage === "id") {
          if (by === "phone") { const p = value(); if (!p) { err.textContent = T("أدخل رقم هاتف صحيح"); return; } target = { identifier: p.e164, dial: p.dial }; }
          else { const v = document.getElementById("acc-email").value.trim().toLowerCase(); if (!validEmail(v)) { err.textContent = T("أدخل بريداً إلكترونياً صحيحاً"); return; } target = { identifier: v, dial: "" }; }
          btn.disabled = true;
          try { await send(); stage = "code"; draw(); }
          catch (e) { err.textContent = e.message; btn.disabled = false; }
          return;
        }
        if (stage === "code") {
          const c = document.getElementById("acc-code").value.replace(/\D/g, "");
          if (c.length !== 6) { err.textContent = T("أدخل الأرقام الستة للرمز"); return; }
          btn.disabled = true;
          try { await api("salonieer_account_reset_check_v1", { p_identifier: target.identifier, p_dial: target.dial, p_code: c }); code = c; stage = "password"; draw(); }
          catch (e) { err.textContent = e.message; btn.disabled = false; if (e.code === "code_expired") { stage = "id"; draw(); document.getElementById("acc-err").textContent = e.message; } }
          return;
        }
        const a = document.getElementById("acc-pass").value, b2 = document.getElementById("acc-pass2").value;
        const problem = passwordProblem(a) || (a !== b2 ? "كلمتا المرور غير متطابقتين" : "");
        if (problem) { err.textContent = T(problem); return; }
        btn.disabled = true;
        try {
          const r = await api("salonieer_account_reset_finish_v1", { p_identifier: target.identifier, p_dial: target.dial, p_code: code, p_password: a });
          await signedInWith(r); UI.toast(T("تم تعيين كلمة المرور الجديدة"), "ok"); done({ signedIn: true });
        } catch (e) { err.textContent = e.message; btn.disabled = false; if (["wrong_code", "code_expired"].includes(e.code)) { stage = e.code === "code_expired" ? "id" : "code"; draw(); document.getElementById("acc-err").textContent = e.message; } }
      };
    };
    draw();
  }

  function registerScreen(done, back) {
    const by = loginBy();
    gate("إنشاء حساب", "حساب واحد لكل الأعمال، في التطبيق وعلى الموقع.", `
      <form class="acc-form" id="acc-register" novalidate>
        <div class="field"><label for="acc-name">${E(T("الاسم الكامل"))}</label><input id="acc-name" class="input" autocomplete="name" maxlength="60" placeholder="${E(T("الاسم الكامل"))}" dir="auto"></div>
        ${genderField("acc-gender")}
        ${byTabs(by, "إنشاء الحساب باستخدام")}
        ${by === "phone" ? phoneField("acc-phone", "رقم الهاتف", "username") : emailField("acc-email")}
        ${passField("acc-pass", "كلمة المرور", "10 أحرف على الأقل", "new-password")}
        ${passField("acc-pass2", "تأكيد كلمة المرور", "أعد إدخال كلمة المرور", "new-password")}
        <div class="platform-error" id="acc-err" role="alert"></div>
        <button class="platform-primary" id="acc-submit" type="submit">${E(T("إنشاء الحساب"))}</button>
        <p class="terms-note">${E(T("بإنشاء الحساب فإنك توافق على الشروط وسياسة الخصوصية."))}</p>
        <p class="acc-switch">${E(T("لديك حساب؟"))} <button type="button" class="platform-link" id="acc-to-login">${E(T("تسجيل الدخول"))}</button></p>
        ${back ? `<button type="button" class="platform-link" id="acc-back">${E(T("رجوع"))}</button>` : ""}
      </form>`);
    Platform.setRedraw(() => registerScreen(done, back));
    const value = by === "phone" ? wirePhone("acc-phone") : null; wireEyes();
    const err = document.getElementById("acc-err"), btn = document.getElementById("acc-submit");
    // Choosing a gender clears the message that asked for it.
    document.querySelectorAll('input[name="acc-gender"]').forEach((r) => r.addEventListener("change", () => {
      if (err.textContent === T("اختر الجنس: ذكر أو أنثى")) err.textContent = "";
    }));
    document.querySelectorAll("[data-acc-by]").forEach((b) => b.onclick = () => {
      if (b.dataset.accBy === by) return;
      const keep = { name: document.getElementById("acc-name").value, gender: genderValue("acc-gender") };
      rememberBy(b.dataset.accBy); registerScreen(done, back);
      document.getElementById("acc-name").value = keep.name;
      if (keep.gender) document.querySelector(`input[name="acc-gender"][value="${keep.gender}"]`).checked = true;
    });
    document.getElementById("acc-to-login").onclick = () => loginScreen(done, back);
    if (back) document.getElementById("acc-back").onclick = back;
    document.getElementById("acc-register").onsubmit = async (ev) => {
      ev.preventDefault(); err.textContent = "";
      const name = document.getElementById("acc-name").value.trim().replace(/\s+/g, " ");
      const a = document.getElementById("acc-pass").value, b = document.getElementById("acc-pass2").value, gender = genderValue("acc-gender");
      const phone = by === "phone" ? value() : null, email = by === "email" ? document.getElementById("acc-email").value.trim().toLowerCase() : "";
      const problem = nameProblem(name) || (!gender ? "اختر الجنس: ذكر أو أنثى" : "")
        || (by === "phone" && !phone ? "أدخل رقم هاتف صحيح" : "") || (by === "email" && !validEmail(email) ? "أدخل بريداً إلكترونياً صحيحاً" : "")
        || passwordProblem(a) || (a !== b ? "كلمتا المرور غير متطابقتين" : "");
      if (problem) { err.textContent = T(problem); return; }
      btn.disabled = true; btn.textContent = T("جارٍ إنشاء الحساب…");
      try {
        const r = by === "phone"
          ? await register({ method: "phone", identifier: phone.e164, dial: phone.dial, country: phone.country, name, password: a, gender })
          : await register({ method: "email", identifier: email, dial: "", country: guessCountry(), name, password: a, gender });
        if (r.confirm_email) setTimeout(() => UI.toast(T("أرسلنا رمزاً إلى بريدك لتأكيده. يمكنك تأكيده من «حسابي»."), "ok"), 600);
        done({ signedIn: true, created: true });
      }
      catch (e) { err.textContent = e.message; btn.disabled = false; btn.textContent = T("إنشاء الحساب"); }
    };
  }

  // Signing in from inside a salon (a guest who wants to book): the same
  // screens, then back into that salon.
  function inSalon(which) {
    const back = () => { Router.go("#/home"); Router.resolve(); };
    const done = async () => {
      const salon = Platform.current();
      if (salon) await (UI.withLoader ? UI.withLoader("جارٍ تسجيل الدخول…", () => enterAndLoad(salon.slug), { delay: 150 }) : enterAndLoad(salon.slug));
      // 2.34: back to the booking started as a guest (salon, specialist, service, time).
      if (!window.Push?.openPending()) { if (!window.BookingIntent?.resume()) Router.go("#/home"); Router.resolve(); }
      setTimeout(() => window.Push?.promptOnEntry?.(), 900);
    };
    (which === "register" ? registerScreen : loginScreen)(done, Platform.current() ? back : null);
  }
  async function enterAndLoad(slug) {
    window.rpcCacheBust?.();
    await ensureSalonSession(slug, { force: !localStorage.getItem("aj_token:" + slug) }).catch(() => null);
    await Auth.loadContext();
  }

  // The salon already has a record with this number: the person proves it is
  // theirs with that salon's password (or keeps browsing as a guest).
  function linkPrompt(onLinked) {
    const salon = Platform.current();
    if (!salon) return;
    const info = linkRequired(salon.slug) || {};
    UI.modal(`<div class="acc-link">
      <div class="acc-link-icon">${UI.icon("lock", 26)}</div>
      <h3>${E(T("اربط حسابك بهذا العمل"))}</h3>
      <p class="muted">${E(T("يوجد لدى هذا العمل حساب سابق برقم هاتفك. أدخل كلمة المرور التي تستخدمها في هذا العمل لربطه بحساب METON."))}</p>
      ${info.needs_password ? `<p class="tiny acc-note">${E(T("إذا أنشأ العمل حسابك ولم تضع كلمة مرور بعد، تواصل مع دعم METON لتعيينها."))}</p>` : ""}
      ${info.kind === "staff" ? `<p class="tiny acc-note">${E(T("تملك هذا العمل أو تعمل في فريقه؟ اطلب من METON منح الوصول لرقمك — دون كلمة مرور."))}</p>` : ""}
      ${passField("acc-link-pass", "كلمة مرور العمل", "أدخل كلمة المرور", "current-password")}
      <div class="form-error" id="acc-link-err" role="alert"></div>
      <div class="btn-row"><button class="btn" id="acc-link-go">${E(T("ربط الحساب"))}</button><button class="btn line" id="acc-link-later">${E(T("ليس الآن"))}</button></div>
      ${info.can_continue ? `<div class="acc-link-new"><p class="tiny">${E(T("لم تضع كلمة مرور في هذا العمل (مثلاً حجزت من موقعه)؟ تابع كعميل جديد بحسابك. حجوزاتك السابقة تبقى متاحة من روابطها، ولا نضمّها لحسابك برقم غير مؤكد."))}</p>
        <button class="btn line" id="acc-link-new">${E(T("متابعة كعميل جديد هنا"))}</button></div>` : ""}
      <p class="tiny acc-note">${E(T("لا نربط أي حساب برقم الهاتف وحده حفاظاً على خصوصيتك."))}</p></div>`);
    wireEyes();
    document.getElementById("acc-link-later").onclick = UI.closeModal;
    const fresh = document.getElementById("acc-link-new");
    if (fresh) fresh.onclick = async () => {
      UI.busy("acc-link-new", true);
      try {
        const r = await api("salonieer_account_enter_salon_new_v1", { p_token: token, p_slug: salon.slug });
        if (r.status !== "ok") throw new Error(T("تعذّر فتح العمل"));
        localStorage.setItem("aj_token:" + salon.slug, r.session.token); linkState.delete(salon.slug); refresh().catch(() => {});
        UI.closeModal(); window.rpcCacheBust?.(); await Auth.loadContext();
        if (onLinked) onLinked(); else { Router.go("#/home"); Router.resolve(); }
      } catch (e) { document.getElementById("acc-link-err").textContent = e.message; UI.busy("acc-link-new", false); }
    };
    document.getElementById("acc-link-go").onclick = async () => {
      const err = document.getElementById("acc-link-err"), pass = document.getElementById("acc-link-pass").value;
      if (!pass) { err.textContent = T("أدخل كلمة المرور"); return; }
      UI.busy("acc-link-go", true);
      try {
        const r = await linkSalon(salon.slug, pass);
        if (r.status !== "ok") throw new Error(T("تعذّر ربط الحساب"));
        UI.closeModal(); UI.toast(T("تم ربط حسابك بهذا العمل"), "ok");
        window.rpcCacheBust?.(); await Auth.loadContext();
        if (onLinked) onLinked(); else { Router.go("#/home"); Router.resolve(); }
      } catch (e) { err.textContent = e.message; UI.busy("acc-link-go", false); }
    };
  }

  // A guest (or an account not yet linked here) reached something that needs
  // an account: link, or sign in / create an account.
  function requireAccount() {
    const salon = Platform.current();
    // 2.46: an account without a phone number adds one first; then the business opens with it.
    if (signedIn() && salon && phoneRequired(salon.slug)) {
      phoneSheet(async () => { phoneState.delete(salon.slug); await enterAndLoad(salon.slug); Router.go("#/home"); Router.resolve(); });
      return;
    }
    if (signedIn() && salon && linkRequired(salon.slug)) { linkPrompt(); return; }
    if (signedIn() && salon && blockedHere(salon.slug)) { blockedNotice(); return; }
    UI.modal(`<h3>${E(T("تسجيل الدخول مطلوب"))}</h3><p>${E(T("سجّل الدخول أو أنشئ حساباً للمتابعة."))}</p>
      <div class="btn-row"><button class="btn" id="acc-req-login">${E(T("تسجيل الدخول"))}</button>
      <button class="btn line" id="acc-req-register">${E(T("إنشاء حساب"))}</button>
      <button class="btn line" id="acc-req-later">${E(T("ليس الآن"))}</button></div>`);
    document.getElementById("acc-req-login").onclick = () => { UI.closeModal(); Router.go("#/auth"); };
    document.getElementById("acc-req-register").onclick = () => { UI.closeModal(); Router.go("#/register"); };
    document.getElementById("acc-req-later").onclick = UI.closeModal;
  }

  function blockedNotice() {
    UI.modal(`<h3>${E(T("هذا الحساب موقوف"))}</h3><p>${E(T("هذا الحساب موقوف في هذا العمل. تواصل مع العمل"))}</p>
      <div class="btn-row"><button class="btn" id="acc-blk-salons">${E(T("أعمالي"))}</button><button class="btn line" id="acc-blk-close">${E(T("إغلاق"))}</button></div>`);
    document.getElementById("acc-blk-close").onclick = UI.closeModal;
    document.getElementById("acc-blk-salons").onclick = () => { UI.closeModal(); Router.go("#/salons"); };
  }

  // ---- account settings ------------------------------------------------------------
  function editName() {
    UI.modal(`<h3>${E(T("تعديل الاسم"))}</h3><div class="mform">
      <div class="field"><label for="acc-nm">${E(T("الاسم الكامل"))}</label><input id="acc-nm" class="input" maxlength="60" dir="auto" value="${E(profile?.account?.name || App.user?.name || "")}"></div>
      <div class="form-error" id="acc-nm-err" role="alert"></div>
      <button class="btn" id="acc-nm-save">${E(T("حفظ"))}</button></div>`);
    document.getElementById("acc-nm-save").onclick = async () => {
      const name = document.getElementById("acc-nm").value.trim().replace(/\s+/g, " ");
      const err = document.getElementById("acc-nm-err");
      const problem = nameProblem(name); if (problem) { err.textContent = T(problem); return; }
      UI.busy("acc-nm-save", true);
      try {
        const r = await api("salonieer_account_update_v1", { p_token: token, p_name: name });
        setProfile({ account: r.account, salons: profile?.salons });
        // The open salon shows the new name at once too.
        // The server copies the name to every linked salon (2.32); the open
        // salon is also told directly, for a database that predates that.
        if (App.token) { try { await rpc("me_update_profile", { p_token: App.token, p_name: name }); } catch {} }
        Auth.updateName(name);
        UI.closeModal(); UI.toast("تم الحفظ", "ok"); Router.resolve();
      } catch (e) { err.textContent = e.message; UI.busy("acc-nm-save", false); }
    };
  }
  // 2.41: accounts made before keep an empty gender until the person chooses here.
  function editGender() {
    UI.modal(`<h3>${E(T("الجنس"))}</h3><div class="mform">
      ${genderField("acc-g", profile?.account?.gender || "", true)}
      <div class="form-error" id="acc-g-err" role="alert"></div>
      <button class="btn" id="acc-g-save">${E(T("حفظ"))}</button></div>`);
    document.getElementById("acc-g-save").onclick = async () => {
      const gender = genderValue("acc-g"), err = document.getElementById("acc-g-err");
      if (!gender) { err.textContent = T("اختر الجنس: ذكر أو أنثى"); return; }
      UI.busy("acc-g-save", true);
      try {
        const r = await api("salonieer_account_set_gender_v1", { p_token: token, p_gender: gender });
        setProfile({ account: r.account, salons: profile?.salons });
        UI.closeModal(); UI.toast("تم الحفظ", "ok"); Router.resolve();
      } catch (e) { err.textContent = e.message; UI.busy("acc-g-save", false); }
    };
  }
  const genderLabel = () => ({ male: "ذكر", female: "أنثى" })[profile?.account?.gender] || "لم يُحدَّد";
  function changePassword() {
    if (profile?.account?.has_password === false && profile.account.email) { setPasswordSheet(); return; }
    UI.modal(`<h3>${E(T("تغيير كلمة المرور"))}</h3><div class="mform">
      ${passField("acc-old", "كلمة المرور الحالية", "أدخل كلمة المرور", "current-password")}
      ${passField("acc-new", "كلمة المرور الجديدة", "10 أحرف على الأقل", "new-password")}
      ${passField("acc-new2", "تأكيد كلمة المرور", "أعد إدخال كلمة المرور", "new-password")}
      <p class="tiny acc-note">${E(T("سيتم تسجيل الخروج من أجهزتك الأخرى."))}</p>
      <div class="form-error" id="acc-pw-err" role="alert"></div>
      <button class="btn" id="acc-pw-save">${E(T("حفظ"))}</button></div>`);
    wireEyes();
    document.getElementById("acc-pw-save").onclick = async () => {
      const err = document.getElementById("acc-pw-err");
      const a = document.getElementById("acc-new").value, b = document.getElementById("acc-new2").value;
      const problem = passwordProblem(a) || (a !== b ? "كلمتا المرور غير متطابقتين" : "");
      if (problem) { err.textContent = T(problem); return; }
      UI.busy("acc-pw-save", true);
      try { await api("salonieer_account_change_password_v1", { p_token: token, p_old: document.getElementById("acc-old").value, p_new: a }); UI.closeModal(); UI.toast("تم تغيير كلمة المرور", "ok"); }
      catch (e) { err.textContent = e.message; UI.busy("acc-pw-save", false); }
    };
  }
  function deleteAccount() {
    UI.modal(`<h3>${E(T("حذف الحساب"))}</h3>
      <p>${E(T("سيُحذف حساب METON وبياناتك الشخصية في كل الأعمال نهائياً. ستُحفظ السجلات التجارية المطلوبة بعد إزالة هويتك."))}</p>
      ${passField("acc-del-pass", "أدخل كلمة مرورك لتأكيد الحذف", "كلمة المرور", "current-password")}
      <div class="form-error" id="acc-del-err" role="alert"></div>
      <div class="btn-row"><button class="btn danger" id="acc-del-go">${E(T("حذف حسابي نهائياً"))}</button><button class="btn line" id="acc-del-cancel">${E(T("إلغاء"))}</button></div>`);
    wireEyes();
    document.getElementById("acc-del-cancel").onclick = UI.closeModal;
    document.getElementById("acc-del-go").onclick = async () => {
      const err = document.getElementById("acc-del-err"), pass = document.getElementById("acc-del-pass").value;
      if (!pass) { err.textContent = T("أدخل كلمة المرور"); return; }
      UI.busy("acc-del-go", true);
      try {
        await api("salonieer_account_delete_v1", { p_token: token, p_password: pass });
        // Deletion already ended every session on the server.
        const saved = window.Platform?.saved?.() || [];
        saved.forEach((s) => Platform.purgeSalon(s.slug, { signOut: true }));
        forgetSession(); setGuest(false); UI.closeModal(); restart();
      } catch (e) { err.textContent = e.message; UI.busy("acc-del-go", false); }
    };
  }

  // ---- 2.45: the account's email and team invitations ----------------------------------
  // A business invites a team member by email. The invitation shows only to the account that confirmed that address
  // (a 6-digit code by email); the person accepts or declines it here. Confirming never accepts anything by itself.
  // A database before 2.45 has none of this: every call fails quietly and nothing is shown.
  let emailState = null;
  async function emailInfo(force = false) {
    if (!token) return null;
    if (emailState && !force) return emailState;
    try { emailState = await api("salonieer_account_email_v1", { p_token: token }); } catch (e) { emailState = missing(e) ? { unsupported: true } : null; }
    return emailState;
  }
  function emailLabel(info = emailState) {
    if (!info?.email && info?.pending) return `${info.pending} · ${T("بانتظار الرمز")}`;
    if (!info?.email) return T("لم يُضف");
    return `${info.email} · ${T(info.verified ? "مؤكَّد" : "غير مؤكَّد")}`;
  }
  // Add, confirm or change the address, then type the code that was emailed (2.46: a new address waits for its code
  // and only then replaces the one the account signs in with).
  function emailSheet(after) {
    let sent = emailState?.waiting ? (emailState.pending || emailState.email || "") : "";
    const draw = () => {
      UI.modal(`<h3>${E(T("البريد الإلكتروني"))}</h3><div class="mform">
        ${sent ? `<p class="tiny">${E(T("أرسلنا رمزاً من 6 أرقام إلى"))} <bdi dir="ltr">${E(sent)}</bdi>. ${E(T("صالح لمدة 10 دقائق."))}</p>
          <div class="field"><label for="acc-em-code">${E(T("الرمز"))}</label><input id="acc-em-code" class="input" inputmode="numeric" autocomplete="one-time-code" maxlength="6" dir="ltr"></div>
          <div class="form-error" id="acc-em-err" role="alert"></div>
          <button class="btn" id="acc-em-verify">${E(T("تأكيد"))}</button>
          <div class="btn-row"><button class="btn line sm" id="acc-em-resend">${E(T("إرسال رمز جديد"))}</button><button class="btn line sm" id="acc-em-change">${E(T("تغيير البريد"))}</button></div>`
        : `<p class="tiny">${E(T("بعد تأكيده يمكنك تسجيل الدخول به في التطبيق وعلى الموقع، وترى دعوات الفريق التي تصلك من الأعمال. نرسل رمزاً لتأكيده."))}</p>
          <div class="field"><label for="acc-em">${E(T("البريد الإلكتروني"))}</label><input id="acc-em" class="input" type="email" inputmode="email" autocomplete="email" autocapitalize="off" spellcheck="false" dir="ltr" maxlength="254" value="${E(emailState?.pending || emailState?.email || "")}" placeholder="name@example.com"></div>
          <div class="form-error" id="acc-em-err" role="alert"></div>
          <button class="btn" id="acc-em-send">${E(T("إرسال رمز التأكيد"))}</button>`}</div>`);
      const err = document.getElementById("acc-em-err");
      const send = async (email, btn) => {
        UI.busy(btn, true);
        try {
          const r = await api("salonieer_account_email_start_v1", { p_token: token, p_email: email, p_lang: Lang.get() });
          if (r.status === "verified") { emailState = await emailInfo(true); UI.closeModal(); UI.toast(T("هذا البريد مؤكَّد بالفعل"), "ok"); after?.(); return; }
          kick();
          sent = r.email; draw(); document.getElementById("acc-em-code")?.focus();
        } catch (e) { err.textContent = e.message; UI.busy(btn, false); }
      };
      document.getElementById("acc-em-send")?.addEventListener("click", () => {
        const email = document.getElementById("acc-em").value.trim().toLowerCase();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email)) { err.textContent = T("أدخل بريداً إلكترونياً صحيحاً"); return; }
        send(email, "acc-em-send");
      });
      document.getElementById("acc-em-resend")?.addEventListener("click", () => send(sent, "acc-em-resend"));
      document.getElementById("acc-em-change")?.addEventListener("click", () => { sent = ""; draw(); });
      const code = document.getElementById("acc-em-code");
      if (code) code.addEventListener("input", () => { code.value = code.value.replace(/\D/g, "").slice(0, 6); });
      document.getElementById("acc-em-verify")?.addEventListener("click", async () => {
        const c = code.value.replace(/\D/g, "");
        if (c.length !== 6) { err.textContent = T("أدخل الأرقام الستة للرمز"); return; }
        UI.busy("acc-em-verify", true);
        try {
          const r = await api("salonieer_account_email_verify_v1", { p_token: token, p_code: c });
          emailState = await emailInfo(true); refresh().catch(() => {}); UI.closeModal();
          UI.toast(r.invites ? `${T("تم تأكيد البريد. لديك دعوات فريق:")} ${Lang.number(r.invites)}` : T("تم تأكيد البريد"), "ok");
          after?.();
        } catch (e) { err.textContent = e.message; UI.busy("acc-em-verify", false); }
      });
    };
    draw();
  }
  // ---- 2.47 (owner decision 2026-11-10): the contact number for a booking -----------------------------------------
  // A customer's own booking needs a contact number proven by a WhatsApp code, unless this account proved it before
  // (its confirmed number, or a booking number proven in the last 90 days: then no code). It goes on the booking for
  // the business; it becomes part of the account only if the person chooses so afterwards. Resolves with the server's
  // answer ({status:'ready', phone, offer_save, ...}) or null when the person closes the sheet.
  const BOOK_PHONE = "meton:booking-phone";
  async function bookingPhone(slug) {
    // A number this account proved already (its confirmed number, or the one this device used last): booked with no
    // extra screen. The check never sends a code.
    const a = acct(), last = (read(BOOK_PHONE) || {})[a.id || ""] || "";
    const known = a.phone || last;
    if (known) {
      try {
        const r = await api("salonieer_account_booking_phone_v1", { p_token: token, p_slug: slug, p_phone: known, p_dial: "", p_lang: Lang.get(), p_check: true });
        if (r.status === "ready") {
          if (r.session?.token) {
            localStorage.setItem("aj_token:" + slug, r.session.token);
            if (window.Auth?.saveToken) Auth.saveToken(r.session.token); else if (window.App) App.token = r.session.token;
            window.rpcCacheBust?.(); await Auth.loadContext?.().catch(() => {});
          }
          return r;
        }
      } catch (e) { if (e.network) { UI.toast(e.message, "err"); return null; } }
    }
    return bookingPhoneSheet(slug);
  }
  function bookingPhoneSheet(slug) {
    return new Promise((resolve) => {
      let settled = false, sent = "", demoCode = "", watcher = null;
      const a = acct();
      const remembered = (read(BOOK_PHONE) || {})[a.id || ""] || "";
      const settle = (v) => { if (settled) return; settled = true; watcher?.disconnect(); resolve(v); };
      const done = async (r) => {
        const all = read(BOOK_PHONE) || {}; all[a.id || ""] = r.phone; write(BOOK_PHONE, all);
        // The business record changed (an earlier booking-page record became this account's): its new session.
        if (r.session?.token) {
          localStorage.setItem("aj_token:" + slug, r.session.token);
          if (window.Auth?.saveToken) Auth.saveToken(r.session.token); else if (window.App) App.token = r.session.token;
          window.rpcCacheBust?.();
          await Auth.loadContext?.().catch(() => {});
        }
        settle(r); UI.closeModal();
      };
      const draw = () => {
        UI.modal(`<div class="acc-bphone"><h3>${E(T("رقم التواصل لهذا الحجز"))}</h3><div class="mform">
          ${sent ? `${demoCode ? `<p class="tiny acc-note">${E(T("عمل تجريبي: استخدم الرمز"))} <bdi dir="ltr"><b>${E(demoCode)}</b></bdi>. ${E(T("لا تُرسل أي رسالة."))}</p>`
              : `<p class="tiny">${E(T("أرسلنا رمزاً عبر واتساب إلى"))} <bdi dir="ltr">${E(fmtPhone(sent))}</bdi>. ${E(T("صالح لمدة 10 دقائق."))}</p>`}
            ${codeInput("bp-code")}<div class="form-error" id="bp-err" role="alert"></div>
            <button class="btn" id="bp-verify">${E(T("تأكيد"))}</button>
            <div class="btn-row">${demoCode ? "" : `<button class="btn line sm" id="bp-resend">${E(T("إرسال رمز جديد"))}</button>`}<button class="btn line sm" id="bp-change">${E(T("تغيير الرقم"))}</button></div>`
          : `<p class="tiny">${E(T("يستخدمه العمل للتواصل معك بخصوص هذا الموعد. نؤكّده برمز عبر واتساب، إلا إذا أكّدته من قبل."))}</p>
            ${phoneField("bp-phone", "رقم الهاتف")}<div class="form-error" id="bp-err" role="alert"></div>
            <button class="btn" id="bp-send">${E(T("متابعة"))}</button>
            <p class="tiny acc-note">${E(T("لا يُضاف الرقم إلى حسابك إلا إذا اخترت ذلك."))}</p>`}</div></div>`);
        const err = document.getElementById("bp-err");
        const value = sent ? null : wirePhone("bp-phone");
        if (!sent && (a.phone || remembered)) value.set(a.phone || remembered);
        const start = async (e164, dial, btn) => {
          UI.busy(btn, true);
          try {
            const r = await api("salonieer_account_booking_phone_v1", { p_token: token, p_slug: slug, p_phone: e164, p_dial: dial || "", p_lang: Lang.get() });
            if (r.status === "ready") { await done(r); return; }
            if (!r.demo) kick();
            sent = r.phone; demoCode = r.demo ? String(r.demo_code || "") : ""; draw(); document.getElementById("bp-code")?.focus();
          } catch (e) { err.textContent = e.message; UI.busy(btn, false); }
        };
        document.getElementById("bp-send")?.addEventListener("click", () => {
          const p = value(); if (!p) { err.textContent = T("أدخل رقم هاتف صحيح"); return; }
          start(p.e164, p.dial, "bp-send");
        });
        document.getElementById("bp-resend")?.addEventListener("click", () => start(sent, "", "bp-resend"));
        document.getElementById("bp-change")?.addEventListener("click", () => { sent = ""; demoCode = ""; draw(); });
        digits6(document.getElementById("bp-code"));
        document.getElementById("bp-verify")?.addEventListener("click", async () => {
          const c = document.getElementById("bp-code").value.replace(/\D/g, "");
          if (c.length !== 6) { err.textContent = T("أدخل الأرقام الستة للرمز"); return; }
          UI.busy("bp-verify", true);
          try { await done(await api("salonieer_account_booking_verify_v1", { p_token: token, p_slug: slug, p_code: c })); }
          catch (e) { err.textContent = e.message; UI.busy("bp-verify", false); }
        });
      };
      draw();
      // Closing the sheet (outside tap, Escape, back) cancels: the booking is not sent.
      const root = document.getElementById("modal-root");
      if (root && window.MutationObserver) {
        watcher = new MutationObserver(() => { if (!root.querySelector(".acc-bphone")) settle(null); });
        watcher.observe(root, { childList: true, subtree: true });
      }
    });
  }
  // Right after a booking with a newly proven number: optional, asked once per number.
  function offerSavePhone(phone) {
    if (!phone) return;
    UI.modal(`<h3>${E(T("حفظ الرقم في حسابك؟"))}</h3>
      <p>${E(T("هل تريد إضافة هذا الرقم إلى حساب METON لتسهيل حجوزاتك القادمة؟"))} <bdi dir="ltr">${E(fmtPhone(phone))}</bdi></p>
      <p class="tiny">${E(T("حجزك صالح في الحالتين، والعمل يرى الرقم الذي أكّدته لهذا الحجز."))}</p>
      <div class="form-error" id="bp-save-err" role="alert"></div>
      <div class="btn-row"><button class="btn" id="bp-save">${E(T("إضافة إلى حسابي"))}</button><button class="btn line" id="bp-later">${E(T("ليس الآن"))}</button></div>`);
    document.getElementById("bp-later").onclick = async () => {
      UI.closeModal();
      try { await api("salonieer_account_booking_phone_save_v1", { p_token: token, p_phone: phone, p_save: false }); } catch {}
    };
    document.getElementById("bp-save").onclick = async () => {
      UI.busy("bp-save", true);
      try {
        const r = await api("salonieer_account_booking_phone_save_v1", { p_token: token, p_phone: phone, p_save: true });
        if (r.account) setProfile({ account: r.account, salons: profile?.salons });
        UI.closeModal(); UI.toast(T("تمت إضافة الرقم إلى حسابك"), "ok");
      } catch (e) { document.getElementById("bp-save-err").textContent = e.message; UI.busy("bp-save", false); }
    };
  }

  // ---- 2.46: the account's phone number, another account of the same person, a first password ----------------------
  const acct = () => profile?.account || {};
  function phoneLabel(a = acct()) {
    if (!a.phone) return T("لم يُضف");
    return `${fmtPhone(a.phone)} · ${T(a.phone_confirmed ? "مؤكَّد" : a.phone_login ? "للدخول" : "غير مؤكَّد")}`;
  }
  // Add or change the number. With phone codes (WhatsApp) a code confirms it; without them it is kept unconfirmed for
  // businesses only (it never signs in until it is confirmed).
  function phoneSheet(after) {
    let sent = "";
    const draw = () => {
      const a = acct();
      UI.modal(`<h3>${E(T("رقم الهاتف"))}</h3><div class="mform">
        ${sent ? `<p class="tiny">${E(T("أرسلنا رمزاً عبر واتساب إلى"))} <bdi dir="ltr">${E(sent)}</bdi>. ${E(T("صالح لمدة 10 دقائق."))}</p>
          ${codeInput("acc-ph-code")}<div class="form-error" id="acc-ph-err" role="alert"></div>
          <button class="btn" id="acc-ph-verify">${E(T("تأكيد"))}</button>
          <div class="btn-row"><button class="btn line sm" id="acc-ph-resend">${E(T("إرسال رمز جديد"))}</button><button class="btn line sm" id="acc-ph-change">${E(T("تغيير الرقم"))}</button></div>`
        : `<p class="tiny">${E(T(a.phone_codes ? "نرسل رمزاً عبر واتساب لتأكيد الرقم، وبعد تأكيده يمكنك تسجيل الدخول به." : "رموز الهاتف غير متاحة بعد: يُحفظ الرقم غير مؤكَّد. تستخدمه الأعمال للتواصل معك، ولا يسجّل الدخول قبل تأكيده."))}</p>
          ${phoneField("acc-ph", "رقم الهاتف")}<div class="form-error" id="acc-ph-err" role="alert"></div>
          <button class="btn" id="acc-ph-send">${E(T(a.phone_codes ? "إرسال الرمز" : "حفظ الرقم"))}</button>`}</div>`);
      const err = document.getElementById("acc-ph-err");
      const value = sent ? null : wirePhone("acc-ph");
      const start = async (e164, dial, btn) => {
        UI.busy(btn, true);
        try {
          const r = await api("salonieer_account_phone_start_v1", { p_token: token, p_phone: e164, p_dial: dial, p_lang: Lang.get() });
          if (r.account) setProfile({ account: r.account, salons: profile?.salons });
          if (r.status === "code_sent") { kick(); sent = r.phone; draw(); document.getElementById("acc-ph-code")?.focus(); return; }
          await refresh().catch(() => {});   // a business waiting for this number is the account's now
          UI.closeModal(); UI.toast(T(r.status === "verified" ? "هذا الرقم مؤكَّد بالفعل" : "تم حفظ الرقم (غير مؤكَّد بعد)"), "ok"); after?.();
        } catch (e) { err.textContent = e.message; UI.busy(btn, false); }
      };
      document.getElementById("acc-ph-send")?.addEventListener("click", () => {
        const p = value(); if (!p) { err.textContent = T("أدخل رقم هاتف صحيح"); return; }
        start(p.e164, p.dial, "acc-ph-send");
      });
      document.getElementById("acc-ph-resend")?.addEventListener("click", () => start(sent, "", "acc-ph-resend"));
      document.getElementById("acc-ph-change")?.addEventListener("click", () => { sent = ""; draw(); });
      digits6(document.getElementById("acc-ph-code"));
      document.getElementById("acc-ph-verify")?.addEventListener("click", async () => {
        const c = document.getElementById("acc-ph-code").value.replace(/\D/g, "");
        if (c.length !== 6) { err.textContent = T("أدخل الأرقام الستة للرمز"); return; }
        UI.busy("acc-ph-verify", true);
        try {
          const r = await api("salonieer_account_phone_verify_v1", { p_token: token, p_code: c });
          if (r.account) setProfile({ account: r.account, salons: profile?.salons });
          await refresh().catch(() => {});
          UI.closeModal(); UI.toast(T("تم تأكيد رقم الهاتف"), "ok"); after?.();
        } catch (e) { err.textContent = e.message; UI.busy("acc-ph-verify", false); }
      });
    };
    draw();
  }
  // Another METON account of the same person joins this one: proven with its own password first, then shown before
  // anything changes. Its sign-in, businesses and bookings move here; it is closed, never deleted.
  const BLOCK = { both_email: "لكل منهما بريد إلكتروني. أزل البريد من أحدهما أولاً (حسابي ← البريد الإلكتروني).",
    both_phone: "لكل منهما رقم هاتف. تواصل مع دعم METON لدمجهما.", same_business: "كلاهما في العمل نفسه. تواصل مع دعم METON.",
    both_website: "لكلٍّ منهما حساب على الموقع فيه اشتراكات. تواصل مع دعم METON." };
  function linkSheet(after) {
    let by = "phone", found = null;
    const draw = () => {
      if (found) {
        const o = found.other || {}, blocked = (found.blockers || []).length;
        UI.modal(`<h3>${E(T("ربط حساب METON آخر"))}</h3><div class="mform">
          <p><b>${E(T("هذا هو الحساب الآخر:"))}</b></p>
          <div class="acc-link-other"><b data-i18n-skip>${E(o.name || "")}</b>${o.email ? `<small dir="ltr" data-i18n-skip>${E(o.email)}</small>` : ""}${o.phone ? `<small dir="ltr" data-i18n-skip>${E(o.phone)}</small>` : ""}</div>
          ${(o.businesses || []).length ? `<p class="tiny">${E(T("أعماله:"))} <span data-i18n-skip>${(o.businesses || []).map((b) => E(b.name)).join("، ")}</span></p>` : ""}
          ${blocked ? `<div class="tm-alert">${UI.icon("info", 17)}<span>${E(T("لا يمكن دمج هذين الحسابين تلقائياً:"))} ${(found.blockers || []).map((b) => E(T(BLOCK[b.code] || b.code))).join(" ")}</span></div>`
            : `<p class="tiny">${E(T("تنتقل طريقة دخوله (البريد أو الهاتف) وأعماله إلى هذا الحساب وتعمل بكلمة مرور هذا الحساب. يُغلق الحساب الآخر، ولا يُحذف أي شيء داخل الأعمال."))}</p>`}
          <div class="form-error" id="acc-lk-err" role="alert"></div>
          <div class="btn-row">${blocked ? "" : `<button class="btn" id="acc-lk-do">${E(T("ربط الحسابين"))}</button>`}<button class="btn line" id="acc-lk-cancel">${E(T("إلغاء"))}</button></div></div>`);
        document.getElementById("acc-lk-cancel").onclick = UI.closeModal;
        document.getElementById("acc-lk-do")?.addEventListener("click", async () => {
          UI.busy("acc-lk-do", true);
          try {
            const r = await api("salonieer_account_link_finish_v1", { p_token: token, p_ticket: found.ticket });
            setProfile({ account: r.account, salons: r.salons }); emailState = null;
            UI.closeModal(); UI.toast(T("تم الربط: أصبح لديك حساب واحد."), "ok"); after?.();
          } catch (e) { document.getElementById("acc-lk-err").textContent = e.message; UI.busy("acc-lk-do", false); }
        });
        return;
      }
      UI.modal(`<h3>${E(T("ربط حساب METON آخر"))}</h3><div class="mform">
        <p class="tiny">${E(T("لديك حساب METON ثانٍ (مثلاً على الموقع ببريدك)؟ أثبت أنه لك بكلمة مروره فيُضَم إلى هذا الحساب."))}</p>
        ${byTabs(by, "الحساب الآخر")}${by === "phone" ? phoneField("acc-lk-ph", "رقم الهاتف") : emailField("acc-lk-em")}
        ${passField("acc-lk-pass", "كلمة مرور الحساب الآخر", "أدخل كلمة المرور", "off")}
        <div class="form-error" id="acc-lk-err" role="alert"></div>
        <button class="btn" id="acc-lk-go">${E(T("متابعة"))}</button></div>`);
      wireEyes();
      const value = by === "phone" ? wirePhone("acc-lk-ph") : null, err = document.getElementById("acc-lk-err");
      document.querySelectorAll("[data-acc-by]").forEach((b) => b.onclick = () => { if (b.dataset.accBy !== by) { by = b.dataset.accBy; draw(); } });
      document.getElementById("acc-lk-go").onclick = async () => {
        let identifier, dial = "";
        if (by === "phone") { const p = value(); if (!p) { err.textContent = T("أدخل رقم هاتف صحيح"); return; } identifier = p.e164; dial = p.dial; }
        else { identifier = document.getElementById("acc-lk-em").value.trim().toLowerCase(); if (!validEmail(identifier)) { err.textContent = T("أدخل بريداً إلكترونياً صحيحاً"); return; } }
        const password = document.getElementById("acc-lk-pass").value;
        if (!password) { err.textContent = T("أدخل كلمة المرور"); return; }
        UI.busy("acc-lk-go", true);
        try { found = await api("salonieer_account_link_start_v1", { p_token: token, p_identifier: identifier, p_password: password, p_dial: dial }); draw(); }
        catch (e) { err.textContent = e.message; UI.busy("acc-lk-go", false); }
      };
    };
    draw();
  }
  // An account made with Google on the website has no password yet: a code to its email sets the first one.
  function setPasswordSheet(after) {
    const email = acct().email;
    let sent = false;
    const draw = () => {
      UI.modal(`<h3>${E(T("تعيين كلمة مرور"))}</h3><div class="mform">
        ${sent ? `<p class="tiny">${E(T("أرسلنا رمزاً من 6 أرقام إلى"))} <bdi dir="ltr">${E(email)}</bdi>.</p>${codeInput("acc-sp-code")}
          ${passField("acc-sp-pass", "كلمة المرور الجديدة", "10 أحرف على الأقل", "new-password")}${passField("acc-sp-pass2", "تأكيد كلمة المرور", "أعد إدخال كلمة المرور", "new-password")}`
        : `<p class="tiny">${E(T("لا توجد كلمة مرور لهذا الحساب بعد. نرسل رمزاً إلى بريدك لتعيينها."))} <bdi dir="ltr">${E(email || "")}</bdi></p>`}
        <div class="form-error" id="acc-sp-err" role="alert"></div>
        <button class="btn" id="acc-sp-go">${E(T(sent ? "حفظ" : "إرسال الرمز"))}</button></div>`);
      wireEyes(); digits6(document.getElementById("acc-sp-code"));
      const err = document.getElementById("acc-sp-err");
      document.getElementById("acc-sp-go").onclick = async () => {
        UI.busy("acc-sp-go", true);
        try {
          if (!sent) { await api("salonieer_account_reset_start_v1", { p_identifier: email, p_dial: "", p_lang: Lang.get() }); kick(); sent = true; draw(); return; }
          const c = document.getElementById("acc-sp-code").value.replace(/\D/g, ""), a = document.getElementById("acc-sp-pass").value, b = document.getElementById("acc-sp-pass2").value;
          const problem = c.length !== 6 ? "أدخل الأرقام الستة للرمز" : passwordProblem(a) || (a !== b ? "كلمتا المرور غير متطابقتين" : "");
          if (problem) { err.textContent = T(problem); UI.busy("acc-sp-go", false); return; }
          const r = await api("salonieer_account_reset_finish_v1", { p_identifier: email, p_dial: "", p_code: c, p_password: a });
          saveSession(r); UI.closeModal(); UI.toast(T("تم تعيين كلمة المرور الجديدة"), "ok"); after?.();
        } catch (e) { err.textContent = e.message; UI.busy("acc-sp-go", false); }
      };
    };
    draw();
  }
  // The account outside any business (the start screen): how it signs in, and the account's own actions.
  function accountSheet(after) {
    const a = acct();
    const row = (id, ic, title, hint) => `<button type="button" class="lrow" id="${id}"><div class="ic">${UI.icon(ic, 18)}</div><div class="t">${E(T(title))}${hint ? `<div class="tiny" data-i18n-skip>${E(hint)}</div>` : ""}</div><span class="chev">${UI.icon("chev", 18)}</span></button>`;
    UI.modal(`<h3>${E(T("حساب METON"))}</h3><p class="tiny">${E(T("حساب واحد للتطبيق والموقع. ما تفتحه يأتي من أعمالك وأدوارك فيها."))}</p>
      <div class="list acc-sheet-list">${row("acc-sh-email", "mail", "البريد الإلكتروني", a.email ? `${a.email} · ${T(a.email_confirmed ? "مؤكَّد" : "غير مؤكَّد")}` : (a.email_pending ? `${a.email_pending} · ${T("بانتظار الرمز")}` : T("لم يُضف")))}
        ${row("acc-sh-phone", "phone", "رقم الهاتف", phoneLabel(a))}
        ${row("acc-sh-pass", "lock", a.has_password === false ? "تعيين كلمة مرور" : "تغيير كلمة المرور", "")}
        ${row("acc-sh-delete", "trash", "حذف الحساب", "")}</div>
      <button type="button" class="btn line" id="acc-sh-close">${E(T("إغلاق"))}</button>`);
    const again = () => { after?.(); };
    document.getElementById("acc-sh-close").onclick = UI.closeModal;
    document.getElementById("acc-sh-email").onclick = () => emailInfo(true).then(() => emailSheet(again));
    document.getElementById("acc-sh-phone").onclick = () => phoneSheet(again);
    document.getElementById("acc-sh-pass").onclick = () => changePassword();
    document.getElementById("acc-sh-delete").onclick = () => deleteAccount();
  }

  async function teamInvites() {
    if (!token) return null;
    try { return (await api("salonieer_team_invites_v1", { p_token: token })) || null; } catch { return null; }
  }
  // My Businesses: waiting invitations with Accept / Decline (and, for an account without a confirmed address, a
  // small way to add one).
  // 2.46: a business given to this account itself (e.g. bought on the website) that waits for its phone number.
  function waitingHtml() {
    const list = (profile?.waiting || []).filter((w) => w.reason === "phone_needed");
    return list.length ? `<section class="acc-invites acc-waiting" aria-label="${E(T("أعمالك"))}">${list.map((w) => `<div class="acc-invite"><div class="acc-invite-main"><span class="pa-mini">${E((w.name || "؟").trim().charAt(0))}</span>
      <span><b data-i18n-skip>${E(w.name || "")}</b><small>${E(T("هذا العمل لك. أضف رقم هاتفك لفتحه: تحفظ الأعمال رقم هاتف لكل من فيها."))}</small></span></div>
      <div class="btn-row"><button type="button" class="btn sm" data-waiting-phone>${UI.icon("phone", 15)} ${E(T("إضافة رقم الهاتف"))}</button></div></div>`).join("")}</section>` : "";
  }
  function wireWaiting(host, redraw) {
    host.querySelectorAll("[data-waiting-phone]").forEach((b) => b.onclick = () => phoneSheet(async () => { await refresh().catch(() => {}); redraw?.(); }));
  }
  async function mountInvites(host, redraw) {
    if (!host || !token) return;
    const waiting = waitingHtml();
    if (waiting) { host.innerHTML = waiting; wireWaiting(host, redraw); }
    const data = await teamInvites();
    if (!data || !host.isConnected) return;
    const list = data.invites || [];
    const roleText = (i) => i.role === "other" && i.title ? i.title : T(({ manager: "مدير", specialist: "مختص", other: "أخرى" })[i.role] || i.role);
    if (!list.length) {
      host.innerHTML = waiting + (data.verified ? "" : `<button type="button" class="platform-link acc-invite-hint" id="acc-invite-email">${UI.icon("mail", 16)} ${E(T("وصلتك دعوة فريق بالبريد؟ أكّد بريدك لتراها"))}</button>`);
      wireWaiting(host, redraw);
      document.getElementById("acc-invite-email")?.addEventListener("click", () => emailSheet(redraw));
      return;
    }
    host.innerHTML = waiting + `<section class="acc-invites" aria-label="${E(T("دعوات الفريق"))}"><div class="sec-label">${E(T("دعوات الفريق"))} <em>${Lang.number(list.length)}</em></div>
      ${list.map((i, n) => `<div class="acc-invite"><div class="acc-invite-main">${i.salon?.logo_url ? `<img class="acc-invite-logo" src="${E(i.salon.logo_url)}" alt="">` : `<span class="pa-mini">${E((i.salon?.name || "؟").trim().charAt(0))}</span>`}
        <span><b data-i18n-skip>${E(i.salon?.name || "")}</b><small>${E(T("يدعوك للانضمام إلى الفريق بدور"))} <b>${E(roleText(i))}</b>${i.invited_by ? ` · <span data-i18n-skip>${E(i.invited_by)}</span>` : ""}</small>
          ${i.link ? `<small class="acc-invite-profile">${E(T("لربط حسابك بملفك الحالي في الفريق:"))} <b data-i18n-skip>${E(i.profile || "")}</b>${i.bookable ? ` · ${E(T("بمواعيده وجدوله"))}` : ""}</small>` : ""}</span></div>
        <div class="btn-row"><button type="button" class="btn sm" data-inv-accept="${n}">${UI.icon("check", 15)} ${E(T("قبول"))}</button><button type="button" class="btn line sm" data-inv-decline="${n}">${E(T("رفض"))}</button></div></div>`).join("")}
      <p class="tiny">${E(T("لا يتغير شيء حتى تقبل. عند القبول تبدأ صلاحياتك في هذا العمل كما اختارها صاحبه."))}</p></section>`;
    const decide = async (i, accept, btn) => {
      btn.disabled = true;
      try {
        const r = await api("salonieer_team_invite_email_decide_v1", { p_token: token, p_slug: i.slug, p_member: i.member_id, p_accept: accept });
        if (accept) {
          await refresh().catch(() => {});
          UI.toast(r.member?.status === "active" ? `${T("انضممت إلى فريق")} ${i.salon?.name || ""}` : T("قبلت الدعوة. سيفعّلك صاحب العمل عندما يتوفر مقعد."), "ok");
        } else UI.toast(T("تم رفض الدعوة"), "ok");
        redraw?.();
      } catch (e) {
        btn.disabled = false;
        // 2.46: the business needs this account's phone number first; then the same answer goes through.
        if (e.code === "phone_required") { phoneSheet(() => decide(i, accept, btn)); return; }
        UI.toast(e.message, "err");
      }
    };
    wireWaiting(host, redraw);
    host.querySelectorAll("[data-inv-accept]").forEach((b) => b.onclick = () => decide(list[Number(b.dataset.invAccept)], true, b));
    host.querySelectorAll("[data-inv-decline]").forEach((b) => b.onclick = () => UI.confirm(T("رفض هذه الدعوة؟"), () => decide(list[Number(b.dataset.invDecline)], false, b), true));
  }

  return {
    emailInfo, emailLabel, emailSheet, teamInvites, mountInvites,
    // 2.46: one account for the app and the website
    phoneSheet, phoneLabel, fmtPhone, linkSheet, setPasswordSheet, accountSheet, phoneRequired, loginConfirm, forgotScreen, bookingPhone, offerSavePhone,
    signedIn, isGuest, setGuest, token: () => token, profile: () => profile, account: () => profile?.account || null,
    refresh, register, login, logout, addSalon, removeSalon, owns, ensureSalonSession, linkRequired, linkSalon,
    welcome, loginScreen, registerScreen, inSalon, linkPrompt, requireAccount,
    editName, editGender, genderLabel, changePassword, deleteAccount, parsePhone: parse, blockedHere, blockedNotice, countries, guessCountry,
    // 2.34: the same phone field (country + number) for staff booking for a customer.
    phoneField, wirePhone,
  };
})();
