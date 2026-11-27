

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


# Edificios cerrados: una ruta puede salir de ellos, pero no atravesarlos para ir a otro lugar
# (su vértice es el centro del edificio, no un pasillo). El Edificio E no está: el pasillo elevado
# del 2.o piso del B entra al E y se sale por él. El M tampoco: su vestíbulo de planta baja
# se atraviesa de la puerta oeste a la este (James, 26/11/2026). Los comedores, kioskos y el Food Court son abiertos.
EDIFICIOS_SIN_PASO = frozenset({
    "Salón de Contenedores", "Salón Multiusos", "Salón de Danza", "Salón de Música", "Vestidores",
    "Jaguar Center", "Edificio I", "Edificio F", "Auditorio Central", "Banco Banpro",
    "Edificio A", "Laboratorios", "Edificio D", "Edificio J", "El Ranchito", "Clínicas Odontológicas",
    "Edificio O", "Baño del Comedor",
})


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
        "Laboratorios", "Edificio D", "Edificio J", "Kioskos del Chilamate", "El Ranchito",
        "Clínicas Odontológicas", "El Chilamate", "Edificio O", "Comedor del Jaguarcito",
        "Baño del Comedor", "Kiosko del Jaguarcito", "Pasarela Edificio B",
        "Pasarela B Oeste", "Pasarela B Este",
    ]
    zonasSeguras = [
        "Zona Segura Cancha de Fútbol", "Zona Segura Campo de Béisbol", "Zona Segura Canchas de Vóley",
        "Punto Seguro Parqueo Norte", "Punto Seguro Parqueo 47 Calle",
        "Punto Seguro Parqueo 20 Av", "Punto Seguro Plazoleta",
        "Punto Seguro Parqueo Este", "Punto Seguro Parqueo Central",
        "Punto Seguro Parqueo Sur", "Punto Seguro Parqueo Oeste",
        "Punto Seguro Parqueo Edificio P", "Punto Seguro Parqueo Suroeste",
    ]
    for lugar in lugares + zonasSeguras:
        campus.insertarVertice(lugar)

    # En el B, el C y el P los pasillos de los 3 pisos se caminan, pero para salir hay que bajar a la
    # planta baja (James, 26/11/2026). Las únicas excepciones son el paso central B/C (más abajo) y
    # el pasillo elevado del 2.o piso: del pabellón oeste del B al Edificio E.
    unirDosSentidos(campus, "B Pabellón Oeste P2", "Edificio E", 15)

    # Pasarela frente al Edificio B: corredor techado en planta baja, pegado al frente (lado norte)
    # del B, de 113 m, desde el parqueo junto al Auditorio (extremo oeste) hasta la entrada de la vía
    # Universidad UAM (extremo este). No es elevada (confirmado por James, 26/11/2026): da directo a
    # la plaza norte, que es parte de la Plazoleta. Se modela con sus dos
    # extremos y el punto medio para que cada camino siga la pasarela y no atraviese edificios
    # (verificado con docs/mapa-campus/verificar_caminos.py sobre el plano de OpenStreetMap).
    # Salida central del B en la planta baja (entre B-105 y B-106): da al norte, a la pasarela.
    campus.insertarVertice("B Salida Central")
    unirDosSentidos(campus, "B Pabellón Este P1", "B Salida Central", 9)
    unirDosSentidos(campus, "B Pabellón Oeste P1", "B Salida Central", 9)
    unirDosSentidos(campus, "B Salida Central", "Pasarela Edificio B", 4)
    unirDosSentidos(campus, "Pasarela Edificio B", "Pasarela B Oeste", 49)    # 57 m por la pasarela
    unirDosSentidos(campus, "Pasarela Edificio B", "Pasarela B Este", 44)     # 51 m por la pasarela
    unirDosSentidos(campus, "Pasarela B Oeste", "Auditorio Central", 16)
    unirDosSentidos(campus, "Pasarela B Oeste", "B Salida Oeste", 22)
    unirDosSentidos(campus, "Pasarela B Oeste", "Punto Seguro Parqueo 20 Av", 3)
    unirDosSentidos(campus, "Pasarela B Oeste", "Edificio M", 41)
    unirDosSentidos(campus, "Pasarela B Este", "Food Court", 30)
    unirDosSentidos(campus, "Pasarela B Este", "Edificio A", 17)          # el A está pegado al B: se sale por su lado norte
    unirDosSentidos(campus, "Pasarela B Este", "Banco Banpro", 22)
    unirDosSentidos(campus, "Pasarela B Este", "Punto Seguro Parqueo Este", 18)
    unirDosSentidos(campus, "Pasarela Edificio B", "Punto Seguro Plazoleta", 3)   # mismo nivel

    # Unión central entre los edificios B y C (después de B-205):
    # escalera en el centro que une planta baja, el 2.º piso de B y C, y sube al centro del 3.er piso de C.
    # En el 2.º piso, después de B-205, un pasillo cruza al pasillo del C justo en el centro.
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
    unirDosSentidos(campus, "B Escalera Central P1", "B Salida Central", 5)   # y de ahí 3 s a la pasarela

    # Caminos a pie entre lugares vecinos (calculados con docs/mapa-campus/generar_grafo.py y
    # depurados con docs/mapa-campus/verificar_caminos.py: ninguno atraviesa un edificio cerrado).
    # (lugar, lugar, segundos): cada camino se recorre en los dos sentidos.
    caminos = [
        ("Auditorio Central", "B Salida Oeste", 20),
        ("Auditorio Central", "Edificio E", 33),
        ("Auditorio Central", "Edificio F", 20),
        ("Auditorio Central", "Edificio M", 40),
        ("Auditorio Central", "Punto Seguro Parqueo 20 Av", 11),
        ("B Salida Este", "C Salida Este", 17),
        ("B Salida Este", "Edificio A", 7),
        ("B Salida Este", "Food Court", 28),
        ("B Salida Oeste", "C Salida Oeste", 19),
        ("B Salida Oeste", "Edificio M", 19),
        ("Banco Banpro", "Edificio A", 39),
        ("Banco Banpro", "Food Court", 32),
        ("Banco Banpro", "Punto Seguro Parqueo Este", 11),
        ("Baño del Comedor", "Comedor del Jaguarcito", 28),
        ("Baño del Comedor", "Zona Segura Cancha de Fútbol", 31),
        ("C Salida Este", "Edificio A", 10),
        ("C Salida Este", "Kioskos del Chilamate", 28),
        ("C Salida Oeste", "Edificio M", 23),
        ("C Salida Oeste", "Laboratorios", 30),
        ("C Salida Oeste", "Punto Seguro Parqueo Central", 23),
        ("Clínicas Odontológicas", "Edificio D", 26),
        ("Clínicas Odontológicas", "El Ranchito", 31),
        ("Clínicas Odontológicas", "Punto Seguro Parqueo Sur", 24),
        ("Comedor del Jaguarcito", "Kiosko del Jaguarcito", 77),
        ("Comedor del Jaguarcito", "Zona Segura Cancha de Fútbol", 23),
        ("Edificio A", "Food Court", 46),
        ("Edificio A", "Punto Seguro Parqueo Este", 24),
        ("Edificio D", "Edificio J", 23),
        ("Edificio D", "El Chilamate", 39),
        ("Edificio D", "Punto Seguro Parqueo Central", 19),
        ("Edificio E", "Edificio F", 18),
        ("Edificio E", "Punto Seguro Parqueo 47 Calle", 57),
        ("Edificio E", "Punto Seguro Parqueo Norte", 15),
        ("Edificio E", "Punto Seguro Plazoleta", 8),
        ("Edificio F", "Punto Seguro Parqueo 20 Av", 12),
        ("Edificio I", "Jaguar Center", 74),
        ("Edificio I", "Punto Seguro Parqueo 20 Av", 20),
        ("Edificio J", "El Chilamate", 37),
        ("Edificio J", "Kioskos del Chilamate", 23),
        ("Edificio J", "Punto Seguro Parqueo Central", 27),
        ("Edificio M", "Laboratorios", 24),
        ("Edificio O", "El Ranchito", 38),
        ("Edificio O", "P Salida Oeste", 33),
        ("Edificio O", "Punto Seguro Parqueo Oeste", 17),
        ("El Chilamate", "Kioskos del Chilamate", 42),
        ("El Chilamate", "P Salida Este", 50),
        ("El Ranchito", "Laboratorios", 49),
        ("Food Court", "Punto Seguro Parqueo Norte", 22),
        ("Food Court", "Punto Seguro Plazoleta", 13),
        ("Jaguar Center", "Salón de Danza", 32),
        ("Jaguar Center", "Salón de Música", 27),
        ("Jaguar Center", "Vestidores", 47),
        ("Kiosko del Jaguarcito", "Laboratorios", 51),
        ("Kiosko del Jaguarcito", "Zona Segura Cancha de Fútbol", 36),
        ("P Salida Este", "Punto Seguro Parqueo Edificio P", 7),
        ("P Salida Este", "Punto Seguro Parqueo Sur", 12),
        ("P Salida Oeste", "Punto Seguro Parqueo Edificio P", 27),
        ("P Salida Oeste", "Punto Seguro Parqueo Oeste", 26),
        ("P Salida Oeste", "Punto Seguro Parqueo Sur", 14),
        ("Punto Seguro Parqueo 20 Av", "Punto Seguro Parqueo 47 Calle", 11),
        ("Punto Seguro Parqueo 47 Calle", "Punto Seguro Parqueo Norte", 12),
        ("Punto Seguro Parqueo Norte", "Punto Seguro Plazoleta", 6),
        ("Punto Seguro Parqueo Oeste", "Zona Segura Campo de Béisbol", 29),
        ("Punto Seguro Parqueo Suroeste", "Zona Segura Campo de Béisbol", 3),
        ("Salón Multiusos", "Salón de Contenedores", 28),
        ("Salón Multiusos", "Salón de Danza", 24),
        ("Salón Multiusos", "Vestidores", 35),
        ("Salón de Danza", "Salón de Música", 7),
        ("Salón de Danza", "Vestidores", 32),
        ("Salón de Música", "Vestidores", 34),
        ("Vestidores", "Zona Segura Cancha de Fútbol", 19),
        # Vecinos a la vista sin edificios de por medio (agregados con verificar_caminos.py, 25/11/2026)
        ("Auditorio Central", "C Salida Oeste", 37),
        ("C Salida Este", "Edificio D", 43),
        ("C Salida Este", "Edificio J", 34),
        ("C Salida Este", "Punto Seguro Parqueo Central", 25),
        ("Clínicas Odontológicas", "Edificio J", 40),
        ("Clínicas Odontológicas", "Punto Seguro Parqueo Central", 35),
        ("Edificio A", "Kioskos del Chilamate", 41),
        # Canchas de vóley (zona segura, confirmada por James 26/11/2026): de los salones y el Jaguar
        ("Salón de Contenedores", "Zona Segura Canchas de Vóley", 26),
        ("Salón Multiusos", "Zona Segura Canchas de Vóley", 7),
        ("Salón de Danza", "Zona Segura Canchas de Vóley", 13),
        ("Salón de Música", "Zona Segura Canchas de Vóley", 19),
        ("Vestidores", "Zona Segura Canchas de Vóley", 11),
        ("Jaguar Center", "Zona Segura Canchas de Vóley", 36),
        ("Zona Segura Canchas de Vóley", "Zona Segura Cancha de Fútbol", 12),
        # Salidas directas de cada lugar a sus 3 zonas seguras más cercanas, por el recorrido real a pie
        # (verificar_caminos.py): así ninguna ruta tiene que pasar por dentro de otro edificio. Desde la
        # pasarela (un piso arriba de la Plazoleta) no hay salidas directas: se baja por su escalera o sus extremos.
        ("Auditorio Central", "Punto Seguro Plazoleta", 30),
        ("Auditorio Central", "Zona Segura Cancha de Fútbol", 60),
        ("Banco Banpro", "Punto Seguro Parqueo Norte", 34),
        ("Banco Banpro", "Punto Seguro Plazoleta", 44),
        ("Baño del Comedor", "Zona Segura Campo de Béisbol", 23),
        ("Baño del Comedor", "Punto Seguro Parqueo Oeste", 85),
        ("Clínicas Odontológicas", "Punto Seguro Parqueo Oeste", 79),
        ("Comedor del Jaguarcito", "Zona Segura Campo de Béisbol", 19),
        ("Comedor del Jaguarcito", "Punto Seguro Parqueo Oeste", 68),
        ("Edificio A", "Punto Seguro Parqueo Central", 47),
        ("Edificio A", "Punto Seguro Plazoleta", 46),
        ("Edificio D", "Punto Seguro Parqueo Sur", 41),
        ("Edificio D", "Punto Seguro Parqueo Este", 61),
        ("Edificio E", "Punto Seguro Parqueo 20 Av", 20),
        ("Edificio F", "Punto Seguro Plazoleta", 55),
        ("Edificio F", "Zona Segura Cancha de Fútbol", 72),
        ("Edificio I", "Punto Seguro Parqueo 47 Calle", 32),
        ("Edificio I", "Zona Segura Cancha de Fútbol", 59),
        ("Edificio J", "Punto Seguro Parqueo Sur", 38),
        ("Edificio J", "Punto Seguro Parqueo Este", 44),
        ("Edificio M", "Punto Seguro Parqueo 20 Av", 30),
        ("Edificio M", "Zona Segura Cancha de Fútbol", 33),
        ("Edificio M", "Punto Seguro Parqueo Central", 45),
        ("Edificio O", "Punto Seguro Parqueo Sur", 16),
        ("Edificio O", "Zona Segura Campo de Béisbol", 69),
        ("El Chilamate", "Punto Seguro Parqueo Sur", 20),
        ("El Chilamate", "Punto Seguro Parqueo Este", 51),
        ("El Chilamate", "Punto Seguro Parqueo Edificio P", 56),
        ("El Ranchito", "Punto Seguro Parqueo Sur", 23),
        ("El Ranchito", "Punto Seguro Parqueo Central", 44),
        ("El Ranchito", "Punto Seguro Parqueo Oeste", 43),
        ("Food Court", "Punto Seguro Parqueo Este", 39),
        ("Jaguar Center", "Zona Segura Cancha de Fútbol", 47),
        ("Jaguar Center", "Punto Seguro Parqueo 20 Av", 64),
        ("Jaguar Center", "Punto Seguro Parqueo 47 Calle", 88),
        ("Kiosko del Jaguarcito", "Punto Seguro Parqueo Oeste", 24),
        ("Kiosko del Jaguarcito", "Zona Segura Campo de Béisbol", 38),
        ("Kioskos del Chilamate", "Punto Seguro Parqueo Este", 24),
        ("Kioskos del Chilamate", "Punto Seguro Parqueo Central", 30),
        ("Kioskos del Chilamate", "Punto Seguro Parqueo Sur", 43),
        ("Laboratorios", "Zona Segura Cancha de Fútbol", 28),
        ("Laboratorios", "Punto Seguro Parqueo 20 Av", 35),
        ("Laboratorios", "Punto Seguro Parqueo Oeste", 50),
        ("Salón Multiusos", "Zona Segura Cancha de Fútbol", 68),
        ("Salón Multiusos", "Punto Seguro Parqueo 47 Calle", 102),
        ("Salón Multiusos", "Punto Seguro Parqueo 20 Av", 112),
        ("Salón de Contenedores", "Zona Segura Cancha de Fútbol", 73),
        ("Salón de Contenedores", "Punto Seguro Parqueo 47 Calle", 104),
        ("Salón de Contenedores", "Punto Seguro Parqueo 20 Av", 115),
        ("Salón de Danza", "Zona Segura Cancha de Fútbol", 42),
        ("Salón de Danza", "Punto Seguro Parqueo 47 Calle", 99),
        ("Salón de Danza", "Punto Seguro Parqueo 20 Av", 91),
        ("Salón de Música", "Zona Segura Cancha de Fútbol", 43),
        ("Salón de Música", "Punto Seguro Parqueo 47 Calle", 97),
        ("Salón de Música", "Punto Seguro Parqueo 20 Av", 90),
        ("Vestidores", "Punto Seguro Parqueo 20 Av", 82),
        ("Vestidores", "Zona Segura Campo de Béisbol", 220),
        ("B Salida Este", "Punto Seguro Parqueo Este", 36),
        ("B Salida Este", "Punto Seguro Plazoleta", 34),
        ("B Salida Este", "Punto Seguro Parqueo Central", 50),
        ("B Salida Central", "Punto Seguro Plazoleta", 3),   # planta baja: plaza norte del B
        ("B Salida Central", "Punto Seguro Parqueo Central", 25),   # paso central B/C
        ("B Salida Oeste", "Punto Seguro Plazoleta", 24),
        ("B Salida Oeste", "Punto Seguro Parqueo 20 Av", 24),
        ("B Salida Oeste", "Punto Seguro Parqueo Central", 41),
        ("C Salida Este", "Punto Seguro Parqueo Este", 41),
        ("C Salida Este", "Punto Seguro Plazoleta", 50),
        ("C Salida Oeste", "Punto Seguro Parqueo 20 Av", 41),
        ("C Salida Oeste", "Punto Seguro Plazoleta", 43),
        ("P Salida Este", "Punto Seguro Parqueo Este", 100),
        ("Pasarela B Oeste", "Punto Seguro Plazoleta", 32),
        ("Pasarela B Oeste", "Zona Segura Cancha de Fútbol", 49),
        ("Pasarela B Este", "Punto Seguro Plazoleta", 42),
        ("Pasarela B Este", "Punto Seguro Parqueo Norte", 44),
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


def ubicacionesTelefonos():
    # Lugar del campus donde esta cada telefono de ejemplo. Sirve para enlazar
    # los telefonos de los usuarios que inician sesion con los que tienen cerca.
    return {
        "Tel-Ana": "Edificio E",
        "Tel-Luis": "Punto Seguro Plazoleta",
        "Tel-Sofía": "Food Court",
        "Tel-Carlos": "B Salida Oeste",
        "Tel-María": "Edificio A",
        "Tel-Pedro": "C Salida Este",
        "Tel-Valeria": "Edificio D",
        "Tel-Diego": "Punto Seguro Parqueo Sur",
    }
