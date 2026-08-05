"use client";

import { useMemo } from "react";
import { Dumbbell } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import type {
  ActivityWithType,
  BatchRow,
  TypeWithBatch,
} from "@/lib/db/queries/training";
import {
  type DistanceUnit,
  formatDistance,
} from "@/lib/training/distance";
import { typeFill } from "../type-color";

interface Props {
  activities: ActivityWithType[];
  types: TypeWithBatch[];
  batches: BatchRow[];
  distanceUnit: DistanceUnit;
  windowLabel: string;
}

// Craft plate (jul-29). `.craft-card` is unlayered and owns fill, hairline and
// shadow — never pair a `bg-*` utility with it on the same element.
const TILE = "craft-card rounded-2xl p-5";

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
 * "Ungrouped"section at the bottom.
 *
 * - "Done"minutes use `actualDurationMin ?? plannedDurationMin` for status
 *   = done (the realistic figure for retrospective stats).
 * - "Planned"minutes are the still-outstanding planned time (status =
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
        <h3 className="text-micro text-[var(--sd-ink-faint)]">
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
          // Shared empty state on the training hue.
          <EmptyState
            className="tint-mint"
            icon={<Dumbbell />}
            title="No activity types defined yet."
            description="Add a type from the planner's Manage types sheet and its totals will land here."
          />
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
      <div className="flex items-baseline justify-between border-b border-[var(--edge)] pb-1">
        <span
          className={
            muted
              ?"text-micro text-[var(--sd-ink-faint)]"
              : "text-sm font-semibold tracking-[-0.01em] text-[var(--sd-ink)]"
          }
        >
          {title}
        </span>
        <span className="text-micro tabular-nums text-[var(--sd-ink-dull)]">
          {formatMinutes(totalDone)}
          {hasAnyDistance && totalKm > 0 && (
            <> · {formatDistance(totalKm, distanceUnit)}</>
          )}
        </span>
      </div>
      {typeAggs.length === 0 ? (
        <div className="mt-1 text-micro text-[var(--sd-ink-faint)]">
          No types in this batch.
        </div>
      ) : (
        <ul className="mt-1.5 flex flex-col gap-1">
          {typeAggs.map((t) => (
            <li
              key={t.typeId}
              className="flex items-center justify-between gap-3 rounded-lg px-1.5 py-1 transition-colors duration-[160ms] ease-out hover:bg-[var(--hover)]"
            >
              <span className="flex min-w-0 items-center gap-2">
                {/* The type's colour softened to a plate, saturated only on
                    the dot inside it. */}
                <span
                  aria-hidden="true"
                  className="flex size-4 shrink-0 items-center justify-center rounded-md"
                  style={{ backgroundColor: typeFill(t.color) }}
                >
                  <span
                    className="size-1.5 rounded-full"
                    style={{ backgroundColor: t.color }}
                  />
                </span>
                <span className="truncate text-meta text-[var(--sd-ink)]">
                  {t.name}
                </span>
              </span>
              <span className="flex items-baseline gap-2 text-micro tabular-nums text-[var(--sd-ink-dull)]">
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
