"""Domain rules of process_batch (HU-03 FR-014, FR-017, FR-017b, FR-018)."""
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace
from uuid import uuid4

import pytest
from sqlalchemy.exc import OperationalError

from app.features.offline_sync.models import OfflineSyncEvent
from app.features.offline_sync.repository import OfflineSyncRepository
from app.features.offline_sync.schemas import SyncBatchRequest
from app.features.offline_sync.service import process_batch

NOW = datetime(2026, 11, 24, 15, 0, tzinfo=timezone.utc)
CASES = {
    item["id"]: item
    for item in json.loads(
        (
            Path(__file__).resolve().parents[3]
            / "specs/003-offline-batch-sync/contracts/sync-batch.cases.json"
        ).read_text(encoding="utf-8")
    )["cases"]
}


def user():
    return SimpleNamespace(
        email="operario@bovinotech.co",
        farm_ids=[1],
        is_active=True,
        disabled_at=None,
        token_iat=NOW - timedelta(minutes=1),
        active_farm_id=1,
    )


def captured(**overrides) -> dict:
    data = {
        "clientEventId": str(uuid4()),
        "eventType": "CHECKUP",
        "din": "DIN-DEMO-000001",
        "fieldOccurredAt": (NOW - timedelta(hours=3)).isoformat(),
        "finding": "Sin hallazgos",
        "authorEmail": "operario@bovinotech.co",
        "farmId": 1,
        "authorVerificationPending": False,
        "validationStatus": "PENDIENTE_VALIDACION",
        "origin": "OFFLINE_CAPTURE",
    }
    data.update(overrides)
    return data


def run(db, items, repository_factory=OfflineSyncRepository):
    return process_batch(
        SyncBatchRequest(items=items), user(), db, now=NOW, repository_factory=repository_factory
    )


def test_future_timestamp_is_kept_and_flagged_for_review(db_session):
    assert CASES["future_timestamp_is_kept"]["expected"][0]["requiresTimestampReview"] is True
    event = captured(fieldOccurredAt=(NOW + timedelta(minutes=10)).isoformat())

    result = run(db_session, [event]).results[0]

    assert result.status == "SINCRONIZADO"
    assert result.requires_timestamp_review is True
    row = db_session.query(OfflineSyncEvent).one()
    assert row.requires_timestamp_review is True


def test_small_clock_skew_is_not_flagged(db_session):
    event = captured(fieldOccurredAt=(NOW + timedelta(minutes=4)).isoformat())

    assert run(db_session, [event]).results[0].requires_timestamp_review is False


def test_invalid_item_does_not_block_the_batch(db_session):
    first, third = captured(), captured()
    missing_product = captured(eventType="VACCINATION", finding=None)

    results = run(db_session, [first, missing_product, third]).results

    assert [result.status for result in results] == ["SINCRONIZADO", "FALLIDO", "SINCRONIZADO"]
    assert results[1].retryable is False
    assert results[1].error_code.value == "VALIDATION_ERROR"
    assert "PRODUCT_REQUIRED" in results[1].detail
    assert db_session.query(OfflineSyncEvent).count() == 2


def test_item_without_readable_id_is_reported_by_index(db_session):
    results = run(db_session, [{"garbage": True}]).results

    assert results[0].index == 0
    assert results[0].client_event_id is None
    assert results[0].error_code.value == "VALIDATION_ERROR"


def test_legacy_event_without_product_is_synced(db_session):
    # FR-019: the preliminary capture had no product nor dose unit, so the
    # FR-015 required-field rules are not applied to LEGACY events. They are
    # stored flagged for a server-side data review instead (QA-01).
    legacy = captured(eventType="VACCINATION", finding=None, origin="LEGACY", doseQuantity=2)

    result = run(db_session, [legacy]).results[0]

    assert result.status == "SINCRONIZADO"
    assert result.requires_data_review is True
    row = db_session.query(OfflineSyncEvent).one()
    assert row.requires_data_review is True


def test_regular_event_does_not_require_data_review(db_session):
    result = run(db_session, [captured()]).results[0]

    assert result.status == "SINCRONIZADO"
    assert result.requires_data_review is False
    assert db_session.query(OfflineSyncEvent).one().requires_data_review is False


def test_legacy_treatment_without_product_dose_or_reason_is_flagged(db_session):
    legacy = captured(eventType="TREATMENT", finding=None, origin="LEGACY")

    result = run(db_session, [legacy]).results[0]

    assert result.status == "SINCRONIZADO"
    assert result.requires_data_review is True


def _assert_rejected(db_session, item, code):
    result = run(db_session, [item]).results[0]
    assert result.status == "FALLIDO"
    assert result.retryable is False
    assert result.error_code.value == "VALIDATION_ERROR"
    assert code in result.detail
    assert db_session.query(OfflineSyncEvent).count() == 0


def test_legacy_negative_dose_is_rejected(db_session):
    legacy = captured(
        eventType="VACCINATION", finding=None, origin="LEGACY", doseQuantity=-5, doseUnit="ml"
    )
    _assert_rejected(db_session, legacy, "DOSE_NOT_POSITIVE")


def test_legacy_zero_dose_is_rejected(db_session):
    legacy = captured(eventType="DEWORMING", finding=None, origin="LEGACY", doseQuantity=0)
    _assert_rejected(db_session, legacy, "DOSE_NOT_POSITIVE")


def test_legacy_unknown_dose_unit_is_rejected(db_session):
    legacy = captured(
        eventType="VACCINATION", finding=None, origin="LEGACY", doseQuantity=2, doseUnit="litros"
    )
    _assert_rejected(db_session, legacy, "DOSE_UNIT_REQUIRED")


def test_legacy_very_long_dose_unit_is_rejected(db_session):
    legacy = captured(
        eventType="VACCINATION", finding=None, origin="LEGACY", doseQuantity=2, doseUnit="x" * 200
    )
    result = run(db_session, [legacy]).results[0]
    assert result.status == "FALLIDO"
    assert result.error_code.value == "VALIDATION_ERROR"
    assert db_session.query(OfflineSyncEvent).count() == 0


def test_very_long_dose_unit_without_dose_is_rejected_for_any_origin(db_session):
    for origin in ("LEGACY", "OFFLINE_CAPTURE"):
        item = captured(origin=origin, doseUnit="x" * 200)
        result = run(db_session, [item]).results[0]
        assert result.status == "FALLIDO", origin
        assert "INVALID_FIELD" in result.detail
    assert db_session.query(OfflineSyncEvent).count() == 0


def test_legacy_notes_too_long_are_rejected(db_session):
    legacy = captured(origin="LEGACY", notes="n" * 501)
    _assert_rejected(db_session, legacy, "NOTES_TOO_LONG")


def test_legacy_long_product_is_rejected(db_session):
    legacy = captured(eventType="VACCINATION", origin="LEGACY", product="p" * 121)
    _assert_rejected(db_session, legacy, "INVALID_FIELD")


NON_FINITE_DOSES = ("NaN", "Infinity", "-Infinity", float("inf"), float("nan"))


@pytest.mark.parametrize("dose", NON_FINITE_DOSES)
@pytest.mark.parametrize("origin", ["OFFLINE_CAPTURE", "LEGACY"])
def test_non_finite_dose_is_rejected(db_session, origin, dose):
    """QA-11: NaN / Infinity must not bypass DOSE_REQUIRED or DOSE_NOT_POSITIVE."""
    item = captured(
        eventType="VACCINATION",
        finding=None,
        product="Aftosa bivalente",
        origin=origin,
        doseQuantity=dose,
        doseUnit="ml",
    )
    _assert_rejected(db_session, item, "INVALID_FIELD")


def test_duplicate_of_a_legacy_event_keeps_the_review_flag(db_session):
    legacy = captured(origin="LEGACY")
    run(db_session, [legacy])

    result = run(db_session, [legacy]).results[0]

    assert result.status == "DUPLICADO"
    assert result.requires_data_review is True


def test_states_and_author_flag_are_kept_as_received(db_session):
    event = captured(authorVerificationPending=True)

    run(db_session, [event])

    row = db_session.query(OfflineSyncEvent).one()
    assert row.validation_status == "PENDIENTE_VALIDACION"
    assert row.author_verification_pending is True
    assert row.author_verification_result == "VERIFIED"
    assert row.received_at is not None


# --- US3: transient failure of single events ---------------------------------


class FlakyRepository(OfflineSyncRepository):
    """Fails to store the given ids, like a locked database would."""

    failing_ids: set[str] = set()

    def insert_event(self, **values):
        if values["client_event_id"] in self.failing_ids:
            raise OperationalError("INSERT", {}, Exception("database is locked"))
        return super().insert_event(**values)


def test_ac4_two_of_ten_transient(db_session):
    spec = CASES["AC4_two_of_ten_transient"]["expected_summary"]
    items = [captured() for _ in range(10)]
    FlakyRepository.failing_ids = {items[3]["clientEventId"], items[8]["clientEventId"]}

    results = run(db_session, items, repository_factory=FlakyRepository).results

    synced = [result for result in results if result.status == "SINCRONIZADO"]
    failed = [result for result in results if result.status == "FALLIDO"]
    assert len(synced) == spec["synced"]
    assert len(failed) == spec["failed_transient"]
    assert all(result.retryable and result.error_code.value == "STORAGE_BUSY" for result in failed)
    assert {str(result.client_event_id) for result in failed} == FlakyRepository.failing_ids
    assert db_session.query(OfflineSyncEvent).count() == 8


# --- Volume (SC-005 baseline) ------------------------------------------------


def test_one_thousand_events_in_twenty_batches(db_session):
    from time import perf_counter

    events = [captured() for _ in range(1000)]
    started = perf_counter()

    statuses = []
    for start in range(0, 1000, 50):
        statuses += [result.status for result in run(db_session, events[start : start + 50]).results]

    elapsed = perf_counter() - started
    assert statuses.count("SINCRONIZADO") == 1000
    assert db_session.query(OfflineSyncEvent).count() == 1000
    assert elapsed < 5, f"took {elapsed:.2f} s"
