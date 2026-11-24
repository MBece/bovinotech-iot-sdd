from uuid import uuid4

from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def auth_headers(email: str = "operario@bovinotech.co") -> dict[str, str]:
    response = client.post(
        "/auth/login",
        data={"username": email, "password": "password123"},
    )
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def test_sync_batch_is_idempotent_and_rejects_unknown_din():
    headers = auth_headers()
    client_event_id = str(uuid4())
    valid_item = {
        "clientEventId": client_event_id,
        "din": "DIN-DEMO-000001",
        "eventType": "VACCINATION",
        "fieldOccurredAt": "2026-11-18T20:30:00-05:00",
        "product": "Vacuna UX",
        "dose": 5,
        "doseUnit": "ml",
        "notes": "Registro académico de prueba",
    }

    created = client.post("/sync/batches", json={"items": [valid_item]}, headers=headers)
    duplicate = client.post("/sync/batches", json={"items": [valid_item]}, headers=headers)
    rejected = client.post(
        "/sync/batches",
        json={
            "items": [
                {
                    **valid_item,
                    "clientEventId": str(uuid4()),
                    "din": "DIN-DEMO-999999",
                }
            ]
        },
        headers=headers,
    )

    assert created.status_code == 200
    assert created.json()["results"][0]["status"] == "SINCRONIZADO"
    assert duplicate.status_code == 200
    assert duplicate.json()["results"][0]["status"] == "DUPLICADO"
    assert rejected.status_code == 200
    assert rejected.json()["results"][0]["status"] == "FALLIDO"


def test_sync_contract_validates_payload_and_authentication():
    missing_auth = client.post("/sync/batches", json={"items": []})
    invalid_payload = client.post(
        "/sync/batches",
        json={"items": [{"clientEventId": "not-a-uuid"}]},
        headers=auth_headers(),
    )

    assert missing_auth.status_code == 401
    assert invalid_payload.status_code == 422


def test_sync_denies_administrator_and_directive_roles():
    payload = {
        "items": [
            {
                "clientEventId": str(uuid4()),
                "din": "DIN-DEMO-000001",
                "eventType": "CHECKUP",
                "fieldOccurredAt": "2026-11-18T20:30:00-05:00",
                "finding": "Sin hallazgos",
            }
        ]
    }

    administrator = client.post(
        "/sync/batches",
        json=payload,
        headers=auth_headers("admin@bovinotech.co"),
    )
    directive = client.post(
        "/sync/batches",
        json=payload,
        headers=auth_headers("directivo@bovinotech.co"),
    )

    assert administrator.status_code == 403
    assert directive.status_code == 403
