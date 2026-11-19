from app.features.sinigan.mock_adapter import MockSiniganAdapter
from app.features.sinigan.service import SiniganService


def test_mock_adapter_returns_deterministic_fictional_animal():
    adapter = MockSiniganAdapter()

    first = adapter.find_animal_by_din("DIN-DEMO-000001")
    second = adapter.find_animal_by_din("DIN-DEMO-000001")

    assert first == second
    assert first is not second
    assert first["animalName"] == "Luna"
    assert first["establishment"]["sitCode"].startswith("SIT-DEMO-")


def test_mock_adapter_does_not_invent_unknown_din():
    assert MockSiniganAdapter().find_animal_by_din("DIN-DEMO-999999") is None


def test_service_marks_every_response_as_simulation():
    response = SiniganService(MockSiniganAdapter()).find_animal("DIN-DEMO-000001")

    assert response["meta"]["sourceSystem"] == "SINIGAN"
    assert response["meta"]["sourceMode"] == "SIMULADO"
    assert response["meta"]["isSimulation"] is True
    assert response["meta"]["contractVersion"] == "1.0"
    assert response["meta"]["retrievedAt"] is not None
