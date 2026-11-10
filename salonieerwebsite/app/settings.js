// =====================================================================
//  settings.js — the الإعدادات tab (user preferences + menu)
// =====================================================================
const Settings = (() => {
  async function save(dark, notify) {
    App.userSettings = App.userSettings || { dark_mode: true, notify: true };
    if (dark != null) App.userSettings.dark_mode = dark;
    if (notify != null) App.userSettings.notify = notify;
    localStorage.setItem("aj_dark", App.userSettings.dark_mode ? "1" : "0");
    Auth.applyTheme();
    try {
      await rpc("save_user_settings", {
        p_token: App.token,
        p_dark: !!App.userSettings.dark_mode,
        p_notify: App.userSettings.notify !== false,
      });
    } catch (e) { UI.toast(e.message, "err"); }
  }
  return { save };
})();
window.Settings = Settings;

const SettingsPages = (() => {

  function toggleRow(id, iconName, label, hint, on) {
    return `<div class="lrow" style="cursor:default">
      <div class="ic">${UI.icon(iconName, 18)}</div>
      <div class="t">${label}${hint ? `<div class="tiny">${hint}</div>` : ""}</div>
      <label class="switch">
        <input type="checkbox" aria-label="${label}" id="${id}" ${on ? "checked" : ""}>
        <span class="track"></span><span class="thumb"></span>
      </label>
    </div>`;
  }
  function linkRow(href, iconName, label, hint) {
    return `<button type="button" class="lrow" data-nav="${href}">
      <div class="ic">${UI.icon(iconName, 18)}</div>
      <div class="t">${label}${hint ? `<div class="tiny">${hint}</div>` : ""}</div>
      <span class="chev">${UI.icon("chev", 18)}</span>
    </button>`;
  }

  // Account is the one place these settings live. Bookings and notifications
  // are primary destinations on the bar, so they are not repeated here, and
  // the old separate "personal details" page is folded into the card below.
  async function menu() {
    const darkOn = App.userSettings ? !!App.userSettings.dark_mode
      : (typeof localStorage === "undefined" || localStorage.getItem("aj_dark") !== "0");
    const u = App.user || {};
    const s = App.settings || {};
    // 2.33: a team member's own role here (Manager / Specialist / custom title).
    const member = App.team?.member;
    const roleAr = member ? Team.roleName(member) : ({ admin: "مالك", barber: Staff.title(u), user: "عميل" }[u.role] || "عميل");
    const isStaff = Auth.isStaff() || u.role === "barber" || u.barber_id || !!member;
    // 2.30: the Salonieer account (one for every salon) when there is one.
    const acc = window.Account?.account?.();
    const accountOn = !!(acc && window.Account.signedIn());
    const shown = accountOn ? { name: acc.name, phone: (acc.phone && Account.fmtPhone ? Account.fmtPhone(acc.phone) : acc.phone) || acc.email || "" } : u;
    const legacy = !accountOn && !!window.Account && !Platform.current()?.supabase_url;

    UI.render(`${UI.header({ title: "حسابي" })}
      <div class="content">
        <div class="grid g2" style="align-items:start">
          <div style="display:flex;flex-direction:column;gap:14px">

            <div class="studio-account">
              <div class="pa-mini">${UI.esc((shown.name || "؟").trim().charAt(0) || "؟")}</div>
              <div style="flex:1;min-width:0">
                <b style="display:block" data-i18n-skip>${UI.esc(shown.name || "بدون اسم")}</b>
                <span class="muted" dir="ltr" data-i18n-skip>${UI.esc(shown.phone || "")}</span>
              </div>
              <span class="role-pill">${UI.esc(roleAr)}</span>
            </div>
            ${legacy ? `<div class="list"><button type="button" class="lrow" data-nav="#/auth"><div class="ic">${UI.icon("user", 18)}</div><div class="t">حساب METON<div class="tiny">سجّل الدخول أو أنشئ حساباً واحداً لكل الأعمال</div></div><span class="chev">${UI.icon("chev", 18)}</span></button></div>` : ""}

            ${isStaff ? `<div class="list">
              ${Auth.isStaff() ? `<button type="button" class="lrow" data-nav="#/admin"><div class="ic">${UI.icon("chart", 18)}</div><div class="t">لوحة التحكم${Auth.isAdmin() ? "" : `<div class="tiny">${UI.esc(Lang.t("حسب الصلاحيات التي منحك إياها المالك"))}</div>`}</div><span class="chev">${UI.icon("chev", 18)}</span></button>` : ""}
              ${(u.role === "barber" || u.barber_id) ? `<button type="button" class="lrow" data-nav="#/barber-dash"><div class="ic">${UI.icon("scissors", 18)}</div><div class="t">جدول عملي</div><span class="chev">${UI.icon("chev", 18)}</span></button>` : ""}
            </div>` : ""}
            ${App.team?.pending_member ? `<div class="tm-member-notice">${UI.icon("clock", 18)}<div><b>${UI.esc(Lang.t("قبلت دعوة الانضمام إلى الفريق"))}</b><small>${UI.esc(Lang.t("بانتظار تفعيل المالك. ستصلك رسالة عند التفعيل."))}</small></div></div>` : ""}
            ${member ? `<div id="tm-my-requests"></div>` : ""}
            ${window.Team ? Team.joinTeamCard() : ""}

            <div id="wf-att-row"></div>
            ${Features.enabled("loyalty") ? `<div class="list"><button type="button" class="lrow" data-nav="#/loyalty"><div class="ic">${UI.icon("star", 18)}</div><div class="t">محفظة النقاط<div class="tiny">Loyalty Coins · الرصيد والمكافآت</div></div><span class="chev">${UI.icon("chev", 18)}</span></button></div>` : ""}
            ${/* 2.32: the waitlist lives on the home page now. */ Features.enabled("service_packages") ? `<div class="list"><button type="button" class="lrow" data-nav="#/packages"><div class="ic">${UI.icon("star", 18)}</div><div class="t">الباقات<div class="tiny">باقات العمل وجلساتك المتبقية</div></div><span class="chev">${UI.icon("chev", 18)}</span></button></div>` : ""}

            <div class="sec-label">التفضيلات</div>
            <div class="list">
              <div class="lrow appearance-row" style="cursor:default"><div class="ic">${UI.icon("moon", 18)}</div><div class="t">${Lang.t("المظهر")}</div>
                ${UI.seg("tg-appearance", [{ v: "system", l: Lang.t("تلقائي") }, { v: "light", l: Lang.t("فاتح") }, { v: "dark", l: Lang.t("داكن") }], window.Appearance ? Appearance.get() : (darkOn ? "dark" : "light"))}</div>
              <div class="lrow device-push" id="device-push-row" style="cursor:default">
                <div class="ic">${UI.icon("bell", 18)}</div>
                <div class="t">الإشعارات<div class="tiny" id="device-push-hint">على هذا الجهاز فقط</div></div>
                <label class="switch"><input type="checkbox" aria-label="الإشعارات على هذا الجهاز" id="tg-notify" ${window.Push?.deviceOff?.() ? "" : "checked"}>
                  <span class="track"></span><span class="thumb"></span></label>
              </div>
              <div class="device-push-help" id="device-push-help" hidden></div>
              <div class="lrow lrow-language"><div class="ic">${UI.icon("globe",18)}</div><div class="t">${Lang.t("اللغة")}</div>${Lang.selector({ compact: true })}</div>
            </div>

            <div class="sec-label">${accountOn ? "حساب METON" : "الحساب"}</div>
            ${accountOn ? `<p class="tiny settings-acc-note">حساب واحد لكل الأعمال. بياناتك في كل عمل تبقى خاصة بذلك العمل.</p>` : ""}
            <div class="list">
              <button type="button" class="lrow" id="editName"><div class="ic">${UI.icon("pencil", 18)}</div><div class="t">تعديل الاسم</div><span class="chev">${UI.icon("chev", 18)}</span></button>
              ${accountOn ? `<button type="button" class="lrow" id="editGender"><div class="ic">${UI.icon("user", 18)}</div><div class="t">الجنس<div class="tiny">${Account.genderLabel()}</div></div><span class="chev">${UI.icon("chev", 18)}</span></button>` : ""}
              ${accountOn && Account.emailSheet ? `<button type="button" class="lrow" id="editEmail" hidden><div class="ic">${UI.icon("mail", 18)}</div><div class="t">البريد الإلكتروني<div class="tiny" id="editEmail-hint" data-i18n-skip></div></div><span class="chev">${UI.icon("chev", 18)}</span></button>` : ""}
              ${accountOn && Account.phoneSheet && "phone_login" in acc ? `<button type="button" class="lrow" id="editPhone"><div class="ic">${UI.icon("phone", 18)}</div><div class="t">رقم الهاتف<div class="tiny" data-i18n-skip>${UI.esc(Account.phoneLabel(acc))}</div></div><span class="chev">${UI.icon("chev", 18)}</span></button>` : ""}
              <button type="button" class="lrow" id="changePass"><div class="ic">${UI.icon("lock", 18)}</div><div class="t">${accountOn && acc.has_password === false ? "تعيين كلمة مرور" : "تغيير كلمة المرور"}</div><span class="chev">${UI.icon("chev", 18)}</span></button>
              <button type="button" class="lrow" id="deleteAccount"><div class="ic">${UI.icon("trash", 18)}</div><div class="t">حذف الحساب</div><span class="chev">${UI.icon("chev", 18)}</span></button>
            </div>
          </div>

          <div style="display:flex;flex-direction:column;gap:14px">
            <div class="sec-label">العمل</div>
            <div class="list">
              ${window.Platform ? linkRow("#/salons", "grid", "أعمالي", `${Platform.count()} محفوظ`) : ""}
              ${window.Rework ? linkRow(Auth.isAdmin() ? "#/admin/help" : "#/help", "info", "المساعدة والأسئلة الشائعة") : ""}
              ${linkRow("#/contact", "phone", "الدعم والتواصل")}
              ${linkRow("#/about", "info", "معلومات التطبيق")}
              ${linkRow("#/privacy", "shield", "سياسة الخصوصية")}
              ${window.SalonShortcut && Platform.current() ? `
              <button type="button" class="lrow" id="install-app">
                <div class="ic">${UI.icon("phone", 18)}</div>
                <div class="t">${Lang.t(document.documentElement.dataset.native === "ios" ? "اختصار سريع للعمل" : "إضافة العمل للشاشة الرئيسية")}</div>
                <span class="chev">${UI.icon("chev", 18)}</span>
              </button>` : ""}
            </div>

            ${Auth.isAdmin() && window.ReportProblem ? `<div class="list" id="report-problem-slot" hidden></div>` : ""}

            ${window.Rework && !Auth.isAdmin() ? Rework.joinCard() : ""}
            <button class="btn line" id="logout" style="color:var(--danger);border-color:var(--danger)">
              ${UI.icon("logout", 18)} تسجيل الخروج</button>

            <p class="terms-note"><bdi>${UI.esc(s.app_name || "METON")}</bdi> · 2.33</p>
          </div>
        </div>
      </div>`);

    // Salon managers of a subscribed salon only (checked by the server); everyone else never gets the row.
    if (window.ReportProblem) ReportProblem.mountRow(document.getElementById("report-problem-slot"));
    const inst = document.getElementById("install-app");
    if (inst) inst.onclick = () => SalonShortcut.install();

    if (window.Team) { Team.wireJoinTeam(); if (member) Team.myRequests(document.getElementById("tm-my-requests")); }
    // 2.33: an activation, a new role or new permissions show here without a
    // restart: the person's context is re-read and the page redrawn if it changed.
    if (App.token && !Auth.isAdmin()) rpcCached("team_me", { p_token: App.token }, 8000).then(t => {
      if (!t || typeof t !== "object" || JSON.stringify(t) === JSON.stringify(App.team || null)) return;
      App.team = t;
      if (location.hash.startsWith("#/settings")) Router.resolve();
    }).catch(() => {});
    document.getElementById("editName").onclick = () => accountOn ? Account.editName() : Pages.editName();
    const genderRow = document.getElementById("editGender");
    if (genderRow) genderRow.onclick = () => Account.editGender();
    // 2.45: the account's email (to receive team invitations); shown once the server answers (not on an older database).
    const emailRow = document.getElementById("editEmail");
    if (emailRow) {
      emailRow.onclick = () => Account.emailSheet(() => Router.resolve());
      Account.emailInfo(true).then((info) => {
        if (!info || info.unsupported || !emailRow.isConnected) return;
        document.getElementById("editEmail-hint").textContent = Account.emailLabel(info) + (info.invites ? ` · ${Lang.t("دعوات الفريق")}: ${Lang.number(info.invites)}` : "");
        emailRow.hidden = false;
      }).catch(() => {});
    }
    // 2.46: the account's phone number and another METON account of the same person (database 2.46 and later).
    const phoneRow = document.getElementById("editPhone");
    if (phoneRow) phoneRow.onclick = () => Account.phoneSheet(() => Router.resolve());
    const linkRow2 = document.getElementById("linkAccount");
    if (linkRow2) linkRow2.onclick = () => Account.linkSheet(() => Router.resolve());
    document.getElementById("changePass").onclick = () => accountOn ? Account.changePassword() : Pages.changePassword();
    document.getElementById("deleteAccount").onclick = () => accountOn ? Account.deleteAccount() : deleteAccount();
    Lang.wireSelector();
    // 2.28: Support Staff (and specialists) clock in from their account.
    window.Workforce?.isEmployee().then(ok => {
      const host = document.getElementById("wf-att-row"); if (!ok || !host) return;
      host.innerHTML = `<div class="list"><button type="button" class="lrow" data-nav="#/attendance"><div class="ic">${UI.icon("clock", 18)}</div><div class="t">${UI.esc(Lang.t("الحضور والانصراف"))}<div class="tiny">${UI.esc(Lang.t("تسجيل الحضور والانصراف في العمل"))}</div></div><span class="chev">${UI.icon("chev", 18)}</span></button></div>`;
    }).catch(() => {});
    UI.wireSeg("tg-appearance", v => { window.Appearance?.set(v); Settings.save(window.Appearance ? Appearance.isDark() : v === "dark", null); });
    wireDevicePush();
    document.getElementById("logout").onclick = () =>
      UI.confirm("هل تريد تسجيل الخروج؟", async () => { try { await UI.withLoader("جارٍ تسجيل الخروج…", () => Auth.logout()); Router.go("#/auth"); } catch(e) { UI.toast(e.message,"err"); } }, true);
  }

  // ---- Notifications on this device ----------------------------------------
  // The switch belongs to this phone (see Push.deviceState). Turning it on
  // always asks first — an in-app explanation, then the system dialog when
  // Android/iOS still allow one — and a blocked permission gets a direct
  // "Open Settings" button plus a re-check when the person comes back.
  async function paintDevicePush() {
    const input = document.getElementById("tg-notify");
    const hint = document.getElementById("device-push-hint");
    const help = document.getElementById("device-push-help");
    if (!input || !window.Push) return;
    const st = await Push.deviceState();
    if (!document.getElementById("tg-notify")) return;
    input.disabled = !st.supported;
    input.checked = st.on;
    let text = "على هذا الجهاز فقط";
    let blocked = false;
    if (!st.supported) text = "متاحة في تطبيق الهاتف";
    else if (st.choice === "off") text = "متوقفة على هذا الجهاز";
    else if (st.permission === "denied") { text = "محظورة من إعدادات الهاتف"; blocked = true; }
    else if (st.permission !== "granted") text = "اضغط للتفعيل على هذا الجهاز";
    else text = "مفعّلة على هذا الجهاز";
    hint.textContent = Lang.t(text);
    help.hidden = !blocked;
    help.innerHTML = blocked ? blockedHelp() : "";
    wireBlockedHelp();
  }
  function blockedHelp() {
    return `<p>${Lang.t("رفضتَ الإذن سابقاً، لذلك لا يستطيع التطبيق عرض نافذة الإذن مرة أخرى. فعّل الإشعارات للتطبيق من إعدادات الهاتف ثم ارجع هنا.")}</p>
      <div class="btn-row"><button type="button" class="btn sm" id="device-push-settings">${UI.icon("cog", 16)} ${Lang.t("فتح الإعدادات")}</button>
      <button type="button" class="btn line sm" id="device-push-recheck">${UI.icon("refresh", 16)} ${Lang.t("تحقق مجدداً")}</button></div>`;
  }
  function wireBlockedHelp() {
    const open = document.getElementById("device-push-settings");
    if (open) open.onclick = () => Push.openSettings();
    const again = document.getElementById("device-push-recheck");
    if (again) again.onclick = () => turnOn(true);
  }
  function permissionSheet() {
    return new Promise(resolve => {
      UI.modal(`<div class="push-entry-prompt"><div class="push-entry-icon">${UI.icon("bell", 28)}</div>
        <h2>${Lang.t("السماح بالإشعارات على هذا الجهاز؟")}</h2>
        <p>${Lang.t("ليصلك تأكيد الحجز وتغييرات الموعد والتذكير قبل زيارتك.")}</p>
        <div class="btn-row"><button class="btn" id="push-allow">${Lang.t("السماح")}</button><button class="btn line" id="push-deny">${Lang.t("ليس الآن")}</button></div></div>`);
      document.getElementById("push-allow").onclick = () => { UI.closeModal(); resolve(true); };
      document.getElementById("push-deny").onclick = () => { UI.closeModal(); resolve(false); };
      document.querySelector("#modal-root .modal-bg")?.addEventListener("click", e => { if (e.target.classList.contains("modal-bg")) resolve(false); });
    });
  }
  let pushBusy = false;
  async function turnOn(skipSheet) {
    if (pushBusy) return;
    const input = document.getElementById("tg-notify");
    if (!skipSheet && !(await permissionSheet())) { if (input) input.checked = false; return; }
    pushBusy = true;
    if (input) input.disabled = true;
    try {
      const r = await Push.enableOnDevice();
      if (r.ok) UI.toast("تم تفعيل الإشعارات على هذا الجهاز", "ok");
      else if (r.reason === "blocked") UI.toast("الإشعارات محظورة من إعدادات الهاتف", "err");
    } catch (e) { UI.toast(e.message, "err"); }
    finally { pushBusy = false; if (input) input.disabled = false; await paintDevicePush(); }
  }
  async function turnOff() {
    if (pushBusy) return;
    pushBusy = true;
    const input = document.getElementById("tg-notify");
    if (input) input.disabled = true;
    try { await Push.disableOnDevice(); UI.toast("أُوقفت الإشعارات على هذا الجهاز", "ok"); }
    catch (e) { UI.toast(e.message, "err"); }
    finally { pushBusy = false; if (input) input.disabled = false; await paintDevicePush(); }
  }
  let resumeWired = false;
  function wireDevicePush() {
    const input = document.getElementById("tg-notify");
    if (!input) return;
    input.onchange = e => e.target.checked ? turnOn(false) : turnOff();
    paintDevicePush();
    if (!resumeWired) {
      resumeWired = true;
      // Coming back from the phone's Settings: pick up the new permission and,
      // if the person had asked for notifications, finish turning them on.
      const again = async () => {
        if (!document.getElementById("tg-notify") || pushBusy) return;
        const st = await Push.deviceState();
        if (st.supported && st.choice === "on" && st.permission === "granted") await Push.sync(true).catch(() => {});
        paintDevicePush();
      };
      window.addEventListener("salonieer:native-resume", again);
      document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") again(); });
    }
  }

  function deleteAccount() {
    UI.modal(`<h3>${Lang.t("حذف الحساب")}</h3>
      <p>${Lang.t("سيُحذف حسابك وبياناتك الشخصية نهائياً. ستُحفظ السجلات التجارية المطلوبة بعد إزالة هويتك.")}</p>
      <label class="field">${Lang.t("أدخل كلمة مرورك لتأكيد الحذف")}<input class="input" id="delete-password" type="password" autocomplete="current-password"></label>
      <div class="form-error" id="delete-error" role="alert"></div>
      <div class="btn-row"><button class="btn danger" id="delete-confirm">${Lang.t("حذف حسابي نهائياً")}</button>
      <button class="btn line" id="delete-cancel">${Lang.t("إلغاء")}</button></div>`);
    document.getElementById("delete-cancel").onclick = UI.closeModal;
    document.getElementById("delete-confirm").onclick = async () => {
      const button = document.getElementById("delete-confirm");
      const password = document.getElementById("delete-password").value;
      if (!password) { document.getElementById("delete-error").textContent = Lang.t("أدخل كلمة المرور"); return; }
      button.disabled = true;
      try {
        await rpc("auth_delete_account", {p_token:App.token,p_password:password});
        // Deletion has already revoked all tenant sessions and push bindings.
        try { window.Smart?.memory.clear(); } catch {}
        Auth.clearToken(); App.user=null; App.userSettings=null; App.guest=false; App.unread=0;
        localStorage.removeItem("salonieer:profile:"+Shop.slug());
        window.rpcCacheBust?.();
        UI.closeModal(); Router.go("#/auth");
      } catch (error) {
        document.getElementById("delete-error").textContent=error.message;
        button.disabled=false;
      }
    };
  }

  return { menu };
})();
window.SettingsPages = SettingsPages;
