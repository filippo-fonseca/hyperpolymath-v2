"use client";

import { useDraggable, useDroppable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { format, isPast, isToday, isTomorrow } from "date-fns";
import type { PlanItemWithTopic } from "@/lib/db/queries/study";
import { analyzeDay } from "@/lib/study/scheduler";
import { tintFor } from "@/lib/tint";
import { cn } from "@/lib/utils";

/**
 * One day in the plan, as a ROW.
 *
 * This started as a 7-column calendar grid mirroring the training board, and
 * that was wrong here. The cockpit stage is ~660px with the dock open, and once
 * the fading rail takes its 260px a seven-column grid leaves ~50px per column —
 * narrow enough that every topic title truncates to two words. A board you
 * cannot read is not a board.
 *
 * Rows also match what the plan actually is. There are no time slots and no
 * durations: a day is a bag of topics, which reads as an agenda line, not as a
 * column of scheduled blocks.
 */
export function PlanDayRow({
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
  examMarkers: Array<{ id: string; title: string; courseCode: string | null }>;
  onLog: (item: PlanItemWithTopic) => void;
  onRemove: (item: PlanItemWithTopic) => void;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: `day:${dateISO}` });
  const today = isToday(date);
  const past = isPast(date) && !today;

  const analysis = analyzeDay(items.map((i) => ({ parentId: i.topicParentId })));
  const done = items.filter((i) => i.status === "done").length;

  return (
    <div className={cn("tint-sky flex gap-3", past && "opacity-60")}>
      {/* Date gutter. Fixed width so every row's topics start on one line. */}
      <div className="w-[60px] shrink-0 pt-1.5 text-right">
        <p
          className={cn(
            "text-micro leading-none",
            today ? "font-medium text-[var(--tint-ink)]" : "text-[var(--ink-faint)]",
          )}
        >
          {today ? "Today" : isTomorrow(date) ? "Tmrw" : format(date, "EEE")}
        </p>
        <p
          className={cn(
            "mt-0.5 text-xs tabular-nums leading-none",
            today ? "text-[var(--tint-ink)]" : "text-[var(--ink-faint)]",
          )}
        >
          {format(date, "d MMM")}
        </p>
      </div>

      <div
        ref={setNodeRef}
        className={cn(
          "min-h-[38px] flex-1 rounded-xl border border-transparent p-1.5",
          "transition-[background-color,border-color] duration-[160ms] ease-out",
          today ? "bg-[var(--tint-bg)]" : "bg-[var(--surface)]",
          isAnyDragging && "border-[var(--edge)]",
          isOver && "border-[var(--tint-edge)] bg-[var(--tint-bg)]",
        )}
      >
        {examMarkers.length > 0 && (
          <div className="mb-1.5 flex flex-wrap gap-1">
            {examMarkers.map((e) => (
              <span
                key={e.id}
                className="rounded-md border border-[#ef4444]/30 bg-[#ef4444]/10 px-1.5 py-0.5 text-[10px] font-medium text-[#ef4444]"
              >
                {e.courseCode ? `${e.courseCode} · ` : ""}
                {e.title}
              </span>
            ))}
          </div>
        )}

        {items.length === 0 ? (
          <p className="px-1 py-1 text-[11px] text-[var(--ink-faint)]">
            {isOver ? "Drop here" : "—"}
          </p>
        ) : (
          <div className="flex flex-wrap gap-1">
            {items.map((item) => (
              <PlanChip
                key={item.id}
                item={item}
                onLog={() => onLog(item)}
                onRemove={() => onRemove(item)}
              />
            ))}
          </div>
        )}

        {(analysis.isBlocked || done > 0) && (
          <div className="mt-1 flex items-center gap-2 px-1 text-[10px] text-[var(--ink-faint)]">
            {done > 0 && (
              <span className="tabular-nums">
                {done}/{items.length} done
              </span>
            )}
            {analysis.isBlocked && (
              <span
                className="text-[#f59e0b]"
                title="Most exam mistakes are picking the wrong method. Mixing units in one sitting is what trains that choice."
              >
                all one unit — mix it up?
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** One planned topic. Draggable between days; the checkbox opens the log sheet. */
function PlanChip({
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

  // Drop dnd-kit's role="button": this chip contains two real buttons, and a
  // button wrapping buttons both nests invalidly and absorbs their accessible
  // names into its own. See the matching note in FadingRail.
  const { role: _dragRole, ...dragAttributes } = attributes;

  const isDone = item.status === "done";
  const isSkipped = item.status === "skipped";

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform) }}
      className={cn(
        tintFor(item.projectId),
        "group inline-flex max-w-full cursor-grab items-center gap-1.5 rounded-lg border py-1 pl-1.5 pr-1",
        "bg-[var(--surface-raised)] transition-[opacity,box-shadow] duration-[160ms]",
        isDone ? "border-transparent bg-[var(--tint-bg)]" : "border-[var(--edge)]",
        isSkipped && "opacity-45",
        isDragging && "z-50 cursor-grabbing opacity-90 shadow-[var(--shadow-card)]",
      )}
      {...listeners}
      {...dragAttributes}
    >
      <button
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          if (!isDone) onLog();
        }}
        disabled={isDone}
        aria-label={isDone ? `${item.topicTitle} logged` : `Log review for ${item.topicTitle}`}
        className={cn(
          "size-3 shrink-0 rounded-[4px] border transition-colors",
          isDone
            ? "border-[var(--tint-edge)] bg-[var(--tint-edge)]"
            : "border-[var(--edge-strong)] hover:border-[var(--ink-muted)]",
        )}
      >
        {isDone && (
          <svg viewBox="0 0 10 10" className="size-full p-[1px]" aria-hidden>
            <path
              d="M1.5 5.2 4 7.5 8.5 2.5"
              fill="none"
              stroke="var(--canvas)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </button>

      <span className="flex min-w-0 flex-col leading-tight">
        <span
          className={cn(
            "truncate text-[11px] text-[var(--ink)]",
            isDone && "line-through decoration-[var(--ink-faint)]",
          )}
        >
          {item.topicTitle}
        </span>
        <span className="truncate text-[9px] text-[var(--ink-faint)]">
          {item.assessmentTitle ?? item.courseCode ?? item.projectName}
        </span>
      </span>

      <button
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        aria-label={`Remove ${item.topicTitle} from this day`}
        className={cn(
          "shrink-0 rounded px-0.5 text-[11px] leading-none opacity-0 transition-opacity",
          "text-[var(--ink-faint)] hover:text-[var(--ink)]",
          "group-hover:opacity-100 focus-visible:opacity-100",
        )}
      >
        ×
      </button>
    </div>
  );
}
