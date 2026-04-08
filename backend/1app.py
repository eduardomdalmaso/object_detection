# 🔥 MUST BE AT THE VERY TOP - BEFORE ANY TF/DEEPFACE/CV2 IMPORT
import os
os.environ["TF_USE_LEGACY_KERAS"] = "1"
os.environ["TF_CPP_MIN_LOG_LEVEL"] = "3"
os.environ["TF_ENABLE_ONEDNN_OPTS"] = "0"
os.environ["TF_FORCE_GPU_ALLOW_GROWTH"] = "true"
os.environ["CUDA_VISIBLE_DEVICES"] = "-1"
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
import torch
from flask import Flask, render_template, Response, jsonify, request
import cv2
from ultralytics import YOLO
import dlib
from deepface import DeepFace
import time
import threading
import base64
import numpy as np
import traceback
# ==================== MEDIA PIPE IMPORTS ====================
import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision

app = Flask(__name__)

# ========================== MODEL LOADING ==========================
print("🔄 Loading all models...")
face_detector = YOLO('face-lindevs.pt')
phone_detector = YOLO('cellphone.pt')
cigarette_detector = YOLO('cigarette.pt')
gun_detector = YOLO('gun.pt')
landmark_predictor = dlib.shape_predictor('face_landmarks.dat')

# ========================== MEDIA PIPE POSE ==========================
print("🔄 Loading MediaPipe Pose...")
MODEL_URL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task"
MODEL_FILE = "pose_landmarker_lite.task"
if not os.path.exists(MODEL_FILE):
    print("🌐 Downloading pose_landmarker_lite.task...")
    urllib.request.urlretrieve(MODEL_URL, MODEL_FILE)
    print("✅ Model downloaded!")

BaseOptions = python.BaseOptions
PoseLandmarker = vision.PoseLandmarker
PoseLandmarkerOptions = vision.PoseLandmarkerOptions
VisionRunningMode = vision.RunningMode

POSE_CONFIDENCE_THRESHOLD = 0.6
global_pose_timestamp = 0

POSE_CONNECTIONS = [
    (0,1),(1,2),(2,3),(3,7),(0,4),(4,5),(5,6),(6,8),(9,10),
    (11,12),(11,13),(13,15),(15,17),(17,19),(19,15),(15,21),
    (12,14),(14,16),(16,18),(18,20),(20,16),(16,22),
    (11,23),(12,24),(23,24),(23,25),(25,27),(27,29),(29,31),(31,27),
    (24,26),(26,28),(28,30),(30,32),(32,28)
]

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
                end   = (int(landmarks[end_idx].x * w),   int(landmarks[end_idx].y * h))
                cv2.line(annotated, start, end, color, thickness)

def is_left_hand_raised(landmarks):
    if len(landmarks) < 33: return False
    nose      = landmarks[0]
    l_shoulder = landmarks[11]
    l_wrist   = landmarks[15]
    if l_wrist.visibility < POSE_CONFIDENCE_THRESHOLD: return False
    return l_wrist.y < (l_shoulder.y - 0.05) and l_wrist.y < (nose.y - 0.05)

def is_right_hand_raised(landmarks):
    if len(landmarks) < 33: return False
    nose      = landmarks[0]
    r_shoulder = landmarks[12]
    r_wrist   = landmarks[16]
    if r_wrist.visibility < POSE_CONFIDENCE_THRESHOLD: return False
    return r_wrist.y < (r_shoulder.y - 0.05) and r_wrist.y < (nose.y - 0.05)

pose_options = PoseLandmarkerOptions(
    base_options=BaseOptions(model_asset_path=MODEL_FILE),
    running_mode=VisionRunningMode.VIDEO,
    num_poses=2,
    min_pose_detection_confidence=0.5,
    min_pose_presence_confidence=0.5,
    min_tracking_confidence=0.5
)
pose_landmarker = PoseLandmarker.create_from_options(pose_options)
print("✅ All models + MediaPipe loaded successfully!")

# ========================== GLOBAL VARIABLES ==========================
RTSP_URL = "rtsp://admin:Proimage%402021@benuvemvms.ddns.net:8010/H264?ch=1&subtype=0"
current_mode = "emotion"
mode_lock = threading.Lock()

# ==================== DROWSINESS CONFIGURATION ====================
# ~30 FPS assumed → frames ÷ 30 = seconds
# Quick trigger: ~0.67s both eyes, ~0.83s one eye
DROWSY_BOTH_EYES_FRAMES = 20    # ~0.67 seconds
DROWSY_ONE_EYE_FRAMES   = 25    # ~0.83 seconds
EAR_THRESHOLD           = 0.25
ALERT_DURATION_SECONDS  = 30.0  # How long the persistent alert stays on screen

# Per-frame eye state counters (reset on eyes-open or mode-change)
drowsy_frame_counter = 0

# Persistent alert state (survives face disappearing from frame)
drowsy_alert_active     = False
drowsy_alert_start_time = 0.0
drowsy_alert_type       = None   # "both" | "one"

# ==================== STATS ====================
# Emotion stats (used in emotion mode)
emotion_stats   = {"angry": 0.0, "disgust": 0.0, "fear": 0.0, "happy": 0.0,
                   "sad": 0.0, "surprise": 0.0, "neutral": 0.0}
total_confidence = 0.0

# Sleeping mode: track both-eye-drowsy, one-eye-drowsy, and alert separately
sleeping_stats  = {"drowsy_both": 0.0, "drowsy_one": 0.0, "alert": 0.0}

# Other mode stats
phone_stats     = {"phone": 0.0, "no_phone": 0.0}
hand_stats      = {"up": 0.0, "down": 0.0}
cigarette_stats = {"cigarette": 0.0, "no_cigarette": 0.0}
gun_stats       = {"gun": 0.0, "no_gun": 0.0}

stats_frame_count = 0
lock       = threading.Lock()
stats_lock = threading.Lock()

last_annotated = None
latest_frame   = None
frame_lock     = threading.Lock()

# ========================== EAR CALCULATION ==========================
def euclidean_distance(a, b):
    return np.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2)

def calculate_ear(landmarks):
    # dlib 68-point model: right eye 36-41, left eye 42-47
    right_eye = [[landmarks.part(i).x, landmarks.part(i).y] for i in range(36, 42)]
    left_eye  = [[landmarks.part(i).x, landmarks.part(i).y] for i in range(42, 48)]

    def ear_of_eye(eye):
        A = euclidean_distance(eye[1], eye[5])
        B = euclidean_distance(eye[2], eye[4])
        C = euclidean_distance(eye[0], eye[3])
        return (A + B) / (2.0 * C + 1e-6)

    return ear_of_eye(left_eye), ear_of_eye(right_eye)

# ========================== RTSP STREAM READER ==========================
def rtsp_reader():
    global latest_frame
    while True:
        cap = cv2.VideoCapture(RTSP_URL, cv2.CAP_FFMPEG)
        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        cap.set(3, 854)
        cap.set(4, 480)

        if not cap.isOpened():
            print("⚠️ RTSP reconnecting...")
            time.sleep(2)
            continue

        while True:
            ret, frame = cap.read()
            if not ret or frame is None:
                break
            frame = cv2.resize(frame, (854, 480))
            with frame_lock:
                latest_frame = frame.copy()

        cap.release()
        time.sleep(1.5)

# ========================== MAIN FRAME PROCESSING ==========================
def process_frame(frame):
    global total_confidence, global_pose_timestamp
    global drowsy_frame_counter
    global drowsy_alert_active, drowsy_alert_start_time, drowsy_alert_type

    annotated   = frame.copy()
    gray_frame  = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)

    # Per-frame detection flags
    phone_detected_this_frame     = False
    hand_up_this_frame            = False
    cigarette_detected_this_frame = False
    gun_detected_this_frame       = False

    # For stats: what kind of drowsiness was detected this frame?
    # None | "both" | "one"
    drowsy_type_this_frame = None

    # ====================== FACE + LANDMARK + DROWSINESS ======================
    results = face_detector(frame, conf=0.35, verbose=False)
    for result in results:
        for box in result.boxes:
            x1, y1, x2, y2 = map(int, box.xyxy[0])
            x1, y1 = max(0, x1), max(0, y1)
            x2, y2 = min(frame.shape[1], x2), min(frame.shape[0], y2)

            try:
                dlib_rect = dlib.rectangle(left=x1, top=y1, right=x2, bottom=y2)
                landmarks = landmark_predictor(gray_frame, dlib_rect)

                # Draw 68 facial landmarks (yellow dots)
                for n in range(68):
                    cv2.circle(annotated,
                               (landmarks.part(n).x, landmarks.part(n).y),
                               2, (255, 255, 0), -1)

                # ======= DROWSINESS DETECTION (sleeping mode only) =======
                if current_mode == "sleeping":
                    left_ear, right_ear = calculate_ear(landmarks)
                    avg_ear = (left_ear + right_ear) / 2.0

                    # Show EAR values on-screen for debugging
                    cv2.putText(annotated,
                                f"L:{left_ear:.2f} R:{right_ear:.2f} AVG:{avg_ear:.2f}",
                                (x1, y2 + 25),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.65, (0, 255, 255), 2)

                    left_closed  = left_ear  < EAR_THRESHOLD
                    right_closed = right_ear < EAR_THRESHOLD
                    both_eyes_closed = left_closed and right_closed
                    any_eye_closed   = left_closed or right_closed

                    current_time = time.time()

                    # --- Frame counter: increment while eye(s) closed, reset otherwise ---
                    if any_eye_closed:
                        drowsy_frame_counter += 1
                    else:
                        drowsy_frame_counter = 0

                    # --- Quick-trigger: fire alert after threshold is crossed ---
                    if not drowsy_alert_active:
                        trigger_both = both_eyes_closed and drowsy_frame_counter >= DROWSY_BOTH_EYES_FRAMES
                        trigger_one  = any_eye_closed   and drowsy_frame_counter >= DROWSY_ONE_EYE_FRAMES

                        if trigger_both:
                            drowsy_alert_active     = True
                            drowsy_alert_start_time = current_time
                            drowsy_alert_type       = "both"
                        elif trigger_one:
                            drowsy_alert_active     = True
                            drowsy_alert_start_time = current_time
                            drowsy_alert_type       = "one"

            except Exception:
                pass

            # Draw face bounding box
            cv2.rectangle(annotated, (x1, y1), (x2, y2), (0, 255, 0), 2)

    # ======= PERSISTENT ALERT (runs OUTSIDE face loop — survives face disappearing) =======
    if current_mode == "sleeping" and drowsy_alert_active:
        current_time = time.time()
        elapsed = current_time - drowsy_alert_start_time

        if elapsed < ALERT_DURATION_SECONDS:
            # Mark this frame as drowsy for stats
            drowsy_type_this_frame = drowsy_alert_type

            # --- Full-screen overlay alert ---
            if drowsy_alert_type == "both":
                # Red background — both eyes closed (severe)
                cv2.rectangle(annotated, (0, 0), (854, 480), (0, 0, 255), -1)
                # Blend original frame so alert is not completely opaque
                annotated = cv2.addWeighted(frame, 0.25, annotated, 0.75, 0)
                # Large alert text
                cv2.putText(annotated,
                            "!!! EYES CLOSED ALERT !!!",
                            (40, 180),
                            cv2.FONT_HERSHEY_SIMPLEX, 2.0, (255, 255, 255), 7)
                cv2.putText(annotated,
                            "DRIVER SLEEPY - WAKE UP!",
                            (80, 280),
                            cv2.FONT_HERSHEY_SIMPLEX, 1.5, (255, 255, 255), 5)
            else:
                # Orange background — one eye closed (warning)
                overlay = annotated.copy()
                cv2.rectangle(overlay, (0, 0), (854, 480), (0, 165, 255), -1)
                annotated = cv2.addWeighted(frame, 0.25, overlay, 0.75, 0)
                cv2.putText(annotated,
                            "!!! EYES CLOSED ALERT !!!",
                            (40, 180),
                            cv2.FONT_HERSHEY_SIMPLEX, 2.0, (255, 255, 255), 7)
                cv2.putText(annotated,
                            "ONE EYE CLOSED - DROWSY!",
                            (80, 280),
                            cv2.FONT_HERSHEY_SIMPLEX, 1.5, (255, 255, 255), 5)

            # Countdown timer (bottom right)
            remaining = int(ALERT_DURATION_SECONDS - elapsed) + 1
            cv2.putText(annotated,
                        f"Alert: {remaining}s",
                        (680, 460),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.75, (255, 255, 255), 2)
        else:
            # 30 seconds expired — reset everything
            drowsy_alert_active     = False
            drowsy_alert_type       = None
            drowsy_frame_counter    = 0

    # ====================== PHONE DETECTION ======================
    if current_mode == "phone":
        try:
            phone_results = phone_detector(frame, conf=0.25, iou=0.40,
                                           imgsz=640, max_det=50, verbose=False)
            for result in phone_results:
                for box in result.boxes:
                    if int(box.cls[0]) == 67:
                        phone_detected_this_frame = True
                        px1, py1, px2, py2 = map(int, box.xyxy[0])
                        cv2.rectangle(annotated, (px1, py1), (px2, py2), (0, 0, 255), 6)
                        cv2.putText(annotated, "CELL PHONE DETECTED",
                                    (px1, max(40, py1 - 30)),
                                    cv2.FONT_HERSHEY_SIMPLEX, 1.1, (0, 0, 255), 4)
        except Exception:
            pass

    # ====================== HAND RAISE DETECTION ======================
    if current_mode == "hand":
        try:
            rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            mp_image  = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_frame)
            result    = pose_landmarker.detect_for_video(mp_image, global_pose_timestamp)
            global_pose_timestamp += 33
            pose_landmarks_list = result.pose_landmarks

            if pose_landmarks_list:
                alert_status = None
                for landmarks in pose_landmarks_list:
                    left_up  = is_left_hand_raised(landmarks)
                    right_up = is_right_hand_raised(landmarks)
                    if left_up and right_up:
                        alert_status = "BOTH"
                        hand_up_this_frame = True
                        break
                    elif left_up or right_up:
                        alert_status = "ONE"
                        hand_up_this_frame = True
                        break

                draw_pose(annotated, pose_landmarks_list, alert=bool(alert_status))

                if alert_status == "BOTH":
                    cv2.rectangle(annotated, (0, 30), (854, 140), (0, 0, 255), -1)
                    cv2.putText(annotated, "BOTH HANDS UP!",
                                (40, 105), cv2.FONT_HERSHEY_SIMPLEX, 2.8, (255, 255, 255), 7)
                elif alert_status == "ONE":
                    cv2.rectangle(annotated, (0, 30), (854, 140), (0, 165, 255), -1)
                    cv2.putText(annotated, "ONE HAND UP!",
                                (40, 105), cv2.FONT_HERSHEY_SIMPLEX, 2.8, (255, 255, 255), 7)
        except Exception as e:
            print("MediaPipe Error:", e)

    # ====================== CIGARETTE DETECTION ======================
    if current_mode == "cigarette":
        try:
            cig_results = cigarette_detector(frame, conf=0.45, verbose=False)
            for result in cig_results:
                for box in result.boxes:
                    cigarette_detected_this_frame = True
                    cx1, cy1, cx2, cy2 = map(int, box.xyxy[0])
                    cv2.rectangle(annotated, (cx1, cy1), (cx2, cy2), (255, 0, 255), 4)
                    cv2.putText(annotated, "CIGARETTE DETECTED",
                                (cx1, cy1 - 15),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.9, (255, 0, 255), 3)
        except Exception:
            pass

    # ====================== GUN DETECTION ======================
    if current_mode == "gun":
        try:
            gun_results = gun_detector(frame, conf=0.45, verbose=False)
            for result in gun_results:
                for box in result.boxes:
                    gun_detected_this_frame = True
                    gx1, gy1, gx2, gy2 = map(int, box.xyxy[0])
                    cv2.rectangle(annotated, (gx1, gy1), (gx2, gy2), (0, 255, 255), 4)
                    cv2.putText(annotated, "GUN DETECTED",
                                (gx1, gy1 - 15),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.9, (0, 255, 255), 3)
        except Exception:
            pass

    # ====================== UPDATE STATS ======================
    with stats_lock:
        global stats_frame_count
        stats_frame_count += 1

        if current_mode == "sleeping":
            if drowsy_type_this_frame == "both":
                sleeping_stats["drowsy_both"] += 1
            elif drowsy_type_this_frame == "one":
                sleeping_stats["drowsy_one"] += 1
            else:
                sleeping_stats["alert"] += 1
        elif current_mode == "phone":
            phone_stats["phone" if phone_detected_this_frame else "no_phone"] += 1
        elif current_mode == "hand":
            hand_stats["up" if hand_up_this_frame else "down"] += 1
        elif current_mode == "cigarette":
            cigarette_stats["cigarette" if cigarette_detected_this_frame else "no_cigarette"] += 1
        elif current_mode == "gun":
            gun_stats["gun" if gun_detected_this_frame else "no_gun"] += 1

    return annotated


# ========================== HELPER: build sleeping stats dict ==========================
def _get_sleeping_stats():
    total = sleeping_stats["drowsy_both"] + sleeping_stats["drowsy_one"] + sleeping_stats["alert"]
    if total == 0:
        return {"drowsy_both": 0.0, "drowsy_one": 0.0, "alert": 0.0,
                "total_drowsy": 0.0}
    db   = round(sleeping_stats["drowsy_both"] / total * 100, 1)
    do   = round(sleeping_stats["drowsy_one"]  / total * 100, 1)
    al   = round(sleeping_stats["alert"]       / total * 100, 1)
    return {
        "drowsy_both":  db,
        "drowsy_one":   do,
        "alert":        al,
        "total_drowsy": round(db + do, 1)   # combined for easy display
    }


# ========================== VIDEO STREAM ==========================
def generate_frames():
    global last_annotated
    frame_counter = 0
    skip_rate     = 3

    while True:
        with frame_lock:
            if latest_frame is None:
                time.sleep(0.01)
                continue
            frame = latest_frame.copy()

        frame_counter += 1
        if frame_counter % skip_rate == 0:
            annotated      = process_frame(frame)
            last_annotated = annotated.copy()
        else:
            annotated = last_annotated.copy() if last_annotated is not None else frame.copy()

        _, buffer = cv2.imencode('.jpg', annotated, [cv2.IMWRITE_JPEG_QUALITY, 85])
        yield (b'--frame\r\nContent-Type: image/jpeg\r\n\r\n' + buffer.tobytes() + b'\r\n')


@app.route('/video_feed')
def video_feed():
    return Response(generate_frames(), mimetype='multipart/x-mixed-replace; boundary=frame')


# ========================== SWITCH MODE ==========================
@app.route('/set_mode', methods=['POST'])
def set_mode():
    global current_mode
    global drowsy_frame_counter, drowsy_alert_active, drowsy_alert_start_time, drowsy_alert_type
    try:
        data     = request.get_json()
        new_mode = data.get('mode')
        allowed_modes = ['emotion', 'sleeping', 'phone', 'hand', 'cigarette', 'gun']
        if new_mode in allowed_modes:
            with mode_lock:
                current_mode            = new_mode
                drowsy_frame_counter    = 0
                drowsy_alert_active     = False
                drowsy_alert_start_time = 0.0
                drowsy_alert_type       = None
            return jsonify({'status': 'success', 'current_mode': new_mode})
        return jsonify({'error': 'Invalid mode'}), 400
    except Exception:
        return jsonify({'error': 'Server error'}), 500


# ========================== PROCESS FRAME API ==========================
@app.route('/process_frame', methods=['POST'])
def process_frame_api():
    global total_confidence
    try:
        data       = request.get_json()
        image_data = data['frame'].split(',')[1]
        img_bytes  = base64.b64decode(image_data)
        frame      = cv2.imdecode(np.frombuffer(img_bytes, np.uint8), cv2.IMREAD_COLOR)

        if frame is None:
            return jsonify({'error': 'Invalid image'}), 400

        frame     = cv2.resize(frame, (854, 480))
        annotated = process_frame(frame)

        _, buffer    = cv2.imencode('.jpg', annotated)
        jpg_as_text  = base64.b64encode(buffer).decode('utf-8')

        # Build stats for the current mode
        with stats_lock:
            if current_mode == "emotion":
                with lock:
                    if total_confidence > 0:
                        mode_stats = {k: float(round(v / total_confidence * 100, 1))
                                      for k, v in emotion_stats.items()}
                    else:
                        mode_stats = {k: 0.0 for k in emotion_stats}
                if 'surprise' in mode_stats:
                    mode_stats['surprised'] = mode_stats.pop('surprise')

            elif current_mode == "sleeping":
                mode_stats = _get_sleeping_stats()

            elif current_mode == "phone":
                total = phone_stats["phone"] + phone_stats["no_phone"]
                mode_stats = {
                    "phone":    round(phone_stats["phone"]    / total * 100, 1) if total else 0,
                    "no_phone": round(phone_stats["no_phone"] / total * 100, 1) if total else 0
                }
            elif current_mode == "hand":
                total = hand_stats["up"] + hand_stats["down"]
                mode_stats = {
                    "up":   round(hand_stats["up"]   / total * 100, 1) if total else 0,
                    "down": round(hand_stats["down"] / total * 100, 1) if total else 0
                }
            elif current_mode == "cigarette":
                total = cigarette_stats["cigarette"] + cigarette_stats["no_cigarette"]
                mode_stats = {
                    "cigarette":    round(cigarette_stats["cigarette"]    / total * 100, 1) if total else 0,
                    "no_cigarette": round(cigarette_stats["no_cigarette"] / total * 100, 1) if total else 0
                }
            elif current_mode == "gun":
                total = gun_stats["gun"] + gun_stats["no_gun"]
                mode_stats = {
                    "gun":    round(gun_stats["gun"]    / total * 100, 1) if total else 0,
                    "no_gun": round(gun_stats["no_gun"] / total * 100, 1) if total else 0
                }
            else:
                mode_stats = {}

        return jsonify({
            'image':        f"data:image/jpeg;base64,{jpg_as_text}",
            'stats':        mode_stats,
            'current_mode': current_mode
        })
    except Exception as e:
        print(traceback.format_exc())
        return jsonify({'error': 'Server error'}), 500


# ========================== STATS ENDPOINT ==========================
@app.route('/stats')
def get_stats():
    with stats_lock:
        if current_mode == "emotion":
            with lock:
                if total_confidence > 0:
                    stats_data = {k: float(round(v / total_confidence * 100, 1))
                                  for k, v in emotion_stats.items()}
                else:
                    stats_data = {k: 0.0 for k in emotion_stats}
            if 'surprise' in stats_data:
                stats_data['surprised'] = stats_data.pop('surprise')
            return jsonify(stats_data)

        elif current_mode == "sleeping":
            return jsonify(_get_sleeping_stats())

        elif current_mode == "phone":
            total = phone_stats["phone"] + phone_stats["no_phone"]
            return jsonify({
                "phone":    round(phone_stats["phone"]    / total * 100, 1) if total else 0,
                "no_phone": round(phone_stats["no_phone"] / total * 100, 1) if total else 0
            })
        elif current_mode == "hand":
            total = hand_stats["up"] + hand_stats["down"]
            return jsonify({
                "up":   round(hand_stats["up"]   / total * 100, 1) if total else 0,
                "down": round(hand_stats["down"] / total * 100, 1) if total else 0
            })
        elif current_mode == "cigarette":
            total = cigarette_stats["cigarette"] + cigarette_stats["no_cigarette"]
            return jsonify({
                "cigarette":    round(cigarette_stats["cigarette"]    / total * 100, 1) if total else 0,
                "no_cigarette": round(cigarette_stats["no_cigarette"] / total * 100, 1) if total else 0
            })
        elif current_mode == "gun":
            total = gun_stats["gun"] + gun_stats["no_gun"]
            return jsonify({
                "gun":    round(gun_stats["gun"]    / total * 100, 1) if total else 0,
                "no_gun": round(gun_stats["no_gun"] / total * 100, 1) if total else 0
            })
        else:
            return jsonify({})


@app.route('/')
def index():
    return render_template('index.html')

@app.after_request
def add_ngrok_header(response):
    response.headers['ngrok-skip-browser-warning'] = 'true'
    return response

if __name__ == "__main__":
    print("🚀 Starting Flask App")
    print("   • Quick trigger : ~0.67s both eyes / ~0.83s one eye")
    print("   • Persistent alert : 30 seconds full-screen")
    print("   • Alert survives face disappearing from frame")
    print("   • Stats : drowsy_both | drowsy_one | alert | total_drowsy")
    reader_thread = threading.Thread(target=rtsp_reader, daemon=True)
    reader_thread.start()
    app.run(host="0.0.0.0", port=5000, debug=False)