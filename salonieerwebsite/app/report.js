// "الإبلاغ عن مشكلة": salon managers (admin role) of a salon with an active subscription report a problem to
// Salonieer. Customers, specialists and unsubscribed salons never see it, and the server checks the same rules again
// (salonieer_problem_report_allowed_v1 / salonieer_report_problem_v1). Reports appear in the website admin panel.
window.ReportProblem = (() => {
  const CATEGORIES = [["bug", "شيء لا يعمل"], ["booking", "الحجوزات أو الجدول"], ["billing", "الفوترة أو الدفع"], ["account", "الدخول أو الحسابات"], ["other", "أمر آخر"]];
  let cache = { key: "", at: 0, value: false };
  const args = () => ({ p_slug: Shop.slug(), p_token: App.token });

  // Is the button allowed for this signed-in user? Cached for a minute per salon and session.
  async function allowed(force = false) {
    if (!Auth.isLoggedIn() || !Auth.isAdmin() || !App.token || !Shop.slug()) return false;
    const key = Shop.slug() + ":" + App.token.slice(-8);
    if (!force && cache.key === key && Date.now() - cache.at < 60000) return cache.value;
    let value = false;
    try { value = (await Push.call("problem_report_allowed", args())) === true; } catch { value = false; }
    cache = { key, at: Date.now(), value };
    return value;
  }
  function errorText(e) {
    const m = String(e?.message || "");
    if (/not_subscribed|غير مصرح|42501/.test(m)) return "الإبلاغ عن المشاكل متاح لمديري الأعمال ذات الاشتراك الفعّال فقط";
    if (/too_many_reports/.test(m)) return "أرسلت عدة بلاغات اليوم. يرجى الانتظار قبل إرسال بلاغ آخر";
    if (/invalid_report_message/.test(m)) return "يرجى وصف المشكلة بـ 10 أحرف على الأقل";
    return m || "تعذّر إرسال البلاغ";
  }

  // Never leaves the screen blank or stuck: any failure shows a message with a way back.
  async function page() {
    try { await draw(); }
    catch (e) {
      UI.render(`${UI.header({ title: "الإبلاغ عن مشكلة", back: "#/settings" })}
        <div class="content"><div class="center-col"><div class="card pad-lg"><p>${UI.esc(errorText(e))}</p>
        <button class="btn line" id="report-back" style="margin-top:12px">العودة إلى الإعدادات</button></div></div></div>`);
      document.getElementById("report-back").onclick = () => { location.hash = "#/settings"; };
    }
  }
  async function draw() {
    // UI.loading() is skeleton markup. (UI.loader() opens a full-screen overlay and returns its hide function.)
    UI.render(`${UI.header({ title: "الإبلاغ عن مشكلة", back: "#/settings" })}<div class="content"><div class="center-col">${UI.loading()}</div></div>`);
    const ok = await allowed(true);
    if (location.hash !== "#/report-problem") return;
    if (!ok) {
      UI.render(`${UI.header({ title: "الإبلاغ عن مشكلة", back: "#/settings" })}
        <div class="content"><div class="center-col"><div class="card pad-lg"><p>الإبلاغ عن المشاكل متاح لمديري الأعمال ذات الاشتراك الفعّال فقط.</p></div></div></div>`);
      return;
    }
    UI.render(`${UI.header({ title: "الإبلاغ عن مشكلة", back: "#/settings" })}
      <div class="content"><div class="center-col">
        <div class="card pad-lg report-card">
          <p class="muted" style="margin:0 0 14px">أخبر فريق METON بما لا يعمل في عملك وسنتابعه معك.</p>
          <div class="field"><label for="report-category">بخصوص ماذا؟</label>
            <select id="report-category" class="input">${CATEGORIES.map(([v, l]) => `<option value="${v}">${l}</option>`).join("")}</select></div>
          <div class="field" style="margin-top:12px"><label for="report-message">صف المشكلة</label>
            <textarea id="report-message" class="textarea" rows="5" maxlength="2000" placeholder="ماذا حدث وأين ومتى"></textarea>
            <div class="tiny muted" style="margin-top:6px">10 أحرف على الأقل</div></div>
          <button class="btn" id="report-send" style="margin-top:16px">إرسال البلاغ</button>
        </div>
      </div></div>`);
    document.getElementById("report-send").onclick = async () => {
      const message = document.getElementById("report-message").value.trim();
      if (message.length < 10) { UI.toast("يرجى وصف المشكلة بـ 10 أحرف على الأقل", "err"); document.getElementById("report-message").focus(); return; }
      UI.busy("report-send", true);
      try {
        await Push.call("report_problem", { ...args(), p_category: document.getElementById("report-category").value, p_message: message });
        UI.toast("تم إرسال البلاغ. سنتواصل معك قريباً", "ok");
        location.hash = "#/settings";
      } catch (e) { UI.toast(errorText(e), "err"); }
      finally { UI.busy("report-send", false); }
    };
  }

  // Settings → المساعدة: adds the row only when allowed (a placeholder keeps the layout stable until the check returns).
  async function mountRow(slot) {
    if (!slot) return;
    if (!(await allowed())) { slot.remove(); return; }
    if (!slot.isConnected) return;
    slot.hidden = false;
    slot.innerHTML = `<button type="button" class="lrow" id="report-problem"><div class="ic">${UI.icon("chat", 18)}</div><div class="t">الإبلاغ عن مشكلة<div class="tiny">أخبر فريق METON بما لا يعمل في عملك</div></div><span class="chev">${UI.icon("chev", 18)}</span></button>`;
    slot.querySelector("#report-problem").onclick = () => { location.hash = "#/report-problem"; };
  }

  return { allowed, page, mountRow };
})();
