# Plan de Implementación: Identidad, Aprovisionamiento y RBAC

**Rama**: `001-auth-rbac` | **Fecha**: 2026-11-18 (actualizado 2026-11-21) | **Spec**: [spec.md](spec.md)

**Entrada**: Spec de HU-01 ampliada (cuatro roles, aprovisionamiento administrativo, finca activa, contraseña temporal, sesión offline de 7 días, sincronización de usuarios deshabilitados).

## Resumen

La primera versión de este módulo ya está implementada: login con JWT, roles `OPERARIO` y `VETERINARIO`, `require_veterinario` y el formulario de login en React. Este plan **amplía** esa base sin romper a los módulos que dependen de ella (`sanitary_events`, `sinigan`). Cambios principales:

- Cuatro roles y una matriz de permisos con dependencias reutilizables.
- Fincas con asignación por rol y finca activa en el token.
- Aprovisionamiento solo por administrador, con contraseña temporal de cambio obligatorio.
- Rechazo explícito del autorregistro.
- Tokens de 7 días que respaldan la sesión offline; al vencer se sigue capturando con verificación de autor posterior (constitución §5.4).
- Auditoría append-only de las escrituras del módulo.
- Funciones para que la sincronización aplique la regla de usuario deshabilitado.

**Criterio de terminado de esta HU**: el mecanismo de FR-011, FR-013 y FR-017 entregado con pruebas. FR-013b y FR-017b se aplican en la historia de eventos sanitarios (ver Seguimiento de Complejidad).

Las decisiones técnicas están en [research.md](research.md).

## Contexto Técnico

**Lenguaje/Versión**: Python 3.11+ (backend), JavaScript con React y Vite (frontend).

**Dependencias Principales**: FastAPI, SQLAlchemy 2.0, Pydantic 2, bcrypt, PyJWT; React Context API. No se añaden dependencias nuevas.

**Almacenamiento**: SQLite vía SQLAlchemy. Evolución de esquema con `ensure_auth_schema` idempotente (R1).

**Pruebas**: pytest + httpx `TestClient` (backend); `npm run build` y `npm run lint` (frontend).

**Plataforma Objetivo**: Servicio web y PWA offline-first.

**Tipo de Proyecto**: Aplicación web (backend + frontend) con módulos verticales.

**Metas de Rendimiento**: Emisión del token en menos de 500 ms (SC-003). bcrypt con el costo por defecto cumple holgadamente.

**Restricciones**:
- Compatibilidad hacia atrás con los símbolos que importan otros módulos (R4).
- No modificar `sanitary_events` ni `sinigan`.
- Cero secretos en el repositorio: las contraseñas del seed y `SECRET_KEY` vienen de variables de entorno.
- CI en menos de 90 s.

**Escala/Alcance**: Decenas de usuarios por finca y pocas fincas. No hay requisitos de escalado horizontal.

## Verificación de Constitución

| Principio | Estado | Cómo se cumple |
|---|---|---|
| Idioma: docs en español, código en inglés | ✅ | Endpoints, clases y tests en inglés; mensajes de UI y `detail` en español |
| Aislamiento modular estricto | ⚠️ | Todo el código va en `features/auth/`. La aplicación de FR-013, FR-017 y la restricción de escritura de `DIRECTIVO` en la sincronización **requiere cambios en `sanitary_events`**, que este plan **no hace**: queda como solicitud de coordinación (ver Seguimiento de Complejidad) |
| Puntos compartidos (`main.py`, `App.jsx`) | ✅ | `main.py`: se añade la llamada a `ensure_auth_schema` antes del seed. `App.jsx`: se registra `UserAdminPanel` añadiendo líneas al final |
| Desacoplamiento entre HU | ✅ | Las FK nuevas (`user_farms`) son internas de `auth`. Otros módulos siguen referenciando al usuario por email |
| Seed propio del módulo | ✅ | Fincas, administrador y directivo de prueba en el seed de `auth` |
| Separación QUÉ y CÓMO | ✅ | La spec no menciona tecnología |
| TDD | ✅ | Cada requisito tiene pruebas en `backend/tests/` antes de implementarse |
| Historial append-only | ✅ | `auth_audit_log` solo admite inserciones |
| Offline-first y Degradación Elegante (§3, §5.4) | ✅ | Token de 7 días; el vencimiento no bloquea la captura, solo marca los eventos para verificar el autor (R2, R9) |
| RBAC (§4, enmendada 2026-11-21) | ✅ | Cuatro roles con mínimo privilegio y aislamiento por finca activa |
| Cero credenciales en el repositorio | ✅ | Las contraseñas del seed salen de variables de entorno, con fallback solo en entorno no productivo, igual que hoy |

**Resultado de la compuerta**: pasa con una advertencia (aislamiento modular) justificada abajo.

## Estructura del Proyecto

### Documentación

```text
specs/001-auth-rbac/
├── spec.md
├── plan.md              # este archivo
├── research.md          # Fase 0
├── data-model.md        # Fase 1
├── quickstart.md        # Fase 1 (actualizado)
├── contracts/
│   └── auth-api.md      # Fase 1
└── tasks.md             # Fase 2: se actualiza con /speckit.converge
```

### Código fuente

```text
backend/app/features/auth/
├── models.py          # MODIFICAR: UserRole (+2), User (+6 columnas), Farm, UserFarm, AuthAuditLog
├── schemas.py         # MODIFICAR: UserRole (+2), Token (+farm_id, must_change_password, expires_at),
│                      #   UserCreateByAdmin, UserStatusUpdate, PasswordChange, FarmRead, AuditLogRead
├── security.py        # MODIFICAR: expiración de 7 días configurable; iat en el token
├── schema_migration.py# NUEVO: ensure_auth_schema(engine) (R1)
├── permissions.py     # NUEVO: require_roles, require_write_access, require_directive_costs
├── sync_support.py    # NUEVO: get_current_user_for_sync, was_user_active_at, verify_pending_author, record_sync_rejection
├── service.py         # NUEVO: provisioning, change_password, set_status, assign_farm, audit
├── seed.py            # NUEVO: seed de fincas y usuarios (seed_initial_users se mueve aquí y se reexporta)
├── router.py          # MODIFICAR: login con finca, register, change-password, users, audit;
│                      #   get_current_user (activo, pwd_change, active_farm_id); reexportaciones
└── utils.py           # sin cambios

backend/app/main.py    # MODIFICAR (punto compartido): ensure_auth_schema(engine) antes de seed_initial_users()

backend/tests/
├── test_auth.py                               # existente, debe seguir en verde
├── contract/test_auth_login_api.py            # NUEVO: login, finca, 409, deshabilitado, register
├── contract/test_auth_provisioning_api.py     # NUEVO: users, status, farms, audit, último admin
├── unit/test_auth_permissions.py              # NUEVO: matriz de permisos (R8)
├── unit/test_auth_sync_support.py             # NUEVO: was_user_active_at, get_current_user_for_sync
├── unit/test_auth_schema_migration.py         # NUEVO: idempotencia sobre una tabla users antigua
└── security/test_auth_password_policy.py      # NUEVO: contraseña temporal, bloqueo, reutilización

frontend/src/features/auth/
├── AuthContext.jsx            # MODIFICAR: farmId, farms, mustChangePassword, sessionExpiresAt, sessionExpired, canCapture, captureNeedsAuthorVerification
├── authService.js             # MODIFICAR: login con farm_id, changePassword, users, audit
├── LoginForm.jsx              # MODIFICAR: maneja 409 → FarmSelector; redirige a ChangePasswordForm
├── FarmSelector.jsx           # NUEVO
├── ChangePasswordForm.jsx     # NUEVO
├── UserAdminPanel.jsx         # NUEVO: crear, listar, habilitar/deshabilitar, añadir finca, ver auditoría
└── components/, context/, services/   # Solo reexportan (convención existente); añadir un reexport por componente nuevo

frontend/src/App.jsx           # MODIFICAR (punto compartido): registrar UserAdminPanel para ADMINISTRADOR
```

**Decisión de estructura**: Aplicación web con módulos verticales. Se reutilizan las carpetas existentes del módulo `auth`.

## Orden de implementación sugerido

Cada paso empieza con sus pruebas en rojo.

1. **Esquema**: modelos y `ensure_auth_schema`, con un test que la aplica sobre una tabla `users` antigua.
2. **Seed**: fincas, admin, directivo y asignación de finca a los usuarios existentes.
3. **Login ampliado**: finca activa, 409, deshabilitado = 401 con el mismo mensaje, claims nuevos. El test existente `test_auth.py` debe seguir pasando.
4. **`get_current_user` ampliado**: comprobar `is_active` y `pwd_change`, y añadir `active_farm_id`.
5. **`/register`**: 403.
6. **Matriz de permisos y rutas de verificación.**
7. **Aprovisionamiento**: `users`, `status`, `farms`, último admin y auditoría.
8. **Cambio de contraseña.**
9. **Funciones de sincronización** (`sync_support.py`).
10. **Frontend**: contexto, login con finca, cambio de contraseña, panel de administración, `canCapture` y `captureNeedsAuthorVerification`.
11. **Validación local**: `pytest` + `npm run build` + `npm run lint`.

## Seguimiento de Complejidad

| Desviación | Por qué es necesaria | Alternativa descartada |
|---|---|---|
| FR-013, FR-017 y la restricción de escritura de `DIRECTIVO` y `ADMINISTRADOR` solo quedan **completas** cuando `sanitary_events` adopte `get_current_user_for_sync`, `was_user_active_at`, `record_sync_rejection` y `require_write_access`, y guarde el autor capturado en el dispositivo | Hoy `/sync` asigna como autor a quien sincroniza y acepta a cualquier usuario autenticado. Ese código pertenece a otro integrante | Modificar `sanitary_events` directamente: lo prohíbe la constitución (§2). **Acción**: abrir una solicitud al dueño de `sanitary_events` con el contrato interno de [contracts/auth-api.md](contracts/auth-api.md). Mientras tanto, `auth` entrega las funciones con sus pruebas |
| La restricción por finca (FR-011) sobre eventos sanitarios y consultas SINIGÁN | Esos datos no tienen finca hoy | Añadir `farm_id` a tablas ajenas: lo prohíbe la constitución §2. Se incluye en la misma solicitud de coordinación |
| Marcar como pendientes los eventos capturados con la sesión vencida y verificarlos al sincronizar (FR-013b) depende de que `sanitary-events` consulte `captureNeedsAuthorVerification` y use `verify_pending_author` | La captura y la sincronización están en otro módulo | Igual que arriba |
| `ensure_auth_schema` hace `ALTER TABLE` a mano | No hay herramienta de migraciones y no se debe borrar la base local de otros | Alembic: es configuración global, fuera del módulo |
