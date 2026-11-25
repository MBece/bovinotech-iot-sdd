from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint

from app.core.database import Base


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class TelemetryDevice(Base):
    __tablename__ = "telemetry_devices"
    id = Column(String(64), primary_key=True)
    credential_hash = Column(String(64), nullable=False)
    farm_id = Column(Integer, nullable=False, index=True)
    bovine_id = Column(String(80), nullable=False, index=True)
    is_active = Column(Boolean, nullable=False, default=True)


class TelemetryBatch(Base):
    __tablename__ = "telemetry_batches"
    batch_id = Column(String(64), primary_key=True)
    device_id = Column(String(64), nullable=False, index=True)
    farm_id = Column(Integer, nullable=False, index=True)
    content_hash = Column(String(64), nullable=False)
    response_json = Column(Text, nullable=True)
    received_at = Column(DateTime(timezone=True), nullable=False, default=utc_now)


class TelemetryReading(Base):
    __tablename__ = "telemetry_readings"
    reading_id = Column(String(64), primary_key=True)
    batch_id = Column(String(64), ForeignKey("telemetry_batches.batch_id"), nullable=False)
    device_id = Column(String(64), nullable=False, index=True)
    farm_id = Column(Integer, nullable=False, index=True)
    bovine_id = Column(String(80), nullable=False, index=True)
    captured_at = Column(DateTime(timezone=True), nullable=False, index=True)
    activity = Column(Float, nullable=False)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    accuracy_m = Column(Float, nullable=True)


class AlertRuleVersion(Base):
    __tablename__ = "telemetry_rule_versions"
    id = Column(Integer, primary_key=True)
    farm_id = Column(Integer, nullable=False, index=True)
    version = Column(Integer, nullable=False)
    immobility_threshold = Column(Float, nullable=False, default=0.1)
    immobility_window_minutes = Column(Integer, nullable=False, default=30)
    max_gap_minutes = Column(Integer, nullable=False, default=15)
    max_accuracy_m = Column(Float, nullable=False, default=50)
    active_from = Column(DateTime(timezone=True), nullable=False, default=utc_now)
    created_by_id = Column(Integer, nullable=True)
    __table_args__ = (UniqueConstraint("farm_id", "version"),)


class GeofenceVersion(Base):
    __tablename__ = "telemetry_geofence_versions"
    id = Column(Integer, primary_key=True)
    farm_id = Column(Integer, nullable=False, index=True)
    version = Column(Integer, nullable=False)
    name = Column(String(100), nullable=False)
    polygon_json = Column(Text, nullable=False)
    active_from = Column(DateTime(timezone=True), nullable=False, default=utc_now)
    created_by_id = Column(Integer, nullable=True)
    __table_args__ = (UniqueConstraint("farm_id", "version"),)


class TelemetryEvaluation(Base):
    __tablename__ = "telemetry_evaluations"
    id = Column(Integer, primary_key=True)
    reading_id = Column(String(64), nullable=False, index=True)
    farm_id = Column(Integer, nullable=False, index=True)
    rule_version_id = Column(Integer, nullable=False)
    result = Column(String(32), nullable=False)
    explanation = Column(Text, nullable=False)
    evaluated_at = Column(DateTime(timezone=True), nullable=False, default=utc_now)


class TelemetryAlert(Base):
    __tablename__ = "telemetry_alerts"
    id = Column(Integer, primary_key=True)
    farm_id = Column(Integer, nullable=False, index=True)
    bovine_id = Column(String(80), nullable=False, index=True)
    alert_type = Column(String(32), nullable=False, index=True)
    condition_key = Column(String(120), nullable=False)
    rule_version_id = Column(Integer, nullable=False)
    geofence_version_id = Column(Integer, nullable=True)
    first_reading_id = Column(String(64), nullable=False)
    latest_reading_id = Column(String(64), nullable=False)
    first_detected_at = Column(DateTime(timezone=True), nullable=False, default=utc_now)
    last_detected_at = Column(DateTime(timezone=True), nullable=False, default=utc_now)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    closed_at = Column(DateTime(timezone=True), nullable=True)
    closed_by_id = Column(Integer, nullable=True)
    closure_note = Column(Text, nullable=True)
    __table_args__ = (UniqueConstraint("farm_id", "bovine_id", "alert_type", "condition_key"),)


class AlertClosure(Base):
    """Append-only evidence of the human decision that closes an alert."""

    __tablename__ = "telemetry_alert_closures"
    id = Column(Integer, primary_key=True)
    alert_id = Column(Integer, ForeignKey("telemetry_alerts.id"), nullable=False, unique=True, index=True)
    farm_id = Column(Integer, nullable=False, index=True)
    closed_at = Column(DateTime(timezone=True), nullable=False, default=utc_now)
    closed_by_id = Column(Integer, nullable=False)
    observation = Column(Text, nullable=False)

