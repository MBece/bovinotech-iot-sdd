from datetime import datetime, timezone
from uuid import uuid4

from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.features.auth.models import User
from app.features.sanitary_events.models import SanitaryEvent, SanitaryEventCorrection
from app.features.sanitary_events.schemas import (
    EventCorrectionRequest,
    EventHistoryItem,
    SanitaryCorrectionRequest,
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
        farm_id = getattr(current_user, "active_farm_id", None)
        if farm_id is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Se requiere una finca activa para sincronizar eventos.",
            )

        results: list[SyncItemResult] = []

        for item in batch.items:
            client_event_id = str(item.client_event_id)
            existing = (
                db.query(SanitaryEvent)
                .filter(
                    SanitaryEvent.client_event_id == client_event_id,
                    SanitaryEvent.farm_id == farm_id,
                )
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

            if (
                db.query(SanitaryEvent.id)
                .filter(SanitaryEvent.client_event_id == client_event_id)
                .first()
                is not None
            ):
                results.append(
                    SyncItemResult(
                        client_event_id=item.client_event_id,
                        status="RECHAZADO",
                        detail="El client_event_id ya está asociado a otro registro.",
                    )
                )
                continue

            if self.adapter.find_animal_by_din(item.din) is None:
                results.append(
                    SyncItemResult(
                        client_event_id=item.client_event_id,
                        status="RECHAZADO",
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
                farm_id=farm_id,
                dose=item.dose,
                notes=item.notes,
            )
            db.add(event)
            db.flush()
            results.append(
                SyncItemResult(
                    client_event_id=item.client_event_id,
                    status="CREADO",
                    event_id=event.id,
                )
            )

        db.commit()
        return results

    @staticmethod
    def get_history(
        din: str,
        db: Session,
        farm_id: int | None,
    ) -> list[EventHistoryItem]:
        if farm_id is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Se requiere una finca activa para consultar el historial.",
            )

        events = (
            db.query(SanitaryEvent)
            .filter(
                SanitaryEvent.din == din.strip().upper(),
                SanitaryEvent.farm_id == farm_id,
            )
            .order_by(SanitaryEvent.field_occurred_at, SanitaryEvent.id)
            .all()
        )
        events_by_id = {event.id: event for event in events}
        children_by_parent: dict[int, list[SanitaryEvent]] = {}
        for event in events:
            if event.corrected_event_id in events_by_id:
                children_by_parent.setdefault(event.corrected_event_id, []).append(event)

        history: list[EventHistoryItem] = []
        roots = [event for event in events if event.corrected_event_id is None]
        for event in roots:
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
                    dose=event.dose,
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
                    dose=correction.dose,
                    notes=correction.notes,
                    reason=correction.reason,
                    validation_status="CORREGIDO",
                )
                for correction in corrections
            )

            next_version = max(
                (correction.version for correction in corrections),
                default=1,
            ) + 1
            descendants = []
            pending = list(children_by_parent.get(event.id, []))
            while pending:
                descendant = pending.pop()
                descendants.append(descendant)
                pending.extend(children_by_parent.get(descendant.id, []))

            descendants.sort(
                key=lambda item: (
                    SanitaryEventSyncService._as_utc(item.received_at),
                    item.id,
                )
            )
            history.extend(
                EventHistoryItem(
                    event_id=event.id,
                    correction_id=correction.id,
                    client_event_id=event.client_event_id,
                    din=event.din,
                    version=next_version + index,
                    event_type=correction.event_type,
                    field_occurred_at=correction.field_occurred_at,
                    received_at=correction.received_at,
                    author_email=correction.author_email,
                    dose=correction.dose,
                    notes=correction.notes,
                    reason=correction.reason,
                    validation_status="CORREGIDO",
                )
                for index, correction in enumerate(descendants)
            )
        return history

    @staticmethod
    def create_correction(
        event_id: int,
        payload: EventCorrectionRequest,
        current_user: User,
        db: Session,
    ) -> tuple[SanitaryEvent, int]:
        farm_id = getattr(current_user, "active_farm_id", None)
        if farm_id is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Se requiere una finca activa para corregir eventos.",
            )

        event = (
            db.query(SanitaryEvent)
            .filter(
                SanitaryEvent.id == event_id,
                SanitaryEvent.farm_id == farm_id,
            )
            .first()
        )
        if event is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Evento sanitario no encontrado en la finca activa.",
            )

        root = event
        while root.corrected_event_id is not None:
            parent = (
                db.query(SanitaryEvent)
                .filter(
                    SanitaryEvent.id == root.corrected_event_id,
                    SanitaryEvent.farm_id == farm_id,
                )
                .first()
            )
            if parent is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Evento sanitario no encontrado en la finca activa.",
                )
            root = parent

        history = SanitaryEventSyncService.get_history(root.din, db, farm_id)
        latest_version = max(
            item.version for item in history if item.event_id == root.id
        )
        if payload.base_version != latest_version:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="El evento tiene una versión más reciente. Actualice el historial.",
            )

        correction_payload = SanitaryCorrectionRequest(
            client_event_id=uuid4(),
            event_type=payload.event_type,
            field_occurred_at=payload.field_occurred_at,
            dose=payload.dose,
            notes=payload.notes,
            reason=payload.reason,
            withdrawal_until=event.withdrawal_until,
        )
        correction = SanitaryEventSyncService.create_append_only_correction(
            event_id,
            correction_payload,
            current_user,
            db,
        )
        return correction, latest_version + 1

    @staticmethod
    def get_scoped_history(
        din: str,
        farm_id: int | None,
        db: Session,
    ) -> list[SanitaryEvent]:
        if farm_id is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Se requiere una finca activa para consultar el historial.",
            )
        return (
            db.query(SanitaryEvent)
            .filter(
                SanitaryEvent.din == din.strip().upper(),
                SanitaryEvent.farm_id == farm_id,
            )
            .order_by(SanitaryEvent.field_occurred_at, SanitaryEvent.id)
            .all()
        )

    @staticmethod
    def create_append_only_correction(
        event_id: int,
        payload: SanitaryCorrectionRequest,
        current_user: User,
        db: Session,
    ) -> SanitaryEvent:
        farm_id = getattr(current_user, "active_farm_id", None)
        if farm_id is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Se requiere una finca activa para corregir eventos.",
            )

        source = (
            db.query(SanitaryEvent)
            .filter(
                SanitaryEvent.id == event_id,
                SanitaryEvent.farm_id == farm_id,
            )
            .first()
        )
        if source is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Evento sanitario no encontrado en la finca activa.",
            )

        client_event_id = str(payload.client_event_id)
        existing = (
            db.query(SanitaryEvent)
            .filter(SanitaryEvent.client_event_id == client_event_id)
            .first()
        )
        if existing is not None:
            if SanitaryEventSyncService._matches_correction(
                existing, source, payload, current_user, farm_id
            ):
                return existing
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="El client_event_id ya fue utilizado con otro contenido.",
            )

        correction = SanitaryEvent(
            client_event_id=client_event_id,
            din=source.din,
            event_type=payload.event_type,
            field_occurred_at=payload.field_occurred_at,
            received_at=datetime.now(timezone.utc),
            author_email=current_user.email,
            dose=payload.dose,
            notes=payload.notes,
            validation_status="CORRECTION",
            farm_id=farm_id,
            corrected_event_id=source.id,
            reason=payload.reason,
            withdrawal_until=payload.withdrawal_until,
        )
        db.add(correction)
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            existing = (
                db.query(SanitaryEvent)
                .filter(SanitaryEvent.client_event_id == client_event_id)
                .first()
            )
            if existing is not None and SanitaryEventSyncService._matches_correction(
                existing, source, payload, current_user, farm_id
            ):
                return existing
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="El client_event_id ya fue utilizado con otro contenido.",
            )
        db.refresh(correction)
        return correction

    @staticmethod
    def _matches_correction(
        existing: SanitaryEvent,
        source: SanitaryEvent,
        payload: SanitaryCorrectionRequest,
        current_user: User,
        farm_id: int,
    ) -> bool:
        return (
            existing.corrected_event_id == source.id
            and existing.din == source.din
            and existing.farm_id == farm_id
            and existing.event_type == payload.event_type
            and SanitaryEventSyncService._as_utc(existing.field_occurred_at)
            == SanitaryEventSyncService._as_utc(payload.field_occurred_at)
            and existing.dose == payload.dose
            and existing.notes == payload.notes
            and existing.reason == payload.reason
            and existing.author_email == current_user.email
            and (
                existing.withdrawal_until is None
                and payload.withdrawal_until is None
                or existing.withdrawal_until is not None
                and payload.withdrawal_until is not None
                and SanitaryEventSyncService._as_utc(existing.withdrawal_until)
                == SanitaryEventSyncService._as_utc(payload.withdrawal_until)
            )
        )

    @staticmethod
    def _as_utc(value: datetime) -> datetime:
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)
