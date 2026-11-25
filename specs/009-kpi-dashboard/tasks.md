# Tareas desglosadas: HU-09 kpi_dashboard

## T1 — Backend: Modelo AnimalWeight + seed
- Crear `backend/app/features/kpi_dashboard/__init__.py`
- Crear `backend/app/features/kpi_dashboard/models.py` (AnimalWeight)
- Crear `backend/app/features/kpi_dashboard/seed.py` (seed idempotente con 9 registros demo)
- Registrar en `backend/app/main.py` (import modelo + seed)

## T2 — Backend: Service + Schemas + Router
- Crear `backend/app/features/kpi_dashboard/schemas.py` (KpiResponse, AuditExportResponse, etc.)
- Crear `backend/app/features/kpi_dashboard/service.py` (KpiDashboardService con get_kpi, get_audit_export)
- Crear `backend/app/features/kpi_dashboard/router.py` (GET /dashboard/kpi, GET /dashboard/audit-export)
- Registrar router en `backend/app/main.py`

## T3 — Backend: Tests unitarios y de contrato
- Tests unitarios del service con datos mock
- Tests de contrato de los endpoints (códigos, RBAC, estructura)
- Tests de seguridad (OPERARIO no exporta, no ve costos)

## T4 — Frontend: Componentes del tablero
- Crear `frontend/src/features/kpi-dashboard/kpiDashboardService.js`
- Crear `frontend/src/features/kpi-dashboard/kpiDashboardUtils.js`
- Crear `frontend/src/features/kpi-dashboard/KpiDashboardFilters.jsx`
- Crear `frontend/src/features/kpi-dashboard/KpiDashboardCard.jsx`
- Crear `frontend/src/features/kpi-dashboard/KpiDashboard.jsx`
- Crear `frontend/src/features/kpi-dashboard/AuditExportButton.jsx`
- Crear `frontend/src/features/kpi-dashboard/__tests__/kpiDashboardUtils.test.js`
- Integrar en `frontend/src/App.jsx`