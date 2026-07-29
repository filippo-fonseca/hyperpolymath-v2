/**
 * @vitest-environment jsdom
 *
 * Google Calendar connection badge on the sidebar rails (sesh-1785262075262 / u4,
 * issue #351).
 *
 * The connection status had a query, a route and a hook, and the dot renderer
 * already existed, but only the Settings row was ever wired to it. A user whose
 * token was revoked saw a Calendar page quietly serving nothing, with the only
 * hint sitting on a row they had no reason to look at. These tests pin the three
 * things that make the indicator trustworthy:
 *
 *   Test 1: it renders on the Calendar row in both rail states when the token is
 *     gone. The collapsed rail matters most: at 56px the label is gone, so the
 *     dot is the entire signal.
 *
 *   Test 2: it is absent when connected. An indicator that is always on is
 *     decoration, and the accent-free coral is reserved for real state.
 *
 *   Test 3: it is absent while the status is still loading. This is the failure
 *     that would quietly ruin the feature: a red dot on every page load, gone a
 *     beat later, teaches the eye to ignore it.
 *
 * The copy itself is asserted directly on the hook, because the tooltip only
 * mounts on hover through a Radix portal.
 */

import { useGcalBadge } from "@/components/shell/GcalStatusIndicator";
import {
  PersistentNav,
  SidebarGcalAlert,
  SidebarSystemNav,
} from "@/components/shell/PersistentNav";
import type { GcalConnectionStatus } from "@/lib/db/queries/gcal-connection";
import { render, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// `undefined` stands for "the query has not resolved", which is a distinct case
// from every settled status and gets its own test.
let status: GcalConnectionStatus | undefined = "not_connected";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/lifeos",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/gcal/useGcalConnectionStatus", () => ({
  useGcalConnectionStatus: () => ({ data: status }),
}));

/** The dot, scoped to one row, so a Settings badge can never satisfy a Calendar assertion. */
function dotIn(href: string) {
  return (
    document.querySelector(`a[href="${href}"]`)?.querySelector('[data-slot="gcal-status-dot"]') ??
    null
  );
}

afterEach(() => {
  status = "not_connected";
});

describe("Google Calendar nav badge", () => {
  it("marks the Calendar row when the connection is missing, expanded and collapsed", () => {
    status = "not_connected";

    for (const collapsed of [false, true]) {
      const { unmount } = render(<PersistentNav collapsed={collapsed} />);
      const dot = dotIn("/calendar");

      expect(dot).not.toBeNull();
      expect(dot).toHaveAttribute("aria-label", "Google Calendar disconnected");
      // Functional ink, never the accent (§2.3). The dot is a state report.
      expect(dot).toHaveStyle({ backgroundColor: "var(--ink-coral)" });
      unmount();
    }
  });

  it("also marks the Settings row, so the fix is reachable from anywhere", () => {
    status = "not_connected";

    render(<SidebarSystemNav collapsed={false} />);
    expect(dotIn("/settings")).not.toBeNull();
  });

  it("shows nothing on the Calendar row when the connection is healthy", () => {
    status = "connected";

    render(<PersistentNav collapsed={false} />);
    expect(dotIn("/calendar")).toBeNull();
  });

  it("shows nothing while the status is still loading", () => {
    status = undefined;

    for (const collapsed of [false, true]) {
      const { unmount } = render(<PersistentNav collapsed={collapsed} />);
      expect(dotIn("/calendar")).toBeNull();
      unmount();
    }
  });

  it("explains the problem and the way out, per status", () => {
    status = "not_connected";
    const disconnected = renderHook(() => useGcalBadge()).result.current;
    expect(disconnected?.tooltip).toContain("Google Calendar");
    expect(disconnected?.tooltip).toContain("Settings");

    // "expired" is reserved rather than surfaced eagerly, but if it ever is, it
    // must not read as "you never connected this".
    status = "expired";
    const expired = renderHook(() => useGcalBadge()).result.current;
    expect(expired?.tooltip).toContain("Google Calendar");
    expect(expired?.tooltip).toContain("Settings");
    expect(expired?.label).not.toEqual(disconnected?.label);

    status = "connected";
    expect(renderHook(() => useGcalBadge()).result.current).toBeNull();
  });
});

/**
 * The pinned copy of the same signal.
 *
 * The Calendar row's badge is correct and unreachable: MAIN is the sidebar's
 * scroll column, Calendar is its thirteenth row, and at 1280x720 the column
 * shows about nine. `SidebarGcalAlert` mounts in the pinned footer stack
 * instead, so the fault is on screen at every laptop height without a scroll.
 * A DOM-only assertion cannot tell the two apart, so these tests pin the
 * properties that make the pinned one worth having: it exists in both rail
 * states, it links to the reconnect control, and it costs nothing when the
 * connection is healthy.
 */
function alert() {
  return document.querySelector('[data-slot="gcal-sidebar-alert"]');
}

describe("pinned Google Calendar fault row", () => {
  it("renders in both rail states and links to the reconnect control", () => {
    status = "not_connected";

    for (const collapsed of [false, true]) {
      const { unmount } = render(<SidebarGcalAlert collapsed={collapsed} />);
      const row = alert();

      expect(row).not.toBeNull();
      expect(row).toHaveAttribute("href", "/settings#integrations");
      expect(row?.getAttribute("aria-label")).toContain("Google Calendar disconnected");
      unmount();
    }
  });

  it("spells the fault out in words when the rail is expanded", () => {
    status = "not_connected";

    const { unmount } = render(<SidebarGcalAlert collapsed={false} />);
    expect(alert()?.textContent).toBe("Calendar offline");
    unmount();

    // Collapsed is 56px of rail: the dot carries it, the label would not fit.
    render(<SidebarGcalAlert collapsed={true} />);
    expect(alert()?.textContent).toBe("");
  });

  it("occupies no vertical space when the connection is healthy or still loading", () => {
    for (const settled of ["connected", undefined] as const) {
      status = settled;
      const { unmount } = render(<SidebarGcalAlert collapsed={false} />);
      expect(alert()).toBeNull();
      unmount();
    }
  });
});
