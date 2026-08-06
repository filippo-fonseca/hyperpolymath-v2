"use client";

import { motion, useReducedMotion } from "motion/react";

interface Props {
  label: string;
  consumed: number;
  target: number;
  intent?: "kcal" | "protein" | "carbs" | "fat";
}

/**
 * MacroProgressBar — one macro's progress toward its target, sd grammar.
 *
 *   - 11px uppercase mono label (fixed width) on the left
 *   - a hatched track (`sd-progress-hatched`) with a cyan fill that animates on
 *     transform:scaleX only (zero jank), guarded by useReducedMotion
 *   - consumed / target on the right in font-black tabular-nums
 *
 * Single cyan accent normally (§0). Functional hue ONLY on overshoot: amber
 * when meaningfully over target, red when kcal runs far over. No sage/green.
 */
export function MacroProgressBar({ label, consumed, target, intent }: Props) {
  const reduced = useReducedMotion();

  const ratio = target > 0 ? consumed / target : 0;
  const clamped = Math.max(0, Math.min(1, ratio));
  const over = ratio > 1.08;
  const isKcal = intent === "kcal";
  const wayOver = isKcal && ratio > 1.25;

  const displayConsumed = isKcal
    ? Math.round(consumed)
    : Math.round(consumed * 10) / 10;
  const displayTarget = Math.round(target);
  const unitSuffix = isKcal ? "" : "g";

  const accent = wayOver
    ? "var(--ink-coral)"
    : over
      ? "var(--ink-amber)"
      : "var(--sd-accent)";

  return (
    <div className="flex items-center gap-3">
      <span className="w-14 shrink-0 text-micro text-[var(--sd-ink-faint)]">
        {label}
      </span>

      <div
        role="progressbar"
        aria-valuenow={Math.round(consumed)}
        aria-valuemin={0}
        aria-valuemax={Math.round(target)}
        aria-label={`${label} progress`}
        className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--sd-input)]"
      >
        <div aria-hidden className="sd-progress-hatched absolute inset-0" />
        <motion.div
          aria-hidden
          className="absolute inset-y-0 left-0 w-full origin-left rounded-full"
          style={{ background: accent }}
          initial={reduced ? false : { scaleX: 0 }}
          animate={{ scaleX: clamped }}
          transition={
            reduced ? { duration: 0 } : { duration: 0.5, ease: [0.25, 1, 0.5, 1] }
          }
        />
      </div>

      <span
        className="min-w-[92px] shrink-0 text-right text-meta font-black tabular-nums"
        style={{ color: over ? accent : "var(--sd-ink)" }}
      >
        {displayConsumed}
        <span className="ml-0.5 text-micro font-medium text-[var(--sd-ink-faint)]">
          {" "}/ {displayTarget}
          {unitSuffix}
        </span>
      </span>
    </div>
  );
}
