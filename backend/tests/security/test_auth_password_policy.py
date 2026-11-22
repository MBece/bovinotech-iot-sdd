"""T026 - temporary password must be changed before operating.

Covers US1/AC12 and FR-016.
"""
import jwt
from fastapi.testclient import TestClient

from app.features.auth.security import ALGORITHM, SECRET_KEY
from app.main import app

client = TestClient(app)
TEMPORARY = "Temporal123"
NEW_PASSWORD = "Definitiva456"


def _bearer(token):
    return {"Authorization": f"Bearer {token}"}


def _provisioned_user_token():
    admin_token = client.post(
        "/auth/login",
        data={"username": "admin@bovinotech.co", "password": "password123"},
    ).json()["access_token"]
    client.post(
        "/auth/users",
        json={
            "email": "nuevo@bovinotech.co",
            "full_name": "Nuevo Operario",
            "role": "OPERARIO",
            "temporary_password": TEMPORARY,
        },
        headers=_bearer(admin_token),
    )
    response = client.post(
        "/auth/login",
        data={"username": "nuevo@bovinotech.co", "password": TEMPORARY},
    )
    return response.json()["access_token"]


def _change(token, current, new):
    return client.post(
        "/auth/change-password",
        json={"current_password": current, "new_password": new},
        headers=_bearer(token),
    )


def test_temporary_token_is_flagged():
    claims = jwt.decode(_provisioned_user_token(), SECRET_KEY, algorithms=[ALGORITHM])

    assert claims["pwd_change"] is True


def test_any_other_route_is_blocked_until_password_changes():
    token = _provisioned_user_token()

    for route in ("/auth/me", "/auth/test-write-access"):
        response = client.get(route, headers=_bearer(token))
        assert response.status_code == 403, route
        assert response.json()["detail"]["code"] == "PASSWORD_CHANGE_REQUIRED"


def test_reusing_temporary_password_is_rejected():
    response = _change(_provisioned_user_token(), TEMPORARY, TEMPORARY)

    assert response.status_code == 400


def test_short_password_is_rejected():
    response = _change(_provisioned_user_token(), TEMPORARY, "abc")

    assert response.status_code == 400


def test_wrong_current_password_is_rejected():
    response = _change(_provisioned_user_token(), "incorrecta", NEW_PASSWORD)

    assert response.status_code == 401


def test_password_change_issues_normal_token_and_unblocks_user():
    response = _change(_provisioned_user_token(), TEMPORARY, NEW_PASSWORD)

    assert response.status_code == 200
    body = response.json()
    assert body["must_change_password"] is False
    assert client.get("/auth/me", headers=_bearer(body["access_token"])).status_code == 200

    relogin = client.post(
        "/auth/login",
        data={"username": "nuevo@bovinotech.co", "password": NEW_PASSWORD},
    )
    assert relogin.status_code == 200
    assert relogin.json()["must_change_password"] is False
