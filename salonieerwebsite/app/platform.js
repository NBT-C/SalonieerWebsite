// platform.js — Salonieer multi-salon launcher.
// Keeps the salon application itself tenant-agnostic while remembering any
// number of salons on this device. A salon is resolved from a public code/QR,
// then the salon application runs unchanged for that tenant.
(function () {
  "use strict";

  const STORAGE = "salonieer:salons:v1";
  const CURRENT = "salonieer:current:v1";
  // METON (decision record v2.0): Explore / Discover is removed from the product. A customer reaches a business by
  // its link, QR or code. The search code stays switched off so it can be deleted or brought back in one place.
  const DISCOVERY = false;
  let currentSalon = null;
  let scannerStop = null;

  const cleanSlug = (s) => String(s || "").trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
  const normalizeCode = (s) => String(s || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

  function safeAssetPath(value) {
    const v = String(value || "").trim();
    if (!v || v.includes("..") || /^(?:https?:|data:|javascript:|\/\/)/i.test(v)) return "";
    return /^[a-zA-Z0-9_./?=&%-]+$/.test(v) ? v : "";
  }

  function readSaved() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE) || "[]");
      return Array.isArray(raw) ? raw.filter((x) => x && cleanSlug(x.slug)) : [];
    } catch { return []; }
  }

  function writeSaved(list) {
    const out = [];
    const seen = new Set();
    for (const s of list || []) {
      const slug = cleanSlug(s && s.slug);
      if (!slug || seen.has(slug)) continue;
      seen.add(slug);
      out.push({
        slug,
        name: String(s.name || slug),
        access_code: String(s.access_code || slug),
        rpc_prefix: String(s.rpc_prefix || (slug + "_")),
        logo_url: String(s.logo_url || ""),
        style_file: String(s.style_file || ""),
        script_file: String(s.script_file || ""),
        supabase_url: String(s.supabase_url || ""),
        supabase_anon_key: String(s.supabase_anon_key || ""),
        capabilities: s.capabilities && typeof s.capabilities === "object" ? s.capabilities : {},
        owned: s.owned === true,
      });
    }
    // A salon logo is a data URL that can be far larger than everything else
    // on this list. Writing it unguarded meant one oversized logo could throw
    // a quota error out of select(), which is on the path of simply opening a
    // salon. The list is written without the logos rather than not at all.
    try { localStorage.setItem(STORAGE, JSON.stringify(out)); }
    catch {
      try { localStorage.setItem(STORAGE, JSON.stringify(out.map(x => ({ ...x, logo_url: x.logo_url.length > 400000 ? "" : x.logo_url })))); }
      catch { try { localStorage.setItem(STORAGE, JSON.stringify(out.map(x => ({ ...x, logo_url: "" })))); } catch {} }
    }
    return out;
  }

  function remember(salon, source) {
    const list = readSaved();
    const idx = list.findIndex((x) => x.slug === salon.slug);
    if (idx >= 0) list[idx] = { ...list[idx], ...salon, owned: list[idx].owned || salon.owned === true };
    else list.push(salon);
    writeSaved(list);
    // 2.30: with a Salonieer account the salon also joins My Salons on the server.
    // 2.41: the promise lets a screen that only adds the salon wait for it.
    if (source && window.Account?.signedIn()) return Account.addSalon(salon.slug, source).catch(() => null);
    return Promise.resolve(null);
  }

  // 2.30: the account's My Salons (server) is the list on this device. Logos
  // already on the device are kept when the server sends none.
  function adoptAccountSalons(list) {
    if (!Array.isArray(list)) return readSaved();
    const local = new Map(readSaved().map((s) => [s.slug, s]));
    return writeSaved(list.map((s) => {
      const d = descriptor(s);
      if (!d) return null;
      const old = local.get(d.slug);
      if (old && !d.logo_url && old.logo_url) d.logo_url = old.logo_url;
      return { ...d, owned: s.owned === true };
    }).filter(Boolean));
  }
  const isOwned = (slug) => !!readSaved().find((s) => s.slug === slug && s.owned) || !!window.Account?.owns?.(slug);
  // Removing a salon from My Salons: the server first (owned salons stay).
  async function removeFromMine(slug) {
    if (isOwned(slug)) throw new Error(Lang.t("لا يمكن إزالة عمل تملكه من أعمالي"));
    if (window.Account?.signedIn()) await Account.removeSalon(slug);
    await leaveSalon(slug, { signOut: !window.Account?.signedIn() });
    return forget(slug);
  }

  function forget(slug) {
    slug = cleanSlug(slug);
    const next = readSaved().filter((s) => s.slug !== slug);
    writeSaved(next);
    if (localStorage.getItem(CURRENT) === slug) localStorage.removeItem(CURRENT);
    return next;
  }

  // ---- Leaving a salon ------------------------------------------------------
  // Everything this device keeps for one salon: cached settings, logo and
  // profile, recent choices, checklists, prompts and cached reads. The login
  // (aj_token) and the setup-guide progress go only when the person signs out
  // of it or removes it.
  function purgeSalon(slug, { signOut = false } = {}) {
    slug = cleanSlug(slug);
    if (!slug) return;
    const exact = new Set([`salonieer:settings:${slug}`, `salonieer:logo:${slug}`, `salonieer:profile:${slug}`]);
    const prefixes = [`salonieer:memory:v1:${slug}:`, `salonieer:checklist:${slug}:`];
    if (signOut) { exact.add(`aj_token:${slug}`); prefixes.push(`salonieer:setup:v1:${slug}:`); }
    const drop = (store, test) => {
      try { for (let i = store.length - 1; i >= 0; i--) { const k = store.key(i); if (k && test(k)) store.removeItem(k); } } catch {}
    };
    drop(localStorage, (k) => exact.has(k) || prefixes.some((p) => k.startsWith(p)));
    drop(sessionStorage, (k) => k === `salonieer:push-prompted:${slug}`);
    window.rpcCacheBustSalon?.(slug);
    window.Features?.reset?.(slug);
    if (window.App && (!currentSalon || currentSalon.slug === slug)) { App.unread = 0; }
  }
  // Leaving a salon stops its notifications on this phone at once (its
  // binding, the alerts already shown, and pushes still on their way) and
  // clears what the device kept for it. With signOut the session ends on the
  // server too, which stops delivery even if the phone is offline right now.
  async function leaveSalon(slug, { signOut = false } = {}) {
    slug = cleanSlug(slug);
    if (!slug) return;
    const salon = selectedFromSaved(slug) || (currentSalon && currentSalon.slug === slug ? currentSalon : { slug });
    const token = localStorage.getItem(`aj_token:${slug}`);
    const work = [Promise.resolve().then(() => window.Push?.unbindSalon?.(salon))];
    if (signOut && token && window.Push?.salonClient) {
      const prefix = String(salon.rpc_prefix || `${slug}_`);
      work.push(Promise.resolve(Push.salonClient(salon).rpc(`${prefix}auth_logout`, { p_token: token })).catch(() => {}));
    }
    purgeSalon(slug, { signOut });
    window.Push?.reportScope?.("");
    // Never hold the person up for long on a slow connection.
    await Promise.race([Promise.allSettled(work), new Promise((r) => setTimeout(r, 4000))]);
  }

  function descriptor(raw) {
    if (!raw) return null;
    const slug = cleanSlug(raw.slug);
    if (!slug) return null;
    return {
      slug,
      name: String(raw.name || slug),
      access_code: String(raw.access_code || slug),
      rpc_prefix: String(raw.rpc_prefix || (slug + "_")),
      logo_url: String(raw.logo_url || ""),
      style_file: String(raw.style_file || ""),
      script_file: String(raw.script_file || ""),
      supabase_url: String(raw.supabase_url || ""),
      supabase_anon_key: String(raw.supabase_anon_key || ""),
      capabilities: raw.capabilities && typeof raw.capabilities === "object" ? raw.capabilities : {},
    };
  }

  async function lookup(value) {
    const raw = String(value || "").trim();
    if (!raw) throw new Error("أدخل رمز العمل أولاً");
    // Staff attendance QR codes are not salon codes (and never open a salon).
    if (/^salonieer-attendance:/i.test(raw)) throw new Error(Lang.t("هذا رمز حضور الموظفين وليس رمز عمل"));
    const extracted = extractCode(raw);
    const norm = normalizeCode(extracted);

    try {
      const registry = window.platformSb || window.sb;
      if (!registry) throw new Error("Supabase client is not ready");
      const { data, error } = await registry.rpc("platform_lookup_salon", { p_code: extracted });
      if (error) throw error;
      const d = descriptor(data);
      if (!d) throw new Error("رمز العمل غير موجود");
      return d;
    } catch (e) {
      if (/platform_lookup_salon|does not exist|schema cache/i.test(e.rawMessage || e.message || "")) {
        throw new Error("شغّل INSTALL.sql في Supabase أولاً، أو جرّب رمز demo-001 للاختبار");
      }
      if (/رمز (الصالون|العمل) غير موجود/i.test(e.rawMessage || e.message || "")) throw e;
      throw new Error(e.message || "تعذّر التحقق من رمز العمل");
    }
  }

  async function lookupDemo() {
    // Another salon can own the normalized DEMO-001 code. Guest entry must
    // resolve the marked demo tenant through its dedicated lookup only.
    const { data, error } = await (window.platformSb || window.sb).rpc("platform_lookup_demo_salon");
    if (error) throw error;
    const salon = descriptor(data);
    if (salon?.slug !== "demo001" || salon.capabilities?.review_demo !== true)
      throw new Error(Lang.t("العمل التجريبي غير متاح"));
    return salon;
  }

  function extractCode(value) {
    const v = String(value || "").trim();
    try {
      if (/^https?:\/\//i.test(v)) {
        const u = new URL(v);
        return u.searchParams.get("code") || u.searchParams.get("salon") || u.searchParams.get("shop") || u.pathname.split("/").filter(Boolean).pop() || v;
      }
    } catch {}
    return v.replace(/^salonieer:\/\/salon\//i, "");
  }

  function select(salon) {
    const d = descriptor(salon);
    if (!d) throw new Error("بيانات العمل غير صحيحة");
    currentSalon = d;
    document.documentElement.dataset.experience = "salon";
    SalonTheme.apply(d.capabilities || {}, window.Appearance ? { dark: Appearance.isDark() } : {});
    remember(d);
    localStorage.setItem(CURRENT, d.slug);
    if (window.Shop && Shop.set) Shop.set(d.slug);
    if (window.setTenantSupabase) window.setTenantSupabase(d);
    document.documentElement.dataset.salon = d.slug;
    return d;
  }

  function selectedFromSaved(slug) {
    slug = cleanSlug(slug);
    return readSaved().find((s) => s.slug === slug) || null;
  }

  function syncCurrentBrand(settings = {}) {
    if (!currentSalon || !settings || typeof settings !== "object") return currentSalon;
    const caps = { ...(currentSalon.capabilities || {}) };
    for (const key of ["primary_color","secondary_color","style_preset","motion"]) {
      if (settings[key] != null && settings[key] !== "") caps[key] = settings[key];
    }
    currentSalon = descriptor({
      ...currentSalon,
      name: settings.app_name || currentSalon.name,
      logo_url: settings.logo_url != null ? settings.logo_url : currentSalon.logo_url,
      capabilities: caps,
    });
    remember(currentSalon);
    return currentSalon;
  }

  async function tenantBrand(salon) {
    const s = descriptor(salon);
    if (!s) return null;
    try {
      // Resolve branding through THIS salon's own RPC function instead of the
      // globally selected tenant. This prevents a late/stale response from one
      // salon from being written onto another salon card in the launcher.
      const external = s.supabase_url && s.supabase_anon_key;
      const client = external
        ? window.supabase.createClient(s.supabase_url, s.supabase_anon_key, { auth: { persistSession: false, autoRefreshToken: false } })
        : window.platformSb;
      if (!client) return null;
      const fn = String(s.rpc_prefix || "") + "get_app_settings";
      const args = s.rpc_prefix ? {} : { p_shop: s.slug };
      const { data, error } = await client.rpc(fn, args);
      if (error || !data || typeof data !== "object" || Array.isArray(data)) return null;
      return data;
    } catch { return null; }
  }

  async function refreshDescriptor(salon) {
    if (!salon) return null;
    try {
      const fresh = await lookup(salon.slug);
      // Access-code normalization can collide with a different salon's slug.
      // Never replace a saved salon (especially the isolated demo) with the
      // descriptor, credentials or branding of that different tenant.
      if (!fresh || fresh.slug !== salon.slug) return descriptor(salon);
      // Registry identity is resolved by slug first, then the visible name/logo
      // are refreshed independently from that salon's tenant settings.
      let merged = descriptor({
        ...salon,
        ...fresh,
        capabilities: { ...(salon.capabilities || {}), ...(fresh.capabilities || {}) },
      });
      const brand = await tenantBrand(merged);
      if (brand) {
        const caps = { ...(merged.capabilities || {}) };
        for (const key of ["primary_color","secondary_color","style_preset","motion"]) {
          if (brand[key] != null && brand[key] !== "") caps[key] = brand[key];
        }
        merged = descriptor({
          ...merged,
          name: String(brand.app_name || merged.name),
          logo_url: brand.logo_url != null ? String(brand.logo_url) : merged.logo_url,
          capabilities: caps,
        });
      }
      remember(merged);
      return merged;
    } catch { return descriptor(salon); }
  }

  async function refreshSavedList() {
    const list = readSaved();
    if (!list.length) return list;
    const refreshed = await Promise.all(list.map(async (salon) => {
      try { return await refreshDescriptor(salon); }
      catch { return descriptor(salon); }
    }));
    return writeSaved(refreshed.filter(Boolean));
  }

  async function loadOverrides() {
    const s = currentSalon;
    if (!s) return;
    document.getElementById("salon-custom-css")?.remove();
    const customCss = s.capabilities?.custom_css;
    if (typeof customCss === "string" && customCss.length <= 20000 && !/@import|url\s*\(|expression|javascript:|behavior\s*:/i.test(customCss)) {
      const style = document.createElement("style"); style.id = "salon-custom-css"; style.textContent = customCss;
      document.head.appendChild(style);
    }
    const css = safeAssetPath(s.style_file);
    const js = safeAssetPath(s.script_file);

    const oldCss = document.getElementById("salon-override-css");
    if (oldCss) oldCss.remove();
    if (css) {
      const link = document.createElement("link");
      link.id = "salon-override-css";
      link.rel = "stylesheet";
      link.href = css + (css.includes("?") ? "&" : "?") + "v=1";
      document.head.appendChild(link);
    }

    const oldJs = document.getElementById("salon-override-js");
    if (oldJs) oldJs.remove();
    if (js) {
      await new Promise((resolve) => {
        const script = document.createElement("script");
        script.id = "salon-override-js";
        script.src = js + (js.includes("?") ? "&" : "?") + "v=1";
        script.onload = resolve;
        script.onerror = resolve; // missing override never blocks the core app
        document.body.appendChild(script);
      });
    }
  }

  function logo(salon) {
    const src = String(salon.logo_url || "").trim();
    if (!src) return `<span class="platform-salon-avatar">${esc((salon.name || salon.slug || "S").trim().charAt(0).toUpperCase())}</span>`;
    return `<img class="platform-salon-logo" src="${esc(src)}" alt="" onerror="this.outerHTML='<span class=&quot;platform-salon-avatar&quot;>S</span>'">`;
  }

  // The gate on screen (salon picker / code entry) can redraw itself, so a
  // language change repaints it in place instead of reloading the document.
  let gateRedraw = null;
  function redrawGate() {
    if (!gateRedraw || !document.querySelector(".platform-gate")) return false;
    gateRedraw();
    return true;
  }
  function baseGate(title, subtitle, inner) {
    gateRedraw = null;
    const view = document.getElementById("view");
    const nav = document.getElementById("navhost");
    if (nav) nav.innerHTML = "";
    if (!view) return;
    view.classList.add("no-nav");
    view.innerHTML = `<div class="platform-gate">
      <div class="platform-ambient platform-ambient-a" aria-hidden="true"></div>
      <div class="platform-ambient platform-ambient-b" aria-hidden="true"></div>
      <div class="platform-shell-card">
<div class="platform-brand"><span class="platform-brand-logo">${window.UI?.brandPair ? UI.brandPair("horizontal", "platform-logo", "METON", 'width="184" height="58"') : "METON"}</span></div>
        <div class="platform-copy"><h1>${esc(title)}</h1>${subtitle?`<p>${esc(subtitle)}</p>`:""}</div>
        ${inner}
      </div>
    </div>`;
    document.documentElement.dataset.experience = "launcher";
    // 2.48.1: the platform screens follow Light / Dark / System (Light by default, owner 2026-11-11).
    SalonTheme.apply({}, { dark: window.Appearance ? Appearance.isDark() : false });
  }

  // 2.27: "My salons" (saved on this phone, or added by code / QR) and
  // "Discover" (salons that chose to be listed) are two clearly separate tabs.
  function gateTabs(current) {
    if (!DISCOVERY) return "";
    return `<div class="seg gate-tabs" id="gate-tabs" role="tablist">
      <button type="button" data-gate-tab="mine" class="${current === "mine" ? "on" : ""}" role="tab" aria-selected="${current === "mine"}">${UI.icon("grid", 16)}${esc(Lang.t("أعمالي"))}</button>
      <button type="button" data-gate-tab="discover" class="${current === "discover" ? "on" : ""}" role="tab" aria-selected="${current === "discover"}">${UI.icon("search", 16)}${esc(Lang.t("اكتشف عملاً"))}</button></div>`;
  }
  function wireGateTabs(onMine, onDiscover) {
    document.querySelectorAll("[data-gate-tab]").forEach(b => b.onclick = () => (b.dataset.gateTab === "discover" ? onDiscover : onMine)());
  }
  // Discovery inside the launcher: opening a result adds it to "My salons".
  function discoverGate(onDone, back) {
    if (!DISCOVERY) { back(); return; }
    baseGate("اكتشف الأعمال", "ابحث باسم العمل أو الخدمة أو الموعد الذي تريده.", `${gateTabs("discover")}<div id="gate-discover" class="gate-discover"></div>`);
    gateRedraw = () => discoverGate(onDone, back);
    wireGateTabs(back, () => {});
    window.Rework?.discover(document.getElementById("gate-discover"), async (s) => {
      remember(s, "discover");
      const opening = onDone(s);
      openingStart();
      try { await opening; } catch (e) { openingDone(); throw e; }
    });
  }
  // opts.addOnly (2.41): the salon is added to My Salons and the list is shown
  // again (from My Salons) — nothing is opened, so no "Opening salon" loader, and
  // the list is drawn once the server has the salon.
  function codeEntry(onDone, onCancel, message, onGuest, opts = {}) {
    const extra = message ? `<div class="platform-alert">${esc(message)}</div>` : "";
    baseGate("إضافة عمل", "امسح رمز QR أو أدخل رمز العمل.", `
      ${extra}
      ${onCancel ? "" : whoCard()}
      ${onCancel ? "" : `<div id="team-invites-slot"></div>`}
      ${window.Rework ? gateTabs("mine") : ""}
      <div class="platform-actions">
        <button class="platform-primary" id="platform-scan">${UI.icon("qr",20)} مسح رمز QR</button>
        <div class="platform-or"><span></span><b>أو</b><span></span></div>
        <label class="platform-field"><span>رمز العمل</span><input id="platform-code" autocomplete="off" placeholder="مثال: demo-001" dir="ltr"></label>
        <button class="platform-secondary" id="platform-submit">إضافة العمل</button>
        ${window.Account?.signedIn() ? "" : `<button class="platform-link" id="platform-guest-code" type="button">${Lang.t("تصفح العمل التجريبي")}</button>`}
        ${window.Lang?.selector?.() || ""}
        ${onCancel ? `<button class="platform-link" id="platform-cancel">رجوع</button>` : ""}
        <div class="platform-error" id="platform-error"></div>
      </div>
      ${window.Rework ? Rework.joinCard({ compact: true }) : ""}`);
    gateRedraw = () => codeEntry(onDone, onCancel, message, onGuest, opts);
    wireWho(() => codeEntry(onDone, onCancel, message, onGuest, opts));
    // 2.45: a new account invited to a team by email has no business yet: its invitation shows here; once accepted, the
    // business is in My Businesses.
    if (!onCancel && window.Account?.mountInvites) Account.mountInvites(document.getElementById("team-invites-slot"),
      () => readSaved().length ? picker(onDone) : codeEntry(onDone, onCancel, message, onGuest, opts)).catch(() => {});
    wireGateTabs(() => {}, () => discoverGate(onDone, () => codeEntry(onDone, onCancel, message, onGuest, opts)));

    const input = document.getElementById("platform-code");
    const submit = document.getElementById("platform-submit");
    const err = document.getElementById("platform-error");
    let lastCodeError = "";
    const again = (msg) => codeEntry(onDone, onCancel, msg, onGuest, opts);
    const run = async (value) => {
      if (String(value).trim().toUpperCase() === "SALONIEER-ADMIN") { Control.open(); return true; }
      err.textContent = "";
      submit.disabled = true;
      submit.textContent = "جاري التحقق...";
      try {
        // 2.33: an invitation code or link (INV-…) opens that salon's invitation.
        const maybeInvite = extractCode(value);
        if (window.Team?.isInviteCode(maybeInvite)) {
          const info = await Team.peek(maybeInvite);
          const salon = descriptor(info?.salon);
          if (!salon) throw new Error(Lang.t("رابط الدعوة غير صالح"));
          Team.rememberInvite(maybeInvite);
          remember(salon, "code");
          const opening = onDone(salon);
          openingStart();
          await opening;
          setTimeout(() => { Router.go("#/invite"); }, 0);
          return true;
        }
        const s = await lookup(value);
        const added = remember(s, /^(salonieer:|https?:)/i.test(String(value).trim()) ? "qr" : "code");
        if (opts.addOnly) {
          submit.textContent = Lang.t("جارٍ الإضافة…");
          await added;
          await onDone(s);
          return true;
        }
        // onDone selects the salon synchronously, so the loader that starts
        // right after it already carries the new salon's logo.
        const opening = onDone(s);
        openingStart();
        await opening;
        return true;
      } catch (e) {
        openingDone();
        const liveError = document.getElementById("platform-error");
        if (liveError) liveError.textContent = e.message || "تعذّر إضافة العمل";
        lastCodeError = e.message || "تعذّر إضافة العمل";
        submit.disabled = false;
        submit.textContent = "إضافة العمل";
        return false;
      }
    };
    submit.onclick = () => run(input.value);
    // Guest browsing resolves the isolated review tenant by slug. The public
    // code DEMO-001 already belongs to another saved salon in some
    // installations. The demo's business tools stay reachable through the
    // demo salon's own sign-in page, so there is one entry, not two.
    const guestCode = document.getElementById("platform-guest-code");
    if (guestCode) guestCode.onclick = async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      try {
        const demo = await lookupDemo();
        remember(demo);
        select(demo);
        openingStart();
        await Auth.continueAsGuest({ navigate: false });
        history.replaceState(null, "", location.pathname + location.search + "#/home");
        await (onGuest || onDone)(demo);
      } catch (error) { openingDone(); button.disabled = false; err.textContent = error.message || Lang.t("العمل التجريبي غير متاح"); }
    };
    window.Lang?.wireSelector?.();
    input.onkeydown = (e) => { if (e.key === "Enter") run(input.value); };
    document.getElementById("platform-scan").onclick = () => cameraScanner(async scanned => { if (!await run(scanned)) again(lastCodeError); }, () => again(null));
    const cancel = document.getElementById("platform-cancel");
    if (cancel) cancel.onclick = onCancel;
  }

  async function cameraScanner(onCode, onCancel) {
    stopScanner();
    if (window.NativeBridge && NativeBridge.available()) {
      try { const value = await NativeBridge.request("scan"); await onCode(value); }
      catch (error) { onCancel(); const el = document.getElementById("platform-error"); if (el) el.textContent = error.message; }
      return;
    }
    if (!("BarcodeDetector" in window) || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      onCancel();
      setTimeout(() => {
        const e = document.getElementById("platform-error");
        if (e) e.textContent = "المتصفح لا يدعم قراءة رمز QR بالكاميرا. أدخل الرمز يدويًا.";
      }, 0);
      return;
    }
    baseGate("امسح رمز QR للعمل", "ضع رمز QR داخل الإطار لإضافة العمل.", `
      <div class="platform-scanner-wrap">
        <video id="platform-video" playsinline muted></video>
        <div class="platform-scan-frame"><i></i><i></i><i></i><i></i></div>
      </div>
      <button class="platform-link" id="platform-cancel">إلغاء</button>
      <div class="platform-error" id="platform-error"></div>`);
    const video = document.getElementById("platform-video");
    const err = document.getElementById("platform-error");
    document.getElementById("platform-cancel").onclick = () => { stopScanner(); onCancel(); };

    let stream, alive = true;
    scannerStop = () => { alive = false; stream?.getTracks().forEach(t => t.stop()); scannerStop = null; };
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      if (!alive || !video.isConnected) { stream.getTracks().forEach(t => t.stop()); return; }
      video.srcObject = stream;
      await video.play();
      const supported = await BarcodeDetector.getSupportedFormats().catch(() => []);
      if (supported.length && !supported.includes("qr_code")) throw new Error("QR unavailable");
      const detector = new BarcodeDetector({ formats: ["qr_code"] });

      const loop = async () => {
        if (!alive) return;
        try {
          const hits = await detector.detect(video);
          if (hits && hits[0] && hits[0].rawValue) {
            const value = hits[0].rawValue;
            stopScanner();
            await onCode(value);
            return;
          }
        } catch {}
        requestAnimationFrame(loop);
      };
      loop();
    } catch (e) {
      if (stream) stream.getTracks().forEach((t) => t.stop());
      if (!err.isConnected) return;
      err.textContent = "تعذّر فتح الكاميرا. اسمح للموقع باستخدام الكاميرا أو أدخل الرمز يدويًا.";
    }
  }

  // Opening a salon (from the picker, a code, My salons or the guest demo)
  // always shows the branded loader at once, and it stays until that salon's
  // first screen has painted (UI.endRoute) — never a bare jump between
  // screens. A short minimum keeps it from flashing; a timeout keeps a failed
  // open from leaving it up.
  let openingHide = null, openingTimer = 0;
  function openingStart() {
    if (openingHide || !window.UI?.loader) return;
    // The salon being opened, not the one still loaded in App.settings.
    openingHide = UI.loader("جارٍ فتح العمل…", { delay: 0, minimum: 600, logo: currentSalon ? logo(currentSalon) : "" });
    openingTimer = setTimeout(openingDone, 10000);
  }
  function openingDone() {
    clearTimeout(openingTimer);
    const hide = openingHide; openingHide = null;
    if (hide) hide();
  }

  function stopScanner() {
    try { if (scannerStop) scannerStop(); } catch {}
    scannerStop = null;
  }

  function salonRow(s) {
    const owned = isOwned(s.slug);
    return `<div class="platform-picker-row ${owned ? "is-owned" : ""}" data-platform-row="${esc(s.slug)}">
      <button class="platform-salon-card" data-platform-pick="${esc(s.slug)}">
        ${logo(s)}<span><b>${esc(s.name)}</b><small>${esc(s.access_code || s.slug)}${owned ? ` · <em class="owned-pill">${esc(Lang.t("عملك"))}</em>` : ""}</small></span><strong>فتح</strong>
      </button>
      ${owned ? "" : `<button class="platform-picker-remove" type="button" data-platform-forget="${esc(s.slug)}" data-platform-name="${esc(s.name)}" aria-label="إزالة ${esc(s.name)}">${UI.icon("trash",17)}<span>إزالة</span></button>`}
    </div>`;
  }
  // Who is using the launcher, shown above My Salons.
  function whoCard() {
    const acc = window.Account?.account?.();
    // 2.46: an account may sign in with an email only; the name opens how it signs in (email, phone, linked accounts).
    if (acc) return `<div class="acc-who"><span class="pa-mini">${esc((acc.name || "؟").trim().charAt(0))}</span><button type="button" class="acc-who-open" id="acc-who-open" aria-label="${esc(Lang.t("حساب METON"))}"><b data-i18n-skip>${esc(acc.name)}</b><small dir="ltr" data-i18n-skip>${esc(acc.phone && window.Account?.fmtPhone ? Account.fmtPhone(acc.phone) : (acc.phone || acc.email || ""))}</small></button><button type="button" class="btn line sm" id="acc-who-logout">${esc(Lang.t("تسجيل الخروج"))}</button></div>`;
    if (window.Account?.isGuest()) return `<div class="acc-who guest"><span><b>${esc(Lang.t("أنت تتصفح كضيف"))}</b><small>${esc(Lang.t("سجّل الدخول لتأكيد الحجوزات ومتابعة مواعيدك."))}</small></span><button type="button" class="btn sm" id="acc-who-login">${esc(Lang.t("تسجيل الدخول"))}</button></div>`;
    return "";
  }
  function wireWho(redraw) {
    const b = document.getElementById("acc-who-login");
    if (b) b.onclick = () => Account.loginScreen(() => redraw(), () => redraw());
    const open = document.getElementById("acc-who-open");
    if (open && Account.accountSheet) open.onclick = () => Account.accountSheet(() => redraw());
    wireLogout();
  }
  function wireLogout() {
    const out = document.getElementById("acc-who-logout");
    if (out) out.onclick = () => UI.confirm(Lang.t("هل تريد تسجيل الخروج؟"), () => UI.withLoader ? UI.withLoader("جارٍ تسجيل الخروج…", () => Account.logout()) : Account.logout(), true);
  }

  async function picker(onChoose) {
    const list = readSaved();

    // Draw the saved salons straight away. Their names and logos are already
    // on this device; checking the registry for newer ones happens underneath
    // and only repaints the rows that actually changed.
    baseGate("أعمالي", "", `
      ${whoCard()}
      <div id="team-invites-slot"></div>
      ${window.Rework ? gateTabs("mine") : ""}
      <div class="platform-salon-list" id="platform-salon-list">${list.map(salonRow).join("")}</div>
      <button class="platform-secondary" id="platform-add-another">${UI.icon("plus",17)} إضافة عمل</button>
      ${window.Account?.signedIn() ? "" : `<button class="platform-link" id="platform-guest" type="button">${Lang.t("تصفح العمل التجريبي")}</button>`}
      ${window.Rework ? Rework.joinCard({ compact: true }) : ""}`);
    gateRedraw = () => picker(onChoose);
    wireWho(() => picker(onChoose));
    // 2.45: team invitations by email (accept / decline), for a signed-in account.
    if (window.Account?.mountInvites) Account.mountInvites(document.getElementById("team-invites-slot"), () => picker(onChoose)).catch(() => {});
    wireGateTabs(() => {}, () => discoverGate(onChoose, () => picker(onChoose)));

    function wire() {
      document.querySelectorAll("[data-platform-pick]").forEach((b) => b.onclick = () => {
        const saved = selectedFromSaved(b.dataset.platformPick);
        if (!saved) return;
        // Open on what we have: the route changes in the same tick as the
        // press. The registry check continues in the background and the salon
        // application picks up any newer branding on its next paint.
        b.classList.add("is-opening");
        try { onChoose(descriptor(saved)); openingStart(); }
        catch (error) { openingDone(); b.classList.remove("is-opening"); UI.toast(error.message, "err"); return; }
        refreshDescriptor(saved).then((fresh) => {
          if (fresh && currentSalon && fresh.slug === currentSalon.slug) {
            select(fresh);
            window.Auth?.applyTheme?.();
          }
        }).catch(() => {});
      });
      document.querySelectorAll("[data-platform-forget]").forEach((b) => b.onclick = () => {
        UI.confirm(`إزالة ${b.dataset.platformName || "هذا العمل"} من أعمالي؟`, async () => {
          try { await removeFromMine(b.dataset.platformForget); }
          catch (error) { UI.toast(error.message, "err"); return; }
          if (readSaved().length) picker(onChoose);
          else codeEntry(onChoose, null);
        }, true);
      });
      const add = document.getElementById("platform-add-another");
      if (add) add.onclick = () => codeEntry(async () => picker(onChoose), () => picker(onChoose), null, onChoose, { addOnly: true });
      const guest = document.getElementById("platform-guest");
      if (guest) guest.onclick = async () => {
        guest.disabled = true;
        try {
          const demo = await lookupDemo();
          remember(demo);
          select(demo);
          await Auth.continueAsGuest({ navigate: false });
          history.replaceState(null, "", location.pathname + location.search + "#/home");
          await onChoose(demo);
        } catch (error) { guest.disabled = false; UI.toast(error.message, "err"); }
      };
    }
    wire();
    // The server's My Salons (owned salons first appear here) repaints the list,
    // and so does every later change of the account's list while it is shown.
    const repaint = () => {
      const host = document.getElementById("platform-salon-list");
      if (!host) { document.removeEventListener("salonieer:my-salons", repaint); return; }
      host.innerHTML = readSaved().map(salonRow).join("");
      wire();
    };
    document.addEventListener("salonieer:my-salons", repaint);
    if (window.Account?.signedIn()) Account.refresh().then(repaint).catch(() => {});

    if (list.length) {
      refreshSavedList().then((fresh) => {
        const host = document.getElementById("platform-salon-list");
        if (!host) return;                       // the person already moved on
        const changed = JSON.stringify(fresh.map(x => [x.slug, x.name, x.logo_url]))
          !== JSON.stringify(list.map(x => [x.slug, x.name, x.logo_url]));
        if (!changed) return;
        host.innerHTML = fresh.map(salonRow).join("");
        wire();
      }).catch(() => {});
    }
  }

  async function ensureSalon() {
    stopScanner();
    const q = new URLSearchParams(location.search);
    const incoming = q.get("code") || q.get("salon") || q.get("shop") || sessionStorage.getItem("salonieer:incoming");
    sessionStorage.removeItem("salonieer:incoming");
    if (incoming) history.replaceState(null, "", location.pathname + location.hash);
    // 2.33: a team invitation (salonieer://salon/INV-… or the website link)
    // opens its salon and then the invitation itself.
    if (incoming && window.Team?.isInviteCode(extractCode(incoming))) {
      const code = extractCode(incoming);
      try {
        const info = await Team.peek(code);
        const d = descriptor(info?.salon);
        if (d) { remember(d, "code"); select(d); Team.rememberInvite(code); await loadOverrides(); return d; }
      } catch { /* fall through to the normal picker */ }
    }
    // A direct salon link opens that salon for everyone (guests browse it).
    if (incoming) {
      let found = null;
      try { found = await lookup(incoming); remember(found, "qr"); }
      catch { /* show normal code entry/picker */ }
      if (found) {
        select(found);
        await loadOverrides();
        return found;
      }
    }

    // 2.30: who is using the app — a Salonieer account, a guest, or someone
    // still signed in to a salon from an older version (kept signed in).
    let fresh = false;
    const legacy = readSaved().some((s) => localStorage.getItem(`aj_token:${s.slug}`)) || localStorage.getItem("salonieer:guest:demo001") === "1";
    if (window.Account && !Account.signedIn() && !Account.isGuest() && !legacy) {
      const how = await new Promise((resolve) => Account.welcome(resolve));
      fresh = !!how?.signedIn;
      if (fresh && !readSaved().length) await Account.refresh().catch(() => {});
    } else if (window.Account?.signedIn()) {
      Account.refresh().catch(() => {});
    }

    const list = readSaved();
    if (list.length === 1 && !fresh && !sessionStorage.getItem("salonieer:force-picker")) {
      // The only saved salon opens from this device's own copy — startup never
      // waits on the registry. Newer branding is merged in behind the app.
      const one = select(list[0]);
      await loadOverrides();
      refreshDescriptor(list[0]).then((fresh) => {
        if (!fresh || !currentSalon || fresh.slug !== currentSalon.slug) return;
        select(fresh);
        window.Auth?.applyTheme?.();
      }).catch((error) => console.warn("Salon refresh failed:", error.message));
      return one;
    }
    const previous = cleanSlug(localStorage.getItem(CURRENT));
    // Sent back to My Salons on purpose: the salon that was open stops its alerts.
    if (previous && sessionStorage.getItem("salonieer:force-picker")) leaveSalon(previous);
    sessionStorage.removeItem("salonieer:force-picker");

    return await new Promise((resolve) => {
      const done = async (s) => {
        // Picking another salon leaves the one that was open before (login kept).
        if (previous && s && s.slug !== previous) leaveSalon(previous);
        select(s);
        await loadOverrides();
        resolve(s);
      };
      if (readSaved().length > 0) picker(done);
      else codeEntry(done, null);
    });
  }

  async function switchTo(slug) {
    const saved = selectedFromSaved(slug);
    if (!saved) return false;
    // The salon being left stops its alerts and drops its cached data at once;
    // its login is kept so coming back needs no new sign-in.
    const previous = currentSalon && currentSalon.slug;
    if (previous && previous !== saved.slug) leaveSalon(previous);
    // Switching salons swaps tenant, branding and session in place. Reloading
    // the document used to throw away every byte the app had already parsed.
    select(saved);
    openingStart();
    await loadOverrides();
    // A salon this device has already opened switches from its own copy, the
    // same way the app starts; only a salon seen for the first time has to
    // wait for the server before its first screen can be drawn.
    const primed = Auth.primeFromCache() === "full";
    const context = Auth.loadContext();
    if (primed) {
      Router.go(Auth.isLoggedIn() || Auth.isGuest() ? "#/home" : "#/auth");
      Router.resolve();
      context.then(() => Router.resolve()).catch((error) => console.warn(error));
    } else {
      // First visit to this salon: the opening loader covers the wait.
      try { await context; } catch (error) { console.warn(error); }
      Router.go(Auth.isLoggedIn() || Auth.isGuest() ? "#/home" : "#/auth");
      Router.resolve();
    }
    refreshDescriptor(saved).then((fresh) => {
      if (fresh && currentSalon && fresh.slug === currentSalon.slug) { select(fresh); Auth.applyTheme(); }
    }).catch(() => {});
    return true;
  }

  async function managePage() {
    const backTo = window.Auth && Auth.isLoggedIn && Auth.isLoggedIn() ? "#/settings" : "#/auth";

    function drawDiscover() {
      UI.render(`${UI.header({title:"اكتشف الأعمال",back:backTo})}<div class="content"><div class="center-col">${gateTabs("discover")}<div id="manage-discover"></div></div></div>`);
      wireGateTabs(() => draw(readSaved()), () => {});
      window.Rework?.discover(document.getElementById("manage-discover"), async (s) => { remember(s, "discover"); await switchTo(s.slug); });
    }
    if (DISCOVERY && window.Rework && new URLSearchParams((location.hash.split("?")[1] || "")).get("tab") === "discover") { drawDiscover(); return; }
    function draw(list) {
      const cur = currentSalon || selectedFromSaved(localStorage.getItem(CURRENT)) || list[0] || null;
      UI.render(`${UI.header({title:"أعمالي",back:backTo})}
        <div class="content"><div class="center-col">
          ${whoCard()}
          <div id="team-invites-slot"></div>
          ${window.Rework ? gateTabs("mine") : ""}
          <div class="platform-manage-list" id="platform-manage-list">
            ${list.map((s) => `<div class="platform-manage-card ${cur && cur.slug === s.slug ? "current" : ""} ${isOwned(s.slug) ? "is-owned" : ""}">
              ${logo(s)}<div class="platform-manage-copy"><b>${esc(s.name)}</b><small>${esc(s.access_code || s.slug)}${isOwned(s.slug) ? ` · <em class="owned-pill">${esc(Lang.t("عملك"))}</em>` : ""}${cur && cur.slug === s.slug ? " · الحالي" : ""}</small></div>
              <div class="platform-manage-buttons">
                ${cur && cur.slug === s.slug ? "" : `<button class="btn sm" data-platform-switch="${esc(s.slug)}">فتح</button>`}
                ${isOwned(s.slug) ? "" : `<button class="btn sm line" data-platform-remove="${esc(s.slug)}">إزالة</button>`}
              </div>
            </div>`).join("")}
          </div>
          <button class="btn" id="platform-add-from-settings">${UI.icon("plus",18)} إضافة عمل</button>
          ${window.Account?.signedIn() ? "" : `<button class="btn line" id="platform-guest-from-settings" type="button">${Lang.t("تصفح العمل التجريبي")}</button>`}
          ${window.Rework ? Rework.joinCard() : ""}
        </div></div>`);
      const whoLogin = document.getElementById("acc-who-login");
      if (whoLogin) whoLogin.onclick = () => Router.go("#/auth");
      wireLogout();
      wireGateTabs(() => {}, drawDiscover);
      // 2.45: team invitations by email (accept / decline); accepting adds the business to this list.
      if (window.Account?.mountInvites) Account.mountInvites(document.getElementById("team-invites-slot"), () => draw(readSaved())).catch(() => {});

      document.querySelectorAll("[data-platform-switch]").forEach((b) => b.onclick = () => {
        b.disabled = true;
        switchTo(b.dataset.platformSwitch).catch((error) => { openingDone(); b.disabled = false; UI.toast(error.message, "err"); });
      });
      document.querySelectorAll("[data-platform-remove]").forEach((b) => b.onclick = () => {
        const slug = b.dataset.platformRemove;
        const wasCurrent = cur && cur.slug === slug;
        UI.confirm(`إزالة ${esc(selectedFromSaved(slug)?.name || "هذا العمل")} من أعمالي؟`, async () => {
          let rest;
          try { rest = await removeFromMine(slug); } catch (error) { UI.toast(error.message, "err"); return; }
          if (!wasCurrent) { draw(rest); return; }
          currentSalon = null;
          if (rest.length) await switchTo(rest[0].slug);
          else { sessionStorage.setItem("salonieer:force-picker", "1"); location.reload(); }
        }, true);
      });
      document.getElementById("platform-add-from-settings").onclick = () => {
        const before = currentSalon;
        codeEntry(async (s) => {
          remember(s);
          if (before) select(before);
          Router.go("#/salons"); Router.resolve();
        }, () => { Router.go("#/salons"); Router.resolve(); }, null, async (demo) => { await switchTo(demo.slug); }, { addOnly: true });
      };
      const guestBtn = document.getElementById("platform-guest-from-settings");
      if (guestBtn) guestBtn.onclick = async (event) => {
        const button = event.currentTarget;
        button.disabled = true;
        try {
          const demo = await lookupDemo();
          select(demo);
          await Auth.continueAsGuest({ navigate: false });
          await switchTo(demo.slug);
        } catch (error) { openingDone(); button.disabled = false; UI.toast(error.message, "err"); }
      };
    }

    // Paint from this device first; the registry check repaints only if the
    // saved names or logos are actually out of date. A change of the account's
    // list (a salon added or removed, possibly from a slow request) repaints too.
    const saved = readSaved();
    draw(saved);
    const repaint = () => {
      if (!document.getElementById("platform-manage-list")) { document.removeEventListener("salonieer:my-salons", repaint); return; }
      draw(readSaved());
    };
    document.addEventListener("salonieer:my-salons", repaint);
    refreshSavedList().then((fresh) => {
      if (!document.getElementById("platform-manage-list")) return;
      const same = JSON.stringify(fresh.map(x => [x.slug, x.name, x.logo_url]))
        === JSON.stringify(saved.map(x => [x.slug, x.name, x.logo_url]));
      if (!same) draw(fresh);
    }).catch(() => {});
  }

  window.SalonHooks = window.SalonHooks || (() => {
    const m = new Map();
    return {
      on(name, fn) { if (typeof fn !== "function") return; if (!m.has(name)) m.set(name, []); m.get(name).push(fn); },
      async emit(name, ...args) { for (const fn of (m.get(name) || [])) await fn(...args); },
    };
  })();

  window.Platform = {
    ensureSalon,
    lookup,
    current: () => currentSalon,
    saved: readSaved,
    count: () => readSaved().length,
    select,
    switchTo,
    openingDone,
    forget,
    leaveSalon,
    purgeSalon,
    managePage,
    loadOverrides,
    syncCurrentBrand,
    extractCode,
    redrawGate,
    // 2.30 accounts
    gate: baseGate,
    setRedraw: (fn) => { gateRedraw = fn; },
    adoptAccountSalons,
    removeFromMine,
    isOwned,
    remember,
  };
})();
