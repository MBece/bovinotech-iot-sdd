"""Cross-tenant security for HU-05 ``sinigan_sync`` (ADR D10).

This layer uses the real login endpoint (JSON body, including ``farm_id`` for a
multi-farm account) and the real HTTP API. It complements the contract tests by
proving that a cross-farm resolution attempt returns ``404`` and leaves **zero**
writes behind, and that a legacy token without the ``farm_id`` claim fails
closed with ``403`` on all four HU-05 endpoints.
"""

from fastapi.testclient import TestClient
from sqlalchemy import func

from app.features.auth.security import create_access_token
from app.main import app
from app.features.sinigan_sync.models import (
    ReconciliationDiscrepancy,
    ReconciliationResolution,
    ReconciliationTicket,
)

client = TestClient(app)

COMPARISONS_PATH = "/integrations/sinigan-sync/comparisons"
TICKETS_PATH = "/integrations/sinigan-sync/tickets"

OPERARIO_EMAIL = "operario@bovinotech.co"
VETERINARIO_EMAIL = "vet@bovinotech.co"
MULTI_FARM_VET_EMAIL = "vet2@bovinotech.co"
PASSWORD = "password123"

TICKET_NOT_FOUND = "Ticket de conciliación no encontrado."
ACTIVE_FARM_REQUIRED = (
    "Se requiere una finca activa para operar la conciliación."
)
VALID_REASON = (
    "Se valida la ficha oficial y se solicita corrección del registro de campo."
)


def api_login(email: str, farm_id: int | None = None) -> str:
    """Log in through the real JSON endpoint and return the access token."""

    payload: dict[str, object] = {
        "username": email,
        "password": PASSWORD,
    }
    if farm_id is not None:
        payload["farm_id"] = farm_id

    response = client.post("/auth/login", json=payload)
    assert response.status_code == 200, response.text
    body = response.json()
    assert isinstance(body.get("access_token"), str) and body["access_token"]
    if farm_id is not None:
        assert body.get("farm_id") == farm_id, body
    return body["access_token"]


def auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def create_farm_one_ticket(din: str = "DIN-DEMO-000002") -> int:
    """Create an OPEN discrepancy ticket as the farm-one operator."""

    token = api_login(OPERARIO_EMAIL)  # single farm: 1
    response = client.post(
        COMPARISONS_PATH,
        headers=auth_headers(token),
        json={"din": din},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["result"] == "DISCREPANCIA", body
    assert body["ticket"]["status"] == "OPEN", body
    assert body["ticket"]["farmId"] == 1, body
    assert body["ticket"]["createdByEmail"] == OPERARIO_EMAIL, body
    return body["ticket"]["id"]


def persisted_state(db_session, ticket_id: int) -> dict:
    """Snapshot every table a cross-farm attempt could mutate."""

    db_session.rollback()
    db_session.expire_all()

    ticket = db_session.get(ReconciliationTicket, ticket_id)
    assert ticket is not None, f"Ticket {ticket_id} disappeared"

    resolution_count = (
        db_session.query(func.count(ReconciliationResolution.id))
        .filter(ReconciliationResolution.ticket_id == ticket_id)
        .scalar()
    )
    discrepancy_count = (
        db_session.query(func.count(ReconciliationDiscrepancy.id))
        .filter(ReconciliationDiscrepancy.ticket_id == ticket_id)
        .scalar()
    )
    return {
        "ticket_status": ticket.status,
        "ticket_closed_at": (
            ticket.closed_at.isoformat() if ticket.closed_at else None
        ),
        "resolution_count": resolution_count,
        "discrepancy_count": discrepancy_count,
        "total_tickets": db_session.query(
            func.count(ReconciliationTicket.id)
        ).scalar(),
        "total_resolutions": db_session.query(
            func.count(ReconciliationResolution.id)
        ).scalar(),
    }


# ---------------------------------------------------------------------------
# A multi-farm veterinarian in farm 2 cannot read or resolve a farm-one ticket
# ---------------------------------------------------------------------------


def test_other_farm_cannot_list_detail_or_resolve_and_writes_nothing(
    db_session,
):
    ticket_id = create_farm_one_ticket()
    before = persisted_state(db_session, ticket_id)

    other_farm_token = api_login(MULTI_FARM_VET_EMAIL, farm_id=2)
    headers = auth_headers(other_farm_token)

    listing = client.get(TICKETS_PATH, headers=headers)
    assert listing.status_code == 200, listing.text
    listed_ids = {item["id"] for item in listing.json()["items"]}
    assert ticket_id not in listed_ids, (
        "Un ticket de la finca 1 no debe aparecer en el listado de la finca 2"
    )

    detail = client.get(f"{TICKETS_PATH}/{ticket_id}", headers=headers)
    assert detail.status_code == 404, detail.text
    assert detail.json()["detail"] == TICKET_NOT_FOUND

    resolution = client.post(
        f"{TICKETS_PATH}/{ticket_id}/resolution",
        headers=headers,
        json={"decision": "OFICIAL_PREVALECE", "reason": VALID_REASON},
    )
    assert resolution.status_code == 404, resolution.text
    assert resolution.json()["detail"] == TICKET_NOT_FOUND, (
        "Una resolución de otra finca debe responder igual que un ticket "
        "inexistente"
    )

    after = persisted_state(db_session, ticket_id)
    assert after == before, (
        "Una resolución rechazada por finca no debe escribir nada: "
        f"before={before} after={after}"
    )
    assert after["ticket_status"] == "OPEN"
    assert after["resolution_count"] == 0


# ---------------------------------------------------------------------------
# The same multi-farm veterinarian sees the ticket when farm 1 is active
# ---------------------------------------------------------------------------


def test_multi_farm_veterinarian_sees_ticket_in_its_active_farm():
    ticket_id = create_farm_one_ticket()

    same_farm_token = api_login(MULTI_FARM_VET_EMAIL, farm_id=1)
    headers = auth_headers(same_farm_token)

    listing = client.get(TICKETS_PATH, headers=headers)
    assert listing.status_code == 200, listing.text
    summary = next(
        (
            item
            for item in listing.json()["items"]
            if item["id"] == ticket_id
        ),
        None,
    )
    assert summary is not None, (
        "El ticket de la finca 1 debe aparecer para el veterinario multifinca "
        "cuando opera la finca 1"
    )
    assert summary["farmId"] == 1

    detail = client.get(f"{TICKETS_PATH}/{ticket_id}", headers=headers)
    assert detail.status_code == 200, detail.text
    body = detail.json()
    assert body["farmId"] == 1
    assert body["status"] == "OPEN"
    assert body["din"] == "DIN-DEMO-000002"


# ---------------------------------------------------------------------------
# A pre-HU-01 token without ``farm_id`` fails closed on all four endpoints
# ---------------------------------------------------------------------------


def legacy_token(email: str, role: str) -> str:
    return create_access_token(
        {"sub": email, "role": role, "pwd_change": False}
    )


def test_legacy_token_without_farm_claim_gets_403_and_writes_nothing(
    db_session,
):
    ticket_id = create_farm_one_ticket()
    before = persisted_state(db_session, ticket_id)

    operario_headers = auth_headers(legacy_token(OPERARIO_EMAIL, "OPERARIO"))
    veterinarian_headers = auth_headers(
        legacy_token(VETERINARIO_EMAIL, "VETERINARIO")
    )

    responses = {
        "comparisons": client.post(
            COMPARISONS_PATH,
            headers=operario_headers,
            json={"din": "DIN-DEMO-000001"},
        ),
        "tickets": client.get(TICKETS_PATH, headers=operario_headers),
        "ticket_detail": client.get(
            f"{TICKETS_PATH}/{ticket_id}", headers=operario_headers
        ),
        "resolution": client.post(
            f"{TICKETS_PATH}/{ticket_id}/resolution",
            headers=veterinarian_headers,
            json={"decision": "OFICIAL_PREVALECE", "reason": VALID_REASON},
        ),
    }

    for name, response in responses.items():
        assert response.status_code == 403, f"{name}: {response.text}"
        assert response.json()["detail"] == ACTIVE_FARM_REQUIRED, name

    after = persisted_state(db_session, ticket_id)
    assert after == before, (
        "Un token legado sin finca no debe escribir nada: "
        f"before={before} after={after}"
    )
    assert after["ticket_status"] == "OPEN"
    assert after["resolution_count"] == 0
