// apps/desktop/src/physical-extender/sse-client.ts
// Subscribes to the existing Next.js SSE stream at /api/jarvis/physical/events.
// On `trigger` events, starts a cpal capture turn (unless PE mode is disabled
// via setPeEnabled(false), in which case the event is ignored — keyboard hotkey
// is used instead).
// On `jarvis-response-*` events, forwards them to registered listeners so
// the desktop UI can render the server-side JARVIS response without the browser.

import { startCaptureTurn } from "@/audio/capture";
import { getEnv } from "@/env";
import { getDeviceToken } from "@/auth/device-token";

let source: EventSource | null = null;

/** When false, incoming `trigger` SSE events are ignored. The global
 *  keyboard hotkey (Cmd+Shift+J) fires startCaptureTurn() directly. */
let _peEnabled = true;

export function setPeEnabled(enabled: boolean): void {
  _peEnabled = enabled;
}

interface PhysicalTriggerPayload {
  source: string;
  commandId: number;
  commandName?: string;
  at: number;
  desktopClaimed?: boolean;
}

interface JarvisResponseStartPayload {
  turnId: string;
  at: number;
}

interface JarvisResponseChunkPayload {
  turnId: string;
  delta: string;
  at: number;
}

interface JarvisToolCallPayload {
  turnId: string;
  toolUseId: string;
  name: string;
  result: unknown;
  at: number;
}

interface JarvisResponseEndPayload {
  turnId: string;
  at: number;
}

export type SseStatus = "connecting" | "connected" | "error";
type StatusListener = (status: SseStatus) => void;
const statusListeners = new Set<StatusListener>();

type ResponseStartListener = (payload: JarvisResponseStartPayload) => void;
type ResponseChunkListener = (payload: JarvisResponseChunkPayload) => void;
type ToolCallListener = (payload: JarvisToolCallPayload) => void;
type ResponseEndListener = (payload: JarvisResponseEndPayload) => void;

const responseStartListeners = new Set<ResponseStartListener>();
const responseChunkListeners = new Set<ResponseChunkListener>();
const toolCallListeners = new Set<ToolCallListener>();
const responseEndListeners = new Set<ResponseEndListener>();

export function onSseStatusChange(fn: StatusListener): () => void {
  statusListeners.add(fn);
  return () => statusListeners.delete(fn);
}

export function onJarvisResponseStart(fn: ResponseStartListener): () => void {
  responseStartListeners.add(fn);
  return () => responseStartListeners.delete(fn);
}

export function onJarvisResponseChunk(fn: ResponseChunkListener): () => void {
  responseChunkListeners.add(fn);
  return () => responseChunkListeners.delete(fn);
}

export function onJarvisToolCall(fn: ToolCallListener): () => void {
  toolCallListeners.add(fn);
  return () => toolCallListeners.delete(fn);
}

export function onJarvisResponseEnd(fn: ResponseEndListener): () => void {
  responseEndListeners.add(fn);
  return () => responseEndListeners.delete(fn);
}

function emitStatus(status: SseStatus): void {
  for (const fn of statusListeners) fn(status);
}

function parseJson<T>(data: string): T | undefined {
  try {
    return JSON.parse(data) as T;
  } catch {
    return undefined;
  }
}

/**
 * Open the SSE connection and start listening for `trigger` and
 * `jarvis-response-*` events. Idempotent — calling while already
 * connected is a no-op. EventSource auto-reconnects on errors.
 *
 * The events endpoint is authenticated. EventSource cannot send custom
 * headers, so we pass the paired device token (hpd_...) as a `?token=` query
 * param, which the server treats identically to an Authorization: Bearer
 * header. Without a token the connection will 401 — paste one in via the
 * web /settings/desktop and into the desktop app's token field.
 */
export async function startPhysicalExtenderListener(): Promise<void> {
  if (source) return;

  const { apiBaseUrl } = getEnv();
  const token = await getDeviceToken();
  const url = token
    ? `${apiBaseUrl}/api/jarvis/physical/events?token=${encodeURIComponent(token)}`
    : `${apiBaseUrl}/api/jarvis/physical/events`;
  source = new EventSource(url);
  emitStatus("connecting");

  source.addEventListener("open", () => {
    emitStatus("connected");
    // eslint-disable-next-line no-console
    console.log("[sse] open");
  });

  source.addEventListener("hello", () => emitStatus("connected"));

  source.addEventListener("trigger", (e) => {
    if (!_peEnabled) {
      // PE mode disabled — ignore SSE trigger; hotkey handles wake instead.
      // eslint-disable-next-line no-console
      console.log("[trigger] PE disabled — ignoring SSE trigger (use Cmd+Shift+J)");
      return;
    }
    const messageEvent = e as MessageEvent<string>;
    const payload = parseJson<PhysicalTriggerPayload>(messageEvent.data);
    if (!payload) return;
    // eslint-disable-next-line no-console
    console.log(
      `[trigger] source=${payload.source} command=${payload.commandName ?? payload.commandId}`,
    );
    void startCaptureTurn();
  });

  source.addEventListener("jarvis-response-start", (e) => {
    const messageEvent = e as MessageEvent<string>;
    const payload = parseJson<JarvisResponseStartPayload>(messageEvent.data);
    if (!payload) return;
    // eslint-disable-next-line no-console
    console.log(`[jarvis] response-start turnId=${payload.turnId}`);
    for (const fn of responseStartListeners) fn(payload);
  });

  source.addEventListener("jarvis-response-chunk", (e) => {
    const messageEvent = e as MessageEvent<string>;
    const payload = parseJson<JarvisResponseChunkPayload>(messageEvent.data);
    if (!payload) return;
    for (const fn of responseChunkListeners) fn(payload);
  });

  source.addEventListener("jarvis-tool-call", (e) => {
    const messageEvent = e as MessageEvent<string>;
    const payload = parseJson<JarvisToolCallPayload>(messageEvent.data);
    if (!payload) return;
    // eslint-disable-next-line no-console
    console.log(`[jarvis] tool-call ${payload.name} turnId=${payload.turnId}`);
    for (const fn of toolCallListeners) fn(payload);
  });

  source.addEventListener("jarvis-response-end", (e) => {
    const messageEvent = e as MessageEvent<string>;
    const payload = parseJson<JarvisResponseEndPayload>(messageEvent.data);
    if (!payload) return;
    // eslint-disable-next-line no-console
    console.log(`[jarvis] response-end turnId=${payload.turnId}`);
    for (const fn of responseEndListeners) fn(payload);
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
 * Close the SSE connection. Called on clean shutdown.
 */
export function stopPhysicalExtenderListener(): void {
  if (source) {
    source.close();
    source = null;
  }
}

/**
 * Tear down and re-open the SSE connection. Call after the device token
 * changes (save/clear) so the new `?token=` takes effect without an app
 * restart — the auth query param is baked into the URL at connect time.
 */
export async function reconnectPhysicalExtenderListener(): Promise<void> {
  stopPhysicalExtenderListener();
  await startPhysicalExtenderListener();
}
