"""UTC serialization guarantees for HU-05 ``sinigan_sync`` (M-01).

SQLite drops the timezone offset, so these tests go through the public API and
assert that every exposed datetime is rendered as UTC with a ``Z`` suffix, as
required by ``contracts/sinigan-sync-api.md``.
"""

from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)

COMPARISONS_PATH = "/integrations/sinigan-sync/comparisons"
TICKETS_PATH = "/integrations/sinigan-sync/tickets"

OPERARIO_EMAIL = "operario@bovinotech.co"
VETERINARIO_EMAIL = "vet@bovinotech.co"
PASSWORD = "password123"

VALID_REASON = (
    "Se valida la ficha oficial y se solicita corrección del registro de campo."
)


def login(email: str) -> dict[str, str]:
    response = client.post(
        "/auth/login",
        data={"username": email, "password": PASSWORD},
    )
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def assert_utc_z(value: str) -> None:
    assert isinstance(value, str) and value.endswith("Z"), (
        f"El datetime debe serializarse como UTC con sufijo Z: {value!r}"
    )


def create_open_ticket(headers: dict[str, str]) -> int:
    response = client.post(
        COMPARISONS_PATH, headers=headers, json={"din": "DIN-DEMO-000002"}
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["result"] == "DISCREPANCIA", body
    assert body["ticket"]["status"] == "OPEN", body
    return body["ticket"]["id"]


def test_comparison_exposes_utc_timestamps_with_z_suffix(db_session):
    headers = login(OPERARIO_EMAIL)

    response = client.post(
        COMPARISONS_PATH, headers=headers, json={"din": "DIN-DEMO-000002"}
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert_utc_z(body["field"]["updatedAt"])
    assert_utc_z(body["meta"]["comparedAt"])
    assert_utc_z(body["ticket"]["comparedAt"])
    assert_utc_z(body["ticket"]["createdAt"])
    assert_utc_z(body["discrepancies"][0]["detectedAt"])


def test_ticket_detail_exposes_utc_timestamps_with_z_suffix(db_session):
    headers = login(OPERARIO_EMAIL)
    ticket_id = create_open_ticket(headers)

    response = client.get(f"{TICKETS_PATH}/{ticket_id}", headers=headers)

    assert response.status_code == 200, response.text
    body = response.json()
    assert_utc_z(body["comparedAt"])
    assert_utc_z(body["createdAt"])
    assert_utc_z(body["discrepancies"][0]["detectedAt"])


def test_resolution_exposes_utc_timestamps_with_z_suffix(db_session):
    operario_headers = login(OPERARIO_EMAIL)
    veterinarian_headers = login(VETERINARIO_EMAIL)
    ticket_id = create_open_ticket(operario_headers)

    response = client.post(
        f"{TICKETS_PATH}/{ticket_id}/resolution",
        headers=veterinarian_headers,
        json={"decision": "OFICIAL_PREVALECE", "reason": VALID_REASON},
    )

    assert response.status_code == 201, response.text
    body = response.json()
    assert_utc_z(body["closedAt"])
    assert_utc_z(body["resolution"]["resolvedAt"])

    detail = client.get(
        f"{TICKETS_PATH}/{ticket_id}", headers=veterinarian_headers
    )
    assert detail.status_code == 200, detail.text
    detail_body = detail.json()
    assert_utc_z(detail_body["closedAt"])
    assert_utc_z(detail_body["resolution"]["resolvedAt"])
