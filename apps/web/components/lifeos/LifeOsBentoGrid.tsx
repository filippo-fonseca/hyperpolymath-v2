"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";

interface Props {
  hero: ReactNode;
  topRight: ReactNode;
  midRight: ReactNode;
  bottom: ReactNode;
}

const container = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.05,
      delayChildren: 0.18,
    },
  },
};

const child = {
  hidden: { opacity: 0, y: 6 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.32, ease: [0.25, 1, 0.5, 1] as const },
  },
};

/**
 * LifeOsBentoGrid — asymmetric bento layout for the at-a-glance widgets.
 *
 *   lg+:           sm/md:
 *   ┌───────┬───┐  ┌─────────┐
 *   │       │ A │  │  hero   │
 *   │ hero  ├───┤  ├─────────┤
 *   │       │ B │  │    A    │
 *   ├───────┴───┤  ├─────────┤
 *   │  bottom   │  │    B    │
 *   └───────────┘  ├─────────┤
 *                   │ bottom  │
 *                   └─────────┘
 *
 * Hero spans 2 columns × 2 rows on lg+, so the most action-dense tile (tasks)
 * gets the most visual weight. topRight + midRight share the right column.
 * Bottom spans full width — captures read well as a wide stream.
 */
export function LifeOsBentoGrid({ hero, topRight, midRight, bottom }: Props) {
  const reduced = useReducedMotion();

  if (reduced) {
    return (
      <section className="mb-12">
        <div className="grid grid-cols-1 @3xl/main:grid-cols-3 gap-4 @3xl/main:auto-rows-[minmax(180px,auto)]">
          <div className="@3xl/main:col-span-2 @3xl/main:row-span-2">{hero}</div>
          <div>{topRight}</div>
          <div>{midRight}</div>
          <div className="@3xl/main:col-span-3">{bottom}</div>
        </div>
      </section>
    );
  }

  return (
    <section className="mb-12">
      <motion.div
        className="grid grid-cols-1 @3xl/main:grid-cols-3 gap-4 @3xl/main:auto-rows-[minmax(180px,auto)]"
        variants={container}
        initial="hidden"
        animate="show"
      >
        <motion.div variants={child} className="@3xl/main:col-span-2 @3xl/main:row-span-2">
          {hero}
        </motion.div>
        <motion.div variants={child}>{topRight}</motion.div>
        <motion.div variants={child}>{midRight}</motion.div>
        <motion.div variants={child} className="@3xl/main:col-span-3">
          {bottom}
        </motion.div>
      </motion.div>
    </section>
  );
}
