
import unittest

from backend.grafo import Graph, Vertex
from backend.datos import crearCampus, crearRedMesh
from backend.evacuacion import analizarCuellosDeBotella, dijkstra, rutaMasCorta, rutaEvacuacion, aplicarAlerta, INF
from backend.mesh import propagarAlerta
from backend.evacuacion import dijkstraPasos
from backend.datos import ubicacionesTelefonos
from backend.mensajeria import conectarTelefono, confirmarEntrega, desconectarTelefono, rutaMensaje, procesarCola


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
                                "P Escalera Oeste P1", "P Salida Oeste", "Punto Seguro Parqueo Sur"])
        self.assertEqual(tiempo, 60)   # hasta el borde del Parqueo Sur, el más cercano

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
        self.assertEqual(len(campus.vertexs), 157)   # + extremos de la Pasarela B y salida central del B

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

    def test_ninguna_ruta_atraviesa_un_edificio_cerrado(self):
        # Un edificio cerrado puede ser el origen, nunca un punto intermedio (su vértice es su centro).
        from backend.datos import EDIFICIOS_SIN_PASO
        campus, zonas = crearCampus()
        for v in campus.vertexs:
            ruta, tiempo = rutaEvacuacion(campus, v.nombre, zonas)
            self.assertNotEqual(tiempo, float("inf"), f"{v.nombre} no tiene salida")
            self.assertFalse(set(ruta[1:-1]) & EDIFICIOS_SIN_PASO, f"{v.nombre}: {ruta}")

    def test_pasarela_b_y_plazoleta(self):
        campus, zonas = crearCampus()
        for pab in ["B Pabellón Este P1", "B Pabellón Oeste P1"]:
            ruta, tiempo = rutaMasCorta(campus, pab, "Punto Seguro Plazoleta")
            self.assertEqual(ruta, [pab, "B Salida Central", "Pasarela Edificio B", "Punto Seguro Plazoleta"])
            self.assertEqual(tiempo, 26)
        # La escalera en medio de la pasarela es dirigida (bajar 12 s, subir 18 s).
        _, bajar = rutaMasCorta(campus, "Pasarela Edificio B", "Punto Seguro Plazoleta")
        _, subir = rutaMasCorta(campus, "Punto Seguro Plazoleta", "Pasarela Edificio B")
        self.assertEqual(bajar, 12)
        self.assertEqual(subir, 18)

    def test_paso_b205_hacia_c_y_escalera_central(self):
        campus, zonas = crearCampus()
        rutaC, tiempoC = rutaMasCorta(campus, "B-205", "C Pabellón Este P2")
        self.assertEqual(rutaC, ["B-205", "B Pabellón Este P2", "B Escalera Central P2", "C Pabellón Este P2"])
        self.assertEqual(tiempoC, 20)
        rutaC3, tiempoC3 = rutaMasCorta(campus, "C-305", "B Escalera Central P2")
        self.assertEqual(rutaC3, ["C-305", "C Pabellón Este P3", "C Escalera Central P3", "B Escalera Central P2"])
        self.assertEqual(tiempoC3, 26)
        rutaPlazoleta, _ = rutaEvacuacion(campus, "B-205", zonas)
        self.assertIn("B Escalera Central P2", rutaPlazoleta)
        self.assertEqual(rutaPlazoleta[-1], "Punto Seguro Plazoleta")

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


class TestDijkstraPasos(unittest.TestCase):
    def test_misma_ruta_que_rutaEvacuacion(self):
        campus, zonas = crearCampus()
        pasos, ruta, tiempo = dijkstraPasos(campus, "C-101", zonas)
        ruta2, tiempo2 = rutaEvacuacion(campus, "C-101", zonas)
        self.assertEqual(tiempo, tiempo2)
        self.assertEqual(ruta[0], "C-101")
        self.assertIn(ruta[-1], zonas)
        self.assertEqual(pasos[0]["actual"], "C-101")
        self.assertEqual(pasos[-1]["actual"], ruta[-1])      # termina al sacar la zona segura

    def test_distancias_crecen(self):
        campus, zonas = crearCampus()
        pasos, ruta, tiempo = dijkstraPasos(campus, "P-309", zonas)
        d = [p["distancia"] for p in pasos]
        self.assertEqual(d, sorted(d))                       # Dijkstra saca en orden de distancia


class TestMensajeria(unittest.TestCase):
    def preparar(self):
        campus, zonas = crearCampus()
        red = crearRedMesh()
        ubic = ubicacionesTelefonos()
        return campus, red, ubic

    def test_conectar_y_enviar(self):
        campus, red, ubic = self.preparar()
        vecinos = conectarTelefono(red, campus, "Tel-Yo", "Edificio M", ubic)
        self.assertTrue(len(vecinos) > 0)
        ruta, retardo = rutaMensaje(red, "Tel-Yo", "Tel-Diego")
        self.assertEqual(ruta[0], "Tel-Yo")
        self.assertEqual(ruta[-1], "Tel-Diego")
        self.assertTrue(retardo > 0)

    def test_cola_dtn(self):
        campus, red, ubic = self.preparar()
        conectarTelefono(red, campus, "Tel-Yo", "Edificio M", ubic)
        ubic["Tel-Yo"] = "Edificio M"
        lejos = conectarTelefono(red, campus, "Tel-Lejos", "Punto Seguro Parqueo Suroeste", ubic)
        self.assertEqual(lejos, [])                          # nadie a su alcance
        cola = [{"id": 1, "origen": "Tel-Yo", "destino": "Tel-Lejos"}]
        self.assertEqual(procesarCola(red, cola), [])
        self.assertEqual(len(cola), 1)                       # sigue esperando
        # Se mueve cerca de los demas: ahora si hay camino y el mensaje sale.
        desconectarTelefono(red, "Tel-Lejos")
        conectarTelefono(red, campus, "Tel-Lejos", "Edificio D", ubic)
        entregados = procesarCola(red, cola)
        self.assertEqual(len(entregados), 1)
        self.assertEqual(cola, [])

    def test_desconectar_quita_aristas_entrantes(self):
        campus, red, ubic = self.preparar()
        conectarTelefono(red, campus, "Tel-Yo", "Edificio M", ubic)
        self.assertTrue(desconectarTelefono(red, "Tel-Yo"))
        for v in red.vertexs:
            for vecino in v.neig:
                self.assertNotEqual(vecino[0].nombre, "Tel-Yo")



class TestCustodia(unittest.TestCase):
    def test_confirmar_entrega_ack_purga_custodia(self):
        campus, zonas = crearCampus()
        red = crearRedMesh()
        conectarTelefono(red, campus, "Tel-Yo", "Edificio M", ubicacionesTelefonos())
        custodias = {"Tel-Yo": ["m1"], "Tel-Ana": ["m1"], "Tel-Luis": ["m1", "m2"]}
        rutaVuelta, retardoVuelta, purgados = confirmarEntrega(red, "Tel-Yo", "Tel-Ana", custodias, "m1")
        self.assertGreater(len(rutaVuelta), 0)
        self.assertLess(retardoVuelta, INF)
        self.assertEqual(set(purgados), {"Tel-Yo", "Tel-Ana", "Tel-Luis"})
        self.assertEqual(custodias["Tel-Luis"], ["m2"])


class TestCasosLimite(unittest.TestCase):
    def test_pesos_negativos_y_duplicados(self):
        g = grafoABC()
        self.assertFalse(g.insertarArista("A", "C", -5))          # Dijkstra no admite negativos
        self.assertFalse(g.insertarArista("A", "B", 1))           # ya existe A -> B
        self.assertFalse(g.actualizarPeso("A", "B", -1))
        self.assertFalse(g.insertarVertice("   "))
        self.assertIsNone(g.buscarVertice(None))
        self.assertFalse(aplicarAlerta(g, "B", -1))
        self.assertFalse(aplicarAlerta(g, "B", 0))

    def test_empate_igual_en_las_dos_funciones(self):
        g = Graph()
        for n in ["O", "Z1", "Z2"]:
            g.insertarVertice(n)
        g.insertarArista("O", "Z2", 5)
        g.insertarArista("O", "Z1", 5)
        ruta, t = rutaEvacuacion(g, "O", ["Z2", "Z1"])
        pasos, ruta2, t2 = dijkstraPasos(g, "O", ["Z2", "Z1"])
        self.assertEqual((ruta, t), (ruta2, t2))

    def test_zonas_sin_importar_mayusculas(self):
        g = Graph()
        g.insertarVertice("O")
        g.insertarVertice("Zona")
        g.insertarArista("O", "Zona", 3)
        self.assertEqual(rutaEvacuacion(g, "O", ["zona"])[1], 3)
        self.assertEqual(dijkstraPasos(g, "O", ["zona"])[2], 3)

    def test_ttl_negativo(self):
        self.assertEqual(propagarAlerta(crearRedMesh(), "Tel-Ana", -1), [])

    def test_reconectar_no_duplica_enlaces(self):
        campus, zonas = crearCampus()
        red = crearRedMesh()
        ubic = ubicacionesTelefonos()
        conectarTelefono(red, campus, "Tel-Yo", "Edificio E", ubic)
        conectarTelefono(red, campus, "Tel-Yo", "Edificio E", ubic)
        destinos = [w.nombre for w, p in red.buscarVertice("Tel-Yo").neig]
        self.assertEqual(len(destinos), len(set(destinos)))
        self.assertNotIn("Tel-Yo", destinos)

    def test_cola_con_pendiente_incompleto(self):
        cola = [{"id": 1, "origen": None, "destino": "Tel-Ana"}]
        self.assertEqual(procesarCola(crearRedMesh(), cola), [])
        self.assertEqual(len(cola), 1)

    def test_analizar_cuellos_de_botella(self):
        campus, zonas = crearCampus()
        res = analizarCuellosDeBotella(campus, zonas, limite=5)
        self.assertEqual(res["totalOrigenes"], len(campus.vertexs) - len(zonas))
        self.assertEqual(res["sinSalida"], 0)
        self.assertEqual(len(res["cuellos"]), 5)
        self.assertGreater(res["cuellos"][0]["flujo"], 0)
        self.assertTrue(len(res["zonas"]) > 0)

if __name__ == "__main__":
    unittest.main()
