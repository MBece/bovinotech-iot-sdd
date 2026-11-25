from datetime import datetime, timedelta, timezone

import pytest
from fastapi import HTTPException

from app.features.telemetry.dependencies import credential_hash
from app.features.telemetry.models import AlertRuleVersion, GeofenceVersion, TelemetryAlert, TelemetryDevice, TelemetryReading
from app.features.telemetry.schemas import BatchIn
from app.features.telemetry.service import ingest_batch


def setup_telemetry(db):
    db.add(TelemetryDevice(id="test-device", credential_hash=credential_hash("external-test-secret"), farm_id=1, bovine_id="BOV-1"))
    db.add(AlertRuleVersion(farm_id=1, version=1, immobility_threshold=0.1, immobility_window_minutes=30, max_gap_minutes=15, max_accuracy_m=50))
    db.add(GeofenceVersion(farm_id=1, version=1, name="Test", polygon_json='[[6.2,-75.6],[6.2,-75.55],[6.25,-75.55],[6.25,-75.6]]'))
    db.commit()
    return db.query(TelemetryDevice).filter_by(id="test-device").one()


def payload(batch_id="batch-1", activity=1):
    start = datetime(2026, 1, 1, tzinfo=timezone.utc)
    return BatchIn(batch_id=batch_id, readings=[
        {"reading_id": f"{batch_id}-1", "captured_at": start, "activity": activity, "latitude": 6.22, "longitude": -75.58, "accuracy_m": 5},
        {"reading_id": f"{batch_id}-2", "captured_at": start + timedelta(minutes=15), "activity": activity, "latitude": 6.22, "longitude": -75.58, "accuracy_m": 5},
        {"reading_id": f"{batch_id}-3", "captured_at": start + timedelta(minutes=30), "activity": activity, "latitude": 6.22, "longitude": -75.58, "accuracy_m": 5},
    ])


def test_batch_is_idempotent_and_detects_content_conflict(db_session):
    device = setup_telemetry(db_session)
    first = ingest_batch(db_session, device, payload())
    repeated = ingest_batch(db_session, device, payload())
    assert first["duplicate"] is False
    assert repeated["duplicate"] is True
    assert db_session.query(TelemetryReading).count() == 3
    with pytest.raises(HTTPException) as error:
        ingest_batch(db_session, device, payload(activity=2))
    assert error.value.status_code == 409


def test_immobility_opens_one_alert_for_active_condition(db_session):
    device = setup_telemetry(db_session)
    result = ingest_batch(db_session, device, payload(activity=0))
    assert result["results"][-1]["result"] == "ALERT_TRIGGERED"
    assert db_session.query(TelemetryAlert).filter_by(alert_type="IMMOBILITY").count() == 1


def test_invalid_reading_is_rejected_without_blocking_valid_readings(db_session):
    device = setup_telemetry(db_session)
    batch = payload(batch_id="partial-batch")
    batch.readings[1].latitude = 999
    result = ingest_batch(db_session, device, batch)
    assert [item["result"] for item in result["results"]] == [
        "INSUFFICIENT_DATA",
        "REJECTED",
        "INSUFFICIENT_DATA",
    ]
    assert db_session.query(TelemetryReading).count() == 2


def test_batch_response_is_never_replayed_to_a_different_device(db_session):
    first_device = setup_telemetry(db_session)
    second_device = TelemetryDevice(
        id="second-device",
        credential_hash=credential_hash("another-external-test-secret"),
        farm_id=2,
        bovine_id="BOV-2",
    )
    db_session.add(second_device)
    db_session.commit()
    ingest_batch(db_session, first_device, payload(batch_id="globally-unique"))

    with pytest.raises(HTTPException) as error:
        ingest_batch(db_session, second_device, payload(batch_id="globally-unique"))

    assert error.value.status_code == 409
    assert error.value.detail["code"] == "BATCH_ID_CONFLICT"


def test_batch_orders_mixed_naive_and_aware_timestamps(db_session):
    device = setup_telemetry(db_session)
    batch = payload(batch_id="mixed-timezones")
    batch.readings[0].captured_at = batch.readings[0].captured_at.replace(tzinfo=None)

    result = ingest_batch(db_session, device, batch)

    assert len(result["results"]) == 3
    assert db_session.query(TelemetryReading).count() == 3

