from sqlalchemy import Column, Integer, String, Boolean, JSON, Float, DateTime
from datetime import datetime
from database import Base
from zoneinfo import ZoneInfo

def get_utc_minus_3():
    return datetime.now(ZoneInfo('America/Sao_Paulo')).replace(tzinfo=None)

OBJECT_TYPES = ["emocoes", "sonolencia", "celular", "cigarro", "maos_ao_alto", "arma"]



class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(255), unique=True, index=True, nullable=False)
    password = Column(String(255), nullable=False)
    name = Column(String(255), nullable=False)
    role = Column(String(50), default="viewer", nullable=False)
    active = Column(Boolean, default=True)
    page_permissions = Column(JSON, default=list)


class Camera(Base):
    __tablename__ = "cameras"

    id = Column(String(255), primary_key=True)
    name = Column(String(255), nullable=False)
    url = Column(String(2048), nullable=False)
    camera_type = Column(String(50), default="RTSP")  # RTSP|RTMP|HTTP|ONVIF|WEBCAM
    status = Column(String(50), default="offline")     # online|offline
    detection_modes = Column(JSON, default=["emotion"])  # List of active modes: emotion|sleeping|phone|cigarette|hand


class Detection(Base):
    __tablename__ = "detections"

    id = Column(Integer, primary_key=True, index=True)
    camera_id = Column(String(255), nullable=False, index=True)
    camera_name = Column(String(255), nullable=False)
    object_type = Column(String(50), nullable=False, index=True)  # emocoes|sonolencia|celular|cigarro|maos_ao_alto
    confidence = Column(Float, default=0.0)
    severity = Column(String(50), default="Normal")
    timestamp = Column(DateTime, default=get_utc_minus_3, index=True)


class WebhookConfig(Base):
    __tablename__ = "webhook_configs"

    id = Column(Integer, primary_key=True, index=True)
    url = Column(String(2048), nullable=False)
    secret = Column(String(255), default="")                    # HMAC-SHA256 signing secret
    events = Column(JSON, default=["all"])                  # ["all"] or ["emocoes","celular",...]
    cameras = Column(JSON, default=["all"])                 # ["all"] or ["cam1","cam2"]
    active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=get_utc_minus_3)


class IntegrationLog(Base):
    __tablename__ = "integration_logs"

    id = Column(Integer, primary_key=True, index=True)
    system = Column(String(255), nullable=False)        # e.g., "Webhook: url"
    status = Column(String(50), nullable=False)        # "success" or "error"
    date = Column(DateTime, default=get_utc_minus_3, index=True)
    message = Column(String(1024), nullable=False)       # Request body or error detail


class GlobalSettings(Base):
    __tablename__ = "global_settings"

    id = Column(Integer, primary_key=True, default=1)
    whatsapp = Column(String(255), default="559999999999")
    phone = Column(String(255), default="+55 99 9999-9999")
    support_email = Column(String(255), default="suporte@komtektecnologia.com.br")
    theme = Column(String(50), default="light")
    logo_url = Column(String(2048), nullable=True)  # Base64 string
    brand_name = Column(String(255), default="k-Monitor")
    brand_subtitle = Column(String(255), default="Security OMS")
    severities = Column(JSON, default={})
