# Investigación y decisiones: Productividad por lote

**Fecha**: 2026-11-24

## Decisiones

### D1. Reusar los contratos tipados y el aislamiento propios de cada feature

- **Decisión**: Definir request/response con Pydantic v2 y ubicar modelos, servicios, router y fixtures propios en `backend/app/features/productivity/`.
- **Racional**: La constitución requiere aislamiento por rebanada vertical y contratos de entrada/salida tipados. El módulo de captura existente usa `BaseModel`, `Field`, alias camelCase, DIN como string y fixtures locales idempotentes.
- **Alternativas consideradas**: Agregar entidades a módulos de captura o sincronización existentes; descartado por acoplamiento entre historias.

### D2. Persistir eventos productivos y revisiones como una secuencia append-only

- **Decisión**: Conservar pesaje y consumo originales inmutables. Una revisión se registra como evento nuevo que referencia el pesaje; una corrección crea otra versión enlazada con `corrected_event_id` y motivo.
- **Racional**: Mantiene evidencia auditable y cumple la prohibición de modificar o borrar historia. El estado actual es una proyección sobre evento original y revisiones.
- **Alternativas consideradas**: Cambiar un campo `status` en el registro original o borrar el registro rechazado; descartado por violar append-only.

### D3. Comparar la atipicidad con el pesaje anterior del mismo animal

- **Decisión**: Evaluar diferencia absoluta y tiempo real transcurrido entre la nueva captura y la captura previa cronológica para el mismo animal y finca. La regla es estricta: `abs(delta) > 15 kg` y `elapsed < 24 h`.
- **Racional**: Detecta tanto saltos positivos como negativos y preserva los límites exactos descritos por la historia.
- **Alternativas consideradas**: Comparar solo el peso anterior dentro del mismo lote; descartado porque un traslado de lote no debe ocultar una variación sospechosa del animal.

### D4. Promediar GDP individual de una cohorte completa del lote

- **Decisión**: Calcular GDP por animal entre dos pesajes aprobados, y publicar el promedio aritmético del lote solo si todos los animales declarados en la cohorte tienen las muestras requeridas.
- **Racional**: La tasa individual normaliza cada animal por sus días transcurridos y evita presentar un promedio parcial como si representara toda la cohorte.
- **Alternativas consideradas**: Promedio solo de animales con datos o promedio de diferencias sin normalizar; descartado por ocultar muestras faltantes o mezclar duraciones distintas.

### D5. Separar suficiencia por indicador y costos

- **Decisión**: La respuesta presenta estado y faltantes por GDP, eficiencia alimenticia y costos; el resumen general es `DATOS_INSUFICIENTES` cuando algún componente solicitado carece de entradas. No se calcula rentabilidad sin una fórmula de negocio aprobada.
- **Racional**: El usuario exige marcar falta de muestras o costos, pero solo define fórmulas para GDP y eficiencia alimenticia.
- **Alternativas consideradas**: Interpretar costos como cero o inventar un indicador de rentabilidad; descartado por producir conclusiones falsas.

### D6. Usar persistencia local estandarizada y reintentos idempotentes

- **Decisión**: La cola de campo usa `bovinotech_offline_productivity_queue` y el contrato `{client_event_id, timestamp_utc, status, payload}`; servidor deduplica por `client_event_id` dentro de finca.
- **Racional**: Alinea el módulo con la constitución y los patrones de captura/sincronización existentes.
- **Alternativas consideradas**: Cola propia con campos incompatibles o envío que dependa de conectividad; descartado por perder compatibilidad y bloquear la operación rural.

## Fuentes de patrones locales

- `.specify/memory/constitution.md`: aislamiento, RBAC, offline hub, append-only y gobernanza SRE.
- `backend/app/features/offline_capture/schemas.py`: validación Pydantic v2, campos de DIN y normalización de captura.
- `backend/app/features/offline_capture/service.py`: fixtures JSON y seed que solo inserta filas faltantes.
- `frontend/src/core/offline/offlineEventRepository.js`: persistencia local y estados de sincronización.

## Riesgos y mitigaciones

- **Cohorte incompleta**: fijar los animales esperados en la consulta/periodo; no calcular promedios parciales.
- **Variación por error de captura**: marcar y excluir sin borrar; revisión auditable antes de su uso.
- **Integración en archivo compartido con conflicto previo**: posponer el registro en `App.jsx` hasta que el conflicto ajeno a HU-08 se resuelva; no sobrescribirlo desde esta historia.
