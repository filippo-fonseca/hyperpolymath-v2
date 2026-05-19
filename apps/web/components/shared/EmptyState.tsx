'use client';

import { motion, useReducedMotion } from 'motion/react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Phase 6 Plan 06-02: brand-voice empty state (RES-03, AES-04, UI-SPEC §8g).
 * Phase 06.1 Plan 04 (UI-SPEC §5h/§5i/§9a, §12b): document-tier restyle —
 *   - H2 EB Garamond 24px 600 in --ink
 *   - Body EB Garamond 16px in --ink-muted
 *   - Action button uses the shared Document primary <Button> (Task 1) —
 *     drops the inline neumorphic boxShadow that referenced the retired
 *     button shadow token (purged in Plan 06.1-01)
 *
 * Anatomy (UI-SPEC §8g):
 *   - H2 heading 24px serif semibold
 *   - 1-2 sentence body 16px serif muted
 *   - Optional action button (Document primary)
 *   - NO icon (restraint per AES-02)
 *   - Centered, py-24 for vertical breathing room
 *   - Fade-in motion (300ms ease-out-quart); instant under prefers-reduced-motion
 *
 * Copy is supplied by the caller — see UI-SPEC §12b for the per-view drafts.
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
      initial={{ opacity: 0, y: shouldReduce ? 0 : 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: shouldReduce ? 0 : 0.3,
        ease: [0.25, 1, 0.5, 1], // --ease-out-quart per UI-SPEC §6a
      }}
      className={cn(
        'flex flex-col items-center justify-center py-24 px-6 text-center gap-3',
        className,
      )}
    >
      <h2 className="font-serif text-2xl font-semibold text-[var(--ink)]">{heading}</h2>
      <p className="font-serif text-base text-[var(--ink-muted)] max-w-md">{body}</p>
      {action && (
        <Button onClick={action.onClick} className="mt-4">
          {action.label}
        </Button>
      )}
    </motion.div>
  );
}
