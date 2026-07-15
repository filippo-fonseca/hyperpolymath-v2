"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

interface Props {
  /** Tasks — the action-dense hero tile (tall, left column). */
  hero: ReactNode;
  habits: ReactNode;
  training: ReactNode;
  captures: ReactNode;
  insights: ReactNode;
}

// Campaign motion signature (decision D4): entrances opacity 0->1, y 4->0,
// 160ms easeOut, 10ms stagger. Transform/opacity only — zero layout shift.
const container = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.01,
      delayChildren: 0.04,
    },
  },
};

const child = {
  hidden: { opacity: 0, y: 4 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.16, ease: "easeOut" as const },
  },
};

/**
 * LifeOsBentoGrid — the one-viewport widget deck (UI-CONTRACT-SD3 §2).
 *
 * A FIXED 2-row · 12-col grid: tiles SHRINK to fit the height rather than push
 * the page past one screen. Each cell is `min-h-0` so the WidgetCard inside can
 * fall below its content height and hand overflow to an internal scroll.
 *
 *   ┌───────────────┬────────┬─────┐   row 1
 *   │               │ Habits │ Trn │
 *   │  Tasks (5×2)  ├────────┼─────┤   row 2
 *   │               │ Capt.  │ Ins │
 *   └───────────────┴────────┴─────┘
 *     col 1–5          6–9    10–12
 *
 * Tasks is the most action-dense tile, so it earns the tall left column across
 * both rows. Habits + Training ride row 1; Captures + Insights ride row 2.
 * Insights folds INTO the grid as a compact cell (sealed decision, §2) rather
 * than trailing below the deck.
 *
 * Below `@3xl/main` the grid relaxes to a single auto-height column (the
 * one-viewport guarantee is a desktop contract; the canvas region clips).
 */
export function LifeOsBentoGrid({ hero, habits, training, captures, insights }: Props) {
  const reduced = useReducedMotion();

  const cells = (
    <>
      <motion.div
        variants={reduced ? undefined : child}
        className="min-h-0 @3xl/main:col-span-5 @3xl/main:row-span-2"
      >
        {hero}
      </motion.div>
      <motion.div variants={reduced ? undefined : child} className="min-h-0 @3xl/main:col-span-4">
        {habits}
      </motion.div>
      <motion.div variants={reduced ? undefined : child} className="min-h-0 @3xl/main:col-span-3">
        {training}
      </motion.div>
      <motion.div variants={reduced ? undefined : child} className="min-h-0 @3xl/main:col-span-4">
        {captures}
      </motion.div>
      <motion.div variants={reduced ? undefined : child} className="min-h-0 @3xl/main:col-span-3">
        {insights}
      </motion.div>
    </>
  );

  const gridClass =
    "grid h-full grid-cols-1 gap-4 @3xl/main:grid-cols-12 @3xl/main:grid-rows-[minmax(0,1fr)_minmax(0,1fr)]";

  if (reduced) {
    return <div className={gridClass}>{cells}</div>;
  }

  return (
    <motion.div className={gridClass} variants={container} initial="hidden" animate="show">
      {cells}
    </motion.div>
  );
}
