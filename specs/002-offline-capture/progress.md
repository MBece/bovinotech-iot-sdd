# Progreso: `offline_capture`

**Estado oficial**: COMPLETADA  
**Fecha de corte**: 2026-11-24

## Resumen

La historia permanece completada. La revalidación UX agregó desparasitación, fecha/hora de campo, datos clínicos obligatorios y estados separados de sincronización y validación.

## Evidencia funcional

- Captura local persistente mediante IndexedDB con `client_event_id`.
- Conservación del autor y hora de campo; cola visible tras reabrir la aplicación.
- Selección contra catálogo SINIGÁN simulado y estados de sincronización visibles.

## Compuertas

- Backend: suite completa de `pytest`.
- Seguridad: `bandit -r app -ll`.
- Frontend: `npm run lint` y `npm run build`.
- Revisión humana antes de integrar.

## Próximos pasos

- Mantener la regresión en verde dentro del alcance activo HU-01 a HU-05.
- Registrar cualquier deuda nueva sin reabrir ni renumerar la historia.
