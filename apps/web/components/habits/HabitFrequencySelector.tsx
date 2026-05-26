"use client";

import { cn } from "@/lib/utils";

interface Props {
  /** 7-element array indexed Sun=0 → Sat=6 (matches JS Date.getDay()). */
  value: boolean[];
  onChange: (next: boolean[]) => void;
  disabled?: boolean;
}

// Display order is Mon → Sun so the work week reads left-to-right. We keep
// the underlying array Sun-indexed (matches Date.getDay()) and map between
// the two via `DISPLAY_ORDER`. Don't change the storage order — every
// downstream consumer assumes Sun=0.
const DISPLAY_ORDER: { idx: number; short: string; full: string }[] = [
  { idx: 1, short: "M", full: "Monday" },
  { idx: 2, short: "T", full: "Tuesday" },
  { idx: 3, short: "W", full: "Wednesday" },
  { idx: 4, short: "T", full: "Thursday" },
  { idx: 5, short: "F", full: "Friday" },
  { idx: 6, short: "S", full: "Saturday" },
  { idx: 0, short: "S", full: "Sunday" },
];

/**
 * Seven small pills, one per weekday. Click to toggle inclusion. Keyboard
 * accessible (each pill is a real <button>). The mismatched repeated short
 * letters (T-T, S-S) are clarified by the full-name aria-label + title.
 */
export function HabitFrequencySelector({
  value,
  onChange,
  disabled = false,
}: Props) {
  function toggle(idx: number) {
    if (disabled) return;
    const next = [...value];
    next[idx] = !next[idx];
    onChange(next);
  }

  return (
    <div
      role="group"
      aria-label="Days of the week"
      className="inline-flex items-center gap-1"
    >
      {DISPLAY_ORDER.map(({ idx, short, full }) => {
        const on = !!value[idx];
        return (
          <button
            key={idx}
            type="button"
            onClick={() => toggle(idx)}
            disabled={disabled}
            aria-pressed={on}
            aria-label={full}
            title={full}
            className={cn(
              "inline-flex items-center justify-center w-8 h-8 rounded-md",
              "font-mono text-[11px] uppercase tracking-[0.04em] cursor-pointer-always",
              "border transition-colors duration-150 ease-out",
              on
                ? "border-[var(--ink-amber)] bg-[color-mix(in_oklch,var(--ink-amber)_14%,var(--surface))] text-[var(--ink)]"
                : "border-[var(--edge)] bg-[var(--surface)] text-[var(--ink-muted)] hover:text-[var(--ink)] hover:border-[var(--edge-hud)]",
              disabled && "opacity-40 cursor-not-allowed",
            )}
          >
            {short}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Inline compact day badges — read-only echo of a habit's schedule, sized
 * for the habit card body where space is tight. Shares the Mon→Sun display
 * order with the editable selector above so visual scanning stays
 * consistent between create / edit / list contexts.
 */
export function HabitFrequencyBadges({ value }: { value: boolean[] }) {
  return (
    <div
      role="group"
      aria-label="Days of the week"
      className="inline-flex items-center gap-0.5"
    >
      {DISPLAY_ORDER.map(({ idx, short, full }) => {
        const on = !!value[idx];
        return (
          <span
            key={idx}
            title={full}
            className={cn(
              "inline-flex items-center justify-center w-[18px] h-[18px] rounded-sm",
              "font-mono text-[9px] uppercase tracking-[0.02em]",
              "border",
              on
                ? "border-[var(--ink-amber)]/60 bg-[color-mix(in_oklch,var(--ink-amber)_18%,transparent)] text-[var(--ink)]"
                : "border-transparent text-[var(--ink-muted)]/50",
            )}
          >
            {short}
          </span>
        );
      })}
    </div>
  );
}
