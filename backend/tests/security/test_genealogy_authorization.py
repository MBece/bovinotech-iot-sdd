"""RBAC, farm isolation, strict input contracts and append-only routes (research.md R11)."""
from uuid import uuid4

import pytest

from app.features.genealogy.router import router
from tests.fixtures.genealogy_factory import build_harness

AURORA, TITAN, RAYO, BRUMA = "DIN-DEMO-000101", "DIN-DEMO-000102", "DIN-DEMO-000116", "DIN-DEMO-000119"
ALL_ROLES = ["OPERARIO", "VETERINARIO", "ADMINISTRADOR", "DIRECTIVO"]


@pytest.fixture
def harness():
    h = build_harness(seed=True)
    yield h
    h.close()


def animal_body(din="DIN-DEMO-000130"):
    return {"clientEventId": str(uuid4()), "din": din, "name": "Nube", "sex": "MACHO",
            "birthDate": "2024-01-01"}


def link_body(offspring=BRUMA, parent=RAYO, role="SIRE"):
    return {"clientEventId": str(uuid4()), "offspringDin": offspring, "parentDin": parent,
            "parentRole": role}


def pending_link_id(harness):
    harness.as_user("VETERINARIO")
    items = harness.client.get(f"/genealogy/animals/{RAYO}/links").json()["items"]
    return [i for i in items if i["parentRole"] == "DAM"][0]["id"]


def current_sire_link_id(harness, din=AURORA):
    harness.as_user("VETERINARIO")
    items = harness.client.get(f"/genealogy/animals/{din}/links").json()["items"]
    return [i for i in items if i["parentRole"] == "SIRE"][0]["id"]


def assert_forbidden(response, code="ROLE_NOT_ALLOWED"):
    assert response.status_code == 403
    assert response.json()["detail"]["code"] == code


# --------------------------------------------------------------- write matrix
@pytest.mark.parametrize("role", ["OPERARIO", "ADMINISTRADOR", "DIRECTIVO"])
def test_only_vet_registers_animals(harness, role):
    harness.as_user(role)
    assert_forbidden(harness.client.post("/genealogy/animals", json=animal_body()))


@pytest.mark.parametrize("role", ["ADMINISTRADOR", "DIRECTIVO"])
def test_admin_and_director_cannot_register_links(harness, role):
    harness.as_user(role)
    assert_forbidden(harness.client.post("/genealogy/links", json=link_body()))


def test_operator_can_propose_links_as_pending(harness):
    harness.as_user("OPERARIO", user_id=33)
    response = harness.client.post("/genealogy/links", json=link_body())
    assert response.status_code == 201
    assert response.json()["status"] == "PENDIENTE_VALIDACION"
    assert response.json()["authorId"] == "33"


@pytest.mark.parametrize("role", ["OPERARIO", "ADMINISTRADOR", "DIRECTIVO"])
def test_only_vet_corrects_links(harness, role):
    link_id = current_sire_link_id(harness)
    harness.as_user(role)
    response = harness.client.post(f"/genealogy/links/{link_id}/corrections", json={
        "clientEventId": str(uuid4()), "parentDin": RAYO, "reason": "x",
    })
    assert_forbidden(response)


@pytest.mark.parametrize("role", ["OPERARIO", "ADMINISTRADOR", "DIRECTIVO"])
def test_only_vet_validates_links(harness, role):
    link_id = pending_link_id(harness)
    harness.as_user(role)
    assert_forbidden(harness.client.post(f"/genealogy/links/{link_id}/validations",
                                         json={"decision": "VALIDADO"}))


def test_no_active_farm_is_forbidden(harness):
    harness.as_user("VETERINARIO", farm_id=None)
    assert_forbidden(harness.client.get("/genealogy/animals"), "NO_ACTIVE_FARM")
    assert_forbidden(harness.client.post("/genealogy/links", json=link_body()), "NO_ACTIVE_FARM")


# --------------------------------------------------------------- farm isolation
def test_other_farm_cannot_link_or_see_animals(harness):
    harness.as_user("VETERINARIO", farm_id=2)
    response = harness.client.post("/genealogy/links", json=link_body())
    assert response.status_code == 404
    assert response.json()["detail"]["code"] == "ANIMAL_NOT_FOUND"
    assert "Bruma" not in response.text and "Rayo" not in response.text
    assert harness.client.get("/genealogy/animals").json()["items"] == []
    assert harness.client.get(f"/genealogy/animals/{AURORA}/links").status_code == 404


def test_other_farm_cannot_correct_or_validate_links(harness):
    sire_link = current_sire_link_id(harness)
    pending = pending_link_id(harness)
    harness.as_user("VETERINARIO", farm_id=2)
    corrected = harness.client.post(f"/genealogy/links/{sire_link}/corrections", json={
        "clientEventId": str(uuid4()), "parentDin": RAYO, "reason": "x",
    })
    assert corrected.status_code == 404
    validated = harness.client.post(f"/genealogy/links/{pending}/validations",
                                    json={"decision": "VALIDADO"})
    assert validated.status_code == 404
    assert validated.json()["detail"]["code"] == "LINK_NOT_FOUND"


# --------------------------------------------------------------- strict contracts
@pytest.mark.parametrize("extra", [{"farmId": 2}, {"authorId": "x"}, {"status": "VALIDADO"}])
def test_server_owned_fields_are_rejected(harness, extra):
    response = harness.client.post("/genealogy/links", json={**link_body(), **extra})
    assert response.status_code == 422
    response = harness.client.post("/genealogy/animals", json={**animal_body(), **extra})
    assert response.status_code == 422


def test_router_exposes_no_destructive_methods():
    methods = set()
    for route in router.routes:
        methods |= set(getattr(route, "methods", set()) or set())
    assert methods
    assert methods.isdisjoint({"PUT", "PATCH", "DELETE"})


# --------------------------------------------------------------- T026 read access
@pytest.mark.parametrize("role", ALL_ROLES)
def test_all_roles_read_tree_and_history_of_their_farm(harness, role):
    harness.as_user(role)
    assert harness.client.get(f"/genealogy/animals/{AURORA}/tree").status_code == 200
    assert harness.client.get(f"/genealogy/animals/{AURORA}/links").status_code == 200
    assert harness.client.get("/genealogy/animals").status_code == 200


def test_other_farm_tree_is_not_found_without_revealing_data(harness):
    harness.as_user("DIRECTIVO", farm_id=2)
    response = harness.client.get(f"/genealogy/animals/{AURORA}/tree")
    assert response.status_code == 404
    assert "Aurora" not in response.text and "Titán" not in response.text


# --------------------------------------------------------------- T035 assessment access
@pytest.mark.parametrize("role", ["VETERINARIO", "ADMINISTRADOR", "DIRECTIVO"])
def test_assessment_roles_can_evaluate(harness, role):
    harness.as_user(role)
    params = {"sire_din": RAYO, "dam_din": AURORA}
    assert harness.client.get("/genealogy/matings/evaluation", params=params).status_code == 200
    assert harness.client.get(f"/genealogy/animals/{AURORA}/inbreeding").status_code == 200


def test_operator_cannot_evaluate(harness):
    harness.as_user("OPERARIO")
    params = {"sire_din": RAYO, "dam_din": AURORA}
    assert_forbidden(harness.client.get("/genealogy/matings/evaluation", params=params))
    assert_forbidden(harness.client.get(f"/genealogy/animals/{AURORA}/inbreeding"))


def test_other_farm_candidates_are_not_found(harness):
    harness.as_user("VETERINARIO", farm_id=2)
    params = {"sire_din": RAYO, "dam_din": AURORA}
    response = harness.client.get("/genealogy/matings/evaluation", params=params)
    assert response.status_code == 404
    assert "Titán" not in response.text
    assert harness.client.get(f"/genealogy/animals/{AURORA}/inbreeding").status_code == 404
