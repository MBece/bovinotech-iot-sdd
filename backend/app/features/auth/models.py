import json
from typing import List
from sqlalchemy import Boolean, Column, Integer, String, Text

from app.core.database import Base


class User(Base):
    __tablename__ = "auth_users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(255), nullable=False)
    role = Column(String(50), nullable=False)
    assigned_farms = Column(String(255), default="FINCA-01", nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)

    @property
    def farm_id(self) -> str:
        # Default or first assigned farm
        farms = self.get_farms_list()
        return farms[0] if farms else "FINCA-01"

    def get_farms_list(self) -> List[str]:
        if not self.assigned_farms:
            return ["FINCA-01"]
        return [f.strip() for f in self.assigned_farms.split(",") if f.strip()]

    def set_farms_list(self, farms: List[str]) -> None:
        self.assigned_farms = ",".join(farms)
