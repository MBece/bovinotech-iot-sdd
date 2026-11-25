from collections import deque
from datetime import datetime, timezone
import random
import time
from typing import Any, Deque, Dict, List, Optional

from app.features.observability_ops.schemas import (
    BudgetStatus,
    DegradationSimulationRequest,
    DegradationSimulationResponse,
    ErrorBudgetStatus,
    LogEntry,
    MetricsEnvelope,
    ServiceLevelMetrics,
)


class ObservabilityService:
    def __init__(self, max_logs: int = 200):
        self._logs: Deque[Dict[str, Any]] = deque(maxlen=max_logs)
        self.simulation_active = False
        self.simulated_latency: float = 14.8
        self.simulated_error_rate: float = 12.0
        self.total_processed_events = 1420
        self.active_alerts_count = 2

        # Seed initial structured log entries
        self.log_event("INFO", "system-init-0001", "BovinoTech SRE Observability subsystem initialized", {"subsystem": "ops"})
        self.log_event("INFO", "system-init-0002", "SLI/SLO monitor active: latency target < 10.0s, sync target 99.9%", {"slo": True})

    def log_event(self, level: str, correlation_id: str, message: str, context: Optional[Dict[str, Any]] = None):
        # Sanitize context to prevent secret leaks
        safe_context = {}
        if context:
            for k, v in context.items():
                if any(sec in k.lower() for sec in ["pass", "token", "secret", "key"]):
                    safe_context[k] = "[REDACTED]"
                else:
                    safe_context[k] = v

        entry = {
            "timestamp": datetime.now(timezone.utc),
            "level": level.upper(),
            "correlation_id": correlation_id,
            "message": message,
            "context": safe_context,
        }
        self._logs.append(entry)

    def get_logs(self) -> List[LogEntry]:
        return [LogEntry(**item) for item in reversed(self._logs)]

    def get_metrics_and_budget(self) -> MetricsEnvelope:
        if self.simulation_active:
            latency_p99 = round(self.simulated_latency, 2)
            latency_p50 = round(self.simulated_latency * 0.7, 2)
            error_rate = round(self.simulated_error_rate, 2)
            sync_success = round(100.0 - error_rate, 2)
            budget_remaining = 0.0
            status = BudgetStatus.AGOTADO
            freeze_active = True
            freeze_reason = (
                f"Alerta Crítica SRE: Presupuesto de Error Agotado (0.0%). "
                f"Latencia p99 ({latency_p99}s) supera el SLO (<10s). "
                f"Congelamiento de cambios activo (Feature Freeze) — Solo estabilización."
            )
        else:
            latency_p99 = 3.8
            latency_p50 = 1.2
            error_rate = 0.05
            sync_success = 99.95
            budget_remaining = 82.5
            status = BudgetStatus.SALUDABLE
            freeze_active = False
            freeze_reason = None

        metrics = ServiceLevelMetrics(
            latency_p99_seconds=latency_p99,
            latency_p50_seconds=latency_p50,
            sync_success_rate_percent=sync_success,
            error_rate_percent=error_rate,
            total_processed_events=self.total_processed_events,
            active_alerts_count=self.active_alerts_count,
        )

        budget = ErrorBudgetStatus(
            budget_percentage_remaining=budget_remaining,
            status=status,
            is_freeze_active=freeze_active,
            freeze_reason=freeze_reason,
            target_slo_latency_seconds=10.0,
            target_slo_sync_success=99.9,
        )

        return MetricsEnvelope(metrics=metrics, error_budget=budget)

    def simulate_degradation(self, req: DegradationSimulationRequest) -> DegradationSimulationResponse:
        self.simulation_active = req.is_active
        if req.is_active:
            self.simulated_latency = req.inject_latency_seconds
            self.simulated_error_rate = req.inject_error_rate_percent
            self.log_event(
                "WARN",
                "sim-degrade-event",
                f"Inyección de degradación técnica activada: Latencia={req.inject_latency_seconds}s, ErrorRate={req.inject_error_rate_percent}%",
                {"action": "simulate_degradation", "state": "AGOTADO"},
            )
            return DegradationSimulationResponse(
                is_active=True,
                status=BudgetStatus.AGOTADO,
                is_freeze_active=True,
                message="Degradación simulada activada: Presupuesto de Error agotado y Feature Freeze habilitado.",
            )
        else:
            self.log_event(
                "INFO",
                "sim-restore-event",
                "Degradación técnica desactivada: Servicio retornado a condiciones saludables",
                {"action": "restore_service", "state": "SALUDABLE"},
            )
            return DegradationSimulationResponse(
                is_active=False,
                status=BudgetStatus.SALUDABLE,
                is_freeze_active=False,
                message="Servicio estabilizado: Error Budget retornado a estado SALUDABLE.",
            )


ops_service = ObservabilityService()
