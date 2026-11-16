/*
  Service worker: makes the home-screen app open fast and work with no signal.
  - Every screen (and the code it needs) is saved ahead of time, so even screens you haven't opened work offline.
    The app asks for a refresh ("warm") each time it opens online, so the saved copies follow new deploys.
  - Pages: network first, fall back to the saved copy when offline.
  - Built assets, fonts, icons, exercise images: cache first.
  - Supabase calls are never cached here; workout data lives in the app's own offline database and syncs.
  Bump VERSION to force every phone to drop old caches.
*/
const VERSION = "v3";
const PAGES = `pages-${VERSION}`;
const ASSETS = `assets-${VERSION}`;
const IMAGES = `images-${VERSION}`;
const ROUTES = [
  "/", "/login", "/welcome", "/workout", "/cardio", "/plan", "/recovery", "/progress", "/progress/session",
  "/more", "/more/profile", "/more/gyms", "/more/gyms/edit", "/more/library", "/more/library/exercise", "/more/library/new",
];

async function warm() {
  const pages = await caches.open(PAGES);
  const assets = await caches.open(ASSETS);
  const found = new Set(["/manifest.webmanifest", "/icons/icon-192.png", "/icons/apple-touch-icon.png"]);
  await Promise.all(
    ROUTES.map(async (path) => {
      try {
        const res = await fetch(path, { credentials: "same-origin", cache: "no-store" });
        // Signed-out visits redirect to /login; only keep real pages.
        if (!res.ok || res.redirected) return;
        const html = await res.clone().text();
        await pages.put(path, res);
        for (const m of html.matchAll(/["'(](\/_next\/static\/[^"'()\s]+)/g)) found.add(m[1].replace(/\\u0026/g, "&"));
      } catch {
        /* offline: keep what we have */
      }
    }),
  );
  await Promise.all(
    [...found].map(async (url) => {
      if (await assets.match(url)) return;
      try {
        const res = await fetch(url);
        if (res.ok) await assets.put(url, res);
      } catch {
        /* ignore */
      }
    }),
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(warm().catch(() => undefined).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => ![PAGES, ASSETS, IMAGES].includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "warm") event.waitUntil(warm().catch(() => undefined));
});

function isExerciseImage(url) {
  return url.pathname.includes("/exercise-images/") || url.hostname === "raw.githubusercontent.com";
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  if (request.destination === "image" && isExerciseImage(url)) {
    event.respondWith(cacheFirst(request, IMAGES));
    return;
  }
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirstPage(request, url));
    return;
  }
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/") || /\.(woff2?|png|jpg|svg|ico|webmanifest)$/.test(url.pathname)) {
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

async function networkFirstPage(request, url) {
  const cache = await caches.open(PAGES);
  try {
    const res = await fetch(request);
    if (res.ok && !res.redirected) cache.put(url.pathname, res.clone());
    return res;
  } catch {
    // Pages are the same for every visitor and read their data on the phone, so the query string doesn't matter.
    return (
      (await cache.match(url.pathname)) ||
      (await cache.match("/")) ||
      new Response("You're offline and this screen isn't saved yet.", { status: 503, headers: { "Content-Type": "text/plain" } })
    );
  }
}
