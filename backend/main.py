from fastapi import FastAPI, HTTPException, Request, Depends, Query
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime, timedelta
import secrets

# Database imports
from database import engine, Base, get_db
from models import User, Detection, OBJECT_TYPES

# Cria as tabelas do SQLite baseadas nos models (se não existirem)
Base.metadata.create_all(bind=engine)

app = FastAPI(title="Object Detection API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:8000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def create_default_admin():
    from database import SessionLocal
    db = SessionLocal()
    try:
        if db.query(User).count() == 0:
            import os
            admin_pwd = os.getenv("DEFAULT_ADMIN_PASSWORD", "admin")
            db.add(User(username="admin", password=admin_pwd, name="Admin User",
                        role="admin", active=True, page_permissions=[]))
            db.commit()
    finally:
        db.close()

SESSIONS: dict[str, int] = {}


class LoginRequest(BaseModel):
    username: str
    password: str


def _get_session_user(request: Request, db: Session):
    token = request.cookies.get("session_token")
    if not token or token not in SESSIONS:
        return None
    uid = SESSIONS[token]
    return db.query(User).filter(User.id == uid).first()


# ── Auth ────────────────────────────────────────────────────────

@app.post("/api/auth/login")
async def login(body: LoginRequest, request: Request, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == body.username).first()
    if not user or user.password != body.password:
        raise HTTPException(status_code=401, detail={"error": "Invalid credentials"})
    token = secrets.token_hex(32)
    SESSIONS[token] = user.id
    response = JSONResponse({"user": {"id": user.id, "name": user.name, "username": user.username,
                                       "role": user.role, "page_permissions": user.page_permissions}})
    response.set_cookie(key="session_token", value=token, httponly=True, samesite="lax", max_age=86400)
    return response


@app.post("/api/auth/logout")
async def logout(request: Request):
    token = request.cookies.get("session_token")
    if token and token in SESSIONS:
        del SESSIONS[token]
    response = JSONResponse({"message": "Logged out"})
    response.delete_cookie("session_token")
    return response


@app.get("/api/auth/me")
async def me(request: Request, db: Session = Depends(get_db)):
    user = _get_session_user(request, db)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return {"user": {"id": user.id, "name": user.name, "username": user.username,
                     "role": user.role, "page_permissions": user.page_permissions}}


# ── Users ────────────────────────────────────────────────────────

@app.get("/api/v1/users")
async def get_users(request: Request, db: Session = Depends(get_db)):
    current_user = _get_session_user(request, db)
    if not current_user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    users = db.query(User).all()
    return {"users": [{"id": u.id, "name": u.name, "username": u.username,
                        "role": u.role, "active": u.active, "page_permissions": u.page_permissions}
                       for u in users], "total": len(users)}


@app.post("/api/v1/add_user")
async def add_user(request: Request, db: Session = Depends(get_db)):
    current_user = _get_session_user(request, db)
    if not current_user or current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")
    body = await request.json()
    if db.query(User).filter(User.username == body["username"]).first():
        raise HTTPException(status_code=400, detail="Username already registered")
    new_user = User(username=body["username"], password=body.get("password", ""),
                    name=body.get("name", body["username"]), role=body.get("role", "viewer"),
                    active=body.get("active", True), page_permissions=body.get("page_permissions", []))
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return {"message": "User created", "id": new_user.id}


@app.post("/api/v1/update_user")
async def update_user(request: Request, db: Session = Depends(get_db)):
    current_user = _get_session_user(request, db)
    if not current_user or current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")
    body = await request.json()
    target = db.query(User).filter(User.id == body.get("id")).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    for key in ["password", "role", "active", "page_permissions"]:
        if key in body and body[key] is not None:
            setattr(target, key, body[key])
    db.commit()
    return {"message": "User updated"}


@app.post("/api/v1/delete_user")
async def delete_user(request: Request, db: Session = Depends(get_db)):
    current_user = _get_session_user(request, db)
    if not current_user or current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")
    body = await request.json()
    target = db.query(User).filter(User.id == body.get("id")).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    db.delete(target)
    db.commit()
    return {"message": "User deleted"}


# ── Detections / Reports ─────────────────────────────────────────

@app.get("/api/v1/reports")
async def get_reports(
    request: Request,
    camera: str = Query("all"),
    object: str = Query("all"),
    start: str = Query(None),
    end: str = Query(None),
    db: Session = Depends(get_db)
):
    current_user = _get_session_user(request, db)
    if not current_user:
        raise HTTPException(status_code=401, detail="Not authenticated")

    q = db.query(Detection)
    if camera != "all":
        q = q.filter(Detection.camera_id == camera)
    if object != "all":
        q = q.filter(Detection.object_type == object)
    if start:
        try:
            q = q.filter(Detection.timestamp >= datetime.fromisoformat(start))
        except ValueError as e:
            print(f"Invalid start date format: {e}")
    if end:
        try:
            end_dt = datetime.fromisoformat(end)
            # include full day
            if "T" not in end:
                end_dt = end_dt.replace(hour=23, minute=59, second=59)
            q = q.filter(Detection.timestamp <= end_dt)
        except ValueError as e:
            print(f"Invalid end date format: {e}")

    detections = q.order_by(Detection.timestamp.desc()).limit(500).all()
    data = [
        {
            "id": d.id,
            "timestamp": d.timestamp.strftime("%Y-%m-%d %H:%M:%S") if d.timestamp else None,
            "camera_id": d.camera_id,
            "camera_name": d.camera_name,
            "object_type": d.object_type,
            "confidence": round(d.confidence * 100, 1),
        }
        for d in detections
    ]
    return {"data": data, "total": len(data)}


def _build_chart_bucket(period: str, ts: datetime) -> str:
    """Return a string bucket label for charting."""
    if period == "hour":
        return ts.strftime("%H:00")
    if period == "day":
        return ts.strftime("%d/%m")
    if period == "week":
        # ISO week
        return f"S{ts.isocalendar()[1]}"
    return ts.strftime("%b/%y")


@app.get("/api/v1/charts/{chart_key}")
async def get_charts(
    chart_key: str,
    request: Request,
    start: str = Query(None),
    end: str = Query(None),
    db: Session = Depends(get_db)
):
    current_user = _get_session_user(request, db)
    if not current_user:
        raise HTTPException(status_code=401, detail="Not authenticated")

    # chart_key format: "{camera_key}-{period}"
    parts = chart_key.rsplit("-", 1)
    camera_key = parts[0] if len(parts) == 2 else "all"
    period = parts[1] if len(parts) == 2 else "day"
    if period not in ("hour", "day", "week", "month"):
        period = "day"

    # date range default: last 7 days
    now = datetime.utcnow()
    start_dt = datetime.fromisoformat(start) if start else now - timedelta(days=6)
    end_dt = datetime.fromisoformat(end) if end else now
    if "T" not in (end or ""):
        end_dt = end_dt.replace(hour=23, minute=59, second=59)

    q = db.query(Detection).filter(
        Detection.timestamp >= start_dt,
        Detection.timestamp <= end_dt
    )
    if camera_key != "all":
        q = q.filter(Detection.camera_id == camera_key)

    detections = q.all()

    # Build bucketed data
    buckets: dict[str, dict] = {}
    for d in detections:
        label = _build_chart_bucket(period, d.timestamp)
        if label not in buckets:
            buckets[label] = {"time": label, "emocoes": 0, "sonolencia": 0,
                               "celular": 0, "cigarro": 0, "arma": 0}
        if d.object_type in buckets[label]:
            buckets[label][d.object_type] += 1

    # Sort by label and return as list
    sorted_data = sorted(buckets.values(), key=lambda x: x["time"])
    return {"data": sorted_data}


@app.post("/api/v1/detections")
async def create_detection(request: Request, db: Session = Depends(get_db)):
    """Endpoint to receive new detection events from the camera pipeline."""
    # Allow unauthenticated posting from local camera agent
    body = await request.json()
    d = Detection(
        camera_id=body.get("camera_id", "unknown"),
        camera_name=body.get("camera_name", "Câmera"),
        object_type=body.get("object_type", "emocoes"),
        confidence=float(body.get("confidence", 0.0)),
        timestamp=datetime.fromisoformat(body["timestamp"]) if body.get("timestamp") else datetime.utcnow()
    )
    db.add(d)
    db.commit()
    db.refresh(d)
    return {"id": d.id, "message": "Detection recorded"}


# ── Status ───────────────────────────────────────────────────────

@app.get("/api/status")
def api_status():
    return {"status": "online", "environment": "detection", "python": "3.11", "db": "sqlite"}
