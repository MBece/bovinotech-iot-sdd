# Contrato API: Genealogía y consanguinidad (HU-07)

Prefijo registrado en `backend/app/main.py`: **`/genealogy`** (tag "Genealogía y consanguinidad").

## Reglas comunes

- Autenticación: `Authorization: Bearer <token>` (dependencia `get_current_user` de HU-01).
- La finca es siempre `user.active_farm_id`; los esquemas de entrada usan `extra="forbid"`, por lo que un `farmId`, `authorId` o `status` enviado por el cliente produce HTTP 422.
- Sin finca activa: HTTP 403 `NO_ACTIVE_FARM`. Rol sin permiso: HTTP 403 `ROLE_NOT_ALLOWED` (matriz en [research.md R11](../research.md)).
- Recurso de otra finca o inexistente: HTTP 404 `ANIMAL_NOT_FOUND` / `LINK_NOT_FOUND`, sin revelar su existencia.
- Validación de esquema: HTTP 422 estándar de FastAPI. Reglas de negocio: HTTP 422 o 409 con cuerpo `{"detail": {"message": "<texto en español>", "code": "<CÓDIGO>"}}`.
- JSON en camelCase (alias), fechas ISO-8601: `birthDate` como `YYYY-MM-DD`; instantes con zona horaria en UTC.
- DIN: patrón `^DIN-DEMO-[0-9]{6}$`, se normaliza a mayúsculas antes de validar.
- Idempotencia (`clientEventId`, UUID): mismo id y mismo contenido en la misma finca → HTTP 200 con el registro existente y `syncStatus: "DUPLICADO"`; mismo id con contenido distinto → HTTP 409 `CLIENT_EVENT_ID_CONFLICT`. Registro nuevo → HTTP 201 con `syncStatus: "SYNCED"`.
- Append-only: no existen rutas `PUT`, `PATCH` ni `DELETE` en el módulo.

## Códigos de negocio

| Código | HTTP | Cuándo |
|---|---|---|
| `ANIMAL_NOT_FOUND` | 404 | Cría, progenitor o candidato sin ficha en la finca activa. |
| `ANIMAL_ALREADY_REGISTERED` | 409 | Ficha con DIN ya existente en la finca (con otro `clientEventId`). |
| `BIRTH_DATE_IN_FUTURE` | 422 | `birthDate` posterior a la fecha actual UTC. |
| `GENEALOGY_CYCLE` | 422 | El progenitor es la propia cría o un descendiente suyo. |
| `PARENT_SEX_MISMATCH` | 422 | `SIRE` no `MACHO` o `DAM` no `HEMBRA`. |
| `PARENT_BIRTH_DATE_NOT_BEFORE_OFFSPRING` | 422 | Nacimiento del progenitor igual o posterior al de la cría. |
| `PARENT_ALREADY_REGISTERED` | 409 | Ya existe vínculo vigente para (cría, rol); usar corrección. |
| `LINK_NOT_CURRENT` | 409 | Se intenta corregir un vínculo que no es el vigente. |
| `LINK_NOT_PENDING` | 409 | Se intenta validar un vínculo que no está `PENDIENTE_VALIDACION`. |
| `CLIENT_EVENT_ID_CONFLICT` | 409 | `clientEventId` reutilizado con contenido distinto. |
| `INVALID_MATING_CANDIDATES` | 422 | Mismo animal en ambos lados o sexos de candidatos incompatibles. |

---

## `GET /genealogy/animals`

Lista las fichas de la finca activa. Roles: todos.

Query: `q` (opcional, 1–120 caracteres; coincide con DIN o nombre), `sex` (opcional `MACHO|HEMBRA`).

Response 200: `{"items": [AnimalRead], "nextCursor": null}` ordenado por DIN.

`AnimalRead`: `{id, din, name, sex, birthDate, origin, registeredBy, registeredAt}`.

## `POST /genealogy/animals`

Registra una ficha genealógica. Rol: VETERINARIO.

```json
{
  "clientEventId": "6f1c2a3e-6b1d-4d0e-9a51-3c5f0f3b1a10",
  "din": "DIN-DEMO-000120",
  "name": "Niebla",
  "sex": "HEMBRA",
  "birthDate": "2026-11-20",
  "origin": "PROPIO"
}
```

- `name`: 1–120 caracteres no vacíos. `sex`: `MACHO|HEMBRA`. `origin`: `PROPIO|EXTERNO` (opcional, por defecto `PROPIO`).

Response 201/200: `AnimalRead` + `syncStatus`.

## `GET /genealogy/animals/{din}/tree`

Árbol de 3 generaciones. Roles: todos.

Response 200:

```json
{
  "din": "DIN-DEMO-000101",
  "name": "Aurora",
  "sex": "HEMBRA",
  "birthDate": "2025-03-10",
  "generationWindow": 3,
  "expectedCount": 14,
  "missingCount": 0,
  "isComplete": true,
  "positions": [
    {
      "position": "sire",
      "generation": 1,
      "role": "SIRE",
      "status": "VALIDADO",
      "linkId": "…",
      "animal": {"din": "DIN-DEMO-000102", "name": "Titán", "sex": "MACHO", "birthDate": "2021-02-01"}
    },
    {
      "position": "sire.sire",
      "generation": 2,
      "role": "SIRE",
      "status": "VALIDADO",
      "linkId": "…",
      "animal": {"din": "DIN-DEMO-000104", "name": "Brioso", "sex": "MACHO", "birthDate": "2017-01-10"}
    }
  ]
}
```

- `positions` contiene **siempre** 14 elementos en orden fijo: `sire, dam, sire.sire, sire.dam, dam.sire, dam.dam, sire.sire.sire, sire.sire.dam, sire.dam.sire, sire.dam.dam, dam.sire.sire, dam.sire.dam, dam.dam.sire, dam.dam.dam`.
- `status`: `VALIDADO | PENDIENTE_VALIDACION | NO_REGISTRADO`. Si `NO_REGISTRADO`, `linkId` y `animal` son `null`.

## `GET /genealogy/animals/{din}/links`

Historial append-only de vínculos de la cría (incluye corregidos y rechazados). Roles: todos.

Response 200: `{"items": [LinkRead]}` ordenado por `parentRole`, `sequenceNo`.

`LinkRead`: `{id, clientEventId, offspringDin, parentDin, parentRole, sequenceNo, status, correctedEventId, correctionReason, authorId, authorRole, createdAt, validation}` donde `status` es el estado derivado (`VALIDADO | PENDIENTE_VALIDACION | RECHAZADO | CORREGIDO`) y `validation` es `null` o `{decision, reason, validatorId, validatedAt}`.

## `POST /genealogy/links`

Registra un vínculo de progenitor. Roles: VETERINARIO (`VALIDADO`), OPERARIO (`PENDIENTE_VALIDACION`).

```json
{
  "clientEventId": "0b6b8c52-2f3a-4f7e-8d55-0e8f8a0c6c11",
  "offspringDin": "DIN-DEMO-000119",
  "parentDin": "DIN-DEMO-000116",
  "parentRole": "SIRE"
}
```

Response 201/200: `LinkRead` + `syncStatus`. Errores: `ANIMAL_NOT_FOUND`, `GENEALOGY_CYCLE`, `PARENT_SEX_MISMATCH`, `PARENT_BIRTH_DATE_NOT_BEFORE_OFFSPRING`, `PARENT_ALREADY_REGISTERED`, `CLIENT_EVENT_ID_CONFLICT`.

## `POST /genealogy/links/{link_id}/corrections`

Reemplaza el vínculo vigente por un nuevo progenitor (append-only). Rol: VETERINARIO.

```json
{
  "clientEventId": "a2f0e4d1-1111-4c2b-9f00-5d6e7f809a12",
  "parentDin": "DIN-DEMO-000104",
  "reason": "Prueba de parentesco por ADN"
}
```

- `reason`: obligatorio, 1–500 caracteres no vacíos. El nuevo vínculo hereda `offspringDin` y `parentRole`, recibe `sequenceNo` = anterior + 1 y `correctedEventId = link_id`, y pasa por las mismas validaciones (excepto posición libre).

Response 201/200: `LinkRead` del nuevo vínculo + `syncStatus`. El vínculo original pasa a estado derivado `CORREGIDO` sin modificarse. Errores adicionales: `LINK_NOT_FOUND`, `LINK_NOT_CURRENT`.

## `POST /genealogy/links/{link_id}/validations`

Anexa la decisión veterinaria sobre un vínculo pendiente. Rol: VETERINARIO.

```json
{"decision": "RECHAZADO", "reason": "La vaca registrada no parió en esa fecha"}
```

- `decision`: `VALIDADO | RECHAZADO`. `reason` obligatorio si `RECHAZADO` (1–500 caracteres).

Response 201: `LinkRead` con `status` y `validation` actualizados en la proyección. Errores: `LINK_NOT_FOUND`, `LINK_NOT_PENDING`.

## `GET /genealogy/animals/{din}/inbreeding`

Indicador individual de consanguinidad (cruce padre × madre del animal). Roles: VETERINARIO, ADMINISTRADOR, DIRECTIVO.

Response 200 (`InbreedingAssessment`, `subject = "ANIMAL"`). Ejemplo para un animal sin ancestros:

```json
{
  "subject": "ANIMAL",
  "din": "DIN-DEMO-000118",
  "sireDin": null,
  "damDin": null,
  "calculationStatus": "CÁLCULO_PARCIAL_POR_DATOS_INSUFICIENTES",
  "coefficient": null,
  "coefficientPercent": null,
  "coefficientIsMinimum": false,
  "warning": false,
  "riskLevel": null,
  "commonAncestors": [],
  "missingAncestors": [{"candidate": "SIRE", "position": "sire"}, {"candidate": "DAM", "position": "dam"}],
  "reason": "PARENTS_NOT_REGISTERED",
  "includesPendingLinks": false,
  "generationWindow": 3,
  "message": "Datos insuficientes: el animal no tiene padre y madre registrados. No se puede confirmar ausencia de consanguinidad."
}
```

## `GET /genealogy/matings/evaluation`

Evaluación preventiva de un cruce propuesto. Roles: VETERINARIO, ADMINISTRADOR, DIRECTIVO.

Query requerida: `sire_din` (ficha `MACHO`), `dam_din` (ficha `HEMBRA`), distintos.

Response 200 (`InbreedingAssessment`, `subject = "MATING"`). Ejemplo medios hermanos con datos parciales:

```json
{
  "subject": "MATING",
  "din": null,
  "sireDin": "DIN-DEMO-000116",
  "damDin": "DIN-DEMO-000101",
  "calculationStatus": "CÁLCULO_PARCIAL_POR_DATOS_INSUFICIENTES",
  "coefficient": 0.125,
  "coefficientPercent": 12.5,
  "coefficientIsMinimum": true,
  "warning": true,
  "riskLevel": "ALTO",
  "commonAncestors": [
    {
      "din": "DIN-DEMO-000102",
      "name": "Titán",
      "contribution": 0.125,
      "paths": [
        {"sireGenerations": 1, "damGenerations": 1,
         "sirePath": ["DIN-DEMO-000116", "DIN-DEMO-000102"],
         "damPath": ["DIN-DEMO-000101", "DIN-DEMO-000102"]}
      ]
    }
  ],
  "missingAncestors": [{"candidate": "SIRE", "position": "dam.sire"}],
  "reason": null,
  "includesPendingLinks": true,
  "generationWindow": 3,
  "message": "Advertencia de consanguinidad: ancestro común Titán (DIN-DEMO-000102). Coeficiente estimado mínimo 12,5 %."
}
```

(`missingAncestors` abreviado en el ejemplo; en la respuesta real lista todas las posiciones faltantes.)

Reglas de valor (research.md R4): parcial sin ancestros comunes → `coefficient: null`; completo sin ancestros comunes → `coefficient: 0.0`, `calculationStatus: "CÁLCULO_COMPLETO"`. Errores: `ANIMAL_NOT_FOUND`, `INVALID_MATING_CANDIDATES`.
