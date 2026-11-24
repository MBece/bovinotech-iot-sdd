from datetime import datetime, timezone
from uuid import uuid4

from fastapi.testclient import TestClient

from app.features.sanitary_events.models import SanitaryEvent
from app.main import app


client = TestClient(app)


def login(email: str) -> dict[str, str]:
    response = client.post(
        "/auth/login",
        data={"username": email, "password": "password123"},
    )
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def create_event(headers: dict[str, str]) -> tuple[int, str]:
    client_event_id = str(uuid4())
    response = client.post(
        "/sync/batches",
        headers=headers,
        json={
            "items": [
                {
                    "clientEventId": client_event_id,
                    "din": "DIN-DEMO-000002",
                    "eventType": "TREATMENT",
                    "fieldOccurredAt": "2026-11-18T18:30:00-05:00",
                    "dose": 3,
                    "notes": "Observación original",
                }
            ]
        },
    )
    assert response.status_code == 200
    return response.json()["results"][0]["eventId"], client_event_id


def correction_payload(base_version: int, notes: str = "Observación corregida") -> dict:
    return {
        "baseVersion": base_version,
        "eventType": "TREATMENT",
        "fieldOccurredAt": "2026-11-18T18:30:00-05:00",
        "dose": 2.5,
        "notes": notes,
        "reason": "Ajuste de dosis registrado por el veterinario",
    }


def test_veterinarian_correction_creates_new_version_and_preserves_original(db_session):
    operario_headers = login("operario@bovinotech.co")
    veterinarian_headers = login("vet@bovinotech.co")
    event_id, client_event_id = create_event(operario_headers)
    source = db_session.get(SanitaryEvent, event_id)
    original_snapshot = {
        column.name: getattr(source, column.name)
        for column in SanitaryEvent.__table__.columns
    }

    correction = client.post(
        f"/sanitary-events/{event_id}/corrections",
        headers=veterinarian_headers,
        json=correction_payload(1),
    )
    history = client.get(
        "/sanitary-events/by-din/DIN-DEMO-000002/history",
        headers=veterinarian_headers,
    )

    assert correction.status_code == 201
    assert correction.json()["version"] == 2
    records = [
        item for item in history.json()["items"]
        if item["clientEventId"] == client_event_id
    ]
    assert [item["version"] for item in records] == [1, 2]
    assert records[0]["notes"] == "Observación original"
    assert records[1]["notes"] == "Observación corregida"
    assert records[1]["reason"] == "Ajuste de dosis registrado por el veterinario"
    appended = (
        db_session.query(SanitaryEvent)
        .filter(SanitaryEvent.corrected_event_id == event_id)
        .one()
    )
    db_session.expire_all()
    persisted_source = db_session.get(SanitaryEvent, event_id)
    assert {
        column.name: getattr(persisted_source, column.name)
        for column in SanitaryEvent.__table__.columns
    } == original_snapshot
    assert appended.reason == "Ajuste de dosis registrado por el veterinario"


def test_operario_cannot_correct_and_stale_version_is_rejected():
    operario_headers = login("operario@bovinotech.co")
    veterinarian_headers = login("vet@bovinotech.co")
    event_id, _ = create_event(operario_headers)

    denied = client.post(
        f"/sanitary-events/{event_id}/corrections",
        headers=operario_headers,
        json=correction_payload(1),
    )
    accepted = client.post(
        f"/sanitary-events/{event_id}/corrections",
        headers=veterinarian_headers,
        json=correction_payload(1),
    )
    stale = client.post(
        f"/sanitary-events/{event_id}/corrections",
        headers=veterinarian_headers,
        json=correction_payload(1, "Versión desactualizada"),
    )

    assert denied.status_code == 403
    assert accepted.status_code == 201
    assert stale.status_code == 409


def test_destructive_event_routes_are_not_available():
    headers = login("vet@bovinotech.co")
    event_id, _ = create_event(headers)

    update = client.put(f"/sanitary-events/{event_id}", headers=headers, json={})
    delete = client.delete(f"/sanitary-events/{event_id}", headers=headers)

    assert update.status_code in (404, 405)
    assert delete.status_code in (404, 405)


def test_legacy_history_is_limited_to_active_farm(db_session):
    db_session.add(
        SanitaryEvent(
            client_event_id=str(uuid4()),
            din="DIN-DEMO-000002",
            event_type="TREATMENT",
            field_occurred_at=datetime(2026, 11, 18, 18, 30, tzinfo=timezone.utc),
            author_email="vet2@bovinotech.co",
            farm_id=2,
            notes="Other farm event",
        )
    )
    db_session.commit()
    veterinarian_headers = login("vet@bovinotech.co")

    history = client.get(
        "/sanitary-events/by-din/DIN-DEMO-000002/history",
        headers=veterinarian_headers,
    )

    assert history.status_code == 200
    assert history.json()["items"] == []


def test_legacy_correction_rejects_event_from_another_farm(db_session):
    source = SanitaryEvent(
        client_event_id=str(uuid4()),
        din="DIN-DEMO-000002",
        event_type="TREATMENT",
        field_occurred_at=datetime(2026, 11, 18, 18, 30, tzinfo=timezone.utc),
        author_email="vet2@bovinotech.co",
        farm_id=2,
        notes="Other farm event",
    )
    db_session.add(source)
    db_session.commit()
    veterinarian_headers = login("vet@bovinotech.co")

    response = client.post(
        f"/sanitary-events/{source.id}/corrections",
        headers=veterinarian_headers,
        json=correction_payload(1),
    )

    assert response.status_code == 404
    assert db_session.query(SanitaryEvent).filter_by(id=source.id).count() == 1
