from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from app.features.telemetry.rules import geofence_result, immobility_result, point_in_polygon


def reading(minutes, activity=0, lat=6.22, lon=-75.58, accuracy=5):
    return SimpleNamespace(
        captured_at=datetime(2026, 1, 1, tzinfo=timezone.utc) + timedelta(minutes=minutes),
        activity=activity,
        latitude=lat,
        longitude=lon,
        accuracy_m=accuracy,
    )


def test_immobility_requires_complete_window_without_gaps():
    assert immobility_result([reading(0), reading(15), reading(30)], 0.1, 30, 15) == "ALERT_TRIGGERED"
    assert immobility_result([reading(0), reading(30)], 0.1, 30, 15) == "INSUFFICIENT_DATA"
    assert immobility_result([reading(0), reading(15, activity=1), reading(30)], 0.1, 30, 15) == "NORMAL"


def test_geofence_detects_only_precise_inside_to_outside_transition():
    polygon = [[6.20, -75.60], [6.20, -75.55], [6.25, -75.55], [6.25, -75.60]]
    assert point_in_polygon(6.20, -75.60, polygon) is True
    assert geofence_result(reading(0), reading(5, lat=6.30), polygon, 50) == "ALERT_TRIGGERED"
    assert geofence_result(reading(0), reading(5, lat=6.30, accuracy=100), polygon, 50) == "INSUFFICIENT_DATA"

