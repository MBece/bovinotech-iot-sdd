"""SQLAlchemy models for HU-05 simulated SINIGAN reconciliation.

The field records stored here are a fictional, module-scoped comparison source.
They are not an authoritative inventory and are never written by the comparison
or resolution flows.
"""

from datetime import datetime, timezone

from sqlalchemy import (
    Column,
    DateTime,
    ForeignKey,
    Integer,
    JSON,
    String,
    Text,
    UniqueConstraint,
)

from app.core.database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class FieldAnimalRecord(Base):
    __tablename__ = "field_animal_records"

    id = Column(Integer, primary_key=True, index=True)
    din = Column(String(32), unique=True, index=True, nullable=False)
    # Tenant boundary (HU-01). The DIN itself stays globally unique.
    farm_id = Column(Integer, nullable=False, index=True)
    species = Column(String(16), nullable=False)
    sex = Column(String(16), nullable=False)
    age_group = Column(String(16), nullable=False)
    sit_code = Column(String(32), nullable=False)
    establishment_name = Column(String, nullable=False)
    source = Column(String, nullable=False, default="REGISTRO_DE_CAMPO")
    updated_at = Column(
        DateTime(timezone=True), nullable=False, default=utcnow
    )


class ReconciliationTicket(Base):
    __tablename__ = "reconciliation_tickets"

    id = Column(Integer, primary_key=True, index=True)
    din = Column(String(32), index=True, nullable=False)
    # Tenant boundary inherited from the active farm of the request token.
    farm_id = Column(Integer, nullable=False, index=True)
    status = Column(String(16), nullable=False, default="OPEN")
    official_snapshot = Column(JSON, nullable=False)
    field_snapshot = Column(JSON, nullable=False)
    official_source = Column(String, nullable=False)
    field_source = Column(String, nullable=False)
    compared_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)
    created_by_email = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)
    closed_at = Column(DateTime(timezone=True), nullable=True)


class ReconciliationDiscrepancy(Base):
    __tablename__ = "reconciliation_discrepancies"
    __table_args__ = (
        UniqueConstraint(
            "ticket_id",
            "field_name",
            name="uq_ticket_field_discrepancy",
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    ticket_id = Column(
        Integer,
        ForeignKey("reconciliation_tickets.id", ondelete="RESTRICT"),
        index=True,
        nullable=False,
    )
    field_name = Column(String(32), nullable=False)
    field_value = Column(String, nullable=False)
    official_value = Column(String, nullable=False)
    official_source = Column(String, nullable=False)
    field_source = Column(String, nullable=False)
    detected_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)


class ReconciliationResolution(Base):
    __tablename__ = "reconciliation_resolutions"

    id = Column(Integer, primary_key=True, index=True)
    ticket_id = Column(
        Integer,
        ForeignKey("reconciliation_tickets.id", ondelete="RESTRICT"),
        unique=True,
        index=True,
        nullable=False,
    )
    decision = Column(String(32), nullable=False)
    reason = Column(Text, nullable=False)
    resolved_by_email = Column(String, nullable=False)
    resolved_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)
