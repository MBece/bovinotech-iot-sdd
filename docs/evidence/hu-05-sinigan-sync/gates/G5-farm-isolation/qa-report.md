# G5 — Aislamiento por finca (D10) · Reporte de QA

**Fecha:** 2026-11-22
**Rama:** `feat/hu-05-sinigan-sync`
**Alcance:** HU-05 `sinigan_sync` + decisión `D10-farm-isolation.md` de HU-01.
**Responsable:** A5 QA.
**Estado:** pruebas backend/frontend verdes. **E2E fullstack pendiente de ejecución por A0.**

---

## 1. Alcance de este pase

1. Nueva capa de **seguridad real** con login por API para probar aislamiento por
   finca y **no-escritura cruzada**:
   - `backend/tests/security/test_sinigan_sync_farm_isolation.py`
2. Actualización del driver E2E para D10 y para el almacenamiento de sesión de
   HU-01 (`bovinotech_session`):
   - `docs/evidence/hu-05-sinigan-sync/gates/G4-acceptance/e2e-cdp.mjs`
3. Ejecución de la suite completa, pruebas Node, lint, build y validación de
   sintaxis del driver.
4. Este reporte de evidencia. **No** se actualizaron `REPORT.md`,
   `traceability.md` ni `manifest.json` (los cierra A7).

Restricciones respetadas: sin cambios en código de producción, sin cambios en
`specs/`, sin commit ni push.

---

## 2. Prueba de seguridad nueva

Archivo:
`backend/tests/security/test_sinigan_sync_farm_isolation.py`

Usa el endpoint real `POST /auth/login` con cuerpo JSON (incluido `farm_id` para
la cuenta multifinca `vet2@bovinotech.co`) y crea el ticket de discrepancia por
API comparando `DIN-DEMO-000002` en la finca 1.

| Test | Qué prueba |
|---|---|
| `test_other_farm_cannot_list_detail_or_resolve_and_writes_nothing` | `vet2` finca 2: el listado no incluye el ticket, detalle `404`, resolución `404`. Snapshot antes/después de ticket, discrepancias y resoluciones: **cero escrituras**; el ticket sigue `OPEN` y sin `ReconciliationResolution`. |
| `test_multi_farm_veterinarian_sees_ticket_in_its_active_farm` | `vet2` finca 1: el listado incluye el ticket y el detalle responde `200` con `farmId=1`, `status=OPEN` y el DIN esperado. |
| `test_legacy_token_without_farm_claim_gets_403_and_writes_nothing` | Token legado creado con `create_access_token` sin claim `farm_id`: `403` con el mensaje de finca activa en los 4 endpoints de HU-05 (`POST /comparisons`, `GET /tickets`, `GET /tickets/{id}`, `POST /tickets/{id}/resolution`) y cero escrituras. |

El snapshot de persistencia compara estado del ticket, `closed_at`, cantidad de
discrepancias, cantidad de resoluciones y totales de tickets/resoluciones.

> **Sobre el estado rojo:** esta capa D10 se escribió después de la
> implementación de A3/A4, por lo que su primera ejecución fue verde y no genera
> un artefacto rojo propio. El estado rojo histórico de HU-05 permanece en
> `gates/G1-red/` y no se modificó en este pase.

---

## 3. Cambios al driver E2E (no ejecutado en este pase)

Ruta vigente:
`docs/evidence/hu-05-sinigan-sync/gates/G4-acceptance/e2e-cdp.mjs`

Cambios:

1. AC-02 lee el token desde
   `JSON.parse(localStorage.getItem("bovinotech_session") || "{}").token`
   (HU-01 ya no escribe `bovinotech_token`). Si no hay token, el driver falla.
2. `apiLogin(email, farmId)` envía `farm_id` en el JSON cuando se indica y
   valida que la respuesta devuelva la misma finca.
3. Nuevo bloque `results.steps.d10FarmIsolation` **después** de la evidencia
   HTTP de AC-04 y **antes** de `noOverwrite`, usando `ageTicketId` (el ticket de
   `DIN-DEMO-000003`, todavía `OPEN`):
   - `vet2` finca 2: listado sin el ticket, detalle `404`, resolución `404`.
   - `vet2` finca 1: listado incluye el ticket y detalle `200` con `farmId=1`.
   - No se guardan tokens en el JSON de resultados
     (`tokenMaterialStored: false`).

Validación de sintaxis:

```text
$ node --check docs/evidence/hu-05-sinigan-sync/gates/G4-acceptance/e2e-cdp.mjs
EXIT_CODE=0
```

> **Pendiente:** A5 **no** ejecutó el E2E fullstack. No se generaron ni
> modificaron `e2e-cdp.log` ni `e2e-results.json` en este pase. La ejecución
> corresponde a A0 al final; hasta entonces no existe evidencia E2E nueva de
> D10 producida por A5.

---

## 4. Comandos y salida real

### 4.1 Backend — suite completa

```powershell
cd backend
C:\Users\Juan Gutierrez\AppData\Local\Temp\opencode\hu05-venv\Scripts\python.exe -m pytest -q
```

```text
........................................................................ [ 59%]
..................................................                       [100%]
============================== warnings summary ===============================
..\..\hu05-venv\Lib\site-packages\starlette\testclient.py:40
  C:\Users\Juan Gutierrez\AppData\Local\Temp\opencode\hu05-venv\Lib\site-packages\starlette\testclient.py:40: DeprecationWarning: The anyio.abc.BlockingPortal alias is deprecated, use anyio.from_thread.BlockingPortal instead.
    _PortalFactoryType = typing.Callable[[], typing.ContextManager[anyio.abc.BlockingPortal]]

-- Docs: https://docs.pytest.org/en/stable/how-to/capture-warnings.html
122 passed, 1 warning in 34.68s
EXIT_CODE=0
```

Antes de este pase la línea base reportada era 119; los 3 tests nuevos elevan el
total a **122 passed**.

### 4.2 Backend — solo la prueba nueva

```powershell
cd backend
C:\Users\Juan Gutierrez\AppData\Local\Temp\opencode\hu05-venv\Scripts\python.exe -m pytest -q tests/security/test_sinigan_sync_farm_isolation.py
```

```text
...                                                                      [100%]
============================== warnings summary ===============================
..\..\hu05-venv\Lib\site-packages\starlette\testclient.py:40
  C:\Users\Juan Gutierrez\AppData\Local\Temp\opencode\hu05-venv\Lib\site-packages\starlette\testclient.py:40: DeprecationWarning: The anyio.abc.BlockingPortal alias is deprecated, use anyio.from_thread.BlockingPortal instead.
    _PortalFactoryType = typing.Callable[[], typing.ContextManager[anyio.abc.BlockingPortal]]

-- Docs: https://docs.pytest.org/en/stable/how-to/capture-warnings.html
3 passed, 1 warning in 1.60s
EXIT_CODE=0
```

### 4.3 Frontend — pruebas Node

```powershell
cd frontend
node --test
```

```text
1..3
# tests 20
# suites 3
# pass 20
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 124.2352
EXIT_CODE=0
```

Salida TAP completa en `node-test.txt`.

### 4.4 Frontend — lint y build

```powershell
cd frontend
npm run lint
npm run build
```

```text
> bovinotech-frontend@0.0.0 lint
> eslint .

EXIT_CODE=0
```

```text
> bovinotech-frontend@0.0.0 build
> vite build

vite v8.3.8 building client environment for production...
transforming...
✓ 38 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                   0.47 kB │ gzip:  0.30 kB
dist/assets/index-DykytF2W.css    4.10 kB │ gzip:  1.47 kB
dist/assets/index-C2PcMXLf.js   288.26 kB │ gzip: 85.30 kB

✓ built in 166ms
EXIT_CODE=0
```

---

## 5. Artefactos

| Archivo | Contenido |
|---|---|
| `pytest.txt` | Salida de la suite backend completa. |
| `pytest-exit-code.txt` | `EXIT_CODE=0`. |
| `pytest-farm-isolation.txt` | Salida de los 3 tests nuevos de aislamiento. |
| `pytest-farm-isolation-exit-code.txt` | `EXIT_CODE=0`. |
| `node-test.txt` | Salida TAP completa de `node --test`. |
| `node-test-exit-code.txt` | `EXIT_CODE=0`. |
| `node-check-e2e.txt` | Salida de `node --check` del driver (vacía si no hay errores). |
| `node-check-e2e-exit-code.txt` | `EXIT_CODE=0`. |
| `lint.txt` / `lint-exit-code.txt` | ESLint sin hallazgos. |
| `build.txt` / `build-exit-code.txt` | Build de Vite correcto. |

---

## 6. Riesgos y notas

1. **E2E fullstack D10 no ejecutado.** El bloque nuevo del driver está validado
   solo sintácticamente. Su evidencia real quedará en
   `e2e-results.json → steps.d10FarmIsolation` cuando A0 lo ejecute con backend,
   frontend y CDP arriba. No debe considerarse verde hasta entonces.
2. El E2E depende de que el usuario `vet2@bovinotech.co` conserve acceso a las
   fincas 1 y 2 en el seed de HU-01. Si el seed cambia, el bloque D10 fallará de
   forma explícita.
3. Los tests nuevos usan la base SQLite en memoria del `conftest` y el mismo seed
   real de usuarios/fincas; no tocan la base local ni datos productivos.
4. El orden de la suite no afecta la prueba: el fixture autouse recrea el
   esquema y vuelve a sembrar usuarios y registros de campo en cada test.
5. La resolución cruzada se valida como `404` (mismo mensaje que ticket
   inexistente) y con comparación de snapshots; no se acepta solo el código HTTP.
