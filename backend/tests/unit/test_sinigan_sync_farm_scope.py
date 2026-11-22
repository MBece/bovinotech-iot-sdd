"""Farm isolation for HU-05 ``sinigan_sync`` (ADR D10).

The active farm is the tenant boundary: it comes only from the JWT ``farm_id``
claim, never from the request body or query string. These tests prove that
tickets and field records are invisible across farms and that a legacy token
without the claim fails closed on all four endpoints.
"""

from fastapi.testclient import TestClient

from app.features.auth.security import create_access_token
from app.main import app

client = TestClient(app)

COMPARISONS_PATH = "/integrations/sinigan-sync/comparisons"
TICKETS_PATH = "/integrations/sinigan-sync/tickets"

OPERARIO_EMAIL = "operario@bovinotech.co"
VETERINARIO_EMAIL = "vet@bovinotech.co"
MULTI_FARM_VET_EMAIL = "vet2@bovinotech.co"
PASSWORD = "password123"

ACTIVE_FARM_REQUIRED = (
    "Se requiere una finca activa para operar la conciliación."
)

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


def create_open_ticket(din: str, headers: dict[str, str]) -> int:
    response = compare(din, headers)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["result"] == "DISCREPANCIA", body
    assert body["ticket"]["status"] == "OPEN", body
    return body["ticket"]["id"]


def legacy_headers(email: str, role: str) -> dict[str, str]:
    """A pre-HU-01 token: authenticated but without a ``farm_id`` claim."""

    token = create_access_token(
        {"sub": email, "role": role, "pwd_change": False}
    )
    return {"Authorization": f"Bearer {token}"}


# ---------------------------------------------------------------------------
# Ticket visibility is per active farm
# ---------------------------------------------------------------------------


def test_ticket_created_in_farm_one_is_not_listed_from_farm_two():
    owner_headers = login(OPERARIO_EMAIL)  # farm 1
    ticket_id = create_open_ticket("DIN-DEMO-000002", owner_headers)

    other_farm_headers = login(MULTI_FARM_VET_EMAIL, farm_id=2)

    listing = client.get(TICKETS_PATH, headers=other_farm_headers)
    assert listing.status_code == 200, listing.text
    assert ticket_id not in {
        item["id"] for item in listing.json()["items"]
    }, "Un ticket de la finca 1 no debe aparecer en el listado de la finca 2"


def test_ticket_of_another_farm_returns_404_on_detail_and_resolution():
    owner_headers = login(OPERARIO_EMAIL)  # farm 1
    ticket_id = create_open_ticket("DIN-DEMO-000002", owner_headers)

    other_farm_headers = login(MULTI_FARM_VET_EMAIL, farm_id=2)

    detail = client.get(
        f"{TICKETS_PATH}/{ticket_id}", headers=other_farm_headers
    )
    assert detail.status_code == 404, detail.text
    assert detail.json()["detail"] == "Ticket de conciliación no encontrado."

    resolution = client.post(
        f"{TICKETS_PATH}/{ticket_id}/resolution",
        headers=other_farm_headers,
        json={"decision": "OFICIAL_PREVALECE", "reason": VALID_REASON},
    )
    assert resolution.status_code == 404, resolution.text
    assert (
        resolution.json()["detail"]
        == "Ticket de conciliación no encontrado."
    )


def test_same_ticket_is_visible_from_its_own_farm():
    owner_headers = login(OPERARIO_EMAIL)  # farm 1
    ticket_id = create_open_ticket("DIN-DEMO-000002", owner_headers)

    same_farm_headers = login(MULTI_FARM_VET_EMAIL, farm_id=1)

    listing = client.get(TICKETS_PATH, headers=same_farm_headers)
    assert listing.status_code == 200, listing.text
    summary = next(
        item
        for item in listing.json()["items"]
        if item["id"] == ticket_id
    )
    assert summary["farmId"] == 1

    detail = client.get(
        f"{TICKETS_PATH}/{ticket_id}", headers=same_farm_headers
    )
    assert detail.status_code == 200, detail.text
    assert detail.json()["farmId"] == 1


# ---------------------------------------------------------------------------
# Field records are searched inside the active farm only
# ---------------------------------------------------------------------------


def test_comparison_of_din_recorded_in_another_farm_returns_same_409(
    db_session,
):
    from app.features.sinigan_sync.models import FieldAnimalRecord

    record = (
        db_session.query(FieldAnimalRecord)
        .filter(FieldAnimalRecord.din == "DIN-DEMO-000002")
        .one()
    )
    record.farm_id = 2
    db_session.commit()

    farm_one_headers = login(OPERARIO_EMAIL)  # farm 1
    denied = compare("DIN-DEMO-000002", farm_one_headers)

    assert denied.status_code == 409, denied.text
    assert (
        denied.json()["detail"]
        == "No existe registro de campo para el DIN consultado."
    ), "No se debe revelar que el DIN existe en otra finca"

    farm_two_headers = login(MULTI_FARM_VET_EMAIL, farm_id=2)
    allowed = compare("DIN-DEMO-000002", farm_two_headers)

    assert allowed.status_code == 200, allowed.text
    body = allowed.json()
    assert body["result"] == "DISCREPANCIA", body
    assert body["ticket"]["farmId"] == 2


# ---------------------------------------------------------------------------
# Fail closed without an active farm
# ---------------------------------------------------------------------------


def test_token_without_farm_claim_gets_403_on_all_endpoints():
    operario_headers = legacy_headers(OPERARIO_EMAIL, "OPERARIO")
    veterinarian_headers = legacy_headers(VETERINARIO_EMAIL, "VETERINARIO")

    responses = {
        "comparisons": client.post(
            COMPARISONS_PATH,
            headers=operario_headers,
            json={"din": "DIN-DEMO-000001"},
        ),
        "tickets": client.get(TICKETS_PATH, headers=operario_headers),
        "ticket_detail": client.get(
            f"{TICKETS_PATH}/1", headers=operario_headers
        ),
        "resolution": client.post(
            f"{TICKETS_PATH}/1/resolution",
            headers=veterinarian_headers,
            json={
                "decision": "OFICIAL_PREVALECE",
                "reason": VALID_REASON,
            },
        ),
    }

    for name, response in responses.items():
        assert response.status_code == 403, f"{name}: {response.text}"
        assert response.json()["detail"] == ACTIVE_FARM_REQUIRED
