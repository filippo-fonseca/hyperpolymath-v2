'use client';

import { motion, useReducedMotion } from 'motion/react';

/**
 * Phase 6 Plan 06-03: (app) route group page transition (AES-03, UI-SPEC §6c).
 *
 * 150ms opacity fade on every navigation. Pure opacity — no y-offset
 * (sliding pages feel disorienting in a dense OS tool per UI-SPEC §6c).
 *
 * template.tsx differs from layout.tsx: template re-mounts on every
 * navigation, so motion.div re-runs its initial→animate sequence.
 * layout would only animate once at first mount.
 *
 * Respects prefers-reduced-motion → 0ms (instant).
 */
export default function AppTemplate({ children }: { children: React.ReactNode }) {
  const shouldReduce = useReducedMotion();
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: shouldReduce ? 0 : 0.15, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  );
}
