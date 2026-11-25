import hashlib
import json
import math
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.features.telemetry.models import (
    AlertRuleVersion,
    GeofenceVersion,
    TelemetryAlert,
    TelemetryBatch,
    TelemetryDevice,
    TelemetryEvaluation,
    TelemetryReading,
    utc_now,
)
from app.features.telemetry.rules import geofence_result, immobility_result
from app.features.telemetry.schemas import BatchIn


def canonical_hash(payload: BatchIn) -> str:
    body = payload.model_dump(mode="json")
    canonical = json.dumps(body, sort_keys=True, separators=(",", ":"), ensure_ascii=True)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _utc_sort_key(value: datetime) -> datetime:
    """Normalize mixed aware/naive device timestamps before ordering a batch."""
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _active_rule(db: Session, farm_id: int) -> AlertRuleVersion:
    rule = (
        db.query(AlertRuleVersion)
        .filter(
            AlertRuleVersion.farm_id == farm_id,
            AlertRuleVersion.active_from <= utc_now(),
        )
        .order_by(AlertRuleVersion.active_from.desc(), AlertRuleVersion.version.desc())
        .first()
    )
    if not rule:
        raise HTTPException(409, "No existe una regla de telemetría activa para la finca")
    return rule


def _active_geofence(db: Session, farm_id: int) -> GeofenceVersion | None:
    return (
        db.query(GeofenceVersion)
        .filter(
            GeofenceVersion.farm_id == farm_id,
            GeofenceVersion.active_from <= utc_now(),
        )
        .order_by(GeofenceVersion.active_from.desc(), GeofenceVersion.version.desc())
        .first()
    )


def _alert(db, reading, rule, alert_type, geofence=None):
    existing = (
        db.query(TelemetryAlert)
        .filter(
            TelemetryAlert.farm_id == reading.farm_id,
            TelemetryAlert.bovine_id == reading.bovine_id,
            TelemetryAlert.alert_type == alert_type,
            TelemetryAlert.closed_at.is_(None),
        )
        .first()
    )
    if existing:
        existing.latest_reading_id = reading.reading_id
        existing.last_detected_at = reading.captured_at
        existing.latitude = reading.latitude
        existing.longitude = reading.longitude
        return existing
    alert = TelemetryAlert(
        farm_id=reading.farm_id,
        bovine_id=reading.bovine_id,
        alert_type=alert_type,
        condition_key=f"{rule.id}:{alert_type}:{reading.reading_id}",
        rule_version_id=rule.id,
        geofence_version_id=geofence.id if geofence else None,
        first_reading_id=reading.reading_id,
        latest_reading_id=reading.reading_id,
        first_detected_at=reading.captured_at,
        last_detected_at=reading.captured_at,
        latitude=reading.latitude,
        longitude=reading.longitude,
    )
    db.add(alert)
    db.flush()
    return alert


def _evaluate(db: Session, reading: TelemetryReading) -> dict:
    rule = _active_rule(db, reading.farm_id)
    geofence = _active_geofence(db, reading.farm_id)
    window_start = reading.captured_at - timedelta(minutes=rule.immobility_window_minutes)
    window = (
        db.query(TelemetryReading)
        .filter(
            TelemetryReading.farm_id == reading.farm_id,
            TelemetryReading.bovine_id == reading.bovine_id,
            TelemetryReading.captured_at >= window_start,
            TelemetryReading.captured_at <= reading.captured_at,
        )
        .order_by(TelemetryReading.captured_at)
        .all()
    )
    immobility = immobility_result(
        window,
        rule.immobility_threshold,
        rule.immobility_window_minutes,
        rule.max_gap_minutes,
    )
    previous = (
        db.query(TelemetryReading)
        .filter(
            TelemetryReading.farm_id == reading.farm_id,
            TelemetryReading.bovine_id == reading.bovine_id,
            TelemetryReading.captured_at < reading.captured_at,
        )
        .order_by(TelemetryReading.captured_at.desc())
        .first()
    )
    geofence_state = "INSUFFICIENT_DATA"
    if previous and geofence:
        geofence_state = geofence_result(
            previous, reading, json.loads(geofence.polygon_json), rule.max_accuracy_m
        )
    alerts = []
    if immobility == "ALERT_TRIGGERED":
        alerts.append(_alert(db, reading, rule, "IMMOBILITY"))
    if geofence_state == "ALERT_TRIGGERED":
        alerts.append(_alert(db, reading, rule, "GEOFENCE_EXIT", geofence))
    state = "ALERT_TRIGGERED" if alerts else (
        "INSUFFICIENT_DATA"
        if "INSUFFICIENT_DATA" in {immobility, geofence_state}
        else "NORMAL"
    )
    explanation = f"inmovilidad={immobility}; geocerca={geofence_state}"
    db.add(TelemetryEvaluation(
        reading_id=reading.reading_id,
        farm_id=reading.farm_id,
        rule_version_id=rule.id,
        result=state,
        explanation=explanation,
    ))
    db.flush()
    return {"reading_id": reading.reading_id, "result": state, "detail": explanation, "alert_ids": [a.id for a in alerts]}


def reading_validation_error(item) -> str | None:
    """Return a Spanish diagnostic instead of rejecting the whole batch."""
    if not math.isfinite(item.activity) or not 0 <= item.activity <= 100:
        return "Actividad fuera de rango (0 a 100)"
    coordinates_paired = (item.latitude is None) == (item.longitude is None)
    if not coordinates_paired:
        return "Latitud y longitud deben enviarse juntas"
    if item.latitude is not None and (
        not math.isfinite(item.latitude) or not -90 <= item.latitude <= 90
    ):
        return "Latitud fuera de rango"
    if item.longitude is not None and (
        not math.isfinite(item.longitude) or not -180 <= item.longitude <= 180
    ):
        return "Longitud fuera de rango"
    if item.accuracy_m is not None and (
        not math.isfinite(item.accuracy_m) or not 0 < item.accuracy_m <= 5000
    ):
        return "Precisión fuera de rango"
    if item.accuracy_m is not None and item.latitude is None:
        return "La precisión requiere una ubicación"
    now = datetime.now(timezone.utc)
    captured_at = item.captured_at
    if captured_at.tzinfo is None:
        captured_at = captured_at.replace(tzinfo=timezone.utc)
    if captured_at > now + timedelta(minutes=5):
        return "La fecha de captura está en el futuro"
    return None


def ingest_batch(db: Session, device: TelemetryDevice, payload: BatchIn) -> dict:
    digest = canonical_hash(payload)
    prior = db.query(TelemetryBatch).filter(TelemetryBatch.batch_id == payload.batch_id).first()
    if prior:
        # A globally unique batch id must never disclose another device's
        # persisted response, even when an attacker guesses identical content.
        if prior.device_id != device.id:
            raise HTTPException(
                409,
                detail={
                    "code": "BATCH_ID_CONFLICT",
                    "message": "El identificador del lote ya está en uso",
                },
            )
        if prior.content_hash != digest:
            raise HTTPException(409, detail={"code": "BATCH_CONTENT_CONFLICT", "message": "El lote ya existe con contenido diferente"})
        response = json.loads(prior.response_json)
        response["duplicate"] = True
        return response
    batch = TelemetryBatch(
        batch_id=payload.batch_id,
        device_id=device.id,
        farm_id=device.farm_id,
        content_hash=digest,
    )
    db.add(batch)
    db.flush()
    results = []
    seen = set()
    for item in sorted(payload.readings, key=lambda r: _utc_sort_key(r.captured_at)):
        if item.reading_id in seen:
            results.append({"reading_id": item.reading_id, "result": "REJECTED", "detail": "Identificador repetido en el lote", "alert_ids": []})
            continue
        seen.add(item.reading_id)
        validation_error = reading_validation_error(item)
        if validation_error:
            results.append({"reading_id": item.reading_id, "result": "REJECTED", "detail": validation_error, "alert_ids": []})
            continue
        if db.query(TelemetryReading).filter(TelemetryReading.reading_id == item.reading_id).first():
            results.append({"reading_id": item.reading_id, "result": "REJECTED", "detail": "La lectura ya pertenece a otro lote", "alert_ids": []})
            continue
        reading = TelemetryReading(
            reading_id=item.reading_id,
            batch_id=batch.batch_id,
            device_id=device.id,
            farm_id=device.farm_id,
            bovine_id=device.bovine_id,
            captured_at=_utc_sort_key(item.captured_at),
            activity=item.activity,
            latitude=item.latitude,
            longitude=item.longitude,
            accuracy_m=item.accuracy_m,
        )
        db.add(reading)
        db.flush()
        results.append(_evaluate(db, reading))
    response = {"batch_id": payload.batch_id, "duplicate": False, "results": results}
    batch.response_json = json.dumps(response, default=str)
    db.commit()
    return response


def list_alerts(db: Session, farm_id: int, status_filter=None, alert_type=None, bovine_id=None):
    query = db.query(TelemetryAlert).filter(TelemetryAlert.farm_id == farm_id)
    if status_filter == "OPEN":
        query = query.filter(TelemetryAlert.closed_at.is_(None))
    elif status_filter == "CLOSED":
        query = query.filter(TelemetryAlert.closed_at.is_not(None))
    if alert_type:
        query = query.filter(TelemetryAlert.alert_type == alert_type)
    if bovine_id:
        query = query.filter(TelemetryAlert.bovine_id == bovine_id)
    return query.order_by(TelemetryAlert.last_detected_at.desc()).limit(200).all()


def alert_payload(alert: TelemetryAlert) -> dict:
    return {
        "id": alert.id,
        "bovine_id": alert.bovine_id,
        "alert_type": alert.alert_type,
        "status": "CLOSED" if alert.closed_at else "OPEN",
        "first_detected_at": alert.first_detected_at,
        "last_detected_at": alert.last_detected_at,
        "latitude": alert.latitude,
        "longitude": alert.longitude,
        "rule_version_id": alert.rule_version_id,
        "closure_note": alert.closure_note,
    }

