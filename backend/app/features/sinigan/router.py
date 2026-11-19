import re

from fastapi import APIRouter, Depends, HTTPException, status

from app.features.auth.models import User
from app.features.auth.router import get_current_user
from app.features.sinigan.schemas import (
    AnimalResponse,
    DIN_PATTERN,
    StatusResponse,
)
from app.features.sinigan.service import sinigan_service


router = APIRouter()


@router.get(
    "/status",
    response_model=StatusResponse,
    summary="Estado del adaptador SINIGAN simulado",
)
def get_status(_: User = Depends(get_current_user)):
    return sinigan_service.status()


@router.get(
    "/animals/{din}",
    response_model=AnimalResponse,
    summary="Consulta un animal simulado por DIN",
    description="Referencia académica. No constituye una consulta oficial al ICA.",
)
def get_animal(din: str, _: User = Depends(get_current_user)):
    normalized_din = din.strip().upper()
    if not re.fullmatch(DIN_PATTERN, normalized_din):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="DIN inválido. Use el formato DIN-DEMO-000001.",
        )

    result = sinigan_service.find_animal(normalized_din)
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="DIN no encontrado en las referencias disponibles.",
        )
    return result
