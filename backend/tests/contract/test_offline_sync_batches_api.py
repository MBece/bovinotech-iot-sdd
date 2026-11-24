"""HTTP contract of POST /offline-sync/batches (HU-03 contracts §1).

Scenarios follow specs/003-offline-batch-sync/contracts/sync-batch.cases.json.
"""
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import uuid4

from fastapi.testclient import TestClient

from app.features.offline_sync.models import OfflineSyncBatchLog, OfflineSyncEvent
from app.features.sanitary_events.models import SanitaryEvent
from app.main import app

client = TestClient(app)

BATCHES_PATH = "/offline-sync/batches"
OPERARIO = "operario@bovinotech.co"
CASES = json.loads(
    (
        Path(__file__).resolve().parents[3]
        / "specs/003-offline-batch-sync/contracts/sync-batch.cases.json"
    ).read_text(encoding="utf-8")
)["cases"]


def case(case_id: str) -> dict:
    return next(item for item in CASES if item["id"] == case_id)


def login(email: str = OPERARIO) -> dict[str, str]:
    response = client.post("/auth/login", data={"username": email, "password": "password123"})
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def captured(hours_ago: float = 2, **overrides) -> dict:
    occurred = datetime.now(timezone.utc) - timedelta(hours=hours_ago)
    data = {
        "clientEventId": str(uuid4()),
        "eventType": "VACCINATION",
        "din": "DIN-DEMO-000001",
        "fieldOccurredAt": occurred.isoformat().replace("+00:00", "Z"),
        "product": "Aftosa bivalente",
        "doseQuantity": 2,
        "doseUnit": "ml",
        "reason": None,
        "finding": None,
        "notes": None,
        "authorEmail": OPERARIO,
        "farmId": 1,
        "authorVerificationPending": False,
        "syncStatus": "PENDIENTE_SINCRONIZACION",
        "validationStatus": "PENDIENTE_VALIDACION",
        "origin": "OFFLINE_CAPTURE",
    }
    data.update(overrides)
    return data


def send(items: list[dict], headers: dict | None = None):
    return client.post(BATCHES_PATH, json={"items": items}, headers=headers or login())


# --- US1: batch send ---------------------------------------------------------


def test_ac1_batch_mixed_states():
    spec = case("AC1_batch_mixed_states")
    headers = login()
    e2 = captured()
    e3 = captured()
    send([e2, e3], headers)  # server state: e2 and e3 already exist

    e1 = captured()
    e3_changed = {**e3, "doseQuantity": 5}
    response = send([e1, e2, e3_changed], headers)

    assert response.status_code == 200
    results = response.json()["results"]
    expected = spec["expected"]
    assert [result["status"] for result in results] == [item["status"] for item in expected]
    assert results[2]["retryable"] is False
    assert results[2]["errorCode"] == "CLIENT_EVENT_ID_CONFLICT"


def test_valid_batch_of_ten_is_synced_in_order_with_original_time(db_session):
    items = [captured(hours_ago=24 - index) for index in range(10)]

    response = send(items)

    body = response.json()
    assert response.status_code == 200
    assert body["batchId"] > 0 and body["serverTime"]
    assert [result["index"] for result in body["results"]] == list(range(10))
    assert [result["clientEventId"] for result in body["results"]] == [
        item["clientEventId"] for item in items
    ]
    assert all(result["status"] == "SINCRONIZADO" for result in body["results"])
    assert all(result["receivedAt"] for result in body["results"])

    stored = {
        row.client_event_id: row
        for row in db_session.query(OfflineSyncEvent).all()
    }
    assert len(stored) == 10
    for item in items:
        original = datetime.fromisoformat(item["fieldOccurredAt"].replace("Z", "+00:00"))
        saved = stored[item["clientEventId"]].field_occurred_at
        if saved.tzinfo is None:
            saved = saved.replace(tzinfo=timezone.utc)
        assert saved == original


def test_client_sync_status_is_ignored():
    response = send([captured(syncStatus="SINCRONIZADO")])

    assert response.json()["results"][0]["status"] == "SINCRONIZADO"


def test_each_request_writes_one_batch_log_with_counts(db_session):
    headers = login()
    existing = captured()
    send([existing], headers)

    send([captured(), existing, captured(eventType="CHECKUP", finding=None)], headers)

    log = db_session.query(OfflineSyncBatchLog).order_by(OfflineSyncBatchLog.id.desc()).first()
    assert db_session.query(OfflineSyncBatchLog).count() == 2
    assert log.user_email == OPERARIO
    assert log.active_farm_id == 1
    assert (log.items_total, log.synced_count, log.duplicate_count) == (3, 1, 1)
    assert (log.failed_retryable_count, log.failed_final_count) == (0, 1)


def test_batch_size_limits():
    assert send([]).status_code == 422
    assert send([captured() for _ in range(51)]).status_code == 422
    assert send([captured() for _ in range(50)]).status_code == 200


# --- US2: idempotency --------------------------------------------------------


def test_ac3_resend_after_lost_response(db_session):
    headers = login()
    event = captured()
    first = send([event], headers).json()["results"][0]

    resent = send([event], headers).json()["results"][0]

    assert resent["status"] == "DUPLICADO"
    assert resent["receivedAt"] == first["receivedAt"]
    assert (
        db_session.query(OfflineSyncEvent)
        .filter_by(client_event_id=event["clientEventId"])
        .count()
        == 1
    )


def test_one_hundred_resends_keep_a_single_record(db_session):
    headers = login()
    event = captured()
    send([event], headers)

    statuses = {send([event], headers).json()["results"][0]["status"] for _ in range(100)}

    assert statuses == {"DUPLICADO"}
    assert db_session.query(OfflineSyncEvent).count() == 1


def test_same_id_twice_in_batch():
    event = captured()

    results = send([event, event]).json()["results"]

    assert [result["status"] for result in results] == ["SINCRONIZADO", "DUPLICADO"]


def test_event_already_synced_by_the_preliminary_endpoint_is_duplicate(db_session):
    event = captured(origin="LEGACY")
    db_session.add(
        SanitaryEvent(
            client_event_id=event["clientEventId"],
            din=event["din"],
            event_type=event["eventType"],
            field_occurred_at=datetime.now(timezone.utc),
            author_email=OPERARIO,
        )
    )
    db_session.commit()

    result = send([event]).json()["results"][0]

    assert result["status"] == "DUPLICADO"
    assert db_session.query(OfflineSyncEvent).count() == 0
