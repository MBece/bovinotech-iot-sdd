# Solicitud de coordinación: adopción de HU-01 en `sanitary_events` y `sinigan`

**Para**: responsable de los módulos `sanitary_events` (backend), `sanitary-events` (frontend) y `sinigan`.
**De**: HU-01 Identidad, aprovisionamiento y RBAC (`specs/001-auth-rbac/`).
**Fecha**: 2026-11-21.

## Contexto

La HU-01 amplió los roles a cuatro (`ADMINISTRADOR`, `OPERARIO`, `VETERINARIO`, `DIRECTIVO`), añadió la finca activa y definió reglas para la operación offline. El módulo `auth` ya entrega las funciones necesarias, con pruebas. La constitución (§2) impide que `auth` modifique sus módulos, así que la aplicación de estas reglas depende de ustedes.

**Nada se rompe hoy.** `User`, `get_current_user` y `require_veterinario` conservan su firma y su comportamiento, y toda la suite actual pasa. Lo que sigue es lo que falta para cumplir la spec de punta a punta.

## Qué les pedimos

| # | Cambio | Requisito | Función de `auth` |
|---|---|---|---|
| 1 | Proteger `POST /sync` con `require_write_access` (o validarlo dentro), para que `DIRECTIVO` y `ADMINISTRADOR` no registren eventos | FR-010, FR-018 | `app.features.auth.router.require_write_access` |
| 2 | Guardar como `author_email` el autor capturado en el dispositivo, no el usuario que sincroniza | FR-013b | — (el cliente debe enviar el autor en cada evento) |
| 3 | En `/sync`, usar `get_current_user_for_sync` en lugar de `get_current_user`. Para cada evento, aceptarlo solo si `was_user_active_at(user, field_occurred_at, user.token_iat)` es verdadero. Los rechazados se reportan con `record_sync_rejection(db, user, client_event_ids)` | FR-017b | `get_current_user_for_sync`, `was_user_active_at`, `record_sync_rejection` |
| 4 | En el frontend de captura, si `useAuth().captureNeedsAuthorVerification` es verdadero, marcar el evento como `author_verification: "PENDING"`. **No bloquear la captura** (constitución §5.4) | FR-013b | `useAuth()` en `features/auth/AuthContext.jsx` |
| 5 | En `/sync`, verificar los eventos marcados como pendientes con `verify_pending_author(user, author_email, field_occurred_at, user.token_iat)`. Los que no pasen se rechazan y se reportan con `record_sync_rejection` | FR-013b | `verify_pending_author` |
| 6 | Filtrar consultas y escrituras por `current_user.active_farm_id`. Hoy los eventos y animales no tienen finca: requiere añadir `farm_id` a sus tablas | FR-011 | atributo transitorio `active_farm_id` en el usuario |
| 7 | Mostrar u ocultar las vistas de captura según `useAuth().canCapture` | FR-009, FR-010, FR-018 | `useAuth()` |

## Contrato

Firmas, códigos de error y ejemplos: [contracts/auth-api.md](contracts/auth-api.md), sección "Contrato interno de Python para otros módulos". Pruebas de referencia: `backend/tests/unit/test_auth_sync_support.py`.

## Riesgo conocido

La fecha/hora de captura la pone el dispositivo. `auth` la acota por abajo con el momento del último inicio de sesión (`token_iat`), pero un usuario podría fechar un evento justo antes de su deshabilitación. Recomendamos guardar también `received_at` (ya lo hacen) para auditoría.
