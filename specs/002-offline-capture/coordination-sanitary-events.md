# Solicitud de coordinación: módulo `sanitary_events` y archivos compartidos (HU-02)

**Para**: responsable del módulo `sanitary_events` / `sanitary-events` y responsables de CI.
**De**: HU-02 `offline_capture` (rama `feat/hu-02-offline-capture`).
**Fecha**: 2026-11-24
**Motivo**: la constitución §2 impide modificar módulos de otros integrantes y archivos compartidos fuera de `main.py` y `App.jsx`. Estos cambios los necesita la HU-02 o su sucesora, la HU-03, pero corresponden a otros responsables.

## 1. Retirar la captura preliminar de la interfaz (FR-018)

- **Qué**: quitar `<OfflineSanitaryCapture />` de `frontend/src/App.jsx` y su importación.
- **Por qué**: la HU-02 reemplaza esa captura. Mientras ambas convivan, el operario ve dos formularios distintos para lo mismo.
- **Sin pérdida de datos**: al abrirse, la nueva captura copia en solo lectura los pendientes (`PENDING_SYNC` y `REJECTED`) de la base `bovinotech_offline`, conservando su `clientEventId` y su hora original (FR-019, research R3). La base antigua no se modifica.
- **Cuándo**: en cualquier momento después de fusionar la HU-02.

## 2. Retirar el endpoint preliminar `POST /sync/batches` (cuando la HU-03 esté fusionada)

- **Cambio respecto a lo previsto**: la tarea T039 pedía que `/sync` aceptara `DEWORMING`, `product`, `doseQuantity`, `doseUnit`, `reason`, `finding`, `authorVerificationPending` y `farmId`. El plan de la HU-03 ([specs/003-offline-batch-sync/plan.md](../003-offline-batch-sync/plan.md), R2) decidió otra cosa: un endpoint propio, `POST /offline-sync/batches`, en el módulo `offline_sync`. Así **no hay que modificar `/sync`**.
- **Qué se pide**: cuando la HU-03 esté fusionada, retirar `POST /sync/batches` y el cliente `frontend/src/features/sanitary-events/syncService.js`.
- **Duplicados**: la HU-03 consulta en solo lectura la tabla `sanitary_events` por `client_event_id`, así que un evento ya subido por el camino preliminar se reconoce como `DUPLICADO`.
- **Fecha futura**: la regla "`FUTURE_TIMESTAMP` en el servidor marca el evento para revisión en lugar de descartarlo" ([contracts/captured-event.md](contracts/captured-event.md)) la implementa la HU-03 en su endpoint (FR-017b). No requiere cambios en `sanitary_events`.

## 3. Ejecutar las pruebas del frontend en CI

- **Qué**:
  - añadir a `frontend/package.json` el script `"test": "node --test 'src/features/**/*.test.js'"`;
  - añadir el paso `npm test` al job `frontend-build` de `.github/workflows/ci.yml`.
- **Nota**: Node 22 no acepta un directorio como argumento de `node --test`, así que hace falta el patrón glob entre comillas.
- **Por qué**: hoy las 69 pruebas de `offline-capture` (y las de `sinigan-sync`) solo corren en local.
- **Coste en CI**: menos de 1 s.

## Estado

| Solicitud | Estado |
|---|---|
| 1. Retirar `OfflineSanitaryCapture` | Pendiente de aprobación |
| 2. Retirar `/sync/batches` tras la HU-03 | Pendiente (depende de la HU-03) |
| 3. Script `test` y paso de CI | Pendiente de aprobación |
