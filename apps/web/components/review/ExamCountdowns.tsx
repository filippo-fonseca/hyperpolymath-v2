"use client";

import type { AssessmentRow, TopicWithState } from "@/lib/db/queries/study";
import { isExamReady, type StudyWeight } from "@/lib/study/scheduler";
import { tintFor } from "@/lib/tint";
import { cn } from "@/lib/utils";
import { ASSESSMENT_KIND_LABEL, relativeDays } from "./study-ui";

type Assessment = AssessmentRow & { projectName: string; courseCode: string | null };

/**
 * Countdown strip: what is coming, and how much of it you are actually ready for.
 *
 * "Ready" is not a guess. It projects each covered topic's forgetting curve
 * forward to the exam date and asks whether it will still clear that topic's own
 * bar on the day. That is the number worth staring at, and it is deliberately
 * the harsher reading — a topic you know today but will have forgotten by the
 * exam counts as not ready.
 */
export function ExamCountdowns({
  assessments,
  topics,
  limit = 4,
}: {
  assessments: Assessment[];
  topics: TopicWithState[];
  limit?: number;
}) {
  const byProject = new Map<string, TopicWithState[]>();
  for (const t of topics) {
    const arr = byProject.get(t.projectId);
    if (arr) arr.push(t);
    else byProject.set(t.projectId, [t]);
  }

  const upcoming = assessments.slice(0, limit);
  if (upcoming.length === 0) return null;

  return (
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
      {upcoming.map((a) => {
        const examDate = parseISODate(a.dueDate);
        const days = daysUntil(examDate);

        // Topics anchored on this assessment. Falls back to the whole class when
        // coverage has not been set, so the readout is never mysteriously empty.
        const covered = (byProject.get(a.projectId) ?? []).filter(
          (t) => t.nextAssessment?.id === a.id,
        );
        const pool = covered.length > 0 ? covered : (byProject.get(a.projectId) ?? []);
        const ready = pool.filter((t) =>
          isExamReady(
            {
              weight: t.weight as StudyWeight,
              difficulty: t.difficulty,
              stability: t.stability,
              lastReviewedAt: t.lastReviewedAt,
              reps: t.reps,
              lapses: t.lapses,
            },
            examDate,
          ),
        ).length;

        const share = pool.length > 0 ? ready / pool.length : 0;
        const imminent = days <= 7;

        return (
          <div
            key={a.id}
            className={cn(
              tintFor(a.projectId),
              "craft-glass-tile rounded-[14px] px-3 py-2.5",
            )}
          >
            <p className="truncate text-micro" style={{ color: "var(--tint-ink)" }}>
              {a.courseCode ?? a.projectName}
            </p>
            <p className="mt-0.5 truncate text-sm font-medium text-[var(--ink)]">
              {a.title}
            </p>

            <div className="mt-1.5 flex items-baseline justify-between gap-2">
              <span
                className={cn(
                  "text-xs tabular-nums",
                  imminent ? "font-medium text-[#ef4444]" : "text-[var(--ink-muted)]",
                )}
              >
                {relativeDays(days)}
              </span>
              <span className="text-micro text-[var(--ink-faint)]">
                {ASSESSMENT_KIND_LABEL[a.kind] ?? a.kind}
              </span>
            </div>

            {pool.length > 0 && (
              <div className="mt-2">
                <div className="h-1 overflow-hidden rounded-full bg-[var(--edge)]">
                  <div
                    className="h-full rounded-full transition-[width] duration-300"
                    style={{
                      width: `${Math.round(share * 100)}%`,
                      background: share > 0.75 ? "#10b981" : share > 0.4 ? "#f59e0b" : "#ef4444",
                    }}
                  />
                </div>
                <p className="mt-1 text-micro tabular-nums text-[var(--ink-faint)]">
                  {ready}/{pool.length} ready on the day
                </p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y!, m! - 1, d!);
}

function daysUntil(target: Date): number {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}
