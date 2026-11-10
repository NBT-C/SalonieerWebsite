/* Supabase owns accounts, preferences, inbox and scheduling. Native code only
   supplies an installation credential and an FCM/APNs address. */
window.Features = (() => {
  // Salon entitlements (Products, Analytics, Loyalty Coins, …) resolved by the
  // server from plan, add-ons and platform overrides. They are cached briefly
  // for instant navigation, but never trusted for long: every gated route
  // re-checks once the value is older than FRESH, the app re-checks when it
  // returns to the foreground, and any "feature disabled" answer from the
  // server drops the cache at once. The server enforces every gate anyway.
  let values = {}, loadedSlug = null, loadedAt = 0, inflight = null, lastClient = null;
  const FRESH = 60000;
  // Keys a server that predates entitlements does not report. Loyalty is off
  // until the platform grants it; everything else keeps its old default (on).
  const MISSING = { loyalty: false };
  const listeners = new Set();
  const signature = v => JSON.stringify(Object.keys(v || {}).sort().map(k => [k, v[k]]));
  const api = {
    enabled: key => (key in values ? values[key] === true : (MISSING[key] ?? true)),
    values: () => ({ ...values }),
    async load(slug = Shop.slug(), client = window.sb, force = false) {
      lastClient = client;
      if (!force && loadedSlug === slug && Date.now() - loadedAt < FRESH) return true;
      if (inflight && loadedSlug === slug && !force) return inflight;
      loadedSlug = slug;
      inflight = (async () => {
        const { data, error } = await client.rpc('salonieer_features_v1', { p_slug: slug });
        if (!error && loadedSlug === slug) {
          const changed = loadedAt > 0 && signature(values) !== signature(data || {});
          values = data || {}; loadedAt = Date.now();
          if (changed) { window.rpcCacheBust?.(); listeners.forEach(fn => { try { fn(values); } catch {} }); }
        }
        return !error;
      })().finally(() => { inflight = null; });
      return inflight;
    },
    // Whatever is already known, with no request at all.
    ready: (slug = Shop.slug()) => loadedSlug === slug && loadedAt > 0,
    fresh: (slug = Shop.slug()) => loadedSlug === slug && Date.now() - loadedAt < FRESH,
    // Called when the server reports a disabled feature: the next check goes
    // to the network and the current page is re-evaluated.
    invalidate() { loadedAt = 0; },
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    refresh() { if (loadedSlug) return api.load(loadedSlug, lastClient || window.sb, true).catch(() => false); return Promise.resolve(false); },
    // Forget a salon that was left, so its entitlements never leak into the next one.
    reset(slug) { if (!slug || loadedSlug === slug) { values = {}; loadedSlug = null; loadedAt = 0; inflight = null; } },
  };
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') api.refresh(); });
  return api;
})();
window.Push = (() => {
  let syncing = null, ready = false, lastSyncAt = 0, lastSyncContext = '';
  const released = new Set(); // salons whose old binding was already switched off this session
  const pendingKey = 'salonieer:push-open';
  const E = x => UI.esc(x);
  async function call(name, args = {}) {
    const { data, error } = await sb.rpc('salonieer_' + name + '_v1', args);
    if (error) throw new Error(Lang.error(error.message || 'تعذّر الاتصال'));
    return data;
  }
  const context = () => ({ p_slug: Shop.slug(), p_token: App.token });
  async function status() {
    if (!NativeBridge.available()) return { permission: 'web', enabled: false };
    const raw = await NativeBridge.request('pushStatus');
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  }
  function pushMeta(device = {}) {
    const native = document.documentElement.dataset.native || '';
    const provider = ['fcm','apns'].includes(device.provider)
      ? device.provider
      : native === 'ios' ? 'apns' : native === 'android' ? 'fcm' : '';
    return {
      provider,
      label: provider === 'apns' ? 'APNs' : provider === 'fcm' ? 'FCM' : 'Push',
      platform: provider === 'apns' ? 'iOS' : provider === 'fcm' ? 'Android' : 'Android / iOS',
      ready: provider === 'apns' ? 'رمز APNs جاهز' : provider === 'fcm' ? 'رمز FCM جاهز' : 'رمز الإشعارات جاهز',
      missing: provider === 'apns' ? 'لم يتم استلام رمز APNs من Apple بعد' : provider === 'fcm' ? 'لم يحصل التطبيق على رمز FCM بعد' : 'لم يتم استلام رمز الإشعارات بعد'
    };
  }
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  async function waitForNativeToken(device) {
    let current = device;
    const meta = pushMeta(current);
    if (current?.token || current?.simulator || current?.permission !== 'granted' || meta.provider !== 'apns') return current;
    // APNs registration is asynchronous. The permission sheet can close before
    // didRegisterForRemoteNotificationsWithDeviceToken has delivered the token.
    for (let i = 0; i < 16; i++) {
      await delay(400);
      current = await status();
      if (current?.token || current?.error || current?.simulator) break;
    }
    return current;
  }
  function syncContext() {
    const saved=(Platform.saved?.()||[]).map(s=>s.slug).sort().join(',');
    return [document.documentElement.dataset.native||'', 'tenant',
      Shop.slug?.()||'', App.token||'', saved, Lang.get()].join('|');
  }
  // ---- Per-device switch --------------------------------------------------
  // Notifications are a property of this phone, not of the account: turning
  // them off here unbinds only this installation, and another phone signed in
  // to the same account keeps receiving. The choice lives on the device.
  const DEVICE_KEY = 'salonieer:device-notifications:v1';
  const deviceChoice = () => { try { return localStorage.getItem(DEVICE_KEY); } catch { return null; } };
  const setDeviceChoice = value => { try { localStorage.setItem(DEVICE_KEY, value); } catch {} };
  const deviceOff = () => deviceChoice() === 'off';
  function salonClient(salon) {
    return salon.supabase_url && salon.supabase_anon_key
      ? window.supabase.createClient(salon.supabase_url, salon.supabase_anon_key, {auth:{persistSession:false,autoRefreshToken:false}})
      : platformSb;
  }
  // Tells the phone which salon it may show alerts for (the open one, or none),
  // so a push already on its way for a salon that was left is not shown.
  function reportScope(active = '') {
    if (!NativeBridge.available()) return;
    NativeBridge.request('pushScope', { enabled:!deviceOff(), active }).catch(() => {});
  }
  // Clears the alerts of a salon already shown on this phone ('*' = all).
  function forgetOnDevice(slug) {
    if (!NativeBridge.available() || !slug) return;
    NativeBridge.request('pushForget', { slug }).catch(() => {});
  }
  // This phone stops receiving one salon's notifications: its binding is
  // switched off in that salon's own project. Best effort — leaving a salon
  // must work offline too; signing out also ends the session on the server,
  // which stops delivery on its own.
  async function unbindSalon(salon) {
    const slug = salon?.slug;
    forgetOnDevice(slug);
    if (!slug || !NativeBridge.available()) return;
    const device = await status().catch(() => null);
    if (!device?.id || !device.secret) return;
    await salonClient(salon).rpc('salonieer_unregister_device_v1',
      { p_id:device.id, p_secret:device.secret, p_slug:slug, p_audience:'tenant' }).catch(() => {});
    lastSyncContext = '';
  }
  // What the settings row shows: on / off on this device / blocked by the
  // phone / not available outside the app.
  async function deviceState() {
    if (!NativeBridge.available()) return { supported:false, on:false, permission:'web' };
    let s = null;
    try { s = await status(); } catch { s = null; }
    const permission = s?.permission || 'prompt';
    return { supported:true, permission, choice:deviceChoice(), on:!deviceOff() && permission === 'granted', device:s };
  }
  // Asks the operating system every time the switch is turned on. Android and
  // iOS only show their own dialog while the answer is still open; after a
  // permanent "don't allow" the result says so and the app offers Settings.
  async function enableOnDevice() {
    if (!NativeBridge.available()) return { ok:false, reason:'web' };
    setDeviceChoice('on');
    let s = await status();
    if (s?.permission !== 'granted') {
      try { await NativeBridge.request('pushEnable'); } catch {}
      s = await status();
    }
    if (s?.permission !== 'granted') return { ok:false, reason:'blocked', permission:s?.permission || 'denied' };
    // An older account-wide "off" (the previous version of this switch) must
    // not silently block the device that was just turned on.
    if (App.userSettings && App.userSettings.notify === false && window.Settings) await Settings.save(null, true);
    lastSyncContext = '';
    reportScope(Auth.isLoggedIn() ? Shop.slug() : '');
    const result = await sync(true);
    return { ok:true, result };
  }
  async function disableOnDevice() {
    setDeviceChoice('off');
    lastSyncContext = '';
    if (!NativeBridge.available()) return { ok:true };
    reportScope();
    forgetOnDevice('*');
    const device = await status().catch(() => null);
    if (!device?.id || !device.secret) return { ok:true };
    // Every salon this device is signed in to stops sending to this phone.
    const saved = Platform.saved?.() || [];
    const salons = new Map(saved.map(x => [x.slug, x]));
    salons.set(Shop.slug(), Platform.current?.() || {slug:Shop.slug()});
    const failures = [];
    for (const [slug, salon] of salons) {
      if (!localStorage.getItem('aj_token:' + slug)) continue;
      const { error } = await salonClient(salon).rpc('salonieer_unregister_device_v1',
        { p_id:device.id, p_secret:device.secret, p_slug:slug, p_audience:'tenant' });
      if (error && slug === Shop.slug()) failures.push(error);
    }
    if (failures.length) { setDeviceChoice('on'); reportScope(Shop.slug()); throw new Error(Lang.error(failures[0].message || 'تعذّر إيقاف الإشعارات')); }
    return { ok:true };
  }
  async function openSettings() { try { await NativeBridge.request('pushSettings'); } catch {} }

  async function sync(force = false) {
    if (!NativeBridge.available()) return { ok:false, reason:'web' };
    // Turned off on this phone: never re-register it behind the person's back
    // (resume, token rotation, a language change or a new sign-in).
    if (deviceOff()) return { ok:false, reason:'device_off' };
    // A guest has no private account to bind. In particular, do not reuse
    // sessions retained for other salons when native resume rotates a token.
    if (Auth.isGuest() || !Auth.isLoggedIn())
      return { ok:false, reason:'no_account' };
    const contextKey=syncContext();
    if (!force && contextKey===lastSyncContext && Date.now()-lastSyncAt<5*60*1000)
      return { ok:true, cached:true };
    if (syncing) return syncing;
    syncing = (async () => {
      // Android keeps a narrowly-scoped endpoint so FCM token rotations can be
      // updated in the background. iOS registers its APNs token through this
      // same web/Supabase binding once Apple returns it.
      if (document.documentElement.dataset.native === 'android') {
        await NativeBridge.request('pushEndpoint',{url:CONFIG.SUPABASE_URL,key:CONFIG.SUPABASE_ANON_KEY});
      }
      let device = await status();
      device = await waitForNativeToken(device);
      if (!device?.id || !device.secret) throw new Error('تعذّر إنشاء هوية هذا الجهاز');
      const meta = pushMeta(device);
      if (!device.token) {
        if (device.simulator && meta.provider === 'apns') throw new Error('محاكي iOS لا يملك رمز APNs حقيقياً. اختبر الإشعارات على iPhone حقيقي عبر TestFlight.');
        if (device.permission === 'denied') throw new Error('الإشعارات موقوفة من إعدادات الهاتف. افتح الإعدادات واسمح بالإشعارات أولاً.');
        if (device.permission === 'prompt') throw new Error('اسمح بالإشعارات أولاً حتى يتم إنشاء رمز الجهاز.');
        throw new Error(device.error || meta.missing);
      }

      // Only the salon that is open receives on this phone. Bindings left over
      // from other saved salons (older versions bound every saved salon) are
      // switched off, best effort, so leaving a salon really stops its alerts.
      const currentSlug = Shop.slug();
      reportScope(currentSlug);
      const salon = Platform.current?.() || {slug:currentSlug};
      const token = localStorage.getItem('aj_token:' + currentSlug);
      let currentRegistered = false;
      if (token) {
        const { error } = await salonClient(salon).rpc('salonieer_register_device_v1', { p_slug:currentSlug, p_token:token,
          p_device:{ ...device, language:Lang.get() } });
        if (error) throw new Error(Lang.error(error.message || 'تعذّر تسجيل الجهاز في العمل الحالي'));
        currentRegistered = true;
      }
      const warnings = [];
      for (const other of (Platform.saved?.() || []).filter(x => x.slug !== currentSlug && !released.has(x.slug) && localStorage.getItem('aj_token:' + x.slug))) {
        released.add(other.slug);
        salonClient(other).rpc('salonieer_unregister_device_v1', { p_id:device.id, p_secret:device.secret, p_slug:other.slug, p_audience:'tenant' })
          .then(({ error }) => { if (error) warnings.push(other.slug); }, () => {});
      }
      if (Auth.isLoggedIn() && !currentRegistered) throw new Error('تعذّر ربط هذا الجهاز بحساب العمل الحالي');
      lastSyncAt=Date.now();lastSyncContext=contextKey;
      return { ok:true, device, warnings };
    })().finally(() => { syncing = null; });
    return syncing;
  }
  async function unbind() {
    if (!NativeBridge.available()) return;
    const device = await status();
    if (!device?.id || !device.secret) return;
    // Must succeed before signing out, including offline: prevents background
    // notification content remaining associated with a logged-out installation.
    await call('unregister_device', { p_id: device.id, p_secret: device.secret,
      p_slug: Shop.slug(), p_audience: 'tenant' });
  }
  function receive(data) {
    if (typeof data === 'string') { try { data = JSON.parse(data); } catch { return; } }
    if (!data || !/^[a-z][a-z0-9_]{1,31}$/.test(data.salon_slug || '') || !['tenant','platform'].includes(data.audience)) return;
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (data.booking_id && !uuid.test(data.booking_id)) return;
    const resourceType=['booking','customer','employee','service','notifications','salon','waitlist','inventory','packages','requests','team','attendance','my_requests'].includes(data.resource_type)?data.resource_type:(data.booking_id?'booking':'salon');
    const resourceId=String(data.resource_id || data.booking_id || '').slice(0,80);
    sessionStorage.setItem(pendingKey, JSON.stringify({ salon_slug:data.salon_slug, audience:data.audience,
      booking_id:data.booking_id || '', resource_type:resourceType, resource_id:resourceId, action:String(data.action||'open').slice(0,32) }));
    if (ready) openPending();
  }
  function openPending() {
    let data; try { data = JSON.parse(sessionStorage.getItem(pendingKey) || 'null'); } catch { return false; }
    if (!data) return false;
    // Nothing to open on this device right now — never leave the app half
    // navigated or drifting toward Business/admin. Land on the plain main
    // screen (salon selection / home) and let the person take it from there.
    const nowhere = () => {
      sessionStorage.removeItem(pendingKey);
      localStorage.setItem('salonieer:mode', 'customer');
      location.replace('index.html');
      return true;
    };
    // A push is never an authorization gesture for the private global Admin
    // Dashboard. Platform copies are resolved back into their originating
    // salon just like tenant copies.
    // An alert from a salon that was removed from this device must not add it back.
    if (data.audience === 'tenant' && Shop.slug() !== data.salon_slug && !(Platform.saved?.() || []).some(x => x.slug === data.salon_slug)) return nowhere();
    if (Shop.slug() !== data.salon_slug) {
      localStorage.setItem('salonieer:mode', 'customer');
      location.replace('index.html?salon=' + encodeURIComponent(data.salon_slug)); return true;
    }
    if (!Auth.isLoggedIn()) return nowhere();
    sessionStorage.removeItem(pendingKey);
    const destination = data.booking_id || data.resource_type === 'booking'
      ? '#/reservation/' + encodeURIComponent(data.booking_id || data.resource_id)
      : data.resource_type === 'customer' && Auth.isAdmin() ? '#/admin/users'
      : data.resource_type === 'employee' && Auth.isAdmin() ? '#/admin/barbers'
      : data.resource_type === 'service' && Auth.isAdmin() ? '#/admin/services'
      : data.resource_type === 'notifications' ? '#/notifications'
      : data.resource_type === 'waitlist' ? '#/waitlist'
      // A purchase request opens itself in the Action Center (its current state,
      // even when someone already handled it); the customer's own copy opens My Packages.
      : data.resource_type === 'packages' ? (Auth.can('requests') && data.resource_id ? '#/admin/requests?type=packages&focus=' + encodeURIComponent(data.resource_id)
          : Auth.isAdmin() ? '#/admin/biz-packages' : '#/packages?tab=mine')
      : data.resource_type === 'inventory' && Auth.isAdmin() ? '#/admin/biz-inventory'
      // 2.33: decisions waiting for the salon (memberships, invitations, leave) and the team.
      // The exact item is highlighted; one already handled says so (no second decision).
      : data.resource_type === 'requests' && Auth.isStaff() ? '#/admin/requests' + (data.resource_id ? '?focus=' + encodeURIComponent(data.resource_id) : '')
      : data.resource_type === 'team' && Auth.isAdmin() ? '#/admin/barbers'
      : data.resource_type === 'attendance' && Auth.can('attendance') ? '#/admin/biz-attendance'
      // The employee's own leave / schedule request, with its decision.
      : data.resource_type === 'my_requests' ? '#/settings'
      : '#/home';
    Router.go(destination);
    return true;
  }
  async function promptOnEntry() {
    if (!NativeBridge.available() || !Auth.isLoggedIn()) return false;
    // Someone who switched notifications off on this phone is not asked again
    // on every launch; the switch in Account turns them back on.
    if (deviceOff()) return false;
    const key='salonieer:push-prompted:'+Shop.slug();
    if (sessionStorage.getItem(key)==='1') return false;
    sessionStorage.setItem(key,'1');
    let s;try{s=await status();}catch{return false;}
    if (s?.permission==='granted') { sync(true).catch(()=>{}); return false; }
    // 2.30: the phone asks on the first launch. Someone who already answered
    // "no" is not asked again here (Account → Notifications turns it on).
    if (s?.permission!=='prompt') return false;
    UI.modal(`<div class="push-entry-prompt"><div class="push-entry-icon">${UI.icon('bell',28)}</div><h2>فعّل الإشعارات</h2><p>ليصلك تأكيد الحجز وتغييرات الموعد والتذكير قبل زيارتك.</p><div class="btn-row"><button class="btn" id="push-entry-enable">تفعيل الآن</button><button class="btn line" id="push-entry-later">لاحقاً</button></div><p class="form-error" id="push-entry-error" role="status"></p></div>`);
    document.getElementById('push-entry-later').onclick=UI.closeModal;
    document.getElementById('push-entry-enable').onclick=async e=>{
      const button=e.currentTarget;button.disabled=true;
      try{
        const r=await enableOnDevice();
        if(!r.ok){
          const box=document.getElementById('push-entry-error');
          if(box)box.innerHTML=`${E(Lang.t('الإشعارات موقوفة من إعدادات الهاتف.'))} <button class="btn line sm" id="push-entry-settings" type="button">${UI.icon('cog',15)} ${E(Lang.t('فتح الإعدادات'))}</button>`;
          document.getElementById('push-entry-settings')?.addEventListener('click',openSettings);
          button.disabled=false;return;
        }
        UI.closeModal();UI.toast('تم تفعيل الإشعارات','ok');
      }catch(error){const box=document.getElementById('push-entry-error');if(box)box.textContent=error.message||'تعذّر تفعيل الإشعارات';button.disabled=false;}
    };
    return true;
  }
  const kindMeta = {
    booking_created:['calendar','حجز جديد'],status_updates:['check','تحديث الحجز'],rescheduled:['clock','موعد جديد'],
    customer_booking_created:['calendar','حجز جديد'],customer_booking_rescheduled:['clock','موعد جديد'],
    customer_booking_pending:['clock','الحجز بانتظار التأكيد'],customer_booking_confirmed:['check','تم تأكيد الحجز'],
    customer_booking_completed:['check','اكتمل الحجز'],customer_booking_cancelled:['info','تم إلغاء الحجز'],
    customer_booking_no_show:['info','تحديث الحجز'],customer_booking_updated:['check','تحديث الحجز'],
    barber_booking_created:['users','حجز جديد للمختص'],barber_booking_rescheduled:['clock','تغيير موعد للمختص'],
    barber_booking_pending:['users','تحديث حجز المختص'],barber_booking_confirmed:['users','تحديث حجز المختص'],
    barber_booking_completed:['users','تحديث حجز المختص'],barber_booking_cancelled:['users','تحديث حجز المختص'],
    barber_booking_no_show:['users','تحديث حجز المختص'],barber_booking_updated:['users','تحديث حجز المختص'],
    barber_booking_removed:['users','أزيل حجز من المختص'],owner_activity:['users','نشاط المختصين'],
    reminder:['bell','تذكير بالموعد'],staff_bookings:['users','إدارة الحجوزات'],announcements:['info','إعلان'],test:['bell','إشعار تجريبي'],
    biz_waitlist_offer:['clock','توفّر موعد من قائمة الانتظار'],biz_booking_followup:['clock','حجز يحتاج تحديث الحالة'],biz_booking_expired:['info','انتهى حجزك دون تحديث'],biz_package_request:['star','طلب باقة'],biz_deposit_required:['lock','عربون مطلوب'],biz_deposit_reminder:['lock','تذكير بالعربون'],
    biz_deposit_paid:['check','تم استلام العربون'],biz_deposit_expired:['info','انتهت مهلة العربون'],biz_deposit_status:['lock','تحديث على العربون'],
    biz_deposit_refunded:['money','استرجاع العربون'],biz_deposit_staff:['lock','عربون يحتاج إجراء'],biz_payment_received:['money','تم الدفع'],
    biz_payment_failed:['info','لم يكتمل الدفع'],biz_payment_link:['globe','رابط الدفع'],biz_refund_issued:['money','استرجاع مبلغ'],biz_low_stock:['box','تنبيه المخزون'],
    biz_attendance_in:['clock','تسجيل حضور'],biz_attendance_early:['clock','انصراف مبكر'],biz_attendance_review:['clock','انصراف تلقائي بانتظار المراجعة'],biz_attendance_request:['clock','طلب تسجيل حضور بدون موقع'],
    membership_request:['user','طلب انضمام جديد'],membership_decided:['user','طلب الانضمام'],team_member:['users','الفريق'],booking_reassigned:['users','تغيّر المختص في موعدك']
  };
  // The filter a card belongs to (Requests = anything that waits for a decision).
  const REQUEST_KINDS=['biz_package_request','membership_request','biz_attendance_request','biz_booking_followup','biz_deposit_staff','team_member'];
  const category = kind => REQUEST_KINDS.includes(kind) ? 'requests'
    : kind==='reminder' ? 'reminder' : kind==='announcements' ? 'announcements'
    : ['booking_created','status_updates','rescheduled','staff_bookings','booking_reassigned'].includes(kind)||kind.startsWith('customer_booking_')||kind.startsWith('barber_booking_') ? 'booking' : 'other';
  const statusLabel = value => ({pending:'بانتظار التأكيد',confirmed:'مؤكد',completed:'مكتمل',cancelled:'ملغي',no_show:'لم يحضر',expired:'منتهي'})[value] || value || '';
  function groupLabel(date) {
    const today=new Date(),d=new Date(date),one=86400000;
    const same=(a,b)=>a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()&&a.getDate()===b.getDate();
    if(same(today,d))return 'اليوم';
    if(same(new Date(today-one),d))return 'أمس';
    return d.toLocaleDateString(Lang.locale(),{weekday:'long',day:'numeric',month:'long'});
  }
  // Where tapping a notification leads. Every card has a destination; the
  // fallback is the inbox itself, never a dead end.
  function destination(n) {
    if (n.booking_id) return 'booking';
    const t = n.details?.resource_type || n.details?.destination;
    return ['customer','employee','service','notifications','salon','waitlist','inventory','packages','requests','team','attendance','my_requests'].includes(t) ? t : '';
  }
  const forward = () => document.documentElement.dir === 'rtl' ? 'arrowL' : 'arrowR';
  // Staff alerts about a request that still waits for an answer come first.
  const needsAction = n => n.kind === 'barber_booking_created' && (n.details?.status === 'pending' || n.booking_status === 'pending');
  function notificationCard(n, related = []) {
    const d=n.details||{},meta=kindMeta[n.kind]||['bell','تحديث'];
    const copy=Lang.notification(n);
    const details=[['الخدمة',d.service,true],['المختص',d.specialist,true],['العميل',d.customer,true],['التاريخ',d.date?(window.Smart&&Math.abs(Smart.dayDiff(d.date))<=6?Smart.dayLabel(d.date)+' · '+Lang.date(d.date,{day:'numeric',month:'short'}):UI.dateAr(d.date)):''],
      ['الوقت',d.time ? UI.timeAr(d.time)+(d.end_time?' – '+UI.timeAr(d.end_time):'') : ''],
      ['السعر',d.price!==undefined&&d.price!==null&&d.price!=='' ? (window.Money ? Money.fmt(d.price) : Lang.number(d.price)+' '+Lang.t('شيكل')):''],['الحالة',Lang.t(statusLabel(d.status))],['العنوان',d.address,true]]
      .filter(([,value])=>value!==undefined&&value!==null&&value!=='');
    const when=new Date(n.created_at);
    const target=destination(n);
    // 2.34: compact by default — a short title, at most two lines and the
    // time. Everything else (the whole text, the facts, earlier updates of the
    // same booking) is one tap away under "Show more"; nothing is cut or lost.
    const body=String(copy.body||'').trim();
    const lead=details.length&&n.kind!=='announcements'?body.split('\n')[0]:body;
    const longer=body.length>110||body.includes('\n')||details.length>0||related.length>0;
    const upcoming=n.kind==='reminder'&&d.date&&d.time&&window.Smart?Smart.phaseChip({booking_date:d.date,booking_time:d.time,duration:d.duration,status:'confirmed'}):'';
    const skipText=n.kind==='announcements'?'data-i18n-skip':'';
    return `<article class="studio-notification sn-compact ${n.is_read?'':'is-unread'} ${target?'is-link':''} ${needsAction(n)?'needs-action':''}" data-kind="${E(n.kind||'other')}" data-open-card="${target?E(n.id):''}" ${target?'role="button" tabindex="0"':''} data-search="${E((copy.title+' '+copy.body+' '+Object.values(d).join(' ')).toLocaleLowerCase())}">
      <div class="studio-notification-heading"><span>${UI.icon(meta[0],17)}</span><div><small ${n.salon_name?'data-i18n-skip':''}>${E(n.salon_name||Lang.t(meta[1]))}</small><h3 ${skipText}>${E(copy.title||Lang.t(meta[1]))}</h3></div>${needsAction(n)?`<em class="smart-chip tone-warn">${E(Lang.t('بحاجة لإجراء'))}</em>`:''}${n.is_read?'':'<i class="studio-unread-dot" aria-label="جديد"></i>'}</div>
      ${lead?`<p class="studio-notification-body sn-lead" ${skipText}>${E(lead)}</p>`:''}
      ${upcoming}
      ${longer?`<div class="sn-more" id="sn-more-${E(n.id)}" hidden>
        ${body!==lead||body.length>110?`<p class="studio-notification-body sn-full" ${skipText}>${E(body)}</p>`:''}
        ${details.length?`<div class="studio-notification-details">${details.map(([label,value,skip])=>`<div class="studio-detail"><small>${E(Lang.t(label))}</small><b ${skip?'data-i18n-skip':''}>${E(value)}</b></div>`).join('')}</div>`:''}
        ${related.length?`<div class="studio-related"><b>${E(Smart.pick(`${Lang.number(related.length)} تحديثات سابقة لهذا الحجز`,`${Lang.number(related.length)} earlier updates for this booking`,`${Lang.number(related.length)} עדכונים קודמים לתור הזה`))}</b><ol>${related.map(r=>{const c=Lang.notification(r);return `<li><b>${E(c.title||Lang.t((kindMeta[r.kind]||['','تحديث'])[1]))}</b><time data-smart-ago="${E(r.created_at)}" title="${E(new Date(r.created_at).toLocaleString(Lang.locale()))}">${E(window.Smart?Smart.ago(r.created_at):'')}</time></li>`;}).join('')}</ol></div>`:''}
      </div>`:''}
      <footer class="studio-notification-footer"><time datetime="${E(n.created_at)}" data-smart-ago="${E(n.created_at)}" title="${E(when.toLocaleString(Lang.locale()))}">${E(window.Smart?Smart.ago(n.created_at):when.toLocaleTimeString(Lang.locale(),{hour:'2-digit',minute:'2-digit'}))}</time>
        ${longer?`<button type="button" class="sn-toggle" data-sn-toggle="${E(n.id)}" aria-expanded="false" aria-controls="sn-more-${E(n.id)}"><span>${E(Lang.t('عرض المزيد'))}</span>${UI.icon('down',14)}</button>`:''}
        ${n.booking_id?`<button class="studio-open-link" data-open-booking="${E(n.id)}">${E(Lang.t('تفاصيل الحجز'))} ${UI.icon(forward(),15)}</button>`:''}</footer>
    </article>`;
  }
  // Show more / Show less on a compact card (never opens the card itself).
  function wireToggles(root) {
    root.querySelectorAll('[data-sn-toggle]').forEach(b=>b.onclick=e=>{
      e.stopPropagation();
      const more=document.getElementById('sn-more-'+b.dataset.snToggle);if(!more)return;
      const open=more.hidden;more.hidden=!open;b.setAttribute('aria-expanded',String(open));
      b.closest('.studio-notification')?.classList.toggle('expanded',open);
      b.querySelector('span').textContent=Lang.t(open?'عرض أقل':'عرض المزيد');
    });
  }
  // Group a page of alerts: every booking appears once (its newest update),
  // with the earlier ones folded underneath it. Exact duplicates are dropped.
  function groupRelated(items) {
    const seen=new Set(), heads=[], byBooking=new Map();
    for (const n of items) {
      const fingerprint=[n.kind,n.booking_id||'',n.title,n.body].join('|');
      if (seen.has(fingerprint)) continue;
      seen.add(fingerprint);
      if (n.booking_id && byBooking.has(n.booking_id)) { byBooking.get(n.booking_id).related.push(n); continue; }
      const entry={head:n,related:[]};
      heads.push(entry);
      if (n.booking_id) byBooking.set(n.booking_id,entry);
    }
    return heads;
  }
  function repaintNavDot() {
    document.querySelectorAll('.navitem[data-nav="#/notifications"] .nav-symbol').forEach(sym=>{
      const dot=sym.querySelector('.nav-dot');
      if(App.unread>0&&!dot)sym.insertAdjacentHTML('beforeend','<span class="nav-dot"></span>');
      if(!(App.unread>0)&&dot)dot.remove();
    });
    paintBell();
  }

  // ── 2.34: the bell ─────────────────────────────────────────────────────
  // In the top bar of the primary screens. Two separate things on it: a dot
  // for unread notifications, a number for requests waiting for a decision
  // (staff only). It opens a light panel: Notifications | Requests.
  // Reading an alert never decides the request behind it.
  let pendingRequests=0, requestsAt=0;
  const canRequests=()=>!!(App.token&&!Auth.isGuest?.()&&(Auth.isAdmin()||Auth.can?.('staff')));
  function bellButton() {
    if(!Auth.isLoggedIn?.()||Auth.isGuest?.())return '';
    return `<button type="button" class="iconbtn bell-btn" data-bell aria-haspopup="dialog" aria-label="${E(Lang.t('الإشعارات والطلبات'))}">${UI.icon('bell',20)}<i class="bell-dot" ${App.unread>0?'':'hidden'}></i><em class="bell-count" ${pendingRequests>0&&canRequests()?'':'hidden'}>${Lang.number(pendingRequests)}</em></button>`;
  }
  function paintBell() {
    document.querySelectorAll('[data-bell]').forEach(b=>{
      const dot=b.querySelector('.bell-dot'),count=b.querySelector('.bell-count');
      if(dot)dot.hidden=!(App.unread>0);
      if(count){count.hidden=!(pendingRequests>0&&canRequests());count.textContent=Lang.number(pendingRequests);}
      b.setAttribute('aria-label',Lang.t('الإشعارات والطلبات')+(App.unread>0?' · '+Smart.pick(`${Lang.number(App.unread)} غير مقروء`,`${App.unread} unread`,`${App.unread} שלא נקראו`):'')+(pendingRequests>0&&canRequests()?' · '+Smart.pick(`${Lang.number(pendingRequests)} طلب`,`${pendingRequests} requests`,`${pendingRequests} בקשות`):''));
    });
  }
  // The requests number is read when a screen with the bell opens (at most every 30 s).
  async function refreshBell(force=false) {
    if(!document.querySelector('[data-bell]')){return;}
    if(canRequests()&&(force||Date.now()-requestsAt>30000)){
      requestsAt=Date.now();
      try{pendingRequests=Number(await rpc('admin_requests_count',{p_token:App.token}))||0;}catch{pendingRequests=0;}
    }
    paintBell();
  }
  async function openBell(tab) {
    const staff=canRequests();
    let active=tab==='requests'&&staff?'requests':'notifications';
    UI.modal(`<div class="bell-panel"><div class="mhead"><h3>${E(Lang.t('الإشعارات'))}</h3><button class="iconbtn" id="bp-x" aria-label="${E(Lang.t('إغلاق'))}">${UI.icon('x',20)}</button></div>
      ${staff?`<div class="bell-tabs seg" role="tablist"><button type="button" role="tab" data-bp-tab="notifications">${E(Lang.t('الإشعارات'))}<em class="bell-tab-n" id="bp-n-notifications"></em></button><button type="button" role="tab" data-bp-tab="requests">${E(Lang.t('الطلبات'))}<em class="bell-tab-n" id="bp-n-requests"></em></button></div>`:''}
      <div id="bp-body" class="bell-body">${UI.loading()}</div></div>`);
    document.getElementById('bp-x').onclick=UI.closeModal;
    const setTab=v=>{active=v;document.querySelectorAll('[data-bp-tab]').forEach(b=>{const on=b.dataset.bpTab===v;b.classList.toggle('on',on);b.setAttribute('aria-selected',String(on));});paintTab();};
    document.querySelectorAll('[data-bp-tab]').forEach(b=>b.onclick=()=>setTab(b.dataset.bpTab));
    const count=(id,n)=>{const el=document.getElementById(id);if(el){el.textContent=n?Lang.number(n):'';el.hidden=!n;}};
    count('bp-n-notifications',App.unread);count('bp-n-requests',pendingRequests);
    async function paintTab() {
      const host=document.getElementById('bp-body');if(!host)return;
      host.innerHTML=UI.loading();
      if(active==='notifications'){
        let feed;try{feed=await call('inbox',{...context(),p_offset:0});}catch(e){host.innerHTML=`<div class="card">${E(e.message)}</div>`;return;}
        if(active!=='notifications'||!document.getElementById('bp-body'))return;
        const items=groupRelated((feed.items||[]).slice(0,8));
        host.innerHTML=`${items.length?`<div class="bell-list">${items.map(x=>notificationCard(x.head,x.related)).join('')}</div>`:UI.empty(Lang.t('لا توجد إشعارات'),'')}
          <button type="button" class="btn line bell-all" data-nav="#/notifications">${E(Lang.t('كل الإشعارات'))} ${UI.icon(forward(),15)}</button>`;
        wireToggles(host);
        host.querySelectorAll('[data-open-booking],[data-open-card]').forEach(el=>el.addEventListener('click',e=>{
          if(e.target.closest('[data-sn-toggle],.sn-more'))return;
          const id=el.dataset.openBooking||el.dataset.openCard;const n=(feed.items||[]).find(x=>x.id===id);if(!n||!destination(n))return;
          e.stopPropagation();UI.closeModal();const d=n.details||{};
          receive({...n,resource_type:d.resource_type||d.destination||'',resource_id:d.resource_id||'',action:d.action||'open',audience:'tenant'});
        }));
        host.querySelector('.bell-all').onclick=()=>{UI.closeModal();Router.go('#/notifications');};
        // Shown = read (exactly like the Notifications page). Requests stay open.
        const ids=(feed.items||[]).slice(0,8).filter(n=>!n.is_read).map(n=>n.id);
        if(ids.length){try{await call('read_notifications',{...context(),p_ids:ids});}catch{}App.unread=Math.max(0,(feed.unread||0)-ids.length);}
        else App.unread=feed.unread||0;
        repaintNavDot();count('bp-n-notifications',App.unread);
        return;
      }
      let r;try{r=await rpc('admin_requests',{p_token:App.token});}catch(e){host.innerHTML=`<div class="card">${E(e.message)}</div>`;return;}
      if(active!=='requests'||!document.getElementById('bp-body'))return;
      const base=window.Control?.target()?'#/platform/salon/'+Control.target().slug:'#/admin';
      const pk=r.package_requests||[],ms=r.membership||[],ac=r.accepted_invites||[],tr=r.team_requests||[],tm=r.time_requests||[];
      const n=pk.length+ms.length+ac.length+tr.length+tm.length+(Number(r.attendance)||0);
      pendingRequests=n;requestsAt=Date.now();paintBell();count('bp-n-requests',n);
      const item=(href,icon,title,sub,tone='')=>`<button type="button" class="bell-req ${tone}" data-bp-go="${E(href)}">${UI.icon(icon,17)}<span><b data-i18n-skip>${E(title)}</b><small>${sub}</small></span>${UI.icon(forward(),15)}</button>`;
      const group=(label,list)=>list.length?`<div class="sec-label">${E(Lang.t(label))} <em>${Lang.number(list.length)}</em></div>${list.join('')}`:'';
      host.innerHTML=n?`<div class="bell-list">
          ${group('طلبات شراء الباقات',pk.map(q=>item(`${base}/requests?type=packages&focus=${q.id}`,'star',q.customer_name||q.customer_phone||'',`<span data-i18n-skip>${E(q.package_name||'')}</span> · <time>${E(window.Smart?Smart.ago(q.created_at):'')}</time>`,'prominent')))}
          ${group('طلبات انضمام العملاء',ms.map(u=>item(`${base}/requests?focus=${u.id}`,'user',u.name||u.phone,`<bdi dir="ltr">${E(u.phone||'')}</bdi>`)))}
          ${group('دعوات مقبولة بانتظار التفعيل',ac.map(m=>item(`${base}/requests?focus=${m.id}`,'users',m.name,`<bdi dir="ltr">${E(m.phone||'')}</bdi>`)))}
          ${group('طلبات الانضمام إلى الفريق',tr.map(q=>item(`${base}/requests?focus=${q.id}`,'scissors',q.name||q.phone,`<bdi dir="ltr">${E(q.phone||'')}</bdi>`)))}
          ${group('الإجازات وتعديل الدوام',tm.map(t=>item(`${base}/requests?focus=${t.id}`,'calendar',t.name,E(Lang.t(t.kind==='leave'?'إجازة':'تعديل أوقات العمل')))))}
          ${Number(r.attendance)?group('الحضور بانتظار المراجعة',[item(`${base}/biz-attendance`,'clock',Smart.pick(`${Lang.number(r.attendance)} سجل`,`${r.attendance} records`,`${r.attendance} רשומות`),E(Lang.t('سجل يحتاج مراجعة')))]):''}
        </div>`:UI.empty(Lang.t('لا توجد طلبات'),Lang.t('كل ما يحتاج قرارك سيظهر هنا.'));
      host.insertAdjacentHTML('beforeend',`<button type="button" class="btn line bell-all" data-bp-go="${E(base)}/requests">${E(Lang.t('مركز الطلبات'))} ${UI.icon(forward(),15)}</button>`);
      host.querySelectorAll('[data-bp-go]').forEach(b=>b.onclick=()=>{UI.closeModal();Router.go(b.dataset.bpGo);});
    }
    if(staff)setTab(active);else paintTab();
  }
  document.addEventListener('click',e=>{const b=e.target.closest?.('[data-bell]');if(!b)return;e.preventDefault();e.stopPropagation();openBell();},true);
  async function inbox() {
    const PAGE_SIZE=10;
    let offset = 0, activeKind='all', query='', requestId=0, signature='';
    const args = context();
    const staff = (Auth.isAdmin()||App.user?.role==='barber'||App.user?.barber_id);
    const team = staff || Auth.isStaff();
    async function paint(feedIn) {
      const id=++requestId, pageOffset=offset;
      const feed = feedIn || await call('inbox', { ...args, p_offset: pageOffset });
      if(id!==requestId)return;
      const items=(feed.items||[]).slice(0,PAGE_SIZE);
      signature=JSON.stringify(items.map(n=>[n.id,n.is_read]));
      // Requests waiting for a specialist float to the top of the first page.
      const entries=groupRelated(items).sort((a,b)=>pageOffset===0?(needsAction(b.head)-needsAction(a.head)):0);
      const grouped=[];let label='';
      for(const entry of entries){const next=needsAction(entry.head)&&pageOffset===0?Lang.t('بحاجة لإجراء'):groupLabel(entry.head.created_at);if(next!==label){label=next;grouped.push({label,items:[]});}grouped[grouped.length-1].items.push(entry);}
      const pageNo=pageOffset/PAGE_SIZE+1;
      const pager=(pageOffset>0||feed.has_more)?`<nav class="smart-pager" aria-label="${Lang.t('صفحات الإشعارات')}">
          <button class="smart-pager-btn" id="push-prev" ${pageOffset===0?'disabled':''}>${UI.icon(document.documentElement.dir==='rtl'?'arrowR':'arrowL',16)}<span>الأحدث</span></button>
          <span class="smart-pager-page">${Lang.t('الصفحة')} <b>${Lang.number(pageNo)}</b></span>
          <button class="smart-pager-btn" id="push-next" ${!feed.has_more?'disabled':''}><span>الأقدم</span>${UI.icon(forward(),16)}</button></nav>`:'';
      UI.render(`${UI.header({title:'الإشعارات',back:null,bell:false,right:staff?`<button class="btn line sm" data-nav="#/notifications/history">${UI.icon('list',15)} طلبات الحجز</button>`:''})}<div class="content">
        <div class="studio-inbox-tools"><label class="studio-search">${UI.icon('search',18)}<input id="push-search" aria-label="بحث الإشعارات" placeholder="البحث" value="${E(query)}"></label>
          <div class="studio-filter-row" role="group" aria-label="${Lang.t('تصفية')}"><button class="studio-filter" data-filter="all" aria-pressed="${activeKind==='all'}">الكل</button><button class="studio-filter" data-filter="booking" aria-pressed="${activeKind==='booking'}">الحجوزات</button><button class="studio-filter" data-filter="reminder" aria-pressed="${activeKind==='reminder'}">التذكيرات</button><button class="studio-filter" data-filter="announcements" aria-pressed="${activeKind==='announcements'}">الإعلانات</button>${team?`<button class="studio-filter" data-filter="requests" aria-pressed="${activeKind==='requests'}">الطلبات</button>`:''}<button class="studio-filter" data-filter="unread" aria-pressed="${activeKind==='unread'}">غير المقروءة</button>
          <button class="studio-filter icon-only" id="push-refresh" aria-label="تحديث">${UI.icon('refresh',16)}</button></div></div>
        <div id="studio-feed">${grouped.length?grouped.map(g=>`<section class="studio-feed-section"><h2 class="studio-feed-group">${E(g.label)}</h2>${g.items.map(e=>notificationCard(e.head,e.related)).join('')}</section>`).join(''):UI.empty('لا توجد إشعارات','ستظهر هنا تحديثات الحجوزات والتذكيرات ورسائل العمل.',staff?'':'احجز موعد','#/home')}</div>
        ${pager}
      </div>`);
      const filter=()=>{
        let shown=0;
        document.querySelectorAll('.studio-notification').forEach(card=>{
          const kind=card.dataset.kind||'',kindOk=activeKind==='all'||(activeKind==='unread'?card.classList.contains('is-unread'):category(kind)===activeKind);
          card.hidden=!(kindOk&&card.dataset.search.includes(query));if(!card.hidden)shown++;
        });
        document.querySelectorAll('.studio-feed-section').forEach(section=>section.hidden=![...section.querySelectorAll('.studio-notification')].some(x=>!x.hidden));
        let empty=document.getElementById('studio-filter-empty');
        if(!shown&&items.length){if(!empty){empty=document.createElement('div');empty.id='studio-filter-empty';document.getElementById('studio-feed').append(empty);}empty.innerHTML=UI.empty('لا توجد نتائج','جرّب كلمة أخرى أو اختر الكل.');}else empty?.remove();
      };
      document.getElementById('push-search').oninput=e=>{query=e.target.value.trim().toLocaleLowerCase();filter();};
      document.querySelectorAll('[data-filter]').forEach(button=>button.onclick=()=>{activeKind=button.dataset.filter;document.querySelectorAll('[data-filter]').forEach(x=>x.setAttribute('aria-pressed',String(x===button)));filter();});
      filter();
      document.getElementById('push-refresh').onclick = () => paint().catch(e=>UI.toast(e.message,'err'));
      const prev=document.getElementById('push-prev'),next=document.getElementById('push-next');
      if(prev)prev.onclick = () => {offset=Math.max(0,offset-PAGE_SIZE); paint().then(()=>UI.scrollTo(0)).catch(e=>UI.toast(e.message,'err'));};
      if(next)next.onclick = () => {offset+=PAGE_SIZE; paint().then(()=>UI.scrollTo(0)).catch(e=>UI.toast(e.message,'err'));};
      // The whole card is the tap target; the explicit button stays for clarity.
      const open=id=>{const n=items.find(x=>x.id===id);if(!n)return;
        if(!destination(n)){return;}
        // Inbox items keep where they lead in details (push payloads carry it on top).
        const d=n.details||{};
        receive({...n,resource_type:d.resource_type||d.destination||'',resource_id:d.resource_id||'',action:d.action||'open',audience:'tenant'});};
      document.querySelectorAll('[data-open-booking]').forEach(button => button.onclick = e => {e.stopPropagation();open(button.dataset.openBooking);});
      wireToggles(document.getElementById('studio-feed')||document);
      document.querySelectorAll('[data-open-card]').forEach(card=>{
        if(!card.dataset.openCard)return;
        card.onclick=e=>{if(e.target.closest('summary,details,a,button,.sn-more'))return;open(card.dataset.openCard);};
        card.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open(card.dataset.openCard);}};
      });
      const ids=items.filter(n=>!n.is_read).map(n=>n.id);
      if(ids.length){
        await call('read_notifications',{...args,p_ids:ids});
        App.unread=Math.max(0,(feed.unread||0)-ids.length);repaintNavDot();
      } else {App.unread=feed.unread||0;repaintNavDot();}
    }
    await paint();
    // New alerts appear on their own while the inbox is open — without
    // interrupting a search in progress or jumping pages.
    Live.start(async()=>{
      if(offset!==0||document.activeElement?.id==='push-search')return;
      const feed=await call('inbox',{...args,p_offset:0});
      const next=JSON.stringify((feed.items||[]).slice(0,PAGE_SIZE).map(n=>[n.id,n.is_read]));
      if(next===signature)return;
      await paint(feed);
    },20000);
  }
  window.addEventListener('salonieer:native-resume',()=>{sync().catch(()=>{});window.NativeBridge?.syncTheme();});
  window.addEventListener('salonieer:push-token',()=>sync(true).catch(()=>{}));
  return {call,status,sync,unbind,unbindSalon,salonClient,reportScope,forgetOnDevice,receive,inbox,openPending,promptOnEntry,deviceState,enableOnDevice,disableOnDevice,openSettings,deviceOff,
    bellButton,refreshBell,openBell,paintBell,start(){ready=true;const opened=openPending();if(!opened)setTimeout(()=>promptOnEntry(),900);return opened;}};
})();
window.NotificationAdmin = (() => {
  const E = x=>UI.esc(x);
  const switchGroups = [
    {title:'إشعارات العميل',items:{customer_booking_created:'إنشاء حجز جديد',customer_booking_rescheduled:'تغيير موعد الحجز',customer_booking_pending:'إرجاع الحجز لانتظار التأكيد',customer_booking_confirmed:'تأكيد الحجز',customer_booking_completed:'إكمال الحجز',customer_booking_cancelled:'إلغاء الحجز',customer_booking_no_show:'تسجيل عدم الحضور',customer_booking_updated:'أي تحديث آخر للحجز',reminder:'تذكيرات ما قبل الموعد'}},
    {title:'إشعارات المختص',items:{barber_booking_created:'وصول حجز جديد',barber_booking_rescheduled:'تغيير موعد حجز',barber_booking_pending:'إرجاع حجز لانتظار التأكيد',barber_booking_confirmed:'تأكيد حجز',barber_booking_completed:'إكمال حجز',barber_booking_cancelled:'إلغاء حجز',barber_booking_no_show:'تسجيل عدم حضور',barber_booking_updated:'أي تحديث آخر للحجز',barber_booking_removed:'نقل الحجز إلى مختص آخر'}},
    {title:'إشعارات العمل',items:{owner_activity:'تغيير المختص لأوقات عمله',announcements:'رسائل العمل العامة'}},
    // 2.25 Business Suite events. Listed only when the server reports them.
    {title:'إشعارات الأعمال',business:true,items:{biz_deposit_required:'طلب عربون من العميل',biz_deposit_reminder:'تذكير قبل انتهاء مهلة العربون',biz_deposit_paid:'تأكيد استلام العربون',
      biz_deposit_expired:'انتهاء مهلة العربون',biz_deposit_status:'تغيير حالة العربون حسب السياسة',biz_deposit_refunded:'استرجاع العربون',biz_deposit_staff:'تنبيه المدير بعربون يجب إرجاعه',
      biz_payment_received:'إيصال الدفع للعميل',biz_payment_failed:'فشل الدفع الإلكتروني',biz_payment_link:'رابط الدفع الإلكتروني',biz_refund_issued:'استرجاع مبلغ من فاتورة',
      biz_waitlist_offer:'توفّر موعد لعميل في قائمة الانتظار',biz_low_stock:'تنبيه انخفاض المخزون',
      biz_attendance_in:'تسجيل حضور موظف',biz_attendance_early:'انصراف موظف مبكراً',biz_attendance_review:'انصراف تلقائي يحتاج مراجعة',biz_attendance_request:'طلب حضور بدون موقع'}},
    // 2.33: requests and the team. Listed only when the server reports them.
    {title:'الطلبات والفريق',business:true,items:{biz_package_request:'طلب شراء باقة',membership_request:'طلب انضمام عميل',membership_decided:'قرار طلب الانضمام للعميل',
      team_member:'دعوات الفريق وطلباته',booking_reassigned:'نقل موعد العميل إلى مختص آخر',biz_booking_followup:'حجز يحتاج تحديث الحالة',biz_booking_expired:'انتهاء حجز دون تحديث'}}
  ];
  const switchLabels=Object.assign({},...switchGroups.map(group=>group.items));
  // 2.41: an alert of a feature the salon's plan does not include is not offered.
  const EVENT_FEATURE=k=>/^biz_deposit_/.test(k)?'deposits':/^biz_(payment_failed|payment_link)$/.test(k)?'online_payments'
    :/^biz_(payment_received|refund_issued)$/.test(k)?'smart_checkout':k==='biz_waitlist_offer'?'smart_waitlist':k==='biz_low_stock'?'inventory'
    :/^biz_attendance_/.test(k)?'attendance':k==='biz_package_request'?'service_packages':null;
  const offered=k=>{const f=EVENT_FEATURE(k);return !f||!window.Features||Features.enabled(f);};
  const toggle = (id,label,on,disabled=false) => `<label class="notification-toggle"><span>${E(Lang.t(label))}</span><input type="checkbox" id="${E(id)}" ${on?'checked':''} ${disabled?'disabled':''}></label>`;
  async function salon(host, slug) {
    const args={p_slug:slug,p_token:App.token};
    const data=await Push.call('admin_config',args), s=data.settings;
    // Paid features are entitlements shown on the plan card / subscription page.
    data.catalog=(data.catalog||[]).filter(f=>!f.managed);
    const legacy={customer_booking_created:s.booking_created,customer_booking_rescheduled:s.rescheduled,customer_booking_pending:s.status_updates,customer_booking_confirmed:s.status_updates,customer_booking_completed:s.status_updates,customer_booking_cancelled:s.status_updates,customer_booking_no_show:s.status_updates,customer_booking_updated:s.status_updates,barber_booking_created:s.staff_bookings,barber_booking_rescheduled:s.staff_bookings,barber_booking_pending:s.staff_bookings,barber_booking_confirmed:s.staff_bookings,barber_booking_completed:s.staff_bookings,barber_booking_cancelled:s.staff_bookings,barber_booking_no_show:s.staff_bookings,barber_booking_updated:s.staff_bookings,barber_booking_removed:s.staff_bookings,owner_activity:s.owner_activity,announcements:s.announcements,reminder:s.reminders};
    const switches={...legacy,...(s.event_switches||{})};
    // Business switches exist only on a 2.25 server (it reports them).
    const hasBusiness=Object.keys(s.event_switches||{}).some(k=>k.startsWith('biz_'));
    const switchPanels=switchGroups.filter(group=>!group.business||hasBusiness).map(group=>({...group,items:Object.fromEntries(Object.entries(group.items).filter(([key])=>offered(key)))})).filter(group=>Object.keys(group.items).length).map(group=>`<section class="notification-switch-group"><h3>${E(group.title)}</h3>${Object.entries(group.items).map(([key,label])=>toggle('nc-event-'+key,label,switches[key]!==false)).join('')}</section>`).join('');
    host.innerHTML=`<div class="card"><h2>ميزات العمل</h2><p class="tiny">يتحكم مالك المنصة بالميزات المتاحة. تبقى البيانات محفوظة عند الإيقاف.</p>${(data.catalog||[]).map(f=>toggle('feature-'+f.key,f.label,data.features[f.key],true)).join('')}</div><form class="card notification-form" id="notification-config"><h2>الإشعارات والتذكيرات</h2><p class="tiny">حالة الإرسال العام: ${data.runtime.enabled?'مفعّل':'متوقف'}. الإيقاف العام أو إيقاف ميزة الإشعارات يتجاوز إعدادات العمل.</p>${toggle('nc-enabled','تفعيل الإشعارات لهذا العمل',s.enabled)}${switchPanels}<label>التأخير بعد تحديث الحجز (دقائق، 0 للإرسال في دورة العمل التالية)<input class="input" type="number" id="nc-delay" min="0" max="60" required value="${s.event_delay_minutes}"></label><label>التذكيرات قبل الموعد بالدقائق (من 1 إلى 5، مفصولة بفاصلة)<input class="input" id="nc-reminders" dir="ltr" required value="${E(s.reminder_minutes.join(', '))}"></label><p class="tiny">مثال: 1440, 60 = قبل يوم وقبل ساعة. كل قيمة بين 5 و10080 دقيقة.</p><label>المنطقة الزمنية<input class="input" id="nc-timezone" dir="ltr" required value="${E(s.timezone)}" list="push-timezones"></label><datalist id="push-timezones"><option>Asia/Hebron</option><option>Asia/Jerusalem</option><option>Asia/Riyadh</option><option>Asia/Dubai</option><option>UTC</option></datalist><div class="notification-columns"><label>بداية الهدوء<input class="input" type="time" id="nc-quiet-start" value="${E((s.quiet_start||'').slice(0,5))}"></label><label>نهاية الهدوء<input class="input" type="time" id="nc-quiet-end" value="${E((s.quiet_end||'').slice(0,5))}"></label></div><p class="tiny">اترك وقتي الهدوء فارغين لإلغائه. يتأجل الإرسال حتى نهاية الهدوء؛ لا يصل تذكير بعد بدء الموعد.</p><button class="btn" type="submit">حفظ الإعدادات</button><p class="form-error" id="nc-error" role="status"></p></form>`;
    const showError=e=>{document.getElementById('nc-error').textContent=e.message;};
    document.getElementById('notification-config').onsubmit=async e=>{
      e.preventDefault();const button=e.target.querySelector('button[type=submit]');button.disabled=true;
      try{
        const p_data={enabled:document.getElementById('nc-enabled').checked,event_switches:{}};Object.keys(switchLabels).forEach(k=>{const box=document.getElementById('nc-event-'+k);if(box)p_data.event_switches[k]=box.checked;});
        const raw=document.getElementById('nc-reminders').value.split(/[,،]/).map(x=>x.trim());
        if(raw.length<1||raw.length>5||raw.some(x=>!/^\d+$/.test(x)||+x<5||+x>10080))throw new Error('اختر من 1 إلى 5 تذكيرات بين 5 و10080 دقيقة');
        p_data.reminder_minutes=[...new Set(raw.map(Number))];p_data.event_delay_minutes=+document.getElementById('nc-delay').value;p_data.timezone=document.getElementById('nc-timezone').value.trim();
        p_data.quiet_start=document.getElementById('nc-quiet-start').value||null;p_data.quiet_end=document.getElementById('nc-quiet-end').value||null;
        if(!!p_data.quiet_start!==!!p_data.quiet_end)throw new Error('حدد بداية ونهاية الهدوء معاً');
        await Push.call('save_notification_settings',{...args,p_data});UI.toast('تم حفظ الإعدادات وإعادة جدولة التذكيرات','ok');document.getElementById('nc-error').textContent='';
      }catch(e){showError(e);}finally{button.disabled=false;}
    };
  }
  return {salon};
})();
