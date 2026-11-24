/* Unexuam · Página de Ajustes y Panel de Accesibilidad (Leyes de Hick y Bienestar Inclusivo: <= 7 opciones/pantalla). */
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const KEY_PREFS = "unexuam-ajustes-v1";
  const KEY_REC = "unexuam-ajustes-recientes-v1";
  const DEF = {
    vibrar: true, tono: true, vecinos: true, bloqueos: true,
    compartirLugar: true, custodiaDtn: true,
    sincronizarSistema: false, escalaTexto: 100, contraste: "estandar", sinAnim: false,
    fuenteDislexia: false, interlineado: 1.4, modoEnfoque: false, filtroColor: "ninguno",
  };
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const leer = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch { return d; } };
  const guardar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

  // Migración suave desde v1 booleano (textoGrande / contraste boolean)
  const raw = leer(KEY_PREFS, {});
  if (raw.textoGrande === true && !raw.escalaTexto) raw.escalaTexto = 125;
  if (raw.contraste === true) raw.contraste = "alto";
  if (raw.contraste === false) raw.contraste = "estandar";

  let prefs = { ...DEF, ...raw };
  let recientes = Array.isArray(leer(KEY_REC, [])) ? leer(KEY_REC, []) : [];
  let catActiva = null;
  let filtro = "";

  const CATS = [
    { id: "cuenta", nombre: "Cuenta", ico: "M12 12a4.5 4.5 0 1 0-4.5-4.5A4.5 4.5 0 0 0 12 12Zm0 2c-4 0-7.5 2-7.5 4.5V20h15v-1.5C19.5 16 16 14 12 14Z", items: [
      { id: "perfil", label: "Perfil CIF y teléfono", tipo: "nav" },
      { id: "edificio", label: "Mi edificio en el campus", tipo: "nav" },
      { id: "instalar", label: "Instalar app offline", tipo: "nav" },
      { id: "salir", label: "Cerrar sesión", tipo: "nav", peligro: true },
    ]},
    { id: "notificaciones", nombre: "Notificaciones", ico: "M12 3a6 6 0 0 0-6 6v4l-2 2v1h16v-1l-2-2V9a6 6 0 0 0-6-6Zm0 18a2.5 2.5 0 0 0 2.4-2H9.6A2.5 2.5 0 0 0 12 21Z", items: [
      { id: "vibrar", label: "Vibración en alerta SOS", tipo: "switch", rapido: true },
      { id: "tono", label: "Tono sonoro de emergencia", tipo: "switch", rapido: true },
      { id: "vecinos", label: "Avisos de vecinos Mesh", tipo: "switch" },
      { id: "bloqueos", label: "Alertas de pasillos bloqueados", tipo: "switch" },
      { id: "probarPush", label: "Probar notificación push", tipo: "nav" },
    ]},
    { id: "privacidad", nombre: "Privacidad", ico: "M12 2.5 4 6v5.8c0 5 3.4 9.6 8 10.7 4.6-1.1 8-5.7 8-10.7V6l-8-3.5Zm0 5a2.5 2.5 0 0 1 2.5 2.5V12h1v4h-7v-4h1v-2A2.5 2.5 0 0 1 12 7.5Z", items: [
      { id: "compartirLugar", label: "Compartir mi edificio por Mesh", tipo: "switch" },
      { id: "custodiaDtn", label: "Guardar mensajes en custodia DTN", tipo: "switch" },
      { id: "permisos", label: "Permisos de Bluetooth y GPS", tipo: "nav" },
    ]},
    { id: "accesibilidad", nombre: "Accesibilidad", ico: "M12 2a2.2 2.2 0 1 1-2.2 2.2A2.2 2.2 0 0 1 12 2Zm7 6.5h-5v13h-2v-6h-2v6H8v-13H3v-2h16Z", items: [
      { id: "sincronizarSistema", label: "Sincronizar con el sistema", tipo: "switch" },
      { id: "escalaTexto", label: "Tamaño de texto", tipo: "range", min: 100, max: 200, step: 10, sufijo: "%", preview: true },
      { id: "contraste", label: "Nivel de contraste", tipo: "radio", opciones: [
        { v: "estandar", t: "Estándar" }, { v: "aumentado", t: "Aumentado" }, { v: "alto", t: "Alto" },
      ]},
      { id: "sinAnim", label: "Reducir animaciones", tipo: "switch" },
      { id: "accesibilidad-extra", label: "Lectura, enfoque y color", tipo: "subcat" },
      { id: "restablecerTodo", label: "Restablecer accesibilidad", tipo: "nav", peligro: true },
    ]},
    { id: "ayuda", nombre: "Ayuda", ico: "M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm1 15h-2v-2h2Zm1.9-6.2-.9.9A2.6 2.6 0 0 0 13 14h-2v-.5a3.5 3.5 0 0 1 1-2.5l1.2-1.2A1.5 1.5 0 1 0 10.5 9H8.5a3.5 3.5 0 1 1 6.4 1.8Z", items: [
      { id: "guias", label: "Guías de emergencia", tipo: "nav" },
      { id: "probarSos", label: "Probar vibración y tono", tipo: "nav" },
      { id: "estadoOffline", label: "Estado offline del campus", tipo: "nav" },
    ]},
  ];

  const SUBCATS = {
    "accesibilidad-extra": {
      id: "accesibilidad-extra", parent: "accesibilidad", nombre: "Lectura, enfoque y color",
      items: [
        { id: "fuenteDislexia", label: "Fuente fácil de leer (dislexia)", tipo: "switch" },
        { id: "interlineado", label: "Interlineado", tipo: "range", min: 1.4, max: 2.0, step: 0.1, sufijo: "×" },
        { id: "modoEnfoque", label: "Modo enfoque (ocultar banners)", tipo: "switch" },
        { id: "filtroColor", label: "Filtro para daltonismo", tipo: "select", opciones: [
          { v: "ninguno", t: "Ninguno" },
          { v: "protanopia", t: "Protanopía (rojo-verde)" },
          { v: "deuteranopia", t: "Deuteranopía (verde-rojo)" },
          { v: "tritanopia", t: "Tritanopía (azul-amarillo)" },
          { v: "acromatopsia", t: "Escala de grises" },
        ]},
      ],
    },
  };

  const mqMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  const mqContrast = window.matchMedia?.("(prefers-contrast: more)");

  function aplicarPrefs() {
    let sinAnim = !!prefs.sinAnim;
    let contraste = prefs.contraste || "estandar";
    if (prefs.sincronizarSistema) {
      if (mqMotion?.matches) sinAnim = true;
      if (mqContrast?.matches && contraste === "estandar") contraste = "alto";
    }
    const escala = Math.min(200, Math.max(100, Number(prefs.escalaTexto) || 100));
    const inter = Math.min(2.0, Math.max(1.4, Number(prefs.interlineado) || 1.4));
    document.documentElement.style.setProperty("--escala-texto", String(escala / 100));
    document.documentElement.style.setProperty("--interlineado", inter.toFixed(1));
    document.documentElement.dataset.contraste = contraste;
    document.documentElement.dataset.filtroColor = prefs.filtroColor || "ninguno";
    document.body.classList.toggle("aj-sin-anim", sinAnim);
    document.body.classList.toggle("aj-dislexia", !!prefs.fuenteDislexia);
    document.body.classList.toggle("aj-enfoque", !!prefs.modoEnfoque);
    window.__UNEXUAM_PREFS__ = { ...prefs, sinAnimEfectivo: sinAnim, contrasteEfectivo: contraste };
  }

  function anunciar(txt) {
    const live = $("#aj-live");
    if (live) { live.textContent = ""; requestAnimationFrame(() => { live.textContent = txt; }); }
  }

  function filaItem(it) {
    if (it.tipo === "switch") {
      const on = !!prefs[it.id];
      return `<div class="aj-fila" role="listitem">
        <span class="aj-lbl" id="lbl-${esc(it.id)}">${esc(it.label)}</span>
        <button type="button" class="aj-switch" role="switch" aria-checked="${on}" aria-labelledby="lbl-${esc(it.id)}" data-aj-sw="${esc(it.id)}"><i></i></button>
      </div>`;
    }
    if (it.tipo === "range") {
      const val = Number(prefs[it.id] ?? it.min);
      const txtVal = it.step < 1 ? `${val.toFixed(1)}${it.sufijo}` : `${val}${it.sufijo}`;
      return `<div class="aj-fila aj-col" role="listitem">
        <div class="aj-head-row">
          <label class="aj-lbl" for="aj-rng-${esc(it.id)}">${esc(it.label)}</label>
          <output class="aj-val" id="aj-out-${esc(it.id)}" for="aj-rng-${esc(it.id)}">${esc(txtVal)}</output>
        </div>
        <input type="range" id="aj-rng-${esc(it.id)}" data-aj-rng="${esc(it.id)}" min="${it.min}" max="${it.max}" step="${it.step}" value="${val}">
        ${it.preview ? `<p class="aj-preview" aria-live="off">Vista previa: Evacúa hacia la Plazoleta Central sin correr.</p>` : ""}
      </div>`;
    }
    if (it.tipo === "radio") {
      const cur = prefs[it.id] || it.opciones[0].v;
      return `<div class="aj-fila aj-col" role="listitem">
        <span class="aj-lbl" id="lbl-${esc(it.id)}">${esc(it.label)}</span>
        <div class="aj-radios" role="radiogroup" aria-labelledby="lbl-${esc(it.id)}">
          ${it.opciones.map(o => `<label class="aj-radio">
            <input type="radio" name="aj-${esc(it.id)}" value="${esc(o.v)}" data-aj-rad="${esc(it.id)}" ${cur === o.v ? "checked" : ""}>
            <span>${esc(o.t)}</span>
          </label>`).join("")}
        </div>
      </div>`;
    }
    if (it.tipo === "select") {
      const cur = prefs[it.id] || it.opciones[0].v;
      return `<div class="aj-fila aj-col" role="listitem">
        <label class="aj-lbl" for="aj-sel-${esc(it.id)}">${esc(it.label)}</label>
        <select id="aj-sel-${esc(it.id)}" data-aj-sel="${esc(it.id)}">
          ${it.opciones.map(o => `<option value="${esc(o.v)}" ${cur === o.v ? "selected" : ""}>${esc(o.t)}</option>`).join("")}
        </select>
      </div>`;
    }
    if (it.tipo === "subcat") {
      return `<div class="aj-fila" role="listitem">
        <button type="button" class="aj-nav" data-aj-cat="${esc(it.id)}">
          <span>${esc(it.label)}</span><span class="aj-flecha" aria-hidden="true">›</span>
        </button>
      </div>`;
    }
    return `<div class="aj-fila" role="listitem">
      <button type="button" class="aj-nav${it.peligro ? " peligro" : ""}" data-aj-act="${esc(it.id)}">
        <span>${esc(it.label)}</span><span class="aj-flecha" aria-hidden="true">›</span>
      </button>
    </div>`;
  }

  function allItems() {
    return [
      ...CATS.flatMap(c => c.items.filter(it => it.tipo !== "subcat").map(it => ({ ...it, cat: c.nombre }))),
      ...Object.values(SUBCATS).flatMap(s => s.items.map(it => ({ ...it, cat: s.nombre }))),
    ];
  }

  function render() {
    const host = $("#v-ajustes");
    if (!host) return;
    const prev = document.activeElement;
    const prevId = prev && host.contains(prev) ? prev.id : "";
    const prevSel = prev?.id === "aj-q" ? [prev.selectionStart, prev.selectionEnd] : null;
    const q = filtro.trim().toLowerCase();
    let cuerpo = "";

    if (q) {
      const hits = allItems().filter(it => it.label.toLowerCase().includes(q) || it.cat.toLowerCase().includes(q)).slice(0, 7);
      cuerpo = `<div class="tarjeta aj-bloque" role="list" aria-label="Resultados de búsqueda">
        ${hits.length ? hits.map(filaItem).join("") : '<p class="nota">Sin ajustes que coincidan.</p>'}
      </div>`;
    } else if (catActiva) {
      const c = CATS.find(x => x.id === catActiva) || SUBCATS[catActiva];
      const backLabel = c.parent ? `← Accesibilidad · ${c.nombre}` : `← Ajustes · ${c.nombre}`;
      cuerpo = `<button type="button" class="btn secundario aj-volver" id="aj-volver" data-back="${esc(c.parent || "")}">${esc(backLabel)}</button>
        <div class="tarjeta aj-bloque" role="list" aria-label="${esc(c.nombre)}">${c.items.map(filaItem).join("")}</div>`;
    } else {
      const rapidos = CATS.flatMap(c => c.items).filter(it => it.rapido).slice(0, 2);
      cuerpo = `<div class="aj-grid">
        <div class="tarjeta aj-bloque" role="list" aria-label="Ajustes rápidos">
          <h3 class="aj-sub">Ajustes rápidos</h3>${rapidos.map(filaItem).join("")}
        </div>
        <div class="tarjeta aj-bloque" role="list" aria-label="Categorías de ajustes">
          <h3 class="aj-sub">Categorías</h3>
          ${CATS.map(c => `<div class="aj-fila" role="listitem">
            <button type="button" class="aj-cat" data-aj-cat="${esc(c.id)}">
              <svg class="aj-ico" viewBox="0 0 24 24" role="img" aria-label="${esc(c.nombre)}"><path d="${c.ico}"/></svg>
              <span><b>${esc(c.nombre)}</b><small>${c.items.length} opciones</small></span>
              <span class="aj-flecha" aria-hidden="true">›</span>
            </button>
          </div>`).join("")}
        </div>
      </div>`;
    }

    const chips = !catActiva && !q && recientes.length
      ? `<div class="aj-recientes" aria-label="Búsquedas recientes">${recientes.map(r => `<button type="button" data-aj-rec="${esc(r)}">${esc(r)}</button>`).join("")}</div>` : "";

    host.innerHTML = `<h2 id="t-ajustes" class="franja">Ajustes</h2>
      <div class="aj-buscar">
        <label class="aj-buscar-lbl" for="aj-q">Buscar ajuste</label>
        <input id="aj-q" type="search" value="${esc(filtro)}" placeholder="Ej.: texto, contraste, vibración…" autocomplete="off">
      </div>
      ${chips}${cuerpo}
      <p id="aj-live" class="sr" aria-live="polite"></p>`;

    if (prevId) {
      const restored = $("#" + CSS.escape(prevId), host);
      if (restored) {
        restored.focus();
        if (prevSel && restored.setSelectionRange) restored.setSelectionRange(prevSel[0], prevSel[1]);
      }
    }
  }

  function ejecutar(id) {
    const h = window.__UNEXUAM_AJUSTES__ || {};
    if (id === "perfil" && h.perfil) h.perfil();
    else if (id === "edificio" && h.edificio) h.edificio();
    else if (id === "instalar" && $("#btn-instalar") && !$("#btn-instalar").hidden) $("#btn-instalar").click();
    else if (id === "instalar" && h.avisar) h.avisar("App ya instalada o en modo APK.");
    else if (id === "salir" && h.salir) h.salir();
    else if (id === "permisos" && h.permisos) h.permisos();
    else if (id === "guias") location.hash = "#inicio";
    else if (id === "probarSos" && h.probarSos) h.probarSos();
    else if (id === "probarPush" && h.probarPush) h.probarPush();
    else if (id === "estadoOffline" && h.avisar) h.avisar("Campus UAM offline: 154 lugares y 442 pasos listos.");
    else if (id === "restablecerTodo") {
      prefs = { ...prefs, sincronizarSistema: false, escalaTexto: 100, contraste: "estandar", sinAnim: false, fuenteDislexia: false, interlineado: 1.4, modoEnfoque: false, filtroColor: "ninguno" };
      guardar(KEY_PREFS, prefs);
      aplicarPrefs();
      render();
      anunciar("Preferencias de accesibilidad restablecidas a valores predeterminados.");
      if (h.avisar) h.avisar("Accesibilidad restablecida.");
    }
  }

  function iniciar() {
    aplicarPrefs();
    mqMotion?.addEventListener?.("change", aplicarPrefs);
    mqContrast?.addEventListener?.("change", aplicarPrefs);
    const host = $("#v-ajustes");
    if (!host) return;
    host.addEventListener("input", ev => {
      if (ev.target.id === "aj-q") { filtro = ev.target.value; render(); return; }
      const rng = ev.target.closest("[data-aj-rng]");
      if (rng) {
        const k = rng.dataset.ajRng;
        prefs[k] = Number(rng.value);
        guardar(KEY_PREFS, prefs);
        aplicarPrefs();
        const out = $("#aj-out-" + k, host);
        const suf = k === "escalaTexto" ? "%" : "×";
        const fmt = k === "escalaTexto" ? `${prefs[k]}${suf}` : `${prefs[k].toFixed(1)}${suf}`;
        if (out) out.textContent = fmt;
        anunciar(`${k === "escalaTexto" ? "Tamaño de texto" : "Interlineado"}: ${fmt}`);
      }
    });
    host.addEventListener("change", ev => {
      const rad = ev.target.closest("[data-aj-rad]");
      if (rad) {
        const k = rad.dataset.ajRad;
        prefs[k] = rad.value;
        guardar(KEY_PREFS, prefs);
        aplicarPrefs();
        anunciar(`Contraste cambiado a ${rad.value}`);
        return;
      }
      const sel = ev.target.closest("[data-aj-sel]");
      if (sel) {
        const k = sel.dataset.ajSel;
        prefs[k] = sel.value;
        guardar(KEY_PREFS, prefs);
        aplicarPrefs();
        anunciar(`Filtro de color: ${sel.options[sel.selectedIndex]?.text || sel.value}`);
      }
    });
    host.addEventListener("keydown", ev => {
      if (ev.target.id === "aj-q" && ev.key === "Enter" && filtro.trim()) {
        recientes = [filtro.trim(), ...recientes.filter(x => x !== filtro.trim())].slice(0, 4);
        guardar(KEY_REC, recientes);
      }
    });
    host.addEventListener("click", ev => {
      const rec = ev.target.closest("[data-aj-rec]");
      if (rec) { filtro = rec.dataset.ajRec; render(); return; }
      const cat = ev.target.closest("[data-aj-cat]");
      if (cat) { catActiva = cat.dataset.ajCat; render(); $("#aj-volver", host)?.focus(); return; }
      const vol = ev.target.closest("#aj-volver");
      if (vol) { catActiva = vol.dataset.back || null; render(); return; }
      const sw = ev.target.closest("[data-aj-sw]");
      if (sw) {
        const k = sw.dataset.ajSw;
        prefs[k] = !prefs[k];
        guardar(KEY_PREFS, prefs);
        aplicarPrefs();
        sw.setAttribute("aria-checked", String(prefs[k]));
        const lbl = $("#lbl-" + k, host)?.textContent || k;
        anunciar(`${lbl}: ${prefs[k] ? "activado" : "desactivado"}`);
        return;
      }
      const act = ev.target.closest("[data-aj-act]");
      if (act) ejecutar(act.dataset.ajAct);
    });
    window.abrirAjustes = () => { catActiva = null; filtro = ""; render(); location.hash = "#ajustes"; };
    render();
  }

  document.addEventListener("DOMContentLoaded", iniciar);
})();
