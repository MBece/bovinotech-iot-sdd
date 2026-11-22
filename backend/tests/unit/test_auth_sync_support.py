"""T027 - helpers that let sync apply FR-013 and FR-017 (research.md R5, R2).

Covers FR-013, FR-017 and SC-009.
"""
from datetime import datetime, timedelta, timezone

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.core.database import get_db
from app.features.auth.models import AuthAuditLog, User
from app.features.auth.security import decode_access_token
from app.features.auth.sync_support import (
    get_current_user_for_sync,
    record_sync_rejection,
    verify_pending_author,
    was_user_active_at,
)
from app.main import app

client = TestClient(app)
EMAIL = "operario@bovinotech.co"


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


def _token():
    return client.post(
        "/auth/login", data={"username": EMAIL, "password": "password123"}
    ).json()["access_token"]


def _iat(token):
    return datetime.fromtimestamp(decode_access_token(token)["iat"], tz=timezone.utc)


def test_was_active_between_login_and_disable():
    db = _db()
    token = _token()
    iat = _iat(token)
    user = db.query(User).filter(User.email == EMAIL).one()
    user.is_active = False
    user.disabled_at = iat + timedelta(minutes=10)
    db.commit()

    assert was_user_active_at(user, iat + timedelta(minutes=5), iat) is True
    assert was_user_active_at(user, iat + timedelta(minutes=15), iat) is False
    assert was_user_active_at(user, iat - timedelta(minutes=1), iat) is False


def test_was_active_without_disable():
    db = _db()
    iat = _iat(_token())
    user = db.query(User).filter(User.email == EMAIL).one()

    assert was_user_active_at(user, iat + timedelta(days=3), iat) is True


def test_sync_dependency_accepts_token_issued_before_disable():
    db = _db()
    token = _token()
    user = db.query(User).filter(User.email == EMAIL).one()
    user.is_active = False
    user.disabled_at = _iat(token) + timedelta(minutes=10)
    db.commit()

    synced_user = get_current_user_for_sync(token=token, db=db)

    assert synced_user.email == EMAIL
    assert synced_user.active_farm_id == 1
    assert synced_user.token_iat == _iat(token)


def test_sync_dependency_rejects_token_issued_after_disable():
    db = _db()
    token = _token()
    user = db.query(User).filter(User.email == EMAIL).one()
    user.is_active = False
    user.disabled_at = _iat(token) - timedelta(hours=1)
    db.commit()

    with pytest.raises(HTTPException) as error:
        get_current_user_for_sync(token=token, db=db)

    assert error.value.status_code == 401


def test_pending_event_is_verified_only_for_its_active_author():
    db = _db()
    token_iat = _iat(_token())
    user = db.query(User).filter(User.email == EMAIL).one()
    captured = token_iat - timedelta(days=8)

    assert verify_pending_author(user, EMAIL, captured, token_iat) is True
    assert verify_pending_author(user, "otro@bovinotech.co", captured, token_iat) is False
    assert verify_pending_author(user, EMAIL, token_iat + timedelta(minutes=1), token_iat) is False

    user.is_active = False
    user.disabled_at = token_iat
    db.commit()
    assert verify_pending_author(user, EMAIL, captured, token_iat) is False


def test_pending_event_captured_after_a_past_disable_is_rejected():
    db = _db()
    token_iat = _iat(_token())
    user = db.query(User).filter(User.email == EMAIL).one()
    user.disabled_at = token_iat - timedelta(days=5)
    db.commit()

    captured_after_disable = token_iat - timedelta(days=2)

    assert verify_pending_author(user, EMAIL, captured_after_disable, token_iat) is False


def test_record_sync_rejection_is_reported_to_admin():
    db = _db()
    user = db.query(User).filter(User.email == EMAIL).one()

    record_sync_rejection(db, user, ["evt-1", "evt-2"], farm_id=1)

    row = (
        _db()
        .query(AuthAuditLog)
        .filter(AuthAuditLog.action == "SYNC_REJECTED_AFTER_DISABLE")
        .one()
    )
    assert row.target_user_id == user.id
    assert row.farm_id == 1
    assert "evt-1" in row.details and "evt-2" in row.details
