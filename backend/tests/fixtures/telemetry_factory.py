2from datetime import datetime, timedelta, timezone

from app.features.telemetry.schemas import BatchIn


def telemetry_batch(batch_id: str, *, activity: float = 0, start: datetime | None = None) -> BatchIn:
    start = start or datetime(2026, 1, 1, tzinfo=timezone.utc)
    return BatchIn(
        batch_id=batch_id,
        readings=[
            {
                "reading_id": f"{batch_id}-{index}",
                "captured_at": start + timedelta(minutes=15 * index),
                "activity": activity,
                "latitude": 6.22,
                "longitude": -75.58,
                "accuracy_m": 5,
            }
            for index in range(3)
        ],
    )
