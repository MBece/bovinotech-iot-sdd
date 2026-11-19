import socket

from app.features.sinigan.mock_adapter import MockSiniganAdapter


def test_mock_lookup_succeeds_when_network_is_forbidden(monkeypatch):
    def fail_if_network_is_used(*_args, **_kwargs):
        raise AssertionError("The SINIGAN mock attempted an external connection")

    monkeypatch.setattr(socket, "create_connection", fail_if_network_is_used)

    animal = MockSiniganAdapter().find_animal_by_din("DIN-DEMO-000001")

    assert animal["din"] == "DIN-DEMO-000001"
