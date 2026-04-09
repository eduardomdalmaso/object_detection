import { useEffect, useRef, memo } from "react";
import { useWebcamStore } from "@/store/useWebcamStore";

function GlobalWebcamProviderComponent() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const intervalRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const activeCameraId = useWebcamStore((s) => s.activeCameraId);
  const setStreamingState = useWebcamStore((s) => s.setStreamingState);

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
    setStreamingState(false, false, null);
  };

  const startWebcam = async (cameraId: string) => {
    try {
      setStreamingState(false, true, null);

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
        setStreamingState(true, false, null);

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
        useWebcamStore.getState().requestStop(); // also clear global state active ID
      };

      ws.onerror = () => {
        setStreamingState(false, false, "Erro na conexão WebSocket");
        stopWebcam();
        useWebcamStore.getState().requestStop();
      };
    } catch (err: any) {
      setStreamingState(false, false, err.message || "Não foi possível acessar a webcam");
      // keep active ID or clear? We clear it on failure.
      useWebcamStore.getState().requestStop();
    }
  };

  useEffect(() => {
    if (activeCameraId) {
      startWebcam(activeCameraId);
    } else {
      stopWebcam();
    }
    
    // cleanup when unmounting provider (should ideally never happen during app lifecycle)
    return () => stopWebcam();
  }, [activeCameraId]);

  return (
    <>
      <video ref={videoRef} className="hidden" playsInline muted />
      <canvas ref={canvasRef} className="hidden" />
    </>
  );
}

export const GlobalWebcamProvider = memo(GlobalWebcamProviderComponent);
