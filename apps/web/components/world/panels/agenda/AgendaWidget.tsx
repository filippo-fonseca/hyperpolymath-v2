"use client";

/**
 * AgendaWidget.tsx — W-09 · The Studiolo · The Bottega (Phase 3) · agenda-widget
 *
 * The Meridian Ring reborn as ONE honest flat panel (PHASE-3-PLAN §W-09). The
 * ring's dial/scaffolding died with the demolition; its SOUL — the event
 * grammar — lives on in `agendaLogic.ts` and is rendered here into the shared
 * W-03 `<WorldPanel>` primitive, exactly as `TasksWidget` renders TodayPanel's
 * content.
 *
 * WHAT THIS PANEL IS (and is NOT): a READ-ONLY projection of the provider's
 * `calendar` slice (§3.2), which is itself a pure projection of live gcal data.
 * Nothing here writes gcal — the Page and Jarvis do (a Jarvis "put lunch at noon
 * Friday" refetches the slice via the `["calendar-events", userId]` PREFIX
 * invalidation, with zero wiring here). The panel NEVER OAuths; a disconnected
 * calendar renders the engraved §2.8 nudge back to the Page, never a beg.
 *
 * THE THREE agendaLogic SURVIVORS, consumed verbatim:
 *   • `classifyEvent({startMs,endMs}, nowMs)` → past|current|imminent|upcoming.
 *     Computed at RENDER off `Date.now()` so reclassification rides whatever
 *     cadence the provider re-renders at (the §3.1 minute tick / query refetch /
 *     focus change) — this file adds NO new interval, exactly per spec.
 *   • `linkEventToProject(title, tree)` → the conservative area-hue accent: a
 *     row wears its bough's OKLCH hue on a left strip ONLY when the linker hits
 *     confidently. Wrong tint is worse than none (the linker returns null when
 *     ambiguous), so an unlinked row stays parchment.
 *   • `calendarDotColor(calendarId, calendars)` → the small per-calendar Google
 *     dot: the ONE place gcal's saturated palette surfaces (never the row tint).
 *
 * SHIMMER (§W-09): `diffEventSnapshots` (KEPT past the ring's death precisely
 * for this) runs in a data-change effect over `calendar.events`; a newly-
 * appeared event id gets a ONE-SHOT 600 ms opacity/accent lift that self-
 * terminates via a per-id `setTimeout` (no `useFrame`, no interval — the phase's
 * only new `useFrame` is W-07's drag). Reduced motion (`useWorldPrefs`) → the
 * shimmer never arms, rows paint at their settled opacity.
 *
 * PERF (§6/§7, inherited from TasksWidget): buckets/labels/link/dot are derived
 * in RENDER, memoized on data identity, capped at `PANEL_ROW_CAP`; the primitive
 * owns the frame/LOD/honesty. No `useFrame`, no ref mutation, no `invalidate()`.
 */

import { type JSX, useEffect, useMemo, useRef, useState } from "react";
import { SRGBColorSpace } from "three";
import { Container, Text } from "@react-three/uikit";
import { addDays, format } from "date-fns";
import { TZDate } from "@date-fns/tz";
import type { GcalEventDTO } from "@/lib/gcal/event-dto";
import { gcalIsoToTZDate } from "@/lib/gcal/datetime";
import { useWorldData } from "../../data/useWorldData";
import { diffEventSnapshots } from "../../data/diffing";
import { useWorldPrefs } from "../../prefs/useWorldPrefs";
import {
  STUDIOLO,
  oklchToThreeColor,
  pickNodeColor,
} from "../../materials/tokens";
import {
  PANEL_ROW_CAP,
  WorldPanel,
  type DragHandleProps,
} from "../WorldPanel";
import type { WidgetComponentProps } from "../widgetRegistry";
import {
  calendarDotColor,
  classifyEvent,
  linkEventToProject,
  type EventTiming,
} from "./agendaLogic";

/** One-shot shimmer duration for a newly-appeared event row (§W-09). */
const SHIMMER_MS = 600;
/** All-day banner rows shown per section before the "+N" overflow (§W-09). */
const ALLDAY_CAP = 3;
/** Accent strip widths (world-panel px): base vs. "lifted" (imminent/shimmer). */
const ACCENT_W = 3;
const ACCENT_W_LIFTED = 4;

/** uikit/R3F pointer events expose `stopPropagation`; that's all the passthrough needs. */
interface AgendaWidgetProps extends WidgetComponentProps {
  dragHandleProps?: DragHandleProps;
}

/**
 * The bough's OKLCH hue as an sRGB hex string uikit can paint.
 *
 * `pickNodeColor` (copied verbatim from the 2D AreasTree) yields an `oklch(...)`
 * string; three r185 can't parse `oklch()` (silent no-op), so we route through
 * the shared `oklchToThreeColor` (linear-sRGB THREE.Color, identical to the 3D
 * boughs) and re-encode to an sRGB hex — the same string convention as the
 * STUDIOLO tokens. This keeps the Agenda accent hue-identical to the tree.
 */
function areaHueHex(areaId: string): string {
  return `#${oklchToThreeColor(pickNodeColor(areaId)).getHexString(SRGBColorSpace)}`;
}

/** A timed row, fully derived at data cadence (timing is layered on at render). */
interface TimedRow {
  ev: GcalEventDTO;
  startMs: number;
  endMs: number;
  range: string; // "9:30 AM – 10:45 AM", user tz, 12-h
  dotColor: string;
  accentHue: string | null; // area hue hex iff linkEventToProject hit; else null
}

/** An all-day row (no timing — it spans the whole day; banner at the section top). */
interface AllDayRow {
  ev: GcalEventDTO;
  dotColor: string;
  accentHue: string | null;
}

interface DaySection {
  allDay: AllDayRow[];
  timed: TimedRow[]; // sorted by startMs asc
}

export function AgendaWidget({
  slot,
  focused,
  lod,
  dragHandleProps,
}: AgendaWidgetProps): JSX.Element {
  const { calendar, tree, todayYmd } = useWorldData();
  const { status, events, calendars, timezone } = calendar;
  const { reducedMotion } = useWorldPrefs();

  // Read now at RENDER — classification is fresh on every render the provider
  // gives us (its minute tick / query refetch / focus change). No new interval.
  const nowMs = Date.now();

  // ── Buckets + labels + link + dot, memoized on DATA identity ──────────────
  // Recomputes only when the events array, the day, the tz, the tree (for the
  // linker), or the calendars (for the dot) change — never per frame, never per
  // render. Timing (past/current/…) is intentionally NOT baked in here so it can
  // re-derive against a fresh `nowMs` at render without invalidating this memo.
  const { today, tomorrow, totalRows } = useMemo(() => {
    const [yy, mm, dd] = todayYmd.split("-").map(Number);
    const todayMid = new TZDate(yy ?? 1970, (mm ?? 1) - 1, dd ?? 1, timezone);
    const todayStartMs = todayMid.getTime();
    const tomorrowStartMs = addDays(todayMid, 1).getTime();
    const dayAfterStartMs = addDays(todayMid, 2).getTime();
    const tomorrowYmd = format(addDays(todayMid, 1), "yyyy-MM-dd");

    const today: DaySection = { allDay: [], timed: [] };
    const tomorrow: DaySection = { allDay: [], timed: [] };

    for (const ev of events) {
      const link = linkEventToProject(ev.title, tree);
      const accentHue = link ? areaHueHex(link.areaId) : null;
      const dotColor = calendarDotColor(ev.calendarId, calendars);

      if (ev.allDay) {
        // gcal all-day end is EXCLUSIVE (next day). A single-day event lands on
        // exactly its day; a multi-day event lands on every day it covers.
        const row: AllDayRow = { ev, dotColor, accentHue };
        if (ev.start <= todayYmd && ev.end > todayYmd) today.allDay.push(row);
        if (ev.start <= tomorrowYmd && ev.end > tomorrowYmd) {
          tomorrow.allDay.push(row);
        }
        continue;
      }

      const startTz = gcalIsoToTZDate(ev.start, timezone);
      const endTz = gcalIsoToTZDate(ev.end, timezone);
      const startMs = startTz.getTime();
      const endMs = endTz.getTime();
      const range = `${format(startTz, "h:mm a")} – ${format(endTz, "h:mm a")}`;
      const row: TimedRow = { ev, startMs, endMs, range, dotColor, accentHue };

      // Bucket a timed event by the day its START falls in (user tz).
      if (startMs >= todayStartMs && startMs < tomorrowStartMs) {
        today.timed.push(row);
      } else if (startMs >= tomorrowStartMs && startMs < dayAfterStartMs) {
        tomorrow.timed.push(row);
      }
    }

    const byStart = (a: TimedRow, b: TimedRow) => a.startMs - b.startMs;
    today.timed.sort(byStart);
    tomorrow.timed.sort(byStart);

    const totalRows =
      today.allDay.length +
      today.timed.length +
      tomorrow.allDay.length +
      tomorrow.timed.length;

    return { today, tomorrow, totalRows };
  }, [events, tree, calendars, timezone, todayYmd]);

  // ── Shimmer: diff the event snapshot, arm a self-terminating 600 ms lift ──
  const [shimmerIds, setShimmerIds] = useState<Set<string>>(() => new Set());
  const prevEventsRef = useRef<Map<string, GcalEventDTO> | null>(null);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );

  useEffect(() => {
    const prev = prevEventsRef.current;
    // First run seeds the ref WITHOUT shimmering (the initial set isn't "new").
    if (prev !== null && !reducedMotion) {
      const { added } = diffEventSnapshots(prev, events);
      if (added.length > 0) {
        setShimmerIds((cur) => {
          const next = new Set(cur);
          for (const id of added) next.add(id);
          return next;
        });
        for (const id of added) {
          const existing = timersRef.current.get(id);
          if (existing !== undefined) clearTimeout(existing);
          const timer = setTimeout(() => {
            timersRef.current.delete(id);
            setShimmerIds((cur) => {
              if (!cur.has(id)) return cur;
              const next = new Set(cur);
              next.delete(id);
              return next;
            });
          }, SHIMMER_MS);
          timersRef.current.set(id, timer);
        }
      }
    }
    prevEventsRef.current = new Map(events.map((e) => [e.id, e]));
  }, [events, reducedMotion]);

  // Clear any in-flight shimmer timers on unmount (no dangling setState).
  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
    };
  }, []);

  // ── Honesty (§2.8) ───────────────────────────────────────────────────────
  // Any non-"connected" state (not_connected | expired) → the darkened nudge;
  // the panel never OAuths. Connected + no rows → the quiet empty aside.
  const panelStatus: "ready" | "empty" | "disconnected" =
    status !== "connected" ? "disconnected" : totalRows === 0 ? "empty" : "ready";

  const todayCount = today.allDay.length + today.timed.length;

  // ── Row-cap budget: today first, tomorrow with the remainder (§W-09) ──────
  const todayTimedVisible = today.timed.slice(0, PANEL_ROW_CAP);
  const remainingBudget = PANEL_ROW_CAP - todayTimedVisible.length;
  const tomorrowTimedVisible = tomorrow.timed.slice(
    0,
    Math.max(0, remainingBudget),
  );
  const timedOverflow =
    today.timed.length -
    todayTimedVisible.length +
    (tomorrow.timed.length - tomorrowTimedVisible.length);

  const hasToday = today.allDay.length > 0 || todayTimedVisible.length > 0;
  const hasTomorrow =
    tomorrow.allDay.length > 0 || tomorrowTimedVisible.length > 0;

  return (
    <WorldPanel
      widgetId="agenda"
      title="Agenda"
      countChip={
        panelStatus === "ready" && todayCount > 0
          ? `${todayCount} today`
          : undefined
      }
      status={panelStatus}
      emptyLine="The calendar is clear."
      disconnectedLine="The agenda is dark. Connect Google Calendar on the Page."
      focused={focused}
      lod={lod}
      slot={slot}
      dragHandleProps={dragHandleProps}
    >
      {hasToday ? (
        <SectionHeader label="Today" />
      ) : null}
      {hasToday
        ? renderAllDay(today.allDay, shimmerIds)
        : null}
      {hasToday
        ? todayTimedVisible.map((row) =>
            renderTimedRow(row, nowMs, shimmerIds.has(row.ev.id)),
          )
        : null}

      {hasTomorrow ? <SectionHeader label="Tomorrow" /> : null}
      {hasTomorrow ? renderAllDay(tomorrow.allDay, shimmerIds) : null}
      {hasTomorrow
        ? tomorrowTimedVisible.map((row) =>
            renderTimedRow(row, nowMs, shimmerIds.has(row.ev.id)),
          )
        : null}

      {timedOverflow > 0 ? (
        <Container paddingY={6}>
          <Text
            fontSize={9}
            letterSpacing={0.5}
            color={STUDIOLO.parchment}
            opacity={0.5}
          >
            {`and ${timedOverflow} more`}
          </Text>
        </Container>
      ) : null}
    </WorldPanel>
  );
}

// ── Section header — a small brass caption (uikit default font) ──────────────
function SectionHeader({ label }: { label: string }): JSX.Element {
  return (
    <Container paddingTop={8} paddingBottom={2}>
      <Text
        fontSize={10}
        letterSpacing={1.5}
        color={STUDIOLO.brass}
        opacity={0.75}
      >
        {label}
      </Text>
    </Container>
  );
}

// ── All-day banners (cap 3, "+N" overflow) ───────────────────────────────────
function renderAllDay(
  rows: AllDayRow[],
  shimmerIds: Set<string>,
): JSX.Element[] {
  const visible = rows.slice(0, ALLDAY_CAP);
  const overflow = rows.length - visible.length;
  const out = visible.map((row) => {
    const shimmering = shimmerIds.has(row.ev.id);
    const accentColor = shimmering
      ? (row.accentHue ?? STUDIOLO.candleflame)
      : row.accentHue;
    return (
      <Container
        key={row.ev.id}
        flexDirection="row"
        alignItems="center"
        gap={8}
        paddingY={4}
        paddingX={6}
        borderRadius={6}
        borderWidth={1}
        borderColor={accentColor ?? STUDIOLO.brass}
        opacity={shimmering ? 1 : 0.85}
      >
        <Container
          width={7}
          height={7}
          borderRadius={4}
          backgroundColor={row.dotColor}
        />
        <Container flexGrow={1} flexShrink={1}>
          <Text fontSize={12} color={STUDIOLO.parchment}>
            {row.ev.title}
          </Text>
        </Container>
        <Text
          fontSize={8}
          letterSpacing={1}
          color={STUDIOLO.brass}
          opacity={0.7}
        >
          ALL DAY
        </Text>
      </Container>
    );
  });
  if (overflow > 0) {
    out.push(
      <Container key="allday-overflow" paddingY={2} paddingX={6}>
        <Text
          fontSize={9}
          letterSpacing={0.5}
          color={STUDIOLO.parchment}
          opacity={0.5}
        >
          {`+${overflow} more all-day`}
        </Text>
      </Container>,
    );
  }
  return out;
}

// ── A timed row — accent strip + time range + title + calendar dot ───────────
function renderTimedRow(
  row: TimedRow,
  nowMs: number,
  shimmering: boolean,
): JSX.Element {
  const timing: EventTiming = classifyEvent(
    { startMs: row.startMs, endMs: row.endMs },
    nowMs,
  );
  const past = timing === "past";

  // Accent: area hue when linked; candleflame when current; the accent "lifts"
  // (wider + full opacity) when imminent or shimmering. Unlinked/settled → none.
  let accentColor: string | null = row.accentHue;
  let accentOpacity = past ? 0.35 : 0.85;
  let lifted = false;
  if (timing === "current") {
    accentColor = STUDIOLO.candleflame;
    accentOpacity = 1;
  } else if (timing === "imminent") {
    lifted = true;
    accentOpacity = 1;
    if (accentColor === null) accentColor = STUDIOLO.candleflame;
  }
  if (shimmering) {
    lifted = true;
    accentOpacity = 1;
    if (accentColor === null) accentColor = STUDIOLO.candleflame;
  }
  const accentWidth = accentColor !== null && lifted ? ACCENT_W_LIFTED : ACCENT_W;

  const baseOpacity = past
    ? 0.42
    : timing === "current"
      ? 1
      : timing === "imminent"
        ? 0.95
        : 0.85;
  const rowOpacity = shimmering ? 1 : baseOpacity;

  return (
    <Container
      key={row.ev.id}
      flexDirection="row"
      alignItems="stretch"
      gap={8}
      paddingY={6}
      borderBottomWidth={1}
      borderColor={STUDIOLO.sepiaInk}
      opacity={rowOpacity}
    >
      {/* The left accent strip (a colored bar — uikit has ONE borderColor per
          element, so the area-hue/current/imminent accent is its own child, not
          a border side). Invisible-but-present when there's no accent, so titles
          stay aligned. */}
      <Container
        width={accentWidth}
        borderRadius={2}
        backgroundColor={accentColor ?? STUDIOLO.sepiaInk}
        opacity={accentColor !== null ? accentOpacity : 0}
      />
      <Container flexDirection="column" flexGrow={1} flexShrink={1} gap={2}>
        <Container flexDirection="row" alignItems="center" gap={6}>
          <Container
            width={7}
            height={7}
            borderRadius={4}
            backgroundColor={row.dotColor}
          />
          <Text
            fontSize={10}
            letterSpacing={0.5}
            color={STUDIOLO.brass}
            opacity={past ? 0.6 : 0.8}
          >
            {row.range}
          </Text>
        </Container>
        <Text
          fontSize={13}
          color={past ? STUDIOLO.sepiaInk : STUDIOLO.parchment}
        >
          {row.ev.title}
        </Text>
      </Container>
    </Container>
  );
}

export default AgendaWidget;
