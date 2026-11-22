"""T023 / T047 - login, active farm, disabled users and self-registration.

Covers US1/AC1, US1/AC2, US1/AC8, FR-001..FR-004 and SC-003.
"""
import time

import jwt
import pytest
from fastapi.testclient import TestClient

from app.core.database import get_db
from app.features.auth.models import User
from app.features.auth.security import ALGORITHM, SECRET_KEY
from app.main import app

client = TestClient(app)
PASSWORD = "password123"
SEVEN_DAYS_SECONDS = 7 * 24 * 60 * 60
INVALID_CREDENTIALS = "Correo o contraseña incorrectos"


_open_sessions = []


def _db():
    generator = app.dependency_overrides[get_db]()
    _open_sessions.append(generator)
    return next(generator)


@pytest.fixture(autouse=True)
def _close_sessions():
    yield
    while _open_sessions:
        _open_sessions.pop().close()


def _login(email, farm_id=None, password=PASSWORD):
    data = {"username": email, "password": password}
    if farm_id is not None:
        data["farm_id"] = str(farm_id)
    return client.post("/auth/login", data=data)


def _claims(token):
    return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])


def test_login_returns_role_and_active_farm_in_response_and_token():
    response = _login("operario@bovinotech.co")

    assert response.status_code == 200
    body = response.json()
    assert body["role"] == "OPERARIO"
    assert body["farm_id"] == 1
    assert body["must_change_password"] is False
    assert body["expires_at"]

    claims = _claims(body["access_token"])
    assert claims["sub"] == "operario@bovinotech.co"
    assert claims["role"] == "OPERARIO"
    assert claims["farm_id"] == 1
    assert claims["pwd_change"] is False
    assert claims["exp"] - claims["iat"] == SEVEN_DAYS_SECONDS


def test_login_accepts_json_body_with_farm_id():
    response = client.post(
        "/auth/login",
        json={"email": "vet2@bovinotech.co", "password": PASSWORD, "farm_id": 2},
    )

    assert response.status_code == 200
    assert response.json()["farm_id"] == 2


def test_login_with_several_farms_requires_farm_selection():
    response = _login("vet2@bovinotech.co")

    assert response.status_code == 409
    detail = response.json()["detail"]
    assert detail["code"] == "FARM_SELECTION_REQUIRED"
    assert [farm["id"] for farm in detail["farms"]] == [1, 2]


def test_selected_farm_becomes_active_farm():
    token = _login("vet2@bovinotech.co", farm_id=2).json()["access_token"]

    me = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})

    assert me.status_code == 200
    assert me.json()["active_farm_id"] == 2
    assert [farm["id"] for farm in me.json()["farms"]] == [1, 2]


def test_login_with_unassigned_farm_is_forbidden():
    response = _login("operario@bovinotech.co", farm_id=2)

    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "FARM_NOT_ASSIGNED"


def test_disabled_user_gets_same_message_as_invalid_credentials():
    db = _db()
    user = db.query(User).filter(User.email == "operario@bovinotech.co").one()
    user.is_active = False
    db.commit()

    disabled = _login("operario@bovinotech.co")
    invalid = _login("operario@bovinotech.co", password="wrong-password")

    assert disabled.status_code == 401
    assert invalid.status_code == 401
    assert disabled.json()["detail"] == invalid.json()["detail"] == INVALID_CREDENTIALS


def test_token_of_user_disabled_afterwards_is_rejected():
    token = _login("operario@bovinotech.co").json()["access_token"]
    db = _db()
    user = db.query(User).filter(User.email == "operario@bovinotech.co").one()
    user.is_active = False
    db.commit()

    response = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 401


def test_request_without_token_is_rejected():
    assert client.get("/auth/me").status_code == 401


def test_self_registration_is_rejected():
    response = client.post(
        "/auth/register",
        json={"email": "nuevo@bovinotech.co", "password": "Secreta123"},
    )

    assert response.status_code == 403
    detail = response.json()["detail"]
    assert detail["code"] == "SELF_REGISTRATION_DISABLED"
    assert "administrador" in detail["message"]


def test_token_is_issued_in_less_than_500_ms():
    _login("operario@bovinotech.co")  # warm-up

    started = time.perf_counter()
    response = _login("operario@bovinotech.co")
    elapsed = time.perf_counter() - started

    assert response.status_code == 200
    assert elapsed < 0.5
