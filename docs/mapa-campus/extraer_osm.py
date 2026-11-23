"""
Descarga de OpenStreetMap el plano real del campus UAM y lo guarda en `campus-osm.json`.

- Campus: polígono «Universidad Americana (UAM)» (way 70193885).
- Edificios, calles, canchas, parqueos y arboledas que caen dentro del campus.
- Coordenadas en METROS: x hacia el este y y hacia el sur, desde la esquina noroeste del campus.

Datos © OpenStreetMap contributors, licencia ODbL (https://www.openstreetmap.org/copyright).

Uso:  python extraer_osm.py      (necesita internet una sola vez; el mapa 3D se genera sin él)
"""

import json
import math
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

AQUI = Path(__file__).parent
CAMPUS_ID = "70193885"
BBOX = "-86.2620,12.1045,-86.2545,12.1105"   # oeste, sur, este, norte
URL = f"https://api.openstreetmap.org/api/0.6/map?bbox={BBOX}"

# Edificio que el mapa de OSM no nombra y que James identificó (22/11/2026)
NOMBRES_EXTRA = {"1547515040": "Edificio P"}


def dentro(punto, poligono):
    x, y = punto
    c = False
    for i in range(len(poligono)):
        x1, y1 = poligono[i]
        x2, y2 = poligono[(i + 1) % len(poligono)]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            c = not c
    return c


def area(p):
    return abs(sum(p[i][0] * p[(i + 1) % len(p)][1] - p[(i + 1) % len(p)][0] * p[i][1] for i in range(len(p)))) / 2


def main():
    req = urllib.request.Request(URL, headers={"User-Agent": "mapa-campus-generator/1.0"})
    raiz = ET.fromstring(urllib.request.urlopen(req, timeout=60).read())
    nodos = {n.get("id"): (float(n.get("lat")), float(n.get("lon"))) for n in raiz.iter("node")}
    vias = {}
    for w in raiz.iter("way"):
        tags = {t.get("k"): t.get("v") for t in w.iter("tag")}
        vias[w.get("id")] = (tags, [nodos[n.get("ref")] for n in w.iter("nd") if n.get("ref") in nodos])

    campus_ll = vias[CAMPUS_ID][1]
    lat0 = max(p[0] for p in campus_ll)
    lon0 = min(p[1] for p in campus_ll)
    cos_lat = math.cos(math.radians(lat0))

    def xy(p):
        return (round((p[1] - lon0) * cos_lat * 111320, 1), round((lat0 - p[0]) * 110574, 1))

    campus = [xy(p) for p in campus_ll[:-1]]
    out = {"fuente": "© OpenStreetMap contributors, ODbL (https://www.openstreetmap.org/copyright)",
           "unidades": "metros; x hacia el este, y hacia el sur",
           "campus": campus, "edificios": [], "calles": [], "canchas": [], "parqueos": [], "arboledas": []}
    for wid, (tags, ll) in vias.items():
        if wid == CAMPUS_ID or len(ll) < 2:
            continue
        p = [xy(q) for q in ll]
        cerrado = ll[0] == ll[-1]
        if cerrado:
            p = p[:-1]
        c = (sum(a for a, _ in p) / len(p), sum(b for _, b in p) / len(p))
        if not (dentro(c, campus) or any(dentro(q, campus) for q in p)):
            continue
        if "building" in tags and cerrado:
            out["edificios"].append({"id": wid, "nombre": NOMBRES_EXTRA.get(wid, tags.get("name")),
                                     "tipo": tags["building"], "area": round(area(p)), "pol": p})
        elif "highway" in tags:
            out["calles"].append({"id": wid, "nombre": tags.get("name"), "tipo": tags["highway"], "linea": p})
        elif tags.get("leisure") == "pitch" and cerrado:
            out["canchas"].append({"id": wid, "deporte": tags.get("sport"), "pol": p})
        elif tags.get("amenity") == "parking" and cerrado:
            out["parqueos"].append({"id": wid, "pol": p})
        elif (tags.get("natural") == "wood" or tags.get("landuse") == "forest") and cerrado:
            out["arboledas"].append({"id": wid, "pol": p})
    (AQUI / "campus-osm.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{len(out['edificios'])} edificios, {len(out['calles'])} calles, {len(out['canchas'])} canchas, "
          f"{len(out['parqueos'])} parqueos, {len(out['arboledas'])} arboledas -> campus-osm.json")


if __name__ == "__main__":
    main()
