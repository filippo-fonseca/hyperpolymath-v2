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
export function HabitFrequencySelector({ value, onChange, disabled = false }: Props) {
  function toggle(idx: number) {
    if (disabled) return;
    const next = [...value];
    next[idx] = !next[idx];
    onChange(next);
  }

  return (
    // biome-ignore lint/a11y/useSemanticElements: fieldset brings default chrome and layout quirks; role="group" + label is equivalent here
    <div role="group" aria-label="Days of the week" className="inline-flex items-center gap-1">
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
              "inline-flex h-8 w-8 items-center justify-center rounded-lg",
              "text-micro font-medium cursor-pointer-always",
              "border transition-colors duration-[160ms] ease-out",
              on
                ? "border-[var(--edge-strong)] bg-[var(--selected)] text-[var(--ink)]"
                : "border-[var(--edge)] bg-transparent text-[var(--ink-faint)] hover:border-[var(--edge-strong)] hover:text-[var(--ink)]",
              disabled && "cursor-not-allowed opacity-40"
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
    // biome-ignore lint/a11y/useSemanticElements: read-only badge strip, not a form control group
    <div role="group" aria-label="Days of the week" className="inline-flex items-center gap-1">
      {DISPLAY_ORDER.map(({ idx, short, full }) => {
        const on = !!value[idx];
        return (
          <span
            key={idx}
            title={full}
            className={cn(
              "inline-flex h-[18px] w-[18px] items-center justify-center rounded",
              "text-micro",
              on ? "bg-[var(--selected)] text-[var(--ink)]" : "text-[var(--ink-faint)]"
            )}
          >
            {short}
          </span>
        );
      })}
    </div>
  );
}
