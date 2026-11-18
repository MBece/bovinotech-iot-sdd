# Plan de Implementación: Gestión de Identidad y RBAC

**Rama**: `001-auth-rbac` | **Fecha**: 2026-11-18 | **Spec**: [specs/001-auth-rbac/spec.md](spec.md)

## Resumen
Implementación de un sistema de autenticación basado en JWT (JSON Web Tokens) y Control de Acceso basado en Roles (RBAC) para distinguir entre `OPERARIO` y `VETERINARIO`. La solución abarcará desde el modelo de persistencia en SQLite hasta la interfaz de usuario en React, asegurando que las acciones críticas estén protegidas en ambos extremos.

## Contexto Técnico

**Lenguaje/Versión**: Python 3.11+, JavaScript (React)

**Dependencias Principales**: FastAPI, SQLAlchemy, Pydantic, Passlib (bcrypt), PyJWT, React Context API, Axios.

**Almacenamiento**: SQLite (vía SQLAlchemy).

**Pruebas**: pytest para el backend.

**Plataforma Objetivo**: Servicio Web / PWA (Offline-First).

**Restricciones**: Las contraseñas nunca deben almacenarse en texto plano. Los roles deben ser verificados en cada solicitud protegida.

## Verificación de Constitución

- **Aislamiento Modular**: Todo el código se ubicará en `features/auth/` tanto en backend como en frontend.
- **Idioma**: Plan en español, código (clases, variables, endpoints) en inglés.
- **Seguridad**: Uso de bcrypt para hashing y JWT para sesiones.
- **Vertical Slicing**: Implementación completa de la rodaja de autenticación.

## Estructura del Proyecto

### Backend: `backend/app/features/auth/`

- `models.py`:
    - Clase `User`: `id`, `email` (unique), `hashed_password`, `role` (Enum: OPERARIO, VETERINARIO).
- `schemas.py`:
    - `UserBase`, `UserCreate`, `UserRead`: Esquemas Pydantic para validación.
    - `Token`, `TokenData`: Esquemas para el manejo de JWT.
    - `UserLogin`: Esquema para la solicitud de inicio de sesión.
- `utils.py`:
    - Funciones `get_password_hash` y `verify_password` usando `passlib.context.CryptContext`.
    - Funciones `create_access_token` y `decode_access_token` usando `PyJWT`.
- `router.py`:
    - `POST /auth/login`: Valida credenciales y retorna el token.
    - `GET /auth/me`: Retorna la información del usuario actual (basado en el token).
    - Dependencia `get_current_user`: Extrae y valida el usuario desde el header Authorization.
- `init_db.py`: (O lógica en `main.py`)
    - Precarga de usuarios de prueba:
        - `operario@bovinotech.co` (Rol: OPERARIO)
        - `vet@bovinotech.co` (Rol: VETERINARIO)

### Frontend: `frontend/src/features/auth/`

- `services/authService.js`:
    - Función `login(email, password)`: Llamada al endpoint `/auth/login`.
- `context/AuthContext.jsx`:
    - `AuthProvider`: Maneja el estado global del usuario, el token (en localStorage/sessionStorage) y el rol.
    - Hook `useAuth`: Para acceder fácilmente al usuario y sus permisos.
- `components/LoginForm.jsx`:
    - Formulario en español con campos "Correo Electrónico" y "Contraseña".
    - Manejo de estados de carga y errores de autenticación.

## Integración en el Sistema

### Registro del Router
Se modificará `backend/app/main.py` para incluir el router de autenticación:
```python
from app.features.auth.router import router as auth_router
app.include_router(auth_router, prefix="/auth", tags=["Authentication"])
```

### Protección de Rutas (Ejemplo de uso de Roles)
En futuros módulos, la protección se aplicará mediante dependencias de FastAPI:
```python
def check_veterinarian_role(current_user: User = Depends(get_current_user)):
    if current_user.role != "VETERINARIO":
        raise HTTPException(status_code=403, detail="Acceso denegado: Se requiere rol de Veterinario")
```

## Seguimiento de Complejidad

| Violación | Por qué es necesaria | Alternativa Rechazada |
|-----------|----------------------|-----------------------|
| Ninguna | N/A | N/A |
