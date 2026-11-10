/* Salonieer staff manage salons, plans, payments and notifications from the
   website admin (salonieer.com/admin). The in-app METON Admin console was
   retired in 2.29; what remains here is what the salon's own screens use.
   Salon screens still ask whether METON staff opened them for a salon —
   inside the app they never do now, so target() is always null. */
window.Control = (() => {
  "use strict";
  const E = value => UI.esc(value);
  const WEBSITE_ADMIN = "https://www.meton.work/admin";
  const target = () => null;

  function website(fragment = "") {
    const url = WEBSITE_ADMIN + (fragment ? "#" + fragment : "");
    try { if (window.open(url, "_blank", "noopener")) return; } catch {}
    location.href = url;
  }
  // The old private entry point (typing SALONIEER-ADMIN in the salon search)
  // now explains where the admin went.
  function open() {
    UI.modal(`<div class="mhead"><h2>إدارة METON انتقلت إلى الموقع</h2><button class="iconbtn" id="moved-close">×</button></div><div class="mform">
      <p>تُدار الأعمال والباقات والمدفوعات والإشعارات الآن من لوحة الإدارة على موقع METON.</p>
      <p class="tiny" dir="ltr">meton.work/admin</p>
      <button class="btn" id="moved-open">فتح لوحة الإدارة</button></div>`);
    document.getElementById("moved-close").onclick = UI.closeModal;
    document.getElementById("moved-open").onclick = () => { UI.closeModal(); website(); };
  }
  function showCredential(result) {
    UI.modal(`<div class="mhead"><h2>بيانات الدخول الجديدة</h2><button class="iconbtn" id="credential-close">×</button></div><div class="mform">
      <p>سلّم كلمة المرور للمستخدم بعد التحقق من هويته. لن تظهر في سجل العمليات.</p>
      <div class="control-password">${E(result.temporary_password || "")}</div><p class="tiny">يمكن للمستخدم تغييرها بعد الدخول من البيانات الشخصية.</p></div>`);
    document.getElementById("credential-close").onclick = UI.closeModal;
  }

  // A phone that was signed in to the old console stops receiving the
  // platform copies of salon alerts, and that session is forgotten. Runs once
  // per launch and only does anything where such a session was left behind.
  async function retireLegacySession() {
    try { sessionStorage.removeItem("salonieer:platform-intent"); sessionStorage.removeItem("salonieer:recovery"); } catch {}
    let legacy;
    try { legacy = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY); } catch { return; }
    if (!legacy.session) return;
    try {
      const device = window.NativeBridge?.available() ? await Push.status() : null;
      if (device?.id && device.secret) await legacy.rpc("salonieer_unregister_device_v1",
        { p_id: device.id, p_secret: device.secret, p_slug: "*", p_audience: "platform" });
    } catch {}
    try { await legacy.signOut(); } catch {}
  }

  return { target, client: () => window.sb, open, website, showCredential, retireLegacySession,
    refreshTarget: async () => null, hasAccessIntent: () => false, shouldStart: () => false };
})();
