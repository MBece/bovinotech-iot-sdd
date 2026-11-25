from datetime import datetime, timedelta, timezone
from decimal import Decimal
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.database import Base, get_db
from app.features.auth.dependencies import get_current_user
from app.features.productivity.router import router
from app.features.productivity.service import (
    calculate_feed_efficiency,
    calculate_gdp,
    calculate_productivity_summary,
    is_atypical_weight,
)

@pytest.fixture
def productivity_client():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    test_session = sessionmaker(bind=engine, autocommit=False, autoflush=False)
    current_user = [SimpleNamespace(id=21, role_value="OPERARIO", active_farm_id=8)]

    def override_db():
        db = test_session()
        try:
            yield db
        finally:
            db.close()

    test_app = FastAPI()
    test_app.include_router(router, prefix="/productivity")
    test_app.dependency_overrides[get_db] = override_db
    test_app.dependency_overrides[get_current_user] = lambda: current_user[0]
    with TestClient(test_app) as client:
        yield client, current_user
    test_app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=engine)
    engine.dispose()


def test_gdp_uses_exact_weight_gain_over_elapsed_days():
    assert calculate_gdp(400, 410, 5) == 2


def test_gdp_preserves_decimal_precision():
    assert calculate_gdp(Decimal("400.1"), Decimal("400.4"), Decimal("0.5")) == Decimal("0.6")


def test_feed_efficiency_uses_consumption_over_weight_gain():
    assert calculate_feed_efficiency(800, 100) == 8


def test_feed_efficiency_preserves_decimal_precision():
    assert calculate_feed_efficiency(Decimal("0.3"), Decimal("0.1")) == Decimal("3")


def test_weight_change_over_fifteen_kg_within_twenty_four_hours_is_atypical():
    previous_at = datetime(2026, 11, 24, 8, tzinfo=timezone.utc)
    captured_at = previous_at + timedelta(hours=23)

    assert is_atypical_weight(400, previous_at, 416, captured_at) is True


def test_atypical_threshold_is_strict_for_weight_and_time_boundaries():
    previous_at = datetime(2026, 11, 24, 8, tzinfo=timezone.utc)

    assert is_atypical_weight(400, previous_at, 415, previous_at + timedelta(hours=23)) is False
    assert is_atypical_weight(400, previous_at, 416, previous_at + timedelta(hours=24)) is False
    assert is_atypical_weight(400, previous_at, 384, previous_at + timedelta(hours=2)) is True


def test_missing_weighings_and_consumption_return_insufficient_data():
    summary = calculate_productivity_summary(
        weighings=[],
        consumptions=[],
        cohort_dins=["DIN-DEMO-0001"],
    )

    assert summary["gdp_status"] == "DATOS_INSUFICIENTES"
    assert summary["feed_efficiency_status"] == "DATOS_INSUFICIENTES"
    assert summary["cost_status"] == "DATOS_INSUFICIENTES"
    assert summary["status"] == "DATOS_INSUFICIENTES"
    assert summary["gdp_kg_per_day"] is None
    assert summary["feed_efficiency_kg_per_kg"] is None


def test_pending_atypical_weighing_is_excluded_from_gdp_projection():
    first_at = datetime(2026, 11, 1, tzinfo=timezone.utc)
    last_at = first_at + timedelta(days=1)
    weighings = [
        SimpleNamespace(
            id="first", bovine_id="DIN-PROJ-01", weight_kg=400,
            captured_at=first_at, is_atypical=False, corrected_event_id=None,
        ),
        SimpleNamespace(
            id="pending", bovine_id="DIN-PROJ-01", weight_kg=420,
            captured_at=last_at, is_atypical=True, corrected_event_id=None,
        ),
    ]

    summary = calculate_productivity_summary(
        weighings=weighings,
        consumptions=[],
        cohort_dins=["DIN-PROJ-01"],
    )

    assert summary["gdp_status"] == "DATOS_INSUFICIENTES"
    assert summary["atypical_pending_count"] == 1


def test_capture_is_idempotent_and_correction_preserves_original(productivity_client):
    client, _ = productivity_client
    payload = {
        "clientEventId": "59d5e43a-7831-4054-af0d-8666578a0a11",
        "loteId": "LOTE-TEST",
        "din": "din-test-01",
        "weightKg": 400,
        "capturedAt": "2026-11-24T08:00:00Z",
    }

    created = client.post("/productivity/pesajes", json=payload)
    repeated = client.post("/productivity/pesajes", json=payload)

    assert created.status_code == 201
    assert created.json()["din"] == "DIN-TEST-01"
    assert repeated.status_code == 200
    assert repeated.json()["syncStatus"] == "DUPLICADO"

    correction = {
        **payload,
        "clientEventId": "9ae50f3a-fba6-42fb-976e-37623748bfa1",
        "weightKg": 401,
        "reason": "Lectura corregida con báscula verificada",
    }
    corrected = client.post(
        f"/productivity/pesajes/{created.json()['id']}/correcciones",
        json=correction,
    )
    history = client.get("/productivity/pesajes", params={"lote_id": "LOTE-TEST"})

    assert corrected.status_code == 201
    assert corrected.json()["correctedEventId"] == created.json()["id"]
    assert len(history.json()["items"]) == 2
    assert float(history.json()["items"][0]["weightKg"]) == 400


def test_consumption_correction_is_append_only_and_keeps_reason(productivity_client):
    client, _ = productivity_client
    initial = {
        "clientEventId": "c165c635-18ac-4a56-8623-5d068969d649",
        "loteId": "LOTE-CONSUMPTION",
        "periodStart": "2026-11-01T00:00:00Z",
        "periodEnd": "2026-11-02T00:00:00Z",
        "quantityKg": 100,
        "costAmount": 200000,
        "currencyCode": "COP",
    }
    original = client.post("/productivity/consumos", json=initial)
    correction = {
        **initial,
        "clientEventId": "fe51ae6c-8a25-4782-a761-b83331fcf139",
        "quantityKg": 110,
        "reason": "Se verificó el registro de alimento.",
    }

    corrected = client.post(
        f"/productivity/consumos/{original.json()['id']}/correcciones",
        json=correction,
    )
    history = client.get("/productivity/consumos", params={"lote_id": "LOTE-CONSUMPTION"})

    assert original.status_code == 201
    assert corrected.status_code == 201
    assert corrected.json()["correctedEventId"] == original.json()["id"]
    assert corrected.json()["correctionReason"] == correction["reason"]
    assert len(history.json()["items"]) == 2
    assert float(history.json()["items"][0]["quantityKg"]) == 100


def test_capture_rejects_non_positive_weight_and_timezone_naive_capture(productivity_client):
    client, _ = productivity_client
    valid_payload = {
        "clientEventId": "cc88423c-e37f-46a7-bca6-a59496ade02f",
        "loteId": "LOTE-TEST",
        "din": "DIN-TEST-03",
        "weightKg": 0,
        "capturedAt": "2026-11-24T08:00:00Z",
    }

    invalid_weight = client.post("/productivity/pesajes", json=valid_payload)
    invalid_timezone = client.post(
        "/productivity/pesajes",
        json={**valid_payload, "weightKg": 400, "capturedAt": "2026-11-24T08:00:00"},
    )

    assert invalid_weight.status_code == 422
    assert invalid_timezone.status_code == 422


def test_atypical_weighing_is_retained_and_only_authorized_roles_can_review(productivity_client):
    client, current_user = productivity_client
    baseline = {
        "clientEventId": "7ef0fb71-43ac-457a-baf0-401a4b203f67",
        "loteId": "LOTE-TEST",
        "din": "DIN-TEST-02",
        "weightKg": 400,
        "capturedAt": "2026-11-24T08:00:00Z",
    }
    client.post("/productivity/pesajes", json=baseline)
    atypical = {
        **baseline,
        "clientEventId": "713e08e7-6051-44b7-86c7-8ed52f30bbfa",
        "weightKg": 416,
        "capturedAt": "2026-11-24T09:00:00Z",
    }
    created = client.post("/productivity/pesajes", json=atypical)
    assert created.status_code == 201
    assert created.json()["isAtypical"] is True
    assert created.json()["reviewStatus"] == "ATIPICO_EN_REVISION"

    review_data = {"decision": "APPROVED", "reason": "Peso confirmado"}
    denied = client.post(
        f"/productivity/pesajes/{created.json()['id']}/revision",
        json=review_data,
    )
    assert denied.status_code == 403

    current_user[0] = SimpleNamespace(id=22, role_value="VETERINARIO", active_farm_id=8)
    accepted = client.post(
        f"/productivity/pesajes/{created.json()['id']}/revision",
        json=review_data,
    )
    assert accepted.status_code == 201
    assert accepted.json()["reviewStatus"] == "APPROVED"
    history = client.get("/productivity/pesajes", params={"lote_id": "LOTE-TEST"})
    assert len(history.json()["items"]) == 2


def test_lot_summary_calculates_gdp_efficiency_and_insufficient_status(productivity_client):
    client, current_user = productivity_client
    current_user[0] = SimpleNamespace(id=21, role_value="ADMINISTRADOR", active_farm_id=8)
    start = datetime(2026, 11, 1, tzinfo=timezone.utc)
    end = start + timedelta(days=10)
    for event_id, weight, timestamp in (
        ("5c7c3942-8330-4840-a677-72846fbeaa87", 400, start.isoformat()),
        ("42b199e8-1ad9-4bab-9de8-f23e8ff36166", 420, end.isoformat()),
    ):
        response = client.post(
            "/productivity/pesajes",
            json={
                "clientEventId": event_id,
                "loteId": "LOTE-CALC",
                "din": "DIN-CALC-01",
                "weightKg": weight,
                "capturedAt": timestamp,
            },
        )
        assert response.status_code == 201
    consumption = client.post(
        "/productivity/consumos",
        json={
            "clientEventId": "a1d2051d-a6bf-4138-8dd1-37f7e4f6b8bf",
            "loteId": "LOTE-CALC",
            "periodStart": start.isoformat(),
            "periodEnd": end.isoformat(),
            "quantityKg": 160,
            "costAmount": 50000,
            "currencyCode": "COP",
        },
    )
    assert consumption.status_code == 201
    summary = client.get(
        "/productivity/lotes/LOTE-CALC/gdp",
        params={
            "fecha_inicio": start.isoformat(),
            "fecha_fin": end.isoformat(),
        },
    )

    assert summary.status_code == 200
    assert summary.json()["gdpKgPerDay"] == 2
    assert summary.json()["feedEfficiencyKgPerKg"] == 8
    assert summary.json()["status"] == "SUFFICIENT"

    insufficient = client.get(
        "/productivity/lotes/LOTE-CALC/gdp",
        params={
            "fecha_inicio": start.isoformat(),
            "fecha_fin": end.isoformat(),
            "dins": ["DIN-MISSING"],
        },
    )
    assert insufficient.status_code == 200
    assert insufficient.json()["gdpStatus"] == "DATOS_INSUFICIENTES"
    assert insufficient.json()["gdpKgPerDay"] is None
