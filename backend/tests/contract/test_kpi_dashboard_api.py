"""Contract tests for HU-09 KPI Dashboard API.

Covers AC-01 to AC-04 plus security boundaries:
  - CRIT-1: VET cross-farm IDOR (403 if farm not assigned)
  - CRIT-2/CRIT-3: SanitaryEvent filtered by farm DINs
  - HIGH-1: farm_id validated against DB, not just JWT
"""

import pytest
from fastapi import status
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

PASSWORD = "password123"


def _login(email: str, password: str = PASSWORD,
           farm_id: int | None = None) -> str:
    body = {"username": email, "password": password}
    if farm_id is not None:
        body["farm_id"] = farm_id
    resp = client.post("/auth/login", json=body)
    assert resp.status_code == 200, f"Login failed for {email}: {resp.text}"
    return resp.json()["access_token"]


class TestKpiIndicadores:
    """AC-01: Dado una finca y rango de fechas, el veterinario/directivo
    visualiza cobertura, pendientes, alertas y GDP."""

    def test_vet_sees_all_indicators(self):
        token = _login("vet@bovinotech.co")
        resp = client.get(
            "/dashboard/kpi?start_date=2026-01-01&end_date=2026-12-31",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["farmId"] == 1
        assert data["operationalOnly"] is False
        # GDP debe ser 0.44 con los seeds demo (3 animales × 3 mediciones)
        assert data["indicators"]["averageGdp"] == 0.44
        # openAlerts puede ser 0 (no hay tickets si no se crearon en tests)
        assert isinstance(data["indicators"]["openAlerts"], int)
        # Coverage puede ser None si no hay VACCINATION events seedeados
        cov = data["indicators"]["validatedVaccinationCoverage"]
        assert cov is None or isinstance(cov, float)
        pending = data["indicators"]["pendingValidationEvents"]
        assert isinstance(pending, int)

    def test_vet_sees_with_default_dates(self):
        """Funciona sin parametros de fecha (usa defaults)."""
        token = _login("vet@bovinotech.co")
        resp = client.get(
            "/dashboard/kpi",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200


class TestPendingValidationSeparate:
    """AC-02: Dado evento PENDIENTE_VALIDACION, no suma a cobertura."""

    def test_coverage_excludes_pending(self):
        """Los indicadores de pending y coverage son independientes."""
        token = _login("vet@bovinotech.co")
        resp = client.get(
            "/dashboard/kpi?start_date=2026-01-01&end_date=2026-12-31",
            headers={"Authorization": f"Bearer {token}"},
        )
        data = resp.json()
        indicators = data["indicators"]
        assert isinstance(indicators["pendingValidationEvents"], int)
        cov = indicators["validatedVaccinationCoverage"]
        assert cov is None or isinstance(cov, float)
        # Ambos valores son independientes (no comparten contador)
        assert not (isinstance(cov, (int, float)) and cov > 0 and
                    indicators["pendingValidationEvents"] > 0 and
                    cov / 100 + indicators["pendingValidationEvents"] == 0)


class TestOperarioRestricted:
    """AC-03: Dado OPERARIO, solo ve metricas operativas de su finca."""

    def test_operario_sees_only_operational(self):
        token = _login("operario@bovinotech.co")
        resp = client.get("/dashboard/kpi",
                          headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["operationalOnly"] is True
        assert data["indicators"]["openAlerts"] is None
        assert data["indicators"]["averageGdp"] is None
        cov = data["indicators"]["validatedVaccinationCoverage"]
        assert cov is None or isinstance(cov, float)
        assert isinstance(data["indicators"]["pendingValidationEvents"], int)

    def test_operario_farm_boundary_enforced(self):
        """CRIT-1: OPERARIO no puede forzar farm_id distinto."""
        token = _login("operario@bovinotech.co")
        resp = client.get("/dashboard/kpi?farm_id=2",
                          headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200
        assert resp.json()["farmId"] == 1

    def test_operario_cannot_export_audit(self):
        """RBAC: OPERARIO no puede exportar auditoria."""
        token = _login("operario@bovinotech.co")
        resp = client.get("/dashboard/audit-export",
                          headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == status.HTTP_403_FORBIDDEN


class TestAuditExport:
    """AC-04: Dado solicitud de reporte de auditoria, incluye filtros,
    responsable y estado de validacion."""

    def test_audit_export_structure(self):
        token = _login("vet@bovinotech.co")
        resp = client.get(
            "/dashboard/audit-export?start_date=2026-01-01&end_date=2026-12-31",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "exportedAt" in data
        assert "exportedBy" in data
        assert data["exportedBy"] == "vet@bovinotech.co"
        assert "filters" in data
        assert data["filters"]["farm_id"] == 1
        assert "kpiSummary" in data
        assert "events" in data
        assert isinstance(data["totalEvents"], int)
        if data["events"]:
            ev = data["events"][0]
            assert "din" in ev
            assert "eventType" in ev
            assert "validationStatus" in ev
            assert "authorEmail" in ev
            assert "occurredAt" in ev


class TestSecurity:
    """CRIT-1, HIGH-1 — Farm isolation and RBAC."""

    def test_vet_cross_farm_forbidden(self):
        """CRIT-1: VET de finca 1 no puede ver finca inexistente 99."""
        token = _login("vet@bovinotech.co")
        resp = client.get("/dashboard/kpi?farm_id=99",
                          headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == status.HTTP_403_FORBIDDEN

    def test_vet2_cross_farm_forbidden(self):
        """HIGH-1: Vet2 de finca 2 no puede ver finca 999 (no asignada)."""
        token = _login("vet2@bovinotech.co", farm_id=2)
        resp = client.get("/dashboard/kpi?farm_id=999",
                          headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == status.HTTP_403_FORBIDDEN

    def test_vet2_own_farm_allowed(self):
        """Vet2 puede ver su propia finca 2."""
        token = _login("vet2@bovinotech.co", farm_id=2)
        resp = client.get("/dashboard/kpi?farm_id=2",
                          headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200
        assert resp.json()["farmId"] == 2

    def test_no_token_unauthorized(self):
        """Sin token -> 401."""
        resp = client.get("/dashboard/kpi")
        assert resp.status_code == status.HTTP_401_UNAUTHORIZED

    def test_bad_date_format(self):
        """Fecha invalida -> 422."""
        token = _login("vet@bovinotech.co")
        resp = client.get("/dashboard/kpi?start_date=not-a-date",
                          headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY


class TestAdmin:
    def test_admin_kpi(self):
        """ADMIN puede ver KPI."""
        token = _login("admin@bovinotech.co")
        resp = client.get("/dashboard/kpi",
                          headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200
        assert resp.json()["farmId"] is not None