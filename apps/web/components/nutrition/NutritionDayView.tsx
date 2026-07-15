"use client";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/lifeos/entity-card";
import { NutritionIcon } from "./NutritionIcon";
import type { MealSlot as MealSlotType } from "./MealSlotPillBar";
import { MealSlot } from "./MealSlot";
import type { FoodLogRowData } from "./FoodLogRow";

interface Props {
  logs: FoodLogRowData[];
  mealSlot: MealSlotType;
  userId: string;
  date: string;
  foodHistory: unknown[];
  onAddFood?: (slot: MealSlotType) => void;
}

/**
 * NutritionDayView — shows either empty state (no logs all day) or the active
 * meal slot with its food log rows.
 *
 * UI-SPEC §"Page Structure" + Copywriting table:
 *   - Empty heading: "Nothing logged yet"
 *   - Empty body: "Add your first meal to start tracking today's macros."
 *   - Empty CTA: "Log your first meal" (distinct from per-slot "Log food")
 *   - When day has logs, renders active MealSlot filtered to current slot
 */
export function NutritionDayView({
  logs,
  mealSlot,
  onAddFood,
}: Props) {
  // Whole-day empty check
  if (logs.length === 0) {
    return (
      <div className="flex flex-col items-start gap-4 rounded-[14px] border border-dashed border-[var(--sd-line)] px-6 py-10">
        <EmptyState icon={<NutritionIcon size={40} />}>
          Nothing logged yet. Add your first meal to start tracking today&rsquo;s
          macros.
        </EmptyState>
        <Button size="sm" onClick={() => onAddFood?.(mealSlot)}>
          Log your first meal
        </Button>
      </div>
    );
  }

  // Filter to the active meal slot
  const filteredLogs = logs.filter(
    (row) => row.log.mealSlot === mealSlot,
  );

  return (
    <MealSlot slot={mealSlot} logs={filteredLogs} onAddFood={onAddFood} />
  );
}
