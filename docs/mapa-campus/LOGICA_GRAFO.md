# Lógica de los grafos de Unexuam

## Las dos capas
| Capa | Grafo | Vértices | Aristas (peso) | Algoritmo |
|---|---|---|---|---|
| 1. Comunicación | `crearRedMesh()` | teléfonos | enlace (retardo en s) | **BFS con TTL** (`propagarAlerta`): la alerta salta de teléfono en teléfono |
| 2. Navegación | `crearCampus()` | aulas, escaleras, salidas, edificios, zonas y puntos seguros | paso a pie (segundos) | **Dijkstra** (`rutaEvacuacion`): ruta más rápida al punto seguro más cercano |

**Flujo de la demo:**
1. Un teléfono emite la alerta y BFS la propaga.
2. La alerta cambia el campus: `aplicarAlerta` multiplica el tiempo de llegar a un lugar en peligro, y `eliminarArista` cierra un pasillo o una escalera.
3. Dijkstra recalcula la ruta de cada persona.

## Capa 2: el grafo del campus (134 vértices, 368 aristas dirigidas)

### Edificios con aulas (B, C y P), por dentro
El primer número del aula es el piso, y se numera de **este a oeste**.

| Edificio | Piso 1 | Piso 2 | Piso 3 | Entre aulas |
|---|---|---|---|---|
| B | 101–109 | 201–210 | — | 8 s |
| C | 101–109 | 201–210 | 301–310 | 8 s |
| P | 101–109 | 201–209 | 301–309 | 10 s |

Cada piso es un pasillo con una escalera en cada extremo. Así se ve el piso 3 del P:

```
            (este)                                                   (oeste)
Escalera Este P3 ─6─ P-301 ─10─ P-302 ─10─ … ─10─ P-309 ─6─ Escalera Oeste P3
       │ ↓12  ↑18                                                ↓12  ↑18 │
Escalera Este P2 ─6─ P-201 ─10─ …                    … ─10─ P-209 ─6─ Escalera Oeste P2
       │ ↓12  ↑18                                                ↓12  ↑18 │
Escalera Este P1 ─6─ P-101 ─10─ …                    … ─10─ P-109 ─6─ Escalera Oeste P1
       │ 5                                                             5 │
  P Salida Este ── caminos del campus ──              ── caminos del campus ── P Salida Oeste
```

- **Pasillos:** van en los dos sentidos, así que son dos aristas con el mismo peso.
- **Escaleras:** son **aristas dirigidas con distinto peso**. Bajar un piso cuesta 12 s y subirlo 18 s. Por eso el grafo tiene que ser dirigido.
- **Pasillo elevado:** une el 2.º piso del B (aula **B-210**, extremo oeste) con el **Edificio E**, en 15 s.

### El resto del campus
- **Lugares sin aulas en la demo** (Edificios A, D, E, F, I, J, M y O, Jaguar Center, comedores, Food Court…): son un solo vértice cada uno.
- **12 destinos seguros:** 2 zonas seguras (la cancha de fútbol y el campo de béisbol) y 10 puntos seguros (9 parqueos y la plazoleta).
- **Caminos a pie:** cada lugar se une con sus 3 vecinos más cercanos del mapa (a menos de 75 m), más las aristas necesarias para que no quede ningún lugar aislado.
- **Peso de cada camino:** distancia en línea recta × 1.3 (los caminos no son rectos) / 1.2 m/s (caminar rápido).
- **De dónde sale:** `docs/mapa-campus/generar_grafo.py` lo calcula desde `lugares.json`. El dibujo está en `grafo-campus.png`.

## Cómo encuentra la ruta Dijkstra
`rutaEvacuacion(campus, origen, zonasSeguras)` corre `rutaMasCorta` hacia cada destino seguro y se queda con el de menor tiempo. `dijkstra` usa una lista `visitados` y dos diccionarios (`distancias` y `anteriores`), sin `heapq`: en cada vuelta toma el vértice no visitado más cercano y «relaja» a sus vecinos.

## Casos de la demo (calculados con el backend real)
| # | Situación | Ruta | Tiempo |
|---|---|---|---|
| 1 | Aula **P-309**, todo normal | P-309 → Escalera Oeste P3 → P2 → P1 → P Salida Oeste → **Parqueo Oeste** | **67 s** |
| 2 | Se bloquea la escalera oeste del P entre el piso 3 y el 2 (`eliminarArista`) | P-309 → P-308 → … → P-301 → Escalera Este P3 → P2 → P1 → P Salida Este → **Parqueo Edificio P** | **156 s** |
| 3 | Alerta en el Parqueo Oeste ×10 (`aplicarAlerta`) | P-309 → Escalera Oeste → P Salida Oeste → **Parqueo Sur** | **89 s** |
| 4 | Aula **B-210** | B-210 → **pasillo elevado** → Edificio E → **Plazoleta** | **47 s** |
| 5 | B-210, con el pasillo elevado cerrado | B-210 → Escalera Oeste P2 → P1 → B Salida Oeste → **Plazoleta** | **72 s** |
| 6 | Aula **C-305** | C-305 → C-306 → … → C-310 → Escalera Oeste P3 → P2 → P1 → C Salida Oeste → **Parqueo Central** | **114 s** |

Las pruebas de `tests/test_backend.py` comprueban los casos 1, 2 y 3. También comprueban la numeración de las aulas, que las escaleras sean dirigidas (12 s / 18 s), el pasillo B–E y que los 134 vértices tengan una ruta segura.

## Cosas por decidir
- Dónde están de verdad las escaleras de B, C y P. El modelo supone una en cada extremo.
- Si las aulas de planta baja tienen puerta directa afuera. Hoy salen por las escaleras de su extremo.
- Los tiempos son estimados (con la distancia del mapa). Se pueden ajustar midiendo con cronómetro.
