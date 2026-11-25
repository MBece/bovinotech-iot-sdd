# Plan de Implementación: HU-006 `telemetry`

**Spec**: [spec.md](spec.md)  
**Estado**: POR HACER  
**Enfoque**: rebanada vertical TDD para ingesta, evaluación y atención de alertas

## Resumen técnico

La historia se implementará como un módulo backend aislado en `backend/app/features/telemetry/` y una vista frontend aislada en `frontend/src/features/alerts/`. El backend registrará dispositivos, lotes, lecturas, geocercas, versiones de reglas, evaluaciones, alertas y cierres. La interfaz permitirá consultar y atender alertas según el rol. Los únicos puntos compartidos serán líneas agregadas a `backend/app/main.py` y `frontend/src/App.jsx` para registrar la nueva rebanada.

No se introducirá un broker externo para el piloto. La recepción y evaluación serán síncronas dentro del servicio modular, dejando contratos e identificadores de correlación que permitan extraer el procesamiento en el futuro sin cambiar el dominio.

## Verificación de constitución

- Documentación y UI en español; código e identificadores técnicos en inglés.
- Pruebas primero y contratos tipados antes de la implementación.
- Telemetría propia separada de referencias SINIGÁN.
- Idempotencia por `batch_id` y `reading_id`.
- Aislamiento por `farm_id` derivado de la identidad autenticada, nunca confiado desde acciones humanas del cliente.
- Mínimo privilegio por rol y autenticación independiente de dispositivos.
- Cero secretos en código o datos de prueba.
- Objetivo funcional p95 menor a dos minutos y objetivo constitucional inferior a diez segundos para alertas críticas.
- CI objetivo menor a 90 segundos.

## Estructura prevista

```text
backend/app/features/telemetry/
├── __init__.py
├── models.py
├── schemas.py
├── rules.py
├── service.py
├── router.py
├── dependencies.py
├── schema_migration.py
└── seed.py

frontend/src/features/alerts/
├── alertService.js
├── AlertsPanel.jsx
├── AlertDetail.jsx
├── AlertFilters.jsx
└── index.js
```

Los tests de la HU se ubicarán en `backend/tests/` por mandato constitucional. El generador sintético será determinista y no contendrá credenciales reales.

## Modelo de datos

### `TelemetryDevice`

- Identidad pública, huella de credencial, finca, animal (`bovine_id` string), estado y vigencia de asignación.
- La credencial se almacena como huella; el secreto solo se entrega fuera del repositorio.

### `TelemetryBatch`

- `batch_id` único, dispositivo, finca, hash canónico del contenido, fecha de recepción, estado y conteos de resultado.
- Un mismo `batch_id` con igual hash retorna el resultado persistido; con otro hash produce conflicto.

### `TelemetryReading`

- `reading_id` único, lote, dispositivo, finca, animal, fecha de captura, actividad, latitud, longitud, precisión y fecha de recepción.
- Índices por `(farm_id, bovine_id, captured_at)` y `(device_id, captured_at)`.

### `GeofenceVersion` y `AlertRuleVersion`

- Registros inmutables y versionados con vigencia, configuración canónica, autor y fecha.
- Una nueva configuración crea una versión; no se sobrescriben versiones usadas por evaluaciones anteriores.

### `TelemetryEvaluation`

- Lectura o ventana evaluada, regla y geocerca aplicadas, resultado, explicación, evidencia temporal y correlación.

### `TelemetryAlert` y `AlertClosure`

- Alerta con finca, animal, tipo, estado, regla aplicada, primera/última evidencia y última posición válida.
- Restricción lógica para una sola alerta abierta por `(farm_id, bovine_id, alert_type, condition_key)`.
- El cierre se conserva como registro humano separado; el estado visible se deriva de su existencia.

## Contratos HTTP previstos

| Método | Ruta | Actor | Propósito |
|---|---|---|---|
| `POST` | `/telemetry/batches` | Dispositivo autenticado | Ingerir un lote idempotente y devolver resultado por lectura |
| `GET` | `/telemetry/alerts` | Roles humanos autenticados | Listar alertas de la finca activa con filtros y paginación |
| `GET` | `/telemetry/alerts/{alert_id}` | Roles humanos autenticados | Consultar evidencia y trazabilidad de una alerta de la finca activa |
| `POST` | `/telemetry/alerts/{alert_id}/close` | `OPERARIO`, `VETERINARIO` | Registrar cierre humano con observación |
| `GET` | `/telemetry/rules` | Roles humanos autenticados | Consultar reglas vigentes e históricas de la finca activa |
| `POST` | `/telemetry/rules` | `ADMINISTRADOR` | Publicar una nueva versión de regla |
| `GET` | `/telemetry/geofences` | Roles humanos autenticados | Consultar geocercas vigentes e históricas |
| `POST` | `/telemetry/geofences` | `ADMINISTRADOR` | Publicar una nueva versión de geocerca |

Las respuestas de ingesta incluirán estados por lectura para que una inválida no oculte el resultado de las válidas. Los errores de autorización no revelarán si un recurso existe en otra finca.

## Motor de reglas

1. Validar autenticidad del dispositivo, vigencia de asignación y hash idempotente del lote.
2. Validar cada lectura de forma independiente: identificador, rango, coordenadas, precisión y orden temporal permitido.
3. Persistir las lecturas válidas y diagnósticos de rechazo del lote.
4. Seleccionar la regla y geocerca vigentes según finca y fecha de evaluación.
5. Construir una ventana ordenada de evidencia del mismo animal.
6. Si faltan muestras, hay un hueco superior al permitido o la precisión no permite determinar un cruce, persistir `INSUFFICIENT_DATA` sin alerta.
7. Evaluar inmovilidad y transición interior→exterior con funciones puras en `rules.py`.
8. Abrir una alerta o agregar evidencia a la abierta usando una operación transaccional idempotente.
9. Devolver resultados y tiempos de procesamiento por lectura.

Las funciones geométricas usarán una convención documentada para puntos sobre el borde y polígonos válidos. Los umbrales vendrán siempre de la versión de regla; no se quemarán en el motor.

## Seguridad y RBAC

- La ingesta utilizará una dependencia específica de autenticación de dispositivo distinta del JWT de usuarios.
- Las credenciales se verificarán mediante huella y comparación segura; nunca se registrará el secreto.
- La finca del lote se resolverá desde el dispositivo autenticado.
- Las rutas humanas reutilizarán autenticación de HU-001 y filtrarán siempre por `active_farm_id`.
- `DIRECTIVO` será solo lectura; `OPERARIO` y `VETERINARIO` podrán cerrar; `ADMINISTRADOR` configurará versiones y consultará.
- Se impondrán límites de tamaño del lote, longitud de textos, paginación y rangos numéricos.
- No se expondrán endpoints de actualización o borrado destructivo de lecturas, evaluaciones, reglas, alertas o cierres.

## Interfaz

- `AlertsPanel` mostrará contadores y listado filtrable por estado, tipo y animal.
- `AlertDetail` presentará evidencia, versión de regla, antigüedad de última posición y trazabilidad del cierre.
- La acción **Cerrar alerta** solo aparecerá a `OPERARIO` y `VETERINARIO` y exigirá observación.
- La interfaz no presentará una posición ausente o antigua como actual y mostrará claramente `Datos insuficientes`.
- La configuración administrativa de reglas/geocercas se considera parte del contrato, pero puede entregarse con formularios mínimos en esta misma rebanada si no compromete el WIP ni las compuertas.

## Estrategia de pruebas

### Unitarias

- Rangos, coordenadas, orden temporal y normalización canónica.
- Punto dentro/fuera/borde de polígono.
- Ventanas de inmovilidad, huecos de datos y precisión insuficiente.
- Selección de versión vigente y deduplicación de condición activa.

### Contrato

- Esquemas de lote, resultado parcial, alerta, cierre, regla y geocerca.
- Códigos para autenticación, idempotencia, conflicto, validación y RBAC.
- Ausencia de información cruzada entre fincas.

### Integración

- Reenvío idéntico y conflicto por hash diferente.
- Persistencia lectura→evaluación→alerta dentro de una transacción.
- Una sola alerta abierta por condición y cierre humano trazable.
- Cambio de versión sin alterar alertas históricas.

### Seguridad y rendimiento

- Dispositivo revocado, credencial inválida, lote sobredimensionado y campos maliciosos.
- Acceso cruzado por finca y escalamiento de privilegios.
- Escaneo SAST y verificación de secretos.
- Prueba sintética determinista del p95; conjunto rápido para CI y perfil ampliado documentado fuera de la compuerta de 90 segundos.

### Frontend y E2E

- Render de estados, filtros, permisos y antigüedad de ubicación.
- Flujo telemetría→alerta→consulta→cierre humano.
- Regresión de autenticación y navegación de las HU-001 a HU-005.

## Orden de implementación

1. Congelar contratos y datos sintéticos.
2. Escribir pruebas unitarias de validación, geocerca y reglas.
3. Escribir pruebas de contrato, idempotencia, RBAC y aislamiento.
4. Crear modelos y migración idempotente del módulo.
5. Implementar validación, ingesta, evaluación y persistencia transaccional.
6. Implementar endpoints humanos y autenticación de dispositivo.
7. Implementar panel, detalle, filtros y cierre.
8. Registrar router/modelos y vista en los dos puntos compartidos permitidos.
9. Ejecutar pruebas, SAST, lint, build, E2E y medición de p95.
10. Actualizar trazabilidad y solicitar aprobación humana.

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Falsos positivos por huecos o mala precisión GPS | Estado explícito `INSUFFICIENT_DATA`, ventana mínima y pruebas de borde |
| Duplicados por reintentos rurales | Idempotencia por lote y lectura, hash canónico y restricción de alerta abierta |
| Cruce de datos entre fincas | Derivar finca de la identidad y filtrar todas las consultas/escrituras |
| Exposición de credenciales IoT | Guardar solo huellas, redactar logs y usar configuración externa |
| Geometría ambigua | Convención de borde documentada y casos unitarios deterministas |
| Alertas históricas alteradas por configuración | Reglas/geocercas inmutables y versión fijada en cada evaluación |
| CI supera 90 segundos | Dataset pequeño determinista en CI y prueba de carga ampliada separada |
| Dependencia de modelos de animales de otra HU | Referencia por `bovine_id` string, sin FK bloqueante |

