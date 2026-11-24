from enum import Enum
from typing import List, Optional
from pydantic import BaseModel, Field


class UserRole(str, Enum):
    ADMINISTRADOR = "ADMINISTRADOR"
    OPERARIO = "OPERARIO"
    VETERINARIO = "VETERINARIO"
    DIRECTIVO = "DIRECTIVO"


class LoginRequest(BaseModel):
    email: str = Field(..., min_length=3, max_length=255)
    password: str = Field(..., min_length=1, max_length=72)
    farm_id: Optional[str] = None


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    active_farm: str
    user_email: str
    available_farms: List[str]


class UserCreateRequest(BaseModel):
    email: str = Field(..., min_length=3, max_length=255)
    full_name: str
    password: str = Field(..., min_length=6, max_length=72)
    role: UserRole
    assigned_farms: List[str] = Field(default_factory=lambda: ["FINCA-01"])


class UserResponse(BaseModel):
    id: int
    email: str
    full_name: str
    role: str
    assigned_farms: List[str]
    is_active: bool

    class Config:
        from_attributes = True
