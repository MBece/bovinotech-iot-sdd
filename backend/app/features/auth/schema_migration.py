"""In-place upgrade of the legacy ``users`` table (research.md R1).

The project creates tables with ``Base.metadata.create_all``, which never adds
columns to an existing table. This helper adds the columns introduced by the
expanded HU-01 so that local SQLite databases keep working without being
deleted. New auth tables are created by ``create_all``.
"""
from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine

# Column name -> SQLite DDL. Defaults keep existing rows valid.
NEW_USER_COLUMNS = {
    "full_name": "VARCHAR",
    "is_active": "BOOLEAN NOT NULL DEFAULT 1",
    "must_change_password": "BOOLEAN NOT NULL DEFAULT 0",
    "created_at": "DATETIME",
    "created_by_id": "INTEGER",
    "disabled_at": "DATETIME",
}


def ensure_auth_schema(engine: Engine) -> None:
    inspector = inspect(engine)
    if "users" not in inspector.get_table_names():
        return
    existing = {column["name"] for column in inspector.get_columns("users")}
    missing = [name for name in NEW_USER_COLUMNS if name not in existing]
    if not missing:
        return
    with engine.begin() as connection:
        for name in missing:
            connection.execute(
                text(f"ALTER TABLE users ADD COLUMN {name} {NEW_USER_COLUMNS[name]}")
            )
