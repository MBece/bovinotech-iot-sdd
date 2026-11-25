# Plan de Implementación: Registro genealógico y advertencia preventiva de consanguinidad

**Rama**: `feat/hu-07-genealogy` | **Fecha**: 2026-11-24 | **Spec**: [spec.md](spec.md)

**Entrada**: Especificación funcional desde `specs/007-genealogy/spec.md`

## Resumen

Rebanada vertical aislada `genealogy` para: (1) mantener fichas genealógicas propias (DIN, sexo, fecha de nacimiento) y registrar vínculos padre/madre append-only con validación anti-ciclos, de sexo y de fechas; (2) presentar el árbol de 3 generaciones con el estado de cada vínculo y las posiciones faltantes explícitas; (3) evaluar cruces y el indicador individual con el coeficiente de Wright por caminos, emitiendo advertencia con ancestro común y coeficiente estimado, y `CÁLCULO_PARCIAL_POR_DATOS_INSUFICIENTES` cuando faltan ancestros, sin presentar nunca 0 % como certeza. La captura de fichas y vínculos es offline-first con `client_event_id`. Las decisiones de diseño están en [research.md](research.md).

## Contexto Técnico

**Lenguaje / Versiones**: Python 3.11+ (backend); JavaScript con React 19 y Vite (frontend), según `frontend/package.json`.

**Dependencias Principales**: FastAPI 0.115, Pydantic v2, SQLAlchemy 2.0, SQLite; utilidades de autenticación de HU-01 (`app.features.auth.dependencies.get_current_user`). No se añaden dependencias nuevas.

**Almacenamiento**: Tablas propias `genealogy_animals`, `genealogy_parent_links` y `genealogy_link_validations` (solo inserción), sin llaves foráneas hacia otras HU ([data-model.md](data-model.md)). Cliente: cola `bovinotech_offline_genealogy_queue` con el esquema del Offline Hub y lista de rechazados `bovinotech_offline_genealogy_rejected`.

**Estrategia de Pruebas**: TDD. `pytest` en `backend/tests/unit/`, `contract/` y `security/` con SQLite en memoria y app FastAPI propia del módulo (patrón de `backend/tests/test_productivity.py`); el núcleo de cálculo (`pedigree.py`) se prueba como funciones puras. Frontend con `node:test` (patrón de `productivityOfflineQueue.test.js`).

**Plataforma y Entorno**: API web + PWA offline-first; VETERINARIO en escritorio y móvil, OPERARIO en móvil de campo.

**Objetivos de Rendimiento y SLOs**:
- Pipeline CI < 90 s: las pruebas del módulo deben ejecutarse en < 3 s.
- Árbol y evaluación de cruce < 2 s (SC-007): una consulta por finca carga fichas y vínculos y el grafo se recorre en memoria (ventana máxima de 15 individuos por candidato).
- Captura de vínculo en campo sin bloqueo por conectividad; consolidación única por `client_event_id`.

**Estándares de Calidad y Ciberseguridad**:
- ISO/IEC 25010:2023 (adecuación funcional, fiabilidad, mantenibilidad: lógica pura separada de E/S).
- Validación Pydantic v2 con `extra="forbid"` en entradas; `farm_id` y autoría derivados de la sesión; cero secretos.
- NISTIR 8259A no aplica directamente (no hay dispositivos IoT en esta HU); se mantienen integridad de payload e idempotencia.

## Decisiones Técnicas Clave

1. **Coeficiente**: Wright por caminos, `F = Σ (1/2)^(n1+n2+1)`, con independencia de caminos y `F_A = 0` (valor estimado, mínimo si es parcial). Ventana de 3 generaciones desde cada candidato; el candidato puede ser el ancestro común (padre × hija). Ver research.md R2–R4.
2. **Datos insuficientes**: 14 posiciones por candidato; cualquier faltante → `CÁLCULO_PARCIAL_POR_DATOS_INSUFICIENTES`; sin ancestros comunes y parcial → `coefficient = null`; sin padres → `reason = PARENTS_NOT_REGISTERED`.
3. **Validación de vínculos** (orden fijo): existencia → anti-ciclos (todo el grafo, sin límite) → sexo (padre `MACHO`, madre `HEMBRA`) → fecha estrictamente anterior → posición libre. Ver research.md R6.
4. **Append-only**: tablas de solo inserción, `sequence_no` único por (finca, cría, rol) para impedir dos vínculos vigentes, corrección con `corrected_event_id` y motivo, validación como evento aparte; estados derivados (`CORREGIDO` > decisión > estado inicial). Sin rutas `PUT/PATCH/DELETE`.
5. **SINIGÁN V6**: DIN oficial como identificador por valor; el módulo nunca escribe en tablas de SINIGÁN/conciliación ni altera la identidad oficial. Ningún módulo existente guarda fecha de nacimiento, por eso la ficha genealógica es propia.
6. **Offline-first**: fichas, vínculos y correcciones con `clientEventId`; 200 `DUPLICADO` ante repetición, 409 ante reutilización con contenido distinto; FIFO en cliente; rechazos de negocio visibles.
7. **Roles** (Q1 confirmado por el usuario): matriz en research.md R11.

## Verificación de Constitución (Constitution Check)

*Compuerta obligatoria antes de implementar. Re-evaluada tras el diseño de Fase 1: sin cambios.*

- [x] **Aislamiento Modular Estricto:** Código solo en `backend/app/features/genealogy/` y `frontend/src/features/genealogy/`; pruebas en `backend/tests/{unit,contract,security}/test_genealogy_*.py`.
- [x] **Integración en Puntos Compartidos:** Solo `backend/app/main.py` (import de modelos y router, llamada a `seed_genealogy()`, `include_router` con prefijo `/genealogy`, al final de cada bloque) y `frontend/src/App.jsx` (import, botón de navegación y render de la vista, al final de cada bloque). No se modifica `conftest.py` ni otros módulos.
- [x] **Desacoplamiento entre HUs:** DIN por valor, sin FK a otras HU; semilla propia con árbol de 3 generaciones en un rango de DIN exclusivo (`DIN-DEMO-000101`–`000119`).
- [x] **Historial Append-Only:** Ningún `UPDATE`/`DELETE`; correcciones con `corrected_event_id`; validaciones como eventos nuevos; prueba explícita de que el registro original no cambia y de que el router no expone métodos destructivos.
- [x] **Jerarquía SINIGÁN V6:** DIN oficial validado por patrón; la ficha genealógica no sustituye ni sobrescribe la fuente oficial. La fuente simulada no expone parentesco ni nacimiento, por lo que no hay divergencias que enrutar en esta HU (documentado en spec, Supuestos).
- [x] **Idempotencia y Operación Offline-First:** `client_event_id` UUID único por finca en fichas y vínculos; cola `bovinotech_offline_genealogy_queue` con esquema estándar.
- [x] **Menú Lateral (Sidebar) y RBAC:** `navItem` con `requiredRole`; acciones filtradas por rol en la vista y aplicadas en el backend.
- [x] **Diseño Responsive Mobile-First:** árbol desplegable por generación en < 768 px, objetivos táctiles ≥ 48x48 px, `inputMode="numeric"` en la búsqueda por número, alto contraste.
- [x] **Seguridad DevSecOps:** Pydantic v2 `extra="forbid"`, ámbito de finca por sesión, 404 sin revelar datos de otras fincas, sin secretos.

## Estructura del Proyecto (Vertical Slicing)

### Backend: `backend/app/features/genealogy/`

```text
backend/app/features/genealogy/
├── __init__.py
├── models.py          # GenealogyAnimal, GenealogyParentLink, GenealogyLinkValidation (solo inserción)
├── schemas.py         # Contratos Pydantic v2 (camelCase, extra="forbid")
├── pedigree.py        # Funciones puras: posiciones, árbol, anti-ciclos, caminos y coeficiente de Wright, riesgo
├── service.py         # Reglas de registro/corrección/validación, estados derivados, idempotencia, consultas, seed
├── router.py          # Endpoints /animals, /links, /matings y dependencias de rol/finca
└── fixtures/
    └── pedigree_seed.json
```

### Frontend: `frontend/src/features/genealogy/`

```text
frontend/src/features/genealogy/
├── index.js                     # GenealogyView + navItem
├── GenealogyView.jsx            # Contenedor: búsqueda, pestañas Árbol / Registrar / Evaluar cruce, pendientes y rechazados
├── PedigreeTree.jsx             # Árbol de 3 generaciones (14 posiciones, estados)
├── ParentLinkForm.jsx           # Registro y corrección de progenitores (offline-first)
├── MatingEvaluation.jsx         # Evaluación de cruce e indicador individual
├── genealogy.css
├── genealogyConstants.js        # Literales de estado y umbrales
├── genealogyService.js          # Cliente API /genealogy
├── genealogyOfflineQueue.js     # Cola Offline Hub + rechazados
├── genealogyPresentation.js     # Formato de coeficiente, tonos de riesgo, etiquetas de estado
└── genealogyValidation.js       # Prevalidación local (sexo, fecha, auto-vínculo)
```

### Pruebas Automatizadas

```text
backend/tests/
├── unit/test_genealogy_pedigree.py        # Wright, independencia de caminos, ventana, faltantes, riesgo, anti-ciclos
├── unit/test_genealogy_link_rules.py      # Reglas de vínculo, estados derivados, append-only, idempotencia (servicio)
├── contract/test_genealogy_api.py         # Endpoints, códigos HTTP, camelCase, criterios 1–4
└── security/test_genealogy_authorization.py  # RBAC, aislamiento por finca, extra="forbid", sin métodos destructivos

frontend/src/features/genealogy/
├── genealogyOfflineQueue.test.js
├── genealogyPresentation.test.js
└── genealogyValidation.test.js
```

## Contratos e Interfaces

- API: [contracts/api.md](contracts/api.md) (`GET/POST /genealogy/animals`, `GET /genealogy/animals/{din}/tree|links|inbreeding`, `POST /genealogy/links`, `POST /genealogy/links/{id}/corrections|validations`, `GET /genealogy/matings/evaluation`).
- Cliente: [contracts/frontend.md](contracts/frontend.md) (navItem, cola offline, reglas de presentación).
- Datos: [data-model.md](data-model.md). Validación: [quickstart.md](quickstart.md).

## Aclaraciones Resueltas (sesión 2026-11-24)

| Marcador | Estado | Decisión |
|---|---|---|
| Q1 — OPERARIO propone vínculos | Confirmado por el usuario | Sí, quedan `PENDIENTE_VALIDACION` hasta que un VETERINARIO los valida (endpoint de validaciones incluido). |
| Q2 — Ventana de 3 generaciones | Confirmado por el usuario | Desde cada candidato al cruce (padres, abuelos y bisabuelos de cada uno); se detectan primos segundos. |

## Registro de Complejidad y Excepciones

| Compuerta Afectada | Motivo Técnico Ineludible | Alternativa Más Simple Descartada |
|---|---|---|
| Monitor de conectividad global (2.1) | El contador global del App Shell vive en `frontend/src/features/offline-sync/` (otro integrante). HU-07 muestra su propio contador de pendientes en la vista y expone `pendingCount()` para una futura integración acordada. | Modificar `offline-sync` para sumar la cola de genealogía, lo cual viola el aislamiento modular. |
| Fichas genealógicas propias | Ningún módulo existente almacena fecha de nacimiento; las reglas de fechas y sexo requieren esos datos. | Reutilizar `CatalogAnimal` (HU-02) o `FieldAnimalRecord` (HU-05): carecen de fecha de nacimiento y modificarlos violaría el aislamiento. |
