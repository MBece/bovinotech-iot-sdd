from datetime import datetime, timedelta, timezone
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


EventType = Literal["VACCINATION", "TREATMENT", "CHECKUP", "DEWORMING"]


class SyncEventItem(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    client_event_id: UUID = Field(alias="clientEventId")
    din: str = Field(min_length=1, max_length=32)
    event_type: EventType = Field(alias="eventType")
    field_occurred_at: datetime = Field(alias="fieldOccurredAt")
    product: str | None = Field(default=None, min_length=1, max_length=120)
    dose: float | None = Field(default=None, gt=0, le=10000)
    dose_unit: Literal["ml", "mg", "g", "unidades"] | None = Field(
        default=None, alias="doseUnit"
    )
    reason: str | None = Field(default=None, max_length=500)
    finding: str | None = Field(default=None, max_length=500)
    notes: str | None = Field(default=None, max_length=500)

    @field_validator("din")
    @classmethod
    def normalize_din(cls, value: str) -> str:
        return value.strip().upper()

    @field_validator("field_occurred_at")
    @classmethod
    def reject_future_capture(cls, value: datetime) -> datetime:
        normalized = value if value.tzinfo else value.replace(tzinfo=timezone.utc)
        if normalized > datetime.now(timezone.utc) + timedelta(minutes=5):
            raise ValueError("La fecha y hora de captura no puede estar en el futuro")
        return value

    @model_validator(mode="after")
    def validate_event_details(self):
        if self.event_type in {"VACCINATION", "TREATMENT", "DEWORMING"}:
            if not self.product or not self.product.strip():
                raise ValueError("Indique el producto aplicado")
            if self.dose is None or self.dose_unit is None:
                raise ValueError("Indique la dosis y su unidad")
        if self.event_type == "TREATMENT" and not (self.reason or "").strip():
            raise ValueError("Indique el motivo del tratamiento")
        if self.event_type == "CHECKUP" and not (self.finding or "").strip():
            raise ValueError("Indique el hallazgo clínico")
        return self


class SyncBatchRequest(BaseModel):
    items: list[SyncEventItem] = Field(min_length=1, max_length=100)


class SyncItemResult(BaseModel):
    model_config = ConfigDict(alias_generator=lambda value: value.split("_")[0] + "".join(
        part.capitalize() for part in value.split("_")[1:]
    ), populate_by_name=True)

    client_event_id: UUID
    status: Literal["SINCRONIZADO", "DUPLICADO", "FALLIDO"]
    event_id: int | None = None
    detail: str | None = None


class SyncBatchResponse(BaseModel):
    results: list[SyncItemResult]


class EventCorrectionRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    base_version: int = Field(alias="baseVersion", ge=1)
    event_type: EventType = Field(alias="eventType")
    field_occurred_at: datetime = Field(alias="fieldOccurredAt")
    product: str | None = Field(default=None, max_length=120)
    dose: float | None = Field(default=None, gt=0, le=10000)
    dose_unit: Literal["ml", "mg", "g", "unidades"] | None = Field(
        default=None, alias="doseUnit"
    )
    clinical_reason: str | None = Field(default=None, alias="clinicalReason", max_length=500)
    finding: str | None = Field(default=None, max_length=500)
    notes: str | None = Field(default=None, max_length=500)
    reason: str = Field(min_length=5, max_length=500)


class EventHistoryItem(BaseModel):
    model_config = ConfigDict(
        alias_generator=lambda value: value.split("_")[0]
        + "".join(part.capitalize() for part in value.split("_")[1:]),
        populate_by_name=True,
    )

    event_id: int
    correction_id: int | None = None
    client_event_id: str
    din: str
    version: int
    event_type: str
    field_occurred_at: datetime
    received_at: datetime
    author_email: str
    product: str | None = None
    dose: float | None = None
    dose_unit: str | None = None
    clinical_reason: str | None = None
    finding: str | None = None
    notes: str | None = None
    reason: str | None = None
    validation_status: str


class EventHistoryResponse(BaseModel):
    din: str
    items: list[EventHistoryItem]
