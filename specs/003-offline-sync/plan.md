# Plan de Implementación: HU-003 `offline_sync`

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

1. Contrato de lote y resultado individual en `sanitary_events/schemas.py`.
2. Idempotencia por `client_event_id` y persistencia en `sanitary_events/service.py`.
3. Cola local y conservación de eventos en IndexedDB mediante `offlineEventRepository.js`.
4. Servicio de sincronización y actualización de estados en la interfaz.

## Estrategia de pruebas

- Unitarias para reglas puras, cálculos y transiciones.
- Contrato para esquemas, códigos HTTP y RBAC.
- Integración para persistencia, idempotencia y aislamiento por finca.
- Seguridad para entradas inválidas, secretos y mutaciones destructivas.
- Evidencia principal: `backend/tests/contract/test_sync_api.py y backend/tests/unit/test_sync_idempotency.py`.

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Acoplamiento entre historias | Contratos estables y módulos verticales aislados |
| Datos incompletos | Estados explícitos de insuficiencia; nunca inventar valores |
| Pérdida de trazabilidad | Autor, fecha, origen y correlación obligatorios |
| Regresión | Suite completa de backend, lint y build antes de integrar |
