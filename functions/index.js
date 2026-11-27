const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const { beforeUserCreated, beforeUserSignedIn, HttpsError } = require("firebase-functions/v2/identity");
const { initializeApp } = require("firebase-admin/app");
const { getMessaging } = require("firebase-admin/messaging");
const { getFirestore } = require("firebase-admin/firestore");

initializeApp();

const DOMINIO = "@unexuam.uam.edu.ni";
const CIFS_RESERVADOS = new Set(["ADMIN", "TODOS", "INVITADO"]);

/** CIF a partir del correo sintético cif@unexuam.uam.edu.ni (o null si no es válido). */
function cifDeCorreo(correo) {
  const c = String(correo || "").toLowerCase();
  if (!c.endsWith(DOMINIO)) return null;
  const cif = c.slice(0, -DOMINIO.length).toUpperCase();
  return /^[0-9A-Z-]{4,15}$/.test(cif) && !CIFS_RESERVADOS.has(cif) ? cif : null;
}

/**
 * Al crear una cuenta de Firebase Auth: solo correos cif@unexuam.uam.edu.ni, nunca un CIF que ya
 * tiene dueño (en Firestore /usuarios o registrado en el servidor web /cuentas_web), y el CIF
 * queda como dato verificado del token (custom claim `cif`), que es lo único que aceptan las reglas.
 */
exports.asignarCifAlCrearCuenta = beforeUserCreated(async (event) => {
  const cif = cifDeCorreo(event.data && event.data.email);
  if (!cif) throw new HttpsError("invalid-argument", "Cuenta no válida para Unexuam.");
  const db = getFirestore();
  const [usuario, web] = await Promise.all([db.doc(`usuarios/${cif}`).get(), db.doc(`cuentas_web/${cif}`).get()]);
  if (usuario.exists || web.exists) throw new HttpsError("already-exists", "Ese CIF ya tiene cuenta. Inicia sesión.");
  return { customClaims: { cif } };
});

/** En cada inicio de sesión se vuelve a poner el CIF verificado en la sesión. */
exports.cifAlIniciarSesion = beforeUserSignedIn((event) => {
  const cif = cifDeCorreo(event.data && event.data.email);
  if (!cif) throw new HttpsError("permission-denied", "Cuenta no válida para Unexuam.");
  return { sessionClaims: { cif } };
});

/**
 * Envía notificación push FCM data-only al tema `campus_emergencias`
 * cada vez que un administrador publica una nueva emergencia en `campus/estado`.
 */
exports.notificarEmergenciaCampus = onDocumentWritten("campus/estado", async (event) => {
  const after = event.data?.after?.data();
  const before = event.data?.before?.data();
  if (!after || !after.emergencia || typeof after.emergencia !== "object") {
    return null;
  }

  const em = after.emergencia;
  const emAnterior = before && typeof before.emergencia === "object" ? before.emergencia : null;
  const idActual = String(em.id || "").trim();
  const idAnterior = emAnterior ? String(emAnterior.id || "").trim() : "";

  if (!idActual || idActual === idAnterior) {
    return null;
  }

  const mensaje = {
    topic: "campus_emergencias",
    android: {
      priority: "high",
      ttl: 3600000,
    },
    data: {
      emergencia: "1",
      id: idActual.slice(0, 60),
      tipo: String(em.tipo || "general").slice(0, 30),
      titulo: String(em.titulo || "EMERGENCIA UNEXUAM").slice(0, 120),
      texto: String(em.texto || "Emergencia activa en el campus. Sigue tu ruta segura.").slice(0, 240),
      hora: String(em.hora || "").slice(0, 20),
    },
  };

  return getMessaging().send(mensaje);
});
