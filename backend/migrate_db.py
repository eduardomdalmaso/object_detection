"""
migrate_db.py — Migra dados do SQLite (app.db) para o MySQL (object_detection)
Execute uma vez apenas: python migrate_db.py
"""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import sqlite3
import json
from datetime import datetime

# ── Destino: MySQL via SQLAlchemy (usa database.py atualizado) ──────
from database import engine, Base, SessionLocal
from models import User, Camera, Detection, WebhookConfig, IntegrationLog, GlobalSettings

print("📦 Criando tabelas no MySQL...")
Base.metadata.create_all(bind=engine)
print("✅ Tabelas criadas!")

# ── Origem: SQLite ──────────────────────────────────────────────────
SQLITE_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "app.db")
if not os.path.exists(SQLITE_PATH):
    print(f"❌ Arquivo SQLite não encontrado em {SQLITE_PATH}")
    sys.exit(1)

sqlite_conn = sqlite3.connect(SQLITE_PATH)
sqlite_conn.row_factory = sqlite3.Row
cur = sqlite_conn.cursor()

db = SessionLocal()

def migrate_table(label, query, model_class, row_factory):
    cur.execute(query)
    rows = cur.fetchall()
    print(f"  → Migrando {len(rows)} registro(s) de '{label}'...")
    count = 0
    for row in rows:
        obj = row_factory(dict(row))
        if obj:
            db.add(obj)
            count += 1
    db.commit()
    print(f"    ✅ {count} registro(s) migrado(s)!")

# ── Users ───────────────────────────────────────────────────────────
def make_user(r):
    existing = db.query(User).filter(User.username == r["username"]).first()
    if existing:
        return None
    u = User(username=r["username"], role=r.get("role", "user"))
    u.name = r.get("name", r["username"])
    u.hashed_password = r.get("hashed_password", "")
    return u

try:
    migrate_table("users", "SELECT * FROM users", User, make_user)
except Exception as e:
    print(f"  ⚠️  Users: {e}")
    db.rollback()

# ── Cameras ─────────────────────────────────────────────────────────
def make_camera(r):
    existing = db.query(Camera).filter(Camera.id == r["id"]).first()
    if existing:
        return None
    c = Camera(
        id=r["id"],
        name=r.get("name", "Camera"),
        url=r.get("url", ""),
        camera_type=r.get("camera_type", "RTSP"),
    )
    if r.get("detection_modes"):
        try:
            c.detection_modes = json.loads(r["detection_modes"])
        except Exception:
            c.detection_modes = ["emotion"]
    return c

try:
    migrate_table("cameras", "SELECT * FROM cameras", Camera, make_camera)
except Exception as e:
    print(f"  ⚠️  Cameras: {e}")
    db.rollback()

# ── Detections ──────────────────────────────────────────────────────
def make_detection(r):
    d = Detection(
        camera_id=r.get("camera_id", "unknown"),
        camera_name=r.get("camera_name", ""),
        object_type=r.get("object_type", ""),
        confidence=float(r.get("confidence", 0)),
        severity=r.get("severity", "low"),
    )
    if r.get("timestamp"):
        try:
            d.timestamp = datetime.fromisoformat(str(r["timestamp"]))
        except Exception:
            pass
    return d

try:
    migrate_table("detections", "SELECT * FROM detections", Detection, make_detection)
except Exception as e:
    print(f"  ⚠️  Detections: {e}")
    db.rollback()

# ── Webhooks ─────────────────────────────────────────────────────────
def make_webhook(r):
    w = WebhookConfig(
        url=r.get("url", ""),
        secret=r.get("secret", ""),
        active=bool(r.get("active", 1)),
    )
    try:
        w.events = json.loads(r.get("events") or '["all"]')
    except Exception:
        w.events = ["all"]
    try:
        w.cameras = json.loads(r.get("cameras") or '["all"]')
    except Exception:
        w.cameras = ["all"]
    return w

try:
    migrate_table("webhook_configs", "SELECT * FROM webhook_configs", WebhookConfig, make_webhook)
except Exception as e:
    print(f"  ⚠️  Webhooks: {e}")
    db.rollback()

# ── Global Settings ──────────────────────────────────────────────────
try:
    cur.execute("SELECT * FROM global_settings LIMIT 1")
    row = cur.fetchone()
    if row:
        row = dict(row)
        existing = db.query(GlobalSettings).first()
        if not existing:
            gs = GlobalSettings(
                whatsapp=row.get("whatsapp", ""),
                phone=row.get("phone", ""),
                support_email=row.get("support_email", ""),
                theme=row.get("theme", "dark"),
                logo_url=row.get("logo_url"),
                brand_name=row.get("brand_name", "Object Detection"),
                brand_subtitle=row.get("brand_subtitle", ""),
            )
            if row.get("severities"):
                try:
                    gs.severities = json.loads(row["severities"])
                except Exception:
                    pass
            db.add(gs)
            db.commit()
            print("  ✅ GlobalSettings migrado!")
except Exception as e:
    print(f"  ⚠️  GlobalSettings: {e}")
    db.rollback()

sqlite_conn.close()
db.close()
print("\n🎉 Migração concluída com sucesso!")
