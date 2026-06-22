/**
 * Unit tests for the shared action→UndoTarget mapper
 * (lib/jarvis/action-to-undo-target.ts).
 *
 * This pure helper is the single source of truth for "given an executed JARVIS
 * action, how do we invert it" — reused by both the console scrollback undo and
 * the in-document receipt pill's 5s undo. The mapping (9 inversion kinds + the
 * non-undoable tools) must stay exactly aligned with undo.ts's UndoTargetSchema.
 */

import { describe, expect, it } from "vitest";
import {
  actionToUndoTarget,
  isActionUndoable,
  type UndoableActionLike,
} from "@/lib/jarvis/action-to-undo-target";

const ok = (
  name: string,
  id: string,
  receipt: Record<string, unknown> = {},
): UndoableActionLike => ({ name, result: { ok: true, id, receipt } });

describe("actionToUndoTarget", () => {
  it("maps create_task → { kind: 'task', id }", () => {
    expect(actionToUndoTarget(ok("create_task", "t1"))).toEqual({
      kind: "task",
      id: "t1",
    });
  });

  it("maps create_capture → { kind: 'capture', id }", () => {
    expect(actionToUndoTarget(ok("create_capture", "c1"))).toEqual({
      kind: "capture",
      id: "c1",
    });
  });

  it("maps create_event with calendar_id from the receipt", () => {
    expect(
      actionToUndoTarget(ok("create_event", "e1", { calendar_id: "work" })),
    ).toEqual({ kind: "event", id: "e1", calendarId: "work" });
  });

  it("maps create_event with calendarId (camelCase) fallback", () => {
    expect(
      actionToUndoTarget(ok("create_event", "e2", { calendarId: "home" })),
    ).toEqual({ kind: "event", id: "e2", calendarId: "home" });
  });

  it("defaults create_event calendarId to 'primary' when absent", () => {
    expect(actionToUndoTarget(ok("create_event", "e3"))).toEqual({
      kind: "event",
      id: "e3",
      calendarId: "primary",
    });
  });

  it("maps update_task only when a `before` snapshot is present", () => {
    expect(actionToUndoTarget(ok("update_task", "t2"))).toBeNull();
    const before = { title: "old" };
    expect(actionToUndoTarget(ok("update_task", "t2", { before }))).toEqual({
      kind: "update_task",
      id: "t2",
      before,
    });
  });

  it("maps update_capture only when a `before` is present", () => {
    expect(actionToUndoTarget(ok("update_capture", "c2"))).toBeNull();
    const before = { content: "old" };
    expect(actionToUndoTarget(ok("update_capture", "c2", { before }))).toEqual({
      kind: "update_capture",
      id: "c2",
      before,
    });
  });

  it("maps update_event with before + calendar id", () => {
    const before = { summary: "old" };
    expect(
      actionToUndoTarget(
        ok("update_event", "e4", { before, calendar_id: "cal" }),
      ),
    ).toEqual({ kind: "update_event", id: "e4", calendarId: "cal", before });
    // No before → not undoable.
    expect(actionToUndoTarget(ok("update_event", "e4"))).toBeNull();
  });

  it("maps delete_task / delete_capture from their snapshots", () => {
    const taskSnap = { id: "t3", title: "x" };
    expect(
      actionToUndoTarget(ok("delete_task", "t3", { snapshot: taskSnap })),
    ).toEqual({ kind: "delete_task", snapshot: taskSnap });

    const capSnap = { id: "c3", content: "x" };
    expect(
      actionToUndoTarget(ok("delete_capture", "c3", { snapshot: capSnap })),
    ).toEqual({ kind: "delete_capture", snapshot: capSnap });

    // No snapshot → not undoable.
    expect(actionToUndoTarget(ok("delete_task", "t3"))).toBeNull();
  });

  it("maps delete_event from snapshot + calendar id", () => {
    const snapshot = { summary: "gone" };
    expect(
      actionToUndoTarget(
        ok("delete_event", "e5", { snapshot, calendar_id: "cal2" }),
      ),
    ).toEqual({ kind: "delete_event", calendarId: "cal2", snapshot });
  });

  it("returns null for non-undoable tools", () => {
    for (const name of [
      "find_tasks",
      "find_captures",
      "find_events",
      "remember_fact",
      "ask_clarification",
      "totally_unknown_tool",
    ]) {
      expect(actionToUndoTarget(ok(name, "x"))).toBeNull();
    }
  });

  it("returns null for queued placeholders and failed actions", () => {
    expect(actionToUndoTarget({ name: "create_task" })).toBeNull();
    expect(
      actionToUndoTarget({
        name: "create_task",
        result: { ok: false, error: "boom" },
      }),
    ).toBeNull();
  });
});

describe("isActionUndoable", () => {
  it("is true exactly when actionToUndoTarget is non-null", () => {
    expect(isActionUndoable(ok("create_task", "t1"))).toBe(true);
    expect(isActionUndoable(ok("find_tasks", "x"))).toBe(false);
    expect(isActionUndoable(ok("update_task", "t1"))).toBe(false); // no before
    expect(isActionUndoable({ name: "create_task" })).toBe(false); // queued
  });
});
