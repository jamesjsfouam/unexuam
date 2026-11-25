/* Unexuam · Cliente ligero de Cloud Firestore (REST v1) para base de datos compartida en la nube.
 * Funciona sin SDKs pesados y cae limpiamente a modo offline/Mesh si no hay internet. */
(function () {
  "use strict";

  const PROYECTO = "unexuam-campus-ni";
  const BASE = `https://firestore.googleapis.com/v1/projects/${PROYECTO}/databases/(default)/documents`;
  const TIMEOUT_MS = 3500;

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

  async function reqFS(ruta, opts = {}) {
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      return { offline: true, status: 0, data: null };
    }
    const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), TIMEOUT_MS) : null;
    try {
      const r = await fetch(BASE + ruta, {
        ...opts,
        signal: ctrl ? ctrl.signal : undefined,
        headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
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
    const res = await reqFS(`/mensajes?pageSize=${limite}`);
    if (res.offline || !res.ok || !res.data) return null;
    const docs = Array.isArray(res.data.documents) ? res.data.documents : [];
    return docs.map(docAObjeto).filter(Boolean).sort((a, b) => (a.ts || 0) - (b.ts || 0));
  }

  async function leerCampusEstado() {
    const res = await reqFS("/campus/estado");
    if (res.offline || !res.ok || !res.data) return null;
    return docAObjeto(res.data);
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
    obtenerUsuario,
    crearUsuario,
    actualizarLugar,
    enviarMensaje,
    listarMensajes,
    leerCampusEstado,
    guardarCampusEstado,
  };
})();
