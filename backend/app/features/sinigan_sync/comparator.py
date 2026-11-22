"""Pure snapshot comparison rules for HU-05.

This module has no database, network or side effects. It compares only the
four fields defined by the contract and never mutates its inputs.
"""

from typing import Any

COMPARISON_FIELDS = ("species", "sex", "age_group", "sit_code")

FIELD_LABELS = {
    "species": "Especie",
    "sex": "Sexo",
    "age_group": "Grupo etario",
    "sit_code": "Predio",
}


def _read_field(snapshot: dict[str, Any], field_name: str) -> Any:
    if field_name == "age_group":
        return snapshot.get("age_group", snapshot.get("ageGroup"))
    if field_name == "sit_code":
        direct = snapshot.get("sit_code", snapshot.get("sitCode"))
        if direct is not None:
            return direct
        establishment = snapshot.get("establishment") or {}
        return establishment.get("sitCode", establishment.get("sit_code"))
    return snapshot.get(field_name)


def _normalize(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip().upper()


def compare_snapshots(
    official_snapshot: dict[str, Any],
    field_snapshot: dict[str, Any],
) -> list[dict[str, str]]:
    """Return one discrepancy entry per differing contract field."""

    discrepancies: list[dict[str, str]] = []
    for field_name in COMPARISON_FIELDS:
        official_value = _normalize(_read_field(official_snapshot, field_name))
        field_value = _normalize(_read_field(field_snapshot, field_name))
        if official_value != field_value:
            discrepancies.append(
                {
                    "field_name": field_name,
                    "field_label": FIELD_LABELS[field_name],
                    "official_value": official_value,
                    "field_value": field_value,
                }
            )
    return discrepancies
