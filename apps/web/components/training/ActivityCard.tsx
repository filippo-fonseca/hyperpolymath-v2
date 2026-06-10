"use client";

import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { motion } from "motion/react";
import { Check, MinusCircle, MoreHorizontal, RotateCcw, X } from "lucide-react";
import { toast } from "sonner";
import {
  cancelActivity,
  deleteActivity,
  skipActivity,
  uncompleteActivity,
} from "@/app/actions/training";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ActivityWithType } from "@/lib/db/queries/training";
import { formatDistance, type DistanceUnit } from "@/lib/training/distance";
import { cn } from "@/lib/utils";

interface Props {
  activity: ActivityWithType;
  distanceUnit: DistanceUnit;
  /**
   * Optional click handler. The CompleteActivityDialog ships in plan 15-04;
   * for now the card body click is a no-op when no handler is supplied. The
   * kebab menu still lets the user mark cancelled/skipped/delete.
   */
  onCheckOff?: (activity: ActivityWithType) => void;
  /**
   * Opens the ActivityEditDialog (Plan 15-04) for the kebab-menu "Edit" item.
   */
  onEdit?: (activity: ActivityWithType) => void;
}

/**
 * Compact activity card. Smaller density than TaskCard per D-01:
 *   - text-xs across the board (TaskCard uses text-sm)
 *   - 3px color stripe instead of a chip
 *   - single-line subline mashing type/duration/distance
 *   - kebab menu (mark cancelled / skipped / delete) — "mark done" wired in 15-04
 *
 * Drag handle is the whole card (no separate grip). Motion `layoutId` lets the
 * card slide smoothly when the underlying list reorders after a drag.
 */
export function ActivityCard({
  activity,
  distanceUnit,
  onCheckOff,
  onEdit,
}: Props) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: activity.id });

  const style = transform
    ? { transform: CSS.Translate.toString(transform) }
    : undefined;

  const distanceKm =
    activity.actualDistanceKm ?? activity.plannedDistanceKm ?? null;
  const distanceLabel =
    activity.type.hasDistance && distanceKm != null
      ? formatDistance(Number(distanceKm), distanceUnit)
      : null;

  const durationMin =
    activity.actualDurationMin ?? activity.plannedDurationMin ?? null;

  const isDone = activity.status === "done";
  const isCancelled = activity.status === "cancelled";
  const isSkipped = activity.status === "skipped";

  const handleCardClick = () => {
    if (!onCheckOff) return;
    if (isDone || isCancelled || isSkipped) return;
    onCheckOff(activity);
  };

  const handleCancel = async () => {
    const res = await cancelActivity({ id: activity.id });
    if (!res.success) toast.error(res.error || "Could not cancel");
  };

  const handleSkip = async () => {
    const res = await skipActivity({ id: activity.id });
    if (!res.success) toast.error(res.error || "Could not skip");
  };

  const handleRevert = async () => {
    const res = await uncompleteActivity({ id: activity.id });
    if (!res.success) toast.error(res.error || "Could not revert");
  };

  const handleDelete = async () => {
    const res = await deleteActivity({ id: activity.id });
    if (!res.success) toast.error(res.error || "Could not delete");
  };

  return (
    <motion.div
      ref={setNodeRef}
      style={style}
      layoutId={activity.id}
      {...attributes}
      {...listeners}
      onClick={handleCardClick}
      className={cn(
        "group relative flex cursor-grab touch-none select-none items-stretch gap-1.5 rounded border border-[var(--edge)] bg-[var(--bg)] pr-1.5 text-xs shadow-sm transition-shadow",
        "hover:shadow-md",
        isDragging && "z-10 cursor-grabbing opacity-60 shadow-lg",
        isDone && "opacity-60",
        (isCancelled || isSkipped) && "opacity-50",
      )}
    >
      {/* 3px color stripe — type accent */}
      <div
        aria-hidden
        className="w-[3px] shrink-0 rounded-l"
        style={{ backgroundColor: activity.type.color }}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 py-1 pl-0.5">
        <div className="flex items-center gap-1">
          {isDone ? (
            <Check size={11} strokeWidth={2} className="shrink-0 text-[var(--ink-muted)]" />
          ) : isCancelled ? (
            <X size={11} strokeWidth={2} className="shrink-0 text-[var(--ink-muted)]" />
          ) : isSkipped ? (
            <MinusCircle size={11} strokeWidth={2} className="shrink-0 text-[var(--ink-muted)]" />
          ) : null}
          <span
            className={cn(
              "truncate font-serif text-xs leading-tight",
              isDone && "line-through",
              isCancelled && "line-through",
              isSkipped && "italic",
            )}
          >
            {activity.title}
          </span>
        </div>
        <div className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.04em] text-[var(--ink-muted)]">
          <span className="truncate">{activity.type.name}</span>
          {durationMin != null ? (
            <>
              <span>·</span>
              <span>{durationMin}m</span>
            </>
          ) : null}
          {distanceLabel ? (
            <>
              <span>·</span>
              <span>{distanceLabel}</span>
            </>
          ) : null}
        </div>
      </div>

      {/* Kebab menu — stopPropagation so click doesn't bubble to card body */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            aria-label="Activity actions"
            className="m-1 flex h-5 w-5 shrink-0 items-center justify-center rounded text-[var(--ink-muted)] opacity-0 transition-opacity hover:bg-[var(--surface)] group-hover:opacity-100 focus-visible:opacity-100"
          >
            <MoreHorizontal size={12} strokeWidth={1.5} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          {isDone || isCancelled || isSkipped ? (
            <DropdownMenuItem onSelect={handleRevert}>
              <RotateCcw size={12} strokeWidth={1.5} className="mr-2" />
              {isDone ? "Unmark done" : "Revert to planned"}
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onSelect={() => onCheckOff?.(activity)}>
              <Check size={12} strokeWidth={1.5} className="mr-2" />
              Mark done
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            disabled={!onEdit}
            onSelect={() => onEdit?.(activity)}
          >
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem disabled={isCancelled} onSelect={handleCancel}>
            <X size={12} strokeWidth={1.5} className="mr-2" />
            Mark cancelled
          </DropdownMenuItem>
          <DropdownMenuItem disabled={isSkipped} onSelect={handleSkip}>
            <MinusCircle size={12} strokeWidth={1.5} className="mr-2" />
            Mark skipped
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={handleDelete}
            className="text-[var(--danger,var(--ink))]"
          >
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </motion.div>
  );
}
