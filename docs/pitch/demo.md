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
| 0:45 | Pestaña **Campus**. *Estoy en…* = **P-309** | «Ahora soy un estudiante en el aula P-309, tercer piso del Edificio P.» | Ruta: P-309 → P Pabellón Oeste P3 → P Escalera Oeste P3 → P2 → P1 → P Salida Oeste → Punto Seguro Parqueo Oeste, **77 s**. |
| 1:05 | Incidentes → **Bloquear pasillo**. Paso = **P Escalera Oeste P3 → P Escalera Oeste P2 (12 s)**, con «sentido contrario» marcado. **Bloquear (eliminarArista)** | «Se bloquea la escalera oeste entre el piso 3 y el 2.» | Ruta: P-309 → P Pabellón Oeste P3 → P Pabellón Este P3 → P Escalera Este P3 → P2 → P1 → P Salida Este → Punto Seguro Parqueo Edificio P, **136 s**. |
| 1:25 | **Reabrir pasos**. Luego Incidentes → **Congestión**. Lugar = **Punto Seguro Parqueo Oeste**, **×5**, **Aplicar alerta (aplicarAlerta)** | «Reabro la escalera. Ahora llega la alerta de que el Parqueo Oeste está saturado.» | Primero vuelve la ruta de 77 s; tras la alerta: … → P Salida Oeste → Punto Seguro Parqueo Sur, **99 s**. |
| 2:00 | Volver al deck (→) | | |

Si sobra tiempo: *Estoy en…* = **B-210** → B Pabellón Oeste P2 → pasillo elevado → Edificio E → Plazoleta, **55 s**. Si se bloquea **B Pabellón Oeste P2 → Edificio E** (con sentido contrario), sale por la escalera oeste del B a la Plazoleta en **80 s**.

Si el profe pide ver el CRUD: pestaña **Administrar** → Campus → *insertarVertice* («Aula 203») y *insertarArista dirigida* («Aula 203 → Pasillo B», 12). La lista de adyacencia de abajo muestra la tupla nueva.

### Cuentas de la demo (para responder si preguntan)

Verificado el 23/11 con el backend real (`backend/datos.py`, campus de la UAM con pabellones, commit 3d0442e; 150 vértices y 400 aristas):

- **P-309 normal:** 10 (aula → pabellón oeste) + 6 (pabellón → escalera) + 12 (piso 3 → 2) + 12 (piso 2 → 1) + 5 (escalera → salida) + 32 (salida → Parqueo Oeste) = **77**.
- **Escalera oeste P3 ↔ P2 cerrada:** 10 + 50 (pabellón oeste → pabellón este) + 6 + 12 + 12 + 5 + 41 (Salida Este → Parqueo Edificio P) = **136**.
- **Parqueo Oeste ×5:** 32 → 160, así que por ahí serían 225; Parqueo Sur 10 + 6 + 12 + 12 + 5 + 54 = **99**. Con ×2, ×3 o ×10 sale lo mismo.
- **B-210:** 8 + 15 + 32 = **55** por el pasillo elevado; sin él, 8 + 6 + 12 + 5 + 49 = **80**.
- Subir un piso cuesta 18 s y bajarlo 12 s.

Si cambias `backend/datos.py`, corrige a mano estos números, las diapositivas 8 y 9 (`CAMPUS` y `EDIF_P` en el script de `deck.html`) y `guion.md`.

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
| `02-ruta-p309.png` | Campus con *Estoy en… P-309* y la ruta de 77 s |
| `03-bloqueo.png` | Campus tras bloquear P Escalera Oeste P3 → P2, ruta de 136 s |
| `04-congestion.png` | Campus tras reabrir y Parqueo Oeste ×5, ruta de 99 s |

Tómalas con el **backend real** (no con el stub), en vista de teléfono, después de la última versión de `backend/datos.py`.
