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

/** The minimal action shape this mapper needs (subset of ScrollbackAction). */
export interface UndoableActionLike {
  name: string;
  result?:
    | { ok: true; id: string; receipt: Record<string, unknown> }
    | { ok: false; error: string; kind?: string }
    | undefined;
}

/**
 * Build the `UndoTarget` for an executed action, or `null` when it can't be
 * undone. Mirrors the switch previously inlined in JarvisConsole.handleUndoAction
 * (Phase 16 — 9 inversion kinds) so the two stay in lockstep.
 */
export function actionToUndoTarget(action: UndoableActionLike): UndoTarget | null {
  // Queued placeholders / failed actions have nothing to invert.
  if (!action.result || !action.result.ok) return null;
  const id = action.result.id;
  const receipt = action.result.receipt ?? {};

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
