# Reglas de estructuras del profe (contrato del proyecto)

Fuente: `abb (1).py` (ABB oficial del curso), `graph.py` y el chat de clase del 13 de noviembre.
Lenguaje: **Python**. Todo el proyecto (backend y frontend) debe respetar estos nombres y esta forma.

## 1. Grafo DIRIGIDO y PONDERADO

```python
class Vertex:
    def __init__(self, city: str):
        self.city = city      # nombre del vértice
        self.neig = []        # lista de TUPLAS (Vertex destino, peso)

class Graph:
    def __init__(self):
        self.vertexs = []     # lista de objetos Vertex
```

Reglas:
- Vecinos = **lista de tuplas `(vertice_destino, peso)`**, donde el destino es el **objeto** `Vertex` (no el nombre ni un diccionario).
- Es **dirigido**: la arista se agrega solo en `origen.neig`. Nunca se agrega la vuelta automáticamente.
- Insertar vértice: recorrer `vertexs` y comparar `city.lower()`. Si ya existe, `return False`. Si no, crear `Vertex`, hacer `append` y `return True`.
- Insertar arista: buscar origen y destino recorriendo `vertexs`. Si falta alguno, `return False`. Si no, `origen.neig.append((destino, peso))` y `return True`.
- Eliminar arista: recorrer `origen.neig` y, si `vecino[0] is destino`, hacer `remove` y `return True`. Si no la encuentra, `return False`.
- Eliminar vértice:
  1. Buscarlo; si no existe, `return False`.
  2. Quitar las aristas **entrantes** filtrando el `neig` de todos los vértices.
  3. Vaciar su `neig`.
  4. Quitarlo de `vertexs` y `return True`.
- Los métodos devuelven `bool` y **no imprimen**. Los mensajes los muestra el menú o el frontend.
- Menú de consola con `os.system("cls" if os.name=="nt" else "clear")`, opciones numeradas y la pausa "Presione ENTER para continuar...".

### Variantes del chat que NO cumplen el estilo del profe (no usar)
- Vecinos como diccionario `neig[destino] = peso` con `es_dirigido`: rompe la regla de la lista de tuplas.
- Erratas de compañeros: `vetexs` y `neigh`. El nombre correcto es `vertexs` y `neig`.
- Métodos que hacen `print` dentro de la clase, en vez de devolver `bool`.

## 2. ABB: NO SE USA EN ESTE PROYECTO
Decisión del 22/11/2026: el proyecto usa **exclusivamente grafos dirigidos y ponderados**. Esta sección queda solo como referencia.

(Referencia) ABB oficial del curso:

- `Node(key)` con `key`, `left` y `right`.
- `ABB` con `root`, `insert(Node)` / `insertSubTree` (los duplicados `<=` van a la izquierda), `remove(key)` (el sucesor es el menor del subárbol derecho), `search(key)` / `searchSubTree`, `preorden`, `inorden`, `postorden` y `display()`.
- El profe dijo: *"esta es la implementación de ABB que estaremos usando en el proyecto"*. Se usa tal cual. Si hace falta guardar algo más que un `int` en el nodo, se añade un campo extra **sin tocar la lógica**.

## 3. Proyecto (propuesta de alcance, pendiente de confirmar)
**Sistema de emergencia y evacuación Off-Grid para campus universitario.** Funciona con dos capas, y cada capa es un `Graph` dirigido y ponderado del profe:

| Capa | Vértice (`city`) | Arista y peso |
|---|---|---|
| 1. Comunicación (Mesh simulada) | teléfono o nodo (p. ej. "Tel-Ana") | enlace BLE/Wi-Fi; peso = retardo o calidad de señal |
| 2. Navegación física | aula, pasillo, escalera, salida, zona segura | paso de A a B; peso = tiempo, aumentado por congestión o peligro |

Operaciones (todas escritas a mano sobre las clases del profe):
- CRUD de vértices y aristas, siguiendo las reglas de la sección 1.
- Propagar una alerta por la capa 1 con un recorrido BFS desde el teléfono que la emite. La alerta salta de vecino en vecino y simula DTN.
- Cuando la alerta llega, se actualizan los pesos de la capa 2. Si un pasillo está bloqueado, se elimina su arista.
- Calcular la ruta de evacuación óptima de un lugar a la salida o zona segura más cercana con Dijkstra hecho a mano.
- Opcional, solo si sobra tiempo: flujo máximo (Ford-Fulkerson) para detectar cuellos de botella.

Fuera de alcance: NetworkX, Bluetooth o Wi-Fi reales y sockets. La red Mesh se **simula** con el grafo.

### Reciclado de la red Mesh de SéTú (`C:\Setu\apps\mobile\lib\shared\mesh\`)
El código no se puede reutilizar: está en Dart/Flutter con Nearby Connections de Android (Kotlin), cifrado X25519/AES-GCM y Supabase, y no tiene ninguna clase de grafo.
Sí se recicla la **lógica de reenvío** (`mesh_relay_service.dart`), traducida a Python sobre el `Graph` del profe:

| SéTú (Dart) | Proyecto (Python, capa 1) |
|---|---|
| `ttl` del sobre, `nextHop()` resta 1 | BFS con límite de saltos: la alerta muere cuando `ttl == 0` |
| `_seenPacketIds` (no duplicar) | lista `visitados` del BFS |
| reenviar a todos los vecinos menos al emisor | recorrer `v.neig` y saltarse el vértice de origen |
| `_queue` + `_flushQueuedToPeer` al conectar un vecino | DTN: si un teléfono no tiene vecinos, guarda la alerta en una cola y la entrega al insertar una arista nueva |
| ACK de custodia (`queued` → `custodyConfirmed` → `centrallySynced`) | estado de cada teléfono: sin alerta / recibida / reenviada |
| teléfono puente (`syncPendingAsBridge`) | vértice marcado como "puente" que conecta con la capa 2 |

`docs/10-flujo-datos-y-red-mesh.md` de SéTú sirve como base para explicar la red Mesh en el documento y en el pitch.
- Tipo de frontend (Tkinter o Flask): falta.
