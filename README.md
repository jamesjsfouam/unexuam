# Evacua UAM · Sistema de evacuación Off-Grid

Proyecto final de Estructuras de Datos No Lineales (UAM). Usa dos grafos dirigidos y ponderados:

- **Red Mesh** (capa 1): teléfonos y enlaces con su retardo. La alerta se propaga con BFS limitado por TTL.
- **Campus** (capa 2): aulas, pasillos, escaleras, salidas y zonas seguras. La ruta de evacuación se calcula con Dijkstra.

La interfaz es una web con aspecto de app móvil (Flask + HTML/CSS/JS sin librerías externas). Funciona sin internet: solo hace falta que el teléfono y el PC estén en la misma red Wi-Fi.

## Cómo ejecutarlo

```powershell
pip install flask
python app.py
```

Al arrancar, la consola muestra dos direcciones:

```
 En este PC:        http://127.0.0.1:5000
 Desde el teléfono: http://192.168.x.x:5000  (misma Wi-Fi)
```

## Cómo abrirlo desde el teléfono

1. Conecta el teléfono a la **misma Wi-Fi** que el PC (o crea un punto de acceso desde el teléfono y conecta el PC a él).
2. En el navegador del teléfono, escribe la dirección "Desde el teléfono" que muestra la consola.
3. Si no abre, permite Python en el Firewall de Windows para **redes privadas** (Windows lo pregunta la primera vez que se ejecuta `app.py`).
4. Opcional: en el menú del navegador, "Agregar a la pantalla de inicio" para abrirlo como una app.

Varias personas pueden abrirla a la vez: todas ven el mismo estado, y una alerta emitida desde un teléfono aparece animada en los demás.

## Pantallas

| Pestaña | Qué hace |
|---|---|
| Inicio | Estado de las dos redes, ruta actual, actividad y qué partes del backend están en uso |
| Red Mesh | Dibujo de teléfonos y enlaces dirigidos con su peso. «Emitir alerta» con TTL y animación salto a salto (orden de `propagarAlerta`) |
| Campus | Mapa del grafo. «Estoy en…» muestra la ruta de evacuación y su tiempo. Bloquear un pasillo (`eliminarArista`) o marcar congestión (`aplicarAlerta`) y ver la ruta recalculada |
| Administrar | Insertar y eliminar vértices y aristas en los dos grafos, y ver la lista de adyacencia |

## Estructura

```
app.py                      servidor Flask: estado en memoria (dos Graph) y endpoints JSON
backend/                    lógica de grafos (James): grafo.py, mesh.py, evacuacion.py, datos.py
frontend/templates/         index.html
frontend/static/            app.css, app.js, icono y manifest
frontend/_stub_backend.py   RELLENO TEMPORAL, no es la lógica entregable
```

`app.py` solo usa la interfaz de `docs/CONTRATO.md`. Cada función se toma de `backend/`. Si todavía no existe, se usa `frontend/_stub_backend.py`, que solo sirve para probar la interfaz. La pestaña Inicio indica qué piezas son reales y cuáles vienen del stub.
