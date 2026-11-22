# D10 — Aislamiento de HU-05 por finca activa (integración con HU-01)

- **Estado:** aceptado (2026-11-22)
- **Contexto:** HU-01 introdujo multi-finca y RBAC. La constitución exige que cada
  rol acceda solo a los datos de **su finca activa**. HU-05 se especificó antes de
  ese modelo y no tenía dimensión de finca.
- **Decisión:** la finca activa (`current_user.active_farm_id`, claim `farm_id`
  del JWT) es la frontera de tenant de `sinigan_sync`. No se acepta finca por
  body ni por query: solo del token.

## Reglas

1. `field_animal_records.farm_id` y `reconciliation_tickets.farm_id` son
   `INTEGER NOT NULL`, indexados. Las tablas hijas
   (`reconciliation_discrepancies`, `reconciliation_resolutions`) heredan la
   finca a través del ticket; no se duplica la columna.
2. `din` sigue siendo único **global** en `field_animal_records`: es un
   identificador nacional. Un DIN pertenece al registro de campo de una sola
   finca; no se crea el mismo DIN en dos fincas.
3. Sin finca activa (`active_farm_id is None`, p. ej. token legado) se falla
   cerrado: **403** `"Se requiere una finca activa para operar la conciliación."`
   en los cuatro endpoints de HU-05.
4. `POST /comparisons` busca el registro de campo por `(din, farm_id)`. Si el
   registro existe solo en otra finca, responde **409** con el mismo mensaje que
   "no existe registro de campo", para no filtrar la existencia entre fincas.
5. `GET /tickets`, `GET /tickets/{id}` y `POST /tickets/{id}/resolution` filtran
   por finca. Un ticket de otra finca responde **404** con el mismo mensaje que
   un ticket inexistente.
6. El ticket nuevo se persiste con la finca del token. `created_by_email` se
   conserva como traza del actor.
7. Las respuestas de ticket (resumen y detalle) incluyen `farmId` de forma
   aditiva, para hacer visible y auditable el aislamiento. No cambia ningún AC.
8. El seed ficticio de campo se asigna a la finca 1 por defecto
   (`seed_field_animals(db, farm_id=1)`), idempotente por DIN.

## Migración local

`Base.metadata.create_all` no agrega columnas. Se añade
`ensure_sinigan_sync_schema(engine)` (mismo patrón que `ensure_auth_schema`) que,
si las tablas existen sin `farm_id`, ejecuta:

```sql
ALTER TABLE field_animal_records ADD COLUMN farm_id INTEGER NOT NULL DEFAULT 1;
ALTER TABLE reconciliation_tickets ADD COLUMN farm_id INTEGER NOT NULL DEFAULT 1;
CREATE INDEX IF NOT EXISTS ix_field_animal_records_farm_id ON field_animal_records (farm_id);
CREATE INDEX IF NOT EXISTS ix_reconciliation_tickets_farm_id ON reconciliation_tickets (farm_id);
```

Se invoca en `main.py` después de `ensure_auth_schema` y antes de los seeds. Las
filas existentes quedan en finca 1 (entorno local, sin datos productivos).

## Consecuencias

- Un `VETERINARIO` multifinca (`vet2@bovinotech.co`) que entra a la finca 2 no ve,
  no lee ni resuelve tickets de la finca 1.
- Un operario de la finca 1 no puede conciliar un DIN cuyo registro de campo
  pertenece a la finca 2.
- Los 4 AC de HU-05 no cambian: siguen siendo por DIN; la finca solo acota
  visibilidad y autorización.
- El harness E2E debe leer el token de `bovinotech_session` (HU-01 dejó de
  escribir `bovinotech_token`) y añadir una comprobación cruzada de fincas.

## Fuera de alcance

- Transferencia de animales entre fincas y reasignación histórica de tickets.
- Cambiar el rol que resuelve: sigue siendo solo `VETERINARIO`.
- Añadir finca a tablas de otros módulos.
