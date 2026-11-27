import os
import tempfile
import unittest

os.environ.setdefault("UNEXUAM_DATOS", tempfile.mkdtemp(prefix="unexuam-pruebas-"))

import app as servidor  # noqa: E402


class TestRegistro(unittest.TestCase):
    """Hallazgos de la auditoría de despliegue en el campus."""

    def registrar(self, cif, ip):
        c = servidor.app.test_client()
        c.environ_base["REMOTE_ADDR"] = ip
        return c.post("/api/registro", json={"cif": cif, "nombre": "Prueba Reservado", "contrasena": "clave-segura-1"}).get_json()

    def test_no_se_pueden_registrar_cifs_internos(self):
        for i, cif in enumerate(("TODOS", "INVITADO", "ADMIN")):
            j = self.registrar(cif, f"10.77.0.{i + 1}")
            self.assertFalse(j["ok"], cif)

    def test_el_tope_de_cuentas_alcanza_para_el_campus(self):
        self.assertGreaterEqual(servidor.MAX_CUENTAS, 5000)

    def test_hsts_detras_del_proxy(self):
        os.environ["UNEXUAM_PROXY"] = "1"
        try:
            r = servidor.app.test_client().get("/api/lugares")
            self.assertIn("max-age", r.headers.get("Strict-Transport-Security", ""))
        finally:
            os.environ.pop("UNEXUAM_PROXY", None)


    def test_sin_telefonos_simulados_fuera_del_modo_demo(self):
        antes = servidor.MODO_DEMO
        try:
            servidor.MODO_DEMO = False
            self.assertEqual(len(servidor.crear_red_mesh().vertexs), 0)
            servidor.MODO_DEMO = True
            self.assertGreater(len(servidor.crear_red_mesh().vertexs), 0)
        finally:
            servidor.MODO_DEMO = antes


if __name__ == "__main__":
    unittest.main()
