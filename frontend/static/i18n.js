/* Unexuam · Sistema de idiomas offline (Español, English, Mískitu). */
(() => {
  const KEY_LANG = "unexuam-idioma";
  const KEY_PREFS = "unexuam-ajustes-v1";
  const VALIDOS = ["es", "en", "miq"];

  const DIC = {
    // Splash y Login
    "Evacuación": { en: "Evacuation", miq: "Swi takaia" },
    "Mensajes": { en: "Messages", miq: "Sturi nani" },
    "Sin internet": { en: "Offline", miq: "Internet apu" },
    "Campus UAM · Juntos podemos superar las adversidades": { en: "UAM Campus · Together we overcome adversity", miq: "Campus UAM · Asla baiki trabil nani winbia" },
    "Emergencias y red mesh del campus": { en: "Campus emergencies & mesh network", miq: "Campus trabil taim bara mesh bila" },
    "Entrar": { en: "Sign in", miq: "Dimia" },
    "Crear cuenta": { en: "Create account", miq: "Akaunt paskaia" },
    "Paso 1 de 3 · Cuenta": { en: "Step 1 of 3 · Account", miq: "1 ba 3 wina · Akaunt" },
    "Paso 2 de 3 · Seguridad": { en: "Step 2 of 3 · Security", miq: "2 ba 3 wina · Main kaikaia" },
    "Paso 3 de 3 · Ubicación": { en: "Step 3 of 3 · Location", miq: "3 ba 3 wina · Pliska" },
    "Cuenta": { en: "Account", miq: "Akaunt" },
    "Seguridad": { en: "Security", miq: "Main kaikaia" },
    "Ubicación": { en: "Location", miq: "Pliska" },
    "Nombre": { en: "Name", miq: "Nina" },
    "Contraseña": { en: "Password", miq: "Bila kiski" },
    "Repite la contraseña": { en: "Repeat password", miq: "Bila kiski kli ulbaia" },
    "Tu edificio habitual en el campus": { en: "Your usual campus building", miq: "Campus ra man utlam" },
    "Detectar con GPS": { en: "Detect with GPS", miq: "GPS wal sakaia" },
    "Elegir piso (opcional)": { en: "Choose floor (optional)", miq: "Piso plikaia (sip sa)" },
    "Piso habitual": { en: "Usual floor", miq: "Man pisam" },
    "Siguiente": { en: "Next", miq: "Kli" },
    "Atrás": { en: "Back", miq: "Ninkara" },
    "Evacuar sin iniciar sesión": { en: "Evacuate without signing in", miq: "Dimras baiki swi takaia" },
    "Acceso demo · Administrador": { en: "Demo access · Admin", miq: "Demo · Wihta" },
    "Tu CIF": { en: "Your CIF", miq: "Man CIF" },
    "Cómo te verán los demás": { en: "How others will see you", miq: "Upla wala nani man kaikaia" },

    // Navegación y encabezado
    "Inicio": { en: "Home", miq: "Taibi" },
    "Evacuar": { en: "Evacuate", miq: "Swi takaia" },
    "Ajustes": { en: "Settings", miq: "Laka" },
    "Admin": { en: "Admin", miq: "Wihta" },
    "Tu cuenta": { en: "Your account", miq: "Man akaunt" },
    "Emergencia activa en el campus": { en: "Active emergency on campus", miq: "Campus ra trabil sa" },
    "Ver mi ruta →": { en: "View my route →", miq: "Ai yabal kaikaia →" },

    // Inicio
    "Tu ruta": { en: "Your safe", miq: "Man yabal" },
    "segura": { en: "route", miq: "yamni" },
    "Evacuación y mensajes sin internet ni señal": { en: "Evacuation & messages without internet or signal", miq: "Internet bara signal apu taim swi takaia bara sturi blaikaia" },
    "Todo en calma": { en: "All clear", miq: "Sut yamni sa" },
    "Sin alertas activas.": { en: "No active alerts.", miq: "Trabil apu sa." },
    "Finalizar emergencia": { en: "End emergency", miq: "Trabil taim tnata" },
    "Arrastra a la derecha": { en: "Slide to the right", miq: "Aitani ra bria" },
    "Envía tu edificio sin internet": { en: "Send your building offline", miq: "Internet apu taim man utlam bliks" },
    "Bomberos": { en: "Fire Dept.", miq: "Pauhta auya" },
    "Cruz Blanca": { en: "Red Cross", miq: "Cruz Blanca" },
    "Guías de emergencia": { en: "Emergency guides", miq: "Trabil taim laka" },
    "Inundaciones": { en: "Floods", miq: "Li alki" },
    "Incendios": { en: "Fires", miq: "Pauhta" },
    "Sismos": { en: "Earthquakes", miq: "Tasba niniwanka" },
    "Primeros auxilios": { en: "First aid", miq: "Hilp pas" },
    "Sin señal": { en: "No signal", miq: "Signal apu" },
    "Accesos rápidos del campus": { en: "Campus quick actions", miq: "Campus ra tisku takaia" },
    "Mi ubicación actual": { en: "My current location", miq: "Naha taim ai pliska" },
    "Toca para detectar por GPS o elegir edificio": { en: "Tap to detect via GPS or pick building", miq: "GPS wal sakaia bara utla plikaia" },
    "Elegir": { en: "Choose", miq: "Plikaia" },
    "Zona segura más cercana": { en: "Nearest safe zone", miq: "Yamni pliska maihka" },
    "Ver ruta paso a paso en el mapa 3D": { en: "View step-by-step route on 3D map", miq: "3D mapa ra yabal kaikaia" },
    "Canal General Mesh": { en: "General Mesh Channel", miq: "Mesh Sut Kana" },
    "Avisar a todo el campus sin internet": { en: "Alert the entire campus offline", miq: "Internet apu taim sut campus ra wiaia" },

    // Mensajes y Chat
    "Escribe un mensaje…": { en: "Write a message…", miq: "Sturi kum ulbs…" },
    "Estoy bien": { en: "I'm safe", miq: "Yang yamni sna" },
    "Necesito ayuda": { en: "I need help", miq: "Hilp wan sna" },
    "Reportar bloqueo": { en: "Report blockage", miq: "Yabal prawan wiaia" },
    "Mensaje": { en: "Message", miq: "Sturi" },
    "Enviar mensaje": { en: "Send message", miq: "Sturi blikaia" },

    // Modales y Hoja
    "Cancelar": { en: "Cancel", miq: "Swibia" },
    "Cerrar": { en: "Close", miq: "Prakaia" },
    "EMERGENCIA ACTIVA": { en: "ACTIVE EMERGENCY", miq: "TRABIL SA" },
    "Emergencia en el campus": { en: "Campus emergency", miq: "Campus ra trabil" },
    "Ver mi ruta segura →": { en: "View my safe route →", miq: "Ai yabal yamni kaikaia →" },
    "Silenciar alarma": { en: "Silence alarm", miq: "Alarma prakaia" },
    "Elige tu edificio": { en: "Choose your building", miq: "Man utlam plikaia" },
    "Toca tu edificio en el mapa del campus UAM": { en: "Tap your building on the UAM campus map", miq: "UAM campus mapa ra man utlam tikaia" },
    "Cerrar sesión": { en: "Sign out", miq: "Akaunt wina takaia" },

    // Ajustes
    "Buscar ajuste": { en: "Search setting", miq: "Laka plikaia" },
    "Ej.: texto, contraste, vibración…": { en: "e.g. text, contrast, vibration…", miq: "Wala: ulbanka, tema…" },
    "Ajustes rápidos": { en: "Quick settings", miq: "Tisku laka" },
    "Categorías": { en: "Categories", miq: "Baha nani" },
    "Notificaciones": { en: "Notifications", miq: "Wiaia nani" },
    "Privacidad": { en: "Privacy", miq: "Prawat laka" },
    "Accesibilidad": { en: "Accessibility", miq: "Sut kaikaia laka" },
    "Ayuda": { en: "Help", miq: "Hilp" },
    "Perfil CIF y teléfono": { en: "CIF profile & phone", miq: "CIF bara telifun" },
    "Mi edificio en el campus": { en: "My campus building", miq: "Campus ra ai utla" },
    "Instalar app offline": { en: "Install offline app", miq: "App offline munia" },
    "Idioma / Language / Bila": { en: "Language / Idioma / Bila", miq: "Bila / Idioma / Language" },
    "Vibración en alerta SOS": { en: "SOS alert vibration", miq: "SOS taim tataraia" },
    "Tono sonoro de emergencia": { en: "Emergency sound tone", miq: "Trabil taim bin" },
    "Avisos de vecinos Mesh": { en: "Mesh neighbor alerts", miq: "Mesh uplika nani wiaia" },
    "Alertas de pasillos bloqueados": { en: "Blocked hallway alerts", miq: "Yabal prawan wiaia" },
    "Probar notificación push": { en: "Test push notification", miq: "Notifikasion traia" },
    "Probar alarma pantalla completa": { en: "Test full-screen alarm", miq: "Alarma tara traia" },
    "Compartir mi edificio por Mesh": { en: "Share my building via Mesh", miq: "Mesh wal ai utla yabaia" },
    "Guardar mensajes en custodia DTN": { en: "Keep messages in DTN custody", miq: "DTN ra sturi main kaikaia" },
    "Permisos de Bluetooth y GPS": { en: "Bluetooth & GPS permissions", miq: "Bluetooth bara GPS laka" },
    "Sincronizar con el sistema": { en: "Sync with system", miq: "Sistim wal asla" },
    "Tema de pantalla": { en: "Screen theme", miq: "Skrin kulka" },
    "Claro": { en: "Light", miq: "Ingni" },
    "Oscuro": { en: "Dark", miq: "Tihmia" },
    "Tamaño de texto": { en: "Text size", miq: "Ulbanka tara" },
    "Nivel de contraste": { en: "Contrast level", miq: "Kulka sika" },
    "Estándar": { en: "Standard", miq: "Wala" },
    "Aumentado": { en: "Increased", miq: "Tara" },
    "Alto": { en: "High", miq: "Puru" },
    "Filtro para daltonismo": { en: "Color blindness filter", miq: "Kulka paskaia" },
    "Ninguno": { en: "None", miq: "Apu" },
    "Lectura, animaciones y enfoque": { en: "Reading, motion & focus", miq: "Aisi kaikaia, animasion" },
    "Restablecer accesibilidad": { en: "Reset accessibility", miq: "Kli paskaia" },
    "Probar vibración y tono": { en: "Test vibration & tone", miq: "Tataraia bara bin traia" },
    "Estado offline del campus": { en: "Campus offline status", miq: "Campus offline laka" },
    "Sin ajustes que coincidan.": { en: "No matching settings.", miq: "Laka apu sa." },
    "Fuente fácil de leer (dislexia)": { en: "Dyslexia-friendly font", miq: "Aisi kaikaia isi ulbanka" },
    "Interlineado": { en: "Line spacing", miq: "Laina laka" },
    "Reducir animaciones": { en: "Reduce motion", miq: "Animasion maihka" },
    "Modo enfoque (ocultar banners)": { en: "Focus mode (hide banners)", miq: "Enfoke laka" },
    "Vista previa: Evacúa hacia la Plazoleta Central sin correr.": { en: "Preview: Evacuate to Central Plaza without running.", miq: "Kaikaia: Plazoleta Central ra plapras waia." },
  };

  let idiomaActual = "es";
  try {
    const prefs = JSON.parse(localStorage.getItem(KEY_PREFS) || "{}");
    const guardado = localStorage.getItem(KEY_LANG) || prefs.idioma || "es";
    if (VALIDOS.includes(guardado)) idiomaActual = guardado;
  } catch (_) {}

  const origTexto = new WeakMap();
  const origAttrs = new WeakMap();
  let aplicando = false;
  let rafId = 0;

  function traducirTexto(txt) {
    const limpio = String(txt || "").trim();
    if (!limpio) return null;
    if (idiomaActual === "es") return null;
    const hit = DIC[limpio];
    if (!hit || !hit[idiomaActual]) return null;
    return txt.replace(limpio, hit[idiomaActual]);
  }

  function aplicarNodo(raiz = document.body) {
    if (!raiz) return;
    aplicando = true;
    try {
      const walker = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT, null);
      let n;
      while ((n = walker.nextNode())) {
        const p = n.parentElement;
        if (!p || /^(SCRIPT|STYLE|NOSCRIPT|SVG)$/i.test(p.tagName)) continue;
        if (!origTexto.has(n)) origTexto.set(n, n.nodeValue);
        const base = origTexto.get(n);
        if (idiomaActual === "es") {
          if (n.nodeValue !== base) n.nodeValue = base;
        } else {
          const tr = traducirTexto(base);
          if (tr !== null && n.nodeValue !== tr) n.nodeValue = tr;
        }
      }

      const els = raiz.querySelectorAll ? raiz.querySelectorAll("[placeholder],[aria-label],[title]") : [];
      els.forEach((el) => {
        let map = origAttrs.get(el);
        if (!map) {
          map = {};
          for (const a of ["placeholder", "aria-label", "title"]) {
            if (el.hasAttribute(a)) map[a] = el.getAttribute(a);
          }
          origAttrs.set(el, map);
        }
        for (const [a, base] of Object.entries(map)) {
          if (idiomaActual === "es") {
            if (el.getAttribute(a) !== base) el.setAttribute(a, base);
          } else {
            const tr = traducirTexto(base);
            if (tr !== null && el.getAttribute(a) !== tr) el.setAttribute(a, tr);
          }
        }
      });
    } finally {
      aplicando = false;
    }
  }

  function actualizarBotonesLogin() {
    document.querySelectorAll("[data-lang]").forEach((b) => {
      b.setAttribute("aria-pressed", String(b.dataset.lang === idiomaActual));
    });
  }

  function setIdioma(nuevo) {
    if (!VALIDOS.includes(nuevo)) return;
    idiomaActual = nuevo;
    document.documentElement.lang = nuevo;
    try {
      localStorage.setItem(KEY_LANG, nuevo);
      const prefs = JSON.parse(localStorage.getItem(KEY_PREFS) || "{}");
      if (prefs.idioma !== nuevo) {
        prefs.idioma = nuevo;
        localStorage.setItem(KEY_PREFS, JSON.stringify(prefs));
      }
    } catch (_) {}
    aplicarNodo(document.body);
    actualizarBotonesLogin();
  }

  function iniciar() {
    document.documentElement.lang = idiomaActual;
    aplicarNodo(document.body);
    actualizarBotonesLogin();

    document.addEventListener("click", (ev) => {
      const btn = ev.target.closest?.("[data-lang]");
      if (btn) setIdioma(btn.dataset.lang);
    });

    const obs = new MutationObserver(() => {
      if (aplicando || idiomaActual === "es") return;
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => aplicarNodo(document.body));
    });
    obs.observe(document.body, { childList: true, subtree: true });
  }

  window.UNEXO_I18N = {
    idioma: () => idiomaActual,
    setIdioma,
    aplicar: (raiz) => aplicarNodo(raiz || document.body),
    t: (es) => (idiomaActual !== "es" && DIC[es]?.[idiomaActual]) || es,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", iniciar, { once: true });
  } else {
    iniciar();
  }
})();
