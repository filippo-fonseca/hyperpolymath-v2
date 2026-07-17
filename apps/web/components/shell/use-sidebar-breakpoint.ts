"use client";

import { useEffect, useState } from "react";

/**
 * Sidebar breakpoint machinery (u7 — mobile-progressive shell).
 *
 * Below the Tailwind `md` breakpoint (48rem) the sidebar can no longer afford
 * its 230px expanded column: at ~390px it leaves the route ~160px and clips
 * downstream toolbars (the /areas timeline was the reported repro). So below
 * `md` the sidebar defaults to the collapsed rail and expansion becomes the
 * existing z-50 hover-peek OVERLAY, opened by the collapse toggle (coarse
 * pointers have no hover) and closed by tap-outside / Escape / navigation.
 *
 * The load-bearing invariant: this is DERIVED state, never persisted. A phone
 * visit must not overwrite the user's desktop collapse preference. The three
 * helpers below are pure so the two properties that matter — "below md defaults
 * to the rail" and "toggling below md never writes the preference" — are
 * unit-testable without mounting the whole realtime/query-heavy Sidebar.
 */

/** The exact Tailwind `md` breakpoint (48rem). No bespoke px media queries. */
export const MD_QUERY = "(min-width: 48rem)";

/**
 * SSR-safe "is the viewport below `md`" hook. Defaults to `false` (desktop-first)
 * so the server and the first client paint agree; the real value is read from
 * `matchMedia` in an effect and kept live via the `change` subscription. Reading
 * during render would break SSR (no `window`) and risk a hydration mismatch, so
 * we never touch `matchMedia` outside the effect.
 */
export function useIsBelowMd(): boolean {
  const [belowMd, setBelowMd] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }
    const mql = window.matchMedia(MD_QUERY);
    const sync = () => setBelowMd(!mql.matches);
    sync();
    mql.addEventListener("change", sync);
    return () => mql.removeEventListener("change", sync);
  }, []);

  return belowMd;
}

export interface SidebarLayoutInput {
  /** Viewport is below `md`. */
  belowMd: boolean;
  /** The user's persisted collapse preference (desktop-owned). */
  collapsed: boolean;
  /** Pointer is hovering the sidebar (desktop peek). */
  hovered: boolean;
  /** The below-`md` toggle-driven overlay is open. */
  overlayOpen: boolean;
}

export interface SidebarLayout {
  /**
   * The OUTER aside occupies the rail width (no layout push). True whenever the
   * viewport is below `md` (the rail is forced) or the user pinned it collapsed.
   */
  railMode: boolean;
  /**
   * What every inner UI bit reads to decide rail-vs-expanded presentation.
   * Above `md` it is the classic `collapsed && !hovered`; below `md` it tracks
   * the overlay (open === expanded), independent of the persisted preference.
   */
  effectiveCollapsed: boolean;
  /**
   * The inner panel is expanded while the outer aside stays at rail width — so
   * it must float as the z-50 overlay. Covers both the desktop hover-peek and
   * the below-`md` toggle overlay with one flag.
   */
  peeking: boolean;
}

/**
 * Derive the sidebar's layout flags from breakpoint + persisted + interaction
 * state. Pure: same inputs → same outputs, no DOM, no storage.
 *
 * Above `md` this reproduces today's behavior exactly (`belowMd` false collapses
 * every branch back to the original `collapsed && !hovered`). Below `md` the
 * rail is forced and the overlay — not the persisted preference — drives
 * expansion.
 */
export function deriveSidebarLayout({
  belowMd,
  collapsed,
  hovered,
  overlayOpen,
}: SidebarLayoutInput): SidebarLayout {
  const railMode = belowMd || collapsed;
  const effectiveCollapsed = belowMd ? !overlayOpen : collapsed && !hovered;
  const peeking = railMode && !effectiveCollapsed;
  return { railMode, effectiveCollapsed, peeking };
}

export interface ToggleInput {
  belowMd: boolean;
  collapsed: boolean;
  overlayOpen: boolean;
}

export interface ToggleDecision {
  /**
   * Whether the collapse toggle should WRITE the persisted preference. False
   * below `md` — the whole point of the unit: breakpoint-driven collapse is
   * derived, never persisted.
   */
  persistCollapsed: boolean;
  /** Next persisted collapse value (unchanged below `md`). */
  nextCollapsed: boolean;
  /** Next overlay-open value (only meaningful below `md`; reset above). */
  nextOverlayOpen: boolean;
  /** Which sound the toggle plays. */
  sfx: "sidebarCollapse" | "sidebarExpand";
}

/**
 * Decide what the collapse toggle does. Below `md` it only opens/closes the
 * overlay and NEVER persists; above `md` it flips and persists the preference
 * exactly as today.
 */
export function planToggle({ belowMd, collapsed, overlayOpen }: ToggleInput): ToggleDecision {
  if (belowMd) {
    const nextOverlayOpen = !overlayOpen;
    return {
      persistCollapsed: false,
      nextCollapsed: collapsed,
      nextOverlayOpen,
      sfx: nextOverlayOpen ? "sidebarExpand" : "sidebarCollapse",
    };
  }
  const nextCollapsed = !collapsed;
  return {
    persistCollapsed: true,
    nextCollapsed,
    nextOverlayOpen: false,
    sfx: nextCollapsed ? "sidebarCollapse" : "sidebarExpand",
  };
}
