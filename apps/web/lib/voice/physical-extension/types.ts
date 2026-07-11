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

export type PhysicalStudioWidgetKind = "browser" | "whatsapp" | "weather" | "news";

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
