/* Unexuam · cuenta (CIF + contraseña), barra de navegación, mensajes por la red Mesh
 * y Dijkstra paso a paso en 2D (pestaña Admin). */
(function () {
  "use strict";

  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const leerLS = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } };
  const guardarLS = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* sin almacenamiento */ } };
  const seg = x => (x === null || x === undefined ? "∞" : `${Math.round(x * 10) / 10} s`);
  const iniciales = n => String(n || "?").split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join("").toUpperCase();
  const COLORES = ["#0080ff", "#e23000", "#00a845", "#c99a00", "#0066cc", "#b02500"];
  const colorDe = t => COLORES[[...String(t)].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORES.length];

  async function pedir(ruta, cuerpo) {
    try {
      const r = await fetch(ruta, cuerpo === undefined ? {} : {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo),
      });
      if (r.status === 401) { mostrarLogin(); return { ok: false, sesion: false }; }
      return await r.json();
    } catch (e) {
      return { ok: false, mensaje: "Sin conexión con el servidor local." };
    }
  }

  function avisar(msg, ok = true) {
    const t = $("#toast");
    if (!t || !msg) return;
    t.textContent = msg;
    t.className = "toast " + (ok ? "ok" : "error");
    t.hidden = false;
    clearTimeout(avisar.t);
    avisar.t = setTimeout(() => { t.hidden = true; }, 3000);
  }

  /* ------------------------------------------------------------ lugares */

  let LUGARES = [];

  function grupoDe(nombre) {
    let m = nombre.match(/^([A-Z])-(\d)\d{2}$/);
    if (m) return `Edificio ${m[1]} · piso ${m[2]}`;
    m = nombre.match(/^([A-Z]) .* P(\d)$/);
    if (m) return `Edificio ${m[1]} · piso ${m[2]}`;
    if (/^[A-Z] Salida/.test(nombre)) return `Edificio ${nombre[0]} · salidas`;
    if (/^(Zona Segura|Punto Seguro)/.test(nombre)) return "Zonas y puntos seguros";
    return "Otros lugares";
  }

  function llenarLugares(sel, elegido) {
    const grupos = {};
    for (const l of LUGARES) (grupos[grupoDe(l)] = grupos[grupoDe(l)] || []).push(l);
    const peso = g => (g.startsWith("Edificio") ? 0 : g.startsWith("Otros") ? 1 : 2);
    const orden = Object.keys(grupos).sort((a, b) => peso(a) - peso(b) || a.localeCompare(b, "es"));
    sel.innerHTML = orden.map(g =>
      `<optgroup label="${esc(g)}">${grupos[g].slice().sort((a, b) => a.localeCompare(b, "es", { numeric: true }))
        .map(l => `<option${l === elegido ? " selected" : ""}>${esc(l)}</option>`).join("")}</optgroup>`).join("");
  }

  async function cargarLugares() {
    if (LUGARES.length) return;
    const j = await pedir("/api/lugares");
    if (j.ok) LUGARES = j.lugares;
  }

  /* ------------------------------------------------------------ barra de navegación (vidrio) */

  function pestanas() { return $$("#navbar a").filter(a => !a.hidden); }

  function moverCapsula(indice, arrastre) {
    const nav = $("#navbar"), cap = nav.querySelector(".nav-capsula");
    const tabs = pestanas();
    if (!tabs.length) return;
    const ancho = nav.clientWidth / tabs.length;
    const x = arrastre !== undefined
      ? Math.max(0, Math.min(nav.clientWidth - ancho, arrastre - ancho / 2))
      : Math.max(0, indice) * ancho;
    cap.style.width = `${ancho}px`;
    cap.style.transform = `translateX(${x}px) scale(${arrastre !== undefined ? 1.08 : 1})`;
    cap.classList.toggle("arrastrando", arrastre !== undefined);
    cap.hidden = indice < 0 && arrastre === undefined;
  }

  function capsulaActual() {
    const tabs = pestanas();
    moverCapsula(tabs.findIndex(a => a.getAttribute("aria-current") === "page"));
  }

  function navEventos() {
    const nav = $("#navbar");
    let arrastrando = false;
    const indiceEn = x => {
      const tabs = pestanas();
      const r = nav.getBoundingClientRect();
      return Math.max(0, Math.min(tabs.length - 1, Math.floor((x - r.left) / (r.width / tabs.length))));
    };
    nav.addEventListener("pointerdown", ev => {
      arrastrando = true;
      try { nav.setPointerCapture(ev.pointerId); } catch (e) { /* sin captura */ }
      moverCapsula(0, ev.clientX - nav.getBoundingClientRect().left);
    });
    nav.addEventListener("pointermove", ev => {
      if (arrastrando) moverCapsula(0, ev.clientX - nav.getBoundingClientRect().left);
    });
    nav.addEventListener("pointerup", ev => {
      if (!arrastrando) return;
      arrastrando = false;
      const tab = pestanas()[indiceEn(ev.clientX)];
      if (tab && location.hash !== tab.getAttribute("href")) location.hash = tab.getAttribute("href");
      requestAnimationFrame(capsulaActual);
    });
    nav.addEventListener("pointercancel", () => { arrastrando = false; capsulaActual(); });
    nav.addEventListener("click", ev => ev.preventDefault());
    nav.addEventListener("keydown", ev => {
      const a = ev.target.closest("a");
      if (a && (ev.key === "Enter" || ev.key === " ")) { ev.preventDefault(); location.hash = a.getAttribute("href"); }
    });
    window.addEventListener("resize", capsulaActual);
  }

  /* ------------------------------------------------------------ sesión */

  let YO = null;
  let modo = "entrar";

  function aplicarRol() {
    const admin = !!(YO && YO.admin);
    document.body.classList.toggle("es-admin", admin);
    $$(".solo-admin").forEach(e => { e.hidden = !admin; });
    const b = $("#btn-cuenta");
    b.hidden = !YO;
    if (YO) {
      b.textContent = iniciales(YO.nombre);
      b.style.background = colorDe(YO.cif);
    }
    capsulaActual();
  }

  function mostrarSesion() {
    $("#v-login").hidden = true;
    document.body.classList.remove("sin-sesion");
    aplicarRol();
  }

  function cambiarModo(m) {
    modo = m;
    $$("[data-modo]").forEach(b => b.setAttribute("aria-selected", b.dataset.modo === m));
    $$(".solo-registro").forEach(e => { e.hidden = m !== "registro"; });
    $("#login-btn").textContent = m === "registro" ? "Crear cuenta" : "Entrar";
    $("#login-clave").autocomplete = m === "registro" ? "new-password" : "current-password";
    $("#login-error").textContent = "";
  }

  function mostrarLogin() {
    YO = null;
    detenerSondeoMensajes();
    cerrarChat();
    document.body.classList.add("sin-sesion");
    aplicarRol();
    const v = $("#v-login");
    if (!v.hidden) return;
    v.hidden = false;
    $("#login-cif").value = leerLS("mi-cif", "");
  }
  window.mostrarLogin = mostrarLogin;

  window.actualizarMiLugar = async function (lugar) {
    if (!YO || YO.lugar === lugar) return;
    const j = await pedir("/api/yo/lugar", { lugar });
    if (j.ok) { YO = j.usuario; firmaMsj = ""; }
  };

  function obtenerCoordsGPS() {
    return new Promise((resolve) => {
      const leerNativa = () => {
        try {
          if (window.UnexuamNativo && typeof window.UnexuamNativo.ubicacionNativa === "function") {
            const raw = window.UnexuamNativo.ubicacionNativa();
            if (raw) {
              const p = JSON.parse(raw);
              if (Number.isFinite(p.lat) && Number.isFinite(p.lon)) return p;
            }
          }
        } catch (_) {}
        return null;
      };
      if (!navigator.geolocation) return resolve(leerNativa());
      navigator.geolocation.getCurrentPosition(
        pos => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude, acc: pos.coords.accuracy }),
        () => resolve(leerNativa()),
        { enableHighAccuracy: true, timeout: 7000, maximumAge: 30000 }
      );
    });
  }

  async function aproximarEdificioPorGPS(manual = false) {
    if (window.UnexuamNativo && manual && typeof window.UnexuamNativo.pedirPermisos === "function") {
      window.UnexuamNativo.pedirPermisos();
    }
    const coords = await obtenerCoordsGPS();
    if (!coords) {
      if (manual && !window.isSecureContext && !window.UnexuamNativo) {
        avisar(`El GPS del navegador necesita conexión segura: abre https://${location.hostname}:5443`, false);
      } else if (manual) {
        avisar("No se pudo obtener tu GPS. Activa la ubicación y concede el permiso.", false);
      }
      return null;
    }
    const U = window.UnexuamUbicacion;
    if (U) {
      try {
        await U.cargar();
        const r = U.identificar(U.aMetros(coords.lat, coords.lon), leerLS("mi-piso", 1));
        if (r.area || r.dentroCampus) {
          const sel = $("#campus-ubicacion");
          if (sel) { sel.value = r.lugar; sel.dispatchEvent(new Event("change")); }
          if (YO) {
            const j = await pedir("/api/yo/lugar", { lugar: r.lugar, gps: true });
            if (j.ok) { YO = j.usuario; firmaMsj = ""; cargarMensajes().then(renderMensajes); }
          }
          const donde = r.segura ? `estás en zona segura (${r.area})` : `estás en ${r.area || r.lugar}${r.edificio ? `, piso ${leerLS("mi-piso", 1)}` : ""}`;
          avisar(`GPS: ${donde}${coords.acc ? ` · ±${Math.round(coords.acc)} m` : ""}.`);
          return r.lugar;
        }
      } catch (_) { /* sigue con la aproximación por cercanía */ }
    }
    if (!window.__PLANO_CAMPUS__) {
      try { window.__PLANO_CAMPUS__ = await (await fetch("/static/campus-plano.json")).json(); } catch (_) { window.__PLANO_CAMPUS__ = {}; }
    }
    const plano = window.__PLANO_CAMPUS__ || {};
    const geo = plano.geo;
    const pos = plano.posiciones;
    if (!geo || !pos) return null;

    const x = (coords.lon - geo.lon0) * geo.cosLat * 111320;
    const y = (geo.lat0 - coords.lat) * 110574;
    let mejor = null;
    for (const [nombre, xy] of Object.entries(pos)) {
      if (/^(Punto|Zona) Segura /i.test(nombre)) continue;
      const d = Math.hypot(x - xy[0], y - xy[1]);
      if (!mejor || d < mejor.d) mejor = { nombre, d };
    }
    if (!mejor) return null;

    if (mejor.d <= 300) {
      const sel = $("#campus-ubicacion");
      if (sel) {
        sel.value = mejor.nombre;
        sel.dispatchEvent(new Event("change"));
      }
      if (YO) {
        const j = await pedir("/api/yo/lugar", { lugar: mejor.nombre });
        if (j.ok) {
          YO = j.usuario;
          firmaMsj = "";
          cargarMensajes().then(renderMensajes);
        }
      }
      avisar(`GPS: edificio aproximado ${mejor.nombre} (~${Math.round(mejor.d)} m).`);
      return mejor.nombre;
    }
    if (manual) {
      const km = (mejor.d / 1000).toFixed(1);
      avisar(`Estás a ${km} km del campus UAM (más cercano: ${mejor.nombre}). Elige tu edificio manualmente.`, false);
    }
    return null;
  }

  function verificarBluetoothYGPS() {
    try {
      if (window.UnexuamNativo && typeof window.UnexuamNativo.pedirPermisos === "function") {
        window.UnexuamNativo.pedirPermisos();
      }
    } catch (_) {}
    setTimeout(() => { aproximarEdificioPorGPS(false); }, 900);
  }

  function trasEntrar(j) {
    $("#login-error").textContent = "";
    $("#login-clave").value = "";
    $("#login-clave2").value = "";
    if (!j.usuario.admin) guardarLS("mi-cif", j.usuario.cif);
    YO = j.usuario;
    mostrarSesion();
    window.iniciarUnexuam();
    iniciarSondeoMensajes();
    avisar(`Hola, ${YO.nombre}.`);
    verificarBluetoothYGPS();
  }

  async function entrar(ev) {
    ev.preventDefault();
    const cif = $("#login-cif").value.trim(), clave = $("#login-clave").value;
    const err = $("#login-error");
    if (!cif || !clave) { err.textContent = "Escribe tu CIF y tu contraseña."; return; }
    if (modo === "registro" && clave !== $("#login-clave2").value) { err.textContent = "Las contraseñas no coinciden."; return; }
    const btn = $("#login-btn");
    btn.disabled = true;
    const j = modo === "registro"
      ? await pedir("/api/registro", { cif, nombre: $("#login-nombre").value, contrasena: clave })
      : await pedir("/api/login", { cif, contrasena: clave });
    btn.disabled = false;
    if (!j.ok) { err.textContent = j.mensaje || "No se pudo entrar."; return; }
    trasEntrar(j);
  }

  async function entrarDemo() {
    const j = await pedir("/api/login/demo", {});
    if (!j.ok) { $("#login-error").textContent = j.mensaje || "No se pudo entrar."; return; }
    trasEntrar(j);
  }

  function menuCuenta() {
    if (!YO) return;
    const hoja = $("#hoja");
    $("#hoja-titulo").textContent = YO.nombre;
    $("#hoja-texto").textContent = YO.admin ? `Administrador · ${YO.telefono}` : `CIF ${YO.cif} · ${YO.telefono}`;
    const acc = $("#hoja-acciones");
    acc.innerHTML = "";
    const instalar = $("#btn-instalar");
    if (instalar && !instalar.hidden) {
      const b = document.createElement("button");
      b.className = "btn ancho";
      b.textContent = "Instalar la app";
      b.onclick = () => { hoja.hidden = true; instalar.click(); };
      acc.appendChild(b);
    }
    const salirB = document.createElement("button");
    salirB.className = "btn peligro ancho";
    salirB.textContent = "Cerrar sesión";
    salirB.onclick = () => { hoja.hidden = true; salir(); };
    acc.appendChild(salirB);
    hoja.hidden = false;
  }

  async function salir() {
    await pedir("/api/logout", {});
    location.hash = "#inicio";
    mostrarLogin();
  }

  /* ------------------------------------------------------------ mensajes */

  let CONV = { yo: null, contactos: [], mensajes: [] };
  let conContacto = null;
  let sondeoMsj = null;
  let firmaMsj = "";

  function leidos() { return new Set(leerLS("leidos-" + (YO && YO.cif), [])); }
  function marcarLeidos(ids) {
    if (!ids.length) return;
    const s = leidos();
    ids.forEach(i => s.add(i));
    guardarLS("leidos-" + (YO && YO.cif), Array.from(s).slice(-3000));
  }

  async function cargarMensajes() {
    const j = await pedir("/api/mensajes");
    if (!j.ok) return;
    const firma = JSON.stringify(j);
    if (firma === firmaMsj) return;
    firmaMsj = firma;
    CONV = j;
    YO = j.yo;
    aplicarRol();
    actualizarBadge();
    if (!$("#chat").hidden) renderChat();
    else if (vistaActual() === "mensajes") renderMensajes();
  }

  function noLeidos(cif) {
    if (!YO) return 0;
    const l = leidos();
    return CONV.mensajes.filter(m => {
      if (m.estado !== "entregado" || l.has(m.id) || m.de === YO.cif) return false;
      const esMio = m.para === YO.cif || m.para === "TODOS";
      if (!esMio) return false;
      if (!cif) return true;
      return cif === "TODOS" ? m.para === "TODOS" : (m.para === YO.cif && m.de === cif);
    }).length;
  }

  function actualizarBadge() {
    const n = noLeidos();
    const b = $("#badge-mensajes");
    b.hidden = !n;
    b.textContent = n > 99 ? "99+" : n;
  }

  function iniciarSondeoMensajes() {
    detenerSondeoMensajes();
    cargarMensajes();
    sondeoMsj = setInterval(() => { if (!document.hidden) cargarMensajes(); }, 2500);
  }
  function detenerSondeoMensajes() { if (sondeoMsj) clearInterval(sondeoMsj); sondeoMsj = null; }

  /* ------------------------------------------------------------ contactos por CIF */

  async function buscarCif(ev) {
    ev.preventDefault();
    const cif = $("#buscar-contacto").value.trim();
    const caja = $("#resultado-cif");
    if (!cif) { caja.hidden = true; return; }
    const ya = CONV.contactos.find(c => c.cif.toLowerCase() === cif.toLowerCase());
    if (ya) { $("#buscar-contacto").value = ""; caja.hidden = true; abrirChat(ya.cif); return; }
    const j = await pedir("/api/contactos/buscar", { cif });
    caja.hidden = false;
    if (!j.ok) { caja.innerHTML = `<p class="nota">${esc(j.mensaje || "No hay nadie con ese CIF.")}</p>`; return; }
    const c = j.contacto;
    caja.innerHTML = `<span class="avatar-c" style="background:${colorDe(c.cif)}">${esc(iniciales(c.nombre))}${c.enLinea ? '<i class="en-linea"></i>' : ""}</span>
      <span class="c-cuerpo"><b>${esc(c.nombre)}</b><small>CIF ${esc(c.cif)} · ${c.enLinea ? "en la red" : "sin conexión"}</small></span>
      <button type="button" class="btn mini" id="agregar-cif">${j.agregado ? "Escribir" : "Agregar"}</button>`;
    $("#agregar-cif").onclick = async () => {
      const r = await pedir("/api/contactos/agregar", { cif: c.cif });
      if (!r.ok) { avisar(r.mensaje, false); return; }
      caja.hidden = true;
      $("#buscar-contacto").value = "";
      firmaMsj = "";
      await cargarMensajes();
      abrirChat(c.cif);
    };
  }

  function renderMensajes() {
    if (!YO) return;
    $("#mi-tel-nombre").textContent = YO.telefono;
    $("#mi-vecinos").textContent = YO.vecinos.length
      ? `${YO.vecinos.length} teléfono${YO.vecinos.length === 1 ? "" : "s"} a tu alcance`
      : "Nadie a tu alcance: tus mensajes esperan en cola";
    $("#mi-lugar-txt").textContent = YO.lugar;
    $("#mi-red").classList.toggle("aislado", !YO.vecinos.length);

    const filtro = ($("#buscar-contacto").value || "").trim().toLowerCase();
    const ultimo = {}, orden = {};
    CONV.mensajes.forEach((m, i) => {
      const otro = m.para === "TODOS" ? "TODOS" : (m.de === YO.cif ? m.para : m.de);
      ultimo[otro] = m;
      orden[otro] = i;
    });
    const lista = CONV.contactos
      .filter(c => !filtro || c.nombre.toLowerCase().includes(filtro) || c.cif.toLowerCase().includes(filtro))
      .sort((a, b) => {
        if (a.cif === "TODOS") return -1;
        if (b.cif === "TODOS") return 1;
        const ia = orden[a.cif], ib = orden[b.cif];
        if (ia !== undefined || ib !== undefined) return (ib ?? -1) - (ia ?? -1);
        return (b.enLinea - a.enLinea) || a.nombre.localeCompare(b.nombre, "es");
      });
    $("#contactos").innerHTML = lista.length ? lista.map(c => {
      const u = ultimo[c.cif];
      const n = noLeidos(c.cif);
      let vista = c.enLinea ? (c.lugar ? `En ${c.lugar}` : "En la red") : "Sin conexión";
      if (u) vista = (u.de === YO.cif ? (u.estado === "entregado" ? "Entregado · " : "En cola · ") : "") + u.texto;
      return `<li><button type="button" data-contacto="${esc(c.cif)}">
        <span class="avatar-c" style="background:${colorDe(c.cif)}">${esc(iniciales(c.nombre))}${c.enLinea ? '<i class="en-linea"></i>' : ""}</span>
        <span class="c-cuerpo">
          <span class="c-fila"><b>${esc(c.nombre)}</b><time class="${n ? "nuevo" : ""}">${u ? esc(u.hora.slice(0, 5)) : ""}</time></span>
          <span class="c-fila"><small>${esc(vista)}</small>${n ? `<em class="badge">${n}</em>` : ""}</span>
        </span></button></li>`;
    }).join("") : `<li class="vacio">${filtro ? "Pulsa buscar para encontrar ese CIF." : "Escribe el CIF de una persona arriba para agregarla."}</li>`;
  }

  function abrirChat(cif) {
    conContacto = cif;
    $("#chat").hidden = false;
    document.body.classList.add("con-chat");
    renderChat(true);
  }

  function cerrarChat() {
    conContacto = null;
    $("#chat").hidden = true;
    document.body.classList.remove("con-chat");
    if (YO && vistaActual() === "mensajes") renderMensajes();
  }

  function renderChat(alFinal) {
    const c = CONV.contactos.find(x => x.cif === conContacto);
    if (!c) return;
    const av = $("#chat-avatar");
    av.textContent = iniciales(c.nombre);
    av.style.background = colorDe(c.cif);
    $("#chat-titulo").textContent = c.nombre;
    $("#chat-estado").textContent = c.enLinea ? (c.lugar ? `en la red · ${c.lugar}` : "en la red") : "sin conexión";
    const esGrupo = c.cif === "TODOS";
    const lista = esGrupo
      ? CONV.mensajes.filter(m => m.para === "TODOS")
      : CONV.mensajes.filter(m => (m.de === YO.cif && m.para === c.cif) || (m.de === c.cif && m.para === YO.cif));
    const ol = $("#chat-lista");
    const abajo = alFinal || ol.scrollHeight - ol.scrollTop - ol.clientHeight < 60;
    ol.innerHTML = lista.length ? lista.map(m => {
      const mio = m.de === YO.cif;
      const tic = m.estado === "entregado" ? '<span class="tic"><svg class="ico-tic" viewBox="0 0 24 16" aria-hidden="true"><path d="M1 8.5 5 12.5 13 4.5l-1.4-1.4L5 9.7 2.4 7.1zM9.5 11.1l1.4 1.4L19.9 3.5l-1.4-1.4z"/></svg></span>' : '<span class="tic espera"><svg class="ico-tic" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 2a7 7 0 1 1 0 14 7 7 0 0 1 0-14Zm-1 2v6l5 3 1-1.7-4-2.3V7z"/></svg></span>';
      const detalle = m.estado === "entregado"
        ? `${Math.max(1, m.ruta.length - 1)} salto${m.ruta.length === 2 ? "" : "s"} · ${seg(m.retardo)}${m.viaCola ? " · salió de la cola" : ""}`
        : "En cola: sin camino en la red";
      const autor = esGrupo && !mio ? `<small style="display:block;font-weight:700;color:var(--azul);margin-bottom:2px">${esc(m.deNombre || m.de)}</small>` : "";
      return `<li class="${mio ? "mio" : "suyo"}">
        ${autor}
        <p>${esc(m.texto)}</p>
        <span class="meta"><time>${esc(m.hora.slice(0, 5))}</time>${mio ? tic : ""}</span>
        <details><summary>${esc(detalle)}</summary>${m.ruta.length ? `<span>${m.ruta.map(esc).join(" → ")}</span>` : ""}</details>
      </li>`;
    }).join("") : '<li class="vacio">Escribe el primer mensaje. Viajará de teléfono en teléfono por la red Mesh sin internet.</li>';
    if (abajo) ol.scrollTop = ol.scrollHeight;
    marcarLeidos(lista.filter(m => m.de !== YO.cif && m.estado === "entregado").map(m => m.id));
    actualizarBadge();
  }

  async function enviar(ev) {
    ev.preventDefault();
    const t = $("#chat-texto");
    const texto = t.value.trim();
    if (!texto || !conContacto) return;
    t.value = "";
    t.style.height = "";
    const j = await pedir("/api/mensajes/enviar", { para: conContacto, texto });
    if (!j.ok) { t.value = texto; avisar(j.mensaje, false); return; }
    if (j.enviado && j.enviado.estado !== "entregado") avisar(j.mensaje, false);
    firmaMsj = "";
    await cargarMensajes();
    renderChat(true);
  }

  async function elegirLugar() {
    await cargarLugares();
    const hoja = $("#hoja");
    $("#hoja-titulo").textContent = "¿Dónde estás?";
    $("#hoja-texto").textContent = "Tu teléfono se enlaza con los que estén cerca.";
    const acc = $("#hoja-acciones");
    acc.innerHTML = '<label class="campo"><span>Lugar</span><select id="hoja-lugar"></select></label>';
    llenarLugares($("#hoja-lugar"), YO.lugar);
    const bGps = document.createElement("button");
    bGps.type = "button";
    bGps.className = "btn secundario ancho";
    bGps.innerHTML = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5a6.6 6.6 0 0 0-6.6 6.6c0 4.9 6.6 12.4 6.6 12.4s6.6-7.5 6.6-12.4A6.6 6.6 0 0 0 12 2.5Zm0 9.2a2.6 2.6 0 1 1 0-5.2 2.6 2.6 0 0 1 0 5.2Z"/></svg> Detectar mi edificio (GPS)';
    bGps.onclick = async () => {
      hoja.hidden = true;
      await aproximarEdificioPorGPS(true);
    };
    acc.appendChild(bGps);
    const b = document.createElement("button");
    b.className = "btn primario ancho";
    b.textContent = "Guardar";
    b.onclick = async () => {
      const lugar = $("#hoja-lugar").value;
      hoja.hidden = true;
      const j = await pedir("/api/yo/lugar", { lugar });
      avisar(j.mensaje, j.ok);
      if (j.ok) { firmaMsj = ""; await cargarMensajes(); renderMensajes(); }
    };
    acc.appendChild(b);
    hoja.hidden = false;
  }

  /* ------------------------------------------------------------ Dijkstra 2D */

  const ALG = { datos: null, paso: 0, timer: null, pos: null, cajas: [] };
  const ANCHO = 960, ALTO = 520;

  function layout(grafo) {
    // Edificios B, C y P por dentro (por pisos) a la izquierda; el resto del campus
    // en su posición real (plano de OpenStreetMap) a la derecha.
    const pos = {}, cajas = [];
    const aulasDe = {}, vecinosDe = {};
    for (const a of grafo.aristas) (vecinosDe[a.origen] = vecinosDe[a.origen] || []).push(a.destino);
    for (const v of grafo.vertices) {
      if (/^[A-Z]-\d{3}$/.test(v)) {
        const p = (vecinosDe[v] || []).find(w => / Pabellón /.test(w));
        if (p) (aulasDe[p] = aulasDe[p] || []).push(v);
      }
    }
    const pisos = {};
    for (const v of grafo.vertices) {
      const m = v.match(/^([A-Z]) .* P(\d)$/);
      if (m) pisos[m[1]] = Math.max(pisos[m[1]] || 0, +m[2]);
    }
    const FILA = 34, CAB = 22, SEP = 14;
    let y = 16;
    for (const L of Object.keys(pisos).sort()) {
      const caja = { letra: L, x: 6, y, w: 412, h: 0 };
      y += CAB;
      for (let p = pisos[L]; p >= 1; p--) {
        const oeste = (aulasDe[`${L} Pabellón Oeste P${p}`] || []).slice().sort((a, b) => b.localeCompare(a));
        const este = (aulasDe[`${L} Pabellón Este P${p}`] || []).slice().sort((a, b) => b.localeCompare(a));
        const fila = [`${L} Escalera Oeste P${p}`, ...oeste, `${L} Pabellón Oeste P${p}`];
        if (grafo.vertices.includes(`${L} Escalera Central P${p}`)) fila.push(`${L} Escalera Central P${p}`);
        fila.push(`${L} Pabellón Este P${p}`, ...este, `${L} Escalera Este P${p}`);
        const paso = Math.min(30, 380 / (fila.length - 1));
        fila.forEach((n, i) => { pos[n] = { x: 22 + i * paso, y: y + FILA / 2 }; });
        y += FILA;
      }
      pos[`${L} Salida Oeste`] = { x: 22, y: y + 12 };
      pos[`${L} Salida Este`] = { x: pos[`${L} Escalera Este P1`] ? pos[`${L} Escalera Este P1`].x : 380, y: y + 12 };
      y += 26;
      caja.h = y - caja.y;
      cajas.push(caja);
      y += SEP;
    }
    const plano = (window.__PLANO_CAMPUS__ && window.__PLANO_CAMPUS__.posiciones) || {};
    const X0 = 440, ESC = 1.36;
    for (const v of grafo.vertices) {
      if (pos[v]) continue;
      const p = plano[v];
      if (p) pos[v] = { x: X0 + p[0] * ESC, y: 14 + p[1] * ESC * 1.08 };
    }
    let extra = 0;
    for (const v of grafo.vertices) if (!pos[v]) pos[v] = { x: X0 + 20 + (extra++ % 12) * 40, y: ALTO - 14 };
    return { pos, cajas };
  }

  function corto(n) {
    return n.replace(/^Punto Seguro /, "PS ").replace(/^Zona Segura /, "ZS ")
      .replace(/^([A-Z]) Pabellón (E|O)\w+ P\d$/, "Pab $2").replace(/^([A-Z]) Escalera (\w+) P\d$/, "Esc. $2")
      .replace(/^[A-Z]-(\d{3})$/, "$1");
  }

  function estadoEn(k) {
    const d = ALG.datos;
    const dist = { [d.origen]: 0 }, visitados = new Set();
    for (let i = 0; i <= k && i < d.pasos.length; i++) {
      const p = d.pasos[i];
      visitados.add(p.actual);
      for (const v of p.vecinos) if (v.mejora) dist[v.destino] = v.nueva;
    }
    return { dist, visitados };
  }

  function dibujarAlg() {
    const d = ALG.datos;
    if (!d) return;
    const svg = $("#svg-alg");
    const k = ALG.paso, ultimo = d.pasos.length - 1;
    const paso = d.pasos[k];
    const { dist, visitados } = estadoEn(k);
    const pos = ALG.pos;
    const zonas = new Set(d.zonasSeguras);
    const enRuta = new Set(k === ultimo ? d.ruta : []);
    const aristaRuta = new Set();
    if (k === ultimo) for (let i = 0; i + 1 < d.ruta.length; i++) aristaRuta.add(d.ruta[i] + "→" + d.ruta[i + 1]);
    const revisadas = new Map(paso ? paso.vecinos.map(v => [paso.actual + "→" + v.destino, v]) : []);

    const partes = [];
    for (const c of ALG.cajas) {
      partes.push(`<rect class="alg-caja" x="${c.x}" y="${c.y}" width="${c.w}" height="${c.h}" rx="12"/>`,
        `<text class="alg-caja-t" x="${c.x + 12}" y="${c.y + 15}">Edificio ${c.letra}</text>`);
    }
    partes.push(`<text class="alg-caja-t" x="446" y="12">Campus</text>`);
    const vistos = new Set(), lineas = [], encima = [];
    for (const a of d.grafo.aristas) {
      const A = pos[a.origen], B = pos[a.destino];
      if (!A || !B) continue;
      const clave = a.origen < a.destino ? a.origen + "|" + a.destino : a.destino + "|" + a.origen;
      const id = a.origen + "→" + a.destino;
      if (revisadas.has(id)) {
        const v = revisadas.get(id);
        const cls = v.visitado ? "revisada visitada" : v.mejora ? "revisada mejora" : "revisada igual";
        const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2;
        encima.push(`<line class="alg-arista ${cls}" x1="${A.x}" y1="${A.y}" x2="${B.x}" y2="${B.y}"/>`,
          `<g class="alg-peso"><rect x="${mx - 13}" y="${my - 8}" width="26" height="14" rx="7"/><text x="${mx}" y="${my + 3}">${Math.round(v.peso)}</text></g>`);
        continue;
      }
      if (aristaRuta.has(id)) {
        encima.push(`<line class="alg-arista en-ruta" x1="${A.x}" y1="${A.y}" x2="${B.x}" y2="${B.y}"/>`);
        continue;
      }
      if (vistos.has(clave)) continue;
      vistos.add(clave);
      lineas.push(`<line class="alg-arista" x1="${A.x}" y1="${A.y}" x2="${B.x}" y2="${B.y}"/>`);
    }
    partes.push(...lineas, ...encima);
    for (const v of d.grafo.vertices) {
      const p = pos[v];
      if (!p) continue;
      let cls = "";
      if (zonas.has(v)) cls += " zona";
      if (visitados.has(v)) cls += " visitado";
      else if (dist[v] !== undefined) cls += " frontera";
      if (paso && v === paso.actual) cls += " actual";
      if (v === d.origen) cls += " origen";
      if (enRuta.has(v)) cls += " en-ruta";
      const aula = /^[A-Z]-\d{3}$/.test(v);
      const r = aula ? 4.2 : zonas.has(v) ? 7 : 5.5;
      partes.push(`<g class="alg-v${cls}" data-v="${esc(v)}"><title>${esc(v)}${dist[v] !== undefined ? " · " + seg(dist[v]) : ""}</title><circle cx="${p.x}" cy="${p.y}" r="${r}"/>`);
      if (aula || zonas.has(v) || /Salida|Pabellón|Escalera/.test(v) || (paso && v === paso.actual) || enRuta.has(v)) {
        const pab = /Pabellón/.test(v) ? (/Oeste/.test(v) ? " izq" : " der") : "";
        const dx = pab === " izq" ? 4 : pab === " der" ? -4 : 0;
        partes.push(`<text x="${p.x + dx}" y="${p.y + (aula ? 13 : -9)}" class="${aula ? "et-aula" : "et"}${pab}">${esc(corto(v))}</text>`);
      }
      partes.push("</g>");
    }
    svg.setAttribute("viewBox", `0 0 ${ANCHO} ${ALTO}`);
    svg.innerHTML = partes.join("");
    const lienzo = $("#alg-lienzo");
    if (paso && lienzo.classList.contains("ampliado") && pos[paso.actual]) {
      const escala = svg.clientWidth / ANCHO;
      lienzo.scrollTo({ left: Math.max(0, pos[paso.actual].x * escala - lienzo.clientWidth / 2), behavior: "smooth" });
    }
  }

  function textoPaso() {
    const d = ALG.datos, k = ALG.paso;
    const p = d.pasos[k];
    const zonas = new Set(d.zonasSeguras);
    let html = `<div class="tarjeta-cab"><h3>Paso ${k + 1}/${d.pasos.length}</h3><span class="chip azul">${seg(p.distancia)}</span></div>`;
    html += k === 0
      ? `<p>Inicio en <b>${esc(p.actual)}</b> (0 s). Los demás vértices empiezan en ∞.</p>`
      : `<p>Sale <b>${esc(p.actual)}</b>: el no visitado más cercano.</p>`;
    if (zonas.has(p.actual)) {
      html += `<p class="alg-final">Zona segura más cercana: ${seg(d.tiempo)}</p>
        <p class="nota">${d.ruta.map(esc).join(" → ")}</p>`;
    } else if (p.vecinos.length) {
      html += `<ul class="alg-vecinos">` + p.vecinos.map(v => {
        if (v.visitado) return `<li class="gris">${esc(v.destino)}: ya visitado</li>`;
        const suma = `${seg(p.distancia)} + ${Math.round(v.peso * 10) / 10} = ${seg(v.nueva)}`;
        return v.mejora
          ? `<li class="mejora">${esc(v.destino)}: ${suma} → mejora</li>`
          : `<li class="igual">${esc(v.destino)}: ${suma} → no mejora (${seg(v.antes)})</li>`;
      }).join("") + "</ul>";
    }
    $("#alg-paso").innerHTML = html;
    const { dist, visitados } = estadoEn(k);
    const frontera = Object.entries(dist).filter(([v]) => !visitados.has(v)).sort((a, b) => a[1] - b[1]);
    $("#alg-frontera").innerHTML = frontera.length
      ? frontera.slice(0, 6).map(([v, x], i) => `<li class="${i === 0 ? "primero" : ""}"><span>${esc(v)}</span><b>${seg(x)}</b></li>`).join("") +
        (frontera.length > 6 ? `<li class="mas">+${frontera.length - 6}</li>` : "")
      : '<li class="mas">Vacía</li>';
  }

  function irPaso(k) {
    if (!ALG.datos) return;
    ALG.paso = Math.max(0, Math.min(ALG.datos.pasos.length - 1, k));
    $("#alg-barra").value = ALG.paso;
    dibujarAlg();
    textoPaso();
    if (ALG.paso === ALG.datos.pasos.length - 1) pausar();
  }

  function pausar() {
    clearInterval(ALG.timer);
    ALG.timer = null;
    const b = $("#alg-play");
    if (b) b.innerHTML = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';
  }

  function reproducir() {
    if (ALG.timer) { pausar(); return; }
    if (!ALG.datos || !ALG.datos.pasos || !ALG.datos.pasos.length) return;
    if (ALG.paso >= ALG.datos.pasos.length - 1) irPaso(0);
    $("#alg-play").innerHTML = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>';
    ALG.timer = setInterval(() => irPaso(ALG.paso + 1), 850);
  }

  async function calcularAlg() {
    const origen = $("#alg-origen").value || "C-101";
    pausar();
    if (!window.__PLANO_CAMPUS__) {
      try { window.__PLANO_CAMPUS__ = await (await fetch("/static/campus-plano.json")).json(); } catch (e) { window.__PLANO_CAMPUS__ = {}; }
    }
    const j = await pedir("/api/algoritmo", { origen });
    if (!j.ok) { avisar(j.mensaje, false); return; }
    ALG.datos = j;
    const l = layout(j.grafo);
    ALG.pos = l.pos;
    ALG.cajas = l.cajas;
    $("#alg-barra").max = j.pasos.length - 1;
    irPaso(0);
  }

  async function abrirDijkstra() {
    if (!abrirDijkstra.listo) {
      abrirDijkstra.listo = true;
      if (window.innerWidth < 700) $("#alg-zoom").click();
    }
    await cargarLugares();
    const sel = $("#alg-origen");
    if (!sel.options.length) llenarLugares(sel, "C-101");
    if (!ALG.datos) calcularAlg();
  }

  function pestanaAdmin(nombre) {
    $$("[data-admin]").forEach(b => b.setAttribute("aria-selected", b.dataset.admin === nombre));
    $$("[data-admin-panel]").forEach(p => { p.hidden = p.dataset.adminPanel !== nombre; });
    if (nombre === "dijkstra") abrirDijkstra(); else pausar();
  }

  /* ------------------------------------------------------------ vistas */

  function vistaActual() {
    const v = $$(".vista").find(s => !s.hidden);
    return v ? v.id.slice(2) : "";
  }

  window.alEntrarVista = function (nombre) {
    capsulaActual();
    if (nombre === "mensajes") { firmaMsj = ""; cargarMensajes().then(renderMensajes); }
    if (nombre !== "admin") pausar();
    else if (!$('[data-admin-panel="dijkstra"]').hidden) abrirDijkstra();
  };

  const GUIAS = {
    sismo: {
      titulo: "Sismo o temblor",
      sub: "Actúa en 4 pasos",
      pasos: [
        "Agáchate, cúbrete cabeza y cuello bajo un pupitre firme.",
        "Aléjate de ventanas, estantes y cables. No uses elevadores.",
        "Al terminar, sal caminando al Punto Seguro en Evacuar.",
        "Avisa tu estado o bloqueos en Mensajes → Canal General.",
      ],
      btn: { txt: "Ir a Evacuar", hash: "#campus" },
    },
    inundacion: {
      titulo: "Inundación o tormenta",
      sub: "Busca zonas altas",
      pasos: [
        "Aléjate de parqueos bajos, drenajes y corrientes de agua.",
        "No cruces agua en movimiento ni toques cables húmedos.",
        "Si el agua sube, resguárdate en piso 2 o 3 (B, C o P).",
        "Reporta personas atrapadas en Mensajes → Canal General.",
      ],
      btn: { txt: "Ver rutas seguras", hash: "#campus" },
    },
    incendio: {
      titulo: "Incendio o humo",
      sub: "Sal rápido y agachado",
      pasos: [
        "Activa la alarma y avisa en Mensajes → Canal General.",
        "Si hay humo, avanza agachado cubriendo nariz y boca.",
        "Toca las puertas antes de abrir; si quema, toma otra salida.",
        "Ve a Plazoleta o Canchas y no regreses por objetos.",
      ],
      btn: { txt: "Ir a Evacuar", hash: "#campus" },
    },
    auxilios: {
      titulo: "Primeros auxilios",
      sub: "Estabiliza y pide ayuda",
      pasos: [
        "Verifica que la zona sea segura antes de acercarte.",
        "No muevas al herido si hay golpe en cuello o cabeza.",
        "Si sangra, haz presión firme y constante con tela limpia.",
        "Envía tu edificio y aula en Mensajes → Canal General.",
      ],
      btn: { txt: "Pedir ayuda en Mensajes", hash: "#mensajes" },
    },
    mesh: {
      titulo: "Sin internet ni señal",
      sub: "Red Mesh por Bluetooth",
      pasos: [
        "Deja Bluetooth y Ubicación encendidos (aún en Modo Avión).",
        "Abre Mensajes: teléfonos cercanos aparecen automáticamente.",
        "Escribe en Canal General: salta de teléfono en teléfono.",
        "Si nadie está cerca, tu mensaje espera y sale al acercarte.",
      ],
      btn: { txt: "Abrir Mensajes", hash: "#mensajes" },
    },
  };

  function abrirGuia(clave) {
    const g = GUIAS[clave];
    if (!g) return;
    const hoja = $("#hoja");
    $("#hoja-titulo").textContent = g.titulo;
    $("#hoja-texto").textContent = g.sub;
    const acc = $("#hoja-acciones");
    acc.innerHTML = `<ol class="guia-pasos">${g.pasos.map((p, i) => `<li><b>${i + 1}</b><span>${esc(p)}</span></li>`).join("")}</ol>`;
    const b = document.createElement("button");
    b.type = "button";
    b.className = "btn primario ancho";
    b.textContent = g.btn.txt;
    b.onclick = () => { hoja.hidden = true; location.hash = g.btn.hash; };
    acc.appendChild(b);
    hoja.hidden = false;
  }

  function sonarAlerta() {
    try {
      if (window.UnexuamNativo && typeof window.UnexuamNativo.vibrarAlerta === "function") {
        window.UnexuamNativo.vibrarAlerta();
      } else if (navigator.vibrate) {
        navigator.vibrate([240, 100, 240]);
      }
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = 880;
      gain.gain.value = 0.08;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      setTimeout(() => { osc.stop(); ctx.close(); }, 220);
    } catch (_) {}
  }

  async function enviarSOS() {
    if (!YO) return;
    sonarAlerta();
    const texto = `SOS · Necesito ayuda en ${YO.lugar || "el campus"} (${YO.nombre}).`;
    const j = await pedir("/api/mensajes/enviar", { para: "TODOS", texto });
    const enCola = j.ok && j.enviado && j.enviado.estado !== "entregado";
    avisar(!j.ok ? (j.mensaje || "No se pudo enviar el SOS.") : enCola ? (j.mensaje || "SOS guardado: saldrá al conectar un teléfono cercano.") : "SOS enviado al Canal General.", j.ok && !enCola);
    firmaMsj = "";
    await cargarMensajes();
    location.hash = "#mensajes";
    abrirChat("TODOS");
  }

  function abrirReportarBloqueo() {
    const hoja = $("#hoja");
    $("#hoja-titulo").textContent = "Reportar pasillo bloqueado";
    $("#hoja-texto").textContent = "Se avisará por Mesh y todos recalcularán su ruta.";
    const acc = $("#hoja-acciones");
    acc.innerHTML = "";
    const pasos = [
      { txt: "Escalera Oeste del Edificio P (piso 3 a 2)", o: "P Escalera Oeste P3", d: "P Escalera Oeste P2" },
      { txt: "Escalera central B–C (piso 3 a 2)", o: "C Escalera Central P3", d: "B Escalera Central P2" },
      { txt: "Pasarela del B hacia la Plazoleta", o: "Pasarela Edificio B", d: "Punto Seguro Plazoleta" },
      { txt: "Salida oeste del B hacia el Auditorio", o: "B Salida Oeste", d: "Auditorio Central" },
    ];
    pasos.forEach(p => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "btn peligro ancho";
      b.textContent = p.txt;
      b.onclick = async () => {
        hoja.hidden = true;
        const j = await pedir("/api/campus/bloquear", { origen: p.o, destino: p.d, ambos: true });
        if (j.ok) {
          sonarAlerta();
          avisar(`Bloqueo difundido: ${p.txt}`);
          if (window.iniciarUnexuam) window.iniciarUnexuam();
          firmaMsj = "";
          await cargarMensajes();
          if (!$("#chat").hidden) renderChat(true);
        } else {
          avisar(j.mensaje || "Ese paso ya estaba bloqueado.", false);
        }
      };
      acc.appendChild(b);
    });
    hoja.hidden = false;
  }

  function eventos() {
    navEventos();
    $("#login-form").addEventListener("submit", entrar);
    $("#login-demo").addEventListener("click", entrarDemo);
    $$("[data-modo]").forEach(b => b.addEventListener("click", () => cambiarModo(b.dataset.modo)));
    $("#btn-cuenta").addEventListener("click", menuCuenta);
    $("#mi-red").addEventListener("click", elegirLugar);
    const btnGps = $("#btn-gps");
    if (btnGps) btnGps.addEventListener("click", () => aproximarEdificioPorGPS(true));
    // Carrusel de guías (estructura del Figma de UNEXO): flechas circulares a los lados.
    document.querySelectorAll("[data-carrusel]").forEach(b => b.addEventListener("click", () => {
      const pista = $("#carrusel-guias");
      const tarjeta = pista.querySelector(".tarjeta-figma");
      pista.scrollBy({ left: (+b.dataset.carrusel) * ((tarjeta ? tarjeta.offsetWidth : 150) + 12), behavior: "smooth" });
    }));
    const guiasBox = $("#guias-emergencia");
    if (guiasBox) guiasBox.addEventListener("click", ev => {
      const card = ev.target.closest("[data-guia]");
      if (card) abrirGuia(card.dataset.guia);
    });
    const btnSos = $("#btn-sos");
    if (btnSos) btnSos.addEventListener("click", enviarSOS);
    const btnBloq = $("#btn-reportar-bloqueo");
    if (btnBloq) btnBloq.addEventListener("click", abrirReportarBloqueo);
    window.addEventListener("unexuam-mesh-update", async (ev) => {
      if (!YO) return;
      firmaMsj = "";
      await cargarMensajes();
      if (vistaActual() === "mensajes") renderMensajes();
      if (!$("#chat").hidden) renderChat(true);
      const d = ev.detail || {};
      if (d.recalcularRuta) {
        sonarAlerta();
        if (window.iniciarUnexuam) window.iniciarUnexuam();
        avisar("Bloqueo recibido por Mesh: tu ruta de evacuación fue recalculada.", false);
      } else if (d.tipo === "conectado" && d.peer) {
        avisar(`Teléfono cercano conectado: ${d.peer.nombre}`);
      } else if (d.tipo === "ack") {
        avisar("Entrega confirmada: copias intermedias eliminadas.");
      } else if (d.tipo === "paquete" && d.paquete) {
        if (/^SOS\b/.test(String(d.paquete.texto || ""))) {
          sonarAlerta();
          avisar(String(d.paquete.texto), false);
        } else if ($("#chat").hidden) {
          avisar(`Mensaje recibido de ${d.paquete.deNombre || d.paquete.de}`);
        }
      }
    });
    $("#buscar-contacto").addEventListener("input", () => { $("#resultado-cif").hidden = true; renderMensajes(); });
    $("#form-cif").addEventListener("submit", buscarCif);
    $("#chat-form").addEventListener("submit", enviar);
    $("#chat-volver").addEventListener("click", cerrarChat);
    const ta = $("#chat-texto");
    ta.addEventListener("keydown", ev => { if (ev.key === "Enter" && !ev.shiftKey) { ev.preventDefault(); enviar(ev); } });
    ta.addEventListener("input", () => { ta.style.height = ""; ta.style.height = Math.min(ta.scrollHeight, 120) + "px"; });
    $("#contactos").addEventListener("click", ev => {
      const b = ev.target.closest("[data-contacto]");
      if (b) abrirChat(b.dataset.contacto);
    });
    $("#chat-rapidos").addEventListener("click", ev => {
      const b = ev.target.closest("[data-rapido]");
      if (b) { ta.value = b.dataset.rapido; ta.focus(); }
    });
    window.addEventListener("hashchange", () => { if (!$("#chat").hidden) cerrarChat(); });
    $$("[data-admin]").forEach(b => b.addEventListener("click", () => pestanaAdmin(b.dataset.admin)));
    $("#alg-origen").addEventListener("change", calcularAlg);
    $("#alg-barra").addEventListener("input", ev => { pausar(); irPaso(+ev.target.value); });
    $$("[data-alg]").forEach(b => b.addEventListener("click", () => {
      const a = b.dataset.alg;
      if (a === "play") return reproducir();
      pausar();
      if (a === "inicio") irPaso(0);
      if (a === "atras") irPaso(ALG.paso - 1);
      if (a === "adelante") irPaso(ALG.paso + 1);
      if (a === "fin" && ALG.datos && ALG.datos.pasos && ALG.datos.pasos.length) irPaso(ALG.datos.pasos.length - 1);
    }));
    $("#alg-zoom").addEventListener("click", ev => {
      const on = ev.currentTarget.getAttribute("aria-pressed") !== "true";
      ev.currentTarget.setAttribute("aria-pressed", on);
      ev.currentTarget.textContent = on ? "Reducir" : "Ampliar";
      $("#alg-lienzo").classList.toggle("ampliado", on);
    });
    $("#svg-alg").addEventListener("click", ev => {
      const g = ev.target.closest("[data-v]");
      if (g) avisar(g.querySelector("title").textContent);
    });
  }

  async function arrancar() {
    eventos();
    cambiarModo("entrar");
    const j = await pedir("/api/yo");
    if (j.ok && j.sesion) {
      YO = j.usuario;
      mostrarSesion();
      window.iniciarUnexuam();
      iniciarSondeoMensajes();
    } else {
      mostrarLogin();
    }
  }

  arrancar();
})();
