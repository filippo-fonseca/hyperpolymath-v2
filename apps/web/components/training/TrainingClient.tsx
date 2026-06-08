"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { isSameWeek, startOfWeek } from "date-fns";
import { listActivitiesInRange } from "@/app/actions/training";
import { tableKey } from "@/lib/realtime/query-keys";
import { useTableSubscription } from "@/lib/realtime/useTableSubscription";
import { addWeeks, getWeekRange } from "@/lib/training/week";
import type {
  ActivityWithType,
  BatchRow,
  TypeWithBatch,
} from "@/lib/db/queries/training";
import type { DistanceUnit } from "@/lib/training/distance";
import { ActivityEditDialog } from "./ActivityEditDialog";
import { CompleteActivityDialog } from "./CompleteActivityDialog";
import { ManageTypesSheet } from "./ManageTypesSheet";
import { PlannerHeader } from "./PlannerHeader";
import { TrainingBoard } from "./TrainingBoard";

interface Props {
  userId: string;
  initialActivities: ActivityWithType[];
  initialTypes: TypeWithBatch[];
  initialBatches: BatchRow[];
  distanceUnit: DistanceUnit;
}

/**
 * /training orchestrator — mirrors TasksClient + HabitsClient.
 *
 * Pattern (CLAUDE.md Critical Patterns 1 + 3):
 *   1. `useQuery({ queryKey: ["training_activities", userId, startISO, endISO], initialData })`
 *      — TanStack Query owns the canonical week cache, hydrated from SSR.
 *   2. Three `useTableSubscription` mounts — activities; types (with
 *      cross-key fanout into activities so a color change repaints the board);
 *      batches (fanout into types so a batch rename re-groups the sheet).
 *   3. Realtime fires → `invalidateQueries(tableKey(table, userId))` →
 *      partial-key match invalidates every windowed key under the same
 *      `[table, userId]` prefix. Realtime payloads are NEVER merged into the
 *      query cache directly (Critical Pattern 3 — invalidate-only).
 *
 * Manage-Types Sheet open state is lifted here per RESEARCH Pitfall 8 (so
 * Realtime invalidations refetch underlying data without toggling the sheet
 * closed mid-edit). The sheet body itself ships in plan 15-04 — for now the
 * boolean exists so first-time empty-types still auto-opens it (D-07).
 */
export function TrainingClient({
  userId,
  initialActivities,
  initialTypes,
  initialBatches,
  distanceUnit,
}: Props) {
  const [currentWeek, setCurrentWeek] = useState<Date>(() => new Date());
  const week = useMemo(() => getWeekRange(currentWeek), [currentWeek]);

  // D-07 — first-time empty state auto-opens the manage sheet. State lives at
  // this level (Pitfall 8) so Realtime invalidations don't close the sheet.
  const [manageOpen, setManageOpen] = useState<boolean>(
    initialTypes.length === 0,
  );

  // 15-04 dialogs: card check-off opens completion; kebab → Edit opens edit.
  // State lives here (Pitfall 8) so Realtime invalidations of the underlying
  // data don't toggle the dialogs closed mid-interaction.
  const [completionActivity, setCompletionActivity] =
    useState<ActivityWithType | null>(null);
  const [editActivity, setEditActivity] = useState<ActivityWithType | null>(
    null,
  );

  // Realtime subscriptions.
  // - Activities are the planner's primary data.
  // - A type change (color, name, hasDistance) must repaint cards → fan out
  //   into the activities key.
  // - A batch change must regroup the manage sheet → fan out into the types key.
  // Critical Pattern 3: subscription only invalidates; it never merges payloads.
  useTableSubscription("training_activities", userId);
  useTableSubscription("training_activity_types", userId, {
    alsoInvalidate: [["training_activities", userId]],
  });
  useTableSubscription("training_batches", userId, {
    alsoInvalidate: [["training_activity_types", userId]],
  });

  const weekKey = useMemo(
    () =>
      [
        "training_activities",
        userId,
        week.startISO,
        week.endISO,
      ] as const,
    [userId, week.startISO, week.endISO],
  );

  // Activities for the visible week. `listActivitiesInRange` is a "use server"
  // wrapper that calls `getActivitiesInRange` under the user's getClaims() id.
  const { data: activities = initialActivities } = useQuery<ActivityWithType[]>(
    {
      queryKey: weekKey as unknown as readonly unknown[],
      queryFn: () => listActivitiesInRange(week.startISO, week.endISO),
      initialData:
        // Only feed SSR data into the initial (current-week) query — subsequent
        // weeks fetch fresh and start empty until the queryFn lands.
        isSameWeek(currentWeek, new Date(), { weekStartsOn: 1 })
          ? initialActivities
          : undefined,
    },
  );

  // Types + batches keyed off tableKey so the realtime invalidation prefix
  // matches automatically.
  const { data: types = initialTypes } = useQuery<TypeWithBatch[]>({
    queryKey: tableKey("training_activity_types", userId),
    queryFn: async () => {
      // No direct read API in lib/training; the union row shape lives on
      // initialTypes + Realtime fanout repaints from the activities refetch.
      // For now the seed is initialTypes; the sheet plan (15-04) introduces a
      // dedicated `listTypes` server action when CRUD lands.
      return initialTypes;
    },
    initialData: initialTypes,
  });

  const { data: batches = initialBatches } = useQuery<BatchRow[]>({
    queryKey: tableKey("training_batches", userId),
    queryFn: async () => initialBatches,
    initialData: initialBatches,
  });
  // D-07 — re-trigger auto-open when realtime makes the types list go empty
  // (e.g. user wipes everything from another tab). Don't auto-close on populate.
  useEffect(() => {
    if (types.length === 0) setManageOpen(true);
  }, [types.length]);

  // TRN-12 / D-14 — current-week adherence pill.
  const { doneCount, plannedCount } = useMemo(() => {
    let done = 0;
    let planned = 0;
    for (const a of activities) {
      if (a.status === "cancelled" || a.status === "skipped") continue;
      planned += 1;
      if (a.status === "done") done += 1;
    }
    return { doneCount: done, plannedCount: planned };
  }, [activities]);

  const isCurrentWeek = useMemo(
    () =>
      startOfWeek(currentWeek, { weekStartsOn: 1 }).getTime() ===
      startOfWeek(new Date(), { weekStartsOn: 1 }).getTime(),
    [currentWeek],
  );

  return (
    <div className="mx-auto flex h-full w-full max-w-[1400px] flex-col px-4 pt-4">
      <PlannerHeader
        week={week}
        onPrevWeek={() => setCurrentWeek((d) => addWeeks(d, -1))}
        onNextWeek={() => setCurrentWeek((d) => addWeeks(d, 1))}
        onJumpToday={() => setCurrentWeek(new Date())}
        doneCount={doneCount}
        plannedCount={plannedCount}
        onManageTypesClick={() => setManageOpen(true)}
        isCurrentWeek={isCurrentWeek}
      />

      <TrainingBoard
        userId={userId}
        days={week.days}
        activities={activities}
        types={types}
        distanceUnit={distanceUnit}
        onCheckOff={setCompletionActivity}
        onEdit={setEditActivity}
      />

      <ManageTypesSheet
        open={manageOpen}
        onOpenChange={setManageOpen}
        userId={userId}
        batches={batches}
        types={types}
      />

      <CompleteActivityDialog
        activity={completionActivity}
        distanceUnit={distanceUnit}
        open={!!completionActivity}
        onOpenChange={(o) => {
          if (!o) setCompletionActivity(null);
        }}
      />

      <ActivityEditDialog
        activity={editActivity}
        types={types}
        distanceUnit={distanceUnit}
        open={!!editActivity}
        onOpenChange={(o) => {
          if (!o) setEditActivity(null);
        }}
      />
    </div>
  );
}
