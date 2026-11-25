from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import Boolean, Column, DateTime, Integer, Numeric, String, Text, UniqueConstraint

from app.core.database import Base


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class ProductivityWeighing(Base):
    __tablename__ = "productivity_weighings"
    __table_args__ = (
        UniqueConstraint("farm_id", "client_event_id", name="uq_productivity_weighing_event"),
    )

    id = Column(String(36), primary_key=True)
    client_event_id = Column(String(36), nullable=False, index=True)
    farm_id = Column(Integer, nullable=False, index=True)
    lote_id = Column(String(64), nullable=False, index=True)
    bovine_id = Column(String(32), nullable=False, index=True)
    weight_kg = Column(Numeric(12, 3), nullable=False)
    captured_at = Column(DateTime(timezone=True), nullable=False, index=True)
    author_id = Column(String(120), nullable=False)
    is_atypical = Column(Boolean, nullable=False, default=False)
    corrected_event_id = Column(String(36), nullable=True, index=True)
    correction_reason = Column(String(500), nullable=True)


class ProductivityConsumption(Base):
    __tablename__ = "productivity_consumptions"
    __table_args__ = (
        UniqueConstraint("farm_id", "client_event_id", name="uq_productivity_consumption_event"),
    )

    id = Column(String(36), primary_key=True)
    client_event_id = Column(String(36), nullable=False, index=True)
    farm_id = Column(Integer, nullable=False, index=True)
    lote_id = Column(String(64), nullable=False, index=True)
    period_start = Column(DateTime(timezone=True), nullable=False)
    period_end = Column(DateTime(timezone=True), nullable=False)
    quantity_kg = Column(Numeric(12, 3), nullable=False)
    cost_amount = Column(Numeric(12, 2), nullable=True)
    currency_code = Column(String(3), nullable=True)
    author_id = Column(String(120), nullable=False)
    corrected_event_id = Column(String(36), nullable=True, index=True)
    correction_reason = Column(String(500), nullable=True)


class ProductivityWeighingReview(Base):
    __tablename__ = "productivity_weighing_reviews"

    id = Column(String(36), primary_key=True)
    weighing_id = Column(String(36), nullable=False, index=True)
    farm_id = Column(Integer, nullable=False, index=True)
    decision = Column(String(8), nullable=False)
    reason = Column(String(500), nullable=False)
    reviewer_id = Column(String(120), nullable=False)
    reviewed_at = Column(DateTime(timezone=True), nullable=False, default=utc_now)
