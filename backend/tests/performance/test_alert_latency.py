from datetime import datetime, timedelta, timezone
from time import perf_counter

from app.features.telemetry.dependencies import credential_hash
from app.features.telemetry.models import AlertRuleVersion, GeofenceVersion, TelemetryDevice
from app.features.telemetry.schemas import BatchIn
from app.features.telemetry.service import ingest_batch


def test_synthetic_alert_processing_p95_is_below_ten_seconds(db_session):
    device = TelemetryDevice(
        id="performance-device",
        credential_hash=credential_hash("test-only-token"),
        farm_id=1,
        bovine_id="BOV-PERF",
    )
    db_session.add_all([
        device,
        AlertRuleVersion(
            farm_id=1,
            version=1,
            immobility_threshold=0.1,
            immobility_window_minutes=30,
            max_gap_minutes=15,
            max_accuracy_m=50,
        ),
        GeofenceVersion(
            farm_id=1,
            version=1,
            name="Rendimiento",
            polygon_json='[[6.2,-75.6],[6.2,-75.55],[6.25,-75.55],[6.25,-75.6]]',
        ),
    ])
    db_session.commit()
    durations = []
    start = datetime(2026, 1, 1, tzinfo=timezone.utc)
    for batch_number in range(20):
        captured = start + timedelta(hours=batch_number)
        payload = BatchIn(
            batch_id=f"perf-{batch_number}",
            readings=[
                {
                    "reading_id": f"perf-{batch_number}-{sample}",
                    "captured_at": captured + timedelta(minutes=15 * sample),
                    "activity": 0,
                    "latitude": 6.22,
                    "longitude": -75.58,
                    "accuracy_m": 5,
                }
                for sample in range(3)
            ],
        )
        before = perf_counter()
        ingest_batch(db_session, device, payload)
        durations.append(perf_counter() - before)
    durations.sort()
    p95 = durations[max(0, int(len(durations) * 0.95) - 1)]
    assert p95 < 10
