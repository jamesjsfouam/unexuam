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


# ---------------------------------------------------------------- primitivas
def suelo(poligono, relleno, z=0.0, borde=None, ancho=1.2):
    b = f' stroke="{borde}" stroke-width="{ancho}" stroke-linejoin="round"' if borde else ""
    return f'<polygon points="{pts(poligono, z)}" fill="{relleno}"{b}/>'


def via(puntos, ancho, relleno, borde=None, centro_=None):
    """Calle como banda de ancho fijo (en metros) a lo largo de una polilínea del plano."""
    g = []
    for (x1, y1), (x2, y2) in zip(puntos, puntos[1:]):
        dx, dy = x2 - x1, y2 - y1
        l = math.hypot(dx, dy) or 1
        nx, ny = -dy / l * ancho / 2, dx / l * ancho / 2
        g.append(suelo([(x1 + nx, y1 + ny), (x2 + nx, y2 + ny), (x2 - nx, y2 - ny), (x1 - nx, y1 - ny)], relleno, borde=borde, ancho=.8))
    for x, y in puntos[1:-1]:
        g.append(suelo(elipse(x, y, ancho / 2, ancho / 2, 14), relleno))
    if centro_:
        g.append(f'<polyline points="{pts(puntos)}" fill="none" stroke="{centro_}" stroke-width="1.5" stroke-dasharray="9 8"/>')
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
        t = max(0.0, min(1.0, ny * CA + nx * SA))
        color = mezclar(oscuro, claro, t ** 0.7)
        cara = [P(*a, z0), P(*b, z0), P(*b, z1), P(*a, z1)]
        d = " ".join(f"{u:.1f},{v:.1f}" for u, v in cara)
        caras.append((prof((a[0] + b[0]) / 2, (a[1] + b[1]) / 2),
                      f'<polygon points="{d}" fill="{color}" stroke="{borde}" stroke-width=".7" stroke-linejoin="round"/>'))
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
        t = max(0.0, min(1.0, ny * CA + nx * SA))
        caras.append({"a": a, "b": b, "t": t, "peso": vis * l, "prof": prof((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)})
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
        color = mezclar(oscuro, claro, c["t"] ** 0.7)
        g.append(f'<polygon points="{tramo(c, 0, 1, 0, alto)}" fill="{color}" stroke="{borde}" stroke-width=".7" stroke-linejoin="round"/>')
        largo = math.dist(c["a"], c["b"])
        if largo > 2.5:
            vidrio = mezclar("#4f82b8", "#9cc8f0", c["t"] ** 0.7)
            for f in range(pisos):
                z0 = f * PISO + 1.0
                if z0 + 1.4 > alto - 0.3:
                    break
                g.append(f'<polygon points="{tramo(c, .07, .93, z0, z0 + 1.4)}" fill="{vidrio}"/>')
        if c is frente:
            for ac in acentos:
                tipo = ac[0]
                if tipo == "ladrillo":       # torre de escaleras revestida de ladrillo (Edificio B)
                    g.append(f'<polygon points="{tramo(c, ac[1], ac[2], 0, alto + .4)}" fill="#b4573e" stroke="#7a3322" stroke-width=".7"/>')
                elif tipo == "cristal":      # muro cortina de vidrio (UAM College)
                    g.append(f'<polygon points="{tramo(c, ac[1], ac[2], .4, alto - .2)}" fill="#33b5c2" opacity=".9" stroke="#1d7f8a" stroke-width=".7"/>')
                elif tipo == "franja":       # franja azul con letras doradas (Clínicas, «Edificio N»)
                    g.append(f'<polygon points="{tramo(c, 0, 1, alto - 1.5, alto - .3)}" fill="{AZUL}"/>')
                    g.append(f'<polygon points="{tramo(c, .4, .6, alto - 1.15, alto - .65)}" fill="#e6c15a"/>')
                elif tipo == "barandas":     # pasillos abiertos con barandas grises (Edificio P Copérnico)
                    for f in range(1, pisos + 1):
                        z = f * PISO + 1.0
                        (ax, ay), (bx, by) = c["a"], c["b"]
                        a2, b2 = P(ax, ay, z), P(bx, by, z)
                        g.append(f'<line x1="{a2[0]:.1f}" y1="{a2[1]:.1f}" x2="{b2[0]:.1f}" y2="{b2[1]:.1f}" stroke="#6b7785" stroke-width="1.8"/>')
    return "".join(g)


def edificio(poligono, alto, techo, claro, oscuro, borde, pisos=0, acentos=()):
    muros = fachada(poligono, alto, pisos, claro, oscuro, borde, acentos) if pisos else paredes(poligono, 0, alto, claro, oscuro, borde)
    return muros + f'<polygon points="{pts(poligono, alto)}" fill="{techo}" stroke="{borde}" stroke-width="1" stroke-linejoin="round"/>'


def cubierta(poligono, alto, techo, borde, lado="#f6f7f9"):
    """Techo sobre columnas (edificios marcados como «roof» en OSM, p. ej. Jaguar Center)."""
    g = []
    for x, y in poligono:
        (x1, y1), (x2, y2) = P(x, y, 0), P(x, y, alto)
        g.append(f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" stroke="{borde}" stroke-width="2.2"/>')
    g.append(f'<polygon points="{pts(poligono, 0)}" fill="#d9e6f2" opacity=".55"/>')
    g.append(paredes(poligono, alto, alto + 1.4, mezclar(lado, "#000000", .05), mezclar(lado, "#000000", .25), borde))
    g.append(f'<polygon points="{pts(poligono, alto + 1.4)}" fill="{techo}" stroke="{borde}" stroke-width="1" stroke-linejoin="round" opacity=".96"/>')
    return "".join(g)


def barril(poligono, pared, flecha, n=14):
    """Techo de medio barril (Jaguar Center): paredes grises con paneles turquesa y bóveda metálica.
    La bóveda corre de oeste a este; el arco se ve en las fachadas este y oeste."""
    p0, p1, p2, p3 = poligono[:4]
    if abs(p1[0] - p0[0]) < abs(p1[1] - p0[1]):      # que p0→p1 sea el lado oeste-este
        p0, p1, p2, p3 = p1, p2, p3, p0

    def punto(u, v):
        a = (p0[0] + (p1[0] - p0[0]) * u, p0[1] + (p1[1] - p0[1]) * u)
        b = (p3[0] + (p2[0] - p3[0]) * u, p3[1] + (p2[1] - p3[1]) * u)
        return (a[0] + (b[0] - a[0]) * v, a[1] + (b[1] - a[1]) * v)

    g = [paredes(poligono, 0, pared, "#aab4bf", "#7d8894", "#5d6873")]
    # paneles turquesa en la fachada sur (la que mira al observador)
    sur = max(((poligono[i], poligono[(i + 1) % 4]) for i in range(4)), key=lambda e: e[0][1] + e[1][1])
    (ax, ay), (bx, by) = sur
    for k in range(1, 8, 2):
        t0, t1 = k / 8, (k + .55) / 8
        q = [P(ax + (bx - ax) * t0, ay + (by - ay) * t0, 1), P(ax + (bx - ax) * t1, ay + (by - ay) * t1, 1),
             P(ax + (bx - ax) * t1, ay + (by - ay) * t1, pared - 1), P(ax + (bx - ax) * t0, ay + (by - ay) * t0, pared - 1)]
        g.append(f'<polygon points="{" ".join(f"{a:.1f},{b:.1f}" for a, b in q)}" fill="#2cc1c4" opacity=".9"/>')
    # bóveda: franjas de norte (v=0) a sur (v=1)
    for i in range(n):
        v0, v1 = i / n, (i + 1) / n
        z0 = pared + flecha * math.sin(math.pi * v0)
        z1 = pared + flecha * math.sin(math.pi * v1)
        pend = math.cos(math.pi * (v0 + v1) / 2)          # >0 mira al norte, <0 al sur
        color = mezclar("#9aa6b2", "#eef2f6", max(0, min(1, .55 - pend * .45)))
        q = [P(*punto(0, v0), z0), P(*punto(1, v0), z0), P(*punto(1, v1), z1), P(*punto(0, v1), z1)]
        g.append(f'<polygon points="{" ".join(f"{a:.1f},{b:.1f}" for a, b in q)}" fill="{color}" stroke="{color}" stroke-width=".6"/>')
    # arco de la fachada este (visible)
    arco = [P(*punto(1, i / n), pared + flecha * math.sin(math.pi * i / n)) for i in range(n + 1)] + \
           [P(*punto(1, 1), pared), P(*punto(1, 0), pared)]
    g.append(f'<polygon points="{" ".join(f"{a:.1f},{b:.1f}" for a, b in arco)}" fill="#8d97a2" stroke="#5d6873" stroke-width=".8"/>')
    return "".join(g)


def terraza(pol, alto):
    """Baranda gris de la terraza en el techo (Edificio P Copérnico, foto aérea de la UAM)."""
    g = []
    for i in range(len(pol)):
        (ax, ay), (bx, by) = pol[i], pol[(i + 1) % len(pol)]
        a, b = P(ax, ay, alto + 1.1), P(bx, by, alto + 1.1)
        g.append(f'<line x1="{a[0]:.1f}" y1="{a[1]:.1f}" x2="{b[0]:.1f}" y2="{b[1]:.1f}" stroke="#6b7785" stroke-width="1.6"/>')
        n = max(1, int(math.dist((ax, ay), (bx, by)) // 3))
        for k in range(n + 1):
            x, y = ax + (bx - ax) * k / n, ay + (by - ay) * k / n
            u, v = P(x, y, alto), P(x, y, alto + 1.1)
            g.append(f'<line x1="{u[0]:.1f}" y1="{u[1]:.1f}" x2="{v[0]:.1f}" y2="{v[1]:.1f}" stroke="#6b7785" stroke-width=".9"/>')
    return "".join(g)


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
    r *= ESC
    sx, sy = P(x, y)
    return (f'<ellipse cx="{sx + 2:.1f}" cy="{sy + 1:.1f}" rx="{r * 1.1:.1f}" ry="{r * .45:.1f}" fill="#000" opacity=".12"/>'
            f'<rect x="{sx - 1.1:.1f}" y="{sy - r * 1.1:.1f}" width="2.2" height="{r * 1.1:.1f}" fill="#7a5a3a"/>'
            f'<circle cx="{sx:.1f}" cy="{sy - r * 1.6:.1f}" r="{r:.1f}" fill="#3fae5a"/>'
            f'<circle cx="{sx - r * .3:.1f}" cy="{sy - r * 1.9:.1f}" r="{r * .45:.1f}" fill="#7fd68a" opacity=".8"/>')


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
            "Edificio E": "E", "Edificio F": "F", "Auditorio Central": "AC", "Edificio M": "M",
            "Food Court": "FC", "Banco Banpro": "BP", "Edificio B": "B", "Edificio C": "C",
            "Edificio A": "A", "Laboratorios": "LB", "Edificio D": "D", "Edificio J": "J",
            "Kioskos de comida": "KC", "El Ranchero": "RA", "Clínicas Odontológicas": "CO",
            "El Chilamate": "CH", "Edificio O": "O", "Edificio P": "P", "Comedor del Jaguarcito": "CJ",
            "Baño del Comedor": "BA", "Kiosko del Jaguarcito": "KJ"}
PISO = 3.6   # metros por piso
PISOS = {"Edificio P": 3, "Edificio C": 3, "Edificio M": 3, "Edificio I": 1, "Edificio A": 2, "Edificio B": 2, "Edificio E": 2,
         "Edificio O": 2, "Clínicas Odontológicas": 2}       # dato de James; el resto se estima
TECHADOS = {"Comedor del Jaguarcito", "El Chilamate"}
# Detalles de fachada vistos en las fotos de la UAM (búsqueda de imágenes, 22/11/2026)
ACENTOS = {
    "Edificio M": [("cristal", .38, .62)],
    "Clínicas Odontológicas": [("franja",)],
}
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


def construir(eds):
    S, PL, OB = [], [], []

    # Terreno: losa con espesor
    for i in range(len(CAMPUS)):
        a, b = CAMPUS[i], CAMPUS[(i + 1) % len(CAMPUS)]
        cara = [P(*a, 0), P(*b, 0), P(*b, -6), P(*a, -6)]
        if (cara[0][1] + cara[1][1]) / 2 < P(*centro(CAMPUS))[1]:
            continue
        S.append(f'<polygon points="{" ".join(f"{u:.1f},{v:.1f}" for u, v in cara)}" fill="#a8bd93" stroke="#879e72" stroke-width="1"/>')
    S.append(suelo(CAMPUS, "url(#terreno)", borde="#c2b78f"))

    # Parqueos y plazoleta (puntos seguros con contorno verde discontinuo)
    seguros = {i for _, ids in PUNTOS_SEGUROS if ids != "plaza" for i in ids}
    for p in DATOS["parqueos"]:
        pol = [tuple(q) for q in p["pol"]]
        PL.append(suelo(pol, "#d3d9e1", borde="#b7c1cd"))
        if p["id"] in seguros:
            PL.append(f'<polygon points="{pts(pol)}" fill="none" stroke="{VERDE}" stroke-width="2.2" stroke-dasharray="7 5"/>')
    for pl in DATOS["plazas"]:
        pol = [tuple(q) for q in pl["pol"]]
        PL.append(suelo(pol, "#f1e3bf", borde="#d8c28d"))
        cx, cy = centro(pol)
        PL.append(suelo([(cx - 9, cy - 6), (cx + 9, cy - 6), (cx + 9, cy + 6), (cx - 9, cy + 6)], "#c9775a", borde=BLANCO))  # cancha
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
            calles.append(via(linea, anchos.get(c["tipo"], 4), "#c5ccd6" if principal else "#f1f3f6",
                              borde="#a9b3c0" if principal else "#cfd6df", centro_=BLANCO if principal else None))
    PL.append(f'<g clip-path="url(#recorte)">{"".join(calles)}</g>')

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
        pisos = PISOS.get(nombre, 2 if area >= 700 else 1)
        alto = pisos * PISO + 0.6 if area >= MIN_AREA else 3.2
        solar = e["id"] in SOLAR
        if e["id"] == PASILLO_B_E:
            svg = paredes(pol, PISO, PISO + 1.1, "#cfe5fc", "#7fb6ef", AZUL_OSC) + \
                f'<polygon points="{pts(pol, PISO + 1.1)}" fill="#f7fbff" stroke="{AZUL_OSC}" stroke-width="1"/>'
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
            svg = cubierta(pol, alto, "url(#solar)" if solar else "#f6f7f9",
                           "#4b5f78" if solar else "#8a97a6", lado="#9fb3cc" if solar else "#f6f7f9")
            alto += 1.4
        else:
            techo, claro, oscuro, borde = MURO
            svg = edificio(pol, alto, "url(#solar)" if solar else techo, claro, oscuro, borde,
                           pisos=pisos if area >= MIN_AREA else 0, acentos=ACENTOS.get(nombre, ()))
            if nombre == "Edificio P":
                svg += terraza(pol, alto) + observatorio(pol, alto)
        cx, cy = e["c"]
        OB.append((prof(*max(pol, key=lambda q: prof(*q))), svg))
        e["alto"] = alto
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
            OB.append((prof(*max(pol, key=lambda q: prof(*q))), cubierta(pol, 4.5, "url(#solar)", "#4b5f78", lado="#9fb3cc")))
    OB.sort(key=lambda t: t[0])

    # Insignias encima de todo (no las tapa ningún edificio)
    INS = []
    for e in eds:
        cx, cy = e["c"]
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
    R.append(rotulo(*ancla("Jaguar Center"), -230, -150, "Jaguar Center", punto=False, sub="Gimnasio techado"))
    R.append(rotulo(*ancla("Edificio I"), -40, -175, "Edificio I", punto=False, sub="Biblioteca Pablo Antonio Cuadra"))
    R.append(rotulo(*ancla("Edificio E"), 60, -200, "Edificio E", punto=False))
    R.append(rotulo(*ancla("Edificio A"), 205, -95, "Edificio A", punto=False))
    R.append(rotulo(*ancla("Edificio P"), 190, 95, "Edificio P", fondo=AMARILLO, color=AZUL_OSC, borde=AZUL_OSC, tam=16, punto=False, sub="Copérnico · celdas solares"))
    pz = centro_varios(poligonos_punto("plaza"))
    R.append(rotulo(pz[0], pz[1], 0, 110, -190, "Plazoleta", fondo=VERDE, color=BLANCO, borde=VERDE, tam=15, sub="Punto seguro", punto=False))
    pe = centro_varios(poligonos_punto(["241348792"]))
    R.append(rotulo(pe[0], pe[1], 6, 0, -235, "Celdas solares", fondo=VERDE, color=BLANCO, borde=VERDE, tam=14, sub="Parqueo · punto seguro", punto=False))
    f = centro([tuple(q) for q in cancha("soccer")["pol"]])
    b = centro([tuple(q) for q in cancha("baseball")["pol"]])
    R.append(rotulo(f[0], f[1], 0, -215, -60, "Zona segura", fondo="#2f9e48", color=BLANCO, borde="#2f9e48", tam=16, sub="Cancha de fútbol"))
    R.append(rotulo(b[0], b[1], 0, -210, 70, "Zona segura", fondo="#2f9e48", color=BLANCO, borde="#2f9e48", tam=16, sub="Jaguar Stadium (béisbol)"))
    vx, vy = centro(caja_r(10, 57, 41, 83))
    R.append(rotulo(vx, vy, 0, -190, -70, "Canchas de voleibol", sub="arena · normal"))
    jx, jy = centro(JUNGLA)
    R.append(rotulo(jx, jy, 6, -20, 165, "Jungla Jaguar", fondo="#2f8f48", color=BLANCO, borde="#2f8f48", tam=14))
    R.append(rotulo(198.5, 119.5, PISO + 1.1, -120, -235, "Pasillo B–E", sub="2.º piso", tam=13))
    uam = max((c for c in DATOS["calles"] if c["nombre"] == "Universidad UAM"), key=lambda c: len(c["linea"]))
    mx, my = sorted((tuple(q) for q in uam["linea"] if dentro(tuple(q), CAMPUS)), key=lambda q: q[1])[0]
    R.append(rotulo(mx, my, 0, 190, 200, "Universidad UAM", sub="Vía de acceso"))
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
    filas = list(INSIGNIA.items())
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
    defs = f'''<defs>
  <linearGradient id="cielo" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e9f4ff"/><stop offset="1" stop-color="#cfe5ff"/></linearGradient>
  <linearGradient id="terreno" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e3efd5"/><stop offset="1" stop-color="#d2e6c0"/></linearGradient>
  <linearGradient id="franja" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#0066dd"/><stop offset=".5" stop-color="{AZUL}"/><stop offset="1" stop-color="#38b6ff"/></linearGradient>
  <filter id="sombra" x="-10%" y="-10%" width="120%" height="130%"><feDropShadow dx="0" dy="10" stdDeviation="12" flood-color="#003c82" flood-opacity=".22"/></filter>
  <pattern id="solar" width="7" height="5" patternUnits="userSpaceOnUse" patternTransform="skewX(-28)"><rect width="7" height="5" fill="#1f3f6e"/><path d="M0 .4H7M.4 0V5" stroke="#7aa3d6" stroke-width=".9"/></pattern>
  <clipPath id="recorte"><polygon points="{pts(CAMPUS)}"/></clipPath>
</defs>'''
    cabecera = f'''<rect width="{W}" height="92" fill="url(#franja)"/>
<text x="40" y="46" font-size="40" font-weight="900" fill="{BLANCO}" dominant-baseline="central">Campus UAM</text>
<text x="330" y="48" font-size="20" font-weight="700" fill="{BLANCO}" opacity=".9" dominant-baseline="central">Mapa 3D · evacuación Off-Grid</text>
<text x="{W - 40}" y="46" font-size="30" font-weight="900" fill="{BLANCO}" text-anchor="end" dominant-baseline="central" letter-spacing="1">UNEXUAM</text>'''
    items = [("#f7fbff", AZUL_OSC, "Edificio")] + ([("#fbfcfd", "#8a97a6", f"Sin nombre (1–{n_sin})")] if n_sin else []) + [
             ("#4f7fbf", "#2f5f9f", "Canchas"),
             ("#47b660", AMARILLO, "Zona segura"), (VERDE, VERDE, "Punto seguro (PS)"),
             ("url(#solar)", "#4b5f78", "Celdas solares"), ("#c5ccd6", "#a9b3c0", "Vía Universidad UAM")]
    ley = [f'<g transform="translate(40,{H - 64})"><rect x="0" y="0" width="{W - 80}" height="44" rx="22" fill="{BLANCO}" stroke="{AZUL}" stroke-width="2.5"/>']
    x = 26
    for relleno, borde, txt in items:
        ley.append(f'<rect x="{x}" y="13" width="18" height="18" rx="5" fill="{relleno}" stroke="{borde}" stroke-width="2"/>'
                   f'<text x="{x + 26}" y="23" font-size="15" font-weight="700" fill="{AZUL}" dominant-baseline="central">{txt}</text>')
        x += 26 + len(txt) * 8.9 + 30
    ley.append(f'<text x="{W - 100}" y="23" font-size="12" font-weight="600" fill="{AZUL}" opacity=".8" text-anchor="end" dominant-baseline="central">Plano © OpenStreetMap contributors</text></g>')

    cuerpo = "\n".join([f'<g filter="url(#sombra)">{"".join(suelo_)}</g>', "".join(planos), "".join(objetos),
                        rosa(1490, 190), "".join(rotulos(eds)), "".join(insignias), lista_codigos()])
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" font-family="{FUENTE}">
{defs}
<rect width="{W}" height="{H}" fill="url(#cielo)"/>
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
