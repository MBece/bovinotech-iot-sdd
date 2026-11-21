"""Role permission dependencies (research.md R8, FR-008..FR-010, FR-015, FR-018)."""
from fastapi import Depends, HTTPException, status

from app.features.auth.dependencies import get_current_user
from app.features.auth.models import User, UserRole


def require_roles(*roles: UserRole):
    allowed = {role.value for role in roles}

    def dependency(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role_value not in allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Acceso denegado: su rol no tiene permiso para esta operación",
            )
        return current_user

    return dependency


# Field capture and event registration (FR-009). DIRECTIVO is read-only
# (FR-010) and ADMINISTRADOR only manages accounts (FR-018).
require_write_access = require_roles(UserRole.OPERARIO, UserRole.VETERINARIO)

# Directive costs (FR-010, FR-015, FR-018).
require_directive_costs = require_roles(UserRole.DIRECTIVO)

# Account provisioning and audit (FR-005).
require_administrador = require_roles(UserRole.ADMINISTRADOR)
