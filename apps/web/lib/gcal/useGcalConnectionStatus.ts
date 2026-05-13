"use client";

/**
 * `useGcalConnectionStatus()` — TanStack Query hook reading the user's
 * Google Calendar connection state for the Settings nav badge (D-04 / M-04).
 *
 * Phase 4 Plan 04-03.
 *
 * Why a hook (not server-side in PersistentNav):
 *   - PersistentNav is a client component (it owns the active-route highlight
 *     via usePathname). Doing a per-render Server-Component fetch in the
 *     parent layout would re-render every page with a status flash; a hook
 *     gives us cache control + the same dedupe pattern as the rest of Phase 3.
 *
 * Cadence:
 *   - `staleTime: 60_000` — badge can lag by up to 60s in the worst case;
 *     `refetchOnWindowFocus: true` covers the common "switch back to the
 *     tab" path. For an immediate update after disconnectGcal, callers can
 *     `queryClient.invalidateQueries({ queryKey: ["gcal-connection-status"] })`.
 *
 * Failure mode:
 *   - On 4xx/5xx (rare — auth redirect, server crash), return "not_connected".
 *     The badge then disappears — false-negative ("looks connected when
 *     actually disconnected") would be misleading; false-positive ("looks
 *     disconnected when actually connected") just dismisses a non-existent
 *     warning. Bias toward false-positive.
 */

import { useQuery } from "@tanstack/react-query";
import type { GcalConnectionStatus } from "@/lib/db/queries/gcal-connection";

export function useGcalConnectionStatus() {
  return useQuery<GcalConnectionStatus>({
    queryKey: ["gcal-connection-status"],
    queryFn: async () => {
      const res = await fetch("/api/gcal/status", { cache: "no-store" });
      if (!res.ok) return "not_connected";
      const data = (await res.json()) as { status: GcalConnectionStatus };
      return data.status;
    },
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });
}
