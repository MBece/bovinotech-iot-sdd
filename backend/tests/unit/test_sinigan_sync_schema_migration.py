"""``ensure_sinigan_sync_schema`` upgrades a legacy HU-05 database (D10).

``Base.metadata.create_all`` never adds columns to an existing table. The
helper must add ``farm_id`` to the two farm-scoped tables, keep existing rows
valid with the farm-1 default and create the indexes.
"""

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.pool import StaticPool

from app.features.sinigan_sync.schema_migration import (
    FARM_SCOPED_TABLES,
    ensure_sinigan_sync_schema,
)


def _legacy_engine():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    with engine.begin() as connection:
        connection.execute(
            text(
                "CREATE TABLE field_animal_records ("
                "id INTEGER PRIMARY KEY, "
                "din VARCHAR(32) NOT NULL UNIQUE)"
            )
        )
        connection.execute(
            text(
                "INSERT INTO field_animal_records (din) "
                "VALUES ('DIN-DEMO-000001')"
            )
        )
        connection.execute(
            text(
                "CREATE TABLE reconciliation_tickets ("
                "id INTEGER PRIMARY KEY, "
                "din VARCHAR(32) NOT NULL)"
            )
        )
        connection.execute(
            text(
                "INSERT INTO reconciliation_tickets (din) "
                "VALUES ('DIN-DEMO-000002')"
            )
        )
    return engine


def _columns(engine, table_name: str) -> set[str]:
    return {
        column["name"]
        for column in inspect(engine).get_columns(table_name)
    }


def _index_names(engine, table_name: str) -> set[str]:
    return {
        index["name"] for index in inspect(engine).get_indexes(table_name)
    }


def test_adds_farm_id_with_default_one_and_creates_indexes():
    engine = _legacy_engine()

    ensure_sinigan_sync_schema(engine)

    for table_name in FARM_SCOPED_TABLES:
        assert "farm_id" in _columns(engine, table_name)
        assert f"ix_{table_name}_farm_id" in _index_names(engine, table_name)

    with engine.connect() as connection:
        field_farm_id = connection.execute(
            text("SELECT farm_id FROM field_animal_records")
        ).scalar_one()
        ticket_farm_id = connection.execute(
            text("SELECT farm_id FROM reconciliation_tickets")
        ).scalar_one()

    assert field_farm_id == 1
    assert ticket_farm_id == 1


def test_is_idempotent():
    engine = _legacy_engine()

    ensure_sinigan_sync_schema(engine)
    ensure_sinigan_sync_schema(engine)

    for table_name in FARM_SCOPED_TABLES:
        assert "farm_id" in _columns(engine, table_name)
        assert f"ix_{table_name}_farm_id" in _index_names(engine, table_name)

    with engine.connect() as connection:
        assert (
            connection.execute(
                text("SELECT COUNT(*) FROM field_animal_records")
            ).scalar_one()
            == 1
        )
        assert (
            connection.execute(
                text("SELECT COUNT(*) FROM reconciliation_tickets")
            ).scalar_one()
            == 1
        )


def test_does_nothing_when_tables_do_not_exist():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    ensure_sinigan_sync_schema(engine)

    assert inspect(engine).get_table_names() == []
