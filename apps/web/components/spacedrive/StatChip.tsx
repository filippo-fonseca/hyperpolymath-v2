import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export interface StatChipDelta {
  value: string;
  direction: "up" | "down" | "flat";
}

export interface StatChipProps {
  label: string;
  value: ReactNode;
  delta?: StatChipDelta;
  className?: string;
}

// Data-semantic inks are allowed here: a delta is data, not chrome.
const DELTA_COLOR = {
  up: "var(--ink-sage)",
  down: "var(--ink-coral)",
  flat: "var(--deck-ink-dull)",
} as const;

const DELTA_GLYPH = {
  up: "▲",
  down: "▼",
  flat: "—",
} as const;

/**
 * A single quiet metric — mono uppercase micro-label over a large sans value,
 * with an optional tinted delta. One metric per chip; keep it calm.
 */
export function StatChip({ label, value, delta, className }: StatChipProps) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1", className)}>
      <span className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.12em] text-[var(--deck-ink-faint)]">
        {label}
      </span>
      <div className="flex items-baseline gap-2">
        <span className="font-[family-name:var(--font-sans)] text-[20px] leading-none text-[var(--deck-ink)]">
          {value}
        </span>
        {delta ? (
          <span
            className="flex items-center gap-0.5 font-[family-name:var(--font-mono)] text-[11px] leading-none"
            style={{ color: DELTA_COLOR[delta.direction] }}
          >
            <span aria-hidden className="text-[8px]">
              {DELTA_GLYPH[delta.direction]}
            </span>
            {delta.value}
          </span>
        ) : null}
      </div>
    </div>
  );
}
