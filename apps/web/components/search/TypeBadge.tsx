"use client";

import { cn } from "@/lib/utils";
import type { SearchType } from "@/lib/search";

/**
 * Per-type ink token. Spec's info/success/warning/danger/secondary mapped to
 * the Hyperpolymath palette: cyan (info), sage (success), amber (warning),
 * coral (danger), muted (secondary).
 */
const TYPE_INK: Record<SearchType, string> = {
  task: "var(--hud-cyan)",
  capture: "var(--ink-sage)",
  project: "var(--ink-amber)",
  area: "var(--ink-coral)",
  habit: "var(--ink-muted)",
};

const TYPE_LABEL: Record<SearchType, string> = {
  task: "TASK",
  capture: "CAPTURE",
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
  const ink = TYPE_INK[type];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded font-mono uppercase tracking-[0.1em]",
        compact ? "px-1 py-[1px] text-[10px]" : "px-1.5 py-[2px] text-[10px]",
        className
      )}
      style={{
        color: ink,
        background: `color-mix(in oklch, ${ink} 14%, transparent)`,
        boxShadow: `inset 0 0 0 1px color-mix(in oklch, ${ink} 24%, transparent)`,
      }}
    >
      {TYPE_LABEL[type]}
    </span>
  );
}
