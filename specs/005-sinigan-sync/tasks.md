# Tareas de Implementación: HU-05 `sinigan_sync`

## Fase 0 — Baseline y evidencia

- [x] T000 Crear worktree aislado `feat/hu-05-sinigan-sync` desde `main`.
- [ ] T001 Registrar baseline `pytest`, `bandit`, `eslint`, `build`.
- [ ] T002 Congelar hash de `specs/005-sinigan-sync/spec.md` y del plan aprobado.

## Fase 1 — Especificación y análisis

- [ ] T010 A1 Arquitecto: diagnóstico y ADRs.
- [ ] T011 A2 Analista: descomposición de HU-05 y matriz AC.
- [ ] T012 Crear contrato de API congelado.

## Fase 2 — TDD rojo

- [ ] T020 A5 QA: pruebas de contrato AC-01/AC-02.
- [ ] T021 A5 QA: pruebas de contrato AC-03/AC-04.
- [ ] T022 A5 QA: pruebas de seguridad y no sobrescritura.
- [ ] T023 Registrar G1-red con fallos esperados.

## Fase 3 — Backend

- [ ] T030 Modelos SQLAlchemy y schemas Pydantic.
- [ ] T031 Comparador puro.
- [ ] T032 Servicio de comparación, tickets y resolución.
- [ ] T033 Router y registro en `main.py`.
- [ ] T034 Seed idempotente de registros de campo ficticios.
- [ ] T035 Tests unitarios backend.
- [ ] T036 G2-backend-green.

## Fase 4 — Frontend

- [ ] T040 Servicio HTTP `siniganSyncService.js`.
- [ ] T041 Utilidades puras y etiquetas.
- [ ] T042 Panel `SiniganReconciliation.jsx`.
- [ ] T043 Integración en `App.jsx`.
- [ ] T044 Tests Node de utilidades.
- [ ] T045 G3-frontend-green (`lint`, `build`, Node tests).

## Fase 5 — QA y aceptación

- [ ] T050 A5 QA: suite completa backend.
- [ ] T051 A5 QA: E2E fullstack local AC-01…AC-04.
- [ ] T052 Evidencias `acceptance/AC-01..04.md` y capturas.
- [ ] T053 G4-acceptance.

## Fase 6 — Revisión y auditoría

- [ ] T060 A6A revisión de arquitectura.
- [ ] T061 A6B revisión de código.
- [ ] T062 Triage de hallazgos y correcciones.
- [ ] T063 Re-ejecución de pruebas tras correcciones.
- [ ] T064 A7 auditoría independiente.
- [ ] T065 `traceability.md`, `REPORT.md` y sellado de evidencia.

## Fuera de Alcance

- Docker / compose.
- Modificación de `sinigan`, `sanitary_events` o `auth`.
- Corrección automática de datos oficiales o de campo.
- Nuevas dependencias Python o npm.
