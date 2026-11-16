/*
  Service worker: makes the home-screen app open fast and work with a weak gym signal.
  - Pages: network first, fall back to the last cached copy (or the home page) when offline.
  - Built assets, fonts, icons, exercise images: cache first.
  - Supabase and other cross-origin API calls are never cached here; workout logging
    goes through IndexedDB in the app (Phase 1) and syncs when back online.
  Bump VERSION to force every phone to drop old caches.
*/
const VERSION = "v1";
const PAGES = `pages-${VERSION}`;
const ASSETS = `assets-${VERSION}`;
const IMAGES = `images-${VERSION}`;
const PRECACHE = ["/", "/manifest.webmanifest", "/icons/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(PAGES)
      .then((cache) => cache.addAll(PRECACHE))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => ![PAGES, ASSETS, IMAGES].includes(k))
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

function isExerciseImage(url) {
  return (
    url.pathname.includes("/exercise-images/") ||
    url.hostname === "raw.githubusercontent.com"
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  // Exercise pictures (Supabase Storage or the source dataset): cache first.
  if (request.destination === "image" && isExerciseImage(url)) {
    event.respondWith(cacheFirst(request, IMAGES));
    return;
  }

  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/auth/") || url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirstPage(request));
    return;
  }

  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    /\.(woff2?|png|jpg|svg|ico)$/.test(url.pathname)
  ) {
    event.respondWith(cacheFirst(request, ASSETS));
  }
});

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok || res.type === "opaque") cache.put(request, res.clone());
  return res;
}

async function networkFirstPage(request) {
  const cache = await caches.open(PAGES);
  try {
    const res = await fetch(request);
    // Don't cache redirects (e.g. to /login) as if they were the page.
    if (res.ok && !res.redirected) cache.put(request, res.clone());
    return res;
  } catch {
    return (
      (await cache.match(request)) ||
      (await cache.match("/")) ||
      new Response("You're offline.", { status: 503, headers: { "Content-Type": "text/plain" } })
    );
  }
}
