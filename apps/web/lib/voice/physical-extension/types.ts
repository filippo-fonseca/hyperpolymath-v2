export interface PhysicalTrigger {
  source: "arduino-df2301q" | "manual" | string;
  commandId: number;
  commandName?: string;
  at: number;
  desktopClaimed?: boolean;
}

export interface PhysicalTranscript {
  transcript: string;
  sttDoneAt: number;
  vadEndAt?: number;
  at: number;
  /**
   * The turnId of the reply this user echo belongs to, minted BEFORE the echo
   * is emitted so the desktop can pair the user bubble to its reply by identity
   * rather than by arrival order. Optional for backward compatibility: turnless
   * echoes (older emitters, or call sites with no meaningful turnId) fall back
   * to FIFO pairing in the desktop reducer. Threading it end-to-end fixes the
   * row-swap when the server inverts relative order — e.g. a routine-interception
   * turn whose fire-and-forget response-start lands AFTER a concurrent normal
   * turn's, producing [transcript_A, transcript_B, start_B, start_A].
   */
  turnId?: string;
}

export interface PhysicalJarvisResponseStart {
  turnId: string;
  at: number;
}

export interface PhysicalJarvisResponseChunk {
  turnId: string;
  delta: string;
  at: number;
}

export interface PhysicalJarvisToolCall {
  turnId: string;
  toolUseId: string;
  name: string;
  result: unknown;
  at: number;
}

export type PhysicalStudioWidgetKind =
  | "browser"
  | "whatsapp"
  | "weather"
  | "news"
  | "card"
  | "clock"
  | "camera"
  | "settings";

// MAJOR-6 — the physical bus is currently a single global EventEmitter and
// the SSE endpoint is owner-gated. `userId` is carried on every studio-action
// payload so SSE subscribers can filter (or verify) events belong to them,
// and so the invariant survives if/when the bus is ever partitioned per
// user. Optional for backwards compatibility during rollout; new emitters
// should always include it.
export type PhysicalStudioAction =
  | {
      action: "open";
      kind: PhysicalStudioWidgetKind;
      props?: Record<string, unknown>;
      userId?: string;
    }
  | {
      action: "close";
      kind: PhysicalStudioWidgetKind | "all" | string;
      target?: "kind" | "id";
      userId?: string;
    };

export interface PhysicalJarvisResponseEnd {
  turnId: string;
  at: number;
}

/**
 * A spoken tool-latency acknowledgement ("I'll fetch the news for you, sir.").
 * Emitted server-side the instant the model chooses a tool with no spoken
 * preamble, so JARVIS speaks immediately instead of going silent while the tool
 * runs. Carried on a DEDICATED event (not a response-chunk) so it plays through
 * the same per-turn TTS queue — serialized BEFORE the real answer by turnId —
 * WITHOUT ever landing in the persisted assistant text or the visual bubble.
 */
export interface PhysicalJarvisAck {
  turnId: string;
  /** The spoken ack line. Speech-ready (no markdown). */
  text: string;
  at: number;
}

/**
 * A real interrupt for the persistent-SSE voice path. Emitted by the cancel
 * endpoint (/api/jarvis/voice/cancel) when the user stops JARVIS mid-speech,
 * mid-processing, or mid-utterance. The turn-abort registry listens on the bus
 * and aborts the matching in-flight `runJarvisTurnStream` (Anthropic stream +
 * remaining tool rounds). `all` cancels every in-flight turn for the owner —
 * used by the desktop barge-in, which does not track the live turnId.
 */
export interface PhysicalJarvisCancel {
  /** Cancel one turn by id. Omitted when `all` is set. */
  turnId?: string;
  /** Cancel every in-flight turn (owner-gated single-user bus). */
  all?: boolean;
  at: number;
}

/** One gather source in a synthesize routine, as shown on the HUD checklist. */
export interface PhysicalRoutineProgressSource {
  /** Runner-resolved block id — matches blockId on gather-start/gather-done. */
  blockId: string;
  /** Authored block order (0-based) — checklist render order. */
  index: number;
  /** Raw tool name, e.g. "read_gmail" (string, not JarvisToolName — this module
   * stays dependency-free). */
  tool: string;
  /** Human label, e.g. "Email". Derived server-side; desktop renders it verbatim. */
  label: string;
}

export type PhysicalJarvisRoutineProgressPhase =
  | "start" // instant: routine fired; carries the full source skeleton
  | "gather-start" // source began executing
  | "gather-done" // source settled (ok=false when it errored/was skipped)
  | "synthesizing" // all gathered; the single brief turn is composing
  | "done"; // brief finished streaming; progress lifecycle over

export interface PhysicalJarvisRoutineProgress {
  /** The fireRoutineOverBus runId — correlates all events of one run. */
  runId: string;
  /** Human routine name, e.g. "Morning Brief" — HUD header copy. */
  routineName: string;
  phase: PhysicalJarvisRoutineProgressPhase;
  /** Total gather sources. Present on EVERY phase (lets the HUD ring size itself
   * from any event). */
  total: number;
  /** phase "start" only: the full checklist skeleton, in authored order. */
  sources?: PhysicalRoutineProgressSource[];
  /** phases "gather-start" | "gather-done": which source. */
  blockId?: string;
  index?: number;
  tool?: string;
  label?: string;
  /** phase "gather-done" only: false when the block errored or was skipped. */
  ok?: boolean;
  /** phase "gather-done" only, when ok === false: short error message. */
  error?: string;
  /** Wall-clock ms epoch, same convention as every other bus payload. */
  at: number;
}
