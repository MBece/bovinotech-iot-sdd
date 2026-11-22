"""Business rules for identity, provisioning and auditing (HU-01)."""
import json
from datetime import datetime, timezone
from typing import Iterable, Optional

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.features.auth.dependencies import coded_error
from app.features.auth.models import (
    MULTI_FARM_ROLES,
    AuditAction,
    AuthAuditLog,
    Farm,
    User,
    UserFarm,
    UserRole,
    utc_now,
)
from app.features.auth.schemas import UserCreateByAdmin
from app.features.auth.security import (
    create_access_token,
    decode_access_token,
    get_password_hash,
    verify_password,
)

MIN_PASSWORD_LENGTH = 8


# --- Tokens -----------------------------------------------------------------


def issue_token(user: User, farm_id: Optional[int]) -> dict:
    """Builds the login/change-password response (contracts/auth-api.md)."""
    must_change = bool(user.must_change_password)
    token = create_access_token(
        {
            "sub": user.email,
            "role": user.role_value,
            "farm_id": farm_id,
            "pwd_change": must_change,
        }
    )
    expires_at = datetime.fromtimestamp(decode_access_token(token)["exp"], tz=timezone.utc)
    return {
        "access_token": token,
        "token_type": "bearer",
        "role": user.role_value,
        "farm_id": farm_id,
        "must_change_password": must_change,
        "expires_at": expires_at,
    }


def resolve_login_farm(user: User, requested_farm_id: Optional[int]) -> int:
    """Picks the active farm for a login (FR-002, US1/AC8)."""
    farms = list(user.farms)
    farm_ids = [farm.id for farm in farms]
    if requested_farm_id is not None:
        if requested_farm_id not in farm_ids:
            raise coded_error(
                status.HTTP_403_FORBIDDEN,
                "La finca seleccionada no está asignada a su cuenta.",
                "FARM_NOT_ASSIGNED",
            )
        return requested_farm_id
    if len(farms) == 1:
        return farms[0].id
    if not farms:
        raise coded_error(
            status.HTTP_403_FORBIDDEN,
            "Su cuenta no tiene una finca asignada. Contacte al administrador.",
            "NO_FARM_ASSIGNED",
        )
    raise coded_error(
        status.HTTP_409_CONFLICT,
        "Seleccione la finca con la que desea operar.",
        "FARM_SELECTION_REQUIRED",
        farms=[{"id": farm.id, "name": farm.name} for farm in farms],
    )


def admin_farm_id(admin: User) -> int:
    """An ADMINISTRADOR has exactly one farm (FR-014)."""
    if admin.active_farm_id is not None:
        return admin.active_farm_id
    if not admin.farm_ids:
        raise coded_error(
            status.HTTP_403_FORBIDDEN,
            "Su cuenta no tiene una finca asignada.",
            "NO_FARM_ASSIGNED",
        )
    return admin.farm_ids[0]


# --- Audit (append-only, FR-012) ---------------------------------------------


def audit(
    db: Session,
    action: AuditAction,
    target_user_id: int,
    farm_id: Optional[int],
    actor_user_id: Optional[int] = None,
    details: Optional[dict] = None,
) -> None:
    db.add(
        AuthAuditLog(
            action=action.value,
            actor_user_id=actor_user_id,
            target_user_id=target_user_id,
            farm_id=farm_id,
            details=json.dumps(details, ensure_ascii=False) if details else None,
            occurred_at=utc_now(),
        )
    )


def list_audit(db: Session, farm_id: int, action: Optional[str] = None) -> list[AuthAuditLog]:
    query = db.query(AuthAuditLog).filter(AuthAuditLog.farm_id == farm_id)
    if action:
        query = query.filter(AuthAuditLog.action == action)
    return query.order_by(AuthAuditLog.id.desc()).all()


# --- Provisioning (FR-005, FR-006, FR-014, FR-016) ---------------------------


def _users_of_farm(db: Session, farm_id: int):
    return (
        db.query(User)
        .join(UserFarm, UserFarm.user_id == User.id)
        .filter(UserFarm.farm_id == farm_id)
    )


def _user_in_farm(db: Session, user_id: int, farm_id: int) -> User:
    user = _users_of_farm(db, farm_id).filter(User.id == user_id).first()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acceso denegado: el usuario no pertenece a su finca",
        )
    return user


def _assign_farm(db: Session, user: User, farm_id: int, assigned_by_id: Optional[int]) -> None:
    db.add(UserFarm(user_id=user.id, farm_id=farm_id, assigned_by_id=assigned_by_id))


def list_users(db: Session, farm_id: int) -> list[User]:
    return _users_of_farm(db, farm_id).order_by(User.id).all()


def create_user(db: Session, admin: User, data: UserCreateByAdmin) -> User:
    farm_id = admin_farm_id(admin)
    email = data.email.strip().lower()
    if db.query(User).filter(User.email == email).first():
        raise coded_error(
            status.HTTP_409_CONFLICT,
            "Ya existe una cuenta con ese correo.",
            "EMAIL_ALREADY_EXISTS",
        )
    user = User(
        email=email,
        full_name=data.full_name.strip(),
        hashed_password=get_password_hash(data.temporary_password),
        role=UserRole(data.role.value),
        is_active=True,
        must_change_password=True,
        created_at=utc_now(),
        created_by_id=admin.id,
    )
    db.add(user)
    db.flush()
    _assign_farm(db, user, farm_id, admin.id)
    audit(
        db,
        AuditAction.USER_CREATED,
        user.id,
        farm_id,
        actor_user_id=admin.id,
        details={"role": user.role_value},
    )
    db.commit()
    db.refresh(user)
    return user


def _active_admins_of_farm(db: Session, farm_id: int) -> int:
    return (
        _users_of_farm(db, farm_id)
        .filter(User.role == UserRole.ADMINISTRADOR, User.is_active.is_(True))
        .count()
    )


def set_user_status(db: Session, admin: User, user_id: int, is_active: bool) -> User:
    farm_id = admin_farm_id(admin)
    user = _user_in_farm(db, user_id, farm_id)
    # The account state is global: an administrator may only change it when
    # every farm of the user is the administrator's own farm (FR-005).
    if set(user.farm_ids) != {farm_id}:
        raise coded_error(
            status.HTTP_403_FORBIDDEN,
            "El usuario también pertenece a otras fincas; su estado solo puede cambiarse "
            "cuando todas sus fincas son administradas por usted.",
            "USER_SHARED_WITH_OTHER_FARMS",
        )
    if user.is_active == is_active:
        return user
    if (
        not is_active
        and user.role_value == UserRole.ADMINISTRADOR.value
        and _active_admins_of_farm(db, farm_id) <= 1
    ):
        raise coded_error(
            status.HTTP_409_CONFLICT,
            "No se puede deshabilitar al último administrador activo de la finca.",
            "LAST_ADMIN",
        )
    user.is_active = is_active
    user.disabled_at = None if is_active else utc_now()
    audit(
        db,
        AuditAction.USER_ENABLED if is_active else AuditAction.USER_DISABLED,
        user.id,
        farm_id,
        actor_user_id=admin.id,
    )
    db.commit()
    db.refresh(user)
    return user


def add_admin_farm_to_user(db: Session, admin: User, email: str) -> User:
    """Adds the administrator's farm to an existing multi-farm user.

    The user is identified by email (not by id) so that sequential ids cannot
    be used to enumerate accounts of other farms.
    """
    farm_id = admin_farm_id(admin)
    user = db.query(User).filter(User.email == email.strip().lower()).first()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario no encontrado")
    if farm_id in user.farm_ids:
        return user
    if UserRole(user.role_value) not in MULTI_FARM_ROLES:
        raise coded_error(
            status.HTTP_409_CONFLICT,
            "Este rol solo puede tener una finca asignada.",
            "SINGLE_FARM_ROLE",
        )
    _assign_farm(db, user, farm_id, admin.id)
    audit(db, AuditAction.FARM_ASSIGNED, user.id, farm_id, actor_user_id=admin.id)
    db.commit()
    db.expire(user)
    db.refresh(user)
    return user


def change_password(db: Session, user: User, current_password: str, new_password: str) -> User:
    if not verify_password(current_password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="La contraseña actual es incorrecta",
        )
    if len(new_password) < MIN_PASSWORD_LENGTH:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"La contraseña nueva debe tener al menos {MIN_PASSWORD_LENGTH} caracteres",
        )
    if new_password == current_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La contraseña nueva debe ser distinta de la actual",
        )
    user.hashed_password = get_password_hash(new_password)
    user.must_change_password = False
    farm_id = getattr(user, "active_farm_id", None)
    audit(db, AuditAction.PASSWORD_CHANGED, user.id, farm_id, actor_user_id=user.id)
    db.commit()
    db.refresh(user)
    return user


def ensure_farms(db: Session, farms: Iterable[tuple[int, str]]) -> None:
    for farm_id, name in farms:
        if db.get(Farm, farm_id) is None:
            db.add(Farm(id=farm_id, name=name))
    db.flush()
