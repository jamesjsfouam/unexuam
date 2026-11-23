import json
import os
import re
import tempfile
import unittest
from pathlib import Path

os.environ.setdefault("UNEXUAM_DATOS", tempfile.mkdtemp(prefix="unexuam-pruebas-"))

import app as servidor
from backend.datos import crearCampus


class TestApiYParidad(unittest.TestCase):
    def setUp(self):
        self.client = servidor.app.test_client()
        self.client.post("/api/login/demo", json={})      # perfil administrador
        servidor.desconectar_usuario(servidor.CIF_DEMO)  # su teléfono no altera la red de ejemplo
        self.client.post("/api/reiniciar", json={"grafo": "ambos"})

    def test_cabeceras_y_estado_inicial(self):
        r = self.client.get("/api/estado")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.headers.get("Cache-Control"), "no-store")
        self.assertEqual(r.headers.get("X-Content-Type-Options"), "nosniff")
        data = r.get_json()
        self.assertTrue(data["ok"])
        self.assertEqual(len(data["estado"]["campus"]["vertices"]), 154)
        self.assertEqual(len(data["estado"]["campus"]["aristas"]), 442)
        self.assertEqual(len(data["estado"]["mesh"]["vertices"]), 8)

    def test_validacion_payloads_invalidos(self):
        self.assertFalse(self.client.post("/api/campus/vertice", json=["no-dict"]).get_json()["ok"])
        self.assertFalse(self.client.post("/api/campus/vertice", json={"accion": "insertar", "nombre": None}).get_json()["ok"])
        self.assertFalse(self.client.post("/api/campus/arista", json={"accion": "insertar", "origen": "B-101", "destino": "B-102", "peso": True}).get_json()["ok"])
        self.assertFalse(self.client.post("/api/reiniciar", json={"grafo": "desconocido"}).get_json()["ok"])

    def test_flujo_usuario_c305_y_bloqueo_escalera_central(self):
        r1 = self.client.post("/api/campus/ruta", json={"lugar": "C-305"}).get_json()
        self.assertTrue(r1["ok"])
        self.assertEqual(r1["ruta"]["tiempo"], 58)
        self.assertEqual(r1["ruta"]["ruta"][-1], "Punto Seguro Plazoleta")

        b = self.client.post("/api/campus/bloquear", json={
            "origen": "C Escalera Central P3",
            "destino": "B Escalera Central P2",
            "ambos": True,
        }).get_json()
        self.assertTrue(b["ok"])

        r2 = self.client.post("/api/campus/ruta", json={"lugar": "C-305"}).get_json()
        self.assertEqual(r2["ruta"]["tiempo"], 70)
        self.assertNotIn("C Escalera Central P3", r2["ruta"]["ruta"])

    def test_flujo_usuario_p309_bloqueo_y_congestion(self):
        self.assertEqual(self.client.post("/api/campus/ruta", json={"lugar": "P-309"}).get_json()["ruta"]["tiempo"], 77)
        self.client.post("/api/campus/bloquear", json={"origen": "P Escalera Oeste P3", "destino": "P Escalera Oeste P2", "ambos": True})
        self.assertEqual(self.client.post("/api/campus/ruta", json={"lugar": "P-309"}).get_json()["ruta"]["tiempo"], 136)
        self.client.post("/api/campus/desbloquear", json={})
        self.client.post("/api/campus/congestionar", json={"lugar": "Punto Seguro Parqueo Oeste", "factor": 5})
        r = self.client.post("/api/campus/ruta", json={"lugar": "P-309"}).get_json()
        self.assertEqual(r["ruta"]["tiempo"], 99)
        self.assertEqual(r["ruta"]["ruta"][-1], "Punto Seguro Parqueo Sur")

    def test_flujo_red_mesh_ttl(self):
        self.assertEqual(len(self.client.post("/api/mesh/alerta", json={"origen": "Tel-Ana", "ttl": 0}).get_json()["alcanzados"]), 1)
        self.assertEqual(len(self.client.post("/api/mesh/alerta", json={"origen": "Tel-Ana", "ttl": 2}).get_json()["alcanzados"]), 5)
        self.assertEqual(len(self.client.post("/api/mesh/alerta", json={"origen": "Tel-Ana", "ttl": 5}).get_json()["alcanzados"]), 8)

    def test_flujo_admin_crud_case_insensitive(self):
        self.assertTrue(self.client.post("/api/campus/vertice", json={"accion": "insertar", "nombre": "Aula 203"}).get_json()["ok"])
        self.assertTrue(self.client.post("/api/campus/arista", json={"accion": "insertar", "origen": "Aula 203", "destino": "B Pabellón Este P2", "peso": 12}).get_json()["ok"])
        self.assertTrue(self.client.post("/api/campus/arista", json={"accion": "actualizar", "origen": "Aula 203", "destino": "B Pabellón Este P2", "peso": 20}).get_json()["ok"])
        self.assertEqual(self.client.post("/api/campus/ruta", json={"lugar": "Aula 203"}).get_json()["ruta"]["tiempo"], 58)
        self.assertTrue(self.client.post("/api/campus/vertice", json={"accion": "eliminar", "nombre": "aula 203"}).get_json()["ok"])

    def test_service_worker_disponible(self):
        with self.client.get("/sw.js") as r:
            self.assertEqual(r.status_code, 200)
            self.assertEqual(r.headers.get("Service-Worker-Allowed"), "/")
            self.assertIn(b"unexuam-v7", r.data)

    def test_paridad_campus_plano_json(self):
        campus, _ = crearCampus()
        plano = json.loads(Path("frontend/static/campus-plano.json").read_text(encoding="utf-8"))
        pos = set(plano["posiciones"].keys())
        rx_int = re.compile(r"^([A-Z])-(\d)(\d{2})$|^([A-Z]) (Escalera|Pabell[oó]n) ")
        verts = {v.nombre for v in campus.vertexs}
        exteriores = {n for n in verts if not rx_int.match(n)}
        self.assertEqual(exteriores - pos, set())
        self.assertEqual(pos - verts, set())




class TestSesionYMensajes(unittest.TestCase):
    def nuevo(self, cif, nombre, lugar):
        c = servidor.app.test_client()
        r = c.post("/api/registro", json={"cif": cif, "nombre": nombre, "contrasena": "clave123"}).get_json()
        if not r["ok"]:
            r = c.post("/api/login", json={"cif": cif, "contrasena": "clave123"}).get_json()
        self.assertTrue(r["ok"], r)
        c.post("/api/yo/lugar", json={"lugar": lugar})
        return c, c.get("/api/yo").get_json()["usuario"]

    def test_sin_sesion_no_hay_api(self):
        c = servidor.app.test_client()
        self.assertEqual(c.get("/api/estado").status_code, 401)
        self.assertFalse(c.get("/api/yo").get_json()["sesion"])
        self.assertTrue(c.get("/api/lugares").get_json()["ok"])

    def test_registro_y_contrasena(self):
        c = servidor.app.test_client()
        corta = c.post("/api/registro", json={"cif": "REG0001", "nombre": "Ana", "contrasena": "123"}).get_json()
        self.assertFalse(corta["ok"])
        self.nuevo("REG0001", "Registro Prueba", "C-101")
        self.assertFalse(c.post("/api/login", json={"cif": "REG0001", "contrasena": "mala999"}).get_json()["ok"])
        self.assertFalse(c.post("/api/registro", json={"cif": "REG0001", "nombre": "Otra", "contrasena": "clave123"}).get_json()["ok"])

    def test_solo_admin_edita_grafos(self):
        c, u = self.nuevo("NOADM01", "Sin Admin", "C-101")
        self.assertFalse(u["admin"])
        r = c.post("/api/mesh/vertice", json={"accion": "insertar", "nombre": "Tel-Intruso"})
        self.assertEqual(r.status_code, 403)

    def test_mensaje_directo_y_cola_dtn(self):
        a, ua = self.nuevo("MSJ0001", "Emisor", "Edificio D")
        b, ub = self.nuevo("MSJ0002", "Receptor", "Punto Seguro Parqueo Suroeste")
        self.assertEqual(ub["vecinos"], [])                       # lejos de todos
        r = a.post("/api/mensajes/enviar", json={"para": "MSJ0002", "texto": "¿Estás bien?"}).get_json()
        self.assertEqual(r["enviado"]["estado"], "en cola")
        self.assertTrue(b.post("/api/yo/lugar", json={"lugar": "Edificio D"}).get_json()["ok"])
        m = [x for x in b.get("/api/mensajes").get_json()["mensajes"] if x["texto"] == "¿Estás bien?"][0]
        self.assertEqual(m["estado"], "entregado")
        self.assertTrue(m["viaCola"])
        self.assertEqual(m["ruta"][0], ua["telefono"])
        self.assertEqual(m["ruta"][-1], ub["telefono"])
        directo = a.post("/api/mensajes/enviar", json={"para": "MSJ0002", "texto": "Voy en camino"}).get_json()
        self.assertEqual(directo["enviado"]["estado"], "entregado")

    def test_algoritmo_paso_a_paso(self):
        c = servidor.app.test_client()
        c.post("/api/login/demo", json={})
        r = c.post("/api/algoritmo", json={"origen": "C-101"}).get_json()
        ruta, tiempo = servidor.rutaEvacuacion(servidor.S["campus"], "C-101", servidor.S["zonas"])
        self.assertEqual(r["tiempo"], tiempo)
        self.assertEqual(r["pasos"][0]["actual"], "C-101")
        self.assertIn(r["ruta"][-1], r["zonasSeguras"])


if __name__ == "__main__":
    unittest.main()
