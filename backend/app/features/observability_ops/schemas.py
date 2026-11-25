from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class BudgetStatus(str, Enum):
    SALUDABLE = "SALUDABLE"
    AGOTADO = "AGOTADO"


class LogEntry(BaseModel):
    timestamp: datetime
    level: str
    correlation_id: str
    message: str
    context: Dict[str, Any] = Field(default_factory=dict)


class ServiceLevelMetrics(BaseModel):
    latency_p99_seconds: float
    latency_p50_seconds: float
    sync_success_rate_percent: float
    error_rate_percent: float
    total_processed_events: int
    active_alerts_count: int


class ErrorBudgetStatus(BaseModel):
    budget_percentage_remaining: float
    status: BudgetStatus
    is_freeze_active: bool
    freeze_reason: Optional[str] = None
    target_slo_latency_seconds: float = 10.0
    target_slo_sync_success: float = 99.9


class MetricsEnvelope(BaseModel):
    metrics: ServiceLevelMetrics
    error_budget: ErrorBudgetStatus


class DegradationSimulationRequest(BaseModel):
    inject_latency_seconds: float = Field(default=14.8, ge=0.0)
    inject_error_rate_percent: float = Field(default=12.0, ge=0.0, le=100.0)
    is_active: bool = True


class DegradationSimulationResponse(BaseModel):
    is_active: bool
    status: BudgetStatus
    is_freeze_active: bool
    message: str
