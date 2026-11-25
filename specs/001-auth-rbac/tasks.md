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

## Fase 4: Convergencia

**Origen**: `/speckit.converge` del 2026-11-21, tras ampliar la HU-01 (spec, plan y constitución §4). Orden: CRÍTICO, luego ALTO (pruebas primero, TDD), luego MEDIO y BAJO. Las rutas de prueba son relativas a `backend/tests/`.

### Crítico (constitución)

- [x] T021 CRITICAL: Ampliar `UserRole` con `ADMINISTRADOR` y `DIRECTIVO` en `backend/app/features/auth/models.py` y `backend/app/features/auth/schemas.py`, conservando `OPERARIO` y `VETERINARIO` (data-model.md `User.role`) según Constitución §4 y FR-007 (contradicts)

### Alto: pruebas (escribir primero y verificar que fallan)

- [x] T022 [P] Crear `unit/test_auth_schema_migration.py`: aplicar `ensure_auth_schema` sobre una tabla `users` con el esquema antiguo, verificar que añade las columnas y que es idempotente al repetirla, según plan: decisión R1 (missing)
- [x] T023 [P] Crear `contract/test_auth_login_api.py`: usuario inactivo → 401 con el mismo mensaje que credenciales inválidas; claims `role`, `farm_id`, `pwd_change`, `iat` y `exp` a 7 días; 409 `FARM_SELECTION_REQUIRED` con lista de fincas; 403 con `farm_id` no asignado; `POST /auth/register` → 403 `SELF_REGISTRATION_DISABLED`, según US1/AC1, US1/AC2, US1/AC8, FR-001, FR-002, FR-003 y FR-004 (missing)
- [x] T024 [P] Crear `contract/test_auth_provisioning_api.py`: el administrador crea un usuario de su finca con `must_change_password`; un no administrador recibe 403; gestionar a un usuario de otra finca → 403; email duplicado → 409; deshabilitar al último administrador → 409 `LAST_ADMIN`; asignar segunda finca a `OPERARIO` → 409 `SINGLE_FARM_ROLE`; añadir finca a un `VETERINARIO`; cada escritura inserta en `auth_audit_log`, según US1/AC6, US1/AC7, US1/AC9, FR-005, FR-006, FR-012 y FR-014 (missing)
- [x] T025 [P] Crear `unit/test_auth_permissions.py` con la matriz de research.md R8 sobre `/auth/test-vet-only`, `/auth/test-directive-costs` y `/auth/test-write-access` para los 4 roles, según US1/AC3, US1/AC10, US1/AC11, FR-008, FR-009, FR-010, FR-015 y FR-018 (missing)
- [x] T026 [P] Crear `security/test_auth_password_policy.py`: un token con `pwd_change` recibe 403 `PASSWORD_CHANGE_REQUIRED` en cualquier ruta salvo `/auth/change-password`; se rechaza reutilizar la contraseña temporal y una de menos de 8 caracteres; el cambio emite un token normal, según US1/AC12 y FR-016 (missing)
- [x] T027 [P] Crear `unit/test_auth_sync_support.py`: `was_user_active_at` (antes y después de `disabled_at`, antes de `iat`); `get_current_user_for_sync` acepta a un deshabilitado con `iat` anterior a `disabled_at`; `verify_pending_author` (mismo autor con token nuevo, otro autor, autor deshabilitado); `record_sync_rejection` inserta `SYNC_REJECTED_AFTER_DISABLE`, según FR-013, FR-017 y SC-009 (missing)

### Alto: implementación del backend

- [x] T028 Añadir a `User` las columnas (data-model.md `User.full_name`, `User.is_active`, `User.must_change_password`, `User.created_at`, `User.created_by_id`, `User.disabled_at`) y crear los modelos (data-model.md `Farm.id`, `Farm.name`, `UserFarm.user_id`, `UserFarm.farm_id`, `UserFarm.assigned_at`, `UserFarm.assigned_by_id`, `AuthAuditLog.id`, `AuthAuditLog.action`, `AuthAuditLog.actor_user_id`, `AuthAuditLog.target_user_id`, `AuthAuditLog.farm_id`, `AuthAuditLog.details`, `AuthAuditLog.occurred_at`) en `backend/app/features/auth/models.py`, según FR-005, FR-012, FR-014, FR-016 y FR-017 (missing)
- [x] T029 Crear `ensure_auth_schema(engine)` en `backend/app/features/auth/schema_migration.py` y llamarla en `backend/app/main.py` antes de `seed_initial_users()` (punto compartido: solo añadir líneas), según plan: decisión R1 (missing)
- [x] T030 Mover el seed a `backend/app/features/auth/seed.py`, reexportando `seed_initial_users` desde `router.py`. Debe crear las fincas 1 y 2, `admin@bovinotech.co` y `directivo@bovinotech.co`, asignar las fincas 1 y 2 a `vet@bovinotech.co` y la finca 1 a los usuarios sin finca, con contraseñas de `SEED_*_PASSWORD` y `must_change_password=False` (data-model.md, sección Seed de desarrollo), según plan: seed y la constitución sobre seed propio (partial)
- [x] T031 Cambiar la expiración del token a 7 días configurable con `ACCESS_TOKEN_EXPIRE_MINUTES` y añadir `iat` en `backend/app/features/auth/security.py`, según FR-013 y research.md R2 (partial)
- [x] T032 Ampliar `POST /auth/login` en `backend/app/features/auth/router.py` según contracts/auth-api.md: rechazar inactivos (data-model.md `User.is_active`), aceptar `farm_id`, responder 409 cuando hay varias fincas y no se envía, incluir los claims `farm_id` y `pwd_change`, y devolver `farm_id`, `must_change_password` y `expires_at`, manteniendo `access_token`, `token_type` y `role`; según FR-001, FR-002, US1/AC1 y US1/AC8 (partial)
- [x] T033 Ampliar `get_current_user` sin cambiar su firma: 401 si el usuario está inactivo, 403 `PASSWORD_CHANGE_REQUIRED` si el token lleva `pwd_change`, y atributo transitorio `active_farm_id` tomado del token; según FR-003, FR-011 y FR-016 (partial)
- [x] T034 Crear `POST /auth/register`, que responde siempre 403 con el mensaje en español de contracts/auth-api.md, según FR-004 y US1/AC2 (missing)
- [x] T035 Crear `backend/app/features/auth/permissions.py` con `require_roles`, `require_write_access` (deniega `DIRECTIVO` y `ADMINISTRADOR`) y `require_directive_costs` (solo `DIRECTIVO`), reexportarlos desde `router.py` y añadir las rutas `/auth/test-directive-costs` y `/auth/test-write-access`, según FR-009, FR-010, FR-015 y FR-018 (missing)
- [x] T036 Crear `backend/app/features/auth/service.py` y los endpoints `POST /auth/users`, `GET /auth/users`, `PATCH /auth/users/{id}/status`, `POST /auth/users/farms` y `GET /auth/audit`, limitados a la finca del administrador. Deben proteger al último administrador, aplicar las fincas por rol, fijar y limpiar `disabled_at` (data-model.md `User.disabled_at`) e insertar solo en `auth_audit_log` (data-model.md `AuthAuditLog.action`); según FR-005, FR-006, FR-011, FR-012, FR-014, US1/AC6, US1/AC7 y US1/AC9 (missing)
- [x] T037 Crear `POST /auth/change-password` con una dependencia propia que acepte un token con `pwd_change`. Debe exigir una contraseña distinta y de al menos 8 caracteres, limpiar `User.must_change_password` (data-model.md), auditar `PASSWORD_CHANGED` y devolver un token nuevo; según FR-016 y US1/AC12 (missing)
- [x] T038 Crear `backend/app/features/auth/sync_support.py` con `get_current_user_for_sync`, `was_user_active_at`, `verify_pending_author` y `record_sync_rejection`, según el contrato interno de contracts/auth-api.md, FR-013 y FR-017 (missing)

### Alto: implementación del frontend

- [x] T039 Ampliar `frontend/src/features/auth/authService.js`: `login(email, password, farmId)`, que propague el 409 con la lista de fincas, `changePassword`, `listUsers`, `createUser`, `setUserStatus`, `addUserFarm` y `getAudit`, según contracts/auth-api.md (missing)
- [x] T040 Ampliar `frontend/src/features/auth/AuthContext.jsx` con `farmId`, `farms`, `mustChangePassword`, `sessionExpiresAt` (decodificando `exp`), `sessionExpired`, `canCapture` (según el rol, sin depender del vencimiento) y `captureNeedsAuthorVerification`, persistidos en `localStorage`; según FR-013 y research.md R9 (partial)
- [x] T041 Crear `frontend/src/features/auth/FarmSelector.jsx`, con reexport en `components/`, e integrarlo en `LoginForm.jsx` cuando el login responde 409; según US1/AC8 (missing)
- [x] T042 Crear `frontend/src/features/auth/ChangePasswordForm.jsx`, con reexport en `components/`, y mostrarlo tras el login cuando `mustChangePassword` es verdadero; según US1/AC12 y FR-016 (missing)
- [x] T043 Crear `frontend/src/features/auth/UserAdminPanel.jsx`, con reexport en `components/`: crear y listar usuarios, habilitarlos y deshabilitarlos, añadir finca y ver la auditoría, incluidos los rechazos de sincronización. Registrarlo en `frontend/src/App.jsx` solo para `ADMINISTRADOR`, añadiendo líneas al final; según US1/AC6, FR-005 y FR-017 (missing)

### Medio

- [x] T044 Traducir al español los mensajes `detail` que ve el usuario en `backend/app/features/auth/router.py` ("Incorrect email or password", "Could not validate credentials"), ajustando las aserciones de `test_auth.py` si dependen del texto; según la constitución §1 y plan: idioma (contradicts)
- [x] T045 Adaptar el panel de roles de `frontend/src/App.jsx`, que hoy solo distingue `VETERINARIO` y el resto, para que muestre los 4 roles y su descripción, sin tocar las vistas de otros módulos; según FR-007 (partial)
- [x] T046 Redactar la solicitud de coordinación al responsable de `sanitary_events` y `sinigan`. Debe pedir: adoptar `get_current_user_for_sync`, `was_user_active_at`, `verify_pending_author`, `record_sync_rejection` y `require_write_access` en `/sync`; guardar el autor capturado en el dispositivo; marcar los eventos capturados con la sesión vencida; y filtrar por `active_farm_id`. Según plan: Seguimiento de Complejidad, FR-011, FR-013b y FR-017b (missing)

### Bajo

- [x] T047 [P] Añadir una prueba que mida la emisión del token en menos de 500 ms en `contract/test_auth_login_api.py`, según SC-003 (missing)
- [x] T050 [P] Revisión de seguridad (IDOR entre fincas): impedir que un administrador cambie el estado de un usuario que también pertenece a otras fincas (403 `USER_SHARED_WITH_OTHER_FARMS`), con prueba en `contract/test_auth_provisioning_api.py`; según FR-005
- [x] T051 [P] Revisión de seguridad (enumeración): cambiar la asignación de finca a `POST /auth/users/farms` con `{ "email" }` en lugar de `id`, y limitar `UserRead.farms` a la finca del administrador en todas las respuestas administrativas; pruebas en `contract/test_auth_provisioning_api.py` y ajuste de `authService.addUserFarm` y `UserAdminPanel.jsx`; según FR-005 y FR-014
- [x] T048 [P] Documentar las variables nuevas `ACCESS_TOKEN_EXPIRE_MINUTES`, `SEED_ADMIN_PASSWORD` y `SEED_DIRECTIVO_PASSWORD`, sin valores reales, en el archivo de ejemplo de variables de entorno de `backend/`, según la constitución §4 (cero credenciales) y quickstart.md (partial)
- [ ] T049 Ejecutar la validación final: `pytest` completo (incluidas las pruebas existentes de `sanitary_events` y `sinigan`, para descartar regresiones), `npm run build`, `npm run lint` y la validación manual de quickstart.md; según SC-001 a SC-009 (missing)
