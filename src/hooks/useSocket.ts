/**
 * useSocket hook — DISABLED
 *
 * The backend is REST-only (FastAPI). There is no Socket.io server.
 * This hook is kept as a no-op to avoid breaking existing imports.
 * Real-time updates should use polling or SSE if needed in the future.
 */
export function useSocket(_onUpdate: (data: any) => void) {
    // No-op: socket.io is not available on the current backend
}
