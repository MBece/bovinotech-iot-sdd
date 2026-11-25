# Modelo de Datos: `kpi_dashboard` (HU-09)

## Modelos existentes consultados (SIN MODIFICAR)

El módulo `kpi_dashboard` es **solo lectura** sobre los siguientes modelos existentes:

| Modelo | Módulo | Uso en KPI |
|---|---|---|
| `SanitaryEvent` | `sanitary_events` | Cobertura de vacunación validada, eventos pendientes |
| `ReconciliationTicket` | `sinigan_sync` | Alertas abiertas (status=OPEN) |
| `Farm` | `auth` | Nombre de la finca |
| `User` | `auth` | Responsable que genera el reporte |

Ninguno de estos modelos se modifica. No hay migraciones ni alteraciones.

## AnimalWeight (nuevo)

Base exclusiva para el cálculo de GDP (Ganancia Diaria de Peso).

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `id` | Integer PK | Sí | Identificador interno |
| `din` | String(32), index | Sí | DIN del animal |
| `farm_id` | Integer, index | Sí | Finca activa (D10) |
| `weight_kg` | Float | Sí | Peso medido en kg |
| `measured_at` | DateTime tz | Sí | Fecha y hora de la medición en campo |
| `recorded_by_email` | String | Sí | Quién registró la medición |
| `recorded_at` | DateTime tz | Sí | Cuándo se registró en el sistema |

### Fórmula GDP

```
GDP (kg/día) = (Peso final - Peso inicial) / Días transcurridos
```

Para cada animal con al menos 2 mediciones en el periodo, se calcula:
- `weight_first` = medición más antigua en el periodo
- `weight_last` = medición más reciente en el periodo  
- `days` = diferencia en días entre `measured_at` de ambas
- `gdp` = `(weight_last - weight_first) / days`

El KPI `averageGdp` es el promedio de todos los GDP individuales en la finca y periodo.

### Seed demo

| DIN | Mediciones | GDP implícito |
|---|---|---|
| `DIN-DEMO-000001` | 250kg (2026-01-15), 310kg (2026-06-20), 340kg (2026-11-01) | ~0.20 kg/día |
| `DIN-DEMO-000002` | 180kg (2026-02-01), 260kg (2026-07-15), 320kg (2026-11-10) | ~0.35 kg/día |
| `DIN-DEMO-000003` | 90kg (2026-03-01), 160kg (2026-08-01), 220kg (2026-11-15) | ~0.38 kg/día |

## Indicadores computados (no persistidos)

| Indicador | Fuente | Cálculo |
|---|---|---|
| `validatedVaccinationCoverage` | `sanitary_events` WHERE `event_type='VACCINATION'` | `COUNT(validation_status != 'PENDING_VALIDATION') / COUNT(*) * 100` |
| `pendingValidationEvents` | `sanitary_events` WHERE `validation_status='PENDING_VALIDATION'` | `COUNT(*)` |
| `openAlerts` | `reconciliation_tickets` WHERE `status='OPEN'` | `COUNT(*)` |
| `averageGdp` | `animal_weights` | Promedio de GDP individuales por animal |

## Invariantes

1. `kpi_dashboard` nunca escribe en `sanitary_events`, `reconciliation_tickets` ni ninguna tabla existente.
2. El seed de `AnimalWeight` es idempotente: solo inserta pesos cuyo `(din, measured_at)` no exista.
3. `OPERARIO` recibe `operationalOnly: true` y el campo `financialReport` es `null`.
4. Si no hay datos en el periodo, los indicadores retornan `0` o `null` según corresponda, nunca error.