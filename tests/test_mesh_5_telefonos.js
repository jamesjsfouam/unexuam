// Prueba de campo simulada: 5 teléfonos SIN internet, cada uno con su propia copia del motor offline
// de la app (mobile/motor-offline.js, su propio almacenamiento) y con la capa nativa MeshNativa.java
// reproducida aquí: firma HMAC, TTL por salto, «vistos», custodia DTN, vector de resumen en el hello,
// bandeja de entrada y acuses (ACK). Los teléfonos se enlazan como lo haría Nearby Connections.
//
//   node tests/test_mesh_5_telefonos.js
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const motorSrc = fs.readFileSync(path.join(root, "mobile", "motor-offline.js"), "utf8");
const datosRaw = fs.readFileSync(path.join(root, "mobile", "www", "static", "datos-iniciales.json"), "utf8");
const campusOffPath = path.join(root, "mobile", "www", "campus-offline.json");
const campusOffRaw = fs.existsSync(campusOffPath) ? fs.readFileSync(campusOffPath, "utf8") : "{}";

// ---------------------------------------------------------------- capa nativa (MeshNativa.java)
const HMAC_KEY = crypto.createHash("sha256").update("clave-de-prueba|ni.edu.uam.unexuam.mesh").digest();
function firmar(o) {
  const s = (k) => (o[k] === undefined || o[k] === null ? "" : String(o[k]));
  const b = (k) => (k in o ? String(Boolean(o[k])) : "");
  const base = [s("tipo"), s("id"), s("de"), s("para"), s("texto"), s("ackDe"), s("origen"), s("destino"),
    s("accion"), s("emergenciaTipo"), s("titulo"), b("ambos"), s("incidente"), String(o.ttl | 0),
    Array.isArray(o.ruta) ? JSON.stringify(o.ruta) : "", b("deAdmin"), s("cif"), s("nombre"), s("telefono"),
    s("lugar"), Array.isArray(o.tengo) ? JSON.stringify(o.tengo) : ""].join("|");
  return crypto.createHmac("sha256", HMAC_KEY).update(base).digest("base64");
}
const firmaValida = (o) => !!o.sig && o.sig === firmar(o);

const COLA = [];                 // transporte: entregas pendientes entre teléfonos (orden FIFO)
let BYTES = 0, PAQUETES = 0;
function transmitir(de, a, json) { de = de.nativa || de; a = a.nativa || a; PAQUETES++; BYTES += json.length; COLA.push([de, a, json]); }
async function bombear(max = 20000) {
  let n = 0;
  while (COLA.length) {
    if (++n > max) throw new Error("La red no converge (posible bucle de reenvío)");
    const [de, a, json] = COLA.shift();
    if (a.conectados.has(de.id)) await a.recibir(de.id, json);
  }
}

class MeshNativa {
  constructor(id, telefono) {
    this.id = id; this.telefonoSim = telefono;
    this.perfil = null; this.conectados = new Map();
    this.vistos = new Set(); this.confirmados = new Set(); this.custodia = new Map(); this.bandeja = new Map();
    this.js = null;              // la app (sandbox) de este teléfono
  }
  emitir(tipo, clave, obj) { return this.js.__unexuamMeshEvento(JSON.stringify({ tipo, [clave]: obj })); }
  get miCif() { return (this.perfil && this.perfil.cif) || ""; }
  get miTel() { return (this.perfil && this.perfil.telefono) || ""; }
  agregarARuta(o, tel) { if (!tel) return; o.ruta = Array.isArray(o.ruta) ? o.ruta : []; if (!o.ruta.includes(tel)) o.ruta.push(tel); }
  enviarPaquete(raw) {
    const o = JSON.parse(raw);
    if (!o.sig) o.sig = firmar(o);
    const firmado = JSON.stringify(o);
    if (o.id) { this.vistos.add(o.id); if (!this.confirmados.has(o.id)) this.custodia.set(o.id, firmado); }
    for (const otro of this.conectados.values()) transmitir(this, otro, firmado);
    return this.conectados.size;
  }
  reenviarAOtros(origenId, json) { for (const [id, otro] of this.conectados) if (id !== origenId) transmitir(this, otro, json); }
  hello(otro) {
    const h = { ...(this.perfil || {}), tipo: "hello", tengo: [...this.custodia.keys(), ...[...this.confirmados].slice(-200)] };
    h.sig = firmar(h);
    transmitir(this, otro, JSON.stringify(h));
  }
  async recibir(deId, raw) {
    const o = JSON.parse(raw);
    if (o.tipo === "hello") {
      if (!firmaValida(o)) return;
      await this.emitir("perfil", "peer", o);
      const tiene = new Set(o.tengo || []);
      for (const [k, json] of this.custodia) if (!tiene.has(k)) transmitir(this, this.conectados.get(deId), json);
      return;
    }
    if (!["mensaje", "incidente", "ack"].includes(o.tipo)) return;
    if (!o.id || o.id.length > 80 || !(o.ttl >= 1 && o.ttl <= 10)) return;
    if (!firmaValida(o)) { this.rechazados = (this.rechazados || 0) + 1; return; }
    if (o.tipo === "ack") {
      if (!o.ackDe || o.id !== "ack-" + o.ackDe || this.vistos.has(o.id)) return;
      const local = o.para === this.miCif;
      if (local) this.bandeja.set(o.id, o);
      this.vistos.add(o.id); this.confirmados.add(o.ackDe); this.custodia.delete(o.ackDe);
      this.agregarARuta(o, this.miTel);
      if (local) await this.emitir("ack", "ack", o);
      else if (o.ttl > 1) { o.ttl -= 1; o.sig = firmar(o); this.custodia.set(o.id, JSON.stringify(o)); this.reenviarAOtros(deId, JSON.stringify(o)); }
      return;
    }
    if (this.miCif && o.para === this.miCif) {
      const recibo = this.custodia.get("ack-" + o.id);
      if (recibo) { transmitir(this, this.conectados.get(deId), recibo); return; }
      this.agregarARuta(o, this.miTel);
      this.bandeja.set(o.id, o);
      await this.emitir("paquete", "paquete", o);
      return;
    }
    if (this.vistos.has(o.id) || this.confirmados.has(o.id)) return;
    this.vistos.add(o.id);
    this.agregarARuta(o, this.miTel);
    if (o.para === "TODOS") { this.bandeja.set(o.id, o); await this.emitir("paquete", "paquete", o); }
    if (o.ttl > 1) { o.ttl -= 1; o.sig = firmar(o); const j = JSON.stringify(o); this.custodia.set(o.id, j); this.reenviarAOtros(deId, j); }
  }
  confirmarEntrada(id) {
    const p = this.bandeja.get(id);
    if (!p) return;
    this.bandeja.delete(id);
    if (p.para === "TODOS" || p.tipo === "ack" || p.para !== this.miCif) return;
    const ack = { tipo: "ack", id: "ack-" + id, ackDe: id, de: this.miCif, para: p.de, ttl: 6, ruta: [this.miTel], rutaEntrega: p.ruta };
    ack.sig = firmar(ack);
    const j = JSON.stringify(ack);
    this.custodia.set(ack.id, j); this.vistos.add(ack.id);
    this.reenviarAOtros(null, j);
  }
}

const nat = (x) => x.nativa || x;
async function enlazar(a, b) {
  a = nat(a); b = nat(b);
  a.conectados.set(b.id, b); b.conectados.set(a.id, a);
  await a.emitir("conectado", "peer", { ...b.perfil });
  await b.emitir("conectado", "peer", { ...a.perfil });
  a.hello(b); b.hello(a);
  await bombear();
}
function separar(a, b) { a = nat(a); b = nat(b); a.conectados.delete(b.id); b.conectados.delete(a.id); }

// ---------------------------------------------------------------- un teléfono = una app aislada
class FakeResponse {
  constructor(body, init = {}) { this.status = init.status || 200; this.ok = this.status < 300; this._b = typeof body === "string" ? body : JSON.stringify(body); }
  async json() { return JSON.parse(this._b); }
  async text() { return this._b; }
}
async function telefono(id) {
  const store = new Map();
  const nativa = new MeshNativa(id);
  const timers = [];
  const alarmas = [];
  const sb = {
    console: { ...console, warn: () => {} }, Math, Date, JSON, Set, Map, Array, Object, String, Number, Boolean, RegExp, Error, Promise,
    Uint8Array, TextEncoder, URL, Response: FakeResponse,
    CustomEvent: class { constructor(t, i = {}) { this.type = t; this.detail = i.detail; } },
    setTimeout: (fn, ms) => timers.push({ fn, ms }), clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {},
    navigator: { onLine: false },                 // sin internet
    crypto: crypto.webcrypto,
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) },
    UnexuamNativo: {
      iniciarMesh: (p) => { nativa.perfil = JSON.parse(p); },
      actualizarPerfilMesh: (p) => { nativa.perfil = JSON.parse(p); },
      reintentarMeshSiDesconectado: () => {}, detenerMesh: () => {},
      enviarPaqueteMesh: (raw) => nativa.enviarPaquete(raw),
      confirmarEntradaMesh: (i) => nativa.confirmarEntrada(i),
      vecinosMeshReales: () => JSON.stringify([...nativa.conectados.keys()]),
      vibrarAlerta: () => alarmas.push("vibrar"), detenerAlarmaEmergencia: () => alarmas.push("detener"),
    },
  };
  sb.window = sb;
  sb.location = { origin: "https://localhost" };
  const oyentes = {};
  sb.addEventListener = (t, fn) => (oyentes[t] = oyentes[t] || []).push(fn);
  sb.dispatchEvent = (ev) => (oyentes[ev.type] || []).forEach((fn) => fn(ev));
  sb.fetch = async (url) => {
    if (String(url).includes("datos-iniciales.json")) return new FakeResponse(datosRaw);
    if (String(url).includes("campus-offline.json")) return new FakeResponse(campusOffRaw);
    throw new TypeError("Failed to fetch (sin internet)");
  };
  vm.runInNewContext(motorSrc, sb, { filename: `motor-offline[${id}].js` });
  nativa.js = sb;
  const api = async (ruta, cuerpo) => {
    const r = await sb.fetch(ruta, cuerpo === undefined ? {} : { method: "POST", body: JSON.stringify(cuerpo) });
    return r.json();
  };
  for (const t of timers.filter((t) => t.ms === 800)) t.fn();   // arranque: la mesh se enciende con o sin cuenta
  return { id, sb, nativa, api, store, alarmas };
}

async function cuenta(tel, cif, nombre, admin = false) {
  const j = await tel.api("/api/registro", { cif, nombre, contrasena: "clave-segura-1" });
  assert.equal(j.ok, true, `registro offline de ${cif}: ${j.mensaje}`);
  if (admin) {      // el rol admin llega desde la nube al iniciar sesión; aquí se simula ese resultado
    const c = JSON.parse(tel.store.get("unexuam-cuentas-v1"));
    c.usuarios[cif].admin = true;
    tel.store.set("unexuam-cuentas-v1", JSON.stringify(c));
  }
  const yo = await tel.api("/api/yo");
  tel.sb.UnexuamNativo.actualizarPerfilMesh(JSON.stringify({ cif, nombre, telefono: yo.usuario.telefono, lugar: yo.usuario.lugar }));
}
const textos = async (tel) => ((await tel.api("/api/mensajes")).mensajes || []).map((m) => m.texto);
const general = async (tel) => ((await tel.api("/api/mensajes/general")).mensajes || []).map((m) => m.texto);
const emergencia = async (tel) => (await tel.api("/api/estado")).estado?.emergencia || null;

// ---------------------------------------------------------------- escenarios
(async () => {
  const resultados = [];
  const ok = (n) => { resultados.push(n); console.log("  ✓ " + n); };

  const [A, B, C, D, E] = await Promise.all(["A", "B", "C", "D", "E"].map(telefono));
  await cuenta(A, "ADMIN001", "Brigada Admin", true);
  await cuenta(B, "EST00002", "Bea Estudiante");
  await cuenta(C, "EST00003", "Carlos Estudiante");
  await cuenta(D, "EST00004", "Dani Estudiante");
  // E entra como INVITADO (sin cuenta): igual es un teléfono de la red
  assert.ok(E.nativa.perfil && /^INV-[0-9A-F]{12}$/.test(E.nativa.perfil.cif), "el invitado enciende la mesh con su ID");
  ok("Los 5 teléfonos encienden la mesh sin internet (4 cuentas y 1 invitado)");

  // Cadena A — B — C — D — E (cada uno solo alcanza a sus vecinos)
  await enlazar(A, B); await enlazar(B, C); await enlazar(C, D); await enlazar(D, E);
  ok("Topología en cadena A–B–C–D–E (4 saltos de punta a punta)");

  // 1) Mensaje directo B → D (2 saltos) y acuse de vuelta
  let r = await B.api("/api/mensajes/enviar", { para: "EST00004", texto: "¿Dónde estás? Voy por la escalera central" });
  assert.equal(r.ok, true, r.mensaje);
  await bombear();
  assert.ok((await textos(D)).includes("¿Dónde estás? Voy por la escalera central"), "D recibe el mensaje de B");
  const enviadoB = (await B.api("/api/mensajes")).mensajes.find((m) => m.texto.startsWith("¿Dónde estás?"));
  assert.equal(enviadoB.estado, "entregado", "B ve «entregado» gracias al ACK");
  ok("Mensaje directo B→D por 2 saltos y acuse de entrega (ACK) de vuelta");

  // 2) Mensaje A (admin) → D y respuesta D → A
  r = await A.api("/api/mensajes/enviar", { para: "EST00004", texto: "Brigada: quédate en la plazoleta" });
  assert.equal(r.ok, true, r.mensaje);
  await bombear();
  assert.ok((await textos(D)).includes("Brigada: quédate en la plazoleta"));
  r = await D.api("/api/mensajes/enviar", { para: "ADMIN001", texto: "Recibido, estoy en la plazoleta" });
  assert.equal(r.ok, true, r.mensaje);
  await bombear();
  assert.ok((await textos(A)).includes("Recibido, estoy en la plazoleta"));
  ok("Admin↔estudiante por 3 saltos en ambos sentidos");

  // 3) Canal General desde C: llega una sola vez a todos (también al invitado, que no lo guarda)
  const vistosE = [];
  E.sb.addEventListener("unexuam-mesh-update", (ev) => ev.detail?.paquete && vistosE.push(ev.detail.paquete));
  r = await C.api("/api/mensajes/enviar", { para: "TODOS", texto: "Pasillo del B despejado" });
  assert.equal(r.ok, true, r.mensaje);
  await bombear();
  for (const t of [A, B, D]) {
    const g = await general(t);
    assert.equal(g.filter((x) => x === "Pasillo del B despejado").length, 1, `Canal General sin duplicados en ${t.id}`);
  }
  assert.ok(vistosE.some((p) => p.texto === "Pasillo del B despejado"), "el invitado E también lo recibe");
  ok("Canal General desde C llega una vez a A, B, D y al invitado E");

  // 4) Alerta oficial: el admin declara un sismo → los 4 restantes la reciben (incluido el invitado)
  r = await A.api("/api/emergencia/declarar", { tipo: "sismo" });
  assert.equal(r.ok, true, r.mensaje);
  await bombear();
  for (const t of [B, C, D]) assert.equal((await emergencia(t))?.tipo, "sismo", `alerta en ${t.id}`);
  const pubE = await E.api("/api/campus/publico");
  const emE = pubE.estado?.emergencia || (await emergencia(E));
  assert.equal(emE?.tipo, "sismo", "el invitado E recibe la alerta");
  for (const t of [B, C, D, E]) assert.ok(t.alarmas.includes("vibrar"), `el teléfono ${t.id} vibra`);
  ok("Alerta de sismo del admin llega a B, C, D y al invitado E (vibran)");

  // 5) Finalizar: se apaga en todos y no se reactiva
  r = await A.api("/api/emergencia/finalizar", {});
  assert.equal(r.ok, true, r.mensaje);
  await bombear();
  for (const t of [B, C, D]) assert.equal(await emergencia(t), null, `fin en ${t.id}`);
  ok("Finalizar la alerta la apaga en todos los teléfonos");

  // 6) Un estudiante NO puede falsificar una alerta oficial
  const falso = { id: "falso-1", tipo: "incidente", accion: "emergencia", emergenciaTipo: "incendio", titulo: "Incendio falso",
    texto: "SOS · falso", deAdmin: true, de: "EST00002", para: "TODOS", ttl: 6, ruta: ["Tel-X"] };
  transmitir(B, C, JSON.stringify({ ...falso, sig: "firma-inventada" }));
  await bombear();
  assert.equal(await emergencia(C), null, "paquete con firma falsa rechazado");
  assert.ok(C.nativa.rechazados >= 1);
  ok("Paquete de alerta con firma falsa rechazado (HMAC)");

  // 7) SOS del invitado E llega a toda la cadena hasta el admin
  r = await E.api("/api/mensajes/enviar", { para: "TODOS", texto: "SOS · Ayuda en Edificio P (Visitante UAM)." });
  assert.equal(r.ok, true, r.mensaje);
  await bombear();
  for (const t of [A, B, C, D]) assert.ok((await general(t)).some((x) => x.startsWith("SOS · Ayuda en Edificio P")), `SOS en ${t.id}`);
  ok("SOS del invitado E llega por 4 saltos hasta el admin A");

  // 8) Custodia DTN: D se aleja, B le escribe; D vuelve y recibe al reconectarse
  separar(C, D);
  r = await B.api("/api/mensajes/enviar", { para: "EST00004", texto: "Te espero en el parqueo sur" });
  assert.equal(r.ok, true, r.mensaje);
  await bombear();
  assert.ok(!(await textos(D)).includes("Te espero en el parqueo sur"), "sin camino todavía");
  await enlazar(C, D);
  assert.ok((await textos(D)).includes("Te espero en el parqueo sur"), "llega al reconectar (vector de resumen)");
  ok("Custodia DTN: el mensaje espera y llega cuando D vuelve a estar al alcance");

  // 9) Ráfaga: 20 mensajes seguidos de A a D sin pérdidas ni duplicados
  for (let i = 1; i <= 20; i++) await A.api("/api/mensajes/enviar", { para: "EST00004", texto: `ráfaga ${i}` });
  await bombear();
  const rafaga = (await textos(D)).filter((t) => t.startsWith("ráfaga "));
  assert.equal(rafaga.length, 20, `D recibió ${rafaga.length}/20`);
  assert.equal(new Set(rafaga).size, 20, "sin duplicados");
  ok("Ráfaga de 20 mensajes: 20/20 recibidos, ninguno duplicado");

  console.log(`PASS tests/test_mesh_5_telefonos.js (${resultados.length} escenarios, ${PAQUETES} paquetes por radio, ${(BYTES / 1024).toFixed(0)} KB)`);
})().catch((e) => { console.error("FAIL tests/test_mesh_5_telefonos.js:", e && e.stack || e); process.exit(1); });
