# A6B — Re-revisión de código HU-05 `sinigan_sync`

**Run:** `HU05-SINIGAN-SYNC-20261121`
**Rama:** `feat/hu-05-sinigan-sync`
**Base:** `a8138932c875a73a814f51242f011cf6d00a8398` (`main`, worktree sin commits)
**Modo:** read-only. No se editó código de producción, tests, specs ni configuración.
**Fecha de revisión:** 2026-11-21 (UTC-05:00; la evidencia E2E está en UTC 2026-11-22).
**Alcance:** verificación de M-01, M-02, M-03 y de los Low corregidos (L-03, L-04, L-05,
L-07, L-09), sobre el código actual del working tree.

---

## 1. Resumen ejecutivo

Los **3 hallazgos Medium** del informe A6B original están **corregidos** en el código
actual. Los **5 Low** incluidos en el alcance de las correcciones también están
corregidos.

La evidencia se reprodujo en esta re-revisión:

- Backend: **52 passed**, `EXIT_CODE=0`.
- Frontend: **16 tests / 16 passed** (`node --test`), `EXIT_CODE=0`.
- `npm run lint`: `EXIT_CODE=0`.
- `npm run build`: `EXIT_CODE=0`, 32 módulos, `dist/assets/index-ji-RXXrV.js`.
- Pruebas nuevas de fechas UTC: **3/3 passed**.
- Prueba del `409` sin registro de campo (L-01): **1/1 passed**.
- Sonda independiente contra la API: todos los `datetime` expuestos salen con `Z`.

Quedan **hallazgos residuales Low** (falta de pruebas automatizadas de los estados
M-02/M-03/L-04 y una carrera menor en el listado de tickets), que no bloquean la
corrección de los Medium ni la aceptación de la HU.

**Veredicto final: `aprobar`.**

---

## 2. Método y evidencia consultada

Se leyeron y contrastaron:

- Informe original: `reviews/A6B-code.md`.
- Reportes de corrección: `agents/A3-backend-fixes.md`, `agents/A4-frontend-fixes.md`.
- Gates finales: `gates/G4-acceptance/{pytest,node-test,lint,build}-final-fixed.txt`,
  `e2e-run-final-a0.txt`, `e2e-results.json`.
- Código actual: `backend/app/features/sinigan_sync/{service,models,schemas,router,comparator}.py`,
  `frontend/src/features/sinigan-sync/{SiniganReconciliation,SiniganComparisonCard,SiniganTicketDetail}.jsx`,
  `siniganSyncUtils.js`, `siniganSyncService.js`.
- Tests: `backend/tests/unit/test_sinigan_sync_datetimes.py`,
  `backend/tests/unit/test_sinigan_sync_missing_field_record.py`,
  `frontend/src/features/sinigan-sync/__tests__/siniganSyncSourceLabels.test.js`,
  y el resto de la suite.

El informe original `reviews/A6B-code.md` **no fue modificado**; este es un archivo nuevo.

---

## 3. Estado de los hallazgos Medium

| ID | Hallazgo | Estado | Evidencia |
|---|---|---|---|
| **M-01** | Timestamps sin zona horaria | **Corregido** | Código + `test_sinigan_sync_datetimes.py` (3 passed) + sonda API + `e2e-results.json` con `Z` |
| **M-02** | Estado obsoleto tras error de comparación | **Corregido** | `SiniganReconciliation.jsx:115-123` (inspección de código) |
| **M-03** | Carrera al cargar detalle de tickets | **Corregido** | `SiniganReconciliation.jsx:65-92` (request id) |

### 3.1 M-01 — Timestamps sin zona horaria: **corregido**

Código actual:

- `service.py:40-52` define `as_utc()`: devuelve `None` para `None`, adjunta
  `timezone.utc` a valores naive y convierte valores aware a UTC.
- `service.py:55-61` define `iso_utc()`: serializa ISO-8601 con sufijo `Z`.
- Normalización aplicada en todos los puntos expuestos:
  - `_field_snapshot` → `updatedAt` con `iso_utc` (`service.py:132`).
  - `_ticket_summary` → `compared_at`, `created_at`, `closed_at` con `as_utc`
    (`service.py:143-146`); cubre `GET /tickets` y el ticket del POST de comparación.
  - `_discrepancy_payload` → `detected_at` con `as_utc` (`service.py:163`).
  - `_resolution_payload` → `resolved_at` con `as_utc` (`service.py:174`).
  - `get_ticket` → `compared_at`, `created_at`, `closed_at` con `as_utc`
    (`service.py:350-353`).
  - `resolve_ticket` → `closed_at` con `as_utc` (`service.py:415`).
- `meta.comparedAt` sigue usando `utcnow()` aware (`service.py:203`).

Prueba dedicada: `backend/tests/unit/test_sinigan_sync_datetimes.py:53-104` verifica
`Z` en `POST /comparisons` (`field.updatedAt`, `meta.comparedAt`, `ticket.comparedAt`,
`ticket.createdAt`, `discrepancies[0].detectedAt`), en `GET /tickets/{id}`
(`comparedAt`, `createdAt`, `detectedAt`) y en `POST /tickets/{id}/resolution`
(`closedAt`, `resolution.resolvedAt`) y su relectura posterior.

Ejecución real de esta re-revisión:

```text
tests/unit/test_sinigan_sync_datetimes.py::test_comparison_exposes_utc_timestamps_with_z_suffix PASSED
tests/unit/test_sinigan_sync_datetimes.py::test_ticket_detail_exposes_utc_timestamps_with_z_suffix PASSED
tests/unit/test_sinigan_sync_datetimes.py::test_resolution_exposes_utc_timestamps_with_z_suffix PASSED
4 passed, 1 warning in 3.06s   (incluye el test de L-01)
EXIT_CODE=0
```

Sonda independiente contra la API (SQLite en memoria, sin tocar la BD del repo):

```text
POST comparison status 200
field.updatedAt 2026-11-20T12:05:00Z
meta.comparedAt 2026-11-22T04:01:18.264700Z
ticket.comparedAt 2026-11-22T04:01:18.264700Z
ticket.createdAt 2026-11-22T04:01:18.264700Z
discrepancies[0].detectedAt 2026-11-22T04:01:18.264700Z
GET detail status 200
detail.comparedAt 2026-11-22T04:01:18.264700Z
detail.createdAt 2026-11-22T04:01:18.264700Z
detail.discrepancies[0].detectedAt 2026-11-22T04:01:18.264700Z
detail.fieldSnapshot.updatedAt 2026-11-20T12:05:00Z
POST resolution status 201
resolution.closedAt 2026-11-22T04:01:18.281809Z
resolution.resolution.resolvedAt 2026-11-22T04:01:18.281809Z
GET detail after resolution closedAt 2026-11-22T04:01:18.281809Z
GET detail after resolution resolvedAt 2026-11-22T04:01:18.281809Z
```

Sonda adicional sobre `GET /tickets` (mismo helper `_ticket_summary`):

```text
GET list status 200
list.comparedAt 2026-11-22T04:01:46.434655Z
list.createdAt 2026-11-22T04:01:46.434655Z
list.closedAt None
```

La evidencia E2E post-fix también muestra `Z` en `fieldSnapshot.updatedAt`,
`comparedAt`, `createdAt`, `closedAt`, `detectedAt` y `resolution.resolvedAt`
(`gates/G4-acceptance/e2e-results.json`, objeto `ac04Http.closedDetail`).

Conclusión: **M-01 corregido**.

### 3.2 M-02 — Estado obsoleto tras error de comparación: **corregido**

`handleCompare` (`SiniganReconciliation.jsx:94-127`) en el `catch` (líneas 115-123)
hace:

```js
detailRequestIdRef.current += 1;
setCompareError(error.message);
setComparison(null);
setSelectedTicketId(null);
setDetail(null);
setDetailError(null);
setLoadingDetail(false);
setNotice(null);
```

El render solo pinta `SiniganComparisonCard` si `comparison` es truthy
(`SiniganReconciliation.jsx:205`), y el detalle solo si `selectedTicketId` es truthy
(`:299`). Tras un error ya no quedan tarjeta, ticket ni detalle previos junto al error.

No hay prueba de componente automatizada para este `catch`; se verificó por
inspección de código (ver residual R-01).

Conclusión: **M-02 corregido**.

### 3.3 M-03 — Carrera al cargar detalle: **corregido**

`detailRequestIdRef = useRef(0)` (`SiniganReconciliation.jsx:38`).

`loadDetail` (`:65-92`) captura `const requestId = ++detailRequestIdRef.current`
(línea 67) y solo aplica `setDetail`, `setDetailError` y `setLoadingDetail` si
`requestId === detailRequestIdRef.current` (líneas 78, 82, 86). Además, el contador
se invalida al comparar (`:96`) y al cerrar/limpiar la selección (`:308`).

Así, si el usuario selecciona el ticket A y luego el B, la respuesta tardía de A se
descarta y el encabezado “Detalle del ticket #B” no puede pintar el contenido de A.
El `POST` de resolución usa `detail.id` de un detalle que ya corresponde a la
selección vigente.

No hay prueba de componente automatizada para la carrera; se verificó por
inspección de código (ver residual R-01).

Conclusión: **M-03 corregido**.

---

## 4. Estado de los Low corregidos

| ID | Hallazgo | Estado | Evidencia |
|---|---|---|---|
| **L-03** | `FIELD_LABELS[...]` con indexación directa | **Corregido** | `service.py:156-158` usa `.get(field_name, field_name)` |
| **L-04** | Recarga fallida tras resolver dejaba el formulario visible | **Corregido** | `SiniganReconciliation.jsx:148-164` actualiza `detail` optimistamente con `status`, `closedAt` y `resolution` antes de recargar |
| **L-05** | Seed idempotente solo por “existe al menos una fila” | **Corregido** | `service.py:64-115` inserta solo DIN inexistentes y nunca sobrescribe |
| **L-07** | Carga inicial duplicada entre `loadTickets` y `useEffect` | **Corregido** | `SiniganReconciliation.jsx:58-63` reutiliza `loadTickets` |
| **L-09** | Origen de campo con código crudo en la UI | **Corregido** | `siniganSyncUtils.js:20-29` + uso en `SiniganComparisonCard.jsx:80,124-125` y `SiniganTicketDetail.jsx:128-129` |

Notas de verificación:

- **L-03:** no hay prueba dedicada, pero la corrección es observable directamente en el
  código; un `field_name` desconocido ya no produce `KeyError` (devuelve el propio código).
- **L-04:** el `detail` optimista conserva `status: 'CLOSED'`, por lo que
  `canResolveTicket` oculta el formulario aunque falle `getTicket`.
- **L-05:** el fixture usa claves `updated_at`, `age_group`, etc., compatibles con
  `_parse_updated_at`; el seed consulta los DIN existentes y no modifica filas.
- **L-07:** ESLint `react-hooks/set-state-in-effect` se respeta mediante
  `setTimeout(loadTickets, 0)` con limpieza en el retorno.
- **L-09:** `formatSourceLabel` mapea `REGISTRO_DE_CAMPO` → `REGISTRO DE CAMPO`, deja
  intactas etiquetas ya humanas (`MODO SIMULADO…`, `REGISTRO DE CAMPO`) y devuelve
  `undefined`/`null`/`''` sin cambios. Cubierto por
  `siniganSyncSourceLabels.test.js` (3 tests, ejecutados en verde).

Adicionalmente, **L-01** (no solicitado en esta re-revisión, pero incluido por A3) quedó
cubierto por `test_sinigan_sync_missing_field_record.py:52-82`, que pasa.

---

## 5. Ejecución real de esta re-revisión

Entorno: Python **3.11.9** (`…\hu05-venv`), Node **v22.19.0**, npm **10.9.3**.

### 5.1 Backend — `pytest -q` (workdir `backend/`)

```text
....................................................                     [100%]
52 passed, 1 warning in 31.39s
EXIT_CODE=0
```

La única advertencia es el `DeprecationWarning` preexistente de
`starlette/testclient.py` (alias `anyio.abc.BlockingPortal`).

### 5.2 Frontend — `node --test` (workdir `frontend/`)

```text
1..3
# tests 16
# suites 3
# pass 16
# fail 0
# cancelled 0
# skipped 0
# todo 0
NODE_TEST_EXIT=0
```

### 5.3 Frontend — `npm run lint` (workdir `frontend/`)

```text
> bovinotech-frontend@0.0.0 lint
> eslint .

LINT_EXIT=0
```

### 5.4 Frontend — `npm run build` (workdir `frontend/`)

```text
vite v8.3.8 building client environment for production...
✓ 32 modules transformed.
dist/index.html                   0.47 kB │ gzip:  0.30 kB
dist/assets/index-DykytF2W.css    4.10 kB │ gzip:  1.47 kB
dist/assets/index-ji-RXXrV.js   273.46 kB │ gzip: 81.59 kB
✓ built in 171ms
BUILD_EXIT=0
```

Los resultados coinciden con los gates `*-final-fixed.txt` de A0. No se detectaron
afirmaciones de éxito sin ejecución en lo que respecta a tests, lint y build.

### 5.5 E2E

No se re-ejecutó el E2E fullstack (requiere backend + Vite + Chromium/CDP). Se auditó
la evidencia post-fix: `e2e-run-final-a0.txt` termina en `E2E PASS` y `EXIT_CODE=0`, y
`e2e-results.json` declara `"status": "PASS"` con timestamps `Z`. No se acredita el E2E
como ejecutado por A6B.

---

## 6. Hallazgos residuales

| ID | Severidad | Archivo:línea | Hallazgo | Impacto | Sugerencia |
|---|---|---|---|---|---|
| **R-01** | Low | `frontend/src/features/sinigan-sync/SiniganReconciliation.jsx:65-164`; `frontend/src/features/sinigan-sync/__tests__/` | Las correcciones M-02, M-03 y L-04 no tienen prueba automatizada de componente/estado; `node --test` solo cubre servicio (6), utilidades (7) y etiquetas de origen (3). | Una regresión futura en el `catch`, en el request id o en la actualización optimista pasaría desapercibida; el E2E solo ejercita el camino feliz. | Añadir pruebas de componente (Testing Library) o extraer la lógica de estado a funciones puras testeables. No bloquea la corrección actual. |
| **R-02** | Low | `SiniganReconciliation.jsx:40-56` (`loadTickets`, `refreshTickets`) | El listado de tickets no usa request id/`AbortController`. Cambios rápidos de filtro podrían dejar visible una respuesta obsoleta. | Mismatch menor entre filtros aplicados y listado mostrado. No afecta resolución (el detalle sí está protegido por M-03). | Aplicar el mismo patrón de request id a `loadTickets` (ya sugerido en el M-03 original). |
| **R-03** | Informativo | `backend/app/main.py:26-28` | El seed de campo sigue ejecutándose en import time (L-06 original). | Importar `app.main` escribe/lee la SQLite de archivo; patrón preexistente. | Mover seeds a `lifespan/startup`. Fuera del alcance de las correcciones. |
| **R-04** | Informativo | `backend/app/features/sinigan_sync/service.py:400-407` | La rama `IntegrityError` de doble resolución (L-02 original) sigue sin prueba dedicada. | El manejo de concurrencia no está verificado por ejecución. | Añadir prueba que fuerce la violación de unicidad. Fuera del alcance de las correcciones. |

L-01 quedó cubierto. L-08 y L-10 originales siguen siendo deuda documental/menor y no
fueron parte del alcance de A3/A4.

---

## 7. Cobertura de AC y seguridad tras las correcciones

- Los **52 tests backend** pasan; incluyen los 48 previos más los 3 de fechas UTC y 1
  del `409` sin registro de campo.
- AC-01…AC-04, autorización, mass assignment y no sobrescritura siguen cubiertos por
  las pruebas ya verificadas en A6B; no se modificaron ni debilitaron las pruebas de A5.
- Los **16 tests frontend** pasan (13 previos + 3 de etiquetas de origen).
- `lint` y `build` verdes; E2E post-fix declara `PASS` con timestamps `Z`.
- No se introdujeron cambios en el contrato de API; L-09 es solo presentación.

---

## 8. Limitaciones de esta re-revisión

1. Modo **read-only**: no se modificó código, tests, specs ni configuración; el único
   archivo escrito es este informe.
2. No hay commit en la rama; la verificación se hizo sobre el working tree.
3. No se re-ejecutó el E2E fullstack; se auditó la evidencia post-fix.
4. M-02, M-03, L-03, L-04 y L-05 se verificaron principalmente por inspección de código,
   ya que no existen pruebas automatizadas dedicadas para esos estados (R-01).
5. La sonda independiente de M-01 se ejecutó con SQLite en memoria y `dependency_overrides`,
   sin escribir en `backend/bovinotech.db`.

---

## 9. Veredicto

**`aprobar`**

- **M-01:** corregido y verificado por pruebas, sonda API independiente y E2E.
- **M-02:** corregido (el `catch` limpia comparación, selección y detalle).
- **M-03:** corregido (request id en `loadDetail` descarta respuestas obsoletas).
- **L-03, L-04, L-05, L-07, L-09:** corregidos.
- **Críticos/High:** 0. **Medium abiertos:** 0.
- Residuales: 2 Low (R-01, R-02) y 2 informativos (R-03, R-04), no bloqueantes.

No se encontró ningún Medium sin corregir; no procede bloquear.
