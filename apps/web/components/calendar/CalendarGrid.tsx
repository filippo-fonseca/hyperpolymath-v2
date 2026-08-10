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

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  addDays,
  addMinutes,
  format,
  isSameDay,
  startOfDay,
  startOfWeek,
} from "date-fns";
import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { tintFor } from "@/lib/tint";
import type { GcalAttendeeDTO } from "@/lib/gcal/event-dto";

/**
 * jul-29 craft restyle — the grid's colour law.
 *
 * Event blocks are pastel plates: the fill comes from the calendar source's
 * deterministic tint (`tintFor(calendarId)`), the saturated `--tint-edge`
 * shows up only as a 3px left edge plus a soft hairline, and the label sits
 * in the in-family `--tint-ink`. Events with no calendar id fall back to sky.
 *
 * Today's column carries nothing but a whisper of butter wash — no ring, no
 * plate — so it reads as a lit page rather than a selected cell. Hour
 * gridlines stay hairline `--edge`; half-hours are a fainter dashed mix.
 */
const TODAY_WASH = "color-mix(in srgb, var(--tint-butter-edge) 7%, transparent)";
const HAIRLINE = "1px solid var(--edge)";
const HALF_HOUR_LINE =
  "1px dashed color-mix(in srgb, var(--edge) 55%, transparent)";

/** Deterministic tint class for an event's calendar source (sky by default). */
function eventTint(calendarId: string): string {
  return calendarId ? tintFor(calendarId) : "tint-sky";
}

const HOUR_PX = 56;
const TOTAL_HEIGHT = 24 * HOUR_PX;
const TIME_GUTTER_W = 64;
/** Snap interval while a drag is in progress — matches Google Calendar. */
const DRAG_SNAP_MINUTES = 15;
/** Fallback duration when the user clicks without dragging. */
const CLICK_DEFAULT_MINUTES = 30;
const HOURS = Array.from({ length: 24 }, (_, i) => i);

function formatMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

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
  /** Guests on the event (people only) — surfaced in the edit panel. */
  attendees: GcalAttendeeDTO[];
  /** Joinable Google Meet link, when the event has conferencing. */
  hangoutLink: string | null;
  isPlaceholder?: boolean;
  isDraftEditing?: boolean;
  /** A backend write (update reschedule/edit) is in flight for this event. */
  isBusy?: boolean;
}

type EventChangeArgs = {
  event: GcalEvent;
  start: Date;
  end: Date;
  allDay?: boolean;
};

interface Props {
  events: GcalEvent[];
  view: "day" | "3day" | "week";
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
    if (view === "3day") {
      const start = startOfDay(date);
      return Array.from({ length: 3 }, (_, i) => addDays(start, i));
    }
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

  // ── Drag-to-create state ─────────────────────────────────────────────────
  // gcal-style: mousedown on an empty slot starts the drag, mousemove sets
  // the live end-minute (snapped to DRAG_SNAP_MINUTES), mouseup commits via
  // onSelectSlot. A click without movement falls back to CLICK_DEFAULT_MINUTES.
  const [drag, setDrag] = useState<{
    dayIdx: number;
    startMin: number;
    currentMin: number;
  } | null>(null);
  const dayColumnRefs = useRef<Map<number, HTMLDivElement | null>>(new Map());

  const computeSnappedMinutes = (rect: DOMRect, clientY: number): number => {
    const y = Math.max(0, Math.min(rect.height, clientY - rect.top));
    const raw = (y / HOUR_PX) * 60;
    const snapped = Math.floor(raw / DRAG_SNAP_MINUTES) * DRAG_SNAP_MINUTES;
    return Math.max(0, Math.min(24 * 60 - DRAG_SNAP_MINUTES, snapped));
  };

  useEffect(() => {
    if (!drag) return;
    const handleMove = (e: MouseEvent) => {
      const el = dayColumnRefs.current.get(drag.dayIdx);
      if (!el) return;
      const next = computeSnappedMinutes(el.getBoundingClientRect(), e.clientY);
      setDrag((d) => (d && d.currentMin !== next ? { ...d, currentMin: next } : d));
    };
    const handleUp = () => {
      setDrag((d) => {
        if (!d) return null;
        const day = days[d.dayIdx]!;
        const startSnap = Math.min(d.startMin, d.currentMin);
        let endSnap = Math.max(d.startMin, d.currentMin);
        if (endSnap === startSnap) endSnap = startSnap + CLICK_DEFAULT_MINUTES;
        const start = addMinutes(startOfDay(day), startSnap);
        const end = addMinutes(startOfDay(day), endSnap);
        onSelectSlot({ start, end, allDay: false });
        return null;
      });
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrag(null);
    };
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
      window.removeEventListener("keydown", handleKey);
    };
  }, [drag, days, onSelectSlot]);

  // Auto-scroll the body so the current time sits ~1/3 down from the top.
  // Use ResizeObserver so the scroll math only runs once the body actually
  // has a measurable height — earlier versions used rAF deferral but the
  // flex chain occasionally still settled at clientHeight=0 on the first
  // few frames, and the scroll silently no-op'd. ResizeObserver fires the
  // moment layout produces a real size and disconnects on success.
  const bodyRef = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const scrollToNow = (): boolean => {
      if (!bodyRef.current) return false;
      const h = bodyRef.current.clientHeight;
      if (h === 0) return false;
      const n = new Date();
      const nowMinutes = n.getHours() * 60 + n.getMinutes();
      const nowPx = (nowMinutes / 60) * HOUR_PX;
      const offset = h / 3;
      bodyRef.current.scrollTop = Math.max(0, nowPx - offset);
      return true;
    };
    if (scrollToNow()) return;
    // First paint didn't have a size yet — wait for it via ResizeObserver.
    const ro = new ResizeObserver(() => {
      if (scrollToNow()) ro.disconnect();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [view, date]);

  const minutesSinceMidnight = (d: Date) =>
    d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;

  const dayColTemplate = `${TIME_GUTTER_W}px repeat(${days.length}, minmax(0, 1fr))`;

  const hasAllDay = eventsByDay.some((d) => d.allDay.length > 0);

  // CSS Grid for the OUTER container instead of flex-col. The `1fr` row
  // owns the scroll body and is bound by the parent's `h-full` — no
  // `flex-1 min-h-0` chain to bail. With `minmax(0, 1fr)` the body row
  // is allowed to shrink below content and overflow-y-auto engages.
  const outerRows = hasAllDay ? "auto auto minmax(0, 1fr)" : "auto minmax(0, 1fr)";

  return (
    // The grid is the route's one large panel: a raised white sheet at the
    // panel radius. `craft-card` owns the fill, hairline and shadow, so no
    // `bg-*` utility may ride along with it.
    <div
      className="craft-card grid h-full overflow-hidden rounded-2xl"
      style={{ gridTemplateRows: outerRows }}
    >
      {/* ── Header: weekday + date number per day ───────────────────────────── */}
      <div
        className="grid border-b border-[var(--edge)]"
        style={{ gridTemplateColumns: dayColTemplate }}
      >
        <div /> {/* gutter corner */}
        {days.map((d, i) => {
          const isToday = isSameDay(d, today);
          return (
            <div
              key={d.toISOString()}
              className="flex items-center border-l border-[var(--edge)] px-3 py-2"
              style={{
                borderLeftWidth: i === 0 ? 0 : 1,
                background: isToday ? TODAY_WASH : undefined,
              }}
            >
              {/* The register's agenda day tile (globals.css §9): canvas-gray
                  at rest, sky pastel for today. One colored element per
                  header cell, and no . */}
              <div className="craft-day-tile" data-today={isToday || undefined}>
                <span className="text-micro">{format(d, "EEE")}</span>
                <span className="text-meta font-semibold tabular-nums leading-none">
                  {format(d, "d")}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── All-day row (thin strip) ────────────────────────────────────────── */}
      {hasAllDay && (
        <div
          className="grid border-b border-[var(--edge)]"
          style={{ gridTemplateColumns: dayColTemplate, minHeight: 30 }}
        >
          <div className="flex items-center justify-end pr-3 text-micro text-[var(--ink-faint)]">
            All-day
          </div>
          {eventsByDay.map((d, i) => (
            <div
              key={`allday-${i}`}
              className="flex flex-wrap gap-1 border-l border-[var(--edge)] px-1.5 py-1"
              style={{
                borderLeftWidth: i === 0 ? 0 : 1,
                background: isSameDay(days[i]!, today) ? TODAY_WASH : undefined,
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
                <span className="self-center px-1 text-micro tabular-nums text-[var(--ink-faint)]">
                  +{d.allDay.length - 2}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Scrollable body: time gutter + day columns ──────────────────────── */}
      {/* `min-h-0` is load-bearing: flex items default to `min-height: auto`
          which would let the body grow to fit its 1344px inner content and
          disable overflow. With min-h-0 the body can shrink below content
          and overflow-y-auto actually kicks in. */}
      <div
        ref={bodyRef}
        className="overflow-y-auto overscroll-contain hud-scrollbar"
        style={{ minHeight: 0 }}
      >
        <div
          className="grid"
          style={{ gridTemplateColumns: dayColTemplate, height: TOTAL_HEIGHT }}
        >
          {/* Time gutter — hour labels */}
          <div className="relative">
            {HOURS.map((h) => (
              <div
                key={h}
                className="absolute right-3 -translate-y-1/2 text-micro tabular-nums text-[var(--ink-faint)]"
                style={{ top: h * HOUR_PX }}
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
                ref={(el) => {
                  dayColumnRefs.current.set(dayIdx, el);
                }}
                className="relative select-none border-l border-[var(--edge)]"
                style={{
                  borderLeftWidth: dayIdx === 0 ? 0 : 1,
                  // Today = a whisper of butter wash. No ring, no plate: the
                  // column should read as a lit page, not a selected cell.
                  background: isToday ? TODAY_WASH : "transparent",
                  cursor: drag ? "ns-resize" : "default",
                }}
                onMouseDown={(e) => {
                  // Left-click only; event chips stopPropagation so this only
                  // fires on empty grid area.
                  if (e.button !== 0) return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  const snapped = computeSnappedMinutes(rect, e.clientY);
                  setDrag({
                    dayIdx,
                    startMin: snapped,
                    currentMin: snapped,
                  });
                }}
              >
                {/* Hour gridlines */}
                {HOURS.map((h) => (
                  <div
                    key={h}
                    className="absolute left-0 right-0 pointer-events-none"
                    style={{ top: h * HOUR_PX, borderTop: HAIRLINE }}
                  />
                ))}
                {/* Half-hour gridlines — slightly fainter */}
                {HOURS.map((h) => (
                  <div
                    key={`half-${h}`}
                    className="absolute left-0 right-0 pointer-events-none"
                    style={{
                      top: h * HOUR_PX + HOUR_PX / 2,
                      borderTop: HALF_HOUR_LINE,
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

                {/* Drag-to-create live preview (only in the active day column) */}
                {drag && drag.dayIdx === dayIdx && (() => {
                  const startSnap = Math.min(drag.startMin, drag.currentMin);
                  const rawEnd = Math.max(drag.startMin, drag.currentMin);
                  const isClickOnly = rawEnd === startSnap;
                  const endSnap = isClickOnly
                    ? startSnap + CLICK_DEFAULT_MINUTES
                    : rawEnd;
                  const previewTop = (startSnap / 60) * HOUR_PX;
                  const previewHeight = Math.max(
                    ((endSnap - startSnap) / 60) * HOUR_PX,
                    18,
                  );
                  return (
                    // Sky is the grid's "nothing here yet" hue, so a slot
                    // being drawn reads as a plate-in-waiting: pastel fill,
                    // dashed saturated rim.
                    <div
                      className="tint-sky pointer-events-none absolute z-10 rounded-lg"
                      style={{
                        top: previewTop,
                        height: previewHeight,
                        left: 2,
                        right: 2,
                        background: "var(--tint-bg)",
                        border: "1px dashed var(--tint-edge)",
                      }}
                    >
                      <span
                        className="block truncate px-2 py-0.5 text-micro font-medium tabular-nums text-[var(--tint-ink)]"
                        style={{ opacity: isClickOnly ? 0.7 : 1 }}
                      >
                        {formatMinutes(startSnap)}–{formatMinutes(endSnap)}
                      </span>
                    </div>
                  );
                })()}

                {/* Current time indicator (today only) — a saturated rose
                    hairline with a left-edge dot, plus a pastel rose pill in
                    the time gutter on the first day column so the timestamp
                    never overlaps an event plate. Rose is the one saturated
                    stroke allowed on the field. */}
                {showNow && (
                  <div
                    className="tint-rose pointer-events-none absolute left-0 right-0 z-20"
                    style={{ top: nowTop }}
                  >
                    {/* Left-edge dot */}
                    <div
                      className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--tint-edge)]"
                      style={{ left: 0, top: 0, width: 7, height: 7 }}
                    />
                    {/* Horizontal bar — crisp 1.5px line, no glow. */}
                    <div
                      style={{ height: 1.5, background: "var(--tint-edge)" }}
                    />
                    {dayIdx === 0 && (
                      <span
                        className="absolute -translate-y-1/2 rounded-md border px-1.5 py-0.5 text-micro font-semibold tabular-nums"
                        style={{
                          background: "var(--tint-bg)",
                          borderColor: "var(--tint-edge)",
                          color: "var(--tint-ink)",
                          left: -TIME_GUTTER_W + 6,
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
  // Craft chip grammar: a pastel plate in the calendar source's tint, with the
  // saturated edge carried on a 3px left rule (the one place the hue is
  // allowed to go loud) and the label in the in-family ink. Placeholders are a
  // translucent version of the same plate with a dashed rim, so a proposed
  // position reads as "this event, not yet real" rather than a different
  // species of object.
  const tint = eventTint(event.calendarId);
  const isCompact = height < 36;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onMouseDown={(e) => {
        // Prevent the day-column's drag-to-create from firing when the user
        // grabs an existing chip.
        e.stopPropagation();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick(e as unknown as React.MouseEvent<HTMLDivElement>);
        }
      }}
      className={cn(
        tint,
        "absolute cursor-pointer overflow-hidden rounded-lg border",
        "transition-[border-color,box-shadow] duration-[160ms] ease-out",
        !event.isPlaceholder &&
          "shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-card-hover)]",
      )}
      style={{
        top: `${top}px`,
        height: `${height}px`,
        left: `calc(${leftPct}% + 2px)`,
        width: `calc(${widthPct}% - 4px)`,
        background: event.isPlaceholder
          ? "color-mix(in srgb, var(--tint-bg) 55%, transparent)"
          : "var(--tint-bg)",
        color: "var(--tint-ink)",
        borderColor: event.isPlaceholder
          ? "var(--tint-edge)"
          : "color-mix(in srgb, var(--tint-edge) 45%, transparent)",
        borderStyle: event.isPlaceholder ? "dashed" : "solid",
        opacity: event.isDraftEditing
          ? 0.45
          : event.isBusy
            ? 0.7
            : event.isPlaceholder
              ? 0.92
              : 1,
        fontStyle: event.isPlaceholder ? "italic" : "normal",
        padding: isCompact ? "2px 8px" : "4px 9px",
        // Shorthand LAST so it wins over borderColor/borderStyle above.
        borderLeft: "3px solid var(--tint-edge)",
      }}
    >
      {/* In-flight write indicator (issue #25): a small corner spinner while a
          reschedule/edit round-trips so the optimistic chip reads as "saving"
          rather than already-settled. */}
      {event.isBusy && (
        <Loader2
          size={12}
          className="absolute right-1 top-1 animate-spin text-[var(--tint-ink)]"
          aria-hidden
        />
      )}
      <div className="flex min-w-0 items-center">
        <span className="truncate text-micro font-medium leading-tight text-[var(--tint-ink)]">
          {event.title || "Untitled"}
          {event.recurringEventId && (
            <span className="ml-1 opacity-60" title="Recurring event">
              ↻
            </span>
          )}
        </span>
      </div>
      {!isCompact && (
        <div className="mt-0.5 truncate text-micro leading-tight tabular-nums text-[var(--tint-ink)] opacity-70">
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
  const tint = eventTint(event.calendarId);
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        tint,
        "inline-flex max-w-[140px] cursor-pointer items-center truncate rounded-lg border px-2 py-1",
        "text-micro font-medium leading-none shadow-[var(--shadow-card)]",
        "transition-[border-color,box-shadow] duration-[160ms] ease-out hover:shadow-[var(--shadow-card-hover)]",
      )}
      style={{
        background: "var(--tint-bg)",
        color: "var(--tint-ink)",
        borderColor: "color-mix(in srgb, var(--tint-edge) 45%, transparent)",
        borderLeft: "3px solid var(--tint-edge)",
      }}
    >
      <span className="truncate">{event.title || "Untitled"}</span>
    </button>
  );
}

