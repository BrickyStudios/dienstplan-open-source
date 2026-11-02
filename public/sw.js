const CACHE = "nurvo-v2";

// Pages to cache for offline navigation (network-first, then cache)
const OFFLINE_PAGES = [
  "/mein-plan",
  "/zeiterfassung",
  "/urlaub",
  "/meine-zertifikate",
  "/meine-zertifikate",
  "/wuensche",
  "/springer",
];

// API routes to cache for offline data reads
const OFFLINE_APIS = [
  "/api/mitarbeiter/certificates",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(["/"])));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

async function networkFirstWithCache(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached ?? new Response("Offline", { status: 503 });
  }
}

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  const isSameOrigin = url.origin === self.location.origin;

  if (!isSameOrigin) return; // let Supabase / Anthropic calls through

  // Navigation to employee pages → network-first, cache fallback
  if (
    e.request.mode === "navigate" &&
    OFFLINE_PAGES.some((p) => url.pathname === p || url.pathname.startsWith(p + "/"))
  ) {
    e.respondWith(networkFirstWithCache(e.request));
    return;
  }

  // GET-only API routes for employee data → network-first, cache fallback
  if (
    e.request.method === "GET" &&
    OFFLINE_APIS.some((p) => url.pathname.startsWith(p))
  ) {
    e.respondWith(networkFirstWithCache(e.request));
    return;
  }

  // Root navigation fallback
  if (e.request.mode === "navigate") {
    e.respondWith(
      fetch(e.request).catch(() =>
        caches.match(e.request).then((r) => r ?? caches.match("/") ?? new Response("Offline", { status: 503 }))
      )
    );
  }
});
