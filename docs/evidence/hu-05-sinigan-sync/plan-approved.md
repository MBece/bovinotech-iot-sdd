# Plan aprobado — HU-05 `sinigan_sync`

**Run:** `HU05-SINIGAN-SYNC-20261121`

**Aprobación:** el usuario aprobó el plan consolidado con el mensaje “Adelante, comenzamos” el `2026-11-21`.

**Decisiones aprobadas:** D1–D9.

| ID | Decisión |
|---|---|
| D1 | Worktree aislado desde `main`; no se toca HU-02. |
| D2 | Registro de campo mínimo ficticio, read-only, con seed idempotente. |
| D3 | Un ticket nuevo por cada comparación con discrepancia. |
| D4 | Resolución con decisión + motivo; solo `VETERINARIO`; sin mutar datos. |
| D5 | Consulta para usuarios autenticados; resolución solo `VETERINARIO`. |
| D6 | Spec en `specs/005-sinigan-sync/`. |
| D7 | Ejecución multiagente con sesiones independientes `opencode run --agent`. |
| D8 | Etiqueta exacta visible en el nuevo panel. |
| D9 | Entorno local sin Docker. |

## Hashes de congelamiento

Ver `plan-approved.sha256`:

- `specs/005-sinigan-sync/spec.md`
- `specs/005-sinigan-sync/plan.md`
- `specs/005-sinigan-sync/contracts/sinigan-sync-api.md`

Cualquier cambio posterior en estos archivos debe registrarse como una decisión de A0 y justificarse.
