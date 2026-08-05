"use client";

import { deriveTargetGrams } from "@/lib/nutrition/macro-math";
import { MacroProgressBar } from "./MacroProgressBar";
import type { NutritionTargetPcts } from "@/lib/nutrition/macro-math";
import { cn } from "@/lib/utils";

/**
 * WidgetCard-v2 plate: `--sd-box` fill raised off `--sd-app`, 14px radius,
 * hairline border, and (dark only) a white inset top hairline that catches
 * the light. No glass, no blur, no glow.
 */
const PLATE =
  "rounded-[14px] border border-[var(--sd-line)] bg-[var(--sd-box)] " +
  "dark:border-white/[0.06] dark:[box-shadow:rgba(255,255,255,0.09)_0_1px_0_inset]";

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
 * DailyMacroSummary — the day's macro stat strip, an sd plate that sticks below
 * the title row while the meal slots scroll.
 *
 *   - Focal kcal readout: mono "Calories" eyebrow + font-black tabular-nums
 *     value / target, with a remaining/over counter (amber when over)
 *   - Three MacroProgressBar rows: protein, carbs, fat — hatched cyan tracks
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
  const kcal = Math.round(consumed.kcal);
  const remaining = targets.targetKcal - kcal;
  const over = remaining < 0;

  return (
    <div className={cn("sticky top-2 z-10 px-5 py-4", PLATE)}>
      {/* Focal: calorie readout + remaining/over counter */}
      <div className="mb-4 flex items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-micro text-[var(--sd-ink-faint)]">
            Calories
          </span>
          <div className="flex items-baseline gap-1.5">
            <span className="text-display font-black leading-none tabular-nums text-[var(--sd-ink)]">
              {kcal}
            </span>
            <span className="text-meta tabular-nums text-[var(--sd-ink-dull)]">
              / {targets.targetKcal} kcal
            </span>
          </div>
        </div>
        <span
          className="font-mono text-micro tabular-nums"
          style={{ color: over ? "var(--ink-amber)" : "var(--sd-ink-faint)" }}
        >
          {over ? `${Math.abs(remaining)} over` : `${remaining} left`}
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
