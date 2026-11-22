"""Idempotent development seed for the auth module (data-model.md, Seed)."""
import os

from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.features.auth.models import User, UserFarm, UserRole, utc_now
from app.features.auth.security import get_password_hash
from app.features.auth.service import ensure_farms

FALLBACK_PASSWORD = "password123"  # local development only, as before

SEED_FARMS = [(1, "Finca La Esperanza"), (2, "Finca El Roble")]

# email, full name, role, farms, password env var
SEED_USERS = [
    ("admin@bovinotech.co", "Administrador Finca 1", UserRole.ADMINISTRADOR, [1], "SEED_ADMIN_PASSWORD"),
    ("operario@bovinotech.co", "Operario de Prueba", UserRole.OPERARIO, [1], "SEED_OPERARIO_PASSWORD"),
    ("vet@bovinotech.co", "Veterinario de Prueba", UserRole.VETERINARIO, [1], "SEED_VET_PASSWORD"),
    ("vet2@bovinotech.co", "Veterinario Multifinca", UserRole.VETERINARIO, [1, 2], "SEED_VET_PASSWORD"),
    ("directivo@bovinotech.co", "Directivo de Prueba", UserRole.DIRECTIVO, [1], "SEED_DIRECTIVO_PASSWORD"),
]


_seed_hash_cache: dict[str, str] = {}


def _seed_password_hash(password: str) -> str:
    """bcrypt is slow by design; hash each seed password once per process so
    repeated seeding (one per test) stays within the CI time budget."""
    if password not in _seed_hash_cache:
        _seed_hash_cache[password] = get_password_hash(password)
    return _seed_hash_cache[password]


def seed_initial_users(db: Session = None):
    close_session = False
    if db is None:
        db = SessionLocal()
        close_session = True
    try:
        ensure_farms(db, SEED_FARMS)
        for email, full_name, role, farm_ids, password_var in SEED_USERS:
            user = db.query(User).filter(User.email == email).first()
            if user is None:
                user = User(
                    email=email,
                    full_name=full_name,
                    hashed_password=_seed_password_hash(
                        os.getenv(password_var, FALLBACK_PASSWORD)
                    ),
                    role=role,
                    is_active=True,
                    must_change_password=False,
                    created_at=utc_now(),
                )
                db.add(user)
                db.flush()
            elif not user.full_name:
                user.full_name = full_name
            # Existing users from the previous version have no farm yet.
            if not user.farm_ids:
                for farm_id in farm_ids:
                    db.add(UserFarm(user_id=user.id, farm_id=farm_id))
                db.flush()
                db.expire(user, ["farms"])
        db.commit()
    finally:
        if close_session:
            db.close()
