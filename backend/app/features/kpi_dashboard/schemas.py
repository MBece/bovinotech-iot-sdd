"""Pydantic contracts for HU-09 KPI dashboard."""

from datetime import datetime

from pydantic import ConfigDict

from app.features.sinigan.schemas import CamelModel, to_camel


class StrictCamelModel(CamelModel):
    """CamelCase model that rejects unknown input fields."""

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        from_attributes=True,
        extra="forbid",
    )


# ── Requests ────────────────────────────────────────────────────────────────


class KpiQuery(StrictCamelModel):
    farm_id: int | None = None
    start_date: str | None = None  # ISO date
    end_date: str | None = None


class AuditExportQuery(StrictCamelModel):
    farm_id: int | None = None
    start_date: str | None = None
    end_date: str | None = None


# ── Responses ───────────────────────────────────────────────────────────────


class PeriodInfo(CamelModel):
    start: str  # ISO date
    end: str    # ISO date


class KpiIndicators(CamelModel):
    validated_vaccination_coverage: float | None = None
    pending_validation_events: int | None = None
    open_alerts: int | None = None
    average_gdp: float | None = None


class KpiResponse(CamelModel):
    farm_id: int
    farm_name: str
    period: PeriodInfo
    indicators: KpiIndicators
    operational_only: bool = False
    generated_at: datetime
    generated_by: str


class AuditEventItem(CamelModel):
    din: str
    event_type: str
    validation_status: str
    author_email: str
    occurred_at: datetime


class AuditExportResponse(CamelModel):
    exported_at: datetime
    exported_by: str
    filters: dict
    kpi_summary: KpiIndicators
    events: list[AuditEventItem]
    total_events: int