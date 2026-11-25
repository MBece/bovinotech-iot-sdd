from datetime import datetime, timezone
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


class ProductivityInput(BaseModel):
    model_config = ConfigDict(populate_by_name=True, str_strip_whitespace=True)


class WeighingCreate(ProductivityInput):
    client_event_id: UUID = Field(alias="clientEventId")
    lote_id: str = Field(alias="loteId", min_length=1, max_length=64)
    din: str = Field(min_length=1, max_length=32)
    weight_kg: Decimal = Field(alias="weightKg", gt=0, allow_inf_nan=False)
    captured_at: datetime = Field(alias="capturedAt")

    @model_validator(mode="after")
    def require_timezone(self):
        if self.captured_at.tzinfo is None or self.captured_at.utcoffset() is None:
            raise ValueError("capturedAt debe incluir zona horaria")
        object.__setattr__(self, "din", self.din.upper())
        object.__setattr__(self, "captured_at", self.captured_at.astimezone(timezone.utc))
        return self


class WeighingCorrection(WeighingCreate):
    reason: str = Field(min_length=1, max_length=500)

    @model_validator(mode="after")
    def require_reason(self):
        if not self.reason.strip():
            raise ValueError("reason no puede estar vacío")
        return self


class ConsumptionCreate(ProductivityInput):
    client_event_id: UUID = Field(alias="clientEventId")
    lote_id: str = Field(alias="loteId", min_length=1, max_length=64)
    period_start: datetime = Field(alias="periodStart")
    period_end: datetime = Field(alias="periodEnd")
    quantity_kg: Decimal = Field(alias="quantityKg", gt=0, allow_inf_nan=False)
    cost_amount: Decimal | None = Field(default=None, alias="costAmount", ge=0, allow_inf_nan=False)
    currency_code: str | None = Field(default=None, alias="currencyCode", pattern=r"^[A-Z]{3}$")

    @model_validator(mode="after")
    def validate_period_and_cost(self):
        for field in ("period_start", "period_end"):
            value = getattr(self, field)
            if value.tzinfo is None or value.utcoffset() is None:
                raise ValueError(f"{field} debe incluir zona horaria")
            object.__setattr__(self, field, value.astimezone(timezone.utc))
        if self.period_start >= self.period_end:
            raise ValueError("periodStart debe ser anterior a periodEnd")
        if self.cost_amount is not None and self.currency_code is None:
            raise ValueError("currencyCode es obligatorio cuando se informa costAmount")
        return self


class ConsumptionCorrection(ConsumptionCreate):
    reason: str = Field(min_length=1, max_length=500)

    @model_validator(mode="after")
    def require_reason(self):
        if not self.reason.strip():
            raise ValueError("reason no puede estar vacío")
        return self


class WeighingRead(BaseModel):
    id: str
    client_event_id: str = Field(alias="clientEventId")
    lote_id: str = Field(alias="loteId")
    din: str
    weight_kg: Decimal = Field(alias="weightKg")
    captured_at: datetime = Field(alias="capturedAt")
    author_id: str = Field(alias="authorId")
    is_atypical: bool = Field(alias="isAtypical")
    review_status: str = Field(alias="reviewStatus")
    sync_status: str = Field(default="SYNCED", alias="syncStatus")
    corrected_event_id: str | None = Field(default=None, alias="correctedEventId")
    correction_reason: str | None = Field(default=None, alias="correctionReason")

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


class ConsumptionRead(BaseModel):
    id: str
    client_event_id: str = Field(alias="clientEventId")
    lote_id: str = Field(alias="loteId")
    period_start: datetime = Field(alias="periodStart")
    period_end: datetime = Field(alias="periodEnd")
    quantity_kg: Decimal = Field(alias="quantityKg")
    cost_amount: Decimal | None = Field(alias="costAmount")
    currency_code: str | None = Field(alias="currencyCode")
    author_id: str = Field(alias="authorId")
    corrected_event_id: str | None = Field(default=None, alias="correctedEventId")
    correction_reason: str | None = Field(default=None, alias="correctionReason")
    sync_status: str = Field(default="SYNCED", alias="syncStatus")

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


class WeighingList(BaseModel):
    items: list[WeighingRead]
    next_cursor: str | None = Field(default=None, alias="nextCursor")


class ConsumptionList(BaseModel):
    items: list[ConsumptionRead]
    next_cursor: str | None = Field(default=None, alias="nextCursor")


class ReviewCreate(ProductivityInput):
    decision: Literal["APPROVED", "REJECTED"]
    reason: str = Field(min_length=1, max_length=500)

    @model_validator(mode="after")
    def require_reason(self):
        if not self.reason.strip():
            raise ValueError("reason no puede estar vacío")
        return self


class ReviewRead(BaseModel):
    id: str
    weighing_id: str = Field(alias="weighingId")
    decision: str
    reason: str
    reviewer_id: str = Field(alias="reviewerId")
    reviewed_at: datetime = Field(alias="reviewedAt")
    review_status: str = Field(alias="reviewStatus")

    model_config = ConfigDict(populate_by_name=True)


class ProductivitySummaryRead(BaseModel):
    lote_id: str = Field(alias="loteId")
    period_start: datetime = Field(alias="periodStart")
    period_end: datetime = Field(alias="periodEnd")
    gdp_kg_per_day: float | None = Field(alias="gdpKgPerDay")
    gdp_status: str = Field(alias="gdpStatus")
    feed_efficiency_kg_per_kg: float | None = Field(alias="feedEfficiencyKgPerKg")
    feed_efficiency_status: str = Field(alias="feedEfficiencyStatus")
    cost_status: str = Field(alias="costStatus")
    status: str
    missing_data: list[str] = Field(alias="missingData")
    atypical_pending_count: int = Field(alias="atypicalPendingCount")

    model_config = ConfigDict(populate_by_name=True)
