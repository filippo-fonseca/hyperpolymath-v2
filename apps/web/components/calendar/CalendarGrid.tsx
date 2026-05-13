"use client";

/**
 * `CalendarGrid` — the react-big-calendar grid wrapped with drag-and-drop.
 *
 * Phase 4 Plan 04-03 (D-01, D-03, CAL-03).
 *
 * Why react-big-calendar:
 *   - D-01 mandates "Google Calendar-familiar" affordances: hour gridlines,
 *     all-day row, multi-day spans, drag-create, drag-resize, click-to-create.
 *     RBC + the `withDragAndDrop` HOC ships every one of these for free
 *     (MIT). DIY-from-CSS-grid would consume a week of phase budget.
 *   - One cosmetic React 19 JSX warning (Pitfall 8) is acceptable; the
 *     underlying behavior is correct.
 *
 * Localizer (RESEARCH Open Q 1 — Monday-start):
 *   - The localizer hard-codes Monday week-start via the rebound
 *     `startOfWeek` callback. Defers a `users.week_starts_on` column to
 *     Phase 6 polish — academic / European default, and the user is a
 *     college student.
 *
 * eventPropGetter (D-03 + Pitfall 8):
 *   - Returns an inline `style.backgroundColor` so per-calendar gcal color
 *     beats the default rbc blue *without* having to override the
 *     `.rbc-event` class. globals.css MUST NOT set
 *     `.rbc-event { background-color: ... }` — that would beat the inline
 *     style.
 *
 * Timezone (Pitfall 3 / Pattern 5):
 *   - RBC renders Date objects in the browser's local tz by default. To
 *     force the user's IANA tz we pass `TZDate`-wrapped start/end from
 *     CalendarClient. RBC reads `.getHours()` etc. off the wrapped Date,
 *     which respects the bound zone — DST-correct without further effort.
 */

import {
  Calendar,
  dateFnsLocalizer,
  Views,
  type View,
} from "react-big-calendar";
import withDragAndDrop, {
  type withDragAndDropProps,
} from "react-big-calendar/lib/addons/dragAndDrop";
import "react-big-calendar/lib/css/react-big-calendar.css";
import "react-big-calendar/lib/addons/dragAndDrop/styles.css";
import { format, parse, startOfWeek, getDay, type Locale } from "date-fns";
import { enUS } from "date-fns/locale";

import { EventCard } from "./EventCard";

const locales = { "en-US": enUS };

// Hard-code Monday-start (weekStartsOn: 1) via the localizer. RBC calls this
// for every week navigation; passing the bound option here means the entire
// grid agrees on "where the week starts" without per-render plumbing.
const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: (date: Date, opts?: { locale?: Locale }) =>
    startOfWeek(date, { weekStartsOn: 1, ...opts }),
  getDay,
  locales,
});

// `withDragAndDrop` is generic over the event type — typing the wrapper at
// the call site avoids leaking `any` into props for drop/resize callbacks.
const DnDCalendar = withDragAndDrop<GcalEvent, object>(Calendar);

export interface GcalEvent {
  id: string;
  calendarId: string;
  title: string;
  start: Date;
  end: Date;
  allDay: boolean;
  colorHex: string;
  description: string | null;
  recurringEventId: string | null;
  htmlLink: string;
}

interface Props {
  events: GcalEvent[];
  view: View;
  date: Date;
  userTimezone: string;
  onNavigate: (date: Date) => void;
  onSelectSlot: (range: { start: Date; end: Date; allDay: boolean }) => void;
  onSelectEvent: (event: GcalEvent) => void;
  onEventDrop: NonNullable<withDragAndDropProps<GcalEvent>["onEventDrop"]>;
  onEventResize: NonNullable<withDragAndDropProps<GcalEvent>["onEventResize"]>;
}

export function CalendarGrid({
  events,
  view,
  date,
  onNavigate,
  onSelectSlot,
  onSelectEvent,
  onEventDrop,
  onEventResize,
}: Props) {
  return (
    <DnDCalendar
      localizer={localizer}
      events={events}
      defaultView={Views.WEEK}
      view={view}
      onView={() => {
        /* parent owns view state — drives via props */
      }}
      views={[Views.WEEK, Views.DAY]}
      date={date}
      onNavigate={onNavigate}
      selectable // enables drag-create on empty slots
      resizable // enables drag-resize on event edges
      onSelectSlot={(slot) =>
        onSelectSlot({
          start: slot.start as Date,
          end: slot.end as Date,
          // RBC's slotInfo doesn't expose allDay reliably across views;
          // a slot whose duration is exactly 24h on a Day view boundary
          // is "all-day-ish", but we leave the discriminator to downstream.
          allDay: false,
        })
      }
      onSelectEvent={(event) => onSelectEvent(event as GcalEvent)}
      onEventDrop={onEventDrop}
      onEventResize={onEventResize}
      eventPropGetter={(event) => ({
        // Inline style beats `.rbc-event` default blue (Pitfall 8).
        style: {
          backgroundColor: (event as GcalEvent).colorHex,
          borderColor: (event as GcalEvent).colorHex,
          color: "white",
        },
      })}
      step={30}
      timeslots={2}
      components={{ event: EventCard as never }}
    />
  );
}
