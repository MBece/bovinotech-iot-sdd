import json
from pathlib import Path


def test_fixtures_are_explicitly_fictional_and_use_demo_identifiers():
    fixture_path = (
        Path(__file__).parents[2]
        / "app"
        / "features"
        / "sinigan"
        / "fixtures"
        / "animals.json"
    )
    animals = json.loads(fixture_path.read_text(encoding="utf-8"))

    assert len(animals) >= 5
    assert all(animal["din"].startswith("DIN-DEMO-") for animal in animals)
    assert all(animal["animalName"].strip() for animal in animals)
    assert all(
        animal["establishment"]["sitCode"].startswith("SIT-DEMO-")
        for animal in animals
    )
