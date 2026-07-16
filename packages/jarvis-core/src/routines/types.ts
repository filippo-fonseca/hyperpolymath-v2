// Routine spec types — the data foundation for JARVIS natural-language
// "routines + triggers". Every downstream unit (block-engine, desktop-triggers,
// web editor) imports these contracts from `@hyperpolymath/jarvis-core/routines`.
//
// A Routine is: one-or-more triggers → an ordered sequence of agentic blocks.
// The freeform payload (triggers[] + blocks[]) lives in a JSONB `spec` column;
// scheduler-relevant fields are denormalized into first-class DB columns
// (trigger_types, next_run_at) by the server actions on every write.

import type { JarvisToolName } from "../types";

/**
 * Spec version — lets future migrations evolve the JSONB shape safely.
 * Downstream readers branch on this. Any spec-shape change bumps it.
 */
export const ROUTINE_SPEC_VERSION = 1 as const;

// --- Triggers (discriminated union over `type`) ---------------------------
// v1 members: wake | utterance | time | hotkey. Smart/contextual +
// event-detection triggers are DEFERRED (not built) but the open union + free
// JSONB means new types are purely additive — no migration needed.

export interface WakePhraseTrigger {
  type: "wake";
  /** e.g. "daddy's home". Case-insensitive match handled by desktop-triggers. */
  phrase: string;
}

export interface UtteranceTrigger {
  type: "utterance";
  /** substring / phrase that, when heard mid-conversation, fires the routine. */
  match: string;
}

export interface TimeTrigger {
  type: "time";
  /** 24h "HH:MM" local wall-clock. v1 = daily. */
  at: string;
  /** IANA tz; optional — desktop resolves to the device tz if absent. */
  tz?: string;
  // Forward-hook (deferred, do NOT build): days?: number[]; cron?: string;
}

export interface HotkeyTrigger {
  type: "hotkey";
  /** normalized accelerator, e.g. "Cmd+Shift+J". Desktop owns registration. */
  accelerator: string;
}

export type RoutineTrigger =
  | WakePhraseTrigger
  | UtteranceTrigger
  | TimeTrigger
  | HotkeyTrigger;

/** "wake" | "utterance" | "time" | "hotkey" */
export type RoutineTriggerType = RoutineTrigger["type"];

// --- Blocks ---------------------------------------------------------------

export interface RoutineBlock {
  /** Stable id for reorder/edit in the web editor (client-generated uuid). */
  id: string;
  /** Which JARVIS tool this block runs — one source of truth, types.ts. */
  tool: JarvisToolName;
  /**
   * Tool params. Freeform per tool — validated by the tool's own Zod at
   * execution time in the block-engine, NOT here. This stays open on purpose.
   */
  params: Record<string, unknown>;
  /**
   * Per-block natural-language directive injected into the scoped agent turn.
   * This is what makes a block agentic. Optional — absent means a plain tool
   * call.
   */
  nlDirective?: string;
  /**
   * Optional INSTRUCTIONS (not a verbatim script) for what JARVIS should SAY
   * while this block is fetching, spoken WHILE the block gathers and BEFORE
   * its real result. The runner interprets this through a small prose-only
   * Anthropic call so the actual filler line is non-deterministic (semantically
   * the same, phrased differently every run). Emitted as an independent spoken
   * turn (`${blockId}:filler`) that mirrors the routine opener and bypasses the
   * synthesize-mode suppression that silences ordinary gather narration.
   */
  loadingInstruction?: string;
}

// --- The spec (JSONB payload) --------------------------------------------

export interface RoutineSpec {
  version: typeof ROUTINE_SPEC_VERSION;
  triggers: RoutineTrigger[];
  /** Ordered — array order IS execution order. */
  blocks: RoutineBlock[];
  /**
   * Briefing cohesion (Option C). When true, the runner GATHERS every block's
   * data WITHOUT streaming per-block narration, then runs ONE final butler
   * synthesis turn over all block receipts and speaks a single cohesive brief
   * (spoken as one utterance under one turnId). Kills the disjoint-multi-message
   * + cross-block-repetition defects for a "Daddy's Home"-style briefing.
   *
   * Leave false/omitted for action-only routines (e.g. "open Spotify + set
   * focus") so they keep per-block announce-before-act latency. Optional +
   * defaulting to off keeps every existing routine's behaviour unchanged.
   */
  synthesize?: boolean;
  /**
   * Parallel gather (synthesize-only). When true AND synthesize is true, the
   * runner executes gather blocks CONCURRENTLY (bounded pool) instead of
   * sequentially, since gathers are independent (no narration streams, no
   * cross-block threading). The single synthesis turn still runs last over all
   * receipts in block order. Ignored when synthesize is false — action routines
   * always keep strict announce-before-act ordering.
   */
  parallel?: boolean;
  /**
   * Optional ROUTINE-LEVEL loading instruction. When set, its INTERPRETED (not
   * verbatim) filler line REPLACES the hardcoded "Welcome home, sir" opener that
   * plays once at routine start — spoken up front while the whole routine runs.
   * The runner passes this through the same prose-only Anthropic call the
   * per-block fillers use, so the spoken opener is non-deterministic every run.
   * Distinct from and additive to per-block `loadingInstruction`s. When unset or
   * empty, the default hardcoded opener is used unchanged.
   */
  loadingInstruction?: string;
}

/** Full row shape returned by the server actions (first-class cols + spec). */
export interface Routine {
  id: string;
  name: string;
  description: string | null;
  enabled: boolean;
  spec: RoutineSpec;
  triggerTypes: RoutineTriggerType[];
  /** ISO 8601 UTC of the next time-trigger fire, or null when no time trigger. */
  nextRunAt: string | null;
  createdAt: string;
  updatedAt: string;
}
