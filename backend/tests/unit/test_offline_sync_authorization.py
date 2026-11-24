"""Per-event authorization rules of the sync (HU-03 research R7)."""
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from app.features.offline_capture.schemas import CapturedEvent
from app.features.offline_sync.authorization import (
    author_verification_result,
    authorize_event,
)
from app.features.offline_sync.schemas import ErrorCode

NOW = datetime(2026, 11, 24, 15, 0, tzinfo=timezone.utc)
CAPTURED_AT = NOW - timedelta(hours=20)


def user(**overrides):
    data = {
        "email": "operario@bovinotech.co",
        "farm_ids": [1, 2],
        "is_active": True,
        "disabled_at": None,
        # Token issued after reconnecting: newer than the captured events.
        "token_iat": NOW - timedelta(minutes=1),
        "active_farm_id": 1,
    }
    data.update(overrides)
    return SimpleNamespace(**data)


def event(**overrides) -> CapturedEvent:
    data = {
        "clientEventId": "7f9c2a5e-0b8d-4d7e-9a51-2f3e4c5d6e7f",
        "eventType": "CHECKUP",
        "din": "DIN-DEMO-000001",
        "fieldOccurredAt": CAPTURED_AT.isoformat(),
        "finding": "Sin hallazgos",
        "authorEmail": "operario@bovinotech.co",
        "farmId": 1,
        "authorVerificationPending": False,
    }
    data.update(overrides)
    return CapturedEvent.model_validate(data, context={"now": NOW})


def test_own_event_in_own_farm_is_authorized():
    assert authorize_event(user(), event()) is None


def test_event_captured_before_the_current_token_is_authorized():
    """Re-login after reconnecting is the normal case (R7 warning)."""
    assert CAPTURED_AT < user().token_iat
    assert authorize_event(user(), event()) is None


def test_other_author_is_rejected():
    assert authorize_event(user(), event(authorEmail="vet@bovinotech.co")) == ErrorCode.AUTHOR_MISMATCH


def test_own_farm_other_than_the_active_one_is_authorized():
    assert authorize_event(user(active_farm_id=1), event(farmId=2)) is None


def test_farm_outside_user_farms_is_rejected():
    assert authorize_event(user(farm_ids=[1]), event(farmId=2)) == ErrorCode.FARM_NOT_ALLOWED


def test_disabled_user_keeps_events_captured_before_disabling():
    disabled = user(is_active=False, disabled_at=CAPTURED_AT + timedelta(hours=1))

    assert authorize_event(disabled, event()) is None


def test_disabled_user_events_after_disabling_are_rejected():
    disabled = user(is_active=False, disabled_at=CAPTURED_AT - timedelta(hours=1))

    assert authorize_event(disabled, event()) == ErrorCode.AUTHOR_DISABLED


def test_verification_result_only_for_pending_author_events():
    assert author_verification_result(user(), event()) is None


def test_pending_author_captured_before_the_new_login_is_verified():
    assert author_verification_result(user(), event(authorVerificationPending=True)) == "VERIFIED"


def test_pending_author_captured_after_the_token_is_unverified():
    stale_token = user(token_iat=CAPTURED_AT - timedelta(days=8))

    assert author_verification_result(stale_token, event(authorVerificationPending=True)) == "UNVERIFIED"
