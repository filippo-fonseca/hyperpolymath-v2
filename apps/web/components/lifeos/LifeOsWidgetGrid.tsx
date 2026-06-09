"use client";

import { Children, type ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";

/**
 * LifeOsWidgetGrid — responsive wrapper for the at-a-glance tiles.
 *
 * 3-col on lg+ (the page's 1280px width carries three quiet cards
 * comfortably), 2-col on md (tablet half-width), single column under md.
 * Widget cards already have `h-full` on their root <section> so they
 * align flush at the bottom inside the grid without extra plumbing.
 *
 * Motion (Quick 260607-g56): the inner grid is a `motion.div` with a parent
 * `show` variant that staggers child reveals 50ms apart, starting after the
 * Areas section (delayChildren 0.24s). Each child is wrapped in a
 * `motion.div` carrying the matching `child` variant. Reduced-motion → render
 * the final state immediately.
 */
const container = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.05,
      delayChildren: 0.24,
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

export function LifeOsWidgetGrid({ children }: { children: ReactNode }) {
  const prefersReducedMotion = useReducedMotion();
  const slots = Children.toArray(children);

  if (prefersReducedMotion) {
    return (
      <section className="mb-12">
        <header className="mb-4 flex items-baseline">
          <h2 className="font-serif text-xl font-semibold tracking-tight text-[var(--ink)]">
            At a glance
          </h2>
        </header>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {children}
        </div>
      </section>
    );
  }

  return (
    <section className="mb-12">
      <header className="mb-4 flex items-baseline">
        <h2 className="font-serif text-xl font-semibold tracking-tight text-[var(--ink)]">
          At a glance
        </h2>
      </header>
      <motion.div
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
        variants={container}
        initial="hidden"
        animate="show"
      >
        {slots.map((slot, i) => (
          <motion.div
            // children are stable widget slots — index is fine here, but key off
            // the slot identity when React provides one.
            // eslint-disable-next-line react/no-array-index-key
            key={i}
            variants={child}
            className="h-full"
          >
            {slot}
          </motion.div>
        ))}
      </motion.div>
    </section>
  );
}
