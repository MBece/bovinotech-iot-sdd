"""``ensure_offline_sync_schema`` upgrades a database created by early HU-03
commits (QA-13).

``Base.metadata.create_all`` never adds columns to an existing table. A local
SQLite file whose ``offline_sync_events`` lacks ``requires_data_review`` made
every insert fail with ``STORAGE_BUSY`` forever. The helper adds the column in
place (schema migration only, rows are never updated: append-only).
"""
import re
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from uuid import uuid4

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.schema import CreateTable

from app.core.database import Base
from app.features.sanitary_events.models import SanitaryEvent
from app.features.offline_sync.models import (
    OfflineSyncBatchLog,
    OfflineSyncEvent,
    OfflineSyncIdConflict,
)
from app.features.offline_sync.schema_migration import ensure_offline_sync_schema
from app.features.offline_sync.schemas import SyncBatchRequest
from app.features.offline_sync.service import process_batch

NOW = datetime(2026, 11, 24, 15, 0, tzinfo=timezone.utc)
EVENTS_TABLE = OfflineSyncEvent.__tablename__


def _old_events_ddl(engine) -> str:
    """CREATE TABLE of ``offline_sync_events`` as it was before the column."""
    ddl = str(CreateTable(OfflineSyncEvent.__table__).compile(engine))
    old = re.sub(r"\s*requires_data_review [^,]+,", "", ddl)
    assert "requires_data_review" not in old
    return old


def _old_database(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'old_hu03.db'}")
    with engine.begin() as connection:
        connection.execute(text(_old_events_ddl(engine)))
        connection.execute(
            text(
                f"INSERT INTO {EVENTS_TABLE} (client_event_id, payload_hash, "
                "event_type, din, field_occurred_at, received_at, author_email, "
                "farm_id, origin, validation_status, author_verification_pending, "
                "requires_timestamp_review) VALUES ('old-event', 'h', 'CHECKUP', "
                "'DIN-DEMO-000001', '2026-11-20 10:00:00', '2026-11-20 11:00:00', "
                "'operario@bovinotech.co', 1, 'OFFLINE_CAPTURE', "
                "'PENDIENTE_VALIDACION', 0, 0)"
            )
        )
    Base.metadata.create_all(
        engine,
        tables=[
            OfflineSyncBatchLog.__table__,
            OfflineSyncIdConflict.__table__,
            # Read by the duplicate check against the preliminary endpoint.
            SanitaryEvent.__table__,
        ],
    )
    return engine


def _user():
    return SimpleNamespace(
        email="operario@bovinotech.co",
        farm_ids=[1],
        is_active=True,
        disabled_at=None,
        token_iat=NOW - timedelta(minutes=1),
        active_farm_id=1,
    )


def _event(**overrides) -> dict:
    data = {
        "clientEventId": str(uuid4()),
        "eventType": "CHECKUP",
        "din": "DIN-DEMO-000001",
        "fieldOccurredAt": (NOW - timedelta(hours=3)).isoformat(),
        "finding": "Sin hallazgos",
        "authorEmail": "operario@bovinotech.co",
        "farmId": 1,
        "origin": "OFFLINE_CAPTURE",
    }
    data.update(overrides)
    return data


def _sync(engine, items):
    session = sessionmaker(bind=engine)()
    try:
        return process_batch(SyncBatchRequest(items=items), _user(), session, now=NOW)
    finally:
        session.close()


def _columns(engine) -> set[str]:
    return {column["name"] for column in inspect(engine).get_columns(EVENTS_TABLE)}


def test_old_database_fails_with_storage_busy_before_the_upgrade(tmp_path):
    engine = _old_database(tmp_path)

    result = _sync(engine, [_event()]).results[0]

    assert result.status == "FALLIDO"
    assert result.error_code.value == "STORAGE_BUSY"


def test_adds_the_missing_column_and_sync_works_afterwards(tmp_path):
    engine = _old_database(tmp_path)

    ensure_offline_sync_schema(engine)

    assert "requires_data_review" in _columns(engine)
    regular, legacy = _event(), _event(origin="LEGACY", finding=None)
    results = _sync(engine, [regular, legacy]).results
    assert [r.status for r in results] == ["SINCRONIZADO", "SINCRONIZADO"]
    assert [r.requires_data_review for r in results] == [False, True]
    with engine.connect() as connection:
        rows = dict(
            connection.execute(
                text(f"SELECT client_event_id, requires_data_review FROM {EVENTS_TABLE}")
            ).all()
        )
    # The pre-existing row is kept as it was and takes the default value.
    assert rows == {
        "old-event": 0,
        regular["clientEventId"]: 0,
        legacy["clientEventId"]: 1,
    }


def test_is_idempotent(tmp_path):
    engine = _old_database(tmp_path)

    ensure_offline_sync_schema(engine)
    ensure_offline_sync_schema(engine)

    assert "requires_data_review" in _columns(engine)


def test_does_nothing_when_the_table_does_not_exist(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'empty.db'}")

    ensure_offline_sync_schema(engine)

    assert EVENTS_TABLE not in inspect(engine).get_table_names()


def test_fresh_database_is_left_unchanged(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'fresh.db'}")
    Base.metadata.create_all(engine, tables=[OfflineSyncEvent.__table__])
    before = _columns(engine)

    ensure_offline_sync_schema(engine)

    assert _columns(engine) == before
