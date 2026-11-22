"""Security regression tests for HU-05 ``sinigan_sync``.

Covers RBAC on resolution, authentication, mass assignment and the absence of
destructive HTTP routes. Written before the implementation (TDD red phase).
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


def registered_route_paths() -> set[str]:
    return {getattr(route, "path", "") for route in app.routes}


def assert_sinigan_sync_router_registered() -> None:
    paths = registered_route_paths()
    assert COMPARISONS_PATH in paths, (
        "El router sinigan_sync no está registrado: "
        f"falta POST {COMPARISONS_PATH}"
    )
    assert TICKETS_PATH in paths, (
        "El router sinigan_sync no está registrado: "
        f"falta GET {TICKETS_PATH}"
    )


def create_open_ticket(din: str, headers: dict[str, str]) -> int:
    response = client.post(
        COMPARISONS_PATH, headers=headers, json={"din": din}
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["result"] == "DISCREPANCIA", body
    assert body["ticket"]["status"] == "OPEN", body
    return body["ticket"]["id"]


def test_operario_cannot_resolve_ticket():
    assert_sinigan_sync_router_registered()
    operario_headers = login(OPERARIO_EMAIL)
    ticket_id = create_open_ticket("DIN-DEMO-000002", operario_headers)

    response = client.post(
        f"{TICKETS_PATH}/{ticket_id}/resolution",
        headers=operario_headers,
        json={"decision": "OFICIAL_PREVALECE", "reason": VALID_REASON},
    )

    assert response.status_code == 403, response.text
    detail = client.get(f"{TICKETS_PATH}/{ticket_id}", headers=operario_headers)
    assert detail.status_code == 200, detail.text
    assert detail.json()["status"] == "OPEN"


def test_all_sinigan_sync_endpoints_reject_unauthenticated_requests():
    assert_sinigan_sync_router_registered()

    responses = {
        "comparisons": client.post(
            COMPARISONS_PATH, json={"din": "DIN-DEMO-000001"}
        ),
        "tickets": client.get(TICKETS_PATH),
        "ticket_detail": client.get(f"{TICKETS_PATH}/1"),
        "resolution": client.post(
            f"{TICKETS_PATH}/1/resolution",
            json={"decision": "OFICIAL_PREVALECE", "reason": VALID_REASON},
        ),
    }

    for name, response in responses.items():
        assert response.status_code == 401, f"{name}: {response.text}"


def test_comparison_request_cannot_mass_assign_control_fields():
    assert_sinigan_sync_router_registered()
    headers = login(OPERARIO_EMAIL)

    response = client.post(
        COMPARISONS_PATH,
        headers=headers,
        json={
            "din": "DIN-DEMO-000002",
            "status": "CLOSED",
            "resolvedByEmail": "atacante@example.com",
            "officialSource": "MODO SIMULADO (SINIGÁN V6 MOCK)",
        },
    )

    assert response.status_code == 422, response.text


def test_resolution_request_cannot_mass_assign_status_author_or_source():
    assert_sinigan_sync_router_registered()
    operario_headers = login(OPERARIO_EMAIL)
    veterinarian_headers = login(VETERINARIO_EMAIL)
    ticket_id = create_open_ticket("DIN-DEMO-000002", operario_headers)

    response = client.post(
        f"{TICKETS_PATH}/{ticket_id}/resolution",
        headers=veterinarian_headers,
        json={
            "decision": "OFICIAL_PREVALECE",
            "reason": VALID_REASON,
            "status": "CLOSED",
            "resolvedByEmail": "atacante@example.com",
            "officialSource": "MODO SIMULADO (SINIGÁN V6 MOCK)",
        },
    )

    assert response.status_code == 422, response.text

    detail = client.get(
        f"{TICKETS_PATH}/{ticket_id}", headers=veterinarian_headers
    )
    assert detail.status_code == 200, detail.text
    body = detail.json()
    assert body["status"] == "OPEN"
    assert body["resolution"] is None


def test_ticket_routes_are_not_destructive():
    assert_sinigan_sync_router_registered()
    headers = login(VETERINARIO_EMAIL)
    ticket_id = create_open_ticket("DIN-DEMO-000002", headers)

    attempts = []
    for method in ("put", "patch", "delete"):
        for url in (
            f"{TICKETS_PATH}/{ticket_id}",
            f"{TICKETS_PATH}/{ticket_id}/resolution",
        ):
            # ``TestClient.delete`` on httpx 0.27 has no body keyword; use the
            # generic request API so the test does not need a compatibility shim.
            if method == "delete":
                attempts.append(client.request("DELETE", url, headers=headers))
            else:
                attempts.append(
                    getattr(client, method)(url, headers=headers, json={})
                )

    for response in attempts:
        assert response.status_code in (404, 405), (
            "No deben existir rutas destructivas sobre tickets: "
            f"{response.request.method} {response.request.url} -> "
            f"{response.status_code}"
        )

    detail = client.get(f"{TICKETS_PATH}/{ticket_id}", headers=headers)
    assert detail.status_code == 200, detail.text
    assert detail.json()["status"] == "OPEN"
