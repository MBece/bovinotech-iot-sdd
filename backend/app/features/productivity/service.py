import json
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path
from uuid import uuid4

from sqlalchemy.orm import Session

from app.features.productivity.models import (
    ProductivityConsumption,
    ProductivityWeighing,
    ProductivityWeighingReview,
)

INSUFFICIENT = "DATOS_INSUFICIENTES"
SUFFICIENT = "SUFFICIENT"


def _utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _value(record, name: str):
    if isinstance(record, dict):
        return record.get(name)
    return getattr(record, name, None)


def _decimal(value) -> Decimal:
    return value if isinstance(value, Decimal) else Decimal(str(value))


def calculate_gdp(initial_weight_kg, final_weight_kg, days_elapsed):
    """Return daily gain only when every required value defines a valid period."""
    if initial_weight_kg is None or final_weight_kg is None or days_elapsed is None:
        return None
    days = _decimal(days_elapsed)
    if days <= 0:
        return None
    return (_decimal(final_weight_kg) - _decimal(initial_weight_kg)) / days


def calculate_feed_efficiency(consumption_kg, weight_gain_kg):
    """Return feed consumed per kg gained, or None when inputs are insufficient."""
    if consumption_kg is None or weight_gain_kg is None:
        return None
    gain = _decimal(weight_gain_kg)
    if gain <= 0:
        return None
    return _decimal(consumption_kg) / gain


def is_atypical_weight(previous_weight_kg, previous_captured_at, weight_kg, captured_at):
    if previous_weight_kg is None or previous_captured_at is None or captured_at is None:
        return False
    elapsed_seconds = (_utc(captured_at) - _utc(previous_captured_at)).total_seconds()
    return (
        elapsed_seconds > 0
        and elapsed_seconds < 24 * 60 * 60
        and abs(float(weight_kg) - float(previous_weight_kg)) > 15
    )


def _review_status(weighing, reviews_by_id):
    if not weighing.is_atypical:
        return "APPROVED"
    reviews = reviews_by_id.get(weighing.id, [])
    if not reviews:
        return "ATIPICO_EN_REVISION"
    latest = max(reviews, key=lambda review: _utc(review.reviewed_at))
    return latest.decision


def calculate_productivity_summary(
    weighings,
    consumptions,
    cohort_dins,
    period_start=None,
    period_end=None,
    reviews=None,
):
    """Pure projection over event data; missing inputs never become numeric zero."""
    reviews_by_id = {}
    for review in reviews or []:
        reviews_by_id.setdefault(_value(review, "weighing_id"), []).append(review)

    corrected_weighing_ids = {
        _value(weighing, "corrected_event_id")
        for weighing in weighings
        if _value(weighing, "corrected_event_id")
    }
    corrected_consumption_ids = {
        _value(item, "corrected_event_id")
        for item in consumptions
        if _value(item, "corrected_event_id")
    }
    approved = [
        weighing
        for weighing in weighings
        if _value(weighing, "id") not in corrected_weighing_ids
        if _review_status(weighing, reviews_by_id) == "APPROVED"
    ]
    missing = []
    individual_rates = []
    total_gain = Decimal("0")
    for din in cohort_dins:
        samples = sorted(
            [
                weighing
                for weighing in approved
                if _value(weighing, "bovine_id") == din
                and (period_start is None or _utc(_value(weighing, "captured_at")) >= _utc(period_start))
                and (period_end is None or _utc(_value(weighing, "captured_at")) <= _utc(period_end))
            ],
            key=lambda weighing: _utc(_value(weighing, "captured_at")),
        )
        if len(samples) < 2:
            missing.append("INITIAL_WEIGHING_MISSING" if not samples else "FINAL_WEIGHING_MISSING")
            continue
        initial, final = samples[0], samples[-1]
        elapsed_seconds = (_utc(_value(final, "captured_at")) - _utc(_value(initial, "captured_at"))).total_seconds()
        days = Decimal(str(elapsed_seconds)) / Decimal("86400")
        rate = calculate_gdp(_value(initial, "weight_kg"), _value(final, "weight_kg"), days)
        if rate is None:
            missing.append("NON_POSITIVE_DAYS")
            continue
        individual_rates.append(rate)
        total_gain += _decimal(_value(final, "weight_kg")) - _decimal(_value(initial, "weight_kg"))

    gdp = (
        sum(individual_rates, Decimal("0")) / Decimal(len(cohort_dins))
        if cohort_dins and len(individual_rates) == len(cohort_dins)
        else None
    )
    if gdp is None and not any(code in missing for code in ("INITIAL_WEIGHING_MISSING", "FINAL_WEIGHING_MISSING")):
        missing.append("WEIGHINGS_INCOMPLETE")

    valid_consumptions = [
        item
        for item in consumptions
        if _value(item, "id") not in corrected_consumption_ids
        if (period_start is None or _utc(_value(item, "period_start")) >= _utc(period_start))
        and (period_end is None or _utc(_value(item, "period_end")) <= _utc(period_end))
    ]
    consumption_total = (
        sum((_decimal(_value(item, "quantity_kg")) for item in valid_consumptions), Decimal("0"))
        if valid_consumptions
        else None
    )
    if consumption_total is None:
        missing.append("CONSUMPTION_MISSING")
    if total_gain <= 0:
        missing.append("NON_POSITIVE_GAIN")
    efficiency = (
        calculate_feed_efficiency(consumption_total, total_gain)
        if consumption_total is not None
        else None
    )
    gdp_status = SUFFICIENT if gdp is not None else INSUFFICIENT
    efficiency_status = SUFFICIENT if efficiency is not None else INSUFFICIENT
    costs_present = bool(valid_consumptions) and all(
        _value(item, "cost_amount") is not None
        and _value(item, "currency_code") is not None
        for item in valid_consumptions
    )
    cost_status = SUFFICIENT if costs_present else INSUFFICIENT
    atypical_pending = sum(
        1 for weighing in weighings
        if weighing.id not in corrected_weighing_ids
        and weighing.is_atypical
        and _review_status(weighing, reviews_by_id) == "ATIPICO_EN_REVISION"
    )
    overall_status = (
        SUFFICIENT
        if gdp_status == SUFFICIENT and efficiency_status == SUFFICIENT and cost_status == SUFFICIENT
        else INSUFFICIENT
    )
    if not costs_present:
        missing.append("COSTS_MISSING")
    return {
        "gdp_kg_per_day": gdp,
        "gdp_status": gdp_status,
        "feed_efficiency_kg_per_kg": efficiency,
        "feed_efficiency_status": efficiency_status,
        "cost_status": cost_status,
        "status": overall_status,
        "missing_data": list(dict.fromkeys(missing)),
        "atypical_pending_count": atypical_pending,
    }


def get_review_status(db: Session, weighing: ProductivityWeighing) -> str:
    if not weighing.is_atypical:
        return "APPROVED"
    reviews = (
        db.query(ProductivityWeighingReview)
        .filter(ProductivityWeighingReview.weighing_id == weighing.id)
        .order_by(ProductivityWeighingReview.reviewed_at.desc())
        .all()
    )
    return reviews[0].decision if reviews else "ATIPICO_EN_REVISION"


def weighing_payload(db: Session, weighing: ProductivityWeighing) -> dict:
    return {
        "id": weighing.id,
        "clientEventId": weighing.client_event_id,
        "loteId": weighing.lote_id,
        "din": weighing.bovine_id,
        "weightKg": weighing.weight_kg,
        "capturedAt": _utc(weighing.captured_at),
        "authorId": weighing.author_id,
        "isAtypical": weighing.is_atypical,
        "reviewStatus": get_review_status(db, weighing),
        "syncStatus": "SYNCED",
        "correctedEventId": weighing.corrected_event_id,
        "correctionReason": weighing.correction_reason,
    }


def consumption_payload(consumption: ProductivityConsumption) -> dict:
    return {
        "id": consumption.id,
        "clientEventId": consumption.client_event_id,
        "loteId": consumption.lote_id,
        "periodStart": _utc(consumption.period_start),
        "periodEnd": _utc(consumption.period_end),
        "quantityKg": consumption.quantity_kg,
        "costAmount": consumption.cost_amount,
        "currencyCode": consumption.currency_code,
        "authorId": consumption.author_id,
        "correctedEventId": consumption.corrected_event_id,
        "correctionReason": consumption.correction_reason,
        "syncStatus": "SYNCED",
    }


def create_weighing(db: Session, payload, farm_id: int, author_id: str, corrected_event_id=None, reason=None):
    existing = (
        db.query(ProductivityWeighing)
        .filter_by(farm_id=farm_id, client_event_id=str(payload.client_event_id))
        .first()
    )
    if existing:
        return existing, True
    previous = (
        db.query(ProductivityWeighing)
        .filter_by(farm_id=farm_id, bovine_id=payload.din)
        .filter(ProductivityWeighing.captured_at < payload.captured_at)
        .order_by(ProductivityWeighing.captured_at.desc())
        .first()
    )
    atypical = bool(previous and is_atypical_weight(
        previous.weight_kg, previous.captured_at, payload.weight_kg, payload.captured_at
    ))
    record = ProductivityWeighing(
        id=str(uuid4()),
        client_event_id=str(payload.client_event_id),
        farm_id=farm_id,
        lote_id=payload.lote_id,
        bovine_id=payload.din,
        weight_kg=payload.weight_kg,
        captured_at=payload.captured_at,
        author_id=author_id,
        is_atypical=atypical,
        corrected_event_id=corrected_event_id,
        correction_reason=reason,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return record, False


def create_consumption(db: Session, payload, farm_id: int, author_id: str, corrected_event_id=None, reason=None):
    existing = (
        db.query(ProductivityConsumption)
        .filter_by(farm_id=farm_id, client_event_id=str(payload.client_event_id))
        .first()
    )
    if existing:
        return existing, True
    record = ProductivityConsumption(
        id=str(uuid4()),
        client_event_id=str(payload.client_event_id),
        farm_id=farm_id,
        lote_id=payload.lote_id,
        period_start=payload.period_start,
        period_end=payload.period_end,
        quantity_kg=payload.quantity_kg,
        cost_amount=payload.cost_amount,
        currency_code=payload.currency_code,
        author_id=author_id,
        corrected_event_id=corrected_event_id,
        correction_reason=reason,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return record, False


def seed_productivity_lots() -> list[dict]:
    path = Path(__file__).parent / "fixtures" / "lots.json"
    with path.open(encoding="utf-8") as fixture_file:
        return json.load(fixture_file)
