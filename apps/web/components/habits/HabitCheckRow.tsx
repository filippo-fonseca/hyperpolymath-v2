"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { HabitIcon } from "@/components/ui/icons";
import { addDaysISO, dayOfWeekISO } from "@/lib/habits/dates";
import {
  HABIT_STATUSES,
  HABIT_STATUS_LABEL,
  type HabitStatus,
  habitStatusRatio,
} from "@/lib/habits/status";
import { tintFor } from "@/lib/tint";
import { cn } from "@/lib/utils";
import { Flame, MoreHorizontal } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";

/**
 * One habit, one row, on the daily check-off surface.
 *
 * Three things the previous version got wrong, all of them fixed here.
 *
 * **It was a box.** Every row was a `.craft-card` — raised fill, 1px border,
 * card shadow — so ten habits read as ten stacked crates. Craft §5 already
 * specifies the alternative for list content ("bare rows directly on the sheet
 * with hairline separators") and Tasks already shipped it; Habits just never
 * followed. This is a bare row.
 *
 * **Completion cost three taps.** The status control cycled
 * not-started → started → almost → done, so the overwhelmingly common act —
 * "I did it" — was the slowest one on screen. `status.ts` even claimed
 * "check-off has to stay one tap for the common case" while doing the
 * opposite. Now a tap is binary done/undone, and the partial rungs moved to a
 * hover menu: an occasional action, reachable but never in the way. A menu
 * rather than right-click because nothing else in the app teaches right-click
 * on a list row.
 *
 * **History needed navigation.** A seven-day strip rides in the row, so
 * "have I been keeping this up" is answered by looking rather than by paging
 * back through a date picker.
 *
 * Layout follows what every tracker surveyed converges on: identity on the
 * left (the habit's own emoji), the control on the right under your thumb.
 */

export type TrailDay = {
  iso: string;
  status: HabitStatus;
  scheduled: boolean;
  isToday: boolean;
};

export function HabitCheckRow({
  id,
  name,
  emoji,
  status,
  streak,
  streakSaturated,
  trail,
  disabled,
  onToggle,
  onSetStatus,
}: {
  id: string;
  name: string;
  emoji: string | null;
  status: HabitStatus;
  streak: number;
  streakSaturated: boolean;
  /** Oldest → newest, ending on the selected day. */
  trail: TrailDay[];
  disabled?: boolean;
  /** Tap: the binary 90% case. */
  onToggle: () => void;
  /** Right-click: the partial rungs. */
  onSetStatus: (next: HabitStatus) => void;
}) {
  const reduced = useReducedMotion();
  const done = status === "done";
  const partial = status === "in_progress" || status === "almost_done";

  return (
    <div
      className={cn(
        // Bare row on the sheet. The separator is the list's, not the
        // row's, so a run of habits reads as one list.
        "group/row flex items-center gap-3 rounded-lg px-2 py-2 transition-colors duration-[160ms] ease-out",
        "hover:bg-[var(--hover)]",
        tintFor(id),
        // Completion tints the WHOLE row, not just the control: at a
        // glance the eye should sort done from not-done without reading.
        done && "bg-[color-mix(in_srgb,var(--tint-bg)_55%,transparent)]"
      )}
    >
      {/* Identity. The habit's own emoji where it has one; the generic
              glyph reads quiet enough not to compete when it does not. */}
      <span
        aria-hidden
        className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[var(--tint-bg)] text-meta leading-none"
      >
        {emoji ? emoji : <HabitIcon size={15} />}
      </span>

      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex min-w-0 items-center gap-2">
          <span
            className={cn(
              "min-w-0 truncate text-meta",
              done ? "text-[var(--ink-faint)] line-through" : "text-[var(--ink)]"
            )}
          >
            {name}
          </span>
          {/* Bare text, not a pill — Craft §3: counts are text or a dot. */}
          {partial ? (
            <span className="shrink-0 text-micro text-[var(--ink-muted)]">
              {HABIT_STATUS_LABEL[status]}
            </span>
          ) : null}
        </span>

        <TrailStrip trail={trail} />
      </span>

      {streak > 0 ? (
        <span
          className="flex shrink-0 items-center gap-1 text-micro tabular-nums"
          style={{ color: "var(--ink-amber)" }}
          aria-label={`${streak}${streakSaturated ? "+" : ""} day streak`}
        >
          <Flame size={11} aria-hidden />
          {streak}
          {streakSaturated ? "+" : ""}
        </span>
      ) : null}

      {/* The control, right-hand side, one tap. */}
      <button
        type="button"
        onClick={onToggle}
        disabled={disabled}
        aria-pressed={done}
        aria-label={done ? `Mark “${name}” not done` : `Mark “${name}” done`}
        title={done ? "Mark not done" : "Mark done"}
        className={cn(
          "inline-flex size-6 shrink-0 cursor-pointer-always items-center justify-center rounded-full",
          "transition-colors duration-[160ms] ease-out",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]",
          disabled && "cursor-not-allowed opacity-40"
        )}
      >
        <motion.span
          initial={false}
          animate={reduced ? undefined : done ? { scale: [1, 1.15, 1] } : { scale: 1 }}
          transition={{ duration: 0.16, ease: [0.25, 1, 0.5, 1] }}
          className="inline-flex"
        >
          <StatusDisc status={status} />
        </motion.span>
      </button>
      {/* Partial rungs. Hidden until hover so the common path stays a single
          uncluttered target, but always reachable by keyboard. */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`Set progress for “${name}”`}
            className={cn(
              "inline-flex size-6 shrink-0 cursor-pointer-always items-center justify-center rounded-lg",
              "text-[var(--ink-faint)] opacity-0 transition-opacity duration-[160ms]",
              "hover:bg-[var(--hover)] hover:text-[var(--ink)]",
              "group-hover/row:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            )}
          >
            <MoreHorizontal size={13} strokeWidth={1.75} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuLabel className="text-micro text-[var(--ink-faint)]">
            Progress
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
    </div>
  );
}

/**
 * The 24px disc: an arc for partial progress, a filled check for done. Same
 * geometry as the dock's ring so the two surfaces agree.
 */
function StatusDisc({ status }: { status: HabitStatus }) {
  const ratio = habitStatusRatio(status);
  if (status === "done") {
    return (
      <span className="flex size-[22px] items-center justify-center rounded-full bg-[var(--tint-edge,var(--accent))] text-white">
        <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden>
          <title>Done</title>
          <path
            d="M3 7.5L6 10.5L11 4.5"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    );
  }
  const r = 44;
  const c = 2 * Math.PI * r;
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 100 100"
      fill="none"
      className="-rotate-90"
      aria-hidden
    >
      <title>{HABIT_STATUS_LABEL[status]}</title>
      <circle
        cx="50"
        cy="50"
        r={r}
        strokeWidth="11"
        stroke="color-mix(in srgb, var(--tint-edge) 55%, var(--edge-strong))"
        fill="none"
      />
      {ratio > 0 ? (
        <circle
          cx="50"
          cy="50"
          r={r}
          strokeWidth="11"
          stroke="var(--tint-edge, var(--accent))"
          strokeLinecap="round"
          fill="none"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - ratio)}
        />
      ) : null}
    </svg>
  );
}

/**
 * Seven days of history, inline. Done days fill; partial days half-fill;
 * scheduled-but-missed days are a hollow ring; unscheduled days are a bare
 * tick, so a Mon/Wed/Fri habit does not read as five failures a week.
 */
function TrailStrip({ trail }: { trail: TrailDay[] }) {
  const doneCount = trail.filter((d) => d.status === "done").length;
  const scheduledCount = trail.filter((d) => d.scheduled).length;
  return (
    <span
      className="flex items-center gap-[3px]"
      aria-label={`Last ${trail.length} days: ${doneCount} of ${scheduledCount} scheduled days done`}
    >
      {trail.map((d) => {
        const ratio = habitStatusRatio(d.status);
        if (!d.scheduled && d.status === "not_started") {
          return (
            <span key={d.iso} aria-hidden className="h-[3px] w-2 rounded-full bg-[var(--edge)]" />
          );
        }
        return (
          <span
            key={d.iso}
            aria-hidden
            className={cn(
              "size-2 rounded-full",
              d.isToday &&
                "ring-1 ring-[var(--ink-faint)] ring-offset-1 ring-offset-[var(--surface)]"
            )}
            style={
              ratio >= 1
                ? { background: "var(--tint-edge)" }
                : ratio > 0
                  ? {
                      background: `linear-gradient(to top, var(--tint-edge) ${ratio * 100}%, transparent ${ratio * 100}%)`,
                      boxShadow:
                        "inset 0 0 0 1px color-mix(in srgb, var(--tint-edge) 55%, transparent)",
                    }
                  : {
                      boxShadow:
                        "inset 0 0 0 1px color-mix(in srgb, var(--tint-edge) 45%, var(--edge-strong))",
                    }
            }
          />
        );
      })}
    </span>
  );
}

/** Build the trail for one habit, oldest → newest, ending on `endISO`. */
export function buildTrail(
  daysOfWeek: boolean[],
  statusFor: (iso: string) => HabitStatus,
  endISO: string,
  length = 7
): TrailDay[] {
  return Array.from({ length }, (_, i) => {
    const iso = addDaysISO(endISO, i - (length - 1));
    return {
      iso,
      status: statusFor(iso),
      scheduled: Boolean(daysOfWeek[dayOfWeekISO(iso)]),
      isToday: i === length - 1,
    };
  });
}
