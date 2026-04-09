import re

with open("backend/main.py", "r") as f:
    content = f.read()

# We want to replace from process_frame to the end of _save_detection
import inspect

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
