/* Service Worker de Unexuam: caché de assets estáticos para operar offline. */
const CACHE = "unexuam-v34";
const CAMPUS_OFFLINE = "/campus-offline.json";
const ASSETS = [
  "/",
  CAMPUS_OFFLINE,
  "/static/app.css",
  "/static/app.js",
  "/static/cuenta.js",
  "/static/ajustes.js",
  "/static/cuenta.css",
  "/static/ubicacion.js",
  "/static/nube-firebase.js",
  "/static/i18n.js",
  "/static/ubicacion-campus.json",
  "/static/campus-plano.json",
  "/static/campus-rutas.json",
  "/static/manifest.json",
  "/static/fonts/Montserrat-Regular.woff2",
  "/static/fonts/Montserrat-Bold.woff2",
  "/static/fonts/Montserrat-Black.woff2",
  "/static/img/logo-x.png",
  "/static/img/wordmark-unexuam.png",
  "/static/img/icono-192.png",
  "/static/img/icono-512.png",
  "/static/img/ico-fuego.png",
  "/static/img/ico-sin-senal.png",
  "/static/img/mapa-campus-3d.svg",
  "/static/img/fondo-marca.svg",
  "/static/img/figma/tarjeta-inundacion.jpg",
  "/static/img/figma/tarjeta-incendio.jpg",
  "/static/img/figma/tarjeta-sismo.jpg",
  "/static/img/figma/tarjeta-auxilios.svg",
  "/static/img/figma/tarjeta-sin-senal.svg",
  "/static/img/figma/campus-uam-inicio.jpg",
  "/static/img/figma/campus-uam-evacuar.jpg",
  "/static/img/figma/campus-uam-mesh.jpg",
  "/static/img/figma/flecha-izq.png",
  "/static/img/figma/flecha-der.png",
  "/static/img/figma/logo-x-blanco.png",
];

self.addEventListener("install", (ev) => {
  ev.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (ev) => {
  ev.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith("unexuam-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function responderCampus(peticion, ruta) {
  try {
    const respuesta = await fetch(peticion.clone());
    if (respuesta.status < 500) {
      if (ruta === "/api/campus/publico" && respuesta.ok) {
        try {
          const copia = await fetch(CAMPUS_OFFLINE, { cache: "no-store" });
          if (copia.ok) await (await caches.open(CACHE)).put(CAMPUS_OFFLINE, copia);
        } catch (_) {
          // Conservar la última copia completa.
        }
      }
      return respuesta;
    }
  } catch (_) {
    // Las consultas públicas admiten la copia local.
  }
  const copia = await (await caches.open(CACHE)).match(CAMPUS_OFFLINE);
  if (!copia) return Response.json({ ok: false, mensaje: "El mapa offline aún no está disponible." }, { status: 503 });
  const datos = await copia.json();
  const offline = { offline: true, capturado: datos.capturado };
  if (ruta === "/api/campus/publico") return Response.json({ ok: true, estado: datos.estado, ...offline });
  const cuerpo = await peticion.json().catch(() => null);
  const lugar = cuerpo?.lugar;
  if (typeof lugar !== "string" || !Object.prototype.hasOwnProperty.call(datos.rutas, lugar)) {
    return Response.json({ ok: false, mensaje: "El lugar no existe en el mapa descargado.", ...offline });
  }
  return Response.json({ ok: true, ruta: datos.rutas[lugar], ...offline });
}

self.addEventListener("fetch", (ev) => {
  const url = new URL(ev.request.url);
  if (url.origin !== self.location.origin) return;
  if ((ev.request.method === "GET" && url.pathname === "/api/campus/publico") ||
      (ev.request.method === "POST" && url.pathname === "/api/campus/ruta")) {
    ev.respondWith(responderCampus(ev.request, url.pathname));
    return;
  }
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
      .catch(async () => (await caches.match(ev.request))
        || new Response("Recurso no disponible sin conexión.", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } }))
  );
});

self.addEventListener("push", (ev) => {
  const data = (() => {
    try { return ev.data ? ev.data.json() : {}; } catch (_) { return { body: ev.data ? ev.data.text() : "" }; }
  })();
  const titulo = data.title || "Unexuam · Alerta";
  const opciones = {
    body: data.body || "Tienes una nueva alerta o mensaje en el campus UAM.",
    icon: "/static/img/icono-192.png",
    badge: "/static/img/icono-192.png",
    vibrate: [240, 100, 240],
    tag: data.tag || "unexuam-push",
    data: { url: data.url || "/" },
  };
  ev.waitUntil(self.registration.showNotification(titulo, opciones));
});

self.addEventListener("notificationclick", (ev) => {
  ev.notification.close();
  const destino = (ev.notification.data && ev.notification.data.url) || "/";
  ev.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((lista) => {
      for (const c of lista) {
        if ("focus" in c) return c.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(destino);
    })
  );
});
