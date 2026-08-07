"use client";

import {
  HABIT_STATUS_LABEL,
  type HabitStatus,
  habitStatusActionLabel,
  habitStatusRatio,
} from "@/lib/habits/status";
import { cn } from "@/lib/utils";
import { motion, useReducedMotion } from "motion/react";

/**
 * The one control every habits surface uses to move a habit along the ladder:
 * /habits, the dock widget, and the LifeOS tile all render this, so a third-
 * filled circle means the same thing wherever you meet it.
 *
 * The fill is an SVG arc sweeping clockwise from twelve o'clock — a third for
 * "started", two thirds for "almost done", the full ring plus a check for
 * "done". A pie wedge read as a chart; a stroked arc reads as progress, which
 * is what this is.
 *
 * Colour rides `--tint-edge`, the habit's own pastel set by `tintFor(id)` on
 * the enclosing row, and falls back to the app accent outside a tinted row.
 */

type Size = "sm" | "md";

const GEOMETRY: Record<Size, { px: number; stroke: number; check: number }> = {
  sm: { px: 16, stroke: 2, check: 9 },
  md: { px: 28, stroke: 2.5, check: 14 },
};

/**
 * The ring as pure presentation — no button, no handlers. Use inside a surface
 * that is ALREADY interactive (the dock row is one big tap target, and a
 * button inside a button is invalid HTML). Standalone surfaces want
 * `HabitStatusRing` below, which wraps this in its own control.
 */
export function HabitStatusRingVisual({
  status,
  size = "md",
  className,
}: {
  status: HabitStatus;
  size?: Size;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const { px, stroke, check } = GEOMETRY[size];
  const ratio = habitStatusRatio(status);
  const done = status === "done";

  // Arc math on a unit viewBox of 100: radius leaves room for the stroke so
  // the ring never clips at the edge of its box.
  const r = 50 - (stroke * (100 / px)) / 2;
  const circumference = 2 * Math.PI * r;

  return (
    <span
      aria-hidden
      data-habit-status={status}
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center rounded-full",
        "transition-colors duration-[160ms] ease-out",
        className
      )}
      style={{ width: px, height: px }}
    >
      <motion.span
        initial={false}
        animate={reduced ? undefined : done ? { scale: [1, 1.18, 1] } : { scale: 1 }}
        transition={{ duration: 0.18, ease: [0.25, 1, 0.5, 1] }}
        className="inline-flex size-full items-center justify-center"
      >
        {done ? (
          <span
            className="flex size-full items-center justify-center rounded-full bg-[var(--tint-edge,var(--accent))] text-white"
            aria-hidden
          >
            <svg width={check} height={check} viewBox="0 0 14 14" fill="none" aria-hidden>
              <title>{HABIT_STATUS_LABEL[status]}</title>
              <path
                d="M3 7.5L6 10.5L11 4.5"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        ) : (
          <svg
            width={px}
            height={px}
            viewBox="0 0 100 100"
            fill="none"
            aria-hidden
            // -90deg puts the arc's origin at twelve o'clock.
            className="-rotate-90"
          >
            {/* aria-hidden already hides this from AT (the enclosing control
                carries the name); the title is here so the markup is still
                self-describing when read as source. */}
            <title>{HABIT_STATUS_LABEL[status]}</title>
            <circle
              cx="50"
              cy="50"
              r={r}
              stroke="color-mix(in srgb, var(--tint-edge, var(--edge-strong)) 60%, var(--edge-strong))"
              strokeWidth={stroke * (100 / px)}
              className="transition-[stroke] duration-[160ms] ease-out group-hover/ring:stroke-[var(--tint-edge,var(--ink-faint))]"
              fill="var(--tint-bg, transparent)"
            />
            {ratio > 0 ? (
              <circle
                cx="50"
                cy="50"
                r={r}
                stroke="var(--tint-edge, var(--accent))"
                strokeWidth={stroke * (100 / px)}
                strokeLinecap="round"
                fill="none"
                strokeDasharray={circumference}
                strokeDashoffset={circumference * (1 - ratio)}
                style={{
                  transition: reduced
                    ? undefined
                    : "stroke-dashoffset 280ms cubic-bezier(0.25, 1, 0.5, 1)",
                }}
              />
            ) : null}
          </svg>
        )}
      </motion.span>
    </span>
  );
}

/**
 * The ring as its own control: one tap advances the habit a rung. The
 * accessible name spells out both where the habit stands and where the tap
 * lands, because a partially-filled circle says neither on its own.
 */
export function HabitStatusRing({
  status,
  habitName,
  onClick,
  disabled,
  size = "md",
  className,
}: {
  status: HabitStatus;
  /** Used only to build the accessible label. */
  habitName: string;
  onClick: () => void;
  disabled?: boolean;
  size?: Size;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={habitStatusActionLabel(habitName, status)}
      title={habitStatusActionLabel(habitName, status)}
      className={cn(
        "group/ring inline-flex shrink-0 items-center justify-center rounded-full",
        "cursor-pointer-always",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sd-accent)]",
        disabled && "cursor-not-allowed opacity-40",
        className
      )}
    >
      <HabitStatusRingVisual status={status} size={size} />
    </button>
  );
}
