"""In-place upgrade of the HU-03 tables (QA-13).

``Base.metadata.create_all`` never adds columns to an existing table. Local
SQLite databases created by early HU-03 commits have ``offline_sync_events``
without ``requires_data_review``, so every insert failed and the server
answered ``STORAGE_BUSY`` forever. This helper adds the missing column.

It is a schema migration only: existing rows take the column default and are
never updated (append-only, constitution §3). Fresh databases are created
correctly by ``create_all`` and the call becomes a no-op.
"""

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine

EVENTS_TABLE = "offline_sync_events"

# Columns added after the table was first released, with their DDL.
ADDED_EVENT_COLUMNS = {
    "requires_data_review": "BOOLEAN NOT NULL DEFAULT 0",
}


def ensure_offline_sync_schema(engine: Engine) -> None:
    inspector = inspect(engine)
    if EVENTS_TABLE not in inspector.get_table_names():
        return

    existing_columns = {column["name"] for column in inspector.get_columns(EVENTS_TABLE)}
    with engine.begin() as connection:
        for column_name, ddl in ADDED_EVENT_COLUMNS.items():
            if column_name not in existing_columns:
                # Identifiers are module constants, never user input.
                connection.execute(
                    text(f"ALTER TABLE {EVENTS_TABLE} ADD COLUMN {column_name} {ddl}")
                )
