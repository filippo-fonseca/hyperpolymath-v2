"use client";

import { useDraggable, useDroppable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { format, isSameDay, isToday } from "date-fns";
import type { PlanItemWithTopic } from "@/lib/db/queries/study";
import { analyzeDay } from "@/lib/study/scheduler";
import { tintFor } from "@/lib/tint";
import { cn } from "@/lib/utils";

/**
 * One day on the plan board.
 *
 * Days, not time slots. The user assigns topics to a day and fits them into the
 * real schedule himself, so the column has no hour grid and no duration — just
 * an ordered list of what this day is for.
 *
 * Craft register: the column body is a soft recessed well that the cards sit in,
 * so the board reads as plates on paper. Today borrows the tint on its fill; the
 * active drop target borrows it on the rim.
 */
export function PlanDayColumn({
  dateISO,
  date,
  items,
  isAnyDragging,
  examMarkers,
  onLog,
  onRemove,
}: {
  dateISO: string;
  date: Date;
  items: PlanItemWithTopic[];
  isAnyDragging: boolean;
  /** Assessments falling on this day, rendered as a banner above the well. */
  examMarkers: Array<{ id: string; title: string; courseCode: string | null }>;
  onLog: (item: PlanItemWithTopic) => void;
  onRemove: (item: PlanItemWithTopic) => void;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: `day:${dateISO}` });
  const today = isToday(date);

  // Advisory only. Interleaving beats blocking mainly because most exam errors
  // are choosing the wrong method, and you only practise that choice when
  // consecutive problems differ.
  const analysis = analyzeDay(items.map((i) => ({ parentId: i.topicParentId })));

  const done = items.filter((i) => i.status === "done").length;

  return (
    <div className="tint-sky flex min-w-0 flex-col gap-1.5">
      <div className="flex items-baseline justify-between px-1.5 pb-1">
        <span
          className={cn(
            "text-micro",
            today ? "text-[var(--tint-ink)]" : "text-[var(--ink-faint)]",
          )}
        >
          {format(date, "EEE")}
        </span>
        <span
          className={cn(
            "text-xs tabular-nums",
            today
              ? "rounded-md bg-[var(--tint-bg)] px-1.5 font-medium text-[var(--tint-ink)]"
              : "text-[var(--ink-faint)]",
          )}
        >
          {format(date, "d")}
        </span>
      </div>

      {examMarkers.map((e) => (
        <div
          key={e.id}
          className="rounded-lg border border-[#ef4444]/25 bg-[#ef4444]/8 px-1.5 py-1"
          title={`${e.title}${e.courseCode ? ` · ${e.courseCode}` : ""}`}
        >
          <p className="truncate text-[10px] font-medium text-[#ef4444]">{e.title}</p>
        </div>
      ))}

      <div
        ref={setNodeRef}
        className={cn(
          "flex min-h-[110px] flex-1 flex-col gap-1.5 rounded-2xl border border-transparent p-1.5",
          "transition-[background-color,border-color] duration-[160ms] ease-out",
          today ? "bg-[var(--tint-bg)]" : "bg-[var(--surface)]",
          isAnyDragging && "border-[var(--edge)]",
          isOver && "border-[var(--tint-edge)] bg-[var(--tint-bg)]",
        )}
      >
        {items.map((item) => (
          <PlanCard
            key={item.id}
            item={item}
            onLog={() => onLog(item)}
            onRemove={() => onRemove(item)}
          />
        ))}

        {items.length === 0 && (
          <p className="m-auto px-1 text-center text-[10px] text-[var(--ink-faint)]">
            {isOver ? "Drop here" : ""}
          </p>
        )}
      </div>

      {(analysis.isBlocked || done > 0) && (
        <div className="px-1 text-[10px] leading-tight text-[var(--ink-faint)]">
          {done > 0 && (
            <span className="tabular-nums">
              {done}/{items.length} done
            </span>
          )}
          {analysis.isBlocked && (
            <span
              className="block text-[#f59e0b]"
              title="Most exam mistakes are picking the wrong method. Mixing units in one sitting is what trains that choice."
            >
              all one unit — mix it up?
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/** One planned topic. Draggable between days, click to log it. */
function PlanCard({
  item,
  onLog,
  onRemove,
}: {
  item: PlanItemWithTopic;
  onLog: () => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `plan:${item.id}`,
    data: { kind: "plan", planItemId: item.id, topicId: item.topicId },
  });

  const isDone = item.status === "done";
  const isSkipped = item.status === "skipped";
  const tint = tintFor(item.projectId);

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform) }}
      className={cn(
        tint,
        "group relative cursor-grab rounded-xl border px-2 py-1.5",
        "bg-[var(--surface-raised)] transition-[opacity,box-shadow] duration-[160ms]",
        isDone
          ? "border-transparent bg-[var(--tint-bg)]"
          : "border-[var(--edge)]",
        isSkipped && "opacity-45",
        isDragging && "z-50 cursor-grabbing opacity-90 shadow-[var(--shadow-card)]",
      )}
      {...listeners}
      {...attributes}
    >
      <div className="flex items-start gap-1.5">
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            if (!isDone) onLog();
          }}
          disabled={isDone}
          title={isDone ? "Logged" : "Log this review"}
          className={cn(
            "mt-[2px] size-3 shrink-0 rounded-[4px] border transition-colors",
            isDone
              ? "border-[var(--tint-edge)] bg-[var(--tint-edge)]"
              : "border-[var(--edge)] hover:border-[var(--ink-muted)]",
          )}
        >
          {isDone && (
            <svg viewBox="0 0 10 10" className="size-full p-[1.5px]" aria-hidden>
              <path
                d="M1.5 5.2 4 7.5 8.5 2.5"
                fill="none"
                stroke="var(--canvas)"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </button>

        <div className="min-w-0 flex-1">
          <p
            className={cn(
              "truncate text-[11px] leading-tight text-[var(--ink)]",
              isDone && "line-through decoration-[var(--ink-faint)]",
            )}
          >
            {item.topicTitle}
          </p>
          <p className="truncate text-[10px] leading-tight text-[var(--ink-faint)]">
            <span style={{ color: "var(--tint-ink)" }}>
              {item.courseCode ?? item.projectName}
            </span>
            {item.assessmentTitle ? ` · ${item.assessmentTitle}` : ""}
          </p>
        </div>

        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          title="Remove from this day"
          className={cn(
            "-mr-0.5 shrink-0 rounded px-1 text-[11px] leading-none opacity-0 transition-opacity",
            "text-[var(--ink-faint)] hover:text-[var(--ink)]",
            "group-hover:opacity-100 focus-visible:opacity-100",
          )}
        >
          ×
        </button>
      </div>
    </div>
  );
}

export function isSameDayISO(a: Date, b: Date): boolean {
  return isSameDay(a, b);
}
