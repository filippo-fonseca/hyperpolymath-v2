"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  endOfMonth,
  endOfWeek,
  format,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { listAllActivities } from "@/app/actions/training";
import { Button } from "@/components/ui/button";
import { TrainingIcon } from "@/components/ui/icons";
import { tableKey } from "@/lib/realtime/query-keys";
import { useTableSubscription } from "@/lib/realtime/useTableSubscription";
import type {
  ActivityWithType,
  BatchRow,
  TypeWithBatch,
} from "@/lib/db/queries/training";
import type { DistanceUnit } from "@/lib/training/distance";
import { AdherenceCard } from "./AdherenceCard";
import { BatchTotalsTable } from "./BatchTotalsTable";
import { DurationTrendChart } from "./DurationTrendChart";
import { TimeWindowToggle, type StatsWindow } from "./TimeWindowToggle";
import { TrainingHeatmap } from "./TrainingHeatmap";

interface Props {
  userId: string;
  initialActivities: ActivityWithType[];
  initialTypes: TypeWithBatch[];
  initialBatches: BatchRow[];
  distanceUnit: DistanceUnit;
}

// sd plate — shipped .sd-panel primitive (UI-CONTRACT §0). No glass/blur/glow.
const TILE = "sd-panel overflow-x-auto p-4";

/**
 * /training/stats orchestrator (TRN-09 / TRN-10 / TRN-11).
 *
 * Pattern (CLAUDE.md Critical Patterns 1 + 3):
 *   - Single all-time `useQuery` keyed `["training_activities", userId, "all"]`,
 *     hydrated from SSR; the heatmap consumes the full array, supporting
 *     cards consume an in-memory time-window filter.
 *   - Three `useTableSubscription` mounts mirror TrainingClient — activities,
 *     types (with cross-key fanout into activities so a color change
 *     repaints the heatmap), batches (fanout into types so a batch rename
 *     re-groups the totals table).
 *   - Realtime payloads are NEVER merged into the query cache directly —
 *     we only call `invalidateQueries` via the hook (Critical Pattern 3).
 *
 * The heatmap stays a fixed 12-month view regardless of toggle — D-12 makes
 * it a permanent visual anchor. Only the supporting cards re-aggregate.
 */
export function TrainingStatsClient({
  userId,
  initialActivities,
  initialTypes,
  initialBatches,
  distanceUnit,
}: Props) {
  const [window, setWindow] = useState<StatsWindow>("month");

  // Realtime subscriptions — same shape as TrainingClient.
  useTableSubscription("training_activities", userId);
  useTableSubscription("training_activity_types", userId, {
    alsoInvalidate: [["training_activities", userId]],
  });
  useTableSubscription("training_batches", userId, {
    alsoInvalidate: [["training_activity_types", userId]],
  });

  // All-time activities — single source of truth for everything on this page.
  const { data: activities = initialActivities } = useQuery<
    ActivityWithType[]
  >({
    queryKey: ["training_activities", userId, "all"] as const,
    queryFn: () => listAllActivities(),
    initialData: initialActivities,
  });

  // Types + batches — same key shape as TrainingClient so realtime fanout works.
  const { data: types = initialTypes } = useQuery<TypeWithBatch[]>({
    queryKey: tableKey("training_activity_types", userId),
    queryFn: async () => initialTypes,
    initialData: initialTypes,
  });
  const { data: batches = initialBatches } = useQuery<BatchRow[]>({
    queryKey: tableKey("training_batches", userId),
    queryFn: async () => initialBatches,
    initialData: initialBatches,
  });

  // In-memory time-window filter (week / month / all). The heatmap ignores
  // this; only the cards below it consume `filteredActivities`.
  const filteredActivities = useMemo(() => {
    if (window === "all") return activities;
    const now = new Date();
    const [from, to] =
      window === "week"
        ? [
            startOfWeek(now, { weekStartsOn: 1 }),
            endOfWeek(now, { weekStartsOn: 1 }),
          ]
        : [startOfMonth(now), endOfMonth(now)];
    return activities.filter((a) => {
      try {
        const d = parseISO(a.scheduledDate);
        return d >= from && d <= to;
      } catch {
        return false;
      }
    });
  }, [activities, window]);

  const windowLabel =
    window === "all"
      ? "All time"
      : window === "week"
        ? `Week of ${format(startOfWeek(new Date(), { weekStartsOn: 1 }), "MMM d")}`
        : format(new Date(), "MMMM yyyy");

  return (
    <div className="mx-auto flex h-full w-full max-w-[1400px] flex-col gap-5 px-4 py-4">
      {/* Title row — dimensional training icon + mono eyebrow (§7/§8). */}
      <div className="flex items-center justify-between gap-4 px-1">
        <div className="flex items-center gap-3">
          <Button
            asChild
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 px-2 font-mono text-[11px] uppercase tracking-[0.06em]"
          >
            <Link href="/training" aria-label="Back to planner">
              <ArrowLeft size={13} strokeWidth={1.5} />
              Planner
            </Link>
          </Button>
          <span aria-hidden className="h-5 w-px bg-[var(--sd-line)]" />
          <TrainingIcon size={28} />
          <div className="flex flex-col gap-0.5">
            <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--sd-ink-faint)]">
              Training
            </span>
            <h1 className="text-[20px] font-semibold leading-none tracking-[-0.01em] text-[var(--sd-ink)]">
              Stats
            </h1>
          </div>
        </div>
        <TimeWindowToggle value={window} onChange={setWindow} />
      </div>

      {/* Headline number — adherence for the chosen window */}
      <AdherenceCard
        activities={filteredActivities}
        windowLabel={windowLabel}
      />

      {/* The headline visual — 12 months regardless of window toggle */}
      <div className={TILE}>
        <div className="flex items-baseline justify-between pb-3">
          <h3 className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--sd-ink-faint)]">
            Last 12 months · blended day colors
          </h3>
          <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--sd-ink-faint)]">
            hover · click for breakdown
          </span>
        </div>
        <TrainingHeatmap
          activities={activities}
          distanceUnit={distanceUnit}
        />
      </div>

      {/* Two-column supporting cards */}
      <div className="grid gap-5 @2xl/main:grid-cols-2">
        <BatchTotalsTable
          activities={filteredActivities}
          types={types}
          batches={batches}
          distanceUnit={distanceUnit}
          windowLabel={windowLabel}
        />
        <DurationTrendChart
          activities={filteredActivities}
          windowLabel={windowLabel}
        />
      </div>

    </div>
  );
}
