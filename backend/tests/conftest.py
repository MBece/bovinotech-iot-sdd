import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.database import Base, get_db
from app.features.auth.router import seed_initial_users
from app.main import app


test_engine = create_engine(
    "sqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=test_engine,
)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


def _seed_field_animals_if_available(db) -> bool:
    """Seed HU-05 field records when the module under test exists.

    During the TDD red phase ``app.features.sinigan_sync`` does not exist yet.
    Swallowing only the absence of that module keeps the pre-existing suite
    green while still seeding the same database through the real, shared
    ``seed_field_animals`` function once A3 implements it.
    """
    try:
        from app.features.sinigan_sync.service import seed_field_animals
    except ModuleNotFoundError as exc:
        if exc.name and exc.name.startswith("app.features.sinigan_sync"):
            return False
        raise
    seed_field_animals(db)
    return True


@pytest.fixture(autouse=True)
def isolated_database():
    Base.metadata.drop_all(bind=test_engine)
    Base.metadata.create_all(bind=test_engine)
    db = TestingSessionLocal()
    seed_initial_users(db)
    field_animals_seeded = _seed_field_animals_if_available(db)
    db.close()
    app.dependency_overrides[get_db] = override_get_db
    yield field_animals_seeded
    app.dependency_overrides.clear()


@pytest.fixture
def db_session(isolated_database):
    """Provide a session bound to the isolated in-memory test database."""
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()
