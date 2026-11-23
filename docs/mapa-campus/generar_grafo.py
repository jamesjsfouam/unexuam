"""
Grafo del campus (capa 2) calculado a partir del mapa 3D.

- Vértices: los lugares de `lugares.json` (edificios, zonas seguras y puntos seguros).
- Aristas: caminos a pie entre lugares vecinos. Cada lugar se une con sus 3 vecinos más
  cercanos (a menos de 75 m), y se agregan las aristas del árbol de expansión mínima para que
  ningún lugar quede aislado. Además está el pasillo elevado del 2.º piso entre el Edificio B y el E.
- Peso: segundos caminando = distancia en línea recta × 1.3 (los caminos no son rectos) / 1.2 m/s.

Produce en esta carpeta:
  - grafo-campus.json   vértices (con su posición) y caminos con su peso
  - grafo-campus.svg/.html  plano 2D con el grafo dibujado y una ruta de ejemplo
  - imprime la lista `caminos` lista para copiar en backend/datos.py

Uso:  python generar_grafo.py
"""

import json
import math
from pathlib import Path

AQUI = Path(__file__).parent
LUGARES = json.loads((AQUI / "lugares.json").read_text(encoding="utf-8"))
PLANO = json.loads((AQUI / "campus-osm.json").read_text(encoding="utf-8"))

VECINOS = 3          # vecinos más cercanos por lugar
MAX_M = 75           # no se une con vecinos más lejos que esto (salvo para no dejar islas)
RODEO = 1.3          # los caminos reales no son en línea recta
VELOCIDAD = 1.2      # m/s caminando rápido en una evacuación
PASILLO_B_E = 15     # segundos por el pasillo elevado del 2.º piso

TIPOS = ("edificio", "zona segura", "punto seguro")

# Edificios con aulas (la demo usa sus salones): dentro de backend/datos.py cada uno se modela
# por pisos; en el grafo exterior se reemplazan por sus dos salidas (este y oeste).
CON_AULAS = {"Edificio B": "B", "Edificio C": "C", "Edificio P": "P"}


def salidas():
    """Posición de la salida este y oeste de cada edificio con aulas (extremos del edificio)."""
    out = {}
    for e in PLANO["edificios"]:
        if e["nombre"] in CON_AULAS:
            xs = [p[0] for p in e["pol"]]
            ys = [p[1] for p in e["pol"]]
            letra, cy = CON_AULAS[e["nombre"]], (min(ys) + max(ys)) / 2
            out[f"{letra} Salida Este"] = (max(xs), cy)
            out[f"{letra} Salida Oeste"] = (min(xs), cy)
    return out


def segundos(d):
    return max(5, round(d * RODEO / VELOCIDAD))


def construir():
    nodos = [l for l in LUGARES if l["tipo"] in TIPOS and l["nombre"] not in CON_AULAS]
    pos = {l["nombre"]: tuple(l["centro_m"]) for l in nodos}
    for nombre, p in salidas().items():
        nodos.append({"nombre": nombre, "tipo": "salida", "centro_m": list(p)})
        pos[nombre] = p
    nombres = [l["nombre"] for l in nodos]
    pares = {}

    def unir(a, b):
        clave = tuple(sorted((a, b)))
        if a != b and clave not in pares:
            pares[clave] = segundos(math.dist(pos[a], pos[b]))

    # 1. vecinos más cercanos
    for a in nombres:
        cerca = sorted((math.dist(pos[a], pos[b]), b) for b in nombres if b != a)
        for d, b in cerca[:VECINOS]:
            if d <= MAX_M:
                unir(a, b)
    # 2. árbol de expansión mínima (Kruskal) para garantizar que todo esté conectado
    padre = {n: n for n in nombres}

    def raiz(n):
        while padre[n] != n:
            padre[n] = padre[padre[n]]
            n = padre[n]
        return n

    for a, b in pares:
        padre[raiz(a)] = raiz(b)
    todas = sorted((math.dist(pos[a], pos[b]), a, b) for i, a in enumerate(nombres) for b in nombres[i + 1:])
    for d, a, b in todas:
        if raiz(a) != raiz(b):
            padre[raiz(a)] = raiz(b)
            unir(a, b)
    # (el pasillo elevado B-E del 2.º piso va dentro del edificio: B-210 <-> Edificio E, en datos.py)
    caminos = sorted((a, b, s) for (a, b), s in pares.items())
    return nodos, pos, caminos


# ---------------------------------------------------------------- Dijkstra (solo para la ruta de ejemplo)
def ruta_mas_corta(caminos, origen, destinos):
    adj = {}
    for a, b, s in caminos:
        adj.setdefault(a, []).append((b, s))
        adj.setdefault(b, []).append((a, s))
    dist, prev, visit = {origen: 0}, {origen: None}, set()
    while True:
        pend = [(d, n) for n, d in dist.items() if n not in visit]
        if not pend:
            break
        d, n = min(pend)
        visit.add(n)
        for m, s in adj.get(n, []):
            if d + s < dist.get(m, math.inf):
                dist[m], prev[m] = d + s, n
    mejor = min(destinos, key=lambda z: dist.get(z, math.inf))
    ruta, n = [], mejor
    while n is not None:
        ruta.insert(0, n)
        n = prev[n]
    return ruta, dist[mejor]


# ---------------------------------------------------------------- dibujo 2D
def dibujo(nodos, pos, caminos, ruta):
    W, H, M = 1100, 1100, 60
    xs = [p[0] for p in PLANO["campus"]]
    ys = [p[1] for p in PLANO["campus"]]
    esc = min((W - 2 * M) / (max(xs) - min(xs)), (H - 2 * M - 80) / (max(ys) - min(ys)))

    def T(x, y):
        return (M + (x - min(xs)) * esc, M + 80 + (y - min(ys)) * esc)

    def poly(p):
        return " ".join(f"{a:.1f},{b:.1f}" for a, b in (T(*q) for q in p))

    tipo = {l["nombre"]: l["tipo"] for l in nodos}
    en_ruta = set(zip(ruta, ruta[1:])) | set(zip(ruta[1:], ruta))
    g = [f'<rect width="{W}" height="{H}" fill="#f4f9ff"/>',
         f'<text x="{W / 2}" y="40" text-anchor="middle" font-size="26" font-weight="900" fill="#0058b8">Grafo del campus UAM · capa 2 (navegación)</text>',
         f'<text x="{W / 2}" y="68" text-anchor="middle" font-size="14" font-weight="600" fill="#0080ff">{len(nodos)} vértices · {2 * len(caminos)} aristas dirigidas (cada camino va en los dos sentidos) · peso = segundos a pie</text>',
         f'<polygon points="{poly(PLANO["campus"])}" fill="#e7f2dc" stroke="#b9c79f" stroke-width="2"/>']
    for e in PLANO["edificios"]:
        g.append(f'<polygon points="{poly(e["pol"])}" fill="#dfe5ec" stroke="#c3ccd6"/>')
    for c in PLANO["canchas"]:
        g.append(f'<polygon points="{poly(c["pol"])}" fill="#bfe6c4" stroke="#8fd09a"/>')
    for a, b, s in caminos:
        (x1, y1), (x2, y2) = T(*pos[a]), T(*pos[b])
        ruta_ = (a, b) in en_ruta
        pasillo = {a, b} == {"Edificio B", "Edificio E"}
        color = "#cc0000" if ruta_ else "#f5a524" if pasillo else "#7fa6d6"
        g.append(f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" stroke="{color}" stroke-width="{5 if ruta_ else 2}"'
                 f'{" stroke-dasharray=\"6 4\"" if pasillo else ""}/>')
        mx, my = (x1 + x2) / 2, (y1 + y2) / 2
        g.append(f'<text x="{mx:.1f}" y="{my:.1f}" font-size="10" font-weight="700" text-anchor="middle" dominant-baseline="central" '
                 f'fill="{"#cc0000" if ruta_ else "#3d6e9e"}" stroke="#f4f9ff" stroke-width="3" paint-order="stroke">{s}</text>')
    for l in nodos:
        x, y = T(*pos[l["nombre"]])
        col = {"edificio": "#0080ff", "zona segura": "#2f9e48", "punto seguro": "#1e9e4a", "salida": "#cc0000"}[l["tipo"]]
        r = 9 if l["tipo"] == "edificio" else 11
        forma = (f'<rect x="{x - r:.1f}" y="{y - r:.1f}" width="{2 * r}" height="{2 * r}" rx="4" fill="{col}" stroke="#fff" stroke-width="2"/>'
                 if l["tipo"] != "edificio" else f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r}" fill="{col}" stroke="#fff" stroke-width="2"/>')
        if l["nombre"] in ruta:
            forma = forma.replace('stroke="#fff"', 'stroke="#cc0000"').replace('stroke-width="2"', 'stroke-width="3.5"')
        g.append(forma)
        nombre = l["nombre"].replace("Punto Seguro ", "PS ").replace("Zona Segura ", "ZS ")
        g.append(f'<text x="{x:.1f}" y="{y + r + 11:.1f}" font-size="10.5" font-weight="700" text-anchor="middle" fill="#0b2a4a" '
                 f'stroke="#f4f9ff" stroke-width="3" paint-order="stroke">{nombre}</text>')
    # leyenda
    y0 = H - 50
    g.append(f'<rect x="40" y="{y0 - 22}" width="{W - 80}" height="44" rx="22" fill="#fff" stroke="#0080ff" stroke-width="2"/>')
    items = [("circle", "#0080ff", "Edificio"), ("rect", "#1e9e4a", "Zona / punto seguro"), ("line", "#7fa6d6", "Camino (s)"),
             ("rect", "#cc0000", "Salida de B, C o P (por dentro: aulas por piso)"), ("ruta", "#cc0000", "Ruta de ejemplo")]
    x = 64
    for forma, col, txt in items:
        if forma == "circle":
            g.append(f'<circle cx="{x}" cy="{y0}" r="7" fill="{col}"/>')
        elif forma == "rect":
            g.append(f'<rect x="{x - 7}" y="{y0 - 7}" width="14" height="14" rx="3" fill="{col}"/>')
        else:
            g.append(f'<line x1="{x - 9}" y1="{y0}" x2="{x + 9}" y2="{y0}" stroke="{col}" stroke-width="{5 if forma == "ruta" else 3}"{" stroke-dasharray=\"5 3\"" if forma == "dash" else ""}/>')
        g.append(f'<text x="{x + 16}" y="{y0 + 1}" font-size="13" font-weight="700" fill="#0058b8" dominant-baseline="central">{txt}</text>')
        x += 40 + len(txt) * 7.4
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" '
           f'font-family="Montserrat, \'Segoe UI\', Arial, sans-serif">{"".join(g)}</svg>')
    (AQUI / "grafo-campus.svg").write_text(svg, encoding="utf-8")
    (AQUI / "grafo-campus.html").write_text(
        f'<!doctype html><meta charset="utf-8"><title>Grafo del campus UAM</title><style>html,body{{margin:0}}img{{display:block}}</style>'
        f'<img src="grafo-campus.svg" width="{W}" height="{H}" alt="Grafo del campus UAM">', encoding="utf-8")


def main():
    nodos, pos, caminos = construir()
    seguros = [l["nombre"] for l in nodos if l["tipo"] != "edificio"]
    seguros = [n for n in seguros if n.startswith(("Zona", "Punto"))]
    ruta, t = ruta_mas_corta(caminos, "C Salida Oeste", seguros)
    (AQUI / "grafo-campus.json").write_text(json.dumps({
        "vertices": [{"nombre": l["nombre"], "tipo": l["tipo"], "x_m": pos[l["nombre"]][0], "y_m": pos[l["nombre"]][1]} for l in nodos],
        "caminos": [{"a": a, "b": b, "segundos": s} for a, b, s in caminos],
        "zonasSeguras": seguros,
        "ejemplo": {"origen": "C Salida Oeste", "ruta": ruta, "segundos": t},
    }, ensure_ascii=False, indent=1), encoding="utf-8")
    dibujo(nodos, pos, caminos, ruta)
    # Plano liviano para la app (pantalla Campus): posiciones en metros y fondo del campus.
    r1 = lambda p: [round(p[0], 1), round(p[1], 1)]
    plano = {
        "fuente": "© colaboradores de OpenStreetMap (ODbL)",
        "posiciones": {l["nombre"]: r1(pos[l["nombre"]]) for l in nodos},
        "campus": [r1(p) for p in PLANO["campus"]],
        "edificios": [[r1(p) for p in e["pol"]] for e in PLANO["edificios"]],
        "canchas": [[r1(p) for p in c["pol"]] for c in PLANO["canchas"]],
        "parqueos": [[r1(p) for p in q["pol"]] for q in PLANO["parqueos"]],
    }
    destino = AQUI.parent.parent / "frontend" / "static" / "campus-plano.json"
    destino.write_text(json.dumps(plano, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{len(nodos)} vertices, {len(caminos)} caminos ({2 * len(caminos)} aristas dirigidas)")
    print("Ejemplo C Salida Oeste:", " -> ".join(ruta), f"({t} s)")
    print("\n# ---- para backend/datos.py ----")
    for a, b, s in caminos:
        print(f'        ("{a}", "{b}", {s}),')


if __name__ == "__main__":
    main()
