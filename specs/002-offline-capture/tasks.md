# Tareas: Captura offline de eventos sanitarios (HU-02)

**Entrada**: documentos de diseño en `specs/002-offline-capture/`
**Prerrequisitos**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Pruebas**: obligatorias (constitución §2 TDD). Cada prueba se escribe primero y se verifica que falle antes de implementar.

**Organización**: por historia de usuario, para implementarlas y probarlas de forma independiente.

## Formato: `[ID] [P?] [Historia] Descripción`

- **[P]**: puede ir en paralelo (archivos distintos, sin dependencias pendientes)
- **[Historia]**: US1, US2, US3 según [spec.md](spec.md)

## Convenciones de rutas

- Backend: `backend/app/features/offline_capture/`, pruebas en `backend/tests/`
- Frontend: `frontend/src/features/offline-capture/`, pruebas `*.test.js` junto al código (`node --test`)
- Archivos compartidos (solo se añaden líneas): `backend/app/main.py`, `frontend/src/App.jsx`. `package.json` no se toca
- Pruebas del frontend: `node --test src/features/offline-capture/` desde `frontend/`

---

## Fase 1: Preparación

**Propósito**: dependencia de la HU-01 y estructura de los módulos.

- [ ] T001 Verificar que el PR #3 (HU-01) esté fusionado en `main` y rebasar `feat/hu-02-offline-capture` sobre `main`; confirmar que `pytest` pasa completo antes de empezar (research R1)
- [ ] T002 [P] Crear el paquete `backend/app/features/offline_capture/` (`__init__.py`, `models.py`, `schemas.py`, `service.py`, `router.py`, `fixtures/`) vacío, según plan.md (Estructura)
- [ ] T003 [P] Crear la carpeta `frontend/src/features/offline-capture/` y comprobar que `node --test src/features/offline-capture/` corre desde `frontend/` (research R6). No modificar `package.json` (constitución §2)

---

## Fase 2: Fundamentos (bloquea todas las historias)

**Propósito**: contrato del evento, catálogo y almacenamiento local, que necesitan las 3 historias.

**⚠️ CRÍTICO**: ninguna historia empieza hasta completar esta fase.

### Pruebas (escribir primero, deben fallar)

- [ ] T004 [P] Prueba de contrato del esquema `CapturedEvent` en `backend/tests/unit/test_offline_capture_contract.py`: recorre `specs/002-offline-capture/contracts/captured-event.cases.json` (fijando `now`) y comprueba los códigos de error esperados, salvo `ANIMAL_NOT_IN_CATALOG`
- [ ] T005 [P] Prueba de contrato de `GET /offline-capture/catalog` en `backend/tests/contract/test_offline_capture_catalog_api.py`: `OPERARIO` y `VETERINARIO` reciben solo animales de su finca activa ordenados por `din`; `vet2@` con finca 2 recibe los de la finca 2; `DIRECTIVO` y `ADMINISTRADOR` → 403; sin token → 401 (contracts/captured-event.md §1)
- [ ] T006 [P] Prueba de `eventValidation.js` en `frontend/src/features/offline-capture/eventValidation.test.js` con los mismos casos de `captured-event.cases.json`, más `ANIMAL_NOT_IN_CATALOG` contra un catálogo de prueba
- [ ] T007 [P] Prueba del repositorio de eventos en `frontend/src/features/offline-capture/captureRepository.test.js` con almacenamiento en memoria: `add` guarda; repetir `add` con el mismo `clientEventId` falla y no sobrescribe; no existen métodos de actualizar ni borrar; `listPending` filtra por `authorEmail` y `farmId` y ordena por `fieldOccurredAt` descendente
- [ ] T008 [P] Prueba del repositorio de catálogo en `frontend/src/features/offline-capture/catalogRepository.test.js`: el reemplazo por finca borra solo los animales de esa finca; `findByDin` normaliza mayúsculas

### Implementación

- [ ] T009 Implementar `CapturedEvent` y los códigos de error en `backend/app/features/offline_capture/schemas.py` según data-model.md `CapturedEvent` (campos de `events.clientEventId`, `events.eventType`, `events.fieldOccurredAt` con tolerancia de 5 min en servidor, `events.product`, `events.doseQuantity`, `events.doseUnit`, `events.reason`, `events.finding`, `events.notes`, `events.syncStatus`, `events.validationStatus`, `events.origin`); hace pasar T004
- [ ] T010 [P] Crear el modelo `offline_capture_animals` en `backend/app/features/offline_capture/models.py` según data-model.md `offline_capture_animals.din`, `offline_capture_animals.farm_id` y la restricción única (`farm_id`, `din`)
- [ ] T011 [P] Crear `backend/app/features/offline_capture/fixtures/catalog.json` con animales ficticios en formato `DIN-DEMO-NNNNNN` para las fincas 1 y 2 (R7), sin datos reales
- [ ] T012 Implementar en `backend/app/features/offline_capture/service.py` el seed idempotente y la consulta del catálogo por finca (depende de T010 y T011)
- [ ] T013 Implementar `GET /catalog` en `backend/app/features/offline_capture/router.py` con `require_write_access` y `active_farm_id` de la HU-01; hace pasar T005 (depende de T012)
- [ ] T014 Registrar en `backend/app/main.py`, añadiendo líneas al final de cada bloque: importación del modelo, seed del catálogo e `include_router(prefix="/offline-capture", tags=["Captura offline"])`
- [ ] T015 [P] Implementar `frontend/src/features/offline-capture/eventTypes.js`: tipos (data-model.md `events.eventType`), unidades (data-model.md `events.doseUnit`), estados y etiquetas en español
- [ ] T016 Implementar `frontend/src/features/offline-capture/eventValidation.js` (puro) según contracts/captured-event.md, reglas de data-model.md `events.din`, `events.fieldOccurredAt`, `events.product`, `events.doseQuantity`, `events.doseUnit`, `events.reason`, `events.finding`, `events.notes` y la exención de `events.origin` = `LEGACY`; hace pasar T006 (depende de T015)
- [ ] T017 [P] Implementar `frontend/src/features/offline-capture/indexedDbStore.js`: adaptador mínimo para la base `bovinotech_offline_capture` con almacenes `events` (clave data-model.md `events.clientEventId`, índice `byAuthorFarm` sobre data-model.md `events.authorEmail` y `events.farmId`) y `catalog` (clave data-model.md `catalog.farmId` + `catalog.din`, índice `byFarm`) (R2)
- [ ] T018 Implementar `frontend/src/features/offline-capture/captureRepository.js` con almacenamiento inyectable, solo `add`, `listPending` y `getAll`; hace pasar T007 (depende de T017)
- [ ] T019 Implementar `frontend/src/features/offline-capture/catalogRepository.js` y `catalogService.js` según data-model.md `catalog.name` y `catalog.downloadedAt` (descarga con el token; si falla la red, conserva la copia anterior); hace pasar T008 (depende de T017)

**Punto de control**: contrato congelado, catálogo disponible y almacenamiento listo.

---

## Fase 3: Historia de Usuario 1 - Registrar un evento sanitario sin conexión (Prioridad: P1) 🎯 MVP

**Objetivo**: el operario guarda, sin conexión, un evento válido de cualquiera de los 4 tipos en menos de 2 s; los inválidos se rechazan con el motivo.

**Prueba independiente**: con la red desactivada y el catálogo descargado, guardar un evento de cada tipo y rechazar uno con animal inexistente y otro sin datos obligatorios (quickstart.md, pasos 1 a 3 y 8).

### Pruebas de la Historia 1 (escribir primero, deben fallar)

- [ ] T020 [P] [US1] Prueba de `buildCapturedEvent` en `frontend/src/features/offline-capture/buildCapturedEvent.test.js`: genera un UUID v4 distinto por llamada; `fieldOccurredAt` y `savedAt` toman el reloj inyectado; autor (`authorEmail`) y finca del contexto; `authorVerificationPending` refleja la sesión vencida; estados iniciales `PENDIENTE_SINCRONIZACION` y `PENDIENTE_VALIDACION`; `origin` = `OFFLINE_CAPTURE`
- [ ] T021 [P] [US1] Prueba de `animalSearch` en `frontend/src/features/offline-capture/animalSearch.test.js`: coincidencia por `din` o nombre sin distinguir mayúsculas ni tildes; máximo 10 sugerencias con las coincidencias al inicio primero; nunca autoselecciona; con 5.000 animales responde en menos de 50 ms (SC-001)
- [ ] T022 [P] [US1] Prueba del flujo de guardado en `frontend/src/features/offline-capture/saveCapture.test.js`: válido → se guarda una vez; inválido → no se guarda y devuelve los códigos; dos llamadas concurrentes con el mismo formulario guardan un solo evento (caso límite de doble toque); si `add` falla (por ejemplo, almacenamiento lleno), no se confirma el guardado, se devuelve `STORAGE_WRITE_FAILED` con el mensaje "No se pudo guardar el evento en el dispositivo" y los eventos anteriores siguen intactos; el guardado no llama a `fetch` (FR-004, FR-017)

### Implementación de la Historia 1

- [ ] T023 [P] [US1] Implementar `frontend/src/features/offline-capture/buildCapturedEvent.js` según data-model.md `events.clientEventId`, `events.fieldOccurredAt`, `events.savedAt`, `events.animalName`, `events.authorEmail`, `events.farmId`, `events.authorVerificationPending`, `events.syncStatus`, `events.validationStatus` y `events.origin`; hace pasar T020
- [ ] T024 [P] [US1] Implementar `frontend/src/features/offline-capture/animalSearch.js` (R8); hace pasar T021
- [ ] T025 [US1] Implementar `frontend/src/features/offline-capture/saveCapture.js`: valida, arma el evento y llama a `captureRepository.add`, con bloqueo contra el guardado doble; hace pasar T022, incluido el fallo de escritura (depende de T016, T018, T023)
- [ ] T026 [P] [US1] Implementar `frontend/src/features/offline-capture/AnimalSearch.jsx`: campo de búsqueda, lista de sugerencias con `din` y nombre, y aviso de catálogo vacío
- [ ] T027 [US1] Implementar `frontend/src/features/offline-capture/CaptureForm.jsx`: tipo de evento, animal, campos según el tipo (producto, cantidad y unidad de dosis, motivo, hallazgo, observaciones), mensajes de error por campo en español, botón deshabilitado mientras guarda, sin campo de hora (FR-006) (depende de T025, T026)
- [ ] T028 [US1] Implementar `frontend/src/features/offline-capture/OfflineCapturePanel.jsx`: usa `useAuth()` de la HU-01 (`canCapture`, `farmId`, `captureNeedsAuthorVerification`), descarga el catálogo si hay conexión y muestra cuántos animales hay disponibles sin conexión (depende de T019, T027)
- [ ] T029 [US1] Registrar `<OfflineCapturePanel />` en `frontend/src/App.jsx` añadiendo líneas al final del bloque correspondiente, visible solo si `canCapture` (US1-6, FR-014) (depende de T028)

**Punto de control**: la Historia 1 funciona y se prueba sola (MVP).

---

## Fase 4: Historia de Usuario 2 - Bandeja de pendientes que sobrevive al cierre (Prioridad: P1)

**Objetivo**: tras cerrar y reabrir la aplicación sin red, los eventos siguen en la bandeja con su hora original, incluidos los de la captura preliminar.

**Prueba independiente**: guardar varios eventos sin conexión, cerrar la pestaña, reabrir sin red y verificar la bandeja (quickstart.md, pasos 5, 6 y 10).

### Pruebas de la Historia 2 (escribir primero, deben fallar)

- [ ] T030 [P] [US2] Prueba de `legacyImport` en `frontend/src/features/offline-capture/legacyImport.test.js`: copia solo los registros `PENDING_SYNC` y `REJECTED`; conserva `clientEventId`, `din`, `eventType`, `fieldOccurredAt`, `notes` y pasa `dose` a `doseQuantity`; marca `origin` = `LEGACY` y los estados iniciales; repetir la copia no duplica; nunca escribe en la fuente
- [ ] T031 [P] [US2] Prueba de la bandeja en `frontend/src/features/offline-capture/pendingTray.test.js` sobre el modelo de vista: orden del más reciente al más antiguo, hora original formateada en hora local, filtro por `authorEmail` y finca activa, sin acciones de editar ni borrar; con 1.000 eventos se arma en menos de 300 ms (SC-007)

### Implementación de la Historia 2

- [ ] T032 [US2] Implementar `frontend/src/features/offline-capture/legacyImport.js`: abre la base `bovinotech_offline` sin versión y aborta si no existe, lee `sanitary_events` en modo solo lectura y copia con `add` según data-model.md `events.origin` (R3); hace pasar T030
- [ ] T033 [P] [US2] Implementar `frontend/src/features/offline-capture/pendingTrayModel.js` (puro) y `PendingTray.jsx` (animal, tipo, hora original de captura, ambos estados, marca "Capturado con la versión anterior" en `LEGACY`); hace pasar T031
- [ ] T034 [US2] Integrar en `OfflineCapturePanel.jsx`: copia de pendientes preliminares al montar y recarga de la bandeja tras cada guardado (depende de T028, T032, T033)

**Punto de control**: las Historias 1 y 2 funcionan juntas y por separado.

---

## Fase 5: Historia de Usuario 3 - Distinguir los estados de sincronización y validación (Prioridad: P2)

**Objetivo**: el detalle muestra por separado, con texto explícito, que el evento está pendiente de sincronización y pendiente de validación veterinaria, y avisa si falta verificar el autor.

**Prueba independiente**: capturar un evento, abrir su detalle y comprobar las dos indicaciones de texto (quickstart.md, pasos 7 y 9).

### Pruebas de la Historia 3 (escribir primero, deben fallar)

- [ ] T035 [P] [US3] Prueba del modelo de detalle en `frontend/src/features/offline-capture/eventDetailModel.test.js`: devuelve dos estados separados con textos "Pendiente de sincronización" y "Pendiente de validación veterinaria"; añade "Pendiente de verificación de autor" solo si `authorVerificationPending`; incluye solo los campos del tipo; no expone acciones de edición

### Implementación de la Historia 3

- [ ] T036 [US3] Implementar `frontend/src/features/offline-capture/eventDetailModel.js` (puro) y `EventDetail.jsx`, donde cada estado lleva texto y no depende solo del color, según data-model.md `events.syncStatus`, `events.validationStatus` y `events.authorVerificationPending`; hace pasar T035
- [ ] T037 [US3] Abrir `EventDetail` al tocar un evento en `PendingTray.jsx` (depende de T033, T036)

**Punto de control**: las 3 historias funcionan.

---

## Fase 6: Pulido y transversales

- [ ] T038 [P] Implementar `frontend/src/features/offline-capture/devSeed.js` para generar 5.000 animales y 1.000 eventos ficticios, disponible solo cuando `import.meta.env.DEV` (quickstart.md, paso 11)
- [ ] T039 [P] Redactar `specs/002-offline-capture/coordination-sanitary-events.md` para el responsable de `sanitary_events`: retirar `OfflineSanitaryCapture` de `App.jsx` (FR-018); que la HU-03 acepte en `/sync` `DEWORMING`, `product`, `doseQuantity`, `doseUnit`, `reason`, `finding`, `authorVerificationPending` y `farmId`; que `FUTURE_TIMESTAMP` en el servidor marque el evento para revisión en lugar de descartarlo (contracts/captured-event.md); y que se añadan el script `test` a `frontend/package.json` y su paso a `.github/workflows/ci.yml` (plan, Seguimiento de Complejidad)
- [ ] T040 [P] Revisión `qa-seguridad`: sin secretos, catálogo limitado a la finca activa, Bandit sin hallazgos (`bandit -r app -ll`), seed sin datos reales
- [ ] T041 Validación final: `pytest` completo (incluidas las pruebas de `auth`, `sanitary_events` y `sinigan`, en menos de 90 s), `node --test src/features/offline-capture/`, `npm run lint`, `npm run build` y validación manual de [quickstart.md](quickstart.md); registrar en la descripción del PR que FR-018 queda pendiente de la solicitud de coordinación

---

## Dependencias y orden de ejecución

### Dependencias entre fases

- **Preparación (Fase 1)**: T001 bloquea todo (HU-01 fusionada).
- **Fundamentos (Fase 2)**: dependen de la Fase 1 y bloquean todas las historias.
- **US1 (Fase 3)**: depende de la Fase 2. Es el MVP.
- **US2 (Fase 4)**: depende de la Fase 2; T034 integra con el panel de US1 (T028).
- **US3 (Fase 5)**: depende de la Fase 2; T037 se engancha a la bandeja de US2 (T033).
- **Pulido (Fase 6)**: al final; T039 puede redactarse en cualquier momento.

### Dentro de cada historia

Pruebas (fallan) → lógica pura → componentes → integración.

### Oportunidades de paralelismo

- Fase 2: T004 a T008 en paralelo; luego T010, T011, T015 y T017 en paralelo.
- US1: T020, T021 y T022 en paralelo; luego T023, T024 y T026.
- US2: T030 y T031 en paralelo.
- US3 puede avanzar en paralelo con US2 hasta T037.

## Ejemplo de paralelismo: Historia 1

```bash
# Pruebas de US1 juntas:
Tarea: "T020 Prueba de buildCapturedEvent en buildCapturedEvent.test.js"
Tarea: "T021 Prueba de animalSearch en animalSearch.test.js"
Tarea: "T022 Prueba del flujo de guardado en saveCapture.test.js"

# Implementación pura de US1 junta:
Tarea: "T023 buildCapturedEvent.js"
Tarea: "T024 animalSearch.js"
Tarea: "T026 AnimalSearch.jsx"
```

## Estrategia de implementación

### MVP primero (solo la Historia 1)

1. Fases 1 y 2.
2. Fase 3 (US1).
3. **Parar y validar**: quickstart.md, pasos 1 a 3 y 8.

### Entrega incremental

1. Fundamentos → contrato y catálogo listos.
2. US1 → guardar sin conexión (MVP).
3. US2 → bandeja persistente y pendientes preliminares.
4. US3 → detalle con los dos estados.
5. Pulido → coordinación, QA y validación final.

## Notas

- [P] = archivos distintos, sin dependencias pendientes.
- Hacer commit al cerrar cada tarea o grupo lógico, con mensajes en inglés.
- No modificar `frontend/src/core/offline/` ni el módulo `sanitary-events`; los cambios ahí van por coordinación (T039).
