"""Canonical content fingerprint of a captured event (HU-03 research R3)."""
from datetime import datetime, timezone
from uuid import uuid4

import pytest

from app.features.offline_capture.schemas import CapturedEvent
from app.features.offline_sync.hashing import canonical_payload, canonical_payload_hash

NOW = datetime(2026, 11, 24, 15, 0, tzinfo=timezone.utc)


def payload(**overrides) -> dict:
    data = {
        "clientEventId": "7f9c2a5e-0b8d-4d7e-9a51-2f3e4c5d6e7f",
        "eventType": "VACCINATION",
        "din": "DIN-DEMO-000001",
        "fieldOccurredAt": "2026-11-24T13:45:10Z",
        "product": "Aftosa bivalente",
        "doseQuantity": 2,
        "doseUnit": "ml",
        "reason": None,
        "finding": None,
        "notes": None,
        "authorEmail": "operario@bovinotech.co",
        "farmId": 1,
        "authorVerificationPending": False,
        "syncStatus": "PENDIENTE_SINCRONIZACION",
        "validationStatus": "PENDIENTE_VALIDACION",
        "origin": "OFFLINE_CAPTURE",
    }
    data.update(overrides)
    return data


def fingerprint(data: dict) -> str:
    return canonical_payload_hash(CapturedEvent.model_validate(data, context={"now": NOW}))


def test_hash_is_a_sha256_hex_digest():
    digest = fingerprint(payload())

    assert len(digest) == 64
    int(digest, 16)


def test_key_order_does_not_change_the_hash():
    data = payload()
    reversed_data = dict(reversed(list(data.items())))

    assert fingerprint(data) == fingerprint(reversed_data)


def test_same_instant_in_another_time_zone_has_the_same_hash():
    assert fingerprint(payload()) == fingerprint(
        payload(fieldOccurredAt="2026-11-24T08:45:10-05:00")
    )


def test_integer_and_float_dose_are_equivalent():
    assert fingerprint(payload(doseQuantity=2)) == fingerprint(payload(doseQuantity=2.0))


def test_any_business_field_changes_the_hash():
    base = fingerprint(payload())
    for change in (
        {"clientEventId": str(uuid4())},
        {"din": "DIN-DEMO-000002"},
        {"fieldOccurredAt": "2026-11-24T13:45:11Z"},
        {"product": "Otro"},
        {"doseQuantity": 3},
        {"doseUnit": "mg"},
        {"notes": "nota"},
        {"authorEmail": "vet@bovinotech.co"},
        {"farmId": 2},
        {"authorVerificationPending": True},
        {"origin": "LEGACY"},
    ):
        assert fingerprint(payload(**change)) != base, change


def test_mutable_states_do_not_change_the_hash():
    assert fingerprint(payload()) == fingerprint(
        payload(syncStatus="FALLIDO", validationStatus="VALIDADO")
    )


@pytest.mark.parametrize("dose", ["NaN", "Infinity", 1e400])
def test_non_finite_dose_never_reaches_the_hash(dose):
    """QA-11: the schema rejects the value before hashing."""
    with pytest.raises(ValueError):
        fingerprint(payload(doseQuantity=dose))


def test_canonical_payload_refuses_non_finite_numbers_as_defense_in_depth():
    """Even if a non-finite dose bypassed validation, the canonical JSON must not
    emit the non-standard ``NaN`` / ``Infinity`` tokens."""
    event = CapturedEvent.model_validate(payload(), context={"now": NOW})
    forged = event.model_copy(update={"dose_quantity": float("nan")})
    with pytest.raises(ValueError):
        canonical_payload(forged)
