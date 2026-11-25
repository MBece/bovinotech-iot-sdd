import json

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.features.auth.models import User
from app.features.telemetry.dependencies import get_current_device, require_admin, require_alert_writer, require_farm
from app.features.telemetry.models import AlertClosure, AlertRuleVersion, GeofenceVersion, TelemetryAlert, TelemetryDevice, utc_now
from app.features.telemetry.schemas import AlertClose, AlertRead, BatchIn, BatchOut, GeofenceCreate, GeofenceRead, RuleCreate, RuleRead
from app.features.telemetry.service import alert_payload, ingest_batch, list_alerts

router = APIRouter()


@router.post("/batches", response_model=BatchOut)
def create_batch(payload: BatchIn, device: TelemetryDevice = Depends(get_current_device), db: Session = Depends(get_db)):
    return ingest_batch(db, device, payload)


@router.get("/alerts", response_model=list[AlertRead])
def get_alerts(status: str | None = Query(None), alert_type: str | None = None, bovine_id: str | None = None, user: User = Depends(require_farm), db: Session = Depends(get_db)):
    return [alert_payload(item) for item in list_alerts(db, user.active_farm_id, status, alert_type, bovine_id)]


@router.get("/alerts/{alert_id}", response_model=AlertRead)
def get_alert(alert_id: int, user: User = Depends(require_farm), db: Session = Depends(get_db)):
    alert = db.query(TelemetryAlert).filter_by(id=alert_id, farm_id=user.active_farm_id).first()
    if not alert:
        raise HTTPException(404, "Alerta no encontrada")
    return alert_payload(alert)


@router.post("/alerts/{alert_id}/close", response_model=AlertRead)
def close_alert(alert_id: int, payload: AlertClose, user: User = Depends(require_alert_writer), db: Session = Depends(get_db)):
    alert = db.query(TelemetryAlert).filter_by(id=alert_id, farm_id=user.active_farm_id).first()
    if not alert:
        raise HTTPException(404, "Alerta no encontrada")
    if alert.closed_at:
        raise HTTPException(409, "La alerta ya está cerrada")
    closed_at = utc_now()
    db.add(AlertClosure(
        alert_id=alert.id,
        farm_id=alert.farm_id,
        closed_at=closed_at,
        closed_by_id=user.id,
        observation=payload.observation,
    ))
    alert.closed_at = closed_at
    alert.closed_by_id = user.id
    alert.closure_note = payload.observation
    db.commit()
    db.refresh(alert)
    return alert_payload(alert)


@router.get("/rules", response_model=list[RuleRead])
def get_rules(user: User = Depends(require_farm), db: Session = Depends(get_db)):
    return db.query(AlertRuleVersion).filter_by(farm_id=user.active_farm_id).order_by(AlertRuleVersion.version.desc()).all()


@router.post("/rules", response_model=RuleRead, status_code=201)
def create_rule(payload: RuleCreate, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    latest = db.query(AlertRuleVersion).filter_by(farm_id=user.active_farm_id).order_by(AlertRuleVersion.version.desc()).first()
    rule = AlertRuleVersion(farm_id=user.active_farm_id, version=(latest.version + 1 if latest else 1), created_by_id=user.id, **payload.model_dump())
    db.add(rule); db.commit(); db.refresh(rule)
    return rule


@router.get("/geofences", response_model=list[GeofenceRead])
def get_geofences(user: User = Depends(require_farm), db: Session = Depends(get_db)):
    rows = db.query(GeofenceVersion).filter_by(farm_id=user.active_farm_id).order_by(GeofenceVersion.version.desc()).all()
    return [{"id": row.id, "farm_id": row.farm_id, "version": row.version, "name": row.name, "polygon": json.loads(row.polygon_json), "active_from": row.active_from} for row in rows]


@router.post("/geofences", response_model=GeofenceRead, status_code=201)
def create_geofence(payload: GeofenceCreate, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    latest = db.query(GeofenceVersion).filter_by(farm_id=user.active_farm_id).order_by(GeofenceVersion.version.desc()).first()
    row = GeofenceVersion(farm_id=user.active_farm_id, version=(latest.version + 1 if latest else 1), name=payload.name, polygon_json=json.dumps(payload.polygon), created_by_id=user.id)
    db.add(row); db.commit(); db.refresh(row)
    return {"id": row.id, "farm_id": row.farm_id, "version": row.version, "name": row.name, "polygon": payload.polygon, "active_from": row.active_from}

