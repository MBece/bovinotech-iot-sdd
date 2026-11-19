from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


def to_camel(value: str) -> str:
    parts = value.split("_")
    return parts[0] + "".join(part.capitalize() for part in parts[1:])


class CamelModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        from_attributes=True,
    )


class SimulationMeta(CamelModel):
    source_system: Literal["SINIGAN"] = "SINIGAN"
    source_mode: Literal["SIMULADO"] = "SIMULADO"
    is_simulation: Literal[True] = True
    contract_version: str = "1.0"
    retrieved_at: datetime


class AdapterStatus(CamelModel):
    available: bool
    adapter: str
    capabilities: list[str]


class EstablishmentReference(CamelModel):
    sit_code: str
    name: str


class AnimalReference(CamelModel):
    din: str
    animal_name: str
    animal_number: str
    species: Literal["BOVINO", "BUFALINO"]
    sex: Literal["HEMBRA", "MACHO"]
    age_group: Literal["TERNERO", "JOVEN", "ADULTO"]
    establishment: EstablishmentReference


class StatusResponse(CamelModel):
    meta: SimulationMeta
    data: AdapterStatus


class AnimalResponse(CamelModel):
    meta: SimulationMeta
    data: AnimalReference


DIN_PATTERN = r"^DIN-DEMO-[0-9]{6}$"


class DinPath(CamelModel):
    din: str = Field(pattern=DIN_PATTERN)
