# Triage de observaciones de diseño (A1/A2)

Estado al cierre de P1. Estas observaciones no son hallazgos de código porque aún no existe implementación; se asignan a las fases siguientes.

| ID | Origen | Observación | Severidad | Responsable | Estado |
|---|---|---|---|---|---|
| F-D01 | A1 R-01 / ADR-04 | El seed de campo debe aceptar `Session` y sembrar también la base de pruebas; no depender solo de `main.py`. | High | A3 + A5 | Asignado |
| F-D02 | A1 R-03 / ADR-05 | DIN inválido debe devolver `400` manual en router, no `422` de Pydantic. | High | A3 | Asignado |
| F-D03 | A1 R-04 / ADR-05 | `reason` debe validarse después de `trim` (5–500) y persistirse recortado. | High | A3 | Asignado |
| F-D04 | A1 R-05 / ADR-02/03 | Reutilizar `DIN_PATTERN`, `to_camel` y `CamelModel`; definir una sola constante `MOCK_LABEL`. | Medium | A3 | Asignado |
| F-D05 | A1 R-02 | Importar `sinigan_sync.models` antes de `create_all` en `main.py`. | Medium | A3 | Asignado |
| F-D06 | A1 R-06 / ADR-01 | Inyectar `SiniganAdapter` por constructor. | Medium | A3 | Asignado |
| F-D07 | A2 A-02 | `rspp` no existe en el mock; comparar `sitCode` y documentar la brecha. | Medium | A2/A3 | Aceptado como supuesto |
| F-D08 | A2 A-01 | No existe rol `ADMIN`; consulta autenticada, resolución `VETERINARIO`. | Medium | A3/A4 | Aceptado como supuesto |
| F-D09 | A2 A-04 | D3 permite múltiples tickets abiertos por DIN; no hay deduplicación. | Medium | A3/A4 | Aceptado por D3 |
| F-D10 | A2 A-09 | `plan.md` omitía D8 y usaba `SIT-001` en lugar de `SIT-DEMO-001`. | Low | A0 | Corregido y re-hasheado |
| F-D11 | A1 ADR-07 | La transición `OPEN -> CLOSED` es un `UPDATE` de estado; los snapshots y la resolución son inmutables. | Low | A3 | Aceptado |
| F-D12 | A1 R-11 | Doble resolución concurrente debe manejarse con unique constraint + `409`. | Medium | A3 | Asignado |
