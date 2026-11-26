"""
Verifica los caminos exteriores del grafo del campus contra el plano real (OpenStreetMap).

Para cada camino exterior de backend/datos.py (entre lugares con posición en
frontend/static/campus-plano.json):
  - mide la distancia a pie REAL rodeando los edificios (rejilla de 1 m, 8 vecinos) sin salir del
    campus. TODO edificio es obstáculo (Jaguar Center, Clínicas, salones, comedor...) salvo los de
    TRANSITABLES: techos de carport sobre un parqueo y comedores / kioskos / Food Court abiertos;
  - avisa si la línea recta atraviesa un edificio cerrado, si el peso no corresponde a esa
    distancia y si el camino obliga a un gran rodeo;
  - lista el grado (número de caminos) de cada lugar y propone vecinos que se ven en línea
    recta, están cerca y no están unidos.

Uso:  python verificar_caminos.py            (informe en consola)
      python verificar_caminos.py --json     (además escribe verificacion-caminos.json)
      python verificar_caminos.py --app      (escribe frontend/static/campus-rutas.json: trazado e indicaciones
                                              giro a giro de cada camino, para dibujar las rutas en la app)
      python verificar_caminos.py --aplicar-pesos (pone en backend/datos.py el tiempo real de cada camino)
      python verificar_caminos.py --diagrama (dibuja zonas-caminables.svg con los caminos por su trazado
                                              real y guarda zonas-caminables.json y caminos-reales.json)

Datos del plano © OpenStreetMap contributors (ODbL).
"""

import heapq
import json
import math
import re
import sys
from pathlib import Path

AQUI = Path(__file__).parent
RAIZ = AQUI.parent.parent
sys.path.insert(0, str(RAIZ))
from backend.datos import crearCampus  # noqa: E402

PASARELA = (163.5, 277.0, 116.9, 120.1)   # x0, x1, y0, y1 (m): igual que PASARELA en generar_mapa.py

VELOCIDAD = 1.2        # m/s caminando rápido en una evacuación (igual que generar_grafo.py)
CELDA = 1.0            # m por celda de la rejilla
TOLERANCIA = 0.35      # peso aceptable: ±35 % del tiempo a pie real (mínimo ±8 s)
RODEO_MAX = 1.6        # más que esto sobre la línea recta: el camino da un gran rodeo
VECINO_MAX = 45        # m: lugares más cerca que esto, a la vista y sin camino, son candidatos

# Lo único construido que se puede atravesar caminando (id de OSM -> motivo). Todo lo demás,
# incluidos los techos sin paredes como el Jaguar Center, es obstáculo.
TRANSITABLES = {
    "730964043": "pasillo elevado B–E del 2.º piso: la pasarela B pasa por debajo",
    "1334322230": "techo de carport sobre el parqueo este",
    "1334322231": "techo de carport sobre el parqueo este",
    "1334322232": "techo de carport sobre el parqueo este",
    "1334322233": "techo de carport sobre el parqueo este",
    "1334322234": "techo de carport sobre el parqueo este",
    # Comedores y kioskos abiertos: mesas bajo techo (confirmado por James, 25/11/2026)
    "1553720157": "Comedor del Jaguarcito (mesas bajo techo)",
    "1553720162": "El Chilamate (mesas bajo techo)",
    "1553720158": "Kiosko del Jaguarcito",
    "1553720156": "Kioskos de comida (Chilamate)",
    "527270723": "Food Court (mesas)",
}

OSM = json.loads((AQUI / "campus-osm.json").read_text(encoding="utf-8"))
PLANO = json.loads((RAIZ / "frontend" / "static" / "campus-plano.json").read_text(encoding="utf-8"))
POS = {k: tuple(v) for k, v in PLANO["posiciones"].items()}


def dentro(p, pol):
    x, y = p
    c = False
    for i in range(len(pol)):
        x1, y1 = pol[i]
        x2, y2 = pol[(i + 1) % len(pol)]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            c = not c
    return c


def cerrado(e):
    return e["id"] not in TRANSITABLES


OBSTACULOS = [e for e in OSM["edificios"] if cerrado(e)]
# Obstáculos que no están en OSM (señalados por James sobre la foto satelital, 26/11/2026)
OBSTACULOS += [
    {"id": "laguna-food", "nombre": "Laguna junto al Food Court",
     "pol": [[228, 110], [240, 98.5], [244, 101], [244, 116.5], [226, 116.5]]},
]


def propios(nombre):
    """Edificios del propio lugar: el que lo contiene, el de su mismo nombre y, para las salidas
    y la pasarela de B, C y P, ese edificio (están sobre su contorno)."""
    ids = {e["id"] for e in OBSTACULOS if dentro(POS[nombre], e["pol"])}
    m = re.match(r"^([BCP]) Salida|^Pasarela Edificio ([BCP])", nombre)
    letra = m and (m.group(1) or m.group(2))
    for e in OBSTACULOS:
        if e["nombre"] and (e["nombre"] == nombre or (letra and e["nombre"] == f"Edificio {letra}")):
            ids.add(e["id"])
    # y el edificio que ocupa la celda del propio punto (p. ej. la salida este del C, pegada al A)
    if "BLOQUEO" in globals():
        ocup = BLOQUEO.get(celda(POS[nombre]))
        if ocup and ocup != "fuera":
            ids.add(ocup)
    return ids


# ---------------------------------------------------------------- rejilla de obstáculos
XS = [p[0] for p in PLANO["campus"]]
YS = [p[1] for p in PLANO["campus"]]
X0, Y0 = min(XS) - 10, min(YS) - 10
NX, NY = int((max(XS) - X0 + 10) / CELDA) + 1, int((max(YS) - Y0 + 10) / CELDA) + 1


def celda(p):
    return (min(NX - 1, max(0, int((p[0] - X0) / CELDA))), min(NY - 1, max(0, int((p[1] - Y0) / CELDA))))


BLOQUEO = {}           # celda -> id del edificio que la ocupa
for e in OBSTACULOS:
    bx0, by0 = celda((min(q[0] for q in e["pol"]), min(q[1] for q in e["pol"])))
    bx1, by1 = celda((max(q[0] for q in e["pol"]), max(q[1] for q in e["pol"])))
    for i in range(bx0, bx1 + 1):
        for j in range(by0, by1 + 1):
            # conservador: la celda se bloquea si el edificio cubre su centro o cualquiera de sus esquinas
            # (dos edificios pegados, como el A y el B, no dejan una rendija de 0 m entre ellos)
            if any(dentro((X0 + (i + fx) * CELDA, Y0 + (j + fy) * CELDA), e["pol"])
                   for fx, fy in ((.5, .5), (.05, .05), (.95, .05), (.05, .95), (.95, .95))):
                BLOQUEO.setdefault((i, j), e["id"])

# Fuera del campus tampoco se camina (la ruta no puede salir a las calles vecinas).
for i in range(NX):
    for j in range(NY):
        if (i, j) not in BLOQUEO and not dentro((X0 + (i + .5) * CELDA, Y0 + (j + .5) * CELDA), PLANO["campus"]):
            BLOQUEO[(i, j)] = "fuera"

# Lo trazado a mano en andenes.json (corregido por James sobre la foto satelital) se camina siempre,
# aunque OSM ponga ahí un edificio o el borde del campus: los pasillos de planta baja que cruzan
# el B, el C y el P, el paso central B/C, la escalera entre el D y Clínicas y las calles de afuera.
# La pasarela no cuenta: va por encima.
ANCHO_TRAZADO = 0.8   # m a cada lado del eje del tramo
_TRAZADOS = []
if (AQUI / "andenes.json").exists():
    for _t in json.loads((AQUI / "andenes.json").read_text(encoding="utf-8"))["andenes"]:
        if _t["tipo"] == "pasarela":
            continue
        for _a, _b in zip(_t["p"], _t["p"][1:]):
            (_i0, _j0) = celda((min(_a[0], _b[0]) - 1, min(_a[1], _b[1]) - 1))
            (_i1, _j1) = celda((max(_a[0], _b[0]) + 1, max(_a[1], _b[1]) + 1))
            for _i in range(_i0, _i1 + 1):
                for _j in range(_j0, _j1 + 1):
                    _q = (X0 + (_i + .5) * CELDA, Y0 + (_j + .5) * CELDA)
                    _dx, _dy = _b[0] - _a[0], _b[1] - _a[1]
                    _t2 = max(0.0, min(1.0, ((_q[0] - _a[0]) * _dx + (_q[1] - _a[1]) * _dy) / ((_dx * _dx + _dy * _dy) or 1.0)))
                    if math.dist(_q, (_a[0] + _t2 * _dx, _a[1] + _t2 * _dy)) <= ANCHO_TRAZADO + CELDA * .5:
                        BLOQUEO.pop((_i, _j), None)
                        _TRAZADOS.append((_i, _j))

TRAZADOS = frozenset(_TRAZADOS)

PASOS = [(1, 0, 1), (-1, 0, 1), (0, 1, 1), (0, -1, 1),
         (1, 1, math.sqrt(2)), (1, -1, math.sqrt(2)), (-1, 1, math.sqrt(2)), (-1, -1, math.sqrt(2))]


# ---------------------------------------------------------------- superficie: por dónde se camina
# Calles, aceras, parqueos, plazas, canchas y techos transitables son piso firme (costo 1).
# El césped y los patios sin pavimentar se pueden cruzar, pero se evitan (costo PASTO): así las
# rutas siguen la forma en que la gente camina de verdad y no cortan en línea recta por cualquier lado.
PASTO = 1.6
ANCHO_CALLE = {"residential": 3.5, "service": 3.0, "footway": 1.5}   # medio ancho (m) de cada vía


def _dseg(p, a, b):
    dx, dy = b[0] - a[0], b[1] - a[1]
    l2 = dx * dx + dy * dy or 1.0
    t = max(0.0, min(1.0, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2))
    return math.dist(p, (a[0] + t * dx, a[1] + t * dy))


def _centro_celda(c):
    return (X0 + (c[0] + .5) * CELDA, Y0 + (c[1] + .5) * CELDA)


def _celdas_de(pol):
    xs, ys = [p[0] for p in pol], [p[1] for p in pol]
    (i0, j0), (i1, j1) = celda((min(xs), min(ys))), celda((max(xs), max(ys)))
    return [(i, j) for i in range(i0, i1 + 1) for j in range(j0, j1 + 1) if dentro(_centro_celda((i, j)), pol)]


FIRME = set()
for _c in OSM["calles"]:
    _w = ANCHO_CALLE.get(_c["tipo"], 3.0)
    for _a, _b in zip(_c["linea"], _c["linea"][1:]):
        (_i0, _j0) = celda((min(_a[0], _b[0]) - _w, min(_a[1], _b[1]) - _w))
        (_i1, _j1) = celda((max(_a[0], _b[0]) + _w, max(_a[1], _b[1]) + _w))
        for _i in range(_i0, _i1 + 1):
            for _j in range(_j0, _j1 + 1):
                if _dseg(_centro_celda((_i, _j)), _a, _b) <= _w:
                    FIRME.add((_i, _j))
for _pol in ([q["pol"] for q in OSM["parqueos"]] + [q["pol"] for q in OSM["plazas"]] + [q["pol"] for q in OSM["canchas"]]
             + [e["pol"] for e in OSM["edificios"] if e["id"] in TRANSITABLES]
             + [[(PASARELA[0], PASARELA[2]), (PASARELA[1], PASARELA[2]), (PASARELA[1], PASARELA[3]), (PASARELA[0], PASARELA[3])]]):
    FIRME.update(_celdas_de(_pol))
FIRME.update(_TRAZADOS)


def costo(c):
    return 1.0 if c in FIRME else PASTO


# ---------------------------------------------------------------- zonas seguras como áreas
# Una zona segura no es un punto: es toda la cancha o todo el parqueo. Se llega a ella al pisar su
# borde más cercano, no su centro. (Parqueo Sur queda en el pasillo entre los dos parqueos techados.)
ZONA_AREA = {
    "Zona Segura Cancha de Fútbol": ["cancha:soccer"],
    "Zona Segura Campo de Béisbol": ["cancha:baseball"],
    "Punto Seguro Plazoleta": ["plaza:0"],
    "Punto Seguro Parqueo Sur": ["parqueo:1553720160", "parqueo:1553720161"],
    "Punto Seguro Parqueo Oeste": ["parqueo:1553720166"],
}


def _poligono(ref):
    tipo, clave = ref.split(":", 1)
    if tipo == "cancha":
        return next(c["pol"] for c in OSM["canchas"] if c.get("deporte") == clave)
    if tipo == "plaza":
        return OSM["plazas"][int(clave)]["pol"]
    return next(q["pol"] for q in OSM["parqueos"] if q["id"] == clave)


def areas_zona(nombre):
    """Polígonos del área de una zona segura (o [] si el lugar no es zona segura)."""
    if not nombre.startswith(("Punto Seguro", "Zona Segura")):
        return []
    if nombre in ZONA_AREA:
        return [_poligono(r) for r in ZONA_AREA[nombre]]
    return [q["pol"] for q in OSM["parqueos"] if dentro(POS[nombre], q["pol"])]   # el parqueo que la contiene


_CELDAS_LUGAR = {}


def celdas_lugar(nombre):
    """Celdas donde 'está' un lugar: toda su área si es zona segura, si no la celda de su punto."""
    if nombre not in _CELDAS_LUGAR:
        area = [c for pol in areas_zona(nombre) for c in _celdas_de(pol) if BLOQUEO.get(c) is None]
        _CELDAS_LUGAR[nombre] = area or [celda(POS[nombre])]
    return _CELDAS_LUGAR[nombre]


# ---------------------------------------------------------------- búsqueda
def _libre(c, libres):
    ocup = BLOQUEO.get(c)
    return ocup is None or ocup in libres


def _a_la_vista(p, q, libres):
    """True si el tramo recto p→q (en metros) no pisa celdas bloqueadas (edificios ajenos o fuera del campus)."""
    n = max(2, int(math.dist(p, q) / (CELDA * .4)))
    return all(_libre(celda((p[0] + (q[0] - p[0]) * i / n, p[1] + (q[1] - p[1]) * i / n)), libres) for i in range(n + 1))


_CACHE = {}


def _buscar(a, b):
    """Ruta a pie más conveniente de a hasta b (A* con costo de superficie), rodeando edificios.
    Sale desde cualquier punto del área de a y termina al tocar cualquier punto del área de b.
    Devuelve (metros reales recorridos, celdas)."""
    if (a, b) in _CACHE:
        return _CACHE[(a, b)]
    if (b, a) in _CACHE:
        m, cs = _CACHE[(b, a)]
        return m, cs[::-1]
    libres = propios(a) | propios(b)
    metas = set(celdas_lugar(b))
    cb = (sum(c[0] for c in metas) / len(metas), sum(c[1] for c in metas) / len(metas))
    radio = max(math.dist(c, cb) for c in metas)
    h = lambda c: max(0.0, math.dist(c, cb) - radio)          # admisible: nunca sobreestima
    dist, geo, prev, cola = {}, {}, {}, []
    for c in celdas_lugar(a):
        dist[c], geo[c], prev[c] = 0.0, 0.0, None
        heapq.heappush(cola, (h(c), 0.0, c))
    fin = None
    while cola:
        _, d, c = heapq.heappop(cola)
        if d > dist.get(c, math.inf):
            continue
        if c in metas:
            fin = c
            break
        for dx, dy, w in PASOS:
            n = (c[0] + dx, c[1] + dy)
            if not (0 <= n[0] < NX and 0 <= n[1] < NY) or not _libre(n, libres):
                continue
            nd = d + w * (costo(c) + costo(n)) / 2
            if nd < dist.get(n, math.inf):
                dist[n], geo[n], prev[n] = nd, geo[c] + w, c
                heapq.heappush(cola, (nd + h(n), nd, n))
    if fin is None:
        res = (math.inf, [])
    else:
        camino, c = [], fin
        while c is not None:
            camino.append(c)
            c = prev[c]
        res = (geo[fin] * CELDA, camino[::-1])
    _CACHE[(a, b)] = res
    return res


def a_pie(a, b):
    """Metros a pie de a hasta b por la ruta real (hasta el borde de la zona segura si b lo es).
    Primero por la red de andenes; si un lugar no llega a ella, por la rejilla."""
    r = ruta_red(a, b)
    if r:
        return r[0]
    m, celdas = _buscar(a, b)
    if not celdas:
        return m
    # tramos fuera de la rejilla: del punto del lugar a su primera/última celda
    ini = POS[a] if not areas_zona(a) else _centro_celda(celdas[0])
    fin = POS[b] if not areas_zona(b) else _centro_celda(celdas[-1])
    return m + math.dist(ini, _centro_celda(celdas[0])) + math.dist(fin, _centro_celda(celdas[-1]))


def _simplificar(puntos, tol, libres=frozenset()):
    """Douglas-Peucker: quita los escalones de la rejilla sin cambiar la forma del recorrido.
    Un atajo solo se acepta si no pisa ningún edificio (si no, recortaría esquinas)."""
    if len(puntos) < 3:
        return puntos
    a, b = puntos[0], puntos[-1]
    i, dmax = max(((k, _dseg(puntos[k], a, b)) for k in range(1, len(puntos) - 1)), key=lambda t: t[1])
    if dmax <= tol and _a_la_vista(a, b, libres):
        return [a, b]
    return _simplificar(puntos[:i + 1], tol, libres)[:-1] + _simplificar(puntos[i:], tol, libres)


def trazado(a, b):
    """Recorrido real a pie de a hasta b como polilínea en metros. Si b (o a) es zona segura,
    la línea termina (o empieza) en el borde de su área, en el punto más conveniente."""
    r = ruta_red(a, b)
    if r:
        return [[round(x, 1), round(y, 1)] for x, y in _simplificar(r[1], 0.3, propios(a) | propios(b))]
    _, celdas = _buscar(a, b)
    if not celdas:
        return [list(POS[a]), list(POS[b])]
    puntos = [_centro_celda(c) for c in celdas]
    if not areas_zona(a):
        puntos = [POS[a]] + puntos
    if not areas_zona(b):
        puntos = puntos + [POS[b]]
    return [[round(x, 1), round(y, 1)] for x, y in _simplificar(puntos, 2.0, propios(a) | propios(b))]


def _cruces_linea(a, b, linea):
    libres = propios(a) | propios(b)
    out = {}
    for pa, pb in zip(linea, linea[1:]):
        d = math.dist(pa, pb)
        n = max(2, int(d / .5))
        for i in range(1, n):
            t = i / n
            q = (pa[0] + (pb[0] - pa[0]) * t, pa[1] + (pb[1] - pa[1]) * t)
            if celda(q) in TRAZADOS:      # pasillo de planta baja trazado a mano: se camina
                continue
            for e in OBSTACULOS:
                if e["id"] not in libres and dentro(q, e["pol"]):
                    k = e["nombre"] or f"edificio {e['id']}"
                    out[k] = out.get(k, 0) + d / n
    return {k: round(v, 1) for k, v in out.items() if v >= 2}


def cruces(a, b):
    """Metros de la línea recta a→b que caen dentro de edificios cerrados ajenos."""
    return _cruces_linea(a, b, [POS[a], POS[b]])


def cruces_recorrido(a, b):
    """Metros del recorrido real a→b (el que dibuja la app) dentro de edificios cerrados ajenos.
    Debe ser {} en todos los caminos: si no, el motor de rutas está fallando."""
    return _cruces_linea(a, b, trazado(a, b))


def caminos_exteriores():
    campus, _ = crearCampus()
    pares = {}
    for v in campus.vertexs:
        for w, peso in v.neig:
            if v.nombre in POS and w.nombre in POS:
                pares.setdefault(tuple(sorted((v.nombre, w.nombre))), []).append(peso)
    return {k: max(v) for k, v in pares.items()}


def verificar():
    caminos = caminos_exteriores()
    filas = []
    grado = {n: 0 for n in POS}
    for (a, b), peso in sorted(caminos.items()):
        grado[a] += 1
        grado[b] += 1
        recta = math.dist(POS[a], POS[b])
        real = a_pie(a, b)
        seg = real / VELOCIDAD
        filas.append({
            "a": a, "b": b, "peso": peso, "recta_m": round(recta, 1), "a_pie_m": round(real, 1),
            "seg_a_pie": round(seg), "rodeo": round(real / recta, 2) if recta else 1.0,
            "cruza": cruces_recorrido(a, b), "cruza_recta": cruces(a, b),
            "peso_ok": abs(peso - seg) <= max(8, TOLERANCIA * seg),
        })
    unidos = set(caminos)
    candidatos = []
    nombres = sorted(POS)
    for i, a in enumerate(nombres):
        for b in nombres[i + 1:]:
            recta = math.dist(POS[a], POS[b])
            if (a, b) in unidos or recta > VECINO_MAX or cruces(a, b):
                continue
            candidatos.append({"a": a, "b": b, "recta_m": round(recta, 1), "seg_a_pie": round(a_pie(a, b) / VELOCIDAD)})
    return filas, grado, candidatos


def main():
    filas, grado, candidatos = verificar()
    cruzan = [f for f in filas if f["cruza"]]
    pesos = [f for f in filas if not f["peso_ok"]]
    rodeos = [f for f in filas if f["rodeo"] > RODEO_MAX]
    print(f"{len(filas)} caminos exteriores · {len(cruzan)} cruzan edificios cerrados · "
          f"{len(pesos)} con peso fuera de ±{int(TOLERANCIA * 100)} % · {len(rodeos)} con rodeo > ×{RODEO_MAX}")
    print("\nLínea recta a través de edificios cerrados:")
    for f in sorted(cruzan, key=lambda f: -sum(f["cruza"].values())):
        print(f"  {f['a']} — {f['b']}: " + ", ".join(f"{k} {v} m" for k, v in f["cruza"].items())
              + f" (a pie {f['a_pie_m']} m, rodeo ×{f['rodeo']})")
    print("\nPeso distinto del tiempo a pie real:")
    for f in pesos:
        print(f"  {f['a']} — {f['b']}: peso {f['peso']} s · a pie {f['a_pie_m']} m ≈ {f['seg_a_pie']} s")
    print("\nGrado de cada lugar (caminos exteriores):")
    for n, g in sorted(grado.items(), key=lambda t: (t[1], t[0])):
        print(f"  {g:2d}  {n}")
    print(f"\nLugares a la vista, a menos de {VECINO_MAX} m y sin camino directo ({len(candidatos)}):")
    for c in sorted(candidatos, key=lambda c: c["recta_m"]):
        print(f"  {c['a']} — {c['b']}: {c['recta_m']} m (≈ {c['seg_a_pie']} s)")
    if "--json" in sys.argv:
        (AQUI / "verificacion-caminos.json").write_text(
            json.dumps({"caminos": filas, "grado": grado, "candidatos": candidatos}, ensure_ascii=False, indent=1),
            encoding="utf-8")
    if "--diagrama" in sys.argv:
        diagrama(filas)
    if "--app" in sys.argv:
        exportar_app(filas)
    if "--aplicar-pesos" in sys.argv:
        aplicar_pesos(filas)


# ---------------------------------------------------------------- diagrama de zonas caminables
def zonas_caminables():
    """La forma con la que se arma y se verifica el grafo: dónde se puede caminar en la UAM."""
    r1 = lambda p: [round(p[0], 1), round(p[1], 1)]
    return {
        "fuente": "© OpenStreetMap contributors (ODbL) · docs/mapa-campus/verificar_caminos.py",
        "unidades": "metros; x hacia el este, y hacia el sur (igual que campus-osm.json)",
        "regla": "Se camina dentro del contorno del campus, por fuera de los obstáculos. "
                 "Las zonas transitables (techos de carport, comedores, kioskos, Food Court) se pueden cruzar.",
        "campus": [r1(p) for p in PLANO["campus"]],
        "obstaculos": [{"id": e["id"], "nombre": e["nombre"], "pol": [r1(p) for p in e["pol"]]} for e in OBSTACULOS],
        "transitables": [{"id": e["id"], "nombre": e["nombre"], "motivo": TRANSITABLES[e["id"]], "pol": [r1(p) for p in e["pol"]]}
                         for e in OSM["edificios"] if e["id"] in TRANSITABLES],
        "elevados": [{"nombre": "Pasarela B (elevada, un piso sobre la Plazoleta)",
                      "pol": [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]}
                     for x0, x1, y0, y1 in [PASARELA]],
        "abiertos": {"canchas": [[r1(p) for p in c["pol"]] for c in OSM["canchas"]],
                     "parqueos": [[r1(p) for p in q["pol"]] for q in OSM["parqueos"]]},
    }


def numerar():
    """Número fijo para cada obstáculo (O1, O2...) y zona transitable (T1, T2...), de norte a sur
    y de oeste a este, para poder corregirlos por número."""
    def orden(e):
        xs, ys = [p[0] for p in e["pol"]], [p[1] for p in e["pol"]]
        return (round((min(ys) + max(ys)) / 2 / 25), (min(xs) + max(xs)) / 2)
    obst = sorted(OBSTACULOS, key=orden)
    trans = sorted((e for e in OSM["edificios"] if e["id"] in TRANSITABLES), key=orden)
    return {e["id"]: f"O{i + 1}" for i, e in enumerate(obst)} | {e["id"]: f"T{i + 1}" for i, e in enumerate(trans)}


def trazados(filas):
    return {f"{f['a']}|{f['b']}": trazado(f["a"], f["b"]) for f in filas}


def diagrama(filas):
    zonas = zonas_caminables()
    nums = numerar()
    for grupo in ("obstaculos", "transitables"):
        for e in zonas[grupo]:
            e["numero"] = nums[e["id"]]
    rutas = trazados(filas)
    (AQUI / "zonas-caminables.json").write_text(json.dumps(zonas, ensure_ascii=False, indent=1), encoding="utf-8")
    (AQUI / "caminos-reales.json").write_text(json.dumps(
        {"fuente": zonas["fuente"], "unidades": zonas["unidades"],
         "nota": "Recorrido real a pie de cada camino exterior del grafo (polilínea en metros), rodeando edificios.",
         "caminos": rutas}, ensure_ascii=False, indent=1), encoding="utf-8")

    W, M, CAB, LISTA = 1500, 40, 110, 300
    xs = [p[0] for p in zonas["campus"]]
    ys = [p[1] for p in zonas["campus"]]
    esc = (W - LISTA - 2 * M) / (max(xs) - min(xs))
    H = int(CAB + (max(ys) - min(ys)) * esc + 2 * M + 70)

    def T(p):
        return (M + (p[0] - min(xs)) * esc, CAB + M + (p[1] - min(ys)) * esc)

    def pts(lista):
        return " ".join(f"{a:.1f},{b:.1f}" for a, b in map(T, lista))

    def centro(pol):
        return T((sum(p[0] for p in pol) / len(pol), sum(p[1] for p in pol) / len(pol)))

    def corto(n):
        return (n.replace("Punto Seguro ", "PS ").replace("Zona Segura ", "ZS ")
                .replace("Clínicas Odontológicas", "Clínicas").replace("Pasarela Edificio B", "Pasarela B"))

    g = [f'<rect width="{W}" height="{H}" fill="#eef3f8"/>',
         f'<text x="{(W - LISTA) / 2}" y="44" text-anchor="middle" font-size="28" font-weight="900" fill="#0058b8">Zonas caminables del campus UAM</text>',
         f'<text x="{(W - LISTA) / 2}" y="74" text-anchor="middle" font-size="15" font-weight="600" fill="#0b2a4a">'
         f'Vista superior · {len(filas)} caminos dibujados por donde se camina · corrige por número (O = obstáculo, T = transitable)</text>',
         f'<polygon points="{pts(zonas["campus"])}" fill="#d9efcf" stroke="#6aa84f" stroke-width="3"/>']
    for q in zonas["abiertos"]["parqueos"]:
        g.append(f'<polygon points="{pts(q)}" fill="#cfd8e1" stroke="#aab6c2"/>')
    for c in zonas["abiertos"]["canchas"]:
        g.append(f'<polygon points="{pts(c)}" fill="#9fd89a" stroke="#5aa857"/>')
    for e in zonas["transitables"]:
        g.append(f'<polygon points="{pts(e["pol"])}" fill="#9fd3ff" fill-opacity=".8" stroke="#2d8bd8" stroke-width="1.5" stroke-dasharray="5 3"/>')
    for e in zonas["obstaculos"]:
        g.append(f'<polygon points="{pts(e["pol"])}" fill="#e8a39b" stroke="#a23b2f" stroke-width="1.5"/>')
    for e in zonas["elevados"]:
        g.append(f'<polygon points="{pts(e["pol"])}" fill="#ffe08a" stroke="#d99a00" stroke-width="1.5"/>')
    # caminos con su trazado real (la pasarela y la salida central del B en ámbar)
    for clave, linea in rutas.items():
        pasarela = "Pasarela" in clave or "B Salida Central" in clave
        color = "#d99a00" if pasarela else "#1f7a3a"
        g.append(f'<polyline points="{pts(linea)}" fill="none" stroke="#ffffff" stroke-width="5.5" stroke-linejoin="round" stroke-linecap="round" opacity=".85"/>'
                 f'<polyline points="{pts(linea)}" fill="none" stroke="{color}" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"/>')
    for e in zonas["obstaculos"] + zonas["transitables"]:
        x, y = centro(e["pol"])
        col = "#a23b2f" if e["numero"].startswith("O") else "#1f6fb8"
        g.append(f'<text x="{x:.1f}" y="{y + 4:.1f}" text-anchor="middle" font-size="11" font-weight="900" fill="{col}" '
                 f'stroke="#ffffff" stroke-width="3" paint-order="stroke">{e["numero"]}</text>')
    for n, p in POS.items():
        x, y = T(p)
        seguro = n.startswith(("Punto Seguro", "Zona Segura"))
        g.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="6" fill="{"#1e9e4a" if seguro else "#0080ff"}" stroke="#fff" stroke-width="2"/>')
        g.append(f'<text x="{x + 8:.1f}" y="{y - 6:.1f}" font-size="11" font-weight="800" fill="#0b2a4a" stroke="#ffffff" '
                 f'stroke-width="3" paint-order="stroke">{corto(n)}</text>')
    # lista de números a la derecha
    lx, ly = W - LISTA + 10, CAB + 10
    g.append(f'<rect x="{lx - 10}" y="{ly - 24}" width="{LISTA - 10}" height="{H - CAB - 60}" rx="14" fill="#ffffff" stroke="#c5d6ea"/>')
    g.append(f'<text x="{lx}" y="{ly}" font-size="15" font-weight="900" fill="#a23b2f">Obstáculos (no se cruzan)</text>')
    ly += 6
    num = lambda e: int(e["numero"][1:])
    for e in sorted(zonas["obstaculos"], key=num):
        ly += 17
        nombre = e["nombre"] or f"sin nombre (OSM {e['id']})"
        g.append(f'<text x="{lx}" y="{ly}" font-size="12" font-weight="700" fill="#0b2a4a">'
                 f'<tspan font-weight="900" fill="#a23b2f">{e["numero"]}</tspan>  {nombre[:30]}</text>')
    ly += 30
    g.append(f'<text x="{lx}" y="{ly}" font-size="15" font-weight="900" fill="#1f6fb8">Transitables (se cruzan)</text>')
    ly += 6
    for e in sorted(zonas["transitables"], key=num):
        ly += 17
        g.append(f'<text x="{lx}" y="{ly}" font-size="12" font-weight="700" fill="#0b2a4a">'
                 f'<tspan font-weight="900" fill="#1f6fb8">{e["numero"]}</tspan>  {(e["nombre"] or e["motivo"])[:30]}</text>')
    items = [("#d9efcf", "#6aa84f", "Caminable"), ("#cfd8e1", "#aab6c2", "Parqueo"), ("#9fd89a", "#5aa857", "Cancha"),
             ("#9fd3ff", "#2d8bd8", "Transitable (T)"), ("#ffe08a", "#d99a00", "Pasarela"), ("#e8a39b", "#a23b2f", "Obstáculo (O)")]
    x, yl = 40, H - 36
    for relleno, borde, txt in items:
        g.append(f'<rect x="{x}" y="{yl - 9}" width="18" height="18" rx="4" fill="{relleno}" stroke="{borde}" stroke-width="2"/>'
                 f'<text x="{x + 26}" y="{yl + 5}" font-size="14" font-weight="700" fill="#0b2a4a">{txt}</text>')
        x += 44 + len(txt) * 8.2
    for col, txt in (("#1f7a3a", "Camino (trazado real)"), ("#d99a00", "Por la pasarela")):
        g.append(f'<line x1="{x}" y1="{yl}" x2="{x + 26}" y2="{yl}" stroke="{col}" stroke-width="3"/>'
                 f'<text x="{x + 34}" y="{yl + 5}" font-size="14" font-weight="700" fill="#0b2a4a">{txt}</text>')
        x += 60 + len(txt) * 8.2
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" '
           f'font-family="Montserrat, Segoe UI, Arial, sans-serif">{"".join(g)}</svg>')
    (AQUI / "zonas-caminables.svg").write_text(svg, encoding="utf-8")
    print("\nDiagrama: zonas-caminables.svg, zonas-caminables.json y caminos-reales.json")


# ---------------------------------------------------------------- navegación giro a giro (tipo Waze)
RUMBOS = ["el este", "el sureste", "el sur", "el suroeste", "el oeste", "el noroeste", "el norte", "el noreste"]


def _rumbo(a, b):
    """Rumbo de a hacia b (x este, y sur) como texto: «el norte», «el sureste»..."""
    ang = math.degrees(math.atan2(b[1] - a[1], b[0] - a[0])) % 360   # 0 = este, 90 = sur
    return RUMBOS[int((ang + 22.5) // 45) % 8]


def _articulo(nombre):
    """«al Edificio M», «a la Plazoleta», «a los Laboratorios», «al Chilamate»."""
    if nombre.startswith("El "):
        return "al " + nombre[3:]
    if nombre.split()[0] in ("Laboratorios", "Vestidores", "Kioskos"):
        return "a los " + nombre
    if nombre.split()[0] in ("Clínicas",):
        return "a las " + nombre
    if nombre.split()[0] in ("Zona", "Plazoleta", "Cancha", "Pasarela"):
        return "a la " + nombre
    return "al " + nombre


NOMBRE_ZONA_POL = {}   # id(polígono) -> nombre de la zona segura que lo contiene
for _z in POS:
    for _pol in areas_zona(_z):
        NOMBRE_ZONA_POL[id(_pol)] = _z
REFERENCIAS = ([(e["nombre"], e["pol"]) for e in OSM["edificios"] if e["nombre"]]
               + [(n, pol) for n in POS for pol in areas_zona(n)])


def _dpol(p, pol):
    if dentro(p, pol):
        return 0.0
    return min(_dseg(p, pol[i], pol[(i + 1) % len(pol)]) for i in range(len(pol)))


def _referencia(p, excluir=(), radio=18):
    """El lugar con nombre más cercano a p (a menos de `radio` m), para «junto al Edificio M»."""
    mejor = min(((_dpol(p, pol), n) for n, pol in REFERENCIAS if n not in excluir), default=(math.inf, None))
    return mejor[1] if mejor[0] <= radio else None


def _superficie(p, q):
    """Por dónde va el tramo p→q: según la red de andenes, o calle, parqueo, plaza, cancha o pasarela."""
    m = ((p[0] + q[0]) / 2, (p[1] + q[1]) / 2)
    t = tipo_red_en(m)
    if t:
        return TIPO_TXT[t]
    if PASARELA[0] <= m[0] <= PASARELA[1] and PASARELA[2] - .5 <= m[1] <= PASARELA[3] + .5:
        return "por la pasarela"
    for pol in [q_["pol"] for q_ in OSM["plazas"]]:
        if dentro(m, pol):
            return "por la Plazoleta"
    for c in OSM["canchas"]:
        if dentro(m, c["pol"]):
            return "por la cancha"
    for q_ in OSM["parqueos"]:
        if dentro(m, q_["pol"]):
            return "por el parqueo"
    if celda(m) in FIRME:
        return "por la calle interna"
    return ""          # andén o sendero que no está en el mapa: no se nombra la superficie


def _redondeo(m):
    return max(5, int(round(m / 5.0)) * 5)


def _giro(h0, h1):
    """Diferencia de rumbo (grados, + = derecha con el norte arriba)."""
    d = (math.degrees(math.atan2(h1[1], h1[0]) - math.atan2(h0[1], h0[0])) + 180) % 360 - 180
    return d


def indicaciones(a, b, linea):
    """Lista de maniobras para ir de a a b por la polilínea: [{"t": texto, "m": metros, "k": índice}]."""
    pts = [tuple(p) for p in linea]
    if len(pts) < 2:
        return [], 0
    # 1. tramos rectos: se juntan los segmentos que siguen casi el mismo rumbo (< 30°)
    tramos = []                     # [(índice inicial, índice final)]
    i = 0
    while i < len(pts) - 1:
        j = i + 1
        h = (pts[j][0] - pts[i][0], pts[j][1] - pts[i][1])
        while j < len(pts) - 1:
            h2 = (pts[j + 1][0] - pts[j][0], pts[j + 1][1] - pts[j][1])
            if abs(_giro(h, h2)) >= 40:
                break
            j += 1
        tramos.append((i, j))
        i = j
    # 2. tramos muy cortos (< 10 m) se suman al anterior: son zigzags de la rejilla, no giros reales
    largo = lambda t: sum(math.dist(pts[k], pts[k + 1]) for k in range(t[0], t[1]))
    limpios = []
    for t in tramos:
        if limpios and largo(t) < 10:
            limpios[-1] = (limpios[-1][0], t[1])
        else:
            limpios.append(t)
    if len(limpios) > 1 and largo(limpios[0]) < 10:          # arranque corto: se une al primer tramo largo
        limpios[:2] = [(limpios[0][0], limpios[1][1])]
    total = sum(largo(t) for t in limpios)
    # no se usa de referencia el lugar del que se sale ni al que se llega (ni su edificio en OSM)
    excluir = {a, b} | {e["nombre"] for e in OSM["edificios"] if e["id"] in propios(a) | propios(b)}
    out, ultima = [], None
    for n, (i0, i1) in enumerate(limpios):
        m = largo((i0, i1))
        sobre = _superficie(pts[i0], pts[min(i0 + 1, i1)])
        sobre = f" {sobre}" if sobre else ""
        if n == 0:
            txt = f"Sal hacia {_rumbo(pts[i0], pts[i1])}{sobre}"
        else:
            hp = (pts[i0][0] - pts[limpios[n - 1][0]][0], pts[i0][1] - pts[limpios[n - 1][0]][1])
            hn = (pts[i1][0] - pts[i0][0], pts[i1][1] - pts[i0][1])
            g = _giro(hp, hn)
            lado = "derecha" if g > 0 else "izquierda"
            if abs(g) >= 135:
                verbo = "Da media vuelta"
            elif abs(g) >= 60:
                verbo = f"Gira a la {lado}"
            else:
                verbo = f"Toma ligeramente a la {lado}"
            ref = _referencia(pts[i0], excluir)
            txt = f"{verbo}{' junto ' + _articulo(ref) if ref else ''}{sobre}"
            if ultima == (verbo, ref, sobre) and verbo.startswith("Toma ligeramente"):
                # dos desvíos suaves iguales seguidos: una sola indicación
                out[-1]["m"] = round(out[-1]["m"] + m, 1)
                out[-1]["t"] = f"{txt} y camina {_redondeo(out[-1]['m'])} m."
                continue
            ultima = (verbo, ref, sobre)
        out.append({"t": f"{txt} y camina {_redondeo(m)} m.", "m": round(m, 1), "k": i0})
    if b.startswith(("Punto Seguro", "Zona Segura")):
        out.append({"t": f"Entras {_articulo(b)}: ya estás en zona segura.", "m": 0, "k": len(pts) - 1})
    else:
        out.append({"t": f"Llegas {_articulo(b)}.", "m": 0, "k": len(pts) - 1})
    return out, total


def rutas_app(filas):
    """Trazado e indicaciones de cada camino exterior, en los dos sentidos, para la app."""
    rutas = {}
    campus, _ = crearCampus()
    peso = {(v.nombre, w.nombre): p for v in campus.vertexs for w, p in v.neig}
    for f in filas:
        if peso.get((f["a"], f["b"])) != peso.get((f["b"], f["a"])):
            continue          # escalera dirigida (p. ej. pasarela → Plazoleta): no es un recorrido a pie

        for a, b in ((f["a"], f["b"]), (f["b"], f["a"])):
            linea = trazado(a, b)
            pasos, total = indicaciones(a, b, linea)
            rutas[f"{a}|{b}"] = {"p": linea, "i": pasos, "m": round(total, 1)}
    return rutas


def exportar_app(filas):
    destino = RAIZ / "frontend" / "static" / "campus-rutas.json"
    datos = {"fuente": "© OpenStreetMap contributors (ODbL) · docs/mapa-campus/verificar_caminos.py --app",
             "unidades": "metros; x hacia el este, y hacia el sur",
             "rutas": rutas_app(filas)}
    destino.write_text(json.dumps(datos, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"\nApp: {destino.relative_to(RAIZ)} ({len(datos['rutas'])} recorridos, {destino.stat().st_size // 1024} KB)")


def aplicar_pesos(filas):
    """Escribe en backend/datos.py el peso de cada camino exterior = metros reales / VELOCIDAD.
    Las escaleras dirigidas (bajar/subir distinto) no se tocan."""
    ruta = RAIZ / "backend" / "datos.py"
    s = ruta.read_text(encoding="utf-8")
    cambios = 0
    for f in filas:
        a, b = f["a"], f["b"]
        nuevo = max(3, round(a_pie(a, b) / VELOCIDAD))
        for x, y in ((a, b), (b, a)):
            for patron in (rf'(\("{re.escape(x)}", "{re.escape(y)}", )(\d+)(\))',
                           rf'(unirDosSentidos\(campus, "{re.escape(x)}", "{re.escape(y)}", )(\d+)(\))'):
                s, n = re.subn(patron, lambda m: f"{m.group(1)}{nuevo}{m.group(3)}", s)
                cambios += n
    ruta.write_text(s, encoding="utf-8")
    print(f"\nPesos: {cambios} caminos de backend/datos.py actualizados con el recorrido real.")


# ---------------------------------------------------------------- red de andenes (andenes.json)
# Las rutas exteriores van por la red de andenes, calles y senderos trazada sobre la imagen satelital,
# como un navegador que solo circula por calles. Cada lugar se conecta a la red por el tramo más corto
# que no cruce edificios ("acceso"); una zona segura se alcanza al entrar a su área por la red.
ANDENES = json.loads((AQUI / "andenes.json").read_text(encoding="utf-8"))["andenes"] if (AQUI / "andenes.json").exists() else []
PASO_RED = 2.0        # m entre vértices de la red al densificarla
UNIR_RED = 4.0        # m: un extremo de un tramo a menos de esto de otro tramo se une a él
ACCESO_MAX = 45.0     # m: distancia máxima de un lugar a la red para entrar a ella en línea recta
ZONA_ACERCA = 15.0    # m: desde la red se puede entrar a una zona segura que esté a menos de esto


def _borde_mas_cercano(p, pol):
    """Punto del contorno de pol más cercano a p."""
    mejor, dm = None, math.inf
    for k in range(len(pol)):
        a, b = pol[k], pol[(k + 1) % len(pol)]
        dx, dy = b[0] - a[0], b[1] - a[1]
        l2 = dx * dx + dy * dy or 1.0
        t = max(0.0, min(1.0, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2))
        q = (a[0] + t * dx, a[1] + t * dy)
        d = math.dist(p, q)
        if d < dm:
            mejor, dm = q, d
    return mejor
ELEVADOS = set()   # nada es elevado: la pasarela del B está en planta baja, pegada al frente del B (James, 26/11/2026)
EXTREMOS_PASARELA = {"Pasarela B Oeste", "Pasarela B Este"}     # se conectan a la pasarela y al suelo
TIPO_TXT = {"calle": "por la orilla de la calle", "anden": "por el andén", "sendero": "por el sendero", "pasarela": "por la pasarela",
            "escalera": "por la escalera", "parqueo": "cruzando el parqueo",
            "cruce": "por el paso peatonal"}

RED_P = []            # índice -> (x, y)
RED_T = []            # índice -> tipo del tramo
RED_A = []            # índice -> id del tramo de andenes.json
RED_ADJ = {}          # índice -> [(vecino, metros)]


def _red_vertice(p, tipo, ident=""):
    RED_P.append((float(p[0]), float(p[1])))
    RED_T.append(tipo)
    RED_A.append(ident)
    RED_ADJ[len(RED_P) - 1] = []
    return len(RED_P) - 1


def _red_unir(i, j):
    d = math.dist(RED_P[i], RED_P[j])
    if i != j and all(k != j for k, _ in RED_ADJ[i]):
        RED_ADJ[i].append((j, d))
        RED_ADJ[j].append((i, d))


def _construir_red():
    tramos = []                               # [(tipo, [índices])]
    sin_union = {(a["id"], b) for a in ANDENES for b in a.get("no_une", [])}
    sin_union |= {(b, a) for a, b in sin_union}
    for a in ANDENES:
        pts = a["p"]
        idx = []
        for p, q in zip(pts, pts[1:]):
            n = max(1, int(math.ceil(math.dist(p, q) / PASO_RED)))
            for k in range(n):
                t = k / n
                idx.append(_red_vertice((p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t), a["tipo"], a["id"]))
        idx.append(_red_vertice(pts[-1], a["tipo"], a["id"]))
        for i, j in zip(idx, idx[1:]):
            _red_unir(i, j)
        tramos.append((a["tipo"], idx))
    # uniones: cada vértice de un tramo se une al vértice más cercano de OTRO tramo a menos de UNIR_RED
    # (la pasarela solo se une a la pasarela: pasa por encima de los andenes del suelo)
    for n, (tipo, idx) in enumerate(tramos):
        for i in idx:
            for m, (tipo2, idx2) in enumerate(tramos):
                if m == n or (tipo == "pasarela") != (tipo2 == "pasarela"):
                    continue
                if (ANDENES[n]["id"], ANDENES[m]["id"]) in sin_union:   # p. ej. a distinto nivel
                    continue
                j = min(idx2, key=lambda k: math.dist(RED_P[i], RED_P[k]))
                if math.dist(RED_P[i], RED_P[j]) <= UNIR_RED:
                    _red_unir(i, j)


_construir_red()


SIN_ACCESO = {a["id"]: set(a.get("sin_acceso", [])) for a in ANDENES}
# Lugares que solo entran a la red por ciertos tramos: P Salida Este está arriba de la calle y del
# parqueo; se sale por el pasillo del P, por su pasillo este hacia atrás o bajando la escalera
# hasta el paso peatonal (James).
SOLO_ACCESO = {"P Salida Este": {"A19", "A73", "A80"}}


def _red_permitido(nombre, i):
    if nombre in SIN_ACCESO.get(RED_A[i], ()):
        return False
    if nombre in SOLO_ACCESO and RED_A[i] not in SOLO_ACCESO[nombre]:
        return False
    if nombre in ELEVADOS:
        return RED_T[i] == "pasarela"
    if nombre in EXTREMOS_PASARELA:
        return True
    return RED_T[i] != "pasarela"


_ACCESOS = {}


def _accesos(nombre):
    """Vértices de la red por donde entra/sale el lugar: [(vértice, metros, polilínea de acceso)].
    Zona segura: los vértices de la red dentro de su área (0 m). Otro lugar: los vértices visibles
    en línea recta sin cruzar edificios ajenos, a menos de ACCESO_MAX (los 6 más cercanos)."""
    if nombre in _ACCESOS:
        return _ACCESOS[nombre]
    areas = areas_zona(nombre)
    if areas:
        # zona segura: se llega al pisar su área. Los vértices de la red dentro (0 m) y los que están a
        # menos de ZONA_ACERCA de su borde, con el tramo recto hasta el borde si no cruza edificios.
        res = []
        for i in range(len(RED_P)):
            if RED_T[i] == "pasarela":
                continue
            for pol in areas:
                if dentro(RED_P[i], pol):
                    res.append((i, 0.0, []))
                    break
                b = _borde_mas_cercano(RED_P[i], pol)
                d = math.dist(RED_P[i], b)
                if d <= ZONA_ACERCA and _a_la_vista(RED_P[i], b, propios(nombre)):
                    res.append((i, d, [b, RED_P[i]]))
                    break
    else:
        libres = propios(nombre)
        p = POS[nombre]
        cand = sorted((math.dist(p, RED_P[i]), i) for i in range(len(RED_P)) if _red_permitido(nombre, i))
        res, tramos = [], set()
        for d, i in cand:
            if d > ACCESO_MAX or len(tramos) >= 6:
                break
            if RED_A[i] in tramos:            # un solo acceso (el más cercano) por tramo de andén
                continue
            if _a_la_vista(p, RED_P[i], libres):
                res.append((i, d, [p, RED_P[i]]))
                tramos.add(RED_A[i])
    _ACCESOS[nombre] = res
    return res


_CACHE_RED = {}


def ruta_red(a, b):
    """Recorrido de a hasta b por la red: (metros, polilínea) o None si no hay forma por la red."""
    if (a, b) in _CACHE_RED:
        return _CACHE_RED[(a, b)]
    ini, fin = _accesos(a), _accesos(b)
    if not ini or not fin:
        _CACHE_RED[(a, b)] = None
        return None
    meta = {i: (d, pl) for i, d, pl in fin}
    dist, prev, cola = {}, {}, []
    for i, d, _ in ini:
        if d < dist.get(i, math.inf):
            dist[i], prev[i] = d, None
            heapq.heappush(cola, (d, i))
    mejor, fin_i = math.inf, None
    while cola:
        d, i = heapq.heappop(cola)
        if d > dist.get(i, math.inf) or d >= mejor:
            continue
        if i in meta and d + meta[i][0] < mejor:
            mejor, fin_i = d + meta[i][0], i
        for j, w in RED_ADJ[i]:
            if d + w < dist.get(j, math.inf):
                dist[j], prev[j] = d + w, i
                heapq.heappush(cola, (d + w, j))
    if fin_i is None:
        _CACHE_RED[(a, b)] = None
        return None
    indices, i = [], fin_i
    while i is not None:
        indices.append(i)
        i = prev[i]
    indices.reverse()
    camino = [RED_P[k] for k in indices]
    acc_ini = next((pl for k, _, pl in ini if k == indices[0]), [])
    acc_fin = meta[fin_i][1][::-1]
    linea = (acc_ini[:-1] if acc_ini else []) + camino + (acc_fin[1:] if acc_fin else [])
    res = (mejor, linea)
    _CACHE_RED[(a, b)] = res
    return res


def tipo_red_en(p):
    """Tipo de tramo de la red que pasa por p (a menos de 1.5 m), o None."""
    mejor = min(((math.dist(p, q), t) for q, t in zip(RED_P, RED_T)), default=(math.inf, None))
    return mejor[1] if mejor[0] <= 1.5 else None


if __name__ == "__main__":
    main()
