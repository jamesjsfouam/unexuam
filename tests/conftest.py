import os
import tempfile

# Las pruebas usan los teléfonos simulados de la red Mesh (en producción vienen apagados)
os.environ.setdefault("UNEXUAM_DEMO", "1")
os.environ.setdefault("UNEXUAM_DATOS", tempfile.mkdtemp(prefix="unexuam-pruebas-"))
