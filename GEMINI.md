# Contexto Multiagente BovinoTech IoT (Modalidad B)

Antes de ejecutar cualquier tarea, consulta estrictamente [.specify/memory/constitution.md](.specify/memory/constitution.md).
Este proyecto opera bajo arquitectura multiagente (Lean-Kanban + SDD + DevSecOps + SRE) con tres roles definidos en `.github/agents/`:

1. **Agente Especificador (`especificador.agent.md`)**:
   - Especificación funcional (`spec.md` en español, solo el QUÉ, Given/When/Then, offline-first, ergonomía de campo y metas SLO).
   - Diseño técnico (`plan.md` en español, arquitectura por Vertical Slices en `backend/app/features/<modulo>/` y `frontend/src/features/<modulo>/`, navegación por Menú Lateral con RBAC, cumplimiento de ISO/IEC 25010 y NISTIR 8259A).

2. **Agente Implementador (`implementador.agent.md`)**:
   - Desarrollo full-stack con límite estricto **WIP = 1** y TDD (*Test-First* con `pytest`).
   - Código en inglés y textos UI en español.
   - Aislamiento modular estricto modificando únicamente su carpeta `features/<modulo>/` y puntos compartidos permitidos (`backend/app/main.py` y `frontend/src/App.jsx` solo al final del bloque).
   - Componentes frontend mobile-first (< 768px, touch targets >= 48px) y persistencia offline estandarizada.

3. **Agente QA y Seguridad (`qa-seguridad.agent.md`)**:
   - Pruebas sintéticas ganaderas (aretes SINIGÁN V6, telemetría IoT, collares, tiempos de retiro).
   - Auditoría de seguridad (esquemas Pydantic, control RBAC, NISTIR 8259A y SAST con Bandit).
   - Auditoría de resiliencia (append-only, idempotencia offline, SLOs de SRE < 10s / 99.9% y CI < 90 segundos).

**Regla obligatoria de interacción:** Al responder, indica explícitamente qué rol de agente estás asumiendo.
