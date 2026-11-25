# Decisión de Implementación: D01 — KPI sobre datos existentes

**Módulo:** `kpi_dashboard` (HU-09)
**Fecha:** 2026-11-24
**Contexto:** La HU-09 requiere 5 indicadores (cobertura vacunación, pendientes, alertas, GDP, costos) que deben derivarse de registros existentes para mantener la trazabilidad.

**Decisión:** El 80% de los indicadores se computan sobre datos existentes (`sanitary_events`, `reconciliation_tickets`, `farms`). Solo `AnimalWeight` se agrega como modelo nuevo para el GDP, con seed demo idempotente.

| Indicador | Fuente | Existente |
|---|---|---|
| Cobertura vacunación validada | `sanitary_events` WHERE event_type='VACCINATION' | ✅ Sí |
| Eventos pendientes validación | `sanitary_events` WHERE validation_status='PENDING_VALIDATION' | ✅ Sí |
| Alertas abiertas | `reconciliation_tickets` WHERE status='OPEN' | ✅ Sí (HU-05) |
| GDP promedio | `animal_weights` (NUEVO) | ❌ Nuevo modelo |
| Costos (restringido a OPERARIO) | No implementado en esta iteración | ⏭️ Fuera de alcance |

**Riesgo mitigado:** Cero riesgo de corrupción de datos existentes porque el módulo solo ejecuta consultas SELECT.

# Decisión de Implementación: D02 — Seed demo de pesos idempotente

**Contexto:** El GDP necesita datos de peso para demostrar el cálculo. No hay captura de peso en la UI.

**Decisión:** Mismo patrón que HU-05: seed idempotente que solo inserta pares `(din, measured_at)` que no existan. 3 animales × 3 mediciones = 9 registros demo.

# Decisión de Implementación: D03 — OPERARIO con flag operationalOnly

**Contexto:** AC-03 requiere que OPERARIO no vea indicadores financieros. Podríamos devolver error 403 o devolver datos filtrados.

**Decisión:** Se devuelve `200` con `operationalOnly: true` y los indicadores restringidos (`openAlerts`, `averageGdp`) en `null`. Esto permite que la UI oculte las tarjetas correspondientes sin necesidad de manejar errores condicionales.