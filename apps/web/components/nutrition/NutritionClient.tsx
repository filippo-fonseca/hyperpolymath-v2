"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Settings2, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTableSubscription } from "@/lib/realtime/useTableSubscription";
import { copyYesterdayAction, listFoodLogsForDayAction } from "@/app/actions/nutrition";
import type { NutritionTargetPcts } from "@/lib/nutrition/macro-math";
import type { FoodLogRowData } from "./FoodLogRow";
import type { MealSlot } from "./MealSlotPillBar";
import { DayNavigator } from "./DayNavigator";
import { DailyMacroSummary } from "./DailyMacroSummary";
import { MealSlotPillBar } from "./MealSlotPillBar";
import { NutritionDayView } from "./NutritionDayView";
import { FoodSearch } from "./FoodSearch";
import { QuickAddComposer } from "./QuickAddComposer";
import { MealsManagerSheet } from "./MealsManagerSheet";

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
 * Layout (top to bottom), inside the page's sd title shell:
 *   1. Toolbar — DayNavigator (← {date} →) + Meals / Stats ghost verbs
 *   2. DailyMacroSummary — sticky stat strip
 *   3. MealSlotPillBar — sd segmented tabs
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
  const [searchState, setSearchState] = useState<{
    open: boolean;
    slot: MealSlot;
  } | null>(null);
  const [mealsOpen, setMealsOpen] = useState(false);

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
    <div className="flex flex-col gap-5">
      {/* Toolbar — day navigator on the left, Meals + Stats verbs on the right */}
      <div className="flex items-center justify-between gap-4">
        <DayNavigator
          date={date}
          onChange={setDate}
          onCopyYesterday={handleCopyYesterday}
          showCopyYesterday={logs.length === 0}
        />
        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setMealsOpen(true)}
            className="text-micro"
          >
            <Settings2 size={13} /> Meals
          </Button>
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="text-micro"
          >
            <Link href="/nutrition/stats">
              <BarChart3 size={13} /> Stats
            </Link>
          </Button>
        </div>
      </div>

      {/* Daily macro summary — sticky stat strip */}
      <DailyMacroSummary logs={logs} targets={targets} />

      {/* Meal slot segmented tabs */}
      <MealSlotPillBar value={mealSlot} onChange={setMealSlot} />

      {/* Active day view — empty state or slot content */}
      <NutritionDayView
        logs={logs}
        mealSlot={mealSlot}
        userId={userId}
        date={date}
        foodHistory={foodHistory}
        onAddFood={(slot) => setSearchState({ open: true, slot })}
      />

      {/* Food search sheet — wired to onAddFood from MealSlot (Plan 04) */}
      <FoodSearch
        open={searchState?.open ?? false}
        onOpenChange={(o) => {
          if (!o) setSearchState(null);
        }}
        mealSlot={searchState?.slot ?? "breakfast"}
        date={date}
        foodHistory={foodHistory}
        userId={userId}
      />

      {/* Meals manager sheet — opened from Meals button in header */}
      <MealsManagerSheet
        open={mealsOpen}
        onOpenChange={setMealsOpen}
        userId={userId}
        currentDate={date}
        currentSlot={mealSlot}
      />

      {/* Global 'n' keyboard shortcut — QuickAddComposer (D-07) */}
      <QuickAddComposer
        userId={userId}
        date={date}
        foodHistory={foodHistory}
      />
    </div>
  );
}
