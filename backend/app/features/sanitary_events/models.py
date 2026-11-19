from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint

from app.core.database import Base


class SanitaryEvent(Base):
    __tablename__ = "sanitary_events"

    id = Column(Integer, primary_key=True, index=True)
    client_event_id = Column(String(36), unique=True, index=True, nullable=False)
    din = Column(String(32), index=True, nullable=False)
    event_type = Column(String(32), nullable=False)
    field_occurred_at = Column(DateTime(timezone=True), nullable=False)
    received_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    author_email = Column(String, nullable=False)
    dose = Column(Float, nullable=True)
    notes = Column(Text, nullable=True)
    validation_status = Column(String(32), nullable=False, default="PENDING_VALIDATION")


class SanitaryEventCorrection(Base):
    __tablename__ = "sanitary_event_corrections"
    __table_args__ = (
        UniqueConstraint("event_id", "version", name="uq_event_correction_version"),
    )

    id = Column(Integer, primary_key=True, index=True)
    event_id = Column(
        Integer,
        ForeignKey("sanitary_events.id", ondelete="RESTRICT"),
        index=True,
        nullable=False,
    )
    version = Column(Integer, nullable=False)
    event_type = Column(String(32), nullable=False)
    field_occurred_at = Column(DateTime(timezone=True), nullable=False)
    dose = Column(Float, nullable=True)
    notes = Column(Text, nullable=True)
    reason = Column(Text, nullable=False)
    author_email = Column(String, nullable=False)
    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
