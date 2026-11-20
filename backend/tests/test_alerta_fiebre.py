import time
import uuid
from datetime import datetime, timezone
import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def get_token(username: str) -> str:
    response = client.post(
        "/auth/login",
        data={"username": username, "password": "password123"},
    )
    assert response.status_code == 200
    return response.json()["access_token"]


def test_fever_alert_generation_on_high_temperature():
    """
    Given un collar IoT emite lectura corporal > 39.5 °C (ej: 39.8 °C) con un sinigan_code válido
    When se envía al endpoint de telemetría
    Then se genera automáticamente una alerta crítica en estado ACTIVA y con severidad CRITICAL
    """
    event_id = str(uuid.uuid4())
    sinigan = f"CO-{uuid.uuid4().hex[:8].upper()}"
    payload = {
        "client_event_id": event_id,
        "collar_id": "COL-101",
        "sinigan_code": sinigan,
        "body_temperature": 39.8,
        "measured_at": datetime.now(timezone.utc).isoformat(),
    }

    response = client.post("/api/v1/alerta-fiebre/telemetry", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["alert_generated"] is True
    assert data["alert_id"] is not None

    vet_token = get_token("vet@bovinotech.co")
    alerts_res = client.get(
        "/api/v1/alerta-fiebre/alerts",
        headers={"Authorization": f"Bearer {vet_token}"},
    )
    assert alerts_res.status_code == 200
    alerts = alerts_res.json()
    target = next((a for a in alerts if a["id"] == data["alert_id"]), None)
    assert target is not None
    assert target["sinigan_code"] == sinigan
    assert target["temperature"] == 39.8
    assert target["severity"] == "CRITICAL"
    assert target["status"] == "ACTIVE"


def test_no_alert_generation_on_normal_and_threshold_temperature():
    """
    Given lecturas con temperatura normal (38.5 °C) y en el umbral límite exacto (39.5 °C)
    When se envían al endpoint de telemetría
    Then se registran sin generar alerta sanitaria (umbral estricto > 39.5 °C)
    """
    normal_payload = {
        "client_event_id": str(uuid.uuid4()),
        "collar_id": "COL-102",
        "sinigan_code": "CO-NORMAL-01",
        "body_temperature": 38.5,
        "measured_at": datetime.now(timezone.utc).isoformat(),
    }
    res_normal = client.post("/api/v1/alerta-fiebre/telemetry", json=normal_payload)
    assert res_normal.status_code == 200
    assert res_normal.json()["alert_generated"] is False
    assert res_normal.json()["alert_id"] is None

    threshold_payload = {
        "client_event_id": str(uuid.uuid4()),
        "collar_id": "COL-103",
        "sinigan_code": "CO-THRESHOLD-01",
        "body_temperature": 39.5,
        "measured_at": datetime.now(timezone.utc).isoformat(),
    }
    res_threshold = client.post("/api/v1/alerta-fiebre/telemetry", json=threshold_payload)
    assert res_threshold.status_code == 200
    assert res_threshold.json()["alert_generated"] is False
    assert res_threshold.json()["alert_id"] is None


def test_telemetry_processing_latency_under_10s():
    """
    Given una lectura telemétrica de campo
    When se procesa en el sistema central
    Then el tiempo de respuesta total debe ser inferior a 10 segundos (SLO)
    """
    payload = {
        "client_event_id": str(uuid.uuid4()),
        "collar_id": "COL-SPEED",
        "sinigan_code": "CO-LATENCY-TEST",
        "body_temperature": 40.2,
        "measured_at": datetime.now(timezone.utc).isoformat(),
    }

    start = time.perf_counter()
    response = client.post("/api/v1/alerta-fiebre/telemetry", json=payload)
    elapsed = time.perf_counter() - start

    assert response.status_code == 200
    assert elapsed < 10.0, f"SLO violado: latencia {elapsed:.2f}s excede el límite de 10s"
    assert response.json()["processing_time_ms"] < 10000.0


def test_idempotency_avoids_duplicate_alerts():
    """
    Given un paquete de telemetría recibido desde cola offline con client_event_id
    When se transmite repetidamente (reintento de sincronización)
    Then el sistema no genera alertas duplicadas
    """
    event_id = str(uuid.uuid4())
    payload = {
        "client_event_id": event_id,
        "collar_id": "COL-IDEMPOTENT",
        "sinigan_code": "CO-IDEM-001",
        "body_temperature": 39.9,
        "measured_at": datetime.now(timezone.utc).isoformat(),
    }

    # Primer envío
    res1 = client.post("/api/v1/alerta-fiebre/telemetry", json=payload)
    assert res1.status_code == 200
    alert_id1 = res1.json()["alert_id"]
    assert alert_id1 is not None

    # Segundo envío idéntico
    res2 = client.post("/api/v1/alerta-fiebre/telemetry", json=payload)
    assert res2.status_code == 200
    alert_id2 = res2.json()["alert_id"]
    assert alert_id2 == alert_id1


def test_fever_alert_attend_append_only():
    """
    Given una alerta de fiebre activa
    When un Veterinario la atiende ingresando diagnóstico y tratamiento
    Then se crea un nuevo registro de atención enlazado, preservando la alerta original inmutable
    """
    event_id = str(uuid.uuid4())
    sinigan = f"CO-ATTEND-{uuid.uuid4().hex[:6]}"
    res_telemetry = client.post(
        "/api/v1/alerta-fiebre/telemetry",
        json={
            "client_event_id": event_id,
            "collar_id": "COL-ATTEND",
            "sinigan_code": sinigan,
            "body_temperature": 40.5,
            "measured_at": datetime.now(timezone.utc).isoformat(),
        },
    )
    alert_id = res_telemetry.json()["alert_id"]

    vet_token = get_token("vet@bovinotech.co")

    # Atender la alerta
    attend_payload = {
        "clinical_notes": "Cuadro febril severo. Se administra antipirético y antibiótico preventivo.",
        "treatment_applied": "Dipirona 50% 20ml IM + Oxitetraciclina 200mg",
    }
    res_attend = client.post(
        f"/api/v1/alerta-fiebre/alerts/{alert_id}/attend",
        json=attend_payload,
        headers={"Authorization": f"Bearer {vet_token}"},
    )
    assert res_attend.status_code == 200
    attend_data = res_attend.json()
    assert attend_data["referenced_alert_id"] == alert_id
    assert attend_data["veterinarian_email"] == "vet@bovinotech.co"
    assert "Dipirona" in attend_data["treatment_applied"]

    # Verificar detalle de la alerta y que su registro original persiste intacto
    detail_res = client.get(
        f"/api/v1/alerta-fiebre/alerts/{alert_id}",
        headers={"Authorization": f"Bearer {vet_token}"},
    )
    assert detail_res.status_code == 200
    detail = detail_res.json()
    assert detail["id"] == alert_id
    assert detail["temperature"] == 40.5
    assert detail["status"] == "ATTENDED"
    assert len(detail.get("attentions", [])) >= 1


def test_attend_alert_forbidden_for_operario():
    """
    Given una alerta de fiebre activa
    When un usuario con rol OPERARIO intenta atenderla
    Then el sistema deniega el acceso con 403 Forbidden
    """
    event_id = str(uuid.uuid4())
    res_telemetry = client.post(
        "/api/v1/alerta-fiebre/telemetry",
        json={
            "client_event_id": event_id,
            "collar_id": "COL-RBAC",
            "sinigan_code": "CO-RBAC-001",
            "body_temperature": 40.0,
            "measured_at": datetime.now(timezone.utc).isoformat(),
        },
    )
    alert_id = res_telemetry.json()["alert_id"]

    operario_token = get_token("operario@bovinotech.co")
    res_attend = client.post(
        f"/api/v1/alerta-fiebre/alerts/{alert_id}/attend",
        json={"clinical_notes": "Intento no autorizado de operario"},
        headers={"Authorization": f"Bearer {operario_token}"},
    )
    assert res_attend.status_code == 403
    assert "Veterinario" in res_attend.json()["detail"]
