import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_login_success():
    # Test for operario
    response = client.post(
        "/auth/login",
        data={"username": "operario@bovinotech.co", "password": "password123"}
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"
    assert data["role"] == "OPERARIO"

def test_login_invalid_credentials():
    response = client.post(
        "/auth/login",
        data={"username": "wrong@bovinotech.co", "password": "wrongpassword"}
    )
    assert response.status_code == 401
    assert response.json()["detail"] == "Correo o contraseña incorrectos"

def test_rbac_veterinario_only_access_denied_for_operario():
    # Login as operario
    login_response = client.post(
        "/auth/login",
        data={"username": "operario@bovinotech.co", "password": "password123"}
    )
    token = login_response.json()["access_token"]
    
    # Attempt to access a veterinarian-only dummy endpoint
    response = client.get(
        "/auth/test-vet-only",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 403
    assert response.json()["detail"] == "Acceso denegado: Se requiere rol de Veterinario"

def test_rbac_veterinario_only_access_allowed_for_vet():
    # Login as vet
    login_response = client.post(
        "/auth/login",
        data={"username": "vet@bovinotech.co", "password": "password123"}
    )
    token = login_response.json()["access_token"]
    
    # Attempt to access a veterinarian-only dummy endpoint
    response = client.get(
        "/auth/test-vet-only",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 200
    assert response.json()["message"] == "Welcome Veterinarian"
