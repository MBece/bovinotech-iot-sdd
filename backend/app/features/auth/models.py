import enum
from sqlalchemy import Column, Integer, String, Enum as SQLEnum
from app.core.database import Base


class UserRole(str, enum.Enum):
    OPERARIO = "OPERARIO"
    VETERINARIO = "VETERINARIO"


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    role = Column(SQLEnum(UserRole), nullable=False, default=UserRole.OPERARIO)
