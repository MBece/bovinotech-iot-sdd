from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


class SyncEventItem(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    client_event_id: UUID = Field(alias="clientEventId")
    din: str = Field(min_length=1, max_length=32)
    event_type: Literal["VACCINATION", "TREATMENT", "CHECKUP"] = Field(
        alias="eventType"
    )
    field_occurred_at: datetime = Field(alias="fieldOccurredAt")
    dose: float | None = Field(default=None, gt=0, le=10000)
    notes: str | None = Field(default=None, max_length=500)

    @field_validator("din")
    @classmethod
    def normalize_din(cls, value: str) -> str:
        return value.strip().upper()


class SyncBatchRequest(BaseModel):
    items: list[SyncEventItem] = Field(min_length=1, max_length=100)


class SyncItemResult(BaseModel):
    model_config = ConfigDict(alias_generator=lambda value: value.split("_")[0] + "".join(
        part.capitalize() for part in value.split("_")[1:]
    ), populate_by_name=True)

    client_event_id: UUID
    status: Literal["CREADO", "DUPLICADO", "RECHAZADO"]
    event_id: int | None = None
    detail: str | None = None


class SyncBatchResponse(BaseModel):
    results: list[SyncItemResult]


class EventCorrectionRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    base_version: int = Field(alias="baseVersion", ge=1)
    event_type: Literal["VACCINATION", "TREATMENT", "CHECKUP"] = Field(
        alias="eventType"
    )
    field_occurred_at: datetime = Field(alias="fieldOccurredAt")
    dose: float | None = Field(default=None, gt=0, le=10000)
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
    dose: float | None = None
    notes: str | None = None
    reason: str | None = None
    validation_status: str


class EventHistoryResponse(BaseModel):
    din: str
    items: list[EventHistoryItem]
