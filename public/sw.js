const CACHE_NAME = "codex-usage-shell-v2";
const SHELL_ASSETS = [
  "./api-pricing.js",
  "./app.js",
  "./date-range.js",
  "./icon-180.png",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable-512.png",
  "./icon.svg",
  "./index.html",
  "./manifest.webmanifest",
  "./project-identity.js",
  "./pricing-catalog.js",
  "./pricing-ui.js",
  "./quota-forecast.js",
  "./styles.css",
  "./translations.js",
  "./usage-pricing.js",
  "./visualization.js",
].map((asset) => new URL(asset, self.location).toString());

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const requestUrl = new URL(request.url);
  if (requestUrl.origin !== self.location.origin || requestUrl.pathname.includes("/api/")) return;

  const shellUrl = SHELL_ASSETS.find((asset) => new URL(asset).pathname === requestUrl.pathname);
  if (!shellUrl && request.mode !== "navigate") return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok && (shellUrl || response.type === "basic")) {
          const cacheKey = shellUrl || new URL("./index.html", self.location).toString();
          caches.open(CACHE_NAME).then((cache) => cache.put(cacheKey, response.clone()));
        }
        return response;
      })
      .catch(async () => {
        const cache = await caches.open(CACHE_NAME);
        return cache.match(shellUrl || new URL("./index.html", self.location).toString());
      }),
  );
});
