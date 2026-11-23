"""
################################################################################
#                                                                              #
#   STUB TEMPORAL DEL BACKEND  ·  NO ES LA LÓGICA ENTREGABLE DEL PROYECTO      #
#                                                                              #
#   Este archivo solo existe para que el frontend se pueda probar mientras     #
#   `backend/` (escrito a mano por James) no está listo o está incompleto.     #
#                                                                              #
#   - Imita la interfaz de docs/CONTRATO.md con datos falsos mínimos.          #
#   - app.py usa cada función REAL de `backend/` si existe y solo cae aquí     #
#     cuando falta. La pantalla de Inicio dice qué piezas son reales y cuáles  #
#     vienen de este stub.                                                     #
#   - Nada de este archivo se presenta ni se evalúa como parte del backend.    #
#                                                                              #
################################################################################
"""

from collections import deque
import heapq

INF = float("inf")


# --- Graph mínimo (solo para que el frontend tenga algo que dibujar) ----------

class Vertex:
    def __init__(self, city):
        self.city = city
        self.neig = []


class Graph:
    def __init__(self):
        self.vertexs = []

    def buscarVertice(self, city):
        return next((v for v in self.vertexs if v.city.lower() == city.lower()), None)

    def insertarVertice(self, city):
        if self.buscarVertice(city):
            return False
        self.vertexs.append(Vertex(city))
        return True

    def insertarArista(self, origen, destino, peso):
        a, b = self.buscarVertice(origen), self.buscarVertice(destino)
        if not a or not b:
            return False
        a.neig.append((b, peso))
        return True

    def eliminarArista(self, origen, destino):
        a, b = self.buscarVertice(origen), self.buscarVertice(destino)
        if not a or not b:
            return False
        for t in a.neig:
            if t[0] is b:
                a.neig.remove(t)
                return True
        return False

    def eliminarVertice(self, city):
        v = self.buscarVertice(city)
        if not v:
            return False
        for u in self.vertexs:
            u.neig = [t for t in u.neig if t[0] is not v]
        v.neig = []
        self.vertexs.remove(v)
        return True

    def actualizarPeso(self, origen, destino, peso):
        a, b = self.buscarVertice(origen), self.buscarVertice(destino)
        if not a or not b:
            return False
        for i, t in enumerate(a.neig):
            if t[0] is b:
                a.neig[i] = (b, peso)
                return True
        return False


# --- Algoritmos de relleno (James escribe los de verdad en backend/) ----------

def propagarAlerta(red, origen, ttl):
    v0 = red.buscarVertice(origen)
    if not v0:
        return []
    out, seen, q = [], {id(v0)}, deque([(v0, 0)])
    while q:
        v, s = q.popleft()
        out.append((v.city, s))
        if s >= ttl:
            continue
        for w, _ in v.neig:
            if id(w) not in seen:
                seen.add(id(w))
                q.append((w, s + 1))
    return out


def dijkstra(campus, origen):
    dist = {v.city: INF for v in campus.vertexs}
    prev = {v.city: None for v in campus.vertexs}
    v0 = campus.buscarVertice(origen)
    if not v0:
        return dist, prev
    dist[v0.city] = 0.0
    pq = [(0.0, v0.city)]
    por_nombre = {v.city: v for v in campus.vertexs}
    while pq:
        d, c = heapq.heappop(pq)
        if d > dist[c]:
            continue
        for w, p in por_nombre[c].neig:
            if d + p < dist[w.city]:
                dist[w.city], prev[w.city] = d + p, c
                heapq.heappush(pq, (d + p, w.city))
    return dist, prev


def rutaMasCorta(campus, origen, destino):
    dist, prev = dijkstra(campus, origen)
    if dist.get(destino, INF) == INF:
        return [], INF
    ruta, c = [], destino
    while c is not None:
        ruta.insert(0, c)
        c = prev[c]
    return ruta, dist[destino]


def rutaEvacuacion(campus, origen, zonasSeguras):
    mejor = ([], INF)
    for z in zonasSeguras:
        r = rutaMasCorta(campus, origen, z)
        if r[1] < mejor[1]:
            mejor = r
    return mejor


def aplicarAlerta(campus, lugar, factor):
    v = campus.buscarVertice(lugar)
    if not v:
        return False
    for u in campus.vertexs:
        u.neig = [(w, p * factor if w is v else p) for w, p in u.neig]
    return True


# --- Datos falsos mínimos -----------------------------------------------------

def crearCampus(GraphCls=Graph):
    g = GraphCls()
    lugares = [
        "Aula 101", "Aula 102", "Aula 201", "Aula 202", "Biblioteca", "Cafetería",
        "Pasillo A", "Pasillo B", "Escalera Norte", "Escalera Sur",
        "Salida Principal", "Salida Este", "Zona Segura Cancha", "Zona Segura Parqueo",
    ]
    for l in lugares:
        g.insertarVertice(l)

    def doble(a, b, p, q=None):
        g.insertarArista(a, b, p)
        g.insertarArista(b, a, q if q is not None else p)

    doble("Aula 101", "Pasillo A", 10)
    doble("Aula 102", "Pasillo A", 12)
    doble("Cafetería", "Pasillo A", 15)
    doble("Aula 201", "Pasillo B", 10)
    doble("Aula 202", "Pasillo B", 14)
    doble("Biblioteca", "Pasillo B", 18)
    doble("Pasillo B", "Escalera Norte", 8)
    doble("Pasillo B", "Escalera Sur", 20)
    doble("Escalera Norte", "Pasillo A", 15, 25)  # bajar es más rápido que subir
    doble("Escalera Sur", "Salida Este", 22, 30)
    doble("Pasillo A", "Salida Principal", 12)
    doble("Pasillo A", "Salida Este", 40)
    g.insertarArista("Salida Principal", "Zona Segura Cancha", 20)
    g.insertarArista("Salida Este", "Zona Segura Parqueo", 25)
    g.insertarArista("Salida Principal", "Zona Segura Parqueo", 60)
    return g, ["Zona Segura Cancha", "Zona Segura Parqueo"]


def crearRedMesh(GraphCls=Graph):
    g = GraphCls()
    tels = ["Tel-Ana", "Tel-Luis", "Tel-Sofía", "Tel-Carlos",
            "Tel-María", "Tel-Pedro", "Tel-Valeria", "Tel-Diego"]
    for t in tels:
        g.insertarVertice(t)
    enlaces = [
        ("Tel-Ana", "Tel-Luis", 1.2), ("Tel-Luis", "Tel-Ana", 1.2),
        ("Tel-Ana", "Tel-Sofía", 0.8), ("Tel-Sofía", "Tel-Ana", 0.9),
        ("Tel-Luis", "Tel-Carlos", 2.0), ("Tel-Carlos", "Tel-Luis", 2.1),
        ("Tel-Sofía", "Tel-María", 1.5), ("Tel-María", "Tel-Sofía", 1.4),
        ("Tel-Carlos", "Tel-Pedro", 2.5),
        ("Tel-María", "Tel-Pedro", 1.1), ("Tel-Pedro", "Tel-María", 1.0),
        ("Tel-Pedro", "Tel-Valeria", 3.0),
        ("Tel-Valeria", "Tel-Diego", 2.2),
    ]
    for a, b, p in enlaces:
        g.insertarArista(a, b, p)
    return g
