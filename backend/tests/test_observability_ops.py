import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_correlation_id_propagated_in_headers():
    # 1. Server generates X-Correlation-ID if client does not provide one
    response = client.get("/health")
    assert response.status_code == 200
    assert "x-correlation-id" in response.headers
    server_corr_id = response.headers["x-correlation-id"]
    assert len(server_corr_id) > 10

    # 2. Server echoes client provided X-Correlation-ID
    client_corr_id = "test-custom-uuid-4242"
    custom_resp = client.get("/health", headers={"X-Correlation-ID": client_corr_id})
    assert custom_resp.status_code == 200
    assert custom_resp.headers.get("x-correlation-id") == client_corr_id


def test_get_metrics_returns_sli_and_saludable_error_budget():
    response = client.get("/ops/metrics")
    assert response.status_code == 200
    data = response.json()

    assert "metrics" in data
    assert "error_budget" in data

    metrics = data["metrics"]
    assert "latency_p99_seconds" in metrics
    assert "sync_success_rate_percent" in metrics
    assert metrics["latency_p99_seconds"] < 10.0  # SLO is < 10 s

    budget = data["error_budget"]
    assert budget["status"] == "SALUDABLE"
    assert budget["is_freeze_active"] is False
    assert budget["budget_percentage_remaining"] > 20.0


def test_structured_logs_capture_correlation_id_and_no_secrets():
    test_corr_id = "forensic-trace-9999"
    client.get("/health", headers={"X-Correlation-ID": test_corr_id})

    response = client.get("/ops/logs")
    assert response.status_code == 200
    logs = response.json()
    assert isinstance(logs, list)

    matching_logs = [log for log in logs if log.get("correlation_id") == test_corr_id]
    assert len(matching_logs) > 0

    # Ensure no passwords or raw credentials in any log entry
    for entry in logs:
        text = str(entry).lower()
        assert "password123!" not in text
        assert "secret_key" not in text


def test_simulate_degradation_depletes_error_budget_and_activates_freeze():
    # Ingest degradation
    sim_payload = {
        "is_active": True,
        "inject_latency_seconds": 14.8,
        "inject_error_rate_percent": 12.0,
    }
    sim_resp = client.post("/ops/simulate-degradation", json=sim_payload)
    assert sim_resp.status_code == 200
    sim_data = sim_resp.json()
    assert sim_data["is_active"] is True
    assert sim_data["status"] == "AGOTADO"
    assert sim_data["is_freeze_active"] is True

    # Verify metrics and budget reflect AGOTADO and Feature Freeze active
    metrics_resp = client.get("/ops/metrics")
    assert metrics_resp.status_code == 200
    metrics_data = metrics_resp.json()

    budget = metrics_data["error_budget"]
    assert budget["status"] == "AGOTADO"
    assert budget["is_freeze_active"] is True
    assert "congelamiento" in budget["freeze_reason"].lower() or "freeze" in budget["freeze_reason"].lower()


def test_recover_from_degradation_restores_saludable_status():
    # Restore normal operations
    sim_payload = {"is_active": False}
    sim_resp = client.post("/ops/simulate-degradation", json=sim_payload)
    assert sim_resp.status_code == 200

    budget_resp = client.get("/ops/error-budget")
    assert budget_resp.status_code == 200
    budget_data = budget_resp.json()
    assert budget_data["status"] == "SALUDABLE"
    assert budget_data["is_freeze_active"] is False
