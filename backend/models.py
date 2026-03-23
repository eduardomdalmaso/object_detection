from sqlalchemy import Column, Integer, String, Boolean, JSON, Float, DateTime
from datetime import datetime
from database import Base

OBJECT_TYPES = ["emocoes", "sonolencia", "celular", "cigarro", "arma"]

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    password = Column(String, nullable=False)
    name = Column(String, nullable=False)
    role = Column(String, default="viewer", nullable=False)
    active = Column(Boolean, default=True)
    page_permissions = Column(JSON, default=list)


class Detection(Base):
    __tablename__ = "detections"

    id = Column(Integer, primary_key=True, index=True)
    camera_id = Column(String, nullable=False, index=True)
    camera_name = Column(String, nullable=False)
    object_type = Column(String, nullable=False, index=True)  # emocoes|sonolencia|celular|cigarro|arma
    confidence = Column(Float, default=0.0)
    timestamp = Column(DateTime, default=datetime.utcnow, index=True)
