"use client";

import { motion, useReducedMotion } from "motion/react";

export type MealSlot = "breakfast" | "lunch" | "dinner" | "snacks";

const SLOTS: { value: MealSlot; label: string }[] = [
  { value: "breakfast", label: "BREAKFAST" },
  { value: "lunch", label: "LUNCH" },
  { value: "dinner", label: "DINNER" },
  { value: "snacks", label: "SNACKS" },
];

interface Props {
  value: MealSlot;
  onChange: (v: MealSlot) => void;
}

/**
 * MealSlotPillBar — glass pill rail mirroring SettingsSectionNav.tsx exactly.
 *
 * UI-SPEC §"Meal Slot Pill Bar":
 *   - Rail: rounded-full px-2 py-1.5 backdrop-blur-md + color-mix surface bg
 *   - Active pill: motion.span layoutId="nutrition-slot-pill" spring stiffness 360 damping 32
 *   - Labels: font-mono text-[10.5px] uppercase tracking-[0.14em]
 *   - Active color: var(--ink), inactive: var(--ink-muted)
 *
 * D-13: glass classes lifted verbatim from SettingsSectionNav.tsx lines 66-70.
 */
export function MealSlotPillBar({ value, onChange }: Props) {
  const reducedMotion = useReducedMotion();

  return (
    <nav
      aria-label="Meal slot navigation"
      className="inline-flex items-center gap-1 overflow-x-auto rounded-full px-2 py-1.5 backdrop-blur-md
                 bg-[color-mix(in_oklch,var(--surface)_88%,transparent)]
                 shadow-[inset_0_1px_0_color-mix(in_oklch,var(--ink)_4%,transparent),inset_0_-1px_0_color-mix(in_oklch,var(--ink)_8%,transparent),6px_6px_18px_color-mix(in_oklch,var(--ink)_10%,transparent),-4px_-4px_14px_color-mix(in_oklch,var(--surface)_70%,white)]
                 border border-[color-mix(in_oklch,var(--edge)_60%,transparent)]
                 scrollbar-none"
      style={{ scrollbarWidth: "none" }}
    >
      {SLOTS.map((slot) => {
        const isActive = slot.value === value;
        return (
          <button
            key={slot.value}
            type="button"
            onClick={() => onChange(slot.value)}
            aria-current={isActive ? "true" : undefined}
            className="relative isolate shrink-0 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring-doc)] rounded-full"
          >
            {isActive && !reducedMotion && (
              <motion.span
                layoutId="nutrition-slot-pill"
                aria-hidden="true"
                className="absolute inset-0 -z-10 rounded-full
                           bg-[var(--surface)]
                           shadow-[inset_2px_2px_5px_color-mix(in_oklch,var(--ink)_14%,transparent),inset_-2px_-2px_5px_color-mix(in_oklch,var(--surface)_60%,white),0_0_0_1px_color-mix(in_oklch,var(--edge-hud)_70%,transparent)]"
                transition={{
                  type: "spring",
                  stiffness: 360,
                  damping: 32,
                }}
              />
            )}
            {isActive && reducedMotion && (
              <span
                aria-hidden="true"
                className="absolute inset-0 -z-10 rounded-full
                           bg-[var(--surface)]
                           shadow-[inset_2px_2px_5px_color-mix(in_oklch,var(--ink)_14%,transparent),inset_-2px_-2px_5px_color-mix(in_oklch,var(--surface)_60%,white),0_0_0_1px_color-mix(in_oklch,var(--edge-hud)_70%,transparent)]"
              />
            )}
            <span
              className={`block px-3.5 py-1.5 font-mono text-[10.5px] uppercase tracking-[0.14em] transition-colors duration-150 ease-out ${
                isActive
                  ? "text-[var(--ink)]"
                  : "text-[var(--ink-muted)] hover:text-[var(--ink)]"
              }`}
            >
              {slot.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
