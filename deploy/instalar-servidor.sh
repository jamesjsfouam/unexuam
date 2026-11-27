#!/usr/bin/env bash
# Instala Unexuam en un servidor Linux nuevo (Ubuntu 22.04 / 24.04 o Debian 12) con HTTPS.
#
#   sudo bash instalar-servidor.sh unexuam.midominio.com [rama]
#
# Antes: el dominio debe apuntar (registro A) a la IP pública del servidor y los puertos 80 y 443
# deben estar abiertos en el firewall del proveedor. El script se puede volver a correr para
# actualizar el código (git pull) sin perder datos.
set -euo pipefail

DOMINIO="${1:?Uso: sudo bash instalar-servidor.sh DOMINIO [rama]}"
RAMA="${2:-main}"
REPO="https://github.com/jamesjsfouam/unexuam.git"
APP=/opt/unexuam
DATOS=/var/lib/unexuam
ENV=/etc/unexuam/unexuam.env

[ "$(id -u)" -eq 0 ] || { echo "Corre el script con sudo."; exit 1; }

echo "== Paquetes del sistema"
apt-get update -y
apt-get install -y python3 python3-venv python3-pip git curl debian-keyring debian-archive-keyring apt-transport-https sqlite3 ufw

echo "== Caddy (HTTPS automático con Let's Encrypt)"
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y && apt-get install -y caddy
fi

echo "== Usuario y carpetas"
id unexuam >/dev/null 2>&1 || useradd --system --home "$APP" --shell /usr/sbin/nologin unexuam
mkdir -p "$DATOS" /etc/unexuam
chown unexuam:unexuam "$DATOS"
chmod 750 "$DATOS"

echo "== Código ($RAMA)"
if [ -d "$APP/.git" ]; then
  git -C "$APP" fetch origin "$RAMA" && git -C "$APP" checkout "$RAMA" && git -C "$APP" pull --ff-only origin "$RAMA"
else
  git clone --branch "$RAMA" "$REPO" "$APP"
fi
python3 -m venv "$APP/venv"
"$APP/venv/bin/pip" install --upgrade pip >/dev/null
"$APP/venv/bin/pip" install --require-hashes -r "$APP/requirements.txt"
chown -R unexuam:unexuam "$APP"

echo "== Configuración ($ENV)"
if [ ! -f "$ENV" ]; then
  SECRETO="$(python3 -c 'import secrets; print(secrets.token_hex(32))')"
  cat > "$ENV" <<EOT
# Configuración de Unexuam en producción. Edita y luego: sudo systemctl restart unexuam
UNEXUAM_SECRET_KEY=$SECRETO
UNEXUAM_DATOS=$DATOS
UNEXUAM_PROXY=1
UNEXUAM_DEMO=0
UNEXUAM_MAX_CUENTAS=20000
UNEXUAM_HILOS=32
HOST=127.0.0.1
PORT=8080
# Firebase (opcional: publicar emergencias y push). Sube el JSON de la cuenta de servicio aquí:
# FIREBASE_SERVICE_ACCOUNT_FILE=/etc/unexuam/firebase.json
# FIREBASE_PROJECT_ID=unexuam-campus-ni
EOT
  chmod 640 "$ENV"
  chown root:unexuam "$ENV"
fi

echo "== Servicio systemd"
install -m 644 "$APP/deploy/unexuam.service" /etc/systemd/system/unexuam.service
systemctl daemon-reload
systemctl enable --now unexuam
systemctl restart unexuam

echo "== Caddy para https://$DOMINIO"
cat > /etc/caddy/Caddyfile <<EOT
$DOMINIO {
	encode zstd gzip
	reverse_proxy 127.0.0.1:8080
	header -Server
}
EOT
systemctl enable --now caddy
systemctl reload caddy

echo "== Firewall"
ufw allow OpenSSH >/dev/null
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
yes | ufw enable >/dev/null || true

echo "== Respaldo diario de la base de datos (3:15 a. m., se guardan 14 días)"
cat > /etc/cron.d/unexuam-respaldo <<EOT
15 3 * * * unexuam sqlite3 $DATOS/unexuam.db ".backup '$DATOS/respaldo-\$(date +\%F).db'" && find $DATOS -name 'respaldo-*.db' -mtime +14 -delete
EOT

sleep 3
if curl -fsS http://127.0.0.1:8080/api/lugares >/dev/null; then
  echo "Listo: Unexuam corre detrás de Caddy. Abre https://$DOMINIO (el certificado tarda unos segundos la primera vez)."
else
  echo "El servicio no respondió. Revisa: sudo journalctl -u unexuam -n 50"
  exit 1
fi
echo "Siguiente paso: crear el administrador (pide la contraseña sin mostrarla):"
echo "  sudo -u unexuam bash -c 'set -a; . $ENV; cd $APP; venv/bin/python -m flask --app app crear-admin TU_CIF \"Tu Nombre\"'"
echo "Para cambiar la contraseña de una cuenta existente usa cambiar-clave TU_CIF en lugar de crear-admin."
