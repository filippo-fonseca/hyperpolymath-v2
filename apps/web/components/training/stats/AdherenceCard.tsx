"use client";

import { useMemo } from "react";
import { motion, useReducedMotion } from "motion/react";
import type { ActivityWithType } from "@/lib/db/queries/training";

interface Props {
  activities: ActivityWithType[];
  windowLabel: string;
}

// sd plate — the shipped .sd-panel primitive (12px, --sd-box, --sd-line
// hairline, inset top hairline). No glass, no blur, no glow (UI-CONTRACT §0).
const TILE = "sd-panel p-4";

/**
 * Planned-vs-actual adherence (D-14 / TRN-11 / TRN-12).
 *
 * adherence% = done / (done + planned-not-yet-done). Skipped and cancelled
 * are tracked separately so the denominator isn't punished by intentional
 * rest days or no-shows the user explicitly logged.
 *
 * First-class metric per D-14 — also appears in the planner header for the
 * current week (PlannerHeader.tsx).
 */
export function AdherenceCard({ activities, windowLabel }: Props) {
  const reduced = useReducedMotion();
  const stats = useMemo(() => {
    let done = 0;
    let planned = 0;
    let skipped = 0;
    let cancelled = 0;
    for (const a of activities) {
      if (a.status === "done") done += 1;
      else if (a.status === "planned") planned += 1;
      else if (a.status === "skipped") skipped += 1;
      else if (a.status === "cancelled") cancelled += 1;
    }
    const denom = done + planned;
    const pct = denom === 0 ? null : Math.round((done / denom) * 100);
    return { done, planned, skipped, cancelled, denom, pct };
  }, [activities]);

  return (
    <div className={TILE}>
      <div className="flex items-baseline justify-between">
        <h3 className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--sd-ink-faint)]">
          Adherence · {windowLabel}
        </h3>
        {stats.pct !== null && (
          <span className="font-mono text-[10px] uppercase tracking-[0.08em] tabular-nums text-[var(--sd-ink-dull)]">
            {stats.pct}%
          </span>
        )}
      </div>

      <div className="mt-3 flex items-baseline gap-2">
        <span className="text-3xl font-black tabular-nums tracking-[-0.01em] text-[var(--sd-ink)]">
          {stats.done}
        </span>
        <span className="text-xl font-medium text-[var(--sd-ink-faint)]">/</span>
        <span className="text-2xl font-semibold tabular-nums text-[var(--sd-ink-dull)]">
          {stats.denom}
        </span>
        <span className="ml-2 font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--sd-ink-faint)]">
          done / planned
        </span>
      </div>

      {/* Progress bar — scaleX transform only (zero-jank §14), never width. */}
      <div className="sd-progress mt-3 w-full">
        <motion.div
          aria-hidden
          className="sd-progress-fill origin-left"
          initial={reduced ? false : { scaleX: 0 }}
          animate={{ scaleX: stats.pct === null ? 0 : stats.pct / 100 }}
          transition={reduced ? { duration: 0 } : { duration: 0.5, ease: [0.25, 1, 0.5, 1] }}
        />
      </div>

      {(stats.skipped > 0 || stats.cancelled > 0) && (
        <div className="mt-3 flex gap-3 font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--sd-ink-faint)]">
          {stats.skipped > 0 && <span>{stats.skipped} skipped</span>}
          {stats.cancelled > 0 && <span>{stats.cancelled} cancelled</span>}
        </div>
      )}

      {stats.denom === 0 && stats.skipped === 0 && stats.cancelled === 0 && (
        <div className="mt-3 font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--sd-ink-faint)]">
          Nothing logged in this window yet.
        </div>
      )}
    </div>
  );
}
