"use client";

import { useMemo } from "react";
import type {
  ActivityWithType,
  BatchRow,
  TypeWithBatch,
} from "@/lib/db/queries/training";
import {
  type DistanceUnit,
  formatDistance,
} from "@/lib/training/distance";

interface Props {
  activities: ActivityWithType[];
  types: TypeWithBatch[];
  batches: BatchRow[];
  distanceUnit: DistanceUnit;
  windowLabel: string;
}

// Glassy pill tile — mirrors /settings PROFILE pill (translucent surface,
// backdrop blur, inset cyan glow, thin cyan-tinged border, soft outer halo).
const TILE =
  "rounded-xl backdrop-blur-md p-4 " +
  "bg-[color-mix(in_oklch,var(--surface)_82%,transparent)] " +
  "border border-[color-mix(in_oklch,var(--edge)_55%,transparent)] " +
  "shadow-[inset_0_1px_0_color-mix(in_oklch,white_12%,transparent),inset_0_-1px_0_color-mix(in_oklch,var(--ink)_10%,transparent),inset_0_0_24px_color-mix(in_oklch,var(--hud-cyan)_6%,transparent),0_10px_32px_color-mix(in_oklch,var(--ink)_22%,transparent),0_2px_6px_color-mix(in_oklch,var(--ink)_10%,transparent)] " +
  "hover:border-[color-mix(in_oklch,var(--hud-cyan)_45%,transparent)] " +
  "hover:shadow-[inset_0_1px_0_color-mix(in_oklch,white_16%,transparent),inset_0_-1px_0_color-mix(in_oklch,var(--ink)_12%,transparent),inset_0_0_32px_color-mix(in_oklch,var(--hud-cyan)_12%,transparent),0_14px_40px_color-mix(in_oklch,var(--ink)_30%,transparent),0_2px_8px_color-mix(in_oklch,var(--ink)_14%,transparent)] " +
  "transition-[border-color,box-shadow,background-color] duration-200 ease-out";

interface TypeAgg {
  typeId: string;
  name: string;
  color: string;
  hasDistance: boolean;
  doneMin: number;
  plannedMin: number;
  doneKm: number;
}

/**
 * Per-batch totals (TRN-11): each user-defined batch renders as a section
 * with per-type duration + distance rows. Ungrouped types fall under an
 * "Ungrouped" section at the bottom.
 *
 * - "Done" minutes use `actualDurationMin ?? plannedDurationMin` for status
 *   = done (the realistic figure for retrospective stats).
 * - "Planned" minutes are the still-outstanding planned time (status =
 *   planned) so the user can see commitment vs accomplishment.
 * - Distance only renders for types with `hasDistance` and only sums
 *   actuals on done activities (km is canonical — formatDistance converts).
 *
 * Batches are rendered in user-defined `orderIndex` (D-05).
 */
export function BatchTotalsTable({
  activities,
  types,
  batches,
  distanceUnit,
  windowLabel,
}: Props) {
  const { byBatch, ungrouped } = useMemo(() => {
    // Seed an aggregate row per type so empty types still render zeros
    // (so the user sees the full surface they've defined, not a sparse list).
    const seed = new Map<string, TypeAgg>();
    for (const t of types) {
      seed.set(t.id, {
        typeId: t.id,
        name: t.name,
        color: t.color,
        hasDistance: t.hasDistance,
        doneMin: 0,
        plannedMin: 0,
        doneKm: 0,
      });
    }
    for (const a of activities) {
      const agg = seed.get(a.type.id);
      if (!agg) continue; // archived type — skip
      if (a.status === "done") {
        agg.doneMin += a.actualDurationMin ?? a.plannedDurationMin ?? 0;
        if (a.type.hasDistance) {
          const d =
            a.actualDistanceKm != null
              ? Number(a.actualDistanceKm)
              : a.plannedDistanceKm != null
                ? Number(a.plannedDistanceKm)
                : 0;
          agg.doneKm += d;
        }
      } else if (a.status === "planned") {
        agg.plannedMin += a.plannedDurationMin ?? 0;
      }
    }

    const typeByBatch = new Map<string, TypeAgg[]>();
    const ungrouped: TypeAgg[] = [];
    for (const t of types) {
      const agg = seed.get(t.id)!;
      if (t.batchId) {
        const arr = typeByBatch.get(t.batchId) ?? [];
        arr.push(agg);
        typeByBatch.set(t.batchId, arr);
      } else {
        ungrouped.push(agg);
      }
    }

    const byBatch = batches.map((b) => ({
      batch: b,
      typeAggs: typeByBatch.get(b.id) ?? [],
    }));
    return { byBatch, ungrouped };
  }, [activities, types, batches]);

  return (
    <div className={TILE}>
      <div className="flex items-baseline justify-between">
        <h3 className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--ink-muted)]">
          By batch · {windowLabel}
        </h3>
      </div>

      <div className="mt-3 flex flex-col gap-5">
        {byBatch.map(({ batch, typeAggs }) => (
          <BatchSection
            key={batch.id}
            title={batch.name}
            typeAggs={typeAggs}
            distanceUnit={distanceUnit}
          />
        ))}
        {ungrouped.length > 0 && (
          <BatchSection
            title="Ungrouped"
            typeAggs={ungrouped}
            distanceUnit={distanceUnit}
            muted
          />
        )}
        {byBatch.length === 0 && ungrouped.length === 0 && (
          <div className="font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--ink-muted)]">
            No activity types defined yet.
          </div>
        )}
      </div>
    </div>
  );
}

function BatchSection({
  title,
  typeAggs,
  distanceUnit,
  muted,
}: {
  title: string;
  typeAggs: TypeAgg[];
  distanceUnit: DistanceUnit;
  muted?: boolean;
}) {
  const totalDone = typeAggs.reduce((acc, t) => acc + t.doneMin, 0);
  const totalKm = typeAggs.reduce((acc, t) => acc + t.doneKm, 0);
  const hasAnyDistance = typeAggs.some((t) => t.hasDistance);

  return (
    <div>
      <div className="flex items-baseline justify-between border-b border-[var(--edge)]/60 pb-1">
        <span
          className={
            muted
              ? "font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ink-muted)]"
              : "font-serif text-sm text-[var(--ink)]"
          }
        >
          {title}
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.06em] tabular-nums text-[var(--ink-muted)]">
          {formatMinutes(totalDone)}
          {hasAnyDistance && totalKm > 0 && (
            <> · {formatDistance(totalKm, distanceUnit)}</>
          )}
        </span>
      </div>
      {typeAggs.length === 0 ? (
        <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--ink-muted)]">
          No types in this batch.
        </div>
      ) : (
        <ul className="mt-1.5 flex flex-col gap-1">
          {typeAggs.map((t) => (
            <li
              key={t.typeId}
              className="flex items-baseline justify-between gap-3 py-0.5"
            >
              <span className="flex items-center gap-2 min-w-0">
                <span
                  aria-hidden="true"
                  className="inline-block h-2 w-2 shrink-0 rounded-sm"
                  style={{ backgroundColor: t.color }}
                />
                <span className="truncate font-serif text-[13px] text-[var(--ink)]">
                  {t.name}
                </span>
              </span>
              <span className="flex items-baseline gap-2 font-mono text-[10px] uppercase tracking-[0.06em] tabular-nums text-[var(--ink-muted)]">
                <span>{formatMinutes(t.doneMin)}</span>
                {t.plannedMin > 0 && (
                  <span className="opacity-60">
                    (+{formatMinutes(t.plannedMin)} planned)
                  </span>
                )}
                {t.hasDistance && t.doneKm > 0 && (
                  <span>{formatDistance(t.doneKm, distanceUnit)}</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
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
