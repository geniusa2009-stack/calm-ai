/*
 * Calm service worker — deliberately conservative.
 *  - Caches ONLY content-hashed build assets (/_next/static/*), icons and the static offline page.
 *  - NEVER caches HTML pages or API responses, so no personal data is ever stored on the device,
 *    authentication always goes to the server, and new deployments are picked up immediately.
 *  - Navigations are network-first; only when the network fails is /offline.html shown.
 *  - Push notifications: shows the generic, lock-screen-safe text the server sends.
 */
const VERSION = "calm-sw-v1";
const STATIC_CACHE = `${VERSION}-static`;
const PRECACHE = ["/offline.html", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((c) => c.addAll(PRECACHE)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (!key.startsWith(VERSION)) await caches.delete(key);
    await self.clients.claim();
  })());
});

// The page asks before switching to a new worker, so an update never interrupts a session.
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(async () => (await caches.match("/offline.html")) || Response.error()));
    return;
  }
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith((async () => {
      const cached = await caches.match(req);
      if (cached) return cached;
      const res = await fetch(req);
      if (res.ok) (await caches.open(STATIC_CACHE)).put(req, res.clone());
      return res;
    })());
  }
  // Everything else (API, pages' data, exports) goes straight to the network, uncached.
});

// ---------- push ----------
self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = {}; }
  // Only generic text is ever sent; fall back to a neutral message if the payload is missing.
  const title = typeof data.title === "string" ? data.title.slice(0, 60) : "Calm";
  const body = typeof data.body === "string" ? data.body.slice(0, 160) : "Open Calm when it suits you.";
  const tag = typeof data.tag === "string" ? data.tag.slice(0, 64) : "calm";
  event.waitUntil(self.registration.showNotification(title, { body, tag, icon: "/icons/icon-192.png", badge: "/icons/icon-192.png", data: { url: "/" } }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of all) if ("focus" in c) return c.focus();
    return self.clients.openWindow("/");
  })());
});

// The browser may rotate or expire a subscription; re-subscribe with the same server key
// and tell the server. Uses the session cookie; fails harmlessly if signed out.
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil((async () => {
    const key = event.oldSubscription && event.oldSubscription.options && event.oldSubscription.options.applicationServerKey;
    if (!key) return;
    const sub = await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
    await fetch("/api/push/subscribe", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ subscription: sub.toJSON() }) });
  })().catch(() => {}));
});
