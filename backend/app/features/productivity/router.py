from datetime import datetime, timezone
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.features.auth.dependencies import get_current_user
from app.features.auth.models import User
from app.features.productivity.models import (
    ProductivityConsumption,
    ProductivityWeighing,
    ProductivityWeighingReview,
)
from app.features.productivity.schemas import (
    ConsumptionCorrection,
    ConsumptionCreate,
    ConsumptionList,
    ConsumptionRead,
    ProductivitySummaryRead,
    ReviewCreate,
    ReviewRead,
    WeighingCorrection,
    WeighingCreate,
    WeighingList,
    WeighingRead,
)
from app.features.productivity.service import (
    calculate_productivity_summary,
    consumption_payload,
    create_consumption,
    create_weighing,
    get_review_status,
    seed_productivity_lots,
    weighing_payload,
)

router = APIRouter()

CAPTURE_ROLES = {"OPERARIO", "ADMINISTRADOR"}
READ_ROLES = {"OPERARIO", "ADMINISTRADOR", "VETERINARIO", "DIRECTIVO"}
REVIEW_ROLES = {"VETERINARIO", "ADMINISTRADOR"}


def _context(user: User, roles: set[str]) -> tuple[int, str]:
    if user.role_value not in roles:
        raise HTTPException(status_code=403, detail="Rol sin permiso para esta operación.")
    farm_id = getattr(user, "active_farm_id", None)
    if farm_id is None:
        raise HTTPException(status_code=403, detail="La sesión no tiene una finca activa.")
    return int(farm_id), str(user.id)


def _not_found():
    raise HTTPException(status_code=404, detail="Registro no encontrado.")


def _aware_range(start: datetime | None, end: datetime | None):
    for value in (start, end):
        if value is not None and (value.tzinfo is None or value.utcoffset() is None):
            raise HTTPException(status_code=422, detail="Las fechas deben incluir zona horaria.")
    if start is not None and end is not None and start >= end:
        raise HTTPException(status_code=422, detail="fecha_inicio debe ser anterior a fecha_fin.")


@router.post("/pesajes", response_model=WeighingRead, response_model_by_alias=True, status_code=201)
def post_weighing(
    payload: WeighingCreate,
    response: Response,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    farm_id, author_id = _context(user, CAPTURE_ROLES)
    record, duplicate = create_weighing(db, payload, farm_id, author_id)
    if duplicate:
        response.status_code = status.HTTP_200_OK
    return weighing_payload(db, record) | {"syncStatus": "DUPLICADO" if duplicate else "SYNCED"}


@router.get("/pesajes", response_model=WeighingList, response_model_by_alias=True)
def list_weighings(
    lote_id: str | None = Query(default=None, min_length=1, max_length=64),
    din: str | None = Query(default=None, min_length=1, max_length=32),
    fecha_inicio: datetime | None = None,
    fecha_fin: datetime | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    farm_id, _ = _context(user, READ_ROLES)
    _aware_range(fecha_inicio, fecha_fin)
    query = db.query(ProductivityWeighing).filter_by(farm_id=farm_id)
    if lote_id:
        query = query.filter(ProductivityWeighing.lote_id == lote_id)
    if din:
        query = query.filter(ProductivityWeighing.bovine_id == din.upper())
    if fecha_inicio:
        query = query.filter(ProductivityWeighing.captured_at >= fecha_inicio.astimezone(timezone.utc))
    if fecha_fin:
        query = query.filter(ProductivityWeighing.captured_at <= fecha_fin.astimezone(timezone.utc))
    items = query.order_by(ProductivityWeighing.captured_at.asc()).all()
    return {"items": [weighing_payload(db, item) for item in items], "nextCursor": None}


@router.post(
    "/pesajes/{pesaje_id}/correcciones",
    response_model=WeighingRead,
    response_model_by_alias=True,
    status_code=201,
)
def correct_weighing(
    pesaje_id: UUID,
    payload: WeighingCorrection,
    response: Response,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    farm_id, author_id = _context(user, CAPTURE_ROLES)
    original = db.query(ProductivityWeighing).filter_by(id=str(pesaje_id), farm_id=farm_id).first()
    if original is None:
        _not_found()
    record, duplicate = create_weighing(
        db, payload, farm_id, author_id, corrected_event_id=original.id, reason=payload.reason
    )
    if duplicate:
        response.status_code = status.HTTP_200_OK
    result = weighing_payload(db, record)
    result["syncStatus"] = "DUPLICADO" if duplicate else "SYNCED"
    return result


@router.post("/consumos", response_model=ConsumptionRead, response_model_by_alias=True, status_code=201)
def post_consumption(
    payload: ConsumptionCreate,
    response: Response,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    farm_id, author_id = _context(user, CAPTURE_ROLES)
    record, duplicate = create_consumption(db, payload, farm_id, author_id)
    if duplicate:
        response.status_code = status.HTTP_200_OK
    result = consumption_payload(record)
    result["syncStatus"] = "DUPLICADO" if duplicate else "SYNCED"
    return result


@router.get("/consumos", response_model=ConsumptionList, response_model_by_alias=True)
def list_consumptions(
    lote_id: str | None = Query(default=None, min_length=1, max_length=64),
    fecha_inicio: datetime | None = None,
    fecha_fin: datetime | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    farm_id, _ = _context(user, READ_ROLES)
    _aware_range(fecha_inicio, fecha_fin)
    query = db.query(ProductivityConsumption).filter_by(farm_id=farm_id)
    if lote_id:
        query = query.filter(ProductivityConsumption.lote_id == lote_id)
    if fecha_inicio:
        query = query.filter(ProductivityConsumption.period_start >= fecha_inicio.astimezone(timezone.utc))
    if fecha_fin:
        query = query.filter(ProductivityConsumption.period_end <= fecha_fin.astimezone(timezone.utc))
    items = query.order_by(ProductivityConsumption.period_start.asc()).all()
    return {"items": [consumption_payload(item) for item in items], "nextCursor": None}


@router.post(
    "/consumos/{consumo_id}/correcciones",
    response_model=ConsumptionRead,
    response_model_by_alias=True,
    status_code=201,
)
def correct_consumption(
    consumo_id: UUID,
    payload: ConsumptionCorrection,
    response: Response,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    farm_id, author_id = _context(user, CAPTURE_ROLES)
    original = db.query(ProductivityConsumption).filter_by(id=str(consumo_id), farm_id=farm_id).first()
    if original is None:
        _not_found()
    record, duplicate = create_consumption(
        db, payload, farm_id, author_id, corrected_event_id=original.id, reason=payload.reason
    )
    if duplicate:
        response.status_code = status.HTTP_200_OK
    result = consumption_payload(record)
    result["syncStatus"] = "DUPLICADO" if duplicate else "SYNCED"
    return result


@router.get("/lotes/{lote_id}/gdp", response_model=ProductivitySummaryRead, response_model_by_alias=True)
def get_lot_productivity(
    lote_id: str,
    fecha_inicio: datetime,
    fecha_fin: datetime,
    dins: list[str] | None = Query(default=None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    farm_id, _ = _context(user, READ_ROLES - {"OPERARIO"})
    _aware_range(fecha_inicio, fecha_fin)
    if fecha_inicio.tzinfo is None or fecha_fin.tzinfo is None:
        raise HTTPException(status_code=422, detail="Las fechas deben incluir zona horaria.")
    start = fecha_inicio.astimezone(timezone.utc)
    end = fecha_fin.astimezone(timezone.utc)
    cohort = sorted({value.strip().upper() for value in (dins or []) if value.strip()})
    weighings = (
        db.query(ProductivityWeighing)
        .filter_by(farm_id=farm_id, lote_id=lote_id)
        .all()
    )
    if not cohort:
        cohort = sorted({weighing.bovine_id for weighing in weighings})
    if not cohort:
        cohort = next(
            (
                [din.upper() for din in lot["animal_dins"]]
                for lot in seed_productivity_lots()
                if lot["farm_id"] == farm_id and lot["lote_id"] == lote_id
            ),
            [],
        )
    consumptions = (
        db.query(ProductivityConsumption)
        .filter_by(farm_id=farm_id, lote_id=lote_id)
        .all()
    )
    reviews = (
        db.query(ProductivityWeighingReview)
        .filter_by(farm_id=farm_id)
        .all()
    )
    projection = calculate_productivity_summary(
        weighings, consumptions, cohort, start, end, reviews
    )
    return {
        "lote_id": lote_id,
        "period_start": start,
        "period_end": end,
        **projection,
    }


@router.post(
    "/pesajes/{pesaje_id}/revision",
    response_model=ReviewRead,
    response_model_by_alias=True,
    status_code=201,
)
def review_weighing(
    pesaje_id: UUID,
    payload: ReviewCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    farm_id, reviewer_id = _context(user, REVIEW_ROLES)
    weighing = db.query(ProductivityWeighing).filter_by(id=str(pesaje_id), farm_id=farm_id).first()
    if weighing is None:
        _not_found()
    if not weighing.is_atypical:
        raise HTTPException(status_code=422, detail="Solo se revisan pesajes atípicos.")
    review = ProductivityWeighingReview(
        id=str(uuid4()),
        weighing_id=weighing.id,
        farm_id=farm_id,
        decision=payload.decision,
        reason=payload.reason.strip(),
        reviewer_id=reviewer_id,
        reviewed_at=datetime.now(timezone.utc),
    )
    db.add(review)
    db.commit()
    db.refresh(review)
    return {
        "id": review.id,
        "weighing_id": review.weighing_id,
        "decision": review.decision,
        "reason": review.reason,
        "reviewer_id": review.reviewer_id,
        "reviewed_at": review.reviewed_at,
        "review_status": get_review_status(db, weighing),
    }
