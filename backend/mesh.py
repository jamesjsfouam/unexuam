# Capa 1: red Mesh de telefonos simulada.
# La alerta se propaga con un BFS limitado por TTL (saltos maximos),
# igual que el reenvio de SeTu (mesh_relay_service.dart):
#   - ttl del sobre        -> salto maximo permitido
#   - _seenPacketIds       -> lista "visitados" (nadie recibe la alerta dos veces)
#   - reenviar a vecinos   -> recorrer actual.neig (el emisor ya esta en visitados)


def propagarAlerta(red, origen, ttl):
    inicio = red.buscarVertice(origen)
    if inicio is None:
        return []

    alcanzados = []                 # [(nombre del telefono, salto), ...] en orden BFS
    visitados = [inicio]
    cola = [(inicio, 0)]            # cola FIFO: se saca por delante con pop(0)

    while len(cola) > 0:
        elemento = cola.pop(0)
        actual = elemento[0]
        salto = elemento[1]
        alcanzados.append((actual.nombre, salto))

        if salto >= ttl:
            continue                # TTL agotado: este telefono ya no reenvia

        for vecino in actual.neig:
            destino = vecino[0]
            if destino not in visitados:
                visitados.append(destino)
                cola.append((destino, salto + 1))

    return alcanzados
