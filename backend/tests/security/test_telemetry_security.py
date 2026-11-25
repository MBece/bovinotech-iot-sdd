from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.features.auth.models import UserRole
from app.features.telemetry.dependencies import (
    credential_hash,
    get_current_device,
    require_admin,
    require_alert_writer,
)
from app.features.telemetry.models import AlertClosure, TelemetryAlert, TelemetryDevice
from app.features.telemetry.schemas import AlertClose
from app.features.telemetry.router import close_alert
from app.features.telemetry.service import list_alerts


def test_device_secret_is_compared_and_revoked_device_is_rejected(db_session):
    device = TelemetryDevice(
        id="secure-device",
        credential_hash=credential_hash("high-entropy-test-token"),
        farm_id=1,
        bovine_id="BOV-1",
    )
    db_session.add(device)
    db_session.commit()
    assert get_current_device("secure-device", "high-entropy-test-token", db_session).id == device.id
    with pytest.raises(HTTPException) as invalid:
        get_current_device("secure-device", "wrong-token", db_session)
    assert invalid.value.status_code == 401
    device.is_active = False
    db_session.commit()
    with pytest.raises(HTTPException) as revoked:
        get_current_device("secure-device", "high-entropy-test-token", db_session)
    assert revoked.value.status_code == 401


def test_rbac_rejects_privilege_escalation():
    administrator = SimpleNamespace(role_value=UserRole.ADMINISTRADOR.value, active_farm_id=1)
    operator = SimpleNamespace(role_value=UserRole.OPERARIO.value, active_farm_id=1)
    director = SimpleNamespace(role_value=UserRole.DIRECTIVO.value, active_farm_id=1)
    assert require_admin(administrator) is administrator
    assert require_alert_writer(operator) is operator
    with pytest.raises(HTTPException):
        require_admin(operator)
    with pytest.raises(HTTPException):
        require_alert_writer(director)


def test_alert_queries_and_closure_do_not_cross_farms(db_session):
    farm_one = TelemetryAlert(
        farm_id=1,
        bovine_id="BOV-1",
        alert_type="IMMOBILITY",
        condition_key="farm-1",
        rule_version_id=1,
        first_reading_id="r1",
        latest_reading_id="r1",
    )
    farm_two = TelemetryAlert(
        farm_id=2,
        bovine_id="BOV-2",
        alert_type="IMMOBILITY",
        condition_key="farm-2",
        rule_version_id=2,
        first_reading_id="r2",
        latest_reading_id="r2",
    )
    db_session.add_all([farm_one, farm_two])
    db_session.commit()
    assert [row.bovine_id for row in list_alerts(db_session, 1)] == ["BOV-1"]
    user = SimpleNamespace(id=10, active_farm_id=1)
    with pytest.raises(HTTPException) as hidden:
        close_alert(farm_two.id, AlertClose(observation="Revisión realizada"), user, db_session)
    assert hidden.value.status_code == 404
    closed = close_alert(
        farm_one.id,
        AlertClose(observation="Animal revisado en el potrero"),
        user,
        db_session,
    )
    assert closed["status"] == "CLOSED"
    evidence = db_session.query(AlertClosure).filter_by(alert_id=farm_one.id).one()
    assert evidence.closed_by_id == user.id
    assert evidence.observation == "Animal revisado en el potrero"
