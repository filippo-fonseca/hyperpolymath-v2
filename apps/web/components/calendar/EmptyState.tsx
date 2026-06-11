/**
 * `EmptyState` — shown on /calendar when the user has never connected gcal
 * (status === "not_connected").
 *
 * Phase 4 Plan 04-03 (D-04 — discoverable Connect CTA).
 *
 * Copy notes (per CONTEXT.md "Deferred"):
 *   - "Hyperpolymath is the writing desk over Google Calendar"reinforces
 *     the project axiom: gcal is the source of truth; this app is a CRUD
 *     operator over it.
 *
 * No client state — pure render. The Connect CTA targets `/api/gcal/auth`
 * which is a Route Handler that 302s to Google's consent screen (same shape
 * as DisconnectBanner.Reconnect).
 */

import { Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";

export function EmptyState() {
  return (
    <div className="flex h-full items-center justify-center p-8 bg-[var(--canvas)]">
      <div
        className={
          // Glassy pill matching /settings PROFILE pill: translucent surface +
          // backdrop-blur + inset cyan glow + soft outer halo + thin
          // cyan-tinged border on hover.
          "flex flex-col items-center gap-5 max-w-md px-10 py-12 text-center " +
          "rounded-xl " +
          "glass-tile " +
          ""
        }
      >
        <Calendar size={48} className="text-muted-foreground" />
        <div>
          <h2 className="font-serif text-lg font-medium">
            Connect Google Calendar
          </h2>
          <p className="font-serif text-sm text-muted-foreground mt-1">
            See your week here. Drag to create. All events live in Google
            Calendar. Hyperpolymath is the writing desk over it.
          </p>
        </div>
        <Button asChild>
          <a href="/api/gcal/auth">Connect Google Calendar</a>
        </Button>
      </div>
    </div>
  );
}
