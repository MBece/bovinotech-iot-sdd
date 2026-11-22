"""HTTP routes for HU-05 simulated SINIGAN reconciliation."""

import re
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status as http_status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.features.auth.dependencies import (
    get_current_user,
    require_veterinario,
)
from app.features.auth.models import User
from app.features.sinigan.schemas import DIN_PATTERN
from app.features.sinigan.service import sinigan_service
from app.features.sinigan_sync.schemas import (
    ComparisonRequest,
    ComparisonResponse,
    ResolutionRequest,
    ResolutionResultResponse,
    TicketDetailResponse,
    TicketListResponse,
)
from app.features.sinigan_sync.service import SiniganSyncService

router = APIRouter()
sync_service = SiniganSyncService(sinigan_service.adapter)


@router.post(
    "/comparisons",
    response_model=ComparisonResponse,
    summary="Compara la ficha oficial simulada con el registro de campo",
)
def compare(
    payload: ComparisonRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    normalized_din = payload.din.strip().upper()
    if not re.fullmatch(DIN_PATTERN, normalized_din):
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail="DIN inválido. Use el formato DIN-DEMO-000001.",
        )
    return sync_service.compare(normalized_din, current_user, db)


@router.get(
    "/tickets",
    response_model=TicketListResponse,
    summary="Lista tickets de conciliación",
)
def list_tickets(
    status_filter: Literal["OPEN", "CLOSED"] | None = Query(
        default=None, alias="status"
    ),
    din: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return sync_service.list_tickets(
        db,
        current_user,
        status_filter=status_filter,
        din=din,
        limit=limit,
    )


@router.get(
    "/tickets/{ticket_id}",
    response_model=TicketDetailResponse,
    summary="Consulta el detalle de un ticket de conciliación",
)
def get_ticket(
    ticket_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return sync_service.get_ticket(ticket_id, current_user, db)


@router.post(
    "/tickets/{ticket_id}/resolution",
    response_model=ResolutionResultResponse,
    status_code=http_status.HTTP_201_CREATED,
    summary="Resuelve y cierra un ticket de conciliación",
)
def resolve_ticket(
    ticket_id: int,
    payload: ResolutionRequest,
    current_user: User = Depends(require_veterinario),
    db: Session = Depends(get_db),
):
    return sync_service.resolve_ticket(
        ticket_id,
        payload.decision,
        payload.reason,
        current_user,
        db,
    )
