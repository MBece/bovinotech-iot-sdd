"""Business rules for HU-07: registration, corrections, validations, queries and seed.

Every write is an INSERT (append-only); no UPDATE or DELETE is ever issued.
Link status is derived (data-model.md, "Estados derivados"):
CORREGIDO > validation decision > initial status.
"""
from __future__ import annotations

import json
from datetime import date, datetime, timezone
from pathlib import Path
from uuid import NAMESPACE_URL, uuid4, uuid5

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.features.genealogy.models import (
    GenealogyAnimal,
    GenealogyLinkValidation,
    GenealogyParentLink,
    utc_now,
)
from app.features.genealogy.pedigree import (
    PENDING,
    VALIDATED,
    LinkFact,
    assess,
    assess_animal,
    build_graph,
    build_tree,
    creates_cycle,
)

SEED_PATH = Path(__file__).parent / "fixtures" / "pedigree_seed.json"
SEED_NAMESPACE = uuid5(NAMESPACE_URL, "bovinotech-iot/genealogy/seed")
CORRECTED = "CORREGIDO"
REQUIRED_SEX = {"SIRE": "MACHO", "DAM": "HEMBRA"}


class GenealogyError(Exception):
    """Business-rule rejection carrying an HTTP status and a stable code."""

    def __init__(self, status_code: int, code: str, message: str) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message


def _animal_not_found() -> GenealogyError:
    return GenealogyError(404, "ANIMAL_NOT_FOUND", "El animal no tiene ficha genealógica en la finca activa.")


def _link_not_found() -> GenealogyError:
    return GenealogyError(404, "LINK_NOT_FOUND", "El vínculo no existe en la finca activa.")


def _event_conflict() -> GenealogyError:
    return GenealogyError(
        409, "CLIENT_EVENT_ID_CONFLICT",
        "El identificador de evento ya fue usado con un contenido distinto.",
    )


def as_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


# --------------------------------------------------------------- reads / derivation
def get_animal(db: Session, farm_id: int, din: str) -> GenealogyAnimal | None:
    return db.query(GenealogyAnimal).filter_by(farm_id=farm_id, din=din.upper()).first()


def require_animal(db: Session, farm_id: int, din: str) -> GenealogyAnimal:
    animal = get_animal(db, farm_id, din)
    if animal is None:
        raise _animal_not_found()
    return animal


def list_animals(db: Session, farm_id: int, q: str | None = None, sex: str | None = None):
    query = db.query(GenealogyAnimal).filter_by(farm_id=farm_id)
    if sex:
        query = query.filter(GenealogyAnimal.sex == sex)
    animals = query.order_by(GenealogyAnimal.din.asc()).all()
    if q:
        needle = q.strip().casefold()
        animals = [a for a in animals if needle in a.din.casefold() or needle in a.name.casefold()]
    return animals


def _validations(db: Session, farm_id: int) -> dict[str, GenealogyLinkValidation]:
    return {v.link_id: v for v in db.query(GenealogyLinkValidation).filter_by(farm_id=farm_id)}


def _derive_statuses(links, validations) -> dict[str, str]:
    corrected = {link.corrected_event_id for link in links if link.corrected_event_id}
    statuses = {}
    for link in links:
        if link.id in corrected:
            statuses[link.id] = CORRECTED
        elif link.id in validations:
            statuses[link.id] = validations[link.id].decision
        else:
            statuses[link.id] = link.initial_status
    return statuses


def load_farm(db: Session, farm_id: int):
    """One load per farm: (animals by DIN, links, validations, statuses)."""
    animals = {a.din: a for a in db.query(GenealogyAnimal).filter_by(farm_id=farm_id)}
    links = db.query(GenealogyParentLink).filter_by(farm_id=farm_id).all()
    validations = _validations(db, farm_id)
    return animals, links, validations, _derive_statuses(links, validations)


def link_statuses(db: Session, farm_id: int) -> dict[str, str]:
    return load_farm(db, farm_id)[3]


def _facts(links, statuses) -> list[LinkFact]:
    return [
        LinkFact(
            id=link.id,
            offspring_din=link.offspring_din,
            parent_din=link.parent_din,
            parent_role=link.parent_role,
            sequence_no=link.sequence_no,
            status=statuses[link.id],
        )
        for link in links
    ]


def farm_graph(db: Session, farm_id: int):
    animals, links, _, statuses = load_farm(db, farm_id)
    return animals, build_graph(_facts(links, statuses))


def current_link(db: Session, farm_id: int, offspring_din: str, role: str):
    _, graph = farm_graph(db, farm_id)
    fact = graph.get(offspring_din, {}).get(role)
    return db.get(GenealogyParentLink, fact.id) if fact else None


# --------------------------------------------------------------- animals
def _same_animal(existing: GenealogyAnimal, payload) -> bool:
    return (
        existing.din == payload.din
        and existing.name == payload.name
        and existing.sex == payload.sex.value
        and existing.birth_date == payload.birth_date
        and existing.origin == payload.origin.value
    )


def register_animal(db: Session, payload, farm_id: int, user_id: str, today: date | None = None):
    """Returns (animal, duplicate)."""
    existing = (
        db.query(GenealogyAnimal)
        .filter_by(farm_id=farm_id, client_event_id=str(payload.client_event_id))
        .first()
    )
    if existing is not None:
        if _same_animal(existing, payload):
            return existing, True
        raise _event_conflict()
    today = today or datetime.now(timezone.utc).date()
    if payload.birth_date > today:
        raise GenealogyError(
            422, "BIRTH_DATE_IN_FUTURE", "La fecha de nacimiento no puede ser posterior a hoy."
        )
    if get_animal(db, farm_id, payload.din) is not None:
        raise GenealogyError(
            409, "ANIMAL_ALREADY_REGISTERED", "Ya existe una ficha genealógica con ese DIN en la finca."
        )
    animal = GenealogyAnimal(
        id=str(uuid4()),
        client_event_id=str(payload.client_event_id),
        farm_id=farm_id,
        din=payload.din,
        name=payload.name,
        sex=payload.sex.value,
        birth_date=payload.birth_date,
        origin=payload.origin.value,
        registered_by=str(user_id),
        registered_at=utc_now(),
    )
    db.add(animal)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        existing = (
            db.query(GenealogyAnimal)
            .filter_by(farm_id=farm_id, client_event_id=str(payload.client_event_id))
            .first()
        )
        if existing is not None and _same_animal(existing, payload):
            return existing, True
        raise GenealogyError(
            409, "ANIMAL_ALREADY_REGISTERED", "Ya existe una ficha genealógica con ese DIN en la finca."
        ) from None
    db.refresh(animal)
    return animal, False


# --------------------------------------------------------------- links
def _find_by_event(db: Session, farm_id: int, client_event_id) -> GenealogyParentLink | None:
    return (
        db.query(GenealogyParentLink)
        .filter_by(farm_id=farm_id, client_event_id=str(client_event_id))
        .first()
    )


def _check_link_rules(animals, graph, offspring_din: str, parent_din: str, role: str) -> None:
    """Existence -> anti-cycle -> sex -> birth date (research.md R6, steps 1-4)."""
    offspring = animals.get(offspring_din)
    parent = animals.get(parent_din)
    if offspring is None or parent is None:
        raise _animal_not_found()
    if creates_cycle(graph, offspring_din, parent_din):
        raise GenealogyError(
            422, "GENEALOGY_CYCLE",
            "El progenitor no puede ser la propia cría ni uno de sus descendientes (ciclo genealógico).",
        )
    if parent.sex != REQUIRED_SEX[role]:
        message = "El padre debe ser macho." if role == "SIRE" else "La madre debe ser hembra."
        raise GenealogyError(422, "PARENT_SEX_MISMATCH", message)
    if not parent.birth_date < offspring.birth_date:
        raise GenealogyError(
            422, "PARENT_BIRTH_DATE_NOT_BEFORE_OFFSPRING",
            "La fecha de nacimiento del progenitor debe ser anterior a la de la cría.",
        )


def _initial_status(author_role: str) -> str:
    return VALIDATED if author_role == "VETERINARIO" else PENDING


def _max_sequence(links, offspring_din: str, role: str) -> int:
    return max(
        (l.sequence_no for l in links if l.offspring_din == offspring_din and l.parent_role == role),
        default=0,
    )


def _insert_link(db: Session, link: GenealogyParentLink, farm_id: int, client_event_id, same) -> tuple:
    db.add(link)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        existing = _find_by_event(db, farm_id, client_event_id)
        if existing is not None:
            if same(existing):
                return existing, True
            raise _event_conflict() from None
        raise GenealogyError(
            409, "PARENT_ALREADY_REGISTERED",
            "Otro registro ocupó esta posición al mismo tiempo; consulte el historial y use una corrección.",
        ) from None
    db.refresh(link)
    return link, False


def register_link(db: Session, payload, farm_id: int, author_id: str, author_role: str):
    """Registers a parent link. Returns (link, duplicate)."""
    role = payload.parent_role.value

    def same(existing):
        return (
            existing.offspring_din == payload.offspring_din
            and existing.parent_din == payload.parent_din
            and existing.parent_role == role
            and existing.corrected_event_id is None
        )

    existing = _find_by_event(db, farm_id, payload.client_event_id)
    if existing is not None:
        if same(existing):
            return existing, True
        raise _event_conflict()
    animals, links, _, statuses = load_farm(db, farm_id)
    graph = build_graph(_facts(links, statuses))
    _check_link_rules(animals, graph, payload.offspring_din, payload.parent_din, role)
    if role in graph.get(payload.offspring_din, {}):
        raise GenealogyError(
            409, "PARENT_ALREADY_REGISTERED",
            "La cría ya tiene un progenitor vigente para ese rol; registre una corrección.",
        )
    link = GenealogyParentLink(
        id=str(uuid4()),
        client_event_id=str(payload.client_event_id),
        farm_id=farm_id,
        offspring_din=payload.offspring_din,
        parent_din=payload.parent_din,
        parent_role=role,
        sequence_no=_max_sequence(links, payload.offspring_din, role) + 1,
        corrected_event_id=None,
        correction_reason=None,
        initial_status=_initial_status(author_role),
        author_id=str(author_id),
        author_role=author_role,
        created_at=utc_now(),
    )
    return _insert_link(db, link, farm_id, payload.client_event_id, same)


def correct_link(db: Session, link_id: str, payload, farm_id: int, author_id: str, author_role: str):
    """Appends a link replacing the current one. Returns (new_link, duplicate)."""

    def same(existing):
        return (
            existing.corrected_event_id == link_id
            and existing.parent_din == payload.parent_din
            and existing.correction_reason == payload.reason
        )

    existing = _find_by_event(db, farm_id, payload.client_event_id)
    if existing is not None:
        if same(existing):
            return existing, True
        raise _event_conflict()
    original = db.query(GenealogyParentLink).filter_by(id=str(link_id), farm_id=farm_id).first()
    if original is None:
        raise _link_not_found()
    animals, links, _, statuses = load_farm(db, farm_id)
    graph = build_graph(_facts(links, statuses))
    _check_link_rules(animals, graph, original.offspring_din, payload.parent_din, original.parent_role)
    current = graph.get(original.offspring_din, {}).get(original.parent_role)
    if current is None or current.id != original.id:
        raise GenealogyError(
            409, "LINK_NOT_CURRENT", "Solo se puede corregir el vínculo vigente de la posición."
        )
    link = GenealogyParentLink(
        id=str(uuid4()),
        client_event_id=str(payload.client_event_id),
        farm_id=farm_id,
        offspring_din=original.offspring_din,
        parent_din=payload.parent_din,
        parent_role=original.parent_role,
        sequence_no=_max_sequence(links, original.offspring_din, original.parent_role) + 1,
        corrected_event_id=original.id,
        correction_reason=payload.reason,
        initial_status=_initial_status(author_role),
        author_id=str(author_id),
        author_role=author_role,
        created_at=utc_now(),
    )
    return _insert_link(db, link, farm_id, payload.client_event_id, same)


def validate_link(db: Session, link_id: str, payload, farm_id: int, validator_id: str):
    """Appends the veterinary decision on a pending link. Returns the link."""
    link = db.query(GenealogyParentLink).filter_by(id=str(link_id), farm_id=farm_id).first()
    if link is None:
        raise _link_not_found()
    not_pending = GenealogyError(
        409, "LINK_NOT_PENDING", "El vínculo no está pendiente de validación."
    )
    if link_statuses(db, farm_id).get(link.id) != PENDING:
        raise not_pending
    db.add(GenealogyLinkValidation(
        id=str(uuid4()),
        link_id=link.id,
        farm_id=farm_id,
        decision=payload.decision.value,
        reason=payload.reason,
        validator_id=str(validator_id),
        validated_at=utc_now(),
    ))
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise not_pending from None
    return link


def list_links(db: Session, farm_id: int, din: str):
    require_animal(db, farm_id, din)
    return (
        db.query(GenealogyParentLink)
        .filter_by(farm_id=farm_id, offspring_din=din.upper())
        .order_by(GenealogyParentLink.parent_role.asc(), GenealogyParentLink.sequence_no.asc())
        .all()
    )


# --------------------------------------------------------------- tree
def get_tree(db: Session, farm_id: int, din: str) -> dict:
    """Three-generation tree from a single load of the farm's records."""
    animals, graph = farm_graph(db, farm_id)
    din = din.upper()
    if din not in animals:
        raise _animal_not_found()
    return build_tree(din, animals, graph)


# --------------------------------------------------------------- inbreeding
def assess_mating(db: Session, farm_id: int, sire_din: str, dam_din: str) -> dict:
    """Preventive evaluation of a proposed mating (never blocks, FR-017)."""
    sire_din, dam_din = sire_din.strip().upper(), dam_din.strip().upper()
    invalid = GenealogyError(
        422, "INVALID_MATING_CANDIDATES",
        "El cruce debe proponer un macho y una hembra distintos de la finca.",
    )
    if sire_din == dam_din:
        raise invalid
    animals, graph = farm_graph(db, farm_id)
    if sire_din not in animals or dam_din not in animals:
        raise _animal_not_found()
    if animals[sire_din].sex != "MACHO" or animals[dam_din].sex != "HEMBRA":
        raise invalid
    return assess(sire_din, dam_din, animals, graph)


def assess_animal_indicator(db: Session, farm_id: int, din: str) -> dict:
    animals, graph = farm_graph(db, farm_id)
    din = din.strip().upper()
    if din not in animals:
        raise _animal_not_found()
    return assess_animal(din, animals, graph)


# --------------------------------------------------------------- payloads
def animal_payload(animal: GenealogyAnimal) -> dict:
    return {
        "id": animal.id,
        "din": animal.din,
        "name": animal.name,
        "sex": animal.sex,
        "birth_date": animal.birth_date,
        "origin": animal.origin,
        "registered_by": animal.registered_by,
        "registered_at": as_utc(animal.registered_at),
    }


def link_payload(db: Session, link: GenealogyParentLink, farm_id: int) -> dict:
    _, links, validations, statuses = load_farm(db, farm_id)
    return links_payload([link], validations, statuses)[0]


def links_payload(links, validations, statuses) -> list[dict]:
    result = []
    for link in links:
        validation = validations.get(link.id)
        result.append({
            "id": link.id,
            "client_event_id": link.client_event_id,
            "offspring_din": link.offspring_din,
            "parent_din": link.parent_din,
            "parent_role": link.parent_role,
            "sequence_no": link.sequence_no,
            "status": statuses[link.id],
            "corrected_event_id": link.corrected_event_id,
            "correction_reason": link.correction_reason,
            "author_id": link.author_id,
            "author_role": link.author_role,
            "created_at": as_utc(link.created_at),
            "validation": None if validation is None else {
                "decision": validation.decision,
                "reason": validation.reason,
                "validator_id": validation.validator_id,
                "validated_at": as_utc(validation.validated_at),
            },
        })
    return result


def history_payload(db: Session, farm_id: int, din: str) -> list[dict]:
    links = list_links(db, farm_id, din)
    _, _, validations, statuses = load_farm(db, farm_id)
    return links_payload(links, validations, statuses)


# --------------------------------------------------------------- seed
def _seed_event_id(*parts) -> str:
    return str(uuid5(SEED_NAMESPACE, ":".join(str(part) for part in parts)))


def seed_genealogy(db: Session | None = None) -> int:
    """Insert the fictional demo pedigree idempotently; returns inserted rows.

    Only missing records are inserted (identified by deterministic UUID v5
    client event ids or by DIN/position); existing rows are never overwritten.
    """
    close_session = db is None
    db = db or SessionLocal()
    try:
        with SEED_PATH.open(encoding="utf-8") as seed_file:
            seed = json.load(seed_file)
        farm_id = int(seed["farm_id"])
        existing_dins = {row[0] for row in db.query(GenealogyAnimal.din).filter_by(farm_id=farm_id)}
        occupied = {
            (row.offspring_din, row.parent_role)
            for row in db.query(GenealogyParentLink).filter_by(farm_id=farm_id)
        }
        inserted = 0
        now = utc_now()
        for item in seed["animals"]:
            if item["din"] in existing_dins:
                continue
            db.add(GenealogyAnimal(
                id=str(uuid4()),
                client_event_id=_seed_event_id("animal", farm_id, item["din"]),
                farm_id=farm_id,
                din=item["din"],
                name=item["name"],
                sex=item["sex"],
                birth_date=date.fromisoformat(item["birth_date"]),
                origin=item.get("origin", "PROPIO"),
                registered_by="seed",
                registered_at=now,
            ))
            inserted += 1
        for item in seed["links"]:
            if (item["offspring_din"], item["parent_role"]) in occupied:
                continue
            db.add(GenealogyParentLink(
                id=str(uuid4()),
                client_event_id=_seed_event_id(
                    "link", farm_id, item["offspring_din"], item["parent_role"], 1
                ),
                farm_id=farm_id,
                offspring_din=item["offspring_din"],
                parent_din=item["parent_din"],
                parent_role=item["parent_role"],
                sequence_no=1,
                corrected_event_id=None,
                correction_reason=None,
                initial_status=item["initial_status"],
                author_id=item["author_id"],
                author_role=item["author_role"],
                created_at=now,
            ))
            inserted += 1
        db.commit()
        return inserted
    finally:
        if close_session:
            db.close()
