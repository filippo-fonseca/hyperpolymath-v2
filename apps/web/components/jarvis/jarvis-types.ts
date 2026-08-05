/**
 * Scrollback turn shapes for the JARVIS Console (D-05, D-06).
 *
 * Plan 05-03 ships the *shell*: user echoes + assistant streaming text/actions
 * + intent-badged receipts. Plan 05-04 layers undo countdown + execution side
 * effects on top of `ScrollbackAction` (`undone?: boolean`).
 * Plan 05.1-04 (D-A2 / JARVIS-19) adds ScrollbackClarification for inline
 * question receipts with chip options + free-text reply input.
 *
 * Session memory IS the scrollback (D-06): refresh clears it. The last N
 * turns are mapped into the model's `history` field at submit time.
 *
 * Phase 16: ScrollbackAction.name widened to JarvisToolName to cover all 14
 * tools (create + update + delete + find + utility). Import from jarvis-core
 * so the union stays a single source of truth.
 */

import type { JarvisToolName } from "@hyperpolymath/jarvis-core";

export interface ScrollbackUserTurn {
  kind: "user";
  id: string;
  text: string;
  createdAt: Date;
  /**
   * Issue #283 — monotonic client insertion sequence (see transcript-order.ts).
   * Stamped when the turn first enters the client so a millisecond timestamp
   * tie between two same-kind turns keeps a stable, true-creation order. Never
   * persisted — display-ordering only.
   */
  seq?: number;
}

/**
 * Phase 5.1 (D-A2 / JARVIS-19) — clarification question from ask_clarification tool.
 * Lives as an optional field on ScrollbackAssistantTurn. Never persisted — scrollback only.
 */
export interface ScrollbackClarification {
  toolUseId: string;
  question: string;
  options: string[];
  suggestedAction: { tool: string; args: Record<string, unknown> } | null;
  /** true once user submitted a reply (any next user turn). Disables reply input. */
  answered: boolean;
}

export interface ScrollbackAssistantTurn {
  kind: "assistant";
  id: string;
  textDelta: string; // accumulated preamble text from SSE `event: text`
  actions: ScrollbackAction[];
  createdAt: Date;
  /**
   * "queued" is a client-only placeholder state: sends now enqueue FIFO
   * instead of aborting the in-flight run, and a queued turn waits its turn
   * in the scrollback. It is never persisted — the assistant row is only
   * written on done/error, and loaders normalise anything else to "done".
   */
  status: "queued" | "streaming" | "done" | "error";
  errorMessage?: string;
  /** Phase 5.1 D-A2 / JARVIS-19: inline clarification question, if this turn asked one. */
  clarification?: ScrollbackClarification;
  /**
   * Issue #283 — monotonic client insertion sequence (see transcript-order.ts).
   * Stamped when the turn first enters the client so a millisecond timestamp
   * tie between two same-kind turns keeps a stable, true-creation order. Never
   * persisted — display-ordering only.
   */
  seq?: number;
}

export interface ScrollbackAction {
  toolUseId: string;
  /** Phase 16: widened from 5-tool literal to JarvisToolName (all 14 tools). */
  name: JarvisToolName;
  /** Phase 5.1 D-P3: "queued" while executor pending, "done" once result arrives. */
  status?: "queued" | "done";
  /** Optional once queued placeholder lands; populated when event: action arrives. */
  result?:
    | { ok: true; id: string; receipt: Record<string, unknown> }
    | { ok: false; error: string; kind?: string };
  undone?: boolean; // Plan 05-04 wires undo
}

export type ScrollbackTurn = ScrollbackUserTurn | ScrollbackAssistantTurn;
