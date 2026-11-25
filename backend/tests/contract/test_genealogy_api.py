"""Contract tests for /genealogy (contracts/api.md), using the module seed."""
from uuid import uuid4

import pytest

from tests.fixtures.genealogy_factory import build_harness

AURORA, TITAN, CANELA = "DIN-DEMO-000101", "DIN-DEMO-000102", "DIN-DEMO-000103"
RAYO, PALOMA, LUCERO, BRUMA = "DIN-DEMO-000116", "DIN-DEMO-000117", "DIN-DEMO-000118", "DIN-DEMO-000119"
BRIOSO = "DIN-DEMO-000104"


@pytest.fixture
def harness():
    h = build_harness(seed=True)
    yield h
    h.close()


def post_link(client, offspring, parent, role, event_id=None):
    return client.post("/genealogy/links", json={
        "clientEventId": event_id or str(uuid4()),
        "offspringDin": offspring,
        "parentDin": parent,
        "parentRole": role,
    })


def links_of(client, din):
    response = client.get(f"/genealogy/animals/{din}/links")
    assert response.status_code == 200
    return response.json()["items"]


# --------------------------------------------------------------- animals
def test_list_animals_returns_seed_sorted_by_din_in_camel_case(harness):
    body = harness.client.get("/genealogy/animals").json()
    assert body["nextCursor"] is None
    assert len(body["items"]) == 19
    assert [i["din"] for i in body["items"]] == sorted(i["din"] for i in body["items"])
    first = body["items"][0]
    assert set(first) == {"id", "din", "name", "sex", "birthDate", "origin", "registeredBy", "registeredAt"}
    assert first["din"] == AURORA and first["birthDate"] == "2025-03-10"


def test_list_animals_filters_by_query_and_sex(harness):
    by_name = harness.client.get("/genealogy/animals", params={"q": "titán"}).json()["items"]
    assert [i["din"] for i in by_name] == [TITAN]
    by_number = harness.client.get("/genealogy/animals", params={"q": "000117"}).json()["items"]
    assert [i["din"] for i in by_number] == [PALOMA]
    males = harness.client.get("/genealogy/animals", params={"sex": "MACHO"}).json()["items"]
    assert males and all(i["sex"] == "MACHO" for i in males)


def test_create_animal_is_idempotent(harness):
    payload = {
        "clientEventId": str(uuid4()),
        "din": "din-demo-000120",
        "name": "Niebla",
        "sex": "HEMBRA",
        "birthDate": "2026-11-20",
    }
    first = harness.client.post("/genealogy/animals", json=payload)
    assert first.status_code == 201
    assert first.json()["syncStatus"] == "SYNCED"
    assert first.json()["din"] == "DIN-DEMO-000120"
    assert first.json()["origin"] == "PROPIO"
    again = harness.client.post("/genealogy/animals", json=payload)
    assert again.status_code == 200
    assert again.json()["syncStatus"] == "DUPLICADO"
    assert again.json()["id"] == first.json()["id"]


def test_create_animal_business_errors(harness):
    duplicate = harness.client.post("/genealogy/animals", json={
        "clientEventId": str(uuid4()), "din": AURORA, "name": "Otra", "sex": "HEMBRA",
        "birthDate": "2025-03-10",
    })
    assert duplicate.status_code == 409
    assert duplicate.json()["detail"]["code"] == "ANIMAL_ALREADY_REGISTERED"
    future = harness.client.post("/genealogy/animals", json={
        "clientEventId": str(uuid4()), "din": "DIN-DEMO-000121", "name": "Futura", "sex": "HEMBRA",
        "birthDate": "2999-01-01",
    })
    assert future.status_code == 422
    assert future.json()["detail"]["code"] == "BIRTH_DATE_IN_FUTURE"
    assert future.json()["detail"]["message"]


@pytest.mark.parametrize("payload", [
    {"din": "ABC-123", "name": "X", "sex": "MACHO", "birthDate": "2020-01-01"},
    {"din": "DIN-DEMO-000122", "name": "   ", "sex": "MACHO", "birthDate": "2020-01-01"},
    {"din": "DIN-DEMO-000122", "name": "X", "sex": "OTRO", "birthDate": "2020-01-01"},
    {"din": "DIN-DEMO-000122", "name": "X" * 121, "sex": "MACHO", "birthDate": "2020-01-01"},
])
def test_create_animal_schema_validation(harness, payload):
    response = harness.client.post("/genealogy/animals", json={"clientEventId": str(uuid4()), **payload})
    assert response.status_code == 422


# --------------------------------------------------------------- links (criterion 4)
def test_register_link_returns_camel_case_link_and_is_idempotent(harness):
    event_id = str(uuid4())
    first = post_link(harness.client, BRUMA, RAYO, "SIRE", event_id)
    assert first.status_code == 201
    body = first.json()
    assert body["syncStatus"] == "SYNCED"
    assert body["status"] == "VALIDADO"
    assert body["offspringDin"] == BRUMA and body["parentDin"] == RAYO
    assert body["parentRole"] == "SIRE" and body["sequenceNo"] == 1
    assert body["correctedEventId"] is None and body["validation"] is None
    assert body["clientEventId"] == event_id
    assert body["authorId"] == "7" and body["authorRole"] == "VETERINARIO"
    assert body["createdAt"]
    again = post_link(harness.client, BRUMA, RAYO, "SIRE", event_id)
    assert again.status_code == 200
    assert again.json()["syncStatus"] == "DUPLICADO"
    assert len(links_of(harness.client, BRUMA)) == 1


@pytest.mark.parametrize("offspring,parent,role,code", [
    (AURORA, BRUMA, "SIRE", "PARENT_BIRTH_DATE_NOT_BEFORE_OFFSPRING"),
    (TITAN, AURORA, "DAM", "GENEALOGY_CYCLE"),
    (BRUMA, LUCERO, "SIRE", "PARENT_SEX_MISMATCH"),
])
def test_acceptance_criterion_4_rejections(harness, offspring, parent, role, code):
    response = post_link(harness.client, offspring, parent, role)
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == code
    assert response.json()["detail"]["message"]


def test_register_link_not_found_and_occupied(harness):
    missing = post_link(harness.client, BRUMA, "DIN-DEMO-000999", "SIRE")
    assert missing.status_code == 404
    assert missing.json()["detail"]["code"] == "ANIMAL_NOT_FOUND"
    occupied = post_link(harness.client, AURORA, RAYO, "SIRE")
    assert occupied.status_code == 409
    assert occupied.json()["detail"]["code"] == "PARENT_ALREADY_REGISTERED"


def test_client_event_id_conflict(harness):
    event_id = str(uuid4())
    post_link(harness.client, BRUMA, RAYO, "SIRE", event_id)
    response = post_link(harness.client, BRUMA, TITAN, "SIRE", event_id)
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "CLIENT_EVENT_ID_CONFLICT"


def test_correction_keeps_original_as_corrected(harness):
    link_id = post_link(harness.client, BRUMA, RAYO, "SIRE").json()["id"]
    response = harness.client.post(f"/genealogy/links/{link_id}/corrections", json={
        "clientEventId": str(uuid4()), "parentDin": TITAN, "reason": "Prueba de parentesco por ADN",
    })
    assert response.status_code == 201
    new = response.json()
    assert new["correctedEventId"] == link_id
    assert new["correctionReason"] == "Prueba de parentesco por ADN"
    assert new["sequenceNo"] == 2 and new["parentDin"] == TITAN
    history = links_of(harness.client, BRUMA)
    assert [(i["id"], i["status"]) for i in history] == [(link_id, "CORREGIDO"), (new["id"], "VALIDADO")]


def test_correction_errors(harness):
    unknown = harness.client.post(f"/genealogy/links/{uuid4()}/corrections", json={
        "clientEventId": str(uuid4()), "parentDin": TITAN, "reason": "x",
    })
    assert unknown.status_code == 404
    assert unknown.json()["detail"]["code"] == "LINK_NOT_FOUND"
    link_id = post_link(harness.client, BRUMA, RAYO, "SIRE").json()["id"]
    no_reason = harness.client.post(f"/genealogy/links/{link_id}/corrections", json={
        "clientEventId": str(uuid4()), "parentDin": TITAN, "reason": " ",
    })
    assert no_reason.status_code == 422


def test_validation_of_pending_seed_link(harness):
    pending = [i for i in links_of(harness.client, RAYO) if i["parentRole"] == "DAM"][0]
    assert pending["status"] == "PENDIENTE_VALIDACION"
    response = harness.client.post(f"/genealogy/links/{pending['id']}/validations",
                                   json={"decision": "VALIDADO"})
    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "VALIDADO"
    assert body["validation"]["decision"] == "VALIDADO"
    assert body["validation"]["validatorId"] == "7"
    assert body["validation"]["validatedAt"]
    again = harness.client.post(f"/genealogy/links/{pending['id']}/validations",
                                json={"decision": "VALIDADO"})
    assert again.status_code == 409
    assert again.json()["detail"]["code"] == "LINK_NOT_PENDING"


def test_rejection_requires_reason_over_http(harness):
    pending = [i for i in links_of(harness.client, RAYO) if i["parentRole"] == "DAM"][0]
    response = harness.client.post(f"/genealogy/links/{pending['id']}/validations",
                                   json={"decision": "RECHAZADO"})
    assert response.status_code == 422


def test_links_of_unknown_animal_is_not_found(harness):
    response = harness.client.get("/genealogy/animals/DIN-DEMO-000999/links")
    assert response.status_code == 404
    assert response.json()["detail"]["code"] == "ANIMAL_NOT_FOUND"


def test_links_history_ordered_by_role_and_sequence(harness):
    items = links_of(harness.client, AURORA)
    assert [(i["parentRole"], i["sequenceNo"]) for i in items] == [("DAM", 1), ("SIRE", 1)]


# --------------------------------------------------------------- T025 tree (criterion 1)
def get_tree(client, din):
    return client.get(f"/genealogy/animals/{din}/tree")


def test_acceptance_criterion_1_complete_tree_of_aurora(harness):
    response = get_tree(harness.client, AURORA)
    assert response.status_code == 200
    tree = response.json()
    assert tree["din"] == AURORA and tree["name"] == "Aurora" and tree["birthDate"] == "2025-03-10"
    assert (tree["generationWindow"], tree["expectedCount"], tree["missingCount"]) == (3, 14, 0)
    assert tree["isComplete"] is True
    assert len(tree["positions"]) == 14
    assert all(p["status"] == "VALIDADO" and p["linkId"] for p in tree["positions"])
    first = tree["positions"][0]
    assert first["position"] == "sire" and first["generation"] == 1 and first["role"] == "SIRE"
    assert first["animal"] == {"din": TITAN, "name": "Titán", "sex": "MACHO", "birthDate": "2021-02-01"}
    assert tree["positions"][2]["animal"]["din"] == BRIOSO


def test_incomplete_tree_of_rayo(harness):
    tree = get_tree(harness.client, RAYO).json()
    by_position = {p["position"]: p for p in tree["positions"]}
    assert by_position["dam"]["status"] == "PENDIENTE_VALIDACION"
    assert by_position["dam"]["animal"]["din"] == PALOMA
    for position in ("dam.sire", "dam.dam", "dam.sire.sire", "dam.dam.dam"):
        assert by_position[position]["status"] == "NO_REGISTRADO"
        assert by_position[position]["animal"] is None and by_position[position]["linkId"] is None
    assert by_position["sire"]["status"] == "VALIDADO"
    assert tree["isComplete"] is False
    assert tree["missingCount"] == 6


def test_tree_shows_new_parent_after_correction_and_history_keeps_old(harness):
    aurora_sire = [i for i in links_of(harness.client, AURORA) if i["parentRole"] == "SIRE"][0]
    harness.client.post("/genealogy/animals", json={
        "clientEventId": str(uuid4()), "din": "DIN-DEMO-000140", "name": "Ébano", "sex": "MACHO",
        "birthDate": "2019-05-05",
    })
    harness.client.post(f"/genealogy/links/{aurora_sire['id']}/corrections", json={
        "clientEventId": str(uuid4()), "parentDin": "DIN-DEMO-000140", "reason": "Prueba de ADN",
    })
    tree = get_tree(harness.client, AURORA).json()
    assert tree["positions"][0]["animal"]["din"] == "DIN-DEMO-000140"
    assert tree["positions"][2]["status"] == "NO_REGISTRADO"
    history = [i for i in links_of(harness.client, AURORA) if i["parentRole"] == "SIRE"]
    assert history[0]["status"] == "CORREGIDO" and history[0]["parentDin"] == TITAN
    assert history[0]["authorId"] == "seed"
    assert history[1]["correctionReason"] == "Prueba de ADN"


def test_tree_of_unknown_animal_is_not_found(harness):
    response = get_tree(harness.client, "DIN-DEMO-000999")
    assert response.status_code == 404
    assert response.json()["detail"]["code"] == "ANIMAL_NOT_FOUND"


# --------------------------------------------------------------- T034 inbreeding (criteria 2 and 3)
PARTIAL = "CÁLCULO_PARCIAL_POR_DATOS_INSUFICIENTES"


def evaluate(client, sire, dam):
    return client.get("/genealogy/matings/evaluation", params={"sire_din": sire, "dam_din": dam})


def test_acceptance_criterion_2_half_siblings_rayo_x_aurora(harness):
    response = evaluate(harness.client, RAYO, AURORA)
    assert response.status_code == 200
    body = response.json()
    assert body["subject"] == "MATING" and body["din"] is None
    assert (body["sireDin"], body["damDin"]) == (RAYO, AURORA)
    assert body["warning"] is True
    assert body["coefficient"] == 0.125 and body["coefficientPercent"] == 12.5
    assert body["riskLevel"] == "ALTO"
    assert body["calculationStatus"] == PARTIAL
    assert body["coefficientIsMinimum"] is True
    assert body["includesPendingLinks"] is True
    assert body["reason"] is None and body["generationWindow"] == 3
    [ancestor] = body["commonAncestors"]
    assert ancestor["din"] == TITAN and ancestor["name"] == "Titán" and ancestor["contribution"] == 0.125
    assert ancestor["paths"] == [{
        "sireGenerations": 1, "damGenerations": 1,
        "sirePath": [RAYO, TITAN], "damPath": [AURORA, TITAN],
    }]
    assert {"candidate": "SIRE", "position": "dam.sire"} in body["missingAncestors"]
    assert len(body["missingAncestors"]) == 6
    assert "Titán" in body["message"] and "12,5 %" in body["message"]
    assert PARTIAL.encode("utf-8") in response.content


def test_father_daughter_titan_x_aurora_is_25_percent(harness):
    body = evaluate(harness.client, TITAN, AURORA).json()
    assert body["coefficient"] == 0.25 and body["coefficientPercent"] == 25.0
    ancestor = body["commonAncestors"][0]
    assert ancestor["din"] == TITAN
    assert ancestor["paths"][0]["sireGenerations"] == 0


def test_acceptance_criterion_3_lucero_without_parents(harness):
    response = harness.client.get(f"/genealogy/animals/{LUCERO}/inbreeding")
    assert response.status_code == 200
    body = response.json()
    assert body == {
        "subject": "ANIMAL",
        "din": LUCERO,
        "sireDin": None,
        "damDin": None,
        "calculationStatus": PARTIAL,
        "coefficient": None,
        "coefficientPercent": None,
        "coefficientIsMinimum": False,
        "warning": False,
        "riskLevel": None,
        "commonAncestors": [],
        "missingAncestors": [{"candidate": "SIRE", "position": "sire"},
                             {"candidate": "DAM", "position": "dam"}],
        "reason": "PARENTS_NOT_REGISTERED",
        "includesPendingLinks": False,
        "generationWindow": 3,
        "message": "Datos insuficientes: el animal no tiene padre y madre registrados. "
                   "No se puede confirmar ausencia de consanguinidad.",
    }
    assert PARTIAL.encode("utf-8") in response.content


def test_partial_without_common_ancestors_is_not_zero(harness):
    body = evaluate(harness.client, RAYO, LUCERO).json()
    assert body["calculationStatus"] == PARTIAL
    assert body["coefficient"] is None and body["warning"] is False
    assert {"candidate": "DAM", "position": "dam"} in body["missingAncestors"]


def _complete_candidate(harness, prefix, sex):
    """A candidate with 14 registered ancestors unrelated to anything else."""
    number = iter(range(1, 100))
    root = f"DIN-DEMO-{prefix}00"
    harness.add_animal(root, sex, "2024-01-01")
    frontier = [root]
    for year in (2018, 2012, 2006):
        nxt = []
        for child in frontier:
            for role, psex in (("SIRE", "MACHO"), ("DAM", "HEMBRA")):
                din = f"DIN-DEMO-{prefix}{next(number):02d}"
                harness.add_animal(din, psex, f"{year}-01-01")
                harness.add_link(child, din, role)
                nxt.append(din)
        frontier = nxt
    return root


def test_complete_trees_without_common_ancestors_are_complete_and_zero(harness):
    sire = _complete_candidate(harness, "7001", "MACHO")
    dam = _complete_candidate(harness, "8001", "HEMBRA")
    body = evaluate(harness.client, sire, dam).json()
    assert body["calculationStatus"] == "CÁLCULO_COMPLETO"
    assert body["coefficient"] == 0.0 and body["warning"] is False
    assert body["missingAncestors"] == [] and body["commonAncestors"] == []


@pytest.mark.parametrize("sire,dam", [(AURORA, AURORA), (AURORA, TITAN), (TITAN, RAYO)])
def test_invalid_mating_candidates(harness, sire, dam):
    response = evaluate(harness.client, sire, dam)
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "INVALID_MATING_CANDIDATES"


def test_unknown_candidate_is_not_found(harness):
    response = evaluate(harness.client, "DIN-DEMO-000999", AURORA)
    assert response.status_code == 404
    assert response.json()["detail"]["code"] == "ANIMAL_NOT_FOUND"
    assert harness.client.get("/genealogy/animals/DIN-DEMO-000999/inbreeding").status_code == 404
