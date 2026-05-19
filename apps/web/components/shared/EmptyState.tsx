'use client';

import { motion, useReducedMotion } from 'motion/react';
import { cn } from '@/lib/utils';

/**
 * Phase 6 Plan 06-02: brand-voice empty state (RES-03, AES-04, UI-SPEC §8g).
 *
 * Single reusable component for every list view (Tasks, Captures, Areas,
 * Projects-in-Area, Calendar, /insights, /settings/memory).
 *
 * Anatomy (UI-SPEC §8g):
 *   - H2 heading (24px serif semibold) — calm, not dramatic
 *   - 1-2 sentence body (16px serif muted)
 *   - Optional action button
 *   - NO icon (restraint per AES-02)
 *   - Centered, py-24 for vertical breathing room
 *   - Fade-in motion (300ms easeOut); instant under prefers-reduced-motion
 *
 * Copy is supplied by the caller — see UI-SPEC §9 for the per-view drafts.
 * role="status" surfaces content change to screen readers (UI-SPEC §11e).
 */
interface Props {
  heading: string;
  body: string;
  action?: { label: string; onClick: () => void };
  className?: string;
}

export function EmptyState({ heading, body, action, className }: Props) {
  const shouldReduce = useReducedMotion();
  return (
    <motion.div
      role="status"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: shouldReduce ? 0 : 0.3, ease: 'easeOut' }}
      className={cn(
        'flex flex-col items-center justify-center py-24 px-6 text-center',
        className,
      )}
    >
      <h2 className="text-2xl font-serif font-semibold text-foreground">{heading}</h2>
      <p className="text-base font-serif text-muted-foreground mt-2 max-w-xs">{body}</p>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="mt-6 h-9 px-4 inline-flex items-center justify-center rounded-md text-sm font-serif cursor-pointer transition-shadow"
          style={{ boxShadow: 'var(--shadow-nm-button)' }}
        >
          {action.label}
        </button>
      )}
    </motion.div>
  );
}
