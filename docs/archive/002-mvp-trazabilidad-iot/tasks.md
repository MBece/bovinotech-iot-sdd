# Tareas: MVP Integral de Trazabilidad Ganadera e IoT

**Entrada**: `spec.md`, `plan.md`, constitución y `docs/integrations/sinigan-mock-integration.md`.

**Prerrequisito**: completar el endurecimiento pendiente de HU-01 en `specs/001-auth-rbac/tasks.md`.

**Regla TDD**: en cada historia se escriben primero las pruebas, se demuestra el fallo esperado, se implementa el mínimo y se vuelve a ejecutar la suite completa.

**Formato**: `[ID] [P?] [HU] Descripción con ruta exacta`.

## Fase 1 - Preparación y contratos compartidos

- [ ] T001 Crear rama `feat/002-mvp-trazabilidad-iot` y registrar aprobación del alcance por el Product Owner.
- [ ] T002 Incorporar Alembic y su configuración bajo `backend/alembic/` y `backend/alembic.ini`.
- [ ] T003 Crear configuración tipada en `backend/app/core/config.py` para entorno, base de datos, modo SINIGAN y límites del MVP.
- [ ] T004 [P] Crear manejo uniforme de errores en `backend/app/core/errors.py`.
- [ ] T005 [P] Crear middleware de `correlation_id` en `backend/app/core/middleware.py`.
- [ ] T006 [P] Crear logging estructurado sin datos sensibles en `backend/app/core/logging.py`.
- [ ] T007 Configurar una base SQLite temporal por prueba en `backend/tests/conftest.py` sin reutilizar `bovinotech.db`.
- [ ] T008 [P] Crear factories y reloj controlable en `backend/tests/fixtures/factories.py` y `backend/tests/fixtures/clock.py`.
- [ ] T009 [P] Añadir Vitest, Testing Library y scripts `test`/`test:coverage` en `frontend/package.json`.
- [ ] T010 [P] Añadir Playwright y script `test:e2e` en `frontend/package.json`.
- [ ] T011 Crear estructura `backend/tests/unit`, `contract`, `integration`, `security`, `performance` y `frontend/src/tests`.
- [ ] T012 Actualizar `.github/workflows/ci.yml` para ejecutar backend, frontend unitario, build, lint, E2E, SAST y auditoría de dependencias.
- [ ] T013 Definir umbrales iniciales de cobertura: 90% para reglas críticas y 80% global, documentados en `pytest.ini` y configuración frontend.
- [ ] T014 Ejecutar la suite base y registrar el resultado inicial en `specs/002-mvp-trazabilidad-iot/validation-baseline.md`.

**Checkpoint F1**: infraestructura de pruebas aislada y CI capaz de bloquear regresiones.

---

## Fase 2 - Modelo base de animales y auditoría

### Pruebas primero

- [ ] T015 [P] [HU02] Crear pruebas unitarias de identificadores, fechas UTC y finca en `backend/tests/unit/test_animal_validation.py`.
- [ ] T016 [P] [HU04] Crear pruebas de auditoría obligatoria en `backend/tests/unit/test_audit_validation.py`.
- [ ] T017 [P] [HU05] Crear pruebas de unicidad de DIN y separación de fuentes en `backend/tests/integration/test_external_reference_persistence.py`.
- [ ] T018 [P] [HU02] Crear pruebas HTTP de consulta de animal y 404 en `backend/tests/contract/test_animals_api.py`.

### Implementación

- [ ] T019 [P] [HU02] Crear modelos `Animal` y finca/lote mínimo en `backend/app/features/animals/models.py`.
- [ ] T020 [P] [HU05] Crear `AnimalExternalReference` y `EstablishmentExternalReference` en `backend/app/features/animals/models.py`.
- [ ] T021 [HU02] Crear migración inicial de animales y referencias externas en `backend/alembic/versions/`.
- [ ] T022 [P] [HU02] Crear esquemas en `backend/app/features/animals/schemas.py`.
- [ ] T023 [HU02] Implementar servicio de consulta en `backend/app/features/animals/service.py`.
- [ ] T024 [HU02] Implementar `GET /animals/{animal_id}` en `backend/app/features/animals/router.py`.
- [ ] T025 [HU02] Registrar router y manejadores en `backend/app/main.py`.
- [ ] T026 [HU04] Crear `AuditRecord` append-only en `backend/app/core/audit.py` y su migración.
- [ ] T027 Ejecutar T015-T018 y la suite de regresión; adjuntar evidencia al PR.

**Checkpoint F2**: animal local consultable, referencias externas separadas y escrituras auditables.

---

## Fase 3 - HU-02 Captura offline de eventos sanitarios

### Pruebas primero

- [ ] T028 [P] [HU02] Probar tipos de evento, dosis, animal, autor y UUID en `backend/tests/unit/test_sanitary_event_validation.py`.
- [ ] T029 [P] [HU02] Probar persistencia inmutable y estado inicial en `backend/tests/integration/test_sanitary_event_persistence.py`.
- [ ] T030 [P] [HU02] Probar contrato de `POST /sanitary-events` y errores 400/404/401 en `backend/tests/contract/test_sanitary_events_api.py`.
- [ ] T031 [P] [HU02] Probar repositorio IndexedDB con reinicio simulado en `frontend/src/tests/unit/offlineEventRepository.test.js`.
- [ ] T032 [P] [HU02] Probar formulario offline, validación y etiqueta pendiente en `frontend/src/tests/integration/SanitaryEventForm.test.jsx`.

### Implementación

- [x] T033 [P] [HU02] Crear `SanitaryEvent` en `backend/app/features/sanitary_events/models.py` con `client_event_id` único.
- [ ] T034 [HU02] Crear migración de eventos sanitarios en `backend/alembic/versions/`.
- [ ] T035 [P] [HU02] Crear esquemas y catálogos versionados en `backend/app/features/sanitary_events/schemas.py`.
- [x] T036 [HU02] Implementar validaciones y creación en `backend/app/features/sanitary_events/service.py`.
- [ ] T037 [HU02] Implementar `POST /sanitary-events` en `backend/app/features/sanitary_events/router.py`.
- [x] T038 [P] [HU02] Implementar repositorio IndexedDB en `frontend/src/core/offline/offlineEventRepository.js`.
- [ ] T039 [P] [HU02] Implementar servicio local en `frontend/src/features/sanitary-events/services/sanitaryEventService.js`.
- [ ] T040 [HU02] Implementar formulario de captura y estados en `frontend/src/features/sanitary-events/components/SanitaryEventForm.jsx`.
- [ ] T041 [HU02] Añadir listado de pendientes en `frontend/src/features/sanitary-events/components/PendingEventsList.jsx`.
- [ ] T042 [HU02] Probar guardado < 2 s y recuperación tras cierre en `frontend/src/tests/e2e/offline-capture.spec.js`.

**Checkpoint HU-02**: captura válida sin red, persistente y firmada por usuario/dispositivo.

---

## Fase 4 - HU-03 Sincronización idempotente

### Pruebas primero

- [ ] T043 [P] [HU03] Probar partición de lotes, backoff y jitter determinista en `frontend/src/tests/unit/syncQueue.test.js`.
- [x] T044 [P] [HU03] Probar deduplicación por `client_event_id` en `backend/tests/unit/test_sync_idempotency.py`.
- [ ] T045 [P] [HU03] Probar resultados parciales y rollback en `backend/tests/integration/test_sync_batches.py`.
- [x] T046 [P] [HU03] Probar contrato de `POST /sync/batches` en `backend/tests/contract/test_sync_api.py`.
- [ ] T047 [P] [HU03] Probar reenvío concurrente del mismo evento en `backend/tests/integration/test_sync_concurrency.py`.

### Implementación

- [x] T048 [P] [HU03] Crear esquemas equivalentes `SyncBatch`, `SyncItem` y `SyncResult` en `backend/app/features/sanitary_events/schemas.py`.
- [x] T049 [HU03] Implementar servicio idempotente en `backend/app/features/sanitary_events/service.py`.
- [x] T050 [HU03] Implementar `POST /sync/batches` en `backend/app/features/sanitary_events/router.py`.
- [ ] T051 [P] [HU03] Implementar cola y máquina de estados en `frontend/src/features/sync/syncQueue.js`.
- [ ] T052 [P] [HU03] Implementar detector de conectividad y disparador en `frontend/src/features/sync/syncCoordinator.js`.
- [x] T053 [HU03] Integrar resultado individual con IndexedDB sin borrar antes de confirmar.
- [ ] T054 [HU03] Añadir indicador visual de pendientes, reintentos y conflictos en `frontend/src/features/sync/SyncStatus.jsx`.
- [ ] T055 [HU03] Crear simulador de cortes controlado solo en desarrollo en `frontend/src/features/sync/networkSimulator.js`.
- [ ] T056 [HU03] Probar flujo E2E de 24 horas simuladas y reenvío en `frontend/src/tests/e2e/offline-sync.spec.js`.
- [ ] T057 [HU03] Ejecutar carga de reconexión configurable en `backend/tests/performance/test_sync_reconnection_load.py`.

**Checkpoint HU-03**: 100% de eventos del escenario se sincronizan una sola vez.

---

## Fase 5 - HU-04 Historial solo-anexión

### Pruebas primero

- [x] T058 [P] [HU04] Probar cadena de correcciones y estado vigente en `backend/tests/unit/test_event_history_projection.py`.
- [ ] T059 [P] [HU04] Probar motivo obligatorio y rol veterinario en `backend/tests/unit/test_event_correction_rules.py`.
- [ ] T060 [P] [HU04] Probar rechazo de UPDATE/DELETE destructivo en `backend/tests/security/test_append_only_enforcement.py`.
- [x] T061 [P] [HU04] Probar contrato de corrección e historial en `backend/tests/contract/test_event_history_api.py`.
- [ ] T062 [P] [HU04] Probar transacciones concurrentes de corrección en `backend/tests/integration/test_event_correction_concurrency.py`.

### Implementación

- [x] T063 [HU04] Crear el modelo append-only `SanitaryEventCorrection` con evento original, versión, autor y motivo.
- [x] T064 [HU04] Implementar proyección ordenada del historial en `backend/app/features/sanitary_events/service.py`.
- [x] T065 [HU04] Implementar servicio de corrección en `backend/app/features/sanitary_events/service.py`.
- [x] T066 [HU04] Implementar `POST /sanitary-events/{event_id}/corrections`.
- [x] T067 [HU04] Implementar `GET /sanitary-events/by-din/{din}/history` para el corte académico.
- [x] T068 [HU04] Crear línea de tiempo auditable en `frontend/src/features/sanitary-events/SanitaryHistory.jsx`.
- [x] T069 [HU04] Integrar formulario veterinario de corrección en `frontend/src/features/sanitary-events/SanitaryHistory.jsx`.
- [ ] T070 [HU04] Probar E2E original -> corrección -> auditoría en `frontend/src/tests/e2e/event-correction.spec.js`.

**Checkpoint HU-04**: historia completa, original intacto y corrección restringida.

---

## Fase 6 - HU-05 SINIGAN mock: animal por DIN

### Pruebas primero

- [x] T071 [P] [HU05] Probar metadatos obligatorios y ausencia de cliente HTTP en `backend/tests/unit/test_mock_sinigan_adapter.py`.
- [ ] T072 [P] [HU05] Probar mapper externo -> referencia interna en `backend/tests/unit/test_sinigan_mappers.py`.
- [x] T073 [P] [HU05] Probar DIN válido, inválido e inexistente en `backend/tests/contract/test_sinigan_animal_api.py`.
- [x] T074 [P] [HU05] Probar que fixtures no contienen identificadores reales conocidos en `backend/tests/security/test_sinigan_fixture_privacy.py`.
- [x] T075 [P] [HU05] Probar bloqueo de tráfico hacia ICA/SINIGAN en `backend/tests/security/test_sinigan_no_external_network.py`.

### Implementación

- [x] T076 [P] [HU05] Definir protocolo `SiniganAdapter` en `backend/app/features/sinigan/adapter.py`.
- [x] T077 [P] [HU05] Crear esquemas de metadatos y animal en `backend/app/features/sinigan/schemas.py`.
- [x] T078 [P] [HU05] Crear cinco animales simulados en `backend/app/features/sinigan/fixtures/animals.json`.
- [x] T079 [HU05] Implementar `MockSiniganAdapter` sin red en `backend/app/features/sinigan/mock_adapter.py`.
- [ ] T080 [HU05] Implementar mappers en `backend/app/features/sinigan/mappers.py`.
- [x] T081 [HU05] Implementar servicio y `GET /integrations/sinigan/animals/{din}`.
- [x] T082 [HU05] Implementar `GET /integrations/sinigan/status` con capacidades de solo lectura.
- [x] T083 [HU05] Documentar Swagger con advertencia de simulación en `backend/app/features/sinigan/router.py`.
- [x] T084 [HU05] Crear consulta DIN y etiqueta visible en `frontend/src/features/sinigan/SiniganAnimalLookup.jsx`.
- [ ] T085 [HU05] Probar E2E consulta DIN y 404 en `frontend/src/tests/e2e/sinigan-animal-lookup.spec.js`.

**Checkpoint aproximado 50% del MVP**: autenticación, captura offline, sync, append-only y referencia SINIGAN por DIN demostrables.

---

## Fase 7 - HU-05 SINIGAN mock ampliado y reconciliación

### Pruebas primero

- [ ] T086 [P] [HU05] Probar filtros de predios e inventario en `backend/tests/unit/test_sinigan_establishment_filters.py`.
- [ ] T087 [P] [HU05] Probar eventos y custodia deterministas en `backend/tests/unit/test_sinigan_history.py`.
- [ ] T088 [P] [HU05] Probar contratos GET restantes, 400 y 404 en `backend/tests/contract/test_sinigan_reference_api.py`.
- [ ] T089 [P] [HU05] Probar creación de ticket sin sobrescritura en `backend/tests/integration/test_reconciliation_flow.py`.
- [ ] T090 [P] [HU05] Probar resolución solo por veterinario y motivo obligatorio en `backend/tests/security/test_reconciliation_rbac.py`.

### Implementación

- [ ] T091 [P] [HU05] Crear fixtures simulados de establecimientos, eventos y custodia en `backend/app/features/sinigan/fixtures/`.
- [ ] T092 [HU05] Implementar filtros y consultas ampliadas en `backend/app/features/sinigan/mock_adapter.py`.
- [ ] T093 [HU05] Implementar endpoints de establecimientos, inventario, eventos y custodia en `backend/app/features/sinigan/router.py`.
- [ ] T094 [P] [HU05] Crear `ReconciliationTicket` en `backend/app/features/reconciliation/models.py` y migración.
- [ ] T095 [HU05] Implementar detector y servicio de divergencias en `backend/app/features/reconciliation/service.py`.
- [ ] T096 [HU05] Implementar creación y resolución de tickets en `backend/app/features/reconciliation/router.py`.
- [ ] T097 [HU05] Crear cola de revisión en `frontend/src/features/reconciliation/ReconciliationQueue.jsx`.
- [ ] T098 [HU05] Crear comparación de fuentes y resolución en `frontend/src/features/reconciliation/ReconciliationDetail.jsx`.
- [ ] T099 [HU05] Probar E2E divergencia -> decisión -> auditoría.

**Checkpoint HU-05**: mock completo de lectura y decisiones humanas auditables.

---

## Fase 8 - HU-06 Telemetría y alertas

### Pruebas primero

- [ ] T100 [P] [HU06] Probar rangos, orden temporal y coordenadas en `backend/tests/unit/test_telemetry_validation.py`.
- [ ] T101 [P] [HU06] Probar inmovilidad, geocerca y dato insuficiente en `backend/tests/unit/test_alert_rules.py`.
- [ ] T102 [P] [HU06] Probar ingesta idempotente por lote en `backend/tests/integration/test_telemetry_batches.py`.
- [ ] T103 [P] [HU06] Probar RBAC y contratos en `backend/tests/contract/test_alerts_api.py`.
- [ ] T104 [P] [HU06] Probar p95 bajo carga sintética en `backend/tests/performance/test_alert_latency.py`.

### Implementación

- [ ] T105 [P] [HU06] Crear modelos de dispositivo, telemetría, regla y alerta en `backend/app/features/telemetry/models.py`.
- [ ] T106 [HU06] Crear migración de telemetría y alertas.
- [ ] T107 [HU06] Implementar validadores e ingesta en `backend/app/features/telemetry/service.py`.
- [ ] T108 [HU06] Implementar motor de reglas versionadas en `backend/app/features/telemetry/rules.py`.
- [ ] T109 [HU06] Implementar endpoints de lotes, consulta y cierre humano en `backend/app/features/telemetry/router.py`.
- [ ] T110 [P] [HU06] Crear generador determinista en `backend/tests/fixtures/telemetry_factory.py`.
- [ ] T111 [HU06] Crear panel de alertas en `frontend/src/features/alerts/AlertsPanel.jsx`.
- [ ] T112 [HU06] Probar E2E telemetría -> alerta -> cierre humano.

---

## Fase 9 - HU-07 Genealogía y consanguinidad

### Pruebas primero

- [ ] T113 [P] [HU07] Probar ciclos, autorrelación y fechas imposibles en `backend/tests/unit/test_genealogy_validation.py`.
- [ ] T114 [P] [HU07] Probar árboles de tres generaciones en `backend/tests/unit/test_genealogy_tree.py`.
- [ ] T115 [P] [HU07] Probar casos matemáticos validados en `backend/tests/unit/test_inbreeding_calculation.py`.
- [ ] T116 [P] [HU07] Probar contratos y permisos en `backend/tests/contract/test_genealogy_api.py`.

### Implementación

- [ ] T117 [HU07] Crear `GenealogyRelation` y política versionada en `backend/app/features/genealogy/models.py` con migración.
- [ ] T118 [HU07] Implementar validaciones, árbol y cálculo en `backend/app/features/genealogy/service.py`.
- [ ] T119 [HU07] Implementar endpoints en `backend/app/features/genealogy/router.py`.
- [ ] T120 [HU07] Crear árbol y simulador de cruce en `frontend/src/features/genealogy/GenealogyView.jsx`.
- [ ] T121 [HU07] Probar E2E relación válida, inconsistente y cruce riesgoso.

---

## Fase 10 - HU-08 Productividad

### Pruebas primero

- [ ] T122 [P] [HU08] Probar validación y atípicos de pesaje en `backend/tests/unit/test_weight_validation.py`.
- [ ] T123 [P] [HU08] Probar GDP por ventanas y muestras mínimas en `backend/tests/unit/test_gdp_calculation.py`.
- [ ] T124 [P] [HU08] Probar eficiencia y costo/kg en `backend/tests/unit/test_productivity_indicators.py`.
- [ ] T125 [P] [HU08] Probar contratos y paginación en `backend/tests/contract/test_productivity_api.py`.

### Implementación

- [ ] T126 [HU08] Crear modelos de pesaje y consumo en `backend/app/features/productivity/models.py` con migración.
- [ ] T127 [HU08] Implementar detección de atípicos y cálculos en `backend/app/features/productivity/service.py`.
- [ ] T128 [HU08] Implementar endpoints en `backend/app/features/productivity/router.py`.
- [ ] T129 [P] [HU08] Crear datos sintéticos reproducibles en `backend/tests/fixtures/productivity_factory.py`.
- [ ] T130 [HU08] Crear vista de series e indicadores en `frontend/src/features/productivity/ProductivityPanel.jsx`.
- [ ] T131 [HU08] Probar E2E con valores válidos, atípicos e insuficientes.

---

## Fase 11 - HU-09 Panel veterinario y directivo

### Pruebas primero

- [ ] T132 [P] [HU09] Probar agregados contra eventos fuente en `backend/tests/unit/test_sanitary_indicators.py`.
- [ ] T133 [P] [HU09] Probar restricciones por rol/finca/costos en `backend/tests/security/test_indicators_rbac.py`.
- [ ] T134 [P] [HU09] Probar filtros, paginación y exporte en `backend/tests/contract/test_indicators_api.py`.
- [ ] T135 [P] [HU09] Probar respuesta < 3 s con carga piloto en `backend/tests/performance/test_dashboard_queries.py`.

### Implementación

- [ ] T136 [HU09] Implementar proyecciones sanitarias y productivas en `backend/app/features/indicators/service.py`.
- [ ] T137 [HU09] Implementar endpoints filtrados/paginados en `backend/app/features/indicators/router.py`.
- [ ] T138 [HU09] Implementar exporte auditable en `backend/app/features/indicators/export.py`.
- [ ] T139 [HU09] Crear panel por rol en `frontend/src/features/indicators/IndicatorsDashboard.jsx`.
- [ ] T140 [HU09] Crear filtros y paginación en `frontend/src/features/indicators/IndicatorFilters.jsx`.
- [ ] T141 [HU09] Probar E2E operario, veterinario y directivo.

---

## Fase 12 - HU-10 Observabilidad, seguridad y cierre del MVP

### Pruebas y controles

- [ ] T142 [P] [HU10] Probar propagación de correlation ID en `backend/tests/integration/test_correlation_id.py`.
- [ ] T143 [P] [HU10] Probar redacción de secretos y datos sensibles en `backend/tests/security/test_log_redaction.py`.
- [ ] T144 [P] [HU10] Probar que toda escritura auditable tiene autor/fecha/motivo aplicable.
- [ ] T145 [P] [HU10] Ejecutar Bandit, auditoría de dependencias y escaneo de secretos en CI.
- [ ] T146 [HU10] Exponer métricas técnicas protegidas y definir SLI-1 a SLI-4.
- [ ] T147 [HU10] Construir tablero técnico mínimo separado del panel de negocio.
- [ ] T148 [HU10] Ejecutar E2E maestro: login -> offline -> sync -> corrección -> SINIGAN -> reconciliación -> panel.
- [ ] T149 [HU10] Ejecutar prueba de regresión completa con red intermitente y datos sintéticos.
- [ ] T150 [HU10] Verificar Swagger, mensajes de simulación y ausencia de endpoints externos de escritura.
- [ ] T151 [HU10] Realizar revisión funcional humana de las diez HU y registrar resultados.
- [ ] T152 [HU10] Resolver todos los hallazgos críticos y altos antes de liberar.
- [ ] T153 [HU10] Generar reporte final de cobertura, SLI, defectos y tiempo de ciclo.
- [ ] T154 [HU10] Ejecutar demo en entorno limpio siguiendo `README.md` y documentar evidencia.
- [ ] T155 [HU10] Obtener aceptación del Product Owner y marcar el alcance del MVP al 100% funcional.

## Dependencias y Orden de Ejecución

1. Fase 1 bloquea todas las demás.
2. Fase 2 bloquea captura y relaciones externas.
3. HU-02 -> HU-03 -> HU-04 es una secuencia obligatoria.
4. HU-05 requiere HU-01 endurecida y el historial de HU-04.
5. El checkpoint de ~50% se alcanza únicamente después de T085 y con todas las pruebas previas en verde.
6. HU-06 y HU-07 pueden avanzar en paralelo después de HU-03/HU-05 según sus dependencias.
7. HU-08 puede avanzar después de HU-03.
8. HU-09 requiere HU-04 a HU-08.
9. HU-10 inicia en Fase 1 y se consolida al final.

## Definición de avance

- **No iniciada**: tareas sin comenzar.
- **En desarrollo**: pruebas rojas creadas y cambio en rama.
- **Técnicamente completa**: pruebas automáticas y seguridad en verde.
- **Funcionalmente validada**: demostración revisada por responsable de negocio/datos.
- **Aceptada**: Product Owner registra aprobación.

Una tarea marcada no implica que la HU esté terminada; la HU solo cuenta para el porcentaje cuando cumple su checkpoint completo.

## DoD por historia

- Unitarias de reglas y validaciones en verde.
- Contratos HTTP positivos y negativos en verde.
- Integración con persistencia y rollback en verde.
- Flujo E2E crítico en verde.
- Regresión de historias anteriores en verde.
- Sin hallazgos críticos de seguridad.
- Logs/auditoría y SLI aplicables verificados.
- Revisión funcional y aprobación humana registradas.
