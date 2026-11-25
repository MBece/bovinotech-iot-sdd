# Contrato HTTP: HU-006 Telemetría y alertas

Prefijo: `/telemetry`. Las rutas humanas usan JWT y la finca activa del token. La ingesta usa `X-Device-Id` y `X-Device-Token`; la finca y el animal se derivan del dispositivo autenticado.

## `POST /batches`

Entrada: `{ "batch_id", "readings": [{ "reading_id", "captured_at", "activity", "latitude?", "longitude?", "accuracy_m?" }] }`.

- `200`: resultado por lectura `NORMAL`, `ALERT_TRIGGERED`, `INSUFFICIENT_DATA` o `REJECTED`.
- Reenvío idéntico: `200`, `duplicate: true`, mismo resultado persistido.
- Mismo `batch_id` y contenido diferente: `409 BATCH_CONTENT_CONFLICT`.
- Dispositivo desconocido, revocado o secreto inválido: `401`.
- Máximo 500 lecturas por lote.

## Alertas humanas

- `GET /alerts?status=&alert_type=&bovine_id=`: roles autenticados, solo finca activa.
- `GET /alerts/{id}`: detalle sin divulgar recursos de otra finca (`404`).
- `POST /alerts/{id}/close`: `OPERARIO` o `VETERINARIO`; cuerpo `{ "observation": "..." }`.

## Configuración versionada

- `GET /rules`, `GET /geofences`: roles autenticados de la finca.
- `POST /rules`, `POST /geofences`: solo `ADMINISTRADOR`; siempre crea una versión nueva.

