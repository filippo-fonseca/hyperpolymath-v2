"use client";

import { listActivitiesInRange } from "@/app/actions/training";
import { DenseListRow, EmptyState, SectionHeader } from "@/components/spacedrive";
import type { ActivityWithType } from "@/lib/db/queries/training";
import { tableKey } from "@/lib/realtime/query-keys";
import { useTableSubscription } from "@/lib/realtime/useTableSubscription";
import { type DistanceUnit, formatDistance } from "@/lib/training/distance";
import { useQuery } from "@tanstack/react-query";
import { Moon } from "lucide-react";
import Link from "next/link";

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
export function TodayTrainingWidget({ userId, initialActivities, distanceUnit, todayISO }: Props) {
  // Realtime → invalidate the windowed query key below.
  useTableSubscription("training_activities", userId);

  const queryKey = [...tableKey("training_activities", userId), todayISO, todayISO] as const;

  const { data: activities = initialActivities } = useQuery({
    queryKey,
    queryFn: () => listActivitiesInRange(todayISO, todayISO),
    initialData: initialActivities,
  });

  // Hide cancelled/skipped — the widget is about *today's training intent*.
  const visible = activities.filter((a) => a.status !== "cancelled" && a.status !== "skipped");

  return (
    <section aria-labelledby="lifeos-training-title" className="flex flex-col h-full">
      <h3 id="lifeos-training-title" className="sr-only">
        Training
      </h3>
      <SectionHeader
        title="Training"
        action={
          <div className="flex items-center gap-2.5">
            {visible.length > 0 && (
              <span className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.14em] text-[var(--deck-ink-dull)] tabular-nums">
                {visible.filter((a) => a.status === "done").length}/{visible.length}
              </span>
            )}
            <Link
              href="/training"
              className="rounded-sm px-1 py-0.5 font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.12em] text-[var(--deck-ink-dull)] transition-colors [transition-duration:var(--dur-hover)] hover:text-[var(--deck-ink)] focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]"
            >
              Plan →
            </Link>
          </div>
        }
        className="mb-4"
      />

      {visible.length === 0 ? (
        // Rest day — positive, intentional. Not "nothing to do".
        <EmptyState
          icon={<Moon size={18} strokeWidth={1.5} aria-hidden />}
          title="Rest day."
          description="Recover well — tomorrow earns more."
          className="min-h-0 flex-1 items-start justify-center px-0 py-8 text-left"
        />
      ) : (
        <ul className="flex flex-1 flex-col gap-1">
          {visible.map((a) => {
            const done = a.status === "done";
            const plannedMin = a.plannedDurationMin;
            const plannedKm = a.plannedDistanceKm ? Number(a.plannedDistanceKm) : null;
            return (
              <li key={a.id}>
                <DenseListRow
                  glyph={
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: a.type.color }}
                      aria-hidden
                    />
                  }
                  title={
                    <Link
                      href="/training"
                      className={`block min-w-0 truncate font-[family-name:var(--font-sans)] text-[13px] focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)] ${done ? "text-[var(--deck-ink-dull)] line-through" : "text-[var(--deck-ink)]"}`}
                    >
                      {a.title}
                    </Link>
                  }
                  meta={
                    <span className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.08em] text-[var(--deck-ink-dull)]">
                      {plannedMin != null ? `${plannedMin}m` : null}
                      {plannedMin != null && a.type.hasDistance && plannedKm != null ? " · " : null}
                      {a.type.hasDistance && plannedKm != null
                        ? formatDistance(plannedKm, distanceUnit)
                        : null}
                    </span>
                  }
                />
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
