# Especificación de Funcionalidad: Tablero ejecutivo de indicadores sanitarios y productivos auditables (HU-09)

**Rama de Funcionalidad**: `feat/hu-09-kpi-dashboard`

**Módulo funcional**: `kpi_dashboard`

**Fecha**: 2026-11-24

**Estado**: Aprobado para implementación

**Prioridad**: MUST — Desarrollo incremental, iteración 3.

> **Nota de trazabilidad:** este archivo transcribe literalmente la HU-09 aprobada.
> No se modifican su historia, reglas de negocio ni criterios de aceptación.
> El análisis técnico y las decisiones de implementación viven en `plan.md`.

## Historia de Usuario

**Módulo:** `kpi_dashboard`
**Prioridad:** MUST – Desarrollo incremental, iteración 3.

**Historia:** Como veterinario o directivo quiero consultar un panel consolidado con indicadores sanitarios, alertas y desempeño productivo filtrables por finca y periodo, para tomar decisiones respaldadas por registros trazables.

**Reglas de negocio:**

- Todo indicador mostrado debe derivarse exclusivamente de registros existentes y permitir rastrear los eventos que lo componen.
- Los eventos sanitarios en estado `PENDIENTE_VALIDACION` se contabilizan por separado y nunca inflan los indicadores de cobertura sanitaria validada.
- Un usuario con rol `OPERARIO` solo visualiza métricas operativas de su finca asignada y tiene restringido el acceso a indicadores financieros o de costos.

## Criterios de Aceptación

1. **Dado** una finca y un rango de fechas seleccionados, **cuando** el veterinario o directivo abre el tablero, **entonces** visualiza el porcentaje de cobertura de vacunación validada, eventos pendientes de validación, alertas abiertas y GDP promedio del periodo.
2. **Dado** un evento sanitario pendiente de validación veterinaria, **cuando** se recalculan los indicadores, **entonces** aparece en el contador de pendientes y no suma al porcentaje de hato vacunado validado.
3. **Dado** un usuario con rol `OPERARIO`, **cuando** accede al panel, **entonces** visualiza únicamente los indicadores operativos de su finca sin exposición de costos ni reportes financieros.
4. **Dado** una solicitud de reporte de auditoría para el piloto, **cuando** se exporta el resumen del periodo, **entonces** incluye los filtros aplicados, el responsable que exporta y el estado de validación de cada registro.

## Reglas Funcionales Obligatorias

- Los indicadores se derivan exclusivamente de registros existentes: `sanitary_events`, `reconciliation_tickets` y `animal_weights`.
- Los eventos en `PENDING_VALIDATION` cuentan por separado y no participan en el numerador de cobertura validada.
- `OPERARIO` ve solo indicadores operativos de su finca (cobertura de vacunación, pendientes). No ve costos, GDP ni reportes financieros.
- El reporte de auditoría incluye filtros aplicados, responsable y estado de validación de cada registro.

## Fuera de Alcance

- Visualización gráfica (gráficos de barras, pastel, líneas de tendencia).
- Exportación a PDF o Excel nativo (el reporte de auditoría es JSON legible).
- Notificaciones o alertas automáticas.
- Histórico de snapshots de KPI (cada consulta es un cálculo en vivo).
- Gestión de pesos animales (el registro de peso se simula con seed; no hay UI de captura de peso).
- Dashboard en tiempo real o con actualización automática.