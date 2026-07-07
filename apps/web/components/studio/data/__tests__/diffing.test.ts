import { describe, it, expect, vi } from "vitest";
import { diffSnapshots, worldEvents } from "../diffing";
import type { EmberSlot } from "../treeLayout";
import type { TaskWithProjects } from "@/lib/db/queries/tasks";
import { mkTask } from "./_fixtures";

const TODAY = "2026-07-06";

function slotFor(taskId: string): EmberSlot {
  return { taskId, lanternId: null, basePosition: [0, 0, 0], state: "ambient" };
}

function toMap(rows: TaskWithProjects[]): Map<string, TaskWithProjects> {
  return new Map(rows.map((r) => [r.id, r]));
}

describe("diffSnapshots", () => {
  it("emits exactly one completion when a resident row flips to lesno", () => {
    const a = mkTask({ id: "A", status: "in progress" });
    const b = mkTask({ id: "B", status: "in progress", dueDate: TODAY });
    const prev = toMap([a, b]);
    const prevSlots = new Map([
      ["A", slotFor("A")],
      ["B", slotFor("B")],
    ]);
    const next = [a, { ...b, status: "lesno" as const }];

    const diff = diffSnapshots(prev, next, prevSlots, TODAY);
    expect(diff.completed).toHaveLength(1);
    expect(diff.completed[0]).toMatchObject({ taskId: "B", from: "today", to: "ascending" });
    expect(diff.completed[0]!.slot.taskId).toBe("B");
    expect(diff.added).toEqual([]);
    expect(diff.removedIds).toEqual([]);
  });

  it("does not re-emit for a row already lesno in both snapshots", () => {
    const b = mkTask({ id: "B", status: "lesno" });
    const prev = toMap([b]);
    const prevSlots = new Map<string, EmberSlot>();
    const diff = diffSnapshots(prev, [b], prevSlots, TODAY);
    expect(diff.completed).toEqual([]);
  });

  it("silently drops a completion whose ember never had a slot", () => {
    const b = mkTask({ id: "B", status: "in progress" });
    const prev = toMap([b]);
    const prevSlots = new Map<string, EmberSlot>(); // no slot for B
    const next = [{ ...b, status: "lesno" as const }];
    const diff = diffSnapshots(prev, next, prevSlots, TODAY);
    expect(diff.completed).toEqual([]);
  });

  it("reports added (non-lesno) and removed rows; excludes born-lesno from added", () => {
    const a = mkTask({ id: "A", status: "in progress" });
    const e = mkTask({ id: "E", status: "in progress" });
    const prev = toMap([a, e]);
    const c = mkTask({ id: "C", status: "in progress" }); // brand new, active
    const d = mkTask({ id: "D", status: "lesno" }); // brand new, already done
    const next = [a, c, d]; // E vanished
    const diff = diffSnapshots(prev, next, new Map(), TODAY);

    expect(diff.added.map((t) => t.id)).toEqual(["C"]);
    expect(diff.removedIds).toEqual(["E"]);
  });
});

describe("worldEvents", () => {
  it("delivers a payload to a listener and unsubscribe stops it", () => {
    const seen: string[] = [];
    const off = worldEvents.on("capture-created", (p) => seen.push(p.captureId));
    worldEvents.emit("capture-created", { captureId: "c1" });
    off();
    worldEvents.emit("capture-created", { captureId: "c2" });
    expect(seen).toEqual(["c1"]);
  });

  it("fans out to multiple listeners", () => {
    const hits: number[] = [];
    const off1 = worldEvents.on("chime", () => hits.push(1));
    const off2 = worldEvents.on("chime", () => hits.push(2));
    worldEvents.emit("chime", { kind: "glass-bell" });
    off1();
    off2();
    expect(hits.sort()).toEqual([1, 2]);
  });

  it("isolates a throwing listener so the next still runs", () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const reached: string[] = [];
    const off1 = worldEvents.on("boot-complete", () => {
      throw new Error("boom");
    });
    const off2 = worldEvents.on("boot-complete", () => reached.push("ok"));
    worldEvents.emit("boot-complete", undefined);
    off1();
    off2();
    expect(reached).toEqual(["ok"]);
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });
});
