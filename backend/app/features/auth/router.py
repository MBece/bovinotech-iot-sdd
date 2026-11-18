import os
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.core.database import get_db, SessionLocal
from app.features.auth.models import User, UserRole
from app.features.auth.schemas import Token, UserRead
from app.features.auth.security import (
    create_access_token,
    decode_access_token,
    get_password_hash,
    verify_password,
)

router = APIRouter()
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


def seed_initial_users(db: Session = None):
    close_session = False
    if db is None:
        db = SessionLocal()
        close_session = True
    try:
        operario_password = os.getenv("SEED_OPERARIO_PASSWORD", "password123")
        vet_password = os.getenv("SEED_VET_PASSWORD", "password123")
        users = [
            {
                "email": "operario@bovinotech.co",
                "password": operario_password,
                "role": UserRole.OPERARIO,
            },
            {
                "email": "vet@bovinotech.co",
                "password": vet_password,
                "role": UserRole.VETERINARIO,
            },
        ]
        for user_data in users:
            existing = db.query(User).filter(User.email == user_data["email"]).first()
            if not existing:
                user = User(
                    email=user_data["email"],
                    hashed_password=get_password_hash(user_data["password"]),
                    role=user_data["role"],
                )
                db.add(user)
        db.commit()
    finally:
        if close_session:
            db.close()


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    payload = decode_access_token(token)
    email: Optional[str] = payload.get("sub")
    if email is None:
        raise credentials_exception
    user = db.query(User).filter(User.email == email).first()
    if user is None:
        raise credentials_exception
    return user


def require_veterinario(current_user: User = Depends(get_current_user)) -> User:
    role_value = (
        current_user.role.value
        if hasattr(current_user.role, "value")
        else str(current_user.role)
    )
    if role_value != UserRole.VETERINARIO.value:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acceso denegado: Se requiere rol de Veterinario",
        )
    return current_user


@router.post("/login", response_model=Token)
async def login(
    request: Request,
    db: Session = Depends(get_db),
):
    content_type = request.headers.get("content-type", "")
    username = None
    password = None

    if "application/json" in content_type:
        try:
            body = await request.json()
            username = body.get("username") or body.get("email")
            password = body.get("password")
        except Exception:
            pass
    else:
        try:
            form = await request.form()
            username = form.get("username") or form.get("email")
            password = form.get("password")
        except Exception:
            pass

    if not username or not password:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = db.query(User).filter(User.email == username).first()
    if not user or not verify_password(password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    role_str = user.role.value if hasattr(user.role, "value") else str(user.role)
    token_payload = {
        "sub": user.email,
        "role": role_str,
    }
    access_token = create_access_token(token_payload)

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "role": role_str,
    }


@router.get("/me", response_model=UserRead)
def get_me(current_user: User = Depends(get_current_user)):
    return current_user


@router.get("/test-vet-only")
def test_vet_only(current_user: User = Depends(require_veterinario)):
    return {"message": "Welcome Veterinarian"}
