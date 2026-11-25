from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.database import Base
from app.features.auth.models import User, UserRole
from app.features.sanitary_events.schemas import SyncBatchRequest, SyncEventItem
from app.features.sanitary_events.service import SanitaryEventSyncService
from app.features.sinigan.mock_adapter import MockSiniganAdapter


def test_processing_same_client_event_twice_creates_one_record():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine)()
    user = User(email="unit@bovinotech.test", role=UserRole.OPERARIO)
    item = SyncEventItem(
        clientEventId=uuid4(),
        din="DIN-DEMO-000001",
        eventType="CHECKUP",
        fieldOccurredAt=datetime.now(timezone.utc),
        finding="Sin hallazgos",
    )
    batch = SyncBatchRequest(items=[item])
    service = SanitaryEventSyncService(MockSiniganAdapter())

    first = service.process_batch(batch, user, session)
    second = service.process_batch(batch, user, session)

    assert first[0].status == "SINCRONIZADO"
    assert second[0].status == "DUPLICADO"
    assert first[0].event_id == second[0].event_id
    session.close()
