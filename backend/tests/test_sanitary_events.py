from types import SimpleNamespace
from datetime import datetime, timezone
from uuid import uuid4

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.core.database import get_db
from app.features.sanitary_events.models import SanitaryEvent
from app.features.sanitary_events.router import sync_service
from app.features.sanitary_events.schemas import SyncBatchRequest
from app.main import app


client = TestClient(app)


def login(email: str, farm_id: int | None = None) -> dict[str, str]:
    form = {"username": email, "password": "password123"}
    if farm_id is not None:
        form["farm_id"] = str(farm_id)
    response = client.post(
        "/auth/login",
        data=form,
    )
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def seed_event(db_session, *, din: str, occurred_at: datetime, notes: str) -> SanitaryEvent:
    event = SanitaryEvent(
        client_event_id=str(uuid4()),
        din=din,
        event_type="TREATMENT",
        field_occurred_at=occurred_at,
        author_email="operario@bovinotech.co",
        notes=notes,
        farm_id=1,
    )
    db_session.add(event)
    db_session.commit()
    db_session.refresh(event)
    return event


def test_history_is_chronological_for_din(db_session):
    headers = login("operario@bovinotech.co")
    din = "DIN-HU04-0001"
    seed_event(
        db_session,
        din=din,
        occurred_at=datetime(2026, 11, 20, 12, tzinfo=timezone.utc),
        notes="Later event",
    )
    seed_event(
        db_session,
        din=din,
        occurred_at=datetime(2026, 11, 19, 12, tzinfo=timezone.utc),
        notes="Earlier event",
    )

    response = client.get(f"/sanitary-events/animals/{din}", headers=headers)

    assert response.status_code == 200
    assert [item["notes"] for item in response.json()["items"]] == [
        "Earlier event",
        "Later event",
    ]


def test_correction_appends_linked_event_without_changing_original(db_session):
    headers = login("vet@bovinotech.co")
    source = seed_event(
        db_session,
        din="DIN-HU04-0002",
        occurred_at=datetime(2026, 11, 20, 12, tzinfo=timezone.utc),
        notes="Original clinical note",
    )
    original_snapshot = {
        column.name: getattr(source, column.name)
        for column in SanitaryEvent.__table__.columns
    }

    response = client.post(
        f"/sanitary-events/{source.id}/correct",
        headers=headers,
        json={
            "clientEventId": str(uuid4()),
            "eventType": "TREATMENT",
            "fieldOccurredAt": "2026-11-20T12:00:00Z",
            "dose": 2.5,
            "notes": "Corrected clinical note",
            "reason": "La dosis original fue transcrita incorrectamente",
        },
    )

    assert response.status_code == 201
    correction = response.json()
    assert correction["correctedEventId"] == source.id
    assert correction["id"] != source.id
    db_session.expire_all()
    persisted_source = db_session.get(SanitaryEvent, source.id)
    assert {
        column.name: getattr(persisted_source, column.name)
        for column in SanitaryEvent.__table__.columns
    } == original_snapshot
    assert db_session.query(SanitaryEvent).count() == 2


def test_operario_cannot_correct_sanitary_event(db_session):
    headers = login("operario@bovinotech.co")
    source = seed_event(
        db_session,
        din="DIN-HU04-0003",
        occurred_at=datetime(2026, 11, 20, 12, tzinfo=timezone.utc),
        notes="Original clinical note",
    )

    response = client.post(
        f"/sanitary-events/{source.id}/correct",
        headers=headers,
        json={
            "clientEventId": str(uuid4()),
            "eventType": "TREATMENT",
            "fieldOccurredAt": "2026-11-20T12:00:00Z",
            "notes": "Unauthorized change",
            "reason": "Attempt by an operario",
        },
    )

    assert response.status_code == 403
    assert db_session.query(SanitaryEvent).count() == 1


def test_empty_history_does_not_create_records(db_session):
    headers = login("operario@bovinotech.co")

    response = client.get(
        "/sanitary-events/animals/DIN-HU04-EMPTY",
        headers=headers,
    )

    assert response.status_code == 200
    assert response.json()["items"] == []
    assert db_session.query(SanitaryEvent).count() == 0


def test_correction_retry_is_idempotent_and_reason_must_not_be_blank(db_session):
    headers = login("vet@bovinotech.co")
    source = seed_event(
        db_session,
        din="DIN-HU04-0004",
        occurred_at=datetime(2026, 11, 20, 12, tzinfo=timezone.utc),
        notes="Original clinical note",
    )
    payload = {
        "clientEventId": str(uuid4()),
        "eventType": "TREATMENT",
        "fieldOccurredAt": "2026-11-20T12:00:00Z",
        "notes": "Corrected clinical note",
        "reason": "La nota original requiere corrección",
    }

    first = client.post(
        f"/sanitary-events/{source.id}/correct",
        headers=headers,
        json=payload,
    )
    retry = client.post(
        f"/sanitary-events/{source.id}/correct",
        headers=headers,
        json=payload,
    )
    blank_reason = client.post(
        f"/sanitary-events/{source.id}/correct",
        headers=headers,
        json={**payload, "clientEventId": str(uuid4()), "reason": "   "},
    )

    assert first.status_code == 201
    assert retry.status_code == 201
    assert retry.json()["id"] == first.json()["id"]
    assert blank_reason.status_code == 422
    assert db_session.query(SanitaryEvent).count() == 2


def test_missing_correction_target_and_reused_uuid_with_different_content_are_rejected(
    db_session,
):
    headers = login("vet@bovinotech.co")
    source = seed_event(
        db_session,
        din="DIN-HU04-0005",
        occurred_at=datetime(2026, 11, 20, 12, tzinfo=timezone.utc),
        notes="Original clinical note",
    )
    payload = {
        "clientEventId": str(uuid4()),
        "eventType": "TREATMENT",
        "fieldOccurredAt": "2026-11-20T12:00:00Z",
        "notes": "Corrected clinical note",
        "reason": "La nota original requiere corrección",
    }

    missing_target = client.post(
        "/sanitary-events/999999/correct",
        headers=headers,
        json=payload,
    )
    created = client.post(
        f"/sanitary-events/{source.id}/correct",
        headers=headers,
        json=payload,
    )
    conflicting_retry = client.post(
        f"/sanitary-events/{source.id}/correct",
        headers=headers,
        json={**payload, "notes": "Different corrected content"},
    )

    assert missing_target.status_code == 404
    assert created.status_code == 201
    assert conflicting_retry.status_code == 409
    assert db_session.query(SanitaryEvent).count() == 2


def test_history_is_limited_to_active_farm(db_session):
    seed_event(
        db_session,
        din="DIN-HU04-FARM",
        occurred_at=datetime(2026, 11, 20, 12, tzinfo=timezone.utc),
        notes="Farm one event",
    )
    farm_two_headers = login("vet2@bovinotech.co", farm_id=2)

    response = client.get(
        "/sanitary-events/animals/DIN-HU04-FARM",
        headers=farm_two_headers,
    )

    assert response.status_code == 200
    assert response.json()["items"] == []


def test_offline_batch_rejects_user_without_active_farm(db_session):
    user_without_farm = SimpleNamespace(
        email="operario@bovinotech.co",
        active_farm_id=None,
    )
    batch = SyncBatchRequest(
        items=[
            {
                "clientEventId": str(uuid4()),
                "din": "DIN-DEMO-000002",
                "eventType": "TREATMENT",
                "fieldOccurredAt": "2026-11-20T12:00:00Z",
            }
        ]
    )

    with pytest.raises(HTTPException) as error:
        sync_service.process_batch(batch, user_without_farm, db_session)

    assert error.value.status_code == 403
    assert db_session.query(SanitaryEvent).count() == 0
