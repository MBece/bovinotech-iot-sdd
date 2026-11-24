"""Per-event authorization of the sync (research R7).

Deliberately does NOT use ``was_user_active_at``: it rejects events captured
before the current token was issued, and re-login after reconnecting is the
normal HU-03 case. A disabled user is checked against ``disabled_at`` directly.
"""
from datetime import timezone

from app.features.auth.sync_support import verify_pending_author
from app.features.offline_capture.schemas import CapturedEvent
from app.features.offline_sync.schemas import ErrorCode


def _as_utc(value):
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def authorize_event(user, event: CapturedEvent) -> ErrorCode | None:
    """Returns the rejection code, or None when the user may sync the event."""
    if event.author_email != user.email:
        return ErrorCode.AUTHOR_MISMATCH
    if event.farm_id not in (user.farm_ids or []):
        return ErrorCode.FARM_NOT_ALLOWED
    disabled_at = _as_utc(user.disabled_at)
    if not user.is_active and (
        disabled_at is None or _as_utc(event.field_occurred_at) >= disabled_at
    ):
        return ErrorCode.AUTHOR_DISABLED
    return None


def author_verification_result(user, event: CapturedEvent) -> str | None:
    """VERIFIED/UNVERIFIED for events captured with an expired session (FR-018)."""
    if not event.author_verification_pending:
        return None
    token_iat = getattr(user, "token_iat", None)
    if token_iat is None:
        return "UNVERIFIED"
    verified = verify_pending_author(
        user, event.author_email, event.field_occurred_at, token_iat
    )
    return "VERIFIED" if verified else "UNVERIFIED"
