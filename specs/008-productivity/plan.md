# Plan de Implementación: Productividad por lote

**Rama**: `feat/hu-08-productivity` | **Fecha**: 2026-11-24 | **Spec**: [spec.md](spec.md)

**Entrada**: Especificación funcional [spec.md](spec.md)

## Resumen

Implementar una rebanada vertical aislada para registrar pesajes por animal/lote y consumos por lote, calcular GDP y eficiencia alimenticia, conservar pesajes atípicos para revisión auditable y comunicar `DATOS_INSUFICIENTES` sin inventar resultados. El backend usa contratos Pydantic v2 y endpoints de lectura, captura, corrección enlazada, revisión y cálculo. La vista de campo queda en `frontend/src/features/productivity/`.

## Contexto Técnico

**Lenguaje / Versiones**: Python 3.11+, JavaScript con React 18+ y Vite.

**Dependencias Principales**: FastAPI, Pydantic v2, SQLAlchemy, SQLite y las utilidades de autenticación y almacenamiento offline existentes en el proyecto.

**Almacenamiento**: Modelos propios dentro de `backend/app/features/productivity/`; el bovino se identifica por DIN como string y el lote por `lote_id`, sin llaves foráneas bloqueantes a módulos de otras historias. La captura offline usa la cola `bovinotech_offline_productivity_queue` con el esquema común del Offline Hub.

**Estrategia de Pruebas**: TDD. `pytest` cubre reglas, fórmulas, append-only, idempotencia, autorización y contratos. Las pruebas frontend verifican validación local, cola de captura y estados visibles.

**Plataforma y Entorno**: API web y vista PWA offline-first para captura móvil en fincas con conectividad intermitente.

**Objetivos de Rendimiento y SLOs**:
- Mantener la validación del CI del proyecto dentro de su objetivo de menos de 90 segundos.
- Registrar una captura local de campo sin que la pérdida de conectividad la bloquee; al reconectar, cada `client_event_id` se consolida una sola vez.
- Calcular y mostrar los indicadores o su estado de insuficiencia en una consulta de usuario, sin ocultar fallos de validación.

**Estándares de Calidad y Ciberseguridad**:
- Alineación de calidad con ISO/IEC 25010:2023 y controles de dispositivos IoT NISTIR 8259A cuando apliquen.
- Validación Pydantic en entradas y salidas; el `farm_id` procede de la sesión autenticada, no del payload del cliente.
- Cero secretos en el repositorio. Los registros históricos son append-only; no se implementan rutas de actualización o borrado destructivo de pesajes o consumos.

## Decisiones de Dominio y Cálculo

- Cada GDP individual usa dos pesajes aprobados del mismo animal: `(peso_final_kg - peso_inicial_kg) / días_transcurridos`. Los días son la duración real entre capturas dividida por 24 horas.
- El GDP del lote es la media aritmética de las GDP individuales de la cohorte completa declarada para el periodo. Si falta alguna muestra inicial/final requerida, el GDP del lote es `DATOS_INSUFICIENTES`; no se presenta un promedio parcial como completo.
- La eficiencia alimenticia del lote es `consumo_total_kg / kg_ganados_totales`, donde los kg ganados son la suma de las diferencias finales-iniciales aprobadas de la misma cohorte. Una ganancia total menor o igual a cero produce `DATOS_INSUFICIENTES`.
- El pesaje nuevo se compara con el pesaje cronológicamente anterior del mismo animal y finca. Si `abs(delta_kg) > 15` y el intervalo es estrictamente menor a 24 horas, se crea marcado `ATIPICO_EN_REVISION`; no participa en cálculos hasta ser aprobado.
- El umbral es estricto: exactamente 15 kg o exactamente 24 horas no activa la marca por atipicidad.
- La decisión de revisión y las correcciones se anexan como eventos nuevos enlazados; el estado efectivo se obtiene de la secuencia de eventos y nunca requiere mutar la evidencia original.
- Los costos se recopilan como datos opcionales auditables. No se inventa una fórmula de rentabilidad: cuando la solicitud del resumen requiera costos ausentes, el estado de ese componente y el estado general son `DATOS_INSUFICIENTES`; los indicadores con datos suficientes conservan su propio resultado y estado.

## Verificación de Constitución (Constitution Check)

*Compuerta obligatoria antes de implementar; esta sección describe el diseño previsto.*

- [x] **Aislamiento modular estricto**: Backend en `backend/app/features/productivity/` y frontend en `frontend/src/features/productivity/`.
- [x] **Integración compartida limitada**: Solo se requiere registrar el router en `backend/app/main.py` y la vista/elemento de menú en `frontend/src/App.jsx`, al final de las integraciones existentes.
- [x] **Desacoplamiento entre HUs**: DIN y `lote_id` son identificadores por valor; fixtures propios sin dependencia bloqueante de otros módulos.
- [x] **Append-only**: Ningún `UPDATE` o `DELETE` destructivo para pesajes, consumos o revisiones. Las correcciones crean una nueva versión con `corrected_event_id` y motivo.
- [x] **Fuente SINIGÁN V6**: La identificación usa DIN; no se reemplaza la fuente legal ni se resuelven discrepancias por sobrescritura silenciosa.
- [x] **Offline e idempotencia**: Cola local estándar y clave única `client_event_id`.
- [x] **Menú lateral y RBAC**: Elemento de navegación `requiredRole`; OPERARIO captura y ADMINISTRADOR/VETERINARIO revisan según finca activa.
- [x] **Mobile-first**: Vista usable bajo 768 px, alto contraste y objetivos táctiles mínimos de 48x48 px.
- [x] **Seguridad**: Contratos Pydantic v2, ámbito de finca derivado de sesión y sin credenciales embebidas.
- [x] **Integración en el estado actual del repositorio**: HU-08 quedó integrada al final de `backend/app/main.py` y `frontend/src/App.jsx`. Con autorización explícita también se resolvieron los conflictos existentes en `backend/app/features/sanitary_events/service.py` y `schema_migration.py`, preservando ambos lados.

## Estructura del Proyecto (Vertical Slicing)

### Backend: `backend/app/features/productivity/`

```text
backend/app/features/productivity/
├── __init__.py
├── models.py
├── schemas.py
├── service.py
├── router.py
└── fixtures/
    ├── lots.json
    └── animals.json
```

`models.py` contiene entidades aisladas; `schemas.py` contratos Pydantic v2; `service.py` reglas de dominio, fórmulas, proyecciones append-only y seed idempotente; `router.py` endpoints y dependencias de acceso.

### Frontend: `frontend/src/features/productivity/`

```text
frontend/src/features/productivity/
├── index.js
├── ProductivityView.jsx
├── productivity.css
├── productivityService.js
├── productivityValidation.js
└── productivityOfflineQueue.js
```

La vista presenta captura, historial, revisión y estados de datos. La cola offline usa `client_event_id`, `timestamp_utc`, estado `pending|syncing|failed` y payload.

### Pruebas

```text
backend/tests/
├── test_productivity.py
├── contract/test_productivity_api.py
└── unit/test_productivity_projection.py

frontend/src/features/productivity/
├── productivityValidation.test.js
└── productivityOfflineQueue.test.js
```

Se usan fixtures propios y la base aislada de pruebas; no se requiere poblar datos productivos reales.

## Contratos de API

Los contratos detallados están en [contracts/api.md](contracts/api.md). Operaciones previstas:

- `POST /pesajes` y `GET /pesajes?lote_id=...`
- `POST /pesajes/{pesaje_id}/correcciones`
- `POST /consumos` y `GET /consumos?lote_id=...`
- `POST /consumos/{consumo_id}/correcciones`
- `GET /lotes/{lote_id}/gdp?fecha_inicio=...&fecha_fin=...`
- `POST /pesajes/{pesaje_id}/revision`

No se exponen `PUT` ni `DELETE` para registros productivos históricos.

## Registro de Complejidad y Excepciones

| Compuerta Afectada | Motivo Técnico Ineludible | Alternativa Más Simple Descartada |
|---|---|---|
| Pruebas sanitarias preexistentes | Tras resolver los conflictos autorizados, tres pruebas sanitarias existentes fallan por discrepancias entre `SanitaryCorrectionRequest` y sus payloads, además de un payload de prueba que no cumple el contrato. No se modificaron esos contratos/tests adicionales sin autorización. | Cambiar reglas de otra historia para ocultar el desacuerdo contractual. |
| Revisión y corrección append-only | Los eventos históricos no pueden modificarse; el estado se deriva de nuevos eventos vinculados. | Actualizar un campo de estado sobre el pesaje original, lo cual violaría la constitución. |
