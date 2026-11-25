"""Pure pedigree rules (no database): anti-cycle, tree and Wright coefficient."""
from datetime import date
from types import SimpleNamespace

import pytest

from app.features.genealogy.pedigree import (
    CALCULATION_COMPLETE,
    CALCULATION_PARTIAL,
    GENERATION_WINDOW,
    LinkFact,
    build_graph,
    creates_cycle,
)


def fact(offspring, parent, role, seq=1, status="VALIDADO", link_id=None):
    return LinkFact(
        id=link_id or f"{offspring}-{role}-{seq}",
        offspring_din=offspring,
        parent_din=parent,
        parent_role=role,
        sequence_no=seq,
        status=status,
    )


# --------------------------------------------------------------- T009 anti-cycle
LINEAGE = [
    fact("CHILD", "ROOT", "SIRE"),
    fact("GRANDCHILD", "CHILD", "DAM"),
    fact("GGCHILD", "GRANDCHILD", "SIRE"),
    fact("GGGCHILD", "GGCHILD", "DAM"),
    fact("ROOT", "ANCESTOR", "SIRE"),
]


def test_constants_match_data_model():
    assert GENERATION_WINDOW == 3
    assert CALCULATION_COMPLETE == "CÁLCULO_COMPLETO"
    assert CALCULATION_PARTIAL == "CÁLCULO_PARCIAL_POR_DATOS_INSUFICIENTES"


def test_parent_equal_to_offspring_is_a_cycle():
    assert creates_cycle(build_graph([]), "ROOT", "ROOT") is True


@pytest.mark.parametrize("descendant", ["CHILD", "GRANDCHILD", "GGCHILD", "GGGCHILD"])
def test_any_descendant_of_offspring_is_a_cycle_without_generation_limit(descendant):
    assert creates_cycle(build_graph(LINEAGE), "ROOT", descendant) is True


@pytest.mark.parametrize("candidate", ["UNRELATED", "ANCESTOR"])
def test_unrelated_animal_or_ancestor_is_not_a_cycle(candidate):
    assert creates_cycle(build_graph(LINEAGE), "ROOT", candidate) is False


@pytest.mark.parametrize("status", ["RECHAZADO", "CORREGIDO"])
def test_rejected_and_corrected_links_do_not_count(status):
    graph = build_graph([fact("CHILD", "ROOT", "SIRE", status=status)])
    assert creates_cycle(graph, "ROOT", "CHILD") is False


def test_pending_links_count_for_cycle_detection():
    graph = build_graph([fact("CHILD", "ROOT", "SIRE", status="PENDIENTE_VALIDACION")])
    assert creates_cycle(graph, "ROOT", "CHILD") is True


def test_graph_keeps_only_highest_sequence_when_it_is_current():
    graph = build_graph([
        fact("CHILD", "OLD", "SIRE", seq=1, status="CORREGIDO"),
        fact("CHILD", "NEW", "SIRE", seq=2, status="VALIDADO"),
    ])
    assert graph["CHILD"]["SIRE"].parent_din == "NEW"


def test_graph_has_no_current_link_when_highest_sequence_is_rejected():
    graph = build_graph([
        fact("CHILD", "OLD", "SIRE", seq=1, status="CORREGIDO"),
        fact("CHILD", "NEW", "SIRE", seq=2, status="RECHAZADO"),
    ])
    assert "SIRE" not in graph.get("CHILD", {})


# --------------------------------------------------------------- T024 three-generation tree
from app.features.genealogy.pedigree import POSITIONS, build_tree  # noqa: E402

EXPECTED_ORDER = [
    "sire", "dam",
    "sire.sire", "sire.dam", "dam.sire", "dam.dam",
    "sire.sire.sire", "sire.sire.dam", "sire.dam.sire", "sire.dam.dam",
    "dam.sire.sire", "dam.sire.dam", "dam.dam.sire", "dam.dam.dam",
]


def animal(din, sex="MACHO", birth=date(2000, 1, 1)):
    return SimpleNamespace(din=din, name=f"N-{din}", sex=sex, birth_date=birth)


def full_pedigree(root="X", depth=4):
    """Complete pedigree of ``depth`` generations above ``root``; node names are paths."""
    animals = {root: animal(root, "HEMBRA")}
    links = []
    frontier = [(root, root)]
    for _ in range(depth):
        nxt = []
        for din, path in frontier:
            for role, suffix, sex in (("SIRE", "s", "MACHO"), ("DAM", "d", "HEMBRA")):
                parent = f"{path}{suffix}"
                animals[parent] = animal(parent, sex)
                links.append(fact(din, parent, role))
                nxt.append((parent, parent))
        frontier = nxt
    return animals, links


def test_positions_are_fourteen_in_fixed_order():
    assert [p for p, _, _ in POSITIONS] == EXPECTED_ORDER


def test_complete_tree_has_fourteen_validated_positions():
    animals, links = full_pedigree()
    tree = build_tree("X", animals, build_graph(links))
    assert [p["position"] for p in tree["positions"]] == EXPECTED_ORDER
    assert [p["generation"] for p in tree["positions"]] == [1] * 2 + [2] * 4 + [3] * 8
    assert [p["role"] for p in tree["positions"]] == ["SIRE", "DAM"] * 7
    assert all(p["status"] == "VALIDADO" for p in tree["positions"])
    assert tree["positions"][0]["animal"]["din"] == "Xs"
    assert tree["positions"][13]["animal"]["din"] == "Xddd"
    assert (tree["expected_count"], tree["missing_count"], tree["is_complete"]) == (14, 0, True)
    assert tree["generation_window"] == 3
    assert tree["din"] == "X" and tree["sex"] == "HEMBRA"


def test_ancestors_beyond_third_generation_are_not_included():
    animals, links = full_pedigree(depth=4)
    tree = build_tree("X", animals, build_graph(links))
    dins = {p["animal"]["din"] for p in tree["positions"]}
    assert not any(len(din) > 4 for din in dins)


def test_empty_position_propagates_not_registered_to_its_ancestors():
    animals, links = full_pedigree()
    links = [l for l in links if not (l.offspring_din == "X" and l.parent_role == "SIRE")]
    tree = build_tree("X", animals, build_graph(links))
    by_position = {p["position"]: p for p in tree["positions"]}
    for position in ("sire", "sire.sire", "sire.dam", "sire.sire.sire", "sire.dam.dam"):
        assert by_position[position]["status"] == "NO_REGISTRADO"
        assert by_position[position]["animal"] is None
        assert by_position[position]["link_id"] is None
    assert by_position["dam"]["status"] == "VALIDADO"
    assert tree["missing_count"] == 7
    assert tree["is_complete"] is False


def test_pending_links_are_shown_and_rejected_or_corrected_excluded():
    animals = {d: animal(d) for d in ("X", "P1", "P2", "M1")}
    animals["M1"] = animal("M1", "HEMBRA")
    links = [
        fact("X", "P1", "SIRE", seq=1, status="CORREGIDO"),
        fact("X", "P2", "SIRE", seq=2, status="VALIDADO"),
        fact("X", "M1", "DAM", seq=1, status="PENDIENTE_VALIDACION"),
    ]
    tree = build_tree("X", animals, build_graph(links))
    sire, dam = tree["positions"][0], tree["positions"][1]
    assert sire["animal"]["din"] == "P2" and sire["link_id"] == "X-SIRE-2"
    assert dam["status"] == "PENDIENTE_VALIDACION" and dam["animal"]["din"] == "M1"
    rejected = build_tree("X", animals, build_graph([fact("X", "P1", "SIRE", status="RECHAZADO")]))
    assert rejected["positions"][0]["status"] == "NO_REGISTRADO"
    assert rejected["missing_count"] == 14


# --------------------------------------------------------------- T032/T033 Wright coefficient
from app.features.genealogy.pedigree import (  # noqa: E402
    RISK_HIGH_MIN,
    RISK_MODERATE_MIN,
    assess,
    assess_animal,
    classify_risk,
)


class Builder:
    """Synthetic pedigrees; ``fill`` completes 3 generations with unique ancestors."""

    def __init__(self):
        self.animals = {}
        self.parent_of = {}
        self.statuses = {}

    def add(self, din, sex):
        self.animals.setdefault(din, animal(din, sex))
        return din

    def parents(self, child, sire=None, dam=None, status="VALIDADO"):
        self.add(child, self.animals[child].sex if child in self.animals else "MACHO")
        for role, parent, sex in (("SIRE", sire, "MACHO"), ("DAM", dam, "HEMBRA")):
            if parent:
                self.add(parent, sex)
                self.parent_of[(child, role)] = parent
                self.statuses[(child, role)] = status
        return self

    def fill(self, din, depth=3):
        if depth == 0:
            return self
        for role, sex in (("SIRE", "MACHO"), ("DAM", "HEMBRA")):
            if (din, role) not in self.parent_of:
                parent = self.add(f"{din}>{role[0]}", sex)
                self.parent_of[(din, role)] = parent
                self.statuses[(din, role)] = "VALIDADO"
            self.fill(self.parent_of[(din, role)], depth - 1)
        return self

    def graph(self):
        return build_graph([
            fact(child, parent, role, status=self.statuses[(child, role)])
            for (child, role), parent in self.parent_of.items()
        ])

    def assess(self, sire="S", dam="D", fill=True):
        self.add(sire, "MACHO")
        self.add(dam, "HEMBRA")
        if fill:
            self.fill(sire).fill(dam)
        return assess(sire, dam, self.animals, self.graph())


def test_full_siblings_is_25_percent():
    result = Builder().parents("S", "X", "Y").parents("D", "X", "Y").assess()
    assert result["coefficient"] == 0.25
    assert result["coefficient_percent"] == 25.0
    assert result["calculation_status"] == CALCULATION_COMPLETE
    assert result["coefficient_is_minimum"] is False
    assert [a["din"] for a in result["common_ancestors"]] == ["X", "Y"]
    assert all(a["contribution"] == 0.125 for a in result["common_ancestors"])


def test_father_daughter_is_25_percent_with_candidate_as_common_ancestor():
    b = Builder()
    b.add("S", "MACHO")
    result = b.parents("D", "S", "Y").assess()
    assert result["coefficient"] == 0.25
    [ancestor] = result["common_ancestors"]
    assert ancestor["din"] == "S"
    assert ancestor["paths"] == [{
        "sire_generations": 0, "dam_generations": 1, "sire_path": ["S"], "dam_path": ["D", "S"],
    }]


def test_half_siblings_is_12_5_percent_and_ancestors_of_the_common_ancestor_do_not_add():
    result = Builder().parents("S", "X", "Y1").parents("D", "X", "Y2").assess()
    assert result["coefficient"] == 0.125
    assert result["coefficient_percent"] == 12.5
    assert [a["din"] for a in result["common_ancestors"]] == ["X"]
    assert result["common_ancestors"][0]["paths"][0]["sire_path"] == ["S", "X"]


def test_double_first_cousins_is_12_5_percent():
    b = Builder()
    b.parents("SA", "G1", "G2").parents("DA", "G1", "G2")   # full brothers
    b.parents("SB", "G3", "G4").parents("DB", "G3", "G4")   # full sisters
    b.animals["SB"] = animal("SB", "HEMBRA")
    b.animals["DB"] = animal("DB", "HEMBRA")
    result = b.parents("S", "SA", "SB").parents("D", "DA", "DB").assess()
    assert result["coefficient"] == 0.125
    assert {a["din"] for a in result["common_ancestors"]} == {"G1", "G2", "G3", "G4"}


def test_first_cousins_is_6_25_percent():
    b = Builder().parents("SA", "G1", "G2").parents("DA", "G1", "G2")
    result = b.parents("S", "SA", "SB").parents("D", "DA", "DB").assess()
    assert result["coefficient"] == 0.0625
    assert result["coefficient_percent"] == 6.25
    assert result["risk_level"] == "MODERADO"


def test_half_first_cousins_is_3_125_percent():
    b = Builder().parents("SA", "G1", "G2").parents("DA", "G1", "G3")
    result = b.parents("S", "SA", "SB").parents("D", "DA", "DB").assess()
    assert result["coefficient"] == 0.03125
    assert result["coefficient_percent"] == 3.125
    assert result["risk_level"] == "BAJO"


def test_second_cousins_is_1_5625_percent_inside_the_candidate_window():
    b = Builder().parents("SAA", "H1", "H2").parents("DAA", "H1", "H2")
    b.parents("SA", "SAA", "SAB").parents("DA", "DAA", "DAB")
    result = b.parents("S", "SA", "SB").parents("D", "DA", "DB").assess()
    assert result["coefficient"] == 0.015625
    assert result["coefficient_percent"] == 1.5625
    assert result["warning"] is True
    assert result["risk_level"] == "BAJO"


def test_no_common_ancestors_with_complete_trees_is_zero_and_complete():
    result = Builder().assess()
    assert result["coefficient"] == 0.0
    assert result["coefficient_percent"] == 0.0
    assert result["calculation_status"] == CALCULATION_COMPLETE
    assert result["warning"] is False
    assert result["risk_level"] is None
    assert result["common_ancestors"] == []
    assert result["missing_ancestors"] == []
    assert "3 generaciones" in result["message"]


def test_several_common_ancestors_ordered_by_contribution_then_din():
    b = Builder()
    b.parents("SB", "Z", "W1").parents("DB", "Z", "W2")      # dams are half sisters via Z
    b.animals["SB"] = animal("SB", "HEMBRA")
    b.animals["DB"] = animal("DB", "HEMBRA")
    result = b.parents("S", "X", "SB").parents("D", "X", "DB").assess()
    assert [(a["din"], a["contribution"]) for a in result["common_ancestors"]] == [
        ("X", 0.125), ("Z", 0.03125),
    ]
    assert result["coefficient"] == 0.15625


# --------------------------------------------------------------- T033 insufficient data and risk
def test_partial_with_common_ancestor_reports_minimum_coefficient():
    result = Builder().parents("S", "X", "Y1").parents("D", "X", "Y2").assess(fill=False)
    assert result["calculation_status"] == CALCULATION_PARTIAL
    assert result["coefficient"] == 0.125
    assert result["coefficient_is_minimum"] is True
    assert result["warning"] is True
    assert "mínimo" in result["message"]


def test_partial_without_common_ancestors_never_reports_zero():
    result = Builder().parents("S", "X").assess(fill=False)
    assert result["calculation_status"] == CALCULATION_PARTIAL
    assert result["coefficient"] is None
    assert result["coefficient_percent"] is None
    assert result["coefficient_is_minimum"] is False
    assert result["warning"] is False
    assert result["risk_level"] is None
    assert "No se puede confirmar ausencia de consanguinidad" in result["message"]


def test_missing_ancestors_lists_every_empty_position_per_candidate():
    b = Builder()
    b.add("S", "MACHO")
    b.add("D", "HEMBRA")
    b.fill("D")
    result = assess("S", "D", b.animals, b.graph())
    assert result["missing_ancestors"] == [{"candidate": "SIRE", "position": p} for p in EXPECTED_ORDER]


def test_animal_without_parents_reports_parents_not_registered():
    b = Builder()
    b.add("L", "HEMBRA")
    result = assess_animal("L", b.animals, b.graph())
    assert result["subject"] == "ANIMAL" and result["din"] == "L"
    assert result["sire_din"] is None and result["dam_din"] is None
    assert result["calculation_status"] == CALCULATION_PARTIAL
    assert result["coefficient"] is None
    assert result["reason"] == "PARENTS_NOT_REGISTERED"
    assert result["missing_ancestors"] == [
        {"candidate": "SIRE", "position": "sire"}, {"candidate": "DAM", "position": "dam"},
    ]


def test_animal_indicator_is_the_mating_of_its_parents():
    b = Builder().parents("S", "X", "Y1").parents("D", "X", "Y2")
    b.add("S", "MACHO")
    b.fill("S").fill("D")
    b.parents("C", "S", "D")
    result = assess_animal("C", b.animals, b.graph())
    assert result["subject"] == "ANIMAL"
    assert (result["sire_din"], result["dam_din"]) == ("S", "D")
    assert result["coefficient"] == 0.125
    assert result["reason"] is None


def test_includes_pending_links_flag():
    b = Builder().parents("S", "X", "Y1", status="PENDIENTE_VALIDACION").parents("D", "X", "Y2")
    assert b.assess()["includes_pending_links"] is True
    assert Builder().parents("S", "X", "Y1").parents("D", "X", "Y2").assess()["includes_pending_links"] is False


def test_risk_thresholds_are_exact():
    assert (RISK_HIGH_MIN, RISK_MODERATE_MIN) == (0.125, 0.0625)
    assert classify_risk(0.125) == "ALTO"
    assert classify_risk(0.124) == "MODERADO"
    assert classify_risk(0.0625) == "MODERADO"
    assert classify_risk(0.03125) == "BAJO"
    assert classify_risk(0.0) is None
    assert classify_risk(None) is None


def test_result_shape_for_mating():
    result = Builder().assess()
    assert result["subject"] == "MATING" and result["din"] is None
    assert (result["sire_din"], result["dam_din"]) == ("S", "D")
    assert result["generation_window"] == GENERATION_WINDOW
    assert result["reason"] is None
