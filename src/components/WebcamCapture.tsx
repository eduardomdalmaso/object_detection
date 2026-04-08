import { useEffect, useRef, useState, memo } from "react";
import { Video, VideoOff, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface WebcamCaptureProps {
  cameraId: string;
  className?: string;
  variant?: "default" | "compact";
}

function WebcamCaptureComponent({ cameraId, className, variant = "default" }: WebcamCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const intervalRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [isStreaming, setIsStreaming] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startWebcam = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // 1. Get webcam access
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 854, height: 480, facingMode: "user" },
        audio: false,
      });
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      // 2. Connect WebSocket to the backend
      const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${wsProtocol}//${window.location.host}/ws/webcam/${cameraId}`;
      const ws = new WebSocket(wsUrl);
      ws.binaryType = "arraybuffer";
      wsRef.current = ws;

      ws.onopen = () => {
        setIsStreaming(true);
        setIsLoading(false);

        // 3. Send frames at ~10 FPS
        intervalRef.current = window.setInterval(() => {
          if (!videoRef.current || !canvasRef.current || ws.readyState !== WebSocket.OPEN) return;

          const canvas = canvasRef.current;
          const ctx = canvas.getContext("2d");
          if (!ctx) return;

          canvas.width = 854;
          canvas.height = 480;
          ctx.drawImage(videoRef.current, 0, 0, 854, 480);

          canvas.toBlob(
            (blob) => {
              if (blob && ws.readyState === WebSocket.OPEN) {
                // Drop frame if backend is lagging heavily (keeps real-time tight)
                if (ws.bufferedAmount > 1024 * 512) return;
                blob.arrayBuffer().then((buf) => ws.send(buf));
              }
            },
            "image/jpeg",
            0.7
          );
        }, 100); // 10 FPS
      };

      ws.onclose = () => {
        stopWebcam();
      };

      ws.onerror = () => {
        setError("Erro na conexão WebSocket");
        setIsLoading(false);
        stopWebcam();
      };
    } catch (err: any) {
      setError(err.message || "Não foi possível acessar a webcam");
      setIsLoading(false);
    }
  };

  const stopWebcam = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsStreaming(false);
    setIsLoading(false);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => stopWebcam();
  }, []);

  return (
    <div className={cn("flex flex-col items-center gap-3", className)}>
      {/* Hidden video + canvas for capture */}
      <video ref={videoRef} className="hidden" playsInline muted />
      <canvas ref={canvasRef} className="hidden" />

      {variant === "compact" ? (
        <button
          onClick={isStreaming ? stopWebcam : startWebcam}
          disabled={isLoading}
          title={isStreaming ? "Parar Transmissão Local" : "Transmitir Webcam"}
          className={cn(
            "text-xs font-medium flex items-center gap-1 transition-colors px-2 py-1 rounded",
            isStreaming 
              ? "bg-red-100 text-red-700 animate-pulse hover:bg-red-200" 
              : "text-emerald-600 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-900/20",
            isLoading && "opacity-50 cursor-not-allowed"
          )}
        >
          {isLoading ? (
             <><Loader2 className="h-3 w-3 animate-spin" /> Conectando</>
          ) : isStreaming ? (
             <><VideoOff className="h-3.5 w-3.5" /> Parar</>
          ) : (
             <>📡 Transmitir</>
          )}
        </button>
      ) : (
        <>
          {/* Control button Default */}
          {!isStreaming ? (
            <button
              onClick={startWebcam}
              disabled={isLoading}
              className={cn(
                "flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all shadow-sm",
                "bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
              )}
            >
              {isLoading ? (
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
              onClick={stopWebcam}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold bg-red-600 text-white hover:bg-red-700 transition-all shadow-sm"
            >
              <VideoOff className="h-4 w-4" />
              Parar Webcam
            </button>
          )}

          {isStreaming && (
            <div className="flex items-center gap-2 text-xs text-emerald-600 font-medium animate-pulse">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              Transmitindo webcam ao vivo — visualize no painel principal
            </div>
          )}

          {error && (
            <p className="text-xs text-red-500 font-medium">{error}</p>
          )}
        </>
      )}
    </div>
  );
}

export const WebcamCapture = memo(WebcamCaptureComponent);
