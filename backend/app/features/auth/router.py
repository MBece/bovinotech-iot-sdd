from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Security, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.features.auth.models import User
from app.features.auth.schemas import (
    LoginRequest,
    TokenResponse,
    UserCreateRequest,
    UserResponse,
)
from app.features.auth.security import (
    create_access_token,
    decode_access_token,
    hash_password,
)
from app.features.auth.service import AuthService

router = APIRouter(prefix="/auth", tags=["Autenticación y RBAC"])
security_scheme = HTTPBearer(auto_error=False)


def seed_initial_users(db: Session) -> None:
    initial_users = [
        ("admin@bovinotech.co", "Administrador Principal", "ADMINISTRADOR", "FINCA-01,FINCA-02"),
        ("operario@bovinotech.co", "Operario Juan Pérez", "OPERARIO", "FINCA-01"),
        ("vet@bovinotech.co", "Dra. María Veterinario", "VETERINARIO", "FINCA-01,FINCA-02"),
        ("directivo@bovinotech.co", "Directivo Carlos Gomez", "DIRECTIVO", "FINCA-01,FINCA-02"),
    ]
    for email, name, role, farms in initial_users:
        existing = db.query(User).filter(User.email == email).first()
        if not existing:
            u = User(
                email=email,
                full_name=name,
                hashed_password=hash_password("Password123!"),
                role=role,
                assigned_farms=farms,
                is_active=True,
            )
            db.add(u)
    db.commit()


def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Security(security_scheme),
    db: Session = Depends(get_db),
) -> User:
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Se requiere token de autenticación",
        )
    payload = decode_access_token(credentials.credentials)
    if not payload or "sub" not in payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido o expirado",
        )
    user = AuthService.get_by_email(db, payload["sub"])
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuario inactivo o no encontrado",
        )
    # Store token-specified active farm on the instance for request lifecycle
    user._active_farm = payload.get("farm_id", user.farm_id)
    return user


def require_role(allowed_roles: List[str]):
    def role_checker(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Operación restringida para el rol {current_user.role}",
            )
        return current_user
    return role_checker


require_admin = require_role(["ADMINISTRADOR"])
require_veterinario = require_role(["VETERINARIO"])
require_operario = require_role(["OPERARIO", "ADMINISTRADOR"])


@router.post("/login", response_model=TokenResponse)
def login(request: LoginRequest, db: Session = Depends(get_db)):
    user = AuthService.authenticate_user(db, request.email, request.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credenciales incorrectas o usuario inactivo",
        )

    farms = user.get_farms_list()
    active_farm = request.farm_id if request.farm_id else farms[0]

    if active_farm not in farms:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"El usuario no tiene acceso a la finca {active_farm}",
        )

    token_payload = {
        "sub": user.email,
        "role": user.role,
        "farm_id": active_farm,
    }
    token = create_access_token(token_payload)

    return TokenResponse(
        access_token=token,
        role=user.role,
        active_farm=active_farm,
        user_email=user.email,
        available_farms=farms,
    )


@router.get("/me")
def get_me(current_user: User = Depends(get_current_user)):
    return {
        "id": current_user.id,
        "email": current_user.email,
        "full_name": current_user.full_name,
        "role": current_user.role,
        "assigned_farms": current_user.get_farms_list(),
        "active_farm": getattr(current_user, "_active_farm", current_user.farm_id),
    }


@router.post("/users", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def provision_user(
    request: UserCreateRequest,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    existing = AuthService.get_by_email(db, request.email)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ya existe un usuario con este correo electrónico",
        )
    new_user = AuthService.create_user(db, request)
    return UserResponse(
        id=new_user.id,
        email=new_user.email,
        full_name=new_user.full_name,
        role=new_user.role,
        assigned_farms=new_user.get_farms_list(),
        is_active=new_user.is_active,
    )


@router.get("/users", response_model=List[UserResponse])
def list_users(
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    users = db.query(User).all()
    return [
        UserResponse(
            id=u.id,
            email=u.email,
            full_name=u.full_name,
            role=u.role,
            assigned_farms=u.get_farms_list(),
            is_active=u.is_active,
        )
        for u in users
    ]
