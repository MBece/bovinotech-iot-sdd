# Solicitud de coordinación: HU-03 `offline_sync`

**De**: HU-03 `offline_sync` (rama `feat/hu-03-offline-sync`).
**Fecha**: 2026-11-24
**Motivo**: la constitución §2 impide modificar módulos de otros integrantes y archivos compartidos fuera de `main.py` y `App.jsx`. Estas solicitudes salen del Seguimiento de Complejidad de [plan.md](plan.md).

## 1. HU-04 (validación y correcciones): leer `offline_sync_events`

- **Para**: responsable de la HU-04 / módulo `sanitary_events`.
- **Qué**: tratar la tabla `offline_sync_events` como la fuente de los eventos sanitarios sincronizados. Allí está la copia única e inmutable de cada `CapturedEvent` de la HU-02, con `validation_status = PENDIENTE_VALIDACION`. Esquema en [data-model.md](data-model.md).
- **Por qué**: duplicar los eventos en dos tablas crearía dos fuentes de verdad. La tabla `sanitary_events` no tiene los campos de la HU-02 (`DEWORMING`, `product`, `doseUnit`, `reason`, `finding`, `farmId`).
- **Campos útiles para la HU-04**: `requires_timestamp_review` (hora de captura posterior a la del servidor en más de 5 min; FR-017b) y `author_verification_result` (verificación de autor de eventos capturados con la sesión vencida).
- **Índice disponible** para el historial por animal: (`farm_id`, `din`, `field_occurred_at`).

## 2. Retirar el camino preliminar de sincronización

- **Para**: responsable de `sanitary_events` / `sanitary-events`.
- **Qué**: retirar `POST /sync/batches` y `frontend/src/features/sanitary-events/syncService.js`, junto con la captura preliminar. Ya está pedido en [specs/002-offline-capture/coordination-sanitary-events.md](../002-offline-capture/coordination-sanitary-events.md), §1 y §2.
- **Sin duplicados mientras convivan**: `offline_sync` consulta `sanitary_events.client_event_id` en solo lectura y responde `DUPLICADO` si el evento ya subió por el camino preliminar (research R2).

## 3. Pruebas del frontend en CI

- **Para**: responsables de CI.
- **Qué**: en `frontend/package.json`, `"test": "node --test 'src/features/**/*.test.js'"`; en el job `frontend-build` de `.github/workflows/ci.yml`, el paso `npm test`.
- **Por qué**: las 44 pruebas de `offline-sync` (más las de `offline-capture` y `sinigan-sync`) hoy solo corren en local. Es la misma solicitud que la §3 de la HU-02.

## 4. Archivos de la HU-02 (`offline-capture`) tocados por la HU-03

- **Responsable**: el mismo integrante de la HU-02 y la HU-03, así que no hace falta aprobación de otro equipo; se deja constancia por transparencia (auditoría QA-09).
- **Qué se tocó y por qué**:
  - `frontend/src/features/offline-capture/{pendingTrayModel.js, eventDetailModel.js, PendingTray.jsx, EventDetail.jsx}` y sus pruebas: punto de extensión opcional `syncLabelOf` para que la bandeja y el detalle muestren el estado real de sincronización (research R8, T046, T049). Si no se pasa, se conserva el comportamiento anterior.
  - `backend/app/features/offline_capture/schemas.py` y `frontend/src/features/offline-capture/eventValidation.js` (+ pruebas): corrección de QA-01. Un evento `LEGACY` ya no queda exento de las reglas que no dependen de la antigüedad del dato (dosis > 0, unidad permitida, límites de longitud; `doseUnit` ≤ 16). Las reglas de obligatoriedad de FR-015 siguen sin aplicarse a `LEGACY`, como fija FR-019 de la HU-02, y los casos compartidos de `specs/002-offline-capture/contracts/captured-event.cases.json` siguen pasando sin cambios.
- **Dependencia en ambos sentidos**: `offline-capture/PendingTray.jsx` importa de `offline-sync` y `offline-sync/syncServices.js` importa `offline-capture/captureServices.js`. Se acepta mientras ambos módulos sean del mismo integrante.
- **`App.jsx`**: se unificaron en una sola línea las dos importaciones de `./features/offline-sync`.

## Estado

| Solicitud | Estado |
|---|---|
| 1. HU-04 lee `offline_sync_events` | Pendiente de aprobación |
| 2. Retirar `/sync/batches` y la captura preliminar | Pendiente (pedido en la HU-02) |
| 3. `npm test` en CI | Pendiente de aprobación |
| 4. Archivos de la HU-02 tocados | Informativo (mismo integrante) |
