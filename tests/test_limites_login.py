import os
import tempfile
import unittest

from werkzeug.security import generate_password_hash

os.environ.setdefault("UNEXUAM_DATOS", tempfile.mkdtemp(prefix="unexuam-pruebas-"))

import app as servidor  # noqa: E402


class TestLimitesDeInicioDeSesion(unittest.TestCase):
    """Problemas que encontró el usuario de prueba «Carlos» (informe de 10 personas)."""

    def setUp(self):
        with servidor.RATE_LOCK:
            servidor.INTENTOS.clear(); servidor.INTENTOS_CIF.clear(); servidor.INTENTOS_IP.clear()
        self.cif = "LIM0001"
        if servidor.DB.usuario(self.cif) is None:
            servidor.DB.crear_usuario(self.cif, "Ana Limite", generate_password_hash("clave-buena-1"),
                                      servidor.nombre_telefono(self.cif, "Ana Limite"), servidor.LUGAR_INICIAL)

    def login(self, clave, ip, cif=None, xff=None):
        c = servidor.app.test_client()
        c.environ_base["REMOTE_ADDR"] = ip
        h = {"X-Forwarded-For": xff} if xff else None
        return c.post("/api/login", json={"cif": cif or self.cif, "contrasena": clave}, headers=h).get_json()

    def test_otro_desde_su_red_no_bloquea_la_cuenta_ajena(self):
        for i in range(12):
            self.login(f"mala{i}", "10.1.0.66")
        self.assertIn("Demasiados", self.login("mala", "10.1.0.66")["mensaje"])     # el atacante sí queda frenado
        self.assertTrue(self.login("clave-buena-1", "10.2.0.5")["ok"])            # Ana, desde su red, entra

    def test_un_usuario_no_bloquea_a_todo_el_wifi_del_campus(self):
        for i in range(25):
            self.login(f"mala{i}", "10.9.9.9", cif=f"OTRO{i:03d}")
        self.assertTrue(self.login("clave-buena-1", "10.9.9.9")["ok"])           # misma red, otra persona

    def test_x_forwarded_for_no_sirve_para_saltarse_el_limite(self):
        for i in range(10):
            self.login(f"mala{i}", "10.3.0.1", xff=f"1.2.3.{i}")
        self.assertIn("Demasiados", self.login("mala", "10.3.0.1", xff="9.9.9.9")["mensaje"])


if __name__ == "__main__":
    unittest.main()
