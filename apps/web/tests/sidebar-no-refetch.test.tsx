/**
 * @vitest-environment jsdom
 *
 * Sidebar areas query — no incidental refetch (Phase 5.1 D-P2 #1 / JARVIS-21)
 *
 * Verifies that the Sidebar areas useQuery, when given SSR initialData, does
 * NOT call getAreasForCurrentUser unnecessarily:
 *
 *   Test 1: On mount when initialData is provided — queryFn must not fire
 *     because TanStack sees fresh SSR data (initialDataUpdatedAt: Date.now()
 *     + staleTime: Infinity → data is NEVER stale → refetchOnMount: false
 *     (even if true) skips the fetch).
 *
 *   Test 2: On remount (e.g. Sidebar unmounts + remounts due to React
 *     state churn from JarvisConsole updates) — queryFn must still not fire
 *     because the cache already has fresh data within the staleTime window.
 *     This is the "3 POST /today" regression: without initialDataUpdatedAt,
 *     TanStack treats initialData as updatedAt=0 (instantly stale), so
 *     every remount with refetchOnMount: true fires the queryFn again.
 *     With staleTime: Infinity, remounts never find stale data → no fetch.
 *
 * Root cause (RESEARCH §E): initialData without initialDataUpdatedAt is
 * treated as updatedAt=0 by TanStack 5 — instantly stale on every mount.
 * Fix: initialDataUpdatedAt: Date.now() + staleTime: Infinity on the areas
 * query. Realtime (useTableSubscription) remains the ONLY legitimate update
 * path for actual Postgres areas table changes.
 */

import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { Sidebar } from "@/components/shell/Sidebar";
import type { SidebarArea } from "@/lib/db/queries/sidebar";

// ---------------------------------------------------------------------------
// Spy: getAreasForCurrentUser — the queryFn inside the areas useQuery
// ---------------------------------------------------------------------------

const getAreasSpy = vi.fn(async () => [] as SidebarArea[]);

vi.mock("@/app/actions/areas", () => ({
  getAreasForCurrentUser: () => getAreasSpy(),
  createArea: vi.fn(),
  updateArea: vi.fn(),
  deleteArea: vi.fn(),
  reorderAreas: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Suppress Realtime channel opens (we test TanStack behavior only)
// ---------------------------------------------------------------------------

vi.mock("@/lib/realtime/useTableSubscription", () => ({
  useTableSubscription: () => {},
}));

// ---------------------------------------------------------------------------
// Suppress Supabase client (not needed for this test path)
// ---------------------------------------------------------------------------

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {},
    realtime: {},
  }),
}));

// ---------------------------------------------------------------------------
// Mock next/navigation (Sidebar → SidebarTree → uses router + pathname)
// ---------------------------------------------------------------------------

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/today",
  useSearchParams: () => new URLSearchParams(),
}));

// ---------------------------------------------------------------------------
// Minimal SidebarArea fixture
// ---------------------------------------------------------------------------

const INITIAL_AREAS: SidebarArea[] = [
  {
    id: "area-1",
    name: "Test Area",
    emoji: null,
    orderIndex: 0,
    archivedAt: null,
    projects: [],
  },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Sidebar areas query — no incidental refetch", () => {
  beforeEach(() => {
    getAreasSpy.mockClear();
  });

  it("does not call getAreasForCurrentUser on mount when initialData is provided", async () => {
    // The areas useQuery must NOT fire the queryFn on mount because
    // initialData is provided (SSR-hydrated) AND staleTime: Infinity marks
    // the data as perpetually fresh. Without initialDataUpdatedAt, TanStack 5
    // treats initialData as updatedAt=0 (instantly stale) — with staleTime
    // Infinity and updatedAt=0, the data is still considered stale at mount.
    // The fix: initialDataUpdatedAt: Date.now() marks the SSR data as fresh,
    // so the staleTime: Infinity guard prevents any fetchs.
    const client = new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: 30_000,
          refetchOnMount: false,
          refetchOnWindowFocus: false,
        },
      },
    });

    render(
      <QueryClientProvider client={client}>
        <Sidebar
          userId="u1"
          initialActiveAreas={INITIAL_AREAS}
          initialAllAreas={INITIAL_AREAS}
          graduationYear={2027}
        />
      </QueryClientProvider>,
    );

    // Allow any async effects to settle
    await new Promise((r) => setTimeout(r, 0));

    // queryFn must be 0 — SSR initialData is fresh, no refetch needed
    expect(getAreasSpy).toHaveBeenCalledTimes(0);
  });

  it("does not refetch on remount when staleTime is Infinity (guards against 3x POST /today regression)", async () => {
    // When React re-renders the app shell (e.g. JarvisConsole updates state),
    // the Sidebar may unmount + remount in development (StrictMode) or via
    // navigation. Without the fix, each remount finds stale initialData
    // (updatedAt=0) and fires the queryFn again — causing the "3 POST /today"
    // issue observed in user logs.
    //
    // With staleTime: Infinity + initialDataUpdatedAt: Date.now():
    //   - TanStack sees fresh data on first mount (no fetch)
    //   - On remount within the staleTime window (Infinity), data is still
    //     fresh → no fetch even if refetchOnMount were true
    //
    // This test uses a SHARED QueryClient (simulating the persistent client
    // across the full app session). The queryFn must never be called because
    // the cache has fresh data from the initialData hydration.
    const client = new QueryClient({
      defaultOptions: {
        queries: {
          // Use the same global defaults as QueryProvider.tsx
          staleTime: 30_000,
          refetchOnMount: false,
          refetchOnWindowFocus: false,
        },
      },
    });

    const { unmount } = render(
      <QueryClientProvider client={client}>
        <Sidebar
          userId="u1"
          initialActiveAreas={INITIAL_AREAS}
          initialAllAreas={INITIAL_AREAS}
          graduationYear={2027}
        />
      </QueryClientProvider>,
    );

    await new Promise((r) => setTimeout(r, 0));
    getAreasSpy.mockClear(); // clear any initial mount calls

    // Simulate a remount (as if JarvisConsole state changes caused
    // the Sidebar to unmount + remount, or StrictMode double-invocation)
    unmount();
    render(
      <QueryClientProvider client={client}>
        <Sidebar
          userId="u1"
          initialActiveAreas={INITIAL_AREAS}
          initialAllAreas={INITIAL_AREAS}
          graduationYear={2027}
        />
      </QueryClientProvider>,
    );

    await new Promise((r) => setTimeout(r, 50));

    // With staleTime: Infinity, the cached data is never stale → no refetch
    // on remount. This is the regression guard for the "3 POST /today" issue.
    expect(getAreasSpy).toHaveBeenCalledTimes(0);
  });
});
