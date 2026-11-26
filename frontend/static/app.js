/* Unexuam · lógica de la interfaz (JS sin librerías, funciona sin internet).
 * El servidor guarda los dos grafos; aquí solo se dibujan y se llaman los endpoints. */
"use strict";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const FLECHA = "→";
const NS = "http://www.w3.org/2000/svg";
const IMG = {  // iconos de la interfaz (frontend/static/img)
  x: "/static/img/logo-x.png",
  fuego: "/static/img/ico-fuego.png",
  sinSenal: "/static/img/ico-sin-senal.png",
};

let E = null;                 // último estado recibido del servidor
let firma = "";               // para saber si el estado cambió en el sondeo
let vista = "inicio";
let ttl = 3;
let factor = 2;
let grafoAdmin = "mesh";
let rutaAnterior = null;      // {ruta, tiempo} antes del último incidente
let animando = false;
let alertaVista = null;       // clave de la última alerta animada
let alcanceMostrado = null;   // {nombre: salto} que se ve en el dibujo de la red
let viaMostrada = {};         // {nombre: padre}
let seleccion = null;         // arista elegida en el campus: [origen, destino]
const mover = { mesh: false, campus: false };

/* ------------------------------------------------------------------ util */

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
const fmt = x => (x === null || x === undefined ? "–" : (Math.round(x * 100) / 100).toLocaleString("es"));
const clave = (o, d) => o + FLECHA + d;

function guardar(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* sin almacenamiento */ } }
function leer(k, porDefecto) {
  try { const v = JSON.parse(localStorage.getItem(k)); return v ?? porDefecto; } catch (e) { return porDefecto; }
}

let toastTimer = 0;
function aviso(msg, ok = true) {
  if (!msg) return;
  const t = $("#toast");
  t.textContent = msg;
  t.className = "toast" + (ok ? "" : " error");
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, ok ? 3200 : 4500);
}
window.avisar = aviso;

function marcarConexion(ok) {
  const chip = $(".chip-offgrid");
  if (!chip) return;
  if (window.__UNEXUAM_OFFLINE__) ok = true;
  chip.classList.toggle("caido", !ok);
  const txt = $("#chip-offgrid-txt");
  if (txt && !ok) txt.textContent = "Sin conexión";
  else if (txt && ok && txt.textContent === "Sin conexión") txt.textContent = "Sin internet";
}

async function cambiarEmergencia(ruta, datos) {
  const nube = window.UNEXO_NUBE;
  const publicarDesdeWeb = !window.__UNEXUAM_OFFLINE__ && nube?.tieneAuthAdmin();
  const resultado = await api(ruta, { ...datos, publicarDesdeWeb: Boolean(publicarDesdeWeb) });
  if (!resultado.ok) return resultado;

  if (nube && typeof nube.guardarCampusEstado === "function") {
    const estado = resultado.estado || E;
    if (estado && estado.campus) {
      try {
        resultado.nube = await nube.guardarCampusEstado({
          bloqueados: estado.campus.bloqueados || [],
          congestion: estado.campus.congestion || {},
          emergencia: estado.emergencia || null,
        });
      } catch (_) {}
    }
  }
  return resultado;
}

async function api(ruta, cuerpo) {
  try {
    const r = await fetch(ruta, cuerpo === undefined ? {} : {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cuerpo),
    });
    if (r.status === 401) {
      if (!document.body.classList.contains("modo-invitado") && window.mostrarLogin) window.mostrarLogin();
      return { ok: false };
    }
    if (r.status === 403 || r.status === 409) {
      const j = await r.json().catch(() => ({ ok: false, mensaje: "No se pudo aplicar el cambio." }));
      marcarConexion(true);
      if (cuerpo !== undefined) aviso(j.mensaje, false);
      return j;
    }
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = await r.json();
    marcarConexion(!j.offline);
    if (j.estado) {
      mapaDescargado = j.offline ? j.capturado : null;
      aplicarEstado(j.estado);
    }
    if (cuerpo !== undefined) aviso(j.mensaje, j.ok);
    return j;
  } catch (e) {
    marcarConexion(false);
    if (cuerpo !== undefined) aviso("Sin conexión con el servidor local.", false);
    return { ok: false };
  }
}

/* ------------------------------------------------------------- layout */

const W = 360;
function limpiarPos(obj) {
  const out = {};
  if (obj && typeof obj === "object") {
    for (const [k, p] of Object.entries(obj)) {
      if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) out[k] = { x: p.x, y: p.y };
    }
  }
  return out;
}
const POS = { mesh: limpiarPos(leer("pos-mesh", {})), campus: limpiarPos(leer("pos-campus", {})) };

/* Campus: capas según cuántos saltos faltan para llegar a una zona segura
 * (zonas abajo, como un plano que "fluye" hacia la salida). */
function layoutCapas(g, zonas) {
  const ent = new Map(g.vertices.map(v => [v, []]));
  const vec = new Map(g.vertices.map(v => [v, new Set()]));
  for (const a of g.aristas) {
    ent.get(a.destino)?.push(a.origen);
    vec.get(a.origen)?.add(a.destino); vec.get(a.destino)?.add(a.origen);
  }
  const nivel = new Map(), cola = [];
  for (const z of zonas) if (ent.has(z)) { nivel.set(z, 0); cola.push(z); }
  while (cola.length) {
    const v = cola.shift();
    for (const u of ent.get(v)) if (!nivel.has(u)) { nivel.set(u, nivel.get(v) + 1); cola.push(u); }
  }
  let max = 0; nivel.forEach(l => { max = Math.max(max, l); });
  for (const v of g.vertices) if (!nivel.has(v)) nivel.set(v, max + 1);
  max = Math.max(0, ...nivel.values());

  const capas = Array.from({ length: max + 1 }, () => []);
  for (const v of g.vertices) capas[nivel.get(v)].push(v);
  const P = {}, pad = 34, H = Math.max(300, 2 * pad + max * 92);
  capas.forEach((capa, l) => {
    if (l > 0) {  // ordenar por baricentro de los vecinos de la capa de abajo
      const bc = v => {
        const xs = [...vec.get(v)].filter(u => P[u] && nivel.get(u) < l).map(u => P[u].x);
        return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : W / 2;
      };
      capa.sort((a, b) => bc(a) - bc(b));
    }
    const y = H - pad - (max ? (l * (H - 2 * pad)) / max : 0);
    capa.forEach((v, i) => {
      const zig = capa.length > 3 ? (i % 2 ? 13 : -13) : 0;
      P[v] = { x: pad + ((i + 0.5) * (W - 2 * pad)) / capa.length, y: y + zig };
    });
  });
  return P;
}

/* Red Mesh: dibujo por fuerzas (Fruchterman-Reingold), determinista. */
function layoutFuerzas(g) {
  const n = g.vertices.length, H = 340, P = {};
  g.vertices.forEach((v, i) => {
    const a = (2 * Math.PI * i) / Math.max(n, 1) - Math.PI / 2;
    P[v] = { x: W / 2 + Math.cos(a) * W * 0.33, y: H / 2 + Math.sin(a) * H * 0.33 };
  });
  const pares = new Set();
  for (const a of g.aristas) if (P[a.origen] && P[a.destino]) pares.add([a.origen, a.destino].sort().join("\u0000"));
  const k = Math.sqrt((W * H) / Math.max(n, 1)) * 0.8;
  let t = W / 10;
  for (let it = 0; it < 320; it++) {
    const d = {}; g.vertices.forEach(v => { d[v] = { x: 0, y: 0 }; });
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const a = g.vertices[i], b = g.vertices[j];
      let dx = P[a].x - P[b].x, dy = P[a].y - P[b].y, L = Math.hypot(dx, dy) || 0.01;
      const f = (k * k) / L;
      d[a].x += (dx / L) * f; d[a].y += (dy / L) * f; d[b].x -= (dx / L) * f; d[b].y -= (dy / L) * f;
    }
    for (const p of pares) {
      const [a, b] = p.split("\u0000");
      let dx = P[a].x - P[b].x, dy = P[a].y - P[b].y, L = Math.hypot(dx, dy) || 0.01;
      const f = (L * L) / k;
      d[a].x -= (dx / L) * f; d[a].y -= (dy / L) * f; d[b].x += (dx / L) * f; d[b].y += (dy / L) * f;
    }
    for (const v of g.vertices) {
      d[v].x += (W / 2 - P[v].x) * 0.05; d[v].y += (H / 2 - P[v].y) * 0.05;  // gravedad suave
      const L = Math.hypot(d[v].x, d[v].y) || 0.01, m = Math.min(L, t);
      P[v].x += (d[v].x / L) * m;
      P[v].y += (d[v].y / L) * m;
    }
    t *= 0.985;
  }
  // encajar el resultado en la caja (sin amontonar nodos contra los bordes)
  const xs = g.vertices.map(v => P[v].x), ys = g.vertices.map(v => P[v].y), pad = 34;
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  for (const v of g.vertices) {
    P[v].x = x1 > x0 ? pad + ((P[v].x - x0) * (W - 2 * pad)) / (x1 - x0) : W / 2;
    P[v].y = y1 > y0 ? pad + ((P[v].y - y0) * (H - 2 * pad)) / (y1 - y0) : H / 2;
  }
  return P;
}

/* Lugar libre para un vértice nuevo: el punto de la cuadrícula más lejos de los demás. */
function hueco(P) {
  const ps = Object.values(P);
  const maxY = Math.max(300, ...ps.map(p => p.y + 30));
  let mejor = { x: W / 2, y: 40 }, md = -1;
  for (let y = 30; y <= maxY + 60; y += 24) for (let x = 30; x <= W - 30; x += 24) {
    const dmin = ps.reduce((m, p) => Math.min(m, Math.hypot(p.x - x, p.y - y)), Infinity);
    const val = Math.min(dmin, 90) - (y > maxY ? 30 : 0);  // preferir no estirar el dibujo
    if (val > md) { md = val; mejor = { x, y }; }
  }
  return mejor;
}

function posiciones(cual, g) {
  let P = POS[cual];
  const conocidos = g.vertices.filter(v => P[v]).length;
  if (g.vertices.length && conocidos === 0) {
    P = POS[cual] = cual === "campus" ? layoutCapas(g, E.campus.zonasSeguras) : layoutFuerzas(g);
  }
  for (const v of g.vertices) if (!P[v]) P[v] = hueco(Object.fromEntries(g.vertices.filter(u => P[u]).map(u => [u, P[u]])));
  guardar("pos-" + cual, P);
  return P;
}

function reordenar(cual) {
  POS[cual] = {};
  guardar("pos-" + cual, {});
}

/* ------------------------------------------------------------- dibujo */

let R = 15;   // radio del nodo; cada dibujo puede pedir otro con o.r

function etiqueta(nombre) {
  // hasta 2 líneas de ~12 caracteres
  const palabras = nombre.split(/\s+/), lineas = [""];
  for (const p of palabras) {
    const act = lineas[lineas.length - 1];
    if (act && (act + " " + p).length > 12 && lineas.length < 2) lineas.push(p);
    else lineas[lineas.length - 1] = act ? act + " " + p : p;
  }
  return lineas.map(l => (l.length > 15 ? l.slice(0, 14) + "…" : l));
}

function geometria(A, B, curva) {
  const dx = B.x - A.x, dy = B.y - A.y, L = Math.hypot(dx, dy) || 1;
  const nx = -dy / L, ny = dx / L, off = curva ? Math.min(18, L * 0.18) : 0;
  const C = { x: (A.x + B.x) / 2 + nx * off, y: (A.y + B.y) / 2 + ny * off };
  const recorta = (P, Q, r) => {
    const ex = Q.x - P.x, ey = Q.y - P.y, l = Math.hypot(ex, ey) || 1;
    return { x: P.x + (ex / l) * r, y: P.y + (ey / l) * r };
  };
  const s = recorta(A, C, R + 1), e = recorta(B, C, R + 2);
  const m = { x: 0.25 * s.x + 0.5 * C.x + 0.25 * e.x, y: 0.25 * s.y + 0.5 * C.y + 0.25 * e.y };
  // la flecha: triángulo en "e" apuntando desde C
  const ux = e.x - C.x, uy = e.y - C.y, ul = Math.hypot(ux, uy) || 1, fx = ux / ul, fy = uy / ul;
  const t = 7, w = 4;
  const flecha = `M${e.x},${e.y} L${e.x - fx * t + -fy * w},${e.y - fy * t + fx * w} L${e.x - fx * t - -fy * w},${e.y - fy * t - fx * w}Z`;
  const fin = { x: e.x - fx * (t - 1), y: e.y - fy * (t - 1) };
  return { d: `M${s.x},${s.y} Q${C.x},${C.y} ${fin.x},${fin.y}`, m, flecha };
}

/**
 * Dibuja un grafo dirigido y ponderado en un <svg>.
 * o.claseArista(a) -> "ruta" | "sel" | ...   o.claseNodo(v) -> string
 * o.fantasmas: aristas que ya no existen pero se muestran (bloqueadas)
 * o.extraNodo(v, p) -> svg extra   o.unidad: texto tras el peso
 */
function dibujar(svg, cual, g, o) {
  R = o.r || 15;
  const P = o.pos || posiciones(cual, g);
  const existe = new Set(g.aristas.map(a => clave(a.origen, a.destino)));
  const todas = [...g.aristas.map(a => ({ ...a, fantasma: false })),
                 ...(o.fantasmas || []).filter(a => P[a.origen] && P[a.destino] && !existe.has(clave(a.origen, a.destino)))
                   .map(a => ({ ...a, fantasma: true }))];
  const pares = new Set(todas.map(a => clave(a.origen, a.destino)));

  let fondo = "", frente = "";
  for (const a of todas) {
    const A = P[a.origen], B = P[a.destino];
    if (!A || !B || a.origen === a.destino) continue;
    const curva = !o.sinFlechas && !a.doble && pares.has(clave(a.destino, a.origen));
    const gm = geometria(A, B, curva);
    const k = clave(a.origen, a.destino);
    const cls = a.fantasma ? "bloqueada" : (o.claseArista ? o.claseArista(a) : "");
    const peso = `${fmt(a.peso)}${o.unidad || ""}`;
    const html = `<g class="ar" data-a="${esc(k)}">
      <path class="arista ${cls}" d="${gm.d}" data-k="${esc(k)}"/>
      ${a.fantasma || o.sinFlechas || a.doble ? "" : `<path class="flecha ${cls}" d="${gm.flecha}"/>`}
      ${!o.pesos || o.pesos(a) || a.fantasma ? `<text class="peso ${cls}" x="${gm.m.x}" y="${gm.m.y}">${a.fantasma ? "×" : esc(peso)}</text>` : ""}
      <path class="toque" d="${gm.d}"><title>${esc(a.origen)} ${FLECHA} ${esc(a.destino)} · ${esc(peso)}</title></path>
    </g>`;
    if (cls && cls !== "bloqueada") frente += html; else fondo += html;
  }

  let nodos = "";
  for (const v of g.vertices) {
    const p = P[v];
    const corto = o.corto ? o.corto(v) : v;
    const lin = corto ? etiqueta(corto) : [];
    const tipo = o.tipo ? o.tipo(v) : "";
    const icono = o.icono ? o.icono(v, tipo) : "";
    nodos += `<g class="nodo t-${tipo} ${o.claseNodo ? o.claseNodo(v) : ""}" data-n="${esc(v)}" transform="translate(${p.x},${p.y})">
      <title>${esc(v)}</title>
      ${o.antesNodo ? o.antesNodo(v) : ""}
      <circle class="c" r="${R}"/>
      ${icono}
      <text class="lbl" y="${R + 12}">${lin.map((l, i) => `<tspan x="0" dy="${i ? 11 : 0}">${esc(l)}</tspan>`).join("")}</text>
      ${o.extraNodo ? o.extraNodo(v) : ""}
    </g>`;
  }

  if (!svg.classList.contains("arrastrando")) {
    const ps = g.vertices.map(v => P[v]);
    const minX = Math.min(0, ...ps.map(p => p.x - 34)), maxX = Math.max(W, ...ps.map(p => p.x + 34));
    const minY = Math.min(...ps.map(p => p.y - 30), 1e9), maxY = Math.max(...ps.map(p => p.y + 44), -1e9);
    const vb = ps.length ? [minX, minY, maxX - minX, maxY - minY] : [0, 0, W, 200];
    svg.setAttribute("viewBox", vb.map(n => Math.round(n)).join(" "));
  }
  svg.innerHTML = g.vertices.length
    ? `${o.fondo || ""}<g>${fondo}</g><g>${frente}</g><g class="capa-chispa"></g><g>${nodos}</g>${o.extra || ""}`
    : `<text x="${W / 2}" y="100" text-anchor="middle" class="peso" style="font-size:13px">El grafo está vacío. Agrega vértices en Administrar.</text>`;
}

/* Tocar o arrastrar nodos y aristas del SVG. */
function interacciones(svg, cual, alTocarNodo, alTocarArista) {
  let ini = null;
  const punto = ev => {
    const m = svg.getScreenCTM();
    if (!m) return { x: 0, y: 0 };
    const p = new DOMPoint(ev.clientX, ev.clientY).matrixTransform(m.inverse());
    return { x: p.x, y: p.y };
  };
  svg.addEventListener("pointerdown", ev => {
    const n = ev.target.closest(".nodo"), a = ev.target.closest(".ar");
    ini = { n: n?.dataset.n, a: a?.dataset.a, x: ev.clientX, y: ev.clientY, mov: false };
    if (n && mover[cual]) svg.setPointerCapture(ev.pointerId);
  });
  svg.addEventListener("pointermove", ev => {
    if (!ini || !ini.n || !mover[cual]) return;
    if (!ini.mov && Math.hypot(ev.clientX - ini.x, ev.clientY - ini.y) < 6) return;
    ini.mov = true;
    svg.classList.add("arrastrando");
    POS[cual][ini.n] = punto(ev);
    if (cual === "mesh") renderMesh(); else render();
  });
  const fin = () => {
    if (!ini) return;
    const t = ini; ini = null;
    if (t.mov) { svg.classList.remove("arrastrando"); guardar("pos-" + cual, POS[cual]); if (cual === "mesh") renderMesh(); else render(); return; }
    if (t.n) alTocarNodo(t.n);
    else if (t.a && alTocarArista) alTocarArista(t.a.split(FLECHA));
  };
  svg.addEventListener("pointerup", fin);
  svg.addEventListener("pointercancel", () => { ini = null; svg.classList.remove("arrastrando"); });
}

/* ------------------------------------------------------- hoja inferior (Action Sheet) */

let focoPrevioHoja = null;

function hoja(titulo, texto, acciones = [], opts = {}) {
  focoPrevioHoja = document.activeElement;
  $("#hoja-titulo").textContent = titulo;
  $("#hoja-texto").textContent = texto || "";
  const cont = $("#hoja-acciones");
  cont.innerHTML = opts.extraHtml || "";
  if (typeof opts.onMount === "function") opts.onMount(cont);

  const lista = Array.isArray(acciones) ? acciones : [];
  const normales = lista.filter(a => !/\b(peligro|alerta)\b/.test(a.cls || ""));
  const destructivas = lista.filter(a => /\b(peligro|alerta)\b/.test(a.cls || ""));
  const ordenadas = [...normales, ...destructivas];
  const MAX_VISIBLES = 5;

  const crearBtn = a => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "btn ancho " + (a.cls || "secundario");
    if (a.html) b.innerHTML = a.html;
    else b.textContent = a.txt;
    b.addEventListener("click", async () => {
      if (b.disabled) return;
      b.disabled = true;
      try {
        if (typeof a.fn === "function") await a.fn();
      } catch (err) {
        aviso("No se pudo completar la acción.", false);
      } finally {
        b.disabled = false;
        if (!a.mantenerAbierta) cerrarHoja();
      }
    });
    return b;
  };

  let sepAgregado = false;
  const agregarItem = (a, padre) => {
    if (!sepAgregado && normales.length && destructivas.includes(a)) {
      const sep = document.createElement("div");
      sep.className = "hoja-sep-peligro";
      sep.setAttribute("aria-hidden", "true");
      padre.append(sep);
      sepAgregado = true;
    }
    padre.append(crearBtn(a));
  };

  ordenadas.slice(0, MAX_VISIBLES).forEach(a => agregarItem(a, cont));
  if (ordenadas.length > MAX_VISIBLES) {
    const extraWrap = document.createElement("div");
    extraWrap.className = "hoja-acciones";
    extraWrap.hidden = true;
    ordenadas.slice(MAX_VISIBLES).forEach(a => agregarItem(a, extraWrap));
    const masBtn = document.createElement("button");
    masBtn.type = "button";
    masBtn.className = "btn secundario ancho";
    masBtn.setAttribute("aria-expanded", "false");
    masBtn.textContent = `Más opciones (${ordenadas.length - MAX_VISIBLES})…`;
    masBtn.addEventListener("click", () => {
      const abrir = extraWrap.hidden;
      extraWrap.hidden = !abrir;
      masBtn.setAttribute("aria-expanded", String(abrir));
      masBtn.textContent = abrir ? "Ver menos" : `Más opciones (${ordenadas.length - MAX_VISIBLES})…`;
    });
    cont.append(masBtn, extraWrap);
  }

  const carta = $(".hoja-carta");
  if (carta) { carta.style.transform = ""; carta.style.transition = ""; }
  $("#hoja").hidden = false;
  if (history.pushState) history.pushState({ hoja: true }, "");
  const primero = $(".hoja-carta button, .hoja-carta select, .hoja-carta input");
  if (primero) primero.focus();
}

function cerrarHoja() {
  if ($("#hoja").hidden) return;
  $("#hoja").hidden = true;
  const carta = $(".hoja-carta");
  if (carta) { carta.style.transform = ""; carta.style.transition = ""; }
  if (focoPrevioHoja && typeof focoPrevioHoja.focus === "function") focoPrevioHoja.focus();
  focoPrevioHoja = null;
}

window.abrirHoja = hoja;
window.cerrarHoja = cerrarHoja;

/* ---------------------------------------------------------- selects */

function llenar(sel, opciones, vacio) {
  const prev = sel.value;
  const html = (vacio ? `<option value="">${esc(vacio)}</option>` : "") +
    opciones.map(o => `<option value="${esc(o.v)}">${esc(o.t)}</option>`).join("");
  if (sel.innerHTML !== html) sel.innerHTML = html;
  if (opciones.some(o => o.v === prev)) sel.value = prev;
}

/* ------------------------------------------------------------- estado */

let emergenciaNubeInvitado;

function aplicarEstado(est) {
  if (!window.__UNEXUAM_OFFLINE__ && document.body.classList.contains("modo-invitado") &&
      emergenciaNubeInvitado !== undefined) {
    est = { ...est, emergencia: emergenciaNubeInvitado };
  }
  E = est;
  window.__UNEXUAM_ESTADO__ = est;
  firma = JSON.stringify(est);
  const ua = est.ultimaAlerta;
  const k = ua ? ua.hora + ua.origen + ua.ttl : null;
  if (k && alertaVista === null) { alertaVista = k; }
  else if (k && k !== alertaVista && !animando) { alertaVista = k; aviso(`Nueva alerta desde ${ua.origen}`, false); }
  else if (!ua) { alertaVista = "nada"; alcanceMostrado = null; viaMostrada = {}; }
  actualizarBannerEmergencia();
  evaluarEmergenciaAutomatica();
  actualizarSeguimientoGpsEmergencia();
  // si el grafo del campus cambió (bloqueo, congestión, admin), invalidar caché local y recalcular
  const fc = JSON.stringify([est.campus.aristas, est.campus.zonasSeguras]);
  if (fc !== firmaCampus) {
    firmaCampus = fc;
    if (miLugar && est.campus.vertices.includes(miLugar)) {
      pedirRuta();
      if (vista === "admin") renderAdmin();
      return;
    }
  }
  render();
}

function render() {
  if (!E) return;
  if (vista === "inicio") renderInicio();
  else if (vista === "campus") renderCampus();
  else if (vista === "admin") renderAdmin();
}

/* ---------------------------------------------------------------- inicio */

function sparklineSvg(vals, label, color = "#0062cc") {
  const nums = (vals && vals.length ? vals : [0, 0]).map(Number);
  const max = Math.max(1, ...nums), min = Math.min(0, ...nums), span = Math.max(1, max - min);
  const w = 112, h = 30, pad = 3;
  const pts = nums.map((v, i) => {
    const x = nums.length === 1 ? w / 2 : pad + (i * (w - pad * 2)) / (nums.length - 1);
    const y = h - pad - ((v - min) / span) * (h - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  return `<svg class="sparkline" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(label)}"><polyline fill="none" stroke="${color}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" points="${pts}"/></svg><span class="sr">${esc(label)}</span>`;
}

function renderInicio() {
  const m = E.mesh, c = E.campus, ua = E.ultimaAlerta;
  const tels = m.vertices.length;
  const alc = ua ? new Set(ua.alcanzados.map(x => x[0]).concat(ua.origen)).size : null;
  const nCong = Object.keys(c.congestion).length;
  const r = miRuta;
  const accRuta = $("#acc-ruta-val");
  if (accRuta) {
    accRuta.textContent = r && r.tiempo !== null
      ? `${r.ruta[r.ruta.length - 1]} · ${minutos(r.tiempo)} caminando`
      : "Ver ruta paso a paso en el mapa 3D";
  }
  const accRutaChip = $("#acc-ruta-chip");
  if (accRutaChip) {
    if (r && r.tiempo !== null) {
      accRutaChip.textContent = minutos(r.tiempo);
      accRutaChip.hidden = false;
    } else {
      accRutaChip.hidden = true;
    }
  }
  const accLugChip = $("#acc-lugar-chip");
  if (accLugChip && miLugar) accLugChip.textContent = miLugar;

  const emObj = E.emergencia;
  const emergencia = !!(emObj || ua || c.bloqueados.length || nCong);
  $("#hero").className = "hero " + (emergencia ? "emergencia" : "calma");
  $("#hero-icono").src = emergencia ? IMG.fuego : IMG.x;
  $("#hero-titulo").textContent = emObj ? emObj.titulo : (emergencia ? "Emergencia en curso" : "Todo en calma");
  const partes = [];
  if (emObj && emObj.texto) partes.push(emObj.texto);
  if (ua) partes.push(`alerta propagada a ${alc} de ${tels} teléfonos`);
  if (c.bloqueados.length) partes.push(`${c.bloqueados.length} paso(s) bloqueado(s)`);
  if (nCong) partes.push(`${nCong} lugar(es) con congestión`);
  $("#hero-texto").textContent = partes.length ? partes.join(" · ").replace(/^./, s => s.toUpperCase()) : "No hay alertas activas en la red ni en el campus.";
  const btnFin = $("#btn-fin-emergencia");
  if (btnFin) btnFin.hidden = !(emergencia && document.body.classList.contains("es-admin"));

  $("#historial").innerHTML = E.historial.length
    ? E.historial.map(h =>
        `<li class="${h.tipo === "error" ? "error" : ""}"><time>${esc(h.hora)}</time><span>${esc(h.texto)}</span></li>`).join("")
    : `<li class="nota">Sin actividad registrada todavía.</li>`;
}

/* -------------------------------------------------------------- campus */

/* Campus: en vez de dibujar el mapa, la app le dice al estudiante, paso a paso,
 * hacia dónde caminar desde donde está hasta el punto seguro más cercano.
 * La ruta la calcula el backend (Dijkstra); aquí solo se traduce a instrucciones. */

const RX = {
  aula: /^([A-Z])-(\d)(\d{2})$/,                         // "C-305": edificio C, piso 3, aula 05
  escalera: /^([A-Z]) Escalera (Este|Oeste|Central) P(\d+)$/,    // "C Escalera Oeste P3"
  salida: /^([A-Z]) Salida (Este|Oeste)$/,               // "C Salida Oeste"
  pabellon: /^([A-Z]) Pabell[oó]n (Este|Oeste) P(\d+)$/,  // "C Pabellón Oeste P3": mitad del pasillo de un piso
};

function lugarInfo(n) {
  let m;
  if (E.campus.zonasSeguras.includes(n)) return { t: "zona", n };
  if ((m = RX.aula.exec(n))) return { t: "aula", n, ed: m[1], piso: +m[2], num: +m[3] };
  if ((m = RX.escalera.exec(n))) return { t: "escalera", n, ed: m[1], lado: m[2].toLowerCase(), piso: +m[3] };
  if ((m = RX.salida.exec(n))) return { t: "salida", n, ed: m[1], lado: m[2].toLowerCase() };
  if ((m = RX.pabellon.exec(n))) return { t: "pabellon", n, ed: m[1], lado: m[2].toLowerCase(), piso: +m[3] };
  return { t: "lugar", n };
}

const nombrePiso = p => (p === 1 ? "la planta baja" : `el piso ${p}`);
const dePiso = p => (p === 1 ? "de la planta baja" : `del piso ${p}`);

function grupoLugar(n) {
  const i = lugarInfo(n);
  if (i.t === "zona") return "Puntos seguros";
  if (i.t === "aula" || i.t === "escalera" || i.t === "pabellon") return `Edificio ${i.ed} · ${i.piso === 1 ? "Planta baja" : "Piso " + i.piso}`;
  if (i.t === "salida") return `Edificio ${i.ed} · Salidas`;
  return "Otros lugares del campus";
}

/* Opciones agrupadas con <optgroup> (edificio y piso), para no mostrar 130 lugares sueltos. */
function llenarAgrupado(sel, opciones, vacio, grupo) {
  const prev = sel.value;
  const grupos = new Map();
  for (const o of opciones) {
    const g = grupo(o);
    if (!grupos.has(g)) grupos.set(g, []);
    grupos.get(g).push(o);
  }
  const orden = [...grupos.keys()].sort((a, b) => {
    const peso = s => (s.startsWith("Edificio") ? 0 : s.startsWith("Otros") ? 1 : 2);
    return peso(a) - peso(b) || a.localeCompare(b, "es", { numeric: true });
  });
  const html = (vacio ? `<option value="">${esc(vacio)}</option>` : "") + orden.map(g =>
    `<optgroup label="${esc(g)}">${grupos.get(g).sort((a, b) => a.t.localeCompare(b.t, "es", { numeric: true }))
      .map(o => `<option value="${esc(o.v)}">${esc(o.t)}</option>`).join("")}</optgroup>`).join("");
  if (sel.innerHTML !== html) sel.innerHTML = html;
  if (opciones.some(o => o.v === prev)) sel.value = prev;
}

/* Agrupa la ruta (lista de vértices) en pasos que una persona entiende. */
function pasosDeRuta(ruta) {
  const peso = new Map(E.campus.aristas.map(a => [clave(a.origen, a.destino), a.peso || 0]));
  const I = ruta.map(lugarInfo);
  const esCentralBC = x => x.t === "escalera" && x.lado === "central" && (x.ed === "B" || x.ed === "C");
  const tipoTramo = (a, b, idx) => {
    if (b.t === "zona") return "zona";
    const enPiso = x => x.t === "aula" || x.t === "escalera" || x.t === "pabellon";
    if (esCentralBC(a) && b.t === "pabellon" && a.piso === b.piso && (b.ed === "B" || b.ed === "C")) {
      // solo es "cruce" si venimos de otro edificio distinto a b.ed
      let edPrev = a.ed;
      for (let j = idx - 1; j >= 0; j--) {
        if (I[j].ed && !esCentralBC(I[j])) { edPrev = I[j].ed; break; }
      }
      if (edPrev !== b.ed) return `cruce:${b.ed}:${b.piso}`;
      return `pasillo:${b.ed}:${b.piso}`;
    }
    const mismoEd = a.ed === b.ed || (esCentralBC(b) && (a.ed === "B" || a.ed === "C"));
    if (enPiso(a) && enPiso(b) && mismoEd && a.piso === b.piso &&
        !(a.t === "escalera" && b.t === "escalera")) return `pasillo:${a.ed}:${a.piso}`;
    if (a.t === "escalera" && b.t === "escalera" && (a.ed === b.ed || (esCentralBC(a) && esCentralBC(b)))) {
      return esCentralBC(a) && esCentralBC(b) ? "escalera:BC:central" : `escalera:${a.ed}:${b.lado}`;
    }
    if (b.t === "salida" && a.ed === b.ed) return `salida:${b.ed}`;
    return "lugar:" + b.n;  // cada lugar suelto es su propio paso
  };
  const grupos = [];
  for (let i = 0; i + 1 < I.length; i++) {
    const k = tipoTramo(I[i], I[i + 1], i);
    const ult = grupos[grupos.length - 1];
    if (ult && ult.k === k && !k.startsWith("lugar:")) ult.hasta = i + 1;
    else grupos.push({ k, desde: i, hasta: i + 1 });
  }
  return grupos.map((g, idx) => {
    const a = I[g.desde], b = I[g.hasta];
    let segundos = 0;
    for (let i = g.desde; i < g.hasta; i++) segundos += peso.get(clave(ruta[i], ruta[i + 1])) || 0;
    const tipo = g.k.split(":")[0];
    let texto;
    if (tipo === "pasillo") {
      // pabellones (mitades del pasillo) que se recorren en este tramo, en orden
      const pabs = I.slice(g.desde, g.hasta + 1).filter(x => x.t === "pabellon");
      const lados = pabs.map(p => p.lado).filter((l, k, arr) => arr.indexOf(l) === k);
      let salir;
      if (idx === 0 && a.t === "aula") salir = pabs.length ? `Sal del aula ${a.n} al pabellón ${lados[0]} ${dePiso(a.piso)}` : `Sal del aula ${a.n} al pasillo ${dePiso(a.piso)}`;
      else salir = pabs.length ? `Ve al pabellón ${lados[0]} ${dePiso(a.piso)}` : `Sigue por el pasillo ${dePiso(a.piso)}`;
      if (lados.length > 1) salir += `, cruza al pabellón ${lados[lados.length - 1]}`;
      if (b.t === "escalera") texto = `${salir} y camina hasta la escalera ${b.lado}.`;
      else if (b.t === "pabellon") texto = `${salir}.`;
      else if (pabs.length) texto = `${salir} y entra al aula ${b.n}.`;
      else {
        const dir = b.num > (a.num || 0) ? "oeste" : "este";
        texto = `${salir} y camina hacia el ${dir} hasta el aula ${b.n}.`;
      }
    } else if (tipo === "cruce") {
      texto = `Cruza al edificio ${b.ed} (pabellón ${b.lado} ${dePiso(b.piso)}).`;
    } else if (tipo === "escalera") {
      const verbo = b.piso < a.piso ? "Baja" : "Sube";
      texto = g.k === "escalera:BC:central"
        ? `${verbo} por la escalera central entre los edificios B y C hasta ${nombrePiso(b.piso)}.`
        : `${verbo} por la escalera ${b.lado} del edificio ${b.ed} hasta ${nombrePiso(b.piso)}.`;
    } else if (tipo === "salida") {
      texto = `Sal del edificio ${b.ed} por la salida ${b.lado}.`;
    } else if (tipo === "zona") {
      if (a.n === "Pasarela Edificio B" && b.n === "Punto Seguro Plazoleta") {
        texto = "Baja por la escalera de la pasarela hasta Punto Seguro Plazoleta.";
      } else {
        texto = idx === 0 && a.t === "aula" ? `Sal del aula ${a.n} y ve directo a ${b.n}.` : `Camina hasta ${b.n}.`;
      }
    } else {
      texto = idx === 0 && a.t === "aula" ? `Sal del aula ${a.n} y ve hacia ${b.n}.` : `Ve hacia ${b.n}.`;
    }
    return { tipo, texto, segundos, de: ruta[g.desde], a: ruta[g.desde + 1], llega: b.n, desde: g.desde, hasta: g.hasta };
  });
}

const ICONO_PASO = { pasillo: "→", escalera: "⇅", salida: "⇱", cruce: "⇄", zona: "●", lugar: "→" };
const minutos = s => (s < 60 ? `${Math.round(s)} s` : `${Math.floor(s / 60)} min ${Math.round(s % 60)} s`);

let miLugar = leer("mi-lugar", "");   // cada teléfono guarda dónde está su estudiante
let miRuta = null;                    // {origen, ruta, tiempo} calculada para este teléfono
let firmaCampus = "";                 // para recalcular cuando el grafo del campus cambia
let solicitudRuta = 0;
let mapaDescargado = null;

async function pedirRuta() {
  const solicitud = ++solicitudRuta;
  if (!E || !miLugar || !E.campus.vertices.includes(miLugar)) {
    miRuta = null;
    if (vista === "campus") renderCampus();
    else if (vista === "inicio") renderInicio();
    return;
  }
  try {
    const r = await fetch("/api/campus/ruta", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lugar: miLugar }) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = await r.json();
    if (solicitud !== solicitudRuta) return;
    if (!j.ok) { aviso(j.mensaje || "No se pudo calcular la ruta.", false); return; }
    const nueva = j.ruta;
    mapaDescargado = j.offline ? j.capturado : null;
    if (miRuta && nueva && miRuta.origen === nueva.origen &&
        (JSON.stringify(miRuta.ruta) !== JSON.stringify(nueva.ruta) || miRuta.tiempo !== nueva.tiempo)) rutaAnterior = miRuta;
    else if (!miRuta || !nueva || miRuta.origen !== nueva.origen) rutaAnterior = null;
    miRuta = nueva;
  } catch (e) {
    if (solicitud !== solicitudRuta) return;
    aviso("No se pudo actualizar la ruta; se mantiene la última conocida.", false);
  }
  if (vista === "campus") renderCampus();
  else if (vista === "inicio") renderInicio();
}

function renderCampus() {
  const c = E.campus;
  const lugares = c.vertices.filter(v => !c.zonasSeguras.includes(v));
  llenarAgrupado($("#campus-ubicacion"), lugares.map(v => ({ v, t: v })), "Elige dónde estás…", o => grupoLugar(o.v));
  $("#campus-ubicacion").value = lugares.includes(miLugar) ? miLugar : "";
  renderSelectorDinamico();
  llenarAgrupado($("#bloq-paso"), c.aristas.map(a => ({ v: JSON.stringify([a.origen, a.destino]), t: `${a.origen} → ${a.destino} (${fmt(a.peso)} s)`, o: a.origen })),
    "", o => grupoLugar(o.o));
  llenarAgrupado($("#cong-lugar"), c.vertices.map(v => ({ v, t: v + (c.congestion[v] ? ` (×${c.congestion[v]})` : "") })), "", o => grupoLugar(o.v));
  $$("#cong-factor button").forEach(b => b.setAttribute("aria-pressed", String(Number(b.dataset.f) === factor)));

  const nInc = c.bloqueados.length + Object.keys(c.congestion).length;
  $("#incidentes-activos").textContent = nInc
    ? `Activos: ${c.bloqueados.length} paso(s) bloqueado(s) y ${Object.keys(c.congestion).length} lugar(es) con congestión.`
    : "";

  const offline = $("#ruta-offline");
  offline.hidden = !mapaDescargado;
  offline.textContent = mapaDescargado
    ? `Mapa descargado el ${new Date(mapaDescargado * 1000).toLocaleString("es-NI")}. Los bloqueos recientes pueden faltar.`
    : "";
  const info = $("#ruta-info");
  const r = miRuta;
  if (!miLugar || !r) {
    info.innerHTML = `<p class="nota">Elige dónde estás y la app te dice, paso a paso, hacia dónde caminar hasta el punto seguro más cercano.</p>`;
    renderMapa3D(null, []);
    return;
  }
  if (r.tiempo === null || !r.ruta.length) {
    info.innerHTML = `<p class="sin-ruta">Desde ${esc(r.origen)} no hay ninguna salida libre hacia un punto seguro. Quédate en un lugar protegido y espera a los rescatistas.</p>`;
    renderMapa3D(r, []);
    return;
  }
  let cambio = "";
  if (rutaAnterior && rutaAnterior.origen === r.origen) {
    const antes = rutaAnterior.tiempo;
    if (antes === null) cambio = `<span class="cambio mejor">nueva ruta disponible</span>`;
    else {
      const d = r.tiempo - antes;
      cambio = `<span class="cambio ${d > 0 ? "peor" : d < 0 ? "mejor" : "igual"}">ruta recalculada: ${d > 0 ? "+" : ""}${fmt(d)} s</span>`;
    }
  }
  const destino = r.ruta[r.ruta.length - 1];
  const pasos = r.ruta.length > 1 ? pasosDeRuta(r.ruta) : [];
  pasosActuales = pasos;
  if (pasoActivo >= pasos.length) pasoActivo = -1;
  const sparkRuta = pasos.length ? sparklineSvg(pasos.map(p => p.segundos), `Perfil de tiempos por paso: ${pasos.length} pasos en ${minutos(r.tiempo)}`, "#ffffff") : "";
  info.innerHTML = `
    <div class="destino">
      <span class="destino-etq">Evacúa hacia</span>
      <b class="destino-nombre">${esc(destino)}</b>
      <div class="destino-hero">
        <strong class="destino-hero-num">${minutos(r.tiempo)}</strong>
        ${sparkRuta}
      </div>
      <span class="destino-tiempo">Caminando · ${pasos.length} paso${pasos.length === 1 ? "" : "s"}</span>
      ${cambio}
    </div>
    ${r.ruta.length > 1 ? `<details class="metrica-det"><summary>Ver recorrido completo (${r.ruta.length} puntos)</summary><p class="nota">${r.ruta.map(esc).join(" → ")}</p></details>` : ""}
    ${r.ruta.length === 1 ? `<p class="nota">Ya estás en un punto seguro.</p>` : `
      <button type="button" class="btn primario ancho" data-accion="leer-voz" id="btn-voz"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4zm12.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4ZM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6Z"/></svg> Leer ruta por voz</button>
      <p class="nota">Toca un paso para resaltarlo en el mapa 3D.</p>`}
    <ol class="guia">${pasos.map((p, i) => `
      <li class="paso t-${p.tipo}${i === pasoActivo ? " activa" : ""}" data-paso="${i}" role="button" tabindex="0" aria-pressed="${i === pasoActivo}">
        <div class="paso-cab"><span class="paso-n">${i + 1}</span><p class="paso-texto">${esc(p.texto)}</p></div>
        <div class="paso-3d">${vistaPaso(r, p)}</div>
        <p class="paso-meta"><span>${ICONO_PASO[p.tipo] || "→"} ${minutos(p.segundos)}</span>
          ${document.body.classList.contains("es-admin") ? `<button type="button" class="paso-bloq" data-bloq='${esc(JSON.stringify([p.de, p.a]))}'>Simular bloqueo</button>` : ""}</p>
      </li>`).join("")}
    </ol>
    <p class="consejo">Camina, no corras. Ayuda a quien lo necesite y espera indicaciones en el punto seguro.</p>`;
  renderMapa3D(r, pasos);
}

function bloquear(o, d, ambos) {
  return api("/api/campus/bloquear", { origen: o, destino: d, ambos });
}


/* --- Vistas 3D de la ruta ----------------------------------------------------------------
 * 1) Edificio por dentro (B, C, P): los pisos separados en vertical («vista explotada») para
 *    que se vea cada piso con sus aulas, sus dos pabellones (este y oeste), las escaleras de los
 *    extremos y las salidas. La ruta se dibuja encima como grafo: cada vértice es un círculo y
 *    cada arista una flecha con su peso. Cada paso de la guía trae su propia vista pequeña.
 * 2) Campus: el mapa 3D (img/mapa-campus-3d.svg) con el tramo exterior de la ruta.
 * Las dos vistas usan la proyección del mapa 3D (docs/mapa-campus/generar_mapa.py):
 * giro de 16°, achatamiento 0.58, en metros de campus-plano.json (x al este, y al sur). */

let PLANO = null;            // frontend/static/campus-plano.json (OpenStreetMap, en metros)
let AREAS_UBIC = null;       // frontend/static/ubicacion-campus.json (polígonos exactos)
let planoEstado = "cargando";
let PROY = null;             // { esc, ox, oy } de la proyección del mapa 3D
let mapaCompleto = false;    // false: acercado a la ruta · true: todo el campus
let pasoActivo = -1;         // paso de la guía resaltado
let pasosActuales = [];      // pasos calculados de la ruta activa

const MAPA_W = 1600, MAPA_H = 1060;
const GIRO = 16 * Math.PI / 180, ACHATE = 0.58, COS_G = Math.cos(GIRO), SEN_G = Math.sin(GIRO);
const ANCHO_ED = 12;         // ancho del edificio (m): aulas atrás, pabellón adelante
const SEP_PISO = 13;         // separación entre pisos en la vista explotada (el real es 3.6 m)

/* Estilo de fachadas por edificio (B, C y P). */
const FACHADA = {
  B: { techo: "#fbfcfd", muro: "#e6eaef", ventana: "#9cc8f0", pasillo: "sur", nombre: "Edificio B" },
  C: { techo: "#fbfcfd", muro: "#e6eaef", ventana: "#9cc8f0", pasillo: "sur", nombre: "Edificio C" },
  P: { techo: "#fbfcfd", muro: "#f2f4f6", ventana: "#3a4552", pasillo: "norte",
       columnas: "#6f7c8a", observatorio: "este", nombre: "Edificio P" },
};

function proyBase(x, y, z) {
  const xr = x * COS_G - y * SEN_G, yr = x * SEN_G + y * COS_G;
  return [xr, yr * ACHATE - z];
}

function prepararProyeccion() {
  // igual que encajar(200, 140, 1400, 935) en generar_mapa.py (z de -6 a 20)
  const pts = [];
  for (const [x, y] of PLANO.campus) for (const z of [-6, 20]) pts.push(proyBase(x, y, z));
  const bx0 = Math.min(...pts.map(p => p[0])), bx1 = Math.max(...pts.map(p => p[0]));
  const by0 = Math.min(...pts.map(p => p[1])), by1 = Math.max(...pts.map(p => p[1]));
  const [x0, y0, x1, y1] = [200, 140, 1400, 935];
  const esc = Math.min((x1 - x0) / (bx1 - bx0), (y1 - y0) / (by1 - by0));
  PROY = { esc, ox: x0 + ((x1 - x0) - (bx1 - bx0) * esc) / 2 - bx0 * esc, oy: y0 + ((y1 - y0) - (by1 - by0) * esc) / 2 - by0 * esc };
}

function proyectar(x, y, z = 0) {
  const [a, b] = proyBase(x, y, z);
  return { x: a * PROY.esc + PROY.ox, y: b * PROY.esc + PROY.oy };
}

function cargarPlanoCampus() {
  planoEstado = "cargando";
  return Promise.all([
    fetch("/static/campus-plano.json").then(r => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); }),
    fetch("/static/ubicacion-campus.json").then(r => (r.ok ? r.json() : null)).catch(() => null),
  ]).then(([j, u]) => {
    PLANO = j;
    if (u) AREAS_UBIC = u;
    prepararProyeccion();
    planoEstado = "listo";
    if (E && vista === "campus") renderCampus();
  }).catch(() => {
    planoEstado = "error";
    if (E && vista === "campus") renderCampus();
  });
}
cargarPlanoCampus();

function corto(n) {
  return n.replace(/^Punto Seguro /, "PS ").replace(/^Zona Segura /, "ZS ").replace(/ Pabell[oó]n /, " Pab. ")
    .replace(/ Escalera /, " Esc. ");
}

const edificioDe = n => { const i = lugarInfo(n); return i.ed && FACHADA[i.ed] ? i.ed : null; };

/* ---------- 1) el edificio por dentro ---------- */

function geomEdificio(L) {
  if (!PLANO) return null;
  const este = PLANO.posiciones[`${L} Salida Este`], oeste = PLANO.posiciones[`${L} Salida Oeste`];
  if (!este || !oeste) return null;
  const dx = oeste[0] - este[0], dy = oeste[1] - este[1], len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;
  let nx = -uy, ny = ux;
  if (ny < 0) { nx = -nx; ny = -ny; }          // +v apunta al sur: el lado que mira al observador
  const pisos = new Set(), aulas = {};
  for (const v of E.campus.vertices) {
    const i = lugarInfo(v);
    if (i.ed !== L || !i.piso) continue;
    pisos.add(i.piso);
    if (i.t === "aula") aulas[i.piso] = (aulas[i.piso] || 0) + 1;
  }
  return { L, este, ux, uy, nx, ny, len, pisos: [...pisos].sort((a, b) => a - b), aulas };
}

function enEdificio(G, u, v, z) {
  // u: 0 = extremo este, 1 = extremo oeste · v: metros hacia el sur desde el eje · z: altura
  const x = G.este[0] + G.ux * G.len * u + G.nx * v, y = G.este[1] + G.uy * G.len * u + G.ny * v;
  const [a, b] = proyBase(x, y, z);
  return { x: a, y: b };
}

const zPiso = p => (p - 1) * SEP_PISO;

// +1 si el pasillo da al sur (hacia quien mira el dibujo), -1 si da al norte (Edificio P)
const ladoPasillo = L => (FACHADA[L] && FACHADA[L].pasillo === "norte" ? -1 : 1);

function nodoEnEdificio(G, n) {
  const i = lugarInfo(n);
  const centralBC = i.t === "escalera" && i.lado === "central" && (i.ed === "B" || i.ed === "C") && (G.L === "B" || G.L === "C");
  if (i.ed !== G.L && !centralBC) return null;
  const W = ANCHO_ED, sg = ladoPasillo(G.L);
  if (i.t === "aula") return enEdificio(G, 0.1 + 0.8 * (i.num - 0.5) / (G.aulas[i.piso] || 1), -sg * W / 4, zPiso(i.piso) + 0.4);
  if (i.t === "pabellon") return enEdificio(G, i.lado === "este" ? 0.3 : 0.7, sg * W / 4, zPiso(i.piso) + 0.4);
  if (i.t === "escalera") return enEdificio(G, i.lado === "este" ? 0.03 : i.lado === "central" ? 0.5 : 0.97, sg * W / 4, zPiso(i.piso) + 0.4);
  if (i.t === "salida") return enEdificio(G, i.lado === "este" ? -0.11 : 1.11, sg * W / 4, 0.4);
  return null;
}

function poli(pts, cls, extra = "") {
  return `<polygon class="${cls}" ${extra} points="${pts.map(p => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ")}"/>`;
}

/* Dibuja el edificio L con sus pisos separados y la ruta como grafo.
 * o.ruta: vértices de la ruta · o.resaltar: Set de índices de aristas del paso · o.mini: vista pequeña */
function edificio3D(L, o) {
  const G = geomEdificio(L);
  if (!G || !G.pisos.length) return "";
  const F = FACHADA[L], W = ANCHO_ED, top = G.pisos[G.pisos.length - 1];
  const sg = ladoPasillo(L);          // pasillo en v de 0 a sg·W/2; aulas en v de 0 a −sg·W/2
  const vMuro = sg > 0 ? 0 : W / 2;   // muro de las aulas que se ve: el del pasillo (sur) o el exterior
  const P = (u, v, z) => enEdificio(G, u, v, z);
  // caja de la vista
  const esquinas = [];
  const zMax = zPiso(top) + (F.observatorio ? 13 : 5);
  for (const u of [-0.32, 1.34]) for (const v of [-W / 2 - 2, W / 2]) for (const z of [0, zMax]) esquinas.push(P(u, v, z));
  let x0 = Math.min(...esquinas.map(p => p.x)), x1 = Math.max(...esquinas.map(p => p.x));
  let y0 = Math.min(...esquinas.map(p => p.y)) - 4, y1 = Math.max(...esquinas.map(p => p.y)) + 2;
  const ruta = o.ruta || [];
  if (o.mini && o.resaltar) {
    // vista pequeña: se acerca al tramo del paso (todos los pisos siguen a la vista)
    const xs = ruta.map((n, i) => (o.resaltar.has(i) || o.resaltar.has(i - 1) ? nodoEnEdificio(G, n) : null)).filter(Boolean).map(p => p.x);
    if (xs.length) {
      const ancho = Math.max(80, Math.max(...xs) - Math.min(...xs) + 52);
      const cx = (Math.max(...xs) + Math.min(...xs)) / 2;
      const nx0 = Math.max(x0, Math.min(cx - ancho / 2, x1 - ancho)), nx1 = Math.min(x1, nx0 + ancho);
      // alto: solo lo que cae dentro de esa franja
      const ys = [];
      for (let u = -0.32; u <= 1.34; u += 0.01) for (const v of [-W / 2 - 2, W / 2]) for (const z of [0, zMax]) {
        const q = P(u, v, z);
        if (q.x >= nx0 && q.x <= nx1) ys.push(q.y);
      }
      if (ys.length) { y0 = Math.min(...ys) - 3; y1 = Math.max(...ys) + 2; }
      x0 = nx0; x1 = nx1;
    }
  }
  const k = (x1 - x0) / 340;                       // metros de la vista por píxel
  const pisosRuta = new Set(ruta.map(n => lugarInfo(n)).filter(i => (i.ed === L || (i.t === "escalera" && i.lado === "central" && (L === "B" || L === "C"))) && i.piso).map(i => i.piso));
  let svg = "";
  let hitsSvg = "";

  // pozos de las escaleras (unen los pisos)
  for (const u of (L === "B" || L === "C" ? [0.03, 0.5, 0.97] : [0.03, 0.97])) {
    const a = P(u, sg * W / 4, 0), b = P(u, sg * W / 4, zPiso(top));
    svg += `<line class="e3-pozo" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke-width="${2.2 * k}" stroke-dasharray="${3 * k} ${2.5 * k}"/>`;
  }

  for (const p of G.pisos) {
    const z = zPiso(p), activo = pisosRuta.has(p) || (o.interactivo && (!o.pisoFiltro || o.pisoFiltro === p));
    const cls = activo ? " activo" : "";
    const aten = o.interactivo && o.pisoFiltro && o.pisoFiltro !== p ? ' opacity="0.32"' : "";
    svg += `<g${aten}>`;
    // losa del piso (con sombra proyectada y canto)
    svg += poli([P(-0.01, -W / 2 + 1, z - 1.5), P(1.03, -W / 2 + 1, z - 1.5), P(1.03, W / 2 + 1.2, z - 1.5), P(-0.01, W / 2 + 1.2, z - 1.5)], "e3-sombra");
    svg += poli([P(-0.02, -W / 2, z), P(1.02, -W / 2, z), P(1.02, W / 2, z), P(-0.02, W / 2, z)], "e3-losa" + cls, `stroke-width="${0.9 * k}"`);
    svg += poli([P(-0.02, W / 2, z), P(1.02, W / 2, z), P(1.02, W / 2, z - 0.8), P(-0.02, W / 2, z - 0.8)], "e3-canto" + cls);
    // pabellones (las dos mitades del pasillo, adelante)
    svg += poli([P(0.06, 0, z), P(0.5, 0, z), P(0.5, sg * W / 2, z), P(0.06, sg * W / 2, z)], "e3-pab este" + cls);
    svg += poli([P(0.5, 0, z), P(0.94, 0, z), P(0.94, sg * W / 2, z), P(0.5, sg * W / 2, z)], "e3-pab oeste" + cls);
    if (F.barandas && sg < 0) {   // pasillo abierto al norte: la baranda queda detrás de las aulas
      const b0 = P(0.04, -W / 2, z + 1.1), b1 = P(0.96, -W / 2, z + 1.1);
      svg += `<line class="e3-baranda" x1="${b0.x}" y1="${b0.y}" x2="${b1.x}" y2="${b1.y}" stroke="${F.barandas}" stroke-width="${0.8 * k}"/>`;
    }
    // fila de aulas (atrás): muro frontal con franja de ventanas y una puerta por aula
    const n = G.aulas[p] || 0, h = 3;
    svg += poli([P(0.06, -sg * W / 2, z + h), P(0.94, -sg * W / 2, z + h), P(0.94, 0, z + h), P(0.06, 0, z + h)], "e3-techo-aulas", `fill="${F.techo}"`);
    svg += poli([P(0.06, vMuro, z), P(0.94, vMuro, z), P(0.94, vMuro, z + h), P(0.06, vMuro, z + h)], "e3-muro", `fill="${F.muro}"`);
    svg += poli([P(0.06, vMuro, z + 1.0), P(0.94, vMuro, z + 1.0), P(0.94, vMuro, z + 2.4), P(0.06, vMuro, z + 2.4)], "e3-ventanas", `fill="${F.ventana}"`);
    for (let a = 1; a <= n; a++) {
      const u = 0.1 + 0.8 * (a - 0.5) / n, d0 = P(u - 0.012, vMuro, z), d1 = P(u + 0.012, vMuro, z + 2.1);
      if (sg > 0) svg += `<rect class="e3-puerta" x="${Math.min(d0.x, d1.x)}" y="${d1.y}" width="${Math.abs(d1.x - d0.x) + 0.4 * k}" height="${d0.y - d1.y}"/>`;
      const codAula = `${L}-${p}${String(a).padStart(2, "0")}`;
      if (o.interactivo && (!o.pisoFiltro || o.pisoFiltro === p)) {
        const hit = P(u, vMuro, z + h + 0.6);
        const bw = 18 * k, bh = 11.5 * k;
        hitsSvg += `<g class="e3-aula-hit" data-ub-sel="${esc(codAula)}" role="button" tabindex="0">
          <rect x="${(hit.x - bw / 2).toFixed(2)}" y="${(hit.y - bh / 2).toFixed(2)}" width="${bw.toFixed(2)}" height="${bh.toFixed(2)}" rx="${(bh / 2).toFixed(2)}" stroke-width="${1.2 * k}"/>
          <text x="${hit.x.toFixed(2)}" y="${hit.y.toFixed(2)}" font-size="${6.2 * k}">${p}${String(a).padStart(2, "0")}</text>
        </g>`;
      } else if (!o.mini) {
        const t = P(u, vMuro, z + h + 0.35);
        svg += `<text class="e3-num" x="${t.x}" y="${t.y}" font-size="${5.6 * k}">${p}${String(a).padStart(2, "0")}</text>`;
      }
      if (a < n && !o.mini) {
        const m = 0.1 + 0.8 * a / n, s0 = P(m, -sg * W / 2, z + h), s1 = P(m, vMuro === 0 ? 0 : W / 2, z + h), s2 = P(m, vMuro, z);
        svg += `<polyline class="e3-tabique" points="${s0.x},${s0.y} ${s1.x},${s1.y} ${s2.x},${s2.y}" stroke-width="${(F.columnas ? 1.1 : 0.6) * k}"${F.columnas ? ` stroke="${F.columnas}"` : ""}/>`;
      }
    }
    // escaleras de los extremos (y escalera central compartida en B y C)
    const escX = L === "B" || L === "C" ? [[0, 0.06], [0.47, 0.53], [0.94, 1]] : [[0, 0.06], [0.94, 1]];
    for (const [u0, u1] of escX) {
      const va = u0 === 0.47 ? 0 : -W / 2, vb = u0 === 0.47 ? sg * W / 2 : W / 2;
      svg += poli([P(u0, va, z), P(u1, va, z), P(u1, vb, z), P(u0, vb, z)], "e3-escalera" + cls);
      if (!o.mini) {
        for (let s = 1; s < 5; s++) {
          const v = va + ((vb - va) * s) / 5, l0 = P(u0, v, z + 0.05), l1 = P(u1, v, z + 0.05);
          svg += `<line class="e3-peldano" x1="${l0.x}" y1="${l0.y}" x2="${l1.x}" y2="${l1.y}" stroke-width="${0.5 * k}"/>`;
        }
      }
    }
    // rótulos del piso y de los pabellones (crecen hacia AFUERA del edificio)
    const alOeste = F.observatorio === "este";       // en P el extremo este lo ocupa la torre
    const rp = P(alOeste ? 1.12 : -0.09, -W / 2, z + 3.2);
    svg += `<text class="e3-piso${cls}" style="text-anchor:${alOeste ? "end" : "start"}" x="${rp.x}" y="${rp.y}" font-size="${(o.mini ? 7.6 : 8.2) * k}">${p === 1 ? "Planta baja" : "Piso " + p}</text>`;
    if (!o.mini) {
      for (const [u, txt, ladoNom] of [[0.28, "Pab. Este", "Este"], [0.72, "Pab. Oeste", "Oeste"]]) {
        const t = P(u, sg * (W / 2 - 0.5), z);
        if (o.interactivo && (!o.pisoFiltro || o.pisoFiltro === p)) {
          const bw = 34 * k, bh = 10.5 * k;
          const pabNom = `${L} Pabellón ${ladoNom} P${p}`;
          hitsSvg += `<g class="e3-pab-hit" data-ub-sel="${esc(pabNom)}" role="button" tabindex="0">
            <rect x="${(t.x - bw / 2).toFixed(2)}" y="${(t.y - bh / 2).toFixed(2)}" width="${bw.toFixed(2)}" height="${bh.toFixed(2)}" rx="${(bh / 2).toFixed(2)}" stroke-width="${1 * k}"/>
            <text x="${t.x.toFixed(2)}" y="${t.y.toFixed(2)}" font-size="${5.5 * k}">${txt}</text>
          </g>`;
        } else {
          svg += `<text class="e3-pabtxt" x="${t.x}" y="${t.y}" font-size="${5.8 * k}">${txt}</text>`;
        }
      }
      if ((L === "B" || L === "C") && p === 1) {
        const tc = P(0.5, sg * (W / 2 + 1.8), z);
        svg += `<text class="e3-central-txt" x="${tc.x}" y="${tc.y}" font-size="${5.5 * k}">Esc. Central B–C</text>`;
      }
    }
    svg += `</g>`;
  }
  // techo y detalles del último piso
  const zt = zPiso(top) + 3;
  if (F.solar && !o.interactivo) {             // celdas solares sobre el techo de las aulas (en modo interactivo no tapan el piso 3)
    const v0 = -sg * (W / 2 - 0.6), v1 = -sg * 1;
    svg += poli([P(0.14, v0, zt + 0.2), P(0.86, v0, zt + 0.2), P(0.86, v1, zt + 0.2), P(0.14, v1, zt + 0.2)], "e3-solar");
  }
  if (F.observatorio) {      // torre del observatorio: franja verde, sello dorado y cúpula blanca
    const u0 = F.observatorio === "este" ? -0.05 : 0.95, u1 = u0 + 0.1, vf = W / 2, zt2 = zt + 5;
    svg += poli([P(u0, vf, 0), P(u1, vf, 0), P(u1, vf, zt2), P(u0, vf, zt2)], "e3-torre");
    svg += poli([P(u0, vf, zt2 - 2), P(u1, vf, zt2 - 2), P(u1, vf, zt2), P(u0, vf, zt2)], "e3-torre-verde");
    const sello = P((u0 + u1) / 2, vf, zt2 - 4);
    svg += `<circle class="e3-sello" cx="${sello.x}" cy="${sello.y}" r="${(1.3 * k).toFixed(2)}"/>`;
    const c = P((u0 + u1) / 2, vf - 2, zt2 + 1.2);
    svg += `<ellipse class="e3-cupula" cx="${c.x}" cy="${c.y}" rx="${(3.6 * k).toFixed(2)}" ry="${(2.8 * k).toFixed(2)}"/>`;
  }
  // salidas de la planta baja
  for (const [u, txt] of [[-0.11, "Salida Este"], [1.11, "Salida Oeste"]]) {
    const pnt = P(u, sg * W / 4, 0);
    svg += `<g class="e3-salida"><rect x="${pnt.x - 4 * k}" y="${pnt.y - 7 * k}" width="${8 * k}" height="${7 * k}" rx="${1.5 * k}"/>
      ${o.mini ? "" : `<text x="${pnt.x}" y="${pnt.y + 7 * k}" font-size="${6.5 * k}">${txt}</text>`}</g>`;
  }

  // la ruta como grafo (solo los vértices de este edificio)
  const pos = ruta.map(n => nodoEnEdificio(G, n));
  const peso = new Map(E.campus.aristas.map(a => [clave(a.origen, a.destino), a.peso]));
  const cajas = [];
  const choca = (x, y, w, h) => cajas.some(c => Math.abs(x - c.x) < (w + c.w) / 2 && Math.abs(y - c.y) < (h + c.h) / 2);
  // reservar espacio de los nodos resaltados para que las etiquetas de peso no los tapen
  ruta.forEach((n, i) => {
    const p = pos[i];
    if (!p) return;
    const tocado = !o.resaltar || o.resaltar.has(i) || o.resaltar.has(i - 1);
    if (tocado) {
      const r = (i === 0 ? 6 : 4) * k * (o.mini ? 1.2 : 1);
      cajas.push({ x: p.x, y: p.y, w: r * 2, h: r * 2 });
    }
  });
  let aristas = "", pesos = "", nodos = "";
  for (let i = 0; i + 1 < ruta.length; i++) {
    const A = pos[i], B = pos[i + 1];
    if (!A || !B) continue;
    const res = o.resaltar ? o.resaltar.has(i) : true;
    const cls = o.resaltar ? (res ? "resaltada" : "tenue") : "";
    aristas += flecha(A, B, k * (o.mini ? 1.2 : 1), "e3-arista " + cls, 3.4);
    const p = peso.get(clave(ruta[i], ruta[i + 1]));
    const Lr = Math.hypot(B.x - A.x, B.y - A.y);
    if (p !== undefined && res && Lr > 10 * k) {
      const lbl = `${fmt(p)} s`;
      const pw = Math.max(16, lbl.length * 3.8 + 5) * k, ph = 9.5 * k;
      const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2;
      const nx = -(B.y - A.y) / (Lr || 1), ny = (B.x - A.x) / (Lr || 1);
      const candidatos = [
        [mx, my],
        [mx + nx * 8 * k, my + ny * 8 * k],
        [mx - nx * 8 * k, my - ny * 8 * k],
        [mx, my - 9 * k],
        [mx, my + 9 * k],
      ];
      const libre = candidatos.find(([cx, cy]) => !choca(cx, cy, pw, ph));
      if (libre) {
        cajas.push({ x: libre[0], y: libre[1], w: pw + 2 * k, h: ph + 2 * k });
        pesos += `<g class="e3-peso"><rect x="${libre[0] - pw / 2}" y="${libre[1] - ph / 2}" width="${pw}" height="${ph}" rx="${ph / 2}"/><text x="${libre[0]}" y="${libre[1]}" font-size="${6.6 * k}">${fmt(p)} s</text></g>`;
      }
    }
  }
  ruta.forEach((n, i) => {
    const p = pos[i];
    if (!p) return;
    const ini = i === 0, rr = (ini ? 5 : 3.4) * k * (o.mini ? 1.2 : 1);
    const tocado = !o.resaltar || o.resaltar.has(i) || o.resaltar.has(i - 1);
    nodos += `<g class="e3-nodo${ini ? " inicio" : ""}${tocado ? "" : " tenue"}"><title>${esc(n)}</title>
      <circle cx="${p.x}" cy="${p.y}" r="${rr}" stroke-width="${1.3 * k}"/>
      ${ini ? `<text x="${p.x}" y="${p.y}" font-size="${5.5 * k}">Tú</text>` : ""}</g>`;
  });
  const alto = (y1 - y0) / (x1 - x0) * 340;
  return `<svg class="e3d${o.mini ? " mini" : ""}" viewBox="${x0.toFixed(1)} ${y0.toFixed(1)} ${(x1 - x0).toFixed(1)} ${(y1 - y0).toFixed(1)}" style="aspect-ratio:${(x1 - x0).toFixed(1)}/${(y1 - y0).toFixed(1)}" role="img" aria-label="${esc(F.nombre)} por dentro: ${alto > 0 ? G.pisos.length : 0} pisos">
    ${svg}<g>${aristas}</g><g>${pesos}</g><g>${nodos}</g><g>${hitsSvg}</g></svg>`;
}

/* Flecha de A a B (para las aristas dirigidas) en unidades de la vista. */
function flecha(A, B, k, cls, radioB) {
  const dx = B.x - A.x, dy = B.y - A.y, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
  const fin = { x: B.x - ux * (radioB + 0.8) * k, y: B.y - uy * (radioB + 0.8) * k };
  const t = 4.2 * k, w = 2.6 * k;
  return `<line class="${cls}" x1="${A.x}" y1="${A.y}" x2="${fin.x - ux * t * 0.6}" y2="${fin.y - uy * t * 0.6}" stroke-width="${1.8 * k}"/>
    <path class="${cls} punta" d="M${fin.x},${fin.y} L${fin.x - ux * t - uy * w},${fin.y - uy * t + ux * w} L${fin.x - ux * t + uy * w},${fin.y - uy * t - ux * w}Z"/>`;
}

/* ---------- 2) el campus ---------- */

function posCampus(n) {
  if (!PLANO) return null;
  const q = PLANO.posiciones[n];
  const i = lugarInfo(n);
  if (q && !["aula", "pabellon", "escalera"].includes(i.t)) return proyectar(q[0], q[1], 0);
  return null;
}

const CAPAS_MAPA = { bloqueos: true, congestion: true, zonas: true, sinSenal: false };

/* Mapa 3D del campus con el tramo exterior de la ruta. o.resaltar: índices de aristas; o.minW: zoom */
function campusSvg(ruta, o) {
  // dentro de un edificio la ruta se ve en su vista propia: aquí se une con un marcador «Tú»
  const pos = ruta.map(posCampus);
  const L = edificioDe(ruta[0]);
  let pinTu = null;
  if (L && PLANO) {
    const e = PLANO.posiciones[`${L} Salida Este`], w = PLANO.posiciones[`${L} Salida Oeste`];
    if (e && w) pinTu = proyectar((e[0] + w[0]) / 2, (e[1] + w[1]) / 2, 14);
  } else if (pos[0]) pinTu = pos[0];
  const visibles = pos.filter(Boolean).concat(pinTu ? [pinTu] : []);
  if (!visibles.length) return "";
  let vb;
  if (o.vb) vb = o.vb;
  else if (o.completo) vb = [0, 92, MAPA_W, 900];
  else {
    const foco = o.resaltar ? pos.filter((p, i) => p && (o.resaltar.has(i) || o.resaltar.has(i - 1))) : visibles;
    const usar = foco.length ? foco : visibles;
    const xs = usar.map(p => p.x), ys = usar.map(p => p.y);
    const minW = o.minW || 165;
    let x0 = Math.min(...xs) - 55, x1 = Math.max(...xs) + 55, y0 = Math.min(...ys) - 45, y1 = Math.max(...ys) + 40;
    let w = Math.max(x1 - x0, minW), h = Math.max(y1 - y0, w * (o.alto || 0.9));
    w = Math.max(w, h / (o.alto || 0.9));
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    x0 = Math.min(Math.max(cx - w / 2, 0), MAPA_W - w); y0 = Math.min(Math.max(cy - h / 2, 92), MAPA_H - 70 - h);
    vb = [x0, y0, w, h];
  }
  const s = vb[2] / 380;
  const peso = new Map(E.campus.aristas.map(a => [clave(a.origen, a.destino), a.peso]));
  const pFin = pos[pos.length - 1];
  const tuAbajo = pinTu && pFin && pinTu.y >= pFin.y;
  const cajas = [];
  const choca = (x, y, w, h) => cajas.some(c => Math.abs(x - c.x) < (w + c.w) / 2 && Math.abs(y - c.y) < (h + c.h) / 2);
  if (pinTu) {
    const wTu = Math.max(46, String(ruta[0] || "").length * 6.5) * s;
    cajas.push({ x: pinTu.x, y: pinTu.y, w: 22 * s, h: 22 * s });
    cajas.push({ x: pinTu.x, y: tuAbajo ? pinTu.y + 18 * s : pinTu.y - 17 * s, w: wTu, h: 14 * s });
  }
  if (pFin && ruta.length > 1) {
    const wFin = Math.max(58, corto(ruta[ruta.length - 1]).length * 6.8) * s;
    cajas.push({ x: pFin.x, y: pFin.y, w: 22 * s, h: 22 * s });
    cajas.push({ x: pFin.x, y: tuAbajo ? pFin.y - 18 * s : pFin.y + 18 * s, w: wFin, h: 14 * s });
  }
  pos.forEach((p, i) => {
    if (p && i > 0 && i < pos.length - 1) cajas.push({ x: p.x, y: p.y, w: 14 * s, h: 14 * s });
  });
  let aristas = "", pesos = "", nodos = "";
  const primerFuera = pos.findIndex(Boolean);
  if (pinTu && primerFuera > 0) {
    const B = pos[primerFuera];
    aristas += `<line class="r3-dentro" x1="${pinTu.x}" y1="${pinTu.y}" x2="${B.x}" y2="${B.y}" stroke-width="${2.5 * s}" stroke-dasharray="${5 * s} ${4 * s}"/>`;
  }
  for (let i = 0; i + 1 < pos.length; i++) {
    const A = pos[i], B = pos[i + 1];
    if (!A || !B) continue;
    const res = !o.resaltar || o.resaltar.has(i);
    const cls = o.resaltar ? (res ? "r3-arista resaltada" : "r3-arista tenue") : "r3-arista";
    aristas += flecha(A, B, s * 1.85, cls, 5.5);
    const p = peso.get(clave(ruta[i], ruta[i + 1]));
    const Lr = Math.hypot(B.x - A.x, B.y - A.y);
    if (p !== undefined && res && Lr > 20 * s) {
      const lbl = `${fmt(p)} s`;
      const pw = Math.max(24, lbl.length * 5.6 + 7) * s, ph = 14 * s;
      const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2;
      const nx = -(B.y - A.y) / (Lr || 1), ny = (B.x - A.x) / (Lr || 1);
      const candidatos = [
        [mx, my],
        [mx + nx * 14 * s, my + ny * 14 * s],
        [mx - nx * 14 * s, my - ny * 14 * s],
        [mx + 18 * s, my],
        [mx - 18 * s, my],
      ];
      const libre = candidatos.find(([cx, cy]) => !choca(cx, cy, pw, ph));
      if (libre) {
        cajas.push({ x: libre[0], y: libre[1], w: pw + 4 * s, h: ph + 4 * s });
        pesos += `<g class="r3-peso" transform="translate(${libre[0]},${libre[1]})"><rect x="${-pw / 2}" y="${-ph / 2}" width="${pw}" height="${ph}" rx="${ph / 2}"/><text font-size="${8.5 * s}">${fmt(p)} s</text></g>`;
      }
    }
  }
  ruta.forEach((n, i) => {
    const p = pos[i];
    if (!p || (ruta.length === 1 && pinTu)) return;
    const fin = i === ruta.length - 1;
    const rad = (fin ? 10 : 6) * s;
    const etqY = tuAbajo ? p.y - rad - 5 * s : p.y + rad + 12 * s;
    let etqParada = "";
    if (!fin && !o.mini) {
      const txtP = corto(n);
      const pw = Math.max(40, txtP.length * 5.8) * s;
      const py = p.y - rad - 7 * s;
      if (!choca(p.x, py, pw, 13 * s)) {
        cajas.push({ x: p.x, y: py, w: pw + 4 * s, h: 14 * s });
        etqParada = `<text class="r3-etq" x="${p.x}" y="${py}" font-size="${9 * s}" stroke-width="${2.8 * s}">${esc(txtP)}</text>`;
      }
    }
    nodos += `<g class="r3-nodo ${fin ? "meta" : "parada"}"><title>${esc(n)}</title><circle cx="${p.x}" cy="${p.y}" r="${rad}" stroke-width="${2 * s}"/>
      ${fin ? `<text x="${p.x}" y="${p.y}" font-size="${10.5 * s}">●</text><text class="r3-etq" x="${p.x}" y="${etqY}" font-size="${10.5 * s}" stroke-width="${3.2 * s}">${esc(corto(n))}</text>` : etqParada}</g>`;
  });
  if (pinTu) {
    const tuY = tuAbajo ? pinTu.y + 19 * s : pinTu.y - 15 * s;
    nodos += `<g class="r3-nodo inicio"><circle class="r3-pulso" cx="${pinTu.x}" cy="${pinTu.y}" r="${10 * s}" stroke-width="${2 * s}"/>
      <circle cx="${pinTu.x}" cy="${pinTu.y}" r="${10 * s}" stroke-width="${2 * s}"/><text x="${pinTu.x}" y="${pinTu.y}" font-size="${8.5 * s}">Tú</text>
      <text class="r3-etq" x="${pinTu.x}" y="${tuY}" font-size="${10 * s}" stroke-width="${3.2 * s}">${esc(ruta[0])}</text></g>`;
  }
  let halos = "";
  if (CAPAS_MAPA.zonas && E?.campus?.zonasSeguras) {
    for (const z of E.campus.zonasSeguras) {
      const p = posCampus(z);
      if (p) halos += `<circle cx="${p.x}" cy="${p.y}" r="${18 * s}" fill="rgba(0,214,86,0.22)" stroke="rgba(0,168,67,0.65)" stroke-width="${1.6 * s}"/>`;
    }
  }
  if (CAPAS_MAPA.congestion && E?.campus?.congestion) {
    for (const l of Object.keys(E.campus.congestion)) {
      const p = posCampus(l);
      if (p) halos += `<circle cx="${p.x}" cy="${p.y}" r="${20 * s}" fill="rgba(252,210,34,0.32)" stroke="rgba(224,168,0,0.8)" stroke-width="${1.8 * s}"/>`;
    }
  }
  let bloq = "";
  if (CAPAS_MAPA.bloqueos && E?.campus?.bloqueados) {
    for (const b of E.campus.bloqueados) {
      const A = posCampus(b.origen), B = posCampus(b.destino);
      if (A && B) bloq += `<line class="r3-bloq" x1="${A.x}" y1="${A.y}" x2="${B.x}" y2="${B.y}" stroke-width="${3 * s}" stroke-dasharray="${6 * s} ${5 * s}"/>`;
      if (A) halos += `<circle cx="${A.x}" cy="${A.y}" r="${14 * s}" fill="rgba(204,0,0,0.16)" stroke="rgba(204,0,0,0.55)" stroke-width="${1.4 * s}"/>`;
      if (B) halos += `<circle cx="${B.x}" cy="${B.y}" r="${14 * s}" fill="rgba(204,0,0,0.16)" stroke="rgba(204,0,0,0.55)" stroke-width="${1.4 * s}"/>`;
    }
  }
  if (CAPAS_MAPA.sinSenal && E?.campus?.sinSenal) {
    for (const l of E.campus.sinSenal) {
      const p = posCampus(l);
      if (p) halos += `<g><circle cx="${p.x}" cy="${p.y}" r="${15 * s}" fill="rgba(255,255,255,0.9)" stroke="#CC0000" stroke-width="${2 * s}"/><text x="${p.x}" y="${p.y + 3 * s}" text-anchor="middle" font-size="${9 * s}" font-weight="900" fill="#CC0000">✕</text></g>`;
    }
  }
  const pinGps = gpsVivoPt ? `<g id="pin-gps-vivo" transform="translate(${gpsVivoPt.x.toFixed(1)},${gpsVivoPt.y.toFixed(1)})"><circle class="r3-pulso" r="${11 * s}" stroke-width="${2 * s}" fill="rgba(0,128,255,0.22)" stroke="#0080ff"/><circle r="${5.5 * s}" fill="#0080ff" stroke="#ffffff" stroke-width="${2 * s}"/></g>` : `<g id="pin-gps-vivo"></g>`;
  const dinamico = `${halos}${bloq}<g>${aristas}</g><g>${pesos}</g><g>${nodos}</g>${pinGps}`;
  if (o.soloContenido) return dinamico;
  const estilo = o.mini ? `style="aspect-ratio:${vb[2].toFixed(1)}/${vb[3].toFixed(1)}"` : "";
  return `<svg class="c3d${o.mini ? " mini" : " interactivo"}" viewBox="${vb.map(n => n.toFixed(1)).join(" ")}" ${estilo} role="img" aria-label="Ruta sobre el mapa 3D del campus">
    <image href="/static/img/mapa-campus-3d.svg" width="${MAPA_W}" height="${MAPA_H}"/>
    <rect x="0" y="0" width="${MAPA_W}" height="${MAPA_H}" class="r3-velo"/>
    <g id="capa-dinamica-campus">${dinamico}</g></svg>`;
}

function fallback2DSvg(ruta = []) {
  const w = 360, h = 220;
  const pts = (ruta && ruta.length ? ruta : [miLugar || "Campus"]).map((n, i, arr) => {
    const x = arr.length === 1 ? w / 2 : 34 + (i / (arr.length - 1)) * (w - 68);
    const y = h / 2 + Math.sin(i * 1.1) * 32;
    return { n, x, y };
  });
  const poly = pts.length > 1 ? `<polyline points="${pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")}" fill="none" stroke="#0080ff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>` : "";
  const circs = pts.map((p, i) => `<g><circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${i === 0 || i === pts.length - 1 ? 8 : 5}" fill="${i === 0 ? "#0080ff" : i === pts.length - 1 ? "#00a843" : "#ffffff"}" stroke="#0b2a4a" stroke-width="2"/><text x="${p.x.toFixed(1)}" y="${(p.y + (i % 2 ? 18 : -13)).toFixed(1)}" text-anchor="middle" font-size="9" font-weight="700" fill="currentColor">${esc(corto(p.n))}</text></g>`).join("");
  return `<svg class="c3d fallback-2d" viewBox="0 0 ${w} ${h}" role="img" aria-label="Esquema 2D de ruta de evacuación">${poly}${circs}</svg>`;
}

/* Vista pequeña de un paso: por dentro del edificio, o el tramo por el campus. */
function vistaPaso(r, p) {
  if (!PLANO) return "";
  const resaltar = new Set();
  for (let i = p.desde; i < p.hasta; i++) resaltar.add(i);
  const L = p.tipo === "cruce"
    ? edificioDe(r.ruta[p.hasta])
    : (edificioDe(r.ruta[p.desde]) || edificioDe(r.ruta[p.hasta]));
  if (L && (p.tipo === "pasillo" || p.tipo === "escalera" || p.tipo === "salida" || p.tipo === "cruce")) {
    const G = geomEdificio(L);
    if (G && nodoEnEdificio(G, r.ruta[p.desde]) && nodoEnEdificio(G, r.ruta[p.hasta])) {
      return edificio3D(L, { ruta: r.ruta, resaltar, mini: true });
    }
  }
  return campusSvg(r.ruta, { resaltar, mini: true, minW: 155, alto: 0.65 });
}

let ultEdificioVista = "";
let camCampus = null;      // [x, y, w, h] actual del mapa interactivo
let camCampusIni = null;   // [x, y, w, h] inicial de la ruta para "Centrar"
let ultClaveCampus = "";

function acotarCamara(vb) {
  let [x, y, w, h] = vb;
  const ratio = h / (w || 1);
  w = Math.min(MAPA_W, Math.max(100, w));
  h = w * ratio;
  if (h > MAPA_H) { h = MAPA_H; w = h / ratio; }
  x = Math.min(Math.max(x, 0), MAPA_W - w);
  y = Math.min(Math.max(y, 0), MAPA_H - h);
  return [x, y, w, h];
}

function aplicarCamaraCampus(vb) {
  const svg = $("#mapa-campus svg.c3d");
  if (!svg || !vb) return;
  camCampus = acotarCamara(vb);
  svg.setAttribute("viewBox", camCampus.map(n => n.toFixed(1)).join(" "));
}

function zoomCampus(factorZoom, cxSvg, cySvg) {
  if (!camCampus) return;
  const [x, y, w, h] = camCampus;
  const cx = cxSvg !== undefined ? cxSvg : x + w / 2;
  const cy = cySvg !== undefined ? cySvg : y + h / 2;
  const nw = w * factorZoom, nh = h * factorZoom;
  const nx = cx - ((cx - x) / w) * nw;
  const ny = cy - ((cy - y) / h) * nh;
  aplicarCamaraCampus([nx, ny, nw, nh]);
}

let gpsVivoPt = null;
let gpsVivoActivo = false;

function actualizarPinGpsEnSvg() {
  const pin = $("#capa-dinamica-campus #pin-gps-vivo");
  if (!pin) return;
  if (!gpsVivoPt || !camCampus) { pin.innerHTML = ""; pin.removeAttribute("transform"); return; }
  const s = camCampus[2] / 380;
  pin.setAttribute("transform", `translate(${gpsVivoPt.x.toFixed(1)},${gpsVivoPt.y.toFixed(1)})`);
  pin.innerHTML = `<circle class="r3-pulso" r="${11 * s}" stroke-width="${2 * s}" fill="rgba(0,128,255,0.22)" stroke="#0080ff"/><circle r="${5.5 * s}" fill="#0080ff" stroke="#ffffff" stroke-width="${2 * s}"/>`;
}

function actualizarSeguimientoGpsEmergencia() {
  const activo = Boolean(E && E.emergencia);
  const U = window.UnexuamUbicacion;
  if (!activo || !U || typeof U.seguir !== "function") {
    if (gpsVivoActivo) {
      gpsVivoActivo = false;
      gpsVivoPt = null;
      U?.detener?.();
      actualizarPinGpsEnSvg();
    }
    return;
  }
  if (gpsVivoActivo) return;
  gpsVivoActivo = true;
  U.seguir(r => {
    if (r && Array.isArray(r.xy) && PROY) {
      gpsVivoPt = proyectar(r.xy[0], r.xy[1], 4);
      actualizarPinGpsEnSvg();
    }
  }, () => { gpsVivoActivo = false; }, () => 1);
}

function conectarPanZoomCampus() {
  const cont = $("#mapa-campus");
  if (!cont || cont.dataset.pz) return;
  cont.dataset.pz = "1";
  const ptrs = new Map();
  let estado = null;
  let rafId = 0;
  let inerciaId = 0;
  let vbPendiente = null;
  let vel = { x: 0, y: 0, t: 0, lx: 0, ly: 0 };

  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

  const pararInercia = () => {
    if (inerciaId) { cancelAnimationFrame(inerciaId); inerciaId = 0; }
  };

  const commit = () => {
    if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
    const svg = cont.querySelector("svg.c3d");
    if (svg) svg.style.transform = "";
    if (vbPendiente) {
      aplicarCamaraCampus(vbPendiente);
      vbPendiente = null;
    }
  };

  const iniciar = () => {
    pararInercia();
    commit();
    if (!camCampus) return;
    const svg = cont.querySelector("svg.c3d");
    const rect = svg ? svg.getBoundingClientRect() : null;
    if (!rect || !rect.width || !rect.height) return;
    const arr = [...ptrs.values()];
    if (arr.length === 1) {
      estado = { modo: "pan", p0: { ...arr[0] }, vb0: [...camCampus], rect };
      vel = { x: 0, y: 0, t: performance.now(), lx: arr[0].x, ly: arr[0].y };
    } else if (arr.length >= 2) {
      estado = { modo: "pinch", d0: dist(arr[0], arr[1]) || 1, m0: mid(arr[0], arr[1]), vb0: [...camCampus], rect };
    }
  };

  const aplicarTransformGPU = () => {
    rafId = 0;
    if (!estado || !vbPendiente) return;
    const svg = cont.querySelector("svg.c3d");
    if (!svg) return;
    const [x0, y0, w0] = estado.vb0;
    const [nx, ny, nw, nh] = vbPendiente;
    const scale = w0 / nw;
    const tx = -(nx - x0) * (estado.rect.width / nw);
    const ty = -(ny - y0) * (estado.rect.height / nh);
    svg.style.transformOrigin = "0 0";
    svg.style.transform = `translate3d(${tx.toFixed(1)}px, ${ty.toFixed(1)}px, 0) scale(${scale.toFixed(4)})`;
  };

  cont.addEventListener("pointerdown", ev => {
    if (ev.target.closest(".mapa-controles")) return;
    cont.setPointerCapture(ev.pointerId);
    ptrs.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    iniciar();
  });
  cont.addEventListener("pointermove", ev => {
    if (!ptrs.has(ev.pointerId) || !estado) return;
    ptrs.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    const { rect, vb0 } = estado;
    if (estado.modo === "pan" && ptrs.size === 1) {
      const p = ptrs.get(ev.pointerId);
      const now = performance.now();
      const dt = Math.max(8, now - vel.t);
      vel = { x: ((p.x - vel.lx) / dt) * 16, y: ((p.y - vel.ly) / dt) * 16, t: now, lx: p.x, ly: p.y };
      const dx = (p.x - estado.p0.x) * (vb0[2] / rect.width);
      const dy = (p.y - estado.p0.y) * (vb0[3] / rect.height);
      vbPendiente = acotarCamara([vb0[0] - dx, vb0[1] - dy, vb0[2], vb0[3]]);
    } else if (ptrs.size >= 2) {
      const [a, b] = [...ptrs.values()];
      const d = dist(a, b) || 1;
      const m = mid(a, b);
      const esc = estado.d0 / d;
      const nw = vb0[2] * esc, nh = vb0[3] * esc;
      const fx = (estado.m0.x - rect.left) / rect.width;
      const fy = (estado.m0.y - rect.top) / rect.height;
      const sx = vb0[0] + fx * vb0[2];
      const sy = vb0[1] + fy * vb0[3];
      const f2x = (m.x - rect.left) / rect.width;
      const f2y = (m.y - rect.top) / rect.height;
      vbPendiente = acotarCamara([sx - f2x * nw, sy - f2y * nh, nw, nh]);
    } else {
      return;
    }
    if (!rafId) rafId = requestAnimationFrame(aplicarTransformGPU);
  });
  const soltar = ev => {
    const eraPan = estado && estado.modo === "pan" && ptrs.size === 1;
    const rectUlt = estado?.rect;
    ptrs.delete(ev.pointerId);
    commit();
    if (ptrs.size === 0) {
      estado = null;
      if (eraPan && rectUlt && camCampus && Math.hypot(vel.x, vel.y) > 1.8 && (performance.now() - vel.t) < 90) {
        let vx = vel.x, vy = vel.y;
        const pasoInercia = () => {
          vx *= 0.88; vy *= 0.88;
          if (Math.hypot(vx, vy) < 0.35 || !camCampus) { inerciaId = 0; return; }
          const dx = vx * (camCampus[2] / rectUlt.width);
          const dy = vy * (camCampus[3] / rectUlt.height);
          aplicarCamaraCampus([camCampus[0] - dx, camCampus[1] - dy, camCampus[2], camCampus[3]]);
          inerciaId = requestAnimationFrame(pasoInercia);
        };
        inerciaId = requestAnimationFrame(pasoInercia);
      }
    } else iniciar();
  };
  cont.addEventListener("pointerup", soltar);
  cont.addEventListener("pointercancel", soltar);
  cont.addEventListener("wheel", ev => {
    if (!camCampus) return;
    ev.preventDefault();
    const svg = cont.querySelector("svg.c3d");
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const cx = camCampus[0] + ((ev.clientX - rect.left) / rect.width) * camCampus[2];
    const cy = camCampus[1] + ((ev.clientY - rect.top) / rect.height) * camCampus[3];
    zoomCampus(ev.deltaY > 0 ? 1.18 : 0.84, cx, cy);
  }, { passive: false });
  cont.addEventListener("dblclick", ev => {
    if (!camCampus || ev.target.closest(".mapa-controles")) return;
    const svg = cont.querySelector("svg.c3d");
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const cx = camCampus[0] + ((ev.clientX - rect.left) / rect.width) * camCampus[2];
    const cy = camCampus[1] + ((ev.clientY - rect.top) / rect.height) * camCampus[3];
    zoomCampus(0.68, cx, cy);
  });
}

function renderMapa3D(r, pasos = []) {
  const cajaEd = $("#lienzo-edificio");
  const contMapa = $("#mapa-campus");
  conectarPanZoomCampus();
  const controlesHtml = `<span class="mapa-brujula" aria-hidden="true">N ↑</span>
    <div class="mapa-controles" aria-label="Controles del mapa">
    <button type="button" data-accion="mapa-mas" aria-label="Acercar">+</button>
    <button type="button" data-accion="mapa-menos" aria-label="Alejar">−</button>
    <button type="button" data-accion="mapa-centrar" aria-label="Centrar en mi ruta">◎</button>
    <button type="button" data-accion="mapa-gps" aria-label="Mi ubicación GPS">⌖</button>
  </div>`;
  if (planoEstado === "cargando" && !PLANO) {
    contMapa.innerHTML = `<div class="mapa-estado-carga" role="status"><div class="mapa-skeleton"></div><p class="nota">Cargando plano del campus…</p></div>`;
    return;
  }
  if (planoEstado === "error" && !PLANO) {
    cajaEd.hidden = true; $("#t-edificio").hidden = true;
    $("#campus-cab").innerHTML = `<span>Plano 3D no disponible · Vista esquemática 2D</span>`;
    contMapa.innerHTML = `<div class="mapa-estado-error">${fallback2DSvg(r?.ruta || [])}<div class="mapa-error-pie"><p class="nota">No se pudo cargar el plano 3D.</p><button type="button" class="btn mini" data-accion="reintentar-plano">Reintentar</button></div></div>`;
    return;
  }
  if (!r || !r.ruta.length || !PLANO) {
    cajaEd.hidden = true; $("#t-edificio").hidden = true; ultEdificioVista = ""; ultClaveCampus = "";
    const sinSalida = r && r.origen && r.tiempo === null;
    $("#campus-cab").innerHTML = `<span>${sinSalida ? `Sin salida libre desde <b>${esc(r.origen)}</b>.` : "Elige dónde estás para ver tu ruta en el mapa."}</span>`;
    const svgHtml = PLANO ? (campusSvg(sinSalida ? [r.origen] : [], { completo: !sinSalida, minW: 180, alto: 0.9 }) || `<svg class="c3d interactivo" viewBox="0 92 ${MAPA_W} 900"><image href="/static/img/mapa-campus-3d.svg" width="${MAPA_W}" height="${MAPA_H}"/><g id="capa-dinamica-campus"></g></svg>`) : "";
    contMapa.innerHTML = svgHtml + (svgHtml ? controlesHtml : "");
    const vbAttr = contMapa.querySelector("svg.c3d")?.getAttribute("viewBox");
    if (vbAttr) { camCampusIni = vbAttr.split(" ").map(Number); camCampus = [...camCampusIni]; }
    return;
  }
  let resaltar = null;
  if (pasoActivo >= 0 && pasos[pasoActivo]) {
    resaltar = new Set();
    for (let i = pasos[pasoActivo].desde; i < pasos[pasoActivo].hasta; i++) resaltar.add(i);
  }
  const L = edificioDe(r.ruta[0]);
  cajaEd.hidden = !L; $("#t-edificio").hidden = !L;
  if (L) {
    const G = geomEdificio(L);
    $("#t-edificio").textContent = `${FACHADA[L].nombre} por dentro`;
    const extraEsc = L === "B" || L === "C" ? ", escaleras en los extremos y escalera central B–C" : " y una escalera en cada extremo";
    $("#edificio-cab").innerHTML = `<span><b>${G ? G.pisos.length : ""} pisos</b> · aulas, pabellones este y oeste${extraEsc}</span>`;
    const caja = $("#vista-edificio");
    const claveEd = `${L}:${r.origen}`;
    const scrollPrev = caja.scrollLeft;
    caja.innerHTML = edificio3D(L, { ruta: r.ruta, resaltar });
    if (claveEd === ultEdificioVista) {
      caja.scrollLeft = scrollPrev;
    } else {
      ultEdificioVista = claveEd;
      const svgEd = caja.querySelector("svg"), tu = caja.querySelector(".e3-nodo.inicio circle");
      if (svgEd && tu) requestAnimationFrame(() => {
        const vb = svgEd.viewBox.baseVal, f = (Number(tu.getAttribute("cx")) - vb.x) / vb.width;
        caja.scrollLeft = f * caja.scrollWidth - caja.clientWidth * 0.6;
      });
    }
  } else {
    ultEdificioVista = "";
  }
  const claveCampus = `${r.origen}:${pasoActivo}:${mapaCompleto}`;
  const usarCamaraGuardada = claveCampus === ultClaveCampus && camCampus;
  const capaExistente = contMapa.querySelector("svg.c3d.interactivo #capa-dinamica-campus");
  if (capaExistente) {
    capaExistente.innerHTML = campusSvg(r.ruta, { completo: mapaCompleto, resaltar, minW: 165, alto: 0.9, vb: usarCamaraGuardada ? camCampus : null, soloContenido: true });
    if (!usarCamaraGuardada) {
      const vbTmp = campusSvg(r.ruta, { completo: mapaCompleto, resaltar, minW: 165, alto: 0.9 }).match(/viewBox="([^"]+)"/)?.[1];
      if (vbTmp) {
        const parsed = vbTmp.split(" ").map(Number);
        camCampusIni = [...parsed];
        aplicarCamaraCampus(parsed);
        ultClaveCampus = claveCampus;
      }
    }
  } else {
    contMapa.innerHTML = campusSvg(r.ruta, { completo: mapaCompleto, resaltar, minW: 165, alto: 0.9, vb: usarCamaraGuardada ? camCampus : null }) + controlesHtml;
    const vbAttr = contMapa.querySelector("svg.c3d")?.getAttribute("viewBox");
    if (vbAttr) {
      const parsed = vbAttr.split(" ").map(Number);
      if (!usarCamaraGuardada) { camCampusIni = [...parsed]; camCampus = [...parsed]; ultClaveCampus = claveCampus; }
    }
  }
  const nV = r.ruta.length, nA = nV - 1;
  $("#campus-cab").innerHTML = `<span><b>${nV} ${nV === 1 ? "punto" : "puntos"} · ${nA} ${nA === 1 ? "tramo" : "tramos"}</b> · arrastra o pellizca</span>
    <button class="btn mini" data-accion="mapa-zoom">${mapaCompleto ? "Acercar ruta" : "Todo el campus"}</button>`;
}

/* --------------------------------------------------------------- admin */

function renderAdmin() {
  const g = grafoAdmin === "mesh" ? E.mesh : E.campus;
  const esMesh = grafoAdmin === "mesh";
  const opsV = g.vertices.map(v => ({ v, t: v }));
  const opsA = g.aristas.map(a => ({ v: JSON.stringify([a.origen, a.destino]), t: `${a.origen} → ${a.destino} (${fmt(a.peso)})`, o: a.origen }));
  $$("[data-vertices]").forEach(s => (esMesh ? llenar(s, opsV) : llenarAgrupado(s, opsV, "", o => grupoLugar(o.v))));
  $$("[data-aristas]").forEach(s => (esMesh ? llenar(s, opsA) : llenarAgrupado(s, opsA, "", o => grupoLugar(o.o))));
  $$("[data-grafo]").forEach(b => b.setAttribute("aria-selected", String(b.dataset.grafo === grafoAdmin)));
  $$(".solo-campus").forEach(el => { el.hidden = grafoAdmin !== "campus"; });
  $("#lbl-nombre").textContent = esMesh ? "Nombre del teléfono" : "Nombre del lugar";
  $("[data-form='v-insertar'] input[name='nombre']").placeholder = esMesh ? "Ej.: Tel-Camila" : "Ej.: Aula 301";
  $("#lbl-peso").textContent = esMesh ? "Peso (retardo en segundos)" : "Peso (tiempo de paso en segundos)";

  const reportes = E.reportesBloqueo || [];
  const listaReportes = $("#reportes-bloqueo");
  listaReportes.innerHTML = reportes.map(r => `<li>
    <b>${esc(r.origen)} → ${esc(r.destino)}</b>
    <span>CIF ${esc(r.autor)}</span>
    <div>
      <button type="button" class="btn mini" data-resolver-bloqueo="${esc(r.id)}" data-decision="aprobar">Aprobar</button>
      <button type="button" class="btn mini" data-resolver-bloqueo="${esc(r.id)}" data-decision="descartar">Descartar</button>
    </div>
  </li>`).join("") || '<li class="nota">Sin reportes pendientes.</li>';

  const zonas = new Set(E.campus.zonasSeguras);
  $("#adyacencia").innerHTML = g.vertices.length ? g.vertices.map(v => {
    const sal = g.aristas.filter(a => a.origen === v);
    return `<li><b>${esc(v)}${!esMesh && zonas.has(v) ? " · zona segura" : ""}</b><span>${sal.length ? sal.map(a => `${esc(a.destino)} (${fmt(a.peso)} s)`).join(" · ") : "Sin salidas"}</span></li>`;
  }).join("") : `<li class="nota">Sin elementos en este grafo.</li>`;

  const fbEst = $("#fb-admin-estado");
  const btnFbSalir = $("#btn-fb-admin-salir");
  const authed = Boolean(window.UNEXO_NUBE && window.UNEXO_NUBE.tieneAuthAdmin && window.UNEXO_NUBE.tieneAuthAdmin());
  if (fbEst) fbEst.textContent = authed ? "Conectado a Firebase Admin (escritura campus/estado habilitada)." : "Sin autenticar en Firebase (solo lectura pública / red local).";
  if (btnFbSalir) btnFbSalir.hidden = !authed;
}

/* ---------------------------------------------------------------- tabs */

let bannerEmergenciaOculto = false;
let textoEmergenciaExtra = "";
let claveModalEmergencia = "";
let focoPrevioModal = null;

const PASOS_EMERGENCIA = {
  sismo: [
    "Agáchate y cúbrete cabeza y cuello lejos de ventanas.",
    "Al terminar el movimiento, evacúa caminando a tu punto seguro.",
  ],
  incendio: [
    "Aléjate del humo avanzando agachado; no uses elevadores.",
    "Sigue tu ruta segura hacia Plazoleta o Canchas sin regresar.",
  ],
  inundacion: [
    "Aléjate de parqueos bajos, drenajes y cables húmedos.",
    "Resguárdate en piso 2 o 3 si el agua sube en planta baja.",
  ],
  general: [
    "Mantén la calma y sigue la ruta más corta en Evacuar.",
    "Reporta pasillos bloqueados o pide ayuda en el Canal General.",
  ],
};

function mostrarModalEmergencia(opts = {}) {
  const capa = $("#modal-emergencia");
  const carta = $("#modal-em-carta");
  if (!capa || !carta || document.body.classList.contains("sin-sesion")) return;
  const clave = opts.clave || (opts.forzar ? `prueba:${Date.now()}` : `${opts.tipo || "general"}:${opts.titulo || ""}:${opts.texto || ""}`);
  if (clave === claveModalEmergencia && !opts.forzar) return;
  claveModalEmergencia = clave;
  const tipo = PASOS_EMERGENCIA[opts.tipo] ? opts.tipo : "general";
  carta.className = `modal-em-carta t-${tipo}`;
  const badges = { sismo: "SISMO / TEMBLOR", incendio: "INCENDIO ACTIVO", inundacion: "INUNDACIÓN", general: "EMERGENCIA ACTIVA" };
  const imgs = {
    incendio: "/static/img/figma/tarjeta-incendio.jpg",
    sismo: "/static/img/figma/tarjeta-sismo.jpg",
    inundacion: "/static/img/figma/tarjeta-inundacion.jpg",
    general: "/static/img/ico-fuego.png",
  };
  const imgEl = $("#modal-em-img");
  if (imgEl) imgEl.src = imgs[tipo] || imgs.general;
  $("#modal-em-badge").textContent = badges[tipo];
  $("#modal-em-titulo").textContent = opts.titulo || "Emergencia en el campus";
  $("#modal-em-desc").textContent = opts.texto || "Sigue tu ruta de evacuación hacia el punto seguro más cercano.";
  $("#modal-em-pasos").innerHTML = PASOS_EMERGENCIA[tipo].map((p, i) => `<li><b>${i + 1}</b><span>${esc(p)}</span></li>`).join("");
  focoPrevioModal = document.activeElement;
  capa.hidden = false;
  if (history.pushState) history.pushState({ modalEm: true }, "");
  if (opts.oficial && document.body.classList.contains("modo-invitado") && window.UnexuamNativo?.lanzarAlarmaEmergencia) {
    window.UnexuamNativo.lanzarAlarmaEmergencia(tipo, $("#modal-em-titulo").textContent, $("#modal-em-desc").textContent);
  } else if (window.iniciarAlarmaEmergencia) {
    window.iniciarAlarmaEmergencia();
  } else if (window.sonarAlerta) {
    window.sonarAlerta();
  }
  requestAnimationFrame(() => $("#modal-em-ir")?.focus());
}
window.mostrarModalEmergencia = mostrarModalEmergencia;

function cerrarModalEmergencia() {
  if (window.detenerAlarmaEmergencia) window.detenerAlarmaEmergencia();
  const capa = $("#modal-emergencia");
  if (!capa || capa.hidden) return;
  capa.hidden = true;
  if (focoPrevioModal && typeof focoPrevioModal.focus === "function") focoPrevioModal.focus();
  focoPrevioModal = null;
}
window.cerrarModalEmergencia = cerrarModalEmergencia;

function evaluarEmergenciaAutomatica() {
  if (!E || document.body.classList.contains("sin-sesion")) return;
  const em = E.emergencia;
  if (!em) {
    if (claveModalEmergencia.startsWith("prueba:")) return;
    claveModalEmergencia = "";
    cerrarModalEmergencia();
    return;
  }
  const claveNueva = `em:${em.id || em.hora}:${em.tipo}`;
  if (claveNueva !== claveModalEmergencia && window.activarGpsEmergencia) {
    window.activarGpsEmergencia();
  }
  mostrarModalEmergencia({
    clave: claveNueva,
    oficial: E.emergenciaOficial,
    tipo: em.tipo,
    titulo: em.titulo,
    texto: em.texto,
  });
}

/* ---------- Selector Visual 3D de Campus y Fachada Frontal de Edificio ---------- */
const EDIFICIOS_MULTI = ["B", "C", "P"];
const LUGARES_DESTACADOS = [
  { id: "B", label: "Edificio B", sub: "3 pisos", multi: true, ref: "B Salida Oeste", rx: 86, ry: 42 },
  { id: "C", label: "Edificio C", sub: "3 pisos", multi: true, ref: "C Salida Este", rx: 82, ry: 40 },
  { id: "P", label: "Edificio P", sub: "3 pisos", multi: true, ref: "P Salida Oeste", rx: 92, ry: 44 },
  { id: "Edificio E", label: "Edificio E", sub: "Campus", multi: false, ref: "Edificio E", rx: 56, ry: 34 },
  { id: "Auditorio Central", label: "Auditorio Central", sub: "Campus", multi: false, ref: "Auditorio Central", rx: 64, ry: 38 },
  { id: "Edificio I", label: "Edificio I", sub: "Biblioteca", multi: false, ref: "Edificio I", rx: 60, ry: 36 },
  { id: "Edificio A", label: "Edificio A", sub: "Campus", multi: false, ref: "Edificio A", rx: 52, ry: 32 },
  { id: "Edificio D", label: "Edificio D", sub: "Campus", multi: false, ref: "Edificio D", rx: 52, ry: 32 },
  { id: "Food Court", label: "Food Court", sub: "Campus", multi: false, ref: "Food Court", rx: 52, ry: 32 },
];

function abrirSelectorUbicacion() {
  const capa = $("#modal-ubicacion");
  if (!capa || !E) return;
  focoPrevioModal = document.activeElement;
  renderPasoCampus();
  capa.hidden = false;
  if (history.pushState) history.pushState({ modalUb: true }, "");
  requestAnimationFrame(() => $(".modal-ub-x", capa)?.focus());
}
window.abrirSelectorUbicacion = abrirSelectorUbicacion;

function cerrarSelectorUbicacion() {
  const capa = $("#modal-ubicacion");
  if (!capa || capa.hidden) return;
  capa.hidden = true;
  if (focoPrevioModal && typeof focoPrevioModal.focus === "function") focoPrevioModal.focus();
  focoPrevioModal = null;
}
window.cerrarSelectorUbicacion = cerrarSelectorUbicacion;

let ubCam = [380, 180, 860, 640];
let ubEdificioActual = null;
let ubPisoFiltro = 0;

function acotarCamUb(vb) {
  let [x, y, w, h] = vb;
  const ratio = h / (w || 1);
  w = Math.min(MAPA_W, Math.max(320, w));
  h = w * ratio;
  if (h > MAPA_H) { h = MAPA_H; w = h / ratio; }
  x = Math.min(Math.max(x, 0), MAPA_W - w);
  y = Math.min(Math.max(y, 60), MAPA_H - h);
  return [x, y, w, h];
}

function aplicarCamUb(vb) {
  const svg = $("#ub-mapa-wrap svg.ub-mapa-svg");
  if (!svg || !vb) return;
  ubCam = acotarCamUb(vb);
  svg.setAttribute("viewBox", ubCam.map(n => n.toFixed(1)).join(" "));
}

function conectarPanZoomUb() {
  const wrap = $("#ub-mapa-wrap");
  if (!wrap || wrap.dataset.pzUb) return;
  wrap.dataset.pzUb = "1";
  let ptrs = new Map(), st = null, rafId = 0, inerciaId = 0, vbPendiente = null;
  let vel = { x: 0, y: 0, t: 0, lx: 0, ly: 0 };
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const pararInercia = () => { if (inerciaId) { cancelAnimationFrame(inerciaId); inerciaId = 0; } };
  const commit = () => {
    if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
    const svg = wrap.querySelector("svg.ub-mapa-svg");
    if (svg) svg.style.transform = "";
    if (vbPendiente) { aplicarCamUb(vbPendiente); vbPendiente = null; }
  };
  const ini = () => {
    pararInercia();
    commit();
    const svg = wrap.querySelector("svg.ub-mapa-svg");
    const r = svg ? svg.getBoundingClientRect() : null;
    if (!r || !r.width || !r.height) return;
    const arr = [...ptrs.values()];
    if (arr.length === 1) {
      st = { m: "pan", p0: { ...arr[0] }, vb0: [...ubCam], r, mov: false };
      vel = { x: 0, y: 0, t: performance.now(), lx: arr[0].x, ly: arr[0].y };
    } else if (arr.length >= 2) {
      st = { m: "pinch", d0: dist(arr[0], arr[1]) || 1, m0: mid(arr[0], arr[1]), vb0: [...ubCam], r, mov: true };
    }
  };
  const pintarGPU = () => {
    rafId = 0;
    if (!st || !vbPendiente) return;
    const svg = wrap.querySelector("svg.ub-mapa-svg");
    if (!svg) return;
    const [x0, y0, w0] = st.vb0;
    const [nx, ny, nw, nh] = vbPendiente;
    const scale = w0 / nw;
    const tx = -(nx - x0) * (st.r.width / nw);
    const ty = -(ny - y0) * (st.r.height / nh);
    svg.style.transformOrigin = "0 0";
    svg.style.transform = `translate3d(${tx.toFixed(1)}px, ${ty.toFixed(1)}px, 0) scale(${scale.toFixed(4)})`;
  };
  wrap.addEventListener("pointerdown", ev => {
    if (ev.target.closest(".ub-zoom-bar") || ev.target.closest("[data-ub-ed]")) return;
    wrap.setPointerCapture?.(ev.pointerId);
    ptrs.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    ini();
  });
  wrap.addEventListener("pointermove", ev => {
    if (!ptrs.has(ev.pointerId) || !st) return;
    ptrs.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    const { r, vb0 } = st;
    if (st.m === "pan" && ptrs.size === 1) {
      const p = ptrs.get(ev.pointerId);
      if (Math.hypot(p.x - st.p0.x, p.y - st.p0.y) > 8) st.mov = true;
      if (!st.mov) return;
      const now = performance.now();
      const dt = Math.max(8, now - vel.t);
      vel = { x: ((p.x - vel.lx) / dt) * 16, y: ((p.y - vel.ly) / dt) * 16, t: now, lx: p.x, ly: p.y };
      const dx = (p.x - st.p0.x) * (vb0[2] / r.width);
      const dy = (p.y - st.p0.y) * (vb0[3] / r.height);
      vbPendiente = acotarCamUb([vb0[0] - dx, vb0[1] - dy, vb0[2], vb0[3]]);
    } else if (ptrs.size >= 2) {
      const [a, b] = [...ptrs.values()];
      const escF = st.d0 / (dist(a, b) || 1);
      const nw = vb0[2] * escF, nh = vb0[3] * escF;
      const m = mid(a, b);
      const fx = (st.m0.x - r.left) / r.width, fy = (st.m0.y - r.top) / r.height;
      const sx = vb0[0] + fx * vb0[2], sy = vb0[1] + fy * vb0[3];
      const f2x = (m.x - r.left) / r.width, f2y = (m.y - r.top) / r.height;
      vbPendiente = acotarCamUb([sx - f2x * nw, sy - f2y * nh, nw, nh]);
    } else {
      return;
    }
    if (!rafId) rafId = requestAnimationFrame(pintarGPU);
  });
  const fin = ev => {
    const eraPan = st && st.m === "pan" && st.mov && ptrs.size === 1;
    const rectUlt = st?.r;
    ptrs.delete(ev.pointerId);
    commit();
    if (ptrs.size === 0) {
      st = null;
      if (eraPan && rectUlt && Math.hypot(vel.x, vel.y) > 1.8 && (performance.now() - vel.t) < 90) {
        let vx = vel.x, vy = vel.y;
        const paso = () => {
          vx *= 0.88; vy *= 0.88;
          if (Math.hypot(vx, vy) < 0.35) { inerciaId = 0; return; }
          const dx = vx * (ubCam[2] / rectUlt.width), dy = vy * (ubCam[3] / rectUlt.height);
          aplicarCamUb([ubCam[0] - dx, ubCam[1] - dy, ubCam[2], ubCam[3]]);
          inerciaId = requestAnimationFrame(paso);
        };
        inerciaId = requestAnimationFrame(paso);
      }
    } else ini();
  };
  wrap.addEventListener("pointerup", fin);
  wrap.addEventListener("pointercancel", fin);
  wrap.addEventListener("wheel", ev => {
    ev.preventDefault();
    const svg = wrap.querySelector("svg.ub-mapa-svg");
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const f = ev.deltaY > 0 ? 1.18 : 0.84;
    const cx = ubCam[0] + ((ev.clientX - rect.left) / rect.width) * ubCam[2];
    const cy = ubCam[1] + ((ev.clientY - rect.top) / rect.height) * ubCam[3];
    const nw = ubCam[2] * f, nh = ubCam[3] * f;
    aplicarCamUb([cx - ((cx - ubCam[0]) / ubCam[2]) * nw, cy - ((cy - ubCam[1]) / ubCam[3]) * nh, nw, nh]);
  }, { passive: false });
  wrap.addEventListener("dblclick", ev => {
    if (ev.target.closest(".ub-zoom-bar")) return;
    const svg = wrap.querySelector("svg.ub-mapa-svg");
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const cx = ubCam[0] + ((ev.clientX - rect.left) / rect.width) * ubCam[2];
    const cy = ubCam[1] + ((ev.clientY - rect.top) / rect.height) * ubCam[3];
    const nw = ubCam[2] * 0.72, nh = ubCam[3] * 0.72;
    aplicarCamUb([cx - ((cx - ubCam[0]) / ubCam[2]) * nw, cy - ((cy - ubCam[1]) / ubCam[3]) * nh, nw, nh]);
  });
}

function renderPasoCampus() {
  $("#ub-paso-campus").hidden = false;
  $("#ub-paso-frente").hidden = true;
  $("#ub-volver").hidden = true;
  $("#modal-ub-titulo").textContent = "Elige tu edificio";
  $("#modal-ub-sub").textContent = "Arrastra, acerca y toca tu edificio en el mapa 3D";
  ubCam = [380, 180, 860, 640];

  const verts = new Set(E.campus.vertices);
  const disponibles = LUGARES_DESTACADOS.filter(x => x.multi || verts.has(x.id));

  const wrap = $("#ub-mapa-wrap");
  conectarPanZoomUb();
  if (PLANO && PROY) {
    let areas = "";
    const polsPorNombre = new Map();
    if (AREAS_UBIC && Array.isArray(AREAS_UBIC.areas)) {
      for (const a of AREAS_UBIC.areas) {
        if (!Array.isArray(a.pol) || a.pol.length < 3) continue;
        const clave = a.edificio || a.vertice || a.nombre;
        if (clave && !polsPorNombre.has(clave)) polsPorNombre.set(clave, a.pol);
      }
    }
    for (const item of disponibles) {
      const polReal = polsPorNombre.get(item.id) || polsPorNombre.get(item.label) || polsPorNombre.get(item.ref);
      if (polReal) {
        const pts = polReal.map(([x, y]) => {
          const p = proyectar(x, y, 4);
          return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
        }).join(" ");
        areas += `<polygon class="ub-hit-area${item.multi ? " multinivel" : ""}" points="${pts}" data-ub-ed="${esc(item.id)}" data-ub-multi="${item.multi ? "1" : "0"}" role="button" tabindex="0" aria-label="${esc(item.label)}"/>`;
        continue;
      }
      let xy = null;
      if (item.multi) {
        const pe = PLANO.posiciones[`${item.id} Salida Este`];
        const po = PLANO.posiciones[`${item.id} Salida Oeste`];
        if (pe && po) xy = proyectar((pe[0] + po[0]) / 2, (pe[1] + po[1]) / 2, 8);
      } else {
        const q = PLANO.posiciones[item.ref];
        if (q) xy = proyectar(q[0], q[1], 6);
      }
      if (!xy) continue;
      areas += `<ellipse class="ub-hit-area${item.multi ? " multinivel" : ""}" cx="${xy.x.toFixed(1)}" cy="${xy.y.toFixed(1)}" rx="${item.rx || 54}" ry="${item.ry || 34}" data-ub-ed="${esc(item.id)}" data-ub-multi="${item.multi ? "1" : "0"}" role="button" tabindex="0" aria-label="${esc(item.label)}"/>`;
    }
    wrap.innerHTML = `<svg class="ub-mapa-svg" viewBox="${ubCam.join(" ")}" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Mapa interactivo 3D del campus UAM">
      <image href="/static/img/mapa-campus-3d.svg" width="${MAPA_W}" height="${MAPA_H}"/>
      ${areas}
    </svg>
    <div class="ub-zoom-bar">
      <button type="button" data-ub-zoom="0.72" aria-label="Acercar mapa">+</button>
      <button type="button" data-ub-zoom="1.35" aria-label="Alejar mapa">−</button>
      <button type="button" data-ub-zoom="reset" aria-label="Centrar mapa">◎</button>
    </div>`;
  } else {
    wrap.innerHTML = "";
  }

  $("#ub-edificios-chips").innerHTML = disponibles.map(item =>
    `<button type="button" class="${item.multi ? "multi" : ""}" data-ub-ed="${esc(item.id)}" data-ub-multi="${item.multi ? "1" : "0"}">
      <span>${esc(item.label)}</span><small>${esc(item.sub)} ${item.multi ? "›" : ""}</small>
    </button>`
  ).join("");
}

function renderPasoFrenteEdificio(L, pisoSel = 0) {
  ubEdificioActual = L;
  ubPisoFiltro = pisoSel;
  $("#ub-paso-campus").hidden = true;
  $("#ub-paso-frente").hidden = false;
  $("#ub-volver").hidden = false;
  const nombreEd = (FACHADA[L] && FACHADA[L].nombre) || `Edificio ${L}`;
  $("#modal-ub-titulo").textContent = `${nombreEd} · Modelo 3D`;
  $("#modal-ub-sub").textContent = "Desliza el modelo 3D y toca tu salón o pabellón";

  const G = geomEdificio(L);
  const pisos = G ? [...G.pisos].sort((a, b) => b - a) : [3, 2, 1];
  const aulasPiso = E.campus.vertices
    .filter(v => {
      const i = lugarInfo(v);
      return i.ed === L && i.t === "aula" && (!pisoSel || i.piso === pisoSel);
    })
    .sort((a, b) => a.localeCompare(b, "es", { numeric: true }));

  const filtrosHtml = `<div class="ub-piso-tabs" role="tablist" aria-label="Filtrar piso">
    <button type="button" role="tab" aria-selected="${pisoSel === 0}" data-ub-piso="0">Todos</button>
    ${pisos.map(p => `<button type="button" role="tab" aria-selected="${pisoSel === p}" data-ub-piso="${p}">${p === 1 ? "Planta baja" : "Piso " + p}</button>`).join("")}
  </div>`;

  const svg3d = edificio3D(L, { interactivo: true, pisoFiltro: pisoSel });
  const aulasBar = aulasPiso.length
    ? `<div class="ub-aulas-rapidas"><span class="nota">O toca tu aula aquí:</span><div class="ub-aulas-chips">${aulasPiso.map(a => `<button type="button" data-ub-sel="${esc(a)}">${esc(a)}</button>`).join("")}</div></div>`
    : "";

  $("#ub-frente-3d").innerHTML = `${filtrosHtml}
    <div class="ub-modelo-3d-wrap" id="ub-modelo-3d-wrap">${svg3d}</div>
    <p class="desliza">Desliza el modelo 3D a los lados y toca tu salón</p>
    ${aulasBar}`;

  requestAnimationFrame(() => {
    const w = $("#ub-modelo-3d-wrap");
    if (w) w.scrollLeft = Math.max(0, (w.scrollWidth - w.clientWidth) / 2);
  });
}

function actualizarBannerEmergencia(textoForzado) {
  const bar = $("#banner-emergencia");
  const txt = $("#banner-em-txt");
  if (!bar || !txt) return;
  if (typeof textoForzado === "string" && textoForzado) {
    textoEmergenciaExtra = textoForzado;
    bannerEmergenciaOculto = false;
  }
  const c = E && E.campus;
  const hayInc = !!(E && E.emergencia) || !!(c && (c.bloqueados.length || Object.keys(c.congestion).length)) || !!(E && E.ultimaAlerta) || !!textoEmergenciaExtra;
  if (!hayInc || vista === "campus" || bannerEmergenciaOculto || document.body.classList.contains("sin-sesion")) {
    bar.hidden = true;
    return;
  }
  if (textoEmergenciaExtra) {
    txt.textContent = textoEmergenciaExtra.slice(0, 72);
  } else if (E && E.emergencia) {
    txt.textContent = E.emergencia.titulo;
  } else if (c && c.bloqueados.length) {
    txt.textContent = `${c.bloqueados.length} pasillo(s) bloqueado(s) · Ruta recalculada`;
  } else if (c && Object.keys(c.congestion).length) {
    txt.textContent = `Congestión activa en el campus`;
  } else {
    txt.textContent = `Alerta activa en la red Mesh`;
  }
  bar.hidden = false;
}
window.actualizarBannerEmergencia = actualizarBannerEmergencia;

function irA(nombre) {
  if (!["inicio", "campus", "mensajes", "admin", "ajustes"].includes(nombre)) nombre = "inicio";
  if (nombre === "admin" && !document.body.classList.contains("es-admin")) nombre = "inicio";
  const cambio = vista !== nombre;
  vista = nombre;
  document.body.classList.toggle("vista-inicio", nombre === "inicio");
  $$(".vista").forEach(s => { s.hidden = s.id !== "v-" + nombre; });
  $$(".nav a").forEach(a => {
    const activa = a.dataset.tab === nombre;
    a.setAttribute("aria-selected", String(activa));
    a.tabIndex = activa ? 0 : -1;
    if (activa) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
  if (cambio) window.scrollTo(0, 0);
  render();
  actualizarBannerEmergencia();
  if (window.alEntrarVista) window.alEntrarVista(nombre);
}

/* ------------------------------------------------------------- eventos */

function eventos() {
  $("#reportes-bloqueo")?.addEventListener("click", async (ev) => {
    const btn = ev.target.closest("button[data-resolver-bloqueo]");
    if (!btn || btn.disabled) return;
    const fila = btn.closest("li");
    const acciones = fila.querySelectorAll("button");
    acciones.forEach((accion) => { accion.disabled = true; });
    try {
      await api("/api/campus/reportes/resolver", { id: btn.dataset.resolverBloqueo, decision: btn.dataset.decision });
    } finally {
      acciones.forEach((accion) => { accion.disabled = false; });
    }
  });
  $("#capas-filtros")?.addEventListener("click", (ev) => {
    const btn = ev.target.closest("[data-capa]");
    if (!btn) return;
    const capa = btn.dataset.capa;
    if (!(capa in CAPAS_MAPA)) return;
    CAPAS_MAPA[capa] = !CAPAS_MAPA[capa];
    btn.setAttribute("aria-pressed", String(CAPAS_MAPA[capa]));
    if (vista === "campus") renderCampus();
  });
  $("#form-fb-admin")?.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    if (!window.UNEXO_NUBE?.iniciarSesionAdminFirebase) return;
    const email = $("#fb-admin-email")?.value?.trim() || "";
    const pass = $("#fb-admin-pass")?.value || "";
    const key = $("#fb-admin-apikey")?.value?.trim() || "";
    const res = await window.UNEXO_NUBE.iniciarSesionAdminFirebase(email, pass, key);
    aviso(res.ok ? `Firebase Admin conectado (${res.email}).` : (res.mensaje || "Error de autenticación Firebase."), res.ok);
    if (res.ok && $("#fb-admin-pass")) $("#fb-admin-pass").value = "";
    renderAdmin();
  });
  $("#btn-fb-admin-salir")?.addEventListener("click", () => {
    window.UNEXO_NUBE?.cerrarSesionAdminFirebase?.();
    aviso("Sesión Firebase Admin cerrada.");
    renderAdmin();
  });
  $("#btn-cuellos")?.addEventListener("click", async () => {
    const box = $("#cuellos-resultado");
    if (box) box.innerHTML = '<p class="nota">Calculando rutas simultáneas…</p>';
    const j = await api("/api/campus/cuellos");
    if (!j.ok || !j.analisis || !box) {
      if (box) box.innerHTML = '<p class="nota">No se pudo calcular el análisis de cuellos de botella.</p>';
      return;
    }
    const a = j.analisis;
    const cuellosHtml = (a.cuellos || []).map(c =>
      `<div class="cuello-item"><div class="cuello-cab"><span>${esc(c.vertice)}</span><span>${c.flujo} rutas (${c.porcentaje}%)</span></div><div class="cuello-barra"><i style="width:${Math.min(100, c.porcentaje)}%"></i></div></div>`
    ).join("");
    const zonasHtml = (a.zonas || []).map(z =>
      `<div class="cuello-item"><div class="cuello-cab"><span>${esc(z.zona)}</span><span>${z.flujo} rutas (${z.porcentaje}%)</span></div><div class="cuello-barra zona"><i style="width:${Math.min(100, z.porcentaje)}%"></i></div></div>`
    ).join("");
    box.innerHTML = `<p class="nota"><b>${a.totalOrigenes}</b> lugares evaluados · <b>${a.sinSalida}</b> sin salida.</p><h4>Puntos intermedios críticos</h4>${cuellosHtml || '<p class="nota">Sin datos.</p>'}<h4>Carga por zona segura</h4>${zonasHtml || '<p class="nota">Sin datos.</p>'}`;
  });
  $(".skip-link")?.addEventListener("click", (ev) => {
    ev.preventDefault();
    document.querySelector("main")?.focus();
  });
  window.addEventListener("hashchange", () => irA(location.hash.slice(1)));
  const btnEmCerrar = $("#banner-em-cerrar");
  if (btnEmCerrar) btnEmCerrar.addEventListener("click", () => {
    bannerEmergenciaOculto = true;
    textoEmergenciaExtra = "";
    const bar = $("#banner-emergencia");
    if (bar) bar.hidden = true;
  });
  const btnFinEm = $("#btn-fin-emergencia");
  if (btnFinEm) btnFinEm.addEventListener("click", () => accion("finalizar-emergencia"));
  const btnElegirVis = $("#btn-elegir-visual");
  if (btnElegirVis) btnElegirVis.addEventListener("click", abrirSelectorUbicacion);
  const btnUbVolver = $("#ub-volver");
  if (btnUbVolver) btnUbVolver.addEventListener("click", renderPasoCampus);
  const btnModalEmIr = $("#modal-em-ir");
  if (btnModalEmIr) btnModalEmIr.addEventListener("click", () => {
    cerrarModalEmergencia();
    if (location.hash === "#campus") irA("campus");
    else location.hash = "#campus";
  });
  document.addEventListener("click", ev => {
    if (ev.target.closest("[data-cerrar-em]")) { cerrarModalEmergencia(); return; }
    if (ev.target.closest("[data-cerrar-ub]")) { cerrarSelectorUbicacion(); return; }
    const dec = ev.target.closest("[data-declarar-em]");
    if (dec) {
      const tipo = dec.dataset.declararEm;
      const nombres = { incendio: "Incendio", sismo: "Sismo / Temblor", inundacion: "Inundación" };
      hoja(`Declarar ${nombres[tipo] || "Emergencia"}`, "Se abrirá una ventana de alerta automática en todos los teléfonos conectados.", [
        { txt: `Sí, declarar ${nombres[tipo] || "emergencia"}`, cls: "peligro", fn: () => cambiarEmergencia("/api/emergencia/declarar", { tipo }) },
      ]);
      return;
    }
    const ubZoom = ev.target.closest("[data-ub-zoom]");
    if (ubZoom) {
      const z = ubZoom.dataset.ubZoom;
      if (z === "reset") { aplicarCamUb([380, 180, 860, 640]); return; }
      const f = Number(z);
      const [x, y, w, h] = ubCam;
      const cx = x + w / 2, cy = y + h / 2;
      const nw = w * f, nh = h * f;
      aplicarCamUb([cx - nw / 2, cy - nh / 2, nw, nh]);
      return;
    }
    const ubPiso = ev.target.closest("[data-ub-piso]");
    if (ubPiso && ubEdificioActual) {
      renderPasoFrenteEdificio(ubEdificioActual, Number(ubPiso.dataset.ubPiso));
      return;
    }
    const ubEd = ev.target.closest("[data-ub-ed]");
    if (ubEd) {
      const id = ubEd.dataset.ubEd;
      if (ubEd.dataset.ubMulti === "1") renderPasoFrenteEdificio(id);
      else {
        seleccionarLugar(id);
        cerrarSelectorUbicacion();
        aviso(`Ubicación seleccionada: ${id}`);
      }
      return;
    }
    const ubSel = ev.target.closest("[data-ub-sel]");
    if (ubSel) {
      const lugar = ubSel.dataset.ubSel;
      seleccionarLugar(lugar);
      cerrarSelectorUbicacion();
      aviso(`Ubicación seleccionada: ${lugar}`);
      return;
    }
  });

  document.addEventListener("click", ev => {
    const b = ev.target.closest("[data-accion]");
    if (b) accion(b.dataset.accion);
    if (ev.target.closest("[data-cerrar]")) cerrarHoja();
    const t = ev.target.closest("[data-ttl]");
    if (t) { ttl = Math.max(0, Math.min(20, ttl + Number(t.dataset.ttl))); $("#ttl").textContent = ttl; }
    const f = ev.target.closest("[data-f]");
    if (f) {
      factor = Number(f.dataset.f);
      $$("#cong-factor button").forEach(b => b.setAttribute("aria-pressed", String(Number(b.dataset.f) === factor)));
    }
    const inc = ev.target.closest("[data-inc]");
    if (inc) {
      $$("[data-inc]").forEach(x => x.setAttribute("aria-selected", String(x === inc)));
      $$("[data-panel]").forEach(p => { p.hidden = p.dataset.panel !== inc.dataset.inc; });
    }
    const gr = ev.target.closest("[data-grafo]");
    if (gr) { grafoAdmin = gr.dataset.grafo; renderAdmin(); }
    const mv = ev.target.closest("[data-mover]");
    if (mv) {
      const k = mv.dataset.mover;
      mover[k] = !mover[k];
      mv.setAttribute("aria-pressed", String(mover[k]));
      mv.textContent = mover[k] ? "Listo" : "Mover";
      $("#svg-" + k).classList.toggle("moviendo", mover[k]);
      if (mover[k]) aviso("Arrastra los nodos para acomodar el dibujo.");
    }
  });
  document.addEventListener("keydown", ev => {
    if (ev.key === "Escape") {
      if (!$("#modal-ubicacion")?.hidden) { cerrarSelectorUbicacion(); return; }
      if (!$("#modal-emergencia")?.hidden) { cerrarModalEmergencia(); return; }
      cerrarHoja();
    }
    if (ev.key === "Tab" && !$("#hoja").hidden) {
      const enfocables = [...$$(".hoja-carta button:not(:disabled), .hoja-carta select:not(:disabled), .hoja-carta input:not(:disabled), .hoja-carta textarea:not(:disabled), .hoja-carta a[href], .hoja-carta [tabindex]:not([tabindex='-1'])")]
        .filter(el => el.offsetParent !== null);
      if (!enfocables.length) return;
      const primero = enfocables[0], ultimo = enfocables[enfocables.length - 1];
      if (!enfocables.includes(document.activeElement)) { ev.preventDefault(); primero.focus(); }
      else if (ev.shiftKey && document.activeElement === primero) { ev.preventDefault(); ultimo.focus(); }
      else if (!ev.shiftKey && document.activeElement === ultimo) { ev.preventDefault(); primero.focus(); }
    }
    if ((ev.key === "Enter" || ev.key === " ") && document.activeElement?.matches?.("[data-paso]")) {
      ev.preventDefault();
      document.activeElement.click();
    }
  });

  // Gesto swipe-down para descartar la hoja inferior en móvil
  const hojaCarta = $(".hoja-carta");
  if (hojaCarta) {
    let sy = 0, dy = 0, tocando = false;
    hojaCarta.addEventListener("pointerdown", ev => {
      const cuerpo = $(".hoja-cuerpo", hojaCarta);
      if (ev.target.closest("button, select, input, textarea, a")) return;
      if (cuerpo && cuerpo.scrollTop > 0 && !ev.target.closest(".hoja-asa")) return;
      tocando = true; sy = ev.clientY; dy = 0;
      hojaCarta.style.transition = "none";
    });
    hojaCarta.addEventListener("pointermove", ev => {
      if (!tocando) return;
      dy = Math.max(0, ev.clientY - sy);
      if (dy > 4) hojaCarta.style.transform = `translateY(${dy}px)`;
    });
    const finSwipe = () => {
      if (!tocando) return;
      tocando = false;
      hojaCarta.style.transition = "transform .18s ease";
      if (dy > 75) cerrarHoja();
      else hojaCarta.style.transform = "";
    };
    hojaCarta.addEventListener("pointerup", finSwipe);
    hojaCarta.addEventListener("pointercancel", finSwipe);
  }

  if ($("#mesh-origen")) $("#mesh-origen").addEventListener("change", () => { if (!animando) { alcanceMostrado = null; viaMostrada = {}; renderMesh(); } });
  $("#campus-ubicacion").addEventListener("change", ev => {
    seleccionarLugar(ev.target.value);
  });
  const normalizarBusquedaLugar = txt => String(txt || "").trim().toUpperCase().replace(/^([A-Z])\s*-?\s*(\d{3})$/, "$1-$2");
  const norm = s => normalizarBusquedaLugar(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[\s-]+/g, "");
  const buscarInp = $("#campus-buscar");
  const sugBox = $("#campus-sug");
  if (buscarInp && sugBox) {
    buscarInp.addEventListener("input", () => {
      const normExacta = normalizarBusquedaLugar(buscarInp.value);
      const q = norm(normExacta);
      if (!q || !E) { sugBox.hidden = true; sugBox.innerHTML = ""; return; }
      const zonas = new Set(E.campus.zonasSeguras);
      const hits = E.campus.vertices
        .filter(v => !zonas.has(v) && (norm(v).includes(q) || v.toUpperCase() === normExacta))
        .sort((a, b) => (a.toUpperCase() === normExacta ? -1 : b.toUpperCase() === normExacta ? 1 : (norm(a).startsWith(q) ? 0 : 1) - (norm(b).startsWith(q) ? 0 : 1) || a.localeCompare(b, "es", { numeric: true })))
        .slice(0, 8);
      if (!hits.length) {
        sugBox.innerHTML = `<p class="nota">Sin coincidencias para «${esc(buscarInp.value.trim())}».</p>`;
        sugBox.hidden = false;
        return;
      }
      sugBox.innerHTML = hits.map(v => `<button type="button" data-ir-lugar="${esc(v)}">${esc(v)}</button>`).join("");
      sugBox.hidden = false;
    });
    buscarInp.addEventListener("keydown", ev => {
      if (ev.key === "Enter") {
        const primero = sugBox.querySelector("button[data-ir-lugar]");
        if (primero) { ev.preventDefault(); seleccionarLugar(primero.dataset.irLugar); }
      }
    });
  }
  $("#sel-cats")?.addEventListener("click", ev => {
    const b = ev.target.closest("[data-sel-cat]");
    if (!b) return;
    selCatActiva = selCatActiva === b.dataset.selCat ? "" : b.dataset.selCat;
    selPisoActivo = 0;
    renderSelectorDinamico();
  });
  $("#sel-pisos")?.addEventListener("click", ev => {
    const b = ev.target.closest("[data-sel-piso]");
    if (!b) return;
    selPisoActivo = Number(b.dataset.selPiso) || 0;
    renderSelectorDinamico();
  });
  document.addEventListener("click", ev => {
    const irL = ev.target.closest("[data-ir-lugar]");
    if (irL) { seleccionarLugar(irL.dataset.irLugar); return; }
    const sim = ev.target.closest("[data-sim]");
    if (sim) { ejecutarSimulacro(sim.dataset.sim); return; }
    const b = ev.target.closest("[data-bloq]");
    if (b) {
      try {
        const [o, d] = JSON.parse(b.dataset.bloq);
        bloquear(o, d, true);
      } catch (_) { aviso("No se pudo leer el paso a bloquear.", false); }
      return;
    }
    const p = ev.target.closest("[data-paso]");
    if (p) {
      const i = Number(p.dataset.paso);
      enfocarPaso(pasoActivo === i ? -1 : i);
    }
  });

  if ($("#svg-mesh")) {
    interacciones($("#svg-mesh"), "mesh", v => {
      if (animando) return;
      $("#mesh-origen").value = v;
      alcanceMostrado = null; viaMostrada = {};
      renderMesh();
      hoja(v, "Teléfono de la red Mesh.", [
        { txt: `Emitir alerta desde aquí (TTL ${ttl})`, cls: "alerta", fn: () => accion("emitir") },
      ]);
    });
  }

  // formularios de administrar
  $$("form[data-form]").forEach(form => form.addEventListener("submit", async ev => {
    ev.preventDefault();
    const fd = new FormData(form), tipo = form.dataset.form, boton = ev.submitter;
    if (boton && boton.disabled) return;
    const base = `/api/${grafoAdmin}`;
    if (boton) boton.disabled = true;
    try {
      if (tipo === "v-insertar") {
        const nombre = String(fd.get("nombre") || "").trim();
        if (!nombre) { aviso("Escribe un nombre válido.", false); return; }
        const j = await api(`${base}/vertice`, { accion: "insertar", nombre, zonaSegura: fd.get("zonaSegura") === "on" });
        if (j.ok) form.reset();
      } else if (tipo === "a-insertar") {
        const origen = String(fd.get("origen") || "").trim();
        const destino = String(fd.get("destino") || "").trim();
        const peso = Number(fd.get("peso"));
        if (!origen || !destino) { aviso("Selecciona origen y destino.", false); return; }
        if (origen === destino) { aviso("Origen y destino deben ser distintos.", false); return; }
        if (!Number.isFinite(peso) || peso < 0) { aviso("El peso debe ser un número mayor o igual a 0.", false); return; }
        await api(`${base}/arista`, { accion: boton?.value || "insertar", origen, destino, peso });
      } else if (tipo === "eliminar") {
        if (boton?.value === "vertice") {
          const v = fd.get("vertice");
          if (!v) { aviso("No hay vértices para eliminar.", false); return; }
          hoja(`Eliminar vértice «${v}»`, "Se eliminará el vértice y todas sus aristas entrantes y salientes.", [
            { txt: "Eliminar vértice", cls: "peligro", fn: () => api(`${base}/vertice`, { accion: "eliminar", nombre: v }) },
          ]);
        } else {
          const a = fd.get("arista");
          if (!a) { aviso("No hay aristas para eliminar.", false); return; }
          let par = null;
          try { par = JSON.parse(a); } catch (_) {}
          if (!Array.isArray(par) || par.length < 2) { aviso("Arista inválida.", false); return; }
          const [o, d] = par;
          hoja(`Eliminar arista «${o} → ${d}»`, "Esta conexión dejará de existir en el grafo.", [
            { txt: "Eliminar arista", cls: "peligro", fn: () => api(`${base}/arista`, { accion: "eliminar", origen: o, destino: d }) },
          ]);
        }
      }
    } finally {
      if (boton) boton.disabled = false;
    }
  }));
}

let eventoInstalarPwa = null;
let leyendoVoz = false;

function seleccionarLugar(lugar) {
  miLugar = lugar || "";
  guardar("mi-lugar", miLugar);
  const sel = $("#campus-ubicacion");
  if (sel && [...sel.options].some(o => o.value === miLugar)) sel.value = miLugar;
  // El lugar elegido es también donde está tu teléfono en la red Mesh (SOS, vecinos).
  if (miLugar && window.actualizarMiLugar) window.actualizarMiLugar(miLugar);
  rutaAnterior = null;
  pasoActivo = -1;
  detenerVoz();
  const inp = $("#campus-buscar"), sug = $("#campus-sug");
  if (inp) inp.value = "";
  if (sug) { sug.hidden = true; sug.innerHTML = ""; }
  pedirRuta();
}
window.seleccionarLugar = seleccionarLugar;
window.sincronizarLugarInicial = function (lugar, forzar = false) {
  if (!lugar) return;
  if (forzar || !miLugar) {
    miLugar = lugar;
    guardar("mi-lugar", miLugar);
    rutaAnterior = null;
    pasoActivo = -1;
    if (E) pedirRuta();
  }
};

function enfocarPaso(idx) {
  pasoActivo = idx;
  $$(".guia .paso").forEach(li => {
    const act = Number(li.dataset.paso) === pasoActivo;
    li.classList.toggle("activa", act);
    li.setAttribute("aria-pressed", String(act));
  });
  if (miRuta) renderMapa3D(miRuta, pasosActuales);
}

let selCatActiva = "";
let selPisoActivo = 0;

function renderSelectorDinamico() {
  const catsEl = $("#sel-cats");
  const pisosEl = $("#sel-pisos");
  const listaEl = $("#sel-lista");
  if (!catsEl || !pisosEl || !listaEl || !E) return;
  const cats = [
    { id: "B", label: "Edificio B" },
    { id: "C", label: "Edificio C" },
    { id: "P", label: "Edificio P" },
    { id: "campus", label: "Campus" },
    { id: "zonas", label: "Zonas seguras" },
  ];
  catsEl.innerHTML = cats.map(c =>
    `<button type="button" class="sel-cat" data-sel-cat="${c.id}" role="tab" aria-selected="${selCatActiva === c.id}">${c.label}</button>`
  ).join("");

  if (!selCatActiva) {
    pisosEl.hidden = true;
    listaEl.hidden = true;
    pisosEl.innerHTML = "";
    listaEl.innerHTML = "";
    return;
  }
  const zonas = new Set(E.campus.zonasSeguras || []);
  if (["B", "C", "P"].includes(selCatActiva)) {
    const pisosSet = new Set();
    for (const v of E.campus.vertices) {
      const i = lugarInfo(v);
      if (i.ed === selCatActiva && i.piso) pisosSet.add(i.piso);
    }
    const pisos = [...pisosSet].sort((a, b) => a - b);
    if (!selPisoActivo || !pisos.includes(selPisoActivo)) selPisoActivo = pisos[0] || 1;
    pisosEl.hidden = false;
    pisosEl.innerHTML = pisos.map(p =>
      `<button type="button" class="sel-piso-btn" data-sel-piso="${p}" aria-pressed="${selPisoActivo === p}">${p === 1 ? "Planta baja" : "Piso " + p}</button>`
    ).join("");
    const items = E.campus.vertices.filter(v => {
      const i = lugarInfo(v);
      return i.ed === selCatActiva && ((i.piso === selPisoActivo && i.t !== "escalera") || (selPisoActivo === 1 && i.t === "salida"));
    }).sort((a, b) => a.localeCompare(b, "es", { numeric: true }));
    listaEl.hidden = false;
    listaEl.innerHTML = items.map(v => `<button type="button" data-ir-lugar="${esc(v)}">${esc(v)}</button>`).join("");
    return;
  }
  pisosEl.hidden = true;
  pisosEl.innerHTML = "";
  const items = selCatActiva === "zonas"
    ? [...zonas].sort((a, b) => a.localeCompare(b, "es"))
    : E.campus.vertices.filter(v => {
        const i = lugarInfo(v);
        return !zonas.has(v) && !["B", "C", "P"].includes(i.ed);
      }).sort((a, b) => a.localeCompare(b, "es", { numeric: true }));
  listaEl.hidden = false;
  listaEl.innerHTML = items.map(v => `<button type="button" data-ir-lugar="${esc(v)}">${esc(v)}</button>`).join("");
}

function detenerVoz() {
  leyendoVoz = false;
  if (window.UnexuamNativo && typeof window.UnexuamNativo.detenerVoz === "function") {
    try { window.UnexuamNativo.detenerVoz(); } catch (_) {}
  }
  if ("speechSynthesis" in window) {
    try { window.speechSynthesis.cancel(); } catch (_) {}
  }
  const btn = $("#btn-voz");
  if (btn) btn.innerHTML = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4zm12.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4ZM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6Z"/></svg> Leer ruta por voz';
}
window.__unexuamVozFin = detenerVoz;

function leerRutaVoz() {
  if (leyendoVoz) { detenerVoz(); return; }
  if (!miRuta || !pasosActuales.length) return;
  const destino = miRuta.ruta[miRuta.ruta.length - 1];
  const textoCompleto = [
    `Ruta de evacuación hacia ${destino}, tiempo estimado ${minutos(miRuta.tiempo)}.`,
    ...pasosActuales.map((p, i) => `Paso ${i + 1}: ${p.texto}`),
  ].join(" ");
  const lang = window.UNEXO_I18N?.idioma?.() === "en" ? "en-US" : "es-NI";
  const btn = $("#btn-voz");
  const marcarHablando = () => {
    leyendoVoz = true;
    if (btn) btn.innerHTML = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6h12v12H6z"/></svg> Detener voz';
  };
  if (window.UnexuamNativo && typeof window.UnexuamNativo.hablar === "function") {
    try {
      if (window.UnexuamNativo.hablar(textoCompleto, lang)) {
        marcarHablando();
        return;
      }
    } catch (_) {}
  }
  if (!("speechSynthesis" in window)) { aviso("Tu navegador no soporta lectura por voz.", false); return; }
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(textoCompleto);
  u.lang = lang;
  u.rate = 1.02;
  u.onend = u.onerror = () => detenerVoz();
  marcarHablando();
  window.speechSynthesis.speak(u);
}

async function ejecutarSimulacro(tipo) {
  if (!E) return;
  if (tipo === "alerta-mesh") {
    await api("/api/mesh/alerta", { origen: "Tel-Ana", ttl: 5 });
    if (location.hash === "#inicio") irA("inicio");
    else location.hash = "#inicio";
    return;
  }
  await api("/api/reiniciar", { grafo: "campus" });
  if (tipo === "sismo-p") {
    miLugar = "P-309"; guardar("mi-lugar", miLugar);
    await api("/api/campus/bloquear", { origen: "P Escalera Oeste P3", destino: "P Escalera Oeste P2", ambos: true });
  } else if (tipo === "congestion-p") {
    miLugar = "P-309"; guardar("mi-lugar", miLugar);
    await api("/api/campus/congestionar", { lugar: "Punto Seguro Parqueo Oeste", factor: 5 });
  } else if (tipo === "bloqueo-bc") {
    miLugar = "C-305"; guardar("mi-lugar", miLugar);
    await api("/api/campus/bloquear", { origen: "C Escalera Central P3", destino: "B Escalera Central P2", ambos: true });
  }
  rutaAnterior = null;
  pasoActivo = -1;
  if (location.hash === "#campus") irA("campus");
  else location.hash = "#campus";
  await pedirRuta();
}

async function accion(a) {
  if (!E) return;
  if (a === "reordenar-mesh") {
    reordenar("mesh");
    aviso("Posiciones de la red Mesh restablecidas.");
    return;
  } else if (a === "leer-voz") {
    leerRutaVoz();
    return;
  } else if (a === "instalar-pwa") {
    if (!eventoInstalarPwa) return;
    eventoInstalarPwa.prompt();
    await eventoInstalarPwa.userChoice;
    eventoInstalarPwa = null;
    const b = $("#btn-instalar");
    if (b) b.hidden = true;
    return;
  }
  if (a === "emitir") {
    if (animando) return;
    const origen = $("#mesh-origen").value;
    if (!origen) return;
    animando = true;  // evita que aplicarEstado lance otra animación
    const j = await api("/api/mesh/alerta", { origen, ttl });
    animando = false;
    if (j.ok && E.ultimaAlerta) {
      const ua = E.ultimaAlerta;
      alertaVista = ua.hora + ua.origen + ua.ttl;
      animarAlerta(ua);
    }
  } else if (a === "repetir") {
    if (E.ultimaAlerta && !animando) animarAlerta(E.ultimaAlerta);
  } else if (a === "bloquear") {
    const v = $("#bloq-paso").value;
    if (v) { const [o, d] = JSON.parse(v); bloquear(o, d, $("#bloq-ambos").checked); }
  } else if (a === "congestionar") {
    const l = $("#cong-lugar").value;
    if (l) api("/api/campus/congestionar", { lugar: l, factor });
  } else if (a === "desbloquear") {
    api("/api/campus/desbloquear", {});
  } else if (a === "mapa-zoom") {
    mapaCompleto = !mapaCompleto;
    ultClaveCampus = "";
    renderCampus();
  } else if (a === "mapa-mas") {
    zoomCampus(0.72);
  } else if (a === "mapa-menos") {
    zoomCampus(1.38);
  } else if (a === "mapa-centrar") {
    if (camCampusIni) aplicarCamaraCampus(camCampusIni);
  } else if (a === "reintentar-plano") {
    cargarPlanoCampus();
  } else if (a === "mapa-gps") {
    if (gpsVivoPt && camCampus) {
      const w = Math.min(camCampus[2], 420), h = w * (camCampus[3] / (camCampus[2] || 1));
      aplicarCamaraCampus([gpsVivoPt.x - w / 2, gpsVivoPt.y - h / 2, w, h]);
    } else if (posCampus(miLugar) && camCampus) {
      const p = posCampus(miLugar);
      const w = Math.min(camCampus[2], 420), h = w * (camCampus[3] / (camCampus[2] || 1));
      aplicarCamaraCampus([p.x - w / 2, p.y - h / 2, w, h]);
    } else {
      abrirSelectorUbicacion();
    }
  } else if (a === "finalizar-emergencia") {
    const incidente = E.emergencia?.id;
    hoja("Finalizar emergencia", "Se cerrará la alerta activa. Los reportes de bloqueo siguen vigentes.", [
      {
        txt: "Sí, finalizar emergencia",
        cls: "primario",
        fn: async () => {
          bannerEmergenciaOculto = false;
          textoEmergenciaExtra = "";
          claveModalEmergencia = "";
          rutaAnterior = null;
          const resultado = await cambiarEmergencia("/api/emergencia/finalizar", { incidente });
          if (resultado.ok) cerrarModalEmergencia();
        },
      },
    ]);
  } else if (a === "reiniciar-campus") {
    rutaAnterior = null;
    api("/api/reiniciar", { grafo: "campus" });
  } else if (a === "reiniciar-grafo") {
    const cual = grafoAdmin;
    hoja("Reiniciar grafo", `¿Volver a los datos de ejemplo de ${cual === "mesh" ? "la red Mesh" : "el campus"}?`, [
      { txt: "Sí, reiniciar", cls: "alerta", fn: () => { reordenar(cual); api("/api/reiniciar", { grafo: cual }); } },
    ]);
  } else if (a === "reiniciar-todo") {
    hoja("Reiniciar la demo", "Se restaurarán la red Mesh y el campus UAM a su estado inicial.", [
      { txt: "Sí, reiniciar todo", cls: "alerta", fn: () => { reordenar("mesh"); reordenar("campus"); rutaAnterior = null; api("/api/reiniciar", { grafo: "ambos" }); } },
    ]);
  }
}

/* -------------------------------------------------------------- inicio */

let sondeoTimer = 0;
let sondeoDelay = 4000;
async function sondeo() {
  if (window.__UNEXUAM_OFFLINE__) return;
  if (!document.hidden && !animando) {
    const esInvitado = document.body.classList.contains("modo-invitado");
    const esSinSesion = document.body.classList.contains("sin-sesion");
    if (esInvitado) {
      try {
        const r = await fetch("/api/campus/publico");
        if (r.ok) {
          const j = await r.json();
          marcarConexion(true);
          sondeoDelay = 4000;
          if (j.estado && JSON.stringify(j.estado) !== firma) aplicarEstado(j.estado);
        }
      } catch (e) {
        sondeoDelay = Math.min(30000, sondeoDelay * 2);
      }
    } else if (!esSinSesion) {
      try {
        const r = await fetch("/api/estado");
        if (r.status === 401) { if (window.mostrarLogin) window.mostrarLogin(); sondeoDelay = 4000; sondeoTimer = setTimeout(sondeo, sondeoDelay); return; }
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = await r.json();
        marcarConexion(true);
        sondeoDelay = 4000;
        if (j.estado && JSON.stringify(j.estado) !== firma) aplicarEstado(j.estado);
      } catch (e) {
        marcarConexion(false);
        sondeoDelay = Math.min(30000, sondeoDelay * 2);
      }
    }
  }
  sondeoTimer = setTimeout(sondeo, sondeoDelay);
}

function ocultarSplash() {
  const sp = $("#splash");
  if (!sp || sp.classList.contains("fuera")) return;
  sp.classList.add("fuera");
  setTimeout(() => sp.remove(), 450);
}
const spEl = $("#splash");
if (spEl) {
  if (window.UnexuamNativo) {
    spEl.remove();
  } else {
    const reducido = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    spEl.addEventListener("click", ocultarSplash);
    setTimeout(ocultarSplash, reducido ? 250 : 3000);
  }
}

if (!window.__UNEXUAM_OFFLINE__ && "serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
  window.addEventListener("beforeinstallprompt", ev => {
    ev.preventDefault();
    eventoInstalarPwa = ev;
    const b = $("#btn-instalar");
    if (b) b.hidden = false;
  });
}

eventos();
// La app arranca cuando hay sesión iniciada (ver cuenta.js).
let appIniciada = false;
window.refrescarEstado = function () {
  if (document.body.classList.contains("modo-invitado")) return api("/api/campus/publico");
  if (!document.body.classList.contains("sin-sesion")) return api("/api/estado");
};
window.aplicarEmergenciaInvitado = function (emergencia) {
  emergenciaNubeInvitado = emergencia;
  if (E && emergencia !== undefined && document.body.classList.contains("modo-invitado")) {
    aplicarEstado({ ...E, emergencia });
  }
};
window.iniciarUnexuam = function () {
  document.body.classList.remove("modo-invitado");
  irA(location.hash.slice(1) || "inicio");
  api("/api/estado");
  if (appIniciada) return;
  appIniciada = true;
  // Precarga y decodificación en segundo plano para cambiar de pestaña sin parpadeos.
  setTimeout(() => {
    const rutasImg = [
      "/static/img/figma/campus-uam-inicio.jpg",
      "/static/img/figma/campus-uam-evacuar.jpg",
      "/static/img/figma/campus-uam-mesh.jpg",
      "/static/img/figma/tarjeta-inundacion.jpg",
      "/static/img/figma/tarjeta-incendio.jpg",
      "/static/img/figma/tarjeta-sismo.jpg",
      "/static/img/figma/tarjeta-auxilios.svg",
      "/static/img/figma/tarjeta-sin-senal.svg",
    ];
    for (const src of rutasImg) {
      const im = new Image();
      im.src = src;
      if (im.decode) im.decode().catch(() => {});
    }
  }, 250);
  if (!window.__UNEXUAM_OFFLINE__) {
    clearTimeout(sondeoTimer);
    sondeoTimer = setTimeout(sondeo, 4000);
  }
};
window.entrarModoEvacuacionInvitado = async function () {
  const j = await api("/api/campus/publico");
  if (j.ok) {
    if (location.hash !== "#campus") history.replaceState(history.state, "", "#campus");
    irA("campus");
    aviso(j.offline
      ? "Mapa descargado. Los bloqueos recientes pueden faltar."
      : "Modo evacuación rápido: elige tu aula o usa GPS.", !j.offline);
  }
  return j.ok;
};
