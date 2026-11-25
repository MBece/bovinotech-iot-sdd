"""Persistence of the batch sync (research R2, R3).

Insert-only: there is no method to modify or remove a synced event. Each
insert runs inside its own savepoint, so a failing event never rolls back the
rest of the batch (FR-014).
"""
import json
from datetime import datetime

from sqlalchemy.orm import Session

from app.features.offline_sync.models import (
    OfflineSyncBatchLog,
    OfflineSyncEvent,
    OfflineSyncIdConflict,
)
from app.features.sanitary_events.models import SanitaryEvent


class OfflineSyncRepository:
    def __init__(self, db: Session):
        self.db = db

    def insert_event(self, **values) -> OfflineSyncEvent:
        """Raises IntegrityError when client_event_id already exists."""
        with self.db.begin_nested():
            row = OfflineSyncEvent(**values)
            self.db.add(row)
            self.db.flush()
        return row

    def find_by_client_event_id(self, client_event_id: str) -> OfflineSyncEvent | None:
        return (
            self.db.query(OfflineSyncEvent)
            .filter(OfflineSyncEvent.client_event_id == client_event_id)
            .first()
        )

    def find_preliminary(self, client_event_id: str) -> SanitaryEvent | None:
        """Read-only lookup in the preliminary /sync table of sanitary_events (R2)."""
        return (
            self.db.query(SanitaryEvent)
            .filter(SanitaryEvent.client_event_id == client_event_id)
            .first()
        )

    def add_conflict(
        self,
        existing: OfflineSyncEvent,
        received_hash: str,
        received_payload: dict,
        sender_email: str,
        detected_at: datetime,
    ) -> None:
        with self.db.begin_nested():
            self.db.add(
                OfflineSyncIdConflict(
                    client_event_id=existing.client_event_id,
                    existing_event_id=existing.id,
                    existing_payload_hash=existing.payload_hash,
                    received_payload_hash=received_hash,
                    received_payload=json.dumps(received_payload, default=str, ensure_ascii=False),
                    sender_email=sender_email,
                    detected_at=detected_at,
                )
            )
            self.db.flush()

    def create_batch_log(
        self, user_email: str, active_farm_id: int | None, received_at: datetime, items_total: int
    ) -> OfflineSyncBatchLog:
        log = OfflineSyncBatchLog(
            user_email=user_email,
            active_farm_id=active_farm_id,
            received_at=received_at,
            items_total=items_total,
        )
        self.db.add(log)
        self.db.flush()
        return log
