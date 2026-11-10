// supabase.js
// ---------------------------------------------------------------------
//  1) Supabase project → Settings → API → copy the Project URL and the
//     "anon public" key, and paste them below.
//  2) The multi-salon launcher resolves the active salon from the registry.
//     No real salon and no demo tenant is hard-coded here.
//
//  One Supabase project can host any number of barbershops. Either deploy
//  a copy of this folder per shop with a different SHOP value, or deploy
//  once and let the URL pick the shop:
//       https://your-site.com/?shop=barber2
//       https://barber2.your-site.com/        (subdomain = slug)
//
//  The anon key is safe in the browser: every table has RLS enabled with
//  no policies, so it can only call the API functions below, and each of
//  those filters by shop.
// ---------------------------------------------------------------------
window.CONFIG = {
  SUPABASE_URL: "https://jauiffbyaibpdtuhgqei.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_KhD0mHc3jdbUHdp4Xdc5GA_mVkSEHJc",

  SHOP: "",                   // selected by Platform.ensureSalon()
  ALLOW_SHOP_FROM_URL: false,   // let ?shop=… or a subdomain override it

  // Never invent a tenant prefix here. The registry descriptor supplies it.
  RPC_PREFIX: "",
};

// ---------------------------------------------------------------------
//  Which barbershop is this?
// ---------------------------------------------------------------------
window.Shop = (function () {
  const KEY = "aj_shop";
  const clean = (s) => String(s || "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");

  function resolve() {
    const c = window.CONFIG;
    if (c.ALLOW_SHOP_FROM_URL) {
      try {
        const q = clean(new URLSearchParams(location.search).get("shop"));
        if (q) { localStorage.setItem(KEY, q); return q; }
        const host = location.hostname.split(".");
        if (host.length > 2 && !["www", "app", "localhost"].includes(host[0])) {
          const sub = clean(host[0]);
          if (sub) return sub;
        }
        const saved = clean(localStorage.getItem(KEY));
        if (saved) return saved;
      } catch {}
    }
    return clean(c.SHOP);
  }

  let current = resolve();
  return {
    slug: () => current,
    set(v) {
      current = clean(v) || current;
      try { localStorage.setItem(KEY, current); } catch {}
      return current;
    },
    // the session token is stored per shop, so two shops can be open in
    // the same browser without logging each other out
    tokenKey: () => "aj_token:" + current,
  };
})();

(function () {
  const c = window.CONFIG;
  if (!c.SUPABASE_URL || c.SUPABASE_URL.includes("YOUR-PROJECT")) {
    console.warn("⚠️ Edit supabase.js with your Supabase URL and anon key.");
  }
  // Platform administration uses Supabase Auth through the same small local
  // transport; salon customers keep the original tenant-session RPC auth.
  // platformSb always points to the central registry project. sb points to the
  // currently selected salon and may be the same project or a completely
  // separate Supabase project.
  const make = (url, key) => window.supabase.createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  window.platformSb = make(c.SUPABASE_URL, c.SUPABASE_ANON_KEY);
  window.sb = window.platformSb;
  // Re-selecting the salon that is already open (refreshed branding, a second
  // press on the same card) must not throw away everything this device has
  // read. Only an actual change of tenant clears the read cache.
  // Remembered across reloads too: the first selection after a reload is the
  // same tenant the restored cache belongs to, and clearing it there would
  // throw away exactly the reads that make reopening a salon instant.
  const TENANT_KEY = "salonieer:tenant:v1";
  let tenantKey = (() => { try { return sessionStorage.getItem(TENANT_KEY) || ""; } catch { return ""; } })();
  window.setTenantSupabase = function setTenantSupabase(salon) {
    const url = String(salon && salon.supabase_url || "").trim();
    const key = String(salon && salon.supabase_anon_key || "").trim();
    const next = [String(salon && salon.slug || ""), url, key].join("|");
    const changed = next !== tenantKey;
    tenantKey = next;
    try { sessionStorage.setItem(TENANT_KEY, next); } catch {}
    if (changed || !window.sb) window.sb = (url && key) ? make(url, key) : window.platformSb;
    if (changed && window.rpcCacheBust) window.rpcCacheBust();
    return window.sb;
  };
})();

// ---------------------------------------------------------------------
//  RPC wrapper
//  • the shop slug is added to EVERY call — it selects which shop's
//    private tables the function reads (see database.sql → _use_shop)
//  • read-only calls retry once on a dropped connection
//  • mutations never retry (a retried create_booking could double-book)
// ---------------------------------------------------------------------
const READ_FNS = /^(get_|list_|my_|slot_counts|barber_day_bookings|barber_self|barber_bookings|barber_services_list|admin_list|admin_stats|admin_analytics|admin_barber_service_ids|auth_me|auth_check_phone|loyalty_wallet|loyalty_history|admin_loyalty_overview|admin_loyalty_customers|admin_loyalty_ledger|admin_loyalty_redemptions|admin_loyalty_purchases|loyalty_booking_offer|loyalty_booking_marks)/;

function activeRpcPrefix() {
  const tenant = window.Platform && typeof Platform.current === "function" ? Platform.current() : null;
  if (tenant && tenant.rpc_prefix != null) return String(tenant.rpc_prefix);
  return window.CONFIG && window.CONFIG.RPC_PREFIX ? String(window.CONFIG.RPC_PREFIX) : "";
}

function withShop(fn, args) {
  const a = args ? { ...args } : {};
  // Every generated salon API is hard-wired to its own shop_<slug> schema.
  // A future generic tenant API can use an empty prefix and receive p_shop.
  // The prefix is the one rawRpc calls: the salon Salonieer Admin is managing,
  // else the salon selected on this device. (A device with no salon selected
  // sent p_shop to the managed salon, which its functions do not accept.)
  const context = window.Control && Control.target();
  if (context ? context.rpc_prefix : activeRpcPrefix()) return a;
  if (a.p_shop === undefined) a.p_shop = context ? context.slug : Shop.slug();
  return a;
}

async function rawRpc(fn, args) {
  const context = window.Control && Control.target();
  const versions = {list_barbers:"list_barbers_v2",get_barber:"get_barber_v2",barber_self:"barber_self_v2",admin_save_barber:"admin_save_barber_v2"};
  fn = versions[fn] || fn;
  const realFn = (context ? context.rpc_prefix : activeRpcPrefix()) + fn;
  const client = context ? Control.client() : window.sb;
  const { data, error } = await client.rpc(realFn, args);
  if (error) {
    // The server is the authority on entitlements. A "feature disabled"
    // answer means this device's copy is stale: drop it and re-check, which
    // re-evaluates the current page if anything actually changed.
    if (/الميزة غير مفعلة/.test(error.message || "") && window.Features) { Features.invalidate(); Features.refresh(); }
    const failure = new Error(Lang.error(error.message || "خطأ في الاتصال بالخادم"));
    failure.rawMessage = error.message || "";
    failure.code = error.code;
    throw failure;
  }
  if (data && typeof data === "object" && !Array.isArray(data) && data.error) {
    const failure = new Error(Lang.error(data.error));
    failure.rawMessage = data.error;
    throw failure;
  }
  return data;
}

// Reads that are not cached and must never invalidate anything.
// 2.32: every read the app makes is listed here or in READ_FNS. A read that
// was missing counted as a write: it threw away the whole read cache (so the
// next screen loaded from scratch) and, right after a tap, put the full-screen
// loading cover over the app — the "loading on every click".
const PURE_READS = /^(free_times|slot_board|admin_staff_title_options|admin_analytics_history|barber_bookings_range|get_staff_vocabulary|biz_context|biz_list_[a-z_]+|biz_prepare_checkout|biz_quote_checkout|biz_get_[a-z_]+|admin_biz_list_[a-z_]+|admin_biz_report_[a-z_]+|admin_biz_get_[a-z_]+|barber_biz_report_[a-z_]+|att_status|admin_att_settings|admin_att_board|admin_att_list_shifts|admin_emp_report|admin_emp_detail|biz_barcode_lookup|biz_product_by_code|admin_team_schedule|admin_rating_summary|admin_stats_performance|rating_prompt|platform_lookup_salon|platform_lookup_demo_salon|salonieer_discover_v1|salonieer_faq_v1|salonieer_app_release_v1|team_me|team_my_time_requests|admin_team_list|admin_requests|admin_requests_count|admin_audit_list|admin_members_pending|admin_team_future_bookings|admin_team_reassign_options|admin_team_time_off|admin_setup_state|admin_salon_link|staff_find_customer|admin_biz_cash_state|admin_biz_cash_history|admin_biz_cash_report|admin_biz_preview_correction|admin_biz_receipt_history|barber_rating|rating_seen)$/;
// Sign-in steps change who is asking, not the salon's data; their own flows
// bust what they need.
const SESSION_CALLS = /^(auth_login|auth_register|auth_set_password|auth_logout|auth_check_phone|auth_change_password)$/;
function isWrite(fn) { return !READ_FNS.test(fn) && !PURE_READS.test(fn) && !SESSION_CALLS.test(fn); }
// The same question for a name as it goes over the wire (the tenant prefix
// already added, or a platform-wide salonieer_* function), used by the tap
// guard: only work that changes something may cover the screen.
const PLATFORM_READS = /^salonieer_(inbox|features|discover|faq|app_release|account_me|notification_stats|admin_config|plan_usage|status|lookup|team_invite_peek)[a-z0-9_]*$/;
window.rpcIsWrite = function rpcIsWrite(wireName) {
  const name = String(wireName || "");
  if (PLATFORM_READS.test(name)) return false;
  if (/^salonieer_/.test(name)) return true;
  const context = window.Control && Control.target();
  const prefix = context ? context.rpc_prefix || "" : activeRpcPrefix();
  const fn = prefix && name.startsWith(prefix) ? name.slice(prefix.length) : name;
  const versions = { list_barbers_v2: "list_barbers", get_barber_v2: "get_barber", barber_self_v2: "barber_self" };
  return isWrite(versions[fn] || fn);
};

window.rpc = async function rpc(fn, args = {}) {
  const payload = withShop(fn, args);
  try {
    const result = await rawRpc(fn, payload);
    // Any successful write makes every cached read suspect: a new booking
    // must be on "My bookings" the moment the confirmation screen links
    // there, a cancelled one must leave the home card, a saved schedule must
    // change the free times. Writes are rare, so the whole read cache (and
    // any read already in flight) is dropped rather than guessed at.
    if (isWrite(fn)) {
      window.rpcCacheBust?.();
      try { document.dispatchEvent(new CustomEvent("salonieer:data-changed", { detail: { fn } })); } catch {}
    }
    return result;
  } catch (e) {
    const netFail = /failed to fetch|network|load failed/i.test(e.rawMessage || e.message || "");
    if (netFail && READ_FNS.test(fn)) {
      await new Promise((r) => setTimeout(r, 700));
      return rawRpc(fn, payload);
    }
    if (netFail) throw new Error(Lang.t("تعذّر الاتصال — تحقق من الإنترنت وحاول مجدداً"));
    throw e;
  }
};

// ---------------------------------------------------------------------
//  Read cache — stale-while-revalidate
//  A page should never wait on the network for something this device already
//  has. Reads are kept in memory and mirrored into sessionStorage so the
//  first paint after a cold start is instant too.
//    rpcCached  — resolves from cache while fresh, otherwise fetches
//    rpcPeek    — synchronous: whatever is cached right now, or null
//    rpcStale   — { value, refresh } so a page can paint cache first and
//                 update itself when the newer answer lands
//  In-flight requests are de-duplicated, so two components asking for the
//  same thing in the same tick cost one request.
// ---------------------------------------------------------------------
const CACHE_TTL = 60000;          // considered fresh
const CACHE_MAX_AGE = 30 * 60000; // still worth showing while revalidating
const _cache = new Map();
const _inflight = new Map();
// Bumped by every cache bust. A read that left before a write finished must
// not store its (now stale) answer after the bust.
let _generation = 0;
const STORE_KEY = "salonieer:reads:v1";
let _storeTimer = null;

function scopeKey() {
  return (window.Control?.target()?.slug || (window.Shop && Shop.slug()) || "") + "";
}
function cacheKey(fn, payload) {
  return fn + ":" + scopeKey() + ":" + JSON.stringify(payload);
}

// Restoring the last session's reads makes a reopened app paint from cache
// instead of from a spinner. Only this device ever sees it.
(function restoreCache() {
  try {
    const raw = JSON.parse(sessionStorage.getItem(STORE_KEY) || "null");
    if (!raw || typeof raw !== "object") return;
    const now = Date.now();
    for (const [k, entry] of Object.entries(raw)) {
      if (entry && typeof entry.t === "number" && now - entry.t < CACHE_MAX_AGE) _cache.set(k, entry);
    }
  } catch {}
})();

function persistCache() {
  if (_storeTimer) return;
  _storeTimer = setTimeout(() => {
    _storeTimer = null;
    try {
      const out = {};
      const now = Date.now();
      // Newest first, and only what still has a useful life left — the store
      // is a warm start, not an archive.
      const rows = [..._cache.entries()].filter(([, e]) => now - e.t < CACHE_MAX_AGE).sort((a, b) => b[1].t - a[1].t).slice(0, 60);
      for (const [k, e] of rows) out[k] = e;
      const json = JSON.stringify(out);
      if (json.length < 600000) sessionStorage.setItem(STORE_KEY, json);
    } catch {}
  }, 400);
}

function store(key, value) {
  _cache.set(key, { t: Date.now(), v: value });
  persistCache();
  return value;
}

function fetchInto(fn, payload, key) {
  if (_inflight.has(key)) return _inflight.get(key);
  const generation = _generation;
  const p = window.rpc(fn, payload)
    .then((v) => {
      if (_inflight.get(key) === p) _inflight.delete(key);
      return generation === _generation ? store(key, v) : v;
    })
    .catch((e) => { if (_inflight.get(key) === p) _inflight.delete(key); throw e; });
  _inflight.set(key, p);
  return p;
}

window.rpcCached = function rpcCached(fn, args = {}, ttlMs = CACHE_TTL) {
  const payload = withShop(fn, args);
  const key = cacheKey(fn, payload);
  const hit = _cache.get(key);
  if (hit && Date.now() - hit.t < ttlMs) return Promise.resolve(hit.v);
  return fetchInto(fn, payload, key);
};

// Whatever this device already knows, with no network and no promise.
window.rpcPeek = function rpcPeek(fn, args = {}, maxAge = CACHE_MAX_AGE) {
  const payload = withShop(fn, args);
  const hit = _cache.get(cacheKey(fn, payload));
  return hit && Date.now() - hit.t < maxAge ? hit.v : null;
};

// Paint what we have, refresh underneath. `refresh` resolves with the newer
// value (or rejects) — a page decides whether the change is worth redrawing.
window.rpcStale = function rpcStale(fn, args = {}, ttlMs = CACHE_TTL) {
  const payload = withShop(fn, args);
  const key = cacheKey(fn, payload);
  const hit = _cache.get(key);
  const fresh = hit && Date.now() - hit.t < ttlMs;
  return {
    value: hit && Date.now() - hit.t < CACHE_MAX_AGE ? hit.v : null,
    // Refreshing what is already on screen happens in the background.
    refresh: fresh ? Promise.resolve(hit.v) : hit && Date.now() - hit.t < CACHE_MAX_AGE && window.TapGuard ? TapGuard.quiet(() => fetchInto(fn, payload, key)) : fetchInto(fn, payload, key),
  };
};

// Warm the cache without anyone waiting on it. Used to prefetch the next
// screen while the person is still looking at this one.
window.rpcPrefetch = function rpcPrefetch(fn, args = {}, ttlMs = CACHE_TTL) {
  try { (window.TapGuard ? TapGuard.quiet(() => rpcCached(fn, args, ttlMs)) : rpcCached(fn, args, ttlMs)).catch(() => {}); } catch {}
};

// Drops every cached read of one salon (keys are "fn:slug:payload").
window.rpcCacheBustSalon = function (slug) {
  if (!slug) return;
  _generation++;
  const mine = k => k.split(":")[1] === slug;
  for (const k of _cache.keys()) if (mine(k)) _cache.delete(k);
  for (const k of _inflight.keys()) if (mine(k)) _inflight.delete(k);
  persistCache();
};
window.rpcCacheBust = function (prefix) {
  _generation++;
  for (const k of _cache.keys()) if (!prefix || k.startsWith(prefix)) _cache.delete(k);
  for (const k of _inflight.keys()) if (!prefix || k.startsWith(prefix)) _inflight.delete(k);
  persistCache();
};
