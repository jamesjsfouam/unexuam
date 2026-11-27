import os
import tempfile
import unittest

os.environ.setdefault("UNEXUAM_DATOS", tempfile.mkdtemp(prefix="unexuam-pruebas-"))

from werkzeug.security import generate_password_hash  # noqa: E402

import app as servidor  # noqa: E402


def cuenta(cif, nombre, admin=False):
    if servidor.DB.usuario(cif) is None:
        servidor.DB.crear_usuario(cif, nombre, generate_password_hash("clave-segura-123"),
                                  servidor.nombre_telefono(cif, nombre), servidor.LUGAR_INICIAL, admin=admin)
    c = servidor.app.test_client()
    c.environ_base["REMOTE_ADDR"] = f"10.88.0.{len(cif)}{1 if admin else 2}"
    r = c.post("/api/login", json={"cif": cif, "contrasena": "clave-segura-123"}).get_json()
    assert r["ok"], r
    return c


class TestAlarmaParaTodos(unittest.TestCase):
    """Si el administrador declara una emergencia, todas las cuentas (y los invitados) la reciben."""

    def setUp(self):
        servidor.DB.finalizar_emergencia()
        self.admin = cuenta("ALARMA01", "Admin Alarma", admin=True)
        self.est1 = cuenta("ALARMA02", "Estudiante Uno")
        self.est2 = cuenta("ALARMA03", "Estudiante Dos")
        self.invitado = servidor.app.test_client()

    def tearDown(self):
        servidor.DB.finalizar_emergencia()
        for c in (self.admin, self.est1, self.est2):     # deja la red Mesh como estaba
            c.post("/api/logout", json={})

    def emergencia(self, cliente):
        return cliente.get("/api/estado").get_json()["estado"]["emergencia"]

    def test_declarar_llega_a_todas_las_cuentas_y_finalizar_la_quita(self):
        for c in (self.admin, self.est1, self.est2):
            self.assertIsNone(self.emergencia(c))
        r = self.admin.post("/api/emergencia/declarar", json={"tipo": "sismo"}).get_json()
        self.assertTrue(r["ok"], r)
        ids = set()
        for c in (self.admin, self.est1, self.est2):
            em = self.emergencia(c)
            self.assertIsNotNone(em)
            self.assertEqual(em["tipo"], "sismo")
            ids.add(em["id"])
        self.assertEqual(len(ids), 1)
        r = self.admin.post("/api/emergencia/finalizar", json={"incidente": ids.pop()}).get_json()
        self.assertTrue(r["ok"], r)
        for c in (self.admin, self.est1, self.est2):
            self.assertIsNone(self.emergencia(c))

    def test_un_estudiante_no_puede_declarar(self):
        r = self.est1.post("/api/emergencia/declarar", json={"tipo": "incendio"})
        self.assertFalse(r.get_json()["ok"])
        self.assertIsNone(self.emergencia(self.est2))

    def test_el_invitado_sin_sesion_tambien_la_recibe(self):
        self.admin.post("/api/emergencia/declarar", json={"tipo": "incendio"})
        em = self.invitado.get("/api/campus/publico").get_json()["estado"].get("emergencia")
        self.assertIsNotNone(em)
        self.assertEqual(em["tipo"], "incendio")

    def test_toda_cuenta_con_sesion_esta_en_la_red_mesh(self):
        telefonos = set(self.admin.get("/api/estado").get_json()["estado"]["mesh"]["vertices"])
        for cif in ("ALARMA01", "ALARMA02", "ALARMA03"):
            self.assertIn(servidor.DB.usuario(cif)["telefono"], telefonos, cif)

    def test_el_invitado_entra_a_la_red_mesh_y_sale_si_desaparece(self):
        r = self.invitado.post("/api/invitado/presencia", json={"id": "INV-A1B2C3D4E5F6", "lugar": "Edificio E"}).get_json()
        self.assertTrue(r["ok"], r)
        telefonos = set(self.admin.get("/api/estado").get_json()["estado"]["mesh"]["vertices"])
        self.assertIn("Tel-INV-A1B2C3D4E5F6", telefonos)
        self.assertFalse(self.invitado.post("/api/invitado/presencia", json={"id": "<script>"}).get_json()["ok"])
        with servidor.lock:
            servidor.INVITADOS["INV-A1B2C3D4E5F6"]["visto"] -= servidor.INVITADO_VIGENCIA + 1
            servidor.purgar_invitados()
        telefonos = set(self.admin.get("/api/estado").get_json()["estado"]["mesh"]["vertices"])
        self.assertNotIn("Tel-INV-A1B2C3D4E5F6", telefonos)

    def mensajes(self, cliente):
        return [m["texto"] for m in cliente.get("/api/mensajes").get_json()["mensajes"]]

    def test_el_admin_escribe_a_una_persona_y_ella_le_responde(self):
        r = self.admin.post("/api/mensajes/enviar", json={"para": "ALARMA02", "texto": "¿Estás bien?"}).get_json()
        self.assertTrue(r["ok"], r)
        self.assertEqual(r["enviado"]["estado"], "entregado")
        self.assertIn("¿Estás bien?", self.mensajes(self.est1))
        r = self.est1.post("/api/mensajes/enviar", json={"para": "ALARMA01", "texto": "Sí, ya salí"}).get_json()
        self.assertTrue(r["ok"], r)
        self.assertIn("Sí, ya salí", self.mensajes(self.admin))

    def test_canal_general_llega_a_todos(self):
        r = self.est2.post("/api/mensajes/enviar", json={"para": "TODOS", "texto": "Plazoleta despejada"}).get_json()
        self.assertTrue(r["ok"], r)
        for c in (self.admin, self.est1):
            textos = [m["texto"] for m in c.get("/api/mensajes/general").get_json()["mensajes"]]
            self.assertIn("Plazoleta despejada", textos)


if __name__ == "__main__":
    unittest.main()
