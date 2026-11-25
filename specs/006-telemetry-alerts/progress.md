# Progreso: HU-006 `telemetry`

**Estado oficial**: EN VALIDACIÓN  
**Fecha de corte**: 2026-11-24  
**WIP**: 1 — HU activa

## Resumen

La historia fue reincorporada y cuenta con una primera rebanada funcional: ingesta autenticada e idempotente, evaluación de inmovilidad/geocerca, alertas por finca, cierre humano y panel en español. QA corrigió el procesamiento parcial de lecturas inválidas, el estado de datos insuficientes, la selección de versiones activas, el aislamiento de respuestas idempotentes entre dispositivos, la normalización temporal y añadió evidencia append-only del cierre. Las compuertas focalizadas y el E2E manual en navegador están verdes; falta la suite backend completa en un entorno donde `TestClient` no se bloquee.

## Alcance aprobado para implementación

- Ingesta autenticada e idempotente de telemetría propia de BovinoTech.
- Alertas de inmovilidad y salida de geocerca con reglas versionadas.
- Estado explícito `INSUFFICIENT_DATA` ante huecos o precisión insuficiente.
- Una sola alerta abierta por condición activa y trazabilidad de evidencia.
- Consulta por finca y cierre humano según rol.
- Medición de latencia p95 con datos sintéticos reproducibles.

## Estado por rol

| Rol | Estado | Resultado |
|---|---|---|
| Especificador | COMPLETADO | `spec.md`, `plan.md`, `tasks.md` y `progress.md` creados |
| Implementador | COMPLETADO PARCIAL | Backend y frontend funcionales; permanecen seed demostrativo y pruebas frontend/E2E |
| QA y Seguridad | COMPLETADO PARCIAL | 14 pruebas focalizadas y E2E manual verdes; Bandit, secretos, ESLint y build verdes; suite completa bloqueada por `TestClient` local |

## Evidencia disponible

- Fuente histórica: `docs/archive/002-mvp-trazabilidad-iot/spec.md`, HU-06.
- Tareas históricas: `docs/archive/002-mvp-trazabilidad-iot/tasks.md`, fase de telemetría y alertas.
- Contrato vigente: [spec.md](spec.md).
- Diseño técnico vigente: [plan.md](plan.md).
- Backlog ejecutable: [tasks.md](tasks.md).
- Pruebas HU-006 focalizadas: **14 aprobadas** en 5,97 s.
- Bandit sobre `backend/app/features/telemetry`: **0 hallazgos** medios/altos.
- Búsqueda focalizada de secretos: **sin coincidencias**.
- Frontend: ESLint aprobado y build Vite aprobado usando un directorio QA alterno porque `dist/favicon.svg` estaba bloqueado por la sesión manual abierta.
- Navegador: listado, detalle, permisos visibles y filtros abiertas/cerradas validados con datos reales locales; evidencia en `docs/evidence/hu-06-telemetry-alerts/qa-2026-11-24.md`.

## Riesgos abiertos

- Definir y custodiar el mecanismo real de aprovisionamiento de credenciales de dispositivos sin secretos en el repositorio.
- Confirmar umbrales iniciales y geocerca de demostración con el Product Owner.
- La suite backend completa vuelve a bloquearse antes de producir resultados bajo Python 3.13/TestClient; las 12 pruebas HU-006 terminan en menos de 3 segundos.
- Alinear el criterio funcional p95 menor a dos minutos con el objetivo constitucional más estricto de menos de diez segundos para alertas críticas.

## Próximos pasos

1. Completar pruebas HTTP de contrato/RBAC, frontend y E2E en Python 3.11/CI.
2. Completar el seed de telemetría demostrativa sin incluir credenciales.
3. Validar el aprovisionamiento externo de `TELEMETRY_DEMO_DEVICE_SECRET` en el ambiente de despliegue.
4. Ejecutar la suite backend completa y verificar la compuerta total menor a 90 segundos.

