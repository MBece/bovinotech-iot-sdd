# Contrato API: Productividad por lote

Todos los payloads se validan mediante contratos Pydantic v2. La finca se deriva de la identidad autenticada, nunca de un `farm_id` suministrado por el cliente. Los identificadores de animal son DIN string. Fechas se expresan como ISO-8601 con zona horaria y se normalizan a UTC. Respuestas usan nombres JSON camelCase.

## Reglas comunes

- Captura: `OPERARIO` y `ADMINISTRADOR` con finca activa.
- Lectura de historial de pesajes/consumos: `OPERARIO`, `ADMINISTRADOR`, `VETERINARIO` y `DIRECTIVO` dentro de su finca activa.
- Lectura de indicadores: `ADMINISTRADOR`, `VETERINARIO` y `DIRECTIVO` dentro de su finca activa.
- Revisión atípica: `VETERINARIO` o `ADMINISTRADOR` con finca activa.
- Sin finca activa: HTTP 403. Rol sin permiso: HTTP 403. Registro fuera de finca: respuesta no revela la existencia del dato.
- JSON inválido o campo fuera de rango: HTTP 422 con campo/motivo identificables.
- Mismo `clientEventId` para la misma finca y tipo: respuesta idempotente del registro existente, sin crear evento duplicado.
- Los eventos históricos no tienen operaciones PUT/DELETE. Una corrección crea evento nuevo enlazado y motivo obligatorio.

## `POST /pesajes`

Registra un pesaje inmutable.

Request:

```json
{
  "clientEventId": "UUID",
  "loteId": "LOTE-01",
  "din": "DIN-DEMO-0001",
  "weightKg": 420.5,
  "capturedAt": "2026-11-24T12:00:00Z"
}
```

- `clientEventId`: UUID obligatorio.
- `loteId`: string obligatorio, 1–64 caracteres.
- `din`: string obligatorio, 1–32 caracteres, normalizado a mayúsculas.
- `weightKg`: decimal finito, mayor que cero.
- `capturedAt`: instante timezone-aware obligatorio.
- `authorId` y `farmId` son derivados del contexto autenticado.

Response nueva: HTTP 201 con `id`, `clientEventId`, `loteId`, `din`, `weightKg`, `capturedAt`, `isAtypical`, `reviewStatus` y `syncStatus`.
Respuesta de repetición idempotente: HTTP 200 con el registro previo y `syncStatus: "DUPLICADO"`.

## `GET /pesajes`

Lista eventos visibles en la finca activa, ordenados por captura ascendente para reconstruir cronología.

Query:
- `lote_id` (opcional), string de 1–64 caracteres.
- `din` (opcional), string de 1–32 caracteres.
- `fecha_inicio` y `fecha_fin` (opcionales), fechas ISO-8601; inicio anterior al fin.

Response HTTP 200: `{ "items": [ProductivityWeighingRead], "nextCursor": null }`.

## `POST /pesajes/{pesaje_id}/correcciones`

Anexa una versión corregida, sin cambiar ni borrar el pesaje original.

Request: el mismo contenido de `POST /pesajes`, con `clientEventId` obligatorio, más `reason` obligatorio (1–500 caracteres no vacíos). El servidor asigna nuevo `id` y establece `correctedEventId` con el ID del pesaje corregido.

Response: HTTP 201 con el evento nuevo, `correctedEventId`, motivo y autor. El evento original permanece intacto y visible en el historial.

## `POST /consumos`

Registra consumo de alimento por lote.

Request:

```json
{
  "clientEventId": "UUID",
  "loteId": "LOTE-01",
  "periodStart": "2026-11-01T00:00:00Z",
  "periodEnd": "2026-11-24T00:00:00Z",
  "quantityKg": 860.0,
  "costAmount": 125000.0,
  "currencyCode": "COP"
}
```

- `periodStart` y `periodEnd` son timezone-aware; el inicio debe ser anterior al fin.
- `quantityKg` es decimal finito mayor que cero.
- `costAmount` es opcional, finito y no negativo. Si se informa, `currencyCode` es obligatorio.
- `currencyCode` si se informa usa tres letras ISO 4217 en mayúsculas.

Response: HTTP 201 con evento y `syncStatus`; repetición devuelve HTTP 200 como duplicado.

## `GET /consumos`

Lista consumos visibles de la finca, ordenados por periodo.

Query:
- `lote_id` (opcional), string de 1–64 caracteres.
- `fecha_inicio` y `fecha_fin` (opcionales), rango timezone-aware válido.

Response HTTP 200: `{ "items": [ProductivityConsumptionRead], "nextCursor": null }`.

## `POST /consumos/{consumo_id}/correcciones`

Anexa una versión corregida, sin cambiar ni borrar el consumo original.

Request: el mismo contenido de `POST /consumos`, con `clientEventId` obligatorio, más `reason` obligatorio (1–500 caracteres no vacíos). El servidor asigna nuevo `id` y establece `correctedEventId` con el ID del consumo corregido.

Response: HTTP 201 con el evento nuevo, `correctedEventId`, motivo y autor. El evento original permanece intacto y visible en el historial.

## `GET /lotes/{lote_id}/gdp`

Calcula GDP y eficiencia alimenticia para el lote y periodo indicados.

Query requerida:
- `fecha_inicio`
- `fecha_fin`, posterior a `fecha_inicio`
- `dins` (opcional): cohorte explícita de DIN del lote; sin ella se usa la cohorte declarada por el lote en los fixtures/datos propios.

Response HTTP 200:

```json
{
  "loteId": "LOTE-01",
  "periodStart": "2026-11-01T00:00:00Z",
  "periodEnd": "2026-11-24T00:00:00Z",
  "gdpKgPerDay": 0.42,
  "gdpStatus": "SUFFICIENT",
  "feedEfficiencyKgPerKg": 6.8,
  "feedEfficiencyStatus": "SUFFICIENT",
  "costStatus": "DATOS_INSUFICIENTES",
  "status": "DATOS_INSUFICIENTES",
  "missingData": ["COSTS_MISSING"],
  "atypicalPendingCount": 1
}
```

- GDP: promedio de las tasas individuales `(peso_final - peso_inicial) / días`, para la cohorte completa y pesajes aprobados.
- `dins` permite declarar la cohorte esperada; si se omite, se usan los DIN observados en el lote y, cuando todavía no hay pesajes, la cohorte del fixture propio del lote.
- Eficiencia: consumo agregado en kg dividido entre kg ganados totales de la cohorte; kg ganados debe ser positivo.
- Si faltan pares de muestras, fechas, consumo o ganancia positiva, el estado del indicador afectado es `DATOS_INSUFICIENTES` y su valor es `null`.
- Si los costos solicitados están ausentes, `costStatus` y el estado general son `DATOS_INSUFICIENTES`; GDP/eficiencia con datos completos pueden conservar su estado y valor.
- `missingData` informa códigos estables, por ejemplo `INITIAL_WEIGHING_MISSING`, `FINAL_WEIGHING_MISSING`, `CONSUMPTION_MISSING`, `NON_POSITIVE_GAIN` y `COSTS_MISSING`.

## `POST /pesajes/{pesaje_id}/revision`

Anexa una decisión de revisión para un pesaje `ATIPICO_EN_REVISION`. Solo VETERINARIO o ADMINISTRADOR autorizado.

Request:

```json
{
  "decision": "APPROVED",
  "reason": "Verificado en báscula calibrada"
}
```

- `decision`: `APPROVED` o `REJECTED`.
- `reason`: obligatorio, 1–500 caracteres no vacíos.
- `reviewerId`, `reviewedAt` y `farmId` son derivados del contexto autenticado.

Response: HTTP 201 con el evento de revisión y estado proyectado. Pesaje/revisiones previos permanecen inmutables.
