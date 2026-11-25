# Progreso: `auth`

**Estado oficial**: COMPLETADA  
**Fecha de corte**: 2026-11-24

## Resumen

La historia permanece completada. La revalidación UX reforzó la visibilidad por rol y el endpoint de sincronización ahora aplica el mismo control de escritura del dominio.

## Evidencia funcional

- Aprovisionamiento administrativo, cuatro roles y finca activa.
- Login, contraseña temporal, sesión offline y auditoría append-only.
- Pruebas de contrato, permisos, migración y política de contraseñas.

## Compuertas

- Backend: suite completa de `pytest`.
- Seguridad: `bandit -r app -ll`.
- Frontend: `npm run lint` y `npm run build`.
- Revisión humana antes de integrar.

## Próximos pasos

- Mantener la regresión en verde dentro del alcance activo HU-01 a HU-05.
- Registrar cualquier deuda nueva sin reabrir ni renumerar la historia.
