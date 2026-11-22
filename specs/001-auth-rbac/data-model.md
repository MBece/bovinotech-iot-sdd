# Modelo de Datos: Identidad, Aprovisionamiento y RBAC

**Spec**: [spec.md](spec.md) · **Investigación**: [research.md](research.md)

Todas las tablas pertenecen al módulo `backend/app/features/auth/`.

## Enumeración `UserRole`

`ADMINISTRADOR`, `OPERARIO`, `VETERINARIO`, `DIRECTIVO`.

Se conservan los valores existentes `OPERARIO` y `VETERINARIO` (R4). En SQLite el enum se guarda como texto sin restricción CHECK, así que añadir valores no requiere migración.

## `users` (existente, se amplía)

| Campo | Tipo | Reglas |
|---|---|---|
| `id` | Integer PK | Existente |
| `email` | String, único | Existente. Único en todo el sistema |
| `hashed_password` | String | Existente. bcrypt |
| `role` | `UserRole` | Existente. Se amplía el enum |
| `full_name` | String, nullable | **Nuevo**. Obligatorio al aprovisionar; nullable solo por los registros existentes |
| `is_active` | Boolean, default `True` | **Nuevo** |
| `must_change_password` | Boolean, default `False` | **Nuevo** (FR-016) |
| `created_at` | DateTime UTC | **Nuevo** |
| `created_by_id` | Integer, nullable | **Nuevo**. `users.id` del administrador. Nulo para el seed |
| `disabled_at` | DateTime UTC, nullable | **Nuevo** (FR-017). Se fija al deshabilitar y se limpia al rehabilitar |

Las columnas nuevas se añaden con `ensure_auth_schema` (R1).

**Validaciones**:
- `OPERARIO` y `ADMINISTRADOR` tienen exactamente 1 finca; `VETERINARIO` y `DIRECTIVO` tienen 1 o más (FR-014).
- No se puede deshabilitar al último `ADMINISTRADOR` activo de una finca (FR-006).
- La contraseña nueva debe ser distinta de la temporal (FR-016).

**Transiciones de estado**:

```text
[aprovisionado] --(login + cambio de contraseña)--> [activo]
   is_active=True                                     is_active=True
   must_change_password=True                          must_change_password=False

[activo] --(admin deshabilita)--> [deshabilitado] --(admin habilita)--> [activo]
                                   is_active=False                       disabled_at=NULL
                                   disabled_at=now
```

## `farms` (nueva)

| Campo | Tipo | Reglas |
|---|---|---|
| `id` | Integer PK | |
| `name` | String, único | |

Seed mínimo: `Finca La Esperanza` (id 1), `Finca El Roble` (id 2). La gestión de fincas queda fuera del alcance (spec, supuestos).

## `user_farms` (nueva, asociación muchos a muchos)

| Campo | Tipo | Reglas |
|---|---|---|
| `user_id` | FK `users.id` | PK compuesta |
| `farm_id` | FK `farms.id` | PK compuesta |
| `assigned_at` | DateTime UTC | |
| `assigned_by_id` | Integer, nullable | Administrador que asignó |

Las claves foráneas son internas del módulo `auth`, así que no violan el desacoplamiento entre HU.

## `auth_audit_log` (nueva, append-only)

| Campo | Tipo | Reglas |
|---|---|---|
| `id` | Integer PK | |
| `action` | String | `USER_CREATED`, `USER_ENABLED`, `USER_DISABLED`, `FARM_ASSIGNED`, `PASSWORD_CHANGED`, `SYNC_REJECTED_AFTER_DISABLE` |
| `actor_user_id` | Integer, nullable | Quién ejecutó la acción. Nulo en acciones del sistema |
| `target_user_id` | Integer | Usuario afectado |
| `farm_id` | Integer | Finca del contexto |
| `details` | JSON (texto) | Por ejemplo, `client_event_ids` rechazados |
| `occurred_at` | DateTime UTC | Fecha/hora exacta del servidor (FR-012) |

Solo se permiten `INSERT`; no hay endpoints ni funciones de actualización o borrado.

## Claims del token de acceso (JWT)

| Claim | Contenido |
|---|---|
| `sub` | email |
| `role` | `UserRole` |
| `farm_id` | finca activa |
| `pwd_change` | `true` si debe cambiar la contraseña |
| `iat` | emisión (cota inferior para FR-017, R5) |
| `exp` | `iat` + 7 días (R2) |

## Seed de desarrollo

| Email | Rol | Fincas | Contraseña (variable de entorno, fallback local) |
|---|---|---|---|
| `admin@bovinotech.co` | ADMINISTRADOR | 1 | `SEED_ADMIN_PASSWORD` |
| `operario@bovinotech.co` | OPERARIO | 1 | `SEED_OPERARIO_PASSWORD` (existente) |
| `vet@bovinotech.co` | VETERINARIO | 1 | `SEED_VET_PASSWORD` (existente) |
| `vet2@bovinotech.co` | VETERINARIO | 1, 2 | `SEED_VET_PASSWORD` |
| `directivo@bovinotech.co` | DIRECTIVO | 1 | `SEED_DIRECTIVO_PASSWORD` |

`vet@` conserva una sola finca para no romper las pruebas de otros módulos que inician sesión con él; el caso de varias fincas se prueba con `vet2@`. Los usuarios del seed se crean con `must_change_password=False` para no bloquear las pruebas locales. El seed es idempotente: a los usuarios existentes sin finca se les asigna la finca 1.
