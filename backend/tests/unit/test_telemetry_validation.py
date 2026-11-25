from datetime import datetime, timedelta, timezone

from app.features.telemetry.schemas import BatchIn
from app.features.telemetry.service import canonical_hash, reading_validation_error


def reading(**overrides):
    data = {
        "reading_id": "reading-1",
        "captured_at": datetime(2026, 1, 1, tzinfo=timezone.utc),
        "activity": 1,
        "latitude": 6.22,
        "longitude": -75.58,
        "accuracy_m": 5,
    }
    data.update(overrides)
    return BatchIn(batch_id="batch-1", readings=[data]).readings[0]


def test_invalid_sensor_values_are_diagnosed_per_reading():
    assert "Actividad" in reading_validation_error(reading(activity=101))
    assert "juntas" in reading_validation_error(reading(longitude=None))
    assert "Latitud" in reading_validation_error(reading(latitude=91))
    assert "Longitud" in reading_validation_error(reading(longitude=-181))
    assert "Precisión" in reading_validation_error(reading(accuracy_m=0))
    assert "Actividad" in reading_validation_error(reading(activity=float("nan")))
    assert "futuro" in reading_validation_error(
        reading(captured_at=datetime.now(timezone.utc) + timedelta(hours=1))
    )


def test_canonical_hash_is_stable_and_content_sensitive():
    first = BatchIn(batch_id="batch-1", readings=[reading().model_dump()])
    same = BatchIn.model_validate(first.model_dump())
    changed = BatchIn(batch_id="batch-1", readings=[reading(activity=2).model_dump()])
    assert canonical_hash(first) == canonical_hash(same)
    assert canonical_hash(first) != canonical_hash(changed)
