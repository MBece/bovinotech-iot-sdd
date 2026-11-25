"""Contract of CapturedEvent against the shared validation cases (HU-02 R5).

The same JSON file drives the frontend ``eventValidation.js`` tests, so both
sides reject exactly the same events with the same codes.
"""
import json
from datetime import datetime
from pathlib import Path

import pytest

from app.features.offline_capture.schemas import (
    CapturedEvent,
    captured_event_error_codes,
)

CASES_FILE = (
    Path(__file__).resolve().parents[3]
    / "specs"
    / "002-offline-capture"
    / "contracts"
    / "captured-event.cases.json"
)
SHARED = json.loads(CASES_FILE.read_text(encoding="utf-8"))
NOW = datetime.fromisoformat(SHARED["now"].replace("Z", "+00:00"))
CLIENT_ONLY_CODES = {"ANIMAL_NOT_IN_CATALOG", "STORAGE_WRITE_FAILED"}


def build(patch: dict) -> dict:
    return {**SHARED["base"], **patch}


@pytest.mark.parametrize("case", SHARED["cases"], ids=lambda case: case["name"])
def test_shared_case_produces_expected_error_codes(case):
    expected = [code for code in case["errors"] if code not in CLIENT_ONLY_CODES]

    assert captured_event_error_codes(build(case["patch"]), now=NOW) == expected


def test_valid_event_keeps_original_values_and_normalizes_din():
    event = CapturedEvent.model_validate(
        build(
            {
                "eventType": "VACCINATION",
                "din": " din-demo-000001 ",
                "product": "Aftosa bivalente",
                "doseQuantity": 2,
                "doseUnit": "ml",
            }
        ),
        context={"now": NOW},
    )

    assert event.din == "DIN-DEMO-000001"
    assert event.field_occurred_at == datetime.fromisoformat("2026-11-21T13:45:10+00:00")
    assert event.sync_status == "PENDIENTE_SINCRONIZACION"
    assert event.validation_status == "PENDIENTE_VALIDACION"
    assert event.model_dump(by_alias=True, mode="json")["clientEventId"] == SHARED["base"]["clientEventId"]


def test_server_tolerates_five_minutes_of_clock_skew():
    four_minutes_ahead = "2026-11-21T14:04:00Z"
    six_minutes_ahead = "2026-11-21T14:06:00Z"
    checkup = {"eventType": "CHECKUP", "finding": "Sin hallazgos"}

    assert captured_event_error_codes(
        build({**checkup, "fieldOccurredAt": four_minutes_ahead}), now=NOW
    ) == []
    assert captured_event_error_codes(
        build({**checkup, "fieldOccurredAt": six_minutes_ahead}), now=NOW
    ) == ["FUTURE_TIMESTAMP"]


def test_malformed_client_event_id_is_reported():
    codes = captured_event_error_codes(
        build({"eventType": "CHECKUP", "finding": "x", "clientEventId": "not-a-uuid"}),
        now=NOW,
    )

    assert codes == ["INVALID_FIELD"]
