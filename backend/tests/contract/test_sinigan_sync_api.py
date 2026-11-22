"""Contract and acceptance tests for HU-05 ``sinigan_sync``.

These tests were written before the backend implementation (TDD red phase).
They exercise the public HTTP contract only and do not import implementation
internals, so an absent router shows up as a clear red failure instead of an
incorrect assumption about internal APIs.
"""

from fastapi.testclient import TestClient
from sqlalchemy import text

from app.main import app


client = TestClient(app)

COMPARISONS_PATH = "/integrations/sinigan-sync/comparisons"
TICKETS_PATH = "/integrations/sinigan-sync/tickets"

EXPECTED_MOCK_LABEL = "MODO SIMULADO (SINIGÁN V6 MOCK)"
EXPECTED_FIELD_SOURCE = "REGISTRO DE CAMPO"

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


def compare(din: str, headers: dict[str, str]):
    return client.post(COMPARISONS_PATH, headers=headers, json={"din": din})


def create_open_ticket(din: str, headers: dict[str, str]) -> int:
    response = compare(din, headers)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["result"] == "DISCREPANCIA", body
    assert body["ticket"] is not None, body
    assert body["ticket"]["status"] == "OPEN", body
    return body["ticket"]["id"]


def count_rows(db, table_name: str) -> int:
    return db.execute(text(f"SELECT COUNT(*) FROM {table_name}")).scalar_one()


def snapshot_counts(db) -> dict[str, int]:
    return {
        "field_animal_records": count_rows(db, "field_animal_records"),
        "reconciliation_tickets": count_rows(db, "reconciliation_tickets"),
        "reconciliation_discrepancies": count_rows(
            db, "reconciliation_discrepancies"
        ),
        "reconciliation_resolutions": count_rows(
            db, "reconciliation_resolutions"
        ),
    }


def find_discrepancy(discrepancies: list[dict], field_name: str) -> dict:
    matches = [item for item in discrepancies if item["fieldName"] == field_name]
    assert matches, (
        f"No se encontró la discrepancia {field_name!r}. "
        f"Discrepancias recibidas: {discrepancies!r}"
    )
    return matches[0]


def assert_discrepancy(
    discrepancy: dict,
    *,
    field_name: str,
    field_label: str,
    official_value: str,
    field_value: str,
) -> None:
    assert discrepancy["fieldName"] == field_name
    assert discrepancy["fieldLabel"] == field_label
    assert discrepancy["officialValue"] == official_value
    assert discrepancy["fieldValue"] == field_value
    assert discrepancy["officialSource"] == EXPECTED_MOCK_LABEL
    assert discrepancy["fieldSource"] == EXPECTED_FIELD_SOURCE
    assert discrepancy["detectedAt"], "La discrepancia debe registrar detectedAt"


# ---------------------------------------------------------------------------
# AC-01 — ficha existente con metadatos y etiqueta exacta
# ---------------------------------------------------------------------------


def test_ac01_consistent_animal_returns_official_sheet_and_simulation_label():
    assert_sinigan_sync_router_registered()
    headers = login(OPERARIO_EMAIL)

    response = compare("DIN-DEMO-000001", headers)

    assert response.status_code == 200, response.text
    body = response.json()

    assert body["meta"]["mockLabel"] == EXPECTED_MOCK_LABEL
    assert body["meta"]["sourceMode"] == "SIMULADO"
    assert body["meta"]["isSimulation"] is True
    assert body["meta"]["comparedAt"], "La comparación debe registrar comparedAt"
    assert body["result"] == "CONSISTENTE"
    assert body["discrepancies"] == []
    assert body["ticket"] is None

    official = body["official"]
    assert official["din"] == "DIN-DEMO-000001"
    assert official["animalName"] == "Luna"
    assert official["species"] == "BOVINO"
    assert official["sex"] == "HEMBRA"
    assert official["ageGroup"] == "ADULTO"
    assert official["establishment"]["sitCode"] == "SIT-DEMO-001"

    field = body["field"]
    assert field["din"] == "DIN-DEMO-000001"
    assert field["species"] == "BOVINO"
    assert field["sex"] == "HEMBRA"
    assert field["ageGroup"] == "ADULTO"
    assert field["sitCode"] == "SIT-DEMO-001"
    assert field["source"] == "REGISTRO_DE_CAMPO"

    listing = client.get(TICKETS_PATH, headers=headers)
    assert listing.status_code == 200, listing.text
    assert listing.json()["items"] == [], "Una comparación consistente no crea ticket"


def test_comparison_rejects_invalid_din_with_400():
    assert_sinigan_sync_router_registered()
    headers = login(OPERARIO_EMAIL)

    response = compare("REAL-123", headers)

    assert response.status_code == 400, response.text


def test_comparison_rejects_extra_fields_with_422():
    assert_sinigan_sync_router_registered()
    headers = login(OPERARIO_EMAIL)

    response = client.post(
        COMPARISONS_PATH,
        headers=headers,
        json={"din": "DIN-DEMO-000001", "officialSource": EXPECTED_MOCK_LABEL},
    )

    assert response.status_code == 422, response.text


# ---------------------------------------------------------------------------
# AC-02 — DIN inexistente: 404 y cero escrituras
# ---------------------------------------------------------------------------


def test_ac02_unknown_din_returns_404_without_writes(db_session):
    assert_sinigan_sync_router_registered()
    headers = login(OPERARIO_EMAIL)

    before = snapshot_counts(db_session)
    assert before["field_animal_records"] > 0, (
        "El seed de registros de campo no está disponible; "
        "no se puede demostrar que la consulta no escribió nada."
    )

    response = compare("DIN-DEMO-999999", headers)

    assert response.status_code == 404, response.text
    db_session.expire_all()
    after = snapshot_counts(db_session)
    assert after == before, (
        "Una consulta de DIN inexistente no debe crear registros de campo, "
        f"tickets, discrepancias ni resoluciones. Antes={before} Después={after}"
    )


# ---------------------------------------------------------------------------
# AC-03 — discrepancias de sexo, grupo etario, especie y predio
# ---------------------------------------------------------------------------


def test_ac03_sex_discrepancy_creates_open_ticket_with_both_values_and_origins():
    assert_sinigan_sync_router_registered()
    headers = login(OPERARIO_EMAIL)

    response = compare("DIN-DEMO-000002", headers)

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["meta"]["mockLabel"] == EXPECTED_MOCK_LABEL
    assert body["meta"]["comparedAt"]
    assert body["result"] == "DISCREPANCIA"

    ticket = body["ticket"]
    assert ticket is not None
    assert ticket["din"] == "DIN-DEMO-000002"
    assert ticket["status"] == "OPEN"
    assert ticket["comparedAt"]
    assert ticket["createdByEmail"] == OPERARIO_EMAIL
    assert ticket["createdAt"]

    assert len(body["discrepancies"]) == 1
    assert_discrepancy(
        body["discrepancies"][0],
        field_name="sex",
        field_label="Sexo",
        official_value="MACHO",
        field_value="HEMBRA",
    )

    detail = client.get(f"{TICKETS_PATH}/{ticket['id']}", headers=headers)
    assert detail.status_code == 200, detail.text
    detail_body = detail.json()
    assert detail_body["status"] == "OPEN"
    assert detail_body["officialSource"] == EXPECTED_MOCK_LABEL
    assert detail_body["fieldSource"] == EXPECTED_FIELD_SOURCE
    assert detail_body["officialSnapshot"]["sex"] == "MACHO"
    assert detail_body["fieldSnapshot"]["sex"] == "HEMBRA"
    assert detail_body["resolution"] is None
    assert detail_body["discrepancies"][0]["detectedAt"]


def test_ac03_age_group_discrepancy_creates_open_ticket():
    assert_sinigan_sync_router_registered()
    headers = login(OPERARIO_EMAIL)

    response = compare("DIN-DEMO-000003", headers)

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["result"] == "DISCREPANCIA"
    assert body["ticket"]["status"] == "OPEN"
    assert body["ticket"]["comparedAt"]
    assert body["meta"]["comparedAt"]

    assert len(body["discrepancies"]) == 1
    assert_discrepancy(
        body["discrepancies"][0],
        field_name="age_group",
        field_label="Grupo etario",
        official_value="TERNERO",
        field_value="ADULTO",
    )


def test_ac03_species_and_establishment_discrepancies_create_open_ticket():
    assert_sinigan_sync_router_registered()
    headers = login(OPERARIO_EMAIL)

    response = compare("DIN-DEMO-000004", headers)

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["result"] == "DISCREPANCIA"
    assert body["ticket"]["status"] == "OPEN"
    assert body["ticket"]["comparedAt"]
    assert body["meta"]["comparedAt"]

    assert len(body["discrepancies"]) == 2
    assert_discrepancy(
        find_discrepancy(body["discrepancies"], "species"),
        field_name="species",
        field_label="Especie",
        official_value="BUFALINO",
        field_value="BOVINO",
    )
    assert_discrepancy(
        find_discrepancy(body["discrepancies"], "sit_code"),
        field_name="sit_code",
        field_label="Predio",
        official_value="SIT-DEMO-002",
        field_value="SIT-DEMO-001",
    )


# ---------------------------------------------------------------------------
# AC-04 — resolución veterinaria, motivo, cierre y trazabilidad
# ---------------------------------------------------------------------------


def test_ac04_veterinarian_resolves_ticket_and_closes_it_with_traceability():
    assert_sinigan_sync_router_registered()
    operario_headers = login(OPERARIO_EMAIL)
    veterinarian_headers = login(VETERINARIO_EMAIL)
    ticket_id = create_open_ticket("DIN-DEMO-000002", operario_headers)

    before = client.get(
        f"{TICKETS_PATH}/{ticket_id}", headers=veterinarian_headers
    )
    assert before.status_code == 200, before.text
    assert before.json()["status"] == "OPEN"
    assert before.json()["resolution"] is None

    response = client.post(
        f"{TICKETS_PATH}/{ticket_id}/resolution",
        headers=veterinarian_headers,
        json={"decision": "OFICIAL_PREVALECE", "reason": VALID_REASON},
    )

    assert response.status_code == 201, response.text
    body = response.json()
    assert body["id"] == ticket_id
    assert body["din"] == "DIN-DEMO-000002"
    assert body["status"] == "CLOSED"
    assert body["closedAt"], "El cierre debe registrar closedAt"
    assert body["resolution"]["decision"] == "OFICIAL_PREVALECE"
    assert body["resolution"]["reason"] == VALID_REASON
    assert body["resolution"]["resolvedByEmail"] == VETERINARIO_EMAIL
    assert body["resolution"]["resolvedAt"]

    after = client.get(
        f"{TICKETS_PATH}/{ticket_id}", headers=veterinarian_headers
    )
    assert after.status_code == 200, after.text
    detail = after.json()
    assert detail["status"] == "CLOSED"
    assert detail["resolution"]["decision"] == "OFICIAL_PREVALECE"
    assert detail["resolution"]["reason"] == VALID_REASON
    assert detail["resolution"]["resolvedByEmail"] == VETERINARIO_EMAIL
    assert detail["resolution"]["resolvedAt"]


def test_ac04_second_resolution_attempt_returns_409():
    assert_sinigan_sync_router_registered()
    operario_headers = login(OPERARIO_EMAIL)
    veterinarian_headers = login(VETERINARIO_EMAIL)
    ticket_id = create_open_ticket("DIN-DEMO-000002", operario_headers)
    payload = {"decision": "OFICIAL_PREVALECE", "reason": VALID_REASON}

    first = client.post(
        f"{TICKETS_PATH}/{ticket_id}/resolution",
        headers=veterinarian_headers,
        json=payload,
    )
    second = client.post(
        f"{TICKETS_PATH}/{ticket_id}/resolution",
        headers=veterinarian_headers,
        json=payload,
    )

    assert first.status_code == 201, first.text
    assert second.status_code == 409, second.text


def test_ac04_operario_cannot_resolve_ticket():
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


def test_ac04_reason_is_validated_after_trim():
    assert_sinigan_sync_router_registered()
    operario_headers = login(OPERARIO_EMAIL)
    veterinarian_headers = login(VETERINARIO_EMAIL)
    ticket_id = create_open_ticket("DIN-DEMO-000002", operario_headers)

    invalid_reasons = [
        "",
        "    ",
        "abc",
        "    abc    ",
        "a" * 501,
    ]
    for reason in invalid_reasons:
        response = client.post(
            f"{TICKETS_PATH}/{ticket_id}/resolution",
            headers=veterinarian_headers,
            json={"decision": "OFICIAL_PREVALECE", "reason": reason},
        )
        assert response.status_code == 422, (
            f"Motivo inválido {reason!r} debería devolver 422: {response.text}"
        )

    detail = client.get(
        f"{TICKETS_PATH}/{ticket_id}", headers=veterinarian_headers
    )
    assert detail.status_code == 200, detail.text
    assert detail.json()["status"] == "OPEN"


def test_ac04_reason_is_trimmed_before_persistence():
    assert_sinigan_sync_router_registered()
    operario_headers = login(OPERARIO_EMAIL)
    veterinarian_headers = login(VETERINARIO_EMAIL)
    ticket_id = create_open_ticket("DIN-DEMO-000002", operario_headers)

    response = client.post(
        f"{TICKETS_PATH}/{ticket_id}/resolution",
        headers=veterinarian_headers,
        json={
            "decision": "CAMPO_PREVALECE",
            "reason": "   Motivo válido   ",
        },
    )

    assert response.status_code == 201, response.text
    assert response.json()["resolution"]["reason"] == "Motivo válido"


def test_ac04_invalid_decision_and_extra_fields_return_422():
    assert_sinigan_sync_router_registered()
    operario_headers = login(OPERARIO_EMAIL)
    veterinarian_headers = login(VETERINARIO_EMAIL)
    ticket_id = create_open_ticket("DIN-DEMO-000002", operario_headers)

    invalid_decision = client.post(
        f"{TICKETS_PATH}/{ticket_id}/resolution",
        headers=veterinarian_headers,
        json={"decision": "OTRO", "reason": VALID_REASON},
    )
    extra_fields = client.post(
        f"{TICKETS_PATH}/{ticket_id}/resolution",
        headers=veterinarian_headers,
        json={
            "decision": "OFICIAL_PREVALECE",
            "reason": VALID_REASON,
            "status": "CLOSED",
            "resolvedByEmail": "atacante@example.com",
        },
    )

    assert invalid_decision.status_code == 422, invalid_decision.text
    assert extra_fields.status_code == 422, extra_fields.text


# ---------------------------------------------------------------------------
# Listado, detalle y autenticación
# ---------------------------------------------------------------------------


def test_tickets_can_be_listed_and_filtered():
    assert_sinigan_sync_router_registered()
    headers = login(OPERARIO_EMAIL)
    ticket_002 = create_open_ticket("DIN-DEMO-000002", headers)
    ticket_003 = create_open_ticket("DIN-DEMO-000003", headers)

    listing = client.get(TICKETS_PATH, headers=headers)
    assert listing.status_code == 200, listing.text
    items = listing.json()["items"]
    assert {item["id"] for item in items} >= {ticket_002, ticket_003}

    summary = next(item for item in items if item["id"] == ticket_002)
    assert summary["din"] == "DIN-DEMO-000002"
    assert summary["status"] == "OPEN"
    assert summary["comparedAt"]
    assert summary["createdAt"]
    assert summary["createdByEmail"] == OPERARIO_EMAIL
    assert summary["closedAt"] is None
    assert summary["discrepancyCount"] == 1

    by_din = client.get(f"{TICKETS_PATH}?din=DIN-DEMO-000003", headers=headers)
    assert by_din.status_code == 200, by_din.text
    assert {item["din"] for item in by_din.json()["items"]} == {
        "DIN-DEMO-000003"
    }

    by_status = client.get(f"{TICKETS_PATH}?status=OPEN", headers=headers)
    assert by_status.status_code == 200, by_status.text
    assert all(item["status"] == "OPEN" for item in by_status.json()["items"])

    limited = client.get(f"{TICKETS_PATH}?limit=1", headers=headers)
    assert limited.status_code == 200, limited.text
    assert len(limited.json()["items"]) == 1

    invalid_limit = client.get(f"{TICKETS_PATH}?limit=0", headers=headers)
    assert invalid_limit.status_code == 422, invalid_limit.text


def test_ticket_endpoints_require_authentication():
    assert_sinigan_sync_router_registered()

    comparison = client.post(
        COMPARISONS_PATH, json={"din": "DIN-DEMO-000001"}
    )
    listing = client.get(TICKETS_PATH)
    detail = client.get(f"{TICKETS_PATH}/1")
    resolution = client.post(
        f"{TICKETS_PATH}/1/resolution",
        json={"decision": "OFICIAL_PREVALECE", "reason": VALID_REASON},
    )

    assert comparison.status_code == 401, comparison.text
    assert listing.status_code == 401, listing.text
    assert detail.status_code == 401, detail.text
    assert resolution.status_code == 401, resolution.text


def test_unknown_ticket_returns_404():
    assert_sinigan_sync_router_registered()
    headers = login(VETERINARIO_EMAIL)

    response = client.get(f"{TICKETS_PATH}/999999", headers=headers)

    assert response.status_code == 404, response.text
