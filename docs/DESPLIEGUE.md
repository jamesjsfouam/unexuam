# Despliegue de Unexuam en un servidor en la nube

Lo que queda instalado: **Caddy** con HTTPS automático (Let's Encrypt), delante de **waitress**
(`servir.py`, un solo proceso), como servicio `systemd`, con la base de datos en
`/var/lib/unexuam`, respaldo diario y firewall. Todo lo hace `deploy/instalar-servidor.sh`.

## 1. Crear el servidor (lo haces tú: requiere cuenta con método de pago)

Recomendado: **Google Cloud**, en el mismo proyecto de Firebase (`unexuam-campus-ni`), porque ese
proyecto igual necesita el plan Blaze para las Cloud Functions.

- **Compute Engine → Crear instancia**
  - Tipo: `e2-small` (2 vCPU compartidas, 2 GB). Alcanza para todo el campus; `e2-medium` si hay picos.
  - Región: `us-east1` o `us-south1` (las de menor latencia desde Managua).
  - Disco: Ubuntu 24.04 LTS, 20 GB.
  - Firewall: marcar **Permitir tráfico HTTP** y **Permitir tráfico HTTPS**.
- **Red de VPC → Direcciones IP**: reservar como **estática** la IP externa de la instancia.

Cualquier otro proveedor sirve igual (DigitalOcean, AWS Lightsail, Azure, Hetzner) con Ubuntu 24.04,
2 GB de RAM y los puertos 80 y 443 abiertos.

## 2. Dominio

Crear un registro **A** que apunte a la IP estática, por ejemplo `unexuam.uam.edu.ni` (lo crea TI de
la UAM) o un subdominio propio. Esperar a que resuelva: `nslookup unexuam.uam.edu.ni`.

## 3. Instalar (un comando)

Entrar por SSH al servidor (en Google Cloud: botón **SSH** de la instancia) y correr:

```bash
curl -fsSLO https://raw.githubusercontent.com/jamesjsfouam/unexuam/main/deploy/instalar-servidor.sh
sudo bash instalar-servidor.sh unexuam.uam.edu.ni main
```

(Mientras el PR #4 no esté fusionado, usa la rama `feat/mapa-3d-calidad` en las dos líneas en lugar de `main`.)

Al terminar muestra «Listo» y la dirección `https://…`.

## 4. Administrador

```bash
sudo -u unexuam bash -c 'set -a; . /etc/unexuam/unexuam.env; cd /opt/unexuam; venv/bin/python -m flask --app app crear-admin TU_CIF "Tu Nombre"'
```

Pide la contraseña (12 a 64 caracteres) sin mostrarla. Para cambiarla después: `cambiar-clave TU_CIF`.

## 5. Firebase (emergencias en la nube y push)

1. Activar el plan **Blaze** e **Identity Platform** (Authentication → Configuración).
2. Desde la carpeta del proyecto, en una PC con la CLI de Firebase:
   `npx firebase-tools deploy --only functions` y **después** `npx firebase-tools deploy --only firestore:rules`.
3. Crear una cuenta de servicio con permisos de Firestore y FCM, subir su JSON al servidor como
   `/etc/unexuam/firebase.json` (`chmod 640`, grupo `unexuam`) y descomentar en
   `/etc/unexuam/unexuam.env` las líneas `FIREBASE_SERVICE_ACCOUNT_FILE` y `FIREBASE_PROJECT_ID`.
4. `sudo systemctl restart unexuam`.

## Operación diaria

| Tarea | Comando |
|---|---|
| Ver si está vivo | `systemctl status unexuam caddy` |
| Últimos registros | `sudo journalctl -u unexuam -n 100` |
| Actualizar a la última versión | `sudo bash instalar-servidor.sh unexuam.uam.edu.ni main` (conserva datos y configuración) |
| Cambiar configuración | `sudo nano /etc/unexuam/unexuam.env` y `sudo systemctl restart unexuam` |
| Respaldos | `/var/lib/unexuam/respaldo-AAAA-MM-DD.db` (diarios, 14 días) |
| Restaurar un respaldo | `sudo systemctl stop unexuam`, copiar el respaldo sobre `unexuam.db`, `sudo systemctl start unexuam` |

No subir el número de procesos: el servidor debe correr como **un solo proceso** (la emergencia
activa y quién está en línea viven en memoria).
