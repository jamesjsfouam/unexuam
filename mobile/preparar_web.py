"""Empaqueta el frontend de Unexuam y exporta los grafos reales del backend para la app móvil offline."""

import json
import re
import shutil
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ))

import math
from backend.datos import crearCampus, crearRedMesh, ubicacionesTelefonos
from backend.evacuacion import rutaEvacuacion


def serializar(g):
    vertices = [v.nombre for v in g.vertexs]
    aristas = []
    for v in g.vertexs:
        for destino, peso in v.neig:
            aristas.append([v.nombre, destino.nombre, round(float(peso), 2)])
    return {"vertices": vertices, "aristas": aristas}


def main():
    mobile_dir = Path(__file__).resolve().parent
    www_dir = mobile_dir / "www"
    static_dst = www_dir / "static"

    if www_dir.exists():
        shutil.rmtree(www_dir)
    shutil.copytree(RAIZ / "frontend" / "static", static_dst)

    # Exportar los grafos reales desde backend/datos.py (fuente única de verdad)
    campus, zonas = crearCampus()
    red = crearRedMesh()
    rutas_base = {}
    for v in campus.vertexs:
        ruta, tiempo = rutaEvacuacion(campus, v.nombre, zonas)
        t_val = None if (tiempo is None or (isinstance(tiempo, float) and math.isinf(tiempo))) else round(float(tiempo), 2)
        rutas_base[v.nombre] = {"origen": v.nombre, "ruta": list(ruta), "tiempo": t_val}
    datos = {
        "campus": serializar(campus),
        "zonas": list(zonas),
        "mesh": serializar(red),
        "ubicaciones": ubicacionesTelefonos(),
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

    print(
        f"Web móvil lista en {www_dir}: "
        f"{len(datos['campus']['vertices'])} vértices campus, "
        f"{len(datos['campus']['aristas'])} aristas, "
        f"{len(datos['mesh']['vertices'])} nodos mesh."
    )


if __name__ == "__main__":
    main()
