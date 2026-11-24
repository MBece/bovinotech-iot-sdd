# Desglose de Microtareas: HU-01 — Gestión de Identidad y Control de Acceso por Roles (RBAC)

**Estrategia:** TDD Estricto (Rojo $\rightarrow$ Verde $\rightarrow$ Refactorización)  
**Límite de Trabajo:** `WIP = 1`

---

## Fase 1: Pruebas Automatizadas TDD (Fase Roja)
- [ ] **T01-01:** Crear `backend/tests/test_auth.py` con pruebas para:
  - Login exitoso con emisión de JWT y rol (`ADMINISTRADOR`, `OPERARIO`, `VETERINARIO`, `DIRECTIVO`).
  - Rechazo de credenciales inválidas y contraseñas mayores a 72 bytes.
  - Validación de finca activa asignada y rechazo de fincas no autorizadas.
  - Restricción de aprovisionamiento exclusivo para `ADMINISTRADOR`.
  - Control RBAC con decorador/dependencia de autorización.
- [ ] **T01-02:** Ejecutar `pytest backend/tests/test_auth.py` y verificar estado **ROJO** (fallo controlado).

---

## Fase 2: Implementación Backend (Fase Verde)
- [ ] **T01-03:** Crear `backend/app/features/auth/security.py` con manejo de hash bcrypt (truncado a 72 bytes) y generación/validación de tokens JWT.
- [ ] **T01-04:** Crear `backend/app/features/auth/models.py` y `schemas.py` con el modelo SQLAlchemy y esquemas Pydantic.
- [ ] **T01-05:** Crear `backend/app/features/auth/service.py` con la lógica de negocio y semillero inicial de usuarios de prueba.
- [ ] **T01-06:** Crear `backend/app/features/auth/router.py` con endpoints `/login`, `/me`, `/users` y dependencias `get_current_user`, `require_role`.
- [ ] **T01-07:** Registrar router en `backend/app/main.py`.
- [ ] **T01-08:** Ejecutar `pytest backend/tests/test_auth.py` y verificar estado **VERDE** (100% pasando).

---

## Fase 3: Implementación Frontend
- [ ] **T01-09:** Crear `frontend/src/features/auth/AuthContext.jsx` con persistencia en `localStorage`.
- [ ] **T01-10:** Crear `frontend/src/features/auth/LoginForm.jsx` con formulario de acceso y selector de finca activa.
- [ ] **T01-11:** Integrar `AuthProvider` y barra de sesión en `frontend/src/App.jsx`.
- [ ] **T01-12:** Ejecutar `npm run build` en `frontend/` y verificar compilación limpia sin errores de linting.

---

## Fase 4: Auditoría y Despliegue
- [ ] **T01-13:** Auditar con `@qa-seguridad` contra ISO/IEC 25010 y NISTIR 8259A.
- [ ] **T01-14:** Ejecutar `git status`, `git add .`, commit convencional y push a `origin feat/hu-01-auth`.
