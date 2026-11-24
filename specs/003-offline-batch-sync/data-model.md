# Modelo de datos: HU-03 `offline_sync`

**Spec**: [spec.md](spec.md) | **Decisiones**: [research.md](research.md)

## Servidor: `backend/app/features/offline_sync/`

Todas las tablas se crean con `Base.metadata.create_all` y no tienen llaves foráneas contra tablas de otras HU (constitución §2). El usuario se referencia por `author_email` y la finca por `farm_id` entero.

### Tabla `offline_sync_events`: evento sincronizado (registro consolidado)

Copia única e inmutable de cada `CapturedEvent` recibido (FR-011, FR-015, FR-016). **Solo `INSERT`**: ninguna ruta del módulo hace `UPDATE` ni `DELETE` (R3).

| Campo | Tipo | Reglas |
|---|---|---|
| `id` | Integer PK | |
| `client_event_id` | String(36), **UNIQUE**, índice | UUID del dispositivo. Garantía de idempotencia (R3) |
| `payload_hash` | String(64) | SHA-256 del JSON canónico de los campos de negocio (R3) |
| `event_type` | String(16) | `VACCINATION` \| `TREATMENT` \| `CHECKUP` \| `DEWORMING` |
| `din` | String(32), índice | Identificador del animal; sin llave foránea |
| `field_occurred_at` | DateTime(tz) | Hora original de captura; nunca se reemplaza (FR-015) |
| `received_at` | DateTime(tz) | Hora del servidor al registrar (FR-015) |
| `product` | String(120), nullable | |
| `dose_quantity` | Float, nullable | > 0 |
| `dose_unit` | String(16), nullable | `ml` \| `mg` \| `g` \| `unidades` |
| `reason` | Text, nullable | |
| `finding` | Text, nullable | |
| `notes` | Text, nullable | Máx. 500 caracteres |
| `author_email` | String, índice | Igual al usuario autenticado (R7) |
| `farm_id` | Integer, índice | Finca del evento; debe estar en `user.farm_ids` (R7) |
| `origin` | String(16) | `OFFLINE_CAPTURE` \| `LEGACY` |
| `validation_status` | String(32) | Se guarda tal como llega (`PENDIENTE_VALIDACION`). Las transiciones son de la HU-04 (FR-018) |
| `author_verification_pending` | Boolean | Tal como llega del dispositivo; nunca se borra (FR-018) |
| `author_verification_result` | String(16), nullable | `VERIFIED` \| `UNVERIFIED`; solo si `author_verification_pending` (R7) |
| `requires_timestamp_review` | Boolean | `true` si `field_occurred_at` > hora del servidor + 5 min (R6, FR-017b) |
| `batch_log_id` | Integer, índice | Petición en la que llegó (`offline_sync_batch_log.id`), sin llave foránea obligatoria |

Índice compuesto: (`farm_id`, `din`, `field_occurred_at`), para la consulta de historial de la HU-04.

### Tabla `offline_sync_id_conflicts`: identificador repetido con contenido distinto

Constancia para auditoría (FR-013). Solo `INSERT`.

| Campo | Tipo | Reglas |
|---|---|---|
| `id` | Integer PK | |
| `client_event_id` | String(36), índice | El identificador en conflicto |
| `existing_event_id` | Integer | `offline_sync_events.id` del original |
| `existing_payload_hash` | String(64) | |
| `received_payload_hash` | String(64) | |
| `received_payload` | Text (JSON) | Contenido rechazado, para revisión |
| `sender_email` | String | Usuario que lo envió |
| `detected_at` | DateTime(tz) | |

### Tabla `offline_sync_batch_log`: ejecución de sincronización (lado servidor)

Una fila por petición `POST /offline-sync/batches` (FR-029, R13).

| Campo | Tipo | Reglas |
|---|---|---|
| `id` | Integer PK | |
| `user_email` | String, índice | |
| `active_farm_id` | Integer, nullable | Finca activa del token |
| `received_at` | DateTime(tz) | |
| `duration_ms` | Integer | |
| `items_total` | Integer | |
| `synced_count` | Integer | |
| `duplicate_count` | Integer | |
| `failed_retryable_count` | Integer | |
| `failed_final_count` | Integer | |

### Esquemas Pydantic (contratos, ver [contracts/offline-sync-api.md](contracts/offline-sync-api.md))

- `CapturedEvent`: **importado** de `app.features.offline_capture.schemas` (R1). No se redefine.
- `SyncBatchRequest`: `items: list[dict]`, de 1 a 50 elementos (R4, R11).
- `SyncItemResult`: `index`, `clientEventId | null`, `status` (`SINCRONIZADO` \| `DUPLICADO` \| `FALLIDO`), `retryable | null`, `errorCode | null`, `detail | null`, `receivedAt | null`, `requiresTimestampReview`.
- `SyncBatchResponse`: `batchId`, `serverTime`, `results: list[SyncItemResult]` en el mismo orden que `items`.

### Códigos de fallo por evento (R5, R7)

| `errorCode` | `retryable` | Causa |
|---|---|---|
| `VALIDATION_ERROR` | false | El evento no cumple `CapturedEvent` (tipo, datos obligatorios, dosis) |
| `AUTHOR_MISMATCH` | false | `authorEmail` ≠ usuario autenticado |
| `FARM_NOT_ALLOWED` | false | `farmId` no está entre las fincas del usuario |
| `AUTHOR_DISABLED` | false | Usuario deshabilitado antes de la hora de captura |
| `CLIENT_EVENT_ID_CONFLICT` | false | Identificador ya registrado con otro contenido |
| `STORAGE_BUSY` | true | Error transitorio al escribir ese evento (base bloqueada, error operativo) |

---

## Cliente: `frontend/src/features/offline-sync/`

### Base IndexedDB `bovinotech_offline_sync_queue` (R8)

Los eventos capturados se leen de la HU-02 (`captureRepository.getAll()`) y **no se modifican**. Esta base solo guarda el estado de sincronización.

#### Almacén `queue_state`: estado de sincronización por evento

Clave: `client_event_id`. Índices: `byStatus` (`status`) y `byOwner` (`[author_email, status]`).

| Campo | Tipo | Reglas |
|---|---|---|
| `client_event_id` | string UUID | Igual al evento de la HU-02 |
| `author_email` | string | Copia del autor, para filtrar sin abrir la base de la HU-02 |
| `timestamp_utc` | ISO-8601 | Última transición de estado (constitución §2.2) |
| `status` | `pending` \| `syncing` \| `failed` \| `synced` \| `duplicate` | Ver transiciones |
| `failure_kind` | `transient` \| `final` \| null | Solo con `failed` |
| `error_code` | string \| null | Código del servidor o `NETWORK`, `TIMEOUT`, `SERVER_UNAVAILABLE` |
| `error_message` | string \| null | Texto en español para la interfaz (FR-028) |
| `attempts` | integer ≥ 0 | Fallos transitorios consecutivos; vuelve a 0 al confirmarse (FR-024) |
| `next_attempt_at` | ISO-8601 \| null | Programado con `computeRetryDelay` (R9) |
| `confirmed_at` | ISO-8601 \| null | Hora del servidor en la confirmación |
| `server_received_at` | ISO-8601 \| null | `receivedAt` devuelto por el servidor |
| `requires_timestamp_review` | boolean | Copia del resultado del servidor, para mostrarlo |

Un evento de la HU-02 **sin** registro en `queue_state` equivale a `pending`.

#### Almacén `runs`: últimas ejecuciones (R13)

Clave autoincremental. Se conservan las últimas 20.

| Campo | Tipo |
|---|---|
| `started_at`, `finished_at` | ISO-8601 |
| `trigger` | `reconnect` \| `timer` \| `manual` \| `login` |
| `batches` | integer |
| `synced`, `duplicate`, `failed_transient`, `failed_final` | integer |
| `stop_reason` | `queue_empty` \| `offline` \| `auth_paused` \| `error` |

### Transiciones de estado (FR-005 a FR-008, FR-021 a FR-026)

Etiquetas de interfaz (UI-003): `pending` = "Pendiente de sincronización", `syncing` = "Enviando", `synced` = "Sincronizado", `duplicate` = "Duplicado (ya estaba en el servidor)", `failed` = "Fallido".

```text
               ┌──────────────── arranque de la app (recuperación) ───────────────┐
               ▼                                                                  │
 (sin registro) = pending ──envío──▶ syncing ──200 SINCRONIZADO──▶ synced   (final)│
               ▲                       │ ──200 DUPLICADO────────▶ duplicate (final)│
               │                       │ ──200 FALLIDO retryable:false─▶ failed/final (no se reintenta)
               │                       │ ──200 FALLIDO retryable:true ─┐
               │                       │ ──red / 5xx / 429 / timeout ──┤
               │                       │                               ▼
               │                       │                 failed/transient, attempts+1,
               │                       │                 next_attempt_at = now + delay
               │                       │                               │
               │                       └──401/403 (pausa)──▶ pending (attempts sin cambio)
               └──────── next_attempt_at vencido, o "Sincronizar ahora" ◀─────┘
```

Invariantes:
- `synced` y `duplicate` son finales: nunca vuelven a enviarse (SC-003).
- Ninguna transición borra el evento de la HU-02 (FR-007, FR-008).
- `failed/final` solo sale de ese estado por acciones fuera de alcance (HU-04 o soporte).
- Al arrancar, todo `syncing` pasa a `pending` (FR-005).

### Contador del monitor de conectividad (FR-027)

`noConfirmados = eventos del usuario en la HU-02 − (synced + duplicate)`, es decir, `pending` + `syncing` + `failed`, incluidos los que no tienen registro en `queue_state`.
