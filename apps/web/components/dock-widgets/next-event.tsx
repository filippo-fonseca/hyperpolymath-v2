"use client";

import { listCalendarsForUser } from "@/app/actions/gcal-calendars";
import { listEventsForUser } from "@/app/actions/gcal-events";
import { defineDockWidget } from "@/components/shell/cockpit/dock-registry";
import type { GcalEventDTO } from "@/lib/gcal/event-dto";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock } from "lucide-react";
import Link from "next/link";

/**
 * Next event — the next thing on the calendar, at a glance.
 *
 * Google Calendar is the source of truth for scheduling and events are never
 * persisted in Postgres, so this goes through the same server actions the
 * calendar page uses rather than inventing a second path. The paired-device
 * route (`/api/device/calendar`) is bearer-authenticated for the desktop app
 * and is not reachable from a cookie session, which is why it is not used here.
 *
 * The window is the next 24 hours and it refetches every five minutes: a dock
 * widget that says "in 3 hours" forever is worse than no widget.
 */

type NextEventData = {
  event: GcalEventDTO | null;
  state: "loading" | "ready" | "not-connected" | "error";
};

const LOOKAHEAD_MS = 24 * 60 * 60 * 1000;
const REFETCH_MS = 5 * 60 * 1000;

async function fetchNextEvent(): Promise<{ event: GcalEventDTO | null } | { notConnected: true }> {
  const calendars = await listCalendarsForUser();
  if (!calendars.success) {
    if (calendars.kind === "not_connected" || calendars.kind === "revoked") {
      return { notConnected: true };
    }
    throw new Error(calendars.error);
  }

  const ids = calendars.data.map((calendar) => calendar.id);
  if (ids.length === 0) return { event: null };

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
  const upcoming = events.data
    .filter((event) => !event.allDay)
    .sort((a, b) => a.start.localeCompare(b.start));

  return { event: upcoming[0] ?? events.data[0] ?? null };
}

function useNextEvent(): NextEventData {
  const { data, isPending, isError } = useQuery({
    queryKey: ["dock", "next-event"],
    queryFn: fetchNextEvent,
    refetchInterval: REFETCH_MS,
    staleTime: REFETCH_MS,
  });

  if (isPending) return { event: null, state: "loading" };
  if (isError) return { event: null, state: "error" };
  if ("notConnected" in data) return { event: null, state: "not-connected" };
  return { event: data.event, state: "ready" };
}

function whenLabel(event: GcalEventDTO): string {
  if (event.allDay) return "All day";
  const start = new Date(event.start);
  const minutes = Math.round((start.getTime() - Date.now()) / 60000);
  if (minutes <= 0) return "Now";
  if (minutes < 60) return `In ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `In ${hours} h`;
  return start.toLocaleDateString(undefined, { weekday: "short" });
}

function Compact({ data }: { data: NextEventData }) {
  if (data.state === "loading") {
    return <p className="px-2 text-meta text-[var(--ink-faint)]">Checking…</p>;
  }
  if (data.state === "not-connected") {
    return (
      <div className="flex items-center justify-between gap-2 px-1.5">
        <p className="text-meta text-[var(--ink-faint)]">Not connected.</p>
        <Link
          href="/calendar"
          className="rounded-full bg-[var(--tint-bg,var(--hover))] px-2 py-0.5 text-micro font-medium text-[var(--tint-ink,var(--ink-muted))] transition-[box-shadow] duration-[160ms] ease-out hover:shadow-[var(--shadow-card)]"
        >
          Connect
        </Link>
      </div>
    );
  }
  if (data.state === "error") {
    return <p className="px-2 text-meta text-[var(--ink-faint)]">Could not reach the calendar.</p>;
  }
  if (!data.event) {
    return <p className="px-2 text-meta text-[var(--ink-faint)]">Nothing in the next 24 hours.</p>;
  }

  return (
    // The event renders as a miniature of the calendar page's pastel plate:
    // tinted fill, saturated left edge, in-family ink.
    <Link
      href="/calendar"
      className="mx-0.5 flex flex-col gap-0.5 rounded-lg border border-[color-mix(in_srgb,var(--tint-edge)_40%,transparent)] border-l-[3px] border-l-[var(--tint-edge)] bg-[var(--tint-bg)] px-2.5 py-2 transition-[box-shadow] duration-[160ms] ease-out hover:shadow-[var(--shadow-card)]"
    >
      <span className="truncate text-meta font-medium text-[var(--tint-ink)]">
        {data.event.title || "Untitled event"}
      </span>
      <span className="text-micro tabular-nums text-[color-mix(in_srgb,var(--tint-ink)_75%,transparent)]">
        {whenLabel(data.event)}
      </span>
    </Link>
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
