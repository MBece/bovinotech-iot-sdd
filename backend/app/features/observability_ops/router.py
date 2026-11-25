from typing import List
from fastapi import APIRouter, Depends, Request

from app.features.observability_ops.schemas import (
    DegradationSimulationRequest,
    DegradationSimulationResponse,
    ErrorBudgetStatus,
    LogEntry,
    MetricsEnvelope,
)
from app.features.observability_ops.service import ops_service

router = APIRouter(prefix="/ops", tags=["Observabilidad Técnica y SRE"])


@router.get("/metrics", response_model=MetricsEnvelope)
def get_metrics():
    return ops_service.get_metrics_and_budget()


@router.get("/error-budget", response_model=ErrorBudgetStatus)
def get_error_budget():
    envelope = ops_service.get_metrics_and_budget()
    return envelope.error_budget


@router.get("/logs", response_model=List[LogEntry])
def get_logs():
    return ops_service.get_logs()


@router.post("/simulate-degradation", response_model=DegradationSimulationResponse)
def simulate_degradation(request: DegradationSimulationRequest):
    return ops_service.simulate_degradation(request)
