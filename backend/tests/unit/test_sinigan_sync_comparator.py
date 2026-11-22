"""Unit tests for the pure HU-05 snapshot comparator."""

from copy import deepcopy

from app.features.sinigan_sync.comparator import compare_snapshots


def official_snapshot(**overrides):
    snapshot = {
        "din": "DIN-DEMO-000004",
        "species": "BUFALINO",
        "sex": "MACHO",
        "ageGroup": "ADULTO",
        "establishment": {
            "sitCode": "SIT-DEMO-002",
            "name": "Hacienda La Esperanza",
        },
    }
    snapshot.update(overrides)
    return snapshot


def field_snapshot(**overrides):
    snapshot = {
        "din": "DIN-DEMO-000004",
        "species": "BOVINO",
        "sex": "MACHO",
        "ageGroup": "ADULTO",
        "sitCode": "SIT-DEMO-001",
        "establishmentName": "Finca El Roble",
    }
    snapshot.update(overrides)
    return snapshot


def test_consistent_snapshots_return_no_discrepancies():
    official = official_snapshot(
        species="BOVINO",
        establishment={"sitCode": "SIT-DEMO-001", "name": "Finca El Roble"},
    )

    assert compare_snapshots(official, field_snapshot()) == []


def test_sex_discrepancy_contains_labels_and_values():
    official = official_snapshot(
        sex="MACHO",
        species="BOVINO",
        establishment={"sitCode": "SIT-DEMO-001", "name": "Finca El Roble"},
    )
    field = field_snapshot(
        sex="HEMBRA", species="BOVINO", sitCode="SIT-DEMO-001"
    )

    discrepancies = compare_snapshots(official, field)

    assert discrepancies == [
        {
            "field_name": "sex",
            "field_label": "Sexo",
            "official_value": "MACHO",
            "field_value": "HEMBRA",
        }
    ]


def test_species_and_nested_sit_code_are_compared():
    discrepancies = compare_snapshots(
        official_snapshot(), field_snapshot()
    )
    by_name = {item["field_name"]: item for item in discrepancies}

    assert set(by_name) == {"species", "sit_code"}
    assert by_name["species"]["field_label"] == "Especie"
    assert by_name["species"]["official_value"] == "BUFALINO"
    assert by_name["species"]["field_value"] == "BOVINO"
    assert by_name["sit_code"]["field_label"] == "Predio"
    assert by_name["sit_code"]["official_value"] == "SIT-DEMO-002"
    assert by_name["sit_code"]["field_value"] == "SIT-DEMO-001"


def test_age_group_accepts_snake_case_snapshots():
    official = official_snapshot(
        ageGroup="TERNERO",
        species="BOVINO",
        sex="HEMBRA",
        establishment={"sitCode": "SIT-DEMO-001", "name": "Finca El Roble"},
    )
    field = {
        "din": "DIN-DEMO-000003",
        "species": "BOVINO",
        "sex": "HEMBRA",
        "age_group": "ADULTO",
        "sit_code": "SIT-DEMO-001",
    }

    discrepancies = compare_snapshots(official, field)

    assert discrepancies[0]["field_name"] == "age_group"
    assert discrepancies[0]["field_label"] == "Grupo etario"
    assert discrepancies[0]["official_value"] == "TERNERO"
    assert discrepancies[0]["field_value"] == "ADULTO"


def test_comparator_does_not_mutate_inputs():
    official = official_snapshot()
    field = field_snapshot()
    official_before = deepcopy(official)
    field_before = deepcopy(field)

    compare_snapshots(official, field)

    assert official == official_before
    assert field == field_before
