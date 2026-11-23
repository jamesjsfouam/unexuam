/* Service Worker de Unexuam: caché de assets estáticos para operar offline. */
const CACHE = "unexuam-v7";
const ASSETS = [
  "/",
  "/static/app.css",
  "/static/app.js",
  "/static/cuenta.js",
  "/static/cuenta.css",
  "/static/campus-plano.json",
  "/static/manifest.json",
  "/static/fonts/Montserrat-Regular.ttf",
  "/static/fonts/Montserrat-Bold.ttf",
  "/static/fonts/Montserrat-Black.ttf",
  "/static/img/logo-x.png",
  "/static/img/wordmark-unexuam.png",
  "/static/img/icono-192.png",
  "/static/img/icono-512.png",
  "/static/img/banner-mapa.png",
  "/static/img/banner-zonas.png",
  "/static/img/ico-fuego.png",
  "/static/img/ico-sin-senal.png",
  "/static/img/ico-sismo.png",
  "/static/img/mapa-campus-3d.svg",
];

self.addEventListener("install", (ev) => {
  ev.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (ev) => {
  ev.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (ev) => {
  const url = new URL(ev.request.url);
  if (ev.request.method !== "GET" || url.pathname.startsWith("/api/")) return;
  ev.respondWith(
    fetch(ev.request)
      .then((res) => {
        if (res.ok && url.origin === self.location.origin) {
          const copia = res.clone();
          caches.open(CACHE).then((c) => c.put(ev.request, copia));
        }
        return res;
      })
      .catch(() => caches.match(ev.request))
  );
});
