const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const motorPath = path.join(root, "mobile", "motor-offline.js");
const datosPath = path.join(root, "mobile", "www", "static", "datos-iniciales.json");
const campusOfflinePath = path.join(root, "mobile", "www", "campus-offline.json");

async function main() {
  const storage = new Map();
  const dispatched = [];
  const meshCalls = { iniciar: 0, reintentar: 0, enviados: [], confirmados: [] };
  const timers = [];

  const datosRaw = fs.readFileSync(datosPath, "utf8");
  const campusOffRaw = fs.existsSync(campusOfflinePath) ? fs.readFileSync(campusOfflinePath, "utf8") : "{}";

  const localStorage = {
    getItem: (k) => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: (k) => storage.delete(k),
  };

  class FakeCustomEvent {
    constructor(type, init = {}) {
      this.type = type;
      this.detail = init.detail;
    }
  }

  class FakeResponse {
    constructor(body, init = {}) {
      this.status = init.status || 200;
      this.ok = this.status >= 200 && this.status < 300;
      this._body = typeof body === "string" ? body : JSON.stringify(body);
    }
    async json() {
      return JSON.parse(this._body);
    }
    async text() {
      return this._body;
    }
  }

  const sandbox = {
    console,
    Math,
    Date,
    JSON,
    Set,
    Map,
    Array,
    Object,
    String,
    Number,
    Boolean,
    RegExp,
    Error,
    Promise,
    Uint8Array,
    TextEncoder,
    URL,
    Response: FakeResponse,
    CustomEvent: FakeCustomEvent,
    setTimeout: (fn, ms) => {
      const id = timers.push({ fn, ms, tipo: "timeout" });
      return id;
    },
    clearTimeout: () => {},
    setInterval: (fn, ms) => {
      const id = timers.push({ fn, ms, tipo: "interval" });
      return id;
    },
    clearInterval: () => {},
    navigator: { onLine: false },
    crypto: require("node:crypto").webcrypto,
    localStorage,
    UnexuamNativo: {
      iniciarMesh: () => { meshCalls.iniciar += 1; },
      reintentarMeshSiDesconectado: () => { meshCalls.reintentar += 1; },
      actualizarPerfilMesh: () => {},
      enviarPaqueteMesh: (raw) => {
        meshCalls.enviados.push(JSON.parse(raw));
        return 1;
      },
      confirmarEntradaMesh: (id) => {
        meshCalls.confirmados.push(id);
      },
      vecinosMeshReales: () => "[]",
      vibrarAlerta: () => {},
    },
    window: null,
  };

  const listeners = {};
  sandbox.window = sandbox;
  sandbox.location = { origin: "https://localhost" };
  sandbox.addEventListener = (ev, fn) => {
    (listeners[ev] = listeners[ev] || []).push(fn);
  };
  sandbox.dispatchEvent = (ev) => {
    dispatched.push(ev);
    for (const fn of listeners[ev.type] || []) fn(ev);
  };
  sandbox.fetch = async (url) => {
    if (String(url).includes("/static/datos-iniciales.json")) {
      return new FakeResponse(datosRaw, { status: 200 });
    }
    if (String(url).includes("/campus-offline.json")) {
      return new FakeResponse(campusOffRaw, { status: 200 });
    }
    return new FakeResponse({ ok: false }, { status: 404 });
  };

  vm.runInNewContext(fs.readFileSync(motorPath, "utf8"), sandbox, { filename: "motor-offline.js" });

  // 1) REM-01: estado público con vértice aislado (sin aristas) no debe lanzar TypeError por S.ubicaciones
  const resPub = await sandbox.fetch("/api/campus/publico");
  const jPub = await resPub.json();
  assert.equal(jPub.ok, true);
  assert.ok(Array.isArray(jPub.estado.campus.vertices));

  // Conectar usuario no-admin simulado en cuentas y disparar cálculo de sinSenal
  const resReg = await sandbox.fetch("/api/registro", {
    method: "POST",
    body: JSON.stringify({ cif: "UAM2026", nombre: "Ana Prueba", contrasena: "clave123" }),
  });
  const jReg = await resReg.json();
  assert.equal(jReg.ok, true, "Registro offline debe funcionar");

  const resEst = await sandbox.fetch("/api/estado");
  const jEst = await resEst.json();
  assert.equal(jEst.ok, true);
  assert.ok(Array.isArray(jEst.estado.campus.sinSenal), "sinSenal debe serializarse sin TypeError");

  // 2) REM-09: estudiante no-admin no puede bloquear pasillos vía /api/campus/bloquear
  const arista0 = jEst.estado.campus.aristas[0];
  const resBloq = await sandbox.fetch("/api/campus/bloquear", {
    method: "POST",
    body: JSON.stringify({ origen: arista0.origen, destino: arista0.destino, ambos: true }),
  });
  assert.equal(resBloq.status, 403, "Estudiante no-admin debe recibir 403 en /api/campus/bloquear");
  const jBloq = await resBloq.json();
  assert.equal(jBloq.ok, false);

  // REM-09b: paquete Mesh de bloqueo con deAdmin: false debe ser ignorado
  await sandbox.__unexuamMeshEvento({
    tipo: "paquete",
    paquete: {
      id: "pkt-bloq-fake",
      tipo: "incidente",
      accion: "bloquear",
      origen: arista0.origen,
      destino: arista0.destino,
      de: "UAM9999",
      para: "TODOS",
      texto: "Bloqueo falso",
      deAdmin: false,
    },
  });
  const jEst2 = await (await sandbox.fetch("/api/estado")).json();
  assert.equal(jEst2.estado.campus.bloqueados.length, 0, "Bloqueo Mesh sin rol admin no debe aplicarse");

  // 3) REM-07: broadcast TODOS debe confirmar entrada nativa en bandeja
  assert.ok(meshCalls.confirmados.includes("pkt-bloq-fake"), "Broadcast TODOS debe llamar confirmarEntradaMesh");

  // 4) REM-04: loop offline cada 6s usa reintentarMeshSiDesconectado sin resetear iniciarMesh
  const tBoot = timers.find((t) => t.tipo === "timeout" && t.ms === 800);
  const tLoop = timers.find((t) => t.tipo === "interval" && t.ms === 6000);
  assert.ok(tBoot && tLoop, "Deben existir timer de arranque y loop de 6000 ms");
  tBoot.fn();
  const iniciosAntes = meshCalls.iniciar;
  tLoop.fn();
  tLoop.fn();
  assert.equal(meshCalls.iniciar, iniciosAntes, "Loop de 6s no debe reiniciar meshIniciado");
  assert.equal(meshCalls.reintentar, 2, "Loop de 6s debe invocar reintentarMeshSiDesconectado");

  // 5) REM-10 & REM-15: SOS en modo invitado (sin sesión) funciona con ID INV-<4HEX>
  await sandbox.fetch("/api/logout", { method: "POST", body: "{}" });
  const resSos = await sandbox.fetch("/api/mensajes/enviar", {
    method: "POST",
    body: JSON.stringify({ para: "TODOS", texto: "SOS · Ayuda en Edificio P (Visitante UAM)." }),
  });
  assert.equal(resSos.status, 200);
  const jSos = await resSos.json();
  assert.equal(jSos.ok, true, "SOS de invitado debe permitirse offline");
  assert.match(jSos.enviado.de, /^INV-[0-9A-F]{4}$/, "El remitente invitado debe usar INV-<4HEX>");

  // 6) Ya no existe un administrador sembrado con contraseña fija en el código
  const resAdmSemilla = await sandbox.fetch("/api/login", {
    method: "POST",
    body: JSON.stringify({ cif: "25012005", contrasena: "Jamesfer.4" }),
  });
  assert.equal((await resAdmSemilla.json()).ok, false, "No debe existir un admin sembrado offline");
  const cuentasGuardadas = JSON.parse(localStorage.getItem("unexuam-cuentas-v1") || "{}");
  assert.ok(!Object.values(cuentasGuardadas.usuarios || {}).some((u) => u && u.admin), "No debe quedar ninguna cuenta admin local sembrada");

  // 7) Invitado: confirma SIEMPRE la bandeja nativa y no reactiva una emergencia ya finalizada
  //    aunque la bandeja reproduzca "finalizar" antes que "emergencia".
  const confirmadosAntes = meshCalls.confirmados.length;
  await sandbox.__unexuamMeshEvento({
    tipo: "paquete",
    paquete: { id: "pkt-fin-1", tipo: "incidente", accion: "finalizar", incidente: "EMG-1", deAdmin: true,
               de: "OP000001", para: "TODOS", texto: "Emergencia finalizada" },
  });
  await sandbox.__unexuamMeshEvento({
    tipo: "paquete",
    paquete: { id: "EMG-1", tipo: "incidente", accion: "emergencia", emergenciaTipo: "sismo", deAdmin: true,
               de: "OP000001", para: "TODOS", texto: "SOS · Sismo", titulo: "Sismo" },
  });
  let jPub7 = await (await sandbox.fetch("/api/campus/publico")).json();
  assert.equal(jPub7.estado.emergencia, null, "Una emergencia ya finalizada no debe reactivarse al reproducir la bandeja");
  assert.ok(meshCalls.confirmados.includes("pkt-fin-1") && meshCalls.confirmados.includes("EMG-1"),
    "El invitado debe confirmar las entradas de la bandeja nativa");

  // 8) Emergencias por Mesh de remitentes sin rol admin se ignoran (y se confirman)
  await sandbox.__unexuamMeshEvento({
    tipo: "paquete",
    paquete: { id: "EMG-FALSA", tipo: "incidente", accion: "emergencia", deAdmin: false,
               de: "UAM9999", para: "TODOS", texto: "SOS · falsa" },
  });
  jPub7 = await (await sandbox.fetch("/api/campus/publico")).json();
  assert.equal(jPub7.estado.emergencia, null, "Emergencia Mesh sin rol admin no debe aplicarse");
  assert.ok(meshCalls.confirmados.includes("EMG-FALSA"));

  // Una emergencia legítima nueva sí se activa
  await sandbox.__unexuamMeshEvento({
    tipo: "paquete",
    paquete: { id: "EMG-2", tipo: "incidente", accion: "emergencia", deAdmin: true,
               de: "OP000001", para: "TODOS", texto: "SOS · Incendio", titulo: "Incendio" },
  });
  jPub7 = await (await sandbox.fetch("/api/campus/publico")).json();
  assert.equal(jPub7.estado.emergencia && jPub7.estado.emergencia.id, "EMG-2", "Una emergencia nueva de admin debe activarse");
  assert.ok(meshCalls.confirmados.length >= confirmadosAntes + 4);

  console.log("PASS tests/test_motor_offline.js (8/8 escenarios OK)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
