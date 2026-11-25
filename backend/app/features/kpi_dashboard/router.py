"""HTTP routes for HU-09 KPI dashboard."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.features.auth.dependencies import get_current_user
from app.features.auth.models import User
from app.features.kpi_dashboard.schemas import AuditExportResponse, KpiResponse
from app.features.kpi_dashboard.service import KpiDashboardService

router = APIRouter()
kpi_service = KpiDashboardService()


@router.get(
    "/kpi",
    response_model=KpiResponse,
    summary="Indicadores consolidados del periodo",
)
def get_kpi(
    farm_id: int | None = Query(default=None),
    start_date: str | None = Query(default=None),
    end_date: str | None = Query(default=None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return kpi_service.get_kpi(current_user, db, farm_id, start_date, end_date)


@router.get(
    "/audit-export",
    response_model=AuditExportResponse,
    summary="Reporte de auditoría del periodo",
)
def get_audit_export(
    farm_id: int | None = Query(default=None),
    start_date: str | None = Query(default=None),
    end_date: str | None = Query(default=None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return kpi_service.get_audit_export(current_user, db, farm_id, start_date, end_date)