# Guion hablado · 10 minutos

Deck: `docs/pitch/deck.html` (ábrelo en Chrome o Edge, tecla **F** para pantalla completa).
Teclas: **→ / Espacio / clic** avanza un paso, **←** retrocede, **N** muestra estas notas resumidas, **T** cronómetro (se pone rojo pasados los 10 min), **B** capturas del plan B, **R** vuelve.

Ritmo de referencia: unas 130 palabras por minuto. Lo que está en *cursiva* es lo que haces, no lo que dices. Los ▶ marcan cuándo pulsar → en las diapositivas con pasos.

| # | Diapositiva | Tiempo | Acumulado |
|---|---|---|---|
| 1 | Portada | 0:20 | 0:20 |
| 2 | El problema | 0:45 | 1:05 |
| 3 | La solución: dos capas | 0:40 | 1:45 |
| 4 | Grafo dirigido y ponderado | 0:35 | 2:20 |
| 5 | Capa 1: red Mesh | 0:40 | 3:00 |
| 6 | BFS con TTL paso a paso | 1:15 | 4:15 |
| 7 | Capa 2: el campus real | 0:35 | 4:50 |
| 8 | Dijkstra paso a paso (ejemplo pequeño) | 1:30 | 6:20 |
| 9 | Campus real: evacuar el aula P-309 | 0:45 | 7:05 |
| 10 | Demo en vivo | 2:00 | 9:05 |
| 11 | Limitaciones y trabajo futuro | 0:40 | 9:45 |
| 12 | Cierre | 0:15 | 10:00 |

**Controles de tiempo:** si al llegar a la diapositiva 6 vas por encima de 3:30, acorta el BFS (salta del paso 3 al resultado). Si al empezar la demo vas por encima de 7:30, haz solo los pasos 1 a 3 de la demo.

---

## 1 · Portada (0:20)

Buenos días. Soy James Fernández. Mi proyecto se llama **Unexuam**: es un sistema de evacuación *off-grid* para el campus de la UAM. Usa dos grafos dirigidos y ponderados para avisar de una emergencia y guiar a la gente a una zona segura, sin internet y sin red celular.

## 2 · El problema (0:45)

Imaginen un sismo a media mañana. Lo primero que hacemos es sacar el teléfono, y justo en ese momento la red celular se satura porque todos llaman a la vez. Si se va la luz, el Wi-Fi del campus también se cae.

Entonces tenemos dos problemas. Uno de **comunicación**: ¿cómo se entera todo el mundo de que hay peligro? Y otro de **navegación**: ¿por dónde salgo, si no sé qué pasillo está bloqueado ni cuál es la salida más rápida desde mi aula?

La pregunta del proyecto es esa: avisar y guiar sin depender de ninguna infraestructura.

## 3 · La solución: dos capas (0:40)

La solución tiene dos capas, y cada una es un grafo.

La primera es la **comunicación**: los teléfonos son vértices y los enlaces entre ellos son aristas, con el retardo como peso. La alerta salta de teléfono en teléfono con un BFS limitado por TTL.

La segunda es la **navegación**: aulas, pasillos, escaleras y salidas son vértices, y cada paso es una arista cuyo peso son los segundos que se tarda en caminar. Ahí uso Dijkstra para encontrar la zona segura más cercana.

Y lo importante es la flecha del medio: cuando la alerta llega, cambia los pesos del mapa y la ruta se recalcula.

## 4 · Grafo dirigido y ponderado (0:35)

Las dos capas usan las mismas clases del curso: `Vertex`, con su nombre y su lista de vecinos, y `Graph`, con la lista de vértices. Cada vecino es una tupla con el vértice destino y el peso.

Es **dirigido** porque en la realidad no es simétrico: bajar una escalera es más rápido que subirla, y un teléfono puede recibir la señal de otro sin que el otro lo reciba a él. Es **ponderado** porque no todos los pasos cuestan lo mismo. Las operaciones de insertar, eliminar y actualizar devuelven verdadero o falso y no imprimen nada.

## 5 · Capa 1: red Mesh (0:40)

Esta es la red de ejemplo: ocho teléfonos. Las flechas dobles son enlaces de ida y vuelta, y fíjense que pueden tener pesos distintos: de Ana a Sofía son 0.8 segundos y de vuelta 0.9. Carlos a Pedro, en cambio, solo va en un sentido.

La lógica no la inventé de cero. Viene de **SéTú**, una app que estoy desarrollando con una red Mesh real en Flutter. Allá cada paquete lleva un TTL que baja en cada salto y una lista de paquetes ya vistos para no repetir. Aquí traduje esa lógica a Python sobre el grafo. La cola para entregar cuando aparece un vecino nuevo quedó como trabajo futuro.

## 6 · BFS con TTL paso a paso (1:15)

Veamos un ejemplo. Tel-Ana emite una alerta con TTL 2: puede llegar como mucho a dos saltos.

▶ El BFS usa una cola. Ana sale primero, salto 0. Recorro su lista de vecinos y encolo a Luis y a Sofía con salto 1.

▶ Sale Luis. Su vecino Ana ya está visitada, así que no la repito; eso es lo mismo que la lista de paquetes vistos de SéTú. Encolo a Carlos con salto 2.

▶ Sale Sofía y encola a María, también con salto 2.

▶ Sale Carlos. Su salto es 2, igual al TTL: recibe la alerta pero **ya no la reenvía**. Por eso Pedro no se entera por este lado.

▶ Lo mismo con María. La cola queda vacía y el BFS termina.

▶ Resultado: la alerta llegó a 5 de 8 teléfonos, y la función devuelve cada teléfono con su número de salto. Si subo el TTL a 5, llega a los ocho. El TTL sirve para que la alerta no rebote para siempre gastando batería en una red real.

## 7 · Capa 2: el campus real (0:35)

Este es el campus real de la UAM como grafo, sacado del plano. Afuera hay 43 lugares: edificios, comedores, salidas y parqueos. Por dentro de los edificios B, C y P, cada aula y cada escalera es un vértice. En total son 134 vértices y 368 aristas dirigidas.

El peso son los segundos a pie: la distancia del mapa por 1.3, porque los caminos no son rectos, dividida entre 1.2 metros por segundo. Hay 12 destinos seguros, entre zonas y parqueos, y Dijkstra elige el más cercano.

Y aquí se ve por qué tiene que ser dirigido: bajar un piso cuesta 12 segundos y subirlo 18.

## 8 · Dijkstra paso a paso (1:30)

Con 134 vértices no se puede seguir Dijkstra a mano, así que para ver cada paso uso un ejemplo pequeño: un edificio de dos pisos con 14 lugares. La pregunta: estoy en el Aula 201, ¿cuál es la salida más rápida? Al inicio, la distancia al Aula 201 es 0 y a todo lo demás infinito.

La regla de Dijkstra es una sola: tomo el vértice **no visitado con la menor distancia** y reviso sus aristas. Si llegar por él es más barato, actualizo la distancia y anoto de dónde vine.

*(Son 11 pasos: pulsa → a buen ritmo, unos 6 segundos por paso, y narra solo los que importan.)*

▶ Aula 201: el Pasillo B queda a 10.
▶ Pasillo B: Escalera Norte a 18, Escalera Sur a 30, y las aulas vecinas.
▶ Escalera Norte, la menor con 18: el Pasillo A queda a 18 más 15, 33.
▶ Aula 202 y Biblioteca no mejoran nada. ▶ Escalera Sur, con 30: Salida Este a 52.
▶ Pasillo A, con 33: Salida Principal a 45. Por aquí la Salida Este costaría 73, peor que 52, así que no se toca.
▶ Las aulas del piso 1 no mejoran nada. ▶ Salida Principal, con 45: la Cancha queda a 65 y el Parqueo a 105.
▶ Cafetería, nada. ▶ Salida Este, con 52: el Parqueo baja de 105 a 77. **Esto es lo que hace Dijkstra: corrige una distancia cuando encuentra un camino mejor.**
▶ Sale la Cancha con 65. Como es la primera zona segura que sale, es la más cercana.

La ruta se reconstruye hacia atrás con la tabla de "de dónde vine": Aula 201, Pasillo B, Escalera Norte, Pasillo A, Salida Principal, Cancha. 65 segundos. Esto funciona porque ningún peso es negativo.

## 9 · Campus real: evacuar el aula P-309 (0:45)

Ahora el mismo algoritmo sobre el campus real. Estoy en el aula P-309, en el tercer piso del Edificio P. Dijkstra me baja por la escalera oeste y me manda al Parqueo Oeste: 6 más 12, más 12, más 5, más 32, **67 segundos**.

▶ Primera forma en que una alerta cambia el mapa: **cerrar** algo. Si la escalera oeste se bloquea entre el piso 3 y el 2, uso `eliminarArista`. Dijkstra ya no la ve: cruza todo el pasillo hasta P-301, baja por la escalera este y llega al Parqueo del Edificio P en **156 segundos**.

▶ Segunda forma: **encarecer** algo. Reabro la escalera, y por la Mesh llega la alerta de que el Parqueo Oeste está saturado. `aplicarAlerta` multiplica por 5 el costo de entrar: de 32 pasa a 160. Dijkstra cambia de destino solo: Parqueo Sur, **89 segundos**. No programé ningún caso especial: el algoritmo simplemente ve otros pesos.

## 10 · Demo en vivo (2:00)

Ahora lo muestro funcionando. *(Seguir `demo.md`.)*

## 11 · Limitaciones y trabajo futuro (0:40)

Quiero ser honesto con lo que es y no es. Es un prototipo: la red Mesh está **simulada** con el grafo, no hay radio de verdad. Los pesos salen de la distancia del mapa, no de medir con cronómetro, y supuse una escalera en cada extremo de B, C y P. Y el servidor corre en una laptop.

Lo siguiente es conectar Bluetooth real usando lo que ya diseñé en SéTú: la cola, el TTL y los acuses de que otro teléfono guardó la alerta. También, que cada teléfono calcule su propia ruta sin servidor, medir los tiempos con cronómetro y usar flujo máximo para detectar cuellos de botella.

## 12 · Cierre (0:15)

En resumen: dos grafos y dos algoritmos para una sola idea. BFS con TTL para que todos se enteren, Dijkstra para que todos salgan por la ruta más rápida. Muchas gracias. ¿Preguntas?
