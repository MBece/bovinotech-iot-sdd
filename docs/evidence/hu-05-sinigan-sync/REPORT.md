# Informe de auditoría independiente A7 — HU-05 `sinigan_sync`

**Run:** `HU05-SINIGAN-SYNC-20261121`
**Rama:** `feat/hu-05-sinigan-sync`
**Base / HEAD:** `a8138932c875a73a814f51242f011cf6d00a8398` (`main`), sin commit: el cambio está en el working tree.
**Auditor:** A7 (independiente, read-only)
**Fecha:** 2026-11-22
**Carácter:** verificación de evidencias, código, pruebas y gates. A7 no editó código de producción, tests, specs ni configuración; solo escribió `traceability.md`, este `REPORT.md` y los gates `docs/evidence/hu-05-sinigan-sync/gates/G4-acceptance/*-a7.*`.

---

## 1. Resumen ejecutivo

La implementación de HU-05 cumple los cuatro criterios de aceptación con pruebas automatizadas ejecutadas y evidencia E2E/capturas reales. El auditor re-ejecutó la suite completa y las verificaciones de frontend en el estado final del working tree:

- **Backend:** `52 passed`, 1 warning, `EXIT 0` (`gates/G4-acceptance/pytest-a7.txt`).
- **Frontend:** `node --test` **16/16 pass**, `EXIT 0`.
- **`npm run lint`:** `EXIT 0`.
- **`npm run build`:** `EXIT 0`, Vite 8.3.8, 32 módulos.

La HU literal y el plan/contrato congelados no fueron modificados: los tres SHA-256 coinciden con `plan-approved.sha256`. Los cambios se limitan al módulo `sinigan_sync`, sus pruebas, `backend/app/main.py` (import/registro/seed), `frontend/src/App.jsx` (import/render) y `backend/tests/conftest.py` (seed compartido y fixture), este último autorizado por `A1-ADR-04` y dentro de `module_scope` del manifiesto. No se tocaron `sinigan`, `sanitary_events`, `auth`, la constitución, dependencias ni CI.

La no sobrescritura está demostrada por dos vías independientes: el E2E conserva el SHA-256 del fixture oficial y los 5 registros de campo idénticos antes/después, y dos pruebas unitarias verifican que comparar y resolver no mutan fuentes ni snapshots. La trazabilidad del ticket conserva valores oficiales y de campo, fechas UTC, orígenes, decisión, motivo y autor.

Los tres hallazgos Medium de A6B (M-01 timestamps, M-02 estado obsoleto, M-03 carrera de detalle) están corregidos y la re-revisión A6B los aprueba con 0 Medium abiertos. Quedan residuales **Low/informativos**, ninguno bloqueante.

**Veredicto final: APROBADO CON OBSERVACIONES.**

---

## 2. Checklist de verificación

| # | Verificación | Resultado | Evidencia |
|---|---|---|---|
| 1 | HU intacta (SHA-256 de `spec.md` contra `plan-approved.sha256`) | **PASA** | Coincidencia exacta `636EDF2C…`; ver §3. |
| 2 | Plan y contrato congelados intactos | **PASA** | `343C823F…` y `3BC3216D…` coinciden. |
| 3 | Cambios alineados con el plan/manifiesto | **PASA** | `git status`/`git diff`; solo 3 archivos rastreados modificados; módulo nuevo en la ruta prevista. |
| 4 | Sin modificar `sinigan`, `sanitary_events`, `auth`, constitución, `package.json`, `requirements.txt`, CI | **PASA** | `git status --short` y `git diff` no los incluyen. |
| 5 | AC-01 con implementación, prueba y evidencia | **PASA** | §4; Pytest + `steps.ac01` + captura verificada. |
| 6 | AC-02 con implementación, prueba y evidencia | **PASA** | §4; Pytest 404 sin escrituras + `steps.ac02` (conteos). |
| 7 | AC-03 con implementación, prueba y evidencia | **PASA** | §4; 3 tests de contrato + `steps.ac03Sex/ac03Age` + captura verificada. |
| 8 | AC-04 con implementación, prueba y evidencia | **PASA** | §4; 6 tests de contrato + 2 de seguridad + `steps.ac04*` + captura verificada. |
| 9 | Sin sobrescritura automática de datos oficiales/campo | **PASA** | §5; `noOverwrite` y `test_sinigan_sync_no_overwrite.py`. |
| 10 | Ticket conserva valores, fecha, origen, decisión, motivo y autor | **PASA** | §6; `closedDetail` y modelo. |
| 11 | Evidencia multiagente verificable (sesiones, prompts, logs, entregables, revisiones) | **PASA con observación** | §7; todas las sesiones del manifiesto coinciden con sus logs (exit 0). Hay logs intermedios de A5 fallidos no narrados (A7-EV-01). |
| 12 | Re-ejecución de `pytest`, `lint`, `build`, `node --test` | **PASA** | §8; gates `*-a7` con EXIT 0. |
| 13 | Residuales evaluados y clasificados | **PASA** | §9; solo Low/informativos, no bloqueantes. |
| 14 | E2E re-ejecutado por A7 | **NO REALIZADO (limitación declarada)** | Requiere backend + Vite + Chromium/CDP; se auditó evidencia cruda de A0. |
| 15 | Commit / push | **NO REALIZADO (correcto)** | Sin commit; era una restricción del run. |

---

## 3. Integridad de la HU y del plan

`plan-approved.sha256` contiene los hashes de congelamiento. A7 los recalculó:

| Archivo | Esperado | Calculado | Estado |
|---|---|---|---|
| `specs/005-sinigan-sync/spec.md` | `636EDF2C80612F40DAE1D189EA9326ACE7431156BA4CB46147E08820780ACFB3` | `636EDF2C80612F40DAE1D189EA9326ACE7431156BA4CB46147E08820780ACFB3` | Coincide |
| `specs/005-sinigan-sync/plan.md` | `343C823F4B645834E473485AD20BF7A7E74B3D17E41C7947B0F97F7C2B250FD9` | `343C823F4B645834E473485AD20BF7A7E74B3D17E41C7947B0F97F7C2B250FD9` | Coincide |
| `specs/005-sinigan-sync/contracts/sinigan-sync-api.md` | `3BC3216D45C658C2D6AA0621BF435E96793836E57786DE68967077701FDA4ED9` | `3BC3216D45C658C2D6AA0621BF435E96793836E57786DE68967077701FDA4ED9` | Coincide |

`spec.md` conserva la historia, las reglas de negocio, los cuatro AC y el fuera de alcance. No fue reescrita ni ampliada.

**Nota histórica:** `agents/A2-analyst.md` registra para `plan.md` el hash `DA56BA75…`. Corresponde al plan previo a la corrección documental de `SIT-001`/D8 que A2 detectó y A0 corrigió; el hash actual coincide con el congelado. No es una alteración posterior a la aprobación.

---

## 4. Matriz de criterios de aceptación

| AC | Requisito | Implementación | Prueba ejecutada | Evidencia E2E / captura | Estado |
|---|---|---|---|---|---|
| **AC-01** | Ficha oficial simulada de un `din` existente con indicación explícita de simulación. | `service.py:177-224`; `schemas.py:10,49-54`; `SiniganReconciliation.jsx:175`; `siniganSyncUtils.js:1`. | `test_ac01_consistent_animal_returns_official_sheet_and_simulation_label` (+ 400/422). | `steps.ac01`; `AC-01 OK`; `screenshots/AC-01.png` (verificada visualmente). | **PASS** |
| **AC-02** | `din` inexistente informado sin crear registros automáticos. | `service.py:185-190` retorna 404 antes de escribir. | `test_ac02_unknown_din_returns_404_without_writes`; `test_official_din_without_field_record_returns_409_without_writes`. | `steps.ac02`: conteos `5/0/0/0` antes y después, `items == []`; `screenshots/AC-02.png`. | **PASS** |
| **AC-03** | Ticket con ambos valores, fecha y origen ante discrepancia de sexo o grupo etario. | `comparator.py:37-56`; `service.py:226-270`; `models.py:60-83`; `SiniganTicketDetail.jsx:145-176`. | 3 tests AC-03 + 5 tests del comparador. | `steps.ac03Sex` (#1, sexo) y `steps.ac03Age` (#2, grupo etario); `screenshots/AC-03-sex.png` (verificada) y `AC-03.png`. | **PASS** |
| **AC-04** | Resolución veterinaria con motivo obligatorio, cierre y trazabilidad. | `schemas.py:34-46`; `router.py:79-97`; `service.py:365-417`; `models.py:85-99`; `SiniganTicketDetail.jsx:178-231`. | 6 tests AC-04 + 2 tests de seguridad. | `steps.ac04EmptyReason`, `steps.ac04`, `steps.ac04Http`; `screenshots/AC-04-empty-reason.png` y `AC-04.png` (verificada). | **PASS** |

Detalle de cobertura:

- **AC-01:** la prueba verifica `meta.mockLabel`, `sourceMode="SIMULADO"`, `isSimulation=true`, `comparedAt`, `result="CONSISTENTE"`, snapshots oficial/campo y que no se crea ticket.
- **AC-02:** la prueba usa la base aislada, exige seed de campo `> 0` y compara los conteos de las cuatro tablas antes/después del `POST` con `DIN-DEMO-999999`; exige `404`. El E2E añade los conteos reales de la base local.
- **AC-03:** cubre sexo (`MACHO` vs `HEMBRA`), grupo etario (`TERNERO` vs `ADULTO`) y, adicionalmente en Pytest, especie (`BUFALINO` vs `BOVINO`) y predio (`SIT-DEMO-002` vs `SIT-DEMO-001`), siempre con `officialSource`, `fieldSource` y `detectedAt`.
- **AC-04:** cubre cierre `201`, `403` para operario, `409` en reintento, validación de motivo tras `trim` (`""`, `"    "`, `"abc"`, `"    abc    "`, 501), persistencia recortada, decisión inválida y campos extra `422`.

---

## 5. No sobrescritura

### 5.1 E2E (`e2e-results.json → steps.noOverwrite`)

- SHA-256 del fixture oficial: `7db8f53b55c071278868b85bf071ef859a30d84e56c120ad436dfe376100011c` antes y después. A7 recalculó el hash actual del archivo y coincide.
- `fieldRecordsBefore == fieldRecordsAfter`: los 5 registros (`DIN-DEMO-000001`…`000005`) conservan `species`, `sex`, `age_group`, `sit_code`, `establishment_name`, `source`.
- `fixtureUnchanged: true` y `fieldRecordsUnchanged: true`.
- Los conteos de artefactos cambian como se espera (`tickets 0→2`, `discrepancies 0→2`, `resolutions 0→1`), mientras `field_animal_records` permanece en 5.

### 5.2 Pruebas

- `test_comparison_does_not_overwrite_official_sheet_or_field_record`: compara la ficha oficial, el fixture (bytes) y la fila de campo antes/después; verifica que el ticket conserva los snapshots originales.
- `test_resolution_does_not_overwrite_sources_or_ticket_snapshots`: tras resolver, la ficha, el fixture, la fila de campo, los snapshots y las discrepancias permanecen idénticos; el ticket cambia solo a `CLOSED`.

Ambas ejecutadas en `pytest-a7.txt` (EXIT 0).

**Conclusión:** no hay sobrescritura automática de datos oficiales ni de campo; el flujo solo agrega artefactos de conciliación.

---

## 6. Trazabilidad de tickets

`steps.ac04Http.closedDetail` (ticket `#1`, `DIN-DEMO-000002`) evidencia:

- **Valores oficiales:** snapshot con `animalName=Sol`, `species=BOVINO`, `sex=MACHO`, `ageGroup=JOVEN`, `establishment.sitCode=SIT-DEMO-001`.
- **Valores de campo:** `sex=HEMBRA`, `ageGroup=JOVEN`, `sitCode=SIT-DEMO-001`, `source=REGISTRO_DE_CAMPO`, `updatedAt=2026-11-20T12:05:00Z`.
- **Fechas UTC `Z`:** `comparedAt`/`detectedAt` `2026-11-22T03:58:30.710371Z`; `closedAt`/`resolvedAt` `2026-11-22T03:58:32.673760Z`.
- **Orígenes:** `officialSource=MODO SIMULADO (SINIGÁN V6 MOCK)`, `fieldSource=REGISTRO DE CAMPO`.
- **Decisión:** `OFICIAL_PREVALECE`.
- **Motivo:** `Se valida la ficha oficial y se solicita corrección del registro de campo.`
- **Autor:** `vet@bovinotech.co`; **creador:** `operario@bovinotech.co`; **estado:** `CLOSED`.
- **Discrepancia conservada:** `fieldName=sex`, `officialValue=MACHO`, `fieldValue=HEMBRA`, con orígenes y `detectedAt`.

La captura `AC-04.png` confirma en la UI el bloque `Resolución registrada`, la decisión, el motivo, el autor, las fechas y la tabla de discrepancias.

**Conclusión:** la trazabilidad exigida se conserva completa. Los Medium M-01 (timestamps UTC) está corregido y re-verificado en la corrida final.

---

## 7. Evidencia multiagente

- **Manifiesto:** `manifest.json` declara 13 sesiones (`A1`, `A2`, `A5-red`, `A3`, `A4`, `A5-full`, `A5-final-docs`, `A6A`, `A6B`, `A3-fixes`, `A4-fixes`, `A6B-rereview`, `A5-final-update`). A7 verificó que **cada `session_id` declarado aparece en el log correspondiente** y que cada log termina en `EXIT_CODE=0`.
- **Prompts:** existen prompts independientes para A1, A2, A3, A4, A5 (rojo, QA y actualización), A6A, A6B y A7 en `prompts/`.
- **Entregables:** informes de agentes en `agents/`, actas de aceptación en `acceptance/`, revisiones en `reviews/`, triage en `findings/`, gates en `gates/` y capturas en `screenshots/`.
- **Revisiones independientes:** A6A `aprobar`; A6B original `aprobado con observaciones` (M-01/M-02/M-03); A6B re-revisión `aprobar` con 0 Medium abiertos.
- **Orquestación:** `orchestrator-log.md` narra G0, P1–P6, correcciones y verificación final de A0.
- **Observación A7-EV-01:** cuatro logs intermedios `A5-qa-full-followup{,2,3,4}.log.json` terminan en `EXIT_CODE=1` y no capturan `session_id`; no están referenciados en el manifiesto ni en el orquestador. Son intentos intermedios, no los entregables finales. Se declaran para no ocultar evidencia; no invalidan los resultados finales, que provienen de sesiones con exit 0.

---

## 8. Re-ejecución del auditor (estado final)

Ejecutado por A7 en el working tree, sin commit:

| Comando | Resultado | Archivo |
|---|---|---|
| `python -m pytest -q` (venv `hu05-venv`, Python 3.11.9) | `52 passed, 1 warning in 31.22s`, `EXIT_CODE=0` | `gates/G4-acceptance/pytest-a7.txt` |
| `npm run lint` | `EXIT_CODE=0` | `gates/G4-acceptance/lint-a7.txt` |
| `npm run build` | Vite 8.3.8, 32 módulos, `EXIT_CODE=0` | `gates/G4-acceptance/build-a7.txt` |
| `node --test` | 16 tests, 3 suites, 16 pass, 0 fail, `EXIT_CODE=0` | `gates/G4-acceptance/node-test-a7.txt` |

La advertencia de Pytest es el `DeprecationWarning` preexistente de `starlette/testclient.py` (`anyio.abc.BlockingPortal`), ajena a HU-05.

No se re-ejecutó el E2E fullstack: requiere backend, Vite y Chromium/CDP con control de procesos. A7 auditó la evidencia cruda (`e2e-results.json`, `e2e-run-final-a0.txt`, `e2e-backend-final.log`, `e2e-cdp.log`) y las capturas; no acredita el E2E como ejecutado por A7.

---

## 9. Hallazgos residuales

| ID | Severidad | Hallazgo | Impacto | ¿Bloquea? |
|---|---|---|---|---|
| R-01 | Low | Falta prueba automatizada de componente/estado para M-02, M-03 y L-04. | Una regresión futura en el `catch`, el request id o la actualización optimista pasaría desapercibida; el E2E solo cubre el camino feliz. | No |
| R-02 | Low | `loadTickets` no usa request id/`AbortController`; una respuesta lenta podría mostrarse tras cambiar de filtro. | Desajuste menor entre filtros y listado; no afecta la resolución (el detalle sí está protegido). | No |
| R-03 | Informativo | Seed de campo en import time en `backend/app/main.py`. | Importar `app.main` escribe en la SQLite de archivo; patrón preexistente. | No |
| R-04 | Informativo | Rama `IntegrityError` de doble resolución concurrente sin prueba dedicada. | El manejo de concurrencia no está verificado por ejecución. | No |
| A7-EV-01 | Informativo | Logs intermedios de A5 con exit 1 y sin sesión, no narrados. | Trazabilidad incompleta de intentos intermedios; no afecta entregables finales. | No |
| A7-EV-02 | Informativo | Hash de `plan.md` en A2 desactualizado respecto al congelado. | Explicable por la corrección documental posterior; el hash actual coincide. | No |
| A7-EV-03 | Informativo | E2E final ejecutado por A0, no por A5. | Declarado en actas y QA; la evidencia cruda se conserva. | No |
| A7-EV-04 | Informativo | `apiStatusForUnknownDin=200` en AC-02 corresponde al GET de tickets. | El 404 del POST queda cubierto por Pytest y el log del backend. | No |
| A7-EV-05 | Informativo | El `403` del E2E se hizo sobre ticket `#2` y el `409` sobre `#1`. | Pytest cubre ambos sobre el mismo ticket; el E2E demuestra el comportamiento. | No |

Los Low diferidos de A6B (L-06, L-08, L-10, L-11) y las observaciones Low de A6A (F-01, F-02, F-04, F-05) se mantienen documentados y son no bloqueantes. Los Medium M-01/M-02/M-03 están corregidos y re-aprobados por A6B. L-01 quedó cubierto; L-03, L-04, L-05, L-07 y L-09 están corregidos.

---

## 10. Limitaciones

1. **Sin commit:** la verificación se hizo sobre el working tree; `HEAD == main == a813893`. El manifiesto deja `head_sha` en `PENDING`.
2. **E2E ejecutado por A0:** el driver fue escrito/corregido por A5 y ejecutado por A0 por restricciones de permisos del shell de A5. A5 no declara haberlo ejecutado.
3. **Entorno local sin Docker (D9):** backend con Python 3.11.9 del venv temporal externo; Node v22.19.0 y npm 10.9.3.
4. **`rspp` ausente:** no existe en el contrato mock ni en los fixtures; se compara `sitCode` y la brecha está documentada en `decisions.md`.
5. **Rol `ADMIN` ausente:** no existe; la consulta es para usuarios autenticados y la resolución solo para `VETERINARIO` (D5).
6. **Cobertura de navegador:** el E2E cubre sexo y grupo etario; especie y predio se verifican en Pytest, no con captura de navegador.
7. **Capturas:** A7 verificó visualmente AC-01, AC-03-sex y AC-04; AC-02 y AC-03 (grupo etario) se sustentan en `e2e-results.json` y en la suite ejecutada.
8. **A7 no re-ejecutó el E2E** ni `bandit`; se auditó la evidencia previa (bandit G2/G4: 0 Medium/High, 4 Low preexistentes ajenos a HU-05).

Ninguna de estas limitaciones impide verificar AC-01…AC-04, la no sobrescritura ni la trazabilidad de tickets.

---

## 11. Veredicto final

**APROBADO CON OBSERVACIONES**

Fundamento:

- AC-01, AC-02, AC-03 y AC-04 están implementados, cubiertos por pruebas ejecutadas y respaldados por E2E y capturas.
- La HU y el plan congelados están intactos (SHA-256 coincidentes).
- Los cambios respetan el alcance aprobado y no tocan módulos, dependencias ni CI ajenos.
- La no sobrescritura de datos oficiales y de campo está demostrada por E2E y por pruebas.
- La trazabilidad de tickets conserva valores, fechas UTC, orígenes, decisión, motivo y autor.
- La ejecución multiagente es verificable para todas las sesiones reclamadas.
- Los gates re-ejecutados por A7 están en verde con `EXIT 0`.
- Los residuales son Low/informativos y no bloquean la aceptación; se recomienda atender R-01 y R-02 antes de un uso productivo y documentar/narrar los logs intermedios de A5 (A7-EV-01).


---

## 12. Delta D10 - aislamiento por finca activa (agregado 2026-11-22)

### 12.1 Resumen ejecutivo actualizado

Se agrego D10 (aislamiento de HU-05 por finca activa) sobre la implementacion ya aprobada. El HEAD observado es origin/develop = 38096fe (incluye HU-01 auth/RBAC); HU-05 sigue sin commit. A7 re-ejecuto la suite completa en el estado final:

- **Backend:** 122 passed, 1 warning, EXIT 0 (34.52 s).
- **Frontend Node:** 20 tests / 20 pass / 0 fail, 3 suites, EXIT 0.
- **npm run lint:** EXIT 0.
- **npm run build:** EXIT 0, Vite 8.3.8, 38 modulos.
- **E2E fullstack real (A0):** EXIT_CODE=0, incluye steps.d10FarmIsolation.
- **Tests D10 recolectados:** 13 (2 contrato farm API, 5 unit farm scope, 3 migracion de esquema, 3 seguridad farm isolation).

El aislamiento se verifico por dos vias independientes: E2E real (vet2 finca 2 no ve el ticket, detalle 404, resolucion 404; finca 1 visible con farmId=1) y tests de seguridad con snapshot de cero escrituras cruzadas. La no sobrescritura se mantiene (steps.noOverwrite y tests unitarios) y AC-01...AC-04 no regresan.

### 12.2 Checklist D10

| # | Verificacion | Resultado | Evidencia |
|---|---|---|---|
| 1 | HU literal intacta | **PASA** | spec.md = 636EDF2C..., coincide con plan-approved.sha256 |
| 2 | Plan congelado intacto | **PASA** | plan.md = 343C823F..., coincide |
| 3 | Contrato actualizado por D10 | **PASA con observacion** | contract = 3BE12803...; plan-approved.sha256 conserva el hash previo y debe regenerarse |
| 4 | farm_id NOT NULL e indexado; din unico global | **PASA** | models.py; 13 tests D10 |
| 5 | 403 sin finca activa en las 4 rutas | **PASA con M-03** | service.py:207/311/356/415; test_farm_scope y test_farm_isolation; 400/422 precede al 403 en validacion |
| 6 | Aislamiento en comparar, listar, detalle y resolver | **PASA** | filtros por (din, farm_id) e id + farm_id; E2E d10FarmIsolation |
| 7 | 404/409 indistinguibles entre fincas | **PASA** | mismo cuerpo para ticket inexistente y de otra finca; E2E y tests |
| 8 | Solo VETERINARIO resuelve (ADMINISTRADOR no) | **PASA por sonda** | require_veterinario; A6A/A6B verificaron 403; sin test dedicado (M-06) |
| 9 | Frontend remonta y recarga por token/finca | **PASA** | App.jsx key={user.farmId}; SiniganReconciliation; buildTicketsLoadKey |
| 10 | Sin sobrescritura de datos oficiales/campo | **PASA** | steps.noOverwrite: fixture 7db8f53b... y 5 registros identicos |
| 11 | Trazabilidad de tickets conservada | **PASA** | snapshots, fechas UTC, origenes, decision, motivo, autor; farmId aditivo |
| 12 | Sin regresion AC-01...AC-04 | **PASA** | Pytest 122 + E2E steps.ac01/ac02/ac03/ac04 en verde |
| 13 | Evidencia multiagente D10 verificable | **NO VERIFICABLE** | session_id declarados sin log ni prompt D10 en el worktree (A7-D10-06) |
| 14 | Migracion SQLite idempotente | **PASA con M-01/M-08** | schema_migration.py; 3 tests; DEFAULT 1 asimetrico |
| 15 | Commit / push | **NO REALIZADO (correcto)** | restriccion del run |

### 12.3 Hashes verificados contra disco

| Archivo | Hash real (A7) | Estado |
|---|---|---|
| specs/005-sinigan-sync/spec.md | 636EDF2C80612F40DAE1D189EA9326ACE7431156BA4CB46147E08820780ACFB3 | Sin cambios |
| specs/005-sinigan-sync/plan.md | 343C823F4B645834E473485AD20BF7A7E74B3D17E41C7947B0F97F7C2B250FD9 | Sin cambios |
| specs/005-sinigan-sync/contracts/sinigan-sync-api.md | 3BE12803FB8812068996158469151F345CF713158B0BDC01A00A631827490ED6 | Cambio aprobado por D10 |
| specs/005-sinigan-sync/data-model.md | 6CDED92F1F24C5A8116CDB79BF131AD7B4781B520F563FFFB886126315324EFA | Actualizado por D10 |
| specs/005-sinigan-sync/decisions/D10-farm-isolation.md | 59CB1EF4679B37D977EF75CDAA3C78196757F2D9EC5EFE103BB88D4C19E9574F | Nuevo |

**A7-D10-01:** el briefing afirmaba que data-model.md tenia hash 3BE12803...; ese valor es el del contrato. El hash real del data-model es 6CDED92F.... Se registra el valor verificado.

**A7-D10-05:** plan-approved.sha256 no fue regenerado tras el cambio del contrato; queda obsoleto y debe actualizarse antes del merge. spec.md y plan.md permanecen intactos.

### 12.4 Hallazgos D10

| ID | Severidad | Hallazgo | Bloquea? |
|---|---|---|---|
| M-01 | Menor | DEFAULT 1 asimetrico en bases migradas vs esquema fresco. | No |
| M-02 | Menor | Claim farm_id no revalidado contra membresia; token revocado opera hasta 7 dias. | No |
| M-03 | Menor | 400/422 antes que 403 en POST /comparisons con DIN invalido y en query limit=0. | No |
| M-04 | Menor | El frontend no limpia estado en errores de listado/detalle. | No |
| M-05 | Menor | Carrera en handleResolved (usa result.id no capturado). | No |
| M-06 | Menor | Tests 403 duplicados; falta test ADMINISTRADOR no resuelve. | No |
| M-07 | Menor | Test de recarga por finca solo prueba buildTicketsLoadKey. | No |
| M-08 | Menor | Migracion sin cobertura de orden/seeds/concurrencia. | No |
| Obs-1 | Observacion | UI muestra finca desde localStorage; solo presentacion. | No |
| Obs-2 | Observacion | Fallback 403 de servicio frontend enganoso sin finca. | No |
| R-01 | Low | Sin tests de componente para M-02/M-03/L-04 (previo, sin cambios). | No |
| R-02 | Low | loadTickets sin AbortController/request id (previo, sin cambios). | No |
| R-03 | Informativo | Seed en import time (previo, sin cambios). | No |
| R-04 | Informativo | Doble resolucion concurrente sin test dedicado (previo, sin cambios). | No |

**Hallazgos de evidencia:** A7-D10-02 (a0-node-test.txt es una corrida fallida descrita como 20/20; el artefacto canonico y la re-ejecucion de A7 si dan 20/20 EXIT 0); A7-D10-03 (el resumen reportaba 10 tests D10, la recoleccion real es 13); A7-D10-04 (no hay ADR D11 separado); A7-D10-06 (session_id D10 sin logs/prompts). Ninguno bloquea AC ni la implementacion; A7-D10-06 bloquea el sellado de la evidencia multiagente hasta que A0 anexe los logs.
### 12.5 No regresion sobre AC-01...AC-04

| AC | Verificacion D10 | Estado |
|---|---|---|
| AC-01 | E2E steps.ac01 sigue en verde (etiqueta MODO SIMULADO, resultado CONSISTENTE) dentro de la corrida D10 EXIT 0. | **PASS** |
| AC-02 | steps.ac02 y steps.noOverwrite: field_animal_records=5 antes/despues, tickets de DIN inexistente vacios, sin escrituras. | **PASS** |
| AC-03 | steps.ac03Sex (ticket #1) y steps.ac03Age (ticket #2) siguen generando discrepancia con valores, fecha y origen; farmId es aditivo. | **PASS** |
| AC-04 | steps.ac04EmptyReason, steps.ac04 y steps.ac04Http siguen en verde; 403 operario, 409 reintento, cierre con motivo y trazabilidad. | **PASS** |

Los 122 tests backend incluyen los 4 AC; la re-ejecucion de A7 no muestra fallos.

### 12.6 Evidencia multiagente D10

Los session_id declarados para D10 son:

- A5-d10: ses_dfb66ec65ffeRX2JQ9rEKuaB32
- A6A-d10: ses_dfb5901dbffe80ZopwmbfbehIs
- A6B-d10: ses_dfb5901dbffdt3NXZgPHZENHly

**A7 no puede verificarlos:** no existe ningun log *-d10* en agents/, ni prompt D10 en prompts/, ni narracion D10 en orchestrator-log.md. Los informes A6A/A6B D10 declaran ser transcripciones de A0 tras agotar el limite de pasos. La cadena sesion-log-entregable esta rota para D10. **Condicion de cierre:** A0 debe exportar los logs/prompts D10 antes del merge. La implementacion, los tests, las revisiones y el E2E si son verificables por contenido y por re-ejecucion.

### 12.7 Veredicto final

**APROBADO CON OBSERVACIONES**

Fundamento:

- D10 implementa el aislamiento por finca activa con farm_id NOT NULL e indexado, 403 sin finca y 404/409 indistinguibles.
- Invariantes 7-8 del data-model verificados por lectura y por 13 tests D10.
- E2E real D10 PASS (EXIT_CODE=0): finca 2 sin visibilidad, finca 1 visible con farmId=1, sin material de token.
- Sin sobrescritura: fixture oficial y 5 registros de campo identicos antes/despues.
- AC-01...AC-04 sin regresion: 122 backend, 20 Node, lint y build EXIT 0.
- Los 8 hallazgos M-01...M-08 son Menor y no bloquean; Obs-1/Obs-2 y R-01...R-04 siguen abiertos.
- **Observaciones de evidencia (no de codigo):** logs/prompts D10 ausentes (A7-D10-06); plan-approved.sha256 obsoleto (A7-D10-05); a0-node-test.txt mal descrito (A7-D10-02); conteo D10 del briefing inexacto (A7-D10-03); sin ADR D11 separado (A7-D10-04).

El veredicto se mantiene igual al del run previo: **APROBADO CON OBSERVACIONES**, condicionado a que A0 cierre las observaciones de evidencia antes del merge.