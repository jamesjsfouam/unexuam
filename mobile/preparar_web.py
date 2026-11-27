"""Empaqueta el frontend de Unexuam y exporta los grafos reales del backend para la app móvil offline."""

import json
import os
import re
import shutil
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ))

import math
from backend.datos import EDIFICIOS_SIN_PASO, crearCampus, crearRedMesh, ubicacionesTelefonos
from backend.grafo import Graph
from backend.evacuacion import rutaEvacuacion


_PLACEHOLDERS_FIREBASE = {
    "tu-proyecto-firebase",
    "000000000000",
    "TU_FIREBASE_ANDROID_API_KEY",
    "1:000000000000:android:xxxxxxxxxxxxxxxxxxxxxx",
}


def _cargar_env(archivo):
    """Carga variables de .env sin dependencias externas y sin sobrescribir el entorno."""
    if not archivo.is_file():
        return
    for linea in archivo.read_text(encoding="utf-8").splitlines():
        s = linea.strip()
        if not s or s.startswith("#"):
            continue
        if s.startswith("export "):
            s = s[7:].strip()
        if "=" not in s:
            continue
        clave, valor = s.split("=", 1)
        clave = clave.strip()
        valor = valor.strip()
        if len(valor) >= 2 and valor[0] == valor[-1] and valor[0] in ("'", '"'):
            valor = valor[1:-1]
        if clave:
            os.environ.setdefault(clave, valor)


def generar_google_services(mobile_dir):
    """Genera mobile/android/app/google-services.json desde las variables Firebase en .env."""
    project_id = os.environ.get("FIREBASE_PROJECT_ID", "").strip()
    project_number = os.environ.get("FIREBASE_PROJECT_NUMBER", "").strip()
    app_id = os.environ.get("FIREBASE_ANDROID_APP_ID", "").strip()
    api_key = os.environ.get("FIREBASE_ANDROID_API_KEY", "").strip()
    if not all([project_id, project_number, app_id, api_key]):
        return False
    if any(v in _PLACEHOLDERS_FIREBASE for v in (project_id, project_number, app_id, api_key)):
        return False

    storage_bucket = os.environ.get("FIREBASE_STORAGE_BUCKET", f"{project_id}.firebasestorage.app").strip()
    package_name = os.environ.get("FIREBASE_ANDROID_PACKAGE", "ni.edu.uam.unexuam").strip() or "ni.edu.uam.unexuam"

    payload = {
        "project_info": {
            "project_number": project_number,
            "project_id": project_id,
            "storage_bucket": storage_bucket,
        },
        "client": [
            {
                "client_info": {
                    "mobilesdk_app_id": app_id,
                    "android_client_info": {"package_name": package_name},
                },
                "oauth_client": [],
                "api_key": [{"current_key": api_key}],
                "services": {"appinvite_service": {"other_platform_oauth_client": []}},
            }
        ],
        "configuration_version": "1",
    }
    destino = mobile_dir / "android" / "app" / "google-services.json"
    if destino.parent.is_dir():
        destino.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        return True
    return False


def serializar(g):
    vertices = [v.nombre for v in g.vertexs]
    aristas = []
    for v in g.vertexs:
        for destino, peso in v.neig:
            aristas.append([v.nombre, destino.nombre, round(float(peso), 2)])
    return {"vertices": vertices, "aristas": aristas}


def main():
    _cargar_env(RAIZ / ".env")
    mobile_dir = Path(__file__).resolve().parent
    generar_google_services(mobile_dir)
    www_dir = mobile_dir / "www"
    static_dst = www_dir / "static"

    if www_dir.exists():
        shutil.rmtree(www_dir)
    shutil.copytree(RAIZ / "frontend" / "static", static_dst)

    # Exportar los grafos reales desde backend/datos.py (fuente única de verdad)
    campus, zonas = crearCampus()
    # Teléfonos simulados solo en modo demostración (UNEXUAM_DEMO=1); en el campus la red empieza vacía
    demo = os.environ.get("UNEXUAM_DEMO") == "1"
    red = crearRedMesh() if demo else Graph()
    rutas_base = {}
    for v in campus.vertexs:
        ruta, tiempo = rutaEvacuacion(campus, v.nombre, zonas)
        t_val = None if (tiempo is None or (isinstance(tiempo, float) and math.isinf(tiempo))) else round(float(tiempo), 2)
        rutas_base[v.nombre] = {"origen": v.nombre, "ruta": list(ruta), "tiempo": t_val}
    datos = {
        "campus": serializar(campus),
        "zonas": list(zonas),
        "sinPaso": sorted(EDIFICIOS_SIN_PASO),
        "mesh": serializar(red),
        "ubicaciones": ubicacionesTelefonos() if demo else {},
        "rutasBase": rutas_base,
    }
    (static_dst / "datos-iniciales.json").write_text(
        json.dumps(datos, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )

    # Copiar el motor offline que intercepta /api/* en el WebView
    shutil.copy2(mobile_dir / "motor-offline.js", static_dst / "motor-offline.js")

    # Convertir index.html de plantilla Jinja a HTML estático
    html = (RAIZ / "frontend" / "templates" / "index.html").read_text(encoding="utf-8")
    # En Android nativo el splash lo ejecuta SplashNativoView: eliminar #splash HTML para evitar doble carga
    html = re.sub(
        r'\s*<div id="splash"[\s\S]*?</div>\s*(?=<a href="#contenido")',
        '\n  ',
        html,
        count=1,
    )
    html = re.sub(
        r"\{\{\s*url_for\(\s*['\"]static['\"]\s*,\s*filename=['\"]([^'\"]+)['\"]\s*\)\s*\}\}",
        r"/static/\1",
        html,
    )
    html = html.replace(
        '<script src="/static/app.js"></script>',
        '<script src="/static/motor-offline.js"></script>\n  <script src="/static/app.js"></script>',
    )
    if "/static/motor-offline.js" not in html:
        raise SystemExit("ERROR: no se pudo inyectar motor-offline.js en index.html")
    if "{{" in html or "{%" in html:
        raise SystemExit("ERROR: quedaron expresiones Jinja sin resolver en mobile/www/index.html")
    (www_dir / "index.html").write_text(html, encoding="utf-8")

    # Sincronizar directamente hacia assets/public de Android (equivale a `cap copy android`)
    android_public = mobile_dir / "android" / "app" / "src" / "main" / "assets" / "public"
    if android_public.exists():
        android_static = android_public / "static"
        if android_static.exists():
            shutil.rmtree(android_static)
        shutil.copytree(static_dst, android_static)
        shutil.copy2(www_dir / "index.html", android_public / "index.html")
        for archivo_raiz in www_dir.iterdir():
            if archivo_raiz.is_file() and archivo_raiz.name != "index.html":
                shutil.copy2(archivo_raiz, android_public / archivo_raiz.name)

    print(
        f"Web móvil lista en {www_dir}: "
        f"{len(datos['campus']['vertices'])} vértices campus, "
        f"{len(datos['campus']['aristas'])} aristas, "
        f"{len(datos['mesh']['vertices'])} nodos mesh."
    )


if __name__ == "__main__":
    main()
