# Plan de Implementación: HU-05 `sinigan_sync`

**Rama**: `feat/hu-05-sinigan-sync` | **Fecha**: 2026-11-21 | **Spec**: [spec.md](spec.md)

## Resumen

Implementación de la conciliación entre la ficha oficial simulada de SINIGÁN V6 y un registro de campo ficticio, sin sobrescritura automática. La solución reutiliza el módulo `sinigan` existente como fuente oficial read-only y agrega la rebanada vertical `sinigan_sync` con comparador, tickets de conciliación, resolución veterinaria y UI.

## Contexto Técnico

- **Backend**: Python 3.11+, FastAPI, SQLAlchemy 2.0, SQLite, Pydantic 2.9, Pytest.
- **Frontend**: React 19, Vite 8, JavaScript, ESLint.
- **Persistencia**: SQLite local; `Base.metadata.create_all`; sin Alembic.
- **Pruebas**: Pytest (unit/contract/security), Node test runner para lógica pura, E2E con navegador.
- **Restricciones**: código en inglés, UI/specs en español; sin dependencias nuevas; aislamiento modular; sin sobrescritura automática; sin red externa.

## Verificación de Constitución

- **Aislamiento modular**: la implementación vive en `backend/app/features/sinigan_sync/` y `frontend/src/features/sinigan-sync/`. Los únicos archivos compartidos que se tocan son `backend/app/main.py` y `frontend/src/App.jsx`.
- **Jerarquía SINIGÁN V6**: la ficha oficial solo se lee; cualquier divergencia se deriva a un ticket y a resolución humana.
- **Append-only**: los snapshots del ticket y la resolución no se actualizan ni se eliminan. El único cambio de estado es `OPEN -> CLOSED`.
- **Offline-first**: HU-05 es una funcionalidad de conciliación; no introduce captura offline ni modifica `sanitary_events`.
- **Idioma**: código, variables, funciones y tests en inglés; UI, spec, plan y documentación en español.

## Arquitectura

```text
Frontend React
  frontend/src/features/sinigan-sync/
    SiniganReconciliation.jsx
    siniganSyncService.js
    siniganSyncUtils.js
          │
          ▼
Backend FastAPI
  backend/app/features/sinigan_sync/
    router.py       -> auth, status codes
    schemas.py      -> contratos Pydantic camelCase
    service.py      -> orquestación y transacciones
    comparator.py   -> reglas puras de comparación
    models.py       -> SQLAlchemy
          │
          ├──► sinigan_service.adapter.find_animal_by_din()
          │      └── MockSiniganAdapter + fixtures oficiales (read-only)
          │
          └──► SQLite
                field_animal_records
                reconciliation_tickets
                reconciliation_discrepancies
                reconciliation_resolutions
```

## Módulo y Estructura

### Backend

- `backend/app/features/sinigan_sync/__init__.py`
- `backend/app/features/sinigan_sync/models.py`: `FieldAnimalRecord`, `ReconciliationTicket`, `ReconciliationDiscrepancy`, `ReconciliationResolution`.
- `backend/app/features/sinigan_sync/schemas.py`: requests/responses con aliases camelCase y `extra="forbid"`.
- `backend/app/features/sinigan_sync/comparator.py`: comparación pura de snapshots.
- `backend/app/features/sinigan_sync/service.py`: comparación, tickets, listado, detalle y resolución.
- `backend/app/features/sinigan_sync/router.py`: endpoints bajo `/integrations/sinigan-sync`.
- `backend/app/features/sinigan_sync/fixtures/field_animals.json`: 5 registros de campo ficticios.
- `backend/app/main.py`: importar modelos, registrar router y seed idempotente de campo.
- `backend/tests/`: unit, contract y security.

### Frontend

- `frontend/src/features/sinigan-sync/SiniganReconciliation.jsx`: panel de consulta, comparación, tickets y resolución.
- `frontend/src/features/sinigan-sync/siniganSyncService.js`: cliente HTTP.
- `frontend/src/features/sinigan-sync/siniganSyncUtils.js`: etiquetas, gating de rol y utilidades puras.
- `frontend/src/features/sinigan-sync/__tests__/siniganSyncUtils.test.js`: Node test runner.
- `frontend/src/App.jsx`: importar y renderizar el panel.

## Contrato de API

Prefijo: `/integrations/sinigan-sync`

| Método | Ruta | Auth | Propósito |
|---|---|---|---|
| `POST` | `/comparisons` | Autenticado | Comparar ficha oficial vs campo |
| `GET` | `/tickets` | Autenticado | Listar tickets (`status`, `din`) |
| `GET` | `/tickets/{id}` | Autenticado | Detalle con snapshots y resolución |
| `POST` | `/tickets/{id}/resolution` | `VETERINARIO` | Resolver y cerrar ticket |

### Comparación

Body: `{"din": "DIN-DEMO-000002"}`

Respuesta: `meta` con `mockLabel = "MODO SIMULADO (SINIGÁN V6 MOCK)"`, `official`, `field`, `result` (`CONSISTENTE`/`DISCREPANCIA`), `discrepancies[]`, `ticket | null`.

### Resolución

Body: `{"decision": "OFICIAL_PREVALECE" | "CAMPO_PREVALECE", "reason": "..."}`
Motivo: 5–500 caracteres después de `trim`.

## Modelo de Datos

### `field_animal_records`

`id`, `din` unique, `species`, `sex`, `age_group`, `sit_code`, `establishment_name`, `source`, `updated_at`.

### `reconciliation_tickets`

`id`, `din`, `status` (`OPEN`/`CLOSED`), `official_snapshot` JSON, `field_snapshot` JSON, `official_source`, `field_source`, `compared_at`, `created_by_email`, `created_at`, `closed_at`.

### `reconciliation_discrepancies`

`id`, `ticket_id` FK, `field_name`, `field_value`, `official_value`, `official_source`, `field_source`, `detected_at`. Unique `(ticket_id, field_name)`.

### `reconciliation_resolutions`

`id`, `ticket_id` unique FK, `decision`, `reason`, `resolved_by_email`, `resolved_at`.

## Estrategia de Comparación

1. Validar y normalizar DIN.
2. Obtener ficha oficial del adaptador existente. Si no existe: `404`, sin escrituras.
3. Obtener registro de campo. Si no existe: `409`, sin escrituras.
4. Comparar `species`, `sex`, `age_group`, `sit_code` normalizados.
5. Sin diferencias: `CONSISTENTE`, sin ticket.
6. Con diferencias: crear ticket `OPEN`, snapshots y filas de discrepancia; responder `DISCREPANCIA`.
7. Nunca modificar la ficha oficial ni el registro de campo.

## Estrategia de Persistencia y Trazabilidad

- Los snapshots oficial/campo son inmutables.
- Cada discrepancia conserva valor oficial, valor de campo, origen y fecha.
- La resolución conserva decisión, motivo, autor y fecha.
- Un ticket solo puede resolverse una vez; una segunda resolución devuelve `409`.
- No hay endpoints destructivos.

## Manejo de Errores

| Situación | Código |
|---|---|
| Sin token | `401` |
| Operario intenta resolver | `403` |
| DIN inválido | `400` |
| DIN inexistente | `404` sin escrituras |
| Sin registro de campo | `409` sin ticket |
| Ticket inexistente | `404` |
| Ticket ya cerrado | `409` |
| Motivo inválido | `422` |
| Decisión inválida | `422` |

## Datos de Campo Ficticios

| DIN | Ficha oficial | Registro de campo | Resultado |
|---|---|---|---|
| `DIN-DEMO-000001` | BOVINO / HEMBRA / ADULTO / SIT-DEMO-001 | Igual | Sin discrepancia |
| `DIN-DEMO-000002` | BOVINO / MACHO / JOVEN / SIT-DEMO-001 | HEMBRA / JOVEN | Discrepancia de sexo |
| `DIN-DEMO-000003` | BOVINO / HEMBRA / TERNERO / SIT-DEMO-001 | HEMBRA / ADULTO | Discrepancia de grupo etario |
| `DIN-DEMO-000004` | BUFALINO / MACHO / ADULTO / SIT-DEMO-002 | BOVINO / MACHO / ADULTO / SIT-DEMO-001 | Discrepancia de especie y predio |
| `DIN-DEMO-000005` | BUFALINO / HEMBRA / JOVEN / SIT-DEMO-002 | Igual | Sin discrepancia |

## Estrategia de Pruebas

- Unitarias del comparador y del servicio.
- Contrato de los 4 endpoints, códigos y aliases camelCase.
- Seguridad: roles, mass assignment, sin red externa, sin rutas destructivas.
- No sobrescritura: snapshots y fixtures intactos antes/después.
- Aceptación AC-01…AC-04 con evidencia de ejecución.
- Frontend: Node test runner para utilidades puras; build/lint; E2E en navegador.

## Decisiones de Implementación

- **D1**: worktree aislado desde `main`; no se toca HU-02.
- **D2**: registro de campo mínimo ficticio, read-only, con seed idempotente.
- **D3**: un ticket nuevo por cada comparación con discrepancia.
- **D4**: resolución con decisión + motivo; solo `VETERINARIO`; sin mutar datos.
- **D5**: consulta para usuarios autenticados; resolución solo `VETERINARIO`.
- **D6**: spec en `specs/005-sinigan-sync/`.
- **D7**: ejecución multiagente con sesiones independientes `opencode run --agent`.
- **D8**: etiqueta exacta `MODO SIMULADO (SINIGÁN V6 MOCK)` visible en el nuevo panel.
- **D9**: entorno local sin Docker.

## Seguimiento de Complejidad

| Decisión | Justificación | Alternativa rechazada |
|---|---|---|
| Nuevo módulo `sinigan_sync` | La conciliación es una responsabilidad distinta del adaptador oficial | Mezclar tickets dentro de `sinigan` |
| Registro de campo mínimo | El repo no tiene inventario y AC-03 necesita datos de campo | Inventar un módulo de inventario completo |
| Reutilizar `sinigan_service.adapter` | Una sola fuente de verdad oficial | Duplicar fixtures oficiales |
| Sin nuevas dependencias | Mantener el stack y el CI actuales | Agregar framework de componentes o Docker |
