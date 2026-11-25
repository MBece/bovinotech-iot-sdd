from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.database import Base, SessionLocal, engine
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
from app.features.offline_capture.models import CatalogAnimal  # noqa: F401
from app.features.offline_capture.router import router as offline_capture_router
from app.features.offline_capture.service import seed_catalog
from app.features.offline_sync.models import (  # noqa: F401
    OfflineSyncBatchLog,
    OfflineSyncEvent,
    OfflineSyncIdConflict,
)
from app.features.offline_sync.router import router as offline_sync_router
from app.features.offline_sync.schema_migration import ensure_offline_sync_schema
from app.features.observability_ops.middleware import CorrelationIdMiddleware
from app.features.observability_ops.router import router as ops_router
from app.features.telemetry.models import (  # noqa: F401
    AlertClosure,
    AlertRuleVersion,
    GeofenceVersion,
    TelemetryAlert,
    TelemetryBatch,
    TelemetryDevice,
    TelemetryEvaluation,
    TelemetryReading,
)
from app.features.telemetry.router import router as telemetry_router
from app.features.telemetry.schema_migration import ensure_telemetry_schema
from app.features.telemetry.seed import seed_telemetry

# Create tables and execute seeds
Base.metadata.create_all(bind=engine)
ensure_auth_schema(engine)
ensure_sanitary_events_schema(engine)
ensure_sinigan_sync_schema(engine)
ensure_offline_sync_schema(engine)
ensure_telemetry_schema(engine)
seed_initial_users()
seed_field_animals()
seed_catalog()
with SessionLocal() as telemetry_seed_db:
    seed_telemetry(telemetry_seed_db)

app = FastAPI(title="BovinoTech IoT API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(CorrelationIdMiddleware)

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
app.include_router(
    offline_capture_router,
    prefix="/offline-capture",
    tags=["Captura offline"],
)
app.include_router(
    offline_sync_router,
    prefix="/offline-sync",
    tags=["Sincronización offline"],
)
app.include_router(ops_router)
app.include_router(telemetry_router, prefix="/telemetry", tags=["Telemetría y alertas"])


@app.get("/health")
def health_check():
    return {"status": "ok", "system": "BovinoTech IoT", "sinigan_mode": "V6-ready"}
