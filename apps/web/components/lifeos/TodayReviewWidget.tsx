"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { BrainCircuit } from "lucide-react";
import { getStudyOverviewAction } from "@/app/actions/study-read";
import { EmptyState } from "@/components/ui/EmptyState";
import { tableKey } from "@/lib/realtime/query-keys";
import { useTableSubscription } from "@/lib/realtime/useTableSubscription";
import { tintFor } from "@/lib/tint";
import { ActionLink, EntityCardHeader, ProgressRow } from "./entity-card";
import { WidgetBody, WidgetFooter } from "./WidgetCard";

/**
 * TodayReviewWidget — today's study plan, grouped by what it is for.
 *
 * Grouping by assessment rather than by class is the whole point of the tile:
 * on any given day the useful question is not "which course is this?" but "what
 * am I revising this for, and is it soon?". A topic with no assessment attached
 * falls into a General bucket rather than being hidden.
 *
 * Mirrors TodayTrainingWidget's shape so the deck stays visually consistent.
 * Realtime drives invalidation only, per Critical Pattern 3.
 */
export function TodayReviewWidget({
  userId,
  todayISO,
}: {
  userId: string;
  todayISO: string;
}) {
  useTableSubscription("study_plan_items", userId);
  useTableSubscription("study_topics", userId);

  const { data } = useQuery({
    queryKey: [...tableKey("study_plan_items", userId), todayISO, todayISO],
    queryFn: () => getStudyOverviewAction({ from: todayISO, to: todayISO }),
    staleTime: 30_000,
  });

  const items = data?.planItems ?? [];
  const topics = data?.topics ?? [];
  const fadingCount = topics.filter((t) => t.priority > 0).length;

  const active = items.filter((i) => i.status !== "skipped");
  const doneCount = active.filter((i) => i.status === "done").length;

  // Group by assessment, preserving the order the items arrived in so the
  // grouping never reshuffles the plan the user set.
  const groups = new Map<string, { label: string; items: typeof active }>();
  for (const item of active) {
    const key = item.assessmentId ?? "__general__";
    const label = item.assessmentTitle ?? "General review";
    const g = groups.get(key);
    if (g) g.items.push(item);
    else groups.set(key, { label, items: [item] });
  }

  return (
    <>
      <WidgetBody>
        <EntityCardHeader
          icon={<BrainCircuit size={20} className="text-[var(--sd-ink-faint)]" />}
          title="Review"
          subtitle="Today"
          action={
            <Link href="/review" className="group/action cursor-pointer-always">
              <ActionLink>Plan →</ActionLink>
            </Link>
          }
        />

        {active.length > 0 && (
          <div className="mt-3">
            <ProgressRow
              label="Reviewed"
              value={`${doneCount}/${active.length}`}
              ratio={doneCount / active.length}
            />
          </div>
        )}

        {active.length === 0 ? (
          <div className="flex min-h-0 flex-1 flex-col justify-center">
            <EmptyState
              size="inline"
              title={
                fadingCount > 0
                  ? `${fadingCount} ${fadingCount === 1 ? "topic is" : "topics are"} fading. Nothing planned for today yet.`
                  : "Nothing to review today. The curve is holding."
              }
            />
          </div>
        ) : (
          <div className="sd-scroll-hover -mr-2 mt-3 flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto pr-2">
            {[...groups.entries()].map(([key, group]) => (
              <div key={key}>
                <p className="mb-1 truncate text-micro text-[var(--sd-ink-faint)]">
                  {group.label}
                </p>
                <ul className="flex flex-col gap-1">
                  {group.items.map((item) => {
                    const done = item.status === "done";
                    return (
                      <li key={item.id}>
                        <Link
                          href="/review"
                          className="flex w-full cursor-pointer-always items-center gap-2 text-left"
                        >
                          <span
                            className={`${tintFor(item.projectId)} inline-block size-2 shrink-0 rounded-full`}
                            style={{ backgroundColor: "var(--tint-edge)" }}
                            aria-hidden
                          />
                          <span
                            className={`min-w-0 flex-1 truncate text-meta ${
                              done
                                ? "text-[var(--sd-ink-faint)] line-through"
                                : "text-[var(--sd-ink)]"
                            }`}
                          >
                            {item.topicTitle}
                          </span>
                          <span className="shrink-0 text-micro text-[var(--sd-ink-faint)]">
                            {item.courseCode ?? ""}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}
      </WidgetBody>

      {(active.length > 0 || fadingCount > 0) && (
        <WidgetFooter>
          <span className="truncate text-micro tabular-nums text-[var(--sd-ink-faint)]">
            {active.length > 0 &&
              `${active.length} ${active.length === 1 ? "topic" : "topics"} planned`}
            {active.length > 0 && fadingCount > 0 && " · "}
            {fadingCount > 0 && `${fadingCount} fading`}
          </span>
        </WidgetFooter>
      )}
    </>
  );
}
