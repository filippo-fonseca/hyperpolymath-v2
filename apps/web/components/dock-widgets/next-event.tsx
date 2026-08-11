"use client";

import { listCalendarsForUser } from "@/app/actions/gcal-calendars";
import { listEventsForUser } from "@/app/actions/gcal-events";
import { DockStateNote } from "@/components/dock-widgets/dock-state";
import { defineDockWidget } from "@/components/shell/cockpit/dock-registry";
import { formatEventCountdown } from "@/lib/gcal/event-countdown";
import type { GcalEventDTO } from "@/lib/gcal/event-dto";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

/**
 * Next event — the next three things on the calendar, at a glance.
 *
 * Google Calendar is the source of truth for scheduling and events are never
 * persisted in Postgres, so this goes through the same server actions the
 * calendar page uses rather than inventing a second path. The paired-device
 * route (`/api/device/calendar`) is bearer-authenticated for the desktop app
 * and is not reachable from a cookie session, which is why it is not used here.
 *
 * The window is the next 24 hours. Event *data* refetches every five minutes;
 * the countdown label ticks on its own so "in 12 min" stays honest between
 * refetches (a dock that says "in 1 h" while the meeting is twelve minutes
 * away is worse than no widget).
 */

type NextEventData = {
  events: GcalEventDTO[];
  state: "loading" | "ready" | "not-connected" | "error";
};

const LOOKAHEAD_MS = 24 * 60 * 60 * 1000;
const REFETCH_MS = 5 * 60 * 1000;
/** Tick the countdown often enough that minute-level labels feel live. */
const COUNTDOWN_TICK_MS = 15_000;

/** How many upcoming events the compact card stacks. */
const EVENT_COUNT = 3;

async function fetchNextEvents(): Promise<{ events: GcalEventDTO[] } | { notConnected: true }> {
  const calendars = await listCalendarsForUser();
  if (!calendars.success) {
    if (calendars.kind === "not_connected" || calendars.kind === "revoked") {
      return { notConnected: true };
    }
    throw new Error(calendars.error);
  }

  const ids = calendars.data.map((calendar) => calendar.id);
  if (ids.length === 0) return { events: [] };

  const now = new Date();
  const events = await listEventsForUser({
    calendarIds: ids,
    timeMin: now.toISOString(),
    timeMax: new Date(now.getTime() + LOOKAHEAD_MS).toISOString(),
  });
  if (!events.success) {
    if (events.kind === "not_connected" || events.kind === "revoked") {
      return { notConnected: true };
    }
    throw new Error(events.error);
  }

  // All-day events sort as YYYY-MM-DD, which compares correctly against an ISO
  // timestamp for the same day only by accident, so they go last rather than
  // claiming to be "next".
  const timed = events.data
    .filter((event) => !event.allDay)
    .sort((a, b) => a.start.localeCompare(b.start));
  const allDay = events.data.filter((event) => event.allDay);

  return { events: [...timed, ...allDay].slice(0, EVENT_COUNT) };
}

function useNextEvent(): NextEventData {
  const { data, isPending, isError } = useQuery({
    queryKey: ["dock", "next-event"],
    queryFn: fetchNextEvents,
    refetchInterval: REFETCH_MS,
    staleTime: REFETCH_MS,
  });

  if (isPending) return { events: [], state: "loading" };
  if (isError) return { events: [], state: "error" };
  if ("notConnected" in data) return { events: [], state: "not-connected" };
  return { events: data.events, state: "ready" };
}

/** Wall-clock tick so countdown labels re-render without waiting on gcal refetch. */
function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

function Compact({ data }: { data: NextEventData }) {
  const now = useNow(COUNTDOWN_TICK_MS);

  if (data.state === "loading") {
    return <DockStateNote>Checking…</DockStateNote>;
  }
  if (data.state === "not-connected") {
    return (
      <DockStateNote
        action={
          <Link
            href="/calendar"
            className="shrink-0 rounded-full bg-[var(--tint-bg,var(--hover))] px-2 py-0.5 text-micro font-medium text-[var(--tint-ink,var(--ink-muted))] transition-[box-shadow] duration-[160ms] ease-out hover:shadow-[var(--shadow-card)]"
          >
            Connect
          </Link>
        }
      >
        Not connected.
      </DockStateNote>
    );
  }
  if (data.state === "error") {
    return <DockStateNote>Could not reach the calendar.</DockStateNote>;
  }
  if (data.events.length === 0) {
    return <DockStateNote>Nothing in the next 24 hours.</DockStateNote>;
  }

  return (
    <div className="flex flex-col gap-1">
      {data.events.map((event, index) => {
        const when = formatEventCountdown(event.start, event.allDay, now);
        const absolute = event.allDay
          ? "All day"
          : new Date(event.start).toLocaleString(undefined, {
              weekday: "short",
              hour: "numeric",
              minute: "2-digit",
            });

        // aug-05 quiet pass: the saturated left edge stays as the card's one
        // colored element, but the pastel fill drops to barely-there and the
        // ink goes neutral — a hairline card, not a tinted plate. Only the
        // first card keeps the tinted edge and fill; the rows behind it read
        // quieter so the next event stays the visual anchor.
        const edge =
          index === 0
            ? "border-[var(--edge)] border-l-[3px] border-l-[var(--tint-edge)] bg-[color-mix(in_srgb,var(--tint-bg)_35%,transparent)]"
            : "border-[var(--edge)]";

        return (
          <Link
            key={event.id}
            href="/calendar"
            className={`mx-0.5 flex flex-col gap-0.5 rounded-lg border ${edge} px-2.5 py-1.5 transition-[box-shadow] duration-[160ms] ease-out hover:shadow-[var(--shadow-card)]`}
          >
            <span className="truncate text-meta font-normal text-[var(--ink)]">
              {event.title || "Untitled event"}
            </span>
            <span className="text-micro tabular-nums text-[var(--ink-faint)]" title={absolute}>
              {when}
            </span>
          </Link>
        );
      })}
    </div>
  );
}

export const nextEventWidget = defineDockWidget<NextEventData>({
  id: "next-event",
  title: "Next event",
  defaultDocked: true,
  order: 20,
  useData: useNextEvent,
  Compact,
  icon: CalendarClock,
  tint: "tint-butter",
});
