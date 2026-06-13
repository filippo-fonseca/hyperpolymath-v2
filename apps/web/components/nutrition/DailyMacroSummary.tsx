"use client";

import { deriveTargetGrams } from "@/lib/nutrition/macro-math";
import { MacroProgressBar } from "./MacroProgressBar";
import type { NutritionTargetPcts } from "@/lib/nutrition/macro-math";

// The shape returned by listFoodLogsForDay — each row has a `log` with snapshotted macros
type LogRow = {
  log: {
    kcal: number;
    proteinG: string;
    carbsG: string;
    fatG: string;
  };
  food: {
    id: string;
    name: string;
    brand: string | null;
    baseUnit: string | null;
  } | null;
  serving: {
    id: string;
    label: string;
    gramsOrMl: string;
  } | null;
};

interface Props {
  logs: LogRow[];
  targets: NutritionTargetPcts;
}

/**
 * DailyMacroSummary — sticky summary bar at the top of the day view.
 *
 * UI-SPEC §"Daily Macro Summary Bar":
 *   - Container: glass-tile rounded-xl px-4 py-4
 *   - Top row: large kcal in font-mono-stats 28px (primary focal point) + /target in ink-muted 16px
 *   - Three MacroProgressBar rows: protein, carbs, fat
 *   - Position: sticky top-0 so it stays visible while scrolling meal slots
 */
export function DailyMacroSummary({ logs, targets }: Props) {
  // Sum snapshotted macros from all logs
  const consumed = logs.reduce(
    (acc, row) => ({
      kcal: acc.kcal + row.log.kcal,
      proteinG: acc.proteinG + parseFloat(row.log.proteinG),
      carbsG: acc.carbsG + parseFloat(row.log.carbsG),
      fatG: acc.fatG + parseFloat(row.log.fatG),
    }),
    { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 },
  );

  const targetGrams = deriveTargetGrams(targets);

  return (
    <div className="glass-tile rounded-xl px-4 py-4 sticky top-0 z-10">
      {/* Primary focal point: calorie display */}
      <div className="flex items-baseline gap-1 mb-4">
        <span className="font-mono-stats text-[28px] leading-none text-[var(--ink)]">
          {Math.round(consumed.kcal)}
        </span>
        <span className="font-serif text-[16px] text-[var(--ink-muted)]">
          / {targets.targetKcal} kcal
        </span>
      </div>

      {/* Three macro rows */}
      <div className="flex flex-col gap-2.5">
        <MacroProgressBar
          label="Protein"
          consumed={consumed.proteinG}
          target={targetGrams.proteinG}
          intent="protein"
        />
        <MacroProgressBar
          label="Carbs"
          consumed={consumed.carbsG}
          target={targetGrams.carbsG}
          intent="carbs"
        />
        <MacroProgressBar
          label="Fat"
          consumed={consumed.fatG}
          target={targetGrams.fatG}
          intent="fat"
        />
      </div>
    </div>
  );
}
