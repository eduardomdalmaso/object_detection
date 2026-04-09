import { create } from 'zustand';

interface WebcamState {
    activeCameraId: string | null;
    isStreaming: boolean;
    isLoading: boolean;
    error: string | null;
    
    // Actions
    requestStart: (cameraId: string) => void;
    requestStop: () => void;
    setStreamingState: (isStreaming: boolean, isLoading: boolean, error?: string | null) => void;
}

export const useWebcamStore = create<WebcamState>((set) => ({
    activeCameraId: null,
    isStreaming: false,
    isLoading: false,
    error: null,

    requestStart: (cameraId: string) => {
        set({ activeCameraId: cameraId, isLoading: true, error: null, isStreaming: false });
    },
    
    requestStop: () => {
        set({ activeCameraId: null, isLoading: false, isStreaming: false, error: null });
    },

    setStreamingState: (isStreaming: boolean, isLoading: boolean, error?: string | null) => {
        set((state) => ({ 
            isStreaming, 
            isLoading, 
            error: error !== undefined ? error : state.error 
        }));
    }
}));
