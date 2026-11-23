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

import math
import socket
import sys
import threading
import time

from flask import Flask, jsonify, render_template, request
from werkzeug.exceptions import HTTPException

from backend.datos import crearCampus, crearRedMesh
from backend.evacuacion import aplicarAlerta, rutaEvacuacion
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

lock = threading.Lock()
S = {}


def reiniciar_mesh():
    S["red"] = crear_red_mesh()
    S["ultimaAlerta"] = None


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
    if mensaje:
        registrar(mensaje, "ok" if ok else "error")
    return jsonify({"ok": ok, "mensaje": mensaje, "estado": estado(), **extra})


def grafo_por_nombre(nombre):
    return {"mesh": S["red"], "campus": S["campus"]}.get(nombre)


def texto(d, clave):
    return str(d.get(clave, "")).strip()[:40]


def numero(d, clave, minimo, maximo):
    try:
        x = float(d.get(clave))
    except (TypeError, ValueError):
        return None
    if math.isnan(x) or x < minimo or x > maximo:
        return None
    return x


def existe(g, nombre):
    return any(v.nombre == nombre for v in g.vertexs)


@app.errorhandler(Exception)
def error_backend(e):
    # Un error inesperado no debe tumbar la app: se responde con el mensaje.
    if isinstance(e, HTTPException):
        return jsonify({"ok": False, "mensaje": e.description}), e.code
    with lock:
        return responder(False, f"El backend falló: {type(e).__name__}: {e}"), 500


# ----------------------------------------------------------------------------
# Rutas
# ----------------------------------------------------------------------------

@app.get("/")
def index():
    return render_template("index.html")


@app.get("/api/estado")
def api_estado():
    with lock:
        return jsonify({"ok": True, "mensaje": "", "estado": estado()})


@app.post("/api/reiniciar")
def api_reiniciar():
    d = request.get_json(silent=True) or {}
    cual = d.get("grafo", "ambos")
    with lock:
        if cual in ("mesh", "ambos"):
            reiniciar_mesh()
        if cual in ("campus", "ambos"):
            reiniciar_campus()
        nombres = {"mesh": "la red Mesh", "campus": "el campus", "ambos": "los dos grafos"}
        return responder(True, f"Se reinició {nombres.get(cual, 'los dos grafos')}.")


# --- Capa 1: red Mesh --------------------------------------------------------

@app.post("/api/mesh/alerta")
def api_alerta():
    d = request.get_json(silent=True) or {}
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
    d = request.get_json(silent=True) or {}
    lugar = str(d.get("lugar", "")).strip()[:60]
    with lock:
        if not existe(S["campus"], lugar):
            return jsonify({"ok": False, "mensaje": f"El lugar «{lugar}» no existe.", "ruta": None})
        ruta, tiempo = B["rutaEvacuacion"](S["campus"], lugar, S["zonas"])
        return jsonify({"ok": True, "mensaje": "",
                        "ruta": {"origen": lugar, "ruta": list(ruta), "tiempo": num(tiempo)}})


@app.post("/api/campus/ubicacion")
def api_ubicacion():
    d = request.get_json(silent=True) or {}
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
    d = request.get_json(silent=True) or {}
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
    d = request.get_json(silent=True) or {}
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
    d = request.get_json(silent=True) or {}
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
            if not g.eliminarVertice(nombre):
                return responder(False, f"«{nombre}» no existe.")
            if grafo == "campus":
                S["zonas"] = [z for z in S["zonas"] if z != nombre]
                S["bloqueados"] = [b for b in S["bloqueados"] if nombre not in (b["origen"], b["destino"])]
                S["congestion"].pop(nombre, None)
                if S["ubicacion"] == nombre:
                    S["ubicacion"] = None
            return responder(True, f"Vértice «{nombre}» eliminado de {grafo} (y sus aristas entrantes).")
        return responder(False, "Acción no válida.")


@app.post("/api/<grafo>/arista")
def api_arista(grafo):
    d = request.get_json(silent=True) or {}
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
    puerto = 5000
    print("=" * 60)
    print(" Unexuam · Evacuación Off-Grid")
    print(f" En este PC:        http://127.0.0.1:{puerto}")
    print(f" Desde el teléfono: http://{ip_local()}:{puerto}  (misma Wi-Fi)")
    print("=" * 60)
    app.run(host="0.0.0.0", port=puerto, debug=False, threaded=True)
