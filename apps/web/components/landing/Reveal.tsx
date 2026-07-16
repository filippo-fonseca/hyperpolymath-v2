"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";

/**
 * Shared scroll-reveal for the landing body sections.
 *
 * The sd motion law (DESIGN-SYSTEM §14): opacity + transform only, ~150ms,
 * the soft-landing ease, `useReducedMotion` guarded, never on first paint.
 * This is the body-section counterpart to ThesisSection's mount entrance —
 * body sections animate `whileInView` as they scroll into the viewport,
 * with a subtle per-index stagger. Reduced motion resolves the same values
 * in 0ms with no travel (no layout, no hydration mismatch).
 */

const EASE_SOFT_LANDING: [number, number, number, number] = [0.25, 1, 0.5, 1];

export function Reveal({
  children,
  i = 0,
  className,
  as = "div",
  id,
}: {
  children: ReactNode;
  /** Stagger index — delays the reveal by `i * 60ms`. */
  i?: number;
  className?: string;
  as?: "div" | "li" | "section";
  id?: string;
}) {
  const reducedMotion = useReducedMotion();
  const MotionTag = motion[as];

  return (
    <MotionTag
      id={id}
      className={className}
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -12% 0px" }}
      transition={
        reducedMotion
          ? { duration: 0 }
          : { duration: 0.5, ease: EASE_SOFT_LANDING, delay: Math.min(i, 8) * 0.06 }
      }
    >
      {children}
    </MotionTag>
  );
}
