"use client";

import { EmptyState } from "@/components/shared/EmptyState";
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
      <EmptyState
        heading="Nothing logged yet"
        body="Add your first meal to start tracking today's macros."
        action={{
          label: "Log your first meal",
          onClick: () => onAddFood?.(mealSlot),
        }}
      />
    );
  }

  // Filter to the active meal slot
  const filteredLogs = logs.filter(
    (row) => row.log.mealSlot === mealSlot,
  );

  return (
    <div className="flex flex-col gap-4">
      <MealSlot
        slot={mealSlot}
        logs={filteredLogs}
        onAddFood={onAddFood}
      />
    </div>
  );
}
