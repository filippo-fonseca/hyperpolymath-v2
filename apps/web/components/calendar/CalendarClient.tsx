"use client";

/**
 * `CalendarClient` — owns view+date+panel state and the TanStack Query
 * wrapping the gcal events read.
 *
 * Phase 4 Plan 04-03 (CAL-03, CAL-07, CAL-08, D-08, D-11).
 *
 * Why a client island wrapping a Server-Component-fetched initial:
 *   - SSR fetches the current week's events (no flash of empty grid).
 *   - useQuery({ initialData: serverFetched }) bridges into the same cache
 *     the rest of the app uses (Phase 3 hybrid pattern). On focus / range
 *     change, the query refetches fresh from gcal.
 *   - `refetchOnWindowFocus: true` (D-11) overrides the Phase-3 default
 *     ("Realtime drives invalidation") for this query ONLY — events live
 *     outside Postgres so Realtime doesn't apply.
 *
 * Two timezone effects (D-08 + M-01 fix):
 *   1. First-visit: when `users.timezone IS NULL`, read
 *      `Intl.DateTimeFormat().resolvedOptions().timeZone` and POST via
 *      `setTimezone(detected)`. Then refresh the route so the Server
 *      Component picks up the new tz for the next render.
 *   2. Drift-detect: when both saved and detected zones are non-null AND
 *      differ, surface a dismissible toast with an "Update" action.
 *      sessionStorage flag prevents re-firing on every visit within the
 *      same session if the user dismissed it. Detection happens client-
 *      side every mount — covers Pitfall 5 (traveler, NYC → London).
 *
 * Color mapping (D-03 + Pitfall 9):
 *   - calendarId → calendar.backgroundColor in a memo. Per-event colorId
 *     overrides (gcal's per-event color picker) are out of scope for
 *     Plan 04-03; we use calendar-level colors only.
 *
 * Filter (D-10 in CalendarFilters chips — ships in Plan 04-04):
 *   - Reads `?cals=id1,id2` from URL via nuqs; defaults to all calendars.
 *     Server Component honors `users.gcal_visible_calendar_ids` separately
 *     for the initial fetch; this URL param drives client-side reads.
 *
 * Drag-create + drag-resize:
 *   - Wired to toast notices in this plan. Plan 04-04 swaps the toasts for
 *     optimistic mutations.
 */

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useQueryState } from "nuqs";
import { useRouter, useSearchParams } from "next/navigation";
import { TZDate } from "@date-fns/tz";
import { toast } from "sonner";
import {
  startOfWeek,
  endOfWeek,
  startOfDay,
  endOfDay,
} from "date-fns";

import { listEventsForUser } from "@/app/actions/gcal-events";
import { setTimezone } from "@/app/actions/gcal-calendars";
import { detectBrowserTimezone } from "@/lib/gcal/datetime";
import type { GcalEventDTO } from "@/lib/gcal/event-dto";
import type { GcalCalendarMeta } from "@/lib/gcal/calendars";

import { CalendarGrid, type GcalEvent } from "./CalendarGrid";
import { DayWeekToggle } from "./DayWeekToggle";
import { EventDetailPanel, type PanelState } from "./EventDetailPanel";

interface Props {
  initialEvents: GcalEventDTO[];
  userId: string;
  userTimezone: string | null;
  calendars: GcalCalendarMeta[];
}

export function CalendarClient({
  initialEvents,
  userId,
  userTimezone,
  calendars,
}: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const [view, setView] = useState<"day" | "week">("week");
  const [date, setDate] = useState(new Date());
  const [calsParam] = useQueryState("cals");
  const [panelState, setPanelState] = useState<PanelState>({ mode: "closed" });

  // Surface `?gcal=connected` from the OAuth callback as a one-shot toast.
  // Server Component sets the param via redirect after successful exchange
  // (Plan 04-02). Strip it from the URL so a hard refresh doesn't re-fire.
  useEffect(() => {
    if (params.get("gcal") === "connected") {
      toast.success("Google Calendar connected.");
      router.replace("/calendar");
    }
  }, [params, router]);

  // D-08 first-visit: detect once, persist, refresh.
  useEffect(() => {
    if (userTimezone) return;
    const detected = detectBrowserTimezone();
    if (!detected) return;
    void (async () => {
      const res = await setTimezone({ timezone: detected });
      if (res.success) router.refresh();
    })();
  }, [userTimezone, router]);

  // M-01 fix / Pitfall 5 — drift detection. Both zones non-null AND differ.
  // Don't auto-update (VPN / airport-wifi false positives); ask the user.
  // sessionStorage flag prevents pestering on every mount.
  useEffect(() => {
    if (!userTimezone) return;
    const detected = detectBrowserTimezone();
    // Re-check the detected value inside the effect so it can't drift between
    // render and effect; also avoids referencing `Intl.DateTimeFormat` on the
    // render path (SSR safety).
    if (!detected || detected === userTimezone) return;
    const dismissKey = `gcal:tz-drift-dismissed:${userTimezone}:${detected}`;
    if (sessionStorage.getItem(dismissKey)) return;
    toast(`Timezone changed? Saved: ${userTimezone}, detected: ${detected}.`, {
      duration: 12_000,
      action: {
        label: `Use ${detected}`,
        onClick: () => {
          void (async () => {
            const res = await setTimezone({ timezone: detected });
            if (res.success) {
              toast.success(`Timezone updated to ${detected}`);
              router.refresh();
            }
          })();
        },
      },
      onDismiss: () => sessionStorage.setItem(dismissKey, "1"),
      onAutoClose: () => sessionStorage.setItem(dismissKey, "1"),
    });
  }, [userTimezone, router]);

  // Color map: calendarId → backgroundColor (D-03).
  const colorByCalendar = useMemo(
    () =>
      Object.fromEntries(calendars.map((c) => [c.id, c.backgroundColor])) as Record<
        string,
        string
      >,
    [calendars],
  );

  const effectiveTz = userTimezone ?? "UTC";
  const visibleCalIds = useMemo(
    () =>
      calsParam
        ? calsParam.split(",").filter(Boolean)
        : calendars.map((c) => c.id),
    [calsParam, calendars],
  );

  // Compute the gcal fetch window from view+date. Monday-start for week
  // (RESEARCH Open Q 1 — matches localizer + SSR fetch).
  const dateRange = useMemo(() => {
    if (view === "day") {
      return {
        timeMin: startOfDay(date).toISOString(),
        timeMax: endOfDay(date).toISOString(),
      };
    }
    return {
      timeMin: startOfWeek(date, { weekStartsOn: 1 }).toISOString(),
      timeMax: endOfWeek(date, { weekStartsOn: 1 }).toISOString(),
    };
  }, [view, date]);

  const { data: rawEvents = initialEvents } = useQuery({
    queryKey: [
      "calendar-events",
      userId,
      visibleCalIds.join(","),
      dateRange.timeMin,
      dateRange.timeMax,
    ],
    queryFn: async () => {
      // Guard: empty visible-cals (e.g. user unchecked every box in Settings)
      // — return empty without round-tripping.
      if (visibleCalIds.length === 0) return [];
      const res = await listEventsForUser({
        calendarIds: visibleCalIds,
        timeMin: dateRange.timeMin,
        timeMax: dateRange.timeMax,
      });
      if (!res.success) {
        if (res.kind === "revoked") {
          toast.error("Google Calendar disconnected. Reconnect in Settings.");
        }
        // Fall back to the SSR-hydrated initial data so the grid doesn't go
        // empty on a transient error.
        return initialEvents;
      }
      return res.data;
    },
    initialData: initialEvents,
    refetchOnWindowFocus: true, // D-11
    staleTime: 30_000,
  });

  // Map DTO → CalendarGrid event shape with TZDate-bound start/end so the
  // grid renders at the user's wall-clock (DST-correct via @date-fns/tz).
  const events: GcalEvent[] = useMemo(
    () =>
      rawEvents.map((e) => ({
        id: e.id,
        calendarId: e.calendarId,
        title: e.title,
        start: new TZDate(new Date(e.start), effectiveTz),
        end: new TZDate(new Date(e.end), effectiveTz),
        allDay: e.allDay,
        colorHex: colorByCalendar[e.calendarId] ?? "#4285F4",
        description: e.description,
        recurringEventId: e.recurringEventId,
        htmlLink: e.htmlLink,
      })),
    [rawEvents, effectiveTz, colorByCalendar],
  );

  const defaultCalendarId =
    calendars.find((c) => c.primary)?.id ?? calendars[0]?.id ?? null;

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border">
        <DayWeekToggle
          view={view}
          onChange={setView}
          date={date}
          onDateChange={setDate}
        />
        {/* CalendarFilters chips ship in Plan 04-04 */}
      </div>
      <div className="flex-1 min-h-0">
        <CalendarGrid
          events={events}
          view={view}
          date={date}
          onNavigate={setDate}
          userTimezone={effectiveTz}
          onSelectSlot={(range) =>
            setPanelState({
              mode: "create",
              start: range.start,
              end: range.end,
              allDay: range.allDay,
            })
          }
          onSelectEvent={(event) =>
            setPanelState({ mode: "edit", event })
          }
          onEventDrop={() => {
            toast.info("Drag to reschedule lands in the next plan.");
          }}
          onEventResize={() => {
            toast.info("Drag-resize lands in the next plan.");
          }}
        />
      </div>
      <EventDetailPanel
        state={panelState}
        onClose={() => setPanelState({ mode: "closed" })}
        calendars={calendars}
        userTimezone={effectiveTz}
        defaultCalendarId={defaultCalendarId}
      />
    </div>
  );
}
