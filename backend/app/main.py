from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.database import Base, engine
from app.features.auth.models import User  # noqa: F401
from app.features.auth.router import router as auth_router, seed_initial_users
from app.features.sanitary_events.models import (  # noqa: F401
    SanitaryEvent,
    SanitaryEventCorrection,
)
from app.features.sanitary_events.router import (
    events_router as sanitary_events_router,
    router as sync_router,
)
from app.features.sinigan.router import router as sinigan_router
from app.features.alerta_fiebre.models import (  # noqa: F401
    FeverAlert,
    FeverAlertAttention,
)
from app.features.alerta_fiebre.router import router as alerta_fiebre_router

# Create tables and execute seed
Base.metadata.create_all(bind=engine)
seed_initial_users()

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
app.include_router(sync_router, prefix="/sync", tags=["Sincronización"])
app.include_router(
    sanitary_events_router,
    prefix="/sanitary-events",
    tags=["Eventos sanitarios"],
)
app.include_router(
    alerta_fiebre_router,
    prefix="/api/v1/alerta-fiebre",
    tags=["Alerta Fiebre"],
)


@app.get("/health")
def health_check():
    return {"status": "ok", "system": "BovinoTech IoT", "sinigan_mode": "V6-ready"}
