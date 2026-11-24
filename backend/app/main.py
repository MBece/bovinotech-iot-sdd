from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.database import Base, engine
from app.features.auth.models import User  # noqa: F401
from app.features.auth.router import router as auth_router, seed_initial_users
from app.features.auth.schema_migration import ensure_auth_schema
from app.features.sanitary_events.models import (  # noqa: F401
    SanitaryEvent,
    SanitaryEventCorrection,
)
from app.features.sanitary_events.router import (
    events_router as sanitary_events_router,
    router as sync_router,
)
from app.features.sanitary_events.schema_migration import (
    ensure_sanitary_events_schema,
)
from app.features.sinigan.router import router as sinigan_router
from app.features.sinigan_sync.models import (  # noqa: F401
    FieldAnimalRecord,
    ReconciliationDiscrepancy,
    ReconciliationResolution,
    ReconciliationTicket,
)
from app.features.sinigan_sync.router import router as sinigan_sync_router
from app.features.sinigan_sync.schema_migration import (
    ensure_sinigan_sync_schema,
)
from app.features.sinigan_sync.service import seed_field_animals

# Create tables and execute seeds
Base.metadata.create_all(bind=engine)
ensure_auth_schema(engine)
ensure_sanitary_events_schema(engine)
ensure_sinigan_sync_schema(engine)
seed_initial_users()
seed_field_animals()

app = FastAPI(title="BovinoTech IoT API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router, prefix="/auth", tags=["Authentication"])
app.include_router(
    sinigan_router,
    prefix="/integrations/sinigan",
    tags=["SINIGAN simulado"],
)
app.include_router(
    sinigan_sync_router,
    prefix="/integrations/sinigan-sync",
    tags=["Conciliación SINIGAN simulada"],
)
app.include_router(sync_router, prefix="/sync", tags=["Sincronización"])
app.include_router(
    sanitary_events_router,
    prefix="/sanitary-events",
    tags=["Eventos sanitarios"],
)


@app.get("/health")
def health_check():
    return {"status": "ok", "system": "BovinoTech IoT", "sinigan_mode": "V6-ready"}
