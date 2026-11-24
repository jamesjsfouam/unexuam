/* Unexuam · ubicación por GPS dentro del campus UAM.
 * Convierte latitud/longitud a metros del plano (misma proyección del mapa de OpenStreetMap)
 * y decide en qué edificio o zona segura estás (punto dentro de polígono). Si estás afuera,
 * toma el lugar del grafo más cercano. */
(function () {
  "use strict";

  let DATOS = null;
  let vigilante = null;

  async function cargar() {
    if (DATOS) return DATOS;
    const r = await fetch("/static/ubicacion-campus.json");
    DATOS = await r.json();
    return DATOS;
  }

  function aMetros(lat, lon) {
    const o = DATOS.origen;
    return [(lon - o.lon) * Math.cos(o.lat * Math.PI / 180) * 111320, (o.lat - lat) * 110574];
  }

  function dentro([x, y], pol) {
    let c = false;
    for (let i = 0, j = pol.length - 1; i < pol.length; j = i++) {
      const [xi, yi] = pol[i], [xj, yj] = pol[j];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
    }
    return c;
  }

  function centro(pol) {
    return [pol.reduce((a, p) => a + p[0], 0) / pol.length, pol.reduce((a, p) => a + p[1], 0) / pol.length];
  }

  /** {lugar, area, edificio, dentroCampus, distancia} para un punto en metros. */
  function identificar(xy, piso) {
    const enCampus = dentro(xy, DATOS.campus);
    for (const a of DATOS.areas) {
      if (!dentro(xy, a.pol)) continue;
      if (a.edificio) {
        // Edificios con aulas: mitad oeste u este del edificio, en el piso elegido.
        const lado = xy[0] < centro(a.pol)[0] ? "Oeste" : "Este";
        const p = piso || 1;
        return { lugar: `${a.edificio} Pabellón ${lado} P${p}`, area: a.nombre, edificio: a.edificio, dentroCampus: true, segura: false };
      }
      return { lugar: a.vertice, area: a.nombre, dentroCampus: true, segura: a.tipo === "segura" };
    }
    let mejor = null, dist = Infinity;
    for (const [nombre, p] of Object.entries(DATOS.puntos)) {
      const d = Math.hypot(p[0] - xy[0], p[1] - xy[1]);
      if (d < dist) { dist = d; mejor = nombre; }
    }
    return { lugar: mejor, area: null, dentroCampus: enCampus, distancia: Math.round(dist), segura: /^(Zona Segura|Punto Seguro)/.test(mejor || "") };
  }

  function disponible() {
    if (!("geolocation" in navigator)) return "Este teléfono no tiene GPS disponible.";
    if (!window.isSecureContext) return "seguro";
    return "";
  }

  async function seguir(alCambiar, alError, piso) {
    await cargar();
    detener();
    const motivo = disponible();
    if (motivo) { alError(motivo); return; }
    let ultimo = null;
    vigilante = navigator.geolocation.watchPosition(pos => {
      const xy = aMetros(pos.coords.latitude, pos.coords.longitude);
      const r = identificar(xy, piso());
      r.precision = Math.round(pos.coords.accuracy);
      r.xy = xy;
      const clave = r.lugar + "|" + r.dentroCampus;
      r.cambio = clave !== ultimo;
      ultimo = clave;
      alCambiar(r);
    }, err => {
      alError(err.code === 1 ? "Permiso de ubicación denegado." : "No se pudo obtener tu ubicación.");
    }, { enableHighAccuracy: true, maximumAge: 4000, timeout: 20000 });
  }

  function detener() {
    if (vigilante !== null) navigator.geolocation.clearWatch(vigilante);
    vigilante = null;
  }

  window.UnexuamUbicacion = { cargar, seguir, detener, identificar, aMetros, activo: () => vigilante !== null };
})();
