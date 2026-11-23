# Datos de ejemplo: el campus (capa 2) y la red de telefonos (capa 1).
# Solo se usan los metodos del Graph del profe.

from backend.grafo import Graph


def crearCampus():
    campus = Graph()

    lugares = [
        "Aula 101", "Aula 102", "Aula 201", "Aula 202", "Biblioteca", "Cafetería",
        "Pasillo A", "Pasillo B", "Escalera Norte", "Escalera Sur",
        "Salida Principal", "Salida Este", "Zona Segura Cancha", "Zona Segura Parqueo",
    ]
    for lugar in lugares:
        campus.insertarVertice(lugar)

    # (origen, destino, segundos). El grafo es dirigido: cada sentido es una arista.
    pasos = [
        ("Aula 101", "Pasillo A", 10), ("Pasillo A", "Aula 101", 10),
        ("Aula 102", "Pasillo A", 12), ("Pasillo A", "Aula 102", 12),
        ("Cafetería", "Pasillo A", 15), ("Pasillo A", "Cafetería", 15),
        ("Aula 201", "Pasillo B", 10), ("Pasillo B", "Aula 201", 10),
        ("Aula 202", "Pasillo B", 14), ("Pasillo B", "Aula 202", 14),
        ("Biblioteca", "Pasillo B", 18), ("Pasillo B", "Biblioteca", 18),
        ("Pasillo B", "Escalera Norte", 8), ("Escalera Norte", "Pasillo B", 8),
        ("Pasillo B", "Escalera Sur", 20), ("Escalera Sur", "Pasillo B", 20),
        ("Escalera Norte", "Pasillo A", 15),    # bajar es mas rapido...
        ("Pasillo A", "Escalera Norte", 25),    # ...que subir
        ("Escalera Sur", "Salida Este", 22), ("Salida Este", "Escalera Sur", 30),
        ("Pasillo A", "Salida Principal", 12), ("Salida Principal", "Pasillo A", 12),
        ("Pasillo A", "Salida Este", 40), ("Salida Este", "Pasillo A", 40),
        # Hacia las zonas seguras solo se va (no se vuelve).
        ("Salida Principal", "Zona Segura Cancha", 20),
        ("Salida Este", "Zona Segura Parqueo", 25),
        ("Salida Principal", "Zona Segura Parqueo", 60),
    ]
    for paso in pasos:
        campus.insertarArista(paso[0], paso[1], paso[2])

    zonasSeguras = ["Zona Segura Cancha", "Zona Segura Parqueo"]
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
