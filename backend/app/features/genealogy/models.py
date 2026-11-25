"""Append-only persistence for HU-07 (data-model.md).

The three tables are insert-only: no service issues UPDATE or DELETE on them.
DIN and farm are stored by value; there are no foreign keys to other stories.
"""
from datetime import datetime, timezone

from sqlalchemy import Column, Date, DateTime, Integer, String, UniqueConstraint

from app.core.database import Base


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class GenealogyAnimal(Base):
    __tablename__ = "genealogy_animals"
    __table_args__ = (
        UniqueConstraint("farm_id", "din", name="uq_genealogy_animal_din"),
        UniqueConstraint("farm_id", "client_event_id", name="uq_genealogy_animal_event"),
    )

    id = Column(String(36), primary_key=True)
    client_event_id = Column(String(36), nullable=False, index=True)
    farm_id = Column(Integer, nullable=False, index=True)
    din = Column(String(32), nullable=False, index=True)
    name = Column(String(120), nullable=False)
    sex = Column(String(6), nullable=False)
    birth_date = Column(Date, nullable=False)
    origin = Column(String(8), nullable=False, default="PROPIO")
    registered_by = Column(String(120), nullable=False)
    registered_at = Column(DateTime(timezone=True), nullable=False, default=utc_now)


class GenealogyParentLink(Base):
    __tablename__ = "genealogy_parent_links"
    __table_args__ = (
        UniqueConstraint("farm_id", "client_event_id", name="uq_genealogy_link_event"),
        UniqueConstraint(
            "farm_id", "offspring_din", "parent_role", "sequence_no",
            name="uq_genealogy_link_position_sequence",
        ),
    )

    id = Column(String(36), primary_key=True)
    client_event_id = Column(String(36), nullable=False, index=True)
    farm_id = Column(Integer, nullable=False, index=True)
    offspring_din = Column(String(32), nullable=False, index=True)
    parent_din = Column(String(32), nullable=False, index=True)
    parent_role = Column(String(4), nullable=False)
    sequence_no = Column(Integer, nullable=False)
    corrected_event_id = Column(String(36), nullable=True, index=True)
    correction_reason = Column(String(500), nullable=True)
    initial_status = Column(String(24), nullable=False)
    author_id = Column(String(120), nullable=False)
    author_role = Column(String(24), nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utc_now)


class GenealogyLinkValidation(Base):
    __tablename__ = "genealogy_link_validations"
    __table_args__ = (
        UniqueConstraint("link_id", name="uq_genealogy_validation_link"),
    )

    id = Column(String(36), primary_key=True)
    link_id = Column(String(36), nullable=False, index=True)
    farm_id = Column(Integer, nullable=False, index=True)
    decision = Column(String(9), nullable=False)
    reason = Column(String(500), nullable=True)
    validator_id = Column(String(120), nullable=False)
    validated_at = Column(DateTime(timezone=True), nullable=False, default=utc_now)
