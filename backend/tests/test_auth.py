import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_login_successful_emits_jwt_and_role():
    response = client.post(
        "/auth/login",
        json={
            "email": "admin@bovinotech.co",
            "password": "Password123!",
            "farm_id": "FINCA-01",
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"
    assert data["role"] == "ADMINISTRADOR"
    assert data["active_farm"] == "FINCA-01"


def test_login_invalid_password_rejected():
    response = client.post(
        "/auth/login",
        json={
            "email": "admin@bovinotech.co",
            "password": "WrongPassword!",
            "farm_id": "FINCA-01",
        },
    )
    assert response.status_code == 401


def test_login_unassigned_farm_rejected():
    response = client.post(
        "/auth/login",
        json={
            "email": "operario@bovinotech.co",
            "password": "Password123!",
            "farm_id": "FINCA-02",  # Operario only has FINCA-01
        },
    )
    assert response.status_code == 403


def test_me_endpoint_returns_user_info():
    login_resp = client.post(
        "/auth/login",
        json={
            "email": "vet@bovinotech.co",
            "password": "Password123!",
            "farm_id": "FINCA-01",
        },
    )
    token = login_resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    response = client.get("/auth/me", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert data["email"] == "vet@bovinotech.co"
    assert data["role"] == "VETERINARIO"


def test_admin_can_provision_new_user():
    login_resp = client.post(
        "/auth/login",
        json={
            "email": "admin@bovinotech.co",
            "password": "Password123!",
            "farm_id": "FINCA-01",
        },
    )
    token = login_resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    new_user_payload = {
        "email": "nuevo.operario@bovinotech.co",
        "full_name": "Nuevo Operario de Campo",
        "password": "TempPassword123!",
        "role": "OPERARIO",
        "assigned_farms": ["FINCA-01"],
    }
    response = client.post("/auth/users", json=new_user_payload, headers=headers)
    assert response.status_code == 201
    data = response.json()
    assert data["email"] == "nuevo.operario@bovinotech.co"
    assert data["role"] == "OPERARIO"


def test_non_admin_cannot_provision_user():
    login_resp = client.post(
        "/auth/login",
        json={
            "email": "operario@bovinotech.co",
            "password": "Password123!",
            "farm_id": "FINCA-01",
        },
    )
    token = login_resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    payload = {
        "email": "intruso@bovinotech.co",
        "full_name": "Intruso",
        "password": "Password123!",
        "role": "OPERARIO",
        "assigned_farms": ["FINCA-01"],
    }
    response = client.post("/auth/users", json=payload, headers=headers)
    assert response.status_code == 403
