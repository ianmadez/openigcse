/*
 * OpenIGCSE service worker.
 * Step 5.3: shows pushes and opens the right screen on tap.
 * Step 7.3: caches the app shell and today's plan so /today opens offline. Writes are not
 * replayed here: /today's offline queue lives in the page (src/lib/offline/queue.ts), because
 * its writes are server actions that need the page's session.
 */

const VERSION = "v1";
const STATIC = `openigcse-static-${VERSION}`;
const PAGES = `openigcse-pages-${VERSION}`;

// Pages kept for offline use. Everything else is network only.
const OFFLINE_PAGES = ["/", "/today"];
const SIGNED_OUT = ["/login", "/pair"];

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith("openigcse-") && key !== STATIC && key !== PAGES).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

const isStatic = (url) =>
  url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/") || /\.(?:woff2?|png|svg|ico)$/.test(url.pathname);

const offlinePage = () =>
  new Response(
    `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Offline - OpenIGCSE</title><style>body{font:16px/1.5 system-ui,sans-serif;margin:0;min-height:100dvh;display:grid;place-items:center;background:#faf7f0;color:#1f2328;padding:16px}
@media (prefers-color-scheme:dark){body{background:#12161a;color:#e8eaed}}a{color:inherit}</style></head>
<body><main><h1 style="font-size:1.25rem">You are offline</h1><p>This page has not been saved on this device.
<a href="/today">Today's plan</a> opens offline once it has been visited with a connection.</p></main></body></html>`,
    { status: 503, headers: { "content-type": "text/html; charset=utf-8" } },
  );

// `next dev` serves unhashed chunks as no-store; caching them would pin stale code.
const storable = (response) => response.ok && !/no-store/i.test(response.headers.get("cache-control") || "");

async function cacheFirst(request) {
  const cache = await caches.open(STATIC);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (storable(response)) cache.put(request, response.clone());
  return response;
}

async function navigate(request, url) {
  const keep = OFFLINE_PAGES.includes(url.pathname);
  try {
    const response = await fetch(request);
    const landed = new URL(response.url || url.href);
    if (SIGNED_OUT.includes(landed.pathname)) {
      // Signed out (or a revoked device): drop the saved plan so it cannot be read offline.
      await caches.delete(PAGES);
    } else if (keep && response.ok && !response.redirected) {
      const cache = await caches.open(PAGES);
      await cache.put(url.pathname, response.clone());
    }
    return response;
  } catch {
    const cache = await caches.open(PAGES);
    return (await cache.match(url.pathname)) || (await cache.match("/today")) || offlinePage();
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === "navigate") {
    event.respondWith(navigate(request, url));
  } else if (isStatic(url)) {
    event.respondWith(cacheFirst(request));
  }
});

// The page sends the scripts and styles it loaded before this worker took control, so the first
// visit is enough for /today to open offline.
self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "warm" && Array.isArray(data.assets)) {
    event.waitUntil(
      (async () => {
        const cache = await caches.open(STATIC);
        for (const href of data.assets.slice(0, 200)) {
          const url = new URL(href, self.location.origin);
          if (url.origin !== self.location.origin || !isStatic(url) || (await cache.match(url.href))) continue;
          try {
            const response = await fetch(url.href);
            if (storable(response)) await cache.put(url.href, response);
          } catch {
            /* offline while warming; the next visit tries again */
          }
        }
        if (typeof data.page === "string" && OFFLINE_PAGES.includes(data.page)) {
          try {
            const response = await fetch(data.page, { credentials: "same-origin" });
            if (response.ok && !response.redirected) await (await caches.open(PAGES)).put(data.page, response);
          } catch {
            /* ignore */
          }
        }
      })(),
    );
  }
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "OpenIGCSE", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "OpenIGCSE";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      tag: data.tag,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: data.url || "/" },
      renotify: Boolean(data.tag),
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        if (client.url.startsWith(self.location.origin) && "focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
