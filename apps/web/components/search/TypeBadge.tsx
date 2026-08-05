"use client";

import { cn } from "@/lib/utils";
import type { TintClass } from "@/lib/tint";
import type { SearchType } from "@/lib/search";

/**
 * Per-kind pastel tint (jul-29 craft restyle).
 *
 * The badge used to paint itself from the saturated ink tokens (cyan, coral,
 * amber…), which made a dense result list read as a strip of highlighters. It
 * now draws from the same eight-hue craft tint palette as every other entity
 * plate: pastel fill, saturation only on the hairline rim.
 *
 * The assignment is a fixed map rather than `tintFor(type)` because the hash
 * collides on this particular seven-key set: `task`/`area` and `page`/`journal`
 * land on the same hue, and telling those four apart is precisely this badge's
 * job. The map is stable, so a kind keeps its colour across every render and
 * both themes, which is the property that actually mattered.
 */
const TYPE_TINT: Record<SearchType, TintClass> = {
  task: "tint-sky",
  capture: "tint-mint",
  page: "tint-lavender",
  journal: "tint-plum",
  project: "tint-peach",
  area: "tint-butter",
  habit: "tint-sage",
};

const TYPE_LABEL: Record<SearchType, string> = {
  task: "TASK",
  capture: "CAPTURE",
  page: "PAGE",
  journal: "JOURNAL",
  project: "PROJECT",
  area: "AREA",
  habit: "HABIT",
};

interface Props {
  type: SearchType;
  /** Compact 10px variant for the Cmd+K dropdown. */
  compact?: boolean;
  className?: string;
}

export function TypeBadge({ type, compact = false, className }: Props) {
  return (
    <span
      className={cn(
        TYPE_TINT[type],
        // Entity identity, so it keeps its tinted plate — but sentence case at
        // micro, not a mono uppercase HUD tag.
        "inline-flex items-center rounded-md border text-micro",
        "border-[color-mix(in_srgb,var(--tint-edge)_50%,transparent)]",
        "bg-[var(--tint-bg)] text-[var(--tint-ink)]",
        compact ? "px-1.5 py-[1px]" : "px-2 py-[2px]",
        className
      )}
    >
      {TYPE_LABEL[type]}
    </span>
  );
}
