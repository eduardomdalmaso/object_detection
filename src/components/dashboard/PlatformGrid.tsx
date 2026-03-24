import { useState, useEffect, memo, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Maximize2, VideoOff, X, Settings2, Crosshair } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCameraStore } from "@/store/useCameraStore";
import { DetectionConfigModal } from "./DetectionConfigModal";

/** Resolve MJPEG base URL */
function getMjpegBaseUrl(): string {
  return import.meta.env.DEV ? "http://localhost:8000" : window.location.origin;
}

/** Delay before connecting stream for newly added cameras */
const STREAM_DELAY_MS = 5000;

const DETECTION_MODES = [
  { key: "emotion",   label: "Emoções",      icon: "😄", activeColor: "bg-purple-500/20 border-purple-500 text-purple-700 dark:text-purple-300" },
  { key: "sleeping",  label: "Sonolência",   icon: "😴", activeColor: "bg-amber-500/20 border-amber-500 text-amber-700 dark:text-amber-300" },
  { key: "phone",     label: "Celular",      icon: "📱", activeColor: "bg-blue-500/20 border-blue-500 text-blue-700 dark:text-blue-300" },
  { key: "cigarette", label: "Cigarro",      icon: "🚬", activeColor: "bg-red-500/20 border-red-500 text-red-700 dark:text-red-300" },
  { key: "firearm",   label: "Arma de Fogo", icon: <Crosshair className="w-4 h-4 text-slate-500" strokeWidth={2.5} />, activeColor: "bg-slate-500/20 border-slate-500 text-slate-700 dark:text-slate-300" },
];

function MjpegVideoCell({
  platformId,
  platformName,
  streamRefreshKey,
  objectFit = "cover",
  delayStreamUntil = 0,
}: {
  platformId: string;
  platformName: string;
  streamRefreshKey?: number;
  objectFit?: "cover" | "contain";
  delayStreamUntil?: number;
}) {
  const [hasError, setHasError] = useState(false);
  const [refreshKey, setRefreshKey] = useState(Date.now());
  const [delayOver, setDelayOver] = useState(delayStreamUntil <= 0 || Date.now() >= delayStreamUntil);
  const mjpegBase = getMjpegBaseUrl();
  const mjpegUrl = `${mjpegBase}/video_feed?plat=${encodeURIComponent(platformId)}&t=${refreshKey}`;

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
            {delayStreamUntil > 0 && !delayOver ? "..." : platformName}
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
                    delayStreamUntil={
                      newlyAddedPlatformIds.includes(platform.id) && newlyAddedAt
                        ? newlyAddedAt + STREAM_DELAY_MS
                        : 0
                    }
                  />
                </div>

                {/* Detection Modes — READ-ONLY display */}
                <div className="px-4 py-3 bg-card dark:bg-slate-800 h-[140px] flex flex-col">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Detecções Ativas
                      </span>
                    </div>

                    {/* Read-only mode badges */}
                    <div className="flex gap-1.5 flex-wrap overflow-hidden max-h-[50px]">
                    {activeModes.map((modeKey) => {
                      const mode = DETECTION_MODES.find((m) => m.key === modeKey);
                      if (!mode) return null;
                      return (
                        <span
                          key={modeKey}
                          className={cn(
                            "flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-medium",
                            mode.activeColor,
                          )}
                        >
                          <span className="text-sm">{mode.icon}</span>
                          <span className="hidden sm:inline">{mode.label}</span>
                        </span>
                      );
                    })}
                    {activeModes.length === 0 && (
                      <span className="text-xs text-muted-foreground italic">Nenhuma detecção ativa</span>
                    )}
                  </div>
                  </div>

                  {/* Configure button — only way to change modes */}
                  <div className="mt-auto pt-3 border-t border-slate-100 dark:border-slate-700 flex justify-end">
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
                      Configurar Detecções
                    </button>
                  </div>
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
