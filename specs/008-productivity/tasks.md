---
description: "Tareas TDD para HU-08 Productividad por lote"
---

# Tareas de Implementación: Productividad por lote

**Entrada**: Documentos de diseño en `specs/008-productivity/`

**Prerrequisitos**: `spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/api.md` y `quickstart.md`.

**Metodología**: TDD obligatorio según la Constitución: escribir y ejecutar pruebas en rojo antes de la implementación productiva.

**Organización**: Historias de Usuario como rebanadas verticales. HU-08 respeta WIP = 1; completar US1 antes de activar US2.

## Fase 1: Preparación del módulo aislado

**Propósito**: Crear solamente los esqueletos y fixtures propios requeridos por el módulo.

- [X] T001 Crear el paquete aislado del backend en `backend/app/features/productivity/__init__.py`.
- [X] T002 [P] Crear fixtures propios en `backend/app/features/productivity/fixtures/lots.json` y `backend/app/features/productivity/fixtures/animals.json`, conforme a los campos definidos en data-model.md: `ProductivityLotFixture.lote_id`, `ProductivityLotFixture.farm_id`, `ProductivityLotFixture.name` y `ProductivityLotFixture.animal_dins`.

## Fase 2: Fundación compartida

No se requieren tareas de implementación compartida antes de las historias; los contratos, autorización, persistencia offline y lógica de dominio se desarrollan dentro de cada rebanada.

## Fase 3: Historia de Usuario 1 - Registrar pesajes y consumo por lote (Prioridad: P1)

**Objetivo**: Permitir al OPERARIO capturar, consultar y corregir pesajes/consumos asociados a lote, incluso offline, sin duplicados y conservando los originales.

**Prueba Independiente**: Registrar dos pesajes, un consumo y una corrección con rol autorizado; consultarlos por lote, comprobar autoría, vínculo al evento anterior y duplicación idempotente. Desconectar la red y verificar la cola local pendiente.

### Pruebas automatizadas TDD (Red)

- [X] T003 [P] [US1] Escribir pruebas de contrato para captura/listado de pesajes y consumos, validación, autorización, idempotencia y correcciones enlazadas en `backend/tests/test_productivity.py`; ejecutar para confirmar que fallan antes de implementar.
- [X] T004 [P] [US1] Escribir pruebas de cola offline, estados pendiente/sincronizado y deduplicación por `client_event_id` en `frontend/src/features/productivity/productivityOfflineQueue.test.js`; ejecutar para confirmar que fallan antes de implementar.

### Implementación backend (Green)

- [X] T005 [US1] Definir modelos SQLAlchemy aislados para pesajes y consumos, sin FK a otros módulos, conforme a data-model.md: `ProductivityWeighing.id`, `ProductivityWeighing.client_event_id`, `ProductivityWeighing.farm_id`, `ProductivityWeighing.lote_id`, `ProductivityWeighing.bovine_id`, `ProductivityWeighing.weight_kg`, `ProductivityWeighing.captured_at`, `ProductivityWeighing.author_id`, `ProductivityWeighing.is_atypical`, `ProductivityWeighing.corrected_event_id`, `ProductivityWeighing.correction_reason`, `ProductivityConsumption.id`, `ProductivityConsumption.client_event_id`, `ProductivityConsumption.farm_id`, `ProductivityConsumption.lote_id`, `ProductivityConsumption.period_start`, `ProductivityConsumption.period_end`, `ProductivityConsumption.quantity_kg`, `ProductivityConsumption.cost_amount`, `ProductivityConsumption.currency_code`, `ProductivityConsumption.author_id`, `ProductivityConsumption.corrected_event_id` y `ProductivityConsumption.correction_reason` en `backend/app/features/productivity/models.py`.
- [X] T006 [US1] Definir contratos Pydantic v2 de captura, consulta, corrección y respuesta respetando los campos canónicos de [data-model.md: ProductivityWeighing] y [ProductivityConsumption] en `backend/app/features/productivity/schemas.py`.
- [X] T007 [US1] Implementar captura, listado por finca/lote, idempotencia y correcciones append-only con motivo en `backend/app/features/productivity/service.py`.
- [X] T008 [US1] Implementar `POST/GET /pesajes`, `POST/GET /consumos` y endpoints de corrección con dependencias RBAC y ámbito de finca en `backend/app/features/productivity/router.py`.

### Implementación frontend (Green)

- [X] T009 [US1] Implementar cliente API y cola `bovinotech_offline_productivity_queue` con esquema Offline Hub en `frontend/src/features/productivity/productivityService.js` y `frontend/src/features/productivity/productivityOfflineQueue.js`.
- [X] T010 [US1] Implementar formularios e historial mobile-first de pesajes/consumos, con `inputMode="numeric"`, alto contraste y controles táctiles >= 48x48 px en `frontend/src/features/productivity/ProductivityView.jsx` y `frontend/src/features/productivity/productivity.css`.
- [X] T011 [US1] Exportar vista y metadatos `navItem` con `requiredRole` para el Menú Lateral en `frontend/src/features/productivity/index.js`.

**Punto de control US1**: Pruebas de captura, corrección, RBAC, persistencia offline y deduplicación pasan de rojo a verde sin modificar eventos anteriores.

## Fase 4: Historia de Usuario 2 - Consultar indicadores y revisión de atípicos (Prioridad: P1)

**Objetivo**: Mostrar GDP, eficiencia alimenticia, insuficiencia de datos y revisión de pesajes atípicos sin permitir que muestras pendientes o rechazadas distorsionen indicadores.

**Prueba Independiente**: Consultar un lote con muestras completas y obtener ambas fórmulas; provocar una variación >15 kg en <24 h y confirmar que se excluye hasta revisión; omitir muestras/consumo/costos y recibir `DATOS_INSUFICIENTES`.

### Pruebas automatizadas TDD (Red)

- [X] T012 [P] [US2] Escribir pruebas unitarias para GDP individual y de lote, eficiencia, límites estrictos de 15 kg/24 h, faltantes y exclusión de eventos pendientes/rechazados en `backend/tests/test_productivity.py`; ejecutar para confirmar fallos iniciales.
- [X] T013 [P] [US2] Escribir pruebas de contrato para `GET /lotes/{lote_id}/gdp`, revisión, corrección append-only y RBAC de VETERINARIO/OPERARIO en `backend/tests/test_productivity.py`; ejecutar para confirmar fallos iniciales.
- [X] T014 [P] [US2] Escribir pruebas frontend de presentación de indicadores, motivos `DATOS_INSUFICIENTES` y acciones de revisión por rol en `frontend/src/features/productivity/productivitySummary.test.js`; ejecutar para confirmar fallos iniciales.

### Implementación backend (Green)

- [X] T015 [US2] Implementar proyecciones de GDP, eficiencia y datos insuficientes conforme a data-model.md: `ProductivitySummary.lote_id`, `ProductivitySummary.period_start`, `ProductivitySummary.period_end`, `ProductivitySummary.gdp_kg_per_day`, `ProductivitySummary.feed_efficiency_kg_per_kg`, `ProductivitySummary.cost_status`, `ProductivitySummary.status`, `ProductivitySummary.missing_data`; implementar detección de atípicos y decisiones append-only conforme a data-model.md: `ProductivityWeighingReview.id`, `ProductivityWeighingReview.weighing_id`, `ProductivityWeighingReview.decision`, `ProductivityWeighingReview.reason`, `ProductivityWeighingReview.reviewer_id` y `ProductivityWeighingReview.reviewed_at` en `backend/app/features/productivity/service.py` y `backend/app/features/productivity/models.py`.
- [X] T016 [US2] Definir contratos de resumen/revisión respetando [data-model.md: ProductivitySummary] y [ProductivityWeighingReview], y exponer `GET /lotes/{lote_id}/gdp` y `POST /pesajes/{pesaje_id}/revision` en `backend/app/features/productivity/schemas.py` y `backend/app/features/productivity/router.py`.

### Implementación frontend (Green)

- [X] T017 [US2] Mostrar indicadores, faltantes, cronología de atípicos y controles de revisión restringidos por rol en `frontend/src/features/productivity/ProductivityView.jsx` y `frontend/src/features/productivity/productivity.css`.

**Punto de control US2**: Indicadores calculados coinciden con las fórmulas; ningún dato insuficiente se representa como cero y cada revisión conserva el evento original.

## Fase 5: Integración y verificación final

- [X] T018 Registrar modelos y router del módulo al final de las integraciones existentes en `backend/app/main.py`.
- [X] T019 Registrar vista y elemento de menú al final del bloque correspondiente en `frontend/src/App.jsx`; se resolvió únicamente el conflicto de este archivo autorizado y se conservaron ambas integraciones preexistentes.
- [ ] T020 Ejecutar pruebas backend específicas, suite `pytest`, análisis Bandit y `npm run build`; corregir únicamente fallos introducidos por HU-08 y documentar resultados en `specs/008-productivity/quickstart.md`.

**Estado de T020**: las pruebas HU-08 pasan (13/13 backend y 6/6 frontend), al igual que lint y build. La suite global recolecta 259 pruebas: 256 pasan y 3 pruebas sanitarias existentes fallan porque `SanitaryCorrectionRequest` rechaza campos de producto/dosis/hallazgo y un caso RBAC usa un payload inválido. No se modificaron esos contratos/tests adicionales sin autorización. Bandit no está instalado en `backend/.venv`, por lo que el análisis no se pudo ejecutar; T020 permanece pendiente.

## Dependencias

- Setup `T001` y fixtures `T002` preceden a las pruebas/implementación de ambas historias.
- US1 (`T003`–`T011`) precede a US2 (`T012`–`T017`), porque los indicadores y revisiones dependen de los eventos productivos capturados.
- En cada historia, las pruebas Red deben fallar antes de iniciar su implementación Green.
- `T018` y `T019` se realizan después de ambas historias; `T019` además depende de que el conflicto ajeno a HU-08 en `frontend/src/App.jsx` ya esté resuelto.
- `T020` depende de las integraciones y de todos los cambios de HU-08.

## Oportunidades de paralelismo

- Inicio: `T001` y `T002` pueden ejecutarse en paralelo porque crean rutas independientes.
- US1: `T003` y `T004` son independientes; después de fijar contratos, backend (`T005`–`T008`) y frontend (`T009`–`T011`) pueden avanzar en paralelo, respetando dependencias internas.
- US2: `T012`, `T013` y `T014` pueden escribirse en paralelo. Luego, proyecciones backend (`T015`–`T016`) y presentación frontend (`T017`) pueden avanzar en paralelo una vez acordado el contrato.
- Las historias no se paralelizan: el límite WIP = 1 y la dependencia de datos exigen completar US1 antes de US2.

## Estrategia de implementación

1. Entregar primero US1 como MVP verificable: captura y consulta de pesajes/consumos, corrección enlazada, cola offline e idempotencia.
2. Continuar con US2: indicadores, revisión veterinaria y estados explícitos de insuficiencia.
3. Integrar puntos compartidos al final y ejecutar el conjunto final de pruebas, SAST y build.
4. No modificar módulos fuera de productividad; los conflictos compartidos/sanitarios se resolvieron únicamente tras autorización explícita y sin alterar otros archivos de esas historias.

## Criterios de prueba independiente por historia

- **US1**: Los eventos de una finca se registran y consultan por lote; un reintento con el mismo `client_event_id` no crea otro evento; correcciones crean una nueva versión con `corrected_event_id` y motivo, dejando intacto el original; la captura offline queda pendiente y se sincroniza una sola vez.
- **US2**: Con muestras completas se verifican ambas fórmulas; límites exactamente 15 kg o 24 h no se clasifican como atípicos; variaciones que exceden ambos límites quedan excluidas hasta aprobación; muestras, consumo o costos ausentes muestran `DATOS_INSUFICIENTES`; OPERARIO no puede revisar eventos.
