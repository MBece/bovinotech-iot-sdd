# Investigación y decisiones técnicas: HU-03 `offline_sync`

**Fecha**: 2026-11-24 | **Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

Cada decisión resuelve una incógnita del Contexto Técnico. No queda ningún NEEDS CLARIFICATION.

---

## R1. Dependencia de la HU-02 (`offline_capture`)

**Decisión**: la HU-03 consume dos piezas de la HU-02 y no las duplica:
- el esquema `CapturedEvent` (`backend/app/features/offline_capture/schemas.py`), que la HU-02 congeló como contrato para la HU-03;
- `captureRepository.getAll()` del frontend (`frontend/src/features/offline-capture/`).

La implementación de la HU-03 arranca cuando la HU-02 esté fusionada (WIP = 1).

**Razón**: el mismo validador en ambas historias evita dos definiciones del evento que acaben divergiendo. Importar sin modificar no viola el aislamiento modular (§2).

**Estado actual**: en `main` solo existe la documentación de la HU-02; la carpeta `offline_capture` aún no existe.

**Alternativas descartadas**:
- Copiar `CapturedEvent` en `offline_sync`: crea dos fuentes de verdad del contrato.
- Arrancar antes con un esquema provisional: rompe WIP = 1 y obliga a reescribir.

---

## R2. Dónde vive el registro consolidado en el servidor

**Decisión**: tabla propia `offline_sync_events`, en el módulo `offline_sync`, con endpoint nuevo `POST /offline-sync/batches`. El endpoint preliminar `POST /sync/batches` (módulo `sanitary_events`) no se toca.

Para no duplicar eventos que ya hubieran llegado por el camino preliminar, el servicio consulta **en solo lectura** la tabla `sanitary_events` por `client_event_id`. Si el evento existe allí, responde `DUPLICADO`.

**Razón**:
- Modificar `/sync/batches` cambia el módulo de otro integrante (§2).
- El endpoint preliminar no cumple la HU: estados `CREADO`/`RECHAZADO` en lugar de `SINCRONIZADO`/`FALLIDO`; no acepta `DEWORMING`, `product`, `doseUnit`, `reason`, `finding` ni `farmId`; valida el DIN contra el adaptador SINIGÁN (eso es la HU-05); un error a mitad del lote revierte todo con un solo `commit`.

**Coordinación necesaria** (ver plan, Seguimiento de Complejidad):
1. Retirar `POST /sync/batches` y el cliente `sanitary-events/syncService.js` cuando la HU-02 retire la captura preliminar.
2. La HU-04 (validación y correcciones) debe leer `offline_sync_events` como fuente de eventos sincronizados.

**Alternativas descartadas**:
- Ampliar `sanitary_events`: viola §2.
- Escribir en la tabla `sanitary_events` desde `offline_sync`: escritura en el modelo de otro módulo, y su esquema no tiene los campos de la HU-02.

---

## R3. Idempotencia atómica

**Decisión**:
1. Restricción `UNIQUE(client_event_id)` en `offline_sync_events`.
2. Cada evento del lote se inserta dentro de su propio *savepoint* (`session.begin_nested()`).
3. Si la inserción choca con la restricción, se lee el registro existente y se comparan huellas de contenido:
   - **misma huella** → `DUPLICADO`;
   - **huella distinta** → `FALLIDO` definitivo `CLIENT_EVENT_ID_CONFLICT`. El original queda intacto y el intento se guarda en `offline_sync_id_conflicts`.

La huella (`payload_hash`) es el SHA-256 del JSON canónico del evento: claves ordenadas, sin espacios, UTC normalizado. Solo incluye los campos de negocio del `CapturedEvent` y excluye `syncStatus` y `validationStatus`, que cambian con el tiempo.

**Razón**:
- La restricción única en la base de datos es la única garantía que resiste envíos simultáneos (spec HU2-E3). Un "consultar y luego insertar" tiene condición de carrera.
- El *savepoint* aísla cada evento: un fallo no revierte los demás (FR-014).
- Repetidos dentro del mismo lote se resuelven solos: el segundo choca con el primero y sale `DUPLICADO` (HU2-E2).

**Alternativas descartadas**:
- Comprobar en memoria antes de insertar: tiene condición de carrera.
- Responder `DUPLICADO` aunque el contenido difiera: confirmaría al dispositivo datos que el servidor no guardó (supuesto de la spec).

---

## R4. Validación por evento, no por lote

**Decisión**: el cuerpo de la petición declara `items: list[dict]` (entre 1 y 50). Cada elemento se valida por separado con `CapturedEvent.model_validate`. Un evento mal formado produce su propio `FALLIDO` definitivo `VALIDATION_ERROR` con el detalle, y los demás se procesan.

Cada resultado incluye su `index` en el lote. Si un elemento no trae un `clientEventId` legible, el resultado se asocia por `index`.

**Razón**: con `items: list[CapturedEvent]`, FastAPI devolvería un 422 para todo el lote ante un solo evento inválido. Eso bloquearía para siempre a los otros 49, que se reenviarían junto al malo (FR-006, FR-014).

**Alternativas descartadas**: un 422 global con reenvío de los válidos. Complica el cliente y gasta datos en conexiones rurales.

---

## R5. Clasificación de fallos y códigos HTTP

**Decisión**:

| Respuesta / situación | Interpretación en el cliente |
|---|---|
| 200 | Resultado individual por evento (`SINCRONIZADO`, `DUPLICADO` o `FALLIDO` con `retryable`) |
| `FALLIDO` con `retryable: true` (p. ej. `STORAGE_BUSY`, base bloqueada) | Transitorio: reintentar con espera progresiva |
| `FALLIDO` con `retryable: false` | Definitivo: no reintentar; queda visible con su motivo |
| 401 | Pausa por sesión (FR-020): no cuenta como intento ni marca fallos |
| 403 por rol (`DIRECTIVO`/`ADMINISTRADOR`) o contraseña pendiente de cambio | Pausa por sesión con aviso. No marca fallos definitivos: el usuario puede volver con la cuenta correcta |
| 413 / 422 de estructura del lote | Error del cliente: se registra en el diagnóstico y el lote se reintenta partido en mitades hasta aislar el evento problemático, que queda definitivo |
| 429 / 5xx | Transitorio para todos los eventos del lote (incrementa `attempts` y programa espera) |
| Error de red (`NETWORK`) | Sin conexión: el lote vuelve a `pending` sin incrementar `attempts` ni programar espera (R9, FR-005, FR-026). Al reconectar se reenvía y la idempotencia resuelve lo que ya se guardó. *Alineado tras la auditoría QA-07* |
| Tiempo agotado (30 s, `TIMEOUT`) | El servidor puede estar accesible pero lento: el lote completo pasa a `failed/transient` con `error_code: TIMEOUT`, motivo visible "El servidor tardó demasiado en responder. Se reintentará." (FR-028), `attempts + 1` y espera exponencial (R9), igual que un 5xx. La ejecución termina con `stop_reason: server_error`. Reenviar sin espera saturaría aún más un servidor lento. La idempotencia resuelve lo que el servidor sí llegó a guardar. *Corregido tras la auditoría QA-12* |
| `FALLIDO` `AUTHOR_MISMATCH` sobre un evento cuyo autor no es el de la sesión que lo envió | Vuelve a `pending` para enviarse con la sesión de su autor (defensa de QA-02) |

**Razón**: separar "el servidor dijo que no" (definitivo) de "no hubo respuesta fiable" (transitorio) es lo que garantiza que ningún evento se pierda ni se abandone (FR-021 a FR-023).

**Alternativas descartadas**: tratar todo 4xx como definitivo. Una sesión vencida dejaría eventos bloqueados para siempre.

---

## R6. Fecha de captura futura en el servidor

**Decisión**: si `fieldOccurredAt` es posterior a la hora del servidor + 5 min, el evento **se guarda** con `requires_timestamp_review = true` y se responde `SINCRONIZADO`.

**Razón**: el contrato aprobado de la HU-02 ([captured-event.md](../002-offline-capture/contracts/captured-event.md)) lo fija así: un reloj adelantado no debe perder registros (§5.4). La spec se alineó con este contrato (FR-017b).

**Alternativas descartadas**: rechazar como definitivo. El evento quedaría atascado en el dispositivo, sin vía de resolución en esta HU.

---

## R7. Autor, finca y usuarios deshabilitados

**Decisión**: autenticación con `get_current_user_for_sync` (de `auth/sync_support.py`), que también acepta un usuario deshabilitado después de emitirse el token. Luego, por evento:

1. `authorEmail` debe coincidir con el usuario autenticado. Si no → `FALLIDO` definitivo `AUTHOR_MISMATCH` (FR-019).
2. `farmId` debe estar en `user.farm_ids`. Puede ser una finca distinta de la activa: el usuario pudo cambiar de finca después de capturar. Si no → `FALLIDO` definitivo `FARM_NOT_ALLOWED`.
3. Si el usuario está deshabilitado, solo se aceptan eventos con `fieldOccurredAt` anterior a `disabled_at`. Los demás → `FALLIDO` definitivo `AUTHOR_DISABLED`, y se informa con `record_sync_rejection`.
4. Eventos con `authorVerificationPending = true`: se guardan conservando la marca (FR-018). Además se guarda el resultado de `verify_pending_author` en `author_verification_result` (`VERIFIED` / `UNVERIFIED`).

**Advertencia**: **no** se usa `was_user_active_at` tal cual. Esa función rechaza eventos con `occurred_at < token_iat`. El caso normal de la HU-03 es justamente capturar offline y volver a iniciar sesión al reconectar, lo que produce un token nuevo, así que esa regla rechazaría casi todo el corte de 24 h (SC-001). La comprobación de usuario deshabilitado se hace con `disabled_at`, directamente.

**Alternativas descartadas**:
- Exigir `farmId == active_farm_id`: bloquea eventos legítimos tras cambiar de finca.
- Confiar en `authorEmail` sin compararlo con el token: un usuario podría subir eventos en nombre de otro.

---

## R8. Estado de sincronización en el dispositivo

**Decisión**: base IndexedDB propia, `bovinotech_offline_sync_queue`, con un almacén `queue_state` indexado por `client_event_id`, como capa sobre los eventos de la HU-02. Los eventos capturados **no se modifican ni se borran nunca**: el almacén de la HU-02 sigue siendo de solo inserción.

- **Cola de envío** = eventos de `captureRepository.getAll()` del usuario cuyo `queue_state` no está confirmado (`synced`/`duplicate`). Un evento sin registro en `queue_state` se considera `pending`.
- **Recuperación al arrancar**: todo `queue_state` en `syncing` vuelve a `pending` (FR-005, cierre o reinicio durante el envío).
- El esquema sigue la constitución §2.2 (`client_event_id`, `timestamp_utc`, `status`, `payload`) y amplía `status` con `synced` y `duplicate`. No se usa `payload`: el evento se lee de la HU-02 para no duplicar datos.

**Razón**:
- La HU-02 no expone operaciones para cambiar estados (su contrato interno) y modificar su módulo viola §2.
- Separar el estado de sincronización del evento inmutable mantiene el append-only también en el dispositivo.
- FR-007 se cumple por construcción: nada se borra jamás. "Salir de la cola" significa que el estado pasa a confirmado.

**Coordinación**: la bandeja y el detalle de la HU-02 deben mostrar el estado real. La HU-03 exporta `syncStateRepository.getStatusMap()` y el hook `useSyncStatus()`, y la HU-02 los consume. Se pide por coordinación; si la HU-02 aún no está implementada, se incorpora directamente al implementarla.

**Alternativas descartadas**:
- Actualizar `syncStatus` dentro del almacén de la HU-02: modifica un módulo ajeno y rompe su regla de solo inserción.
- Copiar el evento completo en `payload`: duplica 1.000 eventos y abre la puerta a divergencias.

---

## R9. Espera exponencial con variación aleatoria

**Decisión**: función pura `computeRetryDelay(attempt, random)`:

```text
base = min(15 min, 2 s × 2^(attempt − 1))
delay = base × (0.5 + random())      # random() ∈ [0, 1) → variación de ±50 %
```

- El contador `attempts` es por evento. Se reinicia al confirmarse (FR-024).
- `nextAttemptAt = now + delay` se guarda en `queue_state`.
- Al perder la conexión (error de red), no se programan intentos ni se incrementa `attempts` (FR-026). Al recuperarla, se envían los eventos con `nextAttemptAt` vencido.
- Un tiempo agotado **no** cuenta como pérdida de conexión: es un fallo transitorio que incrementa `attempts` y programa `nextAttemptAt`, como un 5xx (QA-12).
- "Sincronizar ahora" ignora `nextAttemptAt` (FR-002), pero respeta la ejecución única (R10).
- Los eventos de un mismo lote fallido comparten `attempts`, pero cada uno recibe su propio sorteo de variación.

`random` y `clock` se inyectan para probar SC-007 de forma determinista: 100 dispositivos simulados con distintas semillas, verificando que ningún segundo concentra más del 10 % de los reintentos.

**Razón**: es el patrón estándar ("exponential backoff with jitter"). El ±50 % mantiene la progresión creciente que exige la spec (SC-007, "cada espera es mayor que la anterior" en promedio y en su cota inferior) y aun así dispersa los reintentos.

**Alternativas descartadas**:
- *Full jitter* (`random × base`): dispersa más, pero permite esperas casi nulas que rompen la progresión observable.
- Espera fija: provoca avalanchas de reintentos sincronizados.

---

## R10. Disparadores y ejecución única

**Decisión**:
- **Conectividad**: el evento `online` del navegador **más** una sonda `GET /health` con 5 s de tiempo máximo. "Recuperar la conectividad" exige que la sonda responda (supuesto de la spec). Mientras hay conexión, un temporizador revisa cada 30 s si hay eventos con `nextAttemptAt` vencido. Eso cubre SC-004 (inicio en menos de 30 s).
- **Ejecución única**: Web Locks API (`navigator.locks.request('bovinotech-offline-sync', { ifAvailable: true })`) para excluir otras pestañas, con una bandera en memoria como respaldo si el navegador no la soporta (FR-004). Aunque fallara el bloqueo, la idempotencia del servidor evita duplicados (R3).
- **Disparadores**: reconexión, temporizador, botón "Sincronizar ahora" y nuevo inicio de sesión tras una pausa por 401 (FR-020).

**Alternativas descartadas**:
- Solo `navigator.onLine`: da `true` con wifi sin internet, frecuente en fincas.
- Background Sync API: soporte desigual (no existe en Safari/iOS) y exige *service worker*. Queda como mejora futura.

---

## R11. Tamaño de lote, orden y tiempo máximo

**Decisión**:
- Lotes de **50** eventos (FR-003), ordenados por `fieldOccurredAt` ascendente y luego por `clientEventId`, para un orden estable.
- Tiempo máximo de **30 s** por petición.
- 1.000 eventos se envían en 20 peticiones secuenciales.
- El servidor rechaza con 422 un lote de más de 50 eventos.

**Razón**: un lote de 50 eventos ocupa unos 25 KB; en 2G/EDGE rural se envía en pocos segundos y deja margen dentro del tiempo máximo. Las peticiones secuenciales reducen la carga y simplifican la gestión de fallos parciales. SC-005 (1.000 eventos en menos de 5 min) da 15 s por lote.

---

## R12. Estrategia de pruebas (TDD)

**Decisión**:
- **Backend** (`pytest`):
  - `unit/test_offline_sync_*`: huella canónica, clasificación de fallos, reglas de autor/finca/deshabilitado, fecha futura, consulta del registro preliminar.
  - `contract/test_offline_sync_*`: los 4 criterios de la HU, lote mixto, repetidos en el lote, validación por evento, 401/403/422.
  - `security/test_offline_sync_*`: suplantación de autor, finca ajena, usuario deshabilitado, append-only (ninguna ruta hace UPDATE/DELETE sobre `offline_sync_events`).
  - Fallos transitorios por evento con un repositorio inyectable que falla en `client_event_id` concretos (criterio 4).
- **Frontend** (`node --test`, mismo enfoque que la HU-02, sin dependencias nuevas): módulos puros con transporte, almacenamiento, reloj y aleatoriedad inyectados. Cubren `computeRetryDelay`, el motor de sincronización (resultados parciales, corte a mitad de respuesta, recuperación de `syncing`, pausa por 401), la simulación del corte de 24 h con 200 eventos (SC-001) y la de 100 dispositivos (SC-007).
- **Casos compartidos**: `contracts/sync-batch.cases.json` define escenarios de lote y resultados esperados, y lo usan ambos lados.

**Razón**: §2 TDD. La CI corre `pytest` en menos de 90 s y las pruebas del frontend son puras y rápidas.

---

## R13. Observabilidad y SLO

**Decisión**:
- **Servidor**: tabla `offline_sync_batch_log` con una fila por petición: usuario, finca activa, recepción, duración y conteos por estado (FR-029).
- **Cliente**: almacén `runs` en `bovinotech_offline_sync_queue` con las últimas 20 ejecuciones (inicio, fin, disparador, conteos y motivo de corte). Sirve para la pantalla de diagnóstico y para medir SC-004 y SC-005 en las pruebas de campo.

**Razón**: §5.4 (SLO y *error budget*). Sin registros no se puede comprobar la integridad del 99,9 % (SC-006).

---

## R14. Seguridad y datos en el dispositivo

**Decisión**:
- Ningún secreto nuevo: se usa el token de la HU-01 que ya está en sesión.
- `queue_state` solo guarda identificadores, estados y motivos, no datos sanitarios.
- Los mensajes de error del servidor no exponen detalles internos: código + texto en español.
- `bandit -ll` sin hallazgos nuevos.

**Alternativa descartada**: firmar los lotes con HMAC del dispositivo. NISTIR 8259A aplica a collares IoT; los teléfonos del operario se autentican con el token de la HU-01. Queda fuera de alcance.
