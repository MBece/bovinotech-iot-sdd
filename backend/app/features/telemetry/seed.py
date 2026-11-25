import json
import os

from sqlalchemy.orm import Session

from app.features.telemetry.dependencies import credential_hash
from app.features.telemetry.models import AlertRuleVersion, GeofenceVersion, TelemetryDevice


DEMO_POLYGON = [[6.20, -75.60], [6.20, -75.55], [6.25, -75.55], [6.25, -75.60]]


def seed_telemetry(db: Session) -> None:
    for farm_id in (1, 2):
        if not db.query(AlertRuleVersion).filter_by(farm_id=farm_id).first():
            db.add(AlertRuleVersion(farm_id=farm_id, version=1, immobility_threshold=0.1, immobility_window_minutes=30, max_gap_minutes=15, max_accuracy_m=50))
        if not db.query(GeofenceVersion).filter_by(farm_id=farm_id).first():
            db.add(GeofenceVersion(farm_id=farm_id, version=1, name="Potrero de demostración", polygon_json=json.dumps(DEMO_POLYGON)))
    device_secret = os.getenv("TELEMETRY_DEMO_DEVICE_SECRET")
    if device_secret and not db.query(TelemetryDevice).filter_by(id="collar-demo-001").first():
        db.add(TelemetryDevice(id="collar-demo-001", credential_hash=credential_hash(device_secret), farm_id=1, bovine_id="DIN-DEMO-000001"))
    db.commit()

