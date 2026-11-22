"""No-overwrite guarantees for HU-05 ``sinigan_sync``.

The official SINIGÁN mock sheet and the field record are read-only from the
point of view of HU-05. Comparing and resolving may create reconciliation
artefacts, but must never mutate the source data or the stored snapshots.

The future implementation modules are imported inside each test/helper so
that, during the TDD red phase, every test fails with a clear
``ModuleNotFoundError`` instead of silently skipping the guarantee, while the
rest of the suite can still run and report its own state.
"""

from copy import deepcopy
from pathlib import Path

from fastapi.testclient import TestClient

from app.features.sinigan.mock_adapter import MockSiniganAdapter
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

OFFICIAL_FIXTURE_PATH = (
    Path(__file__).parents[2]
    / "app"
    / "features"
    / "sinigan"
    / "fixtures"
    / "animals.json"
)


def login(email: str) -> dict[str, str]:
    response = client.post(
        "/auth/login",
        data={"username": email, "password": PASSWORD},
    )
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def field_row_snapshot(db, din: str) -> dict:
    from app.features.sinigan_sync.models import FieldAnimalRecord

    row = (
        db.query(FieldAnimalRecord)
        .filter(FieldAnimalRecord.din == din)
        .one()
    )
    return {
        column.name: getattr(row, column.name)
        for column in FieldAnimalRecord.__table__.columns
    }


def snapshot_value(snapshot: dict, snake_name: str, camel_name: str):
    if snake_name in snapshot:
        return snapshot[snake_name]
    return snapshot.get(camel_name)


def create_open_ticket(din: str, headers: dict[str, str]) -> int:
    response = client.post(
        COMPARISONS_PATH, headers=headers, json={"din": din}
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["result"] == "DISCREPANCIA", body
    assert body["ticket"]["status"] == "OPEN", body
    return body["ticket"]["id"]


def test_comparison_does_not_overwrite_official_sheet_or_field_record(db_session):
    from app.features.sinigan_sync.models import ReconciliationTicket
    from app.features.sinigan_sync.service import seed_field_animals

    seed_field_animals(db_session)
    db_session.commit()

    din = "DIN-DEMO-000002"
    headers = login(OPERARIO_EMAIL)

    official_before = MockSiniganAdapter().find_animal_by_din(din)
    official_fixture_before = OFFICIAL_FIXTURE_PATH.read_bytes()
    field_before = field_row_snapshot(db_session, din)

    response = client.post(
        COMPARISONS_PATH, headers=headers, json={"din": din}
    )
    assert response.status_code == 200, response.text
    assert response.json()["result"] == "DISCREPANCIA"

    official_after = MockSiniganAdapter().find_animal_by_din(din)
    assert official_after == official_before, (
        "La ficha oficial simulada cambió después de comparar."
    )
    assert OFFICIAL_FIXTURE_PATH.read_bytes() == official_fixture_before, (
        "El fixture oficial fue modificado después de comparar."
    )

    db_session.expire_all()
    field_after = field_row_snapshot(db_session, din)
    assert field_after == field_before, (
        "El registro de campo cambió después de comparar."
    )

    ticket = (
        db_session.query(ReconciliationTicket)
        .filter(ReconciliationTicket.din == din)
        .order_by(ReconciliationTicket.id.desc())
        .first()
    )
    assert ticket is not None
    assert ticket.official_snapshot["din"] == official_before["din"]
    assert ticket.official_snapshot["species"] == official_before["species"]
    assert ticket.official_snapshot["sex"] == official_before["sex"]
    assert snapshot_value(ticket.field_snapshot, "sex", "sex") == field_before[
        "sex"
    ]
    assert snapshot_value(
        ticket.field_snapshot, "age_group", "ageGroup"
    ) == field_before["age_group"]
    assert snapshot_value(
        ticket.field_snapshot, "sit_code", "sitCode"
    ) == field_before["sit_code"]


def test_resolution_does_not_overwrite_sources_or_ticket_snapshots(db_session):
    from app.features.sinigan_sync.service import seed_field_animals

    seed_field_animals(db_session)
    db_session.commit()

    din = "DIN-DEMO-000002"
    operario_headers = login(OPERARIO_EMAIL)
    veterinarian_headers = login(VETERINARIO_EMAIL)
    ticket_id = create_open_ticket(din, operario_headers)

    detail_before = client.get(
        f"{TICKETS_PATH}/{ticket_id}", headers=veterinarian_headers
    )
    assert detail_before.status_code == 200, detail_before.text
    detail_before_body = detail_before.json()
    official_snapshot_before = deepcopy(detail_before_body["officialSnapshot"])
    field_snapshot_before = deepcopy(detail_before_body["fieldSnapshot"])
    discrepancies_before = deepcopy(detail_before_body["discrepancies"])

    official_before = MockSiniganAdapter().find_animal_by_din(din)
    official_fixture_before = OFFICIAL_FIXTURE_PATH.read_bytes()
    field_before = field_row_snapshot(db_session, din)

    response = client.post(
        f"{TICKETS_PATH}/{ticket_id}/resolution",
        headers=veterinarian_headers,
        json={"decision": "OFICIAL_PREVALECE", "reason": VALID_REASON},
    )
    assert response.status_code == 201, response.text
    assert response.json()["status"] == "CLOSED"

    assert MockSiniganAdapter().find_animal_by_din(din) == official_before, (
        "La ficha oficial simulada cambió después de resolver."
    )
    assert OFFICIAL_FIXTURE_PATH.read_bytes() == official_fixture_before, (
        "El fixture oficial fue modificado después de resolver."
    )

    db_session.expire_all()
    assert field_row_snapshot(db_session, din) == field_before, (
        "El registro de campo cambió después de resolver."
    )

    detail_after = client.get(
        f"{TICKETS_PATH}/{ticket_id}", headers=veterinarian_headers
    )
    assert detail_after.status_code == 200, detail_after.text
    detail_after_body = detail_after.json()

    assert detail_after_body["status"] == "CLOSED"
    assert detail_after_body["officialSnapshot"] == official_snapshot_before
    assert detail_after_body["fieldSnapshot"] == field_snapshot_before
    assert detail_after_body["discrepancies"] == discrepancies_before
