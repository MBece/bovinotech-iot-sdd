import enum
from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Enum as SQLEnum,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import relationship

from app.core.database import Base


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def as_utc(value: datetime | None) -> datetime | None:
    """SQLite returns naive datetimes; every timestamp in this module is UTC."""
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


class UserRole(str, enum.Enum):
    ADMINISTRADOR = "ADMINISTRADOR"
    OPERARIO = "OPERARIO"
    VETERINARIO = "VETERINARIO"
    DIRECTIVO = "DIRECTIVO"


# FR-014: these roles may be assigned to more than one farm.
MULTI_FARM_ROLES = {UserRole.VETERINARIO, UserRole.DIRECTIVO}


class AuditAction(str, enum.Enum):
    USER_CREATED = "USER_CREATED"
    USER_ENABLED = "USER_ENABLED"
    USER_DISABLED = "USER_DISABLED"
    FARM_ASSIGNED = "FARM_ASSIGNED"
    PASSWORD_CHANGED = "PASSWORD_CHANGED"
    SYNC_REJECTED_AFTER_DISABLE = "SYNC_REJECTED_AFTER_DISABLE"


class Farm(Base):
    __tablename__ = "farms"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False)


class UserFarm(Base):
    __tablename__ = "user_farms"

    user_id = Column(Integer, ForeignKey("users.id"), primary_key=True)
    farm_id = Column(Integer, ForeignKey("farms.id"), primary_key=True)
    assigned_at = Column(DateTime(timezone=True), nullable=False, default=utc_now)
    assigned_by_id = Column(Integer, nullable=True)


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    role = Column(SQLEnum(UserRole), nullable=False, default=UserRole.OPERARIO)
    full_name = Column(String, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    must_change_password = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime(timezone=True), nullable=True, default=utc_now)
    created_by_id = Column(Integer, nullable=True)
    disabled_at = Column(DateTime(timezone=True), nullable=True)

    # Read-only view: assignments are written through UserFarm so that
    # assigned_by_id and assigned_at are always recorded.
    farms = relationship(
        "Farm",
        secondary="user_farms",
        order_by="Farm.id",
        lazy="selectin",
        viewonly=True,
    )

    @property
    def farm_ids(self) -> list[int]:
        return [farm.id for farm in self.farms]

    @property
    def role_value(self) -> str:
        return self.role.value if hasattr(self.role, "value") else str(self.role)


class AuthAuditLog(Base):
    """Append-only log of every write performed by the auth module (FR-012)."""

    __tablename__ = "auth_audit_log"

    id = Column(Integer, primary_key=True, index=True)
    action = Column(String(40), nullable=False, index=True)
    actor_user_id = Column(Integer, nullable=True)
    target_user_id = Column(Integer, nullable=False, index=True)
    farm_id = Column(Integer, nullable=True, index=True)
    details = Column(Text, nullable=True)
    occurred_at = Column(DateTime(timezone=True), nullable=False, default=utc_now)
