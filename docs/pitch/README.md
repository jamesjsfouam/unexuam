# Pitch y exposición (10 min)

| Archivo | Para qué |
|---|---|
| `deck.html` | Diapositivas. Ábrelas en Chrome o Edge, sin internet. **F** pantalla completa, **→** avanza, **N** notas, **T** cronómetro, **B** capturas del plan B, **R** vuelve. |
| `guion.md` | Qué decir en cada diapositiva, con tiempos. |
| `demo.md` | Qué tocar en la web durante la demo, cuentas de los números y plan B. |
| `preguntas.md` | 10 preguntas probables sobre grafos, con respuestas. |
| `capturas/` | Capturas del plan B (ver `demo.md`). Mientras falten, el deck muestra un aviso. |

**Datos:** las diapositivas 7 y 9 y la demo usan el campus real de `backend/datos.py` (134 vértices), verificado el 23/11: P-309 → 67 s; escalera oeste cerrada → 156 s; Parqueo Oeste ×5 → 89 s. La diapositiva 8 es un ejemplo pequeño de 14 lugares para seguir Dijkstra paso a paso (sus datos están en `CAMPUS.edges`, dentro del deck). Si cambia el backend, corrige `EDIF_P` en el deck, `guion.md` y `demo.md`.
