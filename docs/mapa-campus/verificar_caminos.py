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
      python verificar_caminos.py --diagrama (dibuja zonas-caminables.svg y la forma en zonas-caminables.json)

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


def propios(nombre):
    """Edificios del propio lugar: el que lo contiene, el de su mismo nombre y, para las salidas
    y la pasarela de B, C y P, ese edificio (están sobre su contorno)."""
    ids = {e["id"] for e in OBSTACULOS if dentro(POS[nombre], e["pol"])}
    m = re.match(r"^([BCP]) Salida|^Pasarela Edificio ([BCP])", nombre)
    letra = m and (m.group(1) or m.group(2))
    for e in OBSTACULOS:
        if e["nombre"] and (e["nombre"] == nombre or (letra and e["nombre"] == f"Edificio {letra}")):
            ids.add(e["id"])
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
            if dentro((X0 + (i + .5) * CELDA, Y0 + (j + .5) * CELDA), e["pol"]):
                BLOQUEO[(i, j)] = e["id"]

# Fuera del campus tampoco se camina (la ruta no puede salir a las calles vecinas).
for i in range(NX):
    for j in range(NY):
        if (i, j) not in BLOQUEO and not dentro((X0 + (i + .5) * CELDA, Y0 + (j + .5) * CELDA), PLANO["campus"]):
            BLOQUEO[(i, j)] = "fuera"

PASOS = [(1, 0, 1), (-1, 0, 1), (0, 1, 1), (0, -1, 1),
         (1, 1, math.sqrt(2)), (1, -1, math.sqrt(2)), (-1, 1, math.sqrt(2)), (-1, -1, math.sqrt(2))]


def a_pie(a, b):
    """Metros a pie de a hasta b rodeando los edificios cerrados (Dijkstra en la rejilla)."""
    libres = propios(a) | propios(b)
    ini, fin = celda(POS[a]), celda(POS[b])
    dist = {ini: 0.0}
    cola = [(math.dist(POS[a], POS[b]), 0.0, ini)]
    while cola:
        _, d, c = heapq.heappop(cola)
        if c == fin:
            return d * CELDA
        if d > dist.get(c, math.inf):
            continue
        for dx, dy, w in PASOS:
            n = (c[0] + dx, c[1] + dy)
            if not (0 <= n[0] < NX and 0 <= n[1] < NY):
                continue
            ocup = BLOQUEO.get(n)
            if ocup is not None and ocup not in libres:
                continue
            nd = d + w
            if nd < dist.get(n, math.inf):
                dist[n] = nd
                h = math.dist(n, fin)
                heapq.heappush(cola, (nd + h, nd, n))
    return math.inf


def cruces(a, b):
    """Metros de la línea recta a→b que caen dentro de edificios cerrados ajenos."""
    libres = propios(a) | propios(b)
    pa, pb = POS[a], POS[b]
    d = math.dist(pa, pb)
    n = max(2, int(d / .5))
    out = {}
    for i in range(1, n):
        t = i / n
        q = (pa[0] + (pb[0] - pa[0]) * t, pa[1] + (pb[1] - pa[1]) * t)
        for e in OBSTACULOS:
            if e["id"] not in libres and dentro(q, e["pol"]):
                k = e["nombre"] or f"edificio {e['id']}"
                out[k] = out.get(k, 0) + d / n
    return {k: round(v, 1) for k, v in out.items() if v >= 2}


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
            "cruza": cruces(a, b),
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
        "abiertos": {"canchas": [[r1(p) for p in c["pol"]] for c in OSM["canchas"]],
                     "parqueos": [[r1(p) for p in q["pol"]] for q in OSM["parqueos"]]},
    }


def diagrama(filas):
    zonas = zonas_caminables()
    (AQUI / "zonas-caminables.json").write_text(json.dumps(zonas, ensure_ascii=False, indent=1), encoding="utf-8")
    W, M, CAB = 1200, 40, 110
    xs = [p[0] for p in zonas["campus"]]
    ys = [p[1] for p in zonas["campus"]]
    esc = (W - 2 * M) / (max(xs) - min(xs))
    H = int(CAB + (max(ys) - min(ys)) * esc + 2 * M + 70)

    def T(p):
        return (M + (p[0] - min(xs)) * esc, CAB + M + (p[1] - min(ys)) * esc)

    def poly(pts, extra):
        return f'<polygon points="{" ".join(f"{a:.1f},{b:.1f}" for a, b in map(T, pts))}" {extra}/>'

    corto = lambda n: (n.replace("Punto Seguro ", "PS ").replace("Zona Segura ", "ZS ")
                       .replace("Clínicas Odontológicas", "Clínicas").replace("Pasarela Edificio B", "Pasarela B"))
    g = [f'<rect width="{W}" height="{H}" fill="#eef3f8"/>',
         f'<text x="{W / 2}" y="44" text-anchor="middle" font-size="28" font-weight="900" fill="#0058b8">Zonas caminables del campus UAM</text>',
         f'<text x="{W / 2}" y="74" text-anchor="middle" font-size="15" font-weight="600" fill="#0b2a4a">'
         f'Vista superior · cada camino del grafo debe ir por zona caminable · {len(filas)} caminos exteriores</text>',
         poly(zonas["campus"], 'fill="#d9efcf" stroke="#6aa84f" stroke-width="3"')]
    for q in zonas["abiertos"]["parqueos"]:
        g.append(poly(q, 'fill="#cfd8e1" stroke="#aab6c2" stroke-width="1"'))
    for c in zonas["abiertos"]["canchas"]:
        g.append(poly(c, 'fill="#9fd89a" stroke="#5aa857" stroke-width="1"'))
    for e in zonas["transitables"]:
        g.append(poly(e["pol"], 'fill="#9fd3ff" fill-opacity=".75" stroke="#2d8bd8" stroke-width="1.5" stroke-dasharray="5 3"'))
    for e in zonas["obstaculos"]:
        g.append(poly(e["pol"], 'fill="#e8a39b" stroke="#a23b2f" stroke-width="1.5"'))
    for f in filas:
        (x1, y1), (x2, y2) = T(POS[f["a"]]), T(POS[f["b"]])
        mal = bool(f["cruza"])
        g.append(f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" stroke="{"#d00000" if mal else "#1f7a3a"}" '
                 f'stroke-width="{4 if mal else 2.4}" stroke-linecap="round"/>')
    for n, p in POS.items():
        x, y = T(p)
        seguro = n.startswith(("Punto Seguro", "Zona Segura"))
        g.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="6.5" fill="{"#1e9e4a" if seguro else "#0080ff"}" stroke="#fff" stroke-width="2"/>')
        g.append(f'<text x="{x + 9:.1f}" y="{y + 4:.1f}" font-size="12" font-weight="800" fill="#0b2a4a" stroke="#ffffff" '
                 f'stroke-width="3" paint-order="stroke">{corto(n)}</text>')
    items = [("#d9efcf", "#6aa84f", "Caminable (campus)"), ("#cfd8e1", "#aab6c2", "Parqueo"), ("#9fd89a", "#5aa857", "Cancha"),
             ("#9fd3ff", "#2d8bd8", "Techo transitable"), ("#e8a39b", "#a23b2f", "Obstáculo (edificio)")]
    x, yl = 40, H - 40
    for relleno, borde, txt in items:
        g.append(f'<rect x="{x}" y="{yl - 9}" width="18" height="18" rx="4" fill="{relleno}" stroke="{borde}" stroke-width="2"/>'
                 f'<text x="{x + 26}" y="{yl + 5}" font-size="14" font-weight="700" fill="#0b2a4a">{txt}</text>')
        x += 40 + len(txt) * 8.2
    g.append(f'<line x1="{x}" y1="{yl}" x2="{x + 26}" y2="{yl}" stroke="#1f7a3a" stroke-width="3"/>'
             f'<text x="{x + 34}" y="{yl + 5}" font-size="14" font-weight="700" fill="#0b2a4a">Camino del grafo</text>')
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" '
           f'font-family="Montserrat, Segoe UI, Arial, sans-serif">{"".join(g)}</svg>')
    (AQUI / "zonas-caminables.svg").write_text(svg, encoding="utf-8")
    print("\nDiagrama: zonas-caminables.svg y zonas-caminables.json")


if __name__ == "__main__":
    main()
