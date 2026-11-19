from uuid import uuid4

from fastapi.testclient import TestClient

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


def test_veterinarian_correction_creates_new_version_and_preserves_original():
    operario_headers = login("operario@bovinotech.co")
    veterinarian_headers = login("vet@bovinotech.co")
    event_id, client_event_id = create_event(operario_headers)

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
