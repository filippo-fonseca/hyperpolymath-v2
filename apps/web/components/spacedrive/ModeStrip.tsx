"use client";

import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export interface ModeStripMode {
  value: string;
  label: string;
  icon?: ReactNode;
}

export interface ModeStripProps {
  modes: ModeStripMode[];
  value: string;
  onChange: (value: string) => void;
  /** Accessible label for the mode group (required). */
  ariaLabel: string;
  className?: string;
}

/**
 * Tier-2 view-mode / filter strip — a group of real toggle buttons. The active
 * mode reads with a tonal `--deck-selected` fill and `--deck-accent` text; the
 * rest sit quiet in `--deck-ink-dull`. Buttons are natively focusable/activatable.
 */
export function ModeStrip({ modes, value, onChange, ariaLabel, className }: ModeStripProps) {
  return (
    // <fieldset> carries the implicit `group` role; aria-label names it. Using
    // the semantic element (instead of a div with role="group") keeps the a11y
    // linter happy. Default fieldset chrome (border/margin/min-width) is reset.
    <fieldset
      aria-label={ariaLabel}
      className={cn(
        "m-0 inline-flex min-w-0 items-center gap-0.5 rounded-[0.5rem] border border-[var(--deck-line)] bg-[var(--deck-panel)] p-0.5 font-[family-name:var(--font-sans)]",
        className
      )}
    >
      {modes.map((mode) => {
        const active = mode.value === value;
        return (
          <button
            key={mode.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(mode.value)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-[0.375rem] px-2.5 py-1 text-[12px] font-medium",
              "transition-colors duration-[var(--dur-hover)] ease-out",
              "focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]",
              active
                ? "bg-[var(--deck-selected)] text-[var(--deck-accent)]"
                : "text-[var(--deck-ink-dull)] hover:bg-[var(--deck-hover)] hover:text-[var(--deck-ink)]"
            )}
          >
            {mode.icon ? <span className="flex shrink-0 items-center">{mode.icon}</span> : null}
            <span className="truncate">{mode.label}</span>
          </button>
        );
      })}
    </fieldset>
  );
}
