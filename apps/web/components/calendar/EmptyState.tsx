/**
 * `EmptyState` — shown on /calendar when the user has never connected gcal
 * (status === "not_connected").
 *
 * Phase 4 Plan 04-03 (D-04 — discoverable Connect CTA).
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

import { Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";

export function EmptyState() {
  return (
    <div className="flex h-full items-center justify-center p-8 bg-[var(--canvas)]">
      <div
        className={
          // Pillow-soft tile — paired drop + lifted highlight + inset specular
          // edge. Mirrors the /settings tile contract so the connect surface
          // reads as the same furniture family.
          "flex flex-col items-center gap-5 max-w-md px-10 py-12 text-center " +
          "rounded-xl bg-[var(--surface)] " +
          "border border-[color-mix(in_oklch,var(--edge)_70%,transparent)] " +
          "shadow-[6px_6px_18px_color-mix(in_oklch,var(--ink)_8%,transparent),-4px_-4px_14px_color-mix(in_oklch,var(--surface)_70%,white),inset_0_1px_0_color-mix(in_oklch,white_60%,transparent)] " +
          "hover:border-[var(--edge-hud)] " +
          "hover:shadow-[8px_8px_22px_color-mix(in_oklch,var(--ink)_12%,transparent),-5px_-5px_16px_color-mix(in_oklch,var(--surface)_70%,white),inset_0_1px_0_color-mix(in_oklch,white_60%,transparent)] " +
          "transition-[border-color,box-shadow] duration-200 ease-out"
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
