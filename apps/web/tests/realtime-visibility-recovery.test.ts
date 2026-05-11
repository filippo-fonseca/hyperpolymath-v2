import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, render } from "@testing-library/react";
import React from "react";
import {
  QueryClient,
  QueryClientProvider,
  useQueryClient,
} from "@tanstack/react-query";

/**
 * RT-03 / D-11 visibility recovery — exercises the PRODUCTION `<QueryProvider>`.
 *
 * Per checker M4, this test does NOT replicate the visibilitychange listener
 * — it mounts the real provider component so the production code path is
 * what runs under test. The provider's internal `QueryClient` is captured
 * via a `CaptureClient` child that calls `useQueryClient()`, and the spy
 * on `invalidateQueries` is attached to that same client. `useTableSubscription`
 * hooks then register `(table, userId)` keys into the shared visibility
 * registry; dispatching a `visibilitychange` event drives the provider's
 * effect-installed listener, which walks the registry and invalidates each
 * key exactly once on the captured client.
 *
 * M4 also requires `Object.defineProperty(document, "visibilityState", ...)`
 * to be installed ONCE per test with `writable: true` — otherwise the
 * second test throws "Cannot redefine property" when jsdom carries the
 * non-configurable descriptor across cases.
 */

// Mock supabase browser client (per CLAUDE.md: mock at our wrapper boundary,
// not @supabase/supabase-js directly). The channel itself is irrelevant here —
// we only need `useTableSubscription` to register with the visibility registry.
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
  __resetChannelsForTests,
} from "@/lib/realtime/useTableSubscription";
import { __resetForTests as resetVisibility } from "@/lib/realtime/visibility";
import { QueryProvider } from "@/components/providers/QueryProvider";

/**
 * Child component that hands the parent QueryProvider's internal QueryClient
 * back up to the test so we can spy on `invalidateQueries`. Mirrors the M4
 * directive: render the production provider, do not reimplement its listener.
 */
function CaptureClient({
  onClient,
}: {
  onClient: (qc: QueryClient) => void;
}) {
  const qc = useQueryClient();
  React.useEffect(() => {
    onClient(qc);
  }, [qc, onClient]);
  return null;
}

describe("Visibility recovery (RT-03 / D-11)", () => {
  beforeEach(() => {
    __resetChannelsForTests();
    resetVisibility();
    channelFactory.mockClear();
    onMock.mockClear();
    subscribe.mockClear();
    unsubscribe.mockClear();

    // M4: define visibilityState ONCE per test with writable: true so the
    // second test does not throw "Cannot redefine property". Subsequent
    // tests assign `.value = "visible" | "hidden"` directly.
    Object.defineProperty(document, "visibilityState", {
      value: "visible",
      writable: true,
      configurable: true,
    });
  });

  function renderProductionProvider(): {
    qc: QueryClient;
    unmount: () => void;
  } {
    let captured: QueryClient | null = null;
    const utils = render(
      React.createElement(
        QueryProvider,
        null,
        React.createElement(CaptureClient, {
          onClient: (qc: QueryClient) => {
            captured = qc;
          },
        }),
      ),
    );
    if (!captured) throw new Error("Failed to capture QueryClient");
    return { qc: captured, unmount: utils.unmount };
  }

  it("visibilitychange → visible invalidates one entry per active (table, userId)", () => {
    const { qc } = renderProductionProvider();
    // Spy after render so the production listener installs against the same
    // client we're spying on (QueryProvider's useEffect closes over `qc`).
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");

    // Register three active (table, userId) keys via the hook, sharing the
    // SAME QueryClient as <QueryProvider> by mounting them inside a wrapper
    // that points at the captured client.
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: qc }, children);

    renderHook(() => useTableSubscription("tasks", "uid-a"), { wrapper });
    renderHook(() => useTableSubscription("captures", "uid-a"), { wrapper });
    renderHook(() => useTableSubscription("areas", "uid-a"), { wrapper });

    invalidateSpy.mockClear();

    // M4: change `.value` (no redefine), then dispatch event. The listener
    // installed by <QueryProvider>'s useEffect fires and walks the registry.
    (document as unknown as { visibilityState: string }).visibilityState =
      "visible";
    document.dispatchEvent(new Event("visibilitychange"));

    // Exactly 3 invalidations — one per active (table, userId) pair.
    expect(invalidateSpy).toHaveBeenCalledTimes(3);
  });

  it("hidden → visible without any active subscriptions: no invalidation", () => {
    const { qc } = renderProductionProvider();
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");

    (document as unknown as { visibilityState: string }).visibilityState =
      "visible";
    document.dispatchEvent(new Event("visibilitychange"));

    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it("duplicate mount of same (table, userId): visibilitychange fires invalidation only ONCE for that key", () => {
    const { qc } = renderProductionProvider();
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: qc }, children);

    // Two mounts of the same key — refcounted, one channel underneath, ONE
    // registry entry per the visibility coordinator's refcount semantics.
    renderHook(() => useTableSubscription("tasks", "uid-a"), { wrapper });
    renderHook(() => useTableSubscription("tasks", "uid-a"), { wrapper });

    invalidateSpy.mockClear();

    (document as unknown as { visibilityState: string }).visibilityState =
      "visible";
    document.dispatchEvent(new Event("visibilitychange"));

    expect(invalidateSpy).toHaveBeenCalledTimes(1);
  });
});
