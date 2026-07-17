import { describe, expect, it } from "vitest";
import { diffReferences } from "@/lib/references/reconcile";

const A = { targetType: "task", targetId: "aaaaaaaa-0000-4000-8000-000000000001" } as const;
const B = { targetType: "page", targetId: "bbbbbbbb-0000-4000-8000-000000000002" } as const;
const C = { targetType: "area", targetId: "cccccccc-0000-4000-8000-000000000003" } as const;

describe("diffReferences", () => {
  it("inserts everything when nothing exists yet", () => {
    const { toInsert, toDelete } = diffReferences([], [A, B]);
    expect(toInsert).toEqual([A, B]);
    expect(toDelete).toEqual([]);
  });

  it("deletes everything when the source no longer references anything", () => {
    const { toInsert, toDelete } = diffReferences([A, B], []);
    expect(toInsert).toEqual([]);
    expect(toDelete).toEqual([A, B]);
  });

  it("no-ops when the references are unchanged", () => {
    // The property that keeps a re-save from churning rows or waking Realtime.
    const { toInsert, toDelete } = diffReferences([A, B], [A, B]);
    expect(toInsert).toEqual([]);
    expect(toDelete).toEqual([]);
  });

  it("no-ops regardless of order", () => {
    const { toInsert, toDelete } = diffReferences([A, B], [B, A]);
    expect(toInsert).toEqual([]);
    expect(toDelete).toEqual([]);
  });

  it("adds and removes in one pass", () => {
    const { toInsert, toDelete } = diffReferences([A, B], [B, C]);
    expect(toInsert).toEqual([C]);
    expect(toDelete).toEqual([A]);
  });

  it("treats the same id under different types as distinct targets", () => {
    const asTask = { targetType: "task", targetId: A.targetId } as const;
    const asPage = { targetType: "page", targetId: A.targetId } as const;
    const { toInsert, toDelete } = diffReferences([asTask], [asPage]);
    expect(toInsert).toEqual([asPage]);
    expect(toDelete).toEqual([asTask]);
  });

  it("collapses a target named twice into one insert", () => {
    // Mentioning the same task twice in one capture is one edge, not two —
    // and the unique constraint would reject the second row anyway.
    const { toInsert } = diffReferences([], [A, A, B]);
    expect(toInsert).toEqual([A, B]);
  });

  it("does not re-insert a duplicate of an existing row", () => {
    const { toInsert, toDelete } = diffReferences([A], [A, A]);
    expect(toInsert).toEqual([]);
    expect(toDelete).toEqual([]);
  });

  it("is idempotent — applying the diff makes the next diff empty", () => {
    const existing = [A, B];
    const desired = [B, C];
    const { toInsert, toDelete } = diffReferences(existing, desired);

    const deleted = new Set(toDelete.map((t) => `${t.targetType}:${t.targetId}`));
    const applied = [
      ...existing.filter((t) => !deleted.has(`${t.targetType}:${t.targetId}`)),
      ...toInsert,
    ];

    const second = diffReferences(applied, desired);
    expect(second.toInsert).toEqual([]);
    expect(second.toDelete).toEqual([]);
  });
});
