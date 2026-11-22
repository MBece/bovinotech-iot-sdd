"""T024 - administrative provisioning scoped to the administrator's farm.

Covers US1/AC6, US1/AC7, US1/AC9, FR-005, FR-006, FR-012 and FR-014.
"""
import pytest
from fastapi.testclient import TestClient

from app.core.database import get_db
from app.features.auth.models import AuthAuditLog, User, UserFarm, UserRole
from app.features.auth.security import get_password_hash
from app.main import app

client = TestClient(app)
PASSWORD = "password123"


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


def _headers(email):
    token = client.post(
        "/auth/login", data={"username": email, "password": PASSWORD}
    ).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def _create_user_in_farm(email, role, farm_id):
    db = _db()
    user = User(
        email=email,
        full_name="Usuario Finca 2",
        hashed_password=get_password_hash(PASSWORD),
        role=role,
    )
    db.add(user)
    db.flush()
    db.add(UserFarm(user_id=user.id, farm_id=farm_id))
    db.commit()
    return user.id


def _user_id(email):
    return _db().query(User).filter(User.email == email).one().id


NEW_USER = {
    "email": "nuevo@bovinotech.co",
    "full_name": "Nuevo Operario",
    "role": "OPERARIO",
    "temporary_password": "Temporal123",
}


def test_admin_provisions_user_in_own_farm_with_temporary_password():
    response = client.post(
        "/auth/users", json=NEW_USER, headers=_headers("admin@bovinotech.co")
    )

    assert response.status_code == 201
    body = response.json()
    assert body["email"] == NEW_USER["email"]
    assert body["role"] == "OPERARIO"
    assert body["must_change_password"] is True
    assert body["is_active"] is True
    assert [farm["id"] for farm in body["farms"]] == [1]

    created = _db().query(User).filter(User.email == NEW_USER["email"]).one()
    assert created.created_by_id == _user_id("admin@bovinotech.co")
    assert created.created_at is not None


def test_provisioned_user_can_log_in():
    client.post("/auth/users", json=NEW_USER, headers=_headers("admin@bovinotech.co"))

    response = client.post(
        "/auth/login",
        data={"username": NEW_USER["email"], "password": NEW_USER["temporary_password"]},
    )

    assert response.status_code == 200
    assert response.json()["must_change_password"] is True


def test_non_admin_cannot_provision_users():
    for email in ("operario@bovinotech.co", "vet@bovinotech.co", "directivo@bovinotech.co"):
        response = client.post("/auth/users", json=NEW_USER, headers=_headers(email))
        assert response.status_code == 403, email


def test_non_admin_cannot_change_user_status():
    operario_id = _user_id("operario@bovinotech.co")

    response = client.patch(
        f"/auth/users/{operario_id}/status",
        json={"is_active": False},
        headers=_headers("vet@bovinotech.co"),
    )

    assert response.status_code == 403


def test_duplicate_email_is_rejected():
    headers = _headers("admin@bovinotech.co")
    client.post("/auth/users", json=NEW_USER, headers=headers)

    response = client.post("/auth/users", json=NEW_USER, headers=headers)

    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "EMAIL_ALREADY_EXISTS"


def test_admin_lists_only_users_of_own_farm():
    _create_user_in_farm("finca2@bovinotech.co", UserRole.OPERARIO, 2)

    response = client.get("/auth/users", headers=_headers("admin@bovinotech.co"))

    assert response.status_code == 200
    emails = {user["email"] for user in response.json()}
    assert "operario@bovinotech.co" in emails
    assert "finca2@bovinotech.co" not in emails


def test_admin_cannot_manage_user_of_another_farm():
    other_id = _create_user_in_farm("finca2@bovinotech.co", UserRole.OPERARIO, 2)

    response = client.patch(
        f"/auth/users/{other_id}/status",
        json={"is_active": False},
        headers=_headers("admin@bovinotech.co"),
    )

    assert response.status_code == 403


def test_disable_and_enable_user_records_timestamp_and_audit():
    headers = _headers("admin@bovinotech.co")
    operario_id = _user_id("operario@bovinotech.co")

    disabled = client.patch(
        f"/auth/users/{operario_id}/status", json={"is_active": False}, headers=headers
    )
    assert disabled.status_code == 200
    assert disabled.json()["is_active"] is False
    assert _db().get(User, operario_id).disabled_at is not None

    enabled = client.patch(
        f"/auth/users/{operario_id}/status", json={"is_active": True}, headers=headers
    )
    assert enabled.status_code == 200
    assert _db().get(User, operario_id).disabled_at is None

    actions = [
        row.action
        for row in _db()
        .query(AuthAuditLog)
        .filter(AuthAuditLog.target_user_id == operario_id)
        .order_by(AuthAuditLog.id)
    ]
    assert actions == ["USER_DISABLED", "USER_ENABLED"]


def test_last_active_admin_of_farm_cannot_be_disabled():
    admin_id = _user_id("admin@bovinotech.co")

    response = client.patch(
        f"/auth/users/{admin_id}/status",
        json={"is_active": False},
        headers=_headers("admin@bovinotech.co"),
    )

    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "LAST_ADMIN"


def _add_farm(email, headers):
    return client.post("/auth/users/farms", json={"email": email}, headers=headers)


def test_admin_adds_own_farm_to_multi_farm_role_by_email():
    vet_id = _create_user_in_farm("vetfinca2@bovinotech.co", UserRole.VETERINARIO, 2)

    response = _add_farm("vetfinca2@bovinotech.co", _headers("admin@bovinotech.co"))

    assert response.status_code == 200
    assert sorted(_db().get(User, vet_id).farm_ids) == [1, 2]


def test_add_farm_response_only_shows_admin_farm():
    _create_user_in_farm("vetfinca2@bovinotech.co", UserRole.VETERINARIO, 2)

    response = _add_farm("vetfinca2@bovinotech.co", _headers("admin@bovinotech.co"))

    assert [farm["id"] for farm in response.json()["farms"]] == [1]


def test_user_list_does_not_expose_other_farms():
    _create_user_in_farm("vetfinca2@bovinotech.co", UserRole.VETERINARIO, 2)
    headers = _headers("admin@bovinotech.co")
    _add_farm("vetfinca2@bovinotech.co", headers)

    response = client.get("/auth/users", headers=headers)

    for user in response.json():
        assert [farm["id"] for farm in user["farms"]] == [1], user["email"]


def test_add_farm_by_id_is_no_longer_available():
    vet_id = _create_user_in_farm("vetfinca2@bovinotech.co", UserRole.VETERINARIO, 2)

    response = client.post(
        f"/auth/users/{vet_id}/farms", headers=_headers("admin@bovinotech.co")
    )

    assert response.status_code in (404, 405)
    assert _db().get(User, vet_id).farm_ids == [2]


def test_admin_cannot_disable_user_shared_with_another_farm():
    vet_id = _create_user_in_farm("vetfinca2@bovinotech.co", UserRole.VETERINARIO, 2)
    headers = _headers("admin@bovinotech.co")
    _add_farm("vetfinca2@bovinotech.co", headers)

    response = client.patch(
        f"/auth/users/{vet_id}/status", json={"is_active": False}, headers=headers
    )

    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "USER_SHARED_WITH_OTHER_FARMS"
    assert _db().get(User, vet_id).is_active is True


def test_single_farm_role_cannot_get_a_second_farm():
    _create_user_in_farm("finca2@bovinotech.co", UserRole.OPERARIO, 2)

    response = _add_farm("finca2@bovinotech.co", _headers("admin@bovinotech.co"))

    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "SINGLE_FARM_ROLE"


def test_add_farm_to_unknown_email_returns_404():
    response = _add_farm("noexiste@bovinotech.co", _headers("admin@bovinotech.co"))

    assert response.status_code == 404


def test_audit_log_is_listed_for_admin_farm():
    headers = _headers("admin@bovinotech.co")
    client.post("/auth/users", json=NEW_USER, headers=headers)

    response = client.get("/auth/audit", headers=headers)

    assert response.status_code == 200
    entries = response.json()
    assert entries[0]["action"] == "USER_CREATED"
    assert entries[0]["actor_user_id"] == _user_id("admin@bovinotech.co")
    assert entries[0]["farm_id"] == 1
    assert entries[0]["occurred_at"]


def test_audit_log_requires_admin():
    response = client.get("/auth/audit", headers=_headers("directivo@bovinotech.co"))

    assert response.status_code == 403
