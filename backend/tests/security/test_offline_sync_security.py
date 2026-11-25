"""Security of POST /offline-sync/batches (HU-03 FR-016, FR-019, R7)."""
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.features.auth.models import AuthAuditLog, User
from app.features.offline_sync.models import OfflineSyncEvent
from app.main import app

client = TestClient(app)
BATCHES_PATH = "/offline-sync/batches"
MODULE_DIR = Path(__file__).resolve().parents[2] / "app/features/offline_sync"


def login(email: str, farm_id: int | None = None) -> dict[str, str]:
    data = {"username": email, "password": "password123"}
    if farm_id is not None:
        data["farm_id"] = str(farm_id)
    response = client.post("/auth/login", data=data)
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def captured(author="operario@bovinotech.co", farm_id=1, occurred=None) -> dict:
    occurred = occurred or datetime.now(timezone.utc) - timedelta(hours=1)
    return {
        "clientEventId": str(uuid4()),
        "eventType": "CHECKUP",
        "din": "DIN-DEMO-000001",
        "fieldOccurredAt": occurred.isoformat(),
        "finding": "Sin hallazgos",
        "authorEmail": author,
        "farmId": farm_id,
    }


def test_missing_token_is_unauthorized():
    assert client.post(BATCHES_PATH, json={"items": [captured()]}).status_code == 401


@pytest.mark.parametrize("email", ["directivo@bovinotech.co", "admin@bovinotech.co"])
def test_roles_without_capture_are_forbidden(email):
    response = client.post(
        BATCHES_PATH, json={"items": [captured(author=email)]}, headers=login(email)
    )

    assert response.status_code == 403


def test_events_of_another_author_are_rejected_and_not_stored(db_session):
    response = client.post(
        BATCHES_PATH,
        json={"items": [captured(author="vet@bovinotech.co")]},
        headers=login("operario@bovinotech.co"),
    )

    result = response.json()["results"][0]
    assert result["status"] == "FALLIDO"
    assert result["retryable"] is False
    assert result["errorCode"] == "AUTHOR_MISMATCH"
    assert db_session.query(OfflineSyncEvent).count() == 0


def test_events_of_a_foreign_farm_are_rejected(db_session):
    result = client.post(
        BATCHES_PATH,
        json={"items": [captured(farm_id=2)]},
        headers=login("operario@bovinotech.co"),
    ).json()["results"][0]

    assert result["errorCode"] == "FARM_NOT_ALLOWED"
    assert db_session.query(OfflineSyncEvent).count() == 0


def test_multi_farm_vet_can_sync_events_of_a_non_active_own_farm():
    result = client.post(
        BATCHES_PATH,
        json={"items": [captured(author="vet2@bovinotech.co", farm_id=2)]},
        headers=login("vet2@bovinotech.co", farm_id=1),
    ).json()["results"][0]

    assert result["status"] == "SINCRONIZADO"


def test_disabled_user_keeps_earlier_events_and_later_ones_are_reported(db_session):
    headers = login("operario@bovinotech.co")
    disabled_at = datetime.now(timezone.utc) + timedelta(seconds=2)
    operario = db_session.query(User).filter_by(email="operario@bovinotech.co").one()
    operario.is_active = False
    operario.disabled_at = disabled_at
    db_session.commit()
    before = captured(occurred=disabled_at - timedelta(hours=2))
    after = captured(occurred=disabled_at + timedelta(minutes=1))

    results = client.post(BATCHES_PATH, json={"items": [before, after]}, headers=headers).json()[
        "results"
    ]

    assert results[0]["status"] == "SINCRONIZADO"
    assert results[1]["errorCode"] == "AUTHOR_DISABLED"
    audit = db_session.query(AuthAuditLog).filter_by(action="SYNC_REJECTED_AFTER_DISABLE").one()
    assert after["clientEventId"] in audit.details


def test_module_never_updates_or_deletes_synced_events():
    source = "\n".join(path.read_text(encoding="utf-8") for path in MODULE_DIR.glob("*.py"))

    assert not re.search(r"\.(update|delete)\(", source)
    assert not re.search(r"\b(UPDATE|DELETE)\b", source)


def test_resend_with_changes_leaves_the_original_row_intact(db_session):
    headers = login("operario@bovinotech.co")
    event = captured()
    client.post(BATCHES_PATH, json={"items": [event]}, headers=headers)

    client.post(
        BATCHES_PATH, json={"items": [{**event, "finding": "Alterado"}]}, headers=headers
    )

    row = db_session.query(OfflineSyncEvent).one()
    assert row.finding == "Sin hallazgos"


def test_client_cannot_set_its_own_validation_status(db_session):
    """Validation belongs to HU-04: the server always stores the initial state."""
    event = {**captured(), "validationStatus": "VALIDADO"}

    result = client.post(
        BATCHES_PATH, json={"items": [event]}, headers=login("operario@bovinotech.co")
    ).json()["results"][0]

    assert result["status"] == "SINCRONIZADO"
    assert db_session.query(OfflineSyncEvent).one().validation_status == "PENDIENTE_VALIDACION"
