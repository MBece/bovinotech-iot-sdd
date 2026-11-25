from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.features.sanitary_events.schemas import SyncEventItem


def base_payload(event_type: str) -> dict:
    return {
        "clientEventId": uuid4(),
        "din": "din-demo-000001",
        "eventType": event_type,
        "fieldOccurredAt": datetime.now(timezone.utc),
    }


def test_deworming_contract_accepts_product_dose_and_unit():
    item = SyncEventItem(
        **base_payload("DEWORMING"),
        product="Ivermectina simulada",
        dose=5,
        doseUnit="ml",
    )

    assert item.event_type == "DEWORMING"
    assert item.din == "DIN-DEMO-000001"


@pytest.mark.parametrize(
    ("event_type", "extra"),
    [
        ("VACCINATION", {"dose": 2, "doseUnit": "ml"}),
        ("TREATMENT", {"product": "Producto", "dose": 2, "doseUnit": "ml"}),
        ("CHECKUP", {}),
    ],
)
def test_contract_rejects_missing_event_specific_fields(event_type, extra):
    with pytest.raises(ValidationError):
        SyncEventItem(**base_payload(event_type), **extra)


def test_contract_rejects_future_capture_time():
    with pytest.raises(ValidationError):
        SyncEventItem(
            **{
                **base_payload("CHECKUP"),
                "fieldOccurredAt": datetime.now(timezone.utc) + timedelta(hours=1),
            },
            finding="Sin hallazgos",
        )
