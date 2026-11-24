from fastapi import APIRouter, Depends, Path
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.features.auth.models import User
from app.features.auth.router import get_current_user, require_veterinario
from app.features.sanitary_events.models import SanitaryEvent
from app.features.sanitary_events.schemas import (
    EventCorrectionRequest,
    EventHistoryItem,
    EventHistoryResponse,
    SanitaryCorrectionRequest,
    SanitaryEventHistoryResponse,
    SanitaryEventRead,
    SyncBatchRequest,
    SyncBatchResponse,
)
from app.features.sanitary_events.service import SanitaryEventSyncService
from app.features.sinigan.service import sinigan_service


router = APIRouter()
events_router = APIRouter()
sync_service = SanitaryEventSyncService(sinigan_service.adapter)


@router.post(
    "/batches",
    response_model=SyncBatchResponse,
    summary="Sincroniza eventos sanitarios offline de forma idempotente",
)
def sync_batch(
    batch: SyncBatchRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return {"results": sync_service.process_batch(batch, current_user, db)}


@events_router.get(
    "/by-din/{din}/history",
    response_model=EventHistoryResponse,
    summary="Consulta el historial sanitario solo-anexión por DIN",
)
def get_history_by_din(
    din: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    normalized_din = din.strip().upper()
    return {
        "din": normalized_din,
        "items": sync_service.get_history(
            normalized_din,
            db,
            getattr(current_user, "active_farm_id", None),
        ),
    }


@events_router.post(
    "/{event_id}/corrections",
    response_model=EventHistoryItem,
    status_code=201,
    summary="Agrega una corrección veterinaria sin modificar el evento original",
)
def create_correction(
    event_id: int,
    payload: EventCorrectionRequest,
    current_user: User = Depends(require_veterinario),
    db: Session = Depends(get_db),
):
    correction, version = sync_service.create_correction(
        event_id,
        payload,
        current_user,
        db,
    )
    event = (
        db.query(SanitaryEvent)
        .filter(
            SanitaryEvent.id == correction.corrected_event_id,
            SanitaryEvent.farm_id == current_user.active_farm_id,
        )
        .first()
    )
    return EventHistoryItem(
        event_id=event.id,
        correction_id=correction.id,
        client_event_id=event.client_event_id,
        din=event.din,
        version=version,
        event_type=correction.event_type,
        field_occurred_at=correction.field_occurred_at,
        received_at=correction.received_at,
        author_email=correction.author_email,
        dose=correction.dose,
        notes=correction.notes,
        reason=correction.reason,
        validation_status="CORREGIDO",
    )


@events_router.get(
    "/animals/{din}",
    response_model=SanitaryEventHistoryResponse,
    summary="Consulta el historial sanitario cronológico por DIN",
)
def get_sanitary_events_by_din(
    din: str = Path(min_length=1, max_length=32),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    normalized_din = din.strip().upper()
    items = sync_service.get_scoped_history(
        normalized_din,
        getattr(current_user, "active_farm_id", None),
        db,
    )
    return SanitaryEventHistoryResponse(
        din=normalized_din,
        items=[SanitaryEventRead.model_validate(item) for item in items],
    )


@events_router.post(
    "/{event_id}/correct",
    response_model=SanitaryEventRead,
    status_code=201,
    summary="Anexa una corrección veterinaria sin modificar el evento fuente",
)
def correct_sanitary_event(
    event_id: int,
    payload: SanitaryCorrectionRequest,
    current_user: User = Depends(require_veterinario),
    db: Session = Depends(get_db),
):
    return sync_service.create_append_only_correction(
        event_id,
        payload,
        current_user,
        db,
    )
