"""Contracts of POST /offline-sync/batches (contracts/offline-sync-api.md §1).

Items are received as raw objects and validated one by one with the HU-02
``CapturedEvent`` schema, so one malformed event never rejects the whole batch
(research R4).
"""
from datetime import datetime
from enum import Enum
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

MAX_BATCH_SIZE = 50

SyncStatus = Literal["SINCRONIZADO", "DUPLICADO", "FALLIDO"]


class ErrorCode(str, Enum):
    VALIDATION_ERROR = "VALIDATION_ERROR"
    AUTHOR_MISMATCH = "AUTHOR_MISMATCH"
    FARM_NOT_ALLOWED = "FARM_NOT_ALLOWED"
    AUTHOR_DISABLED = "AUTHOR_DISABLED"
    CLIENT_EVENT_ID_CONFLICT = "CLIENT_EVENT_ID_CONFLICT"
    STORAGE_BUSY = "STORAGE_BUSY"


ERROR_MESSAGES: dict[ErrorCode, str] = {
    ErrorCode.VALIDATION_ERROR: "El evento tiene datos inválidos: {fields}.",
    ErrorCode.AUTHOR_MISMATCH: (
        "El evento pertenece a otro usuario y solo puede sincronizarlo su autor."
    ),
    ErrorCode.FARM_NOT_ALLOWED: "Ya no tiene acceso a la finca de este evento.",
    ErrorCode.AUTHOR_DISABLED: "El evento se capturó después de deshabilitar la cuenta.",
    ErrorCode.CLIENT_EVENT_ID_CONFLICT: (
        "El identificador del evento ya se usó con datos distintos."
    ),
    ErrorCode.STORAGE_BUSY: "El servidor no pudo registrar el evento. Se reintentará.",
}

RETRYABLE_CODES = {ErrorCode.STORAGE_BUSY}

DUPLICATE_DETAIL = "El evento ya estaba registrado en el servidor."


class SyncBatchRequest(BaseModel):
    items: list[dict[str, Any]] = Field(min_length=1, max_length=MAX_BATCH_SIZE)


class _CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class SyncItemResult(_CamelModel):
    index: int
    client_event_id: UUID | None = None
    status: SyncStatus
    retryable: bool | None = None
    error_code: ErrorCode | None = None
    detail: str | None = None
    received_at: datetime | None = None
    requires_timestamp_review: bool = False


class SyncBatchResponse(_CamelModel):
    batch_id: int
    server_time: datetime
    results: list[SyncItemResult]
