"""HTTP contract for the additive ``farmId`` field (ADR D10).

The farm is never accepted from the client. These tests assert that ticket
responses expose the farm of the token and that the ticket row stores it.
"""

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

COMPARISONS_PATH = "/integrations/sinigan-sync/comparisons"
TICKETS_PATH = "/integrations/sinigan-sync/tickets"

OPERARIO_EMAIL = "operario@bovinotech.co"
VETERINARIO_EMAIL = "vet@bovinotech.co"
MULTI_FARM_VET_EMAIL = "vet2@bovinotech.co"
PASSWORD = "password123"

VALID_REASON = (
    "Se valida la ficha oficial y se solicita corrección del registro de campo."
)


def login(email: str, farm_id: int | None = None) -> dict[str, str]:
    data = {"username": email, "password": PASSWORD}
    if farm_id is not None:
        data["farm_id"] = str(farm_id)
    response = client.post("/auth/login", data=data)
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def compare(din: str, headers: dict[str, str]):
    return client.post(COMPARISONS_PATH, headers=headers, json={"din": din})


def create_open_ticket(din: str, headers: dict[str, str]) -> dict:
    response = compare(din, headers)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["result"] == "DISCREPANCIA", body
    return body


def test_ticket_summary_detail_and_resolution_expose_farm_id(db_session):
    from app.features.sinigan_sync.models import ReconciliationTicket

    headers = login(OPERARIO_EMAIL)  # farm 1
    comparison = create_open_ticket("DIN-DEMO-000002", headers)
    ticket_id = comparison["ticket"]["id"]

    assert comparison["ticket"]["farmId"] == 1

    listing = client.get(TICKETS_PATH, headers=headers)
    assert listing.status_code == 200, listing.text
    summary = next(
        item
        for item in listing.json()["items"]
        if item["id"] == ticket_id
    )
    assert summary["farmId"] == 1

    detail = client.get(f"{TICKETS_PATH}/{ticket_id}", headers=headers)
    assert detail.status_code == 200, detail.text
    assert detail.json()["farmId"] == 1

    veterinarian_headers = login(VETERINARIO_EMAIL)  # farm 1
    resolution = client.post(
        f"{TICKETS_PATH}/{ticket_id}/resolution",
        headers=veterinarian_headers,
        json={"decision": "OFICIAL_PREVALECE", "reason": VALID_REASON},
    )
    assert resolution.status_code == 201, resolution.text
    assert resolution.json()["farmId"] == 1

    row = db_session.get(ReconciliationTicket, ticket_id)
    assert row is not None
    assert row.farm_id == 1, (
        "El ticket debe persistir la finca activa del token, no un valor "
        "enviado por el cliente"
    )


def test_ticket_persists_the_active_farm_of_a_multi_farm_token(db_session):
    from app.features.sinigan_sync.models import (
        FieldAnimalRecord,
        ReconciliationTicket,
    )

    record = (
        db_session.query(FieldAnimalRecord)
        .filter(FieldAnimalRecord.din == "DIN-DEMO-000002")
        .one()
    )
    record.farm_id = 2
    db_session.commit()

    headers = login(MULTI_FARM_VET_EMAIL, farm_id=2)
    comparison = create_open_ticket("DIN-DEMO-000002", headers)
    ticket_id = comparison["ticket"]["id"]

    assert comparison["ticket"]["farmId"] == 2

    row = db_session.get(ReconciliationTicket, ticket_id)
    assert row is not None and row.farm_id == 2

    farm_two_listing = client.get(TICKETS_PATH, headers=headers)
    assert ticket_id in {
        item["id"] for item in farm_two_listing.json()["items"]
    }

    farm_one_headers = login(OPERARIO_EMAIL)  # farm 1
    farm_one_listing = client.get(TICKETS_PATH, headers=farm_one_headers)
    assert ticket_id not in {
        item["id"] for item in farm_one_listing.json()["items"]
    }
