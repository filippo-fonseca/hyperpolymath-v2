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
    <div
      className="grid rounded-[10px] overflow-hidden h-full"
      style={{
        gridTemplateRows: outerRows,
        background: "var(--sd-box)",
        boxShadow: "inset 0 0 0 1px var(--sd-line)",
      }}
    >
      {/* ── Header: weekday + date number per day ───────────────────────────── */}
      <div
        className="grid border-b"
        style={{
          gridTemplateColumns: dayColTemplate,
          borderColor: "var(--sd-line)",
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
                borderColor: "var(--sd-line)",
                borderLeftWidth: i === 0 ? 0 : 1,
              }}
            >
              <span
                className="font-mono text-[10px] uppercase tracking-[0.14em] font-semibold"
                style={{
                  color: isToday ? "var(--sd-accent)" : "var(--sd-ink-faint)",
                }}
              >
                {format(d, "EEE")}
              </span>
              <span
                className="text-xl tabular-nums leading-none tracking-[-0.01em]"
                style={{
                  color: isToday ? "var(--sd-accent)" : "var(--sd-ink)",
                  fontWeight: isToday ? 700 : 600,
                }}
              >
                {format(d, "d")}
              </span>
            </div>
          );
        })}
      </div>

      {/* ── All-day row (thin strip) ────────────────────────────────────────── */}
      {hasAllDay && (
        <div
          className="grid border-b"
          style={{
            gridTemplateColumns: dayColTemplate,
            borderColor: "var(--sd-line)",
            minHeight: 28,
          }}
        >
          <div
            className="flex items-center justify-end pr-3 font-mono text-[10px] uppercase tracking-[0.12em]"
            style={{ color: "var(--sd-ink-faint)" }}
          >
            all-day
          </div>
          {eventsByDay.map((d, i) => (
            <div
              key={`allday-${i}`}
              className="flex flex-wrap gap-1 px-1 py-1 border-l"
              style={{
                borderColor: "var(--sd-line)",
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
                <span className="font-mono text-[10px] text-[var(--sd-ink-dull)] self-center px-1">
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
                className="absolute right-3 -translate-y-1/2 font-mono text-[10px]"
                style={{
                  top: h * HOUR_PX,
                  color: "var(--sd-ink-faint)",
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
                ref={(el) => {
                  dayColumnRefs.current.set(dayIdx, el);
                }}
                className="relative border-l select-none"
                style={{
                  borderColor: "var(--sd-line)",
                  borderLeftWidth: dayIdx === 0 ? 0 : 1,
                  // Today = faint accent wash + a crisp 1px cyan ring (seed).
                  background: isToday
                    ? "color-mix(in oklch, var(--sd-accent) 5%, transparent)"
                    : "transparent",
                  boxShadow: isToday
                    ? "inset 0 0 0 1px color-mix(in oklch, var(--sd-accent) 55%, transparent)"
                    : "none",
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
                    style={{
                      top: h * HOUR_PX,
                      borderTop: "1px solid var(--sd-line)",
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
                      borderTop:
                        "1px dashed color-mix(in oklch, var(--sd-line) 55%, transparent)",
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
                    <div
                      className="absolute pointer-events-none z-10 rounded-[6px]"
                      style={{
                        top: previewTop,
                        height: previewHeight,
                        left: 2,
                        right: 2,
                        background:
                          "color-mix(in oklch, var(--sd-accent) 16%, transparent)",
                        boxShadow:
                          "inset 0 0 0 1px color-mix(in oklch, var(--sd-accent) 55%, transparent)",
                      }}
                    >
                      <span
                        className="font-mono text-[10px] px-2 py-0.5 text-[var(--sd-ink)] block truncate"
                        style={{ opacity: isClickOnly ? 0.7 : 1 }}
                      >
                        {formatMinutes(startSnap)}–{formatMinutes(endSnap)}
                      </span>
                    </div>
                  );
                })()}

                {/* Current time indicator (today only) — 1.5px cyan bar
                    with a soft glow, a left-edge dot, and a mono timestamp
                    pill that sits in the time gutter on the first day
                    column so it doesn't overlap event chips. */}
                {showNow && (
                  <div
                    className="absolute left-0 right-0 pointer-events-none z-20"
                    style={{ top: nowTop }}
                  >
                    {/* Left-edge dot */}
                    <div
                      className="absolute -translate-y-1/2 -translate-x-1/2 rounded-full"
                      style={{
                        left: 0,
                        top: 0,
                        width: 7,
                        height: 7,
                        background: "var(--sd-accent)",
                      }}
                    />
                    {/* Horizontal bar — crisp 1.5px accent line, no glow (§0). */}
                    <div
                      style={{
                        height: 1.5,
                        background: "var(--sd-accent)",
                      }}
                    />
                    {dayIdx === 0 && (
                      <span
                        className="absolute -translate-y-1/2 font-mono text-[10px] font-semibold px-1.5 py-0.5 rounded-[4px] tabular-nums"
                        style={{
                          // Dark on-accent ink in BOTH themes (matches the sd
                          // check-on-accent convention) — cyan pill stays legible.
                          background: "var(--sd-accent)",
                          color: "hsl(235 45% 9%)",
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
  // sd chip grammar (seed): the surface stays sd (--sd-input + --sd-line
  // hairline) — the calendar-source colour is allowed to tint the LEADING DOT
  // ONLY, never the fill or a left edge. Single cyan accent law holds otherwise.
  const dotColor = event.colorHex || "var(--ink-coral)";
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
      className="absolute rounded-[6px] overflow-hidden cursor-pointer transition-colors duration-150 ease-out hover:brightness-[1.06]"
      style={{
        top: `${top}px`,
        height: `${height}px`,
        left: `calc(${leftPct}% + 2px)`,
        width: `calc(${widthPct}% - 4px)`,
        // Placeholder rows read as a dashed accent outline on the app surface;
        // settled events read as a solid --sd-input plate with a hairline ring.
        background: event.isPlaceholder ? "var(--sd-app)" : "var(--sd-input)",
        boxShadow: event.isPlaceholder
          ? "none"
          : "inset 0 0 0 1px var(--sd-line)",
        outlineStyle: event.isPlaceholder ? "dashed" : "none",
        outlineColor: "var(--sd-accent)",
        outlineWidth: event.isPlaceholder ? 1.5 : 0,
        outlineOffset: -2,
        opacity: event.isDraftEditing
          ? 0.45
          : event.isBusy
            ? 0.7
            : event.isPlaceholder
              ? 0.92
              : 1,
        fontStyle: event.isPlaceholder ? "italic" : "normal",
        padding: isCompact ? "2px 7px" : "4px 8px",
      }}
    >
      {/* In-flight write indicator (issue #25): a small corner spinner while a
          reschedule/edit round-trips so the optimistic chip reads as "saving"
          rather than already-settled. */}
      {event.isBusy && (
        <Loader2
          size={12}
          className="absolute top-1 right-1 animate-spin text-[var(--sd-ink-dull)]"
          aria-hidden
        />
      )}
      <div className="flex items-center gap-1.5 min-w-0">
        <span
          aria-hidden
          className="h-[6px] w-[6px] shrink-0 rounded-full"
          style={{ background: dotColor }}
        />
        <span className="text-[12px] font-medium leading-tight truncate text-[var(--sd-ink)]">
          {event.title || "Untitled"}
          {event.recurringEventId && (
            <span className="ml-1 text-[var(--sd-ink-faint)]" title="Recurring event">
              ↻
            </span>
          )}
        </span>
      </div>
      {!isCompact && (
        <div className="font-mono text-[10px] leading-tight tracking-[0.04em] text-[var(--sd-ink-dull)] truncate mt-0.5 pl-[13px]">
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
  const dotColor = event.colorHex || "var(--ink-coral)";
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 text-[12px] font-medium leading-none px-2 py-1 rounded-[6px] truncate max-w-[140px] cursor-pointer hover:brightness-[1.06] transition-colors duration-150 text-[var(--sd-ink)]"
      style={{
        background: "var(--sd-input)",
        boxShadow: "inset 0 0 0 1px var(--sd-line)",
      }}
    >
      <span
        aria-hidden
        className="h-[6px] w-[6px] shrink-0 rounded-full"
        style={{ background: dotColor }}
      />
      <span className="truncate">{event.title || "Untitled"}</span>
    </button>
  );
}

