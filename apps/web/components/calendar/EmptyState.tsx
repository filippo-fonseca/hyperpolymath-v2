/**
 * `EmptyState` — shown on /calendar when the user has never connected gcal
 * (status === "not_connected").
 *
 * Phase 4 Plan 04-03 (D-04 — discoverable Connect CTA).
 *
 * jul-29 craft restyle: this is now a thin wrapper over the one shared
 * EmptyState (`components/ui/EmptyState`). The calendar's feature hue is
 * sky, passed as a `tint-*` class so the icon lands on a soft circular
 * pastel plate. The copy is unchanged.
 *
 * Copy notes (per CONTEXT.md "Deferred"):
 *   - "Hyperpolymath is the writing desk over Google Calendar" reinforces
 *     the project axiom: gcal is the source of truth; this app is a CRUD
 *     operator over it.
 *
 * No client state — pure render. The Connect CTA targets `/api/gcal/auth`
 * which is a Route Handler that 302s to Google's consent screen (same shape
 * as DisconnectBanner.Reconnect).
 */

import { CalendarDays } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState as UiEmptyState } from "@/components/ui/EmptyState";

export function EmptyState() {
  return (
    <div className="flex h-full items-center justify-center p-8">
      <UiEmptyState
        size="page"
        className="tint-sky"
        icon={<CalendarDays strokeWidth={1.5} aria-hidden />}
        title="Connect your calendar"
        description="See your week here. Drag to create. All events live in Google Calendar; Hyperpolymath is the writing desk over it."
        actionSlot={
          <Button asChild>
            <a href="/api/gcal/auth">Connect Google Calendar</a>
          </Button>
        }
      />
    </div>
  );
}
