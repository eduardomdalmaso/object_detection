from sqlalchemy import Column, Integer, String, Boolean, JSON, Float, DateTime, Text
from datetime import datetime
from database import Base
from zoneinfo import ZoneInfo

def get_utc_minus_3():
    return datetime.now(ZoneInfo('America/Sao_Paulo')).replace(tzinfo=None)

OBJECT_TYPES = ["emocoes", "sonolencia", "celular", "cigarro", "maos_ao_alto", "arma"]



class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(100), unique=True, index=True, nullable=False)
    password = Column(String(255), nullable=False)
    name = Column(String(200), nullable=False)
    role = Column(String(50), default="viewer", nullable=False)
    active = Column(Boolean, default=True)
    page_permissions = Column(JSON, default=list)


class Camera(Base):
    __tablename__ = "cameras"

    id = Column(String(100), primary_key=True)
    name = Column(String(200), nullable=False)
    url = Column(String(1000), nullable=False)
    camera_type = Column(String(50), default="RTSP")   # RTSP|RTMP|HTTP|ONVIF|WEBCAM
    status = Column(String(50), default="offline")      # online|offline
    detection_modes = Column(JSON, default=["emotion"]) # List of active modes


class Detection(Base):
    __tablename__ = "detections"

    id = Column(Integer, primary_key=True, index=True)
    camera_id = Column(String(100), nullable=False, index=True)
    camera_name = Column(String(200), nullable=False)
    object_type = Column(String(100), nullable=False, index=True)
    confidence = Column(Float, default=0.0)
    severity = Column(String(50), default="Normal")
    acknowledged = Column(Boolean, default=False)
    timestamp = Column(DateTime, default=get_utc_minus_3, index=True)


class WebhookConfig(Base):
    __tablename__ = "webhook_configs"

    id = Column(Integer, primary_key=True, index=True)
    url = Column(String(1000), nullable=False)
    secret = Column(String(255), default="")
    events = Column(JSON, default=["all"])
    cameras = Column(JSON, default=["all"])
    active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=get_utc_minus_3)


class IntegrationLog(Base):
    __tablename__ = "integration_logs"

    id = Column(Integer, primary_key=True, index=True)
    system = Column(String(500), nullable=False)
    status = Column(String(50), nullable=False)
    date = Column(DateTime, default=get_utc_minus_3, index=True)
    message = Column(Text, nullable=False)


class GlobalSettings(Base):
    __tablename__ = "global_settings"

    id = Column(Integer, primary_key=True, default=1)
    whatsapp = Column(String(50), default="559999999999")
    phone = Column(String(50), default="+55 99 9999-9999")
    support_email = Column(String(200), default="suporte@komtektecnologia.com.br")
    theme = Column(String(50), default="light")
    logo_url = Column(Text, nullable=True)
    brand_name = Column(String(200), default="Gases")
    brand_subtitle = Column(String(200), default="Distribuição")
    severities = Column(JSON, default={})
