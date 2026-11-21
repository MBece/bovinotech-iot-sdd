# Contrato de API: módulo `auth`

Prefijo: `/auth`. Todos los cuerpos son JSON salvo que se indique otra cosa. Los mensajes `detail` que ve el usuario están en español.

Los errores con código de negocio tienen la forma `{ "detail": { "message": str, "code": str, ...extra } }`. Los demás errores usan `{ "detail": str }`.

Errores comunes:

| Código | Cuándo |
|---|---|
| 401 | Sin token, token inválido o vencido, usuario deshabilitado (FR-003) |
| 403 `PASSWORD_CHANGE_REQUIRED` | Token con `pwd_change: true` en una ruta distinta de `/auth/change-password` (FR-016) |
| 403 | Rol o finca sin permiso |

---

## `POST /auth/login` (existente, se amplía)

Acepta JSON o formulario, igual que hoy.

**Solicitud**: `{ "email": str, "password": str, "farm_id": int | null }` (también acepta `username` en lugar de `email`).

| Respuesta | Cuerpo |
|---|---|
| 200 | `{ "access_token", "token_type": "bearer", "role", "farm_id", "must_change_password": bool, "expires_at": ISO-8601 }` |
| 401 | Credenciales inválidas **o** usuario deshabilitado, con el mismo mensaje en ambos casos |
| 409 `FARM_SELECTION_REQUIRED` | El usuario tiene varias fincas y no envió `farm_id`. Cuerpo: `{ "detail": { "message", "code", "farms": [{ "id", "name" }] } }` |
| 403 | `farm_id` enviado no está asignado al usuario |

Se mantienen los campos actuales `access_token`, `token_type` y `role`, así que el cambio es compatible.

## `POST /auth/register` (nuevo)

Siempre responde **403**: `{ "detail": { "message": "El registro público no está habilitado. Solicite su cuenta al administrador de su finca.", "code": "SELF_REGISTRATION_DISABLED" } }` (FR-004).

## `POST /auth/change-password` (nuevo)

Requiere token, incluido uno con `pwd_change: true`.

**Solicitud**: `{ "current_password": str, "new_password": str }`

| Respuesta | Cuándo |
|---|---|
| 200 | Igual que el login: nuevo token con `pwd_change: false` |
| 400 | La contraseña nueva es igual a la actual o no cumple la longitud mínima (8) |
| 401 | `current_password` incorrecta |

## `GET /auth/me` (existente, se amplía)

200: `{ "id", "email", "full_name", "role", "is_active", "active_farm_id", "farms": [{ "id", "name" }] }`

## Administración (solo `ADMINISTRADOR`, y solo sobre su finca)

En todas las respuestas de esta sección, `UserRead.farms` contiene **solo la finca del administrador**: nunca se exponen las demás fincas de un `VETERINARIO` o `DIRECTIVO` compartido.

### `POST /auth/users`

**Solicitud**: `{ "email", "full_name", "role", "temporary_password" }`. La finca es siempre la del administrador.

| Respuesta | Cuándo |
|---|---|
| 201 | `UserRead` con `must_change_password: true` |
| 409 | El email ya existe |
| 403 | Quien llama no es `ADMINISTRADOR` |

### `GET /auth/users`

200: lista de `UserRead` de la finca del administrador.

### `PATCH /auth/users/{user_id}/status`

**Solicitud**: `{ "is_active": bool }`

| Respuesta | Cuándo |
|---|---|
| 200 | `UserRead` |
| 403 | El usuario no pertenece a la finca del administrador |
| 403 `USER_SHARED_WITH_OTHER_FARMS` | El usuario también pertenece a otras fincas; el estado es global y solo lo cambia quien administra todas sus fincas |
| 409 `LAST_ADMIN` | Se intenta deshabilitar al último administrador activo de la finca |

### `POST /auth/users/farms`

Añade la finca del administrador a un usuario que ya existe en otra finca. El usuario se identifica por correo, no por `id`, para que no se puedan enumerar cuentas recorriendo identificadores.

**Solicitud**: `{ "email": str }`

| Respuesta | Cuándo |
|---|---|
| 200 | `UserRead` (solo con la finca del administrador) |
| 409 `SINGLE_FARM_ROLE` | El usuario es `OPERARIO` o `ADMINISTRADOR` |
| 404 | No existe un usuario con ese correo |

### `GET /auth/audit`

Parámetro opcional: `action`. Responde 200 con la lista de `auth_audit_log` de la finca del administrador, de la más reciente a la más antigua. Incluye `SYNC_REJECTED_AFTER_DISABLE` (FR-017).

## Rutas de verificación de permisos

Siguen el patrón existente de `/auth/test-vet-only`:

| Ruta | Permite |
|---|---|
| `GET /auth/test-vet-only` (existente) | `VETERINARIO` |
| `GET /auth/test-directive-costs` (nueva) | `DIRECTIVO` |
| `GET /auth/test-write-access` (nueva) | `OPERARIO`, `VETERINARIO` |

---

## Contrato interno de Python para otros módulos

Lo que `auth` exporta desde `app.features.auth.router` (o `app.features.auth.dependencies`, reexportado desde `router` por compatibilidad):

| Símbolo | Estado | Uso |
|---|---|---|
| `User`, `UserRole` | Existentes, se amplían | Modelos |
| `get_current_user` | Existente, sin cambios de firma | Rechaza usuarios deshabilitados y contraseña pendiente. Añade `user.active_farm_id` |
| `require_veterinario` | Existente, sin cambios | Validación clínica (FR-008) |
| `require_roles(*roles)` | Nuevo | Fábrica genérica de dependencias |
| `require_write_access` | Nuevo | Captura y registro (FR-009, FR-010) |
| `require_directive_costs` | Nuevo | Costos (FR-010, FR-015) |
| `get_current_user_for_sync` | Nuevo | Sincronización de un usuario deshabilitado (FR-017, R5) |
| `was_user_active_at(user, occurred_at, token_iat)` | Nuevo | Filtro por evento (FR-017) |
| `verify_pending_author(user, author_email, occurred_at, token_iat)` | Nuevo | Verificación de eventos capturados con la sesión vencida (FR-013, R2) |
| `record_sync_rejection(db, user, client_event_ids)` | Nuevo | Reporte al administrador (FR-017) |
