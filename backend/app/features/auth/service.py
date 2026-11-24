from typing import List, Optional
from sqlalchemy.orm import Session

from app.features.auth.models import User
from app.features.auth.schemas import UserCreateRequest
from app.features.auth.security import hash_password, verify_password


class AuthService:
    @staticmethod
    def get_by_email(db: Session, email: str) -> Optional[User]:
        return db.query(User).filter(User.email == email.lower().strip()).first()

    @staticmethod
    def authenticate_user(
        db: Session, email: str, password: str, requested_farm: Optional[str] = None
    ) -> Optional[User]:
        user = AuthService.get_by_email(db, email)
        if not user or not user.is_active:
            return None
        if not verify_password(password, user.hashed_password):
            return None
        return user

    @staticmethod
    def create_user(db: Session, data: UserCreateRequest) -> User:
        user = User(
            email=data.email.lower().strip(),
            hashed_password=hash_password(data.password),
            full_name=data.full_name,
            role=data.role.value,
            assigned_farms=",".join(data.assigned_farms),
            is_active=True,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        return user
