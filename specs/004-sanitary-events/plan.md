# Plan de Implementación: HU-004 `sanitary_events`

**Spec**: [spec.md](spec.md)  
**Estado**: COMPLETADA  
**Enfoque**: implementación existente verificada en el repositorio

## Resumen técnico

La historia se mantiene como una rebanada vertical aislada. El backend corresponde a `backend/app/features/sanitary_events/` y el frontend a `frontend/src/features/sanitary-events/`. Solo se modificarán `backend/app/main.py` y `frontend/src/App.jsx` para registrar el módulo, sin alterar rutas existentes.

## Verificación de constitución

- Documentación y UI en español; código e identificadores técnicos en inglés.
- Pruebas primero y contratos antes de la implementación.
- Historial y auditoría solo-anexión cuando corresponda.
- Aislamiento por finca y mínimo privilegio por rol.
- Sin secretos ni tráfico externo no autorizado.
- CI objetivo menor a 90 segundos.

## Diseño y orden de trabajo

1. Modelos separados para el evento original y sus correcciones versionadas.
2. Consulta cronológica por DIN y proyección de todas las versiones.
3. Corrección protegida por rol `VETERINARIO`, motivo obligatorio y control de versión.
4. Interfaz de historial y formulario de corrección sin edición destructiva.

## Estrategia de pruebas

- Unitarias para reglas puras, cálculos y transiciones.
- Contrato para esquemas, códigos HTTP y RBAC.
- Integración para persistencia, idempotencia y aislamiento por finca.
- Seguridad para entradas inválidas, secretos y mutaciones destructivas.
- Evidencia principal: `backend/tests/contract/test_event_history_api.py y backend/tests/unit/test_event_history_projection.py`.

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Acoplamiento entre historias | Contratos estables y módulos verticales aislados |
| Datos incompletos | Estados explícitos de insuficiencia; nunca inventar valores |
| Pérdida de trazabilidad | Autor, fecha, origen y correlación obligatorios |
| Regresión | Suite completa de backend, lint y build antes de integrar |
