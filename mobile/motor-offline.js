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
      if (typeof peso !== "number" || !Number.isFinite(peso) || peso < 0) return false;
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
      if (typeof nuevoPeso !== "number" || !Number.isFinite(nuevoPeso) || nuevoPeso < 0) return false;
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
    const inicio = campus.buscarVertice(origen);
    if (!inicio) return [[], INF];
    const { distancias, anteriores } = dijkstra(campus, origen);
    let mejorZona = null;
    let mejorTiempo = INF;
    for (const zona of zonasSeguras) {
      const vz = campus.buscarVertice(zona);
      if (!vz) continue;
      const t = distancias.get(vz.nombre);
      if (t !== undefined && t < mejorTiempo) {
        mejorTiempo = t;
        mejorZona = vz.nombre;
      }
    }
    if (mejorZona === null || mejorTiempo === INF) return [[], INF];
    const mejorRuta = [];
    let lugar = mejorZona;
    while (lugar !== null) {
      mejorRuta.unshift(lugar);
      lugar = anteriores.get(lugar);
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
  let RUTAS_CACHE = new Map();
  let rutasPrecalculadas = false;

  function cargarCacheBase() {
    RUTAS_CACHE.clear();
    if (SEED && SEED.rutasBase && typeof SEED.rutasBase === "object") {
      for (const [k, v] of Object.entries(SEED.rutasBase)) {
        RUTAS_CACHE.set(k, v);
      }
      rutasPrecalculadas = true;
    } else {
      rutasPrecalculadas = false;
    }
  }

  function invalidarCacheRutas() {
    RUTAS_CACHE.clear();
    rutasPrecalculadas = false;
  }

  function obtenerRutaCampus(lugar) {
    if (RUTAS_CACHE.has(lugar)) {
      return { ruta: RUTAS_CACHE.get(lugar), precalculada: rutasPrecalculadas };
    }
    const [r, tiempo] = rutaEvacuacion(S.campus, lugar, S.zonas);
    const res = { origen: lugar, ruta: r, tiempo: num(tiempo) };
    RUTAS_CACHE.set(lugar, res);
    return { ruta: res, precalculada: false };
  }
  const S = {
    red: null,
    campus: null,
    zonas: [],
    ubicacion: null,
    bloqueados: [],
    congestion: {},
    ultimaAlerta: null,
    emergencia: null,
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
    S.emergencia = null;
    for (const k of Object.keys(UBIC)) delete UBIC[k];
    if (SEED && SEED.ubicaciones) Object.assign(UBIC, SEED.ubicaciones);
    const yo = cuentaActual();
    if (yo && S.campus && S.campus.vertexs.length) {
      conectarUsuario(yo.cif, yo.u.lugar || "Edificio E");
    }
  }

  function reiniciarCampus() {
    S.campus = construirGrafo(SEED.campus);
    S.zonas = [...SEED.zonas];
    S.ubicacion = null;
    S.bloqueados = [];
    S.congestion = {};
    cargarCacheBase();
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
        emergencia: S.emergencia,
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
      S.emergencia = snap.emergencia || null;
      S.historial = Array.isArray(snap.historial) ? snap.historial : [];
      if (!S.bloqueados.length && !Object.keys(S.congestion).length) cargarCacheBase();
      else invalidarCacheRutas();
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
      emergencia: S.emergencia,
      historial: S.historial,
    };
  }

  function responder(ok, mensaje, extra = {}) {
    if (mensaje) registrar(mensaje, ok ? "ok" : "error");
    if (ok) repartirCola();
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

  // --- Cuentas, mensajería por la red Mesh y Dijkstra paso a paso (espejo de backend/) ---
  const CUENTAS_KEY = "unexuam-cuentas-v1";
  const ALCANCE = 120;
  const UBIC = {};

  function cuentas() {
    try {
      const c = JSON.parse(window.localStorage.getItem(CUENTAS_KEY) || "null");
      if (c && c.usuarios && Array.isArray(c.mensajes)) return c;
    } catch (_) {}
    return { usuarios: {}, mensajes: [], sesion: null };
  }
  function guardarCuentas(c) {
    window.localStorage.setItem(CUENTAS_KEY, JSON.stringify(c));
  }
  function cuentaActual() {
    const c = cuentas();
    const usuario = c.sesion && Object.prototype.hasOwnProperty.call(c.usuarios, c.sesion) && c.usuarios[c.sesion];
    return usuario && !usuario.admin && !usuario.real ? { cif: c.sesion, u: usuario } : null;
  }
  function generarId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID().replace(/-/g, "").slice(0, 16);
    }
    if (window.crypto && typeof window.crypto.getRandomValues === "function") {
      const bytes = new Uint8Array(8);
      window.crypto.getRandomValues(bytes);
      return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    }
    return `${Date.now().toString(16)}${Math.random().toString(16).slice(2, 10)}`;
  }

  function generarSal() {
    if (window.crypto && typeof window.crypto.getRandomValues === "function") {
      const bytes = new Uint8Array(16);
      window.crypto.getRandomValues(bytes);
      return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    }
    return generarId() + generarId();
  }

  function resumenV1(texto) {
    let h = 0x811c9dc5;
    for (const ch of String(texto)) { h ^= ch.codePointAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
    return h.toString(16);
  }

  function resumen(texto) {
    // Hash iterado de 128 bits con sal CSPRNG (sincrono para compatibilidad offline)
    const s = String(texto);
    let h1 = 0x811c9dc5, h2 = 0x9e3779b9, h3 = 0x85ebca6b, h4 = 0xc2b2ae35;
    for (let r = 0; r < 64; r++) {
      for (let i = 0; i < s.length; i++) {
        const c = s.charCodeAt(i) ^ ((r + i) & 0xff);
        h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
        h2 = Math.imul(h2 ^ (h1 >>> 13) ^ c, 0x27d4eb2d) >>> 0;
        h3 = Math.imul(h3 ^ (h2 >>> 15) ^ c, 0x165667b1) >>> 0;
        h4 = Math.imul(h4 ^ (h3 >>> 11) ^ c, 0x85ebca6b) >>> 0;
      }
      h1 = (h1 ^ (h4 >>> 16)) >>> 0;
    }
    return "v2:" + [h1, h2, h3, h4].map((x) => x.toString(16).padStart(8, "0")).join("");
  }

  async function derivarClave(clave, sal) {
    const encoder = new TextEncoder();
    const claveBase = await window.crypto.subtle.importKey("raw", encoder.encode(clave), "PBKDF2", false, ["deriveBits"]);
    const bits = await window.crypto.subtle.deriveBits({
      name: "PBKDF2", hash: "SHA-256", salt: encoder.encode(sal), iterations: 600000,
    }, claveBase, 256);
    return "pbkdf2-sha256:" + Array.from(new Uint8Array(bits), (byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  async function verificarClave(u, clave) {
    if (!u || !u.hash) return false;
    const entrada = (u.sal || "") + clave;
    if (u.hash.startsWith("pbkdf2-sha256:")) return u.hash === await derivarClave(clave, u.sal);
    if (u.hash.startsWith("v2:")) return u.hash === resumen(entrada);
    return u.hash === resumenV1(entrada);
  }
  function nombreTelefono(C, cif, nombre) {
    const base = "Tel-" + (nombre.split(" ")[0] || "UAM");
    const usados = new Set(Object.values(C.usuarios).map((u) => u.telefono).concat(Object.keys(SEED.ubicaciones || {})));
    for (const suf of [cif.slice(-3), cif]) if (!usados.has(`${base}-${suf}`)) return `${base}-${suf}`;
    return `Tel-${cif}`;
  }
  function retardoEnlace(segundos) {
    return Math.round((0.5 + segundos / 30) * 10) / 10;
  }
  function conectarTelefono(red, campus, telefono, lugar, ubicaciones) {
    if (!campus.buscarVertice(lugar)) return [];
    red.insertarVertice(telefono);
    const distancias = dijkstra(campus, lugar).distancias;
    const vecinos = [];
    for (const otro of Object.keys(ubicaciones)) {
      if (otro === telefono || !red.buscarVertice(otro)) continue;
      const s = distancias.get(ubicaciones[otro]);
      if (s !== undefined && s <= ALCANCE) {
        const r = retardoEnlace(s);
        red.insertarArista(telefono, otro, r);
        red.insertarArista(otro, telefono, r);
        vecinos.push([otro, r]);
      }
    }
    return vecinos;
  }
  function conectarUsuario(cif, lugar) {
    const C = cuentas();
    const u = C.usuarios[cif];
    if (!Object.keys(UBIC).length) Object.assign(UBIC, SEED.ubicaciones || {});
    if (u.admin) { u.lugar = lugar; guardarCuentas(C); return []; }   // el admin no entra a la red Mesh
    if (S.red.buscarVertice(u.telefono)) S.red.eliminarVertice(u.telefono);
    delete UBIC[u.telefono];
    const vecinos = conectarTelefono(S.red, S.campus, u.telefono, lugar, UBIC);
    UBIC[u.telefono] = lugar;
    u.lugar = lugar;
    guardarCuentas(C);
    return vecinos;
  }
  function datosUsuario(cif) {
    const u = cuentas().usuarios[cif];
    const v = S.red.buscarVertice(u.telefono);
    return { cif, nombre: u.nombre, telefono: u.telefono, lugar: u.lugar, admin: !!u.admin, enLinea: !!v, alcance: ALCANCE,
      vecinos: v ? v.neig.map(([w, p]) => ({ telefono: w.nombre, retardo: num(p) })) : [] };
  }
  function repartirCola() {
    const C = cuentas();
    let n = 0;
    for (const m of C.mensajes) {
      if (m.estado !== "en cola" || !C.usuarios[m.de] || !C.usuarios[m.para]) continue;
      const destino = C.usuarios[m.para];
      if (window.UnexuamNativo && destino.real) continue;
      const [r, retardo] = rutaMasCorta(S.red, C.usuarios[m.de].telefono, destino.telefono);
      if (r.length) {
        Object.assign(m, { estado: "entregado", ruta: r, retardo: num(retardo), entregado: horaActual(), viaCola: true });
        n++;
      }
    }
    if (n) guardarCuentas(C);
    return n;
  }
  function dijkstraPasos(campus, origen, zonasSeguras) {
    const distancias = {}, anteriores = {};
    for (const v of campus.vertexs) { distancias[v.nombre] = INF; anteriores[v.nombre] = null; }
    const inicio = campus.buscarVertice(origen);
    if (!inicio) return [[], [], INF];
    distancias[inicio.nombre] = 0;
    const pasos = [], visitados = new Set();
    let zona = null;
    while (visitados.size < campus.vertexs.length) {
      let actual = null;
      for (const v of campus.vertexs) {
        if (!visitados.has(v) && (actual === null || distancias[v.nombre] < distancias[actual.nombre])) actual = v;
      }
      if (distancias[actual.nombre] === INF) break;
      visitados.add(actual);
      const paso = { actual: actual.nombre, distancia: distancias[actual.nombre], vecinos: [] };
      if (zonasSeguras.includes(actual.nombre)) { pasos.push(paso); zona = actual.nombre; break; }
      for (const [destino, peso] of actual.neig) {
        const antes = distancias[destino.nombre];
        const nueva = distancias[actual.nombre] + peso;
        const mejora = !visitados.has(destino) && nueva < antes;
        if (mejora) { distancias[destino.nombre] = nueva; anteriores[destino.nombre] = actual.nombre; }
        paso.vecinos.push({ destino: destino.nombre, peso, antes, nueva, mejora, visitado: visitados.has(destino) });
      }
      pasos.push(paso);
    }
    if (zona === null) return [pasos, [], INF];
    const r = [];
    for (let l = zona; l !== null; l = anteriores[l]) r.unshift(l);
    return [pasos, r, distancias[zona]];
  }

  async function despacharApi(ruta, d, searchParams) {
    const LIBRES = ["/api/yo", "/api/login", "/api/registro", "/api/registro/disponible", "/api/lugares", "/api/campus/publico", "/api/campus/ruta", "/api/mensajes/general"];
    const SOLO_ADMIN = ["/api/reiniciar", "/api/mesh/vertice", "/api/mesh/arista", "/api/mesh/alerta", "/api/campus/vertice", "/api/campus/arista", "/api/campus/ubicacion", "/api/campus/desbloquear", "/api/campus/congestionar", "/api/algoritmo", "/api/emergencia/declarar", "/api/emergencia/finalizar"];
    if (!LIBRES.includes(ruta)) {
      const yo = cuentaActual();
      if (!yo) {
        return { _status: 401, ok: false, sesion: false, mensaje: "Inicia sesión con tu CIF y tu contraseña." };
      }
      if (SOLO_ADMIN.includes(ruta) && !yo.u.admin) {
        return { _status: 403, ok: false, mensaje: "Solo el administrador puede editar los grafos." };
      }
    }
    if (ruta === "/api/estado") {
      sincronizarCampusNube();
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

    if (ruta === "/api/emergencia/declarar") {
      const EM = {
        sismo: ["Sismo / Temblor", "Agáchate, cúbrete y al terminar evacúa hacia el punto seguro más cercano."],
        incendio: ["Incendio en el campus", "Evacúa rápido y agachado si hay humo. No uses elevadores."],
        inundacion: ["Inundación / Tormenta", "Aléjate de drenajes y parqueos bajos. Sube a piso 2 o 3 si es necesario."],
        general: ["Emergencia en el campus", "Sigue tu ruta de evacuación hacia el punto seguro más cercano."],
      };
      const tipo = EM[String((d && d.tipo) || "general").toLowerCase()] ? String(d.tipo).toLowerCase() : "general";
      const [tituloDef, textoDef] = EM[tipo];
      const txtEm = texto(d, "texto", 200) || textoDef;
      const idEm = generarId();
      const horaEm = horaActual();
      S.emergencia = { id: idEm, tipo, titulo: tituloDef, texto: txtEm, hora: horaEm };
      const yoEm = cuentaActual();
      if (yoEm) {
        enviarPaqueteReal({
          id: idEm, tipo: "incidente", accion: "emergencia", emergenciaTipo: tipo,
          titulo: tituloDef, texto: `SOS · ${tituloDef}: ${txtEm}`,
          de: yoEm.cif, deNombre: yoEm.u.nombre, deTel: yoEm.u.telefono,
          para: "TODOS", hora: horaEm, ttl: 6, ruta: [yoEm.u.telefono],
        });
      }
      guardarEstadoLocal();
      publicarCampusNube();
      return responder(true, `Emergencia declarada: ${tituloDef}.`);
    }

    if (ruta === "/api/emergencia/finalizar") {
      const incidente = S.emergencia?.id;
      if (!incidente) return responder(false, "No hay una emergencia activa.");
      S.ultimaAlerta = null;
      S.emergencia = null;
      const yoFin = cuentaActual();
      if (yoFin) {
        enviarPaqueteReal({
          id: generarId(), tipo: "incidente", accion: "finalizar", incidente,
          texto: "Emergencia finalizada por el administrador. Campus en calma.",
          de: yoFin.cif, deNombre: yoFin.u.nombre, deTel: yoFin.u.telefono,
          para: "TODOS", hora: horaActual(), ttl: 6, ruta: [yoFin.u.telefono],
        });
      }
      guardarEstadoLocal();
      publicarCampusNube();
      return responder(true, "Emergencia finalizada. El campus vuelve a estar en calma.");
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
      const { ruta: resRuta, precalculada } = obtenerRutaCampus(lugar);
      return { ok: true, mensaje: "", precalculada, ruta: resRuta };
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
      invalidarCacheRutas();
      // Difundir el bloqueo por Mesh real a todos los teléfonos cercanos para recalcular sus rutas
      const yoBloq = cuentaActual();
      if (yoBloq) {
        const ahoraB = horaActual();
        const idB = generarId();
        const txtB = `Bloqueo reportado: ${o} y ${dst}. Recalculando rutas.`;
        const envB = enviarPaqueteReal({
          id: idB, tipo: "incidente", accion: "bloquear", origen: o, destino: dst, ambos,
          de: yoBloq.cif, deNombre: yoBloq.u.nombre, deTel: yoBloq.u.telefono,
          para: "TODOS", texto: txtB, hora: ahoraB, ttl: 6, ruta: [yoBloq.u.telefono],
        });
        const CB = cuentas();
        CB.mensajes.push({
          id: idB, de: yoBloq.cif, deNombre: yoBloq.u.nombre, para: "TODOS", texto: txtB,
          hora: ahoraB, estado: envB > 0 ? "transmitiendo" : "en cola",
          ruta: [], retardo: null, entregado: null, viaCola: false,
        });
        guardarCuentas(CB);
      }
      guardarEstadoLocal();
      publicarCampusNube();
      return responder(true, `Pasillo bloqueado: ${quitadas.join(", ")}.`);
    }

    if (ruta === "/api/campus/desbloquear") {
      let n = 0;
      for (const b of S.bloqueados) {
        const pesoFinal = b.peso * (S.congestion[b.destino] || 1);
        if (S.campus.insertarArista(b.origen, b.destino, pesoFinal)) n++;
      }
      S.bloqueados = [];
      if (!Object.keys(S.congestion).length) cargarCacheBase();
      else invalidarCacheRutas();
      guardarEstadoLocal();
      publicarCampusNube();
      return responder(true, `Se reabrieron ${n} pasos con su tiempo original.`);
    }

    if (ruta === "/api/campus/congestionar") {
      const lugar = texto(d, "lugar");
      const factor = numero(d, "factor", 0.1, 20);
      if (!existe(S.campus, lugar)) return responder(false, `El lugar «${lugar}» no existe.`);
      if (factor === null) return responder(false, "El factor debe estar entre 0.1 y 20.");
      const acumulado = (S.congestion[lugar] || 1) * factor;
      if (acumulado < 0.1 || acumulado > 100) {
        return responder(false, "Esa congestión ya llegó a su límite (entre ×0.1 y ×100).");
      }
      if (!aplicarAlerta(S.campus, lugar, factor)) {
        return responder(false, `No se pudo aplicar congestión en «${lugar}».`);
      }
      S.congestion[lugar] = Math.round(acumulado * 1000) / 1000;
      invalidarCacheRutas();
      guardarEstadoLocal();
      publicarCampusNube();
      return responder(true, `${lugar}: congestión aplicada (tiempos ×${factor}).`);
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
        if (grafo === "campus") invalidarCacheRutas();
        return responder(true, `Vértice «${nombre}» agregado en ${grafo}.`);
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
          invalidarCacheRutas();
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
            return responder(false, `No se pudo agregar ${o} → ${dst}: falta algún vértice o la arista ya existe.`);
          }
          if (grafo === "campus") invalidarCacheRutas();
          return responder(true, `Arista ${o} → ${dst} (peso ${peso}) agregada en ${grafo}.`);
        }
        if (!g.actualizarPeso(o, dst, peso)) return responder(false, `No existe la arista ${o} → ${dst}.`);
        if (grafo === "campus") invalidarCacheRutas();
        return responder(true, `Peso de ${o} → ${dst} actualizado a ${peso}.`);
      }
      if (accion === "eliminar") {
        if (!g.eliminarArista(o, dst)) return responder(false, `No existe la arista ${o} → ${dst}.`);
        if (grafo === "campus") invalidarCacheRutas();
        return responder(true, `Arista ${o} → ${dst} eliminada de ${grafo}.`);
      }
      return responder(false, "Acción no válida.");
    }

    // --- Inicio de sesión y mensajes (espejo de app.py) ---
    // Sin servidor, las cuentas y los mensajes quedan en este teléfono (localStorage).
    if (ruta === "/api/lugares") {
      return { ok: true, lugares: S.campus.vertexs.map((v) => v.nombre) };
    }
    if (ruta === "/api/campus/publico") {
      return {
        ok: true,
        estado: {
          mesh: { vertices: [], aristas: [] },
          campus: {
            ...serializar(S.campus),
            zonasSeguras: S.zonas,
            ubicacion: null,
            ruta: null,
            bloqueados: S.bloqueados,
            congestion: S.congestion,
          },
          ultimaAlerta: null,
          historial: [],
        },
      };
    }
    if (ruta === "/api/yo") {
      const yo = cuentaActual();
      if (!yo) return { ok: false, sesion: false };
      if (!S.red.buscarVertice(yo.u.telefono)) {
        conectarUsuario(yo.cif, yo.u.lugar || "Edificio E");
        repartirCola();
        guardarEstadoLocal();
      }
      iniciarMeshReal(yo.cif, yo.u);
      return { ok: true, sesion: true, usuario: datosUsuario(yo.cif) };
    }
    if (ruta === "/api/registro/disponible") {
      const C = cuentas();
      const cif = String((d && d.cif) || "").replace(/\s+/g, "").toUpperCase().slice(0, 15);
      if (!/^[0-9A-Z-]{4,15}$/.test(cif) || cif === "ADMIN") {
        return { ok: false, disponible: false, mensaje: "Escribe un CIF válido (4 a 15 letras o números)." };
      }
      const existente = C.usuarios[cif];
      if (existente) {
        return {
          ok: false,
          disponible: false,
          mensaje: existente.real
            ? "Ese CIF ya está conectado en la red Mesh cercana."
            : "Ese CIF ya tiene cuenta en este dispositivo. Inicia sesión.",
        };
      }
      if (window.UNEXO_NUBE) {
        const nube = await window.UNEXO_NUBE.obtenerUsuario(cif);
        if (!nube.offline && nube.usuario) {
          return { ok: false, disponible: false, mensaje: "Ese CIF ya tiene cuenta en la nube. Inicia sesión." };
        }
      }
      return { ok: true, disponible: true };
    }
    if (ruta === "/api/registro" || ruta === "/api/login") {
      const C = cuentas();
      const cif = String((d && d.cif) || "").replace(/\s+/g, "").toUpperCase().slice(0, 15);
      const clave = String((d && d.contrasena) || "").slice(0, 64);
      if (ruta === "/api/registro") {
        const nombre = String((d && d.nombre) || "").split(/\s+/).filter(Boolean).join(" ").slice(0, 40);
        if (!/^[0-9A-Z-]{4,15}$/.test(cif) || cif === "ADMIN") return { ok: false, mensaje: "Escribe un CIF válido (4 a 15 letras o números)." };
        if (nombre.length < 2) return { ok: false, mensaje: "Escribe tu nombre." };
        if (clave.length < 6) return { ok: false, mensaje: "La contraseña debe tener al menos 6 caracteres." };
        if (C.usuarios[cif]) return { ok: false, mensaje: "Ese CIF ya tiene cuenta. Inicia sesión." };
        const sal = generarSal();
        const hash = await derivarClave(clave, sal);
        const telefono = nombreTelefono(C, cif, nombre);
        const lugarPedidoReg = texto(d, "lugar", 60);
        const lugarInicial = (lugarPedidoReg && S.campus.buscarVertice(lugarPedidoReg)) ? lugarPedidoReg : "Edificio E";
        const nuevo = { cif, nombre, sal, hash, telefono, lugar: lugarInicial, admin: false, creado: Date.now() };
        if (window.UNEXO_NUBE) {
          const resNube = await window.UNEXO_NUBE.crearUsuario(nuevo);
          if (!resNube.offline && resNube.duplicado) {
            return { ok: false, mensaje: "Ese CIF ya tiene cuenta. Inicia sesión." };
          }
        }
        C.usuarios[cif] = { nombre, sal, hash, telefono, lugar: lugarInicial };
        registrar(`Nueva cuenta: ${nombre} (${telefono}).`, "ok");
      } else {
        let u = C.usuarios[cif];
        if ((!u || u.real) && window.UNEXO_NUBE) {
          const nube = await window.UNEXO_NUBE.obtenerUsuario(cif);
          if (!nube.offline && nube.usuario) {
            C.usuarios[cif] = {
              nombre: nube.usuario.nombre,
              sal: nube.usuario.sal,
              hash: nube.usuario.hash,
              telefono: nube.usuario.telefono,
              lugar: nube.usuario.lugar || "Edificio E",
              admin: !!nube.usuario.admin,
            };
            u = C.usuarios[cif];
          }
        }
        if (!u || u.admin || u.real || !await verificarClave(u, clave)) return { ok: false, mensaje: "CIF o contraseña incorrectos." };
        if (!u.hash.startsWith("pbkdf2-sha256:")) {
          u.sal = generarSal();
          u.hash = await derivarClave(clave, u.sal);
        }
      }
      C.sesion = cif;
      const u = C.usuarios[cif];
      const lugarPedido = texto(d, "lugar", 60);
      const lugarFinal = (lugarPedido && S.campus.buscarVertice(lugarPedido)) ? lugarPedido : (u.lugar || "Edificio E");
      u.lugar = lugarFinal;
      guardarCuentas(C);
      const vecinos = conectarUsuario(cif, lugarFinal);
      registrar(`${u.nombre} entró a la red desde ${lugarFinal}: ${vecinos.length} teléfono(s) a su alcance.`, "ok");
      repartirCola();
      guardarEstadoLocal();
      iniciarMeshReal(cif, u);
      return { ok: true, usuario: datosUsuario(cif) };
    }
    if (ruta === "/api/logout") {
      const yo = cuentaActual();
      if (yo) {
        detenerMeshReal();
        S.red.eliminarVertice(yo.u.telefono);
        delete UBIC[yo.u.telefono];
        registrar(`${yo.u.nombre} salió: su teléfono dejó la red (eliminarVertice).`);
        const C = cuentas();
        C.sesion = null;
        guardarCuentas(C);
        guardarEstadoLocal();
      }
      return { ok: true };
    }
    if (ruta === "/api/mensajes/general") {
      const C = cuentas();
      const yo = cuentaActual();
      const textoMsj = texto(d, "texto", 500);
      if (!textoMsj) {
        return { ok: true, mensajes: C.mensajes.filter((m) => m.para === "TODOS").slice(-200) };
      }
      const ahora = horaActual();
      const id = generarId();
      const de = yo ? yo.cif : "INVITADO";
      const deNombre = yo ? yo.u.nombre : "Visitante UAM";
      const deTel = yo ? yo.u.telefono : "Tel-Visitante";
      const enviadosReal = enviarPaqueteReal({
        id, tipo: "mensaje", de, deNombre, deTel,
        para: "TODOS", texto: textoMsj, hora: ahora, ttl: 6, ruta: [deTel],
      });
      const m = {
        id, de, deNombre, para: "TODOS", texto: textoMsj, hora: ahora,
        estado: "entregado", ruta: [deTel, "Todos"], retardo: 0.5, entregado: ahora, viaCola: false,
      };
      C.mensajes.push(m);
      if (C.mensajes.length > 5000) C.mensajes.splice(0, C.mensajes.length - 5000);
      guardarCuentas(C);
      let enviadoNube = false;
      if (window.UNEXO_NUBE && navigator.onLine !== false) {
        enviadoNube = await window.UNEXO_NUBE.enviarMensaje({ ...m, ts: Date.now(), estado: "entregado" });
      }
      if (!enviadoNube) asegurarMeshActivo();
      return {
        ok: true,
        enviado: m,
        mensaje: enviadoNube
          ? "Enviado al Canal General."
          : enviadosReal > 0
            ? `Difundido por Mesh a ${enviadosReal} teléfono(s) cercano(s).`
            : "Difundido en el Canal General (Mesh activo).",
      };
    }
    if (ruta.startsWith("/api/yo/") || ruta.startsWith("/api/mensajes") || ruta.startsWith("/api/contactos") || ruta === "/api/algoritmo") {
      const yo = cuentaActual();
      if (!yo) return { _status: 401, ok: false, sesion: false, mensaje: "Inicia sesión con tu CIF y tu contraseña." };
      // Contactos por CIF: cada cuenta guarda su propia lista (la base de datos local del teléfono).
      const ficha = (C, cif) => {
        const u = C.usuarios[cif];
        const enLinea = !!(u && (u.real ? vecinosRealesCount() > 0 : S.red.buscarVertice(u.telefono)));
        return { cif, nombre: u.nombre, telefono: u.telefono, enLinea, lugar: null };
      };
      if (ruta === "/api/contactos/buscar" || ruta === "/api/contactos/agregar") {
        const C = cuentas();
        const cif = texto(d, "cif", 20).replace(/\s+/g, "").toUpperCase();
        let u = C.usuarios[cif];
        if (!u && cif && cif !== yo.cif && cif !== "ADMIN" && window.UNEXO_NUBE) {
          const nube = await window.UNEXO_NUBE.obtenerUsuario(cif);
          if (!nube.offline && nube.usuario && !nube.usuario.admin) {
            C.usuarios[cif] = {
              nombre: nube.usuario.nombre,
              telefono: nube.usuario.telefono,
              lugar: nube.usuario.lugar || "Edificio E",
              real: true,
            };
            guardarCuentas(C);
            u = C.usuarios[cif];
          }
        }
        if (!u || u.admin || cif === yo.cif) return { ok: false, mensaje: "No hay nadie con ese CIF en la nube ni cerca por la red Mesh." };
        C.contactos = C.contactos || {};
        const lista = C.contactos[yo.cif] || (C.contactos[yo.cif] = []);
        if (ruta === "/api/contactos/agregar") {
          if (!lista.includes(cif)) lista.push(cif);
          guardarCuentas(C);
          return { ok: true, contacto: ficha(C, cif), mensaje: `${u.nombre} está en tus contactos.` };
        }
        return { ok: true, contacto: ficha(C, cif), agregado: lista.includes(cif) };
      }
      if (ruta === "/api/yo/lugar") {
        const lugar = texto(d, "lugar", 60);
        if (!S.campus.buscarVertice(lugar)) return { ok: false, mensaje: `El lugar «${lugar}» no existe.` };
        const vecinos = conectarUsuario(yo.cif, lugar);
        const n = repartirCola();
        guardarEstadoLocal();
        actualizarPerfilMeshReal(yo.cif, { ...yo.u, lugar });
        if (window.UNEXO_NUBE) window.UNEXO_NUBE.actualizarLugar(yo.cif, lugar);
        return { ok: true, usuario: datosUsuario(yo.cif),
          mensaje: `Ahora estás en ${lugar}: ${vecinos.length} teléfono(s) a tu alcance.` + (n ? ` Salieron ${n} mensaje(s) que estaban en cola.` : "") };
      }
      if (ruta === "/api/mensajes") {
        sincronizarNubeEnSegundoPlano(yo.cif);
        const C = cuentas();
        const mios0 = C.mensajes.filter((m) => m.de === yo.cif || m.para === yo.cif);
        const cifs = ((C.contactos || {})[yo.cif] || []).slice();
        for (const m of mios0) {
          const otro = m.de === yo.cif ? m.para : m.de;
          if (otro !== "TODOS" && !cifs.includes(otro)) cifs.push(otro);
        }
        const contactos = cifs.filter((c) => C.usuarios[c] && !C.usuarios[c].admin).map((c) => ficha(C, c));
        const reales = vecinosRealesCount();
        contactos.unshift({
          cif: "TODOS", nombre: "Canal General · Campus", telefono: "Mesh-Todos",
          enLinea: reales > 0 || contactos.some((c) => c.enLinea),
          lugar: reales > 0 ? `${reales} teléfono(s) cercanos por Mesh` : "Difusión Mesh (sin internet)",
          grupo: true,
        });
        const mios = C.mensajes.filter((m) => m.de === yo.cif || m.para === yo.cif || m.para === "TODOS").slice(-300);
        return { ok: true, yo: datosUsuario(yo.cif), contactos, mensajes: mios, modoLocal: true };
      }
      if (ruta === "/api/mensajes/enviar") {
        const C = cuentas();
        const para = texto(d, "para", 15).toUpperCase();
        const textoMsj = typeof d.texto === "string" ? d.texto.trim() : "";
        const esTodos = para === "TODOS";
        if ((!esTodos && !C.usuarios[para]) || para === yo.cif) return { ok: false, mensaje: "Elige a quién enviarle el mensaje." };
        if (!textoMsj || textoMsj.length > 500) return { ok: false, mensaje: "Escribe entre 1 y 500 caracteres." };
        const clave = d.idempotencia;
        if (clave != null && (typeof clave !== "string" || !/^[A-Za-z0-9_-]{16,64}$/.test(clave))) {
          return { ok: false, mensaje: "Identificador de envío inválido.", _status: 400 };
        }
        const anterior = clave && C.mensajes.find((m) => m.de === yo.cif && m.idempotencia === clave);
        if (anterior) {
          if (anterior.para !== para || anterior.texto !== textoMsj) {
            return { ok: false, mensaje: "El identificador corresponde a otro envío.", _status: 409 };
          }
          return { ok: true, enviado: anterior, mensaje: "Mensaje registrado." };
        }
        const ahora = horaActual();
        const id = generarId();
        const dest = esTodos ? { telefono: "Todos" } : C.usuarios[para];
        const [rSim, retardoSim] = esTodos ? [[], Infinity] : rutaMasCorta(S.red, yo.u.telefono, dest.telefono);
        // En red Mesh real (Android) para mensajes 1-a-1, queda en custodia ("en cola")
        // hasta que regrese el ACK de entrega del destinatario final (y purgue las copias intermedias).
        const esMeshReal = !!(window.UnexuamNativo && typeof window.UnexuamNativo.enviarPaqueteMesh === "function");
        const esLocal = !esTodos && C.usuarios[para] && !C.usuarios[para].real;
        let entregadoNube = false;
        if (window.UNEXO_NUBE && navigator.onLine !== false) {
          entregadoNube = await window.UNEXO_NUBE.enviarMensaje({
            id, de: yo.cif, deNombre: yo.u.nombre, para, texto: textoMsj,
            hora: ahora, ts: Date.now(), estado: "entregado",
          });
        }
        const entregadoInmediato = entregadoNube || esLocal || (!esMeshReal && !esTodos && rSim.length > 0);
        const rutaFinal = entregadoInmediato ? (rSim.length ? rSim : [yo.u.telefono, dest.telefono]) : [];
        const retFinal = entregadoInmediato && rSim.length ? num(retardoSim) : null;
        const m = { id, idempotencia: clave, de: yo.cif, deNombre: yo.u.nombre, para, texto: textoMsj, hora: ahora,
          estado: entregadoInmediato ? "entregado" : "en cola", ruta: rutaFinal, retardo: retFinal,
          entregado: entregadoInmediato ? ahora : null, viaCola: false };
        C.mensajes.push(m);
        if (C.mensajes.length > 5000) C.mensajes.splice(0, C.mensajes.length - 5000);
        guardarCuentas(C);
        let enviadosReal = 0;
        if (!entregadoInmediato) {
          asegurarMeshActivo();
          enviadosReal = enviarPaqueteReal({
            id, tipo: "mensaje", de: yo.cif, deNombre: yo.u.nombre, deTel: yo.u.telefono,
            para, texto: textoMsj, hora: ahora, ttl: 6, ruta: [yo.u.telefono],
          });
          if (enviadosReal > 0) {
            m.estado = "transmitiendo";
            guardarCuentas(C);
          }
        }
        registrar(`Mensaje ${yo.u.telefono} → ${dest.telefono}: ${m.estado}.`, entregadoInmediato ? "ok" : "info");
        guardarEstadoLocal();
        let msgTxt = "Sin internet: guardado en cola Mesh hasta encontrar un teléfono cercano.";
        if (enviadosReal > 0) msgTxt = "Sin internet: enviado por red Mesh cercana.";
        if (entregadoInmediato) msgTxt = entregadoNube ? "Mensaje enviado." : "Mensaje entregado.";
        return { ok: true, enviado: m, mensaje: msgTxt };
      }
      if (ruta === "/api/mensajes/alerta") {
        const C = cuentas();
        const ttl = numero(d, "ttl", 1, 10);
        if (ttl === null) return { ok: false, mensaje: "El alcance debe estar entre 1 y 10 saltos." };
        const textoAlerta = texto(d, "texto", 200) || "¡Emergencia! Necesito ayuda.";
        const ttlInt = Math.trunc(ttl);
        const alcanzados = propagarAlerta(S.red, yo.u.telefono, ttlInt);
        const ahora = horaActual();
        const idAl = generarId();
        const envAl = enviarPaqueteReal({
          id: idAl, tipo: "mensaje", de: yo.cif, deNombre: yo.u.nombre, deTel: yo.u.telefono,
          para: "TODOS", texto: `SOS · ${textoAlerta} · desde ${yo.u.lugar}`, hora: ahora, ttl: ttlInt, ruta: [yo.u.telefono],
        });
        C.mensajes.push({
          id: idAl, de: yo.cif, deNombre: yo.u.nombre, para: "TODOS",
          texto: `SOS · ${textoAlerta} · desde ${yo.u.lugar}`, hora: ahora,
          estado: envAl > 0 ? "transmitiendo" : "en cola", ruta: [],
          retardo: null, entregado: null, viaCola: false,
        });
        guardarCuentas(C);
        S.ultimaAlerta = { origen: yo.u.telefono, ttl: ttlInt, hora: ahora, alcanzados };
        const mensaje = envAl > 0 ? "Transmisión iniciada. Recepción sin confirmar." : "Alerta en cola.";
        registrar(mensaje, "info");
        guardarEstadoLocal();
        return {
          ok: true,
          alcanzados,
          avisados: [],
          mensaje,
        };
      }
      if (ruta === "/api/algoritmo") {
        const origen = texto(d, "origen", 60) || String((searchParams && searchParams.get("origen")) || "C-101").trim().slice(0, 60);
        if (!S.campus.buscarVertice(origen)) return { ok: false, mensaje: `El lugar «${origen}» no existe.` };
        const res = dijkstraPasos(S.campus, origen, S.zonas);
        for (const p of res[0]) {
          p.distancia = num(p.distancia);
          for (const v of p.vecinos) { v.peso = num(v.peso); v.antes = num(v.antes); v.nueva = num(v.nueva); }
        }
        return { ok: true, origen, pasos: res[0], ruta: res[1], tiempo: num(res[2]), grafo: serializar(S.campus), zonasSeguras: S.zonas };
      }
    }

    return { _status: 404, ...responder(false, `Ruta desconocida: ${ruta}`) };
  }

  // Interceptar únicamente las llamadas a /api/*
  window.fetch = async function (input, init) {
    const url = typeof input === "string" ? input : input && input.url ? input.url : "";
    let pathname = url;
    let searchParams = null;
    try {
      const parsed = new URL(url, window.location.origin);
      pathname = parsed.pathname;
      searchParams = parsed.searchParams;
    } catch (_) {}

    if (pathname.startsWith("/api/")) {
      await asegurarInicializado();
      let cuerpo = {};
      if (init && typeof init.body === "string" && init.body) {
        try {
          const parsedBody = JSON.parse(init.body);
          if (parsedBody && typeof parsedBody === "object" && !Array.isArray(parsedBody)) cuerpo = parsedBody;
        } catch (_) {}
      }
      let res;
      try {
        res = await despacharApi(pathname, cuerpo, searchParams);
      } catch (error) {
        console.warn("[UNEXUAM] Operación local incompleta", error);
        res = { ok: false, mensaje: "No se pudo completar la operación local.", _status: 500 };
      }
      const status = res && res._status ? res._status : 200;
      if (res && "_status" in res) delete res._status;
      return new Response(JSON.stringify(res), {
        status,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      });
    }

    return fetchOriginal(input, init);
  };

  // --- Puente con MeshNativa (Nearby Connections: Bluetooth + Wi-Fi Direct reales) ---
  function iniciarMeshReal(cif, u) {
    try {
      if (window.UnexuamNativo && typeof window.UnexuamNativo.iniciarMesh === "function") {
        window.UnexuamNativo.iniciarMesh(JSON.stringify({
          cif, nombre: u.nombre, telefono: u.telefono, lugar: u.lugar || "Edificio E",
        }));
      }
    } catch (_) {}
  }

  function actualizarPerfilMeshReal(cif, u) {
    try {
      if (window.UnexuamNativo && typeof window.UnexuamNativo.actualizarPerfilMesh === "function") {
        window.UnexuamNativo.actualizarPerfilMesh(JSON.stringify({
          cif, nombre: u.nombre, telefono: u.telefono, lugar: u.lugar || "Edificio E",
        }));
      }
    } catch (_) {}
  }

  function detenerMeshReal() {
    try {
      if (window.UnexuamNativo && typeof window.UnexuamNativo.detenerMesh === "function") {
        window.UnexuamNativo.detenerMesh();
      }
    } catch (_) {}
  }

  function vecinosRealesCount() {
    try {
      if (window.UnexuamNativo && typeof window.UnexuamNativo.vecinosMeshReales === "function") {
        const arr = JSON.parse(window.UnexuamNativo.vecinosMeshReales() || "[]");
        return Array.isArray(arr) ? arr.length : 0;
      }
    } catch (_) {}
    return 0;
  }

  function enviarPaqueteReal(paquete) {
    try {
      if (window.UnexuamNativo && typeof window.UnexuamNativo.enviarPaqueteMesh === "function") {
        return Number(window.UnexuamNativo.enviarPaqueteMesh(JSON.stringify(paquete))) || 0;
      }
    } catch (_) {}
    return 0;
  }

  function vaciarColaReal() {
    const yo = cuentaActual();
    if (!yo) return;
    const C = cuentas();
    let cambio = false;
    for (const m of C.mensajes) {
      if (m.estado === "en cola" && m.de === yo.cif) {
        const enviados = enviarPaqueteReal({
          id: m.id, tipo: "mensaje", de: yo.cif, deNombre: yo.u.nombre, deTel: yo.u.telefono,
          para: m.para, texto: m.texto, hora: m.hora, ttl: 6, ruta: [yo.u.telefono],
        });
        if (enviados > 0) {
          m.estado = "transmitiendo";
          m.viaCola = true;
          cambio = true;
        }
      }
    }
    if (cambio) {
      guardarCuentas(C);
      registrar("Transmisión iniciada para mensajes en cola.", "ok");
      guardarEstadoLocal();
    }
  }

  window.__unexuamMeshEvento = async function (raw) {
    try {
      await asegurarInicializado();
      const ev = typeof raw === "string" ? JSON.parse(raw) : raw;
      if (!ev || !ev.tipo) return;
      const yo = cuentaActual();
      const C = cuentas();

      if (ev.tipo === "estado") {
        window.dispatchEvent(new CustomEvent("unexuam-mesh-update", { detail: ev }));
        return;
      }

      if ((ev.tipo === "conectado" || ev.tipo === "perfil") && ev.peer) {
        const p = ev.peer;
        const cif = String(p.cif || "").trim().toUpperCase().slice(0, 15);
        if (!cif) return;
        if (yo && cif === yo.cif) {
          registrar(`Aviso: otro teléfono cercano usa el mismo CIF (${cif}).`, "alerta");
          window.dispatchEvent(new CustomEvent("unexuam-cif-duplicado", { detail: { cif } }));
          return;
        }
        const nombre = String(p.nombre || "Teléfono cercano").slice(0, 40);
        const telefono = String(p.telefono || `Tel-${cif}`).slice(0, 30);
        const lugar = String(p.lugar || "Cercano (Bluetooth)").slice(0, 60);
        const previo = C.usuarios[cif];
        if (!previo || previo.real) C.usuarios[cif] = { ...(previo || {}), nombre, telefono, lugar, real: true };   // nunca pisa cuentas locales
        guardarCuentas(C);
        S.red.insertarVertice(telefono);
        if (yo) {
          S.red.insertarVertice(yo.u.telefono);
          S.red.insertarArista(yo.u.telefono, telefono, 0.5);
          S.red.insertarArista(telefono, yo.u.telefono, 0.5);
        }
        if (ev.tipo === "conectado") {
          registrar(`Teléfono cercano conectado por Mesh real: ${nombre} (${telefono}).`, "ok");
          vaciarColaReal();
        }
        guardarEstadoLocal();
        window.dispatchEvent(new CustomEvent("unexuam-mesh-update", { detail: ev }));
        return;
      }

      if (ev.tipo === "desconectado" && ev.peer) {
        const tel = ev.peer.telefono;
        if (tel) S.red.eliminarVertice(tel);
        registrar(`Teléfono desconectado de Mesh real: ${ev.peer.nombre || tel}.`);
        guardarEstadoLocal();
        window.dispatchEvent(new CustomEvent("unexuam-mesh-update", { detail: ev }));
        return;
      }

      if (ev.tipo === "ack" && ev.ack) {
        const ackId = String(ev.ack.ackDe || "");
        if (!ackId) return;
        const m = C.mensajes.find((x) => x.id === ackId);
        if (!yo || ev.ack.para !== yo.cif) return;
        if (m && m.de === yo.cif && m.para === ev.ack.de && m.estado !== "entregado") {
          m.estado = "entregado";
          if (Array.isArray(ev.ack.rutaEntrega) && ev.ack.rutaEntrega.length) m.ruta = ev.ack.rutaEntrega;
          m.retardo = 0.5;
          m.entregado = horaActual();
          m.viaCola = true;
          guardarCuentas(C);
          registrar(`Acuse de entrega recibido (ACK): copias en custodia eliminadas.`, "ok");
          guardarEstadoLocal();
          window.dispatchEvent(new CustomEvent("unexuam-mesh-update", { detail: ev }));
        }
        window.UnexuamNativo?.confirmarEntradaMesh?.(ev.ack.id);
        return;
      }

      if (ev.tipo === "paquete" && ev.paquete) {
        const pq = ev.paquete;
        const de = String(pq.de || "").trim().toUpperCase().slice(0, 15);
        const para = String(pq.para || "").trim().toUpperCase().slice(0, 15);
        if (!de || !pq.texto) return;
        let recalcularRuta = false;
        // Si es un incidente de bloqueo recibido por Mesh, aplicarlo directo al grafo del campus
        if (pq.tipo === "incidente" && pq.accion === "bloquear" && pq.origen && pq.destino) {
          const pares = pq.ambos !== false ? [[pq.origen, pq.destino], [pq.destino, pq.origen]] : [[pq.origen, pq.destino]];
          for (const [a, b] of pares) {
            const va = S.campus.vertexs.find((v) => v.nombre === a);
            const arista = va ? va.neig.find(([w]) => w.nombre === b) : null;
            if (arista && S.campus.eliminarArista(a, b)) {
              S.bloqueados.push({ origen: a, destino: b, peso: num(arista[1]) });
              recalcularRuta = true;
            }
          }
          if (recalcularRuta) {
            invalidarCacheRutas();
            registrar(`Bloqueo recibido por Mesh: ${pq.origen} y ${pq.destino}.`, "error");
            guardarEstadoLocal();
          }
        } else if (pq.tipo === "incidente" && pq.accion === "emergencia") {
          S.emergencia = {
            id: pq.id || generarId(),
            tipo: String(pq.emergenciaTipo || "general"),
            titulo: String(pq.titulo || "Emergencia en el campus"),
            texto: String(pq.texto || "").slice(0, 200),
            hora: String(pq.hora || horaActual()).slice(0, 8),
          };
          recalcularRuta = true;
          guardarEstadoLocal();
        } else if (pq.tipo === "incidente" && pq.accion === "finalizar") {
          if (!pq.incidente || pq.incidente !== S.emergencia?.id) return;
          S.ultimaAlerta = null;
          S.emergencia = null;
          recalcularRuta = true;
          registrar("Emergencia finalizada por el administrador (vía Mesh).", "ok");
          guardarEstadoLocal();
          window.UnexuamNativo?.detenerAlarmaEmergencia?.();
        }
        if (recalcularRuta || /^SOS\b/.test(String(pq.texto))) {
          try { window.UnexuamNativo && window.UnexuamNativo.vibrarAlerta && window.UnexuamNativo.vibrarAlerta(); } catch (_) {}
        }
        if (!C.usuarios[de]) {
          C.usuarios[de] = {
            nombre: String(pq.deNombre || de).slice(0, 40),
            telefono: String(pq.deTel || `Tel-${de}`).slice(0, 30),
            lugar: "Cercano (Bluetooth)",
            real: true,
          };
        }
        if (yo && (para === yo.cif || para === "TODOS")) {
          if (!C.mensajes.some((x) => x.id === pq.id)) {
            const ahora = horaActual();
            C.mensajes.push({
              id: pq.id || generarId(),
              de, deNombre: C.usuarios[de].nombre, para, texto: String(pq.texto).slice(0, 500),
              hora: String(pq.hora || ahora).slice(0, 8), estado: "entregado",
              ruta: Array.isArray(pq.ruta) ? pq.ruta : [],
              retardo: 0.5, entregado: ahora, viaCola: false, real: true,
            });
            if (C.mensajes.length > 5000) C.mensajes.splice(0, C.mensajes.length - 5000);
            guardarCuentas(C);
            registrar(`Mensaje real recibido de ${C.usuarios[de].nombre} por Mesh.`, "ok");
            guardarEstadoLocal();
          }
          if (para === yo.cif && pq.id && window.UnexuamNativo?.confirmarEntradaMesh) {
            window.UnexuamNativo.confirmarEntradaMesh(pq.id);
          }
          window.dispatchEvent(new CustomEvent("unexuam-mesh-update", { detail: { ...ev, recalcularRuta } }));
        }
      }
    } catch (err) {
      console.warn("[UNEXUAM] Error procesando evento Mesh:", err);
    }
  };

  let meshIniciado = false;
  function asegurarMeshActivo() {
    if (!window.UnexuamNativo || typeof window.UnexuamNativo.iniciarMesh !== "function") return;
    if (meshIniciado) return;
    const yo = cuentaActual();
    if (yo) {
      iniciarMeshReal(yo.cif, yo.u);
      meshIniciado = true;
      return;
    }
    let lugarInv = "Edificio E";
    try {
      const guardado = localStorage.getItem("mi-lugar");
      if (guardado) lugarInv = JSON.parse(guardado) || "Edificio E";
    } catch (_) {}
    iniciarMeshReal("INVITADO", { nombre: "Visitante UAM", telefono: "Tel-Visitante", lugar: lugarInv });
    meshIniciado = true;
  }

  async function vaciarColaNube() {
    if (!window.UNEXO_NUBE || navigator.onLine === false) return 0;
    const C = cuentas();
    let enviados = 0;
    let cambio = false;
    for (const m of C.mensajes) {
      if (m.estado === "en cola" || m.estado === "transmitiendo") {
        const ok = await window.UNEXO_NUBE.enviarMensaje({ ...m, ts: Date.now(), estado: "entregado" });
        if (ok) {
          m.estado = "entregado";
          m.entregado = horaActual();
          enviados += 1;
          cambio = true;
        }
      }
    }
    if (cambio) {
      guardarCuentas(C);
      window.dispatchEvent(new CustomEvent("unexuam-mesh-update", { detail: { tipo: "estado" } }));
    }
    return enviados;
  }

  let ultSyncNubeMs = 0;
  let syncNubeEnCurso = false;
  function sincronizarNubeEnSegundoPlano(cif) {
    if (!window.UNEXO_NUBE || navigator.onLine === false || syncNubeEnCurso) return;
    const ahoraMs = Date.now();
    if (ahoraMs - ultSyncNubeMs < 4000) return;
    ultSyncNubeMs = ahoraMs;
    syncNubeEnCurso = true;
    (async () => {
      try {
        const subidos = await vaciarColaNube();
        const nubeMsj = await window.UNEXO_NUBE.listarMensajes(60);
        let nuevos = 0;
        if (Array.isArray(nubeMsj) && nubeMsj.length) {
          const C = cuentas();
          const ids = new Set(C.mensajes.map((m) => String(m.id)));
          for (const nm of nubeMsj) {
            const mid = String(nm._id || "");
            if (!mid || ids.has(mid)) continue;
            if (nm.de === cif || nm.para === cif || nm.para === "TODOS") {
              C.mensajes.push({
                id: mid, de: nm.de, deNombre: nm.deNombre, para: nm.para,
                texto: nm.texto, hora: nm.hora, estado: nm.estado || "entregado",
                ruta: [], retardo: null, entregado: nm.hora, viaCola: false,
              });
              ids.add(mid);
              nuevos += 1;
            }
          }
          if (nuevos > 0) guardarCuentas(C);
        }
        if (nuevos > 0 && subidos === 0) {
          window.dispatchEvent(new CustomEvent("unexuam-mesh-update", { detail: { tipo: "estado" } }));
        }
      } finally {
        syncNubeEnCurso = false;
      }
    })();
  }

  let ultCampusActualizado = 0;
  let ultSyncCampusMs = 0;
  let syncCampusEnCurso = false;

  function publicarCampusNube() {
    if (!window.UNEXO_NUBE || navigator.onLine === false) return;
    const ts = Date.now();
    ultCampusActualizado = ts;
    window.UNEXO_NUBE.guardarCampusEstado({
      bloqueados: S.bloqueados,
      congestion: S.congestion,
      emergencia: S.emergencia || null,
      actualizado: ts,
    });
  }

  function reconstruirCampusDesdeNube(bloqList, congMap) {
    S.campus = construirGrafo(SEED.campus);
    S.zonas = [...SEED.zonas];
    S.bloqueados = [];
    S.congestion = {};
    for (const [lug, fac] of Object.entries(congMap || {})) {
      const f = Number(fac);
      if (f > 0 && aplicarAlerta(S.campus, lug, f)) {
        S.congestion[lug] = f;
      }
    }
    for (const b of bloqList || []) {
      if (!b || !b.origen || !b.destino) continue;
      const va = S.campus.vertexs.find((v) => v.nombre === b.origen);
      const ar = va ? va.neig.find(([w]) => w.nombre === b.destino) : null;
      if (ar && S.campus.eliminarArista(b.origen, b.destino)) {
        S.bloqueados.push({ origen: b.origen, destino: b.destino, peso: b.peso ?? num(ar[1]) });
      }
    }
    if (!S.bloqueados.length && !Object.keys(S.congestion).length) cargarCacheBase();
    else invalidarCacheRutas();
  }

  function sincronizarCampusNube(forzar = false) {
    if (!window.UNEXO_NUBE || navigator.onLine === false || syncCampusEnCurso) return;
    const ahoraMs = Date.now();
    if (!forzar && ahoraMs - ultSyncCampusMs < 4000) return;
    ultSyncCampusMs = ahoraMs;
    syncCampusEnCurso = true;
    (async () => {
      try {
        const doc = await window.UNEXO_NUBE.leerCampusEstado();
        if (!doc || !doc.actualizado || doc.actualizado <= ultCampusActualizado) return;
        ultCampusActualizado = doc.actualizado;

        const bloqNube = Array.isArray(doc.bloqueados) ? doc.bloqueados : [];
        const congNube = (doc.congestion && typeof doc.congestion === "object") ? doc.congestion : {};
        const emNube = (doc.emergencia && typeof doc.emergencia === "object") ? doc.emergencia : null;

        const cambioGrafo = JSON.stringify(bloqNube) !== JSON.stringify(S.bloqueados)
          || JSON.stringify(congNube) !== JSON.stringify(S.congestion);
        const cambioEm = JSON.stringify(emNube) !== JSON.stringify(S.emergencia || null);

        if (!cambioGrafo && !cambioEm) return;
        if (cambioGrafo) reconstruirCampusDesdeNube(bloqNube, congNube);
        S.emergencia = emNube;
        guardarEstadoLocal();
        if (window.refrescarEstado) window.refrescarEstado();
        window.dispatchEvent(new CustomEvent("unexuam-mesh-update", {
          detail: { tipo: "estado", recalcularRuta: cambioGrafo },
        }));
      } finally {
        syncCampusEnCurso = false;
      }
    })();
  }

  window.addEventListener("offline", () => {
    meshIniciado = false;
    asegurarMeshActivo();
  });
  window.addEventListener("online", () => {
    vaciarColaNube();
    sincronizarCampusNube(true);
  });
  setTimeout(() => {
    asegurarMeshActivo();
    if (navigator.onLine !== false) {
      vaciarColaNube();
      sincronizarCampusNube(true);
    }
  }, 800);
  setInterval(() => {
    if (navigator.onLine === false) {
      meshIniciado = false;
      asegurarMeshActivo();
    } else {
      sincronizarCampusNube(false);
    }
  }, 6000);
})();
