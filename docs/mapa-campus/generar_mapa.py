"""
Mapa 3D (axonométrico) del campus UAM con la marca Unexuam.

Dibuja el plano REAL del campus a partir de `campus-osm.json` (datos de OpenStreetMap, extraídos
con `extraer_osm.py`): contorno del campus, los 38 edificios con su forma real, calles, parqueos,
cancha de fútbol y campo de béisbol. Todo se genera sin internet. Produce en esta carpeta:
  - mapa-campus-3d.svg   ilustración vectorial
  - mapa-campus-3d.html  página para exportar el PNG con Edge en modo headless (ver README.md)
  - lugares.json         lugares del mapa (nombre, tipo, centro en metros) para que
                          backend/datos.py use los mismos nombres que se dibujan

Nombres: los que trae OpenStreetMap (Edificio I, E, A, Jaguar Center), el Edificio P (indicado por
James) y, para el resto, «Edificio sin nombre N», numerados de norte a sur y de oeste a este.
Datos del plano © OpenStreetMap contributors (ODbL).

Uso:  python generar_mapa.py
"""

import json
import math
from pathlib import Path

AQUI = Path(__file__).parent
DATOS = json.loads((AQUI / "campus-osm.json").read_text(encoding="utf-8"))

# ---------------------------------------------------------------- paleta Unexuam
AZUL = "#0080ff"
AZUL_OSC = "#0058b8"
ROJO = "#cc0000"
AMARILLO = "#fcd222"
BLANCO = "#ffffff"
GRIS = "#7d8a99"
FUENTE = "Montserrat, 'Segoe UI', Bahnschrift, Arial, sans-serif"

# ---------------------------------------------------------------- proyección
ANG = math.radians(16)   # giro del plano
K = 0.58                 # inclinación (achatamiento vertical)
CA, SA = math.cos(ANG), math.sin(ANG)
ESC, OX, OY = 1.0, 0.0, 0.0   # se calculan con encajar()
ALTURA = 1.0                   # exageración de las alturas para que se lea el 3D

CAMPUS = [tuple(p) for p in DATOS["campus"]]


def P(x, y, z=0.0):
    xr = x * CA - y * SA
    yr = x * SA + y * CA
    return (xr * ESC + OX, (yr * K - z * ALTURA) * ESC + OY)


def encajar(x0, y0, x1, y1):
    """Ajusta ESC, OX y OY para que el campus (con su relieve) quepa en el rectángulo dado."""
    global ESC, OX, OY
    ESC, OX, OY = 1.0, 0.0, 0.0
    pts_ = [P(x, y, z) for x, y in CAMPUS for z in (-6, 20)]
    bx0, bx1 = min(p[0] for p in pts_), max(p[0] for p in pts_)
    by0, by1 = min(p[1] for p in pts_), max(p[1] for p in pts_)
    ESC = min((x1 - x0) / (bx1 - bx0), (y1 - y0) / (by1 - by0))
    OX = x0 + ((x1 - x0) - (bx1 - bx0) * ESC) / 2 - bx0 * ESC
    OY = y0 + ((y1 - y0) - (by1 - by0) * ESC) / 2 - by0 * ESC


def prof(x, y):
    """Profundidad: mayor = más cerca del observador (se dibuja después)."""
    return x * SA + y * CA


def pts(lista, z=0.0):
    return " ".join(f"{a:.1f},{b:.1f}" for a, b in (P(x, y, z) for x, y in lista))


def elipse(cx, cy, rx, ry, n=48):
    return [(cx + rx * math.cos(2 * math.pi * i / n), cy + ry * math.sin(2 * math.pi * i / n)) for i in range(n)]


def mezclar(hex1, hex2, t):
    a = [int(hex1[i:i + 2], 16) for i in (1, 3, 5)]
    b = [int(hex2[i:i + 2], 16) for i in (1, 3, 5)]
    return "#" + "".join(f"{round(a[i] + (b[i] - a[i]) * t):02x}" for i in range(3))


def dentro(punto, poligono):
    x, y = punto
    c = False
    for i in range(len(poligono)):
        x1, y1 = poligono[i]
        x2, y2 = poligono[(i + 1) % len(poligono)]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            c = not c
    return c


def centro(p):
    """Centroide de área de un polígono."""
    a = cx = cy = 0.0
    for i in range(len(p)):
        x1, y1 = p[i]
        x2, y2 = p[(i + 1) % len(p)]
        f = x1 * y2 - x2 * y1
        a += f
        cx += (x1 + x2) * f
        cy += (y1 + y2) * f
    if abs(a) < 1e-9:
        return (sum(q[0] for q in p) / len(p), sum(q[1] for q in p) / len(p))
    return (cx / (3 * a), cy / (3 * a))


# ---------------------------------------------------------------- luz del render
# Sol desde el noroeste (cartografía clásica): techos claros, caras oeste iluminadas y caras
# sur y este en sombra. Las sombras arrojadas caen hacia el sureste.
SOL = (-math.sqrt(.5), -math.sqrt(.5))          # dirección hacia el sol en el plano (x este, y sur)
SOMBRA_K = 1 / math.tan(math.radians(50))       # largo de la sombra por metro de altura
GRADS = {}                                      # degradados compartidos (se escriben en <defs>)
SOMBRAS = []                                    # sombras arrojadas, en un solo grupo difuminado
CONTACTO = []                                   # oclusión ambiental en la base de cada volumen


def luz(nx, ny):
    """0 = cara de espaldas al sol, 1 = cara de frente al sol (cuantizado para reusar degradados)."""
    return round((nx * SOL[0] + ny * SOL[1] + 1) / 2 * 8) / 8


def cara(color):
    """Degradado vertical compartido para una cara: arriba más clara, abajo oclusión ambiental."""
    gid = "m" + color[1:]
    if gid not in GRADS:
        GRADS[gid] = (f'<linearGradient id="{gid}" x1="0" y1="0" x2="0" y2="1">'
                      f'<stop offset="0" stop-color="{mezclar(color, "#ffffff", .12)}"/>'
                      f'<stop offset=".72" stop-color="{color}"/>'
                      f'<stop offset="1" stop-color="{mezclar(color, "#13263d", .2)}"/></linearGradient>')
    return f"url(#{gid})"


def casco(puntos):
    """Envolvente convexa (cadena monótona)."""
    p = sorted(set((round(x, 2), round(y, 2)) for x, y in puntos))
    if len(p) < 3:
        return p

    def giro(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    lo, hi = [], []
    for q in p:
        while len(lo) >= 2 and giro(lo[-2], lo[-1], q) <= 0:
            lo.pop()
        lo.append(q)
    for q in reversed(p):
        while len(hi) >= 2 and giro(hi[-2], hi[-1], q) <= 0:
            hi.pop()
        hi.append(q)
    return lo[:-1] + hi[:-1]


def desplazo(h):
    d = h * SOMBRA_K * math.sqrt(.5)
    return d, d


def sombra(pol, alto, z0=0.0):
    """Sombra arrojada sobre el suelo. Con z0 > 0 (techos sobre columnas) solo cae la losa."""
    dx, dy = desplazo(alto)
    if z0 > 0:
        SOMBRAS.append(f'<polygon points="{pts([(x + dx, y + dy) for x, y in pol])}"/>')
    else:
        SOMBRAS.append(f'<polygon points="{pts(casco(list(pol) + [(x + dx, y + dy) for x, y in pol]))}"/>')
        CONTACTO.append(f'<polygon points="{pts(pol)}"/>')


# ---------------------------------------------------------------- primitivas
def suelo(poligono, relleno, z=0.0, borde=None, ancho=1.2):
    b = f' stroke="{borde}" stroke-width="{ancho}" stroke-linejoin="round"' if borde else ""
    return f'<polygon points="{pts(poligono, z)}" fill="{relleno}"{b}/>'


def paralela(puntos, d):
    """Polilínea desplazada d metros a la izquierda (para bordes de calzada)."""
    out = []
    for i, (x, y) in enumerate(puntos):
        a = puntos[max(0, i - 1)]
        b = puntos[min(len(puntos) - 1, i + 1)]
        dx, dy = b[0] - a[0], b[1] - a[1]
        l = math.hypot(dx, dy) or 1
        out.append((x - dy / l * d, y + dx / l * d))
    return out


def via(puntos, ancho, relleno, borde=None, centro_=None, bordes=True):
    """Calle como banda de ancho fijo (en metros) a lo largo de una polilínea del plano:
    bordillo, asfalto, líneas de borde y línea central discontinua."""
    g = []
    for capa, w, col in ((0, ancho + 1.2, borde), (1, ancho, relleno)):
        if col is None:
            continue
        for (x1, y1), (x2, y2) in zip(puntos, puntos[1:]):
            dx, dy = x2 - x1, y2 - y1
            l = math.hypot(dx, dy) or 1
            nx, ny = -dy / l * w / 2, dx / l * w / 2
            g.append(suelo([(x1 + nx, y1 + ny), (x2 + nx, y2 + ny), (x2 - nx, y2 - ny), (x1 - nx, y1 - ny)], col))
        for x, y in puntos[1:-1]:
            g.append(suelo(elipse(x, y, w / 2, w / 2, 14), col))
    if centro_:
        for s in ((-1, 1) if bordes else ()):
            g.append(f'<polyline points="{pts(paralela(puntos, s * (ancho / 2 - .7)))}" fill="none" stroke="#f4f6f8" stroke-width=".9" opacity=".85"/>')
        g.append(f'<polyline points="{pts(puntos)}" fill="none" stroke="{centro_}" stroke-width="1.4" stroke-dasharray="9 8"/>')
    return "".join(g)


def paredes(poligono, z0, z1, claro, oscuro, borde):
    """Caras laterales visibles de un prisma (sirve para polígonos cóncavos: se ordenan por profundidad)."""
    cx, cy = centro(poligono)
    horario = sum(poligono[i][0] * poligono[(i + 1) % len(poligono)][1] - poligono[(i + 1) % len(poligono)][0] * poligono[i][1]
                  for i in range(len(poligono))) > 0
    caras = []
    for i in range(len(poligono)):
        a, b = poligono[i], poligono[(i + 1) % len(poligono)]
        dx, dy = b[0] - a[0], b[1] - a[1]
        l = math.hypot(dx, dy) or 1
        # normal exterior según el sentido del polígono (y hacia abajo)
        nx, ny = (dy / l, -dx / l) if horario else (-dy / l, dx / l)
        if (nx * SA + ny * CA) <= 0.02:
            continue
        color = mezclar(oscuro, claro, luz(nx, ny))
        q = [P(*a, z0), P(*b, z0), P(*b, z1), P(*a, z1)]
        d = " ".join(f"{u:.1f},{v:.1f}" for u, v in q)
        relleno = cara(color) if z1 - z0 > 1.5 else color
        caras.append((prof((a[0] + b[0]) / 2, (a[1] + b[1]) / 2),
                      f'<polygon points="{d}" fill="{relleno}" stroke="{borde}" stroke-width=".6" stroke-linejoin="round"/>'))
    caras.sort()
    return "".join(c for _, c in caras)


def fachada(poligono, alto, pisos, claro, oscuro, borde, acentos=()):
    """Paredes visibles con una franja de ventanas azules por piso y los acentos de cada edificio
    (ladrillo, muro de cristal, franja azul, barandas), según las fotos de la UAM."""
    horario = sum(poligono[i][0] * poligono[(i + 1) % len(poligono)][1] - poligono[(i + 1) % len(poligono)][0] * poligono[i][1]
                  for i in range(len(poligono))) > 0
    caras = []
    for i in range(len(poligono)):
        a, b = poligono[i], poligono[(i + 1) % len(poligono)]
        dx, dy = b[0] - a[0], b[1] - a[1]
        l = math.hypot(dx, dy) or 1
        nx, ny = (dy / l, -dx / l) if horario else (-dy / l, dx / l)
        vis = nx * SA + ny * CA
        if vis <= 0.02:
            continue
        caras.append({"a": a, "b": b, "t": luz(nx, ny), "nx": nx, "ny": ny, "peso": vis * l, "prof": prof((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)})
    if not caras:
        return ""
    frente = max(caras, key=lambda c: c["peso"])

    def tramo(c, t0, t1, z0, z1):
        (ax, ay), (bx, by) = c["a"], c["b"]
        q = [P(ax + (bx - ax) * t0, ay + (by - ay) * t0, z0), P(ax + (bx - ax) * t1, ay + (by - ay) * t1, z0),
             P(ax + (bx - ax) * t1, ay + (by - ay) * t1, z1), P(ax + (bx - ax) * t0, ay + (by - ay) * t0, z1)]
        return " ".join(f"{u:.1f},{v:.1f}" for u, v in q)

    g = []
    for c in sorted(caras, key=lambda c: c["prof"]):
        color = mezclar(oscuro, claro, c["t"])
        for ac in acentos:               # una cara con otro color (M: costado este gris azulado, video)
            if ac[0] == "cara_este" and c["nx"] > .7:
                color = mezclar(mezclar(ac[1], "#33404e", .3), ac[1], c["t"])
        g.append(f'<polygon points="{tramo(c, 0, 1, 0, alto)}" fill="{cara(color)}" stroke="{borde}" stroke-width=".6" stroke-linejoin="round"/>')
        largo = math.dist(c["a"], c["b"])
        tipos = {ac[0] for ac in acentos}
        if "sur_lisa" in tipos and c["ny"] > .7:
            # muro liso casi sin ventanas, con aires acondicionados y tuberías (foto de Google Maps)
            (ax, ay), (bx, by) = c["a"], c["b"]
            for t0, z0 in ((.35, 3.2), (.42, 3.2), (.35, 6.8), (.55, 1.0)):
                g.append(f'<polygon points="{tramo(c, t0, t0 + .06, z0, z0 + .9)}" fill="#d3d9df" stroke="#7d8a99" stroke-width=".5"/>')
            for t0 in (.47, .6):
                u, v = P(ax + (bx - ax) * t0, ay + (by - ay) * t0, .2), P(ax + (bx - ax) * t0, ay + (by - ay) * t0, alto - 1.5)
                g.append(f'<line x1="{u[0]:.1f}" y1="{u[1]:.1f}" x2="{v[0]:.1f}" y2="{v[1]:.1f}" stroke="#9aa6b3" stroke-width=".8"/>')
            g.append(f'<polygon points="{tramo(c, .12, .2, 4.5, 5.6)}" fill="#3a4552"/>')
        elif largo > 2.5:
            vidrio = ("url(#vidrioD)" if "vidrio_oscuro" in tipos else "url(#vidrioV)" if "vidrio_verde" in tipos
                      else "url(#vidrio%d)" % min(2, int(c["t"] * 3)))
            losa = mezclar(color, "#ffffff", .55)
            (ax, ay), (bx, by) = c["a"], c["b"]
            for f in range(pisos):
                z0 = f * PISO + 1.0
                if z0 + 1.5 > alto - 0.3:
                    break
                # hilera de ventanas del piso (parteluces verticales en el patrón) y alféizar claro
                g.append(f'<polygon points="{tramo(c, .06, .94, z0, z0 + 1.5)}" fill="{vidrio}"/>')
                if f:
                    u, v = P(ax, ay, f * PISO), P(bx, by, f * PISO)
                    g.append(f'<line x1="{u[0]:.1f}" y1="{u[1]:.1f}" x2="{v[0]:.1f}" y2="{v[1]:.1f}" stroke="{losa}" stroke-width=".9"/>')
        for ac in acentos:               # cornisa o franja gris continua en todas las caras visibles
            if ac[0] == "cornisa":
                g.append(f'<polygon points="{tramo(c, 0, 1, alto - ac[2], alto)}" fill="{mezclar(ac[1], "#ffffff", c["t"] * .25)}"/>')
            elif ac[0] == "zocalo":      # franja de color en la parte baja de los muros
                g.append(f'<polygon points="{tramo(c, 0, 1, 0, .9)}" fill="{mezclar(ac[1], "#0b3a4a", (1 - c["t"]) * .25)}"/>')
        if c is frente:
            for ac in acentos:
                tipo = ac[0]
                if tipo == "aires":          # aires acondicionados alineados en planta baja (Clínicas)
                    largo_f = math.dist(c["a"], c["b"])
                    for k in range(int(largo_f // 4.5)):
                        t0 = (k + .5) * 4.5 / largo_f
                        g.append(f'<polygon points="{tramo(c, t0, t0 + .9 / largo_f, .2, .9)}" fill="#e3e7eb" stroke="#7d8a99" stroke-width=".4"/>')
                elif tipo == "ladrillo":     # paño de ladrillo terracota entre balcones (Edificio M, foto)
                    g.append(f'<polygon points="{tramo(c, ac[1], ac[2], PISO, alto - 1.3)}" fill="#b5523b" stroke="#7a3322" stroke-width=".6"/>')
                    for f in range(2, 8):
                        (ax, ay), (bx, by) = c["a"], c["b"]
                        z = PISO + f * .9
                        if z > alto - 1.5:
                            break
                        u = P(ax + (bx - ax) * ac[1], ay + (by - ay) * ac[1], z)
                        v = P(ax + (bx - ax) * ac[2], ay + (by - ay) * ac[2], z)
                        g.append(f'<line x1="{u[0]:.1f}" y1="{u[1]:.1f}" x2="{v[0]:.1f}" y2="{v[1]:.1f}" stroke="#8e3b28" stroke-width=".4"/>')
                elif tipo == "cristal":      # muro cortina de vidrio (UAM College)
                    g.append(f'<polygon points="{tramo(c, ac[1], ac[2], .4, alto - .2)}" fill="#33b5c2" opacity=".9" stroke="#1d7f8a" stroke-width=".7"/>')
                elif tipo == "franja":       # franja azul con letras doradas (Clínicas, «Edificio N»)
                    g.append(f'<polygon points="{tramo(c, 0, 1, alto - 1.5, alto - .3)}" fill="{AZUL}"/>')
                    g.append(f'<polygon points="{tramo(c, .4, .6, alto - 1.15, alto - .65)}" fill="#e6c15a"/>')
                elif tipo == "barandas":     # pasillos abiertos con baranda en los pisos altos
                    col = ac[1] if len(ac) > 1 else "#6b7785"
                    for f in range(1, pisos):
                        z = f * PISO + 1.0
                        (ax, ay), (bx, by) = c["a"], c["b"]
                        a2, b2 = P(ax, ay, z), P(bx, by, z)
                        g.append(f'<line x1="{a2[0]:.1f}" y1="{a2[1]:.1f}" x2="{b2[0]:.1f}" y2="{b2[1]:.1f}" stroke="{col}" stroke-width="1.5"/>')
    return "".join(g)


def losa_techo(color):
    """Degradado diagonal compartido del techo: más claro hacia el noroeste (lado del sol)."""
    if color.startswith("url"):
        return color
    gid = "t" + color[1:]
    if gid not in GRADS:
        GRADS[gid] = (f'<linearGradient id="{gid}" x1="0" y1="0" x2="1" y2="1">'
                      f'<stop offset="0" stop-color="{mezclar(color, "#ffffff", .5)}"/>'
                      f'<stop offset="1" stop-color="{mezclar(color, "#5b6b7d", .1)}"/></linearGradient>')
    return f"url(#{gid})"


def equipos(poligono, alto, n=3):
    """Equipos de aire acondicionado en techos grandes (detalle de render)."""
    xs = [q[0] for q in poligono]
    ys = [q[1] for q in poligono]
    cx, cy = centro(poligono)
    w, h = max(xs) - min(xs), max(ys) - min(ys)
    g = []
    for k in range(n):
        t = (k + .5) / n - .5
        x, y = (cx + t * w * .6, cy - h * .12) if w >= h else (cx - w * .12, cy + t * h * .6)
        caja = caja_r(x - 1.3, y - .9, x + 1.3, y + .9)
        if all(dentro(q, poligono) for q in caja):
            g.append(paredes(caja, alto, alto + 1.0, "#d9dfe6", "#9aa6b3", "#7d8a99") +
                     f'<polygon points="{pts(caja, alto + 1.0)}" fill="#eef1f4" stroke="#7d8a99" stroke-width=".5"/>')
    return "".join(g)


def edificio(poligono, alto, techo, claro, oscuro, borde, pisos=0, acentos=(), sombra_=True):
    muros = fachada(poligono, alto, pisos, claro, oscuro, borde, acentos) if pisos else paredes(poligono, 0, alto, claro, oscuro, borde)
    if sombra_:
        sombra(poligono, alto)
    return muros + (f'<polygon points="{pts(poligono, alto)}" fill="{losa_techo(techo)}" stroke="{borde}" stroke-width=".9" stroke-linejoin="round"/>'
                    + brillo(poligono, alto, techo) +
                    f'<polygon points="{pts(poligono, alto)}" fill="none" stroke="#ffffff" stroke-width=".7" opacity=".7" transform="translate(-.6,-.5)"/>')


def brillo(poligono, alto, techo):
    """Reflejo del cielo sobre las celdas solares (vidrio brillante)."""
    return f'<polygon points="{pts(poligono, alto)}" fill="url(#brillo)"/>' if techo == "url(#solar)" else ""


def cubierta(poligono, alto, techo, borde, lado="#f6f7f9"):
    """Techo sobre columnas (edificios marcados como «roof» en OSM, p. ej. Jaguar Center)."""
    g = []
    for x, y in poligono:
        (x1, y1), (x2, y2) = P(x, y, 0), P(x, y, alto)
        g.append(f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" stroke="{borde}" stroke-width="2.2"/>')
    g.append(f'<polygon points="{pts(poligono, 0)}" fill="#d9e6f2" opacity=".55"/>')
    g.append(paredes(poligono, alto, alto + 1.4, mezclar(lado, "#000000", .05), mezclar(lado, "#000000", .25), borde))
    g.append(f'<polygon points="{pts(poligono, alto + 1.4)}" fill="{losa_techo(techo)}" stroke="{borde}" stroke-width="1" stroke-linejoin="round" opacity=".96"/>')
    g.append(brillo(poligono, alto + 1.4, techo))
    sombra(poligono, alto + 1.4, z0=alto)
    return "".join(g)


def barril(poligono, pared, flecha, n=14):
    """Jaguar Center: cancha de baloncesto techada (foto de Google Maps). Cerchas y columnas de acero
    turquesa, bóveda de lámina clara, malla turquesa alrededor y piso gris con zonas azules.
    La bóveda corre de oeste a este; el arco se ve en las fachadas este y oeste."""
    p0, p1, p2, p3 = poligono[:4]
    if abs(p1[0] - p0[0]) < abs(p1[1] - p0[1]):      # que p0→p1 sea el lado oeste-este
        p0, p1, p2, p3 = p1, p2, p3, p0

    def punto(u, v):
        a = (p0[0] + (p1[0] - p0[0]) * u, p0[1] + (p1[1] - p0[1]) * u)
        b = (p3[0] + (p2[0] - p3[0]) * u, p3[1] + (p2[1] - p3[1]) * u)
        return (a[0] + (b[0] - a[0]) * v, a[1] + (b[1] - a[1]) * v)

    def q(*ps):
        return " ".join(f"{a:.1f},{b:.1f}" for a, b in (P(*pp) for pp in ps))
    TURQ, TURQ_OSC = "#1fb5b8", "#11797c"
    sombra(poligono, pared + flecha * .8, z0=pared)
    g = [f'<polygon points="{pts(poligono)}" fill="#c9ced3" stroke="{TURQ_OSC}" stroke-width=".6"/>']
    # cancha: piso gris con zonas azules y líneas
    cancha = [punto(.12, .2), punto(.88, .2), punto(.88, .8), punto(.12, .8)]
    g.append(f'<polygon points="{pts(cancha)}" fill="#d9dde1" stroke="#ffffff" stroke-width="1"/>')
    for u0, u1 in ((.12, .27), (.73, .88)):
        g.append(f'<polygon points="{pts([punto(u0, .38), punto(u1, .38), punto(u1, .62), punto(u0, .62)])}" fill="#4f86c6"/>')
    g.append(f'<polyline points="{pts([punto(.5, .2), punto(.5, .8)])}" fill="none" stroke="#ffffff" stroke-width="1"/>')
    g.append(f'<polygon points="{pts([punto(.5 + .05 * math.cos(t), .5 + .1 * math.sin(t)) for t in [k * math.pi / 8 for k in range(16)]])}" fill="#4f86c6" stroke="#ffffff" stroke-width=".8"/>')
    # malla turquesa perimetral (baja) en las caras visibles
    g.append(paredes(poligono, 0, 2.6, "#5fd3d5", "#1c9a9d", TURQ_OSC).replace('<polygon ', '<polygon fill-opacity=".45" '))
    # columnas de acero
    for u in [k / 4 for k in range(5)]:
        for v in (0, 1):
            a, b = P(*punto(u, v), 0), P(*punto(u, v), pared)
            g.append(f'<line x1="{a[0]:.1f}" y1="{a[1]:.1f}" x2="{b[0]:.1f}" y2="{b[1]:.1f}" stroke="{TURQ}" stroke-width="1.6"/>')
    # bóveda de lámina clara: franjas de norte (v=0) a sur (v=1)
    for i in range(n):
        v0, v1 = i / n, (i + 1) / n
        z0 = pared + flecha * math.sin(math.pi * v0)
        z1 = pared + flecha * math.sin(math.pi * v1)
        pend = math.cos(math.pi * (v0 + v1) / 2)          # >0 mira al norte (al sol)
        color = mezclar("#b9c3cc", "#fbfcfd", max(0, min(1, .55 + pend * .45)))
        g.append(f'<polygon points="{q((*punto(0, v0), z0), (*punto(1, v0), z0), (*punto(1, v1), z1), (*punto(0, v1), z1))}" fill="{color}" stroke="{color}" stroke-width=".6"/>')
    # cerchas turquesa sobre la bóveda y arco del frente este (abierto, con su celosía)
    for u in [k / 4 for k in range(5)]:
        arco = [P(*punto(u, k / n), pared + flecha * math.sin(math.pi * k / n)) for k in range(n + 1)]
        g.append(f'<polyline points="{" ".join(f"{a:.1f},{b:.1f}" for a, b in arco)}" fill="none" stroke="{TURQ}" stroke-width="{1.8 if u == 1 else 1.1}"/>')
    arco_bajo = [P(*punto(1, k / n), pared - .9 + (flecha - .4) * math.sin(math.pi * k / n)) for k in range(n + 1)]
    g.append(f'<polyline points="{" ".join(f"{a:.1f},{b:.1f}" for a, b in arco_bajo)}" fill="none" stroke="{TURQ}" stroke-width="1"/>')
    for k in range(0, n + 1, 2):     # diagonales de la celosía del arco este
        a = P(*punto(1, k / n), pared + flecha * math.sin(math.pi * k / n))
        b = P(*punto(1, min(1, (k + 1) / n)), pared - .9 + (flecha - .4) * math.sin(math.pi * min(1, (k + 1) / n)))
        g.append(f'<line x1="{a[0]:.1f}" y1="{a[1]:.1f}" x2="{b[0]:.1f}" y2="{b[1]:.1f}" stroke="{TURQ}" stroke-width=".6"/>')
    return "".join(g)


def terraza(pol, alto):
    """Techo limpio del Edificio P (simplificado para evitar ruido visual en 3er piso)."""
    return ""


def cara_plana(x0, y0, x1, y1, z0, z1, color, extra=""):
    q = [P(x0, y0, z0), P(x1, y1, z0), P(x1, y1, z1), P(x0, y0, z1)]
    return f'<polygon points="{" ".join(f"{a:.1f},{b:.1f}" for a, b in q)}" fill="{color}" {extra}/>'


def observatorio(pol_p, alto_p):
    """Torre del observatorio en el extremo ESTE del Edificio P Copérnico (fotos de la UAM):
    muro blanco, franja verde arriba, sello dorado y letras UAM, ventanas oscuras y cúpula blanca."""
    xs = [q[0] for q in pol_p]
    ys = [q[1] for q in pol_p]
    x1 = max(xs) - 1
    cy = (min(ys) + max(ys)) / 2
    torre = caja_r(x1 - 7, cy - 3.5, x1, cy + 3.5)
    alto = alto_p + 3.6
    g = [edificio(torre, alto, "#fbfcfd", "#eef1f4", "#aab4bf", "#7d8a99", pisos=0)]
    sur, este = cy + 3.5, x1
    # franja verde en lo alto de las dos caras visibles (sur y este)
    g.append(cara_plana(x1 - 7, sur, x1, sur, alto - 1.5, alto - .5, "#2e9b57"))
    g.append(cara_plana(este, sur, este, cy - 3.5, alto - 1.5, alto - .5, "#23824a"))
    # ventanas oscuras cuadradas
    for t in (.2, .6):
        g.append(cara_plana(x1 - 7 + 7 * t, sur, x1 - 7 + 7 * (t + .2), sur, alto - 4.2, alto - 2.8, "#2b3440"))
        g.append(cara_plana(este, sur - 7 * t, este, sur - 7 * (t + .2), alto - 4.2, alto - 2.8, "#232b35"))
    # sello dorado en la cara sur
    sx0, sy0 = P(x1 - 3.5, sur, alto_p - 2.2)
    g.append(f'<circle cx="{sx0:.1f}" cy="{sy0:.1f}" r="{1.0 * ESC:.1f}" fill="#e6c15a" stroke="#b8902b" stroke-width=".8"/>')
    sx, sy = P(x1 - 3.5, cy, alto)
    r = 3.3 * ESC
    g.append(f'<path d="M{sx - r:.1f},{sy:.1f} A{r:.1f},{r:.1f} 0 0 1 {sx + r:.1f},{sy:.1f} Z" fill="#ffffff" stroke="#7d8a99" stroke-width="1"/>')
    g.append(f'<line x1="{sx:.1f}" y1="{sy - r:.1f}" x2="{sx + r * .35:.1f}" y2="{sy - r * .55:.1f}" stroke="#5d6873" stroke-width="1.6"/>')
    return "".join(g)


def carport(pol):
    """Cubierta de parqueo con celdas solares: hileras de paneles azul oscuro inclinados hacia el sur,
    sobre postes y vigas metálicas (capturas de Google Maps entre el P y Clínicas)."""
    xs = [q[0] for q in pol]
    ys = [q[1] for q in pol]
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    zn, zs = 4.9, 3.7                                   # borde norte alto, borde sur bajo
    n_filas = max(1, round((y1 - y0) / 7))
    g = []
    for f in range(n_filas):
        ya, yb = y0 + (y1 - y0) * f / n_filas + .3, y0 + (y1 - y0) * (f + 1) / n_filas - .3
        ym = (ya + yb) / 2
        for k in range(int((x1 - x0) // 6.5) + 1):      # postes y vigas
            x = min(x1 - .4, x0 + .4 + k * 6.5)
            a, b = P(x, ym, 0), P(x, ym, (zn + zs) / 2 - .15)
            g.append(f'<line x1="{a[0]:.1f}" y1="{a[1]:.1f}" x2="{b[0]:.1f}" y2="{b[1]:.1f}" stroke="#5d6873" stroke-width="1.3"/>')
        panel = [(x0, ya, zn), (x1, ya, zn), (x1, yb, zs), (x0, yb, zs)]
        d = " ".join(f"{u:.1f},{v:.1f}" for u, v in (P(*q) for q in panel))
        g.append(f'<polygon points="{d}" fill="url(#solar)" stroke="#2b3a4c" stroke-width=".7" stroke-linejoin="round"/>')
        g.append(f'<polygon points="{d}" fill="url(#brillo)"/>')
        a, b = P(x0, yb, zs), P(x1, yb, zs)            # canto inferior de aluminio
        g.append(f'<line x1="{a[0]:.1f}" y1="{a[1]:.1f}" x2="{b[0]:.1f}" y2="{b[1]:.1f}" stroke="#c3ccd5" stroke-width=".9"/>')
        dx, dy = desplazo(zs)
        SOMBRAS.append(f'<polygon points="{pts([(x0 + dx, ya + dy), (x1 + dx, ya + dy), (x1 + dx, yb + dy), (x0 + dx, yb + dy)])}"/>')
    return "".join(g)


def techado_mesas(poligono, alto):
    """Techo sobre columnas con mesas debajo (comedores al aire libre)."""
    xs = [q[0] for q in poligono]
    ys = [q[1] for q in poligono]
    g = [f'<polygon points="{pts(poligono)}" fill="#e9dcc0" opacity=".9"/>']
    for x in range(int(min(xs)) + 3, int(max(xs)) - 1, 5):
        for y in range(int(min(ys)) + 3, int(max(ys)) - 1, 5):
            if dentro((x, y), poligono):
                g.append(f'<polygon points="{pts(caja_r(x - 1.2, y - .8, x + 1.2, y + .8), 0.8)}" fill="#a0703a"/>')
    g.append(cubierta(poligono, alto, "#e8a33d", "#9a5f10", lado="#f0b860"))
    return "".join(g)


def arbol(x, y, r=3.2):
    """Árbol con copa en volumen (degradado radial con luz del noroeste) y sombra al sureste."""
    var = (int(x * 7 + y * 13) % 5) / 10          # variación determinista de tamaño y tono
    r *= (0.9 + var / 2.5)
    dx, dy = desplazo(r * 1.6)
    s0, s1 = P(x + dx, y + dy)
    SOMBRAS.append(f'<ellipse cx="{s0:.1f}" cy="{s1:.1f}" rx="{r * ESC * 1.05:.1f}" ry="{r * ESC * .62:.1f}"/>')
    r *= ESC
    sx, sy = P(x, y)
    copa = "url(#copa%d)" % (int(var * 10) % 2)
    return (f'<rect x="{sx - 1:.1f}" y="{sy - r * 1.1:.1f}" width="2" height="{r * 1.1:.1f}" fill="#6b4a2e"/>'
            f'<circle cx="{sx + r * .35:.1f}" cy="{sy - r * 1.35:.1f}" r="{r * .7:.1f}" fill="{copa}"/>'
            f'<circle cx="{sx:.1f}" cy="{sy - r * 1.65:.1f}" r="{r:.1f}" fill="{copa}"/>')


def insignia(x, y, z, texto, color=AZUL, letra=BLANCO, r=11):
    sx, sy = P(x, y, z)
    tam = r * (1.25 if len(texto) == 1 else 0.95)
    return (f'<g><circle cx="{sx:.1f}" cy="{sy:.1f}" r="{r + 2:.1f}" fill="{BLANCO}" opacity=".95"/>'
            f'<circle cx="{sx:.1f}" cy="{sy:.1f}" r="{r:.1f}" fill="{color}"/>'
            f'<text x="{sx:.1f}" y="{sy + 0.5:.1f}" font-size="{tam:.1f}" font-weight="800" fill="{letra}" '
            f'text-anchor="middle" dominant-baseline="central">{texto}</text></g>')


def rotulo(ax, ay, az, dx, dy, texto, fondo=BLANCO, color=AZUL, borde=AZUL, tam=14, sub=None, punto=True):
    """Píldora con texto y línea guía hacia el punto (ax, ay, az) del plano."""
    sx, sy = P(ax, ay, az)
    tx, ty = sx + dx, sy + dy
    w = max(len(texto) * tam * 0.62, len(sub or "") * tam * 0.47) + 26
    h = tam + 12 + (tam * 0.95 if sub else 0)
    g = [f'<line x1="{sx:.1f}" y1="{sy:.1f}" x2="{tx:.1f}" y2="{ty:.1f}" stroke="{borde}" stroke-width="1.5" stroke-dasharray="3 3"/>',
         f'<circle cx="{sx:.1f}" cy="{sy:.1f}" r="3.2" fill="{borde}"/>' if punto else '',
         f'<rect x="{tx - w / 2:.1f}" y="{ty - h / 2 + 3:.1f}" width="{w:.1f}" height="{h:.1f}" rx="{min(h / 2, 16):.1f}" fill="#0b2545" opacity=".14"/>',
         f'<rect x="{tx - w / 2:.1f}" y="{ty - h / 2:.1f}" width="{w:.1f}" height="{h:.1f}" rx="{min(h / 2, 16):.1f}" fill="{fondo}" stroke="{borde}" stroke-width="2"/>']
    if sub:
        g.append(f'<text x="{tx:.1f}" y="{ty - tam * 0.35:.1f}" font-size="{tam}" font-weight="800" fill="{color}" text-anchor="middle" dominant-baseline="central">{texto}</text>')
        g.append(f'<text x="{tx:.1f}" y="{ty + tam * 0.6:.1f}" font-size="{tam * 0.72:.1f}" font-weight="600" fill="{color}" text-anchor="middle" dominant-baseline="central" opacity=".9">{sub}</text>')
    else:
        g.append(f'<text x="{tx:.1f}" y="{ty + 0.5:.1f}" font-size="{tam}" font-weight="800" fill="{color}" text-anchor="middle" dominant-baseline="central">{texto}</text>')
    return "".join(g)


# ---------------------------------------------------------------- lugares
INSIGNIA = {"Salón de Contenedores": "SC", "Salón Multiusos": "SM", "Salón de Danza": "SD",
            "Salón de Música": "MU", "Vestidores": "VE", "Jaguar Center": "JC", "Edificio I": "I",
            "Edificio E": "E", "Edificio F": "F", "Auditorio Central": "G", "Edificio M": "M",
            "Food Court": "FC", "Banco Banpro": "BP", "Edificio B": "B", "Edificio C": "C",
            "Edificio A": "A", "Laboratorios": "LB", "Edificio D": "D", "Edificio J": "J",
            "Kioskos de comida": "KC", "El Ranchero": "RA", "Clínicas Odontológicas": "CO", "Edificio N (ala de Clínicas)": "N",
            "El Chilamate": "CH", "Edificio O": "O", "Edificio P": "P", "Comedor del Jaguarcito": "CJ",
            "Baño del Comedor": "BA", "Kiosko del Jaguarcito": "KJ"}
PISO = 3.6   # metros por piso
PISOS = {"Edificio P": 3, "Edificio C": 3, "Edificio M": 3, "Edificio I": 1, "Edificio A": 2, "Edificio B": 2, "Edificio E": 2,
         "Edificio O": 2, "Clínicas Odontológicas": 2}       # dato de James; el resto se estima
TECHADOS = {"Comedor del Jaguarcito", "El Chilamate"}
# Detalles de fachada vistos en las fotos de la UAM (búsqueda de imágenes, 22/11/2026)
ACENTOS = {
    # M (fotos de James): blanco, franja gris oscura bajo la losa volada, paño de ladrillo y barandas
    "Edificio M": [("cornisa", "#4f5964", 1.1), ("ladrillo", .04, .24), ("cara_este", "#a9bad0")],
    # Clínicas + «Edificio N» (foto de James): zócalo turquesa, franja azul con letras doradas y
    # pasillo corrido del 2.º piso con baranda blanca
    "Clínicas Odontológicas": [("cornisa", "#8d97a2", .7), ("franja",), ("zocalo", "#3fc1c9"), ("barandas", "#f4f6f8"), ("aires",)],
    # Laboratorios (foto de James): crema, vidrio verdoso y pasillo del 2.º piso con baranda
    "Laboratorios": [("vidrio_verde",), ("barandas", "#6b7785")],
    # A (foto de James): bandas de ventanas de marco oscuro entre pilastras blancas y parapeto gris
    "Edificio A": [("cornisa", "#8d97a2", 1.3), ("vidrio_oscuro",), ("sur_lisa",)],
    # Auditorio (foto de James): crema, ventanas oscuras en bandas
    "Auditorio Central": [("vidrio_oscuro",)],
}
# Hileras de ventanas que se ven en las fotos, solo para el dibujo (no cambia «pisos» de lugares.json):
# el A muestra 3 hileras aunque James lo cuenta de 2 pisos; el Auditorio tiene 2 niveles.
PISOS_DIBUJO = {"Edificio A": 3, "Auditorio Central": 2, "Laboratorios": 2}
MUROS_CREMA = {"Edificio B", "Auditorio Central", "Laboratorios"}
MURO = ("#fbfcfd", "#e6eaef", "#a9b4c0", "#7d8a99")   # techo, muro claro, muro en sombra, borde: blancos         # mesas bajo un techo, sin paredes
PASILLO_B_E = "730964043"   # pasillo elevado del 2.º piso del Edificio B al Edificio E (OSM)


def caja_r(x0, y0, x1, y1):
    return [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]


# Lo que no está en OpenStreetMap, ubicado con la vista satelital y las indicaciones de James
EXTRA_EDIFICIOS = [
    ("Salón de Música", caja_r(55.5, 57, 61.5, 63), 1),      # pequeño, delante del Salón de Danza
    ("Baño del Comedor", caja_r(20.5, 171, 25.5, 180), 1),   # a la izquierda del Comedor del Jaguarcito
]
VOLEY_ARENA = caja_r(10, 60, 24, 80)       # pegada al borde oeste
VOLEY = caja_r(27, 57, 41, 83)             # a la derecha de la de arena, a la izquierda de 3 y 4
JUNGLA = [(163, 168), (179, 168), (179, 184), (181, 200), (176, 206), (163, 206)]   # a la izquierda de El Ranchero
DETALLE = {"Edificio I": "Biblioteca Pablo Antonio Cuadra", "Edificio O": "Ingeniería y Arquitectura",
           "Edificio P": "Copérnico · Observatorio", "Auditorio Central": "Auditorio Rubén Darío",
           "Clínicas Odontológicas": "Rotulado «Edificio N»", "Jaguar Center": "Gimnasio techado", "Edificio M": "UAM College"}
MIN_AREA = 60   # m²: más pequeño es un kiosco o caseta, se dibuja pero no es un lugar del grafo
VERDE = "#1e9e4a"

# Celdas solares vistas en el satélite de Google Maps (22/11/2026): techos de edificios y
# las cubiertas de los parqueos (carports).
SOLAR = {"527270729", "1333922788", "1547515040",                       # Clínicas, Edificio O, Edificio P
         "1334322230", "1334322231", "1334322232", "1334322233", "1334322234"}   # cubiertas del parqueo este
CARPORTS = {"730964039", "1553720160", "1553720161"}                   # parqueos con techo de celdas solares

# Puntos seguros: espacios abiertos lejos de los edificios (parqueos, celdas solares y la plazoleta).
# (nombre, ids de parqueos de OSM o "plaza")
PUNTOS_SEGUROS = [
    ("Punto Seguro Parqueo Norte", ["537512772"]),
    ("Punto Seguro Parqueo 47 Calle", ["678946086"]),
    ("Punto Seguro Parqueo 20 Av", ["537512773"]),
    ("Punto Seguro Plazoleta", "plaza"),
    ("Punto Seguro Parqueo Este", ["241348792"]),                # con cubiertas de celdas solares
    ("Punto Seguro Parqueo Central", ["730964039"]),             # con celdas solares
    ("Punto Seguro Parqueo Sur", ["1553720160", "1553720161"]),  # con celdas solares
    ("Punto Seguro Parqueo Oeste", ["1553720165", "1553720166", "1553720167"]),
    ("Punto Seguro Parqueo Edificio P", ["1553720159", "1553720163", "1553720164"]),
    ("Punto Seguro Parqueo Suroeste", ["1553720168"]),
]
CON_SOLAR = {"Punto Seguro Parqueo Este", "Punto Seguro Parqueo Central", "Punto Seguro Parqueo Sur"}


def poligonos_punto(ids):
    if ids == "plaza":
        return [[tuple(q) for q in pl["pol"]] for pl in DATOS["plazas"]]
    return [[tuple(q) for q in pq["pol"]] for pq in DATOS["parqueos"] if pq["id"] in ids]


def centro_varios(polis):
    def ar(p):
        return abs(sum(p[i][0] * p[(i + 1) % len(p)][1] - p[(i + 1) % len(p)][0] * p[i][1] for i in range(len(p)))) / 2
    tot = sum(ar(p) for p in polis) or 1
    return (sum(centro(p)[0] * ar(p) for p in polis) / tot, sum(centro(p)[1] * ar(p) for p in polis) / tot)


def clasificar():
    """Edificios con su nombre final; los sin nombre se numeran de norte a sur y de oeste a este."""
    eds = []
    for e in DATOS["edificios"]:
        pol = [tuple(p) for p in e["pol"]]
        if e["nombre"] == "Kiosko del Jaguarcito":
            # el contorno de OSM (732 m²) es mucho más grande que el kiosko real, que es muy pequeño (James)
            cx, cy = centro(pol)
            pol = caja_r(cx - 3, cy - 2.5, cx + 3, cy + 2.5)
            e = {**e, "area": 30}
        eds.append({**e, "pol": pol, "c": centro(pol)})
    # las cubiertas de celdas solares del parqueo este son parte de ese punto seguro, no edificios
    sin = [e for e in eds if not e["nombre"] and e["area"] >= MIN_AREA and not (e["tipo"] == "roof" and e["id"] in SOLAR)]
    sin.sort(key=lambda e: (round(e["c"][1] / 22), e["c"][0]))
    for i, e in enumerate(sin, 1):
        e["nombre"] = f"Edificio sin nombre {i}"
        e["num"] = i
    return eds


def cancha(deporte):
    return next(c for c in DATOS["canchas"] if c["deporte"] == deporte)


def lugares(eds):
    out = [{"nombre": e["nombre"], "tipo": "edificio", "area_m2": e["area"],
            "centro_m": [round(e["c"][0], 1), round(e["c"][1], 1)]}
           for e in sorted(eds, key=lambda e: (e.get("num", 0), e["nombre"] or "")) if e["nombre"]]
    for nombre, dep in (("Zona Segura Cancha de Fútbol", "soccer"), ("Zona Segura Campo de Béisbol", "baseball")):
        pol = [tuple(p) for p in cancha(dep)["pol"]]
        c = centro(pol)
        out.append({"nombre": nombre, "tipo": "zona segura", "centro_m": [round(c[0], 1), round(c[1], 1)]})
    for nombre, ids in PUNTOS_SEGUROS:
        c = centro_varios(poligonos_punto(ids))
        out.append({"nombre": nombre, "tipo": "punto seguro", "celdas_solares": nombre in CON_SOLAR,
                    "centro_m": [round(c[0], 1), round(c[1], 1)]})
    for nombre, tipo, pol in (("Cancha de Voleibol de Arena", "cancha", VOLEY_ARENA), ("Cancha de Voleibol", "cancha", VOLEY),
                              ("Jungla Jaguar", "área verde", JUNGLA)):
        c = centro(pol)
        out.append({"nombre": nombre, "tipo": tipo, "centro_m": [round(c[0], 1), round(c[1], 1)]})
    for e in out:
        if e["nombre"] in DETALLE:
            e["detalle"] = DETALLE[e["nombre"]]
        if e["nombre"] in PISOS:
            e["pisos"] = PISOS[e["nombre"]]
        if e["nombre"] in TECHADOS:
            e["techado_sin_paredes"] = True
    for e in out:
        if e["nombre"] == "Edificio B":
            e["conexiones"] = [{"a": "Edificio E", "piso": 2, "tipo": "pasillo elevado"}]
        if e["nombre"] == "Edificio E":
            e["conexiones"] = [{"a": "Edificio B", "piso": 2, "tipo": "pasillo elevado"}]
    return out


# ---------------------------------------------------------------- escena
def futbol(pol):
    """Cancha de fútbol: franjas de césped y líneas, alineadas con el rectángulo real."""
    c0, c1, c2, c3 = pol[:4]
    if math.dist(c0, c1) < math.dist(c0, c3):      # u = eje largo
        c0, c1, c2, c3 = c0, c3, c2, c1

    def f(u, v):
        a = (c0[0] + (c1[0] - c0[0]) * u, c0[1] + (c1[1] - c0[1]) * u)
        b = (c3[0] + (c2[0] - c3[0]) * u, c3[1] + (c2[1] - c3[1]) * u)
        return (a[0] + (b[0] - a[0]) * v, a[1] + (b[1] - a[1]) * v)

    g = [suelo(pol, "#3aa853", borde="#2f9e48")]
    for i in range(0, 10, 2):
        g.append(suelo([f(i / 10, 0), f((i + 1) / 10, 0), f((i + 1) / 10, 1), f(i / 10, 1)], "#47b660"))
    m, L = .06, BLANCO
    lin = f'fill="none" stroke="{L}" stroke-width="1.8"'
    g.append(f'<polygon points="{pts([f(m, m), f(1 - m, m), f(1 - m, 1 - m), f(m, 1 - m)])}" {lin}/>')
    g.append(f'<polyline points="{pts([f(.5, m), f(.5, 1 - m)])}" {lin}/>')
    g.append(f'<polygon points="{pts([f(.5 + .09 * math.cos(t) * .6, .5 + .15 * math.sin(t)) for t in [i * math.pi / 18 for i in range(36)]])}" {lin}/>')
    for u0, u1 in ((m, m + .15), (1 - m - .15, 1 - m)):
        g.append(f'<polygon points="{pts([f(u0, .25), f(u1, .25), f(u1, .75), f(u0, .75)])}" {lin}/>')
    return "".join(g)


def beisbol(pol):
    """Campo de béisbol: jardín, cuadro de tierra y diamante desde home (esquina suroeste)."""
    home = (33.0, 303.0)
    hacia = (118.0, 222.0)
    d = math.dist(home, hacia)
    ux, uy = (hacia[0] - home[0]) / d, (hacia[1] - home[1]) / d
    px, py = -uy, ux
    base = 27.4
    g = [suelo(pol, "#4fbb63", borde="#2f9e48")]
    # cuadro de tierra (abanico)
    abanico = [home] + [(home[0] + (ux * math.cos(t) + px * math.sin(t)) * 44, home[1] + (uy * math.cos(t) + py * math.sin(t)) * 44)
                        for t in [math.radians(a) for a in range(-45, 46, 6)]]
    g.append(suelo(abanico, "#d9a066", borde="#c4874a"))
    s = base / math.sqrt(2)
    diamante = [home, (home[0] + (ux - px) * s, home[1] + (uy - py) * s),
                (home[0] + ux * base * math.sqrt(2), home[1] + uy * base * math.sqrt(2)),
                (home[0] + (ux + px) * s, home[1] + (uy + py) * s)]
    interior = [(diamante[0][0] * .2 + sum(p[0] for p in diamante) / 4 * .8 if False else p[0] * .82 + sum(q[0] for q in diamante) / 4 * .18,
                 p[1] * .82 + sum(q[1] for q in diamante) / 4 * .18) for p in diamante]
    g.append(suelo(interior, "#4fbb63"))
    g.append(f'<polygon points="{pts(diamante)}" fill="none" stroke="{BLANCO}" stroke-width="1.6"/>')
    for p in diamante[1:]:
        g.append(suelo(elipse(p[0], p[1], 1.4, 1.4, 8), BLANCO))
    for sgn in (-1, 1):  # líneas de foul
        fin = (home[0] + (ux * math.cos(math.radians(45)) + sgn * px * math.sin(math.radians(45))) * 105,
               home[1] + (uy * math.cos(math.radians(45)) + sgn * py * math.sin(math.radians(45))) * 105)
        g.append(f'<polyline points="{pts([home, fin])}" fill="none" stroke="{BLANCO}" stroke-width="1.5"/>')
    # Graderías azules junto a las líneas de foul y pizarra azul en el jardín central (fotos del Jaguar Stadium)
    c45 = math.cos(math.radians(45))
    for sgn in (-1, 1):
        dx, dy = ux * c45 + sgn * px * c45, uy * c45 + sgn * py * c45
        nx, ny = -dy, dx
        if nx * ux + ny * uy > 0:
            nx, ny = -nx, -ny
        grada = [(home[0] + dx * s + nx * o, home[1] + dy * s + ny * o) for s, o in ((9, 2.5), (32, 2.5), (32, 5.5), (9, 5.5))]
        g.append(edificio(grada, 2.6, "#3f86e0", "#2a6fd0", "#164f9f", "#0f3f80"))
    cx, cy = home[0] + ux * 108, home[1] + uy * 108
    tablero = [(cx - px * 5 - ux * .5, cy - py * 5 - uy * .5), (cx + px * 5 - ux * .5, cy + py * 5 - uy * .5),
               (cx + px * 5 + ux * .5, cy + py * 5 + uy * .5), (cx - px * 5 + ux * .5, cy - py * 5 + uy * .5)]
    for k in (-3.5, 3.5):
        a, b = P(cx + px * k, cy + py * k, 0), P(cx + px * k, cy + py * k, 4)
        g.append(f'<line x1="{a[0]:.1f}" y1="{a[1]:.1f}" x2="{b[0]:.1f}" y2="{b[1]:.1f}" stroke="#4a5562" stroke-width="2"/>')
    g.append(paredes(tablero, 4, 8, "#2a6fd0", "#123f86", "#0b2f66") +
             f'<polygon points="{pts(tablero, 8)}" fill="#1f5fbf" stroke="#0b2f66" stroke-width=".8"/>')
    return "".join(g)


PASARELA = (163.5, 277.0, 116.9, 120.1)      # x0, x1, y0, y1: del parqueo del Auditorio a la vía UAM
PASARELA_Z = PISO                            # tablero elevado: un piso sobre la Plazoleta (grafo: bajar un piso)
ESCALERA_PLAZA = (220.5, 225.5)              # x0, x1 (m): escalera que baja al norte, a la Plazoleta
UNION_BC = caja_r(220.0, 131.6, 226.5, 138.0)
UNION_ALTO = 3 * PISO + 0.6 + 1.2            # llega al 3.er piso de C y asoma su remate sobre el techo


def pasarela():
    """Corredor elevado y techado de estructura metálica gris, con barandas (James, foto del Auditorio)."""
    x0, x1, y0, y1 = PASARELA
    z, zt = PASARELA_Z, PASARELA_Z + 2.7
    out = []
    n = max(1, round((x1 - x0) / 9))
    for i in range(n):
        xa, xb = x0 + (x1 - x0) * i / n, x0 + (x1 - x0) * (i + 1) / n
        seg = caja_r(xa, y0, xb, y1)
        g = []
        for yy in (y0, y1):          # columnas metálicas hasta el techo
            u, v = P(xb, yy, 0), P(xb, yy, zt)
            g.append(f'<line x1="{u[0]:.1f}" y1="{u[1]:.1f}" x2="{v[0]:.1f}" y2="{v[1]:.1f}" stroke="#5d6873" stroke-width="1.3"/>')
        g.append(paredes(seg, z - .45, z, "#a9b3bd", "#6f7a86", "#4f5964"))
        g.append(f'<polygon points="{pts(seg, z)}" fill="#c9cfd6" stroke="#4f5964" stroke-width=".6"/>')
        for yy in (y0, y1):          # barandas metálicas con pasamanos y travesaño
            for dz, w in ((1.0, 1.1), (.5, .6)):
                u, v = P(xa, yy, z + dz), P(xb, yy, z + dz)
                g.append(f'<line x1="{u[0]:.1f}" y1="{u[1]:.1f}" x2="{v[0]:.1f}" y2="{v[1]:.1f}" stroke="#5d6873" stroke-width="{w}"/>')
        techo = caja_r(xa, y0 - .5, xb, y1 + .5)
        g.append(paredes(techo, zt, zt + .25, "#c3cbd3", "#8d98a4", "#5d6873"))
        g.append(f'<polygon points="{pts(techo, zt + .25)}" fill="url(#laminaN)" stroke="#5d6873" stroke-width=".6"/>')
        sombra(techo, zt + .25, z0=zt)
        out.append((max(prof(*q) for q in seg), "".join(g)))
    # escalera metálica en medio de la pasarela, bajando al norte hacia la Plazoleta
    out.append(escalera(ESCALERA_PLAZA[0], ESCALERA_PLAZA[1], y0, -1))
    # escalera metálica gris junto al Auditorio (borde derecho de la foto): sube al sur a la pasarela
    out.append(escalera(181.8, 184.6, y0, -1))
    return out


def escalera(xa, xb, y_llegada, sentido, peldanos=12, huella=.55):
    """Escalera metálica de un tramo que llega a la pasarela; sentido -1 = baja hacia el norte."""
    z = PASARELA_Z
    g = []
    for i in range(peldanos, 0, -1):
        ya = y_llegada + sentido * (i - 1) * huella
        pel = caja_r(xa, min(ya, ya + sentido * huella), xb, max(ya, ya + sentido * huella))
        zk = z * (peldanos - i + 1) / (peldanos + 1)
        g.append(f'<polygon points="{pts(pel, zk)}" fill="#b9c2cb" stroke="#4f5964" stroke-width=".5"/>')
    ye = y_llegada + sentido * peldanos * huella
    for xx in (xa, xb):              # zancas y pasamanos
        a, b = P(xx, ye, 0), P(xx, y_llegada, z)
        g.append(f'<line x1="{a[0]:.1f}" y1="{a[1]:.1f}" x2="{b[0]:.1f}" y2="{b[1]:.1f}" stroke="#4f5964" stroke-width="1"/>')
        a, b = P(xx, ye, 1.0), P(xx, y_llegada, z + 1.0)
        g.append(f'<line x1="{a[0]:.1f}" y1="{a[1]:.1f}" x2="{b[0]:.1f}" y2="{b[1]:.1f}" stroke="#5d6873" stroke-width=".8"/>')
    return (prof(xb, y_llegada) - .01, "".join(g))


def entrada_a(pol, alto):
    """Edificio A (foto de James): entrada principal centrada hacia la vía, vidrios y sello dorado."""
    x = max(q[0] for q in pol) + .05
    g = [cara_plana(x, 136.2, x, 131.2, 0, 3.0, "#2d6f86", 'stroke="#1d3b4d" stroke-width=".6"'),
         cara_plana(x, 134.4, x, 133.0, 0, 2.6, "#13222f")]
    sx, sy = P(x, 133.7, 4.3)
    g.append(f'<circle cx="{sx:.1f}" cy="{sy:.1f}" r="{.75 * ESC:.1f}" fill="#e6c15a" stroke="#a57f22" stroke-width=".6"/>')
    for k, (xa, xb) in enumerate(((x, x + 2.2), (x, x + 1.4))):     # escalinata
        st = caja_r(xa, 130.6, xb, 136.8)
        g.append(paredes(st, 0, .25 * (k + 1), "#f3f5f7", "#c3ccd5", "#9aa6b3") +
                 f'<polygon points="{pts(st, .25 * (k + 1))}" fill="#e9edf1" stroke="#9aa6b3" stroke-width=".4"/>')
    return "".join(g)


def frente_a():
    """Frente del A sobre la vía Universidad UAM: paso de cebra, bordillos amarillos y jardineras."""
    g = []
    for k in range(7):
        xa = 278.3 + k * 1.15
        g.append(f'<polygon points="{pts(caja_r(xa, 131.9, xa + .6, 135.5))}" fill="#f7f8fa"/>')
    for ya, yb in ((118.5, 130.6), (136.8, 150.0)):
        g.append(f'<polyline points="{pts([(277.4, ya), (277.4, yb)])}" fill="none" stroke="{AMARILLO}" stroke-width="1.6"/>')
    for jard in (caja_r(273.6, 123.5, 276.6, 129.8), caja_r(273.6, 137.6, 276.6, 143.9)):
        g.append(f'<polygon points="{pts(jard)}" fill="#4fa860" stroke="{AMARILLO}" stroke-width="1.3"/>')
    # jardinera de zacate ornamental alto frente a la cara sur del A (foto de Google Maps)
    g.append(f'<polygon points="{pts(caja_r(262.5, 148.6, 272.0, 150.2))}" fill="#7fae4f" stroke="#5d8a37" stroke-width=".6"/>')
    hojas = []
    for k in range(14):
        x = 263.0 + k * .67
        a, b = P(x, 149.4, 0), P(x + .3, 149.4, 1.3)
        hojas.append(f"M{a[0]:.1f} {a[1]:.1f}L{b[0]:.1f} {b[1]:.1f}")
    g.append(f'<path d="{"".join(hojas)}" stroke="#9cc25e" stroke-width="1.1" stroke-linecap="round"/>')
    return "".join(g)


def palmera(x, y, h=6.0):
    """Palmera pequeña (frente del A y del Auditorio en las fotos)."""
    dx, dy = desplazo(h * .8)
    s0, s1 = P(x + dx, y + dy)
    SOMBRAS.append(f'<ellipse cx="{s0:.1f}" cy="{s1:.1f}" rx="{2.2 * ESC:.1f}" ry="{1.2 * ESC:.1f}"/>')
    b, t = P(x, y, 0), P(x, y, h)
    r = 2.6 * ESC
    hojas = "".join(f'M{t[0]:.1f} {t[1]:.1f}Q{t[0] + math.cos(a) * r * .6:.1f} {t[1] + math.sin(a) * r * .35 - 3:.1f} '
                    f'{t[0] + math.cos(a) * r:.1f} {t[1] + math.sin(a) * r * .45 + 2:.1f}'
                    for a in [i * math.pi / 4 + .3 for i in range(8)])
    return (f'<line x1="{b[0]:.1f}" y1="{b[1]:.1f}" x2="{t[0]:.1f}" y2="{t[1]:.1f}" stroke="#8a6a45" stroke-width="1.4"/>'
            f'<path d="{hojas}" fill="none" stroke="#2f9a4a" stroke-width="1.6" stroke-linecap="round"/>')


def union_bc():
    """Núcleo de escalera de vidrio entre B y C, con los tramos de escalera en zigzag."""
    pol, h = UNION_BC, UNION_ALTO
    (x0, y0), (x1, _), (_, y1), _ = pol
    g = [paredes(pol, 0, h, "#d6eafc", "#86afdb", AZUL_OSC)]
    for f in range(3):           # tramos en la cara sur (los que se asoman sobre el techo de C)
        za, zb = f * PISO + .3, (f + 1) * PISO - .2
        a, b = (P(x0 + .6, y1, za), P(x1 - .6, y1, zb)) if f % 2 == 0 else (P(x1 - .6, y1, za), P(x0 + .6, y1, zb))
        g.append(f'<line x1="{a[0]:.1f}" y1="{a[1]:.1f}" x2="{b[0]:.1f}" y2="{b[1]:.1f}" stroke="{AZUL_OSC}" stroke-width="1.1"/>')
    g.append(f'<polygon points="{pts(pol, h)}" fill="#f3f8ff" stroke="{AMARILLO}" stroke-width="1.6" stroke-linejoin="round"/>')
    sombra(pol, h)
    return "".join(g)


# Techos a dos aguas de lámina corrugada (foto de James desde el 3.er piso del C, 23/11/2026):
# rectángulo del cuerpo principal (x0, y0, x1, y1), cumbrera de oeste a este.
TECHO_LAMINA = {"Edificio B": (184.9, 121.8, 261.5, 131.6, .8), "Edificio C": (187.6, 138.3, 261.2, 147.6, .8),
                # Auditorio y Laboratorios (fotos de James): lámina gris con alero ancho
                "Auditorio Central": (167.2, 96.5, 181.3, 116.5, 1.3), "Laboratorios": (142.2, 152.2, 175.6, 161.9, 1.1),
                # foto aérea de James: teja terracota en Laboratorios y Edificio F
                "Edificio F": (167.1, 71.4, 180.4, 93.9, .9)}
TECHO_TEJA = {"Laboratorios", "Edificio F", "Edificio I", "Auditorio Central"}
ALERO = 0.8
FLECHA = 1.7
MURO_B = ("#fbfcfd", "#f4f1ea", "#bdb6a8", "#8f8b80")   # B: muros crema (foto)


def techo_dos_aguas(rect, alto, teja=False):
    """Techo de lámina galvanizada a dos aguas con aleros, canales de la lámina y remate en la cumbrera."""
    x0, y0, x1, y1, ALERO = rect
    x0, y0, x1, y1 = x0 - ALERO, y0 - ALERO, x1 + ALERO, y1 + ALERO
    ym, zr = (y0 + y1) / 2, alto + FLECHA

    def poly(q):
        return " ".join(f"{a:.1f},{b:.1f}" for a, b in (P(*p) for p in q))
    g = []
    # hastial este (muro bajo la cumbrera) y la vertiente norte (al sol), luego la sur
    xe = x1 - ALERO
    g.append(f'<polygon points="{poly([(xe, y0 + ALERO, alto), (xe, y1 - ALERO, alto), (xe, ym, zr - .3)])}" fill="#e9e6df" stroke="#8f8b80" stroke-width=".5"/>')
    mat = ("url(#tejaN)", "url(#tejaS)", "#8e3f24") if teja else ("url(#laminaN)", "url(#laminaS)", "#7d8894")
    for (ya, za), (yb, zb), grad in (((y0, alto), (ym, zr), mat[0]), ((ym, zr), (y1, alto), mat[1])):
        g.append(f'<polygon points="{poly([(x0, ya, za), (x1, ya, za), (x1, yb, zb), (x0, yb, zb)])}" fill="{grad}" stroke="#7f8a96" stroke-width=".6" stroke-linejoin="round"/>')
        d = []
        n = int((x1 - x0) / 1.0)
        for i in range(1, n):
            x = x0 + (x1 - x0) * i / n
            u, v = P(x, ya, za), P(x, yb, zb)
            d.append(f"M{u[0]:.1f} {u[1]:.1f}L{v[0]:.1f} {v[1]:.1f}")
        g.append(f'<path d="{"".join(d)}" stroke="{mat[2]}" stroke-width=".35" opacity=".55" fill="none"/>')
    # cumbrera y canal del alero sur
    a, b = P(x0, ym, zr), P(x1, ym, zr)
    g.append(f'<line x1="{a[0]:.1f}" y1="{a[1]:.1f}" x2="{b[0]:.1f}" y2="{b[1]:.1f}" stroke="#f4f7fa" stroke-width="1.3"/>')
    a, b = P(x0, y1, alto), P(x1, y1, alto)
    g.append(f'<line x1="{a[0]:.1f}" y1="{a[1] + .6:.1f}" x2="{b[0]:.1f}" y2="{b[1] + .6:.1f}" stroke="#6b7682" stroke-width="1.2"/>')
    sombra(caja_r(x0, y0, x1, y1), zr, z0=alto)
    return "".join(g)


def ampliar(pol, d):
    """Polígono desplazado d metros hacia afuera (inglete en cada vértice; sirve para aleros)."""
    n = len(pol)
    area = sum(pol[i][0] * pol[(i + 1) % n][1] - pol[(i + 1) % n][0] * pol[i][1] for i in range(n))
    s = 1 if area > 0 else -1
    lineas = []
    for i in range(n):
        (ax, ay), (bx, by) = pol[i], pol[(i + 1) % n]
        l = math.hypot(bx - ax, by - ay) or 1
        nx, ny = s * (by - ay) / l, -s * (bx - ax) / l     # normal exterior
        lineas.append(((ax + nx * d, ay + ny * d), (bx - ax, by - ay)))
    out = []
    for i in range(n):
        (p1, d1), (p2, d2) = lineas[i - 1], lineas[i]
        den = d1[0] * d2[1] - d1[1] * d2[0]
        if abs(den) < 1e-9:
            out.append(p2)
            continue
        t = ((p2[0] - p1[0]) * d2[1] - (p2[1] - p1[1]) * d2[0]) / den
        out.append((p1[0] + d1[0] * t, p1[1] + d1[1] * t))
    return out


def losa_volada(pol, alto, d, canto="#ffffff", borde="#8a97a6", techo="#fbfcfd", grueso=.45):
    """Losa de techo plana que vuela como alero (M blanco; Clínicas con alero gris oscuro)."""
    ext = ampliar(pol, d)
    return (paredes(ext, alto, alto + grueso, canto, mezclar(canto, "#33404e", .35), borde) +
            f'<polygon points="{pts(ext, alto + grueso)}" fill="{losa_techo(techo)}" stroke="{borde}" stroke-width=".7"/>' +
            brillo(ext, alto + grueso, techo))


def escalera_g(alto):
    """Volumen de escalera del Edificio G (Auditorio, cara oeste) con techo en escalón y aires grandes."""
    vol = caja_r(164.3, 105.5, 167.4, 112.1)
    g = [paredes(vol, alto, alto + 1.2, "#f4f1ea", "#bdb6a8", "#8f8b80"),
         f'<polygon points="{pts(vol, alto + 1.2)}" fill="{losa_techo("#efeae0")}" stroke="#8f8b80" stroke-width=".6"/>']
    for y in (106.6, 109.4):
        caja = caja_r(164.9, y, 166.8, y + 1.8)
        g.append(paredes(caja, alto + 1.2, alto + 2.4, "#d9dfe6", "#9aa6b3", "#7d8a99") +
                 f'<polygon points="{pts(caja, alto + 2.4)}" fill="#eef1f4" stroke="#7d8a99" stroke-width=".5"/>')
    return "".join(g)


def parqueo_g():
    """Frente oeste del Edificio G: parqueo de discapacitados (piso azul), bordillo amarillo y toldo UAM."""
    g = []
    for y in (103.6, 107.2, 110.8):
        g.append(f'<polygon points="{pts(caja_r(158.2, y, 163.0, y + 3.2))}" fill="#3d7fd1" stroke="#ffffff" stroke-width=".7"/>')
        cx, cy = P(160.6, y + 1.6)
        g.append(f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="1.3" fill="#ffffff"/>')
    g.append(f'<polyline points="{pts([(163.4, 102.8), (163.4, 114.6)])}" fill="none" stroke="{AMARILLO}" stroke-width="1.6"/>')
    # toldo turquesa «UAM» (pirámide sobre cuatro postes)
    x0, y0, x1, y1, z = 158.6, 115.2, 162.6, 119.2, 2.3
    for x, y in ((x0, y1), (x1, y1), (x1, y0)):
        a, b = P(x, y, 0), P(x, y, z)
        g.append(f'<line x1="{a[0]:.1f}" y1="{a[1]:.1f}" x2="{b[0]:.1f}" y2="{b[1]:.1f}" stroke="#5d6873" stroke-width=".8"/>')
    cima = P((x0 + x1) / 2, (y0 + y1) / 2, z + 1.2)
    for (xa, ya), (xb, yb), col in (((x0, y1), (x1, y1), "#169ea3"), ((x1, y1), (x1, y0), "#11797c"), ((x0, y0), (x0, y1), "#2cc1c4")):
        a, b = P(xa, ya, z), P(xb, yb, z)
        g.append(f'<polygon points="{a[0]:.1f},{a[1]:.1f} {b[0]:.1f},{b[1]:.1f} {cima[0]:.1f},{cima[1]:.1f}" fill="{col}" stroke="#0c5c5f" stroke-width=".4"/>')
    return "".join(g)


def food_court(pol, alto):
    """Food Court (foto de James): blanco y moderno, con marcos de muros inclinados en diagonal que se
    abren como abanico en la fachada sur, un volumen alto con retícula de vidrio azul y losa con alero."""
    g = [losa_volada(pol, alto, .8)]
    # volumen alto con retícula de vidrio azul (esquina suroeste)
    vol = caja_r(246.4, 103.6, 252.4, 110.6)
    h = alto + 3.2
    g.append(paredes(vol, 0, h, "#f7f9fb", "#c3ccd5", "#8a97a6"))
    for x0, y0, x1, y1 in ((246.9, 110.6, 251.9, 110.6), (252.4, 110.1, 252.4, 104.1)):
        g.append(cara_plana(x0, y0, x1, y1, 1.2, h - .8, "url(#reticula)", 'stroke="#2d5f99" stroke-width=".5"'))
    g.append(f'<polygon points="{pts(vol, h)}" fill="{losa_techo("#fbfcfd")}" stroke="#8a97a6" stroke-width=".7"/>')
    sombra(vol, h)
    # marcos inclinados en abanico frente a la fachada este (la que se ve desde el sur del mapa),
    # cada vez más abiertos hacia el sur
    x = 263.0 + 1.3
    for k, y in enumerate((90.0, 94.2, 98.4, 102.6)):
        inc = .8 + k * .5
        a, b = P(x, y, 0), P(x, y + inc, alto + 1.0)
        c, d = P(x, y + inc + .9, alto + 1.0), P(x, y + .9, 0)
        g.append(f'<polygon points="{a[0]:.1f},{a[1]:.1f} {b[0]:.1f},{b[1]:.1f} {c[0]:.1f},{c[1]:.1f} {d[0]:.1f},{d[1]:.1f}" '
                 f'fill="#ffffff" stroke="#9aa6b3" stroke-width=".6"/>')
    a, b = P(x, 90.0 + .8, alto + 1.0), P(x, 102.6 + 2.3 + .9, alto + 1.0)
    g.append(f'<line x1="{a[0]:.1f}" y1="{a[1]:.1f}" x2="{b[0]:.1f}" y2="{b[1]:.1f}" stroke="#ffffff" stroke-width="2"/>')
    return "".join(g)


def alero_y_torre_m(pol, alto):
    """Edificio M (UAM College, fotos de James): losa blanca volada y, en la cara que mira al C (este),
    la torre de escalera de vidrio verde azulado."""
    g = [losa_volada(pol, alto, 1.6)]
    x0, y0, x1, y1 = 175.7, 133.0, 178.2, 139.0
    torre = caja_r(x0, y0, x1, y1)
    g.append(paredes(torre, 0, alto + 1.4, "#6fd3b4", "#1f8f7a", "#3d4650"))   # vidrio verde, marco metálico
    for f in range(1, 4):            # montantes horizontales del muro cortina
        a, b = P(x1, y0, f * PISO), P(x1, y1, f * PISO)
        g.append(f'<line x1="{a[0]:.1f}" y1="{a[1]:.1f}" x2="{b[0]:.1f}" y2="{b[1]:.1f}" stroke="#3d4650" stroke-width=".8"/>')
        a, b = P(x0, y1, f * PISO), P(x1, y1, f * PISO)
        g.append(f'<line x1="{a[0]:.1f}" y1="{a[1]:.1f}" x2="{b[0]:.1f}" y2="{b[1]:.1f}" stroke="#3d4650" stroke-width=".8"/>')
    g.append(f'<polygon points="{pts(torre, alto + 1.4)}" fill="#f3f6f8" stroke="#147480" stroke-width=".7"/>')
    sombra(torre, alto + 1.4)
    return "".join(g)


def arbol_columnar(x, y, h=12.5):
    """Árbol columnar alto y delgado (tipo falso ashoka), como los que bordean el Edificio B."""
    dx, dy = desplazo(h * .7)
    s0, s1 = P(x + dx, y + dy)
    SOMBRAS.append(f'<ellipse cx="{s0:.1f}" cy="{s1:.1f}" rx="{1.6 * ESC:.1f}" ry="{1.0 * ESC:.1f}"/>')
    b, t = P(x, y, 0), P(x, y, h)
    alto_px = b[1] - t[1]
    return (f'<rect x="{b[0] - .7:.1f}" y="{b[1] - alto_px * .2:.1f}" width="1.4" height="{alto_px * .2:.1f}" fill="#6b4a2e"/>'
            f'<ellipse cx="{b[0]:.1f}" cy="{t[1] + alto_px * .45:.1f}" rx="{1.5 * ESC:.1f}" ry="{alto_px * .45:.1f}" fill="url(#copa2)"/>')


def fantasmas():
    x0, x1, y0, y1 = PASARELA
    ex0, ex1 = ESCALERA_PLAZA
    k, huella = 12, .55
    linea = f'fill="{AZUL}" fill-opacity=".12" stroke="{AZUL}" stroke-width="1.3" stroke-dasharray="5 3" stroke-linejoin="round"'
    g = [f'<polygon points="{pts(caja_r(x0, y0, x1, y1), PASARELA_Z)}" {linea}/>',
         f'<polygon points="{pts(caja_r(ex0, y0 - k * huella, ex1, y0), PASARELA_Z / 2)}" {linea}/>',
         f'<polygon points="{pts(caja_r(x0, y0 - .5, x1, y1 + .5), PASARELA_Z + 2.95)}" fill="none" stroke="{AZUL}" stroke-width=".9" stroke-dasharray="2 3"/>']
    (ux0, uy0), (ux1, _), (_, uy1), _ = UNION_BC
    cara_sur = [P(ux0, uy1, 0), P(ux1, uy1, 0), P(ux1, uy1, UNION_ALTO), P(ux0, uy1, UNION_ALTO)]
    g.append(f'<polygon points="{" ".join(f"{a:.1f},{b:.1f}" for a, b in cara_sur)}" fill="{AMARILLO}" fill-opacity=".18" '
             f'stroke="#c89b00" stroke-width="1.2" stroke-dasharray="4 3"/>')
    return f'<g opacity=".9">{"".join(g)}</g>'


def plazoleta():
    """Plazoleta (capturas de Google Maps): media cancha de baloncesto con su aro, gradas de concreto
    hacia la pasarela y un busto sobre pedestal."""
    g = []
    x0, y0, x1, y1 = 208.5, 83.5, 224.5, 97.5            # media cancha; el aro en el lado norte
    g.append(f'<polygon points="{pts(caja_r(x0, y0, x1, y1))}" fill="#eceeef" stroke="#ffffff" stroke-width="1.2"/>')
    xm = (x0 + x1) / 2
    g.append(f'<polygon points="{pts(caja_r(xm - 2.45, y0, xm + 2.45, y0 + 5.8))}" fill="#5b8fd0" stroke="#ffffff" stroke-width=".9"/>')
    tres = [(xm + 6.75 * math.cos(t), y0 + 1.6 + 6.75 * math.sin(t)) for t in [k * math.pi / 16 for k in range(17)]]
    g.append(f'<polyline points="{pts([(x0 + .9, y0)] + tres + [(x1 - .9, y0)])}" fill="none" stroke="#ffffff" stroke-width="1"/>')
    a, b = P(xm, y0 - .4, 0), P(xm, y0 - .4, 3.4)          # poste, tablero y aro
    g.append(f'<line x1="{a[0]:.1f}" y1="{a[1]:.1f}" x2="{b[0]:.1f}" y2="{b[1]:.1f}" stroke="#4f5964" stroke-width="1.4"/>')
    g.append(cara_plana(xm - .9, y0 + .3, xm + .9, y0 + .3, 2.9, 3.95, "#ffffff", 'stroke="#4f5964" stroke-width=".5"'))
    r0 = P(xm, y0 + 1.0, 3.05)
    g.append(f'<ellipse cx="{r0[0]:.1f}" cy="{r0[1]:.1f}" rx="1.4" ry=".8" fill="none" stroke="#e23000" stroke-width=".8"/>')
    # gradas de concreto al sur de la plaza, subiendo hacia la pasarela
    for k in range(4):
        st = caja_r(205.0, 106.5 + k * 1.0, 218.0, 107.5 + k * 1.0)
        z = .3 * (k + 1)
        g.append(paredes(st, 0, z, "#eceeef", "#b6bdc4", "#9aa6b3") +
                 f'<polygon points="{pts(st, z)}" fill="#f4f5f6" stroke="#9aa6b3" stroke-width=".4"/>')
    # busto sobre pedestal
    ped = caja_r(229.4, 89.4, 230.6, 90.6)
    g.append(paredes(ped, 0, 1.3, "#f2f3f4", "#aeb6be", "#7d8a99") +
             f'<polygon points="{pts(ped, 1.3)}" fill="#f7f8f9" stroke="#7d8a99" stroke-width=".4"/>')
    h = P(230, 90, 2.0)
    g.append(f'<circle cx="{h[0]:.1f}" cy="{h[1]:.1f}" r="1.6" fill="#8c6d3f" stroke="#5e4626" stroke-width=".4"/>')
    sombra(ped, 2.0)
    return "".join(g)


def andador():
    """Andador de losas de concreto con borde de adoquín entre el Auditorio/F y el E, que llega a la
    escalera de la pasarela (captura del Auditorio «Rubén Darío»)."""
    x0, x1, y0, y1 = 182.4, 188.4, 72.0, 116.6
    g = [f'<polygon points="{pts(caja_r(x0, y0, x1, y1))}" fill="#c9a77a" stroke="#a9875a" stroke-width=".5"/>',
         f'<polygon points="{pts(caja_r(x0 + .6, y0, x1 - .6, y1))}" fill="#e7e8e6"/>']
    d = []
    y = y0 + 1.6
    while y < y1:
        a, b = P(x0 + .6, y), P(x1 - .6, y)
        d.append(f"M{a[0]:.1f} {a[1]:.1f}L{b[0]:.1f} {b[1]:.1f}")
        y += 1.6
    g.append(f'<path d="{"".join(d)}" stroke="#bfc3c4" stroke-width=".5"/>')
    return "".join(g)


def construir(eds):
    S, PL, OB = [], [], []

    # Terreno: losa con espesor
    for i in range(len(CAMPUS)):
        a, b = CAMPUS[i], CAMPUS[(i + 1) % len(CAMPUS)]
        cara = [P(*a, 0), P(*b, 0), P(*b, -6), P(*a, -6)]
        if (cara[0][1] + cara[1][1]) / 2 < P(*centro(CAMPUS))[1]:
            continue
        S.append(f'<polygon points="{" ".join(f"{u:.1f},{v:.1f}" for u, v in cara)}" fill="url(#losa)" stroke="#6f8a5c" stroke-width=".8"/>')
    S.append(suelo(CAMPUS, "url(#cesped)", borde="#b9c99f"))
    S.append(suelo(CAMPUS, "url(#luzsuelo)"))

    # Parqueos y plazoleta (puntos seguros con contorno verde discontinuo)
    seguros = {i for _, ids in PUNTOS_SEGUROS if ids != "plaza" for i in ids}
    for p in DATOS["parqueos"]:
        pol = [tuple(q) for q in p["pol"]]
        PL.append(suelo(pol, "#c3cad3", borde="#e9edf1", ancho=1.6))
        PL.append(suelo(pol, "url(#estac)"))
        if p["id"] in seguros:
            PL.append(f'<polygon points="{pts(pol)}" fill="none" stroke="{VERDE}" stroke-width="2.2" stroke-dasharray="7 5"/>')
    for pl in DATOS["plazas"]:
        pol = [tuple(q) for q in pl["pol"]]
        PL.append(suelo(pol, "#d7d9d6", borde="#b9bdb8"))
        PL.append(suelo(pol, "url(#adoquin)"))
        cx, cy = centro(pol)
        PL.append(plazoleta())
        PL.append(f'<polygon points="{pts(pol)}" fill="none" stroke="{VERDE}" stroke-width="2.4" stroke-dasharray="7 5"/>')

    # Zonas seguras: fútbol y béisbol (con contorno blanco discontinuo)
    PL.append(futbol([tuple(q) for q in cancha("soccer")["pol"]]))
    PL.append(beisbol([tuple(q) for q in cancha("baseball")["pol"]]))
    for dep in ("soccer", "baseball"):
        PL.append(f'<polygon points="{pts([tuple(q) for q in cancha(dep)["pol"]])}" fill="none" stroke="{AMARILLO}" stroke-width="2.6" stroke-dasharray="10 6"/>')

    # Canchas de voleibol (arena y normal) y Jungla Jaguar
    PL.append(suelo(VOLEY_ARENA, "#ecd9a6", borde="#cdb377"))
    PL.append(suelo(VOLEY, "#4f7fbf", borde="#2f5f9f"))
    for cancha_v in (VOLEY_ARENA, VOLEY):
        (x0, y0), _, (x1, y1), _ = cancha_v
        m = 2
        PL.append(f'<polygon points="{pts(caja_r(x0 + m, y0 + m, x1 - m, y1 - m))}" fill="none" stroke="{BLANCO}" stroke-width="1.6"/>')
        PL.append(f'<polyline points="{pts([(x0 + m, (y0 + y1) / 2), (x1 - m, (y0 + y1) / 2)])}" fill="none" stroke="{BLANCO}" stroke-width="2.4"/>')
    PL.append(suelo(JUNGLA, "#2f8f48", borde="#23733a"))

    # Calles (recortadas al campus)
    anchos = {"residential": 9, "service": 5, "footway": 2}
    calles = []
    for c in sorted(DATOS["calles"], key=lambda c: anchos.get(c["tipo"], 4)):
        linea = [tuple(q) for q in c["linea"]]
        if c["tipo"] == "footway":
            calles.append(f'<polyline points="{pts(linea)}" fill="none" stroke="#e8dcc0" stroke-width="2.4" stroke-dasharray="4 3"/>')
        else:
            principal = c["tipo"] == "residential"
            calles.append(via(linea, anchos.get(c["tipo"], 4), "url(#asfalto)" if principal else "#e6eaef",
                              borde="#eef1f4" if principal else "#cdd5de", centro_=AMARILLO, bordes=principal))
    PL.append(f'<g clip-path="url(#recorte)">{"".join(calles)}</g>')
    PL.append(frente_a())
    PL.append(parqueo_g())
    PL.append(andador())

    # Árboles: arboledas de OSM y bordes libres del campus
    xs = [p[0] for p in CAMPUS]
    ys = [p[1] for p in CAMPUS]
    ocupado = [e["pol"] for e in eds] + [[tuple(q) for q in c["pol"]] for c in DATOS["canchas"]] + \
              [[tuple(q) for q in p["pol"]] for p in DATOS["parqueos"]] + [VOLEY, VOLEY_ARENA] + \
              [pol for _, pol, _ in EXTRA_EDIFICIOS]

    def libre(x, y):
        if not dentro((x, y), CAMPUS) or any(dentro((x, y), poli) for poli in ocupado):
            return False
        for c in DATOS["calles"]:
            for (x1, y1), (x2, y2) in zip(c["linea"], c["linea"][1:]):
                dx, dy = x2 - x1, y2 - y1
                l2 = dx * dx + dy * dy or 1
                t = max(0, min(1, ((x - x1) * dx + (y - y1) * dy) / l2))
                if math.hypot(x - (x1 + t * dx), y - (y1 + t * dy)) < 7:
                    return False
        return True

    arboles = []
    for a in DATOS["arboledas"] + [{"pol": JUNGLA}]:
        pol = [tuple(q) for q in a["pol"]]
        paso = 5 if pol is JUNGLA else 9
        for gx in range(int(min(xs)), int(max(xs)), paso):
            for gy in range(int(min(ys)), int(max(ys)), paso):
                x, y = gx + (gy * 7 % 5), gy + (gx * 3 % 4)
                if dentro((x, y), pol) and (libre(x, y) or pol is JUNGLA):
                    arboles.append((x, y))
    # borde: puntos cerca del contorno
    for i in range(len(CAMPUS)):
        a, b = CAMPUS[i], CAMPUS[(i + 1) % len(CAMPUS)]
        n = int(math.dist(a, b) // 16)
        for k in range(1, n):
            t = k / n
            x, y = a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t
            cx, cy = centro(CAMPUS)
            l = math.hypot(cx - x, cy - y) or 1
            x, y = x + (cx - x) / l * 6, y + (cy - y) / l * 6
            if libre(x, y):
                arboles.append((x, y))
    for x, y in arboles:
        OB.append((prof(x, y), arbol(x, y)))

    # Edificios
    for e in eds:
        pol, area = e["pol"], e["area"]
        nombre = e["nombre"] or ""
        pisos = PISOS_DIBUJO.get(nombre, PISOS.get(nombre, 2 if area >= 700 else 1))
        alto = pisos * PISO + 0.6 if area >= MIN_AREA else 3.2
        solar = e["id"] in SOLAR
        if e["id"] == PASILLO_B_E:
            svg = paredes(pol, PISO, PISO + 1.1, "#cfe5fc", "#7fb6ef", AZUL_OSC) + \
                f'<polygon points="{pts(pol, PISO + 1.1)}" fill="#f7fbff" stroke="{AZUL_OSC}" stroke-width="1"/>'
            sombra(pol, PISO + 1.1, z0=PISO)
            alto = PISO + 1.1
        elif nombre == "Jaguar Center":
            svg = barril(pol, 7.5, 5.5)
            alto = 13
        elif nombre in TECHADOS:
            svg = techado_mesas(pol, 4.2)
            alto = 5.6
        elif nombre == "Kioskos de comida":
            xs = [q[0] for q in pol]
            ys = [q[1] for q in pol]
            x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
            ancho = (x1 - x0) / 3
            svg = "".join(edificio(caja_r(x0 + i * ancho + .6, y0 + 2, x0 + (i + 1) * ancho - .6, y1 - 2), 3.4,
                                   "#fff4d6", "#ffe9a8", "#e0b84a", "#a07a10") for i in range(3))
            alto = 3.4
        elif e["tipo"] == "roof":
            alto = min(alto, 9 if not solar else 5)
            if solar:
                svg = carport(pol)
            else:
                svg = cubierta(pol, alto, "#f6f7f9", "#8a97a6", lado="#f6f7f9")
            alto += 1.4
        else:
            techo, claro, oscuro, borde = MURO_B if nombre in MUROS_CREMA else MURO
            svg = edificio(pol, alto, "url(#solar)" if solar else techo, claro, oscuro, borde,
                           pisos=pisos if area >= MIN_AREA else 0, acentos=ACENTOS.get(nombre, ()))
            if nombre in TECHO_LAMINA:
                svg += techo_dos_aguas(TECHO_LAMINA[nombre], alto, teja=nombre in TECHO_TEJA)
            elif nombre in TECHO_TEJA:          # Edificio I (biblioteca): techo de teja sobre su planta en U
                svg += losa_volada(pol, alto, .7, canto="#c8683f", borde="#8e3f24", techo="url(#teja)", grueso=.6)
            elif nombre == "Food Court":
                svg += food_court(pol, alto)
            if nombre == "Auditorio Central":
                svg += escalera_g(alto)
            elif nombre == "Edificio M":
                svg += alero_y_torre_m(pol, alto)
            elif nombre == "Clínicas Odontológicas":       # losa con alero gris oscuro (foto)
                svg += losa_volada(pol, alto, 1.0, canto="#5b6470", borde="#3d454f", techo="url(#solar)", grueso=.5)
            elif nombre == "Edificio A":
                svg += entrada_a(pol, alto)
            elif not solar and area >= 400:
                svg += equipos(pol, alto)
            if nombre == "Edificio P":
                svg += terraza(pol, alto) + observatorio(pol, alto)
        cx, cy = e["c"]
        OB.append((prof(*max(pol, key=lambda q: prof(*q))), svg))
        e["alto"] = alto + (FLECHA if nombre in TECHO_LAMINA else 2.6 if nombre == "Food Court" else 0)
    # Edificios que no están en OSM
    for nombre, pol, pisos in EXTRA_EDIFICIOS:
        alto = pisos * PISO
        OB.append((prof(*max(pol, key=lambda q: prof(*q))), edificio(pol, alto, *MURO, pisos=pisos)))
        area = abs(sum(pol[i][0] * pol[(i + 1) % 4][1] - pol[(i + 1) % 4][0] * pol[i][1] for i in range(4))) / 2
        eds.append({"nombre": nombre, "c": centro(pol), "alto": alto, "id": nombre, "pol": pol, "area": round(area), "tipo": "extra"})
    # Carports: techos de celdas solares sobre parqueos
    for p in DATOS["parqueos"]:
        if p["id"] in CARPORTS:
            pol = [tuple(q) for q in p["pol"]]
            OB.append((prof(*max(pol, key=lambda q: prof(*q))), carport(pol)))
    # Pasarela frente al Edificio B (James): va desde la entrada de la vía Universidad UAM hasta el
    # parqueo junto al Auditorio, pasa entre el Auditorio y el B y por debajo del pasillo B–E, y en
    # medio tiene una escalera que baja a la Plazoleta. Se dibuja por tramos para que el orden de
    # profundidad sea correcto frente al Edificio M, el B y el A.
    OB.extend(pasarela())
    # Unión central entre B y C (después de B-205): núcleo de escalera que une la planta baja, el
    # 2.º piso de B y C y sube al centro del 3.er piso de C. Va detrás de C y delante de B.
    pb = max(prof(*q) for q in next(e for e in eds if e["nombre"] == "Edificio B")["pol"])
    OB.append((pb + .5, union_bc()))
    # Árboles columnares (tipo falso ashoka) alineados entre el B y el C (foto desde el 3.er piso del C):
    # sus copas asoman sobre el techo del C.
    for x in (191.5, 198.0, 204.5, 211.0, 231.5, 238.0, 244.5, 251.0, 257.5):
        OB.append((pb + .4, arbol_columnar(x, 134.7)))
    # Palmeras en las jardineras de la entrada del A (foto)
    for y in (126.6, 140.8):
        OB.append((prof(276.6, y + 1), palmera(275.1, y)))
    # Árboles grandes de copa ancha alrededor del M (video de James)
    for x, y in ((153.0, 127.0), (153.5, 141.0), (166.0, 152.0)):
        OB.append((prof(x, y), arbol(x, y, r=4.6)))
    OB.sort(key=lambda t: t[0])
    # Rayos X: la pasarela y la unión B–C quedan casi ocultas tras el B y el C desde este ángulo;
    # se marcan encima con un contorno fantasma para que se lean en el mapa.
    OB.append((1e9, fantasmas()))

    # Insignias encima de todo (no las tapa ningún edificio)
    INS = []
    for e in eds:
        cx, cy = e["c"]
        # B queda casi oculto tras C: su insignia va al borde norte del techo y la de C al sur
        cy += {"Edificio B": -3.5, "Edificio C": 3.5}.get(e["nombre"], 0)
        if e["nombre"] == "Clínicas Odontológicas":
            # foto aérea de James: el ala larga este-oeste es el «Edificio N»; la clínica es el bloque norte
            cx, cy = 204.0, 184.0
            INS.append((prof(236, 205), insignia(236.0, 205.2, e["alto"], "N", color=AZUL)))
        if e["nombre"] in INSIGNIA:
            INS.append((prof(cx, cy), insignia(cx, cy, e["alto"], INSIGNIA[e["nombre"]],
                                               color=AZUL_OSC if e["nombre"] == "Edificio P" else AZUL)))
        elif e.get("num") and e["id"] != PASILLO_B_E:
            INS.append((prof(cx, cy), insignia(cx, cy, e["alto"], str(e["num"]), color=GRIS, r=7.5)))
    for nombre, ids in PUNTOS_SEGUROS:
        cx, cy = centro_varios(poligonos_punto(ids))
        z = 20 if ids == "plaza" else 6 if any(i in CARPORTS for i in ids) else 0   # la plazoleta queda detrás del Edificio B
        INS.append((prof(cx, cy) + 1000, insignia(cx, cy, z, "PS", color=VERDE, r=9)))
    INS.sort(key=lambda t: t[0])
    return S, PL, [s for _, s in OB], [s for _, s in INS]


def rotulos(eds):
    por = {e["nombre"]: e for e in eds if e["nombre"]}

    def ancla(nombre):
        e = por[nombre]
        return (*e["c"], e["alto"])   # la línea termina debajo de la insignia (se dibuja antes)

    R = []
    R.append(rotulo(*ancla("Jaguar Center"), -230, -150, "Jaguar Center", punto=False))
    R.append(rotulo(*ancla("Edificio I"), -40, -175, "Edificio I", punto=False, sub="Biblioteca"))
    R.append(rotulo(*ancla("Edificio E"), 60, -200, "Edificio E", punto=False))
    R.append(rotulo(*ancla("Edificio A"), 205, -95, "Edificio A", punto=False))
    R.append(rotulo(*ancla("Edificio P"), 190, 95, "Edificio P", fondo=AMARILLO, color=AZUL_OSC, borde=AZUL_OSC, tam=16, punto=False))
    pz = centro_varios(poligonos_punto("plaza"))
    R.append(rotulo(pz[0], pz[1], 0, 110, -190, "Plazoleta", fondo=VERDE, color=BLANCO, borde=VERDE, tam=15, sub="Punto seguro", punto=False))
    pe = centro_varios(poligonos_punto(["241348792"]))
    R.append(rotulo(pe[0], pe[1], 6, 0, -235, "Parqueo Este", fondo=VERDE, color=BLANCO, borde=VERDE, tam=14, sub="Punto seguro", punto=False))
    f = centro([tuple(q) for q in cancha("soccer")["pol"]])
    b = centro([tuple(q) for q in cancha("baseball")["pol"]])
    R.append(rotulo(f[0], f[1], 0, -215, -60, "Cancha Fútbol", fondo="#2f9e48", color=BLANCO, borde="#2f9e48", tam=15, sub="Zona segura"))
    R.append(rotulo(b[0], b[1], 0, -210, 70, "Estadio Béisbol", fondo="#2f9e48", color=BLANCO, borde="#2f9e48", tam=15, sub="Zona segura"))
    vx, vy = centro(caja_r(10, 57, 41, 83))
    R.append(rotulo(vx, vy, 0, -190, -70, "Voleibol"))
    jx, jy = centro(JUNGLA)
    R.append(rotulo(jx, jy, 6, -20, 165, "Jungla Jaguar", fondo="#2f8f48", color=BLANCO, borde="#2f8f48", tam=14))
    R.append(rotulo(198.5, 119.5, PISO + 1.1, -120, -235, "Pasillo B–E", tam=13))
    R.append(rotulo(223.0, 118.5, PASARELA_Z + 2.9, -110, -150, "Pasarela B", tam=13))
    uam = max((c for c in DATOS["calles"] if c["nombre"] == "Universidad UAM"), key=lambda c: len(c["linea"]))
    mx, my = sorted((tuple(q) for q in uam["linea"] if dentro(tuple(q), CAMPUS)), key=lambda q: q[1])[0]
    R.append(rotulo(mx, my, 0, 190, 200, "Acceso UAM"))
    return R


def rosa(cx, cy, r=46):
    """Rosa de los vientos: N apunta al norte del plano (proyectado)."""
    def dirp(dx, dy):
        a, b = P(0, 0), P(dx, dy)
        l = math.hypot(b[0] - a[0], b[1] - a[1])
        return ((b[0] - a[0]) / l, (b[1] - a[1]) / l)
    g = [f'<ellipse cx="{cx}" cy="{cy}" rx="{r + 14}" ry="{(r + 14) * 0.62:.1f}" fill="{BLANCO}" opacity=".85" stroke="{AZUL}" stroke-width="2"/>']
    for (dx, dy), letra, col in [((0, -1), "N", ROJO), ((1, 0), "E", AZUL), ((0, 1), "S", AZUL), ((-1, 0), "O", AZUL)]:
        ux, uy = dirp(dx, dy)
        px, py = -uy, ux
        g.append(f'<polygon points="{cx + px * 7:.1f},{cy + py * 7:.1f} {cx + ux * (r - 12):.1f},{cy + uy * (r - 12):.1f} {cx - px * 7:.1f},{cy - py * 7:.1f}" fill="{col}"/>')
        g.append(f'<text x="{cx + ux * r:.1f}" y="{cy + uy * r:.1f}" font-size="17" font-weight="900" fill="{col}" text-anchor="middle" dominant-baseline="central">{letra}</text>')
    g.append(f'<circle cx="{cx}" cy="{cy}" r="5" fill="{BLANCO}" stroke="{AZUL}" stroke-width="2"/>')
    return "".join(g)


def lista_codigos(x=1416, y=246):
    """Recuadro con las insignias de los edificios con nombre."""
    filas = [("Auditorio Central (Edif. G)" if n == "Auditorio Central" else n, c) for n, c in INSIGNIA.items()]
    alto = 44 + len(filas) * 21
    g = [f'<rect x="{x}" y="{y}" width="176" height="{alto}" rx="18" fill="{BLANCO}" stroke="{AZUL}" stroke-width="2.5"/>',
         f'<text x="{x + 88}" y="{y + 22}" font-size="15" font-weight="900" fill="{AZUL}" text-anchor="middle" dominant-baseline="central">Edificios</text>']
    for i, (nombre, cod) in enumerate(filas):
        cy = y + 48 + i * 21
        col = AZUL_OSC if nombre == "Edificio P" else AZUL
        g.append(f'<circle cx="{x + 20}" cy="{cy}" r="9" fill="{col}"/>'
                 f'<text x="{x + 20}" y="{cy + .5}" font-size="{11 if len(cod) == 1 else 8.5}" font-weight="800" fill="{BLANCO}" text-anchor="middle" dominant-baseline="central">{cod}</text>'
                 f'<text x="{x + 34}" y="{cy + .5}" font-size="{11.5 if len(nombre) < 18 else 10}" font-weight="700" fill="{AZUL}" dominant-baseline="central">{nombre}</text>')
    return "".join(g)


def documento():
    W, H = 1600, 1060
    encajar(200, 140, 1400, 935)
    eds = clasificar()
    suelo_, planos, objetos, insignias = construir(eds)
    n_sin = sum(1 for e in eds if e.get("num"))
    # Los patrones del suelo y de los techos van en coordenadas del PLANO (metros): la matriz es la
    # misma proyección P(x, y, 0), así las líneas de parqueo, el césped y las celdas solares quedan
    # alineadas con los edificios en vez de con la pantalla.
    plano = (f'patternUnits="userSpaceOnUse" patternTransform="matrix({CA * ESC:.5f} {SA * K * ESC:.5f} '
             f'{-SA * ESC:.5f} {CA * K * ESC:.5f} {OX:.3f} {OY:.3f})"')
    vidrios = "".join(
        f'<pattern id="vidrio{i}" width="6" height="40" patternUnits="userSpaceOnUse"><rect width="6" height="40" fill="{c}"/>'
        f'<rect width="1" height="40" fill="#eef3f8" opacity=".9"/><rect x="1" width="1.2" height="40" fill="#ffffff" opacity=".18"/></pattern>'
        for i, c in enumerate(("#4d7fb3", "#6a9dd0", "#8fbde8")))
    defs = f'''<defs>
  <linearGradient id="cielo" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d6e9ff"/><stop offset=".55" stop-color="#eaf4ff"/><stop offset="1" stop-color="#f6faff"/></linearGradient>
  <radialGradient id="resplandor" cx=".12" cy=".08" r=".7"><stop offset="0" stop-color="#fffbe8" stop-opacity=".9"/><stop offset="1" stop-color="#fffbe8" stop-opacity="0"/></radialGradient>
  <radialGradient id="vineta" cx=".5" cy=".52" r=".72"><stop offset=".62" stop-color="#0b2545" stop-opacity="0"/><stop offset="1" stop-color="#0b2545" stop-opacity=".2"/></radialGradient>
  <radialGradient id="luzsuelo" cx=".3" cy=".25" r=".9"><stop offset="0" stop-color="#ffffff" stop-opacity=".22"/><stop offset=".6" stop-color="#ffffff" stop-opacity="0"/><stop offset="1" stop-color="#20402a" stop-opacity=".12"/></radialGradient>
  <linearGradient id="losa" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9fbb84"/><stop offset=".22" stop-color="#8c7557"/><stop offset="1" stop-color="#5f4c38"/></linearGradient>
  <linearGradient id="franja" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#0066dd"/><stop offset=".5" stop-color="{AZUL}"/><stop offset="1" stop-color="#38b6ff"/></linearGradient>
  <linearGradient id="brillo" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity=".42"/><stop offset=".38" stop-color="#ffffff" stop-opacity="0"/><stop offset=".7" stop-color="#ffffff" stop-opacity=".08"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></linearGradient>
  <linearGradient id="laminaN" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e9eef3"/><stop offset=".55" stop-color="#d3dbe3"/><stop offset="1" stop-color="#f2f5f8"/></linearGradient>
  <linearGradient id="laminaS" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c3ccd5"/><stop offset=".4" stop-color="#d9e0e7"/><stop offset="1" stop-color="#a7b2bd"/></linearGradient>
  <radialGradient id="copa0" cx=".36" cy=".3" r=".75"><stop offset="0" stop-color="#a6e39a"/><stop offset=".45" stop-color="#4cb25f"/><stop offset="1" stop-color="#22703a"/></radialGradient>
  <radialGradient id="copa1" cx=".36" cy=".3" r=".75"><stop offset="0" stop-color="#bfe58e"/><stop offset=".45" stop-color="#62b44e"/><stop offset="1" stop-color="#2f7232"/></radialGradient>
  <radialGradient id="copa2" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#d8ee8c"/><stop offset=".5" stop-color="#8cc63f"/><stop offset="1" stop-color="#4d8a2a"/></radialGradient>
  <pattern id="cesped" width="6" height="6" {plano}><rect width="6" height="6" fill="#d5e8c1"/><circle cx="1" cy="1.5" r=".35" fill="#c4dcac"/><circle cx="4.2" cy="3.6" r=".4" fill="#e2f0d2"/><circle cx="2.6" cy="5" r=".3" fill="#bfd8a6"/><circle cx="5.2" cy=".6" r=".25" fill="#c9e0b2"/></pattern>
  <pattern id="asfalto" width="4" height="4" {plano}><rect width="4" height="4" fill="#9ba4af"/><circle cx="1" cy="1" r=".18" fill="#8a939e"/><circle cx="3" cy="2.6" r=".2" fill="#aab2bc"/></pattern>
  <pattern id="estac" width="2.6" height="16" {plano}><path d="M0 0V5M0 11V16M0 5H2.6M0 11H2.6" stroke="#ffffff" stroke-width=".16" opacity=".85"/><path d="M1.3 7.6h.01" stroke="#fcd222" stroke-width=".3"/></pattern>
  <pattern id="adoquin" width="1.2" height="1.2" {plano}><path d="M0 0H1.2M0 0V1.2" stroke="#d9c595" stroke-width=".08"/></pattern>
  <pattern id="solar" width="1.1" height="1.8" {plano}><rect width="1.1" height="1.8" fill="#1d3c6b"/><rect x=".08" y=".08" width=".94" height="1.64" fill="#2a5590"/><path d="M.08 .9H1.02M.55 .08V1.72" stroke="#5f8cc8" stroke-width=".04"/></pattern>
  <pattern id="vidrioD" width="8" height="40" patternUnits="userSpaceOnUse"><rect width="8" height="40" fill="#2f3b48"/><rect width="2.2" height="40" fill="#f2f4f6"/><rect x="2.2" width="1" height="40" fill="#5c6b7b"/></pattern>
  <linearGradient id="tejaN" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e48a5c"/><stop offset="1" stop-color="#d8774a"/></linearGradient>
  <linearGradient id="tejaS" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c9643a"/><stop offset="1" stop-color="#a94e2c"/></linearGradient>
  <pattern id="teja" width="1.2" height=".9" {plano}><rect width="1.2" height=".9" fill="#d4703f"/><path d="M0 .85H1.2M.6 0V.45M0 .45V.9" stroke="#a9502d" stroke-width=".08"/></pattern>
  <pattern id="reticula" width="5" height="5" patternUnits="userSpaceOnUse"><rect width="5" height="5" fill="#3f86d6"/><path d="M0 .4H5M.4 0V5" stroke="#f2f6fa" stroke-width=".9"/><rect x="1" y="1" width="1.6" height="1.4" fill="#9cc8f0" opacity=".5"/></pattern>
  <pattern id="vidrioV" width="6" height="40" patternUnits="userSpaceOnUse"><rect width="6" height="40" fill="#7fb7a2"/><rect width="1" height="40" fill="#e9efe9"/></pattern>
  {vidrios}
  {"".join(GRADS.values())}
  <clipPath id="recorte"><polygon points="{pts(CAMPUS)}"/></clipPath>
</defs>'''
    cabecera = f'''<rect width="{W}" height="92" fill="url(#franja)"/>
<text x="40" y="46" font-size="40" font-weight="900" fill="{BLANCO}" dominant-baseline="central">Campus UAM</text>
<text x="330" y="48" font-size="20" font-weight="700" fill="{BLANCO}" opacity=".9" dominant-baseline="central">Mapa 3D · evacuación Off-Grid</text>
<text x="{W - 40}" y="46" font-size="30" font-weight="900" fill="{BLANCO}" text-anchor="end" dominant-baseline="central" letter-spacing="1">UNEXUAM</text>'''
    items = [("#f7fbff", AZUL_OSC, "Edificio")] + ([("#fbfcfd", "#8a97a6", f"Anexo (1–{n_sin})")] if n_sin else []) + [
             ("#4f7fbf", "#2f5f9f", "Canchas"),
             ("#47b660", AMARILLO, "Zona segura"), (VERDE, VERDE, "Punto seguro (PS)"),
             ("#9ba4af", "#fcd222", "Acceso vial"),
             ("#c9cfd6", AZUL, "Pasarela B")]
    ley = [f'<g transform="translate(40,{H - 64})"><rect x="0" y="0" width="{W - 80}" height="44" rx="22" fill="{BLANCO}" stroke="{AZUL}" stroke-width="2.5"/>']
    x = 26
    for relleno, borde, txt in items:
        ley.append(f'<rect x="{x}" y="13" width="18" height="18" rx="5" fill="{relleno}" stroke="{borde}" stroke-width="2"/>'
                   f'<text x="{x + 26}" y="23" font-size="15" font-weight="700" fill="{AZUL}" dominant-baseline="central">{txt}</text>')
        x += 26 + len(txt) * 8.9 + 30
    ley.append(f'<text x="{W - 100}" y="23" font-size="12" font-weight="600" fill="{AZUL}" opacity=".8" text-anchor="end" dominant-baseline="central">Plano © OpenStreetMap contributors</text></g>')

    sombras = (f'<g fill="#16304d" opacity=".18">{"".join(SOMBRAS)}</g>'
               f'<g fill="#0e2238" opacity=".20">{"".join(CONTACTO)}</g>')
    cuerpo = "\n".join([f'<g>{"".join(suelo_)}</g>', "".join(planos), sombras, "".join(objetos),
                        f'<rect width="{W}" height="{H}" fill="url(#vineta)"/>',
                        rosa(1490, 190), "".join(rotulos(eds)), "".join(insignias), lista_codigos()])
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" font-family="{FUENTE}" shape-rendering="geometricPrecision">
{defs}
<rect width="{W}" height="{H}" fill="url(#cielo)"/>
<rect width="{W}" height="{H}" fill="url(#resplandor)"/>
{cabecera}
{cuerpo}
{"".join(ley)}
</svg>'''
    (AQUI / "mapa-campus-3d.svg").write_text(svg, encoding="utf-8")
    html = f'''<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Mapa 3D del campus UAM · Unexuam</title>
<style>html,body{{margin:0;background:#cfe5ff}}img{{display:block;width:{W}px;height:{H}px}}</style></head>
<body><img src="mapa-campus-3d.svg" alt="Mapa 3D del campus UAM"></body></html>'''
    (AQUI / "mapa-campus-3d.html").write_text(html, encoding="utf-8")
    (AQUI / "lugares.json").write_text(json.dumps(lugares(eds), ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"SVG, HTML y lugares.json generados ({len(eds)} edificios, {n_sin} sin nombre numerados)")


if __name__ == "__main__":
    documento()
