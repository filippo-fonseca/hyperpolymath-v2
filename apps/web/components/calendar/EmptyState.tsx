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

import { Button } from "@/components/ui/button";
import { CalendarIcon } from "./CalendarIcon";

export function EmptyState() {
  return (
    <div className="flex h-full items-center justify-center p-8 bg-[var(--sd-app)]">
      {/* Calm sd empty grammar (seed): a faint dimensional glyph, an 11px mono
          eyebrow, a quiet body line, then the Connect CTA. No plate, no glass,
          no glow — the affordance sits directly on the canvas. */}
      <div className="flex flex-col items-center gap-5 max-w-md px-10 py-12 text-center">
        <CalendarIcon size={56} className="opacity-70" aria-hidden />
        <div className="space-y-1.5">
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--sd-ink-faint)]">
            Google Calendar
          </p>
          <h2 className="text-lg font-semibold tracking-tight text-[var(--sd-ink)]">
            Connect your calendar
          </h2>
          <p className="text-[13px] text-[var(--sd-ink-dull)] mt-1">
            See your week here. Drag to create. All events live in Google
            Calendar; Hyperpolymath is the writing desk over it.
          </p>
        </div>
        <Button asChild>
          <a href="/api/gcal/auth">Connect Google Calendar</a>
        </Button>
      </div>
    </div>
  );
}
