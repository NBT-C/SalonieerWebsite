/* 2.27: Salon Discovery (search, filters, ranking from the server), the Help /
   FAQ written on the METON website, anonymous visit ratings, the app
   update check (store versions set on the website) and "Join as a Salon".
   Everything is decided by the server; this file only asks and draws. */
window.Rework = (() => {
  "use strict";
  const E = v => UI.esc(v);
  const pick = (ar, en, he) => { const l = Lang.get(); return l === "en" ? en : l === "he" ? he : ar; };
  const registry = () => window.platformSb || window.sb;
  async function platformRpc(fn, args) {
    const { data, error } = await registry().rpc(fn, args || {});
    if (error) throw error;
    return data;
  }
  const SITE = "https://www.meton.work";
  const joinUrl = () => `${SITE}/plans?lang=${encodeURIComponent(Lang.get())}`;

  // ── Join as a Salon ────────────────────────────────────────────────────
  // For people who own a salon: the official website sign-up (plans → apply),
  // opened outside the app. Not to be confused with joining a salon as a
  // customer (code / QR / Discovery).
  function joinCard(opts = {}) {
    return `<a class="join-salon-card ${opts.compact ? "compact" : ""}" href="${E(joinUrl())}" target="_blank" rel="noopener" data-join-salon>
      <span class="join-salon-icon">${UI.icon("scissors", 20)}</span>
      <span class="join-salon-text"><b>${E(Lang.t("انضم كعمل"))}</b><small>${E(Lang.t("تملك عملاً؟ سجّل عملك في METON من الموقع الرسمي."))}</small></span>
      ${UI.icon("fwd", 18)}</a>`;
  }

  // ── Discovery ──────────────────────────────────────────────────────────
  // 2.41: salons are found by who they serve (a salon for both appears under each); the card also says who works there.
  const CATS = [["", "الكل"], ["men", "للرجال"], ["women", "للنساء"]];
  const catLabel = s => [
    ({ men: "للرجال", women: "للنساء", both: "للرجال والنساء" })[s.clientele || ({ male: "men", female: "women", beauty: "women" })[s.category]] || "",
    ({ male: "فريق رجالي", female: "فريق نسائي", mixed: "فريق مختلط" })[s.team_composition] || ""].filter(Boolean);
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  let lastFilters = { q: "", service: "", date: "", time: "", category: "", min_rating: "", available_only: false };
  let geo = null;

  // host: where to draw; onOpen(salonDescriptor): open the chosen salon.
  function discover(host, onOpen) {
    if (!host) return;
    const f = lastFilters;
    const days = Array.from({ length: 8 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() + i); return iso(d); });
    const hours = []; for (let h = 7; h <= 23; h++) for (const m of [0, 30]) hours.push(`${String(h).padStart(2, "0")}:${m ? "30" : "00"}`);
    host.innerHTML = `<div class="disc">
      <label class="studio-search disc-search">${UI.icon("search", 19)}<input id="disc-q" value="${E(f.q)}" placeholder="${E(Lang.t("اسم العمل أو الخدمة أو المدينة"))}" autocomplete="off" enterkeyhint="search" aria-label="${E(Lang.t("البحث"))}"></label>
      <details class="disc-filters" ${f.service || f.date || f.category || f.min_rating ? "open" : ""}><summary>${UI.icon("filter", 16)} ${E(Lang.t("تصفية وموعد مطلوب"))}</summary>
        <div class="disc-grid">
          <label>${E(Lang.t("الخدمة"))}<input class="input" id="disc-svc" value="${E(f.service)}" placeholder="${E(Lang.t("مثال: قص شعر"))}"></label>
          <label>${E(Lang.t("اليوم"))}<select class="select" id="disc-date"><option value="">${E(Lang.t("أي يوم"))}</option>${days.map(d => `<option value="${d}" ${d === f.date ? "selected" : ""}>${E(Smart.dayLabel(d))} · ${E(UI.dateAr(d))}</option>`).join("")}</select></label>
          <label>${E(Lang.t("الساعة"))}<select class="select" id="disc-time"><option value="">${E(Lang.t("أي وقت"))}</option>${hours.map(t => `<option value="${t}" ${t === f.time ? "selected" : ""}>${E(UI.timeAr(t))}</option>`).join("")}</select></label>
          <label>${E(Lang.t("التقييم"))}<select class="select" id="disc-rating"><option value="">${E(Lang.t("أي تقييم"))}</option><option value="4" ${f.min_rating === "4" ? "selected" : ""}>4+ ★</option><option value="4.5" ${f.min_rating === "4.5" ? "selected" : ""}>4.5+ ★</option></select></label>
        </div>
        <div class="chips disc-cats" role="group" aria-label="${E(Lang.t("العملاء الذين يخدمهم العمل"))}">${CATS.map(([v, l]) => `<button type="button" class="chip ${f.category === v ? "active" : ""}" data-cat="${v}">${E(Lang.t(l))}</button>`).join("")}</div>
        <div class="disc-toggles"><label class="checkrow"><input type="checkbox" id="disc-avail" ${f.available_only ? "checked" : ""}> <span>${E(Lang.t("المتاح فقط في اليوم المختار"))}</span></label>
          <button type="button" class="btn line sm" id="disc-near">${UI.icon("pin", 15)} ${E(Lang.t(geo ? "الأقرب إليّ ✓" : "الأقرب إليّ"))}</button></div>
      </details>
      <div id="disc-results" aria-live="polite">${UI.loading()}</div>
      ${joinCard({ compact: true })}</div>`;
    let page = 0, timer = null, seq = 0;
    const read = () => {
      lastFilters = { q: host.querySelector("#disc-q").value.trim(), service: host.querySelector("#disc-svc").value.trim(),
        date: host.querySelector("#disc-date").value, time: host.querySelector("#disc-time").value,
        category: host.querySelector(".disc-cats .chip.active")?.dataset.cat || "", min_rating: host.querySelector("#disc-rating").value,
        available_only: host.querySelector("#disc-avail").checked };
      return lastFilters;
    };
    const run = async () => {
      const box = host.querySelector("#disc-results"); if (!box) return;
      const my = ++seq, flt = read();
      // A wanted time without a day means today.
      const date = flt.date || (flt.time ? iso(new Date()) : "");
      box.innerHTML = UI.loading();
      let r;
      try {
        r = await platformRpc("salonieer_discover_v1", { p_filters: { q: flt.q, service: flt.service, date, time: flt.time, category: flt.category,
          min_rating: flt.min_rating, available_only: flt.available_only && !!date, lat: geo?.lat, lng: geo?.lng, limit: 10, offset: page * 10 } });
      } catch (e) { if (my === seq) box.innerHTML = `<div class="card">${E(Lang.error(e))}</div>`; return; }
      if (my !== seq || !box.isConnected) return;
      const items = r.items || [];
      box.innerHTML = items.length ? `<p class="tiny disc-count">${E(pick(`${Lang.number(r.total)} عمل`, `${r.total} salons`, `${r.total} עסקים`))}${date ? " · " + E(Lang.t("مرتبة حسب توفر الموعد")) : ""}</p>
        <div class="disc-list">${items.map(card).join("")}</div>${UI.pager(page, (page + 1) * 10 < r.total)}`
        : UI.empty(Lang.t("لا توجد أعمال مطابقة"), Lang.t("جرّب كلمة أخرى أو يوماً آخر، أو أضف عملك برمزه من «أعمالي»."));
      UI.wirePager(() => { if (page > 0) { page--; run(); } }, () => { page++; run(); }, box);
      box.querySelectorAll("[data-open-salon]").forEach(b => b.onclick = async () => {
        b.disabled = true;
        try { const salon = await Platform.lookup(b.dataset.openSalon); await onOpen(salon); }
        catch (e) { b.disabled = false; UI.toast(e.message, "err"); }
      });
    };
    const soon = () => { clearTimeout(timer); page = 0; timer = setTimeout(run, 320); };
    host.querySelector("#disc-q").oninput = soon;
    host.querySelector("#disc-svc").oninput = soon;
    ["#disc-date", "#disc-time", "#disc-rating", "#disc-avail"].forEach(sel => host.querySelector(sel).onchange = () => { page = 0; run(); });
    host.querySelectorAll(".disc-cats .chip").forEach(c => c.onclick = () => { host.querySelectorAll(".disc-cats .chip").forEach(x => x.classList.toggle("active", x === c)); page = 0; run(); });
    host.querySelector("#disc-near").onclick = async () => {
      if (geo) { geo = null; discover(host, onOpen); return; }
      const p = await Locate.locate("discover");
      if (p) { geo = { lat: +Number(p.lat).toFixed(4), lng: +Number(p.lng).toFixed(4) }; discover(host, onOpen); }
    };
    run();
  }
  function card(s) {
    const initial = `<span class="disc-initial">${E((s.name || "S").trim().charAt(0))}</span>`;
    const logo = initial + (s.logo_url ? `<img src="${E(s.logo_url)}" alt="" loading="lazy" decoding="async" onerror="this.remove()">` : "");
    const a = s.availability;
    const avail = !a ? "" : a.outside_window ? `<span class="disc-avail none">${E(Lang.t("خارج أيام الحجز المتاحة"))}</span>`
      : !a.nearest ? `<span class="disc-avail none">${E(Lang.t("لا مواعيد متاحة في هذا اليوم"))}</span>`
      : a.exact ? `<span class="disc-avail ok">${UI.icon("check", 13)} ${E(pick(`متاح ${UI.timeAr(a.nearest)}`, `Free at ${UI.timeAr(a.nearest)}`, `פנוי ב־${UI.timeAr(a.nearest)}`))}</span>`
      : `<span class="disc-avail near">${UI.icon("clock", 13)} ${E(pick(`أقرب وقت ${UI.timeAr(a.nearest)}`, `Nearest ${UI.timeAr(a.nearest)}`, `הכי קרוב ${UI.timeAr(a.nearest)}`))}</span>`;
    return `<button class="disc-card" data-open-salon="${E(s.slug)}">
      <span class="disc-logo">${logo}</span>
      <span class="disc-main"><b data-i18n-skip>${E(s.name)}</b>
        <small>${[...catLabel(s).map(l => E(Lang.t(l))), s.city ? `<span data-i18n-skip>${E(s.city)}</span>` : "", s.distance_km != null ? E(pick(`${Lang.number(s.distance_km)} كم`, `${s.distance_km} km`, `${s.distance_km} ק״מ`)) : ""].filter(Boolean).join(" · ")}</small>
        ${s.about ? `<small class="disc-about" data-i18n-skip>${E(s.about)}</small>` : ""}
        ${s.rating != null ? `<span class="disc-rating" aria-label="${E(pick(`التقييم ${Lang.number(s.rating)} من 5`, `Rated ${s.rating} out of 5`, `דירוג ${s.rating} מתוך 5`))}"><svg class="disc-star" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8l2.83 5.74 6.33.92-4.58 4.46 1.08 6.3L12 17.25l-5.66 2.97 1.08-6.3-4.58-4.46 6.33-.92z"/></svg><b>${E(Lang.number(s.rating))}</b></span>` : ""}
        <span class="disc-tags">${(s.services || []).slice(0, 3).map(x => `<span class="disc-svc" data-i18n-skip>${E(x.name)}${x.price != null ? ` · ${E(UI.money(x.price))}` : ""}</span>`).join("")}${s.service_count > 3 ? `<span class="disc-more">+${Lang.number(s.service_count - 3)}</span>` : ""}</span>
        ${avail}${s.online_booking === false ? `<span class="disc-closed info">${UI.icon("calendar", 13)} ${E(Lang.t("الحجز عبر التطبيق غير متاح بعد"))}</span>`
          : s.accepts_new_customers === false ? `<span class="disc-closed">${E(Lang.t("لا يستقبل عملاء جدداً حالياً"))}</span>` : s.accepts_new_bookings === false ? `<span class="disc-closed">${E(Lang.t("الحجز للعملاء الحاليين فقط"))}</span>` : ""}</span>
      ${UI.icon("chev", 18)}</button>`;
  }

  // ── Help / FAQ ─────────────────────────────────────────────────────────
  const FAQ_CATS = { getting_started: "البداية", bookings: "الحجوزات", team: "الفريق", services: "الخدمات والباقات", checkout: "الدفع والمبيعات",
    customers: "العملاء", marketing: "التسويق والولاء", settings: "الإعدادات", account: "الحساب", general: "عام" };
  const pickText = obj => { const o = obj || {}; return o[Lang.get()] || o.en || o.ar || o.he || ""; };
  function videoEmbed(url) {
    const u = String(url || "");
    let m = u.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{6,20})/);
    if (m) return `<div class="faq-video"><iframe src="https://www.youtube-nocookie.com/embed/${E(m[1])}" title="video" loading="lazy" allow="encrypted-media; picture-in-picture" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>`;
    m = u.match(/vimeo\.com\/(\d{5,12})/);
    if (m) return `<div class="faq-video"><iframe src="https://player.vimeo.com/video/${E(m[1])}" title="video" loading="lazy" allow="fullscreen; picture-in-picture" allowfullscreen></iframe></div>`;
    if (/\.(mp4|webm|m4v)(\?|$)/i.test(u)) return `<video class="faq-video-file" src="${E(u)}" controls preload="none" playsinline></video>`;
    return `<a class="btn line sm" href="${E(u)}" target="_blank" rel="noopener">${UI.icon("eye", 15)} ${E(Lang.t("شاهد الفيديو"))}</a>`;
  }
  async function helpPage(body, audience) {
    body.innerHTML = UI.loading();
    let list;
    try { list = await platformRpc("salonieer_faq_v1", { p_audience: audience || "admins" }); }
    catch (e) { body.innerHTML = `<div class="card">${E(Lang.error(e))}</div>`; return; }
    const draw = q => {
      const needle = String(q || "").trim().toLocaleLowerCase();
      const hit = needle ? list.filter(x => (pickText(x.question) + " " + pickText(x.answer)).toLocaleLowerCase().includes(needle)) : list;
      const groups = Object.keys(FAQ_CATS).map(c => [c, hit.filter(x => x.category === c)]).filter(([, xs]) => xs.length);
      return hit.length ? groups.map(([c, xs]) => `${groups.length > 1 ? `<div class="sec-label">${E(Lang.t(FAQ_CATS[c]))}</div>` : ""}<div class="faq-list">${xs.map(x => `<details class="faq-item"><summary><span data-i18n-skip>${E(pickText(x.question))}</span>${x.video_url ? `<span class="faq-has-video" title="video">${UI.icon("eye", 14)}</span>` : ""}${UI.icon("down", 18)}</summary>
          <div class="faq-answer">${pickText(x.answer) ? `<p data-i18n-skip>${E(pickText(x.answer))}</p>` : ""}${x.video_url ? videoEmbed(x.video_url) : ""}</div></details>`).join("")}</div>`).join("")
        : UI.empty(Lang.t(needle ? "لا نتائج" : "لا توجد أسئلة بعد"), Lang.t(needle ? "جرّب كلمة أخرى." : "سيضيف فريق METON الإجابات هنا."));
    };
    body.innerHTML = `<div class="faq-page"><label class="studio-search">${UI.icon("search", 19)}<input id="faq-q" placeholder="${E(Lang.t("ابحث في الأسئلة"))}" autocomplete="off" aria-label="${E(Lang.t("البحث"))}"></label><div id="faq-body">${draw("")}</div>
      <p class="tiny faq-foot">${E(Lang.t("لم تجد إجابتك؟ تواصل مع METON من الموقع: meton.work/support"))}</p></div>`;
    let t; body.querySelector("#faq-q").oninput = e => { clearTimeout(t); t = setTimeout(() => { const h = body.querySelector("#faq-body"); if (h) h.innerHTML = draw(e.target.value); }, 150); };
  }
  // #/help for specialists and customers (admins have it in their dashboard).
  async function helpRoute() {
    const role = App.user?.role === "admin" ? "admins" : (App.user?.role === "barber" || App.user?.barber_id) ? "staff" : "customers";
    UI.render(`${UI.header({ title: Lang.t("المساعدة والأسئلة الشائعة"), back: "#/settings" })}<div class="content"><div class="center-col" id="help-host"></div></div>`);
    await helpPage(document.getElementById("help-host"), role);
  }

  // ── Ratings ────────────────────────────────────────────────────────────
  // ── Ratings (2.34) ─────────────────────────────────────────────────────
  // The server decides when to ask: after 3 completed visits with the salon
  // (or 3 with one specialist), about two hours after the latest one, and
  // again only after 3 more visits and 90 days. The card shows on the home
  // screen (never while booking or paying), once per app session. Tapping a
  // star only selects it; nothing is saved until "Confirm rating".
  const SEEN_KEY = "salonieer:rating-asked";
  async function ratingPrompt(host) {
    if (!host || !Auth.isLoggedIn() || Auth.isGuest?.()) return;
    try { if (sessionStorage.getItem(SEEN_KEY + ":" + Shop.slug())) return; } catch {}
    let p; try { p = await rpc("rating_prompt", { p_token: App.token }); } catch { return; }
    if (!p || !p.target_type || !host.isConnected) return;
    try { sessionStorage.setItem(SEEN_KEY + ":" + Shop.slug(), "1"); } catch {}
    // Shown now: this counts as asking, on every device of this person.
    rpc("rating_seen", { p_token: App.token, p_target_type: p.target_type, p_target_id: p.target_id || null }).catch(() => {});
    const salon = p.target_type === "salon";
    let stars = Number(p.stars) || 0;
    const words = ["", "سيئة", "مقبولة", "جيدة", "جيدة جداً", "ممتازة"];
    const paint = () => {
      host.innerHTML = `<section class="rate-card" role="group" aria-label="${E(Lang.t("التقييم"))}">
        <div class="rate-head">${salon ? UI.icon("scissors", 20) : p.image_url ? `<img class="rate-av" src="${E(p.image_url)}" alt="" data-initial="${E(String(p.name || "؟").trim().charAt(0))}">` : `<span class="rate-av">${E(String(p.name || "؟").trim().charAt(0))}</span>`}
          <div><b>${E(Lang.t(salon ? "كيف تقيّم العمل؟" : "كيف تقيّم المختص؟"))}</b><small><span data-i18n-skip>${E(p.name || "")}</span> · ${E(pick(`${Lang.number(p.visits)} زيارات`, `${p.visits} visits`, `${p.visits} ביקורים`))}</small></div></div>
        <div class="rate-stars" role="radiogroup" aria-label="${E(Lang.t("عدد النجوم"))}">${[1, 2, 3, 4, 5].map(n => `<button type="button" role="radio" aria-checked="${n === stars}" aria-label="${n}" data-star="${n}" class="${n <= stars ? "on" : ""}">${UI.icon("star", 28)}</button>`).join("")}</div>
        <p class="rate-chosen" aria-live="polite">${stars ? `${E(pick(`اخترت ${Lang.number(stars)} من 5`, `You chose ${stars} of 5`, `בחרת ${stars} מתוך 5`))} · ${E(Lang.t(words[stars]))}` : E(Lang.t("اختر عدد النجوم"))}</p>
        <div class="btn-row"><button type="button" class="btn sm" id="rate-ok" ${stars ? "" : "disabled"}>${UI.icon("check", 15)} ${E(Lang.t("تأكيد التقييم"))}</button>
          <button type="button" class="btn ghost sm" data-rate-later>${E(Lang.t("ليس الآن"))}</button></div>
        <p class="form-error" id="rate-err" role="alert"></p>
        <p class="tiny">${E(Lang.t("تقييمك بدون اسم: العمل لا يعرف من قيّم."))}${p.stars ? " " + E(Lang.t("يحل تقييمك الجديد محل السابق.")) : ""}</p></section>`;
      host.querySelectorAll("[data-star]").forEach(b => b.onclick = () => { stars = Number(b.dataset.star); paint(); host.querySelector(`[data-star="${stars}"]`)?.focus(); });
      host.querySelector("[data-rate-later]").onclick = () => send(null);
      host.querySelector("#rate-ok").onclick = () => send(stars);
    };
    const send = async value => {
      host.querySelectorAll("button").forEach(b => b.disabled = true);
      try { await rpc("rate_target", { p_token: App.token, p_target_type: p.target_type, p_target_id: p.target_id || null, p_stars: value }); }
      catch (e) {
        if (!/already_rated|سبق أن قيّمت/i.test(e.rawMessage || "")) { const err = host.querySelector("#rate-err"); if (err) err.textContent = e.message; host.querySelectorAll("button").forEach(b => b.disabled = false); if (!stars) host.querySelector("#rate-ok").disabled = true; return; }
      }
      host.innerHTML = value ? `<section class="rate-card done">${UI.icon("check", 18)} <b>${E(Lang.t("شكراً لتقييمك"))}</b></section>` : "";
      if (value) setTimeout(() => { if (host.isConnected) host.innerHTML = ""; }, 2600);
    };
    paint();
  }
  // Salon admin: rounded averages only, once three people rated.
  async function ratingCard(host, token) {
    if (!host) return;
    let r; try { r = await rpc("admin_rating_summary", { p_token: token }); } catch { return; }
    if (!host.isConnected || !r) return;
    const specs = (r.specialists || []).filter(s => s.enough);
    host.innerHTML = `<section class="admin-panel rating-summary"><div class="admin-panel-head"><div><span>CUSTOMER RATING</span><h2>${E(Lang.t("تقييم العمل"))}</h2></div></div>
      ${r.enough ? `<div class="rating-big"><strong>★ ${E(Lang.number(r.average))}</strong><small>${E(Lang.t("من 5 · متوسط تقييمات العملاء بعد زياراتهم المكتملة"))}</small></div>`
        : `<p class="muted">${E(Lang.t("يظهر المتوسط عندما يقيّم عدد كافٍ من العملاء. التقييمات بدون أسماء لحماية خصوصية العملاء."))}</p>`}
      ${specs.length ? `<ul class="biz-mini rating-specs">${specs.map(s => `<li><span data-i18n-skip>${E(s.name)}</span><b>★ ${E(Lang.number(s.average))}</b></li>`).join("")}</ul>` : ""}
      <p class="tiny">${E(Lang.t("يُطلب التقييم بعد ثلاث زيارات مكتملة مع العمل أو مع المختص نفسه، ولا يُطلب من الفريق أو المالك."))}</p></section>`;
  }

  // ── App update check (native apps only) ────────────────────────────────
  const cmp = (a, b) => { const x = String(a).split(".").map(Number), y = String(b).split(".").map(Number);
    for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d > 0 ? 1 : -1; } return 0; };
  async function updateCheck() {
    const platform = document.documentElement.dataset.native;
    if (!window.NativeBridge?.available() || !["android", "ios"].includes(platform)) return;
    let info; try { info = await NativeBridge.request("appInfo"); } catch { return; }   // builds before 2.27 cannot say their version
    const installed = String((typeof info === "string" ? info : info?.version) || "");
    if (!/^\d+(\.\d+)*$/.test(installed)) return;
    let rel; try { rel = await platformRpc("salonieer_app_release_v1", { p_platform: platform }); } catch { return; }
    if (!rel || !/^https:\/\//.test(rel.store_url || "")) return;
    const forced = rel.min_version && cmp(installed, rel.min_version) < 0;
    const newer = rel.latest_version && cmp(installed, rel.latest_version) < 0;
    if (!forced && !newer) return;
    // A recommended update is shown once per session and not again for a day.
    const seenKey = "salonieer:update-seen:" + rel.latest_version;
    if (!forced) {
      try { if (sessionStorage.getItem(seenKey) || Number(localStorage.getItem(seenKey) || 0) > Date.now() - 86400000) return; } catch {}
      try { sessionStorage.setItem(seenKey, "1"); } catch {}
    }
    const message = pickText(rel.message);
    const el = document.createElement("div");
    el.className = "update-gate" + (forced ? " forced" : "");
    el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true");
    el.innerHTML = `<div class="update-card"><span class="update-icon">${UI.icon("refresh", 26)}</span>
      <h2>${E(Lang.t(forced ? "يلزم تحديث التطبيق" : "يتوفر إصدار جديد"))}</h2>
      <p>${E(Lang.t(forced ? "هذا الإصدار لم يعد مدعوماً. حدّث التطبيق من المتجر للمتابعة." : "حدّث التطبيق للحصول على أحدث الميزات والإصلاحات."))}</p>
      ${message ? `<p class="tiny" data-i18n-skip>${E(message)}</p>` : ""}
      <p class="tiny update-versions" dir="ltr">${E(installed)} → ${E(rel.latest_version || rel.min_version)}</p>
      <a class="btn" href="${E(rel.store_url)}" target="_blank" rel="noopener">${E(Lang.t(platform === "ios" ? "التحديث من App Store" : "التحديث من Google Play"))}</a>
      ${forced ? "" : `<button class="btn line" type="button" data-update-later>${E(Lang.t("لاحقاً"))}</button>`}</div>`;
    document.body.appendChild(el);
    const later = el.querySelector("[data-update-later]");
    if (later) later.onclick = () => { try { localStorage.setItem(seenKey, String(Date.now())); } catch {} el.remove(); };
    // A required update stays in front of everything, including the back button.
    if (forced) { document.documentElement.classList.add("update-required"); window.NativeBridge.back = () => true; }
  }

  return { discover, joinCard, joinUrl, helpPage, helpRoute, ratingPrompt, ratingCard, updateCheck, register(router) { router.add("#/help", helpRoute, { nav: true, guard: "auth" }); } };
})();

/* Tap guard: a tap that waits on the server (opening Checkout, completing a
   visit, saving…) shows a loading screen after a moment instead of nothing,
   and that screen takes every tap until the answer is in, so repeated or
   random presses can't start more work. Background reads (cache refreshes,
   prefetching, live polling) never show it, and a page change hands over to
   the page's own loading skeleton. */
window.TapGuard = (() => {
  "use strict";
  // 2.32: the cover waits before it appears — 0.45 s for a change (save,
  // complete…), 0.9 s for a read (opening a sheet) — so ordinary taps never
  // flash a loading screen; only a genuinely slow answer gets one (and the
  // double-tap protection that comes with it).
  const TAP_WINDOW = 400, SHOW_AFTER = 450, SHOW_AFTER_READ = 900, GRACE = 120, MIN_VISIBLE = 280, MAX_WAIT = 25000;
  let tapAt = -1e9, pending = 0, gen = 0, el = null, shownAt = 0;
  let showTimer = null, hideTimer = null, watchdog = null;
  const now = () => performance.now();
  document.addEventListener("click", e => {
    if (!e.isTrusted || !e.target?.closest) return;
    if (e.target.closest(".tap-guard")) return;
    if (e.target.closest("button,a,[role=button],[data-act],[data-nav],.clickable,.lrow,.chip,.slot,.seg button,input[type=checkbox],input[type=radio]")) tapAt = now();
  }, true);
  // A new page draws its own skeleton.
  window.addEventListener("hashchange", () => { tapAt = -1e9; reset(); });
  function busy() { return pending > 0 || hideTimer !== null || el !== null; }
  function track(write = true) {
    if ((window.__rpcQuiet || 0) > 0) return null;
    if (!busy() && now() - tapAt > TAP_WINDOW) return null;
    const mine = gen;
    pending++;
    clearTimeout(hideTimer); hideTimer = null;
    if (!el && !showTimer) showTimer = setTimeout(show, write ? SHOW_AFTER : SHOW_AFTER_READ);
    let settled = false;
    return () => {
      if (settled || mine !== gen) return;
      settled = true; pending = Math.max(0, pending - 1);
      // Wait a beat: the next call of the same action usually starts right away.
      if (!pending) hideTimer = setTimeout(() => { hideTimer = null; if (!pending) hide(); }, GRACE);
    };
  }
  function show() {
    showTimer = null;
    if (!pending || el) return;
    el = document.createElement("div");
    el.className = "tap-guard";
    el.setAttribute("role", "status");
    el.setAttribute("aria-live", "polite");
    el.innerHTML = `<div class="tap-guard-card"><span class="tap-guard-spin" aria-hidden="true"></span><b data-i18n-skip>${UI.esc(Lang.t("جارٍ التحميل…"))}</b></div>`;
    // Swallow every tap and key press while it is up.
    for (const type of ["click", "pointerdown", "touchstart", "mousedown"]) el.addEventListener(type, e => { e.preventDefault(); e.stopPropagation(); }, { passive: false });
    document.body.appendChild(el);
    shownAt = now();
    requestAnimationFrame(() => el && el.classList.add("show"));
    watchdog = setTimeout(reset, MAX_WAIT);
  }
  function hide() {
    clearTimeout(showTimer); showTimer = null;
    if (!el) return;
    const node = el, left = MIN_VISIBLE - (now() - shownAt);
    el = null; clearTimeout(watchdog); watchdog = null;
    setTimeout(() => node.remove(), Math.max(0, left));
  }
  function reset() { gen++; pending = 0; clearTimeout(hideTimer); hideTimer = null; hide(); }
  document.addEventListener("keydown", e => { if (el) { e.preventDefault(); e.stopPropagation(); } }, true);
  // Run fn without counting its calls as the person waiting.
  function quiet(fn) { window.__rpcQuiet = (window.__rpcQuiet || 0) + 1; try { return fn(); } finally { window.__rpcQuiet--; } }
  return { track, quiet, reset, get active() { return el !== null; } };
})();
