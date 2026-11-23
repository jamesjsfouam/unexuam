# Mapa 3D del campus UAM

Ilustración del campus en 3D con la marca Unexuam. Está basada en el mapa del campus que circuló en un post de Facebook.

| Archivo | Qué es |
|---|---|
| `mapa-campus-3d.png` | Imagen final (3200 × 2120) para el documento, el pitch o la app |
| `mapa-campus-3d.svg` | Versión vectorial |
| `mapa-campus-3d.html` | Página que muestra el SVG; se usa para exportar el PNG |
| `generar_mapa.py` | Generador: plano 2D del campus, proyección 3D y rótulos |

## Regenerar

```powershell
python generar_mapa.py
& "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=2 --window-size=1600,1060 --screenshot="$PWD\mapa-campus-3d.png" "file:///$($PWD.Path.Replace('\','/'))/mapa-campus-3d.html"
```

Todo es local: no usa internet ni librerías externas. Solo necesita Python con Pillow para revisar la imagen y Edge para exportarla.
