import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useVoiceSourceStatus } from "@/lib/voice/use-voice-source-status";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeStatusResponse(
  desktopClaimed: boolean,
  expiresAt: number | null = null,
): Response {
  return new Response(JSON.stringify({ desktopClaimed, expiresAt }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("useVoiceSourceStatus", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("starts with isLoading=true and desktopClaimed=false before first fetch", () => {
    // fetch resolves asynchronously; we check synchronous initial state.
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(() => Promise.resolve(makeStatusResponse(false)));

    const { result } = renderHook(() => useVoiceSourceStatus());

    expect(result.current.isLoading).toBe(true);
    expect(result.current.desktopClaimed).toBe(false);

    fetchSpy.mockRestore();
  });

  it("resolves to desktopClaimed=false after fetch returns unclaimed state", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(() => Promise.resolve(makeStatusResponse(false)));

    const { result } = renderHook(() => useVoiceSourceStatus());

    // Flush microtask queue (the fetch + .json() promises).
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.desktopClaimed).toBe(false);

    fetchSpy.mockRestore();
  });

  it("resolves to desktopClaimed=true when server says desktop is active", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(() => Promise.resolve(makeStatusResponse(true, Date.now() + 20_000)));

    const { result } = renderHook(() => useVoiceSourceStatus());

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.desktopClaimed).toBe(true);

    fetchSpy.mockRestore();
  });

  it("polls at the expected interval (2500 ms)", async () => {
    let callCount = 0;
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(() => {
      callCount++;
      return Promise.resolve(makeStatusResponse(false));
    });

    renderHook(() => useVoiceSourceStatus());

    // Initial call on mount.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(callCount).toBe(1);

    // Advance 2500 ms — expect a second poll.
    await act(async () => {
      vi.advanceTimersByTime(2_500);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(callCount).toBe(2);

    // Advance another 2500 ms — expect a third poll.
    await act(async () => {
      vi.advanceTimersByTime(2_500);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(callCount).toBe(3);

    fetchSpy.mockRestore();
  });

  it("cleans up the interval on unmount", async () => {
    let callCount = 0;
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(() => {
      callCount++;
      return Promise.resolve(makeStatusResponse(false));
    });

    const { unmount } = renderHook(() => useVoiceSourceStatus());

    // Initial fetch.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(callCount).toBe(1);

    unmount();

    // No more fetches after unmount even after the poll interval elapses.
    await act(async () => {
      vi.advanceTimersByTime(5_000);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(callCount).toBe(1);

    fetchSpy.mockRestore();
  });

  it("reflects desktopClaimed flip from true → false on subsequent poll", async () => {
    let callCount = 0;
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(() => {
      callCount++;
      // First call: desktop active. Second call: desktop gone.
      const claimed = callCount === 1;
      return Promise.resolve(makeStatusResponse(claimed));
    });

    const { result } = renderHook(() => useVoiceSourceStatus());

    // First fetch → claimed=true.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.desktopClaimed).toBe(true);

    // Advance poll interval → second fetch → claimed=false.
    await act(async () => {
      vi.advanceTimersByTime(2_500);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.desktopClaimed).toBe(false);

    fetchSpy.mockRestore();
  });

  it("retains last known state on network error (no flip to false on transient failure)", async () => {
    let callCount = 0;
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // First call succeeds with claimed=true.
        return Promise.resolve(makeStatusResponse(true));
      }
      // Subsequent calls simulate network failure.
      return Promise.reject(new Error("Network error"));
    });

    const { result } = renderHook(() => useVoiceSourceStatus());

    // First fetch → claimed=true.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.desktopClaimed).toBe(true);

    // Advance poll → network failure → should NOT flip to false.
    await act(async () => {
      vi.advanceTimersByTime(2_500);
      await Promise.resolve();
      await Promise.resolve();
    });
    // Stale claimed=true is preserved; no false negative on transient error.
    expect(result.current.desktopClaimed).toBe(true);

    fetchSpy.mockRestore();
  });
});
