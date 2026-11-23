/* Evacua UAM · lógica de la interfaz (JS sin librerías, funciona sin internet).
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

const R = 15;

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
  const P = posiciones(cual, g);
  const existe = new Set(g.aristas.map(a => clave(a.origen, a.destino)));
  const todas = [...g.aristas.map(a => ({ ...a, fantasma: false })),
                 ...(o.fantasmas || []).filter(a => P[a.origen] && P[a.destino] && !existe.has(clave(a.origen, a.destino)))
                   .map(a => ({ ...a, fantasma: true }))];
  const pares = new Set(todas.map(a => clave(a.origen, a.destino)));

  let fondo = "", frente = "";
  for (const a of todas) {
    const A = P[a.origen], B = P[a.destino];
    if (!A || !B || a.origen === a.destino) continue;
    const curva = pares.has(clave(a.destino, a.origen));
    const gm = geometria(A, B, curva);
    const k = clave(a.origen, a.destino);
    const cls = a.fantasma ? "bloqueada" : (o.claseArista ? o.claseArista(a) : "");
    const peso = `${fmt(a.peso)}${o.unidad || ""}`;
    const html = `<g class="ar" data-a="${esc(k)}">
      <path class="arista ${cls}" d="${gm.d}" data-k="${esc(k)}"/>
      ${a.fantasma ? "" : `<path class="flecha ${cls}" d="${gm.flecha}"/>`}
      <text class="peso ${cls}" x="${gm.m.x}" y="${gm.m.y}">${a.fantasma ? "✕" : esc(peso)}</text>
      <path class="toque" d="${gm.d}"><title>${esc(a.origen)} ${FLECHA} ${esc(a.destino)} · ${esc(peso)}</title></path>
    </g>`;
    if (cls && cls !== "bloqueada") frente += html; else fondo += html;
  }

  let nodos = "";
  for (const v of g.vertices) {
    const p = P[v];
    const lin = etiqueta(v);
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
    ? `<g>${fondo}</g><g>${frente}</g><g class="capa-chispa"></g><g>${nodos}</g>`
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
  // ruta: si cambió por un incidente, recordar la de antes para compararla
  const ra = anterior?.campus.ruta, rn = est.campus.ruta;
  if (ra && rn && ra.origen === rn.origen && JSON.stringify(ra.ruta) !== JSON.stringify(rn.ruta)) rutaAnterior = ra;
  else if (ra && rn && ra.origen === rn.origen && ra.tiempo !== rn.tiempo) rutaAnterior = ra;
  else if (!rn || (ra && ra.origen !== rn.origen)) rutaAnterior = null;
  // alerta nueva emitida desde otro teléfono → animarla aquí también
  const ua = est.ultimaAlerta;
  const k = ua ? ua.hora + ua.origen + ua.ttl : null;
  if (k && alertaVista === null) { alertaVista = k; mostrarAlcanceFinal(ua); }
  else if (k && k !== alertaVista && !animando) { alertaVista = k; aviso(`Nueva alerta desde ${ua.origen}`, false); animarAlerta(ua); }
  else if (!ua) { alertaVista = "nada"; alcanceMostrado = null; viaMostrada = {}; }
  render();
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
  const r = c.ruta;
  $("#c-tie").textContent = r ? (r.tiempo === null ? "sin ruta" : `${fmt(r.tiempo)} s`) : "–";
  $("#c-tie").className = r ? (r.tiempo === null ? "rojo" : "verde") : "";
  $("#c-nota").textContent = r
    ? (r.tiempo === null ? `Desde ${r.origen} no se llega a ninguna zona segura.` : `${r.ruta.join(" → ")}`)
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

function renderCampus() {
  const c = E.campus;
  const P = posiciones("campus", c);
  llenar($("#campus-ubicacion"), c.vertices.filter(v => !c.zonasSeguras.includes(v)).map(v => ({ v, t: v })), "Elige dónde estás…");
  $("#campus-ubicacion").value = c.ubicacion || "";
  llenar($("#bloq-paso"), c.aristas.map(a => ({ v: JSON.stringify([a.origen, a.destino]), t: `${a.origen} → ${a.destino} (${fmt(a.peso)} s)` })));
  if (seleccion) {
    const v = JSON.stringify(seleccion);
    if (c.aristas.some(a => a.origen === seleccion[0] && a.destino === seleccion[1])) $("#bloq-paso").value = v;
    else seleccion = null;
  }
  llenar($("#cong-lugar"), c.vertices.map(v => ({ v, t: v + (c.congestion[v] ? ` (×${c.congestion[v]})` : "") })));
  $$("#cong-factor button").forEach(b => b.setAttribute("aria-pressed", String(Number(b.dataset.f) === factor)));

  const r = c.ruta;
  const enRuta = new Set(), aristasRuta = new Set(), aristasAntes = new Set();
  if (r && r.ruta.length) {
    r.ruta.forEach((n, i) => { enRuta.add(n); if (i) aristasRuta.add(clave(r.ruta[i - 1], n)); });
  }
  if (rutaAnterior && rutaAnterior.ruta.length) {
    rutaAnterior.ruta.forEach((n, i) => { if (i) aristasAntes.add(clave(rutaAnterior.ruta[i - 1], n)); });
  }
  const congestionados = new Set(Object.keys(c.congestion));
  $("#lienzo-campus").classList.toggle("emergencia", c.bloqueados.length > 0 || congestionados.size > 0);

  dibujar($("#svg-campus"), "campus", c, {
    unidad: "",
    tipo: tipoLugar,
    icono: (v, t) => `<text class="ico">${ICONO[t] || esc(v.replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ0-9]/g, "").slice(0, 1).toUpperCase())}</text>`,
    fantasmas: c.bloqueados,
    claseArista: a => {
      const k = clave(a.origen, a.destino);
      if (aristasRuta.has(k)) return "ruta";
      if (seleccion && k === clave(seleccion[0], seleccion[1])) return "sel";
      if (aristasAntes.has(k)) return "anterior";
      if (congestionados.has(a.destino)) return "cara";
      return "";
    },
    claseNodo: v => [v === c.ubicacion ? "aqui" : "", enRuta.has(v) ? "en-ruta" : ""].join(" "),
    antesNodo: v => (v === c.ubicacion ? `<circle class="anillo" r="${R}"/>` : ""),
    extraNodo: v => (c.congestion[v]
      ? `<g class="insignia" transform="translate(${-R},${-R + 1})"><rect x="-11" y="-7" width="22" height="14" rx="7"/><text>×${fmt(c.congestion[v])}</text></g>`
      : ""),
  });

  // tarjeta de ruta
  const info = $("#ruta-info");
  if (!r) { info.innerHTML = `<p class="nota">Elige un lugar (o tócalo en el mapa) para calcular la ruta a la zona segura más cercana.</p>`; return; }
  if (r.error) { info.innerHTML = `<p class="sin-ruta">El backend falló al calcular la ruta: ${esc(r.error)}</p>`; return; }
  if (r.tiempo === null) {
    info.innerHTML = `<p class="sin-ruta">No hay ruta desde ${esc(r.origen)} a ninguna zona segura. Reabre algún paso.</p>`;
    return;
  }
  let cambio = "";
  if (rutaAnterior && rutaAnterior.origen === r.origen) {
    const antes = rutaAnterior.tiempo;
    if (antes === null) cambio = `<span class="cambio mejor">antes: sin ruta</span>`;
    else {
      const d = r.tiempo - antes;
      cambio = `<span class="cambio ${d > 0 ? "peor" : d < 0 ? "mejor" : "igual"}">recalculada: antes ${fmt(antes)} s (${d > 0 ? "+" : ""}${fmt(d)} s)</span>`;
    }
  }
  info.innerHTML = `
    <div class="ruta-tiempo"><b>${fmt(r.tiempo)} s</b><span>hasta ${esc(r.ruta[r.ruta.length - 1])}</span>${cambio}</div>
    <ol class="pasos">${r.ruta.map((n, i) => (i ? `<li class="sep" aria-hidden="true">›</li>` : "") + `<li>${esc(n)}</li>`).join("")}</ol>`;
}

function tocarLugar(v) {
  const c = E.campus;
  const esZona = c.zonasSeguras.includes(v);
  const acc = [];
  if (!esZona) acc.push({ txt: "Estoy aquí: calcular ruta", cls: "seguro", fn: () => api("/api/campus/ubicacion", { lugar: v }) });
  acc.push({ txt: `Congestión ×${factor} al entrar (aplicarAlerta)`, cls: "aviso-btn", fn: () => api("/api/campus/congestionar", { lugar: v, factor }) });
  hoja(v, esZona ? "Zona segura: la ruta de evacuación termina aquí." : tipoLugar(v) === "salida" ? "Salida del edificio." : "Lugar del campus.", acc);
}

function tocarPaso([o, d]) {
  const existe = E.campus.aristas.some(a => a.origen === o && a.destino === d);
  if (!existe) {
    hoja(`${o} → ${d}`, "Este paso está bloqueado.", [
      { txt: "Reabrir todos los pasos bloqueados", cls: "seguro", fn: () => api("/api/campus/desbloquear", {}) },
    ]);
    return;
  }
  seleccion = [o, d];
  renderCampus();
  const vuelta = E.campus.aristas.some(a => a.origen === d && a.destino === o);
  const acc = [{ txt: "Bloquear este sentido", cls: "peligro", fn: () => bloquear(o, d, false) }];
  if (vuelta) acc.unshift({ txt: "Bloquear el pasillo (ambos sentidos)", cls: "peligro", fn: () => bloquear(o, d, true) });
  hoja(`${o} → ${d}`, "Un pasillo bloqueado se quita del grafo con eliminarArista y la ruta se recalcula.", acc);
}

function bloquear(o, d, ambos) {
  seleccion = null;
  return api("/api/campus/bloquear", { origen: o, destino: d, ambos });
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
  $("#campus-ubicacion").addEventListener("change", ev => api("/api/campus/ubicacion", { lugar: ev.target.value }));
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
  interacciones($("#svg-campus"), "campus", tocarLugar, tocarPaso);

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
