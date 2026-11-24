"""HTTP contract of GET /offline-capture/catalog (HU-02, contracts §1)."""
import pytest
from fastapi.testclient import TestClient

from app.features.offline_capture.service import seed_catalog
from app.main import app

client = TestClient(app)

CATALOG_PATH = "/offline-capture/catalog"
PASSWORD = "password123"


def login(email: str, farm_id: int | None = None) -> dict[str, str]:
    data = {"username": email, "password": PASSWORD}
    if farm_id is not None:
        data["farm_id"] = str(farm_id)
    response = client.post("/auth/login", data=data)
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


@pytest.fixture(autouse=True)
def catalog(db_session):
    seed_catalog(db_session)


@pytest.mark.parametrize("email", ["operario@bovinotech.co", "vet@bovinotech.co"])
def test_capture_roles_receive_only_their_active_farm_sorted_by_din(email):
    response = client.get(CATALOG_PATH, headers=login(email))

    assert response.status_code == 200
    body = response.json()
    assert body["farmId"] == 1
    assert body["generatedAt"]
    dins = [animal["din"] for animal in body["animals"]]
    assert dins, "farm 1 must have seed animals"
    assert dins == sorted(dins)
    assert all(din.startswith("DIN-DEMO-") for din in dins)
    assert all(set(animal) == {"din", "name"} for animal in body["animals"])


def test_multi_farm_vet_receives_the_farm_chosen_at_login():
    farm_one = client.get(CATALOG_PATH, headers=login("vet2@bovinotech.co", farm_id=1)).json()
    farm_two = client.get(CATALOG_PATH, headers=login("vet2@bovinotech.co", farm_id=2)).json()

    assert farm_two["farmId"] == 2
    assert farm_two["animals"]
    farm_one_dins = {animal["din"] for animal in farm_one["animals"]}
    farm_two_dins = {animal["din"] for animal in farm_two["animals"]}
    assert farm_one_dins.isdisjoint(farm_two_dins)


def test_farm_is_never_taken_from_the_query_string():
    response = client.get(
        CATALOG_PATH, params={"farm_id": 2}, headers=login("operario@bovinotech.co")
    )

    assert response.json()["farmId"] == 1


@pytest.mark.parametrize("email", ["directivo@bovinotech.co", "admin@bovinotech.co"])
def test_roles_without_capture_are_forbidden(email):
    response = client.get(CATALOG_PATH, headers=login(email))

    assert response.status_code == 403


def test_missing_token_is_unauthorized():
    assert client.get(CATALOG_PATH).status_code == 401


def test_seed_is_idempotent(db_session):
    before = client.get(CATALOG_PATH, headers=login("operario@bovinotech.co")).json()
    seed_catalog(db_session)
    after = client.get(CATALOG_PATH, headers=login("operario@bovinotech.co")).json()

    assert len(after["animals"]) == len(before["animals"])
