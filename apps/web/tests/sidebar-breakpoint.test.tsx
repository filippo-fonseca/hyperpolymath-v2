/**
 * @vitest-environment jsdom
 *
 * Sidebar breakpoint behavior — derived, never persisted (sesh-1784257742502 / u7)
 *
 * The mobile-progressive shell rests on two invariants the Conductor pinned:
 *
 *   1. Below `md` the sidebar defaults to the collapsed RAIL and expansion is an
 *      overlay — the outer aside never claims the 230px expanded width, so the
 *      route keeps its space and downstream toolbars (the /areas timeline repro)
 *      stop clipping. `deriveSidebarLayout` must force the rail below md even
 *      when the persisted preference is expanded.
 *
 *   2. The breakpoint is DERIVED state, never persisted. Toggling the sidebar
 *      below md must NOT write `sidebar-collapsed`, or a phone visit would
 *      permanently collapse the desktop sidebar. `planToggle` proves this with
 *      `persistCollapsed === false` below md.
 *
 * The full <Sidebar> is not mounted here — it drags in realtime, react-query,
 * theme and audio. Extracting the decision logic into pure helpers lets these
 * two load-bearing properties be verified directly, plus the matchMedia hook via
 * a mocked media-query list.
 */

import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  deriveSidebarLayout,
  planToggle,
  useIsBelowMd,
  MD_QUERY,
} from "@/components/shell/use-sidebar-breakpoint";

describe("deriveSidebarLayout", () => {
  it("forces the rail below md even when the persisted preference is expanded", () => {
    const layout = deriveSidebarLayout({
      belowMd: true,
      collapsed: false, // desktop preference says expanded…
      hovered: false,
      overlayOpen: false, // …but the overlay is closed
    });
    // …so below md we still render the rail, with no layout-pushing width.
    expect(layout.railMode).toBe(true);
    expect(layout.effectiveCollapsed).toBe(true);
    expect(layout.peeking).toBe(false);
  });

  it("below md tracks the overlay, not the persisted preference", () => {
    const open = deriveSidebarLayout({
      belowMd: true,
      collapsed: true, // preference is collapsed…
      hovered: false,
      overlayOpen: true, // …but the overlay is open
    });
    // Open overlay === expanded panel floating over the route.
    expect(open.effectiveCollapsed).toBe(false);
    expect(open.railMode).toBe(true); // outer aside still railed (no push)
    expect(open.peeking).toBe(true); // so the panel floats as the overlay
  });

  it("at >= md reproduces today's collapsed + hover-peek exactly", () => {
    // Expanded, pinned.
    expect(
      deriveSidebarLayout({ belowMd: false, collapsed: false, hovered: false, overlayOpen: false })
    ).toEqual({ railMode: false, effectiveCollapsed: false, peeking: false });

    // Collapsed rail, no pointer.
    expect(
      deriveSidebarLayout({ belowMd: false, collapsed: true, hovered: false, overlayOpen: false })
    ).toEqual({ railMode: true, effectiveCollapsed: true, peeking: false });

    // Collapsed + hovered === the classic hover-peek overlay.
    expect(
      deriveSidebarLayout({ belowMd: false, collapsed: true, hovered: true, overlayOpen: false })
    ).toEqual({ railMode: true, effectiveCollapsed: false, peeking: true });
  });

  it("ignores the below-md overlay flag above md (overlay is a below-md concept)", () => {
    const stale = deriveSidebarLayout({
      belowMd: false,
      collapsed: true,
      hovered: false,
      overlayOpen: true, // must not leak into desktop behavior
    });
    expect(stale.effectiveCollapsed).toBe(true);
    expect(stale.peeking).toBe(false);
  });
});

describe("planToggle", () => {
  it("below md toggles only the overlay and NEVER persists", () => {
    const opening = planToggle({ belowMd: true, collapsed: false, overlayOpen: false });
    expect(opening.persistCollapsed).toBe(false);
    expect(opening.nextCollapsed).toBe(false); // preference untouched
    expect(opening.nextOverlayOpen).toBe(true);
    expect(opening.sfx).toBe("sidebarExpand");

    const closing = planToggle({ belowMd: true, collapsed: true, overlayOpen: true });
    expect(closing.persistCollapsed).toBe(false);
    expect(closing.nextCollapsed).toBe(true); // preference untouched
    expect(closing.nextOverlayOpen).toBe(false);
    expect(closing.sfx).toBe("sidebarCollapse");
  });

  it("at >= md flips and persists the preference, resetting the overlay", () => {
    const collapsing = planToggle({ belowMd: false, collapsed: false, overlayOpen: false });
    expect(collapsing.persistCollapsed).toBe(true);
    expect(collapsing.nextCollapsed).toBe(true);
    expect(collapsing.nextOverlayOpen).toBe(false);
    expect(collapsing.sfx).toBe("sidebarCollapse");

    const expanding = planToggle({ belowMd: false, collapsed: true, overlayOpen: false });
    expect(expanding.persistCollapsed).toBe(true);
    expect(expanding.nextCollapsed).toBe(false);
    expect(expanding.sfx).toBe("sidebarExpand");
  });
});

describe("useIsBelowMd", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /**
   * Minimal matchMedia stub whose `matches` we can flip, capturing the `change`
   * listener so the test can drive a viewport crossing.
   */
  function stubMatchMedia(initialMatches: boolean) {
    let matches = initialMatches;
    const listeners = new Set<(e: MediaQueryListEvent) => void>();
    const mql = {
      get matches() {
        return matches;
      },
      media: MD_QUERY,
      addEventListener: (_: string, cb: (e: MediaQueryListEvent) => void) => {
        listeners.add(cb);
      },
      removeEventListener: (_: string, cb: (e: MediaQueryListEvent) => void) => {
        listeners.delete(cb);
      },
    };
    vi.stubGlobal(
      "matchMedia",
      vi.fn((query: string) => {
        expect(query).toBe(MD_QUERY); // the hook must use the exact md query
        return mql;
      })
    );
    return {
      set(next: boolean) {
        matches = next;
        for (const cb of listeners) cb({ matches } as MediaQueryListEvent);
      },
    };
  }

  it("reports below-md when the min-width query does not match, and reacts to changes", () => {
    // Narrow viewport: (min-width: 48rem) does NOT match → below md.
    const control = stubMatchMedia(false);
    const { result } = renderHook(() => useIsBelowMd());
    expect(result.current).toBe(true);

    // Cross up to >= md.
    act(() => control.set(true));
    expect(result.current).toBe(false);

    // …and back down.
    act(() => control.set(false));
    expect(result.current).toBe(true);
  });

  it("reports NOT below-md on a wide viewport", () => {
    stubMatchMedia(true);
    const { result } = renderHook(() => useIsBelowMd());
    expect(result.current).toBe(false);
  });
});
