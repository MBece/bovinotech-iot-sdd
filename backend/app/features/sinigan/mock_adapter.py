import json
from copy import deepcopy
from pathlib import Path


class MockSiniganAdapter:
    """Deterministic adapter backed only by local, fictional fixtures."""

    def __init__(self, fixtures_path: Path | None = None):
        path = fixtures_path or Path(__file__).parent / "fixtures" / "animals.json"
        with path.open("r", encoding="utf-8") as fixture_file:
            animals = json.load(fixture_file)
        self._animals = {animal["din"]: animal for animal in animals}

    def get_status(self) -> dict:
        return {
            "available": True,
            "adapter": self.__class__.__name__,
            "capabilities": ["animals.read"],
        }

    def find_animal_by_din(self, din: str) -> dict | None:
        animal = self._animals.get(din.upper())
        return deepcopy(animal) if animal else None
