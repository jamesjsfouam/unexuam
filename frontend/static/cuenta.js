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
    if (window.avisar) { window.avisar(msg, ok); return; }
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
    cap.classList.toggle("lista", ancho > 0);
    cap.hidden = indice < 0 && arrastre === undefined;
  }

  function capsulaActual() {
    const tabs = pestanas();
    moverCapsula(tabs.findIndex(a => a.getAttribute("aria-current") === "page"));
  }

  function navEventos() {
    const nav = $("#navbar");
    let arrastrando = false;
    let movio = false;
    let xIni = 0;
    const indiceEn = x => {
      const tabs = pestanas();
      const r = nav.getBoundingClientRect();
      return Math.max(0, Math.min(tabs.length - 1, Math.floor((x - r.left) / (r.width / tabs.length))));
    };
    nav.addEventListener("pointerdown", ev => {
      if (ev.pointerType === "mouse" && ev.button !== 0) return;
      arrastrando = true;
      movio = false;
      xIni = ev.clientX;
      try { nav.setPointerCapture(ev.pointerId); } catch (e) { /* sin captura */ }
      moverCapsula(0, ev.clientX - nav.getBoundingClientRect().left);
    });
    nav.addEventListener("pointermove", ev => {
      if (!arrastrando) return;
      if (Math.abs(ev.clientX - xIni) > 6) movio = true;
      moverCapsula(0, ev.clientX - nav.getBoundingClientRect().left);
    });
    nav.addEventListener("pointerup", ev => {
      if (!arrastrando) return;
      arrastrando = false;
      const tab = pestanas()[indiceEn(ev.clientX)];
      if (tab && location.hash !== tab.getAttribute("href")) location.hash = tab.getAttribute("href");
      requestAnimationFrame(capsulaActual);
    });
    nav.addEventListener("pointercancel", () => { arrastrando = false; capsulaActual(); });
    nav.addEventListener("click", ev => {
      if (movio) { ev.preventDefault(); movio = false; return; }
      const a = ev.target.closest("a");
      if (a) requestAnimationFrame(capsulaActual);
    });
    nav.addEventListener("keydown", ev => {
      const a = ev.target.closest("a");
      if (!a) return;
      const tabs = pestanas();
      const idx = tabs.indexOf(a);
      if (ev.key === "ArrowRight" || ev.key === "ArrowLeft" || ev.key === "Home" || ev.key === "End") {
        ev.preventDefault();
        let next = idx;
        if (ev.key === "ArrowRight") next = (idx + 1) % tabs.length;
        else if (ev.key === "ArrowLeft") next = (idx - 1 + tabs.length) % tabs.length;
        else if (ev.key === "Home") next = 0;
        else if (ev.key === "End") next = tabs.length - 1;
        const dest = tabs[next];
        if (dest) {
          dest.focus();
          if (location.hash !== dest.getAttribute("href")) location.hash = dest.getAttribute("href");
          requestAnimationFrame(capsulaActual);
        }
      } else if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        location.hash = a.getAttribute("href");
      }
    });
    window.addEventListener("resize", capsulaActual);
  }

  /* ------------------------------------------------------------ sesión */

  let YO = null;
  let modo = "entrar";

  function aplicarRol() {
    const admin = !!(YO && YO.admin);
    document.body.classList.toggle("es-admin", admin);
    $$(".solo-admin").forEach(e => {
      if (e.id === "btn-fin-emergencia") {
        if (!admin) e.hidden = true;
      } else {
        e.hidden = !admin;
      }
    });
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

  let regPaso = 1;
  const REG_TITULOS = { 1: "Cuenta", 2: "Seguridad", 3: "Ubicación" };

  async function actualizarWizard(enfocar = false) {
    const esReg = modo === "registro";
    const prog = $("#reg-progreso"), atras = $("#reg-atras"), btn = $("#login-btn");
    if (prog) prog.hidden = !esReg;
    if (atras) atras.hidden = !esReg || regPaso === 1;
    $$("#login-form [data-reg-step]").forEach(el => {
      const s = Number(el.dataset.regStep);
      if (!esReg) el.hidden = el.classList.contains("solo-registro");
      else el.hidden = s !== regPaso;
    });
    if (esReg) {
      const txt = $("#reg-paso-txt");
      if (txt) txt.textContent = `Paso ${regPaso} de 3 · ${REG_TITULOS[regPaso]}`;
      $$("#reg-progreso [data-wstep]").forEach(li => {
        const s = Number(li.dataset.wstep);
        li.classList.toggle("hecho", s < regPaso);
        if (s === regPaso) li.setAttribute("aria-current", "step");
        else li.removeAttribute("aria-current");
      });
      if (btn) btn.textContent = regPaso < 3 ? "Continuar" : "Crear cuenta";
      if (regPaso === 3) {
        await cargarLugares();
        const sel = $("#reg-lugar");
        if (sel && !sel.options.length) llenarLugares(sel, "Edificio E");
        const res = $("#reg-resumen");
        if (res) res.textContent = `Cuenta: ${$("#login-nombre").value.trim() || "Estudiante"} (CIF ${$("#login-cif").value.trim().toUpperCase()}).`;
      }
      if (enfocar) {
        const primero = $(`#login-form [data-reg-step="${regPaso}"] input, #login-form [data-reg-step="${regPaso}"] select`);
        if (primero) primero.focus();
      }
    } else if (btn) {
      btn.textContent = "Entrar";
    }
  }

  function cambiarModo(m) {
    modo = m;
    regPaso = 1;
    $$("[data-modo]").forEach(b => b.setAttribute("aria-selected", String(b.dataset.modo === m)));
    $("#login-clave").autocomplete = m === "registro" ? "new-password" : "current-password";
    $("#login-clave").value = "";
    $("#login-clave2").value = "";
    $("#login-error").textContent = "";
    actualizarWizard(false);
  }

  function mostrarLogin() {
    YO = null;
    pausar();
    detenerSondeoMensajes();
    detenerSeguimientoGPS();
    cerrarChat();
    if (window.__cerrarFab) window.__cerrarFab();
    document.body.classList.add("sin-sesion");
    aplicarRol();
    const v = $("#v-login");
    if (!v.hidden) return;
    v.hidden = false;
    $("#login-cif").value = leerLS("mi-cif", "");
    requestAnimationFrame(() => $("#login-cif")?.focus());
  }
  window.mostrarLogin = mostrarLogin;

  async function guardarLugarEnRed(lugar, gps = false) {
    if (!YO || !lugar) return false;
    if (window.__UNEXUAM_PREFS__?.compartirLugar === false) {
      YO = { ...YO, lugar };
      return true;
    }
    const j = await pedir("/api/yo/lugar", gps ? { lugar, gps: true } : { lugar });
    if (j.ok) {
      YO = j.usuario;
      firmaMsj = "";
      return true;
    }
    return false;
  }

  window.actualizarMiLugar = async function (lugar) {
    if (!YO || YO.lugar === lugar) return;
    await guardarLugarEnRed(lugar, false);
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

  let buscandoGps = false;
  async function aproximarEdificioPorGPS(manual = false) {
    if (buscandoGps) return null;
    buscandoGps = true;
    const btnGps = $("#btn-gps");
    if (manual && btnGps) btnGps.disabled = true;
    if (manual) avisar("Buscando tu ubicación por GPS…");
    try {
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
            if (window.seleccionarLugar) window.seleccionarLugar(r.lugar);
            if (YO && await guardarLugarEnRed(r.lugar, true)) {
              cargarMensajes().then(renderMensajes);
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
        if (window.seleccionarLugar) window.seleccionarLugar(mejor.nombre);
        if (YO && await guardarLugarEnRed(mejor.nombre, true)) {
          cargarMensajes().then(renderMensajes);
        }
        avisar(`GPS: edificio aproximado ${mejor.nombre} (~${Math.round(mejor.d)} m).`);
        return mejor.nombre;
      }
      if (manual) {
        const km = (mejor.d / 1000).toFixed(1);
        avisar(`Estás a ${km} km del campus UAM (más cercano: ${mejor.nombre}). Elige tu edificio manualmente.`, false);
      }
      return null;
    } finally {
      buscandoGps = false;
      if (btnGps) btnGps.disabled = false;
    }
  }

  let watchGpsId = null;
  let timerGpsNativo = null;
  let ultCoordsGps = null;
  let ultLugarGps = "";

  async function procesarCoordsContinuas(coords) {
    if (!coords || !Number.isFinite(coords.lat) || !Number.isFinite(coords.lon)) return;
    if (ultCoordsGps) {
      const dLat = (coords.lat - ultCoordsGps.lat) * 110574;
      const dLon = (coords.lon - ultCoordsGps.lon) * 111320 * Math.cos(coords.lat * Math.PI / 180);
      if (Math.hypot(dLat, dLon) < 8) return;
    }
    ultCoordsGps = { lat: coords.lat, lon: coords.lon };
    const U = window.UnexuamUbicacion;
    let detectado = null;
    if (U) {
      try {
        await U.cargar();
        const r = U.identificar(U.aMetros(coords.lat, coords.lon), leerLS("mi-piso", 1));
        if (r.area || r.dentroCampus) detectado = r.lugar;
      } catch (_) {}
    }
    if (!detectado && window.__PLANO_CAMPUS__ && window.__PLANO_CAMPUS__.geo && window.__PLANO_CAMPUS__.posiciones) {
      const geo = window.__PLANO_CAMPUS__.geo;
      const x = (coords.lon - geo.lon0) * geo.cosLat * 111320;
      const y = (geo.lat0 - coords.lat) * 110574;
      let mejor = null;
      for (const [nombre, xy] of Object.entries(window.__PLANO_CAMPUS__.posiciones)) {
        if (/^(Punto|Zona) Segura /i.test(nombre)) continue;
        const d = Math.hypot(x - xy[0], y - xy[1]);
        if (!mejor || d < mejor.d) mejor = { nombre, d };
      }
      if (mejor && mejor.d <= 300) detectado = mejor.nombre;
    }
    if (!detectado || detectado === ultLugarGps) return;
    ultLugarGps = detectado;
    if (window.seleccionarLugar) window.seleccionarLugar(detectado);
    if (YO && await guardarLugarEnRed(detectado, true)) {
      cargarMensajes().then(renderMensajes);
    }
  }

  function iniciarSeguimientoGPS() {
    detenerSeguimientoGPS();
    const lblGps = $("#btn-gps-txt");
    if (navigator.geolocation) {
      try {
        watchGpsId = navigator.geolocation.watchPosition(
          pos => {
            if (lblGps) lblGps.textContent = "GPS en vivo";
            if (!document.hidden) procesarCoordsContinuas({ lat: pos.coords.latitude, lon: pos.coords.longitude, acc: pos.coords.accuracy });
          },
          () => { if (lblGps) lblGps.textContent = "Usar mi GPS"; },
          { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
        );
      } catch (_) {}
    }
    if (window.UnexuamNativo && typeof window.UnexuamNativo.ubicacionNativa === "function") {
      timerGpsNativo = setInterval(() => {
        if (document.hidden) return;
        try {
          const raw = window.UnexuamNativo.ubicacionNativa();
          if (raw) {
            const p = JSON.parse(raw);
            if (Number.isFinite(p.lat) && Number.isFinite(p.lon)) {
              if (lblGps) lblGps.textContent = "GPS en vivo";
              procesarCoordsContinuas(p);
            }
          }
        } catch (_) {}
      }, 15000);
    }
  }

  function detenerSeguimientoGPS() {
    if (watchGpsId !== null && navigator.geolocation) {
      try { navigator.geolocation.clearWatch(watchGpsId); } catch (_) {}
    }
    watchGpsId = null;
    if (timerGpsNativo) clearInterval(timerGpsNativo);
    timerGpsNativo = null;
  }

  function verificarBluetoothYGPS() {
    try {
      if (window.UnexuamNativo && typeof window.UnexuamNativo.pedirPermisos === "function") {
        window.UnexuamNativo.pedirPermisos();
      }
    } catch (_) {}
    setTimeout(() => { aproximarEdificioPorGPS(false); iniciarSeguimientoGPS(); }, 900);
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
    err.textContent = "";
    if (modo === "registro") {
      if (regPaso === 1) {
        if (!cif || cif.length < 3) { err.textContent = "Escribe un CIF válido (mínimo 3 caracteres)."; $("#login-cif").focus(); return; }
        if (!$("#login-nombre").value.trim()) { err.textContent = "Escribe tu nombre."; $("#login-nombre").focus(); return; }
        regPaso = 2;
        await actualizarWizard(true);
        return;
      }
      if (regPaso === 2) {
        if (!clave || clave.length < 4) { err.textContent = "La contraseña debe tener al menos 4 caracteres."; $("#login-clave").focus(); return; }
        if (clave !== $("#login-clave2").value) { err.textContent = "Las contraseñas no coinciden."; $("#login-clave2").focus(); return; }
        regPaso = 3;
        await actualizarWizard(true);
        return;
      }
      const piso = Number($("#reg-piso")?.value || 1);
      guardarLS("mi-piso", piso);
    } else if (!cif || !clave) {
      err.textContent = "Escribe tu CIF y tu contraseña.";
      return;
    }
    const btn = $("#login-btn");
    if (btn.disabled) return;
    btn.disabled = true;
    const txtOrig = btn.textContent;
    btn.textContent = modo === "registro" ? "Creando cuenta…" : "Entrando…";
    try {
      const lugarSel = $("#reg-lugar")?.value || "Edificio E";
      const pisoSel = Number($("#reg-piso")?.value || 1);
      const j = modo === "registro"
        ? await pedir("/api/registro", { cif, nombre: $("#login-nombre").value.trim(), contrasena: clave, lugar: lugarSel, piso: pisoSel })
        : await pedir("/api/login", { cif, contrasena: clave });
      if (!j.ok) { err.textContent = j.mensaje || "No se pudo entrar."; return; }
      trasEntrar(j);
    } finally {
      btn.disabled = false;
      btn.textContent = txtOrig;
    }
  }

  async function entrarDemo() {
    const btn = $("#login-demo");
    if (btn && btn.disabled) return;
    if (btn) { btn.disabled = true; btn.textContent = "Abriendo demo…"; }
    try {
      const j = await pedir("/api/login/demo", {});
      if (!j.ok) { $("#login-error").textContent = j.mensaje || "No se pudo entrar."; return; }
      trasEntrar(j);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = "Demo rápida · Admin"; }
    }
  }

  function confirmarSalir() {
    if (window.abrirHoja) {
      window.abrirHoja("Cerrar sesión", "Tu teléfono saldrá de la red Mesh hasta que vuelvas a entrar.", [
        { txt: "Sí, cerrar sesión", cls: "peligro", fn: salir },
      ]);
    } else {
      salir();
    }
  }

  function menuCuenta() {
    if (!YO) return;
    const instalar = $("#btn-instalar");
    const acc = [];
    if (instalar && !instalar.hidden) acc.push({ txt: "Instalar la app", cls: "secundario", fn: () => instalar.click() });
    acc.push({ txt: "Cerrar sesión", cls: "peligro", fn: salir });
    if (window.abrirHoja) {
      window.abrirHoja(YO.nombre, YO.admin ? `Administrador · ${YO.telefono}` : `CIF ${YO.cif} · ${YO.telefono}`, acc);
    }
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
  let generacionSondeoMsj = 0;
  let solicitudMsj = 0;
  let firmaMsj = "";

  let leidosCache = null;
  let leidosCif = null;
  function leidos() {
    const cif = YO && YO.cif;
    if (leidosCache && leidosCif === cif) return leidosCache;
    leidosCif = cif;
    leidosCache = new Set(leerLS("leidos-" + cif, []));
    return leidosCache;
  }
  function marcarLeidos(ids) {
    if (!ids.length) return;
    const s = leidos();
    let cambio = false;
    ids.forEach(i => { if (!s.has(i)) { s.add(i); cambio = true; } });
    if (cambio) guardarLS("leidos-" + (YO && YO.cif), Array.from(s).slice(-3000));
  }

  function actualizarChipRed() {
    const chip = $("#chip-offgrid");
    const txt = $("#chip-offgrid-txt");
    if (!txt) return;
    let n = YO && Array.isArray(YO.vecinos) ? YO.vecinos.length : 0;
    try {
      if (window.UnexuamNativo && typeof window.UnexuamNativo.vecinosMeshReales === "function") {
        const arr = JSON.parse(window.UnexuamNativo.vecinosMeshReales() || "[]");
        if (Array.isArray(arr) && arr.length > n) n = arr.length;
      }
    } catch (_) {}
    txt.textContent = n > 0 ? `Mesh · ${n}` : "Off-Grid · 0";
    if (chip) {
      chip.classList.toggle("con-vecinos", n > 0);
      chip.classList.toggle("sin-vecinos", n === 0);
    }
  }

  async function cargarMensajes() {
    const solicitud = ++solicitudMsj;
    const j = await pedir("/api/mensajes");
    if (solicitud !== solicitudMsj || !j.ok) return;
    const firma = JSON.stringify(j);
    if (firma === firmaMsj) return;
    firmaMsj = firma;
    CONV = j;
    YO = j.yo;
    aplicarRol();
    actualizarChipRed();
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
    b.setAttribute("aria-label", n ? `${n} mensaje${n === 1 ? "" : "s"} sin leer` : "");
  }

  function iniciarSondeoMensajes() {
    detenerSondeoMensajes();
    const generacion = generacionSondeoMsj;
    async function sondear(inicial = false) {
      if (inicial || !document.hidden) await cargarMensajes();
      if (generacion === generacionSondeoMsj && !window.__UNEXUAM_OFFLINE__) {
        sondeoMsj = setTimeout(sondear, 2500);
      }
    }
    sondear(true);
  }

  function detenerSondeoMensajes() {
    generacionSondeoMsj++;
    solicitudMsj++;
    clearTimeout(sondeoMsj);
    sondeoMsj = null;
  }

  /* ------------------------------------------------------------ contactos por CIF */

  let buscandoCif = false;
  async function buscarCif(ev) {
    ev.preventDefault();
    if (buscandoCif) return;
    const cif = $("#buscar-contacto").value.trim();
    const caja = $("#resultado-cif");
    if (!cif) { caja.hidden = true; return; }
    const ya = CONV.contactos.find(c => c.cif.toLowerCase() === cif.toLowerCase());
    if (ya) { $("#buscar-contacto").value = ""; caja.hidden = true; abrirChat(ya.cif); return; }
    buscandoCif = true;
    const btnBuscar = $("#form-cif .buscar-ir");
    if (btnBuscar) btnBuscar.disabled = true;
    try {
      const j = await pedir("/api/contactos/buscar", { cif });
      caja.hidden = false;
      if (!j.ok) { caja.innerHTML = `<p class="nota">${esc(j.mensaje || "No hay nadie con ese CIF.")}</p>`; return; }
      const c = j.contacto;
      caja.innerHTML = `<span class="avatar-c" style="background:${colorDe(c.cif)}">${esc(iniciales(c.nombre))}${c.enLinea ? '<i class="en-linea"></i>' : ""}</span>
        <span class="c-cuerpo"><b>${esc(c.nombre)}</b><small>CIF ${esc(c.cif)} · ${c.enLinea ? "en la red" : "sin conexión"}</small></span>
        <button type="button" class="btn mini" id="agregar-cif">${j.agregado ? "Escribir" : "Agregar"}</button>`;
      const btnAg = $("#agregar-cif");
      btnAg.onclick = async () => {
        if (btnAg.disabled) return;
        btnAg.disabled = true;
        try {
          const r = await pedir("/api/contactos/agregar", { cif: c.cif });
          if (!r.ok) { avisar(r.mensaje, false); return; }
          caja.hidden = true;
          $("#buscar-contacto").value = "";
          firmaMsj = "";
          await cargarMensajes();
          abrirChat(c.cif);
        } finally {
          btnAg.disabled = false;
        }
      };
    } finally {
      buscandoCif = false;
      if (btnBuscar) btnBuscar.disabled = false;
    }
  }

  function renderMensajes() {
    if (!YO) return;
    $("#mi-tel-nombre").textContent = YO.telefono;
    $("#mi-vecinos").textContent = YO.vecinos.length
      ? `${YO.vecinos.length} teléfono${YO.vecinos.length === 1 ? "" : "s"} a tu alcance`
      : "Nadie a tu alcance: tus mensajes esperan en cola";
    $("#mi-lugar-txt").textContent = YO.lugar;
    $("#mi-red").classList.toggle("aislado", !YO.vecinos.length);
    const accLug = $("#acc-lugar-val");
    if (accLug) accLug.textContent = YO.lugar ? `${YO.lugar} · Toca para cambiar o usar GPS` : "Toca para detectar por GPS";
    const accMesh = $("#acc-mesh-val");
    if (accMesh) accMesh.textContent = YO.vecinos.length
      ? `${YO.vecinos.length} teléfono${YO.vecinos.length === 1 ? "" : "s"} cercano${YO.vecinos.length === 1 ? "" : "s"} · Abrir Canal General`
      : "Sin vecinos cercanos · Mensajes en custodia DTN";

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

  let focoPrevioChat = null;
  let abriendoChatIntencional = false;

  function abrirChat(cif) {
    focoPrevioChat = document.activeElement;
    conContacto = cif;
    if (window.__cerrarFab) window.__cerrarFab();
    $("#chat").hidden = false;
    document.body.classList.add("con-chat");
    const hdr = $("header.barra"), mainEl = $("main"), navEl = $("#navbar");
    if (hdr) hdr.inert = true;
    if (mainEl) mainEl.inert = true;
    if (navEl) navEl.inert = true;
    if (history.state?.chat) history.replaceState({ chat: cif }, "");
    else history.pushState({ chat: cif }, "");
    renderChat(true);
    requestAnimationFrame(() => $("#chat-volver")?.focus());
  }

  function cerrarChat() {
    if ($("#chat").hidden) { conContacto = null; return; }
    conContacto = null;
    $("#chat").hidden = true;
    document.body.classList.remove("con-chat");
    const hdr = $("header.barra"), mainEl = $("main"), navEl = $("#navbar");
    if (hdr) hdr.inert = false;
    if (mainEl) mainEl.inert = false;
    if (navEl) navEl.inert = false;
    if (YO && vistaActual() === "mensajes") renderMensajes();
    if (focoPrevioChat && typeof focoPrevioChat.focus === "function") focoPrevioChat.focus();
    focoPrevioChat = null;
  }

  let chatContactoRender = null;
  let firmaRapidos = "";

  function anunciarChat(txt) {
    const live = $("#chat-live");
    if (live) { live.textContent = ""; requestAnimationFrame(() => { live.textContent = txt; }); }
  }

  function actualizarActividadChat(enviando, lista) {
    const box = $("#chat-actividad");
    const txt = $("#chat-actividad-txt");
    if (!box || !txt) return;
    const enCola = (lista || []).some(m => m.de === YO?.cif && m.estado === "en cola");
    if (enviando) {
      txt.textContent = "Enviando mensaje por red Mesh…";
      box.hidden = false;
    } else if (enCola) {
      txt.textContent = "En cola hasta encontrar un teléfono cercano…";
      box.hidden = false;
    } else {
      box.hidden = true;
    }
  }

  function sugerenciasContextuales(lista) {
    const ultimo = [...(lista || [])].reverse().find(m => m.de !== YO?.cif) || (lista || [])[lista.length - 1];
    const t = String(ultimo?.texto || "").toLowerCase();
    if (/sos|ayuda|atrapad|herid|emergencia/.test(t)) {
      return [
        { lbl: "Voy en camino", txt: "Voy en camino a ayudarte, mantén la calma." },
        { lbl: "¿En qué aula?", txt: "¿En qué edificio o aula exacta estás?" },
        { lbl: "Aviso a brigada", txt: "Ya estoy avisando a la brigada de emergencia." },
      ];
    }
    if (/bloque|cerrad|escalera|derrumbe|pasillo/.test(t)) {
      return [
        { lbl: "Gracias, recalculo", txt: "Gracias por avisar, ya estoy recalculando mi ruta." },
        { lbl: "¿Qué salida sirve?", txt: "¿Qué salida alternativa está despejada?" },
        { lbl: "Voy a Plazoleta", txt: "Voy hacia el Punto Seguro Plazoleta." },
      ];
    }
    if (/d[oó]nde|ubicaci[oó]n|est[aá]s|edificio/.test(t)) {
      return [
        { lbl: `En ${YO?.lugar || "campus"}`, txt: `Estoy en ${YO?.lugar || "el campus"} ahora mismo.` },
        { lbl: "Saliendo ya", txt: "Ya voy saliendo hacia la zona segura." },
        { lbl: "Estoy en zona segura", txt: "Ya llegué a la zona segura, estoy bien." },
      ];
    }
    return [
      { lbl: "Estoy bien", txt: "Estoy bien, voy a la zona segura." },
      { lbl: "Necesito ayuda", txt: "SOS · Necesito ayuda, no puedo salir." },
      { lbl: `En ${YO?.lugar || "campus"}`, txt: `Estoy en ${YO?.lugar || "el campus"}, todo despejado.` },
    ];
  }

  function renderRapidos(lista) {
    const box = $("#chat-rapidos");
    if (!box) return;
    const sugs = sugerenciasContextuales(lista);
    const firma = sugs.map(s => s.lbl).join("|");
    if (firma === firmaRapidos) return;
    firmaRapidos = firma;
    box.innerHTML = sugs.map((s, i) => `<button type="button" data-rapido="${esc(s.txt)}" data-hotkey="${i + 1}"><kbd>${i + 1}</kbd>${esc(s.lbl)}</button>`).join("") +
      `<button type="button" data-escribir-otro="1"><kbd>${sugs.length + 1}</kbd>Escribir otro…</button>` +
      `<button type="button" id="btn-reportar-bloqueo"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7h18v6H3zm2 2v2l2-2zm5 0-2 2h3l2-2zm6 0-2 2h3l2-2zM5 13h2v6H5zm12 0h2v6h-2z"/></svg> Reportar bloqueo</button>`;
  }

  function renderItemChat(m, c) {
    const mio = m.de === YO.cif;
    const entregado = m.estado === "entregado";
    const estado = { transmitiendo: "Recepción sin confirmar", vencido: "Envío vencido", "en cola": "En cola" }[m.estado] || "Pendiente";
    const tic = entregado
      ? '<span class="tic"><svg class="ico-tic" viewBox="0 0 24 16" aria-hidden="true"><path d="M1 8.5 5 12.5 13 4.5l-1.4-1.4L5 9.7 2.4 7.1zM9.5 11.1l1.4 1.4L19.9 3.5l-1.4-1.4z"/></svg><span class="sr">Entregado</span></span>'
      : `<span class="tic espera"><svg class="ico-tic" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 2a7 7 0 1 1 0 14 7 7 0 0 1 0-14Zm-1 2v6l5 3 1-1.7-4-2.3V7z"/></svg><span class="sr">${esc(estado)}</span></span>`;
    const detalle = entregado
      ? `${Math.max(1, m.ruta.length - 1)} salto${m.ruta.length === 2 ? "" : "s"} · ${seg(m.retardo)}${m.viaCola ? " · salió de la cola" : ""}`
      : estado;
    const nombrePar = m.deNombre || c.nombre || m.de;
    const cab = mio
      ? `<div class="chat-msg-cab"><span class="chat-autor">Tú</span></div>`
      : `<div class="chat-msg-cab"><span class="chat-msg-av" style="background:${colorDe(m.de)}" aria-hidden="true">${esc(iniciales(nombrePar))}</span><span class="chat-autor">${esc(nombrePar)}</span></div>`;
    return `${cab}<p>${esc(m.texto)}</p><span class="meta"><time>${esc(m.hora.slice(0, 5))}</time>${mio ? tic : ""}</span><details><summary>${esc(detalle)}</summary>${m.ruta.length ? `<span>${m.ruta.map(esc).join(" → ")}</span>` : ""}</details>`;
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

    if (chatContactoRender !== conContacto) {
      ol.innerHTML = "";
      chatContactoRender = conContacto;
      firmaRapidos = "";
    }
    const elementos = new Map(Array.from(ol.querySelectorAll("li[data-msg-id]"), (li) => [li.dataset.msgId, li]));
    const ids = new Set(lista.map((m) => String(m.id)));
    for (const [id, li] of elementos) {
      if (!ids.has(id)) li.remove();
    }
    if (!lista.length) {
      if (!ol.querySelector(".vacio")) {
        ol.innerHTML = '<li class="vacio">Escribe el primer mensaje.</li>';
      }
    } else {
      ol.querySelector(".vacio")?.remove();
      for (const m of lista) {
        const key = String(m.id);
        const firma = `${m.estado}|${(m.ruta || []).length}|${m.retardo}|${m.viaCola ? 1 : 0}`;
        let li = elementos.get(key);
        if (!li) {
          li = document.createElement("li");
          li.className = m.de === YO.cif ? "mio" : "suyo";
          li.dataset.msgId = key;
          li.dataset.msgFirma = firma;
          li.innerHTML = renderItemChat(m, c);
          ol.appendChild(li);
        } else if (li.dataset.msgFirma !== firma) {
          li.dataset.msgFirma = firma;
          li.innerHTML = renderItemChat(m, c);
        }
      }
    }
    if (abajo) ol.scrollTop = ol.scrollHeight;
    actualizarActividadChat(false, lista);
    renderRapidos(lista);
    marcarLeidos(lista.filter(m => m.de !== YO.cif && m.estado === "entregado").map(m => m.id));
    actualizarBadge();
  }

  let enviandoMsj = false;
  let intentoMsj = null;
  async function enviar(ev) {
    ev.preventDefault();
    if (enviandoMsj) return;
    const t = $("#chat-texto");
    const texto = t.value.trim();
    if (!texto || !conContacto) return;
    enviandoMsj = true;
    const btnEnv = $(".chat-enviar");
    if (btnEnv) btnEnv.disabled = true;
    t.value = "";
    t.style.height = "";
    actualizarActividadChat(true, []);
    try {
      const para = conContacto;
      if (!intentoMsj || intentoMsj.para !== para || intentoMsj.texto !== texto) {
        const idempotencia = Array.from(crypto.getRandomValues(new Uint8Array(16)),
          (byte) => byte.toString(16).padStart(2, "0")).join("");
        intentoMsj = { para, texto, idempotencia };
      }
      const j = await pedir("/api/mensajes/enviar", intentoMsj);
      if (j.ok) intentoMsj = null;
      if (!j.ok) { actualizarActividadChat(false, []); t.value = texto; avisar(j.mensaje, false); return; }
      if (j.enviado && j.enviado.estado !== "entregado") avisar(j.mensaje, false);
      firmaMsj = "";
      await cargarMensajes();
      renderChat(true);
      anunciarChat("Mensaje enviado.");
    } finally {
      enviandoMsj = false;
      if (btnEnv) btnEnv.disabled = false;
    }
  }

  async function elegirLugar() {
    await cargarLugares();
    if (!window.abrirHoja) return;
    window.abrirHoja(
      "¿Dónde estás?",
      "Tu teléfono se enlaza con los que estén cerca.",
      [
        {
          html: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5a6.6 6.6 0 0 0-6.6 6.6c0 4.9 6.6 12.4 6.6 12.4s6.6-7.5 6.6-12.4A6.6 6.6 0 0 0 12 2.5Zm0 9.2a2.6 2.6 0 1 1 0-5.2 2.6 2.6 0 0 1 0 5.2Z"/></svg> Detectar mi edificio (GPS)',
          cls: "secundario",
          fn: () => aproximarEdificioPorGPS(true),
        },
        {
          txt: "Guardar",
          cls: "primario",
          fn: async () => {
            const lugar = $("#hoja-lugar")?.value;
            if (!lugar) return;
            if (window.seleccionarLugar) window.seleccionarLugar(lugar);
            if (window.__UNEXUAM_PREFS__?.compartirLugar === false) {
              YO = { ...YO, lugar };
              avisar(`Edificio guardado localmente: ${lugar} (sin compartir por Mesh).`);
              renderMensajes();
              return;
            }
            const j = await pedir("/api/yo/lugar", { lugar });
            avisar(j.mensaje, j.ok);
            if (j.ok) { firmaMsj = ""; await cargarMensajes(); renderMensajes(); }
          },
        },
      ],
      {
        extraHtml: '<label class="campo"><span>Lugar</span><select id="hoja-lugar"></select></label>',
        onMount: cont => llenarLugares($("#hoja-lugar", cont), YO.lugar),
      }
    );
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
    if (b) {
      b.innerHTML = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';
      b.setAttribute("aria-label", "Reproducir");
    }
  }

  function reproducir() {
    if (ALG.timer) { pausar(); return; }
    if (!ALG.datos || !ALG.datos.pasos || !ALG.datos.pasos.length) return;
    if (ALG.paso >= ALG.datos.pasos.length - 1) irPaso(0);
    const b = $("#alg-play");
    if (b) {
      b.innerHTML = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>';
      b.setAttribute("aria-label", "Pausar");
    }
    ALG.timer = setInterval(() => irPaso(ALG.paso + 1), 850);
  }

  let calculandoAlg = false;
  async function calcularAlg() {
    if (calculandoAlg) return;
    calculandoAlg = true;
    const sel = $("#alg-origen");
    if (sel) sel.disabled = true;
    try {
      const origen = sel.value || "C-101";
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
    } finally {
      calculandoAlg = false;
      if (sel) sel.disabled = false;
    }
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
    if (!g || !window.abrirHoja) return;
    window.abrirHoja(
      g.titulo,
      g.sub,
      [{ txt: g.btn.txt, cls: "primario", fn: () => { location.hash = g.btn.hash; } }],
      { extraHtml: `<ol class="guia-pasos">${g.pasos.map((p, i) => `<li><b>${i + 1}</b><span>${esc(p)}</span></li>`).join("")}</ol>` }
    );
  }

  async function pedirPermisoNotificaciones() {
    if (window.UnexuamNativo && typeof window.UnexuamNativo.pedirPermisos === "function") {
      window.UnexuamNativo.pedirPermisos();
      return "granted";
    }
    if ("Notification" in window) {
      if (Notification.permission === "default") {
        try { return await Notification.requestPermission(); } catch (_) { return "denied"; }
      }
      return Notification.permission;
    }
    return "unsupported";
  }

  async function notificarPush(titulo, cuerpo, tipo = "mensaje") {
    try {
      if (window.UnexuamNativo && typeof window.UnexuamNativo.notificar === "function") {
        window.UnexuamNativo.notificar(String(titulo || "Unexuam"), String(cuerpo || ""), String(tipo || "mensaje"));
        return true;
      }
      if (!("Notification" in window)) return false;
      const perm = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
      if (perm !== "granted") return false;
      const opts = {
        body: String(cuerpo || ""),
        icon: "/static/img/icono-192.png",
        badge: "/static/img/icono-192.png",
        tag: "unexuam-" + tipo,
        vibrate: window.__UNEXUAM_PREFS__?.vibrar !== false ? [240, 100, 240] : undefined,
      };
      if (navigator.serviceWorker && navigator.serviceWorker.ready) {
        const reg = await navigator.serviceWorker.ready;
        if (reg && typeof reg.showNotification === "function") {
          await reg.showNotification(String(titulo || "Unexuam"), opts);
          return true;
        }
      }
      new Notification(String(titulo || "Unexuam"), opts);
      return true;
    } catch (_) {
      return false;
    }
  }

  let audioCtxGlobal = null;
  function sonarAlerta(forzar = false) {
    try {
      const P = window.__UNEXUAM_PREFS__ || {};
      const vib = forzar || P.vibrar !== false;
      const ton = forzar || P.tono !== false;
      if (vib) {
        if (window.UnexuamNativo && typeof window.UnexuamNativo.vibrarAlerta === "function") {
          window.UnexuamNativo.vibrarAlerta();
        } else if (navigator.vibrate) {
          navigator.vibrate([240, 100, 240]);
        }
      }
      if (!ton) return;
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      if (!audioCtxGlobal || audioCtxGlobal.state === "closed") audioCtxGlobal = new Ctx();
      if (audioCtxGlobal.state === "suspended") audioCtxGlobal.resume().catch(() => {});
      const osc = audioCtxGlobal.createOscillator();
      const gain = audioCtxGlobal.createGain();
      osc.type = "sine";
      osc.frequency.value = 880;
      gain.gain.value = 0.08;
      osc.connect(gain);
      gain.connect(audioCtxGlobal.destination);
      osc.start();
      osc.stop(audioCtxGlobal.currentTime + 0.22);
    } catch (_) {}
  }
  window.sonarAlerta = sonarAlerta;

  let sirenaTimer = null;
  let sirenaPaso = 0;
  function iniciarAlarmaEmergencia() {
    detenerAlarmaEmergencia();
    const P = window.__UNEXUAM_PREFS__ || {};
    const vib = P.vibrar !== false;
    const ton = P.tono !== false;
    const pulsoSirena = () => {
      try {
        if (vib) {
          if (window.UnexuamNativo && typeof window.UnexuamNativo.vibrarAlerta === "function") {
            window.UnexuamNativo.vibrarAlerta();
          } else if (navigator.vibrate) {
            navigator.vibrate([380, 180, 380]);
          }
        }
        if (!ton) return;
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;
        if (!audioCtxGlobal || audioCtxGlobal.state === "closed") audioCtxGlobal = new Ctx();
        if (audioCtxGlobal.state === "suspended") audioCtxGlobal.resume().catch(() => {});
        const osc = audioCtxGlobal.createOscillator();
        const gain = audioCtxGlobal.createGain();
        osc.type = "sawtooth";
        osc.frequency.value = (sirenaPaso++ % 2 === 0) ? 920 : 680;
        gain.gain.value = 0.14;
        osc.connect(gain);
        gain.connect(audioCtxGlobal.destination);
        osc.start();
        osc.stop(audioCtxGlobal.currentTime + 0.36);
      } catch (_) {}
    };
    pulsoSirena();
    sirenaTimer = setInterval(pulsoSirena, 680);
  }
  function detenerAlarmaEmergencia() {
    if (sirenaTimer) clearInterval(sirenaTimer);
    sirenaTimer = null;
    try { if (navigator.vibrate) navigator.vibrate(0); } catch (_) {}
    try {
      if (window.UnexuamNativo && typeof window.UnexuamNativo.detenerAlarmaEmergencia === "function") {
        window.UnexuamNativo.detenerAlarmaEmergencia();
      }
    } catch (_) {}
  }
  window.iniciarAlarmaEmergencia = iniciarAlarmaEmergencia;
  window.detenerAlarmaEmergencia = detenerAlarmaEmergencia;

  let enviandoSos = false;
  async function enviarSOS() {
    if (!YO || enviandoSos) return;
    enviandoSos = true;
    try {
      sonarAlerta();
      const texto = `SOS · Necesito ayuda en ${YO.lugar || "el campus"} (${YO.nombre}).`;
      const j = await pedir("/api/mensajes/enviar", { para: "TODOS", texto });
      const enCola = j.ok && j.enviado && j.enviado.estado !== "entregado";
      avisar(!j.ok ? (j.mensaje || "No se pudo enviar el SOS.") : enCola ? (j.mensaje || "SOS guardado: saldrá al conectar un teléfono cercano.") : "SOS enviado al Canal General.", j.ok && !enCola);
      firmaMsj = "";
      await cargarMensajes();
      abriendoChatIntencional = true;
      location.hash = "#mensajes";
      abrirChat("TODOS");
      setTimeout(() => { abriendoChatIntencional = false; }, 120);
    } finally {
      setTimeout(() => { enviandoSos = false; }, 3000);
    }
  }

  function abrirReportarBloqueo() {
    if (!window.abrirHoja) return;
    const pasos = [
      { txt: "Escalera Oeste del Edificio P (piso 3 a 2)", o: "P Escalera Oeste P3", d: "P Escalera Oeste P2" },
      { txt: "Escalera central B–C (piso 3 a 2)", o: "C Escalera Central P3", d: "B Escalera Central P2" },
      { txt: "Pasarela del B hacia la Plazoleta", o: "Pasarela Edificio B", d: "Punto Seguro Plazoleta" },
      { txt: "Salida oeste del B hacia el Auditorio", o: "B Salida Oeste", d: "Auditorio Central" },
    ];
    window.abrirHoja(
      "Reportar pasillo bloqueado",
      window.UnexuamNativo
        ? "El bloqueo se guarda en este teléfono y se intenta compartir por Mesh."
        : "El administrador revisará el reporte antes de actualizar las rutas.",
      pasos.map(p => ({
        txt: p.txt,
        cls: "peligro",
        fn: async () => {
          const j = await pedir("/api/campus/bloquear", { origen: p.o, destino: p.d, ambos: true });
          if (j.ok) {
            if (!j.pendiente) sonarAlerta();
            avisar(j.pendiente ? j.mensaje : `Bloqueo registrado: ${p.txt}`);
            if (window.refrescarEstado) window.refrescarEstado();
            else if (window.iniciarUnexuam) window.iniciarUnexuam();
            firmaMsj = "";
            await cargarMensajes();
            if (!$("#chat").hidden) renderChat(true);
          } else {
            avisar(j.mensaje || "Ese paso ya estaba bloqueado.", false);
          }
        },
      }))
    );
  }

  function fabEventos() {
    const main = $("#fab-main"), menu = $("#fab-menu"), scrim = $("#fab-scrim");
    if (!main || !menu || !scrim) return;
    const items = () => $$(".fab-mini-btn", menu);
    const cerrarFab = (devolverFoco = false) => {
      if (menu.hidden) return;
      menu.hidden = true;
      scrim.hidden = true;
      main.setAttribute("aria-expanded", "false");
      main.setAttribute("aria-label", "Abrir acciones rápidas de emergencia");
      if (devolverFoco) main.focus();
    };
    const abrirFab = () => {
      if (navigator.vibrate && window.__UNEXUAM_PREFS__?.vibrar !== false) navigator.vibrate(18);
      menu.hidden = false;
      scrim.hidden = false;
      main.setAttribute("aria-expanded", "true");
      main.setAttribute("aria-label", "Cerrar acciones rápidas de emergencia");
      items()[0]?.focus();
    };
    main.addEventListener("click", () => (menu.hidden ? abrirFab() : cerrarFab(false)));
    scrim.addEventListener("click", () => cerrarFab(true));
    menu.addEventListener("click", ev => {
      const btn = ev.target.closest("[data-fab]");
      if (!btn) return;
      cerrarFab(false);
      const act = btn.dataset.fab;
      if (act === "gps") aproximarEdificioPorGPS(true);
      else if (act === "bloqueo") abrirReportarBloqueo();
      else if (act === "sos") {
        if (window.abrirHoja) {
          window.abrirHoja("Confirmar alerta SOS", "Se enviará tu edificio al Canal General sin internet.", [
            { txt: "Enviar SOS ahora", cls: "peligro", fn: enviarSOS },
          ]);
        } else {
          enviarSOS();
        }
      }
    });
    document.addEventListener("keydown", ev => {
      if (menu.hidden) return;
      if (ev.key === "Escape") { ev.preventDefault(); cerrarFab(true); return; }
      const lista = items();
      const idx = lista.indexOf(document.activeElement);
      if (ev.key === "ArrowDown") { ev.preventDefault(); lista[(idx + 1) % lista.length]?.focus(); }
      else if (ev.key === "ArrowUp") { ev.preventDefault(); lista[(idx - 1 + lista.length) % lista.length]?.focus(); }
      else if (ev.key === "Tab") {
        const todos = [...lista, main];
        const i = todos.indexOf(document.activeElement);
        ev.preventDefault();
        todos[(i + (ev.shiftKey ? -1 : 1) + todos.length) % todos.length]?.focus();
      }
    });
    window.addEventListener("hashchange", () => cerrarFab(false));
    window.__cerrarFab = () => cerrarFab(false);
  }

  function eventos() {
    navEventos();
    fabEventos();
    $("#login-form").addEventListener("submit", entrar);
    const demo = $("#login-demo");
    demo.addEventListener("click", entrarDemo);
    if (!window.__UNEXUAM_OFFLINE__) {
      pedir("/api/capacidades").then((resultado) => { demo.hidden = !resultado.demo; });
    }
    const btnInv = $("#btn-evacuar-invitado");
    if (btnInv) btnInv.addEventListener("click", async () => {
      $("#v-login").hidden = true;
      document.body.classList.remove("sin-sesion");
      document.body.classList.add("modo-invitado");
      if (!await window.entrarModoEvacuacionInvitado?.()) {
        document.body.classList.remove("modo-invitado");
        mostrarLogin();
        $('#login-error').textContent = "Conéctate para descargar el mapa del campus.";
      }
    });
    const btnAtras = $("#reg-atras");
    if (btnAtras) btnAtras.addEventListener("click", () => { if (regPaso > 1) { regPaso--; $("#login-error").textContent = ""; actualizarWizard(true); } });
    const btnRegGps = $("#reg-gps");
    if (btnRegGps) btnRegGps.addEventListener("click", async () => {
      const lugar = await aproximarEdificioPorGPS(true);
      const sel = $("#reg-lugar");
      if (lugar && sel) { sel.value = lugar; }
    });
    $$("[data-modo]").forEach(b => b.addEventListener("click", () => cambiarModo(b.dataset.modo)));
    $("#btn-cuenta").addEventListener("click", menuCuenta);
    window.__UNEXUAM_AJUSTES__ = {
      perfil: menuCuenta,
      edificio: elegirLugar,
      salir: confirmarSalir,
      probarSos: () => {
        const P = window.__UNEXUAM_PREFS__ || {};
        sonarAlerta(false);
        const est = [];
        if (P.vibrar !== false) est.push("vibración");
        if (P.tono !== false) est.push("tono");
        avisar(est.length ? `Prueba ejecutada (${est.join(" + ")}).` : "Vibración y tono están desactivados en Notificaciones.");
      },
      probarPush: async () => {
        const ok = await notificarPush(
          "Unexuam · Notificación Push activa",
          "Si Mesh sigue activo, puedes recibir alertas con la pantalla apagada.",
          "sos"
        );
        avisar(ok ? "Notificación push enviada al sistema." : "Concede permiso de notificaciones para recibir alertas push.", ok);
      },
      probarAlarma: () => {
        if (window.UnexuamNativo && typeof window.UnexuamNativo.lanzarAlarmaEmergencia === "function") {
          window.UnexuamNativo.lanzarAlarmaEmergencia("incendio", "Prueba de Alarma · Incendio", "Así sonará y saltará a pantalla completa incluso fuera de la app o con la pantalla bloqueada.");
        } else if (window.mostrarModalEmergencia) {
          window.mostrarModalEmergencia({
            forzar: true,
            tipo: "incendio",
            titulo: "Prueba de Alarma · Incendio",
            texto: "Alarma sonora continua a pantalla completa. Pulsa Silenciar alarma para detenerla.",
          });
        }
      },
      pedirNotif: pedirPermisoNotificaciones,
      avisar,
      permisos: async () => {
        verificarBluetoothYGPS();
        await pedirPermisoNotificaciones();
        avisar("Verificando permisos de Bluetooth, GPS y notificaciones.");
      },
    };
    $("#mi-red").addEventListener("click", elegirLugar);
    const btnGps = $("#btn-gps");
    if (btnGps) btnGps.addEventListener("click", () => aproximarEdificioPorGPS(true));
    // Carrusel de guías (estructura del Figma de UNEXO): flechas circulares a los lados.
    document.querySelectorAll("[data-carrusel]").forEach(b => b.addEventListener("click", () => {
      const pista = $("#carrusel-guias");
      const tarjeta = pista.querySelector(".tarjeta-figma");
      const sinAnim = document.body.classList.contains("aj-sin-anim") || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      pista.scrollBy({ left: (+b.dataset.carrusel) * ((tarjeta ? tarjeta.offsetWidth : 150) + 12), behavior: sinAnim ? "auto" : "smooth" });
    }));
    const activarDeslizable = (el, onActivar, hint, confirmarTeclado = false) => {
      if (!el) return;
      el.classList.add("fila-deslizable");
      const thumb = el.querySelector(".fila-icono");
      let sx = 0, sy = 0, dx = 0, maxDx = 0, activo = false, bloqueoHoriz = false;
      const reset = () => {
        activo = false; bloqueoHoriz = false; dx = 0;
        el.classList.remove("deslizando", "listo");
        if (thumb) thumb.style.transform = "";
      };
      el.addEventListener("pointerdown", ev => {
        if (ev.button && ev.button !== 0) return;
        if (ev.target.closest(".drag-asa")) return;
        sx = ev.clientX; sy = ev.clientY; dx = 0;
        maxDx = Math.max(80, el.clientWidth - (thumb ? thumb.offsetWidth : 100) - 6);
        activo = true; bloqueoHoriz = false;
        el.classList.add("deslizando");
        try { el.setPointerCapture(ev.pointerId); } catch (_) {}
      });
      el.addEventListener("pointermove", ev => {
        if (!activo) return;
        const mx = ev.clientX - sx, my = ev.clientY - sy;
        if (!bloqueoHoriz) {
          if (Math.abs(my) > 12 && Math.abs(my) > Math.abs(mx)) { reset(); return; }
          if (mx > 8) bloqueoHoriz = true;
        }
        if (bloqueoHoriz) {
          dx = Math.max(0, Math.min(maxDx, mx));
          if (thumb) thumb.style.transform = `translateX(${dx}px)`;
          el.classList.toggle("listo", dx >= maxDx * 0.6);
        }
      });
      const fin = () => {
        if (!activo) return;
        const disparo = bloqueoHoriz && dx >= maxDx * 0.6;
        const fueToque = !bloqueoHoriz && dx < 12;
        reset();
        if (disparo) {
          if (navigator.vibrate && window.__UNEXUAM_PREFS__?.vibrar !== false) navigator.vibrate(25);
          onActivar();
        } else if (fueToque) {
          el.classList.remove("nudge");
          void el.offsetWidth;
          el.classList.add("nudge");
          setTimeout(() => el.classList.remove("nudge"), 380);
          avisar(hint);
        }
      };
      el.addEventListener("pointerup", fin);
      el.addEventListener("pointercancel", reset);
      el.addEventListener("click", ev => {
        // Solo permitir activación por teclado (detail === 0); los toques táctiles/ratón deben deslizar
        if (ev.detail !== 0) { ev.preventDefault(); ev.stopPropagation(); return; }
        ev.preventDefault();
        if (confirmarTeclado && window.abrirHoja) {
          window.abrirHoja("Confirmar alerta SOS", "Se enviará tu edificio al Canal General sin internet.", [
            { txt: "Enviar SOS ahora", cls: "peligro", fn: onActivar },
          ]);
        } else {
          onActivar();
        }
      });
    };

    const guiasBox = $("#guias-emergencia");
    if (guiasBox) guiasBox.addEventListener("click", ev => {
      if (ev.target.closest(".fila-deslizable, .drag-asa")) return;
      const card = ev.target.closest("[data-guia]");
      if (card) abrirGuia(card.dataset.guia);
    });
    const btnAccLugar = $("#btn-acc-lugar");
    if (btnAccLugar) btnAccLugar.addEventListener("click", elegirLugar);
    const btnAccCanal = $("#btn-acc-canal");
    if (btnAccCanal) btnAccCanal.addEventListener("click", () => {
      abriendoChatIntencional = true;
      location.hash = "#mensajes";
      abrirChat("TODOS");
      setTimeout(() => { abriendoChatIntencional = false; }, 120);
    });
    const btnSos = $("#btn-sos");
    if (btnSos) activarDeslizable(btnSos, enviarSOS, "Desliza hacia la derecha para enviar SOS →", true);
    window.addEventListener("unexuam-mesh-update", async (ev) => {
      if (!YO) return;
      firmaMsj = "";
      await cargarMensajes();
      const d = ev.detail || {};
      const P = window.__UNEXUAM_PREFS__ || {};
      if (d.recalcularRuta) {
        if (window.refrescarEstado) window.refrescarEstado();
        else if (window.iniciarUnexuam) window.iniciarUnexuam();
        if (P.bloqueos !== false) {
          sonarAlerta();
          avisar("Bloqueo recibido por Mesh: tu ruta de evacuación fue recalculada.", false);
          if (!window.UnexuamNativo) notificarPush("Pasillo bloqueado en campus", "Tu ruta de evacuación fue recalculada.", "bloqueo");
        }
      } else if (d.tipo === "conectado" && d.peer) {
        if (P.vecinos !== false) avisar(`Teléfono cercano conectado: ${d.peer.nombre}`);
      } else if (d.tipo === "ack") {
        avisar("Entrega confirmada: copias intermedias eliminadas.");
      } else if (d.tipo === "paquete" && d.paquete) {
        if (/^SOS\b/.test(String(d.paquete.texto || ""))) {
          sonarAlerta();
          avisar(String(d.paquete.texto), false);
          if (window.actualizarBannerEmergencia) window.actualizarBannerEmergencia(String(d.paquete.texto));
          if (window.mostrarModalEmergencia) {
            window.mostrarModalEmergencia({
              clave: `sos:${d.paquete.id || d.paquete.hora}:${d.paquete.de}`,
              tipo: /incendio|humo|fuego/i.test(d.paquete.texto) ? "incendio" : /sismo|temblor/i.test(d.paquete.texto) ? "sismo" : /inundaci/i.test(d.paquete.texto) ? "inundacion" : "general",
              titulo: `Alerta SOS · ${d.paquete.deNombre || d.paquete.de}`,
              texto: String(d.paquete.texto),
            });
          }
          if (!window.UnexuamNativo) notificarPush(`ALERTA SOS · ${d.paquete.deNombre || d.paquete.de}`, String(d.paquete.texto), "sos");
        } else if ($("#chat").hidden) {
          avisar(`Mensaje recibido de ${d.paquete.deNombre || d.paquete.de}`);
          if (!window.UnexuamNativo) notificarPush(`Mensaje de ${d.paquete.deNombre || d.paquete.de}`, String(d.paquete.texto || ""), "mensaje");
        }
      }
    });
    let buscarDeb = 0;
    $("#buscar-contacto").addEventListener("input", () => {
      $("#resultado-cif").hidden = true;
      clearTimeout(buscarDeb);
      buscarDeb = setTimeout(renderMensajes, 150);
    });
    $("#form-cif").addEventListener("submit", buscarCif);
    $("#chat-form").addEventListener("submit", enviar);
    $("#chat-volver").addEventListener("click", () => {
      if (history.state?.chat === conContacto) history.back();
      else cerrarChat();
    });
    const ta = $("#chat-texto");
    ta.addEventListener("keydown", ev => { if (ev.key === "Enter" && !ev.shiftKey) { ev.preventDefault(); enviar(ev); } });
    ta.addEventListener("input", () => { ta.style.height = ""; ta.style.height = Math.min(ta.scrollHeight, 120) + "px"; });
    $("#contactos").addEventListener("click", ev => {
      const b = ev.target.closest("[data-contacto]");
      if (b) abrirChat(b.dataset.contacto);
    });
    const usarRapido = b => {
      b.classList.add("seleccionado");
      setTimeout(() => b.classList.remove("seleccionado"), 220);
      if (b.dataset.escribirOtro) {
        ta.focus();
        anunciarChat("Campo de mensaje listo para escribir.");
        return;
      }
      ta.value = b.dataset.rapido;
      ta.focus();
      anunciarChat(`Respuesta rápida seleccionada: ${b.dataset.rapido}`);
    };
    $("#chat-rapidos").addEventListener("click", ev => {
      if (ev.target.closest("#btn-reportar-bloqueo")) { abrirReportarBloqueo(); return; }
      const b = ev.target.closest("[data-rapido], [data-escribir-otro]");
      if (b) usarRapido(b);
    });
    document.addEventListener("keydown", ev => {
      if ($("#chat").hidden || !$("#hoja").hidden) return;
      if (ev.key === "Escape") { ev.preventDefault(); cerrarChat(); return; }
      if (ev.key === "Tab") {
        const enf = [...$$("#chat button:not(:disabled), #chat textarea:not(:disabled), #chat input:not(:disabled), #chat summary")].filter(el => el.offsetParent !== null);
        if (enf.length) {
          const pri = enf[0], ult = enf[enf.length - 1];
          if (!enf.includes(document.activeElement)) { ev.preventDefault(); pri.focus(); return; }
          if (ev.shiftKey && document.activeElement === pri) { ev.preventDefault(); ult.focus(); return; }
          if (!ev.shiftKey && document.activeElement === ult) { ev.preventDefault(); pri.focus(); return; }
        }
      }
      if (document.activeElement && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) return;
      if (/^[1-4]$/.test(ev.key) && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
        const b = $(`#chat-rapidos [data-hotkey="${ev.key}"]`) || (ev.key === "4" ? $("#chat-rapidos [data-escribir-otro]") : null);
        if (b) { ev.preventDefault(); usarRapido(b); }
      }
    });
    window.addEventListener("hashchange", () => {
      pausar();
      if (!abriendoChatIntencional && !$("#chat").hidden) cerrarChat();
    });
    window.addEventListener("popstate", () => {
      if (!$("#modal-ubicacion")?.hidden && window.cerrarSelectorUbicacion) { window.cerrarSelectorUbicacion(); return; }
      if (!$("#modal-emergencia")?.hidden && window.cerrarModalEmergencia) { window.cerrarModalEmergencia(); return; }
      if (!$("#hoja").hidden && window.cerrarHoja) { window.cerrarHoja(); return; }
      if (!$("#fab-menu")?.hidden && window.__cerrarFab) { window.__cerrarFab(); return; }
      if (!$("#chat").hidden) { cerrarChat(); return; }
      if (window.__UNEXUAM_AJUSTES_VOLVER__ && window.__UNEXUAM_AJUSTES_VOLVER__()) return;
    });
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
      iniciarSeguimientoGPS();
    } else {
      mostrarLogin();
    }
  }

  arrancar();
})();
