/**
 * Pure mapping from an executed JARVIS action (tool name + result payload) to
 * the `UndoTarget` consumed by `undoJarvisAction` / `undoJarvisActionForUser`.
 *
 * Extracted so BOTH undo affordances share one implementation:
 *   - the JARVIS Console scrollback (components/jarvis/JarvisConsole.tsx), and
 *   - the in-document @JARVIS receipt pill (Phase 32 undo refinement).
 *
 * It is the single source of truth for "given what JARVIS just did, how do we
 * invert it." Returning `null` means the action has no inversion (find_*,
 * remember_fact, ask_clarification) OR the result lacks the before/snapshot it
 * needs — callers must treat `null` as "not undoable" and hide the affordance.
 *
 * This is intentionally framework-free (no React, no server-only) so it can be
 * unit-tested directly and imported from either client surface.
 */

import type {
  UndoTarget,
  TaskBefore,
  CaptureBefore,
  EventBefore,
  TaskSnapshot,
  CaptureSnapshot,
} from "@/app/actions/jarvis";

/**
 * The minimal action shape this mapper needs. `result` is intentionally
 * `unknown` so BOTH callers fit without a cast:
 *   - the console's ScrollbackAction (`result: {ok,id,receipt} | {ok:false,…}`),
 *   - the in-document InDocumentAction (`result: unknown` straight off the SSE).
 * The shape is narrowed at runtime below before any field is read.
 */
export interface UndoableActionLike {
  name: string;
  result?: unknown;
}

/** A successfully-executed action result, the only shape we can invert. */
interface OkResult {
  ok: true;
  id: string;
  receipt?: Record<string, unknown>;
}

function asOkResult(result: unknown): OkResult | null {
  if (typeof result !== "object" || result === null) return null;
  const r = result as { ok?: unknown; id?: unknown; receipt?: unknown };
  if (r.ok !== true || typeof r.id !== "string") return null;
  const receipt =
    typeof r.receipt === "object" && r.receipt !== null
      ? (r.receipt as Record<string, unknown>)
      : {};
  return { ok: true, id: r.id, receipt };
}

/**
 * Build the `UndoTarget` for an executed action, or `null` when it can't be
 * undone. Mirrors the switch previously inlined in JarvisConsole.handleUndoAction
 * (Phase 16 — 9 inversion kinds) so the two stay in lockstep.
 */
export function actionToUndoTarget(action: UndoableActionLike): UndoTarget | null {
  // Queued placeholders / failed actions have nothing to invert.
  const okResult = asOkResult(action.result);
  if (!okResult) return null;
  const id = okResult.id;
  const receipt = okResult.receipt ?? {};

  switch (action.name) {
    case "create_task":
      return { kind: "task", id };
    case "create_capture":
      return { kind: "capture", id };
    case "create_event": {
      const calendarId =
        typeof receipt.calendar_id === "string"
          ? receipt.calendar_id
          : typeof receipt.calendarId === "string"
            ? receipt.calendarId
            : "primary";
      return { kind: "event", id, calendarId };
    }
    case "update_task":
      if (!receipt.before) return null;
      return { kind: "update_task", id, before: receipt.before as TaskBefore };
    case "update_capture":
      if (!receipt.before) return null;
      return { kind: "update_capture", id, before: receipt.before as CaptureBefore };
    case "update_event": {
      if (!receipt.before) return null;
      const calendarId =
        typeof receipt.calendar_id === "string" ? receipt.calendar_id : "primary";
      return { kind: "update_event", id, calendarId, before: receipt.before as EventBefore };
    }
    case "delete_task":
      if (!receipt.snapshot) return null;
      return { kind: "delete_task", snapshot: receipt.snapshot as TaskSnapshot };
    case "delete_capture":
      if (!receipt.snapshot) return null;
      return { kind: "delete_capture", snapshot: receipt.snapshot as CaptureSnapshot };
    case "delete_event": {
      if (!receipt.snapshot) return null;
      const calendarId =
        typeof receipt.calendar_id === "string" ? receipt.calendar_id : "primary";
      return { kind: "delete_event", calendarId, snapshot: receipt.snapshot as Record<string, unknown> };
    }
    default:
      // find_*, remember_fact, ask_clarification — no inversion.
      return null;
  }
}

/** Convenience: does this action have any inversion at all? */
export function isActionUndoable(action: UndoableActionLike): boolean {
  return actionToUndoTarget(action) !== null;
}
