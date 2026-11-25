# Plan de Implementación: HU-09 `kpi_dashboard`

**Rama**: `feat/hu-09-kpi-dashboard` | **Fecha**: 2026-11-24 | **Spec**: [spec.md](spec.md)

## Resumen

Implementación de un tablero ejecutivo de indicadores sanitarios y productivos auditables. El módulo es **solo lectura** sobre datos existentes (`sanitary_events`, `reconciliation_tickets`, `animal_weights`) y no modifica ninguna tabla preexistente. Se agrega `AnimalWeight` como modelo nuevo con seed demo para el cálculo de GDP.

## Contexto Técnico

- **Backend**: Python 3.11+, FastAPI, SQLAlchemy 2.0, SQLite, Pydantic 2.9, Pytest.
- **Frontend**: React 19, Vite 8, JavaScript, ESLint.
- **Persistencia**: SQLite local; `Base.metadata.create_all`; sin Alembic.
- **Pruebas**: Pytest (unit/contract), Node test runner para lógica pura.
- **Restricciones**: código en inglés, UI/specs en español; sin nuevas dependencias; aislamiento modular; solo lectura sobre modelos existentes; seed idempotente.

## Verificación de Constitución

- **Aislamiento modular**: la implementación vive en `backend/app/features/kpi_dashboard/` y `frontend/src/features/kpi-dashboard/`. Archivos compartidos que se tocan: `backend/app/main.py` y `frontend/src/App.jsx`.
- **Solo lectura**: el módulo nunca escribe en `sanitary_events`, `reconciliation_tickets` ni ninguna tabla preexistente. Solo inserta en `animal_weights` durante el seed.
- **Append-only**: `AnimalWeight` es append-only (no hay UPDATE/DELETE). Nuevos registros de peso se añaden, no se modifican.
- **Idioma**: código, variables, funciones y tests en inglés; UI, spec, plan y documentación en español.
- **RBAC**: se reutilizan `get_current_user` de auth y un nuevo filtro por rol simple en service (no se requiere `require_veterinario` porque los indicadores operativos son visibles para todos los roles autenticados).

## Arquitectura

```text
Frontend React
  frontend/src/features/kpi-dashboard/
    KpiDashboard.jsx          -> Tablero con 4-5 tarjetas + filtros
    KpiDashboardCard.jsx      -> Tarjeta KPI reutilizable
    KpiDashboardFilters.jsx   -> Selector finca + rango fechas
    AuditExportButton.jsx     -> Botón exportar reporte
    kpiDashboardService.js    -> HTTP client
    kpiDashboardUtils.js      -> Formatos, permisos
          │
          ▼
Backend FastAPI
  backend/app/features/kpi_dashboard/
    router.py                 -> GET /dashboard/kpi, GET /dashboard/audit-export
    schemas.py                -> KPIs en camelCase
    service.py                -> 5 computaciones + reporte auditoría
    models.py                 -> AnimalWeight
    seed.py                   -> Pesos demo para GDP
          │
          ├──► sanitary_events (lectura)
          ├──► reconciliation_tickets (lectura)
          ├──► animal_weights (lectura+seed)
          └──► auth/farms (lectura)
```

## Módulo y Estructura

### Backend

- `backend/app/features/kpi_dashboard/__init__.py` — docstring
- `backend/app/features/kpi_dashboard/models.py` — `AnimalWeight`
- `backend/app/features/kpi_dashboard/schemas.py` — `KpiResponse`, `IndicatorValue`, `AuditExportResponse`, etc. (camelCase, `extra="forbid"` en requests)
- `backend/app/features/kpi_dashboard/service.py` — clase `KpiDashboardService` con métodos `get_kpi(...)`, `get_audit_export(...)`, `seed_animal_weights(db=None)`
- `backend/app/features/kpi_dashboard/router.py` — endpoints bajo `/dashboard`
- `backend/app/main.py` — importar modelos, router y seed

### Frontend

- `frontend/src/features/kpi-dashboard/KpiDashboard.jsx` — tablero principal con filtros
- `frontend/src/features/kpi-dashboard/KpiDashboardCard.jsx` — tarjeta de indicador
- `frontend/src/features/kpi-dashboard/KpiDashboardFilters.jsx` — selector finca + fechas
- `frontend/src/features/kpi-dashboard/AuditExportButton.jsx` — botón exportar
- `frontend/src/features/kpi-dashboard/kpiDashboardService.js` — cliente HTTP
- `frontend/src/features/kpi-dashboard/kpiDashboardUtils.js` — formato, permisos
- `frontend/src/features/kpi-dashboard/__tests__/kpiDashboardUtils.test.js` — Node test runner
- `frontend/src/App.jsx` — importar y renderizar `KpiDashboard`

## Contrato de API

Prefijo: `/dashboard`

| Método | Ruta | Auth | Propósito |
|---|---|---|---|
| `GET` | `/kpi?farm_id=&start_date=&end_date=` | Autenticado | KPI consolidados del periodo |
| `GET` | `/audit-export?farm_id=&start_date=&end_date=` | VETERINARIO/DIRECTIVO | Reporte de auditoría |

### KPI Response

```json
{
  "farmId": 1,
  "farmName": "Finca La Esperanza",
  "period": { "start": "2026-01-01", "end": "2026-11-24" },
  "indicators": {
    "validatedVaccinationCoverage": 75.0,
    "pendingValidationEvents": 2,
    "openAlerts": 1,
    "averageGdp": 0.82
  },
  "operationalOnly": false,
  "generatedAt": "2026-11-24T20:00:00Z",
  "generatedBy": "vet@bovinotech.co"
}
```

Para `OPERARIO`: `operationalOnly: true`, y `openAlerts` y `averageGdp` quedan en `null`.

### Audit Export Response

```json
{
  "exportedAt": "2026-11-24T20:00:00Z",
  "exportedBy": "vet@bovinotech.co",
  "filters": { "farmId": 1, "startDate": "2026-01-01", "endDate": "2026-11-24" },
  "kpiSummary": { ... },
  "events": [
    {
      "din": "DIN-DEMO-000001",
      "eventType": "VACCINATION",
      "validationStatus": "VALIDATED",
      "authorEmail": "vet@bovinotech.co",
      "occurredAt": "2026-06-15T10:00:00Z"
    }
  ],
  "totalEvents": 10
}
```

## Manejo de Errores

| Situación | Código |
|---|---|
| Sin token | `401` |
| OPERARIO intenta exportar reporte auditoría | `403` |
| Sin finca activa | `403` (D10, reutiliza `_active_farm_id`) |
| Sin datos en periodo | `200` con indicadores en 0/`null` |
| Fecha inválida | `422` |

## Estrategia de Persistencia

- `AnimalWeight` se crea con `Base.metadata.create_all(bind=engine)`
- Seed idempotente: `seed_animal_weights(db)` inserta solo pares `(din, measured_at)` que no existan
- No hay migraciones ni alteraciones de tablas existentes

## Estrategia de Pruebas

- Unitarias del servicio de KPI (cálculos con datos mock)
- Contrato de endpoints: códigos, RBAC, estructura de respuesta
- Seguridad: OPERARIO no puede exportar, no ve indicadores restringidos
- Frontend: Node test runner para utilidades puras; build/lint

## Decisiones de Implementación

- **D1**: nuevo módulo `kpi_dashboard` — los KPI son una responsabilidad transversal distinta de los features existentes.
- **D2**: solo lectura sobre `sanitary_events` y `reconciliation_tickets` — cero riesgo de corrupción de datos.
- **D3**: `AnimalWeight` como modelo separado — los pesos no pertenecen a sanitary_events ni a sinigan_sync.
- **D4**: seed demo de pesos idempotente — mismo patrón que HU-05 (ignora DINs existentes).
- **D5**: `OPERARIO` recibe `operationalOnly` en lugar de error — la UI puede mostrar/ocultar según el flag.
- **D6**: filtros por query string (`farm_id`, `start_date`, `end_date`) — stateless, cacheable.
- **D7**: sin seed de eventos sanitarios — se asume que los tests crean los datos necesarios.
- **D8**: costReport como null para OPERARIO en lugar de campo ausente — contrato estable independiente del rol.