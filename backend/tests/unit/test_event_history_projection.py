from datetime import datetime, timezone

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.database import Base
from app.features.sanitary_events.models import SanitaryEvent, SanitaryEventCorrection
from app.features.sanitary_events.service import SanitaryEventSyncService


def test_history_projection_orders_original_before_corrections():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine)()
    event = SanitaryEvent(
        client_event_id="00000000-0000-0000-0000-000000000001",
        din="DIN-DEMO-000001",
        event_type="CHECKUP",
        field_occurred_at=datetime.now(timezone.utc),
        author_email="operario@bovinotech.co",
        farm_id=1,
        notes="Original",
    )
    session.add(event)
    session.flush()
    session.add_all(
        [
            SanitaryEventCorrection(
                event_id=event.id,
                version=3,
                event_type="CHECKUP",
                field_occurred_at=event.field_occurred_at,
                notes="Tercera versión",
                reason="Segunda corrección justificada",
                author_email="vet@bovinotech.co",
            ),
            SanitaryEventCorrection(
                event_id=event.id,
                version=2,
                event_type="CHECKUP",
                field_occurred_at=event.field_occurred_at,
                notes="Segunda versión",
                reason="Primera corrección justificada",
                author_email="vet@bovinotech.co",
            ),
        ]
    )
    session.commit()

    history = SanitaryEventSyncService.get_history(event.din, session, 1)

    assert [item.version for item in history] == [1, 2, 3]
    assert history[0].notes == "Original"
    assert history[2].notes == "Tercera versión"
    session.close()
