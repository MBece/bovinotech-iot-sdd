import enum
from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Float, DateTime, Enum as SQLEnum, Text, Boolean
from app.core.database import Base


class AlertSeverityEnum(str, enum.Enum):
    CRITICAL = "CRITICAL"
    WARNING = "WARNING"
    INFO = "INFO"


class AlertStatusEnum(str, enum.Enum):
    ACTIVE = "ACTIVE"
    ATTENDED = "ATTENDED"


class FeverAlert(Base):
    """
    Registro inmutable de la alerta sanitaria generada por temperatura febril.
    Indexa sinigan_code como String sin FK para preservar el aislamiento modular.
    """
    __tablename__ = "fever_alerts"

    id = Column(Integer, primary_key=True, index=True)
    client_event_id = Column(String, unique=True, index=True, nullable=False)
    collar_id = Column(String, index=True, nullable=False)
    sinigan_code = Column(String, index=True, nullable=False)
    temperature = Column(Float, nullable=False)
    severity = Column(SQLEnum(AlertSeverityEnum), default=AlertSeverityEnum.CRITICAL, nullable=False)
    status = Column(SQLEnum(AlertStatusEnum), default=AlertStatusEnum.ACTIVE, nullable=False)
    detected_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    is_offline_sync = Column(Boolean, default=False, nullable=False)


class FeverAlertAttention(Base):
    """
    Evento append-only de atención veterinaria.
    Se añade como un nuevo registro enlazado por referenced_alert_id.
    """
    __tablename__ = "fever_alert_attentions"

    id = Column(Integer, primary_key=True, index=True)
    referenced_alert_id = Column(Integer, index=True, nullable=False)
    veterinarian_email = Column(String, nullable=False)
    clinical_notes = Column(Text, nullable=False)
    treatment_applied = Column(Text, nullable=True)
    attended_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
