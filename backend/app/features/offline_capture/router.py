from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.features.auth.models import User
from app.features.auth.permissions import require_write_access
from app.features.offline_capture.schemas import CatalogAnimalItem, CatalogResponse
from app.features.offline_capture.service import list_catalog

router = APIRouter()


@router.get(
    "/catalog",
    response_model=CatalogResponse,
    response_model_by_alias=True,
    summary="Catálogo de animales de la finca activa para captura sin conexión",
)
def get_catalog(
    current_user: User = Depends(require_write_access),
    db: Session = Depends(get_db),
):
    # The farm always comes from the token, never from the request (§4).
    farm_id = getattr(current_user, "active_farm_id", None)
    if farm_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="La sesión no tiene una finca activa.",
        )
    animals = list_catalog(db, farm_id)
    return CatalogResponse(
        farm_id=farm_id,
        generated_at=datetime.now(timezone.utc),
        animals=[CatalogAnimalItem(din=animal.din, name=animal.name) for animal in animals],
    )
