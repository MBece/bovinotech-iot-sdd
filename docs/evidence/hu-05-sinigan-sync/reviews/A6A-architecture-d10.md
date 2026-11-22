# A6A — Revisión de arquitectura D10 (aislamiento por finca)

- **Agente:** A6A (revisor de arquitectura, read-only)
- **Fecha:** 2026-11-22
- **Alcance:** delta D10 sobre la implementación HU-05 ya aprobada
- **Veredicto:** **APROBADO CON OBSERVACIONES**
- **Bloqueantes:** ninguno · **Mayores:** ninguno

> Nota de proceso: A6A agotó su límite de pasos antes de escribir el archivo. El
> contenido de este informe es el que A6A produjo y verificó; A0 lo transcribió sin
> alterar hallazgos ni veredicto. No se modificó código, tests, specs ni evidencia.

## Nota de alcance del diff

`git diff main...HEAD` contiene únicamente los cambios ya integrados de HU-01
(41 archivos, 3.353 inserciones), porque `HEAD = origin/develop = 38096fe`. HU-05
está sin commit: se revisó sobre los archivos del working tree y `git diff HEAD`
(solo `backend/app/main.py`, `backend/tests/conftest.py`, `frontend/src/App.jsx`;
el resto son archivos untracked). Esta circunstancia debe quedar explícita en el
reporte final.

## Verificación punto por punto

| Criterio | Resultado | Evidencia |
| --- | --- | --- |
| La finca sale solo del claim `farm_id` | Cumple | `backend/app/features/auth/dependencies.py:57` carga `user.active_farm_id`; `sinigan_sync/service.py:36-50` falla con 403 si es `None`. No hay parámetro de finca en body/query/header de HU-05 |
| Falla cerrado (403) en las 4 rutas | Cumple | `sinigan_sync/router.py:38,61,80,95` delegan en el servicio; `_active_farm_id` se invoca en `compare` (`service.py:207`), `list_tickets` (`311`), `get_ticket` (`356`) y `resolve_ticket` (`415`) |
| Aislamiento en detalle y resolución, no solo listado | Cumple | Filtros `id + farm_id` en `service.py:357-364` y `416-423`; listado en `311-313`; comparación por `(din, farm_id)` en `219-226` |
| 404/409 indistinguibles entre fincas | Cumple | Mismo mensaje para ticket inexistente y de otra finca (`service.py:365-369,424-428`); mismo 409 para registro de campo ausente o de otra finca (`service.py:227-231`) |
| `farm_id` NOT NULL e indexado; `din` único global | Cumple | `models.py:32-34,50-52`; `din` conserva `unique=True` global (`models.py:32`). Coherente con D10 e invariantes 7–8 del data-model |
| Migración idempotente y en orden correcto | Cumple | `schema_migration.py:19-44`; `main.py:30-34`: `create_all → ensure_auth_schema → ensure_sinigan_sync_schema → seed_initial_users → seed_field_animals` |
| Seed en finca 1 e idempotente por DIN | Cumple | `service.py:85-135`; `main.py:34` |
| `farmId` aditivo en respuestas | Cumple | `schemas.py:70,102,119`, serializado camelCase |
| Reutilización de auth, sin arquitectura paralela | Cumple | `router.py:10-14` usa `get_current_user`/`require_veterinario`; solo `VETERINARIO` resuelve (`auth/dependencies.py:91-97`). Verificado por ejecución: `ADMINISTRADOR` recibe 403 |
| Frontend remonta y descarta datos de la finca anterior | Cumple | `App.jsx:88-93` remonta por `key={user.farmId}` y pasa `farmId`; `SiniganReconciliation.jsx:42-74` recarga por token+finca; `siniganSyncUtils.js:65-70` incluye ambos en la clave |
| Evidencia E2E real de D10 | Cumple | `a0-e2e-report.md:26-40` y `e2e-results.json → steps.d10FarmIsolation`: finca 2 sin visibilidad, 404 en detalle/resolución, finca 1 visible con `farmId=1`, `tokenMaterialStored:false` |
| Sin regresión sobre lo ya aprobado | Cumple | Capas, aislamiento y reutilización intactos; ejecuciones propias: 122 backend, 13 tests D10 dirigidos, 20 Node |

## Observaciones no bloqueantes

1. **Precedencia de validación (400 antes que 403).** `router.py:41-47` valida el
   formato del DIN antes de que el servicio compruebe la finca. Un token legado sin
   `farm_id` con DIN malformado recibe **400**, no 403 (verificado). No accede a
   datos, pero conviene documentar la precedencia.
2. **`DEFAULT 1` permanente en bases migradas.** `schema_migration.py:16,36` deja el
   default en el esquema, mientras el ORM no lo declara (`models.py:34`). Un INSERT
   que omita `farm_id` caería silenciosamente en finca 1 solo en esas bases. El
   código actual siempre lo setea, así que no hay impacto hoy.
3. **Sin FK a `farms.id`.** `models.py:34,52` no declaran clave foránea; el ADR no la
   exige, pero no hay integridad referencial a nivel de esquema.
4. **Claim `farm_id` no revalidado por request.** Un token de hasta 7 días conserva
   acceso a una finca revocada. Es una propiedad del diseño claim-based de HU-01, no
   un defecto introducido por D10.
5. **Cobertura de UI indirecta.** No hay prueba de componente que verifique el
   remonte/limpieza visual al cambiar de finca; solo la clave pura y el E2E de API.
   El código es correcto, pero la cobertura es indirecta.
6. **Fallback de 403 en el servicio HTTP.** `siniganSyncService.js:9` tiene un texto
   de rol por defecto; el `detail` del backend siempre prevalece
   (`detail || statusMessage`), así que solo aplicaría a un 403 sin `detail`.

## Riesgos residuales

Los seis puntos anteriores, todos no bloqueantes. Se suman a R-01…R-04 del reporte
previo (tests de componente M-02/M-03/L-04, listado sin `AbortController`, seed en
import time, doble resolución concurrente sin test dedicado).

## Recomendación

El cierre de D10 es apto con estas observaciones registradas como riesgos residuales.
No se requiere cambios de código para aprobar; sí documentar la precedencia 400/403
y evaluar el default de migración en una futura limpieza de esquema.
