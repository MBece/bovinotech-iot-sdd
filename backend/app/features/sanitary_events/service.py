from fastapi import HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.features.auth.models import User
from app.features.sanitary_events.models import SanitaryEvent, SanitaryEventCorrection
from app.features.sanitary_events.schemas import (
    EventCorrectionRequest,
    EventHistoryItem,
    SyncBatchRequest,
    SyncItemResult,
)
from app.features.sinigan.adapter import SiniganAdapter


class SanitaryEventSyncService:
    def __init__(self, adapter: SiniganAdapter):
        self.adapter = adapter

    def process_batch(
        self,
        batch: SyncBatchRequest,
        current_user: User,
        db: Session,
    ) -> list[SyncItemResult]:
        results: list[SyncItemResult] = []

        for item in batch.items:
            client_event_id = str(item.client_event_id)
            existing = (
                db.query(SanitaryEvent)
                .filter(SanitaryEvent.client_event_id == client_event_id)
                .first()
            )
            if existing:
                results.append(
                    SyncItemResult(
                        client_event_id=item.client_event_id,
                        status="DUPLICADO",
                        event_id=existing.id,
                    )
                )
                continue

            if self.adapter.find_animal_by_din(item.din) is None:
                results.append(
                    SyncItemResult(
                        client_event_id=item.client_event_id,
                        status="FALLIDO",
                        detail="DIN no encontrado en las referencias disponibles.",
                    )
                )
                continue

            event = SanitaryEvent(
                client_event_id=client_event_id,
                din=item.din,
                event_type=item.event_type,
                field_occurred_at=item.field_occurred_at,
                author_email=current_user.email,
                product=item.product,
                dose=item.dose,
                dose_unit=item.dose_unit,
                clinical_reason=item.reason,
                finding=item.finding,
                notes=item.notes,
            )
            db.add(event)
            db.flush()
            results.append(
                SyncItemResult(
                    client_event_id=item.client_event_id,
                    status="SINCRONIZADO",
                    event_id=event.id,
                )
            )

        db.commit()
        return results

    @staticmethod
    def get_history(din: str, db: Session) -> list[EventHistoryItem]:
        events = (
            db.query(SanitaryEvent)
            .filter(SanitaryEvent.din == din.strip().upper())
            .order_by(SanitaryEvent.field_occurred_at, SanitaryEvent.id)
            .all()
        )
        history: list[EventHistoryItem] = []
        for event in events:
            history.append(
                EventHistoryItem(
                    event_id=event.id,
                    client_event_id=event.client_event_id,
                    din=event.din,
                    version=1,
                    event_type=event.event_type,
                    field_occurred_at=event.field_occurred_at,
                    received_at=event.received_at,
                    author_email=event.author_email,
                    product=event.product,
                    dose=event.dose,
                    dose_unit=event.dose_unit,
                    clinical_reason=event.clinical_reason,
                    finding=event.finding,
                    notes=event.notes,
                    validation_status=(
                        "PENDIENTE_VALIDACION"
                        if event.validation_status == "PENDING_VALIDATION"
                        else event.validation_status
                    ),
                )
            )
            corrections = (
                db.query(SanitaryEventCorrection)
                .filter(SanitaryEventCorrection.event_id == event.id)
                .order_by(SanitaryEventCorrection.version)
                .all()
            )
            history.extend(
                EventHistoryItem(
                    event_id=event.id,
                    correction_id=correction.id,
                    client_event_id=event.client_event_id,
                    din=event.din,
                    version=correction.version,
                    event_type=correction.event_type,
                    field_occurred_at=correction.field_occurred_at,
                    received_at=correction.created_at,
                    author_email=correction.author_email,
                    product=correction.product,
                    dose=correction.dose,
                    dose_unit=correction.dose_unit,
                    clinical_reason=correction.clinical_reason,
                    finding=correction.finding,
                    notes=correction.notes,
                    reason=correction.reason,
                    validation_status="CORREGIDO",
                )
                for correction in corrections
            )
        return history

    @staticmethod
    def create_correction(
        event_id: int,
        payload: EventCorrectionRequest,
        current_user: User,
        db: Session,
    ) -> SanitaryEventCorrection:
        event = db.query(SanitaryEvent).filter(SanitaryEvent.id == event_id).first()
        if event is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Evento sanitario no encontrado.",
            )

        latest_version = (
            db.query(func.max(SanitaryEventCorrection.version))
            .filter(SanitaryEventCorrection.event_id == event_id)
            .scalar()
            or 1
        )
        if payload.base_version != latest_version:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="El evento tiene una versión más reciente. Actualice el historial.",
            )

        correction = SanitaryEventCorrection(
            event_id=event.id,
            version=latest_version + 1,
            event_type=payload.event_type,
            field_occurred_at=payload.field_occurred_at,
            product=payload.product,
            dose=payload.dose,
            dose_unit=payload.dose_unit,
            clinical_reason=payload.clinical_reason,
            finding=payload.finding,
            notes=payload.notes,
            reason=payload.reason.strip(),
            author_email=current_user.email,
        )
        db.add(correction)
        db.commit()
        db.refresh(correction)
        return correction
