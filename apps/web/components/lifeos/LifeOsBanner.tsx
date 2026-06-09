"use client";

import { motion, useReducedMotion } from "motion/react";

/**
 * LifeOsBanner — Notion-style page header.
 *
 * Composition mirrors a Notion page: a quiet cover strip up top, then an
 * oversized emoji glyph, then a serif H1 and optional italic subtitle. The
 * cover gradient pulls --hud-cyan in at very low alpha — a whisper of the
 * JARVIS atmosphere without resorting to HUD chrome. This honors the
 * "JARVIS as MOOD only" guidance: cyan is present but the surface still
 * reads as a journal page, not a dashboard.
 *
 * Motion (Quick 260607-g56): on mount, fade+y(8) over 360ms. Reduced-motion
 * → snap to final state. This is the first visible surface on /lifeos, so it
 * leads the staggered sequence (banner → quick-send → areas → widgets).
 */
interface Props {
  title: string;
  emoji: string;
  subtitle?: string;
}

export function LifeOsBanner({ title, emoji, subtitle }: Props) {
  const prefersReducedMotion = useReducedMotion();
  const animProps = prefersReducedMotion
    ? { initial: false as const }
    : {
        initial: { opacity: 0, y: 8 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.36, ease: [0.25, 1, 0.5, 1] as const },
      };

  return (
    <motion.section className="mb-10" {...animProps}>
      {/* Emoji + title block — mirrors Notion's page header proportions.
          Using a lozenge glyph (◈) instead of a standard emoji to stay in
          the Renaissance/journal-paper register; `📓` was the considered
          alternative but lozenge fits the rest of the surface better. */}
      <div className="space-y-3">
        <div className="text-5xl leading-none select-none" aria-hidden="true">
          {emoji}
        </div>
        <div className="space-y-1">
          <h1 className="font-serif text-4xl font-semibold tracking-tight text-[var(--ink)]">
            {title}
          </h1>
          {subtitle ? (
            <p className="font-serif italic text-[14px] text-[var(--ink-muted)]">
              {subtitle}
            </p>
          ) : null}
        </div>
      </div>
    </motion.section>
  );
}
