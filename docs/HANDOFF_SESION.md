# Handoff de Sesión — Unexuam (23 de noviembre de 2026)

Documento de contexto técnico para continuar el trabajo con **Claude** sobre el **mapa del campus** y el **sistema de mensajes / Red Mesh**.

---

## 1. Estado actual del repositorio

- **Rama:** `main` (`origin/main` sincronizado al día).
- **Pruebas automatizadas:** **31/31 OK** (`23` en `tests/test_backend.py` + `8` en `tests/test_api.py`).
- **App móvil Android (Capacitor):** 100% offline, empaquetada en `mobile/Unexuam.apk` (archivo ignorado por Git; se compila localmente con Gradle), probada e instalada en dispositivo físico vía ADB (`ni.edu.uam.unexuam`).
- **PWA / Web:** Service Worker activo (`frontend/static/sw.js`, versión `unexuam-v5`) y manifiesto en `frontend/static/manifest.json`.
- **Grafo del campus actual:** **154 vértices**, **442 aristas dirigidas**, **12 zonas seguras**.
- **Red Mesh actual:** **8 nodos** (`Tel-Ana`, `Tel-Luis`, `Tel-Sofía`, `Tel-Carlos`, `Tel-María`, `Tel-Pedro`, `Tel-Valeria`, `Tel-Diego`) con enlaces dirigidos ponderados por retardo en segundos.

---

## 2. Reglas y restricciones clave (leer antes de editar)

1. **Paridad obligatoria Web ↔ Móvil Offline:**
   - La app Android **no usa Flask**; intercepta `/api/*` en el WebView usando `mobile/motor-offline.js` y carga los grafos exportados por `mobile/preparar_web.py` desde `backend/datos.py`.
   - Cualquier endpoint nuevo o cambio de contrato en `app.py` (por ejemplo, para el sistema de mensajes) **debe replicarse en `mobile/motor-offline.js`**.
2. **Paridad obligatoria Grafo Campus ↔ Plano Visual:**
   - `tests/test_api.py::test_paridad_campus_plano_json` exige que **todos** los vértices exteriores de `backend/datos.py` existan en `frontend/static/campus-plano.json` (y viceversa).
   - Los vértices interiores siguen la convención `^([A-Z])-(\d)(\d{2})$|^([A-Z]) (Escalera|Pabell[oó]n) `.
3. **No alterar innecesariamente el núcleo algorítmico de `backend/`:**
   - Los algoritmos base en `backend/grafo.py`, `backend/evacuacion.py` y `backend/mesh.py` cumplen con los requisitos de la asignatura (**Programación Estructurada**). Si se amplía el sistema de mensajes, procurar extender sin romper la firma ni las pruebas existentes de `tests/test_backend.py`.
4. **Manual de marca UNEXO** (`docs/marca/Manual_de_marca_UNEXO.pdf`):
   - Paleta oficial: Azul `#0080ff`, Rojo `#e23000`, Amarillo `#fcd222`, Verde `#00d656`, Blanco `#ffffff`.
   - Radio de píldoras: `30px`.
   - **Nunca rotar ni distorsionar el isotipo `X`** (ni en animaciones ni en íconos).
   - Tipografía: **Montserrat** (`Regular`, `Bold`, `Black` en `frontend/static/fonts/`) como equivalente geométrico libre completo de Nexa, porque las versiones `Trial`/`Demo` gratuitas de Nexa reemplazan tildes (`á é í ó ú`), ligaduras (`ff` en *Off-Grid*) y `·` por marcas de agua `DEMO CASE`. El paquete original de referencia se conserva en `docs/marca/nexa-font-family.zip`.

---

## 3. Resumen detallado de todos los cambios realizados hoy

### A. Arquitectura, Backend y Grafo del Campus
- Se eliminó el stub de backend (`frontend/_stub_backend.py`) y el selector de origen en `app.py` para trabajar únicamente contra el backend real (`8d1c68e`).
- Se incorporó la **Pasarela Edificio B** y la **escalera central entre Edificio B y Edificio C** (`B Escalera Central P1`, `B Escalera Central P2`, `C Escalera Central P3`) en `backend/datos.py`, actualizando `frontend/static/campus-plano.json` y regenerando `frontend/static/img/mapa-campus-3d.svg`.
- Se añadió la ruta `/sw.js` con cabecera `Service-Worker-Allowed: /` en `app.py` (`2baea84`).

### B. Frontend, Mapa 3D y Experiencia de Usuario (UX)
- **Vista interior 3D por pisos** y fachadas fieles a las fotos reales de los edificios **B, C y P** (`a92cf3e`, `9e3371d`).
- **Mapa 3D interactivo del campus:** paneo táctil/mouse, *pinch-to-zoom*, doble toque para restablecer y brújula fija `N ↑` (`2baea84`).
- **Buscador instantáneo de aulas** y accesos rápidos de ubicación en la pestaña *Campus* (`2baea84`).
- **Guía por voz (TTS)** con `speechSynthesis` en español para leer la ruta de evacuación paso a paso (`2baea84`).
- **Simulacros rápidos con un toque** en *Inicio* (`Sismo · Esc. Oeste P`, `Congestión · Parqueo Oeste`, `Bloqueo · Esc. Central B–C`, `Alerta Mesh · TTL 5`) (`2baea84`).
- **Splash animado de bienvenida** al abrir la app (sin rotar el isotipo `X`, respetando el manual de marca).
- **Accesibilidad:** soporte de teclado y contrastes revisados (`851d3ec`).
- **Corrección de historial de sucesos:** `.historial li { flex: none; min-height: 38px; }` para evitar que las tarjetas se encojan al acumularse eventos (`d1433f2`).
- **Corrección de solapamiento en móvil (`<= 400px`):** se ajustó la etiqueta `congestionados` → `congestión` en *Inicio → Capa 2*, se agregó `overflow: hidden` / `overflow-wrap: anywhere` en `.metricas` y se redujo el padding/tamaño de `.nav a` para evitar recortes en la pestaña *Administrar* (`0160004`).

### C. Manual de Marca, Tipografía e Íconos
- Auditoría completa contra `docs/marca/Manual_de_marca_UNEXO.pdf`: ajuste de colores exactos (`#e23000`, `#00d656`), eliminación de rotación en el logo `X` (`d1433f2`).
- Se incluyeron `docs/marca/Manual_de_marca_UNEXO.pdf` y `docs/marca/nexa-font-family.zip` dentro del repositorio (`0bb32c1`).
- **Íconos con margen seguro:** se regeneraron `icono-192.png`, `icono-512.png` (52% de área segura) y todos los `mipmap-*` de Android Adaptive Icons (`38%` de foreground) para que la `X` no quede pegada a los bordes en el launcher móvil (`0bb32c1`).
- **Tipografía offline sin errores de glifos:** tras detectar que tanto `Nexa-Trial-*.otf` como `NexaDemo-*.otf` sustituían tildes, `·` y `ff` por glifos `DEMO CASE` en móvil, se migró a **Montserrat** (`Montserrat-Regular.ttf`, `Montserrat-Bold.ttf`, `Montserrat-Black.ttf`) en `frontend/static/fonts/`, `app.css` y `sw.js` (`08d94b5`), verificado visualmente con captura directa en el teléfono.

### D. Empaquetado Móvil Android (Capacitor)
- Proyecto Android completo bajo `mobile/` (`capacitor.config.json`, `preparar_web.py`, `motor-offline.js`, `android/`).
- Flujo probado de principio a fin: `preparar_web.py` → `npx cap sync android` → `gradlew.bat assembleDebug` → `mobile/Unexuam.apk` → instalación vía ADB en dispositivo real.

### E. Pruebas y Documentación
- Suite ampliada a **31 pruebas**: `tests/test_backend.py` (23) + `tests/test_api.py` (8, cubriendo rutas Flask, CRUD case-insensitive, TTL de Red Mesh, Service Worker y paridad exacta de `campus-plano.json`) (`851d3ec`, `2baea84`).
- Limpieza de documentación duplicada/obsoleta, renovación completa de `README.md`, actualización del nombre de la asignatura a **Programación Estructurada** y guión de pitch profesional en `docs/pitch/guion.md` (`d1465b0`, `ae8dd80`, `d1433f2`).

---

## 4. Mapa de archivos clave para continuar con Claude

### A. Para trabajar en el **Mapa del Campus**
| Archivo | Rol |
|---|---|
| `backend/datos.py` | Fuente única de verdad del grafo del campus (`crearCampus()`) y zonas seguras. |
| `frontend/static/campus-plano.json` | Coordenadas `(x, y)` de cada vértice exterior, etiquetas y metadatos del plano. |
| `docs/mapa-campus/generar_mapa.py` | Script que genera el mapa 3D SVG/PNG del campus. |
| `frontend/static/img/mapa-campus-3d.svg` | Mapa 3D consumido por el frontend web y empaquetado en el APK. |
| `frontend/static/app.js` | Renderizado interactivo del mapa 3D, zoom/paneo, rutas, edificios por dentro y búsqueda de aulas. |
| `frontend/static/app.css` | Estilos del lienzo 3D, brújula, tarjetas de edificios y vista móvil. |
| `tests/test_api.py` | Valida paridad 1:1 entre `backend/datos.py` y `campus-plano.json`. |

### B. Para trabajar en el **Sistema de Mensajes / Red Mesh**
| Archivo | Rol |
|---|---|
| `backend/mesh.py` | Lógica actual de propagación de alertas (BFS con TTL, detección de nodos aislados/sin salida). |
| `backend/datos.py` | Definición de la red de teléfonos y enlaces dirigidos (`crearRedMesh()`). |
| `app.py` | Endpoints REST `/api/mesh/*` (estado, emitir alerta, insertar/eliminar nodos y enlaces). |
| `mobile/motor-offline.js` | **Espejo obligatorio en JS** de todos los endpoints `/api/*` para que la app Android funcione 100% offline. |
| `frontend/templates/index.html` | Sección `#v-mesh` (lienzo SVG del grafo mesh, controles de emisión, TTL y resultados). |
| `frontend/static/app.js` | Interacción de la pestaña *Red Mesh*, dibujo del grafo, historial de sucesos (`#historial`) y simulacros. |

---

## 5. Próximos pasos sugeridos para la sesión con Claude

### 1. Evolución del Mapa del Campus
- Afinar precisión visual/espacial de edificios, pasillos, escaleras y puntos seguros en `generar_mapa.py` y `campus-plano.json`.
- Mejorar la legibilidad de etiquetas y rutas sobre el mapa 3D en pantallas móviles pequeñas (evitar solapes de pins/etiquetas al hacer zoom o al mostrar bloqueos simultáneos).
- Verificar que cualquier nodo exterior nuevo agregado en `backend/datos.py` quede sincronizado en `campus-plano.json` y pase `test_paridad_campus_plano_json`.

### 2. Evolución del Sistema de Mensajes (Red Mesh)
- Diseñar un **modelo de mensaje estructurado** (`id`, `remitente`, `tipo` —alerta, auxilio, bloqueo, texto libre—, `contenido`, `ubicacion`, `ttl`, `timestamp`, `ruta_saltos`, `estado`: entregado / reenviado / pendiente).
- Implementar **bandeja / feed de mensajes por nodo** y **cola *store-and-forward*** para mensajes que no pueden salir cuando un teléfono queda aislado (ej. `Tel-Diego` o enlaces cortados) y se reenvían automáticamente al reconectarse un enlace.
- Permitir que un mensaje de emergencia recibido por Red Mesh (ej. "Bloqueo en Escalera Oeste P") pueda **vincularse con Capa 2** para marcar el bloqueo y recalcular rutas de evacuación.
- Mantener **paridad completa** entre `app.py` (Python) y `mobile/motor-offline.js` (JavaScript offline), más pruebas en `tests/test_api.py`.

---

## 6. Comandos útiles (Windows PowerShell 5.1)

> Nota: En PowerShell 5.1 usar `;` en lugar de `&&`.

```powershell
# 1. Ejecutar toda la suite de pruebas (31 pruebas)
python -m unittest discover -s tests -v

# 2. Levantar servidor web local (Flask)
python app.py

# 3. Sincronizar cambios web/grafos hacia el proyecto móvil Android
Set-Location mobile; python preparar_web.py; npx cap sync android

# 4. Compilar APK e instalar en teléfono conectado por USB (ADB)
Set-Location mobile\android
.\gradlew.bat assembleDebug
Copy-Item "app\build\outputs\apk\debug\app-debug.apk" "..\Unexuam.apk" -Force
& "C:\Users\USER\AppData\Local\Android\Sdk\platform-tools\adb.exe" install -r "..\Unexuam.apk"
```
