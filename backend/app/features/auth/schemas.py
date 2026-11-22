from datetime import datetime
from enum import Enum
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field


class UserRole(str, Enum):
    ADMINISTRADOR = "ADMINISTRADOR"
    OPERARIO = "OPERARIO"
    VETERINARIO = "VETERINARIO"
    DIRECTIVO = "DIRECTIVO"


class FarmRead(BaseModel):
    id: int
    name: str

    model_config = ConfigDict(from_attributes=True)


class UserBase(BaseModel):
    email: str
    role: UserRole = UserRole.OPERARIO


class UserCreate(UserBase):
    password: str


class UserRead(UserBase):
    id: int
    full_name: Optional[str] = None
    is_active: bool = True
    must_change_password: bool = False
    farms: list[FarmRead] = []

    model_config = ConfigDict(from_attributes=True)


class MeRead(UserRead):
    active_farm_id: Optional[int] = None


class UserCreateByAdmin(BaseModel):
    email: str = Field(pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    full_name: str = Field(min_length=1)
    role: UserRole
    temporary_password: str = Field(min_length=8)


class UserFarmAssign(BaseModel):
    email: str = Field(min_length=3)


class UserStatusUpdate(BaseModel):
    is_active: bool


class PasswordChange(BaseModel):
    current_password: str
    # Length is validated by the service to answer 400 with a clear message.
    new_password: str


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    farm_id: Optional[int] = None
    must_change_password: bool = False
    expires_at: Optional[datetime] = None


class TokenData(BaseModel):
    email: Optional[str] = None
    role: Optional[str] = None


class UserLogin(BaseModel):
    username: Optional[str] = None
    email: Optional[str] = None
    password: str
    farm_id: Optional[int] = None


class AuditLogRead(BaseModel):
    id: int
    action: str
    actor_user_id: Optional[int] = None
    target_user_id: int
    farm_id: Optional[int] = None
    details: Optional[str] = None
    occurred_at: datetime

    model_config = ConfigDict(from_attributes=True)
