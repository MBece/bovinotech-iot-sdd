"""Conflict coverage for a DIN without a field record (L-01).

The official mock adapter may know an animal that has no field record. In that
case the comparison must return ``409`` and must not create tickets or
discrepancies. A stub adapter lets the test exercise this branch without
touching the shipped fixtures.
"""

from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)

COMPARISONS_PATH = "/integrations/sinigan-sync/comparisons"

OPERARIO_EMAIL = "operario@bovinotech.co"
PASSWORD = "password123"


def login(email: str) -> dict[str, str]:
    response = client.post(
        "/auth/login",
        data={"username": email, "password": PASSWORD},
    )
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


class StubOfficialAdapter:
    """Official adapter that knows an animal not present in the field seed."""

    def get_status(self) -> dict:
        return {"available": True}

    def find_animal_by_din(self, din: str) -> dict | None:
        return {
            "din": din,
            "animalName": "Animal sin registro de campo",
            "animalNumber": "ANIMAL-DEMO-099",
            "species": "BOVINO",
            "sex": "MACHO",
            "ageGroup": "ADULTO",
            "establishment": {
                "sitCode": "SIT-DEMO-001",
                "name": "Finca El Roble",
            },
        }


def test_official_din_without_field_record_returns_409_without_writes(
    db_session, monkeypatch
):
    from app.features.sinigan_sync import router as sinigan_sync_router
    from app.features.sinigan_sync.models import (
        ReconciliationDiscrepancy,
        ReconciliationTicket,
    )

    monkeypatch.setattr(
        sinigan_sync_router.sync_service,
        "adapter",
        StubOfficialAdapter(),
    )

    headers = login(OPERARIO_EMAIL)
    before_tickets = db_session.query(ReconciliationTicket).count()
    before_discrepancies = db_session.query(ReconciliationDiscrepancy).count()

    response = client.post(
        COMPARISONS_PATH, headers=headers, json={"din": "DIN-DEMO-000099"}
    )

    assert response.status_code == 409, response.text

    db_session.expire_all()
    assert db_session.query(ReconciliationTicket).count() == before_tickets
    assert (
        db_session.query(ReconciliationDiscrepancy).count()
        == before_discrepancies
    )
