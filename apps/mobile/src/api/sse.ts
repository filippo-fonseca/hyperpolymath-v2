// SSE subscription to /api/jarvis/physical/events — the response bus for
// every JARVIS turn (POSTs only return {turnId}; deltas arrive here). Uses
// react-native-sse since React Native has no native EventSource.

import EventSource from "react-native-sse";

import { getAuthBearer } from "../lib/auth-token";
import { getSettings } from "../lib/settings";

export interface JarvisResponseStart {
  turnId: string;
  at: number;
}

export interface JarvisResponseChunk {
  turnId: string;
  delta: string;
  at: number;
}

export interface JarvisToolCall {
  turnId: string;
  toolUseId: string;
  name: string;
  result: unknown;
  at: number;
}

export interface JarvisResponseEnd {
  turnId: string;
  at: number;
}

export interface PhysicalTranscript {
  transcript: string;
  sttDoneAt: number;
  vadEndAt?: number;
  at: number;
}

export type SseStatus = "connecting" | "connected" | "error";

export interface JarvisSseHandlers {
  onStatus?: (status: SseStatus) => void;
  onTranscript?: (payload: PhysicalTranscript) => void;
  onResponseStart?: (payload: JarvisResponseStart) => void;
  onResponseChunk?: (payload: JarvisResponseChunk) => void;
  onToolCall?: (payload: JarvisToolCall) => void;
  onResponseEnd?: (payload: JarvisResponseEnd) => void;
}

type JarvisEvent =
  | "hello"
  | "transcript"
  | "jarvis-response-start"
  | "jarvis-response-chunk"
  | "jarvis-tool-call"
  | "jarvis-response-end";

function parseJson<T>(data: string | null): T | undefined {
  if (!data) return undefined;
  try {
    return JSON.parse(data) as T;
  } catch {
    return undefined;
  }
}

const RECONNECT_DELAY_MS = 3000;

/**
 * Open the SSE connection. Returns a close function.
 *
 * Reconnection is owned here, not by react-native-sse: the library replays
 * the headers captured at construction on every reconnect, so a Supabase
 * bearer that expires mid-session (~1h) would 401 forever. Each attempt
 * re-resolves the bearer and server URL instead.
 */
export function subscribeJarvisEvents(handlers: JarvisSseHandlers): () => void {
  let es: EventSource<JarvisEvent> | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let closed = false;

  const teardown = () => {
    es?.removeAllEventListeners();
    es?.close();
    es = null;
  };

  const retry = () => {
    if (closed || timer) return;
    teardown();
    timer = setTimeout(() => {
      timer = null;
      connect();
    }, RECONNECT_DELAY_MS);
  };

  const connect = () => {
    if (closed) return;
    const base = getSettings().serverUrl.replace(/\/$/, "");
    const token = getAuthBearer(); // fresh bearer on every attempt

    es = new EventSource<JarvisEvent>(`${base}/api/jarvis/physical/events`, {
      headers: token ? { authorization: `Bearer ${token}` } : {},
      pollingInterval: 0, // library reconnect off; retry() owns it
    });

    handlers.onStatus?.("connecting");

    es.addEventListener("open", () => handlers.onStatus?.("connected"));
    es.addEventListener("hello", () => handlers.onStatus?.("connected"));
    es.addEventListener("error", () => {
      handlers.onStatus?.("error");
      retry();
    });
    es.addEventListener("close", () => retry());

    es.addEventListener("transcript", (e) => {
      const payload = parseJson<PhysicalTranscript>(e.data);
      if (payload) handlers.onTranscript?.(payload);
    });

    es.addEventListener("jarvis-response-start", (e) => {
      const payload = parseJson<JarvisResponseStart>(e.data);
      if (payload) handlers.onResponseStart?.(payload);
    });

    es.addEventListener("jarvis-response-chunk", (e) => {
      const payload = parseJson<JarvisResponseChunk>(e.data);
      if (payload) handlers.onResponseChunk?.(payload);
    });

    es.addEventListener("jarvis-tool-call", (e) => {
      const payload = parseJson<JarvisToolCall>(e.data);
      if (payload) handlers.onToolCall?.(payload);
    });

    es.addEventListener("jarvis-response-end", (e) => {
      const payload = parseJson<JarvisResponseEnd>(e.data);
      if (payload) handlers.onResponseEnd?.(payload);
    });
  };

  connect();

  return () => {
    closed = true;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    teardown();
  };
}
