from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def login_as_operario() -> str:
    response = client.post(
        "/auth/login",
        data={"username": "operario@bovinotech.co", "password": "password123"},
    )
    assert response.status_code == 200
    return response.json()["access_token"]


def test_sinigan_lookup_requires_authentication():
    response = client.get("/integrations/sinigan/animals/DIN-DEMO-000001")
    assert response.status_code == 401


def test_sinigan_lookup_returns_simulation_metadata():
    token = login_as_operario()
    response = client.get(
        "/integrations/sinigan/animals/DIN-DEMO-000001",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["meta"]["sourceMode"] == "SIMULADO"
    assert body["meta"]["isSimulation"] is True
    assert body["data"]["din"] == "DIN-DEMO-000001"


def test_sinigan_lookup_rejects_invalid_or_unknown_din():
    token = login_as_operario()
    headers = {"Authorization": f"Bearer {token}"}

    invalid = client.get("/integrations/sinigan/animals/REAL-123", headers=headers)
    missing = client.get(
        "/integrations/sinigan/animals/DIN-DEMO-999999", headers=headers
    )

    assert invalid.status_code == 400
    assert missing.status_code == 404
