"""Servidor de producción de Unexuam (waitress).

Uso:  python servir.py            (escucha en 0.0.0.0:$PORT, por defecto 8080)

Corre en UN solo proceso con varios hilos: las sesiones en línea, la emergencia activa y los
límites de intentos viven en memoria, así que no se debe lanzar con varios procesos/workers.
Ponlo detrás de un proxy con TLS (nginx, Caddy o IIS) y define UNEXUAM_PROXY=1.
"""
import os

from waitress import serve

from app import app

if __name__ == "__main__":
    serve(app, host=os.environ.get("HOST", "0.0.0.0"), port=int(os.environ.get("PORT", "8080")),
          threads=int(os.environ.get("UNEXUAM_HILOS", "32")), ident="unexuam")
