"use client";

import { AnimatePresence } from "motion/react";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { MealSlot as MealSlotType } from "./MealSlotPillBar";
import { FoodLogRow, type FoodLogRowData } from "./FoodLogRow";

const SLOT_DISPLAY_NAMES: Record<MealSlotType, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snacks: "Snacks",
};

const PLATE =
  "rounded-[14px] border border-[var(--sd-line)] bg-[var(--sd-box)] " +
  "dark:border-white/[0.06] dark:[box-shadow:rgba(255,255,255,0.09)_0_1px_0_inset]";

interface Props {
  slot: MealSlotType;
  logs: FoodLogRowData[];
  onAddFood?: (slot: MealSlotType) => void;
}

/**
 * MealSlot — one meal slot rendered as a WidgetCard-v2 mini plate:
 *   - header: slot name (Space Grotesk semibold) + a mono kcal / P·C·F subtotal
 *   - body: food rows as chip rows (name + qty mono + kcal mono)
 *   - footer: a ghost "Add food" verb
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

  const hasLogs = logs.length > 0;

  return (
    <section className={cn("px-4 py-3.5", PLATE)}>
      {/* Header: slot name + subtotal */}
      <header className="mb-1 flex items-center justify-between gap-3">
        <h2 className="text-[15px] font-semibold leading-tight tracking-[-0.01em] text-[var(--sd-ink)]">
          {displayName}
        </h2>
        {hasLogs && (
          <div className="flex shrink-0 items-center gap-3 font-mono text-[11px] tabular-nums text-[var(--sd-ink-faint)]">
            <span className="text-[var(--sd-ink-dull)]">
              {Math.round(subtotals.kcal)} kcal
            </span>
            <span>P {Math.round(subtotals.proteinG * 10) / 10}</span>
            <span>C {Math.round(subtotals.carbsG * 10) / 10}</span>
            <span>F {Math.round(subtotals.fatG * 10) / 10}</span>
          </div>
        )}
      </header>

      {/* Food log rows */}
      {hasLogs ? (
        <ul role="list" className="-mx-1 mt-1 flex flex-col">
          <AnimatePresence initial={false}>
            {logs.map((row) => (
              <FoodLogRow key={row.log.id} log={row} />
            ))}
          </AnimatePresence>
        </ul>
      ) : (
        <p className="py-2 text-[13px] text-[var(--sd-ink-faint)]">
          Nothing logged for {displayName.toLowerCase()} yet.
        </p>
      )}

      {/* Add-food verb */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onAddFood?.(slot)}
        className="mt-1 font-mono text-[11px] uppercase tracking-[0.06em]"
      >
        <Plus size={13} /> Add food
      </Button>
    </section>
  );
}
