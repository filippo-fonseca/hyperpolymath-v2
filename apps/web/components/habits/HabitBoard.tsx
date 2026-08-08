"use client";

import type { HabitWithAreas } from "@/app/actions/habits";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { HabitIcon } from "@/components/ui/icons";
import {
  HABIT_STATUSES,
  HABIT_STATUS_DOT,
  HABIT_STATUS_LABEL,
  HABIT_STATUS_TINT,
  type HabitStatus,
} from "@/lib/habits/status";
import { tintFor } from "@/lib/tint";
import { cn } from "@/lib/utils";
import { Flame, MoreHorizontal } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { memo, useEffect, useRef, useState } from "react";
import { scheduleLabel } from "./schedule";

/**
 * The habits board — the same ladder the rows already use, laid out as columns
 * you drag across.
 *
 * The list view answers "what is left today"; the board answers "where does
 * everything stand", which is a different question and was previously only
 * answerable by reading ten rows one at a time. Tasks already taught this
 * gesture (`tasks/KanbanBoard.tsx`), so the grammar is deliberately identical:
 * borderless pastel wells, a quiet micro header with a dot and a count, white
 * card plates, a dashed insertion slot on drag-over painted by direct DOM
 * mutation rather than React state (state on every dragover re-renders the
 * column mid-drop and produces a visible recoil).
 *
 * One difference from tasks, and it matters: a habit's column is a fact about
 * a DAY, not about the habit. Dropping a card writes `habit_completions` for
 * the day the page is showing, so paging back a week and dragging is backfill,
 * not a rewrite of today.
 */

export type HabitBoardStreak = { value: number; saturated: boolean };

interface Props {
  /** Habits scheduled on the day being shown, already filtered by the page. */
  habits: HabitWithAreas[];
  statusOf: (habitId: string) => HabitStatus;
  onSetStatus: (habitId: string, next: HabitStatus) => void;
  streakOf: (habitId: string) => HabitBoardStreak;
  /** Streaks are a today fact; on a backfilled day the flame is meaningless. */
  showStreaks: boolean;
  /** A day that has not started yet takes no writes. */
  disabled?: boolean;
}

export function HabitBoard({
  habits,
  statusOf,
  onSetStatus,
  streakOf,
  showStreaks,
  disabled,
}: Props) {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  // Id of the card that just landed, for the one sanctioned drop moment.
  const [settledId, setSettledId] = useState<string | null>(null);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (settleTimer.current) clearTimeout(settleTimer.current);
    },
    []
  );

  const draggedFrom = draggedId ? statusOf(draggedId) : null;

  function dropOnStatus(target: HabitStatus) {
    const id = draggedId;
    setDraggedId(null);
    if (!id || disabled) return;
    if (statusOf(id) === target) return;
    onSetStatus(id, target);
    setSettledId(id);
    if (settleTimer.current) clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => setSettledId((cur) => (cur === id ? null : cur)), 450);
  }

  const byStatus = HABIT_STATUSES.map((status) => ({
    status,
    habits: habits.filter((h) => statusOf(h.id) === status),
  }));

  return (
    <div className="flex flex-col gap-3 pb-4 @4xl/main:flex-row @4xl/main:items-stretch @4xl/main:gap-4">
      {byStatus.map(({ status, habits: columnHabits }) => (
        <HabitBoardColumn
          key={status}
          status={status}
          habits={columnHabits}
          draggedId={draggedId}
          draggedFrom={draggedFrom}
          settledId={settledId}
          disabled={disabled}
          showStreaks={showStreaks}
          streakOf={streakOf}
          statusOf={statusOf}
          onSetStatus={onSetStatus}
          onDragStart={setDraggedId}
          onDragEnd={() => setDraggedId(null)}
          onDrop={dropOnStatus}
        />
      ))}
    </div>
  );
}

const HabitBoardColumn = memo(function HabitBoardColumn({
  status,
  habits,
  draggedId,
  draggedFrom,
  settledId,
  disabled,
  showStreaks,
  streakOf,
  statusOf,
  onSetStatus,
  onDragStart,
  onDragEnd,
  onDrop,
}: {
  status: HabitStatus;
  habits: HabitWithAreas[];
  draggedId: string | null;
  draggedFrom: HabitStatus | null;
  settledId: string | null;
  disabled?: boolean;
  showStreaks: boolean;
  streakOf: (habitId: string) => HabitBoardStreak;
  statusOf: (habitId: string) => HabitStatus;
  onSetStatus: (habitId: string, next: HabitStatus) => void;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onDrop: (target: HabitStatus) => void;
}) {
  const wellRef = useRef<HTMLDivElement>(null);
  const slotRef = useRef<HTMLDivElement>(null);

  const isValidTarget = () => !disabled && draggedId !== null && draggedFrom !== status;

  // Direct DOM, not state — see the module docstring.
  const lightUp = () => {
    if (wellRef.current)
      wellRef.current.style.background =
        "color-mix(in srgb, var(--tint-edge, var(--accent)) 14%, var(--tint-bg, var(--surface)))";
    if (slotRef.current) {
      slotRef.current.style.height = "2.75rem";
      slotRef.current.style.marginTop = "0.5rem";
      slotRef.current.style.opacity = "1";
    }
  };
  const dimDown = () => {
    if (wellRef.current) wellRef.current.style.background = "";
    if (slotRef.current) {
      slotRef.current.style.height = "0px";
      slotRef.current.style.marginTop = "0px";
      slotRef.current.style.opacity = "0";
    }
  };

  return (
    <div
      ref={wellRef}
      data-habit-status={status}
      className={cn(
        "flex w-full flex-col rounded-xl @4xl/main:flex-1 @4xl/main:basis-0 @4xl/main:min-w-0",
        // Borderless pastel well, exactly as the task board's columns.
        HABIT_STATUS_TINT[status],
        "bg-[var(--tint-bg,var(--surface))]",
        "transition-[background-color] duration-[160ms] ease-out"
      )}
      onDragOver={(e) => {
        if (!isValidTarget()) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        lightUp();
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) dimDown();
      }}
      onDrop={(e) => {
        e.preventDefault();
        dimDown();
        if (isValidTarget()) onDrop(status);
      }}
    >
      <div className="flex min-w-0 items-center gap-2 px-4 pt-3 pb-2">
        <span
          aria-hidden
          className="size-1.5 shrink-0 rounded-full"
          style={{ background: HABIT_STATUS_DOT[status] }}
        />
        <span className="truncate text-micro font-medium text-[var(--tint-ink,var(--ink-muted))]">
          {HABIT_STATUS_LABEL[status]}
        </span>
        <span className="shrink-0 text-micro tabular-nums text-[var(--ink-faint)]">
          {habits.length}
        </span>
      </div>

      <div className="flex flex-col px-3 pb-3">
        <div className="flex flex-col gap-2">
          {habits.map((habit) => (
            <HabitBoardCard
              key={habit.id}
              habit={habit}
              status={statusOf(habit.id)}
              streak={showStreaks ? streakOf(habit.id) : { value: 0, saturated: false }}
              disabled={disabled}
              isDragging={draggedId === habit.id}
              justSettled={settledId === habit.id}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              onSetStatus={(next) => onSetStatus(habit.id, next)}
            />
          ))}
        </div>

        {/* Dashed insertion slot: collapsed at rest, toggled by lightUp/dimDown
            so it never re-renders the cards above it. */}
        <div
          ref={slotRef}
          aria-hidden
          className="rounded-lg border-2 border-dashed border-[var(--accent)]"
          style={{
            height: "0px",
            marginTop: "0px",
            opacity: 0,
            overflow: "hidden",
            pointerEvents: "none",
            background: "color-mix(in oklch, var(--accent) 8%, transparent)",
            transition: "opacity 160ms ease-out",
          }}
        />

        {habits.length === 0 ? (
          <p className="px-1 py-2 text-micro text-[var(--ink-faint)]">Nothing here.</p>
        ) : null}
      </div>
    </div>
  );
});

function HabitBoardCard({
  habit,
  status,
  streak,
  disabled,
  isDragging,
  justSettled,
  onDragStart,
  onDragEnd,
  onSetStatus,
}: {
  habit: HabitWithAreas;
  status: HabitStatus;
  streak: HabitBoardStreak;
  disabled?: boolean;
  isDragging: boolean;
  justSettled: boolean;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onSetStatus: (next: HabitStatus) => void;
}) {
  const reduced = useReducedMotion();

  return (
    <div
      draggable={!disabled}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", habit.id);
        onDragStart(habit.id);
      }}
      onDragEnd={onDragEnd}
      className={cn(
        "group/habitcard select-none transition-opacity duration-[280ms] ease-out",
        !disabled && "cursor-grab active:cursor-grabbing",
        isDragging && "opacity-40",
        tintFor(habit.id)
      )}
    >
      <motion.div
        initial={false}
        animate={
          reduced || !justSettled ? { scale: 1 } : { scale: [0.97, 1] }
        }
        transition={
          reduced
            ? { duration: 0 }
            : justSettled
              ? { type: "spring", bounce: 0.2, duration: 0.3 }
              : { duration: 0.16, ease: "easeOut" }
        }
        style={{ transitionProperty: "box-shadow, border-color, background-color" }}
        className={cn(
          "craft-card-hover relative flex items-center gap-2 rounded-xl border px-3 py-2.5",
          "border-[var(--edge)] bg-[var(--surface-raised)] shadow-[var(--shadow-card)]"
        )}
      >
        <span
          aria-hidden
          className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[var(--tint-bg)] text-micro leading-none"
        >
          {habit.icon ? habit.icon : <HabitIcon size={13} />}
        </span>

        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span
            className={cn(
              "truncate text-meta",
              status === "done" ? "text-[var(--ink-faint)] line-through" : "text-[var(--ink)]"
            )}
          >
            {habit.name}
          </span>
          <span className="truncate text-micro text-[var(--ink-faint)]">
            {scheduleLabel(habit.daysOfWeek)}
          </span>
        </span>

        {streak.value > 0 ? (
          <span
            className="flex shrink-0 items-center gap-1 text-micro tabular-nums"
            style={{ color: "var(--ink-amber)" }}
            aria-label={`${streak.value}${streak.saturated ? "+" : ""} day streak`}
          >
            <Flame size={11} aria-hidden />
            {streak.value}
            {streak.saturated ? "+" : ""}
          </span>
        ) : null}

        {/* Drag is the gesture; this menu is the keyboard path to the same
            four rungs, so the board is not mouse-only. */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              disabled={disabled}
              aria-label={`Move “${habit.name}”`}
              className={cn(
                "inline-flex size-6 shrink-0 cursor-pointer-always items-center justify-center rounded-lg",
                "text-[var(--ink-faint)] opacity-0 transition-opacity duration-[160ms]",
                "hover:bg-[var(--hover)] hover:text-[var(--ink)]",
                "group-hover/habitcard:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]",
                disabled && "cursor-not-allowed"
              )}
            >
              <MoreHorizontal size={13} strokeWidth={1.75} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuLabel className="text-micro text-[var(--ink-faint)]">
              Move to
            </DropdownMenuLabel>
            {HABIT_STATUSES.map((s) => (
              <DropdownMenuItem
                key={s}
                onSelect={() => onSetStatus(s)}
                className={cn(s === status && "text-[var(--accent)]")}
              >
                {HABIT_STATUS_LABEL[s]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </motion.div>
    </div>
  );
}
