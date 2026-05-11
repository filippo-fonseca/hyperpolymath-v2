import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Mock supabase browser client (per CLAUDE.md: mock at our wrapper boundary,
// not @supabase/supabase-js directly).
const unsubscribe = vi.fn().mockResolvedValue(undefined);
const subscribe = vi.fn().mockReturnValue({ unsubscribe });
const onMock = vi.fn().mockReturnValue({ subscribe, unsubscribe });
const channelFactory = vi
  .fn()
  .mockReturnValue({ on: onMock, subscribe, unsubscribe });

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ channel: channelFactory }),
}));

import {
  useTableSubscription,
  __getChannelMapForTests,
  __resetChannelsForTests,
} from "@/lib/realtime/useTableSubscription";
import {
  __resetForTests as resetVisibility,
  getActiveTables,
} from "@/lib/realtime/visibility";

function wrap() {
  const qc = new QueryClient();
  // eslint-disable-next-line react/display-name
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
}

describe("useTableSubscription singleton (RT-01 / D-08)", () => {
  beforeEach(() => {
    __resetChannelsForTests();
    resetVisibility();
    channelFactory.mockClear();
    subscribe.mockClear();
    unsubscribe.mockClear();
    onMock.mockClear();
  });

  it("opens exactly one channel for two mounts of the same (table, userId)", () => {
    const wrapper = wrap();
    const a = renderHook(() => useTableSubscription("tasks", "uid-a"), {
      wrapper,
    });
    const b = renderHook(() => useTableSubscription("tasks", "uid-a"), {
      wrapper,
    });

    // Singleton: channelFactory called once even though hook mounted twice
    expect(channelFactory).toHaveBeenCalledTimes(1);
    expect(__getChannelMapForTests().get("tasks::uid-a")?.refcount).toBe(2);

    a.unmount();
    // Refcount drops but channel stays open
    expect(__getChannelMapForTests().get("tasks::uid-a")?.refcount).toBe(1);
    expect(unsubscribe).not.toHaveBeenCalled();

    b.unmount();
    // Last consumer gone — channel closed
    expect(__getChannelMapForTests().get("tasks::uid-a")).toBeUndefined();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("opens separate channels for different tables under the same user", () => {
    const wrapper = wrap();
    renderHook(() => useTableSubscription("tasks", "uid-a"), { wrapper });
    renderHook(() => useTableSubscription("captures", "uid-a"), { wrapper });
    expect(channelFactory).toHaveBeenCalledTimes(2);
  });

  it("registers (table, userId) with the visibility coordinator", () => {
    const wrapper = wrap();
    const h = renderHook(() => useTableSubscription("tasks", "uid-a"), {
      wrapper,
    });
    expect(getActiveTables()).toEqual([{ table: "tasks", userId: "uid-a" }]);
    h.unmount();
    expect(getActiveTables()).toEqual([]);
  });

  it("is a no-op when userId is empty (SSR-safe)", () => {
    const wrapper = wrap();
    renderHook(() => useTableSubscription("tasks", ""), { wrapper });
    expect(channelFactory).not.toHaveBeenCalled();
  });

  it("is a no-op when enabled=false", () => {
    const wrapper = wrap();
    renderHook(
      () => useTableSubscription("tasks", "uid-a", { enabled: false }),
      { wrapper },
    );
    expect(channelFactory).not.toHaveBeenCalled();
  });

  it("alsoInvalidate fans invalidation out to extra keys (D-10)", () => {
    // Use a dedicated QueryClient so we can spy on invalidateQueries without
    // hitting the shared `wrap()` factory's instance.
    const qc = new QueryClient();
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");
    const customWrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: qc }, children);

    renderHook(
      () =>
        useTableSubscription("captures_hashtags", "uid-a", {
          alsoInvalidate: [
            ["hashtags", "uid-a"],
            ["captures", "uid-a"],
          ],
        }),
      { wrapper: customWrapper },
    );

    // M1: onMock was mockClear'd in beforeEach, so .at(-1) is THIS test's
    // handler (the most recent registration), not a stale one from a prior test.
    const onCalls = (onMock as unknown as { mock: { calls: unknown[][] } })
      .mock.calls;
    const handler = onCalls.at(-1)?.[2] as (payload: unknown) => void;
    expect(handler).toBeTypeOf("function");
    handler({});

    // Primary + 2 extra keys = 3 invalidations
    expect(invalidateSpy).toHaveBeenCalledTimes(3);
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["captures_hashtags", "uid-a"],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["hashtags", "uid-a"],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["captures", "uid-a"],
    });
  });

  it("alsoInvalidate from a later mount accrues to the singleton entry", () => {
    const wrapper = wrap();
    renderHook(
      () =>
        useTableSubscription("captures_hashtags", "uid-a", {
          alsoInvalidate: [["hashtags", "uid-a"]],
        }),
      { wrapper },
    );
    renderHook(
      () =>
        useTableSubscription("captures_hashtags", "uid-a", {
          alsoInvalidate: [["captures", "uid-a"]],
        }),
      { wrapper },
    );
    // Singleton still: one channel
    expect(channelFactory).toHaveBeenCalledTimes(1);
    const entry = __getChannelMapForTests().get("captures_hashtags::uid-a");
    expect(entry?.refcount).toBe(2);
    // Both extra keys accrued on the single entry
    expect(entry?.extraKeys).toContain(JSON.stringify(["hashtags", "uid-a"]));
    expect(entry?.extraKeys).toContain(JSON.stringify(["captures", "uid-a"]));
  });
});
