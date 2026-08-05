"use client";

import { cancelActivity, deleteActivity, skipActivity } from "@/app/actions/training";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ActivityWithType } from "@/lib/db/queries/training";
import { type DistanceUnit, formatDistance } from "@/lib/training/distance";
import { cn } from "@/lib/utils";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Check, MinusCircle, MoreHorizontal, X } from "lucide-react";
import { motion } from "motion/react";
import { toast } from "sonner";
import type { ActivityOptimisticDispatch } from "./TrainingClient";
import { TypeIcon } from "./TypeIcon";
import { typeFill, typeInk } from "./type-color";

interface Props {
  activity: ActivityWithType;
  distanceUnit: DistanceUnit;
  /** RT-06 optimistic dispatch — cancel/skip flip status, delete removes instantly. */
  addOptimistic: ActivityOptimisticDispatch;
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
 *   - single-line subline mashing type/duration/distance
 *   - kebab menu (mark cancelled / skipped / delete)
 *
 * Craft register (jul-29): the card is the TaskCard idiom at planner density —
 * a raised white plate (`--surface-raised`), one `--edge` hairline, the soft
 * `--shadow-card`, and a hover that only deepens border + shadow over 160ms.
 * No scale, no glow.
 *
 * The activity type's stored OKLCH colour is its identity. It is softened to a
 * 14% wash for the leading icon plate (`typeFill`) and only stays saturated on
 * the icon glyph itself, per the register's "pastel fills, saturated accents"
 * rule. The old 3px stripe is retired: the plate carries the same information
 * and gives the icon somewhere to live.
 *
 * Drag handle is the whole card (no separate grip). Motion `layoutId` is
 * pre-existing and lets the card slide when the list reorders after a drag.
 */
export function ActivityCard({ activity, distanceUnit, addOptimistic, onCheckOff, onEdit }: Props) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: activity.id,
  });

  const style = transform ? { transform: CSS.Translate.toString(transform) } : undefined;

  const distanceKm = activity.actualDistanceKm ?? activity.plannedDistanceKm ?? null;
  const distanceLabel =
    activity.type.hasDistance && distanceKm != null
      ? formatDistance(Number(distanceKm), distanceUnit)
      : null;

  const durationMin = activity.actualDurationMin ?? activity.plannedDurationMin ?? null;

  const isDone = activity.status === "done";
  const isCancelled = activity.status === "cancelled";
  const isSkipped = activity.status === "skipped";

  const handleCardClick = () => {
    if (!onCheckOff) return;
    if (isDone || isCancelled || isSkipped) return;
    onCheckOff(activity);
  };

  const handleCancel = async () => {
    addOptimistic({ type: "update", id: activity.id, patch: { status: "cancelled" } });
    const res = await cancelActivity({ id: activity.id });
    if (!res.success) {
      toast.error(res.error || "Could not cancel");
      addOptimistic({ type: "revert", id: activity.id });
    }
  };

  const handleSkip = async () => {
    addOptimistic({ type: "update", id: activity.id, patch: { status: "skipped" } });
    const res = await skipActivity({ id: activity.id });
    if (!res.success) {
      toast.error(res.error || "Could not skip");
      addOptimistic({ type: "revert", id: activity.id });
    }
  };

  const handleDelete = async () => {
    addOptimistic({ type: "delete", id: activity.id });
    const res = await deleteActivity({ id: activity.id });
    if (!res.success) {
      toast.error(res.error || "Could not delete");
      addOptimistic({ type: "revert", id: activity.id });
    }
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
        // The card idiom, at planner density.
        "group relative flex cursor-grab touch-none select-none items-start gap-2 rounded-xl border border-[var(--edge)] bg-[var(--surface-raised)] p-1.5 text-xs",
        "shadow-[var(--shadow-card)]",
        "transition-[border-color,box-shadow] duration-[160ms] ease-out",
        !isDragging &&
          "hover:border-[var(--edge-strong)] hover:shadow-[var(--shadow-card-hover)]",
        isDragging && "z-10 cursor-grabbing opacity-60",
        isDone && "opacity-60",
        (isCancelled || isSkipped) && "opacity-50"
      )}
    >
      {/* Type identity: the stored colour softened to a pastel plate, with the
          glyph left saturated. Falls back to a dot when the type has no icon. */}
      <span
        aria-hidden
        className="mt-px flex size-5 shrink-0 items-center justify-center rounded-md"
        style={{
          backgroundColor: typeFill(activity.type.color),
          color: typeInk(activity.type.color),
        }}
      >
        {activity.type.icon ? (
          <TypeIcon name={activity.type.icon} size={11} />
        ) : (
          <span
            className="size-1.5 rounded-full"
            style={{ backgroundColor: activity.type.color }}
          />
        )}
      </span>

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-center gap-1">
          {isDone ? (
            <Check size={11} strokeWidth={2} className="shrink-0 text-[var(--sd-accent)]" />
          ) : isCancelled ? (
            <X size={11} strokeWidth={2} className="shrink-0 text-[var(--sd-ink-faint)]" />
          ) : isSkipped ? (
            <MinusCircle size={11} strokeWidth={2} className="shrink-0 text-[var(--sd-ink-faint)]" />
          ) : null}
          <span
            className={cn(
              "truncate text-xs leading-tight text-[var(--sd-ink)]",
              isDone && "line-through",
              isCancelled && "line-through",
              isSkipped && "italic"
            )}
          >
            {activity.title}
          </span>
        </div>
        <div className="flex items-center gap-1 text-micro text-[var(--sd-ink-faint)]">
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
            className="flex size-5 shrink-0 items-center justify-center rounded-md text-[var(--sd-ink-faint)] opacity-0 transition-opacity duration-[160ms] ease-out hover:bg-[var(--hover)] hover:text-[var(--sd-ink)] group-hover:opacity-100 focus-visible:opacity-100"
          >
            <MoreHorizontal size={12} strokeWidth={1.5} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem disabled={isDone} onSelect={() => onCheckOff?.(activity)}>
            <Check size={12} strokeWidth={1.5} className="mr-2" />
            Mark done
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!onEdit} onSelect={() => onEdit?.(activity)}>
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
          <DropdownMenuItem onSelect={handleDelete} className="text-[var(--ink-coral)]">
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </motion.div>
  );
}
