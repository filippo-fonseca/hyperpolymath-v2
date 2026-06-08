"use client";

import { useMemo } from "react";
import type { ActivityWithType } from "@/lib/db/queries/training";

interface Props {
  activities: ActivityWithType[];
  windowLabel: string;
}

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
    <div className="rounded-md border border-[var(--edge)] bg-[var(--surface)] p-4">
      <div className="flex items-baseline justify-between">
        <h3 className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--ink-muted)]">
          Adherence · {windowLabel}
        </h3>
        {stats.pct !== null && (
          <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ink-muted)]">
            {stats.pct}%
          </span>
        )}
      </div>

      <div className="mt-3 flex items-baseline gap-2">
        <span className="font-serif text-3xl tabular-nums text-[var(--ink)]">
          {stats.done}
        </span>
        <span className="font-serif text-xl text-[var(--ink-muted)]">/</span>
        <span className="font-serif text-2xl tabular-nums text-[var(--ink-muted)]">
          {stats.denom}
        </span>
        <span className="ml-2 font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--ink-muted)]">
          done / planned
        </span>
      </div>

      {/* Progress bar */}
      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-2)]">
        <div
          className="h-full bg-[var(--hud-cyan)] transition-[width] duration-500"
          style={{
            width: stats.pct === null ? "0%" : `${stats.pct}%`,
          }}
        />
      </div>

      {(stats.skipped > 0 || stats.cancelled > 0) && (
        <div className="mt-3 flex gap-3 font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--ink-muted)]">
          {stats.skipped > 0 && <span>{stats.skipped} skipped</span>}
          {stats.cancelled > 0 && <span>{stats.cancelled} cancelled</span>}
        </div>
      )}

      {stats.denom === 0 && stats.skipped === 0 && stats.cancelled === 0 && (
        <div className="mt-3 font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--ink-muted)]">
          Nothing logged in this window yet.
        </div>
      )}
    </div>
  );
}
