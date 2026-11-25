---
description: "Plantilla de tareas para implementación de funcionalidades bajo SDD + TDD y Vertical Slicing"
---

# Tareas de Implementación: [NOMBRE DE LA FUNCIONALIDAD]

**Entrada**: Documentos de diseño desde `/specs/[###-nombre-funcionalidad]/`

**Prerrequisitos**: `plan.md` (aprobado), `spec.md` (aprobado con historias de usuario y prioridades).

**Metodología TDD Obligatoria**: Toda historia de usuario exige pruebas automatizadas (`pytest`) escritas **antes o junto con el código productivo**. Las pruebas NUNCA son opcionales.

**Organización**: Las tareas están agrupadas por Historia de Usuario para habilitar la entrega independiente de cada Rebanada Vertical (Vertical Slice MVP).

## Convención de Formato: `[ID] [P?] [Historia] Descripción`

- **[P]**: Tarea paralelizable (archivos distintos sin dependencias directas).
- **[Historia]**: Identificador de la historia de usuario correspondiente (ej. US1, US2).
- **Rutas Exactas**: Incluir siempre rutas absolutas relativas a la raíz del repositorio.

---

## Fase 1: Preparación del Módulo Aislado

**Propósito**: Inicialización de la estructura aislada de la Rebanada Vertical

- [ ] T001 Crear estructura del módulo backend en `backend/app/features/<modulo>/`
- [ ] T002 Crear estructura del módulo frontend en `frontend/src/features/<modulo>/`
- [ ] T003 Definir datos mínimos de prueba aislados (*seed* autónomo de bovinos/eventos)

---

## Fase 2: Historia de Usuario 1 - [Título Breve] (Prioridad: P1) 🎯 Rebanada Vertical MVP

**Objetivo**: [Descripción breve de lo que entrega esta historia de usuario]

**Prueba Independiente**: [Cómo verificar esta historia de forma autónoma]

### Pruebas Automatizadas TDD (OBLIGATORIAS - Red Phase) 🔴

> **REGLA: Redactar estas pruebas primero en `backend/tests/` y confirmar que fallen antes de codificar la solución.**

- [ ] T004 [P] [US1] Pruebas de contrato para endpoints de [modulo] en `backend/tests/contract/test_[modulo]_api.py`
- [ ] T005 [P] [US1] Pruebas unitarias de dominio (inmutabilidad append-only / cálculos ganaderos) en `backend/tests/unit/test_[modulo]_logic.py`
- [ ] T006 [P] [US1] Pruebas de seguridad y roles (RBAC: OPERARIO vs VETERINARIO) en `backend/tests/security/test_[modulo]_rbac.py`

### Implementación Backend (Green Phase) 🟢

- [ ] T007 [US1] Definir modelos SQLAlchemy en `backend/app/features/<modulo>/models.py`
- [ ] T008 [US1] Definir esquemas Pydantic y contratos tipados en `backend/app/features/<modulo>/schemas.py`
- [ ] T009 [US1] Implementar servicio con reglas ganaderas e idempotencia en `backend/app/features/<modulo>/service.py`
- [ ] T010 [US1] Implementar endpoints FastAPI y dependencias de rol en `backend/app/features/<modulo>/router.py`

### Implementación Frontend (Green Phase) 🟢

- [ ] T011 [US1] Crear cliente de API y persistencia offline (`bovinotech_offline_<modulo>_queue`) en `frontend/src/features/<modulo>/services/`
- [ ] T012 [US1] Implementar vista responsive Mobile-First (< 768px con touch targets >= 48px y alto contraste) en `frontend/src/features/<modulo>/<Modulo>View.jsx`
- [ ] T013 [US1] Exportar metadatos de navegación para el Menú Lateral (`navItem` con filtrado por rol RBAC) en `frontend/src/features/<modulo>/index.js`

### Integración en Puntos Compartidos y Verificación de Compuerta

- [ ] T014 [US1] Registrar router al final de `backend/app/main.py`
- [ ] T015 [US1] Registrar vista y elemento de Menú Lateral al final de `frontend/src/App.jsx`
- [ ] T016 [US1] Ejecutar suite de pruebas completa y verificar que el CI pase en menos de 90 segundos (`pytest` + `bandit` + `npm run build`)

**Punto de Control**: La Historia de Usuario 1 debe ser completamente funcional, testeada y demostrable de forma autónoma.

---

## Fase 3: Historia de Usuario 2 - [Título Breve] (Prioridad: P2)

[Estructura idéntica a la Fase 2, siguiendo TDD y Vertical Slicing]
