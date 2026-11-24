"""Idempotency under conflicting content and competing sessions (HU-03 R3, FR-013)."""
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from uuid import uuid4

from sqlalchemy.orm import sessionmaker

from app.features.offline_sync.models import OfflineSyncEvent, OfflineSyncIdConflict
from app.features.offline_sync.schemas import SyncBatchRequest
from app.features.offline_sync.service import process_batch

NOW = datetime(2026, 11, 24, 15, 0, tzinfo=timezone.utc)


def user():
    return SimpleNamespace(
        email="operario@bovinotech.co",
        farm_ids=[1],
        is_active=True,
        disabled_at=None,
        token_iat=NOW,
        active_farm_id=1,
    )


def captured(**overrides) -> dict:
    data = {
        "clientEventId": str(uuid4()),
        "eventType": "VACCINATION",
        "din": "DIN-DEMO-000001",
        "fieldOccurredAt": (NOW - timedelta(hours=1)).isoformat(),
        "product": "Aftosa",
        "doseQuantity": 2,
        "doseUnit": "ml",
        "authorEmail": "operario@bovinotech.co",
        "farmId": 1,
    }
    data.update(overrides)
    return data


def send(db, items):
    return process_batch(SyncBatchRequest(items=items), user(), db, now=NOW).results


def test_reused_id_with_different_content_is_rejected_and_audited(db_session):
    original = captured()
    send(db_session, [original])

    result = send(db_session, [{**original, "doseQuantity": 9}])[0]

    assert result.status == "FALLIDO"
    assert result.retryable is False
    assert result.error_code.value == "CLIENT_EVENT_ID_CONFLICT"
    row = db_session.query(OfflineSyncEvent).one()
    assert row.dose_quantity == 2
    conflict = db_session.query(OfflineSyncIdConflict).one()
    assert conflict.client_event_id == original["clientEventId"]
    assert conflict.existing_event_id == row.id
    assert conflict.existing_payload_hash == row.payload_hash
    assert conflict.received_payload_hash != row.payload_hash
    assert conflict.sender_email == "operario@bovinotech.co"
    assert '"doseQuantity": 9' in conflict.received_payload


def test_competing_sessions_store_a_single_record(db_session):
    """Two sessions validate the same event; the second insert loses the race."""
    sessions = sessionmaker(bind=db_session.get_bind())
    event = captured()
    first_session, second_session = sessions(), sessions()
    try:
        first = send(first_session, [event])[0]
        second = send(second_session, [event])[0]
    finally:
        first_session.close()
        second_session.close()

    assert {first.status, second.status} == {"SINCRONIZADO", "DUPLICADO"}
    assert db_session.query(OfflineSyncEvent).count() == 1
