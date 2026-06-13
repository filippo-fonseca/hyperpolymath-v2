"use client";

/**
 * NutritionTargetsForm — D-09 macro target settings form.
 *
 * UI-SPEC §"Target % Auto-Adjust":
 *   - When user edits one macro %, the other two scale proportionally to keep sum=100
 *   - Live gram equivalent preview under each macro % field: "= {g}g"
 *   - Validation: Zod sum=100 from server action + client-side guard
 *   - Error copy: "Percentages must add up to 100. Adjust the values to continue." (exact UI-SPEC)
 *   - Submit: "Save targets" glass-button
 *
 * Implements NUTR-TARGETS-UI-01.
 */

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { upsertNutritionTargetsAction } from "@/app/actions/nutrition";
import { deriveTargetGrams } from "@/lib/nutrition/macro-math";

type Targets = {
  targetKcal: number;
  proteinPct: number;
  carbsPct: number;
  fatPct: number;
};

interface Props {
  initialTargets: Targets;
}

type MacroKey = "p" | "c" | "f";

/**
 * Rebalance: when user edits one macro %, scale the other two proportionally
 * so that sum remains 100.
 */
function rebalance(
  changed: MacroKey,
  newVal: number,
  current: { p: number; c: number; f: number },
): { p: number; c: number; f: number } {
  const clamped = Math.max(0, Math.min(100, newVal));
  const remainingTotal = 100 - clamped;

  const other1: MacroKey = changed === "p" ? "c" : "p";
  const other2: MacroKey = changed === "f" ? "c" : "f";

  const otherSum = current[other1] + current[other2];

  let newOther1: number;
  let newOther2: number;

  if (otherSum <= 0) {
    // Split remaining evenly between the other two
    newOther1 = Math.round((remainingTotal / 2) * 10) / 10;
    newOther2 = Math.round((remainingTotal - newOther1) * 10) / 10;
  } else {
    const scale = remainingTotal / otherSum;
    newOther1 = Math.round(current[other1] * scale * 10) / 10;
    newOther2 = Math.round((remainingTotal - newOther1) * 10) / 10;
  }

  return {
    ...current,
    [changed]: clamped,
    [other1]: newOther1,
    [other2]: newOther2,
  };
}

export function NutritionTargetsForm({ initialTargets }: Props) {
  const [kcal, setKcal] = useState<string>(
    initialTargets.targetKcal.toString(),
  );
  const [macros, setMacros] = useState({
    p: initialTargets.proteinPct,
    c: initialTargets.carbsPct,
    f: initialTargets.fatPct,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Live gram preview (updates as % and kcal change)
  const kcalNum = parseInt(kcal) || 0;
  const gramPreview = useMemo(
    () =>
      deriveTargetGrams({
        targetKcal: kcalNum,
        proteinPct: macros.p,
        carbsPct: macros.c,
        fatPct: macros.f,
      }),
    [kcalNum, macros],
  );

  function handleMacroChange(key: MacroKey, raw: string) {
    const val = parseFloat(raw);
    if (isNaN(val)) return;
    setMacros((prev) => rebalance(key, val, prev));
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const kcalInt = parseInt(kcal);
    if (!kcalInt || kcalInt <= 0) {
      setError("Daily calorie target must be a positive integer.");
      return;
    }

    const sum = macros.p + macros.c + macros.f;
    if (Math.abs(sum - 100) >= 0.5) {
      setError(
        "Percentages must add up to 100. Adjust the values to continue.",
      );
      return;
    }

    setIsSubmitting(true);
    const result = await upsertNutritionTargetsAction({
      targetKcal: kcalInt,
      proteinPct: macros.p,
      carbsPct: macros.c,
      fatPct: macros.f,
    });
    setIsSubmitting(false);

    if (!result.success) {
      setError(
        result.error ??
          "Percentages must add up to 100. Adjust the values to continue.",
      );
      return;
    }

    toast("Targets saved.");
  }

  const labelClass =
    "block font-mono text-[10.5px] uppercase tracking-[0.14em] text-[var(--ink-muted)] mb-1";
  const fieldClass = "flex flex-col gap-1";
  const errorClass = "font-mono text-[10.5px] text-[var(--ink-coral)]";

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      {/* Root error */}
      {error && <p className={errorClass}>{error}</p>}

      {/* Daily calorie target */}
      <div className={fieldClass}>
        <label className={labelClass}>Daily calorie target (kcal)</label>
        <Input
          type="number"
          min="1"
          step="1"
          value={kcal}
          onChange={(e) => {
            setKcal(e.target.value);
            setError(null);
          }}
          className="max-w-xs focus-visible:ring-[var(--ring-doc)]"
          aria-label="Daily calorie target"
        />
      </div>

      {/* Macro split */}
      <div className="flex flex-col gap-4">
        <p className={labelClass}>Macro split (%)</p>

        {/* Protein */}
        <div className={fieldClass}>
          <label className={labelClass}>Protein</label>
          <div className="flex items-center gap-3">
            <Input
              type="number"
              min="0"
              max="100"
              step="0.1"
              value={macros.p}
              onChange={(e) => handleMacroChange("p", e.target.value)}
              className="max-w-[120px] focus-visible:ring-[var(--ring-doc)]"
              aria-label="Protein percentage"
            />
            <span className="font-mono text-[10.5px] text-[var(--ink-muted)]">
              = {gramPreview.proteinG}g
            </span>
          </div>
        </div>

        {/* Carbs */}
        <div className={fieldClass}>
          <label className={labelClass}>Carbs</label>
          <div className="flex items-center gap-3">
            <Input
              type="number"
              min="0"
              max="100"
              step="0.1"
              value={macros.c}
              onChange={(e) => handleMacroChange("c", e.target.value)}
              className="max-w-[120px] focus-visible:ring-[var(--ring-doc)]"
              aria-label="Carbohydrates percentage"
            />
            <span className="font-mono text-[10.5px] text-[var(--ink-muted)]">
              = {gramPreview.carbsG}g
            </span>
          </div>
        </div>

        {/* Fat */}
        <div className={fieldClass}>
          <label className={labelClass}>Fat</label>
          <div className="flex items-center gap-3">
            <Input
              type="number"
              min="0"
              max="100"
              step="0.1"
              value={macros.f}
              onChange={(e) => handleMacroChange("f", e.target.value)}
              className="max-w-[120px] focus-visible:ring-[var(--ring-doc)]"
              aria-label="Fat percentage"
            />
            <span className="font-mono text-[10.5px] text-[var(--ink-muted)]">
              = {gramPreview.fatG}g
            </span>
          </div>
        </div>

        {/* Sum indicator */}
        <p className="font-mono text-[10.5px] text-[var(--ink-muted)]">
          Sum: {Math.round((macros.p + macros.c + macros.f) * 10) / 10}%
        </p>
      </div>

      {/* Save button */}
      <button
        type="submit"
        disabled={isSubmitting}
        className="glass-button self-start rounded-md px-4 py-2 font-mono text-[10.5px] uppercase tracking-[0.14em] text-[var(--ink)] disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring-doc)]"
      >
        {isSubmitting ? "Saving…" : "Save targets"}
      </button>
    </form>
  );
}
