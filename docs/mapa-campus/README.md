# Mapa 3D del campus UAM

Ilustración en 3D del campus con la marca Unexuam, hecha con el plano **real** de OpenStreetMap: el contorno del campus, la forma de los 38 edificios, las calles, los parqueos, la cancha de fútbol y el campo de béisbol.

| Archivo | Qué es |
|---|---|
| `mapa-campus-3d.png` | Imagen final (3200 × 2120) para el documento, el pitch o la app |
| `mapa-campus-3d.svg` | Versión vectorial |
| `mapa-campus-3d.html` | Página que muestra el SVG; se usa para exportar el PNG |
| `lugares.json` | Lugares del mapa (nombre, tipo, área y centro en metros). `backend/datos.py` debe usar estos mismos nombres |
| `campus-osm.json` | Plano extraído de OpenStreetMap, en metros (x al este, y al sur) |
| `extraer_osm.py` | Descarga el plano de OSM y genera `campus-osm.json` (es lo único que usa internet) |
| `generar_mapa.py` | Genera el SVG, el HTML y `lugares.json` a partir de `campus-osm.json` |

## Nombres
- **Con nombre en OSM:** Edificio I, Edificio E, Edificio A y Jaguar Center.
- **Edificio P:** la nave alargada del borde sur, identificada por James (OSM way 1547515040). En Google Maps es el «Edificio P Copérnico», con el observatorio.
- **De Google Maps (vista satelital, 22/11/2026),** cotejando la forma y la posición con OSM: Edificio B, C, F, J y O (Ingeniería y Arquitectura), Auditorio Central, UAM College, Clínicas Odontológicas y Subway. La Biblioteca Pablo Antonio Cuadra está en el Edificio I. Están en `NOMBRES_EXTRA` de `extraer_osm.py`.
- **Resto:** «Edificio sin nombre N», numerados de norte a sur y de oeste a este. Las casetas de menos de 60 m² y las cubiertas solares del parqueo este se dibujan, pero no son lugares del grafo.

## Zonas y puntos seguros
- **Zonas seguras:** la cancha de fútbol y el campo de béisbol (contorno amarillo discontinuo).
- **Puntos seguros (PS):** espacios abiertos, lejos de los edificios, con contorno verde discontinuo. Son los parqueos (Norte, 47 Calle, 20 Av, Este, Central, Sur, Oeste, Edificio P y Suroeste) y la plazoleta.
- **Celdas solares:** se ven en el satélite sobre los techos de Clínicas Odontológicas, del Edificio O y del Edificio P, y sobre las cubiertas de los parqueos Este, Central y Sur. En `lugares.json`, los puntos seguros que tienen celdas solares llevan `"celdas_solares": true`.

Cuando lleguen más nombres, se agregan en `NOMBRES_EXTRA` de `extraer_osm.py` (por id de OSM) y se vuelven a correr los dos scripts.

## Regenerar

```powershell
python extraer_osm.py      # solo si cambia el plano en OSM
python generar_mapa.py
& "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=2 --window-size=1600,1060 --screenshot="$PWD\mapa-campus-3d.png" "file:///$($PWD.Path.Replace('\','/'))/mapa-campus-3d.html"
```

Plano © OpenStreetMap contributors, licencia ODbL (https://www.openstreetmap.org/copyright).
