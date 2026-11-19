from typing import Protocol


class SiniganAdapter(Protocol):
    """Port for a read-only external livestock registry reference."""

    def get_status(self) -> dict:
        """Return adapter availability and read capabilities."""

    def find_animal_by_din(self, din: str) -> dict | None:
        """Return an external animal reference or None when it does not exist."""
