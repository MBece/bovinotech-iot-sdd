from datetime import datetime, timedelta, timezone

from app.features.telemetry.models import AlertRuleVersion
from app.features.telemetry.service import _active_rule


def test_active_rule_ignores_future_version(db_session):
    now = datetime.now(timezone.utc)
    current = AlertRuleVersion(
        farm_id=1,
        version=1,
        immobility_threshold=0.1,
        immobility_window_minutes=30,
        max_gap_minutes=15,
        max_accuracy_m=50,
        active_from=now - timedelta(minutes=1),
    )
    future = AlertRuleVersion(
        farm_id=1,
        version=2,
        immobility_threshold=1,
        immobility_window_minutes=60,
        max_gap_minutes=20,
        max_accuracy_m=100,
        active_from=now + timedelta(days=1),
    )
    db_session.add_all([current, future])
    db_session.commit()
    assert _active_rule(db_session, 1).id == current.id
