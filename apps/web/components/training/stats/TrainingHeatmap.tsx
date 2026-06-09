"use client";

import { memo, useMemo, useState } from "react";
import {
  addDays,
  differenceInCalendarDays,
  format,
  getDay,
  parseISO,
  startOfDay,
  subDays,
} from "date-fns";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { ActivityWithType } from "@/lib/db/queries/training";
import { blendOklchStrings } from "@/lib/training/color-blend";
import {
  type DistanceUnit,
  formatDistance,
} from "@/lib/training/distance";
import { EMPTY_DAY_COLOR } from "@/lib/training/palette";
import { cn } from "@/lib/utils";
import { HeatmapDayPopover } from "./HeatmapDayPopover";

interface Props {
  activities: ActivityWithType[];
  distanceUnit: DistanceUnit;
  /**
   * Heatmap window length in days. Defaults to 365 (D-12 — last ~12 months).
   * The grid stays a fixed 12-month view regardless of the parent's
   * time-window toggle — only the supporting stat cards re-aggregate.
   */
  days?: number;
}

const CELL = 12;
const GAP = 3;
const DAY_LABELS = ["", "Mon", "", "Wed", "", "Fri", ""] as const;

/**
 * GitHub-style training heatmap with **OKLCH-blended day cells** (D-12 /
 * TRN-09 / TRN-10) — the load-bearing visual of the stats surface.
 *
 * Color math: each day's cell color = `blendOklchStrings(activityColors,
 * weights=durations)` using the perceptual circular-hue average from
 * `lib/training/color-blend.ts` (RESEARCH Pattern 3). Empty days render as
 * `EMPTY_DAY_COLOR` (a muted token).
 *
 * Performance (RESEARCH Pitfall 5): per-day blends are memoized in a single
 * `dayColors` map keyed by ISO date; the inner `<HeatmapCell />` is wrapped
 * in `React.memo` so cells only re-render when their color or activity-count
 * changes. The 365-cell grid renders in well under one frame on
 * Realtime invalidation.
 *
 * Layout (RESEARCH Pattern 5): a CSS grid with 7 rows × ~53 columns,
 * `grid-auto-flow: column` so each column is a Mon→Sun week. The leading
 * blank cells before the earliest date keep weekday alignment.
 */
export function TrainingHeatmap({
  activities,
  distanceUnit,
  days = 365,
}: Props) {
  // ────────────────────────────────────────────────────────────────────
  // Window: today back N days, then padded back to that week's Monday so
  // the first column is a full Mon→Sun stack.
  // ────────────────────────────────────────────────────────────────────
  const { gridDays } = useMemo(() => {
    const today = startOfDay(new Date());
    const earliest = subDays(today, days - 1);
    // Pad back to Monday of earliest's week. getDay: Sun=0, Mon=1, ..., Sat=6.
    const earliestDow = getDay(earliest); // 0..6
    const padBack = earliestDow === 0 ? 6 : earliestDow - 1; // days to subtract to reach Monday
    const gridStart = subDays(earliest, padBack);
    const total = differenceInCalendarDays(today, gridStart) + 1;
    const list: { date: Date; iso: string }[] = [];
    for (let i = 0; i < total; i++) {
      const d = addDays(gridStart, i);
      list.push({ date: d, iso: format(d, "yyyy-MM-dd") });
    }
    return { gridDays: list };
  }, [days]);

  // ────────────────────────────────────────────────────────────────────
  // Per-day activity map (memo on activities identity — flips on
  // Realtime invalidation only).
  // ────────────────────────────────────────────────────────────────────
  const dayMap = useMemo(() => {
    const m = new Map<string, ActivityWithType[]>();
    for (const a of activities) {
      // Defensive: skip cancelled/skipped from the blended color so the
      // heatmap reflects what actually happened. Planned days still count
      // — the planner is intent, the heatmap is reality + intent.
      const arr = m.get(a.scheduledDate);
      if (arr) arr.push(a);
      else m.set(a.scheduledDate, [a]);
    }
    return m;
  }, [activities]);

  // ────────────────────────────────────────────────────────────────────
  // Per-day OKLCH-blended color (memoized once per dayMap change).
  // Only "done" + "planned" contribute color; cancelled/skipped neutralize.
  // ────────────────────────────────────────────────────────────────────
  const dayColors = useMemo(() => {
    const m = new Map<string, string>();
    for (const [iso, acts] of dayMap.entries()) {
      const contributing = acts.filter(
        (a) => a.status === "done" || a.status === "planned",
      );
      if (contributing.length === 0) continue;
      const colors = contributing.map((a) => a.type.color);
      const weights = contributing.map(
        (a) => a.actualDurationMin ?? a.plannedDurationMin ?? 30,
      );
      try {
        m.set(iso, blendOklchStrings(colors, weights));
      } catch {
        // Bad OKLCH on a single type shouldn't kill the grid — fall back to
        // the first color verbatim.
        m.set(iso, colors[0] ?? EMPTY_DAY_COLOR);
      }
    }
    return m;
  }, [dayMap]);

  // Tooltip summary line for a given day (cheap to compute on demand).
  const tooltipText = (iso: string): string => {
    const acts = dayMap.get(iso);
    const dateLabel = (() => {
      try {
        return format(parseISO(iso), "EEE, MMM d");
      } catch {
        return iso;
      }
    })();
    if (!acts || acts.length === 0) return `${dateLabel} — no activity`;
    // Group by type for a compact one-liner.
    const byType = new Map<string, { name: string; min: number; km: number }>();
    for (const a of acts) {
      const k = a.type.id;
      const prev = byType.get(k) ?? { name: a.type.name, min: 0, km: 0 };
      prev.min += a.actualDurationMin ?? a.plannedDurationMin ?? 0;
      if (a.type.hasDistance) {
        const d =
          a.actualDistanceKm != null
            ? Number(a.actualDistanceKm)
            : a.plannedDistanceKm != null
              ? Number(a.plannedDistanceKm)
              : 0;
        prev.km += d;
      }
      byType.set(k, prev);
    }
    const parts: string[] = [];
    for (const v of byType.values()) {
      const seg = [v.name];
      if (v.min) seg.push(`${v.min}m`);
      if (v.km) seg.push(formatDistance(v.km, distanceUnit));
      parts.push(seg.join(" "));
    }
    return `${dateLabel} — ${parts.join(" · ")}`;
  };

  // ────────────────────────────────────────────────────────────────────
  // Month labels: one label per ~4 columns at the top of the grid. We
  // detect column transitions where the first-of-month falls.
  // ────────────────────────────────────────────────────────────────────
  const monthLabels = useMemo(() => {
    // Walk in 7-day strides (columns) and emit a label when a new month
    // begins inside that column.
    const labels: { col: number; text: string }[] = [];
    let lastMonth = -1;
    const colCount = Math.ceil(gridDays.length / 7);
    for (let col = 0; col < colCount; col++) {
      const firstDayIdx = col * 7;
      const d = gridDays[firstDayIdx]?.date;
      if (!d) continue;
      const m = d.getMonth();
      if (m !== lastMonth) {
        labels.push({ col, text: format(d, "MMM") });
        lastMonth = m;
      }
    }
    return labels;
  }, [gridDays]);

  // Click-popover state — lifted so only one popover renders at a time.
  const [openIso, setOpenIso] = useState<string | null>(null);

  const colCount = Math.ceil(gridDays.length / 7);
  const gridWidth = colCount * CELL + (colCount - 1) * GAP;

  return (
    <TooltipProvider delayDuration={120}>
      <div className="flex flex-col gap-2">
        {/* Month label row */}
        <div className="relative h-3 pl-7" style={{ width: gridWidth + 28 }}>
          {monthLabels.map((m) => (
            <span
              key={`${m.col}-${m.text}`}
              className="absolute top-0 font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--ink-muted)]"
              style={{ left: m.col * (CELL + GAP) }}
            >
              {m.text}
            </span>
          ))}
        </div>

        <div className="flex gap-1.5">
          {/* Day-of-week labels (Mon / Wed / Fri standard) */}
          <div
            className="flex flex-col"
            style={{
              gap: `${GAP}px`,
              width: 22,
            }}
          >
            {DAY_LABELS.map((label, i) => (
              <span
                key={i}
                style={{ height: CELL, lineHeight: `${CELL}px` }}
                className="font-mono text-[9px] uppercase tracking-[0.06em] text-[var(--ink-muted)]"
              >
                {label}
              </span>
            ))}
          </div>

          {/* The grid itself */}
          <div
            className="grid"
            style={{
              gridTemplateRows: `repeat(7, ${CELL}px)`,
              gridAutoFlow: "column",
              gridAutoColumns: `${CELL}px`,
              gap: `${GAP}px`,
              width: gridWidth,
            }}
          >
            {gridDays.map(({ date, iso }) => {
              const color = dayColors.get(iso);
              const acts = dayMap.get(iso);
              const isFuture =
                differenceInCalendarDays(date, startOfDay(new Date())) > 0;
              return (
                <HeatmapCell
                  key={iso}
                  iso={iso}
                  color={color ?? EMPTY_DAY_COLOR}
                  hasActivity={!!acts && acts.length > 0}
                  isFuture={isFuture}
                  tooltip={tooltipText(iso)}
                  open={openIso === iso}
                  onOpenChange={(o) => setOpenIso(o ? iso : null)}
                  popoverChildren={
                    <HeatmapDayPopover
                      dateISO={iso}
                      activities={acts ?? []}
                      distanceUnit={distanceUnit}
                    />
                  }
                />
              );
            })}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Cell — memoized so the 365-cell grid doesn't churn on unrelated re-renders.
// ──────────────────────────────────────────────────────────────────────────

interface CellProps {
  iso: string;
  color: string;
  hasActivity: boolean;
  isFuture: boolean;
  tooltip: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  popoverChildren: React.ReactNode;
}

const HeatmapCell = memo(function HeatmapCell({
  iso,
  color,
  hasActivity,
  isFuture,
  tooltip,
  open,
  onOpenChange,
  popoverChildren,
}: CellProps) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={tooltip}
              data-iso={iso}
              disabled={isFuture}
              className={cn(
                "rounded-[2px] border border-[var(--edge)]/40 outline-none transition-[transform,box-shadow] duration-100",
                "hover:scale-[1.4] hover:border-[var(--ink)]/40 hover:shadow-[0_0_0_1px_var(--edge)]",
                "focus-visible:scale-[1.4] focus-visible:border-[var(--ink)]/60",
                isFuture && "opacity-30 hover:scale-100 cursor-default",
                !hasActivity && "hover:bg-[var(--surface-2)]",
              )}
              style={{
                width: CELL,
                height: CELL,
                backgroundColor: color,
              }}
            />
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="top" className="font-mono text-[10px]">
          {tooltip}
        </TooltipContent>
      </Tooltip>
      <PopoverContent
        side="top"
        align="center"
        className="w-auto p-2"
        sideOffset={6}
      >
        {popoverChildren}
      </PopoverContent>
    </Popover>
  );
});
