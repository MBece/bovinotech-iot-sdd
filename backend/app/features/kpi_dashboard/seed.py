"""Idempotent seed for AnimalWeight test data (HU-09)."""

from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.features.kpi_dashboard.models import AnimalWeight

_SEED_PAYLOADS = [
    # (din, weight_kg, measured_at_iso)
    # DIN-DEMO-000001: 3 measurements
    ("DIN-DEMO-000001", 250.0, "2026-01-15T10:00:00Z"),
    ("DIN-DEMO-000001", 310.0, "2026-06-20T10:00:00Z"),
    ("DIN-DEMO-000001", 340.0, "2026-11-01T10:00:00Z"),
    # DIN-DEMO-000002: 3 measurements
    ("DIN-DEMO-000002", 180.0, "2026-02-01T10:00:00Z"),
    ("DIN-DEMO-000002", 260.0, "2026-07-15T10:00:00Z"),
    ("DIN-DEMO-000002", 320.0, "2026-11-10T10:00:00Z"),
    # DIN-DEMO-000003: 3 measurements
    ("DIN-DEMO-000003", 90.0, "2026-03-01T10:00:00Z"),
    ("DIN-DEMO-000003", 160.0, "2026-08-01T10:00:00Z"),
    ("DIN-DEMO-000003", 220.0, "2026-11-15T10:00:00Z"),
]

_RECORDED_BY = "seed@bovinotech.io"


def _parse_dt(iso_str: str) -> datetime:
    return datetime.fromisoformat(iso_str.replace("Z", "+00:00"))


def seed_animal_weights(db: Session | None = None, farm_id: int = 1) -> int:
    """Seed AnimalWeight records idempotently.

    Only missing (din, measured_at) pairs are inserted; existing rows are never
    overwritten.  Accepts an optional session so both application startup and
    tests can share the same seed.  Commits its own transaction.  Returns the
    number of inserted records.
    """
    close_session = False
    if db is None:
        db = SessionLocal()
        close_session = True
    try:
        # Build set of existing (din, measured_at) tuples
        existing = {
            (row.din, row.measured_at.replace(tzinfo=timezone.utc).isoformat())
            for row in db.query(AnimalWeight).all()
        }

        inserted = 0
        for din, weight_kg, measured_at_iso in _SEED_PAYLOADS:
            measured_at = _parse_dt(measured_at_iso)
            key = (din, measured_at.isoformat())
            if key in existing:
                continue
            db.add(
                AnimalWeight(
                    din=din,
                    farm_id=farm_id,
                    weight_kg=weight_kg,
                    measured_at=measured_at,
                    recorded_by_email=_RECORDED_BY,
                    recorded_at=datetime.now(timezone.utc),
                )
            )
            inserted += 1
        db.commit()
        return inserted
    finally:
        if close_session:
            db.close()