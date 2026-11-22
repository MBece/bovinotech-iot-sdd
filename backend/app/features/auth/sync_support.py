"""Helpers that let the sync process apply FR-013 and FR-017.

The sync endpoint belongs to another module (sanitary_events). The auth module
only provides these functions; adopting them is coordinated with that module's
owner (plan.md, Seguimiento de Complejidad).
"""
import json
from datetime import datetime
from typing import Iterable, Optional

from fastapi import Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.features.auth.dependencies import (
    credentials_exception,
    oauth2_scheme,
    password_change_required,
    resolve_token_user,
)
from app.features.auth.models import AuditAction, AuthAuditLog, User, as_utc, utc_now


def get_current_user_for_sync(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    """Like get_current_user, but also accepts a user disabled after the token
    was issued, so events captured before the disable can still be synced.

    The returned user carries ``active_farm_id``, ``token_iat`` and
    ``disabled_at`` so the caller can filter each event with
    ``was_user_active_at``.
    """
    user, payload = resolve_token_user(token, db)
    if payload.get("pwd_change") or user.must_change_password:
        raise password_change_required()
    if user.is_active:
        return user
    disabled_at = as_utc(user.disabled_at)
    if disabled_at is None or user.token_iat is None or user.token_iat >= disabled_at:
        raise credentials_exception()
    return user


def was_user_active_at(user: User, occurred_at: datetime, token_iat: datetime) -> bool:
    """True when the event was captured inside the session that issued the
    token and before the user was disabled (FR-017).

    ``token_iat`` is signed by the server, so it bounds device clock tampering
    from below (research.md R5).
    """
    occurred_at = as_utc(occurred_at)
    if occurred_at < as_utc(token_iat):
        return False
    disabled_at = as_utc(user.disabled_at)
    return disabled_at is None or occurred_at < disabled_at


def verify_pending_author(
    user: User,
    author_email: str,
    occurred_at: datetime,
    token_iat: datetime,
) -> bool:
    """Verifies an event captured with an expired offline session (FR-013).

    Valid only when the syncing user is the author, is active, signed in again
    with connectivity after the capture, and was not disabled at capture time.
    """
    if not user.is_active or user.email != author_email:
        return False
    occurred_at = as_utc(occurred_at)
    if occurred_at >= as_utc(token_iat):
        return False
    disabled_at = as_utc(user.disabled_at)
    return disabled_at is None or occurred_at < disabled_at


def record_sync_rejection(
    db: Session,
    user: User,
    client_event_ids: Iterable[str],
    farm_id: Optional[int] = None,
) -> None:
    """Reports rejected events to the farm administrator (FR-017)."""
    if farm_id is None:
        farm_id = getattr(user, "active_farm_id", None) or (
            user.farm_ids[0] if user.farm_ids else None
        )
    db.add(
        AuthAuditLog(
            action=AuditAction.SYNC_REJECTED_AFTER_DISABLE.value,
            actor_user_id=None,
            target_user_id=user.id,
            farm_id=farm_id,
            details=json.dumps({"client_event_ids": list(client_event_ids)}),
            occurred_at=utc_now(),
        )
    )
    db.commit()
