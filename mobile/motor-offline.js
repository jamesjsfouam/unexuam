/* Motor offline de Unexuam para la app móvil autónoma (Capacitor).
 * Replica exactamente las clases Vertex/Graph y los algoritmos BFS+TTL y Dijkstra
 * del backend en Python, interceptando únicamente las llamadas a /api/*. */

(function () {
  "use strict";

  window.__UNEXUAM_OFFLINE__ = true;
  const STORAGE_KEY = "unexuam-estado-v1";
  const fetchOriginal = window.fetch.bind(window);
  const INF = Infinity;

  // --- Grafos dirigidos y ponderados (espejo de backend/grafo.py) ---

  class Vertex {
    constructor(nombre) {
      this.nombre = nombre;
      this.neig = []; // [[Vertex, peso], ...]
    }
  }

  class Graph {
    constructor() {
      this.vertexs = [];
    }

    buscarVertice(nombre) {
      const clave = String(nombre).toLowerCase();
      for (const v of this.vertexs) {
        if (v.nombre.toLowerCase() === clave) return v;
      }
      return null;
    }

    insertarVertice(nombre) {
      if (this.buscarVertice(nombre) !== null) return false;
      this.vertexs.push(new Vertex(nombre));
      return true;
    }

    insertarArista(origen, destino, peso) {
      const vo = this.buscarVertice(origen);
      const vd = this.buscarVertice(destino);
      if (!vo || !vd) return false;
      for (const par of vo.neig) {
        if (par[0] === vd) return false;
      }
      vo.neig.push([vd, peso]);
      return true;
    }

    eliminarArista(origen, destino) {
      const vo = this.buscarVertice(origen);
      const vd = this.buscarVertice(destino);
      if (!vo || !vd) return false;
      const idx = vo.neig.findIndex((par) => par[0] === vd);
      if (idx === -1) return false;
      vo.neig.splice(idx, 1);
      return true;
    }

    eliminarVertice(nombre) {
      const objetivo = this.buscarVertice(nombre);
      if (!objetivo) return false;
      for (const v of this.vertexs) {
        v.neig = v.neig.filter((par) => par[0] !== objetivo);
      }
      this.vertexs = this.vertexs.filter((v) => v !== objetivo);
      return true;
    }

    actualizarPeso(origen, destino, nuevoPeso) {
      const vo = this.buscarVertice(origen);
      const vd = this.buscarVertice(destino);
      if (!vo || !vd) return false;
      for (let i = 0; i < vo.neig.length; i++) {
        if (vo.neig[i][0] === vd) {
          vo.neig[i] = [vd, nuevoPeso];
          return true;
        }
      }
      return false;
    }
  }

  // --- Capa 1: Red Mesh (BFS limitado por TTL) ---

  function propagarAlerta(red, origen, ttl) {
    const inicio = red.buscarVertice(origen);
    if (!inicio) return [];
    const alcanzados = [];
    const visitados = new Set([inicio]);
    const cola = [[inicio, 0]];
    while (cola.length > 0) {
      const [actual, salto] = cola.shift();
      alcanzados.push([actual.nombre, salto]);
      if (salto >= ttl) continue;
      for (const [destino] of actual.neig) {
        if (!visitados.has(destino)) {
          visitados.add(destino);
          cola.push([destino, salto + 1]);
        }
      }
    }
    return alcanzados;
  }

  // --- Capa 2: Evacuación (Dijkstra hecho a mano) ---

  function dijkstra(campus, origen) {
    const distancias = new Map();
    const anteriores = new Map();
    for (const v of campus.vertexs) {
      distancias.set(v.nombre, INF);
      anteriores.set(v.nombre, null);
    }
    const inicio = campus.buscarVertice(origen);
    if (!inicio) return { distancias, anteriores };
    distancias.set(inicio.nombre, 0);

    const visitados = new Set();
    while (visitados.size < campus.vertexs.length) {
      let actual = null;
      let mejorDist = INF;
      for (const v of campus.vertexs) {
        if (!visitados.has(v)) {
          const d = distancias.get(v.nombre);
          if (actual === null || d < mejorDist) {
            actual = v;
            mejorDist = d;
          }
        }
      }
      if (!actual || mejorDist === INF) break;
      visitados.add(actual);

      for (const [destino, peso] of actual.neig) {
        const nueva = mejorDist + peso;
        if (nueva < distancias.get(destino.nombre)) {
          distancias.set(destino.nombre, nueva);
          anteriores.set(destino.nombre, actual.nombre);
        }
      }
    }
    return { distancias, anteriores };
  }

  function rutaMasCorta(campus, origen, destino) {
    const vo = campus.buscarVertice(origen);
    const vd = campus.buscarVertice(destino);
    if (!vo || !vd) return [[], INF];
    const { distancias, anteriores } = dijkstra(campus, origen);
    const dist = distancias.get(vd.nombre);
    if (dist === INF) return [[], INF];
    const ruta = [];
    let lugar = vd.nombre;
    while (lugar !== null) {
      ruta.unshift(lugar);
      lugar = anteriores.get(lugar);
    }
    return [ruta, dist];
  }

  function rutaEvacuacion(campus, origen, zonasSeguras) {
    let mejorRuta = [];
    let mejorTiempo = INF;
    for (const zona of zonasSeguras) {
      const [ruta, tiempo] = rutaMasCorta(campus, origen, zona);
      if (tiempo < mejorTiempo) {
        mejorRuta = ruta;
        mejorTiempo = tiempo;
      }
    }
    return [mejorRuta, mejorTiempo];
  }

  function aplicarAlerta(campus, lugar, factor) {
    const peligro = campus.buscarVertice(lugar);
    if (!peligro) return false;
    for (const v of campus.vertexs) {
      for (let i = 0; i < v.neig.length; i++) {
        if (v.neig[i][0] === peligro) {
          v.neig[i] = [peligro, v.neig[i][1] * factor];
        }
      }
    }
    return true;
  }

  // --- Estado en memoria (espejo de app.py) ---

  let SEED = null;
  let listoPromesa = null;
  const S = {
    red: null,
    campus: null,
    zonas: [],
    ubicacion: null,
    bloqueados: [],
    congestion: {},
    ultimaAlerta: null,
    historial: [],
  };

  function horaActual() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  }

  function num(x) {
    if (x === null || x === undefined || !Number.isFinite(x)) return null;
    return Math.round(Number(x) * 100) / 100;
  }

  function construirGrafo(data) {
    const g = new Graph();
    for (const nombre of data.vertices) g.insertarVertice(nombre);
    for (const [o, d, p] of data.aristas) g.insertarArista(o, d, p);
    return g;
  }

  function serializar(g) {
    const vertices = [];
    const aristas = [];
    for (const v of g.vertexs) {
      vertices.push(v.nombre);
      for (const [destino, peso] of v.neig) {
        aristas.push({ origen: v.nombre, destino: destino.nombre, peso: num(peso) });
      }
    }
    return { vertices, aristas };
  }

  function registrar(texto, tipo = "info") {
    S.historial.unshift({ hora: horaActual(), texto, tipo });
    if (S.historial.length > 40) S.historial.length = 40;
  }

  function reiniciarMesh() {
    S.red = construirGrafo(SEED.mesh);
    S.ultimaAlerta = null;
  }

  function reiniciarCampus() {
    S.campus = construirGrafo(SEED.campus);
    S.zonas = [...SEED.zonas];
    S.ubicacion = null;
    S.bloqueados = [];
    S.congestion = {};
  }

  function guardarEstadoLocal() {
    try {
      const snap = {
        mesh: {
          vertices: S.red.vertexs.map((v) => v.nombre),
          aristas: S.red.vertexs.flatMap((v) => v.neig.map(([w, p]) => [v.nombre, w.nombre, num(p)])),
        },
        campus: {
          vertices: S.campus.vertexs.map((v) => v.nombre),
          aristas: S.campus.vertexs.flatMap((v) => v.neig.map(([w, p]) => [v.nombre, w.nombre, num(p)])),
        },
        zonas: S.zonas,
        ubicacion: S.ubicacion,
        bloqueados: S.bloqueados,
        congestion: S.congestion,
        ultimaAlerta: S.ultimaAlerta,
        historial: S.historial,
      };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snap));
    } catch (_) {}
  }

  function restaurarEstadoLocal() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      const snap = JSON.parse(raw);
      if (!snap || !snap.campus || !snap.mesh || !Array.isArray(snap.campus.vertices)) return false;
      S.red = construirGrafo(snap.mesh);
      S.campus = construirGrafo(snap.campus);
      S.zonas = Array.isArray(snap.zonas) ? snap.zonas : [...SEED.zonas];
      S.ubicacion = snap.ubicacion || null;
      S.bloqueados = Array.isArray(snap.bloqueados) ? snap.bloqueados : [];
      S.congestion = snap.congestion && typeof snap.congestion === "object" ? snap.congestion : {};
      S.ultimaAlerta = snap.ultimaAlerta || null;
      S.historial = Array.isArray(snap.historial) ? snap.historial : [];
      return true;
    } catch (_) {
      return false;
    }
  }

  async function asegurarInicializado() {
    if (SEED) return;
    if (!listoPromesa) {
      listoPromesa = fetchOriginal("/static/datos-iniciales.json")
        .then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.json();
        })
        .then((datos) => {
          SEED = datos;
          if (!restaurarEstadoLocal()) {
            reiniciarMesh();
            reiniciarCampus();
            registrar("App móvil Off-Grid lista. Campus UAM y red Mesh cargados.");
            guardarEstadoLocal();
          }
        })
        .catch((err) => {
          listoPromesa = null;
          throw err;
        });
    }
    await listoPromesa;
  }

  function calcularRuta() {
    if (!S.ubicacion) return null;
    const [ruta, tiempo] = rutaEvacuacion(S.campus, S.ubicacion, S.zonas);
    return { origen: S.ubicacion, ruta, tiempo: num(tiempo) };
  }

  function estado() {
    return {
      mesh: serializar(S.red),
      campus: {
        ...serializar(S.campus),
        zonasSeguras: S.zonas,
        ubicacion: S.ubicacion,
        ruta: calcularRuta(),
        bloqueados: S.bloqueados,
        congestion: S.congestion,
      },
      ultimaAlerta: S.ultimaAlerta,
      historial: S.historial,
    };
  }

  function responder(ok, mensaje, extra = {}) {
    if (mensaje) registrar(mensaje, ok ? "ok" : "error");
    guardarEstadoLocal();
    return { ok, mensaje, estado: estado(), ...extra };
  }

  function texto(d, clave, max = 40) {
    const val = d && d[clave];
    if (val === undefined || val === null || typeof val === "boolean" || typeof val === "object") return "";
    return String(val).trim().slice(0, max);
  }

  function numero(d, clave, minimo, maximo) {
    if (!d) return null;
    const val = d[clave];
    if (val === undefined || val === null || typeof val === "boolean") return null;
    if (typeof val === "string" && val.trim() === "") return null;
    const x = Number(val);
    if (!Number.isFinite(x) || x < minimo || x > maximo) return null;
    return x;
  }

  function existe(g, nombre) {
    return g.vertexs.some((v) => v.nombre === nombre);
  }

  function grafoPorNombre(nombre) {
    if (nombre === "mesh") return S.red;
    if (nombre === "campus") return S.campus;
    return null;
  }

  function despacharApi(ruta, d) {
    if (ruta === "/api/estado") {
      return { ok: true, mensaje: "", estado: estado() };
    }

    if (ruta === "/api/reiniciar") {
      const cual = (d && d.grafo) || "ambos";
      if (!["mesh", "campus", "ambos"].includes(cual)) return responder(false, "Grafo desconocido.");
      if (cual === "mesh" || cual === "ambos") reiniciarMesh();
      if (cual === "campus" || cual === "ambos") reiniciarCampus();
      const nombres = { mesh: "la red Mesh", campus: "el campus", ambos: "los dos grafos" };
      return responder(true, `Se reinició ${nombres[cual]}.`);
    }

    if (ruta === "/api/mesh/alerta") {
      const origen = texto(d, "origen");
      const ttlNum = numero(d, "ttl", 0, 50);
      if (!existe(S.red, origen)) return responder(false, `El teléfono «${origen}» no existe.`);
      if (ttlNum === null) return responder(false, "El TTL debe ser un número entre 0 y 50.");
      const ttl = Math.trunc(ttlNum);
      const alcanzados = propagarAlerta(S.red, origen, ttl);
      S.ultimaAlerta = { origen, ttl, alcanzados, hora: horaActual() };
      const total = S.red.vertexs.length;
      const unicos = new Set(alcanzados.map((a) => a[0]));
      unicos.add(origen);
      return responder(true, `Alerta desde ${origen} (TTL ${ttl}): llegó a ${unicos.size} de ${total} teléfonos.`, {
        alcanzados,
      });
    }

    if (ruta === "/api/campus/ruta") {
      const lugar = texto(d, "lugar", 60);
      if (!existe(S.campus, lugar)) {
        return { ok: false, mensaje: `El lugar «${lugar}» no existe.`, ruta: null };
      }
      const [r, tiempo] = rutaEvacuacion(S.campus, lugar, S.zonas);
      return { ok: true, mensaje: "", ruta: { origen: lugar, ruta: r, tiempo: num(tiempo) } };
    }

    if (ruta === "/api/campus/ubicacion") {
      const lugar = texto(d, "lugar");
      if (lugar && !existe(S.campus, lugar)) return responder(false, `El lugar «${lugar}» no existe.`);
      S.ubicacion = lugar || null;
      const r = calcularRuta();
      if (!r) return responder(true, "");
      if (r.tiempo === null) return responder(false, `Desde ${lugar} no hay ruta a ninguna zona segura.`);
      return responder(true, `Ruta desde ${lugar}: ${r.ruta.join(" → ")} (${r.tiempo} s).`);
    }

    if (ruta === "/api/campus/bloquear") {
      const o = texto(d, "origen");
      const dst = texto(d, "destino");
      const ambos = d && d.ambos !== undefined ? Boolean(d.ambos) : true;
      const pares = ambos ? [[o, dst], [dst, o]] : [[o, dst]];
      const quitadas = [];
      for (const [a, b] of pares) {
        const va = S.campus.vertexs.find((v) => v.nombre === a);
        const arista = va ? va.neig.find(([w]) => w.nombre === b) : null;
        if (arista && S.campus.eliminarArista(a, b)) {
          S.bloqueados.push({ origen: a, destino: b, peso: num(arista[1]) });
          quitadas.push(`${a} → ${b}`);
        }
      }
      if (!quitadas.length) return responder(false, `No existe el paso ${o} → ${dst}.`);
      return responder(true, `Pasillo bloqueado (eliminarArista): ${quitadas.join(", ")}.`);
    }

    if (ruta === "/api/campus/desbloquear") {
      let n = 0;
      for (const b of S.bloqueados) {
        if (S.campus.insertarArista(b.origen, b.destino, b.peso)) n++;
      }
      S.bloqueados = [];
      return responder(true, `Se reabrieron ${n} pasos (insertarArista con su peso original).`);
    }

    if (ruta === "/api/campus/congestionar") {
      const lugar = texto(d, "lugar");
      const factor = numero(d, "factor", 0.1, 20);
      if (!existe(S.campus, lugar)) return responder(false, `El lugar «${lugar}» no existe.`);
      if (factor === null) return responder(false, "El factor debe estar entre 0.1 y 20.");
      if (!aplicarAlerta(S.campus, lugar, factor)) {
        return responder(false, `aplicarAlerta devolvió False para «${lugar}».`);
      }
      S.congestion[lugar] = Math.round((S.congestion[lugar] || 1) * factor * 1000) / 1000;
      return responder(true, `${lugar}: los pasos que entran se multiplicaron ×${factor} (aplicarAlerta).`);
    }

    const mVert = ruta.match(/^\/api\/(mesh|campus)\/vertice$/);
    if (mVert) {
      const grafo = mVert[1];
      const g = grafoPorNombre(grafo);
      const accion = d && d.accion;
      const nombre = texto(d, "nombre");
      if (!nombre) return responder(false, "El nombre no puede estar vacío.");
      if (accion === "insertar") {
        if (!g.insertarVertice(nombre)) return responder(false, `«${nombre}» ya existe.`);
        if (grafo === "campus" && d.zonaSegura) S.zonas.push(nombre);
        return responder(true, `Vértice «${nombre}» insertado en ${grafo}.`);
      }
      if (accion === "eliminar") {
        const vReal = g.buscarVertice(nombre);
        if (!vReal || !g.eliminarVertice(vReal.nombre)) return responder(false, `«${nombre}» no existe.`);
        const canon = vReal.nombre;
        if (grafo === "campus") {
          S.zonas = S.zonas.filter((z) => z !== canon);
          S.bloqueados = S.bloqueados.filter((b) => b.origen !== canon && b.destino !== canon);
          delete S.congestion[canon];
          if (S.ubicacion === canon) S.ubicacion = null;
        }
        return responder(true, `Vértice «${canon}» eliminado de ${grafo} (y sus aristas entrantes).`);
      }
      return responder(false, "Acción no válida.");
    }

    const mAris = ruta.match(/^\/api\/(mesh|campus)\/arista$/);
    if (mAris) {
      const grafo = mAris[1];
      const g = grafoPorNombre(grafo);
      const accion = d && d.accion;
      const o = texto(d, "origen");
      const dst = texto(d, "destino");
      if (accion === "insertar" || accion === "actualizar") {
        const peso = numero(d, "peso", 0, 100000);
        if (peso === null) return responder(false, "El peso debe ser un número mayor o igual a 0.");
        if (accion === "insertar") {
          if (!g.insertarArista(o, dst, peso)) {
            return responder(false, `No se pudo insertar ${o} → ${dst}: falta algún vértice o la arista ya existe.`);
          }
          return responder(true, `Arista ${o} → ${dst} (peso ${peso}) insertada en ${grafo}.`);
        }
        if (!g.actualizarPeso(o, dst, peso)) return responder(false, `No existe la arista ${o} → ${dst}.`);
        return responder(true, `Peso de ${o} → ${dst} actualizado a ${peso}.`);
      }
      if (accion === "eliminar") {
        if (!g.eliminarArista(o, dst)) return responder(false, `No existe la arista ${o} → ${dst}.`);
        return responder(true, `Arista ${o} → ${dst} eliminada de ${grafo}.`);
      }
      return responder(false, "Acción no válida.");
    }

    return responder(false, `Ruta desconocida: ${ruta}`);
  }

  // Interceptar únicamente las llamadas a /api/*
  window.fetch = async function (input, init) {
    const url = typeof input === "string" ? input : input && input.url ? input.url : "";
    let pathname = url;
    try {
      pathname = new URL(url, window.location.origin).pathname;
    } catch (_) {}

    if (pathname.startsWith("/api/")) {
      await asegurarInicializado();
      let cuerpo = {};
      if (init && typeof init.body === "string" && init.body) {
        try {
          cuerpo = JSON.parse(init.body);
        } catch (_) {}
      }
      const res = despacharApi(pathname, cuerpo);
      return new Response(JSON.stringify(res), {
        status: 200,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      });
    }

    return fetchOriginal(input, init);
  };
})();
