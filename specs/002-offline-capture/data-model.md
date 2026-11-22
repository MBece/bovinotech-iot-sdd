# Modelo de Datos: Captura offline de eventos sanitarios (HU-02)

**Spec**: [spec.md](spec.md) · **Investigación**: [research.md](research.md)

## Cliente: base IndexedDB `bovinotech_offline_capture` (R2)

### Almacén `events` — Evento sanitario capturado

Clave: `clientEventId`. Índice `byAuthorFarm`: `[authorEmail, farmId]`. Solo se inserta con `add`; nunca se actualiza ni se borra en esta HU (FR-016).

| Campo | Tipo | Reglas |
|---|---|---|
| `clientEventId` | string UUID v4 | Generado en el dispositivo al guardar (FR-002). Inmutable |
| `eventType` | `VACCINATION` \| `TREATMENT` \| `CHECKUP` \| `DEWORMING` | Obligatorio (FR-001, R4) |
| `din` | string | Debe existir en `catalog` para la finca activa (FR-008) |
| `animalName` | string \| null | Copia del catálogo al guardar, para mostrar sin consultar el catálogo |
| `fieldOccurredAt` | ISO-8601 UTC | Instante del dispositivo al guardar; no editable (FR-006). No puede ser futuro (FR-007) |
| `product` | string \| null | Obligatorio en `VACCINATION`, `DEWORMING`, `TREATMENT` (FR-015) |
| `doseQuantity` | number \| null | > 0; obligatorio con `product` (FR-015) |
| `doseUnit` | `ml` \| `mg` \| `g` \| `unidades` \| null | Obligatorio con `doseQuantity` |
| `reason` | string \| null | Obligatorio en `TREATMENT` |
| `finding` | string \| null | Hallazgo u observación; obligatorio en `CHECKUP` |
| `notes` | string \| null | Opcional, máx. 500 caracteres |
| `authorEmail` | string | Usuario en sesión (el `sub` del token de la HU-01). Es la identidad del autor |
| `farmId` | integer | Finca activa (HU-01) |
| `authorVerificationPending` | boolean | `true` si la sesión offline estaba vencida (FR-013) |
| `syncStatus` | `PENDIENTE_SINCRONIZACION` | Estado inicial; la HU-03 define las transiciones (FR-005) |
| `validationStatus` | `PENDIENTE_VALIDACION` | Estado inicial; la HU-04 define las transiciones (FR-005) |
| `savedAt` | ISO-8601 UTC | En esta HU es igual a `fieldOccurredAt` (Q1). Se conserva aparte para el día en que se permita registrar una hora anterior, sin cambiar el esquema |
| `origin` | `OFFLINE_CAPTURE` \| `LEGACY` | `LEGACY` para eventos copiados de la captura preliminar (R3) |

Los eventos `LEGACY` pueden no cumplir FR-015 (sin `product` ni `doseUnit`; `dose` pasa a `doseQuantity`). No se rechazan ni se completan (FR-019).

**Estados** (dos ejes independientes; en esta HU no hay transiciones):

```text
syncStatus:       PENDIENTE_SINCRONIZACION ──(HU-03)──> SINCRONIZADO | DUPLICADO | FALLIDO
validationStatus: PENDIENTE_VALIDACION     ──(HU-04)──> validado / corregido
```

### Almacén `catalog` — Animal del catálogo local

Clave: `[farmId, din]`. Índice `byFarm`: `farmId`. Se reemplaza completo por finca en cada descarga exitosa (transacción única: borra los de la finca e inserta los nuevos).

| Campo | Tipo | Reglas |
|---|---|---|
| `farmId` | integer | Finca a la que pertenece |
| `din` | string | Formato `DIN-DEMO-NNNNNN`, en mayúsculas |
| `name` | string | Nombre o señas visibles |
| `downloadedAt` | ISO-8601 UTC | Momento de la descarga |

Volumen de diseño: hasta 5.000 animales por finca y 1.000 eventos pendientes (SC-001, SC-007).

## Servidor: módulo `backend/app/features/offline_capture/`

### Tabla `offline_capture_animals` (seed propio, R7)

| Campo | Tipo | Reglas |
|---|---|---|
| `id` | Integer PK | |
| `din` | String(32), índice | Formato `DIN-DEMO-NNNNNN` |
| `name` | String | |
| `farm_id` | Integer, índice | Id de finca de la HU-01. Sin llave foránea (constitución §2) |

Restricción única: (`farm_id`, `din`). El seed (`fixtures/catalog.json`) es idempotente.

### Esquema `CapturedEvent` (contrato congelado para la HU-03, R5)

Mismos campos y reglas que el almacén `events`, salvo los internos del cliente (`animalName`, `savedAt`). Ver [contracts/captured-event.md](contracts/captured-event.md). Esta HU no persiste eventos en el servidor.
