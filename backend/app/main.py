"""BovinoTech IoT API — application entry point.

This file imports and registers every feature module.  Modules that exist only
on the ``main`` branch (offline_capture, offline_sync, observability_ops,
sanitary_events.schema_migration) are imported via ``_try_import`` so that the
application can start on both ``develop`` and ``main`` without modification.
When a module is absent its seed and router are simply skipped, which is safe
for development and test environments.
"""

import importlib
from typing import Any

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
from app.features.kpi_dashboard.router import router as kpi_dashboard_router
from app.features.kpi_dashboard.models import AnimalWeight  # noqa: F401
from app.features.kpi_dashboard.seed import seed_animal_weights


# ── Optional imports (main-only modules) ────────────────────────────────────

def _try_import(mod_path: str) -> Any:
    """Return the module or None when it does not exist (graceful cross-branch)."""
    try:
        return importlib.import_module(mod_path)
    except ModuleNotFoundError:
        return None


# sanitary_events schema_migration (exists on main only)
_se_schema = _try_import("app.features.sanitary_events.schema_migration")
ensure_sanitary_events_schema = (
    getattr(_se_schema, "ensure_sanitary_events_schema", lambda e: None)
    if _se_schema
    else lambda e: None
)

# offline_capture (main only)
_offline_cap = _try_import("app.features.offline_capture")
if _offline_cap:
    from app.features.offline_capture.models import CatalogAnimal  # noqa: F401
    from app.features.offline_capture.router import router as offline_capture_router
    from app.features.offline_capture.service import seed_catalog
else:
    CatalogAnimal = None  # type: ignore
    offline_capture_router = None
    seed_catalog = lambda: 0  # noqa: E731

# offline_sync (main only)
_offline_sync = _try_import("app.features.offline_sync")
if _offline_sync:
    from app.features.offline_sync.models import (  # noqa: F401
        OfflineSyncBatchLog,
        OfflineSyncEvent,
        OfflineSyncIdConflict,
    )
    from app.features.offline_sync.router import router as offline_sync_router
    from app.features.offline_sync.schema_migration import (
        ensure_offline_sync_schema,
    )
else:
    offline_sync_router = None
    ensure_offline_sync_schema = lambda e: None  # noqa: E731

# observability_ops (main only)
_obs_ops = _try_import("app.features.observability_ops")
if _obs_ops:
    from app.features.observability_ops.middleware import CorrelationIdMiddleware
    from app.features.observability_ops.router import router as ops_router
else:
    CorrelationIdMiddleware = None  # type: ignore
    ops_router = None


# ── Bootstrap ────────────────────────────────────────────────────────────────

Base.metadata.create_all(bind=engine)
ensure_auth_schema(engine)
ensure_sanitary_events_schema(engine)
ensure_sinigan_sync_schema(engine)
ensure_offline_sync_schema(engine)
seed_initial_users()
seed_field_animals()
seed_catalog()  # type: ignore[operator]  # noqa: F811
seed_animal_weights()

app = FastAPI(title="BovinoTech IoT API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
if CorrelationIdMiddleware is not None:
    app.add_middleware(CorrelationIdMiddleware)  # type: ignore[arg-type]

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
if offline_capture_router is not None:
    app.include_router(
        offline_capture_router,
        prefix="/offline-capture",
        tags=["Captura offline"],
    )
if offline_sync_router is not None:
    app.include_router(
        offline_sync_router,
        prefix="/offline-sync",
        tags=["Sincronización offline"],
    )
if ops_router is not None:
    app.include_router(ops_router)
app.include_router(
    kpi_dashboard_router,
    prefix="/dashboard",
    tags=["Dashboard de indicadores"],
)


@app.get("/health")
def health_check():
    return {"status": "ok", "system": "BovinoTech IoT", "sinigan_mode": "V6-ready"}