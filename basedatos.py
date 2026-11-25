"""
Base de datos de Unexuam (SQLite, incluida en Python: funciona sin internet).

Tablas
------
usuarios   : una fila por persona. La clave es el CIF.
contactos  : quién tiene a quién en su lista (se agrega buscando por CIF).
mensajes   : cada mensaje con su estado (entregado / en cola), la ruta que siguió
             por la red Mesh y su retardo.

    usuarios (cif PK) 1 ──< contactos >── 1 usuarios
    usuarios (cif PK) 1 ──< mensajes (de_cif, para_cif)

Las contraseñas se guardan con hash (werkzeug), nunca en texto plano.
"""

import json
import sqlite3
import threading
import time

ESQUEMA = """
CREATE TABLE IF NOT EXISTS campus_compartido (
    unico INTEGER PRIMARY KEY CHECK (unico = 1),
    revision INTEGER NOT NULL,
    datos TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS emergencia_activa (
    unica INTEGER PRIMARY KEY CHECK (unica = 1),
    id TEXT NOT NULL,
    datos TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS usuarios (
    cif        TEXT PRIMARY KEY,
    nombre     TEXT NOT NULL,
    hash       TEXT NOT NULL,
    telefono   TEXT NOT NULL UNIQUE,      -- nombre del vértice en la red Mesh
    lugar      TEXT NOT NULL,             -- vértice del campus donde está
    admin      INTEGER NOT NULL DEFAULT 0,
    creado     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS contactos (
    dueno_cif    TEXT NOT NULL REFERENCES usuarios(cif) ON DELETE CASCADE,
    contacto_cif TEXT NOT NULL REFERENCES usuarios(cif) ON DELETE CASCADE,
    agregado     TEXT NOT NULL,
    PRIMARY KEY (dueno_cif, contacto_cif),
    CHECK (dueno_cif <> contacto_cif)
);

CREATE TABLE IF NOT EXISTS reportes_bloqueo (
    id TEXT PRIMARY KEY,
    autor TEXT NOT NULL REFERENCES usuarios(cif) ON DELETE CASCADE,
    origen TEXT NOT NULL,
    destino TEXT NOT NULL,
    ambos INTEGER NOT NULL CHECK (ambos IN (0, 1)),
    creado INTEGER NOT NULL,
    resuelto INTEGER
);

CREATE INDEX IF NOT EXISTS ix_reportes_bloqueo_pendientes ON reportes_bloqueo(resuelto, creado);

CREATE TABLE IF NOT EXISTS mensajes (
    id         TEXT PRIMARY KEY,
    de_cif     TEXT NOT NULL REFERENCES usuarios(cif) ON DELETE CASCADE,
    para_cif   TEXT NOT NULL REFERENCES usuarios(cif) ON DELETE CASCADE,
    tipo       TEXT NOT NULL DEFAULT 'texto' CHECK (tipo IN ('texto', 'alerta')),
    texto      TEXT NOT NULL,
    enviado    TEXT NOT NULL,             -- fecha y hora ISO
    estado     TEXT NOT NULL CHECK (estado IN ('entregado', 'en cola')),
    ruta       TEXT NOT NULL DEFAULT '[]',-- lista JSON de teléfonos (vértices) recorridos
    retardo    REAL,                      -- segundos por la red Mesh
    entregado  TEXT,
    via_cola   INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS ix_mensajes_de   ON mensajes(de_cif, enviado);
CREATE INDEX IF NOT EXISTS ix_mensajes_para ON mensajes(para_cif, enviado);
CREATE INDEX IF NOT EXISTS ix_mensajes_cola ON mensajes(estado);
"""


SCHEMA_VERSION = 1


def ahora():
    return time.strftime("%Y-%m-%dT%H:%M:%S")


class BaseDatos:
    def __init__(self, ruta):
        self.con = sqlite3.connect(ruta, check_same_thread=False)
        self.con.row_factory = sqlite3.Row
        self.con.execute("PRAGMA foreign_keys = ON")
        self.con.execute("PRAGMA journal_mode = WAL")
        self.con.executescript(ESQUEMA)
        self.lock = threading.Lock()
        self._migrar()
        # Canal General y Visitante: destinatario especial "TODOS" y remitente invitado (no inician sesión).
        self._x("INSERT OR IGNORE INTO usuarios (cif, nombre, hash, telefono, lugar, admin, creado) "
                "VALUES ('TODOS', 'Canal General · Campus', '!', 'Mesh-Todos', 'Edificio E', 0, ?)", (ahora(),))
        self._x("INSERT OR IGNORE INTO usuarios (cif, nombre, hash, telefono, lugar, admin, creado) "
                "VALUES ('INVITADO', 'Visitante UAM', '!', 'Tel-Visitante', 'Edificio E', 0, ?)", (ahora(),))

    def _migrar(self):
        ver = self.con.execute("PRAGMA user_version").fetchone()[0]
        if ver < 1:
            self.con.executescript("""
                CREATE INDEX IF NOT EXISTS ix_mensajes_enviado ON mensajes(enviado DESC);
                CREATE INDEX IF NOT EXISTS ix_mensajes_para_enviado ON mensajes(para_cif, enviado DESC);
                PRAGMA user_version = 1;
            """)

    def cerrar(self):
        with self.lock:
            if getattr(self, "con", None) is not None:
                try:
                    self.con.close()
                except Exception:
                    pass
                self.con = None

    def __enter__(self):
        return self

    def __exit__(self, *_):
        self.cerrar()

    def _q(self, sql, args=()):
        with self.lock:
            return self.con.execute(sql, args).fetchall()

    def _x(self, sql, args=()):
        with self.lock, self.con:
            self.con.execute(sql, args)

    def campus_actual(self):
        filas = self._q("SELECT revision, datos FROM campus_compartido WHERE unico = 1")
        return (filas[0]["revision"], json.loads(filas[0]["datos"])) if filas else (0, None)

    def guardar_campus(self, revision, datos):
        serializado = json.dumps(datos, ensure_ascii=False)
        with self.lock, self.con:
            if revision == 0:
                resultado = self.con.execute(
                    "INSERT OR IGNORE INTO campus_compartido (unico, revision, datos) VALUES (1, 1, ?)",
                    (serializado,))
            else:
                resultado = self.con.execute(
                    "UPDATE campus_compartido SET revision = revision + 1, datos = ? WHERE unico = 1 AND revision = ?",
                    (serializado, revision))
            return resultado.rowcount == 1

    def emergencia_actual(self):
        filas = self._q("SELECT datos FROM emergencia_activa WHERE unica = 1")
        return json.loads(filas[0]["datos"]) if filas else None

    def guardar_emergencia(self, datos):
        self._x("INSERT OR REPLACE INTO emergencia_activa (unica, id, datos) VALUES (1, ?, ?)",
                (datos["id"], json.dumps(datos, ensure_ascii=False)))

    def finalizar_emergencia(self, incidente=None):
        with self.lock, self.con:
            if incidente is None:
                self.con.execute("DELETE FROM emergencia_activa WHERE unica = 1")
                return True
            resultado = self.con.execute("DELETE FROM emergencia_activa WHERE unica = 1 AND id = ?", (incidente,))
            return resultado.rowcount == 1

    # ---------------------------------------------------------------- usuarios
    def usuario(self, cif):
        filas = self._q("SELECT * FROM usuarios WHERE cif = ?", (cif,))
        return dict(filas[0]) if filas else None

    def total_usuarios(self):
        return self._q("SELECT COUNT(*) AS n FROM usuarios WHERE cif <> 'TODOS'")[0]["n"]

    def usuarios(self):
        return {f["cif"]: dict(f) for f in self._q("SELECT * FROM usuarios")}

    def telefonos_usados(self):
        return {f["telefono"] for f in self._q("SELECT telefono FROM usuarios")}

    def crear_usuario(self, cif, nombre, hash_, telefono, lugar, admin=False):
        self._x("INSERT INTO usuarios (cif, nombre, hash, telefono, lugar, admin, creado) VALUES (?,?,?,?,?,?,?)",
                (cif, nombre, hash_, telefono, lugar, int(admin), ahora()))

    def mover_usuario(self, cif, lugar):
        self._x("UPDATE usuarios SET lugar = ? WHERE cif = ?", (lugar, cif))

    # ---------------------------------------------------------------- contactos
    def agregar_contacto(self, dueno, contacto):
        if dueno != contacto:
            self._x("INSERT OR IGNORE INTO contactos (dueno_cif, contacto_cif, agregado) VALUES (?,?,?)",
                    (dueno, contacto, ahora()))

    def contactos_de(self, cif):
        return [f["contacto_cif"] for f in self._q(
            "SELECT contacto_cif FROM contactos WHERE dueno_cif = ? ORDER BY agregado", (cif,))]

    def crear_reporte_bloqueo(self, reporte):
        self._x("INSERT INTO reportes_bloqueo (id, autor, origen, destino, ambos, creado) VALUES (?, ?, ?, ?, ?, ?)",
                (reporte["id"], reporte["autor"], reporte["origen"], reporte["destino"],
                 reporte["ambos"], reporte["creado"]))

    def reportes_bloqueo_pendientes(self, desde):
        return [dict(f) for f in self._q(
            "SELECT * FROM reportes_bloqueo WHERE resuelto IS NULL AND creado >= ? ORDER BY creado DESC, id LIMIT 100",
            (desde,))]

    def reporte_bloqueo(self, ident, desde):
        filas = self._q("SELECT * FROM reportes_bloqueo WHERE id = ? AND resuelto IS NULL AND creado >= ?", (ident, desde))
        return dict(filas[0]) if filas else None

    def resolver_reporte_bloqueo(self, ident, resuelto):
        self._x("UPDATE reportes_bloqueo SET resuelto = ? WHERE id = ? AND resuelto IS NULL", (resuelto, ident))

    # ---------------------------------------------------------------- mensajes
    @staticmethod
    def _msj(f):
        estado = f["estado"]
        if estado == "en cola":
            limite = time.strftime("%Y-%m-%dT%H:%M:%S", time.localtime(time.time() - 24 * 3600))
            if f["enviado"] < limite:
                estado = "vencido"
        return {"id": f["id"], "de": f["de_cif"], "para": f["para_cif"], "tipo": f["tipo"], "texto": f["texto"],
                "fecha": f["enviado"], "hora": f["enviado"][11:19], "estado": estado,
                "ruta": json.loads(f["ruta"]), "retardo": f["retardo"],
                "entregado": f["entregado"][11:19] if f["entregado"] else None, "viaCola": bool(f["via_cola"])}

    def guardar_mensaje(self, m):
        self._x("INSERT INTO mensajes (id, de_cif, para_cif, tipo, texto, enviado, estado, ruta, retardo, entregado, via_cola)"
                " VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                (m["id"], m["de"], m["para"], m.get("tipo", "texto"), m["texto"], m["fecha"], m["estado"],
                 json.dumps(m["ruta"], ensure_ascii=False), m["retardo"],
                 m["fecha"] if m["estado"] == "entregado" else None, int(m.get("viaCola", False))))

    def mensaje(self, ident):
        filas = self._q("SELECT * FROM mensajes WHERE id = ?", (ident,))
        return self._msj(filas[0]) if filas else None

    def mensajes_de(self, cif, limite=400):
        filas = self._q(
            "SELECT *, rowid AS _rid FROM ("
            "  SELECT *, rowid FROM mensajes WHERE de_cif = ? "
            "  UNION "
            "  SELECT *, rowid FROM mensajes WHERE para_cif = ? "
            "  UNION "
            "  SELECT *, rowid FROM mensajes WHERE para_cif = 'TODOS'"
            ") ORDER BY enviado DESC, _rid DESC LIMIT ?",
            (cif, cif, limite),
        )
        return [self._msj(f) for f in reversed(filas)]

    def mensajes_generales(self, limite=200):
        filas = self._q("SELECT * FROM mensajes WHERE para_cif = 'TODOS' "
                        "ORDER BY enviado DESC, rowid DESC LIMIT ?", (limite,))
        return [self._msj(f) for f in reversed(filas)]

    def en_cola(self):
        # La cola DTN guarda los mensajes 24 horas; después se descartan del reparto.
        limite = time.strftime("%Y-%m-%dT%H:%M:%S", time.localtime(time.time() - 24 * 3600))
        return [self._msj(f) for f in self._q("SELECT * FROM mensajes WHERE estado = 'en cola' AND enviado >= ? ORDER BY enviado", (limite,))]

    def marcar_entregado(self, ident, ruta, retardo):
        self._x("UPDATE mensajes SET estado = 'entregado', ruta = ?, retardo = ?, entregado = ?, via_cola = 1 WHERE id = ?",
                (json.dumps(ruta, ensure_ascii=False), retardo, ahora(), ident))
