# Contrato del proyecto (lo leen TODAS las sesiones)

Proyecto final de **Estructuras de Datos No Lineales / Programación Estructurada (UAM)**. Entrega: **23/11/2026**.
Autor: James Santiago Fernandez Obregon (trabaja solo).
Reglas de grafos del profe: `docs/REGLAS_PROFE.md`. Son **obligatorias**.

## Idea
Sistema de emergencia y evacuación Off-Grid para el campus UAM. Usa **solo grafos dirigidos y ponderados** (no se usa ABB ni NetworkX), en dos capas, y cada capa es un `Graph` del profe:

1. **Comunicación (Mesh simulada).** Vértices: teléfonos. Aristas: enlace, con peso = retardo en segundos. Una alerta se propaga con un **BFS limitado por TTL** que imita el reenvío DTN. Un teléfono sin vecinos guarda la alerta en cola y la entrega cuando aparece una arista nueva. La lógica se recicla de la red Mesh de SéTú (`C:\Setu\apps\mobile\lib\shared\mesh\mesh_relay_service.dart`) y se traduce a Python.
2. **Navegación (campus).** Vértices: aulas, pasillos, escaleras, salidas y zonas seguras. Aristas: paso, con peso = tiempo en segundos. Las alertas aumentan los pesos (congestión o peligro) o eliminan aristas (pasillo bloqueado). Se usa **Dijkstra hecho a mano** para la ruta de evacuación hacia la zona segura más cercana. Flujo máximo: solo si sobra tiempo.

Es un prototipo: Bluetooth y Wi-Fi reales quedan como trabajo futuro.

## Reparto
| Parte | Quién | Carpeta |
|---|---|---|
| Backend (lógica de grafos) | **James lo escribe a mano.** Claude solo explica, revisa y ayuda a depurar | `backend/` |
| Frontend web móvil (Flask + HTML/CSS/JS) | Claude | `frontend/`, `app.py` |
| Documento de propuesta | Claude con James | `docs/propuesta/` |
| Pitch y exposición | Claude con James | `docs/pitch/` |

## Interfaz backend → frontend (NO cambiar nombres sin avisar)
El frontend solo importa esto. Todo es Python puro y no imprime nada.

`backend/grafo.py`
```python
class Vertex:   # city: str, neig: list[tuple[Vertex, float]]
class Graph:    # vertexs: list[Vertex]
    insertarVertice(city: str) -> bool
    buscarVertice(city: str) -> Vertex | None
    insertarArista(origen: str, destino: str, peso: float) -> bool
    eliminarArista(origen: str, destino: str) -> bool
    eliminarVertice(city: str) -> bool
    actualizarPeso(origen: str, destino: str, peso: float) -> bool
```

`backend/mesh.py` (capa 1)
```python
propagarAlerta(red: Graph, origen: str, ttl: int) -> list[tuple[str, int]]
    # teléfonos alcanzados en orden BFS, con el número de salto de cada uno
```

`backend/evacuacion.py` (capa 2)
```python
dijkstra(campus: Graph, origen: str) -> tuple[dict[str, float], dict[str, str | None]]
rutaMasCorta(campus: Graph, origen: str, destino: str) -> tuple[list[str], float]   # ([], inf) si no hay ruta
rutaEvacuacion(campus: Graph, origen: str, zonasSeguras: list[str]) -> tuple[list[str], float]
aplicarAlerta(campus: Graph, lugar: str, factor: float) -> bool   # multiplica el peso de las aristas que ENTRAN a `lugar`
```

`backend/datos.py`
```python
crearCampus() -> tuple[Graph, list[str]]   # grafo del campus de ejemplo y lista de zonas seguras
crearRedMesh() -> Graph                    # red de teléfonos de ejemplo
```

Mientras el backend no esté listo, el frontend usa `frontend/_stub_backend.py`, un stub con esta misma interfaz. **Ese stub nunca se entrega como lógica real.**

## Reglas de git (todas las sesiones)
- Un solo repo, rama `main`, commits con el usuario de git de James.
- **Sin la línea `Co-Authored-By`, sin "Generated with Claude" y sin usar `bugñuelitos`** para commitear. Decisión del usuario del 22/11.
- Cada sesión hace `git add` **solo de sus carpetas** y `git commit -- <rutas>`. Nunca `git add -A`.
- Mensajes en español, con el formato `tipo(área): descripción`.
- Remoto: https://github.com/jamesjsfouam/unexuam (público). **Después de cada commit, `git pull --rebase` y `git push`** (decisión de James del 22/11).
- `README.md` lo mantiene la sesión coordinadora; si tu parte cambia algo del README, avisa en vez de editarlo.
