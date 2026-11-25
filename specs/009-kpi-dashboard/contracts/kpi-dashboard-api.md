# Contrato de API: Tablero ejecutivo de indicadores HU-09

## Prefijo

Todos los endpoints bajo `/dashboard`

## Endpoints

### `GET /dashboard/kpi`

Obtiene los indicadores consolidados del periodo para una finca.

**Headers:**
```
Authorization: Bearer <token>
```

**Query Parameters:**
| Parámetro | Tipo | Obligatorio | Default | Descripción |
|---|---|---|---|---|
| `farm_id` | int | No | Token `farm_id` | Finca a consultar. OPERARIO solo su finca |
| `start_date` | date (ISO) | No | 30 días atrás | Inicio del periodo |
| `end_date` | date (ISO) | No | Hoy | Fin del periodo |

**Response 200 (VETERINARIO/DIRECTIVO):**
```json
{
  "farmId": 1,
  "farmName": "Finca La Esperanza",
  "period": {
    "start": "2026-01-01",
    "end": "2026-11-24"
  },
  "indicators": {
    "validatedVaccinationCoverage": 75.0,
    "pendingValidationEvents": 2,
    "openAlerts": 1,
    "averageGdp": 0.82
  },
  "operationalOnly": false,
  "generatedAt": "2026-11-24T20:00:00Z",
  "generatedBy": "vet@bovinotech.co"
}
```

**Response 200 (OPERARIO):**
```json
{
  "farmId": 1,
  "farmName": "Finca La Esperanza",
  "period": { ... },
  "indicators": {
    "validatedVaccinationCoverage": 75.0,
    "pendingValidationEvents": 2,
    "openAlerts": null,
    "averageGdp": null
  },
  "operationalOnly": true,
  "generatedAt": "...",
  "generatedBy": "operario@bovinotech.co"
}
```

**Errors:**
| Código | Condición |
|---|---|
| 401 | Sin token o inválido |
| 403 | Sin finca activa en el token |
| 422 | Fecha inválida |

---

### `GET /dashboard/audit-export`

Exporta el reporte de auditoría del periodo para una finca.

**Headers:**
```
Authorization: Bearer <token>
```

**Roles permitidos:** VETERINARIO, DIRECTIVO

**Query Parameters:**
| Parámetro | Tipo | Obligatorio | Default |
|---|---|---|---|
| `farm_id` | int | No | Token `farm_id` |
| `start_date` | date (ISO) | No | 30 días atrás |
| `end_date` | date (ISO) | No | Hoy |

**Response 200:**
```json
{
  "exportedAt": "2026-11-24T20:00:00Z",
  "exportedBy": "vet@bovinotech.co",
  "filters": {
    "farmId": 1,
    "startDate": "2026-01-01",
    "endDate": "2026-11-24"
  },
  "kpiSummary": {
    "validatedVaccinationCoverage": 75.0,
    "pendingValidationEvents": 2,
    "openAlerts": 1,
    "averageGdp": 0.82
  },
  "events": [
    {
      "din": "DIN-DEMO-000001",
      "eventType": "VACCINATION",
      "validationStatus": "VALIDATED",
      "authorEmail": "vet@bovinotech.co",
      "occurredAt": "2026-06-15T10:00:00Z"
    }
  ],
  "totalEvents": 10
}
```

**Errors:**
| Código | Condición |
|---|---|
| 401 | Sin token o inválido |
| 403 | Rol no autorizado (OPERARIO, ADMINISTRADOR) o sin finca activa |
| 422 | Fecha inválida |