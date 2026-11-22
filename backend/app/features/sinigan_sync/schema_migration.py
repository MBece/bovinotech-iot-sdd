"""In-place upgrade of the HU-05 tables for multi-farm isolation (D10).

``Base.metadata.create_all`` never adds columns to an existing table. Local
SQLite databases created before HU-05 farm isolation keep working: this helper
adds the missing ``farm_id`` columns (existing rows default to farm 1) and
creates the matching indexes. Fresh databases are created correctly by
``create_all`` and the call becomes a no-op.
"""

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine

# Tables that belong to a farm; child tables inherit it through the ticket.
FARM_SCOPED_TABLES = ("field_animal_records", "reconciliation_tickets")

FARM_ID_COLUMN_DDL = "INTEGER NOT NULL DEFAULT 1"


def ensure_sinigan_sync_schema(engine: Engine) -> None:
    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())

    with engine.begin() as connection:
        for table_name in FARM_SCOPED_TABLES:
            if table_name not in existing_tables:
                continue

            existing_columns = {
                column["name"]
                for column in inspector.get_columns(table_name)
            }
            if "farm_id" not in existing_columns:
                connection.execute(
                    text(
                        f"ALTER TABLE {table_name} "
                        f"ADD COLUMN farm_id {FARM_ID_COLUMN_DDL}"
                    )
                )
            connection.execute(
                text(
                    f"CREATE INDEX IF NOT EXISTS ix_{table_name}_farm_id "
                    f"ON {table_name} (farm_id)"
                )
            )
