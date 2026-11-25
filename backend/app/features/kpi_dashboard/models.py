"""AnimalWeight model for GDP calculation (HU-09)."""

from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, Float, Integer, String

from app.core.database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class AnimalWeight(Base):
    """Append-only weight record used to compute GDP."""
    __tablename__ = "animal_weights"

    id = Column(Integer, primary_key=True, index=True)
    din = Column(String(32), index=True, nullable=False)
    farm_id = Column(Integer, nullable=False, index=True)
    weight_kg = Column(Float, nullable=False)
    measured_at = Column(DateTime(timezone=True), nullable=False)
    recorded_by_email = Column(String, nullable=False)
    recorded_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)