# Decisiones y ADRs — HU-05 `sinigan_sync`

## Decisiones aprobadas por el usuario (D1–D9)

Ver `plan-approved.md` y `manifest.json`.

## ADRs aceptados por A0 a partir de A1

| ID | Decisión | Estado | Justificación |
|---|---|---|---|
| A1-ADR-01 | `SiniganSyncService(adapter: SiniganAdapter)` por constructor; el router lo construye con `sinigan_service.adapter` | Aceptado | Testabilidad y patrón existente en `sanitary_events` |
| A1-ADR-02 | Importar `DIN_PATTERN` y reutilizar `to_camel`/`CamelModel` de `sinigan.schemas` | Aceptado | Evitar deriva de contrato |
| A1-ADR-03 | `ReconciliationMeta` propio con `mockLabel`; constante única `MOCK_LABEL` | Aceptado | El `SimulationMeta` existente no incluye la etiqueta exigida |
| A1-ADR-04 | `seed_field_animals(db: Session)` idempotente; invocable desde `main.py` y desde `conftest`/fixtures de test | Aceptado | Evitar que las pruebas usen una base sin registros de campo |
| A1-ADR-05 | DIN inválido: `400` manual en router; payload inválido: `422`; `reason` con `trim` antes de validar 5–500 | Aceptado | Cumplir el contrato congelado |
| A1-ADR-06 | `field_animal_records` es un registro ficticio module-scoped, sin FK, sin CRUD y no autoritativo | Aceptado | No invadir una futura HU de inventario |
| A1-ADR-07 | Snapshots y resolución inmutables; transición `OPEN -> CLOSED` permitida; un ticket por comparación (D3) | Aceptado | Trazabilidad y consistencia con D3 |
| A1-ADR-08 | Listado de tickets por `created_at DESC, id DESC`; `limit` 1–100 sin offset | Aceptado | Orden determinista para pruebas y UI |

## Correcciones documentales posteriores a A2

A2 detectó dos inconsistencias en `plan.md`:

1. La tabla de datos demo usaba `SIT-001`/`SIT-002` en lugar de `SIT-DEMO-001`/`SIT-DEMO-002`.
2. La lista de decisiones omitía D8.

A0 corrigió `plan.md` sin cambiar la HU ni el contrato funcional. Se regeneró el hash de congelamiento en `plan-approved.sha256`. La decisión D8 ya estaba aprobada en el manifiesto y en el plan verbal; la corrección solo alinea la documentación.

## Observaciones abiertas

- `rspp` no existe en el contrato mock ni en los fixtures; se compara `sitCode`. No se inventa `rspp`.
- No existe rol `ADMIN`; consulta para autenticados, resolución solo `VETERINARIO`.
- D3 no deduplica tickets abiertos; cada comparación con discrepancia crea uno nuevo.
- El seed de campo es ficticio y no representa un inventario real.
