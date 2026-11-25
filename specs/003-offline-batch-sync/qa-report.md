# Informe de QA y Seguridad: HU-03 Sincronización por lotes, idempotencia y reintentos controlados

| Campo | Valor |
|---|---|
| HU | HU-03 `offline_sync` (specs/003-offline-batch-sync) |
| Pull Request | #9 (rama `feat/hu-03-offline-sync` comparada con `main`) |
| Commits auditados | `375011a` feat(offline-sync): HU-03 batch sync with idempotency and controlled retries · `465ef59` fix(offline-sync): never trust client validation status on sync |
| Fecha | 2026-11-24 |
| Agente | `qa-seguridad` (auditoría independiente; no escribió el código) |

## Veredicto

> **Actualizado el 2026-11-24 tras la re-verificación 2**: ver [Re-verificación 2](#re-verificación-2-2026-11-24-qa-11-a-qa-14). QA-11, QA-12 y QA-13 están corregidos y QA-14 es un riesgo aceptado en `plan.md`. Solo quedan dos observaciones Info nuevas (QA-15, QA-16). Veredicto: **APROBADO**.
>
> **Actualizado el 2026-11-24 tras la re-verificación**: ver la sección [Re-verificación](#re-verificación-2026-11-24-correcciones-sin-commit) al final. QA-01, QA-02, QA-06, QA-07 y QA-09 están corregidos. Aparecen QA-11 (Media, previo a esta HU), QA-12 y QA-13 (Baja) y QA-14 (Info). El veredicto se mantiene en **APROBADO CON OBSERVACIONES**.

Veredicto original: **APROBADO CON OBSERVACIONES.** Las cuatro verificaciones automáticas están en verde, los cuatro criterios de aceptación tienen pruebas que los demuestran y el núcleo (idempotencia, append-only, conservación local, backoff) es correcto. Hay dos hallazgos de gravedad Media que conviene corregir antes de integrar a `main`: QA-01 (el cliente puede saltarse la validación FR-017 declarando `origin: "LEGACY"`) y QA-02 (si cambia el usuario a mitad de una sincronización, los eventos del primer usuario quedan `FALLIDO` definitivo).

## Resultados de las verificaciones ejecutadas

| Comando | Resultado |
|---|---|
| `cd backend && .venv/bin/python -m pytest -q` | **202 passed**, 1 warning (deprecación de anyio en starlette, ajena al PR) en **61,57 s** (< 90 s ✔) |
| `cd backend && .venv/bin/python -m pytest -q tests -k offline_sync` | 52 passed en 10,04 s |
| `cd backend && .venv/bin/bandit -r app -ll` | **No issues identified** (Medium/High = 0; 7 Low filtradas por `-ll`, ninguna en `offline_sync`: `bandit -r app/features/offline_sync` sin filtro → 0) |
| `cd frontend && node --test 'src/features/offline-sync/*.test.js' 'src/features/offline-capture/*.test.js'` | **116 tests, 116 pass, 0 fail** |
| `cd frontend && npm run lint` | Sin errores ni avisos |
| `cd frontend && npm run build` | OK (vite 8.3.8, 78 módulos, `index-*.js` 323,85 kB / 96,39 kB gzip) |
| Búsqueda de secretos en `offline_sync` / `offline-sync` | Sin credenciales ni tokens quemados |
| Sondas propias (scratchpad, sin tocar el repo) | `probe_backend.py` y `probe_frontend.mjs`: reproducen QA-01, QA-02, QA-03, QA-04, QA-05, QA-06 y QA-07 (salidas citadas en cada hallazgo) |

## Matriz de criterios de aceptación

| # | Criterio | Pruebas | ¿Lo demuestra? |
|---|---|---|---|
| 1 | Lote `PENDIENTE_SINCRONIZACION` → al reconectar se envía en lote y cada elemento queda `SINCRONIZADO`, `DUPLICADO` o `FALLIDO` | Backend: `tests/contract/test_offline_sync_batches_api.py::test_ac1_batch_mixed_states` (lote mixto contra `sync-batch.cases.json`), `::test_valid_batch_of_ten_is_synced_in_order_with_original_time`. Frontend: `batchResult.test.js` "AC1: one batch yields synced, duplicate and final failure", `syncEngine.test.js` "10 pending events are sent in one batch and confirmed", `syncController.test.js` "starting a session recovers interrupted states and syncs once" | **Sí, con matiz.** Los tres estados por evento y el envío en lote están probados contra el servidor real (backend) y contra el motor (frontend). El disparo por el evento `online` del navegador (`syncController.js:55`, `onOnline`) no tiene prueba: la reconexión se ejercita solo vía `setSession` (ver QA-10). |
| 2 | Corte simulado de 24 h → 100 % de eventos válidos sincronizados sin pérdida ni duplicación | Frontend: `syncEngine.test.js` "24-hour outage with 200 events: all confirmed, none lost, none duplicated" (200 eventos repartidos en 24 h, verifica 200 registros, 200 `synced` y ningún envío repetido). Backend: `test_unit/test_offline_sync_service.py::test_one_thousand_events_in_twenty_batches` (1.000 eventos, 1.000 filas, < 5 s) y el test de 10 eventos en 24 h con hora original | **Sí, por capas.** El cliente se prueba contra un servidor falso idempotente (`testDoubles.js`) y el servidor por separado; no hay prueba integrada cliente + API real, aceptable para este nivel. |
| 3 | Evento ya sincronizado reenviado por corte a mitad de respuesta → `DUPLICADO` y un único registro | Backend: `::test_ac3_resend_after_lost_response` (mismo `receivedAt`, una fila), `::test_one_hundred_resends_keep_a_single_record` (SC-002), `::test_same_id_twice_in_batch`, `security/test_offline_sync_idempotency.py::test_competing_sessions_store_a_single_record`. Frontend: `syncEngine.test.js` "a cut mid-response leaves events pending; the next run confirms them as duplicates" | **Sí.** El corte a mitad de respuesta se simula de verdad en el frontend (`lostResponses`). Nota: la prueba de "sesiones concurrentes" es secuencial (ver QA-10), aunque sí ejercita la rama `IntegrityError`. |
| 4 | Lote de 10 con 2 fallos transitorios → 8 confirmados y solo 2 en cola para reintento | Backend: `test_offline_sync_service.py::test_ac4_two_of_ten_transient` (inyecta `OperationalError` en 2 inserciones; 8 filas, 2 `STORAGE_BUSY` `retryable`). Frontend: `syncEngine.test.js` "AC4 end to end: 8 confirmed, only 2 stay queued and later succeed" (respeta la espera y reenvía solo los 2) | **Sí.** Cubre también que la espera se respeta y que solo se reenvían los fallidos. |

## Hallazgos

### QA-01 · Media · Seguridad / Validación (confianza en datos del cliente)

- **Ubicación**: `backend/app/features/offline_capture/schemas.py:82` y `:123` (consumido por `backend/app/features/offline_sync/service.py:79-80`).
- **Descripción**: `origin` llega del cliente y el servidor lo acepta sin comprobación. Con `origin: "LEGACY"` se omiten todas las reglas de FR-015 (producto, dosis, dosis positiva, unidad, motivo, hallazgo). Cualquier OPERARIO o VETERINARIO autenticado puede registrar en `offline_sync_events`, la fuente de verdad propuesta para HU-04 (`coordination.md` §1), una vacunación o un tratamiento sin producto, con dosis negativa o con una unidad arbitraria. Eso afecta la trazabilidad sanitaria y el cálculo posterior de tiempos de retiro (constitución §3). La excepción de FR-017 está pensada solo para eventos que de verdad vienen de la captura preliminar (HU-02 FR-019).
- **Evidencia** (`probe_backend.py`):
  ```
  P1 legacy TREATMENT sin producto/dosis/motivo -> SINCRONIZADO
  P1b legacy dosis negativa y unidad de 200 chars -> SINCRONIZADO -5.0 200
  ```
  La prueba existente `test_legacy_event_without_product_is_synced` confirma el comportamiento, pero solo comprueba el caso legítimo.
- **Recomendación**: no confiar en el `origin` declarado. Opciones, de más a menos estricta: (a) aceptar `LEGACY` solo si `fieldOccurredAt` es anterior a una fecha de corte de la captura preliminar, configurada en el servidor; (b) aplicar siempre las reglas que no dependen de la antigüedad del dato (`DOSE_NOT_POSITIVE`, unidad dentro de `DOSE_UNITS` cuando hay dosis, longitudes); (c) guardar los `LEGACY` con una marca de revisión del servidor (p. ej. `requires_data_review = true`) para que HU-04 los trate aparte. Agregar pruebas negativas: `LEGACY` reciente sin producto y `LEGACY` con dosis negativa.

### QA-02 · Media · Integridad / Concurrencia del cliente

- **Ubicación**: `frontend/src/features/offline-sync/syncServices.js:11,18,29-31`; `syncTransport.js:18`; `syncEngine.js:41`.
- **Descripción**: el transporte lee el token de una variable global (`getToken: () => currentToken`) que `setSyncSession` cambia al momento, mientras el motor sigue la ejecución con la `session` (y el `authorEmail`) del usuario anterior. `sendBatch(batch, session)` pasa `session.token`, pero `transport.send(items)` lo ignora. Si otro usuario inicia sesión en el mismo dispositivo con una sincronización de varios lotes en curso, los lotes siguientes del usuario A salen con el token de B. El servidor responde `AUTHOR_MISMATCH` (definitivo) y los eventos de A quedan `FALLIDO` definitivo: no se reintentan nunca y su resolución está fuera de alcance. Contradice el caso de borde "Eventos de otro usuario en el mismo dispositivo: solo se envían con la sesión de su autor. Mientras tanto permanecen intactos".
- **Evidencia** (`probe_frontend.mjs`, 120 eventos de A en 3 lotes, B inicia sesión durante el lote 1; el servidor simulado responde `AUTHOR_MISMATCH` igual que `authorization.py:24-25`):
  ```
  R1 tokens por lote: token-A,token-B,token-B | eventos de A en FALLIDO definitivo: 70
  ```
- **Recomendación**: que el transporte use el token de la sesión con la que arrancó la ejecución (`transport.send(items, session.token)`, usando de verdad el segundo argumento) y que el motor aborte la ejecución si la sesión del controlador cambia entre lotes. Como defensa adicional, tratar `AUTHOR_MISMATCH` en el cliente como "pausa" y no como definitivo cuando el `authorEmail` del evento difiere del de la sesión activa. Agregar una prueba de cambio de sesión a mitad de ejecución.

### QA-03 · Baja · Idempotencia / Append-only (FR-013)

- **Ubicación**: `backend/app/features/offline_sync/service.py:98-100`.
- **Descripción**: si el `client_event_id` existe en la tabla preliminar `sanitary_events`, se responde `DUPLICADO` sin comparar contenido ni autor. El dispositivo da el evento por confirmado aunque el servidor solo tenga la versión preliminar, que puede ser distinta. Un id reutilizado con datos distintos debería ser `FALLIDO` definitivo `CLIENT_EVENT_ID_CONFLICT` con auditoría, igual que en `offline_sync_events`. Hoy el riesgo real es bajo: los UUID son aleatorios y el camino preliminar está en retirada (`coordination.md` §2).
- **Evidencia**: `P2 id de registro preliminar con otro autor/contenido -> DUPLICADO filas offline_sync: 0`. La prueba `test_event_already_synced_by_the_preliminary_endpoint_is_duplicate` ya usa un `field_occurred_at` distinto al del evento y aun así espera `DUPLICADO`.
- **Recomendación**: comparar al menos `author_email`, `din`, `event_type` y `field_occurred_at` con el registro preliminar. Si difieren, responder `CLIENT_EVENT_ID_CONFLICT` y auditarlo.

### QA-04 · Baja · Autorización (usuario deshabilitado)

- **Ubicación**: `backend/app/features/offline_sync/authorization.py:28-32` junto con `backend/app/features/auth/sync_support.py:38-43`.
- **Descripción**: un usuario deshabilitado cuyo token se emitió antes de la deshabilitación sigue pudiendo sincronizar. El único límite es `fieldOccurredAt < disabled_at`, y esa hora la pone el dispositivo. Mientras el token no venza, puede subir eventos nuevos retrofechados. El diseño lo acepta a sabiendas (research R7: se descarta `was_user_active_at` para no rechazar el corte de 24 h), pero el riesgo no figura como aceptado.
- **Evidencia**: `P3 usuario deshabilitado con evento retrofechado -> SINCRONIZADO`.
- **Recomendación**: documentarlo como riesgo aceptado en `plan.md` o, mejor, guardar los eventos sincronizados por un usuario deshabilitado con una marca de revisión (`author_verification_result = "UNVERIFIED"` o equivalente) para que HU-04 los revise.

### QA-05 · Baja · Resiliencia del servidor (FR-014)

- **Ubicación**: `backend/app/features/offline_sync/service.py:129-132`, `service.py:182`.
- **Descripción**: por evento solo se capturan `IntegrityError` y `OperationalError`. Cualquier otra excepción en un evento (p. ej. `DataError` en PostgreSQL por `dose_unit` de más de 16 caracteres, que hoy entra por QA-01) aborta todo el lote con un 500. El cliente lo trataría como transitorio para todo el lote y lo reintentaría indefinidamente (envenenamiento del lote). Con SQLite (`app/core/database.py:4`) no se manifiesta, por eso queda como sospecha fundada.
- **Evidencia**: `P5 excepción no controlada en un evento aborta todo el lote: ValueError` (fallo inyectado con un repositorio de prueba).
- **Recomendación**: capturar `SQLAlchemyError` (y, por defensa, `Exception`) por evento dentro del savepoint, y responder `FALLIDO` definitivo con un código genérico sin filtrar el mensaje interno. Corregir QA-01 elimina la vía concreta.

### QA-06 · Baja · Reintentos (FR-020)

- **Ubicación**: `frontend/src/features/offline-sync/syncController.js:37-53` y `:75`.
- **Descripción**: tras un 401/403 (`auth_paused`), `run()` no consulta `authPaused`. El temporizador de 30 s sigue lanzando ejecuciones con el mismo token inválido, una petición rechazada cada 30 s. Los eventos no se dañan (vuelven a `pending` sin consumir intentos), pero el envío no queda "pausado" como dice FR-020 y gasta datos móviles rurales.
- **Evidencia**: `R2 ejecuciones con el mismo token tras auth_paused (≈100 ms, timer 20 ms): 4`.
- **Recomendación**: en `run()`, salir si `authPaused` es verdadero y el token no cambió. Reanudar solo con un token nuevo, como ya hace `setSession`.

### QA-07 · Baja · Reintentos (FR-026 / research R9)

- **Ubicación**: `frontend/src/features/offline-sync/batchResult.js:80-87` (vía `transientFailure`, `:54-65`).
- **Descripción**: research R9 dice "al perder la conexión, no se programan intentos ni se incrementa `attempts` (FR-026)". Un error de red o un tiempo agotado a mitad de ejecución incrementa `attempts` y programa backoff para todo el lote. Si la conexión se cae antes de enviar, el controlador sí respeta FR-026 (sonda previa, prueba "without connectivity nothing runs"). La prueba `batchResult.test.js` "network error and timeout…" fija el comportamiento contrario (`attempts === 1`).
- **Evidencia**: `R3 attempts tras corte de red: 1`.
- **Recomendación**: decidir y documentar. O se alinea el código con R9 (en `outcome: 'offline'`, volver a `pending` sin incrementar `attempts`), o se corrige R9 para aclarar que un corte durante la petición sí cuenta como intento, que también es razonable.

### QA-08 · Info · Confianza en datos del cliente (FR-018)

- **Ubicación**: `backend/app/features/offline_sync/service.py:124-125`.
- **Descripción**: `authorVerificationPending` se toma del cliente. Si un cliente modificado lo envía `false` para un evento capturado con sesión vencida, `author_verification_result` queda `None` y el evento no se marca para revisión. El servidor no puede saber por sí mismo el estado de la sesión offline en el momento de la captura, así que es una limitación inherente al modelo offline, no un defecto de esta HU.
- **Evidencia**: `P4 authorVerificationPending=false -> SINCRONIZADO False None`.
- **Recomendación**: registrarlo como riesgo aceptado. Opcional: calcular `author_verification_result` para todos los eventos (no solo los marcados), para que HU-04 tenga un indicador del servidor.

### QA-09 · Info · Aislamiento modular (constitución §2)

- **Ubicación**: `frontend/src/features/offline-capture/{pendingTrayModel.js, eventDetailModel.js, PendingTray.jsx, EventDetail.jsx}` y sus dos pruebas; `frontend/src/App.jsx:14-15`; `backend/app/main.py`.
- **Descripción**: fuera de `features/offline_sync` y `features/offline-sync` se tocaron `main.py` y `App.jsx` (permitidos) y seis archivos de `offline-capture`. Estos últimos son cambios aditivos y compatibles (parámetro opcional `syncLabelOf`, con caída al comportamiento anterior), los prevé research R8 ("se incorpora directamente al implementarla") y el módulo HU-02 es del mismo integrante (commit `e5fe800`). Se consideran justificados. Observaciones menores: (1) queda una dependencia en ambos sentidos entre módulos (`offline-capture/PendingTray.jsx:2` importa `offline-sync`, y `offline-sync/syncServices.js:2` importa `offline-capture/captureServices.js`); (2) `App.jsx` importa dos veces del mismo módulo en líneas separadas (14-15) y coloca la insignia y el botón dentro del `<header>`, no "al final del bloque". Ninguna de las dos rompe el build ni el lint.
- **Recomendación**: dejar constancia en `coordination.md` de que se tocó HU-02 y por qué. Unificar las dos importaciones en `App.jsx`.

### QA-10 · Info · Huecos de cobertura

- **Descripción**: casos de la spec sin prueba que los demuestre directamente:
  1. Disparo por el evento `online` del navegador (`syncController.js:55,73`): ninguna prueba despacha `online`.
  2. Concurrencia real del servidor: `test_competing_sessions_store_a_single_record` ejecuta las dos sesiones en secuencia. Ejercita la rama `IntegrityError`, pero no dos transacciones abiertas a la vez.
  3. Cambio de usuario a mitad de ejecución (QA-02) y pruebas negativas de `LEGACY` (QA-01).
  4. Las pruebas de contrato no cubren el envío de campos de servidor (`receivedAt`, `requiresTimestampReview`, `authorVerificationResult`) dentro de un item. Por revisión de código se ignoran (Pydantic con `extra` por defecto y asignación explícita en `service.py:105-128`), pero no hay una prueba de regresión de asignación masiva salvo para `validationStatus` y `syncStatus`.
  5. No hay pruebas de componentes React (`SyncStatusBadge`, `SyncNowButton`, `FailedEventDetail`); su lógica sí está cubierta en `syncStateLabels.test.js`.
- **Recomendación**: agregar al menos las pruebas de los puntos 1, 3 y 4. El punto 2 puede cubrirse con dos hilos y una barrera sobre un archivo SQLite temporal.

## Aspectos verificados sin hallazgos

- **Append-only**: ningún `UPDATE` ni `DELETE` sobre `offline_sync_events` en el módulo (lo comprueba además `test_module_never_updates_or_deletes_synced_events`). El reenvío con cambios deja la fila original intacta y audita el intento (`OfflineSyncIdConflict`).
- **Idempotencia**: índice `UNIQUE` en `client_event_id`, inserción en savepoint propio y resolución por huella SHA-256 canónica (`hashing.py`), sin estados mutables en la huella.
- **Estados de flujo**: `validation_status` siempre `PENDIENTE_VALIDACION` en el servidor (commit `465ef59`, prueba `test_client_cannot_set_its_own_validation_status`). `syncStatus` del cliente se ignora.
- **Autorización**: autor = token, finca dentro de `user.farm_ids`, rol de captura (403 para `DIRECTIVO`/`ADMINISTRADOR`), 401 sin token. Los mensajes de error son genéricos y en español, sin trazas ni datos internos.
- **Inyección**: solo ORM con parámetros, ni SQL crudo ni `eval`. En el frontend no hay `dangerouslySetInnerHTML`: los motivos de fallo se renderizan como texto.
- **Conservación en el dispositivo**: el motor nunca escribe en el almacén de HU-02 y `syncStateRepository` no expone borrado de estados. Los `syncing` interrumpidos vuelven a `pending` al arrancar.
- **Backoff**: `retryPolicy.js` implementa R9 (2 s × 2^(n−1), tope 15 min, ±50 %). La espera efectiva puede llegar a 22,5 min (15 min + 50 %), coherente con "variación sobre cada espera". La cota inferior crece estrictamente, aunque dos muestras consecutivas pueden decrecer, lo que research R9 reconoce. Los transitorios nunca se abandonan y los definitivos no se reintentan (`queueSelection.js:10`). 401/403 no consumen intentos.

## Fuera de alcance / riesgos aceptados

- Detección de relojes de dispositivo manipulados (spec, Supuestos): afecta QA-04 y QA-08.
- Resolución de eventos `FALLIDO` definitivos (spec, Fuera de alcance). Por eso QA-02 tiene impacto Medio: un definitivo erróneo no tiene vía de recuperación en esta HU.
- Retirada de `POST /sync/batches` y de la captura preliminar (`coordination.md` §2, pendiente): mientras conviva, aplica QA-03.
- Ejecución de `npm test` en CI (`coordination.md` §3, pendiente): hoy las 116 pruebas de frontend solo corren en local.
- Base de datos SQLite en desarrollo: los límites de longitud de columna (`String(16)`) no se aplican, por lo que QA-05 solo se manifestaría en un motor estricto.

---

## Re-verificación (2026-11-24, correcciones sin commit)

| Campo | Valor |
|---|---|
| Alcance | Árbol de trabajo sobre `465ef59` (sin commit): correcciones de QA-01, QA-02, QA-06, QA-07 y de la importación duplicada de QA-09. QA-03, QA-04, QA-05 y QA-08 figuran como riesgos aceptados en `plan.md`. |
| Agente | `qa-seguridad` (auditoría independiente del código, no de la documentación) |
| Sondas | Scratchpad de la sesión, fuera del repo: `probe_backend_v2.py`, `probe_http_nan.py` y `probe_frontend_v2.mjs` (esta última usa el `syncWiring.js` real con un servidor simulado que responde como `authorization.py`) |

### Verificaciones ejecutadas

| Comando | Resultado |
|---|---|
| `cd backend && .venv/bin/python -m pytest -q` | **213 passed**, 1 warning (deprecación de anyio en starlette, ajena al PR) en **47,57 s** (`real` 48,79 s; < 90 s ✔). Antes: 202. |
| `cd backend && .venv/bin/bandit -r app -ll` | Medium 0 / High 0 (7 Low filtradas por `-ll`, las mismas que antes) |
| `cd frontend && node --test 'src/features/offline-sync/*.test.js' 'src/features/offline-capture/*.test.js'` | **129 tests, 129 pass, 0 fail**. Antes: 116. |
| `cd frontend && npm run lint` | Sin errores ni avisos |
| `cd frontend && npm run build` | OK (79 módulos, `index-*.js` 324,52 kB / 96,61 kB gzip) |

### Estado de los hallazgos

| ID | Gravedad | Estado | Evidencia de la re-verificación |
|---|---|---|---|
| QA-01 | Media | **Corregido** (decisión aceptada, ver D1) | `LEGACY` con dosis negativa, dosis 0, unidad `X`, unidad vacía o unidad de 200 caracteres → `FALLIDO VALIDATION_ERROR` (V2–V5, V7). `LEGACY` sin producto, dosis ni motivo → `SINCRONIZADO` con `requires_data_review = true` en la fila y `requiresDataReview: true` en la respuesta (V1). El cliente no puede fijar la marca: `requiresDataReview: false` en el item se ignora (V10). Al reenviar el mismo id como `OFFLINE_CAPTURE` se responde `CLIENT_EVENT_ID_CONFLICT`, porque `origin` forma parte de la huella (V11). El cliente valida igual que el servidor (F9). Queda una vía de abuso distinta y previa a esta HU: ver QA-11. |
| QA-02 | Media | **Corregido** | F1, con 120 eventos de A y B que inicia sesión durante el lote 1: lotes `tok-A:A:50`, después `tok-B:B:5`. A queda con 50 `synced` y 70 sin tocar (pendientes, sin intentos consumidos); B con 5 `synced`; ningún `FALLIDO` definitivo (antes había 70). F4: si A cierra sesión a mitad, se detiene tras el lote en curso. F8: `AUTHOR_MISMATCH` sobre un evento del propio remitente sigue siendo definitivo, como debe. Detalle menor en QA-14. |
| QA-03 | Baja | Riesgo aceptado (`plan.md`) | Sin cambios en el código. |
| QA-04 | Baja | Riesgo aceptado (`plan.md`) | Sin cambios en el código. |
| QA-05 | Baja | Riesgo aceptado (`plan.md`) | La vía concreta quedó cerrada: `doseUnit` tiene `max_length=16` (V3). La captura por evento sigue limitada a `IntegrityError` y `OperationalError`. |
| QA-06 | Baja | **Corregido** | F5: tras un 401, en unos 110 ms con un temporizador de 20 ms solo sale **1** petición (antes 4). Con un token nuevo se reanuda (2.ª petición). Mientras dura la pausa, `syncNow()` devuelve `null` sin enviar nada, que es coherente con FR-020. |
| QA-07 | Baja | **Corregido** (alineado con R9/FR-026 y con el caso `network_error_whole_batch`) | F6: tras un error de red, `status pending`, `attempts 0`, `next_attempt_at null`. La decisión de tratar también el tiempo agotado como corte de red abre QA-12. |
| QA-08 | Info | Riesgo aceptado (`plan.md`) | Sin cambios. |
| QA-09 | Info | **Corregido** | `App.jsx` importa `OfflineSyncProvider, SyncNowButton, SyncStatusBadge` en una sola línea. `coordination.md` §4 deja constancia de los archivos de HU-02 tocados y de la dependencia en ambos sentidos. |
| QA-10 | Info | **Parcial** | Cubiertos: el cambio de sesión a mitad de ejecución (`syncWiring.test.js`, `syncEngine.test.js`, `syncController.test.js`), las pruebas negativas de `LEGACY` (`test_offline_sync_service.py`) y que el cliente no puede fijar `requires_data_review` (`test_requires_data_review_is_set_by_the_server_only`). Siguen abiertos: el disparo por el evento `online` (ninguna prueba lo despacha), la concurrencia real del servidor y las pruebas de componentes React. |

### Juicio sobre las decisiones del implementador

- **D1 (QA-01: `LEGACY` acepta `doseUnit: null` con dosis; servidor calcula `requires_data_review`)**: **aceptable.** Comprobé que `legacyImport.js` siempre pone `doseUnit: null`, así que exigir unidad rompería la migración legítima. La tolerancia es mínima: solo `null`, porque `""` o cualquier valor fuera de `DOSE_UNITS` se rechazan (V4, V5). Que la marca la calcule el servidor a partir de `origin` cierra el abuso de forma razonable: un `LEGACY` falso ya no puede pasar inadvertido para HU-04. Observación: el frontend no guarda `requiresDataReview` en su estado local (`confirmed()` en `batchResult.js`). No afecta a esta HU porque la revisión es de HU-04.
- **D2 (BD antigua → `STORAGE_BUSY` sin fin; se documenta regenerar la base)**: **aceptable solo con matices** (ver QA-13). Mitiga el riesgo que `main` no tenga `offline_sync_events`: en cualquier base creada desde `main`, `create_all` crea la tabla completa. Solo afecta a bases creadas con los commits de esta rama. Aun así, el proyecto ya resuelve este mismo problema con migraciones en sitio (`ensure_auth_schema`, `ensure_sinigan_sync_schema` en `main.py`), el fallo es silencioso y engañoso ("almacenamiento ocupado") y la propia `backend/bovinotech.db` del desarrollador **no tiene la columna** (`PRAGMA table_info` → 0 coincidencias).
- **D3 (QA-02: `syncWiring.js`, token por ejecución, parada entre lotes, `AUTHOR_MISMATCH` de otro autor → `pending`, relanzar la sesión nueva)**: **correcto.** Ya no hay estado global de token: `syncTransport.send(items, token)` usa el token de `runSession`. Matiz: la rama `sentByAnotherUser` es inalcanzable en la práctica, porque `selectDueEvents` solo elige eventos del autor de la sesión. Es defensa en profundidad y no estorba. El relanzamiento solo ocurre con `stop_reason === 'session_changed'` (QA-14).
- **D4 (QA-07: un corte de red no consume intentos ni programa espera)**: **correcto para el error de red** y coherente con FR-026. Extenderlo al **tiempo agotado** sí introduce un riesgo (QA-12).

### Hallazgos nuevos

#### QA-11 · Media · Validación de entrada (FR-015) · previo a esta HU, fuera del diff

- **Ubicación**: `backend/app/features/offline_capture/schemas.py:73` (`dose_quantity: float | None = None`) y `rule_violations` (`event.dose_quantity <= 0`). El mismo código existe en `main` (HU-02).
- **Descripción**: Pydantic v2 acepta por defecto `"NaN"`, `"Infinity"` y `1e400` (que se convierte en `inf`) en un `float`. `NaN <= 0` es falso, así que `DOSE_NOT_POSITIVE` no salta. SQLite guarda `NaN` como `NULL`. Resultado: cualquier OPERARIO o VETERINARIO autenticado puede registrar una **vacunación sin dosis** (se salta `DOSE_REQUIRED`) o con **dosis infinita**, con cualquier `origin` y **sin** marca `requires_data_review` cuando es `OFFLINE_CAPTURE`. Afecta a la trazabilidad sanitaria y al cálculo posterior de tiempos de retiro (constitución §3). El validador del cliente tampoco rechaza `"Infinity"` (F9).
- **Evidencia** (HTTP real con `TestClient`, `probe_http_nan.py`):
  ```
  H1 HTTP doseQuantity='NaN' -> 200 SINCRONIZADO | dose_quantity guardada: None
  H1 HTTP doseQuantity='Infinity' -> 200 SINCRONIZADO | dose_quantity guardada: inf
  H1 HTTP doseQuantity='1e400' -> 200 SINCRONIZADO | dose_quantity guardada: inf
  ```
- **Recomendación**: `dose_quantity: float | None = Field(default=None, allow_inf_nan=False)` (o `allow_inf_nan=False` en `model_config`) y, opcionalmente, un tope de negocio (`le=...`). En el cliente, `Number.isFinite(quantity) && quantity > 0`. Añadir pruebas negativas con `"NaN"`, `"Infinity"` y `1e400`. Es un cambio de una línea en un módulo del mismo integrante: conviene incluirlo en este PR, o como muy tarde antes de integrar a `main`.

#### QA-12 · Baja · Reintentos / Observabilidad (FR-026, FR-028)

- **Ubicación**: `frontend/src/features/offline-sync/batchResult.js` (`response.transportError` → `baseState`) junto con `syncTransport.js:26` (`AbortError` → `TIMEOUT`); research R5, fila "Tiempo agotado (30 s) / error de red".
- **Descripción**: el tiempo agotado se trata igual que un corte de red: vuelve a `pending` sin `attempts`, sin espera y **sin motivo visible** (`error_code null`). Si `/health` responde pero `POST /offline-sync/batches` tarda más de 30 s (servidor saturado, lote pesado, proxy), cada disparo del temporizador (30 s) reenvía el lote completo de 50 sin backoff ni variación aleatoria, para siempre, y el operario solo ve "Pendiente". Es el escenario de "eventos en `pending` para siempre", y además amplifica la carga del servidor cuando ya está lento, justo lo que R9 quería evitar. La idempotencia impide duplicados, por eso es Baja.
- **Evidencia** (`probe_frontend_v2.mjs`, F7, con `/health` OK y el POST que siempre aborta):
  ```
  F7 ... POST de 50 eventos en ~160 ms (timer 15 ms): 11 | status pending attempts 0 next_attempt_at null error_code null
  ```
- **Recomendación**: solo `NETWORK` debería contar como "sin conexión". Ante `TIMEOUT`, o ante cualquier `transportError` si la sonda `/health` responde justo después, tratarlo como transitorio con backoff (como 5xx). Como mínimo, guardar el último motivo para que la UI muestre algo más que "Pendiente".

#### QA-13 · Baja · Despliegue / Esquema (decisión D2)

- **Ubicación**: `backend/app/features/offline_sync/models.py` (columna nueva `requires_data_review`), `backend/app/main.py:39` (`create_all`) y `service.py` (`except OperationalError` → `STORAGE_BUSY` reintentable).
- **Descripción**: con una base creada en esta rama antes de la corrección, `create_all` no añade la columna, cada inserción lanza `OperationalError: no such column` y el servidor responde `FALLIDO STORAGE_BUSY retryable=true` para **todos** los eventos. El dispositivo los reintenta sin fin con un motivo engañoso. Afecta solo a bases creadas desde esta rama (`main` no tiene la tabla), pero incluye la `backend/bovinotech.db` actual del desarrollador y la de cualquiera que haya probado el PR #9.
- **Evidencia** (`probe_backend_v2.py`, V13, con una copia de la base sin la columna):
  ```
  V13 columna tras create_all en BD antigua: False
  V13 intento 1 en BD antigua -> [('FALLIDO', STORAGE_BUSY, True), ('FALLIDO', STORAGE_BUSY, True)]
  V13 intento 2 en BD antigua -> [('FALLIDO', STORAGE_BUSY, True), ('FALLIDO', STORAGE_BUSY, True)]
  ```
- **Recomendación**: seguir el patrón ya existente y añadir `ensure_offline_sync_schema(engine)` (`ALTER TABLE offline_sync_events ADD COLUMN requires_data_review BOOLEAN NOT NULL DEFAULT 0` si falta), invocado en `main.py` junto a los otros `ensure_*`. Son unas 15 líneas con su prueba, y la nota de `quickstart.md` deja de ser necesaria. Si no se hace, al menos regenerar la base local antes de las pruebas manuales del quickstart.

#### QA-14 · Info · Controlador (cambio de sesión)

- **Ubicación**: `frontend/src/features/offline-sync/syncController.js` (relanzamiento solo si `summary.stop_reason === 'session_changed'`).
- **Descripción**: si B inicia sesión mientras sale el **último** lote de A (`queue_empty`) o un lote que acaba en `auth_paused`, `offline` o `server_error`, la ejecución que dispara `setSession(B)` se salta por el cerrojo y no se relanza. Los eventos de B esperan al siguiente tic del temporizador (≤ 30 s). No hay pérdida ni fallos (F2: B sin estado, es decir, pendiente; F3: A queda `pending` por 401 y B espera).
- **Evidencia**: `F2 lotes: tok-A:a:10 | ... B={"sin_estado":5} | lastRun.stop: queue_empty`.
- **Recomendación**: relanzar cuando `!sameSession(session, runSession)` sin importar el `stop_reason`. Opcional.

### Búsqueda de regresiones y bypass (sin hallazgos)

- **Campos de servidor enviados por el cliente** (V10): `requiresDataReview`, `requiresTimestampReview`, `receivedAt`, `authorVerificationResult`, `validationStatus`, `syncStatus`, `payloadHash`, `batchLogId`, `id` y `requires_data_review` en snake_case se ignoran. La fila queda con valores del servidor.
- **`origin` fuera del literal** (`"legacy"`, `"ADMIN"`): `VALIDATION_ERROR` (V12).
- **Idempotencia de `LEGACY`**: el duplicado conserva `requiresDataReview` (prueba `test_duplicate_of_a_legacy_event_keeps_the_review_flag`), y cambiar `origin` con el mismo id es un conflicto auditado (V11).
- **Carreras del controlador**: con cierre de sesión a mitad (F4) no se envía nada más. Con el cambio a B el token nunca se mezcla (F1). El cerrojo evita dos ejecuciones simultáneas, y la recursión `run('login')` solo avanza con nuevos cambios de sesión hechos por el usuario.
- **Append-only, autorización y secretos**: sin cambios respecto a la auditoría original. Ningún `UPDATE` ni `DELETE` nuevo, y ningún token quemado (el token ya no vive en estado de módulo).

### Veredicto actualizado

**APROBADO CON OBSERVACIONES.** Los dos hallazgos Medios de esta HU (QA-01 y QA-02) y los Bajos QA-06 y QA-07 están corregidos y probados, y las cinco verificaciones están en verde (213 + 129 pruebas, pytest en 47,57 s). Queda abierto QA-11 (Media): es un defecto previo de HU-02, pero se explota a través de este endpoint y es de una línea. Recomiendo corregirlo en este mismo PR antes de integrar a `main`. QA-12 y QA-13 (Baja) conviene resolverlos o registrarlos como riesgos aceptados en `plan.md`. QA-14 es opcional.

## Re-verificación 2 (2026-11-24, QA-11 a QA-14)

| Campo | Valor |
|---|---|
| Alcance | Árbol de trabajo sobre `465ef59` (sin commit): correcciones de QA-11, QA-12 y QA-13, y QA-14 como riesgo aceptado en `plan.md` |
| Agente | `qa-seguridad` (verificación independiente) |
| Sondas | Scratchpad de la sesión, fuera del repo: `probe_http_nan.py`, `probe_backend_v2.py`, `probe_frontend_v2.mjs` (las mismas de antes, sin cambios) y `probe_migration_v3.py` (nueva, para QA-13). Las sondas de Python se ejecutaron con el directorio de trabajo en el scratchpad, así que `./bovinotech.db` se resolvió a una copia desechable y no a `backend/bovinotech.db`. |

### Verificaciones ejecutadas

| Comando | Resultado |
|---|---|
| `cd backend && .venv/bin/python -m pytest -q` | **233 passed**, 1 warning (deprecación de anyio en starlette, ajena al PR) en **48,44 s** (`real` 49,25 s; < 90 s ✔). Antes: 213. |
| `cd backend && .venv/bin/bandit -r app -ll` | Medium 0 / High 0 (7 Low filtradas por `-ll`, las mismas de siempre). `schema_migration.py` no genera el aviso B608. |
| `cd frontend && node --test 'src/features/offline-sync/*.test.js' 'src/features/offline-capture/*.test.js'` | **134 tests, 134 pass, 0 fail**. Antes: 129. |
| `cd frontend && npm run lint` | Sin errores ni avisos |
| `cd frontend && npm run build` | OK (79 módulos, `index-*.js` 324,67 kB / 96,64 kB gzip) |
| `git diff --stat backend/app/main.py` | `2 insertions(+)`, 0 líneas eliminadas: el import de `ensure_offline_sync_schema` y su llamada justo después de `ensure_sinigan_sync_schema(engine)`. Cumple la constitución §2 (solo se añaden líneas). |

### Estado de los hallazgos

| ID | Gravedad | Estado | Evidencia |
|---|---|---|---|
| QA-01 | Media | Corregido, sin regresión | V2–V8 siguen en `FALLIDO VALIDATION_ERROR`. V1 y V6 (`LEGACY` legítimo) siguen en `SINCRONIZADO` con `requires_data_review = true`. V10, V11 y V12 sin cambios. F9 en el cliente igual. |
| QA-02 | Media | Corregido, sin regresión | F1: lotes `tok-A:a:50`, después `tok-B:b:5`. A queda con 50 `synced` y 70 sin tocar, B con 5 `synced`, ningún fallo definitivo. F4: el cierre de sesión a mitad detiene el envío tras 1 lote. F8: `AUTHOR_MISMATCH` propio sigue siendo definitivo. |
| QA-03 | Baja | Riesgo aceptado (`plan.md`) | Sin cambios. |
| QA-04 | Baja | Riesgo aceptado (`plan.md`) | Sin cambios. |
| QA-05 | Baja | Riesgo aceptado (`plan.md`) | Sin cambios. |
| QA-06 | Baja | Corregido, sin regresión | F5: 1 petición tras el 401 en unos 110 ms, `syncNow()` devuelve `null` y se reanuda con el token nuevo. |
| QA-07 | Baja | Corregido, sin regresión | F6: tras un error de red, `pending`, `attempts 0`, `next_attempt_at null`. |
| QA-08 | Info | Riesgo aceptado (`plan.md`) | Sin cambios. |
| QA-09 | Info | Corregido | Sin cambios. |
| QA-10 | Info | Parcial | Se añaden pruebas para TIMEOUT (`batchResult.test.js`, `syncTransport.test.js`), NaN e infinito (backend y cliente) y la migración (`test_offline_sync_schema_migration.py`). Sigue sin probarse el disparo por el evento `online`. |
| QA-11 | Media | **Corregido** | HTTP real (`probe_http_nan.py`): `"NaN"`, `"Infinity"` y `1e400` → `200 FALLIDO VALIDATION_ERROR` (el detalle de campo es `INVALID_FIELD`), sin fila guardada. Antes: `SINCRONIZADO` con `None` o `inf`. V9: lo mismo con `-Infinity` y con `origin` `LEGACY`. Cliente (F9): `Infinity` → `DOSE_NOT_POSITIVE`. `hashing.py` usa `allow_nan=False` como defensa en profundidad. Como `CapturedEvent` es compartido, el endpoint preliminar de HU-02 también queda protegido. Ver QA-15. |
| QA-12 | Baja | **Corregido** | F7 (`/health` OK, el POST siempre aborta): **1** POST en unos 160 ms con el temporizador a 15 ms (antes 11). El estado queda `failed`, `attempts 1`, `next_attempt_at` con espera y `error_code TIMEOUT`, visible para el operario. El error de red mantiene el comportamiento de QA-07 (F6). |
| QA-13 | Baja | **Corregido** | `probe_migration_v3.py`, con una base antigua que tiene una fila previa: M1, la única sentencia de escritura emitida es `ALTER TABLE offline_sync_events ADD COLUMN requires_data_review BOOLEAN NOT NULL DEFAULT 0`, sin UPDATE, DELETE, DROP ni INSERT. Una segunda llamada no hace nada. M2: la columna existe. M3: la fila previa queda intacta y la columna nueva vale 0. M4: tras la migración, un lote con `OFFLINE_CAPTURE`, `LEGACY` y NaN da `SINCRONIZADO`, `SINCRONIZADO`, `FALLIDO VALIDATION_ERROR` (antes: `STORAGE_BUSY` sin fin). M5: si la tabla no existe, no se emite ninguna escritura. Inyección SQL: el f-string solo interpola las constantes del módulo `EVENTS_TABLE` y `ADDED_EVENT_COLUMNS`, que nunca vienen de una entrada. La V13 original sigue mostrando `STORAGE_BUSY`, porque solo ejecuta `create_all` y no llama al helper. Es lo esperado. |
| QA-14 | Info | Riesgo aceptado (`plan.md`, tabla de riesgos) | F2 se reproduce igual (`lastRun.stop: queue_empty`, B queda pendiente hasta el siguiente tic, ≤ 30 s). La justificación es adecuada: no hay pérdida, duplicados ni fallos definitivos. |

### Hallazgos nuevos

#### QA-15 · Info · Validación de entrada (dosis sin tope de negocio)

- **Ubicación**: `backend/app/features/offline_capture/schemas.py` (`dose_quantity`) y `eventValidation.js`.
- **Descripción**: los valores finitos pero absurdos se aceptan. V9: `doseQuantity = 1e308` con `OFFLINE_CAPTURE` → `SINCRONIZADO`, guardado tal cual y **sin** `requires_data_review`. No rompe ninguna regla de FR-015 vigente ni el hash, pero es un dato sanitario inverosímil que no pasa por revisión. La recomendación de QA-11 ya proponía un tope (`le=...`) como opcional.
- **Recomendación**: si negocio lo define, añadir un máximo por unidad (por ejemplo `le=10_000`) en el servidor y en el cliente. Puede quedar para HU-04 (revisión veterinaria). No bloquea.

#### QA-16 · Info · Entorno de pruebas (base real tocada por pytest)

- **Ubicación**: `backend/tests/conftest.py` (`from app.main import app`) junto con `app/core/database.py` (`sqlite:///./bovinotech.db`, ruta relativa).
- **Descripción**: al importar `app.main`, se ejecutan `create_all`, los `ensure_*` y los seeds contra `./bovinotech.db`. Con pytest lanzado desde `backend/`, esa ruta es la base de desarrollo real. Ahora incluye el `ALTER TABLE` de QA-13, que es lo que observó el implementador. El patrón es previo a esta HU (los `ensure_auth_schema` y `ensure_sinigan_sync_schema` ya lo hacían) y la operación solo añade la columna, sin tocar filas: `backend/bovinotech.db` tiene `requires_data_review` y 0 filas en `offline_sync_events`.
- **Recomendación**: en otra HU transversal, leer la URL de una variable de entorno (`DATABASE_URL`) y fijarla en memoria en `conftest.py` antes de importar `app.main`. Fuera del alcance de este PR, porque `database.py` y `conftest.py` son compartidos.

### Búsqueda de regresiones (sin hallazgos)

- Los campos de servidor enviados por el cliente se siguen ignorando (V10), y `origin` fuera del literal da `VALIDATION_ERROR` (V12).
- No hay ningún `UPDATE` ni `DELETE` nuevo en `offline_sync` ni en `offline_capture`. La migración solo hace DDL aditivo.
- No hay secretos ni tokens en el diff. El transporte sigue recibiendo el token por llamada.

### Veredicto final

**APROBADO.** Los hallazgos de gravedad Media y Baja de esta HU están corregidos o registrados como riesgos aceptados en `plan.md`, y ninguno se reproduce con las sondas independientes. QA-11, QA-12 y QA-13 están corregidos y probados, y QA-14 está aceptado con una justificación adecuada. Las cinco verificaciones están en verde: 233 pruebas de backend en 48,44 s, 134 de frontend, bandit sin Medium ni High, lint limpio y build correcto. `main.py` solo añade líneas. Los nuevos QA-15 y QA-16 son Info y no bloquean. Recomiendo hacer commit de los cambios y push al PR #9. La integración a `main` queda sujeta a la aprobación humana (constitución §5.2).
