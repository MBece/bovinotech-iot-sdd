# Especificación de Funcionalidad: Historial sanitario auditable y correcciones por anexión (HU-004)

**Rama sugerida**: `feat/hu-004-sanitary-events`  
**Módulo**: `sanitary_events`  
**Estado**: COMPLETADA  
**Prioridad**: MUST — Línea base, iteración 2

> Este documento toma la historia suministrada como fuente funcional. Las decisiones técnicas pertenecen a `plan.md`.

## Historia de Usuario

Como veterinario quiero consultar el historial cronológico de eventos sanitarios de cada animal y registrar correcciones o validaciones sin borrar ni sobrescribir datos previos, para garantizar trazabilidad auditada.

## Reglas de negocio

- Los eventos sanitarios son solo-anexión: no se modifican ni eliminan físicamente.
- Toda corrección crea una versión vinculada, con motivo, autor veterinario y fecha.
- El estado vigente se deriva de la última versión válida sin ocultar el historial anterior.

## Criterios de aceptación

1. **Dado un animal con historial, cuando se consulta, entonces se muestra la línea de tiempo completa con autores y fechas.**
2. **Dado un dato erróneo, cuando el veterinario registra una corrección con motivo, entonces nace una versión nueva y el original permanece intacto.**
3. **Dado un usuario no veterinario, cuando intenta corregir o validar, entonces la operación se rechaza.**
4. **Dado un intento de mutación destructiva, cuando se solicita, entonces el sistema no expone una operación que borre o sobrescriba el historial.**

## Fuera de alcance

- Integraciones reales con dispositivos o servicios oficiales no suministrados.
- Sobrescrituras automáticas de información oficial o histórica.
- Cambios a módulos de otras historias fuera de los puntos compartidos autorizados.
