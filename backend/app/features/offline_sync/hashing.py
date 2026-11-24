"""Canonical content fingerprint of a captured event (research R3).

Two sends of the same event produce the same hash; any change in a business
field produces a different one. Mutable states (sync and validation) are
excluded because they evolve after capture.
"""
import hashlib
import json
from datetime import timezone

from app.features.offline_capture.schemas import CapturedEvent


def _canonical_fields(event: CapturedEvent) -> dict:
    return {
        "clientEventId": str(event.client_event_id),
        "eventType": event.event_type,
        "din": event.din,
        "fieldOccurredAt": event.field_occurred_at.astimezone(timezone.utc).isoformat(),
        "product": event.product,
        "doseQuantity": None if event.dose_quantity is None else float(event.dose_quantity),
        "doseUnit": event.dose_unit,
        "reason": event.reason,
        "finding": event.finding,
        "notes": event.notes,
        "authorEmail": event.author_email,
        "farmId": event.farm_id,
        "authorVerificationPending": event.author_verification_pending,
        "origin": event.origin,
    }


def canonical_payload(event: CapturedEvent) -> str:
    return json.dumps(
        _canonical_fields(event),
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
        # Defense in depth (QA-11): the schema already rejects non-finite
        # doses; never emit the non-standard NaN / Infinity tokens.
        allow_nan=False,
    )


def canonical_payload_hash(event: CapturedEvent) -> str:
    return hashlib.sha256(canonical_payload(event).encode("utf-8")).hexdigest()
