const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const { initializeApp } = require("firebase-admin/app");
const { getMessaging } = require("firebase-admin/messaging");

initializeApp();

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
