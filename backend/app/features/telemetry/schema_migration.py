from app.core.database import Base


def ensure_telemetry_schema(engine) -> None:
    Base.metadata.create_all(bind=engine)

