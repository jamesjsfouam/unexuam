"""
Servidor web de Unexuam, sistema de evacuación Off-Grid (frontend del proyecto).

Uso:
    pip install flask cryptography
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
    S["emergencia"] = None
    for cif in list(EN_LINEA):                  # los usuarios conectados vuelven a la red
        conectar_usuario(cif, DB.usuario(cif)["lugar"])


def reiniciar_campus():
    campus, zonas = crear_campus()
    S["campus"] = campus
    S["zonas"] = list(zonas)
    S["ubicacion"] = None
    S["bloqueados"] = []       # [{origen, destino, peso}] para poder restaurarlos
    S["congestion"] = {}       # lugar -> factor acumulado


def registrar(texto, tipo="info", privado=False):
    S["historial"].insert(0, {"hora": time.strftime("%H:%M:%S"), "texto": texto, "tipo": tipo, "privado": privado})
    del S["historial"][60:]


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
        "emergencia": S.get("emergencia"),
        "historial": historial_visible(),
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

LIBRES = {"/api/yo", "/api/login", "/api/login/demo", "/api/registro", "/api/lugares", "/api/campus/publico", "/api/campus/ruta"}
# Reportar un pasillo bloqueado (/api/campus/bloquear) es una función de emergencia para todos;
# reabrir, congestionar, reiniciar y editar los grafos es solo del administrador.
SOLO_ADMIN = ("/api/reiniciar", "/api/mesh/vertice", "/api/mesh/arista", "/api/mesh/alerta",
              "/api/campus/vertice", "/api/campus/arista", "/api/campus/ubicacion",
              "/api/campus/desbloquear", "/api/campus/congestionar", "/api/algoritmo",
              "/api/emergencia/declarar", "/api/emergencia/finalizar")
LUGAR_INICIAL = "Edificio E"      # lugar por defecto al entrar (luego el GPS o la persona lo cambia)
CIF_DEMO = "ADMIN"
CIF_TODOS = "TODOS"     # Canal General: un "usuario" especial que representa a todo el campus


def usuario_sesion():
    cif = session.get("cif")
    return DB.usuario(cif) if cif else None


@app.before_request
def exigir_sesion():
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


@app.get("/api/campus/publico")
def api_campus_publico():
    with lock:
        return jsonify({
            "ok": True,
            "estado": {
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
            },
        })


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
    hash_ = u["hash"] if u and not u["admin"] else HASH_FICTICIO
    valida = check_password_hash(hash_, clave)            # mismo tiempo exista o no el CIF
    if u is None or u["admin"] or not valida:
        registrar_fallo(cif)
        return jsonify({"ok": False, "mensaje": "CIF o contraseña incorrectos."})
    INTENTOS.pop(cif, None)
    with lock:
        return abrir_sesion(cif, d.get("lugar"))


@app.post("/api/login/demo")
def api_login_demo():
    # Deshabilitado por defecto en producción; solo activo en pruebas o si UNEXUAM_ENABLE_DEMO=1.
    deshabilitado = os.environ.get("UNEXUAM_DISABLE_DEMO") == "1"
    habilitado = app.testing or os.environ.get("UNEXUAM_ENABLE_DEMO") == "1"
    if deshabilitado or not habilitado:
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


def entregar(de, para, texto_msj, tipo="texto", ruta=None, retardo=None):
    """Guarda un mensaje: entregado si hay `ruta`; si no, queda en cola (DTN)."""
    ruta = list(ruta or [])
    m = {"id": secrets.token_hex(8), "de": de, "para": para, "tipo": tipo, "texto": texto_msj,
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
    texto_msj = str(d.get("texto", "")).strip()[:500]
    with lock:
        if not texto_msj:
            return jsonify({"ok": False, "mensaje": "El mensaje está vacío."})
        yo = DB.usuario(cif)
        if para == CIF_TODOS:
            # Canal General: difusión a toda la red del campus.
            m = entregar(cif, CIF_TODOS, texto_msj, ruta=[yo["telefono"], "Todos"], retardo=0.5)
            m["deNombre"] = yo["nombre"]
            registrar(f"{yo['nombre']} escribió en el Canal General.", "ok", privado=True)
            return jsonify({"ok": True, "mensaje": "Difundido en el Canal General del campus.", "enviado": m})
        if yo["admin"]:
            return jsonify({"ok": False, "mensaje": "El administrador escribe a todos por el Canal General."})
        destino = DB.usuario(para)
        if destino is None or para == cif or destino["admin"]:
            return jsonify({"ok": False, "mensaje": "Elige a quién enviarle el mensaje."})
        ruta, retardo = rutaMensaje(S["red"], yo["telefono"], destino["telefono"])
        m = entregar(cif, para, texto_msj, ruta=ruta, retardo=retardo)
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
        reiniciar_mesh()          # también tras cambiar el campus: los enlaces dependen de las distancias
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
        S["emergencia"] = {
            "id": secrets.token_hex(6),
            "tipo": tipo,
            "titulo": titulo_def,
            "texto": texto_em,
            "hora": time.strftime("%H:%M:%S"),
        }
        return responder(True, f"Emergencia declarada: {titulo_def}.")


@app.post("/api/emergencia/finalizar")
def api_finalizar_emergencia():
    with lock:
        ubic = S.get("ubicacion")
        reiniciar_campus()
        S["ubicacion"] = ubic
        S["ultimaAlerta"] = None
        S["emergencia"] = None
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
    o, dst, ambos = texto(d, "origen"), texto(d, "destino"), d.get("ambos", True) is not False
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
        return responder(True, "Pasillo bloqueado: " + ", ".join(quitadas) + ".")


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
                return responder(True, f"Arista {o} → {dst} (peso {peso:g}) agregada en {grafo}.")
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


def certificado_local(ip):
    """Crea (una sola vez) un certificado autofirmado para servir HTTPS en la red local.
    El GPS del navegador solo funciona en páginas seguras (https)."""
    cert, clave = ruta_datos("unexuam-cert.pem"), ruta_datos("unexuam-clave.pem")
    marca = ruta_datos("unexuam-cert.ip")
    if os.path.exists(cert) and os.path.exists(clave) and os.path.exists(marca):
        with open(marca, encoding="utf-8") as f:
            if f.read().strip() == ip:
                return cert, clave
    try:
        import datetime
        import ipaddress
        from cryptography import x509
        from cryptography.hazmat.primitives import hashes, serialization
        from cryptography.hazmat.primitives.asymmetric import rsa
        from cryptography.x509.oid import NameOID
    except ImportError:
        return None
    k = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    nombre = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "Unexuam")])
    alt = [x509.DNSName("localhost"), x509.IPAddress(ipaddress.ip_address("127.0.0.1"))]
    if ip != "127.0.0.1":
        alt.append(x509.IPAddress(ipaddress.ip_address(ip)))
    ahora_utc = datetime.datetime.now(datetime.timezone.utc)
    c = (x509.CertificateBuilder().subject_name(nombre).issuer_name(nombre).public_key(k.public_key())
         .serial_number(x509.random_serial_number()).not_valid_before(ahora_utc - datetime.timedelta(days=1))
         .not_valid_after(ahora_utc + datetime.timedelta(days=825))
         .add_extension(x509.SubjectAlternativeName(alt), critical=False).sign(k, hashes.SHA256()))
    for ruta_f, datos_f in ((clave, k.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.TraditionalOpenSSL,
                                                    serialization.NoEncryption())),
                            (cert, c.public_bytes(serialization.Encoding.PEM))):
        with open(ruta_f + ".tmp", "wb") as f:
            f.write(datos_f)
        os.replace(ruta_f + ".tmp", ruta_f)
        if ruta_f == clave and os.name == "posix":
            os.chmod(ruta_f, 0o600)
    with open(marca, "w", encoding="utf-8") as f:
        f.write(ip)
    return cert, clave


if __name__ == "__main__":
    try:
        sys.stdout.reconfigure(errors="replace")  # consolas de Windows sin UTF-8
    except AttributeError:
        pass
    puerto = int(os.environ.get("PORT", "5000"))
    puerto_https = int(os.environ.get("PORT_HTTPS", "5443"))
    ip = ip_local()
    print("=" * 64)
    print(" Unexuam · Evacuación Off-Grid")
    print(f" En este PC:        http://127.0.0.1:{puerto}")
    print(f" Desde el teléfono: http://{ip}:{puerto}  (misma Wi-Fi)")
    par = certificado_local(ip)
    if par:
        from werkzeug.serving import make_server
        try:
            segura = make_server("0.0.0.0", puerto_https, app, threaded=True, ssl_context=par)
            threading.Thread(target=segura.serve_forever, daemon=True).start()
            print(f" Con GPS (https):   https://{ip}:{puerto_https}  (acepta el aviso del certificado)")
        except OSError as e:
            print(f" No se pudo abrir https en el puerto {puerto_https}: {e}")
    else:
        print(" Para usar el GPS instala 'cryptography' (pip install cryptography): activa https.")
    print("=" * 64)
    app.run(host="0.0.0.0", port=puerto, debug=False, threaded=True)
