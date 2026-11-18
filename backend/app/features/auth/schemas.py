from enum import Enum
from typing import Optional
from pydantic import BaseModel, ConfigDict


class UserRole(str, Enum):
    OPERARIO = "OPERARIO"
    VETERINARIO = "VETERINARIO"


class UserBase(BaseModel):
    email: str
    role: UserRole = UserRole.OPERARIO


class UserCreate(UserBase):
    password: str


class UserRead(UserBase):
    id: int

    model_config = ConfigDict(from_attributes=True)


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str


class TokenData(BaseModel):
    email: Optional[str] = None
    role: Optional[str] = None


class UserLogin(BaseModel):
    username: Optional[str] = None
    email: Optional[str] = None
    password: str
