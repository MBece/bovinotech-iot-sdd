from datetime import datetime, timezone

from app.features.sinigan.adapter import SiniganAdapter
from app.features.sinigan.mock_adapter import MockSiniganAdapter


class SiniganService:
    def __init__(self, adapter: SiniganAdapter):
        self.adapter = adapter

    @staticmethod
    def simulation_meta() -> dict:
        return {
            "sourceSystem": "SINIGAN",
            "sourceMode": "SIMULADO",
            "isSimulation": True,
            "contractVersion": "1.0",
            "retrievedAt": datetime.now(timezone.utc),
        }

    def status(self) -> dict:
        return {"meta": self.simulation_meta(), "data": self.adapter.get_status()}

    def find_animal(self, din: str) -> dict | None:
        animal = self.adapter.find_animal_by_din(din)
        if animal is None:
            return None
        return {"meta": self.simulation_meta(), "data": animal}


sinigan_service = SiniganService(MockSiniganAdapter())
