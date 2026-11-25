from dataclasses import dataclass
from datetime import datetime, timedelta, timezone


def _utc_naive(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value
    return value.astimezone(timezone.utc).replace(tzinfo=None)


def point_in_polygon(latitude: float, longitude: float, polygon: list[list[float]]) -> bool:
    """Ray casting; a point on an edge is treated as inside."""
    x, y = longitude, latitude
    inside = False
    for i, current in enumerate(polygon):
        previous = polygon[i - 1]
        y1, x1 = previous
        y2, x2 = current
        cross = (x - x1) * (y2 - y1) - (y - y1) * (x2 - x1)
        if abs(cross) < 1e-10 and min(x1, x2) <= x <= max(x1, x2) and min(y1, y2) <= y <= max(y1, y2):
            return True
        if (y1 > y) != (y2 > y):
            intersection = (x2 - x1) * (y - y1) / (y2 - y1) + x1
            if x < intersection:
                inside = not inside
    return inside


def immobility_result(readings, threshold: float, window_minutes: int, max_gap_minutes: int) -> str:
    ordered = sorted(readings, key=lambda item: _utc_naive(item.captured_at))
    if len(ordered) < 2:
        return "INSUFFICIENT_DATA"
    if _utc_naive(ordered[-1].captured_at) - _utc_naive(ordered[0].captured_at) < timedelta(minutes=window_minutes):
        return "INSUFFICIENT_DATA"
    if any(
        _utc_naive(right.captured_at) - _utc_naive(left.captured_at) > timedelta(minutes=max_gap_minutes)
        for left, right in zip(ordered, ordered[1:])
    ):
        return "INSUFFICIENT_DATA"
    return "ALERT_TRIGGERED" if all(item.activity <= threshold for item in ordered) else "NORMAL"


def geofence_result(previous, current, polygon: list[list[float]], max_accuracy_m: float) -> str:
    values = (previous.latitude, previous.longitude, current.latitude, current.longitude)
    if any(value is None for value in values):
        return "INSUFFICIENT_DATA"
    if previous.accuracy_m is None or current.accuracy_m is None:
        return "INSUFFICIENT_DATA"
    if previous.accuracy_m > max_accuracy_m or current.accuracy_m > max_accuracy_m:
        return "INSUFFICIENT_DATA"
    was_inside = point_in_polygon(previous.latitude, previous.longitude, polygon)
    is_inside = point_in_polygon(current.latitude, current.longitude, polygon)
    return "ALERT_TRIGGERED" if was_inside and not is_inside else "NORMAL"

