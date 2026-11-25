---
description: "Tareas TDD para HU-07 Registro genealógico y advertencia preventiva de consanguinidad"
---

# Tareas de Implementación: Registro genealógico y advertencia preventiva de consanguinidad

**Entrada**: Documentos de diseño en `specs/007-genealogy/`

**Prerrequisitos**: `spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/api.md`, `contracts/frontend.md` y `quickstart.md`.

**Metodología TDD Obligatoria**: Cada fase escribe primero sus pruebas (Red), las ejecuta y confirma que fallan por la razón esperada, y solo entonces implementa (Green). Las pruebas nunca son opcionales.

**Organización**: Una fase por Historia de Usuario (US1 registro con validación, US2 árbol, US3 consanguinidad). WIP = 1: completar cada historia antes de activar la siguiente.

**Alcance de archivos**: solo `backend/app/features/genealogy/`, `frontend/src/features/genealogy/`, `backend/tests/**/test_genealogy_*.py`, `backend/tests/fixtures/genealogy_factory.py` y, en la fase final, los puntos de integración `backend/app/main.py` y `frontend/src/App.jsx`. No modificar `backend/tests/conftest.py` ni otros módulos.

**Aclaraciones resueltas** (sesión 2026-11-24, confirmadas por el usuario): R1, el OPERARIO propone vínculos que quedan `PENDIENTE_VALIDACION` y el VETERINARIO los valida; R2, la ventana de 3 generaciones se cuenta desde cada candidato al cruce. Todas las tareas son definitivas.

## Convención de Formato: `[ID] [P?] [Historia] Descripción`

- **[P]**: paralelizable (archivos distintos, sin dependencias pendientes).
- **[USn]**: historia de usuario de la spec.

---

## Fase 1: Preparación del Módulo Aislado

**Propósito**: Esqueletos y semilla propia del módulo.

- [X] T001 Crear el paquete backend con `backend/app/features/genealogy/__init__.py` y la carpeta `backend/app/features/genealogy/fixtures/`.
- [X] T002 [P] Crear `frontend/src/features/genealogy/genealogyConstants.js` con los literales exactos `CÁLCULO_COMPLETO` y `CÁLCULO_PARCIAL_POR_DATOS_INSUFICIENTES`, estados de vínculo (`VALIDADO`, `PENDIENTE_VALIDACION`, `NO_REGISTRADO`, `CORREGIDO`, `RECHAZADO`), umbrales `RISK_HIGH_MIN = 0.125` y `RISK_MODERATE_MIN = 0.0625`, y las claves `bovinotech_offline_genealogy_queue` y `bovinotech_offline_genealogy_rejected` (data-model.md: constantes de dominio; contracts/frontend.md).
- [X] T003 [P] Crear la semilla `backend/app/features/genealogy/fixtures/pedigree_seed.json` con las 19 fichas `DIN-DEMO-000101`–`000119` y sus vínculos exactamente como la tabla "Semilla propia" de data-model.md (finca 1; campos `GenealogyAnimal.din`, `GenealogyAnimal.name`, `GenealogyAnimal.sex`, `GenealogyAnimal.birth_date`, `GenealogyAnimal.origin`; vínculos con `GenealogyParentLink.parent_role` y `GenealogyParentLink.initial_status`, incluido Paloma→Rayo como `PENDIENTE_VALIDACION`); sin datos reales.

---

## Fase 2: Fundación del Módulo (bloquea a todas las historias)

**Propósito**: Persistencia append-only, contratos base, contexto de rol/finca y utilidades de prueba compartidas por US1–US3.

### Pruebas (Red) 🔴

- [X] T004 Crear la factoría de pruebas `backend/tests/fixtures/genealogy_factory.py`: engine SQLite en memoria con `StaticPool`, `FastAPI()` propia con el router de genealogía montado en `/genealogy`, override de `get_db` y de `get_current_user` con un usuario conmutable (`SimpleNamespace(id, role_value, active_farm_id)`), y constructores de fichas y vínculos (patrón de `backend/tests/test_productivity.py`).
- [X] T005 [P] Escribir `backend/tests/unit/test_genealogy_models.py`: unicidad (`farm_id`, `din`) y (`farm_id`, `client_event_id`) en fichas; unicidad (`farm_id`, `client_event_id`) y (`farm_id`, `offspring_din`, `parent_role`, `sequence_no`) en vínculos; unicidad de `link_id` en validaciones; la semilla se carga dos veces sin duplicar ni sobrescribir; confirmar fallo.

### Implementación (Green) 🟢

- [X] T006 Definir modelos SQLAlchemy de solo inserción en `backend/app/features/genealogy/models.py`, sin FK a otras HU, conforme a data-model.md: `GenealogyAnimal.id`, `GenealogyAnimal.client_event_id`, `GenealogyAnimal.farm_id`, `GenealogyAnimal.din`, `GenealogyAnimal.name`, `GenealogyAnimal.sex`, `GenealogyAnimal.birth_date`, `GenealogyAnimal.origin`, `GenealogyAnimal.registered_by`, `GenealogyAnimal.registered_at`; `GenealogyParentLink.id`, `GenealogyParentLink.client_event_id`, `GenealogyParentLink.farm_id`, `GenealogyParentLink.offspring_din`, `GenealogyParentLink.parent_din`, `GenealogyParentLink.parent_role`, `GenealogyParentLink.sequence_no`, `GenealogyParentLink.corrected_event_id`, `GenealogyParentLink.correction_reason`, `GenealogyParentLink.initial_status`, `GenealogyParentLink.author_id`, `GenealogyParentLink.author_role`, `GenealogyParentLink.created_at`; `GenealogyLinkValidation.id`, `GenealogyLinkValidation.link_id`, `GenealogyLinkValidation.farm_id`, `GenealogyLinkValidation.decision`, `GenealogyLinkValidation.reason`, `GenealogyLinkValidation.validator_id`, `GenealogyLinkValidation.validated_at`; con las restricciones de unicidad de T005.
- [X] T007 Crear la base de contratos en `backend/app/features/genealogy/schemas.py`: modelo base camelCase con `populate_by_name`, modelos de entrada con `extra="forbid"`, patrón DIN `^DIN-DEMO-[0-9]{6}$` con normalización a mayúsculas, enums `Sex` (`MACHO|HEMBRA`), `Origin`, `ParentRole` (`SIRE|DAM`), `LinkStatus` y `Decision` (data-model.md).
- [X] T008 Crear en `backend/app/features/genealogy/router.py` el `APIRouter`, el helper de contexto (403 `NO_ACTIVE_FARM` / `ROLE_NOT_ALLOWED`, `farm_id` desde `user.active_farm_id`) con los conjuntos de roles de research.md R11, y el helper de errores `{"message", "code"}`; y en `backend/app/features/genealogy/service.py` la función `seed_genealogy(db=None)` idempotente que carga `fixtures/pedigree_seed.json` con UUID v5 deterministas para `client_event_id`. Ejecutar T005 hasta verde.

**Punto de control**: Tablas, restricciones y semilla verificadas; ninguna historia empieza antes.

---

## Fase 3: Historia de Usuario 1 - Registrar progenitores con validación genealógica (Prioridad: P1) 🎯 MVP

**Objetivo**: Registrar fichas y vínculos padre/madre con validación anti-ciclos, de sexo y de fechas; corrección append-only; validación veterinaria de vínculos pendientes; captura offline idempotente.

**Prueba Independiente**: Con la semilla, registrar el padre de Bruma (`DIN-DEMO-000119`), repetir con el mismo `clientEventId` (un único vínculo), y comprobar los rechazos `PARENT_BIRTH_DATE_NOT_BEFORE_OFFSPRING`, `GENEALOGY_CYCLE` y `PARENT_SEX_MISMATCH` de quickstart.md paso 4; corregir el vínculo y ver el original `CORREGIDO` intacto.

### Pruebas Automatizadas TDD (Red) 🔴

- [X] T009 [P] [US1] Escribir pruebas de anti-ciclos puras en `backend/tests/unit/test_genealogy_pedigree.py`: el progenitor igual a la cría es ciclo; un hijo, nieto y tataranieto (más de 3 generaciones) de la cría son ciclo; un animal no emparentado o un ancestro no lo son; los vínculos `RECHAZADO` y `CORREGIDO` no cuentan. Confirmar fallo.
- [X] T010 [P] [US1] Escribir pruebas de servicio en `backend/tests/unit/test_genealogy_link_rules.py`: orden de validación de research.md R6 (existencia → ciclo → sexo → fecha → posición) con su código; fecha igual a la de la cría rechazada y un día antes aceptada; `birthDate` futura rechazada (`BIRTH_DATE_IN_FUTURE`); `PARENT_ALREADY_REGISTERED` con vínculo vigente; corrección con `sequence_no` + 1, `corrected_event_id` y motivo obligatorio; corregir un vínculo no vigente → `LINK_NOT_CURRENT`; la fila original no cambia (comparar todos sus campos antes y después) y el número de filas solo crece; estado derivado `CORREGIDO` > decisión > estado inicial; idempotencia (mismo `client_event_id` y contenido → duplicado; contenido distinto → `CLIENT_EVENT_ID_CONFLICT`). Confirmar fallo.
- [X] T011 [P] [US1] Ampliar `backend/tests/unit/test_genealogy_link_rules.py` con: vínculo de OPERARIO nace `PENDIENTE_VALIDACION`, de VETERINARIO nace `VALIDADO`; validar un pendiente lo deja `VALIDADO`; rechazar exige motivo, deja `RECHAZADO` y libera la posición para un nuevo registro con `sequence_no` = máximo + 1; validar un vínculo no pendiente → `LINK_NOT_PENDING`. Confirmar fallo.
- [X] T012 [P] [US1] Escribir pruebas de contrato en `backend/tests/contract/test_genealogy_api.py` para `GET/POST /genealogy/animals`, `POST /genealogy/links`, `POST /genealogy/links/{id}/corrections`, `POST /genealogy/links/{id}/validations` y `GET /genealogy/animals/{din}/links`: códigos 201/200 `DUPLICADO`/404/409/422 y cuerpos camelCase según contracts/api.md; criterio de aceptación 4 de la HU con los casos de quickstart.md paso 4. Confirmar fallo.
- [X] T013 [P] [US1] Escribir pruebas de seguridad en `backend/tests/security/test_genealogy_authorization.py`: matriz de escritura de research.md R11 (DIRECTIVO y ADMINISTRADOR → 403 al registrar; OPERARIO → 403 al registrar fichas, corregir y validar); sin finca activa → 403; ficha o vínculo de otra finca → 404 sin revelar datos; `farmId`, `authorId` o `status` en el cuerpo → 422; el router no expone `PUT`, `PATCH` ni `DELETE` (inspección de `router.routes`). Confirmar fallo.
- [X] T014 [P] [US1] Escribir `frontend/src/features/genealogy/genealogyOfflineQueue.test.js` (`node:test`): esquema `{client_event_id, timestamp_utc, status, payload}`; `enqueue` deduplica por `client_event_id`; sincronización FIFO; 201/200 eliminan; error de red o 5xx → `failed` reintentable; 4xx → se mueve a la lista de rechazados con `{code, message}`; `pendingCount()`. Confirmar fallo.
- [X] T015 [P] [US1] Escribir `frontend/src/features/genealogy/genealogyValidation.test.js`: auto-vínculo, sexo incompatible con el rol y fecha igual o posterior rechazados localmente con mensaje en español; vínculo válido aceptado. Confirmar fallo.

### Implementación Backend (Green) 🟢

- [X] T016 [US1] Implementar en `backend/app/features/genealogy/pedigree.py` la construcción del grafo de vínculos vigentes y la función de detección de ciclo (búsqueda en anchura descendente desde la cría, sin límite de generaciones). Ejecutar T009 hasta verde.
- [X] T017 [US1] Completar en `backend/app/features/genealogy/schemas.py` los contratos `AnimalCreate`, `AnimalRead`, `LinkCreate`, `LinkCorrection`, `LinkValidationCreate` y `LinkRead`, respetando data-model.md: `GenealogyAnimal.name` (1–120), `GenealogyAnimal.birth_date` (no futura), `GenealogyParentLink.correction_reason` y `GenealogyLinkValidation.reason` (1–500 no vacíos; obligatorio en corrección y en `RECHAZADO`), `GenealogyParentLink.client_event_id` (UUID).
- [X] T018 [US1] Implementar en `backend/app/features/genealogy/service.py`: registro de fichas e idempotencia; resolución de vínculo vigente y derivación de estado (data-model.md: Estados derivados); `register_link` con el orden de validación R6 y `GenealogyParentLink.initial_status` según `GenealogyParentLink.author_role`; `correct_link` con `GenealogyParentLink.sequence_no` + 1 y `GenealogyParentLink.corrected_event_id`; `validate_link` insertando `GenealogyLinkValidation.decision`; manejo de `IntegrityError` por carrera como 409; sin ninguna sentencia `UPDATE` ni `DELETE`. Ejecutar T010 y T011 hasta verde.
- [X] T019 [US1] Implementar en `backend/app/features/genealogy/router.py` `GET/POST /animals`, `POST /links`, `POST /links/{link_id}/corrections`, `POST /links/{link_id}/validations` y `GET /animals/{din}/links` con los roles de R11 y los códigos de contracts/api.md. Ejecutar T012 y T013 hasta verde.

### Implementación Frontend (Green) 🟢

- [X] T020 [P] [US1] Implementar `frontend/src/features/genealogy/genealogyOfflineQueue.js` y `frontend/src/features/genealogy/genealogyValidation.js` según contracts/frontend.md. Ejecutar T014 y T015 hasta verde.
- [X] T021 [US1] Implementar `frontend/src/features/genealogy/genealogyService.js` (cliente `/genealogy` con `VITE_API_URL`, token Bearer, errores con `code` y `message`, error de red distinguible) siguiendo el patrón de `frontend/src/features/productivity/productivityService.js`.
- [X] T022 [US1] Implementar `frontend/src/features/genealogy/ParentLinkForm.jsx` (búsqueda de cría y progenitor por DIN/número con `inputMode="numeric"`, rol padre/madre, motivo en corrección, encolado offline y prevalidación local) y `frontend/src/features/genealogy/GenealogyView.jsx` con la pestaña "Registrar", contador de pendientes, lista de rechazados con motivo y acciones filtradas por rol; estilos mobile-first con objetivos táctiles ≥ 48x48 px y alto contraste en `frontend/src/features/genealogy/genealogy.css`.
- [X] T023 [US1] Exportar `GenealogyView` y `navItem` (`id`, `label`, `icon`, `requiredRole`) en `frontend/src/features/genealogy/index.js` según contracts/frontend.md.

**Punto de control US1**: Pruebas T009–T015 en verde; criterio 4 de la HU demostrable; ningún vínculo se modifica tras corrección o validación.

---

## Fase 4: Historia de Usuario 2 - Consultar el árbol genealógico de tres generaciones (Prioridad: P1)

**Objetivo**: Árbol de 3 generaciones con 14 posiciones fijas, estado de cada vínculo y faltantes explícitos.

**Prueba Independiente**: `GET /genealogy/animals/DIN-DEMO-000101/tree` devuelve 14 posiciones `VALIDADO` e `isComplete: true`; `DIN-DEMO-000116` muestra `dam` `PENDIENTE_VALIDACION` y sus ancestros `NO_REGISTRADO`.

### Pruebas Automatizadas TDD (Red) 🔴

- [X] T024 [P] [US2] Ampliar `backend/tests/unit/test_genealogy_pedigree.py` con pruebas de árbol puro: siempre 14 posiciones en el orden fijo de contracts/api.md; generación 1–3 y rol correctos; una posición vacía propaga `NO_REGISTRADO` a sus ancestros; ancestros más allá de la 3.ª generación no aparecen; `missing_count`/`is_complete` correctos; vínculos pendientes incluidos, `RECHAZADO` y `CORREGIDO` excluidos (solo aparece el vigente). Confirmar fallo.
- [X] T025 [P] [US2] Ampliar `backend/tests/contract/test_genealogy_api.py` con `GET /genealogy/animals/{din}/tree`: criterio de aceptación 1 de la HU con la semilla de Aurora; árbol incompleto de Rayo; tras una corrección el árbol muestra el nuevo progenitor y `GET .../links` conserva el anterior `CORREGIDO` con motivo y autor; DIN inexistente → 404. Confirmar fallo.
- [X] T026 [P] [US2] Ampliar `backend/tests/security/test_genealogy_authorization.py`: los cuatro roles leen árbol e historial de su finca; usuario de otra finca → 404. Confirmar fallo.
- [X] T027 [P] [US2] Escribir `frontend/src/features/genealogy/genealogyPresentation.test.js` para `linkStatusLabel` (cinco estados en español) y la agrupación de las 14 posiciones por generación. Confirmar fallo.

### Implementación (Green) 🟢

- [X] T028 [US2] Implementar en `backend/app/features/genealogy/pedigree.py` la enumeración de posiciones y `build_tree` conforme a data-model.md: `PedigreePosition.position`, `PedigreePosition.generation`, `PedigreePosition.role`, `PedigreePosition.status`, `PedigreePosition.link_id`, `PedigreePosition.animal`; `PedigreeTree.expected_count`, `PedigreeTree.missing_count`, `PedigreeTree.is_complete`. Ejecutar T024 hasta verde.
- [X] T029 [US2] Añadir `TreeRead`/`PedigreePositionRead` en `backend/app/features/genealogy/schemas.py`, `get_tree` en `backend/app/features/genealogy/service.py` (una carga de fichas y vínculos por finca) y `GET /animals/{din}/tree` en `backend/app/features/genealogy/router.py`. Ejecutar T025 y T026 hasta verde.
- [X] T030 [P] [US2] Implementar `linkStatusLabel` y la agrupación por generación en `frontend/src/features/genealogy/genealogyPresentation.js`. Ejecutar T027 hasta verde.
- [X] T031 [US2] Implementar `frontend/src/features/genealogy/PedigreeTree.jsx` (desplegable por generación en < 768 px, cuadrícula en escritorio, distinción visual de validado/pendiente/no registrado, indicador de árbol incompleto, rótulo "dato en caché" con fecha cuando se muestra el último árbol sin conexión) e integrarlo en la pestaña "Árbol" de `frontend/src/features/genealogy/GenealogyView.jsx`, con el historial de vínculos del animal.

**Punto de control US2**: Criterio 1 de la HU demostrable con la semilla; posiciones faltantes siempre explícitas.

---

## Fase 5: Historia de Usuario 3 - Evaluar un cruce y el indicador de consanguinidad (Prioridad: P2)

**Objetivo**: Advertencia preventiva con ancestro común y coeficiente de Wright; `CÁLCULO_PARCIAL_POR_DATOS_INSUFICIENTES` sin 0 % como certeza.

**Prueba Independiente**: Rayo × Aurora → advertencia 12,5 % `ALTO` mínimo; Titán × Aurora → 25 %; indicador de Lucero → parcial con `coefficient: null`.

### Pruebas Automatizadas TDD (Red) 🔴

- [X] T032 [P] [US3] Ampliar `backend/tests/unit/test_genealogy_pedigree.py` con grafos sintéticos completos de 3 generaciones por candidato: hermanos completos 25 %; padre × hija 25 % (`n1 = 0`); medios hermanos 12,5 %; dobles primos hermanos 12,5 %; primos hermanos 6,25 %; medios primos hermanos 3,125 %; primos segundos 1,5625 %; sin ancestros comunes y árbol completo → 0.0 con `CÁLCULO_COMPLETO`; independencia de caminos (los ancestros de un ancestro común alcanzados solo a través de él no suman); varios ancestros comunes ordenados por contribución y DIN; comparaciones exactas de igualdad. Confirmar fallo.
- [X] T033 [P] [US3] Ampliar `backend/tests/unit/test_genealogy_pedigree.py` con reglas de datos insuficientes y riesgo: parcial con ancestro común → coeficiente con `coefficient_is_minimum = true`; parcial sin ancestros comunes → `coefficient is None`, nunca 0; animal sin padre o madre → `reason = PARENTS_NOT_REGISTERED`, `coefficient is None`; `missing_ancestors` lista todas las posiciones vacías por candidato; `includes_pending_links`; umbrales exactos (0.125 → `ALTO`, 0.0625 → `MODERADO`, 0.03125 → `BAJO`, sin comunes → nulo); `warning` verdadero con cualquier ancestro común. Confirmar fallo.
- [X] T034 [P] [US3] Ampliar `backend/tests/contract/test_genealogy_api.py` con `GET /genealogy/matings/evaluation` y `GET /genealogy/animals/{din}/inbreeding`: criterios de aceptación 2 y 3 de la HU con la semilla (Rayo × Aurora, Titán × Aurora, Lucero); escenarios 3–6 de la US3 de la spec; literal exacto `CÁLCULO_PARCIAL_POR_DATOS_INSUFICIENTES` en JSON UTF-8; mismo animal o sexos invertidos → 422 `INVALID_MATING_CANDIDATES`; candidato inexistente → 404. Confirmar fallo.
- [X] T035 [P] [US3] Ampliar `backend/tests/security/test_genealogy_authorization.py`: VETERINARIO, ADMINISTRADOR y DIRECTIVO evalúan; OPERARIO → 403; candidatos de otra finca → 404. Confirmar fallo.
- [X] T036 [P] [US3] Ampliar `frontend/src/features/genealogy/genealogyPresentation.test.js` con `formatCoefficient` (nunca produce "0 %" si el estado es parcial; `null` → "Datos insuficientes"; parcial con valor → "≥ … (mínimo estimado)"; completo sin comunes → "0 % (sin ancestros comunes en 3 generaciones)") y `riskTone`. Confirmar fallo.

### Implementación (Green) 🟢

- [X] T037 [US3] Implementar en `backend/app/features/genealogy/pedigree.py` los caminos ascendentes por candidato dentro de `GENERATION_WINDOW` (incluido el propio candidato), el cálculo de Wright con independencia de caminos, `classify_risk` y `assess`, conforme a data-model.md: `CommonAncestor.din`, `CommonAncestor.contribution`, `CommonAncestor.paths`; `InbreedingAssessment.calculation_status`, `InbreedingAssessment.coefficient`, `InbreedingAssessment.coefficient_percent`, `InbreedingAssessment.coefficient_is_minimum`, `InbreedingAssessment.warning`, `InbreedingAssessment.risk_level`, `InbreedingAssessment.common_ancestors`, `InbreedingAssessment.missing_ancestors`, `InbreedingAssessment.reason`, `InbreedingAssessment.includes_pending_links`, `InbreedingAssessment.generation_window`, `InbreedingAssessment.message`. Ejecutar T032 y T033 hasta verde.
- [X] T038 [US3] Añadir `InbreedingAssessmentRead` y `CommonAncestorRead` en `backend/app/features/genealogy/schemas.py`; `assess_mating` y `assess_animal` en `backend/app/features/genealogy/service.py` (validación de candidatos, indicador individual como padre × madre); `GET /matings/evaluation` y `GET /animals/{din}/inbreeding` en `backend/app/features/genealogy/router.py`. Ejecutar T034 y T035 hasta verde.
- [X] T039 [P] [US3] Implementar `formatCoefficient` y `riskTone` en `frontend/src/features/genealogy/genealogyPresentation.js`. Ejecutar T036 hasta verde.
- [X] T040 [US3] Implementar `frontend/src/features/genealogy/MatingEvaluation.jsx` (selección de macho y hembra, indicador individual, advertencia destacada por nivel de riesgo con contraste WCAG AA, lista de ancestros comunes con caminos, posiciones faltantes, aviso de vínculos pendientes, texto del estado de cálculo, "no disponible sin conexión" o último resultado rotulado "dato en caché") e integrarlo en la pestaña "Evaluar cruce" de `frontend/src/features/genealogy/GenealogyView.jsx`, visible solo para VETERINARIO, ADMINISTRADOR y DIRECTIVO.

**Punto de control US3**: Criterios 2 y 3 de la HU demostrables; ninguna respuesta ni vista muestra 0 % con cálculo parcial.

---

## Fase 6: Integración en Puntos Compartidos y Verificación Final

- [X] T041 Registrar en `backend/app/main.py`, al final de cada bloque correspondiente y sin alterar rutas existentes: import de `GenealogyAnimal`, `GenealogyParentLink` y `GenealogyLinkValidation` (`# noqa: F401`), import del router y de `seed_genealogy`, llamada `seed_genealogy()` tras `Base.metadata.create_all` y las semillas existentes, y `app.include_router(genealogy_router, prefix="/genealogy", tags=["Genealogía y consanguinidad"])`.
- [X] T042 Registrar en `frontend/src/App.jsx`, al final de cada bloque: import `{ navItem as genealogyNavItem, GenealogyView } from './features/genealogy'`, botón de navegación filtrado por `genealogyNavItem.requiredRole` y render `activeView === 'genealogy'` con `token` y `role`, siguiendo el patrón de `productivityNavItem`.
- [X] T043 Ejecutar desde `backend/` las pruebas del módulo y la suite completa `pytest`, `bandit -r app/features/genealogy -ll`; desde la raíz `node --test frontend/src/features/genealogy/`; desde `frontend/` `npm run lint` y `npm run build`. Corregir solo fallos introducidos por HU-07 y verificar que el tiempo del módulo respeta el presupuesto de CI < 90 s.
- [ ] T044 Recorrer la verificación manual de API e interfaz de `specs/007-genealogy/quickstart.md` y anotar en ese archivo los resultados obtenidos (incluido el comportamiento offline y móvil < 768 px).

---

## Fase 7: Correcciones de la auditoría QA (qa-report.md)

- [X] T045 [US1] Pruebas primero en `frontend/src/features/genealogy/genealogySession.test.js` y `genealogyOfflineQueue.test.js` (rojo → verde): identidad de sesión desde el token, `owner` en cada elemento, sincronización solo de los elementos del mismo usuario y finca, elementos ajenos intactos. Implementar `genealogySession.js` y la cola con propietario (QA H-01).
- [X] T046 [US1] Pruebas primero en `genealogyOfflineQueue.test.js`: 401/403 pausan la sincronización conservando la cola; 408/429 son transitorios. Implementar en `genealogyOfflineQueue.js` y mostrar el aviso de pausa en `GenealogyView.jsx` (QA H-02).
- [X] T047 [US2] Pruebas primero en `genealogyCache.test.js`: caché particionada por usuario y finca, purga al reclamarla otra sesión y limpieza de claves antiguas. Implementar `genealogyCache.js` y usarlo en `GenealogyView.jsx`, `PedigreeTree.jsx` y `MatingEvaluation.jsx` (QA H-03).
- [X] T048 [US1] Pruebas primero: lecturas tolerantes de cola, rechazados y caché (JSON corrupto apartado en `_corrupt`, entradas inválidas omitidas, almacenamiento no disponible); la vista no falla al renderizar (QA H-05).
- [X] T049 Actualizar `contracts/frontend.md` (propiedad de la cola, códigos 401/403/408/429, caché particionada, lectura tolerante) y ejecutar pruebas frontend, lint, build y suite backend completa.

## Dependencias

- Fase 1 (T001–T003) → Fase 2 (T004–T008) → US1 (T009–T023) → US2 (T024–T031) → US3 (T032–T040) → Fase 6 (T041–T044).
- Dentro de cada historia, las pruebas Red deben fallar antes de su implementación Green.
- T004 precede a todas las pruebas backend (T005, T010–T013, T025–T026, T034–T035). T009, T024, T032 y T033 son puras y solo requieren `pedigree.py` vacío.
- T016 → T018 (el servicio usa la detección de ciclos). T017 → T018 → T019. T028 → T029. T037 → T038.
- T021 → T022 → T023; T030 → T031; T039 → T040.
- T041 requiere T008 y T019; T042 requiere T023; T043 y T044 requieren todo lo anterior.

## Oportunidades de Paralelismo

- Fase 1: T002 y T003 en paralelo tras T001.
- Fase 2: T005 en paralelo con la redacción de T004 una vez definida la API de la factoría.
- US1: T009–T015 en paralelo (archivos distintos o secciones independientes); luego backend (T016–T019) y frontend (T020–T023) en paralelo.
- US2: T024–T027 en paralelo; luego T028–T029 (backend) en paralelo con T030.
- US3: T032–T036 en paralelo; luego T037–T038 (backend) en paralelo con T039.
- Las historias no se paralelizan entre sí (WIP = 1 y dependencia de datos).

## Estrategia de Implementación

1. **MVP (US1)**: fichas, vínculos validados, corrección append-only y captura offline idempotente: cubre el criterio 4 y deja datos confiables.
2. **US2**: árbol de 3 generaciones con estados: cubre el criterio 1.
3. **US3**: Wright, advertencia y datos insuficientes: cubre los criterios 2 y 3.
4. Integración en `main.py` y `App.jsx` al final, luego suite completa, SAST, lint y build.
5. Q1 y Q2 están confirmadas por el usuario; no hay tareas condicionales.

## Criterios de Prueba Independiente por Historia

- **US1**: vínculo válido registrado con autor y estado; rechazos por fecha (incluido el mismo día), ciclo (incluso a más de 3 generaciones) y sexo con su código; reintento con el mismo `clientEventId` sin duplicados; corrección que conserva el original; OPERARIO genera pendientes y VETERINARIO los valida.
- **US2**: 14 posiciones siempre presentes; faltantes `NO_REGISTRADO`; límite de 3 generaciones; solo el vínculo vigente en el árbol y el historial completo en `/links`.
- **US3**: casos de referencia de Wright exactos; advertencia con ancestro común y coeficiente; parcial sin valor cero; indicador de animal sin padres con `PARENTS_NOT_REGISTERED`.
