/* Unexuam · lógica de la interfaz (JS sin librerías, funciona sin internet).
 * El servidor guarda los dos grafos; aquí solo se dibujan y se llaman los endpoints. */
"use strict";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const FLECHA = "→";
const NS = "http://www.w3.org/2000/svg";
const IMG = {  // iconos exportados del Figma de UNEXO (frontend/static/img)
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

function marcarConexion(ok) {
  const chip = $(".chip-offgrid");
  if (!chip) return;
  chip.classList.toggle("caido", !ok);
  const txt = chip.lastChild;
  if (txt && txt.nodeType === 3) txt.nodeValue = ok ? " Off-Grid" : " Sin conexión";
}

async function api(ruta, cuerpo) {
  try {
    const r = await fetch(ruta, cuerpo === undefined ? {} : {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cuerpo),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = await r.json();
    marcarConexion(true);
    if (j.estado) aplicarEstado(j.estado);
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

function tipoLugar(n) {
  if (E && E.campus.zonasSeguras.includes(n)) return "zona";
  const l = n.toLowerCase();
  if (/salida|exit|puerta/.test(l)) return "salida";
  if (/escaler/.test(l)) return "escalera";
  if (/pasillo|corredor|hall/.test(l)) return "pasillo";
  return "lugar";
}
const ICONO = { zona: "Z", salida: "S", escalera: "E", pasillo: "P" };

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
      ${!o.pesos || o.pesos(a) || a.fantasma ? `<text class="peso ${cls}" x="${gm.m.x}" y="${gm.m.y}">${a.fantasma ? "✕" : esc(peso)}</text>` : ""}
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

/* ------------------------------------------------------- hoja inferior */

let focoPrevioHoja = null;

function hoja(titulo, texto, acciones) {
  focoPrevioHoja = document.activeElement;
  $("#hoja-titulo").textContent = titulo;
  $("#hoja-texto").textContent = texto || "";
  const cont = $("#hoja-acciones");
  cont.innerHTML = "";
  for (const a of acciones) {
    const b = document.createElement("button");
    b.className = "btn ancho " + (a.cls || "secundario");
    b.textContent = a.txt;
    b.addEventListener("click", () => { cerrarHoja(); a.fn(); });
    cont.append(b);
  }
  $("#hoja").hidden = false;
  const primero = $(".hoja-carta button");
  if (primero) primero.focus();
}
function cerrarHoja() {
  if ($("#hoja").hidden) return;
  $("#hoja").hidden = true;
  if (focoPrevioHoja && typeof focoPrevioHoja.focus === "function") focoPrevioHoja.focus();
  focoPrevioHoja = null;
}

/* ---------------------------------------------------------- selects */

function llenar(sel, opciones, vacio) {
  const prev = sel.value;
  const html = (vacio ? `<option value="">${esc(vacio)}</option>` : "") +
    opciones.map(o => `<option value="${esc(o.v)}">${esc(o.t)}</option>`).join("");
  if (sel.innerHTML !== html) sel.innerHTML = html;
  if (opciones.some(o => o.v === prev)) sel.value = prev;
}

/* ------------------------------------------------------------- estado */

function aplicarEstado(est) {
  const anterior = E;
  E = est;
  firma = JSON.stringify(est);
  // alerta nueva emitida desde otro teléfono → animarla aquí también
  const ua = est.ultimaAlerta;
  const k = ua ? ua.hora + ua.origen + ua.ttl : null;
  if (k && alertaVista === null) { alertaVista = k; mostrarAlcanceFinal(ua); }
  else if (k && k !== alertaVista && !animando) { alertaVista = k; aviso(`Nueva alerta desde ${ua.origen}`, false); animarAlerta(ua); }
  else if (!ua) { alertaVista = "nada"; alcanceMostrado = null; viaMostrada = {}; $("#saltos-tarjeta").hidden = true; }
  render();
  // si el grafo del campus cambió (bloqueo, congestión, admin), recalcular la ruta de este teléfono
  const fc = JSON.stringify([est.campus.aristas, est.campus.zonasSeguras]);
  if (fc !== firmaCampus) { firmaCampus = fc; pedirRuta(); }
}

function render() {
  if (!E) return;
  if (vista === "inicio") renderInicio();
  else if (vista === "mesh") renderMesh();
  else if (vista === "campus") renderCampus();
  else if (vista === "admin") renderAdmin();
}

/* ---------------------------------------------------------------- inicio */

function renderInicio() {
  const m = E.mesh, c = E.campus, ua = E.ultimaAlerta;
  const tels = m.vertices.length;
  const alc = ua ? new Set(ua.alcanzados.map(x => x[0]).concat(ua.origen)).size : null;
  $("#m-tels").textContent = tels;
  $("#m-enl").textContent = m.aristas.length;
  $("#m-alc").textContent = ua ? `${alc}/${tels}` : "–";
  $("#m-alc").className = ua ? (alc < tels ? "ambar" : "rojo") : "";
  const sinSalida = m.vertices.filter(v => !m.aristas.some(a => a.origen === v));
  $("#m-nota").textContent = (ua ? `Última alerta: ${ua.origen}, TTL ${ua.ttl}, a las ${ua.hora}. ` : "") +
    (sinSalida.length ? `Sin enlaces de salida: ${sinSalida.join(", ")}.` : "");

  const nCong = Object.keys(c.congestion).length;
  $("#c-lug").textContent = c.vertices.length;
  $("#c-pas").textContent = c.aristas.length;
  $("#c-zon").textContent = c.zonasSeguras.length;
  $("#c-blo").textContent = c.bloqueados.length;
  $("#c-blo").className = c.bloqueados.length ? "rojo" : "";
  $("#c-con").textContent = nCong;
  $("#c-con").className = nCong ? "ambar" : "";
  const r = miRuta;   // la ruta de ESTE teléfono (cada estudiante está en un lugar distinto)
  $("#c-tie").textContent = r ? (r.tiempo === null ? "sin ruta" : `${fmt(r.tiempo)} s`) : "–";
  $("#c-tie").className = r ? (r.tiempo === null ? "rojo" : "verde") : "";
  $("#c-nota").textContent = r
    ? (r.tiempo === null ? `Desde ${r.origen} no se llega a ningún punto seguro.` : `Desde ${r.origen}: evacúa hacia ${r.ruta[r.ruta.length - 1]}.`)
    : "Elige dónde estás en la pestaña Campus.";

  const emergencia = ua || c.bloqueados.length || nCong;
  $("#hero").className = "hero " + (emergencia ? "emergencia" : "calma");
  $("#hero-icono").src = emergencia ? IMG.fuego : IMG.x;
  $("#hero-titulo").textContent = emergencia ? "Emergencia en curso" : "Todo en calma";
  const partes = [];
  if (ua) partes.push(`alerta propagada a ${alc} de ${tels} teléfonos`);
  if (c.bloqueados.length) partes.push(`${c.bloqueados.length} paso(s) bloqueado(s)`);
  if (nCong) partes.push(`${nCong} lugar(es) con congestión`);
  $("#hero-texto").textContent = partes.length ? partes.join(" · ").replace(/^./, s => s.toUpperCase()) + "." : "No hay alertas activas en la red ni en el campus.";

  $("#historial").innerHTML = E.historial.map(h =>
    `<li class="${h.tipo === "error" ? "error" : ""}"><time>${esc(h.hora)}</time><span>${esc(h.texto)}</span></li>`).join("");

}

/* ---------------------------------------------------------------- mesh */

function telIcono() {
  return `<rect class="tel" x="-4.5" y="-7" width="9" height="14" rx="2"/><path class="tel" d="M-1.5,4.5h3"/>`;
}

function renderMesh() {
  const g = E.mesh;
  const sel = $("#mesh-origen");
  llenar(sel, g.vertices.map(v => ({ v, t: v })));
  const origen = sel.value;
  const alc = alcanceMostrado || {};
  const hayAlerta = alcanceMostrado !== null;
  const vivas = new Set(Object.entries(viaMostrada).map(([n, p]) => clave(p, n)));

  dibujar($("#svg-mesh"), "mesh", g, {
    unidad: " s",
    // sin alerta tras una propagación: icono "sin señal" del diseño UNEXO
    icono: v => (hayAlerta && alc[v] === undefined
      ? `<image href="${IMG.sinSenal}" x="-9" y="-9" width="18" height="18"/>`
      : telIcono()),
    claseArista: a => (vivas.has(clave(a.origen, a.destino)) ? "viva" : ""),
    claseNodo: v => [
      alc[v] === 0 ? "emisor" : alc[v] > 0 ? "con-alerta" : "",
      hayAlerta && alc[v] === undefined ? "sin-alcance" : "",
      !hayAlerta && v === origen ? "elegido" : "",
    ].join(" "),
    extraNodo: v => (alc[v] !== undefined
      ? `<g class="salto" transform="translate(${R - 2},${-R + 2})"><rect x="-8" y="-7" width="16" height="14" rx="7"/><text>${alc[v]}</text></g>`
      : ""),
  });
  $("#ttl").textContent = ttl;
  $("#btn-alerta").disabled = animando || !g.vertices.length;
}

function ordenar(alcanzados, origen) {
  const lista = alcanzados.map(([n, s]) => [n, s]);
  if (!lista.some(([n]) => n === origen)) lista.unshift([origen, 0]);
  return lista;
}

function padreDe(nombre, salto, previos) {
  // un teléfono del salto anterior que tenga enlace hacia este (solo para dibujar la chispa)
  const p = previos.find(([n, s]) => s === salto - 1 && E.mesh.aristas.some(a => a.origen === n && a.destino === nombre));
  return p ? p[0] : null;
}

function mostrarAlcanceFinal(ua) {
  const lista = ordenar(ua.alcanzados, ua.origen);
  alcanceMostrado = {}; viaMostrada = {};
  lista.forEach(([n, s], i) => {
    alcanceMostrado[n] = s;
    const p = s > 0 ? padreDe(n, s, lista.slice(0, i)) : null;
    if (p) viaMostrada[n] = p;
  });
  listaSaltos(lista, ua, lista.length);
}

function listaSaltos(lista, ua, hasta) {
  $("#saltos-tarjeta").hidden = false;
  const fuera = hasta >= lista.length ? E.mesh.vertices.filter(v => !lista.some(([n]) => n === v)) : [];
  $("#saltos").innerHTML = lista.slice(0, hasta).map(([n, s]) =>
    `<li><span class="n">${s === 0 ? "origen" : "salto " + s}</span><span class="nombre">${esc(n)}${viaMostrada[n] ? ` <span class="via">← ${esc(viaMostrada[n])}</span>` : ""}</span><img src="${IMG.fuego}" alt=""></li>`).join("") +
    fuera.map(n => `<li class="fuera"><span class="n">sin alerta</span><span class="nombre">${esc(n)}</span><img src="${IMG.sinSenal}" alt=""></li>`).join("");
  if (hasta >= lista.length) {
    $("#saltos-nota").textContent = `Llegó a ${lista.length} de ${E.mesh.vertices.length} teléfonos con TTL ${ua.ttl}.` +
      (fuera.length ? ` Sin alerta: ${fuera.join(", ")} (TTL agotado o sin enlace hacia ellos).` : " Toda la red recibió la alerta.");
  } else $("#saltos-nota").textContent = "";
}

function espera(ms) { return new Promise(r => setTimeout(r, ms)); }

function chispa(svg, desde, hacia, ms) {
  const path = svg.querySelector(`path.arista[data-k="${CSS.escape(clave(desde, hacia))}"]`);
  const capa = svg.querySelector(".capa-chispa");
  if (!path || !capa) return espera(ms);
  const c = document.createElementNS(NS, "circle");
  c.setAttribute("r", "5"); c.setAttribute("class", "chispa");
  capa.append(c);
  const L = path.getTotalLength(), t0 = performance.now();
  return new Promise(res => {
    const paso = t => {
      const f = Math.min(1, (t - t0) / ms), p = path.getPointAtLength(L * f);
      c.setAttribute("cx", p.x); c.setAttribute("cy", p.y);
      if (f < 1) requestAnimationFrame(paso); else { c.remove(); res(); }
    };
    requestAnimationFrame(paso);
  });
}

function pulso(svg, nombre) {
  const n = svg.querySelector(`.nodo[data-n="${CSS.escape(nombre)}"]`);
  if (!n) return;
  const c = document.createElementNS(NS, "circle");
  c.setAttribute("r", R); c.setAttribute("class", "pulso");
  n.prepend(c);
}

async function animarAlerta(ua) {
  animando = true;
  const lista = ordenar(ua.alcanzados, ua.origen);
  const svg = $("#svg-mesh");
  alcanceMostrado = {}; viaMostrada = {};
  listaSaltos(lista, ua, 0);
  renderMesh();
  const reducido = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const porSalto = new Map();
  lista.forEach(([n, s], i) => { if (!porSalto.has(s)) porSalto.set(s, []); porSalto.get(s).push([n, s, i]); });
  let mostrados = 0;
  for (const s of [...porSalto.keys()].sort((a, b) => a - b)) {
    const grupo = porSalto.get(s);
    const viajes = grupo.map(([n, , i]) => {
      const p = s > 0 ? padreDe(n, s, lista.slice(0, i)) : null;
      return p && !reducido ? chispa(svg, p, n, 650) : espera(reducido ? 0 : s === 0 ? 150 : 650);
    });
    await Promise.all(viajes);
    for (const [n, , i] of grupo) {
      alcanceMostrado[n] = s;
      const p = s > 0 ? padreDe(n, s, lista.slice(0, i)) : null;
      if (p) viaMostrada[n] = p;
    }
    mostrados += grupo.length;
    renderMesh();
    grupo.forEach(([n]) => pulso(svg, n));
    listaSaltos(lista, ua, mostrados);
    await espera(reducido ? 0 : 250);
  }
  animando = false;
  renderMesh();
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
  const tipoTramo = (a, b) => {
    if (b.t === "zona") return "zona";
    const enPiso = x => x.t === "aula" || x.t === "escalera" || x.t === "pabellon";
    if (esCentralBC(a) && b.t === "pabellon" && a.piso === b.piso && (b.ed === "B" || b.ed === "C")) {
      return `cruce:${b.ed}:${b.piso}`;
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
    const k = tipoTramo(I[i], I[i + 1]);
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

const ICONO_PASO = { pasillo: "→", escalera: "⇅", salida: "⇱", zona: "✓", lugar: "→" };
const minutos = s => (s < 60 ? `${Math.round(s)} s` : `${Math.floor(s / 60)} min ${Math.round(s % 60)} s`);

let miLugar = leer("mi-lugar", "");   // cada teléfono guarda dónde está su estudiante
let miRuta = null;                    // {origen, ruta, tiempo} calculada para este teléfono
let firmaCampus = "";                 // para recalcular cuando el grafo del campus cambia

async function pedirRuta() {
  if (!E || !miLugar || !E.campus.vertices.includes(miLugar)) { miRuta = null; renderCampus(); renderInicio(); return; }
  try {
    const r = await fetch("/api/campus/ruta", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lugar: miLugar }) });
    const j = await r.json();
    const nueva = j.ruta;
    if (miRuta && nueva && miRuta.origen === nueva.origen &&
        (JSON.stringify(miRuta.ruta) !== JSON.stringify(nueva.ruta) || miRuta.tiempo !== nueva.tiempo)) rutaAnterior = miRuta;
    else if (!miRuta || !nueva || miRuta.origen !== nueva.origen) rutaAnterior = null;
    miRuta = nueva;
  } catch (e) { /* sin conexión: se mantiene la última ruta conocida */ }
  renderCampus();
  renderInicio();
}

function renderCampus() {
  const c = E.campus;
  const lugares = c.vertices.filter(v => !c.zonasSeguras.includes(v));
  llenarAgrupado($("#campus-ubicacion"), lugares.map(v => ({ v, t: v })), "Elige dónde estás…", o => grupoLugar(o.v));
  $("#campus-ubicacion").value = lugares.includes(miLugar) ? miLugar : "";
  llenarAgrupado($("#bloq-paso"), c.aristas.map(a => ({ v: JSON.stringify([a.origen, a.destino]), t: `${a.origen} → ${a.destino} (${fmt(a.peso)} s)`, o: a.origen })),
    "", o => grupoLugar(o.o));
  llenarAgrupado($("#cong-lugar"), c.vertices.map(v => ({ v, t: v + (c.congestion[v] ? ` (×${c.congestion[v]})` : "") })), "", o => grupoLugar(o.v));
  $$("#cong-factor button").forEach(b => b.setAttribute("aria-pressed", String(Number(b.dataset.f) === factor)));

  const nInc = c.bloqueados.length + Object.keys(c.congestion).length;
  $("#incidentes-activos").textContent = nInc
    ? `Activos: ${c.bloqueados.length} paso(s) bloqueado(s) y ${Object.keys(c.congestion).length} lugar(es) con congestión.`
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
  info.innerHTML = `
    <div class="destino">
      <span class="destino-etq">Evacúa hacia</span>
      <b class="destino-nombre">${esc(destino)}</b>
      <span class="destino-tiempo">${minutos(r.tiempo)} caminando · ${pasos.length} paso${pasos.length === 1 ? "" : "s"}</span>
      ${cambio}
    </div>
    ${r.ruta.length === 1 ? `<p class="nota">Ya estás en un punto seguro.</p>` : ""}
    <ol class="guia">${pasos.map((p, i) => `
      <li class="paso t-${p.tipo}${i === pasoActivo ? " activa" : ""}" data-paso="${i}">
        <div class="paso-cab"><span class="paso-n">${i + 1}</span><p class="paso-texto">${esc(p.texto)}</p></div>
        <div class="paso-3d">${vistaPaso(r, p)}</div>
        <p class="paso-meta"><span>${ICONO_PASO[p.tipo] || "→"} ${minutos(p.segundos)}</span>
          <button type="button" class="paso-bloq" data-bloq='${esc(JSON.stringify([p.de, p.a]))}'>Simular bloqueo</button></p>
      </li>`).join("")}
    </ol>
    <p class="consejo">Camina, no corras. Ayuda a quien lo necesite y espera indicaciones en el punto seguro.</p>`;
  if (pasoActivo >= pasos.length) pasoActivo = -1;
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
let PROY = null;             // { esc, ox, oy } de la proyección del mapa 3D
let mapaCompleto = false;    // false: acercado a la ruta · true: todo el campus
let pasoActivo = -1;         // paso de la guía resaltado

const MAPA_W = 1600, MAPA_H = 1060;
const GIRO = 16 * Math.PI / 180, ACHATE = 0.58, COS_G = Math.cos(GIRO), SEN_G = Math.sin(GIRO);
const ANCHO_ED = 12;         // ancho del edificio (m): aulas atrás, pabellón adelante
const SEP_PISO = 13;         // separación entre pisos en la vista explotada (el real es 3.6 m)

/* Estilo de fachadas por edificio (B, C y P «Copérnico»). */
const FACHADA = {
  B: { techo: "#fbfcfd", muro: "#e6eaef", ventana: "#9cc8f0", pasillo: "sur", nombre: "Edificio B" },
  C: { techo: "#fbfcfd", muro: "#e6eaef", ventana: "#9cc8f0", pasillo: "sur", nombre: "Edificio C" },
  P: { techo: "#fbfcfd", muro: "#f2f4f6", ventana: "#3a4552", pasillo: "norte", barandas: "#8a96a3",
       columnas: "#6f7c8a", solar: true, observatorio: "este", nombre: "Edificio P · Copérnico" },
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

fetch("/static/campus-plano.json").then(r => r.json()).then(j => {
  PLANO = j; prepararProyeccion();
  if (E) renderCampus();
}).catch(() => {});

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

  // pozos de las escaleras (unen los pisos)
  for (const u of (L === "B" || L === "C" ? [0.03, 0.5, 0.97] : [0.03, 0.97])) {
    const a = P(u, sg * W / 4, 0), b = P(u, sg * W / 4, zPiso(top));
    svg += `<line class="e3-pozo" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke-width="${2.2 * k}" stroke-dasharray="${3 * k} ${2.5 * k}"/>`;
  }

  for (const p of G.pisos) {
    const z = zPiso(p), activo = pisosRuta.has(p);
    const cls = activo ? " activo" : "";
    // losa del piso (con su canto)
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
      if (!o.mini) {
        const t = P(u, vMuro, z + h + 0.35);
        svg += `<text class="e3-num" x="${t.x}" y="${t.y}" font-size="${5.6 * k}">${p}${String(a).padStart(2, "0")}</text>`;
      }
      if (a < n) {
        const m = 0.1 + 0.8 * a / n, s0 = P(m, -sg * W / 2, z + h), s1 = P(m, vMuro === 0 ? 0 : W / 2, z + h), s2 = P(m, vMuro, z);
        svg += `<polyline class="e3-tabique" points="${s0.x},${s0.y} ${s1.x},${s1.y} ${s2.x},${s2.y}" stroke-width="${(F.columnas ? 1.1 : 0.6) * k}"${F.columnas ? ` stroke="${F.columnas}"` : ""}/>`;
      }
    }
    // escaleras de los extremos (y escalera central compartida en B y C)
    const escX = L === "B" || L === "C" ? [[0, 0.06], [0.47, 0.53], [0.94, 1]] : [[0, 0.06], [0.94, 1]];
    for (const [u0, u1] of escX) {
      const va = u0 === 0.47 ? 0 : -W / 2, vb = u0 === 0.47 ? sg * W / 2 : W / 2;
      svg += poli([P(u0, va, z), P(u1, va, z), P(u1, vb, z), P(u0, vb, z)], "e3-escalera" + cls);
      for (let s = 1; s < 5; s++) {
        const v = va + ((vb - va) * s) / 5, l0 = P(u0, v, z + 0.05), l1 = P(u1, v, z + 0.05);
        svg += `<line class="e3-peldano" x1="${l0.x}" y1="${l0.y}" x2="${l1.x}" y2="${l1.y}" stroke-width="${0.5 * k}"/>`;
      }
    }
    // rótulos del piso y de los pabellones (crecen hacia AFUERA del edificio)
    const alOeste = F.observatorio === "este";       // en P el extremo este lo ocupa la torre
    const rp = P(alOeste ? 1.12 : -0.09, -W / 2, z + 3.2);
    svg += `<text class="e3-piso${cls}" style="text-anchor:${alOeste ? "end" : "start"}" x="${rp.x}" y="${rp.y}" font-size="${(o.mini ? 7.6 : 8.2) * k}">${p === 1 ? "Planta baja" : "Piso " + p}</text>`;
    if (!o.mini) {
      for (const [u, txt] of [[0.28, "Pab. Este"], [0.72, "Pab. Oeste"]]) {
        const t = P(u, sg * (W / 2 - 0.5), z);
        svg += `<text class="e3-pabtxt" x="${t.x}" y="${t.y}" font-size="${5.8 * k}">${txt}</text>`;
      }
    }
  }
  // techo y detalles del último piso
  const zt = zPiso(top) + 3;
  if (F.solar) {             // celdas solares sobre el techo de las aulas
    const v0 = -sg * (W / 2 - 0.6), v1 = -sg * 1;
    svg += poli([P(0.14, v0, zt + 0.2), P(0.86, v0, zt + 0.2), P(0.86, v1, zt + 0.2), P(0.14, v1, zt + 0.2)], "e3-solar");
  }
  if (F.observatorio) {      // torre del observatorio: franja verde, sello dorado y cúpula blanca
    const u0 = F.observatorio === "este" ? -0.05 : 0.95, u1 = u0 + 0.1, vf = W / 2, zt2 = zt + 5;
    svg += poli([P(u0, vf, 0), P(u1, vf, 0), P(u1, vf, zt2), P(u0, vf, zt2)], "e3-torre");
    svg += poli([P(u0, vf, zt2 - 2), P(u1, vf, zt2 - 2), P(u1, vf, zt2), P(u0, vf, zt2)], "e3-torre-verde");
    const sello = P((u0 + u1) / 2, vf, zt2 - 4);
    svg += `<circle class="e3-sello" cx="${sello.x}" cy="${sello.y}" r="1.3"/>`;
    const c = P((u0 + u1) / 2, vf - 2, zt2 + 1.2);
    svg += `<ellipse class="e3-cupula" cx="${c.x}" cy="${c.y}" rx="3.6" ry="2.8"/>`;
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
    ${svg}<g>${aristas}</g><g>${pesos}</g><g>${nodos}</g></svg>`;
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
  if (o.completo) vb = [0, 92, MAPA_W, 900];
  else {
    const foco = o.resaltar ? pos.filter((p, i) => p && (o.resaltar.has(i) || o.resaltar.has(i - 1))) : visibles;
    const usar = foco.length ? foco : visibles;
    const xs = usar.map(p => p.x), ys = usar.map(p => p.y);
    const minW = o.minW || 230;
    let x0 = Math.min(...xs) - 75, x1 = Math.max(...xs) + 75, y0 = Math.min(...ys) - 55, y1 = Math.max(...ys) + 45;
    let w = Math.max(x1 - x0, minW), h = Math.max(y1 - y0, w * (o.alto || 1));
    w = Math.max(w, h / (o.alto || 1));
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    x0 = Math.min(Math.max(cx - w / 2, 0), MAPA_W - w); y0 = Math.min(Math.max(cy - h / 2, 92), MAPA_H - 70 - h);
    vb = [x0, y0, w, h];
  }
  const s = vb[2] / 360;
  const peso = new Map(E.campus.aristas.map(a => [clave(a.origen, a.destino), a.peso]));
  const pFin = pos[pos.length - 1];
  const tuAbajo = pinTu && pFin && pinTu.y >= pFin.y;
  const cajas = [];
  const choca = (x, y, w, h) => cajas.some(c => Math.abs(x - c.x) < (w + c.w) / 2 && Math.abs(y - c.y) < (h + c.h) / 2);
  if (pinTu) {
    cajas.push({ x: pinTu.x, y: pinTu.y, w: 28 * s, h: 28 * s });
    cajas.push({ x: pinTu.x, y: tuAbajo ? pinTu.y + 22 * s : pinTu.y - 20 * s, w: 54 * s, h: 16 * s });
  }
  if (pFin && ruta.length > 1) {
    cajas.push({ x: pFin.x, y: pFin.y, w: 28 * s, h: 28 * s });
    cajas.push({ x: pFin.x, y: tuAbajo ? pFin.y - 22 * s : pFin.y + 22 * s, w: 72 * s, h: 16 * s });
  }
  pos.forEach((p, i) => {
    if (p && i > 0 && i < pos.length - 1) cajas.push({ x: p.x, y: p.y, w: 18 * s, h: 18 * s });
  });
  let aristas = "", pesos = "", nodos = "";
  const primerFuera = pos.findIndex(Boolean);
  if (pinTu && primerFuera > 0) {
    const B = pos[primerFuera];
    aristas += `<line class="r3-dentro" x1="${pinTu.x}" y1="${pinTu.y}" x2="${B.x}" y2="${B.y}" stroke-width="${3 * s}" stroke-dasharray="${5 * s} ${4 * s}"/>`;
  }
  for (let i = 0; i + 1 < pos.length; i++) {
    const A = pos[i], B = pos[i + 1];
    if (!A || !B) continue;
    const cls = o.resaltar ? (o.resaltar.has(i) ? "r3-arista resaltada" : "r3-arista tenue") : "r3-arista";
    aristas += flecha(A, B, s * 2.2, cls, 6);
    const p = peso.get(clave(ruta[i], ruta[i + 1]));
    const Lr = Math.hypot(B.x - A.x, B.y - A.y);
    if (p !== undefined && Lr > 24 * s) {
      const lbl = `${fmt(p)} s`;
      const pw = Math.max(28, lbl.length * 6.2 + 8) * s, ph = 16 * s;
      const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2;
      const nx = -(B.y - A.y) / (Lr || 1), ny = (B.x - A.x) / (Lr || 1);
      const candidatos = [
        [mx, my],
        [mx + nx * 16 * s, my + ny * 16 * s],
        [mx - nx * 16 * s, my - ny * 16 * s],
        [mx + 22 * s, my],
        [mx - 22 * s, my],
      ];
      const libre = candidatos.find(([cx, cy]) => !choca(cx, cy, pw, ph));
      if (libre) {
        cajas.push({ x: libre[0], y: libre[1], w: pw + 4 * s, h: ph + 4 * s });
        pesos += `<g class="r3-peso" transform="translate(${libre[0]},${libre[1]})"><rect x="${-pw / 2}" y="${-ph / 2}" width="${pw}" height="${ph}" rx="${ph / 2}"/><text font-size="${9.5 * s}">${fmt(p)} s</text></g>`;
      }
    }
  }
  ruta.forEach((n, i) => {
    const p = pos[i];
    if (!p || (ruta.length === 1 && pinTu)) return;
    const fin = i === ruta.length - 1;
    const rad = (fin ? 13 : 8) * s;
    const etqY = tuAbajo ? p.y - rad - 6 * s : p.y + rad + 14 * s;
    nodos += `<g class="r3-nodo ${fin ? "meta" : "parada"}"><title>${esc(n)}</title><circle cx="${p.x}" cy="${p.y}" r="${rad}" stroke-width="${2.5 * s}"/>
      ${fin ? `<text x="${p.x}" y="${p.y}" font-size="${13 * s}">✓</text><text class="r3-etq" x="${p.x}" y="${etqY}" font-size="${12.5 * s}" stroke-width="${4 * s}">${esc(corto(n))}</text>` : ""}</g>`;
  });
  if (pinTu) {
    const tuY = tuAbajo ? pinTu.y + 24 * s : pinTu.y - 19 * s;
    nodos += `<g class="r3-nodo inicio"><circle cx="${pinTu.x}" cy="${pinTu.y}" r="${13 * s}" stroke-width="${2.5 * s}"/><text x="${pinTu.x}" y="${pinTu.y}" font-size="${10 * s}">Tú</text>
      <text class="r3-etq" x="${pinTu.x}" y="${tuY}" font-size="${11.5 * s}" stroke-width="${4 * s}">${esc(ruta[0])}</text></g>`;
  }
  let bloq = "";
  for (const b of E.campus.bloqueados) {
    const A = posCampus(b.origen), B = posCampus(b.destino);
    if (A && B) bloq += `<line class="r3-bloq" x1="${A.x}" y1="${A.y}" x2="${B.x}" y2="${B.y}" stroke-width="${3.5 * s}" stroke-dasharray="${6 * s} ${5 * s}"/>`;
  }
  return `<svg class="c3d${o.mini ? " mini" : ""}" viewBox="${vb.map(n => n.toFixed(1)).join(" ")}" style="aspect-ratio:${vb[2].toFixed(1)}/${vb[3].toFixed(1)}" role="img" aria-label="Ruta sobre el mapa 3D del campus">
    <image href="/static/img/mapa-campus-3d.svg" width="${MAPA_W}" height="${MAPA_H}"/>
    <rect x="${vb[0]}" y="${vb[1]}" width="${vb[2]}" height="${vb[3]}" class="r3-velo"/>
    ${bloq}<g>${aristas}</g><g>${pesos}</g><g>${nodos}</g></svg>`;
}

/* Vista pequeña de un paso: por dentro del edificio, o el tramo por el campus. */
function vistaPaso(r, p) {
  if (!PLANO) return "";
  const resaltar = new Set();
  for (let i = p.desde; i < p.hasta; i++) resaltar.add(i);
  const L = edificioDe(r.ruta[p.desde]) || edificioDe(r.ruta[p.hasta]);
  if (L && (p.tipo === "pasillo" || p.tipo === "escalera" || p.tipo === "salida" || p.tipo === "cruce")) {
    const G = geomEdificio(L);
    if (G && nodoEnEdificio(G, r.ruta[p.desde]) && nodoEnEdificio(G, r.ruta[p.hasta])) {
      return edificio3D(L, { ruta: r.ruta, resaltar, mini: true });
    }
  }
  return campusSvg(r.ruta, { resaltar, mini: true, minW: 200, alto: 0.6 });
}

let ultEdificioVista = "";

function renderMapa3D(r, pasos = []) {
  const cajaEd = $("#lienzo-edificio");
  if (!r || !r.ruta.length || !PLANO) {
    cajaEd.hidden = true; $("#t-edificio").hidden = true; ultEdificioVista = "";
    const sinSalida = r && r.origen && r.tiempo === null;
    $("#campus-cab").innerHTML = `<span>${sinSalida ? `Sin salida libre desde <b>${esc(r.origen)}</b>.` : "Elige dónde estás para ver tu ruta en el mapa."}</span>`;
    $("#mapa-campus").innerHTML = PLANO ? campusSvg(sinSalida ? [r.origen] : [], { completo: !sinSalida, minW: 300, alto: 1 }) || `<svg class="c3d" viewBox="0 92 ${MAPA_W} 900"><image href="/static/img/mapa-campus-3d.svg" width="${MAPA_W}" height="${MAPA_H}"/></svg>` : "";
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
  $("#mapa-campus").innerHTML = campusSvg(r.ruta, { completo: mapaCompleto, resaltar, minW: 300, alto: 1 });
  const nV = r.ruta.length, nA = nV - 1;
  $("#campus-cab").innerHTML = `<span><b>${nV} ${nV === 1 ? "vértice" : "vértices"} · ${nA} ${nA === 1 ? "arista" : "aristas"}</b></span>
    <button class="btn mini" data-accion="mapa-zoom">${mapaCompleto ? "Acercar a mi ruta" : "Ver todo el campus"}</button>`;
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

  const zonas = new Set(E.campus.zonasSeguras);
  $("#adyacencia").innerHTML = g.vertices.length ? g.vertices.map(v => {
    const sal = g.aristas.filter(a => a.origen === v);
    return `<li><b>${esc(v)}${!esMesh && zonas.has(v) ? " · zona segura" : ""}</b><span>neig = [${sal.map(a => `(${esc(a.destino)}, ${fmt(a.peso)})`).join(", ")}]</span></li>`;
  }).join("") : `<li class="nota">vertexs = []</li>`;
}

/* ---------------------------------------------------------------- tabs */

function irA(nombre) {
  if (!["inicio", "mesh", "campus", "admin"].includes(nombre)) nombre = "inicio";
  vista = nombre;
  $$(".vista").forEach(s => { s.hidden = s.id !== "v-" + nombre; });
  $$(".nav a").forEach(a => (a.dataset.tab === nombre ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current")));
  window.scrollTo(0, 0);
  render();
}

/* ------------------------------------------------------------- eventos */

function eventos() {
  window.addEventListener("hashchange", () => irA(location.hash.slice(1)));

  document.addEventListener("click", ev => {
    const b = ev.target.closest("[data-accion]");
    if (b) accion(b.dataset.accion);
    if (ev.target.closest("[data-cerrar]")) cerrarHoja();
    const t = ev.target.closest("[data-ttl]");
    if (t) { ttl = Math.max(0, Math.min(20, ttl + Number(t.dataset.ttl))); $("#ttl").textContent = ttl; }
    const f = ev.target.closest("[data-f]");
    if (f) { factor = Number(f.dataset.f); renderCampus(); }
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
    if (ev.key === "Escape") cerrarHoja();
    if (ev.key === "Tab" && !$("#hoja").hidden) {
      const botones = [...$$(".hoja-carta button")];
      if (!botones.length) return;
      const primero = botones[0], ultimo = botones[botones.length - 1];
      if (ev.shiftKey && document.activeElement === primero) { ev.preventDefault(); ultimo.focus(); }
      else if (!ev.shiftKey && document.activeElement === ultimo) { ev.preventDefault(); primero.focus(); }
    }
  });

  $("#mesh-origen").addEventListener("change", () => { if (!animando) { alcanceMostrado = null; viaMostrada = {}; renderMesh(); } });
  $("#campus-ubicacion").addEventListener("change", ev => {
    miLugar = ev.target.value; guardar("mi-lugar", miLugar); rutaAnterior = null; pasoActivo = -1; pedirRuta();
  });
  document.addEventListener("click", ev => {
    const b = ev.target.closest("[data-bloq]");
    if (b) { const [o, d] = JSON.parse(b.dataset.bloq); bloquear(o, d, true); return; }
    const p = ev.target.closest("[data-paso]");
    if (p) { const i = Number(p.dataset.paso); pasoActivo = pasoActivo === i ? -1 : i; renderCampus(); }
  });

  interacciones($("#svg-mesh"), "mesh", v => {
    if (animando) return;
    $("#mesh-origen").value = v;
    alcanceMostrado = null; viaMostrada = {};
    renderMesh();
    hoja(v, "Teléfono de la red Mesh.", [
      { txt: `Emitir alerta desde aquí (TTL ${ttl})`, cls: "alerta", fn: () => accion("emitir") },
    ]);
  });

  // formularios de administrar
  $$("form[data-form]").forEach(form => form.addEventListener("submit", async ev => {
    ev.preventDefault();
    const fd = new FormData(form), tipo = form.dataset.form, boton = ev.submitter;
    const base = `/api/${grafoAdmin}`;
    if (tipo === "v-insertar") {
      const j = await api(`${base}/vertice`, { accion: "insertar", nombre: fd.get("nombre"), zonaSegura: fd.get("zonaSegura") === "on" });
      if (j.ok) form.reset();
    } else if (tipo === "a-insertar") {
      await api(`${base}/arista`, { accion: boton?.value || "insertar", origen: fd.get("origen"), destino: fd.get("destino"), peso: fd.get("peso") });
    } else if (tipo === "eliminar") {
      if (boton?.value === "vertice") {
        const v = fd.get("vertice");
        if (v && confirm(`¿Eliminar «${v}» y todas sus aristas?`)) await api(`${base}/vertice`, { accion: "eliminar", nombre: v });
      } else {
        const a = fd.get("arista");
        if (a) { const [o, d] = JSON.parse(a); await api(`${base}/arista`, { accion: "eliminar", origen: o, destino: d }); }
      }
    }
  }));
}

async function accion(a) {
  if (!E) return;
  if (a === "emitir") {
    if (animando) return;
    const origen = $("#mesh-origen").value;
    if (!origen) return;
    if (vista !== "mesh") location.hash = "#mesh";
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
    renderCampus();
  } else if (a === "reiniciar-campus") {
    rutaAnterior = null; seleccion = null;
    api("/api/reiniciar", { grafo: "campus" });
  } else if (a === "reiniciar-grafo") {
    if (confirm(`¿Volver a los datos de ejemplo de ${grafoAdmin === "mesh" ? "la red Mesh" : "el campus"}?`)) {
      reordenar(grafoAdmin);
      api("/api/reiniciar", { grafo: grafoAdmin });
    }
  } else if (a === "reiniciar-todo") {
    if (confirm("¿Reiniciar los dos grafos con los datos de ejemplo?")) {
      reordenar("mesh"); reordenar("campus");
      rutaAnterior = null; seleccion = null;
      api("/api/reiniciar", { grafo: "ambos" });
    }
  }
}

/* -------------------------------------------------------------- inicio */

async function sondeo() {
  if (window.__UNEXUAM_OFFLINE__) return;
  if (!document.hidden && !animando && !$("#svg-mesh").classList.contains("arrastrando")) {
    try {
      const r = await fetch("/api/estado");
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      marcarConexion(true);
      if (j.estado && JSON.stringify(j.estado) !== firma) aplicarEstado(j.estado);
    } catch (e) {
      marcarConexion(false);
    }
  }
  setTimeout(sondeo, 4000);
}

eventos();
api("/api/estado").then(() => irA(location.hash.slice(1) || "inicio"));
if (!window.__UNEXUAM_OFFLINE__) setTimeout(sondeo, 4000);
