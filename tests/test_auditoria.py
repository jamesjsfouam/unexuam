import os
import tempfile
import unittest

os.environ.setdefault("UNEXUAM_DATOS", tempfile.mkdtemp(prefix="unexuam-pruebas-"))

from werkzeug.security import generate_password_hash  # noqa: E402

import app as servidor  # noqa: E402


def cuenta(cif, admin=False, ip="10.99.0.1"):
    if servidor.DB.usuario(cif) is None:
        servidor.DB.crear_usuario(cif, "Cuenta " + cif, generate_password_hash("clave-segura-123"),
                                  servidor.nombre_telefono(cif, "Cuenta " + cif), servidor.LUGAR_INICIAL, admin=admin)
    c = servidor.app.test_client()
    c.environ_base["REMOTE_ADDR"] = ip
    assert c.post("/api/login", json={"cif": cif, "contrasena": "clave-segura-123"}).get_json()["ok"]
    return c


class TestAuditoria(unittest.TestCase):
    """Regresiones de la auditoría previa al despliegue en el campus."""

    def test_post_que_no_es_json_o_de_otro_sitio_se_rechaza(self):
        adm = cuenta("AUD00001", admin=True)
        r = adm.post("/api/reiniciar", data='{"grafo":"ambos"}', content_type="text/plain")
        self.assertEqual(r.status_code, 403)
        r = adm.post("/api/campus/desbloquear", json={}, headers={"Origin": "https://otra.uam.edu.ni", "Sec-Fetch-Site": "same-site"})
        self.assertEqual(r.status_code, 403)
        self.assertNotEqual(adm.post("/api/campus/desbloquear", json={}).status_code, 403)
        adm.post("/api/logout", json={})

    def test_cerrar_sesion_invalida_la_cookie(self):
        c = cuenta("AUD00002")
        robada = servidor.app.test_client()
        robada.set_cookie(servidor.app.config.get("SESSION_COOKIE_NAME", "session"), c.get_cookie("session").value)
        self.assertTrue(robada.get("/api/yo").get_json().get("sesion"))
        c.post("/api/logout", json={})
        self.assertFalse(robada.get("/api/yo").get_json().get("sesion", False))

    def test_estudiante_no_ve_la_topologia_mesh_ni_nombres_de_telefonos(self):
        est = cuenta("AUD00003")
        mesh = est.get("/api/estado").get_json()["estado"]["mesh"]
        self.assertEqual(mesh["vertices"], [])
        self.assertGreaterEqual(mesh["total"], 1)
        est.post("/api/logout", json={})

    def test_canal_general_publico_no_expone_cifs(self):
        est = cuenta("AUD00004")
        est.post("/api/mensajes/enviar", json={"para": "TODOS", "texto": "Prueba de privacidad"})
        anon = servidor.app.test_client().get("/api/mensajes/general").get_json()["mensajes"]
        self.assertTrue(anon)
        self.assertNotIn("AUD00004", {m["de"] for m in anon})
        est.post("/api/logout", json={})

    def test_sos_de_invitados_tras_la_misma_red(self):
        # cientos de invitados detrás del mismo Wi-Fi: no se corta a los 6
        enviados = 0
        for i in range(12):
            c = servidor.app.test_client()
            c.environ_base["REMOTE_ADDR"] = "10.200.0.1"
            r = c.post("/api/mensajes/general", json={"texto": f"SOS · prueba {i}", "guestId": f"INV-{i:012X}"})
            enviados += r.get_json()["ok"]
        self.assertEqual(enviados, 12)

    def test_alerta_de_usuario_no_va_al_historial_publico(self):
        est = cuenta("AUD00005")
        est.post("/api/mensajes/alerta", json={"ttl": 2, "texto": "Ayuda"})
        otro = cuenta("AUD00006")
        hist = [h["texto"] for h in otro.get("/api/estado").get_json()["estado"]["historial"]]
        self.assertFalse(any("Alerta de Cuenta AUD00005" in h for h in hist))
        for c in (est, otro):
            c.post("/api/logout", json={})

    def test_avalancha_en_el_canal_general_no_esconde_mensajes_directos(self):
        a = cuenta("AUD00007")
        b = cuenta("AUD00008")
        a.post("/api/mensajes/enviar", json={"para": "AUD00008", "texto": "Mensaje directo importante"})
        with servidor.lock:
            for i in range(450):
                servidor.entregar("AUD00007", "TODOS", f"ruido {i}", ruta=["x"], retardo=0.5)
        textos = [m["texto"] for m in b.get("/api/mensajes").get_json()["mensajes"]]
        self.assertIn("Mensaje directo importante", textos)
        for c in (a, b):
            c.post("/api/logout", json={})


if __name__ == "__main__":
    unittest.main()
