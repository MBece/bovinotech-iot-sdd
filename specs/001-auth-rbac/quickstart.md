# Guía de Validación: Identidad, Aprovisionamiento y RBAC (HU-01)

Cómo comprobar de punta a punta que la HU-01 funciona. Los detalles de endpoints están en [contracts/auth-api.md](contracts/auth-api.md) y los de datos en [data-model.md](data-model.md).

## 1. Requisitos previos

- Backend: entorno virtual con `backend/requirements.txt` instalado.
- Frontend: `npm install` en `frontend/`.
- Variables de entorno opcionales (en local hay fallback a `password123`):

| Variable | Uso |
|---|---|
| `SECRET_KEY` | Firma de JWT. Obligatoria si `ENVIRONMENT=production` |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Por defecto 10080 (7 días) |
| `SEED_ADMIN_PASSWORD`, `SEED_OPERARIO_PASSWORD`, `SEED_VET_PASSWORD`, `SEED_DIRECTIVO_PASSWORD` | Contraseñas del seed |

Una base `bovinotech.db` existente **no** hace falta borrarla: al arrancar, `ensure_auth_schema` añade las columnas que falten.

## 2. Pruebas automatizadas

```bash
cd backend
python -m pytest tests -v
```

Deben pasar las pruebas existentes (`test_auth.py`, `sanitary_events`, `sinigan`) y las nuevas:

| Archivo | Cubre |
|---|---|
| `contract/test_auth_login_api.py` | Escenarios 1, 2 y 8; FR-001 a FR-004 |
| `contract/test_auth_provisioning_api.py` | Escenarios 6, 7 y 9; FR-005, FR-006, FR-014; auditoría |
| `unit/test_auth_permissions.py` | Escenarios 3, 10 y 11; FR-008 a FR-011, FR-015 |
| `security/test_auth_password_policy.py` | Escenario 12; FR-016 |
| `unit/test_auth_sync_support.py` | Escenario 13; FR-017 (funciones de `auth`) |
| `unit/test_auth_schema_migration.py` | Base antigua → esquema nuevo, idempotente |

```bash
cd frontend
npm run build
npm run lint
```

## 3. Validación manual

Con el backend (`uvicorn app.main:app --reload`) y el frontend (`npm run dev`) en marcha:

1. **Administrador aprovisiona**: entrar como `admin@bovinotech.co`, crear `nuevo@bovinotech.co` con rol `OPERARIO` y contraseña temporal. Resultado esperado: aparece en la lista con estado "Pendiente de cambio de contraseña".
2. **Primer inicio de sesión**: entrar como `nuevo@bovinotech.co`. Resultado esperado: se pide la contraseña nueva; si se repite la temporal, se rechaza; tras cambiarla, se accede.
3. **Autorregistro**: `POST /auth/register`. Resultado esperado: 403 con el mensaje de aprovisionamiento administrativo.
4. **Varias fincas**: entrar como `vet2@bovinotech.co`. Resultado esperado: se pide elegir finca; `GET /auth/me` muestra `active_farm_id` igual a la elegida.
5. **Permisos**:

| Usuario | Ruta | Respuesta esperada |
|---|---|---|
| operario | `/auth/test-vet-only` | 403 |
| operario | `/auth/test-directive-costs` | 403 |
| directivo | `/auth/test-directive-costs` | 200 |
| directivo | `/auth/test-write-access` | 403 |
| admin | `/auth/test-directive-costs` | 403 |

6. **Deshabilitar**: el administrador deshabilita a `nuevo@bovinotech.co`. Resultado esperado: su token deja de funcionar (401) y el login responde 401 con el mismo mensaje que con credenciales inválidas. Intentar deshabilitar al único administrador responde 409.
7. **Sesión offline**: con DevTools en modo "Offline", la sesión sigue activa y `canCapture` es verdadero. Si se adelanta el reloj del sistema más de 7 días, `canCapture` **sigue siendo verdadero**, `captureNeedsAuthorVerification` pasa a verdadero y la UI muestra el aviso de iniciar sesión con conexión.

## 4. Limitaciones conocidas

Ver "Seguimiento de Complejidad" en [plan.md](plan.md). Mientras `sanitary_events` no adopte las funciones nuevas de `auth`:

- `/sync` sigue asignando como autor a quien sincroniza.
- `/sync` no aplica la regla de usuario deshabilitado (FR-017).
- `/sync` no impide que `DIRECTIVO` o `ADMINISTRADOR` registren eventos.
- La captura no marca como "pendientes de verificación de autor" los eventos capturados con la sesión vencida, y `/sync` no los verifica (FR-013b).
