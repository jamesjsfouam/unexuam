

INF = float("inf")


def dijkstra(campus, origen):
    distancias = {}     # nombre -> menor tiempo conocido desde el origen
    anteriores = {}     # nombre -> lugar por el que se llega (para armar la ruta)
    for v in campus.vertexs:
        distancias[v.nombre] = INF
        anteriores[v.nombre] = None

    inicio = campus.buscarVertice(origen)
    if inicio is None:
        return distancias, anteriores
    distancias[inicio.nombre] = 0

    visitados = []
    while len(visitados) < len(campus.vertexs):
        # 1. Elegir el vertice NO visitado con la menor distancia.
        actual = None
        for v in campus.vertexs:
            if v not in visitados:
                if actual is None or distancias[v.nombre] < distancias[actual.nombre]:
                    actual = v
        # Si el mejor que queda es infinito, el resto es inalcanzable.
        if distancias[actual.nombre] == INF:
            break
        visitados.append(actual)

        # 2. Relajar: probar si pasando por "actual" se llega mas rapido a cada vecino.
        for vecino in actual.neig:
            destino = vecino[0]
            peso = vecino[1]
            nuevaDistancia = distancias[actual.nombre] + peso
            if nuevaDistancia < distancias[destino.nombre]:
                distancias[destino.nombre] = nuevaDistancia
                anteriores[destino.nombre] = actual.nombre

    return distancias, anteriores


def rutaMasCorta(campus, origen, destino):
    verticeOrigen = campus.buscarVertice(origen)
    verticeDestino = campus.buscarVertice(destino)
    if verticeOrigen is None or verticeDestino is None:
        return [], INF

    distancias, anteriores = dijkstra(campus, origen)
    if distancias[verticeDestino.nombre] == INF:
        return [], INF                      # no hay camino

    # Armar la ruta caminando hacia atras con "anteriores".
    ruta = []
    lugar = verticeDestino.nombre
    while lugar is not None:
        ruta.insert(0, lugar)
        lugar = anteriores[lugar]
    return ruta, distancias[verticeDestino.nombre]


def rutaEvacuacion(campus, origen, zonasSeguras):
    # Prueba cada zona segura y se queda con la de menor tiempo.
    mejorRuta = []
    mejorTiempo = INF
    for zona in zonasSeguras:
        ruta, tiempo = rutaMasCorta(campus, origen, zona)
        if tiempo < mejorTiempo:
            mejorRuta = ruta
            mejorTiempo = tiempo
    return mejorRuta, mejorTiempo


def aplicarAlerta(campus, lugar, factor):
    peligro = campus.buscarVertice(lugar)
    if peligro is None:
        return False
    for v in campus.vertexs:
        for i in range(len(v.neig)):
            if v.neig[i][0] is peligro:
                v.neig[i] = (peligro, v.neig[i][1] * factor)
    return True
