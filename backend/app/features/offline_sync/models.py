"""Server-side tables of the batch sync (HU-03 data-model.md).

Insert-only by design (constitution §3): no code path in this module updates
or deletes ``offline_sync_events``. No foreign keys against other user stories
(constitution §2).
"""
from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, DateTime, Float, Index, Integer, String, Text

from app.core.database import Base


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class OfflineSyncEvent(Base):
    """Single immutable copy of each synced CapturedEvent."""

    __tablename__ = "offline_sync_events"
    __table_args__ = (
        Index("ix_offline_sync_events_farm_din_time", "farm_id", "din", "field_occurred_at"),
    )

    id = Column(Integer, primary_key=True, index=True)
    client_event_id = Column(String(36), unique=True, index=True, nullable=False)
    payload_hash = Column(String(64), nullable=False)
    event_type = Column(String(16), nullable=False)
    din = Column(String(32), index=True, nullable=False)
    field_occurred_at = Column(DateTime(timezone=True), nullable=False)
    received_at = Column(DateTime(timezone=True), nullable=False, default=utc_now)
    product = Column(String(120), nullable=True)
    dose_quantity = Column(Float, nullable=True)
    dose_unit = Column(String(16), nullable=True)
    reason = Column(Text, nullable=True)
    finding = Column(Text, nullable=True)
    notes = Column(Text, nullable=True)
    author_email = Column(String, index=True, nullable=False)
    farm_id = Column(Integer, index=True, nullable=False)
    origin = Column(String(16), nullable=False)
    validation_status = Column(String(32), nullable=False)
    author_verification_pending = Column(Boolean, nullable=False, default=False)
    author_verification_result = Column(String(16), nullable=True)
    requires_timestamp_review = Column(Boolean, nullable=False, default=False)
    # Set by the server, never by the client: LEGACY events skip the FR-015
    # required-field rules, so HU-04 must review their data (QA-01).
    requires_data_review = Column(Boolean, nullable=False, default=False)
    batch_log_id = Column(Integer, index=True, nullable=True)


class OfflineSyncIdConflict(Base):
    """Audit of a client_event_id reused with different content (FR-013)."""

    __tablename__ = "offline_sync_id_conflicts"

    id = Column(Integer, primary_key=True, index=True)
    client_event_id = Column(String(36), index=True, nullable=False)
    existing_event_id = Column(Integer, nullable=False)
    existing_payload_hash = Column(String(64), nullable=False)
    received_payload_hash = Column(String(64), nullable=False)
    received_payload = Column(Text, nullable=False)
    sender_email = Column(String, nullable=False)
    detected_at = Column(DateTime(timezone=True), nullable=False, default=utc_now)


class OfflineSyncBatchLog(Base):
    """One row per POST /offline-sync/batches request (FR-029)."""

    __tablename__ = "offline_sync_batch_log"

    id = Column(Integer, primary_key=True, index=True)
    user_email = Column(String, index=True, nullable=False)
    active_farm_id = Column(Integer, nullable=True)
    received_at = Column(DateTime(timezone=True), nullable=False, default=utc_now)
    duration_ms = Column(Integer, nullable=False, default=0)
    items_total = Column(Integer, nullable=False, default=0)
    synced_count = Column(Integer, nullable=False, default=0)
    duplicate_count = Column(Integer, nullable=False, default=0)
    failed_retryable_count = Column(Integer, nullable=False, default=0)
    failed_final_count = Column(Integer, nullable=False, default=0)
