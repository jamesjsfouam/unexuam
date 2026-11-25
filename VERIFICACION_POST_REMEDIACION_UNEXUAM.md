# AUDITORÍA DE VERIFICACIÓN POST-REMEDIACIÓN — UNEXUAM (RE-AUDITORÍA FINAL)

**Rol Auditor:** QA Independiente, Seguridad (AppSec) y Release Manager  
**Alcance:** Re-auditoría completa de los 33 hallazgos (`REM-01` a `REM-33`) tras corregir la sincronización Android, la regresión de invitados en `/api/mensajes/general` y Firebase Auth para estudiantes.

---

## 1. VERIFICACIÓN PUNTO POR PUNTO (`REM-01` A `REM-33`)

> **Criterio:** Todos los archivos web/móviles (`12/12`) fueron re-verificados por SHA-256 entre `frontend/static/` + `mobile/motor-offline.js` y `mobile/android/app/src/main/assets/public/static/`, y empaquetados en el APK release final.

| ID | Estado | Archivo:Línea verificada | Evidencia real observada |
| :--- | :---: | :--- | :--- |
| **REM-01** | **PASS** | `mobile/motor-offline.js:392` + `assets/.../motor-offline.js` | Usa `UBIC?.[v.nombre]`; hash idéntico en APK (`2CE537B61F49`). |
| **REM-02** | **PASS** | `MeshForegroundService.java:45-54, 263`; `MainActivity.java:78-83` | `MeshForegroundService` posee `instanciaMesh` y reanuda tras `START_STICKY`. |
| **REM-03** | **PASS** | `MainActivity.java:78-87` | Eliminado `postDelayed(reload, 1200L)` (0 ocurrencias). |
| **REM-04** | **PASS** | `mobile/motor-offline.js:1675, 1691`; `MeshNativa.java:240-260` | Sin reset `meshIniciado = false` cada `6000 ms`; reintenta con `reintentarMeshSiDesconectado()`. |
| **REM-05** | **PASS** | `build.gradle:22-23`; `MeshNativa.java:66-70, 140-156` | HMAC derivado SHA-256 desde `BuildConfig.MESH_HMAC_KEY`; cubre `hello` y campos críticos. |
| **REM-06** | **PASS** | `MeshNativa.java:57, 482-510` | `MAX_CONECTADOS = 6`, pausa discovery+advertising al llenarse y rotación `>= 90 s`. |
| **REM-07** | **PASS** | `MeshNativa.java` (`guardarEntrada`/`recuperarEntradas`); `motor-offline.js:1506-1507` | Broadcasts `TODOS` persistidos en `bandeja` y drenados al reanudar; JS sincronizado en APK. |
| **REM-08** | **PASS** | `firestore.rules:11-16, 88-95, 216-292`; `nube-firebase.js:100-149` | `read: if true` eliminado en `usuarios`, `mensajes` y `reportes_bloqueo`; `--dry-run` Firebase OK; `nube-firebase.js` implementa `autenticarEstudiante()` REST sincronizado en APK (`060F41A53DA2`). *(Requiere habilitar Email/Password y API Key en Firebase cuando se use nube; offline/Mesh opera sin bloqueo).* |
| **REM-09** | **PASS** | `mobile/motor-offline.js:643, 1442-1443` | `/api/campus/bloquear` en `SOLO_ADMIN` y validación `deAdmin` en Mesh; sincronizado en APK. |
| **REM-10** | **PASS** | `cuenta.js:162-186, 1047, 1588`; `motor-offline.js:435, 646` | Invitado usa `perfilActivo()` en `elegirLugar()` y `enviarSOS()` sin error; sincronizado en APK. |
| **REM-11** | **PASS** | `app.css:42, 70, 914, 929, 961, 2805-2807`; `cuenta.css:582, 799` | `--texto-sobre-acento: #ffffff` y fondo claro removido de `.chat-lista` en dark mode; sincronizado en APK. |
| **REM-12** | **PASS** | `EmergencyAlertActivity.java:316`; `MainActivity.java:501`; `cuenta.js:1498`; `ajustes.js:116` | `AudioContext` desbloqueado en primer toque y prefs `tono`/`vibrar` sincronizadas con alarma nativa. |
| **REM-13** | **PASS** | `UnexuamMessagingService.java:26, 29, 77, 110` | Canal `"unexuam_emergencias"` registrado con `IMPORTANCE_HIGH`. |
| **REM-14** | **PASS** | `AndroidManifest.xml:75`; `MainActivity.java:510-530`; `cuenta.js:1452` | `neverForLocation`, `canUseFullScreenIntent()` (Android 14+) y listener `STATE_OFF`; JS en APK. |
| **REM-15** | **PASS** | `cuenta.js:164`; `motor-offline.js:435`; `MeshNativa.java:536` | ID único persistente `INV-<4HEX>` por dispositivo; sincronizado en APK. |
| **REM-16** | **PASS** | `mobile/Unexuam.apk` & `app-release.apk` (`2,677,321` B, SHA-256 `78E5C1A5...`) | `preparar_web.py:155-163` sincroniza `assets/public/`; APK recompilado con **12/12** hashes idénticos. |
| **REM-17** | **PASS** | `app.css:1704, 1925`; `cuenta.css:243-244` | `#hoja` (`120`) y `.toast` (`200`) sobre modales (`50/80/90`); sincronizado en APK. |
| **REM-18** | **PASS** | `requirements.txt:11-13` | `google-auth==2.38.0` fijado con hashes SHA-256. |
| **REM-19** | **PASS** | `app.py:389, 588, 770-811`; `motor-offline.js:644, 1036` | `RATE_LOCK`, límites por IP (`INTENTOS_IP`, `REGISTROS_IP`, `SOS_INV_IP`), `GET` general abierto y `POST` anónimo permitido solo para `SOS` (`test_canal_general_invitado_solo_lectura_y_sos` OK). |
| **REM-20** | **PASS** | `sw.js:2, 12-13, 106` | `unexuam-v28`, `nube-firebase.js` e `i18n.js` cacheados, `.catch()` retorna `503` válido; sincronizado en APK. |
| **REM-21** | **PASS** | `basedatos.py:85, 105-127, 248`; `nube-firebase.js:227`; `tests/test_api.py:251` | `PRAGMA user_version = 1`, índices, `UNION`, `cerrar()` + `atexit`, **0 `ResourceWarning`** y `orderBy=ts desc` en APK. |
| **REM-22** | **PASS** | `cuenta.js:543`; `app.js:1728` | Clave mínima `6` en cliente y `LUGARES_DESTACADOS` corregido (`Edificio I` / `Food Court`); en APK. |
| **REM-23** | **PASS** | `app.css:3003, 3068, 3090, 3112`; `cuenta.css:362, 1628` | Tap targets elevados a `min-height: 44px`; sincronizado en APK. |
| **REM-24** | **PASS** | `ajustes.js:199, 212` | Filtrado `#aj-pool` con `hidden` y debounce `120 ms` sin destruir `#aj-q`; en APK. |
| **REM-25** | **PASS** | `index.html:113-114`; `app.js:2540`; `sw.js`; `ico-fuego.png` (`5,965` B) | Tarjetas `.svg`, `ico-fuego.png` `128px` y 4 huérfanos eliminados tanto en `frontend/static/` como en `assets/public/static/`. |
| **REM-26** | **PASS** | `app.js:1912-1946`; `app.css:3181-3190` | `<polygon class="ub-hit-area">` proyectado desde `ubicacion-campus.json`; sincronizado en APK. |
| **REM-27** | **PASS** | `app.js:2267-2273` | `normalizarBusquedaLugar` normaliza `c301` → `C-301`; sincronizado en APK. |
| **REM-28** | **PASS** | `app.js:464, 1344-1352` | Seguimiento GPS en emergencia moviendo `#pin-gps-vivo`; sincronizado en APK. |
| **REM-29** | **PASS** | `generar_mapa.py:437`; `mapa-campus-3d.svg` (`274,551` B); `app.js:1044` | `terraza()` retirada, SVG regenerado sin barda y observatorio escalado por `k`; sincronizado en APK. |
| **REM-30** | **PASS** | `app.js` (`conectarPanZoomUb`, `mapa-gps`) | `setPointerCapture`, `wheel`, `dblclick`, inercia y botón GPS `⌖`; sincronizado en APK. |
| **REM-31** | **PASS** | `app.js:1274, 1277, 1530, 1537, 1574` | `#capa-dinamica-campus`, skeleton, `Reintentar` y `fallback2DSvg()`; sincronizado en APK. |
| **REM-32** | **PASS** | `app.css` (`html[data-tema="oscuro"] .mapa3d svg.c3d image`) | Filtro nocturno sobre imágenes 3D en modo oscuro; sincronizado en APK. |
| **REM-33** | **PASS** | `generar_mapa.py:114, 1459`; `app.js:992` | Sin `<filter>` GaussianBlur/`feDropShadow` y LOD en `edificio3D()` para `o.mini`; sincronizado en APK. |

---

## 2. VERIFICACIÓN DE REGRESIONES, PRUEBAS Y ARTEFACTOS

1. **Suite Python (`python -W default -m unittest discover -s tests`):**
   - **`Ran 69 tests in 21.627s` — `OK` (`exit code 0`)**, con **0 `ResourceWarning`** (incluye `test_canal_general_invitado_solo_lectura_y_sos` y filtro anti-contaminación de `INVITADO` en contactos `app.py:806-811`).
2. **Tests Motor Offline JS (`node tests/test_motor_offline.js`):**
   - **`PASS tests/test_motor_offline.js (5/5 escenarios OK)`**.
3. **Compilación Reglas Firestore (`firebase.cmd deploy --only firestore:rules --dry-run --project unexuam-campus-ni`):**
   - **`cloud.firestore: rules file firestore.rules compiled successfully` (`Dry run complete!`, exit `0`)**.
4. **Sincronización Web → Android (`12/12` SHA-256 idénticos, `Mismatches: 0`):**
   - Todos (`app.js`, `app.css`, `cuenta.js`, `cuenta.css`, `ajustes.js`, `ubicacion.js`, `nube-firebase.js`, `i18n.js`, `sw.js`, `img/mapa-campus-3d.svg`, `img/ico-fuego.png`, `motor-offline.js`) muestran `match=True`.
   - Confirmada eliminación de los 4 archivos huérfanos en `mobile/android/app/src/main/assets/public/static/img/figma/` (`False` en los 4).
5. **Integridad del APK Final:**
   - `mobile/android/app/build/outputs/apk/release/app-release.apk`: **`2,677,321` bytes (`2.55 MiB`)**, SHA-256 `78E5C1A54E78C92F3FD8EDBD492D51041247F23CB0D666197B6DC136642EDC48`.
   - `mobile/Unexuam.apk`: **`2,677,321` bytes (`2.55 MiB`)**, mismo SHA-256 (`78E5C1A54E78C92F3FD8EDBD492D51041247F23CB0D666197B6DC136642EDC48`), `LastWriteTime: 25/11/2026 07:18:56 a. m.`.

---

## 3. VEREDICTO FINAL DE LANZAMIENTO (GO / NO-GO)

- **Conteo Final:** **33 `PASS`** | **0 `PARTIAL`** | **0 `FAIL`**
- **Scorecard Final (0–100):**

| Eje | Inicial | Post-Remediación Anterior (APK viejo) | Final Verificado (Fuente + APK) |
| :--- | :---: | :---: | :---: |
| **Estabilidad** | 42 | 48 | **90** |
| **Base de Datos** | 54 | 82 | **89** |
| **Red Mesh P2P** | 38 | 64 | **88** |
| **UI / UX & Accesibilidad** | 51 | 54 | **88** |
| **Seguridad** | 31 | 60 | **87** |
| **Identidad Visual & Assets** | 62 | 64 | **89** |
| **Promedio Ponderado Global** | **46 / 100** | **62 / 100** | **89 / 100** |

- **Veredicto Definitivo:** **GO PARA PRIMER PILOTO HOY** (con `mobile/Unexuam.apk` de `2.55 MiB`, recomendado ejecutar el checklist manual de campo en 2 a 5 teléfonos físicos de `AUDITORIA_150_UNEXUAM.md#M149`; y si en el piloto se habilita sincronización en la nube para estudiantes con Firestore, desplegar `firestore.rules` y activar proveedor Email/Password + Web API Key en Firebase Console).
