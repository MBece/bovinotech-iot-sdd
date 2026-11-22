# A6B — Revisión de código D10 (aislamiento por finca)

- **Agente:** A6B (revisor de código, read-only)
- **Fecha:** 2026-11-22
- **Alcance:** delta D10 sobre la implementación HU-05 ya aprobada
- **Veredicto:** **APROBADO CON OBSERVACIONES**
- **Bloqueantes:** ninguno · **Mayores:** ninguno

> Nota de proceso: A6B agotó su límite de pasos antes de escribir el archivo.
> El contenido de este informe es el que A6B produjo y verificó; A0 lo transcribió
> sin alterar hallazgos ni veredicto. No se modificó código, tests, specs ni
> evidencia.

## Confirmación de rutas que evaden el filtro por finca

**Ninguna.** Las 4 rutas llaman `_active_farm_id`:

| Ruta | Llamada en servicio | Filtro |
|---|---|---|
| `POST /comparisons` | `service.py:207` → `compare` | Query por `(din, farm_id)` en `:220-226` |
| `GET /tickets` | `service.py:311` → `list_tickets` | Filtro `farm_id` en `:312-314`; conteos scoped en `:333-341` |
| `GET /tickets/{id}` | `service.py:356` → `get_ticket` | Filtro `id + farm_id` en `:358-363`; hijos por `ticket.id` en `:372-380` |
| `POST /tickets/{id}/resolution` | `service.py:415` → `resolve_ticket` | Filtro `id + farm_id` en `:417-422`; chequeo de `CLOSED` posterior |

No hay `db.get(...)` por PK ni consultas sin filtro en el módulo. Verificado por
inspección y sonda de cross-farm (detail y resolution responden 404 con cuerpo
idéntico al de ticket inexistente).

## Tabla de hallazgos

### Menores

| ID | Severidad | Archivo:línea | Escenario de fallo | Recomendación |
|---|---|---|---|---|
| M-01 | Menor | `schema_migration.py:16,32-38` | El `DEFAULT 1` permanece tras migrar; un `INSERT` SQL que omita `farm_id` cae silenciosamente en finca 1 (fail-open a nivel BD), mientras el esquema fresco falla cerrado con `IntegrityError` | Reconstruir la tabla tras migrar o al menos documentar la asimetría; el código actual siempre setea `farm_id`, así que no hay impacto hoy |
| M-02 | Menor | `auth/dependencies.py:57` + `service.py:44` | El `claim farm_id` se confía sin revalidar membresía (`farm_id in user.farm_ids`). Verificado con token firmado con claim `farm_id=2` para operario asignado solo a finca 1: es aceptado (200/409). Una asignación revocada sigue operando hasta el vencimiento del token (7 días) | Validar `active_farm_id in user.farm_ids` (o en `user.farms`) en el dependency o en `_active_farm_id` |
| M-03 | Menor | `router.py:41-47` y validación Pydantic | Con token sin finca, `POST /comparisons` devuelve **400** (DIN inválido) o **422** (body extra/faltante) antes del 403; `GET /tickets?limit=0` devuelve 422. No hay fuga de datos ni bypass, pero el "403 en las 4 rutas" no es universal | Mover el chequeo de finca activa a una `Depends()` que corra antes de la validación Pydantic (anotado también por A6A como obs-1) |
| M-04 | Menor | `SiniganReconciliation.jsx:50-60` y `:92-95` | En error de listado no se limpian `tickets`; en error de detalle no se limpia `detail`. Con remonte por finca no hay fuga cruzada, pero puede mostrarse data previa junto al error | Agregar `setTickets([])` / `setDetail(null)` en los `catch` o usar un estado de carga que borre al iniciar |
| M-05 | Menor | `SiniganReconciliation.jsx:159-174` | `handleResolved` recarga `result.id` aunque el usuario haya seleccionado otro ticket entre el clic y la respuesta; el encabezado y el detalle pueden divergir | Usar `selectedTicketId` capturado al inicio de la operación |
| M-06 | Menor | Tests duplicados de 403 | `test_sinigan_sync_farm_scope.py` y `test_sinigan_sync_farm_isolation.py` duplican cobertura 403; falta test explícito de **ADMINISTRADOR no resuelve** (verificado por sonda, no por test) | Consolidar tests y agregar `test_admin_cannot_resolve` |
| M-07 | Menor | `siniganSyncUtils.test.js:85-96` | El test "reloads tickets when the active farm or token changes" solo prueba `buildTicketsLoadKey`; no verifica que el componente recargue ni descarte respuestas viejas | Agregar tests de componente (relacionado con R-01) |
| M-08 | Menor | `test_sinigan_sync_schema_migration.py` | No cubre orden con `create_all`/seeds, ni tablas parcialmente migradas (columna `farm_id` nullable/sin default), ni colisión concurrente de ALTER | Ampliar cobertura de migración |

### Observaciones

| ID | Severidad | Archivo | Descripción |
|---|---|---|---|
| Obs-1 | Observación | UI | La UI muestra "Finca activa" desde `user.farmId` (localStorage), no desde una fuente verificada; es solo presentación, el backend manda |
| Obs-2 | Observación | `siniganSyncService.js:9` | Fallback 403 dice "Solo un veterinario…", engañoso para 403 sin finca; el `detail` del backend siempre prevalece |

### Residuales previos (sin modificar)

| ID | Descripción |
|---|---|
| R-01 | Sin tests de componente (M-02/M-03/L-04) |
| R-02 | Carrera entre respuestas en el listado (sin `AbortController`) |
| R-03 | Seeds en import time de `models.py` |
| R-04 | Rama `IntegrityError` de doble resolución concurrente sin test dedicado (verificada por sonda: funciona) |

## Checklist de focos

| Foco | Veredicto | Evidencia |
|---|---|---|
| Seguridad/IDOR — ninguna ruta evade el filtro | ✅ Cumple | Confirmación arriba; sonda cross-farm 404 |
| Fail-closed — 403 en las 4 rutas | ✅ Cumple con M-03 | Sonda: token sin `farm_id` → 403; verificado en las 4 rutas |
| No fuga de existencia — 404/409 indistinguibles | ✅ Cumple | Sonda: mismo cuerpo para ticket inexistente y de otra finca |
| No-overwrite — discrepancias/resoluciones no mutan datos | ✅ Cumple | `service.py:441-455` solo escribe `ReconciliationResolution`, no toca `field_animal_records` |
| Validación — motivo 5–500, decisión enum, solo VETERINARIO | ✅ Cumple | Sonda: ADMINISTRADOR recibe 403; `schemas.py:32-34` enum; `router.py:89-92` require_veterinario |
| Migración — idempotente, orden correcto, NOT NULL DEFAULT | ✅ Cumple con M-01/M-08 | `schema_migration.py` idempotente; `main.py:30-34` orden correcto; asimetría DEFAULT documentada |
| Transacciones/concurrencia — doble resolución, rollback | ✅ Cumple | Sonda forzada: 409, rollback, ticket OPEN, resolución previa intacta |
| Bugs — DIN, None, fechas, off-by-one, filtros que se pisan | ✅ Sin hallazgos | Inspección completa |
| Frontend — remonte, key, recarga, 403/404, fugas | ✅ Cumple con M-04/M-05/Obs-1 | remonte por `key={user.farmId}`; recarga por token+finca |
| Tests — verifican realmente el filtro | ✅ Cumple con M-06/M-07/M-08 | `test_farm_isolation.py` y `test_farm_scope.py` fallan si se quita el filtro |

## Ejecuciones verificadas

| Suite | Resultado |
|---|---|
| `pytest -q` (backend) | **122 passed**, 1 warning, EXIT=0 |
| `npm run lint` | EXIT=0 |
| `npm run build` | EXIT=0, 38 módulos, `index-C2PcMXLf.js` |
| `node --test` (frontend) | **20 tests, 20 pass, 0 fail**, EXIT=0 |
| `bandit -q -r app/features/sinigan_sync` | EXIT=0, sin hallazgos |
| Sonda ADMINISTRADOR no resuelve | 403 `"Acceso denegado: Se requiere rol de Veterinario"` |
| Sonda cross-farm detail | 404, mismo cuerpo que ticket inexistente |
| Sonda doble resolución concurrente | 409, rollback, ticket OPEN |

## Riesgos residuales

M-01 a M-08 y Obs-1/Obs-2 de la tabla anterior, más R-01 a R-04. Todos no bloqueantes.
Los 4 AC y el aislamiento D10 quedan demostrados.

## Recomendación

Cierre de D10 apto. Las observaciones M-01…M-08 son de endurecimiento, contrato
estricto y deuda de tests; pueden tratarse como deuda técnica en un ticket futuro
o como parte de la limpieza previa al merge a `develop`.