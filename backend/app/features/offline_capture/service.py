"""Seed and per-farm query of the offline catalog (HU-02 research R7)."""
import json
from pathlib import Path

from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.features.offline_capture.models import CatalogAnimal

CATALOG_FIXTURE_PATH = Path(__file__).parent / "fixtures" / "catalog.json"


def seed_catalog(db: Session | None = None) -> int:
    """Insert the missing seed animals; never overwrites existing rows.

    Accepts a session so startup and the test database share the same seed.
    Returns the number of inserted animals.
    """
    close_session = db is None
    db = db or SessionLocal()
    try:
        records = json.loads(CATALOG_FIXTURE_PATH.read_text(encoding="utf-8"))["animals"]
        existing = {
            (farm_id, din)
            for farm_id, din in db.query(CatalogAnimal.farm_id, CatalogAnimal.din).all()
        }
        missing = [
            CatalogAnimal(farm_id=record["farm_id"], din=record["din"], name=record["name"])
            for record in records
            if (record["farm_id"], record["din"]) not in existing
        ]
        db.add_all(missing)
        db.commit()
        return len(missing)
    finally:
        if close_session:
            db.close()


def list_catalog(db: Session, farm_id: int) -> list[CatalogAnimal]:
    return (
        db.query(CatalogAnimal)
        .filter(CatalogAnimal.farm_id == farm_id)
        .order_by(CatalogAnimal.din)
        .all()
    )
