# Investigación (Fase 0): Identidad, Aprovisionamiento y RBAC

**Spec**: [spec.md](spec.md) · **Fecha**: 2026-11-21

Cada decisión resuelve una incógnita técnica surgida al contrastar la spec actualizada con el código existente en `backend/app/features/auth/` y `frontend/src/features/auth/`.

---

## R1. Evolución del esquema `users` sin herramienta de migraciones

**Contexto**: El proyecto crea tablas con `Base.metadata.create_all`, que no añade columnas a tablas existentes. Las bases SQLite locales de los integrantes ya tienen `users` con 4 columnas.

- **Decisión**: Función idempotente `ensure_auth_schema(engine)` dentro de `features/auth/`, que inspecciona `users` y ejecuta `ALTER TABLE users ADD COLUMN ...` solo para las columnas que falten. Las tablas nuevas (`farms`, `user_farms`, `auth_audit_log`) se crean con `create_all`.
- **Justificación**: Solo toca tablas propias del módulo `auth`, no obliga a nadie a borrar su base local y no añade dependencias.
- **Alternativas descartadas**: Alembic (dependencia y configuración global fuera del módulo, desproporcionada para SQLite local). Borrar `bovinotech.db` (destruye datos de prueba de otros módulos).

## R2. Vigencia de la sesión offline (7 días)

- **Decisión**: El token de acceso pasa de 24 h a **7 días** (`ACCESS_TOKEN_EXPIRE_MINUTES = 60*24*7`, configurable por variable de entorno). El cliente decodifica `exp` del token (sin verificar firma, solo para la UI) para saber si la sesión offline está vigente. **El vencimiento no bloquea la captura** (constitución §5.4): el cliente expone `sessionExpired` y los módulos de captura marcan esos eventos como pendientes de verificación de autor. El servidor sigue verificando firma, expiración y estado del usuario en cada solicitud.
- **Verificación de eventos pendientes**: `auth` expone `verify_pending_author(user, author_email, occurred_at, token_iat) -> bool`. Es verdadero solo si `user.email == author_email`, el usuario está activo, el token de quien sincroniza es nuevo (emitido después del vencimiento de la sesión anterior, es decir, el usuario volvió a iniciar sesión con conexión) y `was_user_active_at(user, occurred_at, ...)` también es verdadero. Si es falso, el evento se rechaza y se registra con `record_sync_rejection`.
- **Justificación**: Un único mecanismo cubre en línea y fuera de línea. El riesgo de un token largo se mitiga porque el servidor consulta el estado del usuario en cada solicitud (FR-003), así que deshabilitar una cuenta tiene efecto inmediato en línea.
- **Alternativas descartadas**: Token corto + token de refresco (requiere conexión para renovar y no sirve offline). Sesión offline independiente del token (dos fuentes de verdad sobre la vigencia).

## R3. Finca activa en el token

- **Decisión**: Claims del JWT: `sub` (email), `role`, `farm_id` (finca activa), `pwd_change` (bool), `iat`, `exp`. Si el usuario tiene una sola finca, se usa esa. Si tiene varias y el login no trae `farm_id`, el servidor responde **409** con código `FARM_SELECTION_REQUIRED` y la lista de fincas; el cliente reenvía el login con `farm_id`. Cambiar de finca = cerrar sesión y volver a entrar (spec, casos de borde).
- **Justificación**: Mantiene un solo endpoint de login y el token sigue siendo autosuficiente para aplicar FR-011.
- **Alternativas descartadas**: Endpoint aparte `/auth/select-farm` con token intermedio (más estados y más superficie de ataque).

## R4. Compatibilidad con los módulos que ya dependen de `auth`

**Contexto**: `sanitary_events` y `sinigan` importan `User`, `get_current_user` y `require_veterinario`. La constitución prohíbe modificar módulos de otros integrantes.

- **Decisión**: Se conservan nombres, firmas y comportamiento de `User`, `UserRole.OPERARIO`, `UserRole.VETERINARIO`, `get_current_user` y `require_veterinario`. `get_current_user` añade en el objeto `User` devuelto el atributo transitorio `active_farm_id` (no es columna). Todo lo nuevo es aditivo: `require_roles(...)`, `require_write_access`, `require_directive_costs`, `get_current_user_for_sync`, `was_user_active_at(...)`, `record_sync_rejection(...)`.
- **Justificación**: Los módulos existentes siguen funcionando sin cambios; adoptan lo nuevo cuando su dueño lo decida.

## R5. Sincronización de un usuario deshabilitado (FR-017) y autoría offline (FR-013)

**Contexto**: `get_current_user` debe rechazar a usuarios deshabilitados (FR-003), pero FR-017 exige aceptar sus eventos capturados antes de la deshabilitación. Además, hoy `sanitary_events` asigna como autor a quien sincroniza, no a quien capturó.

- **Decisión**: `auth` expone:
  - `get_current_user_for_sync`: igual que `get_current_user`, pero acepta a un usuario deshabilitado **si el token se emitió (`iat`) antes de `disabled_at`**. Expone `user.disabled_at` para que el módulo de sincronización filtre.
  - `was_user_active_at(user, occurred_at, token_iat) -> bool`: verdadero solo si `token_iat <= occurred_at < disabled_at` (o si no está deshabilitado).
  - `record_sync_rejection(db, user, client_event_ids)`: registra el rechazo en `auth_audit_log` para que el `ADMINISTRADOR` lo consulte (`GET /auth/audit`).
- **Mitigación de manipulación de reloj**: La fecha/hora de captura la pone el dispositivo. Se acota por abajo con el `iat` del token (que firma el servidor), así que un evento no puede fecharse antes del inicio de sesión. **Riesgo residual aceptado**: un usuario podría fechar un evento justo antes de su deshabilitación; el `received_at` del servidor queda registrado para auditoría.
- **Dependencia externa**: Aplicar FR-013 y FR-017 de punta a punta requiere que el dueño de `sanitary_events` (1) use `get_current_user_for_sync` y `was_user_active_at` en `/sync`, y (2) guarde el autor capturado en el dispositivo, no el que sincroniza. **Este plan no modifica ese módulo**; queda como solicitud de coordinación (ver Seguimiento de Complejidad en [plan.md](plan.md)).

## R6. Contraseña temporal (FR-016)

- **Decisión**: Columna `must_change_password`. Si es verdadera, el login devuelve un token con `pwd_change: true`; `get_current_user` responde **403** `PASSWORD_CHANGE_REQUIRED` en cualquier ruta excepto `POST /auth/change-password` (que usa una dependencia propia). Tras el cambio se emite un token nuevo normal.
- **Justificación**: El bloqueo se aplica en el servidor en un solo punto, así que también protege las rutas de otros módulos sin tocarlas.
- **Primer inicio offline**: Sin conexión no hay login posible, así que se cumple el caso de borde sin lógica adicional.

## R7. Auditoría de escrituras (FR-012) dentro de `auth`

- **Decisión**: Tabla append-only `auth_audit_log` (`action`, `actor_user_id`, `target_user_id`, `farm_id`, `details`, `occurred_at`). Cada creación, habilitación, deshabilitación, asignación de finca, cambio de contraseña y rechazo de sincronización inserta una fila. Además, `users.created_by_id`, `created_at` y `disabled_at` para consultas directas.
- **Justificación**: Cumple la regla append-only de la constitución y da al administrador el reporte que pide FR-017.
- **Alcance**: FR-012 para eventos sanitarios ya lo cumple `sanitary_events` con `author_email` y `received_at`.

## R8. Matriz de permisos

| Operación | ADMINISTRADOR | OPERARIO | VETERINARIO | DIRECTIVO |
|---|---|---|---|---|
| Aprovisionar y gestionar usuarios de su finca | Sí | No | No | No |
| Captura y registro de eventos | No (FR-018) | Sí | Sí | No |
| Validación clínica | No | No | Sí | No |
| Costos directivos | No | No | No | Sí (lectura) |
| Inventario e historial (lectura) | No (FR-018) | Sí | Sí | Sí |

**Nota**: La restricción del `ADMINISTRADOR` a la gestión de cuentas quedó confirmada en la spec como FR-018.

- `require_write_access` deniega a `DIRECTIVO` y `ADMINISTRADOR`.
- `require_directive_costs` admite solo `DIRECTIVO`.
- Igual que en R5, la aplicación de `require_write_access` en los endpoints de captura de `sanitary_events` depende de su dueño. Hasta entonces, un `DIRECTIVO` o `ADMINISTRADOR` podría registrar eventos por `/sync`.

## R9. Frontend: estado de sesión y captura offline

- **Decisión**: `AuthContext` añade `farmId`, `farms`, `mustChangePassword`, `sessionExpiresAt` y `sessionExpired`. Componentes nuevos (en la raíz de `features/auth/`, con reexports en `components/`): `FarmSelector`, `ChangePasswordForm`, `UserAdminPanel`. `useAuth()` expone `canCapture` (verdadero si el rol puede capturar, **independientemente** del vencimiento) y `captureNeedsAuthorVerification` (verdadero si la sesión está vencida), y muestra un aviso para iniciar sesión con conexión.
- **Dependencia externa**: Marcar los eventos como pendientes (FR-013b) ocurre en `sanitary-events`; ese módulo debe consultar `captureNeedsAuthorVerification`. `App.jsx` solo recibe líneas nuevas al final (registro de `UserAdminPanel`).
