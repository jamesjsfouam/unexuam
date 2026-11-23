# Mensajeria sin internet sobre la red Mesh (capa 1).
#
# - Cada usuario que inicia sesion es un VERTICE de la red Mesh (su telefono).
# - Su telefono se enlaza con los telefonos que estan a su ALCANCE: los que estan
#   a pocos segundos caminando, medidos con Dijkstra sobre el grafo del campus.
#   Asi las dos capas trabajan juntas.
# - Un mensaje viaja por la ruta de menor retardo (Dijkstra sobre la red Mesh).
# - Si no hay camino, el mensaje espera en la cola del telefono emisor (DTN:
#   tolerante a retardos) y sale cuando la red cambia y aparece un camino.

from backend.evacuacion import dijkstra, rutaMasCorta

INF = float("inf")
ALCANCE = 120       # segundos caminando: alcance aproximado de Bluetooth / Wi-Fi Direct


def retardoEnlace(segundosCaminando):
    # Mas lejos = senal mas debil = mas retardo.
    return round(0.5 + segundosCaminando / 30, 1)


def conectarTelefono(red, campus, telefono, lugar, ubicaciones):
    # ubicaciones: diccionario telefono -> lugar del campus de los demas telefonos.
    # Devuelve la lista de vecinos [(telefono, retardo), ...] con los que se enlazo.
    if not isinstance(telefono, str) or not isinstance(lugar, str):
        return []
    if campus.buscarVertice(lugar) is None:
        return []
    if red.buscarVertice(telefono) is not None:
        desconectarTelefono(red, telefono)
    red.insertarVertice(telefono)

    distancias, _ = dijkstra(campus, lugar)
    vecinos = []
    telLower = telefono.lower()
    for otro in ubicaciones:
        if not isinstance(otro, str) or otro.lower() == telLower or red.buscarVertice(otro) is None:
            continue
        vOtro = campus.buscarVertice(ubicaciones[otro])
        if vOtro is None:
            continue
        segundos = distancias.get(vOtro.nombre, INF)
        if segundos <= ALCANCE:
            retardo = retardoEnlace(segundos)
            red.insertarArista(telefono, otro, retardo)
            red.insertarArista(otro, telefono, retardo)
            vecinos.append((otro, retardo))
    return vecinos


def desconectarTelefono(red, telefono):
    # Usa eliminarVertice del profe: tambien quita las aristas que entran al telefono.
    return red.eliminarVertice(telefono)


def rutaMensaje(red, origen, destino):
    # La misma funcion de Dijkstra del campus, ahora con el retardo como peso.
    return rutaMasCorta(red, origen, destino)


def procesarCola(red, cola):
    # cola: lista de diccionarios {"id", "origen", "destino"} esperando camino.
    # Saca de la cola los que ya tienen camino y los devuelve como
    # [(id, ruta, retardo), ...]. Los demas se quedan esperando.
    entregados = []
    siguen = []
    for pendiente in cola:
        origen = pendiente.get("origen")
        destino = pendiente.get("destino")
        if not origen or not destino:
            siguen.append(pendiente)
            continue
        ruta, retardo = rutaMensaje(red, origen, destino)
        if len(ruta) > 0:
            entregados.append((pendiente["id"], ruta, retardo))
        else:
            siguen.append(pendiente)
    cola[:] = siguen
    return entregados


def confirmarEntrega(red, origen, destino, custodias, idMensaje):
    # Cuando el mensaje llega al destino final, busca la ruta mas corta de vuelta
    # (destino -> origen) para devolver el acuse (ACK) y elimina la copia en custodia
    # de todos los telefonos intermedios que lo guardaban.
    rutaVuelta, retardoVuelta = rutaMasCorta(red, destino, origen)
    purgados = []
    for tel, lista in custodias.items():
        if idMensaje in lista:
            lista.remove(idMensaje)
            purgados.append(tel)
    return rutaVuelta, retardoVuelta, purgados
