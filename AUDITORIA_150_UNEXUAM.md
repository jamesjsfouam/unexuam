# AUDITORÍA FORENSE TOTAL PRE-PILOTO — UNEXUAM (30 BLOQUES / 150 MÓDULOS)

**Repositorio:** `c:\Nueva carpeta (7)\unexuam`  
**Comité Auditor:** 8 Perfiles Principal/Staff (Arquitecto Mobile & Offline-First, DBA Local & Cloud, Ingeniero Senior Mesh/P2P, Auditor AppSec & Privacidad, Director de Arte/UI/UX Anti-IA, Diseñador Sensorial, Lead UX Writer & A11y, Product Manager & QA Lead)  
**Reglas de Evidencia:** Cada hallazgo cita `Archivo:Línea`, evidencia exacta observada en el código, impacto real en piloto y solución técnica concreta. **Cero modificaciones al código fuente.**

---

## BLOQUE 1: DIRECCIÓN, VEREDICTO Y ESTRATEGIA DE PILOTO

### M1: Veredicto Go / No-Go definitivo
- **Veredicto:** **NO APTO / CONDICIONADO PARA PILOTO MASIVO HOY** (`No-Go` hasta resolver los 12 bloqueantes P0).
- **Justificación Ejecutiva:** Aunque la suite backend supera `68` pruebas unitarias/API (`tests/test_api.py`, `tests/test_backend.py`) en `11.65 s` y existe un binario release R8 (`app-release.apk` de `3,033,889` bytes / `2.89 MiB`), la experiencia real de campo falla en tres pilares críticos de emergencia:
  1. **Modo Offline/Mesh:** `mobile/motor-offline.js:392` provoca `TypeError` al acceder a `S.ubicaciones[v.nombre]` (propiedad inexistente) cuando un nodo tiene 0 aristas; `MainActivity.java:85-89` fuerza un `reload()` a los `1200 ms` rompiendo la inicialización JS; y `MeshForegroundService.java:30-34, 154-166` reinicia con `START_STICKY` sin instancia de `MeshNativa` ("Mesh fantasma").
  2. **Seguridad y Privacidad:** `firestore.rules:195-220, 240-250` expone `usuarios/{cif}` (incluyendo `sal` y `hash` PBKDF2), `mensajes/{msgId}` y `reportes_bloqueo/{repId}` con `read: if true` y escrituras no autenticadas; además `mobile/motor-offline.js:608, 735-772, 1399-1413` permite bloquear campus offline sin verificación de rol administrador.
  3. **Accesibilidad y Flujos Críticos de Usuario:** En modo oscuro (`frontend/static/app.css:68, 118, 907, 955, 1926, 2803, 2817`), `--blanco: #131c29` reduce el contraste a `3.80:1` / `3.15:1` y `.chat-lista` superpone un fondo claro opaco; en `frontend/static/cuenta.js:1054, 1537`, un invitado (`YO === null`) sufre `TypeError` en `elegirLugar()` y pierde silenciosamente el botón `SOS`.

### M2: Scorecard numérico (0–100) por eje
| Eje de Evaluación | Puntaje (0–100) | Estado | Evidencia Principal |
| :--- | :---: | :---: | :--- |
| **Estabilidad** | **42 / 100** | Crítico | `motor-offline.js:392` (`TypeError`), `MainActivity.java:85-89` (reload 1200ms), `cuenta.js:1054` (crash invitado) |
| **Base de Datos (Local & Cloud)** | **54 / 100** | Bajo | `basedatos.py:85-101` (`PRAGMA user_version = 0`, 2 `ResourceWarning`), `nube-firebase.js:226-231` (sin `orderBy`) |
| **Red Mesh P2P** | **38 / 100** | Crítico | `MeshForegroundService.java:30-34` (Mesh fantasma), `motor-offline.js:1640-1643` (tormenta `hello` 6s), `MeshNativa.java:56, 433-441` (`MAX_CONECTADOS = 4`) |
| **UI / UX & Accesibilidad** | **51 / 100** | Bajo | `app.css:68, 2817` (contraste dark mode), `cuenta.css:243-244` (`z-index` toast), `app.css:2995` (tap targets `< 44px`) |
| **Seguridad (AppSec & Privacidad)** | **31 / 100** | Crítico | `firestore.rules:195-220, 240-250` (PII y chats públicos), `MeshNativa.java:64` (HMAC hardcoded), `app.py:580-641` (sin rate-limit IP) |
| **Identidad Visual & Assets** | **62 / 100** | Medio | `frontend/static/img/` (`1,248.5 KB`, `0` WebP/AVIF, `ico-fuego.png` `1501x2108` para 44px, `mapa-campus-3d.svg` `274.28 KB`) |
| **Promedio Ponderado Global** | **46 / 100** | **NO-GO** | Bloqueantes P0 en ruta crítica de evacuación, Mesh y privacidad |

### M3: Lista de bloqueantes absolutos (P0) para el primer piloto
1. **P0-01:** `mobile/motor-offline.js:392` (`237-247, 436`) — `sinSenal` lee `S.ubicaciones[v.nombre]` en vez de `UBIC`; crash inmediato offline en nodos aislados.
2. **P0-02:** `MainActivity.java:81, 251, 260` + `MeshForegroundService.java:30-34, 154-166` — `MeshNativa` vive en `MainActivity`; `START_STICKY` revive servicio sin capa BLE/Nearby ("Mesh fantasma").
3. **P0-03:** `MainActivity.java:85-89` — `postDelayed(() -> reload(), 1200L)` reinicia el WebView en medio de `iniciarMeshReal()`.
4. **P0-04:** `mobile/motor-offline.js:1640-1643` + `MeshNativa.java:206-208` — Polling cada `6000 ms` resetea `meshIniciado = false` y dispara tormenta `enviarHelloATodos()`.
5. **P0-05:** `MeshNativa.java:64, 114-128, 552-563` — `HMAC_KEY` hardcodeada, `hello` sin firma y campos críticos (`accion`, `emergenciaTipo`, `titulo`, `ambos`, `incidente`, `ttl`, `ruta`) fuera del HMAC.
6. **P0-06:** `MeshNativa.java:56, 433-441, 494-496` — `MAX_CONECTADOS = 4` detiene discovery manteniendo advertising, formando islas incomunicadas.
7. **P0-07:** `MeshNativa.java:626-628` — Broadcasts (`TODOS`, `SOS`, `emergencia`, `bloqueo`) no se guardan en `bandeja` nativa; se pierden con WebView pausado.
8. **P0-08:** `firestore.rules:195-220, 240-250` — Lectura pública de `usuarios/{cif}`, `mensajes/{msgId}` y `reportes_bloqueo/{repId}`, más mutaciones sin autenticación.
9. **P0-09:** `mobile/motor-offline.js:608, 735-772, 1399-1413` — `/api/campus/bloquear` offline acepta mutaciones y propaga `accion:"bloquear"` sin rol admin.
10. **P0-10:** `frontend/static/cuenta.js:1054, 1537` — Invitado (`YO === null`) sufre `TypeError` en `elegirLugar()` y fallo silencioso en `enviarSOS()`.
11. **P0-11:** `frontend/static/app.css:68, 118, 907, 955, 1926, 2803, 2817` + `cuenta.css:579` — Contraste insuficiente en modo oscuro y fondo claro opaco en `.chat-lista`.
12. **P0-12:** `frontend/static/cuenta.js:1472, 1506` + `EmergencyAlertActivity.java:312-364` — `AudioContext` suspendido en alertas sin gesto previo y alarma nativa que ignora `prefs.tono`/`prefs.vibrar`.
*(Nota de distribución: `mobile/Unexuam.apk` sigue apuntando al APK debug de `9,610,061 B` con SHA `6D5C50F3...` en lugar de `app-release.apk` de `3,033,889 B`).*

### M4: Evaluación de riesgos operativos en campo
- **Riesgo de Pánico y Falsa Alarma (Alto):** Cualquier atacante o alumno sin privilegios puede inyectar bloqueos en Firestore (`firestore.rules:240-250`) o vía Mesh offline (`motor-offline.js:735-772`) y falsificar campos no firmados por HMAC (`MeshNativa.java:552-563`).
- **Riesgo de Partición Mesh en Simulacro (>15 personas) (Crítico):** Con `MAX_CONECTADOS = 4` (`MeshNativa.java:56`), los primeros 5 teléfonos forman una clica cerrada y rechazan al resto del edificio, mientras el loop de `6000 ms` (`motor-offline.js:1640-1643`) satura el canal BLE/Wi-Fi Direct.
- **Riesgo de Pérdida de Mensajes SOS en Bolsillo (Crítico):** Si el usuario bloquea la pantalla o Android mata el WebView, `MeshNativa.java:626-628` no persiste broadcasts `TODOS`/`SOS` en `bandeja`.
- **Riesgo de Distribución Errónea:** `mobile/Unexuam.apk` (`9.6 MB`, debug) puede instalarse por error en testers en vez de `app-release.apk` (`2.89 MB`, firmado release).

### M5: Criterios mínimos de éxito y métricas clave del piloto
- **Estabilidad:** `0` crashes JS/Java en 30 min de prueba continua con 15 dispositivos en modo avión + datos alternados; eliminación total del `reload(1200ms)`.
- **Latencia y Entrega Mesh:** Entrega de broadcast `emergencia` / `SOS` a >= 90% de nodos en <= 12 s con 2 saltos sin tormenta `hello`.
- **Seguridad:** `0` colecciones con PII (`usuarios`, `mensajes`) legibles por anónimos en `firestore.rules`; 100% de payloads Mesh críticos cubiertos por HMAC y validación de rol.
- **Accesibilidad:** Contraste >= 4.5:1 en modo claro y oscuro; tap targets >= 44x44 px en mapa y banners.

---

## BLOQUE 2: PRODUCTO, BRECHAS FUNCIONALES Y NUEVAS FUNCIONES

### M6: Funciones críticas faltantes (*Must-Have*) pre-piloto
1. **Respaldo de broadcasts en `bandeja` nativa y reintento al reabrir WebView** (`MeshNativa.java:626-628`): sin esto, una alerta recibida con pantalla apagada desaparece.
2. **Flujo funcional completo para Invitados en Emergencia** (`cuenta.js:1054, 1537`): un estudiante sin cuenta debe poder marcar ubicación y disparar SOS con ID efímero único en vez de colisionar con `"INVITADO"` (`MeshNativa.java:462`, `motor-offline.js:1485`).
3. **Verificación de permiso Android 14 `canUseFullScreenIntent()`** (`AndroidManifest.xml:72, 75`, `EmergencyAlertActivity.java`): sin solicitud guiada en ajustes del dispositivo, la pantalla completa de emergencia no se mostrará sobre pantalla bloqueada en Android 14+.
4. **Cierre limpio de conexiones SQLite** (`basedatos.py`): eliminar `ResourceWarning` detectados en `tests/`.

### M7: *Quick Wins* de alto impacto y bajo esfuerzo
1. **Corregir `S.ubicaciones` -> `UBIC`** en `mobile/motor-offline.js:392` (1 línea, elimina crash P0).
2. **Eliminar `postDelayed(reload, 1200L)`** en `MainActivity.java:85-89` (5 líneas, elimina race condition de arranque).
3. **Mover `prefs.tono`/`prefs.vibrar`** a `EmergencyAlertActivity.java:312-364` y crear canal `"unexuam_emergencias"` en `UnexuamMessagingService.java:19, 66, 96`.
4. **Corregir `LUGARES_DESTACADOS`** en `app.js:1613, 1616` (`"Biblioteca"` -> `"Edificio I"`, `"Cafetería"` -> `"Food Court"` conforme a `backend/datos.py:103-104`).
5. **Reemplazar `mobile/Unexuam.apk` por copia de `app-release.apk`** (`2.89 MiB` vs `9.16 MiB`).
6. **Agregar `google-auth` a `requirements.txt`** para alinear con `app.py:926-931`.

### M8: Propuestas estratégicas para V2 basadas en la arquitectura actual
1. **Rotación de llaves efímeras de sesión Mesh por campus/día** derivadas vía Firebase Auth + backend Flask para retirar la `HMAC_KEY` estática (`MeshNativa.java:64`).
2. **Enrutamiento adaptativo DTN con TTL dinámico y tabla de vecinos con RSSI** aprovechando `Nearby Connections` para evitar desconexiones ciegas al llegar a `MAX_CONECTADOS`.
3. **Sincronización incremental por cursor (`ts > lastSync`)** en `nube-firebase.js:226-231` y `basedatos.py` en lugar de lecturas completas.

### M9: Detección de funciones sobrantes / *feature creep*
- **Banners y botones redundantes:** Ya detectado en feedback de campo previo; además existen activos huérfanos en `frontend/static/img/` (`tarjeta-auxilios.svg` `0.99 KB`, `tarjeta-sin-senal.svg` `1.05 KB`, `tarjeta-evacuar.jpg`, `ico-sin-senal.png`, `ico-pin.png`) que no aportan valor en DOM mientras sus equivalentes pesados `.jpg` (`164 KB` y `104 KB`) sí se cargan.
- **Endpoints públicos permisivos innecesarios:** `LIBRES` en `app.py:723-744` expone `/api/mensajes/general` sin sesión, ampliando superficie sin necesidad operativa si el piloto exige usuarios identificados o invitados controlados.

### M10: Auditoría de coherencia entre promesa de valor y ejecución real
- **Promesa:** *"Evacuación 3D offline-first con red Mesh P2P resiliente y alertas inmediatas."*
- **Realidad en código:**
  - *Offline-first:* Roto cuando un nodo no tiene aristas (`motor-offline.js:392`) o cuando `sw.js:4-45` omite `nube-firebase.js` e `i18n.js` en `ASSETS`.
  - *Mesh resiliente:* Roto al morir `MainActivity` (`MeshForegroundService.java:30-34`), en grupos >5 (`MeshNativa.java:56`), y cuando `motor-offline.js:1640-1643` reinicia el handshake cada 6 s.
  - *Alertas inmediatas:* Audio web bloqueado por política de autoplay (`cuenta.js:1472, 1506`) y canal FCM `"unexuam_emergencias"` no inicializado (`UnexuamMessagingService.java:19`).

---

## BLOQUE 3: ARQUITECTURA DE SOFTWARE Y ESTRUCTURA

### M11: Mapa de arquitectura actual y separación de capas
- **Backend (`app.py`, `basedatos.py`, `backend/*.py`):** Monolito Flask (`app.py` 1,287 L) con lógica de dominio de grafos/evacuación separada parcialmente en `backend/grafo.py` (77 L), `backend/datos.py` (257 L), `backend/evacuacion.py` (173 L), `backend/mensajeria.py` (77 L), `backend/menu.py` (106 L) y `backend/mesh.py` (26 L). Persistencia SQLite en `basedatos.py` (191 L).
- **Frontend (`frontend/templates/*.html`, `frontend/static/*.js`):** SPA vanilla sin bundler ni framework; `app.js` (2,396 L) y `cuenta.js` (1,865 L) mezclan manipulación DOM directa, llamadas `fetch`, estado global mutable (`S`, `YO`, `UBIC`) y lógica de audio/mapa.
- **Capa Nativa/Offline (`mobile/motor-offline.js`, `mobile/android/.../*.java`):** `motor-offline.js` (1,559 L) replica prácticamente todo el backend Python en JS interceptando `fetch`; `MainActivity.java` (545 L) actúa como puente Capacitor/WebView y propietario directo de `MeshNativa.java` (752 L).

### M12: Detección de acoplamiento fuerte UI ↔ negocio/red
- **`MainActivity.java:81, 251, 260` ↔ `MeshNativa.java`:** La capa de red P2P está atada al ciclo de vida de la Activity UI en lugar de vivir en un `Service` o `Application` singleton.
- **`cuenta.js:1054, 1537` ↔ Estado global `YO`:** La lógica de SOS y ubicación lee directamente la variable global mutable `YO` sin capa de repositorio o fallback de invitado.
- **`ajustes.js:187-244` ↔ DOM:** Cada pulsación en `#aj-q` reconstruye todo el `innerHTML` acoplando filtrado de datos con renderizado completo.

### M13: Organización de carpetas, convenciones y escalado
- **Duplicación de fuentes web:** Existe `frontend/static/` y una copia sincronizada en `mobile/android/app/src/main/assets/public/static/` generada por `mobile/preparar_web.py` (141 L) (verificado SHA-256 `8AE24FD7...` para `motor-offline.js`).
- **Archivos grandes sin modularizar:** `app.py` (1,287 L), `app.js` (2,396 L), `app.css` (2,685 L), `cuenta.js` (1,865 L), `cuenta.css` (2,217 L) y `docs/mapa-campus/generar_mapa.py` (1,328 L) dificultan merges en equipo.

### M14: Patrones de diseño e inyección de dependencias
- **Ausencia de DI:** Tanto `app.py` como `MeshNativa.java` y los módulos JS usan singletons globales implícitos (`S`, `YO`, `UBIC`, conexiones SQLite por función en `basedatos.py`).
- **Patrón Interceptador en Offline:** `motor-offline.js` implementa un mock/interceptor de `window.fetch` eficaz conceptualmente, pero sin contrato tipado compartido con `app.py`, generando divergencias de esquema (ej. `S.ubicaciones` vs `UBIC` en `motor-offline.js:392`, longitud de contraseña `4` vs `6` en `cuenta.js:517` vs `app.py:565`).

### M15: Modularidad y portabilidad (Android / iOS / Web)
- **Android-only en Mesh:** `MeshNativa.java` depende 100% de Google Nearby Connections (`com.google.android.gms:play-services-nearby`); no existe abstracción para iOS (`MultipeerConnectivity` / CoreBluetooth) ni fallback WebRTC/WebBluetooth en navegador puro.
- **PWA / Web:** `sw.js:4-45` omite `nube-firebase.js` e `i18n.js`, rompiendo paridad offline en navegador.

---

## BLOQUE 4: CALIDAD DE CÓDIGO Y DEUDA TÉCNICA

### M16: Inventario de archivos huérfanos y código muerto
- **Assets huérfanos en `frontend/static/img/`:**
  - `tarjeta-auxilios.svg` (`0.99 KB`) y `tarjeta-sin-senal.svg` (`1.05 KB`) no se usan mientras se cargan las versiones `.jpg` (`164 KB` y `104 KB`).
  - `tarjeta-evacuar.jpg`, `ico-sin-senal.png`, `ico-pin.png` sin referencias activas en el DOM.
- **Binario desactualizado:** `mobile/Unexuam.apk` (`9,610,061 B`, debug SHA `6D5C50F3...`) coexiste con `app-release.apk` (`3,033,889 B`), generando riesgo de entregar el build equivocado.

### M17: Lógica duplicada (violaciones DRY)
- **Motor Python vs JS:** `app.py` + `backend/*.py` y `mobile/motor-offline.js` duplican reglas de negocio (rutas, bloqueos, evacuación, validaciones). Ejemplo de desincronización: `cuenta.js:517` valida contraseña mínima de `4` caracteres mientras `app.py:565` exige `6`.
- **Catálogo de lugares:** `app.js:1613, 1616` hardcodea `"Biblioteca"` y `"Cafetería"` en `LUGARES_DESTACADOS`, duplicando y contradiciendo `backend/datos.py:103-104` (`"Edificio I"`, `"Food Court"`).

### M18: Archivos/funciones monolíticas y complejidad ciclomática
- `frontend/static/app.js` (2,396 L), `frontend/static/app.css` (2,685 L), `frontend/static/cuenta.css` (2,217 L), `frontend/static/cuenta.js` (1,865 L), `mobile/motor-offline.js` (1,559 L), `docs/mapa-campus/generar_mapa.py` (1,328 L), `app.py` (1,287 L), `MeshNativa.java` (752 L).
- **Impacto:** Cualquier cambio en CSS o flujo de cuenta requiere navegar >2,000 líneas con alto riesgo de colisión de `z-index` o regresiones visuales.

### M19: Auditoría de tipado estricto y contratos
- **Frontend JS sin TypeScript ni JSDoc estricto:** Propiedades dinámicas como `S.ubicaciones` (`motor-offline.js:392`) o `YO.lugar` (`cuenta.js:1054`) pasan sin detección hasta explotar en runtime.
- **Contratos JSON Mesh sin esquema:** `MeshNativa.java:552-563` serializa/deserializa payloads con campos opcionales no incluidos en el cálculo HMAC.

### M20: Deuda técnica comentada y código obsoleto
- **Fugas de diseño y configuración:** Restos de transición debug→release (`mobile/Unexuam.apk` debug en raíz móvil), referencias legacy en `LUGARES_DESTACADOS` (`app.js:1613, 1616`) y canales FCM sin inicializar (`UnexuamMessagingService.java:19, 66, 96`).
- **Solución:** Consolidar limpieza de artefactos en `mobile/preparar_web.py` y validar referencias de lugares contra `backend/datos.py` en CI.

---

## BLOQUE 5: GESTIÓN DE ESTADO Y CICLO DE VIDA MÓVIL

### M21: Flujo de estado global/local y estados duplicados
- **Estado fragmentado:** `S` y `UBIC` en `motor-offline.js:237-247, 436` conviven con `YO` y estado DOM en `cuenta.js` y `app.js`. La confusión entre `S.ubicaciones` y `UBIC` causa el crash P0 de `motor-offline.js:392`.
- **Re-render destructivo:** `ajustes.js:187-244` destruye y recrea nodos en cada tecleo sobre `#aj-q`, perdiendo foco o estado de scroll.

### M22: Efectos secundarios infinitos o sin limpieza
- **`motor-offline.js:1640-1643`:** `setInterval(..., 6000)` sin guarda de estado conectado resetea `meshIniciado = false` en `MeshNativa.java:206-208` y dispara `enviarHelloATodos()` cada 6 segundos indefinidamente.
- **`MainActivity.java:85-89`:** `Handler.postDelayed(..., 1200L)` no se cancela en `onDestroy()`, causando recarga tardía y fuga si la Activity se cierra antes de 1.2 s.

### M23: Fugas de memoria (*memory leaks*)
- **WebView + `Handler`:** `MainActivity.java:85-89` retiene implícitamente referencia a `this.bridge.getWebView()` dentro del `Runnable`.
- **Conexiones SQLite abiertas:** `basedatos.py` deja descriptores sin cerrar explícitamente, provocando 2 `ResourceWarning` en la corrida de `tests/`.
- **Listeners FCM/Firestore:** `nube-firebase.js` requiere asegurar `unsubscribe` único en reconexiones tras `reload()` del WebView.

### M24: Ciclo de vida móvil (background, suspensión y reactivación)
- **Destrucción de Mesh con la UI:** `MainActivity.java:81, 251, 260` enlaza la vida de `MeshNativa` a `MainActivity`; al destruirse la Activity, se detiene Mesh y el `ForegroundService`.
- **Reinicio roto del servicio:** `MeshForegroundService.java:30-34, 154-166` usa `START_STICKY`, por lo que Android lo recrea tras matarlo por memoria, pero sin `MeshNativa` adjunto ("Mesh fantasma" que muestra notificación activa sin transmitir ni recibir).

### M25: Persistencia de estado ante *process death*
- **Pérdida de alertas broadcast:** `MeshNativa.java:626-628` no inserta mensajes `TODOS`, `SOS`, `emergencia` ni `bloqueo` en la `bandeja` persistente nativa; si Android mató el WebView, la alerta recibida en Java se pierde antes de que JS vuelva a montar.

---

## BLOQUE 6: DEPENDENCIAS, LIBRERÍAS Y PESO DEL BUILD

### M26: Inventario de dependencias declaradas vs usadas
- **Faltante crítico en Python:** `app.py:926-931` importa `google.auth` (`find_spec('google.auth') == None` en entorno actual), pero `google-auth` **no** figura en `requirements.txt:1-171`.
- **Impacto:** Fallo al desplegar verificación de tokens Firebase/Google en un entorno limpio construido desde `requirements.txt`.

### M27: Detección de librerías duplicadas
- **Coexistencia de assets duplicados en repo:** `frontend/static/` + `mobile/android/app/src/main/assets/public/static/` (sincronizado vía `mobile/preparar_web.py`). No hay duplicación grave de librerías JS de terceros, pero sí duplicación de motores (`backend/*.py` vs `mobile/motor-offline.js`).

### M28: Paquetes obsoletos, deprecados o en conflicto
- **Mismatch de entorno Python (`requirements.txt` vs `app.py`):** `google-auth` ausente en `requirements.txt`.
- **API Android 14+ (`AndroidManifest.xml:72, 75`):** Uso de `USE_FULL_SCREEN_INTENT` sin chequeo de `NotificationManager.canUseFullScreenIntent()`, lo que en Android 14+ puede degradar la alerta a notificación silenciosa/heads-up si no es app de alarma/llamada aprobada o concedida por el usuario.

### M29: Análisis de peso del APK y assets
- **APK Release vs Debug:** `app-release.apk` optimizado con R8 pesa `3,033,889` bytes (`2.89 MiB`), mientras `mobile/Unexuam.apk` pesa `9,610,061` bytes (`9.16 MiB`, build debug SHA `6D5C50F3...`).
- **Peso de imágenes en `frontend/static/img/` (`1,248.5 KB` totales, `0` WebP/AVIF):**
  - `ico-fuego.png`: `1501x2108` px escalado a `44 px` en UI.
  - `tarjeta-auxilios.jpg` (`164 KB`) y `tarjeta-sin-senal.jpg` (`104 KB`) se cargan pese a existir `tarjeta-auxilios.svg` (`0.99 KB`) y `tarjeta-sin-senal.svg` (`1.05 KB`).
  - `mapa-campus-3d.svg`: `274.28 KB` con `2,315` nodos SVG, pesado para WebViews de gama baja.

### M30: Auditoría de configuración de build, `.gitignore` y scripts
- **Script de empaquetado (`mobile/preparar_web.py`):** Copia correctamente archivos web a `assets/public/static/` (SHA-256 `8AE24FD7...` verificado en `motor-offline.js`), pero no purga assets huérfanos ni reemplaza `mobile/Unexuam.apk` con el release firmado.
- **Riesgo de release:** Mantener `mobile/Unexuam.apk` como debug expone flags depurables y triplica el peso de descarga para testers.

---

## BLOQUE 7: MANEJO DE ERRORES Y RESILIENCIA ANTE CRASHES

### M31: Error Boundaries globales y por pantalla
- **Ausencia de manejador global UI en JS:** No existe un boundary unificado (`window.onerror` / `unhandledrejection` con fallback visual recuperable) que evite pantallas rotas ante excepciones como `S.ubicaciones[v.nombre]` (`motor-offline.js:392`) o `YO.lugar` (`cuenta.js:1054`).

### M32: Bloques `try/catch` vacíos o fallos silenciosos
- **`cuenta.js:1537`:** `enviarSOS()` retorna silenciosamente cuando `!YO`, dejando al usuario sin feedback ni alerta enviada.
- **`sw.js:96-106`:** `.catch(() => caches.match(...))` puede resolver a `undefined` si el recurso no está cacheado, provocando error de red no manejado en el navegador.

### M33: Excepciones asíncronas, promesas rechazadas y *timeouts*
- **`nube-firebase.js:226-231`:** Consultas a Firestore sin fallback de timeout ni ordenamiento explícito (`orderBy('ts')`) en `listarMensajes(60)`.
- **`MainActivity.java:85-89`:** Timer ciego de `1200 ms` para `reload()` en lugar de esperar evento de ciclo de vida/hidratación.

### M34: Datos corruptos y `null`/`undefined` inesperados
- **`motor-offline.js:392`:** `S.ubicaciones` es `undefined` en tiempo de ejecución; cualquier iteración sobre nodos sin aristas dispara `TypeError`.
- **`cuenta.js:1054`:** `elegirLugar()` asume `YO !== null` y falla con `TypeError` al leer `YO.lugar` en sesión de invitado.
- **`MeshNativa.java:552-563`:** Campos fuera de HMAC permiten payloads alterados sin rechazo criptográfico.

### M35: Recuperación automática tras fallo crítico
- **`MeshForegroundService.java:30-34, 154-166`:** Al intentar recuperarse con `START_STICKY` tras ser terminado por el OS, el servicio queda en estado zombi ("Mesh fantasma") sin recrear `MeshNativa`, requiriendo que el usuario mate y reabra la app manualmente.

---

## BLOQUE 8: BASE DE DATOS — ESQUEMA Y MODELADO

### M36: Auditoría completa del esquema local y remoto
- **Local SQLite (`basedatos.py:85-101`, `datos/unexuam.db`):** Tablas de usuarios, mensajes y reportes sin control de versión (`PRAGMA user_version = 0`).
- **Remoto Firestore (`firestore.rules:195-220, 240-250`, `nube-firebase.js`):** Colecciones `campus/estado`, `usuarios/{cif}`, `mensajes/{msgId}`, `reportes_bloqueo/{repId}`.

### M37: Llaves primarias, foráneas e integridad referencial
- **Colisión de identidad de invitados:** `MeshNativa.java:462` y `motor-offline.js:1485` asignan el mismo identificador `"INVITADO"` a todos los usuarios sin sesión, rompiendo unicidad de remitente/destinatario y provocando autobloqueos o mensajes cruzados.

### M38: Normalización vs. desnormalización
- **Duplicación de ubicaciones y catálogos:** Coexisten en `backend/datos.py`, `motor-offline.js` (`UBIC`) y listas hardcoded en `app.js:1613, 1616` (`LUGARES_DESTACADOS`), produciendo inconsistencias de nombres (`Biblioteca` vs `Edificio I`).

### M39: Validación de restricciones y valores por defecto
- **Validación inconsistente de contraseñas:** `cuenta.js:517` permite longitud `4` en Paso 2, mientras `app.py:565` exige `6`.
- **Firestore sin validación estricta de esquema:** `firestore.rules:195-220, 240-250` permite crear/actualizar documentos con validación insuficiente o nula de autenticación y campos.

### M40: Timestamps, zonas horarias y borrado lógico
- **Inconsistencia UTC vs Local:** `basedatos.py` mezcla timestamps locales con registros que interactúan con Firestore/JS (UTC/epoch ms), generando riesgo de desorden cronológico en sincronización.
- **Ordenamiento ausente en nube:** `nube-firebase.js:226-231` (`listarMensajes(60)`) carece de `.orderBy('ts')`, devolviendo lotes arbitrarios cuando supera 60 documentos.

---

## BLOQUE 9: BASE DE DATOS — CONSULTAS, ÍNDICES Y RENDIMIENTO

### M41: Consultas sin índices que degradan el rendimiento
- **`basedatos.py:217-233` (`mensajes_de`):** Ejecuta escaneo con triple `OR` sin índice compuesto optimizado, degradando linealmente conforme crece el historial local.
- **`nube-firebase.js:226-231`:** Falta de `orderBy('ts')` (y su índice correspondiente) en `listarMensajes(60)`.

### M42: Consultas N+1 y lecturas repetitivas
- **`basedatos.py` (`ficha()`, `api_alerta_red()`):** Patrón de consultas N+1 al resolver datos relacionados por usuario/alerta dentro de bucles.
- **Polling en `motor-offline.js:1640-1643`:** Ejecución repetitiva cada 6 s que reinicia estado Mesh y fuerza tráfico redundante.

### M43: Paginación, límites y bloqueo del hilo principal
- **Límite fijo sin cursor:** `listarMensajes(60)` (`nube-firebase.js:226-231`) toma un lote de 60 sin cursor ni orden determinista.
- **Bloqueo UI en búsqueda de ajustes:** `ajustes.js:187-244` reconstruye todo el DOM vía `innerHTML` en cada evento `input` de `#aj-q`.

### M44: Transacciones atómicas
- **Mutaciones de estado en memoria vs SQLite:** `basedatos.py` abre conexiones por operación y no cierra explícitamente los handles (causando 2 `ResourceWarning` en `tests/`), exponiendo a locks o escrituras incompletas bajo `threaded=True` en `app.py`.

### M45: Estrategia de caché local y espacio en disco
- **Service Worker (`sw.js:4-45`):** Cachea estáticos principales pero omite `nube-firebase.js` e `i18n.js`.
- **Bandeja Mesh nativa (`MeshNativa.java:626-628`):** Al no persistir broadcasts (`TODOS`, `SOS`, `emergencia`, `bloqueo`), no hay ni caché ni política de retención/purga para alertas críticas.

---

## BLOQUE 10: BASE DE DATOS — MIGRACIONES, SYNC Y SEGURIDAD

### M46: Migraciones y versionado (`PRAGMA user_version`)
- **`basedatos.py:85-101` & `datos/unexuam.db`:** `PRAGMA user_version = 0`. No existe pipeline de migraciones incrementales; cualquier cambio de columna en un update del piloto romperá la base local existente del tester o requerirá borrar datos de la app.

### M47: Estrategia de sincronización *Offline-First*
- **Sincronización asimétrica:** `motor-offline.js` opera sobre estado en memoria (`S`, `UBIC`) y `localStorage`, mientras la nube usa Firestore (`nube-firebase.js`) y el backend local usa SQLite (`basedatos.py`). No existe cola persistente de outbox unificada con reintento exponencial ni reconciliación determinista.

### M48: Resolución de conflictos de escritura
- **Última escritura ciega / sobrescritura:** Los bloqueos de campus (`motor-offline.js:735-772`, `firestore.rules:240-250`) y reportes carecen de relojes vectoriales, `version` o validación de autoridad, permitiendo que un nodo offline sobrescriba o propague bloqueos inválidos.

### M49: Reglas de seguridad de BD (Firestore Rules) y prevención de inyección
- **Falla crítica en `firestore.rules:195-220, 240-250`:**
  - `usuarios/{cif}`: `read: if true` expone datos personales, `sal` y `hash` PBKDF2 de todos los usuarios.
  - `mensajes/{msgId}`: `read: if true` expone chats privados y SOS a cualquier cliente anónimo.
  - `reportes_bloqueo/{repId}`: `read: if true` + `create`/`update` abiertos sin autenticación (cualquiera puede resolver/cerrar bloqueos sin `isAdminAuth()`).
- **Solución:** Exigir `request.auth != null`, restringir `usuarios/{cif}` al propio `uid`/`cif`, ocultar `sal`/`hash` fuera de documentos públicos, limitar `mensajes` a participantes/rol y exigir `isAdminAuth()` para resolver `reportes_bloqueo`.

### M50: Cifrado en reposo y respaldo
- **SQLite (`datos/unexuam.db`) y `localStorage`/`SharedPreferences`:** Sin cifrado en reposo (SQLCipher / `EncryptedSharedPreferences`). Aunque las contraseñas usan PBKDF2 con sal, la exposición en `firestore.rules:195-220` anula esa defensa permitiendo ataques offline por diccionario sobre hashes filtrados.

---

## BLOQUE 11: RED MESH — CAPA FÍSICA Y PERMISOS OS

### M51: Implementación de transporte (Google Nearby Connections)
- **Ubicación:** `MeshNativa.java` (752 L) utiliza Google Nearby Connections (`Strategy.P2P_CLUSTER` / BLE + Wi-Fi Direct/Hotspot).
- **Problema:** La capa está instanciada y atada a `MainActivity.java:81, 251, 260`, no a un servicio independiente, y `MAX_CONECTADOS = 4` (`MeshNativa.java:56`) estrangula la topología física antes de aprovechar Wi-Fi Direct/BLE en densidad de aula.

### M52: Flujo de permisos en Android reciente (12–15)
- **`MainActivity.java:366` + `AndroidManifest.xml:72, 75`:**
  - Falta atributo `android:usesPermissionFlags="neverForLocation"` en `BLUETOOTH_SCAN` si no se requiere ubicación física por BLE, o bien flujo explícito cuando el usuario solo concede permisos parciales.
  - Falta chequeo de `NotificationManager.canUseFullScreenIntent()` para Android 14+ (`AndroidManifest.xml:72, 75`), crítico para mostrar `EmergencyAlertActivity` sobre pantalla bloqueada.

### M53: Denegación de permisos o apagado de Bluetooth/Wi-Fi en vivo
- **`MainActivity.java:366` / `MeshNativa.java`:** No escucha cambios dinámicos de `BluetoothAdapter.ACTION_STATE_CHANGED` (`STATE_OFF` / `STATE_ON`) para pausar limpiamente discovery/advertising, notificar al usuario y reanudar al reactivar Bluetooth.

### M54: Gestión de hardware heterogéneo (gama baja / OEM)
- **Saturación de radio en gama baja:** El ciclo de `6000 ms` en `motor-offline.js:1640-1643` que resetea `meshIniciado = false` (`MeshNativa.java:206-208`) provoca ráfagas continuas de `enviarHelloATodos()`, agotando batería y saturando chips BLE económicos.

### M55: Operación en segundo plano y límites del OS
- **`MeshForegroundService.java:30-34, 154-166`:** Aunque declara un Foreground Service, `MainActivity.onDestroy()` detiene Mesh y el servicio; si Android mata la app y la relanza por `START_STICKY`, `MeshNativa` es `null` ("Mesh fantasma").

---

## BLOQUE 12: RED MESH — DESCUBRIMIENTO, TOPOLOGÍA Y HANDSHAKE

### M56: Algoritmo de descubrimiento, tiempos y latencia
- **`MeshNativa.java:56, 433-441, 494-496`:** Al alcanzar `MAX_CONECTADOS = 4`, el nodo detiene el descubrimiento (`stopDiscovery()`) pero mantiene activo el advertising (`startAdvertising()`). Esto atrae intentos de conexión de nuevos pares que luego son rechazados, aumentando la latencia de descubrimiento del resto del campus.

### M57: Proceso de *handshake*, autenticación y negociación
- **`MeshNativa.java:114-128, 206-208`:** El mensaje `hello` carece de verificación criptográfica HMAC y se reenvía en tormenta cada 6 s por culpa del reset `meshIniciado = false` (`motor-offline.js:1640-1643`).

### M58: Manejo de entradas y salidas abruptas (*churn*)
- Con `MainActivity.java:85-89` ejecutando `reload()` a los `1200 ms`, el puente JS se reinicia mientras `MeshNativa` ya está iniciando sesiones, creando handles huérfanos y duplicando `iniciarMeshReal()`.

### M59: Gestión de múltiples conexiones simultáneas
- **`MAX_CONECTADOS = 4` (`MeshNativa.java:56`)** es rígido y no implementa rotación o reemplazo por calidad de enlace / nodos puente; 5 usuarios juntos forman una isla cerrada que ignora al resto de un salón de 30 alumnos.

### M60: Prevención de colisiones de identidad en Mesh
- **`MeshNativa.java:462` + `motor-offline.js:1485`:** Todos los invitados se anuncian como `"INVITADO"`, causando colisiones en tablas de vecinos, descartes por deduplicación y recepción cruzada de mensajes privados/SOS.

---

## BLOQUE 13: RED MESH — ENRUTAMIENTO, DTN Y CONFIABILIDAD

### M61: Algoritmo de flooding / forwarding y control de bucle
- **`MeshNativa.java:552-563`:** Los campos `ttl` y `ruta` viajan en el payload JSON **sin** estar cubiertos por el HMAC. Un nodo malicioso o corrupto puede inflar `ttl` o alterar `ruta` para provocar bucles de amplificación en toda la red.

### M62: Almacenamiento y reenvío DTN (*Store-and-Forward*)
- **`MeshNativa.java:626-628`:** Los broadcasts críticos (`TODOS`, `SOS`, `emergencia`, `bloqueo`) no se escriben en la `bandeja` persistente nativa; si el WebView está pausado o muerto, el DTN local pierde la copia de los mensajes más importantes del sistema.

### M63: Deduplicación y prevención de tormentas de broadcast
- **Tormenta de `hello`:** `motor-offline.js:1640-1643` + `MeshNativa.java:206-208` garantizan una tormenta periódica cada 6 segundos en modo offline, compitiendo por ancho de banda BLE con paquetes reales de emergencia.

### M64: Fragmentación y límites de payload
- No existe compresión ni chunking explícito para listas grandes de ubicaciones o rutas; combinado con `hello` repetitivos cada 6 s, aumenta la probabilidad de truncamiento o timeout en Nearby Connections.

### M65: Priorización de tráfico (SOS/Emergencia vs Chat)
- Sin cola de prioridad diferenciada en `MeshNativa.java` que garantice preemption de mensajes `emergencia`/`SOS` por encima de chats generales o `hello` repetidos.

---

## BLOQUE 14: RED MESH — SEGURIDAD, INTEGRIDAD Y SIMULACIÓN DE FALLOS

### M66: Integridad criptográfica y autenticación de mensajes Mesh
- **`MeshNativa.java:64, 552-563`:**
  1. `HMAC_KEY = "UNEXUAM-UAM-MESH-INTEGRITY-2026"` está hardcodeada en el binario Java (extraíble por ingeniería inversa en minutos).
  2. El HMAC excluye campos críticos: `accion`, `emergenciaTipo`, `titulo`, `ambos`, `incidente`, `ttl`, `ruta`. Un atacante puede mutar una alerta de texto normal a `accion: "emergencia"` o `accion: "bloquear"` manteniendo una firma válida.

### M67: Autorización de comandos administrativos vía Mesh
- **`motor-offline.js:608, 735-772, 1399-1413`:** `/api/campus/bloquear` offline acepta solicitudes sin validar rol administrador y propaga `accion: "bloquear"` por la red Mesh.

### M68: Cifrado de extremo a extremo en mensajes privados P2P
- Los mensajes privados entre usuarios (`para: cif`) se transmiten protegidos únicamente por el transporte de Nearby Connections y un HMAC con llave global compartida, sin cifrado E2E por clave de destinatario, permitiendo que nodos intermedios lean el contenido en tránsito multi-salto.

### M69: Los 5 peores escenarios de fallo Mesh en campo
1. **Escenario 1 — "Mesh Fantasma en Segundo Plano":** Usuario guarda el teléfono; Android mata y reinicia `MeshForegroundService` con `START_STICKY` (`MeshForegroundService.java:30-34, 154-166`). La notificación dice que la red está activa, pero `MeshNativa` es `null`: **0 mensajes enviados/recibidos**.
2. **Escenario 2 — "Tormenta de `hello` en Simulacro Offline":** 20 alumnos pierden señal celular; `motor-offline.js:1640-1643` resetea `meshIniciado = false` (`MeshNativa.java:206-208`) cada 6 s -> 200+ paquetes `hello` por minuto saturan Nearby Connections.
3. **Escenario 3 — "Isla de 5 Teléfonos":** Al llegar a `MAX_CONECTADOS = 4` (`MeshNativa.java:56, 433-441, 494-496`), los primeros 5 teléfonos dejan de descubrir pares pero siguen anunciándose; los otros 15 teléfonos del pasillo quedan aislados intentando conectarse y siendo rechazados.
4. **Escenario 4 — "Alerta Perdida con Pantalla Apagada":** Un coordinador envía `emergencia` / `SOS` (`TODOS`); el teléfono receptor tiene el WebView suspendido; `MeshNativa.java:626-628` no guarda broadcasts en `bandeja` -> el usuario nunca recibe la alerta al despertar la pantalla.
5. **Escenario 5 — "Secuestro de Bloqueo / Falsificación de Emergencia":** Cualquier persona extrae `"UNEXUAM-UAM-MESH-INTEGRITY-2026"` (`MeshNativa.java:64`) o altera `accion`/`emergenciaTipo`/`ttl` fuera del HMAC (`MeshNativa.java:552-563`) o llama `/api/campus/bloquear` offline (`motor-offline.js:735-772`), sembrando pánico o cerrando rutas falsamente en todo el campus.

### M70: Estrategia de pruebas de estrés y observabilidad Mesh
- **Brecha:** `tests/test_api.py` y `tests/test_backend.py` (`68` tests `OK`) prueban el backend Python, pero no existe arnés automatizado ni telemetría estructurada en `MeshNativa.java` para medir tasa de entrega, hops ni colisiones de `"INVITADO"`.

---

## BLOQUE 15: SEGURIDAD — AUTENTICACIÓN, SESIÓN Y CONTROL DE ACCESO

### M71: Flujo de autenticación y políticas de contraseña
- **Contradicción de longitud mínima:** `cuenta.js:517` permite `4` caracteres en registro (Paso 2), mientras `app.py:565` exige `6`.
- **Exposición de hashes:** `firestore.rules:195-220` expone `usuarios/{cif}` (con `sal` y `hash` PBKDF2) mediante `read: if true`.

### M72: Protección contra fuerza bruta y abuso de endpoints
- **`app.py:580-641, 555-576`:** No existe rate-limiting por IP; las estructuras en memoria `INTENTOS` y `BUSQUEDAS` carecen de `threading.Lock` bajo Flask `threaded=True` (condición de carrera + bypass bajo concurrencia).

### M73: Control de acceso basado en roles (RBAC)
- **Bypass offline:** `motor-offline.js:608, 735-772, 1399-1413` permite ejecutar `/api/campus/bloquear` sin validar privilegios de administrador.
- **Bypass en Firestore:** `firestore.rules:240-250` permite crear y actualizar/resolver `reportes_bloqueo/{repId}` sin `isAdminAuth()`.

### M74: Exposición de rutas públicas innecesarias
- **`app.py:723-744`:** La lista `LIBRES` incluye `/api/mensajes/general` sin autenticación, permitiendo lectura/scraping anónimo del canal general del campus.

### M75: Manejo de tokens Firebase / Google Auth
- **`app.py:926-931` vs `requirements.txt:1-171`:** El servidor intenta usar `google.auth` para validar tokens, pero `google-auth` falta en `requirements.txt`, arriesgando fallos de verificación en despliegue limpio.

---

## BLOQUE 16: SEGURIDAD — DATOS, CRIPTOGRAFÍA, RED Y PRIVACIDAD

### M76: Exposición de datos personales (PII) en tránsito y nube
- **`firestore.rules:195-220`:** `usuarios/{cif}` y `mensajes/{msgId}` tienen `read: if true`, permitiendo que cualquier usuario anónimo descargue matrículas/CIFs, nombres, ubicaciones, hashes PBKDF2 (`sal`/`hash`), chats privados y alertas SOS.

### M77: Auditoría de secretos, llaves hardcodeadas y binarios
- **`MeshNativa.java:64`:** `HMAC_KEY = "UNEXUAM-UAM-MESH-INTEGRITY-2026"` está hardcodeada en Java; aunque `app-release.apk` usa R8, una constante `String` literal es trivial de extraer con `strings` o `jadx`.
- **`mobile/Unexuam.apk`:** Binario debug (`9,610,061 B`, SHA `6D5C50F3...`) presente en la raíz móvil facilita depuración e inspección en dispositivos de prueba.

### M78: Validación de entradas e inyección (XSS / HTML / NoSQL)
- **`ajustes.js:187-244` & renders DOM en `app.js`/`cuenta.js`:** Uso extendido de `innerHTML` al renderizar resultados filtrados y listados requiere sanitización estricta de texto proveniente de nodos Mesh/Firestore para prevenir XSS dentro del WebView con bridge `@JavascriptInterface`.

### M79: Superficie del puente JS ↔ Java (`@JavascriptInterface`)
- **`MainActivity.java` + `MeshNativa.java`:** El WebView expone métodos nativos de envío Mesh y control de alertas; si existiera cualquier XSS en mensajes Mesh o nombres de usuario, un atacante podría invocar el bridge nativo para enviar broadcasts o disparar alarmas.

### M80: Privacidad por diseño y minimización de datos
- **Ubicación e identidad:** Compartir `UBIC` y `cif` por broadcast `TODOS` sin consentimiento granular ni expiración automática de historial en `basedatos.py` ni Firestore expone rastreo de movimientos dentro del campus.

---

## BLOQUE 17: DISEÑO VISUAL, IDENTIDAD Y ANTI-IA

### M81: Auditoría de sistema de diseño, tokens y paleta (Claro vs Oscuro)
- **`frontend/static/app.css:68, 118, 907, 955, 1926, 2803, 2817` + `cuenta.css:579`:**
  - En modo oscuro, se redefine `--blanco: #131c29` en lugar de introducir tokens semánticos (`--surface-card`, `--on-primary`).
  - Resultado: `.btn.primario`, `.btn.seguro`, `.mio`, `.toast` y `.destino` heredan `color: var(--blanco)` sobre fondos saturados, cayendo a contrastes de `3.80:1` y `3.15:1` (por debajo de WCAG AA `4.5:1`).

### M82: Detección de patrones genéricos "AI-Slop" e identidad UAM
- **Contradicción visual en chat oscuro:** `app.css:2817` fuerza `fondo-marca.svg` (fondo claro opaco `fondo-marca.svg:2`) encima de `.chat-lista` en modo oscuro, rompiendo la inmersión nocturna y creando una estética parcheada.
- **Ruido informacional:** Etiquetas redundantes, botones de recomendaciones repetitivos y paneles de prioridad poco útiles (reportado en feedback de campo) diluyen la identidad institucional sobria UAM.

### M83: Jerarquía visual, espaciado y densidad en pantallas de pánico
- **`cuenta.css:243-244, 265, 1700, 1840` + `app.css:1702`:** Colisión de capas `z-index`: `.toast` (`30`) y `#hoja` (`25`) quedan ocultos detrás de `#v-login` (`50`), `#modal-ubicacion` (`80`) y `#modal-emergencia` (`90`), ocultando confirmaciones y errores críticos durante una emergencia.

### M84: Auditoría del mapa 3D (`mapa-campus-3d.svg` y `generar_mapa.py`)
- **`frontend/static/img/mapa-campus-3d.svg` (`274.28 KB`, `2,315` nodos SVG) & `docs/mapa-campus/generar_mapa.py` (1,328 L):**
  - El archivo SVG contiene `2,315` elementos DOM que sobrecargan WebViews móviles en pan/zoom.
  - En pruebas visuales previas de campo, la geometría del Edificio P mostró una barda sin sentido en el 3er piso y etiquetas verbosas (ej. "celdas solares") que ensucian la lectura rápida.

### M85: Coherencia tipográfica y consistencia entre `app.css` y `cuenta.css`
- **Hojas monolíticas paralelas:** `app.css` (2,685 L) y `cuenta.css` (2,217 L) suman `4,902` líneas sin archivo base único de tokens de color/z-index/elevación, generando colisiones de capas (`z-index: 25/30` vs `50/80/90`) y regresiones de contraste entre vistas.

---

## BLOQUE 18: TEXTURAS, ASSETS, ICONOGRAFÍA Y OPTIMIZACIÓN GRÁFICA

### M86: Inventario y peso de `frontend/static/img/`
- **Peso total actual:** `1,248.5 KB` (`0` imágenes en formato moderno `WebP` o `AVIF`).
- **Sobrepeso innecesario:** `tarjeta-auxilios.jpg` (`164 KB`) y `tarjeta-sin-senal.jpg` (`104 KB`) se renderizan en lugar de `tarjeta-auxilios.svg` (`0.99 KB`) y `tarjeta-sin-senal.svg` (`1.05 KB`), desperdiciando `~266 KB` en un par de tarjetas.

### M87: Resolución adecuada vs sobredimensionamiento (*over-decoding*)
- **`ico-fuego.png` (`1501x2108` px):** Se decodifica una imagen de >3.1 megapíxeles para renderizar un icono de `44 px` en pantalla, consumiendo RAM innecesaria en dispositivos Android de gama baja.

### M88: Limpieza de activos huérfanos en el bundle
- **Sin referencia en DOM:** `tarjeta-evacuar.jpg`, `ico-sin-senal.png`, `ico-pin.png`, `tarjeta-auxilios.svg` y `tarjeta-sin-senal.svg` deben auditarse para unificar a SVG/WebP ligero y purgar los no referenciados antes de compilar `assets/public/static/`.

### M89: Calidad de iconografía de emergencia y legibilidad en movimiento
- Mezcla de PNG rasterizados de alta resolución (`ico-fuego.png`) con SVGs de trazo variable reduce consistencia visual. Convertir iconografía UI a SVG limpio (< 3 KB c/u) y fotografías/ilustraciones a WebP comprimido reducirá >65% el peso de `img/`.

### M90: Optimización del mapa SVG para WebView móvil
- `mapa-campus-3d.svg` (`274.28 KB`, `2,315` nodos) requiere simplificación de paths en `docs/mapa-campus/generar_mapa.py`, eliminación de etiquetas redundantes y áreas táctiles limpias por edificio (`touch area` directa sobre el polígono del edificio).

---

## BLOQUE 19: EXPERIENCIA SENSORIAL — AUDIO, HÁPTICA Y MOTION

### M91: Audio UI y política de *autoplay* en WebView/Navegador
- **`cuenta.js:1472, 1506`:** `AudioContext` se crea de forma perezosa cuando llega la alerta. Si no existió un gesto previo del usuario en esa sesión WebView, el contexto queda en estado `"suspended"` y la sirena/alerta web **no suena**.

### M92: Síntesis de voz (TTS) en rutas de evacuación
- **Fallo reportado en campo:** La guía por voz durante evacuaciones no opera de forma confiable en WebView/Android cuando depende de `speechSynthesis` web sin puente nativo `TextToSpeech` ni desbloqueo previo de audio.

### M93: Alarma nativa y respeto a preferencias del usuario
- **`EmergencyAlertActivity.java:312-364`:** La alarma nativa ignora las preferencias del usuario (`prefs.tono`, `prefs.vibrar`) y el modo No Molestar / timbre del teléfono en simulacros o pruebas, impidiendo silenciar o personalizar alertas no críticas.

### M94: Canal de notificaciones FCM en Android
- **`UnexuamMessagingService.java:19, 66, 96`:** Publica notificaciones apuntando al canal `"unexuam_emergencias"` **sin crearlo previamente** en `NotificationManager.createNotificationChannel(...)`. En Android 8+, una notificación hacia un canal inexistente es descartada silenciosamente por el sistema.

### M95: Micro-interacciones, háptica y *Motion* funcional
- **Botón SOS (`cuenta.js` + CSS):** Se reportó en campo que el gesto de arrastrar por completo el botón SOS falla intermitentemente; requiere umbral de confirmación robusto (`pointerup`/`pointercancel` + tolerancia >= 80% del track) acompañado de feedback háptico diferenciado al completar el disparo.

---

## BLOQUE 20: INTERACTIVIDAD, FLUJOS DE USUARIO Y NAVEGACIÓN

### M96: Flujo de Invitado vs Usuario Registrado
- **`cuenta.js:1054` (`elegirLugar()`):** Si `YO === null` (invitado), leer `YO.lugar` lanza `TypeError` y rompe la selección de ubicación.
- **`cuenta.js:1537` (`enviarSOS()`):** Si `!YO`, retorna silenciosamente sin enviar SOS ni mostrar aviso.
- **Solución:** Inicializar objeto de sesión efímera de invitado (`id: "INV-" + uuidCorto`, `lugar: null`) compatible con `elegirLugar()` y `enviarSOS()`.

### M97: Flujo de registro y onboarding
- **`cuenta.js:517` vs `app.py:565`:** Paso 2 acepta contraseñas de `4` caracteres en cliente, pero el servidor rechaza con error al requerir `6`, obligando a retroceder al usuario.

### M98: Búsqueda de salones, edificios y listas
- **`app.js:1613, 1616` (`LUGARES_DESTACADOS`):** Contiene `"Biblioteca"` y `"Cafetería"`, que no coinciden con `"Edificio I"` y `"Food Court"` de `backend/datos.py:103-104`, causando búsquedas fallidas o rutas sin destino.
- **Normalización de códigos:** La búsqueda debe aceptar tanto `c301` como `c-301` (insensible a guiones, espacios y mayúsculas) en todos los edificios.

### M99: Interacción sobre el mapa 3D y selección de ubicación
- El flujo actual superpone botones sobre la vista 3D al elegir ubicación; debe sustituirse por selección táctil directa sobre el área del edificio en el mapa y actualización en tiempo real de ubicación cuando se activa una emergencia.

### M100: Capas modales, toasts y retroalimentación de acciones
- **`cuenta.css:243-244, 265, 1700, 1840` + `app.css:1702`:** Elevar `.toast` (`z-index >= 200`) y `#hoja` por encima de `#v-login` (`50`), `#modal-ubicacion` (`80`) y `#modal-emergencia` (`90`) para que ningún mensaje de error o confirmación quede tapado.

---

## BLOQUE 21: ACCESIBILIDAD (A11Y) Y USABILIDAD EXTREMA

### M101: Contraste de color WCAG AA / AAA en ambos temas
- **`app.css:68, 118, 907, 955, 1926, 2803, 2817` + `cuenta.css:579`:** Contraste medido de `3.80:1` y `3.15:1` en modo oscuro por redefinir `--blanco: #131c29`. Inaceptable bajo estrés visual o luz solar; corregir definiendo `--texto-sobre-acento: #ffffff`.

### M102: Tamaño de objetivos táctiles (*Tap Targets* >= 44x44 px)
- **`app.css:2995, 3056, 3074, 3092` + `cuenta.css:360, 1623`:**
  - `.capa-chip`: `~28 px` de alto.
  - `.banner-em-btn`: `~29 px` de alto.
  - `.sel-*`: `~30 px` de alto.
- **Impacto:** En sismo o caminata rápida, dedos con temblor fallan pulsaciones menores a `44 px`; subir `min-height: 44px` y padding táctil.

### M103: Soporte de lectores de pantalla (ARIA, roles y live regions)
- Banners de emergencia, contadores y `#toast` carecen de atributos `role="alert"` / `aria-live="assertive"` consistentes y etiquetado descriptivo en controles de icono y chips del mapa.

### M104: Navegación por teclado, foco visible y *modals*
- Modales (`#v-login`, `#modal-ubicacion`, `#modal-emergencia`) no implementan trampa de foco (*focus trap*) ni restauración del foco al cerrar con `Escape`.

### M105: Reducción de movimiento y legibilidad bajo estrés
- Falta media query `@media (prefers-reduced-motion: reduce)` en `app.css` y `cuenta.css` para desactivar animaciones continuas cuando el usuario tiene sensibilidad vestibular o batería crítica.

---

## BLOQUE 22: RENDIMIENTO, MEMORIA Y CONSUMO DE BATERÍA

### M106: Rendimiento de carga inicial y recarga forzada
- **`MainActivity.java:85-89`:** Recargar el WebView a los `1200 ms` duplica el parseo de HTML/CSS/JS, reinicia el mapa SVG de `274.28 KB` y retrasa el Time-to-Interactive en más de 1.5 s adicionales.

### M107: Rendimiento de renderizado DOM y búsquedas
- **`ajustes.js:187-244`:** Reemplazar `innerHTML` completo en cada `input` de `#aj-q` provoca *layout thrashing*; debe cambiarse a filtrado de visibilidad CSS (`hidden` / `display`) o `DocumentFragment` con debounce de `120 ms`.

### M108: Consumo de batería y radio por red Mesh
- **`motor-offline.js:1640-1643` + `MeshNativa.java:206-208`:** El reinicio de `meshIniciado = false` cada `6000 ms` mantiene el radio BLE/Wi-Fi Direct en transmisión constante (`enviarHelloATodos()`), drenando batería rápidamente en un apagón real.

### M109: Uso de memoria RAM por imágenes y SVG
- **`ico-fuego.png` (`1501x2108` px)** y **`mapa-campus-3d.svg` (`2,315` nodos)** incrementan innecesariamente el heap de gráficos del WebView en Android Go / gama baja.

### M110: Eficiencia de consultas y red en nube
- **`nube-firebase.js:226-231`:** `listarMensajes(60)` sin `orderBy('ts')` ni listener incremental impide cacheo eficiente y obliga a re-descargar documentos.

---

## BLOQUE 23: PERSISTENCIA OFFLINE, PWA Y SERVICE WORKER

### M111: Auditoría de caché del Service Worker (`sw.js`)
- **`frontend/static/sw.js:4-45`:** `ASSETS` omite `nube-firebase.js` e `i18n.js`. Si la versión PWA se abre sin conexión por primera vez tras el shell, falla la carga de internacionalización y la capa de sincronización.

### M112: Manejo de fallos de red en `fetch` handler de `sw.js`
- **`frontend/static/sw.js:96-106`:** `.catch(() => caches.match(...))` retorna `undefined` cuando no existe entrada previa en caché, causando `TypeError: Failed to convert value to 'Response'` en el navegador. Debe devolver una `Response` offline de respaldo (`503` o fallback HTML/JSON).

### M113: Paridad entre motor offline móvil y PWA web
- `mobile/motor-offline.js` (1,559 L, copia verificada en `assets/public/static/motor-offline.js` SHA-256 `8AE24FD7...`) resuelve rutas offline en Capacitor, pero en PWA pura depende de que todos los módulos de datos estén sincronizados en Cache Storage.

### M114: Sincronización de archivos estáticos (`preparar_web.py`)
- **`mobile/preparar_web.py` (141 L):** Copia assets hacia Android, pero debe incorporar verificación de hash, exclusión de assets huérfanos y validación de existencia de `app-release.apk` antes de distribuir.

### M115: Comportamiento ante almacenamiento lleno o cuota excedida
- Ni `motor-offline.js` ni `nube-firebase.js` envuelven escrituras en `localStorage` con manejo explícito de `QuotaExceededError` y purga LRU de mensajes antiguos.

---

## BLOQUE 24: BACKEND FLASK, API Y SERVICIOS EN LA NUBE

### M116: Concurrencia y estado compartido en Flask (`app.py`)
- **`app.py:580-641, 555-576`:** `INTENTOS` y `BUSQUEDAS` residen en memoria sin `threading.Lock` mientras Flask corre con `threaded=True`, exponiendo a condiciones de carrera y pérdida de contadores bajo múltiples workers/hilos.

### M117: Contratos API, códigos HTTP y consistencia
- Desalineación entre validación de contraseña en `cuenta.js:517` (`min=4`) y `app.py:565` (`min=6`), y entre `LUGARES_DESTACADOS` en `app.js:1613, 1616` y `backend/datos.py:103-104`.

### M118: Cloud Functions (`functions/index.js`) y disparador Push
- **`functions/index.js` (38 L) & `functions/package.json` (13 L):** Revisar que el trigger sobre `campus/estado` envíe payloads compatibles con `UnexuamMessagingService.java` creando/usando el canal `"unexuam_emergencias"` (`UnexuamMessagingService.java:19, 66, 96`) y validando estado de despliegue en plan Spark/Blaze.

### M119: Integración Firebase Auth en backend (`app.py`)
- **`app.py:926-931` vs `requirements.txt:1-171`:** Falta `google-auth` en `requirements.txt` (`find_spec('google.auth') == None`), impidiendo verificación de ID tokens en entornos recién instalados.

### M120: Observabilidad, logs y healthchecks de backend
- **`basedatos.py`:** Conexiones SQLite no cerradas provocan 2 `ResourceWarning` en pruebas (`tests/`); falta cierre por contexto (`with sqlite3.connect(...)`) y endpoint/log estructurado de diagnóstico.

---

## BLOQUE 25: NOTIFICACIONES PUSH, ALERTAS NATIVAS Y SEGUNDO PLANO

### M121: Inicialización de canales de notificación Android
- **`UnexuamMessagingService.java:19, 66, 96`:** El canal `"unexuam_emergencias"` nunca se registra vía `NotificationChannel` con `IMPORTANCE_HIGH`; en Android 8.0+ las notificaciones push remotas son bloqueadas por el OS.

### M122: Pantalla completa de emergencia (`EmergencyAlertActivity`)
- **`AndroidManifest.xml:72, 75` + `EmergencyAlertActivity.java`:** En Android 14+ (`API 34+`), `USE_FULL_SCREEN_INTENT` requiere permiso concedido por el usuario si la app no está exenta; falta verificar `canUseFullScreenIntent()` y guiar al ajuste del sistema.

### M123: Preferencias sensoriales de alerta nativa
- **`EmergencyAlertActivity.java:312-364`:** Ignora `prefs.tono` y `prefs.vibrar`; debe leer las preferencias almacenadas en `SharedPreferences`/bridge JS para respetar tono elegido y vibración.

### M124: Servicio en primer plano Mesh (`MeshForegroundService`)
- **`MeshForegroundService.java:30-34, 154-166` + `MainActivity.java:81, 251, 260`:** Invertir la propiedad: `MeshForegroundService` debe instanciar y poseer `MeshNativa` (o un singleton de `Application`), de modo que `START_STICKY` recupere realmente la red Mesh cuando Android reinicie el servicio.

### M125: Cola nativa de alertas perdidas en segundo plano
- **`MeshNativa.java:626-628`:** Persistir broadcasts (`TODOS`, `SOS`, `emergencia`, `bloqueo`) en `bandeja` nativa (SQLite/SharedPreferences) y entregarlos al WebView al reanudar `MainActivity` con deduplicación por `id`.

---

## BLOQUE 26: UX WRITING, MICROCOPY E INTERNACIONALIZACIÓN (i18n)

### M126: Auditoría de tono, claridad y brevedad en pánico
- Etiquetas descriptivas excesivas en mapa y paneles (ej. mencionar detalles arquitectónicos como `"celdas solares"` en Edificio P o tarjetas informativas largas) incrementan la carga cognitiva en una evacuación real.

### M127: Cobertura de `i18n.js` y textos hardcoded
- **`frontend/static/i18n.js` (247 L) & `sw.js:4-45`:** Aunque existe módulo `i18n.js`, no está incluido en `ASSETS` de `sw.js` y múltiples cadenas de error/estado en `cuenta.js`, `app.js` y `motor-offline.js` están escritas directamente en español sin claves de traducción.

### M128: Mensajes de error accionables vs técnicos/silenciosos
- **`cuenta.js:1537`:** Silencio total cuando `!YO` pulsa SOS.
- **`cuenta.js:517` vs `app.py:565`:** Mensaje de error tardío del servidor tras aceptar `4` caracteres en pantalla.

### M129: Consistencia de nomenclatura campus UAM
- **`app.js:1613, 1616` vs `backend/datos.py:103-104`:** Unificar `"Biblioteca"` -> `"Edificio I"` y `"Cafetería"` -> `"Food Court"`, y estandarizar códigos de aula con o sin guion (`C301` / `C-301`).

### M130: Tabla Antes vs. Después (UX Writing en Flujos Críticos)
| Pantalla / Elemento | Archivo:Línea | Texto / Comportamiento ANTES | Propuesta DESPUÉS (Claro, Accionable, < 8 palabras) |
| :--- | :--- | :--- | :--- |
| **Botón SOS (Invitado)** | `cuenta.js:1537` | Retorno silencioso sin mensaje ni envío | Envia SOS con ID efímero: `"SOS enviado a red cercana"` |
| **Registro Paso 2 (Clave)** | `cuenta.js:517` | Acepta 4 chars y falla luego en servidor (`app.py:565`) | `"Mínimo 6 caracteres"` (bloqueo inmediato inline) |
| **Lugares Destacados** | `app.js:1613, 1616` | `"Biblioteca"` / `"Cafetería"` (desincronizado) | `"Edificio I"` / `"Food Court"` (igual a `datos.py`) |
| **Etiqueta Mapa Edificio P** | `mapa-campus-3d.svg` | Texto largo con detalle `"celdas solares"` | `"Edificio P"` (subtítulo solo al tocar: `"Zona segura N/S"`) |
| **Canal Push Sin Permiso** | `MainActivity.java` / `AndroidManifest.xml:72` | Falla silenciosa en Android 14+ sin FullScreenIntent | `"Activa alertas sobre pantalla bloqueada"` + botón a Ajustes |

---

## BLOQUE 27: QA, TESTING AUTOMATIZADO Y COBERTURA

### M131: Estado actual de la suite de pruebas Python
- **`tests/test_api.py` (353 L) & `tests/test_backend.py` (279 L):** Ejecutados `68` tests -> `68` `OK` en `11.65 s`, con `2` `ResourceWarning` por conexiones SQLite no cerradas en `basedatos.py`.

### M132: Brecha crítica: 0 tests automatizados para JS, Offline y Mesh
- **`mobile/motor-offline.js` (1,559 L), `frontend/static/*.js` y `MeshNativa.java` (752 L):** Cuentan con **0** pruebas unitarias o de integración automatizadas; por eso bugs triviales como `S.ubicaciones` (`motor-offline.js:392`) o `YO.lugar` (`cuenta.js:1054`) llegaron hasta pre-piloto.

### M133: Brecha de pruebas de reglas Firestore y Cloud Functions
- No hay suite con Firebase Emulator Suite que valide `firestore.rules:195-220, 240-250` contra lecturas anónimas o mutaciones sin `isAdminAuth()`.

### M134: Pruebas visuales y de accesibilidad automatizadas
- Ausencia de chequeos automatizados de contraste (Lighthouse/axe) y `z-index` en modo oscuro/claro (`app.css:68, 2817`, `cuenta.css:243-244`).

### M135: Plan mínimo de regresión pre-piloto
1. Añadir test unitario Node/Vitest para `motor-offline.js` cubriendo nodo sin aristas (`sinSenal`) e invitado (`elegirLugar`, `enviarSOS`).
2. Añadir test JUnit para firma HMAC completa en `MeshNativa.java` y persistencia en `bandeja`.
3. Corregir cierre SQLite en `basedatos.py` para llevar `tests/` a `0` `ResourceWarning`.

---

## BLOQUE 28: DEVOPS, COMPILACIÓN, FIRMA Y DISTRIBUCIÓN DE APK

### M136: Verificación de binarios APK en el repositorio
- **`mobile/Unexuam.apk`:** `9,610,061` bytes (`9.16 MiB`), SHA-256 `6D5C50F3...` -> corresponde al build **debug**, no al release firmado.
- **`app-release.apk`:** `3,033,889` bytes (`2.89 MiB`), optimizado con R8.
- **Acción obligatoria:** Reemplazar `mobile/Unexuam.apk` con el `app-release.apk` firmado antes de entregar enlaces QR (`qr-descarga.js` / `descargar.html`).

### M137: Configuración Gradle, ProGuard/R8 y manifest
- `mobile/android/app/build.gradle` (70 L) y `proguard-rules.pro`: R8 reduce exitosamente a `2.89 MiB`, pero debe verificarse keep-rules de `@JavascriptInterface` en `MainActivity.java` y `MeshNativa.java` en cada build release.

### M138: Sincronización web-a-móvil (`mobile/preparar_web.py`)
- Verificado SHA-256 `8AE24FD7...` idéntico entre `mobile/motor-offline.js` y `mobile/android/app/src/main/assets/public/static/motor-offline.js`. Integrar este script como paso obligatorio pre-build en Gradle/CI.

### M139: Gestión de keystore, `.gitignore` y secretos de compilación
- Asegurar que `*.keystore`, `*.jks`, `keystore.properties` y credenciales Firebase Admin nunca entren al control de versiones ni se distribuyan junto a `mobile/Unexuam.apk`.

### M140: Flujo de distribución QR y página de descarga
- **`frontend/templates/descargar.html` (134 L) & `frontend/static/qr-descarga.js` (183 L):** Validar que la ruta servida apunte al APK release firmado (`2.89 MiB`) con checksum visible para verificación en campo.

---

## BLOQUE 29: OPERACIÓN EN CAMPO, TELEMETRÍA Y PLAN DE PILOTO

### M141: Diseño del protocolo de simulacro controlado
- Iniciar con **Fase 1 (5 dispositivos mixtos)** validando conectividad Mesh, audio y pantalla bloqueada antes de escalar a **Fase 2 (20–30 dispositivos en un edificio)** una vez corregido `MAX_CONECTADOS = 4` (`MeshNativa.java:56`).

### M142: Telemetría mínima de diagnóstico en piloto
- Agregar contador local exportable en ajustes/debug de paquetes `hello` enviados/recibidos, tamaño de `bandeja` y errores JS capturados para diagnosticar fallos tras cada ronda sin depender de `adb logcat`.

### M143: Contingencia ante fallo de nube o plan Blaze
- Si Firebase Cloud Functions no está activo por límite de plan Spark, la app depende del listener directo de Firestore (`campus/estado`) en foreground y de Mesh P2P offline; documentar este límite operativo al equipo coordinador del simulacro.

### M144: Soporte a dispositivos de gama baja y permisos OEM
- Incluir en la guía de onboarding del piloto paso rápido para desactivar optimización de batería (MIUI/OneUI/ColorOS) y conceder `canUseFullScreenIntent()` en Android 14+.

### M145: Criterios de rollback durante el piloto
- Abortar prueba masiva si se observa: (a) >5% crashes en arranque/offline, (b) tasa de entrega Mesh <75% en mismo piso, o (c) falsas alertas no autorizadas.

---

## BLOQUE 30: CHECKLIST FÍSICO DE QA Y MATRIZ MAESTRA DE REMEDIACIÓN

### M146: Verificación de build y entorno Python pre-release
- Instalar/declarar `google-auth` en `requirements.txt` (`app.py:926-931`), correr `python -m unittest` (`68` tests con `0` warnings) y compilar `app-release.apk` tras sincronizar `mobile/preparar_web.py`.

### M147: Verificación de reglas Firestore antes de abrir el piloto
- Desplegar `firestore.rules` endurecidas eliminando `read: if true` en `usuarios/{cif}`, `mensajes/{msgId}` y `reportes_bloqueo/{repId}` (`firestore.rules:195-220, 240-250`) y probar con un token anónimo/no-admin que todas las lecturas/escrituras indebidas den `PERMISSION_DENIED`.

### M148: Verificación de contraste y capas visuales
- Inspeccionar en modo oscuro y claro: banner de emergencia a ancho completo, botón SOS arrastrable al 100%, contraste de `.btn.primario`/`.btn.seguro`/`.mio`/`.toast` >= `4.5:1` y visibilidad de `.toast` sobre `#v-login`/`#modal-emergencia`.

### M149: Checklist manual de QA en teléfonos físicos (2 a 5 dispositivos)
- [ ] **1. Arranque limpio sin `reload`:** Abrir app instalada desde `app-release.apk` (`~2.89 MiB`); confirmar que no parpadea ni recarga a los `1.2 s` (`MainActivity.java:85-89`).
- [ ] **2. Modo Invitado completo:** Sin iniciar sesión, tocar mapa para elegir ubicación (`elegirLugar`), buscar `c301` y `c-301`, y arrastrar `SOS` al 100%; confirmar 0 errores JS y envío exitoso (`cuenta.js:1054, 1537`).
- [ ] **3. Modo Avión + Nodo Aislado:** Activar modo avión en 1 teléfono solo y abrir evacuación; confirmar que `sinSenal` NO crashea (`motor-offline.js:392`).
- [ ] **4. Estabilidad Mesh (60 s quieto):** Conectar 3 teléfonos en modo avión; verificar en log/contador que NO se envían ráfagas `hello` cada 6 s (`motor-offline.js:1640-1643`).
- [ ] **5. Prueba de 6+ dispositivos:** Conectar 6 teléfonos en la misma aula; confirmar que no quedan aislados en clica de 5 (`MeshNativa.java:56`).
- [ ] **6. Alerta con Pantalla Bloqueada:** Bloquear teléfono receptor (Android 14+), enviar emergencia desde otro nodo y por FCM; confirmar canal `"unexuam_emergencias"`, `EmergencyAlertActivity` en pantalla completa, respeto a `prefs.tono`/`prefs.vibrar` y persistencia en `bandeja` (`MeshNativa.java:626-628`).
- [ ] **7. Seguridad Offline/Firestore:** Intentar `/api/campus/bloquear` como alumno normal (offline y nube); confirmar rechazo `403`/`PERMISSION_DENIED`.
- [ ] **8. Modo Oscuro bajo luz baja:** Abrir chat, rutas y toast sobre modal de emergencia; confirmar contraste legible y ausencia de fondo blanco de `fondo-marca.svg` (`app.css:2817`).

### M150: Matriz Maestra de Remediación P0–P3
| ID | Prioridad | Bloque/Módulo | Archivo:Línea | Diagnóstico / Sugerencia | Acción exacta |
| :--- | :---: | :--- | :--- | :--- | :--- |
| **REM-01** | **P0** | B1/M3, B5/M21 | `mobile/motor-offline.js:392` | `sinSenal` lee `S.ubicaciones[v.nombre]` (`undefined`) y crashea offline sin aristas | Reemplazar `S.ubicaciones` por `UBIC` y añadir guarda `?.` |
| **REM-02** | **P0** | B5/M24, B11/M55 | `MainActivity.java:81, 251, 260`; `MeshForegroundService.java:30-34, 154-166` | `MeshNativa` atada a Activity; `START_STICKY` crea "Mesh fantasma" | Mover instancia y ciclo de vida de `MeshNativa` a `MeshForegroundService` / `Application` |
| **REM-03** | **P0** | B5/M22, B7/M33 | `MainActivity.java:85-89` | `postDelayed(reload, 1200L)` rompe arranque JS y duplica `iniciarMeshReal()` | Eliminar `postDelayed(reload, 1200L)` y usar sincronización por evento `pageFinished` |
| **REM-04** | **P0** | B12/M57, B13/M63 | `mobile/motor-offline.js:1640-1643`; `MeshNativa.java:206-208` | Loop cada `6000 ms` resetea `meshIniciado = false` y dispara tormenta `hello` | Solo iniciar Mesh una vez y reintentar únicamente si el estado físico está desconectado |
| **REM-05** | **P0** | B14/M66 | `MeshNativa.java:64, 114-128, 552-563` | `HMAC_KEY` hardcodeada; `hello` sin firma y `accion`/`emergenciaTipo`/`ttl`/`ruta` fuera de HMAC | Incluir todos los campos de control en el canonical payload HMAC y rotar clave por sesión/campus |
| **REM-06** | **P0** | B12/M56, M59 | `MeshNativa.java:56, 433-441, 494-496` | `MAX_CONECTADOS = 4` detiene discovery manteniendo advertising y aísla grupos | Elevar límite/rotación de enlaces y detener advertising o rotar vecinos saturados |
| **REM-07** | **P0** | B5/M25, B13/M62 | `MeshNativa.java:626-628` | Broadcasts `TODOS`/`SOS`/`emergencia`/`bloqueo` no se guardan en `bandeja` | Persistir todo broadcast crítico en `bandeja` nativa y drenar al reanudar WebView |
| **REM-08** | **P0** | B10/M49, B16/M76 | `firestore.rules:195-220, 240-250` | `read: if true` expone `usuarios` (`sal`/`hash`), `mensajes` y escrituras abiertas en `reportes_bloqueo` | Exigir `request.auth != null`, aislar credenciales y exigir `isAdminAuth()` para resolver bloqueos |
| **REM-09** | **P0** | B14/M67, B15/M73 | `mobile/motor-offline.js:608, 735-772, 1399-1413` | `/api/campus/bloquear` offline muta estado y emite Mesh sin validar rol admin | Validar sesión/rol admin firmado antes de mutar `S.campus` o emitir `accion:"bloquear"` |
| **REM-10** | **P0** | B7/M32, B20/M96 | `frontend/static/cuenta.js:1054, 1537` | Invitado (`YO === null`) crashea en `elegirLugar()` y pierde `enviarSOS()` | Crear perfil efímero de invitado con ID único y habilitar ubicación + SOS |
| **REM-11** | **P0** | B17/M81, B21/M101 | `frontend/static/app.css:68, 118, 907, 955, 1926, 2803, 2817`; `cuenta.css:579` | Modo oscuro redefine `--blanco: #131c29` (`3.15:1`–`3.80:1`) y `.chat-lista` pinta `fondo-marca.svg` claro | Separar tokens de superficie/texto (`#ffffff` sobre acentos) y quitar fondo claro en dark mode |
| **REM-12** | **P0** | B19/M91, M93 | `cuenta.js:1472, 1506`; `EmergencyAlertActivity.java:312-364` | `AudioContext` queda `"suspended"` sin gesto previo; alarma nativa ignora `prefs.tono`/`prefs.vibrar` | Pre-desbloquear `AudioContext` en primer toque y leer `prefs` en `EmergencyAlertActivity` |
| **REM-13** | **P1** | B25/M121 | `UnexuamMessagingService.java:19, 66, 96` | Usa canal `"unexuam_emergencias"` sin crearlo en `NotificationManager` | Registrar `NotificationChannel` `IMPORTANCE_HIGH` al iniciar servicio y app |
| **REM-14** | **P1** | B11/M52, B25/M122 | `AndroidManifest.xml:72, 75`; `MainActivity.java:366` | Falta `canUseFullScreenIntent()` (Android 14+), `neverForLocation` y listener BT `STATE_OFF` | Verificar `canUseFullScreenIntent()`, añadir flag BLE y escuchar `ACTION_STATE_CHANGED` |
| **REM-15** | **P1** | B12/M60 | `MeshNativa.java:462`; `motor-offline.js:1485` | Todos los invitados comparten ID `"INVITADO"` y se bloquean entre sí | Generar sufijo aleatorio persistente por instalación (`INV-<4hex>`) |
| **REM-16** | **P1** | B6/M29, B28/M136 | `mobile/Unexuam.apk` vs `app-release.apk` | `mobile/Unexuam.apk` es debug (`9.6 MB`) en vez del release (`2.89 MB`) | Sobrescribir `mobile/Unexuam.apk` con `app-release.apk` firmado |
| **REM-17** | **P1** | B17/M83, B20/M100 | `cuenta.css:243-244, 265, 1700, 1840`; `app.css:1702` | `.toast` (`z:30`) y `#hoja` (`z:25`) quedan debajo de modales (`z:50/80/90`) | Elevar `.toast` a `z-index: 200` y `#hoja` sobre modales activos |
| **REM-18** | **P1** | B6/M26, B24/M119 | `app.py:926-931`; `requirements.txt:1-171` | Falta `google-auth` en `requirements.txt` (`find_spec == None`) | Agregar `google-auth` fijado en `requirements.txt` |
| **REM-19** | **P1** | B15/M72, M74 | `app.py:555-576, 580-641, 723-744` | Sin rate-limit IP, `INTENTOS`/`BUSQUEDAS` sin `Lock`, `/api/mensajes/general` en `LIBRES` | Proteger diccionarios con `threading.Lock`, añadir límite por IP y retirar ruta de `LIBRES` |
| **REM-20** | **P1** | B23/M111, M112 | `frontend/static/sw.js:4-45, 96-106` | Faltan `nube-firebase.js` e `i18n.js` en `ASSETS`; `.catch` puede retornar `undefined` | Agregar ambos scripts a `ASSETS` y retornar `Response` fallback válida |
| **REM-21** | **P2** | B8/M40, B9/M41 | `nube-firebase.js:226-231`; `basedatos.py:85-101, 217-233` | `listarMensajes(60)` sin `orderBy('ts')`; `PRAGMA user_version = 0`; triple `OR` y 2 `ResourceWarning` | Añadir `.orderBy('ts')`, migraciones `user_version`, índices y cerrar conexiones SQLite |
| **REM-22** | **P2** | B20/M97, M98 | `cuenta.js:517` vs `app.py:565`; `app.js:1613, 1616` | Password min `4` vs `6`; `LUGARES_DESTACADOS` usa `"Biblioteca"`/`"Cafetería"` en vez de `"Edificio I"`/`"Food Court"` | Alinear `minlength=6` y sincronizar `LUGARES_DESTACADOS` con `backend/datos.py:103-104` |
| **REM-23** | **P2** | B21/M102 | `app.css:2995, 3056, 3074, 3092`; `cuenta.css:360, 1623` | Tap targets `< 44 px` (`.capa-chip` ~28px, `.banner-em-btn` ~29px, `.sel-*` ~30px) | Establecer `min-height: 44px; min-width: 44px` en botones táctiles críticos |
| **REM-24** | **P2** | B22/M107 | `frontend/static/ajustes.js:187-244` | Re-render completo con `innerHTML` en cada tecleo de `#aj-q` | Filtrar nodos existentes por clase/atributo con debounce de `120 ms` |
| **REM-25** | **P3** | B18/M86-M90 | `frontend/static/img/*`; `mapa-campus-3d.svg` | `1,248.5 KB` sin WebP, `ico-fuego.png` (`1501x2108`), SVGs ligeros sin usar y `2,315` nodos en mapa | Usar `.svg` en tarjetas (`0.99/1.05 KB`), redimensionar `ico-fuego`, purgar huérfanos y simplificar SVG |

---

# EXTENSIÓN DE AUDITORÍA FORENSE — MAPA 3D (BLOQUES 31–35 / M151–M175)

> **Hallazgo Arquitectónico Base del Motor 3D:** `UNEXUAM` **no** utiliza Three.js, WebGL ni modelos `.glb`/`.gltf`. El "Mapa 3D" se compone de: (1) un plano axonométrico SVG pre-generado en Python (`docs/mapa-campus/generar_mapa.py`, `ANG = 16°`, `K = 0.58`) guardado en `frontend/static/img/mapa-campus-3d.svg` (`280,865` bytes) e incrustado vía `<image>` en `frontend/static/app.js:1251, 1765`, y (2) un renderizador SVG en tiempo real de edificios en vista explotada (`edificio3D()` en `frontend/static/app.js:899-1094`) alimentado por `frontend/static/campus-plano.json` (`6,155` bytes).

---

## BLOQUE 31: MAPA 3D — GEOMETRÍA, MODELOS Y OPTIMIZACIÓN GRÁFICA

### M151: Formato, peso y tiempo de carga inicial del modelo 3D
- **Evidencia:** `frontend/static/img/mapa-campus-3d.svg` pesa `280,865` bytes (`~274.3 KB`) en SVG plano sin compresión binaria/gzip estática dedicada, acompañado de `frontend/static/campus-plano.json` (`6,155` bytes) y `frontend/static/ubicacion-campus.json` (`9,418` bytes). En `docs/mapa-campus/mapa-campus-3d.png` existe un PNG de `3,324,858` bytes (`3.17 MB`, no usado en runtime).
- **Impacto en piloto:** Aunque `274.3 KB` es ligero frente a un `.glb` sin comprimir, al incrustarse como `<image href="/static/img/mapa-campus-3d.svg">` (`app.js:1251, 1765`) en múltiples `<svg>` (mapa principal + tarjetas `vistaPaso()` en `app.js:774, 1257`), el WebView debe parsear y rasterizar el árbol SVG repetidamente.
- **Solución:** Mantener el formato vectorial/híbrido pero simplificar primitivas del SVG y generar una textura rasterizada WebP (`~80-120 KB`) para miniaturas `vistaPaso()` en dispositivos lentos.

### M152: Conteo de primitivas (*polycount*), *draw calls* y vértices por edificio
- **Evidencia:** Medición directa sobre `frontend/static/img/mapa-campus-3d.svg`: `1,384` `<polygon>`, `350` `<line>`, `21` `<path>`, `131` `<text>` y `55` referencias `linearGradient`/`filter=`/`drop-shadow` (`1,941` primitivas gráficas). Adicionalmente, `edificio3D()` (`app.js:941-1016`) genera dinámicamente por cada piso losas, cantos, pabellones, muros, franjas de ventanas, puertas, tabiques divisorios, escaleras y peldaños.
- **Impacto en piloto:** En teléfonos Android de gama baja, cada paso de la guía en `vistaPaso()` (`app.js:774`) inserta un `<svg class="e3d mini">` o `<svg class="c3d mini">` completo en el DOM, multiplicando nodos vectoriales y trabajo de composición Skia.
- **Solución:** Reducir peldaños/tabiques decorativos en modo `o.mini` (`app.js:977-990`) y cachear un único `<symbol>`/`<canvas>` para miniaturas de campus en lugar de instanciar `<image>` repetidas.

### M153: Niveles de detalle (LOD), *frustum culling* e instanciación
- **Evidencia:** `docs/mapa-campus/generar_mapa.py:437-449` (`terraza()`) genera decenas de `<line>` individuales (`n = max(1, int(dist // 3))`) para la baranda del Edificio P, y `app.js:962-991` dibuja cada puerta/peldaño/tabique sin LOD ni *culling* de pisos fuera de viewport en vista normal.
- **Impacto en piloto:** Detalles microscópicos (barandas, peldaños, parteluces) se dibujan incluso cuando el usuario ve el campus completo (`zoom` alejado), desperdiciando ciclos de rasterización y ensuciando visualmente el Edificio P.
- **Solución:** Implementar LOD por nivel de zoom/contexto (`o.mini` vs completo): omitir peldaños, puertas y barandas cuando el ancho del `viewBox` supere `700` unidades.

### M154: Optimización de texturas, gradientes y materiales
- **Evidencia:** `mapa-campus-3d.svg` contiene `55` usos de `linearGradient`/`filter=`/`drop-shadow` (ej. `url(#solar)`, `url(#brillo)` en `generar_mapa.py:367, 503`), sin *mipmaps* ni *texture atlases* porque opera sobre SVG.
- **Impacto en piloto:** Los filtros SVG (`filter=`, `drop-shadow`) obligan a crear *offscreen render targets* en el compositor del WebView, penalizando el framerate durante pan y pinch.
- **Solución:** Reemplazar `filter=` / `drop-shadow` en `generar_mapa.py` por polígonos de sombra planos con opacidad alpha (`rgba`) precalculada.

### M155: Fallos visuales de malla, oclusión de pisos y clipping
- **Evidencia:**
  - `docs/mapa-campus/generar_mapa.py:437-449` dibuja una baranda perimetral en el techo del Edificio P que en proyección axonométrica se percibe como una barda sin sentido en el 3er piso.
  - `app.js:1019` tuvo que agregar manualmente `if (F.solar && !o.interactivo)` porque la malla de celdas solares tapaba las aulas del piso 3 al seleccionar ubicación.
  - `app.js:1027-1030` dibuja `<circle r="1.3">` y `<ellipse rx="3.6" ry="2.8">` sin multiplicar por `k` (`app.js:930`), quedando desproporcionados respecto al resto de la geometría escalada.
- **Impacto en piloto:** Artefactos visuales en el Edificio P y desproporción del observatorio al hacer zoom.
- **Solución:** Retirar/simplificar `terraza()` en la vista aérea si no aporta lectura de evacuación y multiplicar `r`, `rx`, `ry` de `app.js:1028-1030` por `k`.

---

## BLOQUE 32: MAPA 3D — RENDIMIENTO GPU, MEMORIA VRAM Y BATERÍA

### M156: Perfilado de FPS reales y *jank* al rotar/hacer pan
- **Evidencia:** `app.js:1319-1352` (`conectarPanZoomCampus`) y `app.js:1668-1695` (`conectarPanZoomUb`) aplican `translate3d(...) scale(...)` vía `requestAnimationFrame` durante el gesto, pero en `pointerup` (`commit()`, `app.js:1319, 1668`) limpian `transform` y mutan el atributo `viewBox` del `<svg>`.
- **Impacto en piloto:** Durante el gesto es fluido en GPU, pero al soltar el dedo, mutar `viewBox` sobre un `<svg>` con `<image href="mapa-campus-3d.svg">` (`274 KB`, `1,941` primitivas) fuerza una re-rasterización síncrona de Skia que produce un micro-salto (*jank*) en gama media/baja.
- **Solución:** Pre-rasterizar la capa base del campus en un `<canvas>` offscreen / WebP de alta resolución (`2048px`) para pan/zoom instantáneo sin re-parseo SVG.

### M157: Limpieza de memoria GPU/DOM (`dispose()` equivalente)
- **Evidencia:** `app.js:1451, 1467` y `app.js:1764` sobrescriben `innerHTML` directamente en cada cambio de ruta, paso o modo. Al no usar WebGL no hay `renderer.dispose()`, pero tampoco se revocan ni reutilizan nodos SVG ni se limpian los `pointer` maps si la vista se oculta bruscamente.
- **Impacto en piloto:** Múltiples re-renders de `renderMapa3D()` en una emergencia con recálculo de ruta recrean decenas de nodos SVG y `<image>` duplicadas en memoria del WebView.
- **Solución:** Mantener un único nodo `<svg>` base montado y actualizar únicamente las capas `<g>` de ruta/halos (`#capa-ruta`, `#capa-halos`) por DOM diffing ligero.

### M158: Pérdida de contexto gráfico al ir a segundo plano
- **Evidencia:** Al usar SVG/DOM en lugar de WebGL (`<canvas>` WebGL), no existe `webglcontextlost`; sin embargo, `MainActivity.java:85-89` fuerza `getWebView().reload()` a los `1200 ms`, destruyendo cualquier estado de cámara (`camCampus`, `ubCam`) y SVG montado.
- **Impacto en piloto:** Reinicio visual completo al arrancar y pérdida de foco del mapa si la app recrea el WebView.
- **Solución:** Eliminar `reload(1200L)` (`MainActivity.java:85-89`) y persistir `camCampus` / `pasoActivo` en `sessionStorage` ante suspensión del OS.

### M159: Control de *pixel ratio*, *antialiasing* y renderizado bajo demanda
- **Evidencia:** El mapa SVG solo re-renderiza cuando cambia la ruta o el usuario interactúa (es naturalmente *on-demand* sin loop `requestAnimationFrame` continuo), lo cual protege la batería cuando está quieto. Sin embargo, `app.js:1217` usa `.r3-pulso` (animación CSS continua sobre SVG) mientras la ruta está visible.
- **Impacto en piloto:** Una animación CSS infinita sobre un SVG grande puede mantener activo el hilo de composición en WebViews antiguos; además falta `@media (prefers-reduced-motion: reduce)`.
- **Solución:** Limitar `.r3-pulso` con `will-change` aislado en un overlay HTML/CSS ligero o desactivarlo bajo `prefers-reduced-motion`.

### M160: Modo degradado o fallback 2D automático
- **Evidencia:** Existe una vista 2D de grafo en `cuenta.js:1059-1160` (`#svg-alg`, Dijkstra 2D para explicación del algoritmo), pero **no existe fallback 2D automático** en `#mapa-campus` (`app.js:1416-1476`) ni en `#ub-mapa-wrap` (`app.js:1747-1775`) si falla `mapa-campus-3d.svg` o `campus-plano.json`. Si `!PLANO`, `app.js:1430` deja `svgHtml = ""` (lienzo vacío).
- **Impacto en piloto:** Si `campus-plano.json` tarda o falla al cargar, el usuario ve un mapa en blanco sin fallback 2D ni lista textual alternativa inmediata.
- **Solución:** Si falla `PLANO` o la carga de `mapa-campus-3d.svg`, renderizar automáticamente un esquema 2D simplificado con los polígonos de `ubicacion-campus.json` o la guía paso a paso en primer plano.

---

## BLOQUE 33: MAPA 3D — CÁMARA, CONTROLES TÁCTILES Y ERGONOMÍA ESPACIAL

### M161: Fluidez, inercia (*damping*) y gestos táctiles sin conflictos
- **Evidencia:**
  - `#mapa-campus` (`app.css:2689` `touch-action: none`, `app.js:1354-1413`) soporta pan 1 dedo, pinch 2 dedos, `wheel` y `dblclick` con `setPointerCapture`.
  - `#ub-mapa-wrap` (`app.js:1696-1733`) implementa pan y pinch, pero **sin `setPointerCapture`, sin `wheel`, sin `dblclick` y sin inercia (*damping*)** en ninguno de los dos mapas.
  - **Sin rotación/inclinación:** la cámara es 100% plana sobre una imagen axonométrica fija (`GIRO = 16°`, `ACHATE = 0.58` en `app.js:804`).
- **Impacto en piloto:** Al arrastrar rápido el mapa en celular se detiene en seco (sensación rígida), y en el modal de ubicación si el dedo sale de `#ub-mapa-wrap` se pierde el seguimiento por falta de `setPointerCapture`.
- **Solución:** Añadir `setPointerCapture` en `conectarPanZoomUb()` (`app.js:1696`) y aplicar desaceleración exponencial suave (`vx *= 0.9`) en `pointerup`.

### M162: Límites estrictos de cámara (*bounding box* y zoom min/max)
- **Evidencia:** `acotarCamara(vb)` (`app.js:1278-1287`) limita `w` entre `[100, 1600]` y `[x, y]` dentro de `[0..1600, 0..1060]`; `acotarCamUb(vb)` (`app.js:1643-1652`) limita `w` entre `[320, 1600]` y `y >= 60`.
- **Impacto en piloto:** Evita perderse en el vacío (bien resuelto en límites X/Y), pero al no tener rotación orbital ni cámara libre 3D, no existe riesgo de atravesar el suelo ni quedar dentro de un edificio.

### M163: Controles rápidos de rescate (centrar, brújula, mi ubicación)
- **Evidencia:** `app.js:1420-1425` renderiza `.mapa-brujula` (`N ↑`, con `pointer-events: none` en `app.css:2773`) y `.mapa-controles` (`+`, `−`, `◎` centrar ruta). En `#ub-mapa-wrap` (`app.js:1768-1772`) ni siquiera hay brújula y falta botón **"Mi ubicación GPS"** en `.mapa-controles`.
- **Impacto en piloto:** Durante una emergencia, el usuario no tiene un botón de un toque sobre el mapa para recentrar su posición GPS actual, y la brújula no es interactiva ni orientable.
- **Solución:** Agregar botón de ubicación GPS actual en `.mapa-controles` y mantener la brújula alineada al norte real del plano (`16°` de inclinación respecto a la vertical del SVG).

### M164: Comportamiento de cámara al seleccionar edificio/paso y colisión con modales
- **Evidencia:** En `renderMapa3D()` (`app.js:1465-1467`), al cambiar `pasoActivo` se recalcula el `viewBox` centrado en el tramo (`campusSvg`), pero en el selector de ubicación (`app.js:1762`), al tocar un edificio multinivel salta bruscamente a `renderPasoFrenteEdificio()` (`app.js:1784`) reemplazando todo el mapa por la vista explotada, donde además botones y chips se solapan en pantallas pequeñas (reportado en campo).
- **Impacto en piloto:** Desorientación espacial entre la vista del campus y la vista interna del edificio, además de solapamiento de controles en el selector.
- **Solución:** Simplificar el selector de ubicación dejando el mapa limpio con áreas táctiles por polígono y una transición visual clara hacia la lista/vista de pisos sin botones encimados.

### M165: Manejo de oclusión detrás de edificios altos
- **Evidencia:** `app.js:1125` eleva `pinTu` a `z = 14` sobre edificios multinivel, pero los marcadores de `halos` (congestión, bloqueos, sin señal en `app.js:1221-1248`) y puntos de salida (`posCampus` en `app.js:1111`) se proyectan con `z = 0`. Si una salida o punto queda al norte de un edificio de 3 pisos (`B`, `C`, `P`), la silueta del edificio en `mapa-campus-3d.svg` lo tapa visualmente.
- **Impacto en piloto:** Puntos seguros o bloqueos al norte de un edificio alto quedan parcialmente ocultos tras el volumen dibujado.
- **Solución:** Elevar marcadores de alerta/ruta (`z = 6..10` o indicador con línea guía vertical) o aplicar transparencia en el halo/overlay por encima de la capa `mapa-campus-3d.svg`.

---

## BLOQUE 34: MAPA 3D — INTERACTIVIDAD, POIs E INTEGRACIÓN MESH / DATOS

### M166: Precisión del *raycasting* / selección táctil en mapa
- **Evidencia:**
  - En `#mapa-campus` (`app.js:1250-1253`), el mapa es una `<image>` estática sin áreas táctiles sobre los edificios.
  - En `#ub-mapa-wrap` (`app.js:1762`), los edificios se detectan mediante `<ellipse class="ub-hit-area" rx="${item.rx || 54}" ry="${item.ry || 34}">` centradas en un único punto, **ignorando los polígonos reales** de `campus-plano.json` / `ubicacion-campus.json` y dejando botones redundantes superpuestos (`#ub-edificios-chips`).
- **Impacto en piloto:** Tocar el extremo de un edificio alargado (como `B`, `C` o `P`) puede fallar o activar un edificio vecino si las elipses se traslapan.
- **Solución:** Generar `<polygon class="ub-hit-area">` proyectando directamente los polígonos reales de `PLANO.edificios` / `ubicacion-campus.json` (`areas[].pol`) sobre la vista 3D y mostrar resaltado (`stroke` / `fill`) al tocar.

### M167: Gestión de etiquetas flotantes y *clustering*
- **Evidencia:** `app.js:1148-1214` implementa prevención básica de colisión rectangular (`choca()`) solo para etiquetas de nodos/pesos de la ruta activa, pero **no** agrupa ni oculta por zoom los `halos` de `zonasSeguras`, `congestion`, `bloqueos` y `sinSenal` (`app.js:1221-1248`), ni las etiquetas pre-quemadas en `mapa-campus-3d.svg` (`131` nodos `<text>`).
- **Impacto en piloto:** Con múltiples reportes simultáneos en un simulacro, los círculos de `halos` y textos del SVG base se amontonan en el centro del campus.
- **Solución:** Escalar/ocultar etiquetas secundarias según `camCampus[2]` (nivel de zoom) y agrupar alertas cercanas cuando `w > 900`.

### M168: Visualización en tiempo real de datos dinámicos y Mesh
- **Evidencia:** `app.js:1221-1248` dibuja `zonasSeguras`, `congestion`, `bloqueados` y `sinSenal` leyendo `E.campus`, pero **no** muestra nodos Mesh cercanos activos ni la posición GPS en vivo durante una emergencia, y cada actualización completa llama `renderMapa3D()` (`app.js:734, 739, 780`) reconstruyendo todo el `innerHTML`.
- **Impacto en piloto:** Parpadeo del mapa en actualizaciones frecuentes y ausencia de visibilidad en tiempo real de dónde está el usuario respecto a la ruta de emergencia.
- **Solución:** Vincular `UnexuamUbicacion.seguir()` (`ubicacion.js:63`) automáticamente al activarse una emergencia para mover un marcador SVG `#pin-gps-vivo` sin reconstruir el mapa completo.

### M169: Navegación espacial, búsqueda de aulas y multi-piso
- **Evidencia:**
  - Multi-piso: `edificio3D()` (`app.js:899-1094`) soporta `B`, `C`, `P` con vista explotada y pestañas por piso (`app.js:1803`).
  - Búsqueda de aulas: `app.js:549` define `RX.aula = /^([A-Z])-(\d)(\d{2})$/`, exigiendo guion obligatorio. Un usuario que escribe `c301` en lugar de `C-301` falla en el emparejamiento si no hay normalización previa en el buscador.
  - Además `app.js:1613, 1616` (`LUGARES_DESTACADOS`) referencia `"Biblioteca"` y `"Cafetería"` en vez de `"Edificio I"` y `"Food Court"` (`backend/datos.py:103-104`).
- **Impacto en piloto:** Errores frecuentes de "lugar no encontrado" en búsqueda rápida durante una emergencia.
- **Solución:** Normalizar entradas con `s.trim().toUpperCase().replace(/^([A-Z])\s*-?\s*(\d{3})$/, "$1-$2")` y corregir `LUGARES_DESTACADOS`.

### M170: Sincronización bidireccional Mapa ↔ UI
- **Evidencia:** Tocar un paso de la guía resalta el tramo en el mapa (`pasoActivo`), pero tocar un edificio o punto en el mapa principal `#mapa-campus` no abre tarjeta de detalle ni permite acciones rápidas (reportar bloqueo en ese tramo, cambiar origen), mientras `#capas-filtros` (`index.html:192`) sí filtra capas (`CAPAS_MAPA` en `app.js:1115`) pero forzando re-render completo.
- **Impacto en piloto:** Interacción unidireccional limitada en la vista principal del mapa.
- **Solución:** Permitir tocar aristas/edificios en `#mapa-campus` para mostrar acciones contextuales ("Estoy aquí", "Reportar bloqueo") y alternar capas con atributos `hidden` en `<g>` sin regenerar el SVG.

---

## BLOQUE 35: MAPA 3D — GEORREFERENCIACIÓN, ESTÉTICA Y MODO OFFLINE

### M171: Precisión de georreferenciación (GPS ↔ plano local)
- **Evidencia:** `frontend/static/ubicacion.js:18-21`, `ubicacion-campus.json:1` y `campus-plano.json:1` comparten el mismo origen OpenStreetMap (`lat0: 12.1096532`, `lon0: -86.2590792`, `cosLat: 0.977746`) con proyección plana local `x = (lon - lon0) * cos(lat0) * 111320`, `y = (lat0 - lat) * 110574` y rotación de plano `16°` (`app.js:804`, `generar_mapa.py:36`).
- **Impacto en piloto:** La calibración geométrica es exacta a escala de campus (~375 m); la brecha operativa es que `ubicacion.js` solo se invoca bajo demanda al elegir lugar (`cuenta.js:1031`), no en seguimiento continuo durante emergencia activa.
- **Solución:** Activar `UnexuamUbicacion.seguir()` automáticamente cuando `E.emergencia` esté activa (con throttle de `4000 ms` ya configurado en `ubicacion.js:80`).

### M172: Operación 100% Offline del Mapa 3D
- **Evidencia:** `frontend/static/sw.js:13-14, 25` cachea `/static/ubicacion-campus.json`, `/static/campus-plano.json` y `/static/img/mapa-campus-3d.svg` junto con `/campus-offline.json`, y `mobile/preparar_web.py` los copia al bundle Android.
- **Impacto en piloto:** Los assets del mapa están disponibles 100% offline. El riesgo latente es que `app.js:837-840` carga `campus-plano.json` con `.catch(() => {})` silencioso y `sw.js:105` puede devolver `undefined` si falla una petición no cacheada.
- **Solución:** Garantizar `Response` fallback en `sw.js:105` y precarga síncrona/reintento de `campus-plano.json`.

### M173: Dirección de arte, iluminación y adaptación Claro / Oscuro
- **Evidencia:** `generar_mapa.py:27-32` y `app.js:809-814` usan una paleta diurna luminosa (`#fbfcfd`, `#e6eaef`, `#ffffff`). Sin embargo, `mapa-campus-3d.svg` se inserta como `<image>` fija en `app.js:1251, 1765`, por lo que en **Modo Oscuro** (`html[data-tema="oscuro"]`) sigue brillando como un rectángulo blanco/claro sin adaptación nocturna (ni clase `.r3-velo` suficiente ni variantes de tema).
- **Impacto en piloto:** Deslumbramiento nocturno en modo oscuro y ruptura estética frente a los paneles oscuros.
- **Solución:** Aplicar filtro CSS/SVG calibrado en modo oscuro (`filter: brightness(0.82) contrast(1.08)` sobre `<image>` o fondo oscuro en `.mapa3d`) y ajustar colores de `.e3d` por variables CSS de tema.

### M174: Auditoría "Anti-IA" en el Mapa 3D
- **Evidencia:** El plano base en `generar_mapa.py` tiene buena identidad UAM (observatorio Copérnico en Edificio P, colores institucionales), pero falla por **exceso de detalle decorativo irrelevante para evacuación** (`131` textos internos, baranda en techo del Edificio P `generar_mapa.py:437-449`, etiqueta de `"celdas solares"`, botones redundantes superpuestos al elegir edificio).
- **Impacto en piloto:** Ruido visual y carga cognitiva innecesaria bajo estrés.
- **Solución:** Limpiar `generar_mapa.py` dejando siluetas arquitectónicas nítidas, siglas claras de edificio (`A`, `B`, `C`, `P`, `I`, etc.) y puntos seguros en alto contraste, eliminando adornos no funcionales.

### M175: Estados de carga, error recuperable y arranque no bloqueante
- **Evidencia:** `app.js:837-840` lanza `fetch("/static/campus-plano.json")` de forma asíncrona (no bloquea el arranque), pero con `.catch(() => {})`: no muestra barra/indicador de progreso mientras carga `PLANO` o decodifica `mapa-campus-3d.svg`, ni muestra pantalla de error con botón "Reintentar" si falla (`app.js:1430` simplemente renderiza `""`).
- **Impacto en piloto:** En dispositivos lentos o ante un fallo de lectura, el contenedor `#mapa-campus` aparece vacío sin explicación ni recuperación.
- **Solución:** Mostrar skeleton/estado de carga explícito en `#mapa-campus` hasta resolver `PLANO` y un estado de error con botón `Reintentar` + enlace directo a la lista textual de ruta.

---

### Adenda a Matriz Maestra de Remediación (Mapa 3D: REM-26 a REM-33)
| ID | Prioridad | Bloque/Módulo | Archivo:Línea | Diagnóstico / Sugerencia | Acción exacta |
| :--- | :---: | :--- | :--- | :--- | :--- |
| **REM-26** | **P1** | B34/M166 | `app.js:1762` | Áreas táctiles del mapa son `<ellipse>` genéricas y botones superpuestos en vez del contorno real | Proyectar `areas[].pol` de `ubicacion-campus.json` como `<polygon class="ub-hit-area">` tocables |
| **REM-27** | **P1** | B34/M169 | `app.js:549, 1613, 1616` | `RX.aula` exige guion (`C-301`, rechaza `c301`) y `LUGARES_DESTACADOS` usa `"Biblioteca"`/`"Cafetería"` | Normalizar `c301`→`C-301` en buscador y corregir nombres contra `backend/datos.py:103-104` |
| **REM-28** | **P1** | B34/M168, B35/M171 | `ubicacion.js:63`; `app.js:1215` | `UnexuamUbicacion.seguir()` no se activa en emergencia para actualizar posición en vivo | Suscribir `seguir()` cuando `E.emergencia` esté activa y mover `#pin-gps-vivo` en el SVG |
| **REM-29** | **P1** | B31/M155, B35/M174 | `generar_mapa.py:437-449`; `app.js:1019, 1027-1030` | Baranda en techo del Edificio P parece barda en 3er piso; texto redundante; sello/cúpula sin escala `k` | Simplificar `terraza()`, limpiar etiquetas superfluas y escalar observatorio por `k` |
| **REM-30** | **P2** | B33/M161, M163 | `app.js:1661-1734, 1420-1425` | `#ub-mapa-wrap` sin `setPointerCapture`/`wheel`/`dblclick`; sin inercia ni botón GPS en `.mapa-controles` | Añadir `setPointerCapture`, `damping` en `pointerup` y botón rápido de ubicación GPS |
| **REM-31** | **P2** | B32/M156-M160, B35/M175 | `app.js:837-840, 1430, 1467` | Re-render completo por `innerHTML` y `.catch(() => {})` silencioso deja mapa en blanco sin fallback 2D | Reutilizar `<svg>` base, agregar skeleton/reintento y fallback 2D si falla `PLANO` |
| **REM-32** | **P2** | B35/M173 | `app.js:1251`; `app.css` | `<image href="mapa-campus-3d.svg">` permanece brillante en modo oscuro | Aplicar adaptación visual nocturna en `html[data-tema="oscuro"] .mapa3d image` |
| **REM-33** | **P3** | B31/M152-M154 | `mapa-campus-3d.svg`; `generar_mapa.py:367` | `1,941` primitivas y `55` gradientes/filtros penalizan miniaturas repetidas en `vistaPaso()` | Sustituir filtros SVG por sombras planas y usar LOD reducido en `o.mini` |
