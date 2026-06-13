"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTableSubscription } from "@/lib/realtime/useTableSubscription";
import { copyYesterdayAction, listFoodLogsForDayAction } from "@/app/actions/nutrition";
import type { NutritionTargetPcts } from "@/lib/nutrition/macro-math";
import type { FoodLogRowData } from "./FoodLogRow";
import type { MealSlot } from "./MealSlotPillBar";
import { DayNavigator } from "./DayNavigator";
import { DailyMacroSummary } from "./DailyMacroSummary";
import { MealSlotPillBar } from "./MealSlotPillBar";
import { NutritionDayView } from "./NutritionDayView";

type FoodHistoryItem = {
  id: string;
  name: string;
  brand: string | null;
  kcalPer100g: string;
  proteinPer100g: string;
  carbsPer100g: string;
  fatPer100g: string;
  baseUnit: string | null;
  lastUsedAt: Date | null;
  useCount: number;
};

interface Props {
  userId: string;
  initialDate: string;
  initialLogs: FoodLogRowData[];
  foodHistory: FoodHistoryItem[];
  targets: NutritionTargetPcts;
}

/**
 * NutritionClient — client island for the /nutrition day view.
 *
 * Pattern mirrors TrainingClient (CLAUDE.md Critical Patterns 1 + 3):
 *   1. useQuery({ queryKey: ["food_logs", userId, date], initialData }) — TanStack Query
 *      owns the canonical day log cache, hydrated from SSR.
 *   2. Three useTableSubscription mounts — food_logs, foods, meals — each triggers
 *      cache invalidation via the query-keys singleton.
 *   3. Realtime fires → invalidateQueries(tableKey(table, userId)) → refetch.
 *      Realtime payloads are NEVER merged into the cache directly (Critical Pattern 3).
 *
 * Layout (top to bottom):
 *   1. DayNavigator — ← {date} → + "Copy yesterday" when day is empty
 *   2. DailyMacroSummary — sticky below header
 *   3. MealSlotPillBar — glass pill rail
 *   4. NutritionDayView — active slot content or empty state
 */
export function NutritionClient({
  userId,
  initialDate,
  initialLogs,
  foodHistory,
  targets,
}: Props) {
  const [date, setDate] = useState<string>(initialDate);
  const [mealSlot, setMealSlot] = useState<MealSlot>("breakfast");

  // Realtime subscriptions — invalidate-only (Critical Pattern 3).
  // food_logs changes → refetch the day's logs.
  // foods changes → refetch logs (food name/brand may have been updated in foods table).
  // meals changes → future meal-logging surface needs fresh meal data.
  useTableSubscription("food_logs", userId);
  useTableSubscription("foods", userId, {
    alsoInvalidate: [["food_logs", userId]],
  });
  useTableSubscription("meals", userId);

  // TanStack Query — canonical day log cache.
  // Only feed SSR data for the initial (today) query; other days fetch fresh.
  const { data: logs = [] } = useQuery<FoodLogRowData[]>({
    queryKey: ["food_logs", userId, date],
    queryFn: () => listFoodLogsForDayAction({ date }),
    initialData: date === initialDate ? initialLogs : undefined,
  });

  async function handleCopyYesterday() {
    const result = await copyYesterdayAction({ toDate: date });
    if (result.success) {
      toast("Yesterday's meals copied to today");
    } else {
      toast.error(result.error ?? "Failed to copy yesterday's meals");
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 pt-16 pb-32">
      <div className="flex flex-col gap-4">
        {/* 1. Day navigator */}
        <DayNavigator
          date={date}
          onChange={setDate}
          onCopyYesterday={handleCopyYesterday}
          showCopyYesterday={logs.length === 0}
        />

        {/* 2. Daily macro summary — sticky */}
        <DailyMacroSummary logs={logs} targets={targets} />

        {/* 3. Meal slot pill bar */}
        <div className="flex justify-center">
          <MealSlotPillBar value={mealSlot} onChange={setMealSlot} />
        </div>

        {/* 4. Active day view — empty state or slot content */}
        <NutritionDayView
          logs={logs}
          mealSlot={mealSlot}
          userId={userId}
          date={date}
          foodHistory={foodHistory}
        />
      </div>
    </div>
  );
}
