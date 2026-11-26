"""Emergencias: publicación en Firebase sin congelar el servidor, respaldo cuando el navegador del
admin no puede publicar, y el chat general sin datos personales para quien no inició sesión."""
import os
import tempfile
import threading
import time
import unittest
from unittest.mock import patch

from werkzeug.security import generate_password_hash

os.environ.setdefault("UNEXUAM_DATOS", tempfile.mkdtemp(prefix="unexuam-pruebas-"))

import app as servidor  # noqa: E402

FIREBASE = {"FIREBASE_SERVICE_ACCOUNT_FILE": "prueba.json", "FIREBASE_PROJECT_ID": "unexuam-pruebas",
            "FIREBASE_FUNCTIONS_PUSH": "0"}


def cliente(ip="10.77.0.1"):
    # IP propia: en main el límite de fallos de login es por red y otras pruebas fallan a propósito
    c = servidor.app.test_client()
    c.environ_base["REMOTE_ADDR"] = ip
    return c


def admin():
    # asegurar_admin crea la cuenta o la promueve con esta clave aunque otra prueba ya use el CIF
    cif, clave = "EMGADM01", "Emergencias-2026!"
    servidor.DB.asegurar_admin(cif, "Coordinación", generate_password_hash(clave),
                               servidor.nombre_telefono(cif, "Coordinación"), servidor.LUGAR_INICIAL)
    c = cliente()
    r = c.post("/api/login", json={"cif": cif, "contrasena": clave}).get_json()
    assert r["ok"], r
    return c


class TestPublicacionEmergencia(unittest.TestCase):
    def tearDown(self):
        servidor.DB.finalizar_emergencia()

    def test_el_servidor_responde_mientras_firebase_tarda(self):
        """Declarar una emergencia con Firebase lento no bloquea las rutas de los demás."""
        lento = threading.Event()

        def firebase_lento(*_a, **_k):
            lento.set()
            time.sleep(1.5)
            return True

        c = admin()
        resultado = {}
        with patch.dict(os.environ, FIREBASE), \
                patch("google.oauth2.service_account.Credentials.from_service_account_file"), \
                patch.object(servidor, "firebase_rest", side_effect=firebase_lento):
            hilo = threading.Thread(target=lambda: resultado.update(
                r=c.post("/api/emergencia/declarar", json={"tipo": "sismo"}).get_json()))
            hilo.start()
            self.assertTrue(lento.wait(5))
            t = time.perf_counter()
            r = servidor.app.test_client().post("/api/campus/ruta", json={"lugar": "C-305"}).get_json()
            espera = time.perf_counter() - t
            hilo.join()
        self.assertTrue(r["ok"])
        self.assertLess(espera, 1.0, "la ruta tuvo que esperar a que terminara la publicación en Firebase")
        self.assertTrue(resultado["r"]["ok"])
        self.assertTrue(resultado["r"]["nube"])

    def test_respaldo_publica_desde_el_servidor(self):
        """El navegador del admin publicaría, pero su token venció: el servidor publica la emergencia."""
        c = admin()
        d = c.post("/api/emergencia/declarar", json={"tipo": "incendio", "publicarDesdeWeb": True}).get_json()
        self.assertIsNone(d["nube"])                                       # el servidor no publicó
        with patch.dict(os.environ, FIREBASE), \
                patch("google.oauth2.service_account.Credentials.from_service_account_file"), \
                patch.object(servidor, "firebase_rest", return_value=True) as transporte:
            r = c.post("/api/emergencia/publicar", json={}).get_json()
        self.assertTrue(r["ok"])
        enviado = transporte.call_args_list[0].args[1]["fields"]["emergencia"]["mapValue"]["fields"]
        self.assertEqual(enviado["id"]["stringValue"], d["estado"]["emergencia"]["id"])

    def test_respaldo_sin_cuenta_de_servicio_lo_dice(self):
        c = admin()
        with patch.dict(os.environ, {}, clear=False):
            os.environ.pop("FIREBASE_SERVICE_ACCOUNT_FILE", None)
            os.environ.pop("GOOGLE_APPLICATION_CREDENTIALS", None)
            r = c.post("/api/emergencia/publicar", json={}).get_json()
        self.assertFalse(r["ok"])
        self.assertIn("Firebase", r["mensaje"])

    def test_publicar_es_solo_de_admin(self):
        c = servidor.app.test_client()
        self.assertEqual(c.post("/api/emergencia/publicar", json={}).status_code, 401)


class TestChatGeneralSinSesion(unittest.TestCase):
    def test_no_muestra_cif_ni_ruta(self):
        cif = "PRIV0001"
        c = cliente("10.77.0.2")
        r = c.post("/api/registro", json={"cif": cif, "nombre": "Privada Prueba", "contrasena": "clave-segura-1"}).get_json()
        if not r["ok"]:
            c.post("/api/login", json={"cif": cif, "contrasena": "clave-segura-1"})
        c.post("/api/mensajes/enviar", json={"para": "TODOS", "texto": "Todo bien en la Plazoleta"})
        anon = servidor.app.test_client().get("/api/mensajes/general").get_json()["mensajes"]
        mio = [m for m in anon if m["texto"] == "Todo bien en la Plazoleta"]
        self.assertTrue(mio)
        texto = str(anon)
        self.assertNotIn(cif, texto)
        self.assertNotIn(cif[-3:] + "'", texto)          # ni los dígitos del CIF en el nombre del teléfono
        self.assertTrue(mio[0]["de"].startswith("anon-"))
        self.assertEqual(mio[0]["deNombre"], "Privada Prueba")
        # con sesión se sigue viendo completo
        con = c.get("/api/mensajes/general").get_json()["mensajes"]
        self.assertTrue(any(m["de"] == cif for m in con))


if __name__ == "__main__":
    unittest.main()
