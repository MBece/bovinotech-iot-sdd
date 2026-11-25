"""Pure pedigree rules for HU-07 (no I/O).

* Graph of current parent links and anti-cycle detection (research.md R6).
* Three-generation tree with 14 fixed positions (data-model.md, PedigreeTree).
* Wright path coefficient with path independence (research.md R3-R5).
"""
from __future__ import annotations

from collections import deque
from dataclasses import dataclass
from fractions import Fraction
from typing import Iterable, Mapping

GENERATION_WINDOW = 3
CALCULATION_COMPLETE = "CÁLCULO_COMPLETO"
CALCULATION_PARTIAL = "CÁLCULO_PARCIAL_POR_DATOS_INSUFICIENTES"
RISK_HIGH_MIN = 0.125
RISK_MODERATE_MIN = 0.0625

VALIDATED = "VALIDADO"
PENDING = "PENDIENTE_VALIDACION"
NOT_REGISTERED = "NO_REGISTRADO"
CURRENT_STATUSES = frozenset({VALIDATED, PENDING})
ROLES = ("SIRE", "DAM")


@dataclass(frozen=True)
class LinkFact:
    """A parent link with its derived status (CORREGIDO > decision > initial)."""

    id: str
    offspring_din: str
    parent_din: str
    parent_role: str
    sequence_no: int
    status: str


Graph = dict[str, dict[str, LinkFact]]


def build_graph(links: Iterable[LinkFact]) -> Graph:
    """offspring -> role -> current link.

    The current link of a position is the one with the highest sequence number,
    provided its status is VALIDADO or PENDIENTE_VALIDACION; if the latest one
    is RECHAZADO (or CORREGIDO) the position has no current link.
    """
    latest: dict[tuple[str, str], LinkFact] = {}
    for link in links:
        key = (link.offspring_din, link.parent_role)
        if key not in latest or link.sequence_no > latest[key].sequence_no:
            latest[key] = link
    graph: Graph = {}
    for (offspring, role), link in latest.items():
        if link.status in CURRENT_STATUSES:
            graph.setdefault(offspring, {})[role] = link
    return graph


def _children(graph: Graph) -> dict[str, set[str]]:
    children: dict[str, set[str]] = {}
    for offspring, parents in graph.items():
        for link in parents.values():
            children.setdefault(link.parent_din, set()).add(offspring)
    return children


def creates_cycle(graph: Graph, offspring_din: str, parent_din: str) -> bool:
    """True if ``parent_din`` is the offspring itself or any of its descendants.

    Breadth-first search down from the offspring over every current link,
    without a generation limit.
    """
    if parent_din == offspring_din:
        return True
    children = _children(graph)
    seen = {offspring_din}
    queue = deque([offspring_din])
    while queue:
        for child in children.get(queue.popleft(), ()):
            if child == parent_din:
                return True
            if child not in seen:
                seen.add(child)
                queue.append(child)
    return False


# --------------------------------------------------------------- three-generation tree
def _enumerate_positions(window: int) -> list[tuple[str, int, str]]:
    """(position, generation, role) in fixed order: by generation, sire first."""
    positions: list[tuple[str, int, str]] = []
    frontier = [""]
    for generation in range(1, window + 1):
        next_frontier = []
        for prefix in frontier:
            for role in ROLES:
                path = f"{prefix}.{role.lower()}" if prefix else role.lower()
                positions.append((path, generation, role))
                next_frontier.append(path)
        frontier = next_frontier
    return positions


POSITIONS = _enumerate_positions(GENERATION_WINDOW)
EXPECTED_POSITIONS = len(POSITIONS)


def _animal_view(animal) -> dict:
    return {
        "din": animal.din,
        "name": animal.name,
        "sex": animal.sex,
        "birth_date": animal.birth_date,
    }


def resolve_positions(din: str, animals: Mapping[str, object], graph: Graph) -> list[dict]:
    """The 14 positions above ``din``. An empty position makes every position
    above it NO_REGISTRADO as well (nothing is hidden or invented)."""
    resolved: dict[str, str | None] = {"": din}
    result = []
    for position, generation, role in POSITIONS:
        parent_path = position.rpartition(".")[0]
        child = resolved.get(parent_path)
        link = graph.get(child, {}).get(role) if child else None
        parent = animals.get(link.parent_din) if link else None
        if link is None or parent is None:
            resolved[position] = None
            result.append({
                "position": position, "generation": generation, "role": role,
                "status": NOT_REGISTERED, "link_id": None, "animal": None,
            })
            continue
        resolved[position] = link.parent_din
        result.append({
            "position": position, "generation": generation, "role": role,
            "status": link.status, "link_id": link.id, "animal": _animal_view(parent),
        })
    return result


def build_tree(din: str, animals: Mapping[str, object], graph: Graph) -> dict:
    positions = resolve_positions(din, animals, graph)
    missing = sum(1 for p in positions if p["status"] == NOT_REGISTERED)
    return {
        **_animal_view(animals[din]),
        "generation_window": GENERATION_WINDOW,
        "expected_count": EXPECTED_POSITIONS,
        "missing_count": missing,
        "is_complete": missing == 0,
        "positions": positions,
    }


# --------------------------------------------------------------- Wright coefficient
PARENTS_NOT_REGISTERED = "PARENTS_NOT_REGISTERED"


def classify_risk(coefficient: float | None) -> str | None:
    """ALTO >= 12.5 %, MODERADO >= 6.25 %, BAJO > 0; no level otherwise (R5)."""
    if coefficient is None or coefficient <= 0:
        return None
    if coefficient >= RISK_HIGH_MIN:
        return "ALTO"
    if coefficient >= RISK_MODERATE_MIN:
        return "MODERADO"
    return "BAJO"


def format_percent(value) -> str:
    """Spanish decimal comma without trailing zeros: 0.125 -> '12,5'."""
    text = f"{float(value) * 100:.4f}".rstrip("0").rstrip(".")
    return text.replace(".", ",")


def _window(candidate: str, animals: Mapping[str, object], graph: Graph):
    """Ascending paths (candidate itself included) and window bookkeeping."""
    positions = resolve_positions(candidate, animals, graph)
    resolved = {"": candidate}
    paths: dict[str, list[list[str]]] = {candidate: [[candidate]]}
    for item in positions:
        if item["animal"] is None:
            continue
        resolved[item["position"]] = item["animal"]["din"]
        segments = item["position"].split(".")
        path = [candidate] + [resolved[".".join(segments[: i + 1])] for i in range(len(segments))]
        paths.setdefault(path[-1], []).append(path)
    missing = [p["position"] for p in positions if p["status"] == NOT_REGISTERED]
    pending = any(p["status"] == PENDING for p in positions)
    return paths, missing, pending


def _common_ancestors(sire_paths, dam_paths, animals) -> list[dict]:
    ancestors = []
    for din in set(sire_paths) & set(dam_paths):
        contribution = Fraction(0)
        pairs = []
        for p1 in sire_paths[din]:
            for p2 in dam_paths[din]:
                # Path independence: the two paths may only meet at the ancestor.
                if set(p1) & set(p2) != {din}:
                    continue
                n1, n2 = len(p1) - 1, len(p2) - 1
                contribution += Fraction(1, 2 ** (n1 + n2 + 1))
                pairs.append({
                    "sire_generations": n1, "dam_generations": n2,
                    "sire_path": p1, "dam_path": p2,
                })
        if pairs:
            ancestors.append({
                "din": din,
                "name": animals[din].name,
                "contribution": contribution,
                "paths": sorted(pairs, key=lambda p: (p["sire_generations"] + p["dam_generations"],
                                                      p["sire_path"], p["dam_path"])),
            })
    ancestors.sort(key=lambda a: (-a["contribution"], a["din"]))
    return ancestors


def _message(common, coefficient, partial, reason) -> str:
    if reason == PARENTS_NOT_REGISTERED:
        return ("Datos insuficientes: el animal no tiene padre y madre registrados. "
                "No se puede confirmar ausencia de consanguinidad.")
    if common:
        label = "ancestro común" if len(common) == 1 else "ancestros comunes"
        names = ", ".join(f"{a['name']} ({a['din']})" for a in common)
        qualifier = "mínimo " if partial else ""
        return (f"Advertencia de consanguinidad: {label} {names}. "
                f"Coeficiente estimado {qualifier}{format_percent(coefficient)} %.")
    if partial:
        return (f"Datos insuficientes: faltan ancestros dentro de {GENERATION_WINDOW} generaciones. "
                "No se puede confirmar ausencia de consanguinidad.")
    return (f"No se detectan ancestros comunes dentro de {GENERATION_WINDOW} generaciones "
            "(cálculo completo).")


def _result(subject, din, sire_din, dam_din, common, missing, pending, reason=None) -> dict:
    partial = bool(missing) or reason is not None
    if common:
        exact = sum((a["contribution"] for a in common), start=Fraction(0))
        coefficient = float(exact)
        percent = float(exact * 100)
    elif partial:
        coefficient = percent = None
    else:
        coefficient = percent = 0.0
    return {
        "subject": subject,
        "din": din,
        "sire_din": sire_din,
        "dam_din": dam_din,
        "calculation_status": CALCULATION_PARTIAL if partial else CALCULATION_COMPLETE,
        "coefficient": coefficient,
        "coefficient_percent": percent,
        "coefficient_is_minimum": partial and coefficient is not None,
        "warning": bool(common),
        "risk_level": classify_risk(coefficient),
        "common_ancestors": [{**a, "contribution": float(a["contribution"])} for a in common],
        "missing_ancestors": missing,
        "reason": reason,
        "includes_pending_links": pending,
        "generation_window": GENERATION_WINDOW,
        "message": _message(common, coefficient, partial, reason),
    }


def assess(sire_din: str, dam_din: str, animals: Mapping[str, object], graph: Graph,
           subject: str = "MATING", din: str | None = None) -> dict:
    """Wright coefficient of the hypothetical offspring of sire x dam, with the
    window counted from each candidate (Q2) and F_A = 0 (estimated value)."""
    sire_paths, sire_missing, sire_pending = _window(sire_din, animals, graph)
    dam_paths, dam_missing, dam_pending = _window(dam_din, animals, graph)
    missing = ([{"candidate": "SIRE", "position": p} for p in sire_missing]
               + [{"candidate": "DAM", "position": p} for p in dam_missing])
    common = _common_ancestors(sire_paths, dam_paths, animals)
    return _result(subject, din, sire_din, dam_din, common, missing, sire_pending or dam_pending)


def assess_animal(din: str, animals: Mapping[str, object], graph: Graph) -> dict:
    """Individual indicator: the mating of the animal's current sire and dam."""
    parents = graph.get(din, {})
    found = {}
    pending = False
    for role in ROLES:
        link = parents.get(role)
        if link is not None and link.parent_din in animals:
            found[role] = link.parent_din
            pending = pending or link.status == PENDING
    if len(found) == 2:
        result = assess(found["SIRE"], found["DAM"], animals, graph, subject="ANIMAL", din=din)
        result["includes_pending_links"] = result["includes_pending_links"] or pending
        return result
    missing = []
    for role in ROLES:
        if role not in found:
            missing.append({"candidate": role, "position": role.lower()})
            continue
        _, window_missing, window_pending = _window(found[role], animals, graph)
        pending = pending or window_pending
        missing.extend({"candidate": role, "position": p} for p in window_missing)
    return _result("ANIMAL", din, found.get("SIRE"), found.get("DAM"), [], missing, pending,
                   reason=PARENTS_NOT_REGISTERED)
