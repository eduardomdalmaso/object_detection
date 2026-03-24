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


class Camera(Base):
    __tablename__ = "cameras"

    id = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    url = Column(String, nullable=False)
    camera_type = Column(String, default="RTSP")  # RTSP|RTMP|HTTP|ONVIF|WEBCAM
    status = Column(String, default="offline")     # online|offline
    detection_modes = Column(JSON, default=["emotion"])  # List of active modes: emotion|sleeping|phone|cigarette|firearm


class Detection(Base):
    __tablename__ = "detections"

    id = Column(Integer, primary_key=True, index=True)
    camera_id = Column(String, nullable=False, index=True)
    camera_name = Column(String, nullable=False)
    object_type = Column(String, nullable=False, index=True)  # emocoes|sonolencia|celular|cigarro|arma
    confidence = Column(Float, default=0.0)
    timestamp = Column(DateTime, default=datetime.utcnow, index=True)


class WebhookConfig(Base):
    __tablename__ = "webhook_configs"

    id = Column(Integer, primary_key=True, index=True)
    url = Column(String, nullable=False)
    secret = Column(String, default="")                    # HMAC-SHA256 signing secret
    events = Column(JSON, default=["all"])                  # ["all"] or ["emocoes","celular",...]
    cameras = Column(JSON, default=["all"])                 # ["all"] or ["cam1","cam2"]
    active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
