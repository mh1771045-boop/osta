// Osta's service worker: the app shell works offline, Puter's script and the fonts
// are cached as they load, and a new version waits until the user taps «حدّث».
const VERSION = "osta-web-1.0.0";
const RUNTIME = "osta-web-runtime";
const SHELL = [
  "./",
  "index.html",
  "app.js",
  "manifest.webmanifest",
  "icons/icon.svg",
  "icons/icon-32.png",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-maskable-512.png",
  "icons/apple-touch-icon.png",
];
const RUNTIME_HOSTS = new Set(["js.puter.com", "fonts.googleapis.com", "fonts.gstatic.com"]);

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(SHELL)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key !== VERSION && key !== RUNTIME) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    if (req.mode === "navigate") {
      event.respondWith(caches.match("index.html").then((hit) => hit || fetch(req)));
      return;
    }
    event.respondWith(caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req)));
    return;
  }

  if (RUNTIME_HOSTS.has(url.hostname)) {
    // Stale while revalidate: answer from the cache, refresh it in the background.
    event.respondWith((async () => {
      const cache = await caches.open(RUNTIME);
      const hit = await cache.match(req);
      const refresh = (init) => fetch(req, init).then((res) => {
        if (res && (res.ok || res.type === "opaque")) cache.put(req, res.clone());
        return res;
      }).catch(() => null);
      if (hit) {
        // A hanging refresh would keep a waiting update from activating, so cap it.
        event.waitUntil(refresh({ signal: AbortSignal.timeout(10000) }));
        return hit;
      }
      return (await refresh()) || Response.error();
    })());
  }
  // Everything else (Puter's API) goes straight to the network.
});
