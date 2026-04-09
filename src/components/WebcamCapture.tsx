import { memo } from "react";
import { Video, VideoOff, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useWebcamStore } from "@/store/useWebcamStore";

interface WebcamCaptureProps {
  cameraId: string;
  className?: string;
  variant?: "default" | "compact";
}

function WebcamCaptureComponent({ cameraId, className, variant = "default" }: WebcamCaptureProps) {
  const { 
    activeCameraId, 
    isStreaming, 
    isLoading, 
    error, 
    requestStart, 
    requestStop 
  } = useWebcamStore();

  const isThisCameraActive = activeCameraId === cameraId;
  const isThisCameraLoading = isLoading && activeCameraId === cameraId;

  const handleToggle = () => {
    if (isThisCameraActive) {
      requestStop();
    } else {
      requestStart(cameraId);
    }
  };

  return (
    <div className={cn("flex flex-col items-center gap-3", className)}>
      {variant === "compact" ? (
        <button
          onClick={handleToggle}
          disabled={isLoading && !isThisCameraLoading} // Disable if another camera is loading
          title={isThisCameraActive ? "Parar Transmissão Local" : "Transmitir Webcam"}
          className={cn(
            "text-xs font-medium flex items-center gap-1 transition-colors px-2 py-1 rounded",
            isThisCameraActive 
              ? "bg-red-100 text-red-700 animate-pulse hover:bg-red-200" 
              : "text-emerald-600 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-900/20",
            (isLoading && !isThisCameraLoading) && "opacity-50 cursor-not-allowed"
          )}
        >
          {isThisCameraLoading ? (
             <><Loader2 className="h-3 w-3 animate-spin" /> Conectando</>
          ) : isThisCameraActive ? (
             <><VideoOff className="h-3.5 w-3.5" /> Parar</>
          ) : (
             <>📡 Transmitir</>
          )}
        </button>
      ) : (
        <>
          {/* Control button Default */}
          {!isThisCameraActive ? (
            <button
              onClick={handleToggle}
              disabled={isLoading && !isThisCameraLoading}
              className={cn(
                "flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all shadow-sm",
                "bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
              )}
            >
              {isThisCameraLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Conectando webcam...
                </>
              ) : (
                <>
                  <Video className="h-4 w-4" />
                  Iniciar Webcam
                </>
              )}
            </button>
          ) : (
            <button
              onClick={handleToggle}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold bg-red-600 text-white hover:bg-red-700 transition-all shadow-sm"
            >
              <VideoOff className="h-4 w-4" />
              Parar Webcam
            </button>
          )}

          {isThisCameraActive && isStreaming && (
            <div className="flex items-center gap-2 text-xs text-emerald-600 font-medium animate-pulse">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              Transmitindo webcam ao vivo globalmente
            </div>
          )}

          {isThisCameraActive && error && (
            <p className="text-xs text-red-500 font-medium">{error}</p>
          )}
        </>
      )}
    </div>
  );
}

export const WebcamCapture = memo(WebcamCaptureComponent);
