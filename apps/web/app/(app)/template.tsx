'use client';

import { motion, useReducedMotion } from 'motion/react';

/**
 * Phase 06.1 Plan 06 (UI-SPEC §6g, §11c, §13, §14) — (app) route group page transition.
 *
 * 150ms opacity fade on every navigation via --ease-out-quart cubic-bezier
 * (mechanism preserved from Phase 6 06-03 per UI-SPEC §14; only the easing
 * value is updated to consume the Phase 6.1 motion vocabulary).
 *
 * Pure opacity — no y-offset (UI-SPEC §13 rejects page-transition slides for
 * dense OS tools). template.tsx (vs layout.tsx) re-mounts every navigation, so
 * motion.div re-runs its initial→animate sequence on every route change.
 *
 * The ease array [0.25, 1, 0.5, 1] is the cubic-bezier for --ease-out-quart
 * inlined here because Motion props can't resolve CSS variables. The same
 * cubic-bezier is declared as --ease-out-quart in globals.css for CSS consumers.
 *
 * Respects prefers-reduced-motion → 0ms (instant) per UI-SPEC §11c.
 */
export default function AppTemplate({ children }: { children: React.ReactNode }) {
  const shouldReduce = useReducedMotion();
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{
        duration: shouldReduce ? 0 : 0.15,
        ease: [0.25, 1, 0.5, 1],
      }}
    >
      {children}
    </motion.div>
  );
}
