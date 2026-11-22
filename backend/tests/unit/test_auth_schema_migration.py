"""T022 - ensure_auth_schema upgrades a legacy users table in place (plan R1)."""
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.pool import StaticPool

from app.features.auth.schema_migration import NEW_USER_COLUMNS, ensure_auth_schema


def _legacy_engine():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    with engine.begin() as conn:
        conn.execute(
            text(
                "CREATE TABLE users ("
                "id INTEGER PRIMARY KEY, "
                "email VARCHAR NOT NULL UNIQUE, "
                "hashed_password VARCHAR NOT NULL, "
                "role VARCHAR(11) NOT NULL)"
            )
        )
        conn.execute(
            text(
                "INSERT INTO users (email, hashed_password, role) "
                "VALUES ('legacy@bovinotech.co', 'hash', 'OPERARIO')"
            )
        )
    return engine


def _user_columns(engine):
    return {column["name"] for column in inspect(engine).get_columns("users")}


def test_adds_missing_columns_to_legacy_users_table():
    engine = _legacy_engine()

    ensure_auth_schema(engine)

    assert set(NEW_USER_COLUMNS).issubset(_user_columns(engine))


def test_is_idempotent_and_preserves_existing_rows():
    engine = _legacy_engine()

    ensure_auth_schema(engine)
    ensure_auth_schema(engine)

    with engine.connect() as conn:
        row = conn.execute(
            text("SELECT email, is_active, must_change_password FROM users")
        ).one()
    assert row.email == "legacy@bovinotech.co"
    assert row.is_active == 1
    assert row.must_change_password == 0


def test_does_nothing_when_users_table_does_not_exist():
    engine = create_engine("sqlite:///:memory:", poolclass=StaticPool)

    ensure_auth_schema(engine)

    assert "users" not in inspect(engine).get_table_names()
