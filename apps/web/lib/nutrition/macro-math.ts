/**
 * macro-math.ts — pure functions for macro computation and target derivation.
 *
 * No imports other than types — these functions are completely pure and have
 * zero side effects. Safe to import in any context (server, client, tests).
 *
 * RESEARCH reference:
 *   base_amount_g = quantity × serving_option.grams_or_ml
 *   kcal          = round(food.kcal_per_100g × base_amount_g / 100)
 *   protein_g     = round1(food.protein_per_100g × base_amount_g / 100)
 *   target_protein_g = (target_kcal × protein_pct / 100) / 4
 *   target_fat_g     = (target_kcal × fat_pct    / 100) / 9
 */

export type MacroNumbers = {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG?: number | null;
};

export type FoodMacroSource = {
  kcalPer100g: string | number;
  proteinPer100g: string | number;
  carbsPer100g: string | number;
  fatPer100g: string | number;
  fiberPer100g?: string | number | null;
};

export type NutritionTargetPcts = {
  targetKcal: number;
  proteinPct: number;
  carbsPct: number;
  fatPct: number;
};

/** Coerce string | number to number */
const n = (v: string | number): number =>
  typeof v === "number" ? v : parseFloat(v);

/** Round to 1 decimal place (matches RESEARCH macro precision requirement) */
const round1 = (x: number): number => Math.round(x * 10) / 10;

/**
 * Compute the base amount (grams or ml) from quantity × serving size.
 *
 * @param quantity - number of servings selected
 * @param servingGramsOrMl - grams (or ml) per 1 serving unit
 * @returns base amount in g or ml
 */
export function resolveBaseAmount(
  quantity: number,
  servingGramsOrMl: number,
): number {
  return quantity * servingGramsOrMl;
}

/**
 * Compute macros for a given base amount from a food's per-100g values.
 *
 * kcal is rounded to integer (calorie counts are never fractional in UI).
 * All other macros are rounded to 1 decimal place.
 *
 * @param baseAmount - grams or ml (from resolveBaseAmount)
 * @param food - per-100g macro values (string or number accepted)
 */
export function computeMacros(
  baseAmount: number,
  food: FoodMacroSource,
): MacroNumbers {
  const factor = baseAmount / 100;
  return {
    kcal: Math.round(n(food.kcalPer100g) * factor),
    proteinG: round1(n(food.proteinPer100g) * factor),
    carbsG: round1(n(food.carbsPer100g) * factor),
    fatG: round1(n(food.fatPer100g) * factor),
    fiberG:
      food.fiberPer100g != null
        ? round1(n(food.fiberPer100g) * factor)
        : null,
  };
}

/**
 * Validate that the macro breakdown is internally consistent.
 *
 * Derives expected kcal from the macro split (protein × 4 + carbs × 4 + fat × 9)
 * and checks whether the divergence from the stated kcal is within ±15%.
 * This catches obviously incorrect OFF data (e.g. energy = 0 with macros present).
 *
 * Returns true = consistent; false = divergence detected (>15%).
 *
 * Per RESEARCH Pitfall 4: use 15% tolerance to account for rounding in OFF data.
 */
export function validateMacroConsistency(m: MacroNumbers): boolean {
  const derived = m.proteinG * 4 + m.carbsG * 4 + m.fatG * 9;
  if (m.kcal <= 0) return derived <= 5; // zero-kcal special case
  return Math.abs(derived - m.kcal) / m.kcal < 0.15;
}

/**
 * Derive daily macro targets in grams from percentage-based nutrition targets.
 *
 * @param t - target kcal + macro percentages (must sum to ~100)
 * @returns protein, carbs, fat in grams (rounded to nearest integer)
 */
export function deriveTargetGrams(t: NutritionTargetPcts): {
  proteinG: number;
  carbsG: number;
  fatG: number;
} {
  return {
    proteinG: Math.round((t.targetKcal * (t.proteinPct / 100)) / 4),
    carbsG: Math.round((t.targetKcal * (t.carbsPct / 100)) / 4),
    fatG: Math.round((t.targetKcal * (t.fatPct / 100)) / 9),
  };
}
