/**
 * useExplorerSelection.clear() — the bail-out invariant behind wiki breadcrumb
 * navigation (issue #348).
 *
 * `clear()` is called on every folder change, from the breadcrumb handlers, from
 * drill-down, and from the backstop effect that catches browser Back/Forward.
 * It used to allocate a fresh Set unconditionally, so a navigation with nothing
 * selected still forced a second render pass and handed out a new `selection`
 * identity, which re-ran every effect keyed on it. Clearing nothing must cost
 * nothing.
 *
 * Covers:
 *   1. clear() with an empty selection preserves the state identities
 *   2. clear() with a live selection actually empties it, and resets the cursor
 *   3. A second clear() after a real clear is itself a no-op
 */
import { useExplorerSelection } from "@/components/wiki/explorer-hooks/useExplorerSelection";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

describe("useExplorerSelection.clear", () => {
  it("preserves state identity when nothing is selected", () => {
    const { result } = renderHook(() => useExplorerSelection());

    const before = result.current.selected;
    expect(before.size).toBe(0);

    act(() => {
      result.current.clear();
    });

    // Same Set instance, so React bails out and no re-render propagates.
    expect(result.current.selected).toBe(before);
    expect(result.current.anchor).toBeNull();
    expect(result.current.cursor).toBeNull();
  });

  it("empties a live selection and resets anchor and cursor", () => {
    const { result } = renderHook(() => useExplorerSelection());

    act(() => {
      result.current.selectOnly(["page:a", "page:b"]);
    });
    expect(result.current.selected.size).toBe(2);
    expect(result.current.anchor).toBe("page:a");
    expect(result.current.cursor).toBe("page:b");

    act(() => {
      result.current.clear();
    });
    expect(result.current.selected.size).toBe(0);
    expect(result.current.anchor).toBeNull();
    expect(result.current.cursor).toBeNull();
    expect(result.current.isSelected("page:a")).toBe(false);
  });

  it("is a no-op when called again after a real clear", () => {
    const { result } = renderHook(() => useExplorerSelection());

    act(() => {
      result.current.selectOnly(["folder:x"]);
    });
    act(() => {
      result.current.clear();
    });

    const cleared = result.current.selected;
    act(() => {
      result.current.clear();
    });
    expect(result.current.selected).toBe(cleared);
  });
});
