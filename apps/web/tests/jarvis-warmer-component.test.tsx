/**
 * Phase 11 / CACHE-04 (D-03) — JarvisWarmer client component.
 *
 * Covers:
 *   1. Mount fires warm once (app open trigger)
 *   2. jarvis-input-focus dispatch fires warm AFTER 30s debounce window
 *   3. 30s debounce drops same-trigger within window
 *   4. Cross-trigger debounce isolation: mount-debounce does NOT block
 *      input-focus, and input-focus does NOT block mic-arm — each has its
 *      own slot in the lastFiredRef Map
 *   5. fetch failure is silently caught — component does not throw or
 *      surface error to the UI
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

import { JarvisWarmer } from "@/components/jarvis/JarvisWarmer";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: false });
  vi.setSystemTime(new Date("2026-05-31T00:00:00Z"));
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function lastFetchCall(): { url: string; method: string } {
  const calls = fetchMock.mock.calls;
  const [url, init] = calls[calls.length - 1] as [string, RequestInit | undefined];
  return { url, method: init?.method ?? "GET" };
}

describe("JarvisWarmer", () => {
  it("mount fires warm once", async () => {
    render(<JarvisWarmer />);
    // Let microtasks (the fire-and-forget fetch().catch()) settle.
    await vi.advanceTimersByTimeAsync(0);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(lastFetchCall()).toEqual({
      url: "/api/jarvis/warm",
      method: "POST",
    });
  });

  it("dispatching jarvis-input-focus AFTER 30s debounce window fires warm again", async () => {
    render(<JarvisWarmer />);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1); // mount

    // Past the 30s mount-trigger debounce window. input-focus has its own
    // slot so the first input-focus fires regardless of the mount window;
    // pick 31s to make the test resilient to either interpretation.
    await vi.advanceTimersByTimeAsync(31_000);
    window.dispatchEvent(new CustomEvent("jarvis-input-focus"));
    await vi.advanceTimersByTimeAsync(0);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("30s debounce drops same-trigger within window", async () => {
    render(<JarvisWarmer />);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // First input-focus opens its slot — fires immediately.
    window.dispatchEvent(new CustomEvent("jarvis-input-focus"));
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // Second input-focus 10s later — INSIDE the 30s input-focus window.
    // Must be dropped.
    await vi.advanceTimersByTimeAsync(10_000);
    window.dispatchEvent(new CustomEvent("jarvis-input-focus"));
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(2); // still 2 — debounce dropped
  });

  it("cross-trigger debounce isolation: input-focus + mic-arm have independent slots", async () => {
    render(<JarvisWarmer />);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1); // mount

    // 5s after mount — input-focus fires (its own slot is fresh, NOT
    // blocked by the mount slot).
    await vi.advanceTimersByTimeAsync(5_000);
    window.dispatchEvent(new CustomEvent("jarvis-input-focus"));
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // Another 5s — total 10s elapsed. mic-arm slot is also fresh.
    await vi.advanceTimersByTimeAsync(5_000);
    window.dispatchEvent(new CustomEvent("mic-arm"));
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(3);

    // Re-firing mic-arm 5s later — INSIDE its 30s window. Dropped.
    await vi.advanceTimersByTimeAsync(5_000);
    window.dispatchEvent(new CustomEvent("mic-arm"));
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("fetch failure is silently caught — component does not throw", async () => {
    fetchMock.mockRejectedValue(new Error("network is down"));

    // If the component re-threw, render() would throw too.
    expect(() => {
      render(<JarvisWarmer />);
    }).not.toThrow();

    // Let the unhandled rejection settle via the .catch() handler.
    await vi.advanceTimersByTimeAsync(0);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    // No unhandled rejection should have leaked. Vitest reports them as
    // failures if they do — passing this test IS the assertion that no
    // user-facing error surfaces.
  });
});
