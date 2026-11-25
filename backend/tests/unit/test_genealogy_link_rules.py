"""T010/T011 - Service rules for parent links: validation order, append-only
corrections, derived status, idempotency and veterinary validation."""
from datetime import date, timedelta
from uuid import uuid4

import pytest
from sqlalchemy import inspect

from app.features.genealogy.models import GenealogyParentLink
from app.features.genealogy.schemas import (
    AnimalCreate,
    LinkCorrection,
    LinkCreate,
    LinkValidationCreate,
)
from app.features.genealogy.service import (
    GenealogyError,
    correct_link,
    current_link,
    link_statuses,
    register_animal,
    register_link,
    validate_link,
)
from tests.fixtures.genealogy_factory import build_harness

VET = ("vet-1", "VETERINARIO")
OPERATOR = ("op-1", "OPERARIO")


@pytest.fixture
def harness():
    h = build_harness()
    # Offspring 2024; candidate parents older; one younger; one same-day.
    h.add_animal("DIN-DEMO-000001", "HEMBRA", "2024-05-01")  # offspring
    h.add_animal("DIN-DEMO-000002", "MACHO", "2020-01-01")   # sire
    h.add_animal("DIN-DEMO-000003", "HEMBRA", "2020-02-02")  # dam
    h.add_animal("DIN-DEMO-000004", "MACHO", "2024-05-01")   # same day
    h.add_animal("DIN-DEMO-000005", "MACHO", "2024-05-02")   # one day younger
    h.add_animal("DIN-DEMO-000006", "MACHO", "2024-04-30")   # one day older
    h.add_animal("DIN-DEMO-000007", "MACHO", "2026-01-01")   # descendant
    h.add_animal("DIN-DEMO-000008", "MACHO", "2019-01-01")   # alternative sire
    yield h
    h.close()


def link_in(offspring="DIN-DEMO-000001", parent="DIN-DEMO-000002", role="SIRE", event_id=None):
    return LinkCreate(
        client_event_id=event_id or uuid4(),
        offspring_din=offspring,
        parent_din=parent,
        parent_role=role,
    )


def register(db, payload, who=VET, farm_id=1):
    return register_link(db, payload, farm_id, who[0], who[1])


def error_code(callable_, *args):
    with pytest.raises(GenealogyError) as info:
        callable_(*args)
    return info.value.code, info.value.status_code


def row_snapshot(link):
    return {attr.key: getattr(link, attr.key) for attr in inspect(GenealogyParentLink).mapper.column_attrs}


# --------------------------------------------------------------- validation order (R6)
def test_missing_animal_is_reported_first(harness):
    with harness.session() as db:
        code = error_code(register, db, link_in(parent="DIN-DEMO-000999"))
    assert code == ("ANIMAL_NOT_FOUND", 404)


def test_animal_of_another_farm_is_not_found(harness):
    harness.add_animal("DIN-DEMO-000050", "MACHO", "2010-01-01", farm_id=2)
    with harness.session() as db:
        assert error_code(register, db, link_in(parent="DIN-DEMO-000050"))[0] == "ANIMAL_NOT_FOUND"


def test_cycle_is_checked_before_sex_and_dates(harness):
    # 000007 is a son of 000001; registering him as SIRE of 000001 is a cycle,
    # and he is also younger (date rule) - the cycle must be reported.
    harness.add_link("DIN-DEMO-000007", "DIN-DEMO-000001", "DAM")
    with harness.session() as db:
        assert error_code(register, db, link_in(parent="DIN-DEMO-000007"))[0] == "GENEALOGY_CYCLE"


def test_self_link_is_a_cycle(harness):
    with harness.session() as db:
        assert error_code(
            register, db, link_in(parent="DIN-DEMO-000001", role="DAM")
        ) == ("GENEALOGY_CYCLE", 422)


def test_sex_is_checked_before_dates(harness):
    harness.add_animal("DIN-DEMO-000009", "HEMBRA", "2025-01-01")  # female, younger
    with harness.session() as db:
        assert error_code(register, db, link_in(parent="DIN-DEMO-000009"))[0] == "PARENT_SEX_MISMATCH"


def test_male_as_dam_is_sex_mismatch(harness):
    with harness.session() as db:
        assert error_code(register, db, link_in(parent="DIN-DEMO-000002", role="DAM")) == (
            "PARENT_SEX_MISMATCH", 422,
        )


def test_same_birth_date_is_rejected(harness):
    with harness.session() as db:
        assert error_code(register, db, link_in(parent="DIN-DEMO-000004")) == (
            "PARENT_BIRTH_DATE_NOT_BEFORE_OFFSPRING", 422,
        )


def test_younger_parent_is_rejected(harness):
    with harness.session() as db:
        assert error_code(register, db, link_in(parent="DIN-DEMO-000005"))[0] == (
            "PARENT_BIRTH_DATE_NOT_BEFORE_OFFSPRING"
        )


def test_parent_one_day_older_is_accepted(harness):
    with harness.session() as db:
        link, duplicate = register(db, link_in(parent="DIN-DEMO-000006"))
        assert duplicate is False
        assert link.sequence_no == 1
        assert link.author_id == "vet-1"
        assert link.created_at is not None


def test_occupied_position_is_reported_last(harness):
    with harness.session() as db:
        register(db, link_in())
        assert error_code(register, db, link_in(parent="DIN-DEMO-000008")) == (
            "PARENT_ALREADY_REGISTERED", 409,
        )


# --------------------------------------------------------------- animals
def animal_in(din="DIN-DEMO-000100", birth=date(2023, 1, 1), event_id=None, name="Niebla"):
    return AnimalCreate(
        client_event_id=event_id or uuid4(), din=din, name=name, sex="HEMBRA", birth_date=birth,
    )


def test_future_birth_date_is_rejected(harness):
    tomorrow = date.today() + timedelta(days=2)
    with harness.session() as db:
        assert error_code(register_animal, db, animal_in(birth=tomorrow), 1, "vet-1") == (
            "BIRTH_DATE_IN_FUTURE", 422,
        )


def test_animal_registration_is_idempotent(harness):
    event_id = uuid4()
    with harness.session() as db:
        first, dup1 = register_animal(db, animal_in(event_id=event_id), 1, "vet-1")
        second, dup2 = register_animal(db, animal_in(event_id=event_id), 1, "vet-1")
        assert (dup1, dup2) == (False, True)
        assert first.id == second.id


def test_animal_event_id_reused_with_other_content_conflicts(harness):
    event_id = uuid4()
    with harness.session() as db:
        register_animal(db, animal_in(event_id=event_id), 1, "vet-1")
        assert error_code(
            register_animal, db, animal_in(event_id=event_id, name="Otra"), 1, "vet-1"
        ) == ("CLIENT_EVENT_ID_CONFLICT", 409)


def test_duplicate_din_is_rejected(harness):
    with harness.session() as db:
        assert error_code(
            register_animal, db, animal_in(din="DIN-DEMO-000001"), 1, "vet-1"
        ) == ("ANIMAL_ALREADY_REGISTERED", 409)


# --------------------------------------------------------------- corrections
def correction_in(parent="DIN-DEMO-000008", reason="Prueba de parentesco por ADN", event_id=None):
    return LinkCorrection(client_event_id=event_id or uuid4(), parent_din=parent, reason=reason)


def test_correction_appends_new_link_and_keeps_original_untouched(harness):
    with harness.session() as db:
        original, _ = register(db, link_in())
        before = row_snapshot(original)
        count_before = db.query(GenealogyParentLink).count()
        new, duplicate = correct_link(db, original.id, correction_in(), 1, *VET)
        assert duplicate is False
        assert new.sequence_no == original.sequence_no + 1
        assert new.corrected_event_id == original.id
        assert new.correction_reason == "Prueba de parentesco por ADN"
        assert new.offspring_din == original.offspring_din
        assert new.parent_role == original.parent_role
        db.expire_all()
        reloaded = db.get(GenealogyParentLink, original.id)
        assert row_snapshot(reloaded) == before
        assert db.query(GenealogyParentLink).count() == count_before + 1
        statuses = link_statuses(db, 1)
        assert statuses[original.id] == "CORREGIDO"
        assert statuses[new.id] == "VALIDADO"
        assert current_link(db, 1, "DIN-DEMO-000001", "SIRE").id == new.id


def test_correction_passes_the_same_validations(harness):
    with harness.session() as db:
        original, _ = register(db, link_in())
        assert error_code(
            correct_link, db, original.id, correction_in(parent="DIN-DEMO-000005"), 1, *VET
        )[0] == "PARENT_BIRTH_DATE_NOT_BEFORE_OFFSPRING"


def test_correcting_a_non_current_link_is_rejected(harness):
    with harness.session() as db:
        original, _ = register(db, link_in())
        correct_link(db, original.id, correction_in(), 1, *VET)
        assert error_code(
            correct_link, db, original.id, correction_in(parent="DIN-DEMO-000006"), 1, *VET
        ) == ("LINK_NOT_CURRENT", 409)


def test_correcting_unknown_link_is_not_found(harness):
    with harness.session() as db:
        assert error_code(correct_link, db, str(uuid4()), correction_in(), 1, *VET) == (
            "LINK_NOT_FOUND", 404,
        )


def test_correction_requires_non_blank_reason():
    with pytest.raises(ValueError):
        LinkCorrection(client_event_id=uuid4(), parent_din="DIN-DEMO-000008", reason="   ")


def test_correction_is_idempotent(harness):
    event_id = uuid4()
    with harness.session() as db:
        original, _ = register(db, link_in())
        first, _ = correct_link(db, original.id, correction_in(event_id=event_id), 1, *VET)
        again, duplicate = correct_link(db, original.id, correction_in(event_id=event_id), 1, *VET)
        assert duplicate is True
        assert again.id == first.id


# --------------------------------------------------------------- derived status precedence
def test_corrected_status_takes_precedence_over_validation_decision(harness):
    with harness.session() as db:
        pending, _ = register(db, link_in(), who=OPERATOR)
        validate_link(db, pending.id, LinkValidationCreate(decision="VALIDADO"), 1, "vet-1")
        correct_link(db, pending.id, correction_in(), 1, *VET)
        assert link_statuses(db, 1)[pending.id] == "CORREGIDO"


# --------------------------------------------------------------- idempotency
def test_same_event_id_and_content_is_a_duplicate(harness):
    event_id = uuid4()
    with harness.session() as db:
        first, dup1 = register(db, link_in(event_id=event_id))
        second, dup2 = register(db, link_in(event_id=event_id))
        assert (dup1, dup2) == (False, True)
        assert first.id == second.id
        assert db.query(GenealogyParentLink).count() == 1


def test_same_event_id_with_other_content_conflicts(harness):
    event_id = uuid4()
    with harness.session() as db:
        register(db, link_in(event_id=event_id))
        assert error_code(
            register, db, link_in(parent="DIN-DEMO-000003", role="DAM", event_id=event_id)
        ) == ("CLIENT_EVENT_ID_CONFLICT", 409)


# --------------------------------------------------------------- T011 veterinary validation
def test_operator_link_starts_pending_and_vet_link_starts_validated(harness):
    with harness.session() as db:
        pending, _ = register(db, link_in(), who=OPERATOR)
        validated, _ = register(db, link_in(parent="DIN-DEMO-000003", role="DAM"), who=VET)
        assert pending.initial_status == "PENDIENTE_VALIDACION"
        assert pending.author_role == "OPERARIO"
        assert validated.initial_status == "VALIDADO"
        statuses = link_statuses(db, 1)
        assert statuses[pending.id] == "PENDIENTE_VALIDACION"
        assert statuses[validated.id] == "VALIDADO"


def test_validating_a_pending_link_marks_it_validated(harness):
    with harness.session() as db:
        pending, _ = register(db, link_in(), who=OPERATOR)
        before = row_snapshot(pending)
        validate_link(db, pending.id, LinkValidationCreate(decision="VALIDADO"), 1, "vet-1")
        db.expire_all()
        assert link_statuses(db, 1)[pending.id] == "VALIDADO"
        assert row_snapshot(db.get(GenealogyParentLink, pending.id)) == before


def test_rejection_requires_reason():
    with pytest.raises(ValueError):
        LinkValidationCreate(decision="RECHAZADO")
    with pytest.raises(ValueError):
        LinkValidationCreate(decision="RECHAZADO", reason="  ")


def test_rejection_frees_the_position_for_a_new_registration(harness):
    with harness.session() as db:
        pending, _ = register(db, link_in(), who=OPERATOR)
        validate_link(
            db, pending.id,
            LinkValidationCreate(decision="RECHAZADO", reason="La vaca no parió en esa fecha"),
            1, "vet-1",
        )
        assert link_statuses(db, 1)[pending.id] == "RECHAZADO"
        assert current_link(db, 1, "DIN-DEMO-000001", "SIRE") is None
        new, _ = register(db, link_in(parent="DIN-DEMO-000008"))
        assert new.sequence_no == 2


def test_validating_a_non_pending_link_is_rejected(harness):
    with harness.session() as db:
        validated, _ = register(db, link_in(), who=VET)
        assert error_code(
            validate_link, db, validated.id, LinkValidationCreate(decision="VALIDADO"), 1, "vet-1"
        ) == ("LINK_NOT_PENDING", 409)


def test_a_link_cannot_be_validated_twice(harness):
    with harness.session() as db:
        pending, _ = register(db, link_in(), who=OPERATOR)
        validate_link(db, pending.id, LinkValidationCreate(decision="VALIDADO"), 1, "vet-1")
        assert error_code(
            validate_link, db, pending.id, LinkValidationCreate(decision="VALIDADO"), 1, "vet-1"
        )[0] == "LINK_NOT_PENDING"


def test_validating_unknown_link_is_not_found(harness):
    with harness.session() as db:
        assert error_code(
            validate_link, db, str(uuid4()), LinkValidationCreate(decision="VALIDADO"), 1, "vet-1"
        ) == ("LINK_NOT_FOUND", 404)
