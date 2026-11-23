# Grafo DIRIGIDO y PONDERADO, con el estilo del profe.
# - Vertex: nombre (del lugar o telefono) y neig (lista de tuplas (Vertex destino, peso)).
#   (El profe lo llama "city"; aqui se renombro a "nombre" por claridad.)
# - Graph: vertexs (lista de objetos Vertex).
# - Los metodos devuelven True/False y NO imprimen nada.


class Vertex:
    def __init__(self, nombre):
        self.nombre = nombre    # nombre del vertice
        self.neig = []      # lista de tuplas (Vertex destino, peso)


class Graph:
    def __init__(self):
        self.vertexs = []   # lista de objetos Vertex

    def buscarVertice(self, nombre):
        # Recorre la lista y compara sin importar mayusculas/minusculas.
        for v in self.vertexs:
            if v.nombre.lower() == nombre.lower():
                return v
        return None

    def insertarVertice(self, nombre):
        if self.buscarVertice(nombre) is not None:
            return False                    # ya existe
        nuevo = Vertex(nombre)
        self.vertexs.append(nuevo)
        return True

    def insertarArista(self, origen, destino, peso):
        verticeOrigen = self.buscarVertice(origen)
        verticeDestino = self.buscarVertice(destino)
        if verticeOrigen is None or verticeDestino is None:
            return False
        # Dirigido: solo se agrega en el origen, nunca la vuelta.
        verticeOrigen.neig.append((verticeDestino, peso))
        return True

    def eliminarArista(self, origen, destino):
        verticeOrigen = self.buscarVertice(origen)
        verticeDestino = self.buscarVertice(destino)
        if verticeOrigen is None or verticeDestino is None:
            return False
        for vecino in verticeOrigen.neig:
            if vecino[0] is verticeDestino:
                verticeOrigen.neig.remove(vecino)
                return True                 # sale enseguida despues de remove
        return False

    def eliminarVertice(self, nombre):
        # 1. Buscarlo.
        borrar = self.buscarVertice(nombre)
        if borrar is None:
            return False
        # 2. Quitar las aristas que ENTRAN a el (filtrando el neig de todos).
        for v in self.vertexs:
            nuevaLista = []
            for vecino in v.neig:
                if vecino[0] is not borrar:
                    nuevaLista.append(vecino)
            v.neig = nuevaLista
        # 3. Vaciar su propio neig (las aristas que SALEN de el).
        borrar.neig = []
        # 4. Quitarlo de la lista de vertices.
        self.vertexs.remove(borrar)
        return True

    def actualizarPeso(self, origen, destino, peso):
        verticeOrigen = self.buscarVertice(origen)
        verticeDestino = self.buscarVertice(destino)
        if verticeOrigen is None or verticeDestino is None:
            return False
        for i in range(len(verticeOrigen.neig)):
            if verticeOrigen.neig[i][0] is verticeDestino:
                # Las tuplas no se pueden modificar: se reemplaza la tupla entera.
                verticeOrigen.neig[i] = (verticeDestino, peso)
                return True
        return False
