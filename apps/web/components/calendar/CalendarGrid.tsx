"use client";

/**
 * `CalendarGrid` — hand-rolled week/day grid that replaces react-big-calendar.
 *
 * Why hand-rolled: rbc's class cascade fought our tokens through several
 * passes of `.arc-cal` overrides. v1 (polymath-tracker/app/schedule/page.tsx)
 * proves a CSS-grid + absolute-positioned-chips approach lands the calm
 * journal-tier look without the override war. The prop interface stays
 * close to what CalendarClient already passes — only `onView` is dropped
 * (the parent owns the view toggle via DayWeekToggle).
 *
 * Drag-move and drag-resize are deferred — the prop callbacks remain on
 * the interface so a follow-up commit can wire native HTML5 drag on chips
 * without re-threading CalendarClient.
 *
 * Timezone handling (Pattern 5 / Pitfall 3): events arrive with TZDate-
 * wrapped `start`/`end` from CalendarClient, so `.getHours()` etc. respect
 * the bound zone. The day-column dates we generate locally for header
 * labels are plain JS Dates in browser-local time; this matches what rbc
 * was doing and is fine when browser tz === userTimezone (the drift
 * toast in CalendarClient nudges the user otherwise).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  addDays,
  addMinutes,
  format,
  isSameDay,
  startOfDay,
  startOfWeek,
} from "date-fns";

const HOUR_PX = 56;
const TOTAL_HEIGHT = 24 * HOUR_PX;
const TIME_GUTTER_W = 64;
const SLOT_MINUTES = 30;
const HOURS = Array.from({ length: 24 }, (_, i) => i);

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
  isPlaceholder?: boolean;
  isDraftEditing?: boolean;
}

type EventChangeArgs = {
  event: GcalEvent;
  start: Date;
  end: Date;
  allDay?: boolean;
};

interface Props {
  events: GcalEvent[];
  view: "day" | "week";
  date: Date;
  userTimezone: string;
  onNavigate: (date: Date) => void;
  onSelectSlot: (range: { start: Date; end: Date; allDay: boolean }) => void;
  onSelectEvent: (event: GcalEvent) => void;
  /** Drag-move callback — wired up in a follow-up commit. */
  onEventDrop?: (args: EventChangeArgs) => void;
  /** Drag-resize callback — wired up in a follow-up commit. */
  onEventResize?: (args: EventChangeArgs) => void;
}

interface PositionedEvent {
  event: GcalEvent;
  column: number;
  totalColumns: number;
}

/**
 * Greedy column-packing for overlapping events (lifted from v1
 * polymath-tracker/app/schedule/page.tsx assignColumns logic).
 *
 * - Sort events by start time.
 * - Walk forward; when an event starts at or after the running cluster's
 *   end time, flush the cluster (assign each event to its column with the
 *   cluster's totalColumns).
 * - Within a cluster, place each new event into the first column whose
 *   last event ended at or before the new one starts; otherwise open a
 *   new column.
 */
function assignColumns(events: GcalEvent[]): PositionedEvent[] {
  const sorted = [...events].sort(
    (a, b) => a.start.getTime() - b.start.getTime(),
  );
  const result: PositionedEvent[] = [];
  let clusterColumns: GcalEvent[][] = [];
  let clusterEnd = -Infinity;

  const flush = () => {
    const totalColumns = clusterColumns.length;
    clusterColumns.forEach((col, c) => {
      for (const ev of col) {
        result.push({ event: ev, column: c, totalColumns });
      }
    });
    clusterColumns = [];
    clusterEnd = -Infinity;
  };

  for (const ev of sorted) {
    if (ev.start.getTime() >= clusterEnd) flush();
    let placed = false;
    for (const col of clusterColumns) {
      const last = col[col.length - 1]!;
      if (last.end.getTime() <= ev.start.getTime()) {
        col.push(ev);
        placed = true;
        break;
      }
    }
    if (!placed) clusterColumns.push([ev]);
    clusterEnd = Math.max(clusterEnd, ev.end.getTime());
  }
  flush();
  return result;
}

export function CalendarGrid({
  events,
  view,
  date,
  onSelectSlot,
  onSelectEvent,
}: Props) {
  const days = useMemo(() => {
    if (view === "day") return [startOfDay(date)];
    const weekStart = startOfWeek(date, { weekStartsOn: 1 });
    return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  }, [view, date]);

  const eventsByDay = useMemo(() => {
    return days.map((d) => {
      const timed: GcalEvent[] = [];
      const allDay: GcalEvent[] = [];
      for (const ev of events) {
        if (!isSameDay(ev.start, d)) continue;
        if (ev.allDay) allDay.push(ev);
        else timed.push(ev);
      }
      return { timed: assignColumns(timed), allDay };
    });
  }, [events, days]);

  const today = new Date();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  // Scroll the body so the current hour (or 8 AM as fallback) is visible
  // on first paint. Keeps the grid from booting at midnight.
  const bodyRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const hour = days.some((d) => isSameDay(d, today))
      ? now.getHours()
      : 8;
    el.scrollTop = Math.max(0, hour * HOUR_PX - 80);
    // Run once on mount per view/date change. Refresh-on-now is too jumpy.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, date]);

  const minutesSinceMidnight = (d: Date) =>
    d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;

  const dayColTemplate = `${TIME_GUTTER_W}px repeat(${days.length}, minmax(0, 1fr))`;

  return (
    <div
      className="flex flex-col rounded-2xl overflow-hidden h-full"
      style={{
        background: "rgba(255,255,255,0.02)",
        boxShadow:
          "inset 0 0 0 1px color-mix(in oklch, var(--edge) 55%, transparent)",
      }}
    >
      {/* ── Header: weekday + date number per day ───────────────────────────── */}
      <div
        className="grid border-b"
        style={{
          gridTemplateColumns: dayColTemplate,
          borderColor: "rgba(255,255,255,0.05)",
        }}
      >
        <div /> {/* gutter corner */}
        {days.map((d, i) => {
          const isToday = isSameDay(d, today);
          return (
            <div
              key={d.toISOString()}
              className="flex items-baseline gap-2 px-3 py-3 border-l"
              style={{
                borderColor: "rgba(255,255,255,0.05)",
                borderLeftWidth: i === 0 ? 0 : 1,
              }}
            >
              <span
                className="font-mono text-[10px] uppercase tracking-[0.14em] font-semibold"
                style={{
                  color: isToday
                    ? "var(--hud-cyan)"
                    : "color-mix(in oklch, var(--ink-muted) 90%, transparent)",
                }}
              >
                {format(d, "EEE")}
              </span>
              <span
                className="font-serif text-xl tabular-nums leading-none"
                style={{
                  color: isToday ? "var(--hud-cyan)" : "var(--ink)",
                  fontWeight: isToday ? 600 : 500,
                }}
              >
                {format(d, "d")}
              </span>
            </div>
          );
        })}
      </div>

      {/* ── All-day row (thin strip) ────────────────────────────────────────── */}
      {eventsByDay.some((d) => d.allDay.length > 0) && (
        <div
          className="grid border-b"
          style={{
            gridTemplateColumns: dayColTemplate,
            borderColor: "rgba(255,255,255,0.05)",
            minHeight: 28,
          }}
        >
          <div
            className="flex items-center justify-end pr-3 font-mono text-[10px] uppercase tracking-[0.12em]"
            style={{ color: "color-mix(in oklch, var(--ink-muted) 80%, transparent)" }}
          >
            all-day
          </div>
          {eventsByDay.map((d, i) => (
            <div
              key={`allday-${i}`}
              className="flex flex-wrap gap-1 px-1 py-1 border-l"
              style={{
                borderColor: "rgba(255,255,255,0.05)",
                borderLeftWidth: i === 0 ? 0 : 1,
              }}
            >
              {d.allDay.slice(0, 2).map((ev) => (
                <AllDayChip
                  key={ev.id}
                  event={ev}
                  onClick={() => onSelectEvent(ev)}
                />
              ))}
              {d.allDay.length > 2 && (
                <span className="font-mono text-[10px] text-[var(--ink-muted)] self-center px-1">
                  +{d.allDay.length - 2}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Scrollable body: time gutter + day columns ──────────────────────── */}
      <div ref={bodyRef} className="flex-1 overflow-y-auto">
        <div
          className="grid"
          style={{ gridTemplateColumns: dayColTemplate, height: TOTAL_HEIGHT }}
        >
          {/* Time gutter — hour labels */}
          <div className="relative">
            {HOURS.map((h) => (
              <div
                key={h}
                className="absolute right-3 -translate-y-1/2 font-mono text-[10px]"
                style={{
                  top: h * HOUR_PX,
                  color: "color-mix(in oklch, var(--ink-muted) 80%, transparent)",
                }}
              >
                {h === 0 ? "" : format(new Date(0, 0, 0, h), "h a")}
              </div>
            ))}
          </div>

          {/* Day columns */}
          {days.map((day, dayIdx) => {
            const isToday = isSameDay(day, today);
            const dayEvents = eventsByDay[dayIdx]!.timed;
            const showNow = isToday;
            const nowTop = (minutesSinceMidnight(now) / 60) * HOUR_PX;

            return (
              <div
                key={day.toISOString()}
                className="relative border-l"
                style={{
                  borderColor: "rgba(255,255,255,0.05)",
                  borderLeftWidth: dayIdx === 0 ? 0 : 1,
                  background: isToday
                    ? "rgba(34, 211, 238, 0.025)"
                    : "transparent",
                }}
                onClick={(e) => {
                  // Only fire for empty-slot clicks. The event chips below
                  // stopPropagation in their own onClick.
                  const rect = e.currentTarget.getBoundingClientRect();
                  const y = e.clientY - rect.top;
                  const rawMinutes = (y / HOUR_PX) * 60;
                  const snapped =
                    Math.floor(rawMinutes / SLOT_MINUTES) * SLOT_MINUTES;
                  const start = addMinutes(startOfDay(day), snapped);
                  const end = addMinutes(start, SLOT_MINUTES);
                  onSelectSlot({ start, end, allDay: false });
                }}
              >
                {/* Hour gridlines */}
                {HOURS.map((h) => (
                  <div
                    key={h}
                    className="absolute left-0 right-0 pointer-events-none"
                    style={{
                      top: h * HOUR_PX,
                      borderTop: "1px solid rgba(255,255,255,0.05)",
                    }}
                  />
                ))}
                {/* Half-hour gridlines — slightly fainter */}
                {HOURS.map((h) => (
                  <div
                    key={`half-${h}`}
                    className="absolute left-0 right-0 pointer-events-none"
                    style={{
                      top: h * HOUR_PX + HOUR_PX / 2,
                      borderTop: "1px dashed rgba(255,255,255,0.025)",
                    }}
                  />
                ))}

                {/* Event chips */}
                {dayEvents.map(({ event, column, totalColumns }) => {
                  const startMin = minutesSinceMidnight(event.start);
                  const endMin = minutesSinceMidnight(event.end);
                  const top = (startMin / 60) * HOUR_PX;
                  const height = Math.max(
                    ((endMin - startMin) / 60) * HOUR_PX - 2,
                    20,
                  );
                  const widthPct = 100 / totalColumns;
                  const leftPct = column * widthPct;
                  return (
                    <EventChip
                      key={event.id}
                      event={event}
                      top={top}
                      height={height}
                      leftPct={leftPct}
                      widthPct={widthPct}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectEvent(event);
                      }}
                    />
                  );
                })}

                {/* Current time indicator (today only) */}
                {showNow && (
                  <div
                    className="absolute left-0 right-0 pointer-events-none z-20"
                    style={{ top: nowTop }}
                  >
                    <div
                      className="h-px"
                      style={{
                        background: "var(--hud-cyan)",
                        boxShadow: "0 0 6px rgba(34,211,238,0.55)",
                      }}
                    />
                    {dayIdx === 0 && (
                      <span
                        className="absolute -translate-y-1/2 -left-1 font-mono text-[9px] font-semibold px-1.5 py-0.5 rounded-sm"
                        style={{
                          background: "var(--hud-cyan)",
                          color: "rgb(15,15,18)",
                          left: -TIME_GUTTER_W + 8,
                          top: 0,
                        }}
                      >
                        {format(now, "HH:mm")}
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

interface EventChipProps {
  event: GcalEvent;
  top: number;
  height: number;
  leftPct: number;
  widthPct: number;
  onClick: (e: React.MouseEvent<HTMLDivElement>) => void;
}

function EventChip({
  event,
  top,
  height,
  leftPct,
  widthPct,
  onClick,
}: EventChipProps) {
  const color = event.colorHex || "var(--ink-coral)";
  const isCompact = height < 36;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick(e as unknown as React.MouseEvent<HTMLDivElement>);
        }
      }}
      className="absolute rounded-md overflow-hidden cursor-pointer transition-[filter] duration-150 ease-out hover:brightness-110"
      style={{
        top: `${top}px`,
        height: `${height}px`,
        left: `calc(${leftPct}% + 2px)`,
        width: `calc(${widthPct}% - 4px)`,
        background: `color-mix(in srgb, ${color} 22%, transparent)`,
        borderLeft: `3px solid ${color}`,
        boxShadow:
          "0 1px 2px rgba(0,0,0,0.32), inset 0 1px 0 rgba(255,255,255,0.04)",
        outlineStyle: event.isPlaceholder ? "dashed" : "none",
        outlineColor: color,
        outlineWidth: event.isPlaceholder ? 1.5 : 0,
        outlineOffset: -2,
        opacity: event.isDraftEditing ? 0.45 : event.isPlaceholder ? 0.92 : 1,
        fontStyle: event.isPlaceholder ? "italic" : "normal",
        padding: isCompact ? "1px 6px" : "4px 8px",
      }}
    >
      <div
        className="font-serif text-[13px] leading-tight truncate text-[var(--ink)]"
        style={{
          textShadow: "0 1px 0 rgba(0,0,0,0.18)",
        }}
      >
        {event.title || "Untitled"}
        {event.recurringEventId && (
          <span className="ml-1 opacity-60" title="Recurring event">
            ↻
          </span>
        )}
      </div>
      {!isCompact && (
        <div className="font-mono text-[10px] leading-tight tracking-[0.04em] text-[var(--ink-muted)] truncate">
          {format(event.start, "HH:mm")}–{format(event.end, "HH:mm")}
        </div>
      )}
    </div>
  );
}

interface AllDayChipProps {
  event: GcalEvent;
  onClick: () => void;
}

function AllDayChip({ event, onClick }: AllDayChipProps) {
  const color = event.colorHex || "var(--ink-coral)";
  return (
    <button
      type="button"
      onClick={onClick}
      className="font-serif text-[11px] leading-none px-2 py-1 rounded-md truncate max-w-[140px] cursor-pointer hover:brightness-110 transition-[filter] duration-150"
      style={{
        background: `color-mix(in srgb, ${color} 22%, transparent)`,
        borderLeft: `2px solid ${color}`,
        color: "var(--ink)",
      }}
    >
      {event.title || "Untitled"}
    </button>
  );
}

