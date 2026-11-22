"""Authentication dependencies shared with other modules.

``get_current_user`` and ``require_veterinario`` keep the signature and
behaviour other modules rely on (research.md R4); they are re-exported from
``app.features.auth.router``.
"""
from datetime import datetime, timezone
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.features.auth.models import User, UserRole
from app.features.auth.security import decode_access_token

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")

INVALID_TOKEN_MESSAGE = "No se pudieron validar las credenciales"
PASSWORD_CHANGE_REQUIRED = "PASSWORD_CHANGE_REQUIRED"


def credentials_exception() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=INVALID_TOKEN_MESSAGE,
        headers={"WWW-Authenticate": "Bearer"},
    )


def coded_error(status_code: int, message: str, code: str, **extra) -> HTTPException:
    return HTTPException(
        status_code=status_code,
        detail={"message": message, "code": code, **extra},
    )


def password_change_required() -> HTTPException:
    return coded_error(
        status.HTTP_403_FORBIDDEN,
        "Debe cambiar su contraseña temporal antes de continuar.",
        PASSWORD_CHANGE_REQUIRED,
    )


def resolve_token_user(token: str, db: Session) -> tuple[User, dict]:
    """Validates signature, expiry and existence; does not check user state."""
    payload = decode_access_token(token)
    email: Optional[str] = payload.get("sub")
    if email is None:
        raise credentials_exception()
    user = db.query(User).filter(User.email == email).first()
    if user is None:
        raise credentials_exception()
    # Transient, non-persisted attributes for downstream modules (FR-011, FR-017).
    user.active_farm_id = payload.get("farm_id")
    iat = payload.get("iat")
    user.token_iat = (
        datetime.fromtimestamp(iat, tz=timezone.utc) if iat is not None else None
    )
    return user, payload


def get_current_user_allow_password_change(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    """Like get_current_user, but lets a temporary-password session through.

    Only POST /auth/change-password uses it (FR-016).
    """
    user, _ = resolve_token_user(token, db)
    if not user.is_active:
        raise credentials_exception()
    return user


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    user, payload = resolve_token_user(token, db)
    if not user.is_active:
        raise credentials_exception()
    if payload.get("pwd_change") or user.must_change_password:
        raise password_change_required()
    return user


def require_veterinario(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role_value != UserRole.VETERINARIO.value:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acceso denegado: Se requiere rol de Veterinario",
        )
    return current_user
