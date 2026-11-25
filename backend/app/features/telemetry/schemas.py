from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class ReadingIn(BaseModel):
    reading_id: str = Field(min_length=1, max_length=64)
    captured_at: datetime
    # Numeric domain validation is intentionally performed per reading by the
    # service.  Rejecting it here would make one bad sensor sample reject the
    # complete batch, contrary to AC-10.
    activity: float
    latitude: float | None = None
    longitude: float | None = None
    accuracy_m: float | None = None


class BatchIn(BaseModel):
    batch_id: str = Field(min_length=1, max_length=64)
    readings: list[ReadingIn] = Field(min_length=1, max_length=500)


class ReadingResult(BaseModel):
    reading_id: str
    result: Literal["NORMAL", "ALERT_TRIGGERED", "INSUFFICIENT_DATA", "REJECTED"]
    detail: str
    alert_ids: list[int] = Field(default_factory=list)


class BatchOut(BaseModel):
    batch_id: str
    duplicate: bool = False
    results: list[ReadingResult]


class AlertRead(BaseModel):
    id: int
    bovine_id: str
    alert_type: str
    status: str
    first_detected_at: datetime
    last_detected_at: datetime
    latitude: float | None
    longitude: float | None
    rule_version_id: int
    closure_note: str | None = None
    model_config = ConfigDict(from_attributes=True)


class AlertClose(BaseModel):
    observation: str = Field(min_length=3, max_length=500)


class RuleCreate(BaseModel):
    immobility_threshold: float = Field(ge=0, le=100)
    immobility_window_minutes: int = Field(ge=1, le=1440)
    max_gap_minutes: int = Field(ge=1, le=1440)
    max_accuracy_m: float = Field(gt=0, le=5000)


class RuleRead(RuleCreate):
    id: int
    farm_id: int
    version: int
    active_from: datetime
    model_config = ConfigDict(from_attributes=True)


class GeofenceCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    polygon: list[tuple[float, float]] = Field(min_length=3, max_length=200)

    @field_validator("polygon")
    @classmethod
    def validate_polygon(cls, polygon):
        for lat, lon in polygon:
            if not -90 <= lat <= 90 or not -180 <= lon <= 180:
                raise ValueError("coordenada fuera de rango")
        return polygon


class GeofenceRead(BaseModel):
    id: int
    farm_id: int
    version: int
    name: str
    polygon: list[list[float]]
    active_from: datetime

