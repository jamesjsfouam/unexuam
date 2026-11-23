# Guion Maestro · Pitch + Exposición Unexuam (10 min · versión exprés 4 min)

**Deck:** `docs/pitch/deck.html` (ábrelo en Chrome o Edge, sin internet).
**Atajos:** **F** pantalla completa · **→ / Espacio / clic** avanza paso · **←** retrocede · **N** notas · **T** cronómetro · **B** capturas Plan B · **R** vuelve.

*Lo que está en cursiva es lo que haces, no lo que dices. Los ▶ marcan cuándo pulsar → en las diapositivas con pasos.*

| # | Diapositiva | Tiempo (10 min) | Acumulado | Modo pitch rápido (4 min) |
|---|---|---|---|---|
| 1 | Portada · Gancho | 0:25 | 0:25 | Sí (0:25) |
| 2 | El problema | 0:40 | 1:05 | Sí (0:25) |
| 3 | La solución: dos capas | 0:40 | 1:45 | Sí (0:30) |
| 4 | Grafo dirigido y ponderado | 0:35 | 2:20 | Breve (0:15) |
| 5 | Capa 1: red Mesh | 0:35 | 2:55 | Saltar a slide 6 |
| 6 | BFS con TTL paso a paso | 1:10 | 4:05 | Solo resultado (0:20) |
| 7 | Capa 2: el campus real | 0:40 | 4:45 | Sí (0:25) |
| 8 | Dijkstra paso a paso (subgrafo B-210) | 1:25 | 6:10 | Resumir (0:20) |
| 9 | Campus real: evacuar P-309 | 0:45 | 6:55 | Saltar directo a demo |
| 10 | Demo en vivo (Web + App Android) | 2:10 | 9:05 | Sí (1:00) |
| 11 | Limitaciones y trabajo futuro | 0:35 | 9:40 | Breve (0:10) |
| 12 | Cierre | 0:20 | 10:00 | Sí (0:10) |

**Controles de tiempo:** si en la diapositiva 6 pasas de **3:30**, salta del paso 3 al resultado. Si al empezar la demo pasas de **7:30**, haz solo los pasos 1 a 3 (Mesh + P-309 + bloqueo).

---

## 1 · Portada y gancho (0:25)

Buenos días. Soy **James Fernández**.

Imaginen que ahora mismo tiembla fuerte aquí en la UAM. ¿Qué es lo primero que hacemos todos? Sacar el teléfono. Y en ese mismo segundo se satura la red celular y, si se va la luz, se cae el Wi-Fi del campus.

Para resolver exactamente ese escenario creé **Unexuam**: un sistema de evacuación **Off-Grid** para el campus real de la UAM, construido con **dos grafos dirigidos y ponderados hechos 100 % a mano en Python**, y empaquetado también como **app Android autónoma**.

---

## 2 · El problema (0:40)

En una emergencia sin internet ni señal celular aparecen dos problemas críticos al mismo tiempo:

1. **Comunicación:** ¿cómo se entera toda la comunidad universitaria de que hay peligro si nadie tiene señal?
2. **Navegación:** si estás en el tercer piso del Edificio P o del Edificio C, ¿por dónde sales si no sabes qué escalera se bloqueó ni cuál es la zona segura más cercana?

El objetivo de Unexuam es resolver ambos problemas **sin depender de ninguna infraestructura externa**.

---

## 3 · La solución: dos capas, dos grafos (0:40)

La solución acopla **dos capas de grafos** que reaccionan en cadena:

- **Capa 1 · Comunicación (Red Mesh simulada):** cada teléfono es un vértice y cada enlace es una arista cuyo peso es el retardo en segundos. Las alertas saltan de teléfono en teléfono usando **BFS limitado por TTL**.
- **Capa 2 · Navegación (Campus real de la UAM):** aulas, pabellones, escaleras, la pasarela del B, salidas y zonas seguras son vértices; cada paso es una arista cuyo peso es el tiempo caminando en segundos. Aquí **Dijkstra** calcula la ruta hacia la zona segura más cercana.

Lo clave es la conexión entre ambas capas: **cuando llega una alerta, modifica el grafo del campus** —cierra tramos o encarece zonas— y Dijkstra recalcula la ruta al instante.

---

## 4 · Grafo dirigido y ponderado (0:35)

Las dos capas usan exactamente las mismas clases implementadas a mano en Python, sin NetworkX ni librerías externas: `Vertex` (con `nombre` y `neig`, una lista de tuplas `(destino, peso)`) y `Graph` (con `vertexs`).

- Es **dirigido** porque la realidad no es simétrica: bajar un piso cuesta **12 segundos**, pero subirlo cuesta **18**; y en la red Mesh un teléfono puede escuchar a otro sin que ocurra al revés.
- Es **ponderado** porque no todos los pasos cuestan lo mismo.

Las operaciones CRUD (`insertarVertice`, `insertarArista`, `eliminarArista`, `eliminarVertice`, `actualizarPeso`) devuelven `True` o `False` y separan totalmente la lógica de grafos de la interfaz.

---

## 5 · Capa 1: Red Mesh (0:35)

Esta es la red Mesh de ejemplo: **8 teléfonos** y **13 enlaces dirigidos**. Las flechas dobles tienen pesos independientes en cada sentido (de Ana a Sofía 0.8 s, de vuelta 0.9 s), y Carlos → Pedro es unidireccional.

Esta lógica está inspirada en el protocolo Mesh de **SéTú**: cada alerta lleva un **TTL** que controla cuántos saltos puede dar y una lista de **visitados** para no rebotar ni duplicar paquetes. La cola DTN persistente para entregar cuando aparece un vecino nuevo queda planteada como trabajo futuro.

---

## 6 · BFS con TTL paso a paso (1:10)

Veamos cómo funciona cuando **Tel-Ana** emite una alerta con **TTL 2** (máximo 2 saltos):

▶ BFS usa una cola FIFO. Sale **Ana** en salto 0 y encola a **Luis** y **Sofía** en salto 1.
▶ Sale **Luis**. Su vecino Ana ya está visitado, así que no se repite; encola a **Carlos** en salto 2.
▶ Sale **Sofía** y encola a **María** en salto 2.
▶ Sale **Carlos**. Como su salto es 2 (igual al TTL), recibe la alerta pero **ya no la reenvía** a Pedro.
▶ Lo mismo ocurre con **María**. La cola queda vacía y el algoritmo termina.
▶ **Resultado:** llegan **5 de 8 teléfonos** con su número exacto de salto. Si subo el TTL a **5**, cubre los **8 teléfonos**. El TTL evita tormentas de reenvío y ahorro de batería en una red real.

---

## 7 · Capa 2: El campus real de la UAM (0:40)

Este es el **campus real de la UAM** modelado como grafo sobre el plano de OpenStreetMap:

- Afuera hay **44 lugares**: edificios, comedores, la **Pasarela frente al Edificio B** (con su escalera central bajando a la Plazoleta), salidas y parqueos.
- Por dentro, los edificios **B, C y P** se modelan piso por piso y aula por aula: dos pabellones (este y oeste), escaleras en ambos extremos y la **escalera central que une B y C hasta el tercer piso del C**.
- En total son **154 vértices**, **442 aristas dirigidas** y **12 zonas y puntos seguros**.

El peso de cada arista son segundos caminando (`distancia × 1.3 / 1.2 m/s`), y bajar un piso (12 s) cuesta distinto que subirlo (18 s).

---

## 8 · Dijkstra paso a paso · Subgrafo B-210 (1:25)

Con 154 vértices no se puede trazar Dijkstra a mano en pantalla, así que tomo un **subgrafo simplificado de 7 vértices alrededor del aula B-210** (2.º piso del B, sin la escalera central/pasarela) con los mismos pesos del backend. Al inicio, B-210 vale `0` y todo lo demás `∞`.

La regla de Dijkstra es una sola: elegir el vértice **no visitado con menor distancia** y relajar sus vecinos.

▶ **B-210 (0):** su pabellón oeste queda a `8`.
▶ **Pabellón oeste (8):** escalera P2 queda a `14` (`8+6`), y Edificio E (por el pasillo elevado) a `23` (`8+15`).
▶ **Escalera P2 (14):** bajar a P1 cuesta `12`, así que Escalera P1 queda a `26`.
▶ **Edificio E (23):** Plazoleta queda a `55` (`23+32`).
▶ **Escalera P1 (26):** Salida Oeste del B queda a `31` (`26+5`).
▶ **Salida Oeste (31):** por aquí la Plazoleta costaría `80` (`31+49`), peor que `55`, así que **no se actualiza**.
▶ Sale **Plazoleta con 55 s**: es el destino seguro más cercano en este subgrafo. *(Y en el campus completo, al existir la escalera central y la Pasarela del B, el backend baja todavía más la ruta a **46 s**).*

---

## 9 · Campus real: evacuar el aula P-309 (0:45)

Ahora el mismo Dijkstra sobre los **154 vértices reales**, saliendo desde el aula **P-309** (tercer piso del Edificio P):

- **Ruta normal:** aula → pabellón oeste → escalera oeste P3 → P2 → P1 → salida oeste → **Punto Seguro Parqueo Oeste** en **77 segundos (1 min 17 s)**.
- ▶ **Bloqueo (`eliminarArista`):** si el sismo bloquea la escalera oeste entre P3 y P2, se elimina la arista. Dijkstra cruza al pabellón este, baja por la escalera este y sale al **Parqueo del Edificio P** en **136 segundos (2 min 16 s)**.
- ▶ **Congestión (`aplicarAlerta`):** reabrimos la escalera y llega una alerta de saturación ×5 en el Parqueo Oeste (32 s → 160 s). Dijkstra redirige solo al **Parqueo Sur** en **99 segundos (1 min 39 s)** — sin ningún caso especial programado.

---

## 10 · Demo en vivo (2:10)

*Abre `http://127.0.0.1:5000` (o muestra el **APK nativo de Android** corriendo en el teléfono sin PC ni internet). Destaca al inicio: «No se quedó en consola: es web móvil LAN y también APK nativo de Android con buscador rápido, guía por voz, vista 3D por pisos y mapa 3D interactivo con arrastrar y zoom».*

| Tiempo | Qué tocar | Qué decir | Qué debe verse |
|---|---|---|---|
| 0:00 | Pestaña **Red Mesh** → *Tel-Ana*, TTL **2** → **Emitir alerta** | «Tel-Ana emite con TTL 2: BFS propaga salto a salto sin repetir.» | **5 de 8 teléfonos** (Ana 0, Luis 1, Sofía 1, Carlos 2, María 2). |
| 0:25 | Subir TTL a **5** → **Emitir alerta** | «Con TTL 5, cubre toda la red.» | **8 de 8 teléfonos** (Pedro 3, Valeria 4, Diego 5). |
| 0:40 | Pestaña **Campus** → acceso rápido **P-309** *(o buscador)* | «Ahora estoy en P-309. Dijkstra calcula la ruta, los pisos en 3D y el mapa interactivo.» | **Parqueo Oeste · 1 min 17 s (77 s)** · 4 pasos. *(Opcional: tocar «🔊 Leer ruta» 3 s o hacer zoom en el mapa 3D).* |
| 1:05 | En el paso 2 → **Simular bloqueo** *(o Simulacro rápido en Inicio)* | «Se bloquea la escalera oeste: `eliminarArista` y Dijkstra recalcula solo.» | **Parqueo Edificio P · 2 min 16 s (136 s)** · `+59 s`. |
| 1:30 | **Reabrir pasos** → **Congestión** en *Parqueo Oeste* ×5 → **Aplicar alerta** | «El Parqueo Oeste se satura ×5: `aplicarAlerta` multiplica las entradas y cambia de destino.» | **Parqueo Sur · 1 min 39 s (99 s)** · `+22 s`. |
| 1:55 | *(Si sobra tiempo)* Acceso rápido **C-305** o **B-205** *(o CRUD en **Administrar**: insertar `Aula 203` → `B Pabellón Este P2`, peso 12)* | «Y en B y C usa la escalera central y la pasarela del B directo a la Plazoleta.» | **C-305: 58 s** · **B-205: 46 s** hacia Plazoleta. |

**Plan B (si falla algo en >15 s):** pulsa **B** en el deck para mostrar las capturas reales; **R** vuelve.

---

## 11 · Limitaciones, rigor técnico y trabajo futuro (0:35)

Para ser totalmente honesto con el alcance:
- Hoy es un **prototipo funcional**: la red Mesh está simulada sobre el grafo (sin radio Bluetooth/Wi-Fi Direct todavía) y los tiempos salen del plano de OpenStreetMap, no de medición con cronómetro.
- Toda la lógica de grafos está hecha a mano sin librerías externas y validada con **31 pruebas automatizadas** (`unittest`: 23 de backend + 8 de API, PWA y paridad del mapa).
- **Trabajo futuro:** integrar Bluetooth Low Energy / Wi-Fi Direct reales, cola DTN persistente, medición física de tiempos en el campus y flujo máximo para detectar cuellos de botella.

---

## 12 · Cierre (0:20)

En resumen: **dos grafos, dos algoritmos y cero dependencia de internet** —BFS con TTL para que todos se enteren, y Dijkstra para que todos sepan por dónde salir en la UAM, funcionando en web LAN y en un APK autónomo de Android.

Soy **James Fernández**, esto es **Unexuam**. Muchas gracias. ¿Preguntas?

---

## Respuestas rápidas para preguntas del jurado

- **¿Por qué Dijkstra y no BFS en el campus?** Porque cada tramo pesa distinto en segundos; BFS minimiza saltos, Dijkstra minimiza tiempo total.
- **¿Por qué grafo dirigido?** Escaleras asimétricas (12 s bajar vs 18 s subir), enlaces Mesh unidireccionales (`Carlos → Pedro`) y `aplicarAlerta` penaliza solo aristas que **entran** al peligro (no salir de él).
- **¿Complejidad?** BFS con listas: $O(V^2 + E)$ (bajaría a $O(V+E)$ con `deque` y `set`). Dijkstra sin heap: $O(V^2 + E)$, y `rutaEvacuacion` corre sobre 12 zonas ($V=154, E=442$).
- **¿Y si hay pesos negativos?** Dijkstra falla y habría que usar Bellman-Ford; aquí los tiempos y factores de congestión siempre son positivos.
- **¿Cómo funciona el APK sin la PC?** `mobile/preparar_web.py` exporta el grafo exacto de `backend/datos.py` y Capacitor empaqueta el frontend con el mismo motor de grafos offline y persistencia en `localStorage`.
