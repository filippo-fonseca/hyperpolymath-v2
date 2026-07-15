"use client";

import { format, parseISO } from "date-fns";
import type { ActivityWithType } from "@/lib/db/queries/training";
import {
  type DistanceUnit,
  formatDistance,
} from "@/lib/training/distance";

interface Props {
  dateISO: string;
  activities: ActivityWithType[];
  distanceUnit: DistanceUnit;
}

/**
 * Body content for the heatmap day-popover (D-12 / TRN-10).
 *
 * Renders the full day composition: each activity's color chip, title,
 * type name, duration, and (when applicable) distance — grouped by status
 * so "done" rises to the top.
 *
 * The Popover anchor + open state is owned by the parent (TrainingHeatmap)
 * so cell hover/click handling stays in one place.
 */
export function HeatmapDayPopover({
  dateISO,
  activities,
  distanceUnit,
}: Props) {
  const heading = (() => {
    try {
      return format(parseISO(dateISO), "EEE, MMM d, yyyy");
    } catch {
      return dateISO;
    }
  })();

  if (activities.length === 0) {
    return (
      <div className="min-w-[220px] p-1">
        <div className="text-sm font-semibold tracking-[-0.01em] text-[var(--sd-ink)]">{heading}</div>
        <div className="mt-2 font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--sd-ink-faint)]">
          No activities logged this day.
        </div>
      </div>
    );
  }

  // Status order: done first, then planned, then skipped/cancelled.
  const order: Record<string, number> = {
    done: 0,
    planned: 1,
    skipped: 2,
    cancelled: 3,
  };
  const sorted = [...activities].sort(
    (a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9),
  );

  return (
    <div className="min-w-[260px] max-w-[320px] p-1">
      <div className="flex items-baseline justify-between gap-3">
        <div className="text-sm font-semibold tracking-[-0.01em] text-[var(--sd-ink)]">{heading}</div>
        <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--sd-ink-faint)]">
          {activities.length}{" "}
          {activities.length === 1 ? "activity" : "activities"}
        </div>
      </div>

      <ul className="mt-2 flex flex-col gap-1.5">
        {sorted.map((a) => {
          const dur = a.actualDurationMin ?? a.plannedDurationMin ?? null;
          const dist = a.type.hasDistance
            ? a.actualDistanceKm != null
              ? Number(a.actualDistanceKm)
              : a.plannedDistanceKm != null
                ? Number(a.plannedDistanceKm)
                : null
            : null;

          return (
            <li
              key={a.id}
              className="flex items-start gap-2 rounded-sm px-1.5 py-1 hover:bg-[var(--sd-hover)]"
            >
              <span
                aria-hidden="true"
                className="mt-1 inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
                style={{ backgroundColor: a.type.color }}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-[13px] text-[var(--sd-ink)]">
                    {a.title}
                  </span>
                  {a.status !== "done" && a.status !== "planned" && (
                    <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--sd-ink-faint)]">
                      {a.status}
                    </span>
                  )}
                </div>
                <div className="mt-0.5 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--sd-ink-dull)]">
                  <span>{a.type.name}</span>
                  {dur != null && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>{dur} min</span>
                    </>
                  )}
                  {dist != null && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>{formatDistance(dist, distanceUnit)}</span>
                    </>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
