# Contexto Multiagente BovinoTech IoT (Modalidad B)

Antes de ejecutar cualquier tarea, consulta .specify/memory/constitution.md.

Este proyecto opera bajo arquitectura multiagente con tres roles. En Claude Code están definidos como subagentes en .claude/agents/ (equivalentes a los de .github/agents/ que usa Gemini):

1. **Agente Especificador (`especificador`)**: Especificación funcional (spec.md) y diseño técnico (plan.md).
2. **Agente Implementador (`implementador`)**: Desarrollo TDD en módulos aislados `features/<modulo>`.
3. **Agente QA y Seguridad (`qa-seguridad`)**: Pruebas sintéticas ganaderas, validación de seguridad y verificación de build.

Al responder, indica explícitamente qué rol de agente estás asumiendo.

## Orquestación

La sesión principal actúa como orquestador: no sustituye a los especialistas, les encarga el trabajo y pasa los resultados de uno a otro.

1. `especificador`: `/speckit.specify` → `/speckit.plan` → `/speckit.tasks` (spec.md, plan.md, contratos, tasks.md).
2. `implementador`: `/speckit.implement`, pruebas primero, solo en `features/<modulo>/`.
3. `qa-seguridad`: auditoría independiente (no escribió el código) que deja `specs/<HU>/qa-report.md` con hallazgos y veredicto.
4. Si hay hallazgos, vuelven a `implementador` (TDD) y `qa-seguridad` re-verifica, hasta el veredicto APROBADO.
5. Commit, push y PR a `main` solo cuando el usuario lo pida. Ningún agente fusiona: la integración a `main` requiere aprobación humana.

Los agentes se coordinan a través de los archivos de `specs/<HU>/`, no de la conversación: cada encargo debe ser autocontenido.

Los comandos de Spec Kit (`/speckit.specify`, `/speckit.plan`, `/speckit.tasks`, `/speckit.implement`, etc.) están en .claude/commands/. Son copias de .gemini/commands/: si cambias uno, actualiza también el otro.
