/**
 * RT-06 — useOptimisticList self-reconciling overlay.
 *
 * The load-bearing guarantee: an optimistic mutation persists until the
 * CANONICAL data actually catches up, so a stale refetch (pooler/replica
 * read-after-write lag) or a slow Realtime echo can NOT make a just-written
 * row flash out and back in — the bug this hook replaces useOptimistic to fix.
 */
import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useOptimisticList } from "@/lib/realtime/useOptimisticList";

type Row = { id: string; title: string; status?: string };

describe("useOptimisticList", () => {
  it("optimistic insert survives a STALE refetch, then reconciles without duplicating", () => {
    const { result, rerender } = renderHook(
      ({ canonical }) => useOptimisticList<Row>(canonical),
      { initialProps: { canonical: [] as Row[] } },
    );

    act(() => {
      result.current[1]({ type: "insert", row: { id: "a", title: "new" } });
    });
    expect(result.current[0].map((r) => r.id)).toEqual(["a"]);

    // Stale refetch: canonical still lacks the row (replica lag). It MUST stay.
    rerender({ canonical: [] });
    expect(result.current[0].map((r) => r.id)).toEqual(["a"]);

    // Canonical catches up — exactly one row, no duplicate.
    rerender({ canonical: [{ id: "a", title: "new" }] });
    expect(result.current[0].map((r) => r.id)).toEqual(["a"]);

    // A later unrelated refetch keeps the canonical row (insert was pruned).
    rerender({
      canonical: [
        { id: "a", title: "new" },
        { id: "b", title: "other" },
      ],
    });
    expect(result.current[0].map((r) => r.id).sort()).toEqual(["a", "b"]);
  });

  it("optimistic update persists until canonical reflects the patched field", () => {
    const { result, rerender } = renderHook(
      ({ canonical }) => useOptimisticList<Row>(canonical),
      {
        initialProps: {
          canonical: [{ id: "a", title: "t", status: "up next" }] as Row[],
        },
      },
    );

    act(() => {
      result.current[1]({ type: "update", id: "a", patch: { status: "lesno" } });
    });
    expect(result.current[0][0].status).toBe("lesno");

    // Stale refetch (old status). Optimistic patch must hold.
    rerender({ canonical: [{ id: "a", title: "t", status: "up next" }] });
    expect(result.current[0][0].status).toBe("lesno");

    // Canonical reflects it → patch reconciled away, value stays correct.
    rerender({ canonical: [{ id: "a", title: "t", status: "lesno" }] });
    expect(result.current[0][0].status).toBe("lesno");
  });

  it("optimistic delete hides the row until canonical drops it", () => {
    const { result, rerender } = renderHook(
      ({ canonical }) => useOptimisticList<Row>(canonical),
      { initialProps: { canonical: [{ id: "a", title: "t" }] as Row[] } },
    );

    act(() => {
      result.current[1]({ type: "delete", id: "a" });
    });
    expect(result.current[0]).toHaveLength(0);

    // Stale refetch still has the row — stays hidden (no flash-back).
    rerender({ canonical: [{ id: "a", title: "t" }] });
    expect(result.current[0]).toHaveLength(0);

    // Canonical drops it → reconciled.
    rerender({ canonical: [] });
    expect(result.current[0]).toHaveLength(0);
  });

  it("a Realtime echo arriving as canonical is a no-op (RT-05 dedupe parity)", () => {
    const row = { id: "a", title: "live" };
    const { result, rerender } = renderHook(
      ({ canonical }) => useOptimisticList<Row>(canonical),
      { initialProps: { canonical: [] as Row[] } },
    );

    act(() => {
      result.current[1]({ type: "insert", row });
    });
    // Echo: canonical refetch returns the same id. Exactly one row.
    rerender({ canonical: [row] });
    expect(result.current[0].map((r) => r.id)).toEqual(["a"]);
  });
});
