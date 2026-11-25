# Modelo de datos: Registro genealógico y consanguinidad (HU-07)

El módulo `genealogy` mantiene sus propias entidades. `farm_id` y DIN se guardan como identificadores por valor; no hay llaves foráneas hacia tablas de otras historias. Las tres entidades persistidas son **de solo inserción** (append-only): ningún servicio ejecuta `UPDATE` ni `DELETE` sobre ellas. Las entidades derivadas no se almacenan.

Constantes de dominio (definidas una sola vez en `backend/app/features/genealogy/pedigree.py` y replicadas en `frontend/src/features/genealogy/genealogyConstants.js`):

- `GENERATION_WINDOW = 3`
- `CALCULATION_COMPLETE = "CÁLCULO_COMPLETO"`
- `CALCULATION_PARTIAL = "CÁLCULO_PARCIAL_POR_DATOS_INSUFICIENTES"`
- Umbrales de riesgo: `RISK_HIGH_MIN = 0.125`, `RISK_MODERATE_MIN = 0.0625`.

---

## `GenealogyAnimal` (tabla `genealogy_animals`)

Ficha genealógica de un bovino o reproductor externo de la finca.

| Campo | Tipo conceptual | Restricciones |
|---|---|---|
| `id` | UUID (string) | Clave primaria generada por el servidor. |
| `client_event_id` | UUID (string) | Obligatorio; único por (`farm_id`, `client_event_id`). La semilla usa UUID v5 deterministas. |
| `farm_id` | entero | Obligatorio, positivo; tomado de la sesión autenticada. |
| `din` | string | Obligatorio; patrón `^DIN-DEMO-[0-9]{6}$`, normalizado a mayúsculas; único por (`farm_id`, `din`). |
| `name` | string | Obligatorio, 1–120 caracteres no vacíos tras recortar espacios. |
| `sex` | enum | `MACHO` o `HEMBRA`. |
| `birth_date` | fecha (sin hora) | Obligatoria; no posterior a la fecha actual UTC. |
| `origin` | enum | `PROPIO` (por defecto) o `EXTERNO` (reproductor externo, p. ej. toro de inseminación). |
| `registered_by` | string | Obligatorio; id del usuario autenticado o `"seed"`. |
| `registered_at` | datetime | Obligatorio, con zona horaria, UTC. |

Inmutable: la corrección de sexo o fecha de nacimiento está fuera de alcance (spec, Supuestos).

## `GenealogyParentLink` (tabla `genealogy_parent_links`)

Hecho inmutable: `parent_din` es el padre (`SIRE`) o la madre (`DAM`) de `offspring_din`.

| Campo | Tipo conceptual | Restricciones |
|---|---|---|
| `id` | UUID (string) | Clave primaria. |
| `client_event_id` | UUID (string) | Obligatorio; único por (`farm_id`, `client_event_id`). |
| `farm_id` | entero | Obligatorio, positivo; de la sesión. |
| `offspring_din` | string | Obligatorio; DIN con ficha en la misma finca. |
| `parent_din` | string | Obligatorio; DIN con ficha en la misma finca; distinto de `offspring_din`. |
| `parent_role` | enum | `SIRE` (exige ficha `MACHO`) o `DAM` (exige ficha `HEMBRA`). |
| `sequence_no` | entero | ≥ 1; único por (`farm_id`, `offspring_din`, `parent_role`, `sequence_no`). |
| `corrected_event_id` | UUID opcional | Id del vínculo vigente al que reemplaza; nulo en un registro inicial. |
| `correction_reason` | string opcional | Obligatorio (1–500 caracteres no vacíos) si hay `corrected_event_id`; nulo si no. |
| `initial_status` | enum | `VALIDADO` si el autor es VETERINARIO o semilla; `PENDIENTE_VALIDACION` si es OPERARIO. Inmutable. |
| `author_id` | string | Obligatorio; de la identidad autenticada. |
| `author_role` | string | Rol del autor en el momento del registro. |
| `created_at` | datetime | Obligatorio, con zona horaria, UTC. |

Invariantes validados al insertar (orden de research.md R6): existencia → anti-ciclos → sexo → fecha de nacimiento estrictamente anterior → posición libre (o, para corrección, que `corrected_event_id` sea el vínculo vigente de esa posición).

## `GenealogyLinkValidation` (tabla `genealogy_link_validations`)

Decisión veterinaria inmutable sobre un vínculo `PENDIENTE_VALIDACION`.

| Campo | Tipo conceptual | Restricciones |
|---|---|---|
| `id` | UUID (string) | Clave primaria. |
| `link_id` | UUID (string) | Obligatorio; **único** (una decisión por vínculo); vínculo de la misma finca con estado derivado `PENDIENTE_VALIDACION`. |
| `farm_id` | entero | Obligatorio; de la sesión. |
| `decision` | enum | `VALIDADO` o `RECHAZADO`. |
| `reason` | string opcional | Obligatorio (1–500 caracteres no vacíos) si `decision = RECHAZADO`. |
| `validator_id` | string | Obligatorio; VETERINARIO autenticado. |
| `validated_at` | datetime | Obligatorio, con zona horaria, UTC. |

---

## Estados derivados de un vínculo (`LinkStatus`)

```text
                 (OPERARIO)                     (VETERINARIO)
registro ──► PENDIENTE_VALIDACION ──validación──► VALIDADO
   │                 │                └─rechazo──► RECHAZADO (posición queda libre)
   │ (VETERINARIO)   │
   └──────────────► VALIDADO
cualquier vínculo vigente ──corrección (VETERINARIO)──► CORREGIDO (el nuevo vínculo pasa a ser el vigente)
```

Precedencia de derivación: `CORREGIDO` (existe otro vínculo con `corrected_event_id = id`) > decisión de `GenealogyLinkValidation` > `initial_status`.

**Vínculo vigente** de (finca, cría, rol): el de mayor `sequence_no` cuyo estado derivado sea `VALIDADO` o `PENDIENTE_VALIDACION`. Si el de mayor `sequence_no` está `RECHAZADO`, no hay vínculo vigente.

---

## Entidades derivadas (no persistidas)

### `PedigreePosition`

Una de las 14 posiciones de la ventana de 3 generaciones de un animal.

| Campo | Descripción |
|---|---|
| `position` | Ruta desde el animal: `sire`, `dam`, `sire.sire`, `sire.dam`, …, `dam.dam.dam` (14 valores fijos). |
| `generation` | 1, 2 o 3. |
| `role` | `SIRE` o `DAM` (último segmento de la ruta). |
| `status` | `VALIDADO`, `PENDIENTE_VALIDACION` o `NO_REGISTRADO`. |
| `link_id` | Id del vínculo vigente o nulo. |
| `animal` | `{din, name, sex, birth_date}` o nulo si `NO_REGISTRADO`. Si una posición está vacía, todas las posiciones por encima de ella también son `NO_REGISTRADO`. |

### `PedigreeTree`

`{din, name, sex, birth_date, generation_window: 3, expected_count: 14, missing_count, is_complete, positions: [PedigreePosition × 14]}`.

### `CommonAncestor`

`{din, name, contribution, paths: [{sire_generations: n1, dam_generations: n2, sire_path: [din…], dam_path: [din…]}]}` donde `contribution = Σ (1/2)^(n1+n2+1)` sobre sus caminos independientes. `n1 = 0` cuando el ancestro común es el propio padre candidato (o `n2 = 0` para la madre).

### `InbreedingAssessment`

Resultado de la evaluación de un cruce o del indicador individual.

| Campo | Descripción |
|---|---|
| `subject` | `MATING` (cruce propuesto) o `ANIMAL` (indicador individual). |
| `din` | Solo para `ANIMAL`. |
| `sire_din`, `dam_din` | Candidatos evaluados (o padre/madre del animal); nulos si no están registrados. |
| `calculation_status` | `CÁLCULO_COMPLETO` o `CÁLCULO_PARCIAL_POR_DATOS_INSUFICIENTES`. |
| `coefficient` | Fracción en [0, 1] o nulo. Nulo si el cálculo es parcial y no hay ancestros comunes, o si faltan los padres del animal. Nunca 0 si el estado es parcial. |
| `coefficient_percent` | `coefficient × 100` o nulo. |
| `coefficient_is_minimum` | Verdadero si el estado es parcial y hay coeficiente. |
| `warning` | Verdadero si hay al menos un ancestro común. |
| `risk_level` | `ALTO`, `MODERADO`, `BAJO` o nulo (research.md R5). |
| `common_ancestors` | Lista de `CommonAncestor`, ordenada por `contribution` descendente y luego por DIN. |
| `missing_ancestors` | Lista `{candidate: SIRE|DAM, position}` de posiciones `NO_REGISTRADO` dentro de la ventana de cada candidato. |
| `reason` | `PARENTS_NOT_REGISTERED` cuando el animal no tiene padre o madre vigente; nulo en otro caso. |
| `includes_pending_links` | Verdadero si algún vínculo usado está `PENDIENTE_VALIDACION`. |
| `generation_window` | 3. |
| `message` | Texto en español para la UI. |

---

## Semilla propia (`backend/app/features/genealogy/fixtures/pedigree_seed.json`)

Finca 1. Inserción idempotente (solo elementos ausentes, nunca sobrescribe). Vínculos de semilla con autor `"seed"` y estado `VALIDADO`, salvo el indicado.

| DIN | Nombre | Sexo | Nacimiento | Padre | Madre |
|---|---|---|---|---|---|
| DIN-DEMO-000101 | Aurora | HEMBRA | 2025-03-10 | 000102 | 000103 |
| DIN-DEMO-000102 | Titán | MACHO | 2021-02-01 | 000104 | 000105 |
| DIN-DEMO-000103 | Canela | HEMBRA | 2021-05-15 | 000106 | 000107 |
| DIN-DEMO-000104 | Brioso | MACHO | 2017-01-10 | 000108 | 000109 |
| DIN-DEMO-000105 | Mora | HEMBRA | 2017-04-02 | 000110 | 000111 |
| DIN-DEMO-000106 | Centella | MACHO | 2017-03-03 | 000112 | 000113 |
| DIN-DEMO-000107 | Violeta | HEMBRA | 2017-06-20 | 000114 | 000115 |
| DIN-DEMO-000108 … 000115 | (bisabuelos) | M/H alternos (pares MACHO) | 2012-2013 | — | — |
| DIN-DEMO-000116 | Rayo | MACHO | 2025-01-20 | 000102 | 000117 (**`PENDIENTE_VALIDACION`**, autor operario semilla) |
| DIN-DEMO-000117 | Paloma | HEMBRA | 2020-08-08 | — | — |
| DIN-DEMO-000118 | Lucero | HEMBRA | 2022-02-02 | — | — |
| DIN-DEMO-000119 | Bruma | MACHO | 2026-10-01 | — | — |

Escenarios de demostración que habilita:

- **Criterio 1**: árbol de Aurora (000101) con las 14 posiciones completas y `VALIDADO`.
- **Criterio 2**: cruce Rayo (000116) × Aurora (000101), medios hermanos por Titán → advertencia, ancestro común Titán, 12,5 %, `ALTO`, estado parcial (faltan ancestros de Paloma), coeficiente mínimo, `includesPendingLinks = true`. Cruce Titán (000102) × Aurora (000101) → padre-hija, 25 %.
- **Criterio 3**: indicador de Lucero (000118) → `CÁLCULO_PARCIAL_POR_DATOS_INSUFICIENTES`, `coefficient = null`, motivo `PARENTS_NOT_REGISTERED`.
- **Criterio 4**: registrar Bruma (2026) como padre de Aurora (2025) → rechazo por fecha; registrar Aurora como madre de Titán → rechazo por ciclo; registrar Lucero como padre de Bruma → rechazo por sexo.
