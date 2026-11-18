from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.database import Base, engine
from app.features.auth.models import User  # noqa: F401
from app.features.auth.router import router as auth_router, seed_initial_users

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


@app.get("/health")
def health_check():
    return {"status": "ok", "system": "BovinoTech IoT", "sinigan_mode": "V6-ready"}
