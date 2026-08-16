"use client";

import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { useMemo, useState } from "react";
import type { TopicWithState } from "@/lib/db/queries/study";
import { tintFor } from "@/lib/tint";
import { cn } from "@/lib/utils";
import { RetentionRing } from "./RetentionRing";
import {
  URGENCY_META,
  WEIGHT_META,
  bareDays,
  relativeDays,
  urgencyBand,
} from "./study-ui";
import type { StudyWeight } from "@/lib/study/scheduler";

/**
 * The "Fading now" rail — the model's entire voice in this feature.
 *
 * It ranks and it explains. It never places anything: the user drags. That
 * split is deliberate, because he knows his own courses better than a
 * forgetting curve does, but nobody can eyeball which of forty topics has
 * decayed furthest.
 */
export function FadingRail({
  topics,
  plannedTopicIds,
  onLog,
  classFilter,
  onClassFilterChange,
  classes,
}: {
  topics: TopicWithState[];
  /** Topics already on the board in the visible window — dimmed, not hidden. */
  plannedTopicIds: Set<string>;
  onLog: (topic: TopicWithState) => void;
  classFilter: string | null;
  onClassFilterChange: (id: string | null) => void;
  classes: Array<{ id: string; name: string; courseCode: string | null }>;
}) {
  const [showFresh, setShowFresh] = useState(false);

  const { due, fresh } = useMemo(() => {
    const filtered = classFilter
      ? topics.filter((t) => t.projectId === classFilter)
      : topics;
    const sorted = [...filtered].sort((a, b) => b.priority - a.priority);
    return {
      due: sorted.filter((t) => t.priority > 0),
      fresh: sorted.filter((t) => t.priority <= 0),
    };
  }, [topics, classFilter]);

  const visible = showFresh ? [...due, ...fresh] : due;

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-title font-semibold text-[var(--ink)]">Fading now</h2>
        <span className="text-micro tabular-nums text-[var(--ink-faint)]">
          {due.length}
        </span>
      </div>

      {classes.length > 1 && (
        <div className="flex flex-wrap gap-1">
          <FilterChip
            active={classFilter === null}
            onClick={() => onClassFilterChange(null)}
          >
            All
          </FilterChip>
          {classes.map((c) => (
            <FilterChip
              key={c.id}
              active={classFilter === c.id}
              onClick={() => onClassFilterChange(c.id === classFilter ? null : c.id)}
            >
              {c.courseCode ?? c.name}
            </FilterChip>
          ))}
        </div>
      )}

      {visible.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[var(--edge)] px-3 py-6 text-center text-meta text-[var(--ink-faint)]">
          {due.length === 0 && fresh.length > 0
            ? "Nothing is fading. Everything is above its bar."
            : "No topics yet. Add some on a class page."}
        </p>
      ) : (
        <ul className="flex min-h-0 flex-col gap-1.5 overflow-y-auto pr-0.5">
          {visible.map((t) => (
            <FadingCard
              key={t.id}
              topic={t}
              planned={plannedTopicIds.has(t.id)}
              onLog={() => onLog(t)}
            />
          ))}
        </ul>
      )}

      {fresh.length > 0 && (
        <button
          type="button"
          onClick={() => setShowFresh((v) => !v)}
          className="self-start text-micro text-[var(--ink-faint)] underline-offset-2 hover:text-[var(--ink-muted)] hover:underline"
        >
          {showFresh ? "Hide" : `Show ${fresh.length} still fresh`}
        </button>
      )}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full px-2 py-0.5 text-micro transition-colors",
        active
          ? "bg-[var(--ink)] text-[var(--canvas)]"
          : "text-[var(--ink-faint)] hover:bg-[var(--surface)] hover:text-[var(--ink-muted)]",
      )}
    >
      {children}
    </button>
  );
}

/**
 * One draggable topic.
 *
 * The card carries exactly four things: how faded it is (the ring), what it is,
 * which class it belongs to, and why it is here (the reason line). Anything more
 * and a rail of twenty stops being scannable, which is the only job it has.
 */
function FadingCard({
  topic,
  planned,
  onLog,
}: {
  topic: TopicWithState;
  planned: boolean;
  onLog: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `topic:${topic.id}`,
    data: { kind: "topic", topicId: topic.id },
  });

  const band = urgencyBand(topic.priority);
  const unstudied = topic.reps === 0;
  const tint = tintFor(topic.projectId);

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform) }}
      className={cn(
        tint,
        "group craft-card-hover relative flex cursor-grab items-center gap-2.5 rounded-xl px-2.5 py-2",
        "border border-[var(--edge)] bg-[var(--surface-raised)]",
        "transition-[opacity,box-shadow] duration-[160ms]",
        isDragging && "z-50 cursor-grabbing opacity-90 shadow-[var(--shadow-card)]",
        planned && !isDragging && "opacity-45",
      )}
      {...listeners}
      {...attributes}
    >
      <RetentionRing
        retrievability={topic.retrievability}
        priority={topic.priority}
        unstudied={unstudied}
        showLabel
        size={28}
      />

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-[var(--ink)]">{topic.title}</p>
        <p className="truncate text-micro text-[var(--ink-faint)]">
          <span style={{ color: "var(--tint-ink)" }}>
            {topic.courseCode ?? topic.projectName}
          </span>
          {" · "}
          {reasonFor(topic, band, unstudied)}
        </p>
      </div>

      <span
        className="shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-medium"
        style={{ background: "var(--tint-bg)", color: "var(--tint-ink)" }}
        title={WEIGHT_META[topic.weight as StudyWeight].hint}
      >
        {WEIGHT_META[topic.weight as StudyWeight].short}
      </span>

      {/* Logging from the rail covers the honest case where you revised
          something without ever planning it. Hidden until hover so the
          resting state stays quiet. */}
      <button
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onLog();
        }}
        className={cn(
          "shrink-0 rounded-md px-1.5 py-0.5 text-micro opacity-0 transition-opacity",
          "text-[var(--ink-faint)] hover:bg-[var(--surface)] hover:text-[var(--ink)]",
          "group-hover:opacity-100 focus-visible:opacity-100",
        )}
      >
        Log
      </button>
    </li>
  );
}

/** The one-line justification. Says why this topic is where it is in the list. */
function reasonFor(
  topic: TopicWithState,
  band: ReturnType<typeof urgencyBand>,
  unstudied: boolean,
): string {
  if (unstudied) return "never reviewed";

  const exam = topic.nextAssessment;
  if (exam) {
    const days = daysUntil(exam.dueDate);
    if (days <= 14) return `${exam.title} ${relativeDays(days)}`;
  }

  if (topic.lastReviewedAt) {
    const ago = (Date.now() - new Date(topic.lastReviewedAt).getTime()) / 86_400_000;
    return `${URGENCY_META[band].label.toLowerCase()} · ${bareDays(ago)} ago`;
  }
  return URGENCY_META[band].label.toLowerCase();
}

function daysUntil(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  const target = new Date(y!, m! - 1, d!);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}
