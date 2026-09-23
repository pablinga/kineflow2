const CACHE_NAME = "kineflow-pwa-shell-v1";
const APP_SHELL_ASSETS = [
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-maskable-512.png",
  "/favicon.svg",
  "/kineflow-icon.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) =>
        Promise.allSettled(
          APP_SHELL_ASSETS.map((asset) => cache.add(asset).catch(() => null)),
        ),
      )
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter((cacheName) => cacheName !== CACHE_NAME)
            .map((cacheName) => caches.delete(cacheName)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);

  if (url.origin !== self.location.origin) {
    return;
  }

  if (!APP_SHELL_ASSETS.includes(url.pathname)) {
    return;
  }

  event.respondWith(
    caches.match(request).then((cachedResponse) => cachedResponse || fetch(request)),
  );
});

self.addEventListener("push", (event) => {
  let payload = {};

  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : "" };
  }

  const title = payload.title || "KineFlow";

  event.waitUntil(
    self.registration.showNotification(title, {
      badge: "/icon-192.png",
      body: payload.body || "",
      data: { url: payload.url || "/dashboard" },
      icon: "/icon-192.png",
      tag: payload.tag,
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl = new URL(
    (event.notification.data && event.notification.data.url) || "/dashboard",
    self.location.origin,
  ).href;

  event.waitUntil(
    self.clients
      .matchAll({ includeUncontrolled: true, type: "window" })
      .then((windowClients) => {
        for (const client of windowClients) {
          if (new URL(client.url).origin === self.location.origin && "focus" in client) {
            return client.focus().then(() =>
              "navigate" in client ? client.navigate(targetUrl) : client,
            );
          }
        }

        return self.clients.openWindow(targetUrl);
      }),
  );
});
