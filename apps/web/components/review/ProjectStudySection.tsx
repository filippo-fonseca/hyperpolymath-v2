"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getStudyOverviewAction } from "@/app/actions/study-read";
import {
  createStudyAssessment,
  createStudyTopics,
  deleteStudyTopic,
  updateStudyTopic,
} from "@/app/actions/study";
import type { TopicWithState } from "@/lib/db/queries/study";
import { useTableSubscription } from "@/lib/realtime/useTableSubscription";
import { tableKey } from "@/lib/realtime/query-keys";
import { isExamReady, type StudyWeight } from "@/lib/study/scheduler";
import { PageScaffold } from "@/components/ui/PageScaffold";
import { cn } from "@/lib/utils";
import { RetentionRing } from "./RetentionRing";
import { LogReviewDialog, type LogTarget } from "./LogReviewDialog";
import {
  ASSESSMENT_KIND_LABEL,
  STATUS_META,
  WEIGHT_META,
  WEIGHT_ORDER,
  relativeDays,
} from "./study-ui";
import type { StudyTopicStatus } from "@/lib/study/scheduler";

/**
 * The study section on a class project page. Rendered only when `isClass`.
 *
 * This is the curation surface, as distinct from /review which is the working
 * surface. Here you decide WHAT is on the syllabus and how much each piece
 * matters; there you decide what to do about it today.
 */
export function ProjectStudySection({
  userId,
  projectId,
  projectName,
}: {
  userId: string;
  projectId: string;
  projectName: string;
}) {
  const qc = useQueryClient();
  const [logTarget, setLogTarget] = useState<LogTarget | null>(null);
  const [adding, setAdding] = useState(false);
  const [addingExam, setAddingExam] = useState(false);

  // Wide window: this view cares about topics and assessments, not the plan, so
  // the date range only needs to be big enough not to hide upcoming exams.
  const from = new Date().toISOString().slice(0, 10);
  const to = new Date(Date.now() + 240 * 86_400_000).toISOString().slice(0, 10);

  const { data } = useQuery({
    queryKey: [...tableKey("study_topics", userId), projectId],
    queryFn: () => getStudyOverviewAction({ from, to }),
    staleTime: 30_000,
  });

  useTableSubscription("study_topics", userId);
  useTableSubscription("study_assessments", userId);

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: tableKey("study_topics", userId) });
    void qc.invalidateQueries({ queryKey: tableKey("study_plan_items", userId) });
  };

  const topics = (data?.topics ?? []).filter((t) => t.projectId === projectId);
  const assessments = (data?.assessments ?? []).filter((a) => a.projectId === projectId);

  // Two-level tree: units and their children, then anything loose.
  const roots = topics.filter((t) => t.parentId === null);
  const childrenOf = (id: string) => topics.filter((t) => t.parentId === id);

  return (
    <PageScaffold.Section
      title="Study review"
      divided
      action={
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => setAddingExam((v) => !v)}>
            Add assessment
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setAdding((v) => !v)}>
            Add topics
          </Button>
        </div>
      }
    >
      {assessments.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {assessments.map((a) => {
            const examDate = parseISODate(a.dueDate);
            const covered = topics.filter((t) => t.nextAssessment?.id === a.id);
            const pool = covered.length > 0 ? covered : topics;
            const ready = pool.filter((t) => isExamReady(memoryOf(t), examDate)).length;
            return (
              <span
                key={a.id}
                className="rounded-lg border border-[var(--edge)] bg-[var(--surface)] px-2.5 py-1 text-meta text-[var(--ink-muted)]"
              >
                <span className="text-[var(--ink)]">{a.title}</span>
                <span className="text-[var(--ink-faint)]">
                  {" · "}
                  {ASSESSMENT_KIND_LABEL[a.kind] ?? a.kind}
                  {" · "}
                  {relativeDays(daysUntil(examDate))}
                  {pool.length > 0 ? ` · ${ready}/${pool.length} ready` : ""}
                </span>
              </span>
            );
          })}
        </div>
      )}

      {addingExam && (
        <AddAssessmentForm
          projectId={projectId}
          onDone={() => {
            setAddingExam(false);
            invalidate();
          }}
          onCancel={() => setAddingExam(false)}
        />
      )}

      {adding && (
        <AddTopicsForm
          projectId={projectId}
          onDone={() => {
            setAdding(false);
            invalidate();
          }}
          onCancel={() => setAdding(false)}
        />
      )}

      {topics.length === 0 && !adding ? (
        <div className="rounded-xl border border-dashed border-[var(--edge)] px-4 py-8 text-center">
          <p className="text-meta text-[var(--ink-muted)]">
            No topics yet for {projectName}.
          </p>
          <p className="mx-auto mt-1 max-w-[46ch] text-micro text-[var(--ink-faint)]">
            Paste the syllabus at Kiwi and it will build the list, or add them by
            hand. Once topics exist they start showing up on Review as they fade.
          </p>
          <Button className="mt-3" size="sm" onClick={() => setAdding(true)}>
            Add topics
          </Button>
        </div>
      ) : (
        <ul className="flex flex-col">
          {roots.map((t) => (
            <li key={t.id}>
              <TopicRow
                topic={t}
                onLog={() => setLogTarget(logTargetFor(t))}
                onChange={invalidate}
              />
              {childrenOf(t.id).length > 0 && (
                <ul className="ml-[34px] border-l border-[var(--edge)] pl-2">
                  {childrenOf(t.id).map((c) => (
                    <li key={c.id}>
                      <TopicRow
                        topic={c}
                        onLog={() => setLogTarget(logTargetFor(c))}
                        onChange={invalidate}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}

      <LogReviewDialog
        target={logTarget}
        open={logTarget !== null}
        onOpenChange={(v) => !v && setLogTarget(null)}
        onLogged={invalidate}
      />
    </PageScaffold.Section>
  );
}

/** One topic row: ring, title, weight selector, status, log button. */
function TopicRow({
  topic,
  onLog,
  onChange,
}: {
  topic: TopicWithState;
  onLog: () => void;
  onChange: () => void;
}) {
  const [busy, setBusy] = useState(false);

  async function setWeight(weight: StudyWeight) {
    setBusy(true);
    const res = await updateStudyTopic({ id: topic.id, weight });
    setBusy(false);
    if (!res.success) {
      toast.error(res.error || "Could not update");
      return;
    }
    onChange();
  }

  async function remove() {
    setBusy(true);
    const res = await deleteStudyTopic({ id: topic.id });
    setBusy(false);
    if (!res.success) {
      toast.error(res.error || "Could not delete");
      return;
    }
    onChange();
  }

  return (
    <div
      className={cn(
        "group flex items-center gap-3 border-b border-[var(--edge)] py-2",
        busy && "opacity-50",
      )}
    >
      <RetentionRing
        retrievability={topic.retrievability}
        priority={topic.priority}
        unstudied={topic.reps === 0}
        showLabel
        size={28}
      />

      <div className="min-w-0 flex-1">
        <p className="truncate text-body text-[var(--ink)]">{topic.title}</p>
        <p className="truncate text-micro text-[var(--ink-faint)]">
          {STATUS_META[topic.status as StudyTopicStatus].label}
          {topic.reps > 0 && ` · ${topic.reps} review${topic.reps === 1 ? "" : "s"}`}
          {topic.lapses > 0 && ` · ${topic.lapses} blanked`}
          {topic.nextDueAt &&
            ` · due ${relativeDays((new Date(topic.nextDueAt).getTime() - Date.now()) / 86_400_000)}`}
        </p>
      </div>

      {/* Weight is the one thing you set by hand, so it is always visible
          rather than hidden behind an edit affordance. */}
      <div className="flex shrink-0 items-center gap-px rounded-lg bg-[var(--surface)] p-0.5">
        {WEIGHT_ORDER.map((w) => (
          <button
            key={w}
            type="button"
            title={`${WEIGHT_META[w].label} — ${WEIGHT_META[w].hint}`}
            onClick={() => void setWeight(w)}
            className={cn(
              "rounded-md px-1.5 py-0.5 text-[10px] font-medium transition-colors",
              topic.weight === w
                ? "bg-[var(--ink)] text-[var(--canvas)]"
                : "text-[var(--ink-faint)] hover:text-[var(--ink-muted)]",
            )}
          >
            {WEIGHT_META[w].short}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={onLog}
        className="shrink-0 rounded-md px-2 py-0.5 text-micro text-[var(--ink-muted)] transition-colors hover:bg-[var(--surface)] hover:text-[var(--ink)]"
      >
        Log
      </button>

      <button
        type="button"
        onClick={() => void remove()}
        title="Delete topic"
        className="shrink-0 rounded px-1 text-sm leading-none text-[var(--ink-faint)] opacity-0 transition-opacity hover:text-[var(--ink)] group-hover:opacity-100"
      >
        ×
      </button>
    </div>
  );
}

/**
 * Bulk topic entry: one per line, with two-space indentation making a line a
 * child of the one above it.
 *
 * A textarea rather than a row-at-a-time form because the realistic input is a
 * syllabus you are copying, and forty single-row submissions is how a tracker
 * dies in week one.
 */
function AddTopicsForm({
  projectId,
  onDone,
  onCancel,
}: {
  projectId: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState("");
  const [weight, setWeight] = useState<StudyWeight>("working");
  const [saving, setSaving] = useState(false);

  const parsed = parseOutline(text);

  async function submit() {
    if (parsed.length === 0) return;
    setSaving(true);
    const res = await createStudyTopics({
      projectId,
      topics: parsed.map((p) => ({
        title: p.title,
        weight,
        ...(p.parentIndex != null ? { parentIndex: p.parentIndex } : {}),
      })),
    });
    setSaving(false);
    if (!res.success) {
      toast.error(res.error || "Could not add topics");
      return;
    }
    toast.success(`Added ${res.data.ids.length} topics.`);
    setText("");
    onDone();
  }

  return (
    <div className="mb-4 rounded-xl border border-[var(--edge)] bg-[var(--surface)] p-3">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={7}
        autoFocus
        placeholder={
          "Laplace transforms\n  Region of convergence\n  Inverse transforms\nBode plots\nNyquist criterion"
        }
        className="w-full resize-y rounded-lg border border-[var(--edge)] bg-[var(--canvas)] px-2.5 py-2 font-mono text-xs leading-relaxed text-[var(--ink)] outline-none focus:border-[var(--ink-faint)]"
      />
      <p className="mt-1.5 text-micro text-[var(--ink-faint)]">
        One per line. Indent with two spaces to nest under the line above.
      </p>

      <div className="mt-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-micro text-[var(--ink-muted)]">Weight</span>
          <div className="flex items-center gap-px rounded-lg bg-[var(--canvas)] p-0.5">
            {WEIGHT_ORDER.map((w) => (
              <button
                key={w}
                type="button"
                title={WEIGHT_META[w].hint}
                onClick={() => setWeight(w)}
                className={cn(
                  "rounded-md px-1.5 py-0.5 text-[10px] font-medium transition-colors",
                  weight === w
                    ? "bg-[var(--ink)] text-[var(--canvas)]"
                    : "text-[var(--ink-faint)] hover:text-[var(--ink-muted)]",
                )}
              >
                {WEIGHT_META[w].short}
              </button>
            ))}
          </div>
          <span className="text-micro text-[var(--ink-faint)]">
            set per topic afterwards
          </span>
        </div>

        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
          <Button size="sm" onClick={() => void submit()} disabled={saving || parsed.length === 0}>
            {saving ? "Adding…" : `Add ${parsed.length || ""}`.trim()}
          </Button>
        </div>
      </div>
    </div>
  );
}

function AddAssessmentForm({
  projectId,
  onDone,
  onCancel,
}: {
  projectId: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState("midterm");
  const [dueDate, setDueDate] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!title.trim() || !dueDate) return;
    setSaving(true);
    const res = await createStudyAssessment({ projectId, title, kind, dueDate });
    setSaving(false);
    if (!res.success) {
      toast.error(res.error || "Could not add assessment");
      return;
    }
    toast.success("Assessment added.");
    onDone();
  }

  return (
    <div className="mb-4 flex flex-wrap items-end gap-2 rounded-xl border border-[var(--edge)] bg-[var(--surface)] p-3">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Midterm 1"
        autoFocus
        className="min-w-[160px] flex-1 rounded-lg border border-[var(--edge)] bg-[var(--canvas)] px-2 py-1.5 text-sm text-[var(--ink)] outline-none focus:border-[var(--ink-faint)]"
      />
      <select
        value={kind}
        onChange={(e) => setKind(e.target.value)}
        className="rounded-lg border border-[var(--edge)] bg-[var(--canvas)] px-2 py-1.5 text-sm text-[var(--ink)] outline-none"
      >
        {Object.entries(ASSESSMENT_KIND_LABEL).map(([k, label]) => (
          <option key={k} value={k}>
            {label}
          </option>
        ))}
      </select>
      <input
        type="date"
        value={dueDate}
        onChange={(e) => setDueDate(e.target.value)}
        className="rounded-lg border border-[var(--edge)] bg-[var(--canvas)] px-2 py-1.5 text-sm tabular-nums text-[var(--ink)] outline-none focus:border-[var(--ink-faint)]"
      />
      <Button variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
        Cancel
      </Button>
      <Button size="sm" onClick={() => void submit()} disabled={saving || !title.trim() || !dueDate}>
        {saving ? "Adding…" : "Add"}
      </Button>
    </div>
  );
}

// ─── HELPERS ───────────────────────────────────────────────────────────────

/** Parse an indented outline into a flat list with backward parent pointers. */
export function parseOutline(
  text: string,
): Array<{ title: string; parentIndex?: number }> {
  const out: Array<{ title: string; parentIndex?: number }> = [];
  let lastRootIndex: number | null = null;

  for (const raw of text.split("\n")) {
    if (!raw.trim()) continue;
    const indented = /^(\s{2,}|\t)/.test(raw);
    const title = raw.trim().replace(/^[-*•]\s*/, "");
    if (!title) continue;

    if (indented && lastRootIndex !== null) {
      out.push({ title, parentIndex: lastRootIndex });
    } else {
      out.push({ title });
      lastRootIndex = out.length - 1;
    }
  }
  return out;
}

function memoryOf(t: TopicWithState) {
  return {
    weight: t.weight as StudyWeight,
    difficulty: t.difficulty,
    stability: t.stability,
    lastReviewedAt: t.lastReviewedAt,
    reps: t.reps,
    lapses: t.lapses,
  };
}

function logTargetFor(t: TopicWithState): LogTarget {
  return {
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
  };
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
