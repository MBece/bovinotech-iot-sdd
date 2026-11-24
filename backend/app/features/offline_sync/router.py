from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.features.auth.models import User, UserRole
from app.features.auth.sync_support import get_current_user_for_sync
from app.features.offline_sync.schemas import SyncBatchRequest, SyncBatchResponse
from app.features.offline_sync.service import process_batch

router = APIRouter()

CAPTURE_ROLES = {UserRole.OPERARIO.value, UserRole.VETERINARIO.value}


@router.post(
    "/batches",
    response_model=SyncBatchResponse,
    response_model_by_alias=True,
    summary="Sincroniza por lotes eventos capturados sin conexión, de forma idempotente",
)
def sync_batches(
    request: SyncBatchRequest,
    current_user: User = Depends(get_current_user_for_sync),
    db: Session = Depends(get_db),
):
    if current_user.role_value not in CAPTURE_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acceso denegado: su rol no tiene permiso para esta operación",
        )
    return process_batch(request, current_user, db)
