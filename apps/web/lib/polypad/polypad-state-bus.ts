/**
 * STUB until tools/jarvis-physical/bridge/ extends to Polypad.
 *
 * Connection-state owner will be the bridge process (USB serial → HTTP POST
 * to /api/polypad/state, then this module subscribes via SSE or short-poll).
 * For now state is set manually — call setPolypadState() from anywhere.
 *
 * Visual QA: in dev, this module ALSO assigns window.__setPolypad =
 * setPolypadState so the user can flip the pill from the devtools console:
 *   window.__setPolypad('connected')
 *   window.__setPolypad('error')
 *   window.__setPolypad('disconnected')
 *
 * Mirrors apps/web/lib/voice/mic-state-bus.ts pattern (zero-dep pub/sub,
 * single-user MVP, plain Set<>).
 */

export type PolypadConnectionState = "connected" | "disconnected" | "error";

let currentPolypadState: PolypadConnectionState = "disconnected";
const stateSubscribers = new Set<(s: PolypadConnectionState) => void>();

export function subscribeToPolypadState(
  fn: (s: PolypadConnectionState) => void,
): () => void {
  stateSubscribers.add(fn);
  fn(currentPolypadState);
  return () => {
    stateSubscribers.delete(fn);
  };
}

export function setPolypadState(s: PolypadConnectionState): void {
  currentPolypadState = s;
  stateSubscribers.forEach((fn) => fn(s));
}

if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") {
  (window as unknown as { __setPolypad?: typeof setPolypadState }).__setPolypad =
    setPolypadState;
}
