"""HTTP API for HU-07 (contracts/api.md). Insert-only: no PUT, PATCH or DELETE."""
from fastapi import APIRouter, Depends, HTTPException, Path, Query, Response, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.features.auth.dependencies import get_current_user
from app.features.auth.models import User
from app.features.genealogy import service
from app.features.genealogy.schemas import (
    AnimalCreate,
    AnimalList,
    AnimalWriteResult,
    InbreedingAssessmentRead,
    LinkCorrection,
    LinkCreate,
    LinkList,
    LinkRead,
    LinkValidationCreate,
    LinkWriteResult,
    Sex,
    TreeRead,
)

router = APIRouter()

READ_ROLES = frozenset({"OPERARIO", "VETERINARIO", "ADMINISTRADOR", "DIRECTIVO"})
ANIMAL_WRITE_ROLES = frozenset({"VETERINARIO"})
LINK_CAPTURE_ROLES = frozenset({"OPERARIO", "VETERINARIO"})
LINK_CURATION_ROLES = frozenset({"VETERINARIO"})
ASSESSMENT_ROLES = frozenset({"VETERINARIO", "ADMINISTRADOR", "DIRECTIVO"})

DinPath = Path(min_length=1, max_length=32)
LinkIdPath = Path(min_length=1, max_length=36)


def coded_http_error(status_code: int, code: str, message: str) -> HTTPException:
    return HTTPException(status_code=status_code, detail={"message": message, "code": code})


def resolve_context(user: User, roles: frozenset[str]) -> tuple[int, str, str]:
    """Returns (farm_id, author_id, role) or raises 403 (research.md R11)."""
    role = getattr(user, "role_value", None)
    if role not in roles:
        raise coded_http_error(403, "ROLE_NOT_ALLOWED", "Su rol no tiene permiso para esta operación.")
    farm_id = getattr(user, "active_farm_id", None)
    if farm_id is None:
        raise coded_http_error(403, "NO_ACTIVE_FARM", "La sesión no tiene una finca activa.")
    return int(farm_id), str(user.id), role


def _raise(error: service.GenealogyError):
    raise coded_http_error(error.status_code, error.code, error.message) from error


def _sync(response: Response, payload: dict, duplicate: bool) -> dict:
    if duplicate:
        response.status_code = status.HTTP_200_OK
    return payload | {"sync_status": "DUPLICADO" if duplicate else "SYNCED"}


# --------------------------------------------------------------- animals
@router.get("/animals", response_model=AnimalList, response_model_by_alias=True)
def list_animals(
    q: str | None = Query(default=None, min_length=1, max_length=120),
    sex: Sex | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    farm_id, _, _ = resolve_context(user, READ_ROLES)
    animals = service.list_animals(db, farm_id, q, sex.value if sex else None)
    return {"items": [service.animal_payload(a) for a in animals], "next_cursor": None}


@router.post("/animals", response_model=AnimalWriteResult, response_model_by_alias=True, status_code=201)
def create_animal(
    payload: AnimalCreate,
    response: Response,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    farm_id, author_id, _ = resolve_context(user, ANIMAL_WRITE_ROLES)
    try:
        animal, duplicate = service.register_animal(db, payload, farm_id, author_id)
    except service.GenealogyError as error:
        _raise(error)
    return _sync(response, service.animal_payload(animal), duplicate)


@router.get("/animals/{din}/links", response_model=LinkList, response_model_by_alias=True)
def animal_links(
    din: str = DinPath,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    farm_id, _, _ = resolve_context(user, READ_ROLES)
    try:
        return {"items": service.history_payload(db, farm_id, din)}
    except service.GenealogyError as error:
        _raise(error)


@router.get("/animals/{din}/tree", response_model=TreeRead, response_model_by_alias=True)
def animal_tree(
    din: str = DinPath,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    farm_id, _, _ = resolve_context(user, READ_ROLES)
    try:
        return service.get_tree(db, farm_id, din)
    except service.GenealogyError as error:
        _raise(error)


@router.get(
    "/animals/{din}/inbreeding",
    response_model=InbreedingAssessmentRead,
    response_model_by_alias=True,
)
def animal_inbreeding(
    din: str = DinPath,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    farm_id, _, _ = resolve_context(user, ASSESSMENT_ROLES)
    try:
        return service.assess_animal_indicator(db, farm_id, din)
    except service.GenealogyError as error:
        _raise(error)


@router.get(
    "/matings/evaluation",
    response_model=InbreedingAssessmentRead,
    response_model_by_alias=True,
)
def mating_evaluation(
    sire_din: str = Query(min_length=1, max_length=32),
    dam_din: str = Query(min_length=1, max_length=32),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    farm_id, _, _ = resolve_context(user, ASSESSMENT_ROLES)
    try:
        return service.assess_mating(db, farm_id, sire_din, dam_din)
    except service.GenealogyError as error:
        _raise(error)


# --------------------------------------------------------------- links
@router.post("/links", response_model=LinkWriteResult, response_model_by_alias=True, status_code=201)
def create_link(
    payload: LinkCreate,
    response: Response,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    farm_id, author_id, role = resolve_context(user, LINK_CAPTURE_ROLES)
    try:
        link, duplicate = service.register_link(db, payload, farm_id, author_id, role)
    except service.GenealogyError as error:
        _raise(error)
    return _sync(response, service.link_payload(db, link, farm_id), duplicate)


@router.post(
    "/links/{link_id}/corrections",
    response_model=LinkWriteResult,
    response_model_by_alias=True,
    status_code=201,
)
def create_correction(
    payload: LinkCorrection,
    response: Response,
    link_id: str = LinkIdPath,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    farm_id, author_id, role = resolve_context(user, LINK_CURATION_ROLES)
    try:
        link, duplicate = service.correct_link(db, link_id, payload, farm_id, author_id, role)
    except service.GenealogyError as error:
        _raise(error)
    return _sync(response, service.link_payload(db, link, farm_id), duplicate)


@router.post(
    "/links/{link_id}/validations",
    response_model=LinkRead,
    response_model_by_alias=True,
    status_code=201,
)
def create_validation(
    payload: LinkValidationCreate,
    link_id: str = LinkIdPath,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    farm_id, validator_id, _ = resolve_context(user, LINK_CURATION_ROLES)
    try:
        link = service.validate_link(db, link_id, payload, farm_id, validator_id)
    except service.GenealogyError as error:
        _raise(error)
    return service.link_payload(db, link, farm_id)
