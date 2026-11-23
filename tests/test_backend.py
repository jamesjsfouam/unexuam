
import unittest

from backend.grafo import Graph, Vertex
from backend.datos import crearCampus, crearRedMesh
from backend.evacuacion import dijkstra, rutaMasCorta, rutaEvacuacion, aplicarAlerta, INF
from backend.mesh import propagarAlerta


def grafoABC():
    g = Graph()
    for c in ["A", "B", "C"]:
        g.insertarVertice(c)
    g.insertarArista("A", "B", 5)
    g.insertarArista("B", "C", 2)
    g.insertarArista("C", "A", 1)
    return g


class TestGrafo(unittest.TestCase):
    def test_atributos_del_profe(self):
        g = grafoABC()
        self.assertIsInstance(g.vertexs, list)
        a = g.buscarVertice("A")
        self.assertIsInstance(a, Vertex)
        self.assertIsInstance(a.neig, list)
        self.assertIsInstance(a.neig[0], tuple)
        self.assertIs(a.neig[0][0], g.buscarVertice("B"))   # objeto, no nombre

    def test_insertar_vertice_repetido(self):
        g = grafoABC()
        self.assertFalse(g.insertarVertice("a"))            # ignora mayusculas
        self.assertTrue(g.insertarVertice("D"))
        self.assertEqual(len(g.vertexs), 4)

    def test_buscar_inexistente(self):
        self.assertIsNone(grafoABC().buscarVertice("Z"))

    def test_arista_es_dirigida(self):
        g = grafoABC()
        self.assertEqual(len(g.buscarVertice("B").neig), 1)  # B no tiene la vuelta a A
        self.assertFalse(g.insertarArista("A", "Z", 3))

    def test_eliminar_arista(self):
        g = grafoABC()
        self.assertTrue(g.eliminarArista("A", "B"))
        self.assertFalse(g.eliminarArista("A", "B"))
        self.assertEqual(g.buscarVertice("A").neig, [])

    def test_eliminar_vertice_quita_entrantes(self):
        g = grafoABC()
        self.assertTrue(g.eliminarVertice("B"))
        self.assertIsNone(g.buscarVertice("B"))
        self.assertEqual(g.buscarVertice("A").neig, [])    # A -> B desaparecio
        self.assertFalse(g.eliminarVertice("B"))

    def test_actualizar_peso(self):
        g = grafoABC()
        self.assertTrue(g.actualizarPeso("A", "B", 9))
        self.assertEqual(g.buscarVertice("A").neig[0][1], 9)
        self.assertFalse(g.actualizarPeso("B", "A", 9))     # no existe B -> A


class TestEvacuacion(unittest.TestCase):
    def test_dijkstra_simple(self):
        dist, prev = dijkstra(grafoABC(), "A")
        self.assertEqual(dist, {"A": 0, "B": 5, "C": 7})
        self.assertEqual(prev, {"A": None, "B": "A", "C": "B"})

    def test_ruta_mas_corta_y_sin_ruta(self):
        g = grafoABC()
        self.assertEqual(rutaMasCorta(g, "A", "C"), (["A", "B", "C"], 7))
        g.insertarVertice("D")
        self.assertEqual(rutaMasCorta(g, "A", "D"), ([], INF))
        self.assertEqual(rutaMasCorta(g, "A", "Z"), ([], INF))

    def test_dijkstra_elige_el_camino_barato(self):
        g = grafoABC()
        g.insertarArista("A", "C", 10)                      # directo, pero mas caro
        self.assertEqual(rutaMasCorta(g, "A", "C"), (["A", "B", "C"], 7))

    def test_ruta_evacuacion_campus(self):
        # Desde el aula 309 (3.er piso del P) sale a su pabellon y baja por la escalera oeste.
        campus, zonas = crearCampus()
        ruta, tiempo = rutaEvacuacion(campus, "P-309", zonas)
        self.assertEqual(ruta, ["P-309", "P Pabellón Oeste P3", "P Escalera Oeste P3", "P Escalera Oeste P2",
                                "P Escalera Oeste P1", "P Salida Oeste", "Punto Seguro Parqueo Oeste"])
        self.assertEqual(tiempo, 77)

    def test_alerta_cambia_la_ruta(self):
        campus, zonas = crearCampus()
        self.assertTrue(aplicarAlerta(campus, "Punto Seguro Parqueo Oeste", 10))
        ruta, tiempo = rutaEvacuacion(campus, "P-309", zonas)
        self.assertNotEqual(ruta[-1], "Punto Seguro Parqueo Oeste")   # evita el punto en peligro
        self.assertIn(ruta[-1], zonas)
        self.assertFalse(aplicarAlerta(campus, "Lugar inventado", 2))

    def test_escalera_bloqueada(self):
        campus, zonas = crearCampus()
        campus.eliminarArista("P Escalera Oeste P3", "P Escalera Oeste P2")
        ruta, tiempo = rutaEvacuacion(campus, "P-309", zonas)
        self.assertNotIn("P Escalera Oeste P2", ruta)               # busca otra escalera
        self.assertIn(ruta[-1], zonas)
        self.assertGreater(tiempo, 77)


class TestCampusUAM(unittest.TestCase):
    def test_numeracion_de_aulas(self):
        campus, zonas = crearCampus()
        for aula in ["B-101", "B-109", "B-201", "B-210", "C-109", "C-210", "C-310", "P-109", "P-209", "P-309"]:
            self.assertIsNotNone(campus.buscarVertice(aula))
        for aula in ["B-110", "B-211", "B-301", "C-311", "P-210", "P-310"]:
            self.assertIsNone(campus.buscarVertice(aula))
        self.assertEqual(len(campus.vertexs), 150)

    def test_escalera_dirigida(self):
        # Bajar un piso cuesta 12 s y subirlo 18 s: dos aristas distintas.
        campus, zonas = crearCampus()
        arriba = campus.buscarVertice("C Escalera Este P2")
        abajo = campus.buscarVertice("C Escalera Este P1")
        self.assertIn((abajo, 12), arriba.neig)
        self.assertIn((arriba, 18), abajo.neig)

    def test_pasillo_elevado_b_e(self):
        campus, zonas = crearCampus()
        self.assertEqual(rutaMasCorta(campus, "B-210", "Edificio E"),
                         (["B-210", "B Pabellón Oeste P2", "Edificio E"], 23))

    def test_aula_solo_con_su_pabellon(self):
        # A un aula no se llega desde otra aula: solo desde el pabellon de su mitad del piso.
        campus, zonas = crearCampus()
        for v in campus.vertexs:
            if "-" in v.nombre[:2]:
                self.assertEqual(len(v.neig), 1, v.nombre)
                self.assertIn("Pabellón", v.neig[0][0].nombre)
        self.assertEqual(campus.buscarVertice("C-305").neig[0][0].nombre, "C Pabellón Este P3")
        self.assertEqual(campus.buscarVertice("C-306").neig[0][0].nombre, "C Pabellón Oeste P3")
        self.assertEqual(campus.buscarVertice("P-305").neig[0][0].nombre, "P Pabellón Este P3")   # 9 aulas: 01-05 este

    def test_todos_tienen_ruta_segura(self):
        campus, zonas = crearCampus()
        for v in campus.vertexs:
            ruta, tiempo = rutaEvacuacion(campus, v.nombre, zonas)
            self.assertNotEqual(tiempo, INF, v.nombre)


class TestMesh(unittest.TestCase):
    def test_bfs_por_saltos(self):
        red = crearRedMesh()
        res = propagarAlerta(red, "Tel-Ana", 2)
        self.assertEqual(res[0], ("Tel-Ana", 0))
        saltos = {}
        for tel in res:
            saltos[tel[0]] = tel[1]
        self.assertEqual(saltos["Tel-Luis"], 1)
        self.assertEqual(saltos["Tel-Sofía"], 1)
        self.assertEqual(saltos["Tel-María"], 2)
        self.assertNotIn("Tel-Pedro", saltos)               # estaria en el salto 3

    def test_sin_duplicados_y_ttl_grande(self):
        res = propagarAlerta(crearRedMesh(), "Tel-Ana", 99)
        nombres = [t[0] for t in res]
        self.assertEqual(len(nombres), len(set(nombres)))
        self.assertEqual(len(nombres), 8)                   # llega a todos

    def test_dirigido_y_ttl_cero(self):
        red = crearRedMesh()
        self.assertEqual(propagarAlerta(red, "Tel-Diego", 5), [("Tel-Diego", 0)])
        self.assertEqual(propagarAlerta(red, "Tel-Ana", 0), [("Tel-Ana", 0)])
        self.assertEqual(propagarAlerta(red, "Nadie", 3), [])


if __name__ == "__main__":
    unittest.main()
