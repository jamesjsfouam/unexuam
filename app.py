"""
Servidor web de Unexuam, sistema de evacuación Off-Grid (frontend del proyecto).

Uso:
    pip install -r requirements.txt
    python app.py

Por defecto escucha en loopback. Para acceso desde la LAN, configura TLS explícitamente.
La lógica de grafos se encuentra en `backend/`.
"""

import json
import math
import os
import re
import hashlib
import secrets
import sys
import threading
import time

import click
from flask import Flask, jsonify, render_template, request, session
from werkzeug.exceptions import HTTPException
from werkzeug.security import check_password_hash, generate_password_hash

from backend.grafo import Graph
from backend.datos import crearCampus, crearRedMesh, ubicacionesTelefonos
from backend.evacuacion import aplicarAlerta, dijkstraPasos, rutaEvacuacion
from backend.mensajeria import ALCANCE, conectarTelefono, desconectarTelefono, procesarCola, rutaMensaje
from backend.mesh import propagarAlerta
from basedatos import BaseDatos

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
    resp.headers.setdefault("X-Frame-Options", "DENY")
    resp.headers.setdefault("Referrer-Policy", "no-referrer")
    resp.headers.setdefault(
        "Content-Security-Policy",
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
        "img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; "
        "frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    )
    if request.path.startswith("/api/"):
        resp.headers["Cache-Control"] = "no-store"
    return resp

# Cuentas y mensajes se guardan en disco (carpeta datos/) para no perderlos al reiniciar.
CARPETA_DATOS = os.environ.get("UNEXUAM_DATOS") or os.path.join(os.path.dirname(os.path.abspath(__file__)), "datos")
os.makedirs(CARPETA_DATOS, exist_ok=True)


def ruta_datos(nombre):
    return os.path.join(CARPETA_DATOS, nombre)


def clave_secreta():
    archivo = ruta_datos("clave.secret")
    if not os.path.exists(archivo):
        with open(archivo, "w", encoding="utf-8") as f:
            f.write(secrets.token_hex(32))
        if os.name == "posix":
            os.chmod(archivo, 0o600)
    with open(archivo, encoding="utf-8") as f:
        return f.read().strip()


app.secret_key = clave_secreta()
app.config["SESSION_COOKIE_HTTPONLY"] = True
app.config["SESSION_COOKIE_SECURE"] = (
    os.environ.get("UNEXUAM_SECURE_COOKIES") == "1"
    or bool(os.environ.get("UNEXUAM_TLS_CERT") and os.environ.get("UNEXUAM_TLS_KEY"))
)
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"
app.config["PERMANENT_SESSION_LIFETIME"] = 60 * 60 * 24 * 30   # 30 días

lock = threading.Lock()
S = {}
DB = BaseDatos(ruta_datos("unexuam.db"))     # usuarios, contactos y mensajes (SQLite)
EN_LINEA = set()                              # CIF con el teléfono conectado a la red Mesh


def reiniciar_mesh():
    S["red"] = crear_red_mesh()
    S["ubicaciones"] = ubicacionesTelefonos()   # teléfono -> lugar del campus
    S["ultimaAlerta"] = None
    for cif in list(EN_LINEA):                  # los usuarios conectados vuelven a la red
        conectar_usuario(cif, DB.usuario(cif)["lugar"])


def num(x):
    """float -> número JSON (inf no existe en JSON, se manda como null)."""
    if x is None or (isinstance(x, float) and math.isinf(x)):
        return None
    return round(float(x), 2)


def precalcular_rutas():
    """Precalcula todas las rutas de evacuación del campus para consulta O(1)."""
    cache = {}
    for v in S["campus"].vertexs:
        ruta, tiempo = B["rutaEvacuacion"](S["campus"], v.nombre, S["zonas"])
        cache[v.nombre] = {"origen": v.nombre, "ruta": list(ruta), "tiempo": num(tiempo)}
    S["rutasCache"] = cache
    S["rutasPrecalculadas"] = True


def invalidar_rutas():
    """Invalida la tabla precalculada cuando ocurre un bloqueo, congestión o edición del grafo."""
    S["rutasCache"] = {}
    S["rutasPrecalculadas"] = False


def obtener_ruta_campus(lugar):
    cache = S.get("rutasCache")
    if cache and lugar in cache:
        return cache[lugar], bool(S.get("rutasPrecalculadas"))
    ruta, tiempo = B["rutaEvacuacion"](S["campus"], lugar, S["zonas"])
    res = {"origen": lugar, "ruta": list(ruta), "tiempo": num(tiempo)}
    if cache is not None:
        cache[lugar] = res
    return res, False


def reiniciar_campus():
    campus, zonas = crear_campus()
    S["campus"] = campus
    S["zonas"] = list(zonas)
    S["ubicacion"] = None
    S["bloqueados"] = []       # [{origen, destino, peso}] para poder restaurarlos
    S["congestion"] = {}       # lugar -> factor acumulado
    precalcular_rutas()


class RevisionCampusObsoleta(Exception):
    pass


def cargar_campus_compartido():
    revision, datos = DB.campus_actual()
    if revision == S.get("revisionCampus"):
        return
    S["revisionCampus"] = revision
    if datos is None:
        reiniciar_campus()
        return
    anterior = S.get("ubicacion")
    campus = Graph()
    for nombre in datos["vertices"]:
        campus.insertarVertice(nombre)
    for origen, destino, peso in datos["aristas"]:
        campus.insertarArista(origen, destino, peso)
    S.update(campus=campus, zonas=datos["zonas"], bloqueados=datos["bloqueados"],
             congestion=datos["congestion"], ubicacion=anterior if anterior and campus.buscarVertice(anterior) else None)
    if not datos["bloqueados"] and not datos["congestion"]:
        precalcular_rutas()
    else:
        invalidar_rutas()


def guardar_campus_compartido():
    vertices = S["campus"].vertexs
    datos = {
        "vertices": [v.nombre for v in vertices],
        "aristas": [[v.nombre, destino.nombre, peso] for v in vertices for destino, peso in v.neig],
        "zonas": S["zonas"],
        "bloqueados": S["bloqueados"],
        "congestion": S["congestion"],
    }
    revision = S["revisionCampus"]
    if not DB.guardar_campus(revision, datos):
        cargar_campus_compartido()
        raise RevisionCampusObsoleta()
    S["revisionCampus"] = revision + 1


@app.errorhandler(RevisionCampusObsoleta)
def conflicto_campus(_):
    return jsonify({"ok": False, "mensaje": "El mapa cambió. Actualiza e inténtalo de nuevo."}), 409


def registrar(texto, tipo="info", privado=False):
    S["historial"].insert(0, {"hora": time.strftime("%H:%M:%S"), "texto": texto, "tipo": tipo, "privado": privado})
    del S["historial"][60:]


S["historial"] = []
cargar_campus_compartido()
reiniciar_mesh()
registrar("Servidor iniciado. Campus UAM y red Mesh cargados.")


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
    res, _ = obtener_ruta_campus(S["ubicacion"])
    return res


def estado():
    usuario = usuario_sesion() if request else None
    try:
        ruta = calcular_ruta()
    except Exception as e:  # el backend puede estar a medias
        app.logger.exception("No se pudo calcular la ruta compartida: %s", e)
        ruta = {"origen": S["ubicacion"], "ruta": [], "tiempo": None}
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
        "emergencia": DB.emergencia_actual(),
        "historial": historial_visible(),
        "reportesBloqueo": DB.reportes_bloqueo_pendientes(int(time.time()) - 3600) if usuario and usuario["admin"] else [],
    }


def historial_visible():
    u = usuario_sesion() if request else None
    if u and u["admin"]:
        return S["historial"][:40]
    return [h for h in S["historial"] if not h.get("privado")][:40]


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
    return g.buscarVertice(nombre) is not None


def canonico(g, nombre):
    """Nombre exacto del vértice (sin importar mayúsculas), o None si no existe."""
    v = g.buscarVertice(nombre)
    return v.nombre if v else None


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
# Inicio de sesión (CIF + contraseña) y mensajería por la red Mesh
# ----------------------------------------------------------------------------

LIBRES = {"/api/capacidades", "/api/yo", "/api/login", "/api/login/demo", "/api/registro", "/api/registro/disponible", "/api/lugares", "/api/campus/publico", "/api/campus/ruta", "/api/mensajes/general"}
# Reportar un pasillo bloqueado (/api/campus/bloquear) es una función de emergencia para todos;
# reabrir, congestionar, reiniciar y editar los grafos es solo del administrador.
SOLO_ADMIN = ("/api/reiniciar", "/api/mesh/vertice", "/api/mesh/arista", "/api/mesh/alerta",
              "/api/campus/vertice", "/api/campus/arista", "/api/campus/ubicacion",
              "/api/campus/desbloquear", "/api/campus/congestionar", "/api/campus/reportes/resolver", "/api/algoritmo",
              "/api/emergencia/declarar", "/api/emergencia/finalizar")
LUGAR_INICIAL = "Edificio E"      # lugar por defecto al entrar (luego el GPS o la persona lo cambia)
CIF_DEMO = "ADMIN"
CIF_TODOS = "TODOS"     # Canal General: un "usuario" especial que representa a todo el campus


def usuario_sesion():
    cif = session.get("cif")
    return DB.usuario(cif) if cif else None


@app.before_request
def exigir_sesion():
    if request.path.startswith("/api/") or request.path == "/campus-offline.json":
        with lock:
            cargar_campus_compartido()
    if request.path.startswith("/api/") and request.path not in LIBRES:
        u = usuario_sesion()
        if u is None:
            return jsonify({"ok": False, "mensaje": "Inicia sesión con tu CIF y tu contraseña.", "sesion": False}), 401
        if request.path in SOLO_ADMIN and not u["admin"]:
            return jsonify({"ok": False, "mensaje": "Solo el administrador puede hacer esto."}), 403
        if u["cif"] not in EN_LINEA or (not u["admin"] and S["red"].buscarVertice(u["telefono"]) is None):
            with lock:
                if u["cif"] not in EN_LINEA or (not u["admin"] and S["red"].buscarVertice(u["telefono"]) is None):
                    conectar_usuario(u["cif"], u["lugar"])
                    repartir_cola()


def nombre_telefono(cif, nombre):
    base = "Tel-" + (nombre.split()[0] if nombre.split() else "UAM")
    usados = {t.lower() for t in DB.telefonos_usados() | set(ubicacionesTelefonos())}
    usados |= {v.nombre.lower() for v in S["red"].vertexs}
    for candidato in (f"{base}-{cif[-3:]}", f"{base}-{cif}", f"Tel-{cif}"):
        if candidato.lower() not in usados:
            return candidato
    return f"Tel-{cif}-{secrets.token_hex(2)}"


def conectar_usuario(cif, lugar):
    """Pone el teléfono del usuario en la red Mesh, en `lugar`, enlazado con los que tiene cerca."""
    u = DB.usuario(cif)
    red = S["red"]
    lugar = canonico(S["campus"], lugar) if isinstance(lugar, str) else None
    if lugar is None:
        lugar = canonico(S["campus"], LUGAR_INICIAL) or S["campus"].vertexs[0].nombre
    if u["admin"]:
        # El administrador gestiona los grafos: su teléfono no entra a la red Mesh
        # para no alterar las rutas ni los saltos de los demás.
        DB.mover_usuario(cif, lugar)
        EN_LINEA.add(cif)
        return []
    if red.buscarVertice(u["telefono"]) is not None:
        desconectarTelefono(red, u["telefono"])
    S["ubicaciones"].pop(u["telefono"], None)
    vecinos = conectarTelefono(red, S["campus"], u["telefono"], lugar, S["ubicaciones"])
    S["ubicaciones"][u["telefono"]] = lugar
    DB.mover_usuario(cif, lugar)
    EN_LINEA.add(cif)
    return vecinos


def desconectar_usuario(cif):
    u = DB.usuario(cif)
    if not u:
        return
    desconectarTelefono(S["red"], u["telefono"])
    S["ubicaciones"].pop(u["telefono"], None)
    EN_LINEA.discard(cif)


def repartir_cola():
    """DTN: intenta entregar los mensajes en cola ahora que la red cambió."""
    pendientes = DB.en_cola()
    if not pendientes:
        return 0
    tel = {c: u["telefono"] for c, u in DB.usuarios().items()}
    cola = [{"id": m["id"], "origen": tel.get(m["de"]), "destino": tel.get(m["para"])} for m in pendientes]
    entregados = procesarCola(S["red"], cola)
    for ident, ruta, retardo in entregados:
        DB.marcar_entregado(ident, list(ruta), num(retardo))
        registrar(f"Mensaje en cola entregado: {' → '.join(ruta)} ({num(retardo)} s).", "ok", privado=True)
    return len(entregados)


def vecinos_de(telefono):
    v = S["red"].buscarVertice(telefono)
    return [{"telefono": w.nombre, "retardo": num(p)} for w, p in v.neig] if v else []


def datos_usuario(cif):
    u = DB.usuario(cif)
    return {"cif": cif, "nombre": u["nombre"], "telefono": u["telefono"], "lugar": u["lugar"],
            "admin": bool(u["admin"]), "enLinea": cif in EN_LINEA,
            "vecinos": vecinos_de(u["telefono"]), "alcance": ALCANCE}


def ficha(cif, u=None, para=None):
    """Datos públicos de un contacto. Su lugar solo se ve si los dos se tienen agregados."""
    u = u or DB.usuario(cif)
    en_linea = cif in EN_LINEA
    mutuo = para is not None and cif in DB.contactos_de(para) and para in DB.contactos_de(cif)
    return {"cif": cif, "nombre": u["nombre"], "telefono": u["telefono"], "enLinea": en_linea,
            "lugar": u["lugar"] if en_linea and mutuo else None}


def leer_cif(d):
    return re.sub(r"\s+", "", str(d.get("cif", ""))).upper()[:15]


def abrir_sesion(cif, lugar=None):
    u = DB.usuario(cif)
    if not isinstance(lugar, str) or S["campus"].buscarVertice(lugar) is None:
        lugar = u["lugar"] or LUGAR_INICIAL
    session.clear()
    session["cif"] = cif
    session.permanent = True
    vecinos = conectar_usuario(cif, lugar)
    registrar(f"{u['nombre']} entró a la red desde {lugar}: {len(vecinos)} teléfono(s) a su alcance.", "ok", privado=True)
    repartir_cola()
    return jsonify({"ok": True, "usuario": datos_usuario(cif)})


@app.get("/api/lugares")
def api_lugares():
    with lock:
        return jsonify({"ok": True, "lugares": [v.nombre for v in S["campus"].vertexs]})


def campus_publico():
    return {
        "mesh": {"vertices": [], "aristas": []},
        "campus": {
            **serializar(S["campus"]),
            "zonasSeguras": S["zonas"],
            "ubicacion": None,
            "ruta": None,
            "bloqueados": S["bloqueados"],
            "congestion": S["congestion"],
        },
        "ultimaAlerta": None,
        "historial": [],
    }


@app.get("/api/campus/publico")
def api_campus_publico():
    with lock:
        return jsonify({"ok": True, "estado": campus_publico()})


@app.get("/campus-offline.json")
def campus_offline():
    with lock:
        rutas = {v.nombre: obtener_ruta_campus(v.nombre)[0] for v in S["campus"].vertexs}
        respuesta = jsonify({"estado": campus_publico(), "rutas": rutas, "capturado": int(time.time())})
        respuesta.headers["Cache-Control"] = "no-store"
        return respuesta


@app.get("/api/yo")
def api_yo():
    u = usuario_sesion()
    with lock:
        if u is None:
            return jsonify({"ok": False, "sesion": False})
        if u["cif"] not in EN_LINEA:       # el servidor se reinició: vuelve a la red donde estaba
            conectar_usuario(u["cif"], u["lugar"])
            repartir_cola()
        return jsonify({"ok": True, "sesion": True, "usuario": datos_usuario(u["cif"])})


@app.post("/api/registro/disponible")
def api_registro_disponible():
    d = cuerpo_json()
    cif = leer_cif(d)
    if not re.fullmatch(r"[0-9A-Z-]{4,15}", cif) or cif == CIF_DEMO:
        return jsonify({"ok": False, "disponible": False, "mensaje": "Escribe un CIF válido (4 a 15 letras o números)."})
    with lock:
        if DB.usuario(cif):
            return jsonify({"ok": False, "disponible": False, "mensaje": "Ese CIF ya tiene cuenta. Inicia sesión."})
    return jsonify({"ok": True, "disponible": True})


@app.post("/api/registro")
def api_registro():
    d = cuerpo_json()
    cif = leer_cif(d)
    nombre = " ".join(str(d.get("nombre", "")).split())[:40]
    clave = str(d.get("contrasena", ""))[:64]
    if not re.fullmatch(r"[0-9A-Z-]{4,15}", cif) or cif == CIF_DEMO:
        return jsonify({"ok": False, "mensaje": "Escribe un CIF válido (4 a 15 letras o números)."})
    if len(nombre) < 2:
        return jsonify({"ok": False, "mensaje": "Escribe tu nombre."})
    if len(clave) < 6:
        return jsonify({"ok": False, "mensaje": "La contraseña debe tener al menos 6 caracteres."})
    hash_clave = generate_password_hash(clave)          # lento a propósito: fuera del candado
    with lock:
        if DB.total_usuarios() >= 500:
            return jsonify({"ok": False, "mensaje": "Límite de cuentas alcanzado en este servidor."})
        if DB.usuario(cif):
            return jsonify({"ok": False, "mensaje": "Ese CIF ya tiene cuenta. Inicia sesión."})
        telefono = nombre_telefono(cif, nombre)
        DB.crear_usuario(cif, nombre, hash_clave, telefono, LUGAR_INICIAL)
        registrar(f"Nueva cuenta: {nombre} ({telefono}).", "ok", privado=True)
        return abrir_sesion(cif, d.get("lugar"))


HASH_FICTICIO = generate_password_hash("unexuam-sin-cuenta")
INTENTOS = {}          # cif -> [marcas de tiempo de intentos recientes]
BUSQUEDAS = {}         # cif -> [marcas de tiempo de búsquedas de contacto]
MAX_ENTRADAS_RATE = 2000


def _purgar_rate(mapa, ahora_s, ventana=60):
    if len(mapa) > MAX_ENTRADAS_RATE:
        for k in list(mapa.keys()):
            activos = [t for t in mapa[k] if ahora_s - t < ventana]
            if activos:
                mapa[k] = activos
            else:
                mapa.pop(k, None)
        while len(mapa) > MAX_ENTRADAS_RATE:
            mapa.pop(next(iter(mapa)), None)


def bloqueado_por_intentos(cif):
    ahora_s = time.time()
    recientes = [t for t in INTENTOS.get(cif, []) if ahora_s - t < 60]
    if recientes:
        INTENTOS[cif] = recientes
    else:
        INTENTOS.pop(cif, None)
    return len(recientes) >= 8          # 8 fallos en un minuto: espera


def registrar_fallo(cif):
    ahora_s = time.time()
    _purgar_rate(INTENTOS, ahora_s)
    INTENTOS.setdefault(cif, []).append(ahora_s)


def limite_busquedas_excedido(cif):
    ahora_s = time.time()
    _purgar_rate(BUSQUEDAS, ahora_s)
    recientes = [t for t in BUSQUEDAS.get(cif, []) if ahora_s - t < 60]
    if len(recientes) >= 30:
        BUSQUEDAS[cif] = recientes
        return True
    recientes.append(ahora_s)
    BUSQUEDAS[cif] = recientes
    return False


@app.post("/api/login")
def api_login():
    d = cuerpo_json()
    cif = leer_cif(d)
    clave = str(d.get("contrasena", ""))[:64]
    if bloqueado_por_intentos(cif):
        return jsonify({"ok": False, "mensaje": "Demasiados intentos. Espera un minuto."})
    u = DB.usuario(cif)
    acceso_real = u is not None and cif != CIF_DEMO
    hash_ = u["hash"] if acceso_real else HASH_FICTICIO
    valida = check_password_hash(hash_, clave)
    if not acceso_real or not valida:
        registrar_fallo(cif)
        return jsonify({"ok": False, "mensaje": "CIF o contraseña incorrectos."})
    INTENTOS.pop(cif, None)
    with lock:
        return abrir_sesion(cif, d.get("lugar"))


@app.cli.command("crear-admin")
@click.argument("cif")
@click.argument("nombre")
def crear_admin(cif, nombre):
    cif = cif.strip().upper()
    nombre = " ".join(nombre.split())
    if not re.fullmatch(r"[0-9A-Z-]{4,15}", cif) or cif in {CIF_DEMO, CIF_TODOS}:
        raise click.ClickException("Usa un CIF institucional de 4 a 15 letras, números o guiones.")
    if not 2 <= len(nombre) <= 40:
        raise click.ClickException("Usa un nombre de 2 a 40 caracteres.")
    contrasena = click.prompt("Contraseña", hide_input=True, confirmation_prompt=True)
    if not 12 <= len(contrasena) <= 64:
        raise click.ClickException("Usa una contraseña de 12 a 64 caracteres.")
    hash_clave = generate_password_hash(contrasena)
    with lock:
        if DB.usuario(cif):
            raise click.ClickException("Ese CIF ya tiene una cuenta.")
        DB.crear_usuario(cif, nombre, hash_clave, nombre_telefono(cif, nombre), LUGAR_INICIAL, admin=True)
    click.echo(f"Cuenta de administrador creada para {cif}.")


def demo_habilitada():
    return os.environ.get("UNEXUAM_DISABLE_DEMO") != "1" and (
        app.testing or os.environ.get("UNEXUAM_ENABLE_DEMO") == "1"
    )


@app.get("/api/capacidades")
def api_capacidades():
    return jsonify({"ok": True, "demo": demo_habilitada()})


@app.post("/api/login/demo")
def api_login_demo():
    if not demo_habilitada():
        return jsonify({"ok": False, "mensaje": "El acceso demo está deshabilitado."}), 403
    with lock:
        if DB.usuario(CIF_DEMO) is None:
            DB.crear_usuario(CIF_DEMO, "Administrador", "!", "Tel-Admin", LUGAR_INICIAL, admin=True)
        return abrir_sesion(CIF_DEMO)


@app.post("/api/logout")
def api_logout():
    u = usuario_sesion()
    with lock:
        if u:
            desconectar_usuario(u["cif"])
            registrar(f"{u['nombre']} salió: su teléfono dejó la red (eliminarVertice).", privado=True)
    session.clear()
    return jsonify({"ok": True})


@app.post("/api/yo/lugar")
def api_mover():
    d = cuerpo_json()
    lugar = str(d.get("lugar", "")).strip()[:60]
    cif = session["cif"]
    with lock:
        if S["campus"].buscarVertice(lugar) is None:
            return jsonify({"ok": False, "mensaje": f"El lugar «{lugar}» no existe."})
        lugar = canonico(S["campus"], lugar)
        vecinos = conectar_usuario(cif, lugar)
        n = repartir_cola()
        extra = f" Salieron {n} mensaje(s) que estaban en cola." if n else ""
        fuente = "GPS: " if d.get("gps") else ""
        return jsonify({"ok": True, "usuario": datos_usuario(cif),
                        "mensaje": f"{fuente}estás en {lugar} · {len(vecinos)} teléfono(s) a tu alcance.{extra}"})


@app.post("/api/contactos/buscar")
def api_buscar_contacto():
    cif = leer_cif(cuerpo_json())
    yo = session["cif"]
    if limite_busquedas_excedido(yo):
        return jsonify({"ok": False, "mensaje": "Demasiadas búsquedas. Espera un minuto."}), 429
    with lock:
        u = DB.usuario(cif)
        if u is None or u["admin"] or cif in (yo, CIF_TODOS):
            return jsonify({"ok": False, "mensaje": "No hay nadie con ese CIF."})
        return jsonify({"ok": True, "contacto": ficha(cif, u, yo), "agregado": cif in DB.contactos_de(yo)})


@app.post("/api/contactos/agregar")
def api_agregar_contacto():
    cif = leer_cif(cuerpo_json())
    yo = session["cif"]
    with lock:
        u = DB.usuario(cif)
        if u is None or u["admin"] or cif in (yo, CIF_TODOS):
            return jsonify({"ok": False, "mensaje": "No hay nadie con ese CIF."})
        DB.agregar_contacto(yo, cif)
        return jsonify({"ok": True, "contacto": ficha(cif, u, yo), "mensaje": f"{u['nombre']} está en tus contactos."})


@app.route("/api/mensajes/general", methods=["GET", "POST"])
def api_mensajes_general():
    if request.method == "GET":
        with lock:
            todos = DB.usuarios()
            lista = DB.mensajes_generales()
            for m in lista:
                m["deNombre"] = todos[m["de"]]["nombre"] if m["de"] in todos else m["de"]
            return jsonify({"ok": True, "mensajes": lista})
    d = cuerpo_json()
    valor = d.get("texto")
    texto_msj = valor.strip() if isinstance(valor, str) else ""
    if not 1 <= len(texto_msj) <= 500:
        return jsonify({"ok": False, "mensaje": "Escribe entre 1 y 500 caracteres."})
    with lock:
        u = usuario_sesion()
        de = u["cif"] if u else "INVITADO"
        tel = u["telefono"] if u else "Tel-Visitante"
        nom = u["nombre"] if u else "Visitante UAM"
        m = entregar(de, CIF_TODOS, texto_msj, ruta=[tel, "Todos"], retardo=0.5)
        m["deNombre"] = nom
        return jsonify({"ok": True, "mensaje": "Difundido en el Canal General del campus.", "enviado": m})


@app.get("/api/mensajes")
def api_mensajes():
    cif = session["cif"]
    with lock:
        mios = DB.mensajes_de(cif)
        cifs = list(DB.contactos_de(cif))
        for m in mios:                         # quien te escribió aparece aunque no lo hayas agregado
            otro = m["para"] if m["de"] == cif else m["de"]
            if otro not in cifs:
                cifs.append(otro)
        todos = DB.usuarios()
        contactos = [ficha(c, todos[c], cif) for c in cifs if c in todos and c != CIF_TODOS]
        contactos.insert(0, {"cif": CIF_TODOS, "nombre": "Canal General · Campus", "telefono": "Mesh-Todos",
                             "enLinea": True, "lugar": f"{len(EN_LINEA)} en la red", "grupo": True})
        for m in mios:
            m["deNombre"] = todos[m["de"]]["nombre"] if m["de"] in todos else m["de"]
        return jsonify({"ok": True, "yo": datos_usuario(cif), "contactos": contactos, "mensajes": mios})


def entregar(de, para, texto_msj, tipo="texto", ruta=None, retardo=None, ident=None):
    """Guarda un mensaje: entregado si hay `ruta`; si no, queda en cola (DTN)."""
    ruta = list(ruta or [])
    m = {"id": ident or secrets.token_hex(8), "de": de, "para": para, "tipo": tipo, "texto": texto_msj,
         "fecha": time.strftime("%Y-%m-%dT%H:%M:%S"), "estado": "entregado" if ruta else "en cola",
         "ruta": ruta, "retardo": num(retardo) if ruta else None, "viaCola": False}
    DB.guardar_mensaje(m)
    if para != CIF_TODOS:
        DB.agregar_contacto(de, para)
    return m


@app.post("/api/mensajes/enviar")
def api_enviar():
    d = cuerpo_json()
    cif = session["cif"]
    para = leer_cif({"cif": d.get("para", "")})
    valor_mensaje = d.get("texto")
    texto_msj = valor_mensaje.strip() if isinstance(valor_mensaje, str) else ""
    with lock:
        if not 1 <= len(texto_msj) <= 500:
            return jsonify({"ok": False, "mensaje": "Escribe entre 1 y 500 caracteres."})
        yo = DB.usuario(cif)
        clave = d.get("idempotencia")
        ident = None
        if clave is not None:
            if not isinstance(clave, str) or re.fullmatch(r"[A-Za-z0-9_-]{16,64}", clave) is None:
                return jsonify({"ok": False, "mensaje": "Identificador de envío inválido."}), 400
            ident = hashlib.sha256(f"{cif}:{clave}".encode()).hexdigest()
            existente = DB.mensaje(ident)
            if existente:
                if existente["de"] != cif or existente["para"] != para or existente["texto"] != texto_msj:
                    return jsonify({"ok": False, "mensaje": "El identificador corresponde a otro envío."}), 409
                existente["deNombre"] = yo["nombre"]
                return jsonify({"ok": True, "mensaje": "Mensaje registrado.", "enviado": existente})
        if para == CIF_TODOS:
            # Canal General: difusión a toda la red del campus.
            m = entregar(cif, CIF_TODOS, texto_msj, ruta=[yo["telefono"], "Todos"], retardo=0.5, ident=ident)
            m["deNombre"] = yo["nombre"]
            registrar(f"{yo['nombre']} escribió en el Canal General.", "ok", privado=True)
            return jsonify({"ok": True, "mensaje": "Difundido en el Canal General del campus.", "enviado": m})
        if yo["admin"]:
            return jsonify({"ok": False, "mensaje": "El administrador escribe a todos por el Canal General."})
        destino = DB.usuario(para)
        if destino is None or para == cif or destino["admin"]:
            return jsonify({"ok": False, "mensaje": "Elige a quién enviarle el mensaje."})
        ruta, retardo = rutaMensaje(S["red"], yo["telefono"], destino["telefono"])
        m = entregar(cif, para, texto_msj, ruta=ruta, retardo=retardo, ident=ident)
        m["deNombre"] = yo["nombre"]
        if ruta:
            msj = f"Entregado en {len(ruta) - 1} salto(s), {num(retardo)} s de retardo."
        else:
            msj = "Sin camino en la red Mesh: el mensaje queda en cola y sale cuando aparezca uno."
        registrar(f"Mensaje {yo['telefono']} → {destino['telefono']}: {m['estado']}.", "ok" if ruta else "info", privado=True)
        return jsonify({"ok": True, "mensaje": msj, "enviado": m})


@app.post("/api/mensajes/alerta")
def api_alerta_red():
    """Alerta a la red: se propaga desde TU teléfono con BFS limitado por TTL (propagarAlerta)."""
    d = cuerpo_json()
    cif = session["cif"]
    ttl = numero(d, "ttl", 1, 10)
    texto_msj = str(d.get("texto", "")).strip()[:200] or "¡Emergencia! Necesito ayuda."
    with lock:
        yo = DB.usuario(cif)
        if ttl is None:
            return jsonify({"ok": False, "mensaje": "El alcance debe estar entre 1 y 10 saltos."})
        alcanzados = B["propagarAlerta"](S["red"], yo["telefono"], int(ttl))
        por_tel = {u["telefono"]: c for c, u in DB.usuarios().items() if c in EN_LINEA}
        avisados = []
        for tel, salto in alcanzados:
            otro = por_tel.get(tel)
            if otro and otro != cif:
                ruta, retardo = rutaMensaje(S["red"], yo["telefono"], tel)
                entregar(cif, otro, f"{texto_msj} · desde {yo['lugar']}", tipo="alerta", ruta=ruta, retardo=retardo)
                avisados.append(DB.usuario(otro)["nombre"])
        S["ultimaAlerta"] = {"origen": yo["telefono"], "ttl": int(ttl), "hora": time.strftime("%H:%M:%S"),
                             "alcanzados": [[c, int(s)] for c, s in alcanzados]}
        reenviaron = max(0, len(alcanzados) - 1)
        registrar(f"Alerta de {yo['nombre']} (TTL {int(ttl)}): {reenviaron} teléfono(s) la recibieron.", "ok")
        n = len(avisados)
        return jsonify({"ok": True, "alcanzados": S["ultimaAlerta"]["alcanzados"], "avisados": avisados,
                        "mensaje": f"Alerta propagada a {reenviaron} teléfono(s); {n} persona(s) la recibieron."})


# --- Dijkstra paso a paso (grafo 2D) -----------------------------------------

@app.route("/api/algoritmo", methods=["GET", "POST"])
def api_algoritmo():
    d = cuerpo_json()
    origen = str(d.get("origen") or request.args.get("origen") or "C-101").strip()[:60]
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
        if cual in ("campus", "ambos"):
            reiniciar_campus()
            guardar_campus_compartido()
        reiniciar_mesh()          # también tras cambiar el campus: los enlaces dependen de las distancias
        if cual == "ambos":
            DB.finalizar_emergencia()
        nombres = {"mesh": "la red Mesh", "campus": "el campus", "ambos": "los dos grafos"}
        return responder(True, f"Se reinició {nombres[cual]}.")


EMERGENCIAS_DEF = {
    "sismo": ("Sismo / Temblor", "Agáchate, cúbrete y al terminar evacúa hacia el punto seguro más cercano."),
    "incendio": ("Incendio en el campus", "Evacúa rápido y agachado si hay humo. No uses elevadores."),
    "inundacion": ("Inundación / Tormenta", "Aléjate de drenajes y parqueos bajos. Sube a piso 2 o 3 si es necesario."),
    "general": ("Emergencia en el campus", "Sigue tu ruta de evacuación hacia el punto seguro más cercano."),
}


@app.post("/api/emergencia/declarar")
def api_declarar_emergencia():
    d = cuerpo_json()
    tipo = str(d.get("tipo", "general")).strip().lower()
    if tipo not in EMERGENCIAS_DEF:
        tipo = "general"
    titulo_def, texto_def = EMERGENCIAS_DEF[tipo]
    texto_em = texto(d, "texto", 200) or texto_def
    with lock:
        DB.guardar_emergencia({
            "id": secrets.token_hex(6),
            "tipo": tipo,
            "titulo": titulo_def,
            "texto": texto_em,
            "hora": time.strftime("%H:%M:%S"),
        })
        return responder(True, f"Emergencia declarada: {titulo_def}.")


@app.post("/api/emergencia/finalizar")
def api_finalizar_emergencia():
    with lock:
        incidente = cuerpo_json().get("incidente")
        if not DB.finalizar_emergencia(incidente):
            return responder(False, "La emergencia activa cambió. Actualiza e inténtalo de nuevo.")
        S["ultimaAlerta"] = None
        return responder(True, "Emergencia finalizada. El campus vuelve a estar en calma.")


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
    # Consulta O(1) sobre la tabla precalculada; solo se recalcula si hubo bloqueo o congestión.
    d = cuerpo_json()
    lugar = texto(d, "lugar", 60)
    with lock:
        if not existe(S["campus"], lugar):
            return jsonify({"ok": False, "mensaje": f"El lugar «{lugar}» no existe.", "ruta": None})
        res, precalc = obtener_ruta_campus(lugar)
        return jsonify({"ok": True, "mensaje": "", "precalculada": precalc, "ruta": res})


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


def tramos_bloqueables(origen, destino, ambos):
    g = S["campus"]
    pares = {(origen, destino)}
    if ambos:
        pares.add((destino, origen))
    return [(v.nombre, w.nombre, peso) for v in g.vertexs for w, peso in v.neig
            if (v.nombre, w.nombre) in pares]


def bloquear_tramos(tramos):
    for origen, destino, peso in tramos:
        S["campus"].eliminarArista(origen, destino)
        S["bloqueados"].append({"origen": origen, "destino": destino, "peso": peso})
    invalidar_rutas()
    guardar_campus_compartido()
    return "Pasillo bloqueado: " + ", ".join(f"{o} → {d}" for o, d, _ in tramos) + "."


@app.post("/api/campus/bloquear")
def api_bloquear():
    d = cuerpo_json()
    o, dst, ambos = texto(d, "origen"), texto(d, "destino"), d.get("ambos", True) is not False
    with lock:
        tramos = tramos_bloqueables(o, dst, ambos)
        if not tramos:
            return responder(False, f"No existe el paso {o} → {dst}.")
        usuario = usuario_sesion()
        if usuario["admin"]:
            return responder(True, bloquear_tramos(tramos))
        ident = secrets.token_hex(12)
        DB.crear_reporte_bloqueo({"id": ident, "autor": usuario["cif"], "origen": o, "destino": dst,
                                "ambos": ambos, "creado": int(time.time())})
        return responder(True, "Reporte enviado. Pendiente de revisión.", pendiente=True, reporte=ident)


@app.post("/api/campus/reportes/resolver")
def api_resolver_reporte_bloqueo():
    d = cuerpo_json()
    ident, decision = texto(d, "id"), d.get("decision")
    if decision not in ("aprobar", "descartar"):
        return jsonify({"ok": False, "mensaje": "Elige aprobar o descartar."}), 400
    ahora = int(time.time())
    with lock:
        reporte = DB.reporte_bloqueo(ident, ahora - 3600)
        if not reporte:
            return responder(False, "El reporte ya no está pendiente.")
        mensaje = "Reporte descartado."
        if decision == "aprobar":
            tramos = tramos_bloqueables(reporte["origen"], reporte["destino"], reporte["ambos"])
            mensaje = bloquear_tramos(tramos) if tramos else "El tramo del reporte ya no está disponible."
        DB.resolver_reporte_bloqueo(ident, ahora)
        return responder(True, mensaje)


@app.post("/api/campus/desbloquear")
def api_desbloquear():
    with lock:
        g = S["campus"]
        n = 0
        for b in S["bloqueados"]:
            peso = b["peso"] * S["congestion"].get(b["destino"], 1)
            if g.insertarArista(b["origen"], b["destino"], peso):
                n += 1
        S["bloqueados"] = []
        if not S["congestion"]:
            precalcular_rutas()
        else:
            invalidar_rutas()
        guardar_campus_compartido()
        return responder(True, f"Se reabrieron {n} pasos con su tiempo original.")


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
        acumulado = S["congestion"].get(lugar, 1) * factor
        if not 0.1 <= acumulado <= 100:
            return responder(False, "Esa congestión ya llegó a su límite (entre ×0.1 y ×100).")
        if not B["aplicarAlerta"](S["campus"], lugar, factor):
            return responder(False, f"No se pudo aplicar congestión en «{lugar}».")
        S["congestion"][lugar] = round(S["congestion"].get(lugar, 1) * factor, 3)
        invalidar_rutas()
        guardar_campus_compartido()
        return responder(True, f"{lugar}: congestión aplicada (tiempos ×{factor:g}).")


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
            if grafo == "campus":
                invalidar_rutas()
                guardar_campus_compartido()
            return responder(True, f"Vértice «{nombre}» agregado en {grafo}.")
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
                invalidar_rutas()
                guardar_campus_compartido()
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
                    return responder(False, f"No se pudo agregar {o} → {dst}: falta algún vértice.")
                if grafo == "campus":
                    invalidar_rutas()
                    guardar_campus_compartido()
                return responder(True, f"Arista {o} → {dst} (peso {peso:g}) agregada en {grafo}.")
            if not g.actualizarPeso(o, dst, peso):
                return responder(False, f"No existe la arista {o} → {dst}.")
            if grafo == "campus":
                invalidar_rutas()
                guardar_campus_compartido()
            return responder(True, f"Peso de {o} → {dst} actualizado a {peso:g}.")
        if accion == "eliminar":
            if not g.eliminarArista(o, dst):
                return responder(False, f"No existe la arista {o} → {dst}.")
            if grafo == "campus":
                invalidar_rutas()
                guardar_campus_compartido()
            return responder(True, f"Arista {o} → {dst} eliminada de {grafo}.")
        return responder(False, "Acción no válida.")


# ----------------------------------------------------------------------------

if __name__ == "__main__":
    try:
        sys.stdout.reconfigure(errors="replace")  # consolas de Windows sin UTF-8
    except AttributeError:
        pass
    puerto = int(os.environ.get("PORT", "5000"))
    cert = os.environ.get("UNEXUAM_TLS_CERT")
    clave = os.environ.get("UNEXUAM_TLS_KEY")
    if bool(cert) != bool(clave):
        raise SystemExit("Configura UNEXUAM_TLS_CERT y UNEXUAM_TLS_KEY juntos.")
    if cert and clave:
        app.run(host="0.0.0.0", port=int(os.environ.get("PORT_HTTPS", "5443")),
                ssl_context=(cert, clave), debug=False, threaded=True)
    else:
        app.run(host="127.0.0.1", port=puerto, debug=False, threaded=True)
