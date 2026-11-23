# Propuesta de proyectos de implementación de estructuras de datos no lineales

## Integrantes del grupo

Br. James Santiago Fernandez Obregon

**Estructura de datos:** Grafos (dirigidos y ponderados)
**Nombre de la aplicación:** Unexuam
**Tipo de aplicación:** móvil (aplicación web móvil en Python con Flask)
**Dirigido a:** comunidad universitaria UAM

**Descripción o propósito de la aplicación:**

La propuesta consiste en un sistema de emergencia y evacuación Off-Grid para el campus de la UAM, desarrollado en Python como aplicación web móvil, pensado para cuando colapsan el internet y la red celular. Funciona con dos capas de grafos dirigidos y ponderados, construidas a mano con las clases `Vertex` y `Graph` vistas en clase. En la primera capa (comunicación), los teléfonos de los estudiantes son los vértices de una red Mesh simulada y cada enlace es una arista cuyo peso es el retardo en segundos. Una alerta de peligro salta de teléfono en teléfono mediante un recorrido BFS limitado por un TTL, que imita el reenvío tolerante a retardos (DTN): si un teléfono no tiene vecinos, guarda la alerta y la entrega cuando aparece un enlace nuevo. En la segunda capa (navegación física), los vértices son aulas, pasillos, escaleras, salidas y zonas seguras, y el peso de cada arista es el tiempo de paso. Las alertas recibidas aumentan esos pesos por congestión o peligro, o eliminan la arista si un pasillo queda bloqueado, y la aplicación recalcula la ruta de evacuación hacia la zona segura más cercana con el algoritmo de Dijkstra implementado a mano. El proyecto es un prototipo: la red Mesh se simula sobre el grafo, y la conexión real por Bluetooth Low Energy o Wi-Fi queda como trabajo futuro.
