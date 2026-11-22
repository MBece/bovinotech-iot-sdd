# Trazabilidad HU-05 `sinigan_sync` — auditoría A7

**Run:** `HU05-SINIGAN-SYNC-20261121`
**Rama:** `feat/hu-05-sinigan-sync`
**Base / HEAD:** `a8138932c875a73a814f51242f011cf6d00a8398` (`main`), sin commit: el cambio vive en el working tree.
**Auditor:** A7 (independiente, modo read-only)
**Fecha de auditoría:** 2026-11-22
**Alcance:** HU literal, plan aprobado, manifiesto, orquestador, informes de agentes, revisiones, gates, E2E, capturas, código y pruebas del working tree.

> Convención de estado: **VERIFICADO** = el auditor leyó la implementación y/o ejecutó la prueba/evidencia. **DECLARADO** = existe la evidencia pero no fue re-ejecutada por A7. No se marca ningún AC como PASS sin prueba y evidencia reales.

---

## 1. Integridad de la HU y del plan

| Archivo congelado | Hash esperado (`plan-approved.sha256`) | Hash calculado por A7 | Estado |
|---|---|---|---|
| `specs/005-sinigan-sync/spec.md` | `636EDF2C80612F40DAE1D189EA9326ACE7431156BA4CB46147E08820780ACFB3` | `636EDF2C80612F40DAE1D189EA9326ACE7431156BA4CB46147E08820780ACFB3` | **VERIFICADO — coincide** |
| `specs/005-sinigan-sync/plan.md` | `343C823F4B645834E473485AD20BF7A7E74B3D17E41C7947B0F97F7C2B250FD9` | `343C823F4B645834E473485AD20BF7A7E74B3D17E41C7947B0F97F7C2B250FD9` | **VERIFICADO — coincide** |
| `specs/005-sinigan-sync/contracts/sinigan-sync-api.md` | `3BC3216D45C658C2D6AA0621BF435E96793836E57786DE68967077701FDA4ED9` | `3BC3216D45C658C2D6AA0621BF435E96793836E57786DE68967077701FDA4ED9` | **VERIFICADO — coincide** |

La HU literal en `spec.md` conserva:

- Historia de usuario (veterinario/administrador consulta la ficha simulada y concilia divergencias).
- Reglas de negocio (SINIGÁN como fuente de verdad legal, etiqueta `MODO SIMULADO (SINIGÁN V6 MOCK)`, prohibición de sobrescritura automática, ticket con motivo obligatorio).
- Los 4 criterios de aceptación AC-01…AC-04 y el fuera de alcance.

**Conclusión:** la HU no fue modificada. El plan y el contrato congelados tampoco.

### 1.1 Nota sobre el hash histórico de A2

`agents/A2-analyst.md` registra para `plan.md` el hash `DA56BA75…`, que **no** coincide con el congelado actual. Esto es consistente con la narrativa documentada en `decisions.md` y `orchestrator-log.md`: A2 detectó inconsistencias (`SIT-001` vs `SIT-DEMO-001`, D8 omitido), A0 corrigió `plan.md` y regeneró `plan-approved.sha256`. El hash actual (`343C823F…`) coincide con el congelado. No es una alteración posterior a la aprobación; es evidencia histórica previa a la corrección documental.

---

## 2. Alcance de los cambios frente al plan / manifiesto

### 2.1 Archivos rastreados modificados (`git diff --stat`)

| Archivo | Cambio observado | ¿Dentro del plan/manifiesto? |
|---|---|---|
| `backend/app/main.py` | Importa modelos de `sinigan_sync`, registra el router bajo `/integrations/sinigan-sync` y ejecuta `seed_field_animals()`. | Sí: `main.py (solo import/registro)` y seed (plan §Módulo; D2). |
| `backend/tests/conftest.py` | Añade seed compartido condicional y fixture `db_session`. | Sí: `backend/tests/` está en `module_scope`; autorizado por `A1-ADR-04`. |
| `frontend/src/App.jsx` | Importa y renderiza `<SiniganReconciliation token={user.token} role={role} />`. | Sí: `App.jsx (solo import/render)`. |

### 2.2 Archivos nuevos (no rastreados)

| Ruta | Contenido | Dentro del plan |
|---|---|---|
| `backend/app/features/sinigan_sync/` | `__init__.py`, `models.py`, `schemas.py`, `comparator.py`, `service.py`, `router.py`, `fixtures/field_animals.json` | Sí |
| `backend/tests/contract/test_sinigan_sync_api.py` | Contrato AC-01…AC-04 | Sí |
| `backend/tests/security/test_sinigan_sync_authorization.py` | RBAC, auth, mass assignment, rutas destructivas | Sí |
| `backend/tests/unit/test_sinigan_sync_comparator.py` | Comparador puro (5 tests) | Sí |
| `backend/tests/unit/test_sinigan_sync_no_overwrite.py` | No sobrescritura (2 tests) | Sí |
| `backend/tests/unit/test_sinigan_sync_datetimes.py` | Serialización UTC (3 tests) | Sí (corrección M-01) |
| `backend/tests/unit/test_sinigan_sync_missing_field_record.py` | 409 sin registro de campo (L-01) | Sí (corrección L-01) |
| `frontend/src/features/sinigan-sync/` | Componentes, servicio, utilidades y 3 archivos de tests Node | Sí |
| `specs/005-sinigan-sync/` | `spec.md`, `plan.md`, `data-model.md`, `quickstart.md`, `tasks.md`, `contracts/sinigan-sync-api.md` | Sí |
| `docs/evidence/hu-05-sinigan-sync/` | Evidencia del run | Sí |
| `.opencode/agents/hu05-*.md` | Definiciones de agentes | Sí |

### 2.3 Archivos prohibidos / fuera de alcance

Comprobado con `git status --short` y `git diff`:

| Ruta | Estado |
|---|---|
| `backend/app/features/sinigan/` | Sin cambios en `git status`. |
| `backend/app/features/sanitary_events/` | Sin cambios. |
| `backend/app/features/auth/` | Sin cambios. |
| `constitution.md` / `.specify/memory/constitution.md` | Sin cambios. |
| `backend/requirements.txt` | Sin cambios. |
| `frontend/package.json` / `package-lock.json` | Sin cambios. |
| `.github/workflows/ci.yml` | Sin cambios. |

**Conclusión:** los cambios corresponden al plan aprobado. No se tocaron módulos ajenos ni configuración.

---

## 3. Matriz de criterios de aceptación

### AC-01 — Ficha oficial simulada con etiqueta explícita

| Elemento | Referencia real |
|---|---|
| Requisito | Dado un `din` existente, al consultarlo se muestran sus datos oficiales simulados indicando explícitamente el entorno de simulación (`spec.md` AC-01). |
| Implementación backend | `backend/app/features/sinigan_sync/service.py:177-224` (`compare` devuelve `meta.sourceMode="SIMULADO"`, `meta.isSimulation=true`, `meta.mockLabel` y snapshots); `schemas.py:10` (`MOCK_LABEL`), `schemas.py:49-54` (`ReconciliationMeta`). |
| Implementación frontend | `frontend/src/features/sinigan-sync/SiniganReconciliation.jsx:175` (badge con `SIMULATION_LABEL`); `siniganSyncUtils.js:1` (constante exacta); `SiniganComparisonCard.jsx` (tarjeta de ficha/registro). |
| Prueba automatizada | `backend/tests/contract/test_sinigan_sync_api.py::test_ac01_consistent_animal_returns_official_sheet_and_simulation_label`; además `::test_comparison_rejects_invalid_din_with_400` y `::test_comparison_rejects_extra_fields_with_422`. |
| Ejecución | Incluida en `gates/G4-acceptance/pytest-a7.txt` (52 passed, EXIT 0, re-ejecutado por A7). |
| Evidencia E2E | `gates/G4-acceptance/e2e-results.json` → `steps.ac01` (label exacta, `Conciliación consistente`, `Luna`, `SIT-DEMO-001`); `e2e-run-final-a0.txt` (`AC-01 OK`). |
| Captura | `screenshots/AC-01.png` — **verificada visualmente por A7**: muestra la etiqueta `MODO SIMULADO (SINIGÁN V6 MOCK)`, ficha `Luna`/`DIN-DEMO-000001`/`BOVINO`/`HEMBRA`/`ADULTO`/`SIT-DEMO-001`, registro de campo y `Conciliación consistente` con `0 tickets`. |
| Estado | **PASS — VERIFICADO** |

### AC-02 — DIN inexistente sin registros automáticos

| Elemento | Referencia real |
|---|---|
| Requisito | Dado un `din` inexistente, el sistema informa que no fue encontrado sin crear registros automáticos en el inventario (`spec.md` AC-02). |
| Implementación backend | `service.py:185-190` lanza `404` al no encontrar la ficha oficial **antes** de cualquier escritura; `service.py:64-115` solo siembra el fixture ficticio, no inventario. |
| Prueba automatizada | `test_sinigan_sync_api.py::test_ac02_unknown_din_returns_404_without_writes` (compara 4 conteos antes/después y exige seed > 0); `test_sinigan_sync_missing_field_record.py::test_official_din_without_field_record_returns_409_without_writes` (409 sin escrituras). |
| Ejecución | `gates/G4-acceptance/pytest-a7.txt` (52 passed, EXIT 0). |
| Evidencia E2E | `e2e-results.json` → `steps.ac02`: mensaje `DIN no encontrado en las referencias disponibles.`, `countsBefore == countsAfter` (`5/0/0/0`) y `ticketsForUnknownDin.items == []`. |
| Captura | `screenshots/AC-02.png` (mensaje de no encontrado y `0 tickets`). |
| Nota de lectura | `steps.ac02.apiStatusForUnknownDin = 200` corresponde al `GET /tickets?din=…` filtrado, no al `POST /comparisons`. El `404` del POST lo cubre Pytest y aparece en `gates/G4-acceptance/e2e-backend-final.log`. |
| Estado | **PASS — VERIFICADO** (limitación de evidencia declarada en AC-02) |

### AC-03 — Ticket de conflicto con ambos valores, fecha y origen

| Elemento | Referencia real |
|---|---|
| Requisito | Dado un animal cuyo sexo o grupo etario de campo difiere de la ficha simulada, la comparación genera un ticket mostrando ambos valores, fecha y origen (`spec.md` AC-03). |
| Implementación backend | `comparator.py:37-56` compara `species`, `sex`, `age_group`, `sit_code` sin mutar entradas; `service.py:226-270` crea `ReconciliationTicket` + `ReconciliationDiscrepancy` con `official_value`, `field_value`, `official_source`, `field_source`, `detected_at`; `models.py:44-83` persiste los snapshots y la discrepancia. |
| Implementación frontend | `SiniganTicketDetail.jsx:145-176` (tabla de discrepancias con campo, ficha oficial, registro de campo y detectada); `SiniganTicketDetail.jsx:127-130` (orígenes). |
| Prueba automatizada | `test_sinigan_sync_api.py::{test_ac03_sex_discrepancy_creates_open_ticket_with_both_values_and_origins, test_ac03_age_group_discrepancy_creates_open_ticket, test_ac03_species_and_establishment_discrepancies_create_open_ticket}`; `test_sinigan_sync_comparator.py` (5 tests). |
| Ejecución | `gates/G4-acceptance/pytest-a7.txt` (52 passed, EXIT 0). |
| Evidencia E2E | `e2e-results.json` → `steps.ac03Sex` (ticket `#1`: `Sexo`, `MACHO` vs `HEMBRA`, `dateColumnVisible`, `originColumnsVisible`) y `steps.ac03Age` (ticket `#2`: `Grupo etario`, `TERNERO` vs `ADULTO`). |
| Capturas | `screenshots/AC-03-sex.png` — **verificada visualmente por A7**: ticket `#1`, tabla `Sexo MACHO / HEMBRA`, orígenes y fecha de detección; `screenshots/AC-03.png` (grupo etario). |
| Estado | **PASS — VERIFICADO** |

### AC-04 — Resolución veterinaria, motivo obligatorio, cierre y trazabilidad

| Elemento | Referencia real |
|---|---|
| Requisito | Dado un ticket abierto, cuando el veterinario registra resolución y motivo, el conflicto queda cerrado conservando la trazabilidad (`spec.md` AC-04). |
| Implementación backend | `schemas.py:34-46` (`ResolutionRequest` con `trim` y 5–500); `router.py:79-97` (`require_veterinario`); `service.py:365-417` (`resolve_ticket`: persiste `ReconciliationResolution`, marca `CLOSED`, `closed_at`, `409` si cerrado, `IntegrityError` → `409`); `models.py:85-99` (resolución y constraint único). |
| Implementación frontend | `SiniganTicketDetail.jsx:178-192` (bloque de resolución con decisión, motivo, autor y fecha); `:197-231` (formulario con `required`, `minLength=5`, `maxLength=500`); `siniganSyncUtils.js:31-33` (solo `VETERINARIO` sobre `OPEN`). |
| Pruebas automatizadas | `test_sinigan_sync_api.py::{test_ac04_veterinarian_resolves_ticket_and_closes_it_with_traceability, test_ac04_second_resolution_attempt_returns_409, test_ac04_operario_cannot_resolve_ticket, test_ac04_reason_is_validated_after_trim, test_ac04_reason_is_trimmed_before_persistence, test_ac04_invalid_decision_and_extra_fields_return_422}`; `test_sinigan_sync_authorization.py::{test_operario_cannot_resolve_ticket, test_resolution_request_cannot_mass_assign_status_author_or_source}`. |
| Ejecución | `gates/G4-acceptance/pytest-a7.txt` (52 passed, EXIT 0). |
| Evidencia E2E | `e2e-results.json` → `steps.ac04EmptyReason` (validación de navegador, ticket sigue abierto), `steps.ac04` (mensaje persistente, estado `Cerrado`, decisión, motivo, autor, fechas) y `steps.ac04Http` (`403` operario, `409` reintento, `closedDetail` completo). |
| Capturas | `screenshots/AC-04-empty-reason.png` (motivo vacío bloqueado); `screenshots/AC-04.png` — **verificada visualmente por A7**: ticket `#1` `Cerrado`, `Prevalece la ficha oficial`, motivo, autor `vet@bovinotech.co`, fechas, snapshots y discrepancia conservada. |
| Estado | **PASS — VERIFICADO** |

---

## 4. Reglas funcionales obligatorias

| ID | Regla (`spec.md`) | Implementación | Prueba / evidencia | Estado |
|---|---|---|---|---|
| R1 | SINIGÁN V6 es fuente de verdad legal para `din`, especie, sexo, grupo etario y predio (`sit`/`rspp`). | `service.py:185` lee del adaptador oficial; el registro de campo es ficticio y read-only (`models.py:3-5`). | `test_sinigan_sync_no_overwrite.py`; `e2e-results.json → noOverwrite`. | **VERIFICADO** |
| R2 | Toda información del adaptador se etiqueta visiblemente `MODO SIMULADO (SINIGÁN V6 MOCK)`. | `schemas.py:10`; `siniganSyncUtils.js:1`; panel en `SiniganReconciliation.jsx:175`. | `test_ac01…`; `siniganSyncUtils.test.js`; captura AC-01. | **VERIFICADO** |
| R3 | Un `din` inexistente no crea registros automáticos en el inventario. | `service.py:185-190` retorna antes de escribir. | `test_ac02_unknown_din_returns_404_without_writes`; `steps.ac02`. | **VERIFICADO** |
| R4 | Las discrepancias nunca provocan sobrescritura automática. | `comparator.py` puro; `service.py` solo crea artefactos de conciliación. | `test_sinigan_sync_no_overwrite.py`; `noOverwrite`. | **VERIFICADO** |
| R5 | Toda discrepancia genera ticket con valores comparados, fecha y origen. | `service.py:226-270`; `models.py:60-83`. | 3 tests AC-03; `steps.ac03Sex/ac03Age`. | **VERIFICADO** |
| R6 | La resolución humana exige motivo obligatorio. | `schemas.py:38-46`; formulario `required`. | `test_ac04_reason_is_validated_after_trim`; `steps.ac04EmptyReason`. | **VERIFICADO** |
| R7 | El cierre conserva la trazabilidad de la decisión. | `models.py:85-99`; `service.py:389-417`; `get_ticket` devuelve snapshots, discrepancias y resolución. | `test_ac04_veterinarian_resolves…`; `steps.ac04Http.closedDetail`. | **VERIFICADO** |

---

## 5. No sobrescritura de datos oficiales ni de campo

### 5.1 Evidencia E2E (`e2e-results.json → steps.noOverwrite`)

| Verificación | Antes | Después | Resultado |
|---|---|---|---|
| SHA-256 del fixture oficial (`backend/app/features/sinigan/fixtures/animals.json`) | `7db8f53b55c071278868b85bf071ef859a30d84e56c120ad436dfe376100011c` | `7db8f53b55c071278868b85bf071ef859a30d84e56c120ad436dfe376100011c` | **Sin cambios**; además A7 recalculó el hash actual y coincide. |
| `fieldRecordsBefore` vs `fieldRecordsAfter` | 5 filas (DIN-DEMO-000001…000005) | Idénticas campo por campo | `fieldRecordsUnchanged: true` |
| `field_animal_records` | 5 | 5 | Sin cambios |
| `reconciliation_tickets` | 0 | 2 | Creados por las 2 comparaciones con discrepancia (esperado) |
| `reconciliation_discrepancies` | 0 | 2 | Creadas por las discrepancias (esperado) |
| `reconciliation_resolutions` | 0 | 1 | Creada por la resolución veterinaria (esperado) |

### 5.2 Pruebas automatizadas

- `backend/tests/unit/test_sinigan_sync_no_overwrite.py::test_comparison_does_not_overwrite_official_sheet_or_field_record`: tras comparar, la ficha oficial, el fixture y el `FieldAnimalRecord` no cambian; el ticket conserva snapshots con los valores originales.
- `backend/tests/unit/test_sinigan_sync_no_overwrite.py::test_resolution_does_not_overwrite_sources_or_ticket_snapshots`: tras resolver, ficha, fixture, registro de campo, snapshots y discrepancias permanecen idénticos.
- Ambas incluidas en `pytest-a7.txt` (52 passed, EXIT 0).

**Conclusión:** no hay sobrescritura automática de datos oficiales ni de campo. Los únicos cambios en la base son artefactos de conciliación (tickets, discrepancias y resolución).

---

## 6. Trazabilidad de tickets

Fuente: `e2e-results.json → steps.ac04Http.closedDetail` y modelo `models.py`.

| Atributo exigido | Campo en la evidencia | Valor observado | Estado |
|---|---|---|---|
| Valores oficiales | `officialSnapshot` | `din`, `animalName=Sol`, `species=BOVINO`, `sex=MACHO`, `ageGroup=JOVEN`, `establishment.sitCode=SIT-DEMO-001` | **Conservado** |
| Valores de campo | `fieldSnapshot` | `din`, `species=BOVINO`, `sex=HEMBRA`, `ageGroup=JOVEN`, `sitCode=SIT-DEMO-001`, `source=REGISTRO_DE_CAMPO`, `updatedAt=2026-11-20T12:05:00Z` | **Conservado** |
| Fecha de comparación/detección | `comparedAt`, `discrepancies[0].detectedAt` | `2026-11-22T03:58:30.710371Z` | **Conservada (UTC `Z`)** |
| Origen oficial | `officialSource` | `MODO SIMULADO (SINIGÁN V6 MOCK)` | **Conservado** |
| Origen de campo | `fieldSource` | `REGISTRO DE CAMPO` | **Conservado** |
| Decisión | `resolution.decision` | `OFICIAL_PREVALECE` | **Conservada** |
| Motivo | `resolution.reason` | `Se valida la ficha oficial y se solicita corrección del registro de campo.` | **Conservado** |
| Autor | `resolution.resolvedByEmail` | `vet@bovinotech.co` | **Conservado** |
| Fechas de cierre | `closedAt`, `resolution.resolvedAt` | `2026-11-22T03:58:32.673760Z` | **Conservadas (UTC `Z`)** |
| Creador | `createdByEmail` | `operario@bovinotech.co` | **Conservado** |
| Estado | `status` | `CLOSED` | **Conservado** |

La UI plasma los mismos datos en el bloque `Resolución registrada` y en la tabla de discrepancias (captura `screenshots/AC-04.png`, verificada visualmente).

---

## 7. Evidencia de ejecución multiagente

### 7.1 Sesiones declaradas en `manifest.json` y verificadas en logs

| Agente | Sesión declarada | Log con la misma sesión | Entregable | Exit |
|---|---|---|---|---|
| A1 | `ses_dfed67f64ffebN979DGWkCumMs` | `agents/A1-architect.log.json` | `agents/A1-architect.md` | 0 |
| A2 | `ses_dfed67f57ffeINo5NLjNwRAE0J` | `agents/A2-analyst.log.json` | `agents/A2-analyst.md` | 0 |
| A5-red | `ses_dfed31597ffeZyo08n4Uk1kdzc` | `agents/A5-qa-red.log.json` | `agents/A5-qa-red.md` + `gates/G1-red/` | 0 |
| A3 | `ses_dfecadf94ffeSklBg1nNX3FV0t` | `agents/A3-backend.log.json` | `agents/A3-backend.md` + `gates/G2-backend-green/` | 0 |
| A4 | `ses_dfec242b7ffenRjBQM1edz6tuu` | `agents/A4-frontend.log.json` | `agents/A4-frontend.md` + `gates/G3-frontend-green/` | 0 |
| A5-full | `ses_dfebd9dc0ffeT8nNsdvtUzApVc` | `agents/A5-qa-full.log.json` | `agents/A5-qa.md` + `gates/G4-acceptance/` | 0 |
| A5-final-docs | `ses_dfeac8695ffed019bYZBTVQbY8` | `agents/A5-qa-final-docs.log.json` | `agents/A5-qa.md` | 0 |
| A6A | `ses_dfea506a1ffeUYK2UhWLjKXXat` | `agents/A6A-architecture-review.log.json` | `reviews/A6A-architecture.md` | 0 |
| A6B | `ses_dfea506aaffeIV5y9MOs2c4Swg` | `agents/A6B-code-review.log.json` | `reviews/A6B-code.md` | 0 |
| A3-fixes | `ses_dfe9cc620ffe0VMOkGVJip6KcL` | `agents/A3-backend-fixes.log.json` | `agents/A3-backend-fixes.md` | 0 |
| A4-fixes | `ses_dfe9cc609ffe1TnTRZ7s0CGW5s` | `agents/A4-frontend-fixes.log.json` | `agents/A4-frontend-fixes.md` | 0 |
| A6B-rereview | `ses_dfe97a902ffeid9H3WWBQS2w0D` | `agents/A6B-rereview.log.json` | `reviews/A6B-code-rereview.md` | 0 |
| A5-final-update | `ses_dfe97a904ffexj08f64mFmeHHG` | `agents/A5-final-evidence-update.log.json` | `agents/A5-qa.md` + actas AC-01…AC-04 | 0 |

Todas las sesiones reclamadas por el manifiesto tienen log con el mismo `session_id` y terminan en `EXIT_CODE=0`.

### 7.2 Prompts, revisiones y triage

- Prompts independientes: `prompts/A1-architect.md`, `A2-analyst.md`, `A3-backend.md`, `A4-frontend.md`, `A5-qa-red.md`, `A5-qa-full.md`, `A5-final-evidence-update.md`, `A5-qa-final-docs.md`, `A6A-architecture-review.md`, `A6B-code-review.md`, `A6B-rereview.md`, `A7-audit-final.md`.
- Revisiones: `reviews/A6A-architecture.md` (aprobar), `reviews/A6B-code.md` (aprobado con observaciones, M-01/M-02/M-03), `reviews/A6B-code-rereview.md` (aprobar, 0 Medium abiertos).
- Triage: `findings/design-triage.md` (F-D01…F-D12) y `findings/review-triage.md` (correcciones M/L y diferidos).
- Gates: `gates/G0-baseline/`, `G1-red/`, `G2-backend-green/`, `G3-frontend-green/`, `G4-acceptance/`.
- Capturas finales: `screenshots/AC-01.png`, `AC-02.png`, `AC-03-sex.png`, `AC-03.png`, `AC-04-empty-reason.png`, `AC-04.png` (existen; A7 verificó visualmente AC-01, AC-03-sex y AC-04).

### 7.3 Observación de transparencia

Existen cuatro logs intermedios `agents/A5-qa-full-followup{,2,3,4}.log.json` con `EXIT_CODE=1` y sin `session_id` capturado, y un `A5-qa-full-followup5.log.json` con `EXIT_CODE=0` y sesión `ses_dfeb0e93effekH02T5y4j9qDXD`; ninguno está referenciado en `manifest.json` ni en `orchestrator-log.md`. Son ejecuciones intermedias de A5; los entregables finales provienen de sesiones posteriores con exit 0. Se declara como limitación de trazabilidad (A7-EV-01), no como resultado inventado.

---

## 8. Re-ejecución del auditor A7 (estado final)

| Comando | Workdir | Resultado | Evidencia |
|---|---|---|---|
| `python -m pytest -q` (venv `hu05-venv`) | `backend/` | **52 passed, 1 warning, EXIT 0** (31.22 s) | `gates/G4-acceptance/pytest-a7.txt`, `pytest-exit-code-a7.txt` |
| `npm run lint` | `frontend/` | **EXIT 0** | `gates/G4-acceptance/lint-a7.txt`, `lint-exit-code-a7.txt` |
| `npm run build` | `frontend/` | **EXIT 0**, Vite 8.3.8, 32 módulos | `gates/G4-acceptance/build-a7.txt`, `build-exit-code-a7.txt` |
| `node --test` | `frontend/` | **16 tests / 16 pass**, 3 suites, EXIT 0 | `gates/G4-acceptance/node-test-a7.txt`, `node-test-exit-code-a7.txt` |

La única advertencia de Pytest es el `DeprecationWarning` preexistente de `starlette/testclient.py` (`anyio.abc.BlockingPortal`).

No se re-ejecutó el E2E fullstack (requiere backend + Vite + Chromium/CDP y detener procesos). Se auditó la evidencia cruda existente y las capturas; no se acredita el E2E como ejecutado por A7.

---

## 9. Hallazgos residuales

| ID | Severidad | Hallazgo | Estado | ¿Bloquea? |
|---|---|---|---|---|
| R-01 | Low | M-02, M-03 y L-04 no tienen prueba automatizada de componente/estado; `node --test` cubre servicio, utilidades y etiquetas de origen. | Abierto / diferido | No |
| R-02 | Low | `loadTickets` no usa request id/`AbortController`; cambios rápidos de filtro podrían mostrar una respuesta obsoleta. | Abierto / diferido | No |
| R-03 | Informativo | El seed de campo se ejecuta en import time en `backend/app/main.py` (patrón preexistente). | Abierto / diferido | No |
| R-04 | Informativo | La rama `IntegrityError` de doble resolución concurrente no tiene prueba dedicada. | Abierto / diferido | No |
| A7-EV-01 | Informativo | Logs intermedios de A5 con `EXIT_CODE=1`/sin sesión, no narrados en manifiesto ni orquestador. | Declarado | No |
| A7-EV-02 | Informativo | El hash de `plan.md` registrado en A2 es el previo a la corrección documental; el actual coincide con el congelado. | Declarado | No |
| A7-EV-03 | Informativo | E2E final ejecutado por A0 (driver de A5); declarado en actas y QA. | Declarado | No |
| A7-EV-04 | Informativo | AC-02 E2E guarda `apiStatusForUnknownDin=200` (GET tickets); el 404 del POST está en Pytest y en el log backend. | Declarado | No |
| A7-EV-05 | Informativo | En el E2E, `403` se ejercita sobre ticket `#2` y `409` sobre ticket `#1`; Pytest cubre ambos sobre el mismo ticket. | Declarado | No |

Los Low diferidos del informe A6B original (L-06, L-08, L-10, L-11) siguen documentados y no bloquean: L-06 = R-03, L-08 = rama roja/documentación G2, L-10 = comando del quickstart, L-11 = R-01. L-01 quedó cubierto; L-02 = R-04; L-03, L-04, L-05, L-07 y L-09 fueron corregidos y re-verificados por A6B.

Los hallazgos de A6A F-01…F-06 son Low/informativos: F-01 (redacción del plan sobre `conftest.py`), F-02 (etiquetas duplicadas por capa), F-03 (=L-05 corregido), F-04 (=L-08), F-05 (=R-03), F-06 (=L-07 corregido). Ninguno bloquea.

---

## 10. Limitaciones de la auditoría

1. No hay commit: la auditoría se hizo sobre el working tree; `HEAD == main == a813893`.
2. El E2E fullstack no fue re-ejecutado por A7; se auditó la evidencia cruda (`e2e-results.json`, `e2e-run-final-a0.txt`, logs y capturas). El E2E final lo ejecutó A0 con el driver de A5.
3. Entorno local sin Docker (D9); backend con Python 3.11.9 del venv temporal y Node v22.19.0.
4. `rspp` no existe en el mock; se compara `sitCode` y la brecha está documentada (`decisions.md`).
5. No existe rol `ADMIN`; consulta autenticada y resolución solo `VETERINARIO` (D5).
6. La verificación visual de capturas se limitó a AC-01, AC-03-sex y AC-04; AC-02 y AC-03 (grupo etario) se sustentan en `e2e-results.json` y en la ejecución de pruebas.
7. Esta auditoría escribió únicamente `traceability.md`, `REPORT.md` y los gates `*-a7`; no modificó código, tests, specs ni configuración.

---

## 11. Estado final de trazabilidad

- HU y plan congelados: **intactos** (SHA-256 coincidentes).
- Cambios: **alineados** con el plan aprobado; sin tocar módulos prohibidos.
- AC-01…AC-04: **PASS con prueba ejecutada y evidencia real**.
- No sobrescritura: **verificada** por Pytest y por E2E.
- Trazabilidad de tickets: **completa** (valores, fechas, orígenes, decisión, motivo y autor).
- Ejecución multiagente: **verificable** para todas las sesiones reclamadas; logs intermedios fallidos declarados.
- Gates re-ejecutados por A7: **todos en verde (EXIT 0)**.
- Residuales: **solo Low/informativos, no bloqueantes**.


---

## 12. Delta D10 - aislamiento por finca activa (agregado 2026-11-22)

> Contexto: el run original audito HU-05 sin dimension de finca. HU-01 (origin/develop = 38096fe) introdujo multi-finca y RBAC; D10 agrega el aislamiento de HU-05 por finca activa. El HEAD observado en esta actualizacion es 38096fe (incluye HU-01); HU-05 sigue **sin commit**.

### 12.1 Hashes reales de los artefactos de especificacion

Calculados por A7 con Get-FileHash -Algorithm SHA256 sobre el working tree. **No se copian del briefing**: se verifican contra disco.

| Archivo | Hash SHA-256 calculado por A7 | Estado |
|---|---|---|
| specs/005-sinigan-sync/spec.md | 636EDF2C80612F40DAE1D189EA9326ACE7431156BA4CB46147E08820780ACFB3 | **Sin cambios** - coincide con plan-approved.sha256 |
| specs/005-sinigan-sync/plan.md | 343C823F4B645834E473485AD20BF7A7E74B3D17E41C7947B0F97F7C2B250FD9 | **Sin cambios** - coincide con plan-approved.sha256 |
| specs/005-sinigan-sync/contracts/sinigan-sync-api.md | 3BE12803FB8812068996158469151F345CF713158B0BDC01A00A631827490ED6 | **Cambio por D10** (antes 3BC3216D...) |
| specs/005-sinigan-sync/data-model.md | 6CDED92F1F24C5A8116CDB79BF131AD7B4781B520F563FFFB886126315324EFA | **Actualizado por D10**; no estaba en plan-approved.sha256 |
| specs/005-sinigan-sync/decisions/D10-farm-isolation.md | 59CB1EF4679B37D977EF75CDAA3C78196757F2D9EC5EFE103BB88D4C19E9574F | **Nuevo** - ADR de D10 |

**Hallazgo A7-D10-01:** el briefing de esta actualizacion afirmaba que data-model.md tenia hash 3BE12803.... Ese valor es el hash del **contrato**, no del data-model. El hash real del data-model es 6CDED92F.... Se registra el valor verificado; no se propaga el dato erroneo.

**Hallazgo A7-D10-05 (trazabilidad de congelamiento):** plan-approved.sha256 sigue listando el hash previo del contrato (3BC3216D...). El cambio del contrato es legitimo y esta aprobado por D10, pero el archivo de congelamiento quedo obsoleto y **debe regenerarse antes del merge**. spec.md y plan.md permanecen intactos.

### 12.2 Archivos nuevos o tocados por D10

| Capa | Archivo | Cambio D10 |
|---|---|---|
| Backend modelo | backend/app/features/sinigan_sync/models.py | farm_id INTEGER NOT NULL indexado en field_animal_records y reconciliation_tickets; din conserva unique=True global. |
| Backend migracion | backend/app/features/sinigan_sync/schema_migration.py | Nuevo: ensure_sinigan_sync_schema idempotente, ALTER TABLE ... ADD COLUMN farm_id INTEGER NOT NULL DEFAULT 1 + indices; no-op si las tablas no existen. |
| Backend servicio | backend/app/features/sinigan_sync/service.py | _active_farm_id (403 sin finca); comparacion por (din, farm_id); listado/detalle/resolucion filtran por farm_id; 404/409 indistinguibles; seed en finca 1. |
| Backend router | backend/app/features/sinigan_sync/router.py | Las 4 rutas delegan en el servicio; resolucion sigue con require_veterinario. |
| Backend schemas | backend/app/features/sinigan_sync/schemas.py | farm_id aditivo en resumen, detalle y resultado de resolucion (serializado farmId). |
| Backend bootstrap | backend/app/main.py | ensure_sinigan_sync_schema(engine) antes de los seeds; seed_field_animals() en finca 1. |
| Backend tests | backend/tests/contract/test_sinigan_sync_farm_api.py | **Nuevo** - 2 tests de contrato farmId (resumen/detalle/resolucion y token multifinca). |
| Backend tests | backend/tests/unit/test_sinigan_sync_farm_scope.py | **Nuevo** - 5 tests de alcance por finca (listado, 404, 409, 403). |
| Backend tests | backend/tests/unit/test_sinigan_sync_schema_migration.py | **Nuevo** - 3 tests de migracion SQLite. |
| Backend tests | backend/tests/security/test_sinigan_sync_farm_isolation.py | **Nuevo** - 3 tests de aislamiento real con login (cero escrituras cruzadas). |
| Frontend | frontend/src/App.jsx | Remonta el panel con key={user.farmId ?? 'sin-finca'} y pasa farmId. |
| Frontend | frontend/src/features/sinigan-sync/SiniganReconciliation.jsx | Recarga por token + finca (buildTicketsLoadKey); muestra finca activa. |
| Frontend | frontend/src/features/sinigan-sync/siniganSyncUtils.js | formatActiveFarm, buildTicketsLoadKey con token + finca. |
| Frontend tests | frontend/src/features/sinigan-sync/__tests__/*.test.js | Casos D10 de 403/404 y recarga por finca (20 tests Node en total). |
| Specs | specs/005-sinigan-sync/data-model.md, contracts/sinigan-sync-api.md, decisions/D10-farm-isolation.md | Dimension de finca, farmId aditivo y ADR D10. |

No se modificaron sinigan, sanitary_events, auth, la constitucion, dependencias ni CI. El unico uso de auth es de lectura (current_user.active_farm_id, ya provisto por HU-01).
### 12.3 Invariantes 7-8 del data-model.md (checklist D10)

| Invariante | Verificacion de A7 | Estado |
|---|---|---|
| **7.** Toda lectura o escritura de HU-05 exige finca activa; sin ella 403 y no toca datos. | _active_farm_id en compare (service.py:207), list_tickets (:311), get_ticket (:356) y resolve_ticket (:415). test_farm_scope::test_token_without_farm_claim_gets_403_on_all_endpoints y test_farm_isolation::test_legacy_token_without_farm_claim_gets_403_and_writes_nothing (snapshot sin escrituras). | **VERIFICADO** (con M-03: validacion 400/422 precede al 403 en POST/query) |
| **8.** Ticket o registro de campo de otra finca es indistinguible de inexistente (404/409), sin filtrar existencia. | Comparacion por (din, farm_id) -> mismo 409 que registro ausente; detalle/resolucion por id + farm_id -> mismo 404 que ticket inexistente. E2E: farm2.detailBody == resolutionBody con el mismo mensaje; test_farm_scope y test_farm_isolation. | **VERIFICADO** |

Ademas: farm_id es NOT NULL e indexado en ambas tablas; din sigue unique=True global; las tablas hijas no duplican la columna (heredan por ticket); el seed es idempotente por DIN y asigna finca 1.

### 12.4 E2E D10 real (ejecutado por A0, auditado por A7)

node docs/evidence/hu-05-sinigan-sync/gates/G4-acceptance/e2e-cdp.mjs -> **EXIT_CODE=0**, E2E PASS (gates/G5-farm-isolation/e2e-run-a0.txt y e2e-run-a0-exit-code.txt). Bloque steps.d10FarmIsolation verificado en gates/G5-farm-isolation/e2e-results.json:

| Verificacion | Resultado crudo |
|---|---|
| vet2 finca 2 -> listado | 200, listedTicketIds=[], ticketVisible=false |
| vet2 finca 2 -> detalle | 404 "Ticket de conciliacion no encontrado." |
| vet2 finca 2 -> resolucion | 404, mismo cuerpo (indistinguible) |
| vet2 finca 1 -> listado | 200, ticketVisible=true, summaryFarmId=1 |
| vet2 finca 1 -> detalle | 200, detailFarmId=1, detailTicketStatus=OPEN |
| Material de token en JSON | tokenMaterialStored=false |

El E2E conserva ademas steps.noOverwrite: fixture oficial 7db8f53b... identico antes/despues, 5 registros de campo identicos, field_animal_records=5 antes y despues. La causa raiz de un fallo previo de Vite (ruta corta 8.3 vs VITE_PACKAGE_DIR) esta documentada en gates/G5-farm-isolation/a0-e2e-report.md y no era un defecto de D10.

**Hallazgo A7-D10-02:** gates/G5-farm-isolation/a0-node-test.txt contiene una corrida **fallida** (MODULE_NOT_FOUND, a0-node-test-exit-code.txt = EXIT_CODE=1), pero a0-e2e-report.md la describe como "20 pass / 0 fail". El artefacto canonico node-test.txt si es 20/20 EXIT 0, y la re-ejecucion independiente de A7 tambien. Se declara la inconsistencia documental; no invalida los tests Node.

### 12.5 Revisiones D10 (A6A y A6B)

| Revisor | Archivo | Veredicto | Bloqueantes | Mayores | Observaciones |
|---|---|---|---|---|---|
| A6A | reviews/A6A-architecture-d10.md | **APROBADO CON OBSERVACIONES** | 0 | 0 | Precedencia 400/403; DEFAULT 1 permanente; sin FK a farms.id; claim no revalidado; cobertura UI indirecta; fallback 403. |
| A6B | reviews/A6B-code-d10.md | **APROBADO CON OBSERVACIONES** | 0 | 0 | M-01...M-08 y Obs-1/Obs-2; confirma que ninguna de las 4 rutas evade el filtro y que 404/409 no filtran existencia. |

Ambos informes declaran haber sido **transcritos por A0** tras agotar el limite de pasos del revisor. A7 verifico el contenido tecnico contra el codigo y las ejecuciones; la autoria de sesion no es verificable (ver seccion 12.7).
### 12.6 Hallazgos D10 (todos Menor, no bloqueantes)

| ID | Severidad | Hallazgo | Bloquea? |
|---|---|---|---|
| M-01 | Menor | DEFAULT 1 asimetrico: permanece en bases migradas, mientras el esquema fresco no lo declara. Un INSERT SQL que omita farm_id cae en finca 1 solo en bases migradas. | No (el codigo siempre setea farm_id) |
| M-02 | Menor | El claim farm_id no se revalida contra la membresia (farm_id in user.farm_ids); una asignacion revocada opera hasta el vencimiento del token (hasta 7 dias). | No (diseno claim-based de HU-01) |
| M-03 | Menor | En POST /comparisons con DIN invalido (y en query limit=0) la validacion 400/422 ocurre antes del 403; el "403 en las 4 rutas" no es universal. No hay fuga ni bypass. | No |
| M-04 | Menor | En error de listado/detalle el frontend no limpia tickets/detail; puede mostrarse data previa junto al error. El remonte por finca evita fuga cruzada. | No |
| M-05 | Menor | handleResolved recarga result.id en vez del selectedTicketId capturado; el encabezado y el detalle pueden divergir si el usuario cambia de ticket durante la operacion. | No |
| M-06 | Menor | Tests 403 duplicados entre test_farm_scope.py y test_farm_isolation.py; falta test explicito de **ADMINISTRADOR no resuelve** (solo sonda). | No |
| M-07 | Menor | El test "reloads tickets when the active farm or token changes" solo prueba buildTicketsLoadKey; no verifica el componente ni el descarte de respuestas viejas. | No |
| M-08 | Menor | La migracion no cubre orden con create_all/seeds, tablas parcialmente migradas ni concurrencia de ALTER. | No |
| Obs-1 | Observacion | La UI muestra "Finca activa" desde user.farmId (localStorage), no de una fuente verificada; solo presentacion, el backend manda. | No |
| Obs-2 | Observacion | Fallback 403 de siniganSyncService.js dice "Solo un veterinario...", enganoso para 403 sin finca; el detail del backend prevalece. | No |

Los residuales previos **R-01...R-04** siguen abiertos y sin cambios (tests de componente, AbortController en listado, seed en import time, doble resolucion concurrente sin test dedicado).

### 12.7 Evidencia multiagente D10 (declarada vs verificable)

| Agente | session_id declarado | Entregable | Log en agents/ | Prompt en prompts/ | Verificable por A7 |
|---|---|---|---|---|---|
| A5-d10 | ses_dfb66ec65ffeRX2JQ9rEKuaB32 | gates/G5-farm-isolation/qa-report.md | **No existe** | **No existe** | **No** - solo el reporte |
| A6A-d10 | ses_dfb5901dbffe80ZopwmbfbehIs | reviews/A6A-architecture-d10.md | **No existe** | **No existe** | **No** - transcripcion de A0 |
| A6B-d10 | ses_dfb5901dbffdt3NXZgPHZENHly | reviews/A6B-code-d10.md | **No existe** | **No existe** | **No** - transcripcion de A0 |

**Hallazgo A7-D10-06 (evidencia multiagente incompleta):** los tres session_id de D10 no aparecen en ningun log del worktree; agents/ no contiene archivos *-d10* y prompts/ no contiene prompts D10; orchestrator-log.md tampoco narra D10. A7 **no puede certificar** que esas sesiones ocurrieron. Los entregables tecnicos existen y su contenido es coherente con el codigo y las ejecuciones, pero la cadena sesion-log-entregable esta rota para D10. **Condicion de cierre:** A0 debe exportar los logs/prompts D10 antes del merge. Esta condicion no invalida la verificacion independiente de AC y de la implementacion, pero si impide sellar la evidencia multiagente D10 como completa.

**Hallazgo A7-D10-04:** no existe un ADR D11 separado. D11 ("ADMINISTRADOR no resuelve") se deriva de D4/D5 y de require_veterinario; A6A/A6B la verificaron por sonda (403), pero no hay test dedicado (M-06). Se registra en el manifiesto como decision derivada, no como ADR autonomo.

### 12.8 Re-ejecucion independiente de A7 (2026-11-22)

| Comando | Workdir | Resultado crudo de A7 | Estado |
|---|---|---|---|
| python -m pytest -q (venv hu05-venv) | backend/ | **122 passed, 1 warning in 34.52s**, EXIT=0 | **VERIFICADO** |
| node --test | frontend/ | **20 tests / 20 pass / 0 fail**, 3 suites, EXIT=0 | **VERIFICADO** |
| npm run build | frontend/ | Vite 8.3.8, **38 modulos**, index-C2PcMXLf.js, EXIT=0 | **VERIFICADO** |
| npm run lint | frontend/ | eslint ., EXIT=0 | **VERIFICADO** |

Recoleccion especifica D10 (A7): **13 tests** - 2 contrato farm API, 5 unit farm scope, 3 migracion de esquema, 3 seguridad farm isolation. **Hallazgo A7-D10-03:** el resumen del run reportaba 10 tests D10 (3+3+1+3); la recoleccion real es 13 (2+5+3+3). Los totales (122 backend / 20 Node) coinciden con la evidencia de gates.

La unica advertencia de Pytest es el DeprecationWarning preexistente de starlette/testclient.py, ajena a HU-05.

### 12.9 No regresion sobre AC-01...AC-04

| AC | Cobertura previa | Verificacion D10 |
|---|---|---|
| AC-01 (ficha simulada etiquetada) | Pytest + E2E + captura | E2E steps.ac01 sigue en verde dentro de la corrida D10 (EXIT_CODE=0). |
| AC-02 (DIN inexistente sin escrituras) | Pytest + E2E conteos | steps.ac02 y steps.noOverwrite conservan field_animal_records=5; sin escrituras por DIN inexistente. |
| AC-03 (ticket con valores, fecha y origen) | Pytest + E2E + capturas | steps.ac03Sex/ac03Age siguen generando tickets #1/#2; farmId es aditivo y no altera el contrato de discrepancias. |
| AC-04 (resolucion veterinaria con motivo y trazabilidad) | Pytest + E2E + captura | steps.ac04* sigue en verde; el ticket #1 se resuelve en finca 1; el ticket #2 se usa para el aislamiento D10. El 403 operario y el 409 reintento se mantienen. |

**Conclusion:** D10 no rompe AC-01...AC-04; agrega una frontera de tenant y el campo aditivo farmId.

### 12.10 Veredicto del delta D10

**APROBADO CON OBSERVACIONES.**

- Implementacion e invariantes 7-8: verificadas por lectura y por 13 tests D10.
- Aislamiento real: verificado por E2E fullstack (farm2 invisible / 404; farm1 visible con farmId=1) y por tests de seguridad con snapshot de cero escrituras.
- Sin sobrescritura: se mantiene (steps.noOverwrite y tests unitarios).
- Trazabilidad de tickets: se mantiene; farmId es aditivo.
- AC-01...AC-04: sin regresion.
- Residuales: M-01...M-08, Obs-1/Obs-2 y R-01...R-04, todos no bloqueantes.
- **Condiciones de cierre de evidencia:** (a) anexar logs/prompts D10 de A5/A6A/A6B; (b) regenerar plan-approved.sha256 con el nuevo hash del contrato; (c) corregir la descripcion de a0-node-test.txt en a0-e2e-report.md.