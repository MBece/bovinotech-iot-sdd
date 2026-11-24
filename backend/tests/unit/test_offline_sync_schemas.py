"""Contracts of POST /offline-sync/batches (contracts/offline-sync-api.md §1)."""
from datetime import datetime, timezone
from uuid import UUID

import pytest
from pydantic import ValidationError

from app.features.offline_sync.schemas import (
    ERROR_MESSAGES,
    ErrorCode,
    SyncBatchRequest,
    SyncBatchResponse,
    SyncItemResult,
)


def test_items_are_accepted_as_raw_objects_without_validating_their_shape():
    request = SyncBatchRequest.model_validate({"items": [{"anything": 1}, {}]})

    assert request.items == [{"anything": 1}, {}]


@pytest.mark.parametrize("size", [0, 51])
def test_batch_size_must_be_between_1_and_50(size):
    with pytest.raises(ValidationError):
        SyncBatchRequest.model_validate({"items": [{}] * size})


def test_batch_of_50_is_accepted():
    assert len(SyncBatchRequest.model_validate({"items": [{}] * 50}).items) == 50


def test_response_is_serialized_in_camel_case():
    result = SyncItemResult(
        index=0,
        client_event_id=UUID("7f9c2a5e-0b8d-4d7e-9a51-2f3e4c5d6e7f"),
        status="FALLIDO",
        retryable=True,
        error_code=ErrorCode.STORAGE_BUSY,
        detail=ERROR_MESSAGES[ErrorCode.STORAGE_BUSY],
    )
    response = SyncBatchResponse(
        batch_id=7,
        server_time=datetime(2026, 11, 24, tzinfo=timezone.utc),
        results=[result],
    )

    body = response.model_dump(by_alias=True, mode="json")

    assert set(body) == {"batchId", "serverTime", "results"}
    assert body["results"][0] == {
        "index": 0,
        "clientEventId": "7f9c2a5e-0b8d-4d7e-9a51-2f3e4c5d6e7f",
        "status": "FALLIDO",
        "retryable": True,
        "errorCode": "STORAGE_BUSY",
        "detail": "El servidor no pudo registrar el evento. Se reintentará.",
        "receivedAt": None,
        "requiresTimestampReview": False,
        "requiresDataReview": False,
    }


def test_status_is_limited_to_the_three_business_values():
    with pytest.raises(ValidationError):
        SyncItemResult(index=0, status="CREADO")


def test_every_error_code_has_a_spanish_message():
    assert {code for code in ErrorCode} == set(ERROR_MESSAGES)
