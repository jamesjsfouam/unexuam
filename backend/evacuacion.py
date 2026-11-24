

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

    visitados = set()
    while len(visitados) < len(campus.vertexs):
        # 1. Elegir el vertice NO visitado con la menor distancia.
        actual = None
        for v in campus.vertexs:
            if v not in visitados:
                if actual is None or distancias[v.nombre] < distancias[actual.nombre]:
                    actual = v
        # Si el mejor que queda es infinito, el resto es inalcanzable.
        if actual is None or distancias[actual.nombre] == INF:
            break
        visitados.add(actual)

        # 2. Relajar: probar si pasando por "actual" se llega mas rapido a cada vecino.
        for vecino in actual.neig:
            destino = vecino[0]
            peso = vecino[1]
            if destino in visitados or peso < 0:
                continue
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
    # Calcula Dijkstra una sola vez y elige la zona segura con menor tiempo.
    if campus.buscarVertice(origen) is None:
        return [], INF
    distancias, anteriores = dijkstra(campus, origen)
    zonas = []
    for zona in zonasSeguras:
        vZona = campus.buscarVertice(zona)
        if vZona is not None:
            zonas.append(vZona)
    # Si dos zonas empatan gana la primera de campus.vertexs: la misma que
    # dijkstraPasos saca primero, asi la guia y la pantalla paso a paso coinciden.
    mejorZona = None
    mejorTiempo = INF
    for v in campus.vertexs:
        if v in zonas and distancias[v.nombre] < mejorTiempo:
            mejorZona = v.nombre
            mejorTiempo = distancias[v.nombre]
    if mejorZona is None:
        return [], INF
    ruta = []
    lugar = mejorZona
    while lugar is not None:
        ruta.insert(0, lugar)
        lugar = anteriores[lugar]
    return ruta, mejorTiempo


def aplicarAlerta(campus, lugar, factor):
    peligro = campus.buscarVertice(lugar)
    if peligro is None or factor <= 0 or factor != factor or factor == INF:
        return False
    for v in campus.vertexs:
        for i in range(len(v.neig)):
            if v.neig[i][0] is peligro:
                v.neig[i] = (peligro, v.neig[i][1] * factor)
    return True


def dijkstraPasos(campus, origen, zonasSeguras):
    # El mismo Dijkstra de arriba, pero guardando cada paso para explicarlo.
    # Se detiene cuando saca la PRIMERA zona segura: como Dijkstra saca los
    # vertices en orden de distancia, esa es la zona segura mas cercana.
    # Devuelve (pasos, ruta, tiempo). Cada paso es un diccionario:
    #   {"actual", "distancia", "vecinos": [{"destino", "peso", "antes", "nueva", "mejora", "visitado"}]}
    distancias = {}
    anteriores = {}
    for v in campus.vertexs:
        distancias[v.nombre] = INF
        anteriores[v.nombre] = None

    inicio = campus.buscarVertice(origen)
    if inicio is None:
        return [], [], INF
    distancias[inicio.nombre] = 0

    zonasLower = {z.lower() for z in zonasSeguras if isinstance(z, str)}
    pasos = []
    visitados = set()
    zonaAlcanzada = None
    while len(visitados) < len(campus.vertexs):
        actual = None
        for v in campus.vertexs:
            if v not in visitados:
                if actual is None or distancias[v.nombre] < distancias[actual.nombre]:
                    actual = v
        if actual is None or distancias[actual.nombre] == INF:
            break
        visitados.add(actual)

        paso = {"actual": actual.nombre, "distancia": distancias[actual.nombre], "vecinos": []}
        if actual.nombre.lower() in zonasLower:
            pasos.append(paso)
            zonaAlcanzada = actual.nombre
            break

        for vecino in actual.neig:
            destino = vecino[0]
            peso = vecino[1]
            antes = distancias[destino.nombre]
            nueva = distancias[actual.nombre] + peso
            mejora = destino not in visitados and peso >= 0 and nueva < antes
            if mejora:
                distancias[destino.nombre] = nueva
                anteriores[destino.nombre] = actual.nombre
            paso["vecinos"].append({"destino": destino.nombre, "peso": peso, "antes": antes,
                                    "nueva": nueva, "mejora": mejora,
                                    "visitado": destino in visitados})
        pasos.append(paso)

    if zonaAlcanzada is None:
        return pasos, [], INF
    ruta = []
    lugar = zonaAlcanzada
    while lugar is not None:
        ruta.insert(0, lugar)
        lugar = anteriores[lugar]
    return pasos, ruta, distancias[zonaAlcanzada]
