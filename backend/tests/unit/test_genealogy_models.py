"""T005 - Append-only genealogy tables: uniqueness constraints and idempotent seed."""
from datetime import date, datetime, timezone
from uuid import uuid4

import pytest
from sqlalchemy.exc import IntegrityError

from app.features.genealogy.models import (
    GenealogyAnimal,
    GenealogyLinkValidation,
    GenealogyParentLink,
)
from tests.fixtures.genealogy_factory import build_harness


@pytest.fixture
def harness():
    h = build_harness()
    yield h
    h.close()


def _animal(din="DIN-DEMO-000500", farm_id=1, client_event_id=None):
    return GenealogyAnimal(
        id=str(uuid4()),
        client_event_id=client_event_id or str(uuid4()),
        farm_id=farm_id,
        din=din,
        name="Prueba",
        sex="MACHO",
        birth_date=date(2020, 1, 1),
        origin="PROPIO",
        registered_by="test",
        registered_at=datetime.now(timezone.utc),
    )


def _link(offspring="DIN-DEMO-000500", parent="DIN-DEMO-000501", role="SIRE", seq=1,
          farm_id=1, client_event_id=None):
    return GenealogyParentLink(
        id=str(uuid4()),
        client_event_id=client_event_id or str(uuid4()),
        farm_id=farm_id,
        offspring_din=offspring,
        parent_din=parent,
        parent_role=role,
        sequence_no=seq,
        initial_status="VALIDADO",
        author_id="test",
        author_role="VETERINARIO",
        created_at=datetime.now(timezone.utc),
    )


def _validation(link_id, farm_id=1):
    return GenealogyLinkValidation(
        id=str(uuid4()),
        link_id=link_id,
        farm_id=farm_id,
        decision="VALIDADO",
        reason=None,
        validator_id="vet",
        validated_at=datetime.now(timezone.utc),
    )


def _commit_fails(harness, *rows):
    with harness.session() as db:
        for row in rows[:-1]:
            db.add(row)
            db.flush()
        db.add(rows[-1])
        with pytest.raises(IntegrityError):
            db.commit()


def test_animal_din_is_unique_per_farm(harness):
    _commit_fails(harness, _animal(), _animal())


def test_same_din_is_allowed_in_another_farm(harness):
    with harness.session() as db:
        db.add_all([_animal(farm_id=1), _animal(farm_id=2)])
        db.commit()
        assert db.query(GenealogyAnimal).count() == 2


def test_animal_client_event_id_is_unique_per_farm(harness):
    event_id = str(uuid4())
    _commit_fails(
        harness,
        _animal(din="DIN-DEMO-000500", client_event_id=event_id),
        _animal(din="DIN-DEMO-000501", client_event_id=event_id),
    )


def test_link_client_event_id_is_unique_per_farm(harness):
    event_id = str(uuid4())
    _commit_fails(
        harness,
        _link(role="SIRE", client_event_id=event_id),
        _link(role="DAM", client_event_id=event_id),
    )


def test_link_sequence_is_unique_per_offspring_and_role(harness):
    _commit_fails(harness, _link(seq=1), _link(parent="DIN-DEMO-000502", seq=1))


def test_link_sequence_may_repeat_for_other_role(harness):
    with harness.session() as db:
        db.add_all([_link(role="SIRE", seq=1), _link(parent="DIN-DEMO-000502", role="DAM", seq=1)])
        db.commit()
        assert db.query(GenealogyParentLink).count() == 2


def test_only_one_validation_per_link(harness):
    link_id = str(uuid4())
    _commit_fails(harness, _validation(link_id), _validation(link_id))


def test_seed_loads_nineteen_animals_and_sixteen_links(harness):
    inserted = harness.seed()
    with harness.session() as db:
        assert db.query(GenealogyAnimal).count() == 19
        assert db.query(GenealogyParentLink).count() == 16
        assert {a.farm_id for a in db.query(GenealogyAnimal)} == {1}
        pending = db.query(GenealogyParentLink).filter_by(initial_status="PENDIENTE_VALIDACION").all()
        assert [(p.offspring_din, p.parent_din, p.parent_role) for p in pending] == [
            ("DIN-DEMO-000116", "DIN-DEMO-000117", "DAM")
        ]
    assert inserted == 35


def test_seed_twice_does_not_duplicate_or_overwrite(harness):
    harness.seed()
    with harness.session() as db:
        before = {a.din: (a.id, a.client_event_id, a.name) for a in db.query(GenealogyAnimal)}
        links_before = {l.id for l in db.query(GenealogyParentLink)}
    assert harness.seed() == 0
    with harness.session() as db:
        after = {a.din: (a.id, a.client_event_id, a.name) for a in db.query(GenealogyAnimal)}
        links_after = {l.id for l in db.query(GenealogyParentLink)}
    assert before == after
    assert links_before == links_after


def test_seed_uses_deterministic_client_event_ids():
    first, second = build_harness(seed=True), build_harness(seed=True)
    try:
        with first.session() as a, second.session() as b:
            ids_a = sorted(x.client_event_id for x in a.query(GenealogyParentLink))
            ids_b = sorted(x.client_event_id for x in b.query(GenealogyParentLink))
        assert ids_a == ids_b
    finally:
        first.close()
        second.close()
