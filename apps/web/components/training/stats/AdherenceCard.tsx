"use client";

import { useMemo } from "react";
import { motion, useReducedMotion } from "motion/react";
import type { ActivityWithType } from "@/lib/db/queries/training";

interface Props {
  activities: ActivityWithType[];
  windowLabel: string;
}

// Craft plate (jul-29): the headline stat block is a large raised panel.
// `.craft-card` is unlayered and owns fill/border/shadow — no `bg-*` utility
// may ride along with it. `tint-mint` is the training hue, consumed by the
// percentage chip below.
const TILE = "craft-card tint-mint rounded-2xl p-5";

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
        <h3 className="text-micro text-[var(--sd-ink-faint)]">
          Adherence · {windowLabel}
        </h3>
        {stats.pct !== null && (
          // Pastel chip with a saturated rim — the register's candy edge.
          <span className="inline-flex items-center rounded-full border border-[var(--tint-edge)] bg-[var(--tint-bg)] px-2 py-0.5 text-micro font-medium tabular-nums text-[var(--tint-ink)]">
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
        <span className="ml-2 text-micro text-[var(--sd-ink-faint)]">
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
        <div className="mt-3 flex gap-3 text-micro text-[var(--sd-ink-faint)]">
          {stats.skipped > 0 && <span>{stats.skipped} skipped</span>}
          {stats.cancelled > 0 && <span>{stats.cancelled} cancelled</span>}
        </div>
      )}

      {stats.denom === 0 && stats.skipped === 0 && stats.cancelled === 0 && (
        <div className="mt-3 text-micro text-[var(--sd-ink-faint)]">
          Nothing logged in this window yet.
        </div>
      )}
    </div>
  );
}
