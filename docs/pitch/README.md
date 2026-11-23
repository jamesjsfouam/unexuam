# Pitch y exposición (10 min)

| Archivo | Para qué |
|---|---|
| `deck.html` | Diapositivas. Ábrelas en Chrome o Edge, sin internet. **F** pantalla completa, **→** avanza, **N** notas, **T** cronómetro, **B** capturas del plan B, **R** vuelve. |
| `guion.md` | Qué decir en cada diapositiva, con tiempos. |
| `demo.md` | Qué tocar en la web durante la demo, cuentas de los números y plan B. |
| `preguntas.md` | 10 preguntas probables sobre grafos, con respuestas. |
| `capturas/` | Capturas del plan B (ver `demo.md`). Mientras falten, el deck muestra un aviso. |

**Antes de exponer:** confirma que los pesos de `CAMPUS.edges` (al inicio del script de `deck.html`) son los mismos que los de `backend/datos.py`. El deck recalcula Dijkstra y la alerta a partir de esa lista; los números escritos en `guion.md` y `demo.md` hay que corregirlos a mano si cambian.
