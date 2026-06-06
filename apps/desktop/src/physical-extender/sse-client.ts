// apps/desktop/src/physical-extender/sse-client.ts
// Subscribes to the existing Next.js SSE stream at /api/jarvis/physical/events.
// On `trigger` events, starts a cpal capture turn.
//
// Note: EventSource is available in WKWebView (standard browser API).
// The desktop does NOT use @tauri-apps/plugin-http for SSE — EventSource
// handles reconnection automatically and the SSE endpoint is GET-only.

import { startCaptureTurn } from "@/audio/capture";
import { getEnv } from "@/env";

let source: EventSource | null = null;

interface PhysicalTriggerPayload {
  source: string;
  commandId: number;
  commandName?: string;
  at: number;
  desktopClaimed?: boolean;
}

export type SseStatus = "connecting" | "connected" | "error";
type StatusListener = (status: SseStatus) => void;
const statusListeners = new Set<StatusListener>();

export function onSseStatusChange(fn: StatusListener): () => void {
  statusListeners.add(fn);
  return () => statusListeners.delete(fn);
}

function emitStatus(status: SseStatus): void {
  for (const fn of statusListeners) fn(status);
}

/**
 * Open the SSE connection and start listening for `trigger` events.
 * Idempotent — calling while already connected is a no-op.
 * EventSource auto-reconnects on connection errors.
 */
export function startPhysicalExtenderListener(): void {
  if (source) return;

  const { apiBaseUrl } = getEnv();
  source = new EventSource(`${apiBaseUrl}/api/jarvis/physical/events`);
  emitStatus("connecting");

  source.addEventListener("open", () => {
    emitStatus("connected");
    // eslint-disable-next-line no-console
    console.log("[sse] open");
  });

  // Server sends `event: hello` once on the stream opening — also signals open.
  source.addEventListener("hello", () => emitStatus("connected"));

  source.addEventListener("trigger", (e) => {
    const messageEvent = e as MessageEvent<string>;
    let payload: PhysicalTriggerPayload | undefined;
    try {
      payload = JSON.parse(messageEvent.data) as PhysicalTriggerPayload;
    } catch {
      return;
    }
    // eslint-disable-next-line no-console
    console.log(
      `[trigger] source=${payload.source} command=${payload.commandName ?? payload.commandId}`,
    );
    void startCaptureTurn();
  });

  source.onerror = () => {
    emitStatus("error");
    // eslint-disable-next-line no-console
    console.warn("[sse] connection error — EventSource will auto-reconnect");
  };

  // eslint-disable-next-line no-console
  console.log(`[sse] subscribed to ${apiBaseUrl}/api/jarvis/physical/events`);
}

/**
 * Close the SSE connection. Called on clean shutdown (e.g. window close).
 */
export function stopPhysicalExtenderListener(): void {
  if (source) {
    source.close();
    source = null;
  }
}
