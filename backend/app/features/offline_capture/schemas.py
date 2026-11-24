"""Contracts of the offline capture module (HU-02).

``CapturedEvent`` is the frozen shape of an event captured on the device. HU-03
sends it to the server, so it validates it with this same schema (research R5).
Business rule violations are reported as ordered error codes shared with the
frontend validator (contracts/captured-event.md).
"""
from datetime import datetime, timedelta, timezone
from typing import Any, Literal
from uuid import UUID

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    ValidationError,
    ValidationInfo,
    field_validator,
    model_validator,
)
from pydantic.alias_generators import to_camel
from pydantic_core import PydanticCustomError

EVENT_TYPES = ("VACCINATION", "TREATMENT", "CHECKUP", "DEWORMING")
DOSE_UNITS = ("ml", "mg", "g", "unidades")
PRODUCT_TYPES = {"VACCINATION", "DEWORMING", "TREATMENT"}
NOTES_MAX_LENGTH = 500
DOSE_UNIT_MAX_LENGTH = 16
# The server clock tolerates small device skew (contracts/captured-event.md).
SERVER_FUTURE_TOLERANCE = timedelta(minutes=5)

RULES_ERROR_TYPE = "captured_event_rules"
INVALID_FIELD = "INVALID_FIELD"

# Order of the contract table: codes are always reported in this order.
ERROR_CODES = (
    "FUTURE_TIMESTAMP",
    "INVALID_EVENT_TYPE",
    "PRODUCT_REQUIRED",
    "DOSE_REQUIRED",
    "DOSE_NOT_POSITIVE",
    "DOSE_UNIT_REQUIRED",
    "REASON_REQUIRED",
    "FINDING_REQUIRED",
    "NOTES_TOO_LONG",
)


def _blank(value: str | None) -> bool:
    return value is None or not value.strip()


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


class CapturedEvent(BaseModel):
    """Sanitary event captured on the device (data-model.md ``events``)."""

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        frozen=True,
    )

    client_event_id: UUID
    event_type: str
    din: str = Field(min_length=1, max_length=32)
    field_occurred_at: datetime
    product: str | None = Field(default=None, max_length=120)
    # NaN / Infinity (also 1e400, which overflows to inf) are type errors, so
    # they surface as INVALID_FIELD and never skip DOSE_REQUIRED or
    # DOSE_NOT_POSITIVE (HU-03 QA-11).
    dose_quantity: float | None = Field(default=None, allow_inf_nan=False)
    # Longest allowed unit is "unidades"; 16 matches the stored column.
    dose_unit: str | None = Field(default=None, max_length=DOSE_UNIT_MAX_LENGTH)
    reason: str | None = Field(default=None, max_length=500)
    finding: str | None = Field(default=None, max_length=500)
    notes: str | None = None
    author_email: str = Field(min_length=3, max_length=254)
    farm_id: int
    author_verification_pending: bool = False
    sync_status: str = "PENDIENTE_SINCRONIZACION"
    validation_status: str = "PENDIENTE_VALIDACION"
    origin: Literal["OFFLINE_CAPTURE", "LEGACY"] = "OFFLINE_CAPTURE"

    @field_validator("din")
    @classmethod
    def normalize_din(cls, value: str) -> str:
        return value.strip().upper()

    @field_validator("field_occurred_at")
    @classmethod
    def normalize_timestamp(cls, value: datetime) -> datetime:
        return _as_utc(value)

    @model_validator(mode="after")
    def check_business_rules(self, info: ValidationInfo) -> "CapturedEvent":
        context = info.context or {}
        now = _as_utc(context.get("now") or datetime.now(timezone.utc))
        codes = rule_violations(
            self,
            now=now,
            allow_future=bool(context.get("allow_future_timestamp")),
        )
        if codes:
            raise PydanticCustomError(
                RULES_ERROR_TYPE,
                "El evento no cumple las reglas de captura: {codes}",
                {"codes": codes},
            )
        return self


def rule_violations(
    event: CapturedEvent, now: datetime, allow_future: bool = False
) -> list[str]:
    """Business rules FR-007 and FR-015, in contract order."""
    codes: list[str] = []
    if not allow_future and event.field_occurred_at > now + SERVER_FUTURE_TOLERANCE:
        codes.append("FUTURE_TIMESTAMP")
    if event.event_type not in EVENT_TYPES:
        codes.append("INVALID_EVENT_TYPE")

    if event.event_type in EVENT_TYPES:
        # Legacy events keep what the preliminary capture stored (FR-019): it
        # had no product, unit, reason nor finding, so the required-field
        # rules are skipped. ``origin`` is declared by the client, so the rules
        # that do not depend on the age of the data still apply (HU-03 QA-01).
        legacy = event.origin == "LEGACY"
        if not legacy and event.event_type in PRODUCT_TYPES:
            if _blank(event.product):
                codes.append("PRODUCT_REQUIRED")
            if event.dose_quantity is None:
                codes.append("DOSE_REQUIRED")
        if event.dose_quantity is not None:
            if event.dose_quantity <= 0:
                codes.append("DOSE_NOT_POSITIVE")
            unit_missing_but_tolerated = legacy and event.dose_unit is None
            if event.dose_unit not in DOSE_UNITS and not unit_missing_but_tolerated:
                codes.append("DOSE_UNIT_REQUIRED")
        if not legacy and event.event_type == "TREATMENT" and _blank(event.reason):
            codes.append("REASON_REQUIRED")
        if not legacy and event.event_type == "CHECKUP" and _blank(event.finding):
            codes.append("FINDING_REQUIRED")

    if event.notes is not None and len(event.notes) > NOTES_MAX_LENGTH:
        codes.append("NOTES_TOO_LONG")
    return codes


def error_codes_from(exc: ValidationError) -> list[str]:
    """Contract codes of a validation error; field type errors map to
    ``INVALID_FIELD``."""
    codes: list[str] = []
    for error in exc.errors():
        if error["type"] == RULES_ERROR_TYPE:
            codes.extend(error["ctx"]["codes"])
        elif INVALID_FIELD not in codes:
            codes.append(INVALID_FIELD)
    return codes


def captured_event_error_codes(
    data: dict[str, Any], now: datetime | None = None, allow_future: bool = False
) -> list[str]:
    """Validates raw data and returns its error codes (empty when valid)."""
    try:
        CapturedEvent.model_validate(
            data, context={"now": now, "allow_future_timestamp": allow_future}
        )
    except ValidationError as exc:
        return error_codes_from(exc)
    return []


class CatalogAnimalItem(BaseModel):
    din: str
    name: str


class CatalogResponse(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    farm_id: int
    generated_at: datetime
    animals: list[CatalogAnimalItem]
