from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field, ConfigDict
from app.features.alerta_fiebre.models import AlertSeverityEnum, AlertStatusEnum


class TelemetryIngestRequest(BaseModel):
    client_event_id: str = Field(..., description="UUID único generado por el collar/colector")
    collar_id: str = Field(..., description="Identificador del collar IoT")
    sinigan_code: str = Field(..., description="Código SINIGÁN oficial del animal")
    body_temperature: float = Field(..., ge=20.0, le=50.0, description="Temperatura corporal en °C")
    measured_at: datetime = Field(..., description="Marca de tiempo de la medición")


class TelemetryIngestResponse(BaseModel):
    status: str
    alert_generated: bool
    alert_id: Optional[int] = None
    processing_time_ms: float
    message: str


class AttendAlertRequest(BaseModel):
    clinical_notes: str = Field(..., min_length=5, description="Notas clínicas y diagnóstico")
    treatment_applied: Optional[str] = Field(None, description="Tratamiento farmacológico o manejo")


class FeverAlertAttentionResponse(BaseModel):
    id: int
    referenced_alert_id: int
    veterinarian_email: str
    attended_at: datetime
    clinical_notes: str
    treatment_applied: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class FeverAlertResponse(BaseModel):
    id: int
    sinigan_code: str
    collar_id: str
    temperature: float
    severity: AlertSeverityEnum
    status: AlertStatusEnum
    detected_at: datetime
    client_event_id: str
    is_offline_sync: bool
    attentions: List[FeverAlertAttentionResponse] = []

    model_config = ConfigDict(from_attributes=True)
