// sw.js — service worker for Salonieer
// Strategy:
//   • Navigations  → cached shell first, refreshed in the background. A slow
//     or flaky connection can no longer hold the whole app on a blank screen.
//   • App shell (html/js/css/icons/fonts) → stale-while-revalidate
//   • Supabase / any non-GET → network only (live data stays live)
// Bump VERSION on every deploy so installed apps pick up new files.

const VERSION = "salonieer-v2.48.0-cobalt";

// What the first screen cannot render without. Everything else is cached the
// first time it is actually requested, so installing the app no longer
// competes with painting it.
const CRITICAL = [
  "./",
  "./index.html",
  "./styles.css",
  "./platform.css",
  "./luxury.css",
  "./control.css",
  "./refinement.css",
  "./notifications.css",
  "./studio.css",
  "./elevate.css",
  "./premium.css",
  "./admin-studio.css",
  "./unified-studio.css",
  "./mobile-compat.css",
  "./app-review.css",
  "./polish.css",
  "./clay.css",
  "./business.css",
  "./rework.css",
  "./accounts.css",
  "./brand.css",
  "./schedule.css",
  "./palette.css",
  "./members.css",
  "./ops.css",
  "./meton.css",
  "./lang-catalog.js",
  "./lang.js",
  "./money.js",
  "./theme.js",
  "./native.js",
  "./transport.js",
  "./supabase.js",
  "./platform.js",
  "./smart.js",
  "./schedule-editor.js",
  "./pwa.js",
  "./photos.js",
  "./staff.js",
  "./bookings.js",
  "./schedule.js",
  "./plans.js",
  "./members.js",
  "./auth.js",
  "./vendor/libphonenumber-min.js",
  "./vendor/phone-examples.js",
  "./account.js",
  "./settings.js",
  "./booking.js",
  "./business.js",
  "./workforce.js",
  "./notifications.js",
  "./reservation.js",
  "./report.js",
  "./rework.js",
  "./loyalty.js",
  "./admin.js",
  "./shortcuts.js",
  "./motion.js",
  "./app.js",
  "./fonts/inter.css",
  "./fonts/noto-sans-arabic.css",
  "./fonts/noto-sans-arabic-arabic-wght-normal.woff2",
  "./fonts/inter-latin-wght-normal.woff2",
  "./assets/brand/salonieer-symbol-on-light.svg",
  "./assets/brand/salonieer-symbol-on-dark.svg",
  "./assets/brand/salonieer-horizontal-on-light.svg",
  "./assets/brand/salonieer-horizontal-on-dark.svg",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/apple-touch-icon.png",
  "./icons/favicon-32.png",
  "./icons/favicon.svg",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(VERSION)
      // addAll fails the whole install if a single file 404s — add them one by one
      .then((c) => Promise.all(CRITICAL.map((u) => c.add(u).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function revalidate(cache, req) {
  return fetch(req)
    .then((res) => {
      if (res && (res.ok || res.type === "opaque")) cache.put(req, res.clone());
      return res;
    })
    .catch(() => null);
}

function staleWhileRevalidate(req) {
  return caches.open(VERSION).then((cache) =>
    // Shell assets are requested with a ?v= cache-buster the precache list does
    // not carry, so fall back to a search-insensitive match. VERSION is bumped
    // alongside those markers, so a stale file can never outlive a deploy.
    cache.match(req)
      .then((hit) => hit || cache.match(req, { ignoreSearch: true }))
      .then((cached) => {
        const network = revalidate(cache, req);
        return cached || network.then((res) => res || Response.error());
      })
  );
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);

  if (req.method !== "GET" || url.hostname.endsWith("supabase.co")) return;

  if (req.mode === "navigate") {
    // The shell is served from cache immediately; the newer copy replaces it
    // for the next launch. pwa.js tells the person when that happens.
    e.respondWith(
      caches.open(VERSION).then((cache) =>
        cache.match("./index.html").then((cached) => {
          const network = fetch(req)
            .then((res) => { if (res && res.ok) cache.put("./index.html", res.clone()); return res; })
            .catch(() => cached);
          return cached || network;
        })
      )
    );
    return;
  }

  e.respondWith(staleWhileRevalidate(req));
});
