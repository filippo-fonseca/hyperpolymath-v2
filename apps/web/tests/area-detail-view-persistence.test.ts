/**
 * @vitest-environment jsdom
 *
 * Area-detail grid|timeline view persistence (u5-area-detail-timeline /
 * sesh-1784257742502).
 *
 * Why this test exists: the page-scoped view toggle follows the same load-bearing
 * `lifeos:view` idiom as the areas index, and it is a DIFFERENT key + vocabulary
 * (area-detail:view, "grid" default) than the frozen useTimelineView. This pins
 * the contract the conductor sealed: grid default on first render, reconcile in an
 * effect, write in the setter, never adopt a corrupt value — and never collide
 * with the areas:view key.
 */

import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AREA_DETAIL_VIEW_KEY,
  DEFAULT_AREA_DETAIL_VIEW,
  useAreaDetailView,
} from "@/components/areas/useAreaDetailView";

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("useAreaDetailView", () => {
  it("defaults to the grid view", () => {
    const { result } = renderHook(() => useAreaDetailView());
    expect(result.current.view).toBe(DEFAULT_AREA_DETAIL_VIEW);
    expect(result.current.view).toBe("grid");
  });

  it("reconciles to the persisted view on mount", () => {
    localStorage.setItem(AREA_DETAIL_VIEW_KEY, "timeline");

    const { result } = renderHook(() => useAreaDetailView());

    expect(result.current.view).toBe("timeline");
  });

  it("writes through the setter", () => {
    const { result } = renderHook(() => useAreaDetailView());

    act(() => result.current.setView("timeline"));

    expect(localStorage.getItem(AREA_DETAIL_VIEW_KEY)).toBe("timeline");
    expect(result.current.view).toBe("timeline");
  });

  it("uses its own key, not the areas-index areas:view key", () => {
    expect(AREA_DETAIL_VIEW_KEY).toBe("area-detail:view");
    // A stored areas-index value must not leak in.
    localStorage.setItem("areas:view", "tree");
    const { result } = renderHook(() => useAreaDetailView());
    expect(result.current.view).toBe("grid");
  });

  it("falls back to the default when the stored value is corrupt", () => {
    localStorage.setItem(AREA_DETAIL_VIEW_KEY, "gantt");

    const { result } = renderHook(() => useAreaDetailView());

    expect(result.current.view).toBe("grid");
  });

  it("survives localStorage throwing", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("localStorage is disabled");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("localStorage is disabled");
    });

    const { result } = renderHook(() => useAreaDetailView());
    expect(result.current.view).toBe("grid");

    // The setter must still move the view for this session even if it cannot persist.
    act(() => result.current.setView("timeline"));
    expect(result.current.view).toBe("timeline");
  });
});
