# Contratos: módulo `offline_sync`

## 1. `POST /offline-sync/batches`

Recibe un lote de eventos capturados offline (HU-02) y devuelve un resultado por evento. Es idempotente por `clientEventId` (FR-011 a FR-014).

**Autorización**: token de la HU-01, resuelto con `get_current_user_for_sync`, que también acepta un usuario deshabilitado después de emitirse el token (R7). Rol `OPERARIO` o `VETERINARIO`.

### Petición

```json
{
  "items": [
    {
      "clientEventId": "7f9c2a5e-0b8d-4d7e-9a51-2f3e4c5d6e7f",
      "eventType": "VACCINATION",
      "din": "DIN-DEMO-000001",
      "fieldOccurredAt": "2026-11-23T13:45:10Z",
      "product": "Aftosa bivalente",
      "doseQuantity": 2,
      "doseUnit": "ml",
      "reason": null,
      "finding": null,
      "notes": null,
      "authorEmail": "operario@bovinotech.co",
      "farmId": 1,
      "authorVerificationPending": false,
      "syncStatus": "PENDIENTE_SINCRONIZACION",
      "validationStatus": "PENDIENTE_VALIDACION",
      "origin": "OFFLINE_CAPTURE"
    }
  ]
}
```

- `items`: de 1 a 50 elementos. Cada uno tiene la forma de `CapturedEvent` ([contrato de la HU-02](../../002-offline-capture/contracts/captured-event.md)).
- Cada elemento se valida **por separado** (R4). Un elemento inválido no invalida el lote.
- `syncStatus` se acepta pero se ignora: lo decide el servidor.

### Respuesta 200

`results` sigue el mismo orden que `items`.

```json
{
  "batchId": 812,
  "serverTime": "2026-11-24T15:02:11Z",
  "results": [
    {
      "index": 0,
      "clientEventId": "7f9c2a5e-0b8d-4d7e-9a51-2f3e4c5d6e7f",
      "status": "SINCRONIZADO",
      "retryable": null,
      "errorCode": null,
      "detail": null,
      "receivedAt": "2026-11-24T15:02:11Z",
      "requiresTimestampReview": false
    },
    {
      "index": 1,
      "clientEventId": "1b2c…",
      "status": "DUPLICADO",
      "retryable": null,
      "errorCode": null,
      "detail": "El evento ya estaba registrado en el servidor.",
      "receivedAt": "2026-11-24T14:10:03Z",
      "requiresTimestampReview": false
    },
    {
      "index": 2,
      "clientEventId": "9d8e…",
      "status": "FALLIDO",
      "retryable": true,
      "errorCode": "STORAGE_BUSY",
      "detail": "El servidor no pudo registrar el evento. Se reintentará.",
      "receivedAt": null,
      "requiresTimestampReview": false
    }
  ]
}
```

| `status` | Significado para el dispositivo |
|---|---|
| `SINCRONIZADO` | Registrado ahora. Confirmado |
| `DUPLICADO` | Ya existía con el mismo contenido, en `offline_sync_events` o en el registro preliminar `sanitary_events` (R2). Confirmado. `receivedAt` es el del registro original |
| `FALLIDO` + `retryable: true` | Transitorio. Sigue en cola y se reintenta con espera progresiva |
| `FALLIDO` + `retryable: false` | Definitivo. Sigue en el dispositivo, visible y sin reintento automático |

### Códigos `errorCode` y mensajes

| `errorCode` | `retryable` | `detail` (español, se muestra en la interfaz) |
|---|---|---|
| `VALIDATION_ERROR` | false | "El evento tiene datos inválidos: {campos}." |
| `AUTHOR_MISMATCH` | false | "El evento pertenece a otro usuario y solo puede sincronizarlo su autor." |
| `FARM_NOT_ALLOWED` | false | "Ya no tiene acceso a la finca de este evento." |
| `AUTHOR_DISABLED` | false | "El evento se capturó después de deshabilitar la cuenta." |
| `CLIENT_EVENT_ID_CONFLICT` | false | "El identificador del evento ya se usó con datos distintos." |
| `STORAGE_BUSY` | true | "El servidor no pudo registrar el evento. Se reintentará." |

### Respuestas de error del lote completo

| Código | Cuándo | Acción del cliente (R5) |
|---|---|---|
| 401 | Sin token, token inválido o vencido | Pausar; reanudar tras iniciar sesión (FR-020) |
| 403 | Rol sin captura (`DIRECTIVO`, `ADMINISTRADOR`) o contraseña pendiente de cambio | Pausar con aviso; no marcar fallos definitivos |
| 422 | `items` vacío, más de 50 elementos o cuerpo no JSON | Partir el lote y registrar el diagnóstico |
| 429 / 5xx | Servidor saturado o caído | Transitorio para todo el lote |

### Garantías del servidor

1. Como máximo un registro por `clientEventId`, también ante envíos simultáneos (restricción única + *savepoint* por evento, R3).
2. Un evento ya registrado nunca se actualiza ni se borra (append-only, FR-016).
3. `fieldOccurredAt` se guarda tal cual. `receivedAt` es la hora del servidor (FR-015).
4. Más de 5 min en el futuro → se registra con `requiresTimestampReview: true` (FR-017b).
5. El fallo de un evento no afecta a los demás del lote (FR-014).
6. Cada petición deja una fila en `offline_sync_batch_log` (FR-029).

---

## 2. Contrato interno del frontend (`frontend/src/features/offline-sync/`)

Lo que el módulo exporta para el App Shell y para la HU-02:

| Símbolo | Uso |
|---|---|
| `OfflineSyncProvider` | Contexto que arranca el motor (disparadores, temporizador, recuperación). Se registra en `App.jsx` |
| `SyncStatusBadge` | Badge del monitor de conectividad: 🟢 Online / 🔴 Offline (Modo Campo) + contador de no confirmados + indicador "Enviando" (FR-027) |
| `SyncNowButton` | Acción "Sincronizar ahora" (FR-002), de 48×48 px como mínimo |
| `useSyncStatus()` | `{ online, running, unconfirmedCount, lastRun, syncNow() }` |
| `syncStateRepository.getStatusMap()` | `Map<clientEventId, queueState>` para que la bandeja y el detalle de la HU-02 muestren el estado real (coordinación, R8) |
| `describeSyncState(queueState)` | Texto en español del estado, motivo y próximo intento (UI-003, FR-028) |

Funciones puras (se prueban con `node --test`):

| Símbolo | Firma |
|---|---|
| `computeRetryDelay` | `(attempt, random) → ms` (R9) |
| `selectDueEvents` | `(events, statusMap, now, { manual }) → events[]`, ordenados por captura (R11) |
| `chunkBatches` | `(events, size = 50) → events[][]` |
| `applyBatchResult` | `(queueStates, response \| transportError, now, random) → queueStates` (R5) |
| `recoverInterrupted` | `(queueStates) → queueStates` (`syncing` → `pending`) |

---

## 3. Casos compartidos

[sync-batch.cases.json](sync-batch.cases.json) define escenarios de lote con su resultado esperado. Lo usan las pruebas `pytest` del servicio y las pruebas `node --test` de `applyBatchResult`.
