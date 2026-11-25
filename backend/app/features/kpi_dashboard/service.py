"""KPI and audit export service for HU-09 KPI dashboard.

SECURITY: Farm boundary enforcement
  - VET/DIRECTIVO: farm_id query param validated against user's assigned farms (CRIT-1 fix)
  - OPERARIO: farm_id always forced from JWT claim (ignores query param)
  - SanitaryEvent: filtered by farm_id via cross-join with FieldAnimalRecord (CRIT-2/CRIT-3 partial fix)
  - Audit export: same farm boundaries as KPI
"""

from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.features.auth.models import Farm, User, UserRole
from app.features.kpi_dashboard.models import AnimalWeight
from app.features.sanitary_events.models import SanitaryEvent
from app.features.sinigan_sync.models import FieldAnimalRecord, ReconciliationTicket

ACTIVE_FARM_REQUIRED_MESSAGE = (
    "Se requiere una finca activa para consultar indicadores."
)

CROSS_FARM_FORBIDDEN_MESSAGE = (
    "No tiene acceso a la finca solicitada."
)


def _active_farm_id(current_user: User) -> int:
    farm_id = getattr(current_user, "active_farm_id", None)
    if farm_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=ACTIVE_FARM_REQUIRED_MESSAGE,
        )
    return farm_id


def _validate_farm_access(current_user: User, target_farm_id: int) -> None:
    """Ensure the user is assigned to the target farm (CRIT-1 / HIGH-1 fix).
    
    Reads the user's farm_ids from the DB (not from the JWT claim) to prevent
    stale-token access to farms the user was removed from.
    """
    user_farm_ids = current_user.farm_ids
    if target_farm_id not in user_farm_ids:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=CROSS_FARM_FORBIDDEN_MESSAGE,
        )


def _as_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _iso_utc(value: datetime | None) -> str | None:
    normalized = _as_utc(value)
    if normalized is None:
        return None
    return normalized.isoformat().replace("+00:00", "Z")


def _parse_date(raw: str | None, default: datetime) -> datetime:
    if raw is None:
        return default
    try:
        return datetime.strptime(raw, "%Y-%m-%d").replace(tzinfo=timezone.utc)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Formato de fecha inválido. Use YYYY-MM-DD.",
        )


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _thirty_days_ago() -> datetime:
    return _now_utc() - timedelta(days=30)


def _filter_dins_by_farm(db: Session, farm_id: int) -> set[str]:
    """Return the set of DINs that belong to a given farm.
    
    Used to filter SanitaryEvent by farm boundary since SanitaryEvent does not
    have a farm_id column (CRIT-2/CRIT-3 mitigation). Looks up FieldAnimalRecord
    and AnimalWeight for the farm.
    """
    # Get DINs from field records for this farm
    field_dins = {
        row[0]
        for row in db.query(FieldAnimalRecord.din)
        .filter(FieldAnimalRecord.farm_id == farm_id)
        .all()
    }
    # Get DINs from weight records for this farm
    weight_dins = {
        row[0]
        for row in db.query(AnimalWeight.din)
        .filter(AnimalWeight.farm_id == farm_id)
        .all()
    }
    return field_dins | weight_dins


def _resolve_farm_id(
    current_user: User,
    farm_id: int | None,
) -> int:
    """Resolve which farm_id to use, enforcing RBAC boundaries.
    
    - OPERARIO: always forced to their JWT farm_id (ignores query param)
    - VET/DIRECTIVO/ADMIN: can specify farm_id, but it must be in their assigned farms
    """
    active_farm_id = _active_farm_id(current_user)
    is_operario = current_user.role_value == UserRole.OPERARIO.value

    if is_operario:
        target_farm_id = active_farm_id
    else:
        target_farm_id = farm_id if farm_id is not None else active_farm_id

    # Validate the resolved farm_id against DB assignments (CRIT-1 + HIGH-1 fix)
    _validate_farm_access(current_user, target_farm_id)
    return target_farm_id


class KpiDashboardService:
    """Read-only service for KPI indicators and audit exports."""

    def get_kpi(
        self,
        current_user: User,
        db: Session,
        farm_id: int | None = None,
        start_date: str | None = None,
        end_date: str | None = None,
    ) -> dict:
        target_farm_id = _resolve_farm_id(current_user, farm_id)
        is_operario = current_user.role_value == UserRole.OPERARIO.value

        # Parse date range
        now = _now_utc()
        start = _parse_date(start_date, _thirty_days_ago())
        end = _parse_date(end_date, now)

        # Get farm name
        farm = db.query(Farm).filter(Farm.id == target_farm_id).first()
        farm_name = farm.name if farm is not None else f"Finca #{target_farm_id}"

        # Get DINs belonging to this farm for SanitaryEvent filtering
        farm_dins = _filter_dins_by_farm(db, target_farm_id)

        # ── Validated Vaccination Coverage (CRIT-3 fix: filtered by farm DINs) ──
        total_vaccination = self._count_sanitary_events(
            db, start, end, farm_dins,
            extra_filters=[SanitaryEvent.event_type == "VACCINATION"],
        )
        validated_vaccination = self._count_sanitary_events(
            db, start, end, farm_dins,
            extra_filters=[
                SanitaryEvent.event_type == "VACCINATION",
                SanitaryEvent.validation_status == "VALIDATED",
            ],
        )
        coverage_pct = (
            round(validated_vaccination / total_vaccination * 100, 2)
            if total_vaccination > 0
            else None
        )

        # ── Pending Validation Events (CRIT-3 fix: filtered by farm DINs) ────
        pending_count = self._count_sanitary_events(
            db, start, end, farm_dins,
            extra_filters=[SanitaryEvent.validation_status == "PENDING_VALIDATION"],
        )

        # ── Open Alerts (ReconciliationTicket DOES have farm_id) ───────────────
        open_alerts = (
            db.query(func.count(ReconciliationTicket.id))
            .filter(
                ReconciliationTicket.status == "OPEN",
                ReconciliationTicket.farm_id == target_farm_id,
            )
            .scalar()
            or 0
        )

        # ── Average GDP ────────────────────────────────────────────────────────
        avg_gdp = self._compute_avg_gdp(db, target_farm_id, start, end)

        # ── Build response ─────────────────────────────────────────────────────
        indicators = {
            "validated_vaccination_coverage": coverage_pct,
            "pending_validation_events": pending_count,
            "open_alerts": None if is_operario else open_alerts,
            "average_gdp": None if is_operario else avg_gdp,
        }

        return {
            "farm_id": target_farm_id,
            "farm_name": farm_name,
            "period": {
                "start": _iso_utc(start),
                "end": _iso_utc(end),
            },
            "indicators": indicators,
            "operational_only": is_operario,
            "generated_at": _as_utc(now),
            "generated_by": current_user.email,
        }

    def get_audit_export(
        self,
        current_user: User,
        db: Session,
        farm_id: int | None = None,
        start_date: str | None = None,
        end_date: str | None = None,
    ) -> dict:
        # OPERARIO cannot export audit reports
        if current_user.role_value == UserRole.OPERARIO.value:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Los operarios no pueden exportar reportes de auditoría.",
            )

        # Reuse KPI logic (which now enforces farm boundaries)
        kpi = self.get_kpi(current_user, db, farm_id, start_date, end_date)
        now = kpi["generated_at"]
        start = datetime.fromisoformat(kpi["period"]["start"].replace("Z", "+00:00"))
        end = datetime.fromisoformat(kpi["period"]["end"].replace("Z", "+00:00"))
        target_farm_id = kpi["farm_id"]

        # Get DINs for this farm and filter events (CRIT-2 fix)
        farm_dins = _filter_dins_by_farm(db, target_farm_id)

        events = (
            db.query(SanitaryEvent)
            .filter(
                SanitaryEvent.field_occurred_at >= start,
                SanitaryEvent.field_occurred_at <= end,
                SanitaryEvent.din.in_(farm_dins) if farm_dins else False,
            )
            .order_by(SanitaryEvent.field_occurred_at.desc())
            .all()
        )

        event_items = [
            {
                "din": ev.din,
                "event_type": ev.event_type,
                "validation_status": ev.validation_status,
                "author_email": ev.author_email,
                "occurred_at": _as_utc(ev.field_occurred_at),
            }
            for ev in events
        ]

        return {
            "exported_at": _as_utc(now),
            "exported_by": current_user.email,
            "filters": {
                "farm_id": kpi["farm_id"],
                "start_date": kpi["period"]["start"],
                "end_date": kpi["period"]["end"],
            },
            "kpi_summary": kpi["indicators"],
            "events": event_items,
            "total_events": len(event_items),
        }

    @staticmethod
    def _count_sanitary_events(
        db: Session,
        start: datetime,
        end: datetime,
        farm_dins: set[str],
        extra_filters: list | None = None,
    ) -> int:
        """Count SanitaryEvent filtered by date range and farm DINs.
        
        If no farm_dins are known, the result is 0 (fail-closed: no data
        available for this farm).
        """
        if not farm_dins:
            return 0  # No DINs = no events for this farm (fail-closed)

        query = db.query(func.count(SanitaryEvent.id)).filter(
            SanitaryEvent.field_occurred_at >= start,
            SanitaryEvent.field_occurred_at <= end,
            SanitaryEvent.din.in_(farm_dins),
        )
        if extra_filters:
            query = query.filter(*extra_filters)
        return query.scalar() or 0

    @staticmethod
    def _compute_avg_gdp(
        db: Session, farm_id: int, start: datetime, end: datetime
    ) -> float | None:
        """Compute average GDP (kg/day) across all animals with ≥2 weight records.

        GDP = (last_weight - first_weight) / days_between for each DIN.
        Returns None when no animal has enough records.
        """
        weights = (
            db.query(AnimalWeight)
            .filter(
                AnimalWeight.farm_id == farm_id,
                AnimalWeight.measured_at >= start,
                AnimalWeight.measured_at <= end,
            )
            .order_by(AnimalWeight.din, AnimalWeight.measured_at)
            .all()
        )

        # Group by DIN
        animal_gains: dict[str, list[tuple[datetime, float]]] = {}
        for w in weights:
            animal_gains.setdefault(w.din, []).append(
                (_as_utc(w.measured_at), w.weight_kg)
            )

        gdps = []
        for din, records in animal_gains.items():
            if len(records) < 2:
                continue
            first_dt, first_w = records[0]
            last_dt, last_w = records[-1]
            days = (last_dt - first_dt).total_seconds() / 86400.0
            if days <= 0:
                continue
            # GDP in kg/day (spec: Ganancia Diaria de Peso)
            gdp = (last_w - first_w) / days
            gdps.append(gdp)

        if not gdps:
            return None
        return round(sum(gdps) / len(gdps), 2)