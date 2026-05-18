/**
 * Scrollback turn shapes for the JARVIS Console (D-05, D-06).
 *
 * Plan 05-03 ships the *shell*: user echoes + assistant streaming text/actions
 * + intent-badged receipts. Plan 05-04 layers undo countdown + execution side
 * effects on top of `ScrollbackAction` (`undone?: boolean`).
 *
 * Session memory IS the scrollback (D-06): refresh clears it. The last N
 * turns are mapped into the model's `history` field at submit time.
 */

export interface ScrollbackUserTurn {
  kind: "user";
  id: string;
  text: string;
  createdAt: Date;
}

export interface ScrollbackAssistantTurn {
  kind: "assistant";
  id: string;
  textDelta: string; // accumulated preamble text from SSE `event: text`
  actions: ScrollbackAction[];
  createdAt: Date;
  status: "streaming" | "done" | "error";
  errorMessage?: string;
}

export interface ScrollbackAction {
  toolUseId: string;
  name: "create_task" | "create_capture" | "create_event";
  /** Phase 5.1 D-P3: "queued" while executor pending, "done" once result arrives. */
  status?: "queued" | "done";
  /** Optional once queued placeholder lands; populated when event: action arrives. */
  result?:
    | { ok: true; id: string; receipt: Record<string, unknown> }
    | { ok: false; error: string; kind?: string };
  undone?: boolean; // Plan 05-04 wires undo
}

export type ScrollbackTurn = ScrollbackUserTurn | ScrollbackAssistantTurn;
