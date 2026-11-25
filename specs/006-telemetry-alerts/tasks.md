# Tareas: HU-006 `telemetry`

**Estado**: POR HACER  
**Fase**: Rebanada vertical activa  
**Dependencia**: HU-001 autenticación y finca activa disponible

## Fase 1 — Contratos y pruebas primero

- [x] T001 Validar `spec.md` y `plan.md` contra `constitution.md` y registrar aprobación humana del alcance.
- [x] T002 Congelar esquemas, estados, errores, matriz RBAC y contrato de idempotencia en `specs/006-telemetry-alerts/contracts/telemetry-api.md`.
- [x] T003 [P] Crear generador determinista sin secretos en `backend/tests/fixtures/telemetry_factory.py`.
- [x] T004 [P] Probar rangos, coordenadas, precisión, orden temporal y hash canónico en `backend/tests/unit/test_telemetry_validation.py`.
- [x] T005 [P] Probar inmovilidad, geocerca, borde y `INSUFFICIENT_DATA` en `backend/tests/unit/test_alert_rules.py`.
- [x] T006 [P] Probar selección y conservación de versiones en `backend/tests/unit/test_alert_rule_versions.py`.
- [ ] T007 [P] Probar esquemas, estados parciales, errores y paginación en `backend/tests/contract/test_telemetry_api.py`.
- [ ] T008 [P] Probar matriz de permisos y no divulgación cruzada en `backend/tests/contract/test_alerts_api.py`.
- [x] T009 Probar reenvío idéntico, conflicto de contenido y deduplicación por lectura en `backend/tests/integration/test_telemetry_batches.py`.
- [x] T010 Probar aislamiento real entre dos fincas (consulta y cierre sin divulgación cruzada) en `backend/tests/security/test_telemetry_security.py`.

## Fase 2 — Backend aislado

- [x] T011 Crear modelos de dispositivo, lote, lectura, geocerca, regla, evaluación, alerta y cierre en `backend/app/features/telemetry/models.py`.
- [x] T012 Crear esquemas tipados de entrada/salida con límites estrictos en `backend/app/features/telemetry/schemas.py`.
- [x] T013 Crear migración idempotente y restricciones/índices en `backend/app/features/telemetry/schema_migration.py`.
- [x] T014 Implementar autenticación de dispositivo y dependencias RBAC en `backend/app/features/telemetry/dependencies.py`.
- [x] T015 Implementar funciones puras de inmovilidad, geocerca y evidencia insuficiente en `backend/app/features/telemetry/rules.py`.
- [x] T016 Implementar validación, hash canónico e ingesta idempotente por lote en `backend/app/features/telemetry/service.py`.
- [x] T017 Implementar evaluación versionada, alerta única por condición y agregado de evidencia en `backend/app/features/telemetry/service.py`.
- [x] T018 Implementar consulta filtrada, configuración versionada y cierre humano en `backend/app/features/telemetry/service.py`.
- [x] T019 Implementar endpoints de ingesta, alertas, reglas y geocercas en `backend/app/features/telemetry/router.py`.
- [ ] T020 Completar el seed mínimo idempotente: regla y geocerca están disponibles; el dispositivo depende de secreto externo y falta telemetría de demostración.
- [x] T021 Registrar modelos, migración, router y seed agregando únicamente las líneas necesarias en `backend/app/main.py`.

## Fase 3 — Frontend aislado

- [x] T022 Implementar cliente HTTP y traducción de errores en `frontend/src/features/alerts/alertService.js`.
- [x] T023 Implementar listado, contadores y filtros en `frontend/src/features/alerts/AlertsPanel.jsx`.
- [x] T024 Implementar evidencia, regla aplicada y antigüedad de ubicación en `frontend/src/features/alerts/AlertDetail.jsx`.
- [x] T025 Implementar cierre humano con observación y permisos visibles en `frontend/src/features/alerts/AlertDetail.jsx`.
- [x] T026 Implementar componentes de filtros y exportaciones en `frontend/src/features/alerts/AlertFilters.jsx` y `index.js`.
- [x] T027 Registrar la vista agregando únicamente las líneas necesarias en `frontend/src/App.jsx`.
- [ ] T028 [P] Crear pruebas frontend de estados, filtros, roles y cierre sin duplicar en `frontend/src/features/alerts/`.

## Fase 4 — Integración, seguridad y SRE

- [x] T029 Ejecutar E2E telemetría→alerta→consulta→cierre y conservar evidencia trazable en `docs/evidence/hu-06-telemetry-alerts/qa-2026-11-24.md`.
- [ ] T030 Probar dispositivo revocado, secreto inválido, payload sobredimensionado, texto malicioso y ausencia de secretos en logs.
- [x] T031 Medir p95 recepción→alerta con carga sintética en `backend/tests/performance/test_alert_latency.py`; exigir menos de dos minutos y documentar objetivo crítico menor a diez segundos.
- [ ] T032 Ejecutar suite backend completa, SAST y comprobación de secretos.
- [x] T033 Ejecutar pruebas frontend, ESLint y build de producción.
- [ ] T034 Verificar que la compuerta CI finaliza en menos de 90 segundos o separar la prueba de carga ampliada.
- [x] T035 Actualizar `progress.md`, trazar cada criterio a evidencia y obtener revisión de `@qa-seguridad` y aprobación humana.

## Definition of Done

- Cadena `spec.md` → `plan.md` → `tasks.md` → `progress.md` completa y aprobada.
- Criterios de aceptación trazados a pruebas automatizadas y evidencia E2E.
- Ingesta idempotente sin duplicados por lote, lectura o condición activa.
- `INSUFFICIENT_DATA` evita falsos positivos por huecos o mala precisión.
- Aislamiento por finca y matriz RBAC verificados con pruebas negativas.
- Cierre humano conserva autor, fecha, observación y evidencia previa.
- Reglas y geocercas versionadas sin alterar alertas históricas.
- p95 del piloto menor a dos minutos y objetivo crítico menor a diez segundos documentado.
- Pytest, SAST, pruebas frontend, ESLint y build en verde.
- Sin credenciales, tokens ni claves incluidas en el repositorio.
- Aprobación humana obtenida antes de integrar.

