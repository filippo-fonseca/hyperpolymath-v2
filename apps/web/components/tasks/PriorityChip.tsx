"use client";

import { Infinity as InfinityIcon } from "lucide-react";

type Priority = "P∞" | "P1" | "P2" | "P3";

/**
 * Phase 06.1 Plan 04 (UI-SPEC §5h, §9i) — Priority chip rebuilt as a 6px amber
 * dot with an opacity ladder. P∞ becomes a Lucide Infinity icon at 14px in
 * --ink-amber. No background pills, no per-priority hue — the dominance hierarchy
 * is communicated entirely through alpha (P1 strong, P2 medium, P3 faint) which
 * keeps document surfaces calm while still telegraphing urgency.
 *
 * Spec values:
 *  - P1: 6px circle, --ink-amber at opacity 1
 *  - P2: 6px circle, --ink-amber at opacity 0.6
 *  - P3: 6px circle, --ink-amber at opacity 0.35
 *  - P∞: Lucide Infinity 14px stroke-1.5 in --ink-amber (icon, not dot)
 */
const opacityForPriority: Record<Exclude<Priority, "P∞">, number> = {
  P1: 1,
  P2: 0.6,
  P3: 0.35,
};

export function PriorityChip({ priority }: { priority: Priority }) {
  if (priority === "P∞") {
    return (
      <span
        className="inline-flex items-center"
        aria-label="Priority infinity"
      >
        <InfinityIcon
          size={14}
          strokeWidth={1.5}
          style={{ color: "var(--ink-amber)" }}
        />
      </span>
    );
  }
  return (
    <span
      className="inline-block rounded-full"
      style={{
        width: "6px",
        height: "6px",
        backgroundColor: "var(--ink-amber)",
        opacity: opacityForPriority[priority],
      }}
      aria-label={`Priority ${priority}`}
    />
  );
}
