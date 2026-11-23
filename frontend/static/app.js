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

async function api(ruta, cuerpo) {
  try {
    const r = await fetch(ruta, cuerpo === undefined ? {} : {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cuerpo),
    });
    const j = await r.json();
    $(".chip-offgrid").classList.remove("caido");
    if (j.estado) aplicarEstado(j.estado);
    if (cuerpo !== undefined) aviso(j.mensaje, j.ok);
    return j;
  } catch (e) {
    $(".chip-offgrid").classList.add("caido");
    if (cuerpo !== undefined) aviso("Sin conexión con el servidor local.", false);
    return { ok: false };
  }
}

/* ------------------------------------------------------------- layout */

const W = 360;
const POS = { mesh: leer("pos-mesh", {}), campus: leer("pos-campus", {}) };

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
    render();
  });
  const fin = () => {
    if (!ini) return;
    const t = ini; ini = null;
    if (t.mov) { svg.classList.remove("arrastrando"); guardar("pos-" + cual, POS[cual]); render(); return; }
    if (t.n) alTocarNodo(t.n);
    else if (t.a && alTocarArista) alTocarArista(t.a.split(FLECHA));
  };
  svg.addEventListener("pointerup", fin);
  svg.addEventListener("pointercancel", () => { ini = null; svg.classList.remove("arrastrando"); });
}

/* ------------------------------------------------------- hoja inferior */

function hoja(titulo, texto, acciones) {
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
}
function cerrarHoja() { $("#hoja").hidden = true; }

/* ---------------------------------------------------------- selects */

function llenar(sel, opciones, vacio) {
  const prev = sel.value;
  sel.innerHTML = (vacio ? `<option value="">${esc(vacio)}</option>` : "") +
    opciones.map(o => `<option value="${esc(o.v)}">${esc(o.t)}</option>`).join("");
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
  else if (!ua) { alertaVista = "nada"; alcanceMostrado = null; viaMostrada = {}; }
  render();
  // si el grafo del campus cambió (bloqueo, congestión, admin), recalcular la ruta de este teléfono
  const fc = JSON.stringify([est.campus.aristas, est.campus.zonasSeguras]);
  if (fc !== firmaCampus) { firmaCampus = fc; pedirRuta(); }
}

function render() {
  if (!E) return;
  renderInicio();
  renderMesh();
  renderCampus();
  renderAdmin();
}

/* ---------------------------------------------------------------- inicio */

function renderInicio() {
  const m = E.mesh, c = E.campus, ua = E.ultimaAlerta;
  const stubs = Object.entries(E.origen).filter(([, o]) => o === "stub").map(([n]) => n);
  const avisoStub = $("#aviso-stub");
  avisoStub.hidden = !stubs.length;
  avisoStub.innerHTML = stubs.length === Object.keys(E.origen).length
    ? "<b>Modo demostración.</b> Todavía no hay <code>backend/</code>: se usa el stub temporal con datos falsos. No es la lógica entregable."
    : `<b>Backend incompleto.</b> ${stubs.length} de ${Object.keys(E.origen).length} piezas vienen del stub temporal.`;

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

  $("#origenes").innerHTML = Object.entries(E.origen).map(([n, o]) =>
    `<li><code>${esc(n)}</code><span class="${o === "backend" ? "b" : "s"}">${o === "backend" ? "backend" : "stub"}</span></li>`).join("");
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
  escalera: /^([A-Z]) Escalera (Este|Oeste) P(\d+)$/,    // "C Escalera Oeste P3"
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
  sel.innerHTML = (vacio ? `<option value="">${esc(vacio)}</option>` : "") + orden.map(g =>
    `<optgroup label="${esc(g)}">${grupos.get(g).sort((a, b) => a.t.localeCompare(b.t, "es", { numeric: true }))
      .map(o => `<option value="${esc(o.v)}">${esc(o.t)}</option>`).join("")}</optgroup>`).join("");
  if (opciones.some(o => o.v === prev)) sel.value = prev;
}

/* Agrupa la ruta (lista de vértices) en pasos que una persona entiende. */
function pasosDeRuta(ruta) {
  const peso = new Map(E.campus.aristas.map(a => [clave(a.origen, a.destino), a.peso || 0]));
  const I = ruta.map(lugarInfo);
  const tipoTramo = (a, b) => {
    if (b.t === "zona") return "zona";
    const enPiso = x => x.t === "aula" || x.t === "escalera" || x.t === "pabellon";
    if (enPiso(a) && enPiso(b) && a.ed === b.ed && a.piso === b.piso &&
        !(a.t === "escalera" && b.t === "escalera")) return `pasillo:${a.ed}:${a.piso}`;
    if (a.t === "escalera" && b.t === "escalera" && a.ed === b.ed) return `escalera:${a.ed}:${b.lado}`;
    if (b.t === "salida") return `salida:${b.ed}`;
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
    } else if (tipo === "escalera") {
      const verbo = b.piso < a.piso ? "Baja" : "Sube";
      texto = `${verbo} por la escalera ${b.lado} del edificio ${b.ed} hasta ${nombrePiso(b.piso)}.`;
    } else if (tipo === "salida") {
      texto = `Sal del edificio ${b.ed} por la salida ${b.lado}.`;
    } else if (tipo === "zona") {
      texto = idx === 0 && a.t === "aula" ? `Sal del aula ${a.n} y ve directo a ${b.n}.` : `Camina hasta ${b.n}.`;
    } else {
      texto = idx === 0 && a.t === "aula" ? `Sal del aula ${a.n} y ve hacia ${b.n}.` : `Ve hacia ${b.n}.`;
    }
    return { tipo, texto, segundos, de: ruta[g.desde], a: ruta[g.desde + 1], llega: b.n };
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
    renderMapa3D(null, []);
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
        <span class="paso-n">${i + 1}</span>
        <div class="paso-cuerpo">
          <p class="paso-texto">${esc(p.texto)}</p>
          <p class="paso-meta"><span>${ICONO_PASO[p.tipo] || "→"} ${minutos(p.segundos)}</span>
            <button type="button" class="paso-bloq" data-bloq='${esc(JSON.stringify([p.de, p.a]))}'>Simular bloqueo</button></p>
        </div>
      </li>`).join("")}
    </ol>
    <p class="consejo">Camina, no corras. No uses el ascensor. Ayuda a quien lo necesite y espera indicaciones en el punto seguro.</p>`;
  if (pasoActivo >= pasos.length) pasoActivo = -1;
  renderMapa3D(r, pasos);
}

function bloquear(o, d, ambos) {
  return api("/api/campus/bloquear", { origen: o, destino: d, ambos });
}


/* --- La ruta dibujada como GRAFO encima del mapa 3D del campus -------------------------
 * El mapa (img/mapa-campus-3d.svg) lo genera docs/mapa-campus/generar_mapa.py con una
 * proyección isométrica: giro de 16°, achatamiento 0.58 y encaje en 200..1400 x 140..935
 * de un lienzo de 1600 x 1060. Aquí se reproduce la misma proyección P(x, y, z) para poner
 * cada vértice de la ruta (en metros, de campus-plano.json) justo encima de su lugar.
 * Las aulas, pabellones y escaleras de B, C y P no tienen coordenada propia: se ubican
 * entre la salida este y la oeste de su edificio, a la altura de su piso. */

let PLANO = null;            // frontend/static/campus-plano.json (OpenStreetMap, en metros)
let PROY = null;             // { esc, ox, oy } de la proyección del mapa 3D
let mapaCompleto = false;    // false: acercado a la ruta · true: todo el campus
let pasoActivo = -1;         // paso de la guía resaltado en el mapa

const MAPA_W = 1600, MAPA_H = 1060, PISO_M = 3.6;
const GIRO = 16 * Math.PI / 180, ACHATE = 0.58, COS_G = Math.cos(GIRO), SEN_G = Math.sin(GIRO);

function proyBase(x, y, z) {
  const xr = x * COS_G - y * SEN_G, yr = x * SEN_G + y * COS_G;
  return [xr, yr * ACHATE - z];
}

function prepararProyeccion() {
  // igual que encajar(200, 140, 1400, 935) en generar_mapa.py
  const pts = [];
  for (const [x, y] of PLANO.campus) for (const z of [-6, 20]) pts.push(proyBase(x, y, z));
  const bx0 = Math.min(...pts.map(p => p[0])), bx1 = Math.max(...pts.map(p => p[0]));
  const by0 = Math.min(...pts.map(p => p[1])), by1 = Math.max(...pts.map(p => p[1]));
  const [x0, y0, x1, y1] = [200, 140, 1400, 935];
  const esc = Math.min((x1 - x0) / (bx1 - bx0), (y1 - y0) / (by1 - by0));
  PROY = {
    esc,
    ox: x0 + ((x1 - x0) - (bx1 - bx0) * esc) / 2 - bx0 * esc,
    oy: y0 + ((y1 - y0) - (by1 - by0) * esc) / 2 - by0 * esc,
  };
}

function proyectar(x, y, z = 0) {
  const [a, b] = proyBase(x, y, z);
  return { x: a * PROY.esc + PROY.ox, y: b * PROY.esc + PROY.oy };
}

fetch("/static/campus-plano.json").then(r => r.json()).then(j => {
  PLANO = j; prepararProyeccion();
  if (E) renderCampus();
}).catch(() => {});

function posicion3D(n) {
  if (!PLANO) return null;
  const q = PLANO.posiciones[n];
  const i = lugarInfo(n);
  if (q && i.t !== "aula" && i.t !== "pabellon" && i.t !== "escalera") return proyectar(q[0], q[1], 0);
  if (!i.ed) return null;
  const este = PLANO.posiciones[`${i.ed} Salida Este`], oeste = PLANO.posiciones[`${i.ed} Salida Oeste`];
  if (!este || !oeste) return null;
  let t = 0.5, z = 0;
  const alturaPiso = p => (p - 1) * PISO_M + PISO_M / 2;
  if (i.t === "salida") t = i.lado === "este" ? 0 : 1;
  else if (i.t === "escalera") { t = i.lado === "este" ? 0.06 : 0.94; z = alturaPiso(i.piso); }
  else if (i.t === "pabellon") { t = i.lado === "este" ? 0.3 : 0.7; z = alturaPiso(i.piso); }
  else if (i.t === "aula") {
    const enPiso = E.campus.vertices.filter(v => { const k = lugarInfo(v); return k.t === "aula" && k.ed === i.ed && k.piso === i.piso; }).length || 1;
    t = 0.1 + 0.8 * (i.num - 0.5) / enPiso;   // la 01 es la del extremo este
    z = alturaPiso(i.piso);
  }
  return proyectar(este[0] + (oeste[0] - este[0]) * t, este[1] + (oeste[1] - este[1]) * t, z);
}

function corto(n) {
  return n.replace(/^Punto Seguro /, "PS ").replace(/^Zona Segura /, "ZS ").replace(/ Pabell[oó]n /, " Pab. ")
    .replace(/ Escalera /, " Esc. ").replace(/ P(\d)$/, " P$1");
}

function renderMapa3D(r, pasos) {
  const svg = $("#svg-campus"), cab = $("#campus-cab");
  if (!r || !r.ruta.length) {
    cab.innerHTML = `<span>Elige dónde estás para ver tu ruta en el mapa.</span>`;
    svg.setAttribute("viewBox", `0 0 ${MAPA_W} ${MAPA_H}`);
    svg.innerHTML = `<image href="/static/img/mapa-campus-3d.svg" width="${MAPA_W}" height="${MAPA_H}"/>`;
    return;
  }
  const pos = r.ruta.map(posicion3D);
  if (!PLANO || pos.some(p => !p)) {
    cab.innerHTML = `<span>El mapa 3D solo está disponible para el campus real de la UAM.</span>`;
    svg.innerHTML = "";
    return;
  }
  // caja de la vista: acercada a la ruta o todo el campus (proporción 4:3 para el celular)
  let vb;
  if (mapaCompleto) vb = [0, 60, MAPA_W, MAPA_H - 60];
  else {
    const xs = pos.map(p => p.x), ys = pos.map(p => p.y);
    let x0 = Math.min(...xs) - 45, x1 = Math.max(...xs) + 45, y0 = Math.min(...ys) - 55, y1 = Math.max(...ys) + 35;
    let w = Math.max(x1 - x0, 260), h = Math.max(y1 - y0, w * 0.75);
    w = Math.max(w, h / 0.75);
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    x0 = Math.min(Math.max(cx - w / 2, 0), MAPA_W - w); y0 = Math.min(Math.max(cy - h / 2, 0), MAPA_H - h);
    vb = [x0, y0, w, h];
  }
  svg.setAttribute("viewBox", vb.map(n => Math.round(n)).join(" "));
  const s = vb[2] / 360;                   // unidades del mapa por píxel de pantalla
  const peso = new Map(E.campus.aristas.map(a => [clave(a.origen, a.destino), a.peso]));

  // a qué paso de la guía pertenece cada arista, y en qué vértice termina cada paso
  const pasoDeArista = [], finDePaso = new Map();
  let k = 0;
  pasos.forEach((p, idx) => {
    while (k < r.ruta.length - 1) {
      pasoDeArista[k] = idx;
      k++;
      if (r.ruta[k] === p.llega) break;
    }
    finDePaso.set(r.ruta[k], idx);
  });

  let aristas = "", nodos = "", pesos = "";
  for (let i = 0; i + 1 < pos.length; i++) {
    const A = pos[i], B = pos[i + 1];
    const dx = B.x - A.x, dy = B.y - A.y, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
    const rB = (finDePaso.has(r.ruta[i + 1]) || i + 1 === pos.length - 1 ? 13 : 7) * s;
    const fin = { x: B.x - ux * (rB + 2 * s), y: B.y - uy * (rB + 2 * s) };
    const t = 9 * s, w = 5.5 * s;
    const activa = pasoActivo >= 0 && pasoDeArista[i] === pasoActivo;
    aristas += `<line class="r3-arista${activa ? " activa" : ""}" x1="${A.x}" y1="${A.y}" x2="${fin.x - ux * t * 0.6}" y2="${fin.y - uy * t * 0.6}" stroke-width="${5 * s}"/>
      <path class="r3-flecha${activa ? " activa" : ""}" d="M${fin.x},${fin.y} L${fin.x - ux * t - uy * w},${fin.y - uy * t + ux * w} L${fin.x - ux * t + uy * w},${fin.y - uy * t - ux * w}Z"/>`;
    const p = peso.get(clave(r.ruta[i], r.ruta[i + 1]));
    if (p !== undefined && L > 26 * s) {
      const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2;
      pesos += `<g class="r3-peso" transform="translate(${mx},${my})"><rect x="${-13 * s}" y="${-7.5 * s}" width="${26 * s}" height="${15 * s}" rx="${7.5 * s}"/><text font-size="${9.5 * s}">${fmt(p)} s</text></g>`;
    }
  }
  r.ruta.forEach((n, i) => {
    const p = pos[i], ini = i === 0, fin = i === r.ruta.length - 1, idx = finDePaso.get(n);
    const grande = ini || fin || idx !== undefined;
    const rad = (grande ? 13 : 7) * s;
    const cls = ini ? "inicio" : fin ? "meta" : grande ? "parada" : "intermedio";
    const marca = ini ? "Tú" : fin ? "✓" : idx !== undefined ? String(idx + 1) : "";
    const activa = pasoActivo >= 0 && idx === pasoActivo;
    nodos += `<g class="r3-nodo ${cls}${activa ? " activa" : ""}"><title>${esc(n)}</title>
      <circle cx="${p.x}" cy="${p.y}" r="${rad}" stroke-width="${2.5 * s}"/>
      ${marca ? `<text x="${p.x}" y="${p.y}" font-size="${(marca.length > 1 ? 9.5 : 12) * s}">${marca}</text>` : ""}
      ${ini || fin ? `<text class="r3-etq" x="${p.x}" y="${p.y - rad - 6 * s}" font-size="${12 * s}" stroke-width="${4 * s}">${esc(corto(n))}</text>` : ""}</g>`;
  });
  // pasos bloqueados cercanos a la vista (aristas que se quitaron del grafo)
  let bloq = "";
  for (const b of E.campus.bloqueados) {
    const A = posicion3D(b.origen), B = posicion3D(b.destino);
    if (A && B) bloq += `<line class="r3-bloq" x1="${A.x}" y1="${A.y}" x2="${B.x}" y2="${B.y}" stroke-width="${3.5 * s}" stroke-dasharray="${6 * s} ${5 * s}"/>`;
  }
  svg.innerHTML = `<image href="/static/img/mapa-campus-3d.svg" width="${MAPA_W}" height="${MAPA_H}"/>
    <rect x="${vb[0]}" y="${vb[1]}" width="${vb[2]}" height="${vb[3]}" class="r3-velo"/>
    ${bloq}<g>${aristas}</g><g>${pesos}</g><g>${nodos}</g>`;
  cab.innerHTML = `<span><b>${r.ruta.length} vértices · ${r.ruta.length - 1} aristas</b> de tu ruta</span>
    <button class="btn mini" data-accion="mapa-zoom">${mapaCompleto ? "Acercar a mi ruta" : "Ver todo el campus"}</button>`;
}

/* --------------------------------------------------------------- admin */

function renderAdmin() {
  const g = grafoAdmin === "mesh" ? E.mesh : E.campus;
  const opsV = g.vertices.map(v => ({ v, t: v }));
  $$("[data-vertices]").forEach(s => llenar(s, opsV));
  $$("[data-aristas]").forEach(s => llenar(s, g.aristas.map(a => ({ v: JSON.stringify([a.origen, a.destino]), t: `${a.origen} → ${a.destino} (${fmt(a.peso)})` }))));
  $$("[data-grafo]").forEach(b => b.setAttribute("aria-selected", String(b.dataset.grafo === grafoAdmin)));
  $$(".solo-campus").forEach(el => { el.hidden = grafoAdmin !== "campus"; });
  const esMesh = grafoAdmin === "mesh";
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
  document.addEventListener("keydown", ev => { if (ev.key === "Escape") cerrarHoja(); });

  $("#mesh-origen").addEventListener("change", () => { if (!animando) { alcanceMostrado = alcanceMostrado; renderMesh(); } });
  $("#campus-ubicacion").addEventListener("change", ev => {
    miLugar = ev.target.value; guardar("mi-lugar", miLugar); rutaAnterior = null; pasoActivo = -1; pedirRuta();
  });
  document.addEventListener("click", ev => {
    const b = ev.target.closest("[data-bloq]");
    if (b) { const [o, d] = JSON.parse(b.dataset.bloq); bloquear(o, d, true); return; }
    const p = ev.target.closest("[data-paso]");
    if (p) { const i = Number(p.dataset.paso); pasoActivo = pasoActivo === i ? -1 : i; renderCampus(); }
  });
  $("#bloq-paso").addEventListener("change", ev => { seleccion = JSON.parse(ev.target.value || "null"); renderCampus(); });

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
  if (document.hidden || animando || $("#svg-mesh").classList.contains("arrastrando") || $("#svg-campus").classList.contains("arrastrando")) return;
  try {
    const r = await fetch("/api/estado");
    const j = await r.json();
    $(".chip-offgrid").classList.remove("caido");
    if (JSON.stringify(j.estado) !== firma) aplicarEstado(j.estado);
  } catch (e) {
    $(".chip-offgrid").classList.add("caido");
  }
}

eventos();
api("/api/estado").then(() => irA(location.hash.slice(1) || "inicio"));
setInterval(sondeo, 4000);
