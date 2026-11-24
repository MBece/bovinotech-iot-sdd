---
description: "Tareas de implementación de la HU-03 (offline_sync) bajo SDD + TDD y Vertical Slicing"
---

# Tareas de Implementación: Sincronización por lotes, idempotencia y reintentos controlados (HU-03)

**Entrada**: documentos de diseño en `specs/003-offline-batch-sync/`

**Prerrequisitos**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/offline-sync-api.md](contracts/offline-sync-api.md), [contracts/sync-batch.cases.json](contracts/sync-batch.cases.json), [quickstart.md](quickstart.md)

**Metodología TDD obligatoria**: cada prueba se escribe primero y se verifica que falle antes de implementar (constitución §2).

**Organización**: por historia de usuario de [spec.md](spec.md) (US1 a US4), para entregarlas y probarlas por separado.

## Convención de formato: `[ID] [P?] [Historia] Descripción`

- **[P]**: paralelizable (archivos distintos, sin dependencias pendientes).
- **[Historia]**: US1, US2, US3 o US4.

## Convenciones de rutas y comandos

- Backend: `backend/app/features/offline_sync/`; pruebas en `backend/tests/{unit,contract,security}/test_offline_sync_*.py`.
- Frontend: `frontend/src/features/offline-sync/`; pruebas `*.test.js` junto al código.
- Comandos: `cd backend && .venv/bin/python -m pytest -q` y `cd frontend && node --test 'src/features/offline-sync/*.test.js'`. Node 22 exige el patrón glob entre comillas.
- Archivos compartidos (solo se añaden líneas): `backend/app/main.py` y `frontend/src/App.jsx`. `package.json`, `ci.yml` y `conftest.py` no se tocan.
- Reutilización sin modificar (§2):
  - `CapturedEvent`, `error_codes_from` y el contexto `allow_future_timestamp` de `backend/app/features/offline_capture/schemas.py` (R1, R6);
  - `get_current_user_for_sync`, `verify_pending_author` y `record_sync_rejection` de `backend/app/features/auth/sync_support.py` (R7);
  - el modelo `SanitaryEvent`, solo para leerlo (R2);
  - `captureRepository` de `frontend/src/features/offline-capture/captureServices.js` (R1).
- Las pruebas de contrato crean sus propios eventos y obtienen el token con `POST /auth/login` (usuarios semilla de la HU-01, contraseña `password123`), igual que `backend/tests/contract/test_offline_capture_catalog_api.py`.

---

## Fase 1: Preparación del módulo aislado

**Propósito**: estructura de los dos módulos y punto de partida verde.

- [X] T001 Confirmar que la rama `feat/hu-03-offline-sync` parte de `main` con la HU-02 fusionada y que `pytest` (150 pruebas) y `node --test 'src/features/offline-capture/*.test.js'` (69) pasan antes de empezar (research R1)
- [X] T002 [P] Crear el paquete vacío `backend/app/features/offline_sync/` (`__init__.py`, `models.py`, `schemas.py`, `hashing.py`, `authorization.py`, `repository.py`, `service.py`, `router.py`) según plan.md (Estructura)
- [X] T003 [P] Crear la carpeta `frontend/src/features/offline-sync/` y comprobar que `node --test 'src/features/offline-sync/*.test.js'` la recorre desde `frontend/` (research R12)

No hace falta seed propio: los eventos llegan del cliente y las pruebas los generan (plan, §2 Desacoplamiento).

---

## Fase 2: Fundamentos (bloquea todas las historias)

**Propósito**: tablas, contrato de la API, huella de contenido, reglas de autorización por evento y almacén local de estado. Lo necesitan las 4 historias.

**⚠️ CRÍTICO**: ninguna historia empieza hasta completar esta fase.

### Pruebas (escribir primero, deben fallar) 🔴

- [X] T004 [P] Prueba de la huella en `backend/tests/unit/test_offline_sync_hashing.py`:
  - es estable aunque cambie el orden de las claves o la zona horaria (misma hora en UTC);
  - cambia si cambia cualquier campo de negocio;
  - **no** cambia con `syncStatus` ni con `validationStatus` (R3).
- [X] T005 [P] Prueba de las reglas de autorización en `backend/tests/unit/test_offline_sync_authorization.py`, con usuarios en memoria:
  - `AUTHOR_MISMATCH` si `authorEmail` difiere del usuario;
  - `FARM_NOT_ALLOWED` si `farmId` no está en `user.farm_ids`, aunque sea una finca distinta de la activa pero propia (se acepta);
  - `AUTHOR_DISABLED` solo para eventos posteriores a `disabled_at`;
  - un evento capturado **antes** del `token_iat` actual se acepta: no se usa `was_user_active_at` (R7);
  - `author_verification_result` es `VERIFIED` o `UNVERIFIED` solo cuando `authorVerificationPending` es verdadero.
- [X] T006 [P] Prueba de los esquemas en `backend/tests/unit/test_offline_sync_schemas.py`:
  - `SyncBatchRequest` acepta de 1 a 50 elementos como diccionarios sin validar su forma, y rechaza 0 o 51 (R4, R11);
  - `SyncItemResult` y `SyncBatchResponse` se serializan en camelCase con los campos de contracts/offline-sync-api.md §1.
- [X] T007 [P] Prueba del repositorio de estado local en `frontend/src/features/offline-sync/syncStateRepository.test.js`, con almacenamiento en memoria:
  - `getStatusMap()` devuelve un `Map` por `client_event_id`;
  - `saveStates()` escribe varios estados en una sola operación;
  - `recordRun()` conserva solo las últimas 20 ejecuciones;
  - no existe ninguna operación que borre o modifique eventos de la HU-02.

### Implementación (Green Phase) 🟢

- [X] T008 [P] Crear en `backend/app/features/offline_sync/models.py`:
  - `OfflineSyncEvent` según data-model.md: `offline_sync_events.client_event_id` (UNIQUE), `offline_sync_events.payload_hash`, `offline_sync_events.event_type`, `offline_sync_events.din`, `offline_sync_events.field_occurred_at`, `offline_sync_events.received_at`, `offline_sync_events.product`, `offline_sync_events.dose_quantity`, `offline_sync_events.dose_unit`, `offline_sync_events.reason`, `offline_sync_events.finding`, `offline_sync_events.notes`, `offline_sync_events.author_email`, `offline_sync_events.farm_id`, `offline_sync_events.origin`, `offline_sync_events.validation_status`, `offline_sync_events.author_verification_pending`, `offline_sync_events.author_verification_result`, `offline_sync_events.requires_timestamp_review`, `offline_sync_events.batch_log_id`, más el índice compuesto (`farm_id`, `din`, `field_occurred_at`);
  - `OfflineSyncIdConflict`: `offline_sync_id_conflicts.client_event_id`, `offline_sync_id_conflicts.existing_event_id`, `offline_sync_id_conflicts.existing_payload_hash`, `offline_sync_id_conflicts.received_payload_hash`, `offline_sync_id_conflicts.received_payload`, `offline_sync_id_conflicts.sender_email`, `offline_sync_id_conflicts.detected_at`;
  - `OfflineSyncBatchLog`: `offline_sync_batch_log.user_email`, `offline_sync_batch_log.active_farm_id`, `offline_sync_batch_log.received_at`, `offline_sync_batch_log.duration_ms`, `offline_sync_batch_log.items_total`, `offline_sync_batch_log.synced_count`, `offline_sync_batch_log.duplicate_count`, `offline_sync_batch_log.failed_retryable_count`, `offline_sync_batch_log.failed_final_count`;
  - sin llaves foráneas contra tablas de otras HU (§2).
- [X] T009 [P] Implementar `canonical_payload_hash(event: CapturedEvent) -> str` en `backend/app/features/offline_sync/hashing.py`: SHA-256 del JSON canónico (`sort_keys`, separadores compactos, fechas en UTC ISO-8601) de los campos de negocio del `CapturedEvent`, excluyendo `syncStatus` y `validationStatus` (R3). Hace pasar T004.
- [X] T010 [P] Implementar en `backend/app/features/offline_sync/schemas.py`:
  - `SyncBatchRequest` (`items: list[dict]`, de 1 a 50);
  - `SyncItemResult` (`index`, `clientEventId`, `status` ∈ `SINCRONIZADO|DUPLICADO|FALLIDO`, `retryable`, `errorCode`, `detail`, `receivedAt`, `requiresTimestampReview`);
  - `SyncBatchResponse` (`batchId`, `serverTime`, `results`);
  - el enum `ErrorCode` y los mensajes en español de contracts/offline-sync-api.md §1 («Códigos `errorCode` y mensajes»).

  Hace pasar T006.
- [X] T011 Implementar `authorize_event(user, event) -> ErrorCode | None` y `author_verification_result(user, event) -> str | None` en `backend/app/features/offline_sync/authorization.py`. Usa `user.farm_ids`, `user.disabled_at` y `verify_pending_author` de `auth/sync_support.py`, según R7 y data-model.md `offline_sync_events.author_verification_result`. Hace pasar T005 (depende de T008).
- [X] T012 [P] Implementar `frontend/src/features/offline-sync/syncDbSchema.js` (base `bovinotech_offline_sync_queue`) y `frontend/src/features/offline-sync/syncStateRepository.js`, con almacenamiento inyectable y adaptador IndexedDB propio:
  - almacén `queue_state` según data-model.md `queue_state.client_event_id`, `queue_state.author_email`, `queue_state.timestamp_utc`, `queue_state.status`, `queue_state.failure_kind`, `queue_state.error_code`, `queue_state.error_message`, `queue_state.attempts`, `queue_state.next_attempt_at`, `queue_state.confirmed_at`, `queue_state.server_received_at` y `queue_state.requires_timestamp_review`, con los índices `byStatus` y `byOwner`;
  - almacén `runs` según data-model.md `runs.started_at`, `runs.finished_at`, `runs.trigger`, `runs.batches`, `runs.synced`, `runs.duplicate`, `runs.failed_transient`, `runs.failed_final` y `runs.stop_reason`.

  Hace pasar T007. No reutiliza la base de la HU-02 (R8).

**Punto de control**: `pytest -k offline_sync` y `node --test 'src/features/offline-sync/*.test.js'` en verde con los fundamentos.

---

## Fase 3: Historia de Usuario 1 - Envío automático por lotes al recuperar la conexión (Prioridad: P1) 🎯 MVP

**Objetivo**: al recuperar la conexión, el dispositivo envía sus pendientes en lotes de 50, del más antiguo al más reciente. El servidor los registra con su hora original y responde un resultado por evento.

**Prueba independiente**: 10 eventos pendientes, servidor disponible y reconexión simulada. Quedan 10 `synced` en el dispositivo y 10 filas en `offline_sync_events` con su `field_occurred_at` original (spec, US1; quickstart §2, pasos 3–4 y 7).

### Pruebas Automatizadas TDD (Red Phase) 🔴

- [X] T013 [P] [US1] Prueba de contrato en `backend/tests/contract/test_offline_sync_batches_api.py`:
  - caso `AC1_batch_mixed_states` de `contracts/sync-batch.cases.json` (criterio 1);
  - lote válido de 10 → 10 `SINCRONIZADO` con `receivedAt`;
  - `results` en el mismo orden que `items`, con `index`;
  - `fieldOccurredAt` guardado tal cual;
  - `syncStatus` del cliente ignorado;
  - una fila en `offline_sync_batch_log` por petición con los conteos correctos (FR-029).
- [X] T014 [P] [US1] Prueba del servicio en `backend/tests/unit/test_offline_sync_service.py`:
  - evento con `fieldOccurredAt` 10 min en el futuro → `SINCRONIZADO` con `requires_timestamp_review = true` (caso `future_timestamp_is_kept`, FR-017b, R6);
  - evento inválido no bloquea el lote (caso `invalid_item_does_not_block_batch`, `VALIDATION_ERROR`);
  - evento `LEGACY` sin producto → `SINCRONIZADO`;
  - `author_verification_pending` y `validation_status` se conservan tal como llegan (FR-018).
- [X] T015 [P] [US1] Prueba de seguridad en `backend/tests/security/test_offline_sync_security.py`:
  - sin token → 401; `DIRECTIVO` y `ADMINISTRADOR` → 403;
  - `authorEmail` ajeno → `AUTHOR_MISMATCH` sin guardar (caso `author_mismatch`);
  - finca ajena → `FARM_NOT_ALLOWED`;
  - usuario deshabilitado después del token: los eventos anteriores a `disabled_at` se guardan, los posteriores → `AUTHOR_DISABLED` y se llama a `record_sync_rejection`;
  - ningún código del módulo emite `UPDATE` ni `DELETE` sobre `offline_sync_events` (inspección del módulo + intento de reenvío con cambios que deja la fila intacta).
- [X] T016 [P] [US1] Prueba de selección y lotes en `frontend/src/features/offline-sync/queueSelection.test.js`:
  - `selectDueEvents` toma los eventos de la HU-02 del usuario sin estado o en `pending`, excluye `synced`, `duplicate` y `failed/final`, y ordena por `fieldOccurredAt` y luego `clientEventId`;
  - `chunkBatches` parte 120 eventos en 50 + 50 + 20 (R11).
- [X] T017 [P] [US1] Prueba del motor en `frontend/src/features/offline-sync/syncEngine.test.js`, con transporte, reloj y almacenamiento falsos:
  - 10 pendientes → un lote → 10 `synced` con `confirmed_at` y `server_received_at`;
  - 120 pendientes → 3 lotes secuenciales;
  - los eventos pasan por `syncing` mientras se envían;
  - `recoverInterrupted` devuelve `syncing` a `pending` al arrancar (FR-005);
  - simulación de corte de 24 h con 200 eventos contra un servidor falso con almacén único: 200 confirmados, 0 perdidos, 0 duplicados (criterio 2, SC-001);
  - el motor nunca llama a operaciones de escritura del repositorio de la HU-02 (FR-007).

### Implementación Backend (Green Phase) 🟢

- [X] T018 [US1] Implementar en `backend/app/features/offline_sync/repository.py`:
  - `insert_event()` dentro de `session.begin_nested()`, que devuelve el registro o lanza `IntegrityError` controlado;
  - `find_by_client_event_id()`;
  - `exists_in_preliminary_sync()`, lectura de `SanitaryEvent.client_event_id` (R2, R3);
  - `create_batch_log()` / `close_batch_log()`.

  Todo según data-model.md `offline_sync_events.client_event_id`, `offline_sync_events.received_at` y `offline_sync_batch_log.duration_ms`. No incluye métodos de actualizar ni borrar eventos (depende de T008).
- [X] T019 [US1] Implementar `process_batch(request, user, db, now)` en `backend/app/features/offline_sync/service.py`. Para cada elemento:
  1. `CapturedEvent.model_validate(item, context={"now": now, "allow_future_timestamp": True})`; si falla → `VALIDATION_ERROR` con los códigos de `error_codes_from`;
  2. `authorize_event`;
  3. marca `requires_timestamp_review` si `field_occurred_at > now + 5 min` (data-model.md `offline_sync_events.requires_timestamp_review`);
  4. `canonical_payload_hash` e inserción.

  Después registra el log del lote. Hace pasar T013, T014 y T015 en lo que no es idempotencia (depende de T009–T011 y T018).
- [X] T020 [US1] Implementar `POST /batches` en `backend/app/features/offline_sync/router.py`:
  - `get_current_user_for_sync` y comprobación de rol `OPERARIO`/`VETERINARIO` (403);
  - 422 para lotes vacíos o de más de 50;
  - `response_model=SyncBatchResponse` con alias camelCase.

  (Depende de T019.)
- [X] T021 [US1] Registrar en `backend/app/main.py`, añadiendo líneas al final de cada bloque: importación de `OfflineSyncEvent`, `OfflineSyncIdConflict` y `OfflineSyncBatchLog`, e `include_router(offline_sync_router, prefix="/offline-sync", tags=["Sincronización offline"])` (depende de T020).

### Implementación Frontend (Green Phase) 🟢

- [X] T022 [P] [US1] Implementar `frontend/src/features/offline-sync/queueSelection.js` (`selectDueEvents`, `chunkBatches`, puros). Hace pasar T016.
- [X] T023 [P] [US1] Implementar `frontend/src/features/offline-sync/syncTransport.js`:
  - `POST {API_URL}/offline-sync/batches` con `Authorization: Bearer`;
  - tiempo máximo de 30 s con `AbortController`;
  - devuelve `{ ok, status, body }` o `{ transportError: 'NETWORK' | 'TIMEOUT' }`, sin lanzar excepciones (R5, R11);
  - `fetchImpl` inyectable.
- [X] T024 [US1] Implementar `frontend/src/features/offline-sync/batchResult.js`: `applyBatchResult` para `SINCRONIZADO` → `synced` y `DUPLICADO` → `duplicate`, y `recoverInterrupted`. Según data-model.md `queue_state.status`, `queue_state.confirmed_at`, `queue_state.server_received_at` y `queue_state.requires_timestamp_review`. Las ramas de `FALLIDO` se completan en US3 (T036).
- [X] T025 [US1] Implementar `frontend/src/features/offline-sync/syncEngine.js`: `runSync({ trigger, manual })` con dependencias inyectadas (`captureRepository.getAll`, `syncStateRepository`, `transport`, `now`, `random`, `session`).
  - Flujo: recuperar interrumpidos → seleccionar → marcar `syncing` → enviar lotes secuenciales → aplicar resultados → `recordRun` con `runs.stop_reason` (data-model.md).
  - Hace pasar T017 (depende de T012, T022–T024).
- [X] T026 [US1] Implementar `frontend/src/features/offline-sync/connectivity.js` (evento `online` + sonda `GET /health` con 5 s de tiempo máximo) y `frontend/src/features/offline-sync/syncLock.js` (`navigator.locks.request('bovinotech-offline-sync', { ifAvailable: true })` con bandera en memoria como respaldo), según R10.
- [X] T027 [US1] Implementar `frontend/src/features/offline-sync/OfflineSyncProvider.jsx` y `frontend/src/features/offline-sync/index.js`:
  - el contexto arranca `recoverInterrupted` y escucha reconexión y nuevo inicio de sesión;
  - un temporizador de 30 s mientras hay conexión ejecuta `runSync` bajo `syncLock` (SC-004);
  - expone `useSyncStatus()` → `{ online, running, unconfirmedCount, lastRun, syncNow }` (contracts §2).

  (Depende de T025, T026.)
- [X] T028 [US1] Registrar `<OfflineSyncProvider>` en `frontend/src/App.jsx` envolviendo el contenido autenticado, con líneas añadidas y sin alterar las rutas existentes. El proveedor no ejecuta nada si el rol no es `OPERARIO` ni `VETERINARIO` (depende de T027).

**Punto de control**: US1 funciona sola (MVP). Al reconectar, los pendientes llegan una vez al servidor.

---

## Fase 4: Historia de Usuario 2 - Idempotencia ante reenvíos y respuestas perdidas (Prioridad: P1)

**Objetivo**: un evento reenviado (respuesta perdida, repetido en el lote o envío simultáneo) nunca crea un segundo registro. Un identificador reutilizado con otros datos se rechaza y queda auditado.

**Prueba independiente**: enviar un evento, descartar la respuesta y reenviarlo 100 veces. Siempre `DUPLICADO` y una única fila (spec, US2; SC-002).

### Pruebas Automatizadas TDD (Red Phase) 🔴

- [X] T029 [P] [US2] Ampliar `backend/tests/contract/test_offline_sync_batches_api.py` con:
  - caso `AC3_resend_after_lost_response` (criterio 3);
  - 100 reenvíos del mismo evento → siempre `DUPLICADO`, una fila y el mismo `receivedAt` original (SC-002);
  - caso `same_id_twice_in_batch` (`SINCRONIZADO` y luego `DUPLICADO`);
  - caso `legacy_event_already_in_preliminary_sync`: fila sembrada en `sanitary_events` → `DUPLICADO`, sin fila nueva en `offline_sync_events` (R2).
- [X] T030 [P] [US2] Prueba de conflicto y concurrencia en `backend/tests/security/test_offline_sync_idempotency.py`:
  - mismo `clientEventId` con otra dosis → `FALLIDO`, `retryable: false`, `CLIENT_EVENT_ID_CONFLICT`; la fila original intacta y una fila en `offline_sync_id_conflicts` con ambas huellas y el remitente (FR-013);
  - dos sesiones de base de datos que insertan el mismo `client_event_id` → una sola fila; el perdedor obtiene `DUPLICADO` (HU2-E3, R3).
- [X] T031 [P] [US2] Ampliar `frontend/src/features/offline-sync/syncEngine.test.js`:
  - un corte a mitad de respuesta (el servidor falso guarda pero el transporte devuelve `NETWORK`) deja los eventos pendientes, y el siguiente `runSync` los confirma como `duplicate`;
  - `synced` y `duplicate` nunca se reenvían (SC-003).

### Implementación (Green Phase) 🟢

- [X] T032 [US2] Completar `process_batch` en `backend/app/features/offline_sync/service.py`:
  - antes de insertar, si `exists_in_preliminary_sync` → `DUPLICADO`;
  - al chocar con la restricción única, leer el registro y comparar `offline_sync_events.payload_hash` (data-model.md): igual → `DUPLICADO` con su `receivedAt`; distinta → `CLIENT_EVENT_ID_CONFLICT` e inserción en `offline_sync_id_conflicts` según data-model.md `offline_sync_id_conflicts.received_payload`.

  Hace pasar T029 y T030 (depende de T019).
- [X] T033 [US2] Ajustar `frontend/src/features/offline-sync/syncEngine.js` si hace falta para que T031 pase: lo enviado sin respuesta vuelve a `pending` sin perder el `client_event_id`, y no se reenvían estados finales.

**Punto de control**: US1 y US2 juntas. Cero duplicados ante cualquier reenvío.

---

## Fase 5: Historia de Usuario 3 - Resultados parciales y reintentos progresivos (Prioridad: P2)

**Objetivo**: los fallos transitorios quedan en cola y se reintentan con espera exponencial (2 s, el doble cada vez, tope de 15 min, ±50 %) sin abandonarse nunca. Los fallos definitivos quedan visibles y no se reintentan. Un 401 pausa el envío sin gastar intentos.

**Prueba independiente**: lote de 10 con 2 fallos transitorios inyectados. 8 confirmados, solo 2 en cola, y se confirman en reintentos posteriores (spec, US3; criterio 4; SC-003, SC-007).

### Pruebas Automatizadas TDD (Red Phase) 🔴

- [X] T034 [P] [US3] Prueba de fallo transitorio por evento en `backend/tests/unit/test_offline_sync_service.py`, con un repositorio inyectado que lanza `OperationalError` para dos `client_event_id`: caso `AC4_two_of_ten_transient` → 8 `SINCRONIZADO` y 2 `FALLIDO` con `retryable: true` y `STORAGE_BUSY`; las 8 filas persisten (criterio 4, FR-014).
- [X] T035 [P] [US3] Prueba de `computeRetryDelay` en `frontend/src/features/offline-sync/retryPolicy.test.js`:
  - con `random = 0.5`: 2 s, 4 s, 8 s… hasta 15 min;
  - la cota inferior crece estrictamente hasta el tope;
  - el resultado está siempre entre 0,5 y 1,5 veces la base;
  - simulación de 100 dispositivos con semillas distintas: ningún segundo concentra más del 10 % de los reintentos (SC-007).
- [X] T036 [P] [US3] Prueba de `applyBatchResult` en `frontend/src/features/offline-sync/batchResult.test.js`, recorriendo `contracts/sync-batch.cases.json`:
  - `FALLIDO` con `retryable: true` → `failed/transient`, `attempts + 1`, `next_attempt_at` calculado;
  - `retryable: false` → `failed/final` sin `next_attempt_at`;
  - casos `network_error_whole_batch` y 5xx/429 → todo el lote transitorio;
  - caso `unauthorized_pauses` (401/403) → `pending` sin incrementar `attempts`;
  - confirmación tras reintento → `attempts = 0` (FR-024).
- [X] T037 [P] [US3] Ampliar `frontend/src/features/offline-sync/syncEngine.test.js`:
  - `selectDueEvents` excluye los `failed/transient` con `next_attempt_at` futuro salvo con `manual: true` (FR-002);
  - sin conexión no se ejecuta nada ni se consumen intentos (FR-026);
  - tras 401 el motor se detiene con `stop_reason = 'auth_paused'` y se reanuda en el disparador `login` (FR-020);
  - un 422 de lote parte el lote en mitades hasta aislar el evento problemático (R5).

### Implementación (Green Phase) 🟢

- [X] T038 [US3] En `backend/app/features/offline_sync/service.py`, capturar `OperationalError` por evento dentro de su *savepoint* → `FALLIDO`, `retryable: true`, `STORAGE_BUSY`, sin abortar el lote. Hace pasar T034 (depende de T032).
- [X] T039 [P] [US3] Implementar `computeRetryDelay(attempt, random)` en `frontend/src/features/offline-sync/retryPolicy.js` según R9 y data-model.md `queue_state.attempts`. Hace pasar T035.
- [X] T040 [US3] Completar `applyBatchResult` en `frontend/src/features/offline-sync/batchResult.js` con las ramas `FALLIDO` y los errores de transporte, según data-model.md `queue_state.failure_kind`, `queue_state.error_code`, `queue_state.error_message`, `queue_state.attempts` y `queue_state.next_attempt_at`, y la tabla de R5. Hace pasar T036 (depende de T024, T039).
- [X] T041 [US3] Completar en `frontend/src/features/offline-sync/syncEngine.js` y `queueSelection.js` el filtro por `next_attempt_at`, el modo manual, la pausa por 401/403, la suspensión sin conexión y la partición de lotes ante 422. Hace pasar T037 (depende de T040).

**Punto de control**: US1, US2 y US3. Ningún evento se pierde ni se abandona.

---

## Fase 6: Historia de Usuario 4 - Visibilidad del estado de sincronización (Prioridad: P3)

**Objetivo**:
- el monitor de conectividad muestra 🟢 Online / 🔴 Offline (Modo Campo), el número de eventos no confirmados y si hay un envío en curso;
- la bandeja y el detalle de la HU-02 muestran el estado real;
- los fallidos explican su motivo y su próximo intento.

**Prueba independiente**: con eventos en los cinco estados, el contador y las etiquetas coinciden con `queue_state` (spec, US4; quickstart §2, pasos 3–4 y 8).

### Pruebas Automatizadas TDD (Red Phase) 🔴

- [X] T042 [P] [US4] Prueba de `describeSyncState` en `frontend/src/features/offline-sync/syncStateLabels.test.js`:
  - textos exactos de UI-003 para `pending`, `syncing`, `synced`, `duplicate` y `failed`;
  - un fallido transitorio indica motivo, "Se reintentará automáticamente" y la hora aproximada del próximo intento;
  - un fallido definitivo indica motivo y "No se reintentará automáticamente" (FR-028);
  - `requires_timestamp_review` añade "Hora pendiente de revisión".
- [X] T043 [P] [US4] Prueba de `countUnconfirmed(events, statusMap, authorEmail)` en `frontend/src/features/offline-sync/syncStateLabels.test.js`: cuenta `pending`, `syncing`, `failed` y los eventos sin estado; excluye `synced` y `duplicate` (FR-027, data-model.md «Contador del monitor»).
- [X] T044 [P] [US4] Prueba del punto de extensión de la HU-02 en `frontend/src/features/offline-capture/pendingTray.test.js` y `eventDetailModel.test.js`:
  - `buildPendingTray` y `buildEventDetail` aceptan una opción `syncLabelOf(event)` que reemplaza la etiqueta de sincronización;
  - sin esa opción, el comportamiento y las 69 pruebas existentes no cambian.

### Implementación (Green Phase) 🟢

- [X] T045 [US4] Implementar `describeSyncState` y `countUnconfirmed` en `frontend/src/features/offline-sync/syncStateLabels.js`, según data-model.md `queue_state.status`, `queue_state.failure_kind`, `queue_state.error_message`, `queue_state.next_attempt_at` y `queue_state.requires_timestamp_review`. Hace pasar T042 y T043.
- [X] T046 [US4] Añadir la opción `syncLabelOf` a `frontend/src/features/offline-capture/pendingTrayModel.js` y `frontend/src/features/offline-capture/eventDetailModel.js`, sin cambiar el comportamiento por defecto. Hace pasar T044.

  Es el módulo de la HU-02, del mismo responsable; R8 preveía incorporarlo directamente si la HU-02 era propia.
- [X] T047 [P] [US4] Implementar `frontend/src/features/offline-sync/SyncStatusBadge.jsx`:
  - 🟢 Online / 🔴 Offline (Modo Campo);
  - "N sin sincronizar" e indicador "Enviando";
  - texto y no solo color (UI-003);
  - contraste WCAG AA (constitución §2.1).
- [X] T048 [P] [US4] Implementar `frontend/src/features/offline-sync/SyncNowButton.jsx` ("Sincronizar ahora", ≥ 48×48 px, deshabilitado sin conexión o durante un envío; FR-002, UI-001) y `frontend/src/features/offline-sync/FailedEventDetail.jsx` (motivo, tipo de fallo y próximo intento; FR-028).
- [X] T049 [US4] Conectar en `frontend/src/features/offline-capture/PendingTray.jsx` y `EventDetail.jsx` el estado real: `useSyncStatus()` aporta el mapa y `syncLabelOf` usa `describeSyncState`; mostrar `FailedEventDetail` para los fallidos (depende de T045–T048).
- [X] T050 [US4] Registrar `<SyncStatusBadge />` y `<SyncNowButton />` en el header de `frontend/src/App.jsx`, añadiendo líneas al final del bloque del header. Solo se muestran a `OPERARIO` y `VETERINARIO` (UI-002) (depende de T047, T048).

**Punto de control**: las 4 historias funcionan juntas.

---

## Fase 7: Pulido y transversales

- [X] T051 [P] Prueba de volumen del servicio en `backend/tests/unit/test_offline_sync_service.py`: 1.000 eventos en 20 lotes contra la base en memoria terminan holgadamente dentro del presupuesto de CI. Base de SC-005; marcar `slow` si supera 5 s.
- [X] T052 [P] Redactar `specs/003-offline-batch-sync/coordination.md` con las solicitudes del Seguimiento de Complejidad de plan.md:
  - la HU-04 debe leer `offline_sync_events`;
  - retirar `POST /sync/batches` y `sanitary-events/syncService.js` (enlazar a `specs/002-offline-capture/coordination-sanitary-events.md`, §2);
  - `npm test` en CI para `offline-sync`.
- [X] T053 [P] Revisión `qa-seguridad`:
  - `bandit -r app -ll` sin hallazgos;
  - sin secretos ni tokens en el código;
  - mensajes de error sin detalles internos (R14);
  - `queue_state` sin datos sanitarios;
  - la autorización por evento cubre autor, finca y usuario deshabilitado.
- [ ] T054 Validación final:
  - `pytest` completo en menos de 90 s;
  - `node --test 'src/features/offline-sync/*.test.js'` y `node --test 'src/features/offline-capture/*.test.js'`;
  - `npm run lint` y `npm run build`;
  - validación manual de [quickstart.md](quickstart.md) §2 (pasos 3 a 11).

---

## Dependencias y orden de ejecución

### Entre fases

- **Fase 1 (Preparación)**: T001 bloquea todo (la HU-02 debe estar fusionada).
- **Fase 2 (Fundamentos)**: depende de la Fase 1 y bloquea todas las historias.
- **US1 (Fase 3)**: depende de la Fase 2. Es el MVP.
- **US2 (Fase 4)**: depende de T019 (servicio) y T025 (motor) de US1, porque completa sus ramas de duplicado.
- **US3 (Fase 5)**: depende de T032 (US2) en el backend y de T024–T025 (US1) en el frontend.
- **US4 (Fase 6)**: depende de T027 (`useSyncStatus`, US1) y T040 (estados de fallo, US3). T042–T046 pueden empezar después de la Fase 2.
- **Pulido (Fase 7)**: al final. T052 puede redactarse en cualquier momento.

### Dentro de cada historia

Pruebas (rojo) → lógica pura / modelos → servicio → endpoint → componentes → integración en archivos compartidos.

### Oportunidades de paralelismo

- Fase 2: T004–T007 juntas; luego T008, T009, T010 y T012 juntas.
- US1: T013–T017 juntas; luego T022 y T023 en paralelo con el backend (T018–T021).
- US2: T029–T031 juntas.
- US3: T034–T037 juntas; T039 en paralelo con T038.
- US4: T042–T044 juntas; T047 y T048 en paralelo.
- Backend y frontend avanzan en paralelo en cada historia (archivos distintos).

## Ejemplo de paralelismo: Historia 1

```bash
# Pruebas de US1 juntas (rojo):
Tarea: "T013 Contrato POST /offline-sync/batches en test_offline_sync_batches_api.py"
Tarea: "T014 Servicio (fecha futura, inválido, LEGACY) en test_offline_sync_service.py"
Tarea: "T015 Seguridad (401/403, autor, finca, deshabilitado, append-only)"
Tarea: "T016 queueSelection.test.js"
Tarea: "T017 syncEngine.test.js (incluido corte de 24 h)"

# Implementación en paralelo (verde):
Tarea: "T018–T021 backend: repository → service → router → main.py"
Tarea: "T022 queueSelection.js" y "T023 syncTransport.js"
```

## Estrategia de implementación

### MVP primero (solo US1)

1. Fases 1 y 2.
2. Fase 3 (US1): los pendientes llegan al servidor al reconectar.
3. **Parar y validar**: quickstart §2, pasos 3, 4 y 7.

### Entrega incremental

1. Fundamentos → tablas, contrato, huella, autorización y estado local.
2. US1 → envío por lotes (MVP).
3. US2 → idempotencia completa y auditoría de conflictos.
4. US3 → reintentos progresivos y resultados parciales.
5. US4 → monitor de conectividad y estados reales en la bandeja.
6. Pulido → volumen, coordinación, QA y validación final.

## Notas

- Hacer commit al cerrar cada historia, con mensajes en inglés.
- No modificar `sanitary_events`, `auth`, `conftest.py`, `package.json` ni `ci.yml`. Esos cambios van por coordinación (T052).
- La única modificación fuera de `offline-sync` y de los puntos compartidos es el punto de extensión `syncLabelOf` de la HU-02 (T046, T049), del mismo responsable.
