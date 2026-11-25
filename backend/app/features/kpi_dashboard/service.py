"""KPI and audit export service for HU-09 KPI dashboard."""

from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.features.auth.models import Farm, User, UserRole
from app.features.kpi_dashboard.models import AnimalWeight
from app.features.sanitary_events.models import SanitaryEvent
from app.features.sinigan_sync.models import ReconciliationTicket

ACTIVE_FARM_REQUIRED_MESSAGE = (
    "Se requiere una finca activa para consultar indicadores."
)


def _active_farm_id(current_user: User) -> int:
    farm_id = getattr(current_user, "active_farm_id", None)
    if farm_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=ACTIVE_FARM_REQUIRED_MESSAGE,
        )
    return farm_id


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
            detail=f"Formato de fecha inválido: '{raw}'. Use YYYY-MM-DD.",
        )


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _thirty_days_ago() -> datetime:
    now = _now_utc()
    return now.replace(day=1) if now.day > 30 else now - type(now)(days=30, hours=0, minutes=0, seconds=0)


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
        active_farm_id = _active_farm_id(current_user)

        # Determine target farm_id based on role
        is_operario = current_user.role_value == UserRole.OPERARIO.value
        if is_operario:
            target_farm_id = active_farm_id
        else:
            target_farm_id = farm_id if farm_id is not None else active_farm_id

        # Parse date range
        now = _now_utc()
        start = _parse_date(start_date, _thirty_days_ago())
        end = _parse_date(end_date, now)

        # Get farm name
        farm = db.query(Farm).filter(Farm.id == target_farm_id).first()
        farm_name = farm.name if farm is not None else f"Finca #{target_farm_id}"

        # ── Validated Vaccination Coverage ──────────────────────────────────
        # NOTE: SanitaryEvent has no farm_id column (known limitation).
        # We filter by event_type and date only, without farm boundary.
        total_vaccination = (
            db.query(func.count(SanitaryEvent.id))
            .filter(
                SanitaryEvent.event_type == "VACCINATION",
                SanitaryEvent.field_occurred_at >= start,
                SanitaryEvent.field_occurred_at <= end,
            )
            .scalar()
            or 0
        )
        validated_vaccination = (
            db.query(func.count(SanitaryEvent.id))
            .filter(
                SanitaryEvent.event_type == "VACCINATION",
                SanitaryEvent.validation_status == "VALIDATED",
                SanitaryEvent.field_occurred_at >= start,
                SanitaryEvent.field_occurred_at <= end,
            )
            .scalar()
            or 0
        )
        coverage_pct = (
            round(validated_vaccination / total_vaccination * 100, 2)
            if total_vaccination > 0
            else None
        )

        # ── Pending Validation Events ──────────────────────────────────────
        # Same limitation: no farm_id filter on SanitaryEvent.
        pending_count = (
            db.query(func.count(SanitaryEvent.id))
            .filter(
                SanitaryEvent.validation_status == "PENDING_VALIDATION",
                SanitaryEvent.field_occurred_at >= start,
                SanitaryEvent.field_occurred_at <= end,
            )
            .scalar()
            or 0
        )

        # ── Open Alerts (ReconciliationTicket DOES have farm_id) ───────────
        open_alerts = (
            db.query(func.count(ReconciliationTicket.id))
            .filter(
                ReconciliationTicket.status == "OPEN",
                ReconciliationTicket.farm_id == target_farm_id,
            )
            .scalar()
            or 0
        )

        # ── Average GDP ────────────────────────────────────────────────────
        # AnimalWeight has farm_id, so we filter by it.
        avg_gdp = self._compute_avg_gdp(db, target_farm_id, start, end)

        # ── Build response ─────────────────────────────────────────────────
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

        # Reuse KPI logic
        kpi = self.get_kpi(current_user, db, farm_id, start_date, end_date)
        now = kpi["generated_at"]
        start = datetime.fromisoformat(kpi["period"]["start"].replace("Z", "+00:00"))
        end = datetime.fromisoformat(kpi["period"]["end"].replace("Z", "+00:00"))

        # Get all SanitaryEvent in the period (no farm_id filter — known limitation)
        events = (
            db.query(SanitaryEvent)
            .filter(
                SanitaryEvent.field_occurred_at >= start,
                SanitaryEvent.field_occurred_at <= end,
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
    def _compute_avg_gdp(
        db: Session, farm_id: int, start: datetime, end: datetime
    ) -> float | None:
        """Compute average GDP (grams per day) across all animals with ≥2 weight records.

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