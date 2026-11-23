"""
Mapa 3D (axonométrico) del campus UAM con la marca Unexuam.

Recrea la distribución del mapa del campus (foto de un post de Facebook) como una
ilustración limpia en 3D. Todo es local: genera `mapa-campus-3d.svg` y `mapa-campus-3d.html`
en esta carpeta, y el PNG se exporta con Edge en modo headless (ver README.md).

Coordenadas del plano: las de la foto multiplicadas por 2 (x hacia la derecha, y hacia abajo,
el norte arriba). La proyección gira el plano unos grados y lo inclina para verlo en 3D.

Uso:  python generar_mapa.py
"""

import math
from pathlib import Path

AQUI = Path(__file__).parent

# ---------------------------------------------------------------- paleta Unexuam
AZUL = "#0080ff"
AZUL_OSC = "#0058b8"
ROJO = "#cc0000"
AMARILLO = "#fcd222"
BLANCO = "#ffffff"
FUENTE = "Montserrat, 'Segoe UI', Bahnschrift, Arial, sans-serif"

# ---------------------------------------------------------------- proyección
ANG = math.radians(16)   # giro del plano
K = 0.58                 # inclinación (achatamiento vertical)
CA, SA = math.cos(ANG), math.sin(ANG)
# Escala y desplazamiento: se calculan para que el campus llene el área de dibujo
ESC, OX, OY = 1.0, 0.0, 0.0
CAMPUS = [(20, 40), (930, 40), (930, 500), (810, 500), (810, 690), (20, 690)]


def P(x, y, z=0.0):
    xr = x * CA - y * SA
    yr = x * SA + y * CA
    return (xr * ESC + OX, (yr * K - z) * ESC + OY)


def encajar(x0, y0, x1, y1):
    """Ajusta ESC, OX y OY para que el campus (con su relieve) quepa en el rectángulo dado."""
    global ESC, OX, OY
    ESC, OX, OY = 1.0, 0.0, 0.0
    pts_ = [P(x, y, z) for x, y in CAMPUS for z in (-16, 60)]
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


def rect(x0, y0, x1, y1):
    return [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]


def elipse(cx, cy, rx, ry, n=48):
    return [(cx + rx * math.cos(2 * math.pi * i / n), cy + ry * math.sin(2 * math.pi * i / n)) for i in range(n)]


def mezclar(hex1, hex2, t):
    a = [int(hex1[i:i + 2], 16) for i in (1, 3, 5)]
    b = [int(hex2[i:i + 2], 16) for i in (1, 3, 5)]
    return "#" + "".join(f"{round(a[i] + (b[i] - a[i]) * t):02x}" for i in range(3))


# ---------------------------------------------------------------- primitivas
def suelo(poligono, relleno, z=0.0, borde=None, extra=""):
    b = f' stroke="{borde}" stroke-width="1.2"' if borde else ""
    return f'<polygon points="{pts(poligono, z)}" fill="{relleno}"{b} {extra}/>'


def linea(a, b, color, ancho, z=0.0, extra=""):
    (x1, y1), (x2, y2) = P(*a, z), P(*b, z)
    return f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" stroke="{color}" stroke-width="{ancho}" {extra}/>'


def caja(poligono, alto, techo, lado_claro, lado_osc, z0=0.0, borde=AZUL_OSC):
    """Prisma recto sobre un polígono convexo. Devuelve SVG con las caras visibles y el techo."""
    cx = sum(p[0] for p in poligono) / len(poligono)
    cy = sum(p[1] for p in poligono) / len(poligono)
    caras = []
    n = len(poligono)
    for i in range(n):
        a, b = poligono[i], poligono[(i + 1) % n]
        nx, ny = b[1] - a[1], -(b[0] - a[0])
        mx, my = (a[0] + b[0]) / 2 - cx, (a[1] + b[1]) / 2 - cy
        if nx * mx + ny * my < 0:
            nx, ny = -nx, -ny
        l = math.hypot(nx, ny) or 1
        nx, ny = nx / l, ny / l
        if (nx * SA + ny * CA) <= 0.02:
            continue  # cara de espaldas
        # cara sur = clara, cara este = oscura (luz desde el noroeste)
        t = max(0.0, min(1.0, (ny * CA + nx * SA) ))
        color = mezclar(lado_osc, lado_claro, t ** 0.7)
        cara = [P(*a, z0), P(*b, z0), P(*b, z0 + alto), P(*a, z0 + alto)]
        d = " ".join(f"{u:.1f},{v:.1f}" for u, v in cara)
        caras.append((prof((a[0] + b[0]) / 2, (a[1] + b[1]) / 2),
                      f'<polygon points="{d}" fill="{color}" stroke="{borde}" stroke-width=".8" stroke-linejoin="round"/>'))
    caras.sort()
    techo_svg = f'<polygon points="{pts(poligono, z0 + alto)}" fill="{techo}" stroke="{borde}" stroke-width="1" stroke-linejoin="round"/>'
    return "".join(c for _, c in caras) + techo_svg


def arbol(x, y, r=7.0):
    r *= ESC
    sx, sy = P(x, y)
    return (f'<ellipse cx="{sx + 3:.1f}" cy="{sy + 1:.1f}" rx="{r * 1.1:.1f}" ry="{r * .45:.1f}" fill="#000" opacity=".12"/>'
            f'<rect x="{sx - 1.3:.1f}" y="{sy - r * 1.1:.1f}" width="2.6" height="{r * 1.1:.1f}" fill="#7a5a3a"/>'
            f'<circle cx="{sx:.1f}" cy="{sy - r * 1.6:.1f}" r="{r:.1f}" fill="#3fae5a"/>'
            f'<circle cx="{sx - r * .3:.1f}" cy="{sy - r * 1.9:.1f}" r="{r * .45:.1f}" fill="#7fd68a" opacity=".8"/>')


def insignia(x, y, z, letra, color=AZUL, texto=BLANCO, r=11):
    r = r * min(ESC, 1.25)
    sx, sy = P(x, y, z)
    return (f'<g><circle cx="{sx:.1f}" cy="{sy:.1f}" r="{r + 2}" fill="{BLANCO}" opacity=".95"/>'
            f'<circle cx="{sx:.1f}" cy="{sy:.1f}" r="{r}" fill="{color}"/>'
            f'<text x="{sx:.1f}" y="{sy + 0.5:.1f}" font-size="{r * 1.25:.1f}" font-weight="800" fill="{texto}" '
            f'text-anchor="middle" dominant-baseline="central">{letra}</text></g>')


def rotulo(ax, ay, az, dx, dy, texto, fondo=BLANCO, color=AZUL, borde=AZUL, tam=13, sub=None):
    """Píldora con texto y línea guía hacia el punto (ax, ay, az) del plano."""
    sx, sy = P(ax, ay, az)
    tx, ty = sx + dx, sy + dy
    w = len(texto) * tam * 0.62 + 22
    h = tam + 12 + (tam * 0.95 if sub else 0)
    g = [f'<line x1="{sx:.1f}" y1="{sy:.1f}" x2="{tx:.1f}" y2="{ty:.1f}" stroke="{borde}" stroke-width="1.4" stroke-dasharray="3 3"/>',
         f'<circle cx="{sx:.1f}" cy="{sy:.1f}" r="3" fill="{borde}"/>',
         f'<rect x="{tx - w / 2:.1f}" y="{ty - h / 2:.1f}" width="{w:.1f}" height="{h:.1f}" rx="{min(h / 2, 15):.1f}" fill="{fondo}" stroke="{borde}" stroke-width="2"/>']
    if sub:
        g.append(f'<text x="{tx:.1f}" y="{ty - tam * 0.35:.1f}" font-size="{tam}" font-weight="800" fill="{color}" text-anchor="middle" dominant-baseline="central">{texto}</text>')
        g.append(f'<text x="{tx:.1f}" y="{ty + tam * 0.6:.1f}" font-size="{tam * 0.72:.1f}" font-weight="600" fill="{color}" text-anchor="middle" dominant-baseline="central" opacity=".85">{sub}</text>')
    else:
        g.append(f'<text x="{tx:.1f}" y="{ty + 0.5:.1f}" font-size="{tam}" font-weight="800" fill="{color}" text-anchor="middle" dominant-baseline="central">{texto}</text>')
    return "".join(g)


# ---------------------------------------------------------------- escena
def construir():
    capas = {"suelo": [], "planos": [], "lineas": [], "objetos": [], "rotulos": []}
    S = capas["suelo"]
    PL = capas["planos"]
    LN = capas["lineas"]
    OB = []  # (profundidad, svg)

    # Terreno del campus (losa con espesor)
    campus = CAMPUS
    for i in range(len(campus)):
        a, b = campus[i], campus[(i + 1) % len(campus)]
        nx, ny = b[1] - a[1], -(b[0] - a[0])
        if nx * SA + ny * CA <= 0:
            continue
        cara = [P(*a, 0), P(*b, 0), P(*b, -16), P(*a, -16)]
        S.append(f'<polygon points="{" ".join(f"{u:.1f},{v:.1f}" for u, v in cara)}" fill="#7fb36e" stroke="#5f9550" stroke-width="1"/>')
    S.append(suelo(campus, "url(#cesped)", borde="#6ea85e"))

    # Calles (gris suave con línea central)
    calles = [
        rect(690, 0, 716, 500),     # avenida desde la entrada principal (este)
        rect(230, 76, 716, 102),    # calle norte
        rect(360, 76, 384, 690),    # calle central (norte-sur)
        rect(384, 474, 810, 498),   # calle sur
        rect(384, 280, 690, 298),   # calle interna frente a B/C
    ]
    for c in calles:
        PL.append(suelo(c, "#dfe4ea", borde="#c4ccd6"))
    LN.append(linea((703, 0), (703, 500), BLANCO, 1.6, extra='stroke-dasharray="10 9"'))
    LN.append(linea((230, 89), (690, 89), BLANCO, 1.6, extra='stroke-dasharray="10 9"'))
    LN.append(linea((372, 102), (372, 690), BLANCO, 1.6, extra='stroke-dasharray="10 9"'))
    LN.append(linea((384, 486), (810, 486), BLANCO, 1.6, extra='stroke-dasharray="10 9"'))

    # Parqueos con líneas de cajones
    def parqueo(x0, y0, x1, y1, paso=16, vertical=True):
        PL.append(suelo(rect(x0, y0, x1, y1), "#cfd6df", borde="#b5bfcb"))
        if vertical:
            mid = (y0 + y1) / 2
            x = x0 + paso
            while x < x1 - 2:
                LN.append(linea((x, y0 + 4), (x, mid - 6), BLANCO, 1.3))
                LN.append(linea((x, mid + 6), (x, y1 - 4), BLANCO, 1.3))
                x += paso
        else:
            mid = (x0 + x1) / 2
            y = y0 + paso
            while y < y1 - 2:
                LN.append(linea((x0 + 4, y), (mid - 6, y), BLANCO, 1.3))
                LN.append(linea((mid + 6, y), (x1 - 4, y), BLANCO, 1.3))
                y += paso

    parqueo(500, 116, 680, 226)          # parqueo norte
    parqueo(728, 280, 920, 462, vertical=False)  # parqueo este
    parqueo(250, 110, 345, 150)          # parqueo junto al centro de mediación

    # Plaza central (adoquín) y caminos
    PL.append(suelo(rect(505, 238, 610, 272), "#f1e6c8", borde="#d9c99c"))
    PL.append(suelo(rect(398, 150, 420, 470), "#ece3cc", borde="#d9c99c"))       # paseo junto a E-F-G-M-H
    PL.append(suelo(rect(420, 336, 690, 352), "#ece3cc", borde="#d9c99c"))       # pasillo techado B/C

    # Cancha de fútbol
    cx0, cy0, cx1, cy1 = 44, 300, 300, 470
    PL.append(suelo(rect(cx0 - 8, cy0 - 8, cx1 + 8, cy1 + 8), "#2f9e48"))
    franjas = 8
    for i in range(franjas):
        xa = cx0 + (cx1 - cx0) * i / franjas
        xb = cx0 + (cx1 - cx0) * (i + 1) / franjas
        PL.append(suelo(rect(xa, cy0, xb, cy1), "#43b45c" if i % 2 else "#3aa853"))
    blanco = f'stroke="{BLANCO}" stroke-width="1.8" fill="none"'
    LN.append(f'<polygon points="{pts(rect(cx0, cy0, cx1, cy1))}" {blanco}/>')
    mx = (cx0 + cx1) / 2
    LN.append(linea((mx, cy0), (mx, cy1), BLANCO, 1.8))
    LN.append(f'<polygon points="{pts(elipse(mx, (cy0 + cy1) / 2, 24, 24))}" {blanco}/>')
    LN.append(f'<polygon points="{pts(rect(cx0, 345, cx0 + 38, 425))}" {blanco}/>')
    LN.append(f'<polygon points="{pts(rect(cx1 - 38, 345, cx1, 425))}" {blanco}/>')
    for gx in (cx0 - 6, cx1 + 6):  # porterías
        OB.append((prof(gx, 385), caja(rect(gx - 3, 372, gx + 3, 398), 9, BLANCO, "#e8eef5", "#b8c4d2", borde="#8a99ab")))

    # Campo de béisbol
    PL.append(suelo(rect(40, 520, 250, 675), "#3aa853"))
    home = (70, 660)
    diamante = [home, (130, 600), (70, 540), (10 + 60 * 0, 600)]
    diamante = [(70, 655), (130, 600), (70, 545), (10 + 0, 600)]
    PL.append(suelo([(70, 660), (175, 585), (70, 520), (40, 560), (40, 650)], "#d9a066"))
    PL.append(suelo([(80, 640), (140, 595), (85, 552), (60, 590)], "#43b45c"))
    LN.append(linea((70, 660), (240, 540), BLANCO, 1.6))
    LN.append(linea((70, 660), (70, 525), BLANCO, 1.6))
    OB.append((prof(48, 668), caja(rect(36, 662, 60, 672), 18, BLANCO, "#e8eef5", "#b8c4d2", borde="#8a99ab")))  # malla de back-stop

    # Área de contenedores (filas de contenedores de colores)
    colores = [AZUL, ROJO, AMARILLO, "#2c9b6b", AZUL, ROJO]
    for i, col in enumerate(colores):
        x = 40 + (i % 3) * 34
        y = 60 + (i // 3) * 26
        OB.append((prof(x + 15, y + 10), caja(rect(x, y, x + 30, y + 18), 13, mezclar(col, BLANCO, .25), col, mezclar(col, "#000000", .35), borde=mezclar(col, "#000000", .45))))

    # ---------------- edificios (x0, y0, x1, y1, alto, letra o None)
    tech = "#f7fbff"
    claro, osc = "#cfe5fc", "#7fb6ef"
    edificios = [
        # letra, polígono, alto
        ("I", rect(100, 130, 140, 166), 22),                # Bodega
        ("L", rect(100, 188, 140, 228), 24),
        ("", rect(270, 118, 322, 264), 30),                 # Centro de mediación y arbitraje
        ("E", rect(400, 162, 434, 268), 34),
        ("F", rect(440, 214, 478, 260), 30),
        ("M", rect(398, 352, 436, 394), 28),
        ("H", rect(386, 412, 428, 452), 26),
        ("B", rect(500, 300, 620, 332), 30),
        ("C", rect(500, 356, 620, 388), 30),
        ("A", rect(632, 320, 684, 372), 34),
        ("K", rect(612, 238, 666, 292), 36),
        ("D", rect(580, 470, 610, 500), 26),
        ("J", rect(616, 470, 646, 500), 26),
        ("", rect(408, 498, 486, 532), 18),                 # Comedor
        ("", rect(420, 568, 500, 612), 22),                 # Clínica odontológica
        ("", [(744, 248), (770, 248), (770, 266), (744, 266)], 14),   # Baño
    ]
    # N: edificio grande en L al sur
    n_a = rect(500, 534, 640, 574)
    n_b = rect(500, 574, 548, 640)
    for letra, poli, alto in edificios:
        cx = sum(p[0] for p in poli) / 4
        cy = sum(p[1] for p in poli) / 4
        svg = caja(poli, alto, tech, claro, osc)
        if letra:
            svg += insignia(cx, cy, alto, letra)
        OB.append((prof(max(p[0] for p in poli), max(p[1] for p in poli)), svg))
    OB.append((prof(548, 640), caja(n_b, 30, tech, claro, osc)))
    OB.append((prof(640, 574), caja(n_a, 30, tech, claro, osc) + insignia(570, 554, 30, "N")))

    # G: edificio del evento, resaltado en rojo
    g = rect(412, 282, 458, 330)
    OB.append((prof(458, 330), caja(g, 38, "#fff1f1", "#ffb3b3", ROJO, borde="#8a0000") + insignia(435, 306, 38, "G", color=ROJO)))

    # Jaguar Center (pabellón redondo naranja)
    jag = elipse(180, 236, 22, 22, 28)
    OB.append((prof(180, 258), caja(jag, 16, "#ffb347", "#ffc978", "#e07b00", borde="#a65700")))

    # Pórtico de la entrada principal (amarillo)
    OB.append((prof(686, 30), caja(rect(682, 22, 690, 32), 34, AMARILLO, "#ffe680", "#d4a900", borde="#8f7200")))
    OB.append((prof(720, 30), caja(rect(716, 22, 724, 32), 34, AMARILLO, "#ffe680", "#d4a900", borde="#8f7200")))
    OB.append((prof(724, 32), caja(rect(680, 22, 726, 32), 8, AMARILLO, "#ffe680", "#d4a900", z0=34, borde="#8f7200")))

    # Autos en los parqueos (cajas pequeñas)
    autos = [(508, 124, AZUL), (540, 124, ROJO), (588, 124, BLANCO), (636, 124, AMARILLO),
             (524, 182, BLANCO), (572, 182, AZUL), (652, 182, ROJO),
             (736, 300, BLANCO), (736, 348, AZUL), (836, 316, ROJO), (836, 396, BLANCO), (736, 412, AMARILLO),
             (262, 116, ROJO), (310, 116, BLANCO)]
    for x, y, col in autos:
        vertical = y < 260 or x < 400
        poli = rect(x, y, x + 10, y + 20) if vertical else rect(x, y, x + 22, y + 10)
        OB.append((prof(x + 10, y + 20), caja(poli, 6, mezclar(col, BLANCO, .2), col, mezclar(col, "#000000", .3), borde=mezclar(col, "#000000", .5))))

    # Árboles
    arboles = [(190, 120), (215, 150), (205, 300), (330, 300), (330, 360), (330, 430), (340, 500),
               (20 + 300, 520), (290, 560), (300, 620), (260, 660), (350, 650), (470, 150), (480, 120),
               (690, 250), (700, 300), (700, 440), (740, 230), (900, 250), (880, 480), (760, 520), (680, 560),
               (720, 600), (660, 650), (560, 660), (450, 650), (230, 40), (300, 50), (420, 50), (560, 50),
               (640, 60), (770, 70), (840, 70), (900, 110), (900, 170), (520, 420), (600, 420), (450, 230),
               (150, 280), (100, 280), (60, 500), (40, 260)]
    for x, y in arboles:
        OB.append((prof(x, y), arbol(x, y)))

    OB.sort(key=lambda t: t[0])
    capas["objetos"] = [s for _, s in OB]

    # ---------------- rótulos
    R = capas["rotulos"]
    R.append(rotulo(703, 10, 46, 105, -62, "Entrada principal", fondo=AMARILLO, color=AZUL, borde=AZUL_OSC, tam=16, sub="Main entrance"))
    R.append(rotulo(435, 306, 38, 70, -250, "Evento", fondo=ROJO, color=BLANCO, borde=ROJO, tam=18, sub="Edificio G"))
    R.append(rotulo(590, 170, 0, 70, -96, "Parqueo", sub="Parking lot"))
    R.append(rotulo(824, 371, 0, 110, -40, "Parqueo", sub="Parking lot"))
    R.append(rotulo(557, 255, 0, -10, -150, "Plaza central", sub="Central square"))
    R.append(rotulo(172, 385, 0, -230, -40, "Cancha de fútbol", sub="Soccer field"))
    R.append(rotulo(110, 600, 0, -150, 80, "Campo de béisbol", sub="Baseball field"))
    R.append(rotulo(296, 190, 30, -40, -120, "Centro de mediación", sub="y arbitraje"))
    R.append(rotulo(180, 236, 16, -150, -40, "Jaguar Center"))
    R.append(rotulo(100, 150, 8, -90, -70, "Bodega", sub="Warehouse"))
    R.append(rotulo(90, 75, 13, -50, -70, "Área de contenedores"))
    R.append(rotulo(447, 515, 18, -170, 60, "Comedor", sub="Lunch area"))
    R.append(rotulo(460, 590, 22, -120, 90, "Clínica odontológica", sub="Dental clinic"))
    R.append(rotulo(757, 257, 14, 120, -30, "Baño"))
    return capas


def rosa(cx, cy, r=46):
    """Rosa de los vientos sobre el suelo: N apunta al norte del plano (proyectado)."""
    def dirp(dx, dy):
        a, b = P(0, 0), P(dx, dy)
        l = math.hypot(b[0] - a[0], b[1] - a[1])
        return ((b[0] - a[0]) / l, (b[1] - a[1]) / l)
    g = [f'<ellipse cx="{cx}" cy="{cy}" rx="{r + 14}" ry="{(r + 14) * 0.62:.1f}" fill="{BLANCO}" opacity=".85" stroke="{AZUL}" stroke-width="2"/>']
    for (dx, dy), letra, col in [((0, -1), "N", ROJO), ((1, 0), "E", AZUL), ((0, 1), "S", AZUL), ((-1, 0), "O", AZUL)]:
        ux, uy = dirp(dx, dy)
        tx, ty = cx + ux * r, cy + uy * r * 0.62 / 0.62
        px, py = -uy, ux
        g.append(f'<polygon points="{cx + px * 7:.1f},{cy + py * 7:.1f} {cx + ux * (r - 12):.1f},{cy + uy * (r - 12):.1f} {cx - px * 7:.1f},{cy - py * 7:.1f}" fill="{col}"/>')
        g.append(f'<text x="{tx:.1f}" y="{ty:.1f}" font-size="17" font-weight="900" fill="{col}" text-anchor="middle" dominant-baseline="central">{letra}</text>')
    g.append(f'<circle cx="{cx}" cy="{cy}" r="5" fill="{BLANCO}" stroke="{AZUL}" stroke-width="2"/>')
    return "".join(g)


def documento():
    W, H = 1600, 1060
    encajar(150, 150, 1450, 900)
    c = construir()
    defs = f'''<defs>
  <linearGradient id="cielo" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e9f4ff"/><stop offset="1" stop-color="#cfe5ff"/></linearGradient>
  <linearGradient id="cesped" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d9efcf"/><stop offset="1" stop-color="#bfe3b0"/></linearGradient>
  <linearGradient id="franja" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#0066dd"/><stop offset=".5" stop-color="{AZUL}"/><stop offset="1" stop-color="#38b6ff"/></linearGradient>
  <filter id="sombra" x="-10%" y="-10%" width="120%" height="130%"><feDropShadow dx="0" dy="10" stdDeviation="12" flood-color="#003c82" flood-opacity=".22"/></filter>
</defs>'''
    cabecera = f'''<rect width="{W}" height="92" fill="url(#franja)"/>
<text x="40" y="46" font-size="40" font-weight="900" fill="{BLANCO}" dominant-baseline="central">Campus UAM</text>
<text x="330" y="48" font-size="20" font-weight="700" fill="{BLANCO}" opacity=".9" dominant-baseline="central">Mapa 3D · rutas de evacuación Off-Grid</text>
<text x="{W - 40}" y="46" font-size="30" font-weight="900" fill="{BLANCO}" text-anchor="end" dominant-baseline="central" letter-spacing="1">UNEXUAM</text>'''
    leyenda_items = [("#f7fbff", AZUL_OSC, "Edificio (letra)"), ("#fff1f1", ROJO, "Evento (edificio G)"),
                     ("#cfd6df", "#b5bfcb", "Parqueo"), ("#dfe4ea", "#c4ccd6", "Calle"),
                     ("#43b45c", "#2f9e48", "Canchas"), (AMARILLO, "#8f7200", "Entrada principal")]
    ley = [f'<g transform="translate(40,{H - 64})"><rect x="0" y="0" width="{W - 80}" height="44" rx="22" fill="{BLANCO}" stroke="{AZUL}" stroke-width="2.5"/>']
    x = 28
    for relleno, borde, txt in leyenda_items:
        ley.append(f'<rect x="{x}" y="13" width="18" height="18" rx="5" fill="{relleno}" stroke="{borde}" stroke-width="2"/>'
                   f'<text x="{x + 26}" y="23" font-size="15" font-weight="700" fill="{AZUL}" dominant-baseline="central">{txt}</text>')
        x += 26 + len(txt) * 9.2 + 34
    ley.append(f'<text x="{W - 110}" y="23" font-size="13" font-weight="600" fill="{AZUL}" opacity=".75" text-anchor="end" dominant-baseline="central">Ilustración basada en el mapa oficial del campus</text></g>')

    cuerpo = "\n".join([
        f'<g filter="url(#sombra)">{"".join(c["suelo"])}</g>',
        "".join(c["planos"]),
        "".join(c["lineas"]),
        "".join(c["objetos"]),
        rosa(1490, 190),
        "".join(c["rotulos"]),
    ])
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" font-family="{FUENTE}">
{defs}
<rect width="{W}" height="{H}" fill="url(#cielo)"/>
{cabecera}
<g>
{cuerpo}
</g>
{"".join(ley)}
</svg>'''
    (AQUI / "mapa-campus-3d.svg").write_text(svg, encoding="utf-8")
    html = f'''<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Mapa 3D del campus UAM · Unexuam</title>
<style>html,body{{margin:0;background:#cfe5ff}}img{{display:block;width:{W}px;height:{H}px}}</style></head>
<body><img src="mapa-campus-3d.svg" alt="Mapa 3D del campus UAM"></body></html>'''
    (AQUI / "mapa-campus-3d.html").write_text(html, encoding="utf-8")
    print("SVG y HTML generados en", AQUI)


if __name__ == "__main__":
    documento()
