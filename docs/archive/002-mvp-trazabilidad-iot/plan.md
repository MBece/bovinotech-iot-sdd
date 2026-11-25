# Plan de Implementación: MVP Integral de Trazabilidad Ganadera e IoT

**Rama**: `002-mvp-trazabilidad-iot` | **Fecha**: 2026-11-18 | **Spec**: [spec.md](spec.md)

## Resumen

El MVP se implementará mediante cortes verticales pequeños que amplían la base de autenticación existente. El orden prioriza el valor de trazabilidad: catálogo local de animales y referencias externas, captura sanitaria offline, sincronización idempotente, historial solo-anexión, consulta SINIGAN simulada y reconciliación. Después se incorporan telemetría, genealogía, productividad, panel y observabilidad.

Cada corte debe entregar interfaz, API, persistencia, pruebas y evidencia de aceptación. No se avanzará al siguiente incremento si las pruebas del anterior no compilan y pasan.

## Contexto Técnico

**Lenguajes/Versiones**: Python 3.11+; JavaScript con React 19.

**Dependencias actuales**: FastAPI, SQLAlchemy, Pydantic, PyJWT, bcrypt, pytest, React, Vite.

**Persistencia**: SQLite durante el MVP académico; diseño compatible con migración posterior a PostgreSQL. Se incorporarán migraciones versionadas antes de crear modelos nuevos.

**Persistencia offline**: IndexedDB del navegador mediante un repositorio aislado. La UI no accederá directamente al almacenamiento.

**Pruebas**: pytest para unitarias, contrato e integración; TestClient para HTTP; pruebas de componentes y flujos frontend con Vitest y Testing Library; Playwright para los flujos E2E críticos.

**Plataforma objetivo**: PWA web para operación rural y API sin estado.

**Rendimiento del piloto**: guardado local < 2 s; panel < 3 s; p95 evento-alerta < 2 min; sincronización sin duplicados.

**Restricciones**: offline-first, historial solo-anexión, idempotencia, RBAC, datos sintéticos, integración SINIGAN mock de solo lectura y cero scraping.

**Escala inicial**: piloto académico con al menos 2 fincas, 5 animales de referencia, cientos de eventos sanitarios y telemetría sintética reproducible. Las pruebas de carga usarán tamaños configurables.

## Verificación de Constitución

- **Idioma**: especificaciones y UI en español; código, contratos internos y nombres técnicos en inglés.
- **Vertical slicing**: cada HU se implementa en módulos `features/<modulo>` sin mezclar responsabilidades.
- **TDD**: las pruebas se escriben primero y deben fallar antes de la implementación.
- **Append-only**: no se expondrán operaciones de actualización o borrado destructivo para eventos.
- **SINIGAN**: identidad, propiedad y movimiento se tratan como referencia externa; divergencias generan revisión humana.
- **Offline/idempotencia**: toda captura usa UUID `client_event_id` y el servidor aplica una restricción única.
- **Seguridad**: roles, validación de esquemas, secretos fuera del repositorio y auditoría de escrituras.

**Resultado de la compuerta**: APROBADO con una condición: la HU-01 debe completar roles, usuario activo y aprovisionamiento administrativo antes de liberar HU-05, HU-09 y correcciones veterinarias.

## Decisiones de Arquitectura

### 1. Monolito modular para el MVP

Se conserva FastAPI como una aplicación desplegable única con módulos verticales. No se introducirán microservicios ni un broker externo en esta etapa. La cola de sincronización y el procesamiento de telemetría se modelarán mediante servicios y registros persistentes intercambiables, evitando acoplar el dominio a infraestructura futura.

### 2. Contratos antes de implementación

Cada módulo define esquemas de entrada/salida, errores y permisos antes de crear endpoints. Las pruebas de contrato congelan estos acuerdos. Los DTO externos de SINIGAN nunca se utilizan directamente como entidades locales.

### 3. Historial solo-anexión

`SanitaryEvent` representa hechos inmutables. Una corrección es otro evento con `corrected_event_id`, `reason`, autor y versión. El estado vigente se calcula mediante un servicio/proyección; no existe endpoint de edición destructiva.

### 4. Sincronización idempotente

El cliente conserva una cola IndexedDB. `POST /sync/batches` recibe una lista versionada y devuelve un resultado individual. La restricción única por `client_event_id` evita duplicados. Los estados locales son `PENDING`, `SYNCING`, `SYNCED`, `CONFLICT` y `FAILED_RETRYABLE`.

### 5. Integración SINIGAN aislada

El contrato funcional de referencia se conserva en `docs/integrations/sinigan-mock-integration.md`. En el código se define un protocolo `SiniganAdapter`; `MockSiniganAdapter` lee fixtures JSON deterministas y no utiliza cliente HTTP. Todas las respuestas incluyen `source_system`, `source_mode`, `is_simulation`, `contract_version` y `retrieved_at`.

### 6. Separación de fuentes

Los modelos locales `Animal` y `SanitaryEvent` no se confunden con referencias externas. `AnimalExternalReference` relaciona el animal local con DIN/SIT. La telemetría y los eventos operativos son propios de BovinoTech.

### 7. Observabilidad desde la primera fase

Un middleware asigna o propaga `correlation_id`. Los logs son estructurados y evitan datos sensibles. Cada fase añade métricas verificables; la instrumentación completa de HU-10 consolida SLI y tablero técnico.

## Estructura del Proyecto

### Documentación

```text
specs/002-mvp-trazabilidad-iot/
├── spec.md
├── plan.md
└── tasks.md

docs/integrations/
└── sinigan-mock-integration.md
```

### Backend propuesto

```text
backend/app/
├── core/
│   ├── config.py
│   ├── database.py
│   ├── errors.py
│   ├── logging.py
│   └── middleware.py
├── features/
│   ├── auth/                         # existente; se endurece en HU-01
│   ├── animals/
│   │   ├── models.py
│   │   ├── schemas.py
│   │   ├── service.py
│   │   └── router.py
│   ├── sanitary_events/
│   ├── sync/
│   ├── sinigan/
│   │   ├── adapter.py
│   │   ├── mock_adapter.py
│   │   ├── mappers.py
│   │   ├── schemas.py
│   │   ├── service.py
│   │   ├── router.py
│   │   └── fixtures/
│   ├── reconciliation/
│   ├── telemetry/
│   ├── genealogy/
│   ├── productivity/
│   └── indicators/
└── main.py

backend/tests/
├── unit/
├── contract/
├── integration/
├── security/
├── performance/
└── fixtures/
```

### Frontend propuesto

```text
frontend/src/
├── core/
│   ├── api/
│   ├── offline/
│   └── observability/
├── features/
│   ├── auth/                         # existente
│   ├── animals/
│   ├── sanitary-events/
│   ├── sync/
│   ├── sinigan/
│   ├── reconciliation/
│   ├── alerts/
│   ├── genealogy/
│   ├── productivity/
│   └── indicators/
└── tests/
    ├── unit/
    ├── integration/
    └── e2e/
```

**Decisión de estructura**: mantener módulos verticales equivalentes en backend y frontend, compartiendo únicamente infraestructura transversal en `core/`.

## Contratos HTTP Planeados

### Animales y eventos

- `GET /animals/{animal_id}`
- `GET /animals/{animal_id}/history`
- `POST /sanitary-events`
- `POST /sanitary-events/{event_id}/corrections`
- `POST /sync/batches`

### SINIGAN mock

- `GET /integrations/sinigan/status`
- `GET /integrations/sinigan/establishments`
- `GET /integrations/sinigan/establishments/{sit_code}/inventory`
- `GET /integrations/sinigan/animals/{din}`
- `GET /integrations/sinigan/animals/{din}/events`
- `GET /integrations/sinigan/din/{din}/custody-history`

Todos son endpoints propios de BovinoTech. No representan endpoints oficiales del ICA.

### Reconciliación, telemetría y analítica

- `POST /reconciliation/tickets`
- `POST /reconciliation/tickets/{ticket_id}/resolve`
- `POST /telemetry/batches`
- `GET /alerts`
- `POST /alerts/{alert_id}/close`
- `POST /genealogy`
- `GET /animals/{animal_id}/genealogy`
- `GET /animals/{animal_id}/inbreeding`
- `POST /weights/batches`
- `POST /consumption`
- `GET /lots/{lot_id}/gdp`
- `GET /indicators/sanitary`
- `GET /indicators/productive`

## Estrategia de Datos y Migraciones

1. Incorporar un mecanismo de migraciones antes de crear tablas del MVP.
2. Crear restricciones únicas para correo, DIN cuando exista y `client_event_id`.
3. Evitar cascadas destructivas sobre eventos, auditoría y decisiones.
4. Guardar fechas en UTC y conservar `field_occurred_at` por separado de `received_at`.
5. Versionar reglas de dosis, geocerca, inmovilidad, consanguinidad y cálculo de GDP.
6. Mantener fixtures externos fuera de tablas productivas; una instantánea local será opcional y explícita.

## Estrategia de Pruebas

### Pirámide obligatoria

1. **Unitarias**: reglas puras, validadores, mappers, adaptadores, cálculos e idempotencia.
2. **Contrato**: esquemas, códigos HTTP, autorización y metadatos.
3. **Integración**: persistencia, restricciones, rollback, lotes y flujos entre módulos.
4. **E2E**: captura offline -> reconexión -> sincronización -> validación -> panel.
5. **Seguridad**: RBAC, entradas inválidas, secretos, mutaciones destructivas y ausencia de tráfico externo.
6. **Rendimiento/resiliencia**: corte de 24 h, reconexión masiva, latencia de alertas y paginación.

### Reglas TDD

- Cada bloque de tareas comienza con pruebas que deben fallar por la razón esperada.
- Ningún test puede depender de reloj, red o datos aleatorios no controlados.
- Las pruebas usan base aislada y fixtures sintéticos deterministas.
- Se verifican tanto resultados positivos como rechazo, reintento y no-mutación.
- Las pruebas de integración SINIGAN deben fallar si se intenta crear un cliente HTTP real.

## Incrementos y Puertas

### Incremento 0 - Fundaciones

Migraciones, configuración, errores, auditoría, correlation ID, roles completos y estructura de pruebas.

**Puerta**: CI verde, autenticación endurecida, base de prueba aislada y contratos de error estables.

### Incremento 1 - Trazabilidad mínima hasta aproximadamente 50% del MVP

Animales, captura offline, sincronización idempotente, historial solo-anexión y consulta de animal SINIGAN mock.

**Puerta**: flujo E2E offline completo, cero duplicados, cero mutaciones destructivas y etiqueta de simulación visible.

### Incremento 2 - Reconciliación y trazabilidad ampliada

Establecimientos, inventario, eventos externos, custodia DIN y tickets de divergencia.

**Puerta**: decisiones humanas auditables y cero tráfico a servicios externos.

### Incremento 3 - IoT y decisiones sanitarias

Telemetría, geocercas, inmovilidad y alertas.

**Puerta**: pruebas de datos insuficientes y SLI de latencia bajo carga sintética.

### Incremento 4 - Genealogía y productividad

Linaje, consanguinidad, peso, consumo y GDP.

**Puerta**: casos matemáticos de referencia y manejo explícito de atípicos/datos insuficientes.

### Incremento 5 - Panel y cierre 100% funcional del alcance MVP

Indicadores, exporte, observabilidad, pruebas E2E completas y reporte de SLI.

**Puerta**: diez HU aceptadas, pipeline verde, sin hallazgos críticos y demo con datos simulados.

## Riesgos y Mitigaciones

| Riesgo | Mitigación verificable |
|---|---|
| Duplicados por reconexión | Restricción única y pruebas de reenvío concurrente |
| Pérdida de eventos locales | Confirmación por evento y pruebas de cierre/reapertura |
| Sobrescritura de historia | API append-only, restricciones y pruebas negativas |
| Confundir mock con oficial | Metadatos obligatorios, UI visible y pruebas de ausencia de red |
| Acoplar dominio al mock | Protocolo de adaptador y mappers unitariamente probados |
| Falsos positivos IoT | Estado de dato insuficiente y reglas versionadas |
| Indicadores no auditables | Vínculo a registros fuente y pruebas de conciliación |
| Crecimiento prematuro de infraestructura | Monolito modular y puertos intercambiables |

## Complejidad y Decisiones Diferidas

| Decisión diferida | Razón |
|---|---|
| PostgreSQL y broker administrado | SQLite y servicios persistentes son suficientes para la demo; los puertos evitan acoplamiento |
| Integración ICA real | No existe contrato técnico ni autorización suministrada |
| GSMI | Consulta opcional posterior al flujo principal |
| Dispositivos físicos | El MVP utiliza datos sintéticos y simuladores |

## Definición de Terminado Global

- Criterios de aceptación automatizados y demostrados.
- Pruebas unitarias, contrato, integración y E2E en verde.
- Cobertura de reglas críticas: idempotencia, append-only, RBAC, reconciliación y cálculos.
- Sin hallazgos críticos de análisis estático o dependencias.
- Documentación Swagger identifica claramente datos simulados.
- Autor, fecha, fuente, correlation ID y motivo quedan auditados cuando aplican.
- SLI afectados medidos y documentados.
- Revisión funcional y aprobación humana registradas.
