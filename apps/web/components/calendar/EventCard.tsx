/**
 * Compact event renderer for react-big-calendar slots.
 *
 * Phase 4 Plan 04-03 — initial wiring (recurring glyph + truncate).
 * Phase 6.1 Plan 06.1-05 (UI-SPEC §5g):
 *
 * Diplomatic-tier event tile chrome. Per UI-SPEC §5g calendar events render
 * with a serif title (EB Garamond) + mono time label (JetBrains Mono). The
 * tile background-color flows in from CalendarGrid.eventPropGetter — when
 * gcal provides no calendar color, we fall back to --ink-coral per the
 * UI-SPEC §3f reserved-for list ("calendar event color fallback when gcal
 * doesn't supply one").
 *
 * Hover gets a 150ms brightness-110 lift (UI-SPEC §6g hover micro-motion).
 * No always-on motion. Neumorphic tokens retired per UI-SPEC §14a.
 */

import { format } from "date-fns";
import type { GcalEvent } from "./CalendarGrid";

function formatTime(d: Date): string {
  // 24h format with mono numerals — matches the UI-SPEC §5g calendar time
  // gutter register (07:00, 08:00, …).
  return format(d, "HH:mm");
}

export function EventCard({ event }: { event: GcalEvent }) {
  // UI-SPEC §5g — coral fallback for missing gcal color. The grid's
  // eventPropGetter already paints backgroundColor inline; this fallback
  // sentinel is documented in the SUMMARY so the executor's audit can see
  // the coral path without tracing through CalendarGrid.
  const fallbackBorder = "var(--ink-coral)";
  return (
    <div
      className="cursor-pointer-always transition-[filter] duration-150 ease-out hover:brightness-110 px-1 py-0.5"
      style={{
        borderLeft: event.colorHex
          ? `2px solid ${event.colorHex}`
          : `2px solid ${fallbackBorder}`,
      }}
    >
      {/* Serif event title per UI-SPEC §5g — "serif for event titles inside event tiles" */}
      <div className="font-serif text-sm leading-tight truncate text-[var(--ink)]">
        {event.title}
        {event.recurringEventId && (
          <span className="ml-1 opacity-60" title="Recurring event">
            ↻
          </span>
        )}
      </div>
      {/* Mono inline time label per UI-SPEC §5g — "mono for time column".
          rbc renders the per-event tile, so this in-tile time complements
          the column gutter without duplicating it. Hidden for all-day. */}
      {!event.allDay && (
        <div className="font-mono text-[10px] leading-tight tracking-[0.04em] text-[var(--ink-muted)] truncate">
          {formatTime(event.start)}–{formatTime(event.end)}
        </div>
      )}
    </div>
  );
}
