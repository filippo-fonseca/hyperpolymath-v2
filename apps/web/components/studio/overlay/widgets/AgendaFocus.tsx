"use client";

import Link from "next/link";
import { useMemo } from "react";
import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";
import { useStudioAgenda } from "@/components/studio/data/hooks";
import type { CalendarData } from "@/components/studio/data/useStudioData";
import type { GcalEventDTO } from "@/lib/gcal/event-dto";

/**
 * AgendaFocus — a read-only agenda view REBUILT for the overlay (Wave-2
 * deviation 2). `CalendarClient` owns URL/router state and its own query layer;
 * extracting it would cost far more than this thin projection over the studio
 * calendar slice. Event CRUD (`useStudioAgenda().actions`) is a fast-follow.
 *
 * Renders: connection-status cards for `not_connected`/`expired`, else the
 * loaded window's events grouped by local day, each with time + a
 * source-calendar color dot, and a link out to the full /calendar.
 */

const OPEN_LINK = (
  <Link
    href="/calendar"
    className="cursor-pointer-always font-mono text-[10px] uppercase tracking-[0.12em] text-[#8FA8C7] transition-colors duration-100 hover:text-[#F2E9D8]"
  >
    open /calendar →
  </Link>
);

interface DayGroup {
  key: string;
  label: string;
  events: GcalEventDTO[];
}

/** Local `YYYY-MM-DD` for an event's start, honoring all-day vs timed. */
function dayKeyOf(event: GcalEventDTO, tz: string): string {
  if (event.allDay) return event.start.slice(0, 10);
  const d = new TZDate(new Date(event.start), tz);
  return format(d, "yyyy-MM-dd");
}

function groupByDay(calendar: CalendarData): DayGroup[] {
  const tz = calendar.timezone || "UTC";
  const buckets = new Map<string, GcalEventDTO[]>();
  for (const ev of calendar.events) {
    const key = dayKeyOf(ev, tz);
    const arr = buckets.get(key) ?? [];
    arr.push(ev);
    buckets.set(key, arr);
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, events]) => ({
      key,
      label: format(new TZDate(new Date(`${key}T00:00:00`), tz), "EEEE, MMMM d"),
      events: events.sort((a, b) => {
        if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
        return a.start.localeCompare(b.start);
      }),
    }));
}

function StatusCard({ message }: { message: string }): React.ReactElement {
  return (
    <div className="flex flex-col items-start gap-3 rounded-xl border border-[color:rgba(201,162,39,0.2)] bg-black/20 px-5 py-6">
      <p
        className="text-[15px] italic text-[#F2E9D8]/80"
        style={{ fontFamily: "var(--font-eb-garamond, Georgia, serif)" }}
      >
        {message}
      </p>
      {OPEN_LINK}
    </div>
  );
}

export function AgendaFocus(): React.ReactElement {
  const { calendar, todayYmd } = useStudioAgenda();

  const groups = useMemo(() => groupByDay(calendar), [calendar]);

  if (calendar.status === "not_connected") {
    return (
      <StatusCard message="Google Calendar isn’t connected. Connect it in Settings to see your agenda here." />
    );
  }
  if (calendar.status === "expired") {
    return (
      <StatusCard message="Your Google Calendar connection expired. Reconnect it in Settings to refresh your agenda." />
    );
  }

  if (groups.length === 0) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p
          className="text-[15px] italic text-[#F2E9D8]/70"
          style={{ fontFamily: "var(--font-eb-garamond, Georgia, serif)" }}
        >
          Nothing on the calendar in this window.
        </p>
        {OPEN_LINK}
      </div>
    );
  }

  const calColor = (id: string): string =>
    calendar.calendars.find((c) => c.id === id)?.backgroundColor ?? "#C9A227";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#8FA8C7]">
          Agenda
        </span>
        {OPEN_LINK}
      </div>
      {groups.map((group) => (
        <section key={group.key} className="flex flex-col gap-2">
          <h3
            className={`text-[13px] font-semibold uppercase tracking-[0.08em] ${
              group.key === todayYmd ? "text-[#E8C46B]" : "text-[#8FA8C7]"
            }`}
            style={{ fontFamily: "var(--font-jetbrains-mono, monospace)" }}
          >
            {group.key === todayYmd ? `Today · ${group.label}` : group.label}
          </h3>
          <ul className="flex flex-col">
            {group.events.map((ev) => (
              <li
                key={`${ev.calendarId}:${ev.id}`}
                className="flex items-center gap-3 border-b border-[color:rgba(201,162,39,0.1)] py-2.5 last:border-b-0"
              >
                <span
                  aria-hidden
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: calColor(ev.calendarId) }}
                />
                <span
                  className="w-[72px] shrink-0 font-mono text-[11px] tabular-nums text-[#8FA8C7]"
                >
                  {ev.allDay ? "all-day" : format(new Date(ev.start), "h:mm a")}
                </span>
                <span
                  className="min-w-0 flex-1 truncate text-[15px] text-[#F2E9D8]"
                  style={{ fontFamily: "var(--font-eb-garamond, Georgia, serif)" }}
                >
                  {ev.title}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

export default AgendaFocus;
