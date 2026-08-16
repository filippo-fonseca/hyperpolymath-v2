"use client";

import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { addDays, format, startOfToday } from "date-fns";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { getStudyOverviewAction } from "@/app/actions/study-read";
import {
  moveStudyPlanItem,
  planStudyTopic,
  removeStudyPlanItem,
} from "@/app/actions/study";
import type { PlanItemWithTopic, TopicWithState } from "@/lib/db/queries/study";
import { useTableSubscription } from "@/lib/realtime/useTableSubscription";
import { tableKey } from "@/lib/realtime/query-keys";
import type { StudyWeight } from "@/lib/study/scheduler";
import { PageScaffold } from "@/components/ui/PageScaffold";
import { cn } from "@/lib/utils";
import { FadingRail } from "./FadingRail";
import { PlanDayRow } from "./PlanDayRow";
import { LogReviewDialog, type LogTarget } from "./LogReviewDialog";
import { ExamCountdowns } from "./ExamCountdowns";

const DAYS_SHOWN = 14;

export type StudyOverview = Awaited<ReturnType<typeof getStudyOverviewAction>>;

/**
 * The /review cockpit.
 *
 * Three parts, left to right in importance: what is fading (the model's voice),
 * what you have planned (yours), and what you are revising for (the deadline).
 *
 * The interaction is one gesture — drag a topic from the rail onto a day — and
 * one follow-up — click it off when you have done it. Everything else is
 * secondary. Realtime keeps the LifeOS widget and the class pages in step.
 */
export function ReviewClient({
  userId,
  initial,
  windowStart,
}: {
  userId: string;
  initial: StudyOverview;
  windowStart: string;
}) {
  const qc = useQueryClient();
  const [weekOffset, setWeekOffset] = useState(0);
  const [classFilter, setClassFilter] = useState<string | null>(null);
  const [logTarget, setLogTarget] = useState<LogTarget | null>(null);

  // The window starts TODAY, not at the start of the current week. A
  // week-aligned window buries today under however many past days the week has
  // already used up — five empty rows before the one that matters, on a Friday.
  // Missed days are not lost either way: anything you skipped is still decaying
  // and therefore still in the rail.
  const days = useMemo(() => {
    const start = addDays(startOfToday(), weekOffset * 7);
    return Array.from({ length: DAYS_SHOWN }, (_, i) => addDays(start, i));
  }, [weekOffset]);

  const from = format(days[0]!, "yyyy-MM-dd");
  const to = format(days.at(-1)!, "yyyy-MM-dd");

  const { data } = useQuery({
    queryKey: [...tableKey("study_plan_items", userId), from, to],
    queryFn: () => getStudyOverviewAction({ from, to }),
    initialData: from === windowStart ? initial : undefined,
    staleTime: 30_000,
  });

  // Realtime is invalidation-only, per the house pattern: a change anywhere
  // (the class page, the widget, Kiwi) refetches this window rather than trying
  // to merge payloads.
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: tableKey("study_plan_items", userId) });
    void qc.invalidateQueries({ queryKey: tableKey("study_topics", userId) });
  };
  useTableSubscription("study_plan_items", userId);
  useTableSubscription("study_topics", userId);
  useTableSubscription("study_reviews", userId, { alsoInvalidate: [["study_topics", userId]] });

  const topics = data?.topics ?? [];
  const planItems = data?.planItems ?? [];
  const assessments = data?.assessments ?? [];

  const classes = useMemo(() => {
    const seen = new Map<string, { id: string; name: string; courseCode: string | null }>();
    for (const t of topics) {
      if (!seen.has(t.projectId)) {
        seen.set(t.projectId, {
          id: t.projectId,
          name: t.projectName,
          courseCode: t.courseCode,
        });
      }
    }
    return [...seen.values()];
  }, [topics]);

  const byDate = useMemo(() => {
    const m = new Map<string, PlanItemWithTopic[]>();
    for (const item of planItems) {
      const arr = m.get(item.planDate);
      if (arr) arr.push(item);
      else m.set(item.planDate, [item]);
    }
    return m;
  }, [planItems]);

  const examsByDate = useMemo(() => {
    const m = new Map<string, Array<{ id: string; title: string; courseCode: string | null }>>();
    for (const a of assessments) {
      const arr = m.get(a.dueDate);
      const entry = { id: a.id, title: a.title, courseCode: a.courseCode };
      if (arr) arr.push(entry);
      else m.set(a.dueDate, [entry]);
    }
    return m;
  }, [assessments]);

  const plannedTopicIds = useMemo(
    () => new Set(planItems.filter((i) => i.status !== "done").map((i) => i.topicId)),
    [planItems],
  );

  const [isDragging, setIsDragging] = useState(false);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor),
  );

  async function handleDragEnd(e: DragEndEvent) {
    setIsDragging(false);
    const { active, over } = e;
    if (!over) return;

    const overId = String(over.id);
    if (!overId.startsWith("day:")) return;
    const planDate = overId.slice(4);

    const kind = active.data.current?.kind;

    if (kind === "topic") {
      const topicId = String(active.data.current?.topicId);
      const res = await planStudyTopic({ topicId, planDate });
      if (!res.success) {
        toast.error(res.error || "Could not plan that topic");
        return;
      }
      invalidate();
      return;
    }

    if (kind === "plan") {
      const planItemId = String(active.data.current?.planItemId);
      const current = planItems.find((i) => i.id === planItemId);
      if (!current || current.planDate === planDate) return;

      const res = await moveStudyPlanItem({ id: planItemId, planDate });
      if (!res.success) {
        toast.error(res.error || "Could not move that");
        return;
      }
      invalidate();
    }
  }

  function openLogForTopic(t: TopicWithState) {
    setLogTarget({
      topicId: t.id,
      title: t.title,
      courseLabel: t.courseCode ?? t.projectName,
      weight: t.weight as StudyWeight,
      difficulty: t.difficulty,
      stability: t.stability,
      lastReviewedAt: t.lastReviewedAt,
      reps: t.reps,
      lapses: t.lapses,
      assessmentId: t.nextAssessment?.id ?? null,
      assessmentTitle: t.nextAssessment?.title ?? null,
      assessmentDate: t.nextAssessment ? parseISODate(t.nextAssessment.dueDate) : null,
    });
  }

  function openLogForPlanItem(item: PlanItemWithTopic) {
    const t = topics.find((x) => x.id === item.topicId);
    setLogTarget({
      topicId: item.topicId,
      title: item.topicTitle,
      courseLabel: item.courseCode ?? item.projectName,
      weight: (t?.weight ?? "working") as StudyWeight,
      difficulty: t?.difficulty ?? 5,
      stability: t?.stability ?? null,
      lastReviewedAt: t?.lastReviewedAt ?? null,
      reps: t?.reps ?? 0,
      lapses: t?.lapses ?? 0,
      planItemId: item.id,
      assessmentId: item.assessmentId,
      assessmentTitle: item.assessmentTitle,
      assessmentDate: t?.nextAssessment ? parseISODate(t.nextAssessment.dueDate) : null,
    });
  }

  async function removeItem(item: PlanItemWithTopic) {
    const res = await removeStudyPlanItem({ id: item.id });
    if (!res.success) {
      toast.error(res.error || "Could not remove that");
      return;
    }
    invalidate();
  }

  const dueCount = topics.filter((t) => t.priority > 0).length;

  return (
    <PageScaffold
      eyebrow="Study"
      title="Review"
      subtitle="What is fading, and what you have planned against it. Drag a topic onto a day; check it off when you have done it."
      meta={
        <PageScaffold.MetaRow>
          {[
            `${topics.length} topics`,
            dueCount > 0 ? `${dueCount} fading` : "all fresh",
            assessments.length > 0
              ? `${assessments.length} upcoming`
              : "no assessments set",
          ]}
        </PageScaffold.MetaRow>
      }
    >
      {assessments.length > 0 && (
        <PageScaffold.Section>
          <ExamCountdowns assessments={assessments} topics={topics} />
        </PageScaffold.Section>
      )}

      <PageScaffold.Section divided={assessments.length > 0}>
        <DndContext
          sensors={sensors}
          onDragStart={() => setIsDragging(true)}
          onDragCancel={() => setIsDragging(false)}
          onDragEnd={(e) => void handleDragEnd(e)}
        >
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
            {/* Sticky so the rail stays draggable-from while the agenda below
                scrolls past a fortnight of days. */}
            <div className="lg:sticky lg:top-6 lg:max-h-[calc(100vh-180px)] lg:self-start lg:overflow-y-auto">
              <FadingRail
                topics={topics}
                plannedTopicIds={plannedTopicIds}
                onLog={openLogForTopic}
                classFilter={classFilter}
                onClassFilterChange={setClassFilter}
                classes={classes}
              />
            </div>

            <div className="flex min-w-0 flex-col gap-3">
              <div className="flex items-center justify-between">
                <h2 className="text-title font-semibold text-[var(--ink)]">Plan</h2>
                <div className="flex items-center gap-1">
                  <NavButton onClick={() => setWeekOffset((v) => v - 1)}>←</NavButton>
                  <button
                    type="button"
                    onClick={() => setWeekOffset(0)}
                    className={cn(
                      "rounded-md px-2 py-0.5 text-micro transition-colors",
                      weekOffset === 0
                        ? "text-[var(--ink-faint)]"
                        : "text-[var(--ink-muted)] hover:bg-[var(--surface)]",
                    )}
                  >
                    {weekOffset === 0 ? "Next 14 days" : "Back to today"}
                  </button>
                  <NavButton onClick={() => setWeekOffset((v) => v + 1)}>→</NavButton>
                </div>
              </div>

              <div className="flex flex-col gap-1">
                {days.map((d) => {
                  const iso = format(d, "yyyy-MM-dd");
                  return (
                    <PlanDayRow
                      key={iso}
                      dateISO={iso}
                      date={d}
                      items={byDate.get(iso) ?? []}
                      isAnyDragging={isDragging}
                      examMarkers={examsByDate.get(iso) ?? []}
                      onLog={openLogForPlanItem}
                      onRemove={(i) => void removeItem(i)}
                    />
                  );
                })}
              </div>

              {planItems.length === 0 && topics.length > 0 && (
                <p className="text-meta text-[var(--ink-faint)]">
                  Nothing planned yet. Drag from the rail on the left onto whichever
                  day you can actually fit it.
                </p>
              )}
            </div>
          </div>
        </DndContext>
      </PageScaffold.Section>

      <LogReviewDialog
        target={logTarget}
        open={logTarget !== null}
        onOpenChange={(v) => !v && setLogTarget(null)}
        onLogged={invalidate}
      />
    </PageScaffold>
  );
}

function NavButton({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-md px-1.5 py-0.5 text-sm text-[var(--ink-faint)] transition-colors hover:bg-[var(--surface)] hover:text-[var(--ink)]"
    >
      {children}
    </button>
  );
}

function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y!, m! - 1, d!);
}
