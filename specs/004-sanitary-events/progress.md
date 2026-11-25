# Progreso: HU-004 `sanitary_events`

**Estado oficial**: COMPLETADA  
**Fecha de corte**: 2026-11-24

## Resumen

La rebanada funcional se encuentra implementada en el repositorio y queda clasificada dentro del bloque HU-01 a HU-05 completado.

## Evidencia o alcance previsto

- Modelos separados para el evento original y sus correcciones versionadas.
- Consulta cronológica por DIN y proyección de todas las versiones.
- Corrección protegida por rol `VETERINARIO`, motivo obligatorio y control de versión.
- Interfaz de historial y formulario de corrección sin edición destructiva.
- Persistencia de producto, unidad de dosis, motivo clínico y hallazgo según el tipo de evento.

## Validación asociada

- `backend/tests/contract/test_event_history_api.py y backend/tests/unit/test_event_history_projection.py`
- Compuertas globales: pytest, Bandit, ESLint y build.

## Próximos pasos

- Mantener la suite en verde dentro del alcance activo HU-01 a HU-05.
- Conservar la revisión humana antes de integrar cambios posteriores.
