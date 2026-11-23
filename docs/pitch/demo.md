# Guion de la demo en vivo (2:00)

Se hace en la diapositiva 10. La web es la de `app.py` (Flask) con los grafos de `backend/datos.py`.

## Antes de la clase (preparación, 10 min)

1. En la laptop, desde la carpeta del proyecto:
   ```powershell
   python app.py
   ```
   Anota la dirección que imprime en «Desde el teléfono» (`http://<IP>:5000`).
2. Revisa en la consola que **no** salga la línea `AVISO: usando el STUB temporal`. Si sale, alguna función de `backend/` falta o falla, y la pantalla de Inicio lo dice en «Backend en uso».
3. Conecta el teléfono a la **misma red Wi-Fi** que la laptop y abre la dirección. Si la red de la UAM aísla los equipos entre sí, crea un punto de acceso desde el teléfono y conecta la laptop a él.
4. Ten abierta también `http://127.0.0.1:5000` en el navegador de la laptop como respaldo (se proyecta más fácil que el teléfono).
5. Pulsa **Reiniciar la demo** (pantalla Inicio) para empezar con los grafos de ejemplo.
6. Deja el deck abierto en la diapositiva 1 y la web en otra pestaña o ventana.

## Durante la demo

Narra lo que pasa en el grafo, no los botones.

| Tiempo | Qué tocar | Qué decir | Qué debe verse |
|---|---|---|---|
| 0:00 | Pestaña **Red Mesh** | «Esta es la red de ocho teléfonos que vimos.» | El grafo de la Mesh. |
| 0:10 | *Emitir desde* = **Tel-Ana**. TTL con **−** hasta **2**. **Emitir alerta** | «La misma alerta del ejemplo, con TTL 2.» | Mensaje: «llegó a 5 de 8 teléfonos». Recorrido: Ana 0, Luis 1, Sofía 1, Carlos 2, María 2. |
| 0:30 | TTL con **+** hasta **5**. **Emitir alerta** | «Si dejo que dé más saltos, llega a todos.» | «llegó a 8 de 8 teléfonos». Pedro 3, Valeria 4, Diego 5. |
| 0:45 | Pestaña **Campus**. *Estoy en…* = **Aula 201** | «Ahora soy un estudiante en el Aula 201.» | Ruta: Aula 201 → Pasillo B → Escalera Norte → Pasillo A → Salida Principal → Zona Segura Cancha, **65 s**. |
| 1:05 | Incidentes → **Congestión**. Lugar = **Escalera Norte**, **×3**, **Aplicar alerta (aplicarAlerta)** | «Llega la alerta de humo en la Escalera Norte.» | La ruta cambia a Pasillo B → Escalera Sur → Salida Este → Zona Segura Parqueo, **77 s**. |
| 1:25 | Incidentes → **Bloquear pasillo**. Paso = **Escalera Sur → Salida Este**, con «sentido contrario» marcado. **Bloquear (eliminarArista)** | «Y si además se bloquea la salida de la Escalera Sur, elimino esa arista.» | Vuelve a la Cancha por la Escalera Norte aunque haya humo: **81 s**. Es la única ruta que queda razonable. |
| 1:45 | **Reabrir pasos** | «Al reabrir, vuelvo a insertar las aristas con su peso original.» | Vuelve la ruta de 77 s (la congestión sigue aplicada). |
| 2:00 | Volver al deck (→) | | |

Si sobra tiempo o el profe pide ver el CRUD: pestaña **Administrar** → Campus → *insertarVertice* («Aula 203») y *insertarArista dirigida* («Aula 203 → Pasillo B», 12). La lista de adyacencia de abajo muestra la tupla nueva.

### Cuentas de la demo (para responder si preguntan)

- Aula 201 sin alertas: Cancha 10 + 8 + 15 + 12 + 20 = **65**; Parqueo 10 + 20 + 22 + 25 = 77.
- Escalera Norte ×3 (8 → 24 y 25 → 75): Cancha 10 + 24 + 15 + 12 + 20 = 81; Parqueo por Escalera Sur **77** → gana Parqueo.
- Además Escalera Sur ↔ Salida Este bloqueado: Parqueo por Pasillo A 10 + 24 + 15 + 40 + 25 = 114; Cancha **81** → gana Cancha.

Verificado el 22/11 con el backend real (`backend/datos.py`, `evacuacion.py` y `mesh.py`): da exactamente estos números. Si cambias los pesos de `backend/datos.py`, cambia la lista `CAMPUS.edges` al inicio del script de `deck.html`: el paso a paso, la alerta y los números de la diapositiva de demo se recalculan solos. Las cifras de este archivo y de `guion.md` sí hay que corregirlas a mano.

## Plan B: si algo falla

Regla: si la web no responde en **15 segundos**, no depures delante del profe. Di «para no perder tiempo, lo muestro con capturas de la misma ejecución» y pulsa **B** en el deck. Las cuatro capturas siguen el mismo orden que la tabla de arriba; **R** vuelve a la diapositiva de la demo y **→** desde ahí sigue a «Limitaciones».

| Falla | Qué hacer |
|---|---|
| El teléfono no abre la página | Usa la pestaña `127.0.0.1:5000` de la laptop. |
| La laptop tampoco | Plan B con capturas. |
| La ruta o los números no coinciden con el deck | Di los números que salen en pantalla, no los del deck. Después revisa que `backend/datos.py` no haya cambiado. |
| Sale un error del backend en «Actividad» | Plan B. La app no se cae: `app.py` captura el error. |

### Capturas

Se guardan en `docs/pitch/capturas/` con estos nombres exactos (el deck las carga solo; mientras falten, muestra un aviso):

| Archivo | Pantalla |
|---|---|
| `01-alerta-mesh.png` | Red Mesh tras emitir desde Tel-Ana con TTL 2 (con el recorrido visible) |
| `02-ruta-aula201.png` | Campus con *Estoy en… Aula 201* y la ruta de 65 s |
| `03-congestion.png` | Campus tras Escalera Norte ×3, ruta de 77 s |
| `04-bloqueo.png` | Campus tras bloquear Escalera Sur → Salida Este, ruta de 81 s |

Tómalas con el **backend real** (no con el stub), en vista de teléfono, después de la última versión de `backend/datos.py`.
