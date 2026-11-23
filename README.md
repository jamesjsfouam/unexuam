# Unexuam · Evacuación Off-Grid para el campus UAM

Proyecto final de **Estructuras de Datos No Lineales**, Universidad Americana (UAM), noviembre 2026.
Autor: **Br. James Santiago Fernandez Obregon**.

Unexuam guía a la comunidad universitaria hacia las zonas seguras cuando se caen internet y la red celular. Todo funciona con **grafos dirigidos y ponderados**, implementados a mano en Python con la estructura vista en clase: `Vertex` con `city` y `neig` (lista de tuplas `(destino, peso)`) y `Graph` con `vertexs`. No usa NetworkX ni otras librerías de grafos.

## Las dos capas de grafos

| Capa | Vértices | Aristas (peso) | Algoritmo |
|---|---|---|---|
| 1. Comunicación (red Mesh simulada) | teléfonos de los estudiantes | enlace entre teléfonos (retardo en s) | **BFS limitado por TTL**: la alerta salta de teléfono en teléfono, igual que el reenvío tolerante a retardos (DTN) |
| 2. Navegación (campus) | aulas, pasillos, escaleras, salidas, zonas seguras | paso de un lugar a otro (tiempo en s) | **Dijkstra**: ruta de evacuación hacia la zona segura más cercana |

Cuando llega una alerta, la capa 2 cambia: un pasillo congestionado **multiplica el peso** de sus aristas de entrada y un pasillo bloqueado **elimina la arista**. Después, Dijkstra recalcula la ruta.

Este es un prototipo: la red Mesh se **simula** con el grafo. Usar Bluetooth o Wi-Fi Direct reales es trabajo futuro.

## Cómo ejecutarlo

Requisitos: Python 3.10 o superior.

```powershell
pip install flask
python app.py
```

La consola muestra dos direcciones:

```
 En este PC:        http://127.0.0.1:5000
 Desde el teléfono: http://192.168.x.x:5000  (misma Wi-Fi)
```

### Desde el teléfono
1. Conecta el teléfono a la **misma Wi-Fi** que el PC, o crea un punto de acceso desde el teléfono y conecta el PC a él.
2. En el navegador del teléfono, abre la dirección «Desde el teléfono».
3. Si no abre, permite Python en el Firewall de Windows para **redes privadas**.
4. Opcional: usa «Agregar a la pantalla de inicio» para abrirla como una app.

Varios teléfonos pueden abrirla a la vez: todos ven el mismo estado, y una alerta emitida desde uno aparece animada en los demás.

## Pantallas

| Pestaña | Qué hace |
|---|---|
| Inicio | Estado de las dos redes, ruta actual y actividad |
| Red Mesh | Teléfonos y enlaces dirigidos con su peso. «Emitir alerta» con TTL y animación salto a salto |
| Campus | Mapa del grafo. «Estoy en…» muestra la ruta de evacuación y su tiempo. Permite bloquear o congestionar un pasillo y ver la ruta recalculada |
| Administrar | Insertar y eliminar vértices y aristas en los dos grafos, y ver la lista de adyacencia |

## Estructura del repositorio

```
backend/                    lógica de grafos
  grafo.py                  Vertex y Graph (insertar, buscar, eliminar, actualizar peso)
  datos.py                  campus y red Mesh de ejemplo
  evacuacion.py             Dijkstra, ruta más corta, ruta de evacuación, aplicarAlerta
  mesh.py                   propagarAlerta (BFS con TTL)
app.py                      servidor Flask: estado en memoria y endpoints JSON
frontend/                   interfaz web móvil (HTML, CSS y JS sin dependencias externas)
  _stub_backend.py          relleno temporal mientras se completa backend/ (no es la lógica entregada)
docs/
  CONTRATO.md               interfaz entre backend y frontend
  REGLAS_PROFE.md           reglas de implementación de grafos del curso
  propuesta/                propuesta del proyecto (.docx y .md)
  pitch/                    deck, guion, demo y preguntas
```

## Avance del backend

- [ ] `grafo.py`
- [ ] `datos.py`
- [ ] `evacuacion.py`
- [ ] `mesh.py`
