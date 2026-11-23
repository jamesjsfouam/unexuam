"""
Servidor web de Unexuam, sistema de evacuación Off-Grid (frontend del proyecto).

Uso:
    pip install flask
    python app.py

Abre en el teléfono la dirección http://<IP-del-PC>:5000 que se imprime al arrancar
(el teléfono y el PC deben estar en la misma red Wi-Fi local). No usa internet.

Toda la lógica de grafos está en `backend/`; este archivo solo guarda el estado en
memoria y lo expone como una API JSON para la interfaz web.
"""

import json
import math
import os
import re
import secrets
import socket
import sys
import threading
import time

from flask import Flask, jsonify, render_template, request, session
from werkzeug.exceptions import HTTPException
from werkzeug.security import check_password_hash, generate_password_hash

from backend.datos import crearCampus, crearRedMesh, ubicacionesTelefonos
from backend.evacuacion import aplicarAlerta, dijkstraPasos, rutaEvacuacion
from backend.mensajeria import ALCANCE, conectarTelefono, desconectarTelefono, procesarCola, rutaMensaje
from backend.mesh import propagarAlerta

B = {
    "propagarAlerta": propagarAlerta,
    "rutaEvacuacion": rutaEvacuacion,
    "aplicarAlerta": aplicarAlerta,
}


def crear_campus():
    return crearCampus()


def crear_red_mesh():
    return crearRedMesh()


# ----------------------------------------------------------------------------
# Estado en memoria (dos objetos Graph)
# ----------------------------------------------------------------------------

app = Flask(
    __name__,
    template_folder="frontend/templates",
    static_folder="frontend/static",
)
app.json.ensure_ascii = False
app.config["SEND_FILE_MAX_AGE_DEFAULT"] = 0  # el navegador revalida app.js/app.css: los teléfonos no se quedan con una versión vieja
app.config["MAX_CONTENT_LENGTH"] = 64 * 1024


@app.after_request
def cabeceras_respuesta(resp):
    resp.headers.setdefault("X-Content-Type-Options", "nosniff")
    if request.path.startswith("/api/"):
        resp.headers["Cache-Control"] = "no-store"
    return resp

# Cuentas y mensajes se guardan en disco (carpeta datos/) para no perderlos al reiniciar.
CARPETA_DATOS = os.environ.get("UNEXUAM_DATOS") or os.path.join(os.path.dirname(os.path.abspath(__file__)), "datos")
os.makedirs(CARPETA_DATOS, exist_ok=True)


def ruta_datos(nombre):
    return os.path.join(CARPETA_DATOS, nombre)


def leer_json(nombre, defecto):
    try:
        with open(ruta_datos(nombre), encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return defecto


def guardar_json(nombre, datos):
    tmp = ruta_datos(nombre + ".tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(datos, f, ensure_ascii=False, indent=1)
    os.replace(tmp, ruta_datos(nombre))


def clave_secreta():
    archivo = ruta_datos("clave.secret")
    if not os.path.exists(archivo):
        with open(archivo, "w", encoding="utf-8") as f:
            f.write(secrets.token_hex(32))
    with open(archivo, encoding="utf-8") as f:
        return f.read().strip()


app.secret_key = clave_secreta()
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"
app.config["PERMANENT_SESSION_LIFETIME"] = 60 * 60 * 24 * 30   # 30 días

lock = threading.Lock()
S = {}
USUARIOS = leer_json("usuarios.json", {})     # cif -> {nombre, hash, telefono, lugar}
MENSAJES = leer_json("mensajes.json", [])     # lista de mensajes
EN_LINEA = set()                              # CIF con el teléfono conectado a la red Mesh


def reiniciar_mesh():
    S["red"] = crear_red_mesh()
    S["ubicaciones"] = ubicacionesTelefonos()   # teléfono -> lugar del campus
    S["ultimaAlerta"] = None
    for cif in list(EN_LINEA):                  # los usuarios conectados vuelven a la red
        conectar_usuario(cif, USUARIOS[cif]["lugar"])


def reiniciar_campus():
    campus, zonas = crear_campus()
    S["campus"] = campus
    S["zonas"] = list(zonas)
    S["ubicacion"] = None
    S["bloqueados"] = []       # [{origen, destino, peso}] para poder restaurarlos
    S["congestion"] = {}       # lugar -> factor acumulado


def registrar(texto, tipo="info"):
    S["historial"].insert(0, {"hora": time.strftime("%H:%M:%S"), "texto": texto, "tipo": tipo})
    del S["historial"][40:]


S["historial"] = []
reiniciar_mesh()
reiniciar_campus()
registrar("Servidor iniciado. Campus UAM y red Mesh cargados.")


def num(x):
    """float -> número JSON (inf no existe en JSON, se manda como null)."""
    if x is None or (isinstance(x, float) and math.isinf(x)):
        return None
    return round(float(x), 2)


def serializar(g):
    vertices, aristas = [], []
    for v in g.vertexs:
        vertices.append(v.nombre)
        for destino, peso in v.neig:
            aristas.append({"origen": v.nombre, "destino": destino.nombre, "peso": num(peso)})
    return {"vertices": vertices, "aristas": aristas}


def calcular_ruta():
    if not S["ubicacion"]:
        return None
    ruta, tiempo = B["rutaEvacuacion"](S["campus"], S["ubicacion"], S["zonas"])
    return {"origen": S["ubicacion"], "ruta": list(ruta), "tiempo": num(tiempo)}


def estado():
    try:
        ruta = calcular_ruta()
    except Exception as e:  # el backend puede estar a medias
        ruta = {"origen": S["ubicacion"], "ruta": [], "tiempo": None, "error": str(e)}
    return {
        "mesh": serializar(S["red"]),
        "campus": {
            **serializar(S["campus"]),
            "zonasSeguras": S["zonas"],
            "ubicacion": S["ubicacion"],
            "ruta": ruta,
            "bloqueados": S["bloqueados"],
            "congestion": S["congestion"],
        },
        "ultimaAlerta": S["ultimaAlerta"],
        "historial": S["historial"],
    }


def responder(ok, mensaje, **extra):
    if ok:
        repartir_cola()        # la red pudo cambiar: los mensajes en cola prueban de nuevo
    if mensaje:
        registrar(mensaje, "ok" if ok else "error")
    return jsonify({"ok": ok, "mensaje": mensaje, "estado": estado(), **extra})


def grafo_por_nombre(nombre):
    return {"mesh": S["red"], "campus": S["campus"]}.get(nombre)


def cuerpo_json():
    d = request.get_json(silent=True)
    return d if isinstance(d, dict) else {}


def texto(d, clave, maximo=40):
    val = d.get(clave)
    if val is None or isinstance(val, (bool, list, dict)):
        return ""
    return str(val).strip()[:maximo]


def numero(d, clave, minimo, maximo):
    val = d.get(clave)
    if isinstance(val, bool) or val is None:
        return None
    try:
        x = float(val)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(x) or x < minimo or x > maximo:
        return None
    return x


def existe(g, nombre):
    return any(v.nombre == nombre for v in g.vertexs)


@app.errorhandler(Exception)
def error_backend(e):
    # Un error inesperado no debe tumbar la app ni filtrar detalles internos.
    if isinstance(e, HTTPException):
        return jsonify({"ok": False, "mensaje": e.description}), e.code
    app.logger.exception("Error inesperado en el servidor: %s", e)
    return jsonify({"ok": False, "mensaje": "Error interno del servidor."}), 500


# ----------------------------------------------------------------------------
# Rutas
# ----------------------------------------------------------------------------

# ----------------------------------------------------------------------------
# Inicio de sesión (CIF + carnet) y mensajería por la red Mesh
# ----------------------------------------------------------------------------

LIBRES = {"/api/yo", "/api/login", "/api/login/demo", "/api/registro", "/api/lugares"}
SOLO_ADMIN = ("/api/reiniciar", "/api/mesh/vertice", "/api/mesh/arista", "/api/campus/vertice", "/api/campus/arista")
LUGAR_INICIAL = "Edificio E"      # lugar por defecto al entrar (luego cada quien elige dónde está)
CIF_DEMO = "ADMIN"


@app.before_request
def exigir_sesion():
    if request.path.startswith("/api/") and request.path not in LIBRES:
        cif = session.get("cif")
        if cif not in USUARIOS:
            return jsonify({"ok": False, "mensaje": "Inicia sesión con tu CIF y tu contraseña.", "sesion": False}), 401
        if request.path in SOLO_ADMIN and not USUARIOS[cif].get("admin"):
            return jsonify({"ok": False, "mensaje": "Solo el administrador puede editar los grafos."}), 403


def nombre_telefono(cif, nombre):
    base = "Tel-" + (nombre.split()[0] if nombre.split() else "UAM")
    usados = {u["telefono"] for u in USUARIOS.values()} | set(ubicacionesTelefonos())
    for sufijo in (cif[-3:], cif):
        candidato = f"{base}-{sufijo}"
        if candidato not in usados:
            return candidato
    return f"Tel-{cif}"


def conectar_usuario(cif, lugar):
    """Pone el teléfono del usuario en la red Mesh, en `lugar`, enlazado con los que tiene cerca."""
    u = USUARIOS[cif]
    red = S["red"]
    if red.buscarVertice(u["telefono"]) is not None:
        desconectarTelefono(red, u["telefono"])
    S["ubicaciones"].pop(u["telefono"], None)
    vecinos = conectarTelefono(red, S["campus"], u["telefono"], lugar, S["ubicaciones"])
    S["ubicaciones"][u["telefono"]] = lugar
    u["lugar"] = lugar
    EN_LINEA.add(cif)
    return vecinos


def desconectar_usuario(cif):
    u = USUARIOS.get(cif)
    if not u:
        return
    desconectarTelefono(S["red"], u["telefono"])
    S["ubicaciones"].pop(u["telefono"], None)
    EN_LINEA.discard(cif)


def telefono_de(cif):
    return USUARIOS[cif]["telefono"] if cif in USUARIOS else None


def repartir_cola():
    """DTN: intenta entregar los mensajes en cola ahora que la red cambió."""
    cola = [{"id": m["id"], "origen": telefono_de(m["de"]), "destino": telefono_de(m["para"])}
            for m in MENSAJES if m["estado"] == "en cola"]
    if not cola:
        return 0
    entregados = procesarCola(S["red"], cola)
    por_id = {m["id"]: m for m in MENSAJES}
    for ident, ruta, retardo in entregados:
        por_id[ident].update(estado="entregado", ruta=list(ruta), retardo=num(retardo),
                             entregado=time.strftime("%H:%M:%S"), viaCola=True)
        registrar(f"Mensaje en cola entregado: {' → '.join(ruta)} ({num(retardo)} s).", "ok")
    if entregados:
        guardar_json("mensajes.json", MENSAJES)
    return len(entregados)


def vecinos_de(telefono):
    v = S["red"].buscarVertice(telefono)
    return [{"telefono": w.nombre, "retardo": num(p)} for w, p in v.neig] if v else []


def datos_usuario(cif):
    u = USUARIOS[cif]
    return {"cif": cif, "nombre": u["nombre"], "telefono": u["telefono"], "lugar": u["lugar"],
            "admin": bool(u.get("admin")), "enLinea": cif in EN_LINEA,
            "vecinos": vecinos_de(u["telefono"]), "alcance": ALCANCE}


@app.get("/api/lugares")
def api_lugares():
    with lock:
        return jsonify({"ok": True, "lugares": [v.nombre for v in S["campus"].vertexs]})


@app.get("/api/yo")
def api_yo():
    cif = session.get("cif")
    with lock:
        if cif not in USUARIOS:
            return jsonify({"ok": False, "sesion": False})
        if cif not in EN_LINEA:            # el servidor se reinició: vuelve a la red donde estaba
            conectar_usuario(cif, USUARIOS[cif]["lugar"])
            repartir_cola()
        return jsonify({"ok": True, "sesion": True, "usuario": datos_usuario(cif)})


def leer_cif(d):
    return re.sub(r"\s+", "", str(d.get("cif", ""))).upper()[:15]


def abrir_sesion(cif, lugar=None):
    u = USUARIOS[cif]
    if not lugar or S["campus"].buscarVertice(lugar) is None:
        lugar = u.get("lugar") or LUGAR_INICIAL
    session.clear()
    session["cif"] = cif
    session.permanent = True
    vecinos = conectar_usuario(cif, lugar)
    guardar_json("usuarios.json", USUARIOS)
    registrar(f"{u['nombre']} entró a la red desde {lugar}: {len(vecinos)} teléfono(s) a su alcance.", "ok")
    repartir_cola()
    return jsonify({"ok": True, "usuario": datos_usuario(cif)})


@app.post("/api/registro")
def api_registro():
    d = cuerpo_json()
    cif = leer_cif(d)
    nombre = " ".join(texto(d, "nombre", 40).split())
    clave = texto(d, "contrasena", 64)
    if not re.fullmatch(r"[0-9A-Z-]{4,15}", cif) or cif == CIF_DEMO:
        return jsonify({"ok": False, "mensaje": "Escribe un CIF válido (4 a 15 letras o números)."})
    if len(nombre) < 2:
        return jsonify({"ok": False, "mensaje": "Escribe tu nombre."})
    if len(clave) < 6:
        return jsonify({"ok": False, "mensaje": "La contraseña debe tener al menos 6 caracteres."})
    with lock:
        if len(USUARIOS) >= 500:
            return jsonify({"ok": False, "mensaje": "Límite de cuentas alcanzado en este servidor."})
        if cif in USUARIOS:
            return jsonify({"ok": False, "mensaje": "Ese CIF ya tiene cuenta. Inicia sesión."})
        USUARIOS[cif] = {"nombre": nombre, "hash": generate_password_hash(clave),
                         "telefono": nombre_telefono(cif, nombre), "lugar": LUGAR_INICIAL}
        registrar(f"Nueva cuenta: {nombre} ({USUARIOS[cif]['telefono']}).", "ok")
        return abrir_sesion(cif, texto(d, "lugar", 60) or None)


@app.post("/api/login")
def api_login():
    d = cuerpo_json()
    cif = leer_cif(d)
    clave = texto(d, "contrasena", 64)
    with lock:
        u = USUARIOS.get(cif)
        if u is None or u.get("admin") or not check_password_hash(u["hash"], clave):
            return jsonify({"ok": False, "mensaje": "CIF o contraseña incorrectos."})
        return abrir_sesion(cif, texto(d, "lugar", 60) or None)


@app.post("/api/login/demo")
def api_login_demo():
    # Acceso rápido de demostración (desactivable en producción con UNEXUAM_DISABLE_DEMO=1).
    if os.environ.get("UNEXUAM_DISABLE_DEMO") == "1":
        return jsonify({"ok": False, "mensaje": "El acceso demo está deshabilitado."}), 403
    with lock:
        if CIF_DEMO not in USUARIOS:
            USUARIOS[CIF_DEMO] = {"nombre": "Administrador", "hash": "", "admin": True,
                                  "telefono": "Tel-Admin", "lugar": LUGAR_INICIAL}
        return abrir_sesion(CIF_DEMO)


@app.post("/api/logout")
def api_logout():
    cif = session.get("cif")
    with lock:
        if cif in USUARIOS:
            desconectar_usuario(cif)
            registrar(f"{USUARIOS[cif]['nombre']} salió: su teléfono dejó la red (eliminarVertice).")
    session.clear()
    return jsonify({"ok": True})


@app.post("/api/yo/lugar")
def api_mover():
    lugar = texto(cuerpo_json(), "lugar", 60)
    cif = session["cif"]
    with lock:
        if S["campus"].buscarVertice(lugar) is None:
            return jsonify({"ok": False, "mensaje": f"El lugar «{lugar}» no existe."})
        vecinos = conectar_usuario(cif, lugar)
        guardar_json("usuarios.json", USUARIOS)
        n = repartir_cola()
        extra = f" Salieron {n} mensaje(s) que estaban en cola." if n else ""
        return jsonify({"ok": True, "usuario": datos_usuario(cif),
                        "mensaje": f"Ahora estás en {lugar}: {len(vecinos)} teléfono(s) a tu alcance.{extra}"})


@app.get("/api/mensajes")
def api_mensajes():
    cif = session["cif"]
    with lock:
        contactos = [{"cif": c, "nombre": u["nombre"], "telefono": u["telefono"], "enLinea": c in EN_LINEA,
                      "lugar": u["lugar"] if c in EN_LINEA else None}
                     for c, u in USUARIOS.items() if c != cif]
        contactos.sort(key=lambda x: (not x["enLinea"], x["nombre"].lower()))
        canal = {"cif": "TODOS", "nombre": "Canal General · Campus", "telefono": "Mesh-Todos",
                 "enLinea": True, "lugar": f"{len(EN_LINEA)} en la red", "grupo": True}
        contactos.insert(0, canal)
        mios = [m for m in MENSAJES if cif in (m["de"], m["para"]) or m["para"] == "TODOS"]
        return jsonify({"ok": True, "yo": datos_usuario(cif), "contactos": contactos, "mensajes": mios[-300:]})


@app.post("/api/mensajes/enviar")
def api_enviar():
    d = cuerpo_json()
    cif = session["cif"]
    para = texto(d, "para", 15).upper()
    texto_msj = texto(d, "texto", 500)
    with lock:
        es_todos = para == "TODOS"
        if (not es_todos and para not in USUARIOS) or para == cif:
            return jsonify({"ok": False, "mensaje": "Elige a quién enviarle el mensaje."})
        if not texto_msj:
            return jsonify({"ok": False, "mensaje": "El mensaje está vacío."})
        ahora = time.strftime("%H:%M:%S")
        if es_todos:
            ruta = [telefono_de(cif), "Todos"]
            retardo = 0.5
        else:
            ruta, retardo = rutaMensaje(S["red"], telefono_de(cif), telefono_de(para))
        m = {"id": secrets.token_hex(6), "de": cif, "deNombre": USUARIOS[cif]["nombre"], "para": para,
             "texto": texto_msj, "hora": ahora, "estado": "entregado" if ruta else "en cola", "ruta": list(ruta),
             "retardo": num(retardo) if ruta else None, "entregado": ahora if ruta else None, "viaCola": False}
        MENSAJES.append(m)
        del MENSAJES[:-5000]
        guardar_json("mensajes.json", MENSAJES)
        if es_todos:
            msj = "Difundido en el Canal General del campus."
        elif ruta:
            msj = f"Entregado en {len(ruta) - 1} salto(s), {num(retardo)} s de retardo."
        else:
            msj = "Sin camino en la red Mesh: el mensaje queda en cola (DTN) y sale cuando aparezca uno."
        registrar(f"Mensaje {telefono_de(cif)} → {'Todos' if es_todos else telefono_de(para)}: {m['estado']}.", "ok" if ruta else "info")
        return jsonify({"ok": True, "mensaje": msj, "enviado": m})


# --- Dijkstra paso a paso (grafo 2D) -----------------------------------------

@app.route("/api/algoritmo", methods=["GET", "POST"])
def api_algoritmo():
    d = cuerpo_json()
    origen = (texto(d, "origen", 60) or str(request.args.get("origen") or "C-101").strip()[:60])
    with lock:
        if S["campus"].buscarVertice(origen) is None:
            return jsonify({"ok": False, "mensaje": f"El lugar «{origen}» no existe."})
        pasos, ruta, tiempo = dijkstraPasos(S["campus"], origen, S["zonas"])
        for p in pasos:
            p["distancia"] = num(p["distancia"])
            for v in p["vecinos"]:
                v["peso"], v["antes"], v["nueva"] = num(v["peso"]), num(v["antes"]), num(v["nueva"])
        return jsonify({"ok": True, "origen": origen, "pasos": pasos, "ruta": list(ruta), "tiempo": num(tiempo),
                        "grafo": serializar(S["campus"]), "zonasSeguras": S["zonas"]})


@app.get("/")
def index():
    return render_template("index.html")


@app.get("/sw.js")
def service_worker():
    resp = app.send_static_file("sw.js")
    resp.headers["Service-Worker-Allowed"] = "/"
    resp.headers["Cache-Control"] = "no-cache"
    return resp


@app.get("/api/estado")
def api_estado():
    with lock:
        return jsonify({"ok": True, "mensaje": "", "estado": estado()})


@app.post("/api/reiniciar")
def api_reiniciar():
    d = cuerpo_json()
    cual = d.get("grafo") or "ambos"
    if cual not in ("mesh", "campus", "ambos"):
        with lock:
            return responder(False, "Grafo desconocido.")
    with lock:
        if cual in ("mesh", "ambos"):
            reiniciar_mesh()
        if cual in ("campus", "ambos"):
            reiniciar_campus()
        nombres = {"mesh": "la red Mesh", "campus": "el campus", "ambos": "los dos grafos"}
        return responder(True, f"Se reinició {nombres[cual]}.")


# --- Capa 1: red Mesh --------------------------------------------------------

@app.post("/api/mesh/alerta")
def api_alerta():
    d = cuerpo_json()
    origen = texto(d, "origen")
    ttl = numero(d, "ttl", 0, 50)
    with lock:
        if not existe(S["red"], origen):
            return responder(False, f"El teléfono «{origen}» no existe.")
        if ttl is None:
            return responder(False, "El TTL debe ser un número entre 0 y 50.")
        ttl = int(ttl)
        alcanzados = [[c, int(s)] for c, s in B["propagarAlerta"](S["red"], origen, ttl)]
        S["ultimaAlerta"] = {"origen": origen, "ttl": ttl, "alcanzados": alcanzados,
                             "hora": time.strftime("%H:%M:%S")}
        total = len(S["red"].vertexs)
        n = len({c for c, _ in alcanzados} | {origen})
        return responder(True, f"Alerta desde {origen} (TTL {ttl}): llegó a {n} de {total} teléfonos.",
                         alcanzados=alcanzados)


# --- Capa 2: campus ----------------------------------------------------------

@app.post("/api/campus/ruta")
def api_ruta():
    # Ruta de evacuación para UN teléfono: cada estudiante está en un lugar distinto,
    # así que no se guarda en el estado compartido (solo se calcula y se devuelve).
    d = cuerpo_json()
    lugar = texto(d, "lugar", 60)
    with lock:
        if not existe(S["campus"], lugar):
            return jsonify({"ok": False, "mensaje": f"El lugar «{lugar}» no existe.", "ruta": None})
        ruta, tiempo = B["rutaEvacuacion"](S["campus"], lugar, S["zonas"])
        return jsonify({"ok": True, "mensaje": "",
                        "ruta": {"origen": lugar, "ruta": list(ruta), "tiempo": num(tiempo)}})


@app.post("/api/campus/ubicacion")
def api_ubicacion():
    d = cuerpo_json()
    lugar = texto(d, "lugar")
    with lock:
        if lugar and not existe(S["campus"], lugar):
            return responder(False, f"El lugar «{lugar}» no existe.")
        S["ubicacion"] = lugar or None
        r = calcular_ruta()
        if not r:
            return responder(True, "")
        if r["tiempo"] is None:
            return responder(False, f"Desde {lugar} no hay ruta a ninguna zona segura.")
        return responder(True, f"Ruta desde {lugar}: {' → '.join(r['ruta'])} ({r['tiempo']} s).")


@app.post("/api/campus/bloquear")
def api_bloquear():
    d = cuerpo_json()
    o, dst, ambos = texto(d, "origen"), texto(d, "destino"), bool(d.get("ambos", True))
    with lock:
        g = S["campus"]
        pares = [(o, dst)] + ([(dst, o)] if ambos else [])
        quitadas = []
        for a, b in pares:
            peso = next((p for v in g.vertexs if v.nombre == a for w, p in v.neig if w.nombre == b), None)
            if peso is not None and g.eliminarArista(a, b):
                S["bloqueados"].append({"origen": a, "destino": b, "peso": num(peso)})
                quitadas.append(f"{a} → {b}")
        if not quitadas:
            return responder(False, f"No existe el paso {o} → {dst}.")
        return responder(True, "Pasillo bloqueado (eliminarArista): " + ", ".join(quitadas) + ".")


@app.post("/api/campus/desbloquear")
def api_desbloquear():
    with lock:
        g = S["campus"]
        n = 0
        for b in S["bloqueados"]:
            if g.insertarArista(b["origen"], b["destino"], b["peso"]):
                n += 1
        S["bloqueados"] = []
        return responder(True, f"Se reabrieron {n} pasos (insertarArista con su peso original).")


@app.post("/api/campus/congestionar")
def api_congestionar():
    d = cuerpo_json()
    lugar = texto(d, "lugar")
    factor = numero(d, "factor", 0.1, 20)
    with lock:
        if not existe(S["campus"], lugar):
            return responder(False, f"El lugar «{lugar}» no existe.")
        if factor is None:
            return responder(False, "El factor debe estar entre 0.1 y 20.")
        if not B["aplicarAlerta"](S["campus"], lugar, factor):
            return responder(False, f"aplicarAlerta devolvió False para «{lugar}».")
        S["congestion"][lugar] = round(S["congestion"].get(lugar, 1) * factor, 3)
        return responder(True, f"{lugar}: los pasos que entran se multiplicaron ×{factor:g} (aplicarAlerta).")


# --- Administrar (ambos grafos) ------------------------------------------------

@app.post("/api/<grafo>/vertice")
def api_vertice(grafo):
    d = cuerpo_json()
    accion, nombre = d.get("accion"), texto(d, "nombre")
    with lock:
        g = grafo_por_nombre(grafo)
        if g is None:
            return responder(False, "Grafo desconocido.")
        if not nombre:
            return responder(False, "El nombre no puede estar vacío.")
        if accion == "insertar":
            if not g.insertarVertice(nombre):
                return responder(False, f"«{nombre}» ya existe.")
            if grafo == "campus" and d.get("zonaSegura"):
                S["zonas"].append(nombre)
            return responder(True, f"Vértice «{nombre}» insertado en {grafo}.")
        if accion == "eliminar":
            v_real = g.buscarVertice(nombre)
            if v_real is None or not g.eliminarVertice(v_real.nombre):
                return responder(False, f"«{nombre}» no existe.")
            canon = v_real.nombre
            if grafo == "campus":
                S["zonas"] = [z for z in S["zonas"] if z != canon]
                S["bloqueados"] = [b for b in S["bloqueados"] if canon not in (b["origen"], b["destino"])]
                S["congestion"].pop(canon, None)
                if S["ubicacion"] == canon:
                    S["ubicacion"] = None
            return responder(True, f"Vértice «{canon}» eliminado de {grafo} (y sus aristas entrantes).")
        return responder(False, "Acción no válida.")


@app.post("/api/<grafo>/arista")
def api_arista(grafo):
    d = cuerpo_json()
    accion, o, dst = d.get("accion"), texto(d, "origen"), texto(d, "destino")
    with lock:
        g = grafo_por_nombre(grafo)
        if g is None:
            return responder(False, "Grafo desconocido.")
        if accion in ("insertar", "actualizar"):
            peso = numero(d, "peso", 0, 100000)
            if peso is None:
                return responder(False, "El peso debe ser un número mayor o igual a 0.")
            if accion == "insertar":
                if not g.insertarArista(o, dst, peso):
                    return responder(False, f"No se pudo insertar {o} → {dst}: falta algún vértice.")
                return responder(True, f"Arista {o} → {dst} (peso {peso:g}) insertada en {grafo}.")
            if not g.actualizarPeso(o, dst, peso):
                return responder(False, f"No existe la arista {o} → {dst}.")
            return responder(True, f"Peso de {o} → {dst} actualizado a {peso:g}.")
        if accion == "eliminar":
            if not g.eliminarArista(o, dst):
                return responder(False, f"No existe la arista {o} → {dst}.")
            return responder(True, f"Arista {o} → {dst} eliminada de {grafo}.")
        return responder(False, "Acción no válida.")


# ----------------------------------------------------------------------------

def ip_local():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("10.255.255.255", 1))  # no envía nada; solo elige la interfaz de la red local
        return s.getsockname()[0]
    except OSError:
        return "127.0.0.1"
    finally:
        s.close()


if __name__ == "__main__":
    try:
        sys.stdout.reconfigure(errors="replace")  # consolas de Windows sin UTF-8
    except AttributeError:
        pass
    puerto = int(os.environ.get("PORT", "5000"))
    print("=" * 60)
    print(" Unexuam · Evacuación Off-Grid")
    print(f" En este PC:        http://127.0.0.1:{puerto}")
    print(f" Desde el teléfono: http://{ip_local()}:{puerto}  (misma Wi-Fi)")
    print("=" * 60)
    app.run(host="0.0.0.0", port=puerto, debug=False, threaded=True)
