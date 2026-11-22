# Contratos: módulo `offline_capture`

## 1. `GET /offline-capture/catalog`

Catálogo de animales de la finca activa, para descargarlo al dispositivo cuando hay conexión (FR-009, R7).

- **Autorización**: token de la HU-01 con rol `OPERARIO` o `VETERINARIO` (`require_write_access`). La finca es siempre la `active_farm_id` del token; no se acepta como parámetro.
- **200**:

```json
{
  "farmId": 1,
  "generatedAt": "2026-11-21T14:00:00Z",
  "animals": [
    { "din": "DIN-DEMO-000001", "name": "Luna" }
  ]
}
```

| Respuesta | Cuándo |
|---|---|
| 200 | Lista (puede ser vacía) ordenada por `din` |
| 401 | Sin token, token inválido o usuario deshabilitado |
| 403 | Rol sin permiso de escritura (`DIRECTIVO`, `ADMINISTRADOR`) o contraseña pendiente de cambio |

## 2. Evento capturado (`CapturedEvent`)

Forma del evento que guarda el dispositivo y que la HU-03 enviará al servidor. Campos en camelCase, igual que `/sync` hoy.

```json
{
  "clientEventId": "7f9c2a5e-0b8d-4d7e-9a51-2f3e4c5d6e7f",
  "eventType": "VACCINATION",
  "din": "DIN-DEMO-000001",
  "fieldOccurredAt": "2026-11-21T13:45:10Z",
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
```

### Reglas de validación (FR-007, FR-008, FR-015)

| Código de error | Regla | Mensaje (UI) |
|---|---|---|
| `ANIMAL_NOT_IN_CATALOG` | `din` no existe en el catálogo de la finca activa (solo en el cliente) | "El animal no existe en el catálogo de esta finca." |
| `FUTURE_TIMESTAMP` | `fieldOccurredAt` > hora actual (cliente: reloj del dispositivo; servidor: hora del servidor + 5 min de tolerancia) | "La fecha del evento no puede ser futura." |
| `INVALID_EVENT_TYPE` | Tipo fuera de los 4 permitidos | "Tipo de evento no válido." |
| `PRODUCT_REQUIRED` | Falta `product` en `VACCINATION`, `DEWORMING` o `TREATMENT` | "Indique el producto aplicado." |
| `DOSE_REQUIRED` | Falta `doseQuantity` en esos tipos | "Indique la dosis." |
| `DOSE_NOT_POSITIVE` | `doseQuantity` ≤ 0 | "La dosis debe ser mayor que cero." |
| `DOSE_UNIT_REQUIRED` | `doseQuantity` sin `doseUnit`, o unidad fuera de `ml`, `mg`, `g`, `unidades` | "Elija la unidad de la dosis." |
| `REASON_REQUIRED` | Falta `reason` en `TREATMENT` | "Indique el motivo del tratamiento." |
| `FINDING_REQUIRED` | Falta `finding` en `CHECKUP` | "Indique el hallazgo u observación." |
| `STORAGE_WRITE_FAILED` | No se pudo escribir en el almacenamiento del dispositivo (solo cliente) | "No se pudo guardar el evento en el dispositivo. Libere espacio e intente de nuevo." |

Los eventos con `origin: "LEGACY"` quedan exentos de las reglas de FR-015 (FR-019).

En el servidor, `FUTURE_TIMESTAMP` no descarta el evento: la HU-03 lo marca para revisión y conserva su `client_event_id`, porque un reloj adelantado no debe causar pérdida de registros (constitución §5.4). En el cliente sí se rechaza la captura.

Los textos en blanco cuentan como faltantes. Si hay varios errores, se informan todos, en el orden de la tabla.

### Casos compartidos

[captured-event.cases.json](captured-event.cases.json) contiene los casos válidos e inválidos con el código de error esperado. Lo usan tanto las pruebas `pytest` del esquema `CapturedEvent` como las pruebas `node --test` de `eventValidation.js` (R5). La regla `ANIMAL_NOT_IN_CATALOG` solo se prueba en el cliente.

## 3. Contrato interno del frontend

Lo que `frontend/src/features/offline-capture/` exporta para otras HU (la HU-03 lo consumirá):

| Símbolo | Uso |
|---|---|
| `captureRepository.listPending({ authorEmail, farmId })` | Eventos `PENDIENTE_SINCRONIZACION` del usuario en la finca |
| `captureRepository.getAll()` | Todos los eventos del almacén (para la HU-03) |
| `OfflineCapturePanel` | Vista registrada en `App.jsx` |

Esta HU **no** expone operaciones para cambiar estados; la HU-03 y la HU-04 las añadirán.
