"""T025 - role permission matrix (research.md R8).

Covers US1/AC3, US1/AC10, US1/AC11, FR-008, FR-009, FR-010, FR-015 and FR-018.
"""
import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)
PASSWORD = "password123"

ROLE_USERS = {
    "ADMINISTRADOR": "admin@bovinotech.co",
    "OPERARIO": "operario@bovinotech.co",
    "VETERINARIO": "vet@bovinotech.co",
    "DIRECTIVO": "directivo@bovinotech.co",
}

# route -> roles that are allowed
MATRIX = {
    "/auth/test-vet-only": {"VETERINARIO"},
    "/auth/test-directive-costs": {"DIRECTIVO"},
    "/auth/test-write-access": {"OPERARIO", "VETERINARIO"},
}

CASES = [
    (route, role, role in allowed)
    for route, allowed in MATRIX.items()
    for role in ROLE_USERS
]


def _headers(email):
    response = client.post("/auth/login", data={"username": email, "password": PASSWORD})
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


@pytest.mark.parametrize("route,role,allowed", CASES)
def test_permission_matrix(route, role, allowed):
    response = client.get(route, headers=_headers(ROLE_USERS[role]))

    assert response.status_code == (200 if allowed else 403)


def test_every_role_logs_in_with_its_role():
    for role, email in ROLE_USERS.items():
        response = client.post(
            "/auth/login", data={"username": email, "password": PASSWORD}
        )
        assert response.json()["role"] == role
