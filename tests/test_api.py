import json
import re
import unittest
from pathlib import Path

import app as servidor
from backend.datos import crearCampus


class TestApiYParidad(unittest.TestCase):
    def setUp(self):
        self.client = servidor.app.test_client()
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
            self.assertIn(b"unexuam-v1", r.data)

    def test_paridad_campus_plano_json(self):
        campus, _ = crearCampus()
        plano = json.loads(Path("frontend/static/campus-plano.json").read_text(encoding="utf-8"))
        pos = set(plano["posiciones"].keys())
        rx_int = re.compile(r"^([A-Z])-(\d)(\d{2})$|^([A-Z]) (Escalera|Pabell[oó]n) ")
        verts = {v.nombre for v in campus.vertexs}
        exteriores = {n for n in verts if not rx_int.match(n)}
        self.assertEqual(exteriores - pos, set())
        self.assertEqual(pos - verts, set())


if __name__ == "__main__":
    unittest.main()
