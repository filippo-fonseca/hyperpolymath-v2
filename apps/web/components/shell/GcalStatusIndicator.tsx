"use client";

/**
 * Google Calendar connection indicator for the sidebar rails (U4, issue #351).
 *
 * The status infrastructure already existed end to end: `getGcalConnectionStatus`
 * derives the state from `users.gcalRefreshTokenEncrypted`, `GET /api/gcal/status`
 * exposes it, and `useGcalConnectionStatus()` caches it. The only thing missing was
 * surfacing it on the Calendar row itself, so a dropped connection was invisible
 * unless you happened to be looking at Settings.
 *
 * Two rails read this: MAIN (`PersistentNav`, the /calendar row) and SYSTEM
 * (`SidebarSystemNav`, the /settings row). They are siblings mounted separately by
 * the sidebar, so there is no shared parent to hoist a fetch into without editing
 * the shell. There does not need to be: both observers share the single
 * `["gcal-connection-status"]` TanStack Query cache entry, so the two reads dedupe
 * into one request and one refetch cadence. That is the "lift it so both can read
 * it without two subscriptions" requirement satisfied at the cache layer rather
 * than by a context provider the rails cannot mount.
 *
 * `undefined` (the hook has not resolved) deliberately yields no badge. A red dot
 * that appears and then vanishes on every page load would train the eye to ignore
 * it, which is exactly the failure this indicator exists to prevent.
 */

import { useGcalConnectionStatus } from "@/lib/gcal/useGcalConnectionStatus";
import { cn } from "@/lib/utils";

export interface GcalBadge {
  /** Accessible name on the dot; also what headless verification asserts on. */
  label: string;
  /** Sentence-case tooltip copy: what is wrong, and the path back. */
  tooltip: string;
  /** Two-word label for the pinned fault row, where the dot has room to speak. */
  short: string;
}

/**
 * Resolves the shared connection status into badge copy, or `null` when there is
 * nothing to say (connected, or still loading).
 *
 * `"expired"` is not surfaced eagerly by the status query today, but it is part of
 * `GcalConnectionStatus`, so it gets its own copy rather than being collapsed into
 * the "never connected" wording.
 */
export function useGcalBadge(): GcalBadge | null {
  const { data: status } = useGcalConnectionStatus();

  if (status === undefined || status === "connected") return null;

  if (status === "expired") {
    return {
      label: "Google Calendar connection expired",
      tooltip: "Google Calendar access expired. Reconnect it from Settings.",
      short: "Calendar expired",
    };
  }

  return {
    label: "Google Calendar disconnected",
    tooltip: "Google Calendar is not connected. Connect it from Settings.",
    short: "Calendar offline",
  };
}

/**
 * The 6px functional dot. Coral, never accent: this is a state report, not a
 * call to action, and the accent budget is spent elsewhere.
 *
 * Collapsed rails pin it to the icon's top-right corner with a ring in the
 * sidebar fill so it reads against the glyph; expanded rails let it sit at the
 * end of the row.
 */
export function GcalStatusDot({
  badge,
  collapsed,
}: {
  badge: GcalBadge;
  collapsed: boolean;
}) {
  return (
    <span
      data-slot="gcal-status-dot"
      role="img"
      aria-label={badge.label}
      className={cn(
        "h-1.5 w-1.5 shrink-0 rounded-full",
        collapsed ? "absolute -right-0.5 -top-0.5 ring-2 ring-[var(--sd-sidebar)]" : "relative z-10"
      )}
      style={{ backgroundColor: "var(--ink-coral)" }}
    />
  );
}
