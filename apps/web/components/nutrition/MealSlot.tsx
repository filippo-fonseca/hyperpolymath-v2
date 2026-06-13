"use client";

import { AnimatePresence } from "motion/react";
import type { MealSlot as MealSlotType } from "./MealSlotPillBar";
import { FoodLogRow, type FoodLogRowData } from "./FoodLogRow";

const SLOT_DISPLAY_NAMES: Record<MealSlotType, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snacks: "Snacks",
};

interface Props {
  slot: MealSlotType;
  logs: FoodLogRowData[];
  onAddFood?: (slot: MealSlotType) => void;
}

/**
 * MealSlot — one meal slot section (e.g. Breakfast) with its food log rows.
 *
 * UI-SPEC §"Active Meal Slot View":
 *   - Heading: serif 20px, sentence case (not the pill UPPERCASE label)
 *   - ul role="list" of FoodLogRow items
 *   - Footer: slot subtotals in mono 10.5px ink-muted
 *   - "Log food" glass-button rounded-md — stub onClick to onAddFood (Plan 04 wires search)
 *
 * Copy: "Log food" per UI-SPEC copywriting table.
 */
export function MealSlot({ slot, logs, onAddFood }: Props) {
  const displayName = SLOT_DISPLAY_NAMES[slot];

  // Compute slot subtotals from snapshotted macros
  const subtotals = logs.reduce(
    (acc, row) => ({
      kcal: acc.kcal + row.log.kcal,
      proteinG: acc.proteinG + parseFloat(row.log.proteinG),
      carbsG: acc.carbsG + parseFloat(row.log.carbsG),
      fatG: acc.fatG + parseFloat(row.log.fatG),
    }),
    { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 },
  );

  return (
    <section className="flex flex-col gap-2">
      {/* Section heading */}
      <h2
        className="font-serif text-[20px] leading-[1.2] text-[var(--ink)]"
        style={{ fontFamily: "var(--font-serif)" }}
      >
        {displayName}
      </h2>

      {/* Food log rows */}
      {logs.length > 0 ? (
        <ul role="list" className="flex flex-col gap-0.5">
          <AnimatePresence initial={false}>
            {logs.map((row) => (
              <FoodLogRow key={row.log.id} log={row} />
            ))}
          </AnimatePresence>
        </ul>
      ) : null}

      {/* Slot subtotals (only show if there are logs) */}
      {logs.length > 0 && (
        <div className="flex items-center gap-4 px-3 py-1">
          <span className="font-mono text-[10.5px] text-[var(--ink-muted)]">
            {Math.round(subtotals.kcal)} kcal
          </span>
          <span className="font-mono text-[10.5px] text-[var(--ink-muted)]">
            P {Math.round(subtotals.proteinG * 10) / 10}g
          </span>
          <span className="font-mono text-[10.5px] text-[var(--ink-muted)]">
            C {Math.round(subtotals.carbsG * 10) / 10}g
          </span>
          <span className="font-mono text-[10.5px] text-[var(--ink-muted)]">
            F {Math.round(subtotals.fatG * 10) / 10}g
          </span>
        </div>
      )}

      {/* Log food button — stub (Plan 04 wires food search surface) */}
      <button
        type="button"
        onClick={() => onAddFood?.(slot)}
        className="glass-button self-start rounded-md px-4 py-2 font-mono text-[10.5px] uppercase tracking-[0.14em] text-[var(--ink-muted)] hover:text-[var(--ink)] transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring-doc)]"
      >
        Log food
      </button>
    </section>
  );
}
