import hashlib
import hmac

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.features.auth.dependencies import get_current_user
from app.features.auth.models import User, UserRole
from app.features.telemetry.models import TelemetryDevice


def credential_hash(secret: str) -> str:
    return hashlib.sha256(secret.encode("utf-8")).hexdigest()


def get_current_device(
    x_device_id: str = Header(...),
    x_device_token: str = Header(...),
    db: Session = Depends(get_db),
) -> TelemetryDevice:
    device = db.query(TelemetryDevice).filter(TelemetryDevice.id == x_device_id).first()
    if not device or not device.is_active or not hmac.compare_digest(device.credential_hash, credential_hash(x_device_token)):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Dispositivo no autorizado")
    return device


def require_farm(user: User = Depends(get_current_user)) -> User:
    if getattr(user, "active_farm_id", None) is None:
        raise HTTPException(status_code=403, detail="Se requiere una finca activa")
    return user


def require_alert_writer(user: User = Depends(require_farm)) -> User:
    if user.role_value not in {UserRole.OPERARIO.value, UserRole.VETERINARIO.value}:
        raise HTTPException(status_code=403, detail="No tiene permiso para cerrar alertas")
    return user


def require_admin(user: User = Depends(require_farm)) -> User:
    if user.role_value != UserRole.ADMINISTRADOR.value:
        raise HTTPException(status_code=403, detail="Se requiere rol Administrador")
    return user

