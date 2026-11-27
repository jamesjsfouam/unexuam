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


    def test_cambiar_clave_desde_la_terminal(self):
        from werkzeug.security import check_password_hash, generate_password_hash
        cif = "CLAVE001"
        if servidor.DB.usuario(cif) is None:
            servidor.DB.crear_usuario(cif, "Admin Prueba", generate_password_hash("vieja-clave-123"),
                                      servidor.nombre_telefono(cif, "Admin Prueba"), servidor.LUGAR_INICIAL, admin=True)
        r = servidor.app.test_cli_runner().invoke(args=["cambiar-clave", cif], input="nueva-clave-segura\nnueva-clave-segura\n")
        self.assertEqual(r.exit_code, 0, r.output)
        u = servidor.DB.usuario(cif)
        self.assertTrue(check_password_hash(u["hash"], "nueva-clave-segura"))
        self.assertTrue(u["admin"])


if __name__ == "__main__":
    unittest.main()
