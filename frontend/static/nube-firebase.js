/* Unexuam · Cliente ligero de Cloud Firestore (REST v1) para base de datos compartida en la nube.
 * Funciona sin SDKs pesados y cae limpiamente a modo offline/Mesh si no hay internet. */
(function () {
  "use strict";

  const PROYECTO = "unexuam-campus-ni";
  const BASE = `https://firestore.googleapis.com/v1/projects/${PROYECTO}/databases/(default)/documents`;
  const STORAGE_AUTH = "unexuam_fb_auth";
  const TIMEOUT_MS = 3500;

  function leerAuth() {
    try {
      const raw = localStorage.getItem(STORAGE_AUTH);
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }

  function guardarAuth(auth) {
    try {
      if (!auth) localStorage.removeItem(STORAGE_AUTH);
      else localStorage.setItem(STORAGE_AUTH, JSON.stringify(auth));
    } catch (_) {}
  }

  async function refrescarToken(auth) {
    if (!auth || !auth.refreshToken || !auth.apiKey) return null;
    try {
      const url = `https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(auth.apiKey)}`;
      const body = `grant_type=refresh_token&refresh_token=${encodeURIComponent(auth.refreshToken)}`;
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });
      const d = await r.json().catch(() => null);
      if (!r.ok || !d || !d.id_token) {
        guardarAuth(null);
        return null;
      }
      const actualizado = {
        ...auth,
        idToken: d.id_token,
        refreshToken: d.refresh_token || auth.refreshToken,
        expiresAt: Date.now() + Math.max(60, Number(d.expires_in || 3600) - 60) * 1000,
      };
      guardarAuth(actualizado);
      return actualizado.idToken;
    } catch (_) {
      return auth.idToken || null;
    }
  }

  async function asegurarToken() {
    const auth = leerAuth();
    if (!auth || !auth.idToken) return null;
    if (auth.expiresAt && Date.now() < auth.expiresAt) return auth.idToken;
    return refrescarToken(auth);
  }

  async function iniciarSesionAdminFirebase(email, password, apiKey) {
    const key = String(apiKey || (leerAuth() && leerAuth().apiKey) || "").trim();
    if (!key) return { ok: false, mensaje: "Falta la Firebase Web API Key." };
    try {
      const url = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(key)}`;
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, returnSecureToken: true }),
      });
      const d = await r.json().catch(() => null);
      if (!r.ok || !d || !d.idToken) {
        return { ok: false, mensaje: d?.error?.message || "Credenciales Firebase inválidas." };
      }
      const auth = {
        idToken: d.idToken,
        refreshToken: d.refreshToken,
        apiKey: key,
        email: d.email || email,
        localId: d.localId || "",
        expiresAt: Date.now() + Math.max(60, Number(d.expiresIn || 3600) - 60) * 1000,
      };
      guardarAuth(auth);
      return { ok: true, email: auth.email, uid: auth.localId };
    } catch (_) {
      return { ok: false, mensaje: "Sin conexión para autenticar en Firebase." };
    }
  }

  function cerrarSesionAdminFirebase() {
    guardarAuth(null);
  }

  function tieneAuthAdmin() {
    const auth = leerAuth();
    return Boolean(auth && auth.idToken && auth.rol !== "estudiante");
  }

  function obtenerApiKey(apiKey) {
    const auth = leerAuth();
    let lsKey = "";
    try { lsKey = localStorage.getItem("unexuam_fb_apikey") || ""; } catch (_) {}
    const k = String(apiKey || (typeof window !== "undefined" && window.__UNEXUAM_FB_API_KEY__) || lsKey || (auth && auth.apiKey) || "").trim();
    if (k) {
      try { localStorage.setItem("unexuam_fb_apikey", k); } catch (_) {}
    }
    return k;
  }

  async function autenticarEstudiante(cif, password, esRegistro = false, apiKey = "") {
    const key = obtenerApiKey(apiKey);
    const cifNorm = String(cif || "").replace(/\s+/g, "").toUpperCase().slice(0, 15);
    if (!key || !cifNorm || !password) return { ok: false, offline: true };
    if (typeof navigator !== "undefined" && navigator.onLine === false) return { ok: false, offline: true };
    const email = `${cifNorm.toLowerCase()}@unexuam.uam.edu.ni`;
    const llamarIdp = async (endpoint) => {
      const url = `https://identitytoolkit.googleapis.com/v1/accounts:${endpoint}?key=${encodeURIComponent(key)}`;
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, returnSecureToken: true }),
      });
      const d = await r.json().catch(() => null);
      return { ok: r.ok, status: r.status, d };
    };
    try {
      let res = await llamarIdp(esRegistro ? "signUp" : "signInWithPassword");
      if (!esRegistro && !res.ok && res.d?.error?.message === "EMAIL_NOT_FOUND") {
        res = await llamarIdp("signUp");
      } else if (esRegistro && !res.ok && res.d?.error?.message === "EMAIL_EXISTS") {
        res = await llamarIdp("signInWithPassword");
      }
      if (!res.ok || !res.d || !res.d.idToken) {
        return { ok: false, offline: false, mensaje: res.d?.error?.message || "No se pudo autenticar en Firebase." };
      }
      const auth = {
        idToken: res.d.idToken,
        refreshToken: res.d.refreshToken,
        apiKey: key,
        email,
        localId: res.d.localId || "",
        cif: cifNorm,
        rol: "estudiante",
        expiresAt: Date.now() + Math.max(60, Number(res.d.expiresIn || 3600) - 60) * 1000,
      };
      guardarAuth(auth);
      return { ok: true, offline: false, cif: cifNorm, uid: auth.localId };
    } catch (_) {
      return { ok: false, offline: true };
    }
  }

  function cerrarSesionEstudianteFirebase() {
    const auth = leerAuth();
    if (auth && auth.rol === "estudiante") guardarAuth(null);
  }

  function aValorFS(v) {
    if (v === null || v === undefined) return { nullValue: null };
    if (typeof v === "boolean") return { booleanValue: v };
    if (typeof v === "number") {
      return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
    }
    if (Array.isArray(v)) return { arrayValue: { values: v.map(aValorFS) } };
    if (typeof v === "object") {
      const fields = {};
      for (const [k, val] of Object.entries(v)) fields[k] = aValorFS(val);
      return { mapValue: { fields } };
    }
    return { stringValue: String(v) };
  }

  function deValorFS(v) {
    if (!v || typeof v !== "object") return null;
    if ("nullValue" in v) return null;
    if ("booleanValue" in v) return !!v.booleanValue;
    if ("integerValue" in v) return Number(v.integerValue);
    if ("doubleValue" in v) return Number(v.doubleValue);
    if ("stringValue" in v) return String(v.stringValue);
    if ("arrayValue" in v) return (v.arrayValue.values || []).map(deValorFS);
    if ("mapValue" in v) {
      const obj = {};
      for (const [k, val] of Object.entries(v.mapValue.fields || {})) obj[k] = deValorFS(val);
      return obj;
    }
    return null;
  }

  function docAObjeto(doc) {
    if (!doc || !doc.fields) return null;
    const obj = {};
    for (const [k, v] of Object.entries(doc.fields)) obj[k] = deValorFS(v);
    if (doc.name) obj._id = doc.name.split("/").pop();
    return obj;
  }

  function aFields(obj) {
    const fields = {};
    for (const [k, v] of Object.entries(obj)) {
      if (v !== undefined) fields[k] = aValorFS(v);
    }
    return { fields };
  }

  async function reqFS(ruta, opts = {}, publico = false) {
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      return { offline: true, status: 0, data: null };
    }
    const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), TIMEOUT_MS) : null;
    try {
      const token = publico ? null : await asegurarToken();
      const headers = { "Content-Type": "application/json", ...(opts.headers || {}) };
      if (token && !headers.Authorization) headers.Authorization = `Bearer ${token}`;
      const r = await fetch(BASE + ruta, {
        ...opts,
        signal: ctrl ? ctrl.signal : undefined,
        headers,
      });
      const data = await r.json().catch(() => null);
      return { offline: false, status: r.status, ok: r.ok, data };
    } catch (_) {
      return { offline: true, status: 0, ok: false, data: null };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async function obtenerUsuario(cif) {
    const res = await reqFS(`/usuarios/${encodeURIComponent(cif)}`);
    if (res.offline) return { offline: true, usuario: null };
    if (res.status === 404) return { offline: false, usuario: null };
    if (!res.ok) return { offline: true, usuario: null };
    return { offline: false, usuario: docAObjeto(res.data) };
  }

  async function crearUsuario(u) {
    const payload = {
      cif: u.cif,
      nombre: u.nombre,
      sal: u.sal,
      hash: u.hash,
      telefono: u.telefono,
      lugar: u.lugar || "Edificio E",
      admin: false,
      creado: Number(u.creado || Date.now()),
    };
    const res = await reqFS(
      `/usuarios/${encodeURIComponent(u.cif)}?currentDocument.exists=false`,
      { method: "PATCH", body: JSON.stringify(aFields(payload)) }
    );
    if (res.offline) return { offline: true, ok: false };
    if (res.status === 409) return { offline: false, ok: false, duplicado: true };
    if (!res.ok) return { offline: false, ok: false };
    return { offline: false, ok: true, usuario: docAObjeto(res.data) || payload };
  }

  async function actualizarLugar(cif, lugar) {
    const res = await reqFS(
      `/usuarios/${encodeURIComponent(cif)}?updateMask.fieldPaths=lugar&updateMask.fieldPaths=ultimoAcceso`,
      { method: "PATCH", body: JSON.stringify(aFields({ lugar, ultimoAcceso: Date.now() })) }
    );
    return !res.offline && res.ok;
  }

  async function enviarMensaje(m) {
    const id = String(m.id || `m_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`);
    const payload = {
      de: String(m.de || "").slice(0, 15),
      deNombre: String(m.deNombre || "").slice(0, 40),
      para: String(m.para || "TODOS").slice(0, 15),
      texto: String(m.texto || "").slice(0, 500),
      hora: String(m.hora || "").slice(0, 20),
      ts: Number(m.ts || Date.now()),
      estado: m.estado === "en cola" ? "en cola" : "entregado",
    };
    const res = await reqFS(
      `/mensajes/${encodeURIComponent(id)}`,
      { method: "PATCH", body: JSON.stringify(aFields(payload)) }
    );
    return !res.offline && res.ok;
  }

  async function listarMensajes(limite = 60) {
    let res = await reqFS(`/mensajes?pageSize=${limite}&orderBy=ts%20desc`);
    if (!res.offline && !res.ok && res.status === 400) {
      res = await reqFS(`/mensajes?pageSize=${limite}`);
    }
    if (res.offline || !res.ok || !res.data) return null;
    const docs = Array.isArray(res.data.documents) ? res.data.documents : [];
    return docs.map(docAObjeto).filter(Boolean).sort((a, b) => (a.ts || 0) - (b.ts || 0));
  }

  async function leerCampusEstado() {
    const res = await reqFS("/campus/estado", {}, true);
    if (res.offline || !res.ok || !res.data) return null;
    const { _id, ...estado } = docAObjeto(res.data) || {};
    return Object.keys(estado).length ? estado : null;
  }

  let firebaseCampus;
  function observarCampusEstado(recibir) {
    let activo = true;
    let cancelarSnapshot;
    let consultando = false;
    let ultimo = 0;
    const entregar = (datos) => {
      const revision = Number(datos?.actualizado);
      if (!activo || !Number.isFinite(revision) || revision <= ultimo) return;
      ultimo = revision;
      recibir(datos);
    };
    const consultar = async () => {
      if (!activo || consultando) return;
      consultando = true;
      try { entregar(await leerCampusEstado()); }
      finally { consultando = false; }
    };
    let timer;
    const activarRespaldo = () => {
      if (!activo || timer) return;
      consultar();
      timer = setInterval(consultar, 6000);
      window.addEventListener("online", consultar);
    };
    const pararRespaldo = () => {
      clearInterval(timer);
      timer = null;
      window.removeEventListener("online", consultar);
    };
    activarRespaldo();

    firebaseCampus ??= Promise.all([
      import("https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js"),
      import("https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js"),
    ]).then(([app, sdk]) => ({
      sdk,
      db: sdk.getFirestore(app.initializeApp({ projectId: PROYECTO }, "unexuam-campus-publico")),
    })).catch(() => { firebaseCampus = null; return null; });

    firebaseCampus.then((firebase) => {
      if (!activo || !firebase) return;
      const { sdk, db } = firebase;
      cancelarSnapshot = sdk.onSnapshot(sdk.doc(db, "campus", "estado"), { includeMetadataChanges: true },
        (snapshot) => {
          if (snapshot.metadata.fromCache) return;
          pararRespaldo();
          if (snapshot.exists()) entregar(snapshot.data());
        }, activarRespaldo);
    }).catch(activarRespaldo);

    return () => {
      activo = false;
      pararRespaldo();
      cancelarSnapshot?.();
    };
  }

  async function guardarCampusEstado(estadoObj) {
    const em = estadoObj && estadoObj.emergencia && typeof estadoObj.emergencia === "object"
      ? {
          id: String(estadoObj.emergencia.id || "").slice(0, 60),
          tipo: String(estadoObj.emergencia.tipo || "general").slice(0, 30),
          titulo: String(estadoObj.emergencia.titulo || "Emergencia en el campus").slice(0, 120),
          texto: String(estadoObj.emergencia.texto || "").slice(0, 240),
          hora: String(estadoObj.emergencia.hora || "").slice(0, 20),
        }
      : null;
    const payload = {
      bloqueados: Array.isArray(estadoObj?.bloqueados) ? estadoObj.bloqueados.slice(0, 100) : [],
      congestion: (estadoObj && typeof estadoObj.congestion === "object") ? estadoObj.congestion : {},
      emergencia: em,
      actualizado: Number(estadoObj?.actualizado || Date.now()),
    };
    const res = await reqFS(
      "/campus/estado",
      { method: "PATCH", body: JSON.stringify(aFields(payload)) }
    );
    return !res.offline && res.ok;
  }

  window.UNEXO_NUBE = {
    proyecto: PROYECTO,
    iniciarSesionAdminFirebase,
    cerrarSesionAdminFirebase,
    tieneAuthAdmin,
    autenticarEstudiante,
    cerrarSesionEstudianteFirebase,
    obtenerUsuario,
    crearUsuario,
    actualizarLugar,
    enviarMensaje,
    listarMensajes,
    leerCampusEstado,
    observarCampusEstado,
    guardarCampusEstado,
  };
})();
