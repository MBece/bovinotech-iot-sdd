"""Pydantic v2 contracts for HU-07 (contracts/api.md). camelCase on the wire."""
from datetime import date, datetime
from enum import Enum
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from pydantic.alias_generators import to_camel

DIN_PATTERN = r"^DIN-DEMO-[0-9]{6}$"


class Sex(str, Enum):
    MACHO = "MACHO"
    HEMBRA = "HEMBRA"


class Origin(str, Enum):
    PROPIO = "PROPIO"
    EXTERNO = "EXTERNO"


class ParentRole(str, Enum):
    SIRE = "SIRE"
    DAM = "DAM"


class LinkStatus(str, Enum):
    VALIDADO = "VALIDADO"
    PENDIENTE_VALIDACION = "PENDIENTE_VALIDACION"
    NO_REGISTRADO = "NO_REGISTRADO"
    CORREGIDO = "CORREGIDO"
    RECHAZADO = "RECHAZADO"


class Decision(str, Enum):
    VALIDADO = "VALIDADO"
    RECHAZADO = "RECHAZADO"


def normalize_din(value):
    if isinstance(value, str):
        return value.strip().upper()
    return value


class GenealogyModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class GenealogyInput(GenealogyModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        extra="forbid",
        str_strip_whitespace=True,
    )


# --------------------------------------------------------------- inputs
class AnimalCreate(GenealogyInput):
    client_event_id: UUID
    din: str = Field(pattern=DIN_PATTERN)
    name: str = Field(min_length=1, max_length=120)
    sex: Sex
    birth_date: date
    origin: Origin = Origin.PROPIO

    _din = field_validator("din", mode="before")(normalize_din)


class LinkCreate(GenealogyInput):
    client_event_id: UUID
    offspring_din: str = Field(pattern=DIN_PATTERN)
    parent_din: str = Field(pattern=DIN_PATTERN)
    parent_role: ParentRole

    _dins = field_validator("offspring_din", "parent_din", mode="before")(normalize_din)


class LinkCorrection(GenealogyInput):
    client_event_id: UUID
    parent_din: str = Field(pattern=DIN_PATTERN)
    reason: str = Field(min_length=1, max_length=500)

    _din = field_validator("parent_din", mode="before")(normalize_din)


class LinkValidationCreate(GenealogyInput):
    decision: Decision
    reason: str | None = Field(default=None, min_length=1, max_length=500)

    @model_validator(mode="after")
    def require_reason_on_rejection(self):
        if self.decision == Decision.RECHAZADO and not self.reason:
            raise ValueError("reason es obligatorio al rechazar un vínculo")
        return self


# --------------------------------------------------------------- outputs
class AnimalRead(GenealogyModel):
    id: str
    din: str
    name: str
    sex: Sex
    birth_date: date
    origin: Origin
    registered_by: str
    registered_at: datetime


class AnimalWriteResult(AnimalRead):
    sync_status: str


class AnimalList(GenealogyModel):
    items: list[AnimalRead]
    next_cursor: str | None = None


class ValidationRead(GenealogyModel):
    decision: Decision
    reason: str | None
    validator_id: str
    validated_at: datetime


class LinkRead(GenealogyModel):
    id: str
    client_event_id: str
    offspring_din: str
    parent_din: str
    parent_role: ParentRole
    sequence_no: int
    status: LinkStatus
    corrected_event_id: str | None
    correction_reason: str | None
    author_id: str
    author_role: str
    created_at: datetime
    validation: ValidationRead | None


class LinkWriteResult(LinkRead):
    sync_status: str


class LinkList(GenealogyModel):
    items: list[LinkRead]


class PedigreeAnimalRead(GenealogyModel):
    din: str
    name: str
    sex: Sex
    birth_date: date


class PedigreePositionRead(GenealogyModel):
    position: str
    generation: int
    role: ParentRole
    status: LinkStatus
    link_id: str | None
    animal: PedigreeAnimalRead | None


class TreeRead(GenealogyModel):
    din: str
    name: str
    sex: Sex
    birth_date: date
    generation_window: int
    expected_count: int
    missing_count: int
    is_complete: bool
    positions: list[PedigreePositionRead]


class AncestorPathRead(GenealogyModel):
    sire_generations: int
    dam_generations: int
    sire_path: list[str]
    dam_path: list[str]


class CommonAncestorRead(GenealogyModel):
    din: str
    name: str
    contribution: float
    paths: list[AncestorPathRead]


class MissingAncestorRead(GenealogyModel):
    candidate: ParentRole
    position: str


class InbreedingAssessmentRead(GenealogyModel):
    subject: str
    din: str | None
    sire_din: str | None
    dam_din: str | None
    calculation_status: str
    coefficient: float | None
    coefficient_percent: float | None
    coefficient_is_minimum: bool
    warning: bool
    risk_level: str | None
    common_ancestors: list[CommonAncestorRead]
    missing_ancestors: list[MissingAncestorRead]
    reason: str | None
    includes_pending_links: bool
    generation_window: int
    message: str
