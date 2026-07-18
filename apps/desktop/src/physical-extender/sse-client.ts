// apps/desktop/src/physical-extender/sse-client.ts
// Subscribes to the existing Next.js SSE stream at /api/jarvis/physical/events.
// On `trigger` events, starts a cpal capture turn (unless PE mode is disabled
// via setPeEnabled(false), in which case the event is ignored — keyboard hotkey
// is used instead).
// On `jarvis-response-*` events, forwards them to registered listeners so
// the desktop UI can render the server-side JARVIS response without the browser.

import { getEnv } from "@/env";
import { getDeviceToken } from "@/auth/device-token";
import { splitDeltas } from "@/audio/sentence-splitter";

let source: EventSource | null = null;

/** When false, incoming `trigger` SSE events are ignored. The global
 *  keyboard hotkey (Cmd+Shift+J) fires the invocation directly. */
let _peEnabled = true;

export function setPeEnabled(enabled: boolean): void {
  _peEnabled = enabled;
}

/**
 * Invocation handler for ESP32 `trigger` events. Injected by main.ts (wired to
 * the conversation FSM's `startConversation`) rather than importing the FSM
 * here — the FSM imports THIS module (onJarvisResponseStart), so a direct
 * import would create a cycle. Routing the trigger through the FSM means it
 * respects the Phase 1 half-duplex gate: a trigger can't open the mic while
 * TTS is playing or a response is in flight. Defaults to a no-op until wired.
 */
let _triggerHandler: () => void = () => {
  // eslint-disable-next-line no-console
  console.warn("[trigger] no invocation handler wired yet — ignoring trigger");
};

export function setTriggerHandler(handler: () => void): void {
  _triggerHandler = handler;
}

interface PhysicalTriggerPayload {
  source: string;
  commandId: number;
  commandName?: string;
  at: number;
  desktopClaimed?: boolean;
}

interface PhysicalTranscriptPayload {
  transcript: string;
  sttDoneAt: number;
  vadEndAt?: number;
  at: number;
  /**
   * The turnId of the reply this echo belongs to, minted server-side BEFORE the
   * echo was emitted (voice/transcript + voice/text). When present the transcript
   * reducer pairs this user bubble to its reply by identity; absent (older server
   * or a turnless call site) it falls back to FIFO arrival-order pairing.
   */
  turnId?: string;
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

export type StudioActionPayload =
  | {
      action: "open";
      kind: string;
      props?: Record<string, unknown>;
    }
  | {
      action: "close";
      kind: string;
      target?: "kind" | "id";
    }
  | {
      // Toggle the hand-tracking cursor. Carries no widget kind.
      action: "hand";
      enabled: boolean;
    };

interface JarvisResponseEndPayload {
  turnId: string;
  at: number;
}

/**
 * A spoken tool-latency acknowledgement for a turn ("I'll fetch the news for
 * you, sir."). Arrives on its own `jarvis-ack` event — NOT a response-chunk —
 * so it is spoken through the per-turn TTS queue (serialized before the answer)
 * but never rendered into the transcript bubble or persisted.
 */
interface JarvisAckPayload {
  turnId: string;
  text: string;
  at: number;
}

// --- Routine progress (produced by the web progress-bus; consumed by the HUD
// loader). Desktop-local mirror of PhysicalJarvisRoutineProgress — the desktop
// app does not import web/server code, so every payload is mirrored here. The
// hud-loader unit imports these EXPORTED types + onJarvisRoutineProgress. ---

/** One gather source in a synthesize routine, as shown on the HUD checklist. */
export interface RoutineProgressSourcePayload {
  blockId: string;
  index: number;
  tool: string;
  label: string;
}

export type JarvisRoutineProgressPhase =
  | "start"
  | "gather-start"
  | "gather-done"
  | "synthesizing"
  | "done";

export interface JarvisRoutineProgressPayload {
  runId: string;
  routineName: string;
  phase: JarvisRoutineProgressPhase;
  total: number;
  sources?: RoutineProgressSourcePayload[];
  blockId?: string;
  index?: number;
  tool?: string;
  label?: string;
  ok?: boolean;
  error?: string;
  at: number;
}

export type SseStatus = "connecting" | "connected" | "error";
type StatusListener = (status: SseStatus) => void;
const statusListeners = new Set<StatusListener>();

type PhysicalTranscriptListener = (payload: PhysicalTranscriptPayload) => void;
type ResponseStartListener = (payload: JarvisResponseStartPayload) => void;
type ResponseChunkListener = (payload: JarvisResponseChunkPayload) => void;
type ToolCallListener = (payload: JarvisToolCallPayload) => void;
type StudioActionListener = (payload: StudioActionPayload) => void;
type ResponseEndListener = (payload: JarvisResponseEndPayload) => void;
type AckListener = (payload: JarvisAckPayload) => void;
type RoutineProgressListener = (payload: JarvisRoutineProgressPayload) => void;

const physicalTranscriptListeners = new Set<PhysicalTranscriptListener>();
const responseStartListeners = new Set<ResponseStartListener>();
const responseChunkListeners = new Set<ResponseChunkListener>();
const toolCallListeners = new Set<ToolCallListener>();
const studioActionListeners = new Set<StudioActionListener>();
const responseEndListeners = new Set<ResponseEndListener>();
const ackListeners = new Set<AckListener>();
const routineProgressListeners = new Set<RoutineProgressListener>();

// ── Per-turn repeated-sentence dedupe (desktop-only render/speak guard) ──────
// A single JARVIS turn runs an agentic tool loop server-side: the model can
// stream a short acknowledgement (e.g. "Off it goes, sir.") in the pass that
// emits a tool call AND stream the SAME line again in the feedback pass that
// follows the tool result. Both passes reach us as `jarvis-response-chunk`
// events on ONE turnId, so every downstream consumer — the transcript bubble,
// the ack strip, the drawer mirror, and the TTS queue — renders and speaks the
// line twice ("Off it goes, sir. Off it goes, sir.").
//
// The backend/SSE contract is fixed, so we dedupe on RECEIPT here, at the sole
// chokepoint every chunk consumer funnels through. We buffer each turn's text,
// split it into complete sentences with the same splitter the TTS path uses,
// and forward only sentences NOT yet seen this turn: a verbatim repeat is
// dropped whole, a novel sentence is recorded and passed on. Streaming UX is
// preserved: novel text still flows into one bubble sentence-by-sentence (the
// same granularity the TTS queue already speaks at), and only an exact
// duplicate line is withheld. Per-turn state (keyed on turnId) so overlapping
// turns (routine opener + brief) never cross-dedupe.
interface ChunkDedupeState {
  /** Unfinished tail carried between splitter calls (matches splitDeltas). */
  ttsBuffer: string;
  /** Normalized text of sentences already forwarded this turn. */
  seen: Set<string>;
}
const chunkDedupe = new Map<string, ChunkDedupeState>();

/** Normalize a sentence for duplicate comparison: strip non-alphanumerics,
 *  collapse whitespace, lowercase. Casing/punctuation drift between the two
 *  passes then still compares equal. */
function normalizeSentence(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function chunkStateFor(turnId: string): ChunkDedupeState {
  let st = chunkDedupe.get(turnId);
  if (!st) {
    st = { ttsBuffer: "", seen: new Set() };
    chunkDedupe.set(turnId, st);
  }
  return st;
}

/**
 * Filter one incoming chunk delta for a turn, returning the text to forward
 * with any verbatim-repeat sentence removed. We buffer the turn's text and emit
 * only COMPLETED sentences (each checked against the per-turn `seen` set): a
 * duplicate is dropped, a novel one is recorded and forwarded. The unfinished
 * tail is held until its terminator lands (flushed on response-end), mirroring
 * exactly how the TTS path already batches sentences — so a repeat is caught
 * before it can render or speak. Returns "" when this tick produced no new
 * completed sentence (the caller then suppresses the downstream emit).
 */
function filterChunkDelta(turnId: string, delta: string): string {
  const st = chunkStateFor(turnId);
  const { sentences, remainder } = splitDeltas(st.ttsBuffer, delta);
  st.ttsBuffer = remainder;

  let out = "";
  for (const sentence of sentences) {
    const norm = normalizeSentence(sentence);
    // Punctuation-only/empty fragments carry no meaning — forward to preserve
    // spacing, but don't record them as "seen".
    if (!norm) {
      out += sentence;
      continue;
    }
    if (st.seen.has(norm)) continue; // verbatim repeat this turn — drop it
    st.seen.add(norm);
    out += sentence;
  }
  return out;
}

/** Flush the turn's trailing (unterminated) sentence through the same dedupe,
 *  then drop the turn's state. Called on response-end so a short reply that
 *  never hit a terminator ("Off it goes, sir" with no trailing space) still
 *  renders/speaks exactly once. */
function flushChunkDedupe(turnId: string): string {
  const st = chunkDedupe.get(turnId);
  chunkDedupe.delete(turnId);
  if (!st) return "";
  const tail = st.ttsBuffer;
  if (!tail.trim()) return "";
  const norm = normalizeSentence(tail);
  if (norm && st.seen.has(norm)) return "";
  return tail;
}

export function onSseStatusChange(fn: StatusListener): () => void {
  statusListeners.add(fn);
  return () => statusListeners.delete(fn);
}

/**
 * Subscribe to the server's early `transcript` SSE event, emitted at STT time
 * (emitPhysicalTranscript in the voice/transcript POST). This paints the user's
 * echo at ~1s on every turn, independent of when the POST response flushes. The
 * capture-POST-driven paint (onTranscriptReceived) remains as a fallback; the
 * consumer dedupes so the same utterance never double-paints.
 */
export function onPhysicalTranscript(fn: PhysicalTranscriptListener): () => void {
  physicalTranscriptListeners.add(fn);
  return () => physicalTranscriptListeners.delete(fn);
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

export function onStudioAction(fn: StudioActionListener): () => void {
  studioActionListeners.add(fn);
  return () => studioActionListeners.delete(fn);
}

export function onJarvisResponseEnd(fn: ResponseEndListener): () => void {
  responseEndListeners.add(fn);
  return () => responseEndListeners.delete(fn);
}

/**
 * Subscribe to spoken tool-latency acks. Consumed by jarvis-response.ts, which
 * enqueues the line into the TtsPlayer for its turnId ahead of the answer so it
 * speaks first. Not routed through the transcript/render path.
 */
export function onJarvisAck(fn: AckListener): () => void {
  ackListeners.add(fn);
  return () => ackListeners.delete(fn);
}

export function onJarvisRoutineProgress(fn: RoutineProgressListener): () => void {
  routineProgressListeners.add(fn);
  return () => routineProgressListeners.delete(fn);
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
    // Route through the FSM (via the injected handler) so the trigger honors
    // the half-duplex gate — never opens the mic while JARVIS is speaking.
    _triggerHandler();
  });

  source.addEventListener("transcript", (e) => {
    const messageEvent = e as MessageEvent<string>;
    const payload = parseJson<PhysicalTranscriptPayload>(messageEvent.data);
    if (!payload) return;
    // eslint-disable-next-line no-console
    console.log(`[jarvis] transcript sttDoneAt=${payload.sttDoneAt} turnId=${payload.turnId ?? "-"}`);
    for (const fn of physicalTranscriptListeners) fn(payload);
  });

  source.addEventListener("jarvis-response-start", (e) => {
    const messageEvent = e as MessageEvent<string>;
    const payload = parseJson<JarvisResponseStartPayload>(messageEvent.data);
    if (!payload) return;
    // eslint-disable-next-line no-console
    console.log(`[jarvis] response-start turnId=${payload.turnId}`);
    // Fresh per-turn dedupe state (first-seen wins; a duplicate response-start
    // for the same turnId keeps the existing `seen` set rather than clearing
    // sentences already forwarded).
    chunkStateFor(payload.turnId);
    for (const fn of responseStartListeners) fn(payload);
  });

  source.addEventListener("jarvis-response-chunk", (e) => {
    const messageEvent = e as MessageEvent<string>;
    const payload = parseJson<JarvisResponseChunkPayload>(messageEvent.data);
    if (!payload) return;
    // Repeated-sentence dedupe: forward only new completed sentences (see
    // filterChunkDelta). A tick that yields nothing new is suppressed so no
    // consumer (bubble / ack strip / drawer / TTS) sees a duplicate line.
    const filtered = filterChunkDelta(payload.turnId, payload.delta);
    if (!filtered) return;
    const outPayload: JarvisResponseChunkPayload = { ...payload, delta: filtered };
    for (const fn of responseChunkListeners) fn(outPayload);
  });

  source.addEventListener("jarvis-tool-call", (e) => {
    const messageEvent = e as MessageEvent<string>;
    const payload = parseJson<JarvisToolCallPayload>(messageEvent.data);
    if (!payload) return;
    // eslint-disable-next-line no-console
    console.log(`[jarvis] tool-call ${payload.name} turnId=${payload.turnId}`);
    for (const fn of toolCallListeners) fn(payload);
  });

  source.addEventListener("studio-action", (e) => {
    const messageEvent = e as MessageEvent<string>;
    const payload = parseJson<StudioActionPayload>(messageEvent.data);
    if (!payload) return;
    // eslint-disable-next-line no-console
    console.log(
      `[studio] action=${payload.action} ${
        payload.action === "hand" ? `enabled=${payload.enabled}` : `kind=${payload.kind}`
      }`
    );
    for (const fn of studioActionListeners) fn(payload);
  });

  source.addEventListener("jarvis-ack", (e) => {
    const messageEvent = e as MessageEvent<string>;
    const payload = parseJson<JarvisAckPayload>(messageEvent.data);
    if (!payload) return;
    // eslint-disable-next-line no-console
    console.log(`[jarvis] ack turnId=${payload.turnId}`);
    for (const fn of ackListeners) fn(payload);
  });

  source.addEventListener("jarvis-response-end", (e) => {
    const messageEvent = e as MessageEvent<string>;
    const payload = parseJson<JarvisResponseEndPayload>(messageEvent.data);
    if (!payload) return;
    // eslint-disable-next-line no-console
    console.log(`[jarvis] response-end turnId=${payload.turnId}`);
    // Flush the turn's trailing unterminated sentence through the same dedupe
    // (and retire the turn's state) BEFORE signalling end — so a short reply
    // that never hit a terminator still renders/speaks its final line once.
    const tail = flushChunkDedupe(payload.turnId);
    if (tail) {
      const tailChunk: JarvisResponseChunkPayload = {
        turnId: payload.turnId,
        delta: tail,
        at: payload.at,
      };
      for (const fn of responseChunkListeners) fn(tailChunk);
    }
    for (const fn of responseEndListeners) fn(payload);
  });

  source.addEventListener("jarvis-routine-progress", (e) => {
    const messageEvent = e as MessageEvent<string>;
    const payload = parseJson<JarvisRoutineProgressPayload>(messageEvent.data);
    if (!payload) return;
    // eslint-disable-next-line no-console
    console.log(`[jarvis] routine-progress phase=${payload.phase} runId=${payload.runId}`);
    for (const fn of routineProgressListeners) fn(payload);
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
