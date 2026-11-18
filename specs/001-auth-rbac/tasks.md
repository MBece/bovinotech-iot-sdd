# Tareas: Gestión de Identidad y RBAC (HU-01)

**Entrada**: Documentos de diseño en `specs/001-auth-rbac/`

**Prerrequisitos**: `plan.md`, `spec.md`

## Fase 1: Configuración (Infraestructura Compartida)

- [x] T001 Crear estructura de directorios para el módulo auth en `backend/app/features/auth/` y `frontend/src/features/auth/`
- [x] T002 [P] Asegurar dependencias en `backend/requirements.txt` (passlib[bcrypt], pyjwt, sqlalchemy)
- [x] T003 [P] Configurar variables de entorno básicas para JWT (SECRET_KEY) en un archivo `.env` de ejemplo (sin valores reales)

## Fase 2: Fundacional (Prerrequisitos Bloqueantes)

**⚠️ CRÍTICO**: Ninguna historia de usuario puede comenzar hasta que esta fase esté completa.

- [x] T004 [P] Implementar modelos SQLAlchemy en `backend/app/features/auth/models.py` (User con roles Enum)
- [x] T005 [P] Implementar esquemas Pydantic en `backend/app/features/auth/schemas.py` (UserCreate, UserRead, Token)
- [x] T006 Implementar utilidades de seguridad en `backend/app/features/auth/utils.py` (hashing de contraseñas y creación/decodificación de JWT)
- [x] T007 Registrar el router de auth en `backend/app/main.py` para habilitar los endpoints

## Fase 3: Historia de Usuario 1 - Gestión de Identidad y RBAC (Prioridad: P1) 🎯 MVP

**Meta**: Permitir el inicio de sesión y diferenciar permisos entre OPERARIO y VETERINARIO.

**Prueba Independiente**: Ejecutar `pytest backend/tests/test_auth.py` y verificar el flujo de login y rechazo de permisos (403).

### Pruebas para Historia de Usuario 1 (TDD) ⚠️

> **NOTA: Escribir estas pruebas PRIMERO y asegurar que FALLEN antes de la implementación**

- [x] T008 Crear archivo de pruebas `backend/tests/test_auth.py` con casos para login exitoso, login fallido (401) y acceso denegado por rol (403).
- [x] T009 Implementar prueba de integración que verifique que el token contiene el rol explícito del usuario.

### Implementación para Historia de Usuario 1 (Backend)

- [x] T010 Implementar lógica de autenticación en `backend/app/features/auth/router.py` (endpoint `POST /login`)
- [x] T011 Implementar dependencia `get_current_user` y verificador de roles en `backend/app/features/auth/router.py`
- [x] T012 Crear script de precarga o lógica de inicialización para usuarios de prueba (`operario@bovinotech.co` y `vet@bovinotech.co`)
- [x] T013 [P] Implementar endpoint `GET /me` para retornar el perfil del usuario autenticado.

### Implementación para Historia de Usuario 1 (Frontend)

- [x] T014 Crear servicio de autenticación en `frontend/src/features/auth/services/authService.js` (comunicación con API)
- [x] T015 Implementar `AuthContext.jsx` en `frontend/src/features/auth/context/` para gestionar el estado global del usuario y el token.
- [x] T016 Crear formulario de inicio de sesión en `frontend/src/features/auth/components/LoginForm.jsx` (localizado al español).
- [x] T017 Integrar el formulario en la aplicación principal y configurar la redirección post-login basada en roles.

## Fase Final: Pulido y Verificación

- [x] T018 Ejecutar suite de pruebas completa de backend para asegurar que no hay regresiones.
- [x] T019 Verificar que los campos del formulario en frontend están correctamente etiquetados en español.
- [x] T020 Documentar los pasos de inicio rápido para probar la autenticación en `specs/001-auth-rbac/quickstart.md`.

---

## Dependencias y Orden de Ejecución

1. **Fase 1 y 2**: Deben completarse primero. Son la base técnica.
2. **Fase 3 (TDD)**: Las pruebas (T008, T009) deben fallar antes de implementar la lógica del backend (T010-T013).
3. **Integración Frontend**: Se realiza una vez el backend esté verificado con las pruebas.
