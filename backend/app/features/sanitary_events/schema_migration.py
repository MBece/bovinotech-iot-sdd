"""Upgrade legacy sanitary tables without deleting the local demonstration DB."""

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine


NEW_COLUMNS = {
    "sanitary_events": {
        "product": "VARCHAR(120)",
        "dose_unit": "VARCHAR(16)",
        "clinical_reason": "TEXT",
        "finding": "TEXT",
    },
    "sanitary_event_corrections": {
        "product": "VARCHAR(120)",
        "dose_unit": "VARCHAR(16)",
        "clinical_reason": "TEXT",
        "finding": "TEXT",
    },
}


def ensure_sanitary_events_schema(engine: Engine) -> None:
    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())
    with engine.begin() as connection:
        for table_name, columns in NEW_COLUMNS.items():
            if table_name not in existing_tables:
                continue
            existing = {
                column["name"] for column in inspector.get_columns(table_name)
            }
            for name, ddl in columns.items():
                if name not in existing:
                    connection.execute(
                        text(f"ALTER TABLE {table_name} ADD COLUMN {name} {ddl}")
                    )
