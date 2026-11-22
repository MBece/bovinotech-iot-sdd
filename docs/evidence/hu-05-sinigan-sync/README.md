# Evidencia HU-05 — `sinigan_sync`

Este directorio contiene la evidencia verificable del run `HU05-SINIGAN-SYNC-20261121`.

## Estructura

- `manifest.json`: alcance, topología, decisiones, fases y artefactos.
- `orchestrator-log.md`: decisiones cronológicas de A0.
- `plan-approved.md` y `plan-approved.sha256`: plan aprobado y hashes de congelamiento.
- `agents/`: informes y logs crudos de A1–A7.
- `gates/`: salidas de `pytest`, `bandit`, `eslint`, `build` y tests Node por gate.
- `acceptance/`: evidencia AC-01…AC-04.
- `reviews/`: revisiones independientes de arquitectura y código.
- `findings/`: hallazgos, asignación, corrección y re-verificación.
- `screenshots/`: capturas E2E si están disponibles.
- `traceability.md`: matriz HU → requisito → implementación → prueba → evidencia.
- `REPORT.md`: informe final de auditoría.

## Reglas

- No se declara un test verde sin salida cruda.
- No se inventan sesiones, aprobaciones ni resultados.
- No se mezcla evidencia de HU-02 ni de `security-review-pr3`.
- Los agentes no se invocan entre sí; la coordinación es de A0.
