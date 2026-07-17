/**
 * @vitest-environment jsdom
 *
 * Timeline view + zoom persistence (u3-timeline-core / sesh-1784257742502).
 *
 * Why this test exists: the `lifeos:view` idiom is load-bearing and easy to get
 * subtly wrong. Reading localStorage during render hydrates a mismatch; writing
 * from a mirror effect echoes the stored value straight back on load. This
 * pins both: defaults on first render, reconcile in an effect, write in the
 * setter, and never adopt a corrupt value.
 */

import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_VIEW,
  DEFAULT_ZOOM,
  useTimelineView,
  VIEW_STORAGE_KEY,
  ZOOM_STORAGE_KEY,
} from "@/components/projects/timeline/useTimelineView";

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("useTimelineView", () => {
  it("defaults to the tree view at months zoom", () => {
    const { result } = renderHook(() => useTimelineView());
    expect(result.current.view).toBe(DEFAULT_VIEW);
    expect(result.current.view).toBe("tree");
    expect(result.current.zoom).toBe(DEFAULT_ZOOM);
    expect(result.current.zoom).toBe("months");
  });

  it("reconciles to the persisted view and zoom on mount", () => {
    localStorage.setItem(VIEW_STORAGE_KEY, "timeline");
    localStorage.setItem(ZOOM_STORAGE_KEY, "quarters");

    const { result } = renderHook(() => useTimelineView());

    expect(result.current.view).toBe("timeline");
    expect(result.current.zoom).toBe("quarters");
  });

  it("writes through the setter", () => {
    const { result } = renderHook(() => useTimelineView());

    act(() => result.current.setView("timeline"));
    act(() => result.current.setZoom("weeks"));

    expect(localStorage.getItem(VIEW_STORAGE_KEY)).toBe("timeline");
    expect(localStorage.getItem(ZOOM_STORAGE_KEY)).toBe("weeks");
    expect(result.current.view).toBe("timeline");
    expect(result.current.zoom).toBe("weeks");
  });

  it("falls back to defaults when the stored value is corrupt", () => {
    localStorage.setItem(VIEW_STORAGE_KEY, "gantt");
    localStorage.setItem(ZOOM_STORAGE_KEY, "decades");

    const { result } = renderHook(() => useTimelineView());

    expect(result.current.view).toBe("tree");
    expect(result.current.zoom).toBe("months");
  });

  it("survives localStorage throwing", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("localStorage is disabled");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("localStorage is disabled");
    });

    const { result } = renderHook(() => useTimelineView());
    expect(result.current.view).toBe("tree");

    // The setter must still move the view for this session even if the write
    // cannot be persisted.
    act(() => result.current.setView("timeline"));
    expect(result.current.view).toBe("timeline");
  });
});
