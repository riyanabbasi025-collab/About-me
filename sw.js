const CACHE = "lucian-vex-static-v36.1";
const STATIC = [
  "./", "./index.html", "./about.html", "./skills.html", "./gaming.html", "./anime.html", "./network.html", "./contact.html", "./theme.html", "./style.css", "./script.js"
];
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(STATIC)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET") return;
  if (url.origin === self.location.origin) {
    event.respondWith((async () => {
      const cached = await caches.match(event.request);
      const network = fetch(event.request).then(response => {
        if (response.ok && (url.pathname.endsWith(".html") || url.pathname.endsWith(".js") || url.pathname.endsWith(".css") || url.pathname.endsWith("/"))) {
          caches.open(CACHE).then(c => c.put(event.request, response.clone())).catch(() => {});
        }
        return response;
      }).catch(() => cached);
      return cached || network;
    })());
    return;
  }
  if (url.hostname.endsWith("supabase.co") && url.pathname.includes("/rest/v1/lucian_site_public")) {
    event.respondWith((async () => {
      const cache = await caches.open("lucian-vex-cloud-v36.1");
      const cached = await cache.match(event.request);
      const revalidate = fetch(event.request).then(async response => {
        if (response.ok) await cache.put(event.request, response.clone());
        return response;
      }).catch(() => null);
      if (cached) {
        // Return cached cloud data immediately; refresh it in the background.
        revalidate.catch(() => {});
        return cached;
      }
      const fresh = await revalidate;
      return fresh || new Response(JSON.stringify([]), {headers:{"Content-Type":"application/json"}});
    })());
  }
});
