# Modelo de Datos: `sinigan_sync` (HU-05)

## Aislamiento por finca (D10)

`farm_id` es la frontera de tenant heredada de HU-01. Se toma siempre del claim
`farm_id` del token; nunca de body ni query. Las tablas hijas
(`reconciliation_discrepancies`, `reconciliation_resolutions`) heredan la finca a
través del ticket y no duplican la columna. El seed ficticio de campo se asigna a
la finca 1 por defecto.

## FieldAnimalRecord

Registro de campo ficticio mínimo. No es una copia del fixture oficial y no tiene FK contra SINIGÁN.

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `id` | Integer PK | Sí | Identificador interno |
| `din` | String(32), unique, index | Sí | DIN del animal (único global: identificador nacional) |
| `farm_id` | Integer, index | Sí | Finca activa del registro (D10) |
| `species` | String(16) | Sí | `BOVINO` / `BUFALINO` |
| `sex` | String(16) | Sí | `HEMBRA` / `MACHO` |
| `age_group` | String(16) | Sí | `TERNERO` / `JOVEN` / `ADULTO` |
| `sit_code` | String(32) | Sí | Código de predio de campo |
| `establishment_name` | String | Sí | Nombre de la finca |
| `source` | String | Sí | `REGISTRO_DE_CAMPO` |
| `updated_at` | DateTime tz | Sí | UTC |

## ReconciliationTicket

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `id` | Integer PK | Sí | Identificador del ticket |
| `din` | String(32), index | Sí | Animal conciliado |
| `farm_id` | Integer, index | Sí | Finca activa que creó el ticket (D10) |
| `status` | String(16) | Sí | `OPEN` / `CLOSED` |
| `official_snapshot` | JSON | Sí | Ficha oficial completa al comparar |
| `field_snapshot` | JSON | Sí | Registro de campo completo al comparar |
| `official_source` | String | Sí | `MODO SIMULADO (SINIGÁN V6 MOCK)` |
| `field_source` | String | Sí | `REGISTRO DE CAMPO` |
| `compared_at` | DateTime tz | Sí | UTC |
| `created_by_email` | String | Sí | Usuario autenticado |
| `created_at` | DateTime tz | Sí | UTC |
| `closed_at` | DateTime tz | No | UTC al resolver |

## ReconciliationDiscrepancy

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `id` | Integer PK | Sí | Identificador |
| `ticket_id` | FK ticket, index | Sí | Ticket padre |
| `field_name` | String(32) | Sí | `species`, `sex`, `age_group`, `sit_code` |
| `field_value` | String | Sí | Valor de campo |
| `official_value` | String | Sí | Valor oficial |
| `official_source` | String | Sí | Etiqueta mock |
| `field_source` | String | Sí | Origen de campo |
| `detected_at` | DateTime tz | Sí | UTC |

Constraint único: `(ticket_id, field_name)`.

## ReconciliationResolution

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `id` | Integer PK | Sí | Identificador |
| `ticket_id` | FK ticket, unique | Sí | Una resolución por ticket |
| `decision` | String(32) | Sí | `OFICIAL_PREVALECE` / `CAMPO_PREVALECE` |
| `reason` | Text | Sí | 5–500 caracteres |
| `resolved_by_email` | String | Sí | Veterinario autenticado |
| `resolved_at` | DateTime tz | Sí | UTC |

## Migración local

`ensure_sinigan_sync_schema(engine)` agrega `farm_id` a bases SQLite creadas antes
de D10:

```sql
ALTER TABLE field_animal_records ADD COLUMN farm_id INTEGER NOT NULL DEFAULT 1;
ALTER TABLE reconciliation_tickets ADD COLUMN farm_id INTEGER NOT NULL DEFAULT 1;
CREATE INDEX IF NOT EXISTS ix_field_animal_records_farm_id ON field_animal_records (farm_id);
CREATE INDEX IF NOT EXISTS ix_reconciliation_tickets_farm_id ON reconciliation_tickets (farm_id);
```

Las filas existentes quedan en finca 1. La función es idempotente y no hace nada
si las tablas no existen (las crea `Base.metadata.create_all`).

## Invariantes

1. Un `DIN` inexistente en la fuente oficial no crea `FieldAnimalRecord`, tickets ni discrepancias.
2. Una comparación sin diferencias no crea ticket.
3. Un ticket con discrepancias conserva snapshots inmutables.
4. Una resolución no modifica snapshots, ficha oficial ni registro de campo.
5. Un ticket cerrado no se reabre; una segunda resolución devuelve `409`.
6. No existen endpoints `PUT`, `PATCH` o `DELETE` sobre estos recursos.
7. Toda lectura o escritura de HU-05 exige finca activa; sin ella devuelve `403` y no toca datos.
8. Un ticket o registro de campo de otra finca es indistinguible de uno inexistente (`404`/`409`), sin filtrar su existencia.
