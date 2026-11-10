// booking.js — customer pages: home (specialists), specialist profile,
// booking flow, my bookings, booking details, products.

const BookingPages = (() => {

  // The unread count decorates the bell; nothing waits on it. It updates the
  // dot in place once it lands instead of holding the page back.
  let unreadAt = 0, unreadInflight = null;
  // A booking, a cancellation or any other write usually creates a
  // notification, so the bell is re-checked right after instead of up to
  // 30 seconds later.
  document.addEventListener("salonieer:data-changed", () => { unreadAt = 0; });
  function refreshUnread(after, force) {
    if (!Auth.isLoggedIn()) return Promise.resolve(0);
    if (!force && Date.now() - unreadAt < 30000) return Promise.resolve(App.unread);
    if (unreadInflight) return unreadInflight;
    unreadAt = Date.now();
    unreadInflight = Push.call('inbox', { p_slug: Shop.slug(), p_token: App.token })
      .then(feed => {
        const next = feed.unread || 0;
        const changed = next !== App.unread;
        App.unread = next;
        paintUnread();
        if (changed && typeof after === "function") after(next);
        return next;
      })
      .catch(() => App.unread)
      .finally(() => { unreadInflight = null; });
    return unreadInflight;
  }
  function paintUnread() {
    const on = App.unread > 0;
    document.querySelectorAll(".bell").forEach(b => {
      const dot = b.querySelector(".dot");
      if (on && !dot) b.insertAdjacentHTML("beforeend", '<span class="dot"></span>');
      if (!on && dot) dot.remove();
    });
    document.querySelectorAll('.navitem[data-nav="#/notifications"] .nav-symbol').forEach(sym => {
      const dot = sym.querySelector(".nav-dot");
      if (on && !dot) sym.insertAdjacentHTML("beforeend", '<span class="nav-dot"></span>');
      if (!on && dot) dot.remove();
    });
  }

  // The next appointment that still lies ahead (or is happening now). A
  // request whose time has already passed is not "upcoming" any more.
  const upcomingOf = rows => Smart.sortForAttention((rows || [])
    .filter(b => Smart.isActive(b) && !["finished", "expired"].includes(Smart.phase(b))))[0];

  function appointmentCard(b) {
    if (!b) return "";
    // Text gets the full width; status, countdown and the "free with coins"
    // mark (added by loyalty.js) wrap on their own row underneath.
    return `<button class="studio-appointment appt-card" data-nav="#/booking/${UI.esc(b.id)}">
      <span class="studio-date"><b>${Lang.number(new Date(b.booking_date + "T00:00:00").getDate())}</b><small>${UI.esc(Smart.dayLabel(b.booking_date))}</small></span>
      <span class="studio-appointment-main"><small>موعدك القادم</small><b data-i18n-skip>${UI.esc(b.service_name || b.barber_name)}</b>
        <span><bdi>${UI.esc(b.barber_name)}</bdi> · ${UI.timeAr(b.booking_time)}</span></span>
      <span class="appt-go" aria-hidden="true">${UI.icon("chev", 18)}</span>
      <span class="appt-tags">${UI.badge(b.status)}${Smart.phaseChip(b)}</span></button>`;
  }

  // One gentle suggestion under the appointment card: finish a booking that
  // was started and not confirmed, or book the usual service again. Never
  // acts on its own — it is a shortcut the person can ignore.
  function suggestionCard(upcoming) {
    if (!Auth.isLoggedIn()) return "";
    const draft = Smart.memory.draft();
    if (draft && draft.barberId) {
      return `<div class="smart-suggest"><span class="smart-suggest-icon">${UI.icon("clock", 18)}</span>
        <div><small>أكمل من حيث توقفت</small><b data-i18n-skip>${UI.esc(draft.serviceName || "")}${draft.serviceName && draft.barberName ? " · " : ""}${UI.esc(draft.barberName || "")}</b></div>
        <button class="btn sm" data-nav="#/book/${UI.esc(draft.barberId)}${draft.serviceId ? `?service=${UI.esc(draft.serviceId)}` : ""}">متابعة الحجز</button>
        <button class="iconbtn sm" id="smart-draft-dismiss" aria-label="إخفاء">${UI.icon("x", 16)}</button></div>`;
    }
    const last = Smart.memory.get("last");
    if (!upcoming && last && last.barberId) {
      return `<div class="smart-suggest"><span class="smart-suggest-icon">${UI.icon("refresh", 18)}</span>
        <div><small>احجز مجدداً</small><b data-i18n-skip>${UI.esc(last.serviceName || "")}${last.serviceName && last.barberName ? " · " : ""}${UI.esc(last.barberName || "")}</b></div>
        <button class="btn sm" data-nav="#/book/${UI.esc(last.barberId)}${last.serviceId ? `?service=${UI.esc(last.serviceId)}` : ""}">احجز</button></div>`;
    }
    return "";
  }
  function wireSuggestion() {
    const dismiss = document.getElementById("smart-draft-dismiss");
    if (dismiss) dismiss.onclick = () => { Smart.memory.clearDraft(); const host = document.getElementById("home-suggest"); if (host) host.innerHTML = suggestionCard(null); };
  }

  // ---- HOME ----
  // 2.30: browsing without being signed in to this salon — a guest, or an
  // account whose record here still has to be linked.
  function guestCard() {
    const slug = Platform.current()?.slug;
    // 2.41: blocked by this salon — said plainly (no sign-in button that cannot help).
    if (window.Account?.signedIn() && Account.blockedHere?.(slug)) {
      return `<div class="card pad-lg acc-home-card acc-blocked"><b>${Lang.t("هذا الحساب موقوف")}</b><p class="muted">${Lang.t("هذا الحساب موقوف في هذا العمل. تواصل مع العمل")}</p><button class="btn sm line" id="home-blocked-salons" type="button">${Lang.t("أعمالي")}</button></div>`;
    }
    // 2.46: an account made with an email adds its phone number before it books here (the business needs it).
    if (window.Account?.signedIn() && Account.phoneRequired?.(slug)) {
      return `<div class="card pad-lg acc-home-card"><b>${Lang.t("أضف رقم هاتفك")}</b><p class="muted">${Lang.t("يحتاج العمل رقم هاتفك للتواصل معك بخصوص مواعيدك.")}</p><button class="btn sm" id="home-guest-signin" type="button">${Lang.t("إضافة رقم الهاتف")}</button></div>`;
    }
    if (window.Account?.signedIn() && Account.linkRequired(slug)) {
      return `<div class="card pad-lg acc-home-card"><b>${Lang.t("اربط حسابك بهذا العمل")}</b><p class="muted">${Lang.t("يوجد لدى هذا العمل حساب سابق برقم هاتفك. اربطه لترى حجوزاتك وتحجز.")}</p><button class="btn sm" id="home-guest-signin" type="button">${Lang.t("ربط الحساب")}</button></div>`;
    }
    if (slug === "demo001" && !window.Account?.isGuest()) return `<div class="card pad-lg"><b>${Lang.t("تصفح العمل التجريبي")}</b><p class="muted">${Lang.t("يمكنك تصفح الخدمات والأوقات دون حساب.")}</p>${Lang.selector()}</div>`;
    return `<div class="card pad-lg acc-home-card"><b>${Lang.t("أنت تتصفح كضيف")}</b><p class="muted">${Lang.t("يمكنك تصفح الخدمات والأوقات دون حساب. سجّل الدخول لتأكيد الحجز.")}</p><button class="btn sm" id="home-guest-signin" type="button">${Lang.t("تسجيل الدخول")}</button></div>`;
  }

  async function home() {
    const s = App.settings || {};
    if (s.maintenance_mode) {
      UI.render(`${UI.header({ title: s.app_name })}
        <div class="content"><div class="center-col"><div class="banner"><div class="ec">${UI.icon("cog", 28)}</div>
        <h3>التطبيق تحت الصيانة</h3><p class="muted">${UI.esc(s.closed_message || "سنعود قريباً.")}</p></div></div></div>`);
      return;
    }

    // Whatever this device already has paints now; the rest arrives without
    // holding the screen. Nothing below blocks the first frame.
    const team = rpcStale("list_barbers", { p_only_active: true });
    const mine = Auth.isLoggedIn() ? rpcStale("my_bookings", { p_token: App.token, p_limit: 5, p_offset: 0 }, 20000) : null;
    const teamRequest = team.refresh;
    const mineRequest = mine ? mine.refresh.catch(() => []) : Promise.resolve([]);
    let barbers = team.value || await teamRequest;
    let upcoming = upcomingOf(mine?.value);
    // METON booking order (decision record v2.0): service → specialist → time. The salon-wide service list comes
    // first; the specialist grid below stays for people who already know who they want.
    const svcs = rpcStale("list_services", { p_only_enabled: true }, 60000);
    let serviceList = svcs.value || [];

    paint();
    svcs.refresh.then(rows => {
      if (!rows || JSON.stringify(rows) === JSON.stringify(serviceList)) return;
      serviceList = rows;
      const host = document.getElementById("home-services"), list = document.getElementById("home-service-list");
      if (!host || !list) return;
      list.innerHTML = rows.map(serviceRow).join("");
      host.hidden = !rows.length;
      const count = document.getElementById("services-count");
      if (count) count.textContent = rows.length;
    }).catch(() => {});

    // 2.31 layout: the salon's identity, a greeting that reads as the page
    // title, then only what applies to this person (next visit, suggestion,
    // wallet and packages side by side, rating) and the team. Sections with
    // nothing to show take no room at all (see brand.css).
    function paint() {
      const closed = !s.shop_open, offline = s.online_booking === false;
      const status = closed ? ["off", "مغلق الآن"] : offline ? ["muted", "الحجز عبر التطبيق غير متاح بعد"] : ["on", "مفتوح للحجز"];
      const tiles = (Auth.isLoggedIn() && window.Loyalty ? Loyalty.homeChip() : "")
        + (Features.enabled("service_packages") && !Auth.isGuest() ? `<button class="home-pkg-chip" data-nav="#/packages">${UI.icon("star", 18)}<span><b>${Lang.t("باقات الجلسات")}</b><small>${Lang.t("وفّر مع باقة واطلبها، وتابع جلساتك المتبقية")}</small></span>${UI.icon("chev", 16)}</button>` : "");
      UI.render(`
        <section class="stage studio-home-top salon-hero">
          <div class="studio-identity">${UI.logoImg("", UI.esc(s.app_name || "العمل"), {size:56})}<div><b>${UI.esc(s.app_name || "METON")}</b><small class="studio-identity-sub salon-status ${status[0]}"><i aria-hidden="true"></i>${status[1]}</small></div></div>
          <div class="stage-actions">
            <button class="iconbtn" data-nav="#/salons" aria-label="تغيير العمل">${UI.icon("grid", 20)}</button>
          </div>
        </section>
        <div class="content studio-home home-v2">
          ${closed ? `<div class="studio-notice">${UI.icon("clock", 20)}<div><b>العمل مغلق حالياً</b>${s.closed_message ? `<p>${UI.esc(s.closed_message)}</p>` : ""}</div></div>` : ""}
          <header class="home-greet">${Auth.isLoggedIn()
            ? `<h1 class="smart-greeting" data-i18n-skip>${UI.esc(Smart.greeting(Auth.displayName()))}</h1><p class="home-greet-sub">${Lang.t(offline ? "تصفح الخدمات والمختصين" : "متى تحب موعدك القادم؟")}</p>`
            : `<h1 class="smart-greeting">${Lang.t("أهلاً بك")}</h1><p class="home-greet-sub">${Lang.t("تصفح الخدمات والمختصين")}</p>`}</header>
          ${window.Team && Auth.isLoggedIn() ? Team.memberNotice() : ""}
          <div id="home-appointment">${appointmentCard(upcoming)}</div>
          <div id="home-suggest">${suggestionCard(upcoming)}</div>
          <div id="home-waitlist"></div>
          <div class="home-tiles">${tiles}</div>
          <div id="home-rating"></div>
          ${Auth.isGuest() ? guestCard() : ""}
          ${Platform.current()?.slug === "demo001" && !Auth.isGuest() && !window.Account?.signedIn() ? `<button class="btn line" id="home-demo-guest" type="button">${Lang.t("المتابعة كضيف")}</button>` : ""}
          <section class="home-services" id="home-services" aria-labelledby="home-services-title" ${serviceList.length ? "" : "hidden"}>
            <div class="studio-section-head"><h2 id="home-services-title">الخدمات</h2><span class="studio-count" id="services-count">${serviceList.length}</span></div>
            <p class="studio-hint">اختر الخدمة، ثم المختص والموعد.</p>
            <div class="list" id="home-service-list">${serviceList.map(serviceRow).join("")}</div>
          </section>
          <section class="home-team" aria-labelledby="home-team-title">
            <div class="studio-section-head"><h2 id="home-team-title">المختصون</h2><span class="studio-count" id="team-count">${barbers.length}</span></div>
            <p class="studio-hint">${serviceList.length ? "أو اختر المختص أولاً لعرض خدماته." : "اختر المختص لعرض خدماته والحجز."}</p>
            <label class="studio-search">${UI.icon("search", 19)}<input id="team-search" placeholder="ابحث عن مختص أو خدمة" autocomplete="off" aria-label="البحث"></label>
            <div class="studio-team-grid" id="team-grid">${barbers.length ? preferredFirst(barbers).map(barberTile).join("") : UI.empty("لا يوجد مختصون بعد", "سيظهر فريق العمل هنا.")}</div>
            <div id="team-empty" hidden>${UI.empty("لا توجد نتائج", "جرّب اسماً أو خدمة أخرى.")}</div>
          </section>
          <div class="home-more">
            ${window.Rework ? Rework.joinCard({ compact: true }) : ""}
          </div>
        </div>`);

      const search = document.getElementById("team-search");
      if (search) search.oninput = e => {
        const q = e.target.value.trim().toLocaleLowerCase();
        let visible = 0;
        document.querySelectorAll("[data-specialist-search]").forEach(el => {
          el.hidden = !el.dataset.specialistSearch.includes(q);
          if (!el.hidden) visible++;
        });
        document.getElementById("team-empty").hidden = visible > 0 || !barbers.length;
      };
      if (Auth.isGuest()) Lang.wireSelector();
      document.getElementById("home-demo-guest")?.addEventListener("click", () => Auth.continueAsGuest());
      document.getElementById("home-guest-signin")?.addEventListener("click", () => Router.signInPrompt());
      document.getElementById("home-blocked-salons")?.addEventListener("click", () => Router.go("#/salons"));
      window.Team?.wireMemberNotice(document.querySelector(".home-v2"));
      wireSuggestion();
    }

    // Secondary content settles in behind the painted page.
    window.Rework?.ratingPrompt(document.getElementById("home-rating"));
    window.Business?.homeWaitlist?.(document.getElementById("home-waitlist"));
    refreshUnread();
    if (Auth.isLoggedIn()) window.Loyalty?.fillHomeChip();
    teamRequest.then(rows => {
      if (!rows || JSON.stringify(rows) === JSON.stringify(barbers)) return;
      barbers = rows;
      const grid = document.getElementById("team-grid");
      if (!grid) return;
      grid.innerHTML = rows.length ? preferredFirst(rows).map(barberTile).join("") : UI.empty("لا يوجد مختصون بعد", "سيظهر فريق العمل هنا.");
      const count = document.getElementById("team-count");
      if (count) count.textContent = rows.length;
    }).catch(() => {});
    mineRequest.then(rows => {
      const next = upcomingOf(rows);
      if (JSON.stringify([next?.id, next?.status]) === JSON.stringify([upcoming?.id, upcoming?.status])) return;
      upcoming = next;
      const host = document.getElementById("home-appointment");
      if (host) host.innerHTML = appointmentCard(next);
      const tip = document.getElementById("home-suggest");
      if (tip) { tip.innerHTML = suggestionCard(next); wireSuggestion(); }
    });

    // The other primary tabs are warmed once the screen is settled, so their
    // first visit is already paid for. Nothing large, and only when idle.
    const idle = window.requestIdleCallback || (fn => setTimeout(fn, 900));
    idle(() => {
      Router.warm("#/bookings");
      if (Features.enabled("shop") && App.settings?.show_products !== false) Router.warm("#/products");
    });

    // Keep the next-appointment card and the bell honest without redrawing
    // the page under the person's finger.
    let sig = JSON.stringify([upcoming?.id, upcoming?.status, App.unread]);
    if (Auth.isLoggedIn()) Live.start(async () => {
      const rows = await rpc("my_bookings", { p_token: App.token, p_limit: 5, p_offset: 0 });
      await refreshUnread(null, true);
      const next = upcomingOf(rows);
      const fresh = JSON.stringify([next?.id, next?.status, App.unread]);
      if (fresh === sig) return;
      sig = fresh;
      upcoming = next;
      const host = document.getElementById("home-appointment");
      if (host) host.innerHTML = appointmentCard(next);
    }, 15000);
  }

  // 2.33: the customer's preferred specialist comes first (a convenience:
  // every other specialist stays one tap away). If they left, nothing breaks.
  const preferredId = () => App.team?.preferred_barber_id || null;
  function preferredFirst(list) {
    const pref = preferredId();
    return pref ? [...list].sort((a, b) => (b.id === pref) - (a.id === pref)) : list;
  }
  // portrait tile in the specialist grid
  function barberTile(b) {
    const img = b.image_url
      ? UI.img(b.image_url, { width: 240, height: 300, initial: (b.name || "؟").trim().charAt(0) })
      : `<span class="tl-ini">${UI.esc((b.name || "؟").trim().charAt(0))}</span>`;
    const fav = b.id === preferredId() ? `<span class="fav-badge">${UI.icon("star", 13)} ${UI.esc(Lang.t("المفضل لديك"))}</span>` : "";
    return `<article class="studio-specialist${fav ? " is-preferred" : ""}" data-specialist-search="${UI.esc((b.name + " " + (b.specialty || "")).toLocaleLowerCase())}">
      <button class="studio-specialist-link" data-nav="#/barber/${UI.esc(b.id)}"><span class="studio-portrait">${img}${fav}</span><span class="studio-specialist-info"><b>${UI.esc(b.name)}</b><small>${UI.esc(b.specialty || Staff.title(b))}</small></span><span class="studio-book-link">عرض الخدمات ${UI.icon("fwd", 17)}</span></button>
    </article>`;
  }

  // One service row on the home page: the first step of a booking.
  function serviceRow(sv) {
    return `<button class="lrow home-service" data-nav="#/service/${UI.esc(sv.id)}"><div class="ic">${UI.icon("scissors", 18)}</div>
      <div class="t"><b data-i18n-skip>${UI.esc(sv.name)}</b><div class="tiny">${Lang.duration(sv.duration)} · ${UI.money(sv.price)}</div></div><span class="chev">${UI.icon("chev", 18)}</span></button>`;
  }

  // ---- STEP 2: WHO OFFERS THIS SERVICE ----
  // The specialists who offer the chosen service (active and taking bookings). With exactly one, the time step
  // opens straight away; the booking page then has the service already chosen.
  async function servicePick(p) {
    const [services, team] = await Promise.all([
      rpcCached("list_services", { p_only_enabled: true }, 60000).catch(() => []),
      rpcCached("list_barbers", { p_only_active: true }).catch(() => []),
    ]);
    const sv = (services || []).find(x => String(x.id) === String(p.id));
    if (!sv) { UI.render(UI.backbar("غير موجود", "#/home") + `<div class="content">${UI.empty("الخدمة غير متاحة", "جرّب خدمة أخرى.")}</div>`); return; }
    const offers = await Promise.all((team || []).filter(b => b.accepting !== false).map(b =>
      rpcCached("barber_services_list", { p_barber: b.id }).then(list => (list || []).some(x => String(x.id) === String(sv.id)) ? b : null).catch(() => null)));
    const who = preferredFirst(offers.filter(Boolean));
    const go = b => `#/book/${encodeURIComponent(b.id)}?service=${encodeURIComponent(sv.id)}&from=service`;
    if (who.length === 1 && !p.list) { Router.rewrite(go(who[0])); return; }
    UI.render(`${UI.header({ title: "اختر المختص", sub: sv.name, back: "#/home" })}
      <div class="content"><div class="center-col">
        <div class="card row between" style="gap:10px"><div style="min-width:0"><b data-i18n-skip>${UI.esc(sv.name)}</b>
          <div class="kv">${UI.icon("clock", 13)} ${Lang.duration(sv.duration)}</div></div>
          <div style="color:var(--accent-ink);font-weight:800;white-space:nowrap">${UI.money(sv.price)}</div></div>
        <div class="section-title">مع من تحب موعدك؟</div>
        ${who.length ? `<div class="studio-team-grid">${who.map(b => barberTile(b).replace(`data-nav="#/barber/${UI.esc(b.id)}"`, `data-nav="${UI.esc(go(b))}"`).replace("عرض الخدمات", "اختر الموعد")).join("")}</div>`
          : UI.empty("لا يقدّم أي مختص هذه الخدمة حالياً", "جرّب خدمة أخرى أو تواصل مع العمل.")}
      </div></div>`);
  }

  // Staff who book for customers: owners, specialists, members allowed to manage bookings (2.33).
  const isStaffUser = () => Auth.isAdmin() || App.user?.role === "barber" || !!App.user?.barber_id || Auth.can("bookings_manage");

  // ---- BARBER PROFILE ----
  async function barberProfile(p) {
    // Both reads leave together: the profile never waits for one round trip
    // to finish before starting the next.
    const [b, services] = await Promise.all([
      rpcCached("get_barber", { p_id: p.id }),
      rpcCached("barber_services_list", { p_barber: p.id }).catch(() => []),
    ]);
    if (!b) { UI.render(UI.backbar("غير موجود", "#/home") + `<div class="content">${UI.empty("المختص غير موجود", "")}</div>`); return; }
    const ava = b.image_url ? UI.img(b.image_url, { className: "avatar-lg", width: 160, height: 160, eager: true, initial: (b.name || "؟").trim().charAt(0) })
      : `<div class="avatar-lg" style="display:grid;place-items:center;color:var(--brand-ink)">${UI.icon("user", 42)}</div>`;
    const s = App.settings || {};
    const days = (b.schedule || {});
    const openDays = UI.AR_DAYS.map((d, i) => days[i] && days[i].on ? Lang.t(d) : null).filter(Boolean);

    UI.render(`${UI.header({ title: b.name, sub: Staff.title(b), back: "#/home" })}
      <div class="content">
        <div class="grid g2" style="align-items:start">
          <div class="card pad-lg" style="text-align:center">
            ${ava}
            <h2 style="margin:12px 0 2px;font-size:20px">${UI.esc(b.name)}</h2>
            <div class="muted"><span>${UI.esc(Staff.title(b))}</span>${b.specialty ? " · " : ""}<bdi>${b.specialty ? UI.esc(b.specialty) : ""}</bdi></div>
            <div id="bp-rating" class="bp-rating"></div>
            <div class="contact-mini">
              ${!Auth.isGuest() && b.phone ? `<a href="https://wa.me/${b.phone.replace(/[^0-9]/g, "")}" target="_blank" rel="noopener" aria-label="واتساب">${UI.icon("whatsapp", 17)}</a>` : ""}
            </div>
            ${b.description ? `<p class="muted" style="margin-top:10px">${UI.esc(b.description)}</p>` : ""}
            ${Auth.isLoggedIn() && App.user?.role === "user" && App.team ? `<button type="button" class="btn line sm fav-toggle ${preferredId() === b.id ? "on" : ""}" id="bp-fav" aria-pressed="${preferredId() === b.id}">${UI.icon("star", 15)} <span>${UI.esc(Lang.t(preferredId() === b.id ? "المختص المفضل لديك" : "اجعله المختص المفضل"))}</span></button>` : ""}
            ${openDays.length ? `<div class="divider"></div>
              <div class="kv" style="justify-content:center;flex-wrap:wrap">${UI.icon("calendar", 14)} ${Lang.t("أيام العمل")}: ${openDays.join(Lang.get()==="ar" ? "، " : ", ")}</div>` : ""}
          </div>

          <div style="display:flex;flex-direction:column;gap:14px">
            <div class="section-title">الخدمات</div>
            ${!services.length ? UI.empty("لا توجد خدمات", "لم تتم إضافة خدمات لهذا المختص بعد.") :
        `<div class="list">${services.map(sv => `<div class="card row between" style="gap:10px">
                <div style="min-width:0"><b>${UI.esc(sv.name)}</b>
                  <div class="kv">${UI.icon("clock", 13)} ${Lang.duration(sv.duration)}</div></div>
                <div style="color:var(--accent-ink);font-weight:800;white-space:nowrap">${UI.money(sv.price)}</div></div>`).join("")}</div>`}
            ${s.online_booking === false && !isStaffUser() ? `<div class="booking-off compact">${UI.icon("calendar", 20)}<div><b>${Lang.t("الحجز عبر التطبيق غير متاح بعد")}</b><p>${Lang.t("تواصل مع العمل لحجز موعدك.")}</p></div></div>` : `
            <button class="btn" data-nav="#/book/${b.id}" ${(!b.is_active || !s.shop_open || s.maintenance_mode) ? "disabled" : ""}>
              ${UI.icon("calendar", 18)} ${b.is_active && s.shop_open ? "احجز موعد" : "غير متاح للحجز"}</button>`}
            <div id="bp-packages" class="bp-packages"></div>
          </div>
        </div>
      </div>`);
    window.Business?.packageCatalog(document.getElementById("bp-packages"), b.id);
    // 2.34: the specialist's average, shown once three people rated (never how many).
    rpcCached("barber_rating", { p_barber: b.id }, 60000).then(r => {
      const host = document.getElementById("bp-rating");
      if (!host || !r?.enough) return;
      host.innerHTML = `<span class="disc-rating" aria-label="${UI.esc(Smart.pick(`التقييم ${Lang.number(r.average)} من 5`, `Rated ${r.average} out of 5`, `דירוג ${r.average} מתוך 5`))}"><svg class="disc-star" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8l2.83 5.74 6.33.92-4.58 4.46 1.08 6.3L12 17.25l-5.66 2.97 1.08-6.3-4.58-4.46 6.33-.92z"/></svg><b>${UI.esc(Lang.number(r.average))}</b></span>`;
    }).catch(() => {});
    const fav = document.getElementById("bp-fav");
    if (fav) fav.onclick = async () => {
      const next = preferredId() === b.id ? null : b.id;
      try { await rpc("set_preferred_barber", { p_token: App.token, p_barber: next }); App.team = { ...(App.team || {}), preferred_barber_id: next }; Router.resolve(); }
      catch (e) { UI.toast(e.message, "err"); }
    };
  }

  // Calendar days a customer may book ahead, today included (1–60, default 3).
  // Specialists and salon admins book for their customers up to a month ahead
  // (2.29; the server applies the same rule).
  // (barberProfile fills #bp-packages with the packages valid with this specialist.)
  function bookingWindow() {
    const n = Math.round(Number(App.settings?.booking_window_days));
    const salon = n >= 1 && n <= 60 ? n : 3;
    return ["barber", "admin"].includes(App.user?.role) || Auth.can("bookings_manage") ? Math.max(salon, 30) : salon;
  }

  // ---- BOOKING FLOW ----
  const bk = { barber: null, services: [], serviceId: null, date: null, time: null, coins: null };

  async function bookingPage(p) {
    const [b, services] = await Promise.all([
      rpcCached("get_barber", { p_id: p.id }),
      rpcCached("barber_services_list", { p_barber: p.id }).catch(() => []),
    ]);
    if (!b) { UI.render(UI.backbar("غير موجود", "#/home") + `<div class="content">${UI.empty("المختص غير موجود", "")}</div>`); return; }
    bk.barber = b; bk.serviceId = null; bk.time = null; bk.coins = null; bk.packages = [];
    bk.services = services;
    // The customer's own packages valid with this specialist (shown on the summary).
    if (Auth.isLoggedIn() && Features.enabled("service_packages")) rpc("biz_list_package_catalog", { p_token: App.token, p_barber: b.id })
      .then(cat => { if (bk.barber && bk.barber.id === b.id) { bk.packages = cat.mine || []; renderSummary(); } }).catch(() => {});

    // The salon decides how far ahead customers may book (Settings → booking
    // window, default 3: today, tomorrow and the day after). Only the
    // specialist's working days inside that window are offered; the server
    // enforces the same window when the booking is made.
    const windowDays = bookingWindow();
    const days = [];
    for (let i = 0; i < windowDays; i++) {
      const d = new Date(); d.setDate(d.getDate() + i);
      const conf = (b.schedule || {})[String(d.getDay())];
      if (conf && conf.on) days.push(d);
    }
    bk.date = days.length ? toISO(days[0]) : null;
    // What this person booked with this specialist last time (this device only).
    const usual = Auth.isLoggedIn() ? Smart.memory.usualService(b.id) : null;
    // Their own upcoming bookings, for the overlap warning before confirming.
    if (Auth.isLoggedIn()) rpcPrefetch("my_bookings", { p_token: App.token, p_limit: 20, p_offset: 0 }, 15000);

    const ava = b.image_url ? UI.img(b.image_url, { className: "av-sm", width: 56, height: 56, style: "width:56px;height:56px", eager: true, initial: (b.name || "؟").trim().charAt(0) })
      : `<div class="av-sm" style="width:56px;height:56px;border-radius:18px;display:grid;place-items:center;color:var(--brand-ink)">${UI.icon("user", 26)}</div>`;

    UI.render(`${UI.header({ title: "حجز موعد", sub: "مع " + b.name, back: p.from === "service" && p.service ? `#/service/${encodeURIComponent(p.service)}?list=1` : "#/barber/" + b.id })}
      <div class="content">
        <div class="card row" style="gap:14px">
          ${ava}
          <div style="min-width:0;flex:1">
            <b style="display:block;font-size:16px">${UI.esc(b.name)}</b>
            <span class="muted"><span>${UI.esc(Staff.title(b))}</span>${b.specialty ? " · " : ""}<bdi>${b.specialty ? UI.esc(b.specialty) : ""}</bdi></span>
          </div>
          ${b.phone ? `<a class="iconbtn" href="https://wa.me/${b.phone.replace(/[^0-9]/g, "")}" target="_blank" rel="noopener" aria-label="واتساب">${UI.icon("whatsapp", 18)}</a>` : ""}
        </div>

        ${!days.length ? `<div class="banner"><div class="ec">${UI.icon("x", 26)}</div>
          <h3>لا توجد أيام عمل متاحة</h3>
          <p class="muted">${UI.esc(Smart.pick(
            `لا يعمل هذا المختص خلال الأيام المتاحة للحجز (${Lang.number(windowDays)} ${windowDays === 1 ? "يوم" : windowDays <= 10 ? "أيام" : "يوماً"}). يمكنك التواصل مع العمل مباشرة.`,
            `This specialist doesn't work during the bookable period (${Lang.number(windowDays)} ${windowDays === 1 ? "day" : "days"}). You can contact the business directly.`,
            `איש המקצוע אינו עובד בתקופה שפתוחה להזמנה (${Lang.number(windowDays)} ${windowDays === 1 ? "יום" : "ימים"}). אפשר לפנות לעסק ישירות.`))}</p>
          ${!Auth.isGuest() && b.phone ? `<a class="btn accent" style="margin-top:12px;max-width:280px;margin-inline:auto" href="https://wa.me/${b.phone.replace(/[^0-9]/g, "")}" target="_blank" rel="noopener">${UI.icon("whatsapp", 16)} تواصل معنا على واتساب</a>` : ""}</div>`
        : `
        <div class="grid g2" style="align-items:start">
          <div style="display:flex;flex-direction:column;gap:14px">
            <div class="section-title">١ · اختر الخدمة</div>
            ${!bk.services.length ? UI.empty("لا توجد خدمات", "لم تتم إضافة خدمات بعد.") :
            `<div class="svc-grid" id="svc">${bk.services.map(sv => `
                <button class="svc" data-s="${sv.id}" aria-pressed="false">
                  <span class="pick">${UI.icon("check", 12)}</span>
                  ${usual && usual.serviceId === sv.id ? `<span class="svc-usual">المعتاد</span>` : ""}
                  <div class="ico">${UI.icon("scissors", 19)}</div>
                  <div class="sn">${UI.esc(sv.name)}</div>
                  <div class="sd">${Lang.duration(sv.duration)}</div>
                  <div class="sp">${UI.money(sv.price)}</div>
                </button>`).join("")}</div>`}

            <div class="section-title">٢ · اختر اليوم</div>
            <div class="days" id="days">${days.map(d => {
              const iso = toISO(d), active = iso === bk.date;
              // "Today" / "Tomorrow" read faster than a weekday; the full date
              // stays in the accessible name.
              return `<button class="day ${active ? "active" : ""}" data-d="${iso}" aria-label="${UI.esc(UI.dayName(d) + " " + UI.dateAr(iso))}" aria-pressed="${active}">
                <div class="dn">${UI.esc(Smart.dayLabel(iso))}</div><div class="dd">${Lang.number(d.getDate())}</div><div class="dm">${UI.esc(Lang.date(iso, { month: "short" }))}</div></button>`;
            }).join("")}</div>
          </div>

          <div style="display:flex;flex-direction:column;gap:14px">
            <button class="next-slot" id="next-slot" disabled>
              <span class="zap">${UI.icon("bolt", 18)}</span>
              <span>أقرب موعد متاح<small id="next-hint">اختر الخدمة أولاً ثم اضغط هنا</small></span>
            </button>
            <div class="summary" id="summary"></div>
            <div id="loyalty-pay" aria-live="polite"></div>
            <div id="deposit-note" aria-live="polite"></div>
            <div class="section-title">٣ · اختر الوقت</div>
            <div class="card" style="padding:12px">
              <div class="slots" id="slots"><div class="muted" style="grid-column:1/-1">اختر خدمة ويوماً أولاً</div></div>
            </div>
            ${Auth.isLoggedIn() && isStaffUser() ? forWhomBox() : ""}
            <button class="btn" id="confirm" disabled>${UI.icon("check", 18)} تأكيد الحجز</button>
          </div>
        </div>`}
      </div>`);

    if (!days.length) return;

    document.querySelectorAll("#days .day").forEach(el => el.onclick = () => {
      document.querySelectorAll("#days .day").forEach(x => { x.classList.remove("active"); x.setAttribute("aria-pressed", "false"); });
      el.classList.add("active"); el.setAttribute("aria-pressed", "true"); bk.date = el.getAttribute("data-d"); bk.time = null; renderSlots();
    });
    document.querySelectorAll("#svc .svc").forEach(el => el.onclick = (ev) => {
      document.querySelectorAll("#svc .svc").forEach(x => { x.classList.remove("active"); x.setAttribute("aria-pressed", "false"); });
      el.classList.add("active"); el.setAttribute("aria-pressed", "true"); bk.serviceId = el.getAttribute("data-s"); bk.coins = null; renderSummary(); renderSlots(); loadCoinOffer(); depositNote();
      // Remember the unfinished booking so Home can offer to continue it.
      // Only a real tap counts; a smart preselection is not "started".
      if (Auth.isLoggedIn() && ev && ev.isTrusted) {
        const chosen = bk.services.find(x => x.id === bk.serviceId);
        Smart.memory.saveDraft({ barberId: b.id, barberName: b.name, serviceId: bk.serviceId, serviceName: chosen ? chosen.name : "" });
      }
      const nb = document.getElementById("next-slot"); const nh = document.getElementById("next-hint");
      if (nb) nb.disabled = false;
      if (nh) nh.textContent = "بحث تلقائي عن أول وقت فارغ";
    });
    document.getElementById("confirm").onclick = submit;

    const nextBtn = document.getElementById("next-slot");
    if (nextBtn) nextBtn.onclick = () => findNextAvailable(days);

    // 2.34: staff say who the booking is for.
    wireForWhom();

    // A booking resumed after signing in: the day it was for (when still bookable).
    if (p.date && days.some(d => toISO(d) === p.date)) {
      bk.date = p.date;
      document.querySelectorAll("#days .day").forEach(x => { const on = x.dataset.d === p.date; x.classList.toggle("active", on); x.setAttribute("aria-pressed", String(on)); });
    }
    bk.wantTime = /^\d{2}:\d{2}$/.test(p.time || "") ? p.time : null;
    // Smart default, always overridable: the service asked for in the link,
    // else the only service there is, else this person's usual one.
    const preId = p.service || (bk.services.length === 1 ? bk.services[0].id : usual?.serviceId);
    if (preId) {
      const pre = [...document.querySelectorAll("#svc .svc")].find(el => el.dataset.s === String(preId));
      if (pre) pre.click();
    }
  }

  // ── "Who is this booking for?" (owners, specialists, members who manage
  // bookings). A customer of THIS salon found by phone (their visits stay in
  // their history), or a name with an optional phone for someone without an
  // account. No OTP, no account needed; the specialist still confirms.
  const fw = { mode: "customer", phone: null, found: null, customer: null, searching: false };
  function forWhomBox() {
    fw.mode = "customer"; fw.phone = null; fw.found = null; fw.customer = null;
    return `<section class="guest-box bf-box" id="bf-box"><div class="sec-label">${Lang.t("لمن هذا الحجز؟")}</div>
      ${UI.seg("bf-mode", [{ v: "customer", l: Lang.t("لعميل") }, { v: "me", l: Lang.t("لي") }], "customer")}
      <div id="bf-customer">
        ${window.Account?.phoneField ? Account.phoneField("bf-phone", "رقم هاتف العميل (اختياري)") : `<div class="field"><label for="bf-phone">${Lang.t("رقم هاتف العميل (اختياري)")}</label><input class="input" id="bf-phone" type="tel" dir="ltr"></div>`}
        <button type="button" class="btn line sm" id="bf-find">${UI.icon("search", 15)} ${Lang.t("بحث عن عميل سابق")}</button>
        <div id="bf-results" aria-live="polite"></div>
        <div class="field" id="bf-name-field"><label for="bf-name">${Lang.t("اسم العميل")}</label><input class="input" id="bf-name" maxlength="40" autocomplete="off" dir="auto" placeholder="${UI.esc(Lang.t("الاسم كما سيظهر في الجدول"))}"></div>
        <p class="tiny">${Lang.t("الاسم مطلوب، والهاتف اختياري. لا يحتاج العميل حساباً ولا رمز تحقق. يبقى الموعد بانتظار تأكيد المختص.")}</p>
      </div>
      <p class="tiny" id="bf-me" hidden>${Lang.t("يُحجز الموعد باسمك")}: <b data-i18n-skip>${UI.esc(App.user?.name || "")}</b></p></section>`;
  }
  function wireForWhom() {
    if (!document.getElementById("bf-box")) return;
    const readPhone = window.Account?.wirePhone ? Account.wirePhone("bf-phone") : () => null;
    const paintMode = () => {
      document.getElementById("bf-customer").hidden = fw.mode !== "customer";
      document.getElementById("bf-me").hidden = fw.mode !== "me";
      document.getElementById("bf-name-field").hidden = fw.mode !== "customer" || !!fw.customer;
      // Loyalty coins belong to the person paying; staff booking for a customer do not use theirs.
      const loy = document.getElementById("loyalty-pay"); if (loy) loy.hidden = fw.mode === "customer";
      if (fw.mode === "customer" && bk.coins) bk.coins.use = false;
    };
    UI.wireSeg("bf-mode", v => { fw.mode = v; paintMode(); renderSummary(); });
    const results = () => {
      const host = document.getElementById("bf-results"); if (!host) return;
      const f = fw.found;
      if (!f) { host.innerHTML = ""; return; }
      const when = d => d ? UI.dateAr(String(d).slice(0, 10)) : "";
      const visits = n => Smart.pick(`${Lang.number(n)} زيارة`, `${n} visits`, `${n} ביקורים`);
      host.innerHTML = (f.accounts || []).length || (f.guests || []).length ? `<div class="bf-list">
          ${(f.accounts || []).map(a => `<button type="button" class="bf-item ${fw.customer?.id === a.id ? "on" : ""}" data-bf-account="${UI.esc(a.id)}" aria-pressed="${fw.customer?.id === a.id}">
            ${UI.icon(fw.customer?.id === a.id ? "check" : "user", 16)}<span><b data-i18n-skip>${UI.esc(a.name || "—")}</b><small>${UI.esc(visits(a.visits))}${a.last_visit ? ` · ${UI.esc(Lang.t("آخر زيارة"))} ${UI.esc(when(a.last_visit))}` : ""}${a.membership === "pending" ? ` · ${UI.esc(Lang.t("طلب انضمام بانتظار الموافقة"))}` : ""}</small></span>
            <em>${UI.esc(Lang.t("حساب في العمل"))}</em></button>`).join("")}
          ${(f.guests || []).map(g => `<button type="button" class="bf-item" data-bf-guest="${UI.esc(g.name)}">${UI.icon("user", 16)}<span><b data-i18n-skip>${UI.esc(g.name)}</b><small>${UI.esc(visits(g.visits))}${g.last_visit ? ` · ${UI.esc(when(g.last_visit))}` : ""}</small></span><em>${UI.esc(Lang.t("حجز سابق بالاسم"))}</em></button>`).join("")}
        </div>` : `<p class="tiny bf-none">${Lang.t("لا يوجد عميل بهذا الرقم في هذا العمل. اكتب اسمه للمتابعة.")}</p>`;
      host.querySelectorAll("[data-bf-account]").forEach(b => b.onclick = () => {
        const a = f.accounts.find(x => x.id === b.dataset.bfAccount);
        fw.customer = fw.customer?.id === a.id ? null : a; results(); paintMode();
      });
      host.querySelectorAll("[data-bf-guest]").forEach(b => b.onclick = () => { fw.customer = null; document.getElementById("bf-name").value = b.dataset.bfGuest; results(); paintMode(); });
    };
    const find = async () => {
      const p = readPhone();
      if (!p) { UI.toast("أدخل رقم هاتف صحيح", "err"); document.getElementById("bf-phone")?.focus(); return; }
      UI.busy("bf-find", true);
      try { fw.phone = p; fw.found = await rpc("staff_find_customer", { p_token: App.token, p_phone: p.e164, p_dial: p.dial }); fw.customer = (fw.found.accounts || []).length === 1 ? fw.found.accounts[0] : null; results(); paintMode(); }
      catch (e) { UI.toast(e.message, "err"); }
      finally { UI.busy("bf-find", false); }
    };
    document.getElementById("bf-find").onclick = find;
    // A changed number forgets the previous search.
    document.getElementById("bf-phone")?.addEventListener("input", () => { fw.found = null; fw.customer = null; fw.phone = null; results(); paintMode(); });
    fw.readPhone = readPhone;
    paintMode();
  }

  function renderSummary() {
    const sv = bk.services.find(s => s.id === bk.serviceId);
    const el = document.getElementById("summary");
    if (!el) return;
    if (!sv) { el.innerHTML = ""; return; }
    const free = bk.coins && bk.coins.use;
    const pkg = (bk.packages || []).find(p => (p.service_ids || []).includes(sv.id) && (!(p.barber_ids || []).length || p.barber_ids.includes(bk.barber?.id)));
    el.innerHTML = `<div class="box"><div class="l">المدة</div><div class="v">${Lang.duration(sv.duration)}</div></div>
      <div class="box ${free || pkg ? "free" : ""}"><div class="l">التكلفة</div><div class="v">${free ? `مجاني <small class="strike">${UI.money(sv.price) || ""}</small>` : pkg ? `${Lang.t("من باقتك")} <small class="strike">${UI.money(sv.price) || ""}</small>` : (UI.money(sv.price) || "—")}</div></div>
      ${pkg && !free ? `<p class="pkg-cover-note">${UI.icon("star", 14)} <span>${UI.esc(Smart.pick(`مشمولة في باقة «${pkg.name}» · تبقّى ${Lang.number(pkg.remaining)} جلسات. تُخصم الجلسة عند إتمام الزيارة.`, `Covered by your “${pkg.name}” package · ${pkg.remaining} sessions left. A session is used when the visit is completed.`, `כלול בחבילה “${pkg.name}” · נותרו ${pkg.remaining} מפגשים. מפגש מנוכה בסיום הביקור.`))}</span></p>` : ""}`;
  }

  // Loyalty Coins: pay this service with coins, or use a voucher bought
  // earlier. The whole booking + payment is one server transaction, and the
  // booking then shows as free to the customer and the specialist.
  async function loadCoinOffer() {
    const host = document.getElementById("loyalty-pay");
    const serviceId = bk.serviceId;
    if (!host) return;
    host.innerHTML = "";
    if (!Auth.isLoggedIn() || !window.Loyalty || !Features.enabled("loyalty") || !serviceId) return;
    let offer;
    try { offer = await rpc("loyalty_booking_offer", { p_token: App.token, p_service: serviceId }); } catch { return; }
    if (serviceId !== bk.serviceId || !offer || !offer.enabled || (!offer.voucher && offer.coin_price == null)) return;
    // An unused voucher for this exact service is applied by default.
    bk.coins = { offer, use: !!offer.voucher, key: Loyalty.requestKey() };
    paintCoinOffer(); renderSummary();
  }
  function paintCoinOffer() {
    const host = document.getElementById("loyalty-pay");
    const c = bk.coins; if (!host || !c) return;
    const o = c.offer, name = o.currency_name_ar || "نقاط", n = v => Number(v || 0).toLocaleString(Lang.locale());
    const title = o.voucher ? "لديك قسيمة مدفوعة لهذه الخدمة" : `ادفع بنقاط الولاء · ${n(o.coin_price)} ${UI.esc(name)}`;
    const sub = o.voucher ? `استبدلتها مسبقاً بـ ${n(o.voucher.coins)} ${UI.esc(name)} — لن يُخصم شيء إضافي`
      : o.can_pay ? `رصيدك ${n(o.balance)} · يبقى ${n(o.balance - o.coin_price)} بعد الحجز` : `${UI.esc(o.reason || "غير متاح")} · رصيدك ${n(o.balance)}`;
    host.innerHTML = `<label class="loy-pay ${c.use ? "on" : ""} ${o.can_pay ? "" : "disabled"}">
      <span class="loy-pay-icon">${UI.icon("star", 20)}</span>
      <span class="loy-pay-text"><b>${title}</b><small>${sub}</small></span>
      <input type="checkbox" id="loy-pay-use" ${c.use ? "checked" : ""} ${o.can_pay ? "" : "disabled"} aria-label="الدفع بنقاط الولاء"></label>
      ${c.use ? `<p class="loy-pay-note">${UI.icon("check", 14)} سيظهر الحجز لك وللمختص على أنه <b>مجاني باستخدام النقاط</b>.</p>` : ""}`;
    const box = document.getElementById("loy-pay-use");
    if (box) box.onchange = () => { c.use = box.checked; paintCoinOffer(); renderSummary(); depositNote(); };
    depositNote();
  }

  // 2.25: a service that needs a deposit says so (amount, deadline and the
  // cancellation policy) before booking. A visit paid with coins needs none.
  function depositNote() {
    const host = document.getElementById("deposit-note");
    if (!host || !window.Business) return;
    if (bk.coins && bk.coins.use) { host.innerHTML = ""; return; }
    Business.depositNotice(host, bk.serviceId);
  }

  // The database is the single source of truth for what's bookable: it
  // returns quarter-hour times PLUS the exact end of every existing booking,
  // already filtered so the chosen service fits with no overlap.
  async function dayAvailability(b, dateISO, sd) {
    try {
      const rows = await rpc("free_times", { p_barber: b.id, p_date: dateISO, p_duration: sd });
      const times = rows.map(r => String(r.t || r).slice(0, 5));
      return { slots: times, free: times };
    } catch {
      return { slots: [], free: [] };
    }
  }

  function periodLabel(t) {
    const h = Number(t.split(":")[0]);
    return h < 12 ? "صباحاً" : h < 16 ? "بعد الظهر" : h < 20 ? "مساءً" : "ليلاً";
  }
  // compact 12-hour label for the slot grid (period is shown as a group header)
  function shortTime(t) {
    let [h, m] = t.split(":").map(Number);
    let hh = h % 12; if (hh === 0) hh = 12;
    return `${hh}:${String(m).padStart(2, "0")}`;
  }

  function selectSlot(btn) {
    const el = document.getElementById("slots");
    el.querySelectorAll(".slot").forEach(x => x.classList.remove("active", "suggested"));
    btn.classList.add("active"); bk.time = btn.getAttribute("data-t");
    document.getElementById("confirm").disabled = false;
  }

  // 2.27: the slot board lists every time of the day, free or taken, so a
  // taken time no longer just disappears. With the Smart waitlist a customer
  // can wait for that exact time; without it the time is shown as taken.
  async function slotBoard(b, dateISO, serviceId) {
    try { return await rpc("slot_board", { p_token: App.token || "", p_barber: b.id, p_date: dateISO, p_service: serviceId }); }
    catch { return null; }
  }
  async function renderSlots() {
    const el = document.getElementById("slots");
    if (!el) return;
    if (!bk.serviceId || !bk.date) { el.innerHTML = `<div class="muted" style="grid-column:1/-1">اختر خدمة ويوماً أولاً</div>`; return; }
    el.innerHTML = `<div class="muted" style="grid-column:1/-1">جارٍ تحميل الأوقات…</div>`;
    const b = bk.barber, date = bk.date, serviceId = bk.serviceId;
    const sv = bk.services.find(s => s.id === bk.serviceId);
    const sd = sv ? sv.duration : (App.settings && App.settings.default_duration) || 30;

    const board = await slotBoard(b, date, serviceId);
    if (date !== bk.date || serviceId !== bk.serviceId) return;      // the person moved on meanwhile
    // 2.31: the salon has not opened online booking (new salons start so).
    if (board && board.online_booking === false) { el.innerHTML = onlineOffNotice(); bk.time = null; document.getElementById("confirm").disabled = true; return; }
    let slots, free, taken = new Set(), waiting = new Set(), closed = new Set(), canWait = false;
    if (board && Array.isArray(board.times)) {
      // A time that passed while this page stayed open is neither bookable
      // nor a waitlist chance (the server refuses both as well).
      const times = board.times.filter(x => !slotPassed(date, x.t));
      slots = times.map(x => x.t);
      free = times.filter(x => x.free).map(x => x.t);
      times.filter(x => !x.free).forEach(x => taken.add(x.t));
      // 2.32: a time held by a completed visit stays taken all day: no waitlist.
      times.filter(x => !x.free && x.closed).forEach(x => closed.add(x.t));
      (board.waiting || []).forEach(t => waiting.add(t));
      canWait = !!board.waitlist && !!window.Business && Features.enabled("smart_waitlist");
    } else {
      ({ slots, free } = await dayAvailability(b, date, sd));
    }
    // A day with no working time at all, or nothing to show: the old notice.
    if (!slots.length) { el.innerHTML = fullDayNotice(b); window.Business?.wireWaitlistButtons(el); return; }

    let lastPeriod = null, html = "";
    for (const t of slots) {
      const period = periodLabel(t);
      if (period !== lastPeriod) { html += `<div class="slot-group">${period}</div>`; lastPeriod = period; }
      if (!taken.has(t)) {
        html += `<button class="slot ${bk.time === t ? "active" : ""}" data-t="${t}" aria-label="${UI.timeAr(t)}">${shortTime(t)}</button>`;
      } else if (waiting.has(t)) {
        html += `<button class="slot taken waiting" data-wait-info="${t}" aria-label="${UI.esc(Lang.t("أنت في قائمة الانتظار لهذا الوقت"))} ${UI.timeAr(t)}">${shortTime(t)}<small>${Lang.t("بانتظارك")}</small></button>`;
      } else if (closed.has(t)) {
        html += `<button class="slot taken closed" data-closed="${t}" aria-label="${UI.esc(Lang.t("هذا الموعد غير متاح"))} ${UI.timeAr(t)}">${shortTime(t)}<small>${Lang.t("محجوز")}</small></button>`;
      } else {
        html += `<button class="slot taken" data-taken="${t}" aria-label="${UI.esc(Lang.t(canWait ? "محجوز — اضغط للانتظار على هذا الوقت" : "هذا الموعد غير متاح"))} ${UI.timeAr(t)}">${shortTime(t)}<small>${Lang.t(canWait ? "انتظار" : "محجوز")}</small></button>`;
      }
    }
    const legend = taken.size ? `<div class="slot-legend"><span><i class="lg-free"></i>${Lang.t("متاح")}</span><span><i class="lg-taken"></i>${Lang.t(canWait ? "محجوز — يمكنك الانتظار عليه" : "محجوز")}</span>${waiting.size ? `<span><i class="lg-wait"></i>${Lang.t("أنت بالانتظار")}</span>` : ""}</div>` : "";
    el.innerHTML = (free.length ? "" : `<div class="slot-full-note">${UI.icon("clock", 16)}<span>${Lang.t(canWait ? "كل الأوقات محجوزة في هذا اليوم. اضغط على أي وقت للانتظار عليه، أو جرّب يوماً آخر." : "لا توجد مواعيد متاحة في هذا اليوم.")}</span></div>`) + html + legend
      + (free.length ? "" : fullDayNotice(b, true));
    window.Business?.wireWaitlistButtons(el);
    el.querySelectorAll(".slot[data-t]").forEach(s => s.onclick = () => selectSlot(s));
    el.querySelectorAll(".slot[data-taken]").forEach(s => s.onclick = () => {
      if (!canWait) { UI.toast("هذا الوقت محجوز. اختر وقتاً آخر.", "err"); return; }
      if (!Auth.isLoggedIn()) { Router.signInPrompt(); return; }
      Business.joinSlot({ service_id: serviceId, barber_id: b.id, date, time: s.dataset.taken, service_name: sv?.name || "", barber_name: b.name },
        () => renderSlots());
    });
    el.querySelectorAll(".slot[data-closed]").forEach(s => s.onclick = () => UI.toast("هذا الوقت محجوز. اختر وقتاً آخر.", "err"));
    el.querySelectorAll(".slot[data-wait-info]").forEach(s => s.onclick = () => UI.toast("أنت في قائمة الانتظار لهذا الوقت. سنرسل لك إشعاراً إذا توفر.", "ok"));
    if (bk.time && !free.includes(bk.time)) bk.time = null;
    // A booking resumed after signing in: the time chosen before, if still free.
    if (bk.wantTime) {
      const want = bk.wantTime; bk.wantTime = null;
      const slot = el.querySelector(`.slot[data-t="${want}"]`);
      if (slot) selectSlot(slot); else UI.toast("الوقت الذي اخترته لم يعد متاحاً. اختر وقتاً آخر.", "err");
    }
    document.getElementById("confirm").disabled = !bk.time || !free.includes(bk.time);
    // Today's board drops the times that pass while the page is open.
    clearInterval(slotClock);
    if (date === localISO(new Date())) slotClock = setInterval(() => {
      const host = document.getElementById("slots");
      if (!host || bk.date !== date) { clearInterval(slotClock); return; }
      if ([...host.querySelectorAll(".slot")].some(s => slotPassed(date, s.dataset.t || s.dataset.taken || s.dataset.closed || s.dataset.waitInfo))) renderSlots();
    }, 60000);
  }
  let slotClock = 0;
  const localISO = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  // Same lead time as the server (10 minutes).
  function slotPassed(dateISO, t) {
    if (!t || dateISO !== localISO(new Date())) return false;
    const [h, m] = String(t).split(":").map(Number), now = new Date();
    return h * 60 + m < now.getHours() * 60 + now.getMinutes() + 10;
  }
  function onlineOffNotice() {
    const s = App.settings || {}, wa = String(s.whatsapp_number || s.contact_phone || "").replace(/[^0-9]/g, "");
    return `<div class="booking-off" role="status">${UI.icon("calendar", 22)}<div><b>${Lang.t("الحجز عبر التطبيق غير متاح بعد")}</b>
      <p>${Lang.t("يمكنك تصفح الخدمات والمختصين. سيتمكن العملاء من الحجز هنا عندما يفعّل العمل الحجز عبر التطبيق.")}</p>
      ${wa ? `<a class="btn line sm" href="https://wa.me/${UI.esc(wa)}" target="_blank" rel="noopener">${UI.icon("whatsapp", 16)} ${Lang.t("تواصل مع العمل")}</a>` : ""}</div></div>`;
  }

  // Shown when a working day has no free time left. Falls back to the salon's
  // WhatsApp number when the barber has none of his own.
  function fullDayNotice(b, compact) {
    const raw = (b && b.phone) || (App.settings && App.settings.whatsapp_number) || "";
    const wa = String(raw).replace(/[^0-9]/g, "");
    return `<div class="full-day ${compact ? "compact" : ""}">
      ${compact ? "" : `<div class="fd-head">${UI.icon("clock", 22)}</div>
      <p class="fd-main">لا توجد مواعيد متاحة في هذا اليوم.</p>`}
      <p class="fd-sub">جرّب يوماً آخر، أو تواصل مع العمل لمعرفة أقرب موعد.</p>
      ${wa ? `<a class="btn accent fd-wa" href="https://wa.me/${wa}" target="_blank" rel="noopener">
        ${UI.icon("whatsapp", 17)} تواصل عبر واتساب</a>` : ""}
    </div>`;
  }

  async function findNextAvailable(days) {
    if (!bk.serviceId) { UI.toast("اختر الخدمة أولاً", "err"); return; }
    const btn = document.getElementById("next-slot");
    const hint = document.getElementById("next-hint");
    btn.disabled = true;
    const old = hint.textContent; hint.textContent = "جارٍ البحث…";
    try {
      const sv = bk.services.find(s => s.id === bk.serviceId);
      const sd = sv ? sv.duration : (App.settings && App.settings.default_duration) || 30;
      for (const d of days) {
        const iso = toISO(d);
        const { free } = await dayAvailability(bk.barber, iso, sd);
        if (!free.length) continue;
        bk.date = iso; bk.time = null;
        document.querySelectorAll("#days .day").forEach(x =>
          x.classList.toggle("active", x.getAttribute("data-d") === iso));
        await renderSlots();
        const slotBtn = document.querySelector(`#slots .slot[data-t="${free[0]}"]`);
        if (slotBtn) {
          selectSlot(slotBtn); slotBtn.classList.add("suggested");
          slotBtn.scrollIntoView({ block: "center", behavior: "smooth" });
        }
        if (window.Enhance) Enhance.haptic(18);
        UI.toast(`أقرب موعد: ${UI.dayName(iso)} ${UI.dateAr(iso)} — ${UI.timeAr(free[0] + ":00")}`, "ok");
        return;
      }
      UI.toast("لا توجد مواعيد متاحة خلال الأيام القادمة", "err");
    } finally { btn.disabled = false; hint.textContent = old; }
  }

  // 2.34: staff booking for a customer — an account found by phone, or a name
  // (required) with the phone typed for that person (optional).
  function forWhom() {
    if (!document.getElementById("bf-box") || fw.mode !== "customer") return null;
    if (fw.customer) return { customer_id: fw.customer.id, label: fw.customer.name };
    const name = (document.getElementById("bf-name")?.value || "").trim().replace(/\s+/g, " ");
    const typed = (document.getElementById("bf-phone")?.value || "").trim();
    const phone = typed && fw.readPhone ? fw.readPhone() : null;
    return { name, phone: phone?.e164 || "", typed, label: name };
  }

  let submitting = false;
  async function submit() {
    if(submitting) return;
    if (!Auth.isLoggedIn()) {
      // 2.34: the choices made as a guest are kept: after signing in or
      // creating an account the person comes back to this booking.
      BookingIntent.save({ barber: bk.barber.id, service: bk.serviceId, date: bk.date, time: bk.time });
      Router.signInPrompt(); return;
    }
    if (!bk.serviceId || !bk.date || !bk.time) { UI.toast("أكمل اختيار الخدمة والوقت", "err"); return; }
    const who = forWhom();
    if (who && !who.customer_id) {
      if (who.name.length < 2) { UI.toast("اكتب اسم العميل", "err"); document.getElementById("bf-name")?.focus(); return; }
      if (/[0-9٠-٩]/.test(who.name)) { UI.toast("الاسم لا يجب أن يحتوي أرقاماً", "err"); return; }
      if (who.typed && !who.phone) { UI.toast("رقم الهاتف غير صحيح", "err"); document.getElementById("bf-phone")?.focus(); return; }
    }
    // The guard is taken before anything is awaited, so a double tap can
    // never send two bookings.
    submitting = true;
    UI.busy("confirm", true);
    try {
      if (who) {
        const r = await rpc("staff_book_for", { p_token: App.token, p_data: { ...who, label: undefined, typed: undefined,
          barber_id: bk.barber.id, service_id: bk.serviceId, date: bk.date, time: bk.time + ":00" } });
        rpcCacheBust("my_bookings");
        confirmationScreen(null, r.id, who.label);
        return;
      }
      // Conflict check against the person's own active bookings. It warns
      // and lets them decide; it never blocks or changes anything by itself.
      if (!submit.overlapOk) {
        const sv = bk.services.find(x => x.id === bk.serviceId);
        // Synchronous: uses the person's bookings already on this device
        // (prefetched when this page opened), so the tap is never delayed.
        const mine = [20, 12, 5].map(n => rpcPeek("my_bookings", { p_token: App.token, p_limit: n, p_offset: 0 }, 5 * 60000)).find(Array.isArray) || [];
        const clash = Smart.conflicts(mine, bk.date, bk.time, sv ? sv.duration : 30)[0];
        if (clash) {
          UI.busy("confirm", false);
          UI.confirm(Smart.pick(
            `لديك حجز آخر في هذا الوقت: ${clash.service_name || ""} مع ${clash.barber_name || ""} الساعة ${UI.timeAr(clash.booking_time)}. هل تريد المتابعة على أي حال؟`,
            `You already have a booking at this time: ${clash.service_name || ""} with ${clash.barber_name || ""} at ${UI.timeAr(clash.booking_time)}. Book anyway?`,
            `כבר יש לך תור בשעה הזאת: ${clash.service_name || ""} עם ${clash.barber_name || ""} ב־${UI.timeAr(clash.booking_time)}. להזמין בכל זאת?`),
            async () => { submit.overlapOk = true; try { await submit(); } finally { submit.overlapOk = false; } });
          return;
        }
      }
      // 2.47 (owner decision 2026-11-10): a customer's own booking carries a contact number proven by a WhatsApp code
      // (or proven before by this account). Owners and specialists booking for themselves are not asked. Closing the
      // sheet cancels; the server refuses a customer's booking without it anyway.
      let proven = null;
      if (!["admin", "barber"].includes(App.user?.role) && window.Account?.signedIn?.() && Account.bookingPhone) {
        UI.busy("confirm", false);
        proven = await Account.bookingPhone(Shop.slug());
        if (!proven) return;
        UI.busy("confirm", true);
      }
      // Keep the backend contract unchanged: every salon uses its existing
      // create_booking(token, barber, service, date, time, note) RPC.
      // A guest name, when used, is carried in the normal note field instead
      // of inventing a new p_guest function signature.
      const args = {
        p_token: App.token, p_barber: bk.barber.id, p_service: bk.serviceId,
        p_date: bk.date, p_time: bk.time + ":00", p_note: "",
      };
      let paid = null, created = null;
      if (bk.coins && bk.coins.use) {
        // The same key is reused if this press is retried, so a booking is
        // never paid twice.
        paid = await rpc("create_booking_with_coins", { ...args, p_request_key: bk.coins.key });
        rpcCacheBust("loyalty_wallet"); rpcCacheBust("my_bookings");
      } else {
        created = await rpc("create_booking", args);
      }
      const chosen = bk.services.find(x => x.id === bk.serviceId);
      Smart.memory.rememberBooking({ barberId: bk.barber.id, barberName: bk.barber.name, serviceId: bk.serviceId, serviceName: chosen ? chosen.name : "" });
      confirmationScreen(paid, (created || paid || {}).id);
      // Optional, once per number: keep the proven number in the account for the next bookings.
      if (proven?.offer_save) setTimeout(() => Account.offerSavePhone(proven.phone), 700);
    } catch (e) {
      UI.toast(e.message, "err"); UI.busy("confirm", false);
      // Someone else took the time meanwhile: show the day again (the server
      // offers only what is still free) instead of leaving a dead choice.
      if (/لم يعد متاحاً|محجوز|slot_taken|23P01/i.test((e.rawMessage || "") + " " + (e.code || ""))) { bk.time = null; renderSlots(); }
    }
    finally { submitting = false; }
  }

  // 2.34: a booking started as a guest, kept while the person signs in.
  window.BookingIntent = {
    KEY: "salonieer:booking-intent",
    save(o) { try { sessionStorage.setItem(this.KEY, JSON.stringify({ ...o, slug: Shop.slug(), at: Date.now() })); } catch {} },
    take() {
      let o = null; try { o = JSON.parse(sessionStorage.getItem(this.KEY) || "null"); sessionStorage.removeItem(this.KEY); } catch {}
      if (!o || o.slug !== Shop.slug() || Date.now() - Number(o.at || 0) > 30 * 60 * 1000 || !/^[0-9a-f-]{36}$/i.test(o.barber || "")) return null;
      return o;
    },
    // Back to that booking (the server checks again that the time is free and
    // that this person may book here — approval, limits — when confirming).
    resume() {
      const o = this.take(); if (!o) return false;
      const q = new URLSearchParams(); if (o.service) q.set("service", o.service); if (o.date) q.set("date", o.date); if (o.time) q.set("time", o.time);
      Router.go(`#/book/${o.barber}?${q}`);
      return true;
    },
  };

  function confirmationScreen(paid, bookingId, forName) {
    const sv = bk.services.find(s => s.id === bk.serviceId);
    const s = App.settings || {};
    UI.render(`
      <div class="content" style="padding-top:38px">
        <div class="center-col" style="text-align:center">
          <div class="success-ring">${UI.icon("check", 44)}</div>
          <h2 style="margin:8px 0 2px">تم إرسال طلب الحجز</h2>
          <p class="muted" style="margin:0">${forName ? Lang.t("الموعد بانتظار تأكيد المختص.") : "حجزك بانتظار تأكيد العمل، وسيصلك إشعار فور التحديث."}</p>
          <div class="card pad-lg" style="text-align:start">
            ${forName ? `<div class="kv">${UI.icon("user", 15)} ${Lang.t("العميل")}: <b data-i18n-skip>${UI.esc(forName)}</b></div>` : ""}
            <div class="kv">${UI.icon("user", 15)} ${UI.esc(Staff.title(bk.barber))}: <b>${UI.esc(bk.barber.name)}</b></div>
            <div class="kv">${UI.icon("scissors", 15)} الخدمة: <b>${UI.esc(sv ? sv.name : "")}</b></div>
            <div class="kv">${UI.icon("calendar", 15)} التاريخ: <b>${UI.dayName(bk.date)} ${UI.dateAr(bk.date)}</b></div>
            <div class="kv">${UI.icon("clock", 15)} الوقت: <b>${UI.timeAr(bk.time + ":00")}</b></div>
            <div class="kv">${Smart.phaseChip({ booking_date: bk.date, booking_time: bk.time, duration: sv ? sv.duration : 30, status: "pending" })}</div>
            ${paid ? `<div class="loy-free-banner">${UI.icon("star", 16)}<div><b>مجاني باستخدام نقاط الولاء</b><small>${paid.voucher_used ? "استُخدمت قسيمتك المدفوعة مسبقاً" : `تم خصم ${Number(paid.coins).toLocaleString(Lang.locale())} نقطة`} · رصيدك الآن ${Number(paid.balance).toLocaleString(Lang.locale())}</small></div></div>` : ""}
          </div>
          <div id="confirm-business" style="text-align:start"></div>
          <div class="act-row">
            <button class="btn line" id="add-cal">${UI.icon("calendar", 16)} أضف للتقويم</button>
            <button class="btn line" id="share-wa">${UI.icon("whatsapp", 16)} مشاركة</button>
          </div>
          ${forName ? `<button class="btn" data-nav="${UI.esc(Auth.isAdmin() || Auth.can("schedule_all") ? "#/admin/schedule" : App.user?.barber_id ? "#/barber-dash" : "#/admin/bookings")}">${Lang.t("عرض الجدول")}</button>` : `<button class="btn" data-nav="#/bookings">عرض حجوزاتي</button>`}
          <button class="btn line" data-nav="#/home">العودة للرئيسية</button>
        </div>
      </div>`);
    Router.bind();
    if (bookingId && window.Business) Business.customerBookingPanel(document.getElementById("confirm-business"), { id: bookingId, service_id: bk.serviceId });
    if (window.Enhance) { Enhance.haptic([20, 40, 20]); }
    const summary =
      `${Lang.t("موعدي في")} ${s.app_name || Lang.t("العمل")}\n` +
      `${Staff.title(bk.barber)}: ${bk.barber.name}\n${Lang.t("الخدمة")}: ${sv ? sv.name : ""}\n` +
      `${UI.dayName(bk.date)} ${UI.dateAr(bk.date)} — ${UI.timeAr(bk.time + ":00")}`;
    const cal = document.getElementById("add-cal");
    if (cal) cal.onclick = () => window.Enhance && Enhance.downloadICS({
      title: `${s.app_name || "العمل"} — ${sv ? sv.name : "حجز"}`,
      date: bk.date, time: bk.time, duration: sv ? sv.duration : 30,
      location: s.address || "", description: `${Staff.title(bk.barber)}: ${bk.barber.name}`,
    });
    const wa = document.getElementById("share-wa");
    if (wa) wa.onclick = () => window.Enhance && Enhance.waShare(summary);
  }

  // ---- MY BOOKINGS ----
  // The filter survives leaving and coming back, so returning from a booking
  // lands on the same tab the person was reading.
  let bookingFilter = "all";
  async function myBookings() {
    const PAGE = 10; let page = 0, hasNext = false;
    const first = rpcStale("my_bookings", { p_token: App.token, p_limit: PAGE, p_offset: 0 }, 20000);
    let list = first.value || [];
    hasNext = list.length === PAGE;

    async function load() {
      list = await rpcCached("my_bookings", { p_token: App.token, p_limit: PAGE, p_offset: page * PAGE }, 0);
      hasNext = list.length === PAGE;
    }
    if (!first.value) { list = await first.refresh; hasNext = list.length === PAGE; }

    // "Upcoming" is decided by time as well as status: a pending request
    // whose time has passed belongs with the past, not with what's next.
    const isUpcoming = b => Smart.isActive(b) && !["finished", "expired"].includes(Smart.phase(b));
    function visible() {
      const sorted = Smart.sortForAttention(list);
      if (bookingFilter === "upcoming") return sorted.filter(isUpcoming);
      if (bookingFilter === "past") return sorted.filter(b => !isUpcoming(b));
      return sorted;
    }
    function summary() {
      const next = Smart.sortForAttention(list.filter(isUpcoming))[0];
      const count = list.filter(isUpcoming).length;
      if (!next) return "";
      const lead = Smart.pick(count === 1 ? "حجز قادم واحد" : `${Lang.number(count)} حجوزات قادمة`,
        count === 1 ? "1 upcoming booking" : `${Lang.number(count)} upcoming bookings`,
        count === 1 ? "תור קרוב אחד" : `${Lang.number(count)} תורים קרובים`);
      return `<div class="smart-summary" data-i18n-skip><span class="smart-summary-icon">${UI.icon("calendar", 18)}</span><div><b>${UI.esc(lead)}</b><small><bdi>${UI.esc(next.service_name || "")}</bdi> · ${UI.esc(Smart.dayLabel(next.booking_date))} ${UI.esc(UI.timeAr(next.booking_time))}</small></div>${Smart.phaseChip(next)}</div>`;
    }
    function section(title, rows) {
      return rows.length ? `<h2 class="smart-section">${title}</h2><div class="list cols">${rows.map(bookingRow).join("")}</div>` : "";
    }
    function paint() {
      const items = visible();
      const grouped = bookingFilter === "all"
        ? section("المواعيد القادمة", items.filter(isUpcoming)) + section("المواعيد السابقة", items.filter(b => !isUpcoming(b)))
        : `<div class="list cols">${items.map(bookingRow).join("")}</div>`;
      UI.render(`${UI.header({ title: "حجوزاتي" })}
        <div class="content">
          ${page === 0 ? summary() : ""}
          <div class="toolbar">
            ${UI.seg("bk-filter", [{ v: "all", l: "الكل" }, { v: "upcoming", l: "القادمة" }, { v: "past", l: "السابقة" }], bookingFilter)}
          </div>
          ${!items.length
          ? UI.empty("لا توجد حجوزات", bookingFilter !== "all" ? "لا توجد حجوزات في هذا التصنيف." : "اختر المختص من الرئيسية لحجز موعد.", bookingFilter !== "all" ? "" : "احجز موعد", "#/home")
          : grouped}
          ${UI.pager(page, hasNext)}
        </div>`);
      UI.wireSeg("bk-filter", v => { bookingFilter = v; paint(); });
      UI.wirePager(
        async () => { if (page > 0) { page--; await load(); paint(); } },
        async () => { if (hasNext) { page++; await load(); paint(); } });
    }
    paint();

    if (first.value) first.refresh.then(rows => {
      if (!rows || JSON.stringify(rows) === JSON.stringify(list)) return;
      list = rows; hasNext = rows.length === PAGE; paint();
    }).catch(() => {});
    refreshUnread();

    // Status changes appear on their own, and the DOM is only touched when
    // something really changed.
    let sig = JSON.stringify(list.map(b => [b.id, b.status]));
    Live.start(async () => {
      const rows = await rpc("my_bookings", { p_token: App.token, p_limit: PAGE, p_offset: page * PAGE });
      const fresh = JSON.stringify(rows.map(b => [b.id, b.status]));
      if (fresh === sig) return;
      sig = fresh; list = rows; hasNext = rows.length === PAGE;
      paint();
    }, 15000);
  }
  function bookingRow(b) {
    const done = ["completed", "cancelled", "no_show", "expired"].includes(b.status);
    return `<div class="card clickable booking-card" data-nav="#/booking/${b.id}">
      <div class="top"><div style="min-width:0"><b style="font-size:15.5px">${UI.esc(b.barber_name)}</b>
        <div class="kv">${UI.icon("scissors", 13)} ${UI.esc(b.service_name)}</div>
        ${b.guest_name ? `<div class="guest-tag">${UI.icon("user", 12)} على اسم: ${UI.esc(b.guest_name)}</div>` : ""}
        </div>${UI.badge(b.status)}</div>
      <div class="kv">${UI.icon("calendar", 13)} ${UI.esc(Smart.dayLabel(b.booking_date))} · ${UI.dateAr(b.booking_date)}</div>
      ${Smart.phaseChip(b)}
      <div class="kv">${UI.icon("clock", 13)} ${UI.timeAr(b.booking_time)} • ${Lang.duration(b.duration)}</div>
      ${Number(b.price) > 0 && UI.money(b.price) ? `<div class="kv">${UI.icon("money", 13)} ${UI.money(b.price)}</div>` : ""}
      ${done && b.barber_id ? `<button class="rebook" data-nav="#/book/${b.barber_id}${b.service_id ? `?service=${b.service_id}` : ""}">${UI.icon("refresh", 14)} احجز نفس الموعد مجدداً</button>` : ""}
    </div>`;
  }

  // ---- PRODUCTS ----
  // Category, search text and page survive opening a product and coming back,
  // so the list is exactly where it was left.
  const shelf = { cat: null, query: "", page: 0 };
  async function products() {
    if (App.settings && App.settings.show_products === false) { Router.go("#/home"); return; }
    const PAGE = 16;
    let rows = [], hasNext = false;

    const cats = rpcPeek("list_categories", { p_only_enabled: true }) || [];
    const catsRequest = rpcCached("list_categories", { p_only_enabled: true });
    const first = rpcStale("list_products_v2", { p_only_active: true, p_limit: PAGE, p_offset: shelf.page * PAGE });
    rows = first.value || await first.refresh;
    hasNext = rows.length === PAGE;

    let categories = cats;
    // 2.28: customers may scan a product only when the owner allows it.
    let scanner = false;
    window.Workforce?.customerScanEnabled().then(on => { if (on && !scanner) { scanner = true; if (document.getElementById("psearch")) paint(); } }).catch(() => {});
    async function load() {
      rows = await rpcCached("list_products_v2", { p_only_active: true, p_limit: PAGE, p_offset: shelf.page * PAGE });
      hasNext = rows.length === PAGE;
    }
    function visible() {
      let items = shelf.cat ? rows.filter(p => p.category_id === shelf.cat) : rows;
      if (shelf.query) items = items.filter(p => p.name.includes(shelf.query));
      return items;
    }
    function paint() {
      const items = visible();
      UI.render(`${UI.header({ title: "المنتجات" })}
        <div class="content">
          <div class="row" style="gap:8px;max-width:440px"><div class="input-icon" style="flex:1">
            <input class="input" id="psearch" placeholder="البحث" value="${UI.esc(shelf.query)}" autocomplete="off">
            <span class="ic">${UI.icon("search", 18)}</span>
          </div>${scanner ? `<button class="btn line" id="pscan" type="button" aria-label="مسح باركود">${UI.icon("qr", 18)}</button>` : ""}</div>
          ${categories.length ? `<div class="chips" id="cats">
            <button class="chip ${!shelf.cat ? "active" : ""}" data-c="">الكل</button>
            ${categories.map(c => `<button class="chip ${shelf.cat === c.id ? "active" : ""}" data-c="${c.id}">${UI.esc(c.name)}</button>`).join("")}</div>` : ""}
          <div id="plist">${renderProducts(items)}</div>
          ${UI.pager(shelf.page, hasNext)}
        </div>`);
      document.querySelectorAll("#cats .chip").forEach(ch => ch.onclick = () => { shelf.cat = ch.getAttribute("data-c") || null; paint(); });
      const scan = document.getElementById("pscan"); if (scan) scan.onclick = () => Workforce.customerScanProduct();
      const search = document.getElementById("psearch");
      search.oninput = () => { shelf.query = search.value.trim(); document.getElementById("plist").innerHTML = renderProducts(visible()); };
      UI.wirePager(
        async () => { if (shelf.page > 0) { shelf.page--; await load(); paint(); } },
        async () => { if (hasNext) { shelf.page++; await load(); paint(); } });
    }
    paint();

    catsRequest.then(list => {
      if (!list || JSON.stringify(list) === JSON.stringify(categories)) return;
      categories = list; paint();
    }).catch(() => {});
    if (first.value) first.refresh.then(fresh => {
      if (!fresh || JSON.stringify(fresh) === JSON.stringify(rows)) return;
      rows = fresh; hasNext = fresh.length === PAGE; paint();
    }).catch(() => {});
    refreshUnread();
  }
  function renderProducts(items) {
    if (!items.length) return UI.empty("لا توجد منتجات", "لم تتم إضافة منتجات بعد.");
    return `<div class="prod-grid">${items.map(p => `
      <button class="prod" data-nav="#/product/${UI.esc(p.id)}" type="button">
        ${p.is_featured ? `<span class="featured-tag">مميز</span>` : ""}
        <div class="img">${p.image_url ? UI.img(p.image_url, { width: 240, height: 240 }) : UI.icon("box", 40)}</div>
        <div class="b"><h4>${UI.esc(p.name)}</h4>
          ${UI.money(p.price) ? `<div class="price">${UI.money(p.price)}</div>` : ""}
          ${Features.enabled("loyalty") && p.coin_price && p.purchase_mode !== "money" ? `<div class="coin-price">${UI.icon("star", 13)} ${Number(p.coin_price).toLocaleString(Lang.locale())} نقطة${p.purchase_mode === "coins" ? " فقط" : ""}</div>` : ""}
          <div class="tiny">${p.stock > 0 ? "متوفر" : "غير متوفر"}</div></div>
      </button>`).join("")}</div>`;
  }

  async function productDetails(p) {
    const pr = await rpcCached("get_product", { p_id: p.id });
    if (!pr) { UI.render(UI.backbar("غير موجود", "#/products") + `<div class="content">${UI.empty("المنتج غير موجود", "")}</div>`); return; }
    const gallery = Array.isArray(pr.gallery) ? pr.gallery : [];
    const coins = Features.enabled("loyalty") && pr.coin_price && ["coins", "both"].includes(pr.purchase_mode);
    UI.render(`${UI.header({ title: "تفاصيل المنتج", back: "#/products" })}
      <div class="content">
        <div class="grid g2" style="align-items:start">
          <div class="prod" style="max-width:100%">
            <div class="img" style="aspect-ratio:4/3">
              ${pr.image_url ? UI.img(pr.image_url, { width: 640, height: 480, eager: true }) : UI.icon("box", 50)}</div>
          </div>
          <div style="display:flex;flex-direction:column;gap:14px">
            <div class="card pad-lg"><h2 style="margin:0 0 6px;font-size:21px">${UI.esc(pr.name)}</h2>
              ${UI.money(pr.price) ? `<div style="color:var(--accent-ink);font-weight:800;font-size:19px">${UI.money(pr.price)}</div>` : ""}
              ${coins ? `<div class="coin-price big">${UI.icon("star", 15)} ${Number(pr.coin_price).toLocaleString(Lang.locale())} نقطة · Coins${pr.purchase_mode === "coins" ? " — بالنقاط فقط" : " — أو ادفع نقداً"}</div>` : ""}
              <div class="kv">${UI.icon("box", 14)} ${pr.stock > 0 ? `متوفر (${pr.stock})` : "غير متوفر حالياً"}</div>
              ${pr.description ? `<p class="muted" style="margin-top:10px;white-space:pre-wrap">${UI.esc(pr.description)}</p>` : ""}</div>
            ${gallery.length ? `<div class="chips">${gallery.map(g => UI.img(g, { width: 74, height: 74, style: "width:74px;height:74px;border-radius:13px;object-fit:contain;background:var(--panel)" })).join("")}</div>` : ""}
            ${coins && pr.stock > 0 ? `<button class="btn" data-nav="#/loyalty?tab=redeem">${UI.icon("star", 17)} استبدل بنقاطك · Redeem with coins</button>` : ""}
            <p class="tiny" style="text-align:center">${pr.purchase_mode === "coins" && coins ? "هذا المنتج متاح بالنقاط فقط." : "للشراء النقدي تواصل مع العمل؛ تُضاف نقاطك بعد إتمام الشراء."}</p>
          </div>
        </div>
      </div>`);
  }

  return { home, servicePick, barberProfile, bookingPage, myBookings, products, productDetails, refreshUnread };

  function toISO(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
})();
window.BookingPages = BookingPages;
