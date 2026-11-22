# Plan de Implementación: Captura offline de eventos sanitarios (HU-02)

**Rama**: `feat/hu-02-offline-capture` | **Fecha**: 2026-11-21 | **Spec**: [spec.md](spec.md)

**Entrada**: especificación de `specs/002-offline-capture/spec.md` (7 clarificaciones resueltas).

## Resumen

El operario registra vacunaciones, tratamientos, chequeos clínicos y desparasitaciones sin conexión. Cada evento se guarda de inmediato y de forma inmutable en una base IndexedDB propia del módulo, con `client_event_id` generado en el dispositivo y los estados independientes `PENDIENTE_SINCRONIZACION` y `PENDIENTE_VALIDACION`.

Antes de guardar, un validador en el cliente comprueba que el animal esté en el catálogo local de la finca activa, que la fecha no sea futura y que estén los datos obligatorios del tipo.

El backend aporta dos cosas:
- el catálogo semilla por finca (`GET /offline-capture/catalog`);
- el esquema `CapturedEvent`, que congela el contrato que la HU-03 enviará.

Ambos lados se prueban contra un mismo archivo de casos.

La nueva captura reemplaza a la preliminar: copia sus pendientes sin modificarlos y pide su retiro de la interfaz mediante coordinación.

## Contexto Técnico

**Lenguaje/Versión**: Python 3.11 (backend); JavaScript ES2022 con React 19 (frontend).
**Dependencias principales**: FastAPI, SQLAlchemy 2.0, Pydantic 2 (existentes); React 19 + Vite 8 (existentes). **Sin dependencias nuevas** (R6).
**Almacenamiento**:
- Cliente: IndexedDB `bovinotech_offline_capture`, almacenes `events` y `catalog` (R2).
- Servidor: tabla SQLite `offline_capture_animals`, creada con `create_all` (R7).
**Pruebas**:
- Backend: `pytest` (contrato y API).
- Frontend: `node --test src/features/offline-capture/`, nativo de Node (sin script en `package.json`), sobre módulos puros con almacenamiento inyectado (R6).
**Plataforma objetivo**: navegador móvil moderno (PWA existente).
**Tipo de proyecto**: aplicación web (backend + frontend).
**Metas de rendimiento**:
- Guardado en menos de 2 s (SC-001).
- Bandeja abierta en menos de 3 s con 1.000 pendientes (SC-007).
- Búsqueda en milisegundos sobre 5.000 animales.
**Restricciones**:
- Sin conexión no hay ninguna llamada al servidor en el flujo de guardado (FR-003).
- Inmutable: solo `add` (FR-016).
- CI en menos de 90 s.
**Escala**: hasta 5.000 animales por finca y 1.000 eventos pendientes por dispositivo.

**Sin NEEDS CLARIFICATION**: todo quedó resuelto en la spec y en [research.md](research.md).

## Verificación de la Constitución

*Compuerta: se evalúa antes de la Fase 0 y se revisa después de la Fase 1.*

| Principio | Estado | Cómo se cumple |
|---|---|---|
| §1 Idioma | ✅ | Documentos e interfaz en español; código, códigos de tipo (`VACCINATION`…) y commits en inglés. Los estados `PENDIENTE_*` son términos de negocio fijados por la HU |
| §2 Aislamiento modular | ⚠️ Justificado | Todo el código va en `backend/app/features/offline_capture/` y `frontend/src/features/offline-capture/`. En `main.py` y `App.jsx` solo se añaden líneas al final; no se toca `package.json`. El retiro de la captura preliminar, `DEWORMING` en `/sync` y `npm test` en CI se piden por coordinación (ver Seguimiento de Complejidad) |
| §2 Desacoplamiento | ✅ | `din` como string; `farm_id` sin llave foránea; seed propio (R7) |
| §2 QUÉ vs. CÓMO | ✅ | La spec no menciona tecnología |
| §2 TDD | ✅ | Pruebas `pytest` y `node --test` antes de la implementación; casos compartidos (R5) |
| §3 Append-only | ✅ | Los eventos son inmutables desde que se guardan (FR-016); el almacén solo admite `add` |
| §3 Jerarquía SINIGÁN | ✅ N/A | No se modifican datos oficiales; el catálogo es semilla local |
| §3 Offline-first e idempotencia | ✅ | Guardado local primero, con y sin red (FR-004); `client_event_id` UUID generado en el dispositivo |
| §4 Seguridad | ✅ | `require_write_access` y finca activa en el catálogo; validación Pydantic; sin secretos. R11 documenta los datos locales |
| §5.1 WIP = 1 | ⚠️ | La implementación espera a que se fusione la HU-01 (R1) |
| §5.3 CI < 90 s | ✅ | Unas pocas pruebas backend nuevas; frontend sin dependencias nuevas |
| §5.4 Degradación elegante | ✅ | La captura nunca depende de la red; la sesión vencida no bloquea; los pendientes preliminares se conservan (R3) |

**Resultado**: pasa con 2 desviaciones justificadas. Revisión posterior al diseño: sin cambios.

## Estructura del Proyecto

### Documentación (esta funcionalidad)

```text
specs/002-offline-capture/
├── spec.md
├── plan.md                         # este archivo
├── research.md                     # R1–R11
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── captured-event.md           # API del catálogo, CapturedEvent, contrato interno
│   └── captured-event.cases.json   # casos compartidos backend/frontend
├── checklists/requirements.md
└── tasks.md                        # lo genera /speckit.tasks
```

### Código fuente

```text
backend/app/features/offline_capture/
├── __init__.py
├── models.py              # CatalogAnimal (offline_capture_animals)
├── schemas.py             # CapturedEvent, CatalogResponse, códigos de error
├── service.py             # catálogo por finca, seed idempotente
├── router.py              # GET /catalog
└── fixtures/catalog.json  # animales semilla por finca

backend/tests/
├── contract/test_offline_capture_catalog_api.py
└── unit/test_offline_capture_contract.py

frontend/src/features/offline-capture/
├── OfflineCapturePanel.jsx     # contenedor registrado en App.jsx
├── CaptureForm.jsx             # tipo, animal, campos por tipo
├── AnimalSearch.jsx            # búsqueda con sugerencias (R8)
├── PendingTray.jsx             # bandeja (FR-011)
├── EventDetail.jsx             # dos estados + verificación de autor (FR-012)
├── eventTypes.js               # tipos, unidades, etiquetas en español
├── eventValidation.js          # validador puro (R5)
├── buildCapturedEvent.js       # arma el evento (UUID, hora, autor, estados)
├── saveCapture.js              # valida + arma + guarda, sin guardado doble
├── pendingTrayModel.js         # modelo de vista puro de la bandeja
├── eventDetailModel.js         # modelo de vista puro del detalle
├── animalSearch.js             # filtro puro (R8)
├── legacyImport.js             # mapeo y copia de pendientes preliminares (R3)
├── captureRepository.js        # IndexedDB events, almacenamiento inyectable
├── catalogRepository.js        # IndexedDB catalog
├── catalogService.js           # descarga del catálogo
├── indexedDbStore.js           # adaptador IndexedDB mínimo
├── devSeed.js                  # generador de volumen, solo en modo desarrollo
└── *.test.js                   # node --test

Archivos compartidos (solo se añaden líneas):
backend/app/main.py      # importa el modelo, include_router(prefix="/offline-capture"), seed
frontend/src/App.jsx     # registra <OfflineCapturePanel />
```

**Decisión de estructura**: aplicación web con dos módulos verticales aislados, igual que `auth` y `sanitary_events`. El nombre de la carpeta del frontend usa guion (`offline-capture`), como `sanitary-events`.

## Orden de implementación

1. **Dependencia**: fusionar la HU-01 y rebasar la rama (R1).
2. **Contrato** (TDD):
   - escribir las pruebas `pytest` del esquema `CapturedEvent` contra `captured-event.cases.json` y verlas fallar;
   - implementar `schemas.py`.
3. **Catálogo backend** (TDD):
   - escribir las pruebas de `GET /offline-capture/catalog` (finca activa, roles, 401/403);
   - implementar el modelo, el seed, el servicio y el router;
   - registrarlo en `main.py`.
4. **Lógica pura del frontend** (TDD con `node --test`): `eventValidation` con los mismos casos, `buildCapturedEvent`, `animalSearch` (5.000 animales), `legacyImport`, y `captureRepository` y `catalogRepository` con almacenamiento en memoria.
5. **Adaptador IndexedDB** y **componentes** (formulario, búsqueda, bandeja, detalle). El guardado deshabilita el botón mientras escribe, para cumplir el caso límite del doble toque.
6. **Integración**:
   - `OfflineCapturePanel` en `App.jsx`, visible solo con `canCapture`;
   - copia de pendientes preliminares al montar.
7. **Coordinación**: redactar `coordination-sanitary-events.md` con el retiro de la vista preliminar, `DEWORMING` y los campos nuevos en `/sync` (HU-03), y el script `test` más su paso en CI.
8. **Validación**: `pytest`, `node --test src/features/offline-capture/`, `npm run lint`, `npm run build` y [quickstart.md](quickstart.md).

## Seguimiento de Complejidad

| Desviación | Por qué hace falta | Alternativa más simple descartada porque |
|---|---|---|
| Captura preliminar y nueva conviven hasta que se coordine el retiro | FR-018 exige retirarla, pero quitarla de `App.jsx` altera líneas de otro módulo (§2) | Borrarla directamente viola el aislamiento modular |
| Lectura de solo lectura de la base `bovinotech_offline` de otro módulo | FR-019: no perder los pendientes preliminares (§5.4) | Ignorarlos pierde registros operativos; modificarlos toca datos ajenos |
| `/sync` no acepta `DEWORMING` ni los campos nuevos | La HU-02 no envía al servidor; lo hará la HU-03 | Cambiar `/sync` aquí modifica el módulo `sanitary_events` |
| Las pruebas del frontend no corren en CI ni tienen script `npm test` | Añadirlas exige tocar `.github/workflows/ci.yml` y `package.json`, compartidos (§2); ambos se piden por coordinación | Se coordina; mientras tanto corren localmente antes del push (CONTRIBUTING, paso 3) |
| La implementación espera a la HU-01 | Requiere roles, finca activa y sesión offline (WIP = 1) | Duplicar lógica de `auth` crea dos fuentes de verdad |
