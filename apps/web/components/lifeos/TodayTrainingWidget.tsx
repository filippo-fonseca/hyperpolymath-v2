"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { listActivitiesInRange } from "@/app/actions/training";
import type { ActivityWithType } from "@/lib/db/queries/training";
import { tableKey } from "@/lib/realtime/query-keys";
import { useTableSubscription } from "@/lib/realtime/useTableSubscription";
import { formatDistance, type DistanceUnit } from "@/lib/training/distance";
import { EmptyState } from "@/components/ui/EmptyState";
import { TrainingIcon } from "@/components/ui/icons";
import {
  ActionLink,
  Chip,
  EntityCardHeader,
  ProgressRow,
  StatusPill,
} from "./entity-card";
import { WidgetBody, WidgetFooter } from "./WidgetCard";

interface Props {
  userId: string;
  initialActivities: ActivityWithType[];
  distanceUnit: DistanceUnit;
  todayISO: string;
}

/**
 * TodayTrainingWidget — at-a-glance training tile for the LifeOS homepage.
 *
 * Phase 15 Plan 06 (TRN-13, D-15). Mirrors the TodayHabitsWidget shape so the
 * LifeOS at-a-glance grid stays visually consistent. Reads today's planned
 * activities (server-loaded as `initialActivities`, kept fresh via TanStack
 * Query + Supabase Realtime invalidation on `training_activities`).
 *
 * Critical Pattern 3: Realtime drives `invalidateQueries` only — never merge
 * payloads into the cache directly (useTableSubscription already enforces this).
 *
 * "Rest day" empty state (CONTEXT specifics): when today has zero planned
 * activities, render a deliberate, positive state — not a generic "nothing
 * here". Plain sans copy over a dimmed dimensional icon (UI-CONTRACT §6 bans
 * the italic-serif empty state) that frames recovery as intentional.
 *
 * Each row is a Link to `/training` — completion modals live inside the
 * planner, so the widget routes the user into the surface where logging
 * actuals happens (D-15 lets discretion fall to routing vs in-place check-off;
 * routing is simpler and preserves the modal's pre-fill UX).
 */
export function TodayTrainingWidget({
  userId,
  initialActivities,
  distanceUnit,
  todayISO,
}: Props) {
  // Realtime → invalidate the windowed query key below.
  useTableSubscription("training_activities", userId);

  const queryKey = [
    ...tableKey("training_activities", userId),
    todayISO,
    todayISO,
  ] as const;

  const { data: activities = initialActivities } = useQuery({
    queryKey,
    queryFn: () => listActivitiesInRange(todayISO, todayISO),
    initialData: initialActivities,
  });

  // Hide cancelled/skipped — the widget is about *today's training intent*.
  const visible = activities.filter(
    (a) => a.status !== "cancelled" && a.status !== "skipped",
  );
  const doneCount = visible.filter((a) => a.status === "done").length;

  const pill =
    visible.length === 0 ? (
      <StatusPill tone="idle" label="rest day" />
    ) : doneCount === visible.length ? (
      <StatusPill tone="active" label="done" />
    ) : doneCount > 0 ? (
      <StatusPill tone="progress" label={`${doneCount}/${visible.length}`} />
    ) : (
      <StatusPill tone="progress" label={`${visible.length} planned`} />
    );

  const plannedMinutes = visible.reduce((sum, a) => sum + (a.plannedDurationMin ?? 0), 0);
  const plannedKmTotal = visible.reduce(
    (sum, a) =>
      sum + (a.type.hasDistance && a.plannedDistanceKm ? Number(a.plannedDistanceKm) : 0),
    0,
  );

  return (
    <>
      <WidgetBody>
        <EntityCardHeader
          icon={<TrainingIcon size={36} />}
          title="Training"
          subtitle="Today"
          pill={pill}
          action={
            <Link href="/training" className="group/action cursor-pointer-always">
              <ActionLink>Plan →</ActionLink>
            </Link>
          }
        />

        {visible.length > 0 && (
          <div className="mt-4">
            <ProgressRow
              label="Completed"
              value={`${doneCount}/${visible.length}`}
              ratio={doneCount / visible.length}
            />
          </div>
        )}

        {visible.length === 0 ? (
          // Rest day — positive, intentional. Not "nothing to do".
          <div className="flex min-h-0 flex-1 flex-col justify-center">
            <EmptyState size="inline" title="Rest day. Recover well; tomorrow earns more." />
          </div>
        ) : (
          <ul className="sd-scroll-hover -mr-2 mt-4 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-2">
            {visible.map((a) => {
              const done = a.status === "done";
              const plannedMin = a.plannedDurationMin;
              const plannedKm = a.plannedDistanceKm ? Number(a.plannedDistanceKm) : null;
              return (
                <li key={a.id}>
                  <Link
                    href="/training"
                    className="group/training flex w-full cursor-pointer-always items-center gap-2 text-left"
                  >
                    <span
                      className="inline-block size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: a.type.color }}
                      aria-hidden
                    />
                    <span
                      className={`min-w-0 flex-1 truncate text-body ${
                        done
                          ? "text-[var(--sd-ink-faint)] line-through"
                          : "text-[var(--sd-ink)]"
                      }`}
                    >
                      {a.title}
                    </span>
                    <span className="shrink-0 text-micro tabular-nums text-[var(--sd-ink-faint)]">
                      {plannedMin != null ? `${plannedMin}m` : null}
                      {plannedMin != null && a.type.hasDistance && plannedKm != null
                        ? " · "
                        : null}
                      {a.type.hasDistance && plannedKm != null
                        ? formatDistance(plannedKm, distanceUnit)
                        : null}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </WidgetBody>

      <WidgetFooter>
        {visible.length === 0 ? (
          <Chip>Rest day</Chip>
        ) : (
          <>
            <Chip>
              {visible.length === 1 ? "1 session" : `${visible.length} sessions`}
            </Chip>
            {plannedMinutes > 0 && <Chip>{plannedMinutes}m planned</Chip>}
            {plannedKmTotal > 0 && (
              <Chip>{formatDistance(plannedKmTotal, distanceUnit)}</Chip>
            )}
          </>
        )}
      </WidgetFooter>
    </>
  );
}
