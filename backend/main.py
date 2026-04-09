# 🔥 MUST BE AT THE VERY TOP - BEFORE ANY TF/DEEPFACE/CV2 IMPORT
import os
os.environ["TF_USE_LEGACY_KERAS"] = "1"
os.environ["TF_CPP_MIN_LOG_LEVEL"] = "3"
os.environ["TF_ENABLE_ONEDNN_OPTS"] = "0"
os.environ["TF_FORCE_GPU_ALLOW_GROWTH"] = "true"
# os.environ["CUDA_VISIBLE_DEVICES"] = "-1"
os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = (
    "rtsp_transport;tcp|"
    "fflags;nobuffer+discardcorrupt|"
    "flags;low_delay|"
    "strict;experimental|"
    "analyzeduration;500000|"
    "probesize;100000|"
    "stimeout;10000000|"
    "reorder_queue_size;0|"
    "max_delay;0|"
    "err_detect;aggressive|"
    "genpts;1"
)

import urllib.request
import threading
import time
import base64
import traceback
import secrets
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

def get_utc_minus_3():
    return datetime.now(ZoneInfo('America/Sao_Paulo')).replace(tzinfo=None)

import cv2
import numpy as np
import torch
import dlib
from ultralytics import YOLO
from deepface import DeepFace

import mediapipe as mp
from mediapipe.tasks import python as mp_python
from mediapipe.tasks.python import vision as mp_vision

from fastapi import FastAPI, HTTPException, Request, Depends, Query, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse, StreamingResponse, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import func
import io

# Database imports
from database import engine, Base, get_db, SessionLocal
from models import User, Camera, Detection, WebhookConfig, IntegrationLog, OBJECT_TYPES
import hmac
import hashlib
import json
import requests as http_requests

# ========================== CREATE TABLES ==========================
Base.metadata.create_all(bind=engine)

# ========================== MODEL LOADING ==========================
print("🔄 Loading AI models...")

MODELS_DIR = os.path.dirname(os.path.abspath(__file__))

face_detector = YOLO(os.path.join(MODELS_DIR, 'face-lindevs.pt'))
phone_detector = YOLO(os.path.join(MODELS_DIR, 'cellphone.pt'))
cigarette_detector = YOLO(os.path.join(MODELS_DIR, 'cigarette.pt'))
gun_detector = YOLO(os.path.join(MODELS_DIR, 'gun.pt'))
landmark_predictor = dlib.shape_predictor(os.path.join(MODELS_DIR, 'face_landmarks.dat'))

# ========================== MEDIAPIPE POSE ==========================
print("🔄 Loading MediaPipe Pose...")

MODEL_URL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task"
MODEL_FILE = os.path.join(MODELS_DIR, "pose_landmarker_lite.task")

if not os.path.exists(MODEL_FILE):
    print("🌐 Downloading pose_landmarker_lite.task (only once)...")
    try:
        urllib.request.urlretrieve(MODEL_URL, MODEL_FILE)
        print("✅ Model downloaded successfully!")
    except Exception as e:
        print(f"❌ Download failed: {e}")
        print("Please download manually from the link above and place in backend folder.")
        exit(1)
else:
    print("✅ pose_landmarker_lite.task already exists")

BaseOptions = mp_python.BaseOptions
PoseLandmarker = mp_vision.PoseLandmarker
PoseLandmarkerOptions = mp_vision.PoseLandmarkerOptions
VisionRunningMode = mp_vision.RunningMode

POSE_CONFIDENCE_THRESHOLD = 0.6

POSE_CONNECTIONS = [
    (0,1),(1,2),(2,3),(3,7),(0,4),(4,5),(5,6),(6,8),(9,10),
    (11,12),(11,13),(13,15),(15,17),(17,19),(19,15),(15,21),
    (12,14),(14,16),(16,18),(18,20),(20,16),(16,22),
    (11,23),(12,24),(23,24),(23,25),(25,27),(27,29),(29,31),(31,27),
    (24,26),(26,28),(28,30),(30,32),(32,28)
]

print("✅ All AI models loaded!")

# ========================== CV HELPER FUNCTIONS ==========================

EAR_THRESHOLD = 0.20


def euclidean_distance(a, b):
    return np.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2)


def calculate_ear(landmarks):
    right_eye = [[landmarks.part(i).x, landmarks.part(i).y] for i in range(36, 42)]
    left_eye = [[landmarks.part(i).x, landmarks.part(i).y] for i in range(42, 48)]
    def ear_of_eye(eye):
        A = euclidean_distance(eye[1], eye[5])
        B = euclidean_distance(eye[2], eye[4])
        C = euclidean_distance(eye[0], eye[3])
        return (A + B) / (2.0 * C + 1e-6)
    return ear_of_eye(left_eye), ear_of_eye(right_eye)


def draw_pose(annotated, pose_landmarks_list, alert=False):
    h, w, _ = annotated.shape
    color = (0, 0, 255) if alert else (0, 255, 0)
    thickness = 5 if alert else 3
    for landmarks in pose_landmarks_list:
        for lm in landmarks:
            x, y = int(lm.x * w), int(lm.y * h)
            cv2.circle(annotated, (x, y), 6, color, -1)
        for start_idx, end_idx in POSE_CONNECTIONS:
            if start_idx < len(landmarks) and end_idx < len(landmarks):
                start = (int(landmarks[start_idx].x * w), int(landmarks[start_idx].y * h))
                end = (int(landmarks[end_idx].x * w), int(landmarks[end_idx].y * h))
                cv2.line(annotated, start, end, color, thickness)


def is_left_hand_raised(landmarks):
    if len(landmarks) < 33:
        return False
    nose = landmarks[0]
    l_shoulder = landmarks[11]
    l_wrist = landmarks[15]
    if l_wrist.visibility < POSE_CONFIDENCE_THRESHOLD:
        return False
    return l_wrist.y < (l_shoulder.y - 0.05) and l_wrist.y < (nose.y - 0.05)


def is_right_hand_raised(landmarks):
    if len(landmarks) < 33:
        return False
    nose = landmarks[0]
    r_shoulder = landmarks[12]
    r_wrist = landmarks[16]
    if r_wrist.visibility < POSE_CONFIDENCE_THRESHOLD:
        return False
    return r_wrist.y < (r_shoulder.y - 0.05) and r_wrist.y < (nose.y - 0.05)


# Map detection modes to OBJECT_TYPES for DB storage
MODE_TO_OBJECT_TYPE = {
    "emotion": "emocoes",
    "sleeping": "sonolencia",
    "phone": "celular",
    "hand": "maos_ao_alto",   # hand raised detection
    "cigarette": "cigarro",
    "gun": "arma",
}

# Translate english emotions inside DB
EMOTION_TRANSLATION_MAP = {
    "happy": "feliz",
    "sad": "triste",
    "fear": "medo",
    "neutral": "neutro",
    "angry": "raiva",
    "surprise": "surpresa",
    "disgust": "nojo"
}


# ========================== CAMERA PIPELINE ==========================

class CameraPipeline:
    """
    Manages a single camera: RTSP/webcam reading + CV processing + MJPEG streaming.
    Each camera has its own thread, frame buffer, detection mode, and stats.
    """

    def __init__(self, camera_id: str, camera_name: str, url: str,
                 camera_type: str = "RTSP", active_modes: list = None):
        if active_modes is None:
            active_modes = ["emotion"]
        self.camera_id = camera_id
        self.camera_name = camera_name
        self.url = url
        self.camera_type = camera_type
        self.active_modes = active_modes

        # Frame state
        self.latest_frame = None
        self.last_annotated = None
        self.frame_lock = threading.Lock()

        # Stats
        self.stats_lock = threading.Lock()
        self.emotion_stats = {"angry": 0.0, "disgust": 0.0, "fear": 0.0, "happy": 0.0,
                              "sad": 0.0, "surprise": 0.0, "neutral": 0.0}
        self.total_confidence = 0.0
        self.sleeping_stats = {"drowsy": 0.0, "alert": 0.0}
        self.phone_stats = {"phone": 0.0, "no_phone": 0.0}
        self.hand_stats = {"up": 0.0, "down": 0.0}
        self.cigarette_stats = {"cigarette": 0.0, "no_cigarette": 0.0}
        self.gun_stats = {"gun": 0.0, "no_gun": 0.0}
        self.stats_frame_count = 0

        # MediaPipe pose (lazy-loaded to avoid crash if libGLESv2 is missing)
        self.pose_timestamp = 0
        self._pose_landmarker = None

        # Detection throttle: save to DB at most every N seconds per camera per mode
        self.detection_cooldown = 5.0  # seconds
        self.last_detection_time = {}

        # Thread control
        self._running = False
        self._thread = None
        self._inference_thread = None

    @property
    def pose_landmarker(self):
        """Lazy-load PoseLandmarker on first access."""
        if self._pose_landmarker is None:
            try:
                pose_options = PoseLandmarkerOptions(
                    base_options=BaseOptions(model_asset_path=MODEL_FILE),
                    running_mode=VisionRunningMode.VIDEO,
                    num_poses=2,
                    min_pose_detection_confidence=0.5,
                    min_pose_presence_confidence=0.5,
                    min_tracking_confidence=0.5
                )
                self._pose_landmarker = PoseLandmarker.create_from_options(pose_options)
            except Exception as e:
                print(f"⚠️  MediaPipe PoseLandmarker not available: {e}")
                return None
        return self._pose_landmarker

    def inject_frame(self, frame):
        """Inject a frame from an external source (e.g., browser WebSocket)."""
        resized = cv2.resize(frame, (854, 480))
        with self.frame_lock:
            self.latest_frame = resized.copy()

    def start(self):
        """Start the camera pipeline threads."""
        if self._running:
            return
        self._running = True

        self._inference_thread = threading.Thread(target=self._inference_loop, daemon=True)
        self._inference_thread.start()

        if self.camera_type == "WEBCAM":
            self._update_status("online")
            print(f"▶️  Pipeline started for WEBCAM '{self.camera_name}' ({self.camera_id}) — awaiting browser frames")
        else:
            self._thread = threading.Thread(target=self._reader_loop, daemon=True)
            self._thread.start()
            print(f"▶️  Pipeline started for camera '{self.camera_name}' ({self.camera_id})")

    def stop(self):
        """Stop the camera pipeline threads."""
        self._running = False
        if self._thread:
            self._thread.join(timeout=5)
            self._thread = None
        if self._inference_thread:
            self._inference_thread.join(timeout=5)
            self._inference_thread = None
        print(f"⏹️  Pipeline stopped for camera '{self.camera_name}' ({self.camera_id})")

    def _inference_loop(self):
        """Dedicated thread to run AI inference at a controlled FPS to save CPU."""
        while self._running:
            with self.frame_lock:
                frame = self.latest_frame.copy() if self.latest_frame is not None else None
            
            if frame is None:
                time.sleep(0.05)
                continue
            
            # Process AI (expensive operation)
            annotated = self.process_frame(frame)
            
            with self.frame_lock:
                self.last_annotated = annotated.copy()
            
            # Throttle inference to ~10 FPS
            time.sleep(0.1)

    def _reader_loop(self):
        """Continuously read frames from the camera source."""
        while self._running:
            try:
                if self.camera_type == "WEBCAM":
                    cap = cv2.VideoCapture(int(self.url) if self.url.isdigit() else 0)
                else:
                    cap = cv2.VideoCapture(self.url, cv2.CAP_FFMPEG)

                cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
                cap.set(3, 854)
                cap.set(4, 480)

                if not cap.isOpened():
                    print(f"⚠️  Camera {self.camera_id} - reconnecting in 3s...")
                    self._update_status("offline")
                    time.sleep(3)
                    continue

                self._update_status("online")

                while self._running:
                    ret, frame = cap.read()
                    if not ret or frame is None:
                        break
                    frame = cv2.resize(frame, (854, 480))
                    with self.frame_lock:
                        self.latest_frame = frame.copy()

                cap.release()
            except Exception as e:
                print(f"❌ Camera {self.camera_id} reader error: {e}")

            if self._running:
                self._update_status("offline")
                time.sleep(2)

    def _update_status(self, status: str):
        """Update camera status in the database."""
        try:
            db = SessionLocal()
            cam = db.query(Camera).filter(Camera.id == self.camera_id).first()
            if cam:
                cam.status = status
                db.commit()
            db.close()
        except Exception:
            pass

    def process_frame(self, frame):
        """Apply CV detection based on the current mode and return annotated frame."""
        annotated = frame.copy()
        gray_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        
        # Track detected modes in this frame with their confidence
        detections_this_frame = []
        
        drowsy_this_frame = False
        phone_detected = False
        hand_up = False
        cigarette_detected = False
        gun_detected = False
        
        modes = self.active_modes
    
        # ── Face + Emotion + Sleeping ──────────────────────────────
        if "emotion" in modes or "sleeping" in modes:
            results = face_detector(frame, conf=0.35, verbose=False)
            for result in results:
                for box in result.boxes:
                    x1, y1, x2, y2 = map(int, box.xyxy[0])
                    x1, y1 = max(0, x1), max(0, y1)
                    x2, y2 = min(frame.shape[1], x2), min(frame.shape[0], y2)
                    face_crop = frame[y1:y2, x1:x2]
    
                    try:
                        dlib_rect = dlib.rectangle(left=x1, top=y1, right=x2, bottom=y2)
                        lm = landmark_predictor(gray_frame, dlib_rect)
                        for n in range(68):
                            cv2.circle(annotated, (lm.part(n).x, lm.part(n).y), 2, (255, 255, 0), -1)
    
                        if "sleeping" in modes:
                            left_ear, right_ear = calculate_ear(lm)
                            avg_ear = (left_ear + right_ear) / 2.0
                            cv2.putText(annotated, f"L:{left_ear:.2f} R:{right_ear:.2f} AVG:{avg_ear:.2f}",
                                        (x1, y2 + 25), cv2.FONT_HERSHEY_SIMPLEX, 0.65, (0, 255, 255), 2)
                            if left_ear < EAR_THRESHOLD or right_ear < EAR_THRESHOLD:
                                drowsy_this_frame = True
                                conf = max(0.0, 1.0 - avg_ear)
                                detections_this_frame.append({"mode": "sleeping", "conf": conf})
                                alert_text = ("!!! BOTH EYES CLOSED !!!" if (left_ear < EAR_THRESHOLD and right_ear < EAR_THRESHOLD)
                                              else "!!! ONE EYE CLOSED - DROWSY !!!")
                                cv2.putText(annotated, alert_text, (40, 80), cv2.FONT_HERSHEY_SIMPLEX, 1.25, (0, 0, 255), 4)
                    except Exception:
                        pass
    
                    if "emotion" in modes and face_crop.size > 0:
                        try:
                            analysis = DeepFace.analyze(face_crop, actions=['emotion'],
                                                        enforce_detection=False, silent=True,
                                                        detector_backend='opencv', expand_percentage=15)
                            if analysis:
                                res = analysis[0]
                                dominant = res['dominant_emotion'].lower()
                                confidence = float(res['emotion'][res['dominant_emotion']] / 100.0)
                                if confidence > 0.5:
                                    detections_this_frame.append({"mode": "emotion", "conf": confidence, "dominant": dominant})
                                cv2.putText(annotated, dominant.upper(), (x1, y1 - 10),
                                            cv2.FONT_HERSHEY_SIMPLEX, 0.85, (36, 255, 12), 2)
                                with self.stats_lock:
                                    if dominant in self.emotion_stats:
                                        self.emotion_stats[dominant] += confidence
                                        self.total_confidence += confidence
                        except Exception:
                            pass
    
                    cv2.rectangle(annotated, (x1, y1), (x2, y2), (0, 255, 0), 2)
    
        # ── Phone ─────────────────────────────────────────────────
        if "phone" in modes:
            try:
                phone_results = phone_detector(frame, conf=0.25, iou=0.40, imgsz=640, max_det=50, verbose=False)
                for result in phone_results:
                    for box in result.boxes:
                        if int(box.cls[0]) == 67:
                            phone_detected = True
                            conf = float(box.conf[0])
                            detections_this_frame.append({"mode": "phone", "conf": conf})
                            px1, py1, px2, py2 = map(int, box.xyxy[0])
                            cv2.rectangle(annotated, (px1, py1), (px2, py2), (0, 0, 255), 6)
                            cv2.putText(annotated, "CELL PHONE DETECTED", (px1, max(40, py1 - 30)),
                                        cv2.FONT_HERSHEY_SIMPLEX, 1.1, (0, 0, 255), 4)
            except Exception:
                pass
    
        # ── Hand (Pose) ───────────────────────────────────────────
        if "hand" in modes and self.pose_landmarker is not None:
            try:
                rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_frame)
                result = self.pose_landmarker.detect_for_video(mp_image, self.pose_timestamp)
                self.pose_timestamp += 33
                pose_landmarks_list = result.pose_landmarks
    
                if pose_landmarks_list:
                    alert_status = None
                    conf = 0.0
                    for landmarks in pose_landmarks_list:
                        left_up = is_left_hand_raised(landmarks)
                        right_up = is_right_hand_raised(landmarks)
                        if left_up and right_up:
                            alert_status = "BOTH"
                            hand_up = True
                            conf = 0.95
                            break
                        elif left_up or right_up:
                            alert_status = "ONE"
                            hand_up = True
                            conf = 0.75
                            break
                    draw_pose(annotated, pose_landmarks_list, alert=bool(alert_status))
                    if alert_status == "BOTH":
                        detections_this_frame.append({"mode": "hand", "conf": conf})
                        cv2.rectangle(annotated, (0, 30), (854, 140), (0, 0, 255), -1)
                        cv2.putText(annotated, "BOTH HANDS UP!", (40, 85), cv2.FONT_HERSHEY_SIMPLEX, 2.8, (255, 255, 255), 7)
                    elif alert_status == "ONE":
                        detections_this_frame.append({"mode": "hand", "conf": conf})
                        cv2.rectangle(annotated, (0, 30), (854, 140), (0, 165, 255), -1)
                        cv2.putText(annotated, "ONE HAND UP!", (40, 85), cv2.FONT_HERSHEY_SIMPLEX, 2.8, (255, 255, 255), 7)
            except Exception as e:
                print(f"MediaPipe Error ({self.camera_id}):", e)
    
        # ── Cigarette ─────────────────────────────────────────────
        if "cigarette" in modes:
            try:
                cig_results = cigarette_detector(frame, conf=0.45, verbose=False)
                for result in cig_results:
                    for box in result.boxes:
                        cigarette_detected = True
                        conf = float(box.conf[0])
                        detections_this_frame.append({"mode": "cigarette", "conf": conf})
                        cx1, cy1, cx2, cy2 = map(int, box.xyxy[0])
                        cv2.rectangle(annotated, (cx1, cy1), (cx2, cy2), (255, 0, 255), 4)
                        cv2.putText(annotated, "CIGARETTE DETECTED", (cx1, cy1 - 15),
                                    cv2.FONT_HERSHEY_SIMPLEX, 0.9, (255, 0, 255), 3)
            except Exception:
                pass
    
        # ── Gun (Arma de Fogo) ────────────────────────────────────
        if "gun" in modes:
            try:
                gun_results = gun_detector(frame, conf=0.45, verbose=False)
                for result in gun_results:
                    for box in result.boxes:
                        gun_detected = True
                        conf = float(box.conf[0])
                        detections_this_frame.append({"mode": "gun", "conf": conf})
                        gx1, gy1, gx2, gy2 = map(int, box.xyxy[0])
                        cv2.rectangle(annotated, (gx1, gy1), (gx2, gy2), (0, 255, 255), 4)
                        cv2.putText(annotated, "ARMA DETECTADA", (gx1, gy1 - 15),
                                    cv2.FONT_HERSHEY_SIMPLEX, 0.9, (0, 255, 255), 3)
            except Exception:
                pass
    
        # ── Stats update ──────────────────────────────────────────
        with self.stats_lock:
            self.stats_frame_count += 1
            if "sleeping" in modes:
                self.sleeping_stats["drowsy" if drowsy_this_frame else "alert"] += 1
            if "phone" in modes:
                self.phone_stats["phone" if phone_detected else "no_phone"] += 1
            if "hand" in modes:
                self.hand_stats["up" if hand_up else "down"] += 1
            if "cigarette" in modes:
                self.cigarette_stats["cigarette" if cigarette_detected else "no_cigarette"] += 1
            if "gun" in modes:
                self.gun_stats["gun" if gun_detected else "no_gun"] += 1
    
        # ── Auto-save detection to DB (throttled individually) ────
        now = time.time()
        for det in detections_this_frame:
            mode_type = det["mode"]
            conf = det["conf"]
            dom_emot = det.get("dominant")
            
            last_t = self.last_detection_time.get(mode_type, 0.0)
            if (now - last_t) >= self.detection_cooldown:
                self.last_detection_time[mode_type] = now
                self._save_detection(mode_type, conf, dominant_emotion=dom_emot, annotated_frame=annotated)
    
        return annotated
    
    def _save_detection(self, mode_type: str, confidence: float, dominant_emotion: str = None, annotated_frame=None):
        """Save a detection event to the database and dispatch webhooks."""
        try:
            from models import GlobalSettings
            db = SessionLocal()
            # For emotion mode, save the specific emotion type instead of generic "emocoes"
            if mode_type == "emotion" and dominant_emotion:
                object_type = EMOTION_TRANSLATION_MAP.get(dominant_emotion.lower(), dominant_emotion.lower())
            else:
                object_type = MODE_TO_OBJECT_TYPE.get(mode_type, "emocoes")
            
            settings = db.query(GlobalSettings).first()
            severity = "Normal"
            if settings and settings.severities:
                severity = settings.severities.get(object_type, "Normal")
    
            now = get_utc_minus_3()
            d = Detection(
                camera_id=self.camera_id,
                camera_name=self.camera_name,
                object_type=object_type,
                confidence=min(confidence, 1.0),
                severity=severity,
                timestamp=now
            )
            db.add(d)
            db.commit()
            db.close()
    
            # Create base64 thumbnail if available
            thumbnail_base64 = None
            if annotated_frame is not None:
                try:
                    resized = cv2.resize(annotated_frame, (640, 360))
                    # Encode to JPEG with 70% quality
                    _, buffer = cv2.imencode('.jpg', resized, [int(cv2.IMWRITE_JPEG_QUALITY), 70])
                    thumbnail_base64 = base64.b64encode(buffer).decode('utf-8')
                    # format data URI scheme
                    thumbnail_base64 = f"data:image/jpeg;base64,{thumbnail_base64}"
                except Exception as ex:
                    print(f"⚠️ Failed to encode thumbnail base64: {ex}")
    
            # Dispatch webhooks in background
            event_data = {
                "event": "detection",
                "timestamp": now.isoformat() + "-03:00",
                "camera_id": self.camera_id,
                "camera_name": self.camera_name,
                "object_type": object_type,
                "confidence": round(min(confidence, 1.0), 4),
                "severity": severity,
                "thumbnail_base64": thumbnail_base64,
            }
            threading.Thread(target=dispatch_webhooks, args=(event_data,), daemon=True).start()
        except Exception as e:
            print(f"⚠️ Failed to save detection for {self.camera_id}: {e}")

    def generate_mjpeg(self):
        """Generate MJPEG stream frames for this camera. Pure lightweight forwarder."""
        while True:
            with self.frame_lock:
                if self.last_annotated is not None:
                    annotated = self.last_annotated.copy()
                elif self.latest_frame is not None:
                    annotated = self.latest_frame.copy()
                else:
                    annotated = None

            if annotated is None:
                time.sleep(0.05)
                continue

            _, buffer = cv2.imencode('.jpg', annotated, [cv2.IMWRITE_JPEG_QUALITY, 80])
            yield (b'--frame\r\nContent-Type: image/jpeg\r\n\r\n' + buffer.tobytes() + b'\r\n')
            
            # Cap the stream yield rate strictly to prevent runaway Starlette loops pushing 1000fps and breaking browser rendering/network
            time.sleep(0.06)

    def get_stats(self):
        """Return current stats based on active detection modes."""
        with self.stats_lock:
            modes = self.active_modes
            combined_stats = {}
            if "emotion" in modes:
                if self.total_confidence > 0:
                    data = {k: float(round(v / self.total_confidence * 100, 1))
                            for k, v in self.emotion_stats.items()}
                else:
                    data = {k: 0.0 for k in self.emotion_stats}
                if 'surprise' in data:
                    data['surprised'] = data.pop('surprise')
                combined_stats.update(data)
            if "sleeping" in modes:
                total = self.sleeping_stats["drowsy"] + self.sleeping_stats["alert"]
                combined_stats.update({
                    "drowsy": round(self.sleeping_stats["drowsy"] / total * 100, 1) if total > 0 else 0,
                    "alert": round(self.sleeping_stats["alert"] / total * 100, 1) if total > 0 else 0
                })
            if "phone" in modes:
                total = self.phone_stats["phone"] + self.phone_stats["no_phone"]
                combined_stats.update({
                    "phone": round(self.phone_stats["phone"] / total * 100, 1) if total > 0 else 0,
                    "no_phone": round(self.phone_stats["no_phone"] / total * 100, 1) if total > 0 else 0
                })
            if "hand" in modes:
                total = self.hand_stats["up"] + self.hand_stats["down"]
                combined_stats.update({
                    "up": round(self.hand_stats["up"] / total * 100, 1) if total > 0 else 0,
                    "down": round(self.hand_stats["down"] / total * 100, 1) if total > 0 else 0
                })
            if "cigarette" in modes:
                total = self.cigarette_stats["cigarette"] + self.cigarette_stats["no_cigarette"]
                combined_stats.update({
                    "cigarette": round(self.cigarette_stats["cigarette"] / total * 100, 1) if total > 0 else 0,
                    "no_cigarette": round(self.cigarette_stats["no_cigarette"] / total * 100, 1) if total > 0 else 0
                })
            if "gun" in modes:
                total = self.gun_stats["gun"] + self.gun_stats["no_gun"]
                combined_stats.update({
                    "gun": round(self.gun_stats["gun"] / total * 100, 1) if total > 0 else 0,
                    "no_gun": round(self.gun_stats["no_gun"] / total * 100, 1) if total > 0 else 0
                })
            return combined_stats

    def reset_stats(self):
        """Reset all stats counters."""
        with self.stats_lock:
            self.emotion_stats = {k: 0.0 for k in self.emotion_stats}
            self.total_confidence = 0.0
            self.sleeping_stats = {"drowsy": 0.0, "alert": 0.0}
            self.phone_stats = {"phone": 0.0, "no_phone": 0.0}
            self.hand_stats = {"up": 0.0, "down": 0.0}
            self.cigarette_stats = {"cigarette": 0.0, "no_cigarette": 0.0}
            self.gun_stats = {"gun": 0.0, "no_gun": 0.0}
            self.stats_frame_count = 0


# ========================== PIPELINE MANAGER ==========================

# Global dictionary: camera_id -> CameraPipeline
pipelines: dict[str, CameraPipeline] = {}
pipelines_lock = threading.Lock()

# Tracks the active WebSocket connection per camera_id (singleton per camera)
webcam_active_ws: dict[str, "WebSocket"] = {}


def start_pipeline(camera_id: str, camera_name: str, url: str,
                   camera_type: str = "RTSP", detection_modes: list = None):
    """Create and start a CameraPipeline in a background thread."""
    if detection_modes is None:
        detection_modes = ["emotion"]
    with pipelines_lock:
        if camera_id in pipelines:
            pipelines[camera_id].stop()

        # Pipeline processes all active modes
        active_modes = detection_modes if detection_modes else ["emotion"]
        pipeline = CameraPipeline(camera_id, camera_name, url, camera_type, active_modes)
        pipelines[camera_id] = pipeline
        pipeline.start()


def stop_pipeline(camera_id: str):
    """Stop and remove a pipeline."""
    with pipelines_lock:
        if camera_id in pipelines:
            pipelines[camera_id].stop()
            del pipelines[camera_id]


def get_pipeline(camera_id: str) -> CameraPipeline | None:
    """Get a pipeline by camera ID."""
    with pipelines_lock:
        return pipelines.get(camera_id)


def init_all_pipelines():
    """Load all cameras from DB and start their pipelines."""
    db = SessionLocal()
    try:
        cameras = db.query(Camera).all()
        for cam in cameras:
            print(f"🎥 Starting pipeline for: {cam.name} ({cam.id})")
            start_pipeline(cam.id, cam.name, cam.url, cam.camera_type, cam.detection_modes or ["emotion"])
    finally:
        db.close()


# ========================== FASTAPI APP ==========================

app = FastAPI(title="Object Detection API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:8005", "http://38.247.187.241:5173", "http://38.247.187.241:8005", "http://38.247.187.241:8082", "http://38.247.187.241", "https://38.247.187.241"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup():
    # Create default admin user
    db = SessionLocal()
    try:
        if db.query(User).count() == 0:
            admin_pwd = os.getenv("DEFAULT_ADMIN_PASSWORD", "admin")
            db.add(User(username="admin", password=admin_pwd, name="Admin User",
                        role="admin", active=True, page_permissions=[]))
            db.commit()
    finally:
        db.close()

    # Start all camera pipelines
    init_all_pipelines()


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


# ── Cameras CRUD ─────────────────────────────────────────────────

@app.get("/api/v1/cameras")
async def get_cameras(request: Request, db: Session = Depends(get_db)):
    current_user = _get_session_user(request, db)
    if not current_user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    cameras = db.query(Camera).all()
    platforms = [
        {
            "id": c.id,
            "name": c.name,
            "url": c.url,
            "camera_type": c.camera_type,
            "status": c.status,
            "detection_modes": c.detection_modes or ["emotion"],
        }
        for c in cameras
    ]
    return {"platforms": platforms, "total": len(platforms)}


@app.post("/api/v1/add_camera")
async def add_camera(request: Request, db: Session = Depends(get_db)):
    current_user = _get_session_user(request, db)
    if not current_user or current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")
    body = await request.json()

    platform_key = body.get("platform", f"cam_{int(time.time())}")
    name = body.get("name", "").strip()
    url = body.get("url", "").strip()
    camera_type = body.get("camera_type", "RTSP")

    if not name or not url:
        raise HTTPException(status_code=400, detail="Name and URL are required")

    # Check for duplicate platform key
    existing = db.query(Camera).filter(Camera.id == platform_key).first()
    warning = None
    if existing:
        raise HTTPException(status_code=400, detail=f"Camera with key '{platform_key}' already exists")

    # Check for duplicate URL (warn but allow)
    url_exists = db.query(Camera).filter(Camera.url == url).first()
    if url_exists:
        warning = f"Another camera already uses this URL ({url_exists.name})"

    cam = Camera(
        id=platform_key,
        name=name,
        url=url,
        camera_type=camera_type,
        status="offline",
        detection_modes=["emotion"]
    )
    db.add(cam)
    db.commit()

    # Start the CV pipeline for the new camera
    start_pipeline(cam.id, cam.name, cam.url, cam.camera_type, cam.detection_modes)

    result = {"message": "Camera created", "id": cam.id}
    if warning:
        result["warning"] = warning
    return result


@app.post("/api/v1/update_camera")
async def update_camera(request: Request, db: Session = Depends(get_db)):
    current_user = _get_session_user(request, db)
    if not current_user or current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")
    body = await request.json()
    platform_key = body.get("platform")
    cam = db.query(Camera).filter(Camera.id == platform_key).first()
    if not cam:
        raise HTTPException(status_code=404, detail="Camera not found")

    old_url = cam.url
    if "name" in body and body["name"]:
        cam.name = body["name"]
    if "url" in body and body["url"]:
        cam.url = body["url"]
    if "camera_type" in body:
        cam.camera_type = body["camera_type"]
    db.commit()

    # Restart pipeline if URL changed
    if cam.url != old_url:
        start_pipeline(cam.id, cam.name, cam.url, cam.camera_type, cam.detection_modes or ["emotion"])

    return {"message": "Camera updated"}


@app.post("/api/v1/delete_camera")
async def delete_camera(request: Request, db: Session = Depends(get_db)):
    current_user = _get_session_user(request, db)
    if not current_user or current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")
    body = await request.json()
    cam_id = body.get("id")
    cam = db.query(Camera).filter(Camera.id == cam_id).first()
    if not cam:
        raise HTTPException(status_code=404, detail="Camera not found")

    # Stop the CV pipeline first
    stop_pipeline(cam_id)

    db.delete(cam)
    db.commit()
    return {"message": "Camera deleted"}



@app.get("/api/v1/test_connection_plat/{platform_id}")
async def test_connection(platform_id: str, db: Session = Depends(get_db)):
    """Test if a camera can be connected to."""
    cam = db.query(Camera).filter(Camera.id == platform_id).first()
    if not cam:
        raise HTTPException(status_code=404, detail="Camera not found")

    try:
        if cam.camera_type == "WEBCAM":
            cap = cv2.VideoCapture(int(cam.url) if cam.url.isdigit() else 0)
        else:
            cap = cv2.VideoCapture(cam.url, cv2.CAP_FFMPEG)

        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        success = cap.isOpened()
        if success:
            ret, frame = cap.read()
            success = ret and frame is not None
        cap.release()

        if success:
            cam.status = "online"
            db.commit()
            # Ensure pipeline is running
            pipeline = get_pipeline(platform_id)
            if not pipeline:
                start_pipeline(cam.id, cam.name, cam.url, cam.camera_type, cam.detection_modes or ["emotion"])
            return {"success": True}
        else:
            cam.status = "offline"
            db.commit()
            return {"success": False, "error": "Could not read frame from camera"}
    except Exception as e:
        return {"success": False, "error": str(e)}


# ── Video Streaming ──────────────────────────────────────────────

@app.get("/video_feed")
async def video_feed(plat: str = Query(None)):
    """MJPEG video feed for a camera. Query param: plat=<camera_id>"""
    if not plat:
        # Default to the first available pipeline
        with pipelines_lock:
            if pipelines:
                plat = next(iter(pipelines))
            else:
                raise HTTPException(status_code=404, detail="No cameras available")

    pipeline = get_pipeline(plat)
    if not pipeline:
        raise HTTPException(status_code=404, detail=f"No active pipeline for camera '{plat}'")

    return StreamingResponse(
        pipeline.generate_mjpeg(),
        media_type="multipart/x-mixed-replace; boundary=frame"
    )


# ── Detection Mode ───────────────────────────────────────────────

class SetModesRequest(BaseModel):
    camera_id: str
    modes: list[str]


@app.post("/api/v1/set_modes")
async def set_modes(body: SetModesRequest, db: Session = Depends(get_db)):
    """Set the active detection modes for a specific camera (multi-select)."""
    valid_modes = ['emotion', 'sleeping', 'phone', 'hand', 'cigarette', 'gun']
    for m in body.modes:
        if m not in valid_modes:
            raise HTTPException(status_code=400, detail=f"Invalid mode '{m}'. Valid: {valid_modes}")
    if not body.modes:
        raise HTTPException(status_code=400, detail="At least one mode is required")

    pipeline = get_pipeline(body.camera_id)
    if pipeline:
        # Set active processing modes
        pipeline.active_modes = body.modes
        pipeline.reset_stats()

    # Persist modes to DB
    cam = db.query(Camera).filter(Camera.id == body.camera_id).first()
    if cam:
        cam.detection_modes = body.modes
        db.commit()

    return {"status": "success", "camera_id": body.camera_id, "modes": body.modes}


# Legacy single-mode endpoint for backwards compatibility
class SetModeRequest(BaseModel):
    camera_id: str
    mode: str


@app.post("/api/v1/set_mode")
async def set_mode(body: SetModeRequest, db: Session = Depends(get_db)):
    """Legacy: set a single detection mode."""
    valid_modes = ['emotion', 'sleeping', 'phone', 'hand', 'cigarette', 'gun']
    if body.mode not in valid_modes:
        raise HTTPException(status_code=400, detail=f"Invalid mode. Valid: {valid_modes}")

    pipeline = get_pipeline(body.camera_id)
    if pipeline:
        pipeline.active_modes = [body.mode]
        pipeline.reset_stats()

    cam = db.query(Camera).filter(Camera.id == body.camera_id).first()
    if cam:
        cam.detection_modes = [body.mode]
        db.commit()

    return {"status": "success", "camera_id": body.camera_id, "mode": body.mode}


@app.get("/api/v1/stats/{camera_id}")
async def get_camera_stats(camera_id: str):
    """Get detection stats for a specific camera."""
    pipeline = get_pipeline(camera_id)
    if not pipeline:
        raise HTTPException(status_code=404, detail=f"No active pipeline for camera '{camera_id}'")
    return pipeline.get_stats()


# ── Detections / Reports ─────────────────────────────────────────

@app.get("/api/v1/reports")
async def get_reports(
    request: Request,
    camera: str = Query("all"),
    object: str = Query("all"),
    severity: str = Query("all"),
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
    if severity != "all":
        q = q.filter(Detection.severity == severity)
    if start:
        try:
            q = q.filter(Detection.timestamp >= datetime.fromisoformat(start))
        except ValueError as e:
            print(f"Invalid start date format: {e}")
    if end:
        try:
            end_dt = datetime.fromisoformat(end)
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
            "severity": d.severity,
            "confidence": round(d.confidence * 100, 1),
            "acknowledged": bool(d.acknowledged),
        }
        for d in detections
    ]
    return {"data": data, "total": len(data)}


# ── Helper: query detections for export ──────────────────────────

OBJECT_LABELS = {
    "emocoes": "Emoções",
    "sonolencia": "Sonolência",
    "celular": "Celular",
    "cigarro": "Cigarro",
    "maos_ao_alto": "Mãos ao Alto",
    "emotion": "Emoções",
    "sleeping": "Sonolência",
    "phone": "Celular",
    "cigarette": "Cigarro",
    "hand": "Mãos ao Alto",
}


def _query_detections_for_export(body: dict, db: Session):
    """Shared query logic for CSV/PDF export endpoints."""
    camera = body.get("camera", "all")
    obj = body.get("object", "all")
    severity = body.get("severity", "all")
    start = body.get("startDate")
    end = body.get("endDate")

    q = db.query(Detection)
    if camera and camera != "all":
        q = q.filter(Detection.camera_id == camera)
    if obj and obj != "all":
        q = q.filter(Detection.object_type == obj)
    if severity and severity != "all":
        q = q.filter(Detection.severity == severity)
    if start:
        try:
            q = q.filter(Detection.timestamp >= datetime.fromisoformat(start))
        except ValueError:
            pass
    if end:
        try:
            end_dt = datetime.fromisoformat(end)
            if "T" not in end:
                end_dt = end_dt.replace(hour=23, minute=59, second=59)
            q = q.filter(Detection.timestamp <= end_dt)
        except ValueError:
            pass
    return q.order_by(Detection.timestamp.desc()).limit(2000).all()

# ── Detections Acknowledge ──────────────────────────────────────────────

@app.post("/api/v1/detections/acknowledge")
async def acknowledge_detections(request: Request, db: Session = Depends(get_db)):
    """Acknowledge (dismiss) high risk detections from the dashboard."""
    current_user = _get_session_user(request, db)
    if not current_user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    body = await request.json()
    ids = body.get("ids", [])
    if ids:
        db.query(Detection).filter(Detection.id.in_(ids)).update({"acknowledged": True}, synchronize_session=False)
        db.commit()
    return {"message": "Success", "acknowledged_count": len(ids)}

# ── Severities ────────────────────────────────────────────────────────

@app.get("/api/v1/severities")
async def get_severities(request: Request, db: Session = Depends(get_db)):
    from models import GlobalSettings
    settings = db.query(GlobalSettings).first()
    if not settings:
        settings = GlobalSettings()
        db.add(settings)
        db.commit()
        db.refresh(settings)
    return {"severities": settings.severities or {}}

@app.post("/api/v1/severities")
async def update_severities(request: Request, db: Session = Depends(get_db)):
    from models import GlobalSettings
    current_user = _get_session_user(request, db)
    if not current_user or current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")
    
    body = await request.json()
    settings = db.query(GlobalSettings).first()
    if not settings:
        settings = GlobalSettings()
        db.add(settings)
        
    # merge current settings with body
    current_severities = dict(settings.severities or {})
    for k, v in body.items():
        current_severities[k] = v
        
    settings.severities = current_severities
    db.commit()
    return {"message": "Severidades atualizadas", "severities": settings.severities}



# ── CSV Export ───────────────────────────────────────────────────

@app.post("/api/v1/reports/export/csv")
async def export_csv(request: Request, db: Session = Depends(get_db)):
    current_user = _get_session_user(request, db)
    if not current_user:
        raise HTTPException(status_code=401, detail="Not authenticated")

    body = await request.json()
    detections = _query_detections_for_export(body, db)

    import csv as csvmod
    output = io.StringIO()
    writer = csvmod.writer(output)
    writer.writerow(["Data/Hora", "Câmera", "Objeto Detectado", "Confiança (%)"])

    for d in detections:
        ts = d.timestamp.strftime("%Y-%m-%d %H:%M:%S") if d.timestamp else ""
        obj_label = OBJECT_LABELS.get(d.object_type, d.object_type or "")
        conf = round(d.confidence * 100, 1) if d.confidence else 0
        writer.writerow([ts, d.camera_name or d.camera_id, obj_label, conf])

    content = output.getvalue().encode("utf-8-sig")  # BOM for Excel compatibility
    return Response(
        content=content,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": "attachment; filename=relatorio_deteccoes.csv"},
    )


# ── PDF Export ───────────────────────────────────────────────────

@app.post("/api/v1/reports/export/pdf")
async def export_pdf(request: Request, db: Session = Depends(get_db)):
    current_user = _get_session_user(request, db)
    if not current_user:
        raise HTTPException(status_code=401, detail="Not authenticated")

    body = await request.json()
    detections = _query_detections_for_export(body, db)
    now_str = datetime.now().strftime("%d/%m/%Y %H:%M")

    camera_label = body.get("camera", "all")
    if camera_label == "all":
        camera_label = "Todas as câmeras"

    object_label = body.get("object", "all")
    if object_label == "all":
        object_label = "Todos os objetos"
    else:
        object_label = OBJECT_LABELS.get(object_label, object_label)

    period_start = body.get("startDate", "—")
    period_end = body.get("endDate", "—")

    # ── Build simple text-based PDF ──────────────────────────────
    lines: list[str] = []
    lines.append("=" * 80)
    lines.append("")
    lines.append("              RELATÓRIO DE DETECÇÕES — OBJECT DETECTION SYSTEM")
    lines.append("")
    lines.append("=" * 80)
    lines.append("")
    lines.append(f"  Gerado em:     {now_str}")
    lines.append(f"  Usuário:       {current_user.name} ({current_user.username})")
    lines.append(f"  Câmera:        {camera_label}")
    lines.append(f"  Objeto:        {object_label}")
    lines.append(f"  Período:       {period_start or '—'} até {period_end or '—'}")
    lines.append(f"  Total:         {len(detections)} detecção(ões)")
    lines.append("")
    lines.append("-" * 80)
    lines.append(f"  {'Data/Hora':<22} {'Câmera':<20} {'Objeto':<18} {'Confiança':>8}")
    lines.append("-" * 80)

    for d in detections:
        ts = d.timestamp.strftime("%Y-%m-%d %H:%M:%S") if d.timestamp else "—"
        cam = (d.camera_name or d.camera_id or "—")[:20]
        obj = OBJECT_LABELS.get(d.object_type, d.object_type or "—")[:18]
        conf = f"{round(d.confidence * 100, 1)}%" if d.confidence else "—"
        lines.append(f"  {ts:<22} {cam:<20} {obj:<18} {conf:>8}")

    lines.append("-" * 80)
    lines.append(f"  Total de registros: {len(detections)}")
    lines.append("")
    lines.append("  * Relatório gerado automaticamente pelo sistema Object Detection.")
    lines.append("=" * 80)

    text_content = "\n".join(lines)

    # Return as downloadable PDF-like text file (proper PDF would require reportlab)
    # Using text/plain with .pdf extension for simplicity
    return Response(
        content=text_content.encode("utf-8"),
        media_type="application/octet-stream",
        headers={"Content-Disposition": "attachment; filename=relatorio_deteccoes.pdf"},
    )



def _build_chart_bucket(period: str, ts: datetime) -> str:
    """Return a string bucket label for charting."""
    if period == "hour":
        return ts.strftime("%H:00")
    if period == "day":
        return ts.strftime("%d/%m")
    if period == "week":
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

    parts = chart_key.rsplit("-", 1)
    camera_key = parts[0] if len(parts) == 2 else "all"
    period = parts[1] if len(parts) == 2 else "day"
    if period not in ("hour", "day", "week", "month"):
        period = "day"

    now = get_utc_minus_3()
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

    # Subtypes of emocoes that should be grouped under the 'emocoes' bucket
    # Includes both portuguese (current) and english (legacy) labels
    EMOTION_SUBTYPES = {
        "feliz", "triste", "medo", "neutro", "raiva", "surpresa", "nojo",
        "happy", "sad", "fear", "neutral", "angry", "surprise", "disgust"
    }

    buckets: dict[str, dict] = {}
    for d in detections:
        label = _build_chart_bucket(period, d.timestamp)
        if label not in buckets:
            buckets[label] = {"time": label, "emocoes": 0, "sonolencia": 0,
                               "celular": 0, "cigarro": 0, "maos_ao_alto": 0, "arma": 0, "_sort": d.timestamp.timestamp()}
        # Normalise emotion subtypes back to the single 'emocoes' bucket
        obj = d.object_type
        if obj in EMOTION_SUBTYPES:
            obj = "emocoes"
        if obj in buckets[label]:
            buckets[label][obj] += 1

    sorted_data = sorted(buckets.values(), key=lambda x: x["_sort"])
    # Delete the internal _sort key before returning
    for item in sorted_data:
        del item["_sort"]
        
    return {"data": sorted_data}


@app.post("/api/v1/detections")
async def create_detection(request: Request, db: Session = Depends(get_db)):
    """Endpoint to receive new detection events (manual or from external agents)."""
    body = await request.json()
    d = Detection(
        camera_id=body.get("camera_id", "unknown"),
        camera_name=body.get("camera_name", "Câmera"),
        object_type=body.get("object_type", "emocoes"),
        confidence=float(body.get("confidence", 0.0)),
        timestamp=datetime.fromisoformat(body["timestamp"]) if body.get("timestamp") else get_utc_minus_3()
    )
    db.add(d)
    db.commit()
    db.refresh(d)
    return {"id": d.id, "message": "Detection recorded"}


# ── Status ───────────────────────────────────────────────────────

@app.get("/api/status")
def api_status():
    with pipelines_lock:
        active = len(pipelines)
    return {
        "status": "online",
        "environment": "detection",
        "python": "3.12",
        "db": "mysql",
        "active_pipelines": active,
    }


# ── Counts (PlatformGrid compatibility) ──────────────────────────

@app.get("/api/v1/counts")
async def get_counts(
    request: Request,
    start: str = Query(None),
    end: str = Query(None),
    plat: str = Query("all"),
    db: Session = Depends(get_db)
):
    """Return aggregated detection counts for the platform grid."""
    q = db.query(Detection)
    if start:
        try:
            q = q.filter(Detection.timestamp >= datetime.fromisoformat(start))
        except ValueError:
            pass
    if end:
        try:
            end_dt = datetime.fromisoformat(end)
            if "T" not in end:
                end_dt = end_dt.replace(hour=23, minute=59, second=59)
            q = q.filter(Detection.timestamp <= end_dt)
        except ValueError:
            pass
    if plat != "all":
        q = q.filter(Detection.camera_id == plat)

    detections = q.all()

    # Aggregate by camera + object_type
    counts: dict = {}
    for d in detections:
        key = (d.camera_id, d.object_type)
        if key not in counts:
            counts[key] = 0
        counts[key] += 1

    result = []
    for (cam_id, obj_type), count in counts.items():
        result.append({
            "platform": cam_id,
            "zone": "A",
            "direction": obj_type,
            "count": count
        })
    return result


# ── Webhooks ─────────────────────────────────────────────────────

def dispatch_webhooks(event_data: dict):
    """Send webhook POST to all matching configurations. Runs in a background thread."""
    try:
        db = SessionLocal()
        hooks = db.query(WebhookConfig).filter(WebhookConfig.active == True).all()
        db.close()
    except Exception as e:
        print(f"⚠️ Webhook DB error: {e}")
        return

    obj_type = event_data.get("object_type", "")
    cam_id = event_data.get("camera_id", "")
    payload_json = json.dumps(event_data, ensure_ascii=False)

    for hook in hooks:
        # Filter by events
        if "all" not in (hook.events or ["all"]) and obj_type not in (hook.events or []):
            continue
        # Filter by cameras
        if "all" not in (hook.cameras or ["all"]) and cam_id not in (hook.cameras or []):
            continue

        headers = {"Content-Type": "application/json"}
        if hook.secret:
            sig = hmac.new(hook.secret.encode(), payload_json.encode(), hashlib.sha256).hexdigest()
            headers["X-Webhook-Signature"] = sig

        for attempt in range(3):
            try:
                resp = http_requests.post(hook.url, json=event_data, headers=headers, timeout=5)
                if resp.status_code < 400:
                    try:
                        db = SessionLocal()
                        log = IntegrationLog(
                            system=f"Webhook: {hook.url}",
                            status="success",
                            message=f"Success (HTTP {resp.status_code})"
                        )
                        db.add(log)
                        db.commit()
                        db.close()
                    except Exception:
                        pass
                    break
                
                print(f"⚠️ Webhook {hook.id} returned {resp.status_code} (attempt {attempt+1})")
                
                if attempt == 2:  # Last attempt
                    try:
                        db = SessionLocal()
                        log = IntegrationLog(
                            system=f"Webhook: {hook.url}",
                            status="error",
                            message=f"Failed with HTTP {resp.status_code}"
                        )
                        db.add(log)
                        db.commit()
                        db.close()
                    except Exception:
                        pass
                        
            except Exception as e:
                print(f"⚠️ Webhook {hook.id} failed (attempt {attempt+1}): {e}")
                
                if attempt == 2:  # Last attempt
                    try:
                        db = SessionLocal()
                        log = IntegrationLog(
                            system=f"Webhook: {hook.url}",
                            status="error",
                            message=f"Connection error: {str(e)[:150]}"
                        )
                        db.add(log)
                        db.commit()
                        db.close()
                    except Exception:
                        pass
                        
            time.sleep(2 ** attempt)  # exponential backoff: 1s, 2s, 4s


class WebhookCreateRequest(BaseModel):
    url: str
    secret: str = ""
    events: list[str] = ["all"]
    cameras: list[str] = ["all"]
    active: bool = True


@app.get("/api/v1/webhooks")
async def list_webhooks(request: Request, db: Session = Depends(get_db)):
    """List all webhook configurations."""
    hooks = db.query(WebhookConfig).all()
    return {
        "data": [
            {
                "id": h.id,
                "url": h.url,
                "secret": "***" if h.secret else "",
                "events": h.events or ["all"],
                "cameras": h.cameras or ["all"],
                "active": h.active,
                "created_at": h.created_at.isoformat() if h.created_at else None,
            }
            for h in hooks
        ],
        "total": len(hooks),
    }


@app.post("/api/v1/webhooks")
async def create_webhook(body: WebhookCreateRequest, request: Request, db: Session = Depends(get_db)):
    """Create a new webhook configuration."""
    hook = WebhookConfig(
        url=body.url,
        secret=body.secret,
        events=body.events,
        cameras=body.cameras,
        active=body.active,
    )
    db.add(hook)
    db.commit()
    db.refresh(hook)
    return {"message": "Webhook created", "id": hook.id}


@app.put("/api/v1/webhooks/{webhook_id}")
async def update_webhook(webhook_id: int, body: WebhookCreateRequest, request: Request, db: Session = Depends(get_db)):
    """Update an existing webhook configuration."""
    hook = db.query(WebhookConfig).filter(WebhookConfig.id == webhook_id).first()
    if not hook:
        raise HTTPException(status_code=404, detail="Webhook not found")
    hook.url = body.url
    if body.secret and body.secret != "***":
        hook.secret = body.secret
    hook.events = body.events
    hook.cameras = body.cameras
    hook.active = body.active
    db.commit()
    return {"message": "Webhook updated"}


@app.delete("/api/v1/webhooks/{webhook_id}")
async def delete_webhook(webhook_id: int, request: Request, db: Session = Depends(get_db)):
    """Delete a webhook configuration."""
    hook = db.query(WebhookConfig).filter(WebhookConfig.id == webhook_id).first()
    if not hook:
        raise HTTPException(status_code=404, detail="Webhook not found")
    db.delete(hook)
    db.commit()
    return {"message": "Webhook deleted"}


@app.post("/api/v1/webhooks/{webhook_id}/test")
async def test_webhook(webhook_id: int, request: Request, db: Session = Depends(get_db)):
    """Send a test event to a specific webhook."""
    hook = db.query(WebhookConfig).filter(WebhookConfig.id == webhook_id).first()
    if not hook:
        raise HTTPException(status_code=404, detail="Webhook not found")

    test_payload = {
        "event": "test",
        "timestamp": get_utc_minus_3().isoformat() + "-03:00",
        "camera_id": "test-cam",
        "camera_name": "Câmera de Teste",
        "object_type": "emocoes",
        "confidence": 0.99,
        "severity": "Normal",
        "thumbnail_base64": "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEA... (test base64)",
    }
    payload_json = json.dumps(test_payload, ensure_ascii=False)
    headers = {"Content-Type": "application/json"}
    if hook.secret:
        sig = hmac.new(hook.secret.encode(), payload_json.encode(), hashlib.sha256).hexdigest()
        headers["X-Webhook-Signature"] = sig

    try:
        resp = http_requests.post(hook.url, json=test_payload, headers=headers, timeout=5)
        
        status_val = "success" if resp.status_code < 400 else "error"
        log = IntegrationLog(
            system=f"Webhook Test: {hook.url}",
            status=status_val,
            message=f"HTTP {resp.status_code}"
        )
        db.add(log)
        db.commit()
        
        return {
            "status": "sent",
            "response_code": resp.status_code,
            "response_body": resp.text[:500],
        }
    except Exception as e:
        log = IntegrationLog(
            system=f"Webhook Test: {hook.url}",
            status="error",
            message=f"Error: {str(e)[:150]}"
        )
        db.add(log)
        db.commit()
        return {"status": "error", "detail": str(e)}


from models import WebhookConfig, IntegrationLog, Camera, Detection, User, GlobalSettings

# ── Global Settings ─────────────────────────────────────────────

class SettingsRequest(BaseModel):
    whatsapp: str
    phone: str
    support_email: str
    theme: str
    logo_url: str | None = None
    brand_name: str
    brand_subtitle: str

@app.get("/api/v1/settings")
async def get_settings(db: Session = Depends(get_db)):
    """Get global settings, create default if none exists."""
    settings = db.query(GlobalSettings).first()
    if not settings:
        settings = GlobalSettings()
        db.add(settings)
        db.commit()
        db.refresh(settings)
    return {
        "whatsapp": settings.whatsapp,
        "phone": settings.phone,
        "supportEmail": settings.support_email,
        "theme": settings.theme,
        "logoUrl": settings.logo_url,
        "brandName": settings.brand_name,
        "brandSubtitle": settings.brand_subtitle,
    }

@app.put("/api/v1/settings")
async def update_settings(body: SettingsRequest, db: Session = Depends(get_db)):
    """Update global settings."""
    settings = db.query(GlobalSettings).first()
    if not settings:
        settings = GlobalSettings()
        db.add(settings)
    
    settings.whatsapp = body.whatsapp
    settings.phone = body.phone
    settings.support_email = body.support_email
    settings.theme = body.theme
    settings.logo_url = body.logo_url
    settings.brand_name = body.brand_name
    settings.brand_subtitle = body.brand_subtitle
    
    db.commit()
    return {"message": "Settings updated"}

# ── Integration Logs ─────────────────────────────────────────────

@app.get("/api/v1/integration-logs")
async def get_integration_logs(request: Request, db: Session = Depends(get_db)):
    """Return the 100 most recent integration logs."""
    logs = db.query(IntegrationLog).order_by(IntegrationLog.date.desc()).limit(100).all()
    data = [
        {
            "id": log.id,
            "system": log.system,
            "status": log.status,
            "date": log.date.strftime("%d/%m/%Y %H:%M:%S") if log.date else "",
            "message": log.message,
        }
        for log in logs
    ]
    return {"data": data, "total": len(data)}

# ── WebSocket: Browser Webcam ───────────────────────────────────

@app.websocket("/ws/webcam/{camera_id}")
async def webcam_ws(websocket: WebSocket, camera_id: str):
    """Receive JPEG frames from the browser webcam and inject into the pipeline.
    Enforces a singleton connection per camera_id — a new connection replaces the old one.
    """
    await websocket.accept()

    # Validate camera exists and is WEBCAM type
    db = SessionLocal()
    cam = db.query(Camera).filter(Camera.id == camera_id).first()
    db.close()

    if not cam or cam.camera_type != "WEBCAM":
        await websocket.close(code=1008, reason="Camera not found or not WEBCAM type")
        return

    # ── Singleton enforcement: close previous connection if any ──
    old_ws = webcam_active_ws.get(camera_id)
    if old_ws is not None and old_ws is not websocket:
        try:
            await old_ws.close(code=1001, reason="Replaced by new connection")
        except Exception:
            pass
    webcam_active_ws[camera_id] = websocket

    # Start/get pipeline
    with pipelines_lock:
        if camera_id not in pipelines:
            modes = cam.detection_modes if cam.detection_modes else ["emotion"]
            active_mode = modes[0] if modes else "emotion"
            pipeline = CameraPipeline(camera_id, cam.name, cam.url or "0", "WEBCAM", active_mode)
            pipelines[camera_id] = pipeline
            pipeline.start()
        else:
            pipeline = pipelines[camera_id]
            if not pipeline._running:
                pipeline.start()

    print(f"📹 WebSocket connected for WEBCAM '{camera_id}'")

    try:
        while True:
            data = await websocket.receive_bytes()
            # Only process if this WS is still the active one
            if webcam_active_ws.get(camera_id) is not websocket:
                break
            nparr = np.frombuffer(data, np.uint8)
            frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            if frame is not None:
                pipeline.inject_frame(frame)
    except WebSocketDisconnect:
        print(f"📹 WebSocket disconnected for WEBCAM '{camera_id}'")
    except Exception as e:
        print(f"❌ WebSocket error for WEBCAM '{camera_id}': {e}")
    finally:
        # Only clean up if this is still the registered active connection
        if webcam_active_ws.get(camera_id) is websocket:
            del webcam_active_ws[camera_id]


# ── Ngrok / CORS Header ─────────────────────────────────────────

@app.middleware("http")
async def add_ngrok_header(request: Request, call_next):
    response = await call_next(request)
    response.headers["ngrok-skip-browser-warning"] = "true"
    return response
