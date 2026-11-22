# Especificación de Funcionalidad: Interoperabilidad simulada con SINIGÁN V6 y conciliación de conflictos (HU-05)

**Rama de Funcionalidad**: `feat/hu-05-sinigan-sync`

**Módulo funcional**: `sinigan_sync`

**Fecha**: 2026-11-21

**Estado**: Aprobado para implementación

**Prioridad**: MUST — Línea base, iteración 2.

> **Nota de trazabilidad:** este archivo transcribe literalmente la HU-05 aprobada.
> No se modifican su historia, reglas de negocio ni criterios de aceptación.
> El análisis técnico y las decisiones de implementación viven en `plan.md`.

## Historia de Usuario

**Módulo:** `sinigan_sync`
**Prioridad:** MUST – Línea base, iteración 2.

**Historia:** Como veterinario o administrador quiero consultar la ficha simulada de un animal en SINIGÁN V6 y compararla con los registros de campo, para preservar la fuente de verdad oficial y resolver divergencias mediante revisión humana.

**Reglas de negocio:**

- SINIGÁN V6 (operado mediante adaptador simulado) es la fuente de verdad legal para identidad (`din`), especie, sexo, grupo etario y predio (`sit`/`rspp`).
- Toda información proveniente del adaptador debe etiquetarse visiblemente como `MODO SIMULADO (SINIGÁN V6 MOCK)`.
- Ante una discrepancia entre los datos de campo y la ficha simulada, nunca se aplica sobrescritura automática; se crea un ticket de conciliación para decisión humana con motivo obligatorio.

## Criterios de Aceptación

1. **Dado** un `din` existente en los datos simulados, **cuando** se consulta su ficha, **entonces** el sistema muestra sus datos oficiales simulados indicando explícitamente que corresponde a un entorno de simulación.
2. **Dado** un `din` inexistente en la fuente simulada, **cuando** se consulta, **entonces** el sistema informa que no fue encontrado sin crear registros automáticos en el inventario.
3. **Dado** un animal cuyo sexo o grupo etario registrado en campo difiere de su ficha SINIGÁN simulada, **cuando** se ejecuta la comparación, **entonces** se genera un ticket de conflicto mostrando ambos valores, fecha y origen.
4. **Dado** un ticket de conflicto abierto, **cuando** el veterinario registra su resolución y motivo, **entonces** el conflicto queda cerrado conservando la trazabilidad de la decisión.

## Reglas Funcionales Obligatorias

- SINIGÁN V6, mediante su adaptador simulado, conserva la condición de fuente de verdad legal para `din`, especie, sexo, grupo etario y predio (`sit`/`rspp`).
- Toda información proveniente del adaptador debe identificarse visiblemente como `MODO SIMULADO (SINIGÁN V6 MOCK)`.
- Una consulta de un `din` inexistente no debe crear registros automáticamente en el inventario.
- Las discrepancias entre datos de campo y datos oficiales simulados nunca deben provocar sobrescrituras automáticas.
- Toda discrepancia debe generar un ticket de conciliación con los valores comparados, fecha y origen.
- La resolución humana debe exigir un motivo obligatorio.
- El cierre del conflicto debe conservar la trazabilidad de la decisión.

## Fuera de Alcance

- Integración real con SINIGÁN V6 o con el ICA.
- Corrección automática o manual de datos oficiales.
- Corrección automática de datos de campo.
- Administración de usuarios, roles o fincas.
- Sincronización bidireccional con la fuente oficial.
