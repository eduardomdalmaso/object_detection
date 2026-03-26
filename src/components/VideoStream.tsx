import { useState, useEffect, memo } from 'react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { AlertCircle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface VideoStreamProps {
    /** Platform identifier (e.g., 'platform1', 'platform2') */
    platform: string;
    /** Optional CSS class name for styling */
    className?: string;
    /** Optional title to display above the stream */
    title?: string;
    /** Aspect ratio (default: 16/9) */
    aspectRatio?: 'auto' | '16/9' | '4/3' | '1/1';
}

/**
 * VideoStream Component
 * 
 * Displays MJPEG video stream from Flask backend at /video_feed?plat=<platform>
 * 
 * Features:
 * - Automatic connection/reconnection
 * - Loading state while stream initializes
 * - Error handling with fallback UI
 * - Responsive sizing with aspect ratio control
 * - Query param opcional (defaults to primeiro camera)
 * 
 * Usage:
 * ```tsx
 * <VideoStream 
 *   platform="platform1" 
 *   title="Camera 1" 
 *   className="rounded-lg shadow-lg"
 * />
 * ```
 * 
 * Backend Integration:
 * The Flask endpoint /video_feed (com query param opcional) retorna:
 * 1. MJPEG stream com boundary=frame
 * 2. Autenticação via @login_required
 * 3. Frames JPEG contínuos com zona overlays
 * 
 * Exemplo Flask:
 * ```python
 * @app.route('/video_feed')
 * @login_required
 * def video_feed():
 *     platform = request.args.get('plat') or next(iter(CAMERAS.keys()), None)
 *     return Response(gen_video(platform), mimetype='multipart/x-mixed-replace; boundary=frame')
 * ```
 */
function VideoStreamComponent({
    platform,
    className = '',
    title,
    aspectRatio = '16/9',
}: VideoStreamProps) {
    const { t } = useTranslation();
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isStalled, setIsStalled] = useState(false);
    const [refreshKey, setRefreshKey] = useState(Date.now());
    const [lastFrameTime, setLastFrameTime] = useState(Date.now());
    const reconnectTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
    const frameTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

    // Determine base URL for video stream
    const baseUrl = '';
    // Query param: /video_feed?plat=<platform> or just /video_feed for default
    const streamUrl = `${baseUrl}/video_feed${platform ? `?plat=${encodeURIComponent(platform)}` : ''}&t=${refreshKey}`;

    useEffect(() => {
        // Reset state ONLY when platform changes (not periodically)
        setIsLoading(true);
        setError(null);
        setIsStalled(false);
        setLastFrameTime(Date.now());
        setRefreshKey(Date.now()); // New connection only on platform change
        
        // Clear any pending reconnect timers
        if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
        }
        if (frameTimeoutRef.current) {
            clearTimeout(frameTimeoutRef.current);
        }
    }, [platform]);

    // Monitor for stalled video (no new frames for 5 seconds)
    useEffect(() => {
        const checkFrameTimeout = () => {
            const timeSinceLastFrame = Date.now() - lastFrameTime;
            if (timeSinceLastFrame > 5000 && !isLoading && !error) {
                setIsStalled(true);
                // Attempt auto-recovery with exponential backoff
                attemptReconnect();
            }
        };

        frameTimeoutRef.current = setInterval(checkFrameTimeout, 2000);
        return () => {
            if (frameTimeoutRef.current) clearInterval(frameTimeoutRef.current);
        };
    }, [lastFrameTime, isLoading, error]);

    const attemptReconnect = () => {
        if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
        
        // Exponential backoff: 2s -> 4s -> 8s
        const backoffMs = 2000 * Math.pow(2, (error?.match(/attempt/g) || []).length);
        
        reconnectTimeoutRef.current = setTimeout(() => {
            setError(null);
            setIsStalled(false);
            setRefreshKey(Date.now()); // Force reconnect
            setIsLoading(true);
        }, Math.min(backoffMs, 16000)); // Cap at 16 seconds
    };

    const handleImageLoad = () => {
        setIsLoading(false);
        setError(null);
        setIsStalled(false);
        setLastFrameTime(Date.now()); // Update frame timestamp on successful load
        
        // Clear reconnect timer on successful connection
        if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
            reconnectTimeoutRef.current = null;
        }
    };

    const handleImageError = () => {
        const errorMsg = `Failed to load stream for ${platform}`;
        setError(errorMsg);
        setIsLoading(false);
        setIsStalled(false);
        
        // Trigger auto-reconnect only on error, not periodically
        attemptReconnect();
    };

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
            if (frameTimeoutRef.current) clearInterval(frameTimeoutRef.current);
        };
    }, []);

    // Determine aspect ratio class
    const aspectRatioClass = {
        'auto': 'aspect-auto',
        '16/9': 'aspect-video',
        '4/3': 'aspect-[4/3]',
        '1/1': 'aspect-square',
    }[aspectRatio] || 'aspect-video';

    return (
        <div className={`relative w-full overflow-hidden rounded-lg bg-slate-900 ${aspectRatioClass} ${className}`}>
            {/* Loading state */}
            {isLoading && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/50 backdrop-blur-sm z-10">
                    <Loader2 className="h-8 w-8 animate-spin text-blue-400 mb-2" />
                    <p className="text-sm text-slate-400">{t('platform.connecting')}</p>
                </div>
            )}

            {/* Stalled stream indicator */}
            {isStalled && !isLoading && !error && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/40 backdrop-blur-sm z-10">
                    <Loader2 className="h-8 w-8 animate-spin text-amber-400 mb-2" />
                    <p className="text-sm text-amber-300 font-medium">Stream stalled</p>
                    <p className="text-xs text-slate-400 mt-1">Attempting to reconnect...</p>
                </div>
            )}

            {/* Error state */}
            {error && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900 z-10">
                    <AlertCircle className="h-12 w-12 text-red-500 mb-2" />
                    <p className="text-sm text-red-400 font-medium">{error}</p>
                    <p className="text-xs text-slate-500 mt-2">{t('apiDocs.deploy.backendTip')}</p>
                    <p className="text-xs text-slate-400 mt-1">Will auto-reconnect...</p>
                </div>
            )}

            {/* Video stream - MJPEG image element */}
            <img
                key={`${platform}-${refreshKey}`}
                src={streamUrl}
                alt={title || `Video stream for ${platform}`}
                className="w-full h-full object-cover"
                onLoad={handleImageLoad}
                onError={handleImageError}
                crossOrigin="use-credentials"
                // Prevent browser from caching MJPEG frames
                referrerPolicy="no-referrer"
                decoding="async"
            />

            {/* Optional title overlay */}
            {title && (
                <div className="absolute top-0 left-0 right-0 bg-gradient-to-b from-slate-900/80 to-transparent px-4 py-3">
                    <p className="text-sm font-semibold text-white">{title}</p>
                </div>
            )}

            {/* Connection status indicator */}
            <div className="absolute bottom-2 right-2 flex items-center gap-1 px-2 py-1 bg-slate-900/60 backdrop-blur-sm rounded text-xs text-slate-300">
                <div className={cn(
                    "w-2 h-2 rounded-full",
                    isStalled ? "bg-amber-500 animate-pulse" : 
                    error ? "bg-red-500" : 
                    isLoading ? "bg-blue-500 animate-pulse" :
                    "bg-green-500"
                )} />
                <span>
                    {isStalled ? "Stream stalled" :
                     error ? "Error" :
                     isLoading ? "Connecting..." :
                     "Live"}
                </span>
            </div>
        </div>
    );
}

// Memoize to prevent unnecessary re-renders
export const VideoStream = memo(VideoStreamComponent);
export default VideoStream;
