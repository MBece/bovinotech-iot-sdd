# Plan de Implementación: Sincronización por lotes, idempotencia y reintentos controlados (HU-03)

**Rama**: `feat/hu-03-offline-sync` | **Fecha**: 2026-11-24 | **Spec**: [spec.md](spec.md)

**Entrada**: especificación funcional desde `specs/003-offline-batch-sync/spec.md`.

## Resumen

Cuando el dispositivo recupera la conexión, un motor de sincronización en el cliente envía los eventos capturados por la HU-02 en lotes de 50, del más antiguo al más reciente. El servidor responde un resultado por evento: `SINCRONIZADO`, `DUPLICADO` o `FALLIDO` (transitorio o definitivo).

**Servidor**: módulo nuevo `offline_sync`, con endpoint `POST /offline-sync/batches` y tabla propia `offline_sync_events`, de solo inserción.
- La idempotencia la garantiza una restricción única sobre `client_event_id`.
- Cada evento se procesa en su propio *savepoint*, así que el fallo de uno no arrastra a los demás.
- Una huella SHA-256 del contenido distingue un reenvío legítimo (`DUPLICADO`) de un identificador reutilizado con otros datos (rechazo y auditoría).

**Cliente**:
- Los eventos de la HU-02 nunca se tocan. El estado de sincronización vive en una base aparte (`bovinotech_offline_sync_queue`), así que nada se borra del dispositivo.
- Los fallos transitorios se reintentan con espera exponencial: 2 s, luego el doble cada vez, con tope de 15 min y ±50 % de variación aleatoria. Nunca se abandonan.
- Los fallos definitivos quedan visibles con su motivo.
- Un 401 pausa el envío sin consumir intentos.

## Contexto Técnico

**Lenguaje / Versiones**: Python 3.11 (backend); JavaScript ES2022 con React 19 + Vite 8 (frontend).

**Dependencias Principales**: FastAPI, Pydantic 2, SQLAlchemy 2.0 (existentes); React 19 (existente). **Sin dependencias nuevas**: SHA-256 con `hashlib`; Web Locks API e IndexedDB nativas del navegador.

**Almacenamiento**:
- Servidor: SQLite, tablas `offline_sync_events`, `offline_sync_id_conflicts` y `offline_sync_batch_log`, creadas con `create_all`.
- Cliente: IndexedDB `bovinotech_offline_sync_queue`, almacenes `queue_state` y `runs` (R8, R13).
- Lectura, sin escritura, de la base de la HU-02 mediante `captureRepository.getAll()`.

**Estrategia de Pruebas**:
- Backend: TDD con `pytest` (`unit/`, `contract/` y `security/` con prefijo `test_offline_sync_`).
- Frontend: `node --test 'src/features/offline-sync/*.test.js'` sobre módulos puros con transporte, almacenamiento, reloj y aleatoriedad inyectados.
- Casos compartidos: `contracts/sync-batch.cases.json`.

**Plataforma y Entorno**: API web + PWA offline-first en navegador móvil moderno.

**Tipo de proyecto**: aplicación web (backend + frontend).

**Objetivos de Rendimiento y SLOs**:
- Inicio de la sincronización en menos de 30 s tras reconectar (SC-004).
- 1.000 eventos confirmados en menos de 5 min con conexión rural estable (SC-005).
- 0 pérdidas, 0 duplicados e integridad del 99,9 % (SC-001, SC-002, SC-006).
- La captura sigue en menos de 2 s durante el envío (SC-008).
- Pipeline CI en menos de 90 s.

**Restricciones**:
- Append-only en el servidor y en el dispositivo.
- Ningún borrado sin confirmación (FR-007).
- Aislamiento modular (§2).

**Escala**: hasta 1.000 eventos pendientes por dispositivo; lote de 50 eventos (20 peticiones).

**Estándares de Calidad y Ciberseguridad**: ISO/IEC 25010:2023 (fiabilidad: tolerancia a fallos y recuperabilidad). Autor y finca validados contra el token (R7). Sin secretos nuevos. `bandit -ll` limpio.

**Sin NEEDS CLARIFICATION**: todo quedó resuelto en [research.md](research.md) (R1 a R14).

## Verificación de Constitución (Constitution Check)

*Compuerta: se evaluó antes de la Fase 0 y se revisó después de la Fase 1, sin cambios.*

| Principio | Estado | Cómo se cumple |
|---|---|---|
| §1 Idioma | ✅ | Documentos, mensajes y estados de interfaz en español; código, códigos de error y commits en inglés. `SINCRONIZADO`/`DUPLICADO`/`FALLIDO` son términos de negocio fijados por la HU |
| §2 Aislamiento modular | ⚠️ Justificado | Todo el código va en `backend/app/features/offline_sync/` y `frontend/src/features/offline-sync/`. Se **importan sin modificar** `CapturedEvent` y `captureRepository` (HU-02), `get_current_user_for_sync`, `verify_pending_author` y `record_sync_rejection` (HU-01), y el modelo `SanitaryEvent`, solo para leerlo (R2). Lo que requiere cambios en otros módulos se pide por coordinación (Seguimiento de Complejidad) |
| §2 Puntos compartidos | ✅ | `main.py`: importar los modelos y añadir `include_router(prefix="/offline-sync")` al final. `App.jsx`: envolver con `OfflineSyncProvider` y añadir `SyncStatusBadge` y `SyncNowButton` en el header, sin alterar rutas existentes |
| §2 Desacoplamiento | ✅ | `din`, `author_email` y `farm_id` sin llaves foráneas. No necesita seed propio: los eventos llegan del cliente |
| §2 QUÉ vs. CÓMO | ✅ | La spec no menciona tecnología; el CÓMO está en este plan |
| §2 TDD | ✅ | Pruebas primero en `backend/tests/` y en `node --test`; casos compartidos (R12) |
| §2.1 Sidebar y RBAC | ✅ | Sin entrada nueva en el menú (UI-002). El badge y el botón solo se muestran a `OPERARIO` y `VETERINARIO`; el servidor exige esos roles |
| §2.1 Monitor de conectividad | ✅ | `SyncStatusBadge` implementa 🟢 Online / 🔴 Offline (Modo Campo) con el contador de no confirmados (FR-027) |
| §2.1 Mobile-first y ergonomía | ✅ | Botón y detalle de fallidos de 48×48 px como mínimo, estados con texto, contraste WCAG AA (UI-001, UI-003) |
| §2.2 Almacenamiento offline | ⚠️ Justificado | Nombre `bovinotech_offline_sync_queue` y registros con `client_event_id`, `timestamp_utc` y `status`. El enum `status` se amplía con `synced` y `duplicate`, y no se guarda `payload` porque el evento ya vive en la HU-02 (R8) |
| §3 Append-only | ✅ | `offline_sync_events` solo admite `INSERT`, con una prueba de seguridad que lo verifica. En el dispositivo nunca se modifica ni se borra un evento capturado |
| §3 Jerarquía SINIGÁN | ✅ N/A | No se valida el DIN contra SINIGÁN (eso es la HU-05); no se sobrescriben datos oficiales |
| §3 Offline-first e idempotencia | ✅ | Núcleo de la HU: `client_event_id` UNIQUE + huella (R3); captura nunca bloqueada (UI-004) |
| §3 Tiempo de retiro | ✅ N/A | La HU no lista animales; garantiza que los eventos que originan el retiro lleguen completos y una sola vez |
| §4 Pydantic y RBAC | ✅ | Validación por evento con `CapturedEvent`, respuestas tipadas, roles `OPERARIO`/`VETERINARIO`, autor = token, finca ∈ fincas del usuario (R7) |
| §4 Cero secretos | ✅ | Usa el token de la HU-01; no hay claves nuevas |
| §5.1 WIP = 1 | ⚠️ | La implementación espera a que se fusione la HU-02 (R1) |
| §5.3 CI < 90 s | ✅ | Unas 30 pruebas `pytest` en memoria; las pruebas del frontend son puras |
| §5.4 Degradación elegante y SLO | ✅ | Pérdida de red = cola con reintentos; sesión vencida = pausa; fecha futura = se guarda con revisión (R6); registros de ejecución para medir SLO (R13) |

**Resultado**: pasa con 3 desviaciones justificadas (ver Seguimiento de Complejidad).

## Estructura del Proyecto (Vertical Slicing)

### Documentación (esta funcionalidad)

```text
specs/003-offline-batch-sync/
├── spec.md
├── plan.md                         # este archivo
├── research.md                     # R1–R14
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── offline-sync-api.md         # POST /offline-sync/batches + contrato interno del frontend
│   └── sync-batch.cases.json       # escenarios compartidos backend/frontend
├── checklists/requirements.md
└── tasks.md                        # lo genera /speckit.tasks
```

### Backend: `backend/app/features/offline_sync/`

```text
backend/app/features/offline_sync/
├── __init__.py
├── models.py        # OfflineSyncEvent, OfflineSyncIdConflict, OfflineSyncBatchLog
├── schemas.py       # SyncBatchRequest, SyncItemResult, SyncBatchResponse, ErrorCode
├── hashing.py       # canonical_payload_hash(CapturedEvent) (R3)
├── authorization.py # reglas de autor, finca y usuario deshabilitado por evento (R7)
├── repository.py    # inserción con savepoint, búsqueda por client_event_id, consulta del registro preliminar (R2, R3)
├── service.py       # process_batch: validar → autorizar → insertar → clasificar → registrar en el log
└── router.py        # POST /batches (montado en /offline-sync)
```

### Frontend: `frontend/src/features/offline-sync/`

```text
frontend/src/features/offline-sync/
├── index.js                  # exporta OfflineSyncProvider, SyncStatusBadge, SyncNowButton, useSyncStatus, syncStateRepository
├── OfflineSyncProvider.jsx   # contexto: disparadores, temporizador de 30 s, recuperación al arrancar
├── SyncStatusBadge.jsx       # 🟢/🔴 + contador + "Enviando" (FR-027)
├── SyncNowButton.jsx         # "Sincronizar ahora" (FR-002), ≥ 48×48 px
├── FailedEventDetail.jsx     # motivo, tipo de fallo y próximo intento (FR-028)
├── retryPolicy.js            # computeRetryDelay (R9), puro
├── queueSelection.js         # selectDueEvents, chunkBatches (R11), puros
├── batchResult.js            # applyBatchResult, recoverInterrupted (R5), puros
├── syncEngine.js             # orquesta una ejecución con dependencias inyectadas
├── syncLock.js               # Web Locks con respaldo en memoria (R10)
├── connectivity.js           # evento online + sonda /health (R10)
├── syncTransport.js          # POST /offline-sync/batches con tiempo máximo de 30 s
├── syncWiring.js             # Une motor, transporte y controlador sin globales del navegador; el token viaja con cada ejecución (QA-02)
├── syncStateRepository.js    # IndexedDB queue_state + runs (almacenamiento inyectable)
├── syncStateLabels.js        # describeSyncState: textos en español (UI-003)
└── *.test.js                 # node --test
```

### Pruebas automatizadas: `backend/tests/`

```text
backend/tests/
├── unit/test_offline_sync_hashing.py         # huella canónica estable (orden de claves, UTC)
├── unit/test_offline_sync_authorization.py   # AUTHOR_MISMATCH, FARM_NOT_ALLOWED, AUTHOR_DISABLED, verificación de autor
├── unit/test_offline_sync_service.py         # savepoints, transitorio por evento, fecha futura, preliminar → DUPLICADO
├── contract/test_offline_sync_batches_api.py # criterios 1, 3 y 4; repetidos; validación por evento; 401/403/422; casos compartidos
└── security/test_offline_sync_security.py    # append-only, suplantación, finca ajena, concurrencia del mismo id
```

Archivos compartidos (solo se añaden líneas):

```text
backend/app/main.py   # importa los modelos de offline_sync; app.include_router(offline_sync_router, prefix="/offline-sync")
frontend/src/App.jsx  # <OfflineSyncProvider> alrededor del Dashboard; <SyncStatusBadge/> y <SyncNowButton/> en el header
```

**Decisión de estructura**: aplicación web con un módulo vertical aislado por capa, igual que `auth`, `sinigan_sync` y `offline_capture`. La carpeta del frontend usa guion (`offline-sync`), por convención.

## Orden de implementación

1. **Dependencia**: confirmar que la HU-02 está fusionada y rebasar la rama (R1).
2. **Backend: contrato y huella** (TDD): pruebas de `schemas.py` y `hashing.py` → implementar.
3. **Backend: autorización por evento** (TDD): pruebas de las reglas R7 → `authorization.py`.
4. **Backend: repositorio y servicio** (TDD):
   - pruebas de idempotencia (repetidos, concurrencia, conflicto de contenido), transitorio por evento con fallo inyectado, fecha futura y consulta del registro preliminar;
   - implementar `repository.py` y `service.py`.
5. **Backend: router** (TDD): pruebas de contrato con los 4 criterios y `sync-batch.cases.json` → `router.py` y registro en `main.py`.
6. **Frontend: lógica pura** (TDD con `node --test`):
   - `retryPolicy`, `queueSelection` y `batchResult` con los casos compartidos;
   - `syncEngine` con transporte falso: corte de 24 h con 200 eventos, corte a mitad de respuesta, pausa por 401 y simulación de 100 dispositivos.
7. **Frontend: adaptadores**: `syncStateRepository` (IndexedDB), `syncTransport`, `connectivity` y `syncLock`.
8. **Frontend: interfaz**: `OfflineSyncProvider`, `SyncStatusBadge`, `SyncNowButton` y `FailedEventDetail`; registro en `App.jsx`.
9. **Coordinación**: redactar `coordination.md` con las solicitudes del Seguimiento de Complejidad.
10. **Validación**: `pytest`, `bandit`, `node --test 'src/features/offline-sync/*.test.js'`, `npm run lint`, `npm run build` y [quickstart.md](quickstart.md). Sin `git push` ni PR (modo de pruebas locales, CLAUDE.md).

## Riesgos aceptados (auditoría QA)

Hallazgos del [informe de qa-seguridad](qa-report.md) que no se corrigen en esta HU. QA-01, QA-02, QA-06, QA-07 y QA-09 sí se corrigieron (tareas T055 a T062), y QA-11, QA-12 y QA-13 en la re-verificación (tareas T064 a T072).

| Hallazgo | Qué es | Por qué se acepta en esta HU |
|---|---|---|
| QA-03 (Baja) | Si el `clientEventId` ya existe en la tabla preliminar `sanitary_events`, se responde `DUPLICADO` sin comparar autor ni contenido | Los UUID son aleatorios (colisión accidental despreciable) y el camino preliminar está en retirada ([coordination.md](coordination.md) §2). Comparar contra un esquema ajeno y con menos campos añade lógica que se borrará con esa retirada |
| QA-04 (Baja) | Un usuario deshabilitado con un token emitido antes de la deshabilitación puede sincronizar eventos retrofechados (`fieldOccurredAt < disabled_at`), porque esa hora la pone el dispositivo | Es la consecuencia conocida de R7: usar `was_user_active_at` rechazaría el corte de 24 h (SC-001). El token caduca y la detección de relojes manipulados está fuera de alcance (spec, Supuestos). La HU-04 valida todos los eventos antes de darlos por buenos |
| QA-05 (Baja) | Por evento solo se capturan `IntegrityError` y `OperationalError`; otra excepción (p. ej. `DataError` en PostgreSQL) abortaría todo el lote con un 500 | La vía concreta (unidad de dosis de más de 16 caracteres) quedó cerrada por QA-01: el esquema limita `doseUnit` a 16 y los demás textos ya tenían límite. En SQLite no se manifiesta. Queda para el endurecimiento previo a migrar a un motor estricto |
| QA-08 (Info) | `authorVerificationPending` lo declara el cliente; si un cliente modificado envía `false`, el evento no se marca para verificar autor | El servidor no puede conocer el estado de la sesión offline en el momento de la captura: es una limitación inherente al modelo offline, no un defecto de esta HU. El autor siempre se comprueba contra el token (`AUTHOR_MISMATCH`) |
| QA-14 (Info) | Si otro usuario inicia sesión mientras sale el **último** lote del anterior (`queue_empty`) o un lote que acaba en `auth_paused`, `offline` o `server_error`, el controlador no relanza la sincronización para la sesión nueva; sus eventos esperan al siguiente tic del temporizador (≤ 30 s) | No hay pérdida, duplicados ni fallos definitivos: los eventos de la sesión nueva quedan `pending` y salen en el siguiente tic. El retraso máximo (30 s) cabe en SC-004. La corrección (relanzar siempre que cambie la sesión, sea cual sea `stop_reason`) es opcional según el propio informe y se deja para una mejora del controlador |

## Registro de Complejidad y Excepciones (Seguimiento de Complejidad)

| Compuerta Afectada | Motivo Técnico Ineludible | Alternativa Más Simple Descartada |
|---|---|---|
| §2 Aislamiento: convive con el endpoint preliminar `POST /sync/batches` (`sanitary_events`) | La HU exige estados, campos y validaciones que el preliminar no tiene, y cambiarlo modifica un módulo ajeno. Se pide su retiro por coordinación, junto con el cliente `sanitary-events/syncService.js`, cuando la HU-02 retire la captura preliminar | Ampliar `sanitary_events` viola §2; escribir en su tabla mezcla esquemas |
| §2 Aislamiento: lectura de la tabla `sanitary_events` | Sin ella, un evento ya subido por el camino preliminar se duplicaría en `offline_sync_events` (criterio 2: cero duplicados) | Ignorar el registro preliminar rompe la garantía de no duplicación |
| §2 Aislamiento: la bandeja de la HU-02 debe leer el estado de `offline_sync` | El estado real vive en `queue_state` (R8). La HU-02 debe consumir `syncStateRepository.getStatusMap()`; se pide por coordinación | Escribir `syncStatus` en el almacén de la HU-02 modifica su módulo y rompe su regla de solo inserción |
| §2 Aislamiento: la HU-04 debe leer `offline_sync_events` | Es el registro consolidado de eventos sincronizados con los campos de la HU-02 | Duplicar eventos en dos tablas crea dos fuentes de verdad |
| §2.2 Esquema offline: `status` ampliado y sin `payload` | Hacen falta estados finales visibles (`synced`, `duplicate`); copiar el evento duplicaría datos ya guardados por la HU-02 | El esquema literal obliga a borrar los confirmados (contradice FR-009) o a duplicar 1.000 eventos |
| Pruebas del frontend fuera de la CI | Añadirlas exige tocar `ci.yml` y `package.json`, compartidos. Se piden por coordinación (igual que en la HU-02) y mientras tanto corren localmente | Modificar la CI sin coordinación viola §2 |
| §5.1 WIP: espera a la HU-02 | Necesita `CapturedEvent` y `captureRepository` (R1) | Duplicar el contrato crea dos fuentes de verdad |
