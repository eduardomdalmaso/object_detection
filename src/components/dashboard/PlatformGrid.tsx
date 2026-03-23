import { useState, useEffect, memo, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Maximize2, VideoOff, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCameraStore } from "@/store/useCameraStore";
import api from "@/lib/api";
import { ZoneMappingModal } from "./ZoneMappingModal";

/** Resolve Flask MJPEG base URL (fallback) */
function getMjpegBaseUrl(): string {
  return import.meta.env.DEV ? "http://localhost:5000" : window.location.origin;
}

/** Delay before connecting stream for newly added cameras so backend can flush buffer (evita salto no tempo) */
const STREAM_DELAY_MS = 5000;

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
  /** "contain" = show full frame (no crop); "cover" = fill container (dashboard card) */
  objectFit?: "cover" | "contain";
  /** If > 0 and > now: show placeholder until this timestamp (câmera recém-adicionada) */
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

  // When parent bumps streamRefreshKey (e.g. after add/update camera), force stream to reconnect
  useEffect(() => {
    if (streamRefreshKey != null) {
      setHasError(false);
      setRefreshKey(streamRefreshKey);
    }
  }, [streamRefreshKey]);

  // For newly added cameras: don't load stream until delayStreamUntil so backend finishes flush+warmup
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
            {delayStreamUntil > 0 && !delayOver
              ? "..."
              : platformName}
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

// Helper function to normalize direction values (handles localized labels)
function normalizeDirection(
  direction: any,
  t: any,
): "loaded" | "unloaded" | null {
  const raw = (direction || "").toString().trim();
  const v = raw.toLowerCase();

  const dashLoaded =
    t("dashboard.loaded")?.toString().toLowerCase() || "loaded";
  const dashUnloaded =
    t("dashboard.unloaded")?.toString().toLowerCase() || "unloaded";
  const repEmbark =
    t("reports.filters.embark")?.toString().toLowerCase() || "embark";
  const repDisembark =
    t("reports.filters.disembark")?.toString().toLowerCase() || "disembark";

  if (v === "loaded" || v === dashLoaded || v === repEmbark || v === "embark")
    return "loaded";
  if (
    v === "unloaded" ||
    v === dashUnloaded ||
    v === repDisembark ||
    v === "disembark"
  )
    return "unloaded";

  return null;
}

function PlatformGridComponent({
  platformFilter,
  realtimeData,
}: PlatformGridProps) {
  const { t } = useTranslation();
  const cameras = useCameraStore((state: any) => state.cameras);
  const fetchCameras = useCameraStore((state: any) => state.fetchCameras);
  const [streamRefreshKey, setStreamRefreshKey] = useState(() => Date.now());
  const [platformStats, setPlatformStats] = useState<any>({});
  const [zonesByPlatform, setZonesByPlatform] = useState<Record<string, any>>(
    {},
  );
  const [selectedPlatform, setSelectedPlatform] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [expandedPlatform, setExpandedPlatform] = useState<string | null>(null);

  const normalizeZonesPayload = (zones: any): Record<string, any> => {
    const normalized: Record<string, any> = {};
    Object.entries(zones || {}).forEach(([z, v]) => {
      const zoneVal = v as any;
      if (!zoneVal) {
        normalized[z] = zoneVal;
        return;
      }
      if (zoneVal.p1 && zoneVal.p2) {
        normalized[z] = zoneVal;
        return;
      }
      if (
        Array.isArray(zoneVal) &&
        zoneVal.length === 2 &&
        zoneVal[0]?.x !== undefined &&
        zoneVal[1]?.x !== undefined
      ) {
        normalized[z] = {
          p1: [zoneVal[0].x, zoneVal[0].y],
          p2: [zoneVal[1].x, zoneVal[1].y],
        };
        return;
      }
      normalized[z] = zoneVal;
    });
    return normalized;
  };

  useEffect(() => {
    if (!realtimeData?.platforms) return;
    const platformsPayload = realtimeData.platforms;
    const hasCounts = Object.values(platformsPayload || {}).some(
      (p: any) => p?.total_loaded || p?.total_unloaded,
    );
    // Avoid wiping fetched stats with empty realtime payloads
    setPlatformStats((prev: any) => {
      if (!hasCounts && prev && Object.keys(prev).length > 0) return prev;
      return platformsPayload;
    });
  }, [realtimeData]);

  // Only refresh streams when the list of platform IDs actually changes (add/delete), not on every render
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

  useEffect(() => {
    const fetchAllStats = async () => {
      try {
        // Fetch aggregated counts by zone from /api/v1/counts endpoint
        // Use filter_by_zone_creation to only show counts after zones were created
        const today = new Date().toISOString().split("T")[0];
        const response = await api.get("/api/v1/counts", {
          params: {
            start: today,
            end: today,
            plat: platformFilter === "all" ? "all" : platformFilter,
          },
        });

        // Process data to aggregate by platform and zone
        const data = Array.isArray(response.data) ? response.data : [];
        const aggregated: any = {};

        data.forEach((row: any) => {
          const { platform, zone, direction, count } = row;
          // Normalize direction to handle localized labels
          const normalizedDir = normalizeDirection(direction, t);
          if (!normalizedDir) return; // Skip if direction cannot be normalized

          if (!aggregated[platform]) {
            aggregated[platform] = {
              zones: {},
              total_loaded: 0,
              total_unloaded: 0,
              status: "online",
            };
          }
          if (!aggregated[platform].zones[zone]) {
            aggregated[platform].zones[zone] = { loaded: 0, unloaded: 0 };
          }

          const countNum = Number(count) || 0;
          if (normalizedDir === "loaded") {
            aggregated[platform].zones[zone].loaded += countNum;
            aggregated[platform].total_loaded += countNum;
          } else if (normalizedDir === "unloaded") {
            aggregated[platform].zones[zone].unloaded += countNum;
            aggregated[platform].total_unloaded += countNum;
          }
        });

        setPlatformStats(aggregated);
      } catch (error) {
        console.error("Failed to fetch platform grid stats:", error);
      }
    };
    fetchAllStats();
  }, [platformFilter, t]);

  useEffect(() => {
    if (!cameras.length) {
      fetchCameras().catch(() => {
        /* errors already handled in store */
      });
    }
  }, [cameras.length, fetchCameras]);

  // Clean stale cached zones when cameras list changes (but DO NOT clear platformStats
  // here — platform stats should be sourced from the backend (/today-summary) or
  // from realtime feeds and must not be dropped when a camera/platform is
  // temporarily removed from the local `cameras` list).
  useEffect(() => {
    const currentIds = new Set(
      (cameras || []).map((c: any) => String(c.id)).filter(Boolean),
    );
    // Remove zones for platforms that no longer exist
    setZonesByPlatform((prev) => {
      if (!prev) return {};
      const cleaned: Record<string, any> = {};
      Object.entries(prev).forEach(([k, v]) => {
        if (currentIds.has(k)) cleaned[k] = v;
      });
      return cleaned;
    });

    // NOTE: Intentionally do NOT remove entries from `platformStats` here.
    // Keeping `platformStats` intact ensures the dashboard KPIs/charts remain
    // populated using persisted data from the server (/api/v1/counts) even if a camera
    // entry is temporarily removed from the local `cameras` store.
  }, [cameras]);

  // Fetch zones for platforms that don't have them in realtime stats
  useEffect(() => {
    const platformIds = (
      cameras.length ? cameras.map((c: any) => c.id) : []
    ).filter(Boolean);
    if (!platformIds.length) return;

    platformIds.forEach(async (platId: any) => {
      // Avoid fetching if we already have zones for this platform
      setZonesByPlatform((current) => {
        if (current && current[platId]) return current; // already present
        // trigger async fetch below (don't await inside setState)
        (async () => {
          try {
            const res = await api.get(`/get_zones/${platId}`);
            setZonesByPlatform((s) => ({
              ...s,
              [platId]: normalizeZonesPayload(res.data || {}),
            }));
          } catch (err) {
            setZonesByPlatform((s) => ({ ...s, [platId]: {} }));
          }
        })();
        return current;
      });
    });
  }, [cameras]);

  // Listen for external zone updates (e.g., when zone editor saves) and refresh cache
  useEffect(() => {
    const handler = async (ev: Event) => {
      try {
        // @ts-ignore - CustomEvent detail
        const detail = (ev as CustomEvent)?.detail || {};
        const platId = detail.platform;
        if (!platId) return;

        // If the event already contains zone data, apply it immediately
        if (detail.zones) {
          setZonesByPlatform((s) => ({
            ...s,
            [platId]: normalizeZonesPayload(detail.zones || {}),
          }));
          return;
        }

        // Otherwise, fetch from server but only if platform exists in cameras
        const known = cameras.find((c: any) => String(c.id) === String(platId));
        if (!known) return;
        const res = await api.get(`/get_zones/${platId}`);
        setZonesByPlatform((s) => ({
          ...s,
          [platId]: normalizeZonesPayload(res.data || {}),
        }));
      } catch (err) {
        console.error("Failed to refresh zones after zones:updated event", err);
      }
    };

    window.addEventListener("zones:updated", handler as EventListener);
    return () => {
      window.removeEventListener("zones:updated", handler as EventListener);
    };
  }, [cameras]);

  // Memoize platform list to avoid recreating objects on every render (prevents unnecessary remounts
  // of children such as <img> which cause flicker when the element is recreated)
  const platforms = useMemo(() => {
    const base = cameras.length
      ? cameras.map((c: any) => {
          // Ensure stable id/name (avoid using Date.now or unstable fallbacks)
          const idStr = String(
            c.id ?? c.platform ?? `platform${c.platformId ?? "0"}`,
          );
          const nameStr = String(c.name ?? c.id ?? idStr);
          return {
            id: idStr,
            name: nameStr,
            status: c.status ?? "offline",
          };
        })
      : Object.keys(platformStats).map((key: any) => ({
          id: String(key),
          name: String(key),
          status:
            platformStats?.[key]?.status === "live" ? "online" : "offline",
        }));

    return base.map((p: any) => {
      const stats = platformStats?.[p.id];
      // expose numeric totals for conservative zone filtering below
      const numericLoaded =
        stats?.total_loaded !== undefined ? Number(stats.total_loaded) : 0;
      const numericUnloaded =
        stats?.total_unloaded !== undefined ? Number(stats.total_unloaded) : 0;
      return {
        ...p,
        // user-facing formatted strings
        loaded: numericLoaded.toLocaleString(),
        unloaded: numericUnloaded.toLocaleString(),
        // numeric values for logic
        numericLoaded,
        numericUnloaded,
        zones: (() => {
          const configured = zonesByPlatform[p.id] || {};
          const live = stats?.zones || {};
          const merged: any = {};
          // Only show zones that are currently configured (have p1/p2 coordinates)
          // This ensures deleted zones disappear immediately, ignoring historical counts
          Object.keys(configured).forEach((z) => {
            const zoneConfig = configured[z];
            const hasCoords = zoneConfig && zoneConfig.p1 && zoneConfig.p2;
            // Only include if zone has valid coordinates (p1 and p2)
            if (hasCoords) {
              merged[z] = {
                ...zoneConfig,
                loaded: live[z]?.loaded ?? 0,
                unloaded: live[z]?.unloaded ?? 0,
              };
            }
          });
          return merged;
        })(),
      };
    });
  }, [cameras, platformStats, zonesByPlatform]);

  // ...existing code...

  const filteredPlatforms =
    platformFilter === "all"
      ? platforms
      : platforms.filter((p: any) => String(p.id) === platformFilter);

  return (
    <>
      <div className="w-full min-w-full grid grid-flow-col auto-cols-[minmax(85vw,320px)] gap-4 overflow-x-auto md:grid-flow-row md:auto-cols-auto md:grid-cols-2 lg:grid-cols-4 pb-4">
        {filteredPlatforms.map((platform: any) => {
          const isOnline = platform.status === "online";
          const isExpanded = expandedPlatform === String(platform.id);
          return (
            <div
              key={platform.id}
              className={cn("w-[85vw] max-w-[320px] flex-shrink-0 md:w-auto md:max-w-none")}
            >
              <div
                className={cn(
                  "rounded-xl bg-card overflow-hidden border border-border shadow-sm transform-gpu min-h-[460px] relative",
                  "transition-transform transition-shadow duration-200 ease-out",
                  "hover:scale-[1.02] hover:shadow-lg hover:z-10",
                )}
                onClick={() =>
                  setSelectedPlatform({ id: platform.id, name: platform.name })
                }
              >
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
                    aria-label={
                      isExpanded ? t("platform.collapse") : t("platform.expand")
                    }
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
                    title={
                      isExpanded ? t("platform.collapse") : t("platform.expand")
                    }
                  >
                    <Maximize2
                      className={cn(
                        "h-4 w-4 transition-all duration-200",
                        isExpanded
                          ? "text-slate-200 scale-110"
                          : "text-slate-400",
                      )}
                    />
                  </button>
                </div>

                <div
                  className={cn(
                    "aspect-video bg-slate-100 dark:bg-slate-800 relative group cursor-pointer border-b border-slate-200 dark:border-slate-700",
                  )}
                >
                  <MjpegVideoCell
                    platformId={platform.id}
                    platformName={platform.name}
                    streamRefreshKey={streamRefreshKey}
                    delayStreamUntil={
                      newlyAddedPlatformIds.includes(platform.id) && newlyAddedAt
                        ? newlyAddedAt + STREAM_DELAY_MS
                        : 0
                    }
                  />
                </div>

                <div className="px-6 py-4 bg-card dark:bg-slate-800">
                  <div className="flex justify-between items-center text-sm mb-1">
                    <span className="text-slate-600 dark:text-slate-400">
                      {t("platform.loaded")}
                    </span>
                    <span className="font-bold text-foreground">
                      {platform.loaded}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-600 dark:text-slate-400">
                      {t("platform.unloaded")}
                    </span>
                    <span className="font-bold text-foreground">
                      {platform.unloaded}
                    </span>
                  </div>

                  <div className="mt-3">
                    <div className="overflow-x-auto min-h-[72px]">
                      <div className="flex gap-3 py-1">
                        {(() => {
                          const pZones = platform.zones || {};
                          // Only show zones that are currently configured with coordinates
                          // Ignore historical counts from deleted zones
                          const validZoneKeys = ["A", "B", "C"].filter((z) => {
                            const v = pZones[z];
                            // Zone must have valid p1 and p2 coordinates to be shown
                            return (
                              v !== undefined &&
                              v !== null &&
                              v.p1 !== undefined &&
                              v.p2 !== undefined
                            );
                          });

                          if (validZoneKeys.length === 0) {
                            return (
                              <div className="rounded border border-slate-200 dark:border-slate-600 p-2 bg-slate-50 dark:bg-slate-800 w-full flex-1">
                                <div className="font-semibold text-slate-700 dark:text-slate-100">
                                  {t("platform.no_zones")}
                                </div>
                                <div className="text-sm text-muted-foreground">
                                  {t("platform.create_zones")}
                                </div>
                              </div>
                            );
                          }

                          return validZoneKeys.map((z) => (
                            <div
                              key={z}
                              className="rounded border border-slate-200 dark:border-slate-600 p-2 bg-slate-50 dark:bg-slate-800 flex-1 min-w-[120px]"
                            >
                              <div className="font-semibold text-slate-700 dark:text-slate-100">
                                {t("platform.zone", { z })}
                              </div>
                              {(() => {
                                const zoneLoaded = Number(
                                  platform.zones?.[z]?.loaded ?? 0,
                                );
                                const zoneUnloaded = Number(
                                  platform.zones?.[z]?.unloaded ?? 0,
                                );
                                return (
                                  <>
                                    <div className="flex justify-between text-slate-600 dark:text-slate-400">
                                      <span>{t("platform.loaded")}</span>
                                      <span className="font-bold text-green-600 dark:text-green-400">
                                        {zoneLoaded}
                                      </span>
                                    </div>
                                    <div className="flex justify-between text-slate-600 dark:text-slate-400">
                                      <span>{t("platform.unloaded")}</span>
                                      <span className="font-bold text-red-600 dark:text-red-400">
                                        {zoneUnloaded}
                                      </span>
                                    </div>
                                  </>
                                );
                              })()}
                            </div>
                          ));
                        })()}
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700 flex justify-end">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedPlatform({
                          id: platform.id,
                          name: platform.name,
                        });
                      }}
                      className="text-xs text-slate-400 dark:text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 font-medium flex items-center gap-1"
                    >
                      {t("platform.configure_button")}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {selectedPlatform && (
        <ZoneMappingModal
          isOpen={true}
          onClose={() => setSelectedPlatform(null)}
          platform={selectedPlatform.id}
          platformName={selectedPlatform.name}
          onZonesUpdated={(platId, rawZones) => {
            setZonesByPlatform((prev) => ({
              ...(prev || {}),
              [platId]: normalizeZonesPayload(rawZones || {}),
            }));
          }}
        />
      )}

      {/* Expand modal: modest overlay shown when user clicks expand */}
      {expandedPlatform &&
        (() => {
          const plat = platforms.find(
            (p: any) => String(p.id) === String(expandedPlatform),
          );
          if (!plat) return null;

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
                  <div className="font-semibold text-foreground">{plat.name}</div>
                  <button
                    aria-label={t("platform.collapse")}
                    onClick={() => setExpandedPlatform(null)}
                    className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                {/* Same aspect as stream (1020x600), responsive (max 75vh), theme as dashboard; object-contain = no crop */}
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

                <div className="p-4 bg-card">
                  <div className="flex gap-6">
                    <div>
                      <div className="text-sm text-muted-foreground">
                        {t("platform.loaded")}
                      </div>
                      <div className="font-bold text-foreground text-lg">
                        {plat.loaded}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">
                        {t("platform.unloaded")}
                      </div>
                      <div className="font-bold text-foreground text-lg">
                        {plat.unloaded}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}
    </>
  );
}

// Memoize to prevent unnecessary re-renders when parent updates
export const PlatformGrid = memo(PlatformGridComponent);
