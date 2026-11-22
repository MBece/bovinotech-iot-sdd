"""Transactional orchestration for HU-05 simulated SINIGAN reconciliation."""

import json
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.features.auth.models import User
from app.features.sinigan.adapter import SiniganAdapter
from app.features.sinigan_sync.comparator import FIELD_LABELS, compare_snapshots
from app.features.sinigan_sync.models import (
    FieldAnimalRecord,
    ReconciliationDiscrepancy,
    ReconciliationResolution,
    ReconciliationTicket,
    utcnow,
)
from app.features.sinigan_sync.schemas import FIELD_SOURCE, MOCK_LABEL

FIELD_FIXTURE_PATH = (
    Path(__file__).parent / "fixtures" / "field_animals.json"
)

ACTIVE_FARM_REQUIRED_MESSAGE = (
    "Se requiere una finca activa para operar la conciliación."
)


def _active_farm_id(current_user: User) -> int:
    """Return the tenant boundary from the token, failing closed (D10).

    The active farm comes exclusively from the ``farm_id`` JWT claim. A legacy
    token without it must not fall back to farm 1: it gets a 403 on every
    HU-05 endpoint.
    """

    farm_id = getattr(current_user, "active_farm_id", None)
    if farm_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=ACTIVE_FARM_REQUIRED_MESSAGE,
        )
    return farm_id


def _parse_updated_at(value: Any) -> datetime:
    if isinstance(value, datetime):
        return as_utc(value)
    if not value:
        return utcnow()
    return as_utc(datetime.fromisoformat(str(value).replace("Z", "+00:00")))


def as_utc(value: datetime | None) -> datetime | None:
    """Return an aware UTC datetime, treating naive values as UTC.

    SQLite loses the offset of ``DateTime(timezone=True)`` columns, so values
    read back from the database are naive even though they were stored in UTC.
    The API contract always emits UTC (``Z``), hence this normalization.
    """

    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def iso_utc(value: datetime | None) -> str | None:
    """Serialize a datetime as an ISO-8601 UTC string with a ``Z`` suffix."""

    normalized = as_utc(value)
    if normalized is None:
        return None
    return normalized.isoformat().replace("+00:00", "Z")


def seed_field_animals(db: Session | None = None, farm_id: int = 1) -> int:
    """Seed the fictional field records idempotently.

    Only missing DINs are inserted; existing rows are never overwritten. The
    function accepts a session so both application startup and the test
    database can share exactly the same seed. It commits its own transaction so
    callers that only open/close a session (for example the pytest fixture) still
    persist the rows. Seeded rows belong to ``farm_id`` (farm 1 by default,
    D10). It returns the number of inserted records.
    """

    close_session = False
    if db is None:
        db = SessionLocal()
        close_session = True
    try:
        with FIELD_FIXTURE_PATH.open("r", encoding="utf-8") as fixture_file:
            records = json.load(fixture_file)

        fixture_dins = [record["din"] for record in records]
        existing_dins = {
            row[0]
            for row in db.query(FieldAnimalRecord.din)
            .filter(FieldAnimalRecord.din.in_(fixture_dins))
            .all()
        }

        inserted = 0
        for record in records:
            if record["din"] in existing_dins:
                continue
            db.add(
                FieldAnimalRecord(
                    din=record["din"],
                    farm_id=farm_id,
                    species=record["species"],
                    sex=record["sex"],
                    age_group=record.get("age_group", record.get("ageGroup")),
                    sit_code=record.get("sit_code", record.get("sitCode")),
                    establishment_name=record.get(
                        "establishment_name", record.get("establishmentName")
                    ),
                    source=record.get("source", "REGISTRO_DE_CAMPO"),
                    updated_at=_parse_updated_at(
                        record.get("updated_at", record.get("updatedAt"))
                    ),
                )
            )
            inserted += 1
        db.commit()
        return inserted
    finally:
        if close_session:
            db.close()


class SiniganSyncService:
    def __init__(self, adapter: SiniganAdapter):
        self.adapter = adapter

    @staticmethod
    def _field_snapshot(record: FieldAnimalRecord) -> dict[str, Any]:
        return {
            "din": record.din,
            "species": record.species,
            "sex": record.sex,
            "ageGroup": record.age_group,
            "sitCode": record.sit_code,
            "establishmentName": record.establishment_name,
            "source": record.source,
            "updatedAt": iso_utc(record.updated_at),
        }

    @staticmethod
    def _ticket_summary(
        ticket: ReconciliationTicket, discrepancy_count: int
    ) -> dict[str, Any]:
        return {
            "id": ticket.id,
            "din": ticket.din,
            "farm_id": ticket.farm_id,
            "status": ticket.status,
            "compared_at": as_utc(ticket.compared_at),
            "created_by_email": ticket.created_by_email,
            "created_at": as_utc(ticket.created_at),
            "closed_at": as_utc(ticket.closed_at),
            "discrepancy_count": discrepancy_count,
        }

    @staticmethod
    def _discrepancy_payload(
        discrepancy: ReconciliationDiscrepancy,
    ) -> dict[str, Any]:
        return {
            "field_name": discrepancy.field_name,
            "field_label": FIELD_LABELS.get(
                discrepancy.field_name, discrepancy.field_name
            ),
            "official_value": discrepancy.official_value,
            "field_value": discrepancy.field_value,
            "official_source": discrepancy.official_source,
            "field_source": discrepancy.field_source,
            "detected_at": as_utc(discrepancy.detected_at),
        }

    @staticmethod
    def _resolution_payload(
        resolution: ReconciliationResolution,
    ) -> dict[str, Any]:
        return {
            "decision": resolution.decision,
            "reason": resolution.reason,
            "resolved_by_email": resolution.resolved_by_email,
            "resolved_at": as_utc(resolution.resolved_at),
        }

    def compare(
        self,
        din: str,
        current_user: User,
        db: Session,
    ) -> dict[str, Any]:
        farm_id = _active_farm_id(current_user)
        normalized_din = din.strip().upper()

        official = self.adapter.find_animal_by_din(normalized_din)
        if official is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="DIN no encontrado en las referencias disponibles.",
            )

        # Cross-farm existence must not leak: a DIN recorded in another farm is
        # indistinguishable from a missing field record (same 409, D10 rule 4).
        field_record = (
            db.query(FieldAnimalRecord)
            .filter(
                FieldAnimalRecord.din == normalized_din,
                FieldAnimalRecord.farm_id == farm_id,
            )
            .first()
        )
        if field_record is None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="No existe registro de campo para el DIN consultado.",
            )

        compared_at = utcnow()
        official_snapshot = deepcopy(official)
        field_snapshot = self._field_snapshot(field_record)
        discrepancies = compare_snapshots(official_snapshot, field_snapshot)

        response: dict[str, Any] = {
            "meta": {
                "source_system": "SINIGAN",
                "source_mode": "SIMULADO",
                "is_simulation": True,
                "mock_label": MOCK_LABEL,
                "compared_at": compared_at,
            },
            "official": official_snapshot,
            "field": field_snapshot,
            "result": "CONSISTENTE",
            "discrepancies": [],
            "ticket": None,
        }

        if not discrepancies:
            return response

        ticket = ReconciliationTicket(
            din=normalized_din,
            farm_id=farm_id,
            status="OPEN",
            official_snapshot=official_snapshot,
            field_snapshot=field_snapshot,
            official_source=MOCK_LABEL,
            field_source=FIELD_SOURCE,
            compared_at=compared_at,
            created_by_email=current_user.email,
            created_at=compared_at,
        )
        db.add(ticket)
        db.flush()

        for discrepancy in discrepancies:
            db.add(
                ReconciliationDiscrepancy(
                    ticket_id=ticket.id,
                    field_name=discrepancy["field_name"],
                    field_value=discrepancy["field_value"],
                    official_value=discrepancy["official_value"],
                    official_source=MOCK_LABEL,
                    field_source=FIELD_SOURCE,
                    detected_at=compared_at,
                )
            )

        db.commit()
        db.refresh(ticket)

        response["result"] = "DISCREPANCIA"
        response["discrepancies"] = [
            {
                "field_name": discrepancy["field_name"],
                "field_label": discrepancy["field_label"],
                "official_value": discrepancy["official_value"],
                "field_value": discrepancy["field_value"],
                "official_source": MOCK_LABEL,
                "field_source": FIELD_SOURCE,
                "detected_at": compared_at,
            }
            for discrepancy in discrepancies
        ]
        response["ticket"] = self._ticket_summary(ticket, len(discrepancies))
        return response

    @staticmethod
    def list_tickets(
        db: Session,
        current_user: User,
        status_filter: str | None = None,
        din: str | None = None,
        limit: int = 50,
    ) -> dict[str, Any]:
        farm_id = _active_farm_id(current_user)
        query = db.query(ReconciliationTicket).filter(
            ReconciliationTicket.farm_id == farm_id
        )
        if status_filter is not None:
            query = query.filter(ReconciliationTicket.status == status_filter)
        if din is not None:
            query = query.filter(
                ReconciliationTicket.din == din.strip().upper()
            )

        tickets = (
            query.order_by(
                ReconciliationTicket.created_at.desc(),
                ReconciliationTicket.id.desc(),
            )
            .limit(limit)
            .all()
        )
        if not tickets:
            return {"items": []}

        ticket_ids = [ticket.id for ticket in tickets]
        counts = dict(
            db.query(
                ReconciliationDiscrepancy.ticket_id,
                func.count(ReconciliationDiscrepancy.id),
            )
            .filter(ReconciliationDiscrepancy.ticket_id.in_(ticket_ids))
            .group_by(ReconciliationDiscrepancy.ticket_id)
            .all()
        )
        return {
            "items": [
                SiniganSyncService._ticket_summary(
                    ticket, counts.get(ticket.id, 0)
                )
                for ticket in tickets
            ]
        }

    @staticmethod
    def get_ticket(
        ticket_id: int, current_user: User, db: Session
    ) -> dict[str, Any]:
        farm_id = _active_farm_id(current_user)
        ticket = (
            db.query(ReconciliationTicket)
            .filter(
                ReconciliationTicket.id == ticket_id,
                ReconciliationTicket.farm_id == farm_id,
            )
            .first()
        )
        if ticket is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Ticket de conciliación no encontrado.",
            )

        discrepancies = (
            db.query(ReconciliationDiscrepancy)
            .filter(ReconciliationDiscrepancy.ticket_id == ticket.id)
            .order_by(ReconciliationDiscrepancy.id)
            .all()
        )
        resolution = (
            db.query(ReconciliationResolution)
            .filter(ReconciliationResolution.ticket_id == ticket.id)
            .first()
        )

        return {
            "id": ticket.id,
            "din": ticket.din,
            "farm_id": ticket.farm_id,
            "status": ticket.status,
            "official_snapshot": ticket.official_snapshot,
            "field_snapshot": ticket.field_snapshot,
            "official_source": ticket.official_source,
            "field_source": ticket.field_source,
            "compared_at": as_utc(ticket.compared_at),
            "created_by_email": ticket.created_by_email,
            "created_at": as_utc(ticket.created_at),
            "closed_at": as_utc(ticket.closed_at),
            "discrepancies": [
                SiniganSyncService._discrepancy_payload(discrepancy)
                for discrepancy in discrepancies
            ],
            "resolution": (
                SiniganSyncService._resolution_payload(resolution)
                if resolution is not None
                else None
            ),
        }

    def resolve_ticket(
        self,
        ticket_id: int,
        decision: str,
        reason: str,
        current_user: User,
        db: Session,
    ) -> dict[str, Any]:
        farm_id = _active_farm_id(current_user)
        ticket = (
            db.query(ReconciliationTicket)
            .filter(
                ReconciliationTicket.id == ticket_id,
                ReconciliationTicket.farm_id == farm_id,
            )
            .first()
        )
        if ticket is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Ticket de conciliación no encontrado.",
            )
        if ticket.status == "CLOSED":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="El ticket de conciliación ya está cerrado.",
            )

        resolved_at = utcnow()
        resolution = ReconciliationResolution(
            ticket_id=ticket.id,
            decision=decision,
            reason=reason,
            resolved_by_email=current_user.email,
            resolved_at=resolved_at,
        )
        ticket.status = "CLOSED"
        ticket.closed_at = resolved_at
        db.add(resolution)
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="El ticket de conciliación ya está cerrado.",
            )
        db.refresh(ticket)
        db.refresh(resolution)

        return {
            "id": ticket.id,
            "din": ticket.din,
            "farm_id": ticket.farm_id,
            "status": ticket.status,
            "closed_at": as_utc(ticket.closed_at),
            "resolution": self._resolution_payload(resolution),
        }
