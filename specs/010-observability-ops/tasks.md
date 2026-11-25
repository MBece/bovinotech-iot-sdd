# Tareas de Implementación: HU-10 — Observabilidad Técnica, SLI/SLO y Error Budget

**Entrada**: `specs/010-observability-ops/spec.md` y `specs/010-observability-ops/plan.md`  
**Metodología**: TDD Estricto (Fase Roja $\rightarrow$ Fase Verde $\rightarrow$ Refactorización)  
**Límite de Trabajo**: `WIP = 1`

---

## Fase 1: Pruebas Automatizadas TDD (Fase Roja - Red Phase) 🔴

- [ ] **T010-01 [P] [US1/US2]** Crear `backend/tests/test_observability_ops.py` con pruebas para:
  - Generación y propagación automática de `correlation_id` en cabecera `X-Correlation-ID` y logs.
  - Endpoint `GET /ops/metrics` retornando latencia p99, p50, tasa de sincronización y estado `SALUDABLE`.
  - Endpoint `GET /ops/logs` retornando registros estructurados con `correlation_id` y sin secretos quemados.
  - Endpoint `POST /ops/simulate-degradation` activando degradación (latencia $> 10\text{ s}$ o fallos) y cambiando Error Budget a `AGOTADO`.
  - Activación de compuerta `is_freeze_active=True` ante estado `AGOTADO`.
- [ ] **T010-02** Ejecutar `pytest backend/tests/test_observability_ops.py` y verificar estado **ROJO** (fallo controlado).

---

## Fase 2: Implementación Backend (Fase Verde - Green Phase) 🟢

- [ ] **T010-03** Crear `backend/app/features/observability_ops/schemas.py` con contratos Pydantic v2.
- [ ] **T010-04** Crear `backend/app/features/observability_ops/service.py` con el motor en memoria de recolección de métricas, cálculo de p99/p50, buffer de logs estructurados y lógica de Error Budget.
- [ ] **T010-05** Crear `backend/app/features/observability_ops/middleware.py` para inyectar y propagar `correlation_id` en cada petición HTTP.
- [ ] **T010-06** Crear `backend/app/features/observability_ops/router.py` exponiendo los endpoints `/ops/metrics`, `/ops/error-budget`, `/ops/logs` y `/ops/simulate-degradation`.
- [ ] **T010-07** Registrar el middleware y el router en `backend/app/main.py`.
- [ ] **T010-08** Ejecutar `pytest backend/tests/test_observability_ops.py` y confirmar estado **VERDE** (100% pasando).

---

## Fase 3: Implementación Frontend (Panel SRE) 🟢

- [ ] **T010-09** Crear `frontend/src/features/observability_ops/ObservabilityDashboard.jsx` con:
  - Tarjetas de métricas: Latencia p99 vs SLO ($< 10\text{ s}$), Tasa de Éxito de Sincronización ($99.9\%$), Tasa de Error.
  - Indicador visual de Presupuesto de Error (*Error Budget*).
  - Alerta prominente de **Congelamiento de Cambios (*Feature Freeze*)** cuando esté `AGOTADO`.
  - Controles de simulación interactiva ("Modo Saludable" vs "Simular Degradación / Agotar Presupuesto").
- [ ] **T010-10** Integrar pestaña o selector en `frontend/src/App.jsx` para alternar entre la vista de negocio y el panel técnico de observabilidad.
- [ ] **T010-11** Ejecutar `npm run lint` y `npm run build` en `frontend/` y verificar compilación limpia sin errores.

---

## Fase 4: Auditoría y Despliegue 🛡️

- [ ] **T010-12** Auditar implementación con `@qa-seguridad` contra `ISO/IEC 25010:2023` y `NISTIR 8259A`.
- [ ] **T010-13** Ejecutar `git status`, `git add .`, commit convencional y push hacia `origin feat/hu-10-observability-ops`.
