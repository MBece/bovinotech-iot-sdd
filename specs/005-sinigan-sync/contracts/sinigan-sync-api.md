# Contrato de API: `sinigan_sync` (HU-05)

Base: `http://localhost:8000/integrations/sinigan-sync`

Todos los endpoints requieren `Authorization: Bearer <token>`.

## Aislamiento por finca (D10)

La finca activa sale **exclusivamente** del claim `farm_id` del token
(`current_user.active_farm_id`). No se acepta finca por body ni por query.

- Sin finca activa (token legado) → `403` `"Se requiere una finca activa para operar la conciliación."` en los cuatro endpoints.
- `POST /comparisons` busca el registro de campo por `(din, farm_id)`. Un DIN registrado solo en otra finca responde `409`, igual que un registro inexistente, para no filtrar su existencia.
- `GET /tickets`, `GET /tickets/{id}` y `POST /tickets/{id}/resolution` solo operan sobre tickets de la finca activa. Un ticket de otra finca responde `404`, igual que uno inexistente.
- Las respuestas de ticket incluyen `farmId` de forma aditiva.
- Los cuatro criterios de aceptación de HU-05 no cambian: siguen siendo por DIN.

## POST `/comparisons`

Compara la ficha oficial simulada contra el registro de campo.

### Request

```json
{ "din": "DIN-DEMO-000002" }
```

Validaciones:
- `din` obligatorio, patrón `^DIN-DEMO-[0-9]{6}$`.
- Campos extra rechazados.

### Response 200 — consistente

```json
{
  "meta": {
    "sourceSystem": "SINIGAN",
    "sourceMode": "SIMULADO",
    "isSimulation": true,
    "mockLabel": "MODO SIMULADO (SINIGÁN V6 MOCK)",
    "comparedAt": "2026-11-21T15:00:00Z"
  },
  "official": {
    "din": "DIN-DEMO-000001",
    "animalName": "Luna",
    "animalNumber": "ANIMAL-DEMO-001",
    "species": "BOVINO",
    "sex": "HEMBRA",
    "ageGroup": "ADULTO",
    "establishment": { "sitCode": "SIT-DEMO-001", "name": "Finca El Roble" }
  },
  "field": {
    "din": "DIN-DEMO-000001",
    "species": "BOVINO",
    "sex": "HEMBRA",
    "ageGroup": "ADULTO",
    "sitCode": "SIT-DEMO-001",
    "establishmentName": "Finca El Roble",
    "source": "REGISTRO_DE_CAMPO",
    "updatedAt": "2026-11-21T12:00:00Z"
  },
  "result": "CONSISTENTE",
  "discrepancies": [],
  "ticket": null
}
```

### Response 200 — discrepancia

```json
{
  "meta": {
    "sourceSystem": "SINIGAN",
    "sourceMode": "SIMULADO",
    "isSimulation": true,
    "mockLabel": "MODO SIMULADO (SINIGÁN V6 MOCK)",
    "comparedAt": "2026-11-21T15:00:00Z"
  },
  "official": { "din": "DIN-DEMO-000002", "sex": "MACHO", "ageGroup": "JOVEN" },
  "field": { "din": "DIN-DEMO-000002", "sex": "HEMBRA", "ageGroup": "JOVEN" },
  "result": "DISCREPANCIA",
  "discrepancies": [
    {
      "fieldName": "sex",
      "fieldLabel": "Sexo",
      "officialValue": "MACHO",
      "fieldValue": "HEMBRA",
      "officialSource": "MODO SIMULADO (SINIGÁN V6 MOCK)",
      "fieldSource": "REGISTRO DE CAMPO",
      "detectedAt": "2026-11-21T15:00:00Z"
    }
  ],
  "ticket": {
    "id": 1,
    "din": "DIN-DEMO-000002",
    "farmId": 1,
    "status": "OPEN",
    "comparedAt": "2026-11-21T15:00:00Z",
    "createdByEmail": "vet@bovinotech.co",
    "createdAt": "2026-11-21T15:00:00Z"
  }
}
```

### Errores

| Código | Situación |
|---|---|
| `400` | DIN con formato inválido |
| `401` | Sin autenticación |
| `403` | Token sin finca activa |
| `404` | DIN no encontrado en la fuente oficial; sin escrituras |
| `409` | No existe registro de campo en la finca activa; sin ticket |

## GET `/tickets`

Query params:
- `status`: `OPEN` | `CLOSED` (opcional)
- `din`: DIN (opcional)
- `limit`: 1–100 (default 50)

Solo devuelve tickets de la finca activa. Response:

```json
{
  "items": [
    {
      "id": 1,
      "din": "DIN-DEMO-000002",
      "farmId": 1,
      "status": "OPEN",
      "comparedAt": "2026-11-21T15:00:00Z",
      "createdByEmail": "vet@bovinotech.co",
      "createdAt": "2026-11-21T15:00:00Z",
      "closedAt": null,
      "discrepancyCount": 1
    }
  ]
}
```

Errores:

| Código | Situación |
|---|---|
| `401` | Sin autenticación |
| `403` | Token sin finca activa |

## GET `/tickets/{id}`

Solo devuelve tickets de la finca activa. Un ticket de otra finca responde
`404` con el mismo mensaje que uno inexistente.

Response:

```json
{
  "id": 1,
  "din": "DIN-DEMO-000002",
  "farmId": 1,
  "status": "OPEN",
  "officialSnapshot": {},
  "fieldSnapshot": {},
  "officialSource": "MODO SIMULADO (SINIGÁN V6 MOCK)",
  "fieldSource": "REGISTRO DE CAMPO",
  "comparedAt": "2026-11-21T15:00:00Z",
  "createdByEmail": "vet@bovinotech.co",
  "createdAt": "2026-11-21T15:00:00Z",
  "closedAt": null,
  "discrepancies": [],
  "resolution": null
}
```

Errores:

| Código | Situación |
|---|---|
| `401` | Sin autenticación |
| `403` | Token sin finca activa |
| `404` | Ticket inexistente o de otra finca |

## POST `/tickets/{id}/resolution`

Solo `VETERINARIO` con finca activa.

Request:

```json
{
  "decision": "OFICIAL_PREVALECE",
  "reason": "Se valida la ficha oficial y se solicita corrección del registro de campo."
}
```

Validaciones:
- `decision` obligatoria, enum.
- `reason` obligatorio, 5–500 caracteres después de `trim`.
- Campos extra rechazados.

Response `201`:

```json
{
  "id": 1,
  "din": "DIN-DEMO-000002",
  "farmId": 1,
  "status": "CLOSED",
  "closedAt": "2026-11-21T16:00:00Z",
  "resolution": {
    "decision": "OFICIAL_PREVALECE",
    "reason": "Se valida la ficha oficial y se solicita corrección del registro de campo.",
    "resolvedByEmail": "vet@bovinotech.co",
    "resolvedAt": "2026-11-21T16:00:00Z"
  }
}
```

Errores:

| Código | Situación |
|---|---|
| `401` | Sin autenticación |
| `403` | Rol distinto de `VETERINARIO` o token sin finca activa |
| `404` | Ticket inexistente o de otra finca |
| `409` | Ticket ya cerrado |
| `422` | Motivo o decisión inválidos |
