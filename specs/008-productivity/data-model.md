# Modelo de datos: Productividad por lote

El módulo mantiene sus entidades propias. `farm_id`, `lote_id` y DIN se guardan como identificadores por valor; no se añaden relaciones foráneas bloqueantes con otras historias. Los registros históricos son inmutables.

## `ProductivityLotFixture`

Fixture propio que identifica la muestra de lote necesaria para pruebas y demostraciones.

| Campo | Tipo conceptual | Restricciones |
|---|---|---|
| `lote_id` | string | Obligatorio, no vacío, máximo 64 caracteres. |
| `farm_id` | entero | Obligatorio, positivo; se compara con la finca activa del usuario. |
| `name` | string | Obligatorio, no vacío, máximo 120 caracteres. |
| `animal_dins` | lista de string | Cohorte de DIN sin duplicados; cada DIN entre 1 y 32 caracteres. |

El seed de fixtures inserta únicamente elementos ausentes; nunca sobrescribe registros existentes.

## `ProductivityWeighing`

Evento inmutable de observación de peso por animal.

| Campo | Tipo conceptual | Restricciones |
|---|---|---|
| `id` | UUID | Identificador del evento. |
| `client_event_id` | UUID | Obligatorio; clave de idempotencia de captura. |
| `farm_id` | entero | Obligatorio, positivo; tomado de la sesión autenticada. |
| `lote_id` | string | Obligatorio, no vacío, máximo 64 caracteres. |
| `bovine_id` | string | Obligatorio; DIN normalizado en mayúsculas, entre 1 y 32 caracteres. |
| `weight_kg` | decimal | Obligatorio, finito y mayor que cero; unidad canónica kg. |
| `captured_at` | datetime | Obligatorio, con zona horaria; normalizado a UTC. |
| `author_id` | string | Obligatorio; procede de la identidad autenticada. |
| `is_atypical` | booleano | Inmutable; verdadero si excede 15 kg en menos de 24 horas. |
| `corrected_event_id` | UUID opcional | Referencia por valor al evento corregido; sin mutar el original. |
| `correction_reason` | string opcional | Obligatorio para una corrección; 1–500 caracteres no vacíos. |

No se almacena como editable el estado de revisión. Se deriva de `is_atypical` y de los eventos `ProductivityWeighingReview` anexados.

## `ProductivityConsumption`

Evento inmutable de consumo de alimento por lote y periodo.

| Campo | Tipo conceptual | Restricciones |
|---|---|---|
| `id` | UUID | Identificador del evento. |
| `client_event_id` | UUID | Obligatorio; clave de idempotencia. |
| `farm_id` | entero | Obligatorio, positivo; tomado de la sesión autenticada. |
| `lote_id` | string | Obligatorio, no vacío, máximo 64 caracteres. |
| `period_start` / `period_end` | datetime | Obligatorios, con zona horaria; inicio anterior al fin. |
| `quantity_kg` | decimal | Obligatorio, finito y mayor que cero; unidad canónica explícita kg. |
| `cost_amount` | decimal opcional | Finito y no negativo; si se informa, requiere moneda. |
| `currency_code` | string opcional | Código ISO 4217 de tres letras en mayúsculas; requerido con costo. |
| `author_id` | string | Obligatorio; procede de la identidad autenticada. |
| `corrected_event_id` | UUID opcional | Referencia por valor al evento corregido; sin mutar el original. |
| `correction_reason` | string opcional | Obligatorio para una corrección; 1–500 caracteres no vacíos. |

## `ProductivityWeighingReview`

Decisión append-only sobre un pesaje atípico.

| Campo | Tipo conceptual | Restricciones |
|---|---|---|
| `id` | UUID | Identificador del evento de revisión. |
| `weighing_id` | UUID | Obligatorio; vínculo por valor al pesaje observado. |
| `decision` | enum | `APPROVED` o `REJECTED`. |
| `reason` | string | Obligatorio, 1–500 caracteres no vacíos. |
| `reviewer_id` | string | Obligatorio; usuario VETERINARIO o ADMINISTRADOR autorizado. |
| `reviewed_at` | datetime | Obligatorio, con zona horaria; normalizado a UTC. |

La proyección de estado considera la decisión válida más reciente; todas las decisiones previas permanecen auditables.

## `ProductivitySummary` (proyección)

No es fuente de verdad ni registro editable; se calcula a partir de eventos aceptados y del rango solicitado.

| Campo | Restricciones |
|---|---|
| `lote_id`, `period_start`, `period_end` | Identifican finca, lote y periodo de consulta. |
| `gdp_kg_per_day` | Nullable; media de GDP individuales con muestras aprobadas y periodo positivo. |
| `feed_efficiency_kg_per_kg` | Nullable; consumo total kg / ganancia total kg positiva. |
| `cost_status` | `SUFFICIENT` o `DATOS_INSUFICIENTES`; indica completitud, no rentabilidad. |
| `status` | `SUFFICIENT` solo cuando los componentes solicitados tienen entradas completas; de lo contrario `DATOS_INSUFICIENTES`. |
| `missing_data` | Lista de códigos de faltantes; nunca se usa para sustituir datos por cero. |

## Reglas de dominio y relaciones

- Un lote de una finca contiene DIN como strings y no depende de la tabla de animales de otra historia.
- Cada pesaje pertenece a un lote, animal y finca; la comparación de atipicidad consulta el evento previo del mismo animal/finca aunque haya cambiado de lote.
- Cada consumo pertenece a un lote, finca y periodo.
- El mismo `client_event_id` dentro de la finca produce una respuesta duplicada idempotente, no un segundo evento.
- El umbral atípico usa `abs(peso_actual - peso_anterior) > 15 kg` y `0 < intervalo < 24 horas`.
- Cualquier modificación de dato es una nueva versión enlazada mediante `corrected_event_id`. Las revisiones son nuevos eventos; nunca se ejecuta una mutación destructiva de la historia.
