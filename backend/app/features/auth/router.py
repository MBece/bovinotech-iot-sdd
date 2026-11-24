from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.features.auth import service
from app.features.auth.dependencies import (  # noqa: F401 - re-exported for other modules
    coded_error,
    get_current_user,
    get_current_user_allow_password_change,
    oauth2_scheme,
    require_veterinario,
)
from app.features.auth.models import User, UserRole  # noqa: F401 - re-exported
from app.features.auth.permissions import (  # noqa: F401 - re-exported
    require_administrador,
    require_directive_costs,
    require_roles,
    require_write_access,
)
from app.features.auth.schemas import (
    AuditLogRead,
    MeRead,
    PasswordChange,
    Token,
    UserCreateByAdmin,
    UserFarmAssign,
    UserRead,
    UserStatusUpdate,
)
from app.features.auth.security import verify_password
from app.features.auth.seed import seed_initial_users  # noqa: F401 - re-exported
from app.features.auth.sync_support import (  # noqa: F401 - re-exported
    get_current_user_for_sync,
    record_sync_rejection,
    verify_pending_author,
    was_user_active_at,
)

router = APIRouter()

INVALID_CREDENTIALS_MESSAGE = "Correo o contraseña incorrectos"


def _invalid_credentials() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=INVALID_CREDENTIALS_MESSAGE,
        headers={"WWW-Authenticate": "Bearer"},
    )


def _parse_farm_id(raw) -> Optional[int]:
    if raw in (None, ""):
        return None
    try:
        return int(raw)
    except (TypeError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="El identificador de finca no es válido",
        )


async def _read_login_body(request: Request) -> tuple[Optional[str], Optional[str], Optional[int]]:
    content_type = request.headers.get("content-type", "")
    body = {}
    try:
        if "application/json" in content_type:
            body = await request.json()
        else:
            body = await request.form()
    except Exception:
        body = {}
    username = body.get("username") or body.get("email")
    password = body.get("password")
    return username, password, _parse_farm_id(body.get("farm_id"))


@router.post("/login", response_model=Token)
async def login(request: Request, db: Session = Depends(get_db)):
    username, password, farm_id = await _read_login_body(request)
    if not username or not password:
        raise _invalid_credentials()

    user = db.query(User).filter(User.email == username).first()
    # Same message for unknown, wrong password and disabled accounts (FR-001).
    if not user or not verify_password(password, user.hashed_password) or not user.is_active:
        raise _invalid_credentials()

    active_farm_id = service.resolve_login_farm(user, farm_id)
    return service.issue_token(user, active_farm_id)


@router.post("/register", status_code=status.HTTP_403_FORBIDDEN)
def register():
    """There is no public self-registration (FR-004)."""
    raise coded_error(
        status.HTTP_403_FORBIDDEN,
        "El registro público no está habilitado. Solicite su cuenta al administrador de su finca.",
        "SELF_REGISTRATION_DISABLED",
    )


@router.post("/change-password", response_model=Token)
def change_password(
    payload: PasswordChange,
    current_user: User = Depends(get_current_user_allow_password_change),
    db: Session = Depends(get_db),
):
    active_farm_id = current_user.active_farm_id
    user = service.change_password(
        db, current_user, payload.current_password, payload.new_password
    )
    return service.issue_token(user, active_farm_id)


@router.get("/me", response_model=MeRead)
def get_me(current_user: User = Depends(get_current_user)):
    me = MeRead.model_validate(current_user)
    me.active_farm_id = current_user.active_farm_id
    return me


# --- Administration (ADMINISTRADOR, own farm only) ---------------------------


def _scoped_to_farm(user: User, farm_id: int) -> UserRead:
    """Admin responses only show the administrator's own farm, never the
    other farms of a shared VETERINARIO/DIRECTIVO."""
    read = UserRead.model_validate(user)
    read.farms = [farm for farm in read.farms if farm.id == farm_id]
    return read


@router.post("/users", response_model=UserRead, status_code=status.HTTP_201_CREATED)
def create_user(
    payload: UserCreateByAdmin,
    admin: User = Depends(require_administrador),
    db: Session = Depends(get_db),
):
    user = service.create_user(db, admin, payload)
    return _scoped_to_farm(user, service.admin_farm_id(admin))


@router.get("/users", response_model=list[UserRead])
def list_users(
    admin: User = Depends(require_administrador),
    db: Session = Depends(get_db),
):
    farm_id = service.admin_farm_id(admin)
    return [_scoped_to_farm(user, farm_id) for user in service.list_users(db, farm_id)]


@router.patch("/users/{user_id}/status", response_model=UserRead)
def update_user_status(
    user_id: int,
    payload: UserStatusUpdate,
    admin: User = Depends(require_administrador),
    db: Session = Depends(get_db),
):
    user = service.set_user_status(db, admin, user_id, payload.is_active)
    return _scoped_to_farm(user, service.admin_farm_id(admin))


@router.post("/users/farms", response_model=UserRead)
def add_farm_to_user(
    payload: UserFarmAssign,
    admin: User = Depends(require_administrador),
    db: Session = Depends(get_db),
):
    user = service.add_admin_farm_to_user(db, admin, payload.email)
    return _scoped_to_farm(user, service.admin_farm_id(admin))


@router.get("/audit", response_model=list[AuditLogRead])
def list_audit(
    action: Optional[str] = None,
    admin: User = Depends(require_administrador),
    db: Session = Depends(get_db),
):
    return service.list_audit(db, service.admin_farm_id(admin), action)


# --- Permission check routes --------------------------------------------------


@router.get("/test-vet-only")
def test_vet_only(current_user: User = Depends(require_veterinario)):
    return {"message": "Acceso veterinario concedido"}


@router.get("/test-directive-costs")
def test_directive_costs(current_user: User = Depends(require_directive_costs)):
    return {"message": "Acceso a costos directivos permitido"}


@router.get("/test-write-access")
def test_write_access(current_user: User = Depends(require_write_access)):
    return {"message": "Acceso de escritura permitido"}
