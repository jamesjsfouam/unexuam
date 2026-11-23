# Preguntas probables del profe (y cómo responderlas)

Responde primero con una frase directa y después da el detalle si te lo piden. Si no sabes algo, dilo: «eso no lo implementé, pero lo haría así…».

> **Antes de exponer, revisa las preguntas 3 y 7** contra tu código final de `backend/`: dependen de cómo escribiste la cola del BFS y la búsqueda del mínimo en Dijkstra.

---

### 1. ¿Por qué usaste BFS y no DFS para propagar la alerta?

Porque BFS avanza **por niveles**: primero todos los teléfonos a un salto, luego todos los de dos saltos. Eso es exactamente lo que hace una alerta real, que se difunde a todos los vecinos a la vez, y además me da el número de salto de cada teléfono, que es lo que necesito para cortar con el TTL. Un DFS se iría hasta el fondo por una sola rama: con TTL 2 podría marcar un teléfono como «salto 2» cuando en realidad estaba a 1 salto por otro camino, y lo dejaría fuera por error.

### 2. Las aristas de la Mesh tienen peso, pero el BFS no lo usa. ¿Para qué está el peso?

El BFS cuenta **saltos**, porque el TTL es un límite de saltos, igual que en SéTú y en los protocolos de red reales. El peso (retardo en segundos) describe la calidad del enlace: se muestra en el mapa y es lo que usaría para calcular **cuánto tarda** la alerta en llegar a cada teléfono, que es un Dijkstra sobre la capa 1. Lo dejé como trabajo futuro porque la pregunta de la capa 1 es «¿quién se entera?», no «¿cuándo?».

### 3. ¿Cuál es la complejidad de tus algoritmos?

- **BFS:** el recorrido es O(V + E): cada teléfono entra a la cola una sola vez y cada arista se mira una vez. En mi código la cola es una lista con `pop(0)` y `visitados` también es una lista, y las dos operaciones cuestan O(V), así que en la práctica queda en **O(V² + E)**. Con `collections.deque` (`popleft()` es O(1)) y un `set` para visitados bajaría a O(V + E). Lo dejé con listas para seguir el estilo del curso; con 8 teléfonos no se nota.
- **Dijkstra:** busco el mínimo recorriendo los no visitados, así que es **O(V² + E)**. Con un montículo (`heapq`) sería O((V + E) log V). Para un campus de decenas de lugares la diferencia no se nota; para miles sí.
- **Evacuación:** `rutaEvacuacion` corre un Dijkstra por cada zona segura, o sea O(Z · (V² + E)) con Z destinos seguros (aquí Z = 12, V = 150, E = 400).
- **Memoria:** O(V + E) por usar lista de adyacencia.

### 4. ¿Por qué Dijkstra y no BFS para la ruta de evacuación?

Porque los pasos **no cuestan lo mismo**. BFS encuentra el camino con menos aristas, y el camino con menos aristas no siempre es el más rápido: una escalera puede ser un solo paso pero costar mucho tiempo. Dijkstra minimiza la **suma de pesos**, que aquí son segundos.

### 5. ¿Por qué funciona Dijkstra? ¿Qué pasaría con pesos negativos?

Funciona porque, cuando saco el vértice no visitado con menor distancia, ningún otro camino puede mejorarla después: cualquier otro camino pasa por un vértice que ya está a igual o mayor distancia, y sumar pesos **no negativos** solo lo hace más largo. Con un peso negativo esa garantía se rompe y habría que usar Bellman-Ford. En este problema no puede pasar: un tiempo de caminata nunca es negativo, y `aplicarAlerta` multiplica por un factor positivo.

### 6. ¿Por qué el grafo es dirigido? ¿No sería más simple no dirigido?

Porque la realidad no es simétrica. En el campus, bajar un piso cuesta 12 s y subirlo 18 s: son dos aristas distintas entre las mismas escaleras. En la Mesh, que un teléfono oiga a otro no garantiza lo contrario (distinta potencia o batería), por eso Carlos → Pedro va en un solo sentido. Además, `aplicarAlerta` multiplica solo las aristas que **entran** al lugar peligroso: salir de él no debe penalizarse, porque precisamente quiero que la gente salga.

### 7. ¿Cómo encuentras la zona segura más cercana si hay varias?

`rutaEvacuacion` llama a `rutaMasCorta` para cada zona segura y se queda con la de menor tiempo. Funciona, pero repite trabajo: Dijkstra ya calcula la distancia a **todos** los vértices, así que bastaría una sola corrida desde mi ubicación y comparar las zonas. Y se podría parar en cuanto sale la primera zona segura, porque esa ya es la más cercana; así lo muestra la diapositiva del paso a paso.

Si preguntan cómo hacerlo para **todo el campus** a la vez: se invierte el grafo (se da vuelta cada arista) y se corre un solo Dijkstra que empieza en todas las zonas seguras con distancia 0. Así se obtiene la distancia de cada lugar a su zona más cercana en una sola pasada.

### 8. ¿Qué pasa si no hay ruta, por ejemplo si se bloquean todos los pasillos?

La distancia a todas las zonas se queda en infinito y `rutaMasCorta` devuelve `([], inf)`. La web lo muestra como «no hay ruta a ninguna zona segura» en vez de inventar una. En la vida real esa persona tendría que quedarse en un lugar protegido y esperar ayuda, y sería justo el caso en que la alerta Mesh sirve para pedirla.

### 9. ¿Por qué lista de adyacencia y no matriz de adyacencia?

Porque el grafo es **disperso**: cada lugar se conecta con 2 o 3 vecinos, no con todos. La lista usa memoria O(V + E) y recorrer los vecinos de un vértice cuesta solo lo que tiene; la matriz gasta O(V²) aunque casi toda esté vacía, y recorrer vecinos siempre cuesta O(V). Además es la estructura que pidió el curso: `neig` como lista de tuplas `(Vertex, peso)`.

### 10. ¿Cómo evitas que la alerta dé vueltas en un ciclo (Ana → Luis → Ana…)?

Con dos cosas. La lista de **visitados**: un teléfono que ya tiene la alerta no se vuelve a encolar; es lo mismo que la lista de paquetes vistos (`_seenPacketIds`) de SéTú. Y el **TTL**, que limita cuántos saltos da aunque la red sea enorme. En una red real el TTL también ahorra batería y evita saturar el canal.

---

## Preguntas de contexto (por si acaso)

**«La propuesta decía NetworkX, Bluetooth y flujo máximo. ¿Qué cambió?»**
El objetivo del curso es implementar la estructura, así que escribí los algoritmos a mano sobre las clases `Graph` y `Vertex` del curso en vez de usar NetworkX. Bluetooth real y flujo máximo quedaron como trabajo futuro para tener una base sólida y probada en el plazo.

**«¿Qué es DTN?»**
*Delay-Tolerant Networking*, redes tolerantes a retardos: si un teléfono no tiene a quién reenviar, **guarda** la alerta y la entrega cuando aparece un vecino, en vez de descartarla. SéTú lo hace con su cola. En este prototipo **no está implementado**: el BFS simula un instante, y la cola DTN queda como trabajo futuro. Se haría guardando la alerta en los teléfonos sin vecinos y reenviándola cuando `insertarArista` les cree uno.

**«En clase el atributo se llama `city`. ¿Por qué el tuyo se llama `nombre`?»**
Porque aquí los vértices no son ciudades: son teléfonos y lugares del campus. Solo cambié el nombre del atributo para que el código se lea mejor; la estructura es exactamente la del curso: `vertexs`, `neig` como lista de tuplas `(Vertex, peso)` y los mismos métodos, que devuelven `bool`.

**«¿Qué hace `eliminarVertice` con las aristas que llegan a ese vértice?»**
Recorre todos los vértices y filtra de su `neig` las tuplas cuyo destino es el vértice eliminado; luego vacía su propia lista y lo quita de `vertexs`. Si no lo hiciera, quedarían aristas apuntando a un vértice que ya no existe.
