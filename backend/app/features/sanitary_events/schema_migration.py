from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine


_EVENT_COLUMNS = {
    "farm_id": "INTEGER",
    "corrected_event_id": (
        "INTEGER REFERENCES sanitary_events(id) ON DELETE RESTRICT"
    ),
    "reason": "TEXT",
    "withdrawal_until": "DATETIME",
}


def ensure_sanitary_events_schema(engine: Engine) -> None:
    """Add HU-04 append-only metadata to databases created by earlier releases."""
    inspector = inspect(engine)
    if "sanitary_events" not in inspector.get_table_names():
        return

    existing_columns = {
        column["name"] for column in inspector.get_columns("sanitary_events")
    }
    with engine.begin() as connection:
        for column_name, column_definition in _EVENT_COLUMNS.items():
            if column_name not in existing_columns:
                connection.execute(
                    text(
                        f"ALTER TABLE sanitary_events ADD COLUMN "
                        f"{column_name} {column_definition}"
                    )
                )
