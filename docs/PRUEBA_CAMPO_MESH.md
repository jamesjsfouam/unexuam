# Prueba de campo de la red Mesh (antes de desplegar en la UAM)

La red sin internet usa **Google Nearby Connections** (`Strategy.P2P_CLUSTER`, Bluetooth + Wi-Fi) en
`mobile/android/.../MeshNativa.java` y `MeshForegroundService.java`. Las pruebas automáticas
(`pytest`, `tests/test_motor_offline.js`) **no** prueban radios reales: esta prueba es obligatoria.

## Preparación

- APK generado desde esta rama: `cd mobile && npm run sync` y compilar en Android Studio (release firmado).
- Servidor de producción levantado (`python servir.py` detrás del proxy TLS) **solo** para la parte con internet.
- `UNEXUAM_DEMO=0` en el servidor y al generar el APK: la red debe empezar **sin** teléfonos simulados.
- Al menos **6 teléfonos Android** distintos (marcas y versiones: idealmente Android 10, 12, 13 y 14),
  batería > 60 %, cada uno con una cuenta de prueba distinta (CIF de prueba, no de estudiantes reales).
- Una persona anota resultados en la tabla del final (hora, teléfonos, resultado, observaciones).

## Escenarios

| # | Escenario | Cómo | Pasa si |
|---|---|---|---|
| 1 | Descubrimiento | 2 teléfonos a 5 m, Wi-Fi y datos apagados | Cada uno ve al otro en «teléfonos a tu alcance» en < 30 s |
| 2 | Mensaje directo | Enviar un mensaje de A a B (escenario 1) | Llega en < 10 s y muestra «1 salto» |
| 3 | Salto múltiple | A, B, C en fila por un pasillo del B (A y C fuera de alcance entre sí, ~40–60 m) | Mensaje de A llega a C con «2 saltos» |
| 4 | Canal General | 6 teléfonos repartidos en B, C y la Plazoleta | Un mensaje al Canal General llega a los 6 en < 60 s |
| 5 | SOS | Deslizar SOS en un teléfono del 3.er piso del P | Los demás reciben la alerta con el edificio y suena/vibra con la pantalla bloqueada |
| 6 | Custodia (DTN) | B se aleja con el mensaje de A y luego se acerca a C | C recibe el mensaje al encontrarse con B |
| 7 | Segundo plano | App minimizada y pantalla apagada 10 min | Siguen llegando mensajes y SOS (servicio en primer plano activo) |
| 8 | Reinicio | Reiniciar un teléfono | Al abrir la app vuelve a unirse a la red sin pasos extra |
| 9 | Emergencia con internet | El administrador declara una emergencia desde el servidor | Llega la notificación push (FCM) y la guía se abre en todos |
| 10 | Rutas sin internet | Modo avión, abrir «Evacuar» desde 3 aulas (B-205, C-305, P-309) | Muestra la ruta paso a paso y el mapa 3D sin errores |
| 11 | Batería | 1 hora con la app activa en segundo plano | Consumo < 10 % por hora |
| 12 | Duplicados | 6 teléfonos, 20 mensajes seguidos | Ningún mensaje aparece repetido ni se pierde |

## Criterio para desplegar

Se despliega solo si pasan **todos** los escenarios 1–10 en al menos 5 de los 6 teléfonos.
Los escenarios 11 y 12 pueden quedar como mejora si el resultado está cerca del límite.

## Registro de resultados

| Fecha y hora | Escenario | Teléfonos (modelo / Android) | Resultado | Observaciones |
|---|---|---|---|---|
| | | | | |
