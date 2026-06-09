"use client";

import Link from "next/link";
import { Moon } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { listActivitiesInRange } from "@/app/actions/training";
import type { ActivityWithType } from "@/lib/db/queries/training";
import { tableKey } from "@/lib/realtime/query-keys";
import { useTableSubscription } from "@/lib/realtime/useTableSubscription";
import { formatDistance, type DistanceUnit } from "@/lib/training/distance";

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
 * here". Moon glyph + serif copy that frames recovery as intentional.
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

  return (
    <div className="flex flex-col h-full">
      <header className="mb-4 flex items-baseline justify-between">
        <div className="flex items-baseline gap-2.5">
          <h3 className="font-serif text-base font-semibold text-[var(--ink)]">
            Training
          </h3>
          {visible.length > 0 && (
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--ink-muted)] tabular-nums">
              {visible.filter((a) => a.status === "done").length}/{visible.length}
            </span>
          )}
        </div>
        <Link
          href="/training"
          className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink-muted)] hover:text-[var(--ink)] transition-colors duration-100 cursor-pointer-always"
        >
          Plan →
        </Link>
      </header>

      {visible.length === 0 ? (
        // Rest day — positive, intentional. Not "nothing to do".
        <div className="flex flex-1 flex-col items-start justify-center gap-2 py-2">
          <Moon
            size={18}
            strokeWidth={1.5}
            className="text-[var(--ink-muted)]"
            aria-hidden
          />
          <p className="font-serif text-[14px] text-[var(--ink)]">
            Rest day.
          </p>
          <p className="font-serif italic text-[13px] text-[var(--ink-muted)]">
            Recover well — tomorrow earns more.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2.5 flex-1">
          {visible.map((a) => {
            const done = a.status === "done";
            const plannedMin = a.plannedDurationMin;
            const plannedKm = a.plannedDistanceKm
              ? Number(a.plannedDistanceKm)
              : null;
            return (
              <li key={a.id}>
                <Link
                  href="/training"
                  className="flex w-full items-center gap-2.5 text-left cursor-pointer-always group/training"
                >
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: a.type.color }}
                    aria-hidden
                  />
                  <span
                    className={`font-serif text-[14px] truncate flex-1 min-w-0 ${
                      done
                        ? "text-[var(--ink-muted)] line-through"
                        : "text-[var(--ink)] group-hover/training:text-[var(--ink)]"
                    }`}
                  >
                    {a.title}
                  </span>
                  <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ink-muted)] shrink-0">
                    {plannedMin != null ? `${plannedMin}m` : null}
                    {plannedMin != null &&
                    a.type.hasDistance &&
                    plannedKm != null
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
    </div>
  );
}
