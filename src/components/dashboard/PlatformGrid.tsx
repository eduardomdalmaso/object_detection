import { useState, useEffect, memo, useMemo, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Maximize2, VideoOff, X, Settings2, Hand, Eye, Smartphone, Smile } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCameraStore } from "@/store/useCameraStore";
import { DetectionConfigModal } from "./DetectionConfigModal";
import api from "@/lib/api";

/** Resolve MJPEG base URL */
function getMjpegBaseUrl(): string {
  return "";
}

/** Generate a persistent browser session ID (stored in localStorage). */
function getOrCreateSessionId(): string {
  const KEY = "wc_session_id";
  let id = localStorage.getItem(KEY);
  if (!id || id.length < 8) {
    // Generate a UUID-like random string
    id = Array.from(crypto.getRandomValues(new Uint8Array(16)))
      .map(b => b.toString(16).padStart(2, "0"))
      .join("");
    localStorage.setItem(KEY, id);
  }
  return id;
}

/** Delay before connecting stream for newly added cameras */
const STREAM_DELAY_MS = 5000;

const DETECTION_MODES = [
  { key: "emotion",   label: "Emoções",      icon: "😄", activeColor: "bg-purple-500/20 border-purple-500 text-purple-700 dark:text-purple-300" },
  { key: "sleeping",  label: "Sonolência",   icon: "😴", activeColor: "bg-amber-500/20 border-amber-500 text-amber-700 dark:text-amber-300" },
  { key: "phone",     label: "Celular",      icon: "📱", activeColor: "bg-blue-500/20 border-blue-500 text-blue-700 dark:text-blue-300" },
  { key: "cigarette", label: "Cigarro",      icon: "🚬", activeColor: "bg-red-500/20 border-red-500 text-red-700 dark:text-red-300" },
  { key: "hand",      label: "Mãos ao Alto", icon: <Hand className="w-4 h-4 text-slate-500" strokeWidth={2.5} />, activeColor: "bg-slate-500/20 border-slate-500 text-slate-700 dark:text-slate-300" },
];

function MjpegVideoCell({
  platformId,
  platformName,
  streamRefreshKey,
  objectFit = "cover",
  delayStreamUntil = 0,
  cameraType = "RTSP",
}: {
  platformId: string;
  platformName: string;
  streamRefreshKey?: number;
  objectFit?: "cover" | "contain";
  delayStreamUntil?: number;
  cameraType?: string;
}) {
  // Force a fresh key on every mount so remount always gets a new MJPEG URL
  const [hasError, setHasError] = useState(false);
  const [refreshKey, setRefreshKey] = useState(() => Date.now());
  const [delayOver, setDelayOver] = useState(delayStreamUntil <= 0 || Date.now() >= delayStreamUntil);
  const [webcamStatus, setWebcamStatus] = useState<"idle" | "connecting" | "streaming" | "error">("idle");
  // For WEBCAM: may be overridden by /webcam/claim to a session-specific camera_id
  const [claimedCamId, setClaimedCamId] = useState<string>(platformId);
  const mjpegBase = getMjpegBaseUrl();
  // Use the claimed camera_id for WEBCAM so the MJPEG stream follows the auto-assigned camera
  const mjpegUrl = `${mjpegBase}/video_feed?plat=${encodeURIComponent(
    cameraType === "WEBCAM" ? claimedCamId : platformId
  )}&t=${refreshKey}`;

  // Refs for webcam resources
  const wsRef = useRef<WebSocket | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const intervalRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  // Guard against state updates after unmount
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    // Always refresh the MJPEG URL on mount to break browser cache
    setRefreshKey(Date.now());
    setHasError(false);
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    setHasError(false);
    setRefreshKey(Date.now());
  }, [platformId]);

  useEffect(() => {
    if (streamRefreshKey != null) {
      setHasError(false);
      setRefreshKey(streamRefreshKey);
    }
  }, [streamRefreshKey]);

  useEffect(() => {
    if (delayStreamUntil <= 0 || Date.now() >= delayStreamUntil) {
      setDelayOver(true);
      return;
    }
    const remaining = delayStreamUntil - Date.now();
    const t = setTimeout(() => setDelayOver(true), Math.max(0, remaining));
    return () => clearTimeout(t);
  }, [delayStreamUntil]);

  const handleError = () => {
    setHasError(true);
    setTimeout(() => {
      setHasError(false);
      setRefreshKey(Date.now());
    }, 4000);
  };

  // ── Auto-start webcam for WEBCAM cameras ──
  const stopWebcam = useCallback(() => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
  }, []);

  useEffect(() => {
    if (cameraType !== "WEBCAM") return;

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      console.warn("getUserMedia not available — HTTPS required for webcam");
      if (mountedRef.current) setWebcamStatus("error");
      return;
    }

    if (mountedRef.current) setWebcamStatus("connecting");

    // ── Step 1: claim a dedicated camera_id for this browser session ──
    const sessionId = getOrCreateSessionId();
    api.post("/api/v1/webcam/claim", { session_id: sessionId })
      .then((res) => {
        if (!mountedRef.current) return;
        const assignedCamId: string = res.data.camera_id;
        setClaimedCamId(assignedCamId);

        // If a new camera was auto-created, refresh the camera list in the store
        // so it appears in the Dashboard without requiring F5
        if (assignedCamId !== platformId) {
          // Trigger camera store refresh (useCameraStore.fetchCameras)
          import("@/store/useCameraStore").then(({ useCameraStore }) => {
            useCameraStore.getState().fetchCameras();
          });
        }

        // Refresh MJPEG URL to use the claimed camera_id
        setRefreshKey(Date.now());

        // ── Step 2: start the camera stream ──
        const video = document.createElement("video");
        video.playsInline = true;
        video.muted = true;
        videoRef.current = video;
        const canvas = document.createElement("canvas");
        canvas.width = 854;
        canvas.height = 480;
        canvasRef.current = canvas;

        navigator.mediaDevices.getUserMedia({ video: { width: 854, height: 480, facingMode: "user" }, audio: false })
          .then((mediaStream) => {
            if (!mountedRef.current) { mediaStream.getTracks().forEach(t => t.stop()); return; }
            streamRef.current = mediaStream;
            video.srcObject = mediaStream;
            video.play();

            const wsProto = window.location.protocol === "https:" ? "wss:" : "ws:";
            const ws = new WebSocket(`${wsProto}//${window.location.host}/ws/webcam/${assignedCamId}`);
            ws.binaryType = "arraybuffer";
            wsRef.current = ws;

            ws.onopen = () => {
              if (!mountedRef.current) { ws.close(); return; }
              setWebcamStatus("streaming");
              intervalRef.current = window.setInterval(() => {
                if (ws.readyState !== WebSocket.OPEN) return;
                const ctx = canvas.getContext("2d");
                if (!ctx) return;
                ctx.drawImage(video, 0, 0, 854, 480);
                canvas.toBlob((blob) => {
                  if (blob && ws.readyState === WebSocket.OPEN) {
                    blob.arrayBuffer().then(buf => ws.send(buf));
                  }
                }, "image/jpeg", 0.65);
              }, 125);
            };

            ws.onerror = () => { if (mountedRef.current) setWebcamStatus("error"); };
            ws.onclose = () => { if (mountedRef.current) setWebcamStatus("idle"); };
          })
          .catch((err) => {
            console.error("Webcam access error:", err);
            if (mountedRef.current) setWebcamStatus("error");
          });
      })
      .catch((err) => {
        console.error("Webcam claim error:", err);
        if (mountedRef.current) setWebcamStatus("error");
      });

    return () => stopWebcam();
  }, [cameraType, platformId, stopWebcam]);

  const showPlaceholder = hasError || (delayStreamUntil > 0 && !delayOver);

  return (
    <>
      <img
        src={delayOver ? mjpegUrl : undefined}
        alt={platformName}
        className={cn(
          "absolute inset-0 w-full h-full",
          objectFit === "contain" ? "object-contain" : "object-cover",
        )}
        onError={handleError}
        onLoad={() => setHasError(false)}
        crossOrigin="use-credentials"
        referrerPolicy="no-referrer"
        decoding="async"
        style={{ display: showPlaceholder ? "none" : "block" }}
      />
      <div
        className={cn(
          "absolute inset-0 flex items-center justify-center bg-slate-100 dark:bg-slate-800",
          !showPlaceholder && "hidden",
        )}
      >
        <div className="flex flex-col items-center text-slate-500 dark:text-slate-400">
          <VideoOff className="h-10 w-10 mb-2" />
          <span className="text-xs">
            {cameraType === "WEBCAM" && webcamStatus === "error"
              ? "Webcam requer HTTPS"
              : delayStreamUntil > 0 && !delayOver ? "..." : platformName}
          </span>
        </div>
      </div>
    </>
  );
}

interface PlatformGridProps {
  platformFilter: string;
  realtimeData?: any;
}

function PlatformGridComponent({
  platformFilter,
}: PlatformGridProps) {
  const { t } = useTranslation();
  const cameras = useCameraStore((state: any) => state.cameras);
  const fetchCameras = useCameraStore((state: any) => state.fetchCameras);
  const [streamRefreshKey, setStreamRefreshKey] = useState(() => Date.now());
  const [detectionModes, setDetectionModes] = useState<Record<string, string[]>>({});
  
  const [localStats, setLocalStats] = useState<Record<string, { attention: number, distractions: number, drowsiness: number }>>({});

  useEffect(() => {
    const fetchLocalStats = async () => {
      try {
        const now = new Date();
        const y = now.getFullYear(), m = String(now.getMonth() + 1).padStart(2, '0'), d = String(now.getDate()).padStart(2, '0');
        const today = `${y}-${m}-${d}`;
        const res = await api.get('/api/v1/reports', { params: { start: today, end: today } });
        const data = res.data?.data || [];
        
        const statsMap: Record<string, { dist: number, drow: number, crit: number }> = {};
        for(const item of data) {
           const id = String(item.camera_id || item.camera_name);
           if (!statsMap[id]) statsMap[id] = { dist: 0, drow: 0, crit: 0 };
           if (item.object_type === 'celular') statsMap[id].dist++;
           else if (item.object_type === 'sonolencia') statsMap[id].drow++;
           else if (item.object_type === 'cigarro' || item.object_type === 'maos_ao_alto') statsMap[id].crit++;
        }

        const finalStats: Record<string, { attention: number, distractions: number, drowsiness: number }> = {};
        Object.entries(statsMap).forEach(([id, counts]) => {
           let penalty = (counts.dist * 2) + (counts.drow * 5) + (counts.crit * 15);
           let attention = Math.max(0, 100 - penalty);
           finalStats[id] = { attention, distractions: counts.dist, drowsiness: counts.drow };
        });
        setLocalStats(finalStats);
      } catch (e) {
        console.error("Failed to fetch local stats in PlatformGrid", e);
      }
    };
    fetchLocalStats();
    const interval = setInterval(fetchLocalStats, 60000); // refresh every minute
    return () => clearInterval(interval);
  }, []);
  const [selectedPlatform, setSelectedPlatform] = useState<{
    id: string;
    name: string;
    modes: string[];
  } | null>(null);
  const [expandedPlatform, setExpandedPlatform] = useState<string | null>(null);

  // Track newly added cameras for stream delay
  const cameraIds = useMemo(
    () => (cameras || []).map((c: any) => c.id).filter(Boolean).sort(),
    [cameras],
  );
  const camerasSignature = cameraIds.join(",");
  const prevCameraIdsRef = useRef<string[]>([]);
  const prevCamerasSignatureRef = useRef<string>("");
  const [newlyAddedPlatformIds, setNewlyAddedPlatformIds] = useState<string[]>([]);
  const [newlyAddedAt, setNewlyAddedAt] = useState(0);

  useEffect(() => {
    if (prevCamerasSignatureRef.current === camerasSignature) return;
    const prevIds = prevCameraIdsRef.current;
    const newlyAdded = cameraIds.filter((id: string) => !prevIds.includes(id));
    prevCameraIdsRef.current = cameraIds;
    prevCamerasSignatureRef.current = camerasSignature;

    if (newlyAdded.length > 0) {
      setNewlyAddedPlatformIds(newlyAdded);
      setNewlyAddedAt(Date.now());
      const t = setTimeout(() => {
        setNewlyAddedPlatformIds([]);
        setNewlyAddedAt(0);
        setStreamRefreshKey(Date.now());
      }, STREAM_DELAY_MS);
      return () => clearTimeout(t);
    }
    setStreamRefreshKey(Date.now());
  }, [camerasSignature, cameraIds]);

  // Fetch cameras
  useEffect(() => {
    if (!cameras.length) {
      fetchCameras().catch(() => {});
    }
  }, [cameras.length, fetchCameras]);

  // Initialize detection modes from cameras store (now a list)
  useEffect(() => {
    const modes: Record<string, string[]> = {};
    (cameras || []).forEach((c: any) => {
      const m = c.detection_modes || c.detection_mode;
      modes[String(c.id)] = Array.isArray(m) ? m : (m ? [m] : ["emotion"]);
    });
    setDetectionModes((prev) => ({ ...prev, ...modes }));
  }, [cameras]);

  // Build platform list
  const platforms = useMemo(() => {
    return (cameras || []).map((c: any) => {
      const idStr = String(c.id ?? `camera${c.platformId ?? "0"}`);
      const nameStr = String(c.name ?? c.id ?? idStr);
      const modes = detectionModes[idStr] || (Array.isArray(c.detection_modes) ? c.detection_modes : ["emotion"]);
      return {
        id: idStr,
        name: nameStr,
        status: c.status ?? "offline",
        detection_modes: modes,
        cameraType: c.cameraType || "RTSP",
      };
    });
  }, [cameras, detectionModes]);

  const filteredPlatforms =
    platformFilter === "all"
      ? platforms
      : platforms.filter((p: any) => String(p.id) === platformFilter);

  return (
    <>
      <div className="w-full min-w-full grid grid-flow-col auto-cols-[minmax(85vw,400px)] gap-5 overflow-x-auto md:grid-flow-row md:auto-cols-auto md:grid-cols-2 lg:grid-cols-3 pb-4">
        {filteredPlatforms.map((platform: any) => {
          const isOnline = platform.status === "online";
          const isExpanded = expandedPlatform === String(platform.id);
          const activeModes: string[] = detectionModes[platform.id] || platform.detection_modes || ["emotion"];

          return (
            <div
              key={platform.id}
              className={cn("w-[85vw] max-w-[400px] flex-shrink-0 md:w-auto md:max-w-none")}
            >
              <div
                className={cn(
                  "rounded-xl bg-card overflow-hidden border border-border shadow-sm transform-gpu flex flex-col",
                  "transition-transform transition-shadow duration-200 ease-out",
                  "hover:scale-[1.02] hover:shadow-lg hover:z-10",
                )}
              >
                {/* Header */}
                <div className="bg-slate-800 dark:bg-slate-900 px-4 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-white">
                      {platform.name}
                    </span>
                    <span
                      className={cn(
                        "h-2 w-2 rounded-full",
                        isOnline ? "bg-green-400" : "bg-red-400",
                      )}
                    />
                  </div>

                  <button
                    aria-label={isExpanded ? t("platform.collapse") : t("platform.expand")}
                    onClick={(e) => {
                      e.stopPropagation();
                      setExpandedPlatform((p) =>
                        p === String(platform.id) ? null : String(platform.id),
                      );
                    }}
                    className={cn(
                      "p-2 rounded-lg transition-all duration-200 ease-out",
                      "hover:bg-slate-600/50 hover:backdrop-blur-sm",
                      "active:scale-95",
                      isExpanded && "bg-slate-600/30 backdrop-blur-sm",
                    )}
                    title={isExpanded ? t("platform.collapse") : t("platform.expand")}
                  >
                    <Maximize2
                      className={cn(
                        "h-4 w-4 transition-all duration-200",
                        isExpanded ? "text-slate-200 scale-110" : "text-slate-400",
                      )}
                    />
                  </button>
                </div>

                {/* Stream */}
                <div
                  className="w-full aspect-[4/3] shrink-0 bg-black relative group cursor-pointer border-b border-slate-200 dark:border-slate-700"
                >
                  <MjpegVideoCell
                    platformId={platform.id}
                    platformName={platform.name}
                    streamRefreshKey={streamRefreshKey}
                    objectFit="contain"
                    cameraType={platform.cameraType}
                    delayStreamUntil={
                      newlyAddedPlatformIds.includes(platform.id) && newlyAddedAt
                        ? newlyAddedAt + STREAM_DELAY_MS
                        : 0
                    }
                  />
                </div>

                {/* Local KPIs and Configuration Footer */}
                <div className="px-4 py-3 bg-card dark:bg-slate-800 flex items-center justify-between border-t border-border">
                  <div className="flex gap-4 items-center">
                    <div className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400 font-semibold text-sm">
                      <Eye className="h-4 w-4" />
                      {localStats[platform.id]?.attention ?? 100}%
                    </div>
                    <div className="flex items-center gap-1 text-slate-500 dark:text-slate-400 text-xs font-medium" title="Distrações (Celular)">
                      <Smartphone className="h-3.5 w-3.5" />
                      {localStats[platform.id]?.distractions ?? 0}
                    </div>
                    <div className="flex items-center gap-1 text-slate-500 dark:text-slate-400 text-xs font-medium" title="Sonolência">
                      <Smile className="h-3.5 w-3.5 text-yellow-600" />
                      {localStats[platform.id]?.drowsiness ?? 0}
                    </div>
                  </div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedPlatform({
                        id: platform.id,
                        name: platform.name,
                        modes: activeModes,
                      });
                    }}
                    className="text-xs text-blue-500 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium flex items-center gap-1 transition-colors"
                  >
                    <Settings2 className="h-3.5 w-3.5" />
                    Configurar
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Detection Config Modal — multi-select */}
      {selectedPlatform && (
        <DetectionConfigModal
          isOpen={true}
          onClose={() => setSelectedPlatform(null)}
          cameraId={selectedPlatform.id}
          cameraName={selectedPlatform.name}
          currentModes={detectionModes[selectedPlatform.id] || selectedPlatform.modes}
          onModesChanged={(camId, newModes) => {
            setDetectionModes((s) => ({ ...s, [camId]: newModes }));
          }}
        />
      )}

      {/* Expand modal */}
      {expandedPlatform &&
        (() => {
          const plat = platforms.find(
            (p: any) => String(p.id) === String(expandedPlatform),
          );
          if (!plat) return null;
          const activeModes = detectionModes[plat.id] || plat.detection_modes || ["emotion"];

          return (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
              onClick={() => setExpandedPlatform(null)}
            >
              <div className="absolute inset-0 bg-black/40" />

              <div
                className="relative w-full max-w-5xl bg-card rounded-lg shadow-lg overflow-hidden z-10 border border-border"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-slate-100 dark:bg-slate-900">
                  <div className="flex items-center gap-3">
                    <div className="font-semibold text-foreground">{plat.name}</div>
                    <div className="flex gap-1.5">
                      {activeModes.map((mKey: string) => {
                        const m = DETECTION_MODES.find((d) => d.key === mKey);
                        return m ? (
                          <span key={mKey} className="text-xs px-2 py-0.5 rounded-md bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium">
                            {m.icon} {m.label}
                          </span>
                        ) : null;
                      })}
                    </div>
                  </div>
                  <button
                    aria-label={t("platform.collapse")}
                    onClick={() => setExpandedPlatform(null)}
                    className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <div className="w-full max-h-[75vh] min-h-0 flex justify-center bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                  <div className="aspect-[1020/600] w-full max-h-[75vh] relative">
                    <MjpegVideoCell
                      platformId={plat.id}
                      platformName={plat.name}
                      streamRefreshKey={streamRefreshKey}
                      objectFit="contain"
                      delayStreamUntil={
                        newlyAddedPlatformIds.includes(plat.id) && newlyAddedAt
                          ? newlyAddedAt + STREAM_DELAY_MS
                          : 0
                      }
                    />
                  </div>
                </div>

                {/* Read-only detection badges in expanded view */}
                <div className="p-4 bg-card flex items-center gap-4">
                  <span className="text-sm font-medium text-muted-foreground">Detecções:</span>
                  <div className="flex gap-2 flex-wrap">
                    {activeModes.map((mKey: string) => {
                      const mode = DETECTION_MODES.find((d) => d.key === mKey);
                      return mode ? (
                        <span
                          key={mKey}
                          className={cn(
                            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium",
                            mode.activeColor,
                          )}
                        >
                          <span>{mode.icon}</span>
                          {mode.label}
                        </span>
                      ) : null;
                    })}
                  </div>
                </div>
              </div>
            </div>
          );
        })()}
    </>
  );
}

export const PlatformGrid = memo(PlatformGridComponent);
