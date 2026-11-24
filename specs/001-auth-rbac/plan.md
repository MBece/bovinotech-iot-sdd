# Plan Técnico de Arquitectura: HU-01 — Gestión de Identidad y Control de Acceso por Roles (RBAC)

**Módulo:** `auth`  
**Ubicación Backend:** `backend/app/features/auth/`  
**Ubicación Frontend:** `frontend/src/features/auth/`  
**Alineación:** Vertical Slicing + DevSecOps + NISTIR 8259A

---

## 1. Contratos de Datos y Esquemas Pydantic (`schemas.py`)

```python
from enum import Enum
from typing import List, Optional
from pydantic import BaseModel, EmailStr, Field

class UserRole(str, Enum):
    ADMINISTRADOR = "ADMINISTRADOR"
    OPERARIO = "OPERARIO"
    VETERINARIO = "VETERINARIO"
    DIRECTIVO = "DIRECTIVO"

class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=6, max_length=72)
    farm_id: Optional[str] = None

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: UserRole
    active_farm: str
    user_email: str
    available_farms: List[str]

class UserCreateRequest(BaseModel):
    email: EmailStr
    full_name: str
    password: str = Field(..., min_length=6, max_length=72)
    role: UserRole
    assigned_farms: List[str] = Field(default_factory=list)

class UserResponse(BaseModel):
    id: int
    email: EmailStr
    full_name: str
    role: UserRole
    assigned_farms: List[str]
    is_active: bool
```

---

## 2. Endpoints de la API (`router.py`)

* `POST /auth/login`: Autentica credenciales, valida pertenencia a la finca seleccionada y emite el JWT firmado con expiración.
* `GET /auth/me`: Retorna la identidad, rol y fincas autorizadas del token actual.
* `POST /auth/users`: Aprovisionamiento administrativo de usuarios (restringido estrictamente a `ADMINISTRADOR`).
* `GET /auth/users`: Listado de usuarios gestionados dentro de la finca del administrador.

---

## 3. Modelo de Base de Datos Aislado (`models.py`)

* Tabla `auth_users`:
  * `id` (Integer, Primary Key)
  * `email` (String, Unique, Index)
  * `hashed_password` (String)
  * `full_name` (String)
  * `role` (String: `ADMINISTRADOR`, `OPERARIO`, `VETERINARIO`, `DIRECTIVO`)
  * `assigned_farms` (JSON / Text serializado: lista de fincas autorizadas)
  * `is_active` (Boolean, default True)
  * `created_at` (DateTime, UTC)

---

## 4. Componentes Frontend (`frontend/src/features/auth/`)

* `AuthContext.jsx`: Proveedor de estado global de autenticación (`user`, `token`, `activeFarm`, `login`, `logout`), sincronizado en `localStorage` para persistencia offline.
* `LoginForm.jsx`: Formulario de inicio de sesión con selector de finca activa y manejo de credenciales institucionales.
* `RoleProtectedView.jsx`: Componente envoltorio de control de acceso según el rol autenticado.
