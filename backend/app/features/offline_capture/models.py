"""Seed catalog of animals per farm (HU-02 research R7).

No foreign keys against other user stories (constitution §2): ``farm_id`` is
the HU-01 farm id and ``din`` the animal identifier as plain strings.
"""
from sqlalchemy import Column, Integer, String, UniqueConstraint

from app.core.database import Base


class CatalogAnimal(Base):
    __tablename__ = "offline_capture_animals"
    __table_args__ = (
        UniqueConstraint("farm_id", "din", name="uq_offline_capture_farm_din"),
    )

    id = Column(Integer, primary_key=True, index=True)
    din = Column(String(32), index=True, nullable=False)
    name = Column(String(120), nullable=False)
    farm_id = Column(Integer, index=True, nullable=False)
