

from backend.grafo import Graph


# ---------------------------------------------------------------------------
# Capa 2: el campus real de la UAM (ver docs/mapa-campus/).
#
# - Los edificios B, C y P se modelan por dentro, aula por aula. El primer numero
#   del aula es el piso y se numera de ESTE a OESTE:
#       B: 101-109 y 201-210
#       C: 101-109, 201-210 y 301-310
#       P: 101-109, 201-209 y 301-309
#   Cada piso se divide en dos pabellones (mitad este y mitad oeste). A un aula
#   solo se llega desde el pabellon de su mitad, nunca desde otra aula. Los dos
#   pabellones del piso se unen entre si. En cada extremo (este y oeste) hay una
#   escalera que sale de ese pabellon, y en la planta baja las escaleras llevan a
#   la salida este y a la salida oeste del edificio.
# - Las escaleras son aristas DIRIGIDAS con distinto peso: bajar es mas rapido
#   que subir. Por eso el grafo tiene que ser dirigido.
# - Los demas lugares (edificios sin aulas en la demo, zonas y puntos seguros) son
#   un solo vertice cada uno, unidos por caminos a pie.
# - Peso = segundos caminando (distancia del mapa x 1.3 / 1.2 m/s).
# ---------------------------------------------------------------------------

PABELLON_A_ESCALERA = 6   # del pabellon a la escalera de su extremo
BAJAR_UN_PISO = 12        # escalera hacia abajo
SUBIR_UN_PISO = 18        # escalera hacia arriba (mas lento)
ESCALERA_A_SALIDA = 5     # de la escalera de planta baja a la salida


def nombreAula(letra, piso, numero):
    # ("B", 2, 7) -> "B-207"
    if numero < 10:
        return letra + "-" + str(piso) + "0" + str(numero)
    return letra + "-" + str(piso) + str(numero)


def unirDosSentidos(campus, a, b, segundos):
    # Un pasillo o camino se puede recorrer en los dos sentidos: dos aristas.
    campus.insertarArista(a, b, segundos)
    campus.insertarArista(b, a, segundos)


def agregarEdificioConAulas(campus, letra, aulasPorPiso, segundosEntreAulas):
    # aulasPorPiso = [9, 10] significa: piso 1 con 101..109 y piso 2 con 201..210.
    totalPisos = len(aulasPorPiso)

    # 1. Vertices: aulas, pabellones y escaleras de cada piso, y las dos salidas.
    for piso in range(1, totalPisos + 1):
        campus.insertarVertice(letra + " Pabellón Este P" + str(piso))
        campus.insertarVertice(letra + " Pabellón Oeste P" + str(piso))
        campus.insertarVertice(letra + " Escalera Este P" + str(piso))
        campus.insertarVertice(letra + " Escalera Oeste P" + str(piso))
        for numero in range(1, aulasPorPiso[piso - 1] + 1):
            campus.insertarVertice(nombreAula(letra, piso, numero))
    campus.insertarVertice(letra + " Salida Este")
    campus.insertarVertice(letra + " Salida Oeste")

    # 2. Aristas de cada piso.
    for piso in range(1, totalPisos + 1):
        cantidad = aulasPorPiso[piso - 1]
        mitad = (cantidad + 1) // 2          # 9 aulas -> 01..05 este, 06..09 oeste
        pabellonEste = letra + " Pabellón Este P" + str(piso)
        pabellonOeste = letra + " Pabellón Oeste P" + str(piso)
        # Cada aula solo con el pabellon de su mitad (la 01 es la del extremo este).
        for numero in range(1, cantidad + 1):
            if numero <= mitad:
                pabellon = pabellonEste
            else:
                pabellon = pabellonOeste
            unirDosSentidos(campus, nombreAula(letra, piso, numero), pabellon, segundosEntreAulas)
        # Los dos pabellones del piso: medio pasillo de distancia.
        unirDosSentidos(campus, pabellonEste, pabellonOeste, mitad * segundosEntreAulas)
        escaleraEste = letra + " Escalera Este P" + str(piso)
        escaleraOeste = letra + " Escalera Oeste P" + str(piso)
        unirDosSentidos(campus, pabellonEste, escaleraEste, PABELLON_A_ESCALERA)
        unirDosSentidos(campus, pabellonOeste, escaleraOeste, PABELLON_A_ESCALERA)
        # Escaleras al piso de abajo: bajar y subir cuestan distinto (grafo dirigido).
        if piso > 1:
            for lado in ["Este", "Oeste"]:
                arriba = letra + " Escalera " + lado + " P" + str(piso)
                abajo = letra + " Escalera " + lado + " P" + str(piso - 1)
                campus.insertarArista(arriba, abajo, BAJAR_UN_PISO)
                campus.insertarArista(abajo, arriba, SUBIR_UN_PISO)

    # 3. Planta baja: las escaleras del piso 1 llevan a las salidas.
    unirDosSentidos(campus, letra + " Escalera Este P1", letra + " Salida Este", ESCALERA_A_SALIDA)
    unirDosSentidos(campus, letra + " Escalera Oeste P1", letra + " Salida Oeste", ESCALERA_A_SALIDA)


def crearCampus():
    campus = Graph()

    # Edificios con aulas (los de la demo).
    agregarEdificioConAulas(campus, "B", [9, 10], 8)
    agregarEdificioConAulas(campus, "C", [9, 10, 10], 8)
    agregarEdificioConAulas(campus, "P", [9, 9, 9], 10)

    # Resto de lugares: un vertice por lugar.
    lugares = [
        "Salón de Contenedores", "Salón Multiusos", "Salón de Danza", "Salón de Música",
        "Vestidores", "Jaguar Center", "Edificio I", "Edificio E", "Edificio F",
        "Auditorio Central", "Edificio M", "Food Court", "Banco Banpro", "Edificio A",
        "Laboratorios", "Edificio D", "Edificio J", "Kioskos de comida", "El Ranchero",
        "Clínicas Odontológicas", "El Chilamate", "Edificio O", "Comedor del Jaguarcito",
        "Baño del Comedor", "Kiosko del Jaguarcito", "Pasarela Edificio B",
    ]
    zonasSeguras = [
        "Zona Segura Cancha de Fútbol", "Zona Segura Campo de Béisbol",
        "Punto Seguro Parqueo Norte", "Punto Seguro Parqueo 47 Calle",
        "Punto Seguro Parqueo 20 Av", "Punto Seguro Plazoleta",
        "Punto Seguro Parqueo Este", "Punto Seguro Parqueo Central",
        "Punto Seguro Parqueo Sur", "Punto Seguro Parqueo Oeste",
        "Punto Seguro Parqueo Edificio P", "Punto Seguro Parqueo Suroeste",
    ]
    for lugar in lugares + zonasSeguras:
        campus.insertarVertice(lugar)

    # Pasillo elevado del 2.o piso: del pabellon oeste del B al Edificio E.
    unirDosSentidos(campus, "B Pabellón Oeste P2", "Edificio E", 15)

    # Pasarela frente al Edificio B (desde la entrada de la carretera hasta el parqueo
    # al lado del Auditorio) y escalera en medio que baja a la Plazoleta.
    unirDosSentidos(campus, "B Pabellón Este P1", "Pasarela Edificio B", 12)
    unirDosSentidos(campus, "B Pabellón Oeste P1", "Pasarela Edificio B", 12)
    unirDosSentidos(campus, "Pasarela Edificio B", "B Salida Este", 18)
    unirDosSentidos(campus, "Pasarela Edificio B", "B Salida Oeste", 18)
    unirDosSentidos(campus, "Pasarela Edificio B", "Punto Seguro Parqueo Este", 45)
    unirDosSentidos(campus, "Pasarela Edificio B", "Auditorio Central", 26)
    unirDosSentidos(campus, "Pasarela Edificio B", "Punto Seguro Parqueo 20 Av", 42)
    campus.insertarArista("Pasarela Edificio B", "Punto Seguro Plazoleta", BAJAR_UN_PISO)
    campus.insertarArista("Punto Seguro Plazoleta", "Pasarela Edificio B", SUBIR_UN_PISO)

    # Unión central entre los edificios B y C (después de B-205):
    # escalera en el centro que une planta baja, el 2.º piso de B y C, y sube al centro del 3.er piso de C.
    campus.insertarVertice("C Escalera Central P3")
    campus.insertarVertice("B Escalera Central P2")
    campus.insertarVertice("B Escalera Central P1")
    unirDosSentidos(campus, "C Pabellón Este P3", "C Escalera Central P3", PABELLON_A_ESCALERA)
    unirDosSentidos(campus, "C Pabellón Oeste P3", "C Escalera Central P3", PABELLON_A_ESCALERA)
    campus.insertarArista("C Escalera Central P3", "B Escalera Central P2", BAJAR_UN_PISO)
    campus.insertarArista("B Escalera Central P2", "C Escalera Central P3", SUBIR_UN_PISO)
    unirDosSentidos(campus, "B Pabellón Este P2", "B Escalera Central P2", PABELLON_A_ESCALERA)
    unirDosSentidos(campus, "B Pabellón Oeste P2", "B Escalera Central P2", PABELLON_A_ESCALERA)
    unirDosSentidos(campus, "B Escalera Central P2", "C Pabellón Este P2", PABELLON_A_ESCALERA)
    unirDosSentidos(campus, "B Escalera Central P2", "C Pabellón Oeste P2", PABELLON_A_ESCALERA)
    campus.insertarArista("B Escalera Central P2", "B Escalera Central P1", BAJAR_UN_PISO)
    campus.insertarArista("B Escalera Central P1", "B Escalera Central P2", SUBIR_UN_PISO)
    unirDosSentidos(campus, "B Escalera Central P1", "B Pabellón Este P1", PABELLON_A_ESCALERA)
    unirDosSentidos(campus, "B Escalera Central P1", "B Pabellón Oeste P1", PABELLON_A_ESCALERA)
    unirDosSentidos(campus, "B Escalera Central P1", "C Pabellón Este P1", PABELLON_A_ESCALERA)
    unirDosSentidos(campus, "B Escalera Central P1", "C Pabellón Oeste P1", PABELLON_A_ESCALERA)
    unirDosSentidos(campus, "B Escalera Central P1", "Pasarela Edificio B", 8)

    # Caminos a pie entre lugares vecinos (calculados con docs/mapa-campus/generar_grafo.py).
    # (lugar, lugar, segundos): cada camino se recorre en los dos sentidos.
    caminos = [
        ("Auditorio Central", "B Salida Oeste", 25),
        ("Auditorio Central", "Edificio E", 35),
        ("Auditorio Central", "Edificio F", 26),
        ("Auditorio Central", "Edificio M", 33),
        ("Auditorio Central", "Punto Seguro Parqueo 20 Av", 45),
        ("B Salida Este", "Banco Banpro", 45),
        ("B Salida Este", "C Salida Este", 19),
        ("B Salida Este", "Edificio A", 10),
        ("B Salida Este", "Food Court", 32),
        ("B Salida Este", "Punto Seguro Parqueo Este", 77),
        ("B Salida Oeste", "C Salida Oeste", 20),
        ("B Salida Oeste", "Edificio M", 22),
        ("B Salida Oeste", "Laboratorios", 43),
        ("B Salida Oeste", "Punto Seguro Plazoleta", 49),
        ("Banco Banpro", "Edificio A", 47),
        ("Banco Banpro", "Food Court", 41),
        ("Banco Banpro", "Punto Seguro Parqueo Este", 56),
        ("Baño del Comedor", "Comedor del Jaguarcito", 35),
        ("Baño del Comedor", "Zona Segura Cancha de Fútbol", 75),
        ("C Salida Este", "Edificio A", 13),
        ("C Salida Este", "Kioskos de comida", 31),
        ("C Salida Oeste", "Edificio M", 25),
        ("C Salida Oeste", "Laboratorios", 34),
        ("C Salida Oeste", "Punto Seguro Parqueo Central", 39),
        ("Clínicas Odontológicas", "Edificio D", 27),
        ("Clínicas Odontológicas", "El Ranchero", 36),
        ("Clínicas Odontológicas", "Punto Seguro Parqueo Sur", 31),
        ("Comedor del Jaguarcito", "Kiosko del Jaguarcito", 57),
        ("Comedor del Jaguarcito", "Zona Segura Cancha de Fútbol", 55),
        ("Edificio A", "Food Court", 41),
        ("Edificio A", "Punto Seguro Parqueo Este", 71),
        ("Edificio D", "Edificio J", 17),
        ("Edificio D", "El Chilamate", 50),
        ("Edificio D", "Kioskos de comida", 37),
        ("Edificio D", "Punto Seguro Parqueo Central", 31),
        ("Edificio D", "Punto Seguro Parqueo Sur", 53),
        ("Edificio E", "Edificio F", 23),
        ("Edificio E", "Punto Seguro Parqueo 20 Av", 44),
        ("Edificio E", "Punto Seguro Parqueo 47 Calle", 77),
        ("Edificio E", "Punto Seguro Parqueo Norte", 58),
        ("Edificio E", "Punto Seguro Plazoleta", 32),
        ("Edificio F", "Punto Seguro Parqueo 20 Av", 24),
        ("Edificio I", "Jaguar Center", 41),
        ("Edificio I", "Punto Seguro Parqueo 20 Av", 47),
        ("Edificio I", "Salón de Música", 65),
        ("Edificio J", "El Chilamate", 37),
        ("Edificio J", "Kioskos de comida", 21),
        ("Edificio J", "Punto Seguro Parqueo Central", 43),
        ("Edificio M", "Laboratorios", 24),
        ("Edificio O", "El Ranchero", 40),
        ("Edificio O", "P Salida Oeste", 35),
        ("Edificio O", "Punto Seguro Parqueo Oeste", 31),
        ("El Chilamate", "Kioskos de comida", 38),
        ("El Chilamate", "P Salida Este", 51),
        ("El Ranchero", "Laboratorios", 46),
        ("El Ranchero", "Punto Seguro Parqueo Oeste", 71),
        ("Food Court", "Punto Seguro Parqueo Norte", 55),
        ("Food Court", "Punto Seguro Plazoleta", 36),
        ("Jaguar Center", "Salón de Danza", 35),
        ("Jaguar Center", "Salón de Música", 26),
        ("Jaguar Center", "Vestidores", 41),
        ("Kiosko del Jaguarcito", "Laboratorios", 59),
        ("Kiosko del Jaguarcito", "Zona Segura Cancha de Fútbol", 60),
        ("P Salida Este", "Punto Seguro Parqueo Edificio P", 41),
        ("P Salida Este", "Punto Seguro Parqueo Sur", 49),
        ("P Salida Oeste", "Punto Seguro Parqueo Edificio P", 66),
        ("P Salida Oeste", "Punto Seguro Parqueo Oeste", 32),
        ("P Salida Oeste", "Punto Seguro Parqueo Sur", 54),
        ("Punto Seguro Parqueo 20 Av", "Punto Seguro Parqueo 47 Calle", 75),
        ("Punto Seguro Parqueo 47 Calle", "Punto Seguro Parqueo Norte", 66),
        ("Punto Seguro Parqueo Edificio P", "Punto Seguro Parqueo Sur", 57),
        ("Punto Seguro Parqueo Norte", "Punto Seguro Plazoleta", 55),
        ("Punto Seguro Parqueo Oeste", "Zona Segura Campo de Béisbol", 81),
        ("Punto Seguro Parqueo Suroeste", "Zona Segura Campo de Béisbol", 77),
        ("Salón Multiusos", "Salón de Contenedores", 17),
        ("Salón Multiusos", "Salón de Danza", 27),
        ("Salón Multiusos", "Salón de Música", 34),
        ("Salón Multiusos", "Vestidores", 39),
        ("Salón de Contenedores", "Salón de Danza", 43),
        ("Salón de Contenedores", "Salón de Música", 50),
        ("Salón de Danza", "Salón de Música", 9),
        ("Salón de Danza", "Vestidores", 19),
        ("Salón de Música", "Vestidores", 23),
        ("Vestidores", "Zona Segura Cancha de Fútbol", 62),
    ]
    for camino in caminos:
        unirDosSentidos(campus, camino[0], camino[1], camino[2])

    return campus, zonasSeguras


def crearRedMesh():
    red = Graph()

    telefonos = ["Tel-Ana", "Tel-Luis", "Tel-Sofía", "Tel-Carlos",
                 "Tel-María", "Tel-Pedro", "Tel-Valeria", "Tel-Diego"]
    for tel in telefonos:
        red.insertarVertice(tel)

    # (origen, destino, retardo en segundos). Algunos enlaces son de un solo sentido.
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
    for enlace in enlaces:
        red.insertarArista(enlace[0], enlace[1], enlace[2])

    return red
