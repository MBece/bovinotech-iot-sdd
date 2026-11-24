"""Idempotent processing of a sync batch (HU-03).

Per event: validate (HU-02 CapturedEvent) → authorize → detect duplicates →
insert in its own savepoint. One result per event, in request order.
"""
from collections import Counter
from datetime import datetime, timezone
from time import perf_counter
from typing import Any, Callable
from uuid import UUID

from pydantic import ValidationError
from sqlalchemy.exc import IntegrityError, OperationalError
from sqlalchemy.orm import Session

from app.features.auth.sync_support import record_sync_rejection
from app.features.offline_capture.schemas import (
    SERVER_FUTURE_TOLERANCE,
    CapturedEvent,
    error_codes_from,
)
from app.features.offline_sync.authorization import (
    author_verification_result,
    authorize_event,
)
from app.features.offline_sync.hashing import canonical_payload_hash
from app.features.offline_sync.repository import OfflineSyncRepository
from app.features.offline_sync.schemas import (
    DUPLICATE_DETAIL,
    ERROR_MESSAGES,
    RETRYABLE_CODES,
    ErrorCode,
    SyncBatchRequest,
    SyncBatchResponse,
    SyncItemResult,
)


INITIAL_VALIDATION_STATUS = "PENDIENTE_VALIDACION"


def _utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _readable_id(item: dict[str, Any]) -> UUID | None:
    try:
        return UUID(str(item.get("clientEventId")))
    except (TypeError, ValueError, AttributeError):
        return None


def _failed(index: int, client_event_id: UUID | None, code: ErrorCode, detail: str | None = None):
    return SyncItemResult(
        index=index,
        client_event_id=client_event_id,
        status="FALLIDO",
        retryable=code in RETRYABLE_CODES,
        error_code=code,
        detail=detail or ERROR_MESSAGES[code],
    )


class _BatchProcessor:
    def __init__(self, user, repository: OfflineSyncRepository, now: datetime, batch_log_id: int):
        self.user = user
        self.repository = repository
        self.now = now
        self.batch_log_id = batch_log_id
        self.rejected_after_disable: list[str] = []

    def process(self, index: int, item: dict[str, Any]) -> SyncItemResult:
        client_event_id = _readable_id(item)
        try:
            event = CapturedEvent.model_validate(
                item, context={"now": self.now, "allow_future_timestamp": True}
            )
        except ValidationError as exc:
            fields = ", ".join(error_codes_from(exc))
            return _failed(
                index,
                client_event_id,
                ErrorCode.VALIDATION_ERROR,
                ERROR_MESSAGES[ErrorCode.VALIDATION_ERROR].format(fields=fields),
            )

        client_event_id = event.client_event_id
        rejection = authorize_event(self.user, event)
        if rejection is not None:
            if rejection == ErrorCode.AUTHOR_DISABLED:
                self.rejected_after_disable.append(str(client_event_id))
            return _failed(index, client_event_id, rejection)

        preliminary = self.repository.find_preliminary(str(client_event_id))
        if preliminary is not None:
            return self._duplicate(index, client_event_id, preliminary.received_at, False)

        payload_hash = canonical_payload_hash(event)
        review = event.field_occurred_at > self.now + SERVER_FUTURE_TOLERANCE
        try:
            row = self.repository.insert_event(
                client_event_id=str(client_event_id),
                payload_hash=payload_hash,
                event_type=event.event_type,
                din=event.din,
                field_occurred_at=event.field_occurred_at,
                received_at=self.now,
                product=event.product,
                dose_quantity=event.dose_quantity,
                dose_unit=event.dose_unit,
                reason=event.reason,
                finding=event.finding,
                notes=event.notes,
                author_email=event.author_email,
                farm_id=event.farm_id,
                origin=event.origin,
                # Workflow state is never taken from the client: validation
                # transitions belong to HU-04 (FR-018).
                validation_status=INITIAL_VALIDATION_STATUS,
                author_verification_pending=event.author_verification_pending,
                author_verification_result=author_verification_result(self.user, event),
                requires_timestamp_review=review,
                batch_log_id=self.batch_log_id,
            )
        except IntegrityError:
            return self._resolve_existing(index, event, payload_hash, item)
        except OperationalError:
            return _failed(index, client_event_id, ErrorCode.STORAGE_BUSY)

        return SyncItemResult(
            index=index,
            client_event_id=client_event_id,
            status="SINCRONIZADO",
            received_at=_utc(row.received_at),
            requires_timestamp_review=review,
        )

    def _resolve_existing(self, index, event: CapturedEvent, payload_hash: str, item):
        existing = self.repository.find_by_client_event_id(str(event.client_event_id))
        if existing is None:  # the competing insert was rolled back: retry later
            return _failed(index, event.client_event_id, ErrorCode.STORAGE_BUSY)
        if existing.payload_hash == payload_hash:
            return self._duplicate(
                index,
                event.client_event_id,
                existing.received_at,
                existing.requires_timestamp_review,
            )
        self.repository.add_conflict(existing, payload_hash, item, self.user.email, self.now)
        return _failed(index, event.client_event_id, ErrorCode.CLIENT_EVENT_ID_CONFLICT)

    @staticmethod
    def _duplicate(index, client_event_id, received_at, review) -> SyncItemResult:
        return SyncItemResult(
            index=index,
            client_event_id=client_event_id,
            status="DUPLICADO",
            detail=DUPLICATE_DETAIL,
            received_at=_utc(received_at),
            requires_timestamp_review=bool(review),
        )


def process_batch(
    request: SyncBatchRequest,
    user,
    db: Session,
    now: datetime | None = None,
    repository_factory: Callable[[Session], OfflineSyncRepository] = OfflineSyncRepository,
) -> SyncBatchResponse:
    started = perf_counter()
    now = _utc(now) or datetime.now(timezone.utc)
    repository = repository_factory(db)
    log = repository.create_batch_log(
        user.email, getattr(user, "active_farm_id", None), now, len(request.items)
    )
    processor = _BatchProcessor(user, repository, now, log.id)
    results = [processor.process(index, item) for index, item in enumerate(request.items)]

    counts = Counter(
        "retryable" if result.retryable else result.status for result in results
    )
    log.synced_count = counts["SINCRONIZADO"]
    log.duplicate_count = counts["DUPLICADO"]
    log.failed_retryable_count = counts["retryable"]
    log.failed_final_count = counts["FALLIDO"]
    log.duration_ms = int((perf_counter() - started) * 1000)
    db.commit()

    if processor.rejected_after_disable:
        record_sync_rejection(db, user, processor.rejected_after_disable)

    return SyncBatchResponse(batch_id=log.id, server_time=now, results=results)
