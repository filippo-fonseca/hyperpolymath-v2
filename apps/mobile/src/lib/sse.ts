// SSE subscription to /api/jarvis/physical/events — the same stream the
// desktop app consumes (apps/desktop/src/physical-extender/sse-client.ts).
// Uses react-native-sse since React Native has no native EventSource.

import EventSource from "react-native-sse";

import { getAuthBearer } from "./auth-token";
import { getSettings } from "./settings";

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

/**
 * Open the SSE connection. Returns a close function. react-native-sse
 * auto-reconnects on errors (pollingInterval).
 */
export function subscribeJarvisEvents(handlers: JarvisSseHandlers): () => void {
  const base = getSettings().serverUrl.replace(/\/$/, "");
  const token = getAuthBearer();

  const es = new EventSource<JarvisEvent>(`${base}/api/jarvis/physical/events`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
    pollingInterval: 3000,
  });

  handlers.onStatus?.("connecting");

  es.addEventListener("open", () => handlers.onStatus?.("connected"));
  es.addEventListener("hello", () => handlers.onStatus?.("connected"));
  es.addEventListener("error", () => handlers.onStatus?.("error"));

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

  return () => {
    es.removeAllEventListeners();
    es.close();
  };
}
