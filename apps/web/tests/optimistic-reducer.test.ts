import { describe, it, expect } from "vitest";
import { optimisticReducer } from "@/lib/realtime/optimistic-reducer";

type Row = { id: string; title: string };

describe("optimistic reducer (RT-05 dedupe)", () => {
  it("insert dedupes by id (Realtime echo no-op)", () => {
    const state: Row[] = [{ id: "a", title: "A" }];
    const next = optimisticReducer<Row>(state, {
      type: "insert",
      row: { id: "a", title: "A (echo)" },
    });
    expect(next).toHaveLength(1);
    expect(next[0]!.title).toBe("A"); // existing wins; no duplicate
  });

  it("insert prepends new rows", () => {
    const state: Row[] = [{ id: "a", title: "A" }];
    const next = optimisticReducer<Row>(state, {
      type: "insert",
      row: { id: "b", title: "B" },
    });
    expect(next).toEqual([
      { id: "b", title: "B" },
      { id: "a", title: "A" },
    ]);
  });

  it("update merges patch into matching row", () => {
    const state: Row[] = [
      { id: "a", title: "A" },
      { id: "b", title: "B" },
    ];
    const next = optimisticReducer<Row>(state, {
      type: "update",
      id: "a",
      patch: { title: "AA" },
    });
    expect(next).toEqual([
      { id: "a", title: "AA" },
      { id: "b", title: "B" },
    ]);
  });

  it("delete removes by id", () => {
    const state: Row[] = [
      { id: "a", title: "A" },
      { id: "b", title: "B" },
    ];
    const next = optimisticReducer<Row>(state, { type: "delete", id: "a" });
    expect(next).toEqual([{ id: "b", title: "B" }]);
  });

  it("reorder applies ids in given order, appends unknown rows", () => {
    const state: Row[] = [
      { id: "a", title: "A" },
      { id: "b", title: "B" },
      { id: "c", title: "C" },
    ];
    const next = optimisticReducer<Row>(state, {
      type: "reorder",
      ids: ["c", "a"],
    });
    expect(next.map((r) => r.id)).toEqual(["c", "a", "b"]);
  });
});
