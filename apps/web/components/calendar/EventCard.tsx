/**
 * Compact event renderer for react-big-calendar slots.
 *
 * Phase 4 Plan 04-03.
 *
 * Default rbc event renderer shows the full title in a stylable wrapper; we
 * override to add the recurring-event glyph (Pitfall 4 — instance editing
 * is locked to "this instance only" for MVP, so users benefit from a small
 * inline marker they can spot before clicking).
 *
 * No background-color here — that flows from the parent grid's
 * `eventPropGetter` so per-event style stays in one place.
 */

import type { GcalEvent } from "./CalendarGrid";

export function EventCard({ event }: { event: GcalEvent }) {
  return (
    <div className="text-[11px] leading-tight px-1 py-0.5 truncate">
      {event.title}
      {event.recurringEventId && (
        <span className="ml-1 opacity-60" title="Recurring event">
          ↻
        </span>
      )}
    </div>
  );
}
