"""Test harness for HU-07 (genealogy).

Builds an isolated in-memory SQLite database and a dedicated FastAPI app with
only the genealogy router mounted at ``/genealogy`` (pattern of
``backend/tests/test_productivity.py``). ``conftest.py`` is intentionally not
modified: every genealogy test builds its own harness.
"""
from __future__ import annotations

from datetime import date, datetime, timezone
from types import SimpleNamespace
from uuid import uuid4

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.database import Base, get_db
from app.features.auth.dependencies import get_current_user
from app.features.genealogy import models  # noqa: F401  (registers the tables)
from app.features.genealogy.models import GenealogyAnimal, GenealogyParentLink
from app.features.genealogy.router import router

DEFAULT_FARM = 1
OTHER_FARM = 2


def make_user(role: str = "VETERINARIO", farm_id: int | None = DEFAULT_FARM, user_id: int = 7):
    return SimpleNamespace(id=user_id, role_value=role, active_farm_id=farm_id)


class GenealogyHarness:
    """In-memory database plus a TestClient whose user can be switched."""

    def __init__(self) -> None:
        self.engine = create_engine(
            "sqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(bind=self.engine)
        self.Session = sessionmaker(bind=self.engine, autocommit=False, autoflush=False)
        self.current_user = [make_user()]
        self.app = FastAPI()
        self.app.include_router(router, prefix="/genealogy")
        self.app.dependency_overrides[get_db] = self._override_db
        self.app.dependency_overrides[get_current_user] = lambda: self.current_user[0]
        self.client = TestClient(self.app)

    def _override_db(self):
        db = self.Session()
        try:
            yield db
        finally:
            db.close()

    # -- identity -------------------------------------------------------
    def as_user(self, role: str = "VETERINARIO", farm_id: int | None = DEFAULT_FARM, user_id: int = 7):
        self.current_user[0] = make_user(role, farm_id, user_id)
        return self.current_user[0]

    # -- data -----------------------------------------------------------
    def session(self):
        return self.Session()

    def seed(self) -> int:
        from app.features.genealogy.service import seed_genealogy

        with self.Session() as db:
            return seed_genealogy(db)

    def add_animal(self, din: str, sex: str, birth_date: date | str, *, name: str | None = None,
                   farm_id: int = DEFAULT_FARM) -> GenealogyAnimal:
        if isinstance(birth_date, str):
            birth_date = date.fromisoformat(birth_date)
        with self.Session() as db:
            animal = GenealogyAnimal(
                id=str(uuid4()),
                client_event_id=str(uuid4()),
                farm_id=farm_id,
                din=din,
                name=name or din,
                sex=sex,
                birth_date=birth_date,
                origin="PROPIO",
                registered_by="test",
                registered_at=datetime.now(timezone.utc),
            )
            db.add(animal)
            db.commit()
            db.refresh(animal)
            db.expunge(animal)
            return animal

    def add_link(self, offspring_din: str, parent_din: str, parent_role: str, *,
                 sequence_no: int = 1, initial_status: str = "VALIDADO",
                 corrected_event_id: str | None = None, correction_reason: str | None = None,
                 farm_id: int = DEFAULT_FARM, author_role: str = "VETERINARIO") -> GenealogyParentLink:
        with self.Session() as db:
            link = GenealogyParentLink(
                id=str(uuid4()),
                client_event_id=str(uuid4()),
                farm_id=farm_id,
                offspring_din=offspring_din,
                parent_din=parent_din,
                parent_role=parent_role,
                sequence_no=sequence_no,
                corrected_event_id=corrected_event_id,
                correction_reason=correction_reason,
                initial_status=initial_status,
                author_id="test",
                author_role=author_role,
                created_at=datetime.now(timezone.utc),
            )
            db.add(link)
            db.commit()
            db.refresh(link)
            db.expunge(link)
            return link

    def close(self) -> None:
        self.client.close()
        self.app.dependency_overrides.clear()
        Base.metadata.drop_all(bind=self.engine)
        self.engine.dispose()


def build_harness(seed: bool = False) -> GenealogyHarness:
    harness = GenealogyHarness()
    if seed:
        harness.seed()
    return harness


def new_event_id() -> str:
    return str(uuid4())
