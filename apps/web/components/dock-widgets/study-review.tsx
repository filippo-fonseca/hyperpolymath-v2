"use client";

import { getStudyOverviewAction } from "@/app/actions/study-read";
import { DockStateNote } from "@/components/dock-widgets/dock-state";
import { useCurrentUserId } from "@/components/providers/CurrentUserProvider";
import { defineDockWidget } from "@/components/shell/cockpit/dock-registry";
import type { PlanItemWithTopic } from "@/lib/db/queries/study";
import { tableKey } from "@/lib/realtime/query-keys";
import { useTableSubscription } from "@/lib/realtime/useTableSubscription";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { BrainCircuit, Check } from "lucide-react";
import Link from "next/link";

/**
 * Today's review, in the dock.
 *
 * The dock's job is "what am I meant to be doing, without leaving the page", so
 * this shows today's planned topics and what each is for. Checking one off is
 * NOT possible here on purpose: logging a review needs a mode and a grade, and
 * a one-tap "done" that silently guessed them would poison the schedule with
 * fabricated data. The row routes to /review, where the real log sheet lives.
 */

type StudyDock = {
  userId: string;
  items: PlanItemWithTopic[];
  fading: number;
  loading: boolean;
};

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

function useStudyDock(): StudyDock {
  const userId = useCurrentUserId() ?? "";
  useTableSubscription("study_plan_items", userId);
  useTableSubscription("study_topics", userId);

  const iso = todayISO();
  const { data, isPending } = useQuery({
    queryKey: [...tableKey("study_plan_items", userId), iso, iso],
    queryFn: () => getStudyOverviewAction({ from: iso, to: iso }),
    enabled: Boolean(userId),
  });

  return {
    userId,
    items: (data?.planItems ?? []).filter((i) => i.status !== "skipped"),
    fading: (data?.topics ?? []).filter((t) => t.priority > 0).length,
    loading: isPending,
  };
}

const VISIBLE = 4;

function Compact({ data }: { data: StudyDock }) {
  if (data.loading) return <DockStateNote>Loading…</DockStateNote>;

  if (data.items.length === 0) {
    return (
      <DockStateNote>
        {data.fading > 0
          ? `${data.fading} fading. Nothing planned today.`
          : "Nothing to review today."}
      </DockStateNote>
    );
  }

  const open = data.items.filter((i) => i.status !== "done");
  const done = data.items.filter((i) => i.status === "done");
  const visible = open.slice(0, VISIBLE);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-x-2.5 px-1.5">
        <Link
          href="/review"
          className="inline-flex items-center gap-1 text-micro font-medium tabular-nums text-[var(--tint-lavender-ink)] opacity-90 transition-opacity duration-[160ms] ease-out hover:opacity-100"
        >
          {open.length} to review
        </Link>
        {data.fading > 0 ? (
          <span className="text-micro tabular-nums text-[var(--ink-faint)]">
            {data.fading} fading
          </span>
        ) : null}
      </div>

      <ul className="flex flex-col">
        {visible.map((item) => (
          <li key={item.id}>
            <Link
              href="/review"
              className="flex h-7 min-w-0 items-center gap-2 rounded-lg px-1.5 transition-colors duration-[160ms] ease-out hover:bg-[var(--hover)]"
            >
              <span
                aria-hidden
                className="size-1.5 shrink-0 rounded-full bg-[var(--edge-strong)]"
              />
              <span className="truncate text-meta text-[var(--ink)]">
                {item.topicTitle}
              </span>
              <span className="ml-auto shrink-0 truncate text-micro text-[var(--ink-faint)]">
                {item.assessmentTitle ?? item.courseCode ?? ""}
              </span>
            </Link>
          </li>
        ))}

        {open.length > VISIBLE ? (
          <li>
            <Link
              href="/review"
              className="block w-full cursor-pointer-always rounded-lg px-1.5 py-0.5 text-left text-micro text-[var(--ink-faint)] transition-colors duration-[160ms] ease-out hover:bg-[var(--hover)] hover:text-[var(--ink)]"
            >
              +{open.length - VISIBLE} more
            </Link>
          </li>
        ) : null}
      </ul>

      {done.length > 0 ? (
        <div
          className={cn(
            "mt-0.5 flex items-center gap-1 px-1.5 pt-0.5",
            "border-t border-[color-mix(in_srgb,var(--edge-strong)_60%,transparent)]",
          )}
        >
          <Check size={10} strokeWidth={2.5} aria-hidden className="text-[var(--ink-faint)]" />
          <span className="text-micro tabular-nums text-[var(--ink-faint)]">
            {done.length} done today
          </span>
        </div>
      ) : null}
    </div>
  );
}

export const studyReviewWidget = defineDockWidget<StudyDock>({
  id: "study-review",
  title: "Review",
  order: 35,
  useData: useStudyDock,
  Compact,
  icon: BrainCircuit,
  tint: "tint-lavender",
});
