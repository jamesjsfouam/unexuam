/* Unexuam · Página de Ajustes (Ley de Hick: <= 7 opciones por pantalla, 5 categorías, búsqueda y accesibilidad). */
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const KEY_PREFS = "unexuam-ajustes-v1";
  const KEY_REC = "unexuam-ajustes-recientes-v1";
  const DEF = { vibrar: true, tono: true, vecinos: true, bloqueos: true, compartirLugar: true, custodiaDtn: true, textoGrande: false, sinAnim: false, contraste: false };
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const leer = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch { return d; } };
  const guardar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

  let prefs = { ...DEF, ...leer(KEY_PREFS, {}) };
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
    ]},
    { id: "privacidad", nombre: "Privacidad", ico: "M12 2.5 4 6v5.8c0 5 3.4 9.6 8 10.7 4.6-1.1 8-5.7 8-10.7V6l-8-3.5Zm0 5a2.5 2.5 0 0 1 2.5 2.5V12h1v4h-7v-4h1v-2A2.5 2.5 0 0 1 12 7.5Z", items: [
      { id: "compartirLugar", label: "Compartir mi edificio por Mesh", tipo: "switch" },
      { id: "custodiaDtn", label: "Guardar mensajes en custodia DTN", tipo: "switch" },
      { id: "permisos", label: "Permisos de Bluetooth y GPS", tipo: "nav" },
    ]},
    { id: "apariencia", nombre: "Apariencia", ico: "M12 3a9 9 0 1 0 0 18 1.5 1.5 0 0 0 1.2-2.4 1.5 1.5 0 0 1 1.2-2.4H16a5 5 0 0 0 5-5c0-4.5-4-8.2-9-8.2Z", items: [
      { id: "textoGrande", label: "Texto grande de emergencia", tipo: "switch" },
      { id: "sinAnim", label: "Reducir animaciones", tipo: "switch" },
      { id: "contraste", label: "Alto contraste", tipo: "switch" },
    ]},
    { id: "ayuda", nombre: "Ayuda", ico: "M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm1 15h-2v-2h2Zm1.9-6.2-.9.9A2.6 2.6 0 0 0 13 14h-2v-.5a3.5 3.5 0 0 1 1-2.5l1.2-1.2A1.5 1.5 0 1 0 10.5 9H8.5a3.5 3.5 0 1 1 6.4 1.8Z", items: [
      { id: "guias", label: "Guías de emergencia", tipo: "nav" },
      { id: "probarSos", label: "Probar vibración y tono", tipo: "nav" },
      { id: "estadoOffline", label: "Estado offline del campus", tipo: "nav" },
    ]},
  ];

  function aplicarPrefs() {
    document.body.classList.toggle("aj-texto-grande", !!prefs.textoGrande);
    document.body.classList.toggle("aj-sin-anim", !!prefs.sinAnim);
    document.body.classList.toggle("aj-contraste", !!prefs.contraste);
    window.__UNEXUAM_PREFS__ = { ...prefs };
  }

  function anunciar(txt) {
    const live = $("#aj-live");
    if (live) live.textContent = txt;
  }

  function filaItem(it) {
    if (it.tipo === "switch") {
      const on = !!prefs[it.id];
      return `<div class="aj-fila" role="listitem">
        <span class="aj-lbl">${esc(it.label)}</span>
        <button type="button" class="aj-switch" role="switch" aria-checked="${on}" aria-label="${esc(it.label)}" data-aj-sw="${esc(it.id)}"><i></i></button>
      </div>`;
    }
    return `<div class="aj-fila" role="listitem">
      <button type="button" class="aj-nav${it.peligro ? " peligro" : ""}" data-aj-act="${esc(it.id)}">
        <span>${esc(it.label)}</span><span class="aj-flecha" aria-hidden="true">›</span>
      </button>
    </div>`;
  }

  function render() {
    const host = $("#v-ajustes");
    if (!host) return;
    const q = filtro.trim().toLowerCase();
    let cuerpo = "";

    if (q) {
      const hits = CATS.flatMap(c => c.items.map(it => ({ ...it, cat: c.nombre })))
        .filter(it => it.label.toLowerCase().includes(q) || it.cat.toLowerCase().includes(q)).slice(0, 7);
      cuerpo = `<div class="tarjeta aj-bloque" role="list" aria-label="Resultados de búsqueda">
        ${hits.length ? hits.map(filaItem).join("") : '<p class="nota">Sin ajustes que coincidan.</p>'}
      </div>`;
    } else if (catActiva) {
      const c = CATS.find(x => x.id === catActiva);
      cuerpo = `<button type="button" class="btn secundario aj-volver" id="aj-volver">← Ajustes · ${esc(c.nombre)}</button>
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
      <div class="aj-buscar"><input id="aj-q" type="search" value="${esc(filtro)}" placeholder="Buscar ajuste…" aria-label="Buscar ajustes" autocomplete="off"></div>
      ${chips}${cuerpo}
      <p id="aj-live" class="sr" aria-live="polite"></p>`;
    const inp = $("#aj-q", host);
    if (inp && document.activeElement?.id === "aj-q") { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
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
    else if (id === "estadoOffline" && h.avisar) h.avisar("Campus UAM offline: 154 lugares y 442 pasos listos.");
  }

  function iniciar() {
    aplicarPrefs();
    const host = $("#v-ajustes");
    if (!host) return;
    host.addEventListener("input", ev => {
      if (ev.target.id === "aj-q") { filtro = ev.target.value; render(); $("#aj-q")?.focus(); }
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
      if (cat) { catActiva = cat.dataset.ajCat; render(); return; }
      if (ev.target.closest("#aj-volver")) { catActiva = null; render(); return; }
      const sw = ev.target.closest("[data-aj-sw]");
      if (sw) {
        const k = sw.dataset.ajSw;
        prefs[k] = !prefs[k];
        guardar(KEY_PREFS, prefs);
        aplicarPrefs();
        sw.setAttribute("aria-checked", String(prefs[k]));
        anunciar(`${sw.getAttribute("aria-label")}: ${prefs[k] ? "activado" : "desactivado"}`);
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
