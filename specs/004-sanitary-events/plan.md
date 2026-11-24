# Plan de Implementación: Historial sanitario y correcciones por anexión

**Rama**: `feat/hu-04hu-04-sanitary-events` | **Spec**: [spec.md](spec.md)<br>
**Módulo**: `sanitary_events` | **Estado**: Planificado

## Resumen

Entregar la consulta del historial sanitario por DIN y la corrección veterinaria como nuevas anotaciones enlazadas, sin sobrescribir ni borrar el evento fuente. La rebanada implementable reside en `backend/app/features/sanitary_events/` y `frontend/src/features/sanitary_events/`; el animal se identifica por DIN como valor de dominio, sin una relación bloqueante con módulos SINIGÁN. Los contratos de entrada y salida se validan con Pydantic v2. La línea de tiempo conserva visibles tanto el evento fuente como sus correcciones y advierte el tiempo de retiro vigente.

La captura/sincronización offline existente no se amplía en alcance: este trabajo mantiene la consulta del historial local previamente sincronizado y la idempotencia de cualquier nueva anotación mediante `client_event_id` UUID. Las alertas críticas no se originan en esta funcionalidad; se mantiene el objetivo transversal de latencia inferior a 10 s e integridad del 99,9 %.

## Contexto técnico

- **Backend**: Python 3.11+, FastAPI, SQLAlchemy y contratos Pydantic v2, de acuerdo con los patrones ya presentes en el módulo.
- **Frontend**: React con JavaScript; línea de tiempo y servicio HTTP aislados en el directorio solicitado.
- **Persistencia**: reutilizar la persistencia del módulo; las escrituras de corrección son inserciones y no mutaciones de eventos existentes. La relación con el animal es su DIN (`str`), no una FK a SINIGÁN.
- **Pruebas**: TDD: primero pruebas unitarias, de contrato y seguridad bajo `backend/tests/`; después implementación. En frontend, pruebas del servicio/componente si el ejecutor disponible lo permite, además de `npm run build` y `npm run lint`.
- **Resiliencia**: preservar consultas previamente sincronizadas en modo desconectado, identificarlas como posiblemente desactualizadas y no perder datos locales. No se asigna a esta HU generación de alertas ni se rebaja el SLO global.
- **Seguridad/calidad**: mínimo privilegio y finca activa; entrada/salida tipada; sin secretos; criterios de calidad ISO/IEC 25010:2023 y ciberseguridad IoT NISTIR 8259A aplicados a validación, autorización, integridad de payload y tolerancia a reconexiones.

## Decisiones de diseño

1. **API de historial**: `GET /sanitary-events/animals/{din}`. Normalizar y validar el DIN; autorizar consulta dentro de la finca activa; devolver elementos en orden ascendente por fecha de captura y desempate estable por identificador. El resultado vacío es válido. Incluir autor, fecha de captura, fecha de sincronización, validación, vínculo de corrección/motivo y estado de tiempo de retiro cuando esté disponible.
2. **API de corrección**: `POST /sanitary-events/{event_id}/correct`, solo `VETERINARIO`; respuesta `201` al insertar. El cuerpo Pydantic v2 exige `reason` no vacío tras recortar espacios, los datos corregidos y `client_event_id: UUID`. Repetir el mismo identificador idempotente devuelve el resultado ya creado sin insertar otro evento.
3. **Modelo inmutable**: el evento sanitario es el registro canónico. Una corrección crea un evento nuevo cuyo `corrected_event_id` apunta al evento objetivo; conserva motivo, autoría y tiempos. Una corrección sobre otra corrección también es una nueva anotación enlazada al objetivo solicitado, manteniendo toda la cadena consultable. No se ofrece operación de modificación o eliminación del evento original ni se usa una tabla de versiones que reemplace sus valores.
4. **Transacción e invariantes**: validar autorización, finca, objetivo y unicidad antes de insertar; cualquier error deja intactos y sin nuevos registros los datos previos. La asociación DIN se mantiene como dato escalar para que seeds/pruebas del módulo sean autónomos y no dependan de FKs de historias paralelas.
5. **Frontend**: crear vista de línea de tiempo, cliente API y metadatos de navegación en `frontend/src/features/sanitary_events/`. En móvil (<768 px) usar presentación vertical y controles táctiles >=48×48 px; en escritorio facilitar revisión veterinaria. OPERARIO consulta, pero no ve acciones de corrección; VETERINARIO puede abrir el formulario con motivo obligatorio.
6. **Tiempo de retiro**: mostrar señalización destacada (amarillo/rojo según vigencia) usando el dato existente o expuesto por el contrato de consulta. No inventar ni recalcular una duración farmacológica ausente; la fuente/cálculo de ese dato debe confirmarse al implementar.
7. **Integración compartida**: `backend/app/main.py` ya importa los modelos y monta el router del módulo bajo `/sanitary-events`; evitar cambios si el router existente resuelve las rutas objetivo. Si fuera indispensable registrar una exportación o router, limitar el cambio al final del bloque de integración. `frontend/src/App.jsx` solo se toca al final, una vez comprobadas las pruebas de la rebanada.

## Compuertas de Constitución

| Compuerta | Evaluación | Salvaguarda / condición de salida |
|---|---|---|
| Aislamiento modular y seed autónomo | **Cumple con riesgo de coexistencia** | Código nuevo en `backend/app/features/sanitary_events/` y `frontend/src/features/sanitary_events/`. Pruebas/seed mínimo usan DIN de muestra sin depender de FK o seed de SINIGÁN. |
| Integración compartida mínima | **Cumple, pendiente de verificar al integrar** | Backend ya registra el router en `main.py`. Cualquier cambio compartido se limita a ese archivo y `frontend/src/App.jsx`, solo al final; no modificar autenticación, SINIGÁN ni almacenamiento compartido. |
| Sidebar, RBAC y responsive | **Pendiente/riesgo de arquitectura existente** | El `App.jsx` inspeccionado muestra un Dashboard directo y no un Sidebar/App Shell ni registro central de rutas. El módulo expondrá `navItem` (`id`, `label`, `icon`, `requiredRole`), mantendrá consulta por rol y restringirá corrección a VETERINARIO. Acordar cómo presentar el elemento en el Sidebar antes de integrarlo; no crear ni alterar otros módulos para simular una navegación global. |
| Append-only | **Cumple como invariante bloqueante** | Corrección exclusivamente insert-only; siempre `corrected_event_id`, motivo requerido y autor VETERINARIO. Pruebas comparan el evento antes/después y aseguran que no se invoca UPDATE/DELETE destructivo. |
| SINIGÁN V6 e idempotencia | **Cumple con dependencia de autoridad** | DIN es identificador oficial y no se sobrescribe ante divergencias; mantener el flujo de conflicto existente. `client_event_id` UUID protege reintentos, sin FKs cruzadas. |
| ISO/IEC 25010:2023, NISTIR 8259A, SRE | **Cumple por verificación** | Pruebas de validación/autorización/integridad e idempotencia; no exponer secretos. Se conserva el objetivo global de alertas <10 s e integridad ≥99,9 %; la HU no implementa alertas. |
| Idioma, mobile-first y accesibilidad | **Cumple por aceptación** | UI y documentación en español; breakpoint <768 px, contraste legible y acciones táctiles de al menos 48×48 px. |

**Resultado Constitution Check**: la implementación puede iniciar con las salvaguardas anteriores. La integración de navegación queda bloqueada hasta acordar el punto de acoplamiento al Sidebar inexistente en la estructura inspeccionada; no bloquea pruebas o construcción aislada del módulo.

## Arquitectura por rebanada vertical

### Backend — `backend/app/features/sanitary_events/`

```text
backend/app/features/sanitary_events/
├── models.py       # Evento inmutable, corrected_event_id, índices y unicidad de client_event_id
├── schemas.py      # Contratos Pydantic v2: consulta, evento y corrección
├── service.py      # Consulta ordenada, alcance de finca, retiro e inserción idempotente
└── router.py       # GET /animals/{din} y POST /{event_id}/correct
```

El router existente ya se incluye bajo `/sanitary-events` desde `main.py`; conservar los endpoints existentes de sincronización solo si no contradicen estas invariantes. No introducir referencias FK a `animals`, SINIGÁN ni otros módulos. Los contratos rechazan campos no admitidos donde corresponda, normalizan DIN, validan fechas/UUID y garantizan que el motivo no sea blanco.

**Consulta**: `GET /sanitary-events/animals/{din}` → respuesta tipada con `din`, eventos ordenados, metadatos de autor/fechas/validación, `corrected_event_id`, motivo y datos de tiempo de retiro disponibles.

**Corrección**: `POST /sanitary-events/{event_id}/correct` → cuerpo con `client_event_id`, datos sanitarios corregidos y `reason`; requiere sesión autenticada, rol VETERINARIO y pertenencia a finca activa. Errores esperados: validación 422; falta de autorización 401/403; evento inexistente o fuera de ámbito 404; conflicto de idempotencia solo si el mismo UUID se reutiliza con contenido distinto. Un reintento equivalente devuelve el evento previamente anexado.

### Frontend — `frontend/src/features/sanitary_events/`

```text
frontend/src/features/sanitary_events/
├── index.js                    # Exportación y navItem con requiredRole
├── SanitaryTimeline.jsx        # Línea de tiempo inmutable y estado de retiro
├── SanitaryCorrectionForm.jsx  # Corrección veterinaria con motivo obligatorio
└── services/
    └── sanitaryEventsService.js # Consulta y corrección; errores y reintentos
```

La vista presenta estado de conexión y frescura de datos (caché sincronizada marcada como posiblemente desactualizada); no elimina el historial local ante fallos. La cola de correcciones, si se habilita offline, empleará el prefijo `bovinotech_offline_sanitary_events_queue` y el esquema constitucional `client_event_id`, `timestamp_utc`, `status`, `payload`; el reintento en servidor será idempotente. No reutilizar ni mover archivos de `frontend/src/features/sanitary-events/` en esta fase.

### Pruebas

```text
backend/tests/
├── unit/test_sanitary_events_append_only.py
├── unit/test_sanitary_events_schemas.py
├── contract/test_sanitary_events_history_api.py
├── contract/test_sanitary_events_correction_api.py
└── security/test_sanitary_events_access.py
```

Las pruebas usan base aislada y datos propios del módulo; cubren RBAC, finca activa, orden/empty state, tiempo de retiro, validación Pydantic v2, retry UUID, integridad de originales y denegación de escritura por roles no autorizados. Añadir pruebas frontend de timeline/servicio en la ubicación de tests que admita la configuración actual del frontend.

## Diferencias y riesgos observados

- El backend conserva `SanitaryEventCorrection` y las rutas históricas `GET /by-din/{din}/history` y `POST /{event_id}/corrections` por compatibilidad. La ruta histórica de corrección ahora anexa un `SanitaryEvent` con `corrected_event_id` y proyecta la respuesta versionada; las filas previas de `SanitaryEventCorrection` se mantienen solo como historial legado y no se migran ni modifican destructivamente. Las rutas históricas de consulta y corrección respetan la finca activa.
- El frontend instalado está en `frontend/src/features/sanitary-events/` (guion), y `App.jsx` ya importa allí `SanitaryHistory`; el destino explícito de esta planificación es `frontend/src/features/sanitary_events/` (guion bajo). Implementar la nueva línea de tiempo en la ruta explícita y decidir, en la integración final, el punto de reemplazo/compatibilidad. No modificar la carpeta existente por fuera de esa integración.
- El `App.jsx` inspeccionado carece de Sidebar; la integración RBAC visual deberá coordinarse con el dueño de la navegación. No se amplía `App.jsx` ni se altera otra carpeta para introducir una navegación paralela.
- La especificación no detalla campos clínicos completos, fuente de cálculo del retiro, persistencia offline de correcciones ni política de cadena sobre corrección de corrección. La interfaz mantiene los campos actuales compatibles y estas decisiones deben resolverse sin romper append-only ni los contratos indicados.

## Secuencia técnica

1. Escribir primero pruebas unitarias/contrato/seguridad y comprobar que fallen por contrato ausente o semántica incumplida.
2. Definir los esquemas Pydantic v2 y el modelo append-only; implementar servicio transaccional e idempotencia.
3. Implementar los dos endpoints solicitados y ejecutar pruebas de backend del módulo, seguidas de la suite backend relevante.
4. Crear línea de tiempo y servicio en el directorio frontend con pruebas, roles, retiro y estados offline.
5. Resolver la decisión de Sidebar y compatibilidad con rutas legadas; después integrar mínimamente en `App.jsx` (y `main.py` solo si hiciera falta).
6. Ejecutar validación final de `pytest`, `npm run build` y `npm run lint`; no integrar si falla una compuerta de append-only, RBAC, aislamiento o idempotencia.

## Nota de generación del plan

La utilidad `setup_plan.py --json` no pudo resolver la carpeta de funcionalidad: no existe `.specify/feature.json` ni está configurado `SPECIFY_FEATURE_DIRECTORY`; el intento con `python` tampoco está disponible en este entorno. Se conserva la rama real inspeccionada y se redacta el plan manualmente a partir de la especificación, constitución, plantilla y convenciones verificadas. No se generaron artefactos adicionales.
