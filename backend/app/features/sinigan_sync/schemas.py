"""Pydantic contracts for HU-05 simulated SINIGAN reconciliation."""

from datetime import datetime
from typing import Any, Literal

from pydantic import ConfigDict, Field, field_validator

from app.features.sinigan.schemas import CamelModel, to_camel

MOCK_LABEL = "MODO SIMULADO (SINIGÁN V6 MOCK)"
FIELD_SOURCE = "REGISTRO DE CAMPO"

TicketStatus = Literal["OPEN", "CLOSED"]
ComparisonResult = Literal["CONSISTENTE", "DISCREPANCIA"]
ResolutionDecision = Literal["OFICIAL_PREVALECE", "CAMPO_PREVALECE"]


class StrictCamelModel(CamelModel):
    """CamelCase model that rejects unknown input fields."""

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        from_attributes=True,
        extra="forbid",
    )


class ComparisonRequest(StrictCamelModel):
    # DIN format is checked manually in the router to honour the 400 contract.
    din: str = Field(min_length=1, max_length=32)


class ResolutionRequest(StrictCamelModel):
    decision: ResolutionDecision
    reason: str

    @field_validator("reason")
    @classmethod
    def normalize_reason(cls, value: str) -> str:
        trimmed = value.strip()
        if not 5 <= len(trimmed) <= 500:
            raise ValueError(
                "El motivo debe tener entre 5 y 500 caracteres después de recortar."
            )
        return trimmed


class ReconciliationMeta(CamelModel):
    source_system: Literal["SINIGAN"] = "SINIGAN"
    source_mode: Literal["SIMULADO"] = "SIMULADO"
    is_simulation: Literal[True] = True
    mock_label: str = MOCK_LABEL
    compared_at: datetime


class DiscrepancyResponse(CamelModel):
    field_name: str
    field_label: str
    official_value: str
    field_value: str
    official_source: str
    field_source: str
    detected_at: datetime


class TicketSummaryResponse(CamelModel):
    id: int
    din: str
    farm_id: int
    status: TicketStatus
    compared_at: datetime
    created_by_email: str
    created_at: datetime
    closed_at: datetime | None = None
    discrepancy_count: int


class ComparisonResponse(CamelModel):
    meta: ReconciliationMeta
    official: dict[str, Any]
    field: dict[str, Any]
    result: ComparisonResult
    discrepancies: list[DiscrepancyResponse]
    ticket: TicketSummaryResponse | None = None


class TicketListResponse(CamelModel):
    items: list[TicketSummaryResponse]


class ResolutionResponse(CamelModel):
    decision: ResolutionDecision
    reason: str
    resolved_by_email: str
    resolved_at: datetime


class TicketDetailResponse(CamelModel):
    id: int
    din: str
    farm_id: int
    status: TicketStatus
    official_snapshot: dict[str, Any]
    field_snapshot: dict[str, Any]
    official_source: str
    field_source: str
    compared_at: datetime
    created_by_email: str
    created_at: datetime
    closed_at: datetime | None = None
    discrepancies: list[DiscrepancyResponse]
    resolution: ResolutionResponse | None = None


class ResolutionResultResponse(CamelModel):
    id: int
    din: str
    farm_id: int
    status: TicketStatus
    closed_at: datetime
    resolution: ResolutionResponse
