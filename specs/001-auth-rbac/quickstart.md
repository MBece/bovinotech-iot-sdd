# Guía de Inicio Rápido: Autenticación y RBAC (HU-01)

Esta guía explica cómo ejecutar y verificar la funcionalidad de autenticación y control de acceso basado en roles (RBAC) en BovinoTech IoT.

## 1. Backend

### Ejecución de Pruebas
Desde el directorio del backend con el entorno virtual activo:

```bash
cd backend
.\.venv\Scripts\python.exe -m pytest tests -v
```

Resultado esperado:
- `test_login_success` (200 OK, token y rol en la respuesta)
- `test_login_invalid_credentials` (401 Unauthorized)
- `test_rbac_veterinario_only_access_denied_for_operario` (403 Forbidden para Operario)
- `test_rbac_veterinario_only_access_allowed_for_vet` (200 OK para Veterinario)
- `test_health_check` (200 OK)

### Usuarios Precargados (Seed Idempotente)

Las contraseñas de inicialización se leen de las variables de entorno `SEED_OPERARIO_PASSWORD` y `SEED_VET_PASSWORD` (con fallback a `password123` en entornos locales/desarrollo):

| Correo | Variable de Entorno | Fallback Local | Rol Asignado |
|---|---|---|---|
| `operario@bovinotech.co` | `SEED_OPERARIO_PASSWORD` | `password123` | `OPERARIO` |
| `vet@bovinotech.co` | `SEED_VET_PASSWORD` | `password123` | `VETERINARIO` |

### Variables de Entorno de Seguridad

- `ENVIRONMENT`: Si se establece en `production`, `SECRET_KEY` es obligatoria; de lo contrario el servidor aborta el inicio.
- `SECRET_KEY`: Clave criptográfica para la firma de tokens JWT.


## 2. Frontend

### Compilación y Verificación
Desde el directorio frontend:

```bash
cd frontend
npm run build
npm run lint
```

### Funcionalidad en la Interfaz
1. **Formulario de Inicio de Sesión**: Totalmente localizado en español con campos para "Correo Electrónico" y "Contraseña", y botones de acceso rápido para pruebas.
2. **Dashboard RBAC**: Muestra dinámicamente la identidad y el rol activo, permitiendo probar la ruta protegida de Veterinario (`GET /auth/test-vet-only`) con retroalimentación visual directa de autorización.
