import time
from datetime import datetime, timezone
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.features.auth.models import User
from app.features.auth.router import require_veterinario
from app.features.alerta_fiebre.models import (
    FeverAlert,
    FeverAlertAttention,
    AlertSeverityEnum,
    AlertStatusEnum,
)
from app.features.alerta_fiebre.schemas import (
    TelemetryIngestRequest,
    TelemetryIngestResponse,
    FeverAlertResponse,
    FeverAlertAttentionResponse,
    AttendAlertRequest,
)

router = APIRouter()


@router.post("/telemetry", response_model=TelemetryIngestResponse)
def ingest_telemetry(
    telemetry: TelemetryIngestRequest,
    db: Session = Depends(get_db),
):
    start_time = time.perf_counter()

    # Idempotencia: Verificar si ya existe un registro con este client_event_id
    existing_alert = (
        db.query(FeverAlert)
        .filter(FeverAlert.client_event_id == telemetry.client_event_id)
        .first()
    )

    if existing_alert:
        elapsed_ms = (time.perf_counter() - start_time) * 1000
        return TelemetryIngestResponse(
            status="processed",
            alert_generated=True,
            alert_id=existing_alert.id,
            processing_time_ms=elapsed_ms,
            message="Lectura telemétrica ya procesada previamente (idempotente)",
        )

    # Regla de negocio de umbral febril: estricto > 39.5 °C
    if telemetry.body_temperature > 39.5:
        new_alert = FeverAlert(
            client_event_id=telemetry.client_event_id,
            collar_id=telemetry.collar_id,
            sinigan_code=telemetry.sinigan_code,
            temperature=telemetry.body_temperature,
            severity=AlertSeverityEnum.CRITICAL,
            status=AlertStatusEnum.ACTIVE,
            detected_at=datetime.now(timezone.utc),
            is_offline_sync=False,
        )
        db.add(new_alert)
        db.commit()
        db.refresh(new_alert)

        elapsed_ms = (time.perf_counter() - start_time) * 1000
        return TelemetryIngestResponse(
            status="processed",
            alert_generated=True,
            alert_id=new_alert.id,
            processing_time_ms=elapsed_ms,
            message=f"Alerta crítica generada: fiebre detectada ({telemetry.body_temperature} °C)",
        )

    # Temperatura normal o en el límite
    elapsed_ms = (time.perf_counter() - start_time) * 1000
    return TelemetryIngestResponse(
        status="processed",
        alert_generated=False,
        alert_id=None,
        processing_time_ms=elapsed_ms,
        message="Telemetría normal registrada",
    )


@router.get("/alerts", response_model=List[FeverAlertResponse])
def list_fever_alerts(
    current_user: User = Depends(require_veterinario),
    db: Session = Depends(get_db),
):
    alerts = db.query(FeverAlert).order_by(FeverAlert.detected_at.desc()).all()
    results = []
    for alert in alerts:
        attentions = (
            db.query(FeverAlertAttention)
            .filter(FeverAlertAttention.referenced_alert_id == alert.id)
            .order_by(FeverAlertAttention.attended_at.asc())
            .all()
        )
        alert_dict = {
            "id": alert.id,
            "sinigan_code": alert.sinigan_code,
            "collar_id": alert.collar_id,
            "temperature": alert.temperature,
            "severity": alert.severity,
            "status": alert.status,
            "detected_at": alert.detected_at,
            "client_event_id": alert.client_event_id,
            "is_offline_sync": alert.is_offline_sync,
            "attentions": attentions,
        }
        results.append(FeverAlertResponse(**alert_dict))
    return results


@router.get("/alerts/{alert_id}", response_model=FeverAlertResponse)
def get_fever_alert(
    alert_id: int,
    current_user: User = Depends(require_veterinario),
    db: Session = Depends(get_db),
):
    alert = db.query(FeverAlert).filter(FeverAlert.id == alert_id).first()
    if not alert:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Alerta sanitaria no encontrada",
        )

    attentions = (
        db.query(FeverAlertAttention)
        .filter(FeverAlertAttention.referenced_alert_id == alert.id)
        .order_by(FeverAlertAttention.attended_at.asc())
        .all()
    )

    alert_dict = {
        "id": alert.id,
        "sinigan_code": alert.sinigan_code,
        "collar_id": alert.collar_id,
        "temperature": alert.temperature,
        "severity": alert.severity,
        "status": alert.status,
        "detected_at": alert.detected_at,
        "client_event_id": alert.client_event_id,
        "is_offline_sync": alert.is_offline_sync,
        "attentions": attentions,
    }
    return FeverAlertResponse(**alert_dict)


@router.post("/alerts/{alert_id}/attend", response_model=FeverAlertAttentionResponse)
def attend_fever_alert(
    alert_id: int,
    payload: AttendAlertRequest,
    current_user: User = Depends(require_veterinario),
    db: Session = Depends(get_db),
):
    alert = db.query(FeverAlert).filter(FeverAlert.id == alert_id).first()
    if not alert:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Alerta sanitaria no encontrada",
        )

    # Registro append-only: Se crea un nuevo evento sin alterar los datos originales de la alerta
    attention_event = FeverAlertAttention(
        referenced_alert_id=alert.id,
        veterinarian_email=current_user.email,
        clinical_notes=payload.clinical_notes,
        treatment_applied=payload.treatment_applied,
        attended_at=datetime.now(timezone.utc),
    )
    db.add(attention_event)

    # Actualizar estado visual de la alerta a ATENDIDA
    alert.status = AlertStatusEnum.ATTENDED
    db.commit()
    db.refresh(attention_event)

    return attention_event
