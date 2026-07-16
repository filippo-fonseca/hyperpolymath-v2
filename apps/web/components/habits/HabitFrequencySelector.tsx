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
              "inline-flex h-8 w-8 items-center justify-center rounded-md",
              "font-mono text-[11px] uppercase tracking-[0.04em] cursor-pointer-always",
              "border transition-colors duration-150 ease-out",
              on
                ? "border-transparent text-[var(--sd-accent)]"
                : "border-[var(--sd-line)] bg-[var(--sd-input)] text-[var(--sd-ink-faint)] hover:border-[color-mix(in_srgb,var(--sd-ink)_18%,var(--sd-line))] hover:text-[var(--sd-ink)]",
              disabled && "cursor-not-allowed opacity-40",
            )}
            style={
              on
                ? {
                    borderColor:
                      "color-mix(in srgb, var(--sd-accent) 40%, var(--sd-line))",
                    background:
                      "color-mix(in srgb, var(--sd-accent) 14%, var(--sd-input))",
                  }
                : undefined
            }
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
              "inline-flex h-[18px] w-[18px] items-center justify-center rounded-sm",
              "font-mono text-[9px] uppercase tracking-[0.02em]",
              "border",
              on
                ? "text-[var(--sd-accent)]"
                : "border-transparent text-[var(--sd-ink-faint)]",
            )}
            style={
              on
                ? {
                    borderColor:
                      "color-mix(in srgb, var(--sd-accent) 45%, transparent)",
                    background:
                      "color-mix(in srgb, var(--sd-accent) 16%, transparent)",
                  }
                : undefined
            }
          >
            {short}
          </span>
        );
      })}
    </div>
  );
}
