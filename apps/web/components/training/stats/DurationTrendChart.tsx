"use client";

import { useMemo } from "react";
import {
  addWeeks,
  format,
  parseISO,
  startOfWeek,
} from "date-fns";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { ActivityWithType } from "@/lib/db/queries/training";

interface Props {
  activities: ActivityWithType[];
  windowLabel: string;
  /** Number of weekly buckets to render. Defaults to 12. */
  weeks?: number;
}

// Craft plate (jul-29). `.craft-card` is unlayered and owns fill, hairline and
// shadow, so no `bg-*` utility rides along. `tint-mint` is the training hue,
// consumed by the bars below.
const TILE = "craft-card tint-mint rounded-2xl p-5";

/**
 * Weekly duration bar chart (TRN-11) — at least one over-time chart per
 * D-13, and explicitly NOT a pie chart.
 *
 * Buckets completed activities into the last N ISO-weeks (Mon-starting),
 * sums `actualDurationMin ?? plannedDurationMin` per bucket, and renders
 * a CSS-flexbox bar chart. No chart library — the design needs to mesh
 * with the journal-paper tokens exactly, and 80 LOC keeps that control.
 */
export function DurationTrendChart({
  activities,
  windowLabel,
  weeks = 12,
}: Props) {
  const buckets = useMemo(() => {
    // Build [weeks] buckets ending on the current week (Mon).
    const out: { weekStart: Date; min: number; label: string }[] = [];
    const thisWeekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
    for (let i = weeks - 1; i >= 0; i--) {
      const ws = addWeeks(thisWeekStart, -i);
      out.push({ weekStart: ws, min: 0, label: format(ws, "MMM d") });
    }

    // Index by ISO yyyy-MM-dd of week start for O(1) lookup.
    const idx = new Map<string, number>();
    for (let i = 0; i < out.length; i++) {
      idx.set(format(out[i]!.weekStart, "yyyy-MM-dd"), i);
    }

    for (const a of activities) {
      if (a.status !== "done") continue;
      let d: Date;
      try {
        d = parseISO(a.scheduledDate);
      } catch {
        continue;
      }
      const ws = format(startOfWeek(d, { weekStartsOn: 1 }), "yyyy-MM-dd");
      const i = idx.get(ws);
      if (i == null) continue;
      out[i]!.min += a.actualDurationMin ?? a.plannedDurationMin ?? 0;
    }

    return out;
  }, [activities, weeks]);

  const maxMin = Math.max(1, ...buckets.map((b) => b.min));
  const totalMin = buckets.reduce((acc, b) => acc + b.min, 0);

  return (
    <div className={TILE}>
      <div className="flex items-baseline justify-between">
        <h3 className="text-micro text-[var(--sd-ink-faint)]">
          Duration trend · last {weeks} weeks
        </h3>
        <span className="text-micro tabular-nums text-[var(--sd-ink-dull)]">
          {formatMinutes(totalMin)} · {windowLabel} aware
        </span>
      </div>

      <TooltipProvider delayDuration={120}>
        <div className="mt-3 flex h-32 items-end gap-1.5">
          {buckets.map((b, i) => {
            const pct = b.min === 0 ? 0 : (b.min / maxMin) * 100;
            return (
              <Tooltip key={i}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label={`Week of ${b.label}: ${formatMinutes(b.min)}`}
                    className="group flex flex-1 flex-col justify-end"
                  >
                    {/* Static height (layout, never animated); only the fill
                        colour transitions on hover. Pastel body, saturated rim
                        — the craft register's candy edge, applied to a bar. */}
                    <div
                      className="w-full rounded-md border border-[var(--tint-edge)] bg-[var(--tint-bg)] transition-colors duration-[160ms] ease-out group-hover:bg-[var(--tint-edge)]"
                      style={{
                        height: `${Math.max(pct, b.min > 0 ? 3 : 0)}%`,
                        minHeight: b.min > 0 ? 2 : 0,
                      }}
                    />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="font-mono text-micro">
                  Week of {b.label} — {formatMinutes(b.min)}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      </TooltipProvider>

      <div className="mt-1.5 flex gap-1.5">
        {buckets.map((b, i) => (
          <span
            key={i}
            className="flex-1 truncate text-center text-micro text-[var(--sd-ink-faint)]"
          >
            {/* Show every 2nd label so they don't crowd */}
            {i % 2 === 0 ? b.label : ""}
          </span>
        ))}
      </div>
    </div>
  );
}

function formatMinutes(min: number): string {
  if (min === 0) return "0m";
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}
