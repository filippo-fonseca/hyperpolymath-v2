"use client";

import { eachDayOfInterval, format, subDays, getDay } from "date-fns";
import type { DailyAdherence } from "@/lib/nutrition/nutrition-service";

// ---------------------------------------------------------------------------
// Level color — 5-level adherence encoding per UI-SPEC Heat Map Color Scale
// ---------------------------------------------------------------------------

function levelColor(level: 0 | 1 | 2 | 3 | 4): string {
  // Single-hue cyan ramp from the empty --sd-hover track up to the --sd-accent.
  return [
    "var(--sd-hover)",
    "oklch(30% 0.08 210)",
    "oklch(45% 0.13 210)",
    "oklch(60% 0.18 210)",
    "var(--sd-accent)",
  ][level];
}

// ---------------------------------------------------------------------------
// NutritionHeatMap — CSS-grid 52w × 7d heat map (GitHub-style, Sunday top)
// ---------------------------------------------------------------------------

interface NutritionHeatMapProps {
  data: DailyAdherence[];
}

export function NutritionHeatMap({ data }: NutritionHeatMapProps) {
  const isEmpty = data.every((d) => d.kcal === 0);

  if (isEmpty) {
    return (
      <div className="flex flex-col gap-2 py-4 text-center">
        <p className="text-micro text-[var(--sd-ink-faint)]">
          No Logs Yet
        </p>
        <p className="text-meta text-[var(--sd-ink-dull)]">
          Your history will appear here as you log meals.
        </p>
      </div>
    );
  }

  // Build a full year array: startDay is 364 days ago, endDay is today
  const today = new Date();
  const startDay = subDays(today, 364);

  // eachDayOfInterval gives us all 365 days in order
  const allDays = eachDayOfInterval({ start: startDay, end: today });

  // Build a date → adherence map for O(1) lookup
  const byDate = new Map(data.map((d) => [d.date, d]));

  // Sunday = 0, Monday = 1, ... Saturday = 6
  // We want the grid to start on Sunday (top-left cell of first column)
  // The first day of our range may not be a Sunday, so pad with empty cells
  const firstDayOfWeek = getDay(startDay); // 0 = Sun

  return (
    <div
      role="img"
      aria-label="Nutrition logging history for the past year"
      className="overflow-x-auto"
    >
      {/* Day-of-week labels (Mon, Wed, Fri to avoid crowding) */}
      <div className="mb-1 flex gap-[2px]" style={{ paddingLeft: `${10 + 2}px` }}>
        {/* Empty offset for day labels alignment */}
        <div style={{ width: 10 * firstDayOfWeek + 2 * firstDayOfWeek }} />
        <span
          className="font-mono text-micro text-[var(--sd-ink-faint)]"
          style={{ lineHeight: "10px" }}
        />
      </div>

      {/* Heat map grid — grid-flow-col so days fill top-to-bottom, left-to-right */}
      <div
        className="grid grid-flow-col gap-[2px]"
        style={{
          gridTemplateRows: "repeat(7, 10px)",
          gridAutoColumns: "10px",
        }}
      >
        {/* Leading empty cells to align week-start to Sunday */}
        {Array.from({ length: firstDayOfWeek }).map((_, i) => (
          <div key={`pad-${i}`} style={{ width: 10, height: 10 }} />
        ))}

        {/* One cell per day */}
        {allDays.map((day) => {
          const dateStr = format(day, "yyyy-MM-dd");
          const entry = byDate.get(dateStr);
          const level = entry?.level ?? 0;
          const kcal = entry?.kcal ?? 0;
          const targetKcal = entry?.targetKcal ?? 2000;
          const pct = Math.round((kcal / Math.max(1, targetKcal)) * 100);
          const tooltipLabel = `${dateStr} — ${kcal} kcal (${pct}% of target)`;

          return (
            <div
              key={dateStr}
              className="rounded-[2px]"
              style={{
                width: 10,
                height: 10,
                backgroundColor: levelColor(level),
                border: level === 0 ? "1px solid var(--sd-line)" : undefined,
              }}
              role="img"
              aria-label={`${dateStr}: ${kcal} kcal`}
              title={tooltipLabel}
            />
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-3 flex items-center gap-2">
        <span className="font-mono text-micro text-[var(--sd-ink-faint)]">Less</span>
        {([0, 1, 2, 3, 4] as const).map((lvl) => (
          <div
            key={lvl}
            className="rounded-[2px]"
            style={{
              width: 10,
              height: 10,
              backgroundColor: levelColor(lvl),
              border: lvl === 0 ? "1px solid var(--sd-line)" : undefined,
            }}
          />
        ))}
        <span className="font-mono text-micro text-[var(--sd-ink-faint)]">More</span>
      </div>
    </div>
  );
}
